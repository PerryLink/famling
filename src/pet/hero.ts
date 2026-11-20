/**
 * Minimal hero-pixel renderer for the pet window / Famling shells.
 *
 * The renderer owns pixels only: no kernel, save, voice, DOM chrome or business
 * logic. It follows the CharacterRenderer contract in Famling `PLATFORM.md`:
 * load(pack), play(tag), setExpression, setMouth, setPosition, hitTest, destroy.
 *
 * Canvas/scale policy (64..1024 art px, multiple of 16; 1×/2×/4× upscale and
 * 1/2, 1/4, 1/8 reciprocal downscale) lives in `pixel-scale.ts` and is shared
 * with the render layer and the scene runtime. The canvas backing store is
 * `pack.canvas * displayScale` and is always an integer; downscales stay crisp
 * (`imageSmoothingEnabled = false`) instead of blurring.
 */
import {
  canvasSizeProblem,
  isPixelScale,
  legacyCanvasSizeProblem,
  scaledCanvasSize,
  assertCharacterPackDecodeBudget,
  unsupportedScaleMessage,
  type PixelScale,
} from './pixel-scale.ts'

export type CharacterStyle = 'pixel-hero' | 'pixel-micro' | 'hd-chibi'
export type CharacterPhase = '1a' | '1b' | 'later'
export type { PixelScale } from './pixel-scale.ts'

export interface CharacterTag {
  frames: number
  fps: number
  loop: boolean
  /** Per-frame hold durations (non-uniform clips such as attack/stretch). */
  holdMs?: readonly number[]
  /** Production phase; `deferred`/later tags still have placeholder frames. */
  phase?: CharacterPhase
}

export interface CharacterPackData {
  id: string
  style: CharacterStyle
  canvas: [number, number]
  anchor: { x: number; y: number; mode: string }
  footBox: { x: number; y: number; w: number; h: number }
  palette: string
  tags: Record<string, CharacterTag>
  assets: string[]
  license: string
  ai: { status: 'none' | 'concept' | 'final'; tool?: string }
  placeholder?: boolean
  sourceSpec?: string
  generator?: string
}

export interface LoadedCharacterPack extends CharacterPackData {
  baseUrl: string
  assetUrls: string[]
  /** asset URLs grouped by tag, in tag insertion order. */
  framesByTag: Record<string, string[]>
}

export class CharacterPackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CharacterPackError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new CharacterPackError(`${what} must be an object`)
  return value
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new CharacterPackError(`${what} must be a non-empty string`)
  return value
}

function requireFinite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new CharacterPackError(`${what} must be a finite number`)
  return value
}

function requirePositiveInt(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new CharacterPackError(`${what} must be a positive integer`)
  }
  return value
}

const STYLES: CharacterStyle[] = ['pixel-hero', 'pixel-micro', 'hd-chibi']
const PHASES: CharacterPhase[] = ['1a', '1b', 'later']
const AI_STATUSES: CharacterPackData['ai']['status'][] = ['none', 'concept', 'final']
export const EXPRESSIONS = ['calm', 'pleased', 'happy', 'sleepy', 'surprised', 'listening'] as const
export type Expression = (typeof EXPRESSIONS)[number]

export function validateCharacterPack(value: unknown): CharacterPackData {
  const raw = requireRecord(value, 'character pack')
  const id = requireString(raw.id, 'pack.id')
  const style = requireString(raw.style, 'pack.style') as CharacterStyle
  if (!STYLES.includes(style)) throw new CharacterPackError(`unsupported pack.style: ${style}`)
  const canvasRaw = raw.canvas
  if (!Array.isArray(canvasRaw) || canvasRaw.length !== 2) throw new CharacterPackError('pack.canvas must be [width,height]')
  // Shared policy (pixel-scale.ts): 64..1024 art px per side, multiple of 16 for
  // new packs; legacy hero.ts manifests are FCI 0.1-era data with no apiVersion,
  // so the frozen 16..512 integer range stays accepted (48/100 included).
  // Shipped 96 placeholders and the 256 humanoid target belong to the new range;
  // 4/1280 and non-integers are rejected with a readable reason.
  const canvasProblem = canvasSizeProblem(canvasRaw[0], canvasRaw[1])
  if (canvasProblem && legacyCanvasSizeProblem(canvasRaw[0], canvasRaw[1])) {
    throw new CharacterPackError(`pack.${canvasProblem}`)
  }
  const canvas: [number, number] = [requirePositiveInt(canvasRaw[0], 'pack.canvas[0]'), requirePositiveInt(canvasRaw[1], 'pack.canvas[1]')]
  const anchorRaw = requireRecord(raw.anchor, 'pack.anchor')
  const anchor = {
    x: requireFinite(anchorRaw.x, 'pack.anchor.x'),
    y: requireFinite(anchorRaw.y, 'pack.anchor.y'),
    mode: requireString(anchorRaw.mode, 'pack.anchor.mode'),
  }
  const footRaw = requireRecord(raw.footBox, 'pack.footBox')
  const footBox = {
    x: requireFinite(footRaw.x, 'pack.footBox.x'),
    y: requireFinite(footRaw.y, 'pack.footBox.y'),
    w: requireFinite(footRaw.w, 'pack.footBox.w'),
    h: requireFinite(footRaw.h, 'pack.footBox.h'),
  }
  const palette = requireString(raw.palette, 'pack.palette')
  const tagsRaw = requireRecord(raw.tags, 'pack.tags')
  const tagNames = Object.keys(tagsRaw)
  if (tagNames.length === 0) throw new CharacterPackError('pack.tags must not be empty')
  const animRaw = isRecord(raw.anim) ? raw.anim : null
  const animClips = animRaw && isRecord(animRaw.clips) ? animRaw.clips : null
  const tags: Record<string, CharacterTag> = {}
  let totalFrames = 0
  for (const name of tagNames) {
    const tagRaw = requireRecord(tagsRaw[name], `pack.tags.${name}`)
    const frames = requirePositiveInt(tagRaw.frames, `pack.tags.${name}.frames`)
    const fps = requireFinite(tagRaw.fps, `pack.tags.${name}.fps`)
    if (fps < 0) throw new CharacterPackError(`pack.tags.${name}.fps must be >= 0`)
    if (typeof tagRaw.loop !== 'boolean') throw new CharacterPackError(`pack.tags.${name}.loop must be boolean`)
    const tag: CharacterTag = { frames, fps, loop: tagRaw.loop }
    if (tagRaw.phase !== undefined) {
      const phase = requireString(tagRaw.phase, `pack.tags.${name}.phase`) as CharacterPhase
      if (!PHASES.includes(phase)) throw new CharacterPackError(`unsupported pack.tags.${name}.phase: ${phase}`)
      tag.phase = phase
    }
    const clipRaw = animClips && isRecord(animClips[name]) ? animClips[name] : null
    if (clipRaw && clipRaw.holdMs !== undefined) {
      if (!Array.isArray(clipRaw.holdMs) || clipRaw.holdMs.length !== frames) {
        throw new CharacterPackError(`pack.anim.clips.${name}.holdMs length must equal frames`)
      }
      const holds = clipRaw.holdMs.map((value, index) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          throw new CharacterPackError(`pack.anim.clips.${name}.holdMs[${index}] must be a positive finite number`)
        }
        return value
      })
      tag.holdMs = holds
    }
    tags[name] = tag
    totalFrames += frames
  }
  if (!Array.isArray(raw.assets) || raw.assets.length === 0) throw new CharacterPackError('pack.assets must be a non-empty array')
  const assets = raw.assets.map((asset, index) => requireString(asset, `pack.assets[${index}]`))
  if (assets.length !== totalFrames) {
    throw new CharacterPackError(`pack.assets length ${assets.length} != total tag frames ${totalFrames}`)
  }
  const license = requireString(raw.license, 'pack.license')
  const aiRaw = requireRecord(raw.ai, 'pack.ai')
  const status = requireString(aiRaw.status, 'pack.ai.status') as CharacterPackData['ai']['status']
  if (!AI_STATUSES.includes(status)) throw new CharacterPackError(`unsupported pack.ai.status: ${status}`)
  const ai: CharacterPackData['ai'] = { status }
  if (aiRaw.tool !== undefined) ai.tool = requireString(aiRaw.tool, 'pack.ai.tool')
  return {
    id,
    style,
    canvas,
    anchor,
    footBox,
    palette,
    tags,
    assets,
    license,
    ai,
    ...(raw.placeholder === true ? { placeholder: true } : {}),
    ...(typeof raw.sourceSpec === 'string' ? { sourceSpec: raw.sourceSpec } : {}),
    ...(typeof raw.generator === 'string' ? { generator: raw.generator } : {}),
  }
}

/**
 * Build the runtime form of an already-validated pack without fetching its
 * manifest. Additive adapter used by the first-party render-plugin layer
 * (`src/pet/render/hero-backend.ts`) when the host has already parsed and
 * validated the pack JSON; `loadCharacterPack()` keeps the same behaviour.
 */
export function describeCharacterPack(data: CharacterPackData, baseUrl: string): LoadedCharacterPack {
  const base = baseUrl.replace(/\/+$/, '')
  const assetUrls = data.assets.map((asset) => new URL(asset, `${base}/`).toString())
  const framesByTag: Record<string, string[]> = {}
  let cursor = 0
  for (const [tag, meta] of Object.entries(data.tags)) {
    framesByTag[tag] = assetUrls.slice(cursor, cursor + meta.frames)
    cursor += meta.frames
  }
  return { ...data, baseUrl: base, assetUrls, framesByTag }
}

export async function loadCharacterPack(baseUrl: string, fetcher: typeof fetch = fetch): Promise<LoadedCharacterPack> {
  const base = baseUrl.replace(/\/+$/, '')
  const response = await fetcher(`${base}/manifest.json`)
  if (!response.ok) throw new CharacterPackError(`failed to load pack manifest: HTTP ${response.status}`)
  const data = validateCharacterPack((await response.json()) as unknown)
  return describeCharacterPack(data, base)
}

export function resolveTag(pack: CharacterPackData, tag: string): CharacterTag {
  const meta = pack.tags[tag]
  if (!meta) throw new CharacterPackError(`unknown tag: ${tag}`)
  return meta
}

export function assertIntegerScale(scale: number): asserts scale is PixelScale {
  if (!isPixelScale(scale)) throw new CharacterPackError(unsupportedScaleMessage(scale, 'display scale'))
}

/** Frame index for elapsed milliseconds at a tag's fps; non-looping tags clamp on the last frame. */
export function frameIndexFor(meta: CharacterTag, elapsedMs: number, loop = meta.loop): number {
  const frames = Math.max(1, meta.frames)
  if (frames === 1) return 0
  const elapsed = Math.max(0, elapsedMs)
  // Non-uniform clips (attack, cat stretch) hold individual frames for their
  // authored durations instead of assuming 1000/fps for every frame.
  const holds = meta.holdMs
  if (holds && holds.length === frames) {
    const total = holds.reduce((sum, hold) => sum + Math.max(0, hold), 0)
    if (total <= 0) return 0
    let cursor = loop ? elapsed % total : Math.min(elapsed, total - 0.0001)
    for (let index = 0; index < frames; index += 1) {
      const hold = Math.max(0, holds[index] ?? 0)
      if (cursor < hold) return index
      cursor -= hold
    }
    return frames - 1
  }
  const offset = Math.floor((elapsed / 1000) * meta.fps)
  if (loop) return ((offset % frames) + frames) % frames
  return Math.min(frames - 1, offset)
}

/**
 * Tags the renderer decodes before it commits the first frame.
 *
 * Shipped packs put the looping idle pose first (6–8 frames at 96²); the
 * first-frame gate only needs that clip, not the 68–144 frames of the whole
 * pack. `requested` lets the host prefer a specific tag (e.g. `sleep`), but
 * `idle` always wins when present because it is the boot pose.
 */
export function firstFrameTags(
  pack: Pick<CharacterPackData, 'tags'>,
  requested: readonly string[] = [],
): string[] {
  const available = Object.keys(pack.tags)
  const picked: string[] = []
  const add = (tag: string | undefined): void => {
    if (tag === undefined || !available.includes(tag)) return
    if (!picked.includes(tag)) picked.push(tag)
  }
  add('idle')
  for (const tag of requested) add(tag)
  if (picked.length > 0) return picked
  // Pack without an `idle` tag (concept/debug packs): first animated looping
  // tag, else the first declared tag — the gate still needs one drawable pose.
  const looping = available.find((tag) => {
    const meta = pack.tags[tag]
    return meta !== undefined && meta.loop && meta.fps > 0 && meta.frames > 1
  })
  add(looping ?? available[0])
  return picked
}

/**
 * Milliseconds from `elapsedMs` until the clip's next visible frame.
 *
 * Used by the on-demand frame scheduler: idle clips (6–14 fps) advertise their
 * next frame boundary so the host can wake exactly then (or at its idle cap)
 * instead of redrawing at 60 Hz. `Infinity` means "this tag cannot change on
 * its own" (single frame, fps 0, or a clamped one-shot that is already over).
 */
export function msUntilNextFrame(meta: CharacterTag, elapsedMs: number, loop = meta.loop): number {
  const frames = Math.max(1, meta.frames)
  if (frames <= 1) return Infinity
  const elapsed = Math.max(0, elapsedMs)
  const holds = meta.holdMs && meta.holdMs.length === frames ? meta.holdMs : null
  if (holds) {
    const holdMs = holds.map((hold) => Math.max(0, hold))
    const total = holdMs.reduce((sum, hold) => sum + hold, 0)
    if (total <= 0) return Infinity
    let cursor = loop ? elapsed % total : Math.min(elapsed, total)
    if (!loop && cursor >= total) return Infinity
    for (const hold of holdMs) {
      if (cursor < hold) return hold - cursor
      cursor -= hold
    }
    return Infinity
  }
  const fps = meta.fps
  if (!Number.isFinite(fps) || fps <= 0) return Infinity
  const period = 1000 / fps
  if (!loop && elapsed >= period * (frames - 1)) return Infinity
  const offset = Math.floor(elapsed / period)
  const remaining = (offset + 1) * period - elapsed
  return remaining > 0 ? remaining : period
}

/**
 * One decoded-or-pending frame. `image` is null until the frame is decoded;
 * `ready` is the single source of truth `isFrameReady()` reads.
 */
interface FrameSlot {
  readonly url: string
  image: HTMLImageElement | null
  ready: boolean
}

/** Frame slots grouped by tag, in pack tag order. */
interface TagFrameSlots {
  readonly meta: CharacterTag
  readonly frames: FrameSlot[]
}

/** Options for `CharacterRenderer.loadFirst()`. */
export interface CharacterFirstFrameOptions {
  /** Tags to decode before resolving; default: `firstFrameTags(pack)` (idle). */
  readonly priorityTags?: readonly string[]
}

/** Result of the idle-first load: what is drawable now, what is still pending. */
export interface CharacterFirstFrameInfo {
  readonly readyTags: readonly string[]
  readonly pendingTags: readonly string[]
  readonly pendingFrames: number
}

/** One background decode batch (a few frames, bounded to keep callbacks short). */
export interface CharacterDecodeBatchInfo {
  readonly decoded: number
  readonly readyTags: readonly string[]
  readonly pendingFrames: number
  readonly done: boolean
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new CharacterPackError(`failed to load frame: ${url}`))
    image.src = url
  })
}

export class CharacterRenderer {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private pack: LoadedCharacterPack | null = null
  /** Frame slots per tag (URLs known from the pack, images decoded lazily). */
  private tagFrames: Map<string, TagFrameSlots> | null = null
  /**
   * Frames still waiting to be decoded, in decode order. `loadFirst()` fills
   * this with every non-priority frame; `decodeBatch()` consumes a few per
   * call (requestIdleCallback-friendly) and `prioritizeTag()` moves a clip that
   * is about to become visible to the front.
   */
  private pendingFrames: Array<{ readonly tag: string; readonly index: number }> = []
  /** Memoized "all frames of this tag decoded" answers; cleared on decode. */
  private readonly tagReadyCache = new Map<string, boolean>()
  private currentTag: string | null = null
  private currentFrame = 0
  private loop = true
  private speed = 1
  private startedAt = 0
  private raf: number | null = null
  private scale: PixelScale
  private expression: Expression = 'calm'
  private mouth = 0
  private position = { x: 0, y: 0 }
  private sampleCanvas: HTMLCanvasElement | null = null

  constructor(canvas: HTMLCanvasElement, options: { scale?: PixelScale } = {}) {
    const context = canvas.getContext('2d')
    if (!context) throw new CharacterPackError('canvas 2d context unavailable')
    this.canvas = canvas
    this.ctx = context
    this.scale = options.scale ?? 2
    assertIntegerScale(this.scale)
    canvas.style.imageRendering = 'pixelated'
  }

  /**
   * Load every frame of a pack (eager path, unchanged semantics). Resolves only
   * when the whole pack is drawable, so `play(tag)` never hits an undecoded
   * frame. First-party hosts use `loadFirst()` for the boot gate instead.
   */
  async load(pack: LoadedCharacterPack): Promise<void> {
    this.prepare(pack)
    assertCharacterPackDecodeBudget(pack.canvas, pack.assetUrls.length, 'character pack "' + pack.id + '"')
    await this.decodeAllPending()
    this.currentTag = Object.keys(pack.tags)[0] ?? null
    this.currentFrame = 0
    this.resize()
    this.renderFrame(0)
  }

  /**
   * Idle-first load used by the first-frame gate: decode only the boot clip
   * (6–8 `idle` frames) and paint its first frame, leaving every other clip
   * queued. Resolving means "the first frame is drawable"; the caller feeds
   * `decodeBatch()` from requestIdleCallback, so boot never waits for all
   * 68–144 frames (a third-party 1024² pack is up to ~576 MiB RGBA).
   *
   * A tag that is not decoded yet must keep the previous (idle) pose instead of
   * flashing a wrong frame: `isTagReady()`/`renderStill()` tell the caller what
   * is drawable, `prioritizeTag()` moves the clip that is about to become
   * visible to the front, and `decodeTag()` is the on-demand wait for the
   * first play of a non-idle clip.
   */
  async loadFirst(
    pack: LoadedCharacterPack,
    options: CharacterFirstFrameOptions = {},
  ): Promise<CharacterFirstFrameInfo> {
    this.prepare(pack)
    assertCharacterPackDecodeBudget(pack.canvas, pack.assetUrls.length, 'character pack "' + pack.id + '"')
    const priority = firstFrameTags(pack, options.priorityTags ?? [])
    if (priority.length === 0) throw new CharacterPackError('pack has no frames to decode')
    await this.decodeEntries(priority.flatMap((tag) => this.pendingEntriesFor(tag)))
    this.currentTag = priority[0]!
    this.currentFrame = 0
    this.resize()
    this.renderFrame(0)
    return this.firstFrameInfo()
  }

  /** Decode up to `maxFrames` queued frames (one idle-batch worth). */
  async decodeBatch(maxFrames = 2): Promise<CharacterDecodeBatchInfo> {
    this.assertLoaded('decodeBatch()')
    const limit = Number.isFinite(maxFrames) ? Math.max(1, Math.floor(maxFrames)) : this.pendingFrames.length
    const entries = this.pendingFrames.slice(0, limit)
    if (entries.length > 0) await this.decodeEntries(entries)
    return {
      decoded: entries.length,
      readyTags: this.readyTags(),
      pendingFrames: this.pendingFrames.length,
      done: this.pendingFrames.length === 0,
    }
  }

  /** Decode every still-pending frame now (hosts that want an all-warm pack). */
  async decodeAllPending(): Promise<void> {
    if (this.pendingFrames.length === 0) return
    await this.decodeEntries([...this.pendingFrames])
  }

  /** Decode one tag on demand (legacy `play()` waits for its clip this way). */
  async decodeTag(tag: string): Promise<void> {
    this.assertLoaded('decodeTag()')
    if (this.isTagReady(tag)) return
    await this.decodeEntries(this.pendingEntriesFor(tag))
  }

  /** Move a clip that is about to become visible to the front of the queue. */
  prioritizeTag(tag: string): boolean {
    if (!this.tagFrames || !this.tagFrames.has(tag)) return false
    const entries = this.pendingEntriesFor(tag)
    if (entries.length === 0) return false
    if (this.pendingFrames[0]?.tag === tag) return false
    const rest = this.pendingFrames.filter((entry) => entry.tag !== tag)
    this.pendingFrames = [...entries, ...rest]
    return true
  }

  /** Tags whose every frame is decoded (drawable without visual holds). */
  readyTags(): string[] {
    if (!this.tagFrames) return []
    return [...this.tagFrames.keys()].filter((tag) => this.isTagReady(tag))
  }

  /** Frames still queued for decoding (0 = the whole pack is drawable). */
  get pendingFrameCount(): number {
    return this.pendingFrames.length
  }

  hasPendingFrames(): boolean {
    return this.pendingFrames.length > 0
  }

  isFrameReady(tag: string, index: number): boolean {
    const frame = this.tagFrames?.get(tag)?.frames[index]
    return frame?.ready === true && frame.image !== null
  }

  /** True when every frame of the tag is decoded (safe to start the clip). */
  isTagReady(tag: string): boolean {
    const cached = this.tagReadyCache.get(tag)
    if (cached !== undefined) return cached
    const frames = this.tagFrames?.get(tag)?.frames
    if (!frames) return false
    const ready = frames.every((frame) => frame.ready && frame.image !== null)
    this.tagReadyCache.set(tag, ready)
    return ready
  }

  /**
   * Redraw a last-good pose when the requested clip is not decoded yet:
   * preferred tags first, then `idle`, then the current tag, then any ready
   * frame. Returns false only when no frame is ready at all (impossible after
   * the first-frame gate).
   */
  renderHold(preferredTags: readonly string[] = []): boolean {
    if (!this.pack || !this.tagFrames) return false
    const candidates = [...preferredTags, 'idle', this.currentTag ?? '', ...this.tagFrames.keys()]
    for (const tag of candidates) {
      if (!tag || !this.tagFrames.has(tag) || !this.isFrameReady(tag, 0)) continue
      this.currentTag = tag
      this.currentFrame = 0
      this.resize()
      return this.renderFrame(0)
    }
    return false
  }

  async play(tag: string, options: { loop?: boolean; speed?: number } = {}): Promise<void> {
    if (!this.pack) throw new CharacterPackError('load(pack) before play(tag)')
    const meta = resolveTag(this.pack, tag)
    if (!this.tagFrames?.has(tag)) throw new CharacterPackError(`tag has no frames: ${tag}`)
    // On-demand wait: a partially decoded pack starts a non-idle clip only once
    // all of its frames are decoded, so playback can never show a held frame.
    if (!this.isTagReady(tag)) await this.decodeTag(tag)
    if (!this.pack || !this.tagFrames) throw new CharacterPackError('renderer destroyed while decoding')
    if (!this.isTagReady(tag)) throw new CharacterPackError(`tag is not decodable: ${tag}`)
    this.currentTag = tag
    this.loop = options.loop ?? meta.loop
    this.speed = options.speed ?? 1
    this.startedAt = performance.now()
    this.currentFrame = 0
    this.renderFrame(0)
    this.stop()
    const tick = (now: number): void => {
      if (!this.pack || !this.currentTag) return
      const currentMeta = resolveTag(this.pack, this.currentTag)
      const frame = frameIndexFor(currentMeta, (now - this.startedAt) * this.speed, this.loop)
      if (frame !== this.currentFrame) {
        this.currentFrame = frame
        this.renderFrame(frame)
      }
      if (!this.loop && frame >= currentMeta.frames - 1) {
        this.raf = null
        return
      }
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  /**
   * Draw one still frame without starting the animation loop (Look Test/QA).
   * Returns false when that frame is not decoded yet: the canvas keeps the
   * previous pose instead of clearing or drawing a different frame.
   */
  renderStill(tag: string, frame = 0): boolean {
    if (!this.pack) throw new CharacterPackError('load(pack) before renderStill(tag)')
    const meta = resolveTag(this.pack, tag)
    if (!this.tagFrames?.has(tag)) throw new CharacterPackError(`tag has no frames: ${tag}`)
    this.currentTag = tag
    this.currentFrame = Math.max(0, Math.min(meta.frames - 1, Math.floor(frame)))
    this.resize()
    return this.renderFrame(this.currentFrame)
  }

  setScale(scale: PixelScale): void {
    assertIntegerScale(scale)
    this.scale = scale
    if (this.pack) {
      this.resize()
      // A reallocated backing store is blank; redraw the current frame, or the
      // last good pose while the pack is still decoding.
      if (!this.renderFrame(this.currentFrame)) this.renderHold()
    }
  }

  getScale(): PixelScale {
    return this.scale
  }

  setExpression(name: string): void {
    if (!(EXPRESSIONS as readonly string[]).includes(name)) throw new CharacterPackError(`unknown expression: ${name}`)
    this.expression = name as Expression
  }

  getExpression(): Expression {
    return this.expression
  }

  setMouth(level: number): void {
    if (!Number.isFinite(level)) throw new CharacterPackError('mouth level must be finite')
    this.mouth = Math.max(0, Math.min(1, level))
  }

  setPosition(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new CharacterPackError('position must be finite')
    this.position = { x, y }
    this.canvas.style.transform = `translate(${x}px, ${y}px)`
  }

  /** Alpha hit test in CSS pixels relative to the canvas top-left. */
  hitTest(x: number, y: number): boolean {
    if (!this.tagFrames || !this.currentTag) return false
    const frame = this.tagFrames.get(this.currentTag)?.frames[this.currentFrame]
    const image = frame?.image ?? null
    if (!image) return false
    // Canvas-local CSS px → art px. Works for upscales (1/2/4) and integer
    // reciprocal downscales (1/2, 1/4, 1/8): a 1024px canvas at 1/4 maps a
    // 256px actor box back onto 1024 art pixels.
    const artX = Math.floor(x / this.scale)
    const artY = Math.floor(y / this.scale)
    if (!this.pack) return false
    const [width, height] = this.pack.canvas
    if (artX < 0 || artY < 0 || artX >= width || artY >= height) return false
    const sample = this.ensureSampleCanvas()
    const sampleCtx = sample.getContext('2d')
    if (!sampleCtx) return false
    sampleCtx.clearRect(0, 0, width, height)
    sampleCtx.drawImage(image, 0, 0)
    return sampleCtx.getImageData(artX, artY, 1, 1).data[3]! > 0
  }

  stop(): void {
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf)
      this.raf = null
    }
  }

  destroy(): void {
    this.stop()
    this.tagFrames = null
    this.pack = null
    this.pendingFrames = []
    this.tagReadyCache.clear()
    this.canvas.width = 0
    this.canvas.height = 0
  }

  /** Install the pack and build one frame slot per asset (no decode yet). */
  private prepare(pack: LoadedCharacterPack): void {
    const tagFrames = new Map<string, TagFrameSlots>()
    const pending: Array<{ readonly tag: string; readonly index: number }> = []
    for (const [tag, meta] of Object.entries(pack.tags)) {
      const urls = pack.framesByTag[tag]
      if (!urls || urls.length !== meta.frames) {
        throw new CharacterPackError(`pack has no frame list for tag: ${tag}`)
      }
      const frames: FrameSlot[] = urls.map((url) => ({ url, image: null, ready: false }))
      tagFrames.set(tag, { meta, frames })
      for (let index = 0; index < frames.length; index += 1) pending.push({ tag, index })
    }
    this.pack = pack
    this.tagFrames = tagFrames
    this.pendingFrames = pending
    this.tagReadyCache.clear()
    this.currentTag = null
    this.currentFrame = 0
  }

  private assertLoaded(action: string): void {
    if (!this.pack || !this.tagFrames) throw new CharacterPackError(`load(pack) before ${action}`)
  }

  private pendingEntriesFor(tag: string): Array<{ readonly tag: string; readonly index: number }> {
    return this.pendingFrames.filter((entry) => entry.tag === tag)
  }

  private firstFrameInfo(): CharacterFirstFrameInfo {
    return {
      readyTags: this.readyTags(),
      pendingTags: [...new Set(this.pendingFrames.map((entry) => entry.tag))],
      pendingFrames: this.pendingFrames.length,
    }
  }

  /**
   * Decode one batch of frame entries. Entries are claimed (removed from the
   * queue) synchronously before the first await, so two overlapping batches can
   * never decode the same frame twice.
   */
  private async decodeEntries(entries: Array<{ readonly tag: string; readonly index: number }>): Promise<void> {
    if (entries.length === 0) return
    const claimed = new Set(entries.map((entry) => `${entry.tag}#${entry.index}`))
    this.pendingFrames = this.pendingFrames.filter((entry) => !claimed.has(`${entry.tag}#${entry.index}`))
    await Promise.all(
      entries.map(async (entry) => {
        const slot = this.tagFrames?.get(entry.tag)?.frames[entry.index]
        if (!slot) throw new CharacterPackError(`missing frame slot: ${entry.tag}[${entry.index}]`)
        if (slot.ready) return
        slot.image = await loadImage(slot.url)
        slot.ready = true
      }),
    )
    this.tagReadyCache.clear()
  }

  private ensureSampleCanvas(): HTMLCanvasElement {
    if (!this.sampleCanvas) this.sampleCanvas = document.createElement('canvas')
    if (!this.pack) return this.sampleCanvas
    if (this.sampleCanvas.width !== this.pack.canvas[0] || this.sampleCanvas.height !== this.pack.canvas[1]) {
      this.sampleCanvas.width = this.pack.canvas[0]
      this.sampleCanvas.height = this.pack.canvas[1]
    }
    return this.sampleCanvas
  }

  private resize(): void {
    if (!this.pack) return
    // Integer backing store: 64..1024 art px (multiple of 16) × supported scale
    // is always an integer. CSS size matches the backing store 1:1; any further
    // window/DPR scaling is the host's concern (`image-rendering: pixelated`).
    const size = scaledCanvasSize(this.pack.canvas, this.scale)
    // Reassigning canvas.width/height clears the backing store and forces a
    // reallocation; a still frame with the same size must not do that per rAF.
    if (this.canvas.width === size.width && this.canvas.height === size.height) return
    this.canvas.width = size.width
    this.canvas.height = size.height
    this.canvas.style.width = `${size.width}px`
    this.canvas.style.height = `${size.height}px`
    this.ctx.imageSmoothingEnabled = false
  }

  /** Draw one frame; false when that frame is not decoded yet (canvas held). */
  private renderFrame(index: number): boolean {
    if (!this.pack || !this.currentTag || !this.tagFrames) return false
    const frame = this.tagFrames.get(this.currentTag)?.frames[index]
    const image = frame?.image ?? null
    if (!frame?.ready || image === null) return false
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.ctx.imageSmoothingEnabled = false
    this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height)
    return true
  }
}
