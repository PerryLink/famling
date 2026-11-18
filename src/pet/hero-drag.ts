/**
 * Window-drag decision for the hero canvas.
 *
 * The folded-paper pet already moves the Tauri window from its DOM pointer
 * handler. Hero characters render into a canvas, so they need the same native
 * window move; otherwise switching the renderer makes the pet look frozen when
 * dragged (the old canvas path only translated the sprite locally and snapped
 * back). Keep the threshold as a pure, testable rule: a press below it remains
 * a tap/pat, a longer move becomes a window drag only inside Tauri.
 */
export const HERO_WINDOW_DRAG_THRESHOLD_PX = 6

export function shouldStartWindowDrag(hasTauri: boolean, distancePx: number): boolean {
  return hasTauri && Number.isFinite(distancePx) && distancePx >= HERO_WINDOW_DRAG_THRESHOLD_PX
}
