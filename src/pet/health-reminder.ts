/**
 * Persistent 2-hour health-use reminder (E7 / MB-072, PSY-P1-5, Q-03).
 *
 * The old implementation lived only in the pet page, paused whenever the page
 * was hidden, and reset on every restart. This module implements the Q-03
 * contract instead:
 *
 * - **Persistent timestamp**: state is stored in localStorage (wall-clock
 *   timestamps only, never content) so switching between the pet window and a
 *   game window, minimizing, or restarting does not reset the 2h clock.
 * - **Hidden pages keep counting**: visibility only gates whether the banner may
 *   be painted, never whether time passes. When the window becomes visible again
 *   the banner appears if the reminder is due.
 * - **Continuous use, not "app open"**: a gap with no interaction longer than
 *   HEALTH_IDLE_RESET_MS (15 min) starts a fresh session. A user who steps away
 *   is not greeted by a reminder the moment they come back.
 * - **Cannot be permanently dismissed**: the banner only offers
 *   "休息一下（2 小时后仍会提醒）" (resets the clock) and
 *   "10 分钟后再提醒" (temporary defer).
 * - **Cross-window**: every window shares the same storage key. A short claim
 *   timestamp (lastShownAt) stops two windows from showing duplicate banners,
 *   and a rest/defer in one window hides the banner in the others.
 * - **Quiet hours are respected**: while quiet hours are active no banner is
 *   shown; it is deferred to the first tick after the quiet window ends.
 *
 * The pet window keeps its audited banner for of terms copy; game windows use
 * installHealthReminder(), which paints a small self-contained banner (inline
 * styles injected once) so aquarium/stall/town/world do not need pet.css.
 */

import type { StorageLike } from './security/safe-storage.ts'

/** Persisted state key (shared by every same-origin window). */
export const HEALTH_STATE_KEY = 'desktop-games/pet/health-reminder'
/** Continuous-use interval required before the reminder fires. */
export const HEALTH_AFTER_MS = 2 * 60 * 60 * 1000
/** A no-interaction gap longer than this starts a fresh continuous-use session. */
export const HEALTH_IDLE_RESET_MS = 15 * 60 * 1000
/** "10 分钟后再提醒". */
export const HEALTH_DEFER_MS = 10 * 60 * 1000
/** A window that claimed the banner suppresses duplicates for this long. */
export const HEALTH_BANNER_CLAIM_MS = 8_000
/** Tick cadence (wall-clock maths means a throttled hidden timer loses nothing). */
export const HEALTH_TICK_MS = 15_000

/** Banner id + classes (single banner per window). */
export const HEALTH_BANNER_ID = 'pet-health-reminder'
export const HEALTH_BANNER_CLASS = 'pet-health-reminder'
export const HEALTH_STYLE_ID = 'pet-health-reminder-style'

/** Required button copy (Q-03): no permanent dismiss. */
export const HEALTH_REST_LABEL = '休息一下（2 小时后仍会提醒）'
export const HEALTH_DEFER_LABEL = '10 分钟后再提醒'
export const HEALTH_ABOUT_LABEL = '健康使用与求助…'
/** Short reminder body copy shared by the pet and the game windows. */
export const HEALTH_BANNER_TITLE = '健康使用提醒 · 已连续使用约 2 小时'
export const HEALTH_BANNER_TEXT =
  '起来走动、看看远处、喝口水。每满 2 小时会再次提醒，不能彻底关闭。如有自伤/他伤/重大损失等危机信号，请停止互动，联系紧急服务（110/120）、可信任的人或专业机构（如 12356）。'

export interface HealthReminderState {
  /** Start of the current continuous-use session (epoch ms). */
  readonly startedAt: number
  /** Last user interaction in any window (epoch ms). */
  readonly lastInteractionAt: number
  /** While > now the banner is deferred ("10 分钟后再提醒"). */
  readonly deferredUntil: number
  /** Last time any window claimed the banner (cross-window dedupe). */
  readonly lastShownAt: number
}

export interface HealthTiming {
  readonly afterMs: number
  readonly idleResetMs: number
  readonly deferMs: number
  readonly claimMs: number
}

export function defaultHealthTiming(overrides: Partial<HealthTiming> = {}): HealthTiming {
  const positive = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
  return {
    afterMs: positive(overrides.afterMs, HEALTH_AFTER_MS),
    idleResetMs: positive(overrides.idleResetMs, HEALTH_IDLE_RESET_MS),
    deferMs: positive(overrides.deferMs, HEALTH_DEFER_MS),
    claimMs: positive(overrides.claimMs, HEALTH_BANNER_CLAIM_MS),
  }
}

function safeNow(now?: number): number {
  return typeof now === 'number' && Number.isFinite(now) ? now : Date.now()
}

/** Fresh state for a first run / wiped storage. */
export function freshHealthState(now: number = Date.now()): HealthReminderState {
  const at = safeNow(now)
  return { startedAt: at, lastInteractionAt: at, deferredUntil: 0, lastShownAt: 0 }
}

function timestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/**
 * Defensive parse of stored state. Never throws; missing/corrupt fields fall
 * back to a fresh session (fail-quiet: a corrupt preference cannot make the app
 * show a reminder immediately or store garbage).
 */
export function normalizeHealthState(raw: unknown, now: number = Date.now()): HealthReminderState {
  const fresh = freshHealthState(now)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fresh
  const record = raw as Record<string, unknown>
  // A startedAt in the future is impossible from a working clock; treat it as
  // corrupt instead of trusting it (system clock changes must not freeze the
  // reminder forever).
  const startedAt = timestamp(record.startedAt, fresh.startedAt)
  const lastInteractionAt = timestamp(record.lastInteractionAt, startedAt)
  return {
    startedAt: startedAt > fresh.startedAt ? fresh.startedAt : startedAt,
    lastInteractionAt: lastInteractionAt > fresh.startedAt ? fresh.startedAt : lastInteractionAt,
    deferredUntil: timestamp(record.deferredUntil, 0),
    lastShownAt: timestamp(record.lastShownAt, 0),
  }
}

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    return localStorage
  } catch {
    return null
  }
}

/** Read stored state; a missing/corrupt value starts a fresh session. */
export function readHealthState(storage?: StorageLike | null, now: number = Date.now()): HealthReminderState {
  try {
    const store = resolveStorage(storage)
    const raw = store?.getItem(HEALTH_STATE_KEY)
    if (!raw) return freshHealthState(now)
    return normalizeHealthState(JSON.parse(raw) as unknown, now)
  } catch {
    return freshHealthState(now)
  }
}

/** Persist state; storage-denied is a silent no-op (session-only behaviour). */
export function writeHealthState(state: HealthReminderState, storage?: StorageLike | null): void {
  try {
    const store = resolveStorage(storage)
    store?.setItem(HEALTH_STATE_KEY, JSON.stringify(state))
  } catch {
    /* storage blocked/full: the current session still tracks time in memory */
  }
}

/**
 * Record one user interaction. A gap longer than idleResetMs means the previous
 * continuous-use session ended, so a new one starts at this interaction.
 */
export function noteHealthInteraction(
  state: HealthReminderState,
  now: number = Date.now(),
  timing: HealthTiming = defaultHealthTiming(),
): HealthReminderState {
  const at = safeNow(now)
  const gap = at - state.lastInteractionAt
  if (gap > timing.idleResetMs) {
    return { startedAt: at, lastInteractionAt: at, deferredUntil: 0, lastShownAt: state.lastShownAt }
  }
  return { ...state, lastInteractionAt: at }
}

/**
 * Re-evaluate an idle gap. Called by the tick and by the game installer on
 * load: if nobody interacted for longer than idleResetMs the session restarts
 * now (the user was away, so they should not be reminded immediately).
 */
export function refreshHealthState(
  state: HealthReminderState,
  now: number = Date.now(),
  timing: HealthTiming = defaultHealthTiming(),
): HealthReminderState {
  const at = safeNow(now)
  if (at - state.lastInteractionAt > timing.idleResetMs) {
    return { startedAt: at, lastInteractionAt: at, deferredUntil: 0, lastShownAt: state.lastShownAt }
  }
  return state
}

/**
 * Merge two window-local copies of the same record. Windows persist after every
 * interaction/claim, so the copy with the later lastInteractionAt is the most
 * recent session boundary; the defer/claim timestamps are shared maximums.
 * This is what lets a hidden pet window and a visible game window (or vice
 * versa) agree on one 2h clock without a host service.
 */
export function mergeHealthStates(a: HealthReminderState, b: HealthReminderState): HealthReminderState {
  const newer = a.lastInteractionAt >= b.lastInteractionAt ? a : b
  return {
    startedAt: newer.startedAt,
    lastInteractionAt: newer.lastInteractionAt,
    deferredUntil: Math.max(a.deferredUntil, b.deferredUntil),
    lastShownAt: Math.max(a.lastShownAt, b.lastShownAt),
  }
}

/** True when the 2h reminder is due and not deferred. */
export function isHealthReminderDue(
  state: HealthReminderState,
  now: number = Date.now(),
  timing: HealthTiming = defaultHealthTiming(),
): boolean {
  const at = safeNow(now)
  return at - state.startedAt >= timing.afterMs && at >= state.deferredUntil
}

/** "10 分钟后再提醒". */
export function deferHealthReminder(
  state: HealthReminderState,
  now: number = Date.now(),
  timing: HealthTiming = defaultHealthTiming(),
): HealthReminderState {
  const at = safeNow(now)
  return { ...state, deferredUntil: at + timing.deferMs, lastShownAt: at }
}

/** "休息一下（2 小时后仍会提醒）": acknowledge the break and restart the clock. */
export function acknowledgeHealthRest(state: HealthReminderState, now: number = Date.now()): HealthReminderState {
  const at = safeNow(now)
  return { startedAt: at, lastInteractionAt: at, deferredUntil: 0, lastShownAt: at }
}

/** Mark that this window claimed the banner (cross-window dedupe). */
export function claimHealthBanner(state: HealthReminderState, now: number = Date.now()): HealthReminderState {
  return { ...state, lastShownAt: safeNow(now) }
}

// ---------------------------------------------------------------------------
// DOM banner (game windows and any surface without pet.css)
// ---------------------------------------------------------------------------

const BANNER_CSS = [
  '.pet-health-reminder {',
  '  position: fixed; left: 12px; right: 12px; bottom: 14px; z-index: 90;',
  '  padding: 10px 12px; border: 1px solid #8a6a24; border-left: 4px solid #ffcc66;',
  '  border-radius: 8px; background: rgba(32, 24, 10, .97); color: #ffe2a8;',
  '  font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", system-ui, sans-serif;',
  '  font-size: 13px; line-height: 1.5; box-shadow: 0 10px 30px #000a;',
  '}',
  '.pet-health-reminder strong { display: block; margin-bottom: 3px; color: #ffcc66; font-size: 14px; }',
  '.pet-health-reminder p { margin: 0 0 6px; color: #e8d3a0; }',
  '.pet-health-reminder-actions { display: flex; gap: 8px; flex-wrap: wrap; }',
  '.pet-health-reminder button {',
  '  min-height: 28px; padding: 3px 10px; border: 1px solid #6a4a2e; border-radius: 6px;',
  '  background: #3a2a13; color: #ffe2a8; font: inherit; font-size: 12px; cursor: pointer;',
  '}',
  '.pet-health-reminder button:hover { background: #4d3818; }',
  '.pet-health-reminder button:focus-visible { outline: 2px solid #e0b35a; outline-offset: 1px; }',
].join('\n')

interface HealthWindowLike {
  addEventListener?(type: string, listener: (event: Event) => void): void
  removeEventListener?(type: string, listener: (event: Event) => void): void
  setInterval?(handler: () => void, timeout: number): unknown
  clearInterval?(handle: unknown): void
  setTimeout?(handler: () => void, timeout: number): unknown
}

export interface HealthReminderHost {
  readonly document: Document
  readonly window?: HealthWindowLike | null
  readonly storage?: StorageLike | null
  /** Injectable clock for tests. */
  readonly now?: () => number
  /** Quiet-hours gate; the banner is deferred while this returns true. */
  readonly isQuietHours?: () => boolean
  /** Optional "健康使用与求助" action (pet page opens About; games omit). */
  readonly onAbout?: () => void
  readonly timing?: Partial<HealthTiming>
  /** Tick interval override (0 disables the automatic timer; tests call checkNow). */
  readonly tickMs?: number
  /** Do not paint the banner while this returns false (e.g. consent pending). */
  readonly canShow?: () => boolean
}

export interface HealthReminderHandle {
  /** Run one evaluation now (also used by tests and visibility handlers). */
  checkNow(): void
  /** Stop the timer/listeners and remove the banner. */
  stop(): void
  isBannerOpen(): boolean
  getState(): HealthReminderState
}

function injectBannerStyle(doc: Document): void {
  try {
    if (doc.getElementById(HEALTH_STYLE_ID)) return
    const style = doc.createElement('style')
    style.id = HEALTH_STYLE_ID
    style.textContent = BANNER_CSS
    ;(doc.head ?? doc.body).append(style)
  } catch {
    /* CSP/missing head: still show the banner, just without the injected polish */
  }
}

/**
 * Install the cross-window health reminder on any page.
 *
 * The pet window keeps its consent-layer banner for the full legal copy and
 * audit record; game windows use this installer with the same persisted state,
 * so the 2h clock spans pet -> game -> pet and survives a restart.
 */
export function installHealthReminder(host: HealthReminderHost): HealthReminderHandle {
  const doc = host.document
  const win = host.window ?? null
  const storage = host.storage
  const timing = defaultHealthTiming(host.timing)
  const now = (): number => safeNow(host.now?.())
  const tickMs = typeof host.tickMs === 'number' && Number.isFinite(host.tickMs) ? host.tickMs : HEALTH_TICK_MS
  let state = refreshHealthState(readHealthState(storage, now()), now(), timing)
  let banner: HTMLElement | null = null
  let intervalHandle: unknown = null
  let stopped = false
  const listeners: Array<{ target: EventTarget; type: string; listener: (event: Event) => void }> = []

  const persist = (): void => {
    writeHealthState(state, storage)
  }

  const removeBanner = (): void => {
    try {
      banner?.remove()
    } catch {
      /* already detached */
    }
    banner = null
  }

  const buildBanner = (): void => {
    if (banner || doc.getElementById(HEALTH_BANNER_ID)) return
    injectBannerStyle(doc)
    const root = doc.createElement('aside')
    root.id = HEALTH_BANNER_ID
    root.className = HEALTH_BANNER_CLASS
    root.setAttribute('role', 'status')
    root.setAttribute('aria-live', 'polite')
    root.setAttribute('aria-atomic', 'true')

    const title = doc.createElement('strong')
    title.textContent = HEALTH_BANNER_TITLE
    const text = doc.createElement('p')
    text.textContent = HEALTH_BANNER_TEXT
    const actions = doc.createElement('div')
    actions.className = 'pet-health-reminder-actions'

    const rest = doc.createElement('button')
    rest.type = 'button'
    rest.textContent = HEALTH_REST_LABEL
    rest.addEventListener('click', () => {
      state = acknowledgeHealthRest(state, now())
      persist()
      removeBanner()
    })
    const later = doc.createElement('button')
    later.type = 'button'
    later.textContent = HEALTH_DEFER_LABEL
    later.addEventListener('click', () => {
      state = deferHealthReminder(state, now(), timing)
      persist()
      removeBanner()
    })
    actions.append(rest, later)

    if (host.onAbout) {
      const about = doc.createElement('button')
      about.type = 'button'
      about.textContent = HEALTH_ABOUT_LABEL
      about.addEventListener('click', () => {
        removeBanner()
        try {
          host.onAbout?.()
        } catch {
          /* the host action must not break the reminder */
        }
      })
      actions.append(about)
    }

    root.append(title, text, actions)
    try {
      doc.body.append(root)
    } catch {
      return
    }
    banner = root
  }

  const checkNow = (): void => {
    if (stopped) return
    const at = now()
    // Pull in interactions/claims/defers written by the other same-origin
    // window (pet <-> game), then re-evaluate this window's copy.
    const storedForMerge = readHealthState(storage, at)
    const previous = state
    state = refreshHealthState(mergeHealthStates(state, storedForMerge), at, timing)
    if (state !== previous) persist()
    const due = isHealthReminderDue(state, at, timing)
    if (!due) {
      removeBanner()
      return
    }
    if (host.canShow && !host.canShow()) return
    if (host.isQuietHours?.() === true) return
    if (doc.visibilityState === 'hidden') return
    // Cross-window claim: another window may have just shown the same banner.
    const claimedAt = state.lastShownAt
    if (at - claimedAt < timing.claimMs) return
    state = claimHealthBanner(state, at)
    persist()
    buildBanner()
  }

  const noteInteraction = (): void => {
    if (stopped) return
    const at = now()
    // Wheel/userinput can fire at 100+ Hz: only persist a new presence mark when
    // it actually changes the record (1s resolution is plenty for a 15-min gap).
    if (state.lastInteractionAt !== 0 && at - state.lastInteractionAt < 1_000) return
    state = noteHealthInteraction(state, at, timing)
    persist()
  }

  const onVisibility = (): void => {
    if (doc.visibilityState === 'visible') checkNow()
  }
  const onStorage = (event: Event): void => {
    const key = (event as StorageEvent).key
    if (key !== HEALTH_STATE_KEY && key !== null) return
    // Another window rested/deferred/claimed: re-read and re-evaluate.
    state = refreshHealthState(readHealthState(storage, now()), now(), timing)
    const at = now()
    if (!isHealthReminderDue(state, at, timing)) removeBanner()
  }

  const register = (target: EventTarget | null | undefined, type: string, listener: (event: Event) => void): void => {
    try {
      target?.addEventListener?.(type, listener)
      if (target) listeners.push({ target, type, listener })
    } catch {
      /* listener registration is best-effort */
    }
  }
  register(doc, 'pointerdown', noteInteraction)
  register(doc, 'keydown', noteInteraction)
  register(doc, 'touchstart', noteInteraction)
  register(doc, 'wheel', noteInteraction)
  register(doc as unknown as EventTarget, 'visibilitychange', onVisibility)
  register(win as unknown as EventTarget, 'storage', onStorage)

  state = refreshHealthState(state, now(), timing)
  persist()
  checkNow()

  if (tickMs > 0) {
    try {
      intervalHandle = win?.setInterval
        ? win.setInterval(checkNow, tickMs)
        : setInterval(checkNow, tickMs)
    } catch {
      intervalHandle = null
    }
  }

  return {
    checkNow,
    isBannerOpen: () => banner !== null,
    getState: () => state,
    stop: () => {
      stopped = true
      removeBanner()
      try {
        if (intervalHandle !== null) {
          if (win?.clearInterval) win.clearInterval(intervalHandle)
          else clearInterval(intervalHandle as ReturnType<typeof setInterval>)
        }
      } catch {
        /* ignore */
      }
      for (const entry of listeners) {
        try {
          entry.target.removeEventListener?.(entry.type, entry.listener)
        } catch {
          /* ignore */
        }
      }
      listeners.length = 0
    },
  }
}
