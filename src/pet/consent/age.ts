/**
 * Age verification (SELF-REPORTED birth date) for the roleplay 18+ gate.
 *
 * Policy (user decisions 2026-11-17.5 + D6 2026-11-20):
 * - General desk-pet features stay all-ages and are never gated by a birth date.
 * - Roleplay / emotional-companionship interaction is 18+ ONLY. A minor (or a
 *   user who has not completed verification) can use the app but must never
 *   start roleplay: `ConsentGate.requestRoleplay()` rejects with a typed
 *   reason (`age-required` / `minor`) before any TOS/declaration form opens.
 * - D6 / data minimisation: the self-report is NOT collected at first launch.
 *   It is asked ONLY when the user actually enters an age-gated feature
 *   (roleplay) or explicitly chooses to verify/correct it from About. A
 *   declined/cancelled age prompt only blocks that gated entry; it never puts
 *   the whole app in safe read-only.
 *
 * Honesty / safety invariants (locked by tests/age-*.test.ts):
 * - This is NOT an official identity check (no ID card, photo, address,
 *   government database or real-name service). It only records what the user
 *   says their birth date is, plus when they said it. It cannot prove identity.
 * - The user must pick year/month/day themselves when the age-gated feature asks
 *   (or from About): no prefill, no default value, no "select all"/"skip". A
 *   missing/corrupt/invalid record always fails closed (the user is treated as
 *   NOT verified).
 * - Dates are validated for real (Gregorian leap years, month lengths, not in
 *   the future, year range 1900..today, age ceiling 120). Age is recomputed
 *   from the birth date each time (birthday-passed rule).
 * - The record is stored locally only (namespaced localStorage key) with the
 *   verification time. No network, no logging of the birth date, no ID/photo/
 *   address collection. "Delete all local data" includes this key; the About
 *   panel only ever shows an age band (never the full birth date).
 */
import type { StorageLike } from './core.ts'

/** Namespaced local-only storage key for the self-reported birth date. */
export const AGE_STORAGE_KEY = 'desktop-games/consent/age-verification-v1'
export const AGE_FORMAT = 'pet-age-verification'
export const AGE_SCHEMA = 1

/** Roleplay (roleplay/emotional companionship) is restricted to adults. */
export const ADULT_AGE = 18
/** Earliest acceptable birth year (user-selected date must be >= 1900). */
export const AGE_MIN_YEAR = 1900
/** Upper bound: a declared age above this is treated as an input error. */
export const AGE_MAX_AGE = 120

/** Copy shared by the age-gated modal, About and the setup page. */
export const AGE_ROLEPLAY_POLICY =
  '一般桌宠功能全年龄可用；角色扮演/情感陪伴（roleplay）仅限年满 18 周岁用户，未满 18 周岁不能启动角色扮演。'
export const AGE_SELF_REPORT_NOTICE =
  '这是你自报出生日期的年龄核验：不是官方身份证核验，也不等同实名认证，无法证明你的真实身份；请如实填写，虚假填写由你自行承担后果。'
export const AGE_DATA_NOTICE =
  '出生日期只保存在本机（localStorage）并记录核验时间，不上传、不写日志；不采集身份证、照片、住址；首次启动与一般功能不采集出生日期，只在进入 18+ 功能或你主动核验时采集。可在 About 更正年龄，“删除全部本地数据”会一并删除年龄记录。'
export const AGE_DECLINE_NOTICE = '拒绝或取消年龄核验只会阻止本次进入 18+ 功能（角色扮演/情感陪伴），不会静默跳过或伪造成年；一般功能仍可正常使用。'
export const AGE_MINORS_NOTE =
  '未满 18 周岁仍可使用一般功能，但角色扮演会被阻止并提示原因；监护人可通过 novelnexusai@outlook.com 要求删除/举报。'

export interface AgeVerification {
  readonly format: typeof AGE_FORMAT
  readonly schema: typeof AGE_SCHEMA
  readonly birthYear: number
  readonly birthMonth: number
  readonly birthDay: number
  /** ISO timestamp of when the user confirmed the self-report. */
  readonly verifiedAt: string
}

export type AgeReadStatus = 'verified' | 'missing' | 'corrupt' | 'invalid' | 'unavailable'

export interface AgeRead {
  readonly record: AgeVerification | null
  readonly status: AgeReadStatus
  readonly corrupt: boolean
}

export interface BirthDateInput {
  readonly year?: number | null
  readonly month?: number | null
  readonly day?: number | null
}

export type BirthDateError =
  | 'year-missing'
  | 'month-missing'
  | 'day-missing'
  | 'year-range'
  | 'month-range'
  | 'day-range'
  | 'date-invalid'
  | 'future'
  | 'age-over-limit'

export type BirthDateValidation =
  | { readonly ok: true; readonly year: number; readonly month: number; readonly day: number; readonly age: number }
  | { readonly ok: false; readonly errors: readonly BirthDateError[] }

export const BIRTH_DATE_ERROR_MESSAGES: Readonly<Record<BirthDateError, string>> = {
  'year-missing': '请选择出生年份。',
  'month-missing': '请选择出生月份。',
  'day-missing': '请选择出生日期。',
  'year-range': `出生年份需在 ${AGE_MIN_YEAR} 至今年之间。`,
  'month-range': '出生月份需在 1 至 12 之间。',
  'day-range': '出生日期需在 1 至 31 之间。',
  'date-invalid': '该日期不存在：请检查月份天数和闰年（如 2 月 29 日）。',
  future: '出生日期不能晚于今天。',
  'age-over-limit': `年龄上限为 ${AGE_MAX_AGE} 周岁，请检查出生年份是否填错。`,
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** Days in a Gregorian month; returns 0 for an out-of-range month. */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return 0
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31
    case 4:
    case 6:
    case 9:
    case 11:
      return 30
    case 2:
      return isLeapYear(year) ? 29 : 28
    default:
      return 0
  }
}

/**
 * Birthday-passed calendar age: subtract one if this year's birthday has not
 * happened yet. Uses the LOCAL calendar date of `now` (what the user sees).
 */
export function computeAge(year: number, month: number, day: number, now: Date): number {
  let age = now.getFullYear() - year
  const monthDelta = now.getMonth() + 1 - month
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < day)) age -= 1
  return age
}

export function isAdultAge(age: number): boolean {
  return Number.isFinite(age) && age >= ADULT_AGE
}

/** Age band label for UI. NEVER includes the full birth date. */
export function ageBandLabel(age: number): string {
  return isAdultAge(age) ? '18 周岁及以上' : '未满 18 周岁'
}

/**
 * Validate a user-picked birth date. `now` drives "not in the future" and the
 * 120-year ceiling. Missing values are invalid by design (no default/prefill).
 */
export function validateBirthDate(input: BirthDateInput, now: Date): BirthDateValidation {
  const errors: BirthDateError[] = []
  const { year, month, day } = input
  const yearMissing = typeof year !== 'number' || !Number.isFinite(year) || !Number.isInteger(year)
  const monthMissing = typeof month !== 'number' || !Number.isFinite(month) || !Number.isInteger(month)
  const dayMissing = typeof day !== 'number' || !Number.isFinite(day) || !Number.isInteger(day)
  if (yearMissing) errors.push('year-missing')
  if (monthMissing) errors.push('month-missing')
  if (dayMissing) errors.push('day-missing')
  if (errors.length > 0) return { ok: false, errors }

  const y = year as number
  const m = month as number
  const d = day as number
  if (y < AGE_MIN_YEAR || y > now.getFullYear()) errors.push('year-range')
  if (m < 1 || m > 12) errors.push('month-range')
  if (d < 1 || d > 31) errors.push('day-range')
  if (errors.length > 0) return { ok: false, errors }
  if (d > daysInMonth(y, m)) return { ok: false, errors: ['date-invalid'] }

  const today = { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
  const future =
    y > today.year ||
    (y === today.year && (m > today.month || (m === today.month && d > today.day)))
  if (future) return { ok: false, errors: ['future'] }

  const age = computeAge(y, m, d, now)
  if (age > AGE_MAX_AGE) return { ok: false, errors: ['age-over-limit'] }
  return { ok: true, year: y, month: m, day: d, age }
}

export function createAgeVerification(
  year: number,
  month: number,
  day: number,
  verifiedAt: string,
): AgeVerification {
  return {
    format: AGE_FORMAT,
    schema: AGE_SCHEMA,
    birthYear: year,
    birthMonth: month,
    birthDay: day,
    verifiedAt,
  }
}

export function serializeAgeVerification(record: AgeVerification): string {
  return JSON.stringify(record)
}

function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value))
}

/**
 * Parse a persisted self-report. Corrupt / malformed / now-invalid data is
 * surfaced and NEVER treated as verified (fail closed: verify again).
 */
export function parseAgeVerificationRaw(raw: string | null | undefined, now: Date): AgeRead {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { record: null, status: 'missing', corrupt: false }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { record: null, status: 'corrupt', corrupt: true }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { record: null, status: 'corrupt', corrupt: true }
  }
  const record = parsed as Record<string, unknown>
  const structural =
    record.format === AGE_FORMAT &&
    record.schema === AGE_SCHEMA &&
    typeof record.birthYear === 'number' &&
    typeof record.birthMonth === 'number' &&
    typeof record.birthDay === 'number' &&
    isValidIsoTimestamp(record.verifiedAt)
  if (!structural) return { record: null, status: 'corrupt', corrupt: true }
  const validation = validateBirthDate(
    {
      year: record.birthYear as number,
      month: record.birthMonth as number,
      day: record.birthDay as number,
    },
    now,
  )
  if (!validation.ok) return { record: null, status: 'invalid', corrupt: false }
  return {
    record: createAgeVerification(
      validation.year,
      validation.month,
      validation.day,
      record.verifiedAt as string,
    ),
    status: 'verified',
    corrupt: false,
  }
}

export interface AgeBandView {
  readonly verified: boolean
  readonly adult: boolean
  readonly age: number
  readonly band: string
  readonly verifiedAt: string
}

/** Read-only band view for About/setup (never the full birth date). */
export function ageBandView(record: AgeVerification, now: Date): AgeBandView {
  const age = computeAge(record.birthYear, record.birthMonth, record.birthDay, now)
  return {
    verified: true,
    adult: isAdultAge(age),
    age,
    band: ageBandLabel(age),
    verifiedAt: record.verifiedAt,
  }
}

/** Structural storage surface used by tests (same as consent storage). */
export type AgeStorageLike = StorageLike
