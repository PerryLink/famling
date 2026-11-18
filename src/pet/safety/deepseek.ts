/**
 * DeepSeek transport safety adapter.
 *
 * Follows the official 《模型内容安全》 guidance:
 * - a request may carry `"safety_check": {"level": "high"}`; we always add it
 *   without changing the caller's other parameters (caller level can be
 *   escalated to high unless explicitly preserved);
 * - provider-side review can fail with HTTP 400 `Content Exists Risk` or with a
 *   refusal (`stop_reason`/`stop_details`/`message.refusal`/stream refusal);
 * - a refusal is NOT a successful empty answer: already streamed text must be
 *   discarded and never shown/spoken/committed;
 * - check/refusal failure is not proof of safety (fail-closed is applied by
 *   `gate.ts`);
 * - usage/cost/safety metadata returned by the provider is passed through
 *   untouched — never hidden from the caller's budget/UI;
 * - this module never calls the network by itself: a transport is injected.
 *
 * Type-only imports from `gate.ts` keep this module usable without a cycle.
 */
import {
  categoriesFromRemoteDetails,
  type RiskCategory,
  type SafetyDirection,
} from './taxonomy.ts'
import type { RemoteSafetyChecker, RemoteSafetyVerdict } from './gate.ts'

const CONTENT_EXISTS_RISK_RE = /content[\s_-]*exists[\s_-]*risk/i
const GENERIC_CONTENT_FILTER_RE = /content[\s_-]*(?:filter|risk|moderation)|risk[\s_-]*control/i
const CONTENT_RISK_ZH_RE = /内容(?:存在)?风险|内容审核未通过|内容安全策略|敏感内容拦截/

export function isContentExistsRiskMessage(message: string): boolean {
  return (
    CONTENT_EXISTS_RISK_RE.test(message) ||
    GENERIC_CONTENT_FILTER_RE.test(message) ||
    CONTENT_RISK_ZH_RE.test(message)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pick(record: unknown, key: string): unknown {
  return isRecord(record) ? record[key] : undefined
}

function getChoices(root: unknown): unknown[] {
  return asArray(pick(root, 'choices'))
}

function getUsage(root: unknown): unknown {
  return pick(root, 'usage')
}

function getSafety(root: unknown): unknown {
  const explicit = pick(root, 'safety_check')
  return explicit === undefined ? pick(root, 'safety') : explicit
}

// ---------------------------------------------------------------------------
// Request decoration
// ---------------------------------------------------------------------------

export const DEEPSEEK_SAFETY_CHECK_LEVEL = 'high' as const
export type DeepSeekSafetyLevel = typeof DEEPSEEK_SAFETY_CHECK_LEVEL

export interface DeepSeekSafetyCheck {
  level: DeepSeekSafetyLevel
  [key: string]: unknown
}

export interface DeepSeekDecoratorOptions {
  level?: DeepSeekSafetyLevel
  /**
   * Keep a caller-provided `safety_check.level` even when it is weaker. Off by
   * default: the safety layer treats `high` as a floor.
   */
  preserveExistingLevel?: boolean
}

export interface DeepSeekDecoratedRequest<T extends Record<string, unknown>> {
  request: T
  safetyCheck: DeepSeekSafetyCheck
  /** `true` when safety_check was absent and has been added. */
  added: boolean
  /** `true` when a caller-provided weaker level was raised to `high`. */
  escalated: boolean
  /** `true` when a malformed (non-object) safety_check was replaced. */
  replacedInvalid: boolean
}

/**
 * Return a new request with `safety_check: {level: "high"}`. Every other field
 * (model, messages, temperature, stream, …) is preserved by reference/value and
 * the original request object is not mutated.
 */
export function decorateDeepSeekRequest<T extends Record<string, unknown>>(
  request: T,
  options: DeepSeekDecoratorOptions = {},
): DeepSeekDecoratedRequest<T> {
  if (!isRecord(request)) {
    throw new TypeError('deepseek: request must be a plain object')
  }
  const level = options.level ?? DEEPSEEK_SAFETY_CHECK_LEVEL
  const existing = request.safety_check
  let safetyCheck: DeepSeekSafetyCheck
  let added = false
  let escalated = false
  let replacedInvalid = false

  if (existing === undefined) {
    safetyCheck = { level }
    added = true
  } else if (isRecord(existing)) {
    const existingLevel = existing.level
    if (existingLevel === level) {
      safetyCheck = { ...existing, level } as DeepSeekSafetyCheck
    } else if (options.preserveExistingLevel && typeof existingLevel === 'string') {
      safetyCheck = { ...existing } as unknown as DeepSeekSafetyCheck
    } else {
      safetyCheck = { ...existing, level } as DeepSeekSafetyCheck
      escalated = existingLevel !== undefined
    }
  } else {
    safetyCheck = { level }
    replacedInvalid = true
  }

  return {
    request: { ...request, safety_check: safetyCheck } as T,
    safetyCheck,
    added,
    escalated,
    replacedInvalid,
  }
}

/** Convenience wrapper: decorate and return only the request. */
export function withDeepSeekSafetyCheck<T extends Record<string, unknown>>(
  request: T,
  options?: DeepSeekDecoratorOptions,
): T {
  return decorateDeepSeekRequest(request, options).request
}

// ---------------------------------------------------------------------------
// Typed errors
// ---------------------------------------------------------------------------

export type DeepSeekSafetyFailureCode = 'CONTENT_EXISTS_RISK' | 'REFUSAL'

export class DeepSeekSafetyError extends Error {
  readonly code: DeepSeekSafetyFailureCode
  constructor(code: DeepSeekSafetyFailureCode, message: string) {
    super(message)
    this.name = 'DeepSeekSafetyError'
    this.code = code
  }
}

/** HTTP 400 (or equivalent) `Content Exists Risk` from the provider. */
export class DeepSeekContentRiskError extends DeepSeekSafetyError {
  readonly status: number
  readonly body: unknown
  readonly retryable = false
  constructor(status = 400, body?: unknown, message = 'DeepSeek 内容审核未通过（Content Exists Risk）') {
    super('CONTENT_EXISTS_RISK', message)
    this.name = 'DeepSeekContentRiskError'
    this.status = status
    this.body = body
  }
}

/** Non-safety HTTP/transport problem (typed so callers can retry or degrade). */
export class DeepSeekApiError extends Error {
  readonly status: number
  readonly retryable: boolean
  readonly body: unknown
  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'DeepSeekApiError'
    this.status = status
    this.retryable = status === 0 || status === 408 || status === 429 || status >= 500
    this.body = body
  }
}

/**
 * Transport-level failure carrying HTTP status/body so `parseDeepSeekHttpError`
 * can classify it. Transports should reject with this for non-2xx responses.
 */
export class DeepSeekTransportError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown, message = `DeepSeek transport: HTTP ${status}`) {
    super(message)
    this.name = 'DeepSeekTransportError'
    this.status = status
    this.body = body
  }
}

export interface DeepSeekRefusalDetails {
  source: 'stop_reason' | 'stop_details' | 'message_refusal' | 'finish_reason' | 'error'
  stopReason?: string
  stopDetails?: unknown
  refusal?: unknown
  finishReason?: string
  message?: string
  categories: RiskCategory[]
}

/** Provider-side refusal. Already streamed text must be discarded. */
export class DeepSeekRefusalError extends DeepSeekSafetyError {
  readonly details: DeepSeekRefusalDetails
  /** Provider usage (may include safety-check tokens/cost); never stripped. */
  readonly usage?: unknown
  readonly safety?: unknown
  readonly retryable = false
  constructor(details: DeepSeekRefusalDetails, meta: { usage?: unknown; safety?: unknown } = {}) {
    super('REFUSAL', `DeepSeek 拒答（${details.source}）`)
    this.name = 'DeepSeekRefusalError'
    this.details = details
    this.usage = meta.usage
    this.safety = meta.safety
  }
}

export function isDeepSeekSafetyError(error: unknown): error is DeepSeekSafetyError {
  return error instanceof DeepSeekSafetyError
}

export function extractDeepSeekErrorMessage(body: unknown): string | undefined {
  if (typeof body === 'string') {
    const trimmed = body.trim()
    if (!trimmed) return undefined
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed)
        const nested = extractDeepSeekErrorMessage(parsed)
        if (nested) return nested
      } catch {
        // fall through: treat as plain text
      }
    }
    return trimmed.slice(0, 500)
  }
  if (!isRecord(body)) return undefined
  const error = body.error
  const direct = asString(body.message) ?? asString(body.msg) ?? asString(body.detail)
  if (direct) return direct
  if (typeof error === 'string') return error
  if (isRecord(error)) {
    return asString(error.message) ?? asString(error.msg) ?? asString(error.detail) ?? asString(error.code)
  }
  return undefined
}

/** Classify a non-2xx provider response. 400 Content Exists Risk is safety-related. */
export function parseDeepSeekHttpError(status: number, body: unknown): DeepSeekContentRiskError | DeepSeekApiError {
  const message = extractDeepSeekErrorMessage(body)
  if (message && isContentExistsRiskMessage(message)) {
    return new DeepSeekContentRiskError(status, body)
  }
  return new DeepSeekApiError(status, message ?? `DeepSeek HTTP ${status}`, body)
}

// ---------------------------------------------------------------------------
// Response parsing (non-stream)
// ---------------------------------------------------------------------------

export interface DeepSeekContentInspection {
  text: string
  refused: boolean
  contentRisk: boolean
  refusal?: DeepSeekRefusalDetails
  usage?: unknown
  safety?: unknown
  finishReason?: string
}

function isRefusalFinishReason(reason: string | undefined): boolean {
  if (!reason) return false
  return ['refusal', 'content_filter', 'content-filter', 'safety', 'blocked'].includes(
    reason.toLowerCase(),
  )
}

function collectRefusalCategories(details: unknown): RiskCategory[] {
  const categories = new Set<RiskCategory>(categoriesFromRemoteDetails(details))
  return [...categories]
}

function buildRefusalDetails(input: {
  source: DeepSeekRefusalDetails['source']
  stopReason?: string
  stopDetails?: unknown
  refusal?: unknown
  finishReason?: string
  message?: string
}): DeepSeekRefusalDetails {
  return {
    source: input.source,
    ...(input.stopReason !== undefined ? { stopReason: input.stopReason } : {}),
    ...(input.stopDetails !== undefined ? { stopDetails: input.stopDetails } : {}),
    ...(input.refusal !== undefined ? { refusal: input.refusal } : {}),
    ...(input.finishReason !== undefined ? { finishReason: input.finishReason } : {}),
    ...(input.message !== undefined ? { message: input.message } : {}),
    categories: collectRefusalCategories([
      input.stopDetails,
      input.refusal,
      input.message,
      input.finishReason,
      input.stopReason,
    ]),
  }
}

function extractMessageText(message: unknown): string {
  const content = pick(message, 'content')
  return typeof content === 'string' ? content : ''
}

function detectRefusal(root: unknown, choices: unknown[]): DeepSeekRefusalDetails | undefined {
  const rootStopReason = asString(pick(root, 'stop_reason'))
  const rootStopDetails = pick(root, 'stop_details')
  const rootRefusal = pick(root, 'refusal')
  const rootFinishReason = asString(pick(root, 'finish_reason'))

  if (rootStopReason && rootStopReason.toLowerCase() === 'refusal') {
    return buildRefusalDetails({ source: 'stop_reason', stopReason: rootStopReason, stopDetails: rootStopDetails })
  }
  if (rootStopDetails !== undefined && rootStopDetails !== null) {
    const stopType = asString(pick(rootStopDetails, 'type'))
    if (stopType && stopType.toLowerCase() === 'refusal') {
      return buildRefusalDetails({ source: 'stop_details', stopReason: rootStopReason, stopDetails: rootStopDetails })
    }
  }
  if (rootRefusal !== undefined && rootRefusal !== null && rootRefusal !== false) {
    return buildRefusalDetails({ source: 'message_refusal', refusal: rootRefusal })
  }

  for (const choice of choices) {
    const stopReason = asString(pick(choice, 'stop_reason'))
    if (stopReason && stopReason.toLowerCase() === 'refusal') {
      return buildRefusalDetails({
        source: 'stop_reason',
        stopReason,
        stopDetails: pick(choice, 'stop_details'),
        finishReason: asString(pick(choice, 'finish_reason')),
      })
    }
    const message = pick(choice, 'message')
    const messageRefusal = pick(message, 'refusal')
    if (messageRefusal !== undefined && messageRefusal !== null && messageRefusal !== false) {
      return buildRefusalDetails({
        source: 'message_refusal',
        refusal: messageRefusal,
        finishReason: asString(pick(choice, 'finish_reason')),
      })
    }
    const finishReason = asString(pick(choice, 'finish_reason'))
    if (isRefusalFinishReason(finishReason)) {
      return buildRefusalDetails({
        source: 'finish_reason',
        finishReason,
        stopDetails: pick(choice, 'stop_details'),
      })
    }
  }
  if (isRefusalFinishReason(rootFinishReason)) {
    return buildRefusalDetails({ source: 'finish_reason', finishReason: rootFinishReason })
  }
  return undefined
}

function detectEmbeddedContentRisk(root: unknown): boolean {
  const error = pick(root, 'error')
  if (error === undefined || error === null) return false
  const message = extractDeepSeekErrorMessage(root) ?? ''
  return isContentExistsRiskMessage(message)
}

/** Inspect a non-stream response without throwing. */
export function inspectDeepSeekResponse(json: unknown): DeepSeekContentInspection {
  const choices = getChoices(json)
  const text = choices
    .map((choice) => {
      const message = pick(choice, 'message')
      const content = extractMessageText(message)
      if (content) return content
      const choiceText = pick(choice, 'text')
      return typeof choiceText === 'string' ? choiceText : ''
    })
    .join('')
  const refusal = detectRefusal(json, choices)
  const finishReason =
    asString(pick(json, 'finish_reason')) ??
    choices.map((choice) => asString(pick(choice, 'finish_reason'))).find(Boolean)
  return {
    text,
    refused: refusal !== undefined,
    contentRisk: detectEmbeddedContentRisk(json),
    ...(refusal !== undefined ? { refusal } : {}),
    ...(getUsage(json) !== undefined ? { usage: getUsage(json) } : {}),
    ...(getSafety(json) !== undefined ? { safety: getSafety(json) } : {}),
    ...(finishReason !== undefined ? { finishReason } : {}),
  }
}

/**
 * Read model content from a response, throwing a typed error for provider
 * refusals / Content Exists Risk. Never treats a refusal as a successful empty
 * answer; usage/safety metadata stays on the error for accounting.
 */
export function readDeepSeekContent(json: unknown): DeepSeekContentInspection {
  const inspection = inspectDeepSeekResponse(json)
  if (inspection.contentRisk) {
    throw new DeepSeekContentRiskError(400, json)
  }
  if (inspection.refused) {
    throw new DeepSeekRefusalError(
      inspection.refusal ?? buildRefusalDetails({ source: 'error', message: 'refusal' }),
      { usage: inspection.usage, safety: inspection.safety },
    )
  }
  return inspection
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export interface DeepSeekStreamPayloadInspection {
  content: string
  contentRisk: boolean
  refused: boolean
  refusal?: DeepSeekRefusalDetails
  usage?: unknown
  safety?: unknown
  finishReason?: string
}

/** Inspect a single parsed SSE JSON payload. */
export function inspectDeepSeekStreamPayload(payload: unknown): DeepSeekStreamPayloadInspection {
  const choices = getChoices(payload)
  let content = ''
  for (const choice of choices) {
    const delta = pick(choice, 'delta')
    const deltaContent = pick(delta, 'content')
    if (typeof deltaContent === 'string') content += deltaContent
    const messageContent = extractMessageText(pick(choice, 'message'))
    if (!content && messageContent) content = messageContent
  }
  const refusal = detectRefusal(payload, choices)
  const finishReason =
    choices.map((choice) => asString(pick(choice, 'finish_reason'))).find(Boolean) ??
    asString(pick(payload, 'finish_reason'))
  return {
    content,
    contentRisk: detectEmbeddedContentRisk(payload),
    refused: refusal !== undefined,
    ...(refusal !== undefined ? { refusal } : {}),
    ...(getUsage(payload) !== undefined ? { usage: getUsage(payload) } : {}),
    ...(getSafety(payload) !== undefined ? { safety: getSafety(payload) } : {}),
    ...(finishReason !== undefined ? { finishReason } : {}),
  }
}

export interface DeepSeekStreamFeed {
  /** New visible text from this chunk; always `''` once a refusal is seen. */
  text: string
  done: boolean
  error?: DeepSeekSafetyError
}

export interface DeepSeekCommittedContent {
  text: string
  usage?: unknown
  safety?: unknown
}

/**
 * Incremental SSE guard. Feed raw chunks; once a refusal/Content Exists Risk is
 * seen every already streamed character is discarded (`pendingText` becomes '',
 * `discardedChars` records the amount) and `commit()`/`finish()` throws the
 * typed error. A refusal is never committed as an empty successful answer.
 */
export class DeepSeekStreamGuard {
  private buffer = ''
  private parts: string[] = []
  private failure?: DeepSeekSafetyError
  private usage?: unknown
  private safety?: unknown
  private finished = false
  private discarded = 0

  get pendingText(): string {
    return this.failure ? '' : this.parts.join('')
  }

  get discardedChars(): number {
    return this.failure ? this.discarded : 0
  }

  get done(): boolean {
    return this.finished
  }

  get hasFailure(): boolean {
    return this.failure !== undefined
  }

  private fail(error: DeepSeekSafetyError): void {
    if (this.failure) return
    this.failure = error
    this.discarded = this.parts.join('').length
    this.parts = []
    this.buffer = ''
  }

  private processLine(line: string): string {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return ''
    const data = trimmed.slice(5).trim()
    if (!data) return ''
    if (data === '[DONE]') {
      this.finished = true
      return ''
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return ''
    }
    const inspection = inspectDeepSeekStreamPayload(parsed)
    if (inspection.contentRisk) {
      this.fail(new DeepSeekContentRiskError(400, parsed))
      return ''
    }
    if (inspection.refused) {
      this.fail(
        new DeepSeekRefusalError(
          inspection.refusal ?? buildRefusalDetails({ source: 'error', message: 'stream refusal' }),
          { usage: inspection.usage, safety: inspection.safety },
        ),
      )
      return ''
    }
    if (inspection.usage !== undefined) this.usage = inspection.usage
    if (inspection.safety !== undefined) this.safety = inspection.safety
    if (inspection.content) {
      this.parts.push(inspection.content)
      return inspection.content
    }
    return ''
  }

  /** Feed a raw network chunk (may be a partial SSE line). */
  feed(chunk: string): DeepSeekStreamFeed {
    if (this.failure) {
      return { text: '', done: false, error: this.failure }
    }
    if (this.finished) return { text: '', done: true }
    this.buffer += chunk
    const lines = this.buffer.split(/\r?\n/)
    this.buffer = lines.pop() ?? ''
    let text = ''
    for (const line of lines) {
      if (this.failure) break
      text += this.processLine(line)
    }
    return {
      text: this.failure ? '' : text,
      done: this.finished && !this.failure,
      ...(this.failure ? { error: this.failure } : {}),
    }
  }

  private flushTail(): void {
    if (!this.buffer.trim()) return
    this.processLine(this.buffer)
    this.buffer = ''
  }

  /** Commit the buffered text. Throws if a refusal/risk was seen. */
  commit(): DeepSeekCommittedContent {
    this.flushTail()
    if (this.failure) throw this.failure
    return {
      text: this.parts.join(''),
      ...(this.usage !== undefined ? { usage: this.usage } : {}),
      ...(this.safety !== undefined ? { safety: this.safety } : {}),
    }
  }

  /** Alias for `commit()`, useful when the stream just ended. */
  finish(): DeepSeekCommittedContent {
    return this.commit()
  }

  /** Explicitly drop buffered text (e.g. UI cancellation) and account for it. */
  discard(): void {
    this.discarded += this.parts.join('').length
    this.parts = []
  }
}

// ---------------------------------------------------------------------------
// Optional gate adapter
// ---------------------------------------------------------------------------

export type DeepSeekCheckerTransport = (
  request: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<unknown>

export interface DeepSeekRemoteCheckerOptions {
  /** Build the real provider request for the given text/direction (model, messages, …). */
  buildRequest: (input: { text: string; direction: SafetyDirection }) => Record<string, unknown>
  level?: DeepSeekSafetyLevel
  preserveExistingLevel?: boolean
}

/**
 * Build a `RemoteSafetyChecker` for `gate.ts` on top of the real DeepSeek call.
 * The checker decorates the request with safety_check high and converts
 * Content-Exists-Risk/refusal into typed verdicts. The transport (and thus the
 * network) is injected by the host; cost/billing metadata is returned verbatim
 * so callers can account for safety-check tokens.
 */
export function createDeepSeekSafetyChecker(
  transport: DeepSeekCheckerTransport,
  options: DeepSeekRemoteCheckerOptions,
): RemoteSafetyChecker {
  return async (input, signal): Promise<RemoteSafetyVerdict> => {
    const decorated = decorateDeepSeekRequest(options.buildRequest(input), {
      ...(options.level !== undefined ? { level: options.level } : {}),
      ...(options.preserveExistingLevel !== undefined
        ? { preserveExistingLevel: options.preserveExistingLevel }
        : {}),
    })
    try {
      const json = await transport(decorated.request, signal)
      const inspection = inspectDeepSeekResponse(json)
      if (inspection.contentRisk) {
        return {
          disposition: 'block',
          reasons: ['DeepSeek 审核未通过（Content Exists Risk）'],
          categories: [],
          ...(inspection.usage !== undefined ? { usage: inspection.usage } : {}),
          ...(inspection.safety !== undefined ? { safety: inspection.safety } : {}),
        }
      }
      if (inspection.refused) {
        return {
          disposition: 'refuse',
          reasons: [`DeepSeek 拒答（${inspection.refusal?.source ?? 'refusal'}）`],
          categories: inspection.refusal?.categories ?? [],
          ...(inspection.usage !== undefined ? { usage: inspection.usage } : {}),
          ...(inspection.safety !== undefined ? { safety: inspection.safety } : {}),
        }
      }
      return {
        disposition: 'allow',
        reasons: [],
        categories: [],
        ...(inspection.usage !== undefined ? { usage: inspection.usage } : {}),
        ...(inspection.safety !== undefined ? { safety: inspection.safety } : {}),
      }
    } catch (error) {
      if (error instanceof DeepSeekContentRiskError) {
        return { disposition: 'block', reasons: [error.message], categories: [] }
      }
      if (error instanceof DeepSeekRefusalError) {
        return {
          disposition: 'refuse',
          reasons: [error.message],
          categories: error.details.categories,
          ...(error.usage !== undefined ? { usage: error.usage } : {}),
          ...(error.safety !== undefined ? { safety: error.safety } : {}),
        }
      }
      if (error instanceof DeepSeekTransportError) {
        const parsed = parseDeepSeekHttpError(error.status, error.body)
        if (parsed instanceof DeepSeekContentRiskError) {
          return { disposition: 'block', reasons: [parsed.message], categories: [] }
        }
        throw parsed
      }
      throw error
    }
  }
}
