/**
 * Defensive wrapper around Web Storage (`localStorage`/injected test storage).
 *
 * The pet currently reads/writes localStorage directly in ~15 places
 * (main.ts:127/392/450/490/580/706/712/1130/1141/1159/1180, chat-import/store.ts,
 * desktop-shell.ts). `localStorage` can be absent (SSR/tests), throw on access
 * (blocked cookies / disabled storage), return corrupted JSON, hold a save from
 * an older schema, or fail writes with QuotaExceededError. This module is the
 * pure, DOM-free helper that makes those paths boring: no throw escapes, every
 * failure is a status value the caller can branch on, and a version mismatch is
 * either migrated or reported instead of silently dropped.
 *
 * Nothing here touches the real `localStorage` unless the caller passes no
 * storage argument; tests inject a plain object.
 */

import { utf8ByteLength } from './limits.ts'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type StorageReadStatus = 'ok' | 'missing' | 'corrupt' | 'invalid' | 'unavailable' | 'version'

export interface StorageReadResult<T> {
  status: StorageReadStatus
  value?: T
  /** Version migrated from when `status === 'ok'` and a migration ran. */
  migratedFrom?: number
  /** Bounded, path-free reason for logs/tests. */
  error?: string
}

export type StorageWriteStatus = 'ok' | 'unavailable' | 'quota' | 'serialize' | 'too-large'

export interface StorageWriteResult {
  status: StorageWriteStatus
  bytes?: number
  error?: string
}

const MAX_ERROR_LENGTH = 160

function boundedError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  const clean = message.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return (clean || 'unknown error').slice(0, MAX_ERROR_LENGTH)
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  const code = (error as { code?: unknown }).code
  return (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014
  )
}

/**
 * Resolve the storage to use. `undefined` means "the global localStorage if
 * reachable", `null` means "explicitly unavailable" (tests/tools). The global
 * access itself is guarded: in a sandboxed iframe or privacy mode even
 * `typeof localStorage` can throw.
 */
export function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    return localStorage
  } catch {
    return null
  }
}

export function safeGetItem(key: string, storage?: StorageLike | null): string | null {
  const store = resolveStorage(storage)
  if (!store) return null
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

export function safeSetItem(key: string, value: string, storage?: StorageLike | null): StorageWriteStatus {
  const store = resolveStorage(storage)
  if (!store) return 'unavailable'
  try {
    store.setItem(key, value)
    return 'ok'
  } catch (error) {
    return isQuotaError(error) ? 'quota' : 'unavailable'
  }
}

export function safeRemoveItem(key: string, storage?: StorageLike | null): boolean {
  const store = resolveStorage(storage)
  if (!store) return false
  try {
    store.removeItem(key)
    return true
  } catch {
    return false
  }
}

/**
 * Finite-number read with a fallback for missing/blank/malformed/unreadable
 * values. This is the exact fix for `Number(localStorage.getItem(...) ?? 70)`:
 * a missing key is `0` for `Number(null)` and `'abc'` becomes `NaN`, which then
 * poisons audio gain / scale maths in the host.
 */
export function readFiniteNumber(key: string, fallback: number, storage?: StorageLike | null): number {
  const raw = safeGetItem(key, storage)
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

/** Integer read with clamp; non-integers and out-of-range values fall back. */
export function readClampedInt(
  key: string,
  fallback: number,
  min: number,
  max: number,
  storage?: StorageLike | null,
): number {
  const value = readFiniteNumber(key, fallback, storage)
  const rounded = Math.round(value)
  return Math.min(max, Math.max(min, rounded))
}

/** Versioned JSON envelope written by `writeVersioned`: `{"v": n, "data": ...}`. */
export interface VersionedEnvelope {
  v: number
  data: unknown
}

export interface ReadVersionedOptions<T> {
  /** Current envelope version. */
  version: number
  /** Trusted shape check; return the narrowed value or undefined. */
  validate: (value: unknown) => T | undefined
  /** Convert an older envelope to the current shape; undefined = unmigratable. */
  migrate?: (value: unknown, fromVersion: number) => unknown | undefined
  /** Return this on `missing` instead of a separate branch (optional). */
  fallback?: () => T
  /** Reject payloads above this UTF-8 size before parsing (optional). */
  maxBytes?: number
}

function envelopeVersion(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const version = (value as { v?: unknown }).v
  return typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : undefined
}

/**
 * Read + parse + version-check + migrate + validate in one guarded call.
 * Never throws. `corrupt` means JSON was unreadable, `invalid` means the shape
 * failed validation, `version` means a newer save (never overwrite it) or a
 * migration that produced an invalid value.
 */
export function readVersioned<T>(
  key: string,
  options: ReadVersionedOptions<T>,
  storage?: StorageLike | null,
): StorageReadResult<T> {
  const store = resolveStorage(storage)
  if (!store) return { status: 'unavailable', error: 'storage unavailable' }
  let raw: string | null
  try {
    raw = store.getItem(key)
  } catch (error) {
    return { status: 'unavailable', error: boundedError(error) }
  }
  if (raw === null) {
    if (options.fallback) return { status: 'ok', value: options.fallback() }
    return { status: 'missing' }
  }
  if (raw.trim() === '') return { status: 'corrupt', error: 'empty storage value' }
  if (options.maxBytes !== undefined) {
    const bytes = utf8ByteLength(raw)
    if (bytes > options.maxBytes) return { status: 'invalid', error: `payload is ${bytes} bytes > ${options.maxBytes}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { status: 'corrupt', error: boundedError(error) }
  }
  const version = envelopeVersion(parsed)
  if (version === undefined) {
    // Legacy raw value (no envelope): try to migrate from version 0.
    if (!options.migrate) return { status: 'invalid', error: 'missing version envelope' }
    let migrated: unknown
    try {
      migrated = options.migrate(parsed, 0)
    } catch (error) {
      return { status: 'invalid', error: boundedError(error) }
    }
    if (migrated === undefined) return { status: 'invalid', error: 'legacy value could not be migrated' }
    const value = options.validate(migrated)
    return value === undefined
      ? { status: 'invalid', error: 'migrated value failed validation' }
      : { status: 'ok', value, migratedFrom: 0 }
  }
  if (version > options.version) {
    return { status: 'version', error: `save version ${version} is newer than ${options.version}` }
  }
  const data = (parsed as VersionedEnvelope).data
  if (version === options.version) {
    const value = options.validate(data)
    return value === undefined
      ? { status: 'invalid', error: 'value failed validation' }
      : { status: 'ok', value }
  }
  if (!options.migrate) return { status: 'version', error: `save version ${version} < ${options.version}` }
  let migrated: unknown
  try {
    migrated = options.migrate(data, version)
  } catch (error) {
    return { status: 'invalid', error: boundedError(error) }
  }
  if (migrated === undefined) return { status: 'version', error: `save version ${version} cannot be migrated` }
  const value = options.validate(migrated)
  return value === undefined
    ? { status: 'invalid', error: 'migrated value failed validation' }
    : { status: 'ok', value, migratedFrom: version }
}

export interface WriteVersionedOptions {
  version: number
  /** Reject payloads above this UTF-8 size (defence against unbounded state). */
  maxBytes?: number
}

/** Serialize + version + guarded write. Never throws. */
export function writeVersioned(
  key: string,
  data: unknown,
  options: WriteVersionedOptions,
  storage?: StorageLike | null,
): StorageWriteResult {
  const store = resolveStorage(storage)
  if (!store) return { status: 'unavailable', error: 'storage unavailable' }
  let text: string
  try {
    text = JSON.stringify({ v: options.version, data } satisfies VersionedEnvelope)
  } catch (error) {
    return { status: 'serialize', error: boundedError(error) }
  }
  if (typeof text !== 'string') return { status: 'serialize', error: 'value is not serializable' }
  const bytes = utf8ByteLength(text)
  if (options.maxBytes !== undefined && bytes > options.maxBytes) {
    return { status: 'too-large', bytes, error: `payload is ${bytes} bytes > ${options.maxBytes}` }
  }
  try {
    store.setItem(key, text)
    return { status: 'ok', bytes }
  } catch (error) {
    return { status: isQuotaError(error) ? 'quota' : 'unavailable', bytes, error: boundedError(error) }
  }
}

/** Remove a key without throwing (returns whether a store was reachable). */
export function removeKey(key: string, storage?: StorageLike | null): boolean {
  return safeRemoveItem(key, storage)
}

/** Versioned flag/envelope constant for callers that want a shared version. */
export const STORAGE_SCHEMA_VERSION = 2
