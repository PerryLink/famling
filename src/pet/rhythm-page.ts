/**
 * 作息 / 隐身的页面接线 (B3, 2026-11-21).
 *
 * main.ts keeps one factory call + a handful of call sites; this module owns the
 * page-level composition of:
 * - day-night-page.ts (22:00 quiet / 23:00 sleep / 06:00 wake clock + one-shot
 *   night greeting), driven by the EXISTING 15 s health poll and paused while
 *   the window is hidden;
 * - hide-for.ts (定时隐身 1h / 到明天 / 关闭 with automatic restore and the shared
 *   Tauri window port).
 *
 * Keeping the wiring here is what keeps main.ts at its line budget after B3.
 */

import { createDayNightPage, type DayNightHeroMirror } from './day-night-page.ts'
import type { TimeOfDay } from './day-night.ts'
import { createHideForPage, type HideForMenuPort } from './hide-for.ts'

export interface RhythmPageOptions {
  readonly document: Document
  readonly now: () => Date
  readonly isQuiet: (at: Date) => boolean
  readonly getMood: () => { readonly happy: boolean; readonly muted: boolean }
  readonly syncHero: (input: DayNightHeroMirror) => void
  readonly say: (line: string) => void
  readonly hasTauri: boolean
  readonly canInteract: () => boolean
  readonly reportFailure: (error: unknown) => void
}

export interface RhythmPage {
  /** render(): re-resolve + apply the clock and mirror mood to the hero scene. */
  syncRender(): void
  /** Existing 15 s poll hook: re-resolve + apply only when the state changed. */
  sync(): void
  /** Boot (post-consent): restore a still-active persisted 定时隐身. */
  start(): void
  /** Boot: ambient night line when quiet hours are OFF, else arm the one-shot. */
  armNightGreetingIfNight(): string | null
  /** A tap that woke a sleeping pet counts as a user-triggered interaction. */
  noteSleepWake(): void
  /** Boot ambient fallback line (night/morning/busy copy). */
  bootFallbackLine(): string
  /** Menu port for 定时隐身; null in the browser build (no window to hide). */
  hideForPort(): HideForMenuPort | null
  /** Data wipe: clear the persisted deadline/timer and show the pet again. */
  reset(): void
  timeOfDay(): TimeOfDay
}

/** Compose the page-level day/night + hide-for surfaces for the live pet window. */
export function createRhythmPage(options: RhythmPageOptions): RhythmPage {
  const dayNightPage = createDayNightPage({
    document: options.document,
    now: options.now,
    isQuiet: options.isQuiet,
    getMood: options.getMood,
    syncHero: options.syncHero,
    say: options.say,
  })
  const hideForPage = createHideForPage({
    hasTauri: options.hasTauri,
    canInteract: options.canInteract,
    reportFailure: options.reportFailure,
  })
  return {
    syncRender: () => {
      dayNightPage.sync()
      dayNightPage.apply()
    },
    sync: () => {
      dayNightPage.sync()
    },
    start: () => {
      hideForPage.start()
    },
    armNightGreetingIfNight: () => dayNightPage.armNightGreetingIfNight(),
    noteSleepWake: () => dayNightPage.noteUserInteraction(),
    bootFallbackLine: () => dayNightPage.bootFallbackLine(),
    hideForPort: () => hideForPage.menuPort(),
    reset: () => hideForPage.reset(),
    timeOfDay: () => dayNightPage.state().timeOfDay,
  }
}
