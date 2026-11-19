/**
 * Independent content/settings window (MB-062 / E6, task-85).
 *
 * The installed pet window is product-locked at 480x336, borderless and
 * non-resizable, so the role/content center and the consolidated settings
 * dialog cannot be read there (UX-P1-1 / UX-P0-2). The Tauri host opens a
 * SECOND, normally decorated, resizable window labelled `content`. It reuses
 * the same `pet.html` entry: the Rust side injects
 * `window.__CONTENT_WINDOW_ROUTE__` before any page script runs, and main.ts
 * then boots only the content-hub/settings renderers (no pet, no autosave).
 *
 * This module owns ONLY routing/opening/chrome glue:
 * - pure URL/route helpers (also the browser/dev fallback `?shell=content#...`),
 * - the host IPC call that asks Tauri to open/focus the one content window,
 * - the small in-window home surface (内容中心 / 设置 / 关闭窗口) + Escape handling.
 * Rendering and persistence stay in content-hub.ts / desktop-shell.ts /
 * main.ts's content runtime (this module never duplicates them).
 */

/** Tauri window label of the independent content/settings window. */
export const CONTENT_WINDOW_LABEL = 'content'
/** Browser `window.open` target name: a repeated open focuses the same tab/window. */
export const CONTENT_WINDOW_TARGET = 'desktop-games-content'
export const CONTENT_WINDOW_TITLE = '内容与设置 · Desktop Games'
/** Emitted by Rust (and by main.ts in the browser) to switch the visible panel. */
export const CONTENT_WINDOW_NAVIGATE_EVENT = 'content-window://navigate'
/** Ask the pet window to save-and-reload after a content/role change. */
export const PET_RELOAD_EVENT = 'pet://reload-requested'
export const CONTENT_WINDOW_DEFAULT_ROUTE = 'content' as const
export const CONTENT_WINDOW_ROUTES = ['content', 'settings'] as const
export type ContentWindowRoute = (typeof CONTENT_WINDOW_ROUTES)[number]

/** DOM ids of the in-window home surface declared in pet.html. */
export const CONTENT_WINDOW_HOME_ID = 'content-window-home'
export const CONTENT_WINDOW_OPEN_HUB_ID = 'content-window-open-hub'
export const CONTENT_WINDOW_OPEN_SETTINGS_ID = 'content-window-open-settings'
export const CONTENT_WINDOW_CLOSE_ID = 'content-window-close'

const TAURI_INTERNALS_KEY = '__TAURI_INTERNALS__'
const HOST_ROUTE_GLOBAL = '__CONTENT_WINDOW_ROUTE__'
const STORED_FOCUS_KEY = 'desktop-games/pet/content-window-focus'
const FOCUS_TARGET_PATTERN = /^[a-z0-9-]{1,64}$/

export interface ContentWindowMode {
  readonly isContentWindow: boolean
  readonly route: ContentWindowRoute
}

export interface ContentWindowModeInput {
  /** `location.search` (browser/dev fallback uses `?shell=content`). */
  readonly search?: string
  /** `location.hash` (`#content` / `#settings`, preserved across reloads). */
  readonly hash?: string
  /** Value of `window.__CONTENT_WINDOW_ROUTE__`, injected by the Tauri host. */
  readonly hostRoute?: unknown
}

export function normalizeContentWindowRoute(
  raw: unknown,
  fallback: ContentWindowRoute = CONTENT_WINDOW_DEFAULT_ROUTE,
): ContentWindowRoute {
  return raw === 'content' || raw === 'settings' ? raw : fallback
}

export function parseContentWindowHashRoute(hash: string): ContentWindowRoute | null {
  const value = hash.replace(/^#\/?/, '').trim().toLowerCase()
  return value === 'content' || value === 'settings' ? value : null
}

/**
 * Decide whether this page load is the independent content window and which
 * panel to show. The Tauri initialization script is the primary signal; the
 * `?shell=content` query is the browser/dev fallback (same page, no Tauri).
 */
export function contentWindowMode(input: ContentWindowModeInput = {}): ContentWindowMode {
  const search = input.search ?? ''
  const hash = input.hash ?? ''
  const hostRoute = input.hostRoute
  const queryContent = /(?:^|[?&])shell=content(?:&|$)/.test(search)
  const hostContent = hostRoute === 'content' || hostRoute === 'settings'
  if (!queryContent && !hostContent) {
    return { isContentWindow: false, route: CONTENT_WINDOW_DEFAULT_ROUTE }
  }
  const route = parseContentWindowHashRoute(hash) ?? normalizeContentWindowRoute(hostRoute)
  return { isContentWindow: true, route }
}

/** Browser/dev fallback URL: one page, route in the hash, `shell` in the query. */
export function buildContentWindowUrl(route: ContentWindowRoute): string {
  return `/pet.html?shell=content#${normalizeContentWindowRoute(route)}`
}

export interface OpenContentWindowDeps {
  /** Injected IPC for tests; defaults to `@tauri-apps/api/core` under Tauri. */
  readonly invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>
  /** Injected browser opener for tests; defaults to `window.open`. */
  readonly open?: (url: string, target: string, features?: string) => unknown
  /** Test override for Tauri detection. */
  readonly hasTauri?: boolean
}

function detectTauri(): boolean {
  try {
    return typeof window !== 'undefined' && TAURI_INTERNALS_KEY in window
  } catch {
    return false
  }
}

/**
 * Open (or focus) the ONE content/settings window and return whether the
 * request was handled. Tauri never creates a duplicate: the Rust command
 * focuses the existing `content` window and emits the route to it. In the
 * browser/dev fallback a named popup reuses the same window; callers fall back
 * to the in-window dialog when this returns false (popup blocked, IPC denied).
 */
export async function openContentWindow(
  route: ContentWindowRoute,
  deps: OpenContentWindowDeps = {},
): Promise<boolean> {
  const target = normalizeContentWindowRoute(route)
  const hasTauri = deps.hasTauri ?? detectTauri()
  if (hasTauri) {
    try {
      if (deps.invoke) await deps.invoke('open_content_window', { route: target })
      else {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('open_content_window', { route: target })
      }
      return true
    } catch {
      return false
    }
  }
  const opener =
    deps.open ??
    (typeof window === 'undefined' ? undefined : window.open.bind(window))
  if (!opener) return false
  try {
    const opened = opener(buildContentWindowUrl(target), CONTENT_WINDOW_TARGET, 'popup=yes,width=760,height=560')
    return opened !== null && opened !== undefined
  } catch {
    return false
  }
}

/** Remember a deep-link focus target (e.g. 缩放) for the content window. */
export function stashContentWindowFocus(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  focusTarget: string | undefined,
): void {
  if (!storage || focusTarget === undefined || !FOCUS_TARGET_PATTERN.test(focusTarget)) return
  try {
    storage.setItem(STORED_FOCUS_KEY, focusTarget)
  } catch {
    /* a locked storage must not block opening the window */
  }
}

/** Read-and-clear the deep-link focus target (never trusted as HTML). */
export function takeContentWindowFocus(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null | undefined,
): string | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(STORED_FOCUS_KEY)
    storage.removeItem(STORED_FOCUS_KEY)
    return raw !== null && FOCUS_TARGET_PATTERN.test(raw) ? raw : null
  } catch {
    return null
  }
}

export interface ContentWindowChromeOptions {
  readonly document: Document
  /** Present a panel (main.ts opens the existing hub/settings renderer). */
  readonly openRoute: (route: ContentWindowRoute) => void
  /** Close the content window (Escape at home / 关闭窗口). */
  readonly closeWindow: () => void
}

export interface ContentWindowChrome {
  isHomeVisible(): boolean
  /** Hide the panel and show the home surface (panel closed). */
  showHome(): void
  hideHome(): void
  /** Hide the home surface, record the route in the hash, open the panel. */
  showRoute(route: ContentWindowRoute): void
  destroy(): void
}

function focusFirstHomeAction(doc: Document): void {
  for (const id of [CONTENT_WINDOW_OPEN_HUB_ID, CONTENT_WINDOW_OPEN_SETTINGS_ID, CONTENT_WINDOW_CLOSE_ID]) {
    const element = doc.getElementById(id)
    if (!element) continue
    try {
      element.focus()
    } catch {}
    return
  }
}

/**
 * Wire the in-window home surface: 内容中心 / 设置 / 关闭窗口, hash routing and
 * Escape-at-home. Panels keep their own focus traps and Escape handling; this
 * listener runs in the bubble phase and ignores events a panel already handled.
 */
export function installContentWindowChrome(options: ContentWindowChromeOptions): ContentWindowChrome {
  const doc = options.document
  const home = doc.getElementById(CONTENT_WINDOW_HOME_ID)
  doc.title = CONTENT_WINDOW_TITLE
  try {
    doc.documentElement.dataset.contentWindow = '1'
  } catch {}
  let homeVisible = true
  const showHome = (): void => {
    homeVisible = true
    if (home) home.hidden = false
    focusFirstHomeAction(doc)
  }
  const hideHome = (): void => {
    homeVisible = false
    if (home) home.hidden = true
  }
  const showRoute = (route: ContentWindowRoute): void => {
    const target = normalizeContentWindowRoute(route)
    hideHome()
    try {
      const view = doc.defaultView
      view?.history?.replaceState(null, '', `#${target}`)
    } catch {
      /* hash routing is best effort; the panel still opens */
    }
    options.openRoute(target)
  }
  const onOpenHub = (event: Event): void => {
    event.preventDefault()
    showRoute('content')
  }
  const onOpenSettings = (event: Event): void => {
    event.preventDefault()
    showRoute('settings')
  }
  const onClose = (event: Event): void => {
    event.preventDefault()
    options.closeWindow()
  }
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || !homeVisible) return
    try {
      if (doc.querySelectorAll('.consent-root').length > 0) return
    } catch {
      return
    }
    event.preventDefault()
    options.closeWindow()
  }
  const hubButton = doc.getElementById(CONTENT_WINDOW_OPEN_HUB_ID)
  const settingsButton = doc.getElementById(CONTENT_WINDOW_OPEN_SETTINGS_ID)
  const closeButton = doc.getElementById(CONTENT_WINDOW_CLOSE_ID)
  hubButton?.addEventListener('click', onOpenHub)
  settingsButton?.addEventListener('click', onOpenSettings)
  closeButton?.addEventListener('click', onClose)
  doc.addEventListener('keydown', onKeydown)
  return {
    isHomeVisible: () => homeVisible,
    showHome,
    hideHome,
    showRoute,
    destroy(): void {
      hubButton?.removeEventListener('click', onOpenHub)
      settingsButton?.removeEventListener('click', onOpenSettings)
      closeButton?.removeEventListener('click', onClose)
      doc.removeEventListener('keydown', onKeydown)
    },
  }
}

/** Test/diagnostic helper: the exact IPC command the Tauri host exposes. */
export const OPEN_CONTENT_WINDOW_COMMAND = 'open_content_window'
