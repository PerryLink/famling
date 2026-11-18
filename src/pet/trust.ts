/**
 * Trust integration layer for the pet main flow.
 *
 * The safety (`src/pet/safety/**`) and security (`src/pet/security/**`) modules
 * were delivered as pure, unwired building blocks. This module is the single
 * host-side adapter that actually wires them into `main.ts`/`chat-import.ts`:
 *
 * - `prepareSpeech()` runs `assertSafeForTts` (≤120 chars) BEFORE a bubble or
 *   TTS request; blocked/refused text only surfaces the short refusal copy, and
 *   an unexpected failure of the safety layer itself is fail-closed (never
 *   displays or speaks the unchecked text).
 * - `reviewUserInputForForwarding()` reviews ASR text / imported summaries
 *   before they may be used; PII is redacted (`safeText`) and the raw text is
 *   never returned for logging.
 * - `reviewModelOutputForDisplay()` reviews Advisers/Pet Brief directives and
 *   any future model output before `showBubble`.
 * - `reviewDlc()` reviews DLC/character-pack descriptions before rendering.
 * - DeepSeek chat helpers: the pet currently has NO chat-completion call site
 *   (chat-import only reads a public share page via the Rust host command; TTS
 *   and ASR go through the Rust proxy, not chat completions). To avoid faking a
 *   call site, the reusable helpers below are the only sanctioned way to build a
 *   DeepSeek chat request (injects `safety_check:{level:"high"}`), parse a
 *   400/refusal response, and drive a streaming draft whose text is discarded on
 *   a refusal. `docs/audit/TRUST-INTEGRATION-2026-11-17.md` records that no
 *   model API call exists today.
 *
 * No network is performed here: remote checkers/transports are injected.
 */
import {
  assertSafeForTts,
  isSafetyBlockedError,
  reviewDlcDescription,
  reviewModelOutput,
  reviewUserInput,
  type GateOptions,
  type SafetyReview,
} from './safety/gate.ts'
import {
  DeepSeekRefusalError,
  DeepSeekStreamGuard,
  isDeepSeekSafetyError,
  parseDeepSeekHttpError,
  readDeepSeekContent,
  withDeepSeekSafetyCheck,
} from './safety/deepseek.ts'
import { createErrorBoundary, type ErrorBoundary } from './security/error-boundary.ts'
import { SECURITY_LIMITS, sanitizePlainText } from './security/limits.ts'

/** Longest text ever spoken: the cloud TTS limit is far below this. */
export const TTS_MAX_CHARS = 120
/** Short, understandable fail-closed copy shown when the gate itself fails. */
export const SAFETY_UNAVAILABLE_MESSAGE = '安全审核暂时不可用，先不继续了。'
/** Generic short refusal for model output whose review has no specific copy. */
export const OUTPUT_BLOCKED_MESSAGE = '这条内容我先不展示了。'
/** Generic short refusal for user input that must not be forwarded. */
export const INPUT_BLOCKED_MESSAGE = '这段内容不适合发出去。'

function boundedCopy(text: string | undefined, fallback: string, maxChars = 160): string {
  const clean = sanitizePlainText(text ?? '', { maxChars, allowNewlines: false })
  return clean || fallback
}

/** Short refusal message for a blocked/refused review (never the raw content). */
export function refusalMessage(review: SafetyReview | undefined, fallback = OUTPUT_BLOCKED_MESSAGE): string {
  return boundedCopy(review?.refusal?.message, fallback)
}

export type SpeechPreparation =
  | { ok: true; text: string }
  | { ok: false; blocked: boolean; message: string }

export interface OutputReview {
  allowed: boolean
  /** Sanitised text to display; empty when `allowed` is false. */
  text: string
  /** Short refusal copy for the bubble when `allowed` is false. */
  message: string
  disclosures: string[]
  /** Contextual disclosures appended to allowed text (risk-category specific). */
  displayText: string
}

export interface InputReview {
  allowed: boolean
  /** Redacted + sanitised text; only for `allowed` callers. Never the raw text. */
  text: string
  message: string
  redacted: boolean
  constraints: string[]
  disclosures: string[]
}

export interface TrustLayerOptions {
  /** Options forwarded to every gate call (remote checker/failMode/timeouts). */
  reviewOptions?: GateOptions
  /** Lower only with a documented reason; the TTS cap defaults to 120. */
  ttsMaxChars?: number
  /** Injected boundary for tests/telemetry; defaults to one per trust layer. */
  boundary?: ErrorBoundary
  /** Injected for tests so the fail-closed path is provable without fakes. */
  assertTts?: (text: string, options: { ttsMaxChars: number }) => Promise<string>
  reviewInput?: (text: string, options: GateOptions) => Promise<SafetyReview>
  reviewOutput?: (text: string, options: GateOptions) => Promise<SafetyReview>
  reviewDlc?: (text: string, options: GateOptions) => Promise<SafetyReview>
}

export interface TrustLayer {
  readonly boundary: ErrorBoundary
  prepareSpeech(text: string): Promise<SpeechPreparation>
  reviewUserInputForForwarding(text: string): Promise<InputReview>
  reviewModelOutputForDisplay(text: string): Promise<OutputReview>
  reviewDlcForDisplay(text: string): Promise<OutputReview>
}

function emptyOutputReview(message: string): OutputReview {
  return { allowed: false, text: '', message, disclosures: [], displayText: '' }
}

function toOutputReview(review: SafetyReview): OutputReview {
  const text = sanitizePlainText(review.safeText, { maxChars: SECURITY_LIMITS.bubbleChars })
  // Contextual lines only: the persistent AI/non-human notices are already shown
  // by the consent layer/About panel, so a normal bark stays one short line.
  const contextual = review.disclosures.filter(
    (line) => !/^AI 对话|^AI 合成语音|^非 DeepSeek 官方|^每连续使用/.test(line),
  )
  const displayText = contextual.length > 0 ? `${text}（${contextual.join('；')}）` : text
  return { allowed: true, text, message: '', disclosures: review.disclosures, displayText }
}

function toInputReview(review: SafetyReview): InputReview {
  return {
    allowed: true,
    text: sanitizePlainText(review.safeText, { maxChars: SECURITY_LIMITS.importTextChars }),
    message: '',
    redacted: review.redacted,
    constraints: review.constraints,
    disclosures: review.disclosures,
  }
}

/**
 * Create the trust adapter used by the pet main flow. Every method is
 * fail-closed: an exception inside the safety layer blocks the operation and is
 * logged through the error boundary instead of being swallowed.
 */
export function createTrustLayer(options: TrustLayerOptions = {}): TrustLayer {
  const boundary =
    options.boundary ?? createErrorBoundary({ context: 'pet:safety', fallbackMessage: SAFETY_UNAVAILABLE_MESSAGE })
  const reviewOptions = options.reviewOptions ?? {}
  const ttsMaxChars = Math.max(1, Math.min(TTS_MAX_CHARS, Math.floor(options.ttsMaxChars ?? TTS_MAX_CHARS)))
  const assertTts = options.assertTts ?? assertSafeForTts
  const reviewInput = options.reviewInput ?? reviewUserInput
  const reviewOutput = options.reviewOutput ?? reviewModelOutput
  const reviewDlc = options.reviewDlc ?? reviewDlcDescription

  return {
    boundary,
    async prepareSpeech(text: string): Promise<SpeechPreparation> {
      try {
        return { ok: true, text: await assertTts(text, { ...reviewOptions, ttsMaxChars }) }
      } catch (error) {
        // An expected content block is not an error: only the short refusal copy
        // is shown, and every other failure is logged as fail-closed.
        if (isSafetyBlockedError(error)) {
          return { ok: false, blocked: true, message: refusalMessage(error.review) }
        }
        boundary.guardSync(() => {
          throw error
        })
        // The local safety layer itself failed: never show/speak unchecked text.
        return { ok: false, blocked: true, message: SAFETY_UNAVAILABLE_MESSAGE }
      }
    },
    async reviewUserInputForForwarding(text: string): Promise<InputReview> {
      const result = await boundary.guardAsync(() => reviewInput(text, reviewOptions))
      if (!result.ok) return { allowed: false, text: '', message: SAFETY_UNAVAILABLE_MESSAGE, redacted: true, constraints: [], disclosures: [] }
      if (!result.value.allowed) {
        const message = boundedCopy(result.value.refusal?.message, INPUT_BLOCKED_MESSAGE)
        return { allowed: false, text: '', message, redacted: true, constraints: [], disclosures: [] }
      }
      return toInputReview(result.value)
    },
    async reviewModelOutputForDisplay(text: string): Promise<OutputReview> {
      const result = await boundary.guardAsync(() => reviewOutput(text, reviewOptions))
      if (!result.ok) return emptyOutputReview(SAFETY_UNAVAILABLE_MESSAGE)
      if (!result.value.allowed) return emptyOutputReview(boundedCopy(result.value.refusal?.message, OUTPUT_BLOCKED_MESSAGE))
      return toOutputReview(result.value)
    },
    async reviewDlcForDisplay(text: string): Promise<OutputReview> {
      const result = await boundary.guardAsync(() => reviewDlc(text, reviewOptions))
      if (!result.ok) return emptyOutputReview(SAFETY_UNAVAILABLE_MESSAGE)
      if (!result.value.allowed) return emptyOutputReview(boundedCopy(result.value.refusal?.message, '这个内容包暂时不展示。'))
      return toOutputReview(result.value)
    },
  }
}

/**
 * Process-wide trust layer. `main.ts` uses this instance; tests build their own
 * with injected failures. Keeping one instance means one boundary/lastFailure.
 */
export const trust = createTrustLayer()

// ---------------------------------------------------------------------------
// DeepSeek chat helpers (no pet call site today — see file header)
// ---------------------------------------------------------------------------

export type DeepSeekChatReply =
  | { ok: true; text: string; usage?: unknown; safety?: unknown }
  | { ok: false; code: 'CONTENT_RISK' | 'REFUSAL' | 'API'; message: string; usage?: unknown; safety?: unknown }

/**
 * Build a chat-completion request with `safety_check:{level:"high"}`.
 * This is the ONLY place the pet may add that field; chat-import/TTS/ASR are
 * not chat completions and must not pretend to use it.
 */
export function buildDeepSeekChatRequest(request: Record<string, unknown>): Record<string, unknown> {
  return withDeepSeekSafetyCheck(request)
}

function refusalCopyFor(error: unknown): string {
  if (error instanceof DeepSeekRefusalError && error.details.categories.includes('self_harm')) {
    return '听起来你现在很难受。请尽快联系身边信任的人或专业人员：心理援助热线 12356；紧急情况请拨 110/120。'
  }
  if (isDeepSeekSafetyError(error)) return '这个内容被内容安全策略拦截了，换个话题吧。'
  return '模型暂时没有返回可用内容，请稍后再试。'
}

/** Parse a non-stream chat response; a refusal/400 is never an empty success. */
export function parseDeepSeekChatResponse(json: unknown): DeepSeekChatReply {
  try {
    const inspection = readDeepSeekContent(json)
    return {
      ok: true,
      text: inspection.text,
      ...(inspection.usage !== undefined ? { usage: inspection.usage } : {}),
      ...(inspection.safety !== undefined ? { safety: inspection.safety } : {}),
    }
  } catch (error) {
    if (isDeepSeekSafetyError(error)) {
      return {
        ok: false,
        code: error.code === 'CONTENT_EXISTS_RISK' ? 'CONTENT_RISK' : 'REFUSAL',
        message: refusalCopyFor(error),
      }
    }
    return { ok: false, code: 'API', message: refusalCopyFor(error) }
  }
}

/** Map a non-2xx HTTP response (incl. 400 `Content Exists Risk`) to a reply. */
export function parseDeepSeekChatHttpFailure(status: number, body: unknown): DeepSeekChatReply {
  const parsed = parseDeepSeekHttpError(status, body)
  if (isDeepSeekSafetyError(parsed)) {
    return { ok: false, code: 'CONTENT_RISK', message: refusalCopyFor(parsed) }
  }
  return { ok: false, code: 'API', message: `模型请求失败（HTTP ${status}），请稍后再试。` }
}

export interface DeepSeekDraftStream {
  /** Feed a raw chunk; returns the newly safe visible text ('' on refusal). */
  feed(chunk: string): string
  /** Commit at end of stream; never returns text after a refusal. */
  commit(): DeepSeekChatReply
  /** UI cancellation: drop everything buffered. */
  discard(): void
  readonly hasFailure: boolean
}

/**
 * Streaming draft guard: already-streamed text is cleared in the UI when the
 * provider refuses mid-stream. The pet has no streaming chat UI yet; this is the
 * reusable contract for the future one (and is unit-tested).
 */
export function createDeepSeekDraftStream(): DeepSeekDraftStream {
  const guard = new DeepSeekStreamGuard()
  return {
    feed(chunk: string): string {
      return guard.feed(chunk).text
    },
    commit(): DeepSeekChatReply {
      try {
        const committed = guard.commit()
        return {
          ok: true,
          text: committed.text,
          ...(committed.usage !== undefined ? { usage: committed.usage } : {}),
          ...(committed.safety !== undefined ? { safety: committed.safety } : {}),
        }
      } catch (error) {
        return { ok: false, code: 'REFUSAL', message: refusalCopyFor(error) }
      }
    },
    discard(): void {
      guard.discard()
    },
    get hasFailure(): boolean {
      return guard.hasFailure
    },
  }
}
