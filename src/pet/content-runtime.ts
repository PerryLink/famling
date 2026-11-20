/**
 * Role & content center runtime + independent content/settings window boot
 * (E10 MB-100, task-102; extracted verbatim from `src/pet/main.ts`).
 *
 * The catalog, strict validation, pack merge, selection persistence, appearance
 * and dialogue resolution are pure modules (content-library/content-hub/
 * content-assets) and are untouched by this split. This module owns only the
 * side effects that used to live in main.ts; every pet-page seam (bubble,
 * error boundaries, voice preference lifecycle, save load, render, startup
 * chrome) is injected through `ContentRuntimeDeps`. It has no CSS import and
 * no module-level DOM access, so Node tests can import it directly.
 */
// ---------------------------------------------------------------------------
// Role & content center runtime (famling.content/0.2, task-54; moved by
// E10 task-102 to content-runtime.ts; the catalog/pure modules are unchanged)
//
// The following comment is the original main.ts section contract, kept
// verbatim so the extracted side effects stay documented in one place.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Role & content center runtime (famling.content/0.2, task-54)
//
// The catalog, strict validation, pack merge, selection persistence, appearance
// and dialogue resolution are pure modules (src/pet/content-library.ts,
// src/pet/content-hub.ts, src/pet/content-assets.ts). This host section owns
// only the side effects:
// - startup: read /content/library.json (same-origin static asset, never a
//   remote market), merge v1 installed components + v2 role-theme packs, read
//   the role theme + six-key selection (migrating old profiles), apply
//   theme/background/font and resolve dialogue behaviour, then load locally
//   stored pack assets (IndexedDB, memory fallback) for previews/fonts;
// - one-click role: applyCharacterTheme -> writeCharacterThemeSelection (six
//   keys + role-theme key). Character changes go through the existing
//   applyRendererChoice() write+reload path; voice changes re-prompt the TTS
//   declaration; appearance/dialogue apply immediately without reload;
// - per-component customisation: one six-key write, immediate appearance,
//   voice keeps the existing TTS config-signature lifecycle;
// - local pack import (.json / .zip / webkitdirectory folder): bounded read ->
//   canonical validateContentPackV2 (+ validatePackZip for bundles) ->
//   unified usage declaration shown -> explicit user confirmation ->
//   mergeCharacterThemes -> persist manifest + assets. Remote/unverified packs
//   are refused by the pure helper; nothing is ever fetched here.
// ---------------------------------------------------------------------------

import {
  applyContentSelectionAppearance,
  commitPreparedThemePack,
  defaultContentMarketState,
  describeContentMarketState,
  evaluateRoleThemeSupport,
  initContentHub,
  planStartupRoleTheme,
  prepareThemePackImport,
  readInstalledContentPacks,
  readInstalledThemePacks,
  type ContentHubController,
  type ContentHubImportResult,
  type ContentHubInstalledPack,
  type ContentHubSelectResult,
  type ContentMarketUiState,
  type ContentPackFileSelection,
  type PreparedThemePackImport,
  type RemoteMarketSource,
  type ThemePackPrepareResult,
} from './content-hub.ts'
import {
  createCharacterPackInstaller,
  type CharacterPackActionOutcome,
  type CharacterPackHubAdapter,
  type CharacterPackRendererWiring,
} from './content-hub/character-installer.ts'
import {
  CONTENT_CHARACTER_PRODUCT_IDS,
  CONTENT_SELECTION_CATEGORY,
  applyCharacterTheme,
  clearRoleThemeSelection,
  findCharacterTheme,
  findContent,
  mergeCharacterThemes,
  mergeInstalledPacks,
  parseContentLibrary,
  readContentSelection,
  readRoleThemeSelection,
  resolveContentSelection,
  resolveDialogueBehavior,
  validateContentPack,
  validateContentPackV2,
  writeCharacterThemeSelection,
  writeContentSelection,
  writeRoleThemeSelection,
  type CharacterPackKind,
  type ContentCharacterEntry,
  type ContentCharacterTheme,
  type ContentLibrary,
  type ContentSelection,
  type ContentVoiceEntry,
  type DialogueBehavior,
  type SelectionKey,
} from './content-library.ts'
import {
  buildAssetRecords,
  contentAssetKey,
  createAssetUrlRegistry,
  openContentAssetStore,
  persistAssetRecords,
  registerPackFont,
  type ContentAssetRecord,
  type ContentAssetStore,
  type ContentAssetUrls,
} from './content-assets.ts'
import {
  CONTENT_WINDOW_NAVIGATE_EVENT,
  PET_RELOAD_EVENT,
  installContentWindowChrome,
  normalizeContentWindowRoute,
  openContentWindow,
  stashContentWindowFocus,
  takeContentWindowFocus,
  type ContentWindowChrome,
  type ContentWindowMode,
  type ContentWindowRoute,
} from './content-window.ts'
import {
  HERO_RENDERER_STORAGE,
  applyRendererChoice,
  closeDesktopSettingsDialog,
  openDesktopSettingsDialog,
  type PetRendererChoice,
} from './desktop-shell.ts'
import type { HeroCharacterId, HeroConfig } from './hero-runtime.ts'
import { requestRemoteBuiltinRenderer } from './hero-page.ts'
import { isTtsVoiceId, writeVoicePref } from './voice-prefs.ts'
import type { TtsVoiceId } from '../voice/types.ts'
import { canInteract } from './consent/runtime.ts'
import { hasOpenConsentOverlay } from './consent/modal.ts'
import { resolveStorage, type StorageLike } from './security/safe-storage.ts'
import type { ErrorBoundary } from './security/error-boundary.ts'

export interface ContentRuntimeDeps {
  /** Live document for the content-hub panel and the reused settings dialog. */
  readonly document: Document
  /** `contentWindowMode()` result: route + whether this page IS the content window. */
  readonly contentWindow: ContentWindowMode
  readonly hasTauri: boolean
  /** `resolveHeroConfig()` snapshot: renderer truth for the catalog character. */
  readonly heroConfig: Pick<HeroConfig, 'enabled' | 'character'>
  /** main.ts error boundaries (same instances as before the split). */
  readonly uiBoundary: ErrorBoundary
  readonly loadBoundary: ErrorBoundary
  /** main.ts boundary reporter (logs once, never throws). */
  reportFailure(boundary: ErrorBoundary, error: unknown): void
  /** Existing bubble surface. */
  showBubble(text: string): void
  /** Current TTS voice preference (mutable in main.ts). */
  getCurrentVoice(): TtsVoiceId
  /** Existing voice-change lifecycle (re-prompts the separate TTS declaration). */
  applyVoicePreference(voice: TtsVoiceId): boolean
  /** Re-render the voice-mode badge. */
  renderVoiceMode(): void
  /** Mirror the active dialogue policy to main.ts (sayLater/QA surface). */
  setDialogueBehavior(next: DialogueBehavior | null): void
  /** Read-only save load used by the content/settings window. */
  loadNow(): Promise<boolean>
  /** Full pet render used by the content/settings window boot. */
  render(): void
  /** Testable seams: production omits them and uses the real modules. */
  fetchLibrary?: (path: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
  resolveStorage?: () => StorageLike | null
  canInteract?: () => boolean
  hasOpenConsentOverlay?: (document: Document) => boolean
  openAssetStore?: () => Promise<ContentAssetStore | null>
  createInstaller?: typeof createCharacterPackInstaller
  createHub?: typeof initContentHub
  applyAppearance?: typeof applyContentSelectionAppearance
  /**
   * Production character-pack renderer wiring (task-111). main.ts owns the hero
   * scene and injects the render host + built-in restore callback; this module
   * only forwards it to the installed adapter. Absent = registration-only.
   */
  readonly characterPackRenderer?: CharacterPackRendererWiring
  /**
   * Live BUILT-IN renderer scene switch (E4 MB-041): the pet window applies the
   * shipped dog/cat/humanoid bundle (or returns to the folded paper) on its hero
   * scene without persisting or reloading. The independent content window has no
   * hero canvas, so it forwards the request over the Tauri bridge to the pet
   * window. Absent (Node tests/embeds) => the one-click role path honestly
   * reports that the live renderer is not wired instead of persisting a lie and
   * reloading.
   */
  readonly switchBuiltinHeroCharacter?: (
    choice: PetRendererChoice,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>
}

/** Result of one live built-in renderer switch (E4 MB-041). */
export interface BuiltinRendererApplyOutcome {
  readonly ok: boolean
  /** Visible reason when `ok` is false (never HTML; short user-facing copy). */
  readonly message?: string
}

export interface ContentRuntimeApi {
  ensureContentRuntime(): Promise<ContentRuntimeState | null>
  openContentHubInWindow(): Promise<boolean>
  openContentHubFromMenu(): void
  openSettingsInContentWindow(focusTarget?: string): boolean
  requestPetWindowReload(save: boolean): void
  closeContentWindow(): void
  /** Boot the independent content/settings window (idempotent). */
  bootContentWindowOnce(): Promise<void>
  /** Content window: switch route, suppressing onClose→home while switching. */
  showContentWindowRoute(route: ContentWindowRoute): void
  /** Settings dialog closed: return the content window to its home surface. */
  handleContentWindowSettingsClosed(): void
  getContentRuntime(): ContentRuntimeState | null
  isContentHubOpen(): boolean
  closeContentHubPanel(): void
  /**
   * Restore the persisted active character pack after the hero renderer is
   * ready. Null when the content runtime/adapter is unavailable.
   */
  restoreActiveCharacterPack(): Promise<CharacterPackActionOutcome | null>
  /**
   * Pet-window side of the cross-window bridge: refresh installed packs and apply
   * the saved appearance (or restore built-in when none is saved).
   */
  syncCharacterPackAppearance(): Promise<CharacterPackActionOutcome | null>
  /**
   * Pet-window side of the built-in role hot switch (E4 MB-041): re-read the
   * persisted six-key selection written by the content window, re-apply the
   * appearance/dialogue policy and report the persisted TTS voice so main.ts can
   * run the existing voice/TTS-declaration lifecycle. Null when unavailable.
   */
  syncSavedRoleSelection(): Promise<SavedRoleSelectionSync | null>
  /**
   * Pet-window local half of the MB-041 hot switch: swap the live hero scene to
   * a built-in renderer, re-read the persisted role, and run the existing
   * voice/TTS declaration lifecycle. Never throws; never rolls back by itself.
   */
  applyBuiltinRendererLocally(choice: PetRendererChoice): Promise<BuiltinRendererApplyOutcome>
}

/** One persisted-role sync result (the voice feeds main.ts' existing lifecycle). */
export interface SavedRoleSelectionSync {
  readonly ok: boolean
  /** Persisted TTS voice for the selected character (null = not a TTS character). */
  readonly voice: TtsVoiceId | null
}
interface ContentPreviewTarget {
  readonly packId: string
  readonly path: string
}

export interface ContentRuntimeState {
  /** Built-in catalog document (no installed packs). */
  readonly baseLibrary: ContentLibrary
  /** Built-in catalog + v1 installed components (v2 theme packs not merged). */
  v1Library: ContentLibrary
  installedPacks: readonly unknown[]
  themePacks: readonly unknown[]
  library: ContentLibrary
  selection: ContentSelection
  roleThemeId: string | null
  dialogue: DialogueBehavior
  hub: ContentHubController | null
  /**
   * Experimental character-pack installer (IndexedDB host +
   * CharacterPackRuntime). Null when the host adapter could not be opened;
   * the 内容包 tab then shows the honest 「安装器不可用」 note.
   */
  characterPacks: CharacterPackHubAdapter | null
  assetStore: ContentAssetStore | null
  readonly assetUrls: ContentAssetUrls
  /** Locally persisted pack asset records, keyed by contentAssetKey(). */
  readonly assetRecords: Map<string, ContentAssetRecord>
  /** Registered FontFace families per pack (local sample preview only). */
  readonly fontFamiliesByPack: Map<string, string[]>
  /** Installed role theme id -> its pack preview asset target. */
  readonly previewTargets: Map<string, ContentPreviewTarget>
}

/**
 * Create the content/role/settings-window runtime. main.ts injects its host
 * seams once; the returned API is the only surface main.ts calls.
 */
export function createContentRuntime(deps: ContentRuntimeDeps): ContentRuntimeApi {
  // Injected document: the extracted functions used the page global in main.ts.
  const document = deps.document
  const contentWindow = deps.contentWindow
  const contentShell = contentWindow.isContentWindow
  const hasTauri = deps.hasTauri
  const heroConfig = deps.heroConfig
  // Injectable seams: production omits them and gets the real modules; tests
  // pass doubles so the wiring itself is behaviour-tested in Node.
  const fetchLibrary =
    deps.fetchLibrary ?? ((path: string) => fetch(path, { credentials: 'same-origin' }))
  const getStorage = deps.resolveStorage ?? resolveStorage
  const interactionAllowed = deps.canInteract ?? canInteract
  const overlayOpen = deps.hasOpenConsentOverlay ?? hasOpenConsentOverlay
  const openAssetStore = deps.openAssetStore ?? openContentAssetStore
  const createInstaller = deps.createInstaller ?? createCharacterPackInstaller
  const createHub = deps.createHub ?? initContentHub
  const applyAppearance = deps.applyAppearance ?? applyContentSelectionAppearance
  // Content/settings window state (moved with the runtime): only the
  // independent content window may rebroadcast a pet reload.
  /** Only the independent content window may rebroadcast a pet reload. */
  let contentWindowNeedsPetReload = false
  /** The content window's in-window home surface (content hub / settings / close). */
  let contentWindowChrome: ContentWindowChrome | null = null
  let contentWindowBooted = false
  /** Suppresses onClose→showHome while the runtime itself is switching panels. */
  let contentWindowTransition = false

    // ----- role & content center state -----
  let contentRuntime: ContentRuntimeState | null = null
  let contentLoad: Promise<ContentRuntimeState | null> | null = null
  /**
   * Renderer choice that is LIVE in this window's pet scene (E4 MB-041): the
   * boot-time `heroConfig` is a snapshot and the independent content window has
   * no hero scene at all, so every successful live switch updates this and a
   * failed one rolls back to it. Null until the catalog boots.
   */
  let runtimeRendererChoice: PetRendererChoice | null = null
  /**
   * Remote market source is intentionally NOT configured in this build: the UI
   * shows the honest "服务器未配置" state and nothing fetches. A future installer
   * can inject a verified RemoteMarketSource here without changing the panel.
   */
  let activeMarketSource: RemoteMarketSource | null = null

  const CONTENT_KEY_LABELS: Readonly<Record<SelectionKey, string>> = Object.freeze({
    character: '角色',
    voice: '声音',
    dialoguePack: '对话模式',
    theme: '主题',
    background: '背景',
    font: '字体',
  })

    // ----- role & content center runtime -----
  function contentStorage() {
    return getStorage()
  }

  /** Fail closed when the TOS gate is not accepted or a consent overlay is open. */
  function contentHubBlocked(): boolean {
    try {
      return !interactionAllowed() || overlayOpen(document)
    } catch {
      return true
    }
  }

  /** Boot-time renderer snapshot (fallback when the persisted keys are unreadable). */
  function rendererChoiceFromHeroConfig(): PetRendererChoice {
    if (!heroConfig.enabled) return 'origami'
    if (heroConfig.character === 'dog' || heroConfig.character === 'cat') return heroConfig.character
    return 'humanoid'
  }

  /**
   * Renderer that is LIVE in the pet window (E4 MB-041). The shared renderer
   * keys are written by the renderer lifecycle itself; this window's boot-time
   * `heroConfig` is only the fallback (the independent content window resolves
   * the flag with no hero on its own page).
   */
  function readPersistedRendererChoice(): PetRendererChoice {
    const fallback = rendererChoiceFromHeroConfig()
    const store = contentStorage()
    if (store === null) return fallback
    try {
      const heroFlag = store.getItem(HERO_RENDERER_STORAGE.hero)
      if (heroFlag === null) return fallback
      if (heroFlag !== '1') return 'origami'
      const raw = store.getItem(HERO_RENDERER_STORAGE.character)?.trim().toLowerCase()
      return raw === 'dog' || raw === 'cat' || raw === 'humanoid' ? raw : 'humanoid'
    } catch {
      return fallback
    }
  }

  /** Renderer choice currently live here: the last successful switch wins. */
  function liveRendererChoice(): PetRendererChoice {
    return runtimeRendererChoice ?? readPersistedRendererChoice()
  }

  /**
   * Character-pack fallback registration kind for the current hero character.
   * The runtime only needs this for the uninstall fallback placeholder; the
   * installer never renders that placeholder (renderer adapter not wired).
   */
  function characterPackKindFor(character: HeroCharacterId): CharacterPackKind {
    if (!heroConfig.enabled) return 'humanoid'
    if (character === 'cat') return 'cat'
    if (character === 'dog') return 'dog'
    return 'humanoid'
  }

  function addFontFamily(runtime: ContentRuntimeState, packId: string, family: string): void {
    const families = runtime.fontFamiliesByPack.get(packId) ?? []
    if (families.includes(family)) return
    families.push(family)
    runtime.fontFamiliesByPack.set(packId, families)
  }

  /** Installed role theme id -> pack-relative preview asset (for object URLs). */
  function rebuildPreviewTargets(runtime: ContentRuntimeState): void {
    runtime.previewTargets.clear()
    for (const raw of runtime.themePacks) {
      const validation = validateContentPackV2(raw)
      if (!validation.ok) continue
      for (const theme of validation.pack.roleThemes) {
        runtime.previewTargets.set(theme.id, { packId: validation.pack.id, path: theme.preview })
      }
    }
  }

  /** Load persisted pack previews + register stored woff2 fonts (best effort). */
  async function hydrateInstalledAssets(runtime: ContentRuntimeState): Promise<void> {
    rebuildPreviewTargets(runtime)
    const store = runtime.assetStore
    if (store === null) return
    for (const target of runtime.previewTargets.values()) {
      const record = await store.get(target.packId, target.path)
      if (record !== null) runtime.assetRecords.set(record.key, record)
    }
    for (const raw of runtime.themePacks) {
      const validation = validateContentPackV2(raw)
      if (!validation.ok) continue
      const metas = await store.list(validation.pack.id)
      for (const meta of metas) {
        if (!meta.path.endsWith('.woff2')) continue
        const record = await store.get(meta.packId, meta.path)
        if (record === null) continue
        runtime.assetRecords.set(record.key, record)
        try {
          const registration = await registerPackFont(record)
          if (registration.ok && registration.family !== undefined) {
            addFontFamily(runtime, record.packId, registration.family)
          }
        } catch {
          // A font that fails to load is not fatal: the pack metadata still works.
        }
      }
    }
  }

  /** Host market status (default: unconfigured, no network). */
  function contentMarketState(): ContentMarketUiState {
    try {
      return describeContentMarketState(activeMarketSource)
    } catch {
      return defaultContentMarketState()
    }
  }

  /**
   * Build the hub controller for a runtime that is still being initialised.
   * Takes the runtime explicitly instead of reading the published
   * `contentRuntime`: the published state must only ever be a FULLY
   * initialised runtime (task-120), so it is assigned after this returns.
   */
  function buildContentHubController(runtime: ContentRuntimeState): ContentHubController {
    return createHub({
      document,
      getLibrary: () => runtime.library,
      getSelection: () => runtime.selection,
      getRoleThemeId: () => runtime.roleThemeId,
      getBaseLibrary: () => runtime.baseLibrary,
      applyRole: (roleThemeId) => applyRoleThemeFromHub(roleThemeId, 'apply'),
      customize: customizeRoleComponent,
      restoreRole: restoreCurrentRoleDefaults,
      prepareImport: prepareContentImport,
      commitImport: commitContentImport,
      getInstalledPacks: installedPackSummaries,
      characterPacks: runtime.characterPacks,
      getMarketState: contentMarketState,
      resolvePreviewUrl: resolveRolePreviewUrl,
      // The independent content window (MB-062): closing the SAME hub returns to
      // its home surface, and appearance/role edits made there are flushed to the
      // live pet window (save + reload) so it does not keep a stale renderer.
      onClose: () => {
        if (!contentShell) return
        if (!contentWindowTransition) contentWindowChrome?.showHome()
        if (contentWindowNeedsPetReload) {
          contentWindowNeedsPetReload = false
          requestPetWindowReload(true)
        }
      },
    })
  }

  /**
   * Open the SAME consolidated role & content center inside this window.
   * Used by the pet window's browser/dev fallback and by the content window
   * itself (menu / settings → 角色与内容中心).
   */
  async function openContentHubInWindow(): Promise<boolean> {
    if (contentHubBlocked()) {
      deps.showBubble('请先同意完整声明后再打开角色与内容中心。')
      return false
    }
    const runtime = await ensureContentRuntime()
    if (!runtime || !runtime.hub) {
      deps.showBubble('内容目录没有加载出来，请稍后再试。')
      return false
    }
    const opened = runtime.hub.open()
    // task-111: the boot-time character-pack restore can only run after this
    // runtime and the hero scene both exist. If the hub is opened later, retry
    // once here (idempotent) so a saved pack appearance still hot-swaps in.
    const packs = runtime.characterPacks
    if (packs !== null) {
      void packs
        .restoreActive()
        .then((result) => {
          if (result.ok && packs.state().renderer.rendered !== null) runtime.hub?.refresh()
        })
        .catch((error: unknown) => deps.reportFailure(deps.uiBoundary, error))
    }
    return opened
  }

  /**
   * Load + merge the catalog once (retryable after a failure), restore/migrate the
   * role theme selection and apply the saved appearance/dialogue. Local static
   * fetch only (the built-in catalog), never a remote market.
   */
  async function ensureContentRuntime(): Promise<ContentRuntimeState | null> {
    if (contentRuntime) return contentRuntime
    if (contentLoad) return contentLoad
    const pending = (async (): Promise<ContentRuntimeState | null> => {
      try {
        const response = await fetchLibrary('/content/library.json')
        if (!response.ok) throw new Error('content library request failed: ' + response.status)
        const baseLibrary = parseContentLibrary(await response.json())
        const storedV1 = readInstalledContentPacks(contentStorage())
        const v1Merged = mergeInstalledPacks(baseLibrary, storedV1.packs)
        const v1Library = v1Merged.library
        const storedThemes = readInstalledThemePacks(contentStorage())
        const themeMerged = mergeCharacterThemes(v1Library, storedThemes.packs)
        const library = themeMerged.library
        const plan = planStartupRoleTheme(library, contentStorage(), {
          // MB-041: the persisted renderer keys are live truth even in the
          // content window (whose own resolveHeroConfig has hero switched off).
          runtimeCharacter: readPersistedRendererChoice(),
          ...(isTtsVoiceId(deps.getCurrentVoice()) ? { runtimeVoice: deps.getCurrentVoice() } : {}),
        })
        if (plan.writeRoleTheme && plan.roleThemeId !== null) {
          // Migration/default: persist the full six-key bundle + role-theme key so
          // the next boot reads the same role instead of re-deriving it.
          writeRoleThemeSelection(library, plan.roleThemeId, contentStorage())
          writeContentSelection(library, plan.selection, contentStorage())
        }
        if (plan.clearRoleTheme) clearRoleThemeSelection(contentStorage())
        const runtime: ContentRuntimeState = {
          baseLibrary,
          v1Library,
          installedPacks: storedV1.packs,
          themePacks: storedThemes.packs,
          library,
          selection: plan.selection,
          roleThemeId: plan.roleThemeId,
          dialogue: resolveDialogueBehavior(library, plan.selection),
          hub: null,
          characterPacks: null,
          assetStore: null,
          assetUrls: createAssetUrlRegistry(),
          assetRecords: new Map<string, ContentAssetRecord>(),
          fontFamiliesByPack: new Map<string, string[]>(),
          previewTargets: new Map<string, ContentPreviewTarget>(),
        }
        deps.setDialogueBehavior(runtime.dialogue)
        runtimeRendererChoice = readPersistedRendererChoice()
        try {
          applyAppearance(document, runtime.library, runtime.selection)
        } catch (error) {
          deps.reportFailure(deps.uiBoundary, error)
        }
        try {
          runtime.assetStore = await openAssetStore()
          await hydrateInstalledAssets(runtime)
        } catch (error) {
          // Asset storage is a preview enhancement; the catalog still works.
          deps.reportFailure(deps.uiBoundary, error)
        }
        // E4 role-pack installer: the IndexedDB/memory file store + injected
        // CharacterPackRuntime host. task-111 injects the production renderer
        // wiring from main.ts (host + built-in restore); without it the panel
        // still honestly labels install/enable as registration-only.
        try {
          runtime.characterPacks = await createInstaller({
            kind: characterPackKindFor(heroConfig.character),
            ...(deps.characterPackRenderer !== undefined ? { renderer: deps.characterPackRenderer } : {}),
          })
        } catch (error) {
          runtime.characterPacks = null
          deps.reportFailure(deps.uiBoundary, error)
        }
        runtime.hub = buildContentHubController(runtime)
        // Publish ONLY the fully initialised runtime (task-120 / E11 soak):
        // main.ts calls initializeApp()'s `void ensureContentRuntime()` eagerly
        // and the content-window boot runs concurrently. Publishing the state
        // object before the hub existed made `if (contentRuntime) return`
        // hand a PARTIAL runtime to the boot route: openContentHubInWindow()
        // saw hub === null and returned false, so the window fell back to its
        // home surface with the hub permanently closed (no console error).
        // Keeping the assignment here means every concurrent caller awaits
        // `contentLoad` (the in-flight promise) and gets the full runtime.
        contentRuntime = runtime
        return runtime
      } catch (error) {
        deps.reportFailure(deps.uiBoundary, error)
        return null
      }
    })()
    contentLoad = pending
    try {
      return await pending
    } finally {
      if (contentLoad === pending) contentLoad = null
    }
  }

  /**
   * Desktop-menu entry (pet window): open the independent content/settings window
   * (MB-062), focusing it when already open. Browser/dev (no Tauri) and a failed
   * window creation keep today's in-window panel — one renderer, two hosts.
   */
  function openContentHubFromMenu(): void {
    if (contentShell) {
      // Content window: switch the SAME window to the content panel (this is also
      // what the settings dialog's 角色与内容中心… button reaches).
      if (contentWindowChrome) contentWindowChrome.showRoute('content')
      else void openContentHubInWindow().catch((error) => deps.reportFailure(deps.uiBoundary, error))
      return
    }
    if (!hasTauri) {
      // Browser/dev fallback: keep the in-window panel (no popups, no new window).
      void openContentHubInWindow().catch((error) => deps.reportFailure(deps.uiBoundary, error))
      return
    }
    void openContentWindow('content')
      .then((opened) => {
        if (!opened) void openContentHubInWindow().catch((error) => deps.reportFailure(deps.uiBoundary, error))
      })
      .catch((error) => {
        deps.reportFailure(deps.uiBoundary, error)
        void openContentHubInWindow().catch((inner) => deps.reportFailure(deps.uiBoundary, inner))
      })
  }

  /**
   * Pet-window menu 设置… entry: open the same audited settings dialog in the
   * independent content window (deep-linked focus target stashed for it). Returns
   * false in the browser fallback so desktop-shell opens its in-window modal.
   */
  function openSettingsInContentWindow(focusTarget?: string): boolean {
    if (contentShell || !hasTauri) return false
    stashContentWindowFocus(contentStorage(), focusTarget)
    void openContentWindow('settings')
      .then((opened) => {
        if (!opened && !openDesktopSettingsDialog(focusTarget)) {
          deps.showBubble('内容窗口没有打开，设置暂时不可用。')
        }
      })
      .catch((error) => {
        deps.reportFailure(deps.uiBoundary, error)
        openDesktopSettingsDialog(focusTarget)
      })
    return true
  }

  /**
   * Ask the live pet window to save (optional) and reload after a content/role
   * change made in the independent window. Fired through the Tauri event bus
   * (both windows share one process); the pet window owns its own save path.
   */
  function requestPetWindowReload(save: boolean): void {
    if (!hasTauri || !contentShell) return
    void import('@tauri-apps/api/event')
      .then(({ emit }) => emit(PET_RELOAD_EVENT, { save }))
      .catch((error: unknown) => {
        console.warn('[pet] reload bridge unavailable', error)
      })
  }

  /** Close only the content window (never the app, never the pet). */
  function closeContentWindow(): void {
    try {
      if (hasTauri) {
        void import('@tauri-apps/api/window')
          .then(({ getCurrentWindow }) => getCurrentWindow().close())
          .catch(() => {
            try {
              window.close()
            } catch {}
          })
        return
      }
      window.close()
    } catch {}
  }

  /** Local object URL for an installed pack preview; built-in previews use paths. */
  function resolveRolePreviewUrl(theme: ContentCharacterTheme): string | null {
    const runtime = contentRuntime
    if (runtime === null) return null
    if (typeof theme.preview === 'string' && theme.preview.startsWith('/') && !theme.preview.startsWith('//')) {
      return theme.preview
    }
    const target = runtime.previewTargets.get(theme.id)
    if (target === undefined) return null
    const record = runtime.assetRecords.get(contentAssetKey(target.packId, target.path))
    if (record === undefined) return null
    try {
      return runtime.assetUrls.urlFor(record)
    } catch {
      return null
    }
  }

  /** Pre-switch state captured for a two-phase live role switch (MB-041). */
  interface RoleSwitchSnapshot {
    readonly roleThemeId: string | null
    readonly selection: ContentSelection
    readonly renderer: PetRendererChoice
    readonly voice: TtsVoiceId
  }

  function captureRoleSwitchSnapshot(runtime: ContentRuntimeState): RoleSwitchSnapshot {
    return {
      roleThemeId: runtime.roleThemeId,
      selection: runtime.selection,
      renderer: liveRendererChoice(),
      voice: deps.getCurrentVoice(),
    }
  }

  /**
   * Best-effort restore of the persisted six keys/role-theme key + renderer keys
   * after a failed live switch. Storage failures are swallowed: the live scene is
   * already the fallback of record and a rollback write must never throw into
   * the user-facing feedback path.
   */
  function restoreRoleSwitchSnapshot(runtime: ContentRuntimeState, snapshot: RoleSwitchSnapshot): void {
    const storage = contentStorage()
    try {
      if (snapshot.roleThemeId !== null) {
        writeRoleThemeSelection(runtime.library, snapshot.roleThemeId, storage)
      } else {
        clearRoleThemeSelection(storage)
      }
      writeContentSelection(runtime.library, snapshot.selection, storage)
      writeVoicePref(snapshot.voice, storage)
      applyRendererChoice(snapshot.renderer, { storage })
    } catch {
      /* best effort: the caller reports the visible failure */
    }
  }

  /**
   * Failed live built-in switch: put THIS window back on the previous role
   * (persisted keys + in-memory appearance/dialogue/voice) and tell the user.
   * The hero engine is atomic, so the previous scene never stopped rendering.
   */
  function rollbackBuiltinRoleSwitch(
    runtime: ContentRuntimeState,
    snapshot: RoleSwitchSnapshot,
    reason: string,
  ): void {
    restoreRoleSwitchSnapshot(runtime, snapshot)
    runtime.selection = snapshot.selection
    runtime.roleThemeId = snapshot.roleThemeId
    runtimeRendererChoice = snapshot.renderer
    try {
      applyAppearance(document, runtime.library, snapshot.selection)
    } catch (error) {
      deps.reportFailure(deps.uiBoundary, error)
    }
    runtime.dialogue = resolveDialogueBehavior(runtime.library, snapshot.selection)
    deps.setDialogueBehavior(runtime.dialogue)
    deps.applyVoicePreference(snapshot.voice)
    deps.renderVoiceMode()
    runtime.hub?.refresh()
    deps.showBubble('切换内置渲染器失败（' + reason + '），已保留原角色。')
  }

  /**
   * Window-specific live built-in renderer seam (E4 MB-041): the pet window
   * applies the scene locally; the independent content window (no hero canvas)
   * asks that pet window over Tauri. Undefined only for headless hosts/tests.
   */
  function resolveBuiltinRendererApply():
    | ((choice: PetRendererChoice) => Promise<BuiltinRendererApplyOutcome>)
    | undefined {
    if (deps.switchBuiltinHeroCharacter === undefined) return undefined
    return (choice) =>
      contentShell
        ? requestRemoteBuiltinRenderer(choice, { hasTauri, contentShell })
        : applyBuiltinRendererLocally(choice)
  }

  /**
   * One-click role application: resolve the role into a six-component selection,
   * persist six keys + role-theme key, then run the existing lifecycles:
   *  - character differs -> LIVE built-in renderer hot switch (E4 MB-041): the
   *    renderer keys are still persisted for the next boot, but the live pet
   *    scene is swapped by hero-page, so there is NO page reload. A failed switch
   *    rolls every persisted key back and keeps the previous role;
   *  - voice differs -> write the voice preference + applyVoicePreference()
   *    (re-prompts the separate TTS declaration, never auto-accepted);
   *  - appearance/dialogue -> apply immediately, no reload.
   */
  function applyRoleThemeFromHub(
    roleThemeId: string,
    verb: 'apply' | 'restore',
  ): ContentHubSelectResult {
    const runtime = contentRuntime
    if (!runtime) return { ok: false, message: '内容目录尚未加载，请稍后再试。' }
    if (contentHubBlocked()) return { ok: false, message: '请先同意完整声明后再切换角色。' }
    const theme = findCharacterTheme(runtime.library, roleThemeId)
    if (theme === undefined) return { ok: false, message: '该角色主题不存在或已失效，已保留原角色。' }
    const support = evaluateRoleThemeSupport(runtime.baseLibrary, theme)
    if (!support.supported) return { ok: false, message: support.reason }
    const application = applyCharacterTheme(runtime.library, roleThemeId)
    if (!application.ok || application.selection === undefined) {
      const first = application.issues[0]
      return {
        ok: false,
        message:
          '角色主题解析失败' + (first !== undefined ? '（' + first.message + '）' : '') + '，已保留原角色。',
      }
    }
    const character = findContent(runtime.library, 'characters', application.selection.character) as
      | ContentCharacterEntry
      | undefined
    if (character === undefined) {
      return { ok: false, message: '角色主题引用的角色不在内容目录中，已保留原角色。' }
    }
    const targetRenderer = CONTENT_CHARACTER_PRODUCT_IDS[character.kind].famling as PetRendererChoice
    const characterChanged = liveRendererChoice() !== application.selection.character
    const applyLiveRenderer = resolveBuiltinRendererApply()
    // E4 MB-041: without the live-renderer seam the honest outcome is "not
    // switched" — never a silent persist+reload (only embeds/tests lack it).
    if (characterChanged && applyLiveRenderer === undefined) {
      return { ok: false, message: '当前窗口没有接入实时渲染切换，角色未切换（原状态保持不变）。' }
    }
    const snapshot = captureRoleSwitchSnapshot(runtime)
    // Persist the whole role first: if storage is unavailable nothing changes.
    const stored = writeCharacterThemeSelection(runtime.library, roleThemeId, contentStorage())
    if (!stored.ok) return { ok: false, message: '本地存储不可用，角色主题未切换（原状态保持不变）。' }
    const themeVoiceId =
      character.voiceMode === 'tts' && isTtsVoiceId(application.selection.voice) ? application.selection.voice : null
    const voiceChanged = themeVoiceId !== null && themeVoiceId !== deps.getCurrentVoice()
    let voicePrefNote = ''
    if (voiceChanged && themeVoiceId !== null) {
      const savedVoice = writeVoicePref(themeVoiceId, contentStorage())
      if (savedVoice !== 'ok') voicePrefNote = '（音色偏好未能保存到本地存储）'
    }
    // Renderer keys for the next boot; the live apply below decides success, so
    // this write deliberately omits the legacy reload callback.
    if (!applyRendererChoice(targetRenderer, { storage: contentStorage() })) {
      restoreRoleSwitchSnapshot(runtime, snapshot)
      return { ok: false, message: '本地存储不可用，无法切换角色（原状态保持不变）。' }
    }
    runtime.selection = application.selection
    runtime.roleThemeId = roleThemeId
    runtimeRendererChoice = targetRenderer
    try {
      applyAppearance(document, runtime.library, runtime.selection)
    } catch (error) {
      deps.reportFailure(deps.uiBoundary, error)
    }
    runtime.dialogue = resolveDialogueBehavior(runtime.library, runtime.selection)
    deps.setDialogueBehavior(runtime.dialogue)
    if (voiceChanged) deps.applyVoicePreference(themeVoiceId as TtsVoiceId)
    else deps.renderVoiceMode()
    if (characterChanged && applyLiveRenderer !== undefined) {
      // The hub result contract is synchronous; the async scene swap reports a
      // failure by rolling the whole role back (and via the bubble below).
      void applyLiveRenderer(targetRenderer)
        .then((outcome) => {
          if (outcome.ok) {
            runtime.hub?.refresh()
            return
          }
          rollbackBuiltinRoleSwitch(runtime, snapshot, outcome.message ?? '渲染器未切换')
        })
        .catch((error: unknown) => {
          deps.reportFailure(deps.uiBoundary, error)
          rollbackBuiltinRoleSwitch(runtime, snapshot, '切换时发生内部错误')
        })
      const prefix = verb === 'restore' ? '已恢复角色「' : '正在切换到角色「'
      return {
        ok: true,
        message:
          prefix +
          theme.name +
          '」：声音 / 对话 / 主题 / 背景 / 字体已同步，内置渲染器实时切换中（失败会自动保留原角色）。' +
          (voiceChanged ? ' TTS 声明会按新的配置签名重新弹出确认。' : '') +
          voicePrefNote,
        close: true,
      }
    }
    // Appearance/dialogue changed without a renderer switch: flush the live pet
    // window when the content window's hub closes (it re-reads the same selection).
    if (contentShell) contentWindowNeedsPetReload = true
    const prefix = verb === 'restore' ? '已恢复角色「' : '已应用角色「'
    return {
      ok: true,
      message:
        prefix +
        theme.name +
        '」：声音 / 对话 / 主题 / 背景 / 字体已同步。' +
        (voiceChanged ? 'TTS 声明会按新的配置签名重新弹出确认。' : '') +
        voicePrefNote,
    }
  }

/** Restore the current role theme's six defaults (keeps the role key). */
function restoreCurrentRoleDefaults(): ContentHubSelectResult {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载，请稍后再试。' }
  if (runtime.roleThemeId === null) {
    return {
      ok: false,
      message: '当前是自定义组合，没有可恢复的角色主题；可在「角色」里一键应用一个角色。',
    }
  }
  return applyRoleThemeFromHub(runtime.roleThemeId, 'restore')
}

/**
 * Per-component customisation on top of the current role: writes only the six
 * component keys (the role-theme key stays as the applied basis), applies
 * appearance/dialogue immediately and keeps the voice TTS lifecycle.
 */
function customizeRoleComponent(key: SelectionKey, id: string): ContentHubSelectResult {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载，请稍后再试。' }
  if (contentHubBlocked()) return { ok: false, message: '请先同意完整声明后再修改内容。' }
  if (key === 'character') {
    return { ok: false, message: '角色切换请在「角色」标签一键应用角色主题。' }
  }
  const entry = findContent(runtime.library, CONTENT_SELECTION_CATEGORY[key], id)
  if (entry === undefined || !entry.available) {
    return { ok: false, message: '该内容不可用或已失效，已保留原选择。' }
  }
  const resolved = resolveContentSelection(runtime.library, { ...runtime.selection, [key]: id })
  if (resolved.selection[key] !== id) {
    return { ok: false, message: '该选择不在当前内容目录中，已保留原选择。' }
  }
  const character = findContent(runtime.library, 'characters', resolved.selection.character) as
    | ContentCharacterEntry
    | undefined
  let voiceNote = ''
  if (key === 'voice' && character !== undefined && character.voiceMode === 'tts') {
    const voice = entry as ContentVoiceEntry
    if (!isTtsVoiceId(voice.voiceId)) {
      return { ok: false, message: '这个声音不是本机支持的 TTS 音色，未切换。' }
    }
    if (voice.voiceId !== deps.getCurrentVoice()) {
      const savedPref = writeVoicePref(voice.voiceId, contentStorage())
      if (savedPref !== 'ok') {
        return { ok: false, message: '无法保存音色偏好（本地存储不可用），未切换。' }
      }
      voiceNote = ' TTS 声明会按新的配置签名重新弹出确认。'
    }
  }
  runtime.selection = resolved.selection
  const written = writeContentSelection(runtime.library, resolved.selection, contentStorage())
  try {
    applyAppearance(document, runtime.library, resolved.selection)
  } catch (error) {
    deps.reportFailure(deps.uiBoundary, error)
  }
  if (key === 'dialoguePack') {
    runtime.dialogue = resolveDialogueBehavior(runtime.library, resolved.selection)
    deps.setDialogueBehavior(runtime.dialogue)
  }
  // Same persisted selection read by the pet window: flush it on hub close.
  if (contentShell) contentWindowNeedsPetReload = true
  if (key === 'voice' && character !== undefined && character.voiceMode === 'tts') {
    const voice = entry as ContentVoiceEntry
    if (isTtsVoiceId(voice.voiceId)) {
      if (voice.voiceId !== deps.getCurrentVoice()) deps.applyVoicePreference(voice.voiceId)
      else deps.renderVoiceMode()
    }
  }
  const name = entry.name
  if (!written.ok) {
    return {
      ok: false,
      message: '已临时应用' + CONTENT_KEY_LABELS[key] + '「' + name + '」，但无法保存（本地存储不可用）。',
    }
  }
  return {
    ok: true,
    message: '已自定义' + CONTENT_KEY_LABELS[key] + '「' + name + '」；其余组件仍跟随角色主题。' + voiceNote,
  }
}

/** Pure validation / merge preview for a selected local pack (nothing written). */
async function prepareContentImport(selection: ContentPackFileSelection): Promise<ThemePackPrepareResult> {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载。' }
  if (contentHubBlocked()) return { ok: false, message: '请先同意完整声明后再导入内容。' }
  return prepareThemePackImport(selection, runtime.v1Library, runtime.themePacks)
}

/**
 * Explicitly confirmed install: persist the validated manifest, persist verified
 * assets (IndexedDB / memory fallback), re-merge the catalog and refresh UI.
 */
async function commitContentImport(pending: PreparedThemePackImport): Promise<ContentHubImportResult> {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载。' }
  if (contentHubBlocked()) return { ok: false, message: '请先同意完整声明后再导入内容。' }
  const stored = commitPreparedThemePack(pending, contentStorage())
  if (!stored.ok) {
    const reason =
      stored.status === 'too-large'
        ? '内容包存储超过大小上限'
        : stored.status === 'quota'
          ? '本地存储配额不足'
          : '本地存储不可用'
    return { ok: false, message: '内容包校验通过，但' + reason + '，未安装。' }
  }
  let assetNote = ''
  if (pending.assets.length > 0) {
    const records = buildAssetRecords(pending.pack.id, pending.assets)
    const store = runtime.assetStore
    if (store !== null) {
      const persisted = await persistAssetRecords(store, records)
      for (const record of records) runtime.assetRecords.set(record.key, record)
      if (persisted.failed > 0) {
        assetNote = '（' + persisted.failed + ' 个素材未能写入本地资产库，预览可能缺失）'
      }
      for (const record of records) {
        if (!record.path.endsWith('.woff2')) continue
        try {
          const registration = await registerPackFont(record)
          if (registration.ok && registration.family !== undefined) {
            addFontFamily(runtime, record.packId, registration.family)
          }
        } catch {
          // A font failure must not fail an otherwise valid pack install.
        }
      }
    } else {
      assetNote = '（本地资产库不可用，素材仅在本次会话可用）'
    }
  }
  runtime.themePacks = pending.nextPacks
  runtime.library = pending.library
  runtime.selection = resolveContentSelection(pending.library, runtime.selection).selection
  runtime.dialogue = resolveDialogueBehavior(pending.library, runtime.selection)
  deps.setDialogueBehavior(runtime.dialogue)
  rebuildPreviewTargets(runtime)
  // The pet window must re-read the merged catalog so the imported pack appears
  // there too (flush on hub close; no duplicate window logic).
  if (contentShell) contentWindowNeedsPetReload = true
  try {
    applyAppearance(document, runtime.library, runtime.selection)
  } catch (error) {
    deps.reportFailure(deps.uiBoundary, error)
  }
  const verb = pending.unchanged ? '已存在相同内容包' : pending.replaced ? '已更新内容包' : '已导入内容包'
  const unsupported = pending.pack.roleThemes.filter(
    (theme) => !evaluateRoleThemeSupport(runtime.baseLibrary, theme).supported,
  ).length
  const supportNote =
    unsupported > 0
      ? '；其中 ' + unsupported + ' 个角色主题需远程市场安装器才能实际渲染，已导入但不可一键应用。'
      : ''
  return {
    ok: true,
    message:
      verb +
      '「' +
      pending.pack.name +
      '」：' +
      pending.pack.roleThemes.length +
      ' 个角色主题，统一用途声明已确认，仅本地数据、未联网。' +
      supportNote +
      assetNote,
    installedCount: runtime.themePacks.length + runtime.installedPacks.length,
  }
}

/** Rows for the 内容包 tab: v1 local packs + imported v2 role-theme packs. */
function installedPackSummaries(): readonly ContentHubInstalledPack[] {
  const runtime = contentRuntime
  if (!runtime) return Object.freeze([])
  const out: ContentHubInstalledPack[] = []
  for (const raw of runtime.installedPacks) {
    const validation = validateContentPack(raw)
    if (!validation.ok) continue
    const pack = validation.pack
    out.push(
      Object.freeze({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        kind: 'v1' as const,
        roleThemes: 0,
        declaration: false,
      }),
    )
  }
  for (const raw of runtime.themePacks) {
    const validation = validateContentPackV2(raw)
    if (!validation.ok) continue
    const pack = validation.pack
    const unsupported = pack.roleThemes.filter(
      (theme) => !evaluateRoleThemeSupport(runtime.baseLibrary, theme).supported,
    )
    const fontFamilies = runtime.fontFamiliesByPack.get(pack.id)
    out.push(
      Object.freeze({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        kind: 'role-theme' as const,
        roleThemes: pack.roleThemes.length,
        declaration: true,
        aiDisclosure: pack.aiProvenance.disclosure,
        license: pack.license.spdx + ' / ' + pack.license.attribution,
        ...(unsupported.length > 0
          ? {
              note:
                '已导入但需远程市场安装器：' +
                unsupported.map((theme) => theme.name).join('、') +
                ' 的角色动画/声音本机暂不可用。',
            }
          : {}),
        ...(fontFamilies !== undefined && fontFamilies.length > 0
          ? { fontFamilies: Object.freeze([...fontFamilies]) }
          : {}),
      }),
    )
  }
  return Object.freeze(out)
}

  // ----- independent content/settings window boot (MB-062 / E6) -----
// ---------------------------------------------------------------------------
// Independent content/settings window boot (MB-062 / E6, task-85)
//
// Same modules as the pet window: ensureContentRuntime() builds the role content
// center, desktop-shell.ts builds the #pet-settings dialog, and the shared
// consent gate gates both. This section only routes between the home surface and
// the two panels and bridges role/appearance edits back to the live pet window.
// ---------------------------------------------------------------------------
function presentContentWindowRoute(route: ContentWindowRoute): void {
  const target = normalizeContentWindowRoute(route)
  contentWindowTransition = true
  try {
    if (target === 'settings') {
      contentRuntime?.hub?.close(false)
      contentWindowChrome?.hideHome()
      const focus = takeContentWindowFocus(contentStorage())
      if (!openDesktopSettingsDialog(focus ?? undefined)) contentWindowChrome?.showHome()
      return
    }
    closeDesktopSettingsDialog(false)
    contentWindowChrome?.hideHome()
    void openContentHubInWindow()
      .then((opened) => {
        if (!opened) contentWindowChrome?.showHome()
      })
      .catch((error) => {
        deps.reportFailure(deps.uiBoundary, error)
        contentWindowChrome?.showHome()
      })
  } finally {
    contentWindowTransition = false
  }
}

/**
 * Boot the content window: load the pet archive once (read-only; the settings
 * dialog reuses mute/volume/save/load from it), build the shared content runtime
 * and settings dialog, then show the requested panel. Never boots the pet loop,
 * hero, Advisers, hit regions or autosave.
 */
async function bootContentWindowOnce(): Promise<void> {
  if (contentWindowBooted) return
  contentWindowBooted = true
  try {
    // Read-only load; a corrupt archive keeps the defaults and the dialog still
    // works. There is no autosave in this window (see the guarded interval).
    await deps.loadNow()
  } catch (error) {
    deps.reportFailure(deps.loadBoundary, error)
  }
  deps.renderVoiceMode()
  deps.render()
  await ensureContentRuntime()
  contentWindowChrome = installContentWindowChrome({
    document,
    openRoute: presentContentWindowRoute,
    closeWindow: closeContentWindow,
  })
  if (hasTauri) {
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<string>(CONTENT_WINDOW_NAVIGATE_EVENT, (event) => {
          contentWindowChrome?.showRoute(normalizeContentWindowRoute(event.payload))
        }),
      )
      .catch((error: unknown) => {
        console.warn('[pet] content window navigation unavailable', error)
      })
  }
  contentWindowChrome.showRoute(contentWindow.route)
}

  /**
   * Switch the content window to `route` while suppressing the hub's
   * onClose→showHome callback (the same guard main.ts used inline).
   */
  function showContentWindowRoute(route: ContentWindowRoute): void {
    contentWindowTransition = true
    try {
      contentWindowChrome?.showRoute(route)
    } finally {
      contentWindowTransition = false
    }
  }

  /** Settings dialog closed by the user: return the content window to its home surface. */
  function handleContentWindowSettingsClosed(): void {
    if (!contentShell || contentWindowTransition) return
    contentWindowChrome?.showHome()
  }

  /**
   * Boot-time restore hook (task-111): main.ts calls this once the hero scene is
   * ready, so the persisted active character pack is hot-swapped in without a
   * page reload. The adapter owns the persisted-id validation and the built-in
   * fallback; this wrapper only ensures the content runtime exists.
   */
  async function restoreActiveCharacterPack(): Promise<CharacterPackActionOutcome | null> {
    const runtime = await ensureContentRuntime()
    const adapter = runtime?.characterPacks ?? null
    if (adapter === null) return null
    try {
      return await adapter.restoreActive()
    } catch (error) {
      deps.reportFailure(deps.uiBoundary, error)
      return null
    }
  }

  /**
   * Cross-window sync hook (task-111): the independent content window tells this
   * pet window that installed packs / the saved appearance changed. Refresh the
   * registry and hot-swap (or restore built-in) without a page reload.
   */
  async function syncCharacterPackAppearance(): Promise<CharacterPackActionOutcome | null> {
    const runtime = await ensureContentRuntime()
    const adapter = runtime?.characterPacks ?? null
    if (adapter === null) return null
    try {
      return await adapter.syncActive()
    } catch (error) {
      deps.reportFailure(deps.uiBoundary, error)
      return null
    }
  }

  /**
   * Pet-window side of the built-in role hot switch (E4 MB-041): the content
   * window already persisted the six keys + role-theme key; re-read them here and
   * re-run the appearance/dialogue lifecycles WITHOUT a reload, then hand the
   * persisted TTS voice back to main.ts so its existing voice-change lifecycle
   * (badge + separate TTS declaration re-prompt) runs in the window that speaks.
   */
  async function syncSavedRoleSelection(): Promise<SavedRoleSelectionSync | null> {
    const runtime = await ensureContentRuntime()
    if (runtime === null) return null
    const storage = contentStorage()
    const selection = readContentSelection(runtime.library, storage)
    const roleTheme = readRoleThemeSelection(runtime.library, storage)
    runtime.selection = selection
    runtime.roleThemeId = roleTheme.roleThemeId
    runtimeRendererChoice = readPersistedRendererChoice()
    const character = findContent(runtime.library, 'characters', selection.character) as
      | ContentCharacterEntry
      | undefined
    const voice =
      character !== undefined && character.voiceMode === 'tts' && isTtsVoiceId(selection.voice)
        ? selection.voice
        : null
    try {
      applyAppearance(document, runtime.library, selection)
    } catch (error) {
      deps.reportFailure(deps.uiBoundary, error)
    }
    runtime.dialogue = resolveDialogueBehavior(runtime.library, selection)
    deps.setDialogueBehavior(runtime.dialogue)
    deps.renderVoiceMode()
    runtime.hub?.refresh()
    return { ok: true, voice }
  }

  /**
   * Pet-window local half of the MB-041 hot switch: swap the live hero scene,
   * re-read the selection the content window persisted (appearance/dialogue) and
   * run the existing voice-change lifecycle in the window that actually speaks.
   * Never throws: the caller rolls the persisted role back when !ok.
   */
  async function applyBuiltinRendererLocally(choice: PetRendererChoice): Promise<BuiltinRendererApplyOutcome> {
    const switchScene = deps.switchBuiltinHeroCharacter
    if (switchScene === undefined) return { ok: false, message: '当前窗口没有接入实时渲染切换' }
    let swapped: Awaited<ReturnType<typeof switchScene>>
    try {
      swapped = await switchScene(choice)
    } catch (error) {
      deps.reportFailure(deps.uiBoundary, error)
      return { ok: false, message: '切换渲染器时发生内部错误' }
    }
    if (!swapped.ok) return { ok: false, message: swapped.reason }
    try {
      const synced = await syncSavedRoleSelection()
      const persistedVoice = synced?.voice ?? null
      if (persistedVoice !== null && persistedVoice !== deps.getCurrentVoice()) {
        // Existing TTS lifecycle: re-prompts the separate declaration, never auto-accepted.
        deps.applyVoicePreference(persistedVoice)
      } else {
        deps.renderVoiceMode()
      }
    } catch (error) {
      deps.reportFailure(deps.uiBoundary, error)
    }
    return { ok: true, message: '已实时切换内置渲染器。' }
  }

  return {
    ensureContentRuntime,
    openContentHubInWindow,
    openContentHubFromMenu,
    openSettingsInContentWindow,
    requestPetWindowReload,
    closeContentWindow,
    bootContentWindowOnce,
    showContentWindowRoute,
    handleContentWindowSettingsClosed,
    getContentRuntime: () => contentRuntime,
    isContentHubOpen: () => contentRuntime?.hub?.isOpen() === true,
    closeContentHubPanel: () => contentRuntime?.hub?.close(false),
    restoreActiveCharacterPack,
    syncCharacterPackAppearance,
    syncSavedRoleSelection,
    applyBuiltinRendererLocally,
  }
}
