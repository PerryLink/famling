/**
 * 共处日历 (cohabitation calendar, P1 desktop, 2026-11-21 round 1).
 *
 * WHAT THIS IS
 * The smallest honest record of "we spent some time together today": a set of
 * local dates on which the user actually interacted with the pet for at least
 * 10 minutes. The 折页簿 (memory screen) shows 本月 N 天 / 累计第 N 天.
 *
 * DELIBERATE NON-FEATURES (product/ethics contract)
 * - NO streak (连续天数), NO backfill/make-up (补签), NO reminder to keep the
 *   streak, NO penalty/loss when a day is missed. Days never reset, never
 *   decay and nothing bad happens when the user is away for a month.
 * - Only the *date set* is stored (plus today's in-progress millisecond
 *   accumulator, needed to know when 10 minutes is reached). No text, no
 *   interaction content, no per-event log, no network.
 * - Counts only real user activity while the page is visible: the accumulated
 *   time between two input events is credited only when the gap is short
 *   (<= COHABITATION_ACTIVITY_GAP_CAP_MS); idle/away time is never counted.
 *
 * STORAGE
 * One versioned Web Storage key (`{ v: 1, data }`) in the famling namespace,
 * registered in state-migrations.ts (single registry) and
 * consent/data-controls.ts (known keys + delete-all item). Clearable from the
 * memory screen and by "删除全部本地数据". A newer envelope is never
 * overwritten. Corrupt/blocked storage degrades to an empty in-memory state.
 *
 * WHY NOT THE ENCRYPTED SAVE PAYLOAD
 * The encrypted pet save payload is owned by kernel/pet.ts + save-runtime.ts;
 * the round-1 scope keeps that file untouched. The date set is still covered by
 * the same clear/erase paths (registry + data-controls + save-adjacent UI), and
 * it contains no memory/dialogue text, so it never rides in the archive.
 */

import { dayKey } from '../kernel/pet.ts'
import {
  readVersioned,
  removeKey,
  resolveStorage,
  writeVersioned,
  type StorageReadStatus,
  type StorageLike,
} from './security/safe-storage.ts'

/** Versioned Web Storage key for the cohabitation day set. */
export const COHABITATION_KEY = 'desktop-games/pet/cohabitation/v1'
/** Envelope version of the persisted day set. */
export const COHABITATION_VERSION = 1
/** A day only counts after this much real interaction time. */
export const COHABITATION_MIN_DAY_MS = 10 * 60 * 1000
/** Longest gap between two input events that is still credited as interaction. */
export const COHABITATION_ACTIVITY_GAP_CAP_MS = 60 * 1000
/** Hard cap on stored dates (~10 years of daily use); oldest dropped first. */
export const COHABITATION_MAX_DAYS = 3700
/** Write cap for the serialized state. */
export const COHABITATION_MAX_BYTES = 64 * 1024
/** Persist at most once per this interval while time accumulates. */
export const COHABITATION_PERSIST_MIN_INTERVAL_MS = 15 * 1000
const MAX_TIMESTAMP_MS = 8_640_000_000_000_000

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface CohabitationState {
  /** Local dates (YYYY-MM-DD) that reached >= 10 minutes, sorted, unique. */
  readonly days: readonly string[]
  /** Local day the accumulator belongs to. */
  readonly dayKey: string
  /** Accumulated interaction milliseconds for `dayKey` (capped at the minimum). */
  readonly activeMsToday: number
  readonly updatedAt: number
}

export interface CohabitationSummary {
  /** Days in the current local calendar month. */
  readonly monthDays: number
  /** Cumulative day count ("累计第 N 天"). */
  readonly totalDays: number
  /** True when today already reached the 10-minute minimum. */
  readonly todayQualified: boolean
  /** Accumulated interaction ms today (0 once qualified). */
  readonly activeMsToday: number
  /** Remaining ms needed to qualify today (0 once qualified). */
  readonly remainingMs: number
  readonly monthKey: string
  readonly todayKey: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

/** A real calendar date in local-day form (rejects 2026-13-40 etc.). */
export function isCohabitationDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY_PATTERN.test(value)) return false
  const parts = value.split('-')
  const year = Number(parts[0])
  const month = Number(parts[1])
  const day = Number(parts[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function clampTimestamp(nowMs: number): number {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || nowMs < 0) return 0
  return Math.min(Math.floor(nowMs), MAX_TIMESTAMP_MS)
}

/** Normalize a day list: real dates only, sorted, unique, capped (oldest dropped). */
export function normalizeCohabitationDays(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined
  if (value.length > COHABITATION_MAX_DAYS * 2) return undefined
  const unique = new Set<string>()
  for (const entry of value) {
    if (!isCohabitationDayKey(entry)) return undefined
    unique.add(entry)
  }
  const days = [...unique].sort()
  if (days.length > COHABITATION_MAX_DAYS) return days.slice(days.length - COHABITATION_MAX_DAYS)
  return days
}

export function emptyCohabitationState(nowMs = 0): CohabitationState {
  return { days: [], dayKey: '', activeMsToday: 0, updatedAt: clampTimestamp(nowMs) }
}

/** Strict shape check for storage; undefined = reject (never throw). */
export function validateCohabitationState(value: unknown): CohabitationState | undefined {
  if (!isRecord(value)) return undefined
  const days = normalizeCohabitationDays(value.days)
  if (days === undefined) return undefined
  const key = value.dayKey
  if (key !== '' && !isCohabitationDayKey(key)) return undefined
  const activeMsToday = value.activeMsToday
  if (!isInteger(activeMsToday, 0, COHABITATION_MIN_DAY_MS)) return undefined
  const updatedAt = value.updatedAt
  if (!isInteger(updatedAt, 0, MAX_TIMESTAMP_MS)) return undefined
  return { days, dayKey: key, activeMsToday, updatedAt }
}

/**
 * Pure day accumulation. Credits `engagedMs` (already capped by the caller to
 * one short gap) to today; after 10 minutes today's date enters the set and the
 * accumulator resets. Crossing midnight starts a new accumulator; yesterday's
 * qualified date stays in the set forever.
 */
export function addEngagedTime(state: CohabitationState, nowMs: number, engagedMs: number): CohabitationState {
  const at = clampTimestamp(nowMs)
  const today = dayKey(at)
  if (state.days.includes(today)) {
    // Already qualified: nothing more to count; only normalize a stale day key.
    return state.dayKey === today ? state : { ...state, dayKey: today, activeMsToday: 0, updatedAt: at }
  }
  const credit = isInteger(engagedMs, 1, COHABITATION_MIN_DAY_MS) ? engagedMs : 0
  const base = state.dayKey === today ? state.activeMsToday : 0
  const activeMsToday = Math.min(COHABITATION_MIN_DAY_MS, base + credit)
  if (activeMsToday >= COHABITATION_MIN_DAY_MS) {
    const days = [...state.days, today].sort()
    if (days.length > COHABITATION_MAX_DAYS) days.splice(0, days.length - COHABITATION_MAX_DAYS)
    return { days, dayKey: today, activeMsToday: COHABITATION_MIN_DAY_MS, updatedAt: at }
  }
  return { days: state.days, dayKey: today, activeMsToday, updatedAt: at }
}

/** Current month/cumulative view used by the memory screen and export docs. */
export function cohabitationSummary(state: CohabitationState, nowMs: number): CohabitationSummary {
  const today = dayKey(clampTimestamp(nowMs))
  const monthKey = today.slice(0, 7)
  const monthDays = state.days.filter((day) => day.startsWith(monthKey)).length
  const todayQualified = state.days.includes(today)
  const activeMsToday = state.dayKey === today ? state.activeMsToday : 0
  return {
    monthDays,
    totalDays: state.days.length,
    todayQualified,
    activeMsToday,
    remainingMs: todayQualified ? 0 : Math.max(0, COHABITATION_MIN_DAY_MS - activeMsToday),
    monthKey,
    todayKey: today,
  }
}

/**
 * The single display line: 本月 N 天 / 累计第 N 天. No streak, no "lost days",
 * no penalty copy. A profile with no qualified day yet gets an explanatory
 * zero-state instead of a shaming one.
 */
export function formatCohabitationLine(summary: CohabitationSummary): string {
  if (summary.totalDays <= 0) {
    return '共处日历：本月 0 天 · 累计第 0 天（当天真实互动满 10 分钟才记一天）'
  }
  return `共处日历：本月 ${summary.monthDays} 天 · 累计第 ${summary.totalDays} 天`
}

// ---------------------------------------------------------------------------
// Storage (versioned envelope; a newer version is never overwritten)
// ---------------------------------------------------------------------------

export interface CohabitationLoad {
  readonly state: CohabitationState
  readonly status: StorageReadStatus
  /** False when a newer envelope version is stored: never write over it. */
  readonly writable: boolean
}

export function loadCohabitation(storage?: StorageLike | null): CohabitationLoad {
  const resolved = storage === undefined ? resolveStorage() : storage
  const result = readVersioned<CohabitationState>(
    COHABITATION_KEY,
    {
      version: COHABITATION_VERSION,
      validate: validateCohabitationState,
      maxBytes: COHABITATION_MAX_BYTES,
    },
    resolved,
  )
  if (result.status === 'ok' && result.value) return { state: result.value, status: 'ok', writable: true }
  return {
    state: emptyCohabitationState(),
    status: result.status,
    writable: result.status !== 'version',
  }
}

export function persistCohabitation(state: CohabitationState, storage?: StorageLike | null): boolean {
  const resolved = storage === undefined ? resolveStorage() : storage
  const result = writeVersioned(
    COHABITATION_KEY,
    state,
    { version: COHABITATION_VERSION, maxBytes: COHABITATION_MAX_BYTES },
    resolved,
  )
  return result.status === 'ok'
}

// ---------------------------------------------------------------------------
// Tracker (DOM wiring injected; Node tests use a fake document/window/clock)
// ---------------------------------------------------------------------------

export interface CohabitationTrackerDeps {
  readonly document?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null
  readonly window?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
  readonly storage?: StorageLike | null
  readonly now?: () => number
  /** Consent/read-only gate: no accumulation/persistence while false. */
  readonly canWrite?: () => boolean
}

export interface CohabitationTracker {
  /** Credit the time since the previous input event (if it was a short gap). */
  noteActivity(): void
  state(): CohabitationState
  summary(): CohabitationSummary
  line(): string
  /** Persist now (page hide/exit path; no-op while read-only). */
  flush(): void
  /** User clear: remove storage + empty memory; stays empty until new activity. */
  clear(): boolean
  /** Data-wipe hook: reset memory without writing a new key. */
  reset(): void
  dispose(): void
}

interface StorageEventLike {
  readonly key?: string | null
  readonly newValue?: string | null
}

function trackerDocument(): Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null {
  try {
    return typeof document === 'undefined' ? null : document
  } catch {
    return null
  }
}

function trackerWindow(): Pick<Window, 'addEventListener' | 'removeEventListener'> | null {
  try {
    return typeof window === 'undefined' ? null : window
  } catch {
    return null
  }
}

/** Create one tracker; production calls the singleton bridge below. */
export function createCohabitationTracker(deps: CohabitationTrackerDeps = {}): CohabitationTracker {
  const now = deps.now ?? (() => Date.now())
  const storage = deps.storage
  const canWrite = deps.canWrite ?? (() => true)
  const loaded = loadCohabitation(storage)
  let state = loaded.state
  let writable = loaded.writable
  let disposed = false
  let lastActivityAt = 0
  let lastPersistAt = 0

  const timestamp = (): number => {
    try {
      return clampTimestamp(now())
    } catch {
      return 0
    }
  }

  const mayWrite = (): boolean => {
    try {
      return canWrite()
    } catch {
      return false
    }
  }

  const flush = (): void => {
    if (!writable || !mayWrite()) return
    const at = timestamp()
    if (persistCohabitation(state, storage)) lastPersistAt = at
  }

  /** Persist when a day newly qualifies / day rolls over, else at most every 15s. */
  const persistProgress = (qualifiedNow: boolean, dayChanged: boolean): void => {
    if (!writable || !mayWrite()) return
    const at = timestamp()
    if (qualifiedNow || dayChanged || at - lastPersistAt >= COHABITATION_PERSIST_MIN_INTERVAL_MS) {
      if (persistCohabitation(state, storage)) lastPersistAt = at
    }
  }

  const noteActivity = (): void => {
    if (disposed || !mayWrite()) return
    const at = timestamp()
    const previous = lastActivityAt
    lastActivityAt = at
    // A first event or a long idle gap credits nothing: only short gaps between
    // real input events are interaction time.
    if (previous <= 0 || at <= previous) return
    const gap = at - previous
    if (gap > COHABITATION_ACTIVITY_GAP_CAP_MS) return
    const before = state
    state = addEngagedTime(state, at, gap)
    if (state === before) return
    const qualifiedNow = state.days.length > before.days.length
    const dayChanged = state.dayKey !== before.dayKey
    persistProgress(qualifiedNow, dayChanged)
  }

  const adoptExternal = (nextValue: string | null | undefined): void => {
    if (nextValue === null || nextValue === '') {
      state = emptyCohabitationState(timestamp())
      lastActivityAt = 0
      return
    }
    const next = loadCohabitation(storage)
    if (next.status !== 'ok') return
    state = next.state
    lastActivityAt = 0
  }

  const doc = deps.document === undefined ? trackerDocument() : deps.document
  const win = deps.window === undefined ? trackerWindow() : deps.window

  const onActivity = (): void => noteActivity()
  const onVisibility = (): void => {
    if (!doc) return
    if (doc.visibilityState === 'hidden') {
      flush()
      lastActivityAt = 0
    } else {
      lastActivityAt = timestamp()
    }
  }
  const onPageHide = (): void => {
    flush()
    lastActivityAt = 0
  }
  const onStorage = (event: StorageEventLike): void => {
    if (event.key !== COHABITATION_KEY) return
    adoptExternal(event.newValue)
  }

  const activityEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
  try {
    for (const type of activityEvents) doc?.addEventListener(type, onActivity, { passive: true })
    doc?.addEventListener('visibilitychange', onVisibility)
    win?.addEventListener('pagehide', onPageHide)
    win?.addEventListener('beforeunload', onPageHide)
    win?.addEventListener('storage', onStorage as unknown as EventListener)
  } catch {
    /* a blocked DOM surface must never break the tracker */
  }

  const summaryNow = (): CohabitationSummary => cohabitationSummary(state, timestamp())

  return {
    noteActivity,
    state: () => state,
    summary: summaryNow,
    line: () => formatCohabitationLine(summaryNow()),
    flush,
    clear(): boolean {
      const removed = removeKey(COHABITATION_KEY, storage)
      state = emptyCohabitationState(timestamp())
      lastActivityAt = 0
      lastPersistAt = 0
      return removed
    },
    reset(): void {
      state = emptyCohabitationState(timestamp())
      lastActivityAt = 0
      lastPersistAt = 0
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      try {
        for (const type of activityEvents) doc?.removeEventListener(type, onActivity)
        doc?.removeEventListener('visibilitychange', onVisibility)
        win?.removeEventListener('pagehide', onPageHide)
        win?.removeEventListener('beforeunload', onPageHide)
        win?.removeEventListener('storage', onStorage as unknown as EventListener)
      } catch {
        /* listeners may already be gone */
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Page singleton bridge
// ---------------------------------------------------------------------------

let activeTracker: CohabitationTracker | null = null

/** Initialize the page tracker once (after consent). */
export function initCohabitation(deps: CohabitationTrackerDeps = {}): CohabitationTracker {
  activeTracker?.dispose()
  activeTracker = createCohabitationTracker(deps)
  return activeTracker
}

/** Current summary; falls back to the stored day set in windows without a tracker. */
export function cohabitationSummaryNow(): CohabitationSummary {
  return activeTracker?.summary() ?? cohabitationSummary(loadCohabitation().state, Date.now())
}

/** 折页簿 line: 本月 N 天 / 累计第 N 天. */
export function cohabitationLineNow(): string {
  return formatCohabitationLine(cohabitationSummaryNow())
}

/** User-triggered clear (memory screen / 数据与边界). */
export function clearCohabitation(storage?: StorageLike | null): boolean {
  return activeTracker ? activeTracker.clear() : removeKey(COHABITATION_KEY, storage)
}

/** Full-data-wipe hook: reset memory without re-creating the key. */
export function resetCohabitation(): void {
  activeTracker?.reset()
}

/** Persist any accumulated-but-unflushed milliseconds (page hide/exit). */
export function flushCohabitation(): void {
  activeTracker?.flush()
}

/** Test/teardown hook. */
export function disposeCohabitation(): void {
  activeTracker?.dispose()
  activeTracker = null
}
