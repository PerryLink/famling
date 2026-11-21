/**
 * Content calendar 「今天」 view model + live bridge (B2 2026-11-21).
 *
 * Two responsibilities, both side-effect free for the view half:
 *
 * 1. `buildContentCalendarToday()` is a PURE model of the lightweight "today"
 *    panel: which canonical node(s) today matches (festival / season / day-kind),
 *    the one line for the active character + channel, the user's custom key day
 *    (if any) and the next seven upcoming canonical nodes. The caller injects
 *    the catalog, the clock, the dialogue mode and the stored custom days; the
 *    model never reads storage, never touches the DOM and never throws.
 * 2. A tiny bridge registry lets `content-runtime.ts` publish a LIVE snapshot
 *    (catalog + live character + dialogue mode) without adding a main.ts callback;
 *    the settings dialog reads it when the user opens 「内容日历 · 今天」.
 *
 * The panel is manual-only: nothing here opens a bubble, schedules a timer or
 * fetches the network. quiet hours / 减少动态 only affect AUTOMATIC bubbles, so
 * the user can still open the view while they are active (the view says so).
 */
import {
  calendarCharacterId,
  findContentCustomKeyDay,
  resolveCalendarLine,
  resolveContentCustomDayLine,
  type ContentCustomKeyDay,
  type ContentLibrary,
} from './content-library.ts'
import {
  calendarDateKey,
  calendarWeekday,
  isValidCalendarDateParts,
  localDateParts,
  resolveCalendarOccasions,
  type CalendarDateParts,
  type CalendarEvents,
  type CalendarOccasion,
  type CalendarOccasionKind,
} from './calendar-events.ts'

const EMPTY_DAYS: readonly ContentCustomKeyDay[] = Object.freeze([])
const EMPTY_NODES: readonly ContentCalendarTodayNode[] = Object.freeze([])
const EMPTY_UPCOMING: readonly CalendarUpcomingNode[] = Object.freeze([])
const MS_PER_DAY = 86_400_000
const MAX_UPCOMING = 7
const MAX_CALENDAR_YEAR = 9999

/** One canonical calendar node matching today (canonical order). */
export interface ContentCalendarTodayNode {
  readonly id: string
  readonly kind: CalendarOccasionKind
  readonly name: string
}

/** The one line the view can show for today. */
export interface ContentCalendarTodayLine {
  readonly text: string
  /** `custom-day` = the user's locally synthesized "今天是 <标签>" line. */
  readonly source: 'calendar' | 'custom-day'
  readonly channel: 'ambient' | 'interactive'
  readonly characterId: string
  /** Built-in calendar character display name, when the id maps to one. */
  readonly characterName: string | null
  readonly occasionId: string
  readonly occasionName: string
}

/** One upcoming canonical node (next occurrence strictly after today). */
export interface CalendarUpcomingNode {
  /** 'YYYY-MM-DD' local date key of the next occurrence. */
  readonly date: string
  readonly id: string
  readonly name: string
  readonly kind: CalendarOccasionKind
  /** Days from today (always >= 1). */
  readonly inDays: number
}

/** Why the view is hidden (the panel only renders when `visible`). */
export type ContentCalendarTodayReason = 'ready' | 'disabled' | 'no-calendar-data' | 'invalid-date'

export interface ContentCalendarTodayView {
  /** False = the 「今天」 entry must not be rendered at all. */
  readonly visible: boolean
  readonly reason: ContentCalendarTodayReason
  /** 'YYYY-MM-DD' local date key (null when the clock is unusable). */
  readonly date: string | null
  readonly nodes: readonly ContentCalendarTodayNode[]
  readonly customDay: ContentCustomKeyDay | null
  readonly line: ContentCalendarTodayLine | null
  readonly upcoming: readonly CalendarUpcomingNode[]
}

export interface ContentCalendarTodayQuery {
  readonly library: ContentLibrary | null | undefined
  /** Live character id (hero pack kind / content selection); `human` accepted. */
  readonly characterId: unknown
  /** Active dialogue mode; unknown values only hide the line, not the nodes. */
  readonly dialogueMode: unknown
  /** User setting: only `false` hides the view (the shipped default is ON). */
  readonly enabled?: boolean
  /** Injected clock for tests; the default reads the local "now". */
  readonly now?: Date | null
  /** Explicit local date (tests/determinism); wins over `now`. */
  readonly date?: CalendarDateParts | null
  /** Stored custom key days (already validated). */
  readonly customDays?: readonly ContentCustomKeyDay[] | null
}

function hidden(reason: ContentCalendarTodayReason, date: string | null): ContentCalendarTodayView {
  return Object.freeze({
    visible: false,
    reason,
    date,
    nodes: EMPTY_NODES,
    customDay: null,
    line: null,
    upcoming: EMPTY_UPCOMING,
  })
}

function frozenNodes(matches: readonly { readonly id: string; readonly kind: CalendarOccasionKind; readonly name: string }[]): readonly ContentCalendarTodayNode[] {
  if (matches.length === 0) return EMPTY_NODES
  return Object.freeze(matches.map((match) => Object.freeze({ id: match.id, kind: match.kind, name: match.name })))
}

function resolveViewDate(query: ContentCalendarTodayQuery): CalendarDateParts | null {
  if (query.date !== undefined) return isValidCalendarDateParts(query.date) ? query.date : null
  return localDateParts(query.now)
}

function resolveTodayLine(
  library: ContentLibrary,
  events: CalendarEvents,
  date: CalendarDateParts,
  customDay: ContentCustomKeyDay | null,
  query: ContentCalendarTodayQuery,
): ContentCalendarTodayLine | null {
  const characterId = calendarCharacterId(query.characterId)
  const characterName =
    characterId === null ? null : (events.characters.find((pack) => pack.id === characterId)?.name ?? null)
  // A user custom key day is not character-bound: it always has a sentence.
  if (customDay !== null) {
    return Object.freeze({
      text: resolveContentCustomDayLine(customDay),
      source: 'custom-day' as const,
      channel: 'ambient' as const,
      characterId: characterId ?? '',
      characterName,
      occasionId: 'custom-day',
      occasionName: '自定义关键日',
    })
  }
  if (characterId === null || typeof query.dialogueMode !== 'string') return null
  // The view is explicit user intent, so a quiet dialogue pack falls back to the
  // interactive channel instead of showing nothing; automatic output stays
  // suppressed exactly as before (that gate lives in the caller).
  for (const channel of ['ambient', 'interactive'] as const) {
    const line = resolveCalendarLine(library, {
      characterId,
      dialogueMode: query.dialogueMode,
      channel,
      date,
    })
    if (line === null) continue
    return Object.freeze({
      text: line.line,
      source: 'calendar' as const,
      channel,
      characterId,
      characterName,
      occasionId: line.occasionId,
      occasionName: line.occasionName,
    })
  }
  return null
}

/**
 * Build the pure 「内容日历 · 今天」 view.
 *
 * Never throws for JSON-shaped input. `visible: false` covers the OFF setting,
 * catalogs without `calendarEvents` (old catalogs keep working) and a broken
 * clock; the line is null for characters without a built-in calendar pack and
 * for unknown dialogue modes, while the node list stays visible.
 */
export function buildContentCalendarToday(query: ContentCalendarTodayQuery): ContentCalendarTodayView {
  if (query === null || query === undefined || typeof query !== 'object') return hidden('no-calendar-data', null)
  if (query.enabled === false) return hidden('disabled', null)
  const library = query.library
  if (library === null || library === undefined) return hidden('no-calendar-data', null)
  const events = library.calendarEvents
  if (events === undefined || events === null) return hidden('no-calendar-data', null)
  const date = resolveViewDate(query)
  const dateKey = date === null ? null : calendarDateKey(date)
  if (date === null) {
    return Object.freeze({
      visible: true,
      reason: 'invalid-date' as const,
      date: null,
      nodes: EMPTY_NODES,
      customDay: null,
      line: null,
      upcoming: EMPTY_UPCOMING,
    })
  }
  const customDays = Array.isArray(query.customDays) ? query.customDays : EMPTY_DAYS
  const customDay = findContentCustomKeyDay(customDays, date)
  const nodes = frozenNodes(resolveCalendarOccasions(events, date))
  return Object.freeze({
    visible: true,
    reason: 'ready' as const,
    date: dateKey,
    nodes,
    customDay: customDay === null ? null : Object.freeze({ date: customDay.date, label: customDay.label }),
    line: resolveTodayLine(library, events, date, customDay, query),
    upcoming: listUpcomingCalendarNodes(events, date, MAX_UPCOMING),
  })
}

// ---------------------------------------------------------------------------
// Upcoming nodes (pure calendar arithmetic; no timezone library)
// ---------------------------------------------------------------------------

function utcMs(date: CalendarDateParts): number {
  const utc = new Date(0)
  utc.setUTCFullYear(date.year, date.month - 1, date.day)
  utc.setUTCHours(0, 0, 0, 0)
  return utc.getTime()
}

function daysBetween(from: CalendarDateParts, to: CalendarDateParts): number {
  return Math.round((utcMs(to) - utcMs(from)) / MS_PER_DAY)
}

function addDays(date: CalendarDateParts, offset: number): CalendarDateParts {
  const utc = new Date(utcMs(date) + offset * MS_PER_DAY)
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() }
}

/** Next occurrence of one festival date token strictly after `from`. */
function nextFestivalDate(token: string, from: CalendarDateParts): CalendarDateParts | null {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(token)
  if (full !== null) {
    const parts: CalendarDateParts = {
      year: Number(full[1]),
      month: Number(full[2]),
      day: Number(full[3]),
    }
    return isValidCalendarDateParts(parts) && utcMs(parts) > utcMs(from) ? parts : null
  }
  const monthDay = /^(\d{2})-(\d{2})$/.exec(token)
  if (monthDay === null) return null
  const month = Number(monthDay[1])
  const day = Number(monthDay[2])
  // An MM-DD recurs every year; scan a leap cycle so 02-29 is covered.
  for (let offset = 0; offset <= 8; offset += 1) {
    const year = from.year + offset
    if (year > MAX_CALENDAR_YEAR) return null
    const parts: CalendarDateParts = { year, month, day }
    if (isValidCalendarDateParts(parts) && utcMs(parts) > utcMs(from)) return parts
  }
  return null
}

function validMonths(months: readonly number[]): number[] {
  return months.filter((month) => Number.isInteger(month) && month >= 1 && month <= 12).sort((a, b) => a - b)
}

function nextOccurrence(occasion: CalendarOccasion, from: CalendarDateParts): CalendarDateParts | null {
  if (occasion.kind === 'festival') {
    let best: CalendarDateParts | null = null
    for (const token of occasion.dates) {
      const candidate = nextFestivalDate(token, from)
      if (candidate === null) continue
      if (best === null || utcMs(candidate) < utcMs(best)) best = candidate
    }
    return best
  }
  if (occasion.kind === 'season') {
    const months = validMonths(occasion.months)
    const first = months[0]
    if (first === undefined) return null
    const later = months.find((month) => month > from.month)
    return later !== undefined
      ? { year: from.year, month: later, day: 1 }
      : { year: Math.min(from.year + 1, MAX_CALENDAR_YEAR), month: first, day: 1 }
  }
  const weekdays = occasion.weekdays.filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
  if (weekdays.length === 0) return null
  const today = calendarWeekday(from)
  for (let offset = 1; offset <= 7; offset += 1) {
    if (weekdays.includes((today + offset) % 7)) return addDays(from, offset)
  }
  return null
}

/**
 * The next seven canonical nodes strictly after `from`, sorted by date (ties by
 * canonical occasion order). Pure; used by the 「今天」 view only.
 */
export function listUpcomingCalendarNodes(
  events: CalendarEvents | null | undefined,
  from: CalendarDateParts | null | undefined,
  limit: number = MAX_UPCOMING,
): readonly CalendarUpcomingNode[] {
  if (events === null || events === undefined || !isValidCalendarDateParts(from)) return EMPTY_UPCOMING
  const cap = Number.isFinite(limit) ? Math.min(MAX_UPCOMING, Math.max(1, Math.floor(limit))) : MAX_UPCOMING
  const candidates: CalendarUpcomingNode[] = []
  const orderById = new Map(events.occasions.map((occasion, index) => [occasion.id, index] as const))
  for (const occasion of events.occasions) {
    const next = nextOccurrence(occasion, from)
    if (next === null) continue
    candidates.push(
      Object.freeze({
        date: calendarDateKey(next),
        id: occasion.id,
        name: occasion.name,
        kind: occasion.kind,
        inDays: daysBetween(from, next),
      }),
    )
  }
  candidates.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1
    return (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0)
  })
  return Object.freeze(candidates.slice(0, cap))
}

// ---------------------------------------------------------------------------
// Live bridge: content-runtime publishes; the settings dialog reads
// ---------------------------------------------------------------------------

/** Live catalog/character/mode snapshot published by `content-runtime.ts`. */
export interface ContentCalendarTodaySource {
  readonly library: ContentLibrary | null
  readonly characterId: string | null
  readonly dialogueMode: string | null
}

let todaySourceProvider: (() => ContentCalendarTodaySource | null) | null = null

/** Register (or clear, with null) the live snapshot provider. Never throws. */
export function setContentCalendarTodaySource(provider: (() => ContentCalendarTodaySource | null) | null): void {
  todaySourceProvider = typeof provider === 'function' ? provider : null
}

/**
 * Read the live snapshot. Returns null when the content runtime is not loaded
 * yet, when the host cleared it, or when the provider misbehaves (fail closed).
 */
export function readContentCalendarTodaySource(): ContentCalendarTodaySource | null {
  if (todaySourceProvider === null) return null
  let source: ContentCalendarTodaySource | null = null
  try {
    source = todaySourceProvider()
  } catch {
    return null
  }
  if (source === null || typeof source !== 'object') return null
  return Object.freeze({
    library: source.library ?? null,
    characterId: typeof source.characterId === 'string' ? source.characterId : null,
    dialogueMode: typeof source.dialogueMode === 'string' ? source.dialogueMode : null,
  })
}

/** True when the live snapshot can render the view (catalog has calendar data). */
export function contentCalendarTodayAvailable(source: ContentCalendarTodaySource | null): boolean {
  return source !== null && source.library !== null && source.library.calendarEvents !== undefined
}
