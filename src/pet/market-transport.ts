/**
 * Host-side market transport bridge (MB-081) for the Rust restricted downloader.
 *
 * This module wraps the `market_fetch` Tauri command into the transport shape
 * that `content-market.ts` injects. It is intentionally a leaf module:
 *
 * - it never performs network I/O on its own and never reads global fetch,
 *   XMLHttpRequest or WebSocket (static gate in tests/market-transport.test.ts);
 * - importing it, calling `createMarketTransport` and constructing a
 *   MarketplaceClient do not send anything: only an explicit transport call
 *   invokes the Rust command;
 * - outside Tauri (`window.__TAURI_INTERNALS__` missing) the factory returns
 *   null, which is exactly the value content-market.ts requires to fail closed
 *   with the stable `transport-unavailable` code and zero requests.
 *
 * The module deliberately does NOT import `content-market.ts`: that client must
 * stay outside the pet production bundle (its own static gate forbids pet
 * modules from importing it). The transport types below are structural mirrors;
 * `tsc` verifies assignability in tests/market-transport.test.ts.
 *
 * Error mapping: the Rust command rejects with a structured object
 * `{ code, message, httpStatus?, retryable? }` using stable kebab-case codes.
 * `mapMarketFetchError` turns that into a `MarketTransportError` whose `code`
 * field is the content-market failure code the host bridge should surface.
 * Note: `content-market.ts` currently only distinguishes a thrown AbortError
 * (timeout) from any other transport failure (network-error); honoring the
 * mapped code inside its `mapThrown` is a small follow-up in the wiring task,
 * because this module is not imported by any production module yet.
 *
 * What the Rust side enforces independently (defense in depth): HTTPS only, no
 * credentials/fragments, DNS resolution pinned to a validated public address,
 * no loopback/private/link-local/reserved targets, GET only, no custom
 * Authorization/Cookie, at most 3 same-host redirects, 8 s total budget, and a
 * response body hard cap of 64 MiB.
 */

/** Tauri command name registered in app/tauri/src-tauri/src/main.rs. */
export const MARKET_FETCH_COMMAND = "market_fetch"

/** Mirrors MARKET_FETCH_TOTAL_TIMEOUT in market.rs (the Rust side enforces it). */
export const MARKET_FETCH_TOTAL_TIMEOUT_MS = 8_000

/** Mirrors MARKET_FETCH_MAX_REDIRECTS in market.rs. */
export const MARKET_FETCH_MAX_REDIRECTS = 3

/** Hard response-body ceiling enforced by market.rs, regardless of the caller. */
export const MARKET_FETCH_HARD_MAX_BYTES = 64 * 1024 * 1024

/** Catalog responses are bounded like MARKET_CLIENT_HARD_LIMITS.maxCatalogBytes. */
export const MARKET_FETCH_CATALOG_MAX_BYTES = 4 * 1024 * 1024

/** Pack responses are bounded like MARKET_CLIENT_HARD_LIMITS.maxPackBytes. */
export const MARKET_FETCH_PACK_MAX_BYTES = 64 * 1024 * 1024

const MARKET_FETCH_MAX_URL_CHARS = 4096
const MARKET_FETCH_MAX_ACCEPT_CHARS = 256
const MARKET_FETCH_MAX_HEADER_NAME_CHARS = 64
const MARKET_FETCH_MAX_HEADER_VALUE_CHARS = 1024
const MARKET_FETCH_MAX_ERROR_MESSAGE_CHARS = 200
const MARKET_FETCH_MAX_ENCODED_BYTES = Math.ceil(MARKET_FETCH_HARD_MAX_BYTES / 3) * 4 + 8

/** Only these response headers are accepted back across the IPC boundary. */
const REPLY_HEADER_ALLOWLIST: readonly string[] = Object.freeze(["content-length", "content-type"])

// ---------------------------------------------------------------------------
// Structural transport contract (mirrors content-market.ts)
// ---------------------------------------------------------------------------

/** Structural mirror of content-market.ts `MarketplaceRequestInit`. */
export interface MarketTransportRequestInit {
  readonly method: "GET"
  readonly signal: AbortSignal
  readonly redirect: "manual"
  readonly credentials: "omit"
  readonly cache: "no-store"
  readonly referrerPolicy: "no-referrer"
  readonly headers: Readonly<Record<string, string>>
}

/** Structural mirror of content-market.ts `MarketResponseLike`. */
export interface MarketTransportResponseLike {
  readonly ok: boolean
  readonly status: number
  readonly url?: string
  readonly redirected?: boolean
  readonly headers?: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
}

/** Structural mirror of content-market.ts `MarketTransport`. */
export type MarketTransport = (url: string, init: MarketTransportRequestInit) => Promise<MarketTransportResponseLike>

/** Injected Tauri invoke, structurally compatible with @tauri-apps/api/core. */
export type MarketTransportInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/** Factory options; every field is injectable so tests stay offline. */
export interface MarketTransportOptions {
  /** Injected invoke (tests / alternate host). Defaults to the Tauri API. */
  readonly invoke?: MarketTransportInvoke
  /** Runtime detection override (tests). Defaults to the real Tauri check. */
  readonly isTauri?: () => boolean
  /** Per-request body cap; clamped to the 64 MiB hard ceiling. */
  readonly maxBytes?: number
}

// ---------------------------------------------------------------------------
// Error codes: the Rust command names them, content-market owns the target set
// ---------------------------------------------------------------------------

/** Every kebab-case code `market_fetch` can reject with (see market.rs). */
export const RUST_MARKET_FETCH_ERROR_CODES = Object.freeze([
  "invalid-url",
  "insecure-transport",
  "url-credentials",
  "url-fragment",
  "invalid-argument",
  "invalid-header",
  "private-host",
  "dns-failed",
  "redirect-limit",
  "redirect-invalid",
  "redirect-cross-host",
  "redirect-insecure",
  "http-error",
  "too-large",
  "timeout",
  "network-error",
  "window-not-allowed",
  "internal-error",
] as const)

export type RustMarketFetchErrorCode = (typeof RUST_MARKET_FETCH_ERROR_CODES)[number]

/** The subset of content-market failure codes this adapter can surface. */
export type MarketTransportFailureCode =
  | "invalid-url"
  | "insecure-transport"
  | "url-credentials"
  | "url-fragment"
  | "private-host"
  | "invalid-argument"
  | "network-error"
  | "timeout"
  | "http-error"
  | "redirect-invalid"
  | "redirect-limit"
  | "redirect-cross-host"
  | "redirect-insecure"
  | "too-large"
  | "internal-error"

/** Rust code -> content-market stable failure code. Exhaustive by type. */
export const MARKET_TRANSPORT_ERROR_CODE_MAP: Readonly<Record<RustMarketFetchErrorCode, MarketTransportFailureCode>> =
  Object.freeze({
    "invalid-url": "invalid-url",
    "insecure-transport": "insecure-transport",
    "url-credentials": "url-credentials",
    "url-fragment": "url-fragment",
    "invalid-argument": "invalid-argument",
    "invalid-header": "invalid-argument",
    "private-host": "private-host",
    "dns-failed": "network-error",
    "redirect-limit": "redirect-limit",
    "redirect-invalid": "redirect-invalid",
    "redirect-cross-host": "redirect-cross-host",
    "redirect-insecure": "redirect-insecure",
    "http-error": "http-error",
    "too-large": "too-large",
    "timeout": "timeout",
    "network-error": "network-error",
    "window-not-allowed": "internal-error",
    "internal-error": "internal-error",
  })

/** Structured transport failure carrying the content-market failure code. */
export interface MarketTransportErrorDetails {
  readonly rustCode?: RustMarketFetchErrorCode | null
  readonly httpStatus?: number | null
  readonly retryable?: boolean | null
}

export class MarketTransportError extends Error {
  /** content-market failure code the host bridge should surface. */
  readonly code: MarketTransportFailureCode
  /** Original Rust command code, when known. */
  readonly rustCode: RustMarketFetchErrorCode | null
  readonly httpStatus: number | null
  readonly retryable: boolean | null

  constructor(code: MarketTransportFailureCode, message: string, details: MarketTransportErrorDetails = {}) {
    super(boundedMessage(message, MAX_FALLBACK_MESSAGE))
    this.name = "MarketTransportError"
    this.code = code
    this.rustCode = details.rustCode ?? null
    this.httpStatus = details.httpStatus ?? null
    this.retryable = details.retryable ?? null
  }
}

const MAX_FALLBACK_MESSAGE = "market transport request failed"

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/** True only inside a Tauri webview with a usable IPC bridge. */
export function isTauriMarketHost(): boolean {
  if (typeof window === "undefined") return false
  const internals = (window as unknown as { __TAURI_INTERNALS__?: { invoke?: unknown } }).__TAURI_INTERNALS__
  return internals !== undefined && internals !== null && typeof internals.invoke === "function"
}

/**
 * Create the market transport from the Rust `market_fetch` command.
 *
 * Returns null when no Tauri IPC bridge exists: callers must pass null (or omit
 * the field) to MarketplaceClientConfig.transport, which then stays configured:
 * false with the stable `transport-unavailable` code and performs zero requests.
 */
export function createMarketTransport(options: MarketTransportOptions = {}): MarketTransport | null {
  const invoke = resolveInvoke(options)
  if (invoke === null) return null
  const configuredLimit = normalizeConfiguredMaxBytes(options.maxBytes)
  return async function marketTransport(url: string, init: MarketTransportRequestInit): Promise<MarketTransportResponseLike> {
    if (typeof url !== "string" || url.length === 0 || url.length > MARKET_FETCH_MAX_URL_CHARS) {
      throw new MarketTransportError("invalid-url", "market transport requires a bounded absolute URL")
    }
    if (init === null || typeof init !== "object") {
      throw new MarketTransportError("invalid-argument", "market transport init must be an object")
    }
    if (init.method !== "GET") {
      throw new MarketTransportError("invalid-argument", "the market transport only supports GET")
    }
    const signal = init.signal
    if (signal !== undefined && signal !== null && signal.aborted) throw abortFailure()
    const accept = acceptHeaderFor(init)
    const maxBytes = requestMaxBytes(accept, configuredLimit)
    let reply: unknown
    try {
      reply = await invokeWithAbort(invoke, MARKET_FETCH_COMMAND, { url, maxBytes, accept }, signal)
    } catch (error) {
      if (isAbortError(error)) throw error
      throw mapMarketFetchError(error)
    }
    return decodeMarketFetchReply(reply)
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

async function defaultTauriInvoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
  const { invoke } = await import("@tauri-apps/api/core")
  return invoke(command, args)
}

function resolveInvoke(options: MarketTransportOptions): MarketTransportInvoke | null {
  if (typeof options.invoke === "function") return options.invoke
  const isTauri = typeof options.isTauri === "function" ? options.isTauri : isTauriMarketHost
  if (!isTauri()) return null
  return defaultTauriInvoke
}

function normalizeConfiguredMaxBytes(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return MARKET_FETCH_HARD_MAX_BYTES
  const rounded = Math.floor(value)
  if (rounded <= 0) return MARKET_FETCH_HARD_MAX_BYTES
  return Math.min(rounded, MARKET_FETCH_HARD_MAX_BYTES)
}

function requestMaxBytes(accept: string | null, configured: number): number {
  const hinted = accept !== null && accept.toLowerCase().includes("json")
    ? MARKET_FETCH_CATALOG_MAX_BYTES
    : MARKET_FETCH_PACK_MAX_BYTES
  return Math.min(configured, hinted)
}

function acceptHeaderFor(init: MarketTransportRequestInit): string | null {
  const headers = init.headers
  if (headers === undefined || headers === null || typeof headers !== "object") return null
  for (const name of Object.keys(headers)) {
    if (name.toLowerCase() !== "accept") continue
    const value = headers[name]
    if (typeof value !== "string") {
      throw new MarketTransportError("invalid-argument", "the accept header must be a string")
    }
    const trimmed = value.trim()
    if (trimmed.length === 0) return null
    if (trimmed.length > MARKET_FETCH_MAX_ACCEPT_CHARS) {
      throw new MarketTransportError("invalid-argument", "the accept header is too long")
    }
    for (let index = 0; index < trimmed.length; index += 1) {
      const code = trimmed.charCodeAt(index)
      if (code < 0x20 || code > 0x7e) {
        throw new MarketTransportError("invalid-argument", "the accept header contains unsupported characters")
      }
    }
    return trimmed
  }
  return null
}

function invokeWithAbort(
  invoke: MarketTransportInvoke,
  command: string,
  args: Record<string, unknown>,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  if (signal === undefined || signal === null || typeof signal.addEventListener !== "function") return invoke(command, args)
  if (signal.aborted) return Promise.reject(abortFailure())
  const pending = invoke(command, args)
  return new Promise<unknown>((resolve, reject) => {
    let settled = false
    let onAbort = (): void => {}
    const finish = (settle: () => void): void => {
      if (settled) return
      settled = true
      signal.removeEventListener("abort", onAbort)
      settle()
    }
    onAbort = (): void => finish(() => reject(abortFailure()))
    signal.addEventListener("abort", onAbort, { once: true })
    pending.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    )
  })
}

function abortFailure(): Error {
  const failure = new Error("market transport request was aborted")
  failure.name = "AbortError"
  return failure
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isRustMarketFetchErrorCode(value: unknown): value is RustMarketFetchErrorCode {
  return typeof value === "string" && (RUST_MARKET_FETCH_ERROR_CODES as readonly string[]).includes(value)
}

function boundedMessage(value: string, fallback: string): string {
  if (typeof value !== "string") return fallback
  let bounded = ""
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 0x20 || code === 0x7f) continue
    bounded += character
    if (bounded.length >= MARKET_FETCH_MAX_ERROR_MESSAGE_CHARS) break
  }
  const trimmed = bounded.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function defaultErrorMessage(code: MarketTransportFailureCode): string {
  return "market transport failed: " + code
}

/** Map a structured Rust rejection onto a content-market failure code. */
export function mapMarketFetchError(raw: unknown): MarketTransportError {
  if (raw instanceof MarketTransportError) return raw
  if (!isRecord(raw) || !isRustMarketFetchErrorCode(raw.code)) {
    return new MarketTransportError("internal-error", "market_fetch failed without a structured error code")
  }
  const rustCode = raw.code
  const code = MARKET_TRANSPORT_ERROR_CODE_MAP[rustCode]
  const httpStatus = typeof raw.httpStatus === "number" && Number.isInteger(raw.httpStatus) && raw.httpStatus >= 100 && raw.httpStatus <= 599
    ? raw.httpStatus
    : null
  const retryable = typeof raw.retryable === "boolean" ? raw.retryable : null
  const rawMessage = typeof raw.message === "string" ? raw.message : ""
  const message = boundedMessage(rawMessage, defaultErrorMessage(code))
  return new MarketTransportError(code, message, { rustCode, httpStatus, retryable })
}

function decodeReplyHeaders(raw: unknown): Map<string, string> {
  const headers = new Map<string, string>()
  if (!isRecord(raw)) return headers
  for (const name of Object.keys(raw)) {
    const lower = name.toLowerCase()
    if (!REPLY_HEADER_ALLOWLIST.includes(lower)) continue
    if (lower.length === 0 || lower.length > MARKET_FETCH_MAX_HEADER_NAME_CHARS) continue
    const value = raw[name]
    if (typeof value !== "string" || value.length > MARKET_FETCH_MAX_HEADER_VALUE_CHARS) continue
    let safe = true
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index)
      if (code < 0x20 || code > 0x7e) {
        safe = false
        break
      }
    }
    if (safe) headers.set(lower, value)
  }
  return headers
}

function decodeBase64(value: string): Uint8Array {
  if (typeof atob !== "function") {
    throw new MarketTransportError("internal-error", "base64 decoding is unavailable in this host")
  }
  let binary: string
  try {
    binary = atob(value)
  } catch {
    throw new MarketTransportError("internal-error", "market_fetch returned an invalid base64 body")
  }
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/** Validate the IPC reply and adapt it to the content-market response shape. */
export function decodeMarketFetchReply(raw: unknown): MarketTransportResponseLike {
  if (!isRecord(raw)) {
    throw new MarketTransportError("internal-error", "market_fetch returned a malformed reply")
  }
  const status = raw.status
  if (typeof status !== "number" || !Number.isInteger(status) || status < 200 || status > 299) {
    throw new MarketTransportError("internal-error", "market_fetch returned an unexpected status")
  }
  const finalUrl = raw.url
  if (typeof finalUrl !== "string" || finalUrl.length === 0 || finalUrl.length > MARKET_FETCH_MAX_URL_CHARS) {
    throw new MarketTransportError("internal-error", "market_fetch returned an invalid final URL")
  }
  const bodyBase64 = raw.bodyBase64
  if (typeof bodyBase64 !== "string" || bodyBase64.length > MARKET_FETCH_MAX_ENCODED_BYTES) {
    throw new MarketTransportError("internal-error", "market_fetch returned an invalid body")
  }
  const rawRedirects = raw.redirects
  if (
    rawRedirects !== undefined &&
    (typeof rawRedirects !== "number" ||
      !Number.isInteger(rawRedirects) ||
      rawRedirects < 0 ||
      rawRedirects > MARKET_FETCH_MAX_REDIRECTS)
  ) {
    throw new MarketTransportError("internal-error", "market_fetch returned invalid redirect metadata")
  }
  const redirects = rawRedirects === undefined ? 0 : rawRedirects
  const headers = decodeReplyHeaders(raw.headers)
  const bytes = decodeBase64(bodyBase64)
  return {
    ok: true,
    status,
    url: finalUrl,
    redirected: raw.redirected === true || redirects > 0,
    headers: {
      get(name: string): string | null {
        if (typeof name !== "string") return null
        return headers.get(name.toLowerCase()) ?? null
      },
    },
    async arrayBuffer(): Promise<ArrayBuffer> {
      return bytes.buffer as ArrayBuffer
    },
  }
}
