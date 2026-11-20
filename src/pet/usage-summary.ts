/**
 * Local-only usage summary (P1 desktop, 2026-11-21 round 1).
 *
 * WHAT THIS IS
 * A tiny, bounded, local record of *how the desktop pet is used* - operation
 * kinds, counts, the most recent events and per-session durations. It exists so
 * the user can press 设置 -> 数据与边界 -> 「导出使用摘要」 and save a JSON file
 * on their own machine. It is NOT telemetry: the module never touches the
 * network, the counters carry no user text (no prompt/memory/brief content),
 * and the export only happens after an explicit click.
 *
 * WHAT IT RECORDS (fixed whitelist; anything else is ignored)
 *   open / first-interaction / menu / hide / restore / settings-change /
 *   reminder-create / exit, plus session start/end wall-clock milliseconds.
 * Each event is one of those strings + a timestamp. There is no free-form
 * field, so this data can never smuggle conversation content out.
 *
 * STORAGE
 * One versioned Web Storage key (`{ v: 1, data }` via safe-storage) in the
 * famling namespace. It is registered in state-migrations.ts (single key
 * registry) and consent/data-controls.ts (known keys + delete-all item), so
 * "删除全部本地数据" removes it and the clear entry in 设置 -> 数据与边界
 * removes it too. A newer envelope version is never overwritten.
 *
 * BOUNDS
 * Ring buffers: 40 recent events / 20 sessions. Counts are capped, timestamps
 * are validated, serialized state stays far below the write cap. A corrupt or
 * blocked storage degrades to an in-memory summary instead of throwing.
 */

import {
  readVersioned,
  removeKey,
  resolveStorage,
  writeVersioned,
  type StorageReadStatus,
  type StorageLike,
} from './security/safe-storage.ts'

/** Versioned Web Storage key for the local usage summary. */
export const USAGE_SUMMARY_KEY = 'desktop-games/pet/usage-summary/v1'
/** Envelope version of the persisted summary. */
export const USAGE_SUMMARY_VERSION = 1
/** Discriminator written into manual exports (never into storage). */
export const USAGE_SUMMARY_FORMAT = 'famling-usage-summary'
/** Write cap for the serialized state; the bounded ring buffers stay far below. */
export const USAGE_SUMMARY_MAX_BYTES = 16 * 1024
/** How many recent events the ring buffer keeps (oldest dropped). */
export const USAGE_SUMMARY_MAX_EVENTS = 40
/** How many completed sessions the ring buffer keeps (oldest dropped). */
export const USAGE_SUMMARY_MAX_SESSIONS = 20
/** Per-kind counter cap (overflow stays at the cap instead of growing forever). */
export const USAGE_SUMMARY_MAX_COUNT = 1_000_000_000
/** Session duration cap: an app left open for days must not store an absurd number. */
export const USAGE_SUMMARY_MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000
const MAX_TIMESTAMP_MS = 8_640_000_000_000_000
const MAX_TOTAL_SESSION_MS = USAGE_SUMMARY_MAX_COUNT * USAGE_SUMMARY_MAX_SESSION_MS

/**
 * The complete event whitelist. Keep this list closed: adding a kind is fine,
 * adding free text is not - the export contract tests assert there is no text
 * field and no network call in this module.
 */
export const USAGE_EVENT_KINDS = [
  'open',
  'first-interaction',
  'menu',
  'hide',
  'restore',
  'settings-change',
  'reminder-create',
  'exit',
] as const

export type UsageEventKind = (typeof USAGE_EVENT_KINDS)[number]

/** Human-readable labels used by the UI/export; fixed strings, never user data. */
export const USAGE_EVENT_LABELS: Readonly<Record<UsageEventKind, string>> = Object.freeze({
  open: '打开应用',
  'first-interaction': '首次互动',
  menu: '打开菜单',
  hide: '窗口隐藏',
  restore: '窗口恢复',
  'settings-change': '修改设置',
  'reminder-create': '创建提醒草稿',
  exit: '退出应用',
})

export interface UsageEvent {
  readonly at: number
  readonly kind: UsageEventKind
}

export interface UsageSession {
  readonly startedAt: number
  readonly endedAt: number
  readonly durationMs: number
}

export type UsageCounts = Readonly<Record<UsageEventKind, number>>

export interface UsageSummaryState {
  readonly firstUsedAt: number
  readonly lastUsedAt: number
  readonly counts: UsageCounts
  readonly recentEvents: readonly UsageEvent[]
  readonly sessions: readonly UsageSession[]
  /** Wall-clock start of the current session; 0 when no session is open. */
  readonly sessionStartedAt: number
  /** Sum of the completed session durations. */
  readonly totalSessionMs: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function clampTimestamp(nowMs: number): number {
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs) || nowMs < 0) return 0
  return Math.min(Math.floor(nowMs), MAX_TIMESTAMP_MS)
}

function clampSessionMs(ms: number): number {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) return 0
  return Math.min(Math.floor(ms), USAGE_SUMMARY_MAX_SESSION_MS)
}

export function isUsageEventKind(value: unknown): value is UsageEventKind {
  return typeof value === 'string' && (USAGE_EVENT_KINDS as readonly string[]).includes(value)
}

export function zeroUsageCounts(): UsageCounts {
  const counts = {} as Record<UsageEventKind, number>
  for (const kind of USAGE_EVENT_KINDS) counts[kind] = 0
  return Object.freeze(counts)
}

export function emptyUsageSummary(): UsageSummaryState {
  return {
    firstUsedAt: 0,
    lastUsedAt: 0,
    counts: zeroUsageCounts(),
    recentEvents: [],
    sessions: [],
    sessionStartedAt: 0,
    totalSessionMs: 0,
  }
}

/** Strict shape check for storage + exports; undefined = reject (never throw). */
export function validateUsageSummary(value: unknown): UsageSummaryState | undefined {
  if (!isRecord(value)) return undefined
  const countsRaw = value.counts
  if (!isRecord(countsRaw)) return undefined
  const counts = {} as Record<UsageEventKind, number>
  for (const kind of USAGE_EVENT_KINDS) {
    const count = countsRaw[kind]
    if (!isInteger(count, 0, USAGE_SUMMARY_MAX_COUNT)) return undefined
    counts[kind] = count
  }
  const eventsRaw = value.recentEvents
  if (!Array.isArray(eventsRaw) || eventsRaw.length > USAGE_SUMMARY_MAX_EVENTS) return undefined
  const recentEvents: UsageEvent[] = []
  for (const entry of eventsRaw) {
    if (!isRecord(entry)) return undefined
    const at = entry.at
    const kind = entry.kind
    if (!isInteger(at, 0, MAX_TIMESTAMP_MS)) return undefined
    if (!isUsageEventKind(kind)) return undefined
    recentEvents.push({ at, kind })
  }
  const sessionsRaw = value.sessions
  if (!Array.isArray(sessionsRaw) || sessionsRaw.length > USAGE_SUMMARY_MAX_SESSIONS) return undefined
  const sessions: UsageSession[] = []
  for (const entry of sessionsRaw) {
    if (!isRecord(entry)) return undefined
    const startedAt = entry.startedAt
    const endedAt = entry.endedAt
    const durationMs = entry.durationMs
    if (!isInteger(startedAt, 0, MAX_TIMESTAMP_MS)) return undefined
    if (!isInteger(endedAt, 0, MAX_TIMESTAMP_MS)) return undefined
    if (!isInteger(durationMs, 0, USAGE_SUMMARY_MAX_SESSION_MS)) return undefined
    if (endedAt < startedAt || durationMs !== endedAt - startedAt) return undefined
    sessions.push({ startedAt, endedAt, durationMs })
  }
  const firstUsedAt = value.firstUsedAt
  const lastUsedAt = value.lastUsedAt
  const sessionStartedAt = value.sessionStartedAt
  const totalSessionMs = value.totalSessionMs
  if (!isInteger(firstUsedAt, 0, MAX_TIMESTAMP_MS)) return undefined
  if (!isInteger(lastUsedAt, 0, MAX_TIMESTAMP_MS)) return undefined
  if (!isInteger(sessionStartedAt, 0, MAX_TIMESTAMP_MS)) return undefined
  if (!isInteger(totalSessionMs, 0, MAX_TOTAL_SESSION_MS)) return undefined
  return { firstUsedAt, lastUsedAt, counts: Object.freeze(counts), recentEvents, sessions, sessionStartedAt, totalSessionMs }
}

/**
 * Finalize a session left open by a crash/forced quit without inventing time:
 * the last *recorded activity* timestamp is used as the honest end. A session
 * with no activity after its start is dropped (sessionStartedAt = 0).
 */
export function recoverStaleSession(state: UsageSummaryState): UsageSummaryState {
  if (state.sessionStartedAt <= 0) return state
  const startedAt = state.sessionStartedAt
  const endedAt = state.lastUsedAt
  if (endedAt <= startedAt) return { ...state, sessionStartedAt: 0 }
  const durationMs = clampSessionMs(endedAt - startedAt)
  const sessions = [...state.sessions, { startedAt, endedAt, durationMs }]
  if (sessions.length > USAGE_SUMMARY_MAX_SESSIONS) sessions.splice(0, sessions.length - USAGE_SUMMARY_MAX_SESSIONS)
  return {
    ...state,
    sessions,
    totalSessionMs: Math.min(MAX_TOTAL_SESSION_MS, state.totalSessionMs + durationMs),
    sessionStartedAt: 0,
  }
}

/** Pure event application: counters + ring buffers + session lifecycle. */
export function recordUsageEvent(state: UsageSummaryState, kind: UsageEventKind, nowMs: number): UsageSummaryState {
  if (!isUsageEventKind(kind)) return state
  const at = clampTimestamp(nowMs)
  const counts = { ...state.counts }
  counts[kind] = Math.min(USAGE_SUMMARY_MAX_COUNT, counts[kind] + 1)
  const recentEvents = [...state.recentEvents, { at, kind }]
  if (recentEvents.length > USAGE_SUMMARY_MAX_EVENTS) {
    recentEvents.splice(0, recentEvents.length - USAGE_SUMMARY_MAX_EVENTS)
  }
  let sessionStartedAt = state.sessionStartedAt
  const sessions = [...state.sessions]
  let totalSessionMs = state.totalSessionMs
  if (kind === 'open') sessionStartedAt = at
  if (kind === 'exit' && sessionStartedAt > 0) {
    const durationMs = clampSessionMs(at - sessionStartedAt)
    sessions.push({ startedAt: sessionStartedAt, endedAt: sessionStartedAt + durationMs, durationMs })
    if (sessions.length > USAGE_SUMMARY_MAX_SESSIONS) sessions.splice(0, sessions.length - USAGE_SUMMARY_MAX_SESSIONS)
    totalSessionMs = Math.min(MAX_TOTAL_SESSION_MS, totalSessionMs + durationMs)
    sessionStartedAt = 0
  }
  return {
    firstUsedAt: state.firstUsedAt > 0 ? state.firstUsedAt : at,
    lastUsedAt: at,
    counts: Object.freeze(counts),
    recentEvents,
    sessions,
    sessionStartedAt,
    totalSessionMs,
  }
}

// ---------------------------------------------------------------------------
// Manual export (pure; the desktop shell only writes the returned JSON to a file)
// ---------------------------------------------------------------------------

export interface UsageSummaryExportOptions {
  readonly nowMs: number
}

export interface UsageSummaryExport {
  readonly format: typeof USAGE_SUMMARY_FORMAT
  readonly version: 1
  readonly generatedAt: string
  readonly generatedAtMs: number
  /** Boundary copy: local-only, manual, no network, no content text. */
  readonly localOnly: true
  readonly manualExport: true
  readonly network: 'none'
  readonly containsContentText: false
  readonly disclosure: string
  readonly counts: UsageCounts
  readonly totals: {
    readonly events: number
    readonly sessions: number
    readonly totalSessionMs: number
    readonly currentSessionMs: number
  }
  readonly recentEvents: ReadonlyArray<{ readonly at: string; readonly atMs: number; readonly kind: UsageEventKind; readonly label: string }>
  readonly sessions: ReadonlyArray<{ readonly startedAt: string; readonly endedAt: string; readonly durationMs: number }>
  readonly boundaries: readonly string[]
}

export const USAGE_SUMMARY_BOUNDARIES: readonly string[] = Object.freeze([
  '仅本机：摘要只保存在这台设备的本地 Web Storage，不发送到任何服务器。',
  '手动导出：只有你主动点击「导出使用摘要」时才会生成这个 JSON 文件。',
  '无网络：本模块不发起任何网络请求；不含任何内容文本，只记录操作类型、次数、时间与会话时长。',
  '可清除：设置 → 数据与边界 →「清除使用摘要」，或「删除全部本地数据」都会删除它。',
])

function toIso(ms: number): string {
  return new Date(ms).toISOString()
}

/** Build the manual-export payload. No user content is read or copied. */
export function buildUsageSummaryExport(
  state: UsageSummaryState,
  options: UsageSummaryExportOptions,
): UsageSummaryExport {
  const nowMs = clampTimestamp(options.nowMs)
  const currentSessionMs =
    state.sessionStartedAt > 0 ? clampSessionMs(nowMs - state.sessionStartedAt) : 0
  const events = USAGE_EVENT_KINDS.reduce((sum, kind) => sum + state.counts[kind], 0)
  return {
    format: USAGE_SUMMARY_FORMAT,
    version: 1,
    generatedAt: toIso(nowMs),
    generatedAtMs: nowMs,
    localOnly: true,
    manualExport: true,
    network: 'none',
    containsContentText: false,
    disclosure: '仅本机 · 手动导出 · 不联网 · 不含内容文本',
    counts: state.counts,
    totals: {
      events,
      sessions: state.sessions.length,
      totalSessionMs: state.totalSessionMs,
      currentSessionMs,
    },
    recentEvents: state.recentEvents.map((event) => ({
      at: toIso(event.at),
      atMs: event.at,
      kind: event.kind,
      label: USAGE_EVENT_LABELS[event.kind],
    })),
    sessions: state.sessions
      .filter((session) => session.endedAt > 0)
      .map((session) => ({
        startedAt: toIso(session.startedAt),
        endedAt: toIso(session.endedAt),
        durationMs: session.durationMs,
      })),
    boundaries: USAGE_SUMMARY_BOUNDARIES,
  }
}

/** Pretty JSON for the download; the only place the summary leaves the process. */
export function usageSummaryExportJson(state: UsageSummaryState, options: UsageSummaryExportOptions): string {
  return JSON.stringify(buildUsageSummaryExport(state, options), null, 2)
}

// ---------------------------------------------------------------------------
// Storage (versioned envelope; a newer version is never overwritten)
// ---------------------------------------------------------------------------

export interface UsageSummaryLoad {
  readonly state: UsageSummaryState
  readonly status: StorageReadStatus
  /** False when a newer envelope version is stored: never write over it. */
  readonly writable: boolean
}

export function loadUsageSummary(storage?: StorageLike | null): UsageSummaryLoad {
  const resolved = storage === undefined ? resolveStorage() : storage
  const result = readVersioned<UsageSummaryState>(
    USAGE_SUMMARY_KEY,
    {
      version: USAGE_SUMMARY_VERSION,
      validate: validateUsageSummary,
      maxBytes: USAGE_SUMMARY_MAX_BYTES,
    },
    resolved,
  )
  if (result.status === 'ok' && result.value) {
    return { state: recoverStaleSession(result.value), status: 'ok', writable: true }
  }
  return {
    state: emptyUsageSummary(),
    status: result.status,
    writable: result.status !== 'version',
  }
}

/** Persist the summary; returns false for blocked/quota/newer-version storage. */
export function persistUsageSummary(state: UsageSummaryState, storage?: StorageLike | null): boolean {
  const resolved = storage === undefined ? resolveStorage() : storage
  const result = writeVersioned(
    USAGE_SUMMARY_KEY,
    state,
    { version: USAGE_SUMMARY_VERSION, maxBytes: USAGE_SUMMARY_MAX_BYTES },
    resolved,
  )
  return result.status === 'ok'
}

// ---------------------------------------------------------------------------
// Recorder (DOM wiring is injected; Node tests use a fake document/window)
// ---------------------------------------------------------------------------

export interface UsageSummaryRecorderDeps {
  readonly document?: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null
  readonly window?: Pick<Window, 'addEventListener' | 'removeEventListener'> | null
  readonly storage?: StorageLike | null
  readonly now?: () => number
  /**
   * Consent/read-only gate. While it returns false nothing is recorded or
   * persisted (withdrawing consent must not keep writing usage data).
   */
  readonly canWrite?: () => boolean
}

export interface UsageSummaryRecorder {
  record(kind: UsageEventKind): void
  summary(): UsageSummaryState
  exportJson(): string
  /** Remove the stored summary + in-memory counters; the session keeps counting. */
  clear(): boolean
  /** Data-wipe path: reset to an empty summary without writing a new key. */
  reset(): void
  dispose(): void
}

interface StorageEventLike {
  readonly key?: string | null
  readonly newValue?: string | null
}

function activeDocument(): Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null {
  try {
    return typeof document === 'undefined' ? null : document
  } catch {
    return null
  }
}

function activeWindow(): Pick<Window, 'addEventListener' | 'removeEventListener'> | null {
  try {
    return typeof window === 'undefined' ? null : window
  } catch {
    return null
  }
}

/** Create one recorder. Production calls the singleton bridge below. */
export function createUsageSummaryRecorder(deps: UsageSummaryRecorderDeps = {}): UsageSummaryRecorder {
  const now = deps.now ?? (() => Date.now())
  const storage = deps.storage
  const canWrite = deps.canWrite ?? (() => true)
  const loaded = loadUsageSummary(storage)
  let state = loaded.state
  let writable = loaded.writable
  let disposed = false
  let exitRecorded = false

  const timestamp = (): number => {
    try {
      return clampTimestamp(now())
    } catch {
      return 0
    }
  }

  const persist = (): void => {
    if (!writable) return
    try {
      if (!canWrite()) return
    } catch {
      return
    }
    persistUsageSummary(state, storage)
  }

  const record = (kind: UsageEventKind): void => {
    if (disposed || !isUsageEventKind(kind)) return
    try {
      if (!canWrite()) return
    } catch {
      return
    }
    if (kind === 'exit') {
      if (exitRecorded) return
      exitRecorded = true
    }
    const before = state
    state = recordUsageEvent(state, kind, timestamp())
    if (state !== before) persist()
  }

  const adoptExternal = (nextValue: string | null | undefined): void => {
    if (nextValue === null || nextValue === '') {
      state = { ...emptyUsageSummary(), sessionStartedAt: timestamp() }
      return
    }
    const next = loadUsageSummary(storage)
    if (next.status !== 'ok') return
    state = {
      ...next.state,
      sessionStartedAt: next.state.sessionStartedAt > 0 ? next.state.sessionStartedAt : timestamp(),
    }
  }

  const doc = deps.document === undefined ? activeDocument() : deps.document
  const win = deps.window === undefined ? activeWindow() : deps.window

  const onFirstInteraction = (): void => {
    if (state.counts['first-interaction'] > 0) return
    record('first-interaction')
  }
  const onVisibilityChange = (): void => {
    if (!doc) return
    record(doc.visibilityState === 'hidden' ? 'hide' : 'restore')
  }
  const onPageHide = (): void => record('exit')
  const onStorage = (event: StorageEventLike): void => {
    if (event.key !== USAGE_SUMMARY_KEY) return
    adoptExternal(event.newValue)
  }

  const interactionEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
  try {
    for (const type of interactionEvents) doc?.addEventListener(type, onFirstInteraction, { passive: true })
    doc?.addEventListener('visibilitychange', onVisibilityChange)
    win?.addEventListener('pagehide', onPageHide)
    win?.addEventListener('beforeunload', onPageHide)
    win?.addEventListener('storage', onStorage as unknown as EventListener)
  } catch {
    /* a blocked DOM surface must never break the recorder */
  }

  return {
    record,
    summary: () => state,
    exportJson: () => usageSummaryExportJson(state, { nowMs: timestamp() }),
    clear(): boolean {
      const removed = removeKey(USAGE_SUMMARY_KEY, storage)
      state = { ...emptyUsageSummary(), sessionStartedAt: timestamp() }
      exitRecorded = false
      return removed
    },
    reset(): void {
      state = { ...emptyUsageSummary(), sessionStartedAt: timestamp() }
      exitRecorded = false
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      try {
        for (const type of interactionEvents) doc?.removeEventListener(type, onFirstInteraction)
        doc?.removeEventListener('visibilitychange', onVisibilityChange)
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
// Page singleton bridge (main.ts initializes it after the TOS gate; other pet
// modules call recordUsage() without importing the DOM wiring)
// ---------------------------------------------------------------------------

let activeRecorder: UsageSummaryRecorder | null = null

/** Initialize the page recorder once (after consent) and count the open. */
export function initUsageSummary(deps: UsageSummaryRecorderDeps = {}): UsageSummaryRecorder {
  activeRecorder?.dispose()
  activeRecorder = createUsageSummaryRecorder(deps)
  activeRecorder.record('open')
  return activeRecorder
}

/** Record one whitelisted event; no-op before init/after dispose/while read-only. */
export function recordUsage(kind: UsageEventKind): void {
  activeRecorder?.record(kind)
}

/** Live summary, or the stored one when this page/window has no recorder. */
export function currentUsageSummary(): UsageSummaryState {
  return activeRecorder?.summary() ?? loadUsageSummary().state
}

/** Manual export JSON for 设置 → 数据与边界 (works in the content window too). */
export function usageSummaryJson(): string {
  return activeRecorder?.exportJson() ?? usageSummaryExportJson(loadUsageSummary().state, { nowMs: Date.now() })
}

/** User-triggered clear: removes the stored summary and resets the live one. */
export function clearUsageSummary(storage?: StorageLike | null): boolean {
  const removed = activeRecorder ? activeRecorder.clear() : removeKey(USAGE_SUMMARY_KEY, storage)
  return removed
}

/** Full-data-wipe hook: drop memory state without re-creating the key. */
export function resetUsageSummary(): void {
  activeRecorder?.reset()
}

/** Test/teardown hook; production keeps one recorder for the page lifetime. */
export function disposeUsageSummary(): void {
  activeRecorder?.dispose()
  activeRecorder = null
}
