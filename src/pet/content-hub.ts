/**
 * Role & content center (角色与内容中心) for famling, on top of famling.content/0.2.
 *
 * Product model (2026-11-19 user clarification): **the role IS the theme**.
 * Applying one role preset switches the character look + voice + dialogue +
 * behaviour + bubble/background/font appearance in one click. The six component
 * categories remain available as optional building blocks so the user can
 * customise individual pieces on top of a role, then restore the role defaults.
 *
 * Top-level information architecture (v2):
 *   角色      one-click rolePresets / installed role themes (current marker)
 *   自定义    voice / dialogue / theme / background / font overrides + restore
 *   内容包    installed packs + local .json / .zip / folder import with the
 *             mandatory unified usage declaration and explicit confirmation
 *   市场      remote market entry point (unconfigured by default, never fetches)
 *
 * E10 split (task-96, 2026-11-20): the per-tab market / content-pack / role
 * rendering and their pure model helpers now live in src/pet/content-hub/
 * (market.ts, packs.ts, roles.ts, shared.ts). This file keeps the dialog
 * controller and re-exports the original './content-hub.ts' public surface
 * unchanged, so main.ts and existing tests keep importing from here.
 *
 * E10 init split (task-128 / MB-101, 2026-11-20): `initContentHub` itself no
 * longer builds the dialog or owns the per-tab controllers. The static shell is
 * src/pet/content-hub/dialog-shell.ts, open/close + focus trap is
 * dialog-behavior.ts, throw-safe host getters are host-accessors.ts, and the
 * 角色/自定义, 内容包 (theme-pack import + character-pack installer wiring) and
 * 市场 controllers live in roles-controller.ts, packs-controller.ts,
 * character-controller.ts and market-controller.ts. This barrel now only
 * composes them: behaviour and the public API are unchanged.
 *
 * Security boundaries: declarative JSON/assets only; every dynamic string goes
 * through textContent; blank/unsafe imports produce visible errors; the
 * canonical research-only notice is always in the footer; pack assets are
 * persisted through an injected asset store (IndexedDB or memory fallback) and
 * previews use locally generated object URLs only.
 */
import {
  CONTENT_BACKGROUND_VAR,
  CONTENT_FONT_VAR,
  CONTENT_THEME_VAR_NAMES,
  applyAppearance,
  resolveContentSelection,
  type ContentAppearanceDocumentLike,
  type ContentAppearanceResult,
  type ContentCategory,
  type ContentCharacterTheme,
  type ContentLibrary,
  type ContentSelection,
  type DialogueBehavior,
  type SelectionKey,
} from './content-library.ts'
import type { CharacterPackHubAdapter } from './content-hub/character-installer.ts'
import { createCharacterPackTabController } from './content-hub/character-controller.ts'
import { createContentHubDialog } from './content-hub/dialog-behavior.ts'
import { createContentHubDialogShell } from './content-hub/dialog-shell.ts'
import { createContentHubHostAccessors } from './content-hub/host-accessors.ts'
import type {
  ContentHubMarketRefreshResult,
  ContentMarketUiState,
  RemoteMarketSource,
} from './content-hub/market.ts'
import { createMarketTabController, type MarketTabController } from './content-hub/market-controller.ts'
import type { MarketInstallHostOptions } from './content-hub/market-install.ts'
import type {
  ContentHubInstalledPack,
  ContentPackFileSelection,
  PreparedThemePackImport,
  ThemePackPrepareResult,
} from './content-hub/packs.ts'
import { createPacksTabController } from './content-hub/packs-controller.ts'
import { createRolesTabController } from './content-hub/roles-controller.ts'
import {
  CONTENT_HUB_DOCS_HREF,
  CONTENT_HUB_NOTICE,
  createHubBusyFlag,
  type HubFeedbackSink,
  type HubRenderSurface,
} from './content-hub/shared.ts'

// ---------------------------------------------------------------------------
// v2 top-level tabs
// ---------------------------------------------------------------------------

export type ContentHubTopTab = 'roles' | 'customize' | 'packs' | 'market'

export interface ContentHubTopTabDefinition {
  readonly id: ContentHubTopTab
  readonly label: string
  /** One-line explanation shown above the tab content. */
  readonly blurb: string
}

/** The four v2 top-level tabs, in stable UI order. */
export const CONTENT_HUB_TOP_TABS: readonly ContentHubTopTabDefinition[] = Object.freeze([
  { id: 'roles', label: '角色', blurb: '角色就是主题：一键切换角色外观 / 声音 / 对话 / 行为与气泡配色。' },
  { id: 'customize', label: '自定义', blurb: '在当前角色主题上逐项调整；只覆盖对应组件，可恢复角色默认。' },
  { id: 'packs', label: '内容包', blurb: '导入本地 .json / .zip 素材包或文件夹；导入前必须确认统一用途声明。' },
  { id: 'market', label: '市场', blurb: '远程在线市场入口；默认不联网，服务器未配置时只显示状态。' },
])

/** Catalog category -> persisted selection key (legacy six-tab UI order). */
export const CONTENT_CATEGORY_SELECTION_KEY: Readonly<Record<ContentCategory, SelectionKey>> = Object.freeze({
  characters: 'character',
  voices: 'voice',
  dialoguePacks: 'dialoguePack',
  themes: 'theme',
  backgrounds: 'background',
  fonts: 'font',
})

/** Legacy six category tabs, kept for existing callers/tests (not rendered). */
export interface ContentHubTab {
  readonly category: ContentCategory
  readonly label: string
  readonly blurb: string
}

/** @deprecated v2 renders CONTENT_HUB_TOP_TABS; kept for back-compat. */
export const CONTENT_HUB_TABS: readonly ContentHubTab[] = Object.freeze([
  { category: 'characters', label: '角色', blurb: '选择桌宠角色；切换会沿用既有渲染器生命周期并刷新页面。' },
  { category: 'voices', label: '声音', blurb: 'TTS 音色（stella / tide）；切换会改变 TTS 配置签名并重新弹出语音声明。' },
  { category: 'dialoguePacks', label: '对话', blurb: '气泡频率与长度策略；即时生效，错误/关键提示不受影响。' },
  { category: 'themes', label: '主题', blurb: '气泡与面板配色；即时应用，不需要刷新。' },
  { category: 'backgrounds', label: '背景', blurb: '桌宠背景；透明仍是默认值，即时应用。' },
  { category: 'fonts', label: '字体', blurb: '本地字体栈；不使用网络字体，即时应用。' },
])

// ---------------------------------------------------------------------------
// Appearance helper (unchanged from v1: default entries stay CSS-owned)
// ---------------------------------------------------------------------------

/**
 * Apply the theme/background/font selection. Default entries are deliberately
 * treated as no override: their visuals already live in pet.css as fallbacks,
 * so a fresh profile stays pixel-identical while non-default choices apply
 * immediately (no reload).
 */
export function applyContentSelectionAppearance(
  doc: ContentAppearanceDocumentLike,
  library: ContentLibrary,
  selection?: Partial<ContentSelection> | null,
): ContentAppearanceResult {
  const result = applyAppearance(doc, library, selection)
  const resolved = resolveContentSelection(library, selection)
  const root = doc.documentElement
  const removed: string[] = []
  const removeVar = (name: string): void => {
    if (!(name in result.vars)) return
    try {
      root.style.removeProperty(name)
    } catch {
      // A read-only fake/blocked style object must not break the selection.
    }
    removed.push(name)
  }
  if (resolved.selection.theme === library.defaults.theme) {
    for (const name of Object.values(CONTENT_THEME_VAR_NAMES)) removeVar(name)
  }
  if (resolved.selection.background === library.defaults.background) removeVar(CONTENT_BACKGROUND_VAR)
  if (resolved.selection.font === library.defaults.font) removeVar(CONTENT_FONT_VAR)
  if (removed.length === 0) return result
  const vars: Record<string, string> = {}
  for (const [name, value] of Object.entries(result.vars)) {
    if (!removed.includes(name)) vars[name] = value
  }
  return Object.freeze({ vars: Object.freeze(vars), dataset: result.dataset })
}

// ---------------------------------------------------------------------------
// Dialogue policy (unchanged from v1)
// ---------------------------------------------------------------------------

export type DialogueLineKind = 'ambient' | 'interactive' | 'explicit'

export interface DialogueLineDecision {
  readonly show: boolean
  readonly text: string | null
  readonly kind: DialogueLineKind
  readonly reason: 'explicit' | 'ok' | 'ambient-suppressed' | 'empty'
}

/** Decide one bubble; pure and deterministic when random is injected. */
export function decideDialogueLine(
  behavior: DialogueBehavior | null | undefined,
  kind: DialogueLineKind,
  text: string,
  random?: () => number,
): DialogueLineDecision {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return Object.freeze({ show: false, text: null, kind, reason: 'empty' as const })
  }
  if (kind === 'explicit' || !behavior) {
    return Object.freeze({ show: true, text, kind, reason: 'explicit' as const })
  }
  const shaped = behavior.clampText(text)
  if (shaped.trim().length === 0) {
    return Object.freeze({ show: false, text: null, kind, reason: 'empty' as const })
  }
  if (kind === 'ambient') {
    if (!behavior.ambientBubbles) {
      return Object.freeze({ show: false, text: null, kind, reason: 'ambient-suppressed' as const })
    }
    if (!behavior.shouldShowBubble(random)) {
      return Object.freeze({ show: false, text: null, kind, reason: 'ambient-suppressed' as const })
    }
  }
  return Object.freeze({ show: true, text: shaped, kind, reason: 'ok' as const })
}

// ---------------------------------------------------------------------------
// Controller / host wiring
// ---------------------------------------------------------------------------

export interface ContentHubSelectResult {
  readonly ok: boolean
  /** Visible feedback line shown in the panel (never thrown, never HTML). */
  readonly message: string
  /** Close the panel after this action (e.g. a renderer switch reloads). */
  readonly close?: boolean
}

export interface ContentHubImportResult {
  readonly ok: boolean
  readonly message: string
  readonly installedCount?: number
}

/**
 * Host callbacks. main.ts owns storage, consent checks, renderer reload,
 * voice-preference/TTS re-prompt, appearance/dialogue application and asset
 * persistence; this module only renders and forwards intents (so no side effect
 * can happen without the host re-checking the consent gate).
 */
export interface ContentHubOptions {
  readonly document?: Document
  readonly getLibrary: () => ContentLibrary | null
  readonly getSelection: () => ContentSelection | null
  /** Last applied character theme id (null = custom/unknown). */
  readonly getRoleThemeId?: () => string | null
  /** Catalog without installed v2 themes (for runtime-support checks). */
  readonly getBaseLibrary?: () => ContentLibrary | null
  /** One-click role application (six keys + role key + lifecycles). */
  readonly applyRole: (roleThemeId: string) => ContentHubSelectResult
  /** Single-component override on top of the current role. */
  readonly customize: (key: SelectionKey, id: string) => ContentHubSelectResult
  /** Restore the current role theme's six defaults. */
  readonly restoreRole?: () => ContentHubSelectResult
  /** Validate a selected local pack; nothing is installed yet. */
  readonly prepareImport: (selection: ContentPackFileSelection) => Promise<ThemePackPrepareResult>
  /** Explicitly confirmed install (persist manifest + assets, refresh UI). */
  readonly commitImport: (pending: PreparedThemePackImport) => Promise<ContentHubImportResult>
  readonly getInstalledPacks?: () => readonly ContentHubInstalledPack[]
  /**
   * Optional character-pack installer (IndexedDB host + CharacterPackRuntime),
   * created by main.ts. When absent/`null` the 内容包 tab shows an honest
   * 「安装器未注入」 note; the theme-pack import flow is unaffected.
   */
  readonly characterPacks?: CharacterPackHubAdapter | null
  readonly getMarketState?: () => ContentMarketUiState
  /**
   * Called ONLY from the user's 「刷新市场目录…」 click, and only when the
   * injected market state reports configured:true (see canRequestRemoteMarket).
   * The host should wire createRemoteMarketRefresh(client) from content-market.ts
   * (which itself requires a host-injected transport); leaving it undefined keeps
   * the market button disabled and the build offline.
   */
  readonly refreshMarket?: () => Promise<ContentHubMarketRefreshResult>
  /**
   * Optional injected remote market source (E8 / MB-084). Absent = the original
   * metadata-only placeholder (no installer UI, zero network). When present the
   * 市场 tab gains the install progress / cancel / failure-recovery / offline /
   * uninstall / version-lock UI; injection is inert (no source method is called
   * until an explicit user click) and the default production wiring stays absent.
   */
  readonly marketSource?: RemoteMarketSource | null
  /**
   * Host seams for the injected market installer: pinned trust root + verifier,
   * storage for installed versions/locks, and the uninstall callback. Without
   * verify deps the UI fails closed (directory + install disabled).
   */
  readonly marketHost?: ContentHubMarketHost
  /** Local object URL for an installed pack preview (builtin themes use path). */
  readonly resolvePreviewUrl?: (theme: ContentCharacterTheme) => string | null
  readonly onClose?: () => void
  readonly docsHref?: string
}

/** Host seams accepted by the market installer (onChange is owned by the hub). */
export type ContentHubMarketHost = Omit<MarketInstallHostOptions, 'onChange'>

export interface ContentHubController {
  readonly root: HTMLElement | null
  /** True when the panel became/continues to be visible; false without a catalog. */
  open(): boolean
  close(restoreFocus?: boolean): void
  isOpen(): boolean
  refresh(): void
  destroy(): void
  /** Test/diagnostic hook: pending confirmation state, never HTML. */
  hasPendingImport(): boolean
  /** Test/diagnostic hook: true when a market install adapter was injected. */
  hasMarketInstaller(): boolean
}

function inertHubController(): ContentHubController {
  return Object.freeze({
    root: null,
    open: (): boolean => false,
    close: (): void => {},
    isOpen: (): boolean => false,
    refresh: (): void => {},
    destroy: (): void => {},
    hasPendingImport: (): boolean => false,
    hasMarketInstaller: (): boolean => false,
  })
}

/**
 * Build the role & content center dialog into pet.html's static mount point.
 * Only textContent and validated attributes are ever written; every action is a
 * real button and the dialog traps Tab, closes on Escape and restores focus.
 *
 * Composition only (E10 / MB-101): dialog-shell.ts builds the DOM,
 * dialog-behavior.ts owns open/close + focus, host-accessors.ts normalises the
 * host seams and the per-tab controllers own their render/import/market wiring.
 * Behaviour through the returned controller is unchanged from the pre-split
 * implementation; main.ts / tests keep importing the same barrel.
 */
export function initContentHub(options: ContentHubOptions): ContentHubController {
  const doc = options.document ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return inertHubController()
  const hubDoc: Document = doc

  let activeTab: ContentHubTopTab = 'roles'
  let marketController: MarketTabController | null = null
  const accessors = createContentHubHostAccessors(options)
  const busy = createHubBusyFlag()

  const shell = createContentHubDialogShell<ContentHubTopTab>(hubDoc, {
    tabs: CONTENT_HUB_TOP_TABS,
    docsHref: options.docsHref,
    onActivateTab: (id, focusTab): void => {
      activateTab(id, focusTab)
    },
  })
  const feedback: HubFeedbackSink = {
    setFeedback: shell.setFeedback,
    setIssues: shell.setIssues,
  }

  const dialog = createContentHubDialog({
    document: hubDoc,
    root: shell.root,
    panelBody: shell.panelBody,
    closeButton: shell.closeButton,
    backdrop: shell.backdrop,
    tabButtons: shell.tabButtons,
    getActiveTab: (): string => activeTab,
    canOpen: (): boolean => accessors.getLibrary() !== null,
    onOpen: (): void => {
      shell.setFeedback('', 'info')
      shell.setIssues([])
      renderTabs()
      renderPanel()
      updatePackSummary()
    },
    onHostClose: options.onClose,
    onDestroy: (): void => {
      marketController?.destroy()
    },
  })

  const roles = createRolesTabController({
    accessors,
    docsHref: options.docsHref ?? CONTENT_HUB_DOCS_HREF,
    resolvePreviewUrl: options.resolvePreviewUrl,
    applyRole: options.applyRole,
    customize: options.customize,
    restoreRole: options.restoreRole,
    feedback,
    onChange: (): void => {
      renderPanel()
    },
    onSummary: (): void => {
      updatePackSummary()
    },
    onClose: (): void => {
      dialog.close(true)
    },
  })

  const characterPacks = createCharacterPackTabController({
    root: shell.root,
    getAdapter: () => options.characterPacks,
    feedback,
    onChange: (): void => {
      renderPanel()
    },
    onSummary: (): void => {
      updatePackSummary()
    },
  })

  const packs = createPacksTabController({
    root: shell.root,
    getInstalledPacks: accessors.getInstalledPacks,
    prepareImport: options.prepareImport,
    commitImport: options.commitImport,
    characterTabContext: () => characterPacks.tabContext(),
    busy,
    feedback,
    onChange: (): void => {
      renderPanel()
    },
    onSummary: (): void => {
      updatePackSummary()
    },
  })

  const market = createMarketTabController({
    marketSource: options.marketSource,
    marketHost: options.marketHost,
    refreshMarket: options.refreshMarket,
    getMarketState: options.getMarketState,
    busy,
    feedback,
    onChange: (): void => {
      renderPanel()
    },
    onSummary: (): void => {
      updatePackSummary()
    },
    isActive: (): boolean => dialog.isOpen() && activeTab === 'market',
  })
  marketController = market

  function renderTabs(): void {
    shell.renderTabs(activeTab)
  }

  function renderSurface(): HubRenderSurface {
    return {
      doc: hubDoc,
      create: shell.create,
      panelBody: shell.panelBody,
      appendEmpty: (text: string): void => {
        shell.appendEmpty(text)
      },
    }
  }

  function updatePackSummary(): void {
    const count = accessors.getInstalledPacks().length
    const characterCount = characterPacks.installedCount()
    const base = count > 0 ? '已安装内容包：' + count + ' 个' : '未安装内容包'
    shell.setPackSummary(characterCount > 0 ? base + ' · 已登记角色包：' + characterCount + ' 个' : base)
  }

  function renderPanel(): void {
    shell.panelBody.replaceChildren()
    shell.setIssues([])
    if (accessors.getLibrary() === null) {
      shell.appendEmpty('内容目录尚未加载，请稍后再试。')
      return
    }
    shell.appendBlurb(activeTab)
    switch (activeTab) {
      case 'roles':
        roles.renderRoles(renderSurface())
        break
      case 'customize':
        roles.renderCustomize(renderSurface())
        break
      case 'packs':
        packs.renderPacks(renderSurface())
        break
      case 'market':
        market.renderMarket(renderSurface())
        break
      default:
        break
    }
  }

  function activateTab(id: ContentHubTopTab, focusTab: boolean): void {
    activeTab = id
    // A pending destructive confirmation must not survive a tab switch.
    if (id !== 'market') market.cancelUninstallConfirm()
    renderTabs()
    renderPanel()
    shell.setFeedback('', 'info')
    if (focusTab) shell.tabButtons.get(id)?.focus()
  }

  return Object.freeze({
    root: shell.root,
    open: dialog.open,
    close: dialog.close,
    isOpen: dialog.isOpen,
    refresh: (): void => {
      if (!dialog.isOpen()) return
      renderTabs()
      renderPanel()
      updatePackSummary()
    },
    destroy: dialog.destroy,
    hasPendingImport: (): boolean => packs.hasPendingImport(),
    hasMarketInstaller: (): boolean => market.hasInstaller(),
  })
}

// ---------------------------------------------------------------------------
// Public API back-compat (unchanged import surface for main.ts / tests)
// ---------------------------------------------------------------------------

export { CONTENT_HUB_DOCS_HREF, CONTENT_HUB_NOTICE }
export { CONTENT_HUB_ID } from './content-hub/dialog-shell.ts'
export {
  CONTENT_CUSTOMIZE_GROUPS,
  evaluateRoleThemeSupport,
  planStartupRoleTheme,
  summarizeRoleTheme,
} from './content-hub/roles.ts'
export type {
  ContentCustomizeGroup,
  RoleThemeSummary,
  RoleThemeSupport,
  StartupRoleHints,
  StartupRolePlan,
  StartupRolePlanSource,
} from './content-hub/roles.ts'
export {
  CONTENT_INSTALLED_PACKS_KEY,
  CONTENT_INSTALLED_PACKS_MAX_BYTES,
  CONTENT_INSTALLED_PACKS_VERSION,
  CONTENT_PACK_IMPORT_MESSAGES,
  CONTENT_RUNTIME_PACK_CATEGORIES,
  CONTENT_THEME_PACKS_KEY,
  CONTENT_THEME_PACKS_MAX,
  CONTENT_THEME_PACKS_MAX_BYTES,
  CONTENT_THEME_PACKS_VERSION,
  PROHIBITED_USE_LABELS,
  commitPreparedThemePack,
  isRuntimeImportableCategory,
  prepareContentPackImport,
  prepareThemePackImport,
  readInstalledContentPacks,
  readInstalledThemePacks,
  writeInstalledContentPacks,
  writeInstalledThemePacks,
} from './content-hub/packs.ts'
export type {
  ContentHubInstalledPack,
  ContentPackFileSelection,
  ContentPackImportResult,
  ContentRuntimePackCategory,
  InstalledPacksReadResult,
  InstalledPacksReadStatus,
  InstalledPacksWriteResult,
  InstalledPacksWriteStatus,
  PreparedThemePackImport,
  ThemePackCommitResult,
  ThemePackPrepareResult,
  ThemePacksReadResult,
  ThemePacksReadStatus,
  ThemePacksWriteResult,
} from './content-hub/packs.ts'
export {
  CONTENT_MARKET_CONTRACT_STEPS,
  canRequestRemoteMarket,
  defaultContentMarketState,
  describeContentMarketState,
  isRemoteMarketConfigured,
  summarizeMarketCatalog,
} from './content-hub/market.ts'
export type {
  ContentHubMarketRefreshResult,
  ContentMarketListing,
  ContentMarketUiState,
  ContentMarketUiStatus,
  RemoteMarketSource,
  RemoteMarketVerifyDeps,
} from './content-hub/market.ts'
