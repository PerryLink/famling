/**
 * Character-pack renderer adapter — the module-only bridge from the
 * `famling.pet-anim/0.2` runtime (`character-packs.ts`) to the already-shipped
 * hero renderer layer (`hero.ts` / `render/hero-backend.ts` /
 * `hero-runtime.ts`).
 *
 * What this module does (MB-041 renderer integration, pure logic only):
 * - `describeCharacterPackRender()` is a deterministic, side-effect-free
 *   conversion from one runtime character (`art` + `behavior` + `regions`)
 *   into the frame/URL description the hero layer consumes:
 *   - a `hero.ts` `CharacterPackData` (canvas/anchor/footBox/palette + tags +
 *     assets) re-validated with `validateCharacterPack()`, whose `assets` are
 *     the resolved absolute frame URLs (pack-relative paths are resolved from
 *     the handle's `assetUrls`/`assetBase`, exactly like `hero-runtime.ts`
 *     resolves `character.json.packBase`);
 *   - a `RenderPackRef` (`format: 'pixel-hero'`) carrying that parsed data, so
 *     `render/hero-backend.ts` never re-fetches a manifest;
 *   - an FCI `LoadedCharacter` + `HeroCharacterBundle` synthesized from the
 *     pack, so `HeroRuntime` can spawn/render a data-driven character without
 *     a `public/characters/<id>/` directory;
 *   - the flat per-frame table (`clip`/`index`/`path`/`url`) and the
 *     per-tag URL table for QA/UI.
 * - `CharacterPackRendererAdapter` is the stateful load/release/failure-
 *   recovery bookkeeping around an injected host boundary: it loads the new
 *   pack before releasing the old one (different pack ids), releases before
 *   reloading when a pack-id identity changes (same pack id, new version),
 *   keeps the previous character loaded when a load fails, and re-loads the
 *   previous character when a same-id version switch already had to release it
 *   (fail closed with a `restore-failed` code if even that reload fails).
 *
 * Hard boundary (do not extend without updating these notes):
 * - NO DOM/canvas, NO `fetch`, NO Tauri/Node filesystem, NO renderer import:
 *   every effect goes through the injected `CharacterPackRenderHost`;
 * - NOT wired into `main.ts`/`desktop-shell.ts`/`content-hub.ts` (task
 *   boundary); nothing here changes the pet page, the hero flag or storage;
 * - it never invents licence or AI provenance: both must come from the pack
 *   handle, otherwise the conversion fails closed (`missing-provenance`);
 * - it does not implement a second pack schema validator: the hero data is
 *   checked with `hero.ts` `validateCharacterPack()`, the FCI document with
 *   `character/validate.ts` `validateCharacterDocument()`, and the behavior
 *   tag coverage with `character/behavior.ts` `missingTags()`.
 */
import {
  describeCharacterPack,
  validateCharacterPack,
  type CharacterPackData,
  type CharacterTag,
} from './hero.ts'
import { missingTags } from './character/behavior.ts'
import { validateCharacterDocument } from './character/validate.ts'
import type { BehaviorProfile, CharacterDocument } from './character/index.ts'
import type { HeroCharacterBundle } from './hero-runtime.ts'
import type { RenderPackRef } from './render/index.ts'
import type { HeroRegionConfig } from './anim/regions.ts'
import { CLIP_IDS } from './anim/types.ts'
import type { CharacterPackActiveCharacter, CharacterPackArtHandle } from './character-packs.ts'
import type { CharacterPackKind } from './content-library.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** The one hero renderer format this adapter produces (`render/hero-backend.ts`). */
export const CHARACTER_PACK_RENDER_FORMAT = 'pixel-hero' as const

/**
 * Synthetic locator prefix used only when the host gives no resolvable
 * `assetBase` and all frame URLs already are absolute (e.g. blob: preview URLs
 * from the browser installer). It is an identity string for
 * `RenderPackRef.locator` — never a fetchable URL and never shown to users.
 * It includes the version so a same-pack version switch is observable by the
 * hero backend's stale-slot guard instead of silently reusing old frames.
 */
export const CHARACTER_PACK_SYNTHETIC_LOCATOR_PREFIX = 'famling-pack:'

/** Image URL schemes the adapter accepts for resolved frame/preview assets. */
const SAFE_ASSET_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'blob:', 'data:', 'file:'])

const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/
const MAX_HINT_CHARS = 512
const MAX_PROVENANCE_CHARS = 128
const TAG_NAME_PATTERN = /^[a-z][a-z0-9_]{0,31}$/
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/
const CHARACTER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const CHARACTER_PACK_KINDS: readonly CharacterPackKind[] = ['cat', 'dog', 'humanoid']
const AI_STATUSES = ['none', 'concept', 'final'] as const
type RenderAiStatus = (typeof AI_STATUSES)[number]

// ---------------------------------------------------------------------------
// Public types — conversion
// ---------------------------------------------------------------------------

/**
 * The runtime slice the adapter needs. `CharacterPackBuiltin` and
 * `CharacterPackActiveCharacter` both satisfy it, so built-ins and installed
 * packs go through the same conversion.
 */
export type CharacterPackRenderSource = Pick<
  CharacterPackActiveCharacter,
  'packId' | 'version' | 'characterId' | 'name' | 'kind' | 'art' | 'behavior' | 'regions'
>

/** One clip frame, in tag order, with both the pack-relative path and the URL. */
export interface CharacterPackRenderFrame {
  /** Animation tag/clip id (canonical v0.2 clip order: see `CLIP_IDS`). */
  readonly clip: string
  /** 0-based frame index inside the clip. */
  readonly index: number
  /** Pack-relative path from the runtime handle (host I/O / QA / zip layout). */
  readonly path: string
  /** Absolute image URL the hero renderer can draw. */
  readonly url: string
}

/** Conversion failure codes (the adapter adds load/release lifecycle codes). */
export type CharacterPackRenderErrorCode =
  | 'invalid-source'
  | 'missing-clips'
  | 'invalid-clips'
  | 'missing-frame-paths'
  | 'frame-count-mismatch'
  | 'unresolved-assets'
  | 'missing-provenance'
  | 'missing-tags'
  | 'invalid-render-data'

/** Renderer-adapter failure codes = conversion codes + lifecycle codes. */
export type CharacterPackRendererErrorCode =
  | CharacterPackRenderErrorCode
  | 'busy'
  | 'disposed'
  | 'load-failed'
  | 'release-failed'
  | 'restore-failed'

/** Everything the hero layer needs for one character, plus the QA frame table. */
export interface CharacterPackRenderHandle {
  readonly packId: string
  readonly version: string
  readonly characterId: string
  readonly name: string
  readonly kind: CharacterPackKind
  readonly format: typeof CHARACTER_PACK_RENDER_FORMAT
  /**
   * `RenderPackRef.locator`: the resolved absolute asset base, or a stable
   * synthetic identity (`famling-pack:<packId>@<version>/`) when the host only
   * supplied absolute per-frame URLs.
   */
  readonly locator: string
  /** hero.ts pack data (validated by `validateCharacterPack`) with absolute assets. */
  readonly data: CharacterPackData
  /** Ready-to-load renderer reference (data pre-parsed; no manifest fetch). */
  readonly ref: RenderPackRef
  /** Tag order used for `data.tags`/`data.assets` (canonical `CLIP_IDS` subset). */
  readonly tags: readonly string[]
  /** Canonical clips present, in `CLIP_IDS` order. */
  readonly clips: readonly string[]
  /** Flat per-frame table (clip order, frame order). */
  readonly frames: readonly CharacterPackRenderFrame[]
  /** Absolute frame URLs per tag (same order as `data.tags`). */
  readonly framesByTag: Readonly<Record<string, readonly string[]>>
  /** HeroRuntime-ready bundle (synthesized FCI document + pack ref + regions). */
  readonly bundle: HeroCharacterBundle
  /** Validated tap regions from the runtime handle. */
  readonly regions: HeroRegionConfig
  /** Validated behavior profile from the runtime handle. */
  readonly behavior: BehaviorProfile
  /** Absolute preview URL when the host could resolve `art.preview`. */
  readonly previewUrl?: string
}

export type CharacterPackRenderResult =
  | { readonly ok: true; readonly render: CharacterPackRenderHandle }
  | { readonly ok: false; readonly code: CharacterPackRenderErrorCode; readonly message: string }

export interface CharacterPackRenderOptions {
  /**
   * Absolute page/app base used to resolve root-relative hints and a relative
   * `assetBase` (browser callers pass `location.href`, as
   * `hero-runtime.loadHeroBundle()` does with `resolveBase`). Omit it in pure
   * Node tests unless the handle already carries absolute asset URLs.
   */
  readonly resolveBase?: string
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

function renderFailure(code: CharacterPackRenderErrorCode, message: string): CharacterPackRenderResult {
  return { ok: false, code, message }
}

function hasScheme(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
}

function isRootRelative(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//')
}

function isProtocolRelative(value: string): boolean {
  return value.startsWith('//')
}

function isSafeHint(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_HINT_CHARS && !CONTROL_CHARS_PATTERN.test(value)
}

/**
 * Parse one absolute/relative hint into a safe image URL. Returns `null` rather
 * than throwing so every failure can carry a stable code + actionable message.
 * Scheme allow-listing matters: a pack must never be able to inject
 * `javascript:`/`vbscript:` style URLs into an `<img src>`.
 */
function parseAssetUrl(raw: string, base: string | undefined): URL | null {
  let url: URL
  try {
    url = base === undefined ? new URL(raw) : new URL(raw, base)
  } catch {
    return null
  }
  return SAFE_ASSET_SCHEMES.has(url.protocol) ? url : null
}

/** Resolve an asset-base hint to "absolute URL directory" form (trailing slash). */
function resolveAssetBase(raw: unknown, resolveBase: string | undefined): string | null {
  if (!isSafeHint(raw)) return null
  const url = parseAssetUrl(raw, resolveBase)
  if (url === null) return null
  if (url.search !== '' || url.hash !== '') return null
  const text = url.toString()
  return text.endsWith('/') ? text : text + '/'
}

/**
 * Resolve one frame/preview hint to an absolute URL. Precedence:
 * 1. per-file `assetUrls[path]` override (host truth, e.g. blob: URLs);
 * 2. an absolute URL already stored in the path;
 * 3. `assetBase` + pack-relative path;
 * 4. root-relative path + `resolveBase` (built-in style `/assets/...`).
 * A relative pack path with no base/resolvable URL fails instead of guessing a
 * page-relative URL that the host does not serve.
 */
function resolveAssetHint(
  path: string,
  assetUrls: Readonly<Record<string, string>> | undefined,
  assetBase: string | null,
  resolveBase: string | undefined,
): URL | null {
  const override = assetUrls?.[path]
  if (override !== undefined) {
    if (!isSafeHint(override)) return null
    return parseAssetUrl(override, resolveBase)
  }
  if (hasScheme(path)) return parseAssetUrl(path, undefined)
  if (assetBase !== null) return parseAssetUrl(path, assetBase)
  if ((isRootRelative(path) || isProtocolRelative(path)) && resolveBase !== undefined) {
    return parseAssetUrl(path, resolveBase)
  }
  return null
}

interface ClipEntry {
  readonly clip: string
  readonly frames: number
  readonly fps: number
  readonly loop: boolean
  readonly holdMs?: readonly number[]
}

interface ClipTable {
  readonly clips: readonly ClipEntry[]
  readonly totalFrames: number
}

/**
 * Read + validate the runtime clip table. Order is deterministic: canonical
 * `CLIP_IDS` first (matching `characterPackFramePaths()`), then any extra tags
 * in host insertion order. Invalid timing values fail instead of reaching the
 * hero validator with NaN.
 */
function readClipTable(art: CharacterPackArtHandle): { ok: true; table: ClipTable } | { ok: false; code: CharacterPackRenderErrorCode; message: string } {
  const raw = art.clips as unknown
  if (!isPlainRecord(raw)) {
    return { ok: false, code: 'missing-clips', message: 'art.clips is missing: a renderable character pack needs clip timing metadata' }
  }
  const present = Object.keys(raw)
  if (present.length === 0) {
    return { ok: false, code: 'missing-clips', message: 'art.clips is empty: a renderable character pack needs at least one clip' }
  }
  const canonical = CLIP_IDS.filter((clip) => Object.prototype.hasOwnProperty.call(raw, clip)) as string[]
  const extras = present.filter((clip) => !(CLIP_IDS as readonly string[]).includes(clip))
  const order = [...canonical, ...extras]
  const clips: ClipEntry[] = []
  let totalFrames = 0
  for (const clip of order) {
    if (!TAG_NAME_PATTERN.test(clip)) {
      return { ok: false, code: 'invalid-clips', message: 'art.clips key ' + describeValue(clip) + ' is not a tag name matching ' + String(TAG_NAME_PATTERN) }
    }
    const meta = raw[clip]
    if (!isPlainRecord(meta)) {
      return { ok: false, code: 'invalid-clips', message: 'art.clips.' + clip + ' must be an object' }
    }
    const frames = meta.frames
    if (typeof frames !== 'number' || !Number.isInteger(frames) || frames <= 0) {
      return { ok: false, code: 'invalid-clips', message: 'art.clips.' + clip + '.frames must be a positive integer' }
    }
    const fps = meta.fps
    if (typeof fps !== 'number' || !Number.isFinite(fps) || fps < 0) {
      return { ok: false, code: 'invalid-clips', message: 'art.clips.' + clip + '.fps must be a finite number >= 0' }
    }
    if (typeof meta.loop !== 'boolean') {
      return { ok: false, code: 'invalid-clips', message: 'art.clips.' + clip + '.loop must be boolean' }
    }
    let holdMs: readonly number[] | undefined
    if (meta.holdMs !== undefined) {
      const rawHolds = meta.holdMs
      if (!Array.isArray(rawHolds) || rawHolds.length !== frames) {
        return { ok: false, code: 'invalid-clips', message: 'art.clips.' + clip + '.holdMs must have one entry per frame' }
      }
      const holds: number[] = []
      for (const [index, value] of rawHolds.entries()) {
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          return { ok: false, code: 'invalid-clips', message: 'art.clips.' + clip + '.holdMs[' + index + '] must be a positive finite number' }
        }
        holds.push(value)
      }
      holdMs = holds
    }
    clips.push({ clip, frames, fps, loop: meta.loop, ...(holdMs !== undefined ? { holdMs } : {}) })
    totalFrames += frames
  }
  return { ok: true, table: { clips, totalFrames } }
}

/** Licence + AI provenance: both are mandatory for the hero data; never invented. */
function readProvenance(
  art: CharacterPackArtHandle,
): { ok: true; license: string; ai: { status: RenderAiStatus; tool?: string } } | { ok: false; code: CharacterPackRenderErrorCode; message: string } {
  const license = art.license
  if (typeof license !== 'string' || license.length === 0 || license.length > MAX_PROVENANCE_CHARS || CONTROL_CHARS_PATTERN.test(license)) {
    return {
      ok: false,
      code: 'missing-provenance',
      message:
        'art.license is missing: the renderer adapter refuses to invent a licence; the host must copy license.spdx from the validated pack (or declare one for a built-in)',
    }
  }
  const rawAi = art.ai
  if (!isPlainRecord(rawAi)) {
    return {
      ok: false,
      code: 'missing-provenance',
      message:
        'art.ai is missing: the renderer adapter refuses to invent AI-generation provenance; the host must copy aiProvenance from the validated pack (or declare one for a built-in)',
    }
  }
  const status = rawAi.status
  if (typeof status !== 'string' || !(AI_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, code: 'missing-provenance', message: 'art.ai.status must be one of [' + AI_STATUSES.join(', ') + ']' }
  }
  let tool: string | undefined
  if (rawAi.tool !== undefined) {
    if (!isSafeHint(rawAi.tool)) {
      return { ok: false, code: 'missing-provenance', message: 'art.ai.tool must be a short plain-text tool id when present' }
    }
    tool = rawAi.tool
  }
  return { ok: true, license, ai: { status: status as RenderAiStatus, ...(tool !== undefined ? { tool } : {}) } }
}

interface RenderSpec {
  readonly canvas: [number, number]
  readonly anchor: { x: number; y: number; mode: string }
  readonly footBox: { x: number; y: number; w: number; h: number }
  readonly bbox?: [number, number, number, number]
  readonly display?: { scale?: 1 | 2 | 4; pixelated?: true }
  readonly palette: string
}

/** Read the declarative art spec with the same shape rules the runtime enforces. */
function readArtSpec(art: CharacterPackArtHandle): { ok: true; spec: RenderSpec } | { ok: false; code: CharacterPackRenderErrorCode; message: string } {
  const canvas = art.canvas
  if (!Array.isArray(canvas) || canvas.length !== 2 || !Number.isInteger(canvas[0]) || !Number.isInteger(canvas[1]) || (canvas[0] as number) <= 0 || (canvas[1] as number) <= 0) {
    return { ok: false, code: 'invalid-source', message: 'art.canvas must be [positiveWidth, positiveHeight]' }
  }
  const anchor = art.anchor
  if (!isPlainRecord(anchor) || typeof anchor.x !== 'number' || typeof anchor.y !== 'number' || typeof anchor.mode !== 'string' || !Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
    return { ok: false, code: 'invalid-source', message: 'art.anchor must be {x,y,mode} with finite coordinates' }
  }
  const foot = art.footBox
  if (
    !isPlainRecord(foot) ||
    typeof foot.x !== 'number' ||
    typeof foot.y !== 'number' ||
    typeof foot.w !== 'number' ||
    typeof foot.h !== 'number' ||
    !Number.isFinite(foot.x) ||
    !Number.isFinite(foot.y) ||
    !Number.isFinite(foot.w) ||
    !Number.isFinite(foot.h) ||
    foot.w <= 0 ||
    foot.h <= 0
  ) {
    return { ok: false, code: 'invalid-source', message: 'art.footBox must be {x,y,w,h} with positive w/h' }
  }
  if (typeof art.palette !== 'string' || art.palette.length === 0) {
    return { ok: false, code: 'invalid-source', message: 'art.palette must be a non-empty string' }
  }
  const spec: { -readonly [K in keyof RenderSpec]: RenderSpec[K] } = {
    canvas: [canvas[0] as number, canvas[1] as number],
    anchor: { x: anchor.x as number, y: anchor.y as number, mode: anchor.mode as string },
    footBox: { x: foot.x as number, y: foot.y as number, w: foot.w as number, h: foot.h as number },
    palette: art.palette,
  }
  if (art.bbox !== undefined) {
    const bbox = art.bbox
    if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
      return { ok: false, code: 'invalid-source', message: 'art.bbox must be [x,y,w,h] with finite numbers' }
    }
    spec.bbox = [bbox[0] as number, bbox[1] as number, bbox[2] as number, bbox[3] as number]
  }
  if (art.display !== undefined) {
    const display = art.display
    if (!isPlainRecord(display)) return { ok: false, code: 'invalid-source', message: 'art.display must be an object' }
    const normalized: { scale?: 1 | 2 | 4; pixelated?: true } = {}
    if (display.scale !== undefined) {
      if (display.scale !== 1 && display.scale !== 2 && display.scale !== 4) {
        return { ok: false, code: 'invalid-source', message: 'art.display.scale must be 1, 2 or 4' }
      }
      normalized.scale = display.scale
    }
    if (display.pixelated !== undefined) {
      if (display.pixelated !== true) return { ok: false, code: 'invalid-source', message: 'art.display.pixelated must be true when present' }
      normalized.pixelated = true
    }
    spec.display = normalized
  }
  return { ok: true, spec }
}

// ---------------------------------------------------------------------------
// Pure conversion: runtime character -> hero-consumable frame/URL description
// ---------------------------------------------------------------------------

/**
 * Convert one runtime character into the hero layer's frame/URL description.
 *
 * Pure (no DOM/network/host calls) and deterministic: the same source + options
 * always produce the same `RenderPackRef`, `HeroCharacterBundle` and frame
 * table. Every failure is a `{ok:false, code, message}` result (never a throw)
 * so a future host can show a stable reason without a try/catch.
 */
export function describeCharacterPackRender(
  source: CharacterPackRenderSource,
  options: CharacterPackRenderOptions = {},
): CharacterPackRenderResult {
  if (!isPlainRecord(source)) return renderFailure('invalid-source', 'character-pack render source must be an object')
  const packId = source.packId
  const version = source.version
  const characterId = source.characterId
  const name = source.name
  const kind = source.kind
  if (typeof packId !== 'string' || !PACK_ID_PATTERN.test(packId)) {
    return renderFailure('invalid-source', 'packId must match ' + String(PACK_ID_PATTERN))
  }
  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) {
    return renderFailure('invalid-source', 'version must be a SemVer string')
  }
  if (typeof characterId !== 'string' || !CHARACTER_ID_PATTERN.test(characterId)) {
    return renderFailure('invalid-source', 'characterId must match ' + String(CHARACTER_ID_PATTERN))
  }
  if (typeof name !== 'string' || name.length === 0 || name.length > 80 || CONTROL_CHARS_PATTERN.test(name)) {
    return renderFailure('invalid-source', 'name must be plain text (1..80 chars)')
  }
  if (typeof kind !== 'string' || !(CHARACTER_PACK_KINDS as readonly string[]).includes(kind)) {
    return renderFailure('invalid-source', 'kind must be one of [' + CHARACTER_PACK_KINDS.join(', ') + ']')
  }
  const art = source.art as unknown
  if (!isPlainRecord(art)) return renderFailure('invalid-source', 'art handle is missing')
  const behavior = source.behavior as unknown
  if (!isPlainRecord(behavior)) return renderFailure('invalid-source', 'behavior profile is missing')
  const regions = source.regions as unknown
  if (!isPlainRecord(regions)) return renderFailure('invalid-source', 'regions config is missing')

  const specResult = readArtSpec(art as unknown as CharacterPackArtHandle)
  if (!specResult.ok) return renderFailure(specResult.code, specResult.message)
  const clipResult = readClipTable(art as unknown as CharacterPackArtHandle)
  if (!clipResult.ok) return renderFailure(clipResult.code, clipResult.message)
  const provenance = readProvenance(art as unknown as CharacterPackArtHandle)
  if (!provenance.ok) return renderFailure(provenance.code, provenance.message)

  const handle = art as unknown as CharacterPackArtHandle
  const framePaths = handle.framePaths
  if (!Array.isArray(framePaths) || framePaths.length === 0) {
    return renderFailure('missing-frame-paths', 'art.framePaths is missing: the host must provide the pack-relative frame paths in clip order')
  }
  if (framePaths.length !== clipResult.table.totalFrames) {
    return renderFailure(
      'frame-count-mismatch',
      'art.framePaths has ' + framePaths.length + ' entries but the clips need ' + clipResult.table.totalFrames + ' frames (tags: ' + clipResult.table.clips.map((entry) => entry.clip).join(', ') + ')',
    )
  }
  const assetUrls = handle.assetUrls
  const resolveBase = options.resolveBase
  const assetBase = resolveAssetBase(handle.assetBase, resolveBase)

  const resolvedUrls: string[] = []
  for (const [index, rawPath] of framePaths.entries()) {
    if (!isSafeHint(rawPath)) {
      return renderFailure('missing-frame-paths', 'art.framePaths[' + index + '] must be a short plain-text hint')
    }
    const url = resolveAssetHint(rawPath, assetUrls, assetBase, resolveBase)
    if (url === null) {
      return renderFailure(
        'unresolved-assets',
        'cannot resolve art.framePaths[' + index + '] ' + describeValue(rawPath) + ' to a safe absolute image URL; the host must provide art.assetUrls, an absolute art.assetBase, or an absolute resolveBase for root-relative paths',
      )
    }
    resolvedUrls.push(url.toString())
  }

  const tags: Record<string, CharacterTag> = {}
  for (const entry of clipResult.table.clips) {
    tags[entry.clip] = {
      frames: entry.frames,
      fps: entry.fps,
      loop: entry.loop,
      ...(entry.holdMs !== undefined ? { holdMs: [...entry.holdMs] } : {}),
    }
  }

  const data: CharacterPackData = {
    id: packId,
    style: CHARACTER_PACK_RENDER_FORMAT,
    canvas: [specResult.spec.canvas[0], specResult.spec.canvas[1]],
    anchor: { x: specResult.spec.anchor.x, y: specResult.spec.anchor.y, mode: specResult.spec.anchor.mode },
    footBox: { x: specResult.spec.footBox.x, y: specResult.spec.footBox.y, w: specResult.spec.footBox.w, h: specResult.spec.footBox.h },
    palette: specResult.spec.palette,
    tags,
    assets: resolvedUrls,
    license: provenance.license,
    ai: { status: provenance.ai.status, ...(provenance.ai.tool !== undefined ? { tool: provenance.ai.tool } : {}) },
  }
  try {
    validateCharacterPack(data)
  } catch (error) {
    return renderFailure('invalid-render-data', 'converted hero pack data failed validateCharacterPack(): ' + messageOf(error))
  }

  const locator = assetBase ?? CHARACTER_PACK_SYNTHETIC_LOCATOR_PREFIX + packId + '@' + version + '/'

  let framesByTag: Record<string, readonly string[]>
  try {
    const loaded = describeCharacterPack(data, locator)
    framesByTag = {}
    for (const entry of clipResult.table.clips) {
      framesByTag[entry.clip] = loaded.framesByTag[entry.clip] ?? []
    }
  } catch (error) {
    return renderFailure('invalid-render-data', 'could not describe the hero pack from locator ' + describeValue(locator) + ': ' + messageOf(error))
  }

  const frames: CharacterPackRenderFrame[] = []
  let cursor = 0
  for (const entry of clipResult.table.clips) {
    const urls = framesByTag[entry.clip] ?? []
    for (let index = 0; index < entry.frames; index += 1) {
      const path = framePaths[cursor]
      const url = urls[index]
      cursor += 1
      if (path === undefined || url === undefined) {
        return renderFailure('invalid-render-data', 'internal frame table mismatch at ' + entry.clip + '[' + index + ']')
      }
      frames.push({ clip: entry.clip, index, path, url })
    }
  }

  let previewUrl: string | undefined
  if (typeof handle.preview === 'string' && handle.preview.length > 0) {
    const preview = resolveAssetHint(handle.preview, assetUrls, assetBase, resolveBase)
    if (preview !== null) previewUrl = preview.toString()
  }

  const fallback: Record<string, string[]> | undefined =
    handle.fallback === undefined
      ? undefined
      : Object.fromEntries(Object.entries(handle.fallback).map(([key, chain]) => [key, [...chain]] as const))

  const fciTags: Record<string, { frames: number; fps: number; loop: boolean }> = {}
  for (const entry of clipResult.table.clips) {
    fciTags[entry.clip] = { frames: entry.frames, fps: entry.fps, loop: entry.loop }
  }

  let characterDocument: CharacterDocument
  try {
    characterDocument = validateCharacterDocument({
      spec: 'famling.character',
      apiVersion: '0.2',
      id: characterId,
      version,
      type: kind === 'humanoid' ? 'humanoid' : 'pet',
      species: kind,
      canvas: [specResult.spec.canvas[0], specResult.spec.canvas[1]],
      anchor: { x: specResult.spec.anchor.x, y: specResult.spec.anchor.y, mode: specResult.spec.anchor.mode },
      footBox: [specResult.spec.footBox.x, specResult.spec.footBox.y, specResult.spec.footBox.w, specResult.spec.footBox.h],
      ...(specResult.spec.bbox !== undefined ? { bbox: [...specResult.spec.bbox] } : {}),
      ...(specResult.spec.display !== undefined ? { display: { ...specResult.spec.display } } : {}),
      palette: specResult.spec.palette,
      render: { format: CHARACTER_PACK_RENDER_FORMAT },
      tags: fciTags,
      behavior: behavior as unknown as BehaviorProfile,
      license: provenance.license,
      ai: { status: provenance.ai.status, ...(provenance.ai.tool !== undefined ? { tool: provenance.ai.tool } : {}) },
      ...(fallback !== undefined ? { fallback } : {}),
    })
  } catch (error) {
    return renderFailure('invalid-render-data', 'could not build the FCI document for ' + characterId + ': ' + messageOf(error))
  }

  const missing = missingTags(behavior as unknown as BehaviorProfile, Object.keys(tags), characterDocument.fallback ?? {})
  if (missing.length > 0) {
    return renderFailure(
      'missing-tags',
      'behavior needs tags [' + missing.join(', ') + '] but the pack only provides [' + Object.keys(tags).join(', ') + ']',
    )
  }

  const ref: RenderPackRef = { id: packId, format: CHARACTER_PACK_RENDER_FORMAT, locator, data }
  const bundle: HeroCharacterBundle = {
    key: characterId,
    character: { document: characterDocument, behavior: behavior as unknown as BehaviorProfile },
    pack: ref,
    tags: data.tags,
    canvas: [data.canvas[0], data.canvas[1]],
    regions: regions as unknown as HeroRegionConfig,
  }

  return {
    ok: true,
    render: {
      packId,
      version,
      characterId,
      name,
      kind: kind as CharacterPackKind,
      format: CHARACTER_PACK_RENDER_FORMAT,
      locator,
      data,
      ref,
      tags: clipResult.table.clips.map((entry) => entry.clip),
      clips: clipResult.table.clips.map((entry) => entry.clip),
      frames,
      framesByTag,
      bundle,
      regions: regions as unknown as HeroRegionConfig,
      behavior: behavior as unknown as BehaviorProfile,
      ...(previewUrl !== undefined ? { previewUrl } : {}),
    },
  }
}

// ---------------------------------------------------------------------------
// Stateful adapter: load / release / failure recovery
// ---------------------------------------------------------------------------

/** Injected renderer boundary; the adapter itself owns no canvas/backend. */
export interface CharacterPackRenderHost {
  /** Load one pack ref into the renderer (idempotent for identical refs). */
  readonly load: (ref: RenderPackRef) => Promise<void>
  /**
   * Release a loaded pack by id. Must be idempotent (unknown id = no-op). The
   * hero backend exposes no per-pack unload, so a production host recreates or
   * disposes its backend here; an async implementation is awaited.
   */
  readonly release: (packId: string) => void | Promise<void>
  /** Optional observability sink; throwing from it never breaks state changes. */
  readonly emit?: (event: CharacterPackRendererEvent) => void
}

/** Adapter lifecycle events (never contain bytes, URLs or host objects). */
export type CharacterPackRendererEvent =
  | {
      readonly type: 'render-applied'
      readonly packId: string
      readonly version: string
      readonly characterId: string
      readonly previousPackId: string | null
      readonly previousVersion: string | null
    }
  | { readonly type: 'render-unchanged'; readonly packId: string; readonly version: string }
  | {
      readonly type: 'render-load-failed'
      readonly packId: string
      readonly version: string
      readonly code: CharacterPackRendererErrorCode
      readonly message: string
      readonly restoredPackId: string | null
    }
  | { readonly type: 'render-restored'; readonly packId: string; readonly version: string }
  | { readonly type: 'render-restore-failed'; readonly packId: string; readonly version: string; readonly message: string }
  | { readonly type: 'render-released'; readonly packId: string; readonly version: string }
  | { readonly type: 'render-release-failed'; readonly packId: string; readonly version: string; readonly message: string }

export interface CharacterPackRendererOptions {
  readonly host: CharacterPackRenderHost
  /** Absolute page/app base for root-relative hints (see CharacterPackRenderOptions). */
  readonly resolveBase?: string
}

export interface CharacterPackRendererApplyOptions {
  /** Re-load even when the same pack id/version is already applied. */
  readonly forceReload?: boolean
}

export interface CharacterPackRendererApplied {
  readonly ok: true
  readonly state: 'applied' | 'unchanged'
  readonly render: CharacterPackRenderHandle
  /** Previous pack identity when this call replaced one (null on first/unchanged). */
  readonly replaced: { readonly packId: string; readonly version: string } | null
  /** Non-fatal release error after a successful switch (old pack may leak). */
  readonly releaseWarning?: string
}

export interface CharacterPackRendererFailure {
  readonly ok: false
  readonly code: CharacterPackRendererErrorCode
  readonly message: string
  /** Character that remained (or was restored) active after the failure. */
  readonly restored: CharacterPackRenderHandle | null
  /** True when a failed switch could not re-load the previous character. */
  readonly restoreFailed?: boolean
}

export type CharacterPackRendererApplyResult = CharacterPackRendererApplied | CharacterPackRendererFailure

export type CharacterPackRendererReleaseResult =
  | { readonly ok: true; readonly released: boolean; readonly packId: string | null }
  | { readonly ok: false; readonly code: 'busy' | 'disposed' | 'release-failed'; readonly message: string }

export type CharacterPackRendererOperation = 'idle' | 'applying' | 'releasing' | 'disposed'

export interface CharacterPackRendererSnapshot {
  readonly operation: CharacterPackRendererOperation
  readonly current: { readonly packId: string; readonly version: string; readonly characterId: string } | null
}

function failure(
  code: CharacterPackRendererErrorCode,
  message: string,
  restored: CharacterPackRenderHandle | null,
  restoreFailed?: boolean,
): CharacterPackRendererFailure {
  return { ok: false, code, message, restored, ...(restoreFailed === true ? { restoreFailed: true } : {}) }
}

/**
 * Load/release bookkeeping for one active character pack.
 *
 * Failure recovery rules (tested in tests/character-pack-renderer.test.ts):
 * - conversion failure: the current renderer state is untouched;
 * - different pack id: load-new first; a load failure leaves the old pack
 *   loaded and active; releasing the old pack after a successful load is
 *   best-effort (a release error becomes `releaseWarning` + event);
 * - same pack id (new version or forceReload): the old pack is released first
 *   (the hero backend refuses one id with two locators); a release failure
 *   changes nothing; a load failure re-loads the previous ref, and reports
 *   `restored` (or `restore-failed` when that reload also fails);
 * - a single in-flight operation at a time (`busy` otherwise), and a disposed
 *   adapter refuses all work.
 */
export class CharacterPackRendererAdapter {
  private readonly host: CharacterPackRenderHost
  private readonly resolveBase: string | undefined
  private current: CharacterPackRenderHandle | null = null
  private operation: Exclude<CharacterPackRendererOperation, 'disposed'> = 'idle'
  private disposedState = false
  /** In-flight apply/release work, awaited by dispose() before final cleanup. */
  private inFlight: Promise<void> | null = null

  constructor(options: CharacterPackRendererOptions) {
    if (!isPlainRecord(options)) throw new TypeError('CharacterPackRendererAdapter: options must be an object')
    const host = options.host
    if (!isPlainRecord(host) || typeof host.load !== 'function' || typeof host.release !== 'function') {
      throw new TypeError('CharacterPackRendererAdapter: host.load() and host.release() are required')
    }
    if (host.emit !== undefined && typeof host.emit !== 'function') {
      throw new TypeError('CharacterPackRendererAdapter: host.emit must be a function when present')
    }
    this.host = host
    this.resolveBase = typeof options.resolveBase === 'string' ? options.resolveBase : undefined
  }

  /** The currently applied description, or null (never loads anything). */
  currentRender(): CharacterPackRenderHandle | null {
    return this.current
  }

  snapshot(): CharacterPackRendererSnapshot {
    return {
      operation: this.disposedState ? 'disposed' : this.operation,
      current: this.current === null ? null : { packId: this.current.packId, version: this.current.version, characterId: this.current.characterId },
    }
  }

  /** True after `dispose()`; further apply/release calls fail closed. */
  get isDisposed(): boolean {
    return this.disposedState
  }

  /**
   * Convert + apply one runtime character. Never throws for conversion or host
   * failures; a structured failure keeps `restored` describing the character
   * that is still active (if any).
   */
  async apply(
    source: CharacterPackRenderSource,
    options: CharacterPackRendererApplyOptions = {},
  ): Promise<CharacterPackRendererApplyResult> {
    if (this.disposedState) return failure('disposed', 'character-pack renderer adapter is disposed', this.current)
    if (this.operation !== 'idle') return failure('busy', 'another renderer operation is in progress', this.current)
    const built = describeCharacterPackRender(source, this.resolveBase !== undefined ? { resolveBase: this.resolveBase } : {})
    if (!built.ok) return failure(built.code, built.message, this.current)
    const next = built.render
    const previous = this.current
    const sameIdentity =
      previous !== null &&
      previous.packId === next.packId &&
      previous.version === next.version &&
      previous.characterId === next.characterId &&
      previous.locator === next.locator
    if (sameIdentity && options.forceReload !== true) {
      this.emit({ type: 'render-unchanged', packId: next.packId, version: next.version })
      return { ok: true, state: 'unchanged', render: previous, replaced: null }
    }

    this.operation = 'applying'
    const work = this.performApply(next, previous)
    this.inFlight = work.then(
      () => undefined,
      () => undefined,
    )
    try {
      return await work
    } finally {
      this.inFlight = null
      this.operation = 'idle'
    }
  }

  private async performApply(
    next: CharacterPackRenderHandle,
    previous: CharacterPackRenderHandle | null,
  ): Promise<CharacterPackRendererApplyResult> {
      if (previous === null) {
        try {
          await this.host.load(next.ref)
        } catch (error) {
          const message = 'failed to load pack "' + next.packId + '" into the renderer: ' + messageOf(error)
          this.emit({ type: 'render-load-failed', packId: next.packId, version: next.version, code: 'load-failed', message, restoredPackId: null })
          return failure('load-failed', message, null)
        }
        this.current = next
        this.emit({
          type: 'render-applied',
          packId: next.packId,
          version: next.version,
          characterId: next.characterId,
          previousPackId: null,
          previousVersion: null,
        })
        return { ok: true, state: 'applied', render: next, replaced: null }
      }

      if (previous.packId !== next.packId) {
        // Two different pack ids can coexist in the backend: load first so a
        // failed load never unloads the current character.
        try {
          await this.host.load(next.ref)
        } catch (error) {
          const message = 'failed to load pack "' + next.packId + '" into the renderer: ' + messageOf(error)
          this.emit({ type: 'render-load-failed', packId: next.packId, version: next.version, code: 'load-failed', message, restoredPackId: previous.packId })
          return failure('load-failed', message, previous)
        }
        let releaseWarning: string | undefined
        try {
          await this.host.release(previous.packId)
        } catch (error) {
          releaseWarning = 'previous pack "' + previous.packId + '" could not be released: ' + messageOf(error)
          this.emit({ type: 'render-release-failed', packId: previous.packId, version: previous.version, message: releaseWarning })
        }
        this.current = next
        this.emit({
          type: 'render-applied',
          packId: next.packId,
          version: next.version,
          characterId: next.characterId,
          previousPackId: previous.packId,
          previousVersion: previous.version,
        })
        return {
          ok: true,
          state: 'applied',
          render: next,
          replaced: { packId: previous.packId, version: previous.version },
          ...(releaseWarning !== undefined ? { releaseWarning } : {}),
        }
      }

      // Same pack id: the hero backend keys slots by pack id, so the old
      // version must be released before the new one can load. Recover the old
      // one if the new load fails.
      try {
        await this.host.release(previous.packId)
      } catch (error) {
        const message = 'failed to release pack "' + previous.packId + '" before re-loading it: ' + messageOf(error)
        this.emit({ type: 'render-release-failed', packId: previous.packId, version: previous.version, message })
        return failure('release-failed', message, previous)
      }
      this.current = null
      try {
        await this.host.load(next.ref)
      } catch (error) {
        const loadMessage = 'failed to load pack "' + next.packId + '@' + next.version + '" after releasing "' + previous.packId + '@' + previous.version + '": ' + messageOf(error)
        this.emit({ type: 'render-load-failed', packId: next.packId, version: next.version, code: 'load-failed', message: loadMessage, restoredPackId: previous.packId })
        try {
          await this.host.load(previous.ref)
        } catch (restoreError) {
          const restoreMessage =
            'failed to re-load the previous pack "' + previous.packId + '@' + previous.version + '": ' + messageOf(restoreError)
          this.emit({ type: 'render-restore-failed', packId: previous.packId, version: previous.version, message: restoreMessage })
          return failure('restore-failed', loadMessage + '; ' + restoreMessage, null, true)
        }
        this.current = previous
        this.emit({ type: 'render-restored', packId: previous.packId, version: previous.version })
        return failure('load-failed', loadMessage + '; the previous pack was re-loaded', previous)
      }
      this.current = next
      this.emit({
        type: 'render-applied',
        packId: next.packId,
        version: next.version,
        characterId: next.characterId,
        previousPackId: previous.packId,
        previousVersion: previous.version,
      })
      return { ok: true, state: 'applied', render: next, replaced: { packId: previous.packId, version: previous.version } }
  }

  /**
   * Release the current renderer pack. Pass `packId` to guard against releasing
   * a different character; a mismatched id is a no-op success.
   */
  async release(packId?: string): Promise<CharacterPackRendererReleaseResult> {
    if (this.disposedState) return { ok: false, code: 'disposed', message: 'character-pack renderer adapter is disposed' }
    if (this.operation !== 'idle') return { ok: false, code: 'busy', message: 'another renderer operation is in progress' }
    const current = this.current
    if (current === null) return { ok: true, released: false, packId: null }
    if (packId !== undefined && packId !== current.packId) return { ok: true, released: false, packId: current.packId }
    this.operation = 'releasing'
    const work = this.performRelease(current)
    this.inFlight = work.then(
      () => undefined,
      () => undefined,
    )
    try {
      return await work
    } finally {
      this.inFlight = null
      this.operation = 'idle'
    }
  }

  private async performRelease(current: CharacterPackRenderHandle): Promise<CharacterPackRendererReleaseResult> {
      try {
        await this.host.release(current.packId)
      } catch (error) {
        const message = 'failed to release pack "' + current.packId + '": ' + messageOf(error)
        this.emit({ type: 'render-release-failed', packId: current.packId, version: current.version, message })
        return { ok: false, code: 'release-failed', message }
      }
      this.current = null
      this.emit({ type: 'render-released', packId: current.packId, version: current.version })
      return { ok: true, released: true, packId: current.packId }
  }

  /**
   * Refuse all further work and release the current pack (best effort).
   *
   * If an apply/release is in flight, dispose waits for it to settle first, then
   * releases whatever is current — so a late load cannot leak a renderer slot.
   */
  async dispose(): Promise<void> {
    if (this.disposedState) return
    this.disposedState = true
    const pending = this.inFlight
    if (pending !== null) {
      try {
        await pending
      } catch {
        // apply()/release() never reject for host failures; keep dispose best-effort.
      }
    }
    const current = this.current
    if (current === null) return
    this.current = null
    try {
      await this.host.release(current.packId)
    } catch (error) {
      this.emit({ type: 'render-release-failed', packId: current.packId, version: current.version, message: 'release during dispose failed: ' + messageOf(error) })
    }
  }

  // -- internals ----------------------------------------------------------

  private emit(event: CharacterPackRendererEvent): void {
    const host = this.host
    if (typeof host.emit !== 'function') return
    try {
      // Call through the host object so a class-based sink keeps its receiver;
      // observability must never break a state transition.
      host.emit(event)
    } catch {
      // Observability must never break a state transition.
    }
  }
}
