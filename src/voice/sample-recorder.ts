/**
 * Local-only voice sample recorder (≤15 s) for the "own voice / future clone"
 * experiment on `setup.html` (2026-11-17).
 *
 * Boundaries that are contracts, not features:
 * - the microphone is requested ONLY after a complete per-use acknowledgement
 *   (`isVoiceSampleAcknowledged`); an incomplete/declined acknowledgement makes
 *   `start()` return false WITHOUT calling `getUserMedia` (no permission prompt,
 *   no stream, no recording);
 * - the recording is capped at 15 s and auto-stopped; every exit path stops the
 *   microphone tracks and clears the timer;
 * - samples stay in memory. This module has no fetch/XHR/IndexedDB/ASR path:
 *   nothing is uploaded, transcribed or "cloned"; the UI offers playback,
 *   download (user-initiated local save) and clear;
 * - there is exactly one recording at a time (double-click safe) and a stale
 *   async `getUserMedia` result is stopped instead of leaking a microphone.
 *
 * DOM types are minimal and dependencies are injected (same pattern as
 * `pet/recording.ts`), so the lifecycle is unit-tested in Node without a browser.
 */

/** Hard cap for one sample: short by design (official clone API does not exist). */
export const VOICE_SAMPLE_MAX_MS = 15_000

export type VoiceSampleState = 'idle' | 'requesting' | 'recording' | 'stopped'

export interface VoiceSampleAcknowledgement {
  /** The sample is local-only (memory + explicit download), not uploaded. */
  readonly localOnly: boolean
  /** The voice is the user's own and they consent to recording it. */
  readonly ownVoice: boolean
  /** The user will not record/clone/imitate someone else without consent. */
  readonly noCloningOthers: boolean
  /** The user understands TTS/voice is AI-synthesised and not a real person. */
  readonly aiDisclosed: boolean
}

/** Every acknowledgement is mandatory; a partial/absent object means "no". */
export function isVoiceSampleAcknowledged(
  acknowledgement: Partial<VoiceSampleAcknowledgement> | null | undefined,
): boolean {
  return (
    !!acknowledgement &&
    acknowledgement.localOnly === true &&
    acknowledgement.ownVoice === true &&
    acknowledgement.noCloningOthers === true &&
    acknowledgement.aiDisclosed === true
  )
}

export interface VoiceSamplePrivacyPoint {
  readonly id: string
  readonly text: string
}

/**
 * Copy rendered before the mic is requested. Keep wording truthful: local only,
 * consent required, no other people's voices, no cloning, AI disclosure.
 */
export const VOICE_SAMPLE_PRIVACY_POINTS: readonly VoiceSamplePrivacyPoint[] = [
  {
    id: 'purpose',
    text: '用途：仅用于本机音色试听/实验，不用于训练、不用于克隆，也不自动上传。',
  },
  {
    id: 'storage',
    text: '保存位置：录音只留在当前页面内存；只有你主动点“下载”才会保存到你自己的设备。',
  },
  {
    id: 'consent',
    text: '授权：只录你自己的声音，必须本人同意；不得录制、克隆、模仿或冒充他人声音。',
  },
  {
    id: 'ai',
    text: 'AI 声明：AI 合成语音不是真人；当前没有音色克隆功能，不会声称已经克隆。',
  },
  {
    id: 'gates',
    text: '同意边界：本页不会写入 TOS 同意记录；播放语音仍要在桌宠内单独确认 TTS 声明。',
  },
]

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
  addEventListener(type: string, listener: (event: { data?: Blob } | undefined) => void): void
}

export interface SampleTimerApi {
  setTimeout(handler: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface VoiceSampleRecorderDeps {
  getUserMedia: () => Promise<MediaStreamLike>
  createRecorder: (stream: MediaStreamLike) => RecorderLike
  onState?: (state: VoiceSampleState) => void
  /** Failures are reported (never silently swallowed); the UI also shows copy. */
  onError?: (error: unknown) => void
  timers?: SampleTimerApi
  maxMs?: number
  now?: () => number
  /** Id generator injected for deterministic tests; defaults to a random id. */
  createId?: () => string
}

export interface VoiceSample {
  readonly id: string
  readonly blob: Blob
  readonly mimeType: string
  readonly durationMs: number
  readonly createdAtMs: number
}

const defaultTimers: SampleTimerApi = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    /* fall through to the bounded timestamp id */
  }
  return `sample-${Date.now()}`
}

/**
 * One microphone, one sample at a time, with an explicit acknowledgement gate
 * before the permission prompt. `start()` never throws; `stop()`/`clear()` are
 * idempotent and always release the stream.
 */
export class VoiceSampleRecorder {
  private readonly deps: VoiceSampleRecorderDeps
  private readonly timers: SampleTimerApi
  private readonly maxMs: number
  private readonly now: () => number
  private readonly createId: () => string
  private phase: VoiceSampleState = 'idle'
  private stream: MediaStreamLike | null = null
  private recorder: RecorderLike | null = null
  private chunks: Blob[] = []
  private timer: unknown = undefined
  private sample: VoiceSample | null = null
  private startedAtMs = 0
  private stopRequested = false
  private discardNext = false
  private finishing = false
  /** Invalidates listeners from previous recordings (clear/re-record safety). */
  private session = 0
  private finishWaiters: Array<(sample: VoiceSample | null) => void> = []

  constructor(deps: VoiceSampleRecorderDeps) {
    this.deps = deps
    this.timers = deps.timers ?? defaultTimers
    this.maxMs = Number.isFinite(deps.maxMs)
      ? Math.max(1, Math.min(VOICE_SAMPLE_MAX_MS, Math.floor(deps.maxMs as number)))
      : VOICE_SAMPLE_MAX_MS
    this.now = deps.now ?? (() => Date.now())
    this.createId = deps.createId ?? randomId
  }

  get state(): VoiceSampleState {
    return this.phase
  }

  /** True while the permission prompt/recording is in flight. */
  get active(): boolean {
    return this.phase === 'requesting' || this.phase === 'recording'
  }

  /** Last completed sample (null before the first stop / after clear). */
  get current(): VoiceSample | null {
    return this.sample
  }

  private setState(state: VoiceSampleState): void {
    this.phase = state
    this.deps.onState?.(state)
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      this.timers.clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  private stopStreamOf(stream: MediaStreamLike): void {
    try {
      for (const track of stream.getTracks()) {
        try {
          track.stop()
        } catch {
          // A broken track must not prevent the others from stopping.
        }
      }
    } catch {
      // Invalid MediaStream: nothing else can be stopped.
    }
  }

  private stopStream(): void {
    const stream = this.stream
    this.stream = null
    if (stream) this.stopStreamOf(stream)
  }

  private settleWaiters(sample: VoiceSample | null): void {
    const waiters = this.finishWaiters.splice(0)
    for (const resolve of waiters) resolve(sample)
  }

  /**
   * Request the microphone and start recording. Returns false (and makes NO
   * `getUserMedia` call) when the acknowledgement is incomplete, another
   * recording is in flight, or the environment fails.
   */
  async start(acknowledgement: VoiceSampleAcknowledgement): Promise<boolean> {
    if (!isVoiceSampleAcknowledged(acknowledgement)) return false
    if (this.phase === 'requesting' || this.phase === 'recording') return false
    this.session += 1
    const session = this.session
    this.stopRequested = false
    this.discardNext = false
    this.finishing = false
    this.chunks = []
    this.sample = null
    this.setState('requesting')
    let stream: MediaStreamLike
    try {
      stream = await this.deps.getUserMedia()
    } catch (error) {
      if (session === this.session) this.setState('idle')
      this.deps.onError?.(error)
      return false
    }
    // Closed/declined while the permission prompt was open: stop the late stream.
    if (session !== this.session || this.stopRequested) {
      this.stopStreamOf(stream)
      if (session === this.session) this.setState('idle')
      return false
    }
    this.stream = stream
    let recorder: RecorderLike
    try {
      recorder = this.deps.createRecorder(stream)
    } catch (error) {
      this.stopStream()
      this.setState('idle')
      this.deps.onError?.(error)
      return false
    }
    this.recorder = recorder
    recorder.addEventListener('dataavailable', (event) => {
      if (session !== this.session || this.discardNext) return
      const data = event?.data
      if (data && data.size > 0) this.chunks.push(data)
    })
    recorder.addEventListener('stop', () => {
      void this.finish(session)
    })
    try {
      recorder.start()
    } catch (error) {
      this.recorder = null
      this.stopStream()
      this.setState('idle')
      this.deps.onError?.(error)
      return false
    }
    this.startedAtMs = this.now()
    this.setState('recording')
    this.clearTimer()
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined
      void this.stop()
    }, this.maxMs)
    return true
  }

  /**
   * Stop manually (or via the 15 s cap). Resolves the completed local sample, or
   * null when nothing usable was captured. Idempotent.
   */
  async stop(): Promise<VoiceSample | null> {
    if (this.phase === 'idle') return this.sample
    if (this.phase === 'stopped') return this.sample
    this.stopRequested = true
    if (this.phase === 'requesting') return null
    this.clearTimer()
    const session = this.session
    const waitForFinish = new Promise<VoiceSample | null>((resolve) => {
      this.finishWaiters.push(resolve)
    })
    const recorder = this.recorder
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch (error) {
        this.deps.onError?.(error)
        void this.finish(session)
      }
    } else {
      void this.finish(session)
    }
    return waitForFinish
  }

  private async finish(session: number): Promise<void> {
    if (session !== this.session || this.finishing) return
    if (this.phase !== 'recording') return
    this.finishing = true
    this.clearTimer()
    const recorder = this.recorder
    this.recorder = null
    this.stopStream()
    const chunks = this.chunks
    this.chunks = []
    let sample: VoiceSample | null = null
    try {
      if (!this.discardNext && chunks.length > 0) {
        const mimeType = recorder?.mimeType || 'audio/webm'
        const blob = new Blob(chunks, { type: mimeType })
        if (blob.size > 0) {
          const createdAtMs = this.now()
          sample = {
            id: this.createId(),
            blob,
            mimeType,
            durationMs: Math.max(0, createdAtMs - this.startedAtMs),
            createdAtMs,
          }
        }
      }
    } catch (error) {
      // A malformed chunk/id must resolve stop() as "no sample", never reject.
      this.deps.onError?.(error)
      sample = null
    }
    this.sample = sample
    this.discardNext = false
    this.finishing = false
    this.setState('stopped')
    this.settleWaiters(sample)
  }

  /**
   * Drop the sample and release everything: stops the mic/timer, invalidates
   * in-flight listeners and resolves pending `stop()` waiters with null.
   * Returns whether a completed sample was discarded.
   */
  clear(): boolean {
    const hadSample = this.sample !== null
    this.session += 1
    this.stopRequested = true
    this.discardNext = true
    this.clearTimer()
    const recorder = this.recorder
    this.recorder = null
    this.stopStream()
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch (error) {
        this.deps.onError?.(error)
      }
    }
    this.chunks = []
    this.sample = null
    this.finishing = false
    this.settleWaiters(null)
    if (this.phase !== 'idle') this.setState('idle')
    return hadSample
  }
}
