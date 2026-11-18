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

/**
 * Alpha-tile regions for the hero canvas. The old whole-canvas rectangle made
 * transparent pixels swallow desktop clicks; sampling the real framebuffer and
 * emitting only tiles that contain opaque pixels keeps every transparent area
 * click-through. The caller re-samples ~4x/s, so moved/old positions disappear.
 */
export function opaqueTilesFromAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  tile = 8,
  alphaMin = 8,
): Rect[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || tile <= 0) return []
  const cols = Math.ceil(width / tile)
  const rows = Math.ceil(height / tile)
  const out: Rect[] = []
  for (let row = 0; row < rows; row += 1) {
    let runStart = -1
    for (let col = 0; col <= cols; col += 1) {
      let solid = false
      if (col < cols) {
        const x0 = col * tile
        const y0 = row * tile
        const x1 = Math.min(width, x0 + tile)
        const y1 = Math.min(height, y0 + tile)
        scan: for (let y = y0; y < y1; y += 1) {
          for (let x = x0; x < x1; x += 1) {
            if ((data[(y * width + x) * 4 + 3] ?? 0) > alphaMin) {
              solid = true
              break scan
            }
          }
        }
      }
      if (solid && runStart < 0) runStart = col
      if (!solid && runStart >= 0) {
        out.push([runStart * tile, row * tile, col * tile, Math.min(height, (row + 1) * tile)])
        runStart = -1
      }
    }
  }
  return out
}

function collectHeroOpaqueRegions(doc: Document): Rect[] {
  const canvas = doc.querySelector<HTMLCanvasElement>('#hero-canvas')
  if (!canvas || canvas.width <= 0 || canvas.height <= 0) return []
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(canvas) : null
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return []
  const rect = canvas.getBoundingClientRect()
  const clientWidth = canvas.clientWidth
  const clientHeight = canvas.clientHeight
  if (rect.width <= 0 || rect.height <= 0 || clientWidth <= 0 || clientHeight <= 0) return []
  let ctx: CanvasRenderingContext2D | null = null
  try {
    ctx = canvas.getContext('2d', { willReadFrequently: true })
  } catch {
    ctx = null
  }
  if (!ctx) return []
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  } catch {
    // GPU readback/taint failure must never make the pet unclickable: fall back
    // to the old full-canvas rect (the transparent-area fix is best-effort).
    return [[Math.max(0, Math.floor(rect.left)), Math.max(0, Math.floor(rect.top)), Math.ceil(rect.right), Math.ceil(rect.bottom)]]
  }
  // ~2 art pixels per tile: fine enough that transparent pixels around the
  // silhouette do not swallow desktop clicks, coarse enough to keep the IPC
  // payload small. Backing-store size includes DPR and the layout scale.
  const tile = Math.max(2, Math.round((canvas.width / 96) * 2))
  const tiles = opaqueTilesFromAlpha(data, canvas.width, canvas.height, tile)
  const flip = canvas.dataset.heroFlip === '1'
  const sx = rect.width / clientWidth
  const sy = rect.height / clientHeight
  const out: Rect[] = []
  for (const [x0, y0, x1, y1] of tiles) {
    const lx0 = (x0 / canvas.width) * clientWidth
    const lx1 = (x1 / canvas.width) * clientWidth
    const ly0 = (y0 / canvas.height) * clientHeight
    const ly1 = (y1 / canvas.height) * clientHeight
    const left = flip ? clientWidth - lx1 : lx0
    const right = flip ? clientWidth - lx0 : lx1
    out.push([
      Math.max(0, Math.floor(rect.left + left * sx)),
      Math.max(0, Math.floor(rect.top + ly0 * sy)),
      Math.max(0, Math.ceil(rect.left + right * sx)),
      Math.max(0, Math.ceil(rect.top + ly1 * sy)),
    ])
  }
  return out
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
  const heroRegions = collectHeroOpaqueRegions(doc)
  for (const rect of heroRegions) {
    const x1 = Math.max(0, rect[0])
    const y1 = Math.max(0, rect[1])
    const x2 = Math.min(width, rect[2])
    const y2 = Math.min(height, rect[3])
    if (x2 > x1 && y2 > y1) regions.push([x1, y1, x2, y2])
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
      // 10 Hz: fast enough that a moved/transparent pixel stops blocking as
      // soon as the next animation/frame state settles, cheap enough to keep
      // alpha sampling + IPC off the critical path.
      setInterval(tick, 100)
      window.addEventListener('resize', tick)
      document.addEventListener('visibilitychange', tick)
    })
    .catch(() => {})
}
