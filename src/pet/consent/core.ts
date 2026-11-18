/**
 * Pure consent data model: acceptance record, audit log, and safe (de)serialization.
 *
 * Invariants that the tests lock (see tests/consent.test.ts):
 * - The acceptance record is the ONLY thing that can suppress the first-run TOS
 *   modal, and only when BOTH `tosVersion` AND `tosHash` match the current text.
 * - The audit log is write-only from the gate's perspective: it is never read as
 *   an exemption, so every modification/DLC/TTS action still prompts.
 * - Corrupt JSON / missing keys / storage errors degrade to "not accepted"
 *   instead of throwing or silently granting consent.
 * - MINIMIZATION (P0, review 2026-11-17 02-privacy-data): the consent audit
 *   keeps only what the TOS §13 promises (time/action/decision/TOS version+hash,
 *   plus a short target/scope and the TTS/ASR declaration versions+hashes). The
 *   verbose `detail` copy is NOT persisted, targets are bounded, and every
 *   parsed entry is re-normalized through the whitelist so older/longer records
 *   cannot keep extra fields around. No user text is ever written.
 */
import { TOS_HASH, TOS_VERSION, type LegalSection } from './terms.ts'

export const ACCEPTANCE_STORAGE_KEY = 'desktop-games/consent/tos-acceptance-v1'
export const AUDIT_STORAGE_KEY = 'desktop-games/consent/audit-v1'
export const CONSENT_FORMAT = 'pet-consent-acceptance'
export const CONSENT_SCHEMA = 1
export const AUDIT_SCHEMA = 1
export const AUDIT_LIMIT = 100
/** Bounded persisted fields: target/scope only, never free-form user text. */
export const AUDIT_TARGET_MAX_CHARS = 64
const AUDIT_ACTION_MAX_CHARS = 64
const AUDIT_VERSION_MAX_CHARS = 32
const AUDIT_HASH_MAX_CHARS = 64
const AUDIT_KINDS: readonly AuditKind[] = ['tos', 'action', 'tts', 'asr', 'roleplay', 'health', 'age']

export type ConsentDecision = 'accept' | 'decline'
export type AuditDecision = ConsentDecision | 'ack'
export type ConsentMode = 'pending' | 'accepted' | 'readonly'
export type AuditKind = 'tos' | 'action' | 'tts' | 'asr' | 'roleplay' | 'health' | 'age'
export type TosPromptReason = 'first-run' | 'version-upgrade' | 'action' | 'reopen'

export interface TosAcceptance {
  readonly format: typeof CONSENT_FORMAT
  readonly schema: typeof CONSENT_SCHEMA
  readonly tosVersion: string
  readonly tosHash: string
  readonly acceptedAt: string
}

export type AcceptanceStatus =
  | 'accepted'
  | 'missing'
  | 'version-mismatch'
  | 'hash-mismatch'
  | 'corrupt'
  | 'unavailable'

export interface AcceptanceRead {
  readonly acceptance: TosAcceptance | null
  readonly status: AcceptanceStatus
  readonly corrupt: boolean
}

export interface AuditEntry {
  readonly schema: typeof AUDIT_SCHEMA
  readonly at: string
  readonly kind: AuditKind
  readonly action: string
  readonly decision: AuditDecision
  readonly tosVersion: string
  readonly tosHash: string
  readonly ttsVersion?: string
  readonly ttsHash?: string
  readonly asrVersion?: string
  readonly asrHash?: string
  readonly roleplayVersion?: string
  readonly roleplayHash?: string
  /** Short scope/target (action id, pack id, config signature); bounded. */
  readonly target?: string
}

export interface AuditInput {
  readonly kind: AuditKind
  readonly action: string
  readonly decision: AuditDecision
  readonly at: string
  readonly tosVersion?: string
  readonly tosHash?: string
  readonly ttsVersion?: string
  readonly ttsHash?: string
  readonly asrVersion?: string
  readonly asrHash?: string
  readonly roleplayVersion?: string
  readonly roleplayHash?: string
  readonly target?: string
}

/** Minimal storage surface so tests/Node never need a DOM/localStorage. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
}

export function createAcceptance(tosVersion: string, tosHash: string, acceptedAt: string): TosAcceptance {
  return { format: CONSENT_FORMAT, schema: CONSENT_SCHEMA, tosVersion, tosHash, acceptedAt }
}

export function serializeAcceptance(acceptance: TosAcceptance): string {
  return JSON.stringify(acceptance)
}

/** Parse an accepted record; corrupted/malformed data is surfaced, never trusted. */
export function parseAcceptanceRaw(raw: string | null | undefined): AcceptanceRead {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { acceptance: null, status: 'missing', corrupt: false }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { acceptance: null, status: 'corrupt', corrupt: true }
  }
  if (!isRecord(parsed)) return { acceptance: null, status: 'corrupt', corrupt: true }
  if (
    parsed.format !== CONSENT_FORMAT ||
    parsed.schema !== CONSENT_SCHEMA ||
    !isNonEmptyString(parsed.tosVersion) ||
    !isNonEmptyString(parsed.tosHash) ||
    !isValidIsoDate(parsed.acceptedAt)
  ) {
    return { acceptance: null, status: 'corrupt', corrupt: true }
  }
  const acceptance: TosAcceptance = {
    format: CONSENT_FORMAT,
    schema: CONSENT_SCHEMA,
    tosVersion: parsed.tosVersion,
    tosHash: parsed.tosHash,
    acceptedAt: parsed.acceptedAt,
  }
  return { acceptance, status: acceptanceStatus(acceptance), corrupt: false }
}

/** Current-text compatibility check: version first, then the exact text hash. */
export function acceptanceStatus(
  acceptance: TosAcceptance,
  version: string = TOS_VERSION,
  hash: string = TOS_HASH,
): AcceptanceStatus {
  if (acceptance.tosVersion !== version) return 'version-mismatch'
  if (acceptance.tosHash !== hash) return 'hash-mismatch'
  return 'accepted'
}

/** Audit parsing is fail-open only in the sense that it never blocks use. */
export function parseAuditRaw(raw: string | null | undefined): { entries: AuditEntry[]; corrupt: boolean } {
  if (raw === null || raw === undefined || raw.trim() === '') return { entries: [], corrupt: false }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { entries: [], corrupt: true }
  }
  if (!Array.isArray(parsed)) return { entries: [], corrupt: true }
  const minimized = parsed.map((entry) => minimizeAuditEntry(entry))
  const entries = minimized
    .filter((entry): entry is AuditEntry => entry !== null)
    .slice(-AUDIT_LIMIT)
  return { entries, corrupt: entries.length !== parsed.length }
}

/** Strip control characters and clamp to `max` code points (no user text). */
export function boundAuditField(value: string, max: number): string {
  let out = ''
  let count = 0
  for (const char of value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()) {
    if (count >= max) break
    out += char
    count += 1
  }
  return out
}

/**
 * Whitelist + bounds normalizer for persisted audit entries. Used on write and
 * on read, so unknown/legacy fields (`detail`, oversized targets) can never
 * survive a round-trip through this app's audit log.
 */
export function minimizeAuditEntry(input: AuditEntry | Record<string, unknown>): AuditEntry | null {
  if (!isRecord(input)) return null
  const record = input
  if (
    record.schema !== AUDIT_SCHEMA ||
    typeof record.at !== 'string' ||
    !isValidIsoDate(record.at) ||
    typeof record.kind !== 'string' ||
    !AUDIT_KINDS.includes(record.kind as AuditKind) ||
    typeof record.action !== 'string' ||
    record.action.length === 0 ||
    (record.decision !== 'accept' && record.decision !== 'decline' && record.decision !== 'ack') ||
    typeof record.tosVersion !== 'string' ||
    record.tosVersion.length === 0 ||
    typeof record.tosHash !== 'string' ||
    record.tosHash.length === 0
  ) {
    return null
  }
  const optional = (key: string, max: number): Record<string, string> => {
    const value = record[key]
    if (typeof value !== 'string' || value.trim() === '') return {}
    return { [key]: boundAuditField(value, max) }
  }
  return {
    schema: AUDIT_SCHEMA,
    at: boundAuditField(record.at, 40),
    kind: record.kind as AuditKind,
    action: boundAuditField(record.action, AUDIT_ACTION_MAX_CHARS),
    decision: record.decision,
    tosVersion: boundAuditField(record.tosVersion, AUDIT_VERSION_MAX_CHARS),
    tosHash: boundAuditField(record.tosHash, AUDIT_HASH_MAX_CHARS),
    ...optional('ttsVersion', AUDIT_VERSION_MAX_CHARS),
    ...optional('ttsHash', AUDIT_HASH_MAX_CHARS),
    ...optional('asrVersion', AUDIT_VERSION_MAX_CHARS),
    ...optional('asrHash', AUDIT_HASH_MAX_CHARS),
    ...optional('roleplayVersion', AUDIT_VERSION_MAX_CHARS),
    ...optional('roleplayHash', AUDIT_HASH_MAX_CHARS),
    ...optional('target', AUDIT_TARGET_MAX_CHARS),
  }
}

export function createAuditEntry(input: AuditInput): AuditEntry {
  return {
    schema: AUDIT_SCHEMA,
    at: boundAuditField(input.at, 40),
    kind: input.kind,
    action: boundAuditField(input.action, AUDIT_ACTION_MAX_CHARS),
    decision: input.decision,
    tosVersion: boundAuditField(input.tosVersion ?? TOS_VERSION, AUDIT_VERSION_MAX_CHARS),
    tosHash: boundAuditField(input.tosHash ?? TOS_HASH, AUDIT_HASH_MAX_CHARS),
    ...(input.ttsVersion ? { ttsVersion: boundAuditField(input.ttsVersion, AUDIT_VERSION_MAX_CHARS) } : {}),
    ...(input.ttsHash ? { ttsHash: boundAuditField(input.ttsHash, AUDIT_HASH_MAX_CHARS) } : {}),
    ...(input.asrVersion ? { asrVersion: boundAuditField(input.asrVersion, AUDIT_VERSION_MAX_CHARS) } : {}),
    ...(input.asrHash ? { asrHash: boundAuditField(input.asrHash, AUDIT_HASH_MAX_CHARS) } : {}),
    ...(input.roleplayVersion ? { roleplayVersion: boundAuditField(input.roleplayVersion, AUDIT_VERSION_MAX_CHARS) } : {}),
    ...(input.roleplayHash ? { roleplayHash: boundAuditField(input.roleplayHash, AUDIT_HASH_MAX_CHARS) } : {}),
    ...(input.target ? { target: boundAuditField(input.target, AUDIT_TARGET_MAX_CHARS) } : {}),
  }
}

/** Append with a cap; a corrupt existing log is replaced by a fresh array. */
export function appendAuditRaw(
  existingRaw: string | null | undefined,
  entry: AuditEntry,
  limit: number = AUDIT_LIMIT,
): string {
  const { entries } = parseAuditRaw(existingRaw)
  const next = [...entries, entry].slice(-limit)
  return JSON.stringify(next)
}

/**
 * In-memory storage used when localStorage is absent/throwing/corrupt-adjacent.
 * Consent still works for the session, but never claims persistence.
 */
export function createMemoryStorage(initial: Readonly<Record<string, string>> = {}): StorageLike {
  const entries = new Map<string, string>(Object.entries(initial))
  return {
    getItem(key: string): string | null {
      return entries.has(key) ? entries.get(key)! : null
    },
    setItem(key: string, value: string): void {
      entries.set(key, value)
    },
    removeItem(key: string): void {
      entries.delete(key)
    },
  }
}

/** The exact request payload a UI port receives for a full-TOS prompt. */
export interface TosPrompt {
  readonly reason: TosPromptReason
  readonly title: string
  readonly tosVersion: string
  readonly tosHash: string
  readonly sections: readonly LegalSection[]
  readonly plainText: string
  readonly action?: string
  readonly detail?: string
  readonly target?: string
  readonly storageWarning?: string
  readonly previousTosVersion?: string
  readonly previousTosHash?: string
}
