/**
 * Browser consent runtime: one singleton gate wired to the DOM modals, the
 * safe localStorage store, the About/statement panel, the blocked read-only
 * screen and the 2h health reminder.
 *
 * `main.ts` owns the app lifecycle and calls:
 *   initConsentRuntime({ onConsentAccepted, exitApplication })
 *   bootstrapConsent().then(mode => mode === 'accepted' ? bootPet() : null)
 * A later acceptance from the read-only screen (retry) invokes the same
 * `onConsentAccepted` callback so the pet boots exactly once.
 *
 * `desktop-shell.ts` uses `requireContentConsent` before opening the external
 * chat-import page and `openAboutPanel` for the statement entry.
 */
import { BIRTH_DATE_ERROR_MESSAGES, type BirthDateError } from './age.ts'
import {
  DATA_WIPED_BLOCKED_VIEW,
  WITHDRAWN_BLOCKED_VIEW,
  createConsentGate,
  type ConsentGate,
  type ConsentSnapshotView,
  type ContentActionRequest,
  type RoleplayRequest,
  type RoleplayResult,
  type RoleplaySessionState,
} from './gate.ts'
import { createConsentStore } from './store.ts'
import type { ConsentUiPort } from './gate.ts'
import type { AuditEntry, ConsentMode } from './core.ts'
import {
  DATA_CONTROLS_SUMMARY,
  deleteAllLocalData,
  runDeleteAllLocalDataFlow,
  runWithdrawConsentFlow,
  type DataControlConfirmCopy,
  type DataControlHost,
  type DataControlStorage,
  type DeleteAllResult,
  type WithdrawFlowResult,
} from './data-controls.ts'
import {
  SAFETY_AUDIT_LIMITATIONS,
  SAFETY_AUDIT_PURPOSE,
  getSafetyAuditLedger,
  type SafetyAuditEntry,
} from './safety-audit.ts'
import {
  renderLegalSections,
  showAgeDialog,
  showAsrDialog,
  showBlockedOverlay,
  showRoleplayDialog,
  showDataControlConfirmDialog,
  showDataControlResultDialog,
  showHealthBanner,
  showTosDialog,
  showTosViewer,
  showTtsDialog,
  type BlockedOverlay,
  type DataControlResultItem,
} from './modal.ts'
import {
  ASR_HASH,
  ASR_SECTIONS,
  ASR_TITLE,
  ASR_VERSION,
  HEALTH_REMINDER_MS,
  HEALTH_REMINDER_TEXT,
  ROLEPLAY_HASH,
  ROLEPLAY_SECTIONS,
  ROLEPLAY_VERSION,
  TOS_HASH,
  TOS_SECTIONS,
  TOS_TITLE,
  TOS_VERSION,
  TTS_HASH,
  TTS_SECTIONS,
  TTS_TITLE,
  TTS_VERSION,
} from './terms.ts'
import {
  HEALTH_BANNER_CLAIM_MS,
  HEALTH_TICK_MS,
  acknowledgeHealthRest,
  claimHealthBanner,
  defaultHealthTiming,
  deferHealthReminder,
  isHealthReminderDue,
  mergeHealthStates,
  noteHealthInteraction,
  readHealthState,
  refreshHealthState,
  writeHealthState,
} from '../health-reminder.ts'
import {
  isQuietHoursActive,
  parseClockMinutes,
  readQuietHours,
  type QuietHoursSettings,
} from '../low-disturb.ts'

export interface ConsentRuntime {
  readonly gate: ConsentGate
  readonly ui: ConsentUiPort
  readonly document: Document
}

export interface ConsentRuntimeOptions {
  readonly document?: Document
  readonly now?: () => Date
  /** Invoked once a user leaves the read-only screen via a fresh acceptance. */
  readonly onConsentAccepted?: () => void
  /** Exit entry used by the blocked overlay; defaults to closing the window. */
  readonly exitApplication?: () => void
  /**
   * Stop TTS/ASR/recording/audio before consent is withdrawn or data is wiped.
   * Wired to `main.ts`; the consent layer itself cannot reach the media stack.
   */
  readonly stopProcessing?: () => void | Promise<void>
  /** Invoked after a successful "delete all local data" (reset in-memory pet). */
  readonly onDataWiped?: () => void
  /** Save slot passed to the Tauri `delete_save` command (default `pet`). */
  readonly saveSlot?: string
}

let runtime: ConsentRuntime | null = null
let blockedOverlay: BlockedOverlay | null = null
let healthBanner: { hide(): void } | null = null
let healthTimer: ReturnType<typeof setInterval> | null = null
/** One-shot wake at the end of the quiet-hours window (see scheduleQuietBoundary). */
let healthBoundaryTimer: ReturnType<typeof setTimeout> | null = null
/** Interaction/visibility listeners installed by startHealthReminder (removed by stop). */
const healthListeners: Array<{ target: EventTarget; type: string; listener: (event: Event) => void }> = []
let aboutReturnFocus: HTMLElement | null = null
let activeOptions: ConsentRuntimeOptions = {}

function hasTauriInternals(): boolean {
  try {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  } catch {
    return false
  }
}

function resolveDataControlStorage(): DataControlStorage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const storage = localStorage as DataControlStorage
    if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') return null
    if (typeof storage.removeItem !== 'function') return null
    return storage
  } catch {
    return null
  }
}

/** Tauri file-command port for "delete all local data"; null in a browser. */
function createTauriDataHost(): DataControlHost | null {
  if (!hasTauriInternals()) return null
  const invoke = async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
    const { invoke: call } = await import('@tauri-apps/api/core')
    return call(command, args)
  }
  return {
    async deleteSave(slot: string): Promise<void> {
      await invoke('delete_save', { slot })
    },
    async isSaveGone(slot: string): Promise<boolean> {
      try {
        await invoke('read_save', { slot, backup: false })
        return false
      } catch {
        return true
      }
    },
    async clearVoiceCache(): Promise<void> {
      await invoke('voice_cache_clear')
    },
    async clearHostConsent(): Promise<boolean> {
      const cleared = await invoke('revoke_host_consent')
      return cleared === true
    },
  }
}

function sanitizedFileNamePart(): string {
  return new Date().toISOString().replace(/[^0-9A-Za-z-]/g, '-').slice(0, 32)
}

function defaultExitApplication(): void {
  try {
    if (typeof window === 'undefined') return
    if ('__TAURI_INTERNALS__' in window) {
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
  } catch {
    /* best effort: the read-only screen stays visible if the window blocks close */
  }
}

/** Idempotent. Throws only if called without a DOM (never in the app/tests). */
export function initConsentRuntime(options: ConsentRuntimeOptions = {}): ConsentRuntime {
  if (runtime) return runtime
  const doc = options.document ?? (typeof document === 'undefined' ? null : document)
  if (!doc) throw new Error('consent-runtime-requires-dom')
  const exitApplication = options.exitApplication ?? defaultExitApplication
  const onConsentAccepted = options.onConsentAccepted
  activeOptions = options

  let gateRef: ConsentGate | null = null
  let retryFromBlocked: () => Promise<void> = async () => {}

  const ui: ConsentUiPort = {
    // Age-gated entry / About self-report dialog (D6: never part of first
    // launch). Fail closed when it cannot complete: the gated feature is blocked
    // and the rest of the app keeps working (no whole-app read-only).
    showAge: (prompt) => showAgeDialog(doc, prompt),
    showTos: (prompt) => showTosDialog(doc, prompt),
    showTts: (prompt) => showTtsDialog(doc, prompt),
    showAsr: (prompt) => showAsrDialog(doc, prompt),
    showRoleplay: (prompt) => showRoleplayDialog(doc, prompt),
    showBlocked: (view) => {
      console.warn(`[consent] read-only mode (${view.reason}): no load/write/voice until a fresh TOS consent`)
      blockedOverlay?.hide()
      blockedOverlay = showBlockedOverlay(doc, {
        view,
        onRetry: () => {
          void retryFromBlocked()
        },
        onExit: exitApplication,
        onViewTos: () => openTosViewer(),
      })
    },
    hideBlocked: () => {
      blockedOverlay?.hide()
      blockedOverlay = null
    },
    notify: (message) => {
      try {
        console.info(`[consent] ${message}`)
      } catch {}
    },
  }

  const gate = createConsentGate({
    ui,
    store: createConsentStore(),
    ...(options.now ? { now: options.now } : {}),
  })
  gateRef = gate

  retryFromBlocked = async (): Promise<void> => {
    blockedOverlay?.hide()
    blockedOverlay = null
    const mode = await gate.retryInitialConsent()
    refreshAboutPanel()
    if (mode === 'accepted' && gateRef) {
      console.info('[consent] accepted from read-only screen; resuming the pet')
      onConsentAccepted?.()
    }
  }

  runtime = { gate, ui, document: doc }
  refreshAboutPanel()
  wireAboutPanel(doc)
  return runtime
}

function requireRuntime(): ConsentRuntime {
  if (!runtime) throw new Error('consent-runtime-not-initialized')
  return runtime
}

/** Gate accessor for guarded-content helpers (null before/without runtime). */
export function getConsentGate(): ConsentGate | null {
  return runtime?.gate ?? null
}

/** First-run/upgrade prompt; resolves the resulting mode (fail closed if absent). */
export async function bootstrapConsent(): Promise<ConsentMode> {
  if (!runtime) return 'readonly'
  return runtime.gate.bootstrap()
}

/** True only after an explicit acceptance of the current TOS version+hash. */
export function canInteract(): boolean {
  return runtime?.gate.canInteract() ?? false
}

export function consentMode(): ConsentMode {
  return runtime?.gate.mode ?? 'readonly'
}

/** Per-action full disclaimer (never exempted by an earlier acceptance). */
export async function requireContentConsent(request: ContentActionRequest): Promise<boolean> {
  if (!runtime) return false
  return runtime.gate.requireAction(request)
}

/** TTS declaration gate (memory-only, per session/config). */
export async function requireTtsConsent(config: string): Promise<boolean> {
  if (!runtime) return false
  return runtime.gate.ensureTts(config)
}

/** Explicit TTS declaration entry (About/menu); always re-prompts. */
export async function requestTtsConfirmation(config: string): Promise<boolean> {
  if (!runtime) return false
  return runtime.gate.requestTtsConfirmation(config)
}

/**
 * ASR declaration gate (memory-only, per session/config). FAIL CLOSED: without
 * the runtime (or a confirmation) the caller must not request the microphone.
 */
export async function requireAsrConsent(config: string): Promise<boolean> {
  if (!runtime) return false
  return runtime.gate.ensureAsr(config)
}

/** Explicit ASR declaration entry (About); always re-prompts, scoped to config. */
export async function requestAsrConfirmation(config: string): Promise<boolean> {
  if (!runtime) return false
  return runtime.gate.requestAsrConfirmation(config)
}

/**
 * Roleplay declaration gate (memory-only, per session/settings). ALWAYS shows
 * the full TOS and then the separate roleplay declaration + mandatory settings
 * form; every start/change re-prompts and re-fills. Fail closed without runtime.
 */
export async function requireRoleplayConsent(options: RoleplayRequest = {}): Promise<RoleplayResult> {
  if (!runtime) return { accepted: false, reason: 'unavailable' }
  const result = await runtime.gate.requestRoleplay(options)
  // Keep the About roleplay status/exit affordance in sync right away (the
  // panel stays open during the TOS/declaration dialogs and is inert meanwhile).
  refreshAboutPanel()
  return result
}

/** Roleplay exit (About/menu); records the exit and clears the session state. */
export function requestRoleplayExit(): boolean {
  if (!runtime) return false
  const exited = runtime.gate.exitRoleplay()
  refreshAboutPanel()
  return exited
}

/** Read-only roleplay session state for About/QA (never a consent bypass). */
export function roleplayState(): RoleplaySessionState {
  return runtime?.gate.roleplayState() ?? { active: false, signature: null }
}

/** Read-only age band view for About/QA (never the full birth date). */
export function ageSnapshotView() {
  return (
    runtime?.gate.ageSnapshot() ?? {
      status: 'unavailable' as const,
      verified: false,
      adult: null,
      band: null,
      verifiedAt: null,
      persistence: 'memory' as const,
    }
  )
}

/**
 * About entry: correct the self-reported birth date. The gate re-validates the
 * new date, persists it, ends any active roleplay session and records the
 * correction (the birth date itself is never displayed/logged/audited).
 */
export async function requestAgeCorrection(): Promise<boolean> {
  if (!runtime) return false
  const doc = runtime.document
  const gate = runtime.gate
  if (!gate.canInteract()) return false
  // About works as an explicit opt-in verification entry under D6: unverified
  // users get the neutral 'gated' prompt copy, verified users get the correction
  // flow. Neither changes the TOS acceptance or the rest of the app.
  const reason = gate.ageSnapshot().verified ? 'correct' : 'gated'
  const decision = await showAgeDialog(doc, gate.agePrompt(reason))
  if (!decision.verified) return false
  const result = gate.reverifyAge({
    year: typeof decision.year === 'number' ? decision.year : null,
    month: typeof decision.month === 'number' ? decision.month : null,
    day: typeof decision.day === 'number' ? decision.day : null,
  })
  refreshAboutPanel()
  if (!result.accepted) {
    const messages = (result.errors ?? []).map(
      (error: BirthDateError) => BIRTH_DATE_ERROR_MESSAGES[error] ?? '出生日期无效，请重新选择。',
    )
    await showDataControlResultDialog(doc, {
      kicker: 'AGE · 年龄核验',
      title: '年龄没有更新（未通过校验）',
      intro: '新的出生日期未通过校验，原有记录保持不变；未报告成功。',
      lines: messages.length > 0 ? messages : ['出生日期无效，请重新选择。'],
      closeLabel: '知道了',
    })
    return false
  }
  await showDataControlResultDialog(doc, {
    kicker: 'AGE · 年龄核验',
    title: '年龄核验已更新（自报）',
    intro: '新的出生日期已在本机重新核验并保存；界面只显示年龄段，不显示完整生日。',
    lines: [
      `当前年龄段：${result.band ?? '未知'}`,
      result.adult
        ? 'roleplay 18+ 门槛：已满足；仍需完整的 TOS + 角色扮演声明与设定确认后才能开始。'
        : 'roleplay 18+ 门槛：未满足（仅限年满 18 周岁），角色扮演入口会被阻止并提示原因。',
      result.roleplayCleared
        ? '已结束当前角色扮演会话并清除其状态；如需继续，需重新完成完整 TOS + 声明确认。'
        : '当前没有进行中的角色扮演会话。',
      '一般功能不受影响；TOS 文本与版本/哈希未因年龄核验/更正而改变，不需要重新同意 TOS。',
      '这是自报核验，不是官方身份证/实名认证。',
    ],
    closeLabel: '知道了',
  })
  return true
}

export function consentSnapshot(): ConsentSnapshotView {
  return (
    runtime?.gate.snapshot() ?? {
      mode: 'readonly',
      tosVersion: TOS_VERSION,
      tosHash: TOS_HASH,
      acceptedAt: null,
      persistence: 'memory',
      status: 'unavailable',
      corrupt: false,
      ttsConfirmedThisSession: false,
      asrConfirmedThisSession: false,
      roleplayActiveThisSession: false,
      roleplaySignature: null,
      ageStatus: 'unavailable',
      ageVerified: false,
      ageAdult: null,
      ageBand: null,
      ageVerifiedAt: null,
    }
  )
}

export function readConsentAudit() {
  return runtime?.gate.audit() ?? []
}

export function openTosViewer(): void {
  if (!runtime) return
  showTosViewer(runtime.document, {
    title: TOS_TITLE,
    version: TOS_VERSION,
    hash: TOS_HASH,
    sections: TOS_SECTIONS,
  })
}

// ---------------------------------------------------------------------------
// About / statements panel
// ---------------------------------------------------------------------------

function statusText(mode: ConsentMode, status: ConsentSnapshotView['status']): string {
  if (mode === 'accepted') return status === 'accepted' ? '已同意（当前版本，已持久记录）' : '已同意（仅本次会话）'
  if (mode === 'readonly') return '未同意（安全只读）'
  return '待同意'
}

export function refreshAboutPanel(): void {
  if (!runtime) return
  const doc = runtime.document
  const snapshot = consentSnapshot()
  const meta = doc.getElementById('about-legal-meta')
  if (meta) {
    const accepted = snapshot.acceptedAt ? ` · 同意时间 ${new Date(snapshot.acceptedAt).toLocaleString()}` : ''
    const persistence = snapshot.persistence === 'local' ? 'localStorage' : '内存（不会持久保存）'
    const corrupt = snapshot.corrupt ? ' · 存储数据损坏，已安全回退' : ''
    meta.textContent = `TOS ${snapshot.tosVersion} · SHA-256 ${snapshot.tosHash.slice(0, 16)}… · 状态：${statusText(snapshot.mode, snapshot.status)} · 记录：${persistence}${accepted}${corrupt}`
  }
  const tosContainer = doc.getElementById('about-tos-sections')
  if (tosContainer) renderLegalSections(doc, tosContainer, TOS_SECTIONS)
  const ttsContainer = doc.getElementById('about-tts-sections')
  if (ttsContainer) renderLegalSections(doc, ttsContainer, TTS_SECTIONS)
  const ttsVersion = doc.getElementById('about-tts-meta')
  if (ttsVersion) {
    ttsVersion.textContent = `TTS 声明 ${TTS_VERSION} · SHA-256 ${TTS_HASH.slice(0, 16)}… · ${TTS_SECTIONS.length} 节 · 每次配置变更/新会话需重新确认`
  }
  const asrContainer = doc.getElementById('about-asr-sections')
  if (asrContainer) renderLegalSections(doc, asrContainer, ASR_SECTIONS)
  const asrVersion = doc.getElementById('about-asr-meta')
  if (asrVersion) {
    asrVersion.textContent = `ASR 声明 ${ASR_VERSION} · SHA-256 ${ASR_HASH.slice(0, 16)}… · ${ASR_SECTIONS.length} 节 · 单独确认，TOS/TTS 不能替代；拒绝则不录音、不上传`
  }
  const roleplaySections = doc.getElementById('about-roleplay-sections')
  if (roleplaySections) renderLegalSections(doc, roleplaySections, ROLEPLAY_SECTIONS)
  const age = runtime.gate.ageSnapshot()
  const ageMeta = doc.getElementById('about-age-meta')
  if (ageMeta) {
    const band = age.verified
      ? `已核验（自报）· ${age.band}${age.adult ? ' · roleplay 18+ 门槛已满足' : ' · roleplay 不可用（仅限 18+）'}`
      : age.status === 'corrupt'
        ? '未核验（本机记录损坏，进入 18+ 功能时会重新核验）· roleplay 不可用'
        : age.status === 'invalid'
          ? '未核验（本机记录已失效，进入 18+ 功能时会重新核验）· roleplay 不可用'
          : '未核验（首次启动不采集；进入 18+ 功能或在此主动核验时才采集）· roleplay 不可用'
    const persistence = age.persistence === 'local' ? '本机 localStorage' : '仅本次会话内存（存储不可用）'
    ageMeta.textContent = `年龄核验（自报出生日期）：${band} · 记录：${persistence} · 仅显示年龄段，不显示完整生日 · 不是官方身份证/实名核验；“删除全部本地数据”会删除年龄记录`
  }
  const ageCorrect = doc.getElementById('about-age-correct')
  if (ageCorrect instanceof HTMLButtonElement) ageCorrect.disabled = !runtime.gate.canInteract()
  const roleplayMeta = doc.getElementById('about-roleplay-meta')
  if (roleplayMeta) {
    const state = roleplayState()
    const status = state.active ? '进行中（仅本地模板/设定，不提供自由 LLM 对话）' : '未开始'
    const ageGate = age.adult
      ? 'age 18+ 门槛：已满足'
      : age.verified
        ? 'age 18+ 门槛：未满足（当前未满 18 周岁，roleplay 被阻止）'
        : 'age 18+ 门槛：未满足（未核验；进入 roleplay 入口时会先询问，或可在此主动核验）'
    roleplayMeta.textContent = `角色扮演声明 ${ROLEPLAY_VERSION} · SHA-256 ${ROLEPLAY_HASH.slice(0, 16)}… · ${ROLEPLAY_SECTIONS.length} 节 · 仅限年满 18 周岁（一般功能全年龄可用）；内容须全年龄适宜 · ${ageGate} · 状态：${status} · 每次开始/设定变更需重新完整 TOS + 声明并重新填写`
  }
  const roleplayExit = doc.getElementById('about-roleplay-exit')
  if (roleplayExit instanceof HTMLButtonElement) roleplayExit.disabled = !roleplayState().active
  refreshDataControlPanel()
}

export function isAboutOpen(): boolean {
  const screen = runtime?.document.getElementById('about-screen')
  return Boolean(screen && !screen.classList.contains('hidden'))
}

export function openAboutPanel(): void {
  if (!runtime) return
  refreshAboutPanel()
  const screen = runtime.document.getElementById('about-screen')
  if (!screen) return
  aboutReturnFocus =
    runtime.document.activeElement instanceof HTMLElement ? runtime.document.activeElement : null
  screen.classList.remove('hidden')
  const close = runtime.document.getElementById('about-close')
  if (close instanceof HTMLElement) close.focus()
}

export function closeAboutPanel(): void {
  if (!runtime) return
  const screen = runtime.document.getElementById('about-screen')
  if (!screen) return
  screen.classList.add('hidden')
  const target = aboutReturnFocus
  aboutReturnFocus = null
  if (target && target.isConnected) {
    try {
      target.focus()
    } catch {}
  }
}


// ---------------------------------------------------------------------------
// User data controls (P0 R-P0-06): withdraw consent / delete all / audit views
// ---------------------------------------------------------------------------

const DIRECTION_LABELS: Readonly<Record<string, string>> = {
  user_input: '用户输入',
  model_output: '模型输出',
  tts: 'TTS 朗读',
  dlc_description: 'DLC 描述',
}
const DISPOSITION_LABELS: Readonly<Record<string, string>> = {
  allow: '允许',
  review: '需复核',
  block: '阻断',
  refuse: '拒绝',
}
const AUDIT_DECISION_LABELS: Readonly<Record<string, string>> = {
  accept: '同意',
  decline: '拒绝',
  ack: '记录',
}

function formatAuditTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso.slice(0, 19) : date.toLocaleString()
}

function appendAuditLine(doc: Document, list: HTMLElement, text: string): void {
  const item = doc.createElement('li')
  item.className = 'about-audit-entry'
  item.textContent = text
  list.append(item)
}

function renderConsentAuditList(doc: Document, entries: readonly AuditEntry[]): void {
  const list = doc.getElementById('about-consent-audit-list')
  if (!list) return
  list.replaceChildren()
  if (entries.length === 0) {
    appendAuditLine(doc, list, '暂无同意审计记录。')
    return
  }
  for (const entry of [...entries].reverse()) {
    const scope = entry.target ? ` · 目标 ${entry.target}` : ''
    appendAuditLine(
      doc,
      list,
      `${formatAuditTime(entry.at)} · ${entry.action} · ${AUDIT_DECISION_LABELS[entry.decision] ?? entry.decision} · TOS ${entry.tosVersion}${scope}`,
    )
  }
}

function renderSafetyAuditList(doc: Document, entries: readonly SafetyAuditEntry[]): void {
  const list = doc.getElementById('about-safety-audit-list')
  if (!list) return
  list.replaceChildren()
  if (entries.length === 0) {
    appendAuditLine(doc, list, '暂无审核记录（只有发生安全审核后才会写入；不记录原文）。')
    return
  }
  for (const entry of [...entries].reverse()) {
    const categories = entry.categories.length > 0 ? entry.categories.join('/') : '无'
    const rules = entry.ruleIds.length > 0 ? entry.ruleIds.join('/') : '无'
    const degraded = entry.degraded ? ' · 远程审核降级' : ''
    appendAuditLine(
      doc,
      list,
      `${formatAuditTime(entry.at)} · ${DIRECTION_LABELS[entry.direction] ?? entry.direction} · ${DISPOSITION_LABELS[entry.disposition] ?? entry.disposition} · 类别 ${categories} · 规则 ${rules} · 长度 ${entry.length} · 哈希 ${entry.textHash.slice(0, 12)}…${degraded}`,
    )
  }
}

function refreshDataControlPanel(): void {
  if (!runtime) return
  const doc = runtime.document
  const gate = runtime.gate
  const ledger = getSafetyAuditLedger()
  const consentEntries = gate.audit()
  const safetyEntries = ledger.entries()
  const dataMeta = doc.getElementById('about-data-meta')
  if (dataMeta) {
    const persistence = ledger.persistence === 'local' ? '本机 localStorage' : '仅本次会话内存（存储不可用）'
    dataMeta.textContent = `${DATA_CONTROLS_SUMMARY} 审核记录：${persistence}；滚动上限 ${ledger.limit} 条；非证据级、无哈希链，导出仅用于投诉/执法。`
  }
  const consentMeta = doc.getElementById('about-consent-audit-meta')
  if (consentMeta) {
    consentMeta.textContent = `共 ${consentEntries.length} 条（滚动上限 100）· 仅保留必要字段：时间/动作/决定/TOS 版本与哈希/目标范围/TTS·ASR 声明版本与哈希 · 不记录原文 · 可一键清除 · 本地记录非证据级`
  }
  renderConsentAuditList(doc, consentEntries)
  const safetyMeta = doc.getElementById('about-safety-audit-meta')
  if (safetyMeta) {
    const persistence = ledger.persistence === 'local' ? '本机 localStorage' : '仅本次会话内存'
    safetyMeta.textContent = `共 ${safetyEntries.length} 条（滚动上限 ${ledger.limit}）· 仅方向/风险类别/规则 ID/处置/时间/加盐文本哈希/长度 · 不含原文 · ${persistence} · 非证据级、无哈希链 · 导出仅用于投诉/执法`
  }
  renderSafetyAuditList(doc, safetyEntries)
}

function confirmView(copy: DataControlConfirmCopy) {
  return {
    kicker: copy.kicker,
    title: copy.title,
    intro: copy.intro,
    bullets: copy.bullets,
    checkboxLabel: copy.checkboxLabel,
    confirmLabel: copy.confirmLabel,
    cancelLabel: copy.cancelLabel,
    footnote: copy.footnote,
    danger: copy.danger,
  }
}

function resultItems(result: DeleteAllResult): DataControlResultItem[] {
  return result.items.map((item) => ({
    label: item.label,
    status: item.status,
    ...(item.detail ? { detail: item.detail } : {}),
  }))
}

async function runMediaStop(): Promise<void> {
  try {
    await activeOptions.stopProcessing?.()
  } catch {
    /* media stop is best effort; the gate still flips to read-only */
  }
}

/**
 * About entry: withdraw consent with a 2-step confirmation. Stops voice/TTS/ASR,
 * clears the persisted TOS acceptance + session TTS/ASR confirmations, minimizes
 * the consent audit, enters the safe read-only screen and reports exactly what
 * happened (no save deletion).
 */
export async function requestWithdrawConsent(): Promise<WithdrawFlowResult | null> {
  if (!runtime) return null
  const doc = runtime.document
  const gate = runtime.gate
  if (gate.mode !== 'accepted') {
    await showDataControlResultDialog(doc, {
      kicker: 'DATA CONTROL · 撤回同意',
      title: '当前没有可撤回的同意',
      intro: '只有处于“已同意”状态时才需要撤回；当前为待同意/安全只读，没有生效中的同意记录。',
      lines: ['如需清除同意审计记录，可使用本面板的“同意审计记录 → 清除”。'],
      closeLabel: '知道了',
    })
    return null
  }
  const outcome = await runWithdrawConsentFlow({
    confirm: (copy) => showDataControlConfirmDialog(doc, confirmView(copy)),
    stopProcessing: runMediaStop,
    withdraw: () => gate.withdrawConsent(),
  })
  if (outcome.status !== 'withdrawn') return outcome
  closeAboutPanel()
  refreshAboutPanel()
  await showDataControlResultDialog(doc, {
    kicker: 'DATA CONTROL · 撤回同意',
    title: '已撤回同意',
    intro: '已进入安全只读模式：不加载/写入本机数据、不播放 AI 语音、不获取麦克风。可重新阅读并同意，或退出应用。',
    items: [
      {
        label: 'TOS 同意记录',
        status: outcome.acceptanceCleared ? 'deleted' : 'residual',
        ...(outcome.acceptanceCleared
          ? { detail: '已从本机存储清除并核验' }
          : { detail: '清除失败：本机存储可能被锁定/只读，请手动清理 WebView 数据' }),
      },
      { label: '本次会话 TTS/ASR 确认', status: 'deleted', detail: '已清除；语音播放/录音已停止' },
      {
        label: '存档/记忆/导出文件',
        status: 'excluded',
        detail: '撤回同意不删除这些数据；如需删除请使用“删除全部本地数据”',
      },
      {
        label: '年龄核验记录（自报）',
        status: 'excluded',
        detail: '撤回 TOS 同意不删除年龄核验记录；如需删除请使用“删除全部本地数据”（含年龄记录）',
      },
      {
        label: '同意审计记录',
        status: 'excluded',
        detail: `保留 ${outcome.auditRetained} 条最小必要记录，可在“同意审计记录”中查看并清除`,
      },
    ],
    footnote: '同意审计只保留必要字段（时间/动作/决定/版本/哈希/目标），不含原文；本地记录非证据级。',
    closeLabel: '查看安全只读',
  })
  runtime.ui.showBlocked?.(WITHDRAWN_BLOCKED_VIEW)
  return outcome
}

/**
 * About entry: delete every listed app-managed local item with a 2-step
 * confirmation. Runs the host (Tauri) + browser deletion paths, verifies each
 * item, reports residual/unverified items honestly, then enters read-only.
 */
export async function requestDeleteAllLocalData(): Promise<DeleteAllResult | null> {
  if (!runtime) return null
  const doc = runtime.document
  const gate = runtime.gate
  const outcome = await runDeleteAllLocalDataFlow({
    confirm: (copy) => showDataControlConfirmDialog(doc, confirmView(copy)),
    stopProcessing: runMediaStop,
    wipeRuntimeState: async () => {
      gate.wipeLocalConsentState()
      getSafetyAuditLedger().clear()
    },
    deleteAll: async () => {
      const result = await deleteAllLocalData({
        storage: resolveDataControlStorage(),
        host: createTauriDataHost(),
        saveSlot: activeOptions.saveSlot ?? 'pet',
        resetRuntimeState: () => {
          activeOptions.onDataWiped?.()
        },
      })
      return result
    },
  })
  if (outcome.status !== 'deleted') return null
  const result = outcome.result
  closeAboutPanel()
  refreshAboutPanel()
  await showDataControlResultDialog(doc, {
    kicker: 'DATA CONTROL · 删除全部本地数据',
    title: result.complete ? '本机数据已删除并逐项核验' : '已删除可删除的数据；存在残留/未核验项',
    intro: result.complete
      ? '本应用管理的本机数据已逐项删除并核验；同意记录也已清除，现进入安全只读。'
      : '以下是逐项结果：仍有项目残留或无法独立核验，本次没有声称“全部成功”。',
    items: resultItems(result),
    footnote:
      '“未删除（按设计）”包括你导出的外部文件（备份/折页/审核导出）与 Advisers 简报等你自己的文件；如需删除请手动处理。删除结果同时写入本面板状态。',
    closeLabel: '查看安全只读',
  })
  runtime.ui.showBlocked?.(DATA_WIPED_BLOCKED_VIEW)
  return result
}

/** About entry: view/clear the consent audit (acceptance is not touched). */
export async function requestClearConsentAudit(): Promise<boolean> {
  if (!runtime) return false
  const doc = runtime.document
  const gate = runtime.gate
  const before = gate.audit().length
  const confirmed = await showDataControlConfirmDialog(doc, {
    kicker: 'DATA CONTROL · 同意审计记录',
    title: '清除同意审计记录？',
    intro: '将删除本机保存的全部同意/拒绝审计记录（只保留必要字段的那部分），不影响当前同意状态。',
    bullets: [
      `当前共 ${before} 条记录；清除后不可恢复。`,
      '清除审计不会撤回同意；如需撤回请使用“撤回同意”。',
      '审计记录不是证据级记录（无哈希链/可信时间戳）。',
    ],
    checkboxLabel: '我已了解清除后无法恢复',
    confirmLabel: '清除同意审计记录',
    cancelLabel: '取消',
    danger: true,
  })
  if (!confirmed) return false
  const cleared = gate.clearAudit()
  refreshDataControlPanel()
  await showDataControlResultDialog(doc, {
    kicker: 'DATA CONTROL · 同意审计记录',
    title: cleared ? '同意审计记录已清除' : '清除未完成',
    intro: cleared
      ? '本机同意审计记录已清空并核验。当前 TOS 同意状态不受影响。'
      : '本机存储不可写或被锁定，记录没有清除；未报告成功。',
    lines: [`清除前 ${before} 条`, cleared ? '清除后 0 条（核验通过）' : '清除后仍有记录（残留）'],
    closeLabel: '知道了',
  })
  return cleared
}

/** About entry: view/clear the local safety-review ledger. */
export async function requestClearSafetyAudit(): Promise<boolean> {
  if (!runtime) return false
  const doc = runtime.document
  const ledger = getSafetyAuditLedger()
  const before = ledger.entries().length
  const confirmed = await showDataControlConfirmDialog(doc, {
    kicker: 'DATA CONTROL · 审核记录',
    title: '清除本机审核记录？',
    intro: '将清空本机安全审核留痕（不含原文，仅方向/类别/规则/处置/时间/加盐哈希/长度），并同时删除加盐值。',
    bullets: [`当前共 ${before} 条；清除后不可恢复。`, '清除审核记录不影响你的同意状态或存档。'],
    checkboxLabel: '我已了解清除后无法恢复',
    confirmLabel: '清除审核记录',
    cancelLabel: '取消',
    danger: true,
  })
  if (!confirmed) return false
  const cleared = ledger.clear()
  refreshDataControlPanel()
  const after = cleared ? 0 : ledger.entries().length
  await showDataControlResultDialog(doc, {
    kicker: 'DATA CONTROL · 审核记录',
    title: cleared ? '审核记录已清除' : '清除未完成',
    intro: cleared ? '本机审核记录与加盐值已清空（清除后为空）。' : '本机存储不可写或被锁定，记录没有清除；未报告成功。',
    lines: [`清除前 ${before} 条`, `清除后 ${after} 条`],
    closeLabel: '知道了',
  })
  return cleared
}

/** About entry: export the review ledger — ONLY for complaints/law enforcement. */
export async function requestExportSafetyAudit(): Promise<boolean> {
  if (!runtime) return false
  const doc = runtime.document
  const ledger = getSafetyAuditLedger()
  const entries = ledger.entries()
  const confirmed = await showDataControlConfirmDialog(doc, {
    kicker: 'DATA CONTROL · 审核记录导出',
    title: '导出审核记录（仅投诉/执法）？',
    intro: '导出仅用于你本人投诉、申诉或向执法机关提供线索，不得用于其他目的。文件由你自行保管。',
    bullets: [
      `将导出 ${entries.length} 条记录：时间/方向/处置/风险类别/规则 ID/加盐文本哈希/长度。`,
      '导出不含原文；记录不是证据级：无哈希链、无可信时间戳、可被修改或清除。',
      '导出文件属于你主动保存的外部文件，本应用“删除全部本地数据”不会删除它。',
    ],
    checkboxLabel: '我确认导出仅用于投诉或执法目的',
    confirmLabel: '导出 JSON 文件',
    cancelLabel: '取消',
  })
  if (!confirmed) return false
  if (entries.length === 0) {
    await showDataControlResultDialog(doc, {
      kicker: 'DATA CONTROL · 审核记录导出',
      title: '暂无可导出的审核记录',
      intro: '本机还没有安全审核留痕；可稍后再试。',
      closeLabel: '知道了',
    })
    return false
  }
  const fileName = `pagefold-safety-audit-${sanitizedFileNamePart()}.json`
  try {
    const json = ledger.exportJson()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = doc.createElement('a')
    link.href = url
    link.download = fileName
    link.rel = 'noopener'
    link.style.display = 'none'
    doc.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    await showDataControlResultDialog(doc, {
      kicker: 'DATA CONTROL · 审核记录导出',
      title: '已请求下载审核记录',
      intro: `文件名：${fileName}`,
      lines: [
        `已请求导出 ${entries.length} 条记录（不含原文）。`,
        `用途限制：${SAFETY_AUDIT_PURPOSE}`,
        ...SAFETY_AUDIT_LIMITATIONS,
      ],
      closeLabel: '知道了',
    })
    return true
  } catch {
    await showDataControlResultDialog(doc, {
      kicker: 'DATA CONTROL · 审核记录导出',
      title: '导出失败',
      intro: '当前环境无法创建下载文件（未报告成功）。可改用“投诉/执法”邮件渠道联系。',
      lines: [`用途限制：${SAFETY_AUDIT_PURPOSE}`],
      closeLabel: '知道了',
    })
    return false
  }
}

/** Read-only view for QA/console (no bypass: clear/export still need the modal). */
export function readSafetyAudit(): SafetyAuditEntry[] {
  return getSafetyAuditLedger().entries()
}

export function safetyAuditPersistence(): 'local' | 'memory' {
  return getSafetyAuditLedger().persistence
}

function toggleAuditPanel(buttonId: string, panelId: string): void {
  if (!runtime) return
  const doc = runtime.document
  const button = doc.getElementById(buttonId)
  const panel = doc.getElementById(panelId)
  if (!button || !panel) return
  const open = panel.hidden
  panel.hidden = !open
  button.setAttribute('aria-expanded', open ? 'true' : 'false')
  if (open) refreshDataControlPanel()
}

function wireAboutPanel(doc: Document): void {
  doc.getElementById('about-close')?.addEventListener('click', () => closeAboutPanel())
  doc.getElementById('about-tos-view')?.addEventListener('click', () => openTosViewer())

  const safely = (task: () => Promise<unknown>): void => {
    void task().catch((error) => {
      try {
        console.warn('[consent] data control failed:', error instanceof Error ? error.message : String(error))
      } catch {}
    })
  }
  // Data controls (P0 R-P0-06). Every action re-checks the gate itself; the
  // buttons are not a consent bypass and never auto-confirm anything.
  doc.getElementById('about-age-correct')?.addEventListener('click', () => safely(requestAgeCorrection))
  doc.getElementById('about-withdraw-consent')?.addEventListener('click', () => safely(requestWithdrawConsent))
  doc.getElementById('about-delete-all')?.addEventListener('click', () => safely(requestDeleteAllLocalData))
  doc.getElementById('about-consent-audit-view')?.addEventListener('click', () => {
    toggleAuditPanel('about-consent-audit-view', 'about-consent-audit-panel')
  })
  doc.getElementById('about-safety-audit-view')?.addEventListener('click', () => {
    toggleAuditPanel('about-safety-audit-view', 'about-safety-audit-panel')
  })
  doc.getElementById('about-consent-audit-clear')?.addEventListener('click', () => safely(requestClearConsentAudit))
  doc.getElementById('about-safety-audit-clear')?.addEventListener('click', () => safely(requestClearSafetyAudit))
  doc.getElementById('about-safety-audit-export')?.addEventListener('click', () => safely(requestExportSafetyAudit))

  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (!isAboutOpen()) return
    event.preventDefault()
    closeAboutPanel()
  })
}

// ---------------------------------------------------------------------------
// Health use reminder (2h continuous visible use, non-blocking)
// ---------------------------------------------------------------------------

export interface HealthReminderOptions {
  readonly afterMs?: number
  /** Poll override (tests); production uses HEALTH_TICK_MS (15 s). */
  readonly tickMs?: number
}

/**
 * Delay from `now` to the next end of the quiet-hours window, or null when the
 * window is disabled/invalid/inactive. Overnight windows (start > end, the
 * 22:00-08:00 default) point at the next morning. Pure, so the boundary maths is
 * testable without a DOM or a real timer.
 */
export function healthQuietHoursEndDelayMs(now: Date, settings: QuietHoursSettings): number | null {
  if (!settings.enabled) return null
  const start = parseClockMinutes(settings.start)
  const end = parseClockMinutes(settings.end)
  // start === end is "no quiet window" (same rule as isQuietHoursActive).
  if (start === null || end === null || start === end) return null
  if (!isQuietHoursActive(now, settings)) return null
  const elapsedMs =
    ((now.getHours() * 60 + now.getMinutes()) * 60 + now.getSeconds()) * 1000 + now.getMilliseconds()
  let delay = end * 60_000 - elapsedMs
  if (delay <= 0) delay += 24 * 60 * 60 * 1000
  return delay
}

/** Clear the one-shot quiet-hours boundary wake (start/stop share this). */
function clearHealthQuietBoundary(): void {
  if (healthBoundaryTimer === null) return
  clearTimeout(healthBoundaryTimer)
  healthBoundaryTimer = null
}

/**
 * Non-blocking 2h health reminder required by the health-use policy (MB-072).
 *
 * Q-03 semantics implemented here:
 * - the start time is a persisted wall-clock timestamp, so switching to a game
 *   window, hiding the pet page or restarting does not reset the clock;
 * - a page becoming hidden no longer pauses anything: visibility only gates
 *   whether the banner may be painted (it appears when the window is visible);
 * - a no-interaction gap longer than the shared idle window starts a fresh
 *   continuous-use session instead of counting "app left open" as use;
 * - quiet hours defer the banner; a one-shot timeout at the window end (plus the
 *   health-reminder tick as fallback) paints it as soon as quiet hours end;
 * - the banner offers only "休息一下（2 小时后仍会提醒）" and
 *   "10 分钟后再提醒" -- there is no permanent dismiss.
 *
 * Perf P0 (2026-11-21): the poll moved from 1 s to HEALTH_TICK_MS (15 s); every
 * tick reads + JSON-parses + merges the shared record, and wall-clock maths means
 * a throttled hidden-window timer loses nothing.
 */
export function startHealthReminder(options: HealthReminderOptions = {}): void {
  if (healthTimer !== null) return
  const doc = requireRuntime().document
  const timing = defaultHealthTiming({ afterMs: options.afterMs ?? HEALTH_REMINDER_MS })
  const tickMs =
    typeof options.tickMs === 'number' && Number.isFinite(options.tickMs) && options.tickMs > 0
      ? options.tickMs
      : HEALTH_TICK_MS
  let state = refreshHealthState(readHealthState(undefined, Date.now()), Date.now(), timing)

  /**
   * One-shot wake at the end of the active quiet-hours window. Quiet hours are
   * the common deferral path (22:00-08:00 default), so the deferred banner must
   * not wait for up to one 15 s poll: one timer is armed only while the reminder
   * is due but suppressed, and tick() re-arms it on demand.
   */
  const scheduleQuietBoundary = (nowMs: number, quiet: QuietHoursSettings): void => {
    clearHealthQuietBoundary()
    try {
      const delay = healthQuietHoursEndDelayMs(new Date(nowMs), quiet)
      if (delay === null) return
      healthBoundaryTimer = setTimeout(() => {
        healthBoundaryTimer = null
        tick()
      }, delay + 250)
    } catch {
      clearHealthQuietBoundary()
    }
  }

  const persist = (): void => {
    writeHealthState(state)
  }

  const noteInteraction = (): void => {
    const at = Date.now()
    // 1s resolution: wheel/pointer input must not cause a localStorage write per
    // event just to refresh a 15-minute idle-gap decision.
    if (state.lastInteractionAt !== 0 && at - state.lastInteractionAt < 1_000) return
    const next = noteHealthInteraction(state, at, timing)
    if (next !== state) {
      state = next
      persist()
    }
  }

  const tick = (): void => {
    try {
      if (!gateRefAvailable()) return
      const nowMs = Date.now()
      // The game windows write the same record: merge their interactions/claims
      // before evaluating, so one 2h clock spans pet <-> game without a host.
      state = refreshHealthState(mergeHealthStates(state, readHealthState(undefined, nowMs)), nowMs, timing)
      const due = isHealthReminderDue(state, nowMs, timing)
      if (healthBanner) {
        // Another window may have rested/deferred/finished the session.
        if (!due) {
          healthBanner.hide()
          healthBanner = null
        }
        return
      }
      if (!due) return
      // Hidden windows keep counting time but cannot paint a banner; the
      // visibility listener below runs tick() again when the window returns.
      if (doc.visibilityState === 'hidden') return
      // Quiet hours (MB-070): defer, never drop. The persisted start time stays
      // untouched, so the banner appears after the quiet window ends; the
      // one-shot boundary wake paints it immediately at the window end instead
      // of waiting for the next 15 s poll.
      const quiet = readQuietHours()
      if (isQuietHoursActive(new Date(nowMs), quiet)) {
        // Arm only once: a 15 s poll must not clear/re-create the same timer.
        if (healthBoundaryTimer === null) scheduleQuietBoundary(nowMs, quiet)
        return
      }
      // Quiet hours ended (or were disabled): drop any pending boundary wake
      // before claiming the banner.
      clearHealthQuietBoundary()
      // Cross-window dedupe: another same-origin window may have just claimed it
      // (state.lastShownAt already includes the merged stored value).
      const claimedAt = state.lastShownAt
      if (nowMs - claimedAt < HEALTH_BANNER_CLAIM_MS) return
      state = claimHealthBanner(state, nowMs)
      persist()
      runtime?.gate.recordHealthReminder()
      healthBanner = showHealthBanner(doc, {
        text: HEALTH_REMINDER_TEXT,
        onRest: () => {
          state = acknowledgeHealthRest(state, Date.now())
          persist()
          healthBanner = null
        },
        onDefer: () => {
          state = deferHealthReminder(state, Date.now(), timing)
          persist()
          healthBanner = null
        },
        onAbout: () => {
          healthBanner = null
          openAboutPanel()
        },
      })
    } catch {
      /* never let the reminder break the app */
    }
  }

  const register = (type: string, listener: (event: Event) => void): void => {
    try {
      doc.addEventListener(type, listener)
      healthListeners.push({ target: doc as unknown as EventTarget, type, listener })
    } catch {
      /* listener registration is best-effort */
    }
  }
  // Any user interaction keeps the current continuous-use session alive (and
  // restarts it after an idle gap). Reads/wheel count as presence too.
  register('pointerdown', noteInteraction)
  register('keydown', noteInteraction)
  register('touchstart', noteInteraction)
  register('wheel', noteInteraction)
  register('visibilitychange', () => {
    if (doc.visibilityState === 'visible') tick()
  })
  tick()
  // 15 s poll (HEALTH_TICK_MS, the shared default) instead of the old 1 s one:
  // 4 record reads/min instead of 60, with the quiet-hours boundary wake above.
  healthTimer = setInterval(tick, tickMs)
}

function gateRefAvailable(): boolean {
  return runtime?.gate.canInteract() ?? false
}

/** Exposed for tests/smoke checks only; production code reads `healthTimer`. */
export function stopHealthReminder(): void {
  if (healthTimer !== null) clearInterval(healthTimer)
  healthTimer = null
  clearHealthQuietBoundary()
  healthBanner?.hide()
  healthBanner = null
  for (const entry of healthListeners) {
    try {
      entry.target.removeEventListener(entry.type, entry.listener)
    } catch {
      /* ignore */
    }
  }
  healthListeners.length = 0
}
