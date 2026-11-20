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
  type HeroCharacterId,
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
import {
  installRuntimeViewportWatch,
  requestDesktopShellScaleRefit,
  type RuntimeViewportChangeReason,
  type RuntimeViewportWatchWindow,
} from './desktop-shell.ts'
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

/**
 * Built-in renderer choice (E4 MB-041): the three shipped hero characters plus
 * the folded-paper DOM. Mirrors `PetRendererChoice` in desktop-shell.ts; kept
 * as a local union so hero-page stays import-light and Node-test friendly.
 */
export type BuiltinRendererChoice = 'dog' | 'cat' | 'humanoid' | 'origami'

/**
 * Cross-window built-in renderer bridge (E4 MB-041). The independent content
 * window has no hero canvas: it persists the role, asks the pet window (the only
 * hero owner) to hot-switch its scene, and waits for the apply result so a failed
 * switch can be rolled back in both windows. Mirrors the installed-pack
 * CHARACTER_PACK_APPLY_EVENT contract.
 */
export const BUILTIN_RENDERER_APPLY_EVENT = 'pet://builtin-renderer-apply'
export const BUILTIN_RENDERER_APPLIED_EVENT = 'pet://builtin-renderer-applied'

export interface BuiltinRendererApplyRequest {
  readonly requestId: string
  readonly choice: BuiltinRendererChoice
}

export interface BuiltinRendererApplyResult {
  readonly requestId: string
  readonly ok: boolean
  /** Visible reason when `ok` is false (already sanitized by the pet window). */
  readonly message?: string
}

/** Outcome of one live built-in renderer switch (no persist, no reload). */
export type BuiltinRendererSwapResult =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly reason: string }

/** Result of one live built-in renderer application (visible message only). */
export interface BuiltinRendererApplyOutcome {
  readonly ok: boolean
  readonly message?: string
}

/** Timeout for one cross-window built-in renderer request (fail closed). */
const BUILTIN_RENDERER_REQUEST_TIMEOUT_MS = 8_000
/** The shipped choices; anything else must stay behind the per-load consent gate. */
const BUILTIN_RENDERER_CHOICES: readonly BuiltinRendererChoice[] = ['dog', 'cat', 'humanoid', 'origami']
let remoteBuiltinRendererRequestSeq = 0

export function isBuiltinRendererChoice(value: unknown): value is BuiltinRendererChoice {
  return typeof value === 'string' && (BUILTIN_RENDERER_CHOICES as readonly string[]).includes(value)
}

/**
 * Content-window side of the MB-041 bridge (standalone so the content runtime can
 * call it without importing the page singleton): ask the pet window, which owns
 * the only hero canvas, to hot-switch a built-in renderer, and wait for its REAL
 * apply result so a failed switch rolls the persisted role back in both windows.
 */
export function requestRemoteBuiltinRenderer(
  choice: BuiltinRendererChoice,
  options: { readonly hasTauri: boolean; readonly contentShell: boolean },
): Promise<BuiltinRendererApplyOutcome> {
  if (!options.hasTauri || !options.contentShell) {
    return Promise.resolve({ ok: false, message: '当前窗口没有接入实时渲染切换' })
  }
  return new Promise((resolve) => {
    let settled = false
    let unlisten: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const finish = (result: BuiltinRendererApplyOutcome): void => {
      if (settled) return
      settled = true
      if (timer !== null) clearTimeout(timer)
      try {
        unlisten?.()
      } catch {
        /* listener teardown is best effort */
      }
      resolve(result)
    }
    void import('@tauri-apps/api/event')
      .then(async ({ emit, listen }) => {
        remoteBuiltinRendererRequestSeq += 1
        const requestId = 'builtin-' + Date.now().toString(36) + '-' + String(remoteBuiltinRendererRequestSeq)
        unlisten = await listen<BuiltinRendererApplyResult>(BUILTIN_RENDERER_APPLIED_EVENT, (event) => {
          const payload = event.payload
          if (!payload || payload.requestId !== requestId) return
          finish(
            payload.ok
              ? { ok: true, ...(payload.message !== undefined ? { message: payload.message } : {}) }
              : { ok: false, message: payload.message ?? '桌宠窗口未能切换渲染器' },
          )
        })
        timer = setTimeout(
          () => finish({ ok: false, message: '桌宠窗口没有响应，渲染器未切换' }),
          BUILTIN_RENDERER_REQUEST_TIMEOUT_MS,
        )
        const request: BuiltinRendererApplyRequest = { requestId, choice }
        await emit(BUILTIN_RENDERER_APPLY_EVENT, request)
      })
      .catch((error: unknown) => {
        console.warn('[pet] built-in renderer bridge unavailable', error)
        finish({ ok: false, message: '跨窗口切换通道不可用，渲染器未切换' })
      })
  })
}

/** Identity of one installed character pack applied to the live hero scene. */
export interface HeroCharacterPackIdentity {
  readonly packId: string
  readonly version: string
  readonly name: string
  readonly kind: CharacterPackKind
}

/** Minimal cross-window drag seam (production: Tauri `getCurrentWindow().startDragging()`). */
export type HeroWindowDrag = () => Promise<unknown>

/** Supported hero backing-store DPR range (same clamp used at boot). */
export const HERO_DPR_MIN = 1
export const HERO_DPR_MAX = 3

/**
 * Clamp a `window.devicePixelRatio`-like value to the hero backing-store budget
 * (MB-046). A fake/very high DPR must never allocate an unbounded bitmap, and a
 * missing/non-finite/zero value falls back to 1 CSS-raster pixel. This is the
 * single capture rule used at boot, on every runtime DPR change and by the Tauri
 * scale-factor hooks.
 */
export function clampHeroDevicePixelRatio(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(HERO_DPR_MAX, Math.max(HERO_DPR_MIN, value))
    : 1
}

/** Why the next hero frame must re-check the raster/layout (MB-046). */
type HeroRuntimeViewportReason =
  | RuntimeViewportChangeReason
  | 'runtime-viewport'
  | 'tauri-scale-factor'
  | 'tauri-moved'
  | 'dpr-poll'

/** The subset of `@tauri-apps/api/window` used by the window-position helpers. */
export interface TauriWindowModule {
  getCurrentWindow(): {
    outerPosition(): Promise<{ x: number; y: number }>
    setPosition(position: unknown): Promise<void>
    /**
     * Tauri v2 window events (MB-046): `onScaleChanged` (the JS name for the
     * `ScaleFactorChanged` event) fires when the OS display scale changes as
     * the pet window crosses a monitor with different Windows scaling, and
     * `onMoved` fires while it is dragged across screens. Optional so older
     * Tauri builds, browser fakes and the content-window path stay usable.
     */
    onScaleChanged?(handler: (event: { payload?: { scaleFactor?: number } }) => void): Promise<unknown> | unknown
    onMoved?(handler: (event: { payload?: { x: number; y: number } }) => void): Promise<unknown> | unknown
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

/**
 * Live idle-rhythm plan for the hero scene (C1 2026-11-21; see
 * src/pet/low-disturb.ts). The effective level is resolved by main.ts from the
 * persisted cadence, quiet hours, a 一起工作 session and the Advisers pose flag;
 * this page only applies the resulting plan to the live scene.
 */
export interface HeroAmbientRhythm {
  /** Interval drawn for each remaining ambient state while idle. */
  readonly intervalMs: readonly [number, number]
  /** Ambient states allowed; null = keep the character's authored pool. */
  readonly states: readonly string[] | null
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
  /**
   * Live idle-rhythm resolver (待机节奏). Absent on dev/other pages, which keeps
   * the authored behavior.json ambient window untouched.
   */
  readonly resolveAmbientRhythm?: () => HeroAmbientRhythm | null
  /** Re-apply the persisted pack appearance after the built-in hero booted. */
  restoreActiveCharacterPack(): Promise<CharacterPackActionOutcome | null>
  /**
   * Pet-window implementation for a REMOTE built-in renderer request (E4
   * MB-041), supplied by main.ts (content-runtime hot swap + voice sync). When
   * present the page installs the Tauri request/ack bridge once at construction.
   */
  readonly applyRemoteBuiltinRenderer?: (choice: BuiltinRendererChoice) => Promise<BuiltinRendererApplyOutcome>
  /** Storage override for the persisted window position (tests); default global. */
  readonly storage?: StorageLike | null
  // Testable seams: production omits them and gets the real page globals/modules.
  readonly now?: () => number
  readonly requestFrame?: (callback: FrameRequestCallback) => number
  readonly cancelFrame?: (handle: number) => void
  readonly scheduleTimeout?: (callback: () => void, timeoutMs?: number) => unknown
  /** Cancel a pending idle wake-up timer (test seam; default global clearTimeout). */
  readonly cancelTimeout?: (handle: unknown) => void
  readonly loadTauriWindow?: () => Promise<TauriWindowModule>
  readonly startWindowDrag?: HeroWindowDrag
  /** Test seam for the desktop-shell late-layout refit; default global hook. */
  readonly requestScaleRefit?: () => void
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
  /**
   * Hot-switch the live built-in renderer (E4 MB-041): a hero character loads its
   * shipped bundle and atomically replaces the scene; `origami` returns to the
   * folded-paper DOM. Never persists and never reloads. On failure the current
   * scene keeps rendering (or the folded paper stays visible) and the result is
   * `ok:false` with a stable reason.
   */
  switchBuiltinRenderer(choice: BuiltinRendererChoice): Promise<BuiltinRendererSwapResult>
  /** Live built-in character backing the scene ('origami' when folded paper shows). */
  builtinRenderer(): BuiltinRendererChoice
  /**
   * Content window side of the MB-041 bridge: ask the pet window to hot-switch
   * and resolve with its real apply result (fails closed after a timeout).
   */
  requestRemoteBuiltinRenderer(choice: BuiltinRendererChoice): Promise<BuiltinRendererApplyOutcome>
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
  const clearTimeoutFn = deps.cancelTimeout ?? ((handle: unknown): void => clearTimeout(handle as ReturnType<typeof setTimeout>))
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
  const resolveAmbientRhythm = deps.resolveAmbientRhythm
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
  /**
   * MB-046 runtime reconfiguration state. A monitor/DPI/media-query/Tauri
   * signal only marks the next hero frame dirty; the frame itself re-captures
   * the DPR, re-rasterises the canvas and asks the desktop shell to re-fit.
   */
  let runtimeViewportDirty = false
  let runtimeViewportReason: HeroRuntimeViewportReason = 'runtime-viewport'
  /** Disarm for the page-level media-query/resize/visualViewport watcher. */
  let runtimeViewportDisarm: (() => void) | null = null
  /** True once the Tauri native scale/move listeners were requested. */
  let nativeViewportWatchInstalled = false
  /** Coalesces the Tauri move-event burst into at most one deferred re-check. */
  let nativeViewportRecheckPending = false
  /** True while the live hero scene is the shipped built-in character. */
  let heroSceneBuiltin = true
  /** Identity of the installed pack the live hero scene was built from. */
  let activeCharacterPackId: { packId: string; version: string } | null = null
  /** Pack kind currently rendered (drives silent-thought / locomotion semantics). */
  let activeCharacterPackKind: CharacterPackKind | null = null
  /**
   * Live built-in character backing the hero scene (E4 MB-041). Starts from the
   * boot-time resolver and follows every live built-in hot switch; unlike
   * HERO_CONFIG it is mutable, so voice/bubble/locomotion semantics never go
   * stale after a switch (no reload re-runs resolveHeroConfig).
   */
  let liveBuiltinCharacter: HeroCharacterId = HERO_CONFIG.character
  /** True once the hidden hero canvas got its pointer listeners (attach once). */
  let heroPointerAttached = false
  /** True once the document visibilitychange loop park/resume listener is wired. */
  let heroVisibilityWired = false
  /** True once the pet-window remote built-in renderer bridge is installed (MB-041). */
  let remoteBuiltinBridgeInstalled = false

  /** Cat/dog personas are silent: their bubbles are thoughts and TTS is skipped. */
  function currentCharacterCanVoice(): boolean {
    if (activeCharacterPackKind !== null) return activeCharacterPackKind === 'humanoid'
    // Folded paper (hero not drawing) is the shipped human presentation: voiced.
    if (hero === null) return true
    return characterCanVoice(liveBuiltinCharacter, true)
  }

  /** Visible bubble semantics for a custom pack: cat/dog = thought, humanoid = speech. */
  function currentCharacterBubbleSemantic(): 'speech' | 'thought' {
    if (activeCharacterPackKind !== null) return activeCharacterPackKind === 'humanoid' ? 'speech' : 'thought'
    if (hero === null) return 'speech'
    return characterBubbleSemantic(liveBuiltinCharacter, true)
  }
  let hero: HeroRuntime | null = null
  let heroCanvasEl: HTMLCanvasElement | null = null
  let heroCtx: CanvasRenderingContext2D | null = null
  let heroRaf: number | null = null
  /** 按需帧率 (P1): pending idle wake-up timer; heroRaf is null while it is set. */
  let heroIdleTimer: unknown = null
  let heroSceneNow = 0
  let heroLastFrameMs = 0
  let heroNight = false
  /** Idle-rhythm sync cadence: the plan is re-read at most once a second. */
  const HERO_IDLE_RHYTHM_SYNC_MS = 1000
  /** Key of the plan currently applied to the live scene (null = none yet). */
  let idleRhythmAppliedKey: string | null = null
  /** Scene-clock timestamp of the last plan read (throttle; -Inf = first frame). */
  let idleRhythmSyncedAt = Number.NEGATIVE_INFINITY
  /** Authored ambient pool saved before a filtered plan replaced it (per profile). */
  const authoredAmbient = new WeakMap<
    object,
    { intervalMs: [number, number]; choices: Array<{ state: string; weight: number }> }
  >()
  /** Cat/dog run locomotion: CSS translate/scale on the canvas, reset on idle. */
  const heroMove = { offset: 0, dir: 1 as 1 | -1, active: false }

  /** Pointer hover dwell before the hover.dwell reaction fires (C1). */
  const HERO_HOVER_DWELL_MS = 800
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

  // -------------------------------------------------------------------------
  // Idle rhythm / 待机节奏 (C1 2026-11-21)
  // -------------------------------------------------------------------------

  /** Stable key of one plan (apply only when the effective level changes). */
  function idleRhythmKey(plan: HeroAmbientRhythm): string {
    const states = plan.states === null ? '*' : plan.states.join(',')
    return plan.intervalMs[0] + '-' + plan.intervalMs[1] + ':' + states
  }

  /**
   * Apply one plan to every actor's ambient pool. The authored pool is captured
   * once per profile (WeakMap) so switching back from 安静 restores it exactly;
   * `choices = []` disables ambient scheduling for a character whose pack has
   * no allowed state (third-party / future packs). `nextAmbientAtMs = null`
   * makes SceneRuntime re-draw the interval on its next idle behaviour step, so
   * a live level change takes effect without a reload.
   */
  function applyIdleRhythm(plan: HeroAmbientRhythm): boolean {
    const runtime = hero
    if (!runtime) return false
    const scene = runtime.scene
    if (!scene || typeof scene.get !== 'function') return false
    for (const actor of runtime.actors) {
      let sceneActor: ReturnType<typeof scene.get>
      try {
        sceneActor = scene.get(actor.id)
      } catch {
        continue
      }
      const ambient = sceneActor?.profile?.ambient
      if (!ambient) continue
      let authored = authoredAmbient.get(ambient)
      if (authored === undefined) {
        authored = {
          intervalMs: [ambient.intervalMs[0], ambient.intervalMs[1]],
          choices: ambient.choices.map((choice) => ({ state: choice.state, weight: choice.weight })),
        }
        authoredAmbient.set(ambient, authored)
      }
      const allowed =
        plan.states === null
          ? authored.choices
          : authored.choices.filter((choice) => plan.states !== null && plan.states.includes(choice.state))
      ambient.choices = allowed.map((choice) => ({ state: choice.state, weight: choice.weight }))
      ambient.intervalMs = allowed.length > 0 ? [plan.intervalMs[0], plan.intervalMs[1]] : [0, 0]
      sceneActor.nextAmbientAtMs = null
    }
    return true
  }

  /** Throttled frame-loop hook: read the effective plan and apply it on change. */
  function syncIdleRhythm(sceneNowMs: number): void {
    if (resolveAmbientRhythm === undefined) return
    if (sceneNowMs - idleRhythmSyncedAt < HERO_IDLE_RHYTHM_SYNC_MS) return
    idleRhythmSyncedAt = sceneNowMs
    if (!hero) return
    let plan: HeroAmbientRhythm | null = null
    try {
      plan = resolveAmbientRhythm()
    } catch {
      return
    }
    if (!plan) return
    const key = idleRhythmKey(plan)
    if (key === idleRhythmAppliedKey) return
    if (applyIdleRhythm(plan)) idleRhythmAppliedKey = key
  }

  /** New scene committed/removed: the next frame re-applies the live plan. */
  function resetIdleRhythm(): void {
    idleRhythmAppliedKey = null
    idleRhythmSyncedAt = Number.NEGATIVE_INFINITY
  }

  function snapshot(): HeroSnapshot | null {
    return hero ? hero.snapshot() : null
  }

  function scene(): HeroPageScene {
    return hero === null ? 'folded-paper' : heroSceneBuiltin ? 'builtin-hero' : 'character-pack'
  }

  /** Live built-in renderer truth (MB-041); folded paper reports 'origami'. */
  function builtinRenderer(): BuiltinRendererChoice {
    if (hero === null) return 'origami'
    // The legacy non-final 'tinglan' character shares the humanoid presentation.
    return liveBuiltinCharacter === 'tinglan' ? 'humanoid' : liveBuiltinCharacter
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

  /**
   * Pet-window side of the MB-041 built-in renderer bridge: listen for a remote
   * request, run the injected local handler (content runtime switch + voice sync,
   * so the whole role changes without a reload) and ack with the REAL result.
   * Installed once; idempotent. The content window times out to a rollback.
   */
  function installRemoteBuiltinRendererBridge(
    handler: (choice: BuiltinRendererChoice) => Promise<BuiltinRendererApplyOutcome>,
  ): void {
    if (!HAS_TAURI || CONTENT_SHELL || remoteBuiltinBridgeInstalled) return
    remoteBuiltinBridgeInstalled = true
    void import('@tauri-apps/api/event')
      .then(async ({ emit, listen }) => {
        await listen<BuiltinRendererApplyRequest>(BUILTIN_RENDERER_APPLY_EVENT, (event) => {
          const payload = event.payload
          if (!payload || !isBuiltinRendererChoice(payload.choice)) return
          const requestId = typeof payload.requestId === 'string' ? payload.requestId : ''
          void handler(payload.choice)
            .then(async (result) => {
              if (requestId === '') return
              const ack: BuiltinRendererApplyResult = {
                requestId,
                ok: result.ok,
                ...(result.message !== undefined ? { message: result.message } : {}),
              }
              await emit(BUILTIN_RENDERER_APPLIED_EVENT, ack)
            })
            .catch((error: unknown) => {
              console.warn('[pet] built-in renderer apply failed', error)
              if (requestId === '') return
              void emit(BUILTIN_RENDERER_APPLIED_EVENT, {
                requestId,
                ok: false,
                message: '桌宠窗口切换渲染器时发生错误',
              } satisfies BuiltinRendererApplyResult).catch(() => {
                /* best effort ack; the content window times out to a rollback anyway */
              })
            })
        })
      })
      .catch((error: unknown) => {
        console.warn('[pet] built-in renderer bridge unavailable', error)
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

  // ---------------------------------------------------------------------------
  // Runtime DPR / multi-monitor reconfiguration (MB-046)
  // ---------------------------------------------------------------------------
  // The pet window has a fixed 480x336 CSS layout. Crossing to a monitor with
  // a different Windows display scale (or changing the system scale while it
  // runs) changes devicePixelRatio only: the WebView layout viewport, and thus
  // the hero stage, stay in CSS pixels. The hero canvas backing store was
  // captured once at boot, so without this section the pet would stay at the
  // old raster density until a reload. Everything below is idempotent and
  // error-contained: a monitor hot-plug or a cross-screen drag must never crash
  // the page (the previous bitmap/scene is kept when a re-raster fails).

  /** The desktop shell's late-layout re-fit hook (test seam overridable). */
  const requestScaleRefit = (): void => {
    if (deps.requestScaleRefit !== undefined) {
      deps.requestScaleRefit()
      return
    }
    requestDesktopShellScaleRefit()
  }

  /** Mark the next hero frame as needing a DPR/stage re-check. */
  function markRuntimeViewportDirty(reason: HeroRuntimeViewportReason): void {
    runtimeViewportDirty = true
    runtimeViewportReason = reason
  }

  /** Re-capture the live window DPR with the same 1-3 clamp used at boot. */
  function currentRuntimeDpr(): number {
    return clampHeroDevicePixelRatio((windowLike as unknown as { devicePixelRatio?: unknown }).devicePixelRatio)
  }

  /** Measure the hero stage in CSS pixels; the last boot measurement is the fallback. */
  function measureHeroStage(): { width: number; height: number } {
    try {
      const rect = document.querySelector('.book')?.getBoundingClientRect()
      if (rect !== undefined && rect.width > 0 && rect.height > 0) {
        return { width: rect.width, height: rect.height }
      }
    } catch {
      /* unmeasurable layout: keep the last known stage instead of throwing */
    }
    return heroStageSize ?? {
      width: windowLike.innerWidth || 480,
      height: windowLike.innerHeight || 336,
    }
  }

  /**
   * Resize one hero canvas to `layout CSS x DPR` and re-apply the DPR
   * transform. Assigning width/height resets the whole 2D context state (the
   * transform and imageSmoothing included), so both are restored right away and
   * backends can keep drawing in CSS pixels.
   */
  function applyHeroCanvasBackingStore(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    layout: HeroRuntime['layout'],
    dpr: number,
  ): void {
    canvas.width = Math.max(1, Math.round(layout.width * dpr))
    canvas.height = Math.max(1, Math.round(layout.height * dpr))
    canvas.style.width = `${layout.width}px`
    canvas.style.height = `${layout.height}px`
    ctx.setTransform?.(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = false
  }

  /**
   * Re-capture DPR + stage after a viewport signal, rebuild the canvas backing
   * store and re-run the window fit. Never throws: a failed re-raster restores
   * the previous bitmap/transform and leaves the live scene running (the next
   * frame retries), so switching monitors cannot take the pet page down.
   * Returns true when the canvas/window layout actually changed.
   */
  function applyRuntimeViewportReconfigure(reason: HeroRuntimeViewportReason): boolean {
    const runtime = hero
    const canvas = heroCanvasEl
    const ctx = heroCtx
    if (runtime === null || canvas === null || ctx === null) {
      runtimeViewportDirty = false
      return false
    }
    const nextDpr = currentRuntimeDpr()
    const stage = measureHeroStage()
    const previousStage = heroStageSize
    const stageChanged =
      previousStage === null ||
      Math.abs(previousStage.width - stage.width) > 0.5 ||
      Math.abs(previousStage.height - stage.height) > 0.5
    heroStageSize = stage
    const dprChanged = nextDpr !== heroDpr
    if (!dprChanged && !stageChanged) return false
    const previous = {
      width: canvas.width,
      height: canvas.height,
      styleWidth: canvas.style.width,
      styleHeight: canvas.style.height,
      renderKey: canvas.dataset.heroRenderKey,
      frameKey: canvas.dataset.heroFrameKey,
      dpr: heroDpr,
    }
    try {
      applyHeroCanvasBackingStore(canvas, ctx, runtime.layout, nextDpr)
      heroDpr = nextDpr
      delete canvas.dataset.heroRenderKey
      delete canvas.dataset.heroFrameKey
      // Repaint immediately: resizing the backing store clears it and waiting
      // for the next rAF would flash an empty canvas on screen.
      runtime.render(ctx, heroSceneNow)
    } catch (error) {
      try {
        canvas.width = previous.width
        canvas.height = previous.height
        canvas.style.width = previous.styleWidth
        canvas.style.height = previous.styleHeight
        ctx.setTransform?.(previous.dpr, 0, 0, previous.dpr, 0, 0)
        ctx.imageSmoothingEnabled = false
        if (previous.renderKey === undefined) delete canvas.dataset.heroRenderKey
        else canvas.dataset.heroRenderKey = previous.renderKey
        if (previous.frameKey === undefined) delete canvas.dataset.heroFrameKey
        else canvas.dataset.heroFrameKey = previous.frameKey
      } catch {
        /* keeping the previous bitmap is best-effort; the loop still runs */
      }
      heroDpr = previous.dpr
      console.warn('[pet] runtime DPR reconfiguration failed', reason, error)
      return false
    }
    // QA/CDP truth: the live raster ratio (the boot path writes the same key).
    document.documentElement.dataset.heroDpr = String(nextDpr)
    // The window fit uses the same late layout as the hero boot (MB-050);
    // re-run it so a cross-screen/DPI change can never leave the image at the
    // unclamped zoom.
    requestScaleRefit()
    return true
  }

  /** Install the page-level DPI watcher once (media query + resize + visualViewport). */
  function ensureRuntimeViewportWatch(): void {
    if (runtimeViewportDisarm !== null) return
    runtimeViewportDisarm = installRuntimeViewportWatch(
      windowLike as unknown as RuntimeViewportWatchWindow,
      (reason) => markRuntimeViewportDirty(reason),
    )
  }

  /**
   * Tauri v2 native signals (MB-046): `onScaleFactorChanged` fires when the OS
   * display scale changes across monitors, `onMoved` while the pet window is
   * dragged between them. They only mark the next frame dirty; WebView2 can
   * publish the new devicePixelRatio a tick later, hence the two delayed
   * re-checks. The `(resolution: Ndppx)` media query + per-frame DPR poll stay
   * the primary/verifiable path (CDP can only emulate the web side).
   */
  async function installNativeRuntimeViewportWatch(): Promise<void> {
    if (!HAS_TAURI || CONTENT_SHELL || nativeViewportWatchInstalled) return
    nativeViewportWatchInstalled = true
    try {
      const { getCurrentWindow } = await loadTauriWindow()
      const nativeWindow = getCurrentWindow()
      const scheduleCheck = (reason: HeroRuntimeViewportReason): void => {
        markRuntimeViewportDirty(reason)
        // onMoved fires continuously while the window is dragged across screens;
        // coalesce that burst into one deferred re-check window instead of a
        // timer per OS move event.
        if (nativeViewportRecheckPending) return
        nativeViewportRecheckPending = true
        setTimeoutFn(() => markRuntimeViewportDirty(reason), 50)
        setTimeoutFn(() => {
          nativeViewportRecheckPending = false
          markRuntimeViewportDirty(reason)
        }, 250)
      }
      if (typeof nativeWindow.onScaleChanged === 'function') {
        await nativeWindow.onScaleChanged(() => scheduleCheck('tauri-scale-factor'))
      }
      if (typeof nativeWindow.onMoved === 'function') {
        await nativeWindow.onMoved(() => scheduleCheck('tauri-moved'))
      }
    } catch (error) {
      // Browser build / tests without the Tauri window API: the web watcher
      // and the per-frame DPR poll still cover runtime changes.
      console.warn('[pet] native DPR event hook unavailable', error)
    }
  }

  function installWindowLayout(): void {
    if (!HAS_TAURI || CONTENT_SHELL) return
    setTimeoutFn(() => void restoreWindowPosition(), 600)
    document.querySelector('header')?.addEventListener('pointerup', () => {
      setTimeoutFn(() => void saveWindowPosition(), 160)
    })
    windowLike.addEventListener('beforeunload', () => void saveWindowPosition())
    // MB-046: native Tauri scale-factor/move events (best effort, async).
    void installNativeRuntimeViewportWatch()
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
    if (heroIdleTimer !== null) {
      clearTimeoutFn(heroIdleTimer)
      heroIdleTimer = null
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
    resetIdleRhythm()
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
    // MB-046: re-capture the DPR/stage before drawing this frame when a
    // monitor/DPI signal arrived or the window DPR changed without an event
    // (some WebView2/Tauri cross-screen transitions only update the property).
    // The poll is one property read per frame; the expensive re-raster only
    // runs when something actually changed.
    if (runtimeViewportDirty || currentRuntimeDpr() !== heroDpr) {
      const reason: HeroRuntimeViewportReason = runtimeViewportDirty ? runtimeViewportReason : 'dpr-poll'
      runtimeViewportDirty = false
      try {
        applyRuntimeViewportReconfigure(reason)
      } catch (error) {
        // The helper already restores the previous bitmap on failure; this is
        // the last containment for an unexpected throw from the render backend.
        console.warn('[pet] runtime viewport reconfiguration failed', error)
      }
    }
    const dt = Math.max(0, Math.min(250, timestamp - heroLastFrameMs))
    heroLastFrameMs = timestamp
    // 减少动态 (pet.css tokens + this loop): freeze the scene clock and skip
    // tick/locomotion, so the canvas stays a static pose. Emits/speech still
    // change renderKey, which redraws exactly one still frame below.
    const reducedMotion = document.documentElement.dataset.reduceMotion === '1'
    if (!reducedMotion) heroSceneNow += dt
    try {
      // 待机节奏 (C1): apply the effective ambient plan before the behaviour tick
      // so a level change is visible on this frame's scheduling, not one draw late.
      if (!reducedMotion) syncIdleRhythm(heroSceneNow)
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
    // 按需帧率 (P1 2026-11-21): 6-14 fps art + 4 Hz behaviour do not need 60 Hz.
    // framePlan() keeps the rAF loop for locomotion / one-shot / action / speech
    // / still-decoding clips, and returns a bounded delay only when the idle
    // scene can only change on the next clip frame boundary. Locomotion easing
    // (heroMove) must stay at 60 Hz. typeof guard: the page-level test runtime
    // may be a minimal fake without the scheduler.
    const schedule =
      typeof (hero as { framePlan?: unknown }).framePlan === 'function'
        ? hero.framePlan(heroSceneNow, { reducedMotion })
        : null
    if (heroMove.active || heroMove.offset !== 0 || schedule === null || schedule.delayMs <= 0) {
      heroRaf = requestFrame(heroFrame)
    } else {
      const handle = setTimeoutFn(() => {
        heroIdleTimer = null
        heroFrame(now())
      }, schedule.delayMs)
      heroIdleTimer = handle === undefined ? null : handle
    }
  }

  /**
   * Real left/right travel for cat/dog run clips. The hero canvas is translated
   * inside the transparent window (and mirrored when running left) instead of
   * animating legs in place; idle snaps back. Human and folded-paper are untouched.
   */
  function applyHeroLocomotion(dtMs: number): void {
    const canvas = heroCanvasEl
    if (!canvas || !hero) return
    // Live built-in character (MB-041): a hot-switched dog/cat must still walk;
    // HERO_CONFIG.character is only the boot-time snapshot.
    const canMove =
      activeCharacterPackKind !== null
        ? activeCharacterPackKind === 'cat' || activeCharacterPackKind === 'dog'
        : heroSceneBuiltin && (liveBuiltinCharacter === 'cat' || liveBuiltinCharacter === 'dog')
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
    if (!hero || heroRaf !== null || heroIdleTimer !== null || document.visibilityState === 'hidden') return
    heroLastFrameMs = now()
    heroRaf = requestFrame(heroFrame)
  }

  /** True when the live hero scene can accept a character-pack hot swap. */
  function isHeroRendererReady(): boolean {
    return hero !== null && heroCanvasEl !== null && heroCtx !== null && heroStageSize !== null
  }

  /**
   * Attach the canvas pointer path + the visibility loop park/resume listener.
   * Only called after a scene actually committed (a failed boot must leave the
   * canvas without listeners, as the flag-off/fallback tests assert).
   */
  function ensureHeroInteractions(canvas: HTMLCanvasElement): void {
    if (!heroPointerAttached) {
      heroPointerAttached = true
      attachHeroPointer(canvas)
    }
    if (!heroVisibilityWired) {
      heroVisibilityWired = true
      document.addEventListener('visibilitychange', () => {
        if (!hero) return
        if (document.visibilityState === 'hidden') stopHeroLoop()
        else startHeroLoop()
      })
    }
  }

  /**
   * Acquire the shared hero canvas/2D context/stage + DPR once (idempotent).
   * Booted pages call it from startHeroPage; E4 MB-041 also calls it when a
   * folded-paper page hot-switches to a hero character it never booted at load.
   * It does NOT start a runtime or attach listeners (the first-frame gate and
   * ensureHeroInteractions own those).
   */
  function mountHeroView():
    | { readonly ok: true; readonly canvas: HTMLCanvasElement; readonly ctx: CanvasRenderingContext2D }
    | { readonly ok: false; readonly reason: string } {
    if (heroCanvasEl !== null && heroCtx !== null && heroStageSize !== null) {
      return { ok: true, canvas: heroCanvasEl, ctx: heroCtx }
    }
    const stage = document.getElementById('hero-stage')
    const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement | null
    if (!stage || !canvas) return { ok: false, reason: 'hero-stage/hero-canvas missing from pet.html' }
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext('2d')
    } catch {
      ctx = null
    }
    if (!ctx) return { ok: false, reason: 'hero canvas has no 2d context' }
    const book = document.querySelector('.book')
    const rect = book?.getBoundingClientRect()
    heroStageSize = {
      width: rect?.width ?? windowLike.innerWidth,
      height: rect?.height ?? windowLike.innerHeight,
    }
    const dpr = clampHeroDevicePixelRatio(windowLike.devicePixelRatio)
    heroDpr = dpr
    heroCanvasEl = canvas
    heroCtx = ctx
    return { ok: true, canvas, ctx }
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
    /**
     * Built-in character to render when `identity` is null (E4 MB-041). Defaults
     * to the live character: the public `hotSwap(bundle, null)` restore path and
     * the existing tests keep their exact contract, while a live dog/cat/humanoid
     * switch passes the requested character explicitly.
     */
    builtinCharacter?: HeroCharacterId,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const canvas = heroCanvasEl
    const ctx = heroCtx
    const stage = heroStageSize
    if (canvas === null || ctx === null || stage === null) {
      return { ok: false, reason: 'hero-renderer-not-running' }
    }
    const targetBuiltin = builtinCharacter ?? liveBuiltinCharacter
    // Re-measure the book stage: the window may have been resized since boot.
    const book = document.querySelector('.book')
    const rect = book?.getBoundingClientRect()
    const liveStage =
      rect !== undefined && rect !== null && rect.width > 0 && rect.height > 0
        ? { width: rect.width, height: rect.height }
        : stage
    // Idempotent: the requested pack (or the requested built-in character) is
    // already live. A built-in hot switch to ANOTHER character must rebuild.
    if (identity === null) {
      if (heroSceneBuiltin && hero !== null && liveBuiltinCharacter === targetBuiltin) return { ok: true }
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
    const configCharacter = identity === null ? targetBuiltin : HERO_CONFIG.character
    const config: HeroConfig = {
      enabled: true,
      reason: 'query-on',
      character: configCharacter,
      actors: [configCharacter],
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
    resetIdleRhythm()
    heroSceneBuiltin = identity === null
    if (identity === null) liveBuiltinCharacter = targetBuiltin
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
    ensureHeroInteractions(canvas)
    requestScaleRefit()
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
      // Restore the LIVE built-in character (E4 MB-041): after a live built-in
      // switch the shipped scene is no longer HERO_CONFIG.character.
      bundle = await loadBundle(liveBuiltinCharacter)
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
    return { ok: true, message: '已恢复内置 hero 角色「' + liveBuiltinCharacter + '」。' }
  }

  /**
   * Live built-in renderer switch (E4 MB-041).
   *
   * `origami` returns to the folded-paper DOM; a hero character atomically
   * replaces the scene with that character's SHIPPED bundle — even when the page
   * booted in folded-paper mode (hero flag off) and never acquired the canvas.
   * The engine's first-frame gate decides: on any failure the previous appearance
   * keeps rendering and nothing is committed here (no storage write, no reload).
   */
  async function switchBuiltinRenderer(choice: BuiltinRendererChoice): Promise<BuiltinRendererSwapResult> {
    if (choice === 'origami') return switchToFoldedPaper()
    return switchToBuiltinCharacter(choice)
  }

  /** Return to the folded-paper DOM without persisting or reloading. */
  function switchToFoldedPaper(): BuiltinRendererSwapResult {
    if (hero === null) {
      // Already folded paper: keep the DOM appearance honest and idempotent.
      delete document.documentElement.dataset.petRender
      setHeroPlaceholder(heroPlaceholderView('disabled'))
      setHeroStatus({ enabled: false, ok: false, reason: 'origami' })
      return { ok: true, message: '折纸内置外观已在显示。' }
    }
    stopHeroLoop()
    try {
      hero.dispose()
    } catch {
      // A leaked scene must not block returning to the built-in folded paper.
    }
    hero = null
    const canvas = heroCanvasEl
    if (canvas !== null) {
      canvas.style.translate = ''
      canvas.style.scale = ''
      canvas.style.transform = ''
      delete canvas.dataset.heroFlip
      delete canvas.dataset.heroRenderKey
      delete canvas.dataset.heroFrameKey
      canvas.classList.remove('dragging')
    }
    heroMove.offset = 0
    heroMove.active = false
    heroSceneBuiltin = true
    activeCharacterPackId = null
    activeCharacterPackKind = null
    const stage = document.getElementById('hero-stage')
    if (stage) (stage as HTMLElement).hidden = true
    delete document.documentElement.dataset.petRender
    delete document.documentElement.dataset.characterPack
    delete document.documentElement.dataset.heroCanvas
    delete document.documentElement.dataset.heroScale
    delete document.documentElement.dataset.heroDpr
    setHeroPlaceholder(heroPlaceholderView('disabled'))
    setHeroStatus({ enabled: false, ok: false, reason: 'origami' })
    return { ok: true, message: '已切回折纸内置外观（无需刷新）。' }
  }

  /** Load + atomically hot-swap one SHIPPED hero character (no persistence). */
  async function switchToBuiltinCharacter(character: HeroCharacterId): Promise<BuiltinRendererSwapResult> {
    // Only the three shipped built-in characters are exempt from the per-load
    // full-TOS gate (`isBuiltinCharacterId`); never let a forged/typed id turn
    // this hot-swap path into a consent-free DLC loader.
    if (!isBuiltinCharacterId(character) || character === 'tinglan') {
      return { ok: false, reason: 'unsupported-builtin-character: ' + String(character) }
    }
    // Same LIVE built-in character: nothing to load or rebuild (idempotent click).
    if (hero !== null && heroSceneBuiltin && activeCharacterPackId === null && liveBuiltinCharacter === character) {
      return { ok: true, message: '内置 hero 角色「' + character + '」已在显示。' }
    }
    const mounted = mountHeroView()
    if (!mounted.ok) return { ok: false, reason: 'hero-renderer-not-running: ' + mounted.reason }
    let bundle: HeroCharacterBundle
    try {
      bundle = await loadBundle(character)
    } catch (error) {
      return {
        ok: false,
        reason: 'builtin-load-failed: ' + (error instanceof Error ? error.message : String(error)),
      }
    }
    // A page that booted in folded paper never ran the night check; capture it
    // here so the first live scene starts in the same day/night mood as boot.
    const hour = new Date().getHours()
    heroNight = hour >= 23 || hour < 6
    const swapped = await hotSwapHeroCharacterPack(bundle, null, character)
    if (!swapped.ok) return { ok: false, reason: swapped.reason }
    return { ok: true, message: '已切换到内置 hero 角色「' + character + '」（无需刷新）。' }
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
      cancelHoverDwell()
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
    // Hover dwell (C1 2026-11-21): hovering for 800 ms emits `hover.dwell`, which
    // behavior.json maps to the existing idle_blink reaction (no new clip/frame).
    // A sequence counter invalidates the pending timer on leave/press instead of
    // introducing a second injected timer-cancel seam.
    let hoverSeq = 0
    const cancelHoverDwell = (): void => {
      hoverSeq += 1
    }
    const scheduleHoverDwell = (): void => {
      const seq = ++hoverSeq
      setTimeoutFn(() => {
        if (seq !== hoverSeq) return
        if (document.visibilityState === 'hidden') return
        // Firing invalidates the sequence: one reaction per continuous hover.
        hoverSeq += 1
        hero?.emit('hover.dwell')
      }, HERO_HOVER_DWELL_MS)
    }
    canvas.addEventListener('pointerenter', () => {
      if (activePointer !== null) return
      hero?.emit('hover')
      scheduleHoverDwell()
    })
    canvas.addEventListener('pointerleave', () => {
      cancelHoverDwell()
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
    try {
      // MB-041: the canvas/context/stage/DPR acquisition is shared with the live
      // folded-paper → hero hot switch, so both paths cannot drift.
      const mounted = mountHeroView()
      if (!mounted.ok) throw new Error(mounted.reason)
      const { canvas, ctx } = mounted
      const hour = new Date().getHours()
      const night = hour >= 23 || hour < 6
      const runtimeOptions = {
        config: HERO_CONFIG,
        canvas,
        ctx,
        stage: heroStageSize ?? { width: windowLike.innerWidth, height: windowLike.innerHeight },
        dpr: heroDpr,
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
      resetIdleRhythm()
      // heroCanvasEl/heroCtx/heroStageSize/heroDpr were captured by mountHeroView().
      heroNight = night
      runtimeViewportDirty = false
      // MB-046: start watching monitor/DPI changes now that a canvas exists.
      ensureRuntimeViewportWatch()
      // The booted scene is the shipped built-in renderer until the installer
      // restores a persisted pack appearance below (task-111).
      heroSceneBuiltin = true
      activeCharacterPackId = null
      activeCharacterPackKind = null
      liveBuiltinCharacter = HERO_CONFIG.character
      ensureHeroInteractions(canvas)
      // Atomic switch only after the first frame succeeded: unhide the stage,
      // then hide `#pet` via CSS (rect kept); the bubble/buttons keep working.
      if (stage) stage.hidden = false
      document.documentElement.dataset.petRender = 'hero'
      // MB-050: the desktop shell may have applied the hero fit before this
      // canvas had a layout size (the stage was hidden and the canvas CSS size
      // only exists after the first pack frame), which kept the unclamped hero
      // zoom and pushed the scaled canvas above the window top. Now that the
      // stage is visible and the canvas size is final, re-run the viewport fit.
      requestScaleRefit()
      // QA hook: the fitted CSS canvas/display scale (e.g. 256x256@1 or
      // 128x128@0.125), plus the device-pixel backing store ratio.
      document.documentElement.dataset.heroCanvas = `${result.runtime.layout.width}x${result.runtime.layout.height}`
      document.documentElement.dataset.heroScale = String(result.runtime.layout.scale)
      document.documentElement.dataset.heroDpr = String(canvas.width / Math.max(1, result.runtime.layout.width))
      setHeroStatus(heroStatus(HERO_CONFIG, result))
      setHeroPlaceholder(heroPlaceholderView('ready'))
      heroSceneNow = 0
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

  // Pet window (MB-041): install the remote built-in renderer bridge once when
  // main.ts wires the local handler (production). Tests/embeds omit the handler.
  const remoteBuiltinApply = deps.applyRemoteBuiltinRenderer
  if (remoteBuiltinApply !== undefined) installRemoteBuiltinRendererBridge(remoteBuiltinApply)

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
    switchBuiltinRenderer,
    builtinRenderer,
    requestRemoteBuiltinRenderer: (choice: BuiltinRendererChoice) =>
      requestRemoteBuiltinRenderer(choice, { hasTauri: HAS_TAURI, contentShell: CONTENT_SHELL }),
    installWindowLayout,
    saveWindowPosition,
    restoreWindowPosition,
    clearSavedWindowPosition,
  }
}
