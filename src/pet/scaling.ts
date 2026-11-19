/**
 * Four-level scaling model (master-backlog D7 / MB-050–MB-055).
 *
 * The user-visible contract:
 * 1. 「整体缩放」 scales EVERYTHING together (character image + UI/text +
 *    bubble/panels). It is the default/first level and lives in 常用.
 * 2. 「UI + 文本」 and 「图像」 are independent axes (second level) relative to
 *    the global scale: 100% keeps following 整体缩放; <100% / >100% makes that
 *    axis smaller/larger on its own.
 * 3. Individual components (气泡 / 右键菜单 / 角色与内容中心 / 设置 / 关于) are
 *    one level DEEPER (设置 → 高级 · 组件缩放) and default to inherit. Each can
 *    be overridden and restored to inherit; overrides are multipliers of the
 *    inherited UI scale.
 *
 * Scale basis: 100% / 1× on every axis is the shipped look before this model
 * (folded-paper pet 2×, text 2×, panel geometry 1×). That keeps upgrades
 * visually neutral and makes the pure model testable against one baseline.
 *
 * Everything here is pure (storage-injectable, no DOM) so Node tests cover the
 * persistence/migration/clamp rules without a browser. desktop-shell.ts owns
 * the DOM application (CSS variables + fitted values).
 */

/** Storage namespace. New keys are namespaced below the old pet-scale keys. */
export const SCALE_MODEL_VERSION = 2 as const
export const SCALE_MODEL_KEY = 'desktop-games/pet/scale/model'
/**
 * Legacy keys written by the old two-axis model (pet scale 1×–4× + text size).
 * They are READ for the one-time migration and left in place afterwards (the
 * version marker makes them inert instead of deleting possible user backups).
 */
export const LEGACY_PET_SCALE_KEY = 'desktop-games/pet/scale'
export const LEGACY_TEXT_SCALE_KEY = 'desktop-games/pet/text-scale'
/** New model keys. Absent ui/image/component keys mean the default (×1). */
export const GLOBAL_SCALE_KEY = 'desktop-games/pet/scale/global'
export const UI_TEXT_SCALE_KEY = 'desktop-games/pet/scale/ui-text'
export const IMAGE_SCALE_KEY = 'desktop-games/pet/scale/image'
export const COMPONENT_SCALE_KEY_PREFIX = 'desktop-games/pet/scale/component/'

/** Global slider: 50%–200%, 100% = the shipped default look. */
export const GLOBAL_SCALE_MIN = 0.5
export const GLOBAL_SCALE_MAX = 2
export const GLOBAL_SCALE_DEFAULT = 1
export const GLOBAL_SCALE_STEP = 0.05

/**
 * UI+文本 / 图像 independent axes, relative to the global scale. Values are
 * multipliers (1 = follow the global scale).
 * - uiText min 0.4 preserves a legacy 0.8 absolute text scale at global 1.
 * - image min 0.5 / max 2 preserves the legacy 1×–4× pet scale.
 */
export const UI_TEXT_SCALE_MIN = 0.4
export const UI_TEXT_SCALE_MAX = 1.5
export const UI_TEXT_SCALE_DEFAULT = 1
export const IMAGE_SCALE_MIN = 0.5
export const IMAGE_SCALE_MAX = 2
export const IMAGE_SCALE_DEFAULT = 1
export const AXIS_SCALE_STEP = 0.05

/** Per-component override multiplier (relative to the inherited UI scale). */
export const COMPONENT_SCALE_MIN = 0.75
export const COMPONENT_SCALE_MAX = 1.5

/**
 * Effective caps (prevent unreadable/clipped output on the 480×336 window).
 * Panels additionally divide their viewport-relative max size by the zoom in
 * pet.css, so a zoom can never push the panel past the window edge.
 */
export const UI_SCALE_MIN = 0.8
export const UI_SCALE_MAX = 3.5
export const FOLDED_PET_SCALE_MIN = 0.5
export const FOLDED_PET_SCALE_MAX = 4
export const HERO_ZOOM_MIN = 0.5
export const HERO_ZOOM_MAX = 2
export const COMPONENT_ZOOM_MIN = 0.5
export const COMPONENT_ZOOM_MAX = 2

/** Components that can be overridden individually from 高级 · 组件缩放. */
export const SCALE_COMPONENTS = [
  { id: 'bubble', label: '气泡', hint: '桌宠对话气泡' },
  { id: 'menu', label: '右键菜单', hint: '右键 / Shift+F10 菜单' },
  { id: 'contentHub', label: '角色与内容中心', hint: '全屏内容面板' },
  { id: 'settings', label: '设置弹窗', hint: '本设置对话框' },
  { id: 'about', label: '关于与声明', hint: 'TOS/免责声明面板' },
] as const
export type ScaleComponentId = (typeof SCALE_COMPONENTS)[number]['id']
export const SCALE_COMPONENT_IDS: readonly ScaleComponentId[] = SCALE_COMPONENTS.map((component) => component.id)

/** Minimal storage surface (injectable; defaults to localStorage when present). */
export interface ScaleStorage {
  getItem(key: string): string | null
  setItem?(key: string, value: string): void
  removeItem?(key: string): void
}

export interface ScaleSettings {
  /** 整体缩放 (all content together). */
  readonly global: number
  /** UI+文本 multiplier relative to global (1 = follow). */
  readonly uiText: number
  /** Character/preview-image multiplier relative to global (1 = follow). */
  readonly image: number
  /** Per-component multipliers; a missing id means inherit (1). */
  readonly components: Readonly<Partial<Record<ScaleComponentId, number>>>
}

/** Effective values written to CSS by desktop-shell.ts (1 = shipped look). */
export interface ResolvedScales {
  readonly global: number
  readonly uiText: number
  readonly image: number
  /** --ui-scale: absolute text scale (2× = shipped default). */
  readonly uiScale: number
  /** 1 = shipped look; multiplies 104×90 folded pet (2× = shipped default). */
  readonly foldedPetScale: number
  /** 1 = shipped fitted hero canvas; viewport-clamped again at apply time. */
  readonly heroZoom: number
  /** Absolute component zooms (1 = shipped look). */
  readonly components: Readonly<Record<ScaleComponentId, number>>
}

export interface ScaleLoadResult {
  readonly settings: ScaleSettings
  /** True when legacy pet-scale/text-size values were mapped into the new model. */
  readonly migrated: boolean
}

export const DEFAULT_SCALE_SETTINGS: ScaleSettings = Object.freeze({
  global: GLOBAL_SCALE_DEFAULT,
  uiText: UI_TEXT_SCALE_DEFAULT,
  image: IMAGE_SCALE_DEFAULT,
  components: Object.freeze({}),
})

function defaultStorage(): ScaleStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function safeGet(store: ScaleStorage | null, key: string): string | null {
  if (!store) return null
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

function safeSet(store: ScaleStorage | null, key: string, value: string): void {
  if (!store?.setItem) return
  try {
    store.setItem(key, value)
  } catch {
    /* storage denied: a preference write is a silent no-op */
  }
}

function safeRemove(store: ScaleStorage | null, key: string): void {
  if (!store?.removeItem) return
  try {
    store.removeItem(key)
  } catch {
    /* storage denied */
  }
}

/** Finite-number read with a fallback (missing/blank/malformed keep it). */
export function readScaleNumber(store: ScaleStorage | null | undefined, key: string, fallback: number): number {
  const raw = safeGet(store === undefined ? defaultStorage() : store, key)
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export function clampScale(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clampScale(value, min, max) : fallback
}

function sanitizeComponents(
  components: Readonly<Partial<Record<ScaleComponentId, number>>> | undefined,
): Partial<Record<ScaleComponentId, number>> {
  const out: Partial<Record<ScaleComponentId, number>> = {}
  if (!components) return out
  for (const id of SCALE_COMPONENT_IDS) {
    const value = components[id]
    if (typeof value === 'number' && Number.isFinite(value)) {
      const clamped = clampScale(value, COMPONENT_SCALE_MIN, COMPONENT_SCALE_MAX)
      // A multiplier of exactly 1 is the inherited default: do not store it as
      // an override (keeps 恢复默认/继承 semantically identical).
      if (Math.abs(clamped - 1) > 1e-9) out[id] = clamped
    }
  }
  return out
}

/** Sanitize any untrusted settings object into a valid model. */
export function normalizeScaleSettings(settings: Partial<ScaleSettings> | null | undefined): ScaleSettings {
  return {
    global: clampNumber(settings?.global, GLOBAL_SCALE_DEFAULT, GLOBAL_SCALE_MIN, GLOBAL_SCALE_MAX),
    uiText: clampNumber(settings?.uiText, UI_TEXT_SCALE_DEFAULT, UI_TEXT_SCALE_MIN, UI_TEXT_SCALE_MAX),
    image: clampNumber(settings?.image, IMAGE_SCALE_DEFAULT, IMAGE_SCALE_MIN, IMAGE_SCALE_MAX),
    components: sanitizeComponents(settings?.components),
  }
}

function readStoredSettings(store: ScaleStorage): ScaleSettings {
  const components: Partial<Record<ScaleComponentId, number>> = {}
  for (const id of SCALE_COMPONENT_IDS) {
    const raw = safeGet(store, COMPONENT_SCALE_KEY_PREFIX + id)
    if (raw === null || raw.trim() === '') continue
    const value = Number(raw)
    if (Number.isFinite(value)) {
      const clamped = clampScale(value, COMPONENT_SCALE_MIN, COMPONENT_SCALE_MAX)
      if (Math.abs(clamped - 1) > 1e-9) components[id] = clamped
    }
  }
  return normalizeScaleSettings({
    global: readScaleNumber(store, GLOBAL_SCALE_KEY, GLOBAL_SCALE_DEFAULT),
    uiText: readScaleNumber(store, UI_TEXT_SCALE_KEY, UI_TEXT_SCALE_DEFAULT),
    image: readScaleNumber(store, IMAGE_SCALE_KEY, IMAGE_SCALE_DEFAULT),
    components,
  })
}

/**
 * Load the model, migrating the legacy pet-scale/text-size pair EXACTLY once.
 *
 * Migration maps the old absolute scales onto the new relative axes at global
 * 100%, so effective values are preserved: the folded pet keeps p×, text keeps
 * t×, and no user setting is lost or rounded away.
 */
export function loadScaleSettings(storage?: ScaleStorage | null): ScaleLoadResult {
  const store = storage === undefined ? defaultStorage() : storage
  if (!store) return { settings: normalizeScaleSettings(DEFAULT_SCALE_SETTINGS), migrated: false }

  const model = safeGet(store, SCALE_MODEL_KEY)
  const legacyPet = safeGet(store, LEGACY_PET_SCALE_KEY)
  const legacyText = safeGet(store, LEGACY_TEXT_SCALE_KEY)
  const hasNewKey =
    safeGet(store, GLOBAL_SCALE_KEY) !== null ||
    safeGet(store, UI_TEXT_SCALE_KEY) !== null ||
    safeGet(store, IMAGE_SCALE_KEY) !== null ||
    SCALE_COMPONENT_IDS.some((id) => safeGet(store, COMPONENT_SCALE_KEY_PREFIX + id) !== null)

  if (model === String(SCALE_MODEL_VERSION) || hasNewKey) {
    return { settings: readStoredSettings(store), migrated: false }
  }
  if (legacyPet === null && legacyText === null) {
    return { settings: normalizeScaleSettings(DEFAULT_SCALE_SETTINGS), migrated: false }
  }

  // Legacy model: pet scale p ∈ [1,4] (default 2), text scale t ∈ [0.8,2]
  // (default: follows the pet scale, clamped). Keep both effective values.
  const petScale = clampScale(readScaleNumber(store, LEGACY_PET_SCALE_KEY, 2), 1, 4)
  const textScale = clampScale(
    readScaleNumber(store, LEGACY_TEXT_SCALE_KEY, clampScale(petScale, 0.8, 2)),
    0.8,
    2,
  )
  return {
    settings: normalizeScaleSettings({
      global: 1,
      uiText: textScale / 2,
      image: petScale / 2,
      components: {},
    }),
    migrated: true,
  }
}

/** Persist the whole model; default values remove their key instead of writing 1. */
export function persistScaleSettings(settings: ScaleSettings, storage?: ScaleStorage | null): void {
  const store = storage === undefined ? defaultStorage() : storage
  if (!store) return
  const normalized = normalizeScaleSettings(settings)
  safeSet(store, SCALE_MODEL_KEY, String(SCALE_MODEL_VERSION))
  safeSet(store, GLOBAL_SCALE_KEY, String(normalized.global))
  if (Math.abs(normalized.uiText - UI_TEXT_SCALE_DEFAULT) > 1e-9) safeSet(store, UI_TEXT_SCALE_KEY, String(normalized.uiText))
  else safeRemove(store, UI_TEXT_SCALE_KEY)
  if (Math.abs(normalized.image - IMAGE_SCALE_DEFAULT) > 1e-9) safeSet(store, IMAGE_SCALE_KEY, String(normalized.image))
  else safeRemove(store, IMAGE_SCALE_KEY)
  for (const id of SCALE_COMPONENT_IDS) {
    const value = normalized.components[id]
    if (typeof value === 'number') safeSet(store, COMPONENT_SCALE_KEY_PREFIX + id, String(value))
    else safeRemove(store, COMPONENT_SCALE_KEY_PREFIX + id)
  }
}

/** Restore every axis/component to its default and persist that reset. */
export function resetScaleSettings(storage?: ScaleStorage | null): ScaleSettings {
  const settings = normalizeScaleSettings(DEFAULT_SCALE_SETTINGS)
  const store = storage === undefined ? defaultStorage() : storage
  if (store) {
    // The version marker must survive a reset so the legacy keys never come
    // back: a reset is a deliberate choice, not an un-migrated profile.
    persistScaleSettings(settings, store)
  }
  return settings
}

/**
 * Resolve the model into effective scales. This is the ONLY place the four
 * levels are combined; desktop-shell.ts just writes the result to CSS.
 */
export function resolveScaleSettings(settings: ScaleSettings): ResolvedScales {
  const normalized = normalizeScaleSettings(settings)
  const uiText = clampScale(normalized.global * normalized.uiText, UI_SCALE_MIN / 2, UI_SCALE_MAX / 2)
  const uiScale = clampScale(2 * uiText, UI_SCALE_MIN, UI_SCALE_MAX)
  const foldedPetScale = clampScale(2 * normalized.global * normalized.image, FOLDED_PET_SCALE_MIN, FOLDED_PET_SCALE_MAX)
  const heroZoom = clampScale(normalized.global * normalized.image, HERO_ZOOM_MIN, HERO_ZOOM_MAX)
  const components = {} as Record<ScaleComponentId, number>
  for (const id of SCALE_COMPONENT_IDS) {
    const multiplier = normalized.components[id] ?? 1
    components[id] = clampScale(uiText * multiplier, COMPONENT_ZOOM_MIN, COMPONENT_ZOOM_MAX)
  }
  return {
    global: normalized.global,
    uiText: normalized.uiText,
    image: normalized.image,
    uiScale,
    foldedPetScale,
    heroZoom,
    components,
  }
}

/**
 * Fit a desired zoom inside a viewport so the scaled art keeps whole pixels
 * visible (no clipped top/sides). Used for the character image only; panels use
 * the CSS calc(... / var(--*-zoom)) rule instead of JS measurement.
 */
export function fitScaleToViewport(
  desired: number,
  art: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  margin: { readonly x: number; readonly top: number; readonly bottom: number },
): number {
  const wanted = Number.isFinite(desired) ? Math.max(0.01, desired) : 1
  if (!(art.width > 0) || !(art.height > 0) || !(viewport.width > 0) || !(viewport.height > 0)) {
    return wanted
  }
  const maxWidth = Math.max(0, viewport.width - margin.x * 2) / art.width
  const maxHeight = Math.max(0, viewport.height - margin.top - margin.bottom) / art.height
  return Math.max(0.01, Math.min(wanted, maxWidth, maxHeight))
}

/** Trim trailing zeros so CSS values stay readable (1.5000000001 → 1.5). */
function formatNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

/** Human label for the character image/scale UX: 2×, 1.5×, 0.75×. */
export function formatScaleMultiplier(scale: number): string {
  return `${formatNumber(scale)}×`
}

/** Percent label for the global/axis sliders: 100%, 125%, 50%. */
export function formatScalePercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** CSS custom properties consumed by pet.css (single mapping for both shells). */
export function scaleCssVariables(
  resolved: ResolvedScales,
  fitted?: { readonly foldedPetScale?: number; readonly heroZoom?: number },
): Record<string, string> {
  return {
    '--global-scale': formatNumber(resolved.global),
    '--ui-scale': formatNumber(resolved.uiScale),
    '--pet-scale': formatNumber(fitted?.foldedPetScale ?? resolved.foldedPetScale),
    '--hero-zoom': formatNumber(fitted?.heroZoom ?? resolved.heroZoom),
    '--bubble-zoom': formatNumber(resolved.components.bubble),
    '--menu-zoom': formatNumber(resolved.components.menu),
    '--settings-zoom': formatNumber(resolved.components.settings),
    '--hub-zoom': formatNumber(resolved.components.contentHub),
    '--about-zoom': formatNumber(resolved.components.about),
  }
}
