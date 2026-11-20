/**
 * Hero Canvas2D render backend — wraps the existing `hero.ts` CharacterRenderer
 * behind the pluggable `RenderBackend` contract.
 *
 * Why an offscreen "stage" canvas:
 * `CharacterRenderer` was written as the only renderer in the app: it owns its
 * canvas size (`canvas.width = pack.canvas * scale`), draws the whole canvas at
 * (0,0) and starts its own `requestAnimationFrame` loop in `play()`. To compose
 * several actors on one scene canvas without rewriting (and risking) the
 * existing renderer, this backend gives each loaded pack a *private* stage
 * canvas, lets the wrapped renderer draw one still frame into it, then blits
 * that stage onto the host canvas at the actor's x/y. `play()` is never called,
 * so the backend owns no rAF: the scene clock drives every frame.
 *
 * Cost: one extra `drawImage` per actor per frame plus a stage resize in
 * `renderStill()`. That is acceptable for Phase 1 (a handful of actors); the
 * Phase 2 split (CharacterAnimator per the extensibility architecture doc) can
 * draw directly into the host context and drop the stage.
 *
 * The first-party `heroRendererPlugin` below is the intended registration entry
 * point. A plugin is host code, not pack content; packs are only data (see
 * `types.ts` for the full boundary + future Live2D/Spine notes).
 */
import {
  CharacterRenderer,
  describeCharacterPack,
  frameIndexFor,
  loadCharacterPack,
  resolveTag,
  validateCharacterPack,
  type CharacterTag,
  type LoadedCharacterPack,
} from '../hero.ts'
import {
  RENDER_API_HOST_VERSION,
  RENDER_API_VERSION,
  RenderBackendError,
  assertRenderPackRef,
  type ActorView,
  type RenderBackend,
  type RenderPackRef,
  type RenderScale,
  type RendererPlugin,
} from './types.ts'
import { isPixelScale, unsupportedScaleMessage } from '../pixel-scale.ts'

/**
 * Pack formats this backend understands. These mirror the `style` values of
 * hero.ts CharacterPacks: all three share the same manifest + PNG frame layout,
 * so the same renderer handles them.
 */
export const HERO_PACK_FORMATS = ['pixel-hero', 'pixel-micro', 'hd-chibi'] as const
export type HeroPackFormat = (typeof HERO_PACK_FORMATS)[number]

/**
 * Stage canvases start at 1× (native art pixels). The stage is re-sized to
 * `pack.canvas * view.scale` on every render, so actors can use any supported
 * display scale, including reciprocal downscales (1/2, 1/4, 1/8) that fit a
 * 512/1024px pack into a 480px pet window.
 */
const STAGE_SCALE: RenderScale = 1

// ---------------------------------------------------------------------------
// Progressive (idle-first) frame loading — additive host extension
// ---------------------------------------------------------------------------

/** Options for the idle-first pack load. */
export interface FirstFrameLoadOptions {
  /** Tags decoded before `loadFirst()` resolves; default: idle-first (`firstFrameTags`). */
  readonly priorityTags?: readonly string[]
}

/** What is drawable after `loadFirst()`; the rest is queued for background decode. */
export interface FirstFrameLoadResult {
  readonly packId: string
  /** Tags whose every frame is decoded (drawable now). */
  readonly readyTags: readonly string[]
  /** Frames still queued for the background decoder. */
  readonly pendingFrames: number
}

/** One background decode batch (bounded so idle callbacks stay short). */
export interface FrameDecodeBatchResult {
  readonly decoded: number
  readonly pendingFrames: number
  readonly done: boolean
}

/**
 * Optional progressive-load extension implemented by the first-party hero
 * backend. It is an additive host-side extension, NOT part of the frozen
 * `RenderBackend` contract: hosts duck-type it with
 * `progressiveFrameLoaderOf()` and fall back to `load()` (eager) otherwise.
 *
 * Why: the first-frame gate only needs the idle clip (6–8 frames). Decoding all
 * 68–144 frames before the gate would block boot for a built-in pack (~2.5 MiB
 * RGBA at 96²) and can be catastrophic for third-party packs (144 × 1024² ≈
 * 576 MiB). The gate decodes idle first, paints, and the host then feeds
 * `decodeBatch()` from requestIdleCallback. A clip that becomes visible before
 * it is decoded is prioritized (first play waits for its frames) and the
 * renderer holds the last good pose, so the UI never flashes a wrong frame.
 */
export interface ProgressiveFrameLoader {
  /** Decode only `priorityTags` (default: idle) and resolve; the rest stays queued. */
  loadFirst(pack: RenderPackRef, options?: FirstFrameLoadOptions): Promise<FirstFrameLoadResult>
  /** Decode up to `maxFrames` queued frames (one idle-batch worth). */
  decodeBatch(maxFrames?: number): Promise<FrameDecodeBatchResult>
  /** True when every frame of the tag is decoded (false for unknown pack/tag). */
  isTagReady(packId: string, tag: string): boolean
  /** Move a clip that is about to become visible to the front of the decode queue. */
  prioritizeTag(packId: string, tag: string): boolean
  /** Tags fully decoded for one pack (empty for unknown packs). */
  readyTags(packId: string): readonly string[]
  /** Frames still decoding (all packs, or one pack). */
  pendingFrameCount(packId?: string): number
  /** Monotonic counter bumped on every successful decode batch (QA/diagnostics). */
  frameRevision(): number
}

/** Duck-type a backend for the optional progressive loader; null when unsupported. */
export function progressiveFrameLoaderOf(backend: RenderBackend): ProgressiveFrameLoader | null {
  const candidate = backend as Partial<ProgressiveFrameLoader>
  if (
    typeof candidate.loadFirst !== 'function' ||
    typeof candidate.decodeBatch !== 'function' ||
    typeof candidate.isTagReady !== 'function' ||
    typeof candidate.prioritizeTag !== 'function' ||
    typeof candidate.pendingFrameCount !== 'function'
  ) {
    return null
  }
  return candidate as ProgressiveFrameLoader
}

/** Options for tests/embedders; production uses the defaults. */
export interface HeroRenderBackendOptions {
  /** Fetch used only when `pack.data` is absent (manifest fetch). Default: global fetch. */
  fetcher?: typeof fetch
  /**
   * Private offscreen stage canvas factory. Defaults to
   * `document.createElement('canvas')`; injectable so Node tests (and future
   * OffscreenCanvas hosts) can run without a DOM.
   */
  createCanvas?: () => HTMLCanvasElement
}

interface HeroSlot {
  /** The ref the slot was loaded from (locator/format are part of the identity). */
  readonly ref: RenderPackRef
  /** Validated runtime pack: asset URLs + frames grouped by tag. */
  readonly pack: LoadedCharacterPack
  /** Private stage canvas owned by this backend (never the host canvas). */
  readonly stage: HTMLCanvasElement
  /** Wrapped single-role renderer that draws into `stage`. */
  readonly renderer: CharacterRenderer
}

/** `load()` modes: eager (all frames) or idle-first (first frame, rest queued). */
type PackLoadMode = 'full' | 'first'

/** In-flight load per pack id, so concurrent callers share one install. */
interface PendingLoad {
  readonly ref: RenderPackRef
  readonly mode: PackLoadMode
  promise: Promise<void>
  /** Set once a `loadFirst()` install committed its idle-first slot. */
  firstFrame?: FirstFrameLoadResult
}

/** Result of building one slot (stage + renderer + first-frame info). */
interface InstalledPack {
  readonly slot: HeroSlot
  readonly firstFrame: FirstFrameLoadResult | null
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function defaultCreateCanvas(): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    throw new RenderBackendError(
      'hero backend needs a DOM canvas: pass HeroRenderBackendOptions.createCanvas when running headless',
    )
  }
  return document.createElement('canvas')
}

function requireScale(value: number): RenderScale {
  if (!isPixelScale(value)) {
    throw new RenderBackendError(`hero backend ${unsupportedScaleMessage(value)}`)
  }
  return value
}

function requireFinite(value: number, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RenderBackendError(`hero backend: ${what} must be a finite number, got ${String(value)}`)
  }
  return value
}

function isHeroFormat(format: string): format is HeroPackFormat {
  return (HERO_PACK_FORMATS as readonly string[]).includes(format)
}

export class HeroRenderBackend implements RenderBackend, ProgressiveFrameLoader {
  readonly id = 'hero'
  /**
   * First-party backend is shipped with the host, so it declares the exact host
   * contract (v1.3: reciprocal display scales). `RENDER_API_VERSION` (1) remains
   * the legacy MAJOR for third-party/older plugins.
   */
  readonly apiVersion = RENDER_API_HOST_VERSION

  private readonly fetcher: typeof fetch
  private readonly createCanvas: () => HTMLCanvasElement
  /** Loaded packs, keyed by pack id (one slot per pack, shared by all actors). */
  private readonly slots = new Map<string, HeroSlot>()
  /** Loads in flight, keyed by pack id (concurrent callers share one promise). */
  private readonly pending = new Map<string, PendingLoad>()
  /** Monotonic background-decode counter (QA/diagnostics; never resets). */
  private decodeRevision = 0
  private disposed = false

  constructor(options: HeroRenderBackendOptions = {}) {
    this.fetcher = options.fetcher ?? fetch
    this.createCanvas = options.createCanvas ?? defaultCreateCanvas
  }

  /** Whether `packId` has been loaded already (host-side de-dupe helper). */
  isLoaded(packId: string): boolean {
    return this.slots.has(packId)
  }

  /** Loaded pack refs in load order (diagnostics). */
  loadedPacks(): RenderPackRef[] {
    return [...this.slots.values()].map((slot) => slot.ref)
  }

  /**
   * Eager load: decode the whole pack before resolving (legacy path, kept for
   * back-compat and direct backend users). Idempotent for the same pack id; a
   * pack installed with `loadFirst()` is drained to completion here.
   */
  async load(pack: RenderPackRef): Promise<void> {
    const ref = this.assertLoadRef(pack)
    const existing = this.slots.get(ref.id)
    if (existing) {
      this.assertSameRef(existing.ref, ref, 'already loaded')
      await this.settleSlot(existing)
      return
    }
    const pending = this.pending.get(ref.id)
    if (pending) {
      // A scene adding two actors of the same pack may call load() twice in
      // parallel; share the in-flight install instead of decoding twice.
      this.assertSameRef(pending.ref, ref, 'currently loading')
      await pending.promise
      await this.settleSlot(this.requireSlot(ref))
      return
    }
    await this.startPending(ref, 'full').promise
  }

  /**
   * Idle-first load for the first-frame gate: decode the boot clip (idle, 6–8
   * frames) and resolve; every other frame stays queued for `decodeBatch()`.
   * The slot is immediately renderable for `readyTags`, and `render()` holds
   * the last good pose for a clip that is not decoded yet (never a wrong
   * frame); `prioritizeTag()` makes the first play of that clip wait for
   * exactly its frames.
   */
  async loadFirst(pack: RenderPackRef, options: FirstFrameLoadOptions = {}): Promise<FirstFrameLoadResult> {
    const ref = this.assertLoadRef(pack)
    const existing = this.slots.get(ref.id)
    if (existing) {
      this.assertSameRef(existing.ref, ref, 'already loaded')
      return this.firstFrameInfoOf(existing)
    }
    const pending = this.pending.get(ref.id)
    if (pending) {
      this.assertSameRef(pending.ref, ref, 'currently loading')
      await pending.promise
      return this.firstFrameInfoOf(this.requireSlot(ref))
    }
    const entry = this.startPending(ref, 'first', options)
    await entry.promise
    return entry.firstFrame ?? this.firstFrameInfoOf(this.requireSlot(ref))
  }

  /** Decode up to `maxFrames` queued frames across loaded packs (one idle batch). */
  async decodeBatch(maxFrames = 2): Promise<FrameDecodeBatchResult> {
    this.assertUsable('decode')
    const limit = Number.isFinite(maxFrames) ? Math.max(1, Math.floor(maxFrames)) : 2
    let decoded = 0
    for (const slot of this.slots.values()) {
      const remaining = limit - decoded
      if (remaining <= 0) break
      if (!slot.renderer.hasPendingFrames()) continue
      const batch = await slot.renderer.decodeBatch(remaining)
      decoded += batch.decoded
    }
    if (decoded > 0) this.decodeRevision += 1
    const pendingFrames = this.pendingFrameCount()
    return { decoded, pendingFrames, done: pendingFrames === 0 }
  }

  /** True when every frame of one tag is decoded (false for unknown pack/tag). */
  isTagReady(packId: string, tag: string): boolean {
    const slot = this.slots.get(packId)
    if (!slot) return false
    return slot.renderer.isTagReady(tag)
  }

  /** Move a clip that is about to become visible to the front of the queue. */
  prioritizeTag(packId: string, tag: string): boolean {
    const slot = this.slots.get(packId)
    if (!slot) return false
    return slot.renderer.prioritizeTag(tag)
  }

  /** Tags fully decoded for one pack (empty for unknown packs). */
  readyTags(packId: string): readonly string[] {
    return this.slots.get(packId)?.renderer.readyTags() ?? []
  }

  /** Frames still queued for the background decoder (all packs or one pack). */
  pendingFrameCount(packId?: string): number {
    if (packId !== undefined) return this.slots.get(packId)?.renderer.pendingFrameCount ?? 0
    let total = 0
    for (const slot of this.slots.values()) total += slot.renderer.pendingFrameCount
    return total
  }

  /** Monotonic counter bumped on every successful background decode batch. */
  frameRevision(): number {
    return this.decodeRevision
  }

  /**
   * Draw one actor at its resolved x/y. The host canvas is only touched here
   * (never resized/cleared). Frame index is derived from `view.elapsedMs`, so
   * the scene clock alone decides animation; `nowMs` is accepted for future
   * backends that need an absolute clock.
   */
  render(ctx: CanvasRenderingContext2D, view: ActorView, nowMs: number): void {
    this.assertUsable('render')
    void nowMs
    if (!view.visible || view.opacity <= 0) return
    const slot = this.requireSlot(view.actor.pack)
    const scale = requireScale(view.scale)
    const x = Math.round(requireFinite(view.x, 'actor view x'))
    const y = Math.round(requireFinite(view.y, 'actor view y'))
    const opacity = Number.isFinite(view.opacity) ? Math.min(1, Math.max(0, view.opacity)) : 1

    const meta = this.requireTag(slot, view.actor.tag)
    const frame = frameIndexFor(meta, view.elapsedMs)
    if (slot.renderer.getScale() !== scale) slot.renderer.setScale(scale)
    try {
      // Draws one still frame into the private stage at art-canvas * scale.
      // A frame that is still decoding returns false: prioritize that clip and
      // hold the last good pose (idle) instead of flashing an empty/wrong frame.
      if (!slot.renderer.renderStill(view.actor.tag, frame)) {
        slot.renderer.prioritizeTag(view.actor.tag)
        if (!slot.renderer.renderHold()) return
      }
    } catch (error) {
      throw new RenderBackendError(
        `hero backend: failed to render tag "${view.actor.tag}" for pack "${slot.pack.id}": ${messageOf(error)}`,
        { cause: error },
      )
    }

    const stage = slot.stage
    if (stage.width <= 0 || stage.height <= 0) {
      throw new RenderBackendError(`hero backend: stage for pack "${slot.pack.id}" has no size`)
    }
    const previousAlpha = ctx.globalAlpha
    const previousSmoothing = ctx.imageSmoothingEnabled
    ctx.imageSmoothingEnabled = false
    ctx.globalAlpha = previousAlpha * opacity
    try {
      // CSS-pixel units; the host may apply a DPR transform to `ctx`.
      ctx.drawImage(stage, 0, 0, stage.width, stage.height, x, y, stage.width, stage.height)
    } finally {
      ctx.globalAlpha = previousAlpha
      ctx.imageSmoothingEnabled = previousSmoothing
    }
  }

  /**
   * Alpha hit test in actor-local CSS pixels (host subtracts the actor x/y).
   * Delegates to the wrapped renderer, so it needs a DOM (`document.createElement`
   * for its sample canvas) and is therefore optional/browser-oriented.
   */
  hitTest(view: ActorView, x: number, y: number): boolean {
    this.assertUsable('hitTest')
    const slot = this.requireSlot(view.actor.pack)
    if (!view.visible) return false
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    if (typeof document === 'undefined') {
      throw new RenderBackendError('hero backend hitTest requires a DOM environment (document.createElement); omit hitTest headless')
    }
    const scale = requireScale(view.scale)
    const meta = this.requireTag(slot, view.actor.tag)
    const frame = frameIndexFor(meta, view.elapsedMs)
    if (slot.renderer.getScale() !== scale) slot.renderer.setScale(scale)
    try {
      // Keep the shared stage in sync with this actor before sampling it: with
      // several actors per pack the stage's "current frame" is call-order based.
      if (!slot.renderer.renderStill(view.actor.tag, frame)) {
        // Frame still decoding: no trustworthy alpha mask yet, but ask for the
        // clip now so the next pointer move/repaint can hit-test it.
        slot.renderer.prioritizeTag(view.actor.tag)
        return false
      }
      return slot.renderer.hitTest(x, y)
    } catch (error) {
      throw new RenderBackendError(
        `hero backend: hitTest failed for tag "${view.actor.tag}" of pack "${slot.pack.id}": ${messageOf(error)}`,
        { cause: error },
      )
    }
  }

  /** Release every stage. Idempotent; the backend is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const slot of this.slots.values()) {
      try {
        slot.renderer.destroy()
      } catch {
        // Dispose must be best-effort: never let one bad stage block the rest.
      }
    }
    this.slots.clear()
  }

  /** Validate a pack ref before a load (eager or idle-first). */
  private assertLoadRef(pack: RenderPackRef): RenderPackRef {
    this.assertUsable('load')
    const ref = assertRenderPackRef(pack)
    if (!isHeroFormat(ref.format)) {
      throw new RenderBackendError(
        `hero backend cannot load format "${ref.format}" for pack "${ref.id}"; supported formats: [${HERO_PACK_FORMATS.join(', ')}]`,
      )
    }
    return ref
  }

  /** Start (and track) one load; concurrent callers share this promise. */
  private startPending(ref: RenderPackRef, mode: PackLoadMode, options: FirstFrameLoadOptions = {}): PendingLoad {
    const entry: PendingLoad = { ref, mode, promise: Promise.resolve() }
    entry.promise = (async () => {
      const installed = await this.buildSlot(ref, mode, options)
      this.slots.set(ref.id, installed.slot)
      if (installed.firstFrame) entry.firstFrame = installed.firstFrame
    })()
    this.pending.set(ref.id, entry)
    // Do not keep a failed/settled install in the de-dupe map; the original
    // promise still rejects to every awaiter.
    entry.promise
      .finally(() => {
        if (this.pending.get(ref.id) === entry) this.pending.delete(ref.id)
      })
      .catch(() => {})
    return entry
  }

  /** Validate/fetch frames and build one (private stage + renderer) slot. */
  private async buildSlot(ref: RenderPackRef, mode: PackLoadMode, options: FirstFrameLoadOptions): Promise<InstalledPack> {
    const loaded = await this.readPack(ref)
    let stage: HTMLCanvasElement
    let renderer: CharacterRenderer
    let firstFrame: FirstFrameLoadResult | null = null
    try {
      stage = this.createCanvas()
      renderer = new CharacterRenderer(stage, { scale: STAGE_SCALE })
      if (mode === 'first') {
        const info = await renderer.loadFirst(loaded, {
          ...(options.priorityTags !== undefined ? { priorityTags: options.priorityTags } : {}),
        })
        firstFrame = { packId: ref.id, readyTags: info.readyTags, pendingFrames: info.pendingFrames }
      } else {
        await renderer.load(loaded)
      }
    } catch (error) {
      throw new RenderBackendError(
        `hero backend: failed to prepare stage/frames for pack "${ref.id}": ${messageOf(error)}`,
        { cause: error },
      )
    }
    if (this.disposed) {
      // dispose() won while images were loading; do not leak the stage.
      renderer.destroy()
      throw new RenderBackendError(`hero backend cannot load: already disposed`)
    }
    return { slot: { ref, pack: loaded, stage, renderer }, firstFrame }
  }

  /** Decode every queued frame of one slot (an eager `load()` after `loadFirst()`). */
  private async settleSlot(slot: HeroSlot): Promise<void> {
    let guard = 0
    while (!this.disposed && slot.renderer.hasPendingFrames()) {
      const batch = await slot.renderer.decodeBatch(8)
      if (batch.decoded === 0) return
      this.decodeRevision += 1
      guard += 1
      if (guard > 4096) return
    }
  }

  /** First-frame summary of an already installed slot (idle-first re-entry). */
  private firstFrameInfoOf(slot: HeroSlot): FirstFrameLoadResult {
    return {
      packId: slot.pack.id,
      readyTags: slot.renderer.readyTags(),
      pendingFrames: slot.renderer.pendingFrameCount,
    }
  }

  /** Validate/fetch one pack into the renderer-agnostic runtime shape. */
  private async readPack(ref: RenderPackRef): Promise<LoadedCharacterPack> {
    let loaded: LoadedCharacterPack
    if (ref.data !== undefined) {
      let data: ReturnType<typeof validateCharacterPack>
      try {
        data = validateCharacterPack(ref.data)
      } catch (error) {
        throw new RenderBackendError(
          `hero backend: invalid data for pack "${ref.id}": ${messageOf(error)}`,
          { cause: error },
        )
      }
      if (data.id !== ref.id) {
        throw new RenderBackendError(
          `hero backend: pack id mismatch: ref id "${ref.id}" but manifest id "${data.id}"`,
        )
      }
      try {
        loaded = describeCharacterPack(data, ref.locator)
      } catch (error) {
        // e.g. a relative locator outside a browser cannot resolve asset URLs.
        throw new RenderBackendError(
          `hero backend: cannot resolve asset URLs for pack "${ref.id}" from locator "${ref.locator}": ${messageOf(error)}`,
          { cause: error },
        )
      }
    } else {
      try {
        loaded = await loadCharacterPack(ref.locator, this.fetcher)
      } catch (error) {
        throw new RenderBackendError(
          `hero backend: failed to load pack "${ref.id}" from "${ref.locator}": ${messageOf(error)}`,
          { cause: error },
        )
      }
      if (loaded.id !== ref.id) {
        throw new RenderBackendError(
          `hero backend: pack id mismatch: ref id "${ref.id}" but manifest id "${loaded.id}"`,
        )
      }
    }
    return loaded
  }

  private requireTag(slot: HeroSlot, tag: string): CharacterTag {
    try {
      return resolveTag(slot.pack, tag)
    } catch (error) {
      throw new RenderBackendError(
        `hero backend: ${messageOf(error)} (pack "${slot.pack.id}")`,
        { cause: error },
      )
    }
  }

  private requireSlot(pack: RenderPackRef): HeroSlot {
    const slot = this.slots.get(pack.id)
    if (!slot) {
      throw new RenderBackendError(
        `hero backend: pack "${pack.id}" is not loaded; call load(pack) before render()`,
      )
    }
    this.assertSameRef(slot.ref, pack, 'already loaded')
    return slot
  }

  /** Reject reusing one pack id with another locator/format (stale-slot guard). */
  private assertSameRef(loaded: RenderPackRef, requested: RenderPackRef, state: string): void {
    if (loaded.locator !== requested.locator || loaded.format !== requested.format) {
      throw new RenderBackendError(
        `hero backend: pack "${requested.id}" is ${state} from "${loaded.locator}" (format "${loaded.format}"), refusing "${requested.locator}" (format "${requested.format}")`,
      )
    }
  }

  private assertUsable(action: 'load' | 'render' | 'hitTest' | 'decode'): void {
    if (this.disposed) throw new RenderBackendError(`hero backend cannot ${action}: already disposed`)
  }
}

/**
 * Build a hero renderer plugin. Options are for tests/embedders; the exported
 * singleton `heroRendererPlugin` uses production defaults.
 */
export function createHeroRendererPlugin(options: HeroRenderBackendOptions = {}): RendererPlugin {
  return {
    id: 'hero',
    apiVersion: RENDER_API_HOST_VERSION,
    origin: 'first-party',
    name: 'hero.ts CharacterRenderer (Canvas2D pixel packs)',
    // FCI v0.2: declare the pack formats this plugin claims so hosts can
    // validate character `render.format` without instantiating a backend.
    formats: HERO_PACK_FORMATS,
    capabilities: {
      // hero.ts draws frames into a private stage canvas, then blits it.
      offscreenComposite: true,
      hitTest: true,
      // Render API v1.3: the stage is resized to `pack.canvas * view.scale`, so
      // integer reciprocal downscales (1/2,1/4,1/8) are supported and crisp.
      reciprocalScale: true,
    },
    match(pack) {
      return isHeroFormat(pack.format)
    },
    create() {
      return new HeroRenderBackend(options)
    },
  }
}

/**
 * The first-party hero renderer plugin — register this in the host's
 * `RendererRegistry` alongside any future Live2D/Spine plugins.
 */
export const heroRendererPlugin: RendererPlugin = createHeroRendererPlugin()
