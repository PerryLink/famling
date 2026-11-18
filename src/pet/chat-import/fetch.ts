import { normalizeSharePayload, parseShareId, SHARE_HOST, type ImportedConversation } from './deepseek-share.ts'
import {
  fetchJsonWithTimeout,
  FetchTimeoutError,
  ResponseTooLargeError,
  type FetchJsonResult,
} from '../security/fetch-timeout.ts'
import { SECURITY_LIMITS, utf8ByteLength } from '../security/limits.ts'
import { classifyError, toUserMessage } from '../security/error-boundary.ts'

/**
 * Read a public DeepSeek share conversation.
 *
 * Hardening P1-1: the browser fallback now uses the shared abortable,
 * size-capped, retry-capped JSON fetch (timeout/Abort/response cap). The Tauri
 * host command already has a 25 s Rust timeout and a hard-coded validated URL;
 * we still bound how long the UI waits and how large the returned payload may
 * be before normalising it. Neither path logs the conversation content.
 *
 * NOTE (DeepSeek safety): this is a public share-page READ, not a chat
 * completion, so `safety_check: {level:"high"}` does not apply here. The pet has
 * NO model-chat call site today; any future chat completion MUST be built via
 * `src/pet/trust.ts` `buildDeepSeekChatRequest()` (withDeepSeekSafetyCheck) and
 * parsed with `parseDeepSeekChatResponse()` / `createDeepSeekDraftStream()`.
 */
export interface FetchShareOptions {
  /** Injected for tests; bypasses the transport entirely (legacy hook). */
  fetcher?: (shareId: string) => Promise<unknown>
  /** Injected browser JSON transport (tests); defaults to fetchJsonWithTimeout. */
  fetchJson?: (url: string, options: Record<string, unknown>) => Promise<FetchJsonResult<unknown>>
  /** Injected Tauri invoke (tests); defaults to `@tauri-apps/api/core`. */
  invoke?: (command: string, args: Record<string, unknown>) => Promise<unknown>
  /** UI timeout for the Tauri invoke (the Rust command has its own 25 s cap). */
  timeoutMs?: number
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new FetchTimeoutError(timeoutMs))
    }, timeoutMs)
    promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Size-capped post-receive guard for the Tauri payload (Rust returns Value). */
function assertPayloadSize(payload: unknown, maxBytes = SECURITY_LIMITS.fetchResponseBytes): void {
  let text: string
  try {
    text = JSON.stringify(payload) ?? ''
  } catch {
    throw new Error('分享内容无法读取。')
  }
  const bytes = utf8ByteLength(text)
  if (bytes > maxBytes) throw new ResponseTooLargeError(bytes, maxBytes)
}

/**
 * Classify a share-import failure into a short, safe message. Details are
 * redacted/bounded by the shared error helpers; raw content is never included.
 */
export function describeShareFetchError(error: unknown): string {
  if (error instanceof FetchTimeoutError) return '读取超时了，请稍后再试。'
  if (error instanceof ResponseTooLargeError) return '分享内容太大，无法导入。'
  const classification = classifyError(error)
  switch (classification.kind) {
    case 'abort':
      return '已取消读取。'
    case 'timeout':
      return '读取超时了，请稍后再试。'
    case 'network': {
      const status = /http-(\d{3})/.exec(classification.message)?.[1]
      if (status === '404' || status === '403') return '分享链接不存在或不是公开分享。'
      if (status === '429') return '读取太频繁了，先歇一下再试。'
      return '网络没连上，稍后再试。'
    }
    case 'parse':
      return '分享内容格式无法识别。'
    case 'validation':
      return toUserMessage(error)
    default:
      return '读取失败，请检查链接后再试。'
  }
}

export async function fetchDeepSeekShare(input: string, options: FetchShareOptions = {}): Promise<ImportedConversation> {
  if (typeof input === 'string' && input.length > SECURITY_LIMITS.importUrlChars) {
    throw new Error('链接太长了，不是有效的 DeepSeek 分享链接。')
  }
  const shareId = parseShareId(input)
  if (!shareId) throw new Error('不是有效的 DeepSeek 分享链接；应形如 https://chat.deepseek.com/share/<id>')
  let payload: unknown
  if (options.fetcher) {
    payload = await options.fetcher(shareId)
  } else if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const invoke = options.invoke ?? (async (command: string, args: Record<string, unknown>) => {
      const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
      return tauriInvoke<unknown>(command, args)
    })
    const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
      ? Math.floor(options.timeoutMs as number)
      : SECURITY_LIMITS.fetchTimeoutMs
    payload = await withTimeout(invoke('fetch_deepseek_share', { shareId }), timeoutMs)
    assertPayloadSize(payload)
  } else {
    // Browser demo fallback: the endpoint may be blocked by CORS; surface a
    // clear error instead of silently fetching through a third-party proxy.
    const url = `https://${SHARE_HOST}/api/v0/share/content?share_id=${encodeURIComponent(shareId)}`
    const fetchJson = options.fetchJson ?? ((target: string, init: Record<string, unknown>) => fetchJsonWithTimeout<unknown>(target, init as never))
    const result = await fetchJson(url, {
      headers: { Accept: 'application/json' },
      timeoutMs: SECURITY_LIMITS.fetchTimeoutMs,
      retries: SECURITY_LIMITS.fetchMaxRetries,
      maxResponseBytes: SECURITY_LIMITS.fetchResponseBytes,
    })
    payload = result.data
  }
  return normalizeSharePayload(payload, shareId)
}
