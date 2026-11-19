/**
 * Visible AI attribution for the desktop pet (E7 / MB-076, PSY-P1-4).
 *
 * The old #voice-mode badge lives in the hidden aside.panel, so the desktop
 * shell never shows that the speech is AI-synthesised; the About panel mentions
 * it but is not visible while listening. This module owns the always-reachable
 * surface next to the #bubble:
 *
 * - every displayed AI reply shows "AI 生成 · 不是真人";
 * - while TTS audio actually plays it switches to
 *   "AI 语音 · 合成（不是真人）" for the clip duration, then back;
 * - the label is removed together with the bubble, so it is visible at the
 *   moment of encounter (not only in About), and it adds no persistent chrome
 *   around the character (requirement ⑥: no extra always-on button).
 *
 * The controller is DOM-injectable so Node tests can assert behaviour without a
 * browser.
 */

/** DOM id used by pet.html and the controller. */
export const AI_LABEL_ID = 'bubble-ai'

/** Copy for an AI-generated reply / thought bubble. */
export const AI_REPLY_LABEL = 'AI 生成 · 不是真人'
/** Copy while an AI-synthesised voice is playing. */
export const AI_VOICE_LABEL = 'AI 语音 · 合成（不是真人）'

export type AiLabelState = 'hidden' | 'reply' | 'voice'

export interface AiLabelController {
  /** Show the reply/thought attribution (default copy). */
  markReply(text?: string): void
  /** Show the TTS attribution for the given playback duration. */
  markVoice(durationMs: number): void
  /** Hide the label (bubble dismissed / reset). */
  clear(): void
  /** Current visible state (tests/diagnostics). */
  state(): AiLabelState
  /** Current visible text, or null when hidden. */
  text(): string | null
  /** Remove timers/listeners (tests/hot reload). */
  dispose(): void
}

interface AiLabelHost {
  setTimeout?(handler: () => void, timeout: number): unknown
  clearTimeout?(handle: unknown): void
}

/**
 * The label lives INSIDE #bubble (a block line after #bubble-text) so it is
 * always positioned with the bubble in both the window shell and the desktop
 * shell (where the bubble is re-anchored above the pet). If the static node is
 * missing (old page), create it inside the bubble as a fallback.
 */
function createLabelElement(doc: Document): HTMLElement | null {
  const existing = doc.getElementById(AI_LABEL_ID)
  if (existing) {
    // The static node already ships role=note; re-assert it for older pages and
    // for DOM doubles so the attribution is always exposed to assistive tech.
    existing.setAttribute('role', 'note')
    return existing
  }
  const bubble = doc.getElementById('bubble')
  if (!bubble) return null
  const label = doc.createElement('span')
  label.id = AI_LABEL_ID
  label.className = 'bubble-ai'
  label.setAttribute('role', 'note')
  try {
    bubble.append(label)
  } catch {
    return null
  }
  return label
}

/** Build (or attach to) the visible AI label controller for one window. */
export function installBubbleAiLabel(doc: Document, host: AiLabelHost = {}): AiLabelController {
  const element = createLabelElement(doc)
  const setTimeoutFn = host.setTimeout ?? ((handler: () => void, timeout: number) => setTimeout(handler, timeout))
  const clearTimeoutFn =
    host.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  let voiceTimer: unknown = null
  let current: AiLabelState = 'hidden'
  let currentText: string | null = null

  const render = (state: AiLabelState, text: string | null): void => {
    current = state
    currentText = state === 'hidden' ? null : text
    if (!element) return
    if (state === 'hidden') {
      element.hidden = true
      element.textContent = ''
      element.dataset.state = 'hidden'
      return
    }
    element.hidden = false
    element.textContent = text ?? ''
    element.dataset.state = state
  }

  const clearVoiceTimer = (): void => {
    if (voiceTimer === null) return
    clearTimeoutFn(voiceTimer)
    voiceTimer = null
  }

  const clear = (): void => {
    clearVoiceTimer()
    render('hidden', null)
  }

  return {
    markReply(text: string = AI_REPLY_LABEL): void {
      // A reply arriving while speech is playing still restores the reply label
      // after the voice window (the voice timer only owns the temporary state).
      clearVoiceTimer()
      render('reply', text)
    },
    markVoice(durationMs: number): void {
      clearVoiceTimer()
      render('voice', AI_VOICE_LABEL)
      const duration = Number.isFinite(durationMs) ? Math.max(600, Math.min(60_000, durationMs)) : 2000
      voiceTimer = setTimeoutFn(() => {
        voiceTimer = null
        // Keep the reply attribution visible while the bubble is still up.
        render('reply', AI_REPLY_LABEL)
      }, duration)
    },
    clear,
    state: () => current,
    text: () => currentText,
    dispose: () => {
      clearVoiceTimer()
      render('hidden', null)
    },
  }
}
