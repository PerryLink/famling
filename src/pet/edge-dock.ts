/**
 * Edge habitation geometry (P1 2026-11-21): the pure, physical-pixel window math
 * behind 「边缘栖居」.
 *
 * A desktop pet dragged to a screen edge should STAY at that edge instead of
 * being pulled back inside the monitor. The 480x336 pet window is transparent and
 * much wider than the character art, so "the pet touches the edge" means the
 * window has to overhang the monitor WORK AREA by its transparent margin. That is
 * exactly what the Rust survival guard tolerates for a reachable window
 * (`desktop_guard.rs`): the window may hang over an edge as long as at least
 * MIN_VISIBLE_WIDTH x MIN_VISIBLE_HEIGHT is still on the monitor. This module
 * keeps every decision here pure (numbers in, numbers out, no DOM/Tauri) so Node
 * tests can cover the multi-monitor / taskbar / negative-origin cases.
 *
 * Two more contracts live here:
 *  * `planWindowSettle` — the 2-3 frame INTEGER-pixel settle after a drag release
 *    (no spring/physics; monotone, no overshoot, last step is the dock target);
 *  * `resolveRestorePosition` — the boot-time saved-position validation, using the
 *    same reachability floor as the Rust guard instead of the old hard-coded
 *    margins, so a docked position survives save/restore.
 *
 * Units are PHYSICAL pixels throughout: Tauri reports monitor positions/work
 * areas and window positions in physical pixels, and mixing logical px here would
 * reintroduce DPI-dependent clamping bugs (same reason as desktop_guard.rs).
 */

/** A point in physical screen pixels (or window-local pixels for `petRect`). */
export interface PixelPoint {
  readonly x: number
  readonly y: number
}

export interface PixelSize {
  readonly width: number
  readonly height: number
}

/** An axis-aligned physical-pixel rectangle. */
export interface PixelRect extends PixelPoint, PixelSize {}

/**
 * Reachability floor mirrored from `desktop_guard.rs` (MIN_VISIBLE_WIDTH/HEIGHT).
 * The Rust guard only pulls a window back when less than this much of it remains
 * on the current monitor; docking must stay under the same floor or the guard
 * would fight the dock on its next tick. `tests/edge-dock.test.ts` pins these to
 * the Rust constants so the two sides cannot drift silently.
 */
export const MIN_VISIBLE_WIDTH = 96
export const MIN_VISIBLE_HEIGHT = 72

/**
 * How close (in LOGICAL pixels) the visible pet must be to a work-area edge for
 * a drop to count as "dock here". Callers scale this by the window DPR before
 * handing it to `resolveEdgeDock` (which works in physical pixels).
 */
export const EDGE_DOCK_THRESHOLD_LOGICAL_PX = 24

/** Integer-pixel settle after the drop: at least 2 and at most 3 window moves. */
export const SETTLE_MIN_FRAMES = 2
export const SETTLE_MAX_FRAMES = 3

/** A work-area edge the pet is docked against (both axes can dock → corner). */
export type DockEdge = 'left' | 'right' | 'top' | 'bottom'

export interface EdgeDockInput {
  /** Window outer position (physical px, screen coordinates). */
  readonly position: PixelPoint
  /** Window outer size (physical px; borderless pet window: inner == outer). */
  readonly size: PixelSize
  /** Current monitor WORK area (physical px, taskbar-aware). */
  readonly workArea: PixelRect
  /** Visible pet rect relative to the window content origin (physical px). */
  readonly petRect: PixelRect
  /** Distance (physical px) within which a pet edge counts as at the edge. */
  readonly threshold: number
}

export interface EdgeDock {
  /** Window outer position that puts the visible pet flush on the edge(s). */
  readonly x: number
  readonly y: number
  /** Axes that docked, e.g. ['right'] or ['left', 'bottom']. */
  readonly edges: readonly DockEdge[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFinitePoint(point: PixelPoint | null | undefined): point is PixelPoint {
  return point !== null && point !== undefined && isFiniteNumber(point.x) && isFiniteNumber(point.y)
}

function isUsableSize(size: PixelSize | null | undefined): size is PixelSize {
  return size !== null && size !== undefined && isFiniteNumber(size.width) && isFiniteNumber(size.height) && size.width > 0 && size.height > 0
}

function isUsableRect(rect: PixelRect | null | undefined): rect is PixelRect {
  return isFinitePoint(rect) && isUsableSize(rect)
}

/** Width/height of the intersection of two rectangles (0 when disjoint). */
export function intersectionExtent(a: PixelRect, b: PixelRect): PixelSize {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return { width, height }
}

/**
 * Resolve the window position that docks the visible pet against one or both
 * work-area edges, or `null` when the drop is not near an edge.
 *
 * Rules:
 *  * each axis is independent (a bottom-right drop can dock a corner);
 *  * only the CURRENT monitor work area is considered (multi-screen contract);
 *  * a pet already hanging past the edge is pulled back flush instead of being
 *    left half off-screen;
 *  * the resulting window overhang is capped so the window stays reachable for
 *    desktop_guard.rs (a bigger overhang would be clamped back by the Rust
 *    guard, which is exactly the "bounced away from the edge" bug this avoids);
 *  * the function is idempotent: calling it on an already docked window returns
 *    the same position with the same edges.
 */
export function resolveEdgeDock(input: EdgeDockInput): EdgeDock | null {
  const { position, size, workArea, petRect } = input
  if (!isFinitePoint(position) || !isUsableSize(size) || !isUsableRect(workArea) || !isUsableRect(petRect)) {
    return null
  }
  const threshold = isFiniteNumber(input.threshold) ? Math.max(0, input.threshold) : 0
  const horizontal = dockAxis({
    start: position.x,
    windowLength: size.width,
    petStart: petRect.x,
    petLength: petRect.width,
    workStart: workArea.x,
    workLength: workArea.width,
    threshold,
    minVisible: MIN_VISIBLE_WIDTH,
  })
  const vertical = dockAxis({
    start: position.y,
    windowLength: size.height,
    petStart: petRect.y,
    petLength: petRect.height,
    workStart: workArea.y,
    workLength: workArea.height,
    threshold,
    minVisible: MIN_VISIBLE_HEIGHT,
  })
  if (horizontal.edge === null && vertical.edge === null) return null
  const edges: DockEdge[] = []
  if (horizontal.edge === 'start') edges.push('left')
  else if (horizontal.edge === 'end') edges.push('right')
  if (vertical.edge === 'start') edges.push('top')
  else if (vertical.edge === 'end') edges.push('bottom')
  return { x: horizontal.position, y: vertical.position, edges }
}

interface AxisDockInput {
  readonly start: number
  readonly windowLength: number
  readonly petStart: number
  readonly petLength: number
  readonly workStart: number
  readonly workLength: number
  readonly threshold: number
  readonly minVisible: number
}

interface AxisDock {
  readonly position: number
  readonly edge: 'start' | 'end' | null
}

function dockAxis(input: AxisDockInput): AxisDock {
  const petStart = input.start + input.petStart
  const petEnd = petStart + input.petLength
  const workEnd = input.workStart + input.workLength
  // Signed distance from the pet edge to the work edge; 0 = already flush and a
  // negative value means the pet hangs past the edge (still a dock candidate).
  const startDistance = petStart - input.workStart
  const endDistance = workEnd - petEnd
  const startInRange = startDistance <= input.threshold
  const endInRange = endDistance <= input.threshold
  let edge: 'start' | 'end' | null = null
  if (startInRange && endInRange) edge = Math.abs(startDistance) <= Math.abs(endDistance) ? 'start' : 'end'
  else if (startInRange) edge = 'start'
  else if (endInRange) edge = 'end'
  if (edge === null) return { position: input.start, edge: null }
  const flush = edge === 'start'
    ? input.workStart - input.petStart
    : workEnd - input.petStart - input.petLength
  // Keep the window reachable for desktop_guard.rs: at most (window - minVisible)
  // of transparent overhang on either side. Cap only pathological art sizes; the
  // normal centered 96-256px character needs far less than the cap.
  const maxOverhang = Math.max(0, input.windowLength - input.minVisible)
  const minPosition = input.workStart - maxOverhang
  const maxPosition = workEnd - input.windowLength + maxOverhang
  const position = minPosition > maxPosition
    ? input.workStart
    : Math.min(maxPosition, Math.max(minPosition, flush))
  return { position: Math.round(position), edge }
}

function settleProgress(step: number, frames: number): number {
  if (frames <= 1) return 1
  // Ease-out only: most of the distance in the first frame, then the remainder.
  // Never > 1, so the settle cannot overshoot the dock target (no spring).
  return frames === 2 ? [0.65, 1][step - 1] ?? 1 : [0.55, 0.85, 1][step - 1] ?? 1
}

/** Maximum per-axis travel of a settle → 2 frames for a tiny nudge, else 3. */
export function resolveSettleFrameCount(from: PixelPoint, to: PixelPoint, maxFrames: number = SETTLE_MAX_FRAMES): number {
  if (!isFinitePoint(from) || !isFinitePoint(to)) return SETTLE_MIN_FRAMES
  const travel = Math.max(Math.abs(Math.round(to.x) - Math.round(from.x)), Math.abs(Math.round(to.y) - Math.round(from.y)))
  if (travel <= 2) return Math.min(SETTLE_MIN_FRAMES, Math.max(1, Math.round(maxFrames)))
  return Math.min(SETTLE_MAX_FRAMES, Math.max(1, Math.round(maxFrames)))
}

export interface WindowSettlePlan {
  readonly from: PixelPoint
  readonly to: PixelPoint
  readonly frames: number
  /** Integer window positions to apply in order; empty when already there. */
  readonly steps: readonly PixelPoint[]
}

/**
 * Plan the post-drop settle as a short integer-pixel path.
 *
 * `steps` excludes the current position, is monotone per axis, never overshoots
 * and its last entry is exactly `to` when the window has to move at all. A 1px
 * nudge collapses to one real move (duplicate frames are removed) — the 2-3 frame
 * budget is the maximum, not a forced animation.
 */
export function planWindowSettle(from: PixelPoint, to: PixelPoint, frames: number = SETTLE_MAX_FRAMES): WindowSettlePlan {
  const start = { x: Math.round(isFiniteNumber(from?.x) ? from.x : 0), y: Math.round(isFiniteNumber(from?.y) ? from.y : 0) }
  const target = { x: Math.round(isFiniteNumber(to?.x) ? to.x : start.x), y: Math.round(isFiniteNumber(to?.y) ? to.y : start.y) }
  const count = Math.min(SETTLE_MAX_FRAMES, Math.max(1, Math.round(isFiniteNumber(frames) ? frames : SETTLE_MAX_FRAMES)))
  const dx = target.x - start.x
  const dy = target.y - start.y
  if (dx === 0 && dy === 0) return { from: start, to: target, frames: 0, steps: [] }
  const steps: PixelPoint[] = []
  for (let step = 1; step <= count; step += 1) {
    const progress = settleProgress(step, count)
    const point = {
      x: step === count ? target.x : start.x + Math.round(dx * progress),
      y: step === count ? target.y : start.y + Math.round(dy * progress),
    }
    const previous = steps[steps.length - 1] ?? start
    // Monotone + no overshoot: clamp the interpolated value between the previous
    // applied position and the target on each axis.
    point.x = clampBetween(point.x, previous.x, target.x)
    point.y = clampBetween(point.y, previous.y, target.y)
    if (point.x === previous.x && point.y === previous.y) continue
    steps.push(point)
  }
  const last = steps[steps.length - 1]
  if (!last || last.x !== target.x || last.y !== target.y) steps.push(target)
  return { from: start, to: target, frames: steps.length, steps }
}

function clampBetween(value: number, from: number, to: number): number {
  return to >= from ? Math.min(to, Math.max(from, value)) : Math.min(from, Math.max(to, value))
}

/** Minimal monitor shape reported by Tauri (`currentMonitor`/`availableMonitors`). */
export interface MonitorGeometry {
  readonly position?: PixelPoint
  readonly size?: PixelSize
  readonly workArea?: {
    readonly position?: PixelPoint
    readonly size?: PixelSize
  }
}

/**
 * Work-area rectangle of one monitor, with a full-monitor fallback for Tauri
 * builds (and test fakes) that do not expose `workArea`.
 */
export function monitorWorkAreaRect(monitor: MonitorGeometry | null | undefined): PixelRect | null {
  if (!monitor) return null
  const position = monitor.workArea?.position ?? monitor.position
  const size = monitor.workArea?.size ?? monitor.size
  if (!isFinitePoint(position) || !isUsableSize(size)) return null
  return { x: position.x, y: position.y, width: size.width, height: size.height }
}

/** Restored position plus the work area it was validated against. */
export interface RestoreMatch {
  readonly position: PixelPoint
  readonly workArea: PixelRect
}

/**
 * Saved-position validation for boot restore (plus the work area it matched).
 *
 * Replaces the old hard-coded margins (40px top/right, 200px left, measured
 * against the FULL monitor) which silently rejected a pet docked at the top edge
 * and did not know about the taskbar. A saved position is restorable when the
 * window is as reachable as `desktop_guard.rs` requires (>= MIN_VISIBLE_WIDTH x
 * MIN_VISIBLE_HEIGHT on the best matching work area), which is exactly the
 * condition under which the guard will not clamp it back. The returned work area
 * lets the caller derive the dock insets for the bubble layout.
 */
export function resolveRestoreMatch(
  saved: PixelPoint,
  size: PixelSize,
  monitors: readonly PixelRect[],
): RestoreMatch | null {
  if (!isFinitePoint(saved) || !isUsableSize(size)) return null
  const window = { x: Math.round(saved.x), y: Math.round(saved.y), width: size.width, height: size.height }
  let bestExtent: PixelSize | null = null
  let bestWorkArea: PixelRect | null = null
  for (const workArea of monitors) {
    if (!isUsableRect(workArea)) continue
    const extent = intersectionExtent(window, workArea)
    if (bestExtent === null || extent.width * extent.height > bestExtent.width * bestExtent.height) {
      bestExtent = extent
      bestWorkArea = workArea
    }
  }
  if (bestExtent === null || bestWorkArea === null) return null
  if (bestExtent.width < Math.min(MIN_VISIBLE_WIDTH, size.width)) return null
  if (bestExtent.height < Math.min(MIN_VISIBLE_HEIGHT, size.height)) return null
  return { position: { x: window.x, y: window.y }, workArea: bestWorkArea }
}

export function resolveRestorePosition(
  saved: PixelPoint,
  size: PixelSize,
  monitors: readonly PixelRect[],
): PixelPoint | null {
  const match = resolveRestoreMatch(saved, size, monitors)
  return match === null ? null : match.position
}
