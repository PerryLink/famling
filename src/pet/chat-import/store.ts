import type { ConversationDigest } from './deepseek-share.ts'
import { SECURITY_LIMITS, sanitizePlainText } from '../security/limits.ts'
import {
  readVersioned,
  removeKey,
  writeVersioned,
  type StorageWriteResult,
  type StorageWriteStatus,
} from '../security/safe-storage.ts'
import { DIGEST_IMPORTED_AT_MAX_CHARS, DIGEST_TITLE_MAX_CHARS, DIGEST_TOPIC_MAX_CHARS } from './digest.ts'

/**
 * CONSENT / TOS GATE (do not bypass): importing/saving an external conversation
 * digest is a content import. The pet entry point must gate opening the importer
 * through `requireContentConsent()`; direct-URL dev flows must keep the same
 * disclaimer/audit policy. Do not remove the gate or the disclaimer copy, do
 * not use imported content for illegal purposes, and declare the source/licence
 * of any imported material.
 */

export const CHAT_DIGEST_KEY = 'desktop-games/pet/chat-import/v1'
/** Envelope version for the stored digest (migrates the old raw JSON value). */
export const CHAT_DIGEST_VERSION = 1

const MAX_LIST = 12

/** Bounded strings only: control chars/bidi removed, code points capped. */
function cleanString(value: unknown, maxChars: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const clean = sanitizePlainText(value, { maxChars, allowNewlines: false })
  return clean || undefined
}

function cleanList(value: unknown, maxChars: number, limit = MAX_LIST): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: string[] = []
  for (const entry of value.slice(0, limit)) {
    const clean = cleanString(entry, maxChars)
    if (clean) out.push(clean)
  }
  return out
}

/**
 * Validate every field of a stored digest. The old loader only checked
 * `shareId`/`topics`, so arbitrary `title`/`importedAt` reached `new Date(...)`
 * and the shown-key concatenation. Bad values return undefined (whole digest
 * rejected) — the pet must not half-trust a tampered localStorage value.
 */
export function validateDigest(value: unknown): ConversationDigest | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const shareId = cleanString(raw.shareId, 128)
  const title = cleanString(raw.title, DIGEST_TITLE_MAX_CHARS)
  const importedAt = cleanString(raw.importedAt, DIGEST_IMPORTED_AT_MAX_CHARS)
  const topics = cleanList(raw.topics, DIGEST_TOPIC_MAX_CHARS)
  const preferences = cleanList(raw.preferences, 120)
  const commitments = cleanList(raw.commitments, 120)
  const messageCount = raw.messageCount
  const userTurns = raw.userTurns
  const assistantTurns = raw.assistantTurns
  if (!shareId || !title || !importedAt || !topics || !preferences || !commitments) return undefined
  if (Number.isNaN(Date.parse(importedAt))) return undefined
  for (const count of [messageCount, userTurns, assistantTurns]) {
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return undefined
  }
  if (raw.rawStored !== false) return undefined
  return {
    title,
    shareId,
    importedAt,
    messageCount: Math.floor(messageCount as number),
    userTurns: Math.floor(userTurns as number),
    assistantTurns: Math.floor(assistantTurns as number),
    topics,
    preferences,
    commitments,
    rawStored: false,
  }
}

/**
 * Persist the digest. Never throws: callers branch on the status and show a
 * user message (QuotaExceededError used to escape the click handler).
 */
export function saveDigest(digest: ConversationDigest): StorageWriteResult {
  return writeVersioned(CHAT_DIGEST_KEY, digest, {
    version: CHAT_DIGEST_VERSION,
    maxBytes: SECURITY_LIMITS.importDigestBytes,
  })
}

/** Bounded user-facing copy for a failed digest write. */
export function describeDigestWriteFailure(status: StorageWriteStatus): string {
  switch (status) {
    case 'quota':
      return '本机存储空间满了，先清理一点再保存摘要。'
    case 'unavailable':
      return '本机存储暂时不可用，摘要没有保存。'
    case 'serialize':
      return '摘要数据无法保存（格式错误）。'
    case 'too-large':
      return '摘要太大，没有保存。'
    default:
      return '摘要没有保存，请稍后再试。'
  }
}

/** Load a validated digest; version envelope or the legacy raw JSON value. */
export function loadDigest(): ConversationDigest | undefined {
  const result = readVersioned<ConversationDigest>(
    CHAT_DIGEST_KEY,
    {
      version: CHAT_DIGEST_VERSION,
      validate: validateDigest,
      // Legacy store wrote the digest as raw JSON (no `{v,data}` envelope).
      migrate: (value) => value,
      maxBytes: SECURITY_LIMITS.importDigestBytes,
    },
    undefined,
  )
  return result.status === 'ok' ? result.value : undefined
}

export function clearDigest(): void {
  removeKey(CHAT_DIGEST_KEY)
}
