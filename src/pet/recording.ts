/**
 * Hold-to-talk recording lifecycle for the pet (hardening P0-1).
 *
 * The old `main.ts` implementation kept `recorder`/`micStream` in single module
 * variables with no in-flight guard, so two quick `pointerdown`s created a
 * second `getUserMedia`/`MediaRecorder`; the first mic track then stayed open
 * (privacy leak) and `finishTalk` leaked an `AudioContext` when decoding failed.
 *
 * This controller owns the whole lifecycle with explicit guards:
 * - `start()` is a no-op while starting/listening/finishing (one mic only);
 * - `stop()` is idempotent and safe while `getUserMedia` is still pending;
 * - every exit path (pointerup/cancel, timeout, decode/transcribe error, size
 *   limit) stops the mic tracks, clears the timer and resets the UI state;
 * - the decode `AudioContext` is always closed in `finally`, with a bounded
 *   decode timeout so a hung decode cannot keep the context alive forever.
 *
 * DOM types are intentionally minimal so the lifecycle is testable in Node with
 * injected fakes; `main.ts` adapts real browser objects.
 */
import { encodeWav } from '../voice/wav.ts'

export type TalkState = 'idle' | 'starting' | 'listening' | 'finishing'

export interface MediaTrackLike {
  stop(): void
}

export interface MediaStreamLike {
  getTracks(): MediaTrackLike[]
}

export interface RecorderLike {
  readonly state: string
  readonly mimeType: string
  start(): void
  stop(): void
  addEventListener(type: string, listener: (event: any) => void): void
}

export interface AudioBufferLike {
  sampleRate: number
  getChannelData(channel: number): Float32Array
}

export interface AudioContextLike {
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>
  close(): Promise<void>
}

export interface TalkTimerApi {
  setTimeout(handler: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface TalkRecorderDeps {
  getUserMedia: () => Promise<MediaStreamLike>
  createRecorder: (stream: MediaStreamLike) => RecorderLike
  createAudioContext: () => AudioContextLike
  transcribe: (wav: ArrayBuffer) => Promise<string>
  onState?: (state: TalkState) => void
  onBubble?: (text: string) => void
  /** ASR text callback. Callers must review it before model/TTS use. */
  onTranscript?: (text: string) => void | Promise<void>
  /** Logged (never silently swallowed) recorder/decode/transcribe failures. */
  onError?: (error: unknown) => void
  /** Injected for tests; defaults to the real `encodeWav`. */
  encodeWav?: (channels: Float32Array[], sampleRate: number) => ArrayBuffer
  timers?: TalkTimerApi
  maxTalkMs?: number
  maxWavBytes?: number
  /** Bounded decode wait; a decode that never resolves is closed/failed. */
  decodeTimeoutMs?: number
  /** getUserMedia/permission prompt may hang; bounded so talk cannot lock up. */
  startTimeoutMs?: number
}

export const MAX_TALK_MS = 60_000
export const MAX_WAV_BYTES = 8 * 1024 * 1024
const DEFAULT_DECODE_TIMEOUT_MS = 8_000
const DEFAULT_START_TIMEOUT_MS = 10_000

const defaultTimers: TalkTimerApi = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

function transcribeFailureCopy(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  if (/no-key|not configured|api key/i.test(text)) return '语音识别未配置（需要 API key）；可以先摸我。'
  return '没听清，或者语音服务不可用。'
}

function withDecodeTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('audio-decode-timeout'))
    }, timeoutMs)
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/**
 * One microphone at a time, one cleanup path. Call `start()` on pointerdown and
 * `stop()` on pointerup/pointercancel/release; timeouts are internal.
 */
export class TalkRecorder {
  private readonly deps: TalkRecorderDeps
  private readonly timers: TalkTimerApi
  private readonly maxTalkMs: number
  private readonly maxWavBytes: number
  private readonly decodeTimeoutMs: number
  private readonly startTimeoutMs: number
  private phase: TalkState = 'idle'
  private stream: MediaStreamLike | null = null
  private recorder: RecorderLike | null = null
  private chunks: Blob[] = []
  private timer: unknown = undefined
  private stopRequested = false
  private finishStarted = false

  constructor(deps: TalkRecorderDeps) {
    this.deps = deps
    this.timers = deps.timers ?? defaultTimers
    this.maxTalkMs = Number.isFinite(deps.maxTalkMs) ? Math.max(1, Math.floor(deps.maxTalkMs as number)) : MAX_TALK_MS
    this.maxWavBytes = Number.isFinite(deps.maxWavBytes) ? Math.max(1, Math.floor(deps.maxWavBytes as number)) : MAX_WAV_BYTES
    this.decodeTimeoutMs = Number.isFinite(deps.decodeTimeoutMs)
      ? Math.max(1, Math.floor(deps.decodeTimeoutMs as number))
      : DEFAULT_DECODE_TIMEOUT_MS
    this.startTimeoutMs = Number.isFinite(deps.startTimeoutMs)
      ? Math.max(1, Math.floor(deps.startTimeoutMs as number))
      : DEFAULT_START_TIMEOUT_MS
  }

  get state(): TalkState {
    return this.phase
  }

  /** True while a start/stop/finish is in flight; used by the UI guard too. */
  get active(): boolean {
    return this.phase !== 'idle'
  }

  private setState(state: TalkState): void {
    this.phase = state
    this.deps.onState?.(state)
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  private stopStream(): void {
    const stream = this.stream
    this.stream = null
    if (!stream) return
    try {
      for (const track of stream.getTracks()) {
        try {
          track.stop()
        } catch {
          // A broken track must not prevent the other tracks from stopping.
        }
      }
    } catch {
      // Invalid MediaStream: nothing else can be stopped.
    }
  }

  /**
   * Wait for getUserMedia with a bounded timeout. A late stream (permission
   * answered after we gave up) is stopped instead of leaking a microphone.
   */
  private requestStream(): Promise<MediaStreamLike> {
    const started = this.deps.getUserMedia()
    return new Promise<MediaStreamLike>((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        this.timers.clearTimeout(timer)
        fn()
      }
      const timer = this.timers.setTimeout(() => {
        finish(() => {
          started.then(
            (stream) => {
              this.stopStreamOf(stream)
            },
            () => {
              // Rejection after giving up: nothing to clean up.
            },
          )
          reject(new Error('getUserMedia-timeout'))
        })
      }, this.startTimeoutMs)
      started.then(
        (stream) => {
          finish(() => resolve(stream))
        },
        (error) => {
          finish(() => reject(error))
        },
      )
    })
  }

  private stopStreamOf(stream: MediaStreamLike): void {
    try {
      for (const track of stream.getTracks()) {
        try {
          track.stop()
        } catch {
          // Keep stopping the remaining tracks.
        }
      }
    } catch {
      // Invalid MediaStream.
    }
  }

  /**
   * Begin recording. Returns false when another recording is already active or
   * when the microphone/recorder is unavailable; never throws.
   */
  async start(): Promise<boolean> {
    if (this.phase !== 'idle') return false
    this.stopRequested = false
    this.finishStarted = false
    this.chunks = []
    this.setState('starting')
    try {
      const stream = await this.requestStream()
      this.stream = stream
      // pointerup/cancel may arrive while getUserMedia is still pending.
      if (this.stopRequested) {
        this.stopStream()
        this.setState('idle')
        return false
      }
      const recorder = this.deps.createRecorder(stream)
      this.recorder = recorder
      recorder.addEventListener('dataavailable', (event: { data?: Blob } | undefined) => {
        const data = event?.data
        if (data && data.size > 0) this.chunks.push(data)
      })
      recorder.addEventListener('stop', () => {
        void this.finish()
      })
      recorder.start()
      this.setState('listening')
      this.deps.onBubble?.('在听……（最多 60 秒）')
      this.clearTimer()
      this.timer = this.timers.setTimeout(() => {
        this.timer = undefined
        void this.stop()
      }, this.maxTalkMs)
      return true
    } catch (error) {
      this.cleanup()
      this.setState('idle')
      const timedOut = error instanceof Error && error.message === 'getUserMedia-timeout'
      this.deps.onBubble?.(timedOut ? '麦克风没有响应，稍后再试。' : '麦克风不可用；可以先摸我。')
      this.deps.onError?.(error)
      return false
    }
  }

  /** Release path (pointerup/pointercancel/release). Idempotent, never throws. */
  async stop(): Promise<void> {
    this.stopRequested = true
    if (this.phase === 'idle' || this.phase === 'finishing') return
    // Still waiting for getUserMedia: start() will clean up and reset.
    if (this.phase === 'starting') return
    const recorder = this.recorder
    if (recorder && recorder.state === 'recording') {
      try {
        recorder.stop()
        return
      } catch (error) {
        this.deps.onError?.(error)
      }
    }
    await this.finish()
  }

  private cleanup(): void {
    this.clearTimer()
    this.stopStream()
    const recorder = this.recorder
    this.recorder = null
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // Ignore: cleanup must always continue.
      }
    }
  }

  private async finish(): Promise<void> {
    if (this.finishStarted) return
    this.finishStarted = true
    this.setState('finishing')
    this.clearTimer()
    const recorder = this.recorder
    const chunks = this.chunks
    this.chunks = []
    let failed = false
    try {
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          // The stop event may already be in flight.
        }
      }
      this.stopStream()
      const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
      if (blob.size === 0) return
      const context = this.deps.createAudioContext()
      let audio: AudioBufferLike
      try {
        audio = await withDecodeTimeout(context.decodeAudioData(await blob.arrayBuffer()), this.decodeTimeoutMs)
      } finally {
        try {
          await context.close()
        } catch {
          // Closing a failed/suspended context is best effort; never mask decode.
        }
      }
      const wav = (this.deps.encodeWav ?? encodeWav)([audio.getChannelData(0)], audio.sampleRate)
      if (wav.byteLength > this.maxWavBytes) {
        this.deps.onBubble?.('这段太长了，最多约 60 秒。')
        return
      }
      let text = ''
      try {
        text = await this.deps.transcribe(wav)
      } catch (error) {
        failed = true
        this.deps.onBubble?.(transcribeFailureCopy(error))
        this.deps.onError?.(error)
        return
      }
      if (!text) {
        this.deps.onBubble?.('我没听清。')
        return
      }
      // Never display/log the raw ASR text here: the host must review it
      // (reviewUserInput) before showing, matching or forwarding it.
      await this.deps.onTranscript?.(text)
    } catch (error) {
      failed = true
      this.deps.onBubble?.('没听清，或者语音服务不可用。')
      this.deps.onError?.(error)
    } finally {
      this.stopStream()
      this.clearTimer()
      this.recorder = null
      this.finishStarted = false
      this.setState('idle')
      if (!failed) this.stopRequested = false
    }
  }
}
