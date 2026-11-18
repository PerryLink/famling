/**
 * `chat-import.html` runtime: read a public DeepSeek share and keep a bounded
 * local digest. No login, no private conversation access, no model call here.
 *
 * CONSENT / TOS GATE (TRUST-REVIEW-2026-11-17 P0-2 — do not bypass):
 * - This page is reachable by direct URL (setup.html links it and users can type
 *   it), so it gates itself instead of trusting the pet entry point. Boot runs
 *   the SAME consent runtime as the pet (`bootstrapConsent`): while the first-run
 *   TOS is not accepted the page returns before wiring any button — no share
 *   fetch, no digest extraction, no digest load/render, no local write. It also
 *   reads the persisted acceptance directly so a broken/blocked storage fails
 *   closed with an explicit blocking notice instead of appearing usable.
 * - Reading a share and saving/clearing the digest are content imports: each one
 *   still requires a FRESH full-TOS per-action consent (full text, every time,
 *   audit recorded by the gate). The pet's earlier acceptance never exempts it.
 * - URL query parameters are never read: there is no `?skip=1` style switch.
 */
import { describeShareFetchError, fetchDeepSeekShare } from './chat-import/fetch.ts'
import { buildDigest } from './chat-import/digest.ts'
import { clearDigest, describeDigestWriteFailure, loadDigest, saveDigest } from './chat-import/store.ts'
import type { ConversationDigest, ImportedConversation } from './chat-import/deepseek-share.ts'
import { createSecurityRateLimits } from './security/rate-limit.ts'
import { truncateCodePoints } from './security/limits.ts'
import { trust, type InputReview } from './trust.ts'
import { bootstrapConsent, canInteract, initConsentRuntime, requireContentConsent } from './consent/runtime.ts'
import {
  ACCEPTANCE_STORAGE_KEY,
  acceptanceStatus,
  parseAcceptanceRaw,
  type AcceptanceStatus,
  type ConsentMode,
} from './consent/core.ts'
import { TOS_VERSION } from './consent/terms.ts'

const DIGEST_LINE_MAX_CHARS = 120
/** One import = one DeepSeek share read; 2 burst then 1/30 s (audit P1-1). */
const importLimiter = createSecurityRateLimits().import

/**
 * Audit action ids for THIS page. They deliberately differ from the pet menu's
 * `content.chat-import-open` so the audit trail shows which surface actually
 * performed the external read/write (the pet entry only opens the page).
 */
export const CHAT_IMPORT_ACTIONS = {
  fetch: 'content.chat-import-fetch',
  save: 'content.chat-import-save',
  clear: 'content.chat-import-clear',
} as const

const FETCH_DETAIL =
  '读取 DeepSeek 公开分享对话属于内容导入：会抓取该分享的公开内容并在本机生成摘要，可能包含第三方个人信息；每次读取都必须重新阅读完整免责声明并明确同意。'
const SAVE_DETAIL =
  '把导入摘要写入本机桌宠属于内容修改：摘要会落盘到本机存储并可能被后续记忆/模型融入使用（模型/语音会产生费用）；每次保存都必须重新阅读完整免责声明并明确同意。'
const CLEAR_DETAIL =
  '清除本机导入摘要属于删除本机内容：会删除已保存的摘要且不可恢复；本次删除需要重新阅读完整免责声明并明确同意。'

/** Result of reading the persisted first-run TOS acceptance for this page. */
export interface ChatImportAccess {
  readonly allowed: boolean
  readonly status: AcceptanceStatus | 'unavailable'
  readonly corrupt: boolean
  readonly acceptedAt: string | null
  readonly tosVersion: string | null
}

/**
 * Pure gate: accept only an acceptance record whose version AND text hash match
 * the current TOS. Corrupt/missing/mismatched records fail closed.
 */
export function evaluateChatImportAccess(raw: string | null | undefined): ChatImportAccess {
  const read = parseAcceptanceRaw(raw)
  if (!read.acceptance) {
    return {
      allowed: false,
      status: read.status,
      corrupt: read.corrupt,
      acceptedAt: null,
      tosVersion: null,
    }
  }
  const status = acceptanceStatus(read.acceptance, TOS_VERSION)
  return {
    allowed: status === 'accepted',
    status,
    corrupt: false,
    acceptedAt: read.acceptance.acceptedAt,
    tosVersion: read.acceptance.tosVersion,
  }
}

/** Read the consent acceptance from (injectable) local storage, fail closed. */
export function readChatImportAccess(storage?: Pick<Storage, 'getItem'> | null): ChatImportAccess {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof localStorage === 'undefined'
          ? null
          : localStorage
    if (!store) {
      return { allowed: false, status: 'unavailable', corrupt: false, acceptedAt: null, tosVersion: null }
    }
    return evaluateChatImportAccess(store.getItem(ACCEPTANCE_STORAGE_KEY))
  } catch {
    return { allowed: false, status: 'unavailable', corrupt: false, acceptedAt: null, tosVersion: null }
  }
}

/** Blocking copy shown by the page when the consent gate is not satisfied. */
export function describeChatImportBlock(access: ChatImportAccess): string {
  if (access.status === 'unavailable') {
    return '无法读取本机 TOS 同意状态（存储不可用）：本页已阻断，不会读取分享链接、不会摘录内容、不会保存任何数据。请回到桌宠完成首次 TOS 同意后再打开本页。'
  }
  if (access.corrupt) {
    return '本机 TOS 同意记录已损坏：本页已安全阻断，不会读取分享链接、不会摘录内容、不会保存任何数据。请回到桌宠重新阅读并同意完整 TOS。'
  }
  if (access.status === 'version-mismatch' || access.status === 'hash-mismatch') {
    return `TOS 已更新（本机记录版本 ${access.tosVersion ?? '未知'}，当前 ${TOS_VERSION}）：旧同意不延续。本页已阻断，请回到桌宠重新阅读并同意完整 TOS。`
  }
  return '尚未同意《使用条款、免责声明与用户同意书》：本页已阻断，不会读取分享链接、不会摘录内容、不会保存任何数据。请先在桌宠中勾选并同意完整 TOS，然后返回本页；读取/保存时每次仍会单独确认。'
}

function acceptedCopy(access: ChatImportAccess): string {
  const when = access.allowed && access.acceptedAt ? `（同意于 ${access.acceptedAt}）` : '（仅本次会话有效）'
  return `已通过首次 TOS 同意${when} · 当前条款 ${TOS_VERSION}。本页只做本地摘要：读取分享与保存/清除摘要属于内容导入，每次都会重新弹出完整 TOS 并要求明确同意；不同意时不会读取、不会保存。`
}

/** One full-TOS per-action request (audit id + user-facing cost/privacy detail). */
export interface ChatImportActionRequest {
  readonly action: string
  readonly detail: string
}

export interface ChatImportPageOptions {
  readonly document?: Document
  /** First-run/upgrade TOS check; defaults to the shared consent runtime. */
  readonly bootstrap?: () => Promise<ConsentMode>
  /** Gate accessor; defaults to the shared `canInteract()`. */
  readonly canInteract?: () => boolean
  /** Per-action full-TOS consent; defaults to `requireContentConsent`. */
  readonly requireConsent?: (request: ChatImportActionRequest) => Promise<boolean>
  /** Injectable transports/storage/review for the fake-DOM gate tests. */
  readonly fetchShare?: typeof fetchDeepSeekShare
  readonly save?: typeof saveDigest
  readonly load?: typeof loadDigest
  readonly clear?: typeof clearDigest
  readonly review?: (line: string) => Promise<InputReview>
}

export interface ChatImportBootResult {
  readonly started: boolean
  readonly blocked: boolean
  readonly mode: ConsentMode
}

function $<T extends HTMLElement>(doc: Document, id: string): T | null {
  const element = doc.getElementById(id)
  return (element as T | null) ?? null
}

/**
 * Boot the standalone import page behind the consent gate.
 * Returns `blocked: true` and wires NOTHING when the TOS is not accepted.
 */
export async function bootChatImportPage(options: ChatImportPageOptions = {}): Promise<ChatImportBootResult> {
  const doc = options.document ?? (typeof document === 'undefined' ? null : document)
  if (!doc) return { started: false, blocked: true, mode: 'readonly' }
  const bootstrap = options.bootstrap ?? bootstrapConsent
  const gateOpen = options.canInteract ?? canInteract
  let mode: ConsentMode = 'readonly'
  try {
    mode = await bootstrap()
  } catch {
    mode = 'readonly'
  }
  let accepted = false
  try {
    accepted = mode === 'accepted' && gateOpen()
  } catch {
    accepted = false
  }
  const gate = $<HTMLElement>(doc, 'consent-gate')
  const ready = $<HTMLElement>(doc, 'import-ready')
  const status = $<HTMLElement>(doc, 'consent-status')
  if (!accepted) {
    if (gate) gate.hidden = false
    if (ready) ready.hidden = true
    if (status) status.textContent = describeChatImportBlock(readChatImportAccess())
    return { started: false, blocked: true, mode }
  }
  const access = readChatImportAccess()
  if (gate) gate.hidden = false
  if (ready) ready.hidden = false
  if (status) status.textContent = acceptedCopy(access)
  startImportUi(doc, options)
  return { started: true, blocked: false, mode }
}

/** Wire the importer only after the gate passed; every action re-checks consent. */
function startImportUi(doc: Document, options: ChatImportPageOptions): void {
  const input = $<HTMLInputElement>(doc, 'share-url')
  const fetchButton = $<HTMLButtonElement>(doc, 'fetch')
  const status = $<HTMLElement>(doc, 'status')
  const preview = $<HTMLElement>(doc, 'preview')
  const convTitle = $<HTMLElement>(doc, 'conv-title')
  const convMeta = $<HTMLElement>(doc, 'conv-meta')
  const topics = $<HTMLUListElement>(doc, 'topics')
  const preferences = $<HTMLUListElement>(doc, 'preferences')
  const commitments = $<HTMLUListElement>(doc, 'commitments')
  const stored = $<HTMLElement>(doc, 'stored')
  const saveButton = $<HTMLButtonElement>(doc, 'save')
  const clearButton = $<HTMLButtonElement>(doc, 'clear')

  const load = options.load ?? loadDigest
  const save = options.save ?? saveDigest
  const clear = options.clear ?? clearDigest
  const review = options.review ?? ((line: string) => trust.reviewUserInputForForwarding(line))
  const fetchShare = options.fetchShare ?? fetchDeepSeekShare
  const gateOpen = options.canInteract ?? canInteract
  const requireConsent = options.requireConsent ?? requireContentConsent

  let current: { conversation: ImportedConversation; digest: ConversationDigest } | undefined
  let fetching = false

  const canAct = (): boolean => {
    try {
      return gateOpen()
    } catch {
      return false
    }
  }
  const setStatus = (text: string): void => {
    if (status) status.textContent = text
  }
  /**
   * Per-action gate. A throw (runtime missing) and a non-accepted state both
   * fail closed, so a broken gate can never silently allow an import.
   */
  const confirmAction = async (request: ChatImportActionRequest): Promise<boolean> => {
    if (!canAct()) return false
    try {
      return await requireConsent(request)
    } catch {
      return false
    }
  }

  const list = (el: HTMLUListElement | null, values: string[]): void => {
    if (!el) return
    el.replaceChildren()
    if (values.length === 0) {
      const li = doc.createElement('li')
      li.textContent = '（无）'
      el.append(li)
      return
    }
    for (const value of values) {
      const li = doc.createElement('li')
      li.textContent = value
      el.append(li)
    }
  }

  const renderStored = (): void => {
    // loadDigest() validates the whole stored shape (version envelope + fields).
    const digest = load()
    if (!stored) return
    stored.textContent = digest
      ? `${digest.title} · ${digest.messageCount} 条消息 · 导入于 ${new Date(digest.importedAt).toLocaleString()} · 主题：${digest.topics.slice(0, 6).join('、') || '无'}`
      : '（无）'
  }

  /**
   * Review the local digest excerpts as user content before they are displayed or
   * saved: blocked excerpts are dropped (never sent on), PII is redacted.
   * There is no model/TTS call site for the digest today; this keeps the
   * boundary in place for the future "memory integration" step.
   */
  const reviewDigestFields = async (
    digest: ConversationDigest,
  ): Promise<{ digest: ConversationDigest; dropped: number }> => {
    let dropped = 0
    const reviewLine = async (line: string): Promise<string | undefined> => {
      const decision = await review(line)
      if (!decision.allowed) {
        dropped += 1
        return undefined
      }
      const text = truncateCodePoints(decision.text, DIGEST_LINE_MAX_CHARS)
      return text || undefined
    }
    const reviewGroup = async (lines: readonly string[], limit: number): Promise<string[]> => {
      const out: string[] = []
      for (const line of lines) {
        const reviewed = await reviewLine(line)
        if (reviewed && !out.includes(reviewed)) out.push(reviewed)
        if (out.length >= limit) break
      }
      return out
    }
    const titleReview = await reviewLine(digest.title)
    const title = titleReview ? truncateCodePoints(titleReview, 200) : '（标题已隐去）'
    const safeTopics = await reviewGroup(digest.topics, 12)
    const safePreferences = await reviewGroup(digest.preferences, 8)
    const safeCommitments = await reviewGroup(digest.commitments, 8)
    return {
      digest: {
        ...digest,
        title,
        topics: safeTopics,
        preferences: safePreferences,
        commitments: safeCommitments,
      },
      dropped,
    }
  }

  const onFetch = async (): Promise<void> => {
    if (fetching) return
    if (!canAct()) {
      setStatus('未同意 TOS：不会读取分享链接。')
      return
    }
    // Our own page can be reached by direct URL, so each read is gated here too.
    const allowed = await confirmAction({ action: CHAT_IMPORT_ACTIONS.fetch, detail: FETCH_DETAIL })
    if (!allowed) {
      setStatus('已取消：未同意本次完整声明，分享内容没有被读取。')
      return
    }
    if (!canAct()) {
      setStatus('同意状态已变化，已取消读取，没有抓取任何内容。')
      return
    }
    const decision = importLimiter.tryConsume()
    if (!decision.allowed) {
      setStatus(`读取太频繁了，先歇 ${Math.max(1, Math.ceil(decision.retryAfterMs / 1000))} 秒再试。`)
      return
    }
    fetching = true
    if (fetchButton) fetchButton.disabled = true
    setStatus('读取中…（通过本机 Tauri 请求，不经过第三方代理）')
    try {
      const conversation = await fetchShare(input?.value ?? '')
      const digest = buildDigest(conversation)
      const reviewed = await reviewDigestFields(digest)
      current = { conversation, digest: reviewed.digest }
      if (convTitle) convTitle.textContent = reviewed.digest.title
      if (convMeta) {
        convMeta.textContent = `${reviewed.digest.messageCount} 条消息 · 用户 ${reviewed.digest.userTurns} / 助手 ${reviewed.digest.assistantTurns} · 分享 ID ${reviewed.digest.shareId}`
      }
      list(topics, reviewed.digest.topics)
      list(preferences, reviewed.digest.preferences)
      list(commitments, reviewed.digest.commitments)
      if (preview) preview.hidden = false
      const droppedNote = reviewed.dropped > 0 ? `；${reviewed.dropped} 条摘要因安全/隐私原因已隐去` : ''
      setStatus(
        `读取完成。仅本地解析，未调用模型；保存摘要不会产生模型费用，但后续模型融入/语音会产生费用${droppedNote}。`,
      )
    } catch (error) {
      setStatus(`失败：${describeShareFetchError(error)}`)
    } finally {
      fetching = false
      if (fetchButton) fetchButton.disabled = false
    }
  }

  const onSave = async (): Promise<void> => {
    if (!current) return
    if (!canAct()) {
      setStatus('未同意 TOS：摘要没有保存。')
      return
    }
    const allowed = await confirmAction({ action: CHAT_IMPORT_ACTIONS.save, detail: SAVE_DETAIL })
    if (!allowed) {
      setStatus('已取消：未同意本次完整声明，摘要没有保存。')
      return
    }
    if (!current || !canAct()) return
    const result = save(current.digest)
    if (result.status !== 'ok') {
      setStatus(`保存失败：${describeDigestWriteFailure(result.status)}`)
      return
    }
    renderStored()
    setStatus('摘要已保存到本机桌宠。注意：启用模型摘要/融入或语音时会产生调用费用。')
  }

  const onClear = async (): Promise<void> => {
    if (!canAct()) {
      setStatus('未同意 TOS：没有清除本地摘要。')
      return
    }
    const allowed = await confirmAction({ action: CHAT_IMPORT_ACTIONS.clear, detail: CLEAR_DETAIL })
    if (!allowed) {
      setStatus('已取消：未同意本次完整声明，本地摘要没有删除。')
      return
    }
    clear()
    current = undefined
    if (preview) preview.hidden = true
    renderStored()
    setStatus('本地摘要已清除。')
  }

  fetchButton?.addEventListener('click', () => {
    void onFetch()
  })
  saveButton?.addEventListener('click', () => {
    void onSave()
  })
  clearButton?.addEventListener('click', () => {
    void onClear()
  })

  renderStored()
}

// The importer page only boots in a real DOM. Node tests import the pure gate
// helpers above and call `bootChatImportPage()` with an injected fake document.
if (typeof document !== 'undefined') {
  try {
    initConsentRuntime({ document })
  } catch (error) {
    // Fail closed: boot below will resolve the gate as readonly without a runtime.
    console.error('[chat-import] consent runtime failed to initialize', error)
  }
  void bootChatImportPage().catch((error) => {
    console.error('[chat-import] boot failed', error)
    const status = document.getElementById('consent-status')
    if (status) status.textContent = '同意状态读取失败：已安全阻断本页（不会读取分享、不会保存摘要）。'
    const ready = document.getElementById('import-ready')
    if (ready) ready.hidden = true
  })
}
