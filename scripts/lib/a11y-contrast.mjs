/**
 * WCAG 2.1 contrast math shared by the real-browser a11y gate.
 *
 * This module is deliberately dependency-free and side-effect free:
 *  - `scripts/lib/a11y-scan.mjs` stringifies these functions and injects them
 *    into the page (so browser and Node use the exact same formula);
 *  - `tests/a11y-contrast.test.ts` pins the WCAG reference values.
 *
 * Sources of truth:
 *  - WCAG 2.1 SC 1.4.3 Contrast (Minimum): 4.5:1 normal text, 3:1 large text.
 *  - WCAG 2.1 SC 1.4.11 Non-text Contrast: 3:1 for UI components/graphics.
 *  - WCAG definition of relative luminance (sRGB, 0.04045 threshold).
 *  - "Large text" = 18pt (24px) normal, or 14pt (18.66px) bold.
 *
 * The in-page scanner feeds computed-style strings ("rgb(…)") and opaque
 * background colours here. Wide-gamut `color(display-p3 …)` values are not
 * parsed (the scanner records them as skipped instead of guessing).
 */

/** Minimum contrast ratios from WCAG 2.1. */
export const WCAG_MIN_CONTRAST = Object.freeze({
  normalText: 4.5,
  largeText: 3,
  nonText: 3,
})

/** Bold threshold used by the WCAG large-text definition. */
export const BOLD_FONT_WEIGHT = 700

/** 18pt == 24px; 14pt == 18.6667px. */
export const LARGE_TEXT_PX = Object.freeze({
  normal: 24,
  bold: 18.6667,
})

/**
 * Parse a CSS colour string as emitted by `getComputedStyle`.
 * Supports #rgb/#rgba/#rrggbb/#rrggbbaa, rgb()/rgba() (comma or space syntax,
 * percentages, slash alpha) and the `transparent` keyword.
 *
 * @param {string} input
 * @returns {{r: number, g: number, b: number, a: number} | null} null when the
 *   value cannot be interpreted (the caller records a "skipped" entry).
 */
export function parseCssColor(input) {
  // Helpers are declared inside this function so the function is fully
  // self-contained when stringified into the page by a11y-scan.mjs.
  const hexPattern = /^[0-9a-f]+$/
  const clampByte = (value) => {
    if (!Number.isFinite(value)) return null
    return Math.min(255, Math.max(0, Math.round(value)))
  }
  const parseHexColor = (hex) => {
    if (!hexPattern.test(hex)) return null
    const bytes = []
    for (let index = 0; index < hex.length; index += 2) {
      bytes.push(parseInt(hex.slice(index, index + 2), 16))
    }
    return { r: bytes[0], g: bytes[1], b: bytes[2], a: bytes.length === 4 ? bytes[3] / 255 : 1 }
  }
  if (typeof input !== 'string') return null
  const value = input.trim().toLowerCase()
  if (value === '') return null
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }

  if (value.startsWith('#')) {
    const hex = value.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const expanded = hex
        .split('')
        .map((character) => character + character)
        .join('')
      return parseHexColor(expanded)
    }
    if (hex.length === 6 || hex.length === 8) return parseHexColor(hex)
    return null
  }

  const rgbMatch = value.match(/^rgba?\(([^)]*)\)$/)
  if (!rgbMatch) return null
  const parts = rgbMatch[1]
    .split(/[\s,/]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  if (parts.length < 3 || parts.length > 4) return null

  const parseChannel = (raw) => {
    const isPercent = raw.endsWith('%')
    const numeric = Number.parseFloat(isPercent ? raw.slice(0, -1) : raw)
    if (!Number.isFinite(numeric)) return null
    const scaled = isPercent ? (numeric / 100) * 255 : numeric
    return clampByte(scaled)
  }
  const r = parseChannel(parts[0])
  const g = parseChannel(parts[1])
  const b = parseChannel(parts[2])
  if (r === null || g === null || b === null) return null

  let a = 1
  if (parts.length === 4) {
    const rawAlpha = parts[3]
    const numeric = Number.parseFloat(rawAlpha.endsWith('%') ? rawAlpha.slice(0, -1) : rawAlpha)
    if (!Number.isFinite(numeric)) return null
    a = Math.min(1, Math.max(0, rawAlpha.endsWith('%') ? numeric / 100 : numeric))
  }
  return { r, g, b, a }
}

/**
 * WCAG relative luminance of an opaque RGB colour. Alpha is ignored; the caller
 * must composite translucent colours over their background first.
 *
 * @param {{r: number, g: number, b: number}} color
 * @returns {number} luminance in [0, 1]
 */
export function relativeLuminance(color) {
  const channel = (raw) => {
    const normalized = Math.min(255, Math.max(0, Number(raw))) / 255
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/**
 * Alpha-composite a foreground colour over an opaque background colour.
 *
 * @param {{r: number, g: number, b: number, a: number}} foreground
 * @param {{r: number, g: number, b: number, a?: number}} background must be opaque
 * @returns {{r: number, g: number, b: number, a: number}}
 */
export function compositeOver(foreground, background) {
  const alpha = foreground.a
  if (alpha >= 0.999) return { r: foreground.r, g: foreground.g, b: foreground.b, a: 1 }
  const mix = (front, back) => front * alpha + back * (1 - alpha)
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: 1,
  }
}

/**
 * WCAG contrast ratio between two colours. A translucent foreground is first
 * composited over the background; a translucent background is an error because
 * the true backdrop is unknown (the scanner should skip those elements).
 *
 * @param {{r: number, g: number, b: number, a: number}} foreground
 * @param {{r: number, g: number, b: number, a: number}} background
 * @returns {number} ratio in [1, 21]
 */
export function contrastRatio(foreground, background) {
  if (!foreground || !background) throw new TypeError('contrastRatio requires two parsed colours')
  if (Number.isFinite(background.a) && background.a < 0.999) {
    throw new TypeError('contrastRatio requires an opaque background colour')
  }
  const effectiveForeground = Number.isFinite(foreground.a) && foreground.a < 0.999 ? compositeOver(foreground, background) : foreground
  const foregroundLuminance = relativeLuminance(effectiveForeground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Normalize a computed `font-weight` to a number.
 * @param {string | number} value
 * @returns {number}
 */
export function parseFontWeight(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'bold' || normalized === 'bolder') return 700
  if (normalized === 'normal' || normalized === 'lighter' || normalized === '') return 400
  const numeric = Number.parseFloat(normalized)
  return Number.isFinite(numeric) ? numeric : 400
}

/**
 * Whether text counts as WCAG "large text" (so 3:1 is enough).
 * @param {number} fontSizePx
 * @param {number} fontWeight
 * @returns {boolean}
 */
export function isLargeText(fontSizePx, fontWeight) {
  const size = Number(fontSizePx)
  if (!Number.isFinite(size)) return false
  const bold = Number(fontWeight) >= BOLD_FONT_WEIGHT
  return bold ? size >= LARGE_TEXT_PX.bold : size >= LARGE_TEXT_PX.normal
}

/**
 * Minimum contrast ratio required for text with this size/weight.
 * @param {number} fontSizePx
 * @param {number} fontWeight
 * @returns {number}
 */
export function requiredContrast(fontSizePx, fontWeight) {
  return isLargeText(fontSizePx, fontWeight) ? WCAG_MIN_CONTRAST.largeText : WCAG_MIN_CONTRAST.normalText
}

/**
 * Round a ratio to 2 decimals for reports/baselines (stable comparisons).
 * @param {number} ratio
 * @returns {number}
 */
export function roundRatio(ratio) {
  return Math.round(ratio * 100) / 100
}