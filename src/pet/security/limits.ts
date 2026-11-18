/**
 * Central, dependency-free limits and text/url/archive validators for the pet.
 *
 * Everything here is a pure function over strings/numbers/plain objects: no
 * DOM, no `node:` imports, no network, no `localStorage`. That keeps it usable
 * from the browser WebView, from Tauri, and from Node tests with the same
 * behaviour. Real UI wiring belongs in the host (see docs/audit/
 * HARDENING-2026-11-17.md); this module deliberately does not touch main.ts.
 *
 * Limits are derived from the current hosts, not invented: 8 chars for the pet
 * name (kernel/pet.ts `renamePet`), 60 chars for a corrected memory
 * (`correctPetMemory`), 500 chars for one TTS line and 2000 billed chars/day
 * (app/tauri voice.rs), 180 chars for a sanitized error line
 * (advisers/face.ts), 128 KiB for a brief. The save/portable/import/archive
 * caps are new defence-in-depth for paths that currently have no cap at all.
 */

/** One entry of a plugin/DLC archive (zip or directory plan). */
export interface ArchiveEntry {
  /** Raw path as it appears in the manifest/zip index (validated elsewhere). */
  path: string
  /** Bytes as stored in the archive (optional; for zip bombs). */
  compressedBytes?: number
  /** Bytes after extraction. */
  uncompressedBytes?: number
}

export interface SecurityLimits {
  /** `renamePet` display name, in code points. */
  displayNameChars: number
  /** User-corrected memory text, in code points. */
  memoryTextChars: number
  /** One bubble/subtitle line, in code points. */
  bubbleChars: number
  /** One cloud TTS request (Rust rejects > 500 chars). */
  ttsTextChars: number
  /** Daily billed characters for cloud TTS (Rust quota). */
  ttsDailyBilledChars: number
  /** Plaintext pet save payload. */
  savePlainBytes: number
  /** Encrypted portable-save JSON file (base64 inflates ~4/3). */
  portableFileBytes: number
  /** User-pasted DeepSeek share URL or id. */
  importUrlChars: number
  /** Messages accepted from one imported share. */
  importMessages: number
  /** Total user+assistant text accepted from one imported share. */
  importTextChars: number
  /** Serialized digest written to localStorage / displayed by the pet. */
  importDigestBytes: number
  /** Compressed archive (zip) byte cap. */
  archiveMaxBytes: number
  /** Maximum files/directories in one archive. */
  archiveMaxEntries: number
  /** Maximum uncompressed bytes for one archive entry. */
  archiveMaxEntryBytes: number
  /** Maximum uncompressed bytes for the whole archive. */
  archiveMaxUncompressedBytes: number
  /** Reject zip-bomb ratios above this (uncompressed / compressed). */
  archiveMaxCompressionRatio: number
  /** Relative path length (Windows MAX_PATH budget). */
  pathMaxChars: number
  /** Path segments accepted in one relative path. */
  pathMaxSegments: number
  /** Sanitized error/status line length. */
  errorMessageChars: number
  /** Default request timeout for external JSON fetches. */
  fetchTimeoutMs: number
  /** Default retry count (not counting the first attempt). */
  fetchMaxRetries: number
  /** Maximum bytes accepted for one external JSON response. */
  fetchResponseBytes: number
  /** Absolute URL length cap. */
  urlMaxChars: number
}

/**
 * Frozen so a wiring mistake cannot weaken a running app's caps. Values are
 * intentionally conservative; a feature that needs more should add an explicit
 * option at its call site instead of editing this table silently.
 */
export const SECURITY_LIMITS: Readonly<SecurityLimits> = Object.freeze({
  displayNameChars: 8,
  memoryTextChars: 60,
  bubbleChars: 240,
  ttsTextChars: 500,
  ttsDailyBilledChars: 2000,
  savePlainBytes: 512 * 1024,
  portableFileBytes: 2 * 1024 * 1024,
  importUrlChars: 2048,
  importMessages: 500,
  importTextChars: 200_000,
  importDigestBytes: 32 * 1024,
  archiveMaxBytes: 64 * 1024 * 1024,
  archiveMaxEntries: 512,
  archiveMaxEntryBytes: 16 * 1024 * 1024,
  archiveMaxUncompressedBytes: 256 * 1024 * 1024,
  archiveMaxCompressionRatio: 100,
  pathMaxChars: 260,
  pathMaxSegments: 32,
  errorMessageChars: 180,
  fetchTimeoutMs: 15_000,
  fetchMaxRetries: 2,
  fetchResponseBytes: 4 * 1024 * 1024,
  urlMaxChars: 2048,
})

const encoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder()
const decoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder()

/** UTF-8 byte length; falls back to a conservative upper bound (3 bytes/unit). */
export function utf8ByteLength(text: string): number {
  if (encoder) return encoder.encode(text).byteLength
  let bytes = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
  }
  return bytes
}

/** Code points, not UTF-16 units, so astral characters count once. */
export function countCodePoints(text: string): number {
  let count = 0
  for (const _ of text) count += 1
  return count
}

/** Truncate by code point without splitting a surrogate pair. */
export function truncateCodePoints(text: string, maxChars: number): string {
  const max = Number.isFinite(maxChars) ? Math.max(0, Math.floor(maxChars)) : 0
  if (max === 0) return ''
  if (countCodePoints(text) <= max) return text
  let out = ''
  let count = 0
  for (const ch of text) {
    if (count >= max) break
    out += ch
    count += 1
  }
  return out
}

/** Truncate to a UTF-8 byte budget on a code-point boundary. */
export function truncateUtf8Bytes(text: string, maxBytes: number): string {
  const max = Number.isFinite(maxBytes) ? Math.max(0, Math.floor(maxBytes)) : 0
  if (max === 0) return ''
  if (utf8ByteLength(text) <= max) return text
  if (!encoder || !decoder) return truncateCodePoints(text, Math.floor(max / 3))
  const bytes = encoder.encode(text)
  let cut = Math.min(max, bytes.length)
  // UTF-8 continuation bytes start with 0b10xxxxxx; move back to a boundary.
  while (cut > 0 && (bytes[cut]! & 0xc0) === 0x80) cut -= 1
  return decoder.decode(bytes.subarray(0, cut))
}

const C0_C1_CONTROLS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g
/** Non-global twin for `.test()` (a global regex would keep state). */
const C0_C1_CONTROL_TEST = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/
const BIDI_AND_ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g

/** Remove control characters; keeps \n \r \t so the caller can choose. */
export function stripControlChars(text: string): string {
  return text.replace(C0_C1_CONTROLS, '')
}

/**
 * Remove bidi overrides / zero-width characters that can spoof a name or a
 * status line while looking identical to another string.
 */
export function stripBidiControls(text: string): string {
  return text.replace(BIDI_AND_ZERO_WIDTH, '')
}

export interface SanitizeTextOptions {
  /** Max code points kept (default unbounded). */
  maxChars?: number
  /** Max UTF-8 bytes kept (default unbounded). */
  maxBytes?: number
  /** Keep `\n` (and `\r\n` -> `\n`); default collapses every newline to a space. */
  allowNewlines?: boolean
  /** Default true. */
  stripBidi?: boolean
  /** Default true. */
  trim?: boolean
}

/**
 * Coerce untrusted input to a bounded plain-text string: control/NUL bytes,
 * bidi spoofing and (optionally) newlines removed, then char/byte capped.
 * Never returns `undefined`/`null`; `toPlainText` rejects will be handled by the
 * caller. This is the single entry point input handlers should use before
 * writing into the kernel state or a text node.
 */
function coerceText(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return String(value)
  } catch {
    // Hostile Symbol/toString must not break input sanitizing.
    return ''
  }
}

export function sanitizePlainText(value: unknown, options: SanitizeTextOptions = {}): string {
  const raw = coerceText(value)
  let text = stripControlChars(raw)
  if (options.stripBidi !== false) text = stripBidiControls(text)
  if (options.allowNewlines) text = text.replace(/\r\n?/g, '\n')
  else text = text.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ')
  text = options.trim === false ? text : text.trim()
  const maxChars = options.maxChars
  if (maxChars !== undefined && Number.isFinite(maxChars)) text = truncateCodePoints(text, maxChars)
  const maxBytes = options.maxBytes
  if (maxBytes !== undefined && Number.isFinite(maxBytes)) text = truncateUtf8Bytes(text, maxBytes)
  return text
}

/** True when the string stays within `maxChars` code points. */
export function withinCharLimit(text: string, maxChars: number): boolean {
  return countCodePoints(text) <= maxChars
}

/** True when the string stays within `maxBytes` UTF-8 bytes. */
export function withinByteLimit(text: string, maxBytes: number): boolean {
  return utf8ByteLength(text) <= maxBytes
}

export interface UrlValidationOptions {
  maxChars?: number
  /** Exact hostnames allowed (e.g. `['chat.deepseek.com']`). */
  allowedHosts?: readonly string[]
  /** Accept `<host>.<allowedHost>` subdomains too. Default false. */
  allowSubdomains?: boolean
}

export type UrlValidationReason =
  | 'not-a-string'
  | 'empty'
  | 'too-long'
  | 'control-char'
  | 'invalid'
  | 'scheme'
  | 'credentials'
  | 'host'

export type UrlValidation =
  | { ok: true; href: string; hostname: string; protocol: 'http:' | 'https:' }
  | { ok: false; reason: UrlValidationReason }

/**
 * Strict `http(s)` URL check. Rejects `javascript:`/`data:`/`file:`, embedded
 * user:password credentials, control characters and (optionally) any host but
 * an allow-list. The browser `URL` parser is used, so no dependency is added;
 * the returned href is the parser-normalized form, not raw user text.
 */
export function validateHttpUrl(raw: unknown, options: UrlValidationOptions = {}): UrlValidation {
  if (typeof raw !== 'string') return { ok: false, reason: 'not-a-string' }
  const text = raw.trim()
  if (!text) return { ok: false, reason: 'empty' }
  const maxChars = options.maxChars ?? SECURITY_LIMITS.urlMaxChars
  if (!withinCharLimit(text, maxChars)) return { ok: false, reason: 'too-long' }
  if (C0_C1_CONTROL_TEST.test(text)) return { ok: false, reason: 'control-char' }
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: 'scheme' }
  if (parsed.username || parsed.password) return { ok: false, reason: 'credentials' }
  const hostname = parsed.hostname.toLowerCase()
  const allowed = options.allowedHosts
  if (allowed && allowed.length > 0) {
    const ok = allowed.some((host) => {
      const target = host.toLowerCase()
      return hostname === target || (options.allowSubdomains === true && hostname.endsWith(`.${target}`))
    })
    if (!ok) return { ok: false, reason: 'host' }
  }
  return { ok: true, href: parsed.href, hostname, protocol: parsed.protocol as 'http:' | 'https:' }
}

export type ArchiveIssueCode =
  | 'invalid-entry'
  | 'entry-count'
  | 'entry-bytes'
  | 'archive-bytes'
  | 'uncompressed-bytes'
  | 'compression-ratio'

export interface ArchiveLimitCheck {
  ok: boolean
  code?: ArchiveIssueCode
  detail?: string
  entryCount: number
  totalUncompressedBytes: number
}

export interface ArchiveLimitInput {
  entries: readonly ArchiveEntry[]
  /** Compressed bytes as reported by the archive index (optional). */
  compressedBytes?: number
  maxEntries?: number
  maxArchiveBytes?: number
  maxEntryBytes?: number
  maxUncompressedBytes?: number
  maxCompressionRatio?: number
}

function finiteSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

/**
 * Zip-bomb / oversized-plugin pre-check. Call this BEFORE extracting or even
 * before reading entry bodies, and pair it with path-safety.ts for every
 * `entry.path`. Only metadata is consulted here so the check itself cannot be
 * used to allocate attacker-controlled memory.
 */
export function checkArchiveLimits(input: ArchiveLimitInput): ArchiveLimitCheck {
  const entries = Array.isArray(input.entries) ? input.entries : []
  const maxEntries = input.maxEntries ?? SECURITY_LIMITS.archiveMaxEntries
  const maxArchiveBytes = input.maxArchiveBytes ?? SECURITY_LIMITS.archiveMaxBytes
  const maxEntryBytes = input.maxEntryBytes ?? SECURITY_LIMITS.archiveMaxEntryBytes
  const maxUncompressedBytes = input.maxUncompressedBytes ?? SECURITY_LIMITS.archiveMaxUncompressedBytes
  const maxRatio = input.maxCompressionRatio ?? SECURITY_LIMITS.archiveMaxCompressionRatio
  if (entries.length === 0) {
    return { ok: false, code: 'invalid-entry', detail: 'archive has no entries', entryCount: 0, totalUncompressedBytes: 0 }
  }
  // Fail fast on the cheapest check before walking every entry.
  if (entries.length > maxEntries) {
    return { ok: false, code: 'entry-count', detail: `${entries.length} entries > ${maxEntries}`, entryCount: entries.length, totalUncompressedBytes: 0 }
  }
  let totalUncompressed = 0
  for (const entry of entries) {
    const path = typeof entry?.path === 'string' ? entry.path : ''
    if (!path) {
      return { ok: false, code: 'invalid-entry', detail: 'entry without a path', entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
    }
    const compressed = finiteSize(entry.compressedBytes)
    const uncompressed = finiteSize(entry.uncompressedBytes)
    if (entry.compressedBytes !== undefined && compressed === undefined) {
      return { ok: false, code: 'invalid-entry', detail: `invalid compressed size for ${path}`, entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
    }
    if (entry.uncompressedBytes !== undefined && uncompressed === undefined) {
      return { ok: false, code: 'invalid-entry', detail: `invalid uncompressed size for ${path}`, entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
    }
    if (uncompressed !== undefined) {
      if (uncompressed > maxEntryBytes) {
        return { ok: false, code: 'entry-bytes', detail: `entry ${path} is ${uncompressed} bytes > ${maxEntryBytes}`, entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
      }
      totalUncompressed += uncompressed
      if (!Number.isFinite(totalUncompressed)) {
        return { ok: false, code: 'invalid-entry', detail: 'uncompressed size overflow', entryCount: entries.length, totalUncompressedBytes: 0 }
      }
    }
    if (compressed !== undefined && uncompressed !== undefined && compressed > 0) {
      if (uncompressed / compressed > maxRatio) {
        return { ok: false, code: 'compression-ratio', detail: `entry ${path} ratio ${Math.round(uncompressed / compressed)} > ${maxRatio}`, entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
      }
    }
  }
  if (totalUncompressed > maxUncompressedBytes) {
    return { ok: false, code: 'uncompressed-bytes', detail: `${totalUncompressed} bytes > ${maxUncompressedBytes}`, entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
  }
  const compressedBytes = finiteSize(input.compressedBytes)
  if (input.compressedBytes !== undefined && compressedBytes === undefined) {
    return { ok: false, code: 'invalid-entry', detail: 'invalid archive size', entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
  }
  if (compressedBytes !== undefined && compressedBytes > maxArchiveBytes) {
    return { ok: false, code: 'archive-bytes', detail: `${compressedBytes} bytes > ${maxArchiveBytes}`, entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
  }
  return { ok: true, entryCount: entries.length, totalUncompressedBytes: totalUncompressed }
}
