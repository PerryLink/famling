/**
 * Remote content market client v1 (famling.market-client/0.1).
 *
 * Scope (task-66 + task-75): the **host-side transport + verification client**
 * for the remote market contract defined by content-library.ts (catalog shape,
 * Ed25519 canonical payloads, trust root) and content-hub.ts (RemoteMarketSource
 * UI contract). This module is a pure state machine/validator: it NEVER performs
 * network I/O itself and NEVER reads a global `fetch` (`globalThis.fetch`,
 * `window.fetch`, `self.fetch`); a static CI gate test enforces this. The host
 * MUST inject a `MarketTransport` (a future Rust/IPC bridge, or a test fake)
 * through `MarketplaceClientConfig.transport`. There is no global-fetch
 * fallback: without an injected transport the client is unconfigured with the
 * stable failure code `transport-unavailable` and performs zero requests.
 *
 * Zero-request rules (task-75, enforced by tests):
 * - importing the module, constructing a client, creating a RemoteMarketSource or
 *   creating the content-hub refresh handler never performs a request;
 * - `transport` defaults to null: no injected transport => no network call of any
 *   kind and `transport-unavailable` (configured:false, market UI stays disabled);
 * - the only paths that can call the injected transport are the explicit
 *   refreshCatalog() / downloadPack() calls, after all fail-closed checks.
 *
 * Hard rules implemented here (all fail-closed):
 * - catalog/pack transport must be HTTPS; plain HTTP only when the host
 *   explicitly passes allowHttp: true (tests/dev) — production callers must not;
 * - credential-bearing URLs and URL fragments are rejected before any transport call;
 * - loopback/private/link-local/CGNAT/metadata hosts are rejected unless the
 *   host explicitly passes allowPrivateHosts: true (tests only);
 * - redirects are followed manually (redirect: 'manual'), are capped, must stay
 *   on the same hostname and must not downgrade HTTPS to HTTP;
 * - the catalogue JSON is bounded (default 1 MiB, matching the pure validator)
 *   and the .zip bundle is bounded (default 16 MiB, matching maxZipBytes);
 * - a per-request timeout (default 8 s) covers redirects AND the body read;
 * - the catalogue is validated by validateMarketCatalog() and its detached
 *   Ed25519 signature by verifyMarketCatalogSignature() before it is used;
 * - the catalogue serial (updatedAt + version) is persisted locally and a
 *   lower/replayed serial is rejected with catalog-rollback;
 * - pack downloads accept only the exact download URL of an entry from the
 *   last verified catalogue, enforce the declared byte length, compute SHA-256
 *   locally and verify verifyMarketPackDownload() (hash first, then Ed25519);
 * - install only runs after all of the above AND after the host-supplied
 *   unpack/install callbacks; an unpacked pack.json with source 'remote' must
 *   additionally pass verifyRemoteContentPack(); this module never writes to
 *   disk itself, so the host owns bounded unzip/validation/persistence;
 * - only one catalogue refresh runs at a time (calls are serialized) and pack
 *   downloads are capped by maxConcurrentDownloads (default 2).
 *
 * Privacy / logs:
 * - requests use credentials:'omit', cache:'no-store', referrerPolicy:
 *   'no-referrer'; no telemetry and no analytics are emitted;
 * - the only persistent state is the catalogue serial envelope (version,
 *   updatedAt, payload sha256) under one storage key; no URLs, tokens or
 *   downloaded content are stored;
 * - the injectable logger receives redacted events (hostname only, never a full
 *   URL/query/fragment, never a signature, never response bytes).
 *
 * What this module does NOT do (see docs/design/CONTENT-MARKET-2026-11-19.md §11):
 * - it does not perform network I/O and has no global `fetch` fallback: the host
 *   injects the transport (Rust restricted downloader / IPC / test fake);
 * - it does not host a server, CDN, review backend, payment or key ceremony;
 * - it does not ask the user for consent: the UI must show the canonical usage
 *   declaration and call installPack only after an explicit confirmation;
 * - it does not unzip, hash pack files or merge packs; those are injected host
 *   callbacks so the shared core validators (validateContentPackV2,
 *   validatePackZip, mergeCharacterThemes) stay the only acceptance path.
 */

import {
  CONTENT_LIMITS,
  CONTENT_MARKET_CATALOG_SCHEMA,
  CONTENT_MARKET_LIMITS,
  CONTENT_PACK_V2_LIMITS,
  isMarketCatalogV2,
  marketCatalogSignaturePayload,
  marketPackSignaturePayload,
  validateContentPackV2,
  validateMarketCatalogV2,
  verifyMarketCatalogSignature,
  verifyMarketPackDownload,
  verifyRemoteContentPack,
  type ContentEd25519Verifier,
  type ContentMarketCatalog,
  type ContentMarketCatalogV2,
  type ContentMarketPack,
  type ContentMarketRetryPolicy,
  type ContentPackV2,
  type ContentSignatureFailureCode,
  type ContentSignatureVerification,
  type ContentTrustRoot,
} from './content-library.ts'
import {
  defaultContentMarketState,
  describeContentMarketState,
  summarizeMarketCatalog,
  type ContentHubMarketRefreshResult,
  type ContentMarketUiState,
  type RemoteMarketSource,
} from './content-hub.ts'
import { sha256Hex } from './consent/hash.ts'
import { safeRemoveItem, safeSetItem, type StorageLike } from './security/safe-storage.ts'
import {
  countCodePoints,
  stripBidiControls,
  stripControlChars,
  truncateCodePoints,
} from './security/limits.ts'

// ---------------------------------------------------------------------------
// Limits, identifiers and failure codes
// ---------------------------------------------------------------------------

/** Defaults for the network client. They mirror the pure validator caps. */
export const MARKET_CLIENT_DEFAULTS = Object.freeze({
  timeoutMs: 8_000,
  maxCatalogBytes: CONTENT_PACK_V2_LIMITS.maxMarketJsonBytes,
  maxPackBytes: CONTENT_PACK_V2_LIMITS.maxZipBytes,
  maxRedirects: 3,
  maxConcurrentDownloads: CONTENT_MARKET_LIMITS.defaultConcurrentDownloads,
  maxSerialStorageChars: 4096,
  maxCatalogCacheChars: CONTENT_PACK_V2_LIMITS.maxMarketJsonBytes + 4096,
  maxUrlChars: CONTENT_LIMITS.maxRemoteUrlChars,
  maxMessageChars: 160,
  maxIssues: 8,
  requestsPerMinute: CONTENT_MARKET_LIMITS.defaultRequestsPerMinute,
  rateLimitWindowMs: 60_000,
  retryMaxAttempts: CONTENT_MARKET_LIMITS.defaultRetryAttempts,
  retryBaseDelayMs: CONTENT_MARKET_LIMITS.defaultRetryBaseDelayMs,
  retryMaxDelayMs: CONTENT_MARKET_LIMITS.defaultRetryMaxDelayMs,
  maxRetryAfterMs: 60_000,
  offlineGraceSeconds: CONTENT_MARKET_LIMITS.defaultOfflineGraceSeconds,
})

/** Absolute ceilings: a host cannot configure itself beyond these. */
export const MARKET_CLIENT_HARD_LIMITS = Object.freeze({
  timeoutMs: 30_000,
  maxCatalogBytes: 4 * 1024 * 1024,
  maxPackBytes: 64 * 1024 * 1024,
  maxRedirects: 5,
  maxConcurrentDownloads: CONTENT_MARKET_LIMITS.maxConcurrentDownloads,
  requestsPerMinute: CONTENT_MARKET_LIMITS.maxRequestsPerMinute,
  retryMaxAttempts: CONTENT_MARKET_LIMITS.maxRetryAttempts,
  retryBaseDelayMs: CONTENT_MARKET_LIMITS.maxRetryDelayMs,
  retryMaxDelayMs: CONTENT_MARKET_LIMITS.maxRetryDelayMs,
  offlineGraceSeconds: CONTENT_MARKET_LIMITS.maxOfflineGraceSeconds,
})

/** Local storage key for the anti-rollback catalogue serial envelope. */
export const MARKET_SERIAL_STORAGE_KEY = 'desktop-games/pet/content/market/catalog-serial'

/** Storage schema version of the serial envelope written by this module (v2). */
export const MARKET_SERIAL_STORAGE_VERSION = 2

/** Local storage key for the bounded last-verified catalog cache (offline grace). */
export const MARKET_CATALOG_CACHE_STORAGE_KEY = 'desktop-games/pet/content/market/catalog-cache'

/** Storage schema version of the cached catalog envelope. */
export const MARKET_CATALOG_CACHE_VERSION = 1

/** Every stable failure code returned by the client (UI/i18n keys). */
export const MARKET_FAILURE_CODES = Object.freeze([
  'not-configured',
  'transport-unavailable',
  'invalid-config',
  'invalid-argument',
  'invalid-url',
  'insecure-transport',
  'url-credentials',
  'url-fragment',
  'private-host',
  'host-not-allowed',
  'network-error',
  'timeout',
  'aborted',
  'http-error',
  'rate-limited',
  'redirect-invalid',
  'redirect-limit',
  'redirect-cross-host',
  'redirect-insecure',
  'empty-response',
  'too-large',
  'size-mismatch',
  'catalog-invalid',
  'catalog-rollback',
  'catalog-unsupported',
  'catalog-expired',
  'storage-unavailable',
  'storage-corrupt',
  'serial-write-failed',
  'pack-not-in-catalog',
  'install-unconfigured',
  'unpack-failed',
  'pack-invalid',
  'install-failed',
  'missing-signature',
  'invalid-signature',
  'unknown-signing-key',
  'revoked-signing-key',
  'key-outside-validity',
  'hash-mismatch',
  'internal-error',
] as const)

export type MarketFailureCode = (typeof MARKET_FAILURE_CODES)[number]

const SIGNATURE_FAILURE_CODES: Readonly<Record<ContentSignatureFailureCode, MarketFailureCode>> = Object.freeze({
  'missing-signature': 'missing-signature',
  'invalid-signature': 'invalid-signature',
  'unknown-signing-key': 'unknown-signing-key',
  'revoked-signing-key': 'revoked-signing-key',
  'key-outside-validity': 'key-outside-validity',
  'hash-mismatch': 'hash-mismatch',
  'invalid-market-catalog': 'catalog-invalid',
})

const REDIRECT_STATUSES: readonly number[] = Object.freeze([301, 302, 303, 307, 308])
const CONTENT_LENGTH_HEADER = 'content-length'
const LOCATION_HEADER = 'location'
const RETRY_AFTER_HEADER = 'retry-after'
/** Only these HTTP statuses are retried (task/MB-080 v0.2 transport profile). */
const RETRYABLE_HTTP_STATUSES: readonly number[] = Object.freeze([408, 425, 429, 500, 502, 503, 504])

// ---------------------------------------------------------------------------
// Injectable transport
// ---------------------------------------------------------------------------

/** Minimal request init this client hands to the host-injected transport. */
export interface MarketplaceRequestInit {
  readonly method: 'GET'
  readonly signal: AbortSignal
  /** Never 'follow': redirects are validated by this module. */
  readonly redirect: 'manual'
  /** Never send cookies or HTTP auth to a third-party market. */
  readonly credentials: 'omit'
  /** No cache: a stale catalogue could replay an old serial. */
  readonly cache: 'no-store'
  readonly referrerPolicy: 'no-referrer'
  readonly headers: Readonly<Record<string, string>>
}

/**
 * Minimal response surface. A browser/WebView2 Response satisfies it, and so does
 * a Rust bridge reply (status/headers/bytes) returned over IPC.
 */
export interface MarketResponseLike {
  readonly ok: boolean
  readonly status: number
  readonly url?: string
  readonly redirected?: boolean
  readonly headers?: { get(name: string): string | null }
  arrayBuffer(): Promise<ArrayBuffer>
}

/**
 * Host-injected transport (IPC/Rust bridge or a test fake).
 *
 * There is intentionally NO default: this module never reads globalThis.fetch,
 * window.fetch or self.fetch. Without an injected transport the client fails
 * closed with `transport-unavailable` and stays completely offline.
 */
export type MarketTransport = (url: string, init: MarketplaceRequestInit) => Promise<MarketResponseLike>

// ---------------------------------------------------------------------------
// Result / log types
// ---------------------------------------------------------------------------

export type MarketLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type MarketLogEventKind =
  | 'config'
  | 'catalog-refresh'
  | 'catalog-cache'
  | 'pack-download'
  | 'pack-install'
  | 'serial-reset'

/** Redacted log record: no URL beyond hostname, no signature, no body. */
export interface MarketLogEvent {
  readonly level: MarketLogLevel
  readonly event: MarketLogEventKind
  readonly sourceId?: string
  readonly code?: string
  readonly detail?: string
  readonly host?: string
  readonly httpStatus?: number
  readonly bytes?: number
  readonly durationMs?: number
  readonly redirects?: number
  readonly keyId?: string
  /** Transport attempts used by a retried catalogue/pack request (>= 1). */
  readonly attempts?: number
}

export type MarketplaceLogger = (event: MarketLogEvent) => void

/** One bounded validation issue (path/code/message; no raw catalog values). */
export interface MarketIssue {
  readonly path: string
  readonly code: string
  readonly message: string
}

/** Stable failure value; never throws, safe to render as text. */
export interface MarketFailure {
  readonly ok: false
  readonly code: MarketFailureCode
  readonly message: string
  /** Lower-level reason for signature/install callbacks (optional). */
  readonly detailCode?: string
  readonly httpStatus?: number
  /** Hostname only (never the full URL). */
  readonly host?: string
  readonly issues?: readonly MarketIssue[]
  /** Transient transport/HTTP failures the UI may offer to retry. */
  readonly retryable?: boolean
  /** Suggested delay before retrying (rate limit / Retry-After); bounded. */
  readonly retryAfterMs?: number
}

export interface MarketCatalogSerial {
  /** Monotonic publisher sequence from catalog.serial (primary rollback order). */
  readonly serial: number
  /** Publisher timestamp from catalog.updatedAt, as UTC milliseconds. */
  readonly updatedAtMs: number
  /** Normalized publisher timestamp string as it appeared in the catalogue. */
  readonly updatedAt: string
  /** Catalogue semver (diagnostics only; ordering uses the monotonic serial). */
  readonly version: string
  /** SHA-256 of the canonical signed payload (identity of this catalogue). */
  readonly catalogSha256: string
  /** catalog.expires as UTC milliseconds (hard freshness deadline). */
  readonly expiresMs: number
  /** expires + effective offline grace, as UTC milliseconds. */
  readonly offlineGraceUntilMs: number
  /** Signed mirror origins the next refresh/download may fall back to. */
  readonly mirrors: readonly string[]
}

export interface MarketCatalogRefreshSuccess {
  readonly ok: true
  readonly catalog: ContentMarketCatalog
  readonly packs: readonly ContentMarketPack[]
  readonly sourceId: string
  readonly keyId: string
  readonly keyStatus: 'active' | 'retired' | 'revoked'
  readonly serial: MarketCatalogSerial
  readonly bytes: number
  readonly durationMs: number
  readonly redirects: number
  readonly httpStatus: number
  readonly fetchedAt: string
  readonly catalogHost: string
  /** True when the serial was read/verified against persisted storage. */
  readonly rollbackProtection: boolean
  /** True when the result came from the bounded local cache (network unavailable). */
  readonly cached: boolean
  /** True when now is past catalog.expires but still inside the offline grace window. */
  readonly stale: boolean
  /** catalog.expires (ISO-8601 UTC). */
  readonly expiresAt: string
  /** expires + effective offline grace (ISO-8601 UTC). */
  readonly offlineGraceUntil: string
  /** Transport attempts used for the catalogue request (1 = no retry). */
  readonly attempts: number
  /** True when the catalogue body came from a signed mirror origin. */
  readonly viaMirror: boolean
}

export type MarketCatalogRefreshResult = MarketCatalogRefreshSuccess | MarketFailure

export interface MarketPackDownloadSuccess {
  readonly ok: true
  readonly pack: ContentMarketPack
  /** Verified zip bytes (SHA-256 + Ed25519 both passed). */
  readonly bytes: Uint8Array
  readonly sha256: string
  readonly keyId: string
  readonly keyStatus: 'active' | 'retired' | 'revoked'
  readonly bytesLength: number
  readonly durationMs: number
  readonly redirects: number
  readonly httpStatus: number
  readonly fetchedAt: string
  /** Transport attempts used for the pack request (1 = no retry). */
  readonly attempts: number
  /** True when the pack bytes came from a signed mirror origin. */
  readonly viaMirror: boolean
}

export type MarketPackDownloadResult = MarketPackDownloadSuccess | MarketFailure

export interface MarketplaceUnpackInput {
  readonly pack: ContentMarketPack
  readonly bytes: Uint8Array
  readonly sha256: string
  readonly signal?: AbortSignal
}

/** Host callback: unzip/inspect only, no install side effects. */
export interface MarketUnpackResult {
  readonly ok: boolean
  /** Parsed pack.json object; validateContentPackV2() is applied by the client. */
  readonly pack?: unknown
  readonly code?: string
  readonly message?: string
}

export type MarketplaceUnpackHook = (input: MarketplaceUnpackInput) => MarketUnpackResult | Promise<MarketUnpackResult>

export interface MarketplaceInstallInput {
  readonly pack: ContentMarketPack
  readonly bytes: Uint8Array
  readonly sha256: string
  /** Canonical, already validated pack.json (remote signature re-verified). */
  readonly contentPack: ContentPackV2
  readonly verifiedKeyId: string
  readonly remotePackVerified: boolean
  readonly signal?: AbortSignal
}

/** Host callback: persist + merge the verified pack (the only write path). */
export interface MarketInstallOutcome {
  readonly ok: boolean
  readonly code?: string
  readonly message?: string
  readonly detail?: unknown
}

export type MarketplaceInstallHook = (
  input: MarketplaceInstallInput,
) => MarketInstallOutcome | Promise<MarketInstallOutcome>

export interface MarketPackInstallSuccess {
  readonly ok: true
  readonly packId: string
  readonly packVersion: string
  readonly contentPack: ContentPackV2
  readonly sha256: string
  readonly keyId: string
  readonly keyStatus: 'active' | 'retired' | 'revoked'
  readonly remotePackVerified: boolean
  readonly installedAt: string
  /** Opaque value returned by the injected install callback. */
  readonly detail?: unknown
}

export type MarketPackInstallResult = MarketPackInstallSuccess | MarketFailure

// ---------------------------------------------------------------------------
// Small pure helpers (bounded text, semver, timestamps)
// ---------------------------------------------------------------------------

const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const DATE_ONLY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const CONTROL_TEST = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/

function boundedMessage(value: unknown, fallback: string): string {
  const raw = typeof value === 'string' ? value : ''
  const clean = stripBidiControls(stripControlChars(raw)).replace(/\s+/g, ' ').trim()
  const text = clean.length > 0 ? clean : fallback
  return truncateCodePoints(text, MARKET_CLIENT_DEFAULTS.maxMessageChars)
}

function boundedDetailCode(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = stripBidiControls(stripControlChars(value)).trim()
  if (!clean) return undefined
  return truncateCodePoints(clean, 64)
}

function boundedId(value: unknown, fallback: string, maxChars: number): string {
  const raw = typeof value === 'string' ? value : ''
  const clean = stripBidiControls(stripControlChars(raw)).trim()
  if (!clean) return fallback
  return truncateCodePoints(clean, maxChars)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function failure(
  code: MarketFailureCode,
  message: string,
  extra: {
    readonly detailCode?: string
    readonly httpStatus?: number
    readonly host?: string
    readonly issues?: readonly MarketIssue[]
    readonly retryAfterMs?: number
  } = {},
): MarketFailure {
  const retryable =
    code === 'network-error' ||
    code === 'timeout' ||
    code === 'rate-limited' ||
    (code === 'http-error' && (extra.httpStatus === 408 || extra.httpStatus === 425 || extra.httpStatus === 429 || (extra.httpStatus ?? 0) >= 500))
  const value: { -readonly [K in keyof MarketFailure]: MarketFailure[K] } = {
    ok: false,
    code,
    message: boundedMessage(message, code),
    retryable,
  }
  if (extra.detailCode !== undefined) value.detailCode = boundedDetailCode(extra.detailCode)
  if (extra.httpStatus !== undefined) value.httpStatus = extra.httpStatus
  if (extra.host !== undefined) value.host = extra.host
  if (extra.retryAfterMs !== undefined && Number.isFinite(extra.retryAfterMs)) {
    value.retryAfterMs = Math.max(0, Math.min(MARKET_CLIENT_DEFAULTS.maxRetryAfterMs, Math.floor(extra.retryAfterMs)))
  }
  if (extra.issues !== undefined && extra.issues.length > 0) value.issues = Object.freeze(extra.issues.slice(0, MARKET_CLIENT_DEFAULTS.maxIssues))
  return Object.freeze(value)
}

function mapIssues(issues: readonly unknown[]): readonly MarketIssue[] {
  const out: MarketIssue[] = []
  for (const issue of issues) {
    if (out.length >= MARKET_CLIENT_DEFAULTS.maxIssues) break
    if (!isRecord(issue)) continue
    const path = boundedMessage(issue.path, '$')
    const code = boundedMessage(issue.code, 'invalid')
    const message = boundedMessage(issue.message, code)
    out.push(Object.freeze({ path, code, message }))
  }
  return Object.freeze(out)
}

function signatureFailure(
  verification: ContentSignatureVerification,
  context: string,
  host?: string,
): MarketFailure {
  if (verification.ok) return failure('internal-error', 'unexpected signature verification state')
  const mapped = SIGNATURE_FAILURE_CODES[verification.code] ?? 'invalid-signature'
  return failure(mapped, verification.message.length > 0 ? verification.message : context, {
    detailCode: verification.code,
    ...(host !== undefined ? { host } : {}),
  })
}

function parseSemver(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string' || !SEMVER_PATTERN.test(value)) return null
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(value)
  if (match === null) return null
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(minor) || !Number.isSafeInteger(patch)) return null
  return [major, minor, patch]
}

/** Parse catalog.updatedAt (date-only = UTC midnight) to milliseconds. */
export function parseMarketCatalogTimestamp(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  const iso = DATE_ONLY_PATTERN.test(text) ? text + 'T00:00:00Z' : text
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

/** SHA-256 identity of the canonical signed catalogue payload. */
export function marketCatalogFingerprint(catalog: ContentMarketCatalog): string {
  return sha256Hex(marketCatalogSignaturePayload(catalog))
}

/**
 * Build the anti-rollback serial + freshness state for a validated v0.2
 * catalogue. Returns null for a legacy v0.1 catalogue (no serial/expires) or
 * unparseable timestamps. The effective offline grace is clamped to the client
 * hard ceiling.
 */
export function marketCatalogSerial(
  catalog: ContentMarketCatalog,
  offlineGraceSeconds: number = MARKET_CLIENT_DEFAULTS.offlineGraceSeconds,
): MarketCatalogSerial | null {
  const current = isMarketCatalogV2(catalog)
  const updatedAtMs = parseMarketCatalogTimestamp(catalog.updatedAt)
  if (updatedAtMs === null) return null
  if (!current) {
    // Legacy v0.1 read-only helper: it has no monotonic serial/expiry. The 0
    // sentinel MUST NOT be used for ordering or install decisions; the market
    // client rejects v0.1 before it ever reaches this point.
    return Object.freeze({
      serial: 0,
      updatedAtMs,
      updatedAt: catalog.updatedAt,
      version: catalog.version,
      catalogSha256: marketCatalogFingerprint(catalog),
      expiresMs: updatedAtMs,
      offlineGraceUntilMs: updatedAtMs,
      mirrors: Object.freeze([]),
    })
  }
  const expiresMs = parseMarketCatalogTimestamp(catalog.expires)
  if (expiresMs === null) return null
  const graceSeconds = Math.max(
    0,
    Math.min(MARKET_CLIENT_HARD_LIMITS.offlineGraceSeconds, Math.floor(offlineGraceSeconds)),
  )
  return Object.freeze({
    serial: catalog.serial,
    updatedAtMs,
    updatedAt: catalog.updatedAt,
    version: catalog.version,
    catalogSha256: marketCatalogFingerprint(catalog),
    expiresMs,
    offlineGraceUntilMs: expiresMs + graceSeconds * 1000,
    mirrors: catalog.mirrors ?? Object.freeze([]),
  })
}

/**
 * Compare two catalogue serials by their monotonic serial: -1 incoming is
 * older, 0 equal ordering, 1 incoming is newer. An equal serial is only an
 * idempotent refresh when the canonical payload hash also matches (the client
 * enforces that separately).
 */
export function compareMarketCatalogSerial(
  incoming: MarketCatalogSerial,
  stored: MarketCatalogSerial,
): number {
  if (incoming.serial !== stored.serial) return incoming.serial < stored.serial ? -1 : 1
  return 0
}

function normalizeIsoTimestamp(ms: number): string {
  const date = new Date(ms)
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString()
}

function isoDateFromMs(ms: number): string {
  return normalizeIsoTimestamp(ms).slice(0, 10)
}

function hostOfUrlText(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  try {
    return new URL(raw).hostname
  } catch {
    return undefined
  }
}

function toUint8Array(input: unknown): Uint8Array | null {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) {
    try {
      return new Uint8Array(input)
    } catch {
      return null
    }
  }
  return null
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

function isAbortError(error: unknown): boolean {
  if (!isRecord(error)) return false
  return error.name === 'AbortError' || error.name === 'FetchAbortError'
}

// ---------------------------------------------------------------------------
// URL policy: scheme / credentials / fragment / private hosts / redirects
// ---------------------------------------------------------------------------

export interface MarketUrlPolicy {
  /** Tests/dev only. Production callers must leave this false. */
  readonly allowHttp?: boolean
  /** Tests/dev only (loopback/private CI servers). */
  readonly allowPrivateHosts?: boolean
  /** Optional exact hostname allow-list (catalog host restriction). */
  readonly allowedHosts?: readonly string[] | null
  readonly maxChars?: number
}

export interface ResolvedMarketUrl {
  readonly ok: true
  readonly url: URL
  readonly href: string
  readonly host: string
}

export type MarketUrlCheck = ResolvedMarketUrl | MarketFailure

function normalizeHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  if (host.endsWith('.')) host = host.slice(0, -1)
  return host
}

function parseIPv4(host: string): [number, number, number, number] | null {
  const match = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$/.exec(host)
  if (match === null) return null
  const parts: number[] = []
  for (let index = 1; index <= 4; index += 1) {
    const value = Number(match[index])
    if (!Number.isInteger(value) || value < 0 || value > 255) return null
    parts.push(value)
  }
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0]
}

function isPrivateOrReservedIPv4(parts: readonly [number, number, number, number]): boolean {
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 88 && c === 99) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a >= 224) return true
  return false
}

function expandIPv6(rawHost: string): number[] | null {
  let text = rawHost
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1)
  if (!text.includes(':')) return null
  const zone = text.indexOf('%')
  if (zone >= 0) text = text.slice(0, zone)
  const halves = text.split('::')
  if (halves.length > 2) return null
  const parseGroups = (value: string): number[] | null => {
    if (value === '') return []
    const groups = value.split(':')
    const out: number[] = []
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
      out.push(parseInt(group, 16))
    }
    return out
  }
  const head = parseGroups(halves[0] ?? '')
  if (head === null) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const tail = parseGroups(halves[1] ?? '')
  if (tail === null) return null
  const missing = 8 - head.length - tail.length
  if (missing < 1) return null
  const out = head.slice()
  for (let index = 0; index < missing; index += 1) out.push(0)
  out.push(...tail)
  return out.length === 8 ? out : null
}

function isPrivateOrReservedIPv6(groups: readonly number[]): boolean {
  if (groups.some((value) => !Number.isInteger(value) || value < 0 || value > 0xffff)) return true
  if (groups.every((value) => value === 0)) return true
  const to8 = groups.slice(0, 8)
  const allZeroPrefix = (count: number): boolean => to8.slice(0, count).every((value) => value === 0)
  // ::1 loopback
  if (allZeroPrefix(7) && to8[7] === 1) return true
  // ::ffff:0:0/96 IPv4-mapped
  if (allZeroPrefix(5) && to8[5] === 0xffff) {
    const a = (to8[6] ?? 0) >> 8
    const b = (to8[6] ?? 0) & 0xff
    const c = (to8[7] ?? 0) >> 8
    const d = (to8[7] ?? 0) & 0xff
    return isPrivateOrReservedIPv4([a, b, c, d])
  }
  const first = to8[0] ?? 0
  const second = to8[1] ?? 0
  if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true // ff00::/8 multicast
  if (first === 0x2001 && second === 0x0db8) return true // 2001:db8::/32 documentation
  if (first === 0x0100 && to8.slice(1).every((value) => value === 0)) return true // 100::/64 discard-only
  return false
}

/**
 * True for loopback, private, link-local, CGNAT, metadata and other reserved
 * hosts. DNS rebinding is out of scope for a pure function: the host is
 * responsible for its resolver policy; this rejects literal addresses and
 * well-known local names before any request is made.
 */
export function isPrivateOrLoopbackHost(rawHost: string): boolean {
  const host = normalizeHostname(rawHost)
  if (host.length === 0) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host.endsWith('.local') || host.endsWith('.internal')) return true
  if (host === 'home.arpa' || host.endsWith('.home.arpa')) return true
  if (host.includes(':')) {
    const groups = expandIPv6(host)
    return groups === null ? true : isPrivateOrReservedIPv6(groups)
  }
  const v4 = parseIPv4(host)
  if (v4 !== null) return isPrivateOrReservedIPv4(v4)
  return false
}

/**
 * Strict URL check for a catalog/pack request. This runs before the injected
 * transport is ever called, so a rejected URL cannot produce a network request.
 */
export function validateMarketRequestUrl(raw: unknown, policy: MarketUrlPolicy = {}): MarketUrlCheck {
  const maxChars = policy.maxChars ?? MARKET_CLIENT_DEFAULTS.maxUrlChars
  if (typeof raw !== 'string') return failure('invalid-url', 'URL must be a string')
  const text = raw.trim()
  if (!text) return failure('invalid-url', 'URL is empty')
  if (countCodePoints(text) > maxChars) return failure('invalid-url', 'URL is longer than ' + maxChars + ' characters')
  if (CONTROL_TEST.test(text)) return failure('invalid-url', 'URL contains control characters')
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return failure('invalid-url', 'URL is not valid')
  }
  if (url.username || url.password) return failure('url-credentials', 'credential-bearing URLs are not allowed')
  if (url.hash) return failure('url-fragment', 'URL fragments are not allowed')
  const protocol = url.protocol
  if (protocol !== 'https:' && !(protocol === 'http:' && policy.allowHttp === true)) {
    return failure('insecure-transport', 'only HTTPS URLs are allowed')
  }
  const host = normalizeHostname(url.hostname)
  if (!host) return failure('invalid-url', 'URL host is missing')
  if (policy.allowPrivateHosts !== true && isPrivateOrLoopbackHost(host)) {
    return failure('private-host', 'private/loopback/reserved hosts are not allowed without an explicit test exception', { host })
  }
  const allowed = policy.allowedHosts
  if (allowed !== undefined && allowed !== null && allowed.length > 0) {
    const matches = allowed.some((candidate) => normalizeHostname(candidate) === host)
    if (!matches) return failure('host-not-allowed', 'host is not in the configured allow-list', { host })
  }
  return Object.freeze({ ok: true, url, href: url.href, host })
}

function isRedirectStatus(status: number): boolean {
  return REDIRECT_STATUSES.includes(status)
}

function parseContentLength(response: MarketResponseLike): number | null {
  try {
    const raw = response.headers?.get(CONTENT_LENGTH_HEADER) ?? null
    if (raw === null) return null
    const value = Number(raw)
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : null
  } catch {
    return null
  }
}

/** Parse Retry-After (delta seconds or HTTP-date) into a bounded delay. */
function parseRetryAfterMs(response: MarketResponseLike, nowMs: () => number): number | undefined {
  try {
    const raw = response.headers?.get(RETRY_AFTER_HEADER) ?? null
    if (raw === null) return undefined
    const text = raw.trim()
    if (!text) return undefined
    if (/^[0-9]{1,9}$/.test(text)) {
      const seconds = Number(text)
      if (!Number.isFinite(seconds)) return undefined
      return Math.min(MARKET_CLIENT_DEFAULTS.maxRetryAfterMs, Math.floor(seconds * 1000))
    }
    const at = Date.parse(text)
    if (!Number.isFinite(at)) return undefined
    const now = nowMs()
    return Math.max(0, Math.min(MARKET_CLIENT_DEFAULTS.maxRetryAfterMs, Math.floor(at - now)))
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Bounded HTTP GET (manual redirects, timeout, size cap, abort)
// ---------------------------------------------------------------------------

interface MarketHttpRequestOptions {
  readonly maxBytes: number
  readonly accept: string
  readonly timeoutMs: number
  readonly signal?: AbortSignal
  readonly policy: MarketUrlPolicy
  readonly transport: MarketTransport
  readonly maxRedirects: number
  /** Injected clock used for Retry-After HTTP-date parsing. */
  readonly nowMs: () => number
  /** Optional client-side request budget; called before every transport attempt. */
  readonly rateGate: (() => MarketRateDecision) | null
}

interface MarketRateDecision {
  readonly ok: boolean
  readonly retryAfterMs: number
}

interface MarketHttpSuccess {
  readonly ok: true
  readonly bytes: Uint8Array
  readonly finalUrl: URL
  readonly redirects: number
  readonly httpStatus: number
  readonly statusChain: readonly number[]
  /** Transport attempts used for this body (1 unless retried). */
  readonly attempts: number
}

type MarketHttpResult = MarketHttpSuccess | MarketFailure

function buildRequestInit(signal: AbortSignal, accept: string): MarketplaceRequestInit {
  return Object.freeze({
    method: 'GET' as const,
    signal,
    redirect: 'manual' as const,
    credentials: 'omit' as const,
    cache: 'no-store' as const,
    referrerPolicy: 'no-referrer' as const,
    headers: Object.freeze({ accept }),
  })
}

async function requestMarketBytes(rawUrl: string, options: MarketHttpRequestOptions): Promise<MarketHttpResult> {
  const start = validateMarketRequestUrl(rawUrl, options.policy)
  if (!start.ok) return start
  if (options.signal?.aborted) return failure('aborted', 'request was aborted')
  if (options.rateGate !== null) {
    const decision = options.rateGate()
    if (!decision.ok) {
      return failure('rate-limited', 'client-side market request budget exhausted; retry later', {
        host: start.host,
        retryAfterMs: decision.retryAfterMs,
      })
    }
  }
  const controller = new AbortController()
  let timedOut = false
  let abortedByCaller = false
  const external = options.signal
  const onExternalAbort = (): void => {
    abortedByCaller = true
    controller.abort()
  }
  if (external !== undefined) external.addEventListener('abort', onExternalAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs)
  const mapThrown = (error: unknown): MarketFailure => {
    if (timedOut) return failure('timeout', 'request timed out after ' + options.timeoutMs + 'ms', { host: start.host })
    if (abortedByCaller || external?.aborted === true) return failure('aborted', 'request was aborted', { host: start.host })
    // The Rust transport bridge reports stable market codes (private-host,
    // too-large, redirect-insecure, ...). Preserve them instead of flattening
    // every transport failure to network-error.
    const transportCode = isRecord(error) && typeof error.code === 'string' ? error.code : ''
    if ((MARKET_FAILURE_CODES as readonly string[]).includes(transportCode)) {
      return failure(transportCode as MarketFailureCode, boundedMessage(error instanceof Error ? error.message : transportCode, 'transport failed'), {
        host: start.host,
      })
    }
    if (isAbortError(error)) return failure('timeout', 'request was aborted before completion', { host: start.host })
    return failure('network-error', 'network request failed: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'network error'), {
      host: start.host,
    })
  }
  try {
    let current = start.url
    let redirects = 0
    const statusChain: number[] = []
    for (;;) {
      let response: MarketResponseLike
      try {
        response = await options.transport(current.href, buildRequestInit(controller.signal, options.accept))
      } catch (error) {
        return mapThrown(error)
      }
      const status = typeof response.status === 'number' ? response.status : 0
      statusChain.push(status)
      if (isRedirectStatus(status)) {
        if (redirects >= options.maxRedirects) {
          return failure('redirect-limit', 'too many redirects (limit ' + options.maxRedirects + ')', { host: start.host, httpStatus: status })
        }
        let location: string | null = null
        try {
          location = response.headers?.get(LOCATION_HEADER) ?? null
        } catch {
          location = null
        }
        if (!location) return failure('redirect-invalid', 'redirect response has no Location header', { host: start.host, httpStatus: status })
        let next: URL
        try {
          next = new URL(location, current.href)
        } catch {
          return failure('redirect-invalid', 'redirect Location is not a valid URL', { host: start.host, httpStatus: status })
        }
        if (normalizeHostname(next.hostname) !== normalizeHostname(current.hostname)) {
          return failure('redirect-cross-host', 'redirects must stay on the same host', {
            host: start.host,
            httpStatus: status,
          })
        }
        if (current.protocol === 'https:' && next.protocol === 'http:') {
          return failure('redirect-insecure', 'redirects may not downgrade HTTPS to HTTP', {
            host: start.host,
            httpStatus: status,
          })
        }
        const checked = validateMarketRequestUrl(next.href, options.policy)
        if (!checked.ok) {
          return failure(checked.code, 'redirect target rejected: ' + checked.message, {
            host: start.host,
            httpStatus: status,
          })
        }
        redirects += 1
        current = checked.url
        continue
      }
      if (status < 200 || status >= 300) {
        const retryAfterMs = parseRetryAfterMs(response, options.nowMs)
        return failure('http-error', 'HTTP ' + status, {
          host: start.host,
          httpStatus: status,
          ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        })
      }
      if (typeof response.redirected === 'boolean' && response.redirected) {
        const finalUrl = typeof response.url === 'string' ? response.url : ''
        const checkedFinal = finalUrl ? validateMarketRequestUrl(finalUrl, options.policy) : null
        const sameHost = checkedFinal !== null && checkedFinal.ok && checkedFinal.host === normalizeHostname(current.hostname)
        if (!sameHost) {
          return failure('redirect-cross-host', 'transport followed an unexpected redirect', { host: start.host, httpStatus: status })
        }
      }
      const declared = parseContentLength(response)
      if (declared !== null && declared > options.maxBytes) {
        return failure('too-large', 'response declares ' + declared + ' bytes > limit ' + options.maxBytes, {
          host: start.host,
          httpStatus: status,
        })
      }
      let buffer: ArrayBuffer
      try {
        buffer = await response.arrayBuffer()
      } catch (error) {
        return mapThrown(error)
      }
      if (buffer === null || typeof buffer !== 'object' || typeof (buffer as { byteLength?: unknown }).byteLength !== 'number') {
        return failure('network-error', 'response body is not an ArrayBuffer', { host: start.host, httpStatus: status })
      }
      let bytes: Uint8Array
      try {
        bytes = new Uint8Array(buffer)
      } catch {
        return failure('network-error', 'response body could not be read', { host: start.host, httpStatus: status })
      }
      if (bytes.byteLength > options.maxBytes) {
        return failure('too-large', 'response body is ' + bytes.byteLength + ' bytes > limit ' + options.maxBytes, {
          host: start.host,
          httpStatus: status,
        })
      }
      if (bytes.byteLength === 0) {
        return failure('empty-response', 'response body is empty', { host: start.host, httpStatus: status })
      }
      return Object.freeze({
        ok: true as const,
        bytes,
        finalUrl: current,
        redirects,
        httpStatus: status,
        statusChain: Object.freeze(statusChain),
        attempts: 1,
      })
    }
  } finally {
    clearTimeout(timer)
    if (external !== undefined) external.removeEventListener('abort', onExternalAbort)
  }
}

// ---------------------------------------------------------------------------
// Bounded retry + signed-mirror fallback (v0.2 transport profile)
// ---------------------------------------------------------------------------

interface MarketRetryHooks {
  /** Injected sleep so tests/dev can run retries without real delays. */
  readonly sleep: (ms: number) => Promise<void>
  /** Injected jitter source in [0, 1); defaults to Math.random. */
  readonly random: () => number
}

interface MarketBodyFetchOutcome {
  readonly result: MarketHttpResult
  readonly attempts: number
  readonly viaMirror: boolean
}

function isRetryableMarketHttpFailure(value: MarketFailure): boolean {
  if (value.code === 'network-error' || value.code === 'timeout') return true
  if (value.code === 'http-error') return RETRYABLE_HTTP_STATUSES.includes(value.httpStatus ?? 0)
  return false
}

function backoffDelayMs(policy: ContentMarketRetryPolicy, attempt: number, random: () => number): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1)
  let jitter = 0
  try {
    const value = random()
    if (Number.isFinite(value)) jitter = Math.min(1, Math.max(0, value)) * policy.baseDelayMs * 0.5
  } catch {
    jitter = 0
  }
  return Math.min(policy.maxDelayMs, exponential + jitter)
}

/**
 * One URL with bounded retry: only transient transport failures and
 * 408/425/429/500/502/503/504 are retried; Retry-After wins over backoff.
 */
async function requestMarketBytesWithRetry(
  rawUrl: string,
  options: MarketHttpRequestOptions,
  policy: ContentMarketRetryPolicy,
  hooks: MarketRetryHooks,
): Promise<{ readonly result: MarketHttpResult; readonly attempts: number }> {
  let attempts = 0
  for (;;) {
    if (options.signal?.aborted) return { result: failure('aborted', 'request was aborted'), attempts: Math.max(1, attempts) }
    attempts += 1
    const result = await requestMarketBytes(rawUrl, options)
    if (result.ok) return { result: Object.freeze({ ...result, attempts }), attempts }
    if (!isRetryableMarketHttpFailure(result) || attempts >= policy.maxAttempts) return { result, attempts }
    const delayMs =
      result.retryAfterMs !== undefined
        ? result.retryAfterMs
        : backoffDelayMs(policy, attempts, hooks.random)
    try {
      await hooks.sleep(delayMs)
    } catch {
      return { result: failure('aborted', 'retry delay was aborted'), attempts }
    }
    if (options.signal?.aborted) return { result: failure('aborted', 'request was aborted'), attempts }
  }
}

/**
 * Fetch a bounded body with retry + signed-mirror fallback. The primary URL
 * uses the full retry policy; each signed mirror gets a single attempt (still
 * subject to the request budget) after a retryable primary failure.
 */
async function requestMarketBytesWithFallback(
  primaryUrl: string,
  mirrorUrls: readonly string[],
  options: MarketHttpRequestOptions,
  policy: ContentMarketRetryPolicy,
  hooks: MarketRetryHooks,
): Promise<MarketBodyFetchOutcome> {
  const primary = await requestMarketBytesWithRetry(primaryUrl, options, policy, hooks)
  if (primary.result.ok || !isRetryableMarketHttpFailure(primary.result)) {
    return { result: primary.result, attempts: primary.attempts, viaMirror: false }
  }
  let attempts = primary.attempts
  let lastFailure = primary.result
  for (const mirrorUrl of mirrorUrls) {
    if (options.signal?.aborted) break
    attempts += 1
    // Signed mirrors are allowed even when the host configured a catalogue host
    // allow-list: the mirror origin is part of the verified payload itself.
    const mirrorPolicy: MarketUrlPolicy = Object.freeze({
      ...(options.policy.allowHttp !== undefined ? { allowHttp: options.policy.allowHttp } : {}),
      ...(options.policy.allowPrivateHosts !== undefined ? { allowPrivateHosts: options.policy.allowPrivateHosts } : {}),
      ...(options.policy.maxChars !== undefined ? { maxChars: options.policy.maxChars } : {}),
    })
    const attempt = await requestMarketBytes(mirrorUrl, { ...options, policy: mirrorPolicy })
    if (attempt.ok) return { result: Object.freeze({ ...attempt, attempts }), attempts, viaMirror: true }
    lastFailure = attempt
    if (!isRetryableMarketHttpFailure(attempt)) break
  }
  return { result: lastFailure, attempts, viaMirror: false }
}

/** Map a primary URL onto a signed mirror origin (same path/query, cross-host by design). */
function mirrorUrlFor(primaryUrl: string, mirrorOrigin: string): string | null {
  try {
    const base = new URL(primaryUrl)
    const mirror = new URL(mirrorOrigin)
    if (mirror.protocol !== 'https:') return null
    if (mirror.pathname !== '/' || mirror.search !== '' || mirror.hash !== '') return null
    return mirror.origin + base.pathname + base.search
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Anti-rollback serial persistence
// ---------------------------------------------------------------------------

interface PersistedMarketSerial {
  readonly version: typeof MARKET_SERIAL_STORAGE_VERSION
  readonly data: {
    readonly serial: number
    readonly catalogVersion: string
    readonly updatedAt: string
    readonly updatedAtMs: number
    readonly catalogSha256: string
    readonly expiresMs: number
    readonly offlineGraceUntilMs: number
    readonly mirrors: readonly string[]
  }
}

type MarketSerialRead =
  | { readonly ok: true; readonly serial: MarketCatalogSerial | null }
  | { readonly ok: false; readonly code: 'storage-unavailable' | 'storage-corrupt'; readonly message: string }

/** Normalize a signed mirror entry to a bare HTTPS origin, or null when unsafe. */
function normalizeMirrorOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (countCodePoints(value) > CONTENT_MARKET_LIMITS.maxMirrorOriginChars) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') return null
    if (parsed.username !== '' || parsed.password !== '') return null
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return null
    return parsed.origin
  } catch {
    return null
  }
}

function validateStoredSerial(raw: unknown): MarketCatalogSerial | null {
  if (!isRecord(raw)) return null
  if (raw.version !== MARKET_SERIAL_STORAGE_VERSION) return null
  const data = raw.data
  if (!isRecord(data)) return null
  const serialValue = data.serial
  const catalogVersion = data.catalogVersion
  const updatedAt = data.updatedAt
  const updatedAtMs = data.updatedAtMs
  const catalogSha256 = data.catalogSha256
  const expiresMs = data.expiresMs
  const offlineGraceUntilMs = data.offlineGraceUntilMs
  const rawMirrors = data.mirrors
  if (typeof serialValue !== 'number' || !Number.isSafeInteger(serialValue) || serialValue < 1) return null
  if (typeof catalogVersion !== 'string' || parseSemver(catalogVersion) === null) return null
  if (typeof updatedAt !== 'string' || parseMarketCatalogTimestamp(updatedAt) === null) return null
  if (typeof updatedAtMs !== 'number' || !Number.isSafeInteger(updatedAtMs) || updatedAtMs < 0) return null
  if (typeof catalogSha256 !== 'string' || !SHA256_PATTERN.test(catalogSha256)) return null
  if (typeof expiresMs !== 'number' || !Number.isSafeInteger(expiresMs) || expiresMs < 0) return null
  if (typeof offlineGraceUntilMs !== 'number' || !Number.isSafeInteger(offlineGraceUntilMs)) return null
  if (offlineGraceUntilMs < expiresMs) return null
  if (!Array.isArray(rawMirrors) || rawMirrors.length > CONTENT_MARKET_LIMITS.maxMirrors) return null
  const mirrors: string[] = []
  for (const entry of rawMirrors) {
    const origin = normalizeMirrorOrigin(entry)
    if (origin === null || mirrors.includes(origin)) return null
    mirrors.push(origin)
  }
  return Object.freeze({
    serial: serialValue,
    updatedAtMs,
    updatedAt,
    version: catalogVersion,
    catalogSha256,
    expiresMs,
    offlineGraceUntilMs,
    mirrors: Object.freeze(mirrors),
  })
}

/**
 * Read the persisted highest serial + freshness/mirror state. Missing = null;
 * corrupted/unreadable = fail-closed storage-corrupt (the host may offer an
 * explicit ops reset). A v1 envelope is "unknown shape/version" on purpose: the
 * baseline is never silently reset.
 */
export function readMarketCatalogSerial(
  storage: StorageLike | null,
  storageKey: string = MARKET_SERIAL_STORAGE_KEY,
): MarketSerialRead {
  if (storage === null) return Object.freeze({ ok: false as const, code: 'storage-unavailable' as const, message: 'anti-rollback storage is not configured' })
  let raw: string | null
  try {
    raw = storage.getItem(storageKey)
  } catch {
    return Object.freeze({ ok: false as const, code: 'storage-unavailable' as const, message: 'anti-rollback storage is unreadable' })
  }
  if (raw === null) return Object.freeze({ ok: true as const, serial: null })
  if (raw.trim() === '') {
    return Object.freeze({ ok: false as const, code: 'storage-corrupt' as const, message: 'stored catalogue serial is empty/corrupt' })
  }
  if (countCodePoints(raw) > MARKET_CLIENT_DEFAULTS.maxSerialStorageChars) {
    return Object.freeze({ ok: false as const, code: 'storage-corrupt' as const, message: 'stored catalogue serial is too large' })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return Object.freeze({ ok: false as const, code: 'storage-corrupt' as const, message: 'stored catalogue serial is not valid JSON' })
  }
  const serial = validateStoredSerial(parsed)
  if (serial === null) {
    return Object.freeze({ ok: false as const, code: 'storage-corrupt' as const, message: 'stored catalogue serial has an unknown shape/version' })
  }
  return Object.freeze({ ok: true as const, serial })
}

function writeMarketCatalogSerial(
  storage: StorageLike,
  serial: MarketCatalogSerial,
  storageKey: string,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  const envelope: PersistedMarketSerial = {
    version: MARKET_SERIAL_STORAGE_VERSION,
    data: {
      serial: serial.serial,
      catalogVersion: serial.version,
      updatedAt: serial.updatedAt,
      updatedAtMs: serial.updatedAtMs,
      catalogSha256: serial.catalogSha256,
      expiresMs: serial.expiresMs,
      offlineGraceUntilMs: serial.offlineGraceUntilMs,
      mirrors: serial.mirrors,
    },
  }
  let text: string
  try {
    text = JSON.stringify(envelope)
  } catch {
    return Object.freeze({ ok: false as const, message: 'catalogue serial could not be serialized' })
  }
  if (countCodePoints(text) > MARKET_CLIENT_DEFAULTS.maxSerialStorageChars) {
    return Object.freeze({ ok: false as const, message: 'catalogue serial envelope is too large' })
  }
  const status = safeSetItem(storageKey, text, storage)
  if (status !== 'ok') return Object.freeze({ ok: false as const, message: 'catalogue serial write failed: ' + status })
  return Object.freeze({ ok: true as const })
}

// ---------------------------------------------------------------------------
// Bounded last-verified catalog cache (offline grace, never a trust upgrade)
// ---------------------------------------------------------------------------

interface MarketCatalogCacheEntry {
  readonly catalog: ContentMarketCatalogV2
  readonly serial: number
  readonly acceptedAtMs: number
  readonly expiresMs: number
  readonly offlineGraceUntilMs: number
  /** Wire size of the accepted catalogue body (for the offline UI summary). */
  readonly bytes: number
  readonly keyId: string
  readonly keyStatus: 'active' | 'retired' | 'revoked'
}

interface PersistedMarketCatalogCache {
  readonly version: typeof MARKET_CATALOG_CACHE_VERSION
  readonly data: {
    readonly catalog: ContentMarketCatalogV2
    readonly serial: number
    readonly acceptedAtMs: number
    readonly expiresMs: number
    readonly offlineGraceUntilMs: number
    readonly bytes: number
    readonly keyId: string
    readonly keyStatus: 'active' | 'retired' | 'revoked'
  }
}

/**
 * Best-effort cache read. Unlike the serial envelope this NEVER fails closed: a
 * corrupt/oversized cache is simply ignored (the signed serial baseline remains
 * the only security state). Crypto verification happens in the client.
 */
function readMarketCatalogCache(storage: StorageLike, storageKey: string): MarketCatalogCacheEntry | null {
  let raw: string | null
  try {
    raw = storage.getItem(storageKey)
  } catch {
    return null
  }
  if (raw === null || raw.trim() === '') return null
  if (countCodePoints(raw) > MARKET_CLIENT_DEFAULTS.maxCatalogCacheChars) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.version !== MARKET_CATALOG_CACHE_VERSION) return null
  const data = parsed.data
  if (!isRecord(data)) return null
  const validation = validateMarketCatalogV2(data.catalog)
  if (!validation.ok) return null
  const catalog = validation.catalog
  const serial = data.serial
  const acceptedAtMs = data.acceptedAtMs
  const expiresMs = data.expiresMs
  const offlineGraceUntilMs = data.offlineGraceUntilMs
  if (typeof serial !== 'number' || !Number.isSafeInteger(serial) || serial < 1 || serial !== catalog.serial) return null
  if (typeof acceptedAtMs !== 'number' || !Number.isSafeInteger(acceptedAtMs) || acceptedAtMs < 0) return null
  if (typeof expiresMs !== 'number' || !Number.isSafeInteger(expiresMs) || expiresMs < 0) return null
  if (typeof offlineGraceUntilMs !== 'number' || !Number.isSafeInteger(offlineGraceUntilMs)) return null
  if (offlineGraceUntilMs < expiresMs) return null
  const bytes = data.bytes
  const keyId = data.keyId
  const keyStatus = data.keyStatus
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) return null
  if (typeof keyId !== 'string' || !KEY_ID_PATTERN.test(keyId)) return null
  if (keyStatus !== 'active' && keyStatus !== 'retired' && keyStatus !== 'revoked') return null
  return Object.freeze({ catalog, serial, acceptedAtMs, expiresMs, offlineGraceUntilMs, bytes, keyId, keyStatus })
}

/** Best-effort cache write; a failure only means "no offline fallback". */
function writeMarketCatalogCache(storage: StorageLike, storageKey: string, entry: MarketCatalogCacheEntry): boolean {
  const envelope: PersistedMarketCatalogCache = {
    version: MARKET_CATALOG_CACHE_VERSION,
    data: {
      catalog: entry.catalog,
      serial: entry.serial,
      acceptedAtMs: entry.acceptedAtMs,
      expiresMs: entry.expiresMs,
      offlineGraceUntilMs: entry.offlineGraceUntilMs,
      bytes: entry.bytes,
      keyId: entry.keyId,
      keyStatus: entry.keyStatus,
    },
  }
  let text: string
  try {
    text = JSON.stringify(envelope)
  } catch {
    return false
  }
  if (countCodePoints(text) > MARKET_CLIENT_DEFAULTS.maxCatalogCacheChars) return false
  return safeSetItem(storageKey, text, storage) === 'ok'
}

// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

/** Host overrides for the v0.2 retry policy (clamped to the protocol bounds). */
export interface MarketRetryConfig {
  readonly maxAttempts?: number
  readonly baseDelayMs?: number
  readonly maxDelayMs?: number
}

export interface MarketplaceClientConfig {
  /** Explicit catalogue URL; there is no built-in/default market endpoint. */
  readonly catalogUrl: string
  readonly trustRoot: ContentTrustRoot
  readonly verifier: ContentEd25519Verifier
  /** Injected clock (ms since epoch); defaults to Date.now. */
  readonly now?: () => number
  /**
   * Host-injected transport (Rust/IPC bridge or a test fake). REQUIRED for any
   * networking. There is no global-fetch fallback: when this is null/undefined
   * the client is unconfigured with `transport-unavailable` and performs zero
   * requests. Injection never causes a request by itself.
   */
  readonly transport?: MarketTransport | null
  readonly timeoutMs?: number
  readonly maxCatalogBytes?: number
  readonly maxPackBytes?: number
  readonly maxRedirects?: number
  /** Concurrent pack downloads; catalogue refreshes are always serialized. */
  readonly maxConcurrentDownloads?: number
  /**
   * Auto-retry policy for catalogue/pack requests. Only transient transport
   * failures and 408/425/429/500/502/503/504 are retried, at most 3 attempts,
   * exponential backoff + jitter, honoring Retry-After.
   */
  readonly retry?: MarketRetryConfig
  /** Client-side request budget per rolling minute (1..60, default 5). */
  readonly requestsPerMinute?: number
  /** Offline grace after catalog.expires when the catalogue omits it (0..30 days, default 7 days). */
  readonly offlineGraceSeconds?: number
  /** Injected sleep for retry backoff (tests pass a no-op resolver). */
  readonly sleep?: (ms: number) => Promise<void>
  /** Injected jitter source in [0, 1); defaults to Math.random. */
  readonly random?: () => number
  /** Local storage key for the bounded last-verified catalog cache. */
  readonly catalogCacheStorageKey?: string
  /** Anti-rollback storage; required by default (null disables but fails closed). */
  readonly storage?: StorageLike | null
  readonly serialStorageKey?: string
  /** Default true: refuse to refresh when no serial storage is available. */
  readonly requireSerialStorage?: boolean
  /** Tests/dev only: permit plain HTTP transport. Production must keep false. */
  readonly allowHttp?: boolean
  /** Tests/dev only: permit loopback/private/reserved hosts. */
  readonly allowPrivateHosts?: boolean
  /** Optional exact host allow-list for the catalogue URL + its redirects. */
  readonly allowedCatalogHosts?: readonly string[]
  readonly sourceId?: string
  readonly label?: string
  /** Redacted event sink; never receives URLs, signatures or bytes. */
  readonly logger?: MarketplaceLogger
  /** Host callback: unzip + parse pack.json only (no install side effects). */
  readonly unpack?: MarketplaceUnpackHook
  /** Host callback: persist + merge the verified pack (the only write path). */
  readonly install?: MarketplaceInstallHook
}

/** Options accepted by explicit network operations (refresh/download/install). */
export interface MarketplaceRequestOptions {
  readonly signal?: AbortSignal
}

export interface MarketplaceClientDescription {
  readonly configured: boolean
  readonly sourceId: string
  readonly label: string
  /** Hostname only (no path/query), safe for logs and UI. */
  readonly catalogHost: string | null
  readonly installConfigured: boolean
  readonly warnings: readonly string[]
  readonly limits: {
    readonly timeoutMs: number
    readonly maxCatalogBytes: number
    readonly maxPackBytes: number
    readonly maxRedirects: number
    readonly maxConcurrentDownloads: number
    readonly retryMaxAttempts: number
    readonly requestsPerMinute: number
    readonly offlineGraceSeconds: number
  }
}

interface ResolvedMarketClientConfig {
  readonly catalogUrl: string
  readonly trustRoot: ContentTrustRoot
  readonly verifier: ContentEd25519Verifier
  readonly now: (() => number) | null
  readonly transport: MarketTransport
  readonly timeoutMs: number
  readonly maxCatalogBytes: number
  readonly maxPackBytes: number
  readonly maxRedirects: number
  readonly maxConcurrentDownloads: number
  readonly retry: ContentMarketRetryPolicy
  readonly requestsPerMinute: number
  readonly offlineGraceSeconds: number
  readonly sleep: (ms: number) => Promise<void>
  readonly random: () => number
  readonly catalogCacheStorageKey: string
  readonly storage: StorageLike | null
  readonly serialStorageKey: string
  readonly requireSerialStorage: boolean
  readonly allowHttp: boolean
  readonly allowPrivateHosts: boolean
  readonly allowedCatalogHosts: readonly string[] | null
  readonly logger: MarketplaceLogger | null
  readonly unpack: MarketplaceUnpackHook | null
  readonly install: MarketplaceInstallHook | null
}

interface ResolvedMarketClient {
  readonly sourceId: string
  readonly label: string
  readonly config: ResolvedMarketClientConfig | null
  readonly failure: MarketFailure | null
  readonly warnings: readonly string[]
}

function resolveInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const rounded = Math.floor(value)
  if (rounded < min) return fallback
  return Math.min(max, rounded)
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
  return typeof value === 'function'
}

/** Default retry sleep; tests inject an immediate resolver instead. */
function defaultMarketSleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, Math.floor(ms)))
  })
}

function isStorageLike(value: unknown): value is StorageLike {
  if (!isRecord(value)) return false
  return typeof value.getItem === 'function' && typeof value.setItem === 'function' && typeof value.removeItem === 'function'
}

function isValidTrustRoot(raw: unknown): raw is ContentTrustRoot {
  if (!isRecord(raw)) return false
  const keys = raw.keys
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 16) return false
  for (const key of keys) {
    if (!isRecord(key)) return false
    if (typeof key.keyId !== 'string' || !KEY_ID_PATTERN.test(key.keyId)) return false
    if (key.algorithm !== 'ed25519') return false
    if (typeof key.publicKeyPem !== 'string' || key.publicKeyPem.length < 32 || key.publicKeyPem.length > 4096) return false
    if (key.status !== 'active' && key.status !== 'retired' && key.status !== 'revoked') return false
    for (const field of ['notBefore', 'notAfter'] as const) {
      const value = key[field]
      if (value === undefined) continue
      if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value) || parseMarketCatalogTimestamp(value) === null) return false
    }
  }
  return true
}

function normalizeHostAllowList(raw: unknown): readonly string[] | null {
  if (raw === undefined) return null
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const entry of raw) {
    if (typeof entry !== 'string') return null
    const host = normalizeHostname(entry)
    if (host.length === 0 || host.length > 253) return null
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(host)) return null
    if (!out.includes(host)) out.push(host)
  }
  return Object.freeze(out.length > 0 ? out : [])
}

function resolveMarketClientConfig(raw: unknown): ResolvedMarketClient {
  const sourceId = boundedId(isRecord(raw) ? raw.sourceId : undefined, 'remote-market', 64)
  const label = boundedId(isRecord(raw) ? raw.label : undefined, '远程内容市场', 80)
  const reject = (code: MarketFailureCode, message: string): ResolvedMarketClient => Object.freeze({
    sourceId,
    label,
    config: null,
    failure: failure(code, message),
    warnings: Object.freeze([]),
  })
  if (!isRecord(raw)) return reject('invalid-config', 'marketplace client config must be an object')
  const catalogUrlRaw = raw.catalogUrl
  if (typeof catalogUrlRaw !== 'string' || catalogUrlRaw.trim() === '') {
    return reject('not-configured', 'remote market is not configured: catalogUrl is required')
  }
  const catalogUrl = catalogUrlRaw.trim()
  if (countCodePoints(catalogUrl) > MARKET_CLIENT_DEFAULTS.maxUrlChars || CONTROL_TEST.test(catalogUrl)) {
    return reject('invalid-config', 'catalogUrl is too long or contains control characters')
  }
  if (!isValidTrustRoot(raw.trustRoot)) {
    return reject('invalid-config', 'trustRoot must contain 1..16 valid ed25519 key records')
  }
  if (!isRecord(raw.verifier) || !isFunction(raw.verifier.verify)) {
    return reject('invalid-config', 'verifier.verify() must be injected')
  }
  if (raw.transport !== undefined && raw.transport !== null && !isFunction(raw.transport)) {
    return reject('invalid-config', 'transport must be a function')
  }
  if (raw.now !== undefined && !isFunction(raw.now)) return reject('invalid-config', 'now must be a function')
  if (raw.logger !== undefined && !isFunction(raw.logger)) return reject('invalid-config', 'logger must be a function')
  if (raw.storage !== undefined && raw.storage !== null && !isStorageLike(raw.storage)) {
    return reject('invalid-config', 'storage must implement getItem/setItem/removeItem')
  }
  if (raw.unpack !== undefined && !isFunction(raw.unpack)) return reject('invalid-config', 'unpack must be a function')
  if (raw.install !== undefined && !isFunction(raw.install)) return reject('invalid-config', 'install must be a function')
  if (raw.allowHttp !== undefined && typeof raw.allowHttp !== 'boolean') return reject('invalid-config', 'allowHttp must be a boolean')
  if (raw.allowPrivateHosts !== undefined && typeof raw.allowPrivateHosts !== 'boolean') {
    return reject('invalid-config', 'allowPrivateHosts must be a boolean')
  }
  if (raw.requireSerialStorage !== undefined && typeof raw.requireSerialStorage !== 'boolean') {
    return reject('invalid-config', 'requireSerialStorage must be a boolean')
  }
  if (raw.sleep !== undefined && !isFunction(raw.sleep)) return reject('invalid-config', 'sleep must be a function')
  if (raw.random !== undefined && !isFunction(raw.random)) return reject('invalid-config', 'random must be a function')
  let retry: ContentMarketRetryPolicy = Object.freeze({
    maxAttempts: MARKET_CLIENT_DEFAULTS.retryMaxAttempts,
    baseDelayMs: MARKET_CLIENT_DEFAULTS.retryBaseDelayMs,
    maxDelayMs: MARKET_CLIENT_DEFAULTS.retryMaxDelayMs,
  })
  if (raw.retry !== undefined) {
    if (!isRecord(raw.retry)) return reject('invalid-config', 'retry must be an object')
    for (const field of ['maxAttempts', 'baseDelayMs', 'maxDelayMs'] as const) {
      const value = raw.retry[field]
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) {
        return reject('invalid-config', 'retry.' + field + ' must be a finite number')
      }
    }
    const maxAttempts = resolveInteger(raw.retry.maxAttempts, retry.maxAttempts, 1, MARKET_CLIENT_HARD_LIMITS.retryMaxAttempts)
    const baseDelayMs = resolveInteger(
      raw.retry.baseDelayMs,
      retry.baseDelayMs,
      CONTENT_MARKET_LIMITS.minRetryDelayMs,
      MARKET_CLIENT_HARD_LIMITS.retryBaseDelayMs,
    )
    const maxDelayMs = resolveInteger(
      raw.retry.maxDelayMs,
      Math.max(baseDelayMs, retry.maxDelayMs),
      baseDelayMs,
      MARKET_CLIENT_HARD_LIMITS.retryMaxDelayMs,
    )
    retry = Object.freeze({ maxAttempts, baseDelayMs, maxDelayMs })
  }
  const requestsPerMinute = resolveInteger(
    raw.requestsPerMinute,
    MARKET_CLIENT_DEFAULTS.requestsPerMinute,
    1,
    MARKET_CLIENT_HARD_LIMITS.requestsPerMinute,
  )
  const offlineGraceSeconds = resolveInteger(
    raw.offlineGraceSeconds,
    MARKET_CLIENT_DEFAULTS.offlineGraceSeconds,
    0,
    MARKET_CLIENT_HARD_LIMITS.offlineGraceSeconds,
  )
  let catalogCacheStorageKey = MARKET_CATALOG_CACHE_STORAGE_KEY
  if (raw.catalogCacheStorageKey !== undefined) {
    if (typeof raw.catalogCacheStorageKey !== 'string') return reject('invalid-config', 'catalogCacheStorageKey must be a string')
    const trimmed = raw.catalogCacheStorageKey.trim()
    if (!trimmed || countCodePoints(trimmed) > 128 || CONTROL_TEST.test(trimmed)) {
      return reject('invalid-config', 'catalogCacheStorageKey is invalid')
    }
    catalogCacheStorageKey = trimmed
  }
  let allowedCatalogHosts: readonly string[] | null = null
  if (raw.allowedCatalogHosts !== undefined) {
    allowedCatalogHosts = normalizeHostAllowList(raw.allowedCatalogHosts)
    if (allowedCatalogHosts === null) return reject('invalid-config', 'allowedCatalogHosts must be an array of hostnames')
  }
  let serialStorageKey = MARKET_SERIAL_STORAGE_KEY
  if (raw.serialStorageKey !== undefined) {
    if (typeof raw.serialStorageKey !== 'string') return reject('invalid-config', 'serialStorageKey must be a string')
    const trimmed = raw.serialStorageKey.trim()
    if (!trimmed || countCodePoints(trimmed) > 128 || CONTROL_TEST.test(trimmed)) {
      return reject('invalid-config', 'serialStorageKey is invalid')
    }
    serialStorageKey = trimmed
  }
  // The network fuse: no host-injected transport => never fetch anything. This is
  // checked after the other config fields so a malformed config keeps reporting
  // invalid-config, while an otherwise-valid config without transport stays
  // offline and reports the dedicated transport-unavailable code.
  if (raw.transport === undefined || raw.transport === null) {
    return reject('transport-unavailable', 'market transport is not injected; this build performs zero network requests')
  }
  const storage = raw.storage === null || raw.storage === undefined ? null : (raw.storage as StorageLike)
  const requireSerialStorage = raw.requireSerialStorage !== false
  const allowHttp = raw.allowHttp === true
  const allowPrivateHosts = raw.allowPrivateHosts === true
  const warnings: string[] = []
  if (allowHttp) warnings.push('allowHttp=true is a test/dev exception; production must stay HTTPS-only.')
  if (allowPrivateHosts) warnings.push('allowPrivateHosts=true is a test/dev exception; production must reject private/loopback hosts.')
  if (storage === null) warnings.push('No anti-rollback storage injected; catalogue serial persistence is disabled.')
  const config: ResolvedMarketClientConfig = Object.freeze({
    catalogUrl,
    trustRoot: raw.trustRoot,
    verifier: raw.verifier as unknown as ContentEd25519Verifier,
    now: isFunction(raw.now) ? (raw.now as () => number) : null,
    transport: raw.transport as unknown as MarketTransport,
    timeoutMs: resolveInteger(raw.timeoutMs, MARKET_CLIENT_DEFAULTS.timeoutMs, 1, MARKET_CLIENT_HARD_LIMITS.timeoutMs),
    maxCatalogBytes: resolveInteger(
      raw.maxCatalogBytes,
      MARKET_CLIENT_DEFAULTS.maxCatalogBytes,
      1,
      MARKET_CLIENT_HARD_LIMITS.maxCatalogBytes,
    ),
    maxPackBytes: resolveInteger(raw.maxPackBytes, MARKET_CLIENT_DEFAULTS.maxPackBytes, 1, MARKET_CLIENT_HARD_LIMITS.maxPackBytes),
    maxRedirects: resolveInteger(raw.maxRedirects, MARKET_CLIENT_DEFAULTS.maxRedirects, 0, MARKET_CLIENT_HARD_LIMITS.maxRedirects),
    maxConcurrentDownloads: resolveInteger(
      raw.maxConcurrentDownloads,
      MARKET_CLIENT_DEFAULTS.maxConcurrentDownloads,
      1,
      MARKET_CLIENT_HARD_LIMITS.maxConcurrentDownloads,
    ),
    retry,
    requestsPerMinute,
    offlineGraceSeconds,
    sleep: isFunction(raw.sleep) ? (raw.sleep as (ms: number) => Promise<void>) : defaultMarketSleep,
    random: isFunction(raw.random) ? (raw.random as () => number) : Math.random,
    catalogCacheStorageKey,
    storage,
    serialStorageKey,
    requireSerialStorage,
    allowHttp,
    allowPrivateHosts,
    allowedCatalogHosts,
    logger: isFunction(raw.logger) ? (raw.logger as MarketplaceLogger) : null,
    unpack: isFunction(raw.unpack) ? (raw.unpack as MarketplaceUnpackHook) : null,
    install: isFunction(raw.install) ? (raw.install as MarketplaceInstallHook) : null,
  })
  return Object.freeze({ sourceId, label, config, failure: null, warnings: Object.freeze(warnings) })
}

// ---------------------------------------------------------------------------
// MarketplaceClient
// ---------------------------------------------------------------------------

function sameMarketPack(listing: ContentMarketPack, candidate: ContentMarketPack): boolean {
  if (listing === candidate) return true
  if (!isRecord(candidate) || !isRecord(candidate.signature)) return false
  if (listing.id !== candidate.id) return false
  if (listing.signature.keyId !== candidate.signature.keyId) return false
  if (listing.signature.value !== candidate.signature.value) return false
  try {
    return marketPackSignaturePayload(listing) === marketPackSignaturePayload(candidate)
  } catch {
    return false
  }
}

/**
 * Remote content market client. All transport/verification state lives here;
 * no method runs unless the host calls it explicitly.
 */
export class MarketplaceClient {
  readonly sourceId: string
  readonly label: string
  private readonly resolvedConfig: ResolvedMarketClientConfig | null
  private readonly failureValue: MarketFailure | null
  private readonly warningsValue: readonly string[]
  private lastCatalogValue: ContentMarketCatalogV2 | null = null
  private lastSerialValue: MarketCatalogSerial | null = null
  private refreshTail: Promise<void> = Promise.resolve()
  /** Timestamps (ms) of recent market requests for the client-side rate budget. */
  private readonly rateWindow: number[] = []
  private downloadActive = 0
  private readonly downloadWaiters: Array<() => void> = []

  constructor(config: MarketplaceClientConfig) {
    const resolved = resolveMarketClientConfig(config)
    this.sourceId = resolved.sourceId
    this.label = resolved.label
    this.resolvedConfig = resolved.config
    this.failureValue = resolved.failure
    this.warningsValue = resolved.warnings
    if (resolved.config !== null) {
      for (const warning of resolved.warnings) this.log('warn', 'config', { code: 'configuration-warning', detail: warning })
    }
  }

  get configured(): boolean {
    return this.resolvedConfig !== null
  }

  get configurationFailure(): MarketFailure | null {
    return this.failureValue
  }

  get configurationWarnings(): readonly string[] {
    return this.warningsValue
  }

  get installConfigured(): boolean {
    return this.resolvedConfig !== null && this.resolvedConfig.unpack !== null && this.resolvedConfig.install !== null
  }

  get lastCatalog(): ContentMarketCatalog | null {
    return this.lastCatalogValue
  }

  get lastSerial(): MarketCatalogSerial | null {
    return this.lastSerialValue
  }

  /** Hostname only; safe for status lines and logs. */
  get catalogHost(): string | null {
    return this.resolvedConfig === null ? null : hostOfUrlText(this.resolvedConfig.catalogUrl) ?? null
  }

  describe(): MarketplaceClientDescription {
    const config = this.resolvedConfig
    const limits = {
      timeoutMs: config?.timeoutMs ?? MARKET_CLIENT_DEFAULTS.timeoutMs,
      maxCatalogBytes: config?.maxCatalogBytes ?? MARKET_CLIENT_DEFAULTS.maxCatalogBytes,
      maxPackBytes: config?.maxPackBytes ?? MARKET_CLIENT_DEFAULTS.maxPackBytes,
      maxRedirects: config?.maxRedirects ?? MARKET_CLIENT_DEFAULTS.maxRedirects,
      maxConcurrentDownloads: config?.maxConcurrentDownloads ?? MARKET_CLIENT_DEFAULTS.maxConcurrentDownloads,
      retryMaxAttempts: config?.retry.maxAttempts ?? MARKET_CLIENT_DEFAULTS.retryMaxAttempts,
      requestsPerMinute: config?.requestsPerMinute ?? MARKET_CLIENT_DEFAULTS.requestsPerMinute,
      offlineGraceSeconds: config?.offlineGraceSeconds ?? MARKET_CLIENT_DEFAULTS.offlineGraceSeconds,
    }
    return Object.freeze({
      configured: config !== null,
      sourceId: this.sourceId,
      label: this.label,
      catalogHost: this.catalogHost,
      installConfigured: this.installConfigured,
      warnings: this.warningsValue,
      limits: Object.freeze(limits),
    })
  }

  /**
   * Fetch + validate + verify the catalogue and persist its serial. Concurrent
   * calls are serialized (never parallel) so the anti-rollback baseline cannot
   * race. This is the ONLY method that performs the catalogue request.
   */
  refreshCatalog(options: MarketplaceRequestOptions = {}): Promise<MarketCatalogRefreshResult> {
    const run = this.refreshTail
      .then(
        () => this.performRefresh(options),
        () => this.performRefresh(options),
      )
      .catch((error: unknown) =>
        failure('internal-error', 'catalogue refresh failed unexpectedly: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error')),
      )
    this.refreshTail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /**
   * Download a pack from the last verified catalogue. Only the exact URL of
   * that signed entry is requested; size, declared byte length, SHA-256 and the
   * detached Ed25519 pack signature are all enforced before bytes are returned.
   */
  async downloadPack(pack: ContentMarketPack, options: MarketplaceRequestOptions = {}): Promise<MarketPackDownloadResult> {
    const config = this.resolvedConfig
    if (config === null) return this.configurationFailureValue()
    const resolved = this.resolveCatalogPack(pack)
    if (!resolved.ok) return resolved
    const listing = resolved.pack
    const urlCheck = validateMarketRequestUrl(listing.download.url, this.urlPolicy(false))
    if (!urlCheck.ok) return urlCheck
    if (this.currentCatalogFreshness() === 'expired') {
      return failure('catalog-expired', 'the verified catalogue expired beyond its offline grace; new downloads are disabled', {
        host: urlCheck.host,
      })
    }
    if (options.signal?.aborted) return failure('aborted', 'request was aborted', { host: urlCheck.host })
    if (listing.download.bytes > config.maxPackBytes) {
      return failure('too-large', 'catalogue pack is ' + listing.download.bytes + ' bytes > limit ' + config.maxPackBytes, {
        host: urlCheck.host,
      })
    }
    await this.acquireDownloadSlot()
    try {
      const startedAt = this.nowMs()
      let outcome: MarketBodyFetchOutcome
      try {
        outcome = await requestMarketBytesWithFallback(
          listing.download.url,
          this.mirrorUrlsFor(listing.download.url, this.lastSerialValue?.mirrors ?? []),
          {
            maxBytes: config.maxPackBytes,
            accept: 'application/zip, application/octet-stream',
            timeoutMs: config.timeoutMs,
            ...(options.signal !== undefined ? { signal: options.signal } : {}),
            policy: this.urlPolicy(false),
            transport: config.transport,
            maxRedirects: config.maxRedirects,
            nowMs: () => this.nowMs(),
            rateGate: () => this.rateGate(),
          },
          this.effectiveRetryPolicy(),
          { sleep: config.sleep, random: config.random },
        )
      } catch (error) {
        return failure('internal-error', 'pack request failed unexpectedly: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'), {
          host: urlCheck.host,
        })
      }
      const request = outcome.result
      const durationMs = Math.max(0, this.nowMs() - startedAt)
      if (!request.ok) {
        this.logFailure('pack-download', request, durationMs)
        return request
      }
      const host = request.finalUrl.hostname
      if (request.bytes.byteLength !== listing.download.bytes) {
        const result = failure(
          'size-mismatch',
          'downloaded zip is ' + request.bytes.byteLength + ' bytes but the signed catalogue declares ' + listing.download.bytes,
          { host },
        )
        this.logFailure('pack-download', result, durationMs)
        return result
      }
      const sha256 = sha256Hex(request.bytes)
      let verification: ContentSignatureVerification
      try {
        verification = verifyMarketPackDownload(listing, sha256, config.trustRoot, config.verifier, { now: this.nowDate() })
      } catch (error) {
        const result = failure('invalid-signature', 'pack verification threw: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'), {
          host,
        })
        this.logFailure('pack-download', result, durationMs)
        return result
      }
      if (!verification.ok) {
        const result = signatureFailure(verification, 'pack signature verification failed', host)
        this.logFailure('pack-download', result, durationMs)
        return result
      }
      this.log('info', 'pack-download', {
        code: 'ok',
        host,
        httpStatus: request.httpStatus,
        bytes: request.bytes.byteLength,
        durationMs,
        redirects: request.redirects,
        keyId: verification.keyId,
        attempts: outcome.attempts,
      })
      return Object.freeze({
        ok: true as const,
        pack: listing,
        bytes: request.bytes,
        sha256,
        keyId: verification.keyId,
        keyStatus: verification.status,
        bytesLength: request.bytes.byteLength,
        durationMs,
        redirects: request.redirects,
        httpStatus: request.httpStatus,
        fetchedAt: normalizeIsoTimestamp(this.nowMs()),
        attempts: outcome.attempts,
        viaMirror: outcome.viaMirror,
      })
    } finally {
      this.releaseDownloadSlot()
    }
  }

  /**
   * Hand verified bytes to the injected unpack/install callbacks. This module
   * never writes to disk. A pack.json with source 'remote' must additionally
   * pass verifyRemoteContentPack() before the install callback is invoked.
   * User confirmation (canonical usage declaration) is the caller's job.
   */
  async installPack(
    pack: ContentMarketPack,
    bytesInput: Uint8Array | ArrayBuffer,
    options: MarketplaceRequestOptions = {},
  ): Promise<MarketPackInstallResult> {
    const config = this.resolvedConfig
    if (config === null) return this.configurationFailureValue()
    if (config.unpack === null || config.install === null) {
      return failure('install-unconfigured', 'host did not inject unpack/install callbacks; nothing was installed')
    }
    const resolved = this.resolveCatalogPack(pack)
    if (!resolved.ok) return resolved
    const listing = resolved.pack
    if (this.currentCatalogFreshness() === 'expired') {
      return failure('catalog-expired', 'the verified catalogue expired beyond its offline grace; new installs are disabled', {
        host: hostOfUrlText(listing.download.url),
      })
    }
    const bytes = toUint8Array(bytesInput)
    if (bytes === null) return failure('invalid-argument', 'pack bytes must be a Uint8Array or ArrayBuffer')
    if (options.signal?.aborted) return failure('aborted', 'install was aborted')
    if (bytes.byteLength !== listing.download.bytes) {
      return failure('size-mismatch', 'bytes are ' + bytes.byteLength + ' bytes but the signed catalogue declares ' + listing.download.bytes, {
        host: hostOfUrlText(listing.download.url),
      })
    }
    const sha256 = sha256Hex(bytes)
    let downloadVerification: ContentSignatureVerification
    try {
      downloadVerification = verifyMarketPackDownload(listing, sha256, config.trustRoot, config.verifier, { now: this.nowDate() })
    } catch (error) {
      return failure('invalid-signature', 'pack verification threw: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'))
    }
    if (!downloadVerification.ok) return signatureFailure(downloadVerification, 'pack signature verification failed')
    const startedAt = this.nowMs()
    let unpacked: MarketUnpackResult
    try {
      unpacked = await config.unpack({
        pack: listing,
        bytes,
        sha256,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      })
    } catch (error) {
      return failure('unpack-failed', 'unpack callback threw: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'))
    }
    if (!isRecord(unpacked) || unpacked.ok !== true || unpacked.pack === undefined) {
      return failure('unpack-failed', 'unpack callback did not return a pack.json', {
        ...(boundedDetailCode(isRecord(unpacked) ? unpacked.code : undefined) !== undefined
          ? { detailCode: boundedDetailCode(isRecord(unpacked) ? unpacked.code : undefined) as string }
          : {}),
      })
    }
    let packValidation: ReturnType<typeof validateContentPackV2>
    try {
      packValidation = validateContentPackV2(unpacked.pack)
    } catch (error) {
      return failure('pack-invalid', 'pack.json validation threw: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'))
    }
    if (!packValidation.ok) {
      return failure('pack-invalid', 'unpacked pack.json failed validation', { issues: mapIssues(packValidation.issues) })
    }
    const contentPack = packValidation.pack
    let remotePackVerified = false
    if (contentPack.source === 'remote') {
      let remoteVerification: ContentSignatureVerification
      try {
        remoteVerification = verifyRemoteContentPack(contentPack, config.trustRoot, config.verifier, { now: this.nowDate() })
      } catch (error) {
        return failure('invalid-signature', 'remote pack verification threw: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'))
      }
      if (!remoteVerification.ok) {
        return signatureFailure(remoteVerification, 'remote pack.json signature verification failed')
      }
      remotePackVerified = true
    }
    let outcome: MarketInstallOutcome
    try {
      outcome = await config.install({
        pack: listing,
        bytes,
        sha256,
        contentPack,
        verifiedKeyId: downloadVerification.keyId,
        remotePackVerified,
        ...(options.signal !== undefined ? { signal: options.signal } : {}),
      })
    } catch (error) {
      return failure('install-failed', 'install callback threw: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'))
    }
    const durationMs = Math.max(0, this.nowMs() - startedAt)
    if (!isRecord(outcome) || outcome.ok !== true) {
      const result = failure('install-failed', isRecord(outcome) && typeof outcome.message === 'string' ? outcome.message : 'install callback refused the pack', {
        ...(isRecord(outcome) && boundedDetailCode(outcome.code) !== undefined
          ? { detailCode: boundedDetailCode(outcome.code) as string }
          : {}),
      })
      this.logFailure('pack-install', result, durationMs)
      return result
    }
    this.log('info', 'pack-install', {
      code: 'ok',
      host: hostOfUrlText(listing.download.url),
      bytes: bytes.byteLength,
      durationMs,
      keyId: downloadVerification.keyId,
    })
    const success: { -readonly [K in keyof MarketPackInstallSuccess]: MarketPackInstallSuccess[K] } = {
      ok: true,
      packId: listing.id,
      packVersion: listing.version,
      contentPack,
      sha256,
      keyId: downloadVerification.keyId,
      keyStatus: downloadVerification.status,
      remotePackVerified,
      installedAt: normalizeIsoTimestamp(this.nowMs()),
    }
    if (isRecord(outcome) && outcome.detail !== undefined) success.detail = outcome.detail
    return Object.freeze(success)
  }

  /**
   * Explicit ops escape hatch: forget the persisted highest serial (only for a
   * documented recovery after a storage corruption; never automatic).
   */
  resetRollbackProtection(): { readonly ok: boolean; readonly message: string; readonly code?: MarketFailureCode } {
    const config = this.resolvedConfig
    if (config === null) {
      return Object.freeze({ ok: false as const, message: 'marketplace client is not configured', code: this.failureValue?.code ?? 'not-configured' })
    }
    if (config.storage === null) {
      return Object.freeze({ ok: false as const, message: 'no anti-rollback storage is configured', code: 'storage-unavailable' as const })
    }
    const removed = safeRemoveItem(config.serialStorageKey, config.storage)
    if (!removed) {
      return Object.freeze({ ok: false as const, message: 'stored catalogue serial could not be removed', code: 'storage-unavailable' as const })
    }
    // The cached catalog is bound to the old baseline; drop it too (best effort).
    safeRemoveItem(config.catalogCacheStorageKey, config.storage)
    this.lastCatalogValue = null
    this.lastSerialValue = null
    this.log('warn', 'serial-reset', { code: 'serial-reset' })
    return Object.freeze({ ok: true as const, message: 'catalogue serial reset; the next refresh starts a new anti-rollback baseline' })
  }

  // --- internals ----------------------------------------------------------

  private configurationFailureValue(): MarketFailure {
    return this.failureValue ?? failure('not-configured', 'remote market is not configured')
  }

  private resolveCatalogPack(pack: ContentMarketPack): { readonly ok: true; readonly pack: ContentMarketPack } | MarketFailure {
    if (!isRecord(pack) || typeof pack.id !== 'string') return failure('invalid-argument', 'pack must be a catalogue entry object')
    const catalog = this.lastCatalogValue
    if (catalog === null) return failure('pack-not-in-catalog', 'refresh the verified market catalogue before downloading/installing a pack')
    const listing = catalog.packs.find((entry) => entry.id === pack.id)
    if (listing === undefined) return failure('pack-not-in-catalog', 'pack is not listed in the verified market catalogue')
    if (!sameMarketPack(listing, pack)) {
      return failure('pack-not-in-catalog', 'pack entry does not match the signed catalogue (id/version/url/sha/signature)')
    }
    return Object.freeze({ ok: true as const, pack: listing })
  }

  /**
   * Effective offline grace: the host config is the ceiling; a signed catalogue
   * may only request a shorter window (never a longer one than the host allows).
   */
  private effectiveOfflineGraceSeconds(catalog?: ContentMarketCatalogV2): number {
    const hostGrace = this.resolvedConfig?.offlineGraceSeconds ?? MARKET_CLIENT_DEFAULTS.offlineGraceSeconds
    const catalogGrace = catalog?.offlineGraceSeconds
    return catalogGrace === undefined ? hostGrace : Math.min(hostGrace, catalogGrace)
  }

  /** Freshness of the currently adopted serial at the injected clock. */
  private currentCatalogFreshness(): 'fresh' | 'grace' | 'expired' {
    const serial = this.lastSerialValue
    if (serial === null) return 'expired'
    return this.freshnessFor(serial.expiresMs, serial.offlineGraceUntilMs)
  }

  private freshnessFor(expiresMs: number, offlineGraceUntilMs: number): 'fresh' | 'grace' | 'expired' {
    const now = this.nowMs()
    if (now <= expiresMs) return 'fresh'
    if (now <= offlineGraceUntilMs) return 'grace'
    return 'expired'
  }

  /**
   * Effective retry policy: the host config is the ceiling, a signed catalogue
   * may only make it more conservative (fewer attempts, longer base delay).
   */
  private effectiveRetryPolicy(): ContentMarketRetryPolicy {
    const config = this.resolvedConfig
    const hostPolicy: ContentMarketRetryPolicy =
      config === null
        ? Object.freeze({
            maxAttempts: MARKET_CLIENT_DEFAULTS.retryMaxAttempts,
            baseDelayMs: MARKET_CLIENT_DEFAULTS.retryBaseDelayMs,
            maxDelayMs: MARKET_CLIENT_DEFAULTS.retryMaxDelayMs,
          })
        : config.retry
    const catalogPolicy = this.lastCatalogValue?.retry
    if (catalogPolicy === undefined) return hostPolicy
    const baseDelayMs = Math.max(hostPolicy.baseDelayMs, catalogPolicy.baseDelayMs)
    return Object.freeze({
      maxAttempts: Math.min(hostPolicy.maxAttempts, catalogPolicy.maxAttempts),
      baseDelayMs,
      maxDelayMs: Math.max(baseDelayMs, Math.min(hostPolicy.maxDelayMs, catalogPolicy.maxDelayMs)),
    })
  }

  /** Request budget: the host cap lowered by a signed catalogue when present. */
  private effectiveRequestsPerMinute(): number {
    const host = this.resolvedConfig?.requestsPerMinute ?? MARKET_CLIENT_DEFAULTS.requestsPerMinute
    const catalogLimit = this.lastCatalogValue?.rateLimit?.requestsPerMinute
    return catalogLimit === undefined ? host : Math.min(host, catalogLimit)
  }

  /** Download concurrency: the host cap lowered by a signed catalogue when present. */
  private effectiveMaxConcurrentDownloads(): number {
    const host = this.resolvedConfig?.maxConcurrentDownloads ?? MARKET_CLIENT_DEFAULTS.maxConcurrentDownloads
    const catalogLimit = this.lastCatalogValue?.rateLimit?.maxConcurrentDownloads
    return catalogLimit === undefined ? host : Math.min(host, catalogLimit)
  }

  /** Rolling-window request budget; a denied request never reaches the transport. */
  private rateGate(): MarketRateDecision {
    const limit = Math.max(1, this.effectiveRequestsPerMinute())
    const now = this.nowMs()
    const windowMs = MARKET_CLIENT_DEFAULTS.rateLimitWindowMs
    while (this.rateWindow.length > 0 && (this.rateWindow[0] ?? now) <= now - windowMs) this.rateWindow.shift()
    if (this.rateWindow.length >= limit) {
      const oldest = this.rateWindow[0] ?? now
      return Object.freeze({
        ok: false,
        retryAfterMs: Math.max(0, Math.min(MARKET_CLIENT_DEFAULTS.maxRetryAfterMs, oldest + windowMs - now)),
      })
    }
    this.rateWindow.push(now)
    return Object.freeze({ ok: true, retryAfterMs: 0 })
  }

  /** Map signed mirror origins onto one primary URL (bounded, HTTPS only). */
  private mirrorUrlsFor(primaryUrl: string, mirrors: readonly string[]): readonly string[] {
    const urls: string[] = []
    for (const mirror of mirrors) {
      const candidate = mirrorUrlFor(primaryUrl, mirror)
      if (candidate !== null && !urls.includes(candidate)) urls.push(candidate)
    }
    return Object.freeze(urls)
  }

  /**
   * Load + re-verify the bounded cached catalog. Best effort: a corrupt or
   * no-longer-valid cache is ignored (a cache is never a trust upgrade).
   */
  private loadCachedCatalog(config: ResolvedMarketClientConfig, host: string): MarketCatalogCacheEntry | null {
    if (config.storage === null) return null
    const entry = readMarketCatalogCache(config.storage, config.catalogCacheStorageKey)
    if (entry === null) return null
    let verification: ContentSignatureVerification
    try {
      verification = verifyMarketCatalogSignature(entry.catalog, config.trustRoot, config.verifier, { now: this.nowDate() })
    } catch {
      this.log('warn', 'catalog-cache', { code: 'cache-verification-failed', host })
      return null
    }
    if (!verification.ok) {
      this.log('warn', 'catalog-cache', { code: 'cache-signature-rejected', detail: verification.code, host })
      return null
    }
    if (marketCatalogSerial(entry.catalog, this.effectiveOfflineGraceSeconds(entry.catalog)) === null) return null
    return entry
  }

  /** Persist the accepted catalog as the bounded offline fallback (best effort). */
  private rememberCatalog(
    config: ResolvedMarketClientConfig,
    catalog: ContentMarketCatalogV2,
    serial: MarketCatalogSerial,
    bytes: number,
    keyId: string,
    keyStatus: 'active' | 'retired' | 'revoked',
    host: string,
  ): void {
    if (config.storage === null) return
    const entry: MarketCatalogCacheEntry = Object.freeze({
      catalog,
      serial: serial.serial,
      acceptedAtMs: this.nowMs(),
      expiresMs: serial.expiresMs,
      offlineGraceUntilMs: serial.offlineGraceUntilMs,
      bytes,
      keyId,
      keyStatus,
    })
    if (!writeMarketCatalogCache(config.storage, config.catalogCacheStorageKey, entry)) {
      this.log('warn', 'catalog-cache', { code: 'cache-write-failed', host })
    }
  }

  /** Success value shared by network and offline-cache catalogue refreshes. */
  private catalogRefreshSuccess(input: {
    readonly catalog: ContentMarketCatalogV2
    readonly serial: MarketCatalogSerial
    readonly keyId: string
    readonly keyStatus: 'active' | 'retired' | 'revoked'
    readonly bytes: number
    readonly durationMs: number
    readonly redirects: number
    readonly httpStatus: number
    readonly catalogHost: string
    readonly rollbackProtection: boolean
    readonly cached: boolean
    readonly attempts: number
    readonly viaMirror: boolean
  }): MarketCatalogRefreshSuccess {
    const freshness = this.freshnessFor(input.serial.expiresMs, input.serial.offlineGraceUntilMs)
    return Object.freeze({
      ok: true as const,
      catalog: input.catalog,
      packs: input.catalog.packs,
      sourceId: this.sourceId,
      keyId: input.keyId,
      keyStatus: input.keyStatus,
      serial: input.serial,
      bytes: input.bytes,
      durationMs: input.durationMs,
      redirects: input.redirects,
      httpStatus: input.httpStatus,
      fetchedAt: normalizeIsoTimestamp(this.nowMs()),
      catalogHost: input.catalogHost,
      rollbackProtection: input.rollbackProtection,
      cached: input.cached,
      stale: freshness === 'grace',
      expiresAt: normalizeIsoTimestamp(input.serial.expiresMs),
      offlineGraceUntil: normalizeIsoTimestamp(input.serial.offlineGraceUntilMs),
      attempts: input.attempts,
      viaMirror: input.viaMirror,
    })
  }

  /**
   * Offline grace fallback: only retryable network/HTTP failures may use the
   * cached catalog, and only when it matches the persisted anti-rollback
   * baseline and is still inside its grace window. Security failures
   * (rollback/signature/schema) never fall back.
   */
  private offlineFallback(
    config: ResolvedMarketClientConfig,
    failureValue: MarketFailure,
    cache: MarketCatalogCacheEntry | null,
    storedSerial: MarketCatalogSerial | null,
    durationMs: number,
    attempts: number,
    host: string,
  ): MarketCatalogRefreshResult | null {
    if (!failureValue.retryable || cache === null || storedSerial === null) return null
    const cachedSerial = marketCatalogSerial(cache.catalog, this.effectiveOfflineGraceSeconds(cache.catalog))
    if (cachedSerial === null) return null
    if (cachedSerial.serial !== storedSerial.serial || cachedSerial.catalogSha256 !== storedSerial.catalogSha256) {
      this.log('warn', 'catalog-cache', { code: 'cache-baseline-mismatch', host })
      return null
    }
    if (this.freshnessFor(cachedSerial.expiresMs, cachedSerial.offlineGraceUntilMs) === 'expired') return null
    this.lastCatalogValue = cache.catalog
    this.lastSerialValue = cachedSerial
    this.log('info', 'catalog-cache', { code: 'offline-cache-hit', host, bytes: cache.bytes, durationMs })
    return this.catalogRefreshSuccess({
      catalog: cache.catalog,
      serial: cachedSerial,
      keyId: cache.keyId,
      keyStatus: cache.keyStatus,
      bytes: cache.bytes,
      durationMs,
      redirects: 0,
      httpStatus: failureValue.httpStatus ?? 0,
      catalogHost: host,
      rollbackProtection: config.storage !== null,
      cached: true,
      attempts,
      viaMirror: false,
    })
  }

  private async performRefresh(options: MarketplaceRequestOptions): Promise<MarketCatalogRefreshResult> {
    const config = this.resolvedConfig
    if (config === null) return this.configurationFailureValue()
    const urlCheck = validateMarketRequestUrl(config.catalogUrl, this.urlPolicy(true))
    if (!urlCheck.ok) return urlCheck
    const host = urlCheck.host
    if (options.signal?.aborted) return failure('aborted', 'request was aborted', { host })
    // 1. Anti-rollback state is the only security baseline: read it (and fail
    // closed) BEFORE any network request is made.
    let storedSerial: MarketCatalogSerial | null = null
    if (config.storage !== null) {
      const stored = readMarketCatalogSerial(config.storage, config.serialStorageKey)
      if (!stored.ok) return failure(stored.code, stored.message)
      storedSerial = stored.serial
    } else if (config.requireSerialStorage) {
      return failure('storage-unavailable', 'anti-rollback storage is required to use the remote market (inject storage)', { host })
    }
    // 2. Load + re-verify the offline cache (never a trust upgrade; best effort).
    let cache = this.loadCachedCatalog(config, host)
    if (cache !== null && storedSerial !== null && cache.serial !== storedSerial.serial) {
      this.log('warn', 'catalog-cache', { code: 'cache-baseline-mismatch', host })
      cache = null
    }
    // 3. Network: retry + signed-mirror fallback, all through the injected transport.
    const startedAt = this.nowMs()
    let outcome: MarketBodyFetchOutcome
    try {
      outcome = await requestMarketBytesWithFallback(
        config.catalogUrl,
        this.mirrorUrlsFor(config.catalogUrl, storedSerial?.mirrors ?? cache?.catalog.mirrors ?? []),
        {
          maxBytes: config.maxCatalogBytes,
          accept: 'application/json',
          timeoutMs: config.timeoutMs,
          ...(options.signal !== undefined ? { signal: options.signal } : {}),
          policy: this.urlPolicy(true),
          transport: config.transport,
          maxRedirects: config.maxRedirects,
          nowMs: () => this.nowMs(),
          rateGate: () => this.rateGate(),
        },
        this.effectiveRetryPolicy(),
        { sleep: config.sleep, random: config.random },
      )
    } catch (error) {
      return failure('internal-error', 'catalogue request failed unexpectedly: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'), {
        host,
      })
    }
    const request = outcome.result
    const durationMs = Math.max(0, this.nowMs() - startedAt)
    if (!request.ok) {
      const fallback = this.offlineFallback(config, request, cache, storedSerial, durationMs, outcome.attempts, host)
      if (fallback !== null) return fallback
      this.logFailure('catalog-refresh', request, durationMs)
      return request
    }
    const finalHost = request.finalUrl.hostname
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(request.bytes)
    } catch {
      const result = failure('catalog-invalid', 'catalogue body is not valid UTF-8', { host: finalHost })
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      const result = failure('catalog-invalid', 'catalogue body is not valid JSON', { host: finalHost })
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    // v0.1 is read-only: never silently install from a downgraded catalogue.
    if (isRecord(raw) && raw.schema === CONTENT_MARKET_CATALOG_SCHEMA) {
      const result = failure('catalog-unsupported', 'catalogue schema 0.1 is read-only; a v0.2 catalogue with serial/expires is required', {
        host: finalHost,
      })
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    let validation: ReturnType<typeof validateMarketCatalogV2>
    try {
      validation = validateMarketCatalogV2(raw)
    } catch (error) {
      const result = failure('catalog-invalid', 'catalogue validation threw: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'), {
        host: finalHost,
      })
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    if (!validation.ok) {
      const result = failure('catalog-invalid', 'catalogue failed strict validation', { host: finalHost, issues: mapIssues(validation.issues) })
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    const catalog = validation.catalog
    const serial = marketCatalogSerial(catalog, this.effectiveOfflineGraceSeconds(catalog))
    if (serial === null) {
      const result = failure('catalog-invalid', 'catalogue has an unparseable updatedAt/expires', { host: finalHost })
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    // Signature first: nothing unverified may influence the serial/expiry checks.
    let verification: ContentSignatureVerification
    try {
      verification = verifyMarketCatalogSignature(catalog, config.trustRoot, config.verifier, { now: this.nowDate() })
    } catch (error) {
      const result = failure('invalid-signature', 'catalogue signature verification threw: ' + boundedMessage(error instanceof Error ? error.message : 'unknown', 'unknown error'), {
        host: finalHost,
      })
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    if (!verification.ok) {
      const result = signatureFailure(verification, 'catalogue signature verification failed', finalHost)
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    // Expiry (spec v0.2 step 2) is checked before the rollback ordering decision.
    if (this.freshnessFor(serial.expiresMs, serial.offlineGraceUntilMs) === 'expired') {
      const result = failure('catalog-expired', 'catalogue expired beyond its offline grace; installed content stays usable but refresh/install are disabled', {
        host: finalHost,
      })
      this.logFailure('catalog-refresh', result, durationMs)
      return result
    }
    if (storedSerial !== null) {
      const order = compareMarketCatalogSerial(serial, storedSerial)
      if (order < 0) {
        const result = failure('catalog-rollback', 'catalogue serial is older than the persisted serial (rollback rejected)', { host: finalHost })
        this.logFailure('catalog-refresh', result, durationMs)
        return result
      }
      if (order === 0 && serial.catalogSha256 !== storedSerial.catalogSha256) {
        const result = failure('catalog-rollback', 'catalogue reuses the persisted serial with different signed content (rollback rejected)', {
          host: finalHost,
        })
        this.logFailure('catalog-refresh', result, durationMs)
        return result
      }
    }
    const needsWrite = storedSerial === null || compareMarketCatalogSerial(serial, storedSerial) > 0
    if (config.storage !== null && needsWrite) {
      const written = writeMarketCatalogSerial(config.storage, serial, config.serialStorageKey)
      if (!written.ok) {
        const result = failure('serial-write-failed', written.message, { host: finalHost })
        this.logFailure('catalog-refresh', result, durationMs)
        return result
      }
    }
    this.lastCatalogValue = catalog
    this.lastSerialValue = serial
    this.rememberCatalog(config, catalog, serial, request.bytes.byteLength, verification.keyId, verification.status, finalHost)
    this.log('info', 'catalog-refresh', {
      code: 'ok',
      host: finalHost,
      httpStatus: request.httpStatus,
      bytes: request.bytes.byteLength,
      durationMs,
      redirects: request.redirects,
      keyId: verification.keyId,
      attempts: outcome.attempts,
    })
    return this.catalogRefreshSuccess({
      catalog,
      serial,
      keyId: verification.keyId,
      keyStatus: verification.status,
      bytes: request.bytes.byteLength,
      durationMs,
      redirects: request.redirects,
      httpStatus: request.httpStatus,
      catalogHost: finalHost,
      rollbackProtection: config.storage !== null,
      cached: false,
      attempts: outcome.attempts,
      viaMirror: outcome.viaMirror,
    })
  }

  private urlPolicy(forCatalog: boolean): MarketUrlPolicy {
    const config = this.resolvedConfig
    if (config === null) return Object.freeze({})
    const policy: { -readonly [K in keyof MarketUrlPolicy]: MarketUrlPolicy[K] } = {
      allowHttp: config.allowHttp,
      allowPrivateHosts: config.allowPrivateHosts,
    }
    if (forCatalog && config.allowedCatalogHosts !== null) policy.allowedHosts = config.allowedCatalogHosts
    return Object.freeze(policy)
  }

  private nowMs(): number {
    const now = this.resolvedConfig?.now
    if (now === undefined || now === null) return Date.now()
    try {
      const value = now()
      return Number.isFinite(value) ? Math.floor(value) : Date.now()
    } catch {
      return Date.now()
    }
  }

  private nowDate(): string {
    return isoDateFromMs(this.nowMs())
  }

  private async acquireDownloadSlot(): Promise<void> {
    while (this.downloadActive >= this.effectiveMaxConcurrentDownloads()) {
      await new Promise<void>((resolve) => {
        this.downloadWaiters.push(resolve)
      })
    }
    this.downloadActive += 1
  }

  private releaseDownloadSlot(): void {
    this.downloadActive = Math.max(0, this.downloadActive - 1)
    const next = this.downloadWaiters.shift()
    if (next !== undefined) next()
  }

  private logFailure(event: MarketLogEventKind, value: MarketFailure, durationMs: number): void {
    this.log('error', event, {
      code: value.code,
      ...(value.detailCode !== undefined ? { detail: value.detailCode } : {}),
      ...(value.host !== undefined ? { host: value.host } : {}),
      ...(value.httpStatus !== undefined ? { httpStatus: value.httpStatus } : {}),
      durationMs,
    })
  }

  private log(
    level: MarketLogLevel,
    event: MarketLogEventKind,
    fields: {
      readonly code?: string
      readonly detail?: string
      readonly host?: string
      readonly httpStatus?: number
      readonly bytes?: number
      readonly durationMs?: number
      readonly redirects?: number
      readonly keyId?: string
      readonly attempts?: number
    } = {},
  ): void {
    const logger = this.resolvedConfig?.logger
    if (logger === undefined || logger === null) return
    const record: MarketLogEvent = Object.freeze({
      level,
      event,
      sourceId: this.sourceId,
      ...(fields.code !== undefined ? { code: fields.code } : {}),
      ...(fields.detail !== undefined ? { detail: boundedMessage(fields.detail, 'detail') } : {}),
      ...(fields.host !== undefined ? { host: fields.host } : {}),
      ...(fields.httpStatus !== undefined ? { httpStatus: fields.httpStatus } : {}),
      ...(fields.bytes !== undefined ? { bytes: fields.bytes } : {}),
      ...(fields.durationMs !== undefined ? { durationMs: fields.durationMs } : {}),
      ...(fields.redirects !== undefined ? { redirects: fields.redirects } : {}),
      ...(fields.keyId !== undefined ? { keyId: fields.keyId } : {}),
      ...(fields.attempts !== undefined ? { attempts: fields.attempts } : {}),
    })
    try {
      logger(record)
    } catch {
      // A host logger must never be able to break a market operation.
    }
  }
}

/** Create a remote market client. Construction never performs a request. */
export function createMarketplaceClient(config: MarketplaceClientConfig): MarketplaceClient {
  return new MarketplaceClient(config)
}

// ---------------------------------------------------------------------------
// content-hub / UI integration adapters
// ---------------------------------------------------------------------------

/** Typed error carrying the stable failure code across the RemoteMarketSource API. */
export class MarketplaceError extends Error {
  readonly failure: MarketFailure

  constructor(value: MarketFailure) {
    super(value.message)
    this.name = 'MarketplaceError'
    this.failure = value
  }
}

const MARKET_FAILURE_LABELS: Readonly<Partial<Record<MarketFailureCode, string>>> = Object.freeze({
  'not-configured': '远程市场未配置（不会联网）',
  'transport-unavailable': '未注入市场传输层（不会联网）',
  'invalid-config': '远程市场客户端配置无效',
  'invalid-argument': '参数无效',
  'invalid-url': '市场 URL 无效',
  'insecure-transport': '连接不是 HTTPS，已拒绝',
  'url-credentials': 'URL 含账号密码，已拒绝',
  'url-fragment': 'URL 含片段，已拒绝',
  'private-host': '目标是私网/回环地址，已拒绝',
  'host-not-allowed': '目标主机不在允许列表，已拒绝',
  'network-error': '网络请求失败',
  timeout: '网络请求超时',
  aborted: '操作已取消',
  'http-error': '市场服务器返回错误状态',
  'redirect-invalid': '跳转响应无效，已拒绝',
  'redirect-limit': '跳转次数过多，已拒绝',
  'redirect-cross-host': '跨域跳转，已拒绝',
  'redirect-insecure': 'HTTPS 被降级为 HTTP，已拒绝',
  'empty-response': '市场返回空响应',
  'too-large': '内容超过大小上限，已拒绝',
  'size-mismatch': '下载大小与签名目录不一致，已拒绝',
  'catalog-invalid': '市场目录未通过严格校验，已拒绝',
  'catalog-rollback': '市场目录版本回退，已拒绝',
  'catalog-unsupported': '市场目录版本过旧（0.1 只读），已拒绝',
  'catalog-expired': '市场目录已过期超出离线宽限，已拒绝新安装/刷新',
  'rate-limited': '市场请求过于频繁，已暂缓',
  'storage-unavailable': '防回滚存储不可用，已拒绝联网',
  'storage-corrupt': '本地防回滚记录损坏，已拒绝联网',
  'serial-write-failed': '防回滚记录写入失败，已拒绝采用该目录',
  'pack-not-in-catalog': '内容包不在已验签的市场目录中，已拒绝',
  'install-unconfigured': '安装器未配置，未安装任何内容',
  'unpack-failed': '内容包解包/校验失败，未安装',
  'pack-invalid': '内容包未通过严格校验，未安装',
  'install-failed': '安装回调失败，未安装',
  'missing-signature': '缺少 Ed25519 签名，已拒绝',
  'invalid-signature': 'Ed25519 签名不匹配，已拒绝',
  'unknown-signing-key': '签名密钥未知，已拒绝',
  'revoked-signing-key': '签名密钥已吊销，已拒绝',
  'key-outside-validity': '签名密钥不在有效期内，已拒绝',
  'hash-mismatch': 'SHA-256 不匹配，已拒绝',
  'internal-error': '内部错误',
})

/** Render a failure as bounded UI text (code is always included for support). */
export function describeMarketFailure(value: MarketFailure): string {
  const base = MARKET_FAILURE_LABELS[value.code] ?? '市场操作失败'
  return base + '（' + value.code + '）'
}

export interface RemoteMarketSourceOptions {
  readonly id?: string
  readonly label?: string
}

function requireConfiguredClient(client: MarketplaceClient | null): MarketplaceClient {
  if (client === null) throw new MarketplaceError(failure('not-configured', 'remote market is not configured'))
  if (!client.configured) throw new MarketplaceError(client.configurationFailure ?? failure('not-configured', 'remote market is not configured'))
  return client
}

/**
 * Adapt a MarketplaceClient to the content-hub RemoteMarketSource contract.
 *
 * Default/unconfigured behaviour: pass null (or a client whose config failed)
 * and the returned source reports configured:false; every network method throws
 * MarketplaceError('not-configured') without touching the transport. Passing a
 * configured client also does NOT fetch: the UI/host still has to call a method.
 */
export function createRemoteMarketSource(
  client: MarketplaceClient | null = null,
  options: RemoteMarketSourceOptions = {},
): RemoteMarketSource {
  const configured = client !== null && client.configured
  const id = boundedId(options.id ?? client?.sourceId, 'remote-market', 64)
  const label = boundedId(options.label ?? client?.label, '远程内容市场', 80)
  const source: RemoteMarketSource = {
    id,
    label,
    configured,
    async fetchCatalog(fetchOptions) {
      const active = requireConfiguredClient(client)
      const result = await active.refreshCatalog({
        ...(fetchOptions?.signal !== undefined ? { signal: fetchOptions.signal } : {}),
      })
      if (!result.ok) throw new MarketplaceError(result)
      return result.catalog
    },
    async fetchPackBytes(pack, fetchOptions) {
      const active = requireConfiguredClient(client)
      const result = await active.downloadPack(pack, {
        ...(fetchOptions?.signal !== undefined ? { signal: fetchOptions.signal } : {}),
      })
      if (!result.ok) throw new MarketplaceError(result)
      return toArrayBuffer(result.bytes)
    },
    verifyCatalog(catalog, deps) {
      return verifyMarketCatalogSignature(catalog, deps.trustRoot, deps.verifier, deps.now !== undefined ? { now: deps.now } : {})
    },
    verifyPack(pack, zipSha256, deps) {
      return verifyMarketPackDownload(pack, zipSha256, deps.trustRoot, deps.verifier, deps.now !== undefined ? { now: deps.now } : {})
    },
  }
  if (client !== null && client.installConfigured) {
    source.installPack = async (pack, bundle) => {
      const active = requireConfiguredClient(client)
      return active.installPack(pack, bundle)
    }
  }
  return Object.freeze(source)
}

export interface RemoteMarketRefreshOptions {
  readonly sourceLabel?: string
}

function marketFailureUiState(value: MarketFailure, sourceLabel: string): ContentMarketUiState {
  const hostSuffix = value.host !== undefined ? ' · ' + value.host : ''
  return Object.freeze({
    status: 'error' as const,
    configured: true,
    title: '市场目录刷新失败（未安装任何远程内容）',
    detail: describeMarketFailure(value) + hostSuffix,
    sourceLabel,
  })
}

/**
 * Build the content-hub refreshMarket callback. The button calls this only on an
 * explicit user click; when no configured client exists the handler returns the
 * honest unconfigured state and performs zero network requests.
 */
export function createRemoteMarketRefresh(
  client: MarketplaceClient | null = null,
  options: RemoteMarketRefreshOptions = {},
): () => Promise<ContentHubMarketRefreshResult> {
  const label = boundedId(options.sourceLabel ?? client?.label, '远程内容市场', 80)
  return async (): Promise<ContentHubMarketRefreshResult> => {
    if (client === null || !client.configured) {
      return Object.freeze({
        ok: false as const,
        message: '远程市场未配置：不会发起任何网络请求。',
        state: defaultContentMarketState(),
      })
    }
    try {
      const result = await client.refreshCatalog()
      if (!result.ok) {
        return Object.freeze({
          ok: false as const,
          message: describeMarketFailure(result),
          state: marketFailureUiState(result, label),
        })
      }
      return Object.freeze({
        ok: true as const,
        message:
          (result.cached
            ? '离线缓存：网络不可用，使用上次已验签市场目录 v' + result.catalog.version
            : '已验签市场目录 v' + result.catalog.version) +
          '（' +
          result.packs.length +
          ' 个内容包' +
          (result.stale ? '；目录已过期，处于离线宽限期内，请尽快联网刷新' : '') +
          '）；下载/安装仍需逐包展示统一用途声明并显式确认。',
        state: summarizeMarketCatalog(result.catalog, label),
      })
    } catch {
      const value = failure('internal-error', 'market refresh failed unexpectedly')
      return Object.freeze({
        ok: false as const,
        message: describeMarketFailure(value),
        state: marketFailureUiState(value, label),
      })
    }
  }
}

/** One object a host can hand to content-hub without importing internals. */
export interface RemoteMarketWiring {
  readonly source: RemoteMarketSource
  readonly configured: boolean
  readonly installConfigured: boolean
  /** ContentHubOptions.getMarketState */
  readonly getMarketState: () => ContentMarketUiState
  /** ContentHubOptions.refreshMarket (only called after a user click). */
  readonly refreshMarket: () => Promise<ContentHubMarketRefreshResult>
}

/**
 * Host wiring helper (default = unconfigured, no network):
 *
 *   const wiring = createRemoteMarketWiring(clientOrNull, { sourceLabel: '官方市场' })
 *   initContentHub({
 *     ...,
 *     getMarketState: wiring.getMarketState,
 *     refreshMarket: wiring.refreshMarket,
 *   })
 *
 * Passing null is the production default until a reviewed market server exists.
 */
export function createRemoteMarketWiring(
  client: MarketplaceClient | null = null,
  options: RemoteMarketSourceOptions & RemoteMarketRefreshOptions = {},
): RemoteMarketWiring {
  const source = createRemoteMarketSource(client, options)
  const refreshMarket = createRemoteMarketRefresh(client, options)
  const label = boundedId(options.sourceLabel ?? options.label ?? client?.label, '远程内容市场', 80)
  return Object.freeze({
    source,
    configured: source.configured,
    installConfigured: client?.installConfigured === true,
    getMarketState: (): ContentMarketUiState => {
      try {
        const catalog = client?.lastCatalog
        if (catalog !== null && catalog !== undefined) return summarizeMarketCatalog(catalog, label)
        return describeContentMarketState(source)
      } catch {
        return defaultContentMarketState()
      }
    },
    refreshMarket,
  })
}

// End of remote market client v1. No top-level side effect performs a request.



