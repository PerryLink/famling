/**
 * Consent gate state machine (UI-agnostic; injected UI port + storage port).
 *
 * Two distinct kinds of consent, deliberately not interchangeable:
 *
 * 1. First-run TOS (persistent, version+hash pinned): shown once on first launch
 *    and again after any TOS version/hash change. Decline = safe read-only mode
 *    (the caller must not load/write/mutate) or exit.
 * 2. Per-action disclosure (NOT persistent, never exempted): every content
 *    modification / character import / DLC-pack load / art-behavior-voice change
 *    shows the full TOS again and records an audit entry. An earlier acceptance,
 *    including the persisted first-run one, is never used to skip this prompt.
 * 3. TTS declaration (separate, session+config scoped): shown before synthesised
 *    speech and on every TTS config change; a new session re-confirms. It is
 *    kept in memory only, so it can never become a permanent waiver, and it is
 *    never satisfied by the TOS (nor vice versa).
 * 4. ASR declaration (separate, session+config scoped): shown BEFORE the
 *    microphone is requested. Declining it means `getUserMedia` must not be
 *    called and no audio may be uploaded. It is memory-only, never satisfied by
 *    the TOS or the TTS declaration, and never satisfies either of them.
 */
import {
  createAcceptance,
  createAuditEntry,
  type AuditEntry,
  type AuditKind,
  type ConsentDecision,
  type ConsentMode,
  type StorageLike,
  type TosPrompt,
  type TosPromptReason,
} from './core.ts'
import type { ConsentStorePort, ConsentStoreSnapshot } from './store.ts'
import {
  AGE_DATA_NOTICE,
  AGE_DECLINE_NOTICE,
  AGE_MAX_AGE,
  AGE_MIN_YEAR,
  AGE_MINORS_NOTE,
  AGE_ROLEPLAY_POLICY,
  AGE_SELF_REPORT_NOTICE,
  ageBandView,
  createAgeVerification,
  validateBirthDate,
  type AgeReadStatus,
  type AgeVerification,
  type BirthDateError,
  type BirthDateInput,
} from './age.ts'
import {
  ASR_HASH,
  ASR_SECTIONS,
  ASR_TEXT,
  ASR_TITLE,
  ASR_VERSION,
  CONSENT_ACTIONS,
  ROLEPLAY_HASH,
  ROLEPLAY_SECTIONS,
  ROLEPLAY_TEXT,
  ROLEPLAY_TITLE,
  ROLEPLAY_VERSION,
  STORAGE_WARNING_TEXT,
  TOS_HASH,
  TOS_SECTIONS,
  TOS_TEXT,
  TOS_TITLE,
  TOS_VERSION,
  TTS_HASH,
  TTS_SECTIONS,
  TTS_TEXT,
  TTS_TITLE,
  TTS_VERSION,
  type LegalSection,
} from './terms.ts'
import {
  ROLEPLAY_CAPABILITY_NOTE,
  roleplayConfigSignature,
  validateRoleplaySettings,
  type RoleplaySettings,
  type RoleplayValidation,
} from './roleplay.ts'

export type TtsPromptReason = 'tts-enable' | 'tts-change' | 'tts-confirm'

export interface TtsPrompt {
  readonly reason: TtsPromptReason
  readonly title: string
  readonly ttsVersion: string
  readonly ttsHash: string
  readonly sections: readonly LegalSection[]
  readonly plainText: string
  /** Session/config signature the confirmation applies to. */
  readonly config: string
  readonly storageWarning?: string
}

export type AsrPromptReason = 'asr-enable' | 'asr-change' | 'asr-confirm'

/**
 * Separate ASR (microphone upload) declaration prompt. Like `TtsPrompt` it is
 * scoped to a session/config signature and kept in memory only; unlike TTS it
 * gates `getUserMedia` itself, so a decline must produce no recording at all.
 */
export interface AsrPrompt {
  readonly reason: AsrPromptReason
  readonly title: string
  readonly asrVersion: string
  readonly asrHash: string
  readonly sections: readonly LegalSection[]
  readonly plainText: string
  /** Session/config signature the confirmation applies to. */
  readonly config: string
}

export type AgePromptReason = 'first-run' | 'correct'

/**
 * First-run age verification prompt (self-reported birth date). Shown BEFORE
 * the TOS, always with empty year/month/day selects (no prefill/default). The
 * gate re-validates whatever the UI returns, so a broken/injected dialog can
 * never store a fake future/invalid date.
 */
export interface AgePrompt {
  readonly reason: AgePromptReason
  readonly title: string
  readonly minYear: number
  readonly maxYear: number
  readonly selfReportNotice: string
  readonly roleplayPolicy: string
  readonly dataNotice: string
  readonly minorsNote: string
  readonly declineNotice: string
  /** Why a record must be (re-)entered; never includes a birth date. */
  readonly previousStatus: AgeReadStatus
  /** Today's local date (YYYY-MM-DD); not the user's birth date. */
  readonly todayLabel: string
}

export interface AgeDecision {
  readonly verified: boolean
  /** Only trusted after the gate re-validates it; never pre-filled. */
  readonly year?: number
  readonly month?: number
  readonly day?: number
}

export type AgeFailureReason = 'declined' | 'invalid' | 'unavailable'

export interface AgeCorrectionResult {
  readonly accepted: boolean
  readonly reason?: AgeFailureReason
  readonly errors?: readonly BirthDateError[]
  readonly adult?: boolean
  readonly band?: string
  /** True when an active roleplay session was ended by the correction. */
  readonly roleplayCleared?: boolean
}

/** Read-only age view for UI (age band only — never the full birth date). */
export interface AgeSnapshotView {
  readonly status: AgeReadStatus
  readonly verified: boolean
  readonly adult: boolean | null
  readonly band: string | null
  readonly verifiedAt: string | null
  readonly persistence: 'local' | 'memory'
}

export type RoleplayPromptReason = 'roleplay-start' | 'roleplay-change' | 'roleplay-confirm'

/**
 * Separate roleplay declaration + MANDATORY settings prompt. Shown before any
 * roleplay start and on every settings change; the form must be filled in by the
 * user (no pre-fill) and re-confirmed every time.
 */
export interface RoleplayPrompt {
  readonly reason: RoleplayPromptReason
  readonly title: string
  readonly roleplayVersion: string
  readonly roleplayHash: string
  readonly sections: readonly LegalSection[]
  readonly plainText: string
  /** Truthful capability statement: local template only, no free-form LLM chat. */
  readonly capabilityNote: string
  /** Previous confirmed signature (change flow only); never pre-fills the form. */
  readonly previousSignature?: string
}

export interface RoleplayDecision {
  readonly accepted: boolean
  /** User-filled settings; only valid when `accepted` is true. */
  readonly settings?: RoleplaySettings
}

export type RoleplayFailureReason =
  | 'readonly'
  | 'age-required'
  | 'minor'
  | 'tos-declined'
  | 'roleplay-declined'
  | 'invalid-settings'
  | 'unavailable'

export interface RoleplayRequest {
  /** True when a session is active and the user is changing its settings. */
  readonly change?: boolean
}

export interface RoleplayResult {
  readonly accepted: boolean
  readonly settings?: RoleplaySettings
  readonly signature?: string
  readonly reason?: RoleplayFailureReason
}

export interface RoleplaySessionState {
  readonly active: boolean
  readonly signature: string | null
}

export interface BlockedView {
  readonly reason: 'declined' | 'declined-action' | 'withdrawn' | 'data-wiped' | 'age-required'
  readonly title: string
  readonly detail: string
}

export interface ContentActionRequest {
  /** Stable action id (see CONSENT_ACTIONS), e.g. `content.save-import`. */
  readonly action: string
  readonly detail?: string
  readonly target?: string
}

/** UI port implemented by the DOM modal and by tests. */
export interface ConsentUiPort {
  showTos(prompt: TosPrompt): Promise<ConsentDecision>
  showTts(prompt: TtsPrompt): Promise<boolean>
  /**
   * Optional so a minimal/fake UI stays fail-closed: when absent the gate can
   * never grant ASR consent (no confirmation => no microphone).
   */
  showAsr?(prompt: AsrPrompt): Promise<boolean>
  /**
   * Optional first-run/age-correction prompt. When absent the gate FAILS
   * CLOSED (no verified age => safe read-only, roleplay never starts).
   */
  showAge?(prompt: AgePrompt): Promise<AgeDecision>
  /**
   * Optional roleplay declaration + settings form. When absent the gate fails
   * closed: no roleplay can start and no settings change can be applied.
   */
  showRoleplay?(prompt: RoleplayPrompt): Promise<RoleplayDecision>
  showBlocked?(view: BlockedView): void
  hideBlocked?(): void
  notify?(message: string): void
}

export interface ConsentGateOptions {
  readonly ui: ConsentUiPort
  readonly store: ConsentStorePort
  readonly now?: () => Date
}

export interface ConsentSnapshotView {
  readonly mode: ConsentMode
  readonly tosVersion: string
  readonly tosHash: string
  readonly acceptedAt: string | null
  readonly persistence: 'local' | 'memory'
  readonly status: ConsentStoreSnapshot['status']
  readonly corrupt: boolean
  readonly ttsConfirmedThisSession: boolean
  readonly asrConfirmedThisSession: boolean
  readonly roleplayActiveThisSession: boolean
  readonly roleplaySignature: string | null
  /** Age self-report status (never the full birth date). */
  readonly ageStatus: AgeReadStatus
  readonly ageVerified: boolean
  readonly ageAdult: boolean | null
  readonly ageBand: string | null
  readonly ageVerifiedAt: string | null
}

export interface ConsentWithdrawalResult {
  readonly acceptanceCleared: boolean
  readonly auditRetained: number
  readonly sessionConsentCleared: boolean
  readonly mode: ConsentMode
}

export interface ConsentWipeResult {
  readonly acceptanceCleared: boolean
  readonly auditCleared: boolean
  readonly sessionConsentCleared: boolean
  /** The self-reported birth-date record is included in "delete all data". */
  readonly ageCleared: boolean
  readonly mode: ConsentMode
}

export const WITHDRAWN_BLOCKED_VIEW: BlockedView = {
  reason: 'withdrawn',
  title: '已撤回同意，进入安全只读模式',
  detail:
    '你已撤回对《使用条款、免责声明与用户同意书》的同意。语音/内容处理已停止，应用不会加载、修改或写入本机数据；可重新阅读并同意，或退出应用。撤回不会删除你的存档、记忆或导出文件；同意审计记录只保留必要字段，可在声明面板中查看并清除。',
}

export const DATA_WIPED_BLOCKED_VIEW: BlockedView = {
  reason: 'data-wiped',
  title: '本机数据已删除，进入安全只读模式',
  detail:
    '“删除全部本地数据”已执行，TOS 同意记录也一并清除。可重新阅读并同意以重新开始，或退出应用。无法删除或无法核验的项目已在清除结果中逐项列出（残留不视为成功）。',
}

export const READONLY_BLOCKED_VIEW: BlockedView = {
  reason: 'declined',
  title: '已进入安全只读模式',
  detail:
    '你未同意《使用条款、免责声明与用户同意书》。为避免在你未同意时加载内容或写入本机数据，应用已进入安全只读模式；可重新阅读条款并同意，或退出应用。',
}

/**
 * Shown when the first-run age verification is declined/cancelled or cannot be
 * completed. This is NOT a consent step that can be silently skipped: without a
 * verified self-reported birth date the app stays read-only, and roleplay can
 * never start. Retrying re-runs age -> TOS in that order.
 */
export const AGE_REQUIRED_BLOCKED_VIEW: BlockedView = {
  reason: 'age-required',
  title: '未完成年龄核验，进入安全只读模式',
  detail:
    '首次启动必须先完成年龄核验（由你选择出生年/月/日并显式确认，仅存本机）：一般桌宠功能全年龄可用，但角色扮演/情感陪伴仅限年满 18 周岁用户。你取消或未完成核验，应用不会进入正常交互，也不会静默跳过；可重新完成年龄核验并阅读同意 TOS，或退出应用。',
}

export class ConsentGate {
  private readonly ui: ConsentUiPort
  private readonly store: ConsentStorePort
  private readonly now: () => Date
  private modeValue: ConsentMode = 'pending'
  private bootPromise: Promise<ConsentMode> | null = null
  private latestSnapshot: ConsentStoreSnapshot | null = null
  private ttsConfirmedConfig: string | null = null
  private ttsDeclinedConfig: string | null = null
  private asrConfirmedConfig: string | null = null
  private asrDeclinedConfig: string | null = null
  private asrPromptInFlight: { config: string; promise: Promise<boolean> } | null = null
  private roleplaySignature: string | null = null
  private roleplayPromptInFlight: Promise<RoleplayResult> | null = null
  private ageValue: AgeVerification | null = null
  private ageReadStatusValue: AgeReadStatus = 'missing'

  constructor(options: ConsentGateOptions) {
    this.ui = options.ui
    this.store = options.store
    this.now = options.now ?? (() => new Date())
  }

  get mode(): ConsentMode {
    return this.modeValue
  }

  /** True only after the current TOS version+hash was explicitly accepted. */
  canInteract(): boolean {
    return this.modeValue === 'accepted'
  }

  /**
   * First-run/upgrade check. Idempotent: concurrent callers share one prompt.
   * Missing/corrupt/version-mismatched acceptance => full TOS modal.
   */
  async bootstrap(): Promise<ConsentMode> {
    if (this.bootPromise) return this.bootPromise
    this.bootPromise = this.runBootstrap()
    return this.bootPromise
  }

  private async runBootstrap(): Promise<ConsentMode> {
    // ORDER IS A HARD CONTRACT (user decision): age self-report -> TOS -> app.
    // General features stay all-ages; roleplay is 18+ and checked separately.
    const ageOk = await this.ensureAgeVerification()
    if (!ageOk) {
      this.modeValue = 'readonly'
      this.ui.showBlocked?.(AGE_REQUIRED_BLOCKED_VIEW)
      return this.modeValue
    }
    const snapshot = this.store.load()
    this.latestSnapshot = snapshot
    if (snapshot.status === 'accepted') {
      this.modeValue = 'accepted'
      return this.modeValue
    }
    const reason: TosPromptReason =
      snapshot.status === 'version-mismatch' || snapshot.status === 'hash-mismatch' || snapshot.acceptance
        ? 'version-upgrade'
        : 'first-run'
    const decision = await this.ui.showTos(this.tosPrompt(reason, snapshot))
    if (decision === 'accept') return this.acceptInitial(reason)
    this.record({ kind: 'tos', action: 'tos.decline', decision: 'decline' })
    this.modeValue = 'readonly'
    this.ui.showBlocked?.(READONLY_BLOCKED_VIEW)
    return this.modeValue
  }

  /** Re-open the full TOS from the read-only screen; acceptance lifts the block. */
  async retryInitialConsent(): Promise<ConsentMode> {
    if (this.modeValue === 'accepted') return this.modeValue
    this.modeValue = 'pending'
    this.bootPromise = null
    return this.bootstrap()
  }

  // -------------------------------------------------------------------------
  // Age verification (self-reported birth date) — general all-ages, roleplay 18+
  // -------------------------------------------------------------------------

  /**
   * Re-read the persisted self-report so external deletion/corruption fails
   * closed instead of relying on a stale in-memory value.
   */
  private refreshAgeFromStore(): void {
    const loaded = this.store.loadAge(this.now())
    this.ageReadStatusValue = loaded.status
    this.ageValue = loaded.status === 'verified' ? loaded.record : null
  }

  private agePromptValue(reason: AgePromptReason): AgePrompt {
    const now = this.now()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return {
      reason,
      title:
        reason === 'correct'
          ? '更正年龄（重新核验，自报出生日期）'
          : '首次启动：年龄核验（请选择你的出生年/月/日）',
      minYear: AGE_MIN_YEAR,
      maxYear: now.getFullYear(),
      selfReportNotice: AGE_SELF_REPORT_NOTICE,
      roleplayPolicy: AGE_ROLEPLAY_POLICY,
      dataNotice: AGE_DATA_NOTICE,
      minorsNote: AGE_MINORS_NOTE,
      declineNotice: AGE_DECLINE_NOTICE,
      previousStatus: this.ageReadStatusValue,
      todayLabel: today,
    }
  }

  /** Public so the DOM layer can open the same correction dialog from About. */
  agePrompt(reason: AgePromptReason): AgePrompt {
    return this.agePromptValue(reason)
  }

  /**
   * First-run/upgrade age step. Fail closed: no UI -> no verification -> no app.
   * Declining/cancelling resolves false (the caller shows safe read-only) and is
   * audit-recorded without any birth-date data.
   */
  private async ensureAgeVerification(): Promise<boolean> {
    const now = this.now()
    const loaded = this.store.loadAge(now)
    this.ageReadStatusValue = loaded.status
    if (loaded.status === 'verified' && loaded.record) {
      this.ageValue = loaded.record
      return true
    }
    this.ageValue = null
    if (!this.ui.showAge) return false
    let decision: AgeDecision
    try {
      decision = await this.ui.showAge(this.agePromptValue('first-run'))
    } catch {
      decision = { verified: false }
    }
    if (!decision.verified) {
      this.record({ kind: 'age', action: CONSENT_ACTIONS.ageDecline, decision: 'decline', target: 'self-reported' })
      return false
    }
    const validation = validateBirthDate(
      {
        year: typeof decision.year === 'number' ? decision.year : null,
        month: typeof decision.month === 'number' ? decision.month : null,
        day: typeof decision.day === 'number' ? decision.day : null,
      },
      now,
    )
    if (!validation.ok) {
      // Defence in depth: never store an invalid/future/over-limit date even if
      // an injected UI claimed it was verified.
      this.record({ kind: 'age', action: CONSENT_ACTIONS.ageDecline, decision: 'decline', target: 'invalid-input' })
      return false
    }
    const record = createAgeVerification(validation.year, validation.month, validation.day, now.toISOString())
    this.store.saveAge(record)
    this.ageValue = record
    this.ageReadStatusValue = 'verified'
    // Audit keeps only minimal fields; the birth date is NEVER written here.
    this.record({ kind: 'age', action: CONSENT_ACTIONS.ageVerify, decision: 'accept', target: 'self-reported' })
    return true
  }

  /** True only when a valid self-reported birth date is on record. */
  isAgeVerified(): boolean {
    this.refreshAgeFromStore()
    return this.ageValue !== null
  }

  /** null = not verified; otherwise whether the user is 18+. */
  isAdult(): boolean | null {
    this.refreshAgeFromStore()
    if (!this.ageValue) return null
    return ageBandView(this.ageValue, this.now()).adult
  }

  /** Read-only age band view for About/setup (never the full birth date). */
  ageSnapshot(): AgeSnapshotView {
    this.refreshAgeFromStore()
    const persistence = this.store.persistence
    if (!this.ageValue) {
      return {
        status: this.ageReadStatusValue,
        verified: false,
        adult: null,
        band: null,
        verifiedAt: null,
        persistence,
      }
    }
    const view = ageBandView(this.ageValue, this.now())
    return {
      status: 'verified',
      verified: true,
      adult: view.adult,
      band: view.band,
      verifiedAt: view.verifiedAt,
      persistence,
    }
  }

  /**
   * Correct the self-reported birth date: re-validate, save, record the
   * correction, and END any active roleplay session (the old declaration was
   * made under a different age claim). TOS is not re-accepted because its text
   * and hash did not change; roleplay always re-confirms the full TOS + its own
   * declaration on the next start anyway.
   */
  reverifyAge(input: BirthDateInput): AgeCorrectionResult {
    if (this.modeValue !== 'accepted') return { accepted: false, reason: 'unavailable' }
    const now = this.now()
    const validation = validateBirthDate(input, now)
    if (!validation.ok) {
      this.record({
        kind: 'age',
        action: CONSENT_ACTIONS.ageCorrect,
        decision: 'decline',
        target: validation.errors[0],
      })
      return { accepted: false, reason: 'invalid', errors: validation.errors }
    }
    const roleplayCleared = this.roleplaySignature !== null
    if (roleplayCleared) this.exitRoleplay()
    const record = createAgeVerification(validation.year, validation.month, validation.day, now.toISOString())
    this.store.saveAge(record)
    this.ageValue = record
    this.ageReadStatusValue = 'verified'
    this.record({ kind: 'age', action: CONSENT_ACTIONS.ageCorrect, decision: 'accept', target: 'self-reported' })
    const view = ageBandView(record, now)
    return { accepted: true, adult: view.adult, band: view.band, roleplayCleared }
  }

  private acceptInitial(reason: TosPromptReason): ConsentMode {
    const acceptance = createAcceptance(TOS_VERSION, TOS_HASH, this.now().toISOString())
    this.store.saveAcceptance(acceptance)
    this.record({
      kind: 'tos',
      action: reason === 'version-upgrade' ? CONSENT_ACTIONS.versionUpgrade : CONSENT_ACTIONS.firstRun,
      decision: 'accept',
    })
    this.modeValue = 'accepted'
    this.ui.hideBlocked?.()
    return this.modeValue
  }

  private tosPrompt(
    reason: TosPromptReason,
    snapshot: ConsentStoreSnapshot | null,
    request?: ContentActionRequest,
  ): TosPrompt {
    const warning =
      snapshot && (snapshot.persistence === 'memory' || snapshot.storageError || snapshot.corrupt)
        ? STORAGE_WARNING_TEXT
        : undefined
    return {
      reason,
      title: TOS_TITLE,
      tosVersion: TOS_VERSION,
      tosHash: TOS_HASH,
      sections: TOS_SECTIONS,
      plainText: TOS_TEXT,
      ...(warning ? { storageWarning: warning } : {}),
      ...(snapshot?.acceptance
        ? { previousTosVersion: snapshot.acceptance.tosVersion, previousTosHash: snapshot.acceptance.tosHash }
        : {}),
      ...(request ? { action: request.action, detail: request.detail, target: request.target } : {}),
    }
  }

  /**
   * Per-action full disclaimer. ALWAYS prompts, even when the current TOS was
   * accepted seconds ago; success is NOT written into the acceptance record.
   */
  async requireAction(request: ContentActionRequest): Promise<boolean> {
    if (this.modeValue === 'pending') await this.bootstrap()
    if (this.modeValue !== 'accepted') return false
    const decision = await this.ui.showTos(this.tosPrompt('action', this.latestSnapshot, request))
    if (decision === 'accept') {
      // Audit minimization: the action id + TOS version/hash identify the
      // disclosure; the verbose `detail` copy is never persisted and no user
      // text/target content is stored beyond the bounded scope id.
      this.record({
        kind: 'action',
        action: request.action,
        decision: 'accept',
        ...(request.target ? { target: request.target } : {}),
      })
      return true
    }
    this.record({
      kind: 'action',
      action: request.action,
      decision: 'decline',
      ...(request.target ? { target: request.target } : {}),
    })
    return false
  }

  /**
   * TTS gate. Confirmation is memory-only and scoped to `config`; config
   * changes and new sessions therefore re-prompt. A decline is remembered for
   * the same config (subtitles-only) until an explicit re-confirmation request.
   */
  async ensureTts(config: string): Promise<boolean> {
    if (this.modeValue === 'pending') await this.bootstrap()
    if (this.modeValue !== 'accepted') return false
    if (this.ttsConfirmedConfig === config) return true
    if (this.ttsDeclinedConfig === config) return false
    const reason: TtsPromptReason =
      this.ttsConfirmedConfig !== null || this.ttsDeclinedConfig !== null ? 'tts-change' : 'tts-enable'
    return this.promptTts(config, reason)
  }

  /** Explicit "TTS 声明" entry (About/menu) — always shows the declaration. */
  async requestTtsConfirmation(config: string): Promise<boolean> {
    if (this.modeValue === 'pending') await this.bootstrap()
    if (this.modeValue !== 'accepted') return false
    return this.promptTts(config, 'tts-confirm')
  }

  private async promptTts(config: string, reason: TtsPromptReason): Promise<boolean> {
    const accepted = await this.ui.showTts({
      reason,
      title: TTS_TITLE,
      ttsVersion: TTS_VERSION,
      ttsHash: TTS_HASH,
      sections: TTS_SECTIONS,
      plainText: TTS_TEXT,
      config,
    })
    if (accepted) {
      this.ttsConfirmedConfig = config
      this.ttsDeclinedConfig = null
      this.record({
        kind: 'tts',
        action: CONSENT_ACTIONS.ttsConfirm,
        decision: 'accept',
        target: config,
        ttsVersion: TTS_VERSION,
        ttsHash: TTS_HASH,
      })
      return true
    }
    this.ttsConfirmedConfig = null
    this.ttsDeclinedConfig = config
    this.record({
      kind: 'tts',
      action: CONSENT_ACTIONS.ttsConfirm,
      decision: 'decline',
      target: config,
      ttsVersion: TTS_VERSION,
      ttsHash: TTS_HASH,
    })
    return false
  }

  /**
   * ASR gate: independent from `ensureTts`. TOS acceptance and the TTS
   * declaration are deliberately NOT accepted as ASR consent. A decline is
   * remembered for the same config so the user is not spammed; a new session
   * (fresh gate) or a config change re-prompts. Concurrent calls share one
   * prompt, so a double-click cannot open two dialogs.
   */
  async ensureAsr(config: string): Promise<boolean> {
    if (this.modeValue === 'pending') await this.bootstrap()
    if (this.modeValue !== 'accepted') return false
    if (this.asrConfirmedConfig === config) return true
    if (this.asrDeclinedConfig === config) return false
    const reason: AsrPromptReason =
      this.asrConfirmedConfig !== null || this.asrDeclinedConfig !== null ? 'asr-change' : 'asr-enable'
    return this.promptAsr(config, reason)
  }

  /** Explicit "ASR 声明" entry (About/menu) — always shows the declaration. */
  async requestAsrConfirmation(config: string): Promise<boolean> {
    if (this.modeValue === 'pending') await this.bootstrap()
    if (this.modeValue !== 'accepted') return false
    return this.promptAsr(config, 'asr-confirm')
  }

  private promptAsr(config: string, reason: AsrPromptReason): Promise<boolean> {
    const inFlight = this.asrPromptInFlight
    if (inFlight && inFlight.config === config) return inFlight.promise
    let tracked!: Promise<boolean>
    tracked = this.runAsrPrompt(config, reason).finally(() => {
      if (this.asrPromptInFlight?.promise === tracked) this.asrPromptInFlight = null
    })
    this.asrPromptInFlight = { config, promise: tracked }
    return tracked
  }

  private async runAsrPrompt(config: string, reason: AsrPromptReason): Promise<boolean> {
    // Fail closed when the injected UI has no ASR dialog: no confirmation is
    // possible, so the microphone must stay closed.
    if (!this.ui.showAsr) return false
    const accepted = await this.ui.showAsr({
      reason,
      title: ASR_TITLE,
      asrVersion: ASR_VERSION,
      asrHash: ASR_HASH,
      sections: ASR_SECTIONS,
      plainText: ASR_TEXT,
      config,
    })
    if (accepted) {
      this.asrConfirmedConfig = config
      this.asrDeclinedConfig = null
      this.record({
        kind: 'asr',
        action: CONSENT_ACTIONS.asrConfirm,
        decision: 'accept',
        target: config,
        asrVersion: ASR_VERSION,
        asrHash: ASR_HASH,
      })
      return true
    }
    this.asrConfirmedConfig = null
    this.asrDeclinedConfig = config
    this.record({
      kind: 'asr',
      action: CONSENT_ACTIONS.asrConfirm,
      decision: 'decline',
      target: config,
      asrVersion: ASR_VERSION,
      asrHash: ASR_HASH,
    })
    return false
  }

  // -------------------------------------------------------------------------
  // Roleplay declaration + mandatory settings form (all-ages, local template)
  // -------------------------------------------------------------------------

  roleplayState(): RoleplaySessionState {
    return { active: this.roleplaySignature !== null, signature: this.roleplaySignature }
  }

  /**
   * Start or change roleplay. ALWAYS shows the FULL TOS first and then the
   * separate roleplay declaration + mandatory settings form — even when the
   * current TOS/roleplay version was accepted seconds ago. An earlier TOS, TTS
   * or ASR confirmation (and any audit record) never satisfies this. Declining
   * either step starts/changes nothing, so no roleplay state is created.
   *
   * `change:true` (only when a session is already active) marks an attempted
   * settings change; the resulting signature identifies the confirmed settings
   * for the audit target (the typed address is hashed, never persisted raw).
   */
  async requestRoleplay(options: RoleplayRequest = {}): Promise<RoleplayResult> {
    const inFlight = this.roleplayPromptInFlight
    if (inFlight) return inFlight
    let tracked!: Promise<RoleplayResult>
    tracked = this.runRoleplayPrompt(options).finally(() => {
      if (this.roleplayPromptInFlight === tracked) this.roleplayPromptInFlight = null
    })
    this.roleplayPromptInFlight = tracked
    return tracked
  }

  private async runRoleplayPrompt(options: RoleplayRequest): Promise<RoleplayResult> {
    if (this.modeValue === 'pending') await this.bootstrap()
    if (this.modeValue !== 'accepted') return { accepted: false, reason: 'readonly' }
    // AGE GATE (roleplay/emotional companionship is 18+ ONLY): check BEFORE
    // showing the full TOS/declaration form. No verification or a minor result
    // creates no roleplay state and opens no form. General features remain
    // available to everyone (only roleplay is age-restricted).
    this.refreshAgeFromStore()
    if (!this.ageValue) return { accepted: false, reason: 'age-required' }
    if (!ageBandView(this.ageValue, this.now()).adult) return { accepted: false, reason: 'minor' }
    const change = options.change === true && this.roleplaySignature !== null
    const action = change ? CONSENT_ACTIONS.roleplayChange : CONSENT_ACTIONS.roleplayStart
    // Step 1: FULL TOS every time (never exempted by the first-run acceptance).
    const tosAccepted = await this.requireAction({
      action,
      detail: change
        ? '变更角色扮演设定（场景/关系边界/语气/称呼/角色）属于设定变更：每次变更都必须重新阅读完整免责声明与本角色扮演声明，并重新填写、逐项确认。'
        : '开始角色扮演：每次开始都必须重新阅读完整免责声明与本角色扮演声明，并重新填写、逐项确认。',
      target: change && this.roleplaySignature ? this.roleplaySignature : 'roleplay',
    })
    if (!tosAccepted) return { accepted: false, reason: 'tos-declined' }
    // Step 2: separate declaration + mandatory settings form (fail closed when
    // the injected UI has no roleplay dialog: no dialog => no roleplay).
    if (!this.ui.showRoleplay) return { accepted: false, reason: 'unavailable' }
    let decision: RoleplayDecision
    try {
      decision = await this.ui.showRoleplay(this.roleplayPrompt(change ? 'roleplay-change' : 'roleplay-start'))
    } catch {
      decision = { accepted: false }
    }
    if (!decision.accepted) {
      this.record({
        kind: 'roleplay',
        action: CONSENT_ACTIONS.roleplayConfirm,
        decision: 'decline',
        target: 'roleplay',
        roleplayVersion: ROLEPLAY_VERSION,
        roleplayHash: ROLEPLAY_HASH,
      })
      return { accepted: false, reason: 'roleplay-declined' }
    }
    const validation: RoleplayValidation = validateRoleplaySettings(decision.settings)
    if (!validation.ok) {
      // Defence in depth: the modal blocks invalid/empty forms, but a broken or
      // injected UI can never force an adult/intimate or unconfirmed setting in.
      this.record({
        kind: 'roleplay',
        action: CONSENT_ACTIONS.roleplayConfirm,
        decision: 'decline',
        target: 'invalid-settings',
        roleplayVersion: ROLEPLAY_VERSION,
        roleplayHash: ROLEPLAY_HASH,
      })
      return { accepted: false, reason: 'invalid-settings' }
    }
    const signature = roleplayConfigSignature(validation.settings)
    this.roleplaySignature = signature
    this.record({
      kind: 'roleplay',
      action: CONSENT_ACTIONS.roleplayConfirm,
      decision: 'accept',
      target: signature,
      roleplayVersion: ROLEPLAY_VERSION,
      roleplayHash: ROLEPLAY_HASH,
    })
    return { accepted: true, settings: validation.settings, signature }
  }

  /** End roleplay (user entry/exit or consent withdrawal); records only. */
  exitRoleplay(): boolean {
    const wasActive = this.roleplaySignature !== null
    this.roleplaySignature = null
    this.roleplayPromptInFlight = null
    if (!wasActive) return false
    this.record({
      kind: 'roleplay',
      action: CONSENT_ACTIONS.roleplayExit,
      decision: 'ack',
      target: 'roleplay',
      roleplayVersion: ROLEPLAY_VERSION,
      roleplayHash: ROLEPLAY_HASH,
    })
    return true
  }

  private roleplayPrompt(reason: RoleplayPromptReason): RoleplayPrompt {
    return {
      reason,
      title: ROLEPLAY_TITLE,
      roleplayVersion: ROLEPLAY_VERSION,
      roleplayHash: ROLEPLAY_HASH,
      sections: ROLEPLAY_SECTIONS,
      plainText: ROLEPLAY_TEXT,
      capabilityNote: ROLEPLAY_CAPABILITY_NOTE,
      ...(this.roleplaySignature ? { previousSignature: this.roleplaySignature } : {}),
    }
  }

  recordHealthReminder(): void {
    this.record({ kind: 'health', action: 'health.2h-reminder', decision: 'ack' })
  }

  /** Drop every in-memory session consent (TTS/ASR/declines/in-flight prompts). */
  private clearSessionConsent(): void {
    this.ttsConfirmedConfig = null
    this.ttsDeclinedConfig = null
    this.asrConfirmedConfig = null
    this.asrDeclinedConfig = null
    this.asrPromptInFlight = null
    this.roleplaySignature = null
    this.roleplayPromptInFlight = null
  }

  /**
   * Withdraw consent (PIPL 15 / R-P0-06): stop treating the user as consented,
   * clear the persisted TOS acceptance, clear this session's TTS/ASR
   * confirmations, COMPACT the consent audit to the minimized whitelist (no
   * `detail`/free text) and leave the app in safe read-only mode.
   *
   * The audit log is deliberately retained in minimized form (the TOS §13
   * promises an audit trail; the UI explains how to clear it). It never grants
   * anything: the mode is read-only and `canInteract()` is false.
   */
  withdrawConsent(): ConsentWithdrawalResult {
    this.clearSessionConsent()
    const acceptanceCleared = this.store.clearAcceptance()
    const recorded = this.record({ kind: 'tos', action: CONSENT_ACTIONS.withdraw, decision: 'ack' })
    this.modeValue = 'readonly'
    this.bootPromise = null
    this.latestSnapshot = this.store.load()
    const auditRetained = recorded ? this.store.compactAudit() : this.store.readAudit().length
    return {
      acceptanceCleared: acceptanceCleared && this.latestSnapshot.acceptance === null,
      auditRetained,
      sessionConsentCleared: true,
      mode: this.modeValue,
    }
  }

  /** User-initiated clear of the consent audit (About); never touches acceptance. */
  clearAudit(): boolean {
    return this.store.clearAudit()
  }

  /**
   * One-shot reset used by "delete all local data": clear the acceptance + the
   * consent audit from BOTH the real storage and the session memory mirror and
   * force read-only, so nothing can re-create files after the wipe. Does not
   * write a tombstone (the wipe must leave no consent records behind).
   */
  wipeLocalConsentState(): ConsentWipeResult {
    this.clearSessionConsent()
    const acceptanceCleared = this.store.clearAcceptance()
    const auditCleared = this.store.clearAudit()
    // "Delete all local data" explicitly includes the age self-report.
    const ageCleared = this.store.clearAge() && this.store.loadAge(this.now()).record === null
    this.ageValue = null
    this.ageReadStatusValue = 'missing'
    this.modeValue = 'readonly'
    this.bootPromise = null
    this.latestSnapshot = this.store.load()
    return {
      acceptanceCleared: acceptanceCleared && this.latestSnapshot.acceptance === null,
      auditCleared,
      sessionConsentCleared: true,
      ageCleared,
      mode: this.modeValue,
    }
  }

  private record(input: {
    readonly kind: AuditKind
    readonly action: string
    readonly decision: AuditEntry['decision']
    readonly target?: string
    readonly ttsVersion?: string
    readonly ttsHash?: string
    readonly asrVersion?: string
    readonly asrHash?: string
    readonly roleplayVersion?: string
    readonly roleplayHash?: string
  }): boolean {
    const entry = createAuditEntry({
      kind: input.kind,
      action: input.action,
      decision: input.decision,
      at: this.now().toISOString(),
      ...(input.target ? { target: input.target } : {}),
      ...(input.ttsVersion ? { ttsVersion: input.ttsVersion } : {}),
      ...(input.ttsHash ? { ttsHash: input.ttsHash } : {}),
      ...(input.asrVersion ? { asrVersion: input.asrVersion } : {}),
      ...(input.asrHash ? { asrHash: input.asrHash } : {}),
      ...(input.roleplayVersion ? { roleplayVersion: input.roleplayVersion } : {}),
      ...(input.roleplayHash ? { roleplayHash: input.roleplayHash } : {}),
    })
    return this.store.appendAudit(entry)
  }

  audit(): AuditEntry[] {
    return this.store.readAudit()
  }

  /** True only after a persisted acceptance of the CURRENT version+hash exists. */
  hasPersistedAcceptance(): boolean {
    return this.store.load().status === 'accepted'
  }

  snapshot(): ConsentSnapshotView {
    const snapshot = this.latestSnapshot ?? this.store.load()
    return {
      mode: this.modeValue,
      tosVersion: TOS_VERSION,
      tosHash: TOS_HASH,
      acceptedAt: snapshot.acceptance?.acceptedAt ?? null,
      persistence: snapshot.persistence,
      status: snapshot.status,
      corrupt: snapshot.corrupt,
      ttsConfirmedThisSession: this.ttsConfirmedConfig !== null,
      asrConfirmedThisSession: this.asrConfirmedConfig !== null,
      roleplayActiveThisSession: this.roleplaySignature !== null,
      roleplaySignature: this.roleplaySignature,
      ...this.ageSnapshotFields(),
    }
  }

  /** Flat age fields for `snapshot()` (age band only, never the birth date). */
  private ageSnapshotFields(): Pick<
    ConsentSnapshotView,
    'ageStatus' | 'ageVerified' | 'ageAdult' | 'ageBand' | 'ageVerifiedAt'
  > {
    const age = this.ageSnapshot()
    return {
      ageStatus: age.status,
      ageVerified: age.verified,
      ageAdult: age.adult,
      ageBand: age.band,
      ageVerifiedAt: age.verifiedAt,
    }
  }
}

export function createConsentGate(options: ConsentGateOptions): ConsentGate {
  return new ConsentGate(options)
}

/** Minimal structural gate used by guarded content helpers/tests. */
export interface ConsentRequester {
  requireAction(request: ContentActionRequest): Promise<boolean>
}

/** Build a fake storage surface for tests (re-exported convenience). */
export function testStorage(initial: Readonly<Record<string, string>> = {}): StorageLike {
  const entries = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key) => (entries.has(key) ? entries.get(key)! : null),
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  }
}
