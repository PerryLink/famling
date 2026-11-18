/**
 * Local, deterministic digest of a shared conversation. No model call and no
 * network; the raw transcript is not persisted by the importer.
 *
 * Hardening P1-1: the digest has hard input bounds (message count + characters)
 * and a token budget, so one oversized public share cannot freeze the page or
 * grow the topic Map without limit. Titles/excerpts are bounded too.
 */
import type { ConversationDigest, ImportedConversation } from './deepseek-share.ts'
import { sanitizePlainText } from '../security/limits.ts'

/** Messages considered for the digest (normalize already caps at importMessages). */
export const DIGEST_MAX_MESSAGES = 200
/** User text analysed for topics (first N chars). */
export const DIGEST_MAX_USER_TEXT_CHARS = 40_000
/** Chinese n-gram tokens kept in the counting Map. */
export const DIGEST_MAX_TOKENS = 20_000
/** Longest preference/commitment line kept in the digest. */
export const DIGEST_MAX_LINE_CHARS = 120

const STOP = new Set([
  '的', '了', '是', '我', '你', '他', '她', '它', '们', '这', '那', '在', '有', '和', '与', '就', '都', '也', '不', '很',
  '一个', '什么', '怎么', '因为', '所以', '但是', '如果', '可以', '这个', '那个', '我们', '你们', '他们', '自己', '就是',
  'the', 'and', 'for', 'that', 'this', 'with', 'you', 'are', 'not', '但是', '然后', '还是', '已经', '没有', '需要',
])

function words(text: string, maxTokens = DIGEST_MAX_TOKENS): string[] {
  const out: string[] = []
  // English tokens + Chinese 2–4 character n-grams. Whole Chinese sentences are
  // poor topics; n-grams let repeated concepts ("报价", "中文") surface.
  for (const match of text.matchAll(/[A-Za-z][A-Za-z0-9+#._-]{2,}/g)) {
    const token = match[0].toLowerCase()
    if (!STOP.has(token)) out.push(token)
    if (out.length >= maxTokens) return out
  }
  for (const match of text.matchAll(/[\u4e00-\u9fa5]{2,}/g)) {
    const run = match[0]
    for (let size = 2; size <= Math.min(4, run.length); size++) {
      for (let i = 0; i + size <= run.length; i++) {
        const token = run.slice(i, i + size)
        if (!STOP.has(token)) out.push(token)
        if (out.length >= maxTokens) return out
      }
    }
  }
  return out
}

function sentences(text: string): string[] {
  return text
    .split(/[。！？!?；;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 4)
}

function top<T>(items: T[], score: (item: T) => number, limit: number): T[] {
  return [...new Set(items)].sort((a, b) => score(b) - score(a)).slice(0, limit)
}

function extract(texts: string[], pattern: RegExp, limit: number): string[] {
  const found: string[] = []
  for (const text of texts) {
    for (const sentence of sentences(text)) {
      if (pattern.test(sentence) && sentence.length <= DIGEST_MAX_LINE_CHARS) found.push(sentence)
      if (found.length >= limit * 4) break
    }
  }
  return [...new Set(found)].slice(0, limit)
}

/** Bounded user text used for topic analysis; never the whole transcript. */
function userTextsForDigest(conversation: ImportedConversation): string[] {
  const texts: string[] = []
  let used = 0
  for (const message of conversation.messages.slice(0, DIGEST_MAX_MESSAGES)) {
    if (message.role !== 'user') continue
    const remaining = DIGEST_MAX_USER_TEXT_CHARS - used
    if (remaining <= 0) break
    const text = typeof message.text === 'string' ? message.text.slice(0, remaining) : ''
    if (!text) continue
    texts.push(text)
    used += text.length
  }
  return texts
}

export function buildDigest(conversation: ImportedConversation): ConversationDigest {
  const messages = Array.isArray(conversation.messages) ? conversation.messages.slice(0, DIGEST_MAX_MESSAGES) : []
  const userTexts = userTextsForDigest(conversation)
  const counts = new Map<string, number>()
  for (const token of words(userTexts.join('\n'))) {
    if (!counts.has(token) && counts.size >= DIGEST_MAX_TOKENS) continue
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
  const topicList = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .slice(0, 12)
  const preferences = extract(
    userTexts,
    /(我喜欢|我不喜欢|我习惯|我偏好|我更喜欢|不要|别再|以后|记住|叫我|希望|最好|请用|请按)/,
    8,
  )
  const commitments = extract(
    userTexts,
    /(明天|后天|今天|下周|本周|周[一二三四五六日天]|\d{1,2}点|之前|截止|记得|要做|安排|约|完成|提交|跟进)/,
    8,
  )
  return {
    title: sanitizePlainText(conversation.title, { maxChars: 200, allowNewlines: false }) || 'DeepSeek shared conversation',
    shareId: sanitizePlainText(conversation.shareId, { maxChars: 128, allowNewlines: false }),
    importedAt: new Date().toISOString(),
    messageCount: conversation.messages.length,
    userTurns: messages.filter((message) => message.role === 'user').length,
    assistantTurns: messages.filter((message) => message.role === 'assistant').length,
    topics: top(topicList, (token) => counts.get(token) ?? 0, 12),
    preferences,
    commitments,
    rawStored: false,
  }
}

/** Longest field accepted when a stored/imported digest is displayed. */
export const DIGEST_TITLE_MAX_CHARS = 200
export const DIGEST_TOPIC_MAX_CHARS = 80
export const DIGEST_IMPORTED_AT_MAX_CHARS = 40
