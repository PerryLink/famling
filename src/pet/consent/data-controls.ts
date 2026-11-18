/**
 * User data controls (P0, review-2026-11-17 02-privacy-data R-P0-06):
 *
 * 1. `runWithdrawConsentFlow()` — About/settings entry with TWO explicit
 *    confirmations, then stop processing/voice, clear the persisted TOS
 *    acceptance and the current session's TTS/ASR confirmations, and enter the
 *    safe read-only screen (re-consent or exit). Saves/memory are NOT deleted.
 * 2. `runDeleteAllLocalDataFlow()` — lists the deletion scope, TWO explicit
 *    confirmations, stops processing, clears the runtime consent state, then
 *    deletes every listed app-managed item and verifies it. Failures and
 *    unverifiable items are reported as residual/unverified; the function never
 *    claims success for quota/Rust files it cannot verify. User-exported files
 *    (backups, memory exports, audit exports) and the user's own Advisers brief
 *    are deliberately OUT of scope and are never deleted.
 *
 * The module is DOM-free: storage and the Tauri file commands are injected, so
 * Node tests can prove the deletion/verification matrix without a browser. The
 * browser wiring (confirm dialogs, Tauri `invoke`) lives in `consent/runtime.ts`.
 */
import { ACCEPTANCE_STORAGE_KEY, AUDIT_STORAGE_KEY, type StorageLike } from './core.ts'
import { AGE_STORAGE_KEY } from './age.ts'
import {
  SAFETY_AUDIT_SALT_KEY,
  SAFETY_AUDIT_STORAGE_KEY,
} from './safety-audit.ts'

/** Only app-managed pet keys are in scope; other games' data is left alone. */
export const PET_STORAGE_PREFIXES = ['desktop-games/pet/', 'desktop-games/consent/'] as const

/** Enumerable browser storage (real localStorage exposes length + key()). */
export interface DataControlStorage extends StorageLike {
  removeItem(key: string): void
  readonly length?: number
  key?(index: number): string | null
}

export type DataControlStatus = 'deleted' | 'residual' | 'unverified' | 'excluded'

export interface DataControlItem {
  readonly id: string
  readonly label: string
  readonly status: DataControlStatus
  readonly detail?: string
}

export interface DeleteAllResult {
  readonly at: string
  readonly items: readonly DataControlItem[]
  /** True only when every in-scope, app-managed item was deleted AND verified. */
  readonly complete: boolean
  /** Concrete leftovers (still present or host command failed). */
  readonly residual: readonly string[]
  /** Deleted/attempted but not independently verifiable from the web layer. */
  readonly unverified: readonly string[]
}

export interface DataControlHost {
  /** Tauri `delete_save` (save + .bak + .tmp). */
  deleteSave(slot: string): Promise<void>
  /** Verify the save file/backup are gone (e.g. `read_save` rejects). */
  isSaveGone(slot: string): Promise<boolean>
  /** Tauri `voice_cache_clear` (removes the WAV cache directory). */
  clearVoiceCache(): Promise<void>
}

export interface DeleteAllOptions {
  /** Browser/Tauri WebView localStorage; `null` means unavailable. */
  readonly storage?: DataControlStorage | null
  /** Tauri file commands; `null`/absent means browser-only mode. */
  readonly host?: DataControlHost | null
  readonly saveSlot?: string
  readonly now?: () => Date
  /** Clear in-memory/gate state (must run before storage deletion). */
  readonly resetRuntimeState?: () => void | Promise<void>
  /** Tauri `voice/quota.json` has no clear command in this build. Default true. */
  readonly hostQuotaResidual?: boolean
}

/** Known keys, used when a storage object cannot enumerate `key(i)`. */
export const KNOWN_PET_STORAGE_KEYS = [
  'desktop-games/pet/pet',
  'desktop-games/pet/pet.bak',
  'desktop-games/pet/chat-import/v1',
  'desktop-games/pet/volume',
  'desktop-games/pet/hero',
  'desktop-games/pet/heroCharacter',
  'desktop-games/pet/scale',
  'desktop-games/pet/text-scale',
  'desktop-games/pet/setup-ack-v1',
  'desktop-games/pet/advisers-mode',
  'desktop-games/pet/window',
  'desktop-games/consent/storage-probe-v1',
  ACCEPTANCE_STORAGE_KEY,
  AUDIT_STORAGE_KEY,
  AGE_STORAGE_KEY,
  SAFETY_AUDIT_STORAGE_KEY,
  SAFETY_AUDIT_SALT_KEY,
] as const

export const DATA_ITEM_LABELS: Readonly<Record<string, string>> = {
  save: '存档、备份与记忆/折页/状态',
  'chat-digest': '导入的 DeepSeek 分享摘要',
  preferences: '偏好设置（音量/缩放/窗口位置/页面开关）',
  'window-position': '窗口位置',
  'consent-acceptance': 'TOS 同意记录',
  'consent-audit': '同意审计记录',
  'age-verification': '年龄核验记录（自报出生日期与核验时间）',
  'safety-audit': '安全审核记录（不含原文）',
  'tts-cache': 'TTS 音频缓存（Tauri 本机）',
  'tts-quota': 'TTS 每日用量计数 quota.json（Tauri 本机）',
  'other-pet': '其他本机桌宠数据',
  'runtime-state': '当前会话内存状态',
  'webview-profile': 'WebView2 配置/缓存目录（非应用管理）',
  'user-exports': '用户导出的外部文件（备份/折页/审核导出）',
}

interface MutableItem {
  readonly id: string
  readonly label: string
  status: DataControlStatus
  readonly details: string[]
}

function ensureItem(itemMap: Map<string, MutableItem>, id: string): MutableItem {
  const existing = itemMap.get(id)
  if (existing) return existing
  const created: MutableItem = { id, label: DATA_ITEM_LABELS[id] ?? id, status: 'deleted', details: [] }
  itemMap.set(id, created)
  return created
}

function clampStatus(target: MutableItem, status: DataControlStatus): void {
  const rank: Record<DataControlStatus, number> = { deleted: 0, excluded: 1, unverified: 2, residual: 3 }
  if (rank[status] > rank[target.status]) target.status = status
}

function resolveBrowserStorage(): DataControlStorage | null {
  try {
    if (typeof globalThis === 'undefined') return null
    const candidate = (globalThis as { localStorage?: DataControlStorage }).localStorage
    if (!candidate || typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') return null
    if (typeof candidate.removeItem !== 'function') return null
    return candidate
  } catch {
    return null
  }
}

/** Classify a storage key into a user-facing deletion item. */
export function classifyStorageKey(key: string): string {
  if (key === ACCEPTANCE_STORAGE_KEY) return 'consent-acceptance'
  if (key === AUDIT_STORAGE_KEY) return 'consent-audit'
  if (key === AGE_STORAGE_KEY) return 'age-verification'
  if (key === SAFETY_AUDIT_STORAGE_KEY || key === SAFETY_AUDIT_SALT_KEY) return 'safety-audit'
  if (key.startsWith('desktop-games/pet/chat-import')) return 'chat-digest'
  if (key === 'desktop-games/pet/pet' || key === 'desktop-games/pet/pet.bak') return 'save'
  if (key === 'desktop-games/pet/window') return 'window-position'
  if (key === 'desktop-games/pet/volume') return 'preferences'
  if (key === 'desktop-games/pet/hero') return 'preferences'
  if (key === 'desktop-games/pet/heroCharacter') return 'preferences'
  if (key === 'desktop-games/pet/scale') return 'preferences'
  if (key === 'desktop-games/pet/text-scale') return 'preferences'
  if (key === 'desktop-games/pet/setup-ack-v1') return 'preferences'
  if (key === 'desktop-games/pet/advisers-mode') return 'preferences'
  if (key.startsWith('desktop-games/pet/')) return 'other-pet'
  if (key.startsWith('desktop-games/consent/')) return 'consent-audit'
  return 'unrelated'
}

export interface StorageKeyListing {
  readonly keys: string[]
  /** False when `key(i)` enumeration is unavailable (known keys only). */
  readonly enumerable: boolean
}

/** List app-relevant keys: enumerated when possible, plus all known keys. */
export function listPetStorageKeys(storage: DataControlStorage): StorageKeyListing {
  const keys = new Set<string>()
  let enumerable = false
  if (typeof storage.key === 'function' && typeof storage.length === 'number' && storage.length >= 0) {
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (typeof key === 'string' && key) {
          keys.add(key)
          enumerable = true
        }
      }
      enumerable = true
    } catch {
      enumerable = false
    }
  }
  for (const known of KNOWN_PET_STORAGE_KEYS) {
    try {
      if (storage.getItem(known) !== null) keys.add(known)
    } catch {
      /* unreadable key: keep going; verification below reports what it can */
    }
  }
  return { keys: [...keys].filter((key) => PET_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))), enumerable }
}

/** Local keys are the only data this module deletes without a host command. */
async function deleteBrowserKeys(
  storage: DataControlStorage | null,
  itemMap: Map<string, MutableItem>,
  residual: string[],
  unverified: string[],
): Promise<void> {
  for (const id of [
    'save',
    'chat-digest',
    'preferences',
    'window-position',
    'consent-acceptance',
    'consent-audit',
    'age-verification',
    'safety-audit',
    'other-pet',
  ]) {
    ensureItem(itemMap, id)
  }
  if (!storage) {
    const detail = '本机 Web Storage（localStorage）不可用：无法读取、删除或核验这些数据。'
    for (const id of ['save', 'chat-digest', 'preferences', 'window-position', 'consent-acceptance', 'consent-audit', 'age-verification', 'safety-audit', 'other-pet']) {
      const item = itemMap.get(id)!
      item.status = 'unverified'
      item.details.push(detail)
      unverified.push(`localStorage: ${item.label}`)
    }
    return
  }
  const before = listPetStorageKeys(storage)
  const touched = new Set<string>()
  for (const key of before.keys) {
    touched.add(key)
    try {
      storage.removeItem(key)
    } catch {
      residual.push(`localStorage[${key}]: 删除失败（存储可能被锁定/只读）`)
    }
  }
  const after = listPetStorageKeys(storage)
  const remaining = new Set(after.keys)
  const stillPresent = new Set<string>()
  for (const key of touched) {
    let stillThere = remaining.has(key)
    try {
      if (storage.getItem(key) !== null) stillThere = true
    } catch {
      stillThere = true
    }
    if (stillThere) {
      stillPresent.add(key)
      remaining.add(key)
      residual.push(`localStorage[${key}]: 删除后仍然存在`)
    }
  }
  // Per-item status: an item is `deleted` only if none of its keys remain.
  for (const key of touched) {
    const item = ensureItem(itemMap, classifyStorageKey(key))
    if (stillPresent.has(key)) {
      item.details.push(`${key} 删除失败或删除后仍存在`)
      continue
    }
    item.details.push(key.startsWith('desktop-games/pet/chat-import') ? '导入摘要键已清除' : `${key} 已删除并核验`)
  }
  for (const key of remaining) {
    const id = classifyStorageKey(key)
    const item = itemMap.get(id)
    if (item) clampStatus(item, 'residual')
  }
  // Additions from a concurrent writer are surfaced, not silently ignored.
  for (const key of after.keys) {
    if (touched.has(key)) continue
    const id = classifyStorageKey(key)
    const item = itemMap.get(id)
    if (item) {
      clampStatus(item, 'unverified')
      item.details.push(`删除后出现未知键 ${key}，未能删除/核验`)
      unverified.push(`localStorage[${key}]: 删除过程中新增，未纳入删除`)
    }
  }
  if (!before.enumerable) {
    const detail = '存储不支持键枚举：仅核验已知键，未知的本机键无法确认。'
    const item = ensureItem(itemMap, 'other-pet')
    clampStatus(item, 'unverified')
    item.details.push(detail)
    unverified.push('localStorage: 未知键无法枚举核验')
  }
}

async function deleteHostFiles(
  host: DataControlHost,
  saveSlot: string,
  itemMap: Map<string, MutableItem>,
  residual: string[],
  unverified: string[],
  hostQuotaResidual: boolean,
): Promise<void> {
  const save = itemMap.get('save')!
  try {
    await host.deleteSave(saveSlot)
    let gone = false
    try {
      gone = await host.isSaveGone(saveSlot)
    } catch {
      gone = false
    }
    if (gone) {
      save.details.push('Tauri 存档/备份/临时文件已删除，并用 read_save 核验不存在')
    } else {
      clampStatus(save, 'residual')
      save.details.push('delete_save 已调用，但核验仍能读取存档/备份')
      residual.push('Tauri 存档: delete_save 后核验仍可读取')
    }
  } catch (error) {
    clampStatus(save, 'residual')
    save.details.push('Tauri delete_save 失败')
    residual.push(`Tauri 存档: delete_save 失败（${errorMessage(error)}）`)
  }

  const cache: MutableItem = itemMap.set('tts-cache', {
    id: 'tts-cache',
    label: DATA_ITEM_LABELS['tts-cache']!,
    status: 'deleted',
    details: [],
  }).get('tts-cache')!
  try {
    await host.clearVoiceCache()
    // The web layer has no way to list/verify the WAV cache directory: report
    // host-reported clear as UNVERIFIED instead of claiming success.
    clampStatus(cache, 'unverified')
    cache.details.push('voice_cache_clear 已返回成功；前端无法列出/核验 WAV 缓存文件')
    unverified.push('TTS 音频缓存: 宿主报告已清除，未独立核验')
  } catch (error) {
    clampStatus(cache, 'residual')
    cache.details.push('voice_cache_clear 失败')
    residual.push(`TTS 音频缓存: voice_cache_clear 失败（${errorMessage(error)}）`)
  }

  const quota: MutableItem = itemMap.set('tts-quota', {
    id: 'tts-quota',
    label: DATA_ITEM_LABELS['tts-quota']!,
    status: 'deleted',
    details: [],
  }).get('tts-quota')!
  if (hostQuotaResidual) {
    clampStatus(quota, 'residual')
    quota.details.push('本版本 Rust 侧未提供清除 voice/quota.json 的命令；文件仍留在本机')
    residual.push('TTS 用量计数 quota.json: 当前无 Rust 清除命令，文件仍保留（需 Rust 侧补齐或手动清理）')
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 160)
  return String(error ?? 'unknown').slice(0, 160)
}

/**
 * Delete every listed app-managed local item and verify it. Never throws for
 * individual failures: they are reported as residual, and `complete` stays
 * false. The caller must have the user's explicit (2-step) confirmation first.
 */
export async function deleteAllLocalData(options: DeleteAllOptions = {}): Promise<DeleteAllResult> {
  const at = (options.now ?? (() => new Date()))().toISOString()
  const itemMap = new Map<string, MutableItem>()
  const residual: string[] = []
  const unverified: string[] = []
  const ensure = (id: string): MutableItem => ensureItem(itemMap, id)

  ensure('save')
  ensure('chat-digest')
  ensure('preferences')
  ensure('window-position')
  ensure('consent-acceptance')
  ensure('consent-audit')
  ensure('age-verification')
  ensure('safety-audit')
  ensure('other-pet')

  // 1) Runtime memory/gate state first: prevents any writer from recreating the
  //    files between deletion and verification (and drops memory mirrors).
  const runtime = ensure('runtime-state')
  if (options.resetRuntimeState) {
    try {
      await options.resetRuntimeState()
      runtime.details.push('已清除当前会话内存状态/内存镜像')
    } catch (error) {
      clampStatus(runtime, 'residual')
      runtime.details.push('清除内存状态失败')
      residual.push(`当前会话内存状态: 清除失败（${errorMessage(error)}）`)
    }
  } else {
    clampStatus(runtime, 'unverified')
    runtime.details.push('未提供内存状态清理回调')
    unverified.push('当前会话内存状态: 未接入清理回调')
  }

  // 2) localStorage (browser and Tauri WebView both use it).
  const storage = options.storage === undefined ? resolveBrowserStorage() : options.storage
  await deleteBrowserKeys(storage, itemMap, residual, unverified)

  // 3) Tauri app-data files (only when the host port is injected).
  if (options.host) {
    await deleteHostFiles(
      options.host,
      options.saveSlot ?? 'pet',
      itemMap,
      residual,
      unverified,
      options.hostQuotaResidual !== false,
    )
  } else {
    const cache = ensure('tts-cache')
    cache.status = 'excluded'
    cache.details.push('浏览器模式没有 Tauri 本机 TTS 缓存')
    const quota = ensure('tts-quota')
    quota.status = 'excluded'
    quota.details.push('浏览器模式没有 Tauri quota.json')
  }

  // 4) Items we deliberately do NOT delete: user files must survive a wipe.
  itemMap.set('user-exports', {
    id: 'user-exports',
    label: DATA_ITEM_LABELS['user-exports']!,
    status: 'excluded',
    details: ['不删除你主动导出的外部文件；如需清除请自行删除下载目录中的文件'],
  })
  const profile = ensure('webview-profile')
  if (options.host) {
    // Exists only in the Tauri/WebView2 build and is NOT app-managed.
    profile.status = 'unverified'
    profile.details.push('WebView2 配置/缓存目录不属于应用可控数据：需系统或卸载时清理，本应用无法核验')
    unverified.push('WebView2 配置/缓存目录: 非应用管理，未清理也未核验')
  } else {
    profile.status = 'excluded'
    profile.details.push('浏览器模式没有 Tauri/WebView2 配置目录')
  }

  // Items with no matching keys were already absent: that counts as deleted.
  for (const item of itemMap.values()) {
    if (item.status === 'deleted' && item.details.length === 0) item.details.push('本机已无该项数据（核验为空）')
  }
  const items: DataControlItem[] = [...itemMap.values()].map((item) => ({
    id: item.id,
    label: item.label,
    status: item.status,
    ...(item.details.length > 0 ? { detail: item.details.join('；') } : {}),
  }))
  return {
    at,
    items,
    complete: residual.length === 0 && unverified.length === 0,
    residual,
    unverified,
  }
}

// ---------------------------------------------------------------------------
// Two-step confirmation copy + DOM-free orchestration
// ---------------------------------------------------------------------------

export interface DataControlConfirmCopy {
  readonly kicker: string
  readonly title: string
  readonly intro: string
  readonly bullets: readonly string[]
  readonly checkboxLabel?: string
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly footnote?: string
  readonly danger?: boolean
}

export type DataControlConfirm = (copy: DataControlConfirmCopy, step: 1 | 2) => Promise<boolean>

const WITHDRAW_CHECKBOX = '我已了解撤回的后果，并自愿撤回同意'

export const WITHDRAW_CONFIRM_STEPS: readonly [DataControlConfirmCopy, DataControlConfirmCopy] = [
  {
    kicker: 'DATA CONTROL · 撤回同意',
    title: '撤回同意？（第 1/2 步）',
    intro: '撤回后将立即：',
    bullets: [
      '清除本机保存的 TOS 同意记录，以及本次会话中的 TTS/ASR 确认；语音播放与录音会停止。',
      '进入安全只读模式：不加载或写入存档/内容、不播放 AI 语音、不获取麦克风；可重新阅读并同意，或退出应用。',
      '不会删除你的存档、记忆或导出文件；如要删除，请另行使用“删除全部本地数据”。',
      '同意审计记录可能保留，但只保留必要字段（时间/动作/版本/哈希/目标），可在“同意审计记录”中查看并清除。',
    ],
    checkboxLabel: WITHDRAW_CHECKBOX,
    confirmLabel: '继续（第 2/2 步确认）',
    cancelLabel: '取消，不撤回',
    footnote: '按 Escape 或点“取消”不会撤回同意。',
  },
  {
    kicker: 'DATA CONTROL · 撤回同意',
    title: '最后一次确认：撤回同意（第 2/2 步）',
    intro: '撤回后需重新阅读并同意完整 TOS 才能继续使用。此操作不删除存档/记忆；审计记录可随后在 About 中清除。',
    bullets: ['确认撤回：清除同意记录并进入安全只读。'],
    confirmLabel: '确认撤回同意',
    cancelLabel: '不撤回，返回',
    footnote: '两次确认后才会执行；执行后仍可重新同意。',
    danger: true,
  },
]

export const DELETE_CONFIRM_STEPS: readonly [DataControlConfirmCopy, DataControlConfirmCopy] = [
  {
    kicker: 'DATA CONTROL · 删除全部本地数据',
    title: '删除全部本地数据？（第 1/2 步）',
    intro: '删除范围（本应用管理的本机数据）：',
    bullets: [
      '存档、备份，以及存档中的记忆/折页/状态（Tauri 本机加密存档或浏览器 localStorage 存档）。',
      '导入的 DeepSeek 分享摘要；偏好设置（音量/缩放/窗口位置/页面开关）。',
      'TOS 同意记录与同意审计记录；年龄核验记录（自报出生日期与核验时间，仅本机）；安全审核记录（仅方向/类别/规则 ID/处置/时间/加盐哈希/长度，不含原文）。',
      'Tauri 本机 TTS 音频缓存；TTS 每日用量计数（quota）若没有清除命令，会作为“残留”如实列出。',
      '不删除你导出的外部文件（备份/折页/审核导出），也不删除 Advisers 简报等你自己的文件。',
      '删除后进入安全只读；无法删除或无法核验的项目会列入“残留/未核验”，不会谎报成功。',
    ],
    checkboxLabel: '我已了解删除范围，且未导出的数据将无法恢复',
    confirmLabel: '继续（第 2/2 步确认）',
    cancelLabel: '取消，不删除',
    footnote: '按 Escape 或点“取消”不会删除任何数据。',
  },
  {
    kicker: 'DATA CONTROL · 删除全部本地数据',
    title: '最后一次确认：删除不可恢复（第 2/2 步）',
    intro: '请确认已经导出需要保留的备份。删除结果会逐项列出，“残留/未核验”不会被说成成功。',
    bullets: ['确认后立即执行删除，并进入安全只读模式。'],
    confirmLabel: '确认删除全部本地数据',
    cancelLabel: '取消，不删除',
    footnote: '此操作不可由本应用撤销。',
    danger: true,
  },
]

export interface ConsentWithdrawer {
  withdrawConsent(): {
    readonly acceptanceCleared: boolean
    readonly auditRetained: number
    readonly sessionConsentCleared: boolean
    readonly mode: string
  }
}

export type WithdrawFlowResult =
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'withdrawn'
      readonly acceptanceCleared: boolean
      readonly auditRetained: number
      readonly sessionConsentCleared: boolean
    }

export interface WithdrawFlowDeps {
  readonly confirm: DataControlConfirm
  /** Stop TTS/ASR/hold-to-talk/audio before the state flips (may be async). */
  readonly stopProcessing: () => void | Promise<void>
  readonly withdraw: ConsentWithdrawer['withdrawConsent']
}

/** Two explicit confirmations -> stop processing -> clear consent records. */
export async function runWithdrawConsentFlow(deps: WithdrawFlowDeps): Promise<WithdrawFlowResult> {
  if (!(await deps.confirm(WITHDRAW_CONFIRM_STEPS[0], 1))) return { status: 'cancelled' }
  if (!(await deps.confirm(WITHDRAW_CONFIRM_STEPS[1], 2))) return { status: 'cancelled' }
  try {
    await deps.stopProcessing()
  } catch {
    /* stopping media is best effort; the gate still flips to read-only */
  }
  const result = deps.withdraw()
  return {
    status: 'withdrawn',
    acceptanceCleared: result.acceptanceCleared,
    auditRetained: result.auditRetained,
    sessionConsentCleared: result.sessionConsentCleared,
  }
}

export type DeleteFlowResult =
  | { readonly status: 'cancelled' }
  | { readonly status: 'deleted'; readonly result: DeleteAllResult }

export interface DeleteFlowDeps {
  readonly confirm: DataControlConfirm
  readonly stopProcessing: () => void | Promise<void>
  /** Clears gate memory mirrors BEFORE files are deleted (no post-wipe writes). */
  readonly wipeRuntimeState: () => void | Promise<void>
  readonly deleteAll: () => Promise<DeleteAllResult>
}

/** Two explicit confirmations -> stop/re-write-proof the runtime -> delete+verify. */
export async function runDeleteAllLocalDataFlow(deps: DeleteFlowDeps): Promise<DeleteFlowResult> {
  if (!(await deps.confirm(DELETE_CONFIRM_STEPS[0], 1))) return { status: 'cancelled' }
  if (!(await deps.confirm(DELETE_CONFIRM_STEPS[1], 2))) return { status: 'cancelled' }
  try {
    await deps.stopProcessing()
  } catch {
    /* media stop is best effort; deletion still runs and is verified */
  }
  try {
    await deps.wipeRuntimeState()
  } catch {
    /* the delete function marks the runtime-state item residual when it throws */
  }
  const result = await deps.deleteAll()
  return { status: 'deleted', result }
}

/** One-paragraph About summary of what the two entries do (kept honest). */
export const DATA_CONTROLS_SUMMARY =
  '撤回同意：二次确认后清除同意记录/本次会话语音确认并进入安全只读（不删存档；年龄核验记录保留）。删除全部本地数据：二次确认后清理存档/备份/记忆/折页/导入摘要/偏好/同意审计/年龄核验记录/审核记录/TTS 缓存/窗口位置，并逐项核验；“quota.json”、WebView2 配置等无法清除或核验的项目会如实列为残留，不谎报完成。'
