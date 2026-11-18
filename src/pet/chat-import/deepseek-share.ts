/**
 * DeepSeek web share-link import (local, user-initiated).
 *
 * A share page is a public read-only conversation. The web app loads it from
 * `GET https://chat.deepseek.com/api/v0/share/content?share_id=<id>`; the Tauri
 * host fetches that fixed endpoint to avoid browser CORS. We never scrape the
 * user's private chat history, never log in, and never upload the result.
 */
import { SECURITY_LIMITS, sanitizePlainText } from '../security/limits.ts'

export interface ImportedMessage {
  role: 'user' | 'assistant'
  text: string
  /** DeepSeek "thinking" fragment, kept separate and not used as user content. */
  thinking?: string
  timestamp?: number
}

export interface ImportedConversation {
  shareId: string
  title: string
  messages: ImportedMessage[]
  fetchedAt: string
}

export interface ConversationDigest {
  title: string
  shareId: string
  importedAt: string
  messageCount: number
  userTurns: number
  assistantTurns: number
  topics: string[]
  preferences: string[]
  commitments: string[]
  /** No raw conversation is stored by default. */
  rawStored: false
}

export const SHARE_HOST = 'chat.deepseek.com'
export const SHARE_PATH_RE = /^\/share\/([A-Za-z0-9_-]{4,128})\/?$/

export function parseShareId(input: string): string | undefined {
  if (typeof input !== 'string') return undefined
  const text = input.trim()
  if (!text || text.length > 2048) return undefined
  if (/^[A-Za-z0-9_-]{4,128}$/.test(text)) return text
  try {
    const url = new URL(text, 'https://chat.deepseek.com/')
    if (url.hostname !== SHARE_HOST && !url.hostname.endsWith('.deepseek.com')) return undefined
    const match = SHARE_PATH_RE.exec(url.pathname)
    return match?.[1]
  } catch {
    return undefined
  }
}

interface RawFragment {
  type?: string
  content?: string
}
interface RawMessage {
  role?: string
  fragments?: RawFragment[]
  inserted_at?: number
}
interface RawPayload {
  code?: number
  msg?: string
  data?: { biz_data?: { title?: string; messages?: RawMessage[] } }
}

/** Bounded copy: control chars removed, code-point capped, never unbounded. */
function boundedText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return ''
  return sanitizePlainText(value, { maxChars, allowNewlines: true, trim: true })
}

/** Error text from the provider is bounded and never the full payload. */
function boundedErrorMessage(value: unknown, maxChars = 120): string {
  return sanitizePlainText(value, { maxChars, allowNewlines: false })
}

/** Configurable transport/limits; exported for tests and defensive hosts. */
export interface NormalizeShareOptions {
  maxMessages?: number
  maxTotalTextChars?: number
  maxTitleChars?: number
}

/**
 * Normalise a public DeepSeek share payload into a bounded conversation.
 * Hardening P1-1: message count, per-message text and total text are capped
 * before anything is digested/displayed/stored; frames with hostile shapes are
 * skipped instead of throwing.
 */
export function normalizeSharePayload(
  payload: unknown,
  shareId: string,
  options: NormalizeShareOptions = {},
): ImportedConversation {
  const maxMessages = Number.isFinite(options.maxMessages)
    ? Math.max(1, Math.floor(options.maxMessages as number))
    : SECURITY_LIMITS.importMessages
  const maxTotalTextChars = Number.isFinite(options.maxTotalTextChars)
    ? Math.max(1, Math.floor(options.maxTotalTextChars as number))
    : SECURITY_LIMITS.importTextChars
  const maxTitleChars = Number.isFinite(options.maxTitleChars)
    ? Math.max(1, Math.floor(options.maxTitleChars as number))
    : 200
  if (!payload || typeof payload !== 'object') throw new Error('DeepSeek share response is not an object')
  const raw = payload as RawPayload
  if (raw.code !== 0) {
    throw new Error(`DeepSeek share API error: code=${boundedErrorMessage(raw.code, 16)} msg=${boundedErrorMessage(raw.msg)}`)
  }
  const body = raw.data?.biz_data
  if (!body || !Array.isArray(body.messages)) throw new Error('DeepSeek share response has no messages')
  const messages: ImportedMessage[] = []
  let usedText = 0
  for (const message of body.messages.slice(0, maxMessages)) {
    if (!message || typeof message !== 'object') continue
    const role = message.role === 'USER' ? 'user' : message.role === 'ASSISTANT' ? 'assistant' : undefined
    if (!role) continue
    const textParts: string[] = []
    const thinkParts: string[] = []
    const fragments = Array.isArray(message.fragments) ? message.fragments : []
    for (const fragment of fragments.slice(0, 200)) {
      if (!fragment || typeof fragment !== 'object') continue
      if (typeof fragment.content !== 'string' || fragment.content.length === 0) continue
      if (fragment.type === 'THINK') {
        const think = boundedText(fragment.content, 4_000)
        if (think) thinkParts.push(think)
      } else if (fragment.type === 'REQUEST' || fragment.type === 'RESPONSE') {
        const remaining = maxTotalTextChars - usedText
        if (remaining <= 0) break
        const part = boundedText(fragment.content, Math.min(remaining, 8_000))
        if (!part) continue
        textParts.push(part)
        usedText += part.length
      }
    }
    const text = textParts.join('\n').trim()
    if (!text) continue
    const timestamp = typeof message.inserted_at === 'number' && Number.isFinite(message.inserted_at) && message.inserted_at >= 0
      ? Math.min(message.inserted_at, Number.MAX_SAFE_INTEGER)
      : undefined
    messages.push({
      role,
      text,
      ...(thinkParts.length > 0 ? { thinking: thinkParts.join('\n').slice(0, 4_000) } : {}),
      ...(timestamp !== undefined ? { timestamp } : {}),
    })
    if (usedText >= maxTotalTextChars) break
  }
  if (messages.length === 0) throw new Error('DeepSeek share contains no user/assistant text')
  const title = boundedText(body.title, maxTitleChars) || 'DeepSeek shared conversation'
  return { shareId, title, messages, fetchedAt: new Date().toISOString() }
}
