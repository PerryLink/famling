/**
 * Error classification, redaction and an async/sync guard that never swallows
 * errors silently.
 *
 * Current pet code has several `catch {}` / `.catch(() => {})` sinks
 * (main.ts:100,148,172-175,470,601-610,646-671,796,1131 etc.) and an uncaught
 * `loadNow()` chain (main.ts:646). A silent catch means the UI keeps a stale
 * state with no diagnostic; an uncaught async rejection disappears into the
 * WebView console. This module is the shared, DOM-free policy:
 *
 * - `classifyError()` maps an unknown thrown value to a stable kind/code/
 *   retryable flag (timeout vs network vs quota vs validation vs abort ...) so
 *   the host can pick a message without parsing raw error text;
 * - `redactErrorMessage()` removes local paths, URLs, long opaque tokens and
 *   control characters — errors are shown/logged, so they must not leak paths;
 * - `toUserMessage()` gives a bounded user-readable Chinese fallback per kind;
 * - `createErrorBoundary().guardSync/guardAsync()` returns a `{ok:false,...}`
 *   result, calls the injected logger with the ORIGINAL error plus a redacted
 *   context line (default logger = console.error), and records `lastFailure`
 *   for a status line. Expected aborts can be excluded from logging.
 *
 * No DOM, no console dependency required: both are only touched through guarded
 * feature checks, and the logger is injectable for tests.
 */

import { sanitizePlainText, truncateCodePoints } from './limits.ts'

export type ErrorKind =
  | 'abort'
  | 'timeout'
  | 'rate-limit'
  | 'network'
  | 'storage-quota'
  | 'storage-unavailable'
  | 'parse'
  | 'validation'
  | 'permission'
  | 'webcrypto'
  | 'unknown'

export interface ErrorClassification {
  kind: ErrorKind
  /** Stable machine-readable code for logs/status hooks. */
  code: string
  /** Whether a manual retry can plausibly help. */
  retryable: boolean
  /** Redacted, single-line, bounded message (safe for logs/status). */
  message: string
}

const KIND_META: Readonly<Record<ErrorKind, { code: string; retryable: boolean }>> = Object.freeze({
  abort: { code: 'ABORT', retryable: false },
  timeout: { code: 'TIMEOUT', retryable: true },
  'rate-limit': { code: 'RATE_LIMIT', retryable: true },
  network: { code: 'NETWORK', retryable: true },
  'storage-quota': { code: 'STORAGE_QUOTA', retryable: false },
  'storage-unavailable': { code: 'STORAGE_UNAVAILABLE', retryable: true },
  parse: { code: 'PARSE', retryable: false },
  validation: { code: 'VALIDATION', retryable: false },
  permission: { code: 'PERMISSION', retryable: false },
  webcrypto: { code: 'WEBCRYPTO', retryable: false },
  unknown: { code: 'UNKNOWN', retryable: true },
})

const USER_MESSAGES: Readonly<Record<ErrorKind, string>> = Object.freeze({
  abort: '操作已取消。',
  timeout: '等太久了，稍后再试。',
  'rate-limit': '太频繁了，先歇一下。',
  network: '网络没连上，稍后再试。',
  'storage-quota': '本机存储空间满了，先清理一点再试。',
  'storage-unavailable': '本机存储暂时不可用。',
  parse: '数据读不出来，可能已经损坏。',
  validation: '输入或文件不符合要求。',
  permission: '当前环境没有这个权限。',
  webcrypto: '当前环境不支持加密，已跳过。',
  unknown: '出了点小问题，稍后再试。',
})

export const DEFAULT_USER_FALLBACK = '出了点小问题，稍后再试。'
const MAX_ERROR_MESSAGE_CHARS = 180
const MAX_USER_DETAIL_CHARS = 80

/**
 * Safely read a property from an unknown thrown value (a hostile object with a
 * throwing getter must not break error handling).
 */
function readField(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object') return undefined
  try {
    return (value as Record<string, unknown>)[key]
  } catch {
    return undefined
  }
}

function rawMessage(error: unknown): string {
  if (error === null || error === undefined) return ''
  if (typeof error === 'string') return error
  let text: string
  try {
    text = String(error)
  } catch {
    text = ''
  }
  const message = readField(error, 'message')
  if (typeof message === 'string') return message
  return text
}

/**
 * Redact a value for display/logging: local paths (POSIX/Windows/UNC/`~`),
 * URLs (they can carry ids/tokens), long opaque tokens, and control characters
 * are removed; result is single-line and bounded.
 */
export function redactErrorMessage(value: unknown, maxChars = MAX_ERROR_MESSAGE_CHARS): string {
  const message = sanitizePlainText(rawMessage(value) || 'unknown error', { allowNewlines: false })
  const redacted = message
    .replace(/https?:\/\/[^\s"']+/gi, '[url]')
    .replace(/~(?:\/[^\s"']+)+/g, '[local path]')
    .replace(/[A-Za-z]:\\[^\s"']*/g, '[local path]')
    .replace(/\\\\[^\s"']+/g, '[local path]')
    .replace(/(?:\/[A-Za-z0-9._@+-]+){2,}/g, '[local path]')
    .replace(/\b[A-Za-z0-9+/=_-]{80,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
  const bounded = truncateCodePoints(redacted || 'unknown error', Math.max(1, maxChars))
  return bounded
}

/**
 * Classify an unknown thrown value. Deterministic and dependency-free; custom
 * error classes from this repo (`FetchTimeoutError`, `ResponseParseError`,
 * `RateLimitError`, `PathSafetyError`, ...) are recognized by name, and DOM
 * errors by name/code, before falling back to message heuristics.
 */
export function classifyError(error: unknown): ErrorClassification {
  const name = typeof readField(error, 'name') === 'string' ? (readField(error, 'name') as string) : ''
  const code = readField(error, 'code')
  const message = redactErrorMessage(error).toLowerCase()
  const kind = (() => {
    if (name === 'AbortError' || name === 'FetchAbortError' || code === 20) return 'abort' as const
    if (name === 'FetchTimeoutError' || name === 'AdvisersBriefTimeoutError' || /timed? ?out|timeout/.test(message)) {
      return 'timeout' as const
    }
    if (name === 'RateLimitError' || /rate limited|rate-limit|too many requests/.test(message)) return 'rate-limit' as const
    if (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      code === 22 ||
      code === 1014 ||
      /quota|storage is full|exceeded the quota/.test(message)
    ) {
      return 'storage-quota' as const
    }
    if (name === 'PathSafetyError' || name === 'RangeError') return 'validation' as const
    if (name === 'PermissionError' || name === 'NotAllowedError' || name === 'SecurityError') return 'permission' as const
    if (name === 'ResponseParseError' || (name === 'SyntaxError' && /json|parse|unexpected token/.test(message))) {
      return 'parse' as const
    }
    if (name === 'NetworkRequestError') return 'network' as const
    if (
      /webcrypto|indexeddb-unavailable|dpapi-unavailable|crypto is not available/.test(message)
    ) {
      return 'webcrypto' as const
    }
    if (/network|failed to fetch|fetch failed|load failed|econnrefused|econnreset|enotfound|offline/.test(message)) {
      return 'network' as const
    }
    if (/permission denied|not allowed|denied by|no permission/.test(message)) return 'permission' as const
    if (/localstorage|sessionstorage|indexeddb|storage unavailable|no-data-dir|no-voice-dir/.test(message)) {
      return 'storage-unavailable' as const
    }
    if (/invalid|unsupported|too long|too large|too many|out of range|must be|malformed|failed validation/.test(message)) {
      return 'validation' as const
    }
    return 'unknown' as const
  })()
  const meta = KIND_META[kind]
  return { kind, code: meta.code, retryable: meta.retryable, message: redactErrorMessage(error) }
}

export interface UserMessageOptions {
  /** Message used for `unknown` errors. */
  fallback?: string
  /** Append a bounded, redacted detail (useful for validation errors). */
  includeDetail?: boolean
}

/** Bounded, user-readable fallback per error kind; never leaks paths/URLs. */
export function toUserMessage(error: unknown, options: UserMessageOptions = {}): string {
  const classification = classifyError(error)
  const base =
    classification.kind === 'unknown'
      ? options.fallback ?? DEFAULT_USER_FALLBACK
      : USER_MESSAGES[classification.kind]
  if (options.includeDetail !== true) return base
  const detail = sanitizePlainText(classification.message, { maxChars: MAX_USER_DETAIL_CHARS, allowNewlines: false })
  if (!detail || detail === 'unknown error') return base
  return `${base}（${detail}）`
}

/** Logging surface; injectable so tests capture calls and hosts add sinks. */
export interface ErrorLogger {
  error(message: string, error?: unknown, context?: Record<string, unknown>): void
}

/** Default logger: console.error when present, guarded so it cannot throw. */
export const defaultErrorLogger: ErrorLogger = Object.freeze({
  error(message: string, error?: unknown, context?: Record<string, unknown>): void {
    try {
      if (typeof console === 'undefined' || typeof console.error !== 'function') return
      if (context) console.error(message, error, context)
      else if (error !== undefined) console.error(message, error)
      else console.error(message)
    } catch {
      // A broken console must never break error handling.
    }
  },
})

export interface ErrorBoundaryOptions {
  logger?: ErrorLogger
  /** Short tag included in log lines, e.g. `pet:save`. */
  context?: string
  /** Overrides the `unknown` user message. */
  fallbackMessage?: string
  /** Kinds that are expected control flow (default: `['abort']`) and not logged. */
  ignoreKinds?: readonly ErrorKind[]
  /** Hook for telemetry/status lines; called for non-ignored errors. */
  onError?: (classification: ErrorClassification, error: unknown) => void
}

export interface GuardFailure {
  ok: false
  error: unknown
  classification: ErrorClassification
  userMessage: string
}

export type GuardResult<T> = { ok: true; value: T } | GuardFailure

export interface ErrorBoundary {
  readonly lastFailure: GuardFailure | undefined
  guardSync<T>(task: () => T): GuardResult<T>
  guardAsync<T>(task: () => Promise<T>): Promise<GuardResult<T>>
}

/**
 * Build a guard around one host concern. Every failure is classified, logged
 * once (original error + redacted line + context) and returned; a logger or
 * `onError` callback that throws cannot mask the original failure.
 */
export function createErrorBoundary(options: ErrorBoundaryOptions = {}): ErrorBoundary {
  const logger = options.logger ?? defaultErrorLogger
  const ignoreKinds = options.ignoreKinds ?? (['abort'] as const)
  let lastFailure: GuardFailure | undefined

  const report = (error: unknown): GuardFailure => {
    const classification = classifyError(error)
    const userMessage = toUserMessage(error, { fallback: options.fallbackMessage })
    const failure: GuardFailure = { ok: false, error, classification, userMessage }
    lastFailure = failure
    if (!ignoreKinds.includes(classification.kind)) {
      const tag = options.context ? `[${options.context}]` : '[pet]'
      try {
        logger.error(`${tag} ${classification.code}: ${classification.message}`, error, {
          ...(options.context ? { context: options.context } : {}),
          kind: classification.kind,
          retryable: classification.retryable,
        })
      } catch {
        // Logging must never replace the original failure.
      }
      try {
        options.onError?.(classification, error)
      } catch {
        // Same for telemetry hooks.
      }
    }
    return failure
  }

  return {
    get lastFailure() {
      return lastFailure
    },
    guardSync<T>(task: () => T): GuardResult<T> {
      try {
        return { ok: true, value: task() }
      } catch (error) {
        return report(error)
      }
    },
    async guardAsync<T>(task: () => Promise<T>): Promise<GuardResult<T>> {
      try {
        return { ok: true, value: await task() }
      } catch (error) {
        return report(error)
      }
    },
  }
}

/** Module-level default boundary for one-off `void promise` call sites. */
const defaultBoundary = createErrorBoundary({ context: 'pet' })

export function guardSync<T>(task: () => T, options?: ErrorBoundaryOptions): GuardResult<T> {
  return (options ? createErrorBoundary(options) : defaultBoundary).guardSync(task)
}

export function guardAsync<T>(task: () => Promise<T>, options?: ErrorBoundaryOptions): Promise<GuardResult<T>> {
  return (options ? createErrorBoundary(options) : defaultBoundary).guardAsync(task)
}

/** True for abort/controller errors (expected, not worth an error toast). */
export function isAbortLike(error: unknown): boolean {
  return classifyError(error).kind === 'abort'
}

/** One-line log representation for unhandled rejection handlers. */
export function formatUnhandledError(error: unknown, context = 'unhandled'): string {
  const classification = classifyError(error)
  return `[${context}] ${classification.code}${classification.retryable ? ' (retryable)' : ''}: ${classification.message}`
}
