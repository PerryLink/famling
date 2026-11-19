/**
 * Abortable, size-capped, retry-capped JSON fetching for the pet.
 *
 * Today `chat-import/fetch.ts:20` calls the browser `fetch()` with no timeout,
 * no abort signal, no response-size cap and no retry bound; a hung socket keeps
 * the import button spinning forever, and a huge body is buffered into memory.
 * Cloud voice providers (`voice/baked.ts:35,46`) have the same shape. This
 * module is the pure, injectable replacement: the network call and the clock are
 * both injected, so tests exercise timeout/abort/retry/size paths with zero
 * real network traffic.
 *
 * Contract: `fetchWithTimeout` resolves only after the fetcher resolves; a
 * caller abort or its own timeout rejects with `FetchAbortError` /
 * `FetchTimeoutError`. Response bodies are read through `readResponseText`
 * (byte-capped), and `fetchJsonWithTimeout` covers the body read with a timeout
 * too. The underlying fetcher must honour the `AbortSignal` for a timeout to
 * stop waiting (the platform `fetch` does; a fake should too).
 */

import { SECURITY_LIMITS, utf8ByteLength, validateHttpUrl } from './limits.ts'

/** Minimal response surface: enough for JSON/text reads, easy to fake in tests. */
export interface FetchResponseLike {
  readonly ok: boolean
  readonly status: number
  readonly headers?: { get(name: string): string | null }
  text(): Promise<string>
}

export type Fetcher = (
  url: string,
  init: { signal: AbortSignal; headers?: Record<string, string> },
) => Promise<FetchResponseLike>

export class NetworkRequestError extends Error {
  readonly name = 'NetworkRequestError'
}

export class FetchTimeoutError extends Error {
  readonly name = 'FetchTimeoutError'
  constructor(readonly timeoutMs: number) {
    super(`request timed out after ${timeoutMs}ms`)
  }
}

export class FetchAbortError extends Error {
  readonly name = 'FetchAbortError'
  constructor(message = 'request aborted') {
    super(message)
  }
}

export class ResponseTooLargeError extends Error {
  readonly name = 'ResponseTooLargeError'
  constructor(
    readonly actualBytes: number,
    readonly maxBytes: number,
  ) {
    super(`response is ${actualBytes} bytes > ${maxBytes}`)
  }
}

export class ResponseParseError extends Error {
  readonly name = 'ResponseParseError'
}

/** Transient statuses worth retrying; 4xx (except 408/429) are final. */
export const DEFAULT_RETRY_STATUSES: readonly number[] = Object.freeze([408, 425, 429, 500, 502, 503, 504])

const MAX_RETRIES = 5
const MAX_TIMEOUT_MS = 120_000
const MAX_RETRY_DELAY_MS = 10_000

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  return name === 'AbortError' || name === 'FetchAbortError'
}

const defaultFetcher: Fetcher = (url, init) => {
  if (typeof fetch !== 'function') return Promise.reject(new NetworkRequestError('fetch-unavailable'))
  return fetch(url, init) as unknown as Promise<FetchResponseLike>
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    if (!(ms > 0)) {
      resolve()
      return
    }
    setTimeout(resolve, ms)
  })

export interface FetchTimeoutOptions {
  /** Per-attempt timeout; invalid/<=0 falls back to `SECURITY_LIMITS.fetchTimeoutMs`. */
  timeoutMs?: number
  /** Retries after the first attempt; clamped to 0..5. */
  retries?: number
  /** Base backoff delay between attempts (ms). */
  retryDelayMs?: number
  /** Backoff ceiling (ms). */
  maxRetryDelayMs?: number
  /** Caller cancellation; rejects immediately and is never retried. */
  signal?: AbortSignal
  /** Injected transport (tests); defaults to global fetch. */
  fetcher?: Fetcher
  /** Injected sleep (tests use this to avoid real timers). */
  sleep?: (ms: number) => Promise<void>
  headers?: Record<string, string>
  retryStatuses?: readonly number[]
}

function resolveTimeoutMs(value: number | undefined): number {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return SECURITY_LIMITS.fetchTimeoutMs
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(value as number)))
}

function resolveRetries(value: number | undefined): number {
  if (!Number.isFinite(value)) return SECURITY_LIMITS.fetchMaxRetries
  return Math.min(MAX_RETRIES, Math.max(0, Math.floor(value as number)))
}

/**
 * Fetch with a per-attempt timeout, caller abort support and bounded retries.
 * Resolves with the final fetcher response (even `!ok`); throws only on invalid
 * URL, abort, timeout after the last retry, or a non-abort transport error after
 * the last retry.
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchTimeoutOptions = {},
): Promise<FetchResponseLike> {
  const checked = validateHttpUrl(url)
  if (!checked.ok) throw new NetworkRequestError(`invalid-url: ${checked.reason}`)
  const fetcher = options.fetcher ?? defaultFetcher
  const timeoutMs = resolveTimeoutMs(options.timeoutMs)
  const retries = resolveRetries(options.retries)
  const retryDelayMs = Number.isFinite(options.retryDelayMs)
    ? Math.max(0, Math.floor(options.retryDelayMs as number))
    : 250
  const maxRetryDelayMs = Number.isFinite(options.maxRetryDelayMs)
    ? Math.max(retryDelayMs, Math.floor(options.maxRetryDelayMs as number))
    : Math.max(retryDelayMs, 2_000)
  const retryStatuses = options.retryStatuses ?? DEFAULT_RETRY_STATUSES
  const sleep = options.sleep ?? defaultSleep
  const external = options.signal
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (external?.aborted) throw new FetchAbortError()
    const controller = new AbortController()
    let timedOut = false
    const onExternalAbort = (): void => controller.abort()
    external?.addEventListener('abort', onExternalAbort, { once: true })
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
    try {
      const init: { signal: AbortSignal; headers?: Record<string, string> } = { signal: controller.signal }
      if (options.headers) init.headers = options.headers
      const response = await fetcher(checked.href, init)
      if (!response.ok && retryStatuses.includes(response.status) && attempt < retries) {
        lastError = new NetworkRequestError(`http-${response.status}`)
      } else {
        return response
      }
    } catch (error) {
      if (external?.aborted || (!timedOut && isAbortError(error))) throw new FetchAbortError()
      lastError = timedOut ? new FetchTimeoutError(timeoutMs) : error
    } finally {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    }
    if (attempt < retries) await sleep(Math.min(maxRetryDelayMs, retryDelayMs * 2 ** attempt))
  }
  throw lastError instanceof Error ? lastError : new NetworkRequestError('fetch-failed')
}

/** Race a promise against a timeout and optional abort signal (no timer leaks). */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorFactory: () => Error,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const cleanup = (): void => {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
    const settle = (fn: () => void): void => {
      if (settled) return
      settled = true
      cleanup()
      fn()
    }
    const onAbort = (): void => settle(() => reject(new FetchAbortError()))
    // Attach both handlers immediately so a late rejection cannot be unhandled.
    promise.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    )
    timer = setTimeout(() => settle(() => reject(errorFactory())), timeoutMs)
    if (signal) {
      if (signal.aborted) {
        onAbort()
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

export interface ReadTextOptions {
  maxBytes?: number
  timeoutMs?: number
  signal?: AbortSignal
}

/**
 * Read a response body as text with an optional byte cap and timeout. The
 * Content-Length header is not trusted on its own: the decoded string is
 * measured after reading, so a lying/absent header cannot bypass the cap.
 * (If the timeout fires the read keeps running in the background, but its
 * result is ignored and a late rejection cannot become unhandled.)
 */
export async function readResponseText(
  response: FetchResponseLike,
  options: ReadTextOptions = {},
): Promise<string> {
  const maxBytes = Number.isFinite(options.maxBytes)
    ? Math.max(0, Math.floor(options.maxBytes as number))
    : SECURITY_LIMITS.fetchResponseBytes
  const body = response.text()
  let text: string
  if (options.timeoutMs !== undefined && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0) {
    text = await withTimeout(body, Math.floor(options.timeoutMs), () => new FetchTimeoutError(options.timeoutMs as number), options.signal)
  } else if (options.signal) {
    text = await withTimeout(body, MAX_TIMEOUT_MS, () => new FetchTimeoutError(MAX_TIMEOUT_MS), options.signal)
  } else {
    text = await body
  }
  if (typeof text !== 'string') throw new ResponseParseError('response body is not a string')
  const bytes = utf8ByteLength(text)
  if (bytes > maxBytes) throw new ResponseTooLargeError(bytes, maxBytes)
  return text
}

export interface FetchJsonOptions<T> extends FetchTimeoutOptions {
  maxResponseBytes?: number
  /** Override for tests/other formats; default JSON.parse. */
  parse?: (text: string) => T
  /** Body-read timeout; defaults to the per-attempt timeout. */
  bodyTimeoutMs?: number
}

export interface FetchJsonResult<T> {
  data: T
  response: FetchResponseLike
}

/**
 * Fetch + byte-cap + parse JSON. `!ok` HTTP responses throw
 * `NetworkRequestError('http-<status>')`; oversize/parse failures have their own
 * error classes so callers can map them to a user-readable message.
 */
export async function fetchJsonWithTimeout<T = unknown>(
  url: string,
  options: FetchJsonOptions<T> = {},
): Promise<FetchJsonResult<T>> {
  const response = await fetchWithTimeout(url, options)
  if (!response.ok) throw new NetworkRequestError(`http-${response.status}`)
  const maxBytes = Number.isFinite(options.maxResponseBytes)
    ? Math.max(0, Math.floor(options.maxResponseBytes as number))
    : SECURITY_LIMITS.fetchResponseBytes
  const declared = Number(response.headers?.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ResponseTooLargeError(declared, maxBytes)
  }
  const timeoutMs = resolveTimeoutMs(options.bodyTimeoutMs ?? options.timeoutMs)
  const text = await readResponseText(response, {
    maxBytes,
    timeoutMs,
    ...(options.signal ? { signal: options.signal } : {}),
  })
  if (options.parse) return { data: options.parse(text), response }
  try {
    return { data: JSON.parse(text) as T, response }
  } catch (error) {
    throw new ResponseParseError(error instanceof Error ? error.message : 'response is not JSON')
  }
}
