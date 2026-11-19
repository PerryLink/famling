/**
 * Accessible DOM modals for the consent gate. No framework, no network.
 *
 * Hard rules (locked by tests and by the "Escape is not consent" requirement):
 * - a short key-facts layer renders ABOVE the full scrollable TOS (D6/MB-073)
 *   and is followed by the full TOS in a scrollable `role=region`;
 * - consent requires an explicit checkbox + explicit accept-button activation;
 *   Escape / backdrop / closing NEVER resolves as consent (Escape resolves as a
 *   decline so the gate can enter safe read-only mode);
 * - keyboard: focus moves into the dialog, Tab/Shift+Tab are trapped, focus is
 *   restored to the previously focused element on close;
 * - `prefers-reduced-motion` is respected by not animating anything (the global
 *   token/media block in pet.css also collapses any inherited motion);
 * - the background app is marked `inert` while a dialog is open, so no hidden
 *   action can run behind the consent prompt.
 */
import type { LegalSection } from './terms.ts'
import type { TosPrompt } from './core.ts'
import { HEALTH_DEFER_LABEL, HEALTH_REST_LABEL } from '../health-reminder.ts'
import {
  ASR_ACCEPT_LABEL,
  ASR_CHECKBOX_LABEL,
  ASR_DECLINE_LABEL,
  ROLEPLAY_ACCEPT_LABEL,
  ROLEPLAY_CHANGE_ACCEPT_LABEL,
  ROLEPLAY_CHECKBOX_LABEL,
  ROLEPLAY_DECLINE_LABEL,
  TOS_ACCEPT_LABEL,
  TOS_CHECKBOX_LABEL,
  TOS_DECLINE_LABEL,
  TOS_KEY_FACTS,
  TOS_KEY_FACTS_NOTE,
  TTS_ACCEPT_LABEL,
  TTS_CHECKBOX_LABEL,
  TTS_DECLINE_LABEL,
} from './terms.ts'
import {
  ROLEPLAY_ADDRESS_MAX_CHARS,
  ROLEPLAY_RELATIONSHIPS,
  ROLEPLAY_SCENES,
  ROLEPLAY_TONES,
  ROLEPLAY_CAPABILITY_NOTE,
  createEmptyRoleplaySettings,
  validateRoleplaySettings,
  type RoleplayOption,
  type RoleplaySettings,
} from './roleplay.ts'
import type { AgeDecision, AgePrompt, AsrPrompt, BlockedView, RoleplayDecision, RoleplayPrompt, TtsPrompt } from './gate.ts'
import {
  BIRTH_DATE_ERROR_MESSAGES,
  daysInMonth,
  validateBirthDate,
  type BirthDateError,
} from './age.ts'

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * DOM event dispatched whenever a consent overlay (full TOS / TTS declaration /
 * read-only blocked screen) opens or closes.
 *
 * Why: the desktop-shell context menu is appended to `<body>`, OUTSIDE the
 * `#pet-app` subtree that `lockBackground()` used to inert. During a TOS every
 * body-level entry point (contextmenu / Shift+F10 / the trigger button) must be
 * rejected, and an already-open menu must close and go inert the moment a modal
 * appears. `desktop-shell.ts` subscribes to this event and re-checks the gate;
 * the event is also a testable contract (`consent-bypass.test.ts`).
 */
export const CONSENT_OVERLAY_EVENT = 'pet-consent-overlay'
export interface ConsentOverlayEventDetail {
  readonly open: boolean
  /** CSS class of the overlay root (`consent-tos-modal`, `consent-blocked`, …). */
  readonly kind: string
}

type CustomEventCtor = new (type: string, init?: { detail?: unknown }) => Event

function notifyConsentOverlay(doc: Document, detail: ConsentOverlayEventDetail): void {
  try {
    // Browser: use the document's own CustomEvent. Fakes/tests may not expose a
    // defaultView, so fall back to the global constructor when present.
    const view = (doc as Document & { defaultView?: Window | null }).defaultView
    const ctor: CustomEventCtor | undefined =
      (view?.CustomEvent as CustomEventCtor | undefined) ??
      (typeof CustomEvent === 'function' ? (CustomEvent as unknown as CustomEventCtor) : undefined)
    if (!ctor) return
    doc.dispatchEvent(new ctor(CONSENT_OVERLAY_EVENT, { detail }))
  } catch {
    /* event fan-out is best effort: every consumer also re-reads the gate */
  }
}

/** True when a consent modal/TOS/blocked overlay is currently in the DOM. */
export function hasOpenConsentOverlay(doc: Document): boolean {
  try {
    return doc.querySelectorAll('.consent-root').length > 0
  } catch {
    return false
  }
}

let dialogSequence = 0
const openRoots: HTMLElement[] = []
/** Body-level siblings this module inerted; released only after the last root closes. */
let inertedElements: Element[] = []

function lockBackground(doc: Document, root: HTMLElement): void {
  if (openRoots.length === 0) {
    // `#pet-app` alone is NOT enough: the desktop-shell menu is a direct
    // `<body>` child (and standalone pages like chat-import/setup have no
    // `#pet-app` at all). Inert every body-level sibling of the consent root so
    // hidden chrome — or page content on a standalone page — cannot be operated
    // behind the modal. Only elements WE inerted are recorded, so a pre-existing
    // `inert` attribute survives the modal.
    for (const element of Array.from(doc.body.children)) {
      // Stacked consent overlays are siblings too: never inert another overlay.
      if (element === root || element.classList.contains('consent-root')) continue
      if (element.hasAttribute('inert')) continue
      element.setAttribute('inert', '')
      inertedElements.push(element)
    }
    // Keep the documented #pet-app contract even if a layout nests it deeper.
    const petApp = doc.getElementById('pet-app')
    if (petApp && !petApp.hasAttribute('inert')) {
      petApp.setAttribute('inert', '')
      inertedElements.push(petApp)
    }
  }
  openRoots.push(root)
}

function unlockBackground(doc: Document, root: HTMLElement): void {
  const index = openRoots.indexOf(root)
  if (index >= 0) openRoots.splice(index, 1)
  if (openRoots.length === 0) {
    for (const element of inertedElements) element.removeAttribute('inert')
    inertedElements = []
  }
}

function node<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

export function nextDialogId(prefix: string): string {
  dialogSequence += 1
  return `${prefix}-${dialogSequence}`
}

/**
 * Readability baseline for legal/consent text (MB-073, 2026-11-20.1).
 *
 * Applied as inline styles on the rendered text nodes rather than only in
 * pet.css so the consent surface keeps a hard floor even if a stale/foreign
 * stylesheet is loaded: body >= 12px, headings >= 13px, meta >= 10px, and a
 * high-contrast body colour on the dark dialog. `--ui-scale` can only scale
 * UP from that floor (max()), never below it; when the variable is missing
 * the shipped 2x default reproduces the 12/13px floor exactly.
 */
export const LEGAL_BODY_FONT_SIZE = 'max(12px, calc(6px * var(--ui-scale, 2)))'
export const LEGAL_HEADING_FONT_SIZE = 'max(13px, calc(6.5px * var(--ui-scale, 2)))'
export const LEGAL_BODY_COLOR = '#dbe6f5'
export const LEGAL_HEADING_COLOR = '#cfe3ff'

/** Render structured legal sections; text only (never innerHTML for user data). */
export function renderLegalSections(
  doc: Document,
  container: HTMLElement,
  sections: readonly LegalSection[],
): void {
  container.replaceChildren()
  for (const section of sections) {
    const heading = node(doc, 'h3', 'consent-section-title', section.title)
    heading.style.fontSize = LEGAL_HEADING_FONT_SIZE
    heading.style.color = LEGAL_HEADING_COLOR
    container.append(heading)
    for (const paragraph of section.paragraphs ?? []) {
      const text = node(doc, 'p', 'consent-section-p', paragraph)
      text.style.fontSize = LEGAL_BODY_FONT_SIZE
      text.style.color = LEGAL_BODY_COLOR
      container.append(text)
    }
    if (section.bullets && section.bullets.length > 0) {
      const list = node(doc, 'ul', 'consent-section-list')
      for (const bullet of section.bullets) {
        const item = node(doc, 'li', undefined, bullet)
        item.style.fontSize = LEGAL_BODY_FONT_SIZE
        item.style.color = LEGAL_BODY_COLOR
        list.append(item)
      }
      container.append(list)
    }
    // h3 is deliberate: the modal outline stays predictable (h2 title -> h3 sections).
  }
}

interface ModalHandle {
  readonly root: HTMLElement
  readonly dialog: HTMLElement
  close(): void
}

interface ModalOptions {
  readonly className: string
  readonly labelledBy: string
  readonly describedBy?: string
  readonly onEscape: () => void
}

function createDialog(doc: Document, options: ModalOptions): ModalHandle {
  const previousFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
  const root = node(doc, 'div', `consent-root ${options.className}`)
  const backdrop = node(doc, 'div', 'consent-backdrop')
  backdrop.setAttribute('aria-hidden', 'true')
  const dialog = node(doc, 'section', 'consent-dialog')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', options.labelledBy)
  if (options.describedBy) dialog.setAttribute('aria-describedby', options.describedBy)
  dialog.tabIndex = -1
  root.append(backdrop, dialog)
  doc.body.append(root)
  lockBackground(doc, root)
  notifyConsentOverlay(doc, { open: true, kind: options.className })

  const focusables = (): HTMLElement[] =>
    Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('disabled') && !element.hidden,
    )

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      // Escape is NEVER consent: it closes/cancels the prompt.
      event.preventDefault()
      event.stopPropagation()
      options.onEscape()
      return
    }
    if (event.key !== 'Tab') return
    const items = focusables()
    if (items.length === 0) {
      event.preventDefault()
      dialog.focus()
      return
    }
    const current = items.indexOf(doc.activeElement as HTMLElement)
    const next = event.shiftKey
      ? current <= 0
        ? items.length - 1
        : current - 1
      : current < 0 || current >= items.length - 1
        ? 0
        : current + 1
    event.preventDefault()
    items[next]?.focus()
  }
  dialog.addEventListener('keydown', onKeyDown)
  backdrop.addEventListener('click', () => {
    // Reading/consent cannot be dismissed by a background click.
    dialog.focus()
  })

  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    dialog.removeEventListener('keydown', onKeyDown)
    unlockBackground(doc, root)
    root.remove()
    notifyConsentOverlay(doc, { open: false, kind: options.className })
    if (previousFocus && previousFocus.isConnected) {
      try {
        previousFocus.focus()
      } catch {
        /* focus restoration is best effort */
      }
    }
  }

  dialog.focus({ preventScroll: true })
  return { root, dialog, close }
}

function addMetaLine(doc: Document, parent: HTMLElement, label: string, value: string, mono = false): HTMLElement {
  const line = node(doc, 'p', 'consent-meta')
  line.append(node(doc, 'span', 'consent-meta-label', `${label}：`))
  line.append(node(doc, mono ? 'code' : 'span', mono ? 'consent-hash' : undefined, value))
  parent.append(line)
  return line
}

function reasonText(prompt: TosPrompt): string {
  if (prompt.reason === 'first-run') {
    return '首次使用：请先完整阅读以下《使用条款、免责声明与用户同意书》，并明确勾选同意后才能正常使用。'
  }
  if (prompt.reason === 'version-upgrade') {
    const from = prompt.previousTosVersion ? `${prompt.previousTosVersion} → ` : ''
    return `条款已更新（${from}${prompt.tosVersion}）：旧版本的同意不延续，必须重新完整阅读并明确同意。`
  }
  if (prompt.reason === 'reopen') return '重新阅读《使用条款、免责声明与用户同意书》。'
  return '本次修改/导入/接入 DLC 需要单独的完整同意；每次动作都会重新弹出完整声明，此前的同意不会永久豁免。'
}

const TOS_FOOTNOTE =
  '同意记录（时间/动作/版本/哈希）只用于审计，不构成对后续修改、DLC、TTS 的豁免。按 Escape、点击遮罩或关闭窗口都不视为同意。'

/**
 * Unified use-restriction notice shown as an independent red block in every
 * full-TOS prompt, ABOVE the scrollable terms and the consent checkbox. This is
 * UI copy only: it does not change the TOS text/version/hash (no re-consent
 * churn) and never substitutes for the checkbox + explicit accept activation.
 */
const USE_RESTRICTIONS_SHORT =
  '本项目及其全部代码、美术、音频、文案、角色素材和衍生物仅用于技术研究与原型验证，不得用于情感陪伴、虚拟伴侣、心理治疗/医疗/法律/金融建议、未成年人亲密关系、冒充真人/官方，或任何违反法律法规/平台规则的用途。'

/**
 * Full TOS + disclaimer prompt. Resolves `'accept'` ONLY after the checkbox is
 * checked and the accept button is activated; every other exit is `'decline'`.
 */
export function showTosDialog(doc: Document, prompt: TosPrompt): Promise<'accept' | 'decline'> {
  return new Promise((resolve) => {
    let settled = false
    let handle: ModalHandle | null = null
    const finish = (decision: 'accept' | 'decline'): void => {
      if (settled) return
      settled = true
      handle?.close()
      resolve(decision)
    }
    const ids = {
      title: nextDialogId('pet-tos-title'),
      desc: nextDialogId('pet-tos-desc'),
      checkbox: nextDialogId('pet-tos-checkbox'),
      tos: nextDialogId('pet-tos-text'),
    }
    handle = createDialog(doc, {
      className: 'consent-tos-modal',
      labelledBy: ids.title,
      describedBy: ids.desc,
      onEscape: () => finish('decline'),
    })
    const dialog = handle.dialog

    dialog.append(node(doc, 'p', 'consent-kicker', 'LEGAL · TERMS OF SERVICE / DISCLAIMER'))
    const title = node(doc, 'h2', 'consent-title', prompt.title)
    title.id = ids.title
    dialog.append(title)
    addMetaLine(doc, dialog, '版本', prompt.tosVersion)
    addMetaLine(doc, dialog, 'SHA-256', prompt.tosHash, true)

    const reason = node(doc, 'p', 'consent-reason', reasonText(prompt))
    reason.id = ids.desc
    dialog.append(reason)
    if (prompt.action || prompt.detail) {
      const detail = node(doc, 'p', 'consent-action')
      if (prompt.action) detail.append(node(doc, 'code', 'consent-action-id', prompt.action))
      if (prompt.detail) detail.append(node(doc, 'span', undefined, ` ${prompt.detail}`))
      dialog.append(detail)
    }
    if (prompt.storageWarning) dialog.append(node(doc, 'p', 'consent-storage-warning', prompt.storageWarning))

    // Independent red use-restriction block: visible before the terms scroll and
    // before the consent checkbox, in every full-TOS prompt (first-run, upgrade,
    // per-action DLC/import/TTS-adjacent prompts). Text only, no innerHTML.
    const useRestrictions = node(doc, 'div', 'consent-use-restrictions')
    useRestrictions.setAttribute('role', 'note')
    useRestrictions.setAttribute('aria-label', '使用限制（必读）')
    useRestrictions.style.border = '2px solid #a63d35'
    useRestrictions.style.background = '#fff6f5'
    useRestrictions.style.color = '#7a1f1a'
    useRestrictions.style.padding = '8px 10px'
    useRestrictions.style.margin = '10px 0'
    useRestrictions.style.borderRadius = '6px'
    useRestrictions.append(node(doc, 'strong', undefined, '使用限制（必读）：'))
    useRestrictions.append(node(doc, 'span', undefined, USE_RESTRICTIONS_SHORT))
    dialog.append(useRestrictions)

    // D6 / MB-073: a short, high-contrast, non-interactive key-facts layer is
    // rendered BEFORE the scrollable full text and BEFORE the checkbox, so a
    // reader sees the 5 essential facts without scrolling. It is a summary
    // only: the full TOS below stays mandatory, scrollable and unchanged in
    // consent semantics (explicit checkbox + button still required).
    const keyFacts = node(doc, 'section', 'consent-key-facts')
    keyFacts.setAttribute('role', 'note')
    keyFacts.setAttribute('aria-label', '关键事实（先读）；完整条款在下方滚动区')
    keyFacts.style.border = '1px solid #4d6f96'
    keyFacts.style.background = '#101c2a'
    keyFacts.style.padding = '8px 10px'
    keyFacts.style.margin = '8px 0'
    keyFacts.style.borderRadius = '8px'
    keyFacts.style.color = '#e6eef8'
    const keyFactsTitle = node(doc, 'h3', 'consent-key-facts-title', '关键事实（先读）')
    keyFactsTitle.style.margin = '0 0 4px'
    keyFactsTitle.style.fontSize = LEGAL_HEADING_FONT_SIZE
    keyFactsTitle.style.color = '#ffe2a8'
    keyFacts.append(keyFactsTitle)
    const keyFactsList = node(doc, 'ul', 'consent-key-facts-list')
    keyFactsList.style.margin = '0'
    keyFactsList.style.paddingLeft = '18px'
    for (const fact of TOS_KEY_FACTS) {
      const item = node(doc, 'li', 'consent-key-fact')
      item.style.fontSize = LEGAL_BODY_FONT_SIZE
      item.style.lineHeight = '1.45'
      item.style.color = '#e6eef8'
      const label = node(doc, 'strong', 'consent-key-fact-label', `${fact.label}：`)
      label.style.color = '#9fd0ff'
      item.append(label, node(doc, 'span', undefined, fact.text))
      keyFactsList.append(item)
    }
    keyFacts.append(keyFactsList)
    const keyFactsNote = node(doc, 'p', 'consent-key-facts-note', TOS_KEY_FACTS_NOTE)
    keyFactsNote.style.margin = '4px 0 0'
    keyFactsNote.style.fontSize = 'max(10px, calc(5px * var(--ui-scale, 2)))'
    keyFactsNote.style.color = '#b9c6da'
    keyFacts.append(keyFactsNote)
    dialog.append(keyFacts)

    const tos = node(doc, 'div', 'consent-tos')
    tos.id = ids.tos
    tos.tabIndex = 0
    tos.setAttribute('role', 'region')
    tos.setAttribute('aria-label', '完整使用条款、免责声明与用户同意书')
    renderLegalSections(doc, tos, prompt.sections)
    dialog.append(tos)

    const checkRow = node(doc, 'label', 'consent-check')
    checkRow.htmlFor = ids.checkbox
    const checkbox = node(doc, 'input')
    checkbox.type = 'checkbox'
    checkbox.id = ids.checkbox
    checkRow.append(checkbox, node(doc, 'span', undefined, TOS_CHECKBOX_LABEL))
    dialog.append(checkRow)

    const actions = node(doc, 'div', 'consent-actions')
    const decline = node(doc, 'button', 'consent-decline', TOS_DECLINE_LABEL)
    decline.type = 'button'
    const accept = node(doc, 'button', 'consent-accept', TOS_ACCEPT_LABEL)
    accept.type = 'button'
    accept.disabled = true
    actions.append(decline, accept)
    dialog.append(actions)
    dialog.append(node(doc, 'p', 'consent-foot', TOS_FOOTNOTE))

    checkbox.addEventListener('change', () => {
      accept.disabled = !checkbox.checked
    })
    accept.addEventListener('click', () => {
      if (!checkbox.checked) return
      finish('accept')
    })
    decline.addEventListener('click', () => finish('decline'))
    // Focus the scrollable text first: keyboard users can read/scroll, then Tab
    // to the checkbox and buttons (focus trap keeps them inside the dialog).
    tos.focus({ preventScroll: true })
  })
}


/**
 * First-run / correction age verification dialog (self-reported birth date).
 *
 * No prefill and no default: all three selects start at their placeholder and
 * the confirm button stays disabled until a real, valid date is chosen AND the
 * explicit self-report checkbox is ticked. Escape/decline resolves
 * `{ verified: false }` so the gate enters safe read-only mode (never a silent
 * skip). Everything is keyboard operable and rendered as text nodes only.
 */
export function showAgeDialog(doc: Document, prompt: AgePrompt): Promise<AgeDecision> {
  return new Promise((resolve) => {
    let settled = false
    let handle: ModalHandle | null = null
    const finish = (decision: AgeDecision): void => {
      if (settled) return
      settled = true
      handle?.close()
      resolve(decision)
    }
    const ids = {
      title: nextDialogId('pet-age-title'),
      desc: nextDialogId('pet-age-desc'),
      hint: nextDialogId('pet-age-hint'),
      error: nextDialogId('pet-age-error'),
    }
    handle = createDialog(doc, {
      className: 'consent-age-modal',
      labelledBy: ids.title,
      describedBy: ids.desc,
      onEscape: () => finish({ verified: false }),
    })
    const dialog = handle.dialog

    dialog.append(node(doc, 'p', 'consent-kicker', 'AGE · 年龄核验（自报出生日期，非官方身份证核验；仅用于 18+ 功能）'))
    const title = node(doc, 'h2', 'consent-title', prompt.title)
    title.id = ids.title
    dialog.append(title)
    addMetaLine(doc, dialog, '性质', '自报出生日期；不是身份证核验、不是实名认证')
    addMetaLine(doc, dialog, '今天', prompt.todayLabel)

    const desc = node(
      doc,
      'p',
      'consent-reason',
      prompt.reason === 'correct'
        ? '更正年龄：请重新选择你的出生年/月/日并显式确认；更正会重新核验并清除当前角色扮演会话。旧记录不会预填。'
        : '你正在进入或主动完成 age-gated 年龄核验（角色扮演/情感陪伴，仅限 18+）：由你本人选择出生年/月/日并显式确认，不预填、无默认值。取消只阻止本次进入 18+ 功能，一般功能仍可用；首次启动与一般功能不采集出生日期。',
    )
    desc.id = ids.desc
    dialog.append(desc)

    for (const line of [prompt.roleplayPolicy, prompt.selfReportNotice, prompt.dataNotice, prompt.minorsNote, prompt.declineNotice]) {
      const note = node(doc, 'p', 'consent-age-note', line)
      note.style.fontSize = LEGAL_BODY_FONT_SIZE
      note.style.color = LEGAL_BODY_COLOR
      dialog.append(note)
    }

    const formRoot = node(doc, 'fieldset', 'consent-age-form')
    formRoot.append(node(doc, 'legend', 'consent-roleplay-legend', '出生日期（必须由你本人选择；不预填、无默认）'))
    const hint = node(doc, 'p', 'consent-field-hint', '请选择公历出生年/月/日；例如 1990 年 1 月 1 日。出生日期仅保存在本机，不写日志、不上传。')
    hint.id = ids.hint
    formRoot.append(hint)

    const field = (labelText: string, control: HTMLElement): HTMLElement => {
      const row = node(doc, 'label', 'consent-field')
      row.append(node(doc, 'span', 'consent-field-label', labelText))
      row.append(control)
      return row
    }
    const makeSelect = (id: string, placeholder: string): HTMLSelectElement => {
      const select = node(doc, 'select', 'consent-field-select')
      select.id = id
      select.setAttribute('aria-describedby', ids.error)
      const empty = node(doc, 'option', undefined, placeholder)
      empty.value = ''
      select.append(empty)
      select.value = ''
      return select
    }

    const yearSelect = makeSelect(nextDialogId('pet-age-year'), '请选择出生年')
    for (let year = prompt.minYear; year <= prompt.maxYear; year += 1) {
      const option = node(doc, 'option', undefined, `${year} 年`)
      option.value = String(year)
      yearSelect.append(option)
    }
    const monthSelect = makeSelect(nextDialogId('pet-age-month'), '请选择出生月')
    for (let month = 1; month <= 12; month += 1) {
      const option = node(doc, 'option', undefined, `${month} 月`)
      option.value = String(month)
      monthSelect.append(option)
    }
    const daySelect = makeSelect(nextDialogId('pet-age-day'), '请选择出生日')

    formRoot.append(field('出生年份（必选）', yearSelect))
    formRoot.append(field('出生月份（必选）', monthSelect))
    formRoot.append(field('出生日（必选）', daySelect))

    /** Rebuild the day list for the selected year/month (placeholder preserved). */
    const rebuildDays = (): void => {
      const year = Number(yearSelect.value)
      const month = Number(monthSelect.value)
      const maxDay = Number.isInteger(year) && year > 0 && Number.isInteger(month) && month > 0 ? daysInMonth(year, month) : 31
      const previous = daySelect.value
      while (daySelect.options.length > 1) daySelect.remove(1)
      for (let day = 1; day <= Math.max(1, maxDay); day += 1) {
        const option = node(doc, 'option', undefined, `${day} 日`)
        option.value = String(day)
        daySelect.append(option)
      }
      if (previous !== '' && Number(previous) <= maxDay) daySelect.value = previous
      else daySelect.value = ''
    }
    rebuildDays()

    const error = node(doc, 'p', 'consent-age-error', '')
    error.id = ids.error
    error.setAttribute('role', 'status')
    error.setAttribute('aria-live', 'polite')
    dialog.append(formRoot)
    dialog.append(error)

    const checkRow = node(doc, 'label', 'consent-check')
    const confirmCheck = node(doc, 'input')
    confirmCheck.type = 'checkbox'
    confirmCheck.id = nextDialogId('pet-age-confirm')
    confirmCheck.checked = false
    checkRow.htmlFor = confirmCheck.id
    checkRow.append(
      confirmCheck,
      node(
        doc,
        'span',
        undefined,
        '我确认以上出生日期由我本人如实填写；我知道这是自报核验，不是官方身份证/实名认证，虚假填写由我自行承担后果。',
      ),
    )
    dialog.append(checkRow)

    const actions = node(doc, 'div', 'consent-actions')
    const decline = node(doc, 'button', 'consent-decline', '取消（不进入年龄受限功能）')
    decline.type = 'button'
    const accept = node(doc, 'button', 'consent-accept', prompt.reason === 'correct' ? '确认更正并重新核验' : '确认出生日期并继续')
    accept.type = 'button'
    accept.disabled = true
    actions.append(decline, accept)
    dialog.append(actions)
    dialog.append(
      node(
        doc,
        'p',
        'consent-foot',
        '按 Escape、点“取消”或关闭窗口都不会保存出生日期，只会阻止本次进入 18+ 功能；一般功能全年龄可用，角色扮演仅限 18+。可重试或在 About 主动核验/更正。',
      ),
    )

    const collect = (): { year: number | null; month: number | null; day: number | null } => ({
      year: yearSelect.value === '' ? null : Number(yearSelect.value),
      month: monthSelect.value === '' ? null : Number(monthSelect.value),
      day: daySelect.value === '' ? null : Number(daySelect.value),
    })

    let hinted = false
    const refresh = (): void => {
      const values = collect()
      const validation = validateBirthDate(values, new Date())
      let message = ''
      if (!validation.ok) {
        const first: BirthDateError = validation.errors[0] ?? 'year-missing'
        message = BIRTH_DATE_ERROR_MESSAGES[first]
      }
      if (hinted || message === '') {
        error.textContent = message
      }
      accept.disabled = !validation.ok || !confirmCheck.checked
      return
    }

    yearSelect.addEventListener('change', () => {
      hinted = true
      rebuildDays()
      refresh()
    })
    monthSelect.addEventListener('change', () => {
      hinted = true
      rebuildDays()
      refresh()
    })
    daySelect.addEventListener('change', () => {
      hinted = true
      refresh()
    })
    confirmCheck.addEventListener('change', () => {
      hinted = true
      refresh()
    })
    accept.addEventListener('click', () => {
      hinted = true
      const values = collect()
      const validation = validateBirthDate(values, new Date())
      if (!validation.ok || !confirmCheck.checked) {
        refresh()
        return
      }
      finish({ verified: true, year: validation.year, month: validation.month, day: validation.day })
    })
    decline.addEventListener('click', () => finish({ verified: false }))
    yearSelect.focus({ preventScroll: true })
  })
}

/** Read-only viewer for About; never accepts/declines anything. */
export function showTosViewer(
  doc: Document,
  view: { title: string; version: string; hash: string; sections: readonly LegalSection[] },
): { close(): void } {
  const ids = { title: nextDialogId('pet-tos-view-title'), desc: nextDialogId('pet-tos-view-desc') }
  let handleClose: () => void = () => {}
  const handle = createDialog(doc, {
    className: 'consent-tos-viewer',
    labelledBy: ids.title,
    describedBy: ids.desc,
    onEscape: () => handleClose(),
  })
  const dialog = handle.dialog
  dialog.append(node(doc, 'p', 'consent-kicker', 'LEGAL · FULL TOS (READ ONLY)'))
  const title = node(doc, 'h2', 'consent-title', view.title)
  title.id = ids.title
  dialog.append(title)
  addMetaLine(doc, dialog, '版本', view.version)
  addMetaLine(doc, dialog, 'SHA-256', view.hash, true)
  const desc = node(doc, 'p', 'consent-reason', '只读查看：此视图不会记录同意，也不会改变当前状态。')
  desc.id = ids.desc
  dialog.append(desc)
  const tos = node(doc, 'div', 'consent-tos')
  tos.tabIndex = 0
  tos.setAttribute('role', 'region')
  tos.setAttribute('aria-label', '完整使用条款、免责声明与用户同意书')
  renderLegalSections(doc, tos, view.sections)
  dialog.append(tos)
  const actions = node(doc, 'div', 'consent-actions')
  const close = node(doc, 'button', 'consent-accept', '关闭')
  close.type = 'button'
  actions.append(close)
  dialog.append(actions)
  handleClose = (): void => handle.close()
  close.addEventListener('click', handleClose)
  tos.focus({ preventScroll: true })
  return { close: handleClose }
}

/**
 * Separate TTS declaration prompt. Resolves true only after checkbox + explicit
 * confirm; Escape/cancel resolve false. Not satisfied by TOS consent.
 */
export function showTtsDialog(doc: Document, prompt: TtsPrompt): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let handle: ModalHandle | null = null
    const finish = (accepted: boolean): void => {
      if (settled) return
      settled = true
      handle?.close()
      resolve(accepted)
    }
    const ids = {
      title: nextDialogId('pet-tts-title'),
      desc: nextDialogId('pet-tts-desc'),
      checkbox: nextDialogId('pet-tts-checkbox'),
    }
    handle = createDialog(doc, {
      className: 'consent-tts-modal',
      labelledBy: ids.title,
      describedBy: ids.desc,
      onEscape: () => finish(false),
    })
    const dialog = handle.dialog
    dialog.append(node(doc, 'p', 'consent-kicker', 'TTS · AI 合成语音声明（单独确认）'))
    const title = node(doc, 'h2', 'consent-title', prompt.title)
    title.id = ids.title
    dialog.append(title)
    addMetaLine(doc, dialog, '版本', prompt.ttsVersion)
    addMetaLine(doc, dialog, 'SHA-256', prompt.ttsHash, true)
    const reason =
      prompt.reason === 'tts-change'
        ? 'TTS 配置已变更：需要重新阅读并单独确认以下声明（不沿用旧确认）。'
        : prompt.reason === 'tts-confirm'
          ? '这是 TTS/AI 合成语音的单独声明；确认后才启用语音。'
          : '你即将启用/播放 AI 合成语音：请先单独阅读并确认以下声明。'
    const desc = node(doc, 'p', 'consent-reason', reason)
    desc.id = ids.desc
    dialog.append(desc)
    const tts = node(doc, 'div', 'consent-tos')
    tts.tabIndex = 0
    tts.setAttribute('role', 'region')
    tts.setAttribute('aria-label', '完整 TTS/AI 合成语音声明')
    renderLegalSections(doc, tts, prompt.sections)
    dialog.append(tts)

    const checkRow = node(doc, 'label', 'consent-check')
    const checkbox = node(doc, 'input')
    checkbox.type = 'checkbox'
    checkbox.id = ids.checkbox
    checkRow.htmlFor = ids.checkbox
    checkRow.append(checkbox, node(doc, 'span', undefined, TTS_CHECKBOX_LABEL))
    dialog.append(checkRow)

    const actions = node(doc, 'div', 'consent-actions')
    const decline = node(doc, 'button', 'consent-decline', TTS_DECLINE_LABEL)
    decline.type = 'button'
    const accept = node(doc, 'button', 'consent-accept', TTS_ACCEPT_LABEL)
    accept.type = 'button'
    accept.disabled = true
    actions.append(decline, accept)
    dialog.append(actions)
    dialog.append(
      node(
        doc,
        'p',
        'consent-foot',
        '本确认仅对本次会话与当前语音配置有效；配置变更或新会话会重新确认。TOS 不能替代本声明，本声明也不能替代 TOS。按 Escape/取消不视为确认。',
      ),
    )
    checkbox.addEventListener('change', () => {
      accept.disabled = !checkbox.checked
    })
    accept.addEventListener('click', () => {
      if (!checkbox.checked) return
      finish(true)
    })
    decline.addEventListener('click', () => finish(false))
    tts.focus({ preventScroll: true })
  })
}

/**
 * Separate ASR declaration prompt (microphone upload).
 *
 * Deliberately its own dialog/class/copy: it is NOT a re-labelled TTS prompt and
 * its checkbox never says "TTS". Resolves true only after checkbox + explicit
 * confirm; Escape/cancel resolve false. A false result must keep the microphone
 * closed (no `getUserMedia`, no upload); TOS and TTS consents never satisfy it.
 */
export function showAsrDialog(doc: Document, prompt: AsrPrompt): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let handle: ModalHandle | null = null
    const finish = (accepted: boolean): void => {
      if (settled) return
      settled = true
      handle?.close()
      resolve(accepted)
    }
    const ids = {
      title: nextDialogId('pet-asr-title'),
      desc: nextDialogId('pet-asr-desc'),
      checkbox: nextDialogId('pet-asr-checkbox'),
    }
    handle = createDialog(doc, {
      className: 'consent-asr-modal',
      labelledBy: ids.title,
      describedBy: ids.desc,
      onEscape: () => finish(false),
    })
    const dialog = handle.dialog
    dialog.append(node(doc, 'p', 'consent-kicker', 'ASR · 语音识别单独确认（麦克风录音会上传）'))
    const title = node(doc, 'h2', 'consent-title', prompt.title)
    title.id = ids.title
    dialog.append(title)
    addMetaLine(doc, dialog, '版本', prompt.asrVersion)
    addMetaLine(doc, dialog, 'SHA-256', prompt.asrHash, true)
    const reason =
      prompt.reason === 'asr-change'
        ? 'ASR 配置已变更：需要重新阅读并单独确认以下声明（不沿用旧确认）。'
        : prompt.reason === 'asr-confirm'
          ? '这是 ASR/语音识别的单独声明；确认后才允许获取麦克风并上传音频。'
          : '你即将使用语音识别：录音会上传至 DeepSeek API，请先单独阅读并确认以下声明。'
    const desc = node(doc, 'p', 'consent-reason', reason)
    desc.id = ids.desc
    dialog.append(desc)
    const asr = node(doc, 'div', 'consent-tos')
    asr.tabIndex = 0
    asr.setAttribute('role', 'region')
    asr.setAttribute('aria-label', '完整 ASR/语音识别声明')
    renderLegalSections(doc, asr, prompt.sections)
    dialog.append(asr)

    const checkRow = node(doc, 'label', 'consent-check')
    const checkbox = node(doc, 'input')
    checkbox.type = 'checkbox'
    checkbox.id = ids.checkbox
    checkRow.htmlFor = ids.checkbox
    checkRow.append(checkbox, node(doc, 'span', undefined, ASR_CHECKBOX_LABEL))
    dialog.append(checkRow)

    const actions = node(doc, 'div', 'consent-actions')
    const decline = node(doc, 'button', 'consent-decline', ASR_DECLINE_LABEL)
    decline.type = 'button'
    const accept = node(doc, 'button', 'consent-accept', ASR_ACCEPT_LABEL)
    accept.type = 'button'
    accept.disabled = true
    actions.append(decline, accept)
    dialog.append(actions)
    dialog.append(
      node(
        doc,
        'p',
        'consent-foot',
        '本确认仅对本次会话与当前 ASR 配置有效；配置变更或新会话会重新确认。TOS 不能替代本声明，TTS 确认也不能替代本声明。取消后不会获取麦克风、不会上传音频；按 Escape/取消不视为确认。',
      ),
    )
    checkbox.addEventListener('change', () => {
      accept.disabled = !checkbox.checked
    })
    accept.addEventListener('click', () => {
      if (!checkbox.checked) return
      finish(true)
    })
    decline.addEventListener('click', () => finish(false))
    asr.focus({ preventScroll: true })
  })
}

/**
 * Separate roleplay declaration + MANDATORY settings form (all-ages policy).
 *
 * - renders the full roleplay declaration (its own version/hash) and the
 *   truthful capability note: this build only has a local template, NOT a free
 *   LLM chat engine (never fake one);
 * - the form is deliberately EMPTY: no scene/relationship/tone is selected, the
 *   address input is blank and every confirmation checkbox starts unchecked —
 *   no sensitive relation or adult content is ever pre-filled;
 * - the accept button stays disabled until the user actively picks all fields,
 *   types an ordinary non-intimate address and ticks every confirmation;
 * - Escape/cancel resolve `{accepted:false}` (never consent) and start nothing.
 */
export function showRoleplayDialog(doc: Document, prompt: RoleplayPrompt): Promise<RoleplayDecision> {
  return new Promise((resolve) => {
    let settled = false
    let handle: ModalHandle | null = null
    const finish = (decision: RoleplayDecision): void => {
      if (settled) return
      settled = true
      handle?.close()
      resolve(decision)
    }
    const ids = {
      title: nextDialogId('pet-roleplay-title'),
      desc: nextDialogId('pet-roleplay-desc'),
      form: nextDialogId('pet-roleplay-form'),
    }
    handle = createDialog(doc, {
      className: 'consent-roleplay-modal',
      labelledBy: ids.title,
      describedBy: ids.desc,
      onEscape: () => finish({ accepted: false }),
    })
    const dialog = handle.dialog
    dialog.append(node(doc, 'p', 'consent-kicker', 'ROLEPLAY · 全年龄角色扮演声明与设定（单独确认）'))
    const title = node(doc, 'h2', 'consent-title', prompt.title)
    title.id = ids.title
    dialog.append(title)
    addMetaLine(doc, dialog, '版本', prompt.roleplayVersion)
    addMetaLine(doc, dialog, 'SHA-256', prompt.roleplayHash, true)

    const reasonTextValue =
      prompt.reason === 'roleplay-change'
        ? '角色扮演设定已变更：必须重新阅读完整 TOS 与本声明，并重新填写、逐项确认以下设定；旧确认不延续。'
        : prompt.reason === 'roleplay-confirm'
          ? '这是角色扮演的单独声明与设定确认；TOS/TTS/ASR 的同意都不能替代它。'
          : '开始角色扮演前：必须完整阅读 TOS 与以下单独声明，并由你亲自填写、逐项确认设定；此前的同意不构成豁免。'
    const desc = node(doc, 'p', 'consent-reason', reasonTextValue)
    desc.id = ids.desc
    dialog.append(desc)

    const capability = node(doc, 'p', 'consent-capability-note', prompt.capabilityNote || ROLEPLAY_CAPABILITY_NOTE)
    dialog.append(capability)

    const rp = node(doc, 'div', 'consent-tos')
    rp.tabIndex = 0
    rp.setAttribute('role', 'region')
    rp.setAttribute('aria-label', '完整角色扮演声明')
    renderLegalSections(doc, rp, prompt.sections)
    dialog.append(rp)

    const formRoot = node(doc, 'fieldset', 'consent-roleplay-form')
    formRoot.id = ids.form
    formRoot.append(node(doc, 'legend', 'consent-roleplay-legend', '角色扮演设定（必须由你填写/确认；不会预填）'))
    formRoot.append(
      node(
        doc,
        'p',
        'consent-field-hint',
        '以下设定不会预填任何敏感关系或成人内容；场景/关系边界/语气为全年龄固定选项，称呼由你填写普通非亲密称呼。',
      ),
    )

    const field = (labelText: string, control: HTMLElement, hint?: string): HTMLElement => {
      const row = node(doc, 'label', 'consent-field')
      row.append(node(doc, 'span', 'consent-field-label', labelText))
      row.append(control)
      if (hint) row.append(node(doc, 'span', 'consent-field-hint', hint))
      return row
    }
    const selectFrom = (id: string, labelText: string, options: readonly RoleplayOption[]): HTMLSelectElement => {
      const select = node(doc, 'select', 'consent-field-select')
      select.id = id
      const placeholder = node(doc, 'option', undefined, '请选择')
      placeholder.value = ''
      select.append(placeholder)
      for (const option of options) {
        const item = node(doc, 'option', undefined, option.label)
        item.value = option.id
        select.append(item)
      }
      select.value = ''
      return select
    }

    const scene = selectFrom(nextDialogId('pet-roleplay-scene'), '场景', ROLEPLAY_SCENES)
    const relationship = selectFrom(nextDialogId('pet-roleplay-relationship'), '关系边界', ROLEPLAY_RELATIONSHIPS)
    const tone = selectFrom(nextDialogId('pet-roleplay-tone'), '语气', ROLEPLAY_TONES)
    formRoot.append(field('场景（从全年龄列表选择）', scene))
    formRoot.append(field('关系边界（公开、非亲密）', relationship))
    formRoot.append(field('语气', tone))

    const address = node(doc, 'input', 'consent-field-input')
    address.type = 'text'
    address.id = nextDialogId('pet-roleplay-address')
    address.maxLength = ROLEPLAY_ADDRESS_MAX_CHARS
    address.value = ''
    address.autocomplete = 'off'
    address.placeholder = `普通称呼，最多 ${ROLEPLAY_ADDRESS_MAX_CHARS} 字`
    formRoot.append(field('称呼（由你填写，普通、非亲密）', address))

    const ack = (
      label: string,
      control: HTMLInputElement,
    ): HTMLElement => {
      const row = node(doc, 'label', 'consent-check')
      row.htmlFor = control.id
      row.append(control, node(doc, 'span', undefined, label))
      return row
    }
    const makeAck = (idPrefix: string): HTMLInputElement => {
      const input = node(doc, 'input')
      input.type = 'checkbox'
      input.id = nextDialogId(idPrefix)
      input.checked = false
      return input
    }
    const prohibitions = makeAck('pet-roleplay-ack-prohibitions')
    const allAges = makeAck('pet-roleplay-ack-allages')
    const ai = makeAck('pet-roleplay-ack-ai')
    const health = makeAck('pet-roleplay-ack-health')
    const read = makeAck('pet-roleplay-ack-read')
    formRoot.append(field('禁止项确认（必须逐项确认）', prohibitions, '我确认本设定不含成人性内容、虚拟亲密关系、未成年人性化、自伤他伤、违法、诈骗或冒充。'))
    formRoot.append(field('全年龄内容确认', allAges, '我确认角色扮演内容保持全年龄适宜，不含成人或亲密内容。'))
    formRoot.append(field('AI / 非真人确认', ai, '我理解这是 AI/本地模板呈现的角色扮演，不是真人，也不是真实关系。'))
    formRoot.append(field('健康 / 退出确认', health, '我了解可随时结束角色扮演，连续使用每 2 小时应休息；出现危机信号会联系真人/紧急服务（110/120、12356）。'))
    formRoot.append(ack(ROLEPLAY_CHECKBOX_LABEL, read))
    dialog.append(formRoot)

    const actions = node(doc, 'div', 'consent-actions')
    const decline = node(doc, 'button', 'consent-decline', ROLEPLAY_DECLINE_LABEL)
    decline.type = 'button'
    const accept = node(doc, 'button', 'consent-accept', prompt.reason === 'roleplay-change' ? ROLEPLAY_CHANGE_ACCEPT_LABEL : ROLEPLAY_ACCEPT_LABEL)
    accept.type = 'button'
    accept.disabled = true
    actions.append(decline, accept)
    dialog.append(actions)
    dialog.append(
      node(
        doc,
        'p',
        'consent-foot',
        '本确认仅对本次会话与当前设定有效；每次开始/变更都会重新展示完整 TOS+本声明并要求重新填写。TOS/TTS/ASR 确认不能替代本声明；本声明也不能替代 TTS/ASR 或 TOS。按 Escape/取消不视为确认。',
      ),
    )

    /** Build the settings from current form state; validation is the same used by the gate. */
    const collect = (): { accepted: false } | { accepted: true; settings: RoleplaySettings } => {
      const settings: RoleplaySettings = {
        ...createEmptyRoleplaySettings(),
        scene: scene.value,
        relationship: relationship.value,
        tone: tone.value,
        address: address.value,
        prohibitionsAck: prohibitions.checked,
        allAgesAck: allAges.checked,
        aiAck: ai.checked,
        healthAck: health.checked,
      }
      const validation = validateRoleplaySettings(settings)
      if (!validation.ok || !read.checked) return { accepted: false }
      return { accepted: true, settings: validation.settings }
    }
    const refresh = (): void => {
      accept.disabled = !collect().accepted
    }
    for (const control of [scene, relationship, tone, address, prohibitions, allAges, ai, health, read]) {
      control.addEventListener('change', refresh)
    }
    address.addEventListener('input', refresh)
    accept.addEventListener('click', () => {
      const result = collect()
      if (!result.accepted) return
      finish(result)
    })
    decline.addEventListener('click', () => finish({ accepted: false }))
    scene.focus({ preventScroll: true })
  })
}

export interface BlockedOverlay {
  hide(): void
}

/**
 * Persistent safe-read-only screen shown after a declined first-run TOS.
 * Escape cannot dismiss it; only a fresh consent (through the full TOS modal)
 * or an explicit exit can leave it.
 */
export function showBlockedOverlay(
  doc: Document,
  options: { view: BlockedView; onRetry: () => void; onExit: () => void; onViewTos?: () => void },
): BlockedOverlay {
  const ids = { title: nextDialogId('pet-consent-blocked-title'), desc: nextDialogId('pet-consent-blocked-desc') }
  const root = node(doc, 'div', 'consent-root consent-blocked')
  const backdrop = node(doc, 'div', 'consent-backdrop')
  backdrop.setAttribute('aria-hidden', 'true')
  const dialog = node(doc, 'section', 'consent-dialog consent-blocked-dialog')
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-labelledby', ids.title)
  dialog.setAttribute('aria-describedby', ids.desc)
  dialog.tabIndex = -1
  root.append(backdrop, dialog)
  doc.body.append(root)
  // Same body-level inert coverage as the TOS dialogs: the blocked/read-only
  // screen is a modal too, so the shell menu and page chrome behind it are
  // inerted and released only when the last consent root closes.
  lockBackground(doc, root)
  notifyConsentOverlay(doc, { open: true, kind: 'consent-blocked' })

  dialog.append(node(doc, 'p', 'consent-kicker', 'SAFE READ-ONLY MODE'))
  const title = node(doc, 'h2', 'consent-title', options.view.title)
  title.id = ids.title
  dialog.append(title)
  const desc = node(doc, 'p', 'consent-reason', options.view.detail)
  desc.id = ids.desc
  dialog.append(desc)
  const list = node(doc, 'ul', 'consent-blocked-list')
  for (const line of [
    '不会加载或写入 DLC/角色包/导入内容；',
    '不会播放 AI 合成语音；',
    '不会保存新的记忆/存档。',
  ]) {
    list.append(node(doc, 'li', undefined, line))
  }
  dialog.append(list)
  const actions = node(doc, 'div', 'consent-actions')
  // Read-only view retry re-runs the TOS gate (never a silent skip into normal
  // interaction). Under D6 an age decline no longer reaches this screen at all:
  // it only blocks the age-gated entry while the rest of the app keeps working.
  const retry = node(doc, 'button', 'consent-accept', '重新阅读并同意')
  retry.type = 'button'
  const exit = node(doc, 'button', 'consent-decline', '退出应用')
  exit.type = 'button'
  actions.append(retry, exit)
  if (options.onViewTos) {
    const viewTos = node(doc, 'button', 'consent-secondary', '只读查看完整 TOS')
    viewTos.type = 'button'
    viewTos.addEventListener('click', () => options.onViewTos?.())
    actions.append(viewTos)
  }
  dialog.append(actions)
  retry.addEventListener('click', () => options.onRetry())
  exit.addEventListener('click', () => options.onExit())

  // The read-only screen is a modal too: trap Tab inside it and swallow Escape
  // (Escape must not dismiss/acknowledge anything; only retry/exit/view remain).
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.key !== 'Tab') return
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('disabled') && !element.hidden,
    )
    if (items.length === 0) return
    const current = items.indexOf(doc.activeElement as HTMLElement)
    const next = event.shiftKey
      ? current <= 0
        ? items.length - 1
        : current - 1
      : current < 0 || current >= items.length - 1
        ? 0
        : current + 1
    event.preventDefault()
    items[next]?.focus()
  })
  dialog.focus({ preventScroll: true })

  let hidden = false
  const hide = (): void => {
    if (hidden) return
    hidden = true
    unlockBackground(doc, root)
    root.remove()
    notifyConsentOverlay(doc, { open: false, kind: 'consent-blocked' })
  }
  return { hide }
}

/**
 * Non-blocking 2h health reminder banner (never traps focus, never permanently
 * dismissible). Q-03: role/aria-live must not contradict each other, the two
 * buttons are "休息一下（2 小时后仍会提醒）" and "10 分钟后再提醒", and About
 * stays available as a third, optional entry.
 */
export function showHealthBanner(
  doc: Document,
  options: { text: string; onRest: () => void; onDefer: () => void; onAbout?: () => void },
): { hide(): void } {
  const root = node(doc, 'aside', 'consent-health-banner')
  // Single semantic choice: status + polite (not role=alert + aria-live=polite,
  // which used to ask screen readers for both assertive and polite behaviour).
  root.setAttribute('role', 'status')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('aria-atomic', 'true')
  const title = node(doc, 'strong', undefined, '健康使用提醒 · 已连续使用约 2 小时')
  const text = node(doc, 'p', undefined, options.text)
  const actions = node(doc, 'div', 'consent-health-actions')
  const rest = node(doc, 'button', 'consent-accept', HEALTH_REST_LABEL)
  rest.type = 'button'
  const defer = node(doc, 'button', 'consent-secondary', HEALTH_DEFER_LABEL)
  defer.type = 'button'
  actions.append(rest, defer)
  if (options.onAbout) {
    const about = node(doc, 'button', 'consent-secondary', '健康使用与求助…')
    about.type = 'button'
    about.addEventListener('click', () => {
      hide()
      options.onAbout?.()
    })
    actions.append(about)
  }
  root.append(title, text, actions)
  doc.body.append(root)
  const hide = (): void => root.remove()
  rest.addEventListener('click', () => {
    hide()
    options.onRest()
  })
  defer.addEventListener('click', () => {
    hide()
    options.onDefer()
  })
  return { hide }
}

// ---------------------------------------------------------------------------
// User data controls (withdraw / delete-all) dialogs
// ---------------------------------------------------------------------------

export interface DataControlConfirmView {
  readonly kicker?: string
  readonly title: string
  readonly intro?: string
  readonly bullets?: readonly string[]
  readonly checkboxLabel?: string
  readonly confirmLabel: string
  readonly cancelLabel?: string
  readonly footnote?: string
  /** Style-only: never auto-checks the checkbox or hides the cancel button. */
  readonly danger?: boolean
}

/**
 * Accessible two-step confirmation dialog for destructive/privacy actions.
 * - explicit checkbox (unchecked by default) gates the confirm button;
 * - Escape and Cancel both resolve `false` (never consent);
 * - focus is trapped by `createDialog`, the background is inert, and the
 *   overlay event closes/inerts the body-level desktop-shell menu.
 */
export function showDataControlConfirmDialog(doc: Document, view: DataControlConfirmView): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    let handle: ModalHandle | null = null
    const finish = (confirmed: boolean): void => {
      if (settled) return
      settled = true
      handle?.close()
      resolve(confirmed)
    }
    const ids = { title: nextDialogId('pet-data-title'), desc: nextDialogId('pet-data-desc') }
    handle = createDialog(doc, {
      className: 'consent-data-confirm',
      labelledBy: ids.title,
      describedBy: ids.desc,
      onEscape: () => finish(false),
    })
    const dialog = handle.dialog
    dialog.append(node(doc, 'p', 'consent-kicker', view.kicker ?? 'DATA CONTROL'))
    const title = node(doc, 'h2', 'consent-title', view.title)
    title.id = ids.title
    dialog.append(title)
    if (view.intro) {
      const desc = node(doc, 'p', 'consent-reason', view.intro)
      desc.id = ids.desc
      dialog.append(desc)
    }
    if (view.bullets && view.bullets.length > 0) {
      const list = node(doc, 'ul', 'consent-data-list')
      for (const line of view.bullets) list.append(node(doc, 'li', undefined, line))
      dialog.append(list)
    }

    let checkbox: HTMLInputElement | null = null
    if (view.checkboxLabel) {
      const checkboxId = nextDialogId('pet-data-checkbox')
      const row = node(doc, 'label', 'consent-check')
      row.htmlFor = checkboxId
      const input = node(doc, 'input')
      input.type = 'checkbox'
      input.id = checkboxId
      row.append(input, node(doc, 'span', undefined, view.checkboxLabel))
      dialog.append(row)
      checkbox = input
    }

    const actions = node(doc, 'div', 'consent-actions')
    const cancel = node(doc, 'button', 'consent-decline', view.cancelLabel ?? '取消')
    cancel.type = 'button'
    const confirm = node(doc, 'button', view.danger ? 'consent-accept consent-danger' : 'consent-accept', view.confirmLabel)
    confirm.type = 'button'
    confirm.disabled = checkbox !== null
    actions.append(cancel, confirm)
    dialog.append(actions)
    if (view.footnote) dialog.append(node(doc, 'p', 'consent-foot', view.footnote))

    checkbox?.addEventListener('change', () => {
      confirm.disabled = !checkbox!.checked
    })
    confirm.addEventListener('click', () => {
      if (checkbox && !checkbox.checked) return
      finish(true)
    })
    cancel.addEventListener('click', () => finish(false))
    if (checkbox) checkbox.focus({ preventScroll: false })
  })
}

export type DataControlResultStatus = 'deleted' | 'residual' | 'unverified' | 'excluded'

const DATA_RESULT_STATUS_LABEL: Record<DataControlResultStatus, string> = {
  deleted: '已删除并核验',
  residual: '残留（未删除）',
  unverified: '未核验',
  excluded: '未删除（按设计/需手动）',
}

export interface DataControlResultItem {
  readonly label: string
  readonly status: DataControlResultStatus
  readonly detail?: string
}

export interface DataControlResultView {
  readonly kicker?: string
  readonly title: string
  readonly intro?: string
  readonly lines?: readonly string[]
  readonly items?: readonly DataControlResultItem[]
  readonly footnote?: string
  readonly closeLabel?: string
}

/**
 * Result dialog for withdrawal/delete/clear/export outcomes. It renders exactly
 * what happened (deleted / residual / unverified / intentionally kept) and
 * never collapses a partial result into a success message.
 */
export function showDataControlResultDialog(doc: Document, view: DataControlResultView): Promise<void> {
  return new Promise((resolve) => {
    let settled = false
    let handle: ModalHandle | null = null
    const finish = (): void => {
      if (settled) return
      settled = true
      handle?.close()
      resolve()
    }
    const ids = { title: nextDialogId('pet-data-result-title'), desc: nextDialogId('pet-data-result-desc') }
    handle = createDialog(doc, {
      className: 'consent-data-result',
      labelledBy: ids.title,
      describedBy: ids.desc,
      onEscape: finish,
    })
    const dialog = handle.dialog
    dialog.append(node(doc, 'p', 'consent-kicker', view.kicker ?? 'DATA CONTROL · RESULT'))
    const title = node(doc, 'h2', 'consent-title', view.title)
    title.id = ids.title
    dialog.append(title)
    const desc = node(doc, 'p', 'consent-reason', view.intro ?? '以下为本次操作的实际结果（逐项）：')
    desc.id = ids.desc
    dialog.append(desc)
    if (view.lines && view.lines.length > 0) {
      const list = node(doc, 'ul', 'consent-data-list')
      for (const line of view.lines) list.append(node(doc, 'li', undefined, line))
      dialog.append(list)
    }
    if (view.items && view.items.length > 0) {
      const list = node(doc, 'ul', 'consent-data-result-list')
      for (const item of view.items) {
        const row = node(doc, 'li', `consent-data-result-item consent-data-${item.status}`)
        row.append(node(doc, 'span', 'consent-data-result-label', item.label))
        row.append(node(doc, 'span', 'consent-data-result-status', DATA_RESULT_STATUS_LABEL[item.status]))
        if (item.detail) row.append(node(doc, 'span', 'consent-data-result-detail', item.detail))
        list.append(row)
      }
      dialog.append(list)
    }
    if (view.footnote) dialog.append(node(doc, 'p', 'consent-foot', view.footnote))
    const actions = node(doc, 'div', 'consent-actions')
    const close = node(doc, 'button', 'consent-accept', view.closeLabel ?? '知道了')
    close.type = 'button'
    actions.append(close)
    dialog.append(actions)
    close.addEventListener('click', finish)
    close.focus({ preventScroll: false })
  })
}
