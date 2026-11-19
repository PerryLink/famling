/**
 * Content center (内容中心 / 主题市场) for famling, on top of `famling.content/0.1`.
 *
 * This module owns the single consolidated content UI plus the small, pure
 * helpers behind it. The shared catalog / strict validation / selection /
 * appearance core stays in `content-library.ts`; this file NEVER re-implements
 * or relaxes the parser or validators, never uses innerHTML/eval, and never
 * fetches a remote resource.
 *
 * What it provides:
 * - six tabs (characters / voices / dialoguePacks / themes / backgrounds /
 *   fonts) whose cards show name, description, preview and the current marker;
 *   WAI-ARIA dialog + tablist semantics, Escape close, focus trap and restore;
 * - theme/background/font changes are applied immediately by the host callback
 *   (no reload); character/voice changes stay on the existing lifecycles
 *   (renderer reload / TTS config-signature re-prompt) through callbacks that
 *   `main.ts` supplies — this module never writes consent or bypasses a gate;
 * - local content-pack import: bounded JSON file input -> validateContentPack ->
 *   runtime-safe categories only (dialogue/themes/backgrounds/fonts) ->
 *   mergeInstalledPacks (built-in ids can never be shadowed) -> versioned
 *   localStorage envelope. Characters/voices are refused with an explanation
 *   because they need local art/voice resources and their own consent flow;
 * - a visible notice that this is research-only local content, plus a link to
 *   the canonical extension docs (`public/content/README.md`).
 *
 * Security boundaries: declarative JSON only; no network request; no scripts or
 * HTML (every dynamic string goes through textContent or a validated CSS token);
 * installed packs are re-validated on every read/merge; the file size cap is
 * enforced before JSON.parse; `source: "remote"` is rejected.
 *
 * The pure helpers (`prepareContentPackImport`, `readInstalledContentPacks`,
 * `writeInstalledContentPacks`, `applyContentSelectionAppearance`,
 * `decideDialogueLine`, `CONTENT_HUB_TABS`) are exported for Node tests and do
 * not touch the DOM.
 */
import {
  CONTENT_BACKGROUND_VAR,
  CONTENT_FONT_VAR,
  CONTENT_LIMITS,
  CONTENT_THEME_VAR_NAMES,
  applyAppearance,
  findContent,
  isVoiceAvailableFor,
  listContent,
  mergeInstalledPacks,
  resolveContentSelection,
  validateContentPack,
  type ContentAppearanceDocumentLike,
  type ContentAppearanceResult,
  type ContentBackgroundEntry,
  type ContentCategory,
  type ContentCharacterEntry,
  type ContentDialoguePackEntry,
  type ContentEntry,
  type ContentFontEntry,
  type ContentIssue,
  type ContentLibrary,
  type ContentPack,
  type ContentSelection,
  type ContentThemeEntry,
  type ContentVoiceEntry,
  type DialogueBehavior,
  type SelectionKey,
} from './content-library.ts'
import { readVersioned, writeVersioned, type StorageLike, type StorageWriteStatus } from './security/safe-storage.ts'
import { utf8ByteLength } from './security/limits.ts'

// ---------------------------------------------------------------------------
// Tabs / categories / labels (stable order = card + tab order)
// ---------------------------------------------------------------------------

/** One tab in the content center: category id plus the exact Chinese UI label. */
export interface ContentHubTab {
  readonly category: ContentCategory
  readonly label: string
  /** One-line explanation shown above the cards. */
  readonly blurb: string
}

export const CONTENT_HUB_TABS: readonly ContentHubTab[] = Object.freeze([
  { category: 'characters', label: '角色', blurb: '选择桌宠角色；切换会沿用既有渲染器生命周期并刷新页面。' },
  { category: 'voices', label: '声音', blurb: 'TTS 音色（stella / tide）；切换会改变 TTS 配置签名并重新弹出语音声明。' },
  { category: 'dialoguePacks', label: '对话', blurb: '气泡频率与长度策略；即时生效，错误/关键提示不受影响。' },
  { category: 'themes', label: '主题', blurb: '气泡与面板配色；即时应用，不需要刷新。' },
  { category: 'backgrounds', label: '背景', blurb: '桌宠背景；透明仍是默认值，即时应用。' },
  { category: 'fonts', label: '字体', blurb: '本地字体栈；不使用网络字体，即时应用。' },
])

/** Catalog category -> persisted selection key. Order matches CONTENT_HUB_TABS. */
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
/** Canonical third-party pack / remote-market extension documentation. */
export const CONTENT_HUB_DOCS_HREF = '/content/README.md'
/** Fixed research-only / local-content notice shown in the footer. */
export const CONTENT_HUB_NOTICE =
  '研究用途 · 本地内容：仅用于技术研究与原型验证；内容来自本地目录/已安装包，不联网、不执行脚本、不构成专业建议。'

// ---------------------------------------------------------------------------
// Installed local content packs (versioned, bounded, localStorage only)
// ---------------------------------------------------------------------------

/** One versioned envelope holds every validated local pack (raw JSON metadata). */
export const CONTENT_INSTALLED_PACKS_KEY = 'desktop-games/pet/content/installed-packs'
export const CONTENT_INSTALLED_PACKS_VERSION = 1
/** Hard cap for the whole envelope; each pack is separately capped at 256 KB. */
export const CONTENT_INSTALLED_PACKS_MAX_BYTES = 1024 * 1024
const MAX_INSTALLED_PACKS = CONTENT_LIMITS.maxPacksPerMerge

export type InstalledPacksReadStatus = 'ok' | 'missing' | 'corrupt' | 'invalid' | 'version' | 'unavailable'

export interface InstalledPacksReadResult {
  readonly status: InstalledPacksReadStatus
  /** Raw pack objects (not yet re-validated); [] for every non-ok status. */
  readonly packs: readonly unknown[]
}

/**
 * Read the persisted local packs. Everything is funneled through the existing
 * versioned safe-storage reader, so corrupt/oversized/newer data falls back to
 * an empty list instead of throwing or being trusted.
 */
export function readInstalledContentPacks(storage?: StorageLike | null): InstalledPacksReadResult {
  const result = readVersioned<readonly unknown[]>(
    CONTENT_INSTALLED_PACKS_KEY,
    {
      version: CONTENT_INSTALLED_PACKS_VERSION,
      maxBytes: CONTENT_INSTALLED_PACKS_MAX_BYTES,
      validate: (value) => {
        if (!Array.isArray(value)) return undefined
        if (value.length > MAX_INSTALLED_PACKS) return undefined
        return value as readonly unknown[]
      },
    },
    storage,
  )
  if (result.status === 'ok' && result.value !== undefined) {
    return Object.freeze({ status: 'ok', packs: Object.freeze([...result.value]) })
  }
  return Object.freeze({ status: result.status, packs: Object.freeze([]) })
}

export type InstalledPacksWriteStatus = StorageWriteStatus | 'too-many'

export interface InstalledPacksWriteResult {
  readonly ok: boolean
  readonly status: InstalledPacksWriteStatus
  readonly bytes?: number
}

/** Persist the accepted pack list atomically (single versioned envelope). */
export function writeInstalledContentPacks(
  packs: readonly unknown[],
  storage?: StorageLike | null,
): InstalledPacksWriteResult {
  if (packs.length > MAX_INSTALLED_PACKS) return Object.freeze({ ok: false, status: 'too-many' })
  const result = writeVersioned(
    CONTENT_INSTALLED_PACKS_KEY,
    [...packs],
    { version: CONTENT_INSTALLED_PACKS_VERSION, maxBytes: CONTENT_INSTALLED_PACKS_MAX_BYTES },
    storage,
  )
  const out: { ok: boolean; status: InstalledPacksWriteStatus; bytes?: number } = {
    ok: result.status === 'ok',
    status: result.status,
  }
  if (result.bytes !== undefined) out.bytes = result.bytes
  return Object.freeze(out)
}

// ---------------------------------------------------------------------------
// Local pack import preparation (pure: no DOM, no fetch, no storage writes)
// ---------------------------------------------------------------------------

/**
 * Categories whose entries are pure declarative data and can be applied at
 * runtime without loading external art/voice files or re-running a consent flow.
 */
export const CONTENT_RUNTIME_PACK_CATEGORIES = ['dialoguePacks', 'themes', 'backgrounds', 'fonts'] as const
export type ContentRuntimePackCategory = (typeof CONTENT_RUNTIME_PACK_CATEGORIES)[number]

export function isRuntimeImportableCategory(category: ContentCategory): category is ContentRuntimePackCategory {
  return (CONTENT_RUNTIME_PACK_CATEGORIES as readonly string[]).includes(category)
}

export type ContentPackImportResult =
  | {
      readonly ok: true
      readonly pack: ContentPack
      /** Next persisted pack list (replaces the previous version of the same id). */
      readonly packs: readonly unknown[]
      /** Built-in catalog + every valid installed pack, merged and frozen. */
      readonly library: ContentLibrary
      readonly added: number
      readonly replaced: boolean
      /** True when the same pack id+content was already installed. */
      readonly unchanged: boolean
    }
  | { readonly ok: false; readonly message: string; readonly issues: readonly ContentIssue[] }

const IMPORT_MESSAGES = Object.freeze({
  notJson: '内容包不是合法 JSON，已拒绝导入。',
  tooLarge: '内容包 JSON 超过上限（256 KB），已拒绝导入。',
  notObject: '内容包必须是 JSON 对象。',
  remote: '远程内容包不支持导入：内容中心只接受本地/离线内容包，不联网、不加载远程资源。',
  characters:
    '角色内容包需要本地美术资源并进入角色生命周期（刷新 + TTS/内容同意门），内容中心 0.1 暂不支持直接导入；请等待 DLC 安装器。',
  voices:
    '声音内容包会改变 TTS 配置签名，必须经过 TTS 独立声明与 DLC 安装器验证；内容中心 0.1 不导入外部声音包。',
  capacity: '已安装内容包数量达到上限，请先清理本地内容。',
  incompatible: '内容包与当前内容目录不兼容（library/app 版本不匹配），未安装。',
  conflict: '内容包条目与内置或已安装内容冲突；内置内容不可被覆盖，未安装。',
  invalid: '内容包校验失败，未安装。',
})

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A valid pack-entry JSON must never smuggle a remote origin in; the strict
 * parser already rejects it (pack entries only allow source:"local"), but we
 * reject before validation so the user gets the honest reason.
 */
function hasRemoteEntry(raw: Record<string, unknown>): boolean {
  const entries = raw.entries
  if (!Array.isArray(entries)) return false
  for (const entry of entries) {
    if (!isPlainRecord(entry)) continue
    if (entry.source === 'remote' || entry.remote !== undefined) return true
  }
  return false
}

function failImport(message: string, issues: readonly ContentIssue[] = []): ContentPackImportResult {
  return Object.freeze({ ok: false as const, message, issues: Object.freeze([...issues]) })
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

/**
 * Validate one user-selected JSON content pack and compute the merge/persistence
 * candidate without touching storage. Callers persist `packs` only on success.
 *
 * Rules:
 * 1. hard UTF-8 size cap BEFORE JSON.parse;
 * 2. validateContentPack (the same strict parser; no relaxed fallback);
 * 3. only dialogue/themes/backgrounds/fonts; characters/voices are refused with
 *    a visible explanation (they need external art/voice + consent flows);
 * 4. remote packs are refused (0.1 is offline-only);
 * 5. reinstall of the same id replaces that pack (dedupe, no duplicate entry),
 *    and any builtin-shadow / installed-entry conflict fails the whole import;
 * 6. incompatible or otherwise skipped packs fail with a visible message.
 */
export function prepareContentPackImport(
  jsonText: string,
  baseLibrary: ContentLibrary,
  installedPacks: readonly unknown[],
): ContentPackImportResult {
  if (typeof jsonText !== 'string' || jsonText.length === 0) return failImport(IMPORT_MESSAGES.notJson)
  if (utf8ByteLength(jsonText) > CONTENT_LIMITS.maxPackJsonBytes) return failImport(IMPORT_MESSAGES.tooLarge)
  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch {
    return failImport(IMPORT_MESSAGES.notJson)
  }
  if (!isPlainRecord(raw)) return failImport(IMPORT_MESSAGES.notObject)
  if (hasRemoteEntry(raw)) return failImport(IMPORT_MESSAGES.remote)
  const validation = validateContentPack(raw)
  if (!validation.ok) {
    const first = validation.issues[0]
    const where = first ? '（' + first.path + ': ' + first.code + '）' : ''
    return failImport(IMPORT_MESSAGES.invalid + where, validation.issues)
  }
  const pack = validation.pack
  if (pack.category === 'characters') return failImport(IMPORT_MESSAGES.characters)
  if (pack.category === 'voices') return failImport(IMPORT_MESSAGES.voices)
  if (!isRuntimeImportableCategory(pack.category)) return failImport(IMPORT_MESSAGES.invalid)
  let replaceIndex = -1
  for (let index = 0; index < installedPacks.length; index += 1) {
    const candidate = installedPacks[index]
    if (isPlainRecord(candidate) && candidate.id === pack.id) {
      replaceIndex = index
      break
    }
  }
  const previous = replaceIndex >= 0 ? installedPacks[replaceIndex] : undefined
  const unchanged = previous !== undefined && safeJson(previous) === safeJson(pack)
  const nextPacks: unknown[] = [...installedPacks]
  if (replaceIndex >= 0) nextPacks[replaceIndex] = pack
  else {
    if (nextPacks.length >= MAX_INSTALLED_PACKS) return failImport(IMPORT_MESSAGES.capacity)
    nextPacks.push(pack)
  }
  const merged = mergeInstalledPacks(baseLibrary, nextPacks)
  const skipped = merged.skippedPacks.find((entry) => entry.packId === pack.id)
  if (skipped !== undefined) return failImport(IMPORT_MESSAGES.incompatible)
  if (merged.conflicts.length > 0) {
    const conflict = merged.conflicts[0]
    const detail = conflict ? '（' + conflict.category + '/' + conflict.id + '）' : ''
    return failImport(IMPORT_MESSAGES.conflict + detail)
  }
  return Object.freeze({
    ok: true as const,
    pack,
    packs: Object.freeze(nextPacks),
    library: merged.library,
    added: pack.entries.length,
    replaced: replaceIndex >= 0,
    unchanged,
  })
}

// ---------------------------------------------------------------------------
// Appearance helper: default entries stay CSS-owned (first-run visual unchanged)
// ---------------------------------------------------------------------------

/**
 * Apply the theme/background/font selection.
 *
 * `applyAppearance()` writes every variable (including the built-in defaults).
 * The default entries are deliberately treated as 「no override」: their visuals
 * already live in pet.css as the fallback values, and the catalog default theme
 * uses slightly different border/shadow tokens. Removing the default variables
 * therefore keeps a fresh profile pixel-identical while any non-default choice
 * is still applied immediately (no reload).
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
// Dialogue policy (brief clamps, quiet suppresses automatic bubbles only)
// ---------------------------------------------------------------------------

/**
 * - ambient: automatic greetings/away lines; quiet mode suppresses them and the
 *   pack bubbleChance decides whether they appear at all;
 * - interactive: explicit user interaction (pat/give/hero action/region touch);
 *   always shown but clamped to the pack maxChars (brief/quiet = shorter lines);
 * - explicit: errors, system/consent/security notices; NEVER filtered or
 *   clamped, so a quiet dialogue pack can never hide a failure or a warning.
 */
export type DialogueLineKind = 'ambient' | 'interactive' | 'explicit'

export interface DialogueLineDecision {
  readonly show: boolean
  readonly text: string | null
  readonly kind: DialogueLineKind
  readonly reason: 'explicit' | 'ok' | 'ambient-suppressed' | 'empty'
}

/**
 * Decide one bubble. Pure and deterministic when `random` is injected, so the
 * brief/quiet behaviour is unit-tested without a browser or main.ts.
 */
export function decideDialogueLine(
  behavior: DialogueBehavior | null | undefined,
  kind: DialogueLineKind,
  text: string,
  random?: () => number,
): DialogueLineDecision {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return Object.freeze({ show: false, text: null, kind, reason: 'empty' as const })
  }
  // Errors and critical notices are never shaped/filtered, even with quiet.
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
// Content hub controller (DOM built only when a document exists)
// ---------------------------------------------------------------------------

export interface ContentHubSelectResult {
  readonly ok: boolean
  /** Visible feedback line shown in the panel (never thrown, never HTML). */
  readonly message: string
  /** Close the panel after this action (e.g. a renderer switch reloads). */
  readonly close?: boolean
}

export interface ContentHubImportResult extends ContentHubSelectResult {
  /** Persisted local pack count after a successful import (for the footer). */
  readonly installedCount?: number
}

export interface ContentHubPackSummary {
  readonly installed: number
}

/**
 * Host callbacks. `main.ts` owns storage, consent checks, renderer reload,
 * voice-preference/TTS re-prompt and appearance application; this module only
 * renders and forwards intents (so no side effect can happen without the host
 * re-checking the consent gate).
 */
export interface ContentHubOptions {
  readonly document?: Document
  readonly getLibrary: () => ContentLibrary | null
  readonly getSelection: () => ContentSelection | null
  readonly select: (key: SelectionKey, id: string) => ContentHubSelectResult
  readonly importPack: (jsonText: string) => ContentHubImportResult
  readonly getPackSummary?: () => ContentHubPackSummary
  readonly onClose?: () => void
  readonly docsHref?: string
}

export interface ContentHubController {
  readonly root: HTMLElement | null
  /** True when the panel became/continues to be visible; false without a catalog. */
  open(): boolean
  close(restoreFocus?: boolean): void
  isOpen(): boolean
  refresh(): void
  destroy(): void
}

function inertHubController(): ContentHubController {
  return Object.freeze({
    root: null,
    open: (): boolean => false,
    close: (): void => {},
    isOpen: (): boolean => false,
    refresh: (): void => {},
    destroy: (): void => {},
  })
}

// ---------------------------------------------------------------------------
// DOM ids / mount
// ---------------------------------------------------------------------------

const CONTENT_HUB_PANEL_ID = 'content-hub-panel'
const CONTENT_HUB_TITLE_ID = 'content-hub-title'
const CONTENT_HUB_TAB_ID_PREFIX = 'content-hub-tab-'

/**
 * Build the content-center dialog into pet.html's static mount point.
 *
 * Only textContent / validated CSS tokens are ever written; every clickable row
 * is a real <button> (native keyboard activation) and the dialog traps Tab,
 * closes on Escape and restores focus to the opener.
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
  kicker.textContent = 'CONTENT CENTER'
  const title = create('h2', 'content-hub-title')
  title.id = CONTENT_HUB_TITLE_ID
  title.textContent = '内容中心'
  const subtitle = create('p', 'content-hub-sub')
  subtitle.textContent = '角色 / 声音 / 对话 / 主题 / 背景 / 字体 · 全部本地内容，不联网'
  headText.append(kicker, title, subtitle)
  const closeButton = create('button', 'content-hub-close')
  closeButton.type = 'button'
  closeButton.textContent = '合上'
  closeButton.setAttribute('aria-label', '关闭内容中心')
  header.append(headText, closeButton)

  const tabList = create('div', 'content-hub-tabs')
  tabList.setAttribute('role', 'tablist')
  tabList.setAttribute('aria-label', '内容分类')
  const tabs: { readonly tab: HTMLButtonElement; readonly category: ContentCategory }[] = []
  const tabButtons = new Map<ContentCategory, HTMLButtonElement>()
  for (const definition of CONTENT_HUB_TABS) {
    const tab = create('button', 'content-hub-tab')
    tab.type = 'button'
    tab.id = CONTENT_HUB_TAB_ID_PREFIX + definition.category
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', CONTENT_HUB_PANEL_ID)
    tab.setAttribute('aria-selected', 'false')
    tab.tabIndex = -1
    tab.textContent = definition.label
    tab.addEventListener('click', () => { activateTab(definition.category, false) })
    tab.addEventListener('keydown', (event) => { handleTabKey(event, definition.category) })
    tabs.push({ tab, category: definition.category })
    tabButtons.set(definition.category, tab)
    tabList.append(tab)
  }

  const panelBody = create('div', 'content-hub-body')
  panelBody.id = CONTENT_HUB_PANEL_ID
  panelBody.setAttribute('role', 'tabpanel')
  panelBody.tabIndex = 0
  const feedback = create('p', 'content-hub-feedback')
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')
  const footer = create('footer', 'content-hub-foot')
  const notice = create('p', 'content-hub-notice')
  notice.textContent = CONTENT_HUB_NOTICE
  const footRow = create('div', 'content-hub-footrow')
  const docsLink = create('a', 'content-hub-docs')
  docsLink.href = options.docsHref ?? CONTENT_HUB_DOCS_HREF
  docsLink.target = '_blank'
  docsLink.rel = 'noopener noreferrer'
  docsLink.textContent = '内容包扩展规范（canonical）'
  const packSummary = create('span', 'content-hub-packsum')
  const importButton = create('button', 'content-hub-import')
  importButton.type = 'button'
  importButton.textContent = '导入内容包（JSON）…'
  const importInput = hubDoc.createElement('input')
  importInput.type = 'file'
  importInput.accept = '.json,application/json'
  importInput.hidden = true
  importInput.setAttribute('aria-hidden', 'true')
  importInput.tabIndex = -1
  footRow.append(docsLink, packSummary, importButton, importInput)
  footer.append(notice, footRow)
  panel.append(header, tabList, panelBody, feedback, footer)
  rootElement.replaceChildren(backdrop, panel)

  let openState = false
  let activeTab: ContentCategory = 'characters'
  let returnFocus: HTMLElement | null = null
  let inertedApp: HTMLElement | null = null

  function setFeedback(message: string, state: 'ok' | 'error' | 'info'): void {
    feedback.textContent = message
    feedback.dataset.state = state
  }

  function updatePackSummary(): void {
    const summary = options.getPackSummary?.()
    const count = summary ? summary.installed : 0
    packSummary.textContent = count > 0 ? '已安装本地内容包：' + count + ' 个' : '未安装本地内容包'
  }

  function tabDefinition(category: ContentCategory): ContentHubTab | undefined {
    return CONTENT_HUB_TABS.find((definition) => definition.category === category)
  }

  function renderTabs(): void {
    for (const item of tabs) {
      const selected = item.category === activeTab
      item.tab.setAttribute('aria-selected', selected ? 'true' : 'false')
      item.tab.tabIndex = selected ? 0 : -1
      item.tab.dataset.active = selected ? 'true' : 'false'
    }
    panelBody.setAttribute('aria-labelledby', CONTENT_HUB_TAB_ID_PREFIX + activeTab)
  }

  function renderPanel(): void {
    panelBody.replaceChildren()
    const library = options.getLibrary()
    if (!library) {
      const empty = create('p', 'content-hub-empty')
      empty.textContent = '内容目录尚未加载，请稍后再试。'
      panelBody.append(empty)
      return
    }
    const definition = tabDefinition(activeTab)
    if (definition) {
      const blurb = create('p', 'content-hub-blurb')
      blurb.textContent = definition.blurb
      panelBody.append(blurb)
    }
    const entries = listContent(library, activeTab)
    if (entries.length === 0) {
      const empty = create('p', 'content-hub-empty')
      empty.textContent = '这个分类还没有可用内容。'
      panelBody.append(empty)
      return
    }
    const grid = create('div', 'content-hub-grid')
    for (const entry of entries) grid.append(buildCard(library, activeTab, entry))
    panelBody.append(grid)
  }

  function entryMeta(library: ContentLibrary, category: ContentCategory, entry: ContentEntry): string {
    switch (category) {
      case 'characters': {
        const character = entry as ContentCharacterEntry
        return character.voiceMode === 'tts'
          ? '人形/折纸 · 可发声（TTS 需独立同意）'
          : '猫/狗 · 静默 · 空心心理活动气泡'
      }
      case 'voices': {
        const voice = entry as ContentVoiceEntry
        const characterId = options.getSelection()?.character ?? ''
        const usableNow = isVoiceAvailableFor(voice, characterId)
        const names = voice.availableFor
          .map((id) => findContent(library, 'characters', id)?.name ?? id)
          .join('、')
        const status = usableNow ? '当前角色可用' : '当前角色静音，切回人形/折纸后生效'
        return voice.languages.join(' / ') + ' · ' + (voice.aiGenerated ? 'AI 合成' : '本地合成') + ' · ' + status + ' · 适用：' + names
      }
      case 'dialoguePacks': {
        const pack = entry as ContentDialoguePackEntry
        const auto = pack.mode === 'quiet' ? '自动环境气泡关闭' : '气泡概率 ' + Math.round(pack.bubbleChance * 100) + '%'
        return auto + ' · 单行 ≤ ' + pack.maxChars + ' 字'
      }
      case 'themes': {
        const theme = entry as ContentThemeEntry
        return '气泡 ' + theme.vars.bubbleBg + ' · 面板 ' + (theme.vars.panelBg ?? 'CSS 默认')
      }
      case 'backgrounds': {
        const background = entry as ContentBackgroundEntry
        if (background.kind === 'transparent') return '透明 · 默认，不遮挡桌面'
        if (background.kind === 'pattern') return '本地渐变图案（无外部图片）'
        return '纯色 ' + background.value
      }
      case 'fonts': {
        const font = entry as ContentFontEntry
        return font.family
      }
      default:
        return ''
    }
  }

  function decorateMedia(media: HTMLElement, category: ContentCategory, entry: ContentEntry): void {
    switch (category) {
      case 'characters': {
        const character = entry as ContentCharacterEntry
        if (character.preview.startsWith('/') && !character.preview.startsWith('//')) {
          const image = hubDoc.createElement('img')
          image.className = 'content-hub-preview'
          image.src = character.preview
          image.alt = ''
          image.loading = 'lazy'
          image.decoding = 'async'
          media.append(image)
          return
        }
        media.textContent = '角'
        media.classList.add('content-hub-media-glyph')
        return
      }
      case 'voices': {
        media.textContent = '♪'
        media.classList.add('content-hub-media-glyph')
        return
      }
      case 'dialoguePacks': {
        const pack = entry as ContentDialoguePackEntry
        media.textContent = pack.mode.slice(0, 3).toUpperCase()
        media.classList.add('content-hub-media-glyph')
        return
      }
      case 'themes': {
        const theme = entry as ContentThemeEntry
        const swatch = create('span', 'content-hub-swatch')
        swatch.style.setProperty('--famling-hub-swatch-bg', theme.vars.bubbleBg)
        swatch.style.setProperty('--famling-hub-swatch-fg', theme.vars.bubbleFg)
        swatch.style.setProperty('--famling-hub-swatch-border', theme.vars.bubbleBorder)
        media.append(swatch)
        return
      }
      case 'backgrounds': {
        const background = entry as ContentBackgroundEntry
        const swatch = create('span', 'content-hub-swatch')
        if (background.kind === 'transparent') swatch.classList.add('is-transparent')
        else swatch.style.setProperty('--famling-hub-swatch-bg', background.value)
        media.append(swatch)
        return
      }
      case 'fonts': {
        const font = entry as ContentFontEntry
        const sample = create('span', 'content-hub-font-sample')
        sample.textContent = 'Aa 折'
        sample.style.setProperty('--famling-hub-sample-font', font.family)
        media.append(sample)
        return
      }
      default:
        return
    }
  }

  function buildCard(library: ContentLibrary, category: ContentCategory, entry: ContentEntry): HTMLButtonElement {
    const selection = options.getSelection()
    const selectedId = selection ? selection[CONTENT_CATEGORY_SELECTION_KEY[category]] : ''
    const isSelected = entry.id === selectedId
    const card = create('button', 'content-hub-card')
    card.type = 'button'
    card.dataset.contentEntry = entry.id
    card.dataset.contentCategory = category
    card.setAttribute('aria-pressed', isSelected ? 'true' : 'false')
    if (isSelected) card.classList.add('selected')
    if (!entry.available) {
      card.disabled = true
      card.setAttribute('aria-disabled', 'true')
    }
    const media = create('span', 'content-hub-card-media')
    media.setAttribute('aria-hidden', 'true')
    decorateMedia(media, category, entry)
    const info = create('span', 'content-hub-card-info')
    const name = create('strong', 'content-hub-card-name')
    name.textContent = entry.name
    const description = create('span', 'content-hub-card-desc')
    description.textContent = entry.description
    const meta = create('span', 'content-hub-card-meta')
    meta.textContent = entryMeta(library, category, entry)
    info.append(name, description, meta)
    const state = create('span', 'content-hub-card-state')
    state.textContent = isSelected ? '当前' : entry.available ? '选择' : '不可用'
    card.append(media, info, state)
    if (entry.available) {
      card.addEventListener('click', () => { handleSelect(CONTENT_CATEGORY_SELECTION_KEY[category], entry.id) })
    }
    return card
  }

  function updateSelectionMarks(): void {
    const selection = options.getSelection()
    const selectedId = selection ? selection[CONTENT_CATEGORY_SELECTION_KEY[activeTab]] : ''
    const cards = Array.from(panelBody.querySelectorAll<HTMLButtonElement>('.content-hub-card'))
    for (const card of cards) {
      const isSelected = card.dataset.contentEntry === selectedId
      card.setAttribute('aria-pressed', isSelected ? 'true' : 'false')
      card.classList.toggle('selected', isSelected)
      const state = card.querySelector<HTMLElement>('.content-hub-card-state')
      if (state) state.textContent = isSelected ? '当前' : card.disabled ? '不可用' : '选择'
    }
  }

  function activateTab(category: ContentCategory, focusTab: boolean): void {
    activeTab = category
    renderTabs()
    renderPanel()
    setFeedback('', 'info')
    if (focusTab) tabButtons.get(category)?.focus()
  }

  function handleTabKey(event: KeyboardEvent, category: ContentCategory): void {
    const order = CONTENT_HUB_TABS.map((definition) => definition.category)
    const index = order.indexOf(category)
    let next: ContentCategory | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = order[(index + 1) % order.length]
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = order[(index - 1 + order.length) % order.length]
    else if (event.key === 'Home') next = order[0]
    else if (event.key === 'End') next = order[order.length - 1]
    if (next === undefined) return
    event.preventDefault()
    activateTab(next, true)
  }

  function handleSelect(key: SelectionKey, id: string): void {
    let result: ContentHubSelectResult
    try {
      result = options.select(key, id)
    } catch {
      result = { ok: false, message: '操作失败，请稍后再试。' }
    }
    setFeedback(result.message, result.ok ? 'ok' : 'error')
    if (!result.ok) return
    updateSelectionMarks()
    if (result.close === true) close(true)
  }

  function applyImportJson(text: string): void {
    let result: ContentHubImportResult
    try {
      result = options.importPack(text)
    } catch {
      result = { ok: false, message: '导入失败：内容包处理出错。' }
    }
    setFeedback(result.message, result.ok ? 'ok' : 'error')
    if (result.ok) {
      renderPanel()
      updatePackSummary()
    }
  }

  function handleFileSelected(): void {
    const file = importInput.files?.item(0) ?? null
    importInput.value = ''
    if (!file) return
    if (file.size > CONTENT_LIMITS.maxPackJsonBytes) {
      setFeedback('内容包文件超过上限（256 KB），已拒绝导入。', 'error')
      return
    }
    setFeedback('正在读取并校验内容包…', 'info')
    let read: Promise<string>
    try {
      read = file.text()
    } catch {
      setFeedback('读取文件失败，未导入。', 'error')
      return
    }
    read.then(
      (text) => { applyImportJson(text) },
      () => { setFeedback('读取文件失败，未导入。', 'error') },
    )
  }

  function focusableElements(): HTMLElement[] {
    const nodes = rootElement.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
    return Array.from(nodes).filter((node) => !node.hidden)
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

  /** True while a consent/TOS modal is on screen (it has its own inert lock). */
  function consentOverlayOpen(): boolean {
    try {
      return hubDoc.querySelectorAll('.consent-root').length > 0
    } catch {
      return false
    }
  }

  function open(): boolean {
    if (openState) return true
    if (!options.getLibrary()) return false
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
      // Never release the consent layer's own inertness: while a TOS/TTS overlay
      // is on screen it also inerted #pet-app, and removing the attribute here
      // would let focus reach the page behind the modal. The overlay's own
      // lockBackground/restore path releases it when the modal closes.
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
    rootElement.replaceChildren()
    rootElement.hidden = true
    rootElement.inert = true
    rootElement.dataset.state = 'closed'
  }

  backdrop.addEventListener('click', () => { close(true) })
  closeButton.addEventListener('click', () => { close(true) })
  importButton.addEventListener('click', () => { importInput.click() })
  importInput.addEventListener('change', () => { handleFileSelected() })

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
  })
}
