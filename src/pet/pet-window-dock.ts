/**
 * Pet-window edge habitation wiring (P1 2026-11-21).
 *
 * After a native window drag (Tauri `startDragging()` — the WebView is blocked by
 * the OS move loop until the user releases the window, the same timing the
 * existing drag.start/drag.end/land semantics rely on), the pet can be left a few
 * pixels from a work-area edge, or straddling it. This module measures the
 * VISIBLE pet (hero canvas / folded paper), asks the pure `edge-dock.ts` geometry
 * for a dock target and moves the window there in 2-3 INTEGER physical-pixel
 * frames (no spring/physics; it never reads other windows' titles or content).
 *
 * The reduce-motion setting collapses the settle to one direct move. Everything
 * is error-contained: a missing Tauri window, a monitor-less WebView or a
 * rejected `setPosition` only skips the dock, never throws into the drag path.
 *
 * No listeners are installed here (the caller already owns the drag path) and the
 * frame chain terminates itself; `isCancelled` lets the caller stop a settle when
 * a new drag starts while it is still animating.
 */

import {
  EDGE_DOCK_THRESHOLD_LOGICAL_PX,
  monitorWorkAreaRect,
  planWindowSettle,
  resolveEdgeDock,
  resolveSettleFrameCount,
  type DockEdge,
  type PixelPoint,
  type PixelRect,
  type PixelSize,
} from './edge-dock.ts'
import { PET_DOCK_INSET_VARS } from './shell-layout.ts'
import { safeSetItem, type StorageLike, type StorageWriteStatus } from './security/safe-storage.ts'

/** Storage key of the persisted pet-window position (shared with restore). */
export const PET_WINDOW_POSITION_KEY = 'desktop-games/pet/window'

/** QA dataset attributes written for the Windows CDP verification runs. */
export const PET_DOCK_DATASET_KEY = 'petDock'

/**
 * Renderer elements that can make the character visible, in priority order
 * (hero canvas while the hero scene draws, then the folded-paper DOM). Measured
 * via getElementById/querySelector instead of one selector string so the fake
 * DOM used by Node tests can serve them too.
 */
export const PET_VISIBLE_TARGETS = [
  { id: 'hero-canvas' },
  { className: 'fold-pet' },
  { id: 'pet' },
] as const

/** The subset of `@tauri-apps/api/window` this module needs. */
export interface PetWindowTauriMonitor {
  readonly position?: PixelPoint
  readonly size?: PixelSize
  readonly workArea?: {
    readonly position?: PixelPoint
    readonly size?: PixelSize
  }
  readonly scaleFactor?: number
}

export interface PetWindowTauri {
  getCurrentWindow(): {
    outerPosition(): Promise<PixelPoint>
    setPosition(position: unknown): Promise<void>
    /** Outer window size; absent on older builds/fakes (inner == outer here). */
    outerSize?(): Promise<PixelSize>
  }
  PhysicalPosition: new (x: number, y: number) => unknown
  currentMonitor(): Promise<PetWindowTauriMonitor | null>
}

export interface PetWindowDockDeps {
  readonly document: Document
  readonly window: Window
  /** Test seam; production dynamically imports `@tauri-apps/api/window`. */
  readonly loadTauriWindow?: () => Promise<PetWindowTauri>
  /** Checked before every settle frame; true stops the animation (new drag). */
  readonly isCancelled?: () => boolean
  /** Test seam; production uses `window.requestAnimationFrame`. */
  readonly scheduleFrame?: (callback: () => void) => unknown
  /** Called once with the final position + docked edges; default persists both. */
  readonly onSettled?: (position: PixelPoint, edges: readonly DockEdge[]) => void
  /** Storage override for the default persistence (tests). */
  readonly storage?: StorageLike | null
  /** Force the number of settle frames (tests); default 2-3 / 1 on reduce motion. */
  readonly settleFrames?: number
}

export interface PetWindowDockOutcome {
  readonly from: PixelPoint
  readonly to: PixelPoint
  /** Edges the pet docked against; empty when the drop was not near an edge. */
  readonly edges: readonly DockEdge[]
  /** Window moves actually applied (0 = already at the target). */
  readonly frames: number
  /** True when a new drag cancelled the settle before it finished. */
  readonly cancelled: boolean
  /** True when the final position reached the default storage. */
  readonly persisted: boolean
}

interface PendingFrame {
  readonly schedule: (callback: () => void) => unknown
}

function defaultLoadTauriWindow(): Promise<PetWindowTauri> {
  return import('@tauri-apps/api/window') as unknown as Promise<PetWindowTauri>
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Default frame scheduler: rAF when available, a 16ms timer for test fakes. */
function frameScheduler(
  windowLike: Window,
  scheduleFrame?: (callback: () => void) => unknown,
): PendingFrame {
  const raf = (windowLike as unknown as { requestAnimationFrame?: (callback: () => void) => number }).requestAnimationFrame
  if (scheduleFrame !== undefined) return { schedule: (callback) => scheduleFrame(callback) }
  if (typeof raf === 'function') return { schedule: (callback) => raf(callback) }
  return { schedule: (callback) => setTimeout(callback, 16) }
}

function nextFrame(scheduler: PendingFrame): Promise<void> {
  return new Promise<void>((resolve) => {
    scheduler.schedule(() => resolve())
  })
}

function reduceMotionOn(documentRef: Document): boolean {
  try {
    return documentRef.documentElement?.dataset.reduceMotion === '1'
  } catch {
    return false
  }
}

/**
 * First visible character element (hero canvas > folded paper > #pet).
 * `visibility:hidden` boxes are skipped when computed styles are available (the
 * hero mode keeps the folded-paper #pet laid out but invisible); test fakes have
 * no computed-style engine and rely on the selector order instead.
 */
export function measureVisiblePetRect(documentRef: Document): DOMRect | null {
  for (const target of PET_VISIBLE_TARGETS) {
    let element: Element | null = null
    try {
      element =
        'id' in target
          ? documentRef.getElementById(target.id)
          : documentRef.querySelector<HTMLElement>('.' + target.className)
    } catch {
      element = null
    }
    if (!element || typeof element.getBoundingClientRect !== 'function') continue
    let rect: DOMRect
    try {
      rect = element.getBoundingClientRect()
    } catch {
      continue
    }
    if (!rect || !(finiteNumber(rect.width, 0) >= 8) || !(finiteNumber(rect.height, 0) >= 8)) continue
    try {
      if (typeof getComputedStyle === 'function') {
        const style = getComputedStyle(element)
        if (style.visibility === 'hidden' || style.display === 'none') continue
      }
    } catch {
      /* computed styles are optional: keep the selector-order fallback */
    }
    return rect
  }
  return null
}

/** Physical-pixel off-screen amounts of a docked window, one value per side. */
export interface PetDockInsets {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/**
 * How much of the window hangs off the current work area after docking. Physical
 * pixels; used to publish the CSS inset variables shell-layout.ts subtracts.
 */
export function resolvePetDockInsets(position: PixelPoint, size: PixelSize, workArea: PixelRect): PetDockInsets {
  return {
    left: Math.max(0, Math.round(workArea.x - position.x)),
    right: Math.max(0, Math.round(position.x + size.width - (workArea.x + workArea.width))),
    top: Math.max(0, Math.round(workArea.y - position.y)),
    bottom: Math.max(0, Math.round(position.y + size.height - (workArea.y + workArea.height))),
  }
}

/**
 * Publish the dock insets to the page as CSS variables (physical → CSS px). The
 * shell layout uses them to keep the bubble and ⋯ trigger inside the VISIBLE
 * work area instead of the transparent window; 0 everywhere = undocked.
 */
export function writePetDockInsets(documentRef: Document, insets: PetDockInsets, scaleFactor: number): void {
  const scale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1
  const css = (physical: number): string => Math.round(physical / scale) + 'px'
  try {
    const style = documentRef.documentElement?.style
    if (!style || typeof style.setProperty !== 'function') return
    style.setProperty(PET_DOCK_INSET_VARS.left, css(insets.left))
    style.setProperty(PET_DOCK_INSET_VARS.right, css(insets.right))
    style.setProperty(PET_DOCK_INSET_VARS.top, css(insets.top))
    style.setProperty(PET_DOCK_INSET_VARS.bottom, css(insets.bottom))
  } catch {
    /* the CSS inset variables are best effort: the dock position still applies */
  }
}

function writeDockDataset(documentRef: Document, edges: readonly DockEdge[]): void {
  try {
    const root = documentRef.documentElement
    if (!root) return
    if (edges.length > 0) root.dataset[PET_DOCK_DATASET_KEY] = edges.join(',')
    else delete root.dataset[PET_DOCK_DATASET_KEY]
  } catch {
    /* QA attributes are best effort (same policy as data-hero-dpr) */
  }
}

/**
 * Persist the pet-window position together with the dock claim.
 *
 * The `dock` field is additive/optional (older readers ignore it): a restored
 * dock lets boot keep the pet flush AND keeps hero locomotion from walking into
 * the transparent overhang on that side. Unknown/untrusted values are dropped on
 * read by hero-page.ts.
 */
export function persistPetWindowPosition(
  position: PixelPoint,
  edges: readonly DockEdge[] = [],
  storage?: StorageLike | null,
): StorageWriteStatus {
  const payload: { x: number; y: number; dock?: DockEdge[] } = { x: position.x, y: position.y }
  if (edges.length > 0) payload.dock = [...edges]
  return safeSetItem(PET_WINDOW_POSITION_KEY, JSON.stringify(payload), storage)
}

/**
 * Dock + settle the pet window after one native drag ended.
 *
 * Returns the applied outcome, or `null` when the page has no measurable pet, no
 * Tauri window or no monitor to dock against. Never throws.
 */
export async function settlePetWindowAfterDrag(deps: PetWindowDockDeps): Promise<PetWindowDockOutcome | null> {
  const documentRef = deps.document
  const windowLike = deps.window
  const rect = measureVisiblePetRect(documentRef)
  if (!rect) return null
  let tauri: PetWindowTauri
  try {
    tauri = await (deps.loadTauriWindow ?? defaultLoadTauriWindow)()
  } catch {
    return null
  }
  const nativeWindow = tauri.getCurrentWindow()
  let position: PixelPoint
  let monitor: PetWindowTauriMonitor | null
  try {
    ;[position, monitor] = await Promise.all([nativeWindow.outerPosition(), tauri.currentMonitor()])
  } catch {
    return null
  }
  const workArea = monitorWorkAreaRect(monitor)
  if (!workArea || !monitor) return null
  const scaleFactor = ((): number => {
    const monitorScale = finiteNumber(monitor.scaleFactor, 0)
    if (monitorScale > 0) return monitorScale
    const pageDpr = finiteNumber((windowLike as unknown as { devicePixelRatio?: unknown }).devicePixelRatio, 0)
    return pageDpr > 0 ? pageDpr : 1
  })()
  let outerSize: PixelSize | null = null
  if (typeof nativeWindow.outerSize === 'function') {
    try {
      outerSize = await nativeWindow.outerSize()
    } catch {
      outerSize = null
    }
  }
  const size = outerSize ?? {
    width: Math.round(finiteNumber(windowLike.innerWidth, 480) * scaleFactor),
    height: Math.round(finiteNumber(windowLike.innerHeight, 336) * scaleFactor),
  }
  if (!(size.width > 0) || !(size.height > 0)) return null
  const petRect: PixelRect = {
    x: Math.round(finiteNumber(rect.left, 0) * scaleFactor),
    y: Math.round(finiteNumber(rect.top, 0) * scaleFactor),
    width: Math.max(1, Math.round(finiteNumber(rect.width, 0) * scaleFactor)),
    height: Math.max(1, Math.round(finiteNumber(rect.height, 0) * scaleFactor)),
  }
  const from: PixelPoint = { x: Math.round(position.x), y: Math.round(position.y) }
  const dock = resolveEdgeDock({
    position: from,
    size,
    workArea,
    petRect,
    threshold: EDGE_DOCK_THRESHOLD_LOGICAL_PX * scaleFactor,
  })
  const to: PixelPoint = dock === null ? from : { x: dock.x, y: dock.y }
  const edges: readonly DockEdge[] = dock?.edges ?? []
  const insets = dock === null ? { left: 0, right: 0, top: 0, bottom: 0 } : resolvePetDockInsets(to, size, workArea)
  // Publish before the animation so the bubble/trigger re-anchor on the first
  // docked frame (shell-layout observes the documentElement style attribute).
  writePetDockInsets(documentRef, insets, scaleFactor)
  const moved = to.x !== from.x || to.y !== from.y
  let frames = 0
  let cancelled = false
  if (moved) {
    const requested = deps.settleFrames ?? (reduceMotionOn(documentRef) ? 1 : resolveSettleFrameCount(from, to))
    const plan = planWindowSettle(from, to, requested)
    if (plan.steps.length > 0) {
      const scheduler = frameScheduler(windowLike, deps.scheduleFrame)
      for (const step of plan.steps) {
        await nextFrame(scheduler)
        if (deps.isCancelled?.() === true) {
          cancelled = true
          break
        }
        try {
          await nativeWindow.setPosition(new tauri.PhysicalPosition(step.x, step.y))
        } catch {
          // A destroyed/moved-away window must not be persisted at an unapplied
          // position: stop and report what actually happened.
          return { from, to, edges, frames, cancelled, persisted: false }
        }
        frames += 1
      }
    }
  }
  if (cancelled) {
    return { from, to, edges, frames, cancelled, persisted: false }
  }
  // QA truth only after the window really reached the dock target (the CDP
  // Windows runs read data-pet-dock instead of screenshotting the desktop).
  writeDockDataset(documentRef, edges)
  let persisted = false
  try {
    if (deps.onSettled !== undefined) deps.onSettled(to, edges)
    else persisted = persistPetWindowPosition(to, edges, deps.storage) === 'ok'
  } catch {
    persisted = false
  }
  return { from, to, edges, frames, cancelled, persisted }
}
