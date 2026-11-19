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
  type ContentIssue,
  type ContentLibrary,
  type ContentSelection,
  type DialogueBehavior,
  type SelectionKey,
} from './content-library.ts'
import {
  canRequestRemoteMarket,
  defaultContentMarketState,
  describeContentMarketState,
  renderMarketTab,
  type ContentHubMarketRefreshResult,
  type ContentMarketUiState,
  type MarketTabRenderContext,
  type RemoteMarketSource,
} from './content-hub/market.ts'
import {
  createMarketInstallController,
  type MarketInstallActionResult,
  type MarketInstallController,
  type MarketInstallHostOptions,
  type MarketInstallUiState,
} from './content-hub/market-install.ts'
import {
  fileListOf,
  readFolderSelection,
  readSingleSelection,
  renderPacksTab,
  type CharacterPackTabContext,
  type ContentHubFileLike,
  type ContentHubInstalledPack,
  type ContentPackFileSelection,
  type PreparedThemePackImport,
  type ThemePackPrepareResult,
} from './content-hub/packs.ts'
import {
  characterPackUnavailableState,
  type CharacterPackConsentInput,
  type CharacterPackConsentKey,
  type CharacterPackHubAdapter,
  type CharacterPackPrepared,
  type CharacterPackUiState,
} from './content-hub/character-installer.ts'
import { renderCustomizeTab, renderRolesTab, type RolesTabRenderContext } from './content-hub/roles.ts'
import { CONTENT_HUB_DOCS_HREF, CONTENT_HUB_NOTICE } from './content-hub/shared.ts'

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

/** Mount point id in pet.html (JS builds the panel into this container). */
export const CONTENT_HUB_ID = 'content-hub-root'

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

const CONTENT_HUB_PANEL_ID = 'content-hub-panel'
const CONTENT_HUB_TITLE_ID = 'content-hub-title'
const CONTENT_HUB_TAB_ID_PREFIX = 'content-hub-tab-'

/**
 * Build the role & content center dialog into pet.html's static mount point.
 * Only textContent and validated CSS tokens are ever written; every action is a
 * real button and the dialog traps Tab, closes on Escape and restores focus.
 */
export function initContentHub(options: ContentHubOptions): ContentHubController {
  const doc = options.document ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return inertHubController()
  const hubDoc: Document = doc

  const existing = hubDoc.getElementById(CONTENT_HUB_ID)
  const rootElement = existing ?? hubDoc.createElement('div')
  if (!existing) {
    rootElement.id = CONTENT_HUB_ID
    const host = hubDoc.body ?? hubDoc.documentElement
    host.append(rootElement)
  }
  rootElement.className = 'content-hub-root'
  rootElement.setAttribute('role', 'dialog')
  rootElement.setAttribute('aria-modal', 'true')
  rootElement.setAttribute('aria-labelledby', CONTENT_HUB_TITLE_ID)
  rootElement.hidden = true
  rootElement.inert = true
  rootElement.dataset.state = 'closed'
  rootElement.replaceChildren()

  const create = <K extends keyof HTMLElementTagNameMap>(tag: K, className = ''): HTMLElementTagNameMap[K] => {
    const node = hubDoc.createElement(tag)
    if (className !== '') node.className = className
    return node
  }

  const backdrop = create('div', 'content-hub-backdrop')
  const panel = create('section', 'content-hub-panel')
  const header = create('header', 'content-hub-head')
  const headText = create('div', 'content-hub-headtext')
  const kicker = create('p', 'content-hub-kicker')
  kicker.textContent = 'ROLE & CONTENT CENTER'
  const title = create('h2', 'content-hub-title')
  title.id = CONTENT_HUB_TITLE_ID
  title.textContent = '角色与内容中心'
  const subtitle = create('p', 'content-hub-sub')
  subtitle.textContent = '角色就是主题 · 一键切换角色外观 / 声音 / 对话与配色 · 本地内容优先，默认不联网'
  headText.append(kicker, title, subtitle)
  const closeButton = create('button', 'content-hub-close')
  closeButton.type = 'button'
  closeButton.textContent = '合上'
  closeButton.setAttribute('aria-label', '关闭角色与内容中心')
  header.append(headText, closeButton)

  const tabList = create('div', 'content-hub-tabs')
  tabList.setAttribute('role', 'tablist')
  tabList.setAttribute('aria-label', '角色与内容分类')
  const tabs: { readonly tab: HTMLButtonElement; readonly id: ContentHubTopTab }[] = []
  const tabButtons = new Map<ContentHubTopTab, HTMLButtonElement>()
  for (const definition of CONTENT_HUB_TOP_TABS) {
    const tab = create('button', 'content-hub-tab')
    tab.type = 'button'
    tab.id = CONTENT_HUB_TAB_ID_PREFIX + definition.id
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', CONTENT_HUB_PANEL_ID)
    tab.setAttribute('aria-selected', 'false')
    tab.tabIndex = -1
    tab.textContent = definition.label
    tab.addEventListener('click', () => {
      activateTab(definition.id, false)
    })
    tab.addEventListener('keydown', (event) => {
      handleTabKey(event, definition.id)
    })
    tabs.push({ tab, id: definition.id })
    tabButtons.set(definition.id, tab)
    tabList.append(tab)
  }

  const panelBody = create('div', 'content-hub-body')
  panelBody.id = CONTENT_HUB_PANEL_ID
  panelBody.setAttribute('role', 'tabpanel')
  panelBody.tabIndex = 0
  const feedback = create('p', 'content-hub-feedback')
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')
  const issueList = create('ul', 'content-hub-issues')
  issueList.hidden = true
  const footer = create('footer', 'content-hub-foot')
  const notice = create('p', 'content-hub-notice')
  notice.textContent = CONTENT_HUB_NOTICE
  const footRow = create('div', 'content-hub-footrow')
  const docsLink = create('a', 'content-hub-docs')
  docsLink.href = options.docsHref ?? CONTENT_HUB_DOCS_HREF
  docsLink.target = '_blank'
  docsLink.rel = 'noopener noreferrer'
  docsLink.textContent = '内容包 / 市场规范（canonical）'
  const packSummary = create('span', 'content-hub-packsum')
  footRow.append(docsLink, packSummary)
  footer.append(notice, footRow)
  panel.append(header, tabList, panelBody, feedback, issueList, footer)
  rootElement.replaceChildren(backdrop, panel)

  let openState = false
  let activeTab: ContentHubTopTab = 'roles'
  let returnFocus: HTMLElement | null = null
  let inertedApp: HTMLElement | null = null
  let pendingImport: PreparedThemePackImport | null = null
  let importBusy = false
  let marketState: ContentMarketUiState | null = null
  // Character-pack installer (experimental, injected by main.ts): the preview
  // holds only an opaque token; bytes live in the host adapter.
  let characterPrepared: CharacterPackPrepared | null = null
  let characterConsent: CharacterPackConsentInput = Object.freeze({
    usageConfirmed: false,
    licenseAcknowledged: false,
    aiDisclosureAcknowledged: false,
  })
  let characterConfirm: { kind: 'uninstall' | 'rollback'; packId: string } | null = null
  let characterBusy = false
  // Injected remote market installer (E8 / MB-084). Created lazily from
  // options.marketSource; construction is inert (bounded storage read only).
  let marketInstall: MarketInstallController | null = null
  let marketUninstallConfirm: { readonly packId: string } | null = null

  function setFeedback(message: string, state: 'ok' | 'error' | 'info'): void {
    feedback.textContent = message
    feedback.dataset.state = state
  }

  function setIssues(issues: readonly ContentIssue[] | undefined): void {
    issueList.replaceChildren()
    const list = issues ?? []
    if (list.length === 0) {
      issueList.hidden = true
      return
    }
    issueList.hidden = false
    for (const item of list.slice(0, 6)) {
      const row = create('li', 'content-hub-issue')
      row.textContent = item.path + ' · ' + item.code + ' · ' + item.message
      issueList.append(row)
    }
  }

  function installedPacks(): readonly ContentHubInstalledPack[] {
    try {
      return options.getInstalledPacks?.() ?? []
    } catch {
      return []
    }
  }

  // --- experimental character-pack installer (E4 / task-98) -------------

  function characterPacksAdapter(): CharacterPackHubAdapter | null {
    try {
      return options.characterPacks ?? null
    } catch {
      return null
    }
  }

  function characterPackState(): CharacterPackUiState {
    const adapter = characterPacksAdapter()
    if (adapter === null) {
      return characterPackUnavailableState('宿主未注入角色包安装器（IndexedDB / CharacterPackRuntime 适配器缺失）。')
    }
    try {
      return adapter.state()
    } catch {
      return characterPackUnavailableState('角色包安装器状态读取失败。')
    }
  }

  function resetCharacterConsent(): void {
    characterConsent = Object.freeze({
      usageConfirmed: false,
      licenseAcknowledged: false,
      aiDisclosureAcknowledged: false,
    })
  }

  function characterPackTabContext(): CharacterPackTabContext {
    return {
      getState: characterPackState,
      getPrepared: (): CharacterPackPrepared | null => characterPrepared,
      getConsent: (): CharacterPackConsentInput => characterConsent,
      getConfirm: () => characterConfirm,
      isBusy: (): boolean => characterBusy,
      onImport: (mode): void => {
        void handleImportCharacterPack(mode)
      },
      onToggleConsent: (key, value): void => {
        handleToggleCharacterPackConsent(key, value)
      },
      onConfirmInstall: (): void => {
        void handleConfirmCharacterPackInstall()
      },
      onCancel: (): void => {
        cancelCharacterPackPrepared()
      },
      onEnable: (packId): void => {
        void handleEnableCharacterPack(packId)
      },
      onRequestAction: (kind, packId): void => {
        requestCharacterPackAction(kind, packId)
      },
      onConfirmAction: (): void => {
        void handleConfirmCharacterPackAction()
      },
      onCancelAction: (): void => {
        cancelCharacterPackAction()
      },
    }
  }

  function updatePackSummary(): void {
    const count = installedPacks().length
    const characterCount = characterPackState().installedCount
    const base = count > 0 ? '已安装内容包：' + count + ' 个' : '未安装内容包'
    packSummary.textContent = characterCount > 0 ? base + ' · 已登记角色包：' + characterCount + ' 个' : base
  }

  function getLibrary(): ContentLibrary | null {
    try {
      return options.getLibrary()
    } catch {
      return null
    }
  }

  function getSelection(): ContentSelection | null {
    try {
      return options.getSelection()
    } catch {
      return null
    }
  }

  function getRoleThemeId(): string | null {
    try {
      return options.getRoleThemeId?.() ?? null
    } catch {
      return null
    }
  }

  function getBaseLibrary(library: ContentLibrary): ContentLibrary {
    try {
      return options.getBaseLibrary?.() ?? library
    } catch {
      return library
    }
  }

  function tabDefinition(id: ContentHubTopTab): ContentHubTopTabDefinition | undefined {
    return CONTENT_HUB_TOP_TABS.find((definition) => definition.id === id)
  }

  function renderTabs(): void {
    for (const item of tabs) {
      const selected = item.id === activeTab
      item.tab.setAttribute('aria-selected', selected ? 'true' : 'false')
      item.tab.tabIndex = selected ? 0 : -1
      item.tab.dataset.active = selected ? 'true' : 'false'
    }
    panelBody.setAttribute('aria-labelledby', CONTENT_HUB_TAB_ID_PREFIX + activeTab)
  }

  function appendBlurb(): void {
    const definition = tabDefinition(activeTab)
    if (definition === undefined) return
    const blurb = create('p', 'content-hub-blurb')
    blurb.textContent = definition.blurb
    panelBody.append(blurb)
  }

  function appendEmpty(text: string): void {
    const empty = create('p', 'content-hub-empty')
    empty.textContent = text
    panelBody.append(empty)
  }

  // --- tab renderers (rendering moved to src/pet/content-hub/*) -----------

  function rolesRenderContext(): RolesTabRenderContext {
    return {
      doc: hubDoc,
      create,
      panelBody,
      appendEmpty,
      getLibrary,
      getSelection,
      getRoleThemeId,
      getBaseLibrary,
      resolvePreviewUrl: (theme) => {
        try {
          return options.resolvePreviewUrl?.(theme) ?? null
        } catch {
          return null
        }
      },
      docsHref: options.docsHref ?? CONTENT_HUB_DOCS_HREF,
      onApplyRole: handleApplyRole,
      onCustomize: handleCustomize,
      onRestoreRole: handleRestoreRole,
      hasRestoreRole: options.restoreRole !== undefined,
    }
  }

  function renderRoles(): void {
    renderRolesTab(rolesRenderContext())
  }

  function renderCustomize(): void {
    renderCustomizeTab(rolesRenderContext())
  }

  function renderPacks(): void {
    renderPacksTab({
      doc: hubDoc,
      create,
      panelBody,
      appendEmpty,
      getInstalledPacks: installedPacks,
      getPendingImport: (): PreparedThemePackImport | null => pendingImport,
      isImportBusy: (): boolean => importBusy,
      onImportFile: (mode): void => {
        void handleImportFile(mode)
      },
      onConfirmImport: (): void => {
        void handleConfirmImport()
      },
      onCancelImport: cancelPendingImport,
      characterPacks: characterPackTabContext(),
    })
  }

  /** Lazily build the injected market install adapter (absent = old placeholder). */
  function marketInstaller(): MarketInstallController | null {
    if (options.marketSource === undefined) return null
    if (marketInstall !== null) return marketInstall
    marketInstall = createMarketInstallController(options.marketSource, {
      ...(options.marketHost ?? {}),
      onChange: (): void => {
        if (openState && activeTab === 'market') renderPanel()
      },
    })
    return marketInstall
  }

  function marketHasRefreshHandler(): boolean {
    return options.refreshMarket !== undefined || marketInstaller() !== null
  }

  function getMarketState(): ContentMarketUiState {
    const installer = marketInstaller()
    if (installer !== null) {
      try {
        const state = installer.state()
        if (!state.configured) return defaultContentMarketState()
        if (state.catalogVersion === null) {
          return describeContentMarketState(options.marketSource ?? null)
        }
        const packs = state.rows
          .filter((row) => row.offered && row.marketVersion !== null)
          .map((row) =>
            Object.freeze({
              id: row.packId,
              name: row.name,
              version: row.marketVersion as string,
              description: row.description,
            }),
          )
        return Object.freeze({
          status: 'configured' as const,
          configured: true,
          title: '市场目录已验签 · 需要显式操作才会联网',
          detail:
            '目录版本 ' +
            state.catalogVersion +
            '；安装仍需逐包确认统一用途声明，失败/取消不会留下半装内容。',
          ...(state.sourceLabel !== null ? { sourceLabel: state.sourceLabel } : {}),
          catalogVersion: state.catalogVersion,
          packs: Object.freeze(packs),
        })
      } catch {
        return defaultContentMarketState()
      }
    }
    if (marketState !== null) return marketState
    try {
      return options.getMarketState?.() ?? defaultContentMarketState()
    } catch {
      return defaultContentMarketState()
    }
  }

  function runMarketAction(action: () => MarketInstallActionResult): void {
    let result: MarketInstallActionResult
    try {
      result = action()
    } catch {
      result = { ok: false, message: '市场操作失败，请稍后再试。' }
    }
    setFeedback(result.message, result.ok ? 'ok' : 'error')
    renderPanel()
  }

  async function runMarketAsync(action: () => Promise<MarketInstallActionResult>): Promise<void> {
    try {
      const result = await action()
      setFeedback(result.message, result.ok ? 'ok' : 'error')
    } catch {
      setFeedback('市场操作失败；没有安装任何未验签的远程内容。', 'error')
    } finally {
      renderPanel()
      updatePackSummary()
    }
  }

  function marketInstallTabContext(controller: MarketInstallController): NonNullable<MarketTabRenderContext['install']> {
    return {
      getState: (): MarketInstallUiState => controller.state(),
      getUninstallConfirm: () => marketUninstallConfirm,
      onRequestInstall: (packId): void => {
        runMarketAction(() => controller.requestInstall(packId))
      },
      onConfirmInstall: (): void => {
        void runMarketAsync(async () => await controller.confirmInstall())
      },
      onCancelConfirmation: (): void => {
        controller.cancelPendingInstall()
        setFeedback('已取消安装（未下载任何内容）。', 'info')
        renderPanel()
      },
      onCancelOperation: (): void => {
        runMarketAction(() => controller.cancel())
      },
      onRetry: (): void => {
        void runMarketAsync(async () => await controller.retry())
      },
      onClearFailure: (): void => {
        controller.clearFailure()
        setFeedback('已清理失败状态；可重新选择安装。', 'info')
        renderPanel()
      },
      onRequestUninstall: (packId): void => {
        marketUninstallConfirm = { packId }
        renderPanel()
      },
      onConfirmUninstall: (): void => {
        const pendingUninstall = marketUninstallConfirm
        marketUninstallConfirm = null
        if (pendingUninstall === null) return
        void runMarketAsync(async () => await controller.uninstall(pendingUninstall.packId))
      },
      onCancelUninstall: (): void => {
        marketUninstallConfirm = null
        setFeedback('已取消卸载，内容保持不变。', 'info')
        renderPanel()
      },
      onLockVersion: (packId): void => {
        runMarketAction(() => controller.lockVersion(packId))
      },
      onUnlockVersion: (packId): void => {
        runMarketAction(() => controller.unlockVersion(packId))
      },
    }
  }

  function renderMarket(): void {
    const installer = marketInstaller()
    renderMarketTab({
      doc: hubDoc,
      create,
      panelBody,
      appendEmpty,
      getMarketState,
      hasRefreshHandler: marketHasRefreshHandler(),
      onRefreshMarket: (): void => {
        void handleRefreshMarket()
      },
      ...(installer !== null ? { install: marketInstallTabContext(installer) } : {}),
    })
  }

  function cancelPendingImport(): void {
    pendingImport = null
    setFeedback('已取消导入，未安装任何内容。', 'info')
    setIssues([])
    renderPanel()
  }

  function renderPanel(): void {
    panelBody.replaceChildren()
    setIssues([])
    if (getLibrary() === null) {
      appendEmpty('内容目录尚未加载，请稍后再试。')
      return
    }
    appendBlurb()
    switch (activeTab) {
      case 'roles':
        renderRoles()
        break
      case 'customize':
        renderCustomize()
        break
      case 'packs':
        renderPacks()
        break
      case 'market':
        renderMarket()
        break
      default:
        break
    }
  }

  // --- handlers -----------------------------------------------------------

  function activateTab(id: ContentHubTopTab, focusTab: boolean): void {
    activeTab = id
    // A pending destructive confirmation must not survive a tab switch.
    if (id !== 'market') marketUninstallConfirm = null
    renderTabs()
    renderPanel()
    setFeedback('', 'info')
    if (focusTab) tabButtons.get(id)?.focus()
  }

  function handleTabKey(event: KeyboardEvent, id: ContentHubTopTab): void {
    const order = CONTENT_HUB_TOP_TABS.map((definition) => definition.id)
    const index = order.indexOf(id)
    let next: ContentHubTopTab | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = order[(index + 1) % order.length]
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = order[(index - 1 + order.length) % order.length]
    else if (event.key === 'Home') next = order[0]
    else if (event.key === 'End') next = order[order.length - 1]
    if (next === undefined) return
    event.preventDefault()
    activateTab(next, true)
  }

  function runSelect(action: () => ContentHubSelectResult): void {
    let result: ContentHubSelectResult
    try {
      result = action()
    } catch {
      result = { ok: false, message: '操作失败，请稍后再试。' }
    }
    setFeedback(result.message, result.ok ? 'ok' : 'error')
    if (!result.ok) return
    if (result.close === true) {
      close(true)
      return
    }
    renderPanel()
    updatePackSummary()
  }

  function handleApplyRole(roleThemeId: string): void {
    runSelect(() => options.applyRole(roleThemeId))
  }

  function handleCustomize(key: SelectionKey, id: string): void {
    runSelect(() => options.customize(key, id))
  }

  function handleRestoreRole(): void {
    const restore = options.restoreRole
    if (restore === undefined) {
      setFeedback('当前没有可恢复的角色主题默认值。', 'error')
      return
    }
    runSelect(() => restore())
  }

  async function handleImportFile(mode: 'single' | 'folder'): Promise<void> {
    if (importBusy) return
    const inputs = rootElement.querySelectorAll<HTMLInputElement>('input.content-hub-file-input')
    const target = mode === 'single' ? inputs[0] : inputs[1]
    if (target === undefined) return
    const selectionSource = fileListOf(target)
    selectionSource.clear()
    if (selectionSource.files.length === 0) return
    setFeedback('正在读取并按 0.2 规范校验内容包…', 'info')
    setIssues([])
    importBusy = true
    try {
      const selection =
        mode === 'folder'
          ? await readFolderSelection(selectionSource.files)
          : await readSingleSelection(selectionSource.files[0] as ContentHubFileLike)
      if (typeof selection === 'string') {
        setFeedback(selection, 'error')
        return
      }
      const result = await options.prepareImport(selection)
      if (!result.ok) {
        setFeedback(result.message, 'error')
        setIssues(result.issues)
        return
      }
      pendingImport = result.pending
      setFeedback('内容包已通过严格校验；请阅读统一用途声明并显式确认后再导入。', 'info')
      renderPanel()
    } catch {
      setFeedback('导入失败：内容包读取或校验出错。', 'error')
    } finally {
      importBusy = false
      updatePackSummary()
    }
  }

  async function handleConfirmImport(): Promise<void> {
    const pending = pendingImport
    if (pending === null || importBusy) return
    importBusy = true
    try {
      const result = await options.commitImport(pending)
      setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (result.ok) {
        pendingImport = null
        renderPanel()
        updatePackSummary()
      }
    } catch {
      setFeedback('安装失败：内容包处理出错，未安装。', 'error')
    } finally {
      importBusy = false
    }
  }

  // --- character-pack installer handlers (E4 / task-98) -----------------

  async function handleImportCharacterPack(mode: 'single' | 'folder'): Promise<void> {
    if (characterBusy) return
    const adapter = characterPacksAdapter()
    if (adapter === null) {
      setFeedback('角色包安装器不可用：宿主未注入 IndexedDB / CharacterPackRuntime 适配器。', 'error')
      return
    }
    const inputs = rootElement.querySelectorAll<HTMLInputElement>('input.content-hub-character-file-input')
    const target = mode === 'single' ? inputs[0] : inputs[1]
    if (target === undefined) return
    const selectionSource = fileListOf(target)
    selectionSource.clear()
    if (selectionSource.files.length === 0) return
    setFeedback('正在读取并按 famling.pet-anim/0.2 规范预检角色包…', 'info')
    setIssues([])
    characterBusy = true
    try {
      let selection: ContentPackFileSelection | string
      if (mode === 'folder') {
        selection = await readFolderSelection(selectionSource.files)
      } else {
        const single = await readSingleSelection(selectionSource.files[0] as ContentHubFileLike)
        if (typeof single !== 'string' && single.kind !== 'zip') {
          selection = '角色包安装器只接受 .zip 或文件夹（根目录 pack.json + assets/）；不支持单独导入 JSON 清单。'
        } else {
          selection = single
        }
      }
      if (typeof selection === 'string') {
        characterBusy = false
        setFeedback(selection, 'error')
        return
      }
      const result = await adapter.preview(selection)
      characterBusy = false
      if (!result.ok) {
        setFeedback(result.message, 'error')
        setIssues(result.issues)
        return
      }
      if (characterPrepared !== null) adapter.cancelPrepared(characterPrepared)
      characterPrepared = result.prepared
      resetCharacterConsent()
      characterConfirm = null
      setFeedback('角色包预检通过；请阅读统一用途声明、许可与 AI 标识并逐项确认后再安装。', 'info')
      renderPanel()
    } catch {
      characterBusy = false
      setFeedback('角色包读取或预检失败，未安装任何内容。', 'error')
    }
  }

  function handleToggleCharacterPackConsent(key: CharacterPackConsentKey, value: boolean): void {
    const next = {
      usageConfirmed: characterConsent.usageConfirmed,
      licenseAcknowledged: characterConsent.licenseAcknowledged,
      aiDisclosureAcknowledged: characterConsent.aiDisclosureAcknowledged,
    }
    next[key] = value === true
    characterConsent = Object.freeze(next)
    renderPanel()
  }

  function cancelCharacterPackPrepared(): void {
    const adapter = characterPacksAdapter()
    if (characterPrepared !== null) adapter?.cancelPrepared(characterPrepared)
    characterPrepared = null
    resetCharacterConsent()
    characterConfirm = null
    setFeedback('已取消角色包导入，未安装任何内容。', 'info')
    setIssues([])
    renderPanel()
  }

  async function handleConfirmCharacterPackInstall(): Promise<void> {
    const prepared = characterPrepared
    const adapter = characterPacksAdapter()
    if (prepared === null || adapter === null || characterBusy) return
    const confirmed =
      characterConsent.usageConfirmed && characterConsent.licenseAcknowledged && characterConsent.aiDisclosureAcknowledged
    if (!confirmed) {
      setFeedback('必须逐项确认统一用途声明、角色包许可与 AI 标识后才能安装。', 'error')
      return
    }
    characterBusy = true
    setFeedback('正在安装并登记角色包（仅本地数据、不联网）…', 'info')
    try {
      const result = await adapter.install(prepared, characterConsent)
      characterBusy = false
      characterPrepared = null
      resetCharacterConsent()
      characterConfirm = null
      renderPanel()
      setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (!result.ok) setIssues(result.issues)
      updatePackSummary()
    } catch {
      characterBusy = false
      setFeedback('安装失败：角色包处理出错，未安装。', 'error')
    }
  }

  async function handleEnableCharacterPack(packId: string): Promise<void> {
    const adapter = characterPacksAdapter()
    if (adapter === null || characterBusy) return
    characterBusy = true
    characterConfirm = null
    try {
      const result = await adapter.enable(packId)
      characterBusy = false
      renderPanel()
      setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (!result.ok) setIssues(result.issues)
    } catch {
      characterBusy = false
      setFeedback('启用登记失败：角色包处理出错。', 'error')
    }
  }

  function requestCharacterPackAction(kind: 'uninstall' | 'rollback', packId: string): void {
    if (characterBusy) return
    characterConfirm = { kind, packId }
    renderPanel()
  }

  function cancelCharacterPackAction(): void {
    characterConfirm = null
    renderPanel()
  }

  async function handleConfirmCharacterPackAction(): Promise<void> {
    const request = characterConfirm
    const adapter = characterPacksAdapter()
    if (request === null || adapter === null || characterBusy) return
    characterBusy = true
    try {
      const result =
        request.kind === 'uninstall' ? await adapter.uninstall(request.packId) : await adapter.rollback(request.packId)
      characterBusy = false
      characterConfirm = null
      renderPanel()
      setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (!result.ok) setIssues(result.issues)
      updatePackSummary()
    } catch {
      characterBusy = false
      setFeedback(request.kind === 'uninstall' ? '卸载失败：角色包处理出错。' : '回滚失败：角色包处理出错。', 'error')
    }
  }

  async function handleRefreshMarket(): Promise<void> {
    const installer = marketInstaller()
    if (installer !== null) {
      // Defense in depth (task-75): even a programmatic click must not reach the
      // network in the unconfigured state. The controller re-checks configured
      // and the injected verify deps before calling the source.
      if (!canRequestRemoteMarket(getMarketState(), true)) {
        setFeedback('远程市场未配置：不会发起任何网络请求。', 'info')
        return
      }
      if (importBusy) return
      importBusy = true
      setFeedback('正在读取市场目录（需要显式点击后才联网）…', 'info')
      try {
        const result = await installer.refresh()
        setFeedback(result.message, result.ok ? 'ok' : 'error')
        renderPanel()
      } catch {
        setFeedback('读取市场目录失败；未安装任何远程内容。', 'error')
      } finally {
        importBusy = false
      }
      return
    }
    const refresh = options.refreshMarket
    if (refresh === undefined || importBusy) return
    // Defense in depth (task-75): a programmatic click, a queued event or a host
    // that wired refreshMarket before the source was configured must never reach
    // the network. The default unconfigured state short-circuits with zero calls.
    if (!canRequestRemoteMarket(getMarketState(), true)) {
      setFeedback('远程市场未配置：不会发起任何网络请求。', 'info')
      return
    }
    importBusy = true
    setFeedback('正在读取市场目录（需要显式点击后才联网）…', 'info')
    try {
      const result = await refresh()
      setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (result.state !== undefined) marketState = result.state
      renderPanel()
    } catch {
      setFeedback('读取市场目录失败；未安装任何远程内容。', 'error')
    } finally {
      importBusy = false
    }
  }

  // --- dialog behaviour ---------------------------------------------------

  // True when the node has a layout box in a real browser. The content center
  // reuses the page stylesheet, so a shell/panel rule can leave a control with
  // tabIndex 0 but display:none, and .focus() is then a no-op. task-122 narrowed
  // the desktop-shell chrome rule to #pet-app > header, so this dialog's own
  // header (title + 合上) now stays visible; the filter remains as defence for
  // any other zero-layout node. The injectable fake DOM used by unit tests has
  // no layout pass, so only real browsers filter.
  // (Deliberately a line comment: the production-source gate strips block
  // comments before line comments, so a block comment here would swallow code.)
  function isRendered(node: HTMLElement): boolean {
    const probe = node as unknown as { getClientRects?: () => ArrayLike<unknown> }
    if (typeof probe.getClientRects !== 'function') return true
    try {
      return probe.getClientRects().length > 0
    } catch {
      return true
    }
  }

  function focusableElements(): HTMLElement[] {
    const nodes = rootElement.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
    return Array.from(nodes).filter((node) => !node.hidden && isRendered(node))
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (!openState) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key !== 'Tab') return
    const focusables = focusableElements()
    if (focusables.length === 0) return
    const active = hubDoc.activeElement
    // The tabpanel itself is focusable (tabindex=0) but is not part of the
    // button/link list. Leave Tab to the browser's own sequential navigation
    // there: forward Tab enters the panel's own controls and Shift+Tab returns
    // to the selected tab. Intercepting it used to call focus() on the first
    // listed control, which can have no layout box (see isRendered), so focus
    // stayed on the panel and keyboard users could not reach its buttons.
    if (active === panelBody) return
    const index = active instanceof HTMLElement ? focusables.indexOf(active) : -1
    if (event.shiftKey) {
      if (index <= 0) {
        event.preventDefault()
        focusables[focusables.length - 1]?.focus()
      }
      return
    }
    if (index === -1 || index === focusables.length - 1) {
      event.preventDefault()
      focusables[0]?.focus()
    }
  }

  function consentOverlayOpen(): boolean {
    try {
      return hubDoc.querySelectorAll('.consent-root').length > 0
    } catch {
      return false
    }
  }

  function open(): boolean {
    if (openState) return true
    if (getLibrary() === null) return false
    openState = true
    returnFocus = hubDoc.activeElement instanceof HTMLElement ? hubDoc.activeElement : null
    rootElement.hidden = false
    rootElement.inert = false
    rootElement.dataset.state = 'open'
    const app = hubDoc.getElementById('pet-app')
    if (app && !inertedApp) {
      app.setAttribute('inert', '')
      inertedApp = app
    }
    hubDoc.addEventListener('keydown', onDocumentKeydown, true)
    setFeedback('', 'info')
    setIssues([])
    renderTabs()
    renderPanel()
    updatePackSummary()
    const target = tabButtons.get(activeTab) ?? closeButton
    try {
      target.focus()
    } catch {
      // A detached/blocked focus target must not break opening the panel.
    }
    return true
  }

  function close(restoreFocus = true): void {
    if (!openState) return
    openState = false
    rootElement.dataset.state = 'closed'
    rootElement.hidden = true
    rootElement.inert = true
    hubDoc.removeEventListener('keydown', onDocumentKeydown, true)
    if (inertedApp) {
      if (!consentOverlayOpen()) inertedApp.removeAttribute('inert')
      inertedApp = null
    }
    if (restoreFocus) {
      const target = returnFocus && returnFocus.isConnected ? returnFocus : null
      try {
        target?.focus()
      } catch {
        // Focus restore is best-effort; the dialog is already closed.
      }
    }
    returnFocus = null
    try {
      options.onClose?.()
    } catch {
      // A host callback failure must never keep the dialog in a broken state.
    }
  }

  function destroy(): void {
    hubDoc.removeEventListener('keydown', onDocumentKeydown, true)
    if (openState) close(false)
    marketInstall?.destroy()
    marketInstall = null
    marketUninstallConfirm = null
    rootElement.replaceChildren()
    rootElement.hidden = true
    rootElement.inert = true
    rootElement.dataset.state = 'closed'
  }

  backdrop.addEventListener('click', () => {
    close(true)
  })
  closeButton.addEventListener('click', () => {
    close(true)
  })

  return Object.freeze({
    root: rootElement,
    open,
    close,
    isOpen: (): boolean => openState,
    refresh: (): void => {
      if (!openState) return
      renderTabs()
      renderPanel()
      updatePackSummary()
    },
    destroy,
    hasPendingImport: (): boolean => pendingImport !== null,
    hasMarketInstaller: (): boolean => marketInstaller() !== null,
  })
}

// ---------------------------------------------------------------------------
// Public API back-compat (unchanged import surface for main.ts / tests)
// ---------------------------------------------------------------------------

export { CONTENT_HUB_DOCS_HREF, CONTENT_HUB_NOTICE }
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
