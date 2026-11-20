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
  '#pet-settings',
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

const alphaTileCache = new Map<string, Rect[]>()

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
  // The renderer publishes the current tag/frame on the canvas; tile masks in
  // backing-store space are frame-stable, so sample each unique frame once and
  // reuse it across the 10 Hz sync (and across flips/layout scale changes).
  const frameKey = canvas.dataset.heroFrameKey
  const cacheKey = frameKey ? `${canvas.width}x${canvas.height}:${frameKey}` : null
  let tiles: Rect[]
  const cached = cacheKey ? alphaTileCache.get(cacheKey) : undefined
  if (cached) {
    tiles = cached
  } else {
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
    tiles = opaqueTilesFromAlpha(data, canvas.width, canvas.height, tile)
    if (cacheKey && alphaTileCache.size < 512) alphaTileCache.set(cacheKey, tiles)
  }
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

// ---------------------------------------------------------------------------
// Reporting scheduler (perf P0: no unconditional 10 Hz, none while hidden)
// ---------------------------------------------------------------------------

/** Cadence while the pet art needs tracking (the old unconditional 10 Hz). */
export const HIT_REGION_ACTIVE_MS = 100
/** Cadence while nothing moves: folded-paper idle, a frozen hero frame, no hero. */
export const HIT_REGION_IDLE_MS = 1_000
/** A hero frame/position change within this window keeps the active cadence. */
export const HIT_REGION_QUIET_MS = 1_500
/** IPC command consumed by the Rust window controller. */
export const HIT_REGION_COMMAND = 'set_pet_hit_regions'

export type HitRegionInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

/** Injectable seams; production passes nothing and gets the Tauri defaults. */
export interface HitRegionSyncDeps {
  readonly document?: Document
  readonly window?: Window
  /** Injected Tauri invoke; omitted = lazy `@tauri-apps/api/core` import. */
  readonly invoke?: HitRegionInvoke
  readonly now?: () => number
  readonly setTimeout?: (handler: () => void, ms: number) => unknown
  readonly clearTimeout?: (handle: unknown) => void
  readonly activeMs?: number
  readonly idleMs?: number
  readonly quietMs?: number
}

export interface HitRegionSyncHandle {
  /** Sample now (region list unchanged = no IPC). No-op while hidden. */
  refresh(): void
  /** Current cadence in ms; null while stopped or paused for a hidden page. */
  cadenceMs(): number | null
  /** True while page visibility pauses the sync (no timer is armed). */
  isPaused(): boolean
  /** Remove the listeners and the timer (idempotent). */
  stop(): void
}

/**
 * Frame/position signature of the hero canvas. The renderer publishes
 * `data-hero-frame-key` for every drawn frame and moves the canvas through the
 * inline `style.translate`/`style.scale` properties (left/right travel), so the
 * frame key + flip + style attribute is the cheapest "is the pet moving" probe.
 * Container/scene UI changes are caught by the input wake listeners below.
 */
export function heroMotionSignature(doc: Document): string {
  let canvas: HTMLCanvasElement | null = null
  try {
    canvas = doc.querySelector<HTMLCanvasElement>('#hero-canvas')
  } catch {
    return ''
  }
  if (!canvas) return ''
  const frameKey = canvas.dataset?.heroFrameKey ?? ''
  const flip = canvas.dataset?.heroFlip ?? ''
  let inline = ''
  try {
    inline = canvas.getAttribute('style') ?? ''
  } catch {
    inline = ''
  }
  const width = typeof canvas.width === 'number' ? canvas.width : 0
  const height = typeof canvas.height === 'number' ? canvas.height : 0
  return frameKey + '|' + flip + '|' + inline + '|' + width + 'x' + height
}

/** Cadence for the observed time since the last hero motion. */
export function nextHitRegionCadence(
  msSinceMotion: number,
  activeMs: number = HIT_REGION_ACTIVE_MS,
  idleMs: number = HIT_REGION_IDLE_MS,
  quietMs: number = HIT_REGION_QUIET_MS,
): number {
  return msSinceMotion <= quietMs ? activeMs : idleMs
}

/**
 * Start reporting hit regions to the Rust window controller.
 *
 * Transparency/click-through semantics are unchanged (the same DOM rects and
 * alpha tiles are reported); only the *polling* changed (perf P0):
 * - a hidden page pauses the sync completely (no timer, no sampling);
 * - a visible page polls at 10 Hz only while the hero frame/position is moving
 *   (or for 1.5 s after a user input/resize), otherwise at 1 Hz — the default
 *   folded-paper shell has no moving hit surface at all;
 * - every user input re-arms the active cadence, so a menu/dialog that opens
 *   from a click/keypress is reported within one active tick instead of
 *   waiting for the idle poll;
 * - the first payload is sent immediately (boot must not wait for a tick).
 *
 * No-op outside Tauri; failures (older host, IPC error) leave the window fully
 * interactive. Callers may ignore the returned handle (production does).
 */
export function startHitRegionSync(deps: HitRegionSyncDeps = {}): HitRegionSyncHandle | null {
  const doc = deps.document ?? (typeof document === 'undefined' ? undefined : document)
  if (!doc) return null
  const win = deps.window ?? (typeof window === 'undefined' ? undefined : window)
  let invoke: HitRegionInvoke | null = deps.invoke ?? null
  if (invoke === null) {
    const internals = win ? (win as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ : undefined
    if (!internals) return null
  }
  const now = deps.now ?? (() => Date.now())
  const setTimer =
    deps.setTimeout ?? ((handler: () => void, ms: number): unknown => setTimeout(handler, ms))
  const clearTimer =
    deps.clearTimeout ?? ((handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const activeMs = deps.activeMs ?? HIT_REGION_ACTIVE_MS
  const idleMs = deps.idleMs ?? HIT_REGION_IDLE_MS
  const quietMs = deps.quietMs ?? HIT_REGION_QUIET_MS

  let stopped = false
  let paused = false
  let timer: unknown = null
  let cadence: number | null = null
  let lastSignature = ''
  let lastMotion = heroMotionSignature(doc)
  let lastMotionAt = now()
  const listeners: Array<{ target: EventTarget; type: string; listener: (event: Event) => void }> = []

  const clearTimerHandle = (): void => {
    if (timer === null) return
    try {
      clearTimer(timer)
    } catch {
      /* an already-fired timer is fine */
    }
    timer = null
  }

  /** Move to `ms` and arm the next sample. Paused/stopped pages stay disarmed. */
  const arm = (ms: number): void => {
    clearTimerHandle()
    cadence = null
    if (stopped || paused) return
    cadence = ms
    timer = setTimer(() => {
      timer = null
      pump()
    }, ms)
  }

  const sample = (): void => {
    if (!invoke) return
    try {
      const regions = collectHitRegions(doc)
      const signature = JSON.stringify(regions)
      if (signature === lastSignature) return
      lastSignature = signature
      void invoke(HIT_REGION_COMMAND, { regions }).catch(() => {})
    } catch {
      /* hit-region sync must never break the pet */
    }
  }

  /** Observe hero motion and return ms since the last change. */
  const observeMotion = (): number => {
    const motion = heroMotionSignature(doc)
    if (motion !== lastMotion) {
      lastMotion = motion
      lastMotionAt = now()
    }
    return now() - lastMotionAt
  }

  const pump = (): void => {
    if (stopped || paused) return
    const sinceMotion = observeMotion()
    sample()
    arm(nextHitRegionCadence(sinceMotion, activeMs, idleMs, quietMs))
  }

  /** Visibility: hidden pages stop the timer; visible pages sample immediately. */
  const onVisibilityChange = (): void => {
    if (stopped) return
    if (doc.visibilityState === 'hidden') {
      paused = true
      clearTimerHandle()
      cadence = null
      return
    }
    if (!paused) return
    paused = false
    lastMotion = heroMotionSignature(doc)
    lastMotionAt = now()
    pump()
  }

  /**
   * User input: a menu/dialog/composer opened by a click or keypress must be
   * reported before the idle poll would catch it, so re-arm the active cadence.
   */
  const wake = (): void => {
    if (stopped || paused) return
    lastMotionAt = now()
    if (cadence !== activeMs) arm(activeMs)
  }

  const onResize = (): void => {
    if (stopped || paused) return
    lastMotionAt = now()
    sample()
    arm(activeMs)
  }

  const listen = (target: EventTarget | null | undefined, type: string, listener: (event: Event) => void): void => {
    try {
      target?.addEventListener?.(type, listener)
      if (target) listeners.push({ target, type, listener })
    } catch {
      /* listener registration is best-effort */
    }
  }

  const begin = (): void => {
    if (stopped || !invoke) return
    // The first payload must not wait for a tick; the first quiet period then
    // settles into the idle cadence (folded-paper shell included).
    lastMotion = heroMotionSignature(doc)
    lastMotionAt = now()
    sample()
    arm(nextHitRegionCadence(0, activeMs, idleMs, quietMs))
    listen(doc as unknown as EventTarget, 'visibilitychange', onVisibilityChange)
    listen(doc as unknown as EventTarget, 'pointerdown', wake)
    listen(doc as unknown as EventTarget, 'keydown', wake)
    listen(doc as unknown as EventTarget, 'wheel', wake)
    listen(doc as unknown as EventTarget, 'touchstart', wake)
    listen(doc as unknown as EventTarget, 'focusin', wake)
    listen(win as unknown as EventTarget, 'resize', onResize)
  }

  if (invoke) {
    begin()
  } else {
    void import('@tauri-apps/api/core')
      .then((mod) => {
        if (stopped) return
        invoke = mod.invoke
        begin()
      })
      .catch(() => {
        /* older host / missing API: leave the window fully interactive */
      })
  }

  return {
    refresh: (): void => {
      if (stopped || paused) return
      lastMotionAt = now()
      sample()
      arm(nextHitRegionCadence(0, activeMs, idleMs, quietMs))
    },
    cadenceMs: (): number | null => (stopped || paused ? null : cadence),
    isPaused: (): boolean => paused,
    stop: (): void => {
      if (stopped) return
      stopped = true
      clearTimerHandle()
      cadence = null
      for (const entry of listeners) {
        try {
          entry.target.removeEventListener(entry.type, entry.listener)
        } catch {
          /* ignore */
        }
      }
      listeners.length = 0
    },
  }
}
