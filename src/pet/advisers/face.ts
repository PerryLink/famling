/**
 * Advisers face controller: consume the read-only Pet Brief and drive the
 * existing pet presentation (bubble/pose) without coupling the pet to the
 * Advisers database. Normal pat/drag/talk continue to flow through the shell.
 *
 * Transport is a fixed local file (`~/.advisers/pet-brief.json`) read by the
 * Tauri command `read_advisers_brief`; browsers (no Tauri) report `no-transport`.
 * The brief is always validated (schema/TTL/redaction) before any use.
 *
 * Contract v0.2 channel (2026-11-17): accepts `schemaVersion 1` (legacy, warned
 * and treated as `private`) and `2`; a future `schemaVersion` is refused
 * fail-closed as `UNSUPPORTED_SCHEMA` (never parsed as v0.1, never rendered as
 * `public`). `displayPolicy` is normalized onto the status/summary: `none`
 * skips the brief and drops any retained brief (no text/voice/mood/count
 * side channel), `private` is the default for v0.1 and for a missing field.
 *
 * Hardening (audit NONART-PRODUCT A3/A4, 2026-11-17):
 * - every read is bounded by `timeoutMs`; a timed-out read is aborted (frontend
 *   side: the sync Rust command cannot be interrupted, but we stop waiting and
 *   ignore its late result) and classified as `TIMEOUT` / state `error`;
 * - concurrent `sync()` calls share one in-flight read (`in-flight` dedupe);
 * - `stop()` aborts the in-flight read and a late result can no longer publish
 *   a status, fire a directive, or keep the previously accepted brief in memory;
 * - statuses carry a coarse `state` (disabled/unavailable/error/stale/ok), a
 *   stable `code`, `lastAttemptAt` / `lastSuccessAt` / `lastSyncAt` timestamps,
 *   a sanitized `lastError`, and `retryable`; `retry()` and a pure
 *   `describeAdvisersFaceStatus()` hook are provided for the status line and a
 *   retry button (the main.ts DOM wiring is out of this module's scope);
 * - automatic polling backs off on consecutive read failures (see
 *   `advisersRetryDelayMs`), manual `retry()` bypasses the backoff;
 * - error messages are sanitized (local paths redacted) before any display/status;
 * - the 128 KiB producer/transport cap is re-enforced here (defense in depth for
 *   injected/browser readers) before schema validation;
 * - a consent port (`isReadAllowed`) is injected by the host: before the
 *   explicit bootstrap TOS acceptance `start()`/`sync()`/`retry()` never call the
 *   reader and report `consent-required` instead (P1-3: no local read/display
 *   before consent).
 * Privacy boundary is unchanged: read-only, no network, no writes, no
 * suggestedLines, no raw brief text in statuses (only codes/counts).
 *
 * Contract v0.2 `displayPolicy` UI enforcement (2026-11-17) lives in this
 * module below the controller, because `status`/`summary` now carry the
 * normalized policy and the panel display rules are pure decisions:
 * `resolveAdvisersPanelPolicy()` turns a brief/status into the visible policy
 * (explicit `private`/`public`/`none`, or fail-closed `private` + warning for a
 * missing/unknown value) and `AdvisersPanelPrivacyGuard` implements the
 * panel-session rules — private: hide after 30 s or immediately on window
 * blur / hidden tab / pagehide; public: visible explicit marker and no
 * privacy-only hiding; none: never render/retain brief-derived content.
 * The guard is DOM-free and owns no storage: `main.ts` injects the DOM clears
 * through `onHide`, so no brief text is cached by this layer.
 */
import {
  PET_BRIEF_MAX_BYTES,
  PET_BRIEF_SCHEMA_VERSION,
  isExpired,
  petBriefByteLength,
  toPresenceEvent,
  validatePetBrief,
  type PetBrief,
  type PetBriefDisplayPolicy,
  type PetBriefWarning,
} from '../../presence/pet-brief.ts'
import { PresenceProjector } from '../../presence/projector.ts'
import { DEFAULT_PRESENCE_POLICY, type PetDirective, type PresencePolicy } from '../../presence/types.ts'

export type AdvisersFaceReason =
  | 'disabled'
  | 'no-transport'
  | 'no-file'
  | 'invalid'
  | 'skipped'
  | 'fresh'
  | 'stale'
  | 'quiet-or-deduped'
  | 'consent-required'
  | 'producer-tos-required'
  | 'error'

/** Coarse classification for the status line / panel (disabled vs stale vs error). */
export type AdvisersFaceState = 'disabled' | 'unavailable' | 'error' | 'stale' | 'ok'

/** Stable machine-readable status code; never derived from brief content. */
export type AdvisersFaceCode =
  | 'DISABLED'
  | 'NO_TRANSPORT'
  | 'NO_FILE'
  | 'TIMEOUT'
  | 'READ_ERROR'
  | 'TOO_LARGE'
  | 'INVALID_BRIEF'
  | 'UNSUPPORTED_SCHEMA'
  | 'SKIPPED'
  | 'STALE'
  | 'FRESH'
  | 'QUIET_OR_DEDUPED'
  | 'CONSENT_REQUIRED'
  | 'PRODUCER_TOS_REQUIRED'

/** Must match the Tauri command / producer cap (`app/tauri/.../main.rs`). */
export const ADVISERS_BRIEF_MAX_BYTES = PET_BRIEF_MAX_BYTES
/** Upper bound for one read attempt (network drives / hung command guard). */
export const ADVISERS_BRIEF_TIMEOUT_MS = 8_000
export const ADVISERS_SYNC_INTERVAL_MS = 60_000
export const ADVISERS_MAX_SYNC_INTERVAL_MS = 300_000

/**
 * Producer-side Advisers TOS gate. Advisers 0.3.0 bumps TOS to v2026.11.3 and
 * its gated `pet-brief` command exits 3 with `E_TOS_REQUIRED` until the user
 * re-consents; the old v2026.11.2 consent is not valid. The desktop path only
 * reads the produced file, so this signal is surfaced only when a reader or a
 * future diagnostic reports the producer error (see README/docs). The pet must
 * never accept TOS or write a consent record on the producer behalf.
 */
export const ADVISERS_PRODUCER_TOS_CODE = 'E_TOS_REQUIRED'
export const ADVISERS_PRODUCER_TOS_VERSION = '2026.11.3'
export const ADVISERS_PRODUCER_TOS_STATUS_TEXT = 'Advisers：生产者需重新同意 TOS v2026.11.3（只读）'
/** Fixed, content-free re-consent instructions; safe to render in the status/panel. */
export const ADVISERS_PRODUCER_TOS_GUIDANCE_LINES = [
  'Advisers 生产者需要重新同意使用条款（TOS v2026.11.3；Advisers 0.3.0 起旧同意失效）。',
  '在终端运行 `advisers tos show` 查看全文，再用交互式 `advisers tos accept` 重新同意。',
  '定时任务/非交互环境：显式加 `--accept-tos` 或设置 `ADVISERS_ACCEPT_TOS=1`（记录为非交互同意）。',
  '桌面端不代你同意、不修改 Advisers 的同意记录；完成后再点“重试”。',
] as const
export const ADVISERS_PRODUCER_TOS_GUIDANCE = ADVISERS_PRODUCER_TOS_GUIDANCE_LINES.join('\n')

/** Largest backoff exponent; keeps `base * 2^n` from overflowing. */
const BACKOFF_MAX_EXPONENT = 6
const MAX_ERROR_MESSAGE_LENGTH = 180

export interface AdvisersFaceStatus {
  enabled: boolean
  ok: boolean
  reason: AdvisersFaceReason
  /** Coarse state for UI styling (data-state/panel title). */
  state: AdvisersFaceState
  /** Stable code for the status line/logs; safe to display. */
  code: AdvisersFaceCode
  /** True when a manual retry (or the next poll) can plausibly succeed. */
  retryable: boolean
  /** When the latest read attempt started (ms since epoch). */
  lastAttemptAt?: number
  /** Alias of the latest attempt time, kept for the existing status contract. */
  lastSyncAt?: number
  /** Last time a valid, unexpired brief was accepted (ms since epoch). */
  lastSuccessAt?: number
  /** Sanitized last failure (no local path, no brief content). */
  lastError?: { code: AdvisersFaceCode; message: string }
  /** Freshness of the retained `lastBrief`, so a stale panel is identifiable. */
  briefState?: 'fresh' | 'stale'
  generatedAt?: string
  expiresAt?: string
  counts?: PetBrief['counts']
  /**
   * Contract version of the accepted brief (1 = legacy v0.1, 2 = v0.2). The
   * host uses this only for the "legacy brief" notice, never for rendering.
   */
  schemaVersion?: number
  /**
   * Normalized `displayPolicy` of the accepted brief (`private` for v0.1).
   * `none` is never accepted: it surfaces as `reason: 'skipped'` with
   * `skipReason: 'display_none'` and no retained brief.
   */
  displayPolicy?: PetBriefDisplayPolicy
  /** Non-fatal producer warnings (legacy v0.1, missing displayPolicy). */
  warnings?: PetBriefWarning[]
  /** Why a validated brief was skipped instead of retained. */
  skipReason?: 'display_none' | 'user_opt_out'
  /**
   * Producer TOS version reported by an `E_TOS_REQUIRED` reader error. Present
   * only for `producer-tos-required`; drives the fixed re-consent guidance.
   */
  producerTosVersion?: string
  message?: string
}

export interface AdvisersFaceSummary {
  generatedAt: string
  expiresAt: string
  mood: PetBrief['mood']
  counts: PetBrief['counts']
  /** private/public; lets the panel apply the audience rules for the data. */
  displayPolicy: PetBriefDisplayPolicy
  today: string[]
  commitments: Array<{ who: string; what: string; due: string; risk: string }>
  risks: Array<{ level: string; summary: string }>
}

/** Render a redacted summary for the pet-side details panel (no suggestedLines). */
export function summarizeBrief(brief: PetBrief): AdvisersFaceSummary {
  return {
    generatedAt: brief.generatedAt,
    expiresAt: brief.expiresAt,
    mood: brief.mood,
    counts: brief.counts,
    displayPolicy: brief.displayPolicy ?? 'private',
    today: brief.today.map((item) => item.title).slice(0, 10),
    commitments: brief.commitments
      .filter((item) => item.confidence >= 0.7)
      .slice(0, 10)
      .map((item) => ({ who: item.who, what: item.what, due: item.due, risk: item.risk })),
    risks: brief.risks
      .filter((item) => item.confidence >= 0.7)
      .slice(0, 10)
      .map((item) => ({ level: item.level, summary: item.summary })),
  }
}

/** Injected test/browser readers may honor this signal; Tauri invoke cannot. */
export interface AdvisersBriefReadOptions {
  signal: AbortSignal
}

export type AdvisersBriefReader = (options: AdvisersBriefReadOptions) => Promise<unknown | null>

export interface AdvisersFaceOptions {
  /** Injectable for tests; defaults to Tauri invoke. */
  readBrief?: AdvisersBriefReader
  now?: () => number
  onDirective?: (directive: PetDirective) => void
  onStatus?: (status: AdvisersFaceStatus) => void
  intervalMs?: number
  maxIntervalMs?: number
  /** Read timeout; <= 0 disables the timeout (not recommended). */
  timeoutMs?: number
  /**
   * Consent port injected by the host. Returns false until the explicit
   * bootstrap TOS acceptance; while false no reader runs and the status is
   * `consent-required`. Defaults to true for pure controller unit tests.
   */
  isReadAllowed?: () => boolean
  /**
   * User quiet-hours predicate (C1 2026-11-21). main.ts injects the persisted
   * setting; absent keeps the historical fixed 22:00–08:00 policy for unit tests
   * and other callers.
   */
  quietHoursActive?: (at: Date) => boolean
}

/** Browser / non-Tauri mode. Kept as a named class so tests can classify it. */
export class AdvisersTransportError extends Error {
  constructor(message = 'Tauri transport unavailable') {
    super(message)
    this.name = 'AdvisersTransportError'
  }
}

/** Internal timeout signal; also classified when an injected reader throws it. */
export class AdvisersBriefTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Advisers brief read timed out after ${timeoutMs}ms`)
    this.name = 'AdvisersBriefTimeoutError'
  }
}

export async function readAdvisersBriefFromTauri(
  options: AdvisersBriefReadOptions = { signal: new AbortController().signal },
): Promise<unknown | null> {
  if (options.signal.aborted) throw new AdvisersBriefTimeoutError(0)
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) throw new AdvisersTransportError()
  const { invoke } = await import('@tauri-apps/api/core')
  // The Rust command is a synchronous read and cannot be cancelled; the signal
  // lets the controller stop waiting and ignore this late result.
  if (options.signal.aborted) throw new AdvisersBriefTimeoutError(0)
  return invoke<unknown | null>('read_advisers_brief')
}

/**
 * Normalize a reader error into `{ code?, message }`. Supports both the plain
 * `Error`/string rejections of today's Tauri command and a future structured
 * `{ code, message }` rejection (see the proposed patch in
 * `docs/integration/ADVISERS-CONTRACT.md` §7) without changing the caller.
 */
function readErrorParts(error: unknown): { code?: string; message: string } {
  if (error !== null && typeof error === 'object' && !(error instanceof Error)) {
    const record = error as { code?: unknown; message?: unknown }
    if (typeof record.code === 'string' || typeof record.message === 'string') {
      return {
        code: typeof record.code === 'string' ? record.code.toUpperCase() : undefined,
        message: typeof record.message === 'string' ? record.message : '',
      }
    }
  }
  if (error instanceof Error) return { message: error.message }
  if (typeof error === 'string') return { message: error }
  return { message: String(error ?? '') }
}

/** Producer TOS-gate signal detected from a reader error. */
export interface AdvisersProducerTosSignal {
  required: boolean
  /** Version parsed from the message, or the current known version. */
  version?: string
}

const PRODUCER_TOS_ERROR_CODE = /E_TOS_REQUIRED/i
const PRODUCER_TOS_CONSENT_TEXT = /需要(?:先|再次|重新)同意使用条款/
const PRODUCER_TOS_VERSION_TEXT = /(?:TOS|使用条款)[^0-9]{0,24}(\d{4}\.\d{1,2}\.\d{1,2})/i
const PRODUCER_TOS_ANY_VERSION = /(\d{4}\.\d{1,2}\.\d{1,2})/

/**
 * Recognize the producer-side Advisers TOS gate (`pet-brief` exit 3,
 * `E_TOS_REQUIRED`) from a reader rejection. Supports both the future
 * structured `{ code, message }` error shape and plain `Error`/string
 * messages (the producer stderr contains the code and the Chinese consent
 * sentence). Never reads brief content and never mutates consent state.
 */
export function detectProducerTosError(error: unknown): AdvisersProducerTosSignal {
  const { code, message } = readErrorParts(error)
  const text = `${code ?? ''}\n${message}`
  if (!PRODUCER_TOS_ERROR_CODE.test(text) && !PRODUCER_TOS_CONSENT_TEXT.test(message)) {
    return { required: false }
  }
  const match = text.match(PRODUCER_TOS_VERSION_TEXT) ?? text.match(PRODUCER_TOS_ANY_VERSION)
  return { required: true, version: match?.[1] ?? ADVISERS_PRODUCER_TOS_VERSION }
}

/**
 * Redact local paths from reader errors before they reach a status/UI.
 * Keeps only a bounded, single-line message.
 */
export function sanitizeAdvisersErrorMessage(error: unknown): string {
  const raw = readErrorParts(error).message
  const message = raw
    .replace(/~(?:\/[^\s"']+)+/g, '[local path]')
    .replace(/[A-Za-z]:\\[^\s"']*/g, '[local path]')
    .replace(/\\\\[^\s"']+/g, '[local path]')
    .replace(/(?:\/[A-Za-z0-9._@+-]+){2,}/g, '[local path]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const bounded = message.length > 0 ? message : 'unknown error'
  return bounded.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${bounded.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : bounded
}

function classifyReadError(error: unknown): AdvisersFaceCode {
  if (error instanceof AdvisersBriefTimeoutError) return 'TIMEOUT'
  if (error instanceof AdvisersTransportError) return 'NO_TRANSPORT'
  if (detectProducerTosError(error).required) return 'PRODUCER_TOS_REQUIRED'
  const { code, message } = readErrorParts(error)
  // Structured errors (proposed Rust patch) carry the classification directly.
  const KNOWN: readonly AdvisersFaceCode[] = [
    'NO_TRANSPORT',
    'TIMEOUT',
    'TOO_LARGE',
    'INVALID_BRIEF',
    'UNSUPPORTED_SCHEMA',
    'NO_FILE',
    'PRODUCER_TOS_REQUIRED',
    'READ_ERROR',
  ]
  if (code && (KNOWN as readonly string[]).includes(code)) return code as AdvisersFaceCode
  if (/transport/i.test(message)) return 'NO_TRANSPORT'
  if (/timed? ?out|timeout/i.test(message)) return 'TIMEOUT'
  // The Tauri command reports oversize/parse failures as plain strings today
  // (`main.rs` read command). Map them onto the same codes as the frontend caps
  // so the status line does not degrade a known cause to a generic READ_ERROR.
  if (/too (?:large|big)|larger than|exceeds?|128 ?KiB|file size/i.test(message)) return 'TOO_LARGE'
  if (/parse|invalid json|expected value|unexpected (?:token|end)|valid utf-?8/i.test(message)) return 'INVALID_BRIEF'
  return 'READ_ERROR'
}

/** Exponential backoff for automatic polling; manual retry bypasses it. */
export function advisersRetryDelayMs(
  failures: number,
  baseMs: number = ADVISERS_SYNC_INTERVAL_MS,
  maxMs: number = ADVISERS_MAX_SYNC_INTERVAL_MS,
): number {
  const safeBase = Number.isFinite(baseMs) && baseMs > 0 ? baseMs : ADVISERS_SYNC_INTERVAL_MS
  const safeMax = Number.isFinite(maxMs) && maxMs >= safeBase ? maxMs : safeBase
  const exponent = Math.max(0, Math.min(Math.floor(failures) || 0, BACKOFF_MAX_EXPONENT))
  return Math.min(Math.round(safeBase * 2 ** exponent), safeMax)
}

/** Pure display hook: status-line text + retry-button state (no DOM). */
export interface AdvisersFaceDisplay {
  text: string
  state: AdvisersFaceState
  stale: boolean
  /** Label for a a retry button, or null when retry does not apply. */
  retryLabel: string | null
}

export function describeAdvisersFaceStatus(status: AdvisersFaceStatus): AdvisersFaceDisplay {
  const retryLabel = status.retryable ? '重试' : null
  let text: string
  switch (status.reason) {
    case 'disabled':
      text = 'Advisers：未启用（可选，只读）'
      break
    case 'skipped':
      // displayPolicy: none is a producer-side "do not show" instruction, not
      // a user opt-out; make that distinguishable in the status line.
      text = status.skipReason === 'display_none'
        ? 'Advisers：简报声明不可展示（已隐藏）'
        : 'Advisers：未启用（可选，只读）'
      break
    case 'consent-required':
      text = 'Advisers：需先同意完整声明（只读）'
      break
    case 'producer-tos-required':
      text = status.producerTosVersion
        ? `Advisers：生产者需重新同意 TOS v${status.producerTosVersion}（只读）`
        : ADVISERS_PRODUCER_TOS_STATUS_TEXT
      break
    case 'no-file':
      text = 'Advisers：未找到 pet-brief.json（可选）'
      break
    case 'no-transport':
      text = 'Advisers：浏览器模式不可读取本地文件'
      break
    case 'stale':
      text = 'Advisers：简报已过期（只读，仅供参考）'
      break
    case 'invalid':
      text = status.code === 'UNSUPPORTED_SCHEMA'
        ? 'Advisers：简报契约版本不受支持（已忽略），升级桌宠后再试'
        : `Advisers：简报校验失败（${status.code}），已忽略`
      break
    case 'fresh':
      text = status.counts
        ? `Advisers：已连接 · 今天 ${status.counts.today} / 承诺 ${status.counts.commitments} / 风险 ${status.counts.risks}`
        : 'Advisers：已连接'
      break
    case 'quiet-or-deduped':
      text = 'Advisers：安静/已提醒过'
      break
    case 'error':
      text = status.code === 'TIMEOUT'
        ? 'Advisers：读取超时，可重试'
        : `Advisers：读取失败（${status.code}），可重试`
      break
  }
  return { text, state: status.state, stale: status.state === 'stale', retryLabel }
}

type StatusFields = Pick<
  AdvisersFaceStatus,
  | 'ok'
  | 'reason'
  | 'state'
  | 'code'
  | 'retryable'
  | 'generatedAt'
  | 'expiresAt'
  | 'counts'
  | 'schemaVersion'
  | 'displayPolicy'
  | 'warnings'
  | 'skipReason'
  | 'producerTosVersion'
  | 'message'
>

type ReadOutcome = { kind: 'value'; value: unknown | null } | { kind: 'aborted' }

export class AdvisersFaceController {
  private readonly options: AdvisersFaceOptions
  private readonly projector: PresenceProjector
  private timer: ReturnType<typeof setTimeout> | undefined
  private active: AbortController | undefined
  private inflight: Promise<AdvisersFaceStatus> | undefined
  private attemptId = 0
  private consecutiveFailures = 0
  private lastAttemptAt: number | undefined
  private lastSuccessAt: number | undefined
  private lastError: { code: AdvisersFaceCode; message: string } | undefined
  enabled = false
  lastBrief: PetBrief | undefined
  lastBriefState: 'fresh' | 'stale' | undefined
  lastStatus: AdvisersFaceStatus = {
    enabled: false,
    ok: false,
    reason: 'disabled',
    state: 'disabled',
    code: 'DISABLED',
    retryable: false,
  }

  constructor(options: AdvisersFaceOptions = {}) {
    this.options = options
    // C1 2026-11-21: the built-in 22:00–08:00 presence policy is only the
    // fallback. When the host supplies the user's persisted quiet-hours setting
    // the projector uses that window (disabled / custom hours stay in sync with
    // the character's low-disturb rules).
    const policy: PresencePolicy =
      options.quietHoursActive === undefined
        ? DEFAULT_PRESENCE_POLICY
        : { ...DEFAULT_PRESENCE_POLICY, quietAt: (at: number) => options.quietHoursActive!(new Date(at)) }
    this.projector = new PresenceProjector(options.now ?? (() => Date.now()), policy)
  }

  private now(): number {
    return (this.options.now ?? (() => Date.now()))()
  }

  private publish(fields: StatusFields): AdvisersFaceStatus {
    const status: AdvisersFaceStatus = {
      enabled: this.enabled,
      ok: fields.ok,
      reason: fields.reason,
      state: fields.state,
      code: fields.code,
      retryable: fields.retryable,
    }
    if (this.lastAttemptAt !== undefined) {
      status.lastAttemptAt = this.lastAttemptAt
      status.lastSyncAt = this.lastAttemptAt
    }
    if (this.lastSuccessAt !== undefined) status.lastSuccessAt = this.lastSuccessAt
    if (fields.generatedAt !== undefined) status.generatedAt = fields.generatedAt
    if (fields.expiresAt !== undefined) status.expiresAt = fields.expiresAt
    if (fields.counts !== undefined) status.counts = fields.counts
    if (fields.schemaVersion !== undefined) status.schemaVersion = fields.schemaVersion
    if (fields.displayPolicy !== undefined) status.displayPolicy = fields.displayPolicy
    if (fields.warnings !== undefined) status.warnings = fields.warnings
    if (fields.skipReason !== undefined) status.skipReason = fields.skipReason
    if (fields.producerTosVersion !== undefined) status.producerTosVersion = fields.producerTosVersion
    if (fields.message !== undefined) status.message = fields.message
    if (this.lastError !== undefined) status.lastError = this.lastError
    this.lastBriefState = this.lastBrief
      ? Date.parse(this.lastBrief.expiresAt) <= this.now()
        ? 'stale'
        : 'fresh'
      : undefined
    if (this.lastBriefState !== undefined) status.briefState = this.lastBriefState
    this.lastStatus = status
    this.options.onStatus?.(status)
    return status
  }

  private disabledStatus(): AdvisersFaceStatus {
    this.lastError = undefined
    return this.publish({
      ok: false,
      reason: 'disabled',
      state: 'disabled',
      code: 'DISABLED',
      retryable: false,
    })
  }

  private isReadAllowed(): boolean {
    return this.options.isReadAllowed?.() ?? true
  }

  private consentRequiredStatus(): AdvisersFaceStatus {
    this.lastError = undefined
    return this.publish({
      ok: false,
      reason: 'consent-required',
      state: 'unavailable',
      code: 'CONSENT_REQUIRED',
      retryable: false,
    })
  }

  private clearFailure(): void {
    this.consecutiveFailures = 0
    this.lastError = undefined
  }

  private publishFailure(code: AdvisersFaceCode, error: unknown): AdvisersFaceStatus {
    const message = sanitizeAdvisersErrorMessage(error)
    this.lastError = { code, message }
    this.consecutiveFailures += 1
    if (code === 'PRODUCER_TOS_REQUIRED') {
      // Fixed copy only: the producer stderr sentence may mention paths/terms;
      // the status line and panel render the version + stable code instead.
      const producerTosVersion = detectProducerTosError(error).version ?? ADVISERS_PRODUCER_TOS_VERSION
      const tosMessage =
        'producer TOS v' + producerTosVersion + ' requires re-consent (' + ADVISERS_PRODUCER_TOS_CODE + ')'
      this.lastError = { code, message: tosMessage }
      return this.publish({ ok: false, reason: 'producer-tos-required', state: 'unavailable', code, retryable: true, message: tosMessage, producerTosVersion })
    }
    if (code === 'NO_TRANSPORT') {
      return this.publish({ ok: false, reason: 'no-transport', state: 'unavailable', code, retryable: false, message })
    }
    if (code === 'INVALID_BRIEF' || code === 'TOO_LARGE' || code === 'UNSUPPORTED_SCHEMA') {
      return this.publish({ ok: false, reason: 'invalid', state: 'error', code, retryable: true, message })
    }
    return this.publish({ ok: false, reason: 'error', state: 'error', code, retryable: true, message })
  }

  async start(): Promise<AdvisersFaceStatus> {
    // A local brief read before the explicit TOS acceptance is a "load" the
    // user has not agreed to: stay disabled and never touch the reader.
    if (!this.isReadAllowed()) {
      this.enabled = false
      this.clearFailure()
      return this.consentRequiredStatus()
    }
    this.enabled = true
    const status = await this.sync()
    this.schedule()
    return status
  }

  stop(): void {
    this.enabled = false
    this.attemptId += 1
    const active = this.active
    this.active = undefined
    active?.abort()
    this.inflight = undefined
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.lastBrief = undefined
    this.lastBriefState = undefined
    this.clearFailure()
    this.disabledStatus()
  }

  /** Manual retry (status-line / retry-button hook); bypasses failure backoff. */
  retry(): Promise<AdvisersFaceStatus> {
    if (!this.isReadAllowed()) return Promise.resolve(this.consentRequiredStatus())
    this.consecutiveFailures = 0
    return this.sync()
  }

  /** One read/validate/project cycle. Concurrent calls share the in-flight read. */
  sync(): Promise<AdvisersFaceStatus> {
    if (!this.enabled) return Promise.resolve(this.disabledStatus())
    if (!this.isReadAllowed()) return Promise.resolve(this.consentRequiredStatus())
    if (this.inflight !== undefined) return this.inflight
    const attempt = this.runAttempt()
    this.inflight = attempt
    void attempt.then(
      () => {
        if (this.inflight === attempt) this.inflight = undefined
      },
      () => {
        if (this.inflight === attempt) this.inflight = undefined
      },
    )
    return attempt
  }

  private isCurrent(attemptId: number): boolean {
    return this.enabled && attemptId === this.attemptId
  }

  private schedule(): void {
    if (!this.enabled || this.timer !== undefined) return
    const delay = advisersRetryDelayMs(
      this.consecutiveFailures,
      this.options.intervalMs ?? ADVISERS_SYNC_INTERVAL_MS,
      this.options.maxIntervalMs ?? ADVISERS_MAX_SYNC_INTERVAL_MS,
    )
    this.timer = setTimeout(() => {
      this.timer = undefined
      if (!this.enabled) return
      void this.sync().then(
        () => this.schedule(),
        () => this.schedule(),
      )
    }, delay)
  }

  private async runAttempt(): Promise<AdvisersFaceStatus> {
    if (!this.isReadAllowed()) return this.consentRequiredStatus()
    const attemptId = ++this.attemptId
    const controller = new AbortController()
    this.active = controller
    this.lastAttemptAt = this.now()
    const timeoutMs = this.options.timeoutMs ?? ADVISERS_BRIEF_TIMEOUT_MS
    let timer: ReturnType<typeof setTimeout> | undefined
    let abortListener: (() => void) | undefined
    let timedOut = false
    try {
      const reader = this.options.readBrief ?? readAdvisersBriefFromTauri
      let readerPromise: Promise<ReadOutcome>
      try {
        readerPromise = Promise.resolve(reader({ signal: controller.signal })).then(
          (value) => ({ kind: 'value', value }) as const,
        )
      } catch (error) {
        readerPromise = Promise.reject(error)
      }
      const abortPromise = new Promise<ReadOutcome>((resolve) => {
        abortListener = () => resolve({ kind: 'aborted' })
        if (controller.signal.aborted) abortListener()
        else controller.signal.addEventListener('abort', abortListener, { once: true })
      })
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true
          controller.abort()
        }, timeoutMs)
      }
      const outcome = await Promise.race([readerPromise, abortPromise])
      if (outcome.kind === 'aborted') {
        if (!this.isCurrent(attemptId)) return this.lastStatus
        if (timedOut) return this.publishFailure('TIMEOUT', new AdvisersBriefTimeoutError(timeoutMs))
        return this.lastStatus
      }
      if (!this.isCurrent(attemptId)) return this.lastStatus
      return this.handleRaw(outcome.value)
    } catch (error) {
      if (!this.isCurrent(attemptId)) return this.lastStatus
      if (timedOut) return this.publishFailure('TIMEOUT', new AdvisersBriefTimeoutError(timeoutMs))
      return this.publishFailure(classifyReadError(error), error)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      if (abortListener !== undefined && !controller.signal.aborted) {
        controller.signal.removeEventListener('abort', abortListener)
      }
      if (this.active === controller) this.active = undefined
    }
  }

  private handleRaw(raw: unknown): AdvisersFaceStatus {
    if (raw === null || raw === undefined) {
      this.clearFailure()
      return this.publish({ ok: false, reason: 'no-file', state: 'unavailable', code: 'NO_FILE', retryable: true })
    }
    const bytes = petBriefByteLength(raw)
    if (bytes === null) return this.publishFailure('INVALID_BRIEF', 'brief is not serializable JSON')
    if (bytes > ADVISERS_BRIEF_MAX_BYTES) {
      return this.publishFailure(
        'TOO_LARGE',
        new Error(`brief is ${bytes} bytes; limit is ${ADVISERS_BRIEF_MAX_BYTES} bytes`),
      )
    }
    const now = this.now()
    const checked = validatePetBrief(raw, { now, enabled: true, requireFresh: false })
    if (checked.status === 'reject') {
      const codes = [...new Set(checked.errors.map((error) => error.code))].slice(0, 4).join(', ')
      // A pure schemaVersion failure is a version-negotiation problem, not a
      // corrupted brief: surface it separately so the user is told to upgrade
      // the app instead of "invalid file". Mixed/invalid shapes stay generic.
      const unsupportedSchema =
        checked.errors.length > 0 && checked.errors.every((error) => error.code === 'SCHEMA_VERSION')
      return this.publishFailure(
        unsupportedSchema ? 'UNSUPPORTED_SCHEMA' : 'INVALID_BRIEF',
        `brief rejected: ${codes || 'schema mismatch'}`,
      )
    }
    if (checked.status === 'skip') {
      // displayPolicy: none forbids retaining any brief-derived content. Drop
      // the previously accepted brief as well; otherwise the details panel could
      // still show a cached brief after the producer asked for full hiding.
      this.lastBrief = undefined
      this.lastBriefState = undefined
      this.clearFailure()
      return this.publish({
        ok: false,
        reason: 'skipped',
        state: 'disabled',
        code: 'SKIPPED',
        retryable: false,
        skipReason: checked.reason,
        ...(checked.reason === 'display_none' ? { displayPolicy: 'none' as const } : {}),
      })
    }
    const brief = checked.brief
    this.lastBrief = brief
    const contract = {
      schemaVersion: brief.schemaVersion,
      displayPolicy: brief.displayPolicy,
      warnings: checked.warnings,
    }
    if (Date.parse(brief.expiresAt) <= now) {
      return this.publish({
        ok: false,
        reason: 'stale',
        state: 'stale',
        code: 'STALE',
        retryable: true,
        generatedAt: brief.generatedAt,
        expiresAt: brief.expiresAt,
        counts: brief.counts,
        ...contract,
      })
    }
    this.lastSuccessAt = now
    this.clearFailure()
    const event = toPresenceEvent(brief, { now })
    if (!event) {
      return this.publish({
        ok: true,
        reason: 'quiet-or-deduped',
        state: 'ok',
        code: 'QUIET_OR_DEDUPED',
        retryable: false,
        generatedAt: brief.generatedAt,
        expiresAt: brief.expiresAt,
        counts: brief.counts,
        ...contract,
      })
    }
    const directive = this.projector.project(event)
    if (directive) this.options.onDirective?.(directive)
    return this.publish({
      ok: true,
      reason: 'fresh',
      state: 'ok',
      code: 'FRESH',
      retryable: false,
      generatedAt: brief.generatedAt,
      expiresAt: brief.expiresAt,
      counts: brief.counts,
      ...contract,
      ...(directive ? { message: `${directive.kind}:${directive.sourceType}` } : {}),
    })
  }
}

// ---------------------------------------------------------------------------
// displayPolicy UI privacy (contract v0.2, 2026-11-17)
// ---------------------------------------------------------------------------
//
// The controller above is transport/validation; this section is the *visible*
// contract for the pet-side details panel:
// - `private` (and v0.1/missing, i.e. the contract default): the panel may show
//   a fresh brief only in the active panel session, and must hide after 30 s or
//   immediately when the window loses focus / the tab is hidden / pagehide;
// - `public` (explicit v0.2 only): content may stay on screen with a visible
//   "公开显示" marker; private-only hide rules must never fire;
// - `none`: never render or retain any brief-derived content/counts/mood state;
// - missing/unknown value: fail closed to `private` with a visible warning (it
//   is never treated as `public`).
//
// The guard neither touches the DOM nor storage: `main.ts` owns the DOM and is
// called back through `onHide` to clear the reviewed text before closing.

/** Contract v0.2: a `private` brief's panel content auto-hides after 30 s. */
export const ADVISERS_PRIVATE_PANEL_TIMEOUT_MS = 30_000
/** Badge copy; the "公开显示" label is the explicit-public marker. */
export const ADVISERS_PUBLIC_PANEL_BADGE = '公开显示'
export const ADVISERS_PRIVATE_PANEL_BADGE = '私密 · 30 秒自动收起'
export const ADVISERS_NONE_PANEL_BADGE = '不可展示'
export const ADVISERS_FALLBACK_PANEL_BADGE = '策略未知 · 按私密处理'

export const ADVISERS_PRIVATE_PANEL_NOTE = '私密简报：失焦、窗口隐藏或 30 秒后自动隐藏内容。'
export const ADVISERS_PUBLIC_PANEL_NOTE = '公开显示：简报显式声明 displayPolicy: public，内容可常驻展示。'
export const ADVISERS_NONE_PANEL_NOTE = '简报声明 displayPolicy: none：不显示内容、计数或情绪派生态。'
export const ADVISERS_FALLBACK_PANEL_WARNING = '简报未声明有效的 displayPolicy，已按“私密”处理（不公开）。'

export const ADVISERS_AUTO_HIDDEN_NOTICE = '私密简报已自动收起（30 秒）。'
export const ADVISERS_BLUR_HIDDEN_NOTICE = '窗口失焦，私密简报已隐藏。'
export const ADVISERS_VISIBILITY_HIDDEN_NOTICE = '窗口不可见，私密简报已隐藏。'
export const ADVISERS_PAGE_HIDDEN_NOTICE = '页面隐藏，私密简报已隐藏。'
export const ADVISERS_NONE_CLEARED_NOTICE = '简报声明不可展示，内容已清空。'

/**
 * Minimal policy input: a validated brief (schemaVersion 2 usually) or an
 * `AdvisersFaceStatus` (both carry `displayPolicy`/`schemaVersion`; briefs also
 * carry `expiresAt`). Extra properties are ignored; no text is ever read.
 */
export interface AdvisersPanelPolicySource {
  displayPolicy?: unknown
  schemaVersion?: unknown
  expiresAt?: unknown
}

/** What the panel header may show; deliberately content-free. */
export interface AdvisersPanelPolicyView {
  policy: PetBriefDisplayPolicy
  /** `explicit` only when the source declared a usable policy. */
  source: 'explicit' | 'fallback'
  /** Badge that must be visible next to the panel title. */
  badge: string
  /** Safe one-line policy explanation. */
  note: string
  /** Warning shown when a missing/unknown policy was coerced to private. */
  warning: string | null
  /** False for `none`: no brief content/counts/mood side channel may render. */
  showContent: boolean
  /** True when the panel may be opened at all. */
  openable: boolean
  /** Auto-hide delay in ms; null = no timer (public / none). */
  autoHideMs: number | null
}

function explicitPrivatePolicy(): AdvisersPanelPolicyView {
  return {
    policy: 'private',
    source: 'explicit',
    badge: ADVISERS_PRIVATE_PANEL_BADGE,
    note: ADVISERS_PRIVATE_PANEL_NOTE,
    warning: null,
    showContent: true,
    openable: true,
    autoHideMs: ADVISERS_PRIVATE_PANEL_TIMEOUT_MS,
  }
}

function fallbackPrivatePolicy(): AdvisersPanelPolicyView {
  return {
    policy: 'private',
    source: 'fallback',
    badge: ADVISERS_FALLBACK_PANEL_BADGE,
    note: ADVISERS_PRIVATE_PANEL_NOTE,
    warning: ADVISERS_FALLBACK_PANEL_WARNING,
    showContent: true,
    openable: true,
    autoHideMs: ADVISERS_PRIVATE_PANEL_TIMEOUT_MS,
  }
}

function explicitPublicPolicy(): AdvisersPanelPolicyView {
  return {
    policy: 'public',
    source: 'explicit',
    badge: ADVISERS_PUBLIC_PANEL_BADGE,
    note: ADVISERS_PUBLIC_PANEL_NOTE,
    warning: null,
    showContent: true,
    openable: true,
    autoHideMs: null,
  }
}

function explicitNonePolicy(): AdvisersPanelPolicyView {
  return {
    policy: 'none',
    source: 'explicit',
    badge: ADVISERS_NONE_PANEL_BADGE,
    note: ADVISERS_NONE_PANEL_NOTE,
    warning: null,
    showContent: false,
    openable: false,
    autoHideMs: null,
  }
}

/**
 * Resolve the visible panel policy. Fail closed:
 * - a missing or unrecognized `displayPolicy` becomes `private` + warning;
 * - `public` is only honored for contract v0.2 sources (a v0.1-shaped source or
 *   a future/unknown `schemaVersion` can never fail open into public);
 * - `none` always wins (never renderable).
 */
export function resolveAdvisersPanelPolicy(
  source: AdvisersPanelPolicySource | null | undefined,
): AdvisersPanelPolicyView {
  const raw = source?.displayPolicy
  if (raw === 'none') return explicitNonePolicy()
  if (raw === 'public') {
    const version = source?.schemaVersion
    if (version === undefined || version === PET_BRIEF_SCHEMA_VERSION) return explicitPublicPolicy()
    return fallbackPrivatePolicy()
  }
  if (raw === 'private') return explicitPrivatePolicy()
  return fallbackPrivatePolicy()
}

/**
 * Safe suffix for the status line (never brief content): makes explicit
 * `public` visible and shows that an unknown policy was coerced to private.
 * Missing policy on a status with no contract information adds nothing (the
 * panel itself carries the warning when a brief is opened).
 */
export function describeAdvisersPolicyStatusSuffix(
  status: { displayPolicy?: unknown; schemaVersion?: unknown },
): string {
  if (status.displayPolicy === undefined) return ''
  const view = resolveAdvisersPanelPolicy(status)
  if (view.policy === 'public') return ' · 公开显示'
  if (view.policy === 'none') return ' · 不可展示'
  return view.source === 'fallback' ? ' · 策略未知，按私密' : ''
}

/** Why a visible panel session had to end. */
export type AdvisersPanelHideReason =
  | 'auto-timeout'
  | 'window-blur'
  | 'visibility-hidden'
  | 'page-hide'
  | 'policy-none'
  | 'policy-changed'
  | 'brief-stale'
  | 'disabled'
  | 'unavailable'
  | 'consent-required'
  | 'closed'

/** Tiny injectable timer surface so Node tests need no fake clock globals. */
export interface AdvisersPanelTimerPort {
  setTimeout(handler: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}

export interface AdvisersPanelPrivacyOptions {
  now?: () => number
  timers?: AdvisersPanelTimerPort
  /** Called whenever visible brief content must be removed from the DOM. */
  onHide?: (reason: AdvisersPanelHideReason) => void
  /** Test override for the private auto-hide delay. */
  privateTimeoutMs?: number
}

export interface AdvisersPanelOpenDecision {
  policy: AdvisersPanelPolicyView
  /** True when the panel may be shown (policy is not `none`). */
  visible: boolean
  /** True when brief items/counts/timestamps may be rendered right now. */
  renderContent: boolean
  /** Why content is withheld on this open (null = content may render). */
  contentBlock: 'policy-none' | 'stale' | 'no-brief' | null
  autoHideMs: number | null
}

type AdvisersPanelStatusView = Pick<
  AdvisersFaceStatus,
  'enabled' | 'reason' | 'skipReason' | 'displayPolicy' | 'schemaVersion'
>

function defaultTimerPort(): AdvisersPanelTimerPort {
  return {
    setTimeout(handler: () => void, delayMs: number): unknown {
      return globalThis.setTimeout(handler, delayMs) as unknown
    },
    clearTimeout(handle: unknown): void {
      globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
  }
}

/**
 * Statuses that invalidate the panel at once. A read error must not leave an
 * old private brief on screen, and `none`/opt-out must clear any cached render.
 */
function panelHideReasonForStatus(status: AdvisersPanelStatusView): AdvisersPanelHideReason | null {
  if (!status.enabled || status.reason === 'disabled') return 'disabled'
  if (status.reason === 'consent-required') return 'consent-required'
  if (status.reason === 'skipped') {
    return status.skipReason === 'display_none' ? 'policy-none' : 'disabled'
  }
  if (status.reason === 'stale') return 'brief-stale'
  if (
    status.reason === 'invalid' ||
    status.reason === 'error' ||
    status.reason === 'no-file' ||
    status.reason === 'no-transport' ||
    status.reason === 'producer-tos-required'
  ) {
    return 'unavailable'
  }
  return null
}

/**
 * State machine for one visible panel session. DOM-free and write-free: the
 * caller renders only when `open().renderContent` is true, and clears the DOM
 * in `onHide` (which is also the "no text left for a screenshot" guarantee).
 */
export class AdvisersPanelPrivacyGuard {
  private readonly now: () => number
  private readonly timers: AdvisersPanelTimerPort
  private readonly onHide: ((reason: AdvisersPanelHideReason) => void) | undefined
  private readonly privateTimeoutMs: number
  private timer: unknown
  private current: AdvisersPanelPolicyView
  private isVisible = false
  private contentAllowed = false
  private lastHideReason: AdvisersPanelHideReason | undefined

  constructor(options: AdvisersPanelPrivacyOptions = {}) {
    this.now = options.now ?? (() => Date.now())
    this.timers = options.timers ?? defaultTimerPort()
    this.onHide = options.onHide
    const requested = options.privateTimeoutMs
    this.privateTimeoutMs =
      typeof requested === 'number' && Number.isFinite(requested) && requested > 0
        ? requested
        : ADVISERS_PRIVATE_PANEL_TIMEOUT_MS
    // Default decision is the contract default: private + 30 s auto-hide.
    this.current = fallbackPrivatePolicy()
  }

  get visible(): boolean {
    return this.isVisible
  }

  get policy(): AdvisersPanelPolicyView {
    return this.current
  }

  get hideReason(): AdvisersPanelHideReason | undefined {
    return this.lastHideReason
  }

  /**
   * True when brief text may be on screen: visible, policy allows content AND
   * this session's open decision allowed a fresh render (a stale/no-brief
   * panel is visible but never content-visible).
   */
  get contentVisible(): boolean {
    return this.isVisible && this.contentAllowed
  }

  /**
   * Resolve the policy for one open attempt and start the session.
   * For `none` the previous session (if any) is invalidated and `visible` is
   * false. For private/fallback the 30 s timer starts; for public no timer is
   * started and the private-only signals are ignored later.
   */
  open(
    source: AdvisersPanelPolicySource | null | undefined,
    options: { now?: number; requireFresh?: boolean } = {},
  ): AdvisersPanelOpenDecision {
    this.current = resolveAdvisersPanelPolicy(source)
    const policy = this.current
    if (!policy.openable) {
      this.invalidate('policy-none')
      return { policy, visible: false, renderContent: false, contentBlock: 'policy-none', autoHideMs: null }
    }
    const autoHideMs =
      policy.autoHideMs === null
        ? null
        : policy.policy === 'private'
          ? this.privateTimeoutMs
          : policy.autoHideMs
    this.isVisible = true
    this.contentAllowed = false
    this.lastHideReason = undefined
    if (autoHideMs !== null) this.startTimer(autoHideMs)
    if (source === null || source === undefined) {
      return { policy, visible: true, renderContent: false, contentBlock: 'no-brief', autoHideMs }
    }
    const requireFresh = options.requireFresh !== false
    const now = options.now ?? this.now()
    // An expired (or unparsable) brief is not re-rendered, even if the caller
    // still holds it: only the fresh contract may put text back on screen.
    if (requireFresh && isExpired(String(source.expiresAt ?? ''), now)) {
      return { policy, visible: true, renderContent: false, contentBlock: 'stale', autoHideMs }
    }
    const renderContent = policy.showContent
    this.contentAllowed = renderContent
    return { policy, visible: true, renderContent, contentBlock: null, autoHideMs }
  }

  /** Explicit close (user action, toggle off, TOS overlay). Always clears. */
  close(reason: AdvisersPanelHideReason = 'closed'): void {
    this.invalidate(reason)
  }

  /**
   * Focus/window privacy signal. Returns true when it actually hid content.
   * `public` briefs are explicit consent to stay visible: never hidden here.
   */
  notifyPrivacyEvent(reason: 'window-blur' | 'visibility-hidden' | 'page-hide'): boolean {
    if (!this.isVisible) return false
    if (this.current.policy === 'public') return false
    this.invalidate(reason)
    return true
  }

  /**
   * Feed the latest controller status. Invalidates an open panel for `none`,
   * opt-out, disabled, stale or failed reads; returns true when it did. A
   * policy change while open also forces a re-open under the new rules.
   */
  syncStatus(status: AdvisersPanelStatusView): boolean {
    const hideReason = panelHideReasonForStatus(status)
    if (hideReason !== null) return this.invalidate(hideReason)
    if (this.isVisible) {
      const policy = resolveAdvisersPanelPolicy(status)
      if (policy.policy !== this.current.policy) return this.invalidate('policy-changed')
    }
    return false
  }

  dispose(): void {
    this.clearTimer()
  }

  private invalidate(reason: AdvisersPanelHideReason): boolean {
    const wasActive = this.isVisible || this.timer !== undefined
    this.clearTimer()
    this.isVisible = false
    this.contentAllowed = false
    this.lastHideReason = reason
    if (wasActive) this.onHide?.(reason)
    return wasActive
  }

  private startTimer(delayMs: number): void {
    this.clearTimer()
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined
      this.invalidate('auto-timeout')
    }, delayMs)
  }

  private clearTimer(): void {
    if (this.timer === undefined) return
    this.timers.clearTimeout(this.timer)
    this.timer = undefined
  }
}
