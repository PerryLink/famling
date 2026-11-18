/**
 * Click-through hit-region sync for the transparent Tauri pet window.
 *
 * The pet window is a 480x336 always-on-top transparent window. Without this
 * sync it intercepts every click in that rectangle even where nothing is
 * drawn, which blocks the desktop/apps underneath. The Rust side polls the
 * cursor and toggles `set_ignore_cursor_events`, using the regions reported
 * here (CSS pixels, viewport-relative).
 *
 * Only visible interactive surfaces are reported: the pet itself, buttons,
 * menus, the composer/result card, and full-screen dialogs (TOS/age/about/
 * memory/settings/advisers). Everything else stays click-through.
 */

const HIT_SELECTORS = [
  '#pet',
  '.fold-pet',
  '#hero-stage',
  '#hero-canvas',
  '#pet-menu-button',
  '#pet-shell-menu',
  '#pet-composer',
  '#result-card',
  '#pet-input-layer > *',
  '#about-screen',
  '#memory-screen',
  '#advisers-panel',
  '.settings-screen',
  '.consent-root',
  '[role="dialog"]',
  'aside.panel',
]

type Rect = [number, number, number, number]

function visibleRect(el: Element, width: number, height: number): Rect | null {
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return null
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const x1 = Math.max(0, Math.floor(rect.left))
  const y1 = Math.max(0, Math.floor(rect.top))
  const x2 = Math.min(width, Math.ceil(rect.right))
  const y2 = Math.min(height, Math.ceil(rect.bottom))
  if (x2 <= x1 || y2 <= y1) return null
  return [x1, y1, x2, y2]
}

/** Collect the current interactive rectangles (CSS px, clamped to the viewport). */
export function collectHitRegions(doc: Document = document): Rect[] {
  const width = Math.max(0, doc.defaultView?.innerWidth ?? 480)
  const height = Math.max(0, doc.defaultView?.innerHeight ?? 336)
  const regions: Rect[] = []
  const seen = new Set<Element>()
  for (const selector of HIT_SELECTORS) {
    let nodes: Element[]
    try {
      nodes = Array.from(doc.querySelectorAll(selector))
    } catch {
      continue
    }
    for (const el of nodes) {
      if (seen.has(el)) continue
      seen.add(el)
      const rect = visibleRect(el, width, height)
      if (rect) regions.push(rect)
    }
  }
  // A screen-sized modal must stay fully interactive: include the whole viewport
  // when any dialog-like surface covers most of the window.
  const full = Array.from(doc.querySelectorAll('.consent-root, [role="dialog"], .settings-screen'))
    .some((el) => {
      const rect = visibleRect(el, width, height)
      return rect !== null && rect[2] - rect[0] >= width * 0.7 && rect[3] - rect[1] >= height * 0.7
    })
  if (full) regions.push([0, 0, width, height])
  return regions
}

/**
 * Start reporting hit regions to the Rust window controller. No-op outside
 * Tauri; failures (older host, IPC error) leave the window fully interactive.
 */
export function startHitRegionSync(): void {
  const internals = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  if (!internals) return
  let invoke: ((command: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null
  let lastSignature = ''
  const tick = (): void => {
    if (!invoke) return
    try {
      const regions = collectHitRegions()
      const signature = JSON.stringify(regions)
      if (signature === lastSignature) return
      lastSignature = signature
      void invoke('set_pet_hit_regions', { regions }).catch(() => {})
    } catch {
      /* hit-region sync must never break the pet */
    }
  }
  void import('@tauri-apps/api/core')
    .then((mod) => {
      invoke = mod.invoke
      tick()
      setInterval(tick, 250)
      window.addEventListener('resize', tick)
      document.addEventListener('visibilitychange', tick)
    })
    .catch(() => {})
}
