/**
 * 定时隐身 / timed invisibility (B3, 2026-11-21).
 *
 * The plugin host already ships hideFor; the desktop pet only had the tray
 * infinite show/hide toggle. This module adds a bounded hide with automatic
 * restore:
 * - "1 小时" -> hide until now + 1 h
 * - "到明天" -> hide until tomorrow 08:00 local (the default quiet-hours end)
 * - "关闭"   -> show now and clear the persisted deadline
 *
 * Persistence is ONE integer localStorage key (hide-until, epoch ms). The key
 * is registered in state-migrations.ts and consent/data-controls.ts so a full
 * local-data wipe clears it and the settings/delete-all inventory stays in sync.
 * An expired/corrupt/out-of-range value is treated as "off" and removed.
 *
 * Auto-restore: a single one-shot setTimeout per hide plus a boot restore path
 * (app restart) and a visibility-resume sync() (a throttled hidden-window
 * timer loses nothing). No permanent re-timer is installed. The window itself
 * is hidden/shown through the Tauri window API; browser builds (no Tauri) keep
 * the state but expose no menu port, so no fake hide path exists on the web.
 */

import { resolveStorage, safeGetItem, safeSetItem, type StorageLike } from './security/safe-storage.ts'

/** Persisted deadline (epoch ms); absent/invalid = no timed hide. */
export const HIDE_FOR_STORAGE_KEY = 'desktop-games/pet/hide-until'
/** Tauri event used by the independent content/settings window to ask the pet window. */
export const HIDE_FOR_EVENT = 'pet://hide-for'
/** "1 小时" choice. */
export const HIDE_FOR_HOUR_MS = 3_600_000
/** "到明天" restores at this local hour (matches the default quiet-hours end). */
export const HIDE_FOR_MORNING_HOUR = 8
/** Bound for any stored deadline (a corrupt/tampered far-future value is dropped). */
export const HIDE_FOR_MAX_MS = 48 * 3_600_000

export type HideForChoice = 'hour' | 'tomorrow' | 'off'

/** Stable order/labels for the menu + settings dialog (single source). */
export const HIDE_FOR_CHOICES: ReadonlyArray<{ readonly choice: HideForChoice; readonly label: string }> = Object.freeze([
  Object.freeze({ choice: 'hour' as const, label: '定时隐身 1 小时' }),
  Object.freeze({ choice: 'tomorrow' as const, label: '到明天早上 08:00' }),
  Object.freeze({ choice: 'off' as const, label: '关闭定时隐身（立即显示）' }),
])

export function isHideForChoice(value: unknown): value is HideForChoice {
  return value === 'hour' || value === 'tomorrow' || value === 'off'
}

/**
 * Deadline for one choice. off resolves to null. tomorrow is literally the
 * next local calendar day at 08:00 (never "later today"), so the label stays
 * true even when chosen right after midnight.
 */
export function hideForUntilMs(choice: HideForChoice, nowMs: number): number | null {
  if (choice === 'off') return null
  if (!Number.isFinite(nowMs)) return null
  if (choice === 'hour') return Math.round(nowMs) + HIDE_FOR_HOUR_MS
  const date = new Date(nowMs)
  date.setDate(date.getDate() + 1)
  date.setHours(HIDE_FOR_MORNING_HOUR, 0, 0, 0)
  return date.getTime()
}

/**
 * Validate a stored/requested deadline. Only an integer inside
 * (now, now + 48 h] is accepted; anything else (corrupt, expired, tampered far
 * future) is "off" so a bad value can never hide the pet forever.
 */
export function normalizeHideUntil(raw: unknown, nowMs: number = Date.now()): number | null {
  if (!Number.isFinite(nowMs)) return null
  let value: number
  if (typeof raw === 'number') value = raw
  else if (typeof raw === 'string' && /^[0-9]{1,15}$/.test(raw.trim())) value = Number(raw.trim())
  else return null
  if (!Number.isSafeInteger(value)) return null
  if (value <= nowMs) return null
  if (value - nowMs > HIDE_FOR_MAX_MS) return null
  return value
}

/** Read + validate; an expired/invalid value is removed instead of reported. */
export function readHideUntil(storage?: StorageLike | null, nowMs: number = Date.now()): number | null {
  const raw = safeGetItem(HIDE_FOR_STORAGE_KEY, storage)
  if (raw === null) return null
  const until = normalizeHideUntil(raw, nowMs)
  if (until === null) {
    try {
      resolveStorage(storage)?.removeItem(HIDE_FOR_STORAGE_KEY)
    } catch {
      /* storage blocked: the stale entry is re-validated on the next read */
    }
    return null
  }
  return until
}

/** Persist (or clear, with null) the deadline. Storage-denied is a silent no-op. */
export function writeHideUntil(untilMs: number | null, storage?: StorageLike | null, nowMs: number = Date.now()): number | null {
  if (untilMs === null) {
    try {
      resolveStorage(storage)?.removeItem(HIDE_FOR_STORAGE_KEY)
    } catch {
      /* storage blocked/full: no persisted hide; the session still restores */
    }
    return null
  }
  const normalized = normalizeHideUntil(untilMs, nowMs)
  if (normalized === null) return null
  safeSetItem(HIDE_FOR_STORAGE_KEY, String(normalized), storage)
  return normalized
}

/** Local HH:MM label; tomorrow-prefixed when the deadline is not today. */
export function hideForClockLabel(untilMs: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(untilMs) || !Number.isFinite(nowMs)) return ''
  const target = new Date(untilMs)
  const today = new Date(nowMs)
  const hh = String(target.getHours()).padStart(2, '0')
  const mm = String(target.getMinutes()).padStart(2, '0')
  const sameDay =
    target.getFullYear() === today.getFullYear() &&
    target.getMonth() === today.getMonth() &&
    target.getDate() === today.getDate()
  return (sameDay ? '' : '明天 ') + hh + ':' + mm
}

/** Human status line for the menu/settings ("定时隐身：明天 08:00 自动恢复"). */
export function hideForStatusText(untilMs: number | null, nowMs: number = Date.now()): string {
  if (untilMs === null) return '定时隐身：未开启'
  const normalized = normalizeHideUntil(untilMs, nowMs)
  if (normalized === null) return '定时隐身：未开启'
  return '定时隐身：' + hideForClockLabel(normalized, nowMs) + ' 自动恢复'
}

export interface HideForView {
  readonly active: boolean
  readonly untilMs: number | null
  readonly label: string
}

/** Snapshot for the menu/settings render path (never throws). */
export function hideForView(untilMs: number | null, nowMs: number = Date.now()): HideForView {
  const normalized = untilMs === null ? null : normalizeHideUntil(untilMs, nowMs)
  return Object.freeze({
    active: normalized !== null,
    untilMs: normalized,
    label: hideForStatusText(normalized, nowMs),
  })
}

/** Minimal Tauri window seam (only hide/show are used). */
export interface HideForTauriWindow {
  hide(): Promise<void>
  show(): Promise<void>
}

export interface HideForTauriWindowModule {
  getCurrentWindow(): HideForTauriWindow
}

export interface HideForWindowPort {
  hide(): Promise<void> | void
  show(): Promise<void> | void
}

export interface HideForControllerOptions {
  readonly now?: () => number
  readonly storage?: StorageLike | null
  /**
   * Window port. undefined builds the Tauri port lazily; null means "no host"
   * (browser: the state is still tracked, hide/show are no-ops).
   */
  readonly port?: HideForWindowPort | null
  /** Test seam; production dynamic-imports @tauri-apps/api/window. */
  readonly loadTauriWindow?: () => Promise<HideForTauriWindowModule>
  /** One-shot restore timer seams (tests drive the callback). */
  readonly setTimer?: (callback: () => void, ms: number) => unknown
  readonly clearTimer?: (handle: unknown) => void
  /** Only after the TOS gate accepted (never persist pre-consent). */
  readonly isAllowed?: () => boolean
  readonly onChange?: (view: HideForView) => void
}

export interface HideForController {
  /** Boot: restore a still-active persisted hide (app restart). */
  start(): HideForView
  view(): HideForView
  apply(choice: HideForChoice): HideForView
  /** Expiry check on visibility resume; returns the current view. */
  sync(nowMs?: number): HideForView
  /** Data wipe: clear the deadline/timer and make sure the pet is visible. */
  reset(): HideForView
  dispose(): void
}

const NOOP = (): void => {}

/** Default port: dynamic Tauri window API (one shared module promise). */
function createTauriWindowPort(load: () => Promise<HideForTauriWindowModule>): HideForWindowPort {
  let pending: Promise<HideForTauriWindowModule> | null = null
  const loadOnce = (): Promise<HideForTauriWindowModule> => {
    if (pending === null) pending = load()
    return pending
  }
  return {
    hide: () => loadOnce().then((module) => module.getCurrentWindow().hide()),
    show: () => loadOnce().then((module) => module.getCurrentWindow().show()),
  }
}

function swallow(promise: Promise<unknown> | void): void {
  if (promise && typeof (promise as Promise<unknown>).catch === 'function') {
    void (promise as Promise<unknown>).catch(NOOP)
  }
}

/**
 * Controller: persisted deadline + one one-shot timer + window port. All side
 * effects are idempotent; no permanent re-timer and no polling exist here.
 */
export function createHideForController(options: HideForControllerOptions = {}): HideForController {
  const now = options.now ?? (() => Date.now())
  const storage = options.storage
  const setTimer = options.setTimer ?? ((callback: () => void, ms: number): unknown => setTimeout(callback, ms))
  const clearTimer = options.clearTimer ?? ((handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>))

  let port: HideForWindowPort | null
  if (options.port === undefined) {
    const loader =
      options.loadTauriWindow ?? (() => import('@tauri-apps/api/window') as unknown as Promise<HideForTauriWindowModule>)
    port = createTauriWindowPort(loader)
  } else {
    port = options.port
  }

  let untilMs: number | null = null
  let timer: unknown = null
  let timerArmed = false
  let disposed = false

  const emit = (view: HideForView): void => {
    try {
      options.onChange?.(view)
    } catch {
      /* a menu/settings listener failure must not undo the persisted deadline */
    }
  }

  const clearRestoreTimer = (): void => {
    if (!timerArmed) return
    timerArmed = false
    const handle = timer
    timer = null
    try {
      clearTimer(handle)
    } catch {
      /* ignore */
    }
  }

  const hideWindow = (): void => {
    if (port === null) return
    try {
      swallow(port.hide())
    } catch {
      /* a host without a window API keeps the persisted state only */
    }
  }

  const showWindow = (): void => {
    if (port === null) return
    try {
      swallow(port.show())
    } catch {
      /* ignore */
    }
  }

  const viewNow = (): HideForView => hideForView(untilMs, now())

  const restore = (): HideForView => {
    const wasActive = untilMs !== null
    untilMs = null
    clearRestoreTimer()
    writeHideUntil(null, storage, now())
    const view = hideForView(null, now())
    if (wasActive) showWindow()
    emit(view)
    return view
  }

  const armRestore = (): void => {
    clearRestoreTimer()
    if (untilMs === null || disposed) return
    const remaining = untilMs - now()
    if (remaining <= 0) {
      restore()
      return
    }
    timerArmed = true
    timer = setTimer(() => {
      timerArmed = false
      timer = null
      // A throttled/late timer still restores based on the wall clock.
      if (untilMs !== null && now() >= untilMs) restore()
      else armRestore()
    }, remaining)
  }

  const apply = (choice: HideForChoice): HideForView => {
    if (disposed) return viewNow()
    try {
      if (options.isAllowed && !options.isAllowed()) return viewNow()
    } catch {
      return viewNow()
    }
    if (choice === 'off') return restore()
    const computed = hideForUntilMs(choice, now())
    if (computed === null) return restore()
    untilMs = writeHideUntil(computed, storage, now()) ?? computed
    hideWindow()
    armRestore()
    const view = viewNow()
    emit(view)
    return view
  }

  return {
    start: () => {
      if (disposed) return viewNow()
      untilMs = readHideUntil(storage, now())
      const view = viewNow()
      if (untilMs !== null) {
        hideWindow()
        armRestore()
      }
      emit(view)
      return view
    },
    view: viewNow,
    apply,
    sync: (atMs?: number) => {
      if (disposed || untilMs === null) return viewNow()
      const at = typeof atMs === 'number' && Number.isFinite(atMs) ? atMs : now()
      if (at >= untilMs) return restore()
      // Re-arm when no timer is pending (visibility resume / lost timer).
      if (!timerArmed) armRestore()
      return viewNow()
    },
    reset: () => restore(),
    dispose: () => {
      disposed = true
      clearRestoreTimer()
    },
  }
}

// ---------------------------------------------------------------------------
// Page wiring (pet window owner + content window bridge)
// ---------------------------------------------------------------------------

export interface HideForMenuPort {
  /** Current persisted deadline (fresh read; null = no timed hide). */
  get(): number | null
  /** Persist + hide, or restore immediately for off. */
  change(choice: HideForChoice): void
}

export interface HideForPageOptions {
  /** Tauri host (pet window, no content shell). */
  readonly hasTauri: boolean
  readonly canInteract: () => boolean
  readonly storage?: StorageLike | null
  readonly now?: () => number
  readonly reportFailure?: (error: unknown) => void
}

export interface HideForPage {
  /** Boot restore (after the TOS gate accepted). */
  start(): void
  /** Data wiped: clear the deadline/timer and restore visibility. */
  reset(): void
  /** Null in browser builds: the shell then omits the whole 定时隐身 surface. */
  menuPort(): HideForMenuPort | null
  /** Apply a choice (Tauri event from the content window, tests). */
  apply(choice: HideForChoice): void
}

/** Payload guard for the cross-window Tauri event. */
export function hideForChoiceFromEvent(event: unknown): HideForChoice | null {
  const payload = (event as { payload?: unknown } | null)?.payload as { choice?: unknown } | undefined
  return isHideForChoice(payload?.choice) ? payload!.choice! : null
}

/**
 * Pet-window owner: creates the controller (Tauri window port), restores on
 * boot, applies the content-window event and exposes the menu port. Every
 * Tauri-specific import is lazy (@tauri-apps/api/*), so Node tests and the
 * browser build never load it at module scope.
 */
export function createHideForPage(options: HideForPageOptions): HideForPage {
  const now = options.now ?? (() => Date.now())
  const controller = options.hasTauri
    ? createHideForController({ now, storage: options.storage, isAllowed: options.canInteract })
    : createHideForController({ now, storage: options.storage, port: null, isAllowed: options.canInteract })

  const report = (error: unknown): void => {
    try {
      options.reportFailure?.(error)
    } catch {
      /* ignore */
    }
  }

  let wired = false
  const wire = (): void => {
    if (wired || !options.hasTauri) return
    wired = true
    // Cross-window: the content/settings window asks the pet window to apply
    // (only it owns the live window visibility).
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen(HIDE_FOR_EVENT, (event) => {
          const choice = hideForChoiceFromEvent(event)
          if (choice !== null) controller.apply(choice)
        }),
      )
      .catch(report)
    // Resume check for a throttled/late hidden-window timer.
    try {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') controller.sync()
      })
    } catch {
      /* ignore */
    }
  }

  return {
    start: () => {
      wire()
      controller.start()
    },
    reset: () => {
      controller.reset()
    },
    menuPort: () =>
      options.hasTauri
        ? {
            get: () => readHideUntil(options.storage, now()),
            change: (choice: HideForChoice) => {
              try {
                if (!options.canInteract()) return
              } catch {
                return
              }
              controller.apply(choice)
            },
          }
        : null,
    apply: (choice: HideForChoice) => {
      wire()
      controller.apply(choice)
    },
  }
}
