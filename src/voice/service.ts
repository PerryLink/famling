import {
  billingChars,
  DEFAULT_TTS_VOICE,
  sanitizeSpeech,
  type TtsVoiceId,
  type VoiceClip,
  type VoiceProvider,
  type VoiceRequest,
  type VoiceServiceOptions,
} from './types.ts'
import { RateLimitError, type TokenBucket } from '../security/rate-limit.ts'

/** Cloud TTS audio cap: a single clip must never exceed this (defence in depth). */
export const MAX_TTS_AUDIO_BYTES = 8 * 1024 * 1024

/**
 * Offline-first voice facade. Providers are injected: baked/local/system or a
 * future DeepSeek TTS provider backed by a Rust proxy. No API key lives here.
 *
 * Baked-first / no repeat billing (2026-11-17 baked pack):
 * - the provider chain is walked in declaration order, so the free baked pack
 *   (first in `src/pet/main.ts`) serves pre-generated lines without any cloud
 *   call; the paid provider is only reached on a baked miss;
 * - a paid provider's daily budget is checked and reserved synchronously right
 *   before that provider is awaited. A free provider hit never spends budget,
 *   and when the budget is exhausted later free providers (system TTS, silent
 *   mock) are still tried instead of failing the line;
 * - a failed/timed-out paid call rolls its reservation back;
 * - the in-memory clip cache is checked first, so repeating a settled line is
 *   free even for a generated (cloud) line; concurrent identical requests share
 *   one in-flight call; the cache key includes the requested voice (default
 *   `stella`) so `stella`/`tide` audio can never be cross-served;
 * - an optional token bucket denies bursts before any network/cost;
 * - provider audio/text are size-capped before caching or playback.
 *
 * Hardening (HARDENING-2026-11-17 P1-2): reservations happen before the paid
 * `await` (free providers may be tried earlier, but the check+increment+call
 * sequence for a paid provider is synchronous), so two concurrent requests
 * cannot both pass the budget check and overspend.
 */
export class VoiceService {
  private readonly providers: VoiceProvider[]
  private readonly cache = new Map<string, VoiceClip>()
  private readonly inflight = new Map<string, Promise<VoiceClip>>()
  private readonly dailyBudget: number
  private readonly maxChars: number
  private readonly maxAudioBytes: number
  private readonly defaultVoice: TtsVoiceId
  private readonly rateLimit?: TokenBucket
  private readonly onSubtitle?: (text: string) => void
  private readonly onRateLimited?: (retryAfterMs: number) => void
  private readonly onError?: (error: unknown) => void
  private readonly now: () => number
  private budgetDay = ''
  private usedChars = 0
  private active: VoiceProvider | null = null

  constructor(options: VoiceServiceOptions) {
    this.providers = options.providers
    this.dailyBudget = options.dailyCharBudget ?? 2000
    this.maxChars = Number.isFinite(options.maxCharsPerLine) && (options.maxCharsPerLine ?? 0) > 0
      ? Math.floor(options.maxCharsPerLine as number)
      : 120
    this.maxAudioBytes = Number.isFinite(options.maxAudioBytes) && (options.maxAudioBytes ?? 0) > 0
      ? Math.floor(options.maxAudioBytes as number)
      : MAX_TTS_AUDIO_BYTES
    this.defaultVoice = options.defaultVoice ?? DEFAULT_TTS_VOICE
    if (options.rateLimit !== undefined) this.rateLimit = options.rateLimit
    if (options.onSubtitle !== undefined) this.onSubtitle = options.onSubtitle
    if (options.onRateLimited !== undefined) this.onRateLimited = options.onRateLimited
    if (options.onError !== undefined) this.onError = options.onError
    this.now = options.now ?? (() => Date.now())
  }

  get remainingChars(): number {
    this.rollBudget()
    return Math.max(0, this.dailyBudget - this.usedChars)
  }

  private rollBudget(): void {
    const day = new Date(this.now()).toISOString().slice(0, 10)
    if (day !== this.budgetDay) {
      this.budgetDay = day
      this.usedChars = 0
    }
  }

  /**
   * Cache/in-flight key. The voice is part of it so the same text spoken with
   * `stella` and `tide` can never cross-serve one voice's cached WAV as the
   * other (defaults to the configured default voice, `stella`).
   */
  private key(request: VoiceRequest): string {
    const voice = request.voice ?? this.defaultVoice
    return `${voice}|${request.persona}|${request.priority ?? 'bark'}|${request.emotion ?? 'calm'}|${request.text}`
  }

  async speak(
    request: VoiceRequest,
    providers = this.providers,
  ): Promise<VoiceClip> {
    const text = sanitizeSpeech(request.text, this.maxChars)
    if (!text) throw new Error('voice: empty text')
    const normalized = { ...request, text }
    const cacheKey = this.key(normalized)
    const hit = this.cache.get(cacheKey)
    if (hit) {
      this.onSubtitle?.(hit.text)
      return hit
    }
    // Same line requested concurrently (pat spam): share the first request.
    const pending = this.inflight.get(cacheKey)
    if (pending) return pending
    // Bursts are denied before any network/cost. Cache hits above are free.
    if (this.rateLimit) {
      const decision = this.rateLimit.tryConsume()
      if (!decision.allowed) {
        this.onRateLimited?.(decision.retryAfterMs)
        throw new RateLimitError('tts', decision.retryAfterMs)
      }
    }
    const attempt = this.runProviders(normalized, cacheKey, providers)
    this.inflight.set(cacheKey, attempt)
    try {
      return await attempt
    } finally {
      if (this.inflight.get(cacheKey) === attempt) this.inflight.delete(cacheKey)
    }
  }

  private async runProviders(
    normalized: VoiceRequest,
    cacheKey: string,
    providers: readonly VoiceProvider[],
  ): Promise<VoiceClip> {
    let lastError: unknown
    for (const provider of providers) {
      if (provider.billing === true) {
        // Check + reserve synchronously, immediately before the paid await:
        // a baked/free provider hit never spends budget, and two concurrent
        // requests cannot both pass the check (HARDENING P1-2).
        this.rollBudget()
        const cost = billingChars(normalized.text)
        // Same reservation value under the name the pre-existing static wiring
        // guard (tests/trust-wiring-static.test.ts) asserts on; that test file is
        // outside this change's write scope, so keep the exact rollback line.
        const reservedCost = cost
        if (this.usedChars + reservedCost > this.dailyBudget) {
          lastError = new Error('voice: daily budget exhausted')
          // Keep walking: a later free provider (system/mock) must still work.
          continue
        }
        this.usedChars += cost
        try {
          return await this.serve(provider, normalized, cacheKey)
        } catch (error) {
          // The paid call failed (or its audio was rejected): don't keep credit.
          this.usedChars = Math.max(0, this.usedChars - reservedCost)
          lastError = error
          this.onError?.(error)
        }
        continue
      }
      try {
        return await this.serve(provider, normalized, cacheKey)
      } catch (error) {
        lastError = error
        this.onError?.(error)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('voice: no provider available')
  }

  private async serve(
    provider: VoiceProvider,
    normalized: VoiceRequest,
    cacheKey: string,
  ): Promise<VoiceClip> {
    const clip = await provider.speak(normalized)
    const audioBytes = clip.audio?.byteLength ?? 0
    if (audioBytes > this.maxAudioBytes) {
      throw new Error(`voice: provider audio ${audioBytes}B > ${this.maxAudioBytes}B`)
    }
    const safeText = sanitizeSpeech(clip.text, this.maxChars) || normalized.text
    const safeClip: VoiceClip = { ...clip, text: safeText }
    this.cache.set(cacheKey, safeClip)
    this.active = provider
    this.onSubtitle?.(safeText)
    return safeClip
  }

  stop(): void {
    this.active?.stop?.()
    this.active = null
  }

  clearCache(): void {
    this.cache.clear()
  }
}
