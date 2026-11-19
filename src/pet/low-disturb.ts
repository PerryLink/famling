/**
 * Low-disturbance controls (E7 / MB-070 + MB-075).
 *
 * Two concerns live here, both pure (no DOM):
 *
 * 1. Quiet hours / 夜间安静 — a persisted local wall-clock window
 *    (default 22:00–08:00, enabled by default, user can change or disable it).
 *    While active the pet must not emit *proactive* output (ambient bubbles,
 *    night greetings, auto environment actions) and the 2h health reminder is
 *    deferred; user-triggered interactions still answer normally. This matches
 *    the product-wide 安静 semantic (C-11 / Q-01): 安静 = 关闭自动/环境输出，
 *    交互回应仍可用.
 *
 * 2. Soft emotional copy guard — waiting / leaving-the-light-on / guilt hints
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
