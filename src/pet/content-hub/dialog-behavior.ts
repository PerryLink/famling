/**
 * Open/close state, focus trap and inert-background handling for the role &
 * content center dialog. Split out of `initContentHub` (E10 / MB-101).
 *
 * The dialog owns only presentation state (open flag, the element focus returns
 * to, the inerted host app and the document-level Escape/Tab handler). Tab
 * content rendering and host effects stay in the controllers through the
 * injected callbacks.
 */

export interface ContentHubDialogOptions {
  readonly document: Document
  readonly root: HTMLElement
  readonly panelBody: HTMLElement
  readonly closeButton: HTMLButtonElement
  readonly backdrop: HTMLElement
  /** Tab buttons keyed by stable tab id: the focus target when opening. */
  readonly tabButtons: ReadonlyMap<string, HTMLButtonElement>
  /** Currently selected tab id (used to pick the initial focus target). */
  readonly getActiveTab: () => string
  /** False when there is no loaded catalog (open() refuses and stays closed). */
  readonly canOpen: () => boolean
  /** Initial render once the panel is visible (tabs/feedback/issues/summary). */
  readonly onOpen: () => void
  /** Host callback on close (e.g. flush appearance in the content window). */
  readonly onHostClose?: () => void
  /** Release controller resources when the whole hub is destroyed. */
  readonly onDestroy?: () => void
}

export interface ContentHubDialog {
  open(): boolean
  close(restoreFocus?: boolean): void
  isOpen(): boolean
  destroy(): void
}

/**
 * Wire the dialog behaviour onto an already-built shell. Escape closes, Tab is
 * trapped inside the dialog (Shift+Tab wraps), focus returns to the opener and
 * #pet-app is inerted while the dialog is open.
 */
export function createContentHubDialog(options: ContentHubDialogOptions): ContentHubDialog {
  const doc = options.document
  const root = options.root
  let openState = false
  let returnFocus: HTMLElement | null = null
  let inertedApp: HTMLElement | null = null

  // True when the node has a layout box in a real browser. The content center
  // reuses the page stylesheet, so a shell/panel rule can leave a control with
  // tabIndex 0 but display:none, and .focus() is then a no-op. task-122 narrowed
  // the desktop-shell chrome rule to #pet-app > header, so this dialog's own
  // header (title + 合上) now stays visible; the filter remains as defence for
  // any other zero-layout node. The injectable fake DOM used by unit tests has
  // no layout pass, so only real browsers filter.
  // (Deliberately a line comment: the production-source gate strips block
  // comments before line comments, so a block comment here would swallow code.)
  function isRendered(node: HTMLElement): boolean {
    const probe = node as unknown as { getClientRects?: () => ArrayLike<unknown> }
    if (typeof probe.getClientRects !== 'function') return true
    try {
      return probe.getClientRects().length > 0
    } catch {
      return true
    }
  }

  function focusableElements(): HTMLElement[] {
    const nodes = root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
    return Array.from(nodes).filter((node) => !node.hidden && isRendered(node))
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (!openState) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key !== 'Tab') return
    const focusables = focusableElements()
    if (focusables.length === 0) return
    const active = doc.activeElement
    // The tabpanel itself is focusable (tabindex=0) but is not part of the
    // button/link list. Leave Tab to the browser's own sequential navigation
    // there: forward Tab enters the panel's own controls and Shift+Tab returns
    // to the selected tab. Intercepting it used to call focus() on the first
    // listed control, which can have no layout box (see isRendered), so focus
    // stayed on the panel and keyboard users could not reach its buttons.
    if (active === options.panelBody) return
    const index = active instanceof HTMLElement ? focusables.indexOf(active) : -1
    if (event.shiftKey) {
      if (index <= 0) {
        event.preventDefault()
        focusables[focusables.length - 1]?.focus()
      }
      return
    }
    if (index === -1 || index === focusables.length - 1) {
      event.preventDefault()
      focusables[0]?.focus()
    }
  }

  function consentOverlayOpen(): boolean {
    try {
      return doc.querySelectorAll('.consent-root').length > 0
    } catch {
      return false
    }
  }

  function open(): boolean {
    if (openState) return true
    if (!options.canOpen()) return false
    openState = true
    returnFocus = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
    root.hidden = false
    root.inert = false
    root.dataset.state = 'open'
    const app = doc.getElementById('pet-app')
    if (app && !inertedApp) {
      app.setAttribute('inert', '')
      inertedApp = app
    }
    doc.addEventListener('keydown', onDocumentKeydown, true)
    options.onOpen()
    const target = options.tabButtons.get(options.getActiveTab()) ?? options.closeButton
    try {
      target.focus()
    } catch {
      // A detached/blocked focus target must not break opening the panel.
    }
    return true
  }

  function close(restoreFocus = true): void {
    if (!openState) return
    openState = false
    root.dataset.state = 'closed'
    root.hidden = true
    root.inert = true
    doc.removeEventListener('keydown', onDocumentKeydown, true)
    if (inertedApp) {
      if (!consentOverlayOpen()) inertedApp.removeAttribute('inert')
      inertedApp = null
    }
    if (restoreFocus) {
      const target = returnFocus && returnFocus.isConnected ? returnFocus : null
      try {
        target?.focus()
      } catch {
        // Focus restore is best-effort; the dialog is already closed.
      }
    }
    returnFocus = null
    try {
      options.onHostClose?.()
    } catch {
      // A host callback failure must never keep the dialog in a broken state.
    }
  }

  function destroy(): void {
    doc.removeEventListener('keydown', onDocumentKeydown, true)
    if (openState) close(false)
    options.onDestroy?.()
    root.replaceChildren()
    root.hidden = true
    root.inert = true
    root.dataset.state = 'closed'
  }

  function isOpen(): boolean {
    return openState
  }

  options.backdrop.addEventListener('click', () => {
    close(true)
  })
  options.closeButton.addEventListener('click', () => {
    close(true)
  })

  return { open, close, isOpen, destroy }
}
