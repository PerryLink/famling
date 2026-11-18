/**
 * Pixel-art canvas size + display-scale policy shared by the hero renderer
 * (`hero.ts`), the render contract (`render/types.ts`) and the scene runtime
 * (`scene/types.ts`).
 *
 * ## Canvas size (art pixels)
 *
 * A NEW character art canvas (FCI 0.2/0.3) is `CANVAS_SIZE_MIN..CANVAS_SIZE_MAX`
 * pixels per side (64..1024) and a multiple of `CANVAS_SIZE_ALIGNMENT` (16). The
 * shipped placeholders are 96×96 (`public/assets/pet/*-placeholder`), the new
 * humanoid authoring target is 256×256 (`public/characters/humanoid-default`),
 * and the range also covers 64/128/512/1024. The 16px alignment is what makes
 * every supported display scale exact: `16 * 1/8 = 2` and `16 * 4 = 64`, so a
 * canvas backing store is always an integer for any combination below.
 *
 * FCI 0.1 is frozen: 0.1 documents and legacy `hero.ts` pack manifests (no
 * apiVersion) keep the old any-integer 16..512 range, including sizes that the
 * new policy rejects (48×48, 100×96). They still render, but only at display
 * scales that keep their lengths integral (`exactPixelScales`).
 *
 * ## Display scale
 *
 * A character is drawn at an integer upscale (1×, 2×, 4×) or an integer
 * reciprocal downscale (1/2, 1/4, 1/8) of its art pixels. Rationale: a 1024px
 * canvas must fit the 480px-wide pet window (`.book` ≈ 300×187 at 480×240) so
 * 1×-only is not enough, while fractional upscales like 1.5× would produce
 * blurred/uneven pixels. Downscales are nearest-neighbour
 * (`imageSmoothingEnabled = false`) so they stay crisp instead of blurred. The
 * pet window goal is 480×336 (`docs/DESKTOP-PET-UX-2026-11-16.md`); with the
 * desktop `.book` = the whole window a 256 canvas renders 1:1 (256px).
 *
 * The canvas backing store is `artPixels * displayScale` and the CSS size is
 * that same integer size. On high-DPI displays the host sizes the backing store
 * to `round(cssSize * devicePixelRatio)` and sets `ctx.setTransform(dpr, 0, 0,
 * dpr, 0, 0)`, so drawing stays in CSS pixels but rasterises at device
 * resolution (no compositor blur of a low-res canvas). The display scale itself
 * is still chosen in CSS pixels by the layout; integer device-pixel (N-first)
 * scale selection is a separate follow-up.
 */

/** Smallest supported character-pack canvas side, in art pixels (FCI 0.2/0.3). */
export const CANVAS_SIZE_MIN = 64

/** Largest supported character-pack canvas side, in art pixels (FCI 0.2/0.3). */
export const CANVAS_SIZE_MAX = 1024

/**
 * FCI 0.1 (frozen, published interface) canvas range: any integer 16..512.
 * 0.1 documents and legacy `hero.ts` pack manifests keep loading unchanged; the
 * runtime accepts them but new art must use `CANVAS_SIZE_MIN..CANVAS_SIZE_MAX`
 * with 16px alignment (see `canvasSizeProblem`). A legacy 0.1 canvas outside
 * the new policy gets a `CANVAS_LEGACY` warning from `validateCharacterDocument`
 * and is only rendered at scales that keep its math integral.
 */
export const LEGACY_CANVAS_SIZE_MIN = 16
export const LEGACY_CANVAS_SIZE_MAX = 512

/** Canvas sides must be multiples of this to keep every display scale exact. */
export const CANVAS_SIZE_ALIGNMENT = 16

/**
 * Supported display scales, **largest first** so fit selection can scan from
 * "most detail" down to "fits the window". `1/2`, `1/4` and `1/8` are integer
 * reciprocal downscales, not arbitrary fractions.
 */
export const PIXEL_SCALES = Object.freeze([4, 2, 1, 0.5, 0.25, 0.125] as const)

/** Display scale: integer upscale (1/2/4) or integer reciprocal downscale (1/2,1/4,1/8). */
export type PixelScale = (typeof PIXEL_SCALES)[number]

/** Most downscaled supported display scale (1/8), used when nothing fits. */
export const MIN_PIXEL_SCALE: PixelScale = 0.125

/** Largest supported display scale (4×). */
export const MAX_PIXEL_SCALE: PixelScale = 4

/** Integer-ratio form of a display scale (`0.25` → numerator 1, denominator 4). */
export interface PixelScaleRatio {
  readonly numerator: number
  readonly denominator: number
}

/** Human-readable reason a display scale is unsupported (wrapped by layer errors). */
export function unsupportedScaleMessage(value: unknown, what = 'display scale'): string {
  return `${what} must be one of [${PIXEL_SCALES.join(', ')}] (integer upscale or integer reciprocal downscale), got ${String(value)}`
}

/** True for a supported display scale (4, 2, 1, 0.5, 0.25, 0.125). */
export function isPixelScale(value: unknown): value is PixelScale {
  return typeof value === 'number' && (PIXEL_SCALES as readonly number[]).includes(value)
}

/** Assert a supported display scale; throws `RangeError` with the allowed list. */
export function assertPixelScale(value: unknown, what = 'display scale'): PixelScale {
  if (!isPixelScale(value)) throw new RangeError(unsupportedScaleMessage(value, what))
  return value
}

/** Integer numerator/denominator for a supported display scale (never a float ratio). */
export function pixelScaleRatio(scale: PixelScale): PixelScaleRatio {
  if (scale >= 1) return { numerator: scale, denominator: 1 }
  return { numerator: 1, denominator: Math.round(1 / scale) }
}

/**
 * Scale one art-pixel length by a display scale. Always an integer for a valid
 * canvas side (multiple of 16) and a supported `PixelScale`; throws otherwise so
 * a canvas backing store can never silently become fractional.
 */
export function scaledLength(length: number, scale: PixelScale): number {
  const scaled = length * scale
  if (!Number.isInteger(scaled)) {
    throw new RangeError(
      `display scale ${scale} would make ${length} art pixels non-integer (${scaled}); use a canvas size that is a multiple of ${CANVAS_SIZE_ALIGNMENT}`,
    )
  }
  return scaled
}

/** Canvas backing-store/CSS size in px for an art canvas at a display scale. */
export function scaledCanvasSize(
  canvas: readonly [number, number],
  scale: PixelScale,
): { readonly width: number; readonly height: number } {
  return { width: scaledLength(canvas[0], scale), height: scaledLength(canvas[1], scale) }
}

/**
 * Why a canvas side is invalid, or `null` when it is supported. Callers wrap the
 * message in their own error type (`CharacterPackError`, `CharacterInterfaceError`,
 * `HeroRuntimeError`) so the policy lives in exactly one place.
 */
export function canvasSizeProblem(width: unknown, height: unknown): string | null {
  const sides: ReadonlyArray<readonly [string, unknown]> = [
    ['width', width],
    ['height', height],
  ]
  for (const [axis, value] of sides) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return `canvas ${axis} must be an integer in [${CANVAS_SIZE_MIN},${CANVAS_SIZE_MAX}], got ${String(value)}`
    }
    if (value < CANVAS_SIZE_MIN || value > CANVAS_SIZE_MAX) {
      return `canvas ${axis} must be in [${CANVAS_SIZE_MIN},${CANVAS_SIZE_MAX}], got ${value}`
    }
    if (value % CANVAS_SIZE_ALIGNMENT !== 0) {
      return `canvas ${axis} must be a multiple of ${CANVAS_SIZE_ALIGNMENT}, got ${value}`
    }
  }
  return null
}

/** True when both canvas sides are supported art sizes (new 0.2/0.3 policy). */
export function isSupportedCanvasSize(width: unknown, height: unknown): boolean {
  return canvasSizeProblem(width, height) === null
}

/**
 * Why an FCI 0.1 / legacy-pack canvas side is invalid, or `null` when it is an
 * integer in `[LEGACY_CANVAS_SIZE_MIN, LEGACY_CANVAS_SIZE_MAX]` (16..512).
 *
 * 0.1 is a frozen, published interface: 0.1 documents and legacy `hero.ts`
 * pack manifests (which have no apiVersion) must keep loading, including sizes
 * such as 32/48/100 that the 0.2+ policy rejects. Callers accept the union:
 * `canvasSizeProblem() === null || legacyCanvasSizeProblem() === null`.
 */
export function legacyCanvasSizeProblem(width: unknown, height: unknown): string | null {
  const sides: ReadonlyArray<readonly [string, unknown]> = [
    ['width', width],
    ['height', height],
  ]
  for (const [axis, value] of sides) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      return `legacy canvas ${axis} must be an integer in [${LEGACY_CANVAS_SIZE_MIN},${LEGACY_CANVAS_SIZE_MAX}], got ${String(value)}`
    }
    if (value < LEGACY_CANVAS_SIZE_MIN || value > LEGACY_CANVAS_SIZE_MAX) {
      return `legacy canvas ${axis} must be in [${LEGACY_CANVAS_SIZE_MIN},${LEGACY_CANVAS_SIZE_MAX}], got ${value}`
    }
  }
  return null
}

/** True when both canvas sides are a valid FCI 0.1 / legacy-pack size. */
export function isLegacyCanvasSize(width: unknown, height: unknown): boolean {
  return legacyCanvasSizeProblem(width, height) === null
}

/**
 * Display scales that keep `width`/`height` art pixels integral (always includes
 * 1, 2, 4; reciprocal downscales are dropped when they would produce a fraction,
 * e.g. a legacy 100px canvas only supports 1/2 and 1/4). Used by the layout so a
 * legacy canvas is never multiplied/divided into a fractional backing store.
 */
export function exactPixelScales(width: number, height: number): PixelScale[] {
  return PIXEL_SCALES.filter(
    (scale) => Number.isInteger(width * scale) && Number.isInteger(height * scale),
  )
}

export interface PixelScaleFitInput {
  /** Content box that will be scaled (CSS px for the display scale). */
  readonly contentWidth: number
  readonly contentHeight: number
  /** Available display box (CSS px). */
  readonly maxWidth: number
  readonly maxHeight: number
}

/**
 * Pick the largest supported display scale whose content box fits the available
 * box (both axes). `scales` defaults to every supported scale but callers with
 * legacy canvases pass `exactPixelScales()` so the result can always be applied
 * without fractions. Falls back to the smallest candidate when nothing fits, so
 * the result is deterministic for absurd windows; non-finite maxima are treated
 * as 0. Throws for a non-positive content size so layout bugs surface.
 */
export function fitPixelScale(
  input: PixelScaleFitInput,
  scales: readonly PixelScale[] = PIXEL_SCALES,
): PixelScale {
  const { contentWidth, contentHeight } = input
  if (!(contentWidth > 0) || !Number.isFinite(contentWidth) || !(contentHeight > 0) || !Number.isFinite(contentHeight)) {
    throw new RangeError(`fitPixelScale needs a positive finite content size, got ${contentWidth}x${contentHeight}`)
  }
  const candidates = scales.length > 0 ? scales : PIXEL_SCALES
  const maxWidth = Number.isFinite(input.maxWidth) ? Math.max(0, input.maxWidth) : 0
  const maxHeight = Number.isFinite(input.maxHeight) ? Math.max(0, input.maxHeight) : 0
  for (const scale of candidates) {
    if (contentWidth * scale <= maxWidth && contentHeight * scale <= maxHeight) return scale
  }
  return candidates[candidates.length - 1] ?? MIN_PIXEL_SCALE
}
