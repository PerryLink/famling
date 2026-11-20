/**
 * Calendar events: season / neutral public-festival / weekday-weekend lines.
 *
 * The desktop pet may overlay ONE short calendar line on top of whatever the
 * active dialogue pack already says. This module owns the deterministic
 * selection; the text and date rules are data (`calendarEvents` in
 * public/content/library.json, validated by content-library.ts).
 *
 * Contract:
 * - PURE leaf: no imports, no DOM, no network, no timers, no storage, no
 *   timezone library, no ambient randomness. The caller injects the local
 *   date/clock; the same query always yields the same line.
 * - Neutral occasions only: New Year, Spring Festival, Lantern Festival,
 *   Qingming, Dragon Boat, Mid-Autumn, National Day, Christmas + weekend /
 *   weekday + four seasons. No check-in, streak, push, countdown or FOMO.
 * - Unknown / invalid input (date, character, dialogue mode, channel) degrades
 *   to null; nothing throws.
 */

// ---------------------------------------------------------------------------
// Taxonomy: code owns the closed id/kind set; library.json owns names, dates
// and lines so wording can change without touching selection logic.
// ---------------------------------------------------------------------------

/** Schema id of the optional `calendarEvents` block in public/content/library.json. */
export const CALENDAR_SCHEMA = 'famling.calendar/0.1'

/** Occasion families. Only `festival` is a date-bound single-day event. */
export const CALENDAR_OCCASION_KINDS = ['festival', 'season', 'day-kind'] as const
export type CalendarOccasionKind = (typeof CALENDAR_OCCASION_KINDS)[number]

/** Bubble channel: automatic ambient bubble vs explicit interaction reply. */
export const CALENDAR_CHANNELS = ['ambient', 'interactive'] as const
export type CalendarChannel = (typeof CALENDAR_CHANNELS)[number]

/**
 * Dialogue modes the overlay respects. Literal mirror of content-library
 * DIALOGUE_MODES (pinned by tests/calendar-events.test.ts) so this module stays
 * a leaf and does not import the catalog module.
 */
export const CALENDAR_DIALOGUE_MODES = ['standard', 'brief', 'quiet', 'custom'] as const
export type CalendarDialogueMode = (typeof CALENDAR_DIALOGUE_MODES)[number]

/** Characters that ship built-in calendar line packs (origami is intentionally excluded). */
export const CALENDAR_CHARACTER_IDS = ['humanoid', 'cat', 'dog'] as const
export type CalendarCharacterId = (typeof CALENDAR_CHARACTER_IDS)[number]

export interface CalendarOccasionDefinition {
  readonly id: string
  readonly kind: CalendarOccasionKind
}

/**
 * Canonical occasion list (stable order). The order doubles as the same-day
 * tie-break: when one date matches two festivals (2031-10-01 is both Mid-Autumn
 * and National Day) the earlier entry wins deterministically.
 */
export const CALENDAR_OCCASIONS: readonly CalendarOccasionDefinition[] = Object.freeze([
  Object.freeze({ id: 'new-year', kind: 'festival' }),
  Object.freeze({ id: 'spring-festival', kind: 'festival' }),
  Object.freeze({ id: 'lantern-festival', kind: 'festival' }),
  Object.freeze({ id: 'qingming', kind: 'festival' }),
  Object.freeze({ id: 'dragon-boat', kind: 'festival' }),
  Object.freeze({ id: 'mid-autumn', kind: 'festival' }),
  Object.freeze({ id: 'national-day', kind: 'festival' }),
  Object.freeze({ id: 'christmas', kind: 'festival' }),
  Object.freeze({ id: 'season-spring', kind: 'season' }),
  Object.freeze({ id: 'season-summer', kind: 'season' }),
  Object.freeze({ id: 'season-autumn', kind: 'season' }),
  Object.freeze({ id: 'season-winter', kind: 'season' }),
  Object.freeze({ id: 'weekday', kind: 'day-kind' }),
  Object.freeze({ id: 'weekend', kind: 'day-kind' }),
])

/** Data bounds shared with content-library.ts validation. */
export const CALENDAR_LIMITS = Object.freeze({
  maxFestivalDates: 24,
  maxLinesPerChannel: 4,
  maxLineChars: 40,
  maxOccasionNameChars: 24,
  maxCharacterNameChars: 24,
  maxCharacters: 8,
})

// ---------------------------------------------------------------------------
// Data shapes (structurally identical to the validated library.json block)
// ---------------------------------------------------------------------------

export interface CalendarChannelLines {
  readonly ambient?: readonly string[]
  readonly interactive?: readonly string[]
}

export interface CalendarCharacterLines {
  readonly id: string
  readonly name: string
  readonly source: 'builtin'
  readonly available: boolean
  readonly lines: Readonly<Record<string, CalendarChannelLines>>
}

export interface CalendarFestivalOccasion {
  readonly id: string
  readonly name: string
  readonly kind: 'festival'
  /** 'MM-DD' = same month/day every year; 'YYYY-MM-DD' = one explicit year. */
  readonly dates: readonly string[]
}

export interface CalendarSeasonOccasion {
  readonly id: string
  readonly name: string
  readonly kind: 'season'
  /** Month numbers 1..12 (meteorological seasons). */
  readonly months: readonly number[]
}

export interface CalendarDayKindOccasion {
  readonly id: string
  readonly name: string
  readonly kind: 'day-kind'
  /** JS weekday numbers: 0 = Sunday .. 6 = Saturday. */
  readonly weekdays: readonly number[]
}

export type CalendarOccasion = CalendarFestivalOccasion | CalendarSeasonOccasion | CalendarDayKindOccasion

/** Optional additive block of the built-in catalog document. */
export interface CalendarEvents {
  readonly schema: typeof CALENDAR_SCHEMA
  readonly version: string
  readonly updatedAt: string
  readonly occasions: readonly CalendarOccasion[]
  readonly characters: readonly CalendarCharacterLines[]
}

// ---------------------------------------------------------------------------
// Query + result
// ---------------------------------------------------------------------------

/** Local calendar date; no timezone is attached (the caller owns the clock). */
export interface CalendarDateParts {
  readonly year: number
  readonly month: number
  readonly day: number
}

export interface CalendarLineQuery {
  /** Character id; unknown ids (and `available: false` packs) degrade to null. */
  readonly characterId: string
  /** Active dialogue pack mode; unknown modes degrade to null. */
  readonly dialogueMode: string
  /** Defaults to 'ambient'. */
  readonly channel?: CalendarChannel
  /** Explicit local date (tests/determinism). Wins over `now`. */
  readonly date?: CalendarDateParts | null
  /** Injectable clock, used only when `date` is absent; defaults to `new Date()`. */
  readonly now?: Date | null
  /** Integration/user OFF switch: `false` always returns null. */
  readonly enabled?: boolean
}

export interface CalendarOccasionMatch {
  readonly id: string
  readonly kind: CalendarOccasionKind
  readonly name: string
}

/** The one overlayable line this module can produce for a query. */
export interface CalendarLine {
  /** 'YYYY-MM-DD' local date key the line was selected for. */
  readonly date: string
  readonly occasionId: string
  readonly occasionName: string
  readonly occasionKind: CalendarOccasionKind
  readonly characterId: string
  readonly channel: CalendarChannel
  readonly line: string
}

const EMPTY_MATCHES: readonly CalendarOccasionMatch[] = Object.freeze([])
const EMPTY_LINES: readonly string[] = Object.freeze([])

// ---------------------------------------------------------------------------
// Date helpers (calendar arithmetic only; no timezone library)
// ---------------------------------------------------------------------------

/** True for a real Gregorian date with a 4-digit year (1000..9999). */
export function isValidCalendarDateParts(value: CalendarDateParts | null | undefined): value is CalendarDateParts {
  if (value === null || value === undefined) return false
  const year = value.year
  const month = value.month
  const day = value.day
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1000 || year > 9999) return false
  if (typeof month !== 'number' || !Number.isInteger(month) || month < 1 || month > 12) return false
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 31) return false
  const utc = new Date(0)
  utc.setUTCFullYear(year, month - 1, day)
  utc.setUTCHours(0, 0, 0, 0)
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day
}

function pad2(value: number): string {
  return value < 10 ? '0' + value : String(value)
}

/** 'YYYY-MM-DD' key for a (valid) local date. */
export function calendarDateKey(date: CalendarDateParts): string {
  return String(date.year).padStart(4, '0') + '-' + pad2(date.month) + '-' + pad2(date.day)
}

/** JS weekday number (0 = Sunday .. 6 = Saturday) for a local calendar date. */
export function calendarWeekday(date: CalendarDateParts): number {
  const utc = new Date(0)
  utc.setUTCFullYear(date.year, date.month - 1, date.day)
  utc.setUTCHours(0, 0, 0, 0)
  return utc.getUTCDay()
}

/**
 * Local date parts of an injected clock. Reading local getters is deliberate:
 * the pet selects by the user LOCAL day, not UTC. `null` degrades to null.
 */
export function localDateParts(clock: Date | null | undefined = new Date()): CalendarDateParts | null {
  if (clock === null) return null
  if (!(clock instanceof Date) || Number.isNaN(clock.getTime())) return null
  const parts: CalendarDateParts = {
    year: clock.getFullYear(),
    month: clock.getMonth() + 1,
    day: clock.getDate(),
  }
  return isValidCalendarDateParts(parts) ? parts : null
}

function resolveQueryDate(query: CalendarLineQuery): CalendarDateParts | null {
  if (query.date !== undefined) {
    return isValidCalendarDateParts(query.date) ? query.date : null
  }
  return localDateParts(query.now)
}

// ---------------------------------------------------------------------------
// Matching + deterministic selection
// ---------------------------------------------------------------------------

function isCalendarEventsLike(events: CalendarEvents | null | undefined): events is CalendarEvents {
  if (events === null || events === undefined) return false
  return Array.isArray(events.occasions) && Array.isArray(events.characters)
}

/** All occasions matching a local date, in canonical order (may be empty). */
export function resolveCalendarOccasions(
  events: CalendarEvents | null | undefined,
  date: CalendarDateParts | null | undefined,
): readonly CalendarOccasionMatch[] {
  if (!isCalendarEventsLike(events) || !isValidCalendarDateParts(date)) return EMPTY_MATCHES
  const key = calendarDateKey(date)
  const monthDay = key.slice(5)
  const weekday = calendarWeekday(date)
  const matches: CalendarOccasionMatch[] = []
  for (const occasion of events.occasions) {
    let matched = false
    if (occasion.kind === 'festival') {
      matched = occasion.dates.includes(key) || occasion.dates.includes(monthDay)
    } else if (occasion.kind === 'season') {
      matched = occasion.months.includes(date.month)
    } else if (occasion.kind === 'day-kind') {
      matched = occasion.weekdays.includes(weekday)
    }
    if (matched) matches.push(Object.freeze({ id: occasion.id, kind: occasion.kind, name: occasion.name }))
  }
  return matches.length === 0 ? EMPTY_MATCHES : Object.freeze(matches)
}

/**
 * Candidate order for one channel. Festivals always win; otherwise:
 * - ambient: season first, then weekday/weekend (spontaneous seasonal ambience);
 * - interactive: weekday/weekend first, then season (an explicit poke gets the
 *   more useful today-is-a-workday/weekend reply).
 */
function orderedCandidates(
  matches: readonly CalendarOccasionMatch[],
  channel: CalendarChannel,
): readonly CalendarOccasionMatch[] {
  const festivals: CalendarOccasionMatch[] = []
  const seasons: CalendarOccasionMatch[] = []
  const dayKinds: CalendarOccasionMatch[] = []
  for (const match of matches) {
    if (match.kind === 'festival') festivals.push(match)
    else if (match.kind === 'season') seasons.push(match)
    else dayKinds.push(match)
  }
  if (festivals.length > 0) return festivals
  return channel === 'ambient' ? [...seasons, ...dayKinds] : [...dayKinds, ...seasons]
}

function candidateLines(pack: CalendarCharacterLines, occasionId: string, channel: CalendarChannel): readonly string[] {
  const spec = pack.lines?.[occasionId]
  if (spec === undefined) return EMPTY_LINES
  const lines = spec[channel]
  return Array.isArray(lines) ? lines : EMPTY_LINES
}

/** FNV-1a 32-bit; small, dependency-free and stable across platforms. */
function hashText(text: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Select the single optional calendar line for a query.
 *
 * Deterministic: line = lines[FNV1a(date|occasion|channel|character) % count].
 * Degrades to null for OFF (`enabled: false`), quiet+ambient, unknown
 * character/mode/channel, `available: false` packs, old catalogs without
 * `calendarEvents`, and invalid dates. Never throws for JSON-shaped input.
 */
export function pickCalendarLine(
  events: CalendarEvents | null | undefined,
  query: CalendarLineQuery | null | undefined,
): CalendarLine | null {
  if (query === null || query === undefined || typeof query !== 'object') return null
  if (query.enabled === false) return null
  if (typeof query.characterId !== 'string' || typeof query.dialogueMode !== 'string') return null
  if (!(CALENDAR_DIALOGUE_MODES as readonly string[]).includes(query.dialogueMode)) return null
  const channel = query.channel ?? 'ambient'
  if (!(CALENDAR_CHANNELS as readonly string[]).includes(channel)) return null
  // quiet = explicit interactions only; automatic ambient bubbles stay silent.
  if (query.dialogueMode === 'quiet' && channel === 'ambient') return null
  if (!isCalendarEventsLike(events)) return null
  const date = resolveQueryDate(query)
  if (date === null) return null
  const pack = events.characters.find((candidate) => candidate.id === query.characterId)
  if (pack === undefined || pack.available !== true) return null
  const matches = resolveCalendarOccasions(events, date)
  if (matches.length === 0) return null
  const key = calendarDateKey(date)
  for (const candidate of orderedCandidates(matches, channel)) {
    const lines = candidateLines(pack, candidate.id, channel)
    if (lines.length === 0) continue
    const index = hashText(key + '|' + candidate.id + '|' + channel + '|' + pack.id) % lines.length
    const line = lines[index]
    if (typeof line !== 'string' || line.length === 0) continue
    return Object.freeze({
      date: key,
      occasionId: candidate.id,
      occasionName: candidate.name,
      occasionKind: candidate.kind,
      characterId: pack.id,
      channel,
      line,
    })
  }
  return null
}
