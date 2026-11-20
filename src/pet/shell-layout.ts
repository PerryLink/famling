/**
 * Keeps the desktop-shell speech bubble and the ⋯ menu trigger attached to the
 * pet instead of the far corners of the transparent 480x336 window.
 *
 * The shell is otherwise pure CSS (bubble pinned top-left, trigger pinned
 * bottom-right), which reads as "floating away from the pet" once the window is
 * transparent and the pet sits at the bottom centre. This module measures the
 * visible pet element and writes inline positions: the bubble sits centred
 * above the pet, and the trigger hugs the pet lower-right corner so its menu
 * opens next to the pet too (desktop-shell.ts anchors the menu to the trigger).
 * No-ops outside the desktop shell (?shell=window keeps the full-page layout).
 *
 * MB-050 (fixed 2026-11-20): the bubble is a zoomed component. Its layout box
 * is measured in CSS layout px; what must stay inside the 480x336 window is the
 * *visual* box (layout size x composed component zoom). At 整体缩放 200% the
 * composed bubble zoom is 1.75 on top of an absolute UI scale of 3.5, so a
 * normal sentence used to become ~1475 CSS px tall and was anchored above the
 * window top edge (rect top = -1475, bottom = 0). The anchor therefore:
 *  1. fit-clamps the component zoom so the scaled box fits the window minus a
 *     small margin (the same policy fitScaleToViewport applies to the character
 *     image), and
 *  2. positions that scaled box clamped inside the viewport: it still sits
 *     centred above the pet when there is room, otherwise it is pushed down to
 *     the top margin (possibly overlapping the pet) instead of leaving the
 *     window; horizontal clamping uses the scaled width, not the layout width.
 *
 * The component zoom is applied ONCE, by the anchor transform (pet.css keeps
 * the font at the fixed panel base). The bubble layout box is pinned at
 * left: 0 so its shrink-to-fit width does not depend on its own anchor; the
 * transform carries the visual centre, which keeps the measured wrap identical
 * to the wrap the user sees.
 *
 * 边缘栖居 (P1 2026-11-21): a docked pet window overhangs the monitor work area
 * by its transparent margin (the visible pet is flush with the screen edge).
 * The bubble/trigger must stay inside the VISIBLE work area, not just inside the
 * window, so pet-window-dock.ts publishes the per-side off-screen amounts as
 * CSS variables (--pet-dock-inset-*) and every clamp below subtracts them. With
 * no dock the variables are 0 and the shipped 480x336 behaviour is unchanged.
 */

import { fitScaleToViewport } from './scaling.ts'

const BUBBLE_GAP = 8
/** Minimum distance between the scaled bubble box and every window edge. */
export const BUBBLE_VIEWPORT_MARGIN = 4
const TRIGGER_SIZE = 24
const TRIGGER_GAP = 6

/**
 * Physical work-area docking insets published by pet-window-dock.ts as CSS px:
 * how much of each window side hangs off the current monitor work area because
 * the visible pet is docked flush against a screen edge.
 */
export interface BubbleDockInsets {
  readonly left?: number
  readonly right?: number
  readonly top?: number
  readonly bottom?: number
}

export interface ResolvedBubbleDockInsets {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/** CSS custom properties pet-window-dock.ts writes after a dock. */
export const PET_DOCK_INSET_VARS = {
  left: '--pet-dock-inset-left',
  right: '--pet-dock-inset-right',
  top: '--pet-dock-inset-top',
  bottom: '--pet-dock-inset-bottom',
} as const

/** Max dock inset honoured (a window can overhang by at most half a side). */
const MAX_DOCK_INSET = 480

/** Normalize the optional dock insets (missing/NaN/negative → 0). */
export function resolveBubbleDockInsets(insets?: BubbleDockInsets | null): ResolvedBubbleDockInsets {
  const read = (value: number | undefined): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0
    return Math.min(MAX_DOCK_INSET, Math.max(0, value))
  }
  return { left: read(insets?.left), right: read(insets?.right), top: read(insets?.top), bottom: read(insets?.bottom) }
}

/** CSS layout box of the bubble at component zoom 1 (offsetWidth/offsetHeight). */
export interface BubbleLayoutBox {
  readonly width: number
  readonly height: number
}

export interface BubblePlacementInput {
  /** Visual centre the bubble wants to be centred on (the pet centre). */
  readonly petCentreX: number
  /** Top edge of the visible pet; the bubble's bottom edge sits above it. */
  readonly petTop: number
  /** Bubble layout size in CSS px, before the component transform. */
  readonly layout: BubbleLayoutBox
  /** Desired component zoom (--bubble-zoom resolved by desktop-shell.ts). */
  readonly zoom: number
  readonly viewport: { readonly width: number; readonly height: number }
  /** Gap between the pet top and the bubble bottom edge (default 8px). */
  readonly gap?: number
  /** Space kept between the scaled bubble and the window edges. */
  readonly margin?: number
  /**
   * Off-screen amounts of the docked window (CSS px). The bubble is clamped
   * inside the VISIBLE work area, not the transparent window, so a pet docked
   * at a screen edge still shows its whole bubble. Default 0 = undocked.
   */
  readonly insets?: BubbleDockInsets
}

export interface BubblePlacement {
  /** Component zoom to apply (<= the desired zoom, fitted to the viewport). */
  readonly zoom: number
  /** Scaled visual size in CSS px (layout x fitted zoom). */
  readonly width: number
  readonly height: number
  /**
   * Visual centre in CSS px from the window's left edge. The bubble layout box
   * is pinned at `left: 0` (so its shrink-to-fit width never depends on the
   * anchor) and the transform carries this centre instead.
   */
  readonly centreX: number
  /** Inline `bottom` in CSS px: the visual bottom edge above the window edge. */
  readonly bottom: number
}

function positive(value: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Fit the bubble component zoom so the scaled box fits the window.
 *
 * Reuses the character-image fit policy (fitScaleToViewport): the desired zoom
 * is kept when the scaled box fits and reduced just enough otherwise. Because
 * the bubble's font-size is a fixed panel base (pet.css) and the component zoom
 * is applied ONCE as a container transform, the layout size does not depend on
 * the fitted zoom, so a single measurement is enough.
 */
export function fitBubbleZoom(
  desiredZoom: number,
  layout: BubbleLayoutBox,
  viewport: { readonly width: number; readonly height: number },
  margin: number = BUBBLE_VIEWPORT_MARGIN,
  insets?: BubbleDockInsets,
): number {
  const safeMargin = Number.isFinite(margin) ? Math.max(0, margin) : BUBBLE_VIEWPORT_MARGIN
  const dock = resolveBubbleDockInsets(insets)
  // A docked window only shows (viewport - off-screen insets); fit the scaled
  // bubble inside that visible area instead of the full transparent window.
  const visible = {
    width: Math.max(1, viewport.width - dock.left - dock.right),
    height: Math.max(1, viewport.height - dock.top - dock.bottom),
  }
  return fitScaleToViewport(desiredZoom, layout, visible, { x: safeMargin, top: safeMargin, bottom: safeMargin })
}

/**
 * Resolve the visual bubble box and its anchor from the scaled size.
 *
 * The desktop bubble uses `transform: translateX(calc(-50% + centreX))
 * scale(z)` with `transform-origin: bottom center` (pet.css), so:
 *  - the visual horizontal centre equals `centreX`, and
 *  - the visual bottom edge equals the layout bottom edge, which is the inline
 *    `bottom` distance above the viewport bottom.
 * Every clamp below is computed from the *scaled* size (layout x zoom).
 */
export function resolveBubblePlacement(input: BubblePlacementInput): BubblePlacement {
  const viewport = {
    width: positive(input.viewport.width, 480),
    height: positive(input.viewport.height, 336),
  }
  const margin = Number.isFinite(input.margin) ? Math.max(0, input.margin as number) : BUBBLE_VIEWPORT_MARGIN
  const gap = Number.isFinite(input.gap) ? Math.max(0, input.gap as number) : BUBBLE_GAP
  const layout = {
    width: positive(input.layout.width, 0),
    height: positive(input.layout.height, 0),
  }
  const insets = resolveBubbleDockInsets(input.insets)
  const zoom = fitBubbleZoom(input.zoom, layout, viewport, margin, insets)
  const width = layout.width * zoom
  const height = layout.height * zoom

  // Horizontal: clamp the scaled box inside the VISIBLE window area (a docked
  // window hides `insets.right/left` off-screen); when even that cannot hold it
  // (pathological zoom), keep it centred instead of pinning it to an edge.
  const half = width / 2
  const minCentreX = margin + insets.left + half
  const maxCentreX = viewport.width - margin - insets.right - half
  const petCentreX = Number.isFinite(input.petCentreX) ? input.petCentreX : viewport.width / 2
  const centreX = minCentreX > maxCentreX
    ? viewport.width / 2
    : Math.min(maxCentreX, Math.max(minCentreX, petCentreX))

  // Vertical: the visual bottom edge (== layout bottom edge) wants to sit just
  // above the pet. Clamp it below the top margin using the scaled height, and
  // above the bottom margin. The fit above guarantees minBottom <= maxBottom.
  const desiredBottom = input.petTop - gap
  const minBottom = margin + insets.top + height
  const maxBottom = Math.max(0, viewport.height - margin - insets.bottom)
  const bottomEdge = minBottom > maxBottom ? maxBottom : Math.min(maxBottom, Math.max(minBottom, desiredBottom))
  return { zoom, width, height, centreX, bottom: viewport.height - bottomEdge }
}

function visiblePetRect(): DOMRect | null {
  const selectors = ['#hero-canvas', '#hero-stage', '.fold-pet', '#pet']
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector)
    if (!element) continue
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const rect = element.getBoundingClientRect()
    if (rect.width >= 8 && rect.height >= 8) return rect
  }
  return null
}

/**
 * Current bubble component zoom (advanced → 组件缩放 → 气泡). The bubble is
 * anchored by an inline transform, so the same scale must be composed here or
 * the visual size would drift from the measured anchor. Missing/invalid CSS
 * values fall back to 1 (the shipped look).
 */
function bubbleZoom(): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--bubble-zoom').trim()
    const value = Number(raw)
    return Number.isFinite(value) && value > 0 ? Math.min(2.5, Math.max(0.25, value)) : 1
  } catch {
    return 1
  }
}

/** Trim to 3 decimals: the fitted zoom is not observable beyond that (same precision as the CSS vars). */
function formatZoom(zoom: number): number {
  return Math.round(zoom * 1000) / 1000
}

/**
 * Off-screen amounts of the docked pet window, read from the CSS variables
 * pet-window-dock.ts writes. Missing variables (undocked / older page) → 0, so
 * the shipped 480x336 clamp is unchanged unless a dock actually happened.
 */
function readDockInsets(): ResolvedBubbleDockInsets {
  let style: CSSStyleDeclaration | null = null
  try {
    style = getComputedStyle(document.documentElement)
  } catch {
    style = null
  }
  const read = (name: string): number => {
    if (style === null) return 0
    try {
      const value = Number.parseFloat(style.getPropertyValue(name))
      return Number.isFinite(value) ? value : 0
    } catch {
      return 0
    }
  }
  return resolveBubbleDockInsets({
    left: read(PET_DOCK_INSET_VARS.left),
    right: read(PET_DOCK_INSET_VARS.right),
    top: read(PET_DOCK_INSET_VARS.top),
    bottom: read(PET_DOCK_INSET_VARS.bottom),
  })
}

/** Clamp into [min,max]; a collapsed range (huge dock insets) pins to min. */
function clampInto(value: number, min: number, max: number): number {
  return max < min ? min : Math.min(max, Math.max(min, value))
}

/**
 * Anchor transform for the placed bubble. `translateX(-50%)` centres the box
 * on its own layout position; the extra `centreX` puts that centre on the pet.
 * The component zoom is applied ONCE here (the font stays at the fixed panel
 * base), and `transform-origin: bottom center` keeps the visual bottom edge on
 * the layout bottom edge so the anchor math in resolveBubblePlacement() is
 * exact. The layout box is pinned at left: 0 so its shrink-to-fit width never
 * depends on the anchor (a box with left: 300px would only get 180px of
 * available width and wrap differently from the measured one).
 */
function bubbleTransform(zoom: number, centreX: number): string {
  return `translateX(calc(-50% + ${Math.round(centreX)}px)) scale(${formatZoom(zoom)})`
}

function place(rect: DOMRect | null): void {
  if (document.documentElement.dataset.petShell !== 'desktop') return
  const bubble = document.getElementById('bubble')
  const trigger = document.getElementById('pet-menu-button')
  if (!bubble || !trigger) return
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const desiredZoom = bubbleZoom()
  if (!rect) {
    bubble.style.left = '50%'
    bubble.style.bottom = '200px'
    bubble.style.top = 'auto'
    bubble.style.transform = `translateX(-50%) scale(${formatZoom(desiredZoom)})`
    trigger.style.left = '50%'
    trigger.style.top = 'auto'
    trigger.style.bottom = `${TRIGGER_SIZE + 8}px`
    trigger.style.right = 'auto'
    return
  }
  bubble.style.position = 'absolute'
  // Pin the layout box at x=0: an absolutely-positioned box with a non-zero
  // `left` only gets (containing width - left) of available width, so the
  // bubble's wrap would depend on its own anchor. With left:0 the shrink-to-fit
  // width is independent of the anchor and one measurement is exact. The
  // transform below moves the visual centre onto the pet. offset* ignore
  // transforms, so the measured size is the layout size at component zoom 1.
  bubble.style.left = '0px'
  const layout = {
    width: positive(bubble.offsetWidth, 0),
    height: positive(bubble.offsetHeight, 0),
  }
  const insets = readDockInsets()
  const placement = resolveBubblePlacement({
    petCentreX: rect.left + rect.width / 2,
    petTop: rect.top,
    layout,
    zoom: desiredZoom,
    viewport: { width: viewportWidth, height: viewportHeight },
    insets,
  })
  bubble.style.top = 'auto'
  bubble.style.bottom = `${Math.round(placement.bottom)}px`
  bubble.style.transform = bubbleTransform(placement.zoom, placement.centreX)
  bubble.style.pointerEvents = 'none'
  // ⋯ trigger: pet lower-right corner, clamped into the VISIBLE area (a docked
  // window's transparent margin is off-screen, so the trigger must move too).
  const left = clampInto(
    rect.right + TRIGGER_GAP,
    4 + insets.left,
    viewportWidth - TRIGGER_SIZE - 4 - insets.right,
  )
  const top = clampInto(
    rect.bottom - TRIGGER_SIZE,
    4 + insets.top,
    viewportHeight - TRIGGER_SIZE - 4 - insets.bottom,
  )
  trigger.style.left = `${Math.round(left)}px`
  trigger.style.top = `${Math.round(top)}px`
  trigger.style.right = 'auto'
  trigger.style.bottom = 'auto'
}

/** Start syncing once; safe to call from the boot path on every page load. */
export function startDesktopShellLayout(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  let scheduled = false
  const sync = (): void => {
    scheduled = false
    place(visiblePetRect())
  }
  const schedule = (): void => {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(sync)
  }
  window.addEventListener('resize', schedule)
  // The shell attribute, hero/fold switch and pet sprite size all change late.
  const observer = new MutationObserver(schedule)
  // `style` is included because desktop-shell.ts writes the scale variables on
  // <html>; a zoom change must re-anchor the bubble without waiting for the
  // 500ms fallback tick.
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pet-shell', 'data-pet-render', 'style'] })
  const pet = document.getElementById('pet')
  if (pet) observer.observe(pet, { attributes: true, childList: true, subtree: true })
  if (typeof ResizeObserver !== 'undefined') {
    const resize = new ResizeObserver(schedule)
    for (const selector of ['#hero-canvas', '.fold-pet', '#pet']) {
      const element = document.querySelector(selector)
      if (element) resize.observe(element)
    }
  }
  // Cheap fallback for animation/scale changes that fire no window event.
  window.setInterval(schedule, 500)
  schedule()
}
