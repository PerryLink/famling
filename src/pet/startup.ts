/**
 * Pet main-process startup composition (E11 MB-110, task-135).
 *
 * Extracted from `src/pet/main.ts` so the boot state machine is importable in
 * Node: this module has NO CSS import and NO module-level DOM/Tauri side
 * effects. `main.ts` supplies the live seams (consent runtime, page boot, error
 * boundaries, exit) and calls `start()` exactly where it used to call
 * `startConsentApp()` / `startContentWindowApp()`.
 *
 * Behaviour is intentionally unchanged (P1-4: initialize -> consent -> boot,
 * never fail-open):
 *   - a rejected/absent TOS acceptance never reaches the boot callback;
 *   - a boot/init/consent throw shows the blocking failure screen and keeps the
 *     failed stage so `retry()` resumes exactly that stage;
 *   - the blocking screen shares the `.consent-root` marker +
 *     `CONSENT_OVERLAY_EVENT` so the body-level desktop shell cannot stay
 *     operable behind it.
 */
import { CONSENT_OVERLAY_EVENT } from './consent/modal.ts'

// ---------------------------------------------------------------------------
// Blocking startup-failure screen (audit P1-4: no fail-open blank app)
// ---------------------------------------------------------------------------
export interface StartupFailureScreenOptions {
  /** Sanitized short copy (from `toUserMessage`), never the raw error/path. */
  readonly message: string
  readonly onRetry: () => void
  readonly onExit: () => void
}

export interface StartupFailureScreen {
  hide(): void
}

/**
 * Visible blocking screen shown when the startup path throws. The pet app is
 * made inert/aria-hidden so a failed boot can never leave a blank-but-
 * interactive window; only retry/exit leave the screen. The copy is the
 * caller's sanitized `toUserMessage(error)`, never an error object/path.
 */
export function createStartupFailureScreen(doc: Document, options: StartupFailureScreenOptions): StartupFailureScreen {
  const root = doc.createElement('div')
  root.id = 'startup-failure-screen'
  // Share the blocking-overlay marker so `hasOpenConsentOverlay()` and the
  // desktop-shell menu gating (both keyed on `.consent-root`) also treat a
  // failed start as "no interaction": the shell menu lives outside `#pet-app`
  // and must not open behind this screen.
  root.className = 'startup-failure-screen consent-root'
  root.setAttribute('role', 'alertdialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', '启动失败')
  root.setAttribute('tabindex', '-1')
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:rgba(18,16,14,.94);color:#f2eadf;padding:24px;font-family:system-ui,sans-serif;'
  const card = doc.createElement('div')
  card.style.cssText = 'max-width:440px;line-height:1.7;font-size:14px;'
  const title = doc.createElement('h2')
  title.textContent = '启动没有完成'
  const reason = doc.createElement('p')
  reason.id = 'startup-failure-reason'
  reason.textContent = options.message
  const note = doc.createElement('p')
  note.textContent = '为避免误操作，当前窗口不加载存档、不播放语音、不写入本机数据。可重试或退出。'
  const actions = doc.createElement('div')
  actions.style.cssText = 'display:flex;gap:8px;margin-top:14px;'
  const retry = doc.createElement('button')
  retry.id = 'startup-failure-retry'
  retry.type = 'button'
  retry.textContent = '重试'
  retry.addEventListener('click', () => options.onRetry())
  const exit = doc.createElement('button')
  exit.id = 'startup-failure-exit'
  exit.type = 'button'
  exit.textContent = '退出应用'
  exit.addEventListener('click', () => options.onExit())
  actions.append(retry, exit)
  card.append(title, reason, note, actions)
  root.append(card)
  doc.body.appendChild(root)
  const app = doc.getElementById('pet-app')
  app?.setAttribute('inert', '')
  app?.setAttribute('aria-hidden', 'true')
  try {
    root.focus()
  } catch {}
  let hidden = false
  return {
    hide(): void {
      if (hidden) return
      hidden = true
      root.remove()
      app?.removeAttribute('inert')
      app?.removeAttribute('aria-hidden')
    },
  }
}

/**
 * Best-effort fan-out of the shared consent-overlay event so the desktop shell
 * closes/inerts its body-level menu for the blocking failure screen too.
 */
function notifyStartupOverlay(doc: Document | undefined, open: boolean): void {
  try {
    const view = (doc as (Document & { defaultView?: Window | null }) | undefined)?.defaultView
    const ctor = view?.CustomEvent ?? (typeof CustomEvent === 'function' ? CustomEvent : undefined)
    if (!ctor || !doc) return
    doc.dispatchEvent(new ctor(CONSENT_OVERLAY_EVENT, { detail: { open, kind: 'startup-failure' } }))
  } catch {
    /* event fan-out is best effort; pet-app is inert and the screen is on top */
  }
}

// ---------------------------------------------------------------------------
// Boot orchestration (P1-4): initialize -> consent -> boot, never fail-open
// ---------------------------------------------------------------------------
export type StartupStage = 'idle' | 'init' | 'consent' | 'boot'

/** The subset of the consent runtime the startup state machine drives. */
export type StartupConsentMode = 'pending' | 'accepted' | 'readonly'

export interface StartupConsentGate {
  retryInitialConsent(): Promise<StartupConsentMode>
}

/**
 * Live seams supplied by `main.ts` (production) or fakes (behaviour tests).
 * Everything the old inline functions closed over is injected here so the
 * composition can run in Node with a fake Document.
 */
export interface StartupHost {
  /** Independent content/settings window: never boots the pet surfaces. */
  readonly contentShell: boolean
  /** Document used for the blocking screen + overlay fan-out. */
  readonly document: Document | undefined
  /** Contextual error boundary reporting (main.ts: uiBoundary). */
  readonly reportFailure: (error: unknown) => void
  /** Sanitized user-facing copy (no path/URL). */
  readonly toUserMessage: (error: unknown) => string
  /** One-time idempotent page wiring; safe to call again on retry. */
  readonly initializeApp: () => void
  /** Runs the mandated first-run/upgrade TOS gate. */
  readonly bootstrapConsent: () => Promise<StartupConsentMode>
  readonly canInteract: () => boolean
  readonly getConsentGate: () => StartupConsentGate | null
  /** Pet-only boot (never called in the content window). */
  readonly bootPet: () => Promise<void>
  /** Content/settings-window boot (only called in content mode). */
  readonly bootContentShell: () => Promise<void>
  readonly exitApplication: () => void
  /** Clear the page's "already booted" latch before a retry re-runs bootPet. */
  readonly resetPetBoot: () => void
}

export interface StartupController {
  /** Current stage; a failed stage is kept so retry can resume it. */
  readonly stage: StartupStage
  /** One entry point: picks the pet or the content-window path. */
  start(): Promise<void>
  /** Retry from the blocking screen, resuming the stage that actually failed. */
  retry(): Promise<void>
  /** Pet boot after a host-initiated consent acceptance (re-consent path). */
  runPetBoot(): Promise<void>
  /** Show/refresh the blocking screen (also the last-resort net in main.ts). */
  showFailure(error: unknown): void
}

/**
 * Build the boot controller. Stage state lives in this closure (used to be
 * module-level `let`s in main.ts) so imports cannot share/leak boot state.
 */
export function createStartupController(host: StartupHost): StartupController {
  let stage: StartupStage = 'idle'
  let failureScreen: StartupFailureScreen | null = null
  let retryInFlight = false

  const hideFailure = (): void => {
    if (!failureScreen) return
    failureScreen.hide()
    failureScreen = null
    if (host.document) delete host.document.documentElement.dataset.startupFailure
    notifyStartupOverlay(host.document, false)
  }

  const showFailure = (error: unknown): void => {
    host.reportFailure(error)
    const doc = host.document
    if (!doc) return
    try {
      hideFailure()
      failureScreen = createStartupFailureScreen(doc, {
        message: host.toUserMessage(error),
        onRetry: () => {
          void controller.retry()
        },
        onExit: () => host.exitApplication(),
      })
      // QA/E2E marker for the blocking state (browser E2E can assert it).
      doc.documentElement.dataset.startupFailure = '1'
      notifyStartupOverlay(doc, true)
    } catch (renderError) {
      // Last resort: the failure screen itself must not blank the window.
      host.reportFailure(renderError)
      try {
        const fallback = doc.createElement('div')
        fallback.id = 'startup-failure-fallback'
        fallback.className = 'consent-root'
        fallback.setAttribute('role', 'alert')
        fallback.textContent = '启动没有完成。请重试或退出应用。'
        doc.body.appendChild(fallback)
        doc.getElementById('pet-app')?.setAttribute('inert', '')
        doc.documentElement.dataset.startupFailure = '1'
        notifyStartupOverlay(doc, true)
      } catch {}
    }
  }

  /**
   * Single boot path: initialize the consent runtime BEFORE any pet
   * interaction, then `bootstrapConsent()` runs the mandated D6 order
   * (2026-11-20):
   *   1) first-run/upgrade key-facts layer + full TOS (explicit checkbox +
   *      button; no birth date is requested at first launch), and only then
   *   2) boots the pet. The age self-report is NOT part of bootstrap: it is
   *      requested only when the internal age-gated roleplay entry is used (or
   *      the user opts in from About), and declining it blocks only that entry.
   * A later acceptance from the read-only screen (or a retry) re-shows the
   * full TOS and boots the pet exactly once. There is no path that silently
   * skips the TOS into normal interaction.
   */
  const startConsentApp = async (): Promise<void> => {
    try {
      stage = 'init'
      host.initializeApp()
      stage = 'consent'
      const mode = await host.bootstrapConsent()
      // Mark the stage BEFORE the boot line so a throw inside bootPet is
      // retried as a boot (not as a fresh consent prompt). The literal call form
      // is intentional: bootPet runs only after the TOS gate resolves.
      stage = mode === 'accepted' ? 'boot' : 'idle'
      if (mode === 'accepted') await host.bootPet()
      stage = 'idle'
    } catch (error) {
      // Keep the stage at the failed point so retry() resumes correctly.
      showFailure(error)
    }
  }

  /** Content-window equivalent: initialize -> consent -> content panel only. */
  const startContentWindowApp = async (): Promise<void> => {
    try {
      stage = 'init'
      host.initializeApp()
      stage = 'consent'
      const mode = await host.bootstrapConsent()
      stage = mode === 'accepted' ? 'boot' : 'idle'
      if (mode === 'accepted') await host.bootContentShell()
      stage = 'idle'
    } catch (error) {
      showFailure(error)
    }
  }

  /** Boot the pet after an accepted first-run/upgrade TOS; failures block the UI. */
  const runPetBoot = async (): Promise<void> => {
    stage = 'boot'
    try {
      await host.bootPet()
      stage = 'idle'
    } catch (error) {
      showFailure(error)
    }
  }

  /** Retry from the blocking screen, resuming the stage that actually failed. */
  const retry = async (): Promise<void> => {
    if (retryInFlight) return
    retryInFlight = true
    hideFailure()
    try {
      if (stage === 'boot') {
        // A failed boot may leave the "already booted" latch set; reset it so
        // the retry can actually run, then boot again (idempotent wiring guards
        // keep listeners from duplicating).
        if (host.contentShell) await startContentWindowApp()
        else {
          host.resetPetBoot()
          await runPetBoot()
        }
        return
      }
      if (stage === 'consent') {
        const gate = host.getConsentGate()
        if (gate && !host.canInteract()) {
          // A failed bootstrap cached a rejected bootPromise; the gate's retry
          // path clears it and re-shows the full TOS.
          const mode = await gate.retryInitialConsent()
          if (mode === 'accepted') {
            if (host.contentShell) await host.bootContentShell()
            else await runPetBoot()
          } else stage = 'idle'
          return
        }
      }
      // Init failure (or an unexpected stage): re-run the start path; completed
      // one-time wiring steps are skipped.
      if (host.contentShell) await startContentWindowApp()
      else {
        host.resetPetBoot()
        await startConsentApp()
      }
    } catch (error) {
      showFailure(error)
    } finally {
      retryInFlight = false
    }
  }

  const controller: StartupController = {
    get stage(): StartupStage {
      return stage
    },
    start(): Promise<void> {
      // Independent content/settings window: boot only the content
      // center/settings surfaces, never the pet (no duplicate save loop, hero,
      // Advisers or autosave). The last-resort `.catch` in main.ts still
      // covers a throw before the internal try block.
      return host.contentShell ? startContentWindowApp() : startConsentApp()
    },
    retry,
    runPetBoot,
    showFailure,
  }
  return controller
}
