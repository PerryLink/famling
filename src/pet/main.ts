import {
  canRecallMemory,
  createPet,
  deserializePet,
  foldPaper,
  markMemoryRecalled,
  givePaper,
  patPet,
  renamePet,
  serializePet,
  petMood,
  petSchedule,
  type PetState,
} from '../kernel/pet.ts'
import { VoiceService } from '../voice/service.ts'
import { MockVoiceProvider } from '../voice/mock.ts'
import { SystemVoiceProvider } from '../voice/system.ts'
import { createTauriDeepSeekProvider } from '../voice/tauri.ts'
import { transcribeWav } from '../voice/asr.ts'
import type { TtsVoiceId } from '../voice/types.ts'
import { SAFE_REFUSAL, verifyUtterance } from './claims.ts'
import {
  createPetSaveService,
  saveFailureToError,
  shouldReportSaveFailure,
  type PetSaveService,
} from './save-host.ts'
import { exportPortable, importPortable } from './portable.ts'
import { heroStatus, resolveHeroConfig } from './hero-runtime.ts'
import type { HeroRegionReaction } from './anim/regions.ts'
import { loadDigest } from './chat-import/store.ts'
import {
  ADVISERS_AUTO_HIDDEN_NOTICE,
  ADVISERS_BLUR_HIDDEN_NOTICE,
  ADVISERS_NONE_CLEARED_NOTICE,
  ADVISERS_PAGE_HIDDEN_NOTICE,
  ADVISERS_PRODUCER_TOS_GUIDANCE_LINES,
  ADVISERS_VISIBILITY_HIDDEN_NOTICE,
  AdvisersFaceController,
  AdvisersPanelPrivacyGuard,
  describeAdvisersPolicyStatusSuffix,
  summarizeBrief,
  type AdvisersFaceStatus,
  type AdvisersPanelHideReason,
  type AdvisersPanelPolicyView,
} from './advisers/face.ts'
import { describeAdvisersFaceView } from './ui-state.ts'
import {
  initDesktopShell,
  requestMenuCoach,
  createComposerController,
  type ComposerController,
  type HeroMenuActionItem,
} from './desktop-shell.ts'
import { PET_RELOAD_EVENT, contentWindowMode } from './content-window.ts'
import { heroActionPlan, isHeroMenuAction } from './hero-actions.ts'
import { startHitRegionSync } from './hit-regions.ts'
import { startDesktopShellLayout } from './shell-layout.ts'
import { createTrustLayer } from './trust.ts'
import {
  assertSafeForTts,
  isSafetyBlockedError,
  reviewDlcDescription,
  reviewModelOutput,
  reviewUserInput,
} from './safety/gate.ts'
import { MAX_TALK_MS, MAX_WAV_BYTES, TalkRecorder, type MediaStreamLike, type TalkState } from './recording.ts'
import { safeGetItem, safeSetItem } from './security/safe-storage.ts'
import { migrateFamlingLocalState } from './state-migrations.ts'
import { initUsageSummary, recordUsage, resetUsageSummary } from './usage-summary.ts'
import { initCohabitation, resetCohabitation } from './cohabitation.ts'
import { SECURITY_LIMITS, sanitizePlainText } from './security/limits.ts'
import { createErrorBoundary, toUserMessage, type ErrorBoundary } from './security/error-boundary.ts'
import { createSecurityRateLimits, RateLimitError } from './security/rate-limit.ts'
import { installCrashBuffer } from '../observability.ts'
import {
  CONSENT_ACTIONS,
  loadCharacterPackWithConsent,
} from './consent/content.ts'
import { CONSENT_OVERLAY_EVENT } from './consent/modal.ts'
import { createStartupController } from './startup.ts'
import {
  bootstrapConsent,
  canInteract,
  closeAboutPanel,
  consentSnapshot,
  getConsentGate,
  initConsentRuntime,
  openAboutPanel,
  openTosViewer,
  readConsentAudit,
  readSafetyAudit,
  requestAsrConfirmation,
  requestClearConsentAudit,
  requestClearSafetyAudit,
  requestDeleteAllLocalData,
  requestExportSafetyAudit,
  requestTtsConfirmation,
  requestWithdrawConsent,
  requireAsrConsent,
  requireContentConsent,
  requireRoleplayConsent,
  requireTtsConsent,
  requestRoleplayExit,
  roleplayState,
  safetyAuditPersistence,
  startHealthReminder,
} from './consent/runtime.ts'
import { getSafetyAuditLedger, type SafetyReviewLike } from './consent/safety-audit.ts'
import { grantHostVoiceConsent, revokeHostConsent, syncHostConsent } from './consent/host.ts'
import { asrConfigSignature } from './consent/asr.ts'
import { ttsConfigSignature } from './consent/tts.ts'
import { formatVoiceModeLabel, isTtsVoiceId, readVoicePref, VOICE_PREF_STORAGE_KEY } from './voice-prefs.ts'
import {
  AMBIENT_CADENCE_KEY,
  DEFAULT_AMBIENT_CADENCE,
  clearWorkSession,
  filterProactiveLine,
  isWorkSessionActive,
  readAmbientCadence,
  readWorkSession,
  resolveAmbientRhythm,
  startWorkSession,
  workSessionRemainingMs,
  workSessionStartLine,
  writeWorkSession,
  WORK_SESSION_CUT_LINE,
  WORK_SESSION_DONE_LINE,
  type AmbientCadence,
  type WorkSession,
} from './low-disturb.ts'
import type { PetPose } from '../presence/types.ts'

import { AI_REPLY_LABEL, installBubbleAiLabel } from './ai-label.ts'
import { roleplayTemplateReply } from './consent/roleplay.ts'
import { decideDialogueLine, type DialogueLineKind } from './content-hub.ts'
import { type CharacterPackKind, type DialogueBehavior } from './content-library.ts'
import { createContentRuntime } from './content-runtime.ts'
import { CHARACTER_PACK_APPLY_EVENT, createHeroPage } from './hero-page.ts'
import { createSettingsPage } from './settings-page.ts'
import { createContentReportPanel, type ContentReportPanel } from './content-reporting.ts'
import './pet.css'

/**
 * Instrumented trust layer (P0 review 2026-11-17 05-content-trust / R-P0-21).
 *
 * The safety gates are UNCHANGED; this wrapper only summarizes every result
 * into the local append-only review ledger (`consent/safety-audit.ts`) which
 * stores no original text: direction / categories / rule ids / disposition /
 * timestamp / salted text hash / length. The About panel can view, clear and
 * export (complaints/law enforcement only) it, and "delete all local data"
 * clears it. It is local, user-clearable and NOT evidence-grade (no hash chain).
 *
 * Coverage: the pet window's ASR (user input), Advisers/Pet Brief (model
 * output) and TTS gates. The separate chat-import window keeps its own trust
 * layer and is documented as a remaining gap in docs/audit/DATA-CONTROLS.
 */
function recordSafetyReview(review: SafetyReviewLike, text: string): void {
  try {
    getSafetyAuditLedger().record(review, text)
  } catch {
    /* audit must never break the safety decision path */
  }
}

function createAuditedTrustLayer(): ReturnType<typeof createTrustLayer> {
  return createTrustLayer({
    reviewInput: async (text, options) => {
      const review = await reviewUserInput(text, options)
      recordSafetyReview(review, text)
      return review
    },
    reviewOutput: async (text, options) => {
      const review = await reviewModelOutput(text, options)
      recordSafetyReview(review, text)
      return review
    },
    reviewDlc: async (text, options) => {
      const review = await reviewDlcDescription(text, options)
      recordSafetyReview(review, text)
      return review
    },
    assertTts: async (text, options) => {
      try {
        const safe = await assertSafeForTts(text, options)
        recordSafetyReview({ direction: 'tts', allowed: true, disposition: 'allow', findings: [] }, text)
        return safe
      } catch (error) {
        // A blocked TTS text is the most important review to retain.
        if (isSafetyBlockedError(error)) recordSafetyReview(error.review, text)
        throw error
      }
    },
  })
}

/** Process-wide trust layer used by the pet main flow (same semantics + audit). */
const trust = createAuditedTrustLayer()

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T

/**
 * Visible AI attribution (MB-076): the bubble label shows "AI 生成 · 不是真人"
 * for every AI reply and "AI 语音 · 合成（不是真人）" while TTS actually plays.
 * Lives next to #bubble because the desktop shell hides aside.panel; this is
 * not a new always-on control (it only exists while a bubble is shown).
 */
const aiLabel = installBubbleAiLabel(document)

/**
 * Quiet hours / 夜间安静 (MB-070): default 22:00–08:00, enabled, adjustable and
 * closable from 总设置. The persisted window and the mirror now live in the
 * extracted settings page (E10 task-121); this page keeps the line-filter
 * delegate so ambient output stops/starts without a reload and the 2h health
 * reminder keeps reading the same setting through the consent runtime.
 */
function quietHoursActive(at: Date = new Date()): boolean {
  return settingsPage.quietHoursActive(at)
}
const FORCE_BROWSER_FALLBACK = typeof location !== 'undefined' && new URLSearchParams(location.search).has('browser-fallback')
const HAS_TAURI = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && !FORCE_BROWSER_FALLBACK
const SAVE_SLOT = 'pet'

// ---------------------------------------------------------------------------
// Independent content/settings window mode (MB-062 / E6, task-85)
//
// The same pet.html entry serves two roles. The installed 480x336 window boots
// the pet; the Tauri host's second window is marked before page scripts
// (`window.__CONTENT_WINDOW_ROUTE__`, injected by app/tauri/src-tauri/src/main.rs)
// or via the browser fallback `?shell=content#content|settings`. In content mode
// this module boots ONLY the existing content runtime + desktop-shell settings
// dialog: no pet state loop, no autosave, no hit-region sync. Rendering and
// persistence are the SAME modules as the pet window (no business logic here).
// ---------------------------------------------------------------------------
const CONTENT_WINDOW = contentWindowMode({
  search: typeof location === 'undefined' ? '' : location.search,
  hash: typeof location === 'undefined' ? '' : location.hash,
  hostRoute:
    typeof window === 'undefined'
      ? undefined
      : (window as unknown as Record<string, unknown>)['__CONTENT_WINDOW_ROUTE__'],
})
const CONTENT_SHELL = CONTENT_WINDOW.isContentWindow
if (CONTENT_SHELL && typeof document !== 'undefined') {
  // Paint the content-window layout before the first frame (pet.css overrides
  // the transparent desktop-shell background for this attribute).
  document.documentElement.dataset.contentWindow = '1'
}

// Host-side trust wiring (HARDENING-2026-11-17 P1): one token bucket each for
// cloud TTS / manual saves, and one error boundary per concern so failures are
// logged once (console.error + lastFailure) instead of being swallowed.
const limits = createSecurityRateLimits()
const ttsBoundary = createErrorBoundary({ context: 'pet:tts' })
const saveBoundary = createErrorBoundary({ context: 'pet:save' })
const loadBoundary = createErrorBoundary({ context: 'pet:load' })
const storageBoundary = createErrorBoundary({ context: 'pet:storage' })
const importBoundary = createErrorBoundary({ context: 'pet:import' })
const voiceBoundary = createErrorBoundary({ context: 'pet:voice' })
const uiBoundary = createErrorBoundary({ context: 'pet:ui' })
function reportFailure(boundary: ErrorBoundary, error: unknown): void {
  boundary.guardSync(() => {
    throw error
  })
}

// ---------------------------------------------------------------------------
// P1 local-data / QA gate (audit TRUST-REVIEW-2026-11-17 P1-1/P1-2/P1-4)
// ---------------------------------------------------------------------------
/**
 * Local actions that read/mutate the user's save+memory or write an export
 * file. They must be refused before an explicit full-TOS acceptance (first run
 * pending, version/hash upgrade pending, or the safe read-only screen after a
 * decline): a pending pet must not load, mutate, delete, export or restore
 * anything. There is deliberately NO bypass flag: the only input is the consent
 * runtime's `canInteract()` — no query parameter, storage key or window global
 * can unlock these paths. After consent the normal behaviour is unchanged.
 */
export type GuardedLocalAction =
  | 'memory-open'
  | 'memory-modify'
  | 'memory-forget'
  | 'memory-forget-all'
  | 'memory-export'
  | 'save-export'
  | 'save-delete'
  | 'save-load'
  | 'qa-restore'
  | 'qa-load'
  | 'qa-say'

const GUARDED_ACTION_COPY: Readonly<Record<GuardedLocalAction, string>> = Object.freeze({
  'memory-open': '打开折页簿',
  'memory-modify': '修改记忆',
  'memory-forget': '忘掉记忆',
  'memory-forget-all': '忘掉全部记忆',
  'memory-export': '导出折页',
  'save-export': '导出备份存档',
  'save-delete': '删除本机存档',
  'save-load': '读取本机存档',
  'qa-restore': 'QA 恢复存档',
  'qa-load': 'QA 读档',
  'qa-say': 'QA 显示台词',
})

export interface LocalActionDecision {
  readonly allowed: boolean
  readonly action: GuardedLocalAction
  readonly message: string
}

/**
 * Injectable gate factory used by every memory/export/delete/QA entry point.
 * `isConsented` is a parameter (production: the consent runtime) so the
 * "not consented => no side effect" matrix is testable without a browser.
 */
export function createLocalActionGate(isConsented: () => boolean) {
  const check = (action: GuardedLocalAction): LocalActionDecision => {
    if (isConsented()) return { allowed: true, action, message: '' }
    return {
      allowed: false,
      action,
      message: `未同意完整免责声明前不能${GUARDED_ACTION_COPY[action]}；当前为安全只读模式，不会改记忆、写本机存储或导出文件。`,
    }
  }
  return {
    check,
    /**
     * Run `effect` only after consent. Returns whether the effect ran; tests
     * pass a fake storage/file sink to prove a non-consented call is inert.
     */
    async run(action: GuardedLocalAction, effect: () => Promise<unknown> | unknown): Promise<boolean> {
      if (!check(action).allowed) return false
      await effect()
      return true
    },
  }
}

const localActionGate = createLocalActionGate(canInteract)

/** Sync UI guard: refuses (with a short reason) unless the TOS gate is accepted. */
function guardLocalAction(action: GuardedLocalAction): boolean {
  const decision = localActionGate.check(action)
  if (!decision.allowed) {
    console.warn(`[pet] blocked local action before consent: ${action}`)
    showBubble(decision.message)
  }
  return decision.allowed
}

// Feature-flagged hero renderer (Phase 2). Default OFF: the existing folded-paper
// DOM is the only renderer unless `?hero=1` or the persistent localStorage opt-in
// is set; any load/pack/first-frame failure falls back to that DOM (one direction,
// no save writes, no localStorage writes). See docs/PET-HERO-INTEGRATION.md.
const HERO_CONFIG = resolveHeroConfig({
  search: typeof location !== 'undefined' ? location.search : '',
  storage: (() => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
      return null
    }
  })(),
})

// ---------------------------------------------------------------------------
// Hero page controller (E10 MB-100, task-116)
// ---------------------------------------------------------------------------
// The hero canvas scene, character-pack hot switch/restore and the pet-window
// position now live in `hero-page.ts` (importable from Node). This page keeps
// HERO_CONFIG and injects the pointer/kernel/audio seams that stay here; the
// content runtime receives the renderer wiring below.
const heroPage = createHeroPage({
  document,
  window,
  config: HERO_CONFIG,
  hasTauri: HAS_TAURI,
  contentShell: CONTENT_SHELL,
  reportFailure,
  storageBoundary, applyRemoteBuiltinRenderer: (choice) => contentRuntimeApi.applyBuiltinRendererLocally(choice),
  onPat: (actorId) => doPat(actorId),
  onRegionTouch: (actorId, reaction) => doHeroRegionTouch(actorId, reaction),
  onEnsureAudio: () => {
    ensureAudio()
    void audioContext?.resume()
  },
  // C1 待机节奏: the live plan is resolved below (persisted cadence + quiet hours
  // + 一起工作 + Advisers pose) and re-applied by hero-page once a second.
  resolveAmbientRhythm: () => currentIdleRhythm(),
  restoreActiveCharacterPack: () => contentRuntimeApi.restoreActiveCharacterPack(),
})
const now = (): number => Date.now()

let state: PetState = createPet(now())
let bubbleTimer: ReturnType<typeof setTimeout> | null = null
let mouthTimer: ReturnType<typeof setTimeout> | null = null

// ---------------------------------------------------------------------------
// 待机节奏 / 一起工作 live state (C1 2026-11-21)
// ---------------------------------------------------------------------------
// ambientCadence is a persisted cross-restart preference (localStorage);
// workSession is session-scoped (sessionStorage: survives a page reload, ends
// with the app window) and is never written to the save archive — no history,
// no streak days, no penalty. The Advisers pose flag is memory-only and
// self-expires (pose events are deduped per day, so an idle event may never
// arrive to clear it).
let ambientCadence: AmbientCadence = readAmbientCadence()
let workSession: WorkSession | null = readWorkSession()
let workSessionTimer: ReturnType<typeof setTimeout> | null = null
/** working/waiting have no matching clip, so a pose only lowers the cadence. */
const ADVISERS_POSE_QUIET_MS = 5 * 60_000
let advisersQuietUntilMs = 0

// Pet TTS voice preference (default `stella`; setup page writes
// `desktop-games/pet/voice`). Read through safe-storage, so missing/blocked/
// corrupt storage keeps the baked default instead of an invalid voice.
let currentVoice: TtsVoiceId = readVoicePref()
/** Provider/mode half of the TTS config signature; the voice is appended below. */
let ttsProviderMode = '预生成/系统 TTS · AI 合成'

let voice = new VoiceService({
  providers: [new SystemVoiceProvider(), new MockVoiceProvider()],
  dailyCharBudget: 1200,
  maxCharsPerLine: 120,
  rateLimit: limits.tts,
  onSubtitle: (text) => showBubble(text),
})

// If Rust has DEEPSEEK_API_KEY, prefer proxied TTS; otherwise stay on system/mock.
if (HAS_TAURI) {
  void (async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const status = await invoke<{ hasKey: boolean }>('voice_status')
      if (status.hasKey) {
        ttsProviderMode = '预生成 + 云端 TTS（Rust 代理） · AI 合成'
        renderVoiceMode()
        voice = new VoiceService({
          providers: [
            createTauriDeepSeekProvider(),
            new SystemVoiceProvider(),
            new MockVoiceProvider(),
          ],
          dailyCharBudget: 1200,
          maxCharsPerLine: 120,
          rateLimit: limits.tts,
          onSubtitle: (text) => showBubble(text),
        })
      }
    } catch (error) {
      // Cloud TTS stays off; the offline providers are still usable.
      reportFailure(voiceBoundary, error)
    }
  })()
}

const lines = {
  pat: ['嗯。', '再摸一下也可以。', '你的手有点凉。', '我记得你。'],
  give: ['这张纸，我要了。', '折角又多了一点。', '可以把它夹进书里吗？'],
  fold: ['看，一只小东西。', '折痕会记住今天。', '还差一张纸。'],
  // Low-disturbance copy (PSY-P1-7/Q-04): idle lines never claim the pet is
  // waiting / keeping a light on. Runtime ambient lines also pass through
  // filterProactiveLine below.
  idle: ['书页在响。', '风翻到下一页。', '嗯。'],
  rename: ['新名字？我会记住的。', '嗯，这样叫我。'],
}

function pick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)] ?? list[0]!
}

function showBubble(text: string): void {
  const bubble = $('bubble')
  // Final display guard: bubbles are short, plain text, always via textContent.
  // #bubble-text is the copy line; #bubble-ai (MB-076) is a separate visible
  // attribution line managed by aiLabel, so the bubble stays the one anchor.
  const safeBubbleText = sanitizePlainText(text, { maxChars: SECURITY_LIMITS.bubbleChars, allowNewlines: false })
  const bubbleText = document.getElementById('bubble-text')
  if (bubbleText) bubbleText.textContent = safeBubbleText
  else bubble.textContent = safeBubbleText
  bubble.classList.toggle('thought', heroPage.currentCharacterBubbleSemantic() === 'thought')
  bubble.classList.add('show')
  aiLabel.clear()
  if (bubbleTimer) clearTimeout(bubbleTimer)
  bubbleTimer = setTimeout(() => {
    bubble.classList.remove('show')
    aiLabel.clear()
  }, 3200)
}

/**
 * Keep the subtitle/attribution bubble up for the real TTS duration (MB-076):
 * the old fixed 3.2s window hid the visible "AI 语音 · 合成" label while longer
 * clips were still speaking. Interaction-only bubbles keep the 3.2s default.
 */
function keepBubbleForTts(durationMs: number): void {
  const bubble = $('bubble')
  bubble.classList.add('show')
  if (bubbleTimer) clearTimeout(bubbleTimer)
  const holdMs = Math.max(3200, Number.isFinite(durationMs) ? Math.min(60_000, durationMs) : 3200)
  bubbleTimer = setTimeout(() => {
    bubble.classList.remove('show')
    aiLabel.clear()
  }, holdMs)
}

let audioContext: AudioContext | null = null
let audioGain: GainNode | null = null
let currentSource: AudioBufferSourceNode | null = null
function ensureAudio(): void {
  if (!audioContext) {
    audioContext = new AudioContext()
    audioGain = audioContext.createGain()
    audioGain.gain.value = Math.max(0, Math.min(1, settingsPage.volume / 100))
    audioGain.connect(audioContext.destination)
  }
}
async function playClipAudio(audio: ArrayBuffer): Promise<void> {
  try {
    ensureAudio()
    if (!audioContext || !audioGain) return
    if (audioContext.state === 'suspended') await audioContext.resume()
    const buffer = await audioContext.decodeAudioData(audio.slice(0))
    currentSource?.stop()
    const source = audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(audioGain)
    source.start()
    currentSource = source
  } catch (error) {
    // Decode/playback failures must not silently drop: log once, keep the subtitle.
    reportFailure(ttsBoundary, error)
  }
}

/**
 * Human-readable TTS config signature.
 *
 * Enabling/altering TTS (mute state, provider/mode label, volume) must re-trigger
 * the separate TTS declaration; a new session naturally re-prompts because the
 * gate confirmation is memory-only. The selected voice is part of `mode`, so
 * switching stella<->tide changes this signature and forces a fresh TTS
 * declaration; the persisted voice preference / TOS acceptance can never count
 * as that confirmation.
 */
function voiceModeLabel(): string {
  return formatVoiceModeLabel(ttsProviderMode, currentVoice)
}

/** Render the #voice-mode badge/tooltip for the currently selected voice. */
function renderVoiceMode(): void {
  const element = document.getElementById('voice-mode')
  if (!element) return
  element.textContent = `语音：${voiceModeLabel()}`
  element.title = '音色可在「设置 → 音色」切换；AI 合成语音，请以字幕为准'
}

function currentTtsConfig(): string {
  // Single persisted volume source (settings page, E10 task-121); the signature
  // text is unchanged so a mute/volume change still re-triggers the declaration.
  const volume = settingsPage.volume
  return ttsConfigSignature({ muted: state.muted, mode: voiceModeLabel(), volume })
}

/**
 * Apply a voice preference changed elsewhere (setup page in another same-origin
 * window). Switching voice is a TTS config change: stop audio from the old
 * voice, re-render the badge, and re-show the SEPARATE TTS declaration. It is
 * never auto-accepted, and a TOS acceptance is never read as a waiver. While
 * muted/read-only the next synthesis prompts instead of playing.
 */
function applyVoicePreference(next: TtsVoiceId): boolean {
  if (!isTtsVoiceId(next) || next === currentVoice) return false
  currentVoice = next
  try {
    voice.stop()
  } catch (error) {
    reportFailure(voiceBoundary, error)
  }
  renderVoiceMode()
  if (!canInteract() || state.muted) return true
  void requestTtsConfirmation(currentTtsConfig()).catch((error) => reportFailure(ttsBoundary, error))
  return true
}

// The setup page writes the preference in another same-origin window; this keeps
// an already-open pet window in sync and re-prompts the TTS declaration there.
window.addEventListener('storage', (event) => {
  if (event.key !== VOICE_PREF_STORAGE_KEY) return
  applyVoicePreference(readVoicePref())
})

/**
 * Re-read the persisted preference before speaking (cheap) so a host that does
 * not deliver cross-window `storage` events can never speak with a stale voice:
 * a changed voice changes `currentTtsConfig()`, so the TTS gate below re-prompts
 * instead of silently reusing the old confirmation.
 */
function refreshVoicePreference(): boolean {
  const stored = readVoicePref()
  if (stored === currentVoice) return false
  currentVoice = stored
  renderVoiceMode()
  return true
}

/** Re-sync when the pet window is focused/visible again (same-origin setup page). */
function syncVoicePreference(): void {
  applyVoicePreference(readVoicePref())
}
window.addEventListener('focus', syncVoicePreference)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncVoicePreference()
})

/**
 * Human-readable ASR config signature. The separate ASR declaration is
 * confirmed per (session, config); the TOS acceptance and the TTS declaration
 * are never read here. A new session naturally re-prompts because the gate
 * confirmation is memory-only.
 */
function currentAsrConfig(): string {
  return asrConfigSignature({
    provider: 'deepseek',
    maxSeconds: Math.round(MAX_TALK_MS / 1000),
    maxWavBytes: MAX_WAV_BYTES,
  })
}

/**
 * Fire-and-forget speech helper: every async failure is reported through the
 * TTS boundary instead of becoming an unhandled rejection.
 */
function sayLater(
  text: string,
  emotion: 'calm' | 'happy' = 'calm',
  kind: DialogueLineKind = 'interactive',
): void {
  // Content-center dialogue policy: `brief`/`quiet` clamp interaction lines
  // (shorter bubbles), `quiet` additionally suppresses automatic/ambient lines.
  // Explicit errors/notices use showBubble directly, so this policy can never
  // hide a failure or a safety/consent prompt.
  let line = text
  if (kind === 'ambient') {
    // MB-070: while quiet hours are active, no proactive/ambient line is emitted
    // at all (user-triggered replies still go through normally).
    if (quietHoursActive()) return
    // MB-075: waiting/guilt/soft-dependency hints never reach ambient output;
    // a legacy line is replaced with a neutral one instead of being shown.
    const filtered = filterProactiveLine(line)
    if (!filtered.allowed) return
    line = filtered.text
  }
  const decision = decideDialogueLine(dialogueBehavior, kind, line)
  if (!decision.show || decision.text === null) return
  void say(decision.text, emotion).catch((error) => reportFailure(ttsBoundary, error))
}

/**
 * Speak/display one local line. Returns true when the line was displayed (and
 * maybe spoken), false when the existing safety/TTS gate refused it outright —
 * `createComposerController` uses that to avoid claiming a refused local reply
 * succeeded. Callers that ignore the value keep the previous behaviour.
 */
async function say(text: string, emotion: 'calm' | 'happy' = 'calm'): Promise<boolean> {
  if (verifyUtterance(text, { capabilities: [] }).length > 0) text = SAFE_REFUSAL
  // SAFETY BEFORE DISPLAY/TTS: assertSafeForTts() reviews the line (template copy
  // or any future model/memory text) and caps the spoken text at 120 chars. When
  // it blocks/refuses, only the short refusal copy is shown: no TTS, no long
  // text, no mouth animation, no consent prompt. Unknown gate failures are
  // fail-closed by trust.prepareSpeech() and logged via its boundary.
  const prepared = await trust.prepareSpeech(text)
  if (!prepared.ok) {
    showBubble(prepared.message)
    return false
  }
  const safeText = prepared.text
  showBubble(safeText)
  // MB-076: every AI reply carries a visible attribution next to the bubble
  // (the About panel alone is not visible at the moment of encounter).
  aiLabel.markReply(AI_REPLY_LABEL)
  // Cat/dog personas never receive DeepSeek TTS: thought bubble only.
  if (!heroPage.currentCharacterCanVoice()) return true
  // Hero hook: tag-based talk cue + expression/mouth QA envelope. The pixel
  // renderer's setExpression/setMouth are still no-ops (documented limitation);
  // voice/subtitles above stay on the unchanged path.
  heroPage.speak({ text: safeText, emotion, durationMs: Math.max(260, safeText.length * 120) })
  const pet = $('pet')
  const animateMouth = (ms: number): void => {
    pet.classList.add('talking')
    if (mouthTimer) clearTimeout(mouthTimer)
    mouthTimer = setTimeout(() => pet.classList.remove('talking'), Math.max(260, ms))
  }
  if (state.muted) {
    animateMouth(safeText.length * 120)
    return true
  }
  // TTS declaration gate: separate from the TOS, per session/config, and it must
  // be confirmed before ANY synthesised voice is played. Declining keeps the
  // subtitle/mouth animation only; nothing is played.
  if (!canInteract()) {
    animateMouth(safeText.length * 120)
    return true
  }
  // Never speak with a stale voice after a setup-page change: re-read the
  // persisted preference. A change alters currentTtsConfig(), so the gate below
  // still re-prompts the TTS declaration instead of reusing the old one.
  refreshVoicePreference()
  let ttsConfirmed = false
  try {
    ttsConfirmed = await requireTtsConsent(currentTtsConfig())
  } catch (error) {
    reportFailure(ttsBoundary, error)
    ttsConfirmed = false
  }
  if (!ttsConfirmed) {
    animateMouth(safeText.length * 120)
    return true
  }
  // P1-4: mirror the TTS declaration confirmation into the host before any
  // cloud synthesis; `voice_synthesize` rejects unconfirmed direct invocations.
  await grantHostVoiceConsent('tts')
  try {
    const clip = await voice.speak({ text: safeText, persona: 'pagefold', emotion, priority: 'bark', voice: currentVoice })
    // MB-076: switch the same label to the AI-voice copy while audio plays; it
    // falls back to the reply attribution when the clip ends.
    aiLabel.markVoice(clip.durationMs)
    // Keep the bubble (and therefore the visible AI-voice attribution) up for
    // the whole clip, not just the 3.2s subtitle window.
    keepBubbleForTts(clip.durationMs)
    if (clip.audio) await playClipAudio(clip.audio)
    animateMouth(clip.durationMs)
  } catch (error) {
    animateMouth(safeText.length * 120)
    // Subtitle already shown. Rate limits/cache/toolchain noise are expected and
    // not logged; real provider failures are logged (never swallowed).
    if (!(error instanceof RateLimitError)) reportFailure(ttsBoundary, error)
  }
  return true
}

// ---------------------------------------------------------------------------
// V1 typed input: host wiring for the same-window composer
// (PET-INPUT-OUTPUT-DESIGN-2026-11-17 §2/§3)
//
// Honest capability boundary (also stated in the composer copy and the audit
// report): the current build has NO free LLM / chat-completion call site and NO
// Advisers write path. Typed input is routed locally only:
// - `提醒我…` / `记一笔…` / `待办…` -> session-memory result card draft (never
//   persisted, never written to Advisers, no system reminder/background task);
// - `说一句…` / ordinary text -> the existing local `say()` templates/echo,
//   which keeps the TTS safety gate;
// - everything is reviewed by the same audited input gate as ASR first.
// No external fetch happens on this path, and the desktop-shell composer
// controller never touches Advisers/save/storage APIs.
// ---------------------------------------------------------------------------
let typedInput: ComposerController | null = null

/** Lazy so the first build happens only after the consent runtime exists. */
function ensureTypedInput(): ComposerController | null {
  if (typedInput) return typedInput
  try {
    typedInput = createComposerController({
      document,
      canInteract,
      // The existing audited gate (no bypass, no network): blocked input is
      // refused before any local routing or say() call.
      reviewInput: (text) => trust.reviewUserInputForForwarding(text),
      // Existing local template/echo path; its TTS safety gate still applies.
      say: (line) => say(line),
      showBubble,
      onError: (error) => reportFailure(uiBoundary, error),
    })
    return typedInput
  } catch (error) {
    reportFailure(uiBoundary, error)
    return null
  }
}

/** Menu/keyboard entry supplied to `initDesktopShell` (same window, no resize). */
function openTypedInput(): void {
  ensureTypedInput()?.open()
}

function render(): void {
  const hour = new Date().getHours()
  document.body.dataset.time = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'day' : 'evening'
  $('pet-name').textContent = state.name
  $('bond').textContent = `羁绊 ${state.bond}`
  $('paper').textContent = `纸片 ${state.paper}`
  $('folded').textContent = `折物 ${state.folded}`
  const schedule = petSchedule(Date.now())
  $('schedule').textContent = `它现在：${schedule.label} · ${petMood(state)}`
  $('pet').dataset.phase = schedule.phase
  $('pet').classList.toggle('happy', state.bond >= 8 || state.folded >= 2)
  $('pet').classList.toggle('sleepy', hour >= 23 || hour < 6)
  $('mute').textContent = state.muted ? '有声' : '静音'
  heroPage.syncRenderState({
    happy: state.bond >= 8 || state.folded >= 2,
    sleepy: hour >= 23 || hour < 6,
    muted: state.muted,
    night: hour >= 23 || hour < 6,
  })
  const list = $('memories')
  list.replaceChildren()
  // Defensive read: a corrupt/legacy state must never crash render (P0-3).
  const memoryItems = Array.isArray(state.memory?.items) ? state.memory.items : []
  const activeMemories = memoryItems.filter((item) => item.status === 'active')
  for (const memory of [...activeMemories].reverse().slice(0, 5)) {
    const row = document.createElement('div')
    row.textContent = `· ${memory.text}`
    list.appendChild(row)
  }
}

// ---------------------------------------------------------------------------
// Role & content center runtime + independent content/settings window runtime
// (E10 MB-100, task-102)
//
// The runtime itself now lives in `content-runtime.ts` (no CSS import, no
// module-level DOM) so Node tests can import it: this page injects the same
// boundaries, voice/render lifecycle and save/greet callbacks it used before
// the split. content-library/content-hub are untouched.
// ---------------------------------------------------------------------------
/** Active dialogue policy for sayLater/pickSays (null = catalog not loaded yet). */
let dialogueBehavior: DialogueBehavior | null = null

// ---------------------------------------------------------------------------
// Character-pack renderer wiring (E4 / task-111)
// ---------------------------------------------------------------------------
// The render host + atomic hot swap/restore live in `hero-page.ts`; this page
// injects that wiring into the content runtime. No pack bytes/URLs are exposed
// to installer events (observability carries ids/versions only).

const contentRuntimeApi = createContentRuntime({
  document,
  contentWindow: CONTENT_WINDOW,
  hasTauri: HAS_TAURI,
  heroConfig: HERO_CONFIG,
  characterPackRenderer: heroPage.rendererWiring,
  uiBoundary,
  loadBoundary,
  reportFailure,
  showBubble,
  getCurrentVoice: () => currentVoice,
  applyVoicePreference,
  renderVoiceMode, switchBuiltinHeroCharacter: heroPage.switchBuiltinRenderer,
  setDialogueBehavior: (next) => {
    dialogueBehavior = next
  },
  loadNow,
  render,
})
const {
  ensureContentRuntime,
  openContentHubInWindow,
  openContentHubFromMenu,
  openSettingsInContentWindow,
  requestPetWindowReload,
  closeContentWindow,
  bootContentWindowOnce,
} = contentRuntimeApi

function doPat(actorId?: string): void {
  state = patPet(state, now())
  heroPage.emit('pat', actorId ? { actorId } : {})
  sayLater(pick(lines.pat), 'happy')
  render()
}

/**
 * Data-driven hero tap reaction (regions.json): the head pets, the body
 * stretches/wags, the tail triggers chase_tail, and a non-idle character
 * deliberately does not react. The kernel/bond side effect is shared, but the
 * animation event comes from the region rule so cat/dog/human can differ.
 */
const lastSaysByKey = new Map<string, string>()
/** Action cadence (research: don't turn every click into a vending machine). */
const HERO_ACTION_COOLDOWN_MS = 800
let lastHeroActionAt = 0

/**
 * Random bubble line from a data-driven list, avoiding an immediate repeat for
 * the same region/action (three lines are still a small pool; this makes
 * repeated taps feel responsive instead of stuck on one phrase).
 */
function pickSays(says: readonly string[] | undefined, key: string): string | null {
  // Installed dialogue packs may declare reserved per-key overrides; null means
  // keep the host's data-driven regions.json lines (built-in packs use none).
  const override = dialogueBehavior?.pickLine(key)
  if (override !== null && override !== undefined) {
    lastSaysByKey.set(key, override)
    return override
  }
  if (!says || says.length === 0) return null
  const previous = lastSaysByKey.get(key)
  const pool = says.length > 1 && previous !== undefined ? says.filter((line) => line !== previous) : says
  const line = pool[Math.floor(Math.random() * pool.length)] ?? null
  if (line !== null) lastSaysByKey.set(key, line)
  return line
}

function doHeroRegionTouch(actorId: string, reaction: HeroRegionReaction): void {
  state = patPet(state, now())
  heroPage.emit(reaction.event, { actorId })
  sayLater(pickSays(reaction.says, `${actorId}:${reaction.region}`) ?? pick(lines.pat), 'happy')
  render()
}

function doGive(): void {
  state = givePaper(state, now())
  heroPage.emit('feed', { payload: { item: 'paper' } })
  sayLater(pick(lines.give), 'calm')
  render()
}

function doFold(): void {
  if (state.paper <= 0) {
    sayLater('还差一张纸。', 'calm')
    return
  }
  state = foldPaper(state, now())
  sayLater(pick(lines.fold), 'happy')
  render()
}

function currentHeroMenuActions(): readonly HeroMenuActionItem[] {
  const actions = heroPage.liveRegionActions()
  if (actions.length === 0) return [{ action: 'pat', label: '摸头' }]
  return actions.map((action) => ({ action: action.id, label: action.label }))
}

/**
 * Character-specific hero menu action (dog fetch, cat stretch/run, human paper…).
 * Actions are data from regions.json: event + optional delayed follow-up.
 */
function handleHeroAction(actionId: string): void {
  const runtime = heroPage.getRuntime()
  if (!runtime) return
  const nowMs = performance.now()
  if (nowMs - lastHeroActionAt < HERO_ACTION_COOLDOWN_MS) return
  lastHeroActionAt = nowMs
  const spec = heroPage.liveRegionActions().find((action) => action.id === actionId)
  const steps: readonly { event: string; delayMs: number }[] = spec
    ? [
        { event: spec.event, delayMs: 0 },
        ...(spec.followUpEvent !== undefined
          ? [{ event: spec.followUpEvent, delayMs: spec.followUpMs ?? 0 }]
          : []),
      ]
    : isHeroMenuAction(actionId)
      ? heroActionPlan(actionId)
      : []
  try {
    for (const step of steps) {
      if (step.delayMs <= 0) {
        runtime.emit(step.event)
        continue
      }
      setTimeout(() => {
        if (heroPage.getRuntime() !== runtime) return
        try {
          runtime.emit(step.event)
        } catch (error) {
          reportFailure(uiBoundary, error)
        }
      }, step.delayMs)
    }
    const line = pickSays(spec?.says, `action:${actionId}`)
    if (line) sayLater(line, 'happy')
  } catch (error) {
    // A disposed/misbehaving runtime must not break the menu click handler.
    reportFailure(uiBoundary, error)
  }
}

$('pet').addEventListener('pointerdown', () => {
  ensureAudio()
  void audioContext?.resume().catch((error) => reportFailure(voiceBoundary, error))
})
$('pet').addEventListener('click', () => doPat())
$('pat').addEventListener('click', () => doPat())
$('give').addEventListener('click', doGive)
$('fold').addEventListener('click', doFold)
/** 改名 (E6 MB-066): shared by the legacy aside button and 设置 → 改名…; the per-action full-TOS gate is never exempted by first-run acceptance. */
function renameCharacter(): void {
  void (async () => {
    if (!canInteract()) return
    const allowed = await requireContentConsent({
      action: CONSENT_ACTIONS.characterSettingModify,
      detail: '修改角色名字/设定属于内容修改；每次修改都必须重新阅读完整免责声明并同意。',
    })
    if (!allowed) return
    const name = window.prompt('给它起个名字（最多 8 字）', state.name)
    if (!name) return
    state = renamePet(state, name, now())
    sayLater(pick(lines.rename), 'happy')
    render()
  })().catch((error) => reportFailure(uiBoundary, error))
}
$('rename').addEventListener('click', () => renameCharacter())
const talkRecorder = new TalkRecorder({
  // The TalkRecorder owns the anti-double-click guard and all cleanup paths, so
  // two quick pointerdowns can never create a second MediaRecorder/microphone.
  getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }) as unknown as Promise<MediaStreamLike>,
  createRecorder: (stream) => new MediaRecorder(stream as unknown as MediaStream),
  createAudioContext: () => new AudioContext(),
  transcribe: (wav) => transcribeWav(wav),
  onState: (talkState: TalkState) => {
    $('talk').textContent = talkState === 'listening' ? '松开识别' : '按住说话'
    // E6 MB-066: mirror the hold state on the NEW settings PTT button too, so the
    // relocated control gives the same recording feedback as the legacy button.
    const shellTalk = document.getElementById('pet-settings-talk')
    if (shellTalk) shellTalk.textContent = talkState === 'listening' ? '松开识别' : '按住说话（松开识别）'
    if (talkState === 'listening') heroPage.setExpression('listening')
  },
  onBubble: showBubble,
  onError: (error) => reportFailure(voiceBoundary, error),
  onTranscript: (text) => handleTalkTranscript(text),
})

/**
 * ASR result path. User-input safety gate: review the transcript BEFORE it is
 * displayed, matched against commands or forwarded to a model/TTS. Blocked text
 * is never forwarded; PII is redacted in what we show. The raw transcript is
 * never logged.
 */
async function handleTalkTranscript(rawText: string): Promise<void> {
  const reviewed = await trust.reviewUserInputForForwarding(rawText)
  if (!reviewed.allowed) {
    showBubble(reviewed.message)
    return
  }
  const text = reviewed.text
  showBubble(text)
  if (/名字|叫什么|你是谁/.test(text)) {
    await say(`我叫${state.name}。住在书页折角里。`, 'happy')
  } else if (/晚安|睡吧|休息/.test(text)) {
    // Low-disturbance copy (PSY-P1-7/Q-04): no "light left on / waiting" hint.
    await say('晚安，明天见。', 'calm')
  } else if (/你好|早上好|在吗/.test(text)) {
    // Interactive reply: responsive ("I'm here, go ahead") without promising
    // to keep waiting while the user is away.
    await say('我在。你说。', 'happy')
  } else if (/可爱|喜欢你|乖/.test(text)) {
    state = patPet(state, now())
    await say('……嗯。', 'happy')
    render()
  } else if (/摸|喜欢|好/.test(text)) doPat()
  else if (/纸|给/.test(text)) doGive()
  else if (/折|叠/.test(text)) doFold()
  else await say('我听见了。不过这句话我还不太懂。', 'calm')
}

/** True while the hold-to-talk button is actually pressed (see startTalk). */
let talkPointerDown = false

/**
 * Hold-to-talk entry (environment + full-TOS guards are synchronous).
 * The separate ASR declaration gate runs in `beginTalkWithAsrConsent()` before
 * `TalkRecorder.start()`, which is the ONLY path to `getUserMedia`.
 */
function startTalk(): void {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    showBubble('这个环境不支持录音。')
    return
  }
  if (!canInteract()) {
    showBubble('请先同意完整声明后再使用语音。')
    return
  }
  void beginTalkWithAsrConsent().catch((error) => reportFailure(voiceBoundary, error))
}

/**
 * ASR consent gate before the microphone. ORDER IS A PRIVACY CONTRACT:
 * 1) the separate ASR declaration must be confirmed for the current
 *    session/config — TOS and TTS confirmations never satisfy it;
 * 2) a decline/error keeps the microphone closed and uploads nothing;
 * 3) only then may TalkRecorder.start() call getUserMedia.
 * The first confirmation happens while the button is held; if the user released
 * it to read/confirm, no abandoned recording is started.
 */
async function beginTalkWithAsrConsent(): Promise<void> {
  let asrConfirmed = false
  try {
    asrConfirmed = await requireAsrConsent(currentAsrConfig())
  } catch (error) {
    reportFailure(voiceBoundary, error)
    asrConfirmed = false
  }
  if (!asrConfirmed) {
    showBubble('未同意语音识别单独声明：本次不会录音、不会上传音频。')
    return
  }
  // P1-4: mirror the ASR declaration confirmation so `voice_asr` rejects
  // microphone uploads that never confirmed the declaration.
  await grantHostVoiceConsent('asr')
  if (!talkPointerDown) {
    showBubble('已确认语音识别声明；再次按住说话即可使用。')
    return
  }
  void talkRecorder.start()
}

/** E6 MB-066 hold-to-talk seam shared by the legacy #talk button and 设置 → 按住说话. */
const beginTalkHold = (): void => { talkPointerDown = true; startTalk() }
/** Every release path stops the tracks/timer (TalkRecorder.stop is idempotent). */
const endTalkHold = (): void => { talkPointerDown = false; void talkRecorder.stop() }
$('talk').addEventListener('pointerdown', (event) => {
  event.preventDefault()
  beginTalkHold()
})
;(['pointerup', 'pointercancel', 'lostpointercapture'] as const).forEach((type) => $('talk').addEventListener(type, () => endTalkHold()))
// Track release while the first-run ASR dialog is open (the pointer leaves the
// hold-to-talk button to read/confirm the declaration); see beginTalkWithAsrConsent.
document.addEventListener('pointerup', () => {
  talkPointerDown = false
})
document.addEventListener('pointercancel', () => {
  talkPointerDown = false
})

/** Bound a Tauri IPC round-trip so a hung WebView/Rust call cannot freeze boot/save. */
async function invokeTimed<T>(command: string, args: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`ipc-timeout:${command}`)), timeoutMs)
  })
  try {
    return await Promise.race([invoke<T>(command, args), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Pet archive persistence wiring (E10 MB-012 / E1 MB-011, task-94).
 *
 * The save state machine (envelope, primary/backup recovery, single-flight
 * writes, token bucket, legacy migration, the recovery flag and the 30 s
 * autosave timer) lives in the pure `save-runtime.ts`. `save-host.ts` supplies
 * the platform adapters (Tauri DPAPI/IPC vs WebCrypto/localStorage) and maps
 * failures back to the errors this page always threw; this page only injects
 * the live state closures, the consent gate, the save token bucket and the
 * bubble/report callbacks.
 */
const PET_SAVE_GAME_VERSION = '0.1.0'

/**
 * Last user-input timestamp for the hidden-idle autosave backoff (P0 2026-11-21).
 * The save runtime only throttles its interval tick when both probes say the
 * page is hidden and has been idle for 15 minutes; visibility-hidden saves and
 * explicit saves still write immediately.
 */
let lastPageInteractionAtMs = Date.now()
let pageInteractionProbesWired = false

function lastPageInteractionAt(): number {
  if (!pageInteractionProbesWired) {
    pageInteractionProbesWired = true
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
      document.addEventListener(type, () => {
        lastPageInteractionAtMs = Date.now()
      }, { passive: true })
    }
  }
  return lastPageInteractionAtMs
}

function createPageSaveService(): PetSaveService {
  return createPetSaveService({
    slot: SAVE_SLOT,
    gameVersion: PET_SAVE_GAME_VERSION,
    hasTauri: HAS_TAURI,
    invokeTimed,
    readState: () => state,
    writeState: (next) => {
      state = next
    },
    canInteract,
    rateLimit: limits.save,
    isPageHidden: () => document.visibilityState === 'hidden',
    lastInteractionAt: lastPageInteractionAt,
    // The runtime reports an unavailable cipher at most once per instance and
    // never writes plaintext or a partial save (old saveWarningShown bubble).
    onEncryptUnavailable: () => showBubble('存档加密不可用，这次没有保存。'),
    onAsyncFailure: (_scope, failure) => reportFailure(saveBoundary, saveFailureToError(failure)),
    // A corrupt primary (or a backup-only recovery) must open the actionable
    // four-way panel instead of leaving the user in a read-only bubble. The
    // runtime still owns the flag/autosave pause; this is presentation only.
    onRecoveryNeededChange: (needed) => {
      if (needed) settingsPage.openRecoveryPanel()
    },
  })
}

let saveService = createPageSaveService()

/**
 * A full local-data wipe deletes the archive out-of-band (consent data
 * controls). Recreate the runtime so the in-memory recovery flag is cleared and
 * autosave resumes without touching the already-empty slots (MB-011).
 */
function resetSaveServiceAfterWipe(): void {
  // A full wipe resolves the recovery question out-of-band: close the panel
  // silently (no "稍后处理" bubble) before the fresh runtime starts autosave.
  settingsPage.closeRecoveryPanel('reset')
  saveService.dispose()
  saveService = createPageSaveService()
  if (!CONTENT_SHELL) saveService.startAutosave()
}

/** Save entry shared by the panel button, the desktop menu and settings. */
function saveNow(): Promise<void> {
  return saveService.save()
}

/** Save then purge the `.bak` (memory edits and the portable-import commit). */
function saveAndPurgeBackup(): Promise<void> {
  return saveService.saveAndPurgeBackup()
}

/**
 * Load entry shared by the UI, boot and the QA hook. A pre-consent launch
 * rejects with `consent-required` (the historical contract) before any local
 * read; a missing/corrupt archive resolves false and the runtime's recovery flag
 * tells the UI whether the known-good backup is still protected.
 */
async function loadNow(): Promise<boolean> {
  const loaded = await saveService.load()
  if (loaded) render()
  return loaded
}

/** Save entry shared by the panel button, the desktop menu and settings. */
function saveArchiveWithFeedback(): void {
  void saveNow()
    .then(() => showBubble('记下了。'))
    .catch((error) => {
      if (!(error instanceof RateLimitError)) reportFailure(saveBoundary, error)
      showBubble(toUserMessage(error))
    })
}
/** Load entry shared by the panel button and the desktop menu/settings. */
function loadArchiveWithFeedback(): void {
  if (!guardLocalAction('save-load')) return
  void loadNow()
    .then((ok) => {
      if (ok) return
      // A readable-but-corrupt archive is not "no save yet": the runtime's
      // recovery callback has opened the four-way panel, so do not contradict it.
      showBubble(
        saveService.recoveryNeeded
          ? '存档损坏，已打开恢复面板，请选择下一步。'
          : '还没有旧书页。',
      )
    })
    .catch((error) => {
      reportFailure(loadBoundary, error)
      showBubble(toUserMessage(error))
    })
}
$('save').addEventListener('click', () => saveArchiveWithFeedback())
$('load').addEventListener('click', () => loadArchiveWithFeedback())

// ---------------------------------------------------------------------------
// Pet settings page wiring (E10 MB-100, task-121)
// ---------------------------------------------------------------------------
// The shared volume/mute paths, the desktop settings-dialog callbacks, the
// 复位窗口 entry, the 折页簿 memory screen, the portable-save controls and the
// corrupt-archive recovery panel now live in `settings-page.ts` (importable
// from Node). This page owns the save runtime, the trusted render/say loop and
// the hero window position; those seams are injected below. Scaling (缩放) was
// already extracted into desktop-shell.ts/scaling.ts (E5) and main.ts never
// owned it, so the settings-page callback bundle is exactly the #pet-settings
// dialog's page-side wiring.
const settingsPage = createSettingsPage({
  document,
  window,
  canInteract,
  guardLocalAction,
  reportFailure,
  storageBoundary,
  saveBoundary,
  loadBoundary,
  importBoundary,
  voiceBoundary,
  uiBoundary,
  ttsBoundary,
  showBubble,
  render,
  now,
  getState: () => state,
  setState: (next) => {
    state = next
  },
  hasTauri: HAS_TAURI,
  contentShell: CONTENT_SHELL,
  getSaveService: () => saveService,
  saveNow,
  saveAndPurgeBackup,
  loadNow,
  exitApplication: () => exitApplication(),
  // The settings dialog's TTS re-confirmation is the same audited config gate
  // (the voice/volume are part of the signature, so a change always re-prompts).
  requestTtsConfirmation: () => requestTtsConfirmation(currentTtsConfig()),
  setAudioGain: (gain) => {
    if (audioGain) audioGain.gain.value = gain
  },
  stopVoice: () => voice.stop(),
  getConsentGate,
  clearSavedWindowPosition: () => heroPage.clearSavedWindowPosition(),
})
settingsPage.bind()

// ---------------------------------------------------------------------------
// 待机节奏 / 一起工作 wiring (C1 2026-11-21)
// ---------------------------------------------------------------------------

/**
 * Effective idle-rhythm plan for the live hero scene: persisted level, then
 * quiet hours / a running 一起工作 session / the Advisers pose quiet flag (the
 * calmest wins — see resolveAmbientRhythm in low-disturb.ts).
 */
function currentIdleRhythm(): { readonly intervalMs: readonly [number, number]; readonly states: readonly string[] | null } {
  const nowMs = Date.now()
  const rhythm = resolveAmbientRhythm({
    cadence: ambientCadence,
    quietHoursActive: quietHoursActive(),
    workSessionActive: isWorkSessionActive(workSession, nowMs),
    advisersQuiet: nowMs < advisersQuietUntilMs,
  })
  return { intervalMs: rhythm.plan.intervalMs, states: rhythm.plan.states }
}

/**
 * Advisers pose → quiet flag (no animation). There is no working/waiting clip
 * in the 12-clip set, so the degrade path is explicitly non-animating: it only
 * stops proactive micro-actions for a bounded window (pose events are deduped
 * per day, so waiting for pose=idle could otherwise quiet the pet forever).
 */
function applyAdvisersPose(pose: PetPose): void {
  if (pose === 'idle') {
    advisersQuietUntilMs = 0
    return
  }
  advisersQuietUntilMs = Date.now() + ADVISERS_POSE_QUIET_MS
}

function clearWorkSessionTimer(): void {
  if (workSessionTimer === null) return
  clearTimeout(workSessionTimer)
  workSessionTimer = null
}

/** Re-arm the completion timer for the current session (reload resume path). */
function scheduleWorkSessionCompletion(): void {
  clearWorkSessionTimer()
  const session = workSession
  if (!session) return
  const remaining = workSessionRemainingMs(session, Date.now())
  workSessionTimer = setTimeout(() => {
    workSessionTimer = null
    if (!workSession || workSession.endsAtMs !== session.endsAtMs) return
    if (Date.now() < workSession.endsAtMs) {
      scheduleWorkSessionCompletion()
      return
    }
    finishWorkSession(false)
  }, Math.max(250, remaining))
}

/** Menu entry: start a 25/50 min session (session-scoped, no record). */
function startWorkTogether(minutes: 25 | 50): void {
  workSession = startWorkSession(minutes, Date.now())
  writeWorkSession(workSession)
  scheduleWorkSessionCompletion()
  sayLater(workSessionStartLine(minutes), 'calm')
}

/**
 * End the session. Completion reuses the existing stand_wag clip + neutral rest
 * copy; an early end reuses idle_blink and is not recorded anywhere. Both are
 * user-visible lines, never reward/streak/guilt language.
 */
function finishWorkSession(early: boolean): void {
  if (!workSession) return
  workSession = null
  clearWorkSession()
  clearWorkSessionTimer()
  if (!canInteract()) return
  if (early) {
    heroPage.emit('idle_blink')
    sayLater(WORK_SESSION_CUT_LINE, 'calm')
    return
  }
  heroPage.emit('stand_wag')
  // Completion is automatic, so quiet hours suppress the copy (ambient kind).
  sayLater(WORK_SESSION_DONE_LINE, 'calm', 'ambient')
}

// A reload inside the same app window keeps the remaining session (sessionStorage);
// the timer is re-armed here so completion still fires without a user action.
if (workSession !== null) scheduleWorkSessionCompletion()

// Cross-window cadence changes (设置 dialog opened in the content window) reach
// the pet window through the same-origin storage event; apply it live.
window.addEventListener('storage', (event) => {
  if (event.key !== AMBIENT_CADENCE_KEY) return
  ambientCadence = readAmbientCadence()
})

// The independent content/settings window (MB-062) never autosaves: it may run
// next to the live pet window, and only the pet window owns the archive's
// background writes. Manual 保存/读取 from its reused settings dialog still work.
// The runtime gates every tick on consent and the recovery flag (E1), so the
// interval itself no longer re-implements that policy here.
if (!CONTENT_SHELL) {
  saveService.startAutosave()
}
if (typeof document !== 'undefined' && !CONTENT_SHELL) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    void saveService.autosaveTick('visibility-hidden').then((result) => {
      if (result.ok || !shouldReportSaveFailure(result.reason)) return
      reportFailure(saveBoundary, saveFailureToError(result))
    })
  })
}

let booted = false
let chatImportWired = false

/**
 * Runs only after explicit TOS consent (first run, or a later acceptance from
 * the safe read-only screen). Loads the save, shows the greeting (which may
 * trigger the SEPARATE TTS declaration), then wires the post-consent surfaces
 * (Advisers face, chat-import digest, hero renderer). No save/migration write
 * happens before this, and nothing external is read before this point.
 */
async function bootPetOnce(): Promise<void> {
  if (booted || !canInteract()) return
  booted = true
  // E1 MB-014: one-shot local-state schema migration. This runs only here (after
  // the TOS gate resolved accepted; the consent layer owns every earlier read),
  // never throws, and only normalizes the two documented legacy formats plus
  // the state-schema marker — so it cannot change what the UI shows.
  const stateMigration = migrateFamlingLocalState()
  if (stateMigration.status === 'partial') {
    console.warn(
      '[pet] local state migration incomplete',
      stateMigration.steps.filter((step) => step.status === 'failed').map((step) => step.id),
    )
  }
  // P1 round-1 local-only recorders (post-consent; manual export; clearable).
  initUsageSummary({ canWrite: canInteract }); initCohabitation({ canWrite: canInteract })
  // P1-4: mirror the accepted TOS into the host (Rust) so IPC commands can
  // verify consent; if a `--game=` launch was held at startup, the host opens
  // that window and closes this gate window, so skip the rest of the boot.
  const hostConsent = await syncHostConsent(consentSnapshot())
  if (hostConsent?.launched) return
  // loadNow() may throw (corrupt/unreadable save); never leave the boot chain
  // unhandled or boot a half-rendered pet (P0-2).
  const loaded = await loadBoundary.guardAsync(() => loadNow())
  if (!loaded.ok || saveService.recoveryNeeded) {
    // The recovery panel is the actionable surface (opened by the save runtime's
    // onRecoveryNeededChange). Keep a bubble only as the fallback when the panel
    // cannot be shown; both paths keep autosave paused so a corrupt archive is
    // never silently overwritten.
    if (!settingsPage.isRecoveryPanelVisible()) {
      showBubble(
        !loaded.ok
          ? saveService.recoveryNeeded
            ? '存档损坏，已保留备份：可在「更多 → 保存」写入新档，或「更多 → 读取」重新打开恢复面板；期间不会自动覆盖旧档。'
            : '旧存档没读出来，先用默认状态。'
          : '已从备份恢复：可在「更多 → 保存」写入新档，收回损坏的主档。',
      )
    }
  }
  if (!loaded.ok || !loaded.value) {
    state = createPet(now())
    render()
    sayLater('你来了。', 'calm', 'ambient')
  } else {
    const away = now() - state.lastSeenMs
    state = { ...state, lastSeenMs: now() }
    render()
    if (away > 60 * 60 * 1000) {
      sayLater('你回来了。书页翻到你上次那页。', 'happy', 'ambient')
    } else {
      const memoryItems = Array.isArray(state.memory?.items) ? state.memory.items : []
      const activeMemories = memoryItems.filter((item) => item.status === 'active')
      const last = activeMemories.at(-1)
      const canRecall = canRecallMemory(state, now())
      if (canRecall && last && activeMemories.length > 2) {
        state = markMemoryRecalled(state, now())
        sayLater(`我还记得：${last.text}`, 'calm', 'ambient')
        void saveNow().catch((error) => {
          if (!(error instanceof RateLimitError)) reportFailure(saveBoundary, error)
        })
      } else {
        const hour = new Date().getHours()
        // Night copy is low-arousal and does not claim to leave a light on for
        // the user; quiet hours suppress this ambient line entirely.
        sayLater(
          hour >= 23 || hour < 6
            ? '……这么晚还在呀。早点休息，明天见。'
            : hour < 12
              ? '早。今天书页很轻。'
              : '你忙你的。',
          'calm',
          'ambient',
        )
      }
    }
  }
  // P1-3: Advisers reads a local brief file, so the face is initialised only
  // AFTER the bootstrap consent resolves accepted (never at module/startup time).
  initAdvisersAfterConsent()
  if (!chatImportWired) {
    chatImportWired = true
    initChatImport()
  }
  render()
  // One-time menu coach (E-01): request it here because a stored-acceptance
  // launch never shows a consent overlay (first-run launches are also handled
  // by the desktop shell's overlay-close listener). Gated internally: it only
  // shows after consent and marks itself as seen.
  requestMenuCoach()
  await heroPage.startPage()
}

renderVoiceMode()
render()
if (HAS_TAURI && !CONTENT_SHELL) startHitRegionSync()
if (!CONTENT_SHELL) startDesktopShellLayout()
;(window as any).__pet = {
  get state() { return state },
  render,
  saveNow,
  // Voice preference surface (read-only; changing it still requires the TTS
  // declaration re-confirmation through the normal gate). QA/console only.
  voice: {
    preference: (): TtsVoiceId => currentVoice,
    storageKey: VOICE_PREF_STORAGE_KEY,
    ttsConfig: (): string => currentTtsConfig(),
  },
  // Content-center surface (task-50): read-only selection/dialogue/installed
  // metadata plus the same gate-checked open path as the desktop menu. There is
  // no write bypass here; selection still goes through the panel callbacks.
  content: {
    selection: () => contentRuntimeApi.getContentRuntime()?.selection ?? null,
    dialoguePack: (): string | null => dialogueBehavior?.packId ?? null,
    installedPacks: () => contentRuntimeApi.getContentRuntime()?.installedPacks.length ?? 0,
    // The QA/console surface keeps the historical in-window panel so existing
    // E2E probes stay inside the pet page; the user-facing menu opens the
    // independent window (MB-062).
    open: (): void => {
      void openContentHubInWindow().catch((error) => reportFailure(uiBoundary, error))
    },
  },
  // P1-2: the QA/console hook is NOT an exemption. State-mutating entries are
  // funnelled through the same consent gate as the UI handlers (and there is no
  // dev/QA bypass flag); a pending/read-only pet gets a refusal, not a load.
  loadNow: async (): Promise<boolean> => (guardLocalAction('qa-load') ? loadNow() : false),
  say: async (text: string, emotion: 'calm' | 'happy' = 'calm'): Promise<void> => {
    if (!guardLocalAction('qa-say')) return
    await say(text, emotion)
  },
  // Read-only consent/audit surface for QA + the About panel (the gate itself is
  // not bypassable from here: all actions still go through the explicit modal).
  consent: {
    snapshot: consentSnapshot,
    audit: readConsentAudit,
    requireContent: requireContentConsent,
    requestTts: requestTtsConfirmation,
    about: openAboutPanel,
    // Data controls (P0 R-P0-06): read-only views here; every destructive or
    // privacy action still opens the same explicit 2-step modal. There is no
    // QA bypass, and no data is deleted until both confirmations return true.
    withdraw: requestWithdrawConsent,
    deleteAll: requestDeleteAllLocalData,
    clearConsentAudit: requestClearConsentAudit,
    safetyAudit: readSafetyAudit,
    safetyAuditPersistence,
    safetyAuditLimit: () => getSafetyAuditLedger().limit,
    clearSafetyAudit: requestClearSafetyAudit,
    exportSafetyAudit: requestExportSafetyAudit,
  },
  // Additive QA surface: existing keys above keep their behaviour; `hero` is
  // the only new top-level key (flag/start status), see docs/PET-HERO-INTEGRATION.md.
  hero: heroStatus(HERO_CONFIG, null),
  // C1 read-only interaction truth: the same plan hero-page.ts applies.
  idleRhythm: {
    cadence: (): AmbientCadence => ambientCadence,
    effective: () => currentIdleRhythm(),
    workSession: () =>
      workSession === null
        ? null
        : { minutes: workSession.minutes, remainingMs: workSessionRemainingMs(workSession, Date.now()) },
  },
  // Character-pack hot-switch truth (E4 / task-111): renderer truth only.
  characterPack: {
    rendered: () => heroPage.activePackIdentity(),
    kind: () => heroPage.activePackKind(),
    scene: () => heroPage.scene(),
    restore: () => contentRuntimeApi.restoreActiveCharacterPack(),
    sync: () => contentRuntimeApi.syncCharacterPackAppearance(),
  },
  qa: {
    serialize: () => serializePet(state),
    restore: (plain: string) => {
      // QA restore replaces state (and can bypass import audit via console), so
      // it is refused before explicit TOS consent: no memory/state mutation at
      // all, not even in-memory.
      if (!guardLocalAction('qa-restore')) return false
      // QA restore is an untrusted-JSON entry: deserializePet validates, and a
      // bad snapshot must not crash the page or half-replace the state.
      const restored = loadBoundary.guardSync(() => deserializePet(plain))
      if (!restored.ok) {
        showBubble('存档格式不对，已忽略。')
        return false
      }
      state = restored.value
      render()
      settingsPage.renderMemoryBook()
      return true
    },
    exportPortable,
    importPortable,
    saveEngine: () => (HAS_TAURI ? 'dpapi' : 'webcrypto'),
    heroSnapshot: () => heroPage.snapshot(),
    /** Manual/QA event hook (also the future Pet Brief consumer entry: `remind`). */
    heroEmit: (event: string, actorId?: string) => heroPage.emit(event, actorId ? { actorId } : {}),
  },
}

// ---------------------------------------------------------------------------
// Pet-window placement (E10 MB-100, task-116)
// ---------------------------------------------------------------------------
// Persisted position: restore once on boot, save after a header drag and on
// unload. Moved to `hero-page.ts`; pet window only (never the content window).
heroPage.installWindowLayout()

const ADVISERS_MODE_KEY = 'desktop-games/pet/advisers-mode'
let advisersFace: AdvisersFaceController | null = null
let advisersInitialized = false

/** Short safe copy used when an external brief string cannot be displayed. */
export const ADVISERS_PANEL_SAFE_FALLBACK = '这条内容我先不展示了。'

/**
 * Review every external pet-brief/model string BEFORE it enters the details
 * panel DOM. The review function is injected (production:
 * `trust.reviewModelOutputForDisplay`) so the fail-closed matrix is testable:
 * a rejected review yields only the short refusal message, and a throwing
 * review yields the generic safe fallback — the original text is never shown.
 */
export function createBriefTextReviewer(
  review: (text: string) => Promise<{ allowed: boolean; displayText: string; message: string }>,
) {
  return async (items: readonly string[]): Promise<{ lines: string[]; blocked: boolean }> => {
    const lines: string[] = []
    let blocked = false
    for (const item of items) {
      try {
        const reviewed = await review(item)
        if (reviewed.allowed && reviewed.displayText) {
          lines.push(reviewed.displayText)
        } else {
          blocked = true
          lines.push(reviewed.message || ADVISERS_PANEL_SAFE_FALLBACK)
        }
      } catch {
        blocked = true
        lines.push(ADVISERS_PANEL_SAFE_FALLBACK)
      }
    }
    return { lines, blocked }
  }
}

const reviewBriefTexts = createBriefTextReviewer((text) => trust.reviewModelOutputForDisplay(text))

/**
 * P1-3: Advisers is a local external-data read, so the face (status line,
 * persisted toggle read, brief polling) is created only from the post-consent
 * boot path — never during module init or before `bootstrapConsent()` resolves
 * accepted. Idempotent so a retried boot does not double-wire the DOM hooks.
 */
function initAdvisersAfterConsent(): void {
  if (advisersInitialized || !canInteract()) return
  advisersInitialized = true
  initAdvisersFace()
}

function initAdvisersFace(): void {
  const button = document.getElementById('advisers-toggle') as HTMLButtonElement | null
  const statusEl = document.getElementById('advisers-status') as HTMLButtonElement | null
  if (!button || !statusEl) return
  const retryEl = document.getElementById('advisers-retry') as HTMLButtonElement | null
  const panel = document.getElementById('advisers-panel')
  const panelMeta = document.getElementById('advisers-meta')
  const panelSections = document.getElementById('advisers-sections')
  const closeButton = document.getElementById('advisers-close') as HTMLButtonElement | null

  // displayPolicy UI privacy (contract v0.2, 2026-11-17). The badge/policy-note
  // nodes are created here because pet.html is a frozen shell contract; they
  // only ever receive fixed policy copy (never brief text, counts or paths).
  const panelTitle = panel?.querySelector('.advisers-head > div') ?? null
  const policyBadge = document.createElement('span')
  policyBadge.id = 'advisers-policy-badge'
  policyBadge.className = 'advisers-policy-badge'
  policyBadge.hidden = true
  panelTitle?.append(policyBadge)
  const policyNote = document.createElement('p')
  policyNote.id = 'advisers-policy-note'
  policyNote.className = 'note advisers-policy-note'
  policyNote.hidden = true
  panelMeta?.after(policyNote)

  /**
   * Remove every brief-derived string from the panel BEFORE it is hidden:
   * `hidden` alone leaves the reviewed text in the DOM for screenshots/OCR and
   * devtools, and this panel must not persist anything (no localStorage).
   */
  const clearPanelContent = (): void => {
    panelSections?.replaceChildren()
    if (panelMeta) panelMeta.textContent = ''
    policyBadge.hidden = true
    policyBadge.textContent = ''
    delete policyBadge.dataset.policy
    delete policyBadge.dataset.source
    policyNote.hidden = true
    policyNote.textContent = ''
    if (panel) {
      delete panel.dataset.policy
      delete panel.dataset.policySource
    }
  }

  const privacyNoticeFor = (reason: AdvisersPanelHideReason): string | null => {
    switch (reason) {
      case 'auto-timeout': return ADVISERS_AUTO_HIDDEN_NOTICE
      case 'window-blur': return ADVISERS_BLUR_HIDDEN_NOTICE
      case 'visibility-hidden': return ADVISERS_VISIBILITY_HIDDEN_NOTICE
      case 'page-hide': return ADVISERS_PAGE_HIDDEN_NOTICE
      case 'policy-none': return ADVISERS_NONE_CLEARED_NOTICE
      default: return null
    }
  }

  /**
   * Privacy hide: clear the content first, close without stealing focus (a
   * blur/timeout hide must not yank focus back into the app) and surface only a
   * safe content-free notice on the status button title.
   */
  const hideBriefPanel = (reason: AdvisersPanelHideReason): void => {
    clearPanelContent()
    setPanelOpen(false, reason === 'closed')
    const notice = privacyNoticeFor(reason)
    if (notice !== null) statusEl.title = notice
  }

  // Contract v0.2 displayPolicy state machine: private = 30 s auto-hide plus
  // blur/hidden-tab/pagehide hide; public = explicit persistent marker; none =
  // never renderable; missing/unknown = private + warning (never fail-open).
  const privacyGuard = new AdvisersPanelPrivacyGuard({ onHide: hideBriefPanel })

  const applyPolicyChrome = (policyView: AdvisersPanelPolicyView): void => {
    policyBadge.hidden = false
    policyBadge.textContent = policyView.badge
    policyBadge.dataset.policy = policyView.policy
    policyBadge.dataset.source = policyView.source
    policyBadge.title = policyView.warning ?? policyView.note
    policyNote.textContent = policyView.warning
      ? `${policyView.note} ${policyView.warning}`
      : policyView.note
    policyNote.hidden = false
    if (panel) {
      panel.dataset.policy = policyView.policy
      panel.dataset.policySource = policyView.source
    }
  }

  // Single status renderer: text/state/retry all come from the hardened
  // describeAdvisersFaceStatus() hook (via the pure ui-state view). No brief
  // content, no local paths, no duplicated reason->text switch in the shell.
  // The displayPolicy suffix makes explicit `public` visible in the status line
  // and marks an unknown policy coerced to private.
  const render = (status: AdvisersFaceStatus): void => {
    const view = describeAdvisersFaceView(status)
    // `none`/opt-out/disabled/stale/failed statuses invalidate an open panel at
    // once, so no old brief survives a producer-side "do not display" signal.
    privacyGuard.syncStatus(status)
    statusEl.textContent = `${view.text}${describeAdvisersPolicyStatusSuffix(status)}`
    statusEl.dataset.state = view.state
    statusEl.dataset.ok = status.ok ? '1' : '0'
    statusEl.dataset.stale = view.stale ? '1' : '0'
    statusEl.dataset.retryable = view.retryable ? '1' : '0'
    if (status.displayPolicy === undefined) delete statusEl.dataset.policy
    else statusEl.dataset.policy = status.displayPolicy
    statusEl.title = status.displayPolicy === 'public'
      ? '点击查看只读简报（公开显示策略）'
      : view.retryable ? '点击查看只读简报（可重试）' : '点击查看只读简报'
    button.textContent = view.toggleText
    button.setAttribute('aria-pressed', String(view.enabled))
    button.dataset.state = view.enabled ? 'on' : 'off'
    if (retryEl) {
      retryEl.hidden = view.retryLabel === null
      retryEl.disabled = view.retryLabel === null
      retryEl.textContent = view.retryLabel ?? '重试'
    }
  }

  // The aside (and this status button) is display:none in the desktop shell, so
  // closing the panel falls back to the visible menu trigger for focus return.
  const visibleStatusOrTrigger = (): HTMLElement | null => {
    if (statusEl.getClientRects().length > 0) return statusEl
    return document.getElementById('pet-menu-button')
  }
  const setPanelOpen = (open: boolean, restoreFocus = true): void => {
    if (panel) panel.hidden = !open
    statusEl.setAttribute('aria-expanded', String(open))
    if (open) closeButton?.focus()
    else if (restoreFocus) visibleStatusOrTrigger()?.focus()
  }

  const showPanel = async (): Promise<void> => {
    if (!canInteract()) return
    if (!panel || !panelMeta || !panelSections) return
    const view = describeAdvisersFaceView(controller.lastStatus)
    // A producer-side E_TOS_REQUIRED gate means the producer is not writing a
    // valid brief; never re-render a cached brief under it (fail closed), only
    // the fixed re-consent guidance below.
    const producerTosRequired = controller.lastStatus.code === 'PRODUCER_TOS_REQUIRED'
    const brief = producerTosRequired ? undefined : controller.lastBrief
    // TOS/consent is checked above and stays first; displayPolicy then decides
    // whether this panel session may exist and whether it may render content.
    const decision = privacyGuard.open(brief ?? controller.lastStatus)
    applyPolicyChrome(decision.policy)
    if (!decision.visible) {
      // `none`: never open the old panel; make sure no cached text remains.
      clearPanelContent()
      return
    }
    panelSections.replaceChildren()
    if (!brief) {
      // Distinguishable no-data states instead of a click that does nothing:
      // stale/disabled/error are already in view.text, and retry is offered
      // only when the hook says it can help.
      panelMeta.textContent = view.text
      const empty = document.createElement('p')
      empty.className = 'note'
      empty.textContent = view.retryable
        ? '暂无可用简报；可点“重试”重新读取（只读）。'
        : '暂无可用简报（只读）。'
      panelSections.append(empty)
      // Producer-side TOS re-consent (Advisers 0.3.0: pet-brief exits 3 with
      // E_TOS_REQUIRED until TOS v2026.11.3 is accepted again). Fixed guidance
      // copy only: no raw stderr/paths and the pet never accepts for the user.
      if (controller.lastStatus.code === 'PRODUCER_TOS_REQUIRED') {
        for (const line of ADVISERS_PRODUCER_TOS_GUIDANCE_LINES) {
          const guidance = document.createElement('p')
          guidance.className = 'note advisers-tos-guidance'
          guidance.textContent = line
          panelSections.append(guidance)
        }
      }
    } else if (decision.contentBlock === 'stale') {
      // Expired briefs are never re-rendered, even though the controller keeps
      // them cached for status/counts: only a fresh brief may show its text.
      panelMeta.textContent = '已过期 · 简报内容不再展示（可重试）。'
      const empty = document.createElement('p')
      empty.className = 'note'
      empty.textContent = view.retryable
        ? '可点“重试”读取新简报；旧内容已清除。'
        : '旧内容已清除；下一次刷新成功后可再查看。'
      panelSections.append(empty)
    } else {
      const summary = summarizeBrief(brief)
      // P1-3 / P2-4: the brief is external model output. Every free-text item
      // (today title / commitment summary / risk summary) is reviewed BEFORE it
      // is written into the panel; rejected or failed reviews are replaced by
      // the safe short sentence and the raw text is never displayed.
      const today = await reviewBriefTexts(summary.today)
      const commitments = await reviewBriefTexts(
        summary.commitments.map((item) => `${item.who} · ${item.what} · ${item.due} · ${item.risk}`),
      )
      const risks = await reviewBriefTexts(summary.risks.map((item) => `${item.level} · ${item.summary}`))
      // The review is async: a blur/timeout/`none` arriving meanwhile must stop
      // this session instead of opening the panel after the fact.
      if (!canInteract() || !privacyGuard.visible) {
        clearPanelContent()
        return
      }
      const synced = controller.lastStatus.lastSuccessAt
        ? ` · 上次成功 ${new Date(controller.lastStatus.lastSuccessAt).toLocaleTimeString()}`
        : ''
      panelMeta.textContent = `${view.stale ? '已过期 · ' : ''}${summary.counts.today} 今天 · ${summary.counts.commitments} 承诺 · ${summary.counts.risks} 风险 · 生成于 ${new Date(summary.generatedAt).toLocaleString()}${synced}`
      const section = (title: string, items: string[]): void => {
        const h = document.createElement('h3')
        h.textContent = title
        const ul = document.createElement('ul')
        if (items.length === 0) {
          const li = document.createElement('li')
          li.textContent = '（无）'
          ul.append(li)
        } else {
          for (const item of items) {
            const li = document.createElement('li')
            li.textContent = item
            ul.append(li)
          }
        }
        panelSections.append(h, ul)
      }
      section('今天', today.lines)
      section('承诺', commitments.lines)
      section('风险', risks.lines)
    }
    setPanelOpen(true)
  }

  // Private brief content must not survive focus loss, a hidden window/tab or a
  // page hide; public briefs are exempt inside the guard (explicit public may
  // stay). These are the strongest signals a browser/WebView exposes: real
  // screen-share/recording detection needs Electron/Tauri APIs (not wired here,
  // documented as remaining work in the audit report).
  window.addEventListener('blur', () => { privacyGuard.notifyPrivacyEvent('window-blur') })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') privacyGuard.notifyPrivacyEvent('visibility-hidden')
  })
  window.addEventListener('pagehide', () => { privacyGuard.notifyPrivacyEvent('page-hide') })
  // TOS/consent priority: any consent/TOS overlay hides the panel (and its text)
  // before the modal is interactive, independent of displayPolicy.
  document.addEventListener(CONSENT_OVERLAY_EVENT, () => { privacyGuard.close('consent-required') })

  statusEl.addEventListener('click', () => {
    void showPanel().catch((error) => reportFailure(uiBoundary, error))
  })
  closeButton?.addEventListener('click', () => privacyGuard.close('closed'))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel && !panel.hidden) {
      event.preventDefault()
      privacyGuard.close('closed')
    }
  })

  const controller = new AdvisersFaceController({
    // P1-3 defense in depth: the face controller itself also refuses to read
    // the local brief unless the TOS gate is accepted, even if a future caller
    // forgets the post-consent init order.
    isReadAllowed: canInteract,
    // C1 2026-11-21: Advisers uses the user's persisted quiet-hours setting
    // (which can be disabled or moved) instead of a hardcoded 22:00–08:00.
    quietHoursActive: (at: Date) => quietHoursActive(at),
    onDirective: (directive) => {
      // C1: pose has no matching clip (working/waiting), so it degrades to the
      // non-animating quiet flag below instead of driving animation.
      if (directive.pose !== undefined) applyAdvisersPose(directive.pose)
      // Output safety before display: the directive may carry external brief
      // content. Blocked content is replaced by the short refusal copy only.
      void (async () => {
        if (directive.text) {
          const reviewed = await trust.reviewModelOutputForDisplay(directive.text)
          if (!reviewed.allowed) {
            showBubble(reviewed.message)
            return
          }
          showBubble(reviewed.displayText)
          heroPage.speak({ text: reviewed.displayText, emotion: 'calm', durationMs: directive.ttlMs || 4000 })
        }
        if (directive.sourceType === 'commitment.due') heroPage.emit('remind')
      })().catch((error) => reportFailure(trust.boundary, error))
    },
    onStatus: render,
  })
  advisersFace = controller
  retryEl?.addEventListener('click', () => {
    if (!canInteract()) return
    void controller.retry().catch((error) => reportFailure(uiBoundary, error))
  })
  const setEnabled = async (enabled: boolean): Promise<void> => {
    // The toggle persists a local preference; like every other write this is
    // only allowed after the bootstrap TOS acceptance.
    if (!canInteract()) {
      showBubble('先同意完整免责声明再开启 Advisers。')
      return
    }
    const stored = safeSetItem(ADVISERS_MODE_KEY, enabled ? '1' : '0')
    if (stored !== 'ok') reportFailure(storageBoundary, new Error(`advisers-mode-storage-${stored}`))
    if (enabled) await controller.start()
    else controller.stop()
  }
  button.addEventListener('click', () => {
    if (!canInteract()) return
    const enabled = controller.lastStatus.reason === 'disabled' || !controller.enabled
    void setEnabled(enabled).catch((error) => reportFailure(uiBoundary, error))
  })
  // The persisted toggle is only read after consent (see initAdvisersAfterConsent).
  let enabled = false
  if (canInteract()) enabled = safeGetItem(ADVISERS_MODE_KEY) === '1'
  if (enabled) void controller.start().catch((error) => reportFailure(uiBoundary, error))
  else render(controller.lastStatus)
  ;(window as any).__petAdvisers = {
    get status() { return controller.lastStatus },
    sync: () => (canInteract() ? controller.sync() : Promise.resolve(controller.lastStatus)),
    retry: () => (canInteract() ? controller.retry() : Promise.resolve(controller.lastStatus)),
    stop: () => controller.stop(),
  }
}

function initSetupNotice(): void {
  const notice = document.getElementById('setup-notice')
  if (!notice) return
  const key = 'desktop-games/pet/setup-ack-v1'
  const acknowledged = safeGetItem(key) === '1'
  if (!acknowledged) notice.hidden = false
  document.getElementById('setup-dismiss')?.addEventListener('click', () => {
    notice.hidden = true
    if (!canInteract()) return
    const stored = safeSetItem(key, '1')
    if (stored !== 'ok') reportFailure(storageBoundary, new Error(`setup-ack-storage-${stored}`))
  })
}

function openChatImportPage(): void {
  const opened = window.open('/chat-import.html', '_blank')
  if (!opened) window.location.href = '/chat-import.html'
}

function initChatImport(): void {
  const button = document.getElementById('chat-import')
  button?.addEventListener('click', () => void (async () => {
    if (!canInteract()) return
    // Importing external conversation content is a content action: full TOS each
    // time, no exemption from the first-run acceptance.
    const allowed = await requireContentConsent({
      action: CONSENT_ACTIONS.chatImportOpen,
      detail:
        '导入 DeepSeek 网页分享对话会把外部内容摘要写入本机记忆/设定，并可能产生模型费用；每次导入都必须重新阅读完整免责声明并同意。',
    })
    if (!allowed) return
    openChatImportPage()
  })().catch((error) => reportFailure(uiBoundary, error)))
  // loadDigest() validates every field (title/importedAt/counts/arrays).
  const digest = loadDigest()
  if (!digest) return
  const shownKey = `desktop-games/pet/chat-import-ack/${digest.importedAt.replace(/[^0-9T:+.\-Z]/g, '')}`
  if (safeGetItem(shownKey) === '1') return
  const stored = safeSetItem(shownKey, '1')
  if (stored !== 'ok') reportFailure(storageBoundary, new Error(`chat-import-ack-storage-${stored}`))
  window.setTimeout(() => {
    if (!canInteract()) return
    showBubble(`我记得你之前聊过的 ${digest.topics.length} 个主题。模型融入会产生费用。`)
  }, 1200)
}

/** Lazily mounted local-only report dialog (E12 MB-121); no boot cost/no network. */
let contentReportPanel: ContentReportPanel | null = null
function openContentReportPanel(): void {
  if (!contentReportPanel) contentReportPanel = createContentReportPanel({ document })
  contentReportPanel.open()
}

/** Set the visible About status line (aria-live); used for age rejections too. */
function setAboutNote(text: string): void {
  const note = document.getElementById('about-note')
  if (note) note.textContent = text
}

/**
 * About/statement panel entries + required health/exit entries.
 *
 * 2026-11-17 user decision: roleplay is NOT a public gameplay/selling point and
 * must not be a visible entry. The About panel / desktop menu therefore create
 * no roleplay title, declaration area, start or exit button. The internal
 * gate/flow (`beginRoleplayFlow`/`endRoleplayFlow`, `requireRoleplayConsent`,
 * TOS/legal roleplay provisions) is retained unchanged for safety; the DOM
 * wiring below stays optional-chained so removing the public node can never
 * throw. Anyone adding their own entry is doing so on their own initiative.
 */
function initAboutPanel(): void {
  document.getElementById('about')?.addEventListener('click', () => openAboutPanel())
  document.getElementById('about-close')?.addEventListener('click', () => closeAboutPanel())
  document.getElementById('about-tos-view')?.addEventListener('click', () => openTosViewer())
  // Local-only reporting/takedown entry (E12 MB-121): the dialog never uploads;
  // opening the GitHub form is an explicit click inside the dialog.
  document.getElementById('about-report')?.addEventListener('click', () => openContentReportPanel())
  document.getElementById('about-tts')?.addEventListener('click', () => void requestTtsConfirmation(currentTtsConfig()).catch((error) => reportFailure(ttsBoundary, error)))
  // ASR (microphone upload) has its own declaration/version/hash; TOS and TTS
  // consent never replace it. The About entry can pre-confirm the current config.
  document.getElementById('about-asr')?.addEventListener('click', () => void requestAsrConfirmation(currentAsrConfig()).catch((error) => reportFailure(voiceBoundary, error)))
  document.getElementById('about-memory')?.addEventListener('click', () => {
    closeAboutPanel()
    document.getElementById('memory-book')?.click()
  })
  document.getElementById('about-setup')?.addEventListener('click', () => {
    const opened = window.open('/setup.html', '_blank')
    if (!opened) window.location.href = '/setup.html'
  })
  // INTERNAL ONLY (public element intentionally absent from pet.html): the
  // optional chain is a no-op today. If a future/authorised surface re-creates
  // the hidden node, it still goes through the same gate. D6 (2026-11-20):
  // the age self-report is collected AT THIS age-gated entry (never at first
  // launch); a decline/`age-required` or a minor result opens no roleplay
  // form. Every start/settings change re-prompts the full TOS + roleplay
  // declaration and re-fills the form; TOS/TTS/ASR never substitute for it.
  document.getElementById('about-roleplay')?.addEventListener('click', () => {
    void beginRoleplayFlow().catch((error) => reportFailure(uiBoundary, error))
  })
  document.getElementById('about-roleplay-exit')?.addEventListener('click', () => endRoleplayFlow())
  // About 退出 is the same save-then-close path as the menus (MB-010): a bare
  // exitApplication() here silently dropped unsaved progress.
  document.getElementById('about-exit')?.addEventListener('click', () => { void exitAfterSave() })
  // Desktop shell menu routes here: explicit TTS statement re-confirmation.
  document.getElementById('tts-consent')?.addEventListener('click', () => void requestTtsConfirmation(currentTtsConfig()).catch((error) => reportFailure(ttsBoundary, error)))
}

/**
 * INTERNAL roleplay flow (retained; no public entry is created on any shipped
 * surface since the 2026-11-17 user decision). The gate first enforces the 18+
 * age self-report check (D6: prompted here at the age-gated entry, not at first
 * launch; no roleplay state/form for unverified or minor users), then ALWAYS
 * re-runs the full TOS + separate roleplay declaration + mandatory
 * settings form (every start/every change). Declining starts/changes nothing.
 * When accepted, this build only shows a fixed LOCAL TEMPLATE line that is
 * explicitly labelled as non-LLM — there is no free-form roleplay engine and
 * none is faked. Do not weaken this gate when adding/removing entry points.
 */
async function beginRoleplayFlow(): Promise<void> {
  if (!canInteract()) return
  const change = roleplayState().active
  const result = await requireRoleplayConsent({ change })
  if (!result.accepted || !result.settings) {
    if (result.reason === 'age-required') {
      const message =
        '角色扮演仅限年满 18 周岁用户：本次未完成年龄核验（取消或未选择出生日期），未开始；一般功能仍可使用。可重试，或先在 About 主动完成年龄核验（自报出生日期）。'
      showBubble(message)
      setAboutNote(message)
      openAboutPanel()
    } else if (result.reason === 'minor') {
      const message =
        '角色扮演仅限年满 18 周岁：当前年龄未满足，不能开始；一般功能仍可使用。如年龄填写有误，可在 About 更正后重新核验。'
      showBubble(message)
      setAboutNote(message)
      openAboutPanel()
    } else if (result.reason === 'tos-declined' || result.reason === 'roleplay-declined' || result.reason === 'invalid-settings') {
      showBubble('未开始角色扮演：你取消了本次声明/设定确认。')
    }
    return
  }
  // Minimal, safe, LOCAL template reply (not model output).
  showBubble(roleplayTemplateReply(result.settings))
}

/** INTERNAL roleplay exit (no public entry): clears session state and records the exit. */
function endRoleplayFlow(): void {
  if (requestRoleplayExit()) showBubble('已退出角色扮演，回到普通模式。')
}

/**
 * Stop all voice processing immediately (withdraw consent / delete data).
 * Best effort: a failing stop must never block the consent state change, but
 * the mute flag also prevents any new TTS gate from passing while read-only.
 */
async function stopVoiceProcessing(): Promise<void> {
  // P1-4: withdrawing consent / deleting all data must also clear the host
  // (Rust) consent state + marker so no command can run on stale consent.
  try {
    await revokeHostConsent()
  } catch {}
  try {
    voice.stop()
  } catch {}
  try {
    await talkRecorder.stop()
  } catch {}
  try {
    await audioContext?.suspend()
  } catch {}
}

/**
 * Unified quit path for root menu / 更多 menu / About / settings (MB-010, UX V-01):
 * save first, then close. A failed or timed-out save must not throw the session
 * away silently: ask, and keep the window open when the user cancels. Read-only
 * (pre-consent) launches have nothing to save and close directly.
 */
async function exitAfterSave(): Promise<void> {
  if (CONTENT_SHELL) {
    // The content window holds a read-only snapshot of the pet archive; saving
    // it could clobber newer pet state. The live pet window owns save-then-exit,
    // so just ask it to run the one unified quit path.
    exitApplication()
    return
  }
  let saved = false
  try {
    if (canInteract()) {
      await saveNow()
      saved = true
    }
  } catch (error) {
    if (!(error instanceof RateLimitError)) reportFailure(saveBoundary, error)
  }
  if (!canInteract() || saved) {
    exitApplication()
    return
  }
  if (window.confirm('这次保存没有成功，退出可能丢失本会话进度。仍要退出？')) exitApplication()
}

function exitApplication(): void {
  // Local usage summary: an explicit quit is one "exit" event + one session end.
  recordUsage('exit')
  try {
    if (HAS_TAURI) {
      if (CONTENT_SHELL) {
        // About → 退出应用 from the content window: delegate to the pet window's
        // save-then-quit path (it owns the archive; Rust exits the process).
        void import('@tauri-apps/api/event')
          .then(({ emit }) => emit('pet://exit-requested', {}))
          .catch(() => closeContentWindow())
        return
      }
      // Save is already done; `quit_app` closes EVERY window (the content window
      // would otherwise keep the process alive after 退出).
      void import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('quit_app'))
        .catch(() => {
          void import('@tauri-apps/api/window')
            .then(({ getCurrentWindow }) => getCurrentWindow().close())
            .catch(() => {
              try {
                window.close()
              } catch {}
            })
        })
      return
    }
    window.close()
  } catch {}
}

// One-time app wiring. Each step owns a flag so a retry after a failure resumes
// the missing steps instead of double-wiring listeners that already work.
const wired = {
  crashBuffer: false,
  consent: false,
  shell: false,
  setup: false,
  about: false,
  health: false,
  content: false,
  contentOverlay: false,
  trayExit: false,
}

function initializeApp(): void {
  if (!wired.crashBuffer) {
    // P1-4: local crash ring buffer for window error/unhandledrejection, so
    // silently-caught UI failures are still diagnosable (no network).
    installCrashBuffer()
    wired.crashBuffer = true
  }
  if (!wired.consent) {
    initConsentRuntime({
      onConsentAccepted: () => {
        void (async () => {
          if (CONTENT_SHELL) {
            // Re-consent inside the content window (after 撤回/删除): mirror the
            // acceptance to the host, resume the content surface and let the pet
            // window reload into its own consent state (never save: read-only).
            await syncHostConsent(consentSnapshot())
            await bootContentWindowOnce()
            contentRuntimeApi.showContentWindowRoute(CONTENT_WINDOW.route)
            requestPetWindowReload(false)
            return
          }
          const hostConsent = await syncHostConsent(consentSnapshot())
          if (hostConsent?.launched) return
          await startup.runPetBoot()
        })()
      },
      exitApplication,
      saveSlot: SAVE_SLOT,
      // Data controls (P0 R-P0-06): the consent layer cannot reach the media
      // stack, so it calls back here to stop TTS/ASR/recording before the state
      // flips, and to reset the in-memory pet after a full local wipe.
      stopProcessing: stopVoiceProcessing,
      onDataWiped: () => {
        // Keep `booted` true: re-consent should resume the existing (reset)
        // shell instead of re-running boot wiring a second time. Autosave is
        // blocked while read-only, so nothing is re-created before re-consent.
        // A full local-data wipe also clears the "recovering a corrupt archive"
        // state: after re-consent the next autosave writes a fresh archive
        // instead of staying paused (MB-011). The consent layer already deleted
        // the slots, so recreate the runtime instead of re-deleting them.
        resetSaveServiceAfterWipe()
        state = createPet(now())
        // A full local-data wipe clears the quiet-hours preference too; fall
        // back to the safety default in this session as well.
        settingsPage.reloadQuietHours()
        // P1 round-1: the wipe deleted the two new local keys; drop their memory mirrors too.
        resetUsageSummary(); resetCohabitation()
        // C1: a full local-data wipe also clears the idle-rhythm preference and
        // discards the session-scoped 一起工作 state (nothing is recorded anyway).
        ambientCadence = DEFAULT_AMBIENT_CADENCE
        workSession = null
        clearWorkSession()
        clearWorkSessionTimer()
        settingsPage.renderMemoryBook()
        settingsPage.hideMemoryScreen()
        render()
        showBubble('本机数据已清除；重新同意后可重新开始。')
      },
    })
    wired.consent = true
  }
  if (!wired.shell) {
    initDesktopShell({
      openComposer: openTypedInput,
      // Single consolidated content-center entry (replaces the four renderer
      // rows); main.ts opens the panel and re-checks the consent gate there.
      openContentHub: openContentHubFromMenu,
      // E12 MB-121: settings → 关于 group entry for the same local-only report dialog.
      onOpenContentReport: openContentReportPanel,
      // MB-062: the pet window's 设置… opens the independent settings window;
      // the content window reuses the SAME dialog and does not open a third.
      openSettingsWindow: CONTENT_SHELL ? undefined : openSettingsInContentWindow,
      onSettingsClosed: () => {
        contentRuntimeApi.handleContentWindowSettingsClosed()
      },
      // The content window gets the same dialog renderer/persistence but no pet
      // right-click menu, coach or pet drag behavior.
      enableMenu: !CONTENT_SHELL,
      // Live getters: the shell initializes before hero boot, and the menu is
      // rendered on open, so it sees the actual renderer state each time.
      heroActive: () => heroPage.isActive(),
      getHeroActions: currentHeroMenuActions,
      onHeroAction: handleHeroAction,
      // 总设置 dialog wiring (task-65 / E10 task-121): volume/mute/quiet-hours/
      // 复位窗口 come from the extracted settings page (same audited paths as the
      // legacy panel); save/read stay on this page's save-runtime entries.
      ...settingsPage.shellOptions(),
      // C1 待机节奏 / 一起工作: the shell persists+renders, this page owns the
      // live hero plan and the completion timer.
      getAmbientCadence: () => ambientCadence,
      onAmbientCadenceChange: (next) => { ambientCadence = next },
      getWorkSession: () =>
        workSession === null
          ? null
          : { minutes: workSession.minutes, remainingMs: workSessionRemainingMs(workSession, Date.now()) },
      onWorkSessionStart: (minutes) => { startWorkTogether(minutes) },
      onWorkSessionEnd: () => { finishWorkSession(true) },
      saveArchive: saveArchiveWithFeedback,
      loadArchive: loadArchiveWithFeedback,
      // E6 MB-066: 设置… landings for the previously hidden aside.panel controls
      // reuse these exact audited handlers (no duplicate recording/consent path).
      onTalkStart: beginTalkHold,
      onTalkStop: endTalkHold,
      onAsrConsent: () => { void requestAsrConfirmation(currentAsrConfig()).catch((error) => reportFailure(voiceBoundary, error)) },
      onClearVoiceCache: () => settingsPage.clearVoiceCache(),
      onRename: renameCharacter,
      // The role & content center and the corrupt-archive recovery panel are
      // above the body-level shell menu (the recovery panel is blocking).
      isHigherModalOpen: () => contentRuntimeApi.isContentHubOpen() || settingsPage.isRecoveryPanelVisible(),
      // Root 退出: best-effort save, then close; a hung IPC still exits. The
      // content window has no menu, and its close button never quits the app.
      onExit: () => { void exitAfterSave() },
    })
    wired.shell = true
  }
  if (!wired.content) {
    wired.content = true
    // Static same-origin catalog (never a remote market): parse + merge the
    // installed local packs, restore the saved selection, apply appearance and
    // resolve the dialogue policy. Failures are logged and the content-center
    // entry shows a visible retry instead of blocking the pet.
    void ensureContentRuntime()
  }
  if (!wired.contentOverlay) {
    wired.contentOverlay = true
    // Any TOS/TTS/blocked overlay closes the body-level content panel: the
    // consent layer also inerts body-level siblings, but closing avoids a stale
    // panel (and its feedback) remaining behind the modal.
    document.addEventListener(CONSENT_OVERLAY_EVENT, (event) => {
      const detail = (event as CustomEvent<{ open?: boolean; kind?: string }>).detail
      if (detail && detail.open === true) contentRuntimeApi.closeContentHubPanel()
      // 撤回同意 / 删除全部本地数据 executed in the content window end in the safe
      // read-only screen. The live pet window keeps an in-memory acceptance, so
      // ask it to reload WITHOUT saving (save would re-create wiped data).
      if (CONTENT_SHELL && detail?.open === true && detail.kind === 'consent-blocked') {
        requestPetWindowReload(false)
      }
    })
  }
  if (!wired.setup) {
    initSetupNotice()
    wired.setup = true
  }
  if (!wired.about) {
    initAboutPanel()
    wired.about = true
  }
  if (!wired.health) {
    // One 2h health reminder per app: only the live pet window owns it. Running
    // it in the content/settings window would double-fire and misreport usage.
    if (!CONTENT_SHELL) startHealthReminder()
    wired.health = true
  }
  if (!wired.trayExit) {
    // UX-P0-4: the tray 退出 item asks the page to save-then-close through the
    // exact same path as the root menu (V-01). Rust force-exits after 4s as a
    // fallback, so a broken/hidden page cannot strand the process.
    wired.trayExit = true
    if (HAS_TAURI && !CONTENT_SHELL) {
      void import('@tauri-apps/api/event')
        .then(async ({ listen }) => {
          await listen('pet://exit-requested', () => { void exitAfterSave() })
          // MB-062 reload bridge: the content window asks the pet window to pick
          // up a new renderer/appearance/installed pack. `save:false` is used for
          // data-control flows where writing would re-create wiped data.
          await listen<{ save?: boolean }>(PET_RELOAD_EVENT, (event) => {
            const shouldSave = event.payload?.save !== false
            void (async () => {
              if (shouldSave) {
                try {
                  if (canInteract()) await saveNow()
                } catch {
                  /* a failed save must not block the reload requested by the user */
                }
              }
              window.location.reload()
            })()
          })
          // task-111: the independent content window applied/removed a character
          // pack; refresh the registry and hot-swap (or restore built-in) here,
          // in the only window that owns the hero scene. No page reload.
          await listen(CHARACTER_PACK_APPLY_EVENT, () => {
            void contentRuntimeApi
              .syncCharacterPackAppearance()
              .then((result) => {
                if (result !== null && !result.ok) {
                  console.warn('[pet] character-pack cross-window sync:', result.message)
                }
              })
              .catch((error: unknown) => {
                console.warn('[pet] character-pack cross-window sync failed', error)
              })
          })
        })
        .catch((error: unknown) => {
          console.warn('[pet] tray exit listener unavailable', error)
        })
    }
  }
}

/**
 * Boot composition (E11 MB-110, task-135): the startup stage machine and the
 * blocking failure screen now live in the importable `startup.ts` (no CSS
 * import / no module-level DOM), so the consent -> boot path can be driven with
 * a fake DOM in Node. This page supplies the live seams; `.start()` replaces
 * the old inline content-window/pet branches with identical behaviour.
 */
const startup = createStartupController({
  contentShell: CONTENT_SHELL,
  document: typeof document === 'undefined' ? undefined : document,
  reportFailure: (error) => reportFailure(uiBoundary, error),
  toUserMessage,
  initializeApp,
  bootstrapConsent,
  canInteract,
  getConsentGate,
  bootPet: bootPetOnce,
  bootContentShell: bootContentWindowOnce,
  exitApplication,
  resetPetBoot: () => {
    booted = false
  },
})
void startup.start().catch((error) => {
  // Last-resort net: start() handles its own failures, but a throw before its
  // internal try block must still block visibly. showFailure logs the original
  // error once (reportFailure) and renders only the sanitized copy.
  startup.showFailure(error)
})

