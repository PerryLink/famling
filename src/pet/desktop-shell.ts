import { describeAdvisersFaceView } from './ui-state.ts'
import { resolveAdvisersPanelPolicy } from './advisers/face.ts'
import {
  canInteract,
  openAboutPanel,
  requestDeleteAllLocalData,
  requestWithdrawConsent,
  requireContentConsent,
} from './consent/runtime.ts'
import { CONSENT_ACTIONS } from './consent/content.ts'
import {
  CONSENT_OVERLAY_EVENT,
  hasOpenConsentOverlay,
  type ConsentOverlayEventDetail,
} from './consent/modal.ts'
import { countCodePoints, sanitizePlainText, truncateCodePoints } from './security/limits.ts'
import {
  AXIS_SCALE_STEP,
  COMPONENT_SCALE_MAX,
  COMPONENT_SCALE_MIN,
  GLOBAL_SCALE_MAX,
  GLOBAL_SCALE_MIN,
  GLOBAL_SCALE_STEP,
  IMAGE_SCALE_MAX,
  IMAGE_SCALE_MIN,
  LEGACY_PET_SCALE_KEY,
  LEGACY_TEXT_SCALE_KEY,
  SCALE_COMPONENTS,
  SCALE_COMPONENT_IDS,
  UI_TEXT_SCALE_MAX,
  UI_TEXT_SCALE_MIN,
  clampScale,
  fitScaleToViewport,
  formatScaleMultiplier,
  formatScalePercent,
  loadScaleSettings,
  normalizeScaleSettings,
  persistScaleSettings,
  resetScaleSettings,
  resolveScaleSettings,
  scaleCssVariables,
  type ResolvedScales,
  type ScaleComponentId,
  type ScaleSettings,
} from './scaling.ts'
import {
  isValidClockText,
  normalizeQuietHours,
  quietHoursSummary,
  readQuietHours,
  writeQuietHours,
  type QuietHoursSettings,
} from './low-disturb.ts'
import {
  REDUCE_MOTION_KEY as SHARED_REDUCE_MOTION_KEY,
  applyReduceMotionAttribute,
  systemPrefersReducedMotion,
  watchReduceMotion,
  writeExplicitReduceMotion,
} from './reduce-motion.ts'

/**
 * Desktop pet shell (Phase 1A): hide the settings chrome by default, keep the
 * pet on screen, and expose actions/settings through a right-click menu.
 *
 * This is a web-layer shell. Full transparent/click-through/always-on-top
 * Windows behavior needs the Tauri spike in docs/DESKTOP-PET-UX-2026-11-16.md;
 * `?shell=window` keeps the old full-page layout for development/E2E.
 *
 * UI-shell P0 (audit NONART-PRODUCT-2026-11-17 U1/U2, UI-MOTION-AUDIT §6/§8):
 * - the menu is a WAI-ARIA menu (`aria-haspopup`/`role=menu`/`menuitem`/
 *   `menuitemradio`) whose open/close is a `data-state` class + CSS transition
 *   token (no `hidden` hard cut), with focus moved to the first item on open,
 *   Arrow/Home/End roving tabindex, Tab kept inside the menu, Escape closing and
 *   restoring focus, and hover/focus/pressed/selected/disabled states;
 * - `#pet-scale-label` is a real node in `pet.html`, updated from one pure
 *   resolver so the first run shows the product-locked 2x (and a stored 1x
 *   shows 1x); the scale row marks the active option with `aria-checked`;
 * - motion comes from the `--ui-dur-*`/`--ui-ease-*` tokens in pet.css; only
 *   transform/opacity animate and `prefers-reduced-motion: reduce` collapses
 *   every transition to a direct state change.
 *
 * CONSENT P0 (TRUST-REVIEW-2026-11-17 P0-1): the menu is appended to `<body>`,
 * i.e. OUTSIDE the `#pet-app` subtree that the consent modal inerts, and it is
 * below the TOS backdrop (z-index). Before this fix a right-click / Shift+F10 /
 * trigger click during the first-run TOS (or the read-only screen) opened the
 * menu, stole focus and let keyboard Enter run pat/give/fold/Advisers/scale.
 * The fix is defence in depth:
 * - every entry point (contextmenu, Shift+F10/ContextMenu key, trigger click)
 *   and every menu action re-checks the consent gate via `shellMenuBlocked()`;
 * - the menu listens for `CONSENT_OVERLAY_EVENT` and closes + inerts itself the
 *   moment any TOS/TTS/blocked overlay appears (including per-action prompts
 *   where canInteract() is still true);
 * - at init the shell records `documentElement.dataset.shellConsent` and fails
 *   closed; the menu container stays below the modal layer (pet.css).
 */
/**
 * Legacy two-axis keys (pet scale 1×–4× + text size). Kept exported because the
 * one-time migration in scaling.ts reads exactly these keys; the shell itself
 * now only uses the four-level model (整体 / UI+文本 / 图像 / 组件).
 */
export const PET_SCALE_KEY = LEGACY_PET_SCALE_KEY
export const TEXT_SCALE_KEY = LEGACY_TEXT_SCALE_KEY
/**
 * 「显示菜单按钮」setting (task-65): the desktop shell ships with NO persistent
 * chrome around the character. The ⋯ trigger is hidden by default (pet.html
 * `hidden`, re-applied by initDesktopShell) and can be enabled from 设置…;
 * right-click / Shift+F10 / ContextMenu keep opening the menu while hidden.
 */
export const SHOW_MENU_BUTTON_KEY = 'desktop-games/pet/show-menu-button'
/**
 * 「减少动态」setting: collapses CSS motion tokens, pauses the hero loop and is
 * also installed in the game windows (reduce-motion.ts). Kept exported from this
 * module for existing callers/tests; the value is the shared module constant.
 */
export const REDUCE_MOTION_KEY = SHARED_REDUCE_MOTION_KEY
/** The consolidated settings dialog built by initDesktopShell. */
export const SETTINGS_ID = 'pet-settings'
/** Menu levels: root (≤5 entries), 互动… and 更多… (both have 返回). */
export type ShellMenuView = 'root' | 'interact' | 'more'
/** Root entries in order; the IA test asserts this stays ≤5. */
export const SHELL_MENU_ROOT_ACTIONS = ['compose', 'interact', 'content', 'settings', 'more', 'quit'] as const
/**
 * Renderer-menu storage keys. Keep in sync with `hero-runtime.ts`
 * (`HERO_STORAGE_KEY` / `HERO_CHARACTER_STORAGE_KEY`); duplicated here as
 * plain strings so this module stays import-light and Node-test friendly.
 */
export const HERO_RENDERER_STORAGE = {
  hero: 'desktop-games/pet/hero',
  character: 'desktop-games/pet/heroCharacter',
} as const
const MENU_ID = 'pet-shell-menu'
const MENU_BUTTON_ID = 'pet-menu-button'
/**
 * One-time first-run coach (E-01/MB-060): explains 右键 / Shift+F10 / Enter and
 * the 「显示菜单按钮」 setting. Shown at most once per profile, never a
 * persistent button; marked as seen the moment it is shown so an interrupted
 * session cannot resurrect it.
 */
export const MENU_COACH_KEY = 'desktop-games/pet/coach/menu'
export const MENU_COACH_ID = 'pet-menu-coach'
/** Legacy range constants kept for the old pure helpers / external callers. */
export const PET_SCALE_MIN = 1
export const PET_SCALE_MAX = 4
export const TEXT_SCALE_MIN = 0.8
export const TEXT_SCALE_MAX = 2

/**
 * The read-only bridge `main.ts` publishes as `window.__petAdvisers`. The menu
 * only reads status/retry for display; it never reads brief content and never
 * writes back to Advisers (privacy boundary unchanged).
 */
interface AdvisersShellBridge {
  status?: import('./advisers/face.ts').AdvisersFaceStatus
  retry?: () => Promise<unknown>
}

/**
 * Document/window driving the shell. Injectable so the consent gate logic can
 * be exercised with a fake DOM in Node (no browser/E2E faking).
 */
let shellDocument: Document | null = null
let shellWindow: Window | null = null

function activeDocument(): Document | null {
  if (shellDocument) return shellDocument
  return typeof document === 'undefined' ? null : document
}

function activeWindow(): Window | null {
  if (shellWindow) return shellWindow
  return typeof window === 'undefined' ? null : window
}

function advisersBridge(): AdvisersShellBridge | undefined {
  // The read-only bridge is published on the real page window; Node/fake-DOM
  // tests have none, so the probe is guarded instead of throwing.
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { __petAdvisers?: AdvisersShellBridge }).__petAdvisers
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Minimal storage surface, injectable so Node tests never need a DOM. */
export type NumberStorage = Pick<Storage, 'getItem'>

/**
 * Read a finite number from storage, applying `fallback` when the key is
 * missing, empty, malformed or unreadable.
 *
 * Historical bug: `Number(localStorage.getItem(key))` is `0` for a missing key
 * (`Number(null) === 0`), so the fallback never applied: a first-run desktop
 * pet started at scale 0 (clamped to 1×) and text at 80% instead of the
 * product-locked 2× / 100%. Missing/blank values must keep the fallback.
 */
export function readStoredNumber(
  key: string,
  fallback: number,
  storage?: NumberStorage | null,
): number {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof localStorage === 'undefined'
          ? null
          : localStorage
    if (!store) return fallback
    const raw = store.getItem(key)
    if (raw === null || raw.trim() === '') return fallback
    const value = Number(raw)
    return Number.isFinite(value) ? value : fallback
  } catch {
    return fallback
  }
}

/** Minimal storage surface for boolean preferences (injectable in Node tests). */
export type FlagStorage = Pick<Storage, 'getItem'>

/**
 * Read a boolean preference. A missing/blank/malformed value keeps the
 * fallback (never coerces to true), and an unreadable storage fails closed to
 * the fallback so a blocked localStorage cannot flip a safety/UI default.
 */
export function readStoredFlag(
  key: string,
  fallback: boolean,
  storage?: FlagStorage | null,
): boolean {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof localStorage === 'undefined'
          ? null
          : localStorage
    if (!store) return fallback
    const raw = store.getItem(key)
    if (raw === null) return fallback
    const value = raw.trim().toLowerCase()
    if (value === '') return fallback
    if (value === '1' || value === 'true' || value === 'on' || value === 'yes') return true
    if (value === '0' || value === 'false' || value === 'off' || value === 'no') return false
    return fallback
  } catch {
    return fallback
  }
}

/** Persist one boolean preference; storage-denied is a silent no-op. */
export function writeStoredFlag(key: string, value: boolean): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    localStorage.setItem(key, value ? '1' : '0')
    return true
  } catch {
    return false
  }
}

/** 「显示菜单按钮」: hidden by default (right-click/Shift+F10 still work). */
export function resolveShowMenuButton(storage?: FlagStorage | null): boolean {
  return readStoredFlag(SHOW_MENU_BUTTON_KEY, false, storage)
}

/**
 * 「减少动态」: a stored preference wins; first run follows the OS
 * prefers-reduced-motion media query (accessibility-first default).
 */
export function resolveReduceMotion(storage?: FlagStorage | null, prefersReduce = false): boolean {
  return readStoredFlag(REDUCE_MOTION_KEY, prefersReduce, storage)
}

/**
 * Dev/E2E surfaces (完整面板) are never in the release menu: only an explicit
 * ?debug=1/?dev=1 URL (or the Vite dev build) may expose them.
 */
export function debugShellFromSearch(search: string): boolean {
  try {
    const params = new URLSearchParams(search)
    return params.get('debug') === '1' || params.get('dev') === '1'
  } catch {
    return false
  }
}

/** Vite dev build (never true in the packaged release; guarded for Node). */
export function isViteDevBuild(): boolean {
  try {
    return (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV === true
  } catch {
    return false
  }
}

/** Pure first-run resolver: missing/malformed storage keeps the locked 2x. */
export function resolvePetScale(storage?: NumberStorage | null): number {
  return clamp(readStoredNumber(PET_SCALE_KEY, 2, storage), PET_SCALE_MIN, PET_SCALE_MAX)
}

/** Text scale defaults to the pet scale but A-/A+ remains an independent override. */
export function resolveTextScale(petScale?: number, storage?: NumberStorage | null): number {
  const scale = petScale ?? resolvePetScale(storage)
  return clamp(readStoredNumber(TEXT_SCALE_KEY, scale, storage), TEXT_SCALE_MIN, TEXT_SCALE_MAX)
}

/** Label text shared by the header node and the menu scale headings. */
export function formatScaleLabel(scale: number): string {
  return `${clamp(scale, PET_SCALE_MIN, PET_SCALE_MAX)}×`
}

// ---------------------------------------------------------------------------
// Renderer / hero menu (multi-character anim integration, 2026-11-18)
// ---------------------------------------------------------------------------

/** Renderer choices that draw on the hero canvas (the animated characters). */
export type HeroRendererChoice = 'dog' | 'cat' | 'humanoid'

/** Hero renderer choices in menu order: 金毛 / 塞尔凯克卷毛猫 / 汀岚. */
export const HERO_RENDERER_CHOICES: readonly HeroRendererChoice[] = ['dog', 'cat', 'humanoid']

/** Renderer choice written by the desktop-shell menu (hero characters + origami). */
export type PetRendererChoice = HeroRendererChoice | 'origami'

function isHeroRendererChoice(choice: PetRendererChoice): choice is HeroRendererChoice {
  return (HERO_RENDERER_CHOICES as readonly PetRendererChoice[]).includes(choice)
}

/**
 * Pure storage writes for one renderer choice.
 *
 * - a hero character (`dog` = v9 golden retriever, `cat` = Selkirk Rex,
 *   `humanoid` = Tinglan) = enable hero + persist that character (the next load
 *   resolves it through `HERO_CHARACTER_STORAGE_KEY`);
 * - `origami` = folded-paper DOM: switch hero off. The persisted character is
 *   deliberately left untouched so switching back to a hero character works in
 *   one click.
 */
export function rendererChoiceWrites(choice: PetRendererChoice): ReadonlyArray<readonly [string, string]> {
  return isHeroRendererChoice(choice)
    ? [
        [HERO_RENDERER_STORAGE.hero, '1'],
        [HERO_RENDERER_STORAGE.character, choice],
      ]
    : [[HERO_RENDERER_STORAGE.hero, '0']]
}

/** One renderer switch row in the desktop-shell menu (ordered top to bottom). */
export interface RendererMenuItem {
  readonly choice: PetRendererChoice
  readonly label: string
}

/**
 * Legacy renderer rows (kept for back-compat tests / callers).
 *
 * The desktop menu no longer renders these four scattered rows: the role (which
 * IS the theme in v2) is switched from the single 「角色与内容中心…」 entry.
 * `applyRendererChoice()` and `rendererChoiceWrites()` below are still the
 * renderer lifecycle used by that panel (persist + reload, consent-gated by the
 * caller).
 */
export const RENDERER_MENU_ITEMS: readonly RendererMenuItem[] = [
  { choice: 'dog', label: '渲染器：金毛（动画）' },
  { choice: 'cat', label: '渲染器：塞尔凯克卷毛猫（动画）' },
  { choice: 'humanoid', label: '渲染器：汀岚（动画）' },
  { choice: 'origami', label: '渲染器：折纸（默认）' },
]

/** One menu entry for a hero-only action (see `hero-actions.ts`). */
export interface HeroMenuActionItem {
  /** Data-driven action id from that character's regions.json (pat/fetch/run/…). */
  readonly action: string
  readonly label: string
}

/** Fallback menu (legacy packs without actions); real menus are per-character. */
export const HERO_MENU_ACTIONS: readonly HeroMenuActionItem[] = [
  { action: 'pat', label: '摸头' },
]

/** `[]` in origami mode; the host supplies the active character's actions. */
export function heroMenuActions(heroActive: boolean, items: readonly HeroMenuActionItem[] = HERO_MENU_ACTIONS): readonly HeroMenuActionItem[] {
  return heroActive ? items : []
}

/** Injectable storage/reload surface for `applyRendererChoice`. */
export interface RendererChoiceDeps {
  readonly storage?: Pick<Storage, 'setItem'> | null
  readonly reload?: () => void
}

/**
 * Write the renderer preference and reload so `resolveHeroConfig()` re-runs.
 * Returns false (and does NOT reload) when localStorage is unavailable, so the
 * page never reloads into an unchanged renderer.
 */
export function applyRendererChoice(choice: PetRendererChoice, deps: RendererChoiceDeps = {}): boolean {
  let storage = deps.storage
  if (storage === undefined) {
    try {
      storage = typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      storage = null
    }
  }
  if (!storage) return false
  try {
    for (const [key, value] of rendererChoiceWrites(choice)) storage.setItem(key, value)
  } catch {
    return false
  }
  try {
    deps.reload?.()
  } catch {
    // A blocked reload must not throw into the menu's click handler.
  }
  return true
}

/**
 * Roving-focus target for a vertical menu. ArrowUp/ArrowDown wrap, Home/End jump
 * to the ends; any other key returns null so the caller can ignore it.
 */
export function menuNavigationTarget(key: string, current: number, count: number): number | null {
  if (count <= 0) return null
  const index = current >= 0 && current < count ? current : 0
  switch (key) {
    case 'ArrowDown':
      return (index + 1) % count
    case 'ArrowUp':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/**
 * Tab is a focus trap inside the open menu (it never escapes to the page); the
 * menu closes with Escape or by activating an item.
 */
export function menuTabTarget(shiftKey: boolean, current: number, count: number): number | null {
  if (count <= 0) return null
  if (current < 0 || current >= count) return shiftKey ? count - 1 : 0
  return shiftKey ? (current - 1 + count) % count : (current + 1) % count
}

/** Consent state as observed by the shell at a single instant. */
export interface ShellConsentSnapshot {
  readonly canInteract: boolean
  readonly consentOverlayOpen: boolean
}

/**
 * Single source of truth for "may the desktop-shell menu be operated?".
 *
 * The menu lives on `<body>`, outside the `#pet-app` the consent modal inerts,
 * so neither the gate nor the modal focus trap protects it. It must reject when
 * the first-run TOS is not accepted (`canInteract === false`) AND while any
 * consent overlay is on screen — the per-action TOS keeps `canInteract` true,
 * so the overlay probe is not redundant.
 */
export function shellMenuBlocked(state: ShellConsentSnapshot): boolean {
  return !state.canInteract || state.consentOverlayOpen
}

/** Injectable DOM + consent accessors (real app uses the defaults). */
export interface DesktopShellOptions {
  readonly document?: Document
  readonly window?: Window
  /** Consent gate accessor; defaults to `consent/runtime.canInteract` (fail closed). */
  readonly canInteract?: () => boolean
  /** True while a TOS/TTS/blocked modal is on screen; defaults to a DOM probe. */
  readonly consentOverlayOpen?: () => boolean
  /**
   * V1 typed-input entry: open the same-window inline composer. `main.ts`
   * supplies the controller wired to the existing `say`/trust layer; without
   * it the menu entry is inert (dev/other pages never fake a composer).
   */
  readonly openComposer?: () => void
  /**
   * True while the hero canvas renderer is actually drawing (`hero !== null`).
   * When it returns true the menu replaces the folded-paper pet actions with the
   * hero-only 摸头/抛球/追球 entries; the default keeps the old DOM actions.
   */
  readonly heroActive?: () => boolean
  /** Per-character hero actions (regions.json actions); read each menu open. */
  readonly getHeroActions?: () => readonly HeroMenuActionItem[]
  /**
   * Host hook for the hero menu entries. `main.ts` routes this to
   * `HeroRuntime.emit()` (never to the folded-paper DOM buttons, so a hero
   * action cannot double-fire the kernel/speech side effects).
   */
  readonly onHeroAction?: (action: string) => void
  /**
   * The ONE consolidated content-center entry (characters / voices / dialogue /
   * themes / backgrounds / fonts). `main.ts` opens the panel; the four scattered
   * renderer rows are no longer rendered by this menu.
   */
  readonly openContentHub?: () => void
  /** Quit from the root menu; main.ts saves first, then closes the pet window. */
  readonly onExit?: () => void
  /**
   * Open the independent content/settings window instead of the in-window
   * #pet-settings modal (MB-062). Return true when the window was opened;
   * false keeps today's in-window dialog as the browser/dev fallback. Only the
   * pet-window menu supplies this; the content window itself omits it.
   */
  readonly openSettingsWindow?: (focusTarget?: string) => boolean
  /**
   * The open settings surface closed (backdrop/Escape/close). The content window
   * uses this to bring its home surface back; the pet window ignores it.
   */
  readonly onSettingsClosed?: () => void
  /**
   * The pet shell menu itself. The independent content/settings window reuses
   * this init to get the SAME settings dialog but must not expose the pet menu,
   * coach or drag behavior, so it passes `false`.
   */
  readonly enableMenu?: boolean
  /**
   * Settings wiring supplied by main.ts. Every callback is optional: absent
   * handlers keep the control visible but inert (dev pages never fake them).
   */
  /** Current mute/volume state for the 常用 group (settings dialog). */
  readonly getAudioState?: () => { readonly muted: boolean; readonly volume: number }
  /** Mute toggle (same TTS re-confirmation semantics as the mute button). */
  readonly setMuted?: (muted: boolean) => void
  /** Live volume apply while dragging the settings slider (0-100). */
  readonly setVolume?: (volume: number) => void
  /** Slider released: re-confirm the TTS declaration when voice is enabled. */
  readonly onVolumeCommit?: () => void
  /** 保存 / 读取 archive buttons (main.ts feedback path; fallback clicks #save). */
  readonly saveArchive?: () => void
  readonly loadArchive?: () => void
  /** 复位窗口 to the bottom-right (main.ts existing Tauri handler). */
  readonly resetWindow?: () => void
  /**
   * True while a higher-level modal (the role & content center) is open. The
   * body-level shell menu must not open above/behind it (UX review P1-4).
   */
  readonly isHigherModalOpen?: () => boolean
  /**
   * Quiet-hours preference changed from the settings dialog (MB-070). main.ts
   * mirrors it so ambient output stops/starts without a reload; the shell has
   * already persisted the normalized value when this fires.
   */
  readonly onQuietHoursChange?: (settings: QuietHoursSettings) => void
}

/** Element handles for the #pet-settings dialog (built once per init). */
interface SettingsDom {
  readonly root: HTMLElement
  readonly status: HTMLElement
  readonly showMenuButton: HTMLInputElement
  readonly mute: HTMLInputElement
  readonly volume: HTMLInputElement
  readonly volumeValue: HTMLElement
  readonly reduceMotion: HTMLInputElement
  /** 安静 / 健康 / AI 标识 → quiet-hours controls (MB-070). */
  readonly quietEnabled: HTMLInputElement
  readonly quietStart: HTMLInputElement
  readonly quietEnd: HTMLInputElement
  /** 常用 → 整体缩放 (all content together). */
  readonly globalScale: HTMLInputElement
  readonly globalValue: HTMLElement
  readonly resetScales: HTMLButtonElement
  /** Second level → UI+文本 / 图像 independent axes. */
  readonly uiTextScale: HTMLInputElement
  readonly uiTextValue: HTMLElement
  readonly uiTextFollow: HTMLButtonElement
  readonly imageScale: HTMLInputElement
  readonly imageValue: HTMLElement
  readonly imageFollow: HTMLButtonElement
  /** Advanced (one level deeper) → per-component overrides. */
  readonly advanced: HTMLDetailsElement
  readonly componentSelects: Record<ScaleComponentId, HTMLSelectElement>
  readonly componentValues: Record<ScaleComponentId, HTMLElement>
}

/**
 * Open the external chat-import page. Callers MUST pass the consent gate first:
 * importing conversation content is a content action that shows the full TOS on
 * every import (see src/pet/consent/). Declining leaves the page unopened.
 *
 * Do not pass 'noopener': the returned Window is used to detect a blocked
 * popup, and Tauri needs an explicit capability to create a window.
 */
function openImport(): void {
  const win = activeWindow()
  if (!win) return
  const opened = win.open('/chat-import.html', '_blank')
  if (!opened) win.location.href = '/chat-import.html'
}

function contentGateOpen(): boolean {
  try {
    return canInteract()
  } catch {
    return false
  }
}

function openImportWithConsent(): void {
  if (!contentGateOpen()) return
  void requireContentConsent({
    action: CONSENT_ACTIONS.chatImportOpen,
    detail:
      '导入 DeepSeek 网页分享对话会把外部内容摘要写入本机记忆/设定，并可能产生模型费用；每次导入都必须重新阅读完整免责声明并同意。',
  }).then((allowed) => {
    if (allowed) openImport()
  })
}

function click(id: string): void {
  activeDocument()?.getElementById(id)?.click()
}

function openSetup(): void {
  activeWindow()?.open('/setup.html', '_blank')
}

/**
 * Propagate resolved scales to CSS + the `#pet-scale-label` node (both shells).
 *
 * The four levels are already combined by scaling.ts; this function only writes
 * its result. `fitted` carries the viewport-clamped character zooms so the
 * applied value is what the user can actually see (never clipped).
 */
function applyScaleVariables(
  resolved: ResolvedScales,
  fitted?: { readonly foldedPetScale?: number; readonly heroZoom?: number },
): void {
  const doc = activeDocument()
  if (!doc) return
  const root = doc.documentElement
  for (const [name, value] of Object.entries(scaleCssVariables(resolved, fitted))) {
    root.style.setProperty(name, value)
  }
  const label = doc.getElementById('pet-scale-label')
  if (label) label.textContent = formatScaleLabel(fitted?.foldedPetScale ?? resolved.foldedPetScale)
}

/**
 * Ask an initialized desktop shell to show the one-time menu coach (E-01).
 *
 * main.ts calls this after the TOS gate resolves accepted, so the coach never
 * appears under the consent modal and stored-acceptance profiles still get it
 * once. No-op before the shell exists; idempotent after it was shown/dismissed.
 */
let menuCoachRequest: (() => void) | null = null
/**
 * Re-run the viewport fit once late layout exists (MB-050). The hero canvas
 * gets its fitted CSS size only after the first character frame; a fit computed
 * before that has no layout box to clamp against and would keep the unclamped
 * resolved hero zoom (2x at 整体 200%), leaving the scaled canvas above the
 * window top. main.ts calls requestDesktopShellScaleRefit() after the hero
 * render mode flips; the shell also watches the relevant boxes itself.
 */
let scaleRefitRequest: (() => void) | null = null
/**
 * The initialized settings dialog, exposed to the independent content window
 * (MB-062) without duplicating its renderer/persistence. Null on pages where
 * initDesktopShell returned early (the ?shell=window dev layout) or before init.
 */
let settingsSurface: {
  open: (focusTarget?: string) => boolean
  close: (restoreFocus?: boolean) => void
} | null = null
/** Open the same audited #pet-settings dialog from another bootstrap (content window). */
export function openDesktopSettingsDialog(focusTarget?: string): boolean {
  try {
    return settingsSurface?.open(focusTarget) ?? false
  } catch {
    return false
  }
}
/** Close the settings dialog from another bootstrap (content window route switch). */
export function closeDesktopSettingsDialog(restoreFocus = false): void {
  try {
    settingsSurface?.close(restoreFocus)
  } catch {
    /* closing is best effort; the route switch still proceeds */
  }
}
export function requestMenuCoach(): void {
  menuCoachRequest?.()
}

/**
 * Ask the initialized desktop shell to re-run the character fit now that the
 * late layout (hero stage/canvas CSS size, render-mode switch) exists.
 * No-op before initDesktopShell(); safe to call more than once per frame.
 */
export function requestDesktopShellScaleRefit(): void {
  scaleRefitRequest?.()
}

export function initDesktopShell(options: DesktopShellOptions = {}): void {
  const doc = options.document ?? (typeof document === 'undefined' ? null : document)
  const win = options.window ?? (typeof window === 'undefined' ? null : window)
  if (!doc || !win) return
  shellDocument = doc
  shellWindow = win
  // A previous shell instance (tests/stand-alone pages) must not keep the coach
  // callback: the current shell re-registers it only in the desktop layout.
  menuCoachRequest = null
  // Same for the late-layout refit hook (MB-050).
  scaleRefitRequest = null
  // Same for the settings surface; it re-registers only after the desktop layout
  // built the dialog (the ?shell=window dev layout never builds it).
  settingsSurface = null
  const docRef: Document = doc
  const winRef: Window = win
  const consentGateOpen = options.canInteract ?? canInteract
  const consentOverlayOpen = options.consentOverlayOpen ?? (() => hasOpenConsentOverlay(docRef))
  /** V1 typed input: same-window composer opener supplied by main.ts. */
  const openComposer = options.openComposer
  /** The single content-center entry opener supplied by main.ts (default inert). */
  const openContentHub = options.openContentHub
  /** Hero canvas state + menu action sink supplied by main.ts (defaults inert). */
  const heroActive = options.heroActive ?? ((): boolean => false)
  const onHeroAction = options.onHeroAction
  /**
   * Consent gate (fail closed if the accessor itself throws: runtime missing/
   * torn down). This is also the gate for shell preferences (scale/text size),
   * which must never be written before the TOS is accepted.
   */
  const consentBlocked = (): boolean => {
    try {
      return shellMenuBlocked({
        canInteract: consentGateOpen(),
        consentOverlayOpen: consentOverlayOpen(),
      })
    } catch {
      return true
    }
  }
  /**
   * Whether the desktop-shell MENU may be operated. Beyond the consent gate,
   * a higher-level modal (role & content center) or our own settings dialog
   * must keep the body-level menu unreachable (UX review P1-4).
   */
  const menuBlocked = (): boolean => {
    if (settingsOpen) return true
    if (options.isHigherModalOpen?.() === true) return true
    return consentBlocked()
  }
  const setConsentState = (): void => {
    docRef.documentElement.dataset.shellConsent = consentBlocked() ? 'blocked' : 'ready'
  }

  const params = new URLSearchParams(winRef.location.search)
  const desktop = params.get('shell') !== 'window'
  /**
   * MB-062: the independent content/settings window reuses this init for the
   * settings dialog, but the pet menu/coach/drag do not belong on that surface.
   */
  const menuEnabled = options.enableMenu !== false

  /**
   * Keyboard path to the pet (E-06/MB-061): the character itself is focusable
   * (Tab) and Enter/Space opens the same menu the pointer path opens. The
   * folded-paper #pet and the hero stage are mutually exclusive at runtime, so
   * only the visible one is in the tab order. In the ?shell=window dev layout
   * there is no shell menu, so the same keys fall back to the old 摸摸 action.
   */
  const petEl = docRef.getElementById('pet')
  const heroStageEl = docRef.getElementById('hero-stage')
  let openMenuFromKeyboard: (() => boolean) | null = null
  for (const target of [petEl, heroStageEl]) {
    if (!target) continue
    target.setAttribute('tabindex', '0')
    target.setAttribute('role', 'button')
    target.setAttribute('aria-haspopup', 'menu')
    target.setAttribute('aria-controls', MENU_ID)
    target.setAttribute('aria-label', '桌面角色：按 Enter 打开菜单；右键或 Shift+F10 也可打开')
    target.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key
      if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return
      event.preventDefault()
      if (openMenuFromKeyboard) openMenuFromKeyboard()
      else click('pat')
    })
  }

  if (!desktop) {
    docRef.documentElement.dataset.petShell = 'window'
    // Dev/E2E full-page layout: resolve the same model so the label/QA surface
    // truthfully shows the stored scales even though only the desktop shell
    // paints the pet window chrome.
    applyScaleVariables(resolveScaleSettings(loadScaleSettings().settings))
    return
  }
  docRef.documentElement.dataset.petShell = 'desktop'

  const pet = petEl
  if (!pet) return

  // ------------------------------------------------------------------
  // Four-level scale state (整体 / UI+文本 / 图像 / 组件)
  // ------------------------------------------------------------------
  // Migration writes are deferred until the TOS gate is accepted so a fresh
  // profile never gets preference writes while the consent modal is up.
  const loadedScales = loadScaleSettings()
  let scaleSettings = normalizeScaleSettings(loadedScales.settings)
  let pendingScaleMigration = loadedScales.migrated
  let resolvedScales: ResolvedScales = resolveScaleSettings(scaleSettings)
  let fittedScales: { foldedPetScale: number; heroZoom: number } = {
    foldedPetScale: resolvedScales.foldedPetScale,
    heroZoom: resolvedScales.heroZoom,
  }
  const persistScaleMigration = (): void => {
    if (!pendingScaleMigration || consentBlocked()) return
    persistScaleSettings(scaleSettings)
    pendingScaleMigration = false
  }
  /** Apply the model + viewport fit and write CSS (never before consent). */
  const applyScale = (): void => {
    resolvedScales = resolveScaleSettings(scaleSettings)
    const viewport = { width: winRef.innerWidth || 480, height: winRef.innerHeight || 336 }
    // offsetWidth ignores CSS transforms, so this is the layout size the fit needs.
    const petBox = {
      width: (pet as unknown as { offsetWidth?: number }).offsetWidth || 104,
      height: (pet as unknown as { offsetHeight?: number }).offsetHeight || 90,
    }
    const foldedPetScale = fitScaleToViewport(resolvedScales.foldedPetScale, petBox, viewport, {
      x: 8,
      top: 8,
      bottom: 12,
    })
    const stage = heroStageEl as unknown as { offsetWidth?: number } | null
    const canvas = docRef.getElementById('hero-canvas') as unknown as { offsetWidth?: number; offsetHeight?: number } | null
    const heroWidth = canvas?.offsetWidth || stage?.offsetWidth || 0
    const heroHeight = canvas?.offsetHeight || 0
    const heroZoom =
      heroWidth > 0 && heroHeight > 0
        ? fitScaleToViewport(resolvedScales.heroZoom, { width: heroWidth, height: heroHeight }, viewport, {
            x: 4,
            top: 6,
            bottom: 18,
          })
        : resolvedScales.heroZoom
    fittedScales = { foldedPetScale, heroZoom }
    applyScaleVariables(resolvedScales, fittedScales)
    persistScaleMigration()
  }
  /** Persist + apply one model change immediately (no reload). */
  const applyScaleSettings = (next: ScaleSettings, status?: string): void => {
    // Defence in depth: never write a shell preference while consent is missing.
    if (consentBlocked()) return
    scaleSettings = normalizeScaleSettings(next)
    resolvedScales = resolveScaleSettings(scaleSettings)
    persistScaleSettings(scaleSettings)
    pendingScaleMigration = false
    applyScale()
    refreshSettings()
    if (status !== undefined) settingsStatus(status)
  }
  const setGlobalScale = (value: number): void => {
    const next = clampScale(value, GLOBAL_SCALE_MIN, GLOBAL_SCALE_MAX)
    applyScaleSettings(
      { ...scaleSettings, global: next },
      '整体缩放 ' + formatScalePercent(next) + '：角色、UI/文本、气泡与面板一起变化。',
    )
  }
  const setUiTextScale = (value: number): void => {
    const next = clampScale(value, UI_TEXT_SCALE_MIN, UI_TEXT_SCALE_MAX)
    applyScaleSettings(
      { ...scaleSettings, uiText: next },
      Math.abs(next - 1) < 1e-9
        ? 'UI + 文本已跟随整体缩放。'
        : 'UI + 文本设为整体的 ' + formatScalePercent(next) + '（图像不变）。',
    )
  }
  const setImageScale = (value: number): void => {
    const next = clampScale(value, IMAGE_SCALE_MIN, IMAGE_SCALE_MAX)
    applyScaleSettings(
      { ...scaleSettings, image: next },
      Math.abs(next - 1) < 1e-9
        ? '图像已跟随整体缩放。'
        : '图像设为整体的 ' + formatScalePercent(next) + '（UI/文本不变）。',
    )
  }
  const setComponentScale = (id: ScaleComponentId, value: number | null): void => {
    const components = { ...scaleSettings.components }
    if (value === null || Math.abs(value - 1) < 1e-9) delete components[id]
    else components[id] = clampScale(value, COMPONENT_SCALE_MIN, COMPONENT_SCALE_MAX)
    const label = SCALE_COMPONENTS.find((component) => component.id === id)?.label ?? id
    applyScaleSettings(
      { ...scaleSettings, components },
      value === null ? label + '已恢复继承（跟随 UI + 文本）。' : label + '调整为继承值的 ' + formatScalePercent(value) + '。',
    )
  }
  const resetAllScales = (): void => {
    if (consentBlocked()) return
    scaleSettings = resetScaleSettings()
    resolvedScales = resolveScaleSettings(scaleSettings)
    pendingScaleMigration = false
    applyScale()
    refreshSettings()
    settingsStatus('已恢复默认缩放：整体 100%，UI+文本/图像/组件全部跟随。')
  }
  applyScale()
  /**
   * MB-050: coalesce re-fits. The hero canvas receives its CSS size only after
   * the first pack frame, so a boot-time applyScale() can be working with an
   * unmeasurable stage (offsetWidth 0) and keep the unclamped resolved hero
   * zoom. Any late layout change now re-runs the same fit; requestAnimationFrame
   * lets the browser lay the new box out first.
   */
  let scaleRefitPending = false
  const scheduleScaleRefit = (): void => {
    if (scaleRefitPending) return
    scaleRefitPending = true
    const run = (): void => {
      scaleRefitPending = false
      applyScale()
    }
    try {
      const raf = (winRef as unknown as { requestAnimationFrame?: (callback: () => void) => unknown }).requestAnimationFrame
      if (typeof raf === 'function') raf.call(winRef, run)
      else run()
    } catch {
      run()
    }
  }
  scaleRefitRequest = scheduleScaleRefit
  winRef.addEventListener('resize', scheduleScaleRefit)
  // Late layout sources: the hero stage/canvas get their fitted size after the
  // first frame, the render mode flips when the hero takes over the folded
  // paper, and a pack switch can resize the canvas again. Observation is an
  // optimisation: main.ts also requests a refit explicitly at that moment.
  try {
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(scheduleScaleRefit)
      for (const element of [heroStageEl, pet, docRef.getElementById('hero-canvas')]) {
        if (element) resizeObserver.observe(element)
      }
    }
  } catch {
    /* observation is best-effort; the explicit refit still runs */
  }
  try {
    if (typeof MutationObserver !== 'undefined') {
      const renderObserver = new MutationObserver(scheduleScaleRefit)
      renderObserver.observe(docRef.documentElement, { attributes: true, attributeFilter: ['data-pet-render'] })
    }
  } catch {
    /* same */
  }


  const menu = docRef.createElement('div')
  menu.id = MENU_ID
  menu.className = 'pet-shell-menu'
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', '桌面菜单')
  menu.setAttribute('aria-orientation', 'vertical')
  menu.setAttribute('aria-hidden', 'true')
  menu.tabIndex = -1
  menu.inert = true
  menu.dataset.state = 'closed'
  docRef.body.append(menu)

  // The menu is opened by right-click, Shift+F10/ContextMenu or this button.
  // It is the only element that can carry aria-haspopup/aria-expanded for it.
  const trigger = docRef.getElementById(MENU_BUTTON_ID) as HTMLButtonElement | null
  if (trigger) {
    trigger.setAttribute('aria-haspopup', 'menu')
    trigger.setAttribute('aria-controls', MENU_ID)
    trigger.setAttribute('aria-expanded', 'false')
  }

  let menuOpen = false
  let menuView: ShellMenuView = 'root'
  let returnFocus: HTMLElement | null = null

  // ------------------------------------------------------------------
  // Settings-backed shell state (task-65)
  // ------------------------------------------------------------------
  // 默认没有任何角色外常驻按钮: the ⋯ trigger is hidden unless the stored
  // preference says otherwise; right-click / Shift+F10 / ContextMenu still
  // open the menu. pet.html also ships the button with a static `hidden`
  // attribute so the first paint cannot flash it.
  let showMenuButton = resolveShowMenuButton()
  const applyTriggerVisibility = (visible: boolean): void => {
    if (!trigger) return
    trigger.hidden = !visible
    trigger.tabIndex = visible ? 0 : -1
    trigger.dataset.visible = visible ? '1' : '0'
  }
  applyTriggerVisibility(showMenuButton)

  const prefersReduceMotion = (): boolean => systemPrefersReducedMotion(winRef)
  let reduceMotion = resolveReduceMotion(undefined, prefersReduceMotion())
  /**
   * Shared reduced-motion watcher (MB-071): the OS preference is the default and
   * keeps applying while the user has not made an explicit choice; an explicit
   * setting (including "off") wins and is persisted. The same attribute drives
   * CSS tokens, the hero rAF loop and the game windows.
   */
  const reduceMotionWatcher = watchReduceMotion(docRef, winRef, {
    onChange: (active) => {
      reduceMotion = active
      refreshSettings()
    },
  })
  reduceMotion = reduceMotionWatcher.active()
  /** Apply + persist 减少动态: CSS tokens collapse and main.ts pauses hero ticks. */
  const applyReduceMotion = (enabled: boolean, persist = true): void => {
    reduceMotion = enabled
    applyReduceMotionAttribute(docRef, enabled)
    if (persist) writeExplicitReduceMotion(enabled)
  }
  applyReduceMotion(reduceMotion, false)

  // ------------------------------------------------------------------
  // Quiet hours / 夜间安静 (MB-070)
  // ------------------------------------------------------------------
  // Default 22:00–08:00, enabled, user-adjustable and can be turned off. The
  // shell persists it; main.ts mirrors the value and suppresses ambient output
  // while the window is active. The health reminder is deferred (not dropped)
  // by the consent runtime during quiet hours.
  let quietHours = readQuietHours()
  const applyQuietHours = (next: QuietHoursSettings, persist = true): QuietHoursSettings => {
    quietHours = persist ? writeQuietHours(next) : normalizeQuietHours(next)
    if (persist) {
      try {
        options.onQuietHoursChange?.(quietHours)
      } catch {
        /* the preference is already saved; a listener failure must not undo it */
      }
      // The settings DOM exists by the time the user can change anything; the
      // initial (persist=false) load above runs before it is constructed.
      refreshSettings()
    }
    return quietHours
  }
  applyQuietHours(quietHours, false)

  // Dev/E2E-only entry point (完整面板). Never rendered in the release menu.
  const debugMode = debugShellFromSearch(winRef.location.search) || isViteDevBuild()

  // The settings dialog is body-level like the menu/content center. It is
  // created below; these state holders are declared first so the menu and the
  // consent-overlay handler can coordinate with it.
  let settingsOpen = false
  let settingsReturnFocus: HTMLElement | null = null

  const menuItems = (): HTMLButtonElement[] =>
    Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"], button[role="menuitemradio"]'))
  const focusableMenuItems = (): HTMLButtonElement[] => menuItems().filter((item) => !item.disabled)

  const focusMenuItem = (index: number): void => {
    const items = focusableMenuItems()
    if (items.length === 0) return
    const next = items[((index % items.length) + items.length) % items.length]!
    for (const item of menuItems()) item.tabIndex = item === next ? 0 : -1
    next.focus()
  }
  const focusActionItem = (action: string): void => {
    const target = menuItems().find((item) => item.dataset.action === action)
    if (!target || target.disabled) {
      focusMenuItem(0)
      return
    }
    focusMenuItem(focusableMenuItems().indexOf(target))
  }

  const closeMenu = (restoreFocus = true): void => {
    if (!menuOpen) return
    menuOpen = false
    menu.dataset.state = 'closed'
    menu.setAttribute('aria-hidden', 'true')
    menu.inert = true
    trigger?.setAttribute('aria-expanded', 'false')
    if (restoreFocus) {
      const target = returnFocus && returnFocus.isConnected ? returnFocus : trigger
      target?.focus()
    }
    returnFocus = null
  }

  /**
   * The ONE quit entry for every menu level (root + 更多). main.ts owns the
   * save-then-close sequence (MB-010 / UX V-01); dev pages without a callback
   * keep the old direct close so the shell still works stand-alone.
   */
  const requestExit = (): void => {
    ;(options.onExit ?? (() => winRef.close()))()
  }

  const renderMenu = (focusAction?: string): void => {
    menu.replaceChildren()
    const add = (label: string, action: () => void, hint = '', icon?: string): void => {
      const button = docRef.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.tabIndex = -1
      button.textContent = hint ? `${label} ${hint}` : label
      if (icon) {
        const img = docRef.createElement('img')
        img.className = 'pet-menu-icon'
        img.src = `/assets/ui/${icon}`
        img.alt = ''
        img.setAttribute('aria-hidden', 'true')
        img.width = 16
        img.height = 16
        img.decoding = 'async'
        button.append(img)
      }
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        closeMenu()
        // Re-check at activation time: a per-action TOS can open after the menu
        // rendered, and keyboard Enter must never run pat/give/fold/Advisers/scale
        // outside a valid consent state.
        if (menuBlocked()) return
        action()
      })
      menu.append(button)
    }
    const addHeading = (text: string): void => {
      const heading = docRef.createElement('p')
      heading.className = 'pet-menu-heading'
      heading.setAttribute('role', 'presentation')
      heading.textContent = text
      menu.append(heading)
    }
    const addInline = (
      row: HTMLElement,
      options: {
        label: string
        actionId: string
        role: 'menuitem' | 'menuitemradio'
        disabled?: boolean
        checked?: boolean
        onActivate: () => void
      },
    ): void => {
      const button = docRef.createElement('button')
      button.type = 'button'
      button.setAttribute('role', options.role)
      button.tabIndex = -1
      button.dataset.action = options.actionId
      button.textContent = options.label
      if (options.role === 'menuitemradio') button.setAttribute('aria-checked', options.checked ? 'true' : 'false')
      if (options.checked) button.classList.add('active')
      if (options.disabled) {
        button.disabled = true
        button.setAttribute('aria-disabled', 'true')
      }
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (menuBlocked()) {
          closeMenu(false)
          return
        }
        options.onActivate()
      })
      row.append(button)
    }
    const addSubmenu = (label: string, view: Exclude<ShellMenuView, 'root'>): void => {
      const button = docRef.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.setAttribute('aria-haspopup', 'menu')
      button.tabIndex = -1
      button.dataset.action = `nav:${view}`
      button.dataset.submenu = view
      button.textContent = `${label} ▸`
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (menuBlocked()) {
          closeMenu(false)
          return
        }
        setMenuView(view)
      })
      menu.append(button)
    }
    // Every sub-menu starts with 返回 (task-65: 二级必须有返回), which returns
    // focus to the parent entry instead of dropping it on the page.
    const addBack = (parentAction: string): void => {
      const button = docRef.createElement('button')
      button.type = 'button'
      button.setAttribute('role', 'menuitem')
      button.tabIndex = -1
      button.dataset.action = 'nav:back'
      button.textContent = '← 返回'
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        setMenuView('root', parentAction)
      })
      menu.append(button)
    }

    if (menuView === 'root') {
      // Root stays at FIVE entries (task-65 / UX review §7.2): common actions
      // first, complex or low-frequency surfaces in 互动…/更多… or 设置…. No
      // dev/E2E entry, no legal/dangerous action and no inline scale rows here.
      add('交办 / 打字输入…', () => { openComposer?.() }, '', 'menu/U-MENU-01a_32x32.png')
      addSubmenu('互动', 'interact')
      // ONE consolidated role/content entry: role one-click themes,
      // per-component customisation, local pack import and the remote-market
      // entry all live in the role & content center. The four old 「渲染器：…」
      // rows are intentionally NOT rendered any more.
      add('角色与内容中心…', () => { openContentHub?.() }, '', 'menu/U-MENU-08a_32x32.png')
      add('设置…', () => { openSettingsSurface() }, '', 'menu/U-MENU-07a_32x32.png')
      addSubmenu('更多', 'more')
      // Quit stays at the root: with no persistent buttons, a nested-only exit
      // is too hard to find when a user wants to stop the pet.
      add('退出', requestExit, '', 'menu/U-MENU-10a_32x32.png')
    } else if (menuView === 'interact') {
      addBack('nav:interact')
      addHeading(heroActive() ? '互动 · 当前角色' : '互动 · 折纸')
      if (heroActive()) {
        // Hero canvas is drawing: the folded-paper DOM buttons are hidden by
        // pet.css, so route the same intents through hero.emit() data events.
        const items = options.getHeroActions?.() ?? heroMenuActions(true)
        for (const item of items) {
          add(item.label, () => { onHeroAction?.(item.action) })
        }
      } else {
        // Origami mode keeps the original folded-paper actions unchanged.
        add('摸摸', () => click('pat'), '', 'menu/U-MENU-01a_32x32.png')
        add('给纸片', () => click('give'), '', 'menu/U-MENU-02a_32x32.png')
        add('折一下', () => click('fold'), '', 'menu/U-MENU-03a_32x32.png')
      }
    } else {
      addBack('nav:more')
      addHeading('折页簿 / 导入')
      add('折页簿', () => click('memory-book'), '', 'menu/U-MENU-04a_32x32.png')
      add('导入 DeepSeek 网页会话…', openImportWithConsent, '', 'menu/U-MENU-05a_32x32.png')
      addHeading('Advisers（只读，可选）')
      add('Advisers 开关', () => click('advisers-toggle'), '', 'menu/U-MENU-06a_32x32.png')
      // Desktop shell hides aside.panel: surface the read-only status + retry in
      // the menu so the hardened Advisers hook is reachable there too. Only the
      // already-sanitized status text/retry affordance is read; no brief content.
      const advisers = advisersBridge()
      if (advisers?.status) {
        const view = describeAdvisersFaceView(advisers.status)
        addHeading(view.text)
        // displayPolicy: explicit `public` must be visible as such everywhere the
        // brief is surfaced; private/none get a short policy line. Only fixed
        // policy copy is added — never brief content or counts.
        if (advisers.status.displayPolicy !== undefined) {
          addHeading(`简报策略：${resolveAdvisersPanelPolicy(advisers.status).badge}`)
        }
        add('打开 Advisers 简报…', () => click('advisers-status'))
        if (view.retryLabel !== null) {
          add(`Advisers ${view.retryLabel}`, () => { void advisers.retry?.() })
        }
      }
      addHeading('保存 / 读取')
      // main.ts owns the encrypted save path + user feedback; fall back to the
      // existing hidden buttons so no caller can bypass it.
      add('保存', () => { if (options.saveArchive) options.saveArchive(); else click('save') })
      add('读取', () => { if (options.loadArchive) options.loadArchive(); else click('load') })
      addHeading('窗口 / 工具')
      // W-02 / UX-P0-4: recall entry at the product-menu level (the settings
      // dialog already has one, but settings itself can be off screen). Reuses
      // the exact same callback as 设置 → 复位窗口; on the Tauri host that is
      // the Rust reset command, so the tray and the menu land in the same
      // taskbar-aware bottom-right position.
      add('复位窗口到右下角', () => {
        if (options.resetWindow) options.resetWindow()
        else click('reset-window')
      })
      add('模型 / API Key 设置…', openSetup, '', 'menu/U-MENU-07a_32x32.png')
      // Scale settings are one level down in 设置… (常用 → 整体缩放; second
      // level → UI+文本 / 图像; 高级 → 组件缩放). One deep-link entry replaces
      // the old duplicated「宠物缩放/文字大小」rows (E-02) and keeps the axis
      // hierarchy strictly deeper than the global control.
      add('缩放…（整体 / UI+文本 / 图像 / 组件）', () => { openSettingsSurface('pet-settings-scale-global') }, '', 'menu/U-MENU-07a_32x32.png')
      addHeading('安静 / 健康')
      // Quiet hours + the 2h health reminder + AI attribution are one settings
      // group; this deep-link is the discoverable "更多" entry (the product
      // keeps zero always-on chrome around the character).
      add('夜间安静 / 健康提醒 / AI 标识…', () => { openSettingsSurface('pet-settings-quiet-enabled') }, '', 'menu/U-MENU-07a_32x32.png')
      addHeading('关于 / 声明 / 数据控制')
      add('关于与声明（完整 TOS/免责声明/数据控制）…', openAboutPanel, '', 'menu/U-MENU-09a_32x32.png')
      // 2026-11-17 user decision: roleplay is NOT a public gameplay/selling point
      // or visible entry. The menu deliberately creates no roleplay entry; the
      // internal gate/flow and the TOS/legal roleplay provisions are retained.
      // Data controls (P0 R-P0-06) are also reachable from the desktop menu (the
      // About panel is where the full explanation lives). Each opens the same
      // explicit 2-step dialog; declining/cancelling changes nothing.
      add('撤回同意（停止处理，二次确认）…', () => {
        void requestWithdrawConsent().catch(() => {})
      })
      add('删除全部本地数据（二次确认，残留会列出）…', () => {
        void requestDeleteAllLocalData().catch(() => {})
      })
      add('TTS 声明与语音确认…', () => click('tts-consent'))
      // 完整面板 (dev/E2E) is NEVER in the release menu (task-65): it exists
      // only for an explicit ?debug=1 / ?dev=1 URL or the Vite dev build.
      if (debugMode) {
        add('完整面板（开发/E2E）', () => { winRef.location.search = '?shell=window' })
      }
      // Same save-then-close path as the root entry: a nested bare
      // window.close() silently dropped unsaved state (MB-010 / UX P0-3).
      add('退出', requestExit, '', 'menu/U-MENU-10a_32x32.png')
    }
    if (focusAction !== undefined) focusActionItem(focusAction)
  }

  /** Menu level switch (root → 互动/更多 and back); focus follows the level. */
  const setMenuView = (view: ShellMenuView, focusAction?: string): void => {
    menuView = view
    renderMenu(focusAction)
  }

  /** Last pointer anchor so a sub-menu re-render can re-clamp inside the window. */
  let menuAnchor = { x: 4, y: 4 }
  /** Current component zoom of the menu (advanced override or inherited). */
  const menuZoomValue = (): number => {
    try {
      const view = (docRef as Document & { defaultView?: Window | null }).defaultView
      const raw = view?.getComputedStyle(docRef.documentElement).getPropertyValue('--menu-zoom').trim() ?? ''
      const value = Number(raw)
      return Number.isFinite(value) && value > 0 ? value : 1
    } catch {
      return 1
    }
  }
  const positionMenu = (): void => {
    menu.style.left = '0px'
    menu.style.top = '0px'
    // Measure the LAYOUT box (offsetWidth/Height ignore the transform) and
    // multiply by the component zoom: during the open transition the animated
    // scale(.98) rect is smaller than the final panel, so clamping on the live
    // rect would let the final, zoomed menu overflow the window edge.
    const rect = menu.getBoundingClientRect()
    const zoom = menuZoomValue()
    const layoutWidth = menu.offsetWidth || (zoom > 0 ? rect.width / zoom : rect.width)
    const layoutHeight = menu.offsetHeight || (zoom > 0 ? rect.height / zoom : rect.height)
    const width = layoutWidth * zoom
    const height = layoutHeight * zoom
    const left = Math.max(4, Math.min(menuAnchor.x, winRef.innerWidth - width - 4))
    const top = Math.max(4, Math.min(menuAnchor.y, winRef.innerHeight - height - 4))
    menu.style.left = left + 'px'
    menu.style.top = top + 'px'
  }

  /**
   * Open at the pointer/keyboard anchor. The menu is sized while still hidden
   * (visibility:hidden keeps layout measurable), positioned before the
   * data-state flip, so opening cannot shift page content (transform/opacity
   * only, no layout thrash, CLS ~0).
   *
   * CONSENT P0: returns false and leaves the menu closed/inert while the gate
   * is not accepted or a consent overlay is showing.
   */
  const openMenuAt = (x: number, y: number): boolean => {
    if (!menuEnabled) return false
    if (menuBlocked()) {
      closeMenu(false)
      return false
    }
    if (!menuOpen) {
      const active = docRef.activeElement
      returnFocus = active instanceof HTMLElement ? active : trigger
      menuView = 'root'
      renderMenu()
    }
    menuAnchor = { x, y }
    menu.inert = false
    menu.dataset.state = 'open'
    menu.setAttribute('aria-hidden', 'false')
    trigger?.setAttribute('aria-expanded', 'true')
    menuOpen = true
    // The user found the menu: the one-time coach is no longer needed.
    ackMenuCoach()
    setConsentState()
    positionMenu()
    focusMenuItem(0)
    return true
  }

  const openFromTrigger = (): boolean => {
    // A hidden ⋯ trigger has no measurable rect: anchor the keyboard menu to
    // the pet instead of the viewport corner.
    const visibleTrigger = trigger && !trigger.hidden ? trigger : null
    const anchorEl = visibleTrigger ?? pet
    const anchor = anchorEl.getBoundingClientRect()
    return openMenuAt(anchor.left, anchor.top - 4)
  }
  // The focused character (Tab → #pet/#hero-stage → Enter/Space) opens the same
  // menu as right-click / Shift+F10 / the ⋯ trigger.
  openMenuFromKeyboard = () => openFromTrigger()

  trigger?.addEventListener('click', (event) => {
    event.stopPropagation()
    if (menuBlocked()) {
      closeMenu(false)
      setConsentState()
      return
    }
    if (menuOpen) closeMenu()
    else openFromTrigger()
  })

  menu.addEventListener('keydown', (event) => {
    if (!menuOpen) return
    if (menuBlocked()) {
      event.preventDefault()
      closeMenu(false)
      return
    }
    const items = focusableMenuItems()
    const current = items.indexOf(docRef.activeElement as HTMLButtonElement)
    // 互动…/更多… are real sub-levels: ArrowRight enters, ArrowLeft goes back.
    const activeButton = docRef.activeElement as HTMLButtonElement | null
    const activeSubmenu = activeButton?.dataset?.submenu
    if (event.key === 'ArrowRight' && (activeSubmenu === 'interact' || activeSubmenu === 'more')) {
      event.preventDefault()
      setMenuView(activeSubmenu)
      return
    }
    if (event.key === 'ArrowLeft' && menuView !== 'root') {
      event.preventDefault()
      setMenuView('root', `nav:${menuView}`)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const target = menuTabTarget(event.shiftKey, current, items.length)
      if (target !== null) focusMenuItem(target)
      return
    }
    const target = menuNavigationTarget(event.key, current, items.length)
    if (target !== null) {
      event.preventDefault()
      focusMenuItem(target)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
    }
  })

  /**
   * A consent overlay opening (first-run TOS, per-action TOS, TTS declaration or
   * the read-only blocked screen) must immediately close and inert the
   * body-level menu. Close events re-read the gate so the shell returns to
   * `ready` only when it is actually allowed again.
   */
  const onConsentOverlay = (event: Event): void => {
    const detail = (event as CustomEvent<ConsentOverlayEventDetail>).detail
    if (!detail || detail.open) {
      closeMenu(false)
      // The settings dialog and the one-time coach are body-level chrome too:
      // a TOS/TTS/blocked modal must never leave them focusable behind it.
      closeSettings(false)
      removeMenuCoach()
      setConsentState()
      return
    }
    if (menuBlocked()) closeMenu(false)
    closeSettings(false)
    // The modal's unlock removes the inert attribute it set on body-level
    // siblings; a closed menu must remain inert/tab-invisible after that.
    if (menuOpen) closeMenu(false)
    else menu.inert = true
    setConsentState()
    // First run: the TOS just closed — teach the hidden entry points once.
    showMenuCoachIfEligible()
  }
  docRef.addEventListener(CONSENT_OVERLAY_EVENT, onConsentOverlay)

  // -------------------------------------------------------------------------
  // 总设置 dialog (#pet-settings)
  //
  // One body-level modal, opened from 设置… or 更多… (and later from a tray/
  // settings window). Groups follow the UX/psychology reviews:
  //  常用 (menu-button visibility, mute/volume, reduce motion, reset, save/load)
  //  外观 (pet/text scale, role & content center)
  //  隐私 / Advisers (read-only brief, local-only note)
  //  关于 / 声明 / 数据控制 (TOS, TTS declaration, withdraw, delete-all)
  //  高级/调试 (ONLY ?debug=1 or the Vite dev build; release never shows it).
  // Escape/Tab are trapped, the closed dialog stays inert, and every consent
  // overlay closes it through the listener above.
  // -------------------------------------------------------------------------
  let settingsDom: SettingsDom | null = null

  const settingsAudio = (): { muted: boolean; volume: number } => {
    try {
      const current = options.getAudioState?.()
      if (current && Number.isFinite(current.volume)) {
        return { muted: current.muted === true, volume: clamp(Math.round(current.volume), 0, 100) }
      }
    } catch {}
    return { muted: false, volume: 70 }
  }

  const settingsStatus = (text: string): void => {
    if (settingsDom) settingsDom.status.textContent = text
  }

  function settingsFocusable(): HTMLElement[] {
    if (!settingsDom) return []
    return Array.from(settingsDom.root.querySelectorAll<HTMLElement>('button, input, select, a[href], summary')).filter((element) => {
      const input = element as HTMLInputElement
      return !(element as HTMLButtonElement).disabled && !element.hidden && input.type !== 'hidden'
    })
  }

  function focusSettingsFirst(): void {
    const items = settingsFocusable()
    const first = items[0]
    if (first) first.focus()
    else settingsDom?.root.focus()
  }

  /**
   * Open the settings dialog; false when consent/modal state refuses it.
   * `focusTarget` is the deep-link target used by 「更多 → 缩放…」 (focus +
   * scroll the requested control instead of landing on the first field).
   */
  function openSettings(focusTarget?: string): boolean {
    if (consentBlocked() || !settingsDom) return false
    closeMenu(false)
    ackMenuCoach()
    // Flush a pending legacy migration now that the gate is known to be open.
    applyScale()
    const previous = docRef.activeElement
    // A menu item is about to become inert, so prefer it only when it is not
    // inside the menu; otherwise fall back to the (visible) ⋯ trigger.
    const fromMenu = previous !== null && menu.contains(previous)
    settingsReturnFocus = fromMenu ? null : previous instanceof HTMLElement ? previous : null
    if (!settingsReturnFocus && trigger && !trigger.hidden) settingsReturnFocus = trigger
    refreshSettings()
    if (settingsDom.status) settingsDom.status.textContent = ''
    settingsDom.root.inert = false
    settingsDom.root.setAttribute('aria-hidden', 'false')
    settingsDom.root.dataset.state = 'open'
    settingsOpen = true
    if (focusTarget !== undefined) {
      const target = docRef.getElementById(focusTarget)
      if (target) {
        try {
          target.scrollIntoView?.({ block: 'nearest' })
        } catch {}
        target.focus()
      } else {
        focusSettingsFirst()
      }
    } else {
      focusSettingsFirst()
    }
    return true
  }

  /**
   * Open settings: the independent content/settings window when the host supplies
   * the opener (MB-062), else today's in-window modal (browser/dev fallback and a
   * failed/denied window creation). Rendering/persistence stay identical.
   */
  function openSettingsSurface(focusTarget?: string): boolean {
    if (options.openSettingsWindow) {
      try {
        if (options.openSettingsWindow(focusTarget)) return true
      } catch {
        /* fall through to the in-window dialog */
      }
    }
    return openSettings(focusTarget)
  }

  /** Close the settings dialog and restore focus to the opener when possible. */
  function closeSettings(restoreFocus = true): void {
    if (!settingsOpen || !settingsDom) return
    settingsOpen = false
    settingsDom.root.dataset.state = 'closed'
    settingsDom.root.setAttribute('aria-hidden', 'true')
    settingsDom.root.inert = true
    if (restoreFocus) {
      const fallback = trigger && !trigger.hidden ? trigger : null
      const target = settingsReturnFocus && settingsReturnFocus.isConnected ? settingsReturnFocus : fallback
      if (target) target.focus()
      else {
        // No visible opener (hidden ⋯ trigger): do not leave focus on the
        // now-inert dialog.
        const active = docRef.activeElement as HTMLElement | null
        if (typeof active?.blur === 'function') active.blur()
      }
    }
    settingsReturnFocus = null
    try {
      options.onSettingsClosed?.()
    } catch {
      /* the dialog is already closed; a host hook failure must not break it */
    }
  }

  /** Re-read every value from the live shell state into the dialog controls. */
  function refreshSettings(): void {
    if (!settingsDom) return
    settingsDom.showMenuButton.checked = showMenuButton
    const audio = settingsAudio()
    settingsDom.mute.checked = audio.muted
    settingsDom.volume.value = String(audio.volume)
    settingsDom.volumeValue.textContent = audio.volume + '%'
    settingsDom.reduceMotion.checked = reduceMotion
    settingsDom.quietEnabled.checked = quietHours.enabled
    settingsDom.quietStart.value = quietHours.start
    settingsDom.quietEnd.value = quietHours.end

    // 常用 → 整体缩放 (all content together).
    settingsDom.globalScale.value = String(scaleSettings.global)
    settingsDom.globalValue.textContent = formatScalePercent(scaleSettings.global)

    // Second level → UI+文本 / 图像 independent axes.
    settingsDom.uiTextScale.value = String(scaleSettings.uiText)
    settingsDom.uiTextValue.textContent =
      formatScalePercent(resolvedScales.global * resolvedScales.uiText) +
      (Math.abs(scaleSettings.uiText - 1) < 1e-9 ? '（跟随整体）' : '（独立）')
    settingsDom.uiTextFollow.disabled = Math.abs(scaleSettings.uiText - 1) < 1e-9
    settingsDom.imageScale.value = String(scaleSettings.image)
    settingsDom.imageValue.textContent =
      formatScalePercent(resolvedScales.global * resolvedScales.image) +
      (Math.abs(scaleSettings.image - 1) < 1e-9 ? '（跟随整体）' : '（独立）')
    settingsDom.imageFollow.disabled = Math.abs(scaleSettings.image - 1) < 1e-9

    // Advanced (one level deeper) → per-component overrides.
    for (const id of SCALE_COMPONENT_IDS) {
      const select = settingsDom.componentSelects[id]
      const value = scaleSettings.components[id]
      select.value = typeof value === 'number' ? String(value) : '1'
      settingsDom.componentValues[id].textContent = '实际 ' + formatScaleMultiplier(resolvedScales.components[id])
    }
  }

  function buildSettingsModal(): SettingsDom {
    const root = makeElement(docRef, 'div', 'pet-settings')
    root.id = SETTINGS_ID
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-labelledby', 'pet-settings-title')
    root.setAttribute('aria-hidden', 'true')
    root.dataset.state = 'closed'
    root.tabIndex = -1
    root.inert = true

    const backdrop = makeElement(docRef, 'div', 'pet-settings-backdrop')
    backdrop.setAttribute('aria-hidden', 'true')
    const card = makeElement(docRef, 'div', 'pet-settings-card')
    const head = makeElement(docRef, 'div', 'pet-settings-head')
    const title = makeElement(docRef, 'h2', 'pet-settings-title', '桌面设置')
    title.id = 'pet-settings-title'
    const closeButton = makeElement(docRef, 'button', 'pet-settings-close', '关闭')
    closeButton.id = 'pet-settings-close'
    closeButton.type = 'button'
    closeButton.setAttribute('aria-label', '关闭设置')
    head.append(title, closeButton)

    const status = makeElement(docRef, 'p', 'pet-settings-status')
    status.id = 'pet-settings-status'
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')

    const group = (headingText: string): HTMLElement => {
      const section = makeElement(docRef, 'section', 'pet-settings-group')
      section.append(makeElement(docRef, 'h3', 'pet-settings-group-title', headingText))
      return section
    }
    const field = (className = 'pet-settings-field'): HTMLElement => makeElement(docRef, 'div', className)
    const note = (text: string): HTMLElement => makeElement(docRef, 'p', 'pet-settings-note', text)
    const action = (
      id: string,
      label: string,
      onClick: () => void,
      className = 'pet-settings-action',
    ): HTMLButtonElement => {
      const button = makeElement(docRef, 'button', className, label)
      button.id = id
      button.type = 'button'
      button.addEventListener('click', (event) => {
        event.stopPropagation()
        // Re-check at activation time: a consent overlay can open after render.
        if (consentBlocked()) return
        onClick()
      })
      return button
    }
    const checkbox = (
      id: string,
      labelText: string,
      checked: boolean,
      onChange: (checked: boolean) => void,
      hint?: string,
    ): { wrap: HTMLElement; input: HTMLInputElement } => {
      const wrap = field()
      const label = makeElement(docRef, 'label', 'pet-settings-check')
      label.setAttribute('for', id)
      const input = docRef.createElement('input')
      input.type = 'checkbox'
      input.id = id
      input.checked = checked
      input.addEventListener('change', () => onChange(input.checked))
      label.append(input, makeElement(docRef, 'span', 'pet-settings-check-text', labelText))
      wrap.append(label)
      if (hint !== undefined) wrap.append(note(hint))
      return { wrap, input }
    }
    /**
     * Percent range row for the scale axes. The model stores multipliers
     * (100% = 1×); the control is a native range input so it is keyboard and
     * screen-reader operable for free, and dragging applies immediately.
     */
    const percentSlider = (
      id: string,
      labelText: string,
      minPercent: number,
      maxPercent: number,
      stepPercent: number,
      percent: number,
      onInput: (multiplier: number) => void,
    ): { wrap: HTMLElement; input: HTMLInputElement; value: HTMLElement } => {
      const wrap = field('pet-settings-field pet-settings-scale-field')
      const label = makeElement(docRef, 'label', 'pet-settings-label', labelText)
      label.setAttribute('for', id)
      const input = docRef.createElement('input')
      input.type = 'range'
      input.id = id
      input.min = String(minPercent)
      input.max = String(maxPercent)
      input.step = String(stepPercent)
      input.value = String(Math.round(percent))
      const valueEl = makeElement(docRef, 'span', 'pet-settings-value', '')
      valueEl.id = id + '-value'
      input.addEventListener('input', () => {
        const next = Number(input.value)
        if (Number.isFinite(next)) onInput(next / 100)
      })
      wrap.append(label, input, valueEl)
      return { wrap, input, value: valueEl }
    }

    // --- 常用 ---------------------------------------------------------
    // First level: ONE global scale control (所有内容一并缩放). The independent
    // axes and component overrides live strictly below it (下一个分组 / 高级).
    const common = group('常用')
    const audioNow = settingsAudio()
    const globalScaleRow = percentSlider(
      'pet-settings-scale-global',
      '整体缩放（所有内容一并缩放）',
      Math.round(GLOBAL_SCALE_MIN * 100),
      Math.round(GLOBAL_SCALE_MAX * 100),
      Math.round(GLOBAL_SCALE_STEP * 100),
      scaleSettings.global * 100,
      (multiplier) => setGlobalScale(multiplier),
    )
    globalScaleRow.wrap.append(
      note('100% = 默认大小；角色、UI/文本、气泡与面板一起缩放。窗口放不下时会自动贴合，不裁切内容。'),
    )
    const resetScaleField = field('pet-settings-field pet-settings-actions')
    const resetScalesButton = action('pet-settings-scale-reset', '恢复默认缩放', () => resetAllScales(), 'pet-settings-chip')
    resetScaleField.append(resetScalesButton)
    const showMenu = checkbox(
      'pet-settings-show-menu-button',
      '显示菜单按钮（⋯）',
      showMenuButton,
      (checked) => {
        showMenuButton = checked
        applyTriggerVisibility(checked)
        writeStoredFlag(SHOW_MENU_BUTTON_KEY, checked)
        settingsStatus(checked ? '已显示 ⋯：可以点它打开菜单。' : '已隐藏 ⋯：右键或 Shift+F10 仍可打开菜单。')
      },
      '默认隐藏，角色周围不常驻任何按钮；隐藏后右键 / Shift+F10 / ContextMenu 仍可打开菜单。',
    )
    const muteField = checkbox(
      'pet-settings-mute',
      '静音（不播放语音）',
      audioNow.muted,
      (checked) => {
        options.setMuted?.(checked)
        refreshSettings()
        settingsStatus(checked ? '已静音；字幕/气泡仍会显示。' : '已取消静音；语音播放仍受 TTS 声明约束。')
      },
      '只影响语音播放；字幕与气泡不属于语音。',
    )
    const volumeField = field('pet-settings-field pet-settings-volume-field')
    const volumeLabel = makeElement(docRef, 'label', 'pet-settings-label', '音量')
    volumeLabel.setAttribute('for', 'pet-settings-volume')
    const volumeInput = docRef.createElement('input')
    volumeInput.type = 'range'
    volumeInput.id = 'pet-settings-volume'
    volumeInput.min = '0'
    volumeInput.max = '100'
    volumeInput.step = '5'
    volumeInput.value = String(audioNow.volume)
    const volumeValue = makeElement(docRef, 'span', 'pet-settings-value', `${audioNow.volume}%`)
    volumeInput.addEventListener('input', () => {
      const next = Number(volumeInput.value)
      options.setVolume?.(Number.isFinite(next) ? next : 0)
      volumeValue.textContent = `${Math.round(Number(volumeInput.value))}%`
    })
    // Volume is part of the TTS config: re-confirm the declaration on release.
    volumeInput.addEventListener('change', () => { options.onVolumeCommit?.() })
    volumeField.append(volumeLabel, volumeInput, volumeValue)
    const reduceField = checkbox(
      'pet-settings-reduce-motion',
      '减少动态（暂停界面动效）',
      reduceMotion,
      (checked) => {
        applyReduceMotion(checked)
        refreshSettings()
        settingsStatus(checked ? '已减少动态：过渡/循环动画暂停，角色画布只保留静态帧。' : '已恢复动效。')
      },
      '系统开启「减少动态」时默认勾选并随系统变化；手动设置后覆盖系统偏好。角色画布/farm 游戏页的循环动画会暂停或降频，交互仍可用。',
    )
    const resetWindowField = field()
    resetWindowField.append(
      action('pet-settings-reset-window', '复位窗口到右下角', () => {
        if (options.resetWindow) options.resetWindow()
        else click('reset-window')
        settingsStatus('已请求把窗口移回右下角。')
      }),
    )
    const archiveField = field('pet-settings-field pet-settings-actions')
    archiveField.append(
      action('pet-settings-save', '保存', () => {
        if (options.saveArchive) options.saveArchive()
        else click('save')
        settingsStatus('已请求保存本机存档。')
      }),
      action('pet-settings-load', '读取', () => {
        if (options.loadArchive) options.loadArchive()
        else click('load')
        settingsStatus('已请求读取本机存档。')
      }),
    )
    common.append(
      globalScaleRow.wrap,
      resetScaleField,
      showMenu.wrap,
      muteField.wrap,
      volumeField,
      reduceField.wrap,
      resetWindowField,
      archiveField,
    )

    // --- 安静 / 健康 / AI 标识 (E7: MB-070, MB-072, MB-076) -------------
    // All three live in the consolidated 总设置 dialog (root 菜单 → 设置… /
    // 更多 → 安静…): no extra always-on button around the character.
    const calm = group('安静 / 健康 / AI 标识')
    const quietCheck = checkbox(
      'pet-settings-quiet-enabled',
      '夜间安静时段（默认 22:00–08:00）',
      quietHours.enabled,
      (checked) => {
        const next = applyQuietHours({ ...quietHours, enabled: checked })
        settingsStatus(checked
          ? '已开启夜间安静：' + next.start + '–' + next.end + ' 不主动冒泡/不主动提醒；点击角色仍有回应。'
          : '已关闭夜间安静：自动气泡与提示恢复。')
      },
      '安静时段内自动气泡/环境动作停止，2 小时健康提醒会延后到安静结束；用户主动点击/说话仍会回应。可随时关闭。',
    )
    const quietTimes = field('pet-settings-field pet-settings-quiet-field')
    const quietStartLabel = makeElement(docRef, 'label', 'pet-settings-label', '开始')
    quietStartLabel.setAttribute('for', 'pet-settings-quiet-start')
    const quietStartInput = docRef.createElement('input')
    quietStartInput.type = 'time'
    quietStartInput.id = 'pet-settings-quiet-start'
    quietStartInput.value = quietHours.start
    quietStartInput.addEventListener('change', () => {
      if (!isValidClockText(quietStartInput.value)) {
        quietStartInput.value = quietHours.start
        settingsStatus('开始时间格式无效（需要 HH:MM），已保留原设置。')
        return
      }
      const next = applyQuietHours({ ...quietHours, start: quietStartInput.value })
      quietStartInput.value = next.start
      settingsStatus('安静开始时间已保存：' + quietHoursSummary(next) + '。')
    })
    const quietEndLabel = makeElement(docRef, 'label', 'pet-settings-label', '结束')
    quietEndLabel.setAttribute('for', 'pet-settings-quiet-end')
    const quietEndInput = docRef.createElement('input')
    quietEndInput.type = 'time'
    quietEndInput.id = 'pet-settings-quiet-end'
    quietEndInput.value = quietHours.end
    quietEndInput.addEventListener('change', () => {
      if (!isValidClockText(quietEndInput.value)) {
        quietEndInput.value = quietHours.end
        settingsStatus('结束时间格式无效（需要 HH:MM），已保留原设置。')
        return
      }
      const next = applyQuietHours({ ...quietHours, end: quietEndInput.value })
      quietEndInput.value = next.end
      settingsStatus('安静结束时间已保存：' + quietHoursSummary(next) + '。')
    })
    quietTimes.append(quietStartLabel, quietStartInput, quietEndLabel, quietEndInput)
    calm.append(
      quietCheck.wrap,
      quietTimes,
      note('安静时段当前：' + quietHoursSummary(quietHours) + '。与「安静」对话模式叠加生效。'),
      note('健康使用：连续使用每 2 小时提醒一次；提醒只有「休息一下（2 小时后仍会提醒）」和「10 分钟后再提醒」，不能永久关闭。页面隐藏/切到游戏窗口/重启都不清零。'),
      note('AI 标识：每次 AI 回复与语音播放时，气泡旁显示「AI 生成 · 不是真人」/「AI 语音 · 合成（不是真人）」，不只写在关于页。'),
    )

    // --- 缩放（独立轴）-------------------------------------------------
    // Second level: UI+文本 and 图像 can deviate from 整体缩放 independently.
    // Both are RELATIVE multipliers (100% = follow the global scale) so the
    // first-level 整体缩放 still controls them until the user decouples one.
    const independent = group('缩放（独立轴）')
    const uiTextRow = percentSlider(
      'pet-settings-scale-ui-text',
      'UI + 文本',
      Math.round(UI_TEXT_SCALE_MIN * 100),
      Math.round(UI_TEXT_SCALE_MAX * 100),
      Math.round(AXIS_SCALE_STEP * 100),
      scaleSettings.uiText * 100,
      (multiplier) => setUiTextScale(multiplier),
    )
    const uiTextFollow = action('pet-settings-scale-ui-text-follow', '跟随整体', () => setUiTextScale(1), 'pet-settings-chip')
    uiTextRow.wrap.append(uiTextFollow)
    uiTextRow.wrap.append(note('100% = 跟随整体缩放；单独调整后只有 UI/文本变化，角色图像不动。'))
    const imageRow = percentSlider(
      'pet-settings-scale-image',
      '图像',
      Math.round(IMAGE_SCALE_MIN * 100),
      Math.round(IMAGE_SCALE_MAX * 100),
      Math.round(AXIS_SCALE_STEP * 100),
      scaleSettings.image * 100,
      (multiplier) => setImageScale(multiplier),
    )
    const imageFollow = action('pet-settings-scale-image-follow', '跟随整体', () => setImageScale(1), 'pet-settings-chip')
    imageRow.wrap.append(imageFollow)
    imageRow.wrap.append(note('100% = 跟随整体缩放；单独调整后只有角色/预览图变化，UI/文本不动。窗口放不下时自动贴合。'))
    independent.append(uiTextRow.wrap, imageRow.wrap)

    // --- 内容与外观 ----------------------------------------------------
    const contentGroup = group('内容与外观')
    const contentField = field('pet-settings-field pet-settings-actions')
    contentField.append(
      action('pet-settings-content-hub', '角色与内容中心…', () => {
        closeSettings(false)
        openContentHub?.()
      }),
    )
    contentGroup.append(contentField, note('缩放只影响显示大小；换角色/内容仍在内容中心完成。'))

    // --- 隐私 / Advisers ---------------------------------------------
    const privacy = group('隐私 / Advisers')
    privacy.append(
      note('Advisers 只读本机 pet-brief.json：不读数据库、不上传、不写账本。简报内容本身不在设置里展示。'),
    )
    const advisersField = field('pet-settings-field pet-settings-actions')
    advisersField.append(
      action('pet-settings-advisers-panel', '打开 Advisers 只读简报…', () => {
        closeSettings(false)
        click('advisers-status')
      }),
      action('pet-settings-advisers-toggle', 'Advisers 开关', () => {
        closeSettings(false)
        click('advisers-toggle')
      }),
    )
    privacy.append(advisersField)

    // --- 关于 / 声明 / 数据控制 ---------------------------------------
    const aboutGroup = group('关于 / 声明 / 数据控制')
    const aboutField = field('pet-settings-field pet-settings-actions')
    aboutField.append(
      action('pet-settings-about', '关于与声明（完整 TOS/免责声明/数据控制）…', () => {
        closeSettings(false)
        openAboutPanel()
      }),
      action('pet-settings-tts', 'TTS 声明与语音确认…', () => {
        closeSettings(false)
        click('tts-consent')
      }),
    )
    const dangerField = field('pet-settings-field pet-settings-actions')
    dangerField.append(
      action('pet-settings-withdraw', '撤回同意…', () => {
        closeSettings(false)
        void requestWithdrawConsent().catch(() => {})
      }, 'pet-settings-action pet-settings-danger'),
      action('pet-settings-delete-all', '删除全部本地数据…', () => {
        closeSettings(false)
        void requestDeleteAllLocalData().catch(() => {})
      }, 'pet-settings-action pet-settings-danger'),
    )
    aboutGroup.append(aboutField, dangerField)

    // --- 高级 · 组件缩放（比「整体缩放」更下一级） ----------------------
    // Component overrides intentionally live behind a collapsed <details>:
    // 整体缩放 = first level, UI+文本/图像 = second level, per-component
    // overrides = third. Every component defaults to 继承 (multiplier 1).
    const advanced = makeElement(docRef, 'details', 'pet-settings-advanced')
    advanced.id = 'pet-settings-advanced'
    advanced.append(makeElement(docRef, 'summary', 'pet-settings-advanced-title', '高级 · 组件缩放（默认全部继承）'))
    advanced.append(note('组件缩放比「整体缩放」更下一级：默认全部继承 UI + 文本；只覆盖需要单独调整的组件，随时可恢复继承。'))
    const componentSelects = {} as Record<ScaleComponentId, HTMLSelectElement>
    const componentValues = {} as Record<ScaleComponentId, HTMLElement>
    for (const component of SCALE_COMPONENTS) {
      const row = field('pet-settings-field pet-settings-component-field')
      const label = makeElement(docRef, 'label', 'pet-settings-label', component.label)
      label.setAttribute('for', 'pet-settings-component-' + component.id)
      const select = makeElement(docRef, 'select', 'pet-settings-select')
      select.id = 'pet-settings-component-' + component.id
      select.setAttribute('aria-label', component.label + '缩放')
      for (const option of [
        { value: '1', label: '继承（跟随 UI + 文本）' },
        { value: '0.75', label: '75%' },
        { value: '1.25', label: '125%' },
        { value: '1.5', label: '150%' },
      ]) {
        const optionEl = docRef.createElement('option')
        optionEl.value = option.value
        optionEl.textContent = option.label
        select.append(optionEl)
      }
      select.addEventListener('change', () => {
        const raw = Number(select.value)
        setComponentScale(component.id, Number.isFinite(raw) && Math.abs(raw - 1) > 1e-9 ? raw : null)
      })
      const valueEl = makeElement(docRef, 'span', 'pet-settings-value', '')
      row.append(label, select, valueEl)
      advanced.append(row)
      componentSelects[component.id] = select
      componentValues[component.id] = valueEl
    }
    if (debugMode) {
      advanced.append(makeElement(docRef, 'p', 'pet-settings-note', '调试（仅 ?debug=1）'))
      const advancedField = field('pet-settings-field pet-settings-actions')
      advancedField.append(
        action('pet-settings-full-panel', '完整面板（开发/E2E）', () => {
          closeSettings(false)
          winRef.location.search = '?shell=window'
        }),
        action('pet-settings-setup', '模型 / API Key 设置…', () => {
          closeSettings(false)
          openSetup()
        }),
      )
      advanced.append(advancedField)
    }

    const cardChildren: HTMLElement[] = [
      head,
      status,
      common,
      calm,
      independent,
      contentGroup,
      privacy,
      aboutGroup,
      advanced,
    ]

    card.append(...cardChildren)
    root.append(backdrop, card)

    backdrop.addEventListener('click', () => closeSettings())
    closeButton.addEventListener('click', () => closeSettings())
    root.addEventListener('keydown', (event) => {
      if (!settingsOpen) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        closeSettings()
        return
      }
      if (event.key === 'Tab') {
        const items = settingsFocusable()
        event.preventDefault()
        const target = menuTabTarget(event.shiftKey, items.indexOf(docRef.activeElement as HTMLElement), items.length)
        if (target !== null) items[target]!.focus()
      }
    })

    docRef.body.append(root)
    return {
      root,
      status,
      showMenuButton: showMenu.input,
      mute: muteField.input,
      volume: volumeInput,
      volumeValue,
      reduceMotion: reduceField.input,
      quietEnabled: quietCheck.input,
      quietStart: quietStartInput,
      quietEnd: quietEndInput,
      globalScale: globalScaleRow.input,
      globalValue: globalScaleRow.value,
      resetScales: resetScalesButton,
      uiTextScale: uiTextRow.input,
      uiTextValue: uiTextRow.value,
      uiTextFollow,
      imageScale: imageRow.input,
      imageValue: imageRow.value,
      imageFollow,
      advanced,
      componentSelects,
      componentValues,
    }
  }

  settingsDom = buildSettingsModal()
  refreshSettings()
  // Expose the SAME dialog to the independent content window bootstrap (MB-062).
  settingsSurface = {
    open: (focusTarget?: string) => openSettings(focusTarget),
    close: (restoreFocus?: boolean) => closeSettings(restoreFocus),
  }

  // -------------------------------------------------------------------------
  // First-run menu coach (E-01 / MB-060)
  //
  // Zero persistent chrome around the character stays the default; the coach
  // teaches the hidden entry points ONCE (右键 / Shift+F10 / Enter / 设置里可
  // 固定显示 ⋯), is non-blocking, dismissible, and never comes back. It is
  // marked as seen as soon as it is shown so a crash/blur cannot resurrect it.
  // -------------------------------------------------------------------------
  let coachShown = readStoredFlag(MENU_COACH_KEY, false)
  let coachEl: HTMLElement | null = null
  const removeMenuCoach = (): void => {
    coachEl?.remove()
    coachEl = null
  }
  const ackMenuCoach = (): void => {
    writeStoredFlag(MENU_COACH_KEY, true)
    coachShown = true
    removeMenuCoach()
  }
  const showMenuCoachIfEligible = (): void => {
    if (!menuEnabled) return
    if (coachShown || coachEl) return
    if (consentBlocked() || consentOverlayOpen()) return
    if (settingsOpen || options.isHigherModalOpen?.() === true) return
    coachShown = true
    // One-time by contract: persist on show, not only on dismiss.
    writeStoredFlag(MENU_COACH_KEY, true)
    const card = docRef.createElement('div')
    card.id = MENU_COACH_ID
    card.className = 'pet-menu-coach'
    card.setAttribute('role', 'status')
    card.setAttribute('aria-live', 'polite')
    card.setAttribute('aria-atomic', 'true')
    card.append(
      makeElement(
        docRef,
        'p',
        'pet-menu-coach-text',
        '右键点击角色、按 Shift+F10，或聚焦角色后按 Enter 都能打开菜单；也可以在 设置 → 显示菜单按钮 固定显示 ⋯。',
      ),
    )
    const actions = makeElement(docRef, 'div', 'pet-menu-coach-actions')
    const openSettingsFromCoach = makeElement(docRef, 'button', 'pet-menu-coach-button', '打开设置…')
    openSettingsFromCoach.type = 'button'
    openSettingsFromCoach.addEventListener('click', () => {
      ackMenuCoach()
      openSettingsSurface('pet-settings-show-menu-button')
    })
    const dismissCoach = makeElement(docRef, 'button', 'pet-menu-coach-button', '知道了')
    dismissCoach.type = 'button'
    dismissCoach.addEventListener('click', () => { ackMenuCoach() })
    actions.append(openSettingsFromCoach, dismissCoach)
    card.append(actions)
    docRef.body.append(card)
    coachEl = card
  }
  menuCoachRequest = showMenuCoachIfEligible
  // Stored-acceptance launches never show a consent overlay, so try once here;
  // first-run launches are handled by the overlay-close listener below.
  showMenuCoachIfEligible()

  // Closing the window/clicking the desktop away closes body-level chrome too
  // (the menu's outside-click path cannot see a click that lands on another
  // application, so window blur is the desktop-shell equivalent).
  winRef.addEventListener('blur', () => {
    if (menuOpen) closeMenu()
    // The 480x336 pet window dismisses its transient dialog when it loses focus;
    // the independent content window behaves like a normal settings window and
    // keeps the panel open (its home surface is still reachable on close).
    if (menuEnabled && settingsOpen) closeSettings()
    removeMenuCoach()
  })

  // Left-drag the pet to move the window (Tauri), while a short left click
  // remains a pet interaction. The 6px threshold mirrors the hero canvas.
  let downAt: { x: number; y: number } | undefined
  let dragged = false
  pet.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    downAt = { x: event.clientX, y: event.clientY }
    dragged = false
  })
  winRef.addEventListener('pointermove', (event) => {
    if (!downAt || dragged) return
    if (Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) < 6) return
    dragged = true
    downAt = undefined
    if ('__TAURI_INTERNALS__' in winRef) {
      void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().startDragging()).catch(() => {})
    }
  })
  winRef.addEventListener('pointerup', () => { downAt = undefined })
  pet.addEventListener('click', (event) => {
    if (!dragged) return
    dragged = false
    event.stopImmediatePropagation()
    event.preventDefault()
  }, { capture: true })

  docRef.addEventListener('contextmenu', (event) => {
    // The content/settings window is a normal desktop surface: leave the native
    // context menu (copy/paste etc.) alone and never open the pet menu there.
    if (!menuEnabled) return
    event.preventDefault()
    // The settings dialog already covers the window with its own backdrop;
    // never let a right-click open the menu behind/above it.
    if (settingsOpen) return
    // Never open the body-level menu while the TOS/read-only screen is up.
    if (menuBlocked()) {
      closeMenu(false)
      setConsentState()
      return
    }
    if (menu.contains(event.target as Node)) return
    openMenuAt(event.clientX, event.clientY)
  })
  docRef.addEventListener('pointerdown', (event) => {
    const target = event.target as Node | null
    if (coachEl && !(target !== null && coachEl.contains(target))) {
      // The coach is one-time chrome: any click elsewhere retires it.
      ackMenuCoach()
    }
    if (settingsOpen) {
      if (target && settingsDom?.root.contains(target)) return
      closeSettings()
      return
    }
    if (!menuOpen) return
    if (target && (menu.contains(target) || (trigger?.contains(target) ?? false))) return
    closeMenu()
  })
  docRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (coachEl) {
        ackMenuCoach()
        return
      }
      if (settingsOpen) {
        closeSettings()
        return
      }
      if (menuOpen) closeMenu()
      return
    }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      if (!menuEnabled) return
      event.preventDefault()
      // Keyboard path has the same consent gate as the pointer path.
      if (menuBlocked()) {
        closeMenu(false)
        setConsentState()
        return
      }
      openFromTrigger()
      return
    }
    // Safety net: Tab with focus already outside the open menu re-enters it.
    if (menuOpen && event.key === 'Tab' && !menu.contains(event.target as Node)) {
      event.preventDefault()
      focusMenuItem(0)
      return
    }
    if (settingsOpen && event.key === 'Tab' && !settingsDom?.root.contains(event.target as Node)) {
      event.preventDefault()
      focusSettingsFirst()
    }
  })

  // Fail closed until the gate says otherwise; a later TOS acceptance without a
  // prompt (stored acceptance) flips this to "ready" on the first allowed open.
  setConsentState()
}

// ---------------------------------------------------------------------------
// Corrupt-archive recovery panel (E1 / MB-011, task-106)
//
// The save runtime pauses autosave and protects the last known-good `.bak` as
// soon as a readable archive cannot be parsed (or only the backup parsed). The
// page used to explain that through a bubble pointing at other menus; this panel
// is the single blocking decision the user needs:
//
//   保存当前为新档 / 从备份恢复 / 删除重来 / 退出应用
//
// Contract (locked by tests/save-recovery-panel.test.ts):
// - presentation + focus/keyboard/confirmation/failure fallback live here; the
//   injected callbacks own every side effect (the page still calls the SAME
//   `save-runtime` API, so the `dsh-save` envelope is untouched);
// - a failing action never closes the panel and never reports success; the
//   sanitized message stays visible and the action stays retryable;
// - destructive delete needs an explicit inline second confirmation (default
//   focus on 取消); Escape only cancels that confirmation or dismisses the whole
//   panel — it never chooses save/delete;
// - while open, focus is trapped inside the dialog (Tab/Shift+Tab/arrows/Home/
//   End), Enter/Space activate, focus returns to the prior control on close, and
//   the caller marks the panel as a higher-level modal so the body-level pet
//   menu cannot open behind it.
// ---------------------------------------------------------------------------

export const SAVE_RECOVERY_ID = 'save-recovery'

/** The four recovery choices shown by the panel. */
export type SaveRecoveryAction = 'save' | 'restore' | 'delete' | 'exit'

/** Why the panel closed (used by the page for the follow-up bubble). */
export type SaveRecoveryCloseReason =
  | 'saved'
  | 'deleted'
  | 'exit'
  | 'dismissed'
  | 'restored'
  | 'reset'

/** Result of one recovery action; the panel never throws an action failure. */
export interface SaveRecoveryOutcome {
  readonly ok: boolean
  /** Sanitized user-facing line shown in the panel (success or failure). */
  readonly message?: string
}

/** Injected side effects + document seam (tests pass the fake DOM). */
export interface SaveRecoveryPanelOptions {
  readonly document?: Document
  /** Write the in-memory state as a new primary slot (protects the `.bak`). */
  readonly saveAsNew: () => Promise<SaveRecoveryOutcome>
  /** Re-read primary -> `.bak` through the save runtime. */
  readonly restoreFromBackup: () => Promise<SaveRecoveryOutcome>
  /** Delete primary + backup and restart with a fresh archive (destructive). */
  readonly deleteAndRestart: () => Promise<SaveRecoveryOutcome>
  /** Leave without writing/deleting anything. */
  readonly exitApp: () => Promise<SaveRecoveryOutcome> | SaveRecoveryOutcome
  /** Observer for the final close; must never throw into the panel. */
  readonly onClose?: (reason: SaveRecoveryCloseReason) => void
}

export interface SaveRecoveryPanel {
  /** The body-level root (mount + CSS hooks); hidden until `show()`. */
  readonly root: HTMLElement
  readonly visible: boolean
  show(): void
  close(reason?: SaveRecoveryCloseReason): void
  destroy(): void
}

interface SaveRecoveryActionSpec {
  readonly action: SaveRecoveryAction
  readonly label: string
  readonly title: string
  readonly primary?: boolean
  readonly danger?: boolean
}

const SAVE_RECOVERY_ACTIONS: readonly SaveRecoveryActionSpec[] = Object.freeze([
  {
    action: 'save',
    label: '保存当前为新档',
    title: '把当前状态写成新的主档；恢复期间不会覆盖可用的 .bak 备份。',
    primary: true,
  },
  {
    action: 'restore',
    label: '从备份恢复',
    title: '重新读取本机备份（.bak）；只有备份可读时才会恢复。',
  },
  {
    action: 'delete',
    label: '删除重来…',
    title: '删除主档和备份，回到全新存档；不可撤销（外部加密备份除外）。',
    danger: true,
  },
  {
    action: 'exit',
    label: '退出应用',
    title: '不写入、不删除任何存档文件，直接退出。',
  },
])

const SAVE_RECOVERY_BUSY: Readonly<Record<SaveRecoveryAction, string>> = Object.freeze({
  save: '正在写入新档…',
  restore: '正在读取备份…',
  delete: '正在删除本机存档…',
  exit: '正在退出…',
})

const SAVE_RECOVERY_DELETE_CONFIRM =
  '确认删除本机存档？主档和备份都会删除，删除后只能靠外部加密备份恢复；此操作不可撤销。'

/**
 * Build the corrupt-archive recovery panel. Pure view layer: it never reads or
 * writes the archive itself, so the save envelope and the runtime's recovery
 * invariants stay exactly as `save-runtime.ts` defines them.
 */
export function createSaveRecoveryPanel(options: SaveRecoveryPanelOptions): SaveRecoveryPanel {
  const doc = options.document ?? document
  let visible = false
  let busy = false
  let confirmOpen = false
  let previousFocus: HTMLElement | null = null
  let inertedApp: HTMLElement | null = null

  const root = makeElement(doc, 'div', 'save-recovery-root')
  root.id = SAVE_RECOVERY_ID
  root.hidden = true
  root.dataset.state = 'closed'
  const backdrop = makeElement(doc, 'div', 'save-recovery-backdrop')
  backdrop.setAttribute('aria-hidden', 'true')

  const dialog = makeElement(doc, 'section', 'save-recovery-dialog')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', 'save-recovery-title')
  dialog.setAttribute('aria-describedby', 'save-recovery-desc')
  dialog.tabIndex = -1

  const kicker = makeElement(doc, 'p', 'save-recovery-kicker', 'SAVE · 存档恢复')
  const title = makeElement(doc, 'h2', 'save-recovery-title', '存档需要恢复')
  title.id = 'save-recovery-title'
  const desc = makeElement(
    doc,
    'p',
    'save-recovery-desc',
    '主存档损坏或无法读取（备份完好时已自动回退）。自动保存已暂停，旧存档文件不会被覆盖。请选择下一步：',
  )
  desc.id = 'save-recovery-desc'
  const status = makeElement(doc, 'p', 'save-recovery-status')
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const actionsRow = makeElement(doc, 'div', 'save-recovery-actions')
  const actionButtons = new Map<SaveRecoveryAction, HTMLButtonElement>()
  for (const spec of SAVE_RECOVERY_ACTIONS) {
    const className = spec.primary
      ? 'save-recovery-action save-recovery-primary'
      : spec.danger
        ? 'save-recovery-action save-recovery-danger'
        : 'save-recovery-action'
    const button = makeElement(doc, 'button', className, spec.label)
    button.type = 'button'
    button.title = spec.title
    button.dataset.action = spec.action
    button.addEventListener('click', () => {
      void handleAction(spec.action)
    })
    actionButtons.set(spec.action, button)
    actionsRow.append(button)
  }

  const confirmRow = makeElement(doc, 'div', 'save-recovery-confirm')
  confirmRow.hidden = true
  const confirmText = makeElement(doc, 'p', 'save-recovery-confirm-text', SAVE_RECOVERY_DELETE_CONFIRM)
  const confirmActions = makeElement(doc, 'div', 'save-recovery-confirm-actions')
  const cancelButton = makeElement(doc, 'button', 'save-recovery-action', '取消')
  cancelButton.type = 'button'
  const confirmDeleteButton = makeElement(doc, 'button', 'save-recovery-action save-recovery-danger', '确认删除')
  confirmDeleteButton.type = 'button'
  confirmActions.append(cancelButton, confirmDeleteButton)
  confirmRow.append(confirmText, confirmActions)

  const hint = makeElement(
    doc,
    'p',
    'save-recovery-hint',
    '键盘：Tab 在面板内循环，方向键选择，Enter 确认；Esc 稍后处理（自动保存会继续暂停，可从「更多 → 读取」重新打开）。',
  )

  dialog.append(kicker, title, desc, status, actionsRow, confirmRow, hint)
  root.append(backdrop, dialog)
  doc.body.append(root)

  const activeElement = (): HTMLElement | null => {
    const active = doc.activeElement
    if (typeof HTMLElement === 'undefined') return null
    return active instanceof HTMLElement ? active : null
  }

  const allButtons = (): HTMLButtonElement[] => [
    ...actionButtons.values(),
    cancelButton,
    confirmDeleteButton,
  ]

  const setStatus = (text: string, tone: 'info' | 'error' | 'success' = 'info'): void => {
    status.textContent = text
    status.dataset.tone = tone
  }

  const setBusy = (next: boolean): void => {
    busy = next
    if (next) root.setAttribute('aria-busy', 'true')
    else root.removeAttribute('aria-busy')
    for (const button of allButtons()) button.disabled = next
  }

  /** Buttons currently reachable by the keyboard trap. */
  const focusables = (): HTMLButtonElement[] => {
    if (confirmOpen) return [cancelButton, confirmDeleteButton].filter((button) => !button.disabled)
    return [...actionButtons.values()].filter((button) => !button.disabled)
  }

  const focusAction = (action: SaveRecoveryAction): void => {
    actionButtons.get(action)?.focus()
  }

  const setConfirm = (open: boolean): void => {
    confirmOpen = open
    confirmRow.hidden = !open
    actionsRow.hidden = open
    for (const button of allButtons()) button.disabled = false
  }

  const close = (reason: SaveRecoveryCloseReason = 'dismissed'): void => {
    if (!visible) return
    visible = false
    busy = false
    confirmOpen = false
    root.hidden = true
    root.dataset.state = 'closed'
    root.removeAttribute('aria-busy')
    actionsRow.hidden = false
    confirmRow.hidden = true
    for (const button of allButtons()) button.disabled = false
    const app = inertedApp
    inertedApp = null
    if (app) app.removeAttribute('inert')
    const target = previousFocus
    previousFocus = null
    if (target && target.isConnected) {
      try {
        target.focus()
      } catch {
        /* focus restoration is best effort */
      }
    }
    if (reason === 'reset') return
    try {
      options.onClose?.(reason)
    } catch {
      /* an observer (bubble) must never break the close path */
    }
  }

  const show = (): void => {
    if (visible) return
    visible = true
    busy = false
    confirmOpen = false
    previousFocus = activeElement()
    const app = doc.getElementById('pet-app')
    if (app && !app.hasAttribute('inert')) {
      app.setAttribute('inert', '')
      inertedApp = app
    }
    root.hidden = false
    root.dataset.state = 'open'
    actionsRow.hidden = false
    confirmRow.hidden = true
    for (const button of allButtons()) button.disabled = false
    setStatus('', 'info')
    dialog.focus({ preventScroll: true })
    focusAction('save')
  }

  const callbacks: Readonly<
    Record<SaveRecoveryAction, () => Promise<SaveRecoveryOutcome> | SaveRecoveryOutcome>
  > = {
    save: options.saveAsNew,
    restore: options.restoreFromBackup,
    delete: options.deleteAndRestart,
    exit: options.exitApp,
  }

  async function handleAction(action: SaveRecoveryAction): Promise<void> {
    if (!visible || busy) return
    // 删除重来 is the only destructive choice: it always goes through the inline
    // second confirmation, with focus parked on 取消.
    if (action === 'delete' && !confirmOpen) {
      setConfirm(true)
      setStatus('', 'info')
      cancelButton.focus()
      return
    }
    setBusy(true)
    setStatus(SAVE_RECOVERY_BUSY[action], 'info')
    let outcome: SaveRecoveryOutcome
    try {
      outcome = await callbacks[action]()
    } catch {
      // The page's callbacks return sanitized failures; a throwing observer is
      // still turned into a retryable state instead of an unhandled rejection.
      outcome = { ok: false, message: '操作失败，请重试。' }
    }
    if (!visible) return
    setBusy(false)
    if (!outcome.ok) {
      setStatus(outcome.message ?? '操作失败，请重试。', 'error')
      if (confirmOpen) confirmDeleteButton.focus()
      else focusAction(action)
      return
    }
    switch (action) {
      case 'save':
        close('saved')
        return
      case 'delete':
        close('deleted')
        return
      case 'exit':
        close('exit')
        return
      default:
        // Restoring the backup does not clear the recovery flag (the primary is
        // still corrupt); stay open on the repair step and point at 保存.
        setStatus(outcome.message ?? '已从备份读取存档。', 'success')
        setConfirm(false)
        focusAction('save')
    }
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!visible) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (busy) return
      if (confirmOpen) {
        setConfirm(false)
        setStatus('', 'info')
        focusAction('delete')
        return
      }
      close('dismissed')
      return
    }
    if (busy) return
    if (event.key === 'Tab') {
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const current = items.indexOf(activeElement() as HTMLButtonElement)
      const next = event.shiftKey
        ? current <= 0
          ? items.length - 1
          : current - 1
        : current < 0 || current >= items.length - 1
          ? 0
          : current + 1
      event.preventDefault()
      items[next]?.focus()
      return
    }
    const navigationKeys =
      event.key === 'ArrowDown' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowLeft' ||
      event.key === 'Home' ||
      event.key === 'End'
    if (navigationKeys) {
      const items = focusables()
      if (items.length === 0) return
      const current = items.indexOf(activeElement() as HTMLButtonElement)
      let next = current
      if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = items.length - 1
      else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = current < 0 ? 0 : (current + 1) % items.length
      else next = current <= 0 ? items.length - 1 : current - 1
      event.preventDefault()
      items[next]?.focus()
      return
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      const active = activeElement()
      if (active === null) return
      const actionButton = [...actionButtons.values()].find((button) => button === active)
      const isConfirmButton = active === cancelButton || active === confirmDeleteButton
      if (!(confirmOpen ? isConfirmButton : actionButton !== undefined)) return
      const button = active as HTMLButtonElement
      event.preventDefault()
      button.click()
    }
  }
  dialog.addEventListener('keydown', onKeyDown)
  backdrop.addEventListener('click', () => {
    // A destructive/saving decision is never made by clicking the backdrop;
    // keep focus inside the panel (Escape is the explicit "稍后处理").
    dialog.focus({ preventScroll: true })
  })
  cancelButton.addEventListener('click', () => {
    if (busy) return
    setConfirm(false)
    setStatus('', 'info')
    focusAction('delete')
  })
  confirmDeleteButton.addEventListener('click', () => {
    void handleAction('delete')
  })

  return {
    root,
    get visible() {
      return visible
    },
    show,
    close,
    destroy(): void {
      if (visible) close('reset')
      dialog.removeEventListener('keydown', onKeyDown)
      root.remove()
    },
  }
}

// ---------------------------------------------------------------------------
// V1 typed input: same-window inline composer + compact result card
// (PET-INPUT-OUTPUT-DESIGN-2026-11-17 §2/§3, minimum v1 slice)
//
// Boundaries implemented here and recorded in docs/audit/INPUT-V1-2026-11-17.md:
// - SAME 480×336 pet window: no new window, no resize, no global hotkey, no
//   persistent chat sidebar / command palette / TUI.
// - LOCAL ONLY: `提醒我…` / `记一笔…` / `待办…` become session-memory drafts.
//   They are NOT written to Advisers, NOT persisted (no localStorage, no save
//   file) and create NO system reminder / background task. There is no free
//   LLM/chat call and no external fetch on this path; the host injects only
//   the local trust layer and `say()` templates.
// - Safety: every submission is reviewed by the injected `reviewInput` first
//   (main.ts passes `trust.reviewUserInputForForwarding` — the same audited
//   local gate the ASR path uses, never bypassed). Blocked text shows the short
//   refusal, creates no result and never reaches `say()`. `say()` keeps its own
//   TTS gate. Role-play is not wired here.
// - Results (design A/B/C minimum): A = existing bubble (`showBubble`), B =
//   `#result-card` with title/status/summary + actions 稍后/关闭, C = the card's
//   `展开` section with ≤20 plain list lines (no terminal stream / artifact UI).
// - Focus: the composer opens only from an explicit user action (menu /
//   keyboard), so v1 accepts the pet window becoming active; this module never
//   calls the Tauri/window focus APIs. Background events never focus it, and
//   closing restores in-window focus to the opening control.
// - IME: Enter submits; while `isComposing`/keyCode 229 it only commits the IME
//   candidate. Escape cancels. Shift+Enter inserts a newline (≤240 code points).
// ---------------------------------------------------------------------------

/** Composer input cap, in Unicode code points (product copy: 240 字). */
export const COMPOSER_MAX_CHARS = 240
/** Expanded result detail cap: plain list lines only (design §3 C: ≤20 行). */
export const RESULT_DETAIL_MAX_LINES = 20

export type ComposerInputCheck =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'empty' | 'too-long'; readonly message: string }

/**
 * Normalise + validate one composer submission. Control/bidi characters are
 * stripped and newlines are kept (two-line input), but the 240-code-point cap
 * counts the trimmed text exactly as the user sees it.
 */
export function checkComposerInput(raw: unknown): ComposerInputCheck {
  const text = sanitizePlainText(raw, { allowNewlines: true, maxChars: COMPOSER_MAX_CHARS + 1 })
  const length = countCodePoints(text)
  if (length === 0) {
    return { ok: false, reason: 'empty', message: `写点什么再提交；最多 ${COMPOSER_MAX_CHARS} 字。` }
  }
  if (length > COMPOSER_MAX_CHARS) {
    return { ok: false, reason: 'too-long', message: `最多 ${COMPOSER_MAX_CHARS} 字，这条没有提交。` }
  }
  return { ok: true, text }
}

/** Local intent router: no network, no model, no Advisers. */
export type LocalIntentKind = 'reminder' | 'note' | 'todo' | 'say' | 'plain'

const SAY_PREFIX = /^(?:说一句|说：|说:|念一句|念：|念:)\s*/
const SAY_QUOTE_PREFIX = /^(?:(?:说|念)一句\s*[：:]?|(?:说|念)\s*[：:])\s*/

/** Strip a `说一句…` style prefix so only the quoted line is echoed locally. */
export function stripSayPrefix(text: string): string {
  return text.replace(SAY_QUOTE_PREFIX, '').trim()
}

export function parseLocalIntent(text: string): LocalIntentKind {
  const value = text.trim()
  if (SAY_PREFIX.test(value)) return 'say'
  if (/^(?:记一笔|记一下|记下|记录一下|记：|记:)/.test(value)) return 'note'
  if (/^(?:待办|todo|to-do|任务[:：])/i.test(value)) return 'todo'
  if (/^(?:提醒我|提醒一下|提醒：|提醒:)/.test(value)) return 'reminder'
  if (/(?:提醒|记得|别忘了)/.test(value)) return 'reminder'
  if (/(?:待办|todo)/i.test(value)) return 'todo'
  return 'plain'
}

/** Result envelope states (design §3): local engine uses all five. */
export type LocalResultStatus = 'received' | 'working' | 'done' | 'needs_input' | 'error'

const RESULT_STATUS_LABELS: Readonly<Record<LocalResultStatus, string>> = Object.freeze({
  received: '已收到',
  working: '处理中',
  done: '已完成',
  needs_input: '需要调整',
  error: '出错',
})

export function localStatusLabel(status: LocalResultStatus): string {
  return RESULT_STATUS_LABELS[status]
}

const INTENT_TITLES: Readonly<Record<LocalIntentKind, string>> = Object.freeze({
  reminder: '本地提醒 · 草稿',
  note: '本地记录 · 草稿',
  todo: '本地待办 · 草稿',
  say: '本地回声',
  plain: '本地回应',
})

const INTENT_LABELS: Readonly<Record<LocalIntentKind, string>> = Object.freeze({
  reminder: '提醒',
  note: '记一笔',
  todo: '待办',
  say: '说一句',
  plain: '普通文本',
})

function excerptText(text: string, maxChars: number): string {
  const flat = sanitizePlainText(text, { allowNewlines: false, maxChars: maxChars + 1 })
  return countCodePoints(flat) > maxChars ? `${truncateCodePoints(flat, maxChars)}…` : flat
}

function resultSummary(intent: LocalIntentKind, status: LocalResultStatus, inputText: string): string {
  if (status === 'working') return '正在本地处理；不会调用模型，也不会写 Advisers。'
  if (status === 'error') return '本地处理没有完成；没有外部请求、没有 Advisers 写入。'
  if (status === 'needs_input') return '本地回应被安全审核拦下；没有继续，可以改一下再试。'
  if (status === 'received') return '已收到，等本地处理。'
  const quoted = excerptText(inputText, 40)
  switch (intent) {
    case 'reminder':
      return `“${quoted}” · 仅本会话草稿；未写入 Advisers、未创建系统提醒。`
    case 'note':
      return `“${quoted}” · 仅本会话内存；不持久化、不写 Advisers。`
    case 'todo':
      return `“${quoted}” · 仅本会话草稿；不会创建真实任务。`
    case 'say':
      return '已用本地模板在气泡里回了一句；未提交给模型，无外部请求。'
    default:
      return '本地模板回应；无自由 LLM、无 Advisers 写入、无外部请求。'
  }
}

export interface DescribeLocalResultInput {
  readonly intent: LocalIntentKind
  readonly status: LocalResultStatus
  readonly inputText: string
  readonly createdAt: number
}

/** A single session-memory result. Never persisted, never written to Advisers. */
export interface LocalResultRecord {
  readonly intent: LocalIntentKind
  readonly status: LocalResultStatus
  readonly title: string
  readonly summary: string
  readonly detailLines: readonly string[]
  readonly inputText: string
  readonly createdAt: number
}

export function describeLocalResult(input: DescribeLocalResultInput): LocalResultRecord {
  const stamp = Number.isFinite(input.createdAt)
    ? new Date(input.createdAt).toISOString().slice(0, 16).replace('T', ' ')
    : '—'
  const detailLines = [
    `类型：${INTENT_LABELS[input.intent]}`,
    `状态：${localStatusLabel(input.status)}`,
    `时间：${stamp}`,
    `原文：${excerptText(input.inputText, 120)}`,
    '处理：本地意图路由 + 本地模板（无模型调用）',
    '写入：无（仅本会话内存；关闭窗口/刷新即失）',
    '外部请求：无（无 fetch / 无 API）',
    'Advisers：未连接、未写入',
    '提醒：未创建系统提醒或后台任务',
    'AI 标识：本地模板生成，不是真人',
  ].slice(0, RESULT_DETAIL_MAX_LINES)
  return {
    intent: input.intent,
    status: input.status,
    title: INTENT_TITLES[input.intent],
    summary: resultSummary(input.intent, input.status, input.inputText),
    detailLines: Object.freeze(detailLines),
    inputText: excerptText(input.inputText, COMPOSER_MAX_CHARS),
    createdAt: input.createdAt,
  }
}

/**
 * Local reply template for `说一句…` (echo, capped) and ordinary text (fixed
 * local templates only). The caller routes this through `say()`, so the
 * existing TTS safety gate still reviews/caps everything (no bypass).
 */
export function buildLocalReply(intent: LocalIntentKind, text: string): string {
  if (intent === 'say') {
    const quoted = excerptText(stripSayPrefix(text), 60)
    return quoted ? `好，我念一句：${quoted}` : '好，我在听。'
  }
  if (/名字|你是谁|叫什么/.test(text)) return '我是折角。当前版本只会本地回应。'
  // Low-disturbance copy (PSY-P1-7/Q-04): no waiting / leaving-the-light-on
  // hints in template replies. This mirrors the pet-page rewrites and keeps a
  // new soft-tone line from sneaking in through the typed-input surface.
  if (/晚安|睡吧|休息/.test(text)) return '晚安，明天见。'
  if (/你好|早上好|在吗/.test(text)) return '你好。我在。'
  if (/谢谢|辛苦/.test(text)) return '嗯。你也辛苦了。'
  if (/喜欢|可爱|乖/.test(text)) return '……嗯。'
  return '我听见了。本地版本只会这样回应；自由对话还没有接上。'
}

/** Review result shape shared with `trust.reviewUserInputForForwarding`. */
export interface ComposerReview {
  readonly allowed: boolean
  readonly text: string
  readonly message: string
  readonly redacted?: boolean
}

/** Host dependencies. Tests inject fakes; production wiring lives in main.ts. */
export interface ComposerDeps {
  readonly document: Document
  /** Consent gate; defaults are the fail-closed runtime accessor in main.ts. */
  readonly canInteract: () => boolean
  /** Existing audited input gate (blocked text never reaches say()/the card). */
  readonly reviewInput: (text: string) => Promise<ComposerReview>
  /** Existing local `say()` path; `false` means the speech gate refused it. */
  readonly say: (line: string) => Promise<boolean>
  /** Design A bubble (main.ts showBubble, ≤8s). */
  readonly showBubble: (text: string) => void
  readonly now?: () => number
  /** Unexpected failures are logged by the host boundary (never swallowed). */
  readonly onError?: (error: unknown) => void
}

export interface ComposerController {
  /** Open the same-window composer. False = consent gate refused (nothing ran). */
  open(): boolean
  /** Close the composer (never submits). */
  close(): void
  isOpen(): boolean
  /** Session-memory results only; empty after a reload by design. */
  getSessionResults(): readonly LocalResultRecord[]
  /** Remove listeners (tests; the app keeps one live controller). */
  destroy(): void
}

interface ComposerDom {
  layer: HTMLElement
  composer: HTMLElement
  input: HTMLTextAreaElement
  hint: HTMLElement
  submit: HTMLButtonElement
  cancel: HTMLButtonElement
  card: HTMLElement
  cardTitle: HTMLElement
  cardStatus: HTMLElement
  cardSummary: HTMLElement
  expand: HTMLButtonElement
  later: HTMLButtonElement
  close: HTMLButtonElement
  detail: HTMLElement
  detailList: HTMLElement
}

function makeElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function buildComposerDom(doc: Document): ComposerDom {
  let layer = doc.getElementById('pet-input-layer')
  if (!layer) {
    layer = makeElement(doc, 'div', 'pet-input-layer')
    layer.id = 'pet-input-layer'
    const mount = doc.getElementById('pet-app') ?? doc.body
    mount.append(layer)
  }

  const composer = makeElement(doc, 'section', 'pet-composer')
  composer.id = 'pet-composer'
  composer.setAttribute('role', 'group')
  composer.setAttribute('aria-labelledby', 'pet-composer-label')
  composer.dataset.state = 'closed'
  composer.setAttribute('aria-hidden', 'true')
  composer.inert = true

  const label = makeElement(doc, 'label', 'pet-composer-label', `交办 / 打字输入（本地，最多 ${COMPOSER_MAX_CHARS} 字）`)
  label.id = 'pet-composer-label'
  label.setAttribute('for', 'pet-composer-input')

  const input = makeElement(doc, 'textarea', 'pet-composer-input')
  input.id = 'pet-composer-input'
  input.rows = 2
  input.maxLength = COMPOSER_MAX_CHARS
  input.setAttribute('maxlength', String(COMPOSER_MAX_CHARS))
  input.setAttribute('placeholder', '提醒我… / 记一笔… / 待办… / 说一句…')
  input.setAttribute('aria-describedby', 'pet-composer-hint pet-composer-note')

  const hint = makeElement(doc, 'p', 'pet-composer-hint')
  hint.id = 'pet-composer-hint'
  hint.setAttribute('role', 'status')
  hint.setAttribute('aria-live', 'polite')

  const note = makeElement(
    doc,
    'p',
    'pet-composer-note',
    '本地处理：不调用自由 LLM / 不写 Advisers / 仅本会话、不持久化；提醒与待办只是草稿。',
  )
  note.id = 'pet-composer-note'

  const actions = makeElement(doc, 'div', 'pet-composer-actions')
  const submit = makeElement(doc, 'button', 'pet-composer-submit', '提交（Enter）')
  submit.id = 'pet-composer-submit'
  submit.type = 'button'
  const cancel = makeElement(doc, 'button', 'pet-composer-cancel', '取消（Esc）')
  cancel.id = 'pet-composer-cancel'
  cancel.type = 'button'
  actions.append(submit, cancel)
  composer.append(label, input, hint, note, actions)

  const card = makeElement(doc, 'section', 'pet-result-card')
  card.id = 'result-card'
  card.setAttribute('role', 'status')
  card.setAttribute('aria-live', 'polite')
  card.setAttribute('aria-atomic', 'false')
  card.setAttribute('aria-label', '本地结果卡')
  card.tabIndex = -1
  card.dataset.state = 'closed'
  card.dataset.status = 'received'
  card.setAttribute('aria-hidden', 'true')
  card.inert = true

  const head = makeElement(doc, 'div', 'pet-result-head')
  const cardTitle = makeElement(doc, 'strong', 'pet-result-title', '本地结果')
  cardTitle.id = 'result-title'
  const cardStatus = makeElement(doc, 'span', 'pet-result-status', localStatusLabel('received'))
  cardStatus.id = 'result-status'
  cardStatus.dataset.status = 'received'
  head.append(cardTitle, cardStatus)

  const cardSummary = makeElement(doc, 'p', 'pet-result-summary')
  cardSummary.id = 'result-summary'

  const detail = makeElement(doc, 'div', 'pet-result-detail')
  detail.id = 'result-detail'
  detail.hidden = true
  const detailList = makeElement(doc, 'ul', 'pet-result-detail-list')
  detailList.id = 'result-detail-list'
  detail.append(detailList)

  const cardActions = makeElement(doc, 'div', 'pet-result-actions')
  const expand = makeElement(doc, 'button', 'pet-result-expand', '展开')
  expand.id = 'result-expand'
  expand.type = 'button'
  expand.setAttribute('aria-expanded', 'false')
  expand.setAttribute('aria-controls', 'result-detail')
  const later = makeElement(doc, 'button', 'pet-result-later', '稍后')
  later.id = 'result-later'
  later.type = 'button'
  const close = makeElement(doc, 'button', 'pet-result-close', '关闭')
  close.id = 'result-close'
  close.type = 'button'
  cardActions.append(expand, later, close)
  card.append(head, cardSummary, detail, cardActions)

  layer.append(composer, card)
  return {
    layer,
    composer,
    input,
    hint,
    submit,
    cancel,
    card,
    cardTitle,
    cardStatus,
    cardSummary,
    expand,
    later,
    close,
    detail,
    detailList,
  }
}

export function createComposerController(deps: ComposerDeps): ComposerController {
  const doc = deps.document
  const now = deps.now ?? (() => Date.now())
  const dom = buildComposerDom(doc)
  const sessionResults: LocalResultRecord[] = []
  let returnFocus: HTMLElement | null = null
  let busy = false

  const reportError = (error: unknown): void => {
    try {
      deps.onError?.(error)
    } catch {
      /* logging must never break the composer flow */
    }
  }
  const safeBubble = (text: string): void => {
    try {
      deps.showBubble(text)
    } catch (error) {
      reportError(error)
    }
  }
  const focusElement = (element: HTMLElement | null): void => {
    try {
      element?.focus()
    } catch {
      /* a detached/disabled node must not break close/submit */
    }
  }
  const consentOpen = (): boolean => {
    try {
      return deps.canInteract()
    } catch {
      return false
    }
  }
  const fallbackFocus = (): HTMLElement | null => {
    if (returnFocus && returnFocus.isConnected) return returnFocus
    return doc.getElementById('pet-menu-button')
  }
  const setHint = (text: string): void => {
    dom.hint.textContent = text
  }
  const setLayerState = (element: HTMLElement, open: boolean): void => {
    element.dataset.state = open ? 'open' : 'closed'
    element.setAttribute('aria-hidden', open ? 'false' : 'true')
    element.inert = !open
  }
  const isOpen = (): boolean => dom.composer.dataset.state === 'open'

  const hideCard = (): void => {
    setLayerState(dom.card, false)
    dom.detail.hidden = true
    dom.expand.setAttribute('aria-expanded', 'false')
    dom.expand.textContent = '展开'
  }

  const closeComposer = (restoreFocus: boolean): void => {
    if (!isOpen()) return
    setHint('')
    setLayerState(dom.composer, false)
    if (restoreFocus) focusElement(fallbackFocus())
  }
  const closeResult = (restoreFocus = true): void => {
    hideCard()
    if (restoreFocus) focusElement(fallbackFocus())
  }

  const renderCard = (record: LocalResultRecord): void => {
    dom.cardTitle.textContent = record.title
    dom.cardStatus.textContent = localStatusLabel(record.status)
    dom.cardStatus.dataset.status = record.status
    dom.card.dataset.status = record.status
    dom.cardSummary.textContent = record.summary
    dom.detailList.replaceChildren()
    for (const line of record.detailLines) {
      const item = makeElement(doc, 'li', 'pet-result-detail-line', line)
      dom.detailList.append(item)
    }
    dom.detail.hidden = true
    dom.expand.setAttribute('aria-expanded', 'false')
    dom.expand.textContent = '展开'
    setLayerState(dom.card, true)
  }

  const submit = async (): Promise<void> => {
    if (busy || !isOpen()) return
    if (!consentOpen()) {
      setHint('未同意完整声明前不能交办。')
      safeBubble('请先同意完整声明后再交办。')
      return
    }
    const check = checkComposerInput(dom.input.value)
    if (!check.ok) {
      setHint(check.message)
      focusElement(dom.input)
      return
    }
    busy = true
    dom.submit.disabled = true
    try {
      setHint('')
      // Design A first line: received. No card yet; nothing has executed.
      safeBubble('已收到，正在本地处理……')
      const review = await deps.reviewInput(check.text)
      if (!review.allowed) {
        // Blocked user input: short refusal, no say(), no card, no session record.
        const refusal = sanitizePlainText(review.message, { maxChars: 160, allowNewlines: false })
        const message = refusal || '这段内容先不处理。'
        setHint(`没有提交：${message}`)
        safeBubble(message)
        focusElement(dom.input)
        return
      }
      const routedText = typeof review.text === 'string' && review.text.trim() !== '' ? review.text : check.text
      const intent = parseLocalIntent(routedText)
      renderCard(describeLocalResult({ intent, status: 'working', inputText: routedText, createdAt: now() }))
      let status: LocalResultStatus = 'done'
      if (intent === 'say' || intent === 'plain') {
        let spoke = false
        try {
          spoke = await deps.say(buildLocalReply(intent, routedText))
        } catch (error) {
          reportError(error)
          status = 'error'
        }
        // `say()` returns false when the existing TTS/safety gate refused the
        // local reply: surface that as needs_input instead of faking success.
        if (status !== 'error' && !spoke) status = 'needs_input'
      }
      const record = describeLocalResult({ intent, status, inputText: routedText, createdAt: now() })
      sessionResults.push(record)
      setLayerState(dom.composer, false)
      dom.input.value = ''
      setHint('')
      renderCard(record)
      focusElement(dom.card)
      if (status === 'done' && intent !== 'say' && intent !== 'plain') {
        safeBubble(
          intent === 'reminder'
            ? '草稿只在这次会话里；没有写进 Advisers。'
            : '记在这次会话里了；没有持久化。',
        )
      }
    } catch (error) {
      reportError(error)
      const record = describeLocalResult({
        intent: parseLocalIntent(check.text),
        status: 'error',
        inputText: check.text,
        createdAt: now(),
      })
      sessionResults.push(record)
      setLayerState(dom.composer, false)
      setHint('')
      renderCard(record)
      focusElement(dom.card)
    } finally {
      busy = false
      dom.submit.disabled = false
    }
  }

  const onComposerKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeComposer(true)
    }
  }
  const onInputKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter') {
      onComposerKeydown(event)
      return
    }
    // Chinese IME: composition Enter only commits the candidate (keyCode 229 is
    // the WebKit/Chromium legacy signal still seen with some IMEs).
    if (event.isComposing || (event as KeyboardEvent & { keyCode?: number }).keyCode === 229) return
    if (event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    void submit()
  }
  const onCardKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    closeResult()
  }
  const onExpand = (): void => {
    const opening = dom.detail.hidden
    dom.detail.hidden = !opening
    dom.expand.setAttribute('aria-expanded', opening ? 'true' : 'false')
    dom.expand.textContent = opening ? '收起' : '展开'
  }
  const onConsentOverlay = (event: Event): void => {
    const detail = (event as CustomEvent<ConsentOverlayEventDetail>).detail
    // Any TOS/TTS/blocked overlay appearing or closing closes the local input
    // (the overlay owns focus); a fresh open still needs an explicit user action.
    if (!detail || detail.open) {
      closeComposer(false)
      hideCard()
    } else {
      closeComposer(false)
    }
  }

  const onSubmit = (): void => {
    void submit()
  }
  const onCancel = (): void => closeComposer(true)
  const onLater = (): void => closeResult()
  const onCloseCard = (): void => closeResult()
  dom.composer.addEventListener('keydown', onComposerKeydown)
  dom.input.addEventListener('keydown', onInputKeydown)
  dom.submit.addEventListener('click', onSubmit)
  dom.cancel.addEventListener('click', onCancel)
  dom.card.addEventListener('keydown', onCardKeydown)
  dom.expand.addEventListener('click', onExpand)
  dom.later.addEventListener('click', onLater)
  dom.close.addEventListener('click', onCloseCard)
  doc.addEventListener(CONSENT_OVERLAY_EVENT, onConsentOverlay)

  return {
    open(): boolean {
      if (!consentOpen()) {
        safeBubble('请先同意完整声明后再交办。')
        return false
      }
      hideCard()
      setHint('')
      returnFocus = (doc.activeElement as HTMLElement | null) ?? null
      setLayerState(dom.composer, true)
      focusElement(dom.input)
      return true
    },
    close(): void {
      closeComposer(true)
    },
    isOpen,
    getSessionResults(): readonly LocalResultRecord[] {
      return [...sessionResults]
    },
    destroy(): void {
      dom.composer.removeEventListener('keydown', onComposerKeydown)
      dom.input.removeEventListener('keydown', onInputKeydown)
      dom.submit.removeEventListener('click', onSubmit)
      dom.cancel.removeEventListener('click', onCancel)
      dom.card.removeEventListener('keydown', onCardKeydown)
      dom.expand.removeEventListener('click', onExpand)
      dom.later.removeEventListener('click', onLater)
      dom.close.removeEventListener('click', onCloseCard)
      doc.removeEventListener(CONSENT_OVERLAY_EVENT, onConsentOverlay)
    },
  }
}
