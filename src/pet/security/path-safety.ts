/**
 * Pure path-safety checks for community DLC / character packs and archive
 * extraction. No `node:path`, no filesystem: the host can call this both in the
 * browser (manifest preview) and in Node tooling.
 *
 * Why it exists: `native/dlc-verify/src/lib.rs:78-95` rejects `..` and a leading
 * `/` for hashed files, but not Windows drive paths (`C:\...`), UNC paths,
 * alternate-data-stream names (`file:stream`), device names (`CON`) or an
 * encoded traversal (`%2e%2e`); and the signed `manifest.content` path at
 * `lib.rs:99` is not checked at all. `scripts/import-character.mjs` also copies
 * whatever is under the source dir. The signed-manifest prerequisite limits the
 * attack surface, but this is the cheap defence-in-depth layer a community pack
 * loader should call for every entry path before joining it to a root.
 */

import { SECURITY_LIMITS } from './limits.ts'

export type PathKind =
  | 'empty'
  | 'relative'
  | 'posix-absolute'
  | 'win-absolute'
  | 'rooted'
  | 'unc'
  | 'drive-relative'
  | 'invalid'

export type PathIssueCode =
  | 'not-a-string'
  | 'empty'
  | 'nul-byte'
  | 'control-char'
  | 'absolute'
  | 'unc'
  | 'drive-letter'
  | 'rooted'
  | 'home-shorthand'
  | 'backslash'
  | 'parent-traversal'
  | 'encoded-traversal'
  | 'empty-segment'
  | 'too-many-segments'
  | 'too-long'
  | 'reserved-name'
  | 'alternate-data-stream'
  | 'trailing-dot-or-space'

export type PathCheck = { ok: true; normalized: string } | { ok: false; code: PathIssueCode; detail: string }

export interface PathSafetyOptions {
  maxChars?: number
  maxSegments?: number
  /** Allow `\` and normalize it to `/` (default true, Windows manifests). */
  allowBackslash?: boolean
}

export class PathSafetyError extends Error {
  readonly name = 'PathSafetyError'
  constructor(readonly code: PathIssueCode, detail: string) {
    super(`unsafe path (${code}): ${detail}`)
  }
}

const WINDOWS_RESERVED = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
])

const CONTROL_TEST = /[\u0000-\u001f\u007f]/
const DRIVE_ABSOLUTE = /^[A-Za-z]:[\\/]/
const DRIVE_RELATIVE = /^[A-Za-z]:/
const ENCODED_TRIPLE = /%2e%2e/i

/** Classify the raw string without normalizing it. */
export function classifyPath(raw: string): PathKind {
  if (typeof raw !== 'string' || raw === '') return 'empty'
  if (CONTROL_TEST.test(raw)) return 'invalid'
  if (/^[\\/]{2}/.test(raw)) return 'unc'
  if (DRIVE_ABSOLUTE.test(raw)) return 'win-absolute'
  if (DRIVE_RELATIVE.test(raw)) return 'drive-relative'
  if (raw.startsWith('/')) return 'posix-absolute'
  if (raw.startsWith('\\')) return 'rooted'
  return 'relative'
}

function tryDecode(text: string): string | undefined {
  try {
    return decodeURIComponent(text)
  } catch {
    return undefined
  }
}

/**
 * Validate one relative path and return its normalized POSIX form
 * (`a/b/c`). Rejects: NUL/control chars, absolute/UNC/drive/rooted paths,
 * `~` shorthand, any `..` segment, percent-encoded traversal, Windows reserved
 * device names, `:` alternate data streams, trailing dot/space segments, empty
 * segments (`a//b`), and length/segment caps.
 */
export function checkRelativePath(raw: unknown, options: PathSafetyOptions = {}): PathCheck {
  if (typeof raw !== 'string') return { ok: false, code: 'not-a-string', detail: typeof raw }
  const maxChars = options.maxChars ?? SECURITY_LIMITS.pathMaxChars
  const maxSegments = options.maxSegments ?? SECURITY_LIMITS.pathMaxSegments
  let text = raw
  if (text.length > maxChars) return { ok: false, code: 'too-long', detail: `${text.length} chars > ${maxChars}` }
  if (text.includes('\u0000')) return { ok: false, code: 'nul-byte', detail: 'contains NUL' }
  if (CONTROL_TEST.test(text)) return { ok: false, code: 'control-char', detail: 'contains a control character' }
  if (text === '') return { ok: false, code: 'empty', detail: 'empty path' }
  const kind = classifyPath(text)
  switch (kind) {
    case 'unc':
      return { ok: false, code: 'unc', detail: text.slice(0, 32) }
    case 'win-absolute':
      return { ok: false, code: 'absolute', detail: text.slice(0, 32) }
    case 'drive-relative':
      return { ok: false, code: 'drive-letter', detail: text.slice(0, 32) }
    case 'posix-absolute':
      return { ok: false, code: 'absolute', detail: text.slice(0, 32) }
    case 'rooted':
      return { ok: false, code: 'rooted', detail: text.slice(0, 32) }
    case 'empty':
      return { ok: false, code: 'empty', detail: 'empty path' }
    default:
      break
  }
  if (text.startsWith('~')) return { ok: false, code: 'home-shorthand', detail: text.slice(0, 32) }
  // Percent-encoded traversal/separators must not be decoded by a later layer.
  if (text.includes('%')) {
    const decoded = tryDecode(text)
    if (decoded !== undefined && decoded !== text) {
      if (ENCODED_TRIPLE.test(decoded) || decoded.includes('/') || decoded.includes('\\') || decoded.includes(':')) {
        return { ok: false, code: 'encoded-traversal', detail: text.slice(0, 48) }
      }
    }
  }
  const allowBackslash = options.allowBackslash !== false
  if (!allowBackslash && text.includes('\\')) return { ok: false, code: 'backslash', detail: text.slice(0, 32) }
  const unified = text.replace(/\\/g, '/')
  const parts = unified.split('/')
  const segments: string[] = []
  for (const part of parts) {
    if (part === '' ) return { ok: false, code: 'empty-segment', detail: unified.slice(0, 48) }
    if (part === '.') continue
    if (part === '..') return { ok: false, code: 'parent-traversal', detail: unified.slice(0, 48) }
    if (part.includes(':')) return { ok: false, code: 'alternate-data-stream', detail: part.slice(0, 48) }
    if (/[. ]$/.test(part)) return { ok: false, code: 'trailing-dot-or-space', detail: part.slice(0, 48) }
    if (/[<>"|?*]/.test(part)) return { ok: false, code: 'reserved-name', detail: part.slice(0, 48) }
    const base = part.split('.')[0]!.toUpperCase()
    if (WINDOWS_RESERVED.has(base)) return { ok: false, code: 'reserved-name', detail: part.slice(0, 48) }
    segments.push(part)
    if (segments.length > maxSegments) {
      return { ok: false, code: 'too-many-segments', detail: `${segments.length} segments > ${maxSegments}` }
    }
  }
  if (segments.length === 0) return { ok: false, code: 'empty', detail: 'only . segments' }
  const normalized = segments.join('/')
  if (normalized.length > maxChars) return { ok: false, code: 'too-long', detail: `${normalized.length} chars > ${maxChars}` }
  return { ok: true, normalized }
}

/** Boolean convenience for manifest scanning. */
export function isSafeRelativePath(raw: unknown, options: PathSafetyOptions = {}): boolean {
  return checkRelativePath(raw, options).ok
}

/** Normalized POSIX path or undefined when unsafe. */
export function normalizeRelativePath(raw: unknown, options: PathSafetyOptions = {}): string | undefined {
  const checked = checkRelativePath(raw, options)
  return checked.ok ? checked.normalized : undefined
}

/** Throwing variant for tooling; the error carries the machine-readable code. */
export function assertSafeRelativePath(raw: unknown, options: PathSafetyOptions = {}): string {
  const checked = checkRelativePath(raw, options)
  if (!checked.ok) throw new PathSafetyError(checked.code, checked.detail)
  return checked.normalized
}

/**
 * Join a validated relative path to a trusted root. Pure string manipulation:
 * the root keeps its separator style (Windows root -> `\`, POSIX root -> `/`);
 * the relative part is normalized to that style. Returns undefined when the
 * relative path is unsafe or the root is not absolute-ish. This never resolves
 * symlinks or `..` against the filesystem (callers with a real FS should also
 * canonicalize and re-check containment, as Tauri `read_pack_manifest` does).
 */
export function resolveWithinRoot(root: string, relative: unknown, options: PathSafetyOptions = {}): string | undefined {
  if (typeof root !== 'string' || root === '') return undefined
  if (CONTROL_TEST.test(root)) return undefined
  const trimmedRoot = root.replace(/[\\/]+$/, '')
  if (!trimmedRoot) return undefined
  const check = checkRelativePath(relative, options)
  if (!check.ok) return undefined
  const hasBackslash = trimmedRoot.includes('\\')
  const windowsLike = hasBackslash || /^[A-Za-z]:/.test(trimmedRoot) || /^[\\/]{2}/.test(trimmedRoot)
  const separator = hasBackslash || (windowsLike && !trimmedRoot.includes('/')) ? '\\' : '/'
  const relativeNative = separator === '\\' ? check.normalized.replace(/\//g, '\\') : check.normalized
  return `${trimmedRoot}${separator}${relativeNative}`
}
