/**
 * Pet-page hero integration controller (Phase 2, feature-flagged).
 *
 * This is the testable wiring layer between the existing `pet.html`/`main.ts`
 * DOM shell and the already-shipped character/render/scene modules:
 *
 *   config      `resolveHeroConfig()` — `?hero=` / localStorage opt-in parsing
 *   loading     `loadHeroBundle()`    — FCI document + behavior + hero pack JSON
 *   layout      `planHeroLayout()`    — fit display scale (1×/2×/4× up, 1/2, 1/4,
 *                                        1/8 down) for 64..1024px canvases + slots
 *   runtime     `HeroRuntime`         — SceneRuntime actors + RenderBackend draw
 *   bootstrap   `startHeroRuntime()`  — load → backend.load → first frame gate
 *
 * Design rules (do not violate when extending):
 * - The feature flag defaults to OFF and nothing here creates a canvas, rAF
 *   loop or DOM node by itself; `main.ts` owns the canvas elements and the loop.
 * - All DOM access is injected (`canvas`, `ctx`, `stage`) or guarded with
 *   `typeof` checks, so this module runs under Node tests with fakes.
 * - Behaviour/stage decisions stay data-driven: events go through
 *   `SceneRuntime`, state tags come from the FCI behavior profile, frame math
 *   comes from `hero.ts` (`frameIndexFor`) through the render backend.
 * - A missing tag is resolved through `CharacterDocument.fallback` BEFORE it
 *   ever reaches the render backend (unknown tags throw there).
 * - Speech/expression are host-side hooks only: `hero.ts` `setExpression` /
 *   `setMouth` are still no-ops in the pixel renderer, so Phase 2 tracks them
 *   for QA and uses the `talk` tag as the visible speaking animation.
 * - Canvas sizes come from the shared `pixel-scale.ts` policy: 64..1024 art px,
 *   multiple of 16, displayed at the largest supported scale that fits the
 *   measured `.book` (1024 at 480×240 falls back to 1/8 = 128px).
 *
 * See docs/PET-HERO-INTEGRATION.md for the operator-facing contract.
 */
import {
  loadCharacter,
  missingTags,
  resolveFallbackTag,
  type CharacterDocument,
  type LoadedCharacter,
} from './character/index.ts'
import { frameIndexFor, validateCharacterPack, type CharacterPackData, type CharacterTag } from './hero.ts'
import { heroRegionHitAt, parseHeroRegionConfig, type HeroRegionConfig, type HeroRegionHit } from './anim/regions.ts'
import {
  CANVAS_SIZE_ALIGNMENT,
  CANVAS_SIZE_MAX,
  CANVAS_SIZE_MIN,
  LEGACY_CANVAS_SIZE_MAX,
  LEGACY_CANVAS_SIZE_MIN,
  PIXEL_SCALES,
  canvasSizeProblem,
  exactPixelScales,
  fitPixelScale,
  isPixelScale,
  legacyCanvasSizeProblem,
  scaledLength,
  type PixelScale,
} from './pixel-scale.ts'
import {
  RendererRegistry,
  actorView,
  heroRendererPlugin,
  type RenderBackend,
  type RenderPackRef,
  type RenderableActor,
} from './render/index.ts'
import { SceneRuntime, type SceneTickResult } from './scene/index.ts'

// ---------------------------------------------------------------------------
// Feature flag + character selection
// ---------------------------------------------------------------------------

/** Persistent opt-in key. Read-only in Phase 2 (a future settings screen writes it). */
export const HERO_STORAGE_KEY = 'desktop-games/pet/hero'

/**
 * Persisted hero character selection (`desktop-games/pet/heroCharacter`).
 *
 * Written by the desktop-shell renderer menu (`渲染器：金毛（动画）` sets
 * `'dog'`, `渲染器：塞尔凯克卷毛猫（动画）` sets `'cat'`, `渲染器：汀岚（动画）`
 * sets `'humanoid'`), read here only when the URL has no `?character=`. Values are
 * restricted to `HERO_CHARACTER_IDS`; anything else resolves to the default
 * (`humanoid`) so a stale/typo'd preference can never break the page.
 */
export const HERO_CHARACTER_STORAGE_KEY = 'desktop-games/pet/heroCharacter'

/** Characters available on the pet page today (all data-only FCI 0.1 packs). */
export const HERO_CHARACTER_IDS = ['humanoid', 'cat', 'dog', 'tinglan'] as const
export type HeroCharacterId = (typeof HERO_CHARACTER_IDS)[number]

/** Hard cap for `?actors=` so a typo cannot spawn an unbounded number of actors. */
export const MAX_HERO_ACTORS = 4

/**
 * Authoring canvas target for **new** humanoid art, in art pixels. This is a
 * recommendation only: the shipped Tinglan anim placeholder pack (and the old
 * `humanoid-default` Pearl pack) is still 96×96 and renders unchanged. A profile
 * expresses the target via
 * `character.json` `canvasTarget`, and `loadHeroBundle()` surfaces it as
 * `HeroCharacterBundle.canvasTarget`; layout always uses the loaded pack's
 * actual `canvas`, so old and new art coexist.
 */
export const DEFAULT_HUMANOID_CANVAS = 256

/** Canvas used by the shipped placeholder art packs; still fully supported. */
export const LEGACY_PLACEHOLDER_CANVAS = 96

export interface HeroCharacterSource {
  readonly id: HeroCharacterId
  readonly label: string
  /** URL directory served by Vite from `public/characters/`. */
  readonly dir: string
  /** Recommended canvas for new art of this character (absent = not migrated yet). */
  readonly canvasTarget?: readonly [number, number]
}

export const HERO_CHARACTER_SOURCES: Readonly<Record<HeroCharacterId, HeroCharacterSource>> = {
  // `humanoid` is the voiced human presentation. Since 2026-11-18 it points at
  // the Tinglan anim pack (`/assets/pet/anim/human/`) instead of the legacy
  // Pearl placeholder. The FCI document id is `famling.tinglan-anim`; the hero
  // key deliberately stays `humanoid` so HERO_CHARACTER_IDS, persisted
  // `heroCharacter` values and the voice mapping (humanoid -> human) do not
  // change. `canvasTarget` 256 remains the recommendation for FINAL humanoid
  // art while the shipped anim placeholder (like Pearl) is 96×96.
  humanoid: {
    id: 'humanoid',
    label: '汀岚（动画占位）',
    dir: '/characters/pet-tinglan-anim/',
    canvasTarget: [DEFAULT_HUMANOID_CANVAS, DEFAULT_HUMANOID_CANVAS],
  },
  cat: { id: 'cat', label: '塞尔凯克卷毛猫（动画占位）', dir: '/characters/pet-cat/' },
  dog: { id: 'dog', label: '金毛（动画占位 v7）', dir: '/characters/pet-dog/' },
  tinglan: {
    id: 'tinglan',
    label: '汀岚（Q 256 概念/预览，非 final）',
    dir: '/characters/tinglan-256/',
    canvasTarget: [256, 256],
  },
}

export type HeroFlagReason = 'default' | 'query-on' | 'query-off' | 'stored-on'

export interface HeroConfig {
  /** True when the host should attempt the hero canvas. */
  readonly enabled: boolean
  /** Why the flag resolved the way it did (QA/debug). */
  readonly reason: HeroFlagReason
  /**
   * Primary character: `?character=` when valid, else the persisted
   * `heroCharacter` preference, else `humanoid`.
   */
  readonly character: HeroCharacterId
  /** Actors to spawn (`?actors=`), defaults to `[character]`. */
  readonly actors: readonly HeroCharacterId[]
  /**
   * Optional QA override for the display scale (`?heroScale=`).
   * Accepted tokens: `4`, `2`, `1`, `0.5`, `0.25`, `0.125` (integer upscale or
   * integer reciprocal downscale). Anything else is ignored (auto-fit).
   */
  readonly scale?: PixelScale
}

/**
 * The three explicit inputs of flag resolution, in priority order:
 * `?hero=0` > `?hero=1` > localStorage `'1'` > default off.
 * Storage access is wrapped: private-mode/opaque-origin throws must not break
 * the DOM pet page.
 */
export interface HeroConfigInput {
  readonly search?: string | URLSearchParams | null
  readonly storage?: { getItem(key: string): string | null } | null
}

export function isHeroCharacterId(value: string): value is HeroCharacterId {
  return (HERO_CHARACTER_IDS as readonly string[]).includes(value)
}

function toSearchParams(search: HeroConfigInput['search']): URLSearchParams {
  if (search instanceof URLSearchParams) return search
  if (typeof search === 'string' && search.length > 0) return new URLSearchParams(search)
  return new URLSearchParams()
}

function readStoredOptIn(storage: HeroConfigInput['storage']): string | null {
  if (!storage) return null
  try {
    return storage.getItem(HERO_STORAGE_KEY)
  } catch {
    // Storage can throw in private/opaque contexts; opt-in is then simply off.
    return null
  }
}

/**
 * Read the persisted hero character choice; `null` when missing/unreadable or
 * not one of the shipped `HERO_CHARACTER_IDS` (never throws).
 */
export function readStoredHeroCharacter(storage: HeroConfigInput['storage']): HeroCharacterId | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(HERO_CHARACTER_STORAGE_KEY)
  } catch {
    // Storage can throw in private/opaque contexts; fall back to the default.
    return null
  }
  if (typeof raw !== 'string') return null
  const value = raw.trim().toLowerCase()
  return isHeroCharacterId(value) ? value : null
}

/**
 * Parse `?actors=humanoid,cat` into a deduped, capped actor list.
 * Unknown/duplicate tokens are ignored; an empty result falls back to `fallback`.
 */
export function parseHeroActors(raw: string | null | undefined, fallback: HeroCharacterId): HeroCharacterId[] {
  if (!raw) return [fallback]
  const seen = new Set<HeroCharacterId>()
  const actors: HeroCharacterId[] = []
  for (const token of raw.split(',')) {
    const key = token.trim().toLowerCase()
    if (!isHeroCharacterId(key) || seen.has(key)) continue
    seen.add(key)
    actors.push(key)
    if (actors.length >= MAX_HERO_ACTORS) break
  }
  return actors.length > 0 ? actors : [fallback]
}

/** Accepted `?heroScale=` tokens (string query values → display scale). */
const HERO_SCALE_TOKENS: ReadonlyMap<string, PixelScale> = new Map(
  PIXEL_SCALES.map((scale) => [String(scale), scale] as const),
)

/**
 * Parse `?heroScale=` into a supported display scale. Accepts the canonical
 * decimal spelling only (`4`, `2`, `1`, `0.5`, `0.25`, `0.125`); unknown or
 * fractional values resolve to `undefined` so layout auto-fits instead.
 */
export function parseHeroScale(raw: string | null | undefined): PixelScale | undefined {
  if (typeof raw !== 'string') return undefined
  return HERO_SCALE_TOKENS.get(raw.trim())
}

/**
 * Resolve the feature flag + character selection from `location.search` +
 * storage.
 *
 * Character priority: `?character=` (valid ids only) > persisted
 * `HERO_CHARACTER_STORAGE_KEY` (valid ids only) > `'humanoid'`. The storage
 * read is additive and backward compatible: old profiles without the key, an
 * unreadable storage, or an invalid value all keep the previous default.
 */
export function resolveHeroConfig(input: HeroConfigInput = {}): HeroConfig {
  const params = toSearchParams(input.search)
  const flag = params.get('hero')
  const stored = readStoredOptIn(input.storage)

  let enabled: boolean
  let reason: HeroFlagReason
  if (flag === '0') {
    enabled = false
    reason = 'query-off'
  } else if (flag === '1') {
    enabled = true
    reason = 'query-on'
  } else if (stored === '1') {
    enabled = true
    reason = 'stored-on'
  } else {
    enabled = false
    reason = 'default'
  }

  const requested = params.get('character')?.trim().toLowerCase()
  const storedCharacter = readStoredHeroCharacter(input.storage)
  const character: HeroCharacterId =
    requested && isHeroCharacterId(requested) ? requested : storedCharacter ?? 'humanoid'
  const actors = parseHeroActors(params.get('actors'), character)
  const scale = parseHeroScale(params.get('heroScale'))

  return { enabled, reason, character, actors, ...(scale !== undefined ? { scale } : {}) }
}

/** Small pure helper used for `window.__pet.hero` (never throws, never DOM-bound). */
export interface HeroStatus {
  readonly enabled: boolean
  readonly ok: boolean
  readonly reason: string | null
}

/**
 * `enabled` = the flag asked for hero; `ok` = hero is actually drawing.
 * On a failed start the DOM fallback stays visible and `reason` carries a
 * stable prefix (`load-failed:`, `pack-load-failed:`, `first-frame-failed:`, …).
 */
export function heroStatus(
  config: HeroConfig,
  result: { readonly ok: boolean; readonly reason?: string } | null,
): HeroStatus {
  if (!config.enabled) return { enabled: false, ok: false, reason: 'flag-off' }
  if (!result) return { enabled: true, ok: false, reason: 'loading' }
  if (result.ok) return { enabled: true, ok: true, reason: null }
  return { enabled: true, ok: false, reason: result.reason ?? 'unknown' }
}

// ---------------------------------------------------------------------------
// Character + pack loading
// ---------------------------------------------------------------------------

export class HeroRuntimeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HeroRuntimeError'
  }
}

/** One FCI character plus the hero pack it renders with (all data, no code). */
export interface HeroCharacterBundle {
  readonly key: HeroCharacterId
  readonly character: LoadedCharacter
  /** Render-layer pack reference (`data` is the already-parsed manifest). */
  readonly pack: RenderPackRef
  /** Animation tag metadata straight from the pack manifest. */
  readonly tags: Readonly<Record<string, CharacterTag>>
  /** Optional per-character tap regions (art pixels; absent = legacy whole-actor tap). */
  readonly regions?: HeroRegionConfig
  /**
   * Actual pack art canvas in logical pixels (96×96 for the shipped placeholders,
   * 128×128 for the tinglan profile). Layout/render always use this value.
   */
  readonly canvas: readonly [number, number]
  /**
   * Recommended authoring canvas for NEW art (profile `canvasTarget`, else the
   * character's default; `[256, 256]` for humanoid). Advisory only — the loaded
   * 96×96 placeholder pack keeps rendering at its own canvas while new 256 art
   * is produced. Absent for cat/dog (not migrated yet).
   */
  readonly canvasTarget?: readonly [number, number]
}

export interface LoadHeroOptions {
  readonly fetcher?: typeof fetch
  /**
   * Base URL used to turn the page-relative `packBase` (e.g.
   * `/assets/pet/anim/dog/`) into an absolute one. `hero.ts`
   * `describeCharacterPack` builds asset URLs with `new URL(asset, base)`,
   * which needs an absolute base even in the browser.
   */
  readonly resolveBase?: string
  /** Override the character directory (tests/future community catalog). */
  readonly characterDir?: string
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function currentPageBase(): string {
  if (typeof location !== 'undefined' && typeof location.href === 'string') return location.href
  return 'http://localhost/'
}

/**
 * Load one default character offline-friendly: `character.json` (+ behavior
 * file) through `loadCharacter`, then the hero pack manifest through the same
 * fetcher. Rejects (`HeroRuntimeError`) on HTTP failure, invalid JSON or a
 * behavior whose state tags are missing from the pack.
 */
/**
 * CONSENT / TOS GATE (do not bypass): `loadHeroBundle()` loads character/pack
 * data. Runtime callers that load NON-BUILT-IN (imported/DLC) packs must first
 * pass the consent gate (`loadCharacterPackWithConsent` in
 * src/pet/consent/content.ts); the shipped built-in characters are covered by
 * the first-run TOS. Never add a bypass for imported packs. Mod/DLC authors
 * must keep the disclaimer + gate, use it lawfully, and declare content/
 * licence/source for any pack.
 */
export async function loadHeroBundle(key: HeroCharacterId, options: LoadHeroOptions = {}): Promise<HeroCharacterBundle> {
  const source = HERO_CHARACTER_SOURCES[key]
  if (!source) throw new HeroRuntimeError(`unknown hero character: ${String(key)}`)
  const fetcher = options.fetcher ?? fetch
  const characterDir = options.characterDir ?? source.dir

  let character: LoadedCharacter
  try {
    character = await loadCharacter(characterDir, fetcher)
  } catch (error) {
    throw new HeroRuntimeError(`character "${key}" failed to load from "${characterDir}": ${messageOf(error)}`)
  }
  if (!character.packBase) {
    throw new HeroRuntimeError(`character "${key}" has no packBase (cannot locate its hero pack)`)
  }

  let locator: string
  try {
    const resolved = new URL(character.packBase, options.resolveBase ?? currentPageBase()).toString()
    // Directory locators are joined with relative asset names, so normalise a
    // trailing slash (a bare packBase must not resolve "manifest.json" one level up).
    locator = resolved.endsWith('/') ? resolved : `${resolved}/`
  } catch (error) {
    throw new HeroRuntimeError(`character "${key}" has an unresolvable packBase "${character.packBase}": ${messageOf(error)}`)
  }

  const manifestUrl = new URL('manifest.json', locator).toString()
  let data: CharacterPackData
  try {
    const response = await fetcher(manifestUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    data = validateCharacterPack(await response.json())
  } catch (error) {
    throw new HeroRuntimeError(`hero pack for "${key}" failed to load from "${manifestUrl}": ${messageOf(error)}`)
  }

  const missing = missingTags(character.behavior, Object.keys(data.tags), character.document.fallback ?? {})
  if (missing.length > 0) {
    throw new HeroRuntimeError(
      `missing-tags: character "${key}" needs [${missing.join(', ')}] but pack "${data.id}" only provides [${Object.keys(data.tags).join(', ')}]`,
    )
  }

  // The profile may recommend a bigger future canvas (humanoid: 256) while the
  // actual pack is still 96. Keep both: layout uses `canvas`, QA/profile code
  // can read `canvasTarget`.
  const canvasTarget = character.document.canvasTarget ?? source.canvasTarget

  // Optional tap-region file beside character.json/behavior.json. Missing (404)
  // keeps the legacy whole-actor tap for third-party packs; a malformed file
  // fails closed instead of silently accepting bad coordinates.
  const characterBase = new URL(
    characterDir.endsWith('/') ? characterDir : `${characterDir}/`,
    options.resolveBase ?? currentPageBase(),
  ).toString()
  const regionsUrl = new URL('regions.json', characterBase).toString()
  let regions: HeroRegionConfig | undefined
  try {
    const response = await fetcher(regionsUrl)
    if (response.ok) {
      try {
        regions = parseHeroRegionConfig(await response.json())
      } catch (error) {
        throw new HeroRuntimeError(`character "${key}" has an invalid regions.json: ${messageOf(error)}`)
      }
    } else if (response.status !== 404) {
      throw new HeroRuntimeError(`character "${key}" regions.json failed to load: HTTP ${response.status}`)
    }
  } catch (error) {
    if (error instanceof HeroRuntimeError) throw error
    // Network failure for an optional file: keep the legacy tap behaviour.
  }

  return {
    key,
    character,
    pack: { id: data.id, format: data.style, locator, data: data as unknown },
    tags: data.tags,
    canvas: [data.canvas[0], data.canvas[1]],
    ...(canvasTarget !== undefined ? { canvasTarget: [canvasTarget[0], canvasTarget[1]] as const } : {}),
    ...(regions !== undefined ? { regions } : {}),
  }
}

/** Load several bundles in parallel (order preserved; rejects on the first failure). */
export async function loadHeroBundles(
  keys: readonly HeroCharacterId[],
  options: LoadHeroOptions = {},
): Promise<HeroCharacterBundle[]> {
  return Promise.all(keys.map((key) => loadHeroBundle(key, options)))
}

// ---------------------------------------------------------------------------
// Stage layout (display scale, CSS pixels)
// ---------------------------------------------------------------------------

export interface HeroStageSize {
  readonly width: number
  readonly height: number
}

export interface HeroLayoutSlot {
  /** Actor top-left in CSS pixels on the host canvas. */
  readonly x: number
  readonly y: number
  /** Actor box in CSS pixels (`pack.canvas * scale`); always an integer. */
  readonly width: number
  readonly height: number
}

export interface HeroLayout {
  /** Display scale picked to fit every actor into the measured book. */
  readonly scale: PixelScale
  readonly width: number
  readonly height: number
  readonly slots: readonly HeroLayoutSlot[]
}

/** `pet.css` places `.hero-stage` 18px above the book bottom; keep 2× above it. */
export const HERO_STAGE_BOTTOM_MARGIN = 18

export interface HeroLayoutInput {
  readonly actorCount: number
  /** Pack canvas widths in art pixels, one per actor (96 for the placeholders). */
  readonly artWidths: readonly number[]
  readonly artHeights: readonly number[]
  /** Measured `.book` content box at 1× CSS pixels. */
  readonly stage: HeroStageSize
  /** QA override (`?heroScale=`); normal hosts leave it undefined so the stage self-fits. */
  readonly forceScale?: PixelScale
}

/**
 * Reject a canvas outside both accepted ranges: the new 64..1024 /
 * multiple-of-16 policy and the frozen FCI 0.1 / legacy-pack range (any integer
 * 16..512). Legacy sizes are rendered only at scales that keep them integral
 * (see `exactPixelScales` below).
 */
function requireHeroCanvas(width: number, height: number): void {
  const problem = canvasSizeProblem(width, height)
  if (problem && legacyCanvasSizeProblem(width, height)) {
    throw new HeroRuntimeError(
      `unsupported pack ${problem}; hero canvases must be ${CANVAS_SIZE_MIN}..${CANVAS_SIZE_MAX} art px and a multiple of ${CANVAS_SIZE_ALIGNMENT} (legacy FCI 0.1 / pack canvases: ${LEGACY_CANVAS_SIZE_MIN}..${LEGACY_CANVAS_SIZE_MAX} art px)`,
    )
  }
}

/**
 * Choose the largest supported display scale whose whole actor strip fits the
 * measured book (height minus the 18px bottom margin). Works for every 64..1024
 * canvas: 96@480×240 → 1×, 96@480×272 → 2×, 256@480×336 → 1× (256px),
 * 512/1024@480×240 → 1/4 / 1/8 (both 128px). Returns the smallest supported
 * scale (1/8) when even that overflows, so the result is always deterministic.
 *
 * `forceScale` (from `?heroScale=`) wins for QA/demos. `scales` narrows the
 * candidate list for legacy canvases whose size would not stay integral at every
 * supported scale (e.g. a 100px canvas cannot be displayed at 1/8).
 */
export function pickHeroScale(input: {
  readonly actorCount: number
  readonly artWidth: number
  readonly artHeight: number
  readonly stage: HeroStageSize
  readonly forceScale?: PixelScale
  readonly scales?: readonly PixelScale[]
}): PixelScale {
  if (input.forceScale !== undefined) {
    if (!isPixelScale(input.forceScale)) {
      throw new HeroRuntimeError(
        `unsupported hero display scale ${String(input.forceScale)}; expected one of [${PIXEL_SCALES.join(', ')}]`,
      )
    }
    return input.forceScale
  }
  const count = Math.max(1, Math.floor(Number.isFinite(input.actorCount) ? input.actorCount : 1))
  return fitPixelScale(
    {
      contentWidth: input.artWidth * count,
      contentHeight: input.artHeight,
      maxWidth: input.stage.width,
      maxHeight: (Number.isFinite(input.stage.height) ? input.stage.height : 0) - HERO_STAGE_BOTTOM_MARGIN,
    },
    input.scales,
  )
}

/** Plan one host canvas with left-to-right actor slots (bottom aligned). */
export function planHeroLayout(input: HeroLayoutInput): HeroLayout {
  const count = Math.max(1, Math.floor(Number.isFinite(input.actorCount) ? input.actorCount : 1))
  // An empty array is derived from the other one per actor, never from the 96
  // placeholder: `{artWidths:[256], artHeights:[]}` is a 256×256 stage, not
  // 256×96. Only when BOTH are empty do we keep the documented placeholder
  // default (96), so existing direct callers/tests stay valid.
  const widths =
    input.artWidths.length > 0
      ? input.artWidths
      : input.artHeights.length > 0
        ? input.artHeights
        : [LEGACY_PLACEHOLDER_CANVAS]
  const heights = input.artHeights.length > 0 ? input.artHeights : widths
  // Validate every actor canvas against the shared policy (96/256/1024 pass;
  // legacy 16..512 integer sizes pass; 4/1280/non-integers do not).
  const actorCanvases = Math.max(widths.length, heights.length)
  for (let index = 0; index < actorCanvases; index++) {
    requireHeroCanvas(
      widths[index] ?? widths[0] ?? LEGACY_PLACEHOLDER_CANVAS,
      heights[index] ?? heights[0] ?? LEGACY_PLACEHOLDER_CANVAS,
    )
  }
  const artWidth = Math.max(...widths)
  const artHeight = Math.max(...heights)
  // Only offer scales that keep every actor canvas integral (all six candidates
  // for the 16-aligned new policy; fewer for a legacy 100px canvas). A forced
  // `?heroScale=` that is not exact for the pack still fails loudly in
  // `scaledLength`, which is the desired QA signal.
  const scales = exactPixelScales(artWidth, artHeight).filter((candidate) =>
    widths.every((value) => Number.isInteger(value * candidate)) &&
    heights.every((value) => Number.isInteger(value * candidate)),
  )
  const scale = pickHeroScale({
    actorCount: count,
    artWidth,
    artHeight,
    stage: input.stage,
    scales: scales.length > 0 ? scales : [1],
    ...(input.forceScale !== undefined ? { forceScale: input.forceScale } : {}),
  })
  // scaledLength() throws if a (validated) canvas*scale were ever fractional.
  const slotWidth = scaledLength(artWidth, scale)
  const height = scaledLength(artHeight, scale)
  const width = slotWidth * count
  const slots: HeroLayoutSlot[] = []
  for (let index = 0; index < count; index++) {
    const actorWidth = scaledLength(widths[index] ?? artWidth, scale)
    const actorHeight = scaledLength(heights[index] ?? artHeight, scale)
    slots.push({
      x: index * slotWidth + Math.round((slotWidth - actorWidth) / 2),
      y: height - actorHeight,
      width: actorWidth,
      height: actorHeight,
    })
  }
  return { scale, width, height, slots }
}

// ---------------------------------------------------------------------------
// Runtime: SceneRuntime behaviour + RenderBackend drawing
// ---------------------------------------------------------------------------

const DEFERRED_EVENTS: ReadonlySet<string> = new Set(['talk', 'remind'])
const DEFER_TIMEOUT_MS = 3000
const DEFAULT_ONE_SHOT_MS = 1000

export interface HeroActorRuntime {
  readonly id: string
  readonly key: HeroCharacterId
  readonly bundle: HeroCharacterBundle
  /** Actor top-left on the canvas, CSS pixels. */
  readonly x: number
  readonly y: number
  readonly scale: PixelScale
  /** Draw box, CSS pixels (`pack.canvas * scale`). */
  readonly width: number
  readonly height: number
}

export interface HeroRegionActorHit extends HeroRegionHit {
  readonly actor: HeroActorRuntime
}

export interface HeroEmitOptions {
  readonly actorId?: string
  readonly payload?: unknown
  /** Scene-clock timestamp; defaults to the last tick/render time. */
  readonly atMs?: number
}

export interface HeroEmitResult {
  readonly event: string
  readonly actorId: string
  readonly emitted: boolean
  readonly deferred: boolean
  readonly state: string
  readonly tag: string
}

export interface HeroFrameInfo {
  readonly tag: string
  readonly frame: number
  readonly frames: number
  readonly fps: number
  readonly loop: boolean
  readonly elapsedMs: number
}

export interface HeroSpeechInput {
  readonly text?: string
  readonly emotion?: string
  readonly durationMs?: number
}

export interface HeroSnapshotActor {
  readonly id: string
  readonly key: HeroCharacterId
  readonly state: string
  readonly tag: string
  readonly x: number
  readonly y: number
  readonly scale: PixelScale
}

/** QA-readable runtime snapshot (`window.__pet.qa.heroSnapshot()`). */
export interface HeroSnapshot {
  readonly ok: true
  readonly actorCount: number
  readonly canvas: { readonly width: number; readonly height: number }
  readonly scale: PixelScale
  readonly actors: readonly HeroSnapshotActor[]
  readonly expression: string
  readonly muted: boolean
  readonly mouth: { readonly level: number; readonly ticks: number; readonly active: boolean }
  readonly queued: number
  readonly engine: 'scene-runtime'
}

export interface HeroRuntimeDeps {
  readonly scene: SceneRuntime
  readonly backend: RenderBackend
  readonly bundles: readonly HeroCharacterBundle[]
  readonly layout: HeroLayout
  /** Actor ids, defaults to the character keys (`humanoid`, `cat`, …). */
  readonly actorIds?: readonly string[]
  /** Start in the `sleep` state (night); otherwise `idle`. */
  readonly sleeping?: boolean
}

/**
 * One hero scene: N actors on one host canvas, driven by SceneRuntime.
 *
 * The host (main.ts) owns the canvas + requestAnimationFrame and calls
 * `tick()` then `render()` once per frame; this class never starts a loop.
 * Pointer/kernel/voice side effects stay in main.ts — `emit()`/`speak()` only
 * forward events and record QA state.
 */
export class HeroRuntime {
  readonly scene: SceneRuntime
  readonly backend: RenderBackend
  readonly layout: HeroLayout
  readonly actors: readonly HeroActorRuntime[]

  private readonly entryById = new Map<string, HeroActorRuntime>()
  private readonly cueState = new Map<string, { tag: string; sinceMs: number }>()
  private readonly pending: Array<{ actorId: string; event: string; atMs: number; payload?: unknown }> = []
  private expression = 'calm'
  private muted = false
  private night: boolean
  private mouthStartMs = 0
  private mouthDurationMs = 0
  private mouthTicks = 0
  private lastKnownMs = 0
  private disposed = false

  constructor(deps: HeroRuntimeDeps) {
    if (deps.bundles.length === 0) throw new HeroRuntimeError('hero runtime needs at least one character bundle')
    if (deps.bundles.length > MAX_HERO_ACTORS) {
      throw new HeroRuntimeError(`hero runtime supports at most ${MAX_HERO_ACTORS} actors, got ${deps.bundles.length}`)
    }
    this.scene = deps.scene
    this.backend = deps.backend
    this.layout = deps.layout
    this.night = deps.sleeping === true

    const entries: HeroActorRuntime[] = []
    for (const [index, bundle] of deps.bundles.entries()) {
      const id = deps.actorIds?.[index] ?? bundle.key
      if (this.entryById.has(id)) throw new HeroRuntimeError(`duplicate hero actor id: ${id}`)
      const slot = deps.layout.slots[index]
      if (!slot) throw new HeroRuntimeError(`hero layout is missing a slot for actor "${id}"`)
      // Enrich the FCI document with the pack tags so SceneRuntime one-shot
      // durations (`after`) match the real animation lengths (600ms pat, …).
      const document: CharacterDocument = { ...bundle.character.document, tags: bundle.tags }
      this.scene.spawn({
        id,
        document,
        behavior: bundle.character.behavior,
        x: slot.x,
        y: slot.y,
        zIndex: index,
        scale: deps.layout.scale,
        ...(deps.sleeping === true ? { initialState: 'sleep' } : {}),
      })
      const entry: HeroActorRuntime = {
        id,
        key: bundle.key,
        bundle,
        x: slot.x,
        y: slot.y,
        scale: deps.layout.scale,
        width: slot.width,
        height: slot.height,
      }
      entries.push(entry)
      this.entryById.set(id, entry)
      this.cueState.set(id, { tag: this.scene.get(id).tag, sinceMs: 0 })
    }
    this.actors = entries
  }

  get canvasSize(): { readonly width: number; readonly height: number } {
    return { width: this.layout.width, height: this.layout.height }
  }

  /** Last scene-clock timestamp observed by `tick`/`render`/`emit`. */
  get nowMs(): number {
    return this.lastKnownMs
  }

  /**
   * Forward one host event to a single actor (default: the first actor).
   * `talk`/`remind` are "at-end" cues: while a one-shot reaction (pat/land/
   * remind) is still playing they are queued instead of interrupting it.
   */
  emit(event: string, options: HeroEmitOptions = {}): HeroEmitResult {
    this.assertUsable()
    const first = this.actors[0]
    const actorId = options.actorId ?? first?.id
    if (!actorId) throw new HeroRuntimeError('hero runtime has no actors')
    const atMs = options.atMs ?? this.lastKnownMs
    this.lastKnownMs = Math.max(this.lastKnownMs, atMs)

    if (DEFERRED_EVENTS.has(event) && this.isCueBusy(actorId, atMs)) {
      this.pending.push({ actorId, event, atMs, ...(options.payload !== undefined ? { payload: options.payload } : {}) })
      return this.describeEmit(event, actorId, false, true)
    }

    this.scene.emit(event, {
      actorId,
      atMs,
      ...(options.payload !== undefined ? { payload: options.payload } : {}),
    })
    this.syncCueTags(atMs)
    return this.describeEmit(event, actorId, true, false)
  }

  /** Broadcast an event to every actor (e.g. `sleep`/`wake` from the host clock). */
  broadcast(event: string, atMs = this.lastKnownMs): void {
    this.assertUsable()
    this.lastKnownMs = Math.max(this.lastKnownMs, atMs)
    this.scene.broadcast(event, { atMs })
    this.syncCueTags(atMs)
  }

  /** Advance behaviour (4 Hz internally) + flush at-end cues. Host calls per frame. */
  tick(nowMs: number): SceneTickResult {
    this.assertUsable()
    const atMs = Math.max(nowMs, this.lastKnownMs)
    const dtMs = Math.max(0, atMs - this.lastKnownMs)
    this.lastKnownMs = atMs
    const result = this.scene.tick(atMs, dtMs)
    this.syncCueTags(atMs)
    this.flushPending(atMs)
    return result
  }

  /**
   * Draw one frame: clear once, then draw every actor through the backend in
   * z order. Frame time is the time since the actor's tag changed, so 1-shot
   * tags clamp on their last frame and loop tags wrap (`hero.ts` math).
   */
  render(ctx: CanvasRenderingContext2D, nowMs: number): void {
    this.assertUsable()
    this.lastKnownMs = Math.max(this.lastKnownMs, nowMs)
    const { width, height } = this.layout
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, width, height)
    for (const entry of this.sortedEntries()) {
      const sceneActor = this.scene.get(entry.id)
      const tag = this.renderableTag(entry)
      const since = this.cueSince(entry, nowMs)
      const renderable: RenderableActor = {
        id: entry.id,
        pack: entry.bundle.pack,
        tag,
        x: entry.x,
        y: entry.y,
        scale: entry.scale,
        z: sceneActor.zIndex,
      }
      this.backend.render(ctx, actorView(renderable, Math.max(0, nowMs - since)), nowMs)
    }
    if (this.mouthLevel(nowMs) > 0) this.mouthTicks += 1
  }

  /**
   * Cheap dirty-frame signature: only redraw the host canvas when an actor's
   * tag/frame/position/layout or the mouth level changed. The scene clock still
   * ticks every rAF, so behaviour timing is unaffected.
   */
  renderKey(nowMs = this.lastKnownMs): string {
    const parts = this.sortedEntries().map((entry) => {
      const frame = this.actorFrame(entry.id, nowMs)
      const zIndex = this.scene.get(entry.id).zIndex
      return `${entry.id}:${frame?.tag ?? ''}:${frame?.frame ?? -1}:${entry.x}:${entry.y}:${entry.scale}:${zIndex}`
    })
    parts.push(`mouth:${this.mouthLevel(nowMs).toFixed(3)}`, `layout:${this.layout.width}x${this.layout.height}`)
    return parts.join('|')
  }

  /** Current tag/frame for one actor at `nowMs` (QA + animation tests). */
  actorFrame(actorId: string, nowMs = this.lastKnownMs): HeroFrameInfo | null {
    const entry = this.entryById.get(actorId)
    if (!entry) return null
    const tag = this.renderableTag(entry)
    const meta = entry.bundle.tags[tag]
    if (!meta) return null
    const elapsedMs = Math.max(0, nowMs - this.cueSince(entry, nowMs))
    return {
      tag,
      frame: frameIndexFor(meta, elapsedMs),
      frames: meta.frames,
      fps: meta.fps,
      loop: meta.loop,
      elapsedMs,
    }
  }

  /** Topmost actor whose draw box contains this canvas-local CSS pixel point. */
  hitActor(x: number, y: number): HeroActorRuntime | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    for (const entry of this.sortedEntries().reverse()) {
      if (x >= entry.x && x < entry.x + entry.width && y >= entry.y && y < entry.y + entry.height) return entry
    }
    return null
  }

  /** Current behavior state for one actor (null if the actor does not exist). */
  actorState(actorId: string): string | null {
    const entry = this.entryById.get(actorId)
    if (!entry) return null
    return this.scene.get(entry.id).behavior.state
  }

  /**
   * Topmost actor + tap region under this canvas-local CSS point. The point is
   * converted back to ART pixels by the actor's layout scale, so the regions
   * stay identical at 1x/2x/4x. Returns null for transparent zones, actors
   * without a regions file, or points outside every declared region.
   */
  hitRegion(x: number, y: number): HeroRegionActorHit | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    for (const entry of this.sortedEntries().reverse()) {
      const config = entry.bundle.regions
      if (!config) continue
      const hit = heroRegionHitAt(entry, config, x, y)
      if (hit) return { actor: entry, ...hit }
    }
    return null
  }

  /**
   * Speech hook for `say()`: records the expression/mouth envelope and requests
   * the `talk` tag cue (deferred while a pat/land reaction is playing).
   * `hero.ts` expression/mouth setters are still visual no-ops — this is the
   * call chain + QA state, not pixel lip-sync.
   */
  speak(input: HeroSpeechInput = {}): HeroEmitResult {
    this.assertUsable()
    const nowMs = this.lastKnownMs
    const emotion = input.emotion === 'happy' ? 'pleased' : input.emotion === 'listening' ? 'listening' : 'calm'
    this.expression = emotion
    const duration = Math.max(120, Math.round(input.durationMs ?? (input.text ? input.text.length * 120 : 320)))
    this.mouthStartMs = nowMs
    this.mouthDurationMs = duration
    return this.emit('talk', { atMs: nowMs })
  }

  /** Mood → expression (tracked for QA; renderer pixels unchanged in Phase 2). */
  syncMood(input: { readonly happy?: boolean; readonly sleepy?: boolean }): void {
    this.expression = input.sleepy ? 'sleepy' : input.happy ? 'pleased' : 'calm'
  }

  setExpression(name: string): void {
    if (typeof name !== 'string' || name.length === 0) return
    this.expression = name
  }

  setMuted(muted: boolean): void {
    this.muted = muted === true
  }

  /** Night/day transition: sleep only idle actors; wake sleepers in the morning. */
  setNight(night: boolean): void {
    if (this.night === night) return
    this.night = night
    for (const entry of this.actors) {
      const state = this.scene.get(entry.id).behavior.state
      if (night && state === 'idle') this.emit('sleep', { actorId: entry.id, atMs: this.lastKnownMs })
      else if (!night && state === 'sleep') this.emit('wake', { actorId: entry.id, atMs: this.lastKnownMs })
    }
  }

  /** Deterministic 0..1 mouth envelope (3.3 Hz triangle); 0 when not speaking. */
  mouthLevel(nowMs: number): number {
    if (this.mouthDurationMs <= 0) return 0
    const elapsed = nowMs - this.mouthStartMs
    if (elapsed < 0 || elapsed > this.mouthDurationMs) return 0
    const phase = (elapsed % 240) / 240
    return phase < 0.5 ? phase * 2 : (1 - phase) * 2
  }

  snapshot(): HeroSnapshot {
    return {
      ok: true,
      actorCount: this.actors.length,
      canvas: this.canvasSize,
      scale: this.layout.scale,
      actors: this.actors.map((entry) => {
        const sceneActor = this.scene.get(entry.id)
        return {
          id: entry.id,
          key: entry.key,
          state: sceneActor.behavior.state,
          tag: this.renderableTag(entry),
          x: entry.x,
          y: entry.y,
          scale: entry.scale,
        }
      }),
      expression: this.expression,
      muted: this.muted,
      mouth: {
        level: this.mouthLevel(this.lastKnownMs),
        ticks: this.mouthTicks,
        active: this.lastKnownMs < this.mouthStartMs + this.mouthDurationMs,
      },
      queued: this.pending.length,
      engine: 'scene-runtime',
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.pending.length = 0
    try {
      this.backend.dispose()
    } catch {
      // Best effort: a failed dispose must not block the DOM fallback.
    }
  }

  // -- internals ----------------------------------------------------------

  private assertUsable(): void {
    if (this.disposed) throw new HeroRuntimeError('hero runtime already disposed')
  }

  private describeEmit(event: string, actorId: string, emitted: boolean, deferred: boolean): HeroEmitResult {
    const sceneActor = this.scene.get(actorId)
    return {
      event,
      actorId,
      emitted,
      deferred,
      state: sceneActor.behavior.state,
      tag: sceneActor.tag,
    }
  }

  private sortedEntries(): HeroActorRuntime[] {
    return [...this.actors].sort((left, right) => {
      const leftZ = this.scene.get(left.id).zIndex
      const rightZ = this.scene.get(right.id).zIndex
      if (leftZ !== rightZ) return leftZ - rightZ
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
    })
  }

  /** Tag change time: animation restarts whenever the behaviour tag changes. */
  private cueSince(entry: HeroActorRuntime, nowMs: number): number {
    const cue = this.cueState.get(entry.id)
    if (!cue) return nowMs
    return cue.tag === this.scene.get(entry.id).tag ? cue.sinceMs : nowMs
  }

  private syncCueTags(nowMs: number): void {
    for (const entry of this.actors) {
      const next = this.scene.get(entry.id).tag
      const current = this.cueState.get(entry.id)
      if (!current || current.tag !== next) this.cueState.set(entry.id, { tag: next, sinceMs: nowMs })
    }
  }

  private transientDurationMs(actorId: string, stateName: string): number | null {
    const sceneActor = this.scene.get(actorId)
    const state = sceneActor.profile.states[stateName]
    if (!state) return null
    if (state.timeoutMs !== undefined) return state.timeoutMs
    if (state.after === undefined) return null
    const meta = this.entryById.get(actorId)?.bundle.tags[state.tag]
    if (meta?.holdMs && meta.holdMs.length === meta.frames) {
      return meta.holdMs.reduce((sum, hold) => sum + Math.max(0, hold), 0)
    }
    if (meta && meta.fps > 0 && meta.frames > 0) return (meta.frames / meta.fps) * 1000
    return DEFAULT_ONE_SHOT_MS
  }

  /** True while a one-shot reaction is still playing (talk/remind wait for it). */
  private isCueBusy(actorId: string, nowMs: number): boolean {
    const sceneActor = this.scene.get(actorId)
    const duration = this.transientDurationMs(actorId, sceneActor.behavior.state)
    if (duration === null) return false
    return nowMs - sceneActor.stateEnteredAtMs < duration
  }

  private flushPending(nowMs: number): void {
    if (this.pending.length === 0) return
    const remaining: typeof this.pending = []
    for (const entry of this.pending) {
      if (this.isCueBusy(entry.actorId, nowMs)) {
        if (nowMs - entry.atMs <= DEFER_TIMEOUT_MS) remaining.push(entry)
        continue
      }
      this.scene.emit(entry.event, {
        actorId: entry.actorId,
        atMs: nowMs,
        ...(entry.payload !== undefined ? { payload: entry.payload } : {}),
      })
    }
    this.pending.length = 0
    this.pending.push(...remaining)
    this.syncCueTags(nowMs)
  }

  /** Resolve the state tag through the character fallback chain; never unknown. */
  private renderableTag(entry: HeroActorRuntime): string {
    const available = new Set(Object.keys(entry.bundle.tags))
    const raw = this.scene.get(entry.id).tag
    if (available.has(raw)) return raw
    const fallback = entry.bundle.character.document.fallback ?? {}
    const resolved = resolveFallbackTag(raw, available, fallback)
    if (resolved) return resolved
    if (available.has('idle')) return 'idle'
    const first = Object.keys(entry.bundle.tags)[0]
    if (first) return first
    throw new HeroRuntimeError(`character "${entry.key}" has no animation tags`)
  }
}

// ---------------------------------------------------------------------------
// Bootstrap: load → backend → first frame gate
// ---------------------------------------------------------------------------

/** Minimal canvas surface the host must provide (real `HTMLCanvasElement`). */
export interface HeroCanvasTarget {
  width: number
  height: number
  style: { width: string; height: string }
}

export interface StartHeroRuntimeOptions {
  readonly config: HeroConfig
  readonly canvas: HeroCanvasTarget
  readonly ctx: CanvasRenderingContext2D
  /** Measured `.book` content box, CSS pixels. */
  readonly stage: HeroStageSize
  /**
   * Device-pixel-ratio the host renders at (default 1). The canvas backing store
   * becomes `round(layout * dpr)` while the CSS size stays `layout` (CSS px),
   * and the 2D context gets `setTransform(dpr, 0, 0, dpr, 0, 0)` so backends
   * keep drawing in CSS pixels. Hosts pass `window.devicePixelRatio`; a
   * non-finite/non-positive value falls back to 1. Pointer/hit-test coordinates
   * remain CSS pixels.
   */
  readonly dpr?: number
  readonly fetcher?: typeof fetch
  readonly registry?: RendererRegistry
  /** Test/embedder hook: replace the first-party hero backend. */
  readonly createBackend?: (pack: RenderPackRef) => RenderBackend
  /** Test/embedder hook: replace character/pack loading. */
  readonly loadBundle?: (key: HeroCharacterId) => Promise<HeroCharacterBundle>
  readonly seed?: number
  readonly sleeping?: boolean
  readonly actorIds?: readonly string[]
}

export type HeroStartResult =
  | { readonly ok: true; readonly runtime: HeroRuntime }
  | { readonly ok: false; readonly reason: string; readonly error?: unknown }

/**
 * Feature-flagged hero bootstrap. This is the ONE place that turns config +
 * DOM canvas into a running scene. Any failure returns `{ok:false, reason}`
 * and the caller keeps the legacy folded-paper DOM visible (single direction:
 * no retry, no save writes, no localStorage writes).
 */
export async function startHeroRuntime(options: StartHeroRuntimeOptions): Promise<HeroStartResult> {
  if (!options.config.enabled) return { ok: false, reason: 'flag-off' }

  const keys = options.config.actors.length > 0 ? options.config.actors : [options.config.character]
  let bundles: HeroCharacterBundle[]
  try {
    bundles = await Promise.all(
      keys.map((key) =>
        options.loadBundle ? options.loadBundle(key) : loadHeroBundle(key, { fetcher: options.fetcher }),
      ),
    )
  } catch (error) {
    return { ok: false, reason: `load-failed: ${messageOf(error)}`, error }
  }
  if (bundles.length === 0) return { ok: false, reason: 'load-failed: no character bundles' }

  let layout: HeroLayout
  try {
    layout = planHeroLayout({
      actorCount: bundles.length,
      artWidths: bundles.map((bundle) => bundle.canvas[0]),
      artHeights: bundles.map((bundle) => bundle.canvas[1]),
      stage: options.stage,
      ...(options.config.scale !== undefined ? { forceScale: options.config.scale } : {}),
    })
  } catch (error) {
    return { ok: false, reason: `layout-failed: ${messageOf(error)}`, error }
  }

  // DPR-aware backing store: CSS size stays the fitted layout (pointer/hitTest
  // coordinates are CSS px), the bitmap is rendered at device resolution, and
  // the context transform keeps every backend drawing in CSS px.
  const dpr =
    typeof options.dpr === 'number' && Number.isFinite(options.dpr) && options.dpr > 0 ? options.dpr : 1
  options.canvas.width = Math.round(layout.width * dpr)
  options.canvas.height = Math.round(layout.height * dpr)
  options.canvas.style.width = `${layout.width}px`
  options.canvas.style.height = `${layout.height}px`
  options.ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0)
  options.ctx.imageSmoothingEnabled = false

  let backend: RenderBackend | null = null
  try {
    const first = bundles[0]!.pack
    const registry = options.registry ?? new RendererRegistry([heroRendererPlugin])
    backend = options.createBackend ? options.createBackend(first) : registry.create(first)
    const loaded = new Set<string>()
    for (const bundle of bundles) {
      if (loaded.has(bundle.pack.id)) continue
      await backend.load(bundle.pack)
      loaded.add(bundle.pack.id)
    }
  } catch (error) {
    try {
      backend?.dispose()
    } catch {}
    return { ok: false, reason: `pack-load-failed: ${messageOf(error)}`, error }
  }

  try {
    const runtime = new HeroRuntime({
      scene: new SceneRuntime({ seed: options.seed ?? 1 }),
      backend,
      bundles,
      layout,
      ...(options.actorIds !== undefined ? { actorIds: options.actorIds } : {}),
      ...(options.sleeping === true ? { sleeping: true } : {}),
    })
    // First-frame gate: only switch the page to hero mode after this succeeds.
    runtime.render(options.ctx, 0)
    return { ok: true, runtime }
  } catch (error) {
    try {
      backend.dispose()
    } catch {}
    return { ok: false, reason: `first-frame-failed: ${messageOf(error)}`, error }
  }
}
