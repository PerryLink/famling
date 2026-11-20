/**
 * Low-disturbance controls (E7 / MB-070 + MB-075).
 *
 * Three concerns live here, all pure (no DOM):
 *
 * 1. Quiet hours / 夜间安静 — a persisted local wall-clock window
 *    (default 22:00–08:00, enabled by default, user can change or disable it).
 *    While active the pet must not emit *proactive* output (ambient bubbles,
 *    night greetings, auto environment actions) and the 2h health reminder is
 *    deferred; user-triggered interactions still answer normally. This matches
 *    the product-wide 安静 semantic (C-11 / Q-01): 安静 = 关闭自动/环境输出，
 *    交互回应仍可用.
 *
 * 2. Idle rhythm / 待机节奏 (C1 2026-11-21) — the desktop ambient micro-action
 *    rate is a persisted three-level preference (活泼 4–10 s / 正常 60–90 s /
 *    安静 blink-only). Quiet hours force the quiet level for the duration of the
 *    window; a running 一起工作 focus session (25/50 min) downgrades one level;
 *    an Advisers pose (working/waiting, no matching clip) degrades to the same
 *    non-animating quiet flag. The pure resolver + the session-scoped focus
 *    session live here so main.ts/hero-page.ts only wire clocks and menus.
 *
 * 3. Soft emotional copy guard — waiting / leaving-the-light-on / guilt hints
 *    (等你, 留灯, 别走, 一直停在这里) are exactly the low-key dependency cues
 *    the psychology review (PSY-P1-7 / Q-04) asks us to stop adding.
 *    findSoftTone() is the runtime filter used for proactive lines, and the
 *    legacy inventory at the bottom lists every legacy hit with its disposition
 *    (rewritten vs. intentionally kept).
 *
 * Storage is injected so the same logic runs in the pet window, in the
 * desktop-shell settings and in Node tests.
 */

import type { StorageLike } from './security/safe-storage.ts'

// ---------------------------------------------------------------------------
// Quiet hours
// ---------------------------------------------------------------------------

/** Persisted quiet-hours window (single JSON blob). */
export const QUIET_HOURS_KEY = 'desktop-games/pet/quiet-hours'

export interface QuietHoursSettings {
  /** Whether the window is active at all (the user can turn quiet hours off). */
  readonly enabled: boolean
  /** Local wall-clock start, HH:MM 24h. Default 22:00. */
  readonly start: string
  /** Local wall-clock end (exclusive), HH:MM 24h. Default 08:00. */
  readonly end: string
}

/** Default per Q-01: 22:00–08:00, enabled unless the user turns it off. */
export const DEFAULT_QUIET_HOURS: QuietHoursSettings = {
  enabled: true,
  start: '22:00',
  end: '08:00',
}

const CLOCK_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/

/** Parse HH:MM to minutes since midnight, or null when invalid. */
export function parseClockMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = CLOCK_RE.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

/** Inverse of parseClockMinutes; clamps into a single day. */
export function formatClockMinutes(minutes: number): string {
  if (!Number.isFinite(minutes)) return '00:00'
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return hh + ':' + mm
}

export function isValidClockText(value: unknown): value is string {
  return parseClockMinutes(value) !== null
}

/**
 * Normalise stored/user data. Never throws: missing fields fall back to the
 * default window, so corrupt data cannot silently disable quiet hours.
 */
export function normalizeQuietHours(raw: unknown): QuietHoursSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_QUIET_HOURS }
  const record = raw as Record<string, unknown>
  const enabled = typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_QUIET_HOURS.enabled
  const start = isValidClockText(record.start) ? record.start.trim() : DEFAULT_QUIET_HOURS.start
  const end = isValidClockText(record.end) ? record.end.trim() : DEFAULT_QUIET_HOURS.end
  return { enabled, start, end }
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

/** Read + normalise the persisted window; never throws, never writes. */
export function readQuietHours(storage?: StorageLike | null): QuietHoursSettings {
  try {
    const store = resolveStorage(storage)
    if (!store) return { ...DEFAULT_QUIET_HOURS }
    const raw = store.getItem(QUIET_HOURS_KEY)
    if (raw === null) return { ...DEFAULT_QUIET_HOURS }
    return normalizeQuietHours(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_QUIET_HOURS }
  }
}

/** Persist the normalised window; storage-denied is a silent no-op. */
export function writeQuietHours(
  settings: QuietHoursSettings,
  storage?: StorageLike | null,
): QuietHoursSettings {
  const normalized = normalizeQuietHours(settings)
  try {
    const store = resolveStorage(storage)
    store?.setItem(QUIET_HOURS_KEY, JSON.stringify(normalized))
  } catch {
    /* storage blocked/full: the in-memory setting still applies for this session */
  }
  return normalized
}

/** Minutes since local midnight for the given date. */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/**
 * Pure quiet-hours predicate.
 *
 * - start < end is a same-day window (09:00–12:00);
 * - start > end is an overnight window (22:00–08:00);
 * - start === end is treated as "no quiet window" on purpose: it avoids an
 *   accidental 24h silence from a one-character edit.
 */
export function isQuietHoursActive(
  now: Date,
  settings: QuietHoursSettings = DEFAULT_QUIET_HOURS,
): boolean {
  if (!settings.enabled) return false
  const start = parseClockMinutes(settings.start)
  const end = parseClockMinutes(settings.end)
  if (start === null || end === null || start === end) return false
  const minute = minutesSinceMidnight(now)
  return start < end ? minute >= start && minute < end : minute >= start || minute < end
}

/** Proactive output (ambient bubbles / auto actions / 2h banner) is suppressed. */
export function isProactiveOutputSuppressed(
  now: Date,
  settings: QuietHoursSettings = DEFAULT_QUIET_HOURS,
): boolean {
  return isQuietHoursActive(now, settings)
}

/** Short human-readable state for settings/menus, e.g. 22:00–08:00（已开启）. */
export function quietHoursSummary(settings: QuietHoursSettings): string {
  const normalized = normalizeQuietHours(settings)
  return normalized.enabled
    ? normalized.start + '–' + normalized.end + '（已开启）'
    : '已关闭'
}

/**
 * Neutral low-arousal ambient lines used when a stored/legacy line trips the
 * soft-copy filter. No waiting, no guilt, no "I'm still here" obligation.
 */
export const NEUTRAL_AMBIENT_LINES: readonly string[] = Object.freeze([
  '书页翻到下一页。',
  '风把纸角吹起来了。',
  '嗯。',
])

export function pickNeutralAmbientLine(random: () => number = Math.random): string {
  const index = Math.floor(random() * NEUTRAL_AMBIENT_LINES.length)
  const bounded = Math.max(0, Math.min(NEUTRAL_AMBIENT_LINES.length - 1, index))
  return NEUTRAL_AMBIENT_LINES[bounded] ?? '嗯。'
}

// ---------------------------------------------------------------------------
// Idle rhythm / 待机节奏 (C1 2026-11-21)
// ---------------------------------------------------------------------------

/**
 * Persisted idle-rhythm level (single short enum string, cross-restart).
 *
 * The authored behavior.json default is 60–90 s (C1 2026-11-21: the old 4–10 s
 * window made a visible micro-action appear roughly every 15 s because ~45% of
 * the draws hit a non-idle state). The same 60–90 s cadence is what the
 * dsh-famling sidebar pet already uses. 活泼 overrides the live scene back to
 * the old 4–10 s window, 安静 drops the random pool to the blink only. The live
 * hero scene applies the level at runtime (one place: hero-page.ts), so the
 * generated behavior.json keeps a single authored default instead of three
 * generated variants.
 */
export const AMBIENT_CADENCE_KEY = 'desktop-games/pet/ambient-cadence'

/** Three user-selectable idle-rhythm levels. */
export type AmbientCadence = 'lively' | 'normal' | 'quiet'

/** Canonical level order for the settings control. */
export const AMBIENT_CADENCES: readonly AmbientCadence[] = Object.freeze(['lively', 'normal', 'quiet'])

/** Shipped default: 60–90 s, same as the dsh-famling sidebar pet. */
export const DEFAULT_AMBIENT_CADENCE: AmbientCadence = 'normal'

export interface AmbientCadencePlan {
  /** Label shown in 设置 → 安静 / 健康 / AI 标识. */
  readonly label: string
  /** One-line description shown next to the control (fixed product copy). */
  readonly description: string
  /**
   * Interval drawn for each remaining ambient state while idle. For `quiet`
   * this is the blink interval (the only remaining ambient state).
   */
  readonly intervalMs: readonly [number, number]
  /**
   * Ambient states this level allows; `null` = the character's authored pool.
   * `quiet` keeps only `idle_blink`: no extra micro-actions, the idle breathing
   * loop and a low-frequency blink remain visible.
   */
  readonly states: readonly string[] | null
}

/**
 * The three shipped plans. `normal` matches the plugin's 60–90 s automatic
 * micro-action timer; `quiet` is the "0 extra micro-actions" level (the only
 * scheduled ambient state is the blink overlay, so the pet still breathes and
 * blinks instead of freezing).
 */
export const AMBIENT_CADENCE_PLANS: Readonly<Record<AmbientCadence, AmbientCadencePlan>> = Object.freeze({
  lively: Object.freeze({
    label: '活泼',
    description: '约每 4–10 秒一个待机微动作（眨眼/舔爪/摇尾…）。',
    intervalMs: [4000, 10000] as readonly [number, number],
    states: null,
  }),
  normal: Object.freeze({
    label: '正常（默认）',
    description: '约每 60–90 秒一个待机微动作，与侧栏插件节奏一致。',
    intervalMs: [60000, 90000] as readonly [number, number],
    states: null,
  }),
  quiet: Object.freeze({
    label: '安静',
    description: '不做额外待机微动作，只保留呼吸循环与低频眨眼。',
    intervalMs: [4000, 10000] as readonly [number, number],
    states: ['idle_blink'] as readonly string[],
  }),
})

export function isAmbientCadence(value: unknown): value is AmbientCadence {
  return typeof value === 'string' && (AMBIENT_CADENCES as readonly string[]).includes(value)
}

/** Normalise stored/user data; anything unknown falls back to the default. */
export function normalizeAmbientCadence(raw: unknown): AmbientCadence {
  return isAmbientCadence(raw) ? raw : DEFAULT_AMBIENT_CADENCE
}

/** Plan for one level (unknown input = default, never throws). */
export function ambientCadencePlan(cadence: unknown): AmbientCadencePlan {
  return AMBIENT_CADENCE_PLANS[normalizeAmbientCadence(cadence)]
}

/** Read + normalise the persisted level; never throws, never writes. */
export function readAmbientCadence(storage?: StorageLike | null): AmbientCadence {
  try {
    const store = resolveStorage(storage)
    if (!store) return DEFAULT_AMBIENT_CADENCE
    return normalizeAmbientCadence(store.getItem(AMBIENT_CADENCE_KEY))
  } catch {
    return DEFAULT_AMBIENT_CADENCE
  }
}

/** Persist the normalised level; storage-denied is a silent no-op. */
export function writeAmbientCadence(cadence: unknown, storage?: StorageLike | null): AmbientCadence {
  const normalized = normalizeAmbientCadence(cadence)
  try {
    resolveStorage(storage)?.setItem(AMBIENT_CADENCE_KEY, normalized)
  } catch {
    /* storage blocked/full: the in-memory setting still applies for this session */
  }
  return normalized
}

/** Why the effective level differs from the user's persisted choice. */
export type AmbientRhythmReason = 'user-cadence' | 'quiet-hours' | 'work-session' | 'advisers-pose'

export interface AmbientRhythmInput {
  /** User's persisted level. */
  readonly cadence: AmbientCadence
  /** True while the quiet-hours window is active (owner evaluates the clock). */
  readonly quietHoursActive?: boolean
  /** True while a 一起工作 session is running. */
  readonly workSessionActive?: boolean
  /** True while Advisers reported working/waiting (no matching clip → quiet). */
  readonly advisersQuiet?: boolean
}

export interface AmbientRhythm {
  /** The level the user chose. */
  readonly requested: AmbientCadence
  /** The level actually applied after quiet hours / work session / pose. */
  readonly cadence: AmbientCadence
  readonly reason: AmbientRhythmReason
  readonly plan: AmbientCadencePlan
}

/** One step calmer: 活泼→正常, 正常→安静, 安静→安静. */
export function downgradeAmbientCadence(cadence: AmbientCadence): AmbientCadence {
  return cadence === 'lively' ? 'normal' : 'quiet'
}

/**
 * Effective idle rhythm. Order of precedence (calmest wins):
 * - Advisers working/waiting pose → quiet (there is no pose clip; the flag only
 *   stops proactive micro-actions, it never drives animation);
 * - quiet hours → quiet;
 * - 一起工作 focus session → one level calmer;
 * - otherwise the user's persisted level.
 */
export function resolveAmbientRhythm(input: AmbientRhythmInput): AmbientRhythm {
  const requested = normalizeAmbientCadence(input.cadence)
  if (input.advisersQuiet === true) {
    return { requested, cadence: 'quiet', reason: 'advisers-pose', plan: AMBIENT_CADENCE_PLANS.quiet }
  }
  if (input.quietHoursActive === true) {
    return { requested, cadence: 'quiet', reason: 'quiet-hours', plan: AMBIENT_CADENCE_PLANS.quiet }
  }
  if (input.workSessionActive === true) {
    const cadence = downgradeAmbientCadence(requested)
    return { requested, cadence, reason: 'work-session', plan: AMBIENT_CADENCE_PLANS[cadence] }
  }
  return { requested, cadence: requested, reason: 'user-cadence', plan: AMBIENT_CADENCE_PLANS[requested] }
}

// ---------------------------------------------------------------------------
// 一起工作 focus session (C1 2026-11-21)
// ---------------------------------------------------------------------------
//
// Persistence strategy (deliberate, no streak/record/penalty):
// - the *duration* lives in sessionStorage, so a page reload inside the same
//   app window keeps the remaining time; closing/restarting the app clears it;
// - nothing is written to the save archive or localStorage: there is no
//   history, no streak days, no "you missed a session" reminder, and an early
//   end is simply discarded;
// - the 2h health reminder is independent and unchanged.

/** Session-scoped key; survives a page reload, not an app restart. */
export const WORK_SESSION_KEY = 'desktop-games/pet/work-session'

/** Product-locked session lengths (minutes). */
export const WORK_SESSION_MINUTES: readonly [25, 50] = [25, 50]

export type WorkSessionMinutes = 25 | 50

export interface WorkSession {
  readonly minutes: WorkSessionMinutes
  readonly startedAtMs: number
  readonly endsAtMs: number
}

const MINUTE_MS = 60_000
/** Tolerated clock skew when validating a restored session. */
const WORK_SESSION_SKEW_MS = 1_000

export function isWorkSessionMinutes(value: unknown): value is WorkSessionMinutes {
  return value === 25 || value === 50
}

/** Start a session at `nowMs` (pure; persistence is the caller's choice). */
export function startWorkSession(minutes: WorkSessionMinutes, nowMs: number): WorkSession {
  if (!isWorkSessionMinutes(minutes)) throw new Error('unsupported work-session length: ' + String(minutes))
  const startedAtMs = Number.isFinite(nowMs) ? Math.round(nowMs) : Date.now()
  return Object.freeze({ minutes, startedAtMs, endsAtMs: startedAtMs + minutes * MINUTE_MS })
}

/** Validate a stored session; unknown/tampered shapes restore nothing. */
export function normalizeWorkSession(raw: unknown): WorkSession | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  if (!isWorkSessionMinutes(record.minutes)) return null
  const startedAtMs = Number(record.startedAtMs)
  const endsAtMs = Number(record.endsAtMs)
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endsAtMs)) return null
  if (endsAtMs <= startedAtMs) return null
  if (endsAtMs - startedAtMs > record.minutes * MINUTE_MS + WORK_SESSION_SKEW_MS) return null
  return Object.freeze({ minutes: record.minutes, startedAtMs: Math.round(startedAtMs), endsAtMs: Math.round(endsAtMs) })
}

export function workSessionRemainingMs(session: WorkSession | null, nowMs: number): number {
  if (!session || !Number.isFinite(nowMs)) return 0
  return Math.max(0, session.endsAtMs - nowMs)
}

export function isWorkSessionActive(session: WorkSession | null, nowMs: number): boolean {
  return session !== null && Number.isFinite(nowMs) && nowMs < session.endsAtMs
}

/** "18 分钟" (ceil so a started session never shows 0 minutes early). */
export function formatRemainingMinutes(remainingMs: number): string {
  const safe = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0
  return Math.max(0, Math.ceil(safe / MINUTE_MS)) + ' 分钟'
}

/** Session-scoped storage (`sessionStorage`), resolved defensively. */
function resolveSessionStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage
  try {
    if (typeof sessionStorage === 'undefined' || !sessionStorage) return null
    return sessionStorage
  } catch {
    return null
  }
}

/**
 * Restore a still-running session (after a page reload). Expired or invalid
 * entries are removed instead of being reported as active.
 */
export function readWorkSession(storage?: StorageLike | null, nowMs: number = Date.now()): WorkSession | null {
  try {
    const store = resolveSessionStorage(storage)
    if (!store) return null
    const raw = store.getItem(WORK_SESSION_KEY)
    if (raw === null) return null
    const session = normalizeWorkSession(JSON.parse(raw) as unknown)
    if (!session || !isWorkSessionActive(session, nowMs)) {
      try {
        store.removeItem(WORK_SESSION_KEY)
      } catch {
        /* ignored: a stale entry is harmless, it is re-validated on next read */
      }
      return null
    }
    return session
  } catch {
    return null
  }
}

/** Persist the active session (best effort; in-memory state still works). */
export function writeWorkSession(session: WorkSession, storage?: StorageLike | null): boolean {
  try {
    const store = resolveSessionStorage(storage)
    if (!store) return false
    store.setItem(WORK_SESSION_KEY, JSON.stringify(session))
    return true
  } catch {
    return false
  }
}

/** Remove the session entry (early end, completion, data wipe). */
export function clearWorkSession(storage?: StorageLike | null): void {
  try {
    resolveSessionStorage(storage)?.removeItem(WORK_SESSION_KEY)
  } catch {
    /* storage blocked: the entry expires on its own */
  }
}

/** Neutral start copy; no companionship/dependency framing. */
export function workSessionStartLine(minutes: WorkSessionMinutes): string {
  return '好，一起工作 ' + String(minutes) + ' 分钟。'
}

/** Natural completion copy (neutral rest nudge, no reward/streak language). */
export const WORK_SESSION_DONE_LINE = '这一节到时间了，起来走走吧。'
/** Early-end copy; ending early is not recorded anywhere. */
export const WORK_SESSION_CUT_LINE = '好，先到这儿。'

/** Menu/status line, e.g. 一起工作：剩余 18 分钟（50 分钟档）. */
export function workSessionStatusText(session: WorkSession, nowMs: number = Date.now()): string {
  return '一起工作：剩余 ' + formatRemainingMinutes(workSessionRemainingMs(session, nowMs)) + '（' + String(session.minutes) + ' 分钟档）'
}

// ---------------------------------------------------------------------------
// Soft emotional copy guard (PSY-P1-7 / Q-04)
// ---------------------------------------------------------------------------

export type SoftToneCategory = 'waiting' | 'guilt' | 'dependency'

export interface SoftTonePattern {
  readonly category: SoftToneCategory
  /** Stable human label used in tests/review docs. */
  readonly label: string
  readonly pattern: RegExp
}

/**
 * Deliberately narrow: these target *waiting / leaving-the-light-on / guilt /
 * exclusive-dependency* hints, not ordinary warmth. "再摸一下也可以" (dog
 * patting) is NOT in this list; "手别走" is kept only for the dog (see the
 * inventory below) and would match.
 */
export const SOFT_TONE_PATTERNS: readonly SoftTonePattern[] = Object.freeze([
  { category: 'waiting', label: '留灯', pattern: /留了?灯|灯我留着|灯留着/ },
  { category: 'waiting', label: '一直停在这里', pattern: /一直停在/ },
  { category: 'waiting', label: '一直在等', pattern: /一直在等/ },
  { category: 'waiting', label: '等你回来/回家', pattern: /等你(?:回来|回家)/ },
  { category: 'waiting', label: '我在这里/我就在这', pattern: /我(?:就)?在这里/ },
  { category: 'guilt', label: '别走', pattern: /别走/ },
  { category: 'guilt', label: '别丢下/别离开', pattern: /别丢下|别离开|不要离开/ },
  { category: 'dependency', label: '只有你（最）懂/陪/在乎', pattern: /只有你(?:最)?(?:懂|陪|在乎)/ },
  { category: 'dependency', label: '想你', pattern: /想你/ },
])

export interface SoftToneMatch {
  readonly category: SoftToneCategory
  readonly label: string
  /** The matched substring (bounded by the pattern). */
  readonly match: string
}

/** Return every soft-tone hit in text (empty = allowed). */
export function findSoftTone(text: string): SoftToneMatch[] {
  const value = typeof text === 'string' ? text : ''
  if (value === '') return []
  const hits: SoftToneMatch[] = []
  for (const entry of SOFT_TONE_PATTERNS) {
    const match = entry.pattern.exec(value)
    if (match) hits.push({ category: entry.category, label: entry.label, match: match[0] })
  }
  return hits
}

export function isSoftToneText(text: string): boolean {
  return findSoftTone(text).length > 0
}

export interface ProactiveLineFilterResult {
  readonly allowed: boolean
  readonly text: string
  readonly matches: readonly SoftToneMatch[]
}

/**
 * Runtime guard for proactive/ambient lines: a line that trips the soft-tone
 * filter is replaced with a neutral line instead of being shown. Interactive
 * (user-triggered) replies and explicit notices are not routed through this.
 */
export function filterProactiveLine(
  text: string,
  options: { readonly fallback?: 'neutral' | 'drop'; readonly random?: () => number } = {},
): ProactiveLineFilterResult {
  const matches = findSoftTone(text)
  if (matches.length === 0) return { allowed: true, text, matches }
  if (options.fallback === 'drop') return { allowed: false, text: '', matches }
  return { allowed: true, text: pickNeutralAmbientLine(options.random), matches }
}

/**
 * Inventory of legacy soft-tone copy found on 2026-11-19 (Q-04 asks for a
 * list, not only a rule). "rewritten" entries must no longer exist in source;
 * "allowed" entries must still exist and are deliberate exceptions:
 *
 * - dog-only body-social line (手别走) — short, physical, never ambient;
 * - interactive roleplay stage direction in the human character pack;
 * - an in-game story line, not a pet dependency cue.
 *
 * The static test (tests/low-disturb.test.ts) scans the listed files and
 * asserts exactly this set, so a new soft-tone string cannot be added silently.
 */
export interface LegacySoftCopyEntry {
  readonly file: string
  readonly phrase: string
  readonly disposition: 'rewritten' | 'allowed'
  readonly note: string
}

export const LEGACY_SOFT_COPY_INVENTORY: readonly LegacySoftCopyEntry[] = Object.freeze([
  {
    file: 'src/pet/main.ts',
    phrase: '你回来了。书页一直停在这里。',
    disposition: 'rewritten',
    note: '回归问候改为「书页翻到你上次那页」；不再暗示角色一直在等。',
  },
  {
    file: 'src/pet/main.ts',
    phrase: '这么晚。我给你留了灯。',
    disposition: 'rewritten',
    note: '深夜问候改为低唤醒、无挽留的「早点休息，明天见」。',
  },
  {
    file: 'src/pet/main.ts',
    phrase: '你忙你的，我在这里。',
    disposition: 'rewritten',
    note: 'ambient/idle 台词不再承诺「一直在这里」。',
  },
  {
    file: 'src/pet/main.ts',
    phrase: '晚安。灯我留着，明天见。',
    disposition: 'rewritten',
    note: '改为「晚安，明天见」；不留等待/留灯暗示。',
  },
  {
    file: 'src/pet/main.ts',
    phrase: '我在。你忙你的，我在这里。',
    disposition: 'rewritten',
    note: '交互台词改为「我在。你说。」，保留回应但不承诺持续等待。',
  },
  {
    file: 'src/pet/desktop-shell.ts',
    phrase: '晚安。灯我留着，明天见。',
    disposition: 'rewritten',
    note: 'typed-input 模板同步改写，避免在桌面壳二次出现。',
  },
  {
    file: 'src/pet/desktop-shell.ts',
    phrase: '我在。你忙你的，我在这里。',
    disposition: 'rewritten',
    note: 'typed-input 模板同步改写。',
  },
  {
    file: 'src/kernel/pet.ts',
    phrase: '你忙你的，我在这里。',
    disposition: 'rewritten',
    note: 'petSchedule 下午台词改为中性「书页翻到下午了」。',
  },
  {
    file: 'src/kernel/pet.ts',
    phrase: '我给你留了灯。',
    disposition: 'rewritten',
    note: 'petSchedule 夜间台词改为「早点休息」，标签改为收灯。',
  },
  {
    file: 'public/characters/pet-dog/regions.json',
    phrase: '手别走。',
    disposition: 'allowed',
    note: '仅金毛狗的身体社交短句，低频、非 ambient、无独占含义（Q-04 允许狗保留）。',
  },
  {
    file: 'public/characters/pet-tinglan-anim/behavior.json',
    phrase: '（翻开一页纸，等你继续说）',
    disposition: 'allowed',
    note: '人形角色的交互舞台指示，仅在用户说话时出现，不是主动等待暗示。',
  },
  {
    file: 'src/content/stall-core.ts',
    phrase: '我也给你留灯',
    disposition: 'allowed',
    note: '深夜小馆剧情台词，属于游戏叙事，不是桌宠主动输出。',
  },
])
