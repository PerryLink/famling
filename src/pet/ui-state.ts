/**
 * Pure view-model helpers for the pet web shell (no DOM): this module is the
 * single place where the hardened Advisers face hook (`face.ts`) is turned into
 * status-line / retry-button state, and where the hero renderer's load/empty/
 * error outcome is turned into the minimal placeholder DOM state.
 *
 * Kept DOM-free so the Node test suite can lock the text/state contract without
 * a browser. Privacy is unchanged: views only carry the status text/state/code
 * that `describeAdvisersFaceStatus()` already sanitized (no brief content, no
 * local paths) — the hero helper never displays a raw failure message.
 */
import {
  describeAdvisersFaceStatus,
  type AdvisersFaceState,
  type AdvisersFaceStatus,
} from './advisers/face.ts'

/** What `main.ts` needs to render one Advisers status update (no brief content). */
export interface AdvisersFaceView {
  /** Status-line text from the hardened hook (already sanitized). */
  text: string
  /** Coarse state for `data-state` styling: disabled/unavailable/error/stale/ok. */
  state: AdvisersFaceState
  /** True for the stale/fresh split so a stale panel cannot look current. */
  stale: boolean
  /** True when a manual retry plausibly helps (drives the retry button). */
  retryable: boolean
  /** Retry button label, or null when retry does not apply. */
  retryLabel: string | null
  /** Toggle button text; never derived from brief content. */
  toggleText: string
  /** Whether the face controller is currently enabled. */
  enabled: boolean
}

/**
 * Map an `AdvisersFaceStatus` to the shell's status line + retry button.
 * `retryLabel` (not `retryable`) decides whether the button is rendered, so the
 * display hook stays the single source of truth for retry affordance.
 */
export function describeAdvisersFaceView(status: AdvisersFaceStatus): AdvisersFaceView {
  const display = describeAdvisersFaceStatus(status)
  return {
    text: display.text,
    state: display.state,
    stale: display.stale,
    retryable: status.retryable,
    retryLabel: display.retryLabel,
    toggleText: status.enabled ? 'Advisers：开' : 'Advisers：关',
    enabled: status.enabled,
  }
}

/** Minimal first-run / empty / error states for the hero renderer stage. */
export type HeroPlaceholderState = 'off' | 'loading' | 'empty' | 'error'

export interface HeroPlaceholderView {
  state: HeroPlaceholderState
  /** Short user-facing text; never a raw error message (paths stay out of the UI). */
  text: string
}

/**
 * Failure reasons from `hero-runtime.ts` that mean "no character/pack available"
 * (empty state) rather than "the renderer crashed" (error state). Keep this
 * classification purely textual: it must not read the failure object or paths.
 */
const EMPTY_HERO_REASON = /no character|unknown character|not.?found|404|missing character|missing-tags|no actor|no bundles/i

/**
 * One pure switch for the hero placeholder:
 * - `disabled` (hero flag off, folded-paper DOM is the renderer) and `ready`
 *   both hide the placeholder — the DOM pet is not faked or duplicated;
 * - `loading` shows the first-frame wait state;
 * - `failed` shows `empty` for "character/pack missing" and `error` otherwise,
 *   so a crash is never presented as "still loading".
 */
export function heroPlaceholderView(
  scene: 'disabled' | 'loading' | 'ready' | 'failed',
  reason = '',
): HeroPlaceholderView {
  switch (scene) {
    case 'disabled':
    case 'ready':
      return { state: 'off', text: '' }
    case 'loading':
      return { state: 'loading', text: '正在加载角色…' }
    case 'failed':
      return EMPTY_HERO_REASON.test(reason)
        ? { state: 'empty', text: '未找到角色；使用折纸占位' }
        : { state: 'error', text: '角色渲染失败；已回退折纸占位' }
  }
}
