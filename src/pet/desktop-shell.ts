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
import type { HeroMenuAction } from './hero-actions.ts'

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
const PET_SCALE_KEY = 'desktop-games/pet/scale'
const TEXT_SCALE_KEY = 'desktop-games/pet/text-scale'
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
// Renderer / hero menu (golden-retriever v7 integration, 2026-11-18)
// ---------------------------------------------------------------------------

/** Renderer choice written by the desktop-shell menu. */
export type PetRendererChoice = 'dog' | 'origami'

/**
 * Pure storage writes for one renderer choice.
 *
 * - `dog` = v7 golden-retriever hero canvas: enable hero + persist the dog
 *   character (the next load resolves it through `HERO_CHARACTER_STORAGE_KEY`);
 * - `origami` = folded-paper DOM: switch hero off. The persisted character is
 *   deliberately left untouched so switching back to `dog` works in one click.
 */
export function rendererChoiceWrites(choice: PetRendererChoice): ReadonlyArray<readonly [string, string]> {
  return choice === 'dog'
    ? [
        [HERO_RENDERER_STORAGE.hero, '1'],
        [HERO_RENDERER_STORAGE.character, 'dog'],
      ]
    : [[HERO_RENDERER_STORAGE.hero, '0']]
}

/** One menu entry for a hero-only action (see `hero-actions.ts`). */
export interface HeroMenuActionItem {
  readonly action: HeroMenuAction
  readonly label: string
}

/** Hero-only menu entries; rendered only while the hero canvas is running. */
export const HERO_MENU_ACTIONS: readonly HeroMenuActionItem[] = [
  { action: 'pat', label: '摸头（hero）' },
  { action: 'ball_throw', label: '抛球' },
  { action: 'ball_chase', label: '追球' },
]

/** `[]` in origami mode, all three actions while the hero renderer is active. */
export function heroMenuActions(heroActive: boolean): readonly HeroMenuActionItem[] {
  return heroActive ? HERO_MENU_ACTIONS : []
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
  /**
   * Host hook for the hero-only menu entries. `main.ts` routes this to
   * `HeroRuntime.emit()` (never to the folded-paper DOM buttons, so a hero
   * action cannot double-fire the kernel/speech side effects).
   */
  readonly onHeroAction?: (action: HeroMenuAction) => void
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value))
  } catch {}
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

/** Propagate the resolved scale to CSS + the `#pet-scale-label` node (both shells). */
function applyScaleVariables(scale: number, textScale: number): void {
  const doc = activeDocument()
  if (!doc) return
  const root = doc.documentElement
  root.style.setProperty('--pet-scale', String(scale))
  root.style.setProperty('--ui-scale', String(textScale))
  root.style.setProperty('--text-scale', `${Math.round(textScale * 100)}%`)
  const label = doc.getElementById('pet-scale-label')
  if (label) label.textContent = formatScaleLabel(scale)
}

export function initDesktopShell(options: DesktopShellOptions = {}): void {
  const doc = options.document ?? (typeof document === 'undefined' ? null : document)
  const win = options.window ?? (typeof window === 'undefined' ? null : window)
  if (!doc || !win) return
  shellDocument = doc
  shellWindow = win
  const docRef: Document = doc
  const winRef: Window = win
  const consentGateOpen = options.canInteract ?? canInteract
  const consentOverlayOpen = options.consentOverlayOpen ?? (() => hasOpenConsentOverlay(docRef))
  /** V1 typed input: same-window composer opener supplied by main.ts. */
  const openComposer = options.openComposer
  /** Hero canvas state + menu action sink supplied by main.ts (defaults inert). */
  const heroActive = options.heroActive ?? ((): boolean => false)
  const onHeroAction = options.onHeroAction
  /**
   * Renderer switch: persist the choice, then reload so `resolveHeroConfig()`
   * picks it up. The menu re-checks the consent gate before calling this.
   */
  const applyRenderer = (choice: PetRendererChoice): void => {
    let storage: Pick<Storage, 'setItem'> | null = null
    try {
      storage = typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      storage = null
    }
    applyRendererChoice(choice, { storage, reload: () => winRef.location.reload() })
  }
  /** Fail closed if the gate accessor itself throws (runtime missing/torn down). */
  const menuBlocked = (): boolean => {
    try {
      return shellMenuBlocked({
        canInteract: consentGateOpen(),
        consentOverlayOpen: consentOverlayOpen(),
      })
    } catch {
      return true
    }
  }
  const setConsentState = (): void => {
    docRef.documentElement.dataset.shellConsent = menuBlocked() ? 'blocked' : 'ready'
  }

  const params = new URLSearchParams(winRef.location.search)
  const desktop = params.get('shell') !== 'window'
  if (!desktop) {
    docRef.documentElement.dataset.petShell = 'window'
    // Dev/E2E full-page layout: keep the label truthfully showing the stored
    // scale even though only the desktop shell zooms the pet.
    applyScaleVariables(resolvePetScale(), resolveTextScale())
    return
  }
  docRef.documentElement.dataset.petShell = 'desktop'

  const pet = docRef.getElementById('pet')
  if (!pet) return
  let scale = resolvePetScale()
  let textScale = resolveTextScale(scale)
  const applyScale = (): void => applyScaleVariables(scale, textScale)
  const setScale = (next: number): void => {
    // Defence in depth: never write a shell preference while consent is missing.
    if (menuBlocked()) return
    scale = clamp(next, PET_SCALE_MIN, PET_SCALE_MAX)
    // Text follows the pet scale by default; A-/A+ remains an independent override.
    textScale = clamp(scale, TEXT_SCALE_MIN, TEXT_SCALE_MAX)
    writeNumber(PET_SCALE_KEY, scale)
    applyScale()
  }
  const setTextScale = (next: number): void => {
    if (menuBlocked()) return
    textScale = clamp(next, TEXT_SCALE_MIN, TEXT_SCALE_MAX)
    writeNumber(TEXT_SCALE_KEY, textScale)
    applyScale()
  }
  applyScale()

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
  let returnFocus: HTMLElement | null = null

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
    addHeading('汀岚 · 桌面')
    // V1 typed input (PET-INPUT-OUTPUT-DESIGN-2026-11-17 §2): same window, no
    // resize/new window. The composer is local-only (no LLM/Advisers writes) and
    // its own controller re-checks the consent gate at open/submit time.
    add('交办 / 打字输入…', () => { openComposer?.() })
    if (heroActive()) {
      // Hero canvas is drawing: the folded-paper DOM buttons are hidden by
      // pet.css, so route the same intents through hero.emit() data events.
      for (const item of heroMenuActions(true)) {
        add(item.label, () => { onHeroAction?.(item.action) })
      }
    } else {
      // Origami mode keeps the original folded-paper actions unchanged.
      add('摸摸', () => click('pat'), '', 'menu/U-MENU-01a_32x32.png')
      add('给纸片', () => click('give'), '', 'menu/U-MENU-02a_32x32.png')
      add('折一下', () => click('fold'), '', 'menu/U-MENU-03a_32x32.png')
    }
    add('折页簿', () => click('memory-book'), '', 'menu/U-MENU-04a_32x32.png')
    add('导入 DeepSeek 网页会话…', openImportWithConsent, '', 'menu/U-MENU-05a_32x32.png')
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
    add('模型 / API Key 设置…', openSetup, '', 'menu/U-MENU-07a_32x32.png')
    addHeading('渲染器')
    // Renderer switches persist a preference and reload the pet page; they are
    // available in both modes so the user can always switch back.
    add('渲染器：金毛（动画）', () => applyRenderer('dog'))
    add('渲染器：折纸（默认）', () => applyRenderer('origami'))
    addHeading(`宠物缩放 · ${formatScaleLabel(scale)}`)
    const scaleRow = docRef.createElement('div')
    scaleRow.className = 'pet-menu-inline'
    scaleRow.setAttribute('role', 'group')
    scaleRow.setAttribute('aria-label', `宠物缩放，当前 ${formatScaleLabel(scale)}`)
    for (const value of [1, 2, 3, 4]) {
      addInline(scaleRow, {
        label: formatScaleLabel(value),
        actionId: `scale:${value}`,
        role: 'menuitemradio',
        checked: value === scale,
        onActivate: () => {
          setScale(value)
          renderMenu(`scale:${clamp(value, PET_SCALE_MIN, PET_SCALE_MAX)}`)
        },
      })
    }
    menu.append(scaleRow)
    addHeading(`文字大小 ${Math.round(textScale * 100)}%`)
    const textRow = docRef.createElement('div')
    textRow.className = 'pet-menu-inline'
    textRow.setAttribute('role', 'group')
    textRow.setAttribute('aria-label', '文字大小')
    addInline(textRow, {
      label: 'A−',
      actionId: 'text:minus',
      role: 'menuitem',
      disabled: textScale <= TEXT_SCALE_MIN + 1e-9,
      onActivate: () => {
        setTextScale(textScale - 0.1)
        renderMenu('text:minus')
      },
    })
    addInline(textRow, {
      label: 'A+',
      actionId: 'text:plus',
      role: 'menuitem',
      disabled: textScale >= TEXT_SCALE_MAX - 1e-9,
      onActivate: () => {
        setTextScale(textScale + 0.1)
        renderMenu('text:plus')
      },
    })
    menu.append(textRow)
    addHeading('窗口 / 声明')
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
    add('完整面板（开发/E2E）', () => { winRef.location.search = '?shell=window' })
    add('退出', () => winRef.close(), '', 'menu/U-MENU-10a_32x32.png')
    if (focusAction !== undefined) focusActionItem(focusAction)
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
    if (menuBlocked()) {
      closeMenu(false)
      return false
    }
    if (!menuOpen) {
      const active = docRef.activeElement
      returnFocus = active instanceof HTMLElement ? active : trigger
      renderMenu()
    }
    menu.style.left = '0px'
    menu.style.top = '0px'
    const rect = menu.getBoundingClientRect()
    const left = Math.max(4, Math.min(x, winRef.innerWidth - rect.width - 4))
    const top = Math.max(4, Math.min(y, winRef.innerHeight - rect.height - 4))
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
    menu.inert = false
    menu.dataset.state = 'open'
    menu.setAttribute('aria-hidden', 'false')
    trigger?.setAttribute('aria-expanded', 'true')
    menuOpen = true
    setConsentState()
    focusMenuItem(0)
    return true
  }

  const openFromTrigger = (): boolean => {
    const anchor = (trigger ?? pet).getBoundingClientRect()
    return openMenuAt(anchor.left, anchor.top - 4)
  }

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
      setConsentState()
      return
    }
    if (menuBlocked()) closeMenu(false)
    // The modal's unlock removes the inert attribute it set on body-level
    // siblings; a closed menu must remain inert/tab-invisible after that.
    if (menuOpen) closeMenu(false)
    else menu.inert = true
    setConsentState()
  }
  docRef.addEventListener(CONSENT_OVERLAY_EVENT, onConsentOverlay)

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
    event.preventDefault()
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
    if (!menuOpen) return
    const target = event.target as Node | null
    if (target && (menu.contains(target) || (trigger?.contains(target) ?? false))) return
    closeMenu()
  })
  docRef.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (menuOpen) closeMenu()
      return
    }
    if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
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
    }
  })

  // Fail closed until the gate says otherwise; a later TOS acceptance without a
  // prompt (stored acceptance) flips this to "ready" on the first allowed open.
  setConsentState()
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
  if (/晚安|睡吧|休息/.test(text)) return '晚安。灯我留着，明天见。'
  if (/你好|早上好|在吗/.test(text)) return '我在。你忙你的，我在这里。'
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
