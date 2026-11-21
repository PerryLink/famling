/**
 * Day/night + 夜间安静 clock (B3, 2026-11-21).
 *
 * Two deliberately different windows, one owner:
 *
 * 1. The PET's sleep window is fixed **23:00–06:00** (the "night/sleepy" look
 *    and the hero scene's `sleep` state). It is a body rhythm, not a setting.
 * 2. The QUIET window is the user's persisted preference (default 22:00–08:00,
 *    see low-disturb.ts). It only decides whether *proactive* output is allowed.
 *
 * Before this module the 23–6 checks existed only inside `render()`, so a pet
 * nobody touched never fell asleep at 23:00 and never woke at 06:00, and the
 * quiet-hours boundary never reached the live scene. The clock below is driven
 * by an EXISTING schedule (the pet window's 15 s health poll and its
 * visibility-resume path); it creates no timer of its own and it pauses while
 * the window is hidden. Resolution is pure so Node tests can drive a fake clock
 * across 22:00 / 23:00 / 06:00 and the quiet boundaries.
 */

import { DEFAULT_QUIET_HOURS, isQuietHoursActive, type QuietHoursSettings } from './low-disturb.ts'

/** Local hour the pet falls asleep (inclusive). */
export const SLEEP_START_HOUR = 23
/** Local hour the pet wakes up (inclusive); the sleep window wraps midnight. */
export const SLEEP_END_HOUR = 6

/** Coarse time-of-day bucket used by `body[data-time]` (pet.css backgrounds). */
export type TimeOfDay = 'night' | 'morning' | 'day' | 'evening'

export interface DayNightState {
  /** `body[data-time]` bucket (same thresholds the old render() used). */
  readonly timeOfDay: TimeOfDay
  /** True inside the fixed 23:00–06:00 sleep window. */
  readonly night: boolean
  /** Visual sleepy flag (currently identical to `night`). */
  readonly sleepy: boolean
  /** True while the persisted quiet-hours window is active. */
  readonly quiet: boolean
  /** Stable key of the combined state; the clock only notifies on a change. */
  readonly key: string
}

/** `body[data-time]` bucket for one instant (unchanged thresholds). */
export function resolveTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours()
  return hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening'
}

/** Fixed pet sleep window: 23:00–06:00 local time. */
export function isNightHour(date: Date): boolean {
  const hour = date.getHours()
  return hour >= SLEEP_START_HOUR || hour < SLEEP_END_HOUR
}

/** Pure combined state. `quietActive` is evaluated by the caller (settings live in settings-page.ts). */
export function resolveDayNightState(date: Date, quietActive: boolean): DayNightState {
  const night = isNightHour(date)
  const quiet = quietActive === true
  return Object.freeze({
    timeOfDay: resolveTimeOfDay(date),
    night,
    sleepy: night,
    quiet,
    key: (night ? 'night' : 'day') + '|' + (quiet ? 'quiet' : 'loud') + '|' + resolveTimeOfDay(date),
  })
}

/** Convenience for the live page + tests: quiet-hours settings -> quiet flag at `date`. */
export function isQuietAt(date: Date, settings: QuietHoursSettings = DEFAULT_QUIET_HOURS): boolean {
  return isQuietHoursActive(date, settings)
}

export interface DayNightClockOptions {
  /** Wall-clock reader (tests inject a fake date). */
  readonly now: () => Date
  /** Persisted quiet-hours predicate (main.ts: settingsPage.quietHoursActive). */
  readonly isQuiet: (date: Date) => boolean
  /** Called only when the combined state (or time-of-day bucket) changes. */
  readonly onState?: (next: DayNightState, previous: DayNightState | null) => void
  /**
   * Hidden-window probe. While hidden the clock returns the last applied state
   * without running side effects (the next visible tick applies it); this is the
   * "隐藏时暂停" half of the lightweight-tick contract.
   */
  readonly isHidden?: () => boolean
}

export interface DayNightClock {
  /** Recompute now and notify when the state changed; returns the current state. */
  sync(): DayNightState
  /** Last applied state (resolved on demand before the first sync). */
  state(): DayNightState
}

/**
 * Idempotent clock. The OWNER drives it from an existing schedule (the pet
 * window's health poll / visibility resume); it never schedules its own timer.
 */
export function createDayNightClock(options: DayNightClockOptions): DayNightClock {
  let current: DayNightState | null = null

  const resolve = (): DayNightState => {
    const date = options.now()
    let quiet = false
    try {
      quiet = options.isQuiet(date) === true
    } catch {
      quiet = false
    }
    return resolveDayNightState(date, quiet)
  }

  const sync = (): DayNightState => {
    let hidden = false
    try {
      hidden = options.isHidden?.() === true
    } catch {
      hidden = false
    }
    const next = resolve()
    // Paused while hidden: keep the last applied state so no DOM/scene work
    // happens in the background. The next visible tick applies the new state.
    if (hidden && current !== null) return current
    if (hidden) return next
    if (current !== null && current.key === next.key) return current
    const previous = current
    current = next
    try {
      options.onState?.(next, previous)
    } catch {
      /* a page-side listener must never break the existing poll that drove us */
    }
    return next
  }

  return {
    sync,
    state: () => current ?? resolve(),
  }
}

/**
 * QA/debug-only clock override from the page query string
 * (`?qa_now_ms=<epoch ms>`). Used by the real-WebView2 clock probes to verify
 * the 22:00/23:00/06:00 boundaries without changing the machine clock.
 *
 * The override only affects the pet's own mood/quiet presentation (the page
 * clock), never consent, saves or money; malformed or out-of-window values are
 * ignored. Product code only reads it when the page was loaded with the query.
 * @param search `location.search` (may be empty/null).
 * @returns Epoch milliseconds within 2000-01-01..2100-01-01, or null.
 */
export function resolveQaNowMs(search: string | null | undefined): number | null {
  if (typeof search !== 'string' || search === '') return null
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return null
  }
  const raw = params.get('qa_now_ms')
  if (raw === null || !/^[0-9]{1,15}$/.test(raw)) return null
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) return null
  if (value < Date.UTC(2000, 0, 1) || value > Date.UTC(2100, 0, 1)) return null
  return value
}
