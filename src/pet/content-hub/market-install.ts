/**
 * Remote market install UI state machine (E8 / MB-084 engineering part).
 *
 * Scope of this module (deliberately UI/state only):
 * - drives an INJECTED {@link RemoteMarketSource} through the fail-closed install
 *   pipeline the market contract already documents: fetch catalog -> validate ->
 *   verify catalog -> (explicit usage-declaration confirmation) -> download ->
 *   SHA-256 + verify pack -> injected install callback;
 * - exposes staged progress (catalog / download / verify / install), cancellation
 *   through the AbortSignal the source API already accepts, retryable failure
 *   recovery with cleanup, an offline state that keeps the last verified listing
 *   visible, uninstall through an injected host callback, and per-pack version
 *   locks that block installing a different version until the user unlocks;
 * - persists installed versions + locks in a bounded versioned Web Storage
 *   envelope (injected storage in tests).
 *
 * Honest limits (do not over-claim):
 * - no network code lives here: the source is injected and the default host
 *   wiring is absent, so the market UI stays unconfigured/offline in this build;
 * - no byte-level progress: RemoteMarketSource has no progress callback, so the
 *   UI reports staged progress only (download reports the byte total after it
 *   completes). Byte-level progress needs a protocol/API change, not UI glue;
 * - no unzip/atomic install: the injected host install callback owns that
 *   (SEC-501); without it downloads are refused before any bytes are fetched;
 * - version locks are a user-intent guard, not an auto-updater: this UI never
 *   silently updates anything, so a lock blocks installing a DIFFERENT version
 *   until the user unlocks it explicitly.
 */

import { sha256Hex } from '../content-assets.ts'
import {
  describeUsageConfirmation,
  validateMarketCatalog,
  type ContentMarketCatalog,
  type ContentMarketPack,
} from '../content-library.ts'
import { readVersioned, writeVersioned, type StorageLike } from '../security/safe-storage.ts'
import type { RemoteMarketSource, RemoteMarketVerifyDeps } from './market.ts'

// ---------------------------------------------------------------------------
// Public constants
// ---------------------------------------------------------------------------

/** Versioned Web Storage key for installed versions + version locks. */
export const CONTENT_MARKET_INSTALL_STORAGE_KEY = 'desktop-games/pet/content/market/installed'
/** Envelope version of {@link CONTENT_MARKET_INSTALL_STORAGE_KEY}. */
export const CONTENT_MARKET_INSTALL_STORAGE_VERSION = 1
/** Hard cap of the persisted state payload (bytes); larger values are ignored. */
export const CONTENT_MARKET_INSTALL_STORAGE_MAX_BYTES = 16 * 1024
/** Hard cap of persisted records (one entry per pack; far above a real catalog). */
export const CONTENT_MARKET_INSTALL_MAX_RECORDS = 64
/**
 * Absolute UI cap for one downloaded pack (64 MiB). The catalog schema itself
 * caps any advertised pack at 16 MiB and the injected transport/client enforces
 * its own configured cap; this is only the last-resort UI boundary.
 */
export const CONTENT_MARKET_INSTALL_MAX_PACK_BYTES = 64 * 1024 * 1024

/** Ordered fail-closed steps the UI reports (staged progress; 1-based). */
export const CONTENT_MARKET_INSTALL_STEPS: readonly string[] = Object.freeze([
  '读取并验签市场目录（只在用户刷新/安装时请求）',
  '下载内容包（必须先确认统一用途声明）',
  '校验 SHA-256 与 Ed25519 签名',
  '交给本机安装器落盘（未注入安装器时拒绝下载）',
])
/** Number of staged progress steps. */
export const CONTENT_MARKET_INSTALL_TOTAL_STEPS = CONTENT_MARKET_INSTALL_STEPS.length

/** Stable UI failure code used when the user cancelled an install. */
export const MARKET_INSTALL_CANCELLED_CODE = 'cancelled'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MarketInstallStage = 'catalog' | 'download' | 'verify' | 'install'
export type MarketInstallFailureStage = MarketInstallStage | 'uninstall'
export type MarketInstallStatus =
  | 'unconfigured'
  | 'idle'
  | 'refreshing'
  | 'awaiting-confirmation'
  | 'installing'
  | 'uninstalling'
  | 'offline'
  | 'failed'
  | 'cancelled'

/** One installed remote pack (persisted; no bytes/URLs/keys are stored). */
export interface MarketInstalledRecord {
  readonly packId: string
  readonly name: string
  readonly version: string
  /** Epoch milliseconds of the successful install. */
  readonly installedAt: number
  /** Injected source id that supplied the pack. */
  readonly sourceId: string
}

/** One user-declared version lock (persisted; version = installed version). */
export interface MarketVersionLockRecord {
  readonly packId: string
  readonly version: string
  /** Epoch milliseconds of the explicit lock click. */
  readonly lockedAt: number
}

/** Staged progress snapshot while a catalog/install operation runs. */
export interface MarketInstallProgress {
  readonly stage: MarketInstallStage
  /** 1-based staged step number (1..CONTENT_MARKET_INSTALL_TOTAL_STEPS). */
  readonly step: number
  readonly totalSteps: number
  readonly label: string
  readonly packId: string | null
  /** Downloaded bytes, only known after the download stage completes. */
  readonly bytes: number | null
  /** True while the operation accepts a cancel click. */
  readonly cancellable: boolean
}

/** Failure state with an explicit recovery path. */
export interface MarketInstallFailure {
  readonly code: string
  readonly message: string
  readonly stage: MarketInstallFailureStage
  /** True when the UI may offer a retry for this exact failure. */
  readonly retryable: boolean
  /** The pack the failure belongs to (null for catalog-only failures). */
  readonly packId: string | null
}

/** Pending usage-declaration confirmation (shown BEFORE any download). */
export interface MarketInstallConfirmation {
  readonly packId: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly bytes: number
  readonly usageStatement: string
  readonly statementRef: string
  readonly usageSha256: string
  readonly prohibitedUses: readonly string[]
}

/** One market row = signed listing merged with local installed/locked truth. */
export interface MarketInstallRow {
  readonly packId: string
  readonly name: string
  readonly description: string
  /** Version offered by the last verified catalog (null = installed-only row). */
  readonly marketVersion: string | null
  readonly installedVersion: string | null
  readonly lockedVersion: string | null
  /** True when the catalog offers a version different from the installed one. */
  readonly updateAvailable: boolean
  /** True when the last verified catalog still lists this pack. */
  readonly offered: boolean
  /** User-facing reason install is disabled, or null when install is allowed. */
  readonly installDisabledReason: string | null
  readonly canInstall: boolean
  readonly canUninstall: boolean
  readonly canLock: boolean
  readonly canUnlock: boolean
}

/** Complete synchronous snapshot consumed by the 市场 tab renderer. */
export interface MarketInstallUiState {
  readonly status: MarketInstallStatus
  /** False when no source object was injected at all. */
  readonly available: boolean
  readonly configured: boolean
  readonly sourceLabel: string | null
  /** True when the injected source reports configured:true (offline fuse open). */
  readonly offline: boolean
  readonly offlineReason: string | null
  readonly canRefresh: boolean
  readonly refreshing: boolean
  readonly verifyConfigured: boolean
  readonly installerConfigured: boolean
  readonly uninstallerConfigured: boolean
  readonly catalogVersion: string | null
  readonly catalogUpdatedAt: string | null
  /** Last verified catalog rows + installed-only rows. */
  readonly rows: readonly MarketInstallRow[]
  readonly installed: readonly MarketInstalledRecord[]
  readonly locks: readonly MarketVersionLockRecord[]
  readonly confirmation: MarketInstallConfirmation | null
  readonly progress: MarketInstallProgress | null
  readonly failure: MarketInstallFailure | null
  readonly busy: boolean
  readonly busyLabel: string | null
  /** Non-fatal local persistence warning (storage unavailable/corrupt/etc.). */
  readonly storageWarning: string | null
}

/** Result of one UI action (message is shown verbatim in the panel feedback). */
export interface MarketInstallActionResult {
  readonly ok: boolean
  readonly message: string
  readonly code?: string
}

/** Injected uninstall outcome (the host removes the pack and its bytes). */
export interface MarketUninstallOutcome {
  readonly ok: boolean
  readonly message: string
}

export type MarketUninstallHook = (record: MarketInstalledRecord) => MarketUninstallOutcome | Promise<MarketUninstallOutcome>

/** Host seams for the UI adapter. Every effect is injected; tests stay offline. */
export interface MarketInstallHostOptions {
  /** Web Storage override; undefined = safe global localStorage, null = memory only. */
  readonly storage?: StorageLike | null
  /**
   * Pinned trust root + Ed25519 verifier. Required before ANY catalog/pack is
   * shown or installed; absent = fail closed (no fetch, no install).
   */
  readonly verify?: RemoteMarketVerifyDeps
  /** Host uninstall callback (removes the pack + its bytes); absent = disabled. */
  readonly uninstall?: MarketUninstallHook
  /** Clock override for deterministic timestamps (tests). */
  readonly now?: () => number
  /** Called after every observable state change so the host can re-render. */
  readonly onChange?: () => void
}

export interface MarketInstallController {
  state(): MarketInstallUiState
  /** Explicit refresh: the ONLY catalog network request this module can trigger. */
  refresh(): Promise<MarketInstallActionResult>
  /** Show the usage-declaration confirmation; performs ZERO network requests. */
  requestInstall(packId: string): MarketInstallActionResult
  /** Drop the pending confirmation (nothing was downloaded). */
  cancelPendingInstall(): void
  /** Download + verify + install the confirmed pack (explicit user action). */
  confirmInstall(): Promise<MarketInstallActionResult>
  /** Abort the running refresh/install (bytes are dropped; no partial install). */
  cancel(): MarketInstallActionResult
  /** Retry the last retryable failure (same pack, already-confirmed declaration). */
  retry(): Promise<MarketInstallActionResult>
  /** Drop the failure state and any retained bundle. */
  clearFailure(): void
  /** Remove one installed pack through the injected host callback. */
  uninstall(packId: string): Promise<MarketInstallActionResult>
  /** Pin the installed version: installing a different version requires unlock. */
  lockVersion(packId: string): MarketInstallActionResult
  /** Remove the version lock. */
  unlockVersion(packId: string): MarketInstallActionResult
  /** Abort pending work and stop emitting change events. */
  destroy(): void
}

// ---------------------------------------------------------------------------
// Failure-code presentation + recovery policy
// ---------------------------------------------------------------------------

const MARKET_FAILURE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'not-configured': '远程市场未配置（不会联网）',
  'transport-unavailable': '未注入市场传输层（不会联网）',
  'invalid-config': '远程市场客户端配置无效',
  'invalid-argument': '参数无效',
  'invalid-url': '市场 URL 无效',
  'insecure-transport': '连接不是 HTTPS，已拒绝',
  'url-credentials': 'URL 含账号密码，已拒绝',
  'url-fragment': 'URL 含片段，已拒绝',
  'private-host': '目标是私网/回环地址，已拒绝',
  'host-not-allowed': '目标主机不在允许列表，已拒绝',
  'network-error': '网络请求失败（可能离线）',
  timeout: '网络请求超时（可能离线）',
  'http-error': '市场服务器返回错误状态',
  'redirect-invalid': '跳转响应无效，已拒绝',
  'redirect-limit': '跳转次数过多，已拒绝',
  'redirect-cross-host': '跨域跳转，已拒绝',
  'redirect-insecure': 'HTTPS 被降级为 HTTP，已拒绝',
  'empty-response': '市场返回空响应',
  'too-large': '内容超过大小上限，已拒绝',
  'size-mismatch': '下载大小与签名目录不一致，已拒绝',
  'catalog-invalid': '市场目录未通过严格校验，已拒绝',
  'catalog-rollback': '市场目录版本回退，已拒绝',
  'catalog-unsupported': '市场目录版本过旧（0.1 只读），已拒绝',
  'catalog-expired': '市场目录已过期超出离线宽限，已拒绝',
  'rate-limited': '市场请求过于频繁，已暂缓',
  'storage-unavailable': '防回滚存储不可用，已拒绝联网',
  'storage-corrupt': '本地防回滚记录损坏，已拒绝联网',
  'serial-write-failed': '防回滚记录写入失败，已拒绝采用该目录',
  'pack-not-in-catalog': '内容包不在已验签的市场目录中，已拒绝',
  'install-unconfigured': '安装器未配置，未安装任何内容',
  'unpack-failed': '内容包解包/校验失败，未安装',
  'pack-invalid': '内容包未通过严格校验，未安装',
  'install-failed': '安装回调失败，未安装',
  'download-failed': '下载失败（未知错误），未安装',
  'missing-signature': '缺少 Ed25519 签名，已拒绝',
  'invalid-signature': 'Ed25519 签名不匹配，已拒绝',
  'unknown-signing-key': '签名密钥未知，已拒绝',
  'revoked-signing-key': '签名密钥已吊销，已拒绝',
  'key-outside-validity': '签名密钥不在有效期内，已拒绝',
  'hash-mismatch': 'SHA-256 不匹配，已拒绝',
  'internal-error': '内部错误',
})

/** Failure codes that mean "the market is unreachable" (offline UI). */
const OFFLINE_FAILURE_CODES: ReadonlySet<string> = new Set(['transport-unavailable', 'network-error', 'timeout'])

/**
 * Codes where retrying the exact same operation cannot help (bad signature,
 * tampered bytes, missing installer, unsupported protocol...). Everything else
 * (network/timeout/HTTP/rate limit/expired/install callback) gets a retry path.
 */
const NON_RETRYABLE_FAILURE_CODES: ReadonlySet<string> = new Set([
  'not-configured',
  'transport-unavailable',
  'invalid-config',
  'invalid-argument',
  'invalid-url',
  'insecure-transport',
  'url-credentials',
  'url-fragment',
  'private-host',
  'host-not-allowed',
  'redirect-cross-host',
  'redirect-insecure',
  'too-large',
  'size-mismatch',
  'catalog-invalid',
  'catalog-rollback',
  'catalog-unsupported',
  'storage-unavailable',
  'storage-corrupt',
  'serial-write-failed',
  'pack-not-in-catalog',
  'install-unconfigured',
  'unpack-failed',
  'pack-invalid',
  'missing-signature',
  'invalid-signature',
  'unknown-signing-key',
  'revoked-signing-key',
  'key-outside-validity',
  'hash-mismatch',
])

function isRetryableFailureCode(code: string): boolean {
  return !NON_RETRYABLE_FAILURE_CODES.has(code)
}

function isOfflineFailureCode(code: string): boolean {
  return OFFLINE_FAILURE_CODES.has(code)
}

function describeFailureCode(code: string): string {
  const label = MARKET_FAILURE_LABELS[code]
  return (label ?? '市场操作失败') + '（' + code + '）'
}

/** Read a stable failure code from a thrown value without importing the client. */
function errorCodeOf(error: unknown): string | null {
  if (!isRecord(error)) return null
  const failure = error.failure
  if (isRecord(failure)) {
    const code = failure.code
    if (typeof code === 'string' && code.length > 0) return code
  }
  const code = error.code
  if (typeof code === 'string' && code.length > 0) return code
  return null
}

function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown error'
}

function isAbortError(error: unknown, signal: AbortSignal | null): boolean {
  if (signal?.aborted === true) return true
  if (!isRecord(error)) return false
  return error.name === 'AbortError' || error.code === 'aborted'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// ---------------------------------------------------------------------------
// Bounded persistence
// ---------------------------------------------------------------------------

interface PersistedMarketInstallState {
  readonly installed: readonly MarketInstalledRecord[]
  readonly locks: readonly MarketVersionLockRecord[]
}

const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/
const MAX_TEXT_CHARS = 120

function boundedText(value: unknown, maxChars: number): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text.length === 0 || text.length > maxChars) return null
  if (/[\u0000-\u001f\u007f]/.test(text)) return null
  return text
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function validateInstalledRecord(value: unknown): MarketInstalledRecord | undefined {
  if (!isRecord(value)) return undefined
  const packId = boundedText(value.packId, 80)
  const name = boundedText(value.name, MAX_TEXT_CHARS)
  const version = boundedText(value.version, 64)
  const installedAt = finiteTimestamp(value.installedAt)
  const sourceId = boundedText(value.sourceId, 64) ?? ''
  if (packId === null || !PACK_ID_PATTERN.test(packId)) return undefined
  if (name === null || version === null || !VERSION_PATTERN.test(version) || installedAt === null) return undefined
  return Object.freeze({ packId, name, version, installedAt, sourceId })
}

function validateLockRecord(value: unknown): MarketVersionLockRecord | undefined {
  if (!isRecord(value)) return undefined
  const packId = boundedText(value.packId, 80)
  const version = boundedText(value.version, 64)
  const lockedAt = finiteTimestamp(value.lockedAt)
  if (packId === null || !PACK_ID_PATTERN.test(packId)) return undefined
  if (version === null || !VERSION_PATTERN.test(version) || lockedAt === null) return undefined
  return Object.freeze({ packId, version, lockedAt })
}

function validatePersistedState(value: unknown): PersistedMarketInstallState | undefined {
  if (!isRecord(value)) return undefined
  if (!Array.isArray(value.installed) || !Array.isArray(value.locks)) return undefined
  if (value.installed.length > CONTENT_MARKET_INSTALL_MAX_RECORDS) return undefined
  if (value.locks.length > CONTENT_MARKET_INSTALL_MAX_RECORDS) return undefined
  const installed: MarketInstalledRecord[] = []
  const seen = new Set<string>()
  for (const entry of value.installed) {
    const record = validateInstalledRecord(entry)
    if (record === undefined || seen.has(record.packId)) continue
    seen.add(record.packId)
    installed.push(record)
  }
  const locks: MarketVersionLockRecord[] = []
  const lockSeen = new Set<string>()
  for (const entry of value.locks) {
    const record = validateLockRecord(entry)
    if (record === undefined || lockSeen.has(record.packId)) continue
    // A lock without a matching installed version is stale; drop it on read.
    const match = installed.find((candidate) => candidate.packId === record.packId)
    if (match === undefined || match.version !== record.version) continue
    lockSeen.add(record.packId)
    locks.push(record)
  }
  return Object.freeze({ installed: Object.freeze(installed), locks: Object.freeze(locks) })
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

function freezeState(value: MarketInstallUiState): MarketInstallUiState {
  return Object.freeze(value)
}

/** Reason strings are user-facing plain text; keep them centralized. */
const REASON = Object.freeze({
  unconfigured: '远程市场未配置：不会下载或安装任何远程内容（默认不联网）。',
  noVerify: '宿主未注入市场验签依赖（信任根 / 验签器）：目录与安装保持禁用。',
  noInstaller: '宿主未注入安装器：只可浏览目录，不会下载或安装。',
  offline: '离线或目录不可用：请先刷新出已验签的市场目录。',
  noCatalog: '先点击「刷新市场目录…」取得已验签目录后才可安装。',
  busy: '已有市场操作进行中，请稍候。',
  installed: '已安装该版本。',
  noSource: '未注入远程市场源：本页不会发起任何网络请求。',
})

/**
 * Create the market install UI adapter for one injected {@link RemoteMarketSource}.
 *
 * Construction is inert: no source method is called, nothing is fetched and the
 * only side effect is a bounded local storage read for installed versions/locks.
 */
export function createMarketInstallController(
  source: RemoteMarketSource | null,
  options: MarketInstallHostOptions = {},
): MarketInstallController {
  const now = options.now ?? ((): number => Date.now())
  const verifyDeps = options.verify ?? null
  const storage = options.storage
  const uninstallHook = options.uninstall
  const onChange = options.onChange

  const confirmationCopy = describeUsageConfirmation()

  let catalog: ContentMarketCatalog | null = null
  let catalogVersion: string | null = null
  let catalogUpdatedAt: string | null = null
  let installed: readonly MarketInstalledRecord[] = Object.freeze([])
  let locks: readonly MarketVersionLockRecord[] = Object.freeze([])
  let storageWritable = true
  let storageWarning: string | null = null
  let offline = false
  let offlineReason: string | null = null
  let refreshing = false
  let uninstalling = false
  let progress: MarketInstallProgress | null = null
  let failure: MarketInstallFailure | null = null
  let pending: ContentMarketPack | null = null
  let retained: { readonly pack: ContentMarketPack; readonly bytes: ArrayBuffer; readonly sha256: string } | null = null
  let failPackId: string | null = null
  let abortController: AbortController | null = null
  let destroyed = false

  // --- persistence ---------------------------------------------------------

  function loadPersisted(): void {
    const result = readVersioned<PersistedMarketInstallState>(
      CONTENT_MARKET_INSTALL_STORAGE_KEY,
      {
        version: CONTENT_MARKET_INSTALL_STORAGE_VERSION,
        validate: validatePersistedState,
        maxBytes: CONTENT_MARKET_INSTALL_STORAGE_MAX_BYTES,
      },
      storage,
    )
    if (result.status === 'ok' && result.value !== undefined) {
      installed = result.value.installed
      locks = result.value.locks
      return
    }
    if (result.status === 'missing') return
    if (result.status === 'version') {
      storageWritable = false
      storageWarning = '本地市场记录来自更新的版本：本次只读，不会覆盖。'
      return
    }
    if (result.status === 'corrupt' || result.status === 'invalid') {
      storageWarning = '本地市场安装记录损坏，已按空记录启动（内置内容不受影响）。'
      return
    }
    if (result.status === 'unavailable') {
      storageWarning = '本地存储不可用：安装记录与版本锁只在本次运行有效。'
    }
  }

  function persist(): void {
    if (!storageWritable) {
      storageWarning = '本地市场记录为只读（来自更新版本）：本次安装/锁定只在本次运行有效。'
      return
    }
    const result = writeVersioned(
      CONTENT_MARKET_INSTALL_STORAGE_KEY,
      { installed, locks } satisfies PersistedMarketInstallState,
      { version: CONTENT_MARKET_INSTALL_STORAGE_VERSION, maxBytes: CONTENT_MARKET_INSTALL_STORAGE_MAX_BYTES },
      storage,
    )
    if (result.status !== 'ok') {
      storageWarning = '本地市场记录写入失败（' + result.status + '）：本次安装/锁定只在本次运行有效。'
    } else {
      storageWarning = null
    }
  }

  loadPersisted()

  // --- small helpers -------------------------------------------------------

  function configured(): boolean {
    return source !== null && source.configured === true
  }

  function installerConfigured(): boolean {
    return source !== null && typeof source.installPack === 'function'
  }

  function uninstallerConfigured(): boolean {
    return typeof uninstallHook === 'function'
  }

  function busy(): boolean {
    return refreshing || uninstalling || progress !== null
  }

  function notify(): void {
    if (destroyed) return
    try {
      onChange?.()
    } catch {
      // A host render callback must never be able to break the state machine.
    }
  }

  function installedFor(packId: string): MarketInstalledRecord | undefined {
    return installed.find((record) => record.packId === packId)
  }

  function lockFor(packId: string): MarketVersionLockRecord | undefined {
    return locks.find((record) => record.packId === packId)
  }

  function catalogPack(packId: string): ContentMarketPack | null {
    if (catalog === null) return null
    return catalog.packs.find((pack) => pack.id === packId) ?? null
  }

  function markFailure(
    stage: MarketInstallFailureStage,
    code: string,
    message: string,
    packId: string | null,
    retryable: boolean,
  ): MarketInstallFailure {
    return Object.freeze({ code, message, stage, packId, retryable })
  }

  // --- state ---------------------------------------------------------------

  function buildRow(packId: string): MarketInstallRow | null {
    const pack = catalogPack(packId)
    const record = installedFor(packId)
    const lock = lockFor(packId)
    if (pack === null && record === undefined) return null
    const name = pack?.name ?? record?.name ?? packId
    const description = pack?.description ?? '已安装的远程内容（当前市场目录未列出）。'
    const marketVersion = pack?.version ?? null
    const installedVersion = record?.version ?? null
    const lockedVersion = lock?.version ?? null
    const updateAvailable =
      installedVersion !== null && marketVersion !== null && marketVersion !== installedVersion
    let installDisabledReason: string | null = null
    if (pack === null) installDisabledReason = '当前已验签目录未列出该包，无法安装/更新。'
    else if (busy()) installDisabledReason = REASON.busy
    else if (!configured()) installDisabledReason = REASON.unconfigured
    else if (verifyDeps === null) installDisabledReason = REASON.noVerify
    else if (!installerConfigured()) installDisabledReason = REASON.noInstaller
    else if (offline) installDisabledReason = REASON.offline
    else if (catalog === null) installDisabledReason = REASON.noCatalog
    else if (lockedVersion !== null && marketVersion !== lockedVersion) {
      installDisabledReason = '已锁定 v' + lockedVersion + '：安装 v' + marketVersion + ' 前请先解锁。'
    } else if (installedVersion !== null && marketVersion === installedVersion) {
      installDisabledReason = REASON.installed
    }
    const offered = pack !== null
    return Object.freeze({
      packId,
      name,
      description,
      marketVersion,
      installedVersion,
      lockedVersion,
      updateAvailable,
      offered,
      installDisabledReason,
      canInstall: pack !== null && installDisabledReason === null,
      canUninstall: record !== undefined && uninstallerConfigured() && !busy(),
      canLock: record !== undefined && lock === undefined && !busy(),
      canUnlock: lock !== undefined && !busy(),
    })
  }

  function pendingConfirmation(): MarketInstallConfirmation | null {
    if (pending === null) return null
    return Object.freeze({
      packId: pending.id,
      name: pending.name,
      version: pending.version,
      description: pending.description,
      bytes: pending.download.bytes,
      usageStatement: confirmationCopy.statement,
      statementRef: confirmationCopy.statementRef,
      usageSha256: confirmationCopy.sha256,
      prohibitedUses: confirmationCopy.prohibitedUses,
    })
  }

  function statusOf(): MarketInstallStatus {
    if (!configured()) return 'unconfigured'
    if (refreshing) return 'refreshing'
    if (progress !== null) return 'installing'
    if (uninstalling) return 'uninstalling'
    if (pending !== null) return 'awaiting-confirmation'
    if (failure !== null) return failure.code === MARKET_INSTALL_CANCELLED_CODE ? 'cancelled' : 'failed'
    if (offline) return 'offline'
    return 'idle'
  }

  function busyLabel(): string | null {
    if (refreshing) return '正在刷新市场目录…'
    if (uninstalling) return '正在卸载…'
    if (progress !== null) return '第 ' + progress.step + '/' + progress.totalSteps + ' 步：' + progress.label
    return null
  }

  function state(): MarketInstallUiState {
    const rowIds: string[] = []
    if (catalog !== null) {
      for (const pack of catalog.packs) rowIds.push(pack.id)
    }
    for (const record of installed) {
      if (!rowIds.includes(record.packId)) rowIds.push(record.packId)
    }
    const rows: MarketInstallRow[] = []
    for (const packId of rowIds) {
      const row = buildRow(packId)
      if (row !== null) rows.push(row)
    }
    const orderedInstalled = [...installed].sort((left, right) => left.packId.localeCompare(right.packId))
    const orderedLocks = [...locks].sort((left, right) => left.packId.localeCompare(right.packId))
    return freezeState({
      status: statusOf(),
      available: source !== null,
      configured: configured(),
      sourceLabel: source?.label ?? null,
      offline,
      offlineReason,
      canRefresh: configured() && verifyDeps !== null && !busy(),
      refreshing,
      verifyConfigured: verifyDeps !== null,
      installerConfigured: installerConfigured(),
      uninstallerConfigured: uninstallerConfigured(),
      catalogVersion,
      catalogUpdatedAt,
      rows: Object.freeze(rows),
      installed: Object.freeze(orderedInstalled),
      locks: Object.freeze(orderedLocks),
      confirmation: pendingConfirmation(),
      progress,
      failure,
      busy: busy(),
      busyLabel: busyLabel(),
      storageWarning,
    })
  }

  // --- action results ------------------------------------------------------

  function success(message: string): MarketInstallActionResult {
    return Object.freeze({ ok: true, message })
  }

  function failureResult(code: string, message: string): MarketInstallActionResult {
    return Object.freeze({ ok: false, message, code })
  }

  function setProgress(stage: MarketInstallStage, packId: string | null, bytes: number | null): void {
    const index = (['catalog', 'download', 'verify', 'install'] as const).indexOf(stage)
    progress = Object.freeze({
      stage,
      step: index + 1,
      totalSteps: CONTENT_MARKET_INSTALL_TOTAL_STEPS,
      label: CONTENT_MARKET_INSTALL_STEPS[index] ?? stage,
      packId,
      bytes,
      // Once the host install callback starts, cancellation cannot undo the
      // write, so the UI must not pretend it can be cancelled.
      cancellable: abortController !== null && stage !== 'install',
    })
    notify()
  }

  function clearOperationState(): void {
    progress = null
    refreshing = false
    uninstalling = false
    abortController = null
  }

  function abortActive(): void {
    const controller = abortController
    if (controller === null) return
    try {
      controller.abort()
    } catch {
      // ignore
    }
  }

  // --- installed/locks mutations ------------------------------------------

  function recordInstalled(pack: ContentMarketPack): void {
    const record: MarketInstalledRecord = Object.freeze({
      packId: pack.id,
      name: pack.name,
      version: pack.version,
      installedAt: now(),
      sourceId: source?.id ?? 'unknown',
    })
    const next = installed.filter((candidate) => candidate.packId !== pack.id)
    next.push(record)
    installed = Object.freeze(next)
    // A lock that pinned a different version is meaningless after an explicit
    // update; the UI only allows updates after the user unlocked, so this is a
    // defensive cleanup rather than a silent policy.
    locks = Object.freeze(locks.filter((lock) => lock.packId !== pack.id || lock.version === pack.version))
    persist()
  }

  function removeInstalled(packId: string): void {
    installed = Object.freeze(installed.filter((record) => record.packId !== packId))
    locks = Object.freeze(locks.filter((lock) => lock.packId !== packId))
    persist()
  }

  // --- refresh -------------------------------------------------------------

  function refreshPreconditions(): MarketInstallActionResult | null {
    if (source === null) return failureResult('not-configured', REASON.noSource)
    if (!configured()) {
      return failureResult('not-configured', '远程市场未配置：不会发起任何网络请求。')
    }
    if (verifyDeps === null) return failureResult('verify-unconfigured', REASON.noVerify)
    if (busy()) return failureResult('busy', REASON.busy)
    return null
  }

  async function refresh(): Promise<MarketInstallActionResult> {
    if (destroyed) return failureResult('destroyed', '角色与内容中心已关闭。')
    const blocked = refreshPreconditions()
    if (blocked !== null) return blocked
    const activeSource = source
    if (activeSource === null) return failureResult('not-configured', REASON.noSource)
    const deps = verifyDeps
    if (deps === null) return failureResult('verify-unconfigured', REASON.noVerify)
    refreshing = true
    failure = null
    failPackId = null
    const controller = new AbortController()
    abortController = controller
    setProgress('catalog', null, null)
    try {
      const raw = await activeSource.fetchCatalog({ signal: controller.signal })
      if (controller.signal.aborted) return cancelledResult('catalog', null)
      const validation = validateMarketCatalog(raw)
      if (!validation.ok) {
        failure = markFailure('catalog', 'catalog-invalid', '市场目录未通过严格校验（' + validation.issues.length + ' 个问题），已拒绝。', null, false)
        return failureResult('catalog-invalid', failure.message)
      }
      const verification = activeSource.verifyCatalog(validation.catalog, deps)
      if (!verification.ok) {
        failure = markFailure('catalog', verification.code, '市场目录验签失败：' + verification.message, null, false)
        return failureResult(verification.code, failure.message)
      }
      catalog = validation.catalog
      catalogVersion = validation.catalog.version
      catalogUpdatedAt = validation.catalog.updatedAt
      offline = false
      offlineReason = null
      progress = null
      notify()
      const packCount = validation.catalog.packs.length
      return success('已验签市场目录 v' + validation.catalog.version + '（' + packCount + ' 个内容包）；安装仍需逐包确认统一用途声明。')
    } catch (error) {
      if (isAbortError(error, controller.signal)) return cancelledResult('catalog', null)
      const code = errorCodeOf(error) ?? 'internal-error'
      const message = describeFailureCode(code)
      // Only transport-level failures mean "offline"; a reachable server that
      // returned a bad signature must not leave a stale offline banner behind.
      offline = isOfflineFailureCode(code)
      offlineReason = offline ? message : null
      failure = markFailure('catalog', code, message, null, isRetryableFailureCode(code))
      return failureResult(code, message)
    } finally {
      refreshing = false
      progress = null
      abortController = null
      notify()
    }
  }

  function cancelledResult(stage: MarketInstallFailureStage, packId: string | null): MarketInstallActionResult {
    failure = markFailure(stage, MARKET_INSTALL_CANCELLED_CODE, '已取消：未安装任何内容，也没有留下部分文件；可重试。', packId, true)
    failPackId = packId
    progress = null
    retained = null
    return failureResult(MARKET_INSTALL_CANCELLED_CODE, failure.message)
  }

  // --- install -------------------------------------------------------------

  function requestInstall(packId: string): MarketInstallActionResult {
    if (destroyed) return failureResult('destroyed', '角色与内容中心已关闭。')
    if (busy()) return failureResult('busy', REASON.busy)
    if (!configured()) return failureResult('not-configured', REASON.unconfigured)
    if (verifyDeps === null) return failureResult('verify-unconfigured', REASON.noVerify)
    if (!installerConfigured()) return failureResult('install-unconfigured', REASON.noInstaller)
    if (offline) return failureResult('offline', REASON.offline)
    const pack = catalogPack(packId)
    if (pack === null) return failureResult('pack-not-in-catalog', '内容包不在已验签的市场目录中，无法安装。')
    const lock = lockFor(packId)
    if (lock !== undefined && lock.version !== pack.version) {
      return failureResult('version-locked', '已锁定 v' + lock.version + '：先解除版本锁才能安装 v' + pack.version + '。')
    }
    const record = installedFor(packId)
    if (record !== undefined && record.version === pack.version) return failureResult('already-installed', REASON.installed)
    pending = pack
    failure = null
    failPackId = null
    notify()
    return success('安装前请阅读统一用途声明并确认：' + pack.name + ' v' + pack.version + '（' + pack.download.bytes + ' 字节）。')
  }

  function cancelPendingInstall(): void {
    if (pending === null) return
    pending = null
    notify()
  }

  async function confirmInstall(): Promise<MarketInstallActionResult> {
    if (destroyed) return failureResult('destroyed', '角色与内容中心已关闭。')
    const pack = pending
    if (pack === null) return failureResult('no-pending-install', '没有待确认的安装。')
    if (busy()) return failureResult('busy', REASON.busy)
    const blocked = refreshPreconditions()
    // refreshPreconditions() returns busy/no-source/no-verify; for install the
    // catalog must also be present (requestInstall() guarantees it).
    if (blocked !== null && blocked.code !== 'busy') return blocked
    pending = null
    return runInstall(pack, false)
  }

  async function runInstall(pack: ContentMarketPack, reuseRetained: boolean): Promise<MarketInstallActionResult> {
    const activeSource = source
    const deps = verifyDeps
    if (activeSource === null) return failureResult('not-configured', REASON.noSource)
    if (deps === null) return failureResult('verify-unconfigured', REASON.noVerify)
    const installHook = activeSource.installPack
    if (typeof installHook !== 'function') {
      failure = markFailure('install', 'install-unconfigured', REASON.noInstaller, pack.id, false)
      failPackId = pack.id
      notify()
      return failureResult('install-unconfigured', REASON.noInstaller)
    }
    refreshing = false
    failure = null
    failPackId = null
    const controller = new AbortController()
    abortController = controller
    let bundle: ArrayBuffer | null = null
    let sha256 = ''
    try {
      if (reuseRetained && retained !== null && retained.pack.id === pack.id && retained.pack.version === pack.version) {
        bundle = retained.bytes
        sha256 = retained.sha256
      } else {
        setProgress('download', pack.id, null)
        const downloaded = await activeSource.fetchPackBytes(pack, { signal: controller.signal })
        if (controller.signal.aborted) return cancelledResult('download', pack.id)
        if (!(downloaded instanceof ArrayBuffer)) {
          failure = markFailure('download', 'download-invalid', '下载结果不是有效的字节缓冲区，已拒绝。', pack.id, true)
          failPackId = pack.id
          notify()
          return failureResult('download-invalid', failure.message)
        }
        if (downloaded.byteLength <= 0 || downloaded.byteLength > CONTENT_MARKET_INSTALL_MAX_PACK_BYTES) {
          failure = markFailure('verify', 'too-large', '下载大小越界（' + downloaded.byteLength + ' 字节），已拒绝。', pack.id, false)
          failPackId = pack.id
          notify()
          return failureResult('too-large', failure.message)
        }
        if (downloaded.byteLength !== pack.download.bytes) {
          failure = markFailure(
            'verify',
            'size-mismatch',
            '下载大小 ' + downloaded.byteLength + ' 字节与已验签目录声明的 ' + pack.download.bytes + ' 字节不一致，已拒绝。',
            pack.id,
            false,
          )
          failPackId = pack.id
          notify()
          return failureResult('size-mismatch', failure.message)
        }
        setProgress('verify', pack.id, downloaded.byteLength)
        sha256 = await sha256Hex(downloaded)
        if (controller.signal.aborted) return cancelledResult('verify', pack.id)
        if (sha256 !== pack.download.zipSha256) {
          failure = markFailure('verify', 'hash-mismatch', 'SHA-256 与已验签目录不一致，已拒绝。', pack.id, false)
          failPackId = pack.id
          notify()
          return failureResult('hash-mismatch', failure.message)
        }
        const packVerification = activeSource.verifyPack(pack, sha256, deps)
        if (!packVerification.ok) {
          failure = markFailure('verify', packVerification.code, '内容包验签失败：' + packVerification.message, pack.id, false)
          failPackId = pack.id
          notify()
          return failureResult(packVerification.code, failure.message)
        }
        bundle = downloaded
        retained = Object.freeze({ pack, bytes: downloaded, sha256 })
      }
      if (bundle === null) {
        failure = markFailure('install', 'install-failed', '没有可安装的下载字节（已清理），请重试下载。', pack.id, true)
        failPackId = pack.id
        notify()
        return failureResult('install-failed', failure.message)
      }
      setProgress('install', pack.id, bundle.byteLength)
      if (controller.signal.aborted) return cancelledResult('install', pack.id)
      await installHook(pack, bundle)
      // The host callback owns the atomic write: once it resolves, the pack IS
      // installed and must be recorded even if destroy()/abort raced with it.
      recordInstalled(pack)
      retained = null
      failPackId = null
      failure = null
      progress = null
      notify()
      return success('已安装并验签：' + pack.name + ' v' + pack.version + '（' + bundle.byteLength + ' 字节）。远程内容仅限研究与原型验证用途。')
    } catch (error) {
      if (isAbortError(error, controller.signal)) return cancelledResult(progress?.stage ?? 'download', pack.id)
      // Attribute the throw to the stage that was actually running (progress is
      // still set inside this catch). A host installer throw = install-failed;
      // anything earlier = download-failed (unknown), never silently "installed".
      const stage: MarketInstallStage = progress?.stage ?? 'download'
      const code = errorCodeOf(error) ?? (stage === 'install' ? 'install-failed' : 'download-failed')
      const message = describeFailureCode(code) + '：' + errorMessageOf(error).slice(0, 120)
      failure = markFailure(stage, code, message, pack.id, isRetryableFailureCode(code))
      failPackId = pack.id
      notify()
      return failureResult(code, message)
    } finally {
      clearOperationState()
      notify()
    }
  }

  // --- recovery ------------------------------------------------------------

  async function retry(): Promise<MarketInstallActionResult> {
    if (destroyed) return failureResult('destroyed', '角色与内容中心已关闭。')
    const current = failure
    if (current === null) return failureResult('no-failure', '当前没有可重试的失败。')
    if (!current.retryable) return failureResult('not-retryable', '该失败不可重试：请清理失败状态后重新选择安装。')
    if (busy()) return failureResult('busy', REASON.busy)
    if (current.stage === 'catalog') return refresh()
    if (current.stage === 'uninstall') {
      const packId = current.packId
      if (packId === null) return failureResult('no-failure', '没有可重试的卸载。')
      return uninstall(packId)
    }
    const packId = current.packId ?? failPackId
    if (packId === null) return refresh()
    const pack = catalogPack(packId)
    if (pack === null) {
      failure = markFailure('catalog', 'pack-not-in-catalog', '该内容包已不在当前已验签目录中，无法重试；请清理后刷新目录。', packId, false)
      notify()
      return failureResult('pack-not-in-catalog', failure.message)
    }
    failure = null
    const reuseRetained = current.stage === 'install' && retained !== null
    return runInstall(pack, reuseRetained)
  }

  function clearFailure(): void {
    failure = null
    failPackId = null
    retained = null
    notify()
  }

  // --- cancel --------------------------------------------------------------

  function cancel(): MarketInstallActionResult {
    if (pending !== null && !busy()) {
      pending = null
      notify()
      return success('已取消安装（未下载任何内容）。')
    }
    if (!busy()) return failureResult('not-running', '当前没有正在进行的市场操作。')
    if (uninstalling) {
      return failureResult('not-cancellable', '卸载已开始：卸载会原子完成，完成后会显示结果。')
    }
    if (progress !== null && progress.stage === 'install') {
      return failureResult('not-cancellable', '已进入本机落盘安装阶段：无法取消，完成后会显示结果。')
    }
    abortActive()
    // The await in refresh()/runInstall() observes the signal and records the
    // cancelled failure state; the caller re-renders immediately.
    return success('正在取消…')
  }

  // --- uninstall -----------------------------------------------------------

  async function uninstall(packId: string): Promise<MarketInstallActionResult> {
    if (destroyed) return failureResult('destroyed', '角色与内容中心已关闭。')
    if (busy()) return failureResult('busy', REASON.busy)
    const record = installedFor(packId)
    if (record === undefined) return failureResult('not-installed', '没有找到该远程内容包的安装记录。')
    if (typeof uninstallHook !== 'function') return failureResult('uninstall-unavailable', '宿主未注入卸载入口：无法卸载该远程内容包。')
    uninstalling = true
    failure = null
    failPackId = null
    notify()
    try {
      const outcome = await uninstallHook(record)
      if (!outcome || outcome.ok !== true) {
        const message = outcome && typeof outcome.message === 'string' ? outcome.message : '卸载失败。'
        failure = markFailure('uninstall', 'uninstall-failed', message, packId, true)
        failPackId = packId
        notify()
        return failureResult('uninstall-failed', message)
      }
      removeInstalled(packId)
      notify()
      const message = typeof outcome.message === 'string' && outcome.message.trim() !== '' ? outcome.message : '已卸载该远程内容包（安装记录与版本锁已删除）。'
      return success(message)
    } catch (error) {
      const message = '卸载失败：' + errorMessageOf(error).slice(0, 120)
      failure = markFailure('uninstall', 'uninstall-failed', message, packId, true)
      failPackId = packId
      notify()
      return failureResult('uninstall-failed', message)
    } finally {
      uninstalling = false
      notify()
    }
  }

  // --- version lock --------------------------------------------------------

  function lockVersion(packId: string): MarketInstallActionResult {
    if (destroyed) return failureResult('destroyed', '角色与内容中心已关闭。')
    if (busy()) return failureResult('busy', REASON.busy)
    const record = installedFor(packId)
    if (record === undefined) return failureResult('not-installed', '只能锁定已安装的版本。')
    if (lockFor(packId) !== undefined) return success('该内容包已锁定 v' + record.version + '。')
    const next = [...locks, Object.freeze({ packId, version: record.version, lockedAt: now() })]
    locks = Object.freeze(next)
    persist()
    notify()
    return success('已锁定 v' + record.version + '：安装其他版本前必须先解锁（本 UI 不会静默更新）。')
  }

  function unlockVersion(packId: string): MarketInstallActionResult {
    if (destroyed) return failureResult('destroyed', '角色与内容中心已关闭。')
    if (busy()) return failureResult('busy', REASON.busy)
    const lock = lockFor(packId)
    if (lock === undefined) return success('该内容包没有版本锁。')
    locks = Object.freeze(locks.filter((record) => record.packId !== packId))
    persist()
    notify()
    return success('已解除版本锁 v' + lock.version + '：现在可以显式安装市场中的其他版本。')
  }

  // --- lifecycle -----------------------------------------------------------

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    abortActive()
    pending = null
    retained = null
    progress = null
  }

  return Object.freeze({
    state,
    refresh,
    requestInstall,
    cancelPendingInstall,
    confirmInstall,
    cancel,
    retry,
    clearFailure,
    uninstall,
    lockVersion,
    unlockVersion,
    destroy,
  })
}
