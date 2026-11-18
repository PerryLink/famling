/**
 * Local, append-only safety-review ledger (content-trust audit trail).
 *
 * LEGAL/PRIVACY CONTRACT (P0, review-2026-11-17 05-content-trust):
 * - The ledger NEVER stores the reviewed text, a readable excerpt, or the
 *   gate's `safeText`/`redacted` text. It stores only:
 *   timestamp, direction, disposition, risk categories, rule ids, a SALTED
 *   SHA-256 hash of the text, and the text length.
 * - The hash is salted with a random per-install salt kept in localStorage;
 *   without that salt the hash cannot be matched against a known-text corpus.
 * - Entries are append-only from the app's perspective (no update API); the
 *   user can view, export (only for complaints/law-enforcement) and clear the
 *   log from About, and "delete all local data" removes it.
 * - It is capped (`SAFETY_AUDIT_LIMIT`) so it cannot grow without bound.
 * - It is NOT evidence-grade: no hash chain, no trusted timestamp, no
 *   tamper-evidence. The UI/docs must say so (see docs/audit/DATA-CONTROLS).
 *
 * Pure/Node-testable: storage and clock are injected; the browser storage is
 * resolved lazily (first read/write) so importing this module before consent
 * performs no write.
 */
import { RISK_CATEGORIES, SAFETY_DIRECTIONS, type SafetyDirection, type SafetyDisposition } from '../safety/taxonomy.ts'
import { isRecord, type StorageLike } from './core.ts'
import { sha256Hex } from './hash.ts'

export const SAFETY_AUDIT_STORAGE_KEY = 'desktop-games/consent/safety-audit-v1'
export const SAFETY_AUDIT_SALT_KEY = 'desktop-games/consent/safety-audit-salt-v1'
export const SAFETY_AUDIT_FORMAT = 'pagefold-safety-audit'
export const SAFETY_AUDIT_SCHEMA = 1
/** Rolling cap: older entries are dropped before newer ones are appended. */
export const SAFETY_AUDIT_LIMIT = 200
/** Bounded arrays / hash / length so a hostile storage value cannot bloat the UI. */
const MAX_CATEGORIES = 8
const MAX_RULE_IDS = 8
const MAX_RULE_ID_CHARS = 48
const MAX_HASH_CHARS = 64
const MAX_TEXT_LENGTH = 10_000_000
const SALT_CHARS = 32
const HASH_CHARS = 32

export type SafetyAuditDirection = SafetyDirection
export type SafetyAuditDisposition = SafetyDisposition
export type SafetyAuditDegraded = boolean

export interface SafetyAuditEntry {
  readonly schema: typeof SAFETY_AUDIT_SCHEMA
  readonly at: string
  readonly direction: SafetyAuditDirection
  readonly disposition: SafetyAuditDisposition
  /** A remote checker failed and the gate proceeded fail-open. */
  readonly degraded: boolean
  readonly categories: readonly string[]
  readonly ruleIds: readonly string[]
  /** Salted SHA-256, truncated; never the text or a reversible digest. */
  readonly textHash: string
  readonly length: number
}

/** Structural subset of `SafetyReview` from the safety layer (no runtime import). */
export interface SafetyReviewLike {
  readonly direction?: string
  readonly allowed?: boolean
  readonly disposition?: string
  readonly degraded?: boolean
  readonly findings?: readonly { readonly ruleId?: unknown; readonly category?: unknown }[]
}

export interface SafetyAuditLedgerOptions {
  /** Inject a fake storage in Node tests; `undefined` means "try browser". */
  readonly storage?: StorageLike | null
  readonly now?: () => Date
  readonly limit?: number
  /** Injectable randomness for tests (salt generation). */
  readonly randomBytes?: () => Uint8Array
}

export interface SafetyAuditExport {
  readonly format: typeof SAFETY_AUDIT_FORMAT
  readonly schema: typeof SAFETY_AUDIT_SCHEMA
  readonly exportedAt: string
  /** Purpose restriction shown in every exported file. */
  readonly purpose: string
  /** Explicit non-evidence statement so an export cannot be misrepresented. */
  readonly limitations: readonly string[]
  readonly entries: readonly SafetyAuditEntry[]
}

export const SAFETY_AUDIT_PURPOSE =
  '仅用于用户投诉、申诉或向执法机关提供线索；不得用于其他目的。'
export const SAFETY_AUDIT_LIMITATIONS = [
  '本地记录，不是证据级：无哈希链、无可信时间戳、无防篡改机制。',
  '记录不含原文，只有加盐哈希与长度；哈希不能还原原文。',
  '记录可被用户查看、清除或被其他程序修改；导出文件不构成真实性证明。',
] as const

const DIRECTION_SET = new Set<string>(SAFETY_DIRECTIONS)
const DISPOSITION_SET = new Set<string>(['allow', 'review', 'block', 'refuse'])
const CATEGORY_SET = new Set<string>(RISK_CATEGORIES)
/** Rule ids are stable ASCII slugs from the local safety rules; anything else is dropped. */
const RULE_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
const HASH_PATTERN = /^[0-9a-f]{16,64}$/
const SALT_PATTERN = /^[0-9a-f]{16,128}$/

function boundedNumber(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(Math.floor(value), MAX_TEXT_LENGTH)
}

function normalizeCategories(findings: SafetyReviewLike['findings']): string[] {
  const out: string[] = []
  for (const finding of findings ?? []) {
    if (!isRecord(finding)) continue
    const category = typeof finding.category === 'string' ? finding.category : ''
    if (CATEGORY_SET.has(category) && !out.includes(category)) out.push(category)
    if (out.length >= MAX_CATEGORIES) break
  }
  return out
}

function normalizeRuleIds(findings: SafetyReviewLike['findings']): string[] {
  const out: string[] = []
  for (const finding of findings ?? []) {
    if (!isRecord(finding)) continue
    const raw = typeof finding.ruleId === 'string' ? finding.ruleId.trim() : ''
    if (!raw || raw.length > MAX_RULE_ID_CHARS || !RULE_ID_PATTERN.test(raw)) continue
    const ruleId = raw.toLowerCase()
    if (!out.includes(ruleId)) out.push(ruleId)
    if (out.length >= MAX_RULE_IDS) break
  }
  return out
}

/** Normalize a review disposition; never invents `allow` for a blocked review. */
export function reviewDisposition(review: SafetyReviewLike): SafetyAuditDisposition {
  const declared = typeof review.disposition === 'string' ? review.disposition : ''
  if (DISPOSITION_SET.has(declared)) return declared as SafetyAuditDisposition
  return review.allowed === true ? 'allow' : 'block'
}

export function isSafetyAuditDirection(value: unknown): value is SafetyAuditDirection {
  return typeof value === 'string' && DIRECTION_SET.has(value)
}

/** Code-point length (surrogate pairs count once), capped to a sane bound. */
export function auditTextLength(text: string): number {
  let count = 0
  for (const _ of text) {
    count += 1
    if (count >= MAX_TEXT_LENGTH) break
  }
  return count
}

/** Salted hash. The delimiter prevents salt/hash prefix collisions. */
export function saltedTextHash(salt: string, text: string): string {
  const digest = sha256Hex(`${salt}\u0000${text}`)
  return digest.slice(0, HASH_CHARS)
}

interface EntryMeta {
  readonly at: string
  readonly salt: string
  readonly direction?: SafetyAuditDirection
}

/** Build one minimized entry from a review summary + the reviewed text. */
export function createSafetyAuditEntry(
  review: SafetyReviewLike,
  text: string,
  meta: EntryMeta,
): SafetyAuditEntry {
  const direction = isSafetyAuditDirection(review.direction)
    ? review.direction
    : isSafetyAuditDirection(meta.direction)
      ? meta.direction
      : 'user_input'
  return {
    schema: SAFETY_AUDIT_SCHEMA,
    at: meta.at,
    direction,
    disposition: reviewDisposition(review),
    degraded: review.degraded === true,
    categories: normalizeCategories(review.findings),
    ruleIds: normalizeRuleIds(review.findings),
    textHash: saltedTextHash(meta.salt, text),
    length: auditTextLength(text),
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATE_PATTERN.test(value) && Number.isFinite(Date.parse(value))
}

function normalizeEntry(value: unknown): SafetyAuditEntry | null {
  if (!isRecord(value)) return null
  if (value.schema !== SAFETY_AUDIT_SCHEMA) return null
  if (!isIsoDate(value.at)) return null
  if (!isSafetyAuditDirection(value.direction)) return null
  const disposition = typeof value.disposition === 'string' ? value.disposition : ''
  if (!DISPOSITION_SET.has(disposition)) return null
  if (typeof value.textHash !== 'string' || !HASH_PATTERN.test(value.textHash)) return null
  if (typeof value.length !== 'number' || !Number.isFinite(value.length) || value.length < 0) return null
  const categories = Array.isArray(value.categories)
    ? value.categories.filter((entry): entry is string => typeof entry === 'string' && CATEGORY_SET.has(entry)).slice(0, MAX_CATEGORIES)
    : []
  const ruleIds = Array.isArray(value.ruleIds)
    ? value.ruleIds
        .filter((entry): entry is string => typeof entry === 'string' && entry.length <= MAX_RULE_ID_CHARS && RULE_ID_PATTERN.test(entry))
        .slice(0, MAX_RULE_IDS)
    : []
  return {
    schema: SAFETY_AUDIT_SCHEMA,
    at: value.at,
    direction: value.direction,
    disposition: disposition as SafetyAuditDisposition,
    degraded: value.degraded === true,
    categories,
    ruleIds,
    textHash: value.textHash.slice(0, MAX_HASH_CHARS),
    length: boundedNumber(value.length),
  }
}

/** Parse a stored array; corrupted/malformed data degrades to "no entries". */
export function parseSafetyAuditRaw(raw: string | null | undefined): {
  entries: SafetyAuditEntry[]
  corrupt: boolean
} {
  if (raw === null || raw === undefined || raw.trim() === '') return { entries: [], corrupt: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { entries: [], corrupt: true }
  }
  if (!Array.isArray(parsed)) return { entries: [], corrupt: true }
  const entries = parsed.map(normalizeEntry)
  const cleaned = entries.filter((entry): entry is SafetyAuditEntry => entry !== null)
  return { entries: cleaned, corrupt: cleaned.length !== parsed.length }
}

/** Append with a rolling cap; a corrupt existing log is replaced by a fresh array. */
export function appendSafetyAuditRaw(
  existingRaw: string | null | undefined,
  entry: SafetyAuditEntry,
  limit: number = SAFETY_AUDIT_LIMIT,
): string {
  const { entries } = parseSafetyAuditRaw(existingRaw)
  const capped = Math.max(1, Math.min(limit, SAFETY_AUDIT_LIMIT))
  return JSON.stringify([...entries, entry].slice(-capped))
}

/** Browser storage, resolved without writing (no probe key before consent). */
function resolveBrowserStorage(): StorageLike | null {
  try {
    if (typeof globalThis === 'undefined') return null
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage
    if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') return null
    return candidate
  } catch {
    return null
  }
}

function defaultRandomBytes(): Uint8Array {
  const bytes = new Uint8Array(16)
  try {
    const provider = (globalThis as { crypto?: Crypto }).crypto
    if (provider?.getRandomValues) {
      provider.getRandomValues(bytes)
      return bytes
    }
  } catch {
    /* fall through to the non-crypto fallback below */
  }
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export interface SafetyAuditLedger {
  /** Where entries are currently persisted (`memory` = storage unavailable). */
  readonly persistence: 'local' | 'memory'
  readonly limit: number
  /** Append one minimized review entry; returns whether it was persisted. */
  record(review: SafetyReviewLike, text: string): boolean
  /** Entries in append order (newest last). */
  entries(): SafetyAuditEntry[]
  /** Remove every entry + the hash salt; verified when storage is available. */
  clear(): boolean
  /** JSON payload for the user-initiated complaint/law-enforcement export. */
  exportJson(): string
}

interface LedgerState {
  loaded: boolean
  entries: SafetyAuditEntry[]
  sessionSalt: string | null
}

export function createSafetyAuditLedger(options: SafetyAuditLedgerOptions = {}): SafetyAuditLedger {
  const limit = Math.max(1, Math.min(Math.floor(options.limit ?? SAFETY_AUDIT_LIMIT), SAFETY_AUDIT_LIMIT))
  const now = options.now ?? (() => new Date())
  const randomBytes = options.randomBytes ?? defaultRandomBytes
  const injected = options.storage
  let resolvedStorage: StorageLike | null | undefined = injected === undefined ? undefined : injected
  const state: LedgerState = { loaded: false, entries: [], sessionSalt: null }

  const storage = (): StorageLike | null => {
    if (resolvedStorage === undefined) resolvedStorage = resolveBrowserStorage()
    return resolvedStorage
  }

  const readRaw = (key: string): string | null => {
    const store = storage()
    if (!store) return null
    try {
      return store.getItem(key)
    } catch {
      return null
    }
  }

  const writeRaw = (key: string, value: string): boolean => {
    const store = storage()
    if (!store) return false
    try {
      store.setItem(key, value)
      return true
    } catch {
      return false
    }
  }

  const removeRaw = (key: string): boolean => {
    const store = storage()
    if (!store) return true
    try {
      if (typeof store.removeItem === 'function') store.removeItem(key)
      return store.getItem(key) === null
    } catch {
      return false
    }
  }

  const ensureLoaded = (): void => {
    if (state.loaded) return
    state.loaded = true
    state.entries = parseSafetyAuditRaw(readRaw(SAFETY_AUDIT_STORAGE_KEY)).entries
  }

  const salt = (): string => {
    if (state.sessionSalt) return state.sessionSalt
    const stored = readRaw(SAFETY_AUDIT_SALT_KEY)
    if (typeof stored === 'string' && SALT_PATTERN.test(stored.trim())) {
      state.sessionSalt = stored.trim().slice(0, 128)
      return state.sessionSalt
    }
    const generated = bytesToHex(randomBytes()).slice(0, SALT_CHARS)
    state.sessionSalt = generated
    // Persisting the salt is best-effort: without storage the hashes stay
    // session-scoped but the "no plaintext" invariant is unchanged.
    writeRaw(SAFETY_AUDIT_SALT_KEY, generated)
    return generated
  }

  const ledger: SafetyAuditLedger = {
    get persistence(): 'local' | 'memory' {
      return storage() ? 'local' : 'memory'
    },
    limit,
    record(review: SafetyReviewLike, text: string): boolean {
      ensureLoaded()
      const entry = createSafetyAuditEntry(review, text, { at: now().toISOString(), salt: salt() })
      state.entries = [...state.entries, entry].slice(-limit)
      const store = storage()
      if (!store) return false
      return writeRaw(SAFETY_AUDIT_STORAGE_KEY, JSON.stringify(state.entries))
    },
    entries(): SafetyAuditEntry[] {
      ensureLoaded()
      return [...state.entries]
    },
    clear(): boolean {
      ensureLoaded()
      state.entries = []
      state.sessionSalt = null
      const auditGone = removeRaw(SAFETY_AUDIT_STORAGE_KEY)
      const saltGone = removeRaw(SAFETY_AUDIT_SALT_KEY)
      return auditGone && saltGone
    },
    exportJson(): string {
      ensureLoaded()
      const payload: SafetyAuditExport = {
        format: SAFETY_AUDIT_FORMAT,
        schema: SAFETY_AUDIT_SCHEMA,
        exportedAt: now().toISOString(),
        purpose: SAFETY_AUDIT_PURPOSE,
        limitations: SAFETY_AUDIT_LIMITATIONS,
        entries: [...state.entries],
      }
      return JSON.stringify(payload, null, 2)
    },
  }
  return ledger
}

let singleton: SafetyAuditLedger | null = null

/**
 * Process-wide ledger shared by the About panel and the instrumented trust
 * layer in `main.ts`, so "view/clear/export" always read what the app wrote.
 */
export function getSafetyAuditLedger(): SafetyAuditLedger {
  if (!singleton) singleton = createSafetyAuditLedger()
  return singleton
}

/** Test/QA only: replace the singleton (never used by production code paths). */
export function setSafetyAuditLedgerForTests(ledger: SafetyAuditLedger | null): void {
  singleton = ledger
}
