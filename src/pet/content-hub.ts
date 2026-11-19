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
 * The shared catalog / strict validation / selection / appearance core stays in
 * content-library.ts; this file NEVER re-implements or relaxes the parser or
 * validators, never uses innerHTML/eval, and never fetches a remote resource.
 * Zip/folder bytes are read by content-assets.ts (bounded, CRC-verified) and the
 * canonical validateContentPackV2 + validatePackZip + mergeCharacterThemes run
 * here before anything is installed. Remote packs are refused unless a real
 * Ed25519 verification result is supplied by the (future) market installer;
 * this UI always fails closed.
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
  CONTENT_LIBRARY_SCHEMA,
  CONTENT_LIMITS,
  CONTENT_PACK_SCHEMA,
  CONTENT_PACK_V2_LIMITS,
  CONTENT_SELECTION_CATEGORY,
  CONTENT_THEME_VAR_NAMES,
  CONTENT_USAGE_CONFIRMATION_REQUIRED,
  PROHIBITED_USES,
  applyAppearance,
  applyCharacterTheme,
  describeUsageConfirmation,
  findCharacterTheme,
  findContent,
  isVoiceAvailableFor,
  listCharacterThemes,
  listContent,
  matchCharacterThemes,
  mergeCharacterThemes,
  mergeInstalledPacks,
  readContentSelectionDetailed,
  readRoleThemeSelection,
  resolveContentSelection,
  resolveDialogueBehavior,
  validateContentPack,
  validateContentPackV2,
  validatePackZip,
  type ContentAppearanceDocumentLike,
  type ContentAppearanceResult,
  type ContentBackgroundEntry,
  type ContentCategory,
  type ContentCharacterTheme,
  type ContentDialoguePackEntry,
  type ContentEd25519Verifier,
  type ContentFontEntry,
  type ContentIssue,
  type ContentLibrary,
  type ContentMarketCatalog,
  type ContentMarketPack,
  type ContentPack,
  type ContentPackV2,
  type ContentSelection,
  type ContentSignatureVerification,
  type ContentThemeEntry,
  type ContentTrustRoot,
  type ContentVoiceEntry,
  type DialogueBehavior,
  type SelectionKey,
} from './content-library.ts'
import {
  collectBundleAssets,
  decodeUtf8,
  readContentFolder,
  readContentZip,
  type ContentBundleAsset,
} from './content-assets.ts'
import { readVersioned, writeVersioned, type StorageLike, type StorageWriteStatus } from './security/safe-storage.ts'
import { utf8ByteLength } from './security/limits.ts'

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

/** The customisable component groups (character itself is switched on 角色). */
export interface ContentCustomizeGroup {
  readonly key: SelectionKey
  readonly category: ContentCategory
  readonly label: string
  readonly blurb: string
}

export const CONTENT_CUSTOMIZE_GROUPS: readonly ContentCustomizeGroup[] = Object.freeze([
  { key: 'voice', category: 'voices', label: '声音', blurb: 'TTS 音色；切换会改变 TTS 配置签名并重新弹出语音声明。' },
  { key: 'dialoguePack', category: 'dialoguePacks', label: '对话', blurb: '气泡频率与长度策略；即时生效，错误/关键提示不受影响。' },
  { key: 'theme', category: 'themes', label: '主题', blurb: '气泡与面板配色；即时应用，不需要刷新。' },
  { key: 'background', category: 'backgrounds', label: '背景', blurb: '桌宠背景；透明仍是默认值，即时应用。' },
  { key: 'font', category: 'fonts', label: '字体', blurb: '本地字体栈；不使用网络字体，即时应用。' },
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
/** Canonical third-party pack / remote-market extension documentation. */
export const CONTENT_HUB_DOCS_HREF = '/content/README.md'
/** Fixed research-only notice shown in the footer (always visible). */
export const CONTENT_HUB_NOTICE =
  '研究用途 · 本地优先：角色主题与内容包仅用于技术研究与原型验证；导入前必须确认统一用途声明；默认不联网、不执行脚本，素材类型/大小/哈希与声明均按 0.2 规范严格校验；远程市场必须 Ed25519 验签。'

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

/** Human labels for the six canonical prohibited-use ids (declaration UI). */
export const PROHIBITED_USE_LABELS: Readonly<Record<(typeof PROHIBITED_USES)[number], string>> = Object.freeze({
  'emotional-companionship': '情感陪伴',
  'virtual-partner': '虚拟伴侣',
  'professional-advice': '心理治疗 / 医疗 / 法律 / 金融建议',
  'minor-intimacy': '未成年人亲密关系',
  impersonation: '冒充真人 / 官方',
  'illegal-use': '违反法律法规 / 平台规则',
})

// ---------------------------------------------------------------------------
// v1 installed local packs (kept: existing 0.1 dialogue/theme packs still load)
// ---------------------------------------------------------------------------

/** One versioned envelope holds every validated local v1 pack (raw JSON). */
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
 * Read the persisted v1 local packs. Everything is funneled through the
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

/** Persist the accepted v1 pack list atomically (single versioned envelope). */
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
// v2 installed role-theme packs (validated raw pack JSON, versioned envelope)
// ---------------------------------------------------------------------------

export const CONTENT_THEME_PACKS_KEY = 'desktop-games/pet/content/theme-packs'
export const CONTENT_THEME_PACKS_VERSION = 1
/** 16 packs x <=256 KiB manifest JSON, bounded well below the v1 envelope cap. */
export const CONTENT_THEME_PACKS_MAX_BYTES = 4 * 1024 * 1024
export const CONTENT_THEME_PACKS_MAX = 16

export type ThemePacksReadStatus = 'ok' | 'missing' | 'corrupt' | 'invalid' | 'version' | 'unavailable'

export interface ThemePacksReadResult {
  readonly status: ThemePacksReadStatus
  readonly packs: readonly unknown[]
}

/** Read the persisted v2 role-theme pack manifests (never trusted unvalidated). */
export function readInstalledThemePacks(storage?: StorageLike | null): ThemePacksReadResult {
  const result = readVersioned<readonly unknown[]>(
    CONTENT_THEME_PACKS_KEY,
    {
      version: CONTENT_THEME_PACKS_VERSION,
      maxBytes: CONTENT_THEME_PACKS_MAX_BYTES,
      validate: (value) => {
        if (!Array.isArray(value)) return undefined
        if (value.length > CONTENT_THEME_PACKS_MAX) return undefined
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

export interface ThemePacksWriteResult {
  readonly ok: boolean
  readonly status: InstalledPacksWriteStatus
  readonly bytes?: number
}

/** Persist the accepted v2 pack manifests atomically. */
export function writeInstalledThemePacks(
  packs: readonly unknown[],
  storage?: StorageLike | null,
): ThemePacksWriteResult {
  if (packs.length > CONTENT_THEME_PACKS_MAX) return Object.freeze({ ok: false, status: 'too-many' })
  const result = writeVersioned(
    CONTENT_THEME_PACKS_KEY,
    [...packs],
    { version: CONTENT_THEME_PACKS_VERSION, maxBytes: CONTENT_THEME_PACKS_MAX_BYTES },
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
// Role theme presentation + runtime support
// ---------------------------------------------------------------------------

/** Human-readable role theme summary used by the 角色 cards. */
export interface RoleThemeSummary {
  readonly name: string
  readonly description: string
  readonly characterName: string
  readonly voiceLabel: string
  readonly dialogueLabel: string
  readonly appearanceLabel: string
  readonly declarationLabel: string
  readonly designRef: string
  readonly version: string
  readonly author: string
  readonly source: string
}

function entryName(library: ContentLibrary, category: ContentCategory, id: string): string {
  return findContent(library, category, id)?.name ?? id
}

/** One-line "voice / dialogue / appearance" summary for a role theme. */
export function summarizeRoleTheme(library: ContentLibrary, theme: ContentCharacterTheme): RoleThemeSummary {
  const character = findContent(library, 'characters', theme.characterId)
  let voiceLabel: string
  if (theme.voiceId === 'none') {
    voiceLabel = '静默（猫 / 狗永不 TTS）'
  } else {
    voiceLabel = theme.voiceId + ' · ' + entryName(library, 'voices', theme.voiceId)
  }
  const dialogue = findContent(library, 'dialoguePacks', theme.dialoguePackId) as ContentDialoguePackEntry | undefined
  const dialogueLabel =
    dialogue === undefined
      ? theme.dialoguePackId
      : dialogue.name + '（' + dialogue.mode + ' · ≤' + dialogue.maxChars + ' 字）'
  const appearanceLabel =
    entryName(library, 'themes', theme.appearance.themeId) +
    ' / ' +
    entryName(library, 'backgrounds', theme.appearance.backgroundId) +
    ' / ' +
    entryName(library, 'fonts', theme.appearance.fontId)
  return Object.freeze({
    name: theme.name,
    description: theme.description,
    characterName: character?.name ?? theme.characterId,
    voiceLabel,
    dialogueLabel,
    appearanceLabel,
    declarationLabel: '研究用途声明 ✓',
    designRef: theme.designRef,
    version: theme.version,
    author: theme.author,
    source: theme.source,
  })
}

/** Whether this host can actually run a role theme in one click. */
export interface RoleThemeSupport {
  readonly supported: boolean
  readonly reason: string
}

/**
 * A role theme is runtime-supported only when its character and voice exist in
 * the BUILT-IN catalog (the local renderer / TTS provider). Pack-only characters
 * or voices need the remote market installer: they are imported metadata, not a
 * pretend-usable role.
 */
export function evaluateRoleThemeSupport(baseLibrary: ContentLibrary, theme: ContentCharacterTheme): RoleThemeSupport {
  const character = findContent(baseLibrary, 'characters', theme.characterId)
  if (character === undefined || !character.available) {
    return Object.freeze({
      supported: false,
      reason: '该角色动画由内容包提供，本机渲染器不支持；已导入但需远程市场安装器。',
    })
  }
  if (theme.voiceId !== 'none') {
    const voice = findContent(baseLibrary, 'voices', theme.voiceId) as ContentVoiceEntry | undefined
    if (voice === undefined || !voice.available) {
      return Object.freeze({
        supported: false,
        reason: '该声音由内容包提供，本机 TTS 不支持；已导入但需远程市场安装器。',
      })
    }
    if (!isVoiceAvailableFor(voice, character.id)) {
      return Object.freeze({
        supported: false,
        reason: '该声音与角色不匹配，需安装器重新校验；已导入但需远程市场安装器。',
      })
    }
  }
  return Object.freeze({ supported: true, reason: '' })
}

// ---------------------------------------------------------------------------
// Startup: read the role theme, apply the six keys, migrate old selections
// ---------------------------------------------------------------------------

export interface StartupRoleHints {
  /** Character the renderer booted with (runtime truth wins over stale keys). */
  readonly runtimeCharacter?: string
  /** TTS voice the runtime booted with. */
  readonly runtimeVoice?: string
}

export type StartupRolePlanSource = 'stored' | 'migrated' | 'default' | 'custom'

export interface StartupRolePlan {
  readonly roleThemeId: string | null
  readonly selection: ContentSelection
  readonly source: StartupRolePlanSource
  /** True when the six-key selection does not equal the role theme defaults. */
  readonly custom: boolean
  readonly writeRoleTheme: boolean
  readonly clearRoleTheme: boolean
}

function selectionEqualsTheme(library: ContentLibrary, themeId: string, selection: ContentSelection): boolean {
  const theme = findCharacterTheme(library, themeId)
  if (theme === undefined) return false
  const application = applyCharacterTheme(library, themeId)
  if (!application.ok || application.selection === undefined) return false
  const expected = application.selection
  return (
    expected.character === selection.character &&
    expected.voice === selection.voice &&
    expected.dialoguePack === selection.dialoguePack &&
    expected.theme === selection.theme &&
    expected.background === selection.background &&
    expected.font === selection.font
  )
}

/**
 * Decide the effective six-component selection at boot from the role-theme key
 * plus the stored legacy six-key selection:
 *
 * 1. a stored role theme wins; explicit six-key choices are overlaid on top
 *    (so per-component customisation survives a restart) -> source "stored";
 * 2. no role theme but explicit legacy six-key choices -> migrate to a matching
 *    character theme when one exists (six keys + role key written) -> "migrated"
 *    (unmatched legacy selections stay custom, nothing is overwritten);
 * 3. no stored selection at all -> apply defaultRoleTheme / the first preset
 *    and persist the full six-key bundle -> "default";
 * 4. runtime hints (renderer character / boot voice) are the final truth for the
 *    two keys that own runtime behaviour; if they contradict a stored role theme
 *    the role key is reconciled (matched again or cleared) instead of lying.
 */
export function planStartupRoleTheme(
  library: ContentLibrary,
  storage?: StorageLike | null,
  hints: StartupRoleHints = {},
): StartupRolePlan {
  const detailed = readContentSelectionDetailed(library, storage)
  const storedRole = readRoleThemeSelection(library, storage)
  const explicitKeys = (Object.keys(detailed.sources) as SelectionKey[]).filter(
    (key) => detailed.sources[key] === 'stored',
  )
  let selection: ContentSelection = detailed.selection
  let roleThemeId: string | null = null
  let source: StartupRolePlanSource = 'custom'
  let writeRoleTheme = false
  let clearRoleTheme = storedRole.source === 'invalid'

  const storedThemeId = storedRole.source === 'stored' ? storedRole.roleThemeId : null
  if (storedThemeId !== null) {
    const application = applyCharacterTheme(library, storedThemeId)
    if (application.ok && application.selection !== undefined) {
      const merged: Partial<Record<SelectionKey, string>> = { ...application.selection }
      for (const key of explicitKeys) merged[key] = detailed.selection[key]
      selection = resolveContentSelection(library, merged).selection
      roleThemeId = storedThemeId
      source = 'stored'
      clearRoleTheme = false
    }
  }

  if (roleThemeId === null && storedThemeId === null && explicitKeys.length > 0) {
    const matches = matchCharacterThemes(library, detailed.selection)
    const match = matches[0]
    if (match !== undefined) {
      roleThemeId = match.id
      selection = detailed.selection
      source = 'migrated'
      writeRoleTheme = true
      clearRoleTheme = false
    } else {
      selection = detailed.selection
      source = 'custom'
    }
  }

  if (roleThemeId === null && storedThemeId === null && explicitKeys.length === 0) {
    const defaults = library.defaultRoleTheme
    const defaultTheme =
      defaults !== undefined && findCharacterTheme(library, defaults) !== undefined
        ? defaults
        : library.rolePresets[0]?.id
    if (defaultTheme !== undefined) {
      const application = applyCharacterTheme(library, defaultTheme)
      if (application.ok && application.selection !== undefined) {
        roleThemeId = defaultTheme
        selection = application.selection
        source = 'default'
        writeRoleTheme = true
        clearRoleTheme = false
      }
    }
  }

  // Runtime truth for the two keys that own behaviour (renderer / TTS voice).
  const hinted: Partial<Record<SelectionKey, string>> = { ...selection }
  if (hints.runtimeCharacter !== undefined && hints.runtimeCharacter.length > 0) {
    hinted.character = hints.runtimeCharacter
  }
  if (hints.runtimeVoice !== undefined && hints.runtimeVoice.length > 0) {
    hinted.voice = hints.runtimeVoice
  }
  const resolved = resolveContentSelection(library, hinted).selection
  selection = resolved

  if (roleThemeId !== null) {
    const theme = findCharacterTheme(library, roleThemeId)
    if (theme === undefined || theme.characterId !== selection.character) {
      const matches = matchCharacterThemes(library, selection)
      const match = matches[0]
      if (match !== undefined && match.id !== roleThemeId) {
        roleThemeId = match.id
        source = 'migrated'
        writeRoleTheme = true
        clearRoleTheme = false
      } else if (match === undefined) {
        clearRoleTheme = true
        writeRoleTheme = false
        if (storedThemeId !== null || roleThemeId !== null) roleThemeId = null
        source = 'custom'
      }
    }
  }

  const custom = roleThemeId === null ? true : !selectionEqualsTheme(library, roleThemeId, selection)
  if (clearRoleTheme) writeRoleTheme = false
  return Object.freeze({
    roleThemeId,
    selection,
    source,
    custom,
    writeRoleTheme,
    clearRoleTheme,
  })
}

// ---------------------------------------------------------------------------
// v1 local pack import (kept for back-compat; the v2 UI imports 0.2 packs)
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
      readonly packs: readonly unknown[]
      readonly library: ContentLibrary
      readonly added: number
      readonly replaced: boolean
      readonly unchanged: boolean
    }
  | { readonly ok: false; readonly message: string; readonly issues: readonly ContentIssue[] }

const V1_IMPORT_MESSAGES = Object.freeze({
  notJson: '内容包不是合法 JSON，已拒绝导入。',
  tooLarge: '内容包 JSON 超过上限（256 KB），已拒绝导入。',
  notObject: '内容包必须是 JSON 对象。',
  remote: '远程内容包不支持导入：内容中心只接受本地/离线内容包，不联网、不加载远程资源。',
  characters: '角色内容包需要本地美术资源并进入角色生命周期，内容中心暂不支持直接导入；请等待安装器。',
  voices: '声音内容包会改变 TTS 配置签名，必须经过 TTS 独立声明与安装器验证；内容中心不导入外部声音包。',
  capacity: '已安装内容包数量达到上限，请先清理本地内容。',
  incompatible: '内容包与当前内容目录不兼容（library/app 版本不匹配），未安装。',
  conflict: '内容包条目与内置或已安装内容冲突；内置内容不可被覆盖，未安装。',
  invalid: '内容包校验失败，未安装。',
})

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasRemoteEntry(raw: Record<string, unknown>): boolean {
  const entries = raw.entries
  if (!Array.isArray(entries)) return false
  for (const entry of entries) {
    const record = entry
    if (!isPlainRecord(record)) continue
    if (record.source === 'remote' || record.remote !== undefined) return true
  }
  return false
}

function failV1Import(message: string, issues: readonly ContentIssue[] = []): ContentPackImportResult {
  return Object.freeze({ ok: false as const, message, issues: Object.freeze([...issues]) })
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

/** Validate one user-selected v1 JSON pack and compute the merge candidate. */
export function prepareContentPackImport(
  jsonText: string,
  baseLibrary: ContentLibrary,
  installedPacks: readonly unknown[],
): ContentPackImportResult {
  if (typeof jsonText !== 'string' || jsonText.length === 0) return failV1Import(V1_IMPORT_MESSAGES.notJson)
  if (utf8ByteLength(jsonText) > CONTENT_LIMITS.maxPackJsonBytes) return failV1Import(V1_IMPORT_MESSAGES.tooLarge)
  let raw: unknown
  try {
    raw = JSON.parse(jsonText)
  } catch {
    return failV1Import(V1_IMPORT_MESSAGES.notJson)
  }
  if (!isPlainRecord(raw)) return failV1Import(V1_IMPORT_MESSAGES.notObject)
  if (hasRemoteEntry(raw)) return failV1Import(V1_IMPORT_MESSAGES.remote)
  const validation = validateContentPack(raw)
  if (!validation.ok) {
    const first = validation.issues[0]
    const where = first ? '（' + first.path + ': ' + first.code + '）' : ''
    return failV1Import(V1_IMPORT_MESSAGES.invalid + where, validation.issues)
  }
  const pack = validation.pack
  if (pack.category === 'characters') return failV1Import(V1_IMPORT_MESSAGES.characters)
  if (pack.category === 'voices') return failV1Import(V1_IMPORT_MESSAGES.voices)
  if (!isRuntimeImportableCategory(pack.category)) return failV1Import(V1_IMPORT_MESSAGES.invalid)
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
    if (nextPacks.length >= MAX_INSTALLED_PACKS) return failV1Import(V1_IMPORT_MESSAGES.capacity)
    nextPacks.push(pack)
  }
  const merged = mergeInstalledPacks(baseLibrary, nextPacks)
  const skipped = merged.skippedPacks.find((entry) => entry.packId === pack.id)
  if (skipped !== undefined) return failV1Import(V1_IMPORT_MESSAGES.incompatible)
  if (merged.conflicts.length > 0) {
    const conflict = merged.conflicts[0]
    const detail = conflict ? '（' + conflict.category + '/' + conflict.id + '）' : ''
    return failV1Import(V1_IMPORT_MESSAGES.conflict + detail)
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
// v2 pack import: selection -> validated pending install
// ---------------------------------------------------------------------------

/** One user-selected pack input (.json text, .zip bytes, or folder files). */
export interface ContentPackFileSelection {
  readonly kind: 'json' | 'zip' | 'folder'
  readonly name: string
  /** For kind "json": the manifest text (bounded by the caller). */
  readonly text?: string
  /** For kind "zip": the archive bytes (bounded by the caller). */
  readonly bytes?: ArrayBuffer
  /** For kind "folder": bundle-relative files (root folder already stripped). */
  readonly files?: readonly { readonly path: string; readonly bytes: ArrayBuffer }[]
}

/** One validated, merge-checked pack waiting for explicit user confirmation. */
export interface PreparedThemePackImport {
  readonly pack: ContentPackV2
  /** Next persisted raw pack list (replaces the previous version of same id). */
  readonly nextPacks: readonly unknown[]
  /** Built-in catalog + every installed pack, merged and frozen. */
  readonly library: ContentLibrary
  /** Material assets extracted from a .zip / folder (empty for JSON-only). */
  readonly assets: readonly ContentBundleAsset[]
  /** True when zip/folder bytes were unzipped + hash-checked against files[]. */
  readonly verifiedAssets: boolean
  readonly sourceKind: 'json' | 'zip' | 'folder'
  readonly replaced: boolean
  readonly unchanged: boolean
}

export type ThemePackPrepareResult =
  | { readonly ok: true; readonly pending: PreparedThemePackImport }
  | { readonly ok: false; readonly message: string; readonly issues?: readonly ContentIssue[] }

export interface ThemePackCommitResult {
  readonly ok: boolean
  readonly message: string
  readonly installedCount?: number
}

/** Visible import errors (one per security-relevant class). */
export const CONTENT_PACK_IMPORT_MESSAGES = Object.freeze({
  notJson: '内容包不是合法 JSON，已拒绝导入。',
  tooLarge: '内容包超过大小上限（JSON ≤256 KiB；ZIP ≤16 MiB；单文件 ≤8 MiB；解压总量 ≤32 MiB），已拒绝导入。',
  notObject: '内容包必须是 JSON 对象（famling.content-pack/0.2 清单）。',
  remoteUnverified: '远程内容包必须经远程市场 Ed25519 验签安装器安装；未验签的远程包一律拒绝导入。',
  missingUsageDeclaration: '内容包缺少统一用途声明（researchOnly + canonical 短句 + 六条禁止用途），已拒绝导入。',
  statementMismatch: '内容包的用途声明与本项目统一声明不一致（逐字校验失败），已拒绝导入。',
  missingProhibitedUse: '内容包的用途声明缺少必需的禁止用途条目，已拒绝导入。',
  missingAiProvenance: '内容包缺少 AI 生成标识（aiProvenance）或披露，已拒绝导入。',
  unsafeZip: 'ZIP / 文件夹内含不安全路径（.. / 绝对路径 / 盘符 / 反斜杠 / 控制字符），已拒绝导入。',
  invalidZip: 'ZIP 结构不受支持或已损坏（可能是加密、ZIP64、非 deflate 压缩），已拒绝导入。',
  forbiddenType: '内容包只能包含 png / webp / json / woff2 素材与白名单文档，已拒绝导入。',
  assetMismatch: '素材清单与压缩包内容不一致（缺失、多余、大小或 sha256 不符），已拒绝导入。',
  zipTooLarge: '内容包超过大小/条目/压缩比上限（可能的压缩炸弹），已拒绝导入。',
  incompatible: '内容包与当前内容目录不兼容（library/app 版本不匹配），未安装。',
  missingReferences: '角色主题引用了内容目录中不存在的组件（需安装器补齐），未安装。',
  conflict: '内容包角色主题与内置或已安装内容冲突；内置内容不可被覆盖，未安装。',
  capacity: '已安装内容包数量达到上限，请先清理本地内容。',
  invalid: '内容包校验失败，未安装。',
})

function isPackV2Remote(raw: unknown): boolean {
  if (!isPlainRecord(raw)) return false
  if (raw.source === 'remote') return true
  return raw.remote !== undefined
}

function describeValidationFailure(issues: readonly ContentIssue[]): string {
  const codes = new Set(issues.map((item) => item.code))
  if (codes.has('missing-usage-declaration')) return CONTENT_PACK_IMPORT_MESSAGES.missingUsageDeclaration
  if (codes.has('usage-statement-mismatch')) return CONTENT_PACK_IMPORT_MESSAGES.statementMismatch
  if (codes.has('missing-prohibited-use') || codes.has('invalid-prohibited-use')) {
    return CONTENT_PACK_IMPORT_MESSAGES.missingProhibitedUse
  }
  if (codes.has('missing-ai-provenance')) return CONTENT_PACK_IMPORT_MESSAGES.missingAiProvenance
  if (
    codes.has('missing-signature') ||
    codes.has('invalid-signature') ||
    codes.has('unknown-signing-key') ||
    codes.has('revoked-signing-key') ||
    codes.has('key-outside-validity') ||
    codes.has('unverified-remote')
  ) {
    return CONTENT_PACK_IMPORT_MESSAGES.remoteUnverified
  }
  if (codes.has('unsafe-zip-entry')) return CONTENT_PACK_IMPORT_MESSAGES.unsafeZip
  if (codes.has('zip-too-large')) return CONTENT_PACK_IMPORT_MESSAGES.zipTooLarge
  if (codes.has('forbidden-asset-type')) return CONTENT_PACK_IMPORT_MESSAGES.forbiddenType
  if (
    codes.has('hash-mismatch') ||
    codes.has('file-size-mismatch') ||
    codes.has('missing-file') ||
    codes.has('unlisted-file')
  ) {
    return CONTENT_PACK_IMPORT_MESSAGES.assetMismatch
  }
  if (codes.has('invalid-zip')) return CONTENT_PACK_IMPORT_MESSAGES.invalidZip
  return CONTENT_PACK_IMPORT_MESSAGES.invalid
}

type ThemePackPrepareFailure = Extract<ThemePackPrepareResult, { ok: false }>

function failPrepare(message: string, issues: readonly ContentIssue[] = []): ThemePackPrepareFailure {
  return Object.freeze({ ok: false as const, message, issues: Object.freeze([...issues]) })
}

type ManifestParseOutcome =
  | { readonly parsed: true; readonly raw: Record<string, unknown> }
  | { readonly parsed: false; readonly failure: Extract<ThemePackPrepareResult, { ok: false }> }

function parsePackManifestText(text: string): ManifestParseOutcome {
  if (typeof text !== 'string' || text.length === 0) {
    return { parsed: false, failure: failPrepare(CONTENT_PACK_IMPORT_MESSAGES.notJson) }
  }
  if (utf8ByteLength(text) > CONTENT_PACK_V2_LIMITS.maxPackJsonBytes) {
    return { parsed: false, failure: failPrepare(CONTENT_PACK_IMPORT_MESSAGES.tooLarge) }
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { parsed: false, failure: failPrepare(CONTENT_PACK_IMPORT_MESSAGES.notJson) }
  }
  if (!isPlainRecord(raw)) {
    return { parsed: false, failure: failPrepare(CONTENT_PACK_IMPORT_MESSAGES.notObject) }
  }
  return { parsed: true, raw }
}

interface BundleManifestResult {
  readonly ok: true
  readonly pack: ContentPackV2
  readonly assets: readonly ContentBundleAsset[]
}
type BundleManifestOutcome = BundleManifestResult | Extract<ThemePackPrepareResult, { ok: false }>

async function readBundleManifest(
  bundle: { readonly fileMap: ReadonlyMap<string, Uint8Array>; readonly inventory: Parameters<typeof validatePackZip>[1] },
  packJsonBytes: Uint8Array | undefined,
): Promise<BundleManifestOutcome> {
  if (packJsonBytes === undefined) {
    return failPrepare('压缩包根目录缺少 pack.json，已拒绝导入。')
  }
  if (packJsonBytes.byteLength > CONTENT_PACK_V2_LIMITS.maxPackJsonBytes) {
    return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.tooLarge)
  }
  const text = decodeUtf8(packJsonBytes)
  if (text === null) return failPrepare('pack.json 不是合法 UTF-8，已拒绝导入。')
  const parsed = parsePackManifestText(text)
  if (!parsed.parsed) return parsed.failure
  if (isPackV2Remote(parsed.raw)) return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.remoteUnverified)
  const validation = validateContentPackV2(parsed.raw)
  if (!validation.ok) return failPrepare(describeValidationFailure(validation.issues), validation.issues)
  const zipValidation = validatePackZip(validation.pack, bundle.inventory)
  if (!zipValidation.ok) {
    return failPrepare(describeValidationFailure(zipValidation.issues), zipValidation.issues)
  }
  return Object.freeze({
    ok: true as const,
    pack: validation.pack,
    assets: collectBundleAssets(validation.pack, bundle),
  })
}

/** Validate + merge-check one selected local pack; nothing is written yet. */
export async function prepareThemePackImport(
  selection: ContentPackFileSelection,
  baseLibrary: ContentLibrary,
  installedPacks: readonly unknown[],
): Promise<ThemePackPrepareResult> {
  if (!isPlainRecord(selection) || typeof selection.name !== 'string') {
    return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.notObject)
  }
  let pack: ContentPackV2 | undefined
  let assets: readonly ContentBundleAsset[] = Object.freeze([])
  let verifiedAssets = false
  if (selection.kind === 'json') {
    const parsed = parsePackManifestText(selection.text ?? '')
    if (!parsed.parsed) return parsed.failure
    if (isPackV2Remote(parsed.raw)) return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.remoteUnverified)
    const validation = validateContentPackV2(parsed.raw)
    if (!validation.ok) return failPrepare(describeValidationFailure(validation.issues), validation.issues)
    pack = validation.pack
  } else if (selection.kind === 'zip') {
    const bytes = selection.bytes
    if (!(bytes instanceof ArrayBuffer)) return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.notJson)
    if (bytes.byteLength === 0 || bytes.byteLength > CONTENT_PACK_V2_LIMITS.maxZipBytes) {
      return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.tooLarge)
    }
    const read = await readContentZip(bytes)
    if (!read.ok) return failPrepare(describeValidationFailure(read.issues), read.issues)
    const manifest = await readBundleManifest(read.bundle, read.bundle.fileMap.get('pack.json'))
    if (!('pack' in manifest)) return manifest
    pack = manifest.pack
    assets = manifest.assets
    verifiedAssets = true
  } else if (selection.kind === 'folder') {
    const files = selection.files ?? []
    if (files.length === 0) return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.tooLarge)
    if (files.length > CONTENT_PACK_V2_LIMITS.maxZipEntries) {
      return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.zipTooLarge)
    }
    const read = await readContentFolder(files)
    if (!read.ok) return failPrepare(describeValidationFailure(read.issues), read.issues)
    const manifest = await readBundleManifest(read.bundle, read.bundle.fileMap.get('pack.json'))
    if (!('pack' in manifest)) return manifest
    pack = manifest.pack
    assets = manifest.assets
    verifiedAssets = true
  } else {
    return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.notObject)
  }
  if (pack.source !== 'local') return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.remoteUnverified)

  let replaceIndex = -1
  for (let index = 0; index < installedPacks.length; index += 1) {
    const candidate = installedPacks[index]
    if (isPlainRecord(candidate) && candidate.id === pack.id) {
      replaceIndex = index
      break
    }
  }
  const nextPacks: unknown[] = [...installedPacks]
  if (replaceIndex >= 0) nextPacks[replaceIndex] = pack
  else {
    if (nextPacks.length >= CONTENT_THEME_PACKS_MAX) return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.capacity)
    nextPacks.push(pack)
  }
  const merged = mergeCharacterThemes(baseLibrary, nextPacks, Object.freeze({}))
  const skipped = merged.skippedPacks.find((entry) => entry.packId === pack.id)
  if (skipped !== undefined) {
    if (skipped.code === 'incompatible-pack') return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.incompatible)
    if (skipped.code === 'missing-references') {
      return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.missingReferences, skipped.issues ?? [])
    }
    if (skipped.code === 'unverified-remote') return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.remoteUnverified)
    return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.invalid, skipped.issues ?? [])
  }
  const conflicts = merged.conflicts.filter((entry) => entry.packId === pack.id)
  if (conflicts.length > 0) {
    const first = conflicts[0]
    const detail = first ? '（' + first.kind + '/' + first.id + '）' : ''
    return failPrepare(CONTENT_PACK_IMPORT_MESSAGES.conflict + detail)
  }
  const previous = replaceIndex >= 0 ? installedPacks[replaceIndex] : undefined
  const unchanged = previous !== undefined && safeJson(previous) === safeJson(pack)
  return Object.freeze({
    ok: true as const,
    pending: Object.freeze({
      pack,
      nextPacks: Object.freeze(nextPacks),
      library: merged.library,
      assets,
      verifiedAssets,
      sourceKind: selection.kind,
      replaced: replaceIndex >= 0,
      unchanged,
    }),
  })
}

/** Persist a confirmed pending pack manifest list (assets are host-owned). */
export function commitPreparedThemePack(
  pending: PreparedThemePackImport,
  storage?: StorageLike | null,
): ThemePacksWriteResult {
  return writeInstalledThemePacks(pending.nextPacks, storage)
}

// ---------------------------------------------------------------------------
// Market contract (metadata only; this module never fetches)
// ---------------------------------------------------------------------------

/** One market listing as shown in the 市场 tab. */
export interface ContentMarketListing {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
}

export type ContentMarketUiStatus = 'unconfigured' | 'configured' | 'error'

export interface ContentMarketUiState {
  readonly status: ContentMarketUiStatus
  readonly configured: boolean
  readonly title: string
  readonly detail: string
  readonly sourceLabel?: string
  readonly catalogVersion?: string
  readonly packs?: readonly ContentMarketListing[]
}

/** Verification dependencies a remote market implementation must receive. */
export interface RemoteMarketVerifyDeps {
  readonly trustRoot: ContentTrustRoot
  readonly verifier: ContentEd25519Verifier
  readonly now?: string
}

/**
 * Remote market source contract (fetch / verify / install). The UI NEVER calls
 * it by itself: the default state is unconfigured and no network request is
 * made until a host explicitly wires a configured source + installer.
 *
 * v1 implementation: createRemoteMarketSource() in src/pet/content-market.ts
 * implements this interface (catalog verification, anti-rollback, bounded
 * download, injected install callbacks). Wire its createRemoteMarketRefresh()
 * into ContentHubOptions.refreshMarket after an explicit user click; this
 * module stays fetch-free either way.
 */
export interface RemoteMarketSource {
  readonly id: string
  readonly label: string
  /** False until a real, reviewed production market is configured. */
  readonly configured: boolean
  fetchCatalog(options?: { readonly signal?: AbortSignal }): Promise<unknown>
  fetchPackBytes(pack: ContentMarketPack, options?: { readonly signal?: AbortSignal }): Promise<ArrayBuffer>
  verifyCatalog(catalog: ContentMarketCatalog, deps: RemoteMarketVerifyDeps): ContentSignatureVerification
  verifyPack(
    pack: ContentMarketPack,
    zipSha256: string,
    deps: RemoteMarketVerifyDeps,
  ): ContentSignatureVerification
  installPack?(pack: ContentMarketPack, bundle: ArrayBuffer): Promise<unknown>
}

/** Steps a future remote installer must implement (fail-closed order). */
export const CONTENT_MARKET_CONTRACT_STEPS: readonly string[] = Object.freeze([
  '1. 拉取市场目录 catalog.json（只有用户点击后才会联网）',
  '2. validateMarketCatalog + verifyMarketCatalogSignature（Ed25519 / 信任根）',
  '3. 展示该包的统一用途声明，用户显式确认后才允许下载',
  '4. 下载 .zip，先比 zipSha256，再 verifyMarketPackDownload 验签',
  '5. 解压 + validateContentPackV2 + validatePackZip（路径/大小/哈希）',
  '6. pack.json 的 remote.signature 用 verifyRemoteContentPack 再验',
  '7. mergeCharacterThemes({ verifyRemote }) 原子合并；可卸载/离线缓存，不静默更新',
])

/** Default state: the online market is not configured, so nothing fetches. */
export function defaultContentMarketState(): ContentMarketUiState {
  return Object.freeze({
    status: 'unconfigured' as const,
    configured: false,
    title: '服务器未配置 · 默认不联网',
    detail:
      '远程在线市场尚未配置：本页只显示状态与验签流程，不会发起任何网络请求，也不会下载/安装任何内容。本地 .json / .zip / 文件夹导入可用。',
  })
}

/** Describe the injected market source (or the honest unconfigured default). */
export function describeContentMarketState(
  source?: Pick<RemoteMarketSource, 'id' | 'label' | 'configured'> | null,
): ContentMarketUiState {
  if (!source || source.configured !== true) return defaultContentMarketState()
  return Object.freeze({
    status: 'configured' as const,
    configured: true,
    title: '市场已配置 · 需要显式操作才会联网',
    detail:
      '已注入远程市场源「' +
      source.label +
      '」。本页不会自动请求；连接/刷新必须由你点击，且只接受 Ed25519 验签通过的内容。',
    sourceLabel: source.label,
  })
}

/** Summarize an already validated market catalog for rendering (no fetching). */
export function summarizeMarketCatalog(
  catalog: ContentMarketCatalog,
  sourceLabel?: string,
): ContentMarketUiState {
  const packs: ContentMarketListing[] = catalog.packs.map((pack) =>
    Object.freeze({
      id: pack.id,
      name: pack.name,
      version: pack.version,
      description: pack.description,
    }),
  )
  const base = sourceLabel === undefined ? '市场目录' : '市场目录 · ' + sourceLabel
  return Object.freeze({
    status: 'configured' as const,
    configured: true,
    title: base + '（已验签）',
    detail:
      '目录版本 ' +
      catalog.version +
      '，更新于 ' +
      catalog.updatedAt +
      '。下载/安装仍需要逐包用途声明确认，未验签内容不会合并。',
    ...(sourceLabel !== undefined ? { sourceLabel } : {}),
    catalogVersion: catalog.version,
    packs: Object.freeze(packs),
  })
}

export function isRemoteMarketConfigured(source?: Pick<RemoteMarketSource, 'configured'> | null): boolean {
  return source?.configured === true
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

/** One installed pack row shown in the 内容包 tab. */
export interface ContentHubInstalledPack {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly kind: 'v1' | 'role-theme'
  readonly roleThemes: number
  readonly declaration: boolean
  readonly aiDisclosure?: string
  readonly license?: string
  /** Visible caveat, e.g. 「已导入但需远程市场安装器」. */
  readonly note?: string
  /** Generated FontFace families usable for a local sample preview. */
  readonly fontFamilies?: readonly string[]
}

export interface ContentHubMarketRefreshResult {
  readonly ok: boolean
  readonly message: string
  readonly state?: ContentMarketUiState
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
  readonly getMarketState?: () => ContentMarketUiState
  /**
   * Called ONLY from the user's 「刷新市场目录…」 click. The host should wire
   * createRemoteMarketRefresh(client) from content-market.ts; leaving it
   * undefined keeps the market button disabled and the build offline.
   */
  readonly refreshMarket?: () => Promise<ContentHubMarketRefreshResult>
  /** Local object URL for an installed pack preview (builtin themes use path). */
  readonly resolvePreviewUrl?: (theme: ContentCharacterTheme) => string | null
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
  /** Test/diagnostic hook: pending confirmation state, never HTML. */
  hasPendingImport(): boolean
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

  function updatePackSummary(): void {
    const count = installedPacks().length
    packSummary.textContent = count > 0 ? '已安装内容包：' + count + ' 个' : '未安装内容包'
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

  function roleIsCurrent(library: ContentLibrary, theme: ContentCharacterTheme): boolean {
    const roleId = getRoleThemeId()
    if (roleId !== null) return roleId === theme.id
    const selection = getSelection()
    if (selection === null) return false
    return matchCharacterThemes(library, selection).some((candidate) => candidate.id === theme.id)
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

  // --- 角色 ---------------------------------------------------------------

  function buildRoleCard(library: ContentLibrary, theme: ContentCharacterTheme, installed: boolean): HTMLElement {
    const base = getBaseLibrary(library)
    const support = installed ? evaluateRoleThemeSupport(base, theme) : Object.freeze({ supported: true, reason: '' })
    const summary = summarizeRoleTheme(library, theme)
    const current = roleIsCurrent(library, theme)
    const card = create('article', 'content-hub-role-card')
    card.dataset.roleTheme = theme.id
    if (current) card.classList.add('current')
    if (!support.supported) card.classList.add('unsupported')

    const media = create('div', 'content-hub-card-media')
    media.setAttribute('aria-hidden', 'true')
    const previewUrl = (() => {
      try {
        return options.resolvePreviewUrl?.(theme) ?? null
      } catch {
        return null
      }
    })()
    if (previewUrl !== null && previewUrl.length > 0) {
      const image = hubDoc.createElement('img')
      image.className = 'content-hub-preview'
      image.src = previewUrl
      image.alt = ''
      image.loading = 'lazy'
      image.decoding = 'async'
      media.append(image)
    } else {
      media.textContent = installed ? '包' : '角'
      media.classList.add('content-hub-media-glyph')
    }

    const info = create('div', 'content-hub-card-info')
    const name = create('strong', 'content-hub-card-name')
    name.textContent = summary.name
    const description = create('span', 'content-hub-card-desc')
    description.textContent = summary.description
    const meta = create('span', 'content-hub-card-meta')
    meta.textContent =
      '角色 ' +
      summary.characterName +
      ' · 声音 ' +
      summary.voiceLabel +
      ' · 对话 ' +
      summary.dialogueLabel
    const appearance = create('span', 'content-hub-card-meta')
    appearance.textContent = '外观 ' + summary.appearanceLabel
    const badges = create('div', 'content-hub-badges')
    const declaration = create('span', 'content-hub-badge')
    declaration.textContent = summary.declarationLabel
    const state = create('span', 'content-hub-badge')
    state.textContent = current ? '当前角色' : installed ? '已导入' : '内置'
    badges.append(declaration, state)
    const design = create('a', 'content-hub-design-ref')
    design.href = options.docsHref ?? CONTENT_HUB_DOCS_HREF
    design.target = '_blank'
    design.rel = 'noopener noreferrer'
    design.textContent = '设计参考：' + summary.designRef
    info.append(name, description, meta, appearance, badges, design)

    const actions = create('div', 'content-hub-role-actions')
    const applyButton = create('button', 'content-hub-apply')
    applyButton.type = 'button'
    applyButton.textContent = '一键应用这个角色'
    applyButton.dataset.roleTheme = theme.id
    applyButton.disabled = !support.supported
    applyButton.addEventListener('click', () => {
      handleApplyRole(theme.id)
    })
    actions.append(applyButton)
    card.append(media, info, actions)
    if (!support.supported) {
      const note = create('p', 'content-hub-role-note')
      note.textContent = support.reason
      card.append(note)
    }
    return card
  }

  function renderRoles(): void {
    const library = getLibrary()
    if (!library) {
      appendEmpty('内容目录尚未加载，请稍后再试。')
      return
    }
    const presets = library.rolePresets
    if (presets.length === 0) {
      appendEmpty('内置角色目录为空。')
    } else {
      const heading = create('h3', 'content-hub-group-title')
      heading.textContent = '内置角色'
      panelBody.append(heading)
      const grid = create('div', 'content-hub-role-grid')
      for (const theme of presets) grid.append(buildRoleCard(library, theme, false))
      panelBody.append(grid)
    }
    const installed = library.characterThemes
    const heading = create('h3', 'content-hub-group-title')
    heading.textContent = '已导入角色主题'
    panelBody.append(heading)
    if (installed.length === 0) {
      appendEmpty('还没有导入的角色主题；可在「内容包」导入 .json / .zip / 文件夹。')
      return
    }
    const grid = create('div', 'content-hub-role-grid')
    for (const theme of installed) grid.append(buildRoleCard(library, theme, true))
    panelBody.append(grid)
  }

  // --- 自定义 -------------------------------------------------------------

  function buildChip(
    key: SelectionKey,
    label: string,
    entryId: string,
    selected: boolean,
    available: boolean,
    onActivate: () => void,
  ): HTMLButtonElement {
    const chip = create('button', 'content-hub-chip')
    chip.type = 'button'
    chip.dataset.selectionKey = key
    chip.dataset.contentEntry = entryId
    chip.setAttribute('aria-pressed', selected ? 'true' : 'false')
    chip.disabled = !available
    chip.textContent = label + (selected ? ' · 当前' : '')
    if (selected) chip.classList.add('selected')
    chip.addEventListener('click', onActivate)
    return chip
  }

  function renderCustomize(): void {
    const library = getLibrary()
    if (!library) {
      appendEmpty('内容目录尚未加载，请稍后再试。')
      return
    }
    const selection = getSelection()
    const roleId = getRoleThemeId()
    const roleTheme = roleId === null ? null : (findCharacterTheme(library, roleId) ?? null)
    const heading = create('h3', 'content-hub-group-title')
    heading.textContent = '在角色主题上自定义'
    const intro = create('p', 'content-hub-blurb')
    intro.textContent =
      roleTheme !== null
        ? '当前角色：「' + roleTheme.name + '」。下面的修改只覆盖对应组件，其余仍跟随角色主题。'
        : '当前是自定义组合（未匹配内置角色主题）。可以逐项调整，或在「角色」里一键应用一个角色。'
    panelBody.append(heading, intro)
    const restoreRow = create('div', 'content-hub-actions')
    const restore = create('button', 'content-hub-restore')
    restore.type = 'button'
    restore.textContent = '恢复此角色默认'
    restore.disabled = roleTheme === null || options.restoreRole === undefined
    restore.addEventListener('click', () => {
      handleRestoreRole()
    })
    restoreRow.append(restore)
    panelBody.append(restoreRow)
    if (selection === null) {
      appendEmpty('内容选择尚未加载，请稍后再试。')
      return
    }
    for (const group of CONTENT_CUSTOMIZE_GROUPS) {
      const section = create('section', 'content-hub-group')
      const groupTitle = create('h4', 'content-hub-group-heading')
      groupTitle.textContent = group.label
      const groupBlurb = create('p', 'content-hub-group-blurb')
      groupBlurb.textContent = group.blurb
      const row = create('div', 'content-hub-chip-row')
      const entries = listContent(library, group.category)
      if (entries.length === 0) {
        row.textContent = '这个分类还没有可用内容。'
      }
      for (const entry of entries) {
        const selected = selection[group.key] === entry.id
        row.append(
          buildChip(group.key, entry.name, entry.id, selected, entry.available, () => {
            handleCustomize(group.key, entry.id)
          }),
        )
      }
      section.append(groupTitle, groupBlurb, row)
      panelBody.append(section)
    }
  }

  // --- 内容包 -------------------------------------------------------------

  function buildInstalledPackRow(pack: ContentHubInstalledPack): HTMLElement {
    const row = create('article', 'content-hub-pack')
    row.dataset.packId = pack.id
    const head = create('div', 'content-hub-pack-head')
    const name = create('strong', 'content-hub-pack-name')
    name.textContent = pack.name
    const version = create('span', 'content-hub-pack-version')
    version.textContent = 'v' + pack.version
    const kind = create('span', 'content-hub-badge')
    kind.textContent = pack.kind === 'v1' ? '旧版内容包 0.1' : '角色主题包 0.2'
    head.append(name, version, kind)
    row.append(head)
    const meta = create('p', 'content-hub-pack-meta')
    meta.textContent =
      (pack.declaration ? '统一用途声明 ✓' : '旧版 0.1（无统一声明）') +
      ' · 角色主题 ' +
      pack.roleThemes +
      ' 个' +
      (pack.license !== undefined ? ' · 许可 ' + pack.license : '')
    row.append(meta)
    if (pack.aiDisclosure !== undefined) {
      const ai = create('p', 'content-hub-pack-meta')
      ai.textContent = 'AI 标识：' + pack.aiDisclosure
      row.append(ai)
    }
    if (pack.note !== undefined) {
      const note = create('p', 'content-hub-pack-note')
      note.textContent = pack.note
      row.append(note)
    }
    if (pack.fontFamilies !== undefined && pack.fontFamilies.length > 0) {
      const fontRow = create('div', 'content-hub-font-row')
      for (const family of pack.fontFamilies) {
        const sample = create('span', 'content-hub-font-sample')
        sample.textContent = 'Aa 折角'
        sample.style.setProperty('--famling-hub-sample-font', '"' + family + '"')
        fontRow.append(sample)
      }
      row.append(fontRow)
    }
    return row
  }

  function buildDeclarationConfirmation(pending: PreparedThemePackImport): HTMLElement {
    const confirmation = describeUsageConfirmation()
    const section = create('section', 'content-hub-confirm')
    section.dataset.packId = pending.pack.id
    const heading = create('h3', 'content-hub-confirm-title')
    heading.textContent = '导入前确认：' + pending.pack.name
    const meta = create('p', 'content-hub-pack-meta')
    meta.textContent =
      '版本 ' +
      pending.pack.version +
      ' · 许可 ' +
      pending.pack.license.spdx +
      ' / ' +
      pending.pack.license.attribution +
      ' · 角色主题 ' +
      pending.pack.roleThemes.length +
      ' 个'
    const ai = create('p', 'content-hub-pack-meta')
    ai.textContent =
      'AI 标识：' +
      (pending.pack.aiProvenance.generated ? 'AI 生成' : '非 AI 生成') +
      ' · ' +
      pending.pack.aiProvenance.disclosure
    const assurance = create('p', 'content-hub-pack-meta')
    assurance.textContent = pending.verifiedAssets
      ? '素材包：已解包 + 逐文件 sha256 校验（pack.files 与文件清单一一对应）。'
      : '清单模式：仅校验声明与元数据；未随包提供素材文件，预览 / 字体等素材不会安装。'
    const label = create('p', 'content-hub-declaration-label')
    label.textContent = '统一用途声明（逐字校验通过，必须阅读）：'
    const statement = create('p', 'content-hub-declaration')
    statement.textContent = confirmation.statement
    const ref = create('p', 'content-hub-declaration-ref')
    ref.textContent =
      '声明文件：' + confirmation.statementRef + ' · SHA-256 ' + confirmation.sha256
    const prohibited = create('ul', 'content-hub-prohibited')
    for (const id of confirmation.prohibitedUses) {
      const item = create('li', 'content-hub-prohibited-item')
      item.textContent = '禁止：' + PROHIBITED_USE_LABELS[id]
      prohibited.append(item)
    }
    const hint = create('p', 'content-hub-pack-note')
    hint.textContent = '点击「确认导入」表示你已阅读并同意上述统一用途声明；内容仍仅限研究与原型验证用途。'
    const actions = create('div', 'content-hub-actions')
    const confirm = create('button', 'content-hub-confirm-ok')
    confirm.type = 'button'
    confirm.textContent = '确认导入'
    confirm.addEventListener('click', () => {
      handleConfirmImport()
    })
    const cancel = create('button', 'content-hub-confirm-cancel')
    cancel.type = 'button'
    cancel.textContent = '取消'
    cancel.addEventListener('click', () => {
      pendingImport = null
      setFeedback('已取消导入，未安装任何内容。', 'info')
      setIssues([])
      renderPanel()
    })
    actions.append(confirm, cancel)
    section.append(heading, meta, ai, assurance, label, statement, ref, prohibited, hint, actions)
    return section
  }

  function renderPacks(): void {
    const pickerRow = create('div', 'content-hub-actions')
    const jsonButton = create('button', 'content-hub-import')
    jsonButton.type = 'button'
    jsonButton.textContent = '导入内容包（.json / .zip）…'
    const jsonInput = hubDoc.createElement('input')
    jsonInput.type = 'file'
    jsonInput.accept = '.json,.zip,application/json,application/zip'
    jsonInput.className = 'content-hub-file-input'
    jsonInput.hidden = true
    jsonInput.setAttribute('aria-hidden', 'true')
    jsonInput.tabIndex = -1
    jsonButton.addEventListener('click', () => {
      if (!importBusy) jsonInput.click()
    })
    jsonInput.addEventListener('change', () => {
      void handleImportFile('single')
    })
    const folderButton = create('button', 'content-hub-import')
    folderButton.type = 'button'
    folderButton.textContent = '导入素材包文件夹…'
    const folderInput = hubDoc.createElement('input')
    folderInput.type = 'file'
    folderInput.className = 'content-hub-file-input'
    folderInput.hidden = true
    folderInput.setAttribute('webkitdirectory', '')
    folderInput.setAttribute('directory', '')
    folderInput.setAttribute('aria-hidden', 'true')
    folderInput.tabIndex = -1
    folderButton.addEventListener('click', () => {
      if (!importBusy) folderInput.click()
    })
    folderInput.addEventListener('change', () => {
      void handleImportFile('folder')
    })
    pickerRow.append(jsonButton, folderButton, jsonInput, folderInput)
    panelBody.append(pickerRow)
    const rules = create('p', 'content-hub-blurb')
    rules.textContent =
      '只接受本地 famling.content-pack/0.2：pack.json + assets/；ZIP / 文件夹会解包并逐文件校验 sha256；' +
      '缺统一声明、声明不符、含不安全路径或未验签的远程包一律拒绝。导入后在「角色」里应用。'
    panelBody.append(rules)

    if (pendingImport !== null) {
      panelBody.append(buildDeclarationConfirmation(pendingImport))
    }

    const heading = create('h3', 'content-hub-group-title')
    heading.textContent = '已安装内容包'
    panelBody.append(heading)
    const installed = installedPacks()
    if (installed.length === 0) {
      appendEmpty('尚未安装内容包。')
      return
    }
    const list = create('div', 'content-hub-pack-list')
    for (const pack of installed) list.append(buildInstalledPackRow(pack))
    panelBody.append(list)
  }

  // --- 市场 ---------------------------------------------------------------

  function getMarketState(): ContentMarketUiState {
    if (marketState !== null) return marketState
    try {
      return options.getMarketState?.() ?? defaultContentMarketState()
    } catch {
      return defaultContentMarketState()
    }
  }

  function renderMarket(): void {
    const state = getMarketState()
    const card = create('section', 'content-hub-market')
    const status = create('p', 'content-hub-market-status')
    status.textContent = state.title
    status.dataset.status = state.status
    const detail = create('p', 'content-hub-blurb')
    detail.textContent = state.detail
    card.append(status, detail)
    if (state.sourceLabel !== undefined) {
      const source = create('p', 'content-hub-pack-meta')
      source.textContent = '市场源：' + state.sourceLabel
      card.append(source)
    }
    const actions = create('div', 'content-hub-actions')
    const refresh = create('button', 'content-hub-market-refresh')
    refresh.type = 'button'
    refresh.textContent = state.configured ? '刷新市场目录…' : '远程市场未配置（不联网）'
    refresh.disabled = !state.configured || options.refreshMarket === undefined
    refresh.addEventListener('click', () => {
      void handleRefreshMarket()
    })
    actions.append(refresh)
    card.append(actions)
    if (state.packs !== undefined && state.packs.length > 0) {
      const heading = create('h4', 'content-hub-group-heading')
      heading.textContent = '市场目录（已验签）'
      card.append(heading)
      const list = create('div', 'content-hub-pack-list')
      for (const pack of state.packs) {
        const row = create('article', 'content-hub-pack')
        const name = create('strong', 'content-hub-pack-name')
        name.textContent = pack.name
        const version = create('span', 'content-hub-pack-version')
        version.textContent = 'v' + pack.version
        const description = create('p', 'content-hub-pack-meta')
        description.textContent = pack.description
        row.append(name, version, description)
        list.append(row)
      }
      card.append(list)
    }
    const stepsTitle = create('h4', 'content-hub-group-heading')
    stepsTitle.textContent = '远程市场安装契约（预留，必须 fail-closed）'
    card.append(stepsTitle)
    const steps = create('ol', 'content-hub-market-steps')
    for (const step of CONTENT_MARKET_CONTRACT_STEPS) {
      const item = create('li', 'content-hub-market-step')
      item.textContent = step
      steps.append(item)
    }
    card.append(steps)
    const note = create('p', 'content-hub-pack-note')
    note.textContent =
      '本页不会自动联网；没有市场源/未验签/哈希不符/声明不匹配的内容不会下载或合并。' +
      '远程市场 UI 只是入口，安装器与生产信任根完成前不提供在线商品。'
    card.append(note)
    if (CONTENT_USAGE_CONFIRMATION_REQUIRED) {
      const declaration = create('p', 'content-hub-declaration-ref')
      declaration.textContent = '统一用途声明：' + CONTENT_HUB_NOTICE
      card.append(declaration)
    }
    panelBody.append(card)
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

  function fileListOf(input: HTMLInputElement): { readonly files: readonly ContentHubFileLike[]; clear(): void } {
    const raw = input.files as unknown as ContentHubFileListLike | null
    const files: ContentHubFileLike[] = []
    if (raw !== null && raw !== undefined) {
      const length = typeof raw.length === 'number' ? raw.length : -1
      if (length >= 0) {
        for (let index = 0; index < length; index += 1) {
          const file = raw.item(index)
          if (file !== null && file !== undefined) files.push(file)
        }
      } else {
        const single = raw.item(0)
        if (single !== null && single !== undefined) files.push(single)
      }
    }
    return {
      files,
      clear(): void {
        try {
          input.value = ''
        } catch {
          // A read-only fake input must not break the import flow.
        }
      },
    }
  }

  async function readSingleSelection(file: ContentHubFileLike): Promise<ContentPackFileSelection | string> {
    if (/\.zip$/i.test(file.name)) {
      if (file.size > CONTENT_PACK_V2_LIMITS.maxZipBytes) {
        return '内容包 ZIP 超过上限（16 MiB），已拒绝导入。'
      }
      let bytes: ArrayBuffer
      try {
        bytes = await file.arrayBuffer()
      } catch {
        return '读取 ZIP 失败，未导入。'
      }
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) return 'ZIP 文件为空，已拒绝导入。'
      if (bytes.byteLength > CONTENT_PACK_V2_LIMITS.maxZipBytes) {
        return '内容包 ZIP 超过上限（16 MiB），已拒绝导入。'
      }
      return { kind: 'zip', name: file.name, bytes }
    }
    if (file.size > CONTENT_PACK_V2_LIMITS.maxPackJsonBytes) {
      return '内容包 JSON 超过上限（256 KiB），已拒绝导入。'
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      return '读取 JSON 失败，未导入。'
    }
    if (text.length === 0) return '内容包 JSON 为空，已拒绝导入。'
    return { kind: 'json', name: file.name, text }
  }

  async function readFolderSelection(
    files: readonly ContentHubFileLike[],
  ): Promise<ContentPackFileSelection | string> {
    if (files.length === 0) return '文件夹里没有可选文件。'
    if (files.length > CONTENT_PACK_V2_LIMITS.maxZipEntries) {
      return '文件夹文件数超过上限（256），已拒绝导入。'
    }
    const out: { path: string; bytes: ArrayBuffer }[] = []
    let total = 0
    for (const file of files) {
      if (file.size > CONTENT_PACK_V2_LIMITS.maxAssetBytes) {
        return '单个素材超过上限（8 MiB）：' + file.name
      }
      total += file.size
      if (total > CONTENT_PACK_V2_LIMITS.maxTotalUncompressedBytes) {
        return '素材总量超过上限（32 MiB），已拒绝导入。'
      }
      let bytes: ArrayBuffer
      try {
        bytes = await file.arrayBuffer()
      } catch {
        return '读取素材文件失败：' + file.name
      }
      const relative =
        typeof file.webkitRelativePath === 'string' && file.webkitRelativePath.length > 0
          ? file.webkitRelativePath
          : file.name
      const segments = relative.split('/')
      const path = segments.length > 1 ? segments.slice(1).join('/') : relative
      if (path.length === 0) return '文件夹路径为空，已拒绝导入。'
      out.push({ path, bytes })
    }
    return { kind: 'folder', name: '素材包文件夹', files: out }
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

  async function handleRefreshMarket(): Promise<void> {
    const refresh = options.refreshMarket
    if (refresh === undefined || importBusy) return
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
  })
}

// ---------------------------------------------------------------------------
// DOM file input shape (kept structural so tests inject small fakes)
// ---------------------------------------------------------------------------

interface ContentHubFileLike {
  readonly name: string
  readonly size: number
  readonly webkitRelativePath?: string
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

interface ContentHubFileListLike {
  readonly length?: number
  item(index: number): ContentHubFileLike | null
}
