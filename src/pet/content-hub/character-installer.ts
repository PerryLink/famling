/**
 * Browser-side installer adapter for `famling.pet-anim/0.2` character packs
 * (E4 role-pack UI, task-98).
 *
 * What this module does:
 * - injects the `CharacterPackRuntimeHost` the runtime (src/pet/character-packs.ts)
 *   deliberately does not implement: an IndexedDB (memory-fallback) file store,
 *   bounded zip reading, installed-pointer discovery and installed pack loading;
 * - performs a read-only PREVIEW of a selected .zip/folder so the content-hub UI
 *   can show the pack name/version/licence/AI provenance + the canonical usage
 *   declaration BEFORE asking for the triple install consent;
 * - exposes install / enable / uninstall / rollback actions for the 内容包 tab.
 *
 * What this module deliberately does NOT do (honest limits):
 * - it does NOT touch the canvas/DOM or import the hero runtime: hero rendering
 *   is injected as a `CharacterPackRenderHost` (main.ts owns the canvas and the
 *   hot-swap scene). When no host is injected (Node tests/embeds), it stays a
 *   registration-only installer: `state().rendererConnected` is false and every
 *   UI message says the character is registered-only / not applicable.
 * - there is no network access: only local bytes selected by the user enter the
 *   installer, and remote/unverified packs are refused before any write;
 * - when a renderer host IS injected, the active pack id is persisted through
 *   the injected Web Storage (a versioned envelope) and restored by the host
 *   after the hero renderer is ready; a failed restore/apply clears the key and
 *   falls back to the built-in renderer through the injected `restoreBuiltin`
 *   callback. No provider is invented: a pack that cannot be rendered is never
 *   reported as applied.
 */
import {
  crc32,
  decodeUtf8,
  readContentFolder,
  readContentZip,
  sha256Hex,
  type ContentBundle,
  type ContentBundleReadResult,
} from '../content-assets.ts'
import {
  CHARACTER_PACK_KINDS,
  CHARACTER_PACK_MANIFEST_FILE,
  CONTENT_PACK_V2_LIMITS,
  characterPackFramePaths,
  describeUsageConfirmation,
  validateCharacterPackV2,
  validateCharacterPackZip,
  type CharacterPackKind,
  type CharacterPackV2,
  type ContentIssue,
} from '../content-library.ts'
import {
  CharacterPackRendererAdapter,
  type CharacterPackRenderHost,
  type CharacterPackRendererEvent,
} from '../character-pack-renderer.ts'
import { resolveStorage, safeGetItem, safeRemoveItem, safeSetItem, type StorageLike } from '../security/safe-storage.ts'
import {
  CHARACTER_PACK_POINTER_SCHEMA,
  CharacterPackRuntime,
  defineBuiltinCharacter,
  type CharacterPackActiveCharacter,
  type CharacterPackBuiltin,
  type CharacterPackInstalledState,
  type CharacterPackRuntimeErrorCode,
  type CharacterPackRuntimeEvent,
  type CharacterPackRuntimeFailure,
  type CharacterPackRuntimeHost,
  type CharacterPackRuntimeOperation,
} from '../character-packs.ts'
import type { HeroRegionConfig } from '../anim/regions.ts'
import type { BehaviorProfile } from '../character/types.ts'
import { openCharacterPackFileStore, type CharacterPackFileStore } from './character-store.ts'

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/**
 * Stable fallback registry id for the currently running renderer. It is a
 * REGISTRATION placeholder (the renderer is not wired): it exists so the
 * runtime can fall back after uninstalling the enabled pack instead of leaving
 * a removed-but-active character behind. The UI labels it accordingly.
 */
export const CHARACTER_PACK_FALLBACK_ID = 'famling.builtin-renderer'

/** Visible honest label for every surface that renders the installer. */
export const CHARACTER_PACK_RENDERER_NOTE =
  '渲染器未接入：本安装器只登记角色包，不会把角色应用到桌宠外观；「启用」状态仅本次运行有效，当前不可应用（不会改变 hero 渲染）。'

/** Appended to every successful action while no renderer adapter is injected. */
export const CHARACTER_PACK_UNWIRED_SUFFIX = '；渲染器未接入：仅登记，桌宠外观未改变（不可应用）。'

/** Honest note when a renderer host is injected but the hero scene is not running. */
export const CHARACTER_PACK_RENDERER_NOT_READY_NOTE =
  '角色包渲染器已接入，但 hero 渲染器当前没有运行（折叠纸模式或被关闭）：角色包可以登记，启用不会改变外观；开启 hero 渲染后再启用即可热切换。'

/** Honest note when the independent content window delegates rendering to the pet page. */
export const CHARACTER_PACK_RENDERER_REMOTE_NOTE =
  '角色包渲染器已接入：本窗口只负责安装与登记，桌宠外观由桌宠窗口加载 hero 帧/资产并热切换（失败自动回退内置渲染器）。'

/** Honest note when the injected renderer host is ready for a real hot switch. */
export const CHARACTER_PACK_RENDERER_READY_NOTE =
  '角色包渲染器已接入：启用已安装角色包会真正加载 hero 帧/资产并热切换桌宠外观（不刷新页面）；帧/资产加载或首帧失败会自动回退内置渲染器，且不会记为已应用。'

/** Storage key for the persisted active character pack (versioned envelope). */
export const CHARACTER_PACK_ACTIVE_STORAGE_KEY = 'desktop-games/pet/character-packs/active'
/** Envelope version of `CHARACTER_PACK_ACTIVE_STORAGE_KEY`. */
export const CHARACTER_PACK_ACTIVE_STORAGE_VERSION = 1
/** Upper bound of one persisted active-pack value (bytes); larger values are ignored. */
export const CHARACTER_PACK_ACTIVE_STORAGE_MAX_BYTES = 512

/** Result of the injected built-in-restore callback (main.ts hot-restores hero). */
export interface CharacterPackBuiltinRestoreResult {
  readonly ok: boolean
  readonly message: string
}

/**
 * Production renderer wiring injected by `main.ts` (through `content-runtime.ts`).
 * When present, `enable()` applies the active handles through
 * `CharacterPackRendererAdapter` and the persisted active pack is restored after
 * the hero renderer is ready. Absent = registration-only installer (honest UI).
 */
export interface CharacterPackRendererWiring {
  /** Renderer boundary the adapter owns (main.ts owns the canvas/DOM side). */
  readonly host: CharacterPackRenderHost
  /** Absolute page base for root-relative hints (`location.href` in main.ts). */
  readonly resolveBase?: string
  /** True when the hero scene can accept a hot swap right now. */
  readonly isReady?: () => boolean
  /**
   * False when this window does NOT own the hero scene (the independent content
   * window, MB-062): enabling persists the choice and asks the pet window to
   * apply it through `requestRemoteApply` instead of pretending to render it.
   */
  readonly localRenderer?: boolean
  /** Ask the window that owns the hero scene to apply the persisted appearance. */
  readonly requestRemoteApply?: () => void
  /** Restore the shipped built-in renderer (called on failure/uninstall). */
  readonly restoreBuiltin: () => Promise<CharacterPackBuiltinRestoreResult> | CharacterPackBuiltinRestoreResult
  /** Web Storage override (tests); default = safe global localStorage. */
  readonly storage?: StorageLike | null
  /** Storage key override (tests); default = CHARACTER_PACK_ACTIVE_STORAGE_KEY. */
  readonly storageKey?: string
  /** Renderer-adapter observability sink (no bytes/URLs are exposed). */
  readonly onRendererEvent?: (event: CharacterPackRendererEvent) => void
}

/** What is actually rendered right now (renderer truth, not registry truth). */
export interface CharacterPackRendererState {
  /** 'none' = no host; 'local' = this window draws hero; 'remote' = pet window draws. */
  readonly mode: 'local' | 'remote' | 'none'
  /** True when a renderer host is wired into this installer. */
  readonly connected: boolean
  /** True when the wired host reports the hero scene ready for a hot switch. */
  readonly ready: boolean
  /** The pack currently rendered by the hero scene (null = built-in / remote). */
  readonly rendered: { readonly packId: string; readonly version: string; readonly name: string } | null
  /** The persisted appearance the next boot/pet window should apply (may be stale). */
  readonly saved: { readonly packId: string; readonly version: string; readonly name: string } | null
  /** Why the last apply/restore fell back to the built-in renderer, if it did. */
  readonly fallbackReason: string | null
}

interface PersistedActivePack {
  readonly packId: string
  readonly version: string
  readonly characterId: string
  readonly savedAt: number
}

/** One user-selected local import input (structural copy of packs.ts selection). */
export interface CharacterPackImportSelection {
  readonly kind: 'json' | 'zip' | 'folder'
  readonly name: string
  readonly text?: string
  readonly bytes?: ArrayBuffer
  readonly files?: readonly { readonly path: string; readonly bytes: ArrayBuffer }[]
}

/** UI row derived from `CharacterPackRuntime.registry()` (no handles leaked). */
export interface CharacterPackUiRow {
  readonly packId: string
  readonly characterId: string
  readonly name: string
  readonly version: string
  readonly kind: CharacterPackKind
  readonly source: 'builtin' | 'installed'
  readonly active: boolean
  readonly previousVersion?: string
}

/** Synchronous snapshot consumed by the 内容包 tab renderer. */
export interface CharacterPackUiState {
  readonly available: boolean
  readonly unavailableReason: string | null
  readonly operation: CharacterPackRuntimeOperation
  readonly activePackId: string | null
  readonly rows: readonly CharacterPackUiRow[]
  readonly installedCount: number
  /** True when a renderer host is injected (production) and can hot-switch. */
  readonly rendererConnected: boolean
  /** Renderer truth: what the hero scene is actually showing right now. */
  readonly renderer: CharacterPackRendererState
  /** True while a persisted active pack is waiting for the hero renderer. */
  readonly restorePending: boolean
  /** Always-visible honest statement about what enable/apply really does. */
  readonly note: string
}

/** Manifest metadata shown before collecting the triple consent. */
export interface CharacterPackPreview {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly kind: CharacterPackKind
  readonly licenseSpdx: string
  readonly licenseAttribution: string
  readonly aiGenerated: boolean
  readonly aiDisclosure: string
  readonly source: 'local'
  readonly fileCount: number
  readonly previewPath: string | null
  readonly statement: string
  readonly statementRef: string
  readonly prohibitedUses: readonly string[]
}

/** Opaque handle for one previewed bundle; install() must use the same token. */
export interface CharacterPackPrepared {
  readonly token: string
  readonly preview: CharacterPackPreview
}

export interface CharacterPackConsentInput {
  readonly usageConfirmed: boolean
  readonly licenseAcknowledged: boolean
  readonly aiDisclosureAcknowledged: boolean
}

/** Keys of the triple install consent (UI checkbox rows). */
export type CharacterPackConsentKey = keyof CharacterPackConsentInput

/** Pending destructive action awaiting a second explicit click. */
export interface CharacterPackConfirmRequest {
  readonly kind: 'uninstall' | 'rollback'
  readonly packId: string
}

export type CharacterPackPreviewResult =
  | { readonly ok: true; readonly prepared: CharacterPackPrepared }
  | { readonly ok: false; readonly message: string; readonly issues?: readonly ContentIssue[] }

export type CharacterPackActionOutcome =
  | { readonly ok: true; readonly message: string }
  | { readonly ok: false; readonly message: string; readonly issues?: readonly ContentIssue[] }

/**
 * Injected UI adapter. `main.ts` creates it once and passes it into
 * `initContentHub({ characterPacks })`; the 内容包 tab only talks to this
 * interface (it never imports the runtime module directly).
 */
export interface CharacterPackHubAdapter {
  state(): CharacterPackUiState
  preview(selection: CharacterPackImportSelection): Promise<CharacterPackPreviewResult>
  install(prepared: CharacterPackPrepared, consent: CharacterPackConsentInput): Promise<CharacterPackActionOutcome>
  /** Drop a previewed bundle that the user cancelled (frees its bytes). */
  cancelPrepared(prepared: CharacterPackPrepared): void
  enable(packId: string): Promise<CharacterPackActionOutcome>
  uninstall(packId: string): Promise<CharacterPackActionOutcome>
  rollback(packId: string): Promise<CharacterPackActionOutcome>
  /**
   * Restore the persisted active pack. Called by the host once the hero renderer
   * is ready (a boot-time restore of the last applied pack). Idempotent: it is a
   * neutral success when nothing was persisted or the pack is already rendered.
   */
  restoreActive(): Promise<CharacterPackActionOutcome>
  /**
   * Pet-window side of the cross-window bridge: refresh the installed registry,
   * then apply the persisted appearance (or restore built-in when none is saved).
   * Called when the independent content window installs/enables/uninstalls a pack.
   */
  syncActive(): Promise<CharacterPackActionOutcome>
}

/** Options for `createCharacterPackInstaller()`; all effects are injected. */
export interface CharacterPackInstallerOptions {
  /** Store override (tests); otherwise IndexedDB with memory fallback. */
  readonly store?: CharacterPackFileStore
  /** Injected IDBFactory (tests use fake-indexeddb). */
  readonly factory?: IDBFactory | null
  readonly dbName?: string
  /** Kind of the currently running built-in pet (fallback registration). */
  readonly kind?: CharacterPackKind
  readonly fallbackName?: string
  /** Clock override for deterministic pointer timestamps (tests). */
  readonly now?: () => number
  /**
   * Production renderer wiring (task-111): injected by main.ts through
   * content-runtime.ts. When present, enable/restore apply the active handles
   * through `CharacterPackRendererAdapter` and persist the active pack.
   */
  readonly renderer?: CharacterPackRendererWiring
  /**
   * Legacy one-shot applier (tests/embeds): used only when `renderer` is absent.
   * When provided, `state().rendererConnected` becomes true for that adapter.
   */
  readonly applyCharacter?: (active: CharacterPackActiveCharacter) => Promise<CharacterPackActionOutcome> | CharacterPackActionOutcome
}

// ---------------------------------------------------------------------------
// Fallback built-in registration (NOT rendered; see the doc comment above)
// ---------------------------------------------------------------------------

const FALLBACK_BEHAVIOR = Object.freeze({
  profile: 'famling.behavior/0.1',
  version: '0.1.0',
  defaults: { priority: 10, interrupt: 'at-end', cooldownMs: 0 },
  abilities: {
    speech: 'none',
    reminder: false,
    care: { feed: false, play: false, sleep: false },
    needs: false,
    death: false,
    multiObject: true,
  },
  states: { idle: { tag: 'idle', loop: true, priority: 0 } },
  rules: [],
  ambient: { intervalMs: [4000, 9000], choices: [{ state: 'idle', weight: 1 }] },
})

const FALLBACK_REGIONS = Object.freeze({
  version: 1,
  canvas: [96, 96],
  regions: [{ id: 'body', label: 'Body', rect: [0, 0, 96, 96], priority: 10 }],
  gestures: [],
})

function buildFallbackBuiltin(kind: CharacterPackKind, name: string | undefined): CharacterPackBuiltin {
  return defineBuiltinCharacter({
    packId: CHARACTER_PACK_FALLBACK_ID,
    version: '0.1.0',
    characterId: CHARACTER_PACK_FALLBACK_ID,
    name: name ?? '内置桌宠（当前渲染器 · 登记占位）',
    kind,
    art: {
      canvas: [96, 96],
      anchor: { x: 48, y: 96, mode: 'foot-center' },
      footBox: { x: -36, y: -18, w: 72, h: 18 },
      palette: 'builtin-renderer@0.1',
    },
    behavior: FALLBACK_BEHAVIOR as unknown as BehaviorProfile,
    regions: FALLBACK_REGIONS as unknown as HeroRegionConfig,
  })
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/

function isCharacterPackKind(value: unknown): value is CharacterPackKind {
  return typeof value === 'string' && (CHARACTER_PACK_KINDS as readonly string[]).includes(value)
}

const CONSENT_COMPLETE = Object.freeze({
  usageConfirmed: true as const,
  licenseAcknowledged: true as const,
  aiDisclosureAcknowledged: true as const,
})

function consentIsComplete(consent: CharacterPackConsentInput): boolean {
  return consent.usageConfirmed === true && consent.licenseAcknowledged === true && consent.aiDisclosureAcknowledged === true
}

// ---------------------------------------------------------------------------
// Bounded stored-only zip writer for folder imports
// ---------------------------------------------------------------------------

interface ZipInputFile {
  readonly path: string
  readonly bytes: Uint8Array
}

type ZipBuildResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly message: string }

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  let length = 0
  for (const chunk of chunks) length += chunk.byteLength
  const out = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

/**
 * Pack a user-selected folder into a deterministic STORED zip in memory so the
 * unchanged runtime (which installs from zip bytes) can validate/install it.
 * Entry order is path-sorted, timestamps are fixed and compression is `store`,
 * so the same folder always produces the same bytes/hash. Input paths/sizes
 * have already been bounded by readContentFolder(); this writer only refuses to
 * exceed the zip size cap.
 */
function buildStoredZip(files: readonly ZipInputFile[]): ZipBuildResult {
  const sorted = [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
  if (sorted.length === 0) return { ok: false, message: '文件夹里没有可打包的角色包文件。' }
  if (sorted.length > CONTENT_PACK_V2_LIMITS.maxZipEntries) {
    return { ok: false, message: '文件夹文件数超过 zip 条目上限。' }
  }
  const encoder = new TextEncoder()
  let estimate = 0
  const names: Uint8Array[] = []
  for (const file of sorted) {
    const name = encoder.encode(file.path)
    names.push(name)
    estimate += 30 + 46 + name.byteLength * 2 + file.bytes.byteLength
  }
  if (estimate > CONTENT_PACK_V2_LIMITS.maxZipBytes) {
    return {
      ok: false,
      message: '文件夹打包后超过 ZIP 上限（' + CONTENT_PACK_V2_LIMITS.maxZipBytes + ' 字节），请压缩为 .zip 后再导入。',
    }
  }
  const localChunks: Uint8Array[] = []
  const centralChunks: Uint8Array[] = []
  const offsets: number[] = []
  let offset = 0
  const FIXED_TIME = 0
  const FIXED_DATE = 0x21 // 1980-01-01
  const FLAG_UTF8 = 0x0800
  for (let index = 0; index < sorted.length; index += 1) {
    const file = sorted[index]
    const name = names[index]
    if (file === undefined || name === undefined) continue
    const checksum = crc32(file.bytes)
    const local = new Uint8Array(30 + name.byteLength)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true) // version needed
    localView.setUint16(6, FLAG_UTF8, true)
    localView.setUint16(8, 0, true) // method: stored
    localView.setUint16(10, FIXED_TIME, true)
    localView.setUint16(12, FIXED_DATE, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, file.bytes.byteLength, true)
    localView.setUint32(22, file.bytes.byteLength, true)
    localView.setUint16(26, name.byteLength, true)
    localView.setUint16(28, 0, true)
    local.set(name, 30)
    offsets.push(offset)
    localChunks.push(local, file.bytes)
    offset += local.byteLength + file.bytes.byteLength
  }
  let centralSize = 0
  for (let index = 0; index < sorted.length; index += 1) {
    const file = sorted[index]
    const name = names[index]
    const localOffset = offsets[index]
    if (file === undefined || name === undefined || localOffset === undefined) continue
    const central = new Uint8Array(46 + name.byteLength)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true) // version made by
    centralView.setUint16(6, 20, true) // version needed
    centralView.setUint16(8, FLAG_UTF8, true)
    centralView.setUint16(10, 0, true) // method: stored
    centralView.setUint16(12, FIXED_TIME, true)
    centralView.setUint16(14, FIXED_DATE, true)
    centralView.setUint32(16, crc32(file.bytes), true)
    centralView.setUint32(20, file.bytes.byteLength, true)
    centralView.setUint32(24, file.bytes.byteLength, true)
    centralView.setUint16(28, name.byteLength, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, localOffset, true)
    central.set(name, 46)
    centralChunks.push(central)
    centralSize += central.byteLength
  }
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, sorted.length, true)
  endView.setUint16(10, sorted.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  const bytes = concatChunks([...localChunks, ...centralChunks, end])
  if (bytes.byteLength > CONTENT_PACK_V2_LIMITS.maxZipBytes) {
    return { ok: false, message: '文件夹打包后超过 ZIP 上限，请压缩为 .zip 后再导入。' }
  }
  return { ok: true, bytes }
}

// ---------------------------------------------------------------------------
// Preview / failure messages
// ---------------------------------------------------------------------------

function describeIssues(issues: readonly ContentIssue[]): string {
  const codes = new Set(issues.map((item) => item.code))
  if (codes.has('unsafe-zip-entry')) return '角色包 ZIP / 文件夹包含不安全路径（.. / 绝对路径 / 反斜杠 / 控制字符），已拒绝。'
  if (codes.has('zip-too-large')) return '角色包超过大小/条目/压缩比上限，已拒绝。'
  if (codes.has('forbidden-asset-type')) return '角色包只能包含动画规范允许的素材类型，已拒绝。'
  if (codes.has('hash-mismatch') || codes.has('file-size-mismatch') || codes.has('missing-file') || codes.has('unlisted-file')) {
    return '角色包素材清单与压缩包内容不一致（缺失/多余/大小或 sha256 不符），已拒绝。'
  }
  return '角色包 ZIP / 文件夹校验失败，已拒绝。'
}

function describePackFailure(issues: readonly ContentIssue[]): string {
  const codes = new Set(issues.map((item) => item.code))
  if (codes.has('missing-usage-declaration')) return '角色包缺少统一用途声明（researchOnly + canonical 短句 + 禁止用途），已拒绝。'
  if (codes.has('usage-statement-mismatch')) return '角色包的用途声明与项目统一声明不一致，已拒绝。'
  if (codes.has('missing-prohibited-use') || codes.has('invalid-prohibited-use')) return '角色包用途声明缺少必需的禁止用途条目，已拒绝。'
  if (codes.has('missing-ai-provenance')) return '角色包缺少 AI 生成标识/披露，已拒绝。'
  if (codes.has('invalid-license') || issues.some((item) => item.path.toLowerCase().includes('license'))) {
    return '角色包缺少许可（spdx + attribution），已拒绝。'
  }
  if (codes.has('missing-signature') || codes.has('invalid-signature') || codes.has('unknown-signing-key') || codes.has('unverified-remote')) {
    return '远程角色包必须经远程市场验签安装器安装；未验签的包一律拒绝。'
  }
  return '角色包清单（pack.json）校验失败，已拒绝。'
}

function readSelectionBundle(selection: CharacterPackImportSelection): Promise<
  | { readonly ok: true; readonly bundle: ContentBundle }
  | { readonly ok: false; readonly message: string; readonly issues: readonly ContentIssue[] }
> {
  if (!isRecord(selection) || typeof selection.name !== 'string') {
    return Promise.resolve({ ok: false, message: '角色包选择无效。', issues: Object.freeze([]) })
  }
  if (selection.kind === 'json') {
    return Promise.resolve({
      ok: false,
      message: '角色包安装器只接受 .zip 或文件夹（根目录 pack.json + assets/）；不支持单独导入 JSON 清单。',
      issues: Object.freeze([]),
    })
  }
  if (selection.kind === 'zip') {
    const bytes = selection.bytes
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) {
      return Promise.resolve({ ok: false, message: '角色包 ZIP 为空或读取失败。', issues: Object.freeze([]) })
    }
    return readContentZip(bytes).then((read) =>
      read.ok ? { ok: true as const, bundle: read.bundle } : { ok: false as const, message: describeIssues(read.issues), issues: read.issues },
    )
  }
  if (selection.kind === 'folder') {
    const files = selection.files ?? []
    if (files.length === 0) return Promise.resolve({ ok: false, message: '文件夹里没有可选文件。', issues: Object.freeze([]) })
    return readContentFolder(files.map((file) => ({ path: file.path, bytes: file.bytes }))).then((read) =>
      read.ok ? { ok: true as const, bundle: read.bundle } : { ok: false as const, message: describeIssues(read.issues), issues: read.issues },
    )
  }
  return Promise.resolve({ ok: false, message: '角色包选择无效。', issues: Object.freeze([]) })
}

// ---------------------------------------------------------------------------
// Installed-pointer discovery + runtime host
// ---------------------------------------------------------------------------

const POINTER_PATH_PATTERN = /^([a-z0-9][a-z0-9.-]*)\/current\.json$/

function parseInstalledRecord(raw: unknown, expectedPackId: string): { packId: string; version: string; zipSha256: string } | null {
  if (!isRecord(raw)) return null
  const packId = raw.packId
  const version = raw.version
  const zipSha256 = raw.zipSha256
  if (typeof packId !== 'string' || packId !== expectedPackId || !PACK_ID_PATTERN.test(packId)) return null
  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) return null
  if (typeof zipSha256 !== 'string' || !SHA256_PATTERN.test(zipSha256)) return null
  return { packId, version, zipSha256 }
}

function parseInstalledState(raw: unknown, directoryPackId: string): CharacterPackInstalledState | null {
  if (!isRecord(raw) || raw.schema !== CHARACTER_PACK_POINTER_SCHEMA) return null
  const record = parseInstalledRecord(raw, directoryPackId)
  if (record === null) return null
  const characterId = raw.characterId
  const name = raw.name
  const kind = raw.kind
  if (typeof characterId !== 'string' || !PACK_ID_PATTERN.test(characterId)) return null
  if (typeof name !== 'string' || name.length === 0 || name.length > 80 || CONTROL_CHARS.test(name)) return null
  if (!isCharacterPackKind(kind)) return null
  let previous: { packId: string; version: string; zipSha256: string } | undefined
  if (raw.previous !== undefined) {
    const parsed = parseInstalledRecord(raw.previous, record.packId)
    if (parsed === null) return null
    previous = parsed
  }
  return Object.freeze({ record, characterId, kind, name, ...(previous !== undefined ? { previous } : {}) })
}

function installedStateFromPointer(bytes: Uint8Array, directoryPackId: string): CharacterPackInstalledState | null {
  const text = decodeUtf8(bytes)
  if (text === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  return parseInstalledState(raw, directoryPackId)
}

async function listInstalledStates(store: CharacterPackFileStore): Promise<readonly CharacterPackInstalledState[]> {
  const paths = await store.listPaths()
  const pointerPaths = [...paths].filter((path) => POINTER_PATH_PATTERN.test(path)).sort()
  const states: CharacterPackInstalledState[] = []
  for (const path of pointerPaths) {
    const match = POINTER_PATH_PATTERN.exec(path)
    const directoryPackId = match?.[1]
    if (directoryPackId === undefined) continue
    try {
      const bytes = await store.read(path)
      if (bytes === null) continue
      const state = installedStateFromPointer(bytes, directoryPackId)
      if (state !== null) states.push(state)
    } catch {
      // A corrupt/unreadable pointer is skipped; the runtime also reports it.
    }
  }
  return Object.freeze(states)
}

/** MIME type for a stored pack asset path (only v2's allowed image types matter). */
function assetMimeForPath(path: string): string {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.woff2')) return 'font/woff2'
  return 'application/octet-stream'
}

/** Base64-encode bytes without an npm dependency (browser + Node both work). */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize))
    binary += String.fromCharCode(...chunk)
  }
  if (typeof btoa === 'function') return btoa(binary)
  // Minimal base64 fallback for hosts without btoa (e.g. exotic embedded JS).
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let out = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0
    const hasB = index + 1 < bytes.length
    const hasC = index + 2 < bytes.length
    const b = bytes[index + 1] ?? 0
    const c = bytes[index + 2] ?? 0
    out += alphabet[a >> 2]
    out += alphabet[((a & 3) << 4) | (b >> 4)]
    out += hasB ? alphabet[((b & 15) << 2) | (c >> 6)] : '='
    out += hasC ? alphabet[c & 63] : '='
  }
  return out
}

/**
 * Total byte budget for the per-frame/preview data: URLs handed to the hero
 * adapter on one load. The pack itself is bounded to 16 MiB compressed / 32 MiB
 * uncompressed; base64 inflates ~4/3. A pack above this budget fails closed
 * (fallback to the built-in renderer) instead of risking a WebView OOM.
 */
const CHARACTER_PACK_ASSET_URL_BUDGET_BYTES = 24 * 1024 * 1024

/**
 * Read + validate one installed pack and hand the runtime absolute asset URLs.
 *
 * Character packs are installed into IndexedDB as a file tree, so the hero
 * renderer (which loads `Image.src`) cannot address those files directly. Every
 * required frame (plus the preview) is encoded as a bounded `data:` URL keyed by
 * its pack-relative path; the runtime passes `assetUrls` through to the art
 * handle and `character-pack-renderer.ts` resolves each frame path from it.
 */
function createRuntimeHost(store: CharacterPackFileStore): CharacterPackRuntimeHost {
  return {
    readZip: (bytes: ArrayBuffer | Uint8Array): Promise<ContentBundleReadResult> => readContentZip(bytes),
    listInstalled: (): Promise<readonly CharacterPackInstalledState[]> => listInstalledStates(store),
    write: async (path: string, bytes: Uint8Array): Promise<void> => {
      await store.write(path, bytes)
    },
    remove: async (path: string): Promise<void> => {
      await store.remove(path)
    },
    loadCharacter: async (ref) => {
      const base = ref.packId + '/' + ref.version + '/'
      const path = base + CHARACTER_PACK_MANIFEST_FILE
      const bytes = await store.read(path)
      if (bytes === null) throw new Error('installed character pack.json is missing: ' + path)
      const text = decodeUtf8(bytes)
      if (text === null) throw new Error('installed character pack.json is not valid UTF-8')
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        throw new Error('installed character pack.json is not valid JSON')
      }
      // The runtime re-validates fail-closed too; this early validation is what
      // lets the host derive the canonical frame paths without inventing them.
      const validation = validateCharacterPackV2(raw)
      if (!validation.ok) throw new Error('installed character pack.json failed validation')
      const assetPaths = new Set<string>(characterPackFramePaths(validation.pack))
      if (typeof validation.pack.preview === 'string' && validation.pack.preview.length > 0) {
        assetPaths.add(validation.pack.preview)
      }
      const assetUrls: Record<string, string> = {}
      let budget = 0
      for (const assetPath of assetPaths) {
        const data = await store.read(base + assetPath)
        if (data === null) throw new Error('installed character pack asset is missing: ' + assetPath)
        budget += data.byteLength
        if (budget > CHARACTER_PACK_ASSET_URL_BUDGET_BYTES) {
          throw new Error('installed character pack assets exceed the ' + CHARACTER_PACK_ASSET_URL_BUDGET_BYTES + ' byte render URL budget')
        }
        assetUrls[assetPath] = 'data:' + assetMimeForPath(assetPath) + ';base64,' + bytesToBase64(data)
      }
      return { pack: raw, assetUrls }
    },
    emit: (_event: CharacterPackRuntimeEvent): void => {
      // Events are observability-only; the panel re-reads state() after every
      // action and nothing here performs install work.
    },
  }
}

// ---------------------------------------------------------------------------
// Failure translation
// ---------------------------------------------------------------------------

const FAILURE_MESSAGES: Readonly<Record<CharacterPackRuntimeErrorCode, string>> = Object.freeze({
  busy: '另一个角色包操作正在进行，请稍候再试。',
  'invalid-request': '角色包请求无效，已拒绝。',
  'invalid-pack': '角色包清单（pack.json）校验失败，未安装。',
  'invalid-zip': '角色包 ZIP 结构无效或已损坏，未安装。',
  'zip-hash-mismatch': '角色包 ZIP 哈希与预期不符，已拒绝安装。',
  'declaration-required': '角色包缺少统一用途声明，已拒绝安装。',
  'license-required': '角色包缺少许可信息，已拒绝安装。',
  'ai-disclosure-required': '角色包缺少 AI 生成标识/披露，已拒绝安装。',
  'consent-required': '必须逐项确认统一用途声明、许可与 AI 标识后才能安装。',
  'remote-unverified': '未经远程市场验签的角色包不能在本机安装。',
  'builtin-protected': '内置角色不能被第三方角色包覆盖。',
  'character-conflict': '同一角色 ID 已由另一个角色包提供，已拒绝。',
  'already-installed': '相同版本与内容的角色包已经安装。',
  'version-conflict': '同一版本内容不同；请提升角色包版本号后再安装。',
  'downgrade-refused': '安装器不接受降级；如需旧版本请使用回滚。',
  'not-installed': '没有找到该已安装角色包。',
  'nothing-to-rollback': '该角色包没有可回滚的上一版本。',
  'rollback-unavailable': '上一版本无法加载（可能损坏或被篡改），回滚未执行。',
  'active-character-in-use': '该角色包正在启用中，无法卸载；请先切回内置登记角色。',
  'character-not-found': '找不到该角色包或内置角色。',
  'load-failed': '已安装角色包加载失败（可能损坏或被篡改），未启用。',
  'host-list-failed': '本地角色包存储读取失败；未做任何修改。',
  'host-write-failed': '本地角色包存储写入失败；未完成的安装已回滚。',
  'host-remove-failed': '本地角色包存储删除失败；状态未回退。',
  'host-fetch-failed': '本安装器不联网，不支持远程清单读取。',
  unsupported: '角色包运行时报告此操作不受支持。',
})

function failureOutcome(failure: CharacterPackRuntimeFailure, action: string): CharacterPackActionOutcome {
  const base = FAILURE_MESSAGES[failure.code] ?? ('角色包' + action + '失败。')
  let message = base + '（错误码：' + failure.code + '）'
  if (failure.rolledBack === true) message += ' 未完成的写入已回滚。'
  if (failure.restored !== undefined && failure.restored !== null) {
    message += ' 仍保持原启用角色「' + failure.restored.name + '」（仅登记）。'
  }
  return { ok: false, message, ...(failure.issues !== undefined ? { issues: failure.issues } : {}) }
}

// ---------------------------------------------------------------------------
// Active-pack persistence (versioned storage envelope)
// ---------------------------------------------------------------------------

function parsePersistedActivePack(raw: string | null): PersistedActivePack | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > CHARACTER_PACK_ACTIVE_STORAGE_MAX_BYTES) return null
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(value) || value.v !== CHARACTER_PACK_ACTIVE_STORAGE_VERSION) return null
  const packId = value.packId
  const version = value.version
  const characterId = value.characterId
  const savedAt = value.savedAt
  if (typeof packId !== 'string' || !PACK_ID_PATTERN.test(packId)) return null
  if (typeof version !== 'string' || !SEMVER_PATTERN.test(version)) return null
  if (typeof characterId !== 'string' || !PACK_ID_PATTERN.test(characterId)) return null
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt) || savedAt < 0) return null
  return Object.freeze({ packId, version, characterId, savedAt })
}

function readPersistedActivePack(storage: StorageLike | null, key: string): PersistedActivePack | null {
  return parsePersistedActivePack(safeGetItem(key, storage))
}

function writePersistedActiveIdentity(
  storage: StorageLike | null,
  key: string,
  identity: { readonly packId: string; readonly version: string; readonly characterId: string },
  now: number,
): boolean {
  const value = {
    v: CHARACTER_PACK_ACTIVE_STORAGE_VERSION,
    packId: identity.packId,
    version: identity.version,
    characterId: identity.characterId,
    savedAt: now,
  }
  return safeSetItem(key, JSON.stringify(value), storage) === 'ok'
}

function writePersistedActivePack(storage: StorageLike | null, key: string, active: CharacterPackActiveCharacter, now: number): boolean {
  return writePersistedActiveIdentity(storage, key, active, now)
}

function clearPersistedActivePack(storage: StorageLike | null, key: string): void {
  safeRemoveItem(key, storage)
}

// ---------------------------------------------------------------------------
// Unavailable adapter (honest, never throws)
// ---------------------------------------------------------------------------

export function characterPackUnavailableState(reason: string): CharacterPackUiState {
  return Object.freeze({
    available: false,
    unavailableReason: reason,
    operation: 'idle' as CharacterPackRuntimeOperation,
    activePackId: null,
    rows: Object.freeze([]),
    installedCount: 0,
    rendererConnected: false,
    renderer: Object.freeze({ mode: 'none' as const, connected: false, ready: false, rendered: null, saved: null, fallbackReason: null }),
    restorePending: false,
    note: CHARACTER_PACK_RENDERER_NOTE,
  })
}

function unavailableAdapter(reason: string): CharacterPackHubAdapter {
  const state = characterPackUnavailableState(reason)
  const fail = (): { readonly ok: false; readonly message: string } => ({
    ok: false,
    message: '角色包安装器不可用：' + reason,
  })
  return Object.freeze({
    state: (): CharacterPackUiState => state,
    preview: async (): Promise<CharacterPackPreviewResult> => fail(),
    install: async (): Promise<CharacterPackActionOutcome> => fail(),
    cancelPrepared: (): void => {},
    enable: async (): Promise<CharacterPackActionOutcome> => fail(),
    uninstall: async (): Promise<CharacterPackActionOutcome> => fail(),
    rollback: async (): Promise<CharacterPackActionOutcome> => fail(),
    restoreActive: async (): Promise<CharacterPackActionOutcome> => fail(),
    syncActive: async (): Promise<CharacterPackActionOutcome> => fail(),
  })
}

// ---------------------------------------------------------------------------
// Installer factory
// ---------------------------------------------------------------------------

interface PreparedEntry {
  readonly token: string
  readonly preview: CharacterPackPreview
  readonly zipBytes: Uint8Array
  readonly zipSha256: string
}

/**
 * Open the IndexedDB (memory-fallback) character-pack host + runtime and return
 * the adapter the 内容包 tab consumes. Failures are returned as an
 * `available:false` adapter so the UI can show an honest error instead of
 * crashing or silently hiding the installer.
 */
export async function createCharacterPackInstaller(
  options: CharacterPackInstallerOptions = {},
): Promise<CharacterPackHubAdapter> {
  let store: CharacterPackFileStore
  try {
    store =
      options.store ??
      (await openCharacterPackFileStore({
        ...(options.factory !== undefined ? { factory: options.factory } : {}),
        ...(options.dbName !== undefined ? { dbName: options.dbName } : {}),
      }))
  } catch (error) {
    return unavailableAdapter('本地角色包存储不可用：' + messageOf(error))
  }
  let runtime: CharacterPackRuntime
  try {
    const builtin = buildFallbackBuiltin(options.kind ?? 'humanoid', options.fallbackName)
    runtime = await CharacterPackRuntime.open({
      host: createRuntimeHost(store),
      builtins: [builtin],
      defaultCharacterId: builtin.packId,
      ...(options.now !== undefined ? { now: options.now } : {}),
    })
  } catch (error) {
    return unavailableAdapter('角色包运行时初始化失败：' + messageOf(error))
  }

  const wiring = options.renderer
  const rendererConnected = wiring !== undefined || options.applyCharacter !== undefined
  /** This window owns the hero scene (true in the pet window, false in the content window). */
  const localRenderer = wiring === undefined ? false : wiring.localRenderer !== false
  const persistentStorage = wiring === undefined ? null : resolveStorage(wiring.storage)
  const activeStorageKey = wiring?.storageKey ?? CHARACTER_PACK_ACTIVE_STORAGE_KEY
  const rendererAdapter =
    wiring === undefined
      ? null
      : new CharacterPackRendererAdapter({
          host:
            wiring.onRendererEvent === undefined
              ? wiring.host
              : {
                  ...wiring.host,
                  emit: (event: CharacterPackRendererEvent): void => {
                    try {
                      wiring.onRendererEvent?.(event)
                    } catch {
                      // Observability must never break a render transition.
                    }
                  },
                },
          ...(wiring.resolveBase !== undefined ? { resolveBase: wiring.resolveBase } : {}),
        })
  const prepared = new Map<string, PreparedEntry>()
  let preparedSeq = 0
  /** Why the last renderer apply/restore fell back to the built-in renderer. */
  let fallbackReason: string | null = null

  function now(): number {
    return options.now !== undefined ? options.now() : Date.now()
  }

  function isRendererReady(): boolean {
    if (!rendererConnected || !localRenderer) return false
    if (wiring === undefined) return true
    if (wiring.isReady === undefined) return false
    try {
      return wiring.isReady() === true
    } catch {
      return false
    }
  }

  function rendererNote(): string {
    if (!rendererConnected) return CHARACTER_PACK_RENDERER_NOTE
    if (!localRenderer) return CHARACTER_PACK_RENDERER_REMOTE_NOTE
    return isRendererReady() ? CHARACTER_PACK_RENDERER_READY_NOTE : CHARACTER_PACK_RENDERER_NOT_READY_NOTE
  }

  /** Ask the pet window (which owns the hero scene) to apply the saved appearance. */
  function requestRemoteApply(): void {
    if (wiring === undefined || wiring.requestRemoteApply === undefined) return
    try {
      wiring.requestRemoteApply()
    } catch {
      // Cross-window notification is best effort: the saved record still applies on boot.
    }
  }

  /** The persisted appearance as a registry-resolved row (name may fall back to id). */
  function savedAppearance(): { readonly packId: string; readonly version: string; readonly name: string } | null {
    const persisted = readPersisted()
    if (persisted === null) return null
    const row = runtime.registry().find((entry) => entry.packId === persisted.packId && entry.version === persisted.version)
    return Object.freeze({ packId: persisted.packId, version: persisted.version, name: row?.name ?? persisted.packId })
  }

  function renderedPack(): { readonly packId: string; readonly version: string; readonly name: string } | null {
    if (rendererAdapter === null) return null
    const current = rendererAdapter.snapshot().current
    if (current === null) return null
    const row = runtime.registry().find((entry) => entry.packId === current.packId && entry.version === current.version)
    return Object.freeze({ packId: current.packId, version: current.version, name: row?.name ?? current.packId })
  }

  function readPersisted(): PersistedActivePack | null {
    if (wiring === undefined) return null
    return readPersistedActivePack(persistentStorage, activeStorageKey)
  }

  function currentState(): CharacterPackUiState {
    const snapshot = runtime.snapshot()
    const rows: CharacterPackUiRow[] = snapshot.registry.map((entry) =>
      Object.freeze({
        packId: entry.packId,
        characterId: entry.characterId,
        name: entry.name,
        version: entry.version,
        kind: entry.kind,
        source: entry.source,
        active: entry.active,
        ...(entry.previousVersion !== undefined ? { previousVersion: entry.previousVersion } : {}),
      }),
    )
    const rendered = renderedPack()
    const renderer: CharacterPackRendererState = Object.freeze({
      mode: rendererConnected ? (localRenderer ? ('local' as const) : ('remote' as const)) : ('none' as const),
      connected: rendererConnected,
      ready: isRendererReady(),
      rendered,
      saved: savedAppearance(),
      fallbackReason,
    })
    return Object.freeze({
      available: true,
      unavailableReason: null,
      operation: snapshot.operation,
      activePackId: snapshot.active?.packId ?? null,
      rows: Object.freeze(rows),
      installedCount: rows.filter((row) => row.source === 'installed').length,
      rendererConnected,
      renderer,
      restorePending: localRenderer && rendered === null && isRendererReady() && readPersisted() !== null,
      note: rendererNote(),
    })
  }

  function rowName(packId: string): string {
    const row = currentState().rows.find((entry) => entry.packId === packId)
    return row?.name ?? packId
  }

  /** True once the hero scene actually renders this pack (renderer truth). */
  function isRendered(packId: string, version?: string): boolean {
    const rendered = renderedPack()
    if (rendered === null || rendered.packId !== packId) return false
    return version === undefined || rendered.version === version
  }

  async function callRestoreBuiltin(): Promise<{ ok: boolean; message: string }> {
    if (wiring === undefined) return { ok: true, message: '渲染器未接入，外观未改变。' }
    try {
      const result = await wiring.restoreBuiltin()
      if (result !== null && typeof result === 'object' && typeof result.ok === 'boolean') {
        return { ok: result.ok, message: typeof result.message === 'string' ? result.message : '' }
      }
      return { ok: false, message: '内置渲染器恢复回调返回了无效结果。' }
    } catch (error) {
      return { ok: false, message: messageOf(error) }
    }
  }

  /** Release the rendered pack, restore the built-in renderer and clear persistence. */
  async function renderBuiltin(reason: string | null): Promise<CharacterPackActionOutcome> {
    let releaseWarning = ''
    if (rendererAdapter !== null) {
      try {
        const released = await rendererAdapter.release()
        if (!released.ok) releaseWarning = '；旧角色包释放失败：' + released.message
      } catch (error) {
        releaseWarning = '；旧角色包释放失败：' + messageOf(error)
      }
    }
    const restored = await callRestoreBuiltin()
    clearPersistedActivePack(persistentStorage, activeStorageKey)
    // Registry truth follows the renderer truth: the built-in fallback is active.
    try {
      await runtime.enable(CHARACTER_PACK_FALLBACK_ID)
    } catch {
      // Best effort: the renderer fallback above is what the user actually sees.
    }
    if (reason === null) fallbackReason = null
    const restoredText = restored.ok
      ? '已切回内置渲染器。' + (restored.message !== '' ? ' ' + restored.message : '')
      : '内置渲染器恢复失败：' + restored.message
    return { ok: restored.ok, message: restoredText + releaseWarning }
  }

  function persistApplied(active: CharacterPackActiveCharacter): string {
    if (wiring === undefined) return ''
    const written = writePersistedActivePack(persistentStorage, activeStorageKey, active, now())
    return written ? '' : '；本地存储不可用，无法在下次启动恢复该外观。'
  }

  /** Convert + load the active handles into the live hero scene, or fall back. */
  async function applyActive(
    active: CharacterPackActiveCharacter,
    action: '启用' | '恢复' | '回滚' | '更新',
    forceReload: boolean,
  ): Promise<CharacterPackActionOutcome> {
    if (!rendererConnected) {
      return { ok: true, message: '已登记' + action + '「' + active.name + '」v' + active.version + '；' + CHARACTER_PACK_RENDERER_NOTE }
    }
    if (!localRenderer) {
      // Independent content window: persist the choice and ask the pet window
      // (the only window with a hero scene) to load + hot-swap the pack.
      const persistNote = persistApplied(active)
      requestRemoteApply()
      return {
        ok: true,
        message:
          '已' +
          action +
          '「' +
          active.name +
          '」v' +
          active.version +
          '；已保存并在桌宠窗口加载 hero 帧/资产并热切换（失败会自动回退内置渲染器）' +
          persistNote +
          '。',
      }
    }
    if (!isRendererReady()) {
      // Never leave the registry claiming an appearance the renderer cannot show.
      try {
        await runtime.enable(CHARACTER_PACK_FALLBACK_ID)
      } catch {
        // Best effort registry truth; the renderer never changed.
      }
      fallbackReason = 'hero 渲染器当前未运行（折叠纸模式或被关闭）'
      return {
        ok: false,
        message:
          '「' +
          active.name +
          '」v' +
          active.version +
          ' 已登记，但未启用：' +
          CHARACTER_PACK_RENDERER_NOT_READY_NOTE,
      }
    }
    if (rendererAdapter === null) {
      // Legacy one-shot applier (tests/embeds): no persistence, no fallback scene.
      try {
        const applied = await options.applyCharacter!(active)
        return applied.ok
          ? { ok: true, message: '已登记' + action + '「' + active.name + '」v' + active.version + '；' + applied.message }
          : applied
      } catch (error) {
        return { ok: false, message: '已登记' + action + '，但应用到渲染器失败：' + messageOf(error) }
      }
    }
    const result = await rendererAdapter.apply(active, forceReload ? { forceReload: true } : {})
    if (result.ok) {
      fallbackReason = null
      const frames = active.art.framePaths?.length ?? 0
      const persistNote = persistApplied(active)
      const stateText =
        result.state === 'unchanged'
          ? '（渲染器已是最新状态）'
          : '：hero 帧/资产已加载（' + frames + ' 帧）并热切换，无需刷新页面。'
      return { ok: true, message: '已' + action + '「' + active.name + '」v' + active.version + '，' + stateText + persistNote }
    }
    // Failure: the adapter kept (or re-loaded) the previous renderer state when it
    // could; make the runtime registry agree with what is actually displayed.
    const reason = '应用失败（' + result.code + '）：' + result.message
    fallbackReason = reason
    if (result.restored !== null && result.restoreFailed !== true) {
      try {
        const reverted = await runtime.enable(result.restored.packId, { version: result.restored.version })
        if (reverted.ok && !reverted.active.builtin) {
          const persistNote = persistApplied(reverted.active)
          return {
            ok: false,
            message:
              '已登记「' +
              active.name +
              '」v' +
              active.version +
              '，但' +
              reason +
              '；已保持上一个角色包外观「' +
              reverted.active.name +
              '」v' +
              reverted.active.version +
              persistNote +
              '。',
          }
        }
      } catch {
        // Fall through to the built-in fallback below.
      }
    }
    const fallback = await renderBuiltin(reason)
    fallbackReason = reason
    const fallbackText = fallback.ok ? '已自动回退内置渲染器' : '内置渲染器恢复也失败（' + fallback.message + '）'
    return {
      ok: false,
      message: '已登记「' + active.name + '」v' + active.version + '，但' + reason + '；' + fallbackText + '，本次外观未应用。',
    }
  }

  async function preview(selection: CharacterPackImportSelection): Promise<CharacterPackPreviewResult> {
    const read = await readSelectionBundle(selection)
    if (!read.ok) return { ok: false, message: read.message, ...(read.issues.length > 0 ? { issues: read.issues } : {}) }
    const bundle = read.bundle
    const packBytes = bundle.fileMap.get(CHARACTER_PACK_MANIFEST_FILE)
    if (packBytes === undefined) return { ok: false, message: '角色包根目录缺少 pack.json，已拒绝导入。' }
    if (packBytes.byteLength > CONTENT_PACK_V2_LIMITS.maxPackJsonBytes) {
      return { ok: false, message: '角色包 pack.json 超过大小上限，已拒绝导入。' }
    }
    const text = decodeUtf8(packBytes)
    if (text === null) return { ok: false, message: '角色包 pack.json 不是合法 UTF-8，已拒绝导入。' }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { ok: false, message: '角色包 pack.json 不是合法 JSON，已拒绝导入。' }
    }
    const validation = validateCharacterPackV2(raw)
    if (!validation.ok) return { ok: false, message: describePackFailure(validation.issues), issues: validation.issues }
    const pack: CharacterPackV2 = validation.pack
    if (pack.source !== 'local') {
      return { ok: false, message: '远程角色包必须经远程市场验签安装器安装；未验签的本地导入一律拒绝。' }
    }
    const zipValidation = validateCharacterPackZip(pack, bundle.inventory)
    if (!zipValidation.ok) {
      return { ok: false, message: describeIssues(zipValidation.issues), issues: zipValidation.issues }
    }
    let zipBytes: Uint8Array
    if (bundle.kind === 'zip') {
      const bytes = selection.bytes
      if (!(bytes instanceof ArrayBuffer)) return { ok: false, message: '角色包 ZIP 读取失败。' }
      zipBytes = new Uint8Array(bytes)
    } else {
      const packed = buildStoredZip(bundle.files.map((file) => ({ path: file.path, bytes: file.bytes })))
      if (!packed.ok) return { ok: false, message: packed.message }
      zipBytes = packed.bytes
    }
    if (zipBytes.byteLength === 0 || zipBytes.byteLength > CONTENT_PACK_V2_LIMITS.maxZipBytes) {
      return { ok: false, message: '角色包 ZIP 大小超出允许范围，已拒绝导入。' }
    }
    const zipSha256 = await sha256Hex(zipBytes)
    const confirmation = describeUsageConfirmation()
    const previewValue: CharacterPackPreview = Object.freeze({
      id: pack.id,
      name: pack.name,
      version: pack.version,
      kind: pack.kind,
      licenseSpdx: pack.license.spdx,
      licenseAttribution: pack.license.attribution,
      aiGenerated: pack.aiProvenance.generated,
      aiDisclosure: pack.aiProvenance.disclosure,
      source: 'local' as const,
      fileCount: bundle.files.length,
      previewPath: typeof pack.preview === 'string' ? pack.preview : null,
      statement: confirmation.statement,
      statementRef: confirmation.statementRef,
      prohibitedUses: confirmation.prohibitedUses,
    })
    prepared.clear()
    preparedSeq += 1
    const token = 'character-pack-' + preparedSeq
    prepared.set(token, Object.freeze({ token, preview: previewValue, zipBytes, zipSha256 }))
    return { ok: true, prepared: Object.freeze({ token, preview: previewValue }) }
  }

  async function install(preparedArg: CharacterPackPrepared, consent: CharacterPackConsentInput): Promise<CharacterPackActionOutcome> {
    const entry = prepared.get(preparedArg.token)
    if (entry === undefined) return { ok: false, message: '角色包预检结果已失效，请重新选择文件。' }
    if (!consentIsComplete(consent)) {
      return { ok: false, message: '必须逐项确认统一用途声明、角色包许可与 AI 生成标识后才能安装。' }
    }
    const result = await runtime.install({
      zipBytes: entry.zipBytes,
      consent: CONSENT_COMPLETE,
      expectedZipSha256: entry.zipSha256,
    })
    prepared.delete(preparedArg.token)
    if (!result.ok) return failureOutcome(result, '安装')
    const verb = result.action === 'update' ? '更新' : '安装'
    const baseMessage =
      '已' +
      verb +
      '角色包「' +
      entry.preview.name +
      '」v' +
      entry.preview.version +
      '：统一用途声明/许可/AI 标识均已确认，仅本地数据、未联网。'
    if (!rendererConnected) {
      return { ok: true, message: baseMessage + CHARACTER_PACK_UNWIRED_SUFFIX }
    }
    // An update of the pack a saved appearance points at must keep that saved
    // record resolvable: the next boot would otherwise request the deleted version.
    const persistedBefore = readPersisted()
    const savedWasUpdated =
      persistedBefore !== null &&
      persistedBefore.packId === result.state.record.packId &&
      persistedBefore.version !== result.state.record.version
    if (savedWasUpdated) {
      writePersistedActiveIdentity(
        persistentStorage,
        activeStorageKey,
        { packId: result.state.record.packId, version: result.state.record.version, characterId: result.state.characterId },
        now(),
      )
    }
    if (!localRenderer) {
      // The pet window owns the scene: it will refresh the registry and apply
      // the saved appearance when notified.
      if (savedWasUpdated) {
        requestRemoteApply()
        return { ok: true, message: baseMessage + ' 已通知桌宠窗口刷新角色包外观（更新会在该窗口热切换）。' }
      }
      return { ok: true, message: baseMessage + ' 安装后点「启用」会在桌宠窗口加载 hero 帧/资产并热切换外观。' }
    }
    // Updating the pack that is currently rendered should hot-swap to the new version.
    const active = runtime.activeCharacter()
    if (active !== null && active.packId === result.state.record.packId && active.version !== result.state.record.version) {
      const switched = await runtime.enable(result.state.record.packId)
      if (!switched.ok) {
        return { ok: true, message: baseMessage + ' 新版本已安装，但热切换失败（' + switched.message + '），请重新启用。' }
      }
      const applied = await applyActive(switched.active, '更新', true)
      return {
        ok: true,
        message:
          baseMessage +
          (applied.ok
            ? ' 当前启用的角色包已热切换到 v' + switched.active.version + '：' + applied.message
            : ' 新版本已安装，外观未切换：' + applied.message),
      }
    }
    return { ok: true, message: baseMessage + ' 安装后点「启用」即可加载 hero 帧/资产并热切换外观（无需刷新）。' }
  }

  async function enable(packId: string): Promise<CharacterPackActionOutcome> {
    const result = await runtime.enable(packId)
    if (!result.ok) return failureOutcome(result, '启用')
    const active = result.active
    if (active.builtin) {
      if (!rendererConnected) {
        return { ok: true, message: '已切回内置登记角色「' + active.name + '」；' + CHARACTER_PACK_RENDERER_NOTE }
      }
      if (!localRenderer) {
        clearPersistedActivePack(persistentStorage, activeStorageKey)
        requestRemoteApply()
        return { ok: true, message: '已切回内置渲染器；已通知桌宠窗口释放角色包并恢复内置外观。' }
      }
      const switched = await renderBuiltin(null)
      return switched.ok
        ? { ok: true, message: '已切回内置渲染器（原角色包已释放）。' + switched.message }
        : { ok: false, message: '已切回内置登记角色，但渲染器恢复失败：' + switched.message }
    }
    return applyActive(active, '启用', false)
  }

  async function uninstall(packId: string): Promise<CharacterPackActionOutcome> {
    const name = rowName(packId)
    const wasRendered = isRendered(packId)
    const result = await runtime.uninstall(packId)
    if (!result.ok) return failureOutcome(result, '卸载')
    let message = '已卸载角色包「' + name + '」v' + result.version + '，本地安装文件已清理。'
    const persisted = readPersisted()
    if (persisted !== null && persisted.packId === packId) {
      // Even when the hero scene is not currently running, a saved appearance for
      // this pack must not survive the uninstall and point at local data later.
      clearPersistedActivePack(persistentStorage, activeStorageKey)
    }
    if (wasRendered && rendererConnected) {
      const restored = await renderBuiltin(null)
      message += restored.ok
        ? ' 当前外观已回退内置渲染器。' + restored.message
        : ' 内置渲染器恢复失败：' + restored.message
    } else if (result.active !== null && result.active.builtin) {
      message += ' 已回落到内置登记角色「' + result.active.name + '」。' + (rendererConnected ? '' : CHARACTER_PACK_UNWIRED_SUFFIX)
    } else if (!rendererConnected) {
      message += CHARACTER_PACK_UNWIRED_SUFFIX
    }
    if (!localRenderer && rendererConnected) {
      requestRemoteApply()
      message += ' 已通知桌宠窗口刷新角色包外观。'
    }
    if (result.cleanupWarning !== undefined) {
      message += ' 目录清理警告：' + result.cleanupWarning + '（指针已删除，残留文件不会再被加载）。'
    }
    return { ok: true, message }
  }

  async function rollback(packId: string): Promise<CharacterPackActionOutcome> {
    const name = rowName(packId)
    const wasRendered = isRendered(packId)
    const result = await runtime.rollback(packId)
    if (!result.ok) return failureOutcome(result, '回滚')
    let message = '已将角色包「' + name + '」回滚到 v' + result.toVersion + '（当前版本 v' + result.fromVersion + ' 已清理）。'
    const persisted = readPersisted()
    if (persisted !== null && persisted.packId === packId && persisted.version !== result.toVersion) {
      // Keep a deferred/saved appearance consistent with the rolled-back version.
      writePersistedActiveIdentity(
        persistentStorage,
        activeStorageKey,
        { packId, version: result.toVersion, characterId: persisted.characterId },
        now(),
      )
    }
    if (wasRendered && rendererConnected && result.active !== null) {
      const applied = await applyActive(result.active, '回滚', true)
      message += applied.ok ? ' 外观已热切换到 v' + result.active.version + '：' + applied.message : ' 外观未切换：' + applied.message
    } else {
      message += rendererConnected ? '' : CHARACTER_PACK_UNWIRED_SUFFIX
    }
    if (!localRenderer && rendererConnected) {
      requestRemoteApply()
      message += ' 已通知桌宠窗口刷新角色包外观。'
    }
    if (result.cleanupWarning !== undefined) message += ' 目录清理警告：' + result.cleanupWarning
    return { ok: true, message }
  }

  let restoreInFlight: Promise<CharacterPackActionOutcome> | null = null

  /**
   * Boot-time restore: apply the persisted active pack once the hero renderer is
   * ready. Never throws; a missing/corrupt/removed pack falls back to the built-in
   * renderer and clears the persistence key (the UI states the fallback reason).
   */
  async function restoreActive(): Promise<CharacterPackActionOutcome> {
    if (wiring === undefined) return { ok: true, message: '角色包渲染器未接入：没有可恢复的外观。' }
    if (!localRenderer) return { ok: true, message: '外观由桌宠窗口负责渲染：本窗口只保存选择。' }
    if (restoreInFlight !== null) return restoreInFlight
    const work = (async (): Promise<CharacterPackActionOutcome> => {
      if (!isRendererReady()) {
        return { ok: false, message: 'hero 渲染器尚未就绪：角色包外观保持内置，稍后可重试恢复。' }
      }
      // Never fight a user-initiated install/enable for the same runtime lock:
      // defer without touching the saved appearance.
      if (runtime.operation() !== 'idle') {
        return { ok: false, message: '另一个角色包操作正在进行，稍后再恢复外观。' }
      }
      const rawPersisted = persistentStorage === null ? null : safeGetItem(activeStorageKey, persistentStorage)
      const persisted = parsePersistedActivePack(rawPersisted)
      if (persisted === null) {
        if (rawPersisted !== null) clearPersistedActivePack(persistentStorage, activeStorageKey)
        return { ok: true, message: rawPersisted === null ? '没有需要恢复的角色包外观。' : '保存的角色包外观记录无效，已清理；内置渲染器保持运行。' }
      }
      if (isRendered(persisted.packId, persisted.version)) {
        return { ok: true, message: '上次启用的角色包外观已在渲染中。' }
      }
      const enabled = await runtime.enable(persisted.packId, { version: persisted.version })
      if (!enabled.ok && enabled.code === 'busy') {
        return { ok: false, message: '另一个角色包操作正在进行，稍后再恢复外观。' }
      }
      if (!enabled.ok || enabled.active.builtin) {
        const detail = enabled.ok ? 'the persisted pack resolved to a built-in character' : enabled.code + ': ' + enabled.message
        fallbackReason = '上次启用的角色包「' + persisted.packId + '」v' + persisted.version + ' 无法加载（' + detail + '）'
        const restored = await renderBuiltin(fallbackReason)
        return {
          ok: false,
          message: fallbackReason + '；' + (restored.ok ? '已回退内置渲染器。' : '内置渲染器恢复失败：' + restored.message),
        }
      }
      return applyActive(enabled.active, '恢复', true)
    })()
    restoreInFlight = work
    try {
      return await work
    } finally {
      if (restoreInFlight === work) restoreInFlight = null
    }
  }

  /**
   * Pet-window cross-window sync: refresh the installed registry, then apply the
   * persisted appearance (or restore the built-in renderer when nothing is saved).
   * Called when the independent content window informs this window that the
   * installed packs / saved appearance changed.
   */
  async function syncActive(): Promise<CharacterPackActionOutcome> {
    if (wiring === undefined) return { ok: true, message: '角色包渲染器未接入：无需同步外观。' }
    if (!localRenderer) return { ok: true, message: '外观由桌宠窗口负责渲染：本窗口无需同步。' }
    if (runtime.operation() !== 'idle') return { ok: false, message: '另一个角色包操作正在进行，稍后同步外观。' }
    const refreshed = await runtime.refresh()
    if (!refreshed.ok) return failureOutcome(refreshed, '同步')
    const persisted = readPersisted()
    if (persisted === null) {
      if (renderedPack() === null) return { ok: true, message: '内置渲染器保持运行。' }
      const restored = await renderBuiltin(null)
      return {
        ok: restored.ok,
        message: restored.ok ? '已按外部变更回退内置渲染器。' + restored.message : '回退内置渲染器失败：' + restored.message,
      }
    }
    return restoreActive()
  }

  return Object.freeze({
    state: currentState,
    preview,
    install,
    cancelPrepared: (preparedArg: CharacterPackPrepared): void => {
      prepared.delete(preparedArg.token)
    },
    enable,
    uninstall,
    rollback,
    restoreActive,
    syncActive,
  })
}
