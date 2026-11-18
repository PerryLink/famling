import type { TokenBucket } from '../pet/security/rate-limit.ts'

export type VoiceEmotion = 'calm' | 'happy' | 'sad' | 'angry' | 'sleepy'
export type VoicePriority = 'bark' | 'story' | 'deep'

/**
 * DeepSeek cloud TTS voice ids this project understands; `stella` is the
 * default and `tide` is an optional preset. Audio is only produced when a host
 * TTS transport is configured, so no pre-generated WAV ships in this repo.
 */
export type TtsVoiceId = 'stella' | 'tide'

/** Default voice keeps the pre-tide experience unchanged. */
export const DEFAULT_TTS_VOICE: TtsVoiceId = 'stella'

export interface VoiceRequest {
  text: string
  persona: string
  emotion?: VoiceEmotion
  priority?: VoicePriority
  /**
   * Optional voice override (default `stella`). Providers ignore it when they
   * cannot honour it (system/mock providers do); a cloud provider forwards it.
   */
  voice?: TtsVoiceId
}

export interface VoiceClip {
  id: string
  text: string
  provider: string
  durationMs: number
  /** Optional amplitude envelope for a 2-3 mouth-shape lip sync. */
  envelope?: number[]
  audio?: ArrayBuffer
}

export interface VoiceProvider {
  readonly id: string
  /** Paid/cloud providers count against the daily character budget. */
  readonly billing?: boolean
  speak(request: VoiceRequest): Promise<VoiceClip>
  stop?(): void
}

export interface VoiceServiceOptions {
  providers: VoiceProvider[]
  /**
   * Voice assumed when `VoiceRequest.voice` is omitted (default `stella`).
   * Keep it equal to the baked provider's configured voice: the service cache
   * key is voice-scoped, and a mismatch could serve one voice's cached audio
   * for the other.
   */
  defaultVoice?: TtsVoiceId
  /** Billing characters per day. Chinese chars count double, as DeepSeek TTS. */
  dailyCharBudget?: number
  /** Hard cap for one spoken line (code points); clamp below the Rust 500 limit. */
  maxCharsPerLine?: number
  /** Reject provider audio above this many bytes (cloud TTS size guard). */
  maxAudioBytes?: number
  /** Optional token bucket (see `pet/security/rate-limit.ts`) checked before TTS. */
  rateLimit?: TokenBucket
  onSubtitle?: (text: string) => void
  /** Called when the TTS bucket denies a request; carries a bounded wait hint. */
  onRateLimited?: (retryAfterMs: number) => void
  /** Provider failures are reported here instead of being swallowed. */
  onError?: (error: unknown) => void
  now?: () => number
}

export function billingChars(text: string): number {
  let n = 0
  for (const ch of text) n += /[\u3400-\u9fff\uf900-\ufaff]/.test(ch) ? 2 : 1
  return n
}

/**
 * Strip markdown/URL noise and truncate to `maxChars` code points (never
 * splitting a surrogate pair: the cloud proxy rejects/limits by characters).
 */
export function sanitizeSpeech(text: string, maxChars = 120): string {
  const stripped = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/[^\s)）】》]+/gi, ' ')
    .replace(/[*_#>`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const max = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 120
  if (!max) return ''
  const points = [...stripped]
  return points.length <= max ? stripped : points.slice(0, max).join('')
}

