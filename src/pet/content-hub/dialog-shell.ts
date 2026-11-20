/**
 * Static dialog shell for the 角色与内容中心: mount point, panel structure,
 * tablist and the textContent-only feedback/issues helpers. Split out of
 * `initContentHub` (E10 / MB-101) so the barrel only composes controllers.
 *
 * The shell is a renderer, not a controller: it never reads host state, never
 * renders tab content and never opens/closes the dialog. content-hub.ts passes
 * the tab-activation intent callback, and the per-tab controllers later fill
 * `panelBody` through the injectable {@link HubRenderSurface}.
 */
import type { ContentIssue } from '../content-library.ts'
import {
  CONTENT_HUB_DOCS_HREF,
  CONTENT_HUB_NOTICE,
  type HubCreateElement,
} from './shared.ts'

/** Mount point id in pet.html (JS builds the panel into this container). */
export const CONTENT_HUB_ID = 'content-hub-root'

/** Panel body id; the tablist points every tab's aria-controls at it. */
export const CONTENT_HUB_PANEL_ID = 'content-hub-panel'
/** Dialog title id; the root's aria-labelledby points at it. */
export const CONTENT_HUB_TITLE_ID = 'content-hub-title'
/** Tab button id prefix; the full id is prefix + stable tab id. */
export const CONTENT_HUB_TAB_ID_PREFIX = 'content-hub-tab-'

/** One top-level tab definition, as the shell renders it. */
export interface ContentHubTabShellDefinition<T extends string = string> {
  readonly id: T
  readonly label: string
  /** One-line explanation shown above the tab content. */
  readonly blurb: string
}

export interface ContentHubDialogShellOptions<T extends string> {
  readonly tabs: readonly ContentHubTabShellDefinition<T>[]
  /** Canonical docs href; defaults to the shared constant. */
  readonly docsHref?: string
  /** Tab click / tablist arrow-key activation intent (the controller owns activeTab). */
  readonly onActivateTab: (id: T, focusTab: boolean) => void
}

export interface ContentHubDialogShell<T extends string = string> {
  readonly document: Document
  readonly root: HTMLElement
  readonly backdrop: HTMLElement
  readonly panel: HTMLElement
  readonly header: HTMLElement
  readonly tabList: HTMLElement
  readonly tabs: readonly { readonly tab: HTMLButtonElement; readonly id: T }[]
  readonly tabButtons: ReadonlyMap<T, HTMLButtonElement>
  readonly panelBody: HTMLElement
  readonly feedback: HTMLElement
  readonly issueList: HTMLElement
  readonly footer: HTMLElement
  readonly closeButton: HTMLButtonElement
  readonly packSummary: HTMLElement
  /** Element factory exposed to the tab renderers. */
  readonly create: HubCreateElement
  readonly setFeedback: (message: string, state: 'ok' | 'error' | 'info') => void
  readonly setIssues: (issues: readonly ContentIssue[] | undefined) => void
  readonly setPackSummary: (text: string) => void
  /** Sync aria-selected/tabIndex/dataset and the tabpanel's aria-labelledby. */
  renderTabs(activeTab: T): void
  /** The active tab's one-line explanation above the tab content. */
  appendBlurb(activeTab: T): void
  /** A single `.content-hub-empty` notice inside the panel body. */
  appendEmpty(text: string): void
}

/**
 * Resolve the static mount point, (re)initialise the dialog semantics on it and
 * clear any previous content. Idempotent for repeated initContentHub calls.
 */
export function mountContentHubRoot(doc: Document): HTMLElement {
  const existing = doc.getElementById(CONTENT_HUB_ID)
  const rootElement = existing ?? doc.createElement('div')
  if (!existing) {
    rootElement.id = CONTENT_HUB_ID
    const host = doc.body ?? doc.documentElement
    host.append(rootElement)
  }
  rootElement.className = 'content-hub-root'
  rootElement.setAttribute('role', 'dialog')
  rootElement.setAttribute('aria-modal', 'true')
  rootElement.setAttribute('aria-labelledby', CONTENT_HUB_TITLE_ID)
  rootElement.hidden = true
  rootElement.inert = true
  rootElement.dataset.state = 'closed'
  rootElement.replaceChildren()
  return rootElement
}

/**
 * Build the dialog shell into pet.html's static mount point. Only textContent
 * and validated attributes are written; the tab buttons are real buttons and
 * keep the tablist keyboard contract (click/arrow keys report through the
 * injected intent callback).
 */
export function createContentHubDialogShell<T extends string>(
  doc: Document,
  options: ContentHubDialogShellOptions<T>,
): ContentHubDialogShell<T> {
  const root = mountContentHubRoot(doc)
  const create: HubCreateElement = <K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className = '',
  ): HTMLElementTagNameMap[K] => {
    const node = doc.createElement(tag)
    if (className !== '') node.className = className
    return node
  }

  const backdrop = create('div', 'content-hub-backdrop')
  const panel = create('section', 'content-hub-panel')
  const header = create('header', 'content-hub-head')
  const headText = create('div', 'content-hub-headtext')
  const kicker = create('p', 'content-hub-kicker')
  kicker.textContent = 'ROLE & CONTENT CENTER'
  const title = create('h2', 'content-hub-title')
  title.id = CONTENT_HUB_TITLE_ID
  title.textContent = '角色与内容中心'
  const subtitle = create('p', 'content-hub-sub')
  subtitle.textContent = '角色就是主题 · 一键切换角色外观 / 声音 / 对话与配色 · 本地内容优先，默认不联网'
  headText.append(kicker, title, subtitle)
  const closeButton = create('button', 'content-hub-close')
  closeButton.type = 'button'
  closeButton.textContent = '合上'
  closeButton.setAttribute('aria-label', '关闭角色与内容中心')
  header.append(headText, closeButton)

  const tabList = create('div', 'content-hub-tabs')
  tabList.setAttribute('role', 'tablist')
  tabList.setAttribute('aria-label', '角色与内容分类')
  const tabs: { readonly tab: HTMLButtonElement; readonly id: T }[] = []
  const tabButtons = new Map<T, HTMLButtonElement>()
  const tabOrder = options.tabs.map((definition) => definition.id)
  for (const definition of options.tabs) {
    const tab = create('button', 'content-hub-tab')
    tab.type = 'button'
    tab.id = CONTENT_HUB_TAB_ID_PREFIX + definition.id
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', CONTENT_HUB_PANEL_ID)
    tab.setAttribute('aria-selected', 'false')
    tab.tabIndex = -1
    tab.textContent = definition.label
    tab.addEventListener('click', () => {
      options.onActivateTab(definition.id, false)
    })
    tab.addEventListener('keydown', (event) => {
      handleTabKey(event, definition.id)
    })
    tabs.push({ tab, id: definition.id })
    tabButtons.set(definition.id, tab)
    tabList.append(tab)
  }

  const panelBody = create('div', 'content-hub-body')
  panelBody.id = CONTENT_HUB_PANEL_ID
  panelBody.setAttribute('role', 'tabpanel')
  panelBody.tabIndex = 0
  const feedback = create('p', 'content-hub-feedback')
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')
  const issueList = create('ul', 'content-hub-issues')
  issueList.hidden = true
  const footer = create('footer', 'content-hub-foot')
  const notice = create('p', 'content-hub-notice')
  notice.textContent = CONTENT_HUB_NOTICE
  const footRow = create('div', 'content-hub-footrow')
  const docsLink = create('a', 'content-hub-docs')
  docsLink.href = options.docsHref ?? CONTENT_HUB_DOCS_HREF
  docsLink.target = '_blank'
  docsLink.rel = 'noopener noreferrer'
  docsLink.textContent = '内容包 / 市场规范（canonical）'
  const packSummary = create('span', 'content-hub-packsum')
  footRow.append(docsLink, packSummary)
  footer.append(notice, footRow)
  panel.append(header, tabList, panelBody, feedback, issueList, footer)
  root.replaceChildren(backdrop, panel)

  const setFeedback = (message: string, state: 'ok' | 'error' | 'info'): void => {
    feedback.textContent = message
    feedback.dataset.state = state
  }

  const setIssues = (issues: readonly ContentIssue[] | undefined): void => {
    issueList.replaceChildren()
    const list = issues ?? []
    if (list.length === 0) {
      issueList.hidden = true
      return
    }
    issueList.hidden = false
    for (const item of list.slice(0, 6)) {
      const row = create('li', 'content-hub-issue')
      row.textContent = item.path + ' · ' + item.code + ' · ' + item.message
      issueList.append(row)
    }
  }

  const setPackSummary = (text: string): void => {
    packSummary.textContent = text
  }

  function tabDefinition(id: T): ContentHubTabShellDefinition<T> | undefined {
    return options.tabs.find((definition) => definition.id === id)
  }

  const renderTabs = (activeTab: T): void => {
    for (const item of tabs) {
      const selected = item.id === activeTab
      item.tab.setAttribute('aria-selected', selected ? 'true' : 'false')
      item.tab.tabIndex = selected ? 0 : -1
      item.tab.dataset.active = selected ? 'true' : 'false'
    }
    panelBody.setAttribute('aria-labelledby', CONTENT_HUB_TAB_ID_PREFIX + activeTab)
  }

  const appendBlurb = (activeTab: T): void => {
    const definition = tabDefinition(activeTab)
    if (definition === undefined) return
    const blurb = create('p', 'content-hub-blurb')
    blurb.textContent = definition.blurb
    panelBody.append(blurb)
  }

  const appendEmpty = (text: string): void => {
    const empty = create('p', 'content-hub-empty')
    empty.textContent = text
    panelBody.append(empty)
  }

  function handleTabKey(event: KeyboardEvent, id: T): void {
    const index = tabOrder.indexOf(id)
    let next: T | undefined
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = tabOrder[(index + 1) % tabOrder.length]
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = tabOrder[(index - 1 + tabOrder.length) % tabOrder.length]
    else if (event.key === 'Home') next = tabOrder[0]
    else if (event.key === 'End') next = tabOrder[tabOrder.length - 1]
    if (next === undefined) return
    event.preventDefault()
    options.onActivateTab(next, true)
  }

  return {
    document: doc,
    root,
    backdrop,
    panel,
    header,
    tabList,
    tabs,
    tabButtons,
    panelBody,
    feedback,
    issueList,
    footer,
    closeButton,
    packSummary,
    create,
    setFeedback,
    setIssues,
    setPackSummary,
    renderTabs,
    appendBlurb,
    appendEmpty,
  }
}
