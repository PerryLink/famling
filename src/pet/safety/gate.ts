/**
 * Content-safety gate for the desktop pet.
 *
 * `reviewUserInput` / `reviewModelOutput` / `assertSafeForTts` combine:
 *   1. structural sanitisation (HTML/control/invisible characters),
 *   2. explainable local rules (`local.ts`),
 *   3. an optional remote check injected by the host (`deepseek.ts` builds one
 *      on top of the official `safety_check` request parameter),
 *   4. a fail-closed policy for remote failures (configurable, closed by default).
 *
 * Decision rules:
 * - `block` / `refuse` never pass for any direction.
 * - model output / TTS / DLC descriptions: `review` is held by default; callers
 *   may opt into `onReview: 'allow-with-disclosure'`.
 * - user input: a soft local `review` (e.g. PII to redact, health question) may
 *   be forwarded, but only with redaction, required output review and the
 *   matching professional/identity disclosures.
 * - remote checks are authoritative-ish: any non-`allow` remote verdict holds,
 *   and a remote failure holds unless `failMode: 'open'` is explicitly set.
 * - a failure to check is never treated as success.
 *
 * No network is performed here; the remote checker is injected. No I/O.
 */
import {
  CATEGORY_POLICY,
  combineDispositions,
  isRiskCategory,
  isSafetyDisposition,
  maxSeverity,
  type RiskCategory,
  type SafetyDirection,
  type SafetyDisposition,
  type SafetySeverity,
} from './taxonomy.ts'
import { scanLocal, type SafetyFinding } from './local.ts'
import { sanitizeForTts, sanitizeText, UnsafeTextError } from './sanitize.ts'
import {
  buildCrisisMessage,
  CRISIS_RESOURCES,
  DISCLOSURES,
  type CrisisResource,
} from './disclosure.ts'

export const GATE_VERSION = '2026-11-17'
export const DEFAULT_REMOTE_TIMEOUT_MS = 5_000
export const DEFAULT_HARD_MAX_CHARS = 20_000

export type ReviewOnReviewPolicy = 'hold' | 'allow-with-disclosure'
export type FailMode = 'closed' | 'open'

export interface RemoteSafetyVerdict {
  disposition: SafetyDisposition
  categories?: readonly RiskCategory[]
  reasons?: readonly string[]
  /** Provider usage/cost, including any safety-check accounting. Never stripped. */
  usage?: unknown
  /** Provider safety metadata. Never stripped. */
  safety?: unknown
}

export type RemoteSafetyChecker = (
  input: { text: string; direction: SafetyDirection },
  signal: AbortSignal,
) => Promise<RemoteSafetyVerdict>

export interface RemoteSafetyReport {
  checked: boolean
  degraded: boolean
  disposition?: SafetyDisposition
  categories: RiskCategory[]
  reasons: string[]
  /** Unmodified provider metadata; do not hide safety-check tokens/cost. */
  usage?: unknown
  safety?: unknown
  failure?: {
    code: string
    message: string
    retryable: boolean
  }
}

export interface GateOptions {
  /** Optional remote check (e.g. DeepSeek `safety_check` adapter). */
  remote?: RemoteSafetyChecker
  /** Remote check timeout; a timeout is a failure (fail-closed by default). */
  remoteTimeoutMs?: number
  /** Behavior when the remote check fails: closed (default) or open. */
  failMode?: FailMode
  /** Soft local length threshold; defaults per direction. */
  maxChars?: number
  /** Absolute refusal threshold before any check (default 20 000). */
  hardMaxChars?: number
  /** For model output/TTS/DLC review dispositions; default `hold`. */
  onReview?: ReviewOnReviewPolicy
  /** Return the disclosure lines applicable to the decision (default true). */
  includeDisclosures?: boolean
}

export interface TtsGateOptions extends GateOptions {
  /** Spoken text target length in code points (default 300). */
  ttsMaxChars?: number
}

export interface SafetyRefusal {
  message: string
  category?: RiskCategory
  disposition: SafetyDisposition
  resources: readonly CrisisResource[]
  retryable: boolean
}

export interface SafetyReview {
  allowed: boolean
  direction: SafetyDirection
  disposition: SafetyDisposition
  severity: SafetySeverity
  findings: SafetyFinding[]
  reasons: string[]
  /** Redacted + structurally sanitised text. Forward only when `allowed`. */
  safeText: string
  redacted: boolean
  disclosures: string[]
  constraints: string[]
  refusal?: SafetyRefusal
  remote: RemoteSafetyReport
  /** A remote check failed (open or closed). */
  degraded: boolean
}

export class SafetyBlockedError extends Error {
  readonly code = 'SAFETY_BLOCKED'
  readonly review: SafetyReview
  constructor(review: SafetyReview, cause?: unknown) {
    super(review.refusal?.message ?? 'safety: content blocked', cause === undefined ? undefined : { cause })
    this.name = 'SafetyBlockedError'
    this.review = review
  }
}

export function isSafetyBlockedError(error: unknown): error is SafetyBlockedError {
  return error instanceof SafetyBlockedError
}

class RemoteCheckError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'RemoteSafetyCheckError'
    this.code = code
  }
}

const CATEGORY_REFUSAL_COPY: Record<RiskCategory, string> = {
  illegal: '这个涉及违法或危险行为，我不能提供帮助。',
  minor_sexual: '涉及未成年人的性内容我不能处理或生成。',
  sexual_adult: '这类成人性内容我不能生成；换个话题吧。',
  self_harm: buildCrisisMessage(),
  violence: '涉及伤害他人的内容我不能继续。',
  hate_harassment: '攻击、歧视或骚扰内容我不做。',
  privacy_pii: '先别发送个人敏感信息；涉及隐私的内容我不转发。',
  fraud_financial: '涉及诈骗或财产高风险的内容我不能协助。',
  high_risk_advice: '这涉及医疗/法律/金融的结论性建议，我不能替代专业人士。',
  dependency_manipulation: '我不能制造独占或依赖关系；可以换个轻松的话题。',
  jailbreak: '不能绕过安全规则；我们换个正常的方式。',
  impersonation: '我不能冒充官方、真人或专业人士。',
}

const REFUSAL_PRIORITY: readonly RiskCategory[] = [
  'self_harm',
  'minor_sexual',
  'illegal',
  'violence',
  'sexual_adult',
  'fraud_financial',
  'jailbreak',
  'impersonation',
  'hate_harassment',
  'privacy_pii',
  'high_risk_advice',
  'dependency_manipulation',
]

function defaultMaxChars(direction: SafetyDirection): number {
  switch (direction) {
    case 'user_input':
      return 2_000
    case 'model_output':
      return 8_000
    case 'tts':
      return 2_000
    case 'dlc_description':
      return 4_000
  }
}

function sanitizeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'remote safety check failed'
  return sanitizeText(raw, { mode: 'summary', maxChars: 200 }).text || 'remote safety check failed'
}

function remoteCode(error: unknown): string {
  if (error instanceof RemoteCheckError) return error.code
  if (error instanceof Error && error.name === 'AbortError') return 'REMOTE_ABORTED'
  return 'REMOTE_CHECK_FAILED'
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

function disclosureLinesFor(direction: SafetyDirection, categories: readonly RiskCategory[]): string[] {
  const lines: string[] = []
  if (direction === 'model_output') lines.push(DISCLOSURES.ai_chat.text)
  if (direction === 'tts') lines.push(DISCLOSURES.ai_voice.text)
  if (direction === 'dlc_description') lines.push(DISCLOSURES.ai_generated.text)
  if (categories.includes('high_risk_advice')) lines.push(DISCLOSURES.not_professional.text)
  if (categories.includes('dependency_manipulation')) {
    lines.push(DISCLOSURES.non_human.text, DISCLOSURES.healthy_use.text)
  }
  if (categories.includes('impersonation')) lines.push(DISCLOSURES.non_official.text)
  return uniqueStrings(lines)
}

function buildRefusal(input: {
  direction: SafetyDirection
  disposition: SafetyDisposition
  categories: readonly RiskCategory[]
  failedClosed: boolean
  failureMessage?: string
  retryable: boolean
}): SafetyRefusal {
  let category: RiskCategory | undefined
  for (const candidate of REFUSAL_PRIORITY) {
    if (input.categories.includes(candidate)) {
      category = candidate
      break
    }
  }
  // Self-harm always gets crisis resources, even when the remote check failed:
  // a user in crisis must not receive a generic "try again later" message.
  if (category === 'self_harm') {
    return {
      message: buildCrisisMessage(),
      category,
      disposition: input.disposition === 'block' ? 'refuse' : input.disposition,
      resources: CRISIS_RESOURCES,
      retryable: false,
    }
  }
  if (input.failedClosed) {
    return {
      message: '安全审核暂时不可用，先不继续了；请稍后再试。',
      disposition: 'block',
      resources: [],
      retryable: true,
    }
  }
  const reviewHold = input.disposition === 'review' && input.direction !== 'user_input'
  if (reviewHold) {
    return {
      message: '这条内容需要再确认一下，我先不展示了。',
      ...(category !== undefined ? { category } : {}),
      disposition: input.disposition,
      resources: [],
      retryable: true,
    }
  }
  if (category) {
    return {
      message: CATEGORY_REFUSAL_COPY[category],
      category,
      disposition: input.disposition,
      resources: [],
      retryable: input.retryable,
    }
  }
  return {
    message: '这个内容我先不处理了。',
    disposition: input.disposition,
    resources: [],
    retryable: input.retryable,
  }
}

function refusalRetryable(
  direction: SafetyDirection,
  disposition: SafetyDisposition,
  categories: readonly RiskCategory[],
  failedClosed: boolean,
): boolean {
  if (failedClosed) return true
  if (disposition === 'review') return true
  if (categories.includes('privacy_pii')) return true
  return false
}

interface RemoteCheckResult {
  report: RemoteSafetyReport
  failedClosed: boolean
}

async function runRemoteCheck(
  text: string,
  direction: SafetyDirection,
  options: GateOptions,
): Promise<RemoteCheckResult> {
  const checker = options.remote
  if (!checker) {
    return { report: { checked: false, degraded: false, categories: [], reasons: [] }, failedClosed: false }
  }
  const failMode: FailMode = options.failMode ?? 'closed'
  const timeoutMs = options.remoteTimeoutMs ?? DEFAULT_REMOTE_TIMEOUT_MS
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new RemoteCheckError('REMOTE_TIMEOUT', `remote safety check timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })
  try {
    const verdict = await Promise.race([checker({ text, direction }, controller.signal), timeout])
    if (!verdict || !isSafetyDisposition(verdict.disposition)) {
      throw new RemoteCheckError('INVALID_VERDICT', 'remote safety check returned an invalid disposition')
    }
    const categories = [...new Set((verdict.categories ?? []).filter(isRiskCategory))]
    const reasons = uniqueStrings(
      (verdict.reasons ?? [])
        .filter((reason): reason is string => typeof reason === 'string')
        .map((reason) => sanitizeText(reason, { mode: 'summary', maxChars: 160 }).text),
    )
    if (categories.length > 0 && verdict.disposition === 'allow') {
      // A provider that flags categories but says allow is treated as review:
      // never let an inconsistent verdict pass unchecked.
      return {
        failedClosed: false,
        report: {
          checked: true,
          degraded: false,
          disposition: 'review',
          categories,
          reasons: [...reasons, '远端审核返回了风险分类但结论为 allow，按 review 处理'],
          ...(verdict.usage !== undefined ? { usage: verdict.usage } : {}),
          ...(verdict.safety !== undefined ? { safety: verdict.safety } : {}),
        },
      }
    }
    return {
      failedClosed: false,
      report: {
        checked: true,
        degraded: false,
        disposition: verdict.disposition,
        categories,
        reasons,
        ...(verdict.usage !== undefined ? { usage: verdict.usage } : {}),
        ...(verdict.safety !== undefined ? { safety: verdict.safety } : {}),
      },
    }
  } catch (error) {
    const code = remoteCode(error)
    const failure = { code, message: sanitizeErrorMessage(error), retryable: true }
    return {
      failedClosed: failMode === 'closed',
      report: {
        checked: true,
        degraded: true,
        categories: [],
        reasons: [`远端审核不可用（${failure.code}）`],
        failure,
      },
    }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Core review function used by the direction-specific helpers.
 * Never throws for ordinary unsafe content; throws only on programming errors.
 */
export async function reviewForDirection(
  input: string,
  direction: SafetyDirection,
  options: GateOptions = {},
): Promise<SafetyReview> {
  const raw = typeof input === 'string' ? input : ''
  const hardMax = options.hardMaxChars ?? DEFAULT_HARD_MAX_CHARS
  const localMax = options.maxChars ?? defaultMaxChars(direction)

  if ([...raw].length > hardMax) {
    const report: RemoteSafetyReport = { checked: false, degraded: false, categories: [], reasons: [] }
    const refusal = buildRefusal({
      direction,
      disposition: 'block',
      categories: [],
      failedClosed: false,
      retryable: true,
    })
    return {
      allowed: false,
      direction,
      disposition: 'block',
      severity: 'medium',
      findings: [],
      reasons: [`内容超过硬上限 ${hardMax} 字，拒绝处理`],
      safeText: '',
      redacted: false,
      disclosures: [],
      constraints: [],
      refusal: { ...refusal, message: '内容太长了，先不处理；请分段再发。' },
      remote: report,
      degraded: false,
    }
  }

  // Structural clean-up first so zero-width/HTML tricks cannot evade matching.
  const structural = sanitizeText(raw, { mode: 'chat' })
  const scanText = structural.text
  if (!scanText) {
    const report: RemoteSafetyReport = { checked: false, degraded: false, categories: [], reasons: [] }
    const refusal = buildRefusal({
      direction,
      disposition: 'block',
      categories: [],
      failedClosed: false,
      retryable: true,
    })
    return {
      allowed: false,
      direction,
      disposition: 'block',
      severity: 'low',
      findings: [],
      reasons: ['内容为空或仅含 HTML/控制字符/不可见字符，拒绝处理'],
      safeText: '',
      redacted: raw.trim().length > 0,
      disclosures: [],
      constraints: [],
      refusal: { ...refusal, message: '没有可处理的内容。' },
      remote: report,
      degraded: false,
    }
  }

  const local = scanLocal(scanText, { direction, maxChars: localMax })
  let disposition = local.disposition
  let severity = local.severity
  const findings = local.findings
  const localCategories = [...new Set(findings.map((finding) => finding.category))]
  const reasons = [...local.reasons]

  // Privacy/cost: if local hard rules already stop the content, do not ship the
  // text (possibly a secret/self-harm message) to a remote checker at all.
  // Otherwise the remote checker receives the redacted text, not raw PII.
  const localStopped = disposition === 'block' || disposition === 'refuse'
  const remoteResult = localStopped
    ? {
        failedClosed: false,
        report: {
          checked: false,
          degraded: false,
          categories: [],
          reasons: ['本地硬规则已拦截，跳过远端检查'],
        } satisfies RemoteSafetyReport,
      }
    : await runRemoteCheck(local.redacted, direction, options)
  const remote = remoteResult.report
  const failedClosed = remote.degraded && remoteResult.failedClosed
  let remoteHold = false
  if (remote.checked) {
    if (remote.disposition !== undefined) {
      disposition = combineDispositions(disposition, remote.disposition)
      if (remote.disposition !== 'allow') remoteHold = true
    }
    reasons.push(...remote.reasons)
    if (remote.disposition === 'review') remoteHold = true
  }
  if (failedClosed) {
    disposition = 'block'
    remoteHold = true
  }
  severity = maxSeverity(severity, remote.degraded ? 'medium' : 'none')

  const categories = [...new Set<RiskCategory>([...localCategories, ...remote.categories])]
  const hardLocalFinding = findings.some(
    (finding) =>
      CATEGORY_POLICY[finding.category].hardStop &&
      (finding.disposition === 'block' || finding.disposition === 'refuse'),
  )

  let allowed = false
  if (disposition === 'allow') {
    allowed = true
  } else if (disposition === 'review' && !remoteHold && !hardLocalFinding) {
    if (direction === 'user_input') {
      allowed = true
    } else {
      allowed = (options.onReview ?? 'hold') === 'allow-with-disclosure'
    }
  }
  const finalMode = direction === 'tts' ? 'tts' : 'chat'
  const finalSanitized = sanitizeText(local.redacted, { mode: finalMode })
  let safeText = finalSanitized.text
  const redacted = finalSanitized.text !== scanText

  if (!safeText) {
    disposition = 'block'
    allowed = false
    reasons.push('清理后无可用文本')
  }
  if (allowed && findings.length > 0 && disposition === 'review') {
    // Soft review pass-through: caller must review the model output and append
    // the required disclosures, never treat this as an unconditional pass.
    reasons.push('软审核放行：需复核模型输出并追加披露')
  }

  const constraints: string[] = []
  if (allowed && disposition === 'review' && direction === 'user_input') {
    constraints.push('review-model-output', 'append-disclosures')
  }
  if (allowed && disposition === 'review' && direction !== 'user_input') {
    constraints.push('human-review-recommended', 'append-disclosures')
  }
  if (remote.degraded) constraints.push('remote-check-degraded')
  if (remoteHold) constraints.push('remote-held')

  const disclosures =
    allowed && options.includeDisclosures !== false ? disclosureLinesFor(direction, categories) : []

  let refusal: SafetyRefusal | undefined
  if (!allowed) {
    refusal = buildRefusal({
      direction,
      disposition,
      categories,
      failedClosed,
      retryable: refusalRetryable(direction, disposition, categories, failedClosed),
    })
  }

  return {
    allowed,
    direction,
    disposition,
    severity,
    findings,
    reasons: uniqueStrings(reasons).slice(0, 8),
    safeText,
    redacted,
    disclosures,
    constraints,
    ...(refusal !== undefined ? { refusal } : {}),
    remote,
    degraded: remote.degraded,
  }
}

/** Review user input before it is sent to a model / roleplay engine. */
export function reviewUserInput(input: string, options: GateOptions = {}): Promise<SafetyReview> {
  return reviewForDirection(input, 'user_input', options)
}

/** Review model output before display, memory write or roleplay continuation. */
export function reviewModelOutput(output: string, options: GateOptions = {}): Promise<SafetyReview> {
  return reviewForDirection(output, 'model_output', options)
}

/** Review DLC/pack descriptions before they are rendered or indexed. */
export function reviewDlcDescription(description: string, options: GateOptions = {}): Promise<SafetyReview> {
  return reviewForDirection(description, 'dlc_description', options)
}

/**
 * Strict TTS gate: throws `SafetyBlockedError` when the text must not be spoken,
 * otherwise returns sanitised text limited to `ttsMaxChars` (default 300).
 */
export async function assertSafeForTts(text: string, options: TtsGateOptions = {}): Promise<string> {
  const review = await reviewForDirection(text, 'tts', options)
  if (!review.allowed) throw new SafetyBlockedError(review)
  try {
    return sanitizeForTts(review.safeText, { maxChars: options.ttsMaxChars ?? 300 })
  } catch (error) {
    if (error instanceof UnsafeTextError) throw new SafetyBlockedError(review, error)
    throw error
  }
}
