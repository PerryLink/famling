/**
 * Hero desktop-shell actions (dog/golden-retriever v7 integration, 2026-11-18).
 *
 * The desktop-shell menu offers three hero-only actions when the canvas
 * renderer is actually running: pat (`摸头（hero）`), throw a ball
 * (`抛球`) and chase it (`追球`). This module is the pure, DOM-free plan the
 * host executes against `HeroRuntime.emit()`; it exists so the menu wiring can
 * be unit-tested without a browser or a canvas.
 *
 * Event names are the FCI/host event vocabulary, not animation tags: the dog
 * `behavior.json` maps them to v7 tags (`pat` -> `pat_head`, `ball_throw` ->
 * `ball_throw`, `ball_chase` -> `ball_chase`). Keep this list in sync with
 * `desktop-shell.ts` (`HERO_MENU_ACTIONS`) and the dog behavior profile.
 */

/** Hero-only actions exposed by the desktop-shell menu. */
export const HERO_MENU_ACTION_IDS = ['pat', 'ball_throw', 'ball_chase'] as const
export type HeroMenuAction = (typeof HERO_MENU_ACTION_IDS)[number]

/** One delayed emit step: `delayMs` 0 runs synchronously in the host. */
export interface HeroActionStep {
  /** FCI event name (not a pack tag). */
  readonly event: string
  /** Delay from the menu activation in milliseconds (0 = immediately). */
  readonly delayMs: number
}

/**
 * A thrown ball is one menu action but reads best as "pick up / throw" and then
 * "run after it". The throw clip is 500ms (5 frames @ 10fps), so the chase cue
 * follows at exactly that boundary; the user can also tap 追球 explicitly.
 */
export const BALL_CHASE_FOLLOW_UP_MS = 500

/** Deterministic emit plan for one hero menu action. */
export function heroActionPlan(action: HeroMenuAction): readonly HeroActionStep[] {
  switch (action) {
    case 'pat':
      return [{ event: 'pat', delayMs: 0 }]
    case 'ball_throw':
      return [
        { event: 'ball_throw', delayMs: 0 },
        { event: 'ball_chase', delayMs: BALL_CHASE_FOLLOW_UP_MS },
      ]
    case 'ball_chase':
      return [{ event: 'ball_chase', delayMs: 0 }]
  }
}

/** True only for the three declared menu action ids (query/QA parsing guard). */
export function isHeroMenuAction(value: unknown): value is HeroMenuAction {
  return typeof value === 'string' && (HERO_MENU_ACTION_IDS as readonly string[]).includes(value)
}
