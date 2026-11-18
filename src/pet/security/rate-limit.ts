/**
 * Pure token-bucket rate limiter for user-triggered side effects that cost
 * money or touch the network/OS: cloud TTS (repeat pat clicks currently start
 * one request each), DeepSeek share import, retries and manual saves.
 *
 * No DOM, no timers: the clock is injected, so tests and the host control time
 * deterministically. The host keeps one bucket per action and calls
 * `tryConsume()` before starting the effect; a denied call gets a bounded
 * `retryAfterMs` it can show as "太频繁了，先歇一下".
 */

export interface TokenBucketOptions {
  /** Maximum burst (tokens). Must be a positive finite number. */
  capacity: number
  /** Tokens refilled per second. Must be a non-negative finite number. */
  refillPerSecond: number
  /** Injected clock (ms). Defaults to Date.now. */
  now?: () => number
  /** Start with fewer tokens than capacity (default: full bucket). */
  initialTokens?: number
}

export interface RateLimitDecision {
  allowed: boolean
  /** Tokens left after this attempt (never negative). */
  remaining: number
  capacity: number
  /** When the same request could succeed, bounded; 0 when allowed. */
  retryAfterMs: number
}

/** Thrown by `applyRateLimit` / `consumeOrThrow`; carries the wait time. */
export class RateLimitError extends Error {
  readonly name = 'RateLimitError'
  constructor(
    readonly limitName: string,
    readonly retryAfterMs: number,
  ) {
    super(`${limitName}: rate limited; retry after ${retryAfterMs}ms`)
  }
}

const MAX_RETRY_AFTER_MS = 24 * 60 * 60 * 1000

function assertCapacity(capacity: number): void {
  if (!Number.isFinite(capacity) || capacity <= 0) throw new RangeError('capacity must be a positive finite number')
}

function assertRefill(rate: number): void {
  if (!Number.isFinite(rate) || rate < 0) throw new RangeError('refillPerSecond must be a non-negative finite number')
}

export class TokenBucket {
  readonly capacity: number
  readonly refillPerSecond: number
  private readonly now: () => number
  private tokens: number
  private lastRefillMs: number

  constructor(options: TokenBucketOptions) {
    assertCapacity(options.capacity)
    assertRefill(options.refillPerSecond)
    this.capacity = options.capacity
    this.refillPerSecond = options.refillPerSecond
    this.now = options.now ?? (() => Date.now())
    const initial = options.initialTokens ?? options.capacity
    this.tokens = Number.isFinite(initial) ? Math.min(options.capacity, Math.max(0, initial)) : options.capacity
    this.lastRefillMs = this.now()
  }

  /** Current token count after refill (fractional internally, whole for display). */
  get available(): number {
    this.refill()
    return this.tokens
  }

  private refill(): void {
    const nowMs = this.now()
    const elapsed = nowMs - this.lastRefillMs
    // Clock going backwards must not mint tokens.
    if (!Number.isFinite(elapsed) || elapsed <= 0) {
      this.lastRefillMs = nowMs
      return
    }
    this.lastRefillMs = nowMs
    if (this.refillPerSecond > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + (elapsed / 1000) * this.refillPerSecond)
    }
  }

  /** Wait time until `needed` tokens are available (bounded, pure arithmetic). */
  private retryAfterMsFor(needed: number): number {
    if (this.refillPerSecond <= 0) return MAX_RETRY_AFTER_MS
    const missing = needed - this.tokens
    if (missing <= 0) return 0
    const ms = Math.ceil((missing / this.refillPerSecond) * 1000)
    return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ms))
  }

  /**
   * Try to spend `tokens` (default 1). Does not consume on denial. A request
   * larger than capacity can never succeed; it reports the bounded wait anyway
   * instead of blocking forever.
   */
  tryConsume(tokens = 1): RateLimitDecision {
    const wanted = Number.isFinite(tokens) && tokens > 0 ? tokens : 1
    this.refill()
    if (wanted <= this.tokens) {
      this.tokens = Math.max(0, this.tokens - wanted)
      return { allowed: true, remaining: Math.floor(this.tokens), capacity: this.capacity, retryAfterMs: 0 }
    }
    return {
      allowed: false,
      remaining: Math.floor(this.tokens),
      capacity: this.capacity,
      retryAfterMs: this.retryAfterMsFor(Math.min(wanted, this.capacity)),
    }
  }

  /** Restore to full (e.g. user manually retried and accepted the cost). */
  reset(): void {
    this.tokens = this.capacity
    this.lastRefillMs = this.now()
  }
}

/** Names of the buckets wired for the pet side effects. */
export type SecurityLimitName = 'tts' | 'import' | 'retry' | 'save'

export interface SecurityRateLimits {
  tts: TokenBucket
  import: TokenBucket
  retry: TokenBucket
  save: TokenBucket
}

/**
 * Default buckets, calibrated so normal use never notices them:
 * - tts:    3-line burst, 1 line/s sustained (a pat click = one line);
 * - import: 2 imports burst, one per 30s (each import hits DeepSeek);
 * - retry:  5 retries burst, one per 10s (manual retry of a failed read);
 * - save:   4 saves burst, one per 2s (autosave is 30s; double-click is ok).
 * Values are intentionally small; change at the call site, not in the host.
 */
export function createSecurityRateLimits(now?: () => number): SecurityRateLimits {
  return {
    tts: new TokenBucket({ capacity: 3, refillPerSecond: 1, now }),
    import: new TokenBucket({ capacity: 2, refillPerSecond: 1 / 30, now }),
    retry: new TokenBucket({ capacity: 5, refillPerSecond: 1 / 10, now }),
    save: new TokenBucket({ capacity: 4, refillPerSecond: 0.5, now }),
  }
}

/** Convenience for call sites that want a throw instead of branching. */
export function consumeOrThrow(bucket: TokenBucket, limitName: string, tokens = 1): RateLimitDecision {
  const decision = bucket.tryConsume(tokens)
  if (!decision.allowed) throw new RateLimitError(limitName, decision.retryAfterMs)
  return decision
}
