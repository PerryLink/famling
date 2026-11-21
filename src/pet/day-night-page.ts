/**
 * Page wiring for the day/night clock (B3, 2026-11-21).
 *
 * `main.ts` keeps only the creation + a few call sites; this module owns:
 * - applying the resolved state to the page (`body[data-time]`,
 *   `body[data-quiet]`, `#pet.sleepy`) and mirroring it to the live hero scene;
 * - the boot/transition night-greeting latch (see night-greeting.ts);
 * - the "first night interaction" hook (one document-level listener, so no
 *   per-action changes are needed in every interaction handler).
 *
 * The clock is driven by the EXISTING pet-window schedule (the 15 s health poll
 * plus its visibility-resume tick) and paused while the document is hidden; it
 * adds no interval/timer of its own.
 */

import { createDayNightClock, type DayNightState } from './day-night.ts'
import { NIGHT_GREETING_LINE, createNightGreeting, type NightGreeting } from './night-greeting.ts'

export interface DayNightHeroMirror {
  readonly happy: boolean
  readonly sleepy: boolean
  readonly muted: boolean
  readonly night: boolean
}

export interface DayNightPageOptions {
  readonly document: Document
  /** Wall-clock reader (tests inject a fake date). */
  readonly now: () => Date
  /** Persisted quiet-hours predicate; read live on every tick. */
  readonly isQuiet: (at: Date) => boolean
  /** Hidden-window probe (default: document.visibilityState === 'hidden'). */
  readonly isHidden?: () => boolean
  /** Mirror to the hero scene (no-op when the hero renderer is not live). */
  readonly syncHero?: (input: DayNightHeroMirror) => void
  /** Current kernel mood flags for the hero mirror (happy/muted). */
  readonly getMood?: () => { readonly happy: boolean; readonly muted: boolean }
  /** Speak one user-triggered line (interactive kind: quiet hours allow it). */
  readonly say?: (text: string) => void
  /** Test seam: interaction listeners off. */
  readonly listenForInteractions?: boolean
}

export interface DayNightPage {
  /** Recompute + apply; returns the resolved state (idempotent). */
  sync(): DayNightState
  /** Re-apply the current state (render() uses it to mirror mood changes). */
  apply(): void
  state(): DayNightState
  /**
   * Boot: inside the night window, arm the one-shot line when quiet hours are
   * active, and return the ambient copy only when quiet hours are OFF (the old
   * reachable behaviour). Outside the night window it returns null.
   */
  armNightGreetingIfNight(): string | null
  /** First user-triggered interaction of the night window -> one line, once. */
  noteUserInteraction(): void
  /** Boot ambient fallback: night copy / morning copy / neutral busy copy. */
  bootFallbackLine(): string
  dispose(): void
}

/** Resolve the hidden flag without throwing on partial documents. */
function defaultHidden(document: Document): boolean {
  try {
    return document.visibilityState === 'hidden'
  } catch {
    return false
  }
}

/**
 * Build the page controller. The caller drives it from an existing schedule
 * (main.ts: `startHealthReminder({ onTick: () => dayNightPage.sync() })`) and
 * from `render()`; there is no internal timer.
 */
export function createDayNightPage(options: DayNightPageOptions): DayNightPage {
  const doc = options.document
  const greeting: NightGreeting = createNightGreeting()
  const isHidden = options.isHidden ?? (() => defaultHidden(doc))

  const apply = (state: DayNightState): void => {
    try {
      const body = doc.body as HTMLElement | null
      if (body) {
        body.dataset.time = state.timeOfDay
        body.dataset.quiet = state.quiet ? '1' : '0'
      }
      const pet = doc.getElementById('pet')
      if (pet) pet.classList.toggle('sleepy', state.sleepy)
    } catch {
      /* detached/partial document: the state still resolves for the caller */
    }
    let mood: { readonly happy: boolean; readonly muted: boolean } = { happy: false, muted: false }
    try {
      mood = options.getMood?.() ?? mood
    } catch {
      mood = { happy: false, muted: false }
    }
    try {
      options.syncHero?.({ happy: mood.happy, sleepy: state.sleepy, muted: mood.muted, night: state.night })
    } catch {
      /* hero mirror is best-effort: boot/fallback paths must not break the poll */
    }
  }

  const clock = createDayNightClock({
    now: options.now,
    isQuiet: options.isQuiet,
    isHidden,
    onState: (next, previous) => {
      greeting.onDayNightChange(next, previous)
      apply(next)
    },
  })

  const noteUserInteraction = (): void => {
    const line = greeting.take()
    if (line === null) return
    try {
      options.say?.(line)
    } catch {
      /* copy is display-only; a failed bubble must not break the interaction */
    }
  }

  if (options.listenForInteractions !== false) {
    try {
      doc.addEventListener('pointerdown', noteUserInteraction)
      doc.addEventListener('keydown', noteUserInteraction)
    } catch {
      /* minimal/test documents may not support listeners */
    }
  }

  return {
    sync: () => clock.sync(),
    apply: () => apply(clock.state()),
    state: () => clock.state(),
    armNightGreetingIfNight: () => {
      const state = clock.sync()
      if (!state.night) return null
      if (state.quiet) {
        // Quiet (the default): never a proactive bubble; arm the one-shot line
        // for the first user-triggered interaction instead.
        greeting.arm()
        return null
      }
      // Quiet hours explicitly OFF: keep the old ambient greeting (allowed).
      greeting.disarm()
      return NIGHT_GREETING_LINE
    },
    noteUserInteraction,
    bootFallbackLine: () => {
      const state = clock.sync()
      if (state.night) return NIGHT_GREETING_LINE
      return state.timeOfDay === 'morning' ? '早。今天书页很轻。' : '你忙你的。'
    },
    dispose: () => {
      try {
        doc.removeEventListener('pointerdown', noteUserInteraction)
        doc.removeEventListener('keydown', noteUserInteraction)
      } catch {
        /* ignore */
      }
    },
  }
}
