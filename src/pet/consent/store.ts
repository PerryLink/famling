/**
 * Consent persistence adapter (browser localStorage + safe in-memory fallback).
 *
 * Safety requirements (see docs/audit/CONSENT-IMPLEMENTATION-2026-11-17.md):
 * - a `localStorage` that is missing, blocked (privacy mode/iframe) or throwing
 *   must never crash the app, and must never be reported as a persisted consent;
 *   the gate falls back to per-session memory and shows a storage warning;
 * - corrupted JSON is treated as "no acceptance" (fail closed: prompt again),
 *   not as "accepted" and not as a hard error;
 * - the audit log is stored next to the acceptance, but the gate never reads it
 *   back as an exemption.
 */
import {
  ACCEPTANCE_STORAGE_KEY,
  AUDIT_STORAGE_KEY,
  appendAuditRaw,
  createMemoryStorage,
  parseAcceptanceRaw,
  parseAuditRaw,
  serializeAcceptance,
  acceptanceStatus,
  type AcceptanceStatus,
  type AuditEntry,
  type StorageLike,
  type TosAcceptance,
} from './core.ts'
import {
  AGE_STORAGE_KEY,
  parseAgeVerificationRaw,
  serializeAgeVerification,
  type AgeReadStatus,
  type AgeVerification,
} from './age.ts'
import { TOS_HASH, TOS_VERSION } from './terms.ts'

const PROBE_KEY = 'desktop-games/consent/storage-probe-v1'

export interface ConsentStoreSnapshot {
  readonly acceptance: TosAcceptance | null
  readonly status: AcceptanceStatus
  readonly corrupt: boolean
  readonly persistence: 'local' | 'memory'
  readonly storageError: boolean
}

/** Read-only age self-report view from the local store (never a consent). */
export interface AgeStoreSnapshot {
  readonly record: AgeVerification | null
  readonly status: AgeReadStatus
  readonly corrupt: boolean
  readonly persistence: 'local' | 'memory'
}

export interface ConsentStorePort {
  readonly persistence: 'local' | 'memory'
  load(): ConsentStoreSnapshot
  saveAcceptance(acceptance: TosAcceptance): boolean
  readAudit(): AuditEntry[]
  appendAudit(entry: AuditEntry): boolean
  /** GDPR/PIPL erasure of the consent record itself (memory mirror included). */
  clearAcceptance(): boolean
  /** User-initiated clear of the consent audit (does not grant/withdraw anything). */
  clearAudit(): boolean
  /**
   * Re-write the audit with only the minimized whitelist fields (drops legacy
   * `detail`/oversized targets). Returns the number of retained entries.
   */
  compactAudit(): number
  /** Load the self-reported birth date; corrupt/invalid data fails closed. */
  loadAge(now?: Date): AgeStoreSnapshot
  /** Persist the self-report + verification timestamp (local only). */
  saveAge(record: AgeVerification): boolean
  /** Erase the age self-report from BOTH storage and the memory mirror. */
  clearAge(): boolean
}

export interface ConsentStoreOptions {
  /** Inject a fake storage in Node tests; `undefined` means "probe the browser". */
  readonly storage?: StorageLike | null
  readonly version?: string
  readonly hash?: string
}

/**
 * Return a writable localStorage, or null when access is blocked/missing.
 * The probe is the only write this module performs before any consent: it is a
 * capability check for the consent record itself, not user content.
 */
/** Probe writability of a storage candidate without keeping any probe data. */
export function probeStorage(candidate: StorageLike | null | undefined): candidate is StorageLike {
  if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') return false
  try {
    candidate.setItem(PROBE_KEY, '1')
    candidate.removeItem?.(PROBE_KEY)
    return true
  } catch {
    return false
  }
}

export function resolveBrowserStorage(): StorageLike | null {
  try {
    if (typeof globalThis === 'undefined') return null
    const candidate = (globalThis as { localStorage?: StorageLike }).localStorage
    return probeStorage(candidate) ? candidate : null
  } catch {
    return null
  }
}

export function createConsentStore(options: ConsentStoreOptions = {}): ConsentStorePort {
  const version = options.version ?? TOS_VERSION
  const hash = options.hash ?? TOS_HASH
  const injected = options.storage
  const resolved = injected === undefined ? resolveBrowserStorage() : probeStorage(injected) ? injected : null
  const memory = createMemoryStorage()
  const target: StorageLike = resolved ?? memory
  const persistence: 'local' | 'memory' = resolved ? 'local' : 'memory'
  // Even in "local" mode keep a memory mirror: a transient write failure must
  // not lose the current session's explicit consent.
  let storageError = false

  const readRaw = (key: string): string | null => {
    try {
      const raw = target.getItem(key)
      if (raw !== null) return raw
    } catch {
      storageError = true
    }
    try {
      return memory.getItem(key)
    } catch {
      return null
    }
  }

  const writeRaw = (key: string, value: string): boolean => {
    memory.setItem(key, value)
    try {
      target.setItem(key, value)
      return true
    } catch {
      storageError = true
      return false
    }
  }

  const load = (): ConsentStoreSnapshot => {
    storageError = false
    let raw: string | null = null
    let readFailed = false
    try {
      raw = target.getItem(ACCEPTANCE_STORAGE_KEY)
    } catch {
      readFailed = true
      storageError = true
      try {
        raw = memory.getItem(ACCEPTANCE_STORAGE_KEY)
      } catch {
        raw = null
      }
    }
    if (raw === null) {
      const mirrored = memory.getItem(ACCEPTANCE_STORAGE_KEY)
      if (mirrored !== null) raw = mirrored
    }
    const parsed = parseAcceptanceRaw(raw)
    const status: AcceptanceStatus = parsed.acceptance
      ? acceptanceStatus(parsed.acceptance, version, hash)
      : readFailed
        ? 'unavailable'
        : parsed.status
    return {
      acceptance: parsed.acceptance,
      status,
      corrupt: parsed.corrupt,
      persistence,
      storageError,
    }
  }

  const saveAcceptance = (acceptance: TosAcceptance): boolean => {
    storageError = false
    return writeRaw(ACCEPTANCE_STORAGE_KEY, serializeAcceptance(acceptance))
  }

  const readAudit = (): AuditEntry[] => {
    try {
      return parseAuditRaw(readRaw(AUDIT_STORAGE_KEY)).entries
    } catch {
      storageError = true
      return []
    }
  }

  const appendAudit = (entry: AuditEntry): boolean => {
    try {
      const existing = readRaw(AUDIT_STORAGE_KEY)
      return writeRaw(AUDIT_STORAGE_KEY, appendAuditRaw(existing, entry))
    } catch {
      storageError = true
      return false
    }
  }

  /**
   * Remove a key from BOTH the real storage and the session memory mirror, then
   * verify it is gone. Failure (blocked/read-only storage) returns false so the
   * caller never reports an erasure that did not happen.
   */
  const removeVerified = (key: string): boolean => {
    let removed = true
    try {
      target.removeItem?.(key)
    } catch {
      storageError = true
      removed = false
    }
    try {
      memory.removeItem?.(key)
    } catch {
      removed = false
    }
    try {
      if (target.getItem(key) !== null) removed = false
    } catch {
      removed = false
    }
    try {
      if (memory.getItem(key) !== null) removed = false
    } catch {
      removed = false
    }
    return removed
  }

  const clearAcceptance = (): boolean => removeVerified(ACCEPTANCE_STORAGE_KEY)

  const clearAudit = (): boolean => {
    const cleared = removeVerified(AUDIT_STORAGE_KEY)
    return cleared && readAudit().length === 0
  }

  const compactAudit = (): number => {
    try {
      // readAudit() already normalizes every entry through the minimization
      // whitelist, so rewriting it drops legacy/extra fields.
      const entries = readAudit()
      if (entries.length === 0) {
        removeVerified(AUDIT_STORAGE_KEY)
        return 0
      }
      writeRaw(AUDIT_STORAGE_KEY, JSON.stringify(entries))
      return entries.length
    } catch {
      storageError = true
      return 0
    }
  }

  const loadAge = (now: Date = new Date()): AgeStoreSnapshot => {
    let raw: string | null = null
    let readFailed = false
    try {
      raw = target.getItem(AGE_STORAGE_KEY)
    } catch {
      readFailed = true
      storageError = true
    }
    if (raw === null) {
      try {
        raw = memory.getItem(AGE_STORAGE_KEY)
      } catch {
        raw = null
      }
    }
    const parsed = parseAgeVerificationRaw(raw, now)
    const status: AgeReadStatus = readFailed && parsed.status === 'missing' ? 'unavailable' : parsed.status
    return { record: parsed.record, status, corrupt: parsed.corrupt, persistence }
  }

  const saveAge = (record: AgeVerification): boolean => {
    storageError = false
    return writeRaw(AGE_STORAGE_KEY, serializeAgeVerification(record))
  }

  const clearAge = (): boolean => removeVerified(AGE_STORAGE_KEY)

  return {
    persistence,
    load,
    saveAcceptance,
    readAudit,
    appendAudit,
    clearAcceptance,
    clearAudit,
    compactAudit,
    loadAge,
    saveAge,
    clearAge,
  }
}
