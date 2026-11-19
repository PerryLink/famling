/**
 * Local content-pack storage, strict v1/v2 import preparation and the 内容包
 * tab renderer. Split out of content-hub.ts (task-96 / E10) with no behaviour
 * change; the canonical validators stay in content-library.ts / content-assets.ts.
 */
import {
  CONTENT_LIMITS,
  CONTENT_PACK_V2_LIMITS,
  PROHIBITED_USES,
  describeUsageConfirmation,
  mergeCharacterThemes,
  mergeInstalledPacks,
  validateContentPack,
  validateContentPackV2,
  validatePackZip,
  type ContentCategory,
  type ContentIssue,
  type ContentLibrary,
  type ContentPack,
  type ContentPackV2,
} from '../content-library.ts'
import {
  collectBundleAssets,
  decodeUtf8,
  readContentFolder,
  readContentZip,
  type ContentBundleAsset,
} from '../content-assets.ts'
import { readVersioned, writeVersioned, type StorageLike, type StorageWriteStatus } from '../security/safe-storage.ts'
import { utf8ByteLength } from '../security/limits.ts'
import type { HubRenderSurface } from './shared.ts'
import type {
  CharacterPackConfirmRequest,
  CharacterPackConsentInput,
  CharacterPackConsentKey,
  CharacterPackPrepared,
  CharacterPackUiRow,
  CharacterPackUiState,
} from './character-installer.ts'

/**
 * Callbacks for the experimental 角色包安装器 section (E4 / task-98). The
 * context is optional so existing render tests and hosts without the
 * IndexedDB/CharacterPackRuntime adapter keep working; when absent the tab
 * shows an honest 「安装器未注入」 note instead of pretending to import.
 */
export interface CharacterPackTabContext {
  getState(): CharacterPackUiState
  getPrepared(): CharacterPackPrepared | null
  getConsent(): CharacterPackConsentInput
  getConfirm(): CharacterPackConfirmRequest | null
  /** True while a preview/install/enable/uninstall/rollback call is in flight. */
  isBusy(): boolean
  onImport(mode: 'single' | 'folder'): void
  onToggleConsent(key: CharacterPackConsentKey, value: boolean): void
  onConfirmInstall(): void
  onCancel(): void
  onEnable(packId: string): void
  onRequestAction(kind: 'uninstall' | 'rollback', packId: string): void
  onConfirmAction(): void
  onCancelAction(): void
}

/** Host callbacks + DOM surface consumed by the 内容包 renderer. */
export interface PacksTabRenderContext extends HubRenderSurface {
  readonly getInstalledPacks: () => readonly ContentHubInstalledPack[]
  readonly getPendingImport: () => PreparedThemePackImport | null
  readonly isImportBusy: () => boolean
  readonly onImportFile: (mode: 'single' | 'folder') => void
  readonly onConfirmImport: () => void
  readonly onCancelImport: () => void
  /** Experimental character-pack installer adapter (absent = not wired). */
  readonly characterPacks?: CharacterPackTabContext
}

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

// ---------------------------------------------------------------------------
// Experimental 角色包安装器 (famling.pet-anim/0.2)
//
// The renderer is DOM-only and side-effect-free: it reads the injected
// CharacterPackTabContext, forwards intents to the host adapter (which owns the
// IndexedDB file store + CharacterPackRuntime) and renders the honest state the
// adapter reports: 「渲染器未接入 / 不可应用」 when no renderer host is injected,
// and 「已接入 / 热切换」 plus the renderer-truth row when it is (task-111).
// ---------------------------------------------------------------------------

const CHARACTER_PACK_CONSENT_ITEMS: readonly { readonly key: CharacterPackConsentKey; readonly label: string }[] =
  Object.freeze([
    { key: 'usageConfirmed', label: '我已阅读并同意统一用途声明（仅限研究与原型验证，禁止六类用途）' },
    { key: 'licenseAcknowledged', label: '我已阅读并认可该角色包的许可（SPDX / 署名）' },
    { key: 'aiDisclosureAcknowledged', label: '我已阅读该角色包的 AI 生成标识与披露' },
  ])

function prohibitedUseLabel(id: string): string {
  const label: string | undefined = PROHIBITED_USE_LABELS[id as (typeof PROHIBITED_USES)[number]]
  return label ?? id
}

/** One small action button used by the character-pack rows. */
function characterPackActionButton(
  ctx: PacksTabRenderContext,
  text: string,
  action: string,
  packId: string,
  disabled: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = ctx.create('button', 'content-hub-chip content-hub-character-action')
  button.type = 'button'
  button.textContent = text
  button.dataset.characterAction = action
  button.dataset.packId = packId
  button.disabled = disabled
  button.addEventListener('click', () => {
    if (!disabled) onClick()
  })
  return button
}

function buildCharacterPackConfirm(
  ctx: PacksTabRenderContext,
  cp: CharacterPackTabContext,
  prepared: CharacterPackPrepared,
  busy: boolean,
): HTMLElement {
  const preview = prepared.preview
  const consent = cp.getConsent()
  const section = ctx.create('section', 'content-hub-confirm content-hub-character-confirm')
  section.dataset.packId = preview.id
  const heading = ctx.create('h3', 'content-hub-confirm-title')
  heading.textContent = '安装前确认：' + preview.name
  const meta = ctx.create('p', 'content-hub-pack-meta')
  meta.textContent =
    '版本 ' +
    preview.version +
    ' · 类型 ' +
    preview.kind +
    ' · 许可 ' +
    preview.licenseSpdx +
    ' / ' +
    preview.licenseAttribution +
    ' · 文件 ' +
    preview.fileCount +
    ' 个'
  const ai = ctx.create('p', 'content-hub-pack-meta')
  ai.textContent = 'AI 标识：' + (preview.aiGenerated ? 'AI 生成' : '非 AI 生成') + ' · ' + preview.aiDisclosure
  const assurance = ctx.create('p', 'content-hub-pack-meta')
  assurance.textContent =
    '预检：pack.json 已通过 0.2 校验，压缩包/文件夹清单已逐文件比对 sha256；安装时运行时会再次完整校验并原子提交。'
  const label = ctx.create('p', 'content-hub-declaration-label')
  label.textContent = '统一用途声明（逐字校验通过，必须阅读）：'
  const statement = ctx.create('p', 'content-hub-declaration')
  statement.textContent = preview.statement
  const ref = ctx.create('p', 'content-hub-declaration-ref')
  ref.textContent = '声明文件：' + preview.statementRef
  const prohibited = ctx.create('ul', 'content-hub-prohibited')
  for (const id of preview.prohibitedUses) {
    const item = ctx.create('li', 'content-hub-prohibited-item')
    item.textContent = '禁止：' + prohibitedUseLabel(id)
    prohibited.append(item)
  }
  section.append(heading, meta, ai, assurance, label, statement, ref, prohibited)

  const consentList = ctx.create('div', 'content-hub-character-consent-list')
  for (const item of CHARACTER_PACK_CONSENT_ITEMS) {
    const row = ctx.create('label', 'content-hub-character-consent')
    const input = ctx.doc.createElement('input')
    input.type = 'checkbox'
    input.className = 'content-hub-character-consent-input'
    input.checked = consent[item.key] === true
    input.disabled = busy
    input.setAttribute('data-consent-key', item.key)
    input.addEventListener('change', () => {
      cp.onToggleConsent(item.key, input.checked)
    })
    const text = ctx.create('span', 'content-hub-character-consent-label')
    text.textContent = item.label
    row.append(input, text)
    consentList.append(row)
  }
  section.append(consentList)

  const allConfirmed =
    consent.usageConfirmed === true && consent.licenseAcknowledged === true && consent.aiDisclosureAcknowledged === true
  const state = cp.getState()
  const wired = state.rendererConnected
  const remote = state.renderer.mode === 'remote'
  const hint = ctx.create('p', 'content-hub-pack-note')
  hint.textContent = remote
    ? '必须逐项确认后才能安装。安装只写入本地文件；安装后点「启用」会保存选择并通知桌宠窗口加载 hero 帧/资产并热切换外观（失败由该窗口回退内置渲染器）。'
    : wired
      ? '必须逐项确认后才能安装。安装只写入本地文件；安装后点「启用」才会加载 hero 帧/资产并热切换桌宠外观，失败会自动回退内置渲染器。'
      : '必须逐项确认后才能安装。安装/启用只会登记角色包：渲染器未接入时不会改变桌宠外观（不可应用）。'
  const actions = ctx.create('div', 'content-hub-actions')
  const confirm = ctx.create('button', 'content-hub-confirm-ok content-hub-character-install')
  confirm.type = 'button'
  confirm.textContent = wired ? '安装角色包（本地，可随后启用）' : '安装并登记（不可应用）'
  confirm.disabled = busy || !allConfirmed
  confirm.addEventListener('click', () => {
    if (!busy && allConfirmed) cp.onConfirmInstall()
  })
  const cancel = ctx.create('button', 'content-hub-confirm-cancel content-hub-character-cancel')
  cancel.type = 'button'
  cancel.textContent = '取消'
  cancel.disabled = busy
  cancel.addEventListener('click', () => {
    if (!busy) cp.onCancel()
  })
  actions.append(confirm, cancel)
  section.append(hint, actions)
  return section
}

function buildCharacterPackRow(
  ctx: PacksTabRenderContext,
  cp: CharacterPackTabContext,
  row: CharacterPackUiRow,
  state: CharacterPackUiState,
  confirm: CharacterPackConfirmRequest | null,
  busy: boolean,
): HTMLElement {
  const article = ctx.create('article', 'content-hub-pack content-hub-character-pack')
  article.dataset.packId = row.packId
  const head = ctx.create('div', 'content-hub-pack-head')
  const name = ctx.create('strong', 'content-hub-pack-name')
  name.textContent = row.name
  const version = ctx.create('span', 'content-hub-pack-version')
  version.textContent = 'v' + row.version
  const kind = ctx.create('span', 'content-hub-badge')
  kind.textContent = row.source === 'builtin' ? '内置登记占位' : '第三方角色包 0.2'
  head.append(name, version, kind)
  const wired = state.rendererConnected
  const remote = state.renderer.mode === 'remote'
  const rendered = state.renderer.rendered
  const renderedThisRow = rendered !== null && rendered.packId === row.packId
  if (row.active) {
    const active = ctx.create('span', 'content-hub-badge content-hub-character-active')
    active.textContent = renderedThisRow ? '已应用（渲染中）' : wired ? '已启用（等待应用）' : '已启用（未应用）'
    head.append(active)
  }
  article.append(head)
  const meta = ctx.create('p', 'content-hub-pack-meta')
  meta.textContent =
    '角色 ' +
    row.characterId +
    ' · 类型 ' +
    row.kind +
    (row.previousVersion !== undefined ? ' · 可回滚到 v' + row.previousVersion : '') +
    (row.source === 'builtin' ? ' · 内置回退目标' : '')
  article.append(meta)
  const note = ctx.create('p', 'content-hub-pack-note')
  if (row.source === 'builtin') {
    note.textContent = wired
      ? '内置回退目标：卸载当前角色包或应用失败时，桌宠外观会切回当前内置渲染器（不依赖本安装器）。'
      : '内置登记占位：只作为卸载第三方角色包后的回退目标；当前桌宠渲染器不由本安装器控制，也不会被应用。'
  } else if (renderedThisRow) {
    note.textContent = '已应用：hero 渲染器正在绘制该角色包的帧/资产；下次启动会自动恢复（失败则回退内置）。'
  } else if (row.active) {
    note.textContent = remote
      ? state.renderer.saved !== null && state.renderer.saved.packId === row.packId
        ? '已启用：外观由桌宠窗口加载 hero 帧/资产并热切换（本窗口不绘制 hero）。'
        : '已启用但桌宠窗口当前没有保存该外观（可能已回退内置）；可再次启用。'
      : wired
        ? '已启用但当前未渲染：hero 渲染器未运行或应用失败，桌宠外观仍是内置渲染器；可再次启用重试。'
        : '已启用（仅登记）：渲染器未接入，桌宠外观未改变，当前不可应用。'
  } else {
    note.textContent = remote
      ? '已安装：点「启用」会保存选择并通知桌宠窗口热切换外观。'
      : wired
        ? '已安装：点「启用」会加载 hero 帧/资产并热切换桌宠外观（无需刷新页面）。'
        : '已安装（仅登记）：可启用登记，但渲染器未接入前不会应用到桌宠外观。'
  }
  article.append(note)

  const actions = ctx.create('div', 'content-hub-actions')
  if (row.source === 'builtin') {
    if (state.activePackId !== null && state.activePackId !== row.packId) {
      actions.append(
        characterPackActionButton(ctx, remote ? '切回内置（通知桌宠窗口）' : wired ? '切回内置渲染器' : '切回内置（仅登记）', 'enable-builtin', row.packId, busy, () => {
          cp.onEnable(row.packId)
        }),
      )
    }
  } else {
    if (!renderedThisRow) {
      actions.append(
        characterPackActionButton(ctx, remote ? '启用（桌宠窗口热切换）' : wired ? '启用（热切换外观）' : '启用（仅登记）', 'enable', row.packId, busy, () => {
          cp.onEnable(row.packId)
        }),
      )
    }
    if (row.previousVersion !== undefined) {
      actions.append(
        characterPackActionButton(ctx, '回滚到 v' + row.previousVersion, 'rollback', row.packId, busy, () => {
          cp.onRequestAction('rollback', row.packId)
        }),
      )
    }
    actions.append(
      characterPackActionButton(ctx, '卸载', 'uninstall', row.packId, busy, () => {
        cp.onRequestAction('uninstall', row.packId)
      }),
    )
  }
  if (actions.children.length > 0) article.append(actions)

  if (confirm !== null && confirm.packId === row.packId) {
    const confirmation = ctx.create('div', 'content-hub-actions content-hub-character-confirm-action')
    const question = ctx.create('span', 'content-hub-pack-note')
    question.textContent =
      confirm.kind === 'uninstall'
        ? '确认卸载「' + row.name + '」？本地安装文件会被清理（可重新安装）。'
        : '确认回滚「' + row.name + '」到 v' + (row.previousVersion ?? '?') + '？当前版本目录会被清理。'
    const ok = ctx.create('button', 'content-hub-confirm-ok content-hub-character-confirm-ok')
    ok.type = 'button'
    ok.textContent = confirm.kind === 'uninstall' ? '确认卸载' : '确认回滚'
    ok.disabled = busy
    ok.addEventListener('click', () => {
      if (!busy) cp.onConfirmAction()
    })
    const cancel = ctx.create('button', 'content-hub-confirm-cancel content-hub-character-confirm-cancel')
    cancel.type = 'button'
    cancel.textContent = '取消'
    cancel.disabled = busy
    cancel.addEventListener('click', () => {
      if (!busy) cp.onCancelAction()
    })
    confirmation.append(question, ok, cancel)
    article.append(confirmation)
  }
  return article
}

/** Render the experimental 角色包安装器 section into the 内容包 tab. */
function appendCharacterPackSection(ctx: PacksTabRenderContext): void {
  const cp = ctx.characterPacks
  const heading = ctx.create('h3', 'content-hub-group-title')
  heading.textContent = '角色包安装器（实验）'
  ctx.panelBody.append(heading)
  if (cp === undefined) {
    const note = ctx.create('p', 'content-hub-pack-note content-hub-character-note')
    note.dataset.renderer = 'unwired'
    note.textContent = '角色包安装器未注入：宿主未提供 IndexedDB / CharacterPackRuntime 适配器，角色包导入不可用（不影响下面的内容主题包）。'
    ctx.panelBody.append(note)
    return
  }
  const state = cp.getState()
  const note = ctx.create('p', 'content-hub-pack-note content-hub-character-note')
  note.dataset.renderer = state.rendererConnected ? 'connected' : 'unwired'
  note.textContent = state.note
  ctx.panelBody.append(note)
  if (state.rendererConnected) {
    const remote = state.renderer.mode === 'remote'
    const rendered = ctx.create('p', 'content-hub-pack-note content-hub-character-rendered')
    rendered.dataset.rendererMode = state.renderer.mode
    rendered.dataset.renderedPack = state.renderer.rendered?.packId ?? 'builtin'
    rendered.textContent = remote
      ? '渲染器事实：本窗口不绘制 hero；桌宠外观由桌宠窗口加载角色包帧/资产并热切换。'
      : state.renderer.rendered !== null
        ? '渲染器事实：当前正在绘制「' + state.renderer.rendered.name + '」v' + state.renderer.rendered.version + '。'
        : '渲染器事实：当前正在绘制内置渲染器。'
    ctx.panelBody.append(rendered)
    if (remote) {
      const saved = ctx.create('p', 'content-hub-pack-note content-hub-character-saved')
      saved.textContent =
        state.renderer.saved !== null
          ? '已保存外观：「' + state.renderer.saved.name + '」v' + state.renderer.saved.version + '（由桌宠窗口应用；应用失败时该窗口回退内置）。'
          : '当前没有保存的角色包外观：桌宠窗口显示内置渲染器。'
      ctx.panelBody.append(saved)
    }
    if (state.renderer.fallbackReason !== null) {
      const fallback = ctx.create('p', 'content-hub-pack-note content-hub-character-fallback')
      fallback.textContent = '上次应用失败，已回退内置渲染器：' + state.renderer.fallbackReason
      ctx.panelBody.append(fallback)
    }
    if (state.restorePending) {
      const pending = ctx.create('p', 'content-hub-pack-note content-hub-character-restore-pending')
      pending.textContent = '已保存上次启用的角色包外观，将在 hero 渲染器就绪后自动恢复。'
      ctx.panelBody.append(pending)
    }
  }
  if (!state.available) {
    const unavailable = ctx.create('p', 'content-hub-empty content-hub-character-unavailable')
    unavailable.textContent = '角色包安装器不可用：' + (state.unavailableReason ?? '宿主初始化失败') + '。'
    ctx.panelBody.append(unavailable)
    return
  }
  const busy = cp.isBusy() || state.operation !== 'idle'

  const pickerRow = ctx.create('div', 'content-hub-actions')
  const zipButton = ctx.create('button', 'content-hub-import content-hub-character-import')
  zipButton.type = 'button'
  zipButton.textContent = '导入角色包（.zip）…'
  zipButton.disabled = busy
  const zipInput = ctx.doc.createElement('input')
  zipInput.type = 'file'
  zipInput.accept = '.zip,application/zip'
  zipInput.className = 'content-hub-file-input content-hub-character-file-input'
  zipInput.hidden = true
  zipInput.setAttribute('aria-hidden', 'true')
  zipInput.tabIndex = -1
  zipButton.addEventListener('click', () => {
    if (!busy) zipInput.click()
  })
  zipInput.addEventListener('change', () => {
    cp.onImport('single')
  })
  const folderButton = ctx.create('button', 'content-hub-import content-hub-character-import')
  folderButton.type = 'button'
  folderButton.textContent = '导入角色包文件夹…'
  folderButton.disabled = busy
  const folderInput = ctx.doc.createElement('input')
  folderInput.type = 'file'
  folderInput.className = 'content-hub-file-input content-hub-character-file-input'
  folderInput.hidden = true
  folderInput.setAttribute('webkitdirectory', '')
  folderInput.setAttribute('directory', '')
  folderInput.setAttribute('aria-hidden', 'true')
  folderInput.tabIndex = -1
  folderButton.addEventListener('click', () => {
    if (!busy) folderInput.click()
  })
  folderInput.addEventListener('change', () => {
    cp.onImport('folder')
  })
  pickerRow.append(zipButton, folderButton, zipInput, folderInput)
  ctx.panelBody.append(pickerRow)
  const rules = ctx.create('p', 'content-hub-blurb')
  rules.textContent =
    '只接受本地 famling.pet-anim/0.2 角色包：根目录 pack.json + assets/（ZIP 或文件夹）。ZIP/文件夹会逐文件校验 sha256 与清单；缺统一声明、缺许可/AI 标识或未验签的远程包一律拒绝。安装与启用只登记，渲染器未接入时不会改变桌宠外观。'
  ctx.panelBody.append(rules)
  if (busy) {
    const working = ctx.create('p', 'content-hub-pack-note content-hub-character-busy')
    working.textContent = '正在执行角色包操作（' + state.operation + '）…'
    ctx.panelBody.append(working)
  }
  const prepared = cp.getPrepared()
  if (prepared !== null) ctx.panelBody.append(buildCharacterPackConfirm(ctx, cp, prepared, busy))

  const listHeading = ctx.create('h3', 'content-hub-group-title')
  listHeading.textContent = '已登记角色包'
  ctx.panelBody.append(listHeading)
  if (state.rows.length === 0) {
    ctx.appendEmpty('尚未登记任何角色包。')
    return
  }
  const confirm = cp.getConfirm()
  const list = ctx.create('div', 'content-hub-pack-list content-hub-character-list')
  for (const row of state.rows) list.append(buildCharacterPackRow(ctx, cp, row, state, confirm, busy))
  ctx.panelBody.append(list)
}

/** Render the 内容包 tab (import pickers, pending declaration, installed list). */
export function renderPacksTab(ctx: PacksTabRenderContext): void {
  const { panelBody, create, appendEmpty, getInstalledPacks, getPendingImport, isImportBusy, onImportFile, onConfirmImport, onCancelImport } = ctx
  const doc = ctx.doc

  // --- 角色包安装器（实验，角色包运行时接线） ------------------------------
  appendCharacterPackSection(ctx)

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
      onConfirmImport()
    })
    const cancel = create('button', 'content-hub-confirm-cancel')
    cancel.type = 'button'
    cancel.textContent = '取消'
    cancel.addEventListener('click', () => {
      onCancelImport()
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
    const jsonInput = doc.createElement('input')
    jsonInput.type = 'file'
    jsonInput.accept = '.json,.zip,application/json,application/zip'
    jsonInput.className = 'content-hub-file-input'
    jsonInput.hidden = true
    jsonInput.setAttribute('aria-hidden', 'true')
    jsonInput.tabIndex = -1
    jsonButton.addEventListener('click', () => {
      if (!isImportBusy()) jsonInput.click()
    })
    jsonInput.addEventListener('change', () => {
      void onImportFile('single')
    })
    const folderButton = create('button', 'content-hub-import')
    folderButton.type = 'button'
    folderButton.textContent = '导入素材包文件夹…'
    const folderInput = doc.createElement('input')
    folderInput.type = 'file'
    folderInput.className = 'content-hub-file-input'
    folderInput.hidden = true
    folderInput.setAttribute('webkitdirectory', '')
    folderInput.setAttribute('directory', '')
    folderInput.setAttribute('aria-hidden', 'true')
    folderInput.tabIndex = -1
    folderButton.addEventListener('click', () => {
      if (!isImportBusy()) folderInput.click()
    })
    folderInput.addEventListener('change', () => {
      void onImportFile('folder')
    })
    pickerRow.append(jsonButton, folderButton, jsonInput, folderInput)
    panelBody.append(pickerRow)
    const rules = create('p', 'content-hub-blurb')
    rules.textContent =
      '只接受本地 famling.content-pack/0.2：pack.json + assets/；ZIP / 文件夹会解包并逐文件校验 sha256；' +
      '缺统一声明、声明不符、含不安全路径或未验签的远程包一律拒绝。导入后在「角色」里应用。'
    panelBody.append(rules)

    const pendingImport = getPendingImport()
    if (pendingImport !== null) {
      panelBody.append(buildDeclarationConfirmation(pendingImport))
    }

    const heading = create('h3', 'content-hub-group-title')
    heading.textContent = '已安装内容包'
    panelBody.append(heading)
    const installed = getInstalledPacks()
    if (installed.length === 0) {
      appendEmpty('尚未安装内容包。')
      return
    }
    const list = create('div', 'content-hub-pack-list')
    for (const pack of installed) list.append(buildInstalledPackRow(pack))
    panelBody.append(list)
  }

  renderPacks()
}

export function fileListOf(input: HTMLInputElement): { readonly files: readonly ContentHubFileLike[]; clear(): void } {
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

export async function readSingleSelection(file: ContentHubFileLike): Promise<ContentPackFileSelection | string> {
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

export async function readFolderSelection(
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

// ---------------------------------------------------------------------------
// DOM file input shape (kept structural so tests inject small fakes)
// ---------------------------------------------------------------------------

export interface ContentHubFileLike {
  readonly name: string
  readonly size: number
  readonly webkitRelativePath?: string
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface ContentHubFileListLike {
  readonly length?: number
  item(index: number): ContentHubFileLike | null
}
