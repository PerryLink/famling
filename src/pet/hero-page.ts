/**
 * Hero page: canvas scene startup, character-pack hot switch/restore and the
 * pet-window placement (E10 MB-100, task-116; mechanically extracted from
 * `src/pet/main.ts`).
 *
 * main.ts used to own all of this inline. This module now owns only the hero
 * page's side effects: the rAF scene loop, the load/empty/error placeholder,
 * the atomic character-pack hot swap (+ built-in restore) and the Tauri pet
 * window position. Every pet-page seam it cannot own (kernel pats, region line
 * picks, audio unlock, the content-runtime restore hook) is injected through
 * `HeroPageDeps`, so this file has no CSS import and touches no DOM at module
 * evaluation time — Node tests can import it directly.
 *
 * Behaviour is unchanged from the extracted main.ts blocks; the only edits are
 * the injected document/window/clock/timer seams, which default to the page
 * globals in production.
 */
import {
  heroStatus,
  isHeroCharacterId,
  loadHeroBundle,
  startHeroRuntime,
  type HeroCharacterBundle,
  type HeroConfig,
  type HeroEmitOptions,
  type HeroEmitResult,
  type HeroRuntime,
  type HeroSnapshot,
  type HeroSpeechInput,
  type HeroStatus,
} from './hero-runtime.ts'
import { heroPlaceholderView, type HeroPlaceholderView } from './ui-state.ts'
import { getConsentGate } from './consent/runtime.ts'
import { ConsentDeclinedError, loadCharacterPackWithConsent } from './consent/content.ts'
import { startTinglanPreview } from './tinglan-preview.ts'
import { isBuiltinCharacterId } from './character/builtin.ts'
import { resolveHeroRegionReaction, type HeroRegionAction, type HeroRegionReaction } from './anim/regions.ts'
import { shouldStartWindowDrag } from './hero-drag.ts'
import { checkRelativePath } from './security/path-safety.ts'
import { requestDesktopShellScaleRefit } from './desktop-shell.ts'
import { removeKey, safeGetItem, safeSetItem, type StorageLike } from './security/safe-storage.ts'
import { characterBubbleSemantic, characterCanVoice } from './character-voice.ts'
import type { CharacterPackKind } from './content-library.ts'
import type { CharacterPackRenderHost, CharacterPackRendererEvent } from './character-pack-renderer.ts'
import type {
  CharacterPackActionOutcome,
  CharacterPackBuiltinRestoreResult,
  CharacterPackRendererWiring,
} from './content-hub/character-installer.ts'
import type { ErrorBoundary } from './security/error-boundary.ts'

/** Tauri event: content window asks the pet window (hero owner) to re-apply the saved pack. */
export const CHARACTER_PACK_APPLY_EVENT = 'pet://character-pack-apply'

/** Identity of one installed character pack applied to the live hero scene. */
export interface HeroCharacterPackIdentity {
  readonly packId: string
  readonly version: string
  readonly name: string
  readonly kind: CharacterPackKind
}

/** Minimal cross-window drag seam (production: Tauri `getCurrentWindow().startDragging()`). */
export type HeroWindowDrag = () => Promise<unknown>

/** The subset of `@tauri-apps/api/window` used by the window-position helpers. */
export interface TauriWindowModule {
  getCurrentWindow(): {
    outerPosition(): Promise<{ x: number; y: number }>
    setPosition(position: unknown): Promise<void>
  }
  PhysicalPosition: new (x: number, y: number) => unknown
  currentMonitor(): Promise<{
    position?: { x: number; y: number }
    size?: { width: number; height: number }
  } | null>
}

/** Live renderer truth for the QA surface (matches the old `__pet.characterPack`). */
export type HeroPageScene = 'folded-paper' | 'builtin-hero' | 'character-pack'

export interface HeroRenderStateInput {
  readonly happy: boolean
  readonly sleepy: boolean
  readonly muted: boolean
  readonly night: boolean
}

export interface HeroPageDeps {
  /** Page document (hero stage/canvas, placeholder, shell header, QA dataset). */
  readonly document: Document
  /** Page window: viewport/DPR, location, `__pet` QA hook and beforeunload. */
  readonly window: Window
  /** `resolveHeroConfig()` snapshot from main.ts (flag + character + scale). */
  readonly config: HeroConfig
  readonly hasTauri: boolean
  /** True in the independent content/settings window (never owns the hero). */
  readonly contentShell: boolean
  /** main.ts boundary reporter (logs once, never throws). */
  reportFailure(boundary: ErrorBoundary, error: unknown): void
  readonly storageBoundary: ErrorBoundary
  /** Pointer/kernel side effects that intentionally stay in main.ts. */
  onPat(actorId?: string): void
  onRegionTouch(actorId: string, reaction: HeroRegionReaction): void
  /** Resume/reuse the pet-page AudioContext on a hero pointer press. */
  onEnsureAudio(): void
  /** Re-apply the persisted pack appearance after the built-in hero booted. */
  restoreActiveCharacterPack(): Promise<CharacterPackActionOutcome | null>
  /** Storage override for the persisted window position (tests); default global. */
  readonly storage?: StorageLike | null
  // Testable seams: production omits them and gets the real page globals/modules.
  readonly now?: () => number
  readonly requestFrame?: (callback: FrameRequestCallback) => number
  readonly cancelFrame?: (handle: number) => void
  readonly scheduleTimeout?: (callback: () => void, timeoutMs?: number) => unknown
  readonly loadTauriWindow?: () => Promise<TauriWindowModule>
  readonly startWindowDrag?: HeroWindowDrag
  readonly startRuntime?: typeof startHeroRuntime
  readonly loadBundle?: typeof loadHeroBundle
  readonly startPreview?: typeof startTinglanPreview
  readonly getConsentGate?: typeof getConsentGate
  readonly loadCharacterPackWithConsent?: typeof loadCharacterPackWithConsent
}

export interface HeroPageApi {
  /** Boot the hero scene (or the folded-paper/placeholder fallback). */
  startPage(): Promise<void>
  /** Restore the shipped built-in hero scene after a pack was applied. */
  restoreBuiltin(): Promise<CharacterPackBuiltinRestoreResult>
  /** Atomically swap the live scene to a pack bundle (or built-in when null). */
  hotSwap(bundle: HeroCharacterBundle, identity: HeroCharacterPackIdentity | null): Promise<
    { ok: true } | { ok: false; reason: string }
  >
  isRendererReady(): boolean
  readonly rendererWiring: CharacterPackRendererWiring
  currentCharacterCanVoice(): boolean
  currentCharacterBubbleSemantic(): 'speech' | 'thought'
  getRuntime(): HeroRuntime | null
  emit(event: string, options?: HeroEmitOptions): HeroEmitResult | null
  speak(input: HeroSpeechInput): void
  setExpression(name: string): void
  /** Mirror render()'s mood/mute/night state to the live scene (no-op when off). */
  syncRenderState(input: HeroRenderStateInput): void
  liveRegionActions(): readonly HeroRegionAction[]
  snapshot(): HeroSnapshot | null
  isActive(): boolean
  activePackIdentity(): { packId: string; version: string } | null
  activePackKind(): CharacterPackKind | null
  scene(): HeroPageScene
  /** Pet-window placement listeners/timer (pet window only; idempotent wiring). */
  installWindowLayout(): void
  saveWindowPosition(): Promise<void>
  restoreWindowPosition(): Promise<void>
  /** Clear the persisted position (pet window's "reset to the corner" path). */
  clearSavedWindowPosition(): void
}

/**
 * Build one hero page controller. main.ts calls this once at module scope and
 * then uses only the returned API; the returned wiring is injected into the
 * content runtime exactly like the inline object was before the split.
 */
export function createHeroPage(deps: HeroPageDeps): HeroPageApi {
  const document = deps.document
  const windowLike = deps.window
  const HERO_CONFIG = deps.config
  const HAS_TAURI = deps.hasTauri
  const CONTENT_SHELL = deps.contentShell
  /** Injected page clock (production: performance.now; frame maths only). */
  const now = deps.now ?? ((): number => performance.now())
  const requestFrame = deps.requestFrame ?? ((callback: FrameRequestCallback): number => requestAnimationFrame(callback))
  const cancelFrame = deps.cancelFrame ?? ((handle: number): void => cancelAnimationFrame(handle))
  const setTimeoutFn = deps.scheduleTimeout ?? ((callback: () => void, timeoutMs?: number): unknown => setTimeout(callback, timeoutMs))
  const loadTauriWindow =
    deps.loadTauriWindow ??
    ((): Promise<TauriWindowModule> => import('@tauri-apps/api/window') as unknown as Promise<TauriWindowModule>)
  const startWindowDrag: HeroWindowDrag =
    deps.startWindowDrag ??
    (() => import('@tauri-apps/api/window').then(({ getCurrentWindow }) => getCurrentWindow().startDragging()))
  const startRuntime = deps.startRuntime ?? startHeroRuntime
  const loadBundle = deps.loadBundle ?? loadHeroBundle
  const startPreview = deps.startPreview ?? startTinglanPreview
  const getGate = deps.getConsentGate ?? getConsentGate
  const loadPackWithConsent = deps.loadCharacterPackWithConsent ?? loadCharacterPackWithConsent
  const restoreActiveCharacterPack = deps.restoreActiveCharacterPack
  const onPat = deps.onPat
  const onRegionTouch = deps.onRegionTouch
  const onEnsureAudio = deps.onEnsureAudio
  const reportFailure = deps.reportFailure
  const storageBoundary = deps.storageBoundary
  const pageLocation = windowLike.location ?? null
  /** Web Storage override for the renderer wiring (tests); default global. */
  const wiringStorage: StorageLike | null =
    deps.storage !== undefined
      ? deps.storage
      : (() => {
          try {
            return typeof localStorage === 'undefined' ? null : localStorage
          } catch {
            return null
          }
        })()
  /** The page's QA hook; main.ts assigns `window.__pet` before the first boot. */
  function petHook(): { hero?: HeroStatus } | undefined {
    return (windowLike as unknown as { __pet?: { hero?: HeroStatus } }).__pet
  }

  // -------------------------------------------------------------------------
  // Hero live-scene state (moved verbatim from main.ts)
  // -------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Character-pack hot switch (E4 / task-111)
  // ---------------------------------------------------------------------------
  // The shipped hero scene is the built-in renderer. Enabling an installed
  // `famling.pet-anim/0.2` pack loads its frames/assets (the installer hands the
  // adapter `data:` URLs derived from IndexedDB) and REPLACES the hero scene
  // without a page reload: a new HeroRuntime is built for the pack bundle and
  // only committed after its first frame gate succeeds. Any failure keeps the
  // previous scene; if there is no previous scene the shipped built-in stays.
  // The installer persists the applied pack id and asks `restoreBuiltin()` when it
  // must fall back.
  /** Stage size + DPR captured when the built-in hero scene booted. */
  let heroStageSize: { width: number; height: number } | null = null
  let heroDpr = 1
  /** True while the live hero scene is the shipped built-in character. */
  let heroSceneBuiltin = true
  /** Identity of the installed pack the live hero scene was built from. */
  let activeCharacterPackId: { packId: string; version: string } | null = null
  /** Pack kind currently rendered (drives silent-thought / locomotion semantics). */
  let activeCharacterPackKind: CharacterPackKind | null = null

  /** Cat/dog personas are silent: their bubbles are thoughts and TTS is skipped. */
  function currentCharacterCanVoice(): boolean {
    if (activeCharacterPackKind !== null) return activeCharacterPackKind === 'humanoid'
    return characterCanVoice(HERO_CONFIG.character, HERO_CONFIG.enabled)
  }

  /** Visible bubble semantics for a custom pack: cat/dog = thought, humanoid = speech. */
  function currentCharacterBubbleSemantic(): 'speech' | 'thought' {
    if (activeCharacterPackKind !== null) return activeCharacterPackKind === 'humanoid' ? 'speech' : 'thought'
    return characterBubbleSemantic(HERO_CONFIG.character, HERO_CONFIG.enabled)
  }
  let hero: HeroRuntime | null = null
  let heroCanvasEl: HTMLCanvasElement | null = null
  let heroCtx: CanvasRenderingContext2D | null = null
  let heroRaf: number | null = null
  let heroSceneNow = 0
  let heroLastFrameMs = 0
  let heroNight = false
  /** Cat/dog run locomotion: CSS translate/scale on the canvas, reset on idle. */
  const heroMove = { offset: 0, dir: 1 as 1 | -1, active: false }

  /** Pointer interaction cadence (head/body/tail taps). */
  const HERO_TOUCH_COOLDOWN_MS = 1200
  const HERO_REGION_COOLDOWN_MS = 2500
  let lastHeroTouchAt = 0
  const lastRegionTouchAt = new Map<string, number>()

  // -------------------------------------------------------------------------
  // Narrow scene accessors used by main.ts (no behaviour of their own)
  // -------------------------------------------------------------------------

  function emit(event: string, options: HeroEmitOptions = {}): HeroEmitResult | null {
    return hero ? hero.emit(event, options) : null
  }

  function speak(input: HeroSpeechInput): void {
    hero?.speak(input)
  }

  function setExpression(name: string): void {
    hero?.setExpression(name)
  }

  /** `render()` used to inline this mood/mute/night mirror; same order/conditions. */
  function syncRenderState(input: HeroRenderStateInput): void {
    const runtime = hero
    if (!runtime) return
    runtime.syncMood({ happy: input.happy, sleepy: input.sleepy })
    runtime.setMuted(input.muted)
    if (input.night !== heroNight) {
      heroNight = input.night
      runtime.setNight(input.night)
    }
  }

  function snapshot(): HeroSnapshot | null {
    return hero ? hero.snapshot() : null
  }

  function scene(): HeroPageScene {
    return hero === null ? 'folded-paper' : heroSceneBuiltin ? 'builtin-hero' : 'character-pack'
  }

  /** Actions for the live hero character (regions.json), with a legacy fallback. */
  function liveRegionActions(): readonly HeroRegionAction[] {
    return hero?.actors[0]?.bundle.regions?.actions ?? []
  }

  // ---------------------------------------------------------------------------
  // Character-pack renderer wiring (E4 / task-111)
  // ---------------------------------------------------------------------------
  // The install/enable UI lives in content-hub, but only this page owns the hero
  // canvas + scene. The injected host turns the adapter's converted pack into a
  // live, atomic hot swap; `restoreBuiltin` returns to the shipped hero character
  // (or the folded-paper DOM when even that cannot load). No pack bytes/URLs are
  // exposed to the installer events (observability only carries ids/versions).
  const characterPackRendererHost: CharacterPackRenderHost = {
    load: async (_ref, handle) => {
      const swapped = await hotSwapHeroCharacterPack(handle.bundle, {
        packId: handle.packId,
        version: handle.version,
        name: handle.name,
        kind: handle.kind,
      })
      if (!swapped.ok) throw new Error(swapped.reason)
    },
    release: (): void => {
      // The hot swap in load() already disposed the previous scene. A release with
      // no replacement happens on uninstall/fallback, and the installer calls
      // restoreBuiltin() immediately after; the built-in scene is restored there.
    },
  }

  /** Content window → pet window: ask the hero-owning window to apply the saved pack. */
  function requestPetWindowCharacterPackApply(): void {
    if (!HAS_TAURI || !CONTENT_SHELL) return
    void import('@tauri-apps/api/event')
      .then(({ emit }) => emit(CHARACTER_PACK_APPLY_EVENT, {}))
      .catch((error: unknown) => {
        console.warn('[pet] character-pack cross-window bridge unavailable', error)
      })
  }

  const characterPackRendererWiring: CharacterPackRendererWiring = {
    host: characterPackRendererHost,
    ...(pageLocation !== null ? { resolveBase: pageLocation.href } : {}),
    isReady: () => isHeroRendererReady(),
    restoreBuiltin: () => restoreBuiltinHero(),
    // In the independent Tauri content window this window has no hero scene:
    // enabling a pack persists the choice and asks the pet window to hot-swap it
    // (task-111). The browser fallback content shell also has no pet window, so it
    // stays a local (honestly not-ready) renderer instead of pretending to notify.
    localRenderer: !CONTENT_SHELL || !HAS_TAURI,
    ...(CONTENT_SHELL && HAS_TAURI ? { requestRemoteApply: () => requestPetWindowCharacterPackApply() } : {}),
    storage: wiringStorage,
    onRendererEvent: (event: CharacterPackRendererEvent): void => {
      // QA/debug only: no frame bytes, URLs or host objects cross this sink.
      try {
        const root = document.documentElement
        root.dataset.characterPackRenderer = event.type
        if (event.type === 'render-applied' || event.type === 'render-restored') {
          root.dataset.characterPack = event.packId + '@' + event.version
        } else if (event.type === 'render-released') {
          delete root.dataset.characterPack
        }
      } catch {
        /* QA attributes are best effort */
      }
    },
  }

  const WINDOW_KEY = 'desktop-games/pet/window'

  async function saveWindowPosition(): Promise<void> {
    if (!HAS_TAURI) return
    try {
      const { getCurrentWindow } = await loadTauriWindow()
      const position = await getCurrentWindow().outerPosition()
      const stored = safeSetItem(WINDOW_KEY, JSON.stringify({ x: position.x, y: position.y }), deps.storage)
      if (stored !== 'ok') reportFailure(storageBoundary, new Error(`window-position-storage-${stored}`))
    } catch (error) {
      reportFailure(storageBoundary, error)
    }
  }

  async function restoreWindowPosition(): Promise<void> {
    if (!HAS_TAURI) return
    const raw = safeGetItem(WINDOW_KEY, deps.storage)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as { x: number; y: number }
      if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return
      const { getCurrentWindow, PhysicalPosition, currentMonitor } = await loadTauriWindow()
      const win = getCurrentWindow()
      const monitor = await currentMonitor()
      if (monitor && monitor.position && monitor.size) {
        const left = monitor.position.x
        const top = monitor.position.y
        const right = left + monitor.size.width
        const bottom = top + monitor.size.height
        if (saved.x < left - 200 || saved.x > right - 40 || saved.y < top - 40 || saved.y > bottom - 40) {
          return
        }
      }
      await win.setPosition(new PhysicalPosition(saved.x, saved.y))
    } catch (error) {
      reportFailure(storageBoundary, error)
    }
  }

  // Pet-window placement is pet-only: the content window is a normal decorated
  // window, and both windows share localStorage, so it must never overwrite the
  // stored pet position (nor save its own).
  /** Clear the persisted position; only the pet window calls this on reset. */
  function clearSavedWindowPosition(): void {
    removeKey(WINDOW_KEY, deps.storage)
  }

  function installWindowLayout(): void {
    if (!HAS_TAURI || CONTENT_SHELL) return
    setTimeoutFn(() => void restoreWindowPosition(), 600)
    document.querySelector('header')?.addEventListener('pointerup', () => {
      setTimeoutFn(() => void saveWindowPosition(), 160)
    })
    windowLike.addEventListener('beforeunload', () => void saveWindowPosition())
  }

  // ---------------------------------------------------------------------------
  // Hero renderer (Phase 2 integration; feature-flagged, default OFF)
  // ---------------------------------------------------------------------------
  // `pet.html` keeps the folded-paper `#pet` DOM forever: hero mode only hides it
  // with CSS `visibility` (rect preserved for layout E2E) after the first hero
  // frame succeeded. Every failure path below falls back in one direction — the
  // DOM reappears, `__pet.hero = {enabled, ok:false, reason}` explains why, and
  // nothing is written to the save file or localStorage.

  function setHeroStatus(status: HeroStatus): void {
    const pet = petHook()
    if (pet) pet.hero = status
  }

  function stopHeroLoop(): void {
    if (heroRaf !== null) {
      cancelFrame(heroRaf)
      heroRaf = null
    }
  }

  /**
   * Minimal non-art hero state in the DOM (first-frame loading / no character /
   * failure). `heroPlaceholderView()` decides the state and text without reading
   * raw errors, so no local paths or fake character assets reach the UI.
   */
  function setHeroPlaceholder(view: HeroPlaceholderView): void {
    const element = document.getElementById('hero-placeholder')
    if (!element) return
    element.dataset.state = view.state
    element.hidden = view.state === 'off'
    const text = element.querySelector<HTMLElement>('.hero-placeholder-text')
    if (text) text.textContent = view.text
    const dot = element.querySelector<HTMLElement>('.hero-placeholder-dot')
    if (dot) dot.hidden = view.state !== 'loading'
  }

  function fallbackHero(reason: string, error?: unknown): void {
    stopHeroLoop()
    const stage = document.getElementById('hero-stage')
    if (stage) (stage as HTMLElement).hidden = true
    if (heroCanvasEl) {
      heroCanvasEl.style.transform = ''
      heroCanvasEl.style.translate = ''
      heroCanvasEl.style.scale = ''
      delete heroCanvasEl.dataset.heroFlip
      heroCanvasEl.classList.remove('dragging')
    }
    heroMove.offset = 0
    heroMove.active = false
    hero?.dispose()
    hero = null
    heroCtx = null
    // The DOM fallback is the shipped built-in appearance: no character pack.
    heroSceneBuiltin = true
    activeCharacterPackId = null
    activeCharacterPackKind = null
    delete document.documentElement.dataset.characterPack
    document.documentElement.removeAttribute('data-pet-render')
    delete document.documentElement.dataset.heroCanvas
    delete document.documentElement.dataset.heroScale
    setHeroStatus({ enabled: HERO_CONFIG.enabled, ok: false, reason })
    // Not console-only (audit U3/D5): show loading/empty/error instead of the
    // silent folded-paper fallback. The warn stays for local debugging.
    setHeroPlaceholder(heroPlaceholderView('failed', reason))
    console.warn('[pet] hero renderer fell back to the folded-paper DOM:', reason, error ?? '')
  }

  function heroFrame(timestamp: number): void {
    heroRaf = null
    if (!hero || !heroCtx) return
    // A hidden window pauses the loop; the scene clock is kept, so resuming does
    // not fast-forward through the hidden time (and the legacy DOM path is
    // untouched either way).
    if (document.visibilityState === 'hidden') return
    const dt = Math.max(0, Math.min(250, timestamp - heroLastFrameMs))
    heroLastFrameMs = timestamp
    // 减少动态 (pet.css tokens + this loop): freeze the scene clock and skip
    // tick/locomotion, so the canvas stays a static pose. Emits/speech still
    // change renderKey, which redraws exactly one still frame below.
    const reducedMotion = document.documentElement.dataset.reduceMotion === '1'
    if (!reducedMotion) heroSceneNow += dt
    try {
      if (!reducedMotion) hero.tick(heroSceneNow)
      // 6-14 fps art on a 60 Hz host: redraw only when a frame actually changed.
      const renderKey = hero.renderKey(heroSceneNow)
      const renderedKey = heroCanvasEl?.dataset.heroRenderKey
      if (!heroCanvasEl || renderedKey !== renderKey || heroCanvasEl.width === 0) {
        hero.render(heroCtx, heroSceneNow)
        if (heroCanvasEl) {
          heroCanvasEl.dataset.heroRenderKey = renderKey
          // Frame-stable key used by hit-regions to cache alpha masks.
          heroCanvasEl.dataset.heroFrameKey = hero.actors.map((actor) => {
            const frame = hero?.actorFrame(actor.id, heroSceneNow)
            return frame ? `${actor.id}:${frame.tag}:${frame.frame}` : `${actor.id}:none`
          }).join('|')
        }
      }
      if (!reducedMotion) applyHeroLocomotion(dt)
    } catch (error) {
      fallbackHero(`render-failed: ${error instanceof Error ? error.message : String(error)}`, error)
      return
    }
    heroRaf = requestFrame(heroFrame)
  }

  /**
   * Real left/right travel for cat/dog run clips. The hero canvas is translated
   * inside the transparent window (and mirrored when running left) instead of
   * animating legs in place; idle snaps back. Human and folded-paper are untouched.
   */
  function applyHeroLocomotion(dtMs: number): void {
    const canvas = heroCanvasEl
    if (!canvas || !hero) return
    const canMove =
      activeCharacterPackKind !== null
        ? activeCharacterPackKind === 'cat' || activeCharacterPackKind === 'dog'
        : HERO_CONFIG.character === 'cat' || HERO_CONFIG.character === 'dog'
    const actorId = hero.actors[0]?.id
    const tag = actorId ? hero.actorFrame(actorId, heroSceneNow)?.tag : undefined
    const moving = canMove && (tag === 'run' || tag === 'ball_chase')
    if (!moving) {
      if (!heroMove.active && heroMove.offset === 0) return
      // Ease back to the resting position; keep the current facing until settled.
      heroMove.active = false
      heroMove.offset *= 0.78
      if (Math.abs(heroMove.offset) < 1) {
        heroMove.offset = 0
        canvas.style.translate = ''
        canvas.style.scale = ''
        delete canvas.dataset.heroFlip
        return
      }
      canvas.style.translate = `${Math.round(heroMove.offset)}px 0px`
      return
    }
    const width = canvas.clientWidth || 192
    const max = Math.max(24, Math.min(150, (windowLike.innerWidth - width) / 2 - 12))
    const speed = tag === 'ball_chase' ? 135 : 105
    heroMove.active = true
    heroMove.offset += heroMove.dir * (speed * Math.max(0, Math.min(120, dtMs))) / 1000
    if (heroMove.offset > max) {
      heroMove.offset = max
      heroMove.dir = -1
    } else if (heroMove.offset < -max) {
      heroMove.offset = -max
      heroMove.dir = 1
    }
    // The side-view run art faces LEFT (head on the left). Mirror it when the
    // actor travels RIGHT so the visible facing always matches the movement;
    // `heroFlip` is consumed by the alpha-tile hit regions for coordinate mapping.
    const mirrored = heroMove.dir > 0
    canvas.style.translate = `${Math.round(heroMove.offset)}px 0px`
    canvas.style.scale = `${mirrored ? -1 : 1} 1`
    canvas.dataset.heroFlip = mirrored ? '1' : '0'
  }

  function startHeroLoop(): void {
    if (!hero || heroRaf !== null || document.visibilityState === 'hidden') return
    heroLastFrameMs = now()
    heroRaf = requestFrame(heroFrame)
  }

  /** True when the live hero scene can accept a character-pack hot swap. */
  function isHeroRendererReady(): boolean {
    return hero !== null && heroCanvasEl !== null && heroCtx !== null && heroStageSize !== null
  }


  /**
   * Hot-swap the live hero scene to one character-pack bundle (task-111), or to
   * the shipped built-in character when `identity` is null.
   *
   * The new scene is fully built + rendered through `startHeroRuntime`'s
   * first-frame gate BEFORE anything is committed: on failure the previous scene
   * keeps rendering (canvas backing store restored) and the built-in appearance is
   * untouched. On success the old runtime is disposed, the canvas/QA attributes
   * are refreshed and the existing hero rAF loop keeps drawing the new scene. The
   * pointer listeners stay attached to the same canvas and read the new `hero`.
   */
  async function hotSwapHeroCharacterPack(
    bundle: HeroCharacterBundle,
    identity: HeroCharacterPackIdentity | null,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const canvas = heroCanvasEl
    const ctx = heroCtx
    const stage = heroStageSize
    if (canvas === null || ctx === null || stage === null) {
      return { ok: false, reason: 'hero-renderer-not-running' }
    }
    // Re-measure the book stage: the window may have been resized since boot.
    const book = document.querySelector('.book')
    const rect = book?.getBoundingClientRect()
    const liveStage =
      rect !== undefined && rect !== null && rect.width > 0 && rect.height > 0
        ? { width: rect.width, height: rect.height }
        : stage
    // Idempotent: the requested pack (or the built-in scene) is already live.
    if (identity === null) {
      if (heroSceneBuiltin) return { ok: true }
    } else if (
      !heroSceneBuiltin &&
      activeCharacterPackId !== null &&
      activeCharacterPackId.packId === identity.packId &&
      activeCharacterPackId.version === identity.version
    ) {
      return { ok: true }
    }
    const previous = hero
    const snapshot = {
      width: canvas.width,
      height: canvas.height,
      styleWidth: canvas.style.width,
      styleHeight: canvas.style.height,
    }
    const restoreCanvas = (): void => {
      canvas.width = snapshot.width
      canvas.height = snapshot.height
      canvas.style.width = snapshot.styleWidth
      canvas.style.height = snapshot.styleHeight
      ctx.setTransform?.(heroDpr, 0, 0, heroDpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      delete canvas.dataset.heroRenderKey
      delete canvas.dataset.heroFrameKey
      if (previous !== null) {
        try {
          previous.render(ctx, heroSceneNow)
        } catch {
          // The old scene stays the fallback of record; a failed repaint is logged below.
        }
      }
    }
    const config: HeroConfig = {
      enabled: true,
      reason: 'query-on',
      character: HERO_CONFIG.character,
      actors: [HERO_CONFIG.character],
      ...(HERO_CONFIG.scale !== undefined ? { scale: HERO_CONFIG.scale } : {}),
    }
    let result: Awaited<ReturnType<typeof startHeroRuntime>>
    try {
      result = await startRuntime({
        config,
        canvas,
        ctx,
        stage: liveStage,
        dpr: heroDpr,
        loadBundle: async () => bundle,
        actorIds: [bundle.key],
        sleeping: heroNight,
        ...(pageLocation !== null ? { resolveBase: pageLocation.href } : {}),
      })
    } catch (error) {
      restoreCanvas()
      return { ok: false, reason: 'start-failed: ' + (error instanceof Error ? error.message : String(error)) }
    }
    if (!result.ok) {
      restoreCanvas()
      return { ok: false, reason: result.reason }
    }
    // Commit only after the first-frame gate succeeded.
    hero = result.runtime
    heroSceneBuiltin = identity === null
    activeCharacterPackId = identity === null ? null : { packId: identity.packId, version: identity.version }
    activeCharacterPackKind = identity === null ? null : identity.kind
    heroSceneNow = 0
    heroLastFrameMs = now()
    heroStageSize = liveStage
    heroMove.offset = 0
    heroMove.active = false
    canvas.style.translate = ''
    canvas.style.scale = ''
    delete canvas.dataset.heroFlip
    delete canvas.dataset.heroRenderKey
    delete canvas.dataset.heroFrameKey
    canvas.classList.remove('dragging')
    if (previous !== null) {
      try {
        previous.dispose()
      } catch {
        // A leaked scene must not block the already-successful switch.
      }
    }
    document.documentElement.dataset.petRender = 'hero'
    delete document.documentElement.dataset.characterPackRestore
    const stageElement = document.getElementById('hero-stage')
    if (stageElement) (stageElement as HTMLElement).hidden = false
    document.documentElement.dataset.heroCanvas = `${result.runtime.layout.width}x${result.runtime.layout.height}`
    document.documentElement.dataset.heroScale = String(result.runtime.layout.scale)
    document.documentElement.dataset.heroDpr = String(canvas.width / Math.max(1, result.runtime.layout.width))
    if (identity === null) {
      delete document.documentElement.dataset.characterPack
    } else {
      document.documentElement.dataset.characterPack = identity.packId + '@' + identity.version
    }
    setHeroStatus({
      enabled: true,
      ok: true,
      reason: identity === null ? 'builtin' : 'character-pack:' + identity.packId + '@' + identity.version,
    })
    setHeroPlaceholder(heroPlaceholderView('ready'))
    requestDesktopShellScaleRefit()
    startHeroLoop()
    return { ok: true }
  }

  /**
   * Restore the shipped built-in renderer after a pack was applied (uninstall,
   * rollback-to-builtin, disabled hero, apply failure). Always returns ok:true
   * when a built-in appearance is on screen — the folded-paper DOM is the last
   * built-in fallback, so a failed hero rebuild still leaves a working built-in.
   */
  async function restoreBuiltinHero(): Promise<CharacterPackBuiltinRestoreResult> {
    if (heroSceneBuiltin && hero !== null) {
      return { ok: true, message: '内置 hero 渲染器保持运行。' }
    }
    if (!isHeroRendererReady()) {
      heroSceneBuiltin = true
      activeCharacterPackId = null
      activeCharacterPackKind = null
      return { ok: true, message: 'hero 渲染器未运行，折叠纸内置外观保持可见。' }
    }
    let bundle: HeroCharacterBundle
    try {
      bundle = await loadBundle(HERO_CONFIG.character)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      heroSceneBuiltin = true
      activeCharacterPackId = null
      activeCharacterPackKind = null
      fallbackHero('character-pack-restore-failed: ' + reason)
      return { ok: true, message: '已回退折叠纸内置外观（内置 hero 角色包加载失败）。' }
    }
    const swapped = await hotSwapHeroCharacterPack(bundle, null)
    if (!swapped.ok) {
      heroSceneBuiltin = true
      activeCharacterPackId = null
      activeCharacterPackKind = null
      fallbackHero('character-pack-restore-failed: ' + swapped.reason)
      return { ok: true, message: '已回退折叠纸内置外观（内置 hero 场景重建失败）。' }
    }
    return { ok: true, message: '已恢复内置 hero 角色「' + HERO_CONFIG.character + '」。' }
  }

  /** Pointer → hero events. A real drag (>6 px) in the Tauri window starts the
   *  native window move via `startDragging()`; the canvas deliberately avoids
   *  `data-tauri-drag-region` so a short tap still reaches the hero hit test.
   *
   *  Coordinates: `hitActor`/the render backend work in canvas-local CSS pixels.
   *  The canvas backing store is `layout * devicePixelRatio` (see
   *  `startHeroRuntime({dpr})`) and the 2D context is DPR-transformed, but the CSS
   *  size and all pointer/hit-test maths stay CSS pixels. The hero canvas is no
   *  longer CSS-transformed by the desktop shell (only the legacy `.fold-pet` is
   *  `--pet-scale`d), so the client-width / rect-width ratio is normally 1; it is
   *  still applied as a safety net for browser zoom or any future CSS transform.
   */
  function attachHeroPointer(canvas: HTMLCanvasElement): void {
    let activePointer: number | null = null
    let startX = 0
    let startY = 0
    let startedAt = 0
    let dragging = false
    let dragActorId: string | undefined
    let windowDrag = false

    /** Layout pixels per visual (getBoundingClientRect) pixel; 1 when untransformed. */
    const layoutRatio = (): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      return {
        x: rect.width > 0 && canvas.clientWidth > 0 ? canvas.clientWidth / rect.width : 1,
        y: rect.height > 0 && canvas.clientHeight > 0 ? canvas.clientHeight / rect.height : 1,
      }
    }

    const localPoint = (event: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect()
      const ratio = layoutRatio()
      return { x: (event.clientX - rect.left) * ratio.x, y: (event.clientY - rect.top) * ratio.y }
    }

    const endPointer = (event: PointerEvent): void => {
      if (activePointer !== event.pointerId) return
      const wasDragging = dragging
      activePointer = null
      dragging = false
      canvas.classList.remove('dragging')
      canvas.style.transform = ''
      try {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      } catch {}
      if (wasDragging) {
        const dragOptions = dragActorId ? { actorId: dragActorId } : {}
        hero?.emit('drag.end', dragOptions)
        hero?.emit('land', dragOptions)
      }
      dragActorId = undefined
    }

    canvas.addEventListener('pointerdown', (event) => {
      if (!hero || event.button !== 0) return
      onEnsureAudio()
      activePointer = event.pointerId
      startX = event.clientX
      startY = event.clientY
      startedAt = now()
      dragging = false
      const point = localPoint(event)
      dragActorId = hero.hitActor(point.x, point.y)?.id
      try {
        canvas.setPointerCapture(event.pointerId)
      } catch {}
      event.preventDefault()
    })

    canvas.addEventListener('pointermove', (event) => {
      if (!hero || activePointer !== event.pointerId) return
      const dx = event.clientX - startX
      const dy = event.clientY - startY
      // In the desktop window a drag must move the window itself, not leave a
      // sprite translated in place (the latter made switching from folded paper
      // to a hero character look like "dragging stopped working"). The local
      // sprite-follow path stays for browser/QA builds.
      if (!dragging && !windowDrag && shouldStartWindowDrag(HAS_TAURI, Math.hypot(dx, dy))) {
        windowDrag = true
        const point = localPoint(event)
        const target = hero.hitActor(point.x, point.y)
        dragActorId = target?.id ?? dragActorId
        const dragOptions = dragActorId ? { actorId: dragActorId } : {}
        hero.emit('drag.start', dragOptions)
        activePointer = null
        canvas.classList.remove('dragging')
        canvas.style.transform = ''
        try {
          if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
        } catch {}
        const actorId = dragActorId
        void startWindowDrag()
          .catch((error: unknown) => {
            console.warn('[pet] native window drag unavailable', error)
          })
          .finally(() => {
            // The OS move loop ends before the next pointer sequence. Finish the
            // semantic drag so animations/state settle and a later press is clean.
            try {
              if (actorId) {
                hero?.emit('drag.end', { actorId })
                hero?.emit('land', { actorId })
              } else {
                hero?.emit('drag.end')
                hero?.emit('land')
              }
            } catch {}
            dragActorId = undefined
            windowDrag = false
          })
        return
      }
      if (!dragging && Math.hypot(dx, dy) >= 4) {
        dragging = true
        canvas.classList.add('dragging')
        const point = localPoint(event)
        const target = hero.hitActor(point.x, point.y)
        dragActorId = target?.id ?? dragActorId
        hero.emit('drag.start', dragActorId ? { actorId: dragActorId } : {})
      }
      // Phase 2: the sprite follows the pointer locally and snaps back on
      // pointerup (not persisted; no window dragging from the canvas). Translate
      // in layout px so a CSS-scaled stage (desktop shell) keeps pointer tracking.
      if (dragging) {
        const ratio = layoutRatio()
        canvas.style.transform = `translate(${dx * ratio.x}px, ${dy * ratio.y}px)`
      }
    })

    canvas.addEventListener('pointerup', (event) => {
      if (windowDrag) return
      if (!hero || activePointer !== event.pointerId) return
      const wasDragging = dragging
      const elapsed = now() - startedAt
      if (!wasDragging && elapsed < 500) {
        const point = localPoint(event)
        // Region hit-test first (art-pixel rects, zoom-independent). Packs with a
        // regions.json only react inside their declared zones/state whitelist; a
        // tap on a transparent/undefined area is intentionally a no-op instead
        // of a whole-body pat. Legacy packs without regions keep the old pat.
        const hit = hero.hitRegion(point.x, point.y)
        if (hit) {
          const nowMs = now()
          const key = `${hit.actor.id}:${hit.region.id}`
          const lastRegionAt = lastRegionTouchAt.get(key) ?? Number.NEGATIVE_INFINITY
          if (nowMs - lastHeroTouchAt < HERO_TOUCH_COOLDOWN_MS || nowMs - lastRegionAt < HERO_REGION_COOLDOWN_MS) {
            endPointer(event)
            return
          }
          lastHeroTouchAt = nowMs
          lastRegionTouchAt.set(key, nowMs)
          const state = hero.actorState(hit.actor.id) ?? 'idle'
          const config = hit.actor.bundle.regions
          const reaction = config ? resolveHeroRegionReaction(config, hit.region.id, state, 'tap') : null
          if (reaction) onRegionTouch(hit.actor.id, reaction)
        } else {
          const target = hero.hitActor(point.x, point.y)
          if (target && !target.bundle.regions) onPat(target.id)
          else if (!target) hero.emit('click')
        }
      }
      endPointer(event)
    })

    canvas.addEventListener('pointercancel', (event) => endPointer(event))
    canvas.addEventListener('pointerenter', () => {
      if (activePointer === null) hero?.emit('hover')
    })
    canvas.addEventListener('pointerleave', () => {
      if (activePointer === null) hero?.emit('leave')
    })
  }

  async function startHeroPage(): Promise<void> {
    setHeroStatus(heroStatus(HERO_CONFIG, null))
    // First-run/boot state: the DOM says "loading" while the opt-in renderer
    // loads its first frame; the default (flag-off) path stays quiet.
    setHeroPlaceholder(heroPlaceholderView(HERO_CONFIG.enabled ? 'loading' : 'disabled'))
    if (!HERO_CONFIG.enabled) return
    const stage = document.getElementById('hero-stage')
    const requestedRaw = new URLSearchParams(pageLocation?.search ?? '').get('character')?.trim().toLowerCase() ?? null
    // DLC/pack id is used to build `/characters/<id>/`: validate it as ONE safe
    // relative path segment before any path concatenation (security path-safety).
    const requestedPath = requestedRaw ? checkRelativePath(requestedRaw, { maxSegments: 1, maxChars: 64 }) : null
    const requestedCharacter = requestedPath?.ok && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(requestedPath.normalized)
      ? requestedPath.normalized
      : null
    // Known 0.1/0.2 characters use the canvas path. Any other safe id is treated
    // as an FCI 0.3 behavior-only pack preview (e.g. imported L2 packs); no art is
    // faked and the existing canvas path is untouched.
    if (requestedCharacter && !isHeroCharacterId(requestedCharacter)) {
      if (!stage) {
        fallbackHero('behavior-preview-failed: hero-stage missing')
        return
      }
      // Non-built-in character ids are DLC/pack loads: show the FULL TOS for this
      // specific load and abort to the built-in folded-paper pet when declined.
      const gate = getGate()
      if (!gate) {
        fallbackHero('consent-runtime-missing')
        return
      }
      let preview: Awaited<ReturnType<typeof startTinglanPreview>>
      try {
        preview = await loadPackWithConsent(gate, requestedCharacter, () =>
          startPreview(stage, `/characters/${requestedCharacter}/`),
        )
      } catch (error) {
        if (error instanceof ConsentDeclinedError) {
          fallbackHero('consent-declined: character-pack')
          return
        }
        throw error
      }
      if (!preview.ok) {
        fallbackHero(preview.reason ?? 'behavior-preview-failed')
        return
      }
      document.documentElement.dataset.petRender = 'tinglan-preview'
      setHeroStatus({ enabled: true, ok: true, reason: `behavior-preview:${requestedCharacter}` })
      setHeroPlaceholder(heroPlaceholderView('ready'))
      return
    }
    const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement | null
    try {
      if (!stage || !canvas) throw new Error('hero-stage/hero-canvas missing from pet.html')
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('hero canvas has no 2d context')
      const book = document.querySelector('.book')
      const rect = book?.getBoundingClientRect()
      const hour = new Date().getHours()
      const night = hour >= 23 || hour < 6
      const stageSize = { width: rect?.width ?? windowLike.innerWidth, height: rect?.height ?? windowLike.innerHeight }
      // DPR is clamped: a fake/very high DPR would allocate a huge backing store.
      const dpr = Number.isFinite(windowLike.devicePixelRatio)
        ? Math.min(3, Math.max(1, windowLike.devicePixelRatio))
        : 1
      const runtimeOptions = {
        config: HERO_CONFIG,
        canvas,
        ctx,
        stage: stageSize,
        dpr,
        sleeping: night,
      }
      // P1-4: a non-built-in hero character (e.g. ?character=tinglan, which is a
      // non-final DLC concept preview) must pass the same full-TOS per-load gate as
      // other character packs. Built-in humanoid/cat/dog stay covered by the
      // first-run TOS and are deliberately exempt from the per-load prompt.
      let result: Awaited<ReturnType<typeof startHeroRuntime>>
      if (!isBuiltinCharacterId(HERO_CONFIG.character)) {
        const gate = getGate()
        if (!gate) {
          fallbackHero('consent-runtime-missing')
          return
        }
        try {
          result = await loadPackWithConsent(gate, HERO_CONFIG.character, () => startRuntime(runtimeOptions))
        } catch (error) {
          if (error instanceof ConsentDeclinedError) {
            fallbackHero('consent-declined: character-pack')
            return
          }
          throw error
        }
      } else {
        result = await startRuntime(runtimeOptions)
      }
      if (!result.ok) {
        fallbackHero(result.reason, result.error)
        return
      }
      hero = result.runtime
      heroCanvasEl = canvas
      heroCtx = ctx
      heroNight = night
      heroStageSize = stageSize
      heroDpr = dpr
      // The booted scene is the shipped built-in renderer until the installer
      // restores a persisted pack appearance below (task-111).
      heroSceneBuiltin = true
      activeCharacterPackId = null
      activeCharacterPackKind = null
      attachHeroPointer(canvas)
      // Atomic switch only after the first frame succeeded: unhide the stage,
      // then hide `#pet` via CSS (rect kept); the bubble/buttons keep working.
      stage.hidden = false
      document.documentElement.dataset.petRender = 'hero'
      // MB-050: the desktop shell may have applied the hero fit before this
      // canvas had a layout size (the stage was hidden and the canvas CSS size
      // only exists after the first pack frame), which kept the unclamped hero
      // zoom and pushed the scaled canvas above the window top. Now that the
      // stage is visible and the canvas size is final, re-run the viewport fit.
      requestDesktopShellScaleRefit()
      // QA hook: the fitted CSS canvas/display scale (e.g. 256x256@1 or
      // 128x128@0.125), plus the device-pixel backing store ratio.
      document.documentElement.dataset.heroCanvas = `${result.runtime.layout.width}x${result.runtime.layout.height}`
      document.documentElement.dataset.heroScale = String(result.runtime.layout.scale)
      document.documentElement.dataset.heroDpr = String(canvas.width / Math.max(1, result.runtime.layout.width))
      setHeroStatus(heroStatus(HERO_CONFIG, result))
      setHeroPlaceholder(heroPlaceholderView('ready'))
      heroSceneNow = 0
      document.addEventListener('visibilitychange', () => {
        if (!hero) return
        if (document.visibilityState === 'hidden') stopHeroLoop()
        else startHeroLoop()
      })
      startHeroLoop()
      // task-111: re-apply the persisted character-pack appearance WITHOUT a page
      // reload. The content runtime may still be loading; the call awaits it, then
      // the installer either hot-swaps the pack or honestly leaves the built-in.
      void restoreActiveCharacterPack()
        .then((result) => {
          if (result === null || result.ok) return
          console.warn('[pet] character-pack appearance restore left the built-in renderer:', result.message)
          document.documentElement.dataset.characterPackRestore = 'builtin-fallback'
        })
        .catch((error: unknown) => {
          console.warn('[pet] character-pack appearance restore failed', error)
        })
    } catch (error) {
      fallbackHero(`start-failed: ${error instanceof Error ? error.message : String(error)}`, error)
    }
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  return {
    startPage: startHeroPage,
    restoreBuiltin: restoreBuiltinHero,
    hotSwap: hotSwapHeroCharacterPack,
    isRendererReady: isHeroRendererReady,
    rendererWiring: characterPackRendererWiring,
    currentCharacterCanVoice,
    currentCharacterBubbleSemantic,
    getRuntime: () => hero,
    emit,
    speak,
    setExpression,
    syncRenderState,
    liveRegionActions,
    snapshot,
    isActive: () => hero !== null,
    activePackIdentity: () => activeCharacterPackId,
    activePackKind: () => activeCharacterPackKind,
    scene,
    installWindowLayout,
    saveWindowPosition,
    restoreWindowPosition,
    clearSavedWindowPosition,
  }
}
