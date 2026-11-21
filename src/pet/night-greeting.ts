/**
 * One-shot 夜间问候 (B3, 2026-11-21).
 *
 * The old boot path emitted the 23:00–06:00 greeting as an `ambient` line, and
 * quiet hours (default 22:00–08:00) suppress every ambient line — so the copy
 * was unreachable in the shipped default (dead copy).
 *
 * This module keeps the product promise "安静 = 零主动输出" intact: instead of
 * a bubble at boot the line is ARMED and shown exactly ONCE on the first
 * user-triggered interaction inside the night window. It never writes history,
 * never saves and never fires from a timer.
 *
 * The copy is the exact line the old ambient branch used (low-arousal, no
 * waiting/guilt wording, so it passes the MB-075 soft-tone inventory).
 */

/** Exact night copy from the old (unreachable) boot branch. */
export const NIGHT_GREETING_LINE = '……这么晚还在呀。早点休息，明天见。'

export interface NightGreeting {
  /** Arm the one-shot line (boot inside the night window, or crossing 23:00). */
  arm(): void
  /** Drop it without showing (daytime, data wipe, reload). */
  disarm(): void
  pending(): boolean
  /** Return the line exactly once, then clear it. */
  take(): string | null
  /**
   * Day/night transition hook. Entering night arms; leaving night disarms, so
   * a stale pending line can never surface in the morning.
   */
  onDayNightChange(next: { readonly night: boolean }, previous: { readonly night: boolean } | null): void
}

/** Pure one-shot latch; main.ts/day-night-page.ts own the copy path. */
export function createNightGreeting(line: string = NIGHT_GREETING_LINE): NightGreeting {
  let armed = false
  return {
    arm: () => {
      armed = true
    },
    disarm: () => {
      armed = false
    },
    pending: () => armed,
    take: () => {
      if (!armed) return null
      armed = false
      return line
    },
    onDayNightChange: (next, previous) => {
      if (next.night && previous !== null && !previous.night) {
        armed = true
      } else if (!next.night) {
        armed = false
      }
    },
  }
}
