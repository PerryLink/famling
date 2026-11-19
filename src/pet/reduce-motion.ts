/**
 * Shared reduced-motion preference (E7 / MB-071).
 *
 * One source of truth for the pet window, the desktop shell settings and the
 * game windows:
 *
 * - A persisted explicit setting ("desktop-games/pet/reduce-motion" = '1'/'0')
 *   always wins. This is the "显式设置可覆盖" half: a user may turn motion back
 *   on even when the OS asks for reduced motion.
 * - Without an explicit setting the OS media query
 *   (prefers-reduced-motion: reduce) is the default ("系统偏好优先"), including
 *   live changes while the app runs.
 * - The resolved value is written to html[data-reduce-motion="1"|"0"] so CSS
 *   (pet.css + the injected game-page CSS below) collapses transitions,
 *   animations and smooth scrolling; the pet hero rAF loop reads the same
 *   attribute and freezes its scene clock.
 *
 * Game windows call installReduceMotion(); the desktop shell calls the same
 * primitives from its settings handler. Storage is injectable for Node tests.
 */

import type { StorageLike } from './security/safe-storage.ts'

/** Persisted explicit preference; kept in sync with desktop-shell.ts. */
export const REDUCE_MOTION_KEY = 'desktop-games/pet/reduce-motion'

/** Injected style id used by game pages (pet.css already ships the rules). */
export const REDUCE_MOTION_STYLE_ID = 'pet-reduce-motion-style'

/**
 * Global CSS used outside pet.css (aquarium/stall/town/world). Mirrors the
 * pet.css attribute block: no animation, no transition, no smooth scrolling.
 * The OS media query is covered too, so a page that has not run the installer
 * yet still respects prefers-reduced-motion.
 */
export const REDUCE_MOTION_CSS = [
  '@media (prefers-reduced-motion: reduce) {',
  "  html:not([data-reduce-motion='0']) *, html:not([data-reduce-motion='0']) *::before, html:not([data-reduce-motion='0']) *::after {",
  '    animation-duration: 0.01ms !important;',
  '    animation-iteration-count: 1 !important;',
  '    transition-duration: 0.01ms !important;',
  '    transition-delay: 0ms !important;',
  '    scroll-behavior: auto !important;',
  '  }',
  '}',
  "html[data-reduce-motion='1'] *,",
  "html[data-reduce-motion='1'] *::before,",
  "html[data-reduce-motion='1'] *::after {",
  '  animation-duration: 0.01ms !important;',
  '  animation-iteration-count: 1 !important;',
  '  transition-duration: 0.01ms !important;',
  '  transition-delay: 0ms !important;',
  '  scroll-behavior: auto !important;',
  '}',
].join('\n')

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) return storage
  try {
    if (typeof localStorage === 'undefined' || !localStorage) return null
    return localStorage
  } catch {
    return null
  }
}

/**
 * Read the explicit preference. Returns null when the user has never chosen
 * (first run / corrupt value), so the OS preference can supply the default.
 */
export function readExplicitReduceMotion(storage?: StorageLike | null): boolean | null {
  try {
    const value = resolveStorage(storage)?.getItem(REDUCE_MOTION_KEY)
    if (value === '1') return true
    if (value === '0') return false
    return null
  } catch {
    return null
  }
}

/** Persist the explicit preference (silent no-op when storage is blocked). */
export function writeExplicitReduceMotion(enabled: boolean, storage?: StorageLike | null): void {
  try {
    resolveStorage(storage)?.setItem(REDUCE_MOTION_KEY, enabled ? '1' : '0')
  } catch {
    /* storage blocked/full: the in-memory setting still applies for this session */
  }
}

/** The OS media query; missing/blocked matchMedia is treated as "no preference". */
export function systemPrefersReducedMotion(win?: Pick<Window, 'matchMedia'> | null): boolean {
  try {
    const target = win ?? (typeof window === 'undefined' ? null : window)
    if (!target || typeof target.matchMedia !== 'function') return false
    return target.matchMedia('(prefers-reduced-motion: reduce)').matches === true
  } catch {
    return false
  }
}

/**
 * Resolve the effective value: an explicit user setting wins, otherwise the
 * system preference. Exported pure so tests/settings can share the rule.
 */
export function resolveReduceMotionPreference(
  explicit: boolean | null,
  systemPrefers: boolean,
): boolean {
  return explicit === null ? systemPrefers : explicit
}

/** Write the single data attribute every CSS/JS consumer reads. */
export function applyReduceMotionAttribute(doc: Document, active: boolean): void {
  try {
    doc.documentElement.dataset.reduceMotion = active ? '1' : '0'
  } catch {
    /* detached document: nothing to paint */
  }
}

/** Inject the game-page CSS once (idempotent). */
export function ensureReduceMotionStyle(doc: Document): void {
  try {
    if (doc.getElementById(REDUCE_MOTION_STYLE_ID)) return
    const style = doc.createElement('style')
    style.id = REDUCE_MOTION_STYLE_ID
    style.textContent = REDUCE_MOTION_CSS
    ;(doc.head ?? doc.body).append(style)
  } catch {
    /* CSP/missing head: the data attribute + pet.css still cover the pet page */
  }
}

export interface ReduceMotionWatcherOptions {
  readonly storage?: StorageLike | null
  /** Game pages inject global CSS; the pet window relies on pet.css. */
  readonly injectCss?: boolean
  /** Optional hook for render loops that cache the value (called on change). */
  readonly onChange?: (active: boolean) => void
}

export interface ReduceMotionWatcher {
  /** Current resolved value (explicit setting, else OS preference). */
  active(): boolean
  /** Re-read storage + media query and apply. */
  refresh(): boolean
  /** Remove listeners (tests/hot reload). */
  dispose(): void
}

/**
 * Install the shared watcher on a window/document pair.
 *
 * It re-applies the resolved value when the OS media query changes (only while
 * the user has no explicit setting) and when another same-origin window writes
 * the explicit preference (storage event). No throw escapes: a page without
 * matchMedia/storage still gets the attribute applied once.
 */
export function watchReduceMotion(
  doc: Document,
  win: Window | null | undefined,
  options: ReduceMotionWatcherOptions = {},
): ReduceMotionWatcher {
  const storage = options.storage
  let mediaQuery: MediaQueryList | null = null
  let mediaListener: ((event: MediaQueryListEvent) => void) | null = null
  let storageListener: ((event: StorageEvent) => void) | null = null
  let active = false

  const resolve = (): boolean => {
    const explicit = readExplicitReduceMotion(storage)
    return resolveReduceMotionPreference(explicit, systemPrefersReducedMotion(win ?? null))
  }
  const apply = (next: boolean, notify: boolean): void => {
    active = next
    applyReduceMotionAttribute(doc, next)
    if (notify) {
      try {
        options.onChange?.(next)
      } catch {
        /* listeners are best-effort */
      }
    }
  }

  apply(resolve(), false)
  if (options.injectCss) ensureReduceMotionStyle(doc)

  try {
    if (win && typeof win.matchMedia === 'function') {
      mediaQuery = win.matchMedia('(prefers-reduced-motion: reduce)')
      mediaListener = () => {
        // An explicit user setting overrides the OS change.
        if (readExplicitReduceMotion(storage) !== null) return
        apply(resolve(), true)
        if (options.injectCss) ensureReduceMotionStyle(doc)
      }
      mediaQuery.addEventListener?.('change', mediaListener)
    }
  } catch {
    mediaQuery = null
    mediaListener = null
  }

  try {
    storageListener = (event) => {
      if (event.key !== REDUCE_MOTION_KEY && event.key !== null) return
      apply(resolve(), true)
      if (options.injectCss) ensureReduceMotionStyle(doc)
    }
    win?.addEventListener?.('storage', storageListener)
  } catch {
    storageListener = null
  }

  return {
    active: () => active,
    refresh: () => {
      const next = resolve()
      apply(next, true)
      return next
    },
    dispose: () => {
      try {
        if (mediaQuery && mediaListener) mediaQuery.removeEventListener?.('change', mediaListener)
      } catch {
        /* ignore */
      }
      try {
        if (storageListener) win?.removeEventListener?.('storage', storageListener)
      } catch {
        /* ignore */
      }
      mediaQuery = null
      mediaListener = null
      storageListener = null
    },
  }
}

/** Game-page convenience wrapper: watcher + injected CSS. */
export function installReduceMotion(
  doc: Document,
  win: Window | null | undefined,
  storage?: StorageLike | null,
): ReduceMotionWatcher {
  return watchReduceMotion(doc, win, { storage, injectCss: true })
}
