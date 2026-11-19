/**
 * Content asset pipeline for v2 material packs (task-54).
 *
 * The shared catalog core (content-library.ts) is deliberately pure: it never
 * touches bytes, a filesystem, IndexedDB or the network. This module is the
 * host-side companion that turns a user-selected **material bundle** into the
 * two things the validator needs:
 *
 * 1. a bounded zip/folder reader that unzips in memory (central directory only,
 *    DecompressionStream('deflate-raw'), no eval/workers/network), rejects
 *    traversal/absolute/UNC/backslash paths, encrypted entries, zip64, symlinks,
 *    duplicate/case-colliding names, oversized entries and compression bombs,
 *    and verifies every CRC-32;
 * 2. a sha256 fingerprint per file plus a ContentPackZipInventory that the
 *    canonical validatePackZip() then checks against pack.json (this module
 *    NEVER relaxes or re-implements the catalog validator);
 * 3. a small async asset store (IndexedDB with an explicit in-memory safe
 *    fallback) plus object-URL / data-URL and FontFace helpers so validated
 *    png/webp previews, background images and woff2 fonts can be shown without
 *    remote URLs. URLs handed to CSS are only ever ones this module created.
 *
 * Security boundaries:
 * - every byte limit mirrors CONTENT_PACK_V2_LIMITS (16 MiB zip, 256 entries,
 *   8 MiB/file, 32 MiB total, ratio 128) and is enforced BEFORE inflating;
 * - no innerHTML, no eval, no fetch, no remote URL: blob:/data: URLs are
 *   generated locally and the CSS helper accepts only registered URLs;
 * - sanitized, canonical relative paths only (same shape as pack files[]);
 * - IndexedDB failures degrade to a memory store instead of throwing.
 *
 * The module is testable in plain Node: pass an injected IDBFactory
 * (fake-indexeddb), object-URL adapter or font face factory. No browser-only
 * global is required at import time.
 */
import {
  CONTENT_PACK_V2_LIMITS,
  type ContentIssue,
  type ContentIssueCode,
  type ContentPackV2,
  type ContentPackZipEntry,
  type ContentPackZipInventory,
} from './content-library.ts'

// ---------------------------------------------------------------------------
// Limits / constants
// ---------------------------------------------------------------------------

/** Hard caps enforced by the reader (mirror of the v2 pack limits). */
export const CONTENT_ASSET_LIMITS = Object.freeze({
  maxZipBytes: CONTENT_PACK_V2_LIMITS.maxZipBytes,
  maxZipEntries: CONTENT_PACK_V2_LIMITS.maxZipEntries,
  maxAssetBytes: CONTENT_PACK_V2_LIMITS.maxAssetBytes,
  maxTotalUncompressedBytes: CONTENT_PACK_V2_LIMITS.maxTotalUncompressedBytes,
  maxCompressionRatio: CONTENT_PACK_V2_LIMITS.maxCompressionRatio,
  maxPackJsonBytes: CONTENT_PACK_V2_LIMITS.maxPackJsonBytes,
  maxPathChars: 160,
} as const)

/** Asset extensions accepted inside a v2 bundle (same whitelist as the core). */
export const CONTENT_ASSET_EXTENSIONS = ['png', 'webp', 'json', 'woff2'] as const

/** MIME types used for Blob/FontFace/background application. */
export const CONTENT_ASSET_MIME: Readonly<Record<string, string>> = Object.freeze({
  png: 'image/png',
  webp: 'image/webp',
  json: 'application/json',
  woff2: 'font/woff2',
  md: 'text/markdown',
  txt: 'text/plain',
})

/** IndexedDB database + object store names for locally installed pack assets. */
export const CONTENT_ASSET_STORE_DB = 'desktop-games/pet/content-assets'
export const CONTENT_ASSET_STORE_NAME = 'assets'

/** CSS variable an asset background image may be written to (same as the core). */
export const CONTENT_ASSET_BACKGROUND_VAR = '--famling-content-background'
/** CSS variable a registered pack font family may be written to (same as core). */
export const CONTENT_ASSET_FONT_VAR = '--famling-content-font-family'

const LOCAL_FILE_SIGNATURE = 0x04034b50
const CENTRAL_FILE_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50
const FLAG_ENCRYPTED = 0x0001
const FLAG_PATCHED = 0x0020
const FLAG_STRONG_ENCRYPTION = 0x0040
const METHOD_STORE = 0
const METHOD_DEFLATE = 8
const ZIP_UNIX_MADE_BY = 3

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One regular file extracted from a local bundle (path is bundle-relative). */
export interface ContentBundleFile {
  readonly path: string
  readonly bytes: Uint8Array
  /** Compressed size for zip entries; equal to bytes for folder selections. */
  readonly compressedBytes: number
  readonly crc32?: number
}

/** A fully read local bundle: files + the inventory the core validates. */
export interface ContentBundle {
  readonly kind: 'zip' | 'folder'
  /** Size used as ContentPackZipInventory.bytes (zip size / folder total). */
  readonly bytes: number
  readonly files: readonly ContentBundleFile[]
  readonly fileMap: ReadonlyMap<string, Uint8Array>
  readonly inventory: ContentPackZipInventory
}

export type ContentBundleReadResult =
  | { readonly ok: true; readonly bundle: ContentBundle }
  | { readonly ok: false; readonly issues: readonly ContentIssue[] }

/** One asset file worth persisting for previews/backgrounds/fonts. */
export interface ContentBundleAsset {
  readonly path: string
  readonly bytes: Uint8Array
  readonly mime: string
  readonly sha256: string
}

/** A stored asset record (metadata + bytes). */
export interface ContentAssetRecord {
  readonly key: string
  readonly packId: string
  readonly path: string
  readonly mime: string
  readonly bytes: ArrayBuffer
  readonly sha256: string
}

export interface ContentAssetMeta {
  readonly key: string
  readonly packId: string
  readonly path: string
  readonly mime: string
  readonly size: number
  readonly sha256: string
}

export type ContentAssetStoreKind = 'indexeddb' | 'memory' | 'unavailable'

/** Async local asset store. Every method fails closed instead of throwing. */
export interface ContentAssetStore {
  readonly kind: ContentAssetStoreKind
  put(record: ContentAssetRecord): Promise<boolean>
  get(packId: string, path: string): Promise<ContentAssetRecord | null>
  list(packId?: string): Promise<readonly ContentAssetMeta[]>
  removePack(packId: string): Promise<boolean>
}

export interface ContentAssetStoreOptions {
  /** Injected IDBFactory (tests use fake-indexeddb); undefined = global one. */
  readonly factory?: IDBFactory | null
  readonly dbName?: string
}

export interface ContentObjectUrlAdapter {
  readonly kind: 'object-url' | 'data-url'
  create(record: ContentAssetRecord): string
  revoke(url: string): void
}

export interface ContentAssetUrls {
  readonly kind: 'object-url' | 'data-url'
  /** Create (once) and return the local URL for a stored asset. */
  urlFor(record: ContentAssetRecord): string
  /** True only for URLs this registry created (never a remote URL). */
  has(url: string): boolean
  release(url: string): void
  releaseAll(): void
}

export interface ContentCssStyleLike {
  setProperty(name: string, value: string): void
  removeProperty(name: string): string
}

export interface ContentCssRootLike {
  readonly style: ContentCssStyleLike
}

export interface ContentFontFaceLike {
  readonly family: string
  load(): Promise<unknown>
}

export interface ContentFontSetLike {
  add(font: ContentFontFaceLike): void
  delete(font: ContentFontFaceLike): boolean
}

export interface ContentFontFaceFactory {
  (family: string, source: ArrayBuffer): ContentFontFaceLike
}

export interface ContentFontFaceDeps {
  readonly fontSet?: ContentFontSetLike | null
  readonly createFontFace?: ContentFontFaceFactory | null
}

export interface ContentFontRegistration {
  readonly ok: boolean
  readonly family?: string
  readonly font?: ContentFontFaceLike
  readonly reason?: string
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function issue(path: string, code: ContentIssueCode, message: string): ContentIssue {
  return { path, code, message }
}

function fail(issues: readonly ContentIssue[]): ContentBundleReadResult {
  return Object.freeze({ ok: false as const, issues: Object.freeze([...issues]) })
}

function frozenBundle(bundle: ContentBundle): ContentBundleReadResult {
  return Object.freeze({ ok: true as const, bundle: Object.freeze(bundle) })
}

/** True for a canonical, bounded, package-relative path. Mirrors the core. */
export function isSafeBundlePath(rawPath: unknown): rawPath is string {
  if (typeof rawPath !== 'string') return false
  if (rawPath.length === 0 || rawPath.length > CONTENT_ASSET_LIMITS.maxPathChars) return false
  // Control chars, markup chars, backslashes, drive/ADS/URL separators.
  if (/[\u0000-\u001f\u007f<>\\:#?]/.test(rawPath)) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawPath)) return false
  if (rawPath.startsWith('/')) return false
  const segments = rawPath.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}

/** Extension (lowercase, no dot) of a path, or empty string. */
export function assetExtension(path: string): string {
  const slash = path.lastIndexOf('/')
  const base = slash === -1 ? path : path.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/** MIME type for a supported asset path (else application/octet-stream). */
export function assetMimeType(path: string): string {
  return CONTENT_ASSET_MIME[assetExtension(path)] ?? 'application/octet-stream'
}

/** Bounded UTF-8 decode (fatal on malformed input -> null). */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** Lowercase hex sha-256 via WebCrypto (available in Node 18+ and browsers). */
export async function sha256Hex(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle
  if (!subtle) throw new Error('WebCrypto subtle.digest is unavailable')
  const source =
    view.byteOffset === 0 && view.byteLength === view.buffer.byteLength
      ? (view.buffer as ArrayBuffer)
      : (view.slice().buffer as ArrayBuffer)
  const digest = await subtle.digest('SHA-256', source)
  const out: string[] = []
  for (const value of new Uint8Array(digest)) out.push(value.toString(16).padStart(2, '0'))
  return out.join('')
}

// ---------------------------------------------------------------------------
// CRC-32 (zip integrity check)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

/** CRC-32 of a byte array (unsigned). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

// ---------------------------------------------------------------------------
// Minimal zip reader (central directory, stored/deflate only)
// ---------------------------------------------------------------------------

interface CentralEntry {
  readonly path: string
  readonly isDirectory: boolean
  readonly method: number
  readonly flags: number
  readonly crc: number
  readonly compressedBytes: number
  readonly uncompressedBytes: number
  readonly localOffset: number
}

function inflateRaw(data: Uint8Array, expectedBytes: number): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    const Ctor = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
    if (typeof Ctor !== 'function') {
      resolve(null)
      return
    }
    let stream: DecompressionStream
    try {
      stream = new Ctor('deflate-raw')
    } catch {
      resolve(null)
      return
    }
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()
    void writer.write(data.slice()).then(() => writer.close()).catch(() => {})
    const chunks: Uint8Array[] = []
    let total = 0
    const pump = async (): Promise<void> => {
      try {
        for (;;) {
          const result = await reader.read()
          if (result.done) break
          const chunk = result.value
          if (chunk === undefined) continue
          total += chunk.byteLength
          if (total > expectedBytes) {
            try {
              await reader.cancel()
            } catch {
              // already closed
            }
            resolve(null)
            return
          }
          chunks.push(chunk)
        }
      } catch {
        resolve(null)
        return
      }
      if (total !== expectedBytes) {
        resolve(null)
        return
      }
      const out = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.byteLength
      }
      resolve(out)
    }
    void pump()
  })
}

function parseCentralEntries(
  view: DataView,
  cdOffset: number,
  cdSize: number,
  totalEntries: number,
  issues: ContentIssue[],
): CentralEntry[] {
  const entries: CentralEntry[] = []
  let offset = cdOffset
  const end = cdOffset + cdSize
  for (let index = 0; index < totalEntries; index += 1) {
    const entryPath = '$.zip.entries[' + index + ']'
    if (offset + 46 > end) {
      issues.push(issue('$.zip', 'invalid-zip', 'central directory is truncated'))
      return entries
    }
    if (view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE) {
      issues.push(issue('$.zip', 'invalid-zip', 'bad central directory signature at entry ' + index))
      return entries
    }
    const versionMadeBy = view.getUint16(offset + 4, true)
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const crc = view.getUint32(offset + 16, true)
    const compressedBytes = view.getUint32(offset + 20, true)
    const uncompressedBytes = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const externalAttributes = view.getUint32(offset + 38, true)
    const localOffset = view.getUint32(offset + 42, true)
    const nameStart = offset + 46
    const nameEnd = nameStart + nameLength
    if (nameEnd + extraLength + commentLength > end) {
      issues.push(issue(entryPath, 'invalid-zip', 'central directory entry is truncated'))
      return entries
    }
    const rawName = decodeUtf8(new Uint8Array(view.buffer, view.byteOffset + nameStart, nameLength))
    if (rawName === null) {
      issues.push(issue(entryPath, 'invalid-zip', 'zip entry name is not valid UTF-8'))
      offset = nameEnd + extraLength + commentLength
      continue
    }
    const isDirectory = rawName.endsWith('/') || (externalAttributes & 0x10) !== 0
    const entryName = rawName.endsWith('/') ? rawName.replace(/\/+$/, '') : rawName
    if (!isSafeBundlePath(entryName)) {
      issues.push(issue(entryPath, 'unsafe-zip-entry', 'unsafe zip entry path: ' + rawName.slice(0, 64)))
      offset = nameEnd + extraLength + commentLength
      continue
    }
    if ((flags & FLAG_ENCRYPTED) !== 0 || (flags & FLAG_STRONG_ENCRYPTION) !== 0) {
      issues.push(issue(entryPath, 'invalid-zip', 'encrypted zip entries are not supported'))
      offset = nameEnd + extraLength + commentLength
      continue
    }
    if ((flags & FLAG_PATCHED) !== 0) {
      issues.push(issue(entryPath, 'invalid-zip', 'patched zip entries are not supported'))
      offset = nameEnd + extraLength + commentLength
      continue
    }
    if (method !== METHOD_STORE && method !== METHOD_DEFLATE) {
      issues.push(issue(entryPath, 'invalid-zip', 'unsupported zip compression method: ' + method))
      offset = nameEnd + extraLength + commentLength
      continue
    }
    // Reject unix symlinks/sockets/devices; plain files and directories only.
    if (versionMadeBy >>> 8 === ZIP_UNIX_MADE_BY) {
      const mode = externalAttributes >>> 16
      const fileType = mode & 0xf000
      const allowed = fileType === 0 || fileType === 0x8000 || (isDirectory && fileType === 0x4000)
      if (!allowed) {
        issues.push(issue(entryPath, 'invalid-zip', 'zip entry is not a regular file or directory'))
        offset = nameEnd + extraLength + commentLength
        continue
      }
    }
    if (isDirectory) {
      entries.push({
        path: entryName,
        isDirectory: true,
        method,
        flags,
        crc: 0,
        compressedBytes: 0,
        uncompressedBytes: 0,
        localOffset,
      })
      offset = nameEnd + extraLength + commentLength
      continue
    }
    if (uncompressedBytes > CONTENT_ASSET_LIMITS.maxAssetBytes) {
      issues.push(
        issue(entryPath, 'zip-too-large', 'file ' + uncompressedBytes + ' bytes > ' + CONTENT_ASSET_LIMITS.maxAssetBytes),
      )
      offset = nameEnd + extraLength + commentLength
      continue
    }
    if (method === METHOD_STORE && compressedBytes !== uncompressedBytes) {
      issues.push(issue(entryPath, 'invalid-zip', 'stored entry sizes disagree'))
      offset = nameEnd + extraLength + commentLength
      continue
    }
    if (compressedBytes > CONTENT_ASSET_LIMITS.maxAssetBytes + 1024) {
      issues.push(issue(entryPath, 'zip-too-large', 'compressed size exceeds the per-file cap'))
      offset = nameEnd + extraLength + commentLength
      continue
    }
    entries.push({
      path: entryName,
      isDirectory: false,
      method,
      flags,
      crc,
      compressedBytes,
      uncompressedBytes,
      localOffset,
    })
    offset = nameEnd + extraLength + commentLength
  }
  return entries
}

function readCentralEntryBytes(
  view: DataView,
  entry: CentralEntry,
  cdOffset: number,
  entryPath: string,
  issues: ContentIssue[],
): Uint8Array | null {
  const localOffset = entry.localOffset
  if (localOffset + 30 > cdOffset) {
    issues.push(issue(entryPath, 'invalid-zip', 'local file header is outside the archive'))
    return null
  }
  if (view.getUint32(localOffset, true) !== LOCAL_FILE_SIGNATURE) {
    issues.push(issue(entryPath, 'invalid-zip', 'bad local file header signature'))
    return null
  }
  const localFlags = view.getUint16(localOffset + 6, true)
  const localMethod = view.getUint16(localOffset + 8, true)
  const nameLength = view.getUint16(localOffset + 26, true)
  const extraLength = view.getUint16(localOffset + 28, true)
  if ((localFlags & FLAG_ENCRYPTED) !== 0 || (localFlags & FLAG_STRONG_ENCRYPTION) !== 0) {
    issues.push(issue(entryPath, 'invalid-zip', 'local header says the entry is encrypted'))
    return null
  }
  if (localMethod !== entry.method) {
    issues.push(issue(entryPath, 'invalid-zip', 'local/central compression methods disagree'))
    return null
  }
  const dataStart = localOffset + 30 + nameLength + extraLength
  const dataEnd = dataStart + entry.compressedBytes
  if (dataStart > cdOffset || dataEnd > cdOffset) {
    issues.push(issue(entryPath, 'invalid-zip', 'compressed data is outside the archive'))
    return null
  }
  const localName = decodeUtf8(new Uint8Array(view.buffer, view.byteOffset + localOffset + 30, nameLength))
  if (localName === null || localName.replace(/\/+$/, '') !== entry.path) {
    issues.push(issue(entryPath, 'invalid-zip', 'local/central file names disagree'))
    return null
  }
  return new Uint8Array(view.buffer, view.byteOffset + dataStart, entry.compressedBytes)
}

/**
 * Read a zip bundle fully in memory. Returns a bounded file list + the
 * inventory that validatePackZip() expects, or the complete issue list.
 * Never throws on malformed input (fails closed with issues).
 */
export async function readContentZip(input: ArrayBuffer | Uint8Array): Promise<ContentBundleReadResult> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const issues: ContentIssue[] = []
  if (bytes.byteLength === 0 || bytes.byteLength > CONTENT_ASSET_LIMITS.maxZipBytes) {
    return fail([
      issue('$.zip', 'zip-too-large', 'zip size must be 1..' + CONTENT_ASSET_LIMITS.maxZipBytes + ' bytes'),
    ])
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const length = bytes.byteLength
  if (length < 22) return fail([issue('$.zip', 'invalid-zip', 'file is too small to be a zip')])
  // End of central directory: scan the maximum possible comment window.
  const minimum = Math.max(0, length - 22 - 0xffff)
  let eocdOffset = -1
  for (let offset = length - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIR_SIGNATURE) continue
    const commentLength = view.getUint16(offset + 20, true)
    if (offset + 22 + commentLength === length) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) return fail([issue('$.zip', 'invalid-zip', 'missing end of central directory record')])
  const diskNumber = view.getUint16(eocdOffset + 4, true)
  const centralDisk = view.getUint16(eocdOffset + 6, true)
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true)
  const totalEntries = view.getUint16(eocdOffset + 10, true)
  const cdSize = view.getUint32(eocdOffset + 12, true)
  const cdOffset = view.getUint32(eocdOffset + 16, true)
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    return fail([issue('$.zip', 'invalid-zip', 'multi-disk zip archives are not supported')])
  }
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return fail([issue('$.zip', 'invalid-zip', 'zip64 archives are not supported')])
  }
  if (totalEntries === 0) return fail([issue('$.zip', 'invalid-zip', 'zip archive has no entries')])
  if (totalEntries > CONTENT_ASSET_LIMITS.maxZipEntries) {
    return fail([issue('$.zip', 'zip-too-large', totalEntries + ' entries > ' + CONTENT_ASSET_LIMITS.maxZipEntries)])
  }
  if (cdOffset + cdSize > eocdOffset) {
    return fail([issue('$.zip', 'invalid-zip', 'central directory offset/size is invalid')])
  }
  const central = parseCentralEntries(view, cdOffset, cdSize, totalEntries, issues)
  if (issues.length > 0) return fail(issues)
  const seen = new Set<string>()
  let totalUncompressed = 0
  for (const entry of central) {
    const lower = entry.path.toLowerCase()
    if (seen.has(lower)) {
      issues.push(issue('$.zip', 'duplicate-id', 'duplicate/case-colliding zip entry: ' + entry.path))
      continue
    }
    seen.add(lower)
    totalUncompressed += entry.uncompressedBytes
  }
  if (totalUncompressed > CONTENT_ASSET_LIMITS.maxTotalUncompressedBytes) {
    issues.push(
      issue('$.zip', 'zip-too-large', 'uncompressed total > ' + CONTENT_ASSET_LIMITS.maxTotalUncompressedBytes),
    )
  }
  if (totalUncompressed > bytes.byteLength * CONTENT_ASSET_LIMITS.maxCompressionRatio) {
    issues.push(
      issue(
        '$.zip',
        'zip-too-large',
        'compression ratio > ' + CONTENT_ASSET_LIMITS.maxCompressionRatio + ' (possible zip bomb)',
      ),
    )
  }
  if (issues.length > 0) return fail(issues)
  const files: ContentBundleFile[] = []
  const fileMap = new Map<string, Uint8Array>()
  const inventoryEntries: ContentPackZipEntry[] = []
  for (let index = 0; index < central.length; index += 1) {
    const entry = central[index]
    if (entry === undefined) continue
    if (entry.isDirectory) {
      inventoryEntries.push({ path: entry.path, bytes: 0, isDirectory: true })
      continue
    }
    const entryPath = '$.zip.entries[' + index + ']'
    const compressed = readCentralEntryBytes(view, entry, cdOffset, entryPath, issues)
    if (compressed === null) continue
    let content: Uint8Array | null
    if (entry.method === METHOD_STORE) {
      content = compressed.slice()
    } else {
      content = await inflateRaw(compressed, entry.uncompressedBytes)
      if (content === null) {
        issues.push(issue(entryPath, 'invalid-zip', 'deflate stream is invalid or exceeds the declared size'))
        continue
      }
    }
    if (content.byteLength !== entry.uncompressedBytes) {
      issues.push(
        issue(entryPath, 'file-size-mismatch', 'declared ' + entry.uncompressedBytes + ' bytes, actual ' + content.byteLength),
      )
      continue
    }
    if (crc32(content) !== entry.crc) {
      issues.push(issue(entryPath, 'hash-mismatch', 'CRC-32 mismatch for ' + entry.path))
      continue
    }
    const sha256 = await sha256Hex(content)
    files.push({ path: entry.path, bytes: content, compressedBytes: entry.compressedBytes, crc32: entry.crc })
    fileMap.set(entry.path, content)
    inventoryEntries.push({
      path: entry.path,
      bytes: content.byteLength,
      compressedBytes: entry.compressedBytes,
      sha256,
    })
  }
  if (issues.length > 0) return fail(issues)
  const inventory: ContentPackZipInventory = Object.freeze({
    bytes: bytes.byteLength,
    entries: Object.freeze(inventoryEntries) as readonly ContentPackZipEntry[],
  })
  return frozenBundle({ kind: 'zip', bytes: bytes.byteLength, files, fileMap, inventory })
}

// ---------------------------------------------------------------------------
// Folder selection -> the same inventory shape
// ---------------------------------------------------------------------------

export interface ContentFolderInputFile {
  /** Bundle-relative path (the caller strips the selected folder's root). */
  readonly path: string
  readonly bytes: ArrayBuffer | Uint8Array
}

export type ContentFolderReadResult = ContentBundleReadResult

/**
 * Turn in-memory folder files into the bounded inventory the host validator
 * needs. A folder has no zip container, so inventory.bytes is the total
 * uncompressed size: the same per-file/total caps apply and the advertised zip
 * size cap becomes a (slightly stricter) whole-bundle cap.
 */
export async function readContentFolder(
  files: readonly ContentFolderInputFile[],
): Promise<ContentFolderReadResult> {
  const issues: ContentIssue[] = []
  if (!Array.isArray(files) || files.length === 0) {
    return fail([issue('$.folder', 'invalid-zip', 'folder selection is empty')])
  }
  if (files.length > CONTENT_ASSET_LIMITS.maxZipEntries) {
    return fail([
      issue('$.folder', 'zip-too-large', files.length + ' files > ' + CONTENT_ASSET_LIMITS.maxZipEntries),
    ])
  }
  const seen = new Set<string>()
  const out: ContentBundleFile[] = []
  const fileMap = new Map<string, Uint8Array>()
  const inventoryEntries: ContentPackZipEntry[] = []
  let total = 0
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    const entryPath = '$.folder[' + index + ']'
    if (file === undefined) continue
    if (!isSafeBundlePath(file.path)) {
      issues.push(issue(entryPath, 'unsafe-zip-entry', 'unsafe folder path: ' + String(file.path).slice(0, 64)))
      continue
    }
    const lower = file.path.toLowerCase()
    if (seen.has(lower)) {
      issues.push(issue(entryPath, 'duplicate-id', 'duplicate/case-colliding folder file: ' + file.path))
      continue
    }
    seen.add(lower)
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes)
    if (bytes.byteLength > CONTENT_ASSET_LIMITS.maxAssetBytes) {
      issues.push(
        issue(entryPath, 'zip-too-large', 'file ' + bytes.byteLength + ' bytes > ' + CONTENT_ASSET_LIMITS.maxAssetBytes),
      )
      continue
    }
    total += bytes.byteLength
    if (total > CONTENT_ASSET_LIMITS.maxTotalUncompressedBytes) {
      issues.push(
        issue(entryPath, 'zip-too-large', 'folder total > ' + CONTENT_ASSET_LIMITS.maxTotalUncompressedBytes),
      )
      break
    }
    const copy = bytes.slice()
    out.push({ path: file.path, bytes: copy, compressedBytes: copy.byteLength })
    fileMap.set(file.path, copy)
    inventoryEntries.push({
      path: file.path,
      bytes: copy.byteLength,
      compressedBytes: copy.byteLength,
      sha256: await sha256Hex(copy),
    })
  }
  if (issues.length > 0) return fail(issues)
  if (total <= 0) return fail([issue('$.folder', 'invalid-zip', 'folder selection has no bytes')])
  const inventory: ContentPackZipInventory = Object.freeze({
    bytes: total,
    entries: Object.freeze(inventoryEntries) as readonly ContentPackZipEntry[],
  })
  return frozenBundle({ kind: 'folder', bytes: total, files: out, fileMap, inventory })
}

// ---------------------------------------------------------------------------
// Bundle -> persisted asset list
// ---------------------------------------------------------------------------

/** True when a validated pack file is a persistable asset (under assets/). */
export function isPersistableAssetPath(path: string): boolean {
  return (
    path.startsWith('assets/') &&
    (CONTENT_ASSET_EXTENSIONS as readonly string[]).includes(assetExtension(path))
  )
}

/**
 * Collect the pack assets (png/webp/json/woff2 under assets/) from a read
 * bundle, with the sha256 the inventory already verified. Root docs and
 * pack.json itself are metadata only and are not persisted as assets.
 */
export function collectBundleAssets(
  pack: ContentPackV2,
  bundle: Pick<ContentBundle, 'fileMap' | 'inventory'>,
): readonly ContentBundleAsset[] {
  const hashes = new Map<string, string>()
  for (const entry of bundle.inventory.entries) {
    if (entry.isDirectory === true || typeof entry.sha256 !== 'string') continue
    hashes.set(entry.path, entry.sha256)
  }
  const out: ContentBundleAsset[] = []
  for (const file of pack.files) {
    if (!isPersistableAssetPath(file.path)) continue
    const bytes = bundle.fileMap.get(file.path)
    const sha256 = hashes.get(file.path)
    if (bytes === undefined || sha256 === undefined) continue
    out.push({ path: file.path, bytes, mime: assetMimeType(file.path), sha256 })
  }
  return Object.freeze(out)
}

// ---------------------------------------------------------------------------
// Asset store: IndexedDB with explicit memory fallback
// ---------------------------------------------------------------------------

/** Stable key for one asset of one pack. */
export function contentAssetKey(packId: string, path: string): string {
  return packId + '/' + path
}

function metaOf(record: ContentAssetRecord): ContentAssetMeta {
  return Object.freeze({
    key: record.key,
    packId: record.packId,
    path: record.path,
    mime: record.mime,
    size: record.bytes.byteLength,
    sha256: record.sha256,
  })
}

/** Explicit in-memory store used by tests and as IndexedDB fallback. */
export function createMemoryAssetStore(): ContentAssetStore {
  const records = new Map<string, ContentAssetRecord>()
  return Object.freeze({
    kind: 'memory' as const,
    async put(record: ContentAssetRecord): Promise<boolean> {
      if (!record || typeof record.key !== 'string' || !(record.bytes instanceof ArrayBuffer)) return false
      if (record.bytes.byteLength > CONTENT_ASSET_LIMITS.maxAssetBytes) return false
      records.set(record.key, record)
      return true
    },
    async get(packId: string, path: string): Promise<ContentAssetRecord | null> {
      return records.get(contentAssetKey(packId, path)) ?? null
    },
    async list(packId?: string): Promise<readonly ContentAssetMeta[]> {
      const out: ContentAssetMeta[] = []
      for (const record of records.values()) {
        if (packId !== undefined && record.packId !== packId) continue
        out.push(metaOf(record))
      }
      return Object.freeze(out)
    },
    async removePack(packId: string): Promise<boolean> {
      for (const key of [...records.keys()]) {
        const record = records.get(key)
        if (record?.packId === packId) records.delete(key)
      }
      return true
    },
  })
}

interface IdbStoreInternal extends ContentAssetStore {
  readonly ready: Promise<IDBDatabase | null>
}

function openIdb(factory: IDBFactory, dbName: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(dbName, 1)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      try {
        const db = request.result
        if (!db.objectStoreNames.contains(CONTENT_ASSET_STORE_NAME)) {
          db.createObjectStore(CONTENT_ASSET_STORE_NAME, { keyPath: 'key' })
        }
      } catch {
        // A failed upgrade leaves the store unusable; operations fail closed.
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      resolve(null)
    }
    request.onblocked = () => {
      resolve(null)
    }
  })
}

function createIdbAssetStore(factory: IDBFactory, dbName: string): IdbStoreInternal {
  const ready = openIdb(factory, dbName)
  const withStore = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T> | null,
  ): Promise<T | null> => {
    const db = await ready
    if (!db) return null
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(CONTENT_ASSET_STORE_NAME, mode)
        const objectStore = transaction.objectStore(CONTENT_ASSET_STORE_NAME)
        const request = action(objectStore)
        if (request === null) {
          resolve(null)
          return
        }
        request.onsuccess = () => {
          resolve(request.result)
        }
        request.onerror = () => {
          resolve(null)
        }
        transaction.onerror = () => {
          resolve(null)
        }
        transaction.onabort = () => {
          resolve(null)
        }
      } catch {
        resolve(null)
      }
    })
  }
  return {
    kind: 'indexeddb',
    ready,
    async put(record: ContentAssetRecord): Promise<boolean> {
      if (!record || typeof record.key !== 'string' || !(record.bytes instanceof ArrayBuffer)) return false
      if (record.bytes.byteLength > CONTENT_ASSET_LIMITS.maxAssetBytes) return false
      const result = await withStore<IDBValidKey>('readwrite', (objectStore) => objectStore.put(record))
      return result !== null
    },
    async get(packId: string, path: string): Promise<ContentAssetRecord | null> {
      const key = contentAssetKey(packId, path)
      const record = await withStore<ContentAssetRecord | undefined>('readonly', (objectStore) =>
        objectStore.get(key),
      )
      return record ?? null
    },
    async list(packId?: string): Promise<readonly ContentAssetMeta[]> {
      const all = await withStore<ContentAssetRecord[]>('readonly', (objectStore) => objectStore.getAll())
      if (!Array.isArray(all)) return Object.freeze([])
      const out: ContentAssetMeta[] = []
      for (const record of all) {
        if (record === undefined || record === null) continue
        if (packId !== undefined && record.packId !== packId) continue
        if (!(record.bytes instanceof ArrayBuffer)) continue
        out.push(metaOf(record))
      }
      return Object.freeze(out)
    },
    async removePack(packId: string): Promise<boolean> {
      const all = await withStore<ContentAssetRecord[]>('readonly', (objectStore) => objectStore.getAll())
      if (!Array.isArray(all)) return false
      let ok = true
      for (const record of all) {
        if (record === undefined || record === null || record.packId !== packId) continue
        const result = await withStore<undefined>('readwrite', (objectStore) => objectStore.delete(record.key))
        if (result === null) ok = false
      }
      return ok
    },
  }
}

function resolveIdbFactory(factory?: IDBFactory | null): IDBFactory | null {
  if (factory !== undefined) return factory
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB
  } catch {
    return null
  }
}

/**
 * Open the local asset store. Uses IndexedDB when available and falls back to
 * an in-memory store (assets last for the session only) when it is not; it
 * never throws because of a blocked/quota/private-mode database.
 */
export async function openContentAssetStore(
  options: ContentAssetStoreOptions = {},
): Promise<ContentAssetStore> {
  const factory = resolveIdbFactory(options.factory)
  if (!factory) return createMemoryAssetStore()
  const dbName = options.dbName ?? CONTENT_ASSET_STORE_DB
  const store = createIdbAssetStore(factory, dbName)
  const db = await store.ready
  if (db === null) return createMemoryAssetStore()
  return store
}

// ---------------------------------------------------------------------------
// Local URLs (object URL preferred; data URL fallback) + CSS application
// ---------------------------------------------------------------------------

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function bytesToBase64(bytes: Uint8Array): string {
  const out: string[] = []
  for (let index = 0; index < bytes.byteLength; index += 3) {
    const first = bytes[index] ?? 0
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    const triple = (first << 16) | ((second ?? 0) << 8) | (third ?? 0)
    out.push(BASE64_ALPHABET[(triple >>> 18) & 63] as string)
    out.push(BASE64_ALPHABET[(triple >>> 12) & 63] as string)
    out.push(second === undefined ? '=' : (BASE64_ALPHABET[(triple >>> 6) & 63] as string))
    out.push(third === undefined ? '=' : (BASE64_ALPHABET[triple & 63] as string))
  }
  return out.join('')
}

/** Object-URL adapter when the platform supports Blob URLs; data URL otherwise. */
export function createDefaultObjectUrlAdapter(): ContentObjectUrlAdapter {
  try {
    const hasBlob = typeof Blob === 'function'
    const canObjectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    if (hasBlob && canObjectUrl) {
      return Object.freeze({
        kind: 'object-url' as const,
        create(record: ContentAssetRecord): string {
          return URL.createObjectURL(new Blob([record.bytes], { type: record.mime }))
        },
        revoke(url: string): void {
          try {
            URL.revokeObjectURL(url)
          } catch {
            // already revoked
          }
        },
      })
    }
  } catch {
    // Fall through to the data-url adapter.
  }
  return Object.freeze({
    kind: 'data-url' as const,
    create(record: ContentAssetRecord): string {
      return 'data:' + record.mime + ';base64,' + bytesToBase64(new Uint8Array(record.bytes))
    },
    revoke(): void {},
  })
}

/** Registry that maps stored records to local URLs and owns their lifetime. */
export function createAssetUrlRegistry(
  adapter: ContentObjectUrlAdapter = createDefaultObjectUrlAdapter(),
): ContentAssetUrls {
  const byKey = new Map<string, string>()
  const known = new Set<string>()
  return Object.freeze({
    kind: adapter.kind,
    urlFor(record: ContentAssetRecord): string {
      const key = contentAssetKey(record.packId, record.path)
      const existing = byKey.get(key)
      if (existing !== undefined && known.has(existing)) return existing
      const url = adapter.create(record)
      byKey.set(key, url)
      known.add(url)
      return url
    },
    has(url: string): boolean {
      return typeof url === 'string' && known.has(url)
    },
    release(url: string): void {
      if (!known.has(url)) return
      known.delete(url)
      for (const [key, value] of byKey) {
        if (value === url) byKey.delete(key)
      }
      try {
        adapter.revoke(url)
      } catch {
        // revoked already
      }
    },
    releaseAll(): void {
      for (const url of known) {
        try {
          adapter.revoke(url)
        } catch {
          // revoked already
        }
      }
      known.clear()
      byKey.clear()
    },
  })
}

function isLocalUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length === 0 || url.length > 8 * 1024 * 1024) return false
  if (/[\s"'\\()]/.test(url)) return false
  return url.startsWith('blob:') || /^data:image\/[a-z0-9.+-]+;base64,/i.test(url)
}

/**
 * Apply a registry-created image URL as the pet background. Only URLs this
 * process created are accepted (no remote URL can reach this helper), and the
 * resulting CSS value is a quoted url() built from that URL.
 */
export function applyAssetBackgroundUrl(
  root: ContentCssRootLike,
  url: string,
  urls: Pick<ContentAssetUrls, 'has'>,
): boolean {
  if (!urls.has(url) || !isLocalUrl(url)) return false
  try {
    root.style.setProperty(CONTENT_ASSET_BACKGROUND_VAR, 'url("' + url + '")')
    return true
  } catch {
    return false
  }
}

/** Remove the asset background override (CSS fallback takes over again). */
export function clearAssetBackground(root: ContentCssRootLike): void {
  try {
    root.style.removeProperty(CONTENT_ASSET_BACKGROUND_VAR)
  } catch {
    // Read-only style objects are ignored.
  }
}

// ---------------------------------------------------------------------------
// FontFace registration for validated woff2 assets
// ---------------------------------------------------------------------------

function fnv1a(text: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Deterministic, attacker-safe CSS family alias for a pack font asset. */
export function packFontFamilyAlias(packId: string, path: string): string {
  const slug = String(packId)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return 'famling-pack-' + (slug || 'font') + '-' + fnv1a(String(packId) + '\n' + String(path))
}

function resolveFontSet(deps: ContentFontFaceDeps): ContentFontSetLike | null {
  if (deps.fontSet !== undefined) return deps.fontSet
  try {
    if (typeof document === 'undefined') return null
    return document.fonts as unknown as ContentFontSetLike
  } catch {
    return null
  }
}

function resolveFontFaceFactory(deps: ContentFontFaceDeps): ContentFontFaceFactory | null {
  if (deps.createFontFace !== undefined) return deps.createFontFace
  try {
    if (typeof FontFace !== 'function') return null
    return (family: string, source: ArrayBuffer): ContentFontFaceLike => new FontFace(family, source)
  } catch {
    return null
  }
}

/**
 * Register one validated woff2 asset under a generated family alias. Returns
 * the family only after font.load() resolved and the set accepted it; any
 * failure is a non-throwing ok:false. The caller owns cleanup through
 * unregisterPackFont().
 */
export async function registerPackFont(
  record: ContentAssetRecord,
  deps: ContentFontFaceDeps = {},
): Promise<ContentFontRegistration> {
  if (!record || typeof record.path !== 'string' || assetExtension(record.path) !== 'woff2') {
    return Object.freeze({ ok: false as const, reason: 'only .woff2 assets can be registered as fonts' })
  }
  if (!(record.bytes instanceof ArrayBuffer) || record.bytes.byteLength === 0) {
    return Object.freeze({ ok: false as const, reason: 'font asset is empty' })
  }
  if (record.bytes.byteLength > CONTENT_ASSET_LIMITS.maxAssetBytes) {
    return Object.freeze({ ok: false as const, reason: 'font asset exceeds the size cap' })
  }
  const fontSet = resolveFontSet(deps)
  const createFontFace = resolveFontFaceFactory(deps)
  if (!fontSet || !createFontFace) {
    return Object.freeze({ ok: false as const, reason: 'FontFace API is unavailable' })
  }
  const family = packFontFamilyAlias(record.packId, record.path)
  let font: ContentFontFaceLike
  try {
    font = createFontFace(family, record.bytes.slice(0))
  } catch {
    return Object.freeze({ ok: false as const, reason: 'FontFace construction failed' })
  }
  try {
    await font.load()
  } catch {
    return Object.freeze({ ok: false as const, reason: 'font failed to load' })
  }
  try {
    fontSet.add(font)
  } catch {
    return Object.freeze({ ok: false as const, reason: 'font set rejected the face' })
  }
  return Object.freeze({ ok: true as const, family, font })
}

/** Remove a previously registered pack font (safe for missing sets). */
export function unregisterPackFont(
  registry: Pick<ContentFontRegistration, 'font'> | ContentFontFaceLike | null,
  deps: ContentFontFaceDeps = {},
): boolean {
  const font =
    registry !== null && typeof registry === 'object' && 'font' in registry
      ? (registry as Pick<ContentFontRegistration, 'font'>).font
      : (registry as ContentFontFaceLike | null)
  if (!font) return false
  const fontSet = resolveFontSet(deps)
  if (!fontSet) return false
  try {
    return fontSet.delete(font)
  } catch {
    return false
  }
}

/**
 * Apply a registered pack font family (generated alias) to the doc font var.
 * Only aliases produced by packFontFamilyAlias() are accepted.
 */
export function applyAssetFontFamily(root: ContentCssRootLike, family: string): boolean {
  if (typeof family !== 'string' || !/^famling-pack-[a-z0-9-]+$/.test(family)) return false
  try {
    root.style.setProperty(CONTENT_ASSET_FONT_VAR, '"' + family + '"')
    return true
  } catch {
    return false
  }
}

/** Remove the pack-font override (the catalog font selection takes over again). */
export function clearAssetFontFamily(root: ContentCssRootLike): void {
  try {
    root.style.removeProperty(CONTENT_ASSET_FONT_VAR)
  } catch {
    // Read-only style objects are ignored.
  }
}

// ---------------------------------------------------------------------------
// Convenience: one validated pack -> records ready for the store
// ---------------------------------------------------------------------------

/** Build store records for every collected asset of a validated pack. */
export function buildAssetRecords(
  packId: string,
  assets: readonly ContentBundleAsset[],
): readonly ContentAssetRecord[] {
  const out: ContentAssetRecord[] = []
  for (const asset of assets) {
    const bytes = asset.bytes.slice()
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    out.push({
      key: contentAssetKey(packId, asset.path),
      packId,
      path: asset.path,
      mime: asset.mime,
      bytes: buffer,
      sha256: asset.sha256,
    })
  }
  return Object.freeze(out)
}

/** Persist every asset record; returns how many were stored successfully. */
export async function persistAssetRecords(
  store: ContentAssetStore,
  records: readonly ContentAssetRecord[],
): Promise<{ readonly stored: number; readonly failed: number }> {
  let stored = 0
  let failed = 0
  for (const record of records) {
    const ok = await store.put(record)
    if (ok) stored += 1
    else failed += 1
  }
  return Object.freeze({ stored, failed })
}
