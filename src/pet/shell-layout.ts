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
 */

const BUBBLE_GAP = 8
const TRIGGER_SIZE = 22
const TRIGGER_GAP = 6

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

function place(rect: DOMRect | null): void {
  if (document.documentElement.dataset.petShell !== 'desktop') return
  const bubble = document.getElementById('bubble')
  const trigger = document.getElementById('pet-menu-button')
  if (!bubble || !trigger) return
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  if (!rect) {
    bubble.style.left = '50%'
    bubble.style.bottom = '200px'
    bubble.style.top = 'auto'
    bubble.style.transform = 'translateX(-50%)'
    trigger.style.left = '50%'
    trigger.style.top = 'auto'
    trigger.style.bottom = `${TRIGGER_SIZE + 8}px`
    trigger.style.right = 'auto'
    return
  }
  // Bubble: centred horizontally on the pet, bottom edge just above it.
  const centreX = rect.left + rect.width / 2
  bubble.style.top = 'auto'
  bubble.style.position = 'absolute'
  bubble.style.bottom = `${Math.round(viewportHeight - rect.top + BUBBLE_GAP)}px`
  bubble.style.transform = 'translateX(-50%)'
  bubble.style.pointerEvents = 'none'
  // Measure after the text/size settles, then clamp inside the viewport.
  const half = bubble.offsetWidth / 2
  const minLeft = half + 8
  const maxLeft = viewportWidth - half - 8
  const clampedLeft = minLeft > maxLeft ? viewportWidth / 2 : Math.min(Math.max(centreX, minLeft), maxLeft)
  bubble.style.left = `${Math.round(clampedLeft)}px`
  // ⋯ trigger: pet lower-right corner, clamped into the window.
  const left = Math.min(Math.max(rect.right + TRIGGER_GAP, 4), viewportWidth - TRIGGER_SIZE - 4)
  const top = Math.min(Math.max(rect.bottom - TRIGGER_SIZE, 4), viewportHeight - TRIGGER_SIZE - 4)
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
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-pet-shell', 'data-pet-render'] })
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