import {
  canRecallMemory,
  createPet,
  correctPetMemory,
  deserializePet,
  foldPaper,
  forgetPetMemory,
  markMemoryRecalled,
  givePaper,
  patPet,
  renamePet,
  serializePet,
  petMood,
  petSchedule,
  setMuted,
  type PetState,
} from '../kernel/pet.ts'
import { VoiceService } from '../voice/service.ts'
import { crc32 } from '../game/checksum.ts'
import { MockVoiceProvider } from '../voice/mock.ts'
import { SystemVoiceProvider } from '../voice/system.ts'
import { createTauriDeepSeekProvider } from '../voice/tauri.ts'
import { transcribeWav } from '../voice/asr.ts'
import type { TtsVoiceId } from '../voice/types.ts'
import { SAFE_REFUSAL, verifyUtterance } from './claims.ts'
import { decryptMemory, encryptMemory, type WebCryptoPayload } from './crypto.ts'
import { exportPortable, importPortable } from './portable.ts'
import { encodeWav } from '../voice/wav.ts'
import {
  heroStatus,
  isHeroCharacterId,
  resolveHeroConfig,
  startHeroRuntime,
  type HeroRuntime,
  type HeroStatus,
} from './hero-runtime.ts'
import { startTinglanPreview } from './tinglan-preview.ts'
import { isBuiltinCharacterId } from './character/builtin.ts'
import { resolveHeroRegionReaction, type HeroRegionAction, type HeroRegionReaction } from './anim/regions.ts'
import { shouldStartWindowDrag } from './hero-drag.ts'
import { loadDigest } from './chat-import/store.ts'
import {
  ADVISERS_AUTO_HIDDEN_NOTICE,
  ADVISERS_BLUR_HIDDEN_NOTICE,
  ADVISERS_NONE_CLEARED_NOTICE,
  ADVISERS_PAGE_HIDDEN_NOTICE,
  ADVISERS_VISIBILITY_HIDDEN_NOTICE,
  AdvisersFaceController,
  AdvisersPanelPrivacyGuard,
  describeAdvisersPolicyStatusSuffix,
  summarizeBrief,
  type AdvisersFaceStatus,
  type AdvisersPanelHideReason,
  type AdvisersPanelPolicyView,
} from './advisers/face.ts'
import { describeAdvisersFaceView, heroPlaceholderView, type HeroPlaceholderView } from './ui-state.ts'
import {
  applyRendererChoice,
  closeDesktopSettingsDialog,
  initDesktopShell,
  openDesktopSettingsDialog,
  requestMenuCoach,
  createComposerController,
  type ComposerController,
  type HeroMenuActionItem,
  type PetRendererChoice,
} from './desktop-shell.ts'
import {
  CONTENT_WINDOW_NAVIGATE_EVENT,
  PET_RELOAD_EVENT,
  contentWindowMode,
  installContentWindowChrome,
  normalizeContentWindowRoute,
  openContentWindow,
  stashContentWindowFocus,
  takeContentWindowFocus,
  type ContentWindowChrome,
  type ContentWindowRoute,
} from './content-window.ts'
import { heroActionPlan, isHeroMenuAction, type HeroMenuAction } from './hero-actions.ts'
import { startHitRegionSync } from './hit-regions.ts'
import { startDesktopShellLayout } from './shell-layout.ts'
import { characterBubbleSemantic, characterCanVoice } from './character-voice.ts'
import { createTrustLayer } from './trust.ts'
import {
  assertSafeForTts,
  isSafetyBlockedError,
  reviewDlcDescription,
  reviewModelOutput,
  reviewUserInput,
} from './safety/gate.ts'
import { MAX_TALK_MS, MAX_WAV_BYTES, TalkRecorder, type MediaStreamLike, type TalkState } from './recording.ts'
import { checkRelativePath } from './security/path-safety.ts'
import { readClampedInt, removeKey, resolveStorage, safeGetItem, safeSetItem } from './security/safe-storage.ts'
import { SECURITY_LIMITS, sanitizePlainText, utf8ByteLength } from './security/limits.ts'
import { createErrorBoundary, toUserMessage, type ErrorBoundary } from './security/error-boundary.ts'
import { createSecurityRateLimits, RateLimitError } from './security/rate-limit.ts'
import { installCrashBuffer } from '../observability.ts'
import {
  CONSENT_ACTIONS,
  ConsentDeclinedError,
  importPortableWithConsent,
  loadCharacterPackWithConsent,
} from './consent/content.ts'
import { CONSENT_OVERLAY_EVENT } from './consent/modal.ts'
import { hasOpenConsentOverlay } from './consent/modal.ts'
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
import { formatVoiceModeLabel, isTtsVoiceId, readVoicePref, writeVoicePref, VOICE_PREF_STORAGE_KEY } from './voice-prefs.ts'
import {
  filterProactiveLine,
  isQuietHoursActive,
  readQuietHours,
  type QuietHoursSettings,
} from './low-disturb.ts'
import { AI_REPLY_LABEL, installBubbleAiLabel } from './ai-label.ts'
import { roleplayTemplateReply } from './consent/roleplay.ts'
import {
  applyContentSelectionAppearance,
  commitPreparedThemePack,
  decideDialogueLine,
  defaultContentMarketState,
  describeContentMarketState,
  evaluateRoleThemeSupport,
  initContentHub,
  planStartupRoleTheme,
  prepareThemePackImport,
  readInstalledContentPacks,
  readInstalledThemePacks,
  type ContentHubController,
  type ContentHubImportResult,
  type ContentHubInstalledPack,
  type ContentHubSelectResult,
  type ContentMarketUiState,
  type ContentPackFileSelection,
  type DialogueLineKind,
  type PreparedThemePackImport,
  type RemoteMarketSource,
  type ThemePackPrepareResult,
} from './content-hub.ts'
import {
  CONTENT_CHARACTER_PRODUCT_IDS,
  CONTENT_SELECTION_CATEGORY,
  applyCharacterTheme,
  clearRoleThemeSelection,
  findCharacterTheme,
  findContent,
  mergeCharacterThemes,
  mergeInstalledPacks,
  parseContentLibrary,
  resolveContentSelection,
  resolveDialogueBehavior,
  validateContentPack,
  validateContentPackV2,
  writeCharacterThemeSelection,
  writeContentSelection,
  writeRoleThemeSelection,
  type ContentCharacterEntry,
  type ContentCharacterTheme,
  type ContentLibrary,
  type ContentSelection,
  type ContentVoiceEntry,
  type DialogueBehavior,
  type SelectionKey,
} from './content-library.ts'
import {
  buildAssetRecords,
  contentAssetKey,
  createAssetUrlRegistry,
  openContentAssetStore,
  persistAssetRecords,
  registerPackFont,
  type ContentAssetRecord,
  type ContentAssetStore,
  type ContentAssetUrls,
} from './content-assets.ts'
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
 * closable from 总设置. main.ts mirrors the shell preference so ambient output
 * stops/starts immediately; the 2h health reminder is deferred by the consent
 * runtime while this returns true.
 */
let quietHoursSettings: QuietHoursSettings = readQuietHours()
function quietHoursActive(at: Date = new Date()): boolean {
  return isQuietHoursActive(at, quietHoursSettings)
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
/** Only the independent content window may rebroadcast a pet reload. */
let contentWindowNeedsPetReload = false
/** The content window's in-window home surface (content hub / settings / close). */
let contentWindowChrome: ContentWindowChrome | null = null
let contentWindowBooted = false
/** Suppresses onClose→showHome while main.ts itself is switching panels. */
let contentWindowTransition = false

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

// ---------------------------------------------------------------------------
// P1 startup-failure blocking screen (audit P1-4: no fail-open blank app)
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
 * Visible blocking screen shown when `startConsentApp`/`bootPetOnce` throws.
 * The pet app is made inert/aria-hidden so a failed boot can never leave a
 * blank-but-interactive window; only retry/exit leave the screen. The copy is
 * the caller's sanitized `toUserMessage(error)`, never an error object/path.
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
function notifyStartupOverlay(open: boolean): void {
  try {
    const view = (document as Document & { defaultView?: Window | null }).defaultView
    const ctor = view?.CustomEvent ?? (typeof CustomEvent === 'function' ? CustomEvent : undefined)
    if (!ctor) return
    document.dispatchEvent(new ctor(CONSENT_OVERLAY_EVENT, { detail: { open, kind: 'startup-failure' } }))
  } catch {
    /* event fan-out is best effort; pet-app is inert and the screen is on top */
  }
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

/** Cat/dog personas are silent: their bubbles are thoughts and TTS is skipped. */
function currentCharacterCanVoice(): boolean {
  return characterCanVoice(HERO_CONFIG.character, HERO_CONFIG.enabled)
}
let hero: HeroRuntime | null = null
let heroCanvasEl: HTMLCanvasElement | null = null
let heroCtx: CanvasRenderingContext2D | null = null
let heroRaf: number | null = null
let heroSceneNow = 0
let heroLastFrameMs = 0
let heroNight = false
/** Cat/dog run locomotion: CSS translate/scale on the canvas, reset on idle. */
const heroMove = { offset: 0, dir: 1 as 1 | -1, active: false }
const now = (): number => Date.now()

let state: PetState = createPet(now())
let bubbleTimer: ReturnType<typeof setTimeout> | null = null
let mouthTimer: ReturnType<typeof setTimeout> | null = null

// Pet TTS voice preference (default `stella`; setup page writes
// `desktop-games/pet/voice`). Read through safe-storage, so missing/blocked/
// corrupt storage keeps the baked default instead of an invalid voice.
let currentVoice: TtsVoiceId = readVoicePref()
/** Provider/mode half of the TTS config signature; the voice is appended below. */
let ttsProviderMode = '系统 TTS · AI 合成'

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
        ttsProviderMode = '云端 TTS（Rust 代理）+ 系统 TTS · AI 合成'
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
  bubble.classList.toggle('thought', characterBubbleSemantic(HERO_CONFIG.character, HERO_CONFIG.enabled) === 'thought')
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
/**
 * Volume read through safe-storage: missing/corrupt/blocked storage keeps the
 * 70 default (a bare `Number(null)` would be 0 and mute the pet).
 */
let volume = readClampedInt('desktop-games/pet/volume', 70, 0, 100)
function ensureAudio(): void {
  if (!audioContext) {
    audioContext = new AudioContext()
    audioGain = audioContext.createGain()
    audioGain.gain.value = Math.max(0, Math.min(1, volume / 100))
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
  if (!currentCharacterCanVoice()) return true
  // Hero hook: tag-based talk cue + expression/mouth QA envelope. The pixel
  // renderer's setExpression/setMouth are still no-ops (documented limitation);
  // voice/subtitles above stay on the unchanged path.
  hero?.speak({ text: safeText, emotion, durationMs: Math.max(260, safeText.length * 120) })
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
  if (hero) {
    hero.syncMood({ happy: state.bond >= 8 || state.folded >= 2, sleepy: hour >= 23 || hour < 6 })
    hero.setMuted(state.muted)
    const night = hour >= 23 || hour < 6
    if (night !== heroNight) {
      heroNight = night
      hero.setNight(night)
    }
  }
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
// Role & content center runtime (famling.content/0.2, task-54)
//
// The catalog, strict validation, pack merge, selection persistence, appearance
// and dialogue resolution are pure modules (src/pet/content-library.ts,
// src/pet/content-hub.ts, src/pet/content-assets.ts). This host section owns
// only the side effects:
// - startup: read /content/library.json (same-origin static asset, never a
//   remote market), merge v1 installed components + v2 role-theme packs, read
//   the role theme + six-key selection (migrating old profiles), apply
//   theme/background/font and resolve dialogue behaviour, then load locally
//   stored pack assets (IndexedDB, memory fallback) for previews/fonts;
// - one-click role: applyCharacterTheme -> writeCharacterThemeSelection (six
//   keys + role-theme key). Character changes go through the existing
//   applyRendererChoice() write+reload path; voice changes re-prompt the TTS
//   declaration; appearance/dialogue apply immediately without reload;
// - per-component customisation: one six-key write, immediate appearance,
//   voice keeps the existing TTS config-signature lifecycle;
// - local pack import (.json / .zip / webkitdirectory folder): bounded read ->
//   canonical validateContentPackV2 (+ validatePackZip for bundles) ->
//   unified usage declaration shown -> explicit user confirmation ->
//   mergeCharacterThemes -> persist manifest + assets. Remote/unverified packs
//   are refused by the pure helper; nothing is ever fetched here.
// ---------------------------------------------------------------------------

interface ContentPreviewTarget {
  readonly packId: string
  readonly path: string
}

interface ContentRuntimeState {
  /** Built-in catalog document (no installed packs). */
  readonly baseLibrary: ContentLibrary
  /** Built-in catalog + v1 installed components (v2 theme packs not merged). */
  v1Library: ContentLibrary
  installedPacks: readonly unknown[]
  themePacks: readonly unknown[]
  library: ContentLibrary
  selection: ContentSelection
  roleThemeId: string | null
  dialogue: DialogueBehavior
  hub: ContentHubController | null
  assetStore: ContentAssetStore | null
  readonly assetUrls: ContentAssetUrls
  /** Locally persisted pack asset records, keyed by contentAssetKey(). */
  readonly assetRecords: Map<string, ContentAssetRecord>
  /** Registered FontFace families per pack (local sample preview only). */
  readonly fontFamiliesByPack: Map<string, string[]>
  /** Installed role theme id -> its pack preview asset target. */
  readonly previewTargets: Map<string, ContentPreviewTarget>
}

let contentRuntime: ContentRuntimeState | null = null
let contentLoad: Promise<ContentRuntimeState | null> | null = null
/** Active dialogue policy for sayLater/pickSays (null = catalog not loaded yet). */
let dialogueBehavior: DialogueBehavior | null = null
/**
 * Remote market source is intentionally NOT configured in this build: the UI
 * shows the honest "服务器未配置" state and nothing fetches. A future installer
 * can inject a verified RemoteMarketSource here without changing the panel.
 */
let activeMarketSource: RemoteMarketSource | null = null

const CONTENT_KEY_LABELS: Readonly<Record<SelectionKey, string>> = Object.freeze({
  character: '角色',
  voice: '声音',
  dialoguePack: '对话模式',
  theme: '主题',
  background: '背景',
  font: '字体',
})

function contentStorage() {
  return resolveStorage()
}

/** Fail closed when the TOS gate is not accepted or a consent overlay is open. */
function contentHubBlocked(): boolean {
  try {
    return !canInteract() || hasOpenConsentOverlay(document)
  } catch {
    return true
  }
}

/** Map the live renderer state to a catalog character id (runtime truth wins). */
function contentCharacterIdFromRenderer(): string {
  if (!HERO_CONFIG.enabled) return 'origami'
  if (HERO_CONFIG.character === 'tinglan') return 'humanoid'
  return HERO_CONFIG.character
}

function addFontFamily(runtime: ContentRuntimeState, packId: string, family: string): void {
  const families = runtime.fontFamiliesByPack.get(packId) ?? []
  if (families.includes(family)) return
  families.push(family)
  runtime.fontFamiliesByPack.set(packId, families)
}

/** Installed role theme id -> pack-relative preview asset (for object URLs). */
function rebuildPreviewTargets(runtime: ContentRuntimeState): void {
  runtime.previewTargets.clear()
  for (const raw of runtime.themePacks) {
    const validation = validateContentPackV2(raw)
    if (!validation.ok) continue
    for (const theme of validation.pack.roleThemes) {
      runtime.previewTargets.set(theme.id, { packId: validation.pack.id, path: theme.preview })
    }
  }
}

/** Load persisted pack previews + register stored woff2 fonts (best effort). */
async function hydrateInstalledAssets(runtime: ContentRuntimeState): Promise<void> {
  rebuildPreviewTargets(runtime)
  const store = runtime.assetStore
  if (store === null) return
  for (const target of runtime.previewTargets.values()) {
    const record = await store.get(target.packId, target.path)
    if (record !== null) runtime.assetRecords.set(record.key, record)
  }
  for (const raw of runtime.themePacks) {
    const validation = validateContentPackV2(raw)
    if (!validation.ok) continue
    const metas = await store.list(validation.pack.id)
    for (const meta of metas) {
      if (!meta.path.endsWith('.woff2')) continue
      const record = await store.get(meta.packId, meta.path)
      if (record === null) continue
      runtime.assetRecords.set(record.key, record)
      try {
        const registration = await registerPackFont(record)
        if (registration.ok && registration.family !== undefined) {
          addFontFamily(runtime, record.packId, registration.family)
        }
      } catch {
        // A font that fails to load is not fatal: the pack metadata still works.
      }
    }
  }
}

/** Host market status (default: unconfigured, no network). */
function contentMarketState(): ContentMarketUiState {
  try {
    return describeContentMarketState(activeMarketSource)
  } catch {
    return defaultContentMarketState()
  }
}

function buildContentHubController(): ContentHubController {
  return initContentHub({
    document,
    getLibrary: () => contentRuntime?.library ?? null,
    getSelection: () => contentRuntime?.selection ?? null,
    getRoleThemeId: () => contentRuntime?.roleThemeId ?? null,
    getBaseLibrary: () => contentRuntime?.baseLibrary ?? null,
    applyRole: (roleThemeId) => applyRoleThemeFromHub(roleThemeId, 'apply'),
    customize: customizeRoleComponent,
    restoreRole: restoreCurrentRoleDefaults,
    prepareImport: prepareContentImport,
    commitImport: commitContentImport,
    getInstalledPacks: installedPackSummaries,
    getMarketState: contentMarketState,
    resolvePreviewUrl: resolveRolePreviewUrl,
    // The independent content window (MB-062): closing the SAME hub returns to
    // its home surface, and appearance/role edits made there are flushed to the
    // live pet window (save + reload) so it does not keep a stale renderer.
    onClose: () => {
      if (!CONTENT_SHELL) return
      if (!contentWindowTransition) contentWindowChrome?.showHome()
      if (contentWindowNeedsPetReload) {
        contentWindowNeedsPetReload = false
        requestPetWindowReload(true)
      }
    },
  })
}

/**
 * Open the SAME consolidated role & content center inside this window.
 * Used by the pet window's browser/dev fallback and by the content window
 * itself (menu / settings → 角色与内容中心).
 */
async function openContentHubInWindow(): Promise<boolean> {
  if (contentHubBlocked()) {
    showBubble('请先同意完整声明后再打开角色与内容中心。')
    return false
  }
  const runtime = await ensureContentRuntime()
  if (!runtime || !runtime.hub) {
    showBubble('内容目录没有加载出来，请稍后再试。')
    return false
  }
  return runtime.hub.open()
}

/**
 * Load + merge the catalog once (retryable after a failure), restore/migrate the
 * role theme selection and apply the saved appearance/dialogue. Local static
 * fetch only (the built-in catalog), never a remote market.
 */
async function ensureContentRuntime(): Promise<ContentRuntimeState | null> {
  if (contentRuntime) return contentRuntime
  if (contentLoad) return contentLoad
  const pending = (async (): Promise<ContentRuntimeState | null> => {
    try {
      const response = await fetch('/content/library.json', { credentials: 'same-origin' })
      if (!response.ok) throw new Error('content library request failed: ' + response.status)
      const baseLibrary = parseContentLibrary(await response.json())
      const storedV1 = readInstalledContentPacks(contentStorage())
      const v1Merged = mergeInstalledPacks(baseLibrary, storedV1.packs)
      const v1Library = v1Merged.library
      const storedThemes = readInstalledThemePacks(contentStorage())
      const themeMerged = mergeCharacterThemes(v1Library, storedThemes.packs)
      const library = themeMerged.library
      const plan = planStartupRoleTheme(library, contentStorage(), {
        runtimeCharacter: contentCharacterIdFromRenderer(),
        ...(isTtsVoiceId(currentVoice) ? { runtimeVoice: currentVoice } : {}),
      })
      if (plan.writeRoleTheme && plan.roleThemeId !== null) {
        // Migration/default: persist the full six-key bundle + role-theme key so
        // the next boot reads the same role instead of re-deriving it.
        writeRoleThemeSelection(library, plan.roleThemeId, contentStorage())
        writeContentSelection(library, plan.selection, contentStorage())
      }
      if (plan.clearRoleTheme) clearRoleThemeSelection(contentStorage())
      const runtime: ContentRuntimeState = {
        baseLibrary,
        v1Library,
        installedPacks: storedV1.packs,
        themePacks: storedThemes.packs,
        library,
        selection: plan.selection,
        roleThemeId: plan.roleThemeId,
        dialogue: resolveDialogueBehavior(library, plan.selection),
        hub: null,
        assetStore: null,
        assetUrls: createAssetUrlRegistry(),
        assetRecords: new Map<string, ContentAssetRecord>(),
        fontFamiliesByPack: new Map<string, string[]>(),
        previewTargets: new Map<string, ContentPreviewTarget>(),
      }
      contentRuntime = runtime
      dialogueBehavior = runtime.dialogue
      try {
        applyContentSelectionAppearance(document, runtime.library, runtime.selection)
      } catch (error) {
        reportFailure(uiBoundary, error)
      }
      try {
        runtime.assetStore = await openContentAssetStore()
        await hydrateInstalledAssets(runtime)
      } catch (error) {
        // Asset storage is a preview enhancement; the catalog still works.
        reportFailure(uiBoundary, error)
      }
      runtime.hub = buildContentHubController()
      return runtime
    } catch (error) {
      reportFailure(uiBoundary, error)
      return null
    }
  })()
  contentLoad = pending
  try {
    return await pending
  } finally {
    if (contentLoad === pending) contentLoad = null
  }
}

/**
 * Desktop-menu entry (pet window): open the independent content/settings window
 * (MB-062), focusing it when already open. Browser/dev (no Tauri) and a failed
 * window creation keep today's in-window panel — one renderer, two hosts.
 */
function openContentHubFromMenu(): void {
  if (CONTENT_SHELL) {
    // Content window: switch the SAME window to the content panel (this is also
    // what the settings dialog's 角色与内容中心… button reaches).
    if (contentWindowChrome) contentWindowChrome.showRoute('content')
    else void openContentHubInWindow().catch((error) => reportFailure(uiBoundary, error))
    return
  }
  if (!HAS_TAURI) {
    // Browser/dev fallback: keep the in-window panel (no popups, no new window).
    void openContentHubInWindow().catch((error) => reportFailure(uiBoundary, error))
    return
  }
  void openContentWindow('content')
    .then((opened) => {
      if (!opened) void openContentHubInWindow().catch((error) => reportFailure(uiBoundary, error))
    })
    .catch((error) => {
      reportFailure(uiBoundary, error)
      void openContentHubInWindow().catch((inner) => reportFailure(uiBoundary, inner))
    })
}

/**
 * Pet-window menu 设置… entry: open the same audited settings dialog in the
 * independent content window (deep-linked focus target stashed for it). Returns
 * false in the browser fallback so desktop-shell opens its in-window modal.
 */
function openSettingsInContentWindow(focusTarget?: string): boolean {
  if (CONTENT_SHELL || !HAS_TAURI) return false
  stashContentWindowFocus(contentStorage(), focusTarget)
  void openContentWindow('settings')
    .then((opened) => {
      if (!opened && !openDesktopSettingsDialog(focusTarget)) {
        showBubble('内容窗口没有打开，设置暂时不可用。')
      }
    })
    .catch((error) => {
      reportFailure(uiBoundary, error)
      openDesktopSettingsDialog(focusTarget)
    })
  return true
}

/**
 * Ask the live pet window to save (optional) and reload after a content/role
 * change made in the independent window. Fired through the Tauri event bus
 * (both windows share one process); the pet window owns its own save path.
 */
function requestPetWindowReload(save: boolean): void {
  if (!HAS_TAURI || !CONTENT_SHELL) return
  void import('@tauri-apps/api/event')
    .then(({ emit }) => emit(PET_RELOAD_EVENT, { save }))
    .catch((error: unknown) => {
      console.warn('[pet] reload bridge unavailable', error)
    })
}

/** Close only the content window (never the app, never the pet). */
function closeContentWindow(): void {
  try {
    if (HAS_TAURI) {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().close())
        .catch(() => {
          try {
            window.close()
          } catch {}
        })
      return
    }
    window.close()
  } catch {}
}

/** Local object URL for an installed pack preview; built-in previews use paths. */
function resolveRolePreviewUrl(theme: ContentCharacterTheme): string | null {
  const runtime = contentRuntime
  if (runtime === null) return null
  if (typeof theme.preview === 'string' && theme.preview.startsWith('/') && !theme.preview.startsWith('//')) {
    return theme.preview
  }
  const target = runtime.previewTargets.get(theme.id)
  if (target === undefined) return null
  const record = runtime.assetRecords.get(contentAssetKey(target.packId, target.path))
  if (record === undefined) return null
  try {
    return runtime.assetUrls.urlFor(record)
  } catch {
    return null
  }
}

/**
 * One-click role application: resolve the role into a six-component selection,
 * persist six keys + role-theme key, then run the existing lifecycles:
 *  - character differs -> applyRendererChoice() (persist + reload, TOS-gated);
 *  - voice differs -> write the voice preference + applyVoicePreference()
 *    (re-prompts the separate TTS declaration, never auto-accepted);
 *  - appearance/dialogue -> apply immediately, no reload.
 */
function applyRoleThemeFromHub(
  roleThemeId: string,
  verb: 'apply' | 'restore',
): ContentHubSelectResult {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载，请稍后再试。' }
  if (contentHubBlocked()) return { ok: false, message: '请先同意完整声明后再切换角色。' }
  const theme = findCharacterTheme(runtime.library, roleThemeId)
  if (theme === undefined) return { ok: false, message: '该角色主题不存在或已失效，已保留原角色。' }
  const support = evaluateRoleThemeSupport(runtime.baseLibrary, theme)
  if (!support.supported) return { ok: false, message: support.reason }
  const application = applyCharacterTheme(runtime.library, roleThemeId)
  if (!application.ok || application.selection === undefined) {
    const first = application.issues[0]
    return {
      ok: false,
      message:
        '角色主题解析失败' + (first !== undefined ? '（' + first.message + '）' : '') + '，已保留原角色。',
    }
  }
  const character = findContent(runtime.library, 'characters', application.selection.character) as
    | ContentCharacterEntry
    | undefined
  if (character === undefined) {
    return { ok: false, message: '角色主题引用的角色不在内容目录中，已保留原角色。' }
  }
  const targetRenderer = CONTENT_CHARACTER_PRODUCT_IDS[character.kind].famling as PetRendererChoice
  const characterChanged = contentCharacterIdFromRenderer() !== application.selection.character
  // Persist the whole role first: if storage is unavailable nothing changes.
  const stored = writeCharacterThemeSelection(runtime.library, roleThemeId, contentStorage())
  if (!stored.ok) return { ok: false, message: '本地存储不可用，角色主题未切换（原状态保持不变）。' }
  const themeVoiceId =
    character.voiceMode === 'tts' && isTtsVoiceId(application.selection.voice) ? application.selection.voice : null
  const voiceChanged = themeVoiceId !== null && themeVoiceId !== currentVoice
  let voicePrefNote = ''
  if (voiceChanged && themeVoiceId !== null) {
    const savedVoice = writeVoicePref(themeVoiceId, contentStorage())
    if (savedVoice !== 'ok') voicePrefNote = '（音色偏好未能保存到本地存储）'
  }
  runtime.selection = application.selection
  runtime.roleThemeId = roleThemeId
  if (characterChanged) {
    const applied = applyRendererChoice(targetRenderer, {
      storage: contentStorage(),
      reload: () => {
        // The pet window is a different process window: tell it to save+reload
        // so the new renderer actually appears there (it owns the pet loop).
        requestPetWindowReload(true)
        window.location.reload()
      },
    })
    if (!applied) return { ok: false, message: '本地存储不可用，无法切换角色（未刷新，原角色保持不变）。' }
    return {
      ok: true,
      message: '正在切换到「' + theme.name + '」…页面会按既有渲染器生命周期刷新。' + voicePrefNote,
      close: true,
    }
  }
  try {
    applyContentSelectionAppearance(document, runtime.library, runtime.selection)
  } catch (error) {
    reportFailure(uiBoundary, error)
  }
  runtime.dialogue = resolveDialogueBehavior(runtime.library, runtime.selection)
  dialogueBehavior = runtime.dialogue
  // Appearance/dialogue changed without a reload: flush the live pet window when
  // the content window's hub closes (it re-reads the same persisted selection).
  if (CONTENT_SHELL) contentWindowNeedsPetReload = true
  if (voiceChanged) applyVoicePreference(themeVoiceId as TtsVoiceId)
  else renderVoiceMode()
  const prefix = verb === 'restore' ? '已恢复角色「' : '已应用角色「'
  return {
    ok: true,
    message:
      prefix +
      theme.name +
      '」：声音 / 对话 / 主题 / 背景 / 字体已同步。' +
      (voiceChanged ? 'TTS 声明会按新的配置签名重新弹出确认。' : '') + voicePrefNote,
  }
}

/** Restore the current role theme's six defaults (keeps the role key). */
function restoreCurrentRoleDefaults(): ContentHubSelectResult {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载，请稍后再试。' }
  if (runtime.roleThemeId === null) {
    return {
      ok: false,
      message: '当前是自定义组合，没有可恢复的角色主题；可在「角色」里一键应用一个角色。',
    }
  }
  return applyRoleThemeFromHub(runtime.roleThemeId, 'restore')
}

/**
 * Per-component customisation on top of the current role: writes only the six
 * component keys (the role-theme key stays as the applied basis), applies
 * appearance/dialogue immediately and keeps the voice TTS lifecycle.
 */
function customizeRoleComponent(key: SelectionKey, id: string): ContentHubSelectResult {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载，请稍后再试。' }
  if (contentHubBlocked()) return { ok: false, message: '请先同意完整声明后再修改内容。' }
  if (key === 'character') {
    return { ok: false, message: '角色切换请在「角色」标签一键应用角色主题。' }
  }
  const entry = findContent(runtime.library, CONTENT_SELECTION_CATEGORY[key], id)
  if (entry === undefined || !entry.available) {
    return { ok: false, message: '该内容不可用或已失效，已保留原选择。' }
  }
  const resolved = resolveContentSelection(runtime.library, { ...runtime.selection, [key]: id })
  if (resolved.selection[key] !== id) {
    return { ok: false, message: '该选择不在当前内容目录中，已保留原选择。' }
  }
  const character = findContent(runtime.library, 'characters', resolved.selection.character) as
    | ContentCharacterEntry
    | undefined
  let voiceNote = ''
  if (key === 'voice' && character !== undefined && character.voiceMode === 'tts') {
    const voice = entry as ContentVoiceEntry
    if (!isTtsVoiceId(voice.voiceId)) {
      return { ok: false, message: '这个声音不是本机支持的 TTS 音色，未切换。' }
    }
    if (voice.voiceId !== currentVoice) {
      const savedPref = writeVoicePref(voice.voiceId, contentStorage())
      if (savedPref !== 'ok') {
        return { ok: false, message: '无法保存音色偏好（本地存储不可用），未切换。' }
      }
      voiceNote = ' TTS 声明会按新的配置签名重新弹出确认。'
    }
  }
  runtime.selection = resolved.selection
  const written = writeContentSelection(runtime.library, resolved.selection, contentStorage())
  try {
    applyContentSelectionAppearance(document, runtime.library, resolved.selection)
  } catch (error) {
    reportFailure(uiBoundary, error)
  }
  if (key === 'dialoguePack') {
    runtime.dialogue = resolveDialogueBehavior(runtime.library, resolved.selection)
    dialogueBehavior = runtime.dialogue
  }
  // Same persisted selection read by the pet window: flush it on hub close.
  if (CONTENT_SHELL) contentWindowNeedsPetReload = true
  if (key === 'voice' && character !== undefined && character.voiceMode === 'tts') {
    const voice = entry as ContentVoiceEntry
    if (isTtsVoiceId(voice.voiceId)) {
      if (voice.voiceId !== currentVoice) applyVoicePreference(voice.voiceId)
      else renderVoiceMode()
    }
  }
  const name = entry.name
  if (!written.ok) {
    return {
      ok: false,
      message: '已临时应用' + CONTENT_KEY_LABELS[key] + '「' + name + '」，但无法保存（本地存储不可用）。',
    }
  }
  return {
    ok: true,
    message: '已自定义' + CONTENT_KEY_LABELS[key] + '「' + name + '」；其余组件仍跟随角色主题。' + voiceNote,
  }
}

/** Pure validation / merge preview for a selected local pack (nothing written). */
async function prepareContentImport(selection: ContentPackFileSelection): Promise<ThemePackPrepareResult> {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载。' }
  if (contentHubBlocked()) return { ok: false, message: '请先同意完整声明后再导入内容。' }
  return prepareThemePackImport(selection, runtime.v1Library, runtime.themePacks)
}

/**
 * Explicitly confirmed install: persist the validated manifest, persist verified
 * assets (IndexedDB / memory fallback), re-merge the catalog and refresh UI.
 */
async function commitContentImport(pending: PreparedThemePackImport): Promise<ContentHubImportResult> {
  const runtime = contentRuntime
  if (!runtime) return { ok: false, message: '内容目录尚未加载。' }
  if (contentHubBlocked()) return { ok: false, message: '请先同意完整声明后再导入内容。' }
  const stored = commitPreparedThemePack(pending, contentStorage())
  if (!stored.ok) {
    const reason =
      stored.status === 'too-large'
        ? '内容包存储超过大小上限'
        : stored.status === 'quota'
          ? '本地存储配额不足'
          : '本地存储不可用'
    return { ok: false, message: '内容包校验通过，但' + reason + '，未安装。' }
  }
  let assetNote = ''
  if (pending.assets.length > 0) {
    const records = buildAssetRecords(pending.pack.id, pending.assets)
    const store = runtime.assetStore
    if (store !== null) {
      const persisted = await persistAssetRecords(store, records)
      for (const record of records) runtime.assetRecords.set(record.key, record)
      if (persisted.failed > 0) {
        assetNote = '（' + persisted.failed + ' 个素材未能写入本地资产库，预览可能缺失）'
      }
      for (const record of records) {
        if (!record.path.endsWith('.woff2')) continue
        try {
          const registration = await registerPackFont(record)
          if (registration.ok && registration.family !== undefined) {
            addFontFamily(runtime, record.packId, registration.family)
          }
        } catch {
          // A font failure must not fail an otherwise valid pack install.
        }
      }
    } else {
      assetNote = '（本地资产库不可用，素材仅在本次会话可用）'
    }
  }
  runtime.themePacks = pending.nextPacks
  runtime.library = pending.library
  runtime.selection = resolveContentSelection(pending.library, runtime.selection).selection
  runtime.dialogue = resolveDialogueBehavior(pending.library, runtime.selection)
  dialogueBehavior = runtime.dialogue
  rebuildPreviewTargets(runtime)
  // The pet window must re-read the merged catalog so the imported pack appears
  // there too (flush on hub close; no duplicate window logic).
  if (CONTENT_SHELL) contentWindowNeedsPetReload = true
  try {
    applyContentSelectionAppearance(document, runtime.library, runtime.selection)
  } catch (error) {
    reportFailure(uiBoundary, error)
  }
  const verb = pending.unchanged ? '已存在相同内容包' : pending.replaced ? '已更新内容包' : '已导入内容包'
  const unsupported = pending.pack.roleThemes.filter(
    (theme) => !evaluateRoleThemeSupport(runtime.baseLibrary, theme).supported,
  ).length
  const supportNote =
    unsupported > 0
      ? '；其中 ' + unsupported + ' 个角色主题需远程市场安装器才能实际渲染，已导入但不可一键应用。'
      : ''
  return {
    ok: true,
    message:
      verb +
      '「' +
      pending.pack.name +
      '」：' +
      pending.pack.roleThemes.length +
      ' 个角色主题，统一用途声明已确认，仅本地数据、未联网。' +
      supportNote +
      assetNote,
    installedCount: runtime.themePacks.length + runtime.installedPacks.length,
  }
}

/** Rows for the 内容包 tab: v1 local packs + imported v2 role-theme packs. */
function installedPackSummaries(): readonly ContentHubInstalledPack[] {
  const runtime = contentRuntime
  if (!runtime) return Object.freeze([])
  const out: ContentHubInstalledPack[] = []
  for (const raw of runtime.installedPacks) {
    const validation = validateContentPack(raw)
    if (!validation.ok) continue
    const pack = validation.pack
    out.push(
      Object.freeze({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        kind: 'v1' as const,
        roleThemes: 0,
        declaration: false,
      }),
    )
  }
  for (const raw of runtime.themePacks) {
    const validation = validateContentPackV2(raw)
    if (!validation.ok) continue
    const pack = validation.pack
    const unsupported = pack.roleThemes.filter(
      (theme) => !evaluateRoleThemeSupport(runtime.baseLibrary, theme).supported,
    )
    const fontFamilies = runtime.fontFamiliesByPack.get(pack.id)
    out.push(
      Object.freeze({
        id: pack.id,
        name: pack.name,
        version: pack.version,
        kind: 'role-theme' as const,
        roleThemes: pack.roleThemes.length,
        declaration: true,
        aiDisclosure: pack.aiProvenance.disclosure,
        license: pack.license.spdx + ' / ' + pack.license.attribution,
        ...(unsupported.length > 0
          ? {
              note:
                '已导入但需远程市场安装器：' +
                unsupported.map((theme) => theme.name).join('、') +
                ' 的角色动画/声音本机暂不可用。',
            }
          : {}),
        ...(fontFamilies !== undefined && fontFamilies.length > 0
          ? { fontFamilies: Object.freeze([...fontFamilies]) }
          : {}),
      }),
    )
  }
  return Object.freeze(out)
}


function doPat(actorId?: string): void {
  state = patPet(state, now())
  hero?.emit('pat', actorId ? { actorId } : {})
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
/** Interaction cadence (research: don't turn every click into a vending machine). */
const HERO_TOUCH_COOLDOWN_MS = 1200
const HERO_REGION_COOLDOWN_MS = 2500
const HERO_ACTION_COOLDOWN_MS = 800
let lastHeroTouchAt = 0
let lastHeroActionAt = 0
const lastRegionTouchAt = new Map<string, number>()

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
  hero?.emit(reaction.event, { actorId })
  sayLater(pickSays(reaction.says, `${actorId}:${reaction.region}`) ?? pick(lines.pat), 'happy')
  render()
}

function doGive(): void {
  state = givePaper(state, now())
  hero?.emit('feed', { payload: { item: 'paper' } })
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

/** Actions for the live hero character (regions.json), with a legacy fallback. */
function liveHeroActions(): readonly HeroRegionAction[] {
  return hero?.actors[0]?.bundle.regions?.actions ?? []
}

function currentHeroMenuActions(): readonly HeroMenuActionItem[] {
  const actions = liveHeroActions()
  if (actions.length === 0) return [{ action: 'pat', label: '摸头' }]
  return actions.map((action) => ({ action: action.id, label: action.label }))
}

/**
 * Character-specific hero menu action (dog fetch, cat stretch/run, human paper…).
 * Actions are data from regions.json: event + optional delayed follow-up.
 */
function handleHeroAction(actionId: string): void {
  const runtime = hero
  if (!runtime) return
  const nowMs = performance.now()
  if (nowMs - lastHeroActionAt < HERO_ACTION_COOLDOWN_MS) return
  lastHeroActionAt = nowMs
  const spec = liveHeroActions().find((action) => action.id === actionId)
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
        if (hero !== runtime) return
        try {
          hero.emit(step.event)
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
// Renaming changes the character setting -> per-action full TOS consent (never
// exempted by the first-run acceptance) before the prompt mutates state.
$('rename').addEventListener('click', () => void (async () => {
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
})().catch((error) => reportFailure(uiBoundary, error)))
const talkRecorder = new TalkRecorder({
  // The TalkRecorder owns the anti-double-click guard and all cleanup paths, so
  // two quick pointerdowns can never create a second MediaRecorder/microphone.
  getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }) as unknown as Promise<MediaStreamLike>,
  createRecorder: (stream) => new MediaRecorder(stream as unknown as MediaStream),
  createAudioContext: () => new AudioContext(),
  transcribe: (wav) => transcribeWav(wav),
  onState: (talkState: TalkState) => {
    $('talk').textContent = talkState === 'listening' ? '松开识别' : '按住说话'
    if (talkState === 'listening') hero?.setExpression('listening')
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

$('talk').addEventListener('pointerdown', (event) => {
  event.preventDefault()
  talkPointerDown = true
  startTalk()
})
// Every release path stops the tracks/timer and resets the button (P0-1).
$('talk').addEventListener('pointerup', () => void talkRecorder.stop())
$('talk').addEventListener('pointercancel', () => void talkRecorder.stop())
$('talk').addEventListener('lostpointercapture', () => void talkRecorder.stop())
// Track release while the first-run ASR dialog is open (the pointer leaves the
// hold-to-talk button to read/confirm the declaration); see beginTalkWithAsrConsent.
document.addEventListener('pointerup', () => {
  talkPointerDown = false
})
document.addEventListener('pointercancel', () => {
  talkPointerDown = false
})

/**
 * Single mute path shared by the panel button and the desktop settings dialog.
 * Enabling voice is an explicit TTS config change, so the declaration is
 * re-shown; muting stops any current playback immediately.
 */
function setMutedFromShell(next: boolean): void {
  if (!canInteract()) return
  if (state.muted === next) return
  state = setMuted(state, next)
  if (state.muted) voice.stop()
  else void requestTtsConfirmation(currentTtsConfig()).catch((error) => reportFailure(ttsBoundary, error))
  render()
}
$('mute').addEventListener('click', () => setMutedFromShell(!state.muted))

interface DpapiCipher { v: 1; p: 'dpapi'; data: string }
type SaveCipher = DpapiCipher | WebCryptoPayload
let saveWarningShown = false

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

async function encryptSave(plain: string): Promise<SaveCipher> {
  if (HAS_TAURI) {
    return { v: 1, p: 'dpapi', data: await invokeTimed<string>('protect_text', { text: plain }) }
  }
  return encryptMemory(plain)
}

async function decryptSave(cipher: unknown): Promise<string | null> {
  if (typeof cipher === 'string') {
    // Legacy Tauri saves stored DPAPI base64 without a wrapper.
    if (!HAS_TAURI) return null
    return invokeTimed<string>('unprotect_text', { encoded: cipher })
  }
  if (!cipher || typeof cipher !== 'object') return null
  const payload = cipher as SaveCipher
  if (payload.p === 'dpapi') {
    if (!HAS_TAURI) return null
    return invokeTimed<string>('unprotect_text', { encoded: payload.data })
  }
  if (payload.p === 'webcrypto') {
    if (HAS_TAURI) return null
    return decryptMemory(payload)
  }
  return null
}

let saveInFlight: Promise<void> | null = null
/**
 * True when the primary save existed but could not be parsed (or only the .bak
 * parsed). While set, autosave is paused and the next write must NOT replace the
 * known-good .bak with the corrupt primary (robustness audit P0-1).
 */
let saveRecoveryNeeded = false

async function saveNowInternal(): Promise<void> {
  // Safe read-only mode: no save/migration writes before explicit TOS consent.
  if (!canInteract()) throw new Error('consent-required')
  const plain = serializePet(state)
  // Defence in depth against a corrupted/inflated state filling the disk.
  const plainBytes = utf8ByteLength(plain)
  if (plainBytes > SECURITY_LIMITS.savePlainBytes) throw new Error(`save-too-large (${plainBytes}B)`)
  let cipher: SaveCipher
  try {
    cipher = await encryptSave(plain)
  } catch (error) {
    if (!saveWarningShown) {
      saveWarningShown = true
      showBubble('存档加密不可用，这次没有保存。')
    }
    throw error
  }
  const text = JSON.stringify({
    format: 'dsh-save',
    version: 2,
    gameId: 'pet',
    gameVersion: '0.1.0',
    savedAtMs: Date.now(),
    cipher,
  })
  if (HAS_TAURI) {
    await invokeTimed('write_save', { slot: SAVE_SLOT, text, backup: !saveRecoveryNeeded })
  } else {
    const key = `desktop-games/pet/${SAVE_SLOT}`
    // Keep the previous ciphertext as .bak so a corrupt new save is recoverable.
    // While recovering, never overwrite the known-good backup with the corrupt
    // primary (no plaintext is stored either way).
    if (!saveRecoveryNeeded) {
      const previous = safeGetItem(key)
      if (previous) safeSetItem(`${key}.bak`, previous)
    }
    const stored = safeSetItem(key, text)
    if (stored !== 'ok') throw new Error(`save-storage-${stored}`)
  }
  saveRecoveryNeeded = false
}

/**
 * Save entry: one in-flight write at a time (concurrent 30 s autosave + manual
 * clicks no longer race each other) and a save token bucket against click spam
 * (HARDENING P1-3). Failures still reject so callers log/show them.
 */
function saveNow(): Promise<void> {
  if (saveInFlight) return saveInFlight
  const decision = limits.save.tryConsume()
  if (!decision.allowed) return Promise.reject(new RateLimitError('save', decision.retryAfterMs))
  const attempt = saveNowInternal()
  saveInFlight = attempt
  void attempt.finally(() => {
    if (saveInFlight === attempt) saveInFlight = null
  }).catch(() => {
    // The rejection is surfaced to callers; this branch only detaches.
  })
  return attempt
}

async function saveAndPurgeBackup(): Promise<void> {
  await saveNow()
  if (HAS_TAURI) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('clear_save_backup', { slot: SAVE_SLOT })
    } catch (error) {
      reportFailure(saveBoundary, error)
    }
  } else {
    removeKey(`desktop-games/pet/${SAVE_SLOT}.bak`)
  }
}

interface ParsedSave { state: PetState; migrate: boolean }

async function parsePetSave(text: string): Promise<ParsedSave | null> {
  try {
    const envelope = JSON.parse(text) as unknown
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return null
    const record = envelope as Record<string, unknown>
    if (record.schema === 1 && typeof record.name === 'string') {
      return { state: deserializePet(text), migrate: true }
    }
    if (record.gameId !== 'pet') return null
    if (record.cipher !== undefined) {
      const plain = await decryptSave(record.cipher)
      if (!plain) return null
      return { state: deserializePet(plain), migrate: false }
    }
    // Legacy envelope: world + optional memoryEnc.
    const world = JSON.stringify(record.world)
    if (typeof record.crc32 === 'string' && record.crc32 !== crc32(world)) return null
    const state = deserializePet(world)
    if (record.memoryEnc !== undefined) {
      const plain = await decryptSave(record.memoryEnc)
      if (!plain) return null
      // Do not spread the decrypted memory JSON: rebuild it through the same
      // validated deserializer so a tampered snapshot cannot reach the state.
      let snapshot: unknown
      try {
        snapshot = JSON.parse(plain)
      } catch {
        return null
      }
      state.memory = deserializePet(JSON.stringify({ schema: 1, memory: snapshot, createdAtMs: state.createdAtMs })).memory
    }
    return { state, migrate: true }
  } catch {
    return null
  }
}

async function loadNow(): Promise<boolean> {
  // P1-1/P1-4: reading the save (and the legacy migration write it may trigger)
  // is a local-data load, so it is refused until explicit TOS consent. The UI
  // load button, bootPetOnce and the QA hook all go through this guard.
  if (!canInteract()) throw new Error('consent-required')
  saveRecoveryNeeded = false
  if (HAS_TAURI) {
    let sawReadableSave = false
    for (const backup of [false, true]) {
      let text: string
      try {
        text = await invokeTimed<string>('read_save', { slot: SAVE_SLOT, backup })
      } catch {
        // Missing/read-blocked slot is expected here; try the backup next.
        continue
      }
      sawReadableSave = true
      const parsed = await parsePetSave(text)
      if (!parsed) continue
      state = parsed.state
      // If the primary was unreadable but the backup parsed, keep the good .bak
      // untouched on the next write until the recovered primary is committed.
      saveRecoveryNeeded = backup
      render()
      if (parsed.migrate && !saveRecoveryNeeded) {
        void saveAndPurgeBackup().catch((error) => reportFailure(saveBoundary, error))
      }
      return true
    }
    // A readable but unparseable primary+backup must not be silently replaced by
    // the default state on the next 30 s autosave; require an explicit save.
    saveRecoveryNeeded = sawReadableSave
    return false
  }
  const key = `desktop-games/pet/${SAVE_SLOT}`
  let sawReadableSave = false
  for (const [index, candidate] of [key, `${key}.bak`].entries()) {
    const candidateText = safeGetItem(candidate)
    if (!candidateText) continue
    sawReadableSave = true
    const parsed = await parsePetSave(candidateText)
    if (!parsed) continue
    state = parsed.state
    saveRecoveryNeeded = index > 0
    render()
    if (parsed.migrate && !saveRecoveryNeeded) {
      void saveAndPurgeBackup().catch((error) => reportFailure(saveBoundary, error))
    }
    return true
  }
  saveRecoveryNeeded = sawReadableSave
  return false
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
      if (!ok) showBubble('还没有旧书页。')
    })
    .catch((error) => {
      reportFailure(loadBoundary, error)
      showBubble(toUserMessage(error))
    })
}
$('save').addEventListener('click', () => saveArchiveWithFeedback())
$('load').addEventListener('click', () => loadArchiveWithFeedback())
$('voice-cache').addEventListener('click', () => void (async () => {
  if (!HAS_TAURI) {
    showBubble('浏览器模式没有本地语音缓存。')
    return
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('voice_cache_clear')
    showBubble('语音缓存已清理。')
  } catch (error) {
    reportFailure(voiceBoundary, error)
    showBubble('清理失败，稍后再试。')
  }
})().catch((error) => reportFailure(voiceBoundary, error)))

const vol = $('vol') as HTMLInputElement
/**
 * Single volume-apply path (panel slider + desktop settings slider). Persists
 * the preference and updates the live audio gain; never runs before consent.
 */
function applyVolume(next: number): number {
  if (!canInteract()) return volume
  if (Number.isFinite(next)) volume = Math.max(0, Math.min(100, Math.round(next)))
  const stored = safeSetItem('desktop-games/pet/volume', String(volume))
  if (stored !== 'ok') reportFailure(storageBoundary, new Error(`volume-storage-${stored}`))
  if (audioGain) audioGain.gain.value = Math.max(0, Math.min(1, volume / 100))
  vol.value = String(volume)
  return volume
}
// Volume is part of the TTS config: re-confirm the TTS declaration on release
// (not on every slider tick) when voice is currently enabled.
function volumeCommitted(): void {
  if (!canInteract() || state.muted) return
  void requestTtsConfirmation(currentTtsConfig()).catch((error) => reportFailure(ttsBoundary, error))
}
vol.value = String(volume)
vol.addEventListener('input', () => {
  applyVolume(Number(vol.value))
})
vol.addEventListener('change', () => volumeCommitted())

const memoryScreen = $('memory-screen')
function renderMemoryBook(): void {
  const list = $('memory-list')
  list.replaceChildren()
  const memoryItems = Array.isArray(state.memory?.items) ? state.memory.items : []
  const items = memoryItems.filter((item) => item.status === 'active')
  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'memory-item'
    const label = document.createElement('span')
    label.textContent = item.text
    const kind = document.createElement('em')
    kind.textContent = item.layer
    const edit = document.createElement('button')
    edit.textContent = '改'
    edit.addEventListener('click', () => {
      if (!guardLocalAction('memory-modify')) return
      const next = window.prompt('改成什么？（最多 60 字）', item.text)
      if (!next) return
      state = correctPetMemory(state, item.id, next, now())
      void saveAndPurgeBackup().catch((error) => reportFailure(saveBoundary, error))
      renderMemoryBook()
      render()
    })
    const forget = document.createElement('button')
    forget.textContent = '忘'
    forget.addEventListener('click', () => {
      if (!guardLocalAction('memory-forget')) return
      if (!window.confirm('让它忘掉这条？')) return
      state = forgetPetMemory(state, item.id, now())
      void saveAndPurgeBackup().catch((error) => reportFailure(saveBoundary, error))
      renderMemoryBook()
      render()
    })
    row.append(label, kind, edit, forget)
    list.appendChild(row)
  }
  if (items.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'memory-item'
    empty.textContent = '还没有折页。'
    list.appendChild(empty)
  }
}
$('memory-book').addEventListener('click', () => {
  if (!guardLocalAction('memory-open')) return
  renderMemoryBook()
  memoryScreen.classList.remove('hidden')
})
$('memory-forget-all').addEventListener('click', () => {
  if (!guardLocalAction('memory-forget-all')) return
  if (!window.confirm('让它忘掉所有折页？这不能撤销。')) return
  const memoryItems = Array.isArray(state.memory?.items) ? state.memory.items : []
  for (const item of memoryItems.filter((entry) => entry.status === 'active')) {
    state = forgetPetMemory(state, item.id, now())
  }
  void saveAndPurgeBackup().then(() => {
    renderMemoryBook()
    render()
    showBubble('折页都抚平了。')
  }).catch((error) => {
    reportFailure(saveBoundary, error)
    showBubble(toUserMessage(error))
  })
})
$('save-export').addEventListener('click', () => void (async () => {
  if (!guardLocalAction('save-export')) return
  const pass = window.prompt('设置备份口令（至少 8 位；丢失无法恢复）')
  if (!pass) return
  if (pass.length < 8) { showBubble('口令至少 8 位。'); return }
  const again = window.prompt('再输一次口令')
  if (again !== pass) { showBubble('两次口令不一致。'); return }
  try {
    const file = await exportPortable(serializePet(state), pass)
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'pagefold-save.json'
    link.click()
    URL.revokeObjectURL(url)
    showBubble('备份已导出。口令别丢。')
  } catch (error) {
    reportFailure(importBoundary, error)
    showBubble(toUserMessage(error))
  }
})().catch((error) => reportFailure(importBoundary, error)))

$('save-delete').addEventListener('click', () => void (async () => {
  if (!guardLocalAction('save-delete')) return
  if (!window.confirm('删除本机存档？记忆、状态、折页都会清掉。')) return
  if (!window.confirm('再确认一次：删除后只能靠之前的加密备份恢复。')) return
  try {
    if (HAS_TAURI) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('delete_save', { slot: SAVE_SLOT })
    } else {
      const key = `desktop-games/pet/${SAVE_SLOT}`
      removeKey(key)
      removeKey(`${key}.bak`)
    }
    // MB-011: once the corrupt primary+backup are gone, this session is no
    // longer recovering from a bad archive: resume autosave so the fresh state
    // is committed on the next 30 s tick instead of staying paused forever.
    saveRecoveryNeeded = false
    state = createPet(now())
    render()
    renderMemoryBook()
    showBubble('本机存档已删除，自动保存已恢复。')
  } catch (error) {
    reportFailure(importBoundary, error)
    showBubble('删除失败，请手动清理应用数据。')
  }
})().catch((error) => reportFailure(importBoundary, error)))

$('save-import').addEventListener('click', () => {
  if (!canInteract()) return
  ;($('save-import-file') as HTMLInputElement).click()
})
// Portable-save import is a content import: every import shows the FULL TOS via
// importPortableWithConsent() before the file is read/decrypted or any save is
// written. An earlier acceptance is not a waiver; declining aborts here.
$('save-import-file').addEventListener('change', () => void (async () => {
  const input = $('save-import-file') as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !canInteract()) return
  const gate = getConsentGate()
  if (!gate) return
  // Portable-file size cap before reading/decrypting an attacker-sized JSON.
  if (file.size > SECURITY_LIMITS.portableFileBytes) {
    showBubble('备份文件太大，已拒绝导入。')
    return
  }
  if (!window.confirm('导入会覆盖当前存档，继续？')) return
  const pass = window.prompt('输入备份口令')
  if (!pass) return
  const imported = await importBoundary.guardAsync(async () => {
    const plain = await importPortableWithConsent(gate, file, pass, async (selected, passphrase) => {
      const text = await (selected as File).text()
      if (utf8ByteLength(text) > SECURITY_LIMITS.portableFileBytes) throw new Error('portable-file-too-large')
      return importPortable(JSON.parse(text), passphrase)
    })
    const nextState = deserializePet(plain)
    state = nextState
    await saveAndPurgeBackup()
    return true
  })
  if (!imported.ok) {
    if (imported.error instanceof ConsentDeclinedError) {
      showBubble('已取消导入：未同意完整免责声明。')
      return
    }
    showBubble('导入失败：口令不对或文件损坏。')
    return
  }
  render()
  renderMemoryBook()
  showBubble('存档已导入。')
})().catch((error) => reportFailure(importBoundary, error)))

$('memory-export').addEventListener('click', () => {
  if (!guardLocalAction('memory-export')) return
  const blob = new Blob([JSON.stringify(state.memory, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'pagefold-memory.json'
  link.click()
  URL.revokeObjectURL(url)
})
$('memory-close').addEventListener('click', () => memoryScreen.classList.add('hidden'))

/**
 * 复位窗口 entry shared by the panel button, the desktop menu and settings.
 *
 * W-01/W-02 (UX-P0-4): the Tauri host owns placement via the Rust
 * `reset_pet_window` command, which is taskbar-aware and identical to the tray
 * recall action. The direct window-API path stays as a fallback for older hosts
 * or a rejected IPC call.
 */
function resetPetWindow(): void {
  void (async () => {
    if (!HAS_TAURI) return
    let moved = false
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('reset_pet_window')
      moved = true
    } catch {
      // Fall through to the window-API fallback; its failure is reported below.
    }
    if (!moved) {
      try {
        const { getCurrentWindow, currentMonitor, PhysicalPosition } = await import('@tauri-apps/api/window')
        const monitor = await currentMonitor()
        if (!monitor) return
        const win = getCurrentWindow()
        const size = await win.outerSize()
        const x = monitor.position.x + monitor.size.width - size.width - 12
        const y = monitor.position.y + monitor.size.height - size.height - 12
        await win.setPosition(new PhysicalPosition(x, y))
        moved = true
      } catch (error) {
        reportFailure(storageBoundary, error)
        return
      }
    }
    if (moved) {
      // The content window must not clear the pet's saved position; Rust already
      // recalled the PET window in that case.
      if (!CONTENT_SHELL) removeKey(WINDOW_KEY)
      showBubble('回到右下角。')
    }
  })().catch((error) => reportFailure(uiBoundary, error))
}
$('reset-window').addEventListener('click', () => resetPetWindow())
// The independent content/settings window (MB-062) never autosaves: it may run
// next to the live pet window, and only the pet window owns the archive's
// background writes. Manual 保存/读取 from its reused settings dialog still work.
if (!CONTENT_SHELL) {
  setInterval(() => {
    if (!canInteract() || saveRecoveryNeeded) return
    void saveNow().catch((error) => {
      if (!(error instanceof RateLimitError)) reportFailure(saveBoundary, error)
    })
  }, 30_000)
}
if (typeof document !== 'undefined' && !CONTENT_SHELL) {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && canInteract() && !saveRecoveryNeeded) {
      void saveNow().catch((error) => {
        if (!(error instanceof RateLimitError)) reportFailure(saveBoundary, error)
      })
    }
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
  // P1-4: mirror the accepted TOS into the host (Rust) so IPC commands can
  // verify consent; if a `--game=` launch was held at startup, the host opens
  // that window and closes this gate window, so skip the rest of the boot.
  const hostConsent = await syncHostConsent(consentSnapshot())
  if (hostConsent?.launched) return
  // loadNow() may throw (corrupt/unreadable save); never leave the boot chain
  // unhandled or boot a half-rendered pet (P0-2).
  const loaded = await loadBoundary.guardAsync(() => loadNow())
  if (!loaded.ok) {
    // Plain, reachable next steps (no dead-end instruction): the menu offers 保存
    // (writes a new archive without touching the good .bak), and a full local
    // data wipe restarts from a clean archive. Autosave stays paused until one
    // of those happens, so a corrupt archive is never silently overwritten.
    showBubble(
      saveRecoveryNeeded
        ? '存档损坏，已保留备份：可在「更多 → 保存」写入新档，或「更多 → 删除全部本地数据」重新开始；期间不会自动覆盖旧档。'
        : '旧存档没读出来，先用默认状态。',
    )
  } else if (saveRecoveryNeeded) {
    showBubble('已从备份恢复：可在「更多 → 保存」写入新档，收回损坏的主档。')
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
  await startHeroPage()
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
    selection: (): ContentSelection | null => contentRuntime?.selection ?? null,
    dialoguePack: (): string | null => dialogueBehavior?.packId ?? null,
    installedPacks: (): number => contentRuntime?.installedPacks.length ?? 0,
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
      renderMemoryBook()
      return true
    },
    exportPortable,
    importPortable,
    saveEngine: () => (HAS_TAURI ? 'dpapi' : 'webcrypto'),
    heroSnapshot: () => (hero ? hero.snapshot() : null),
    /** Manual/QA event hook (also the future Pet Brief consumer entry: `remind`). */
    heroEmit: (event: string, actorId?: string) => (hero ? hero.emit(event, actorId ? { actorId } : {}) : null),
  },
}


const WINDOW_KEY = 'desktop-games/pet/window'

async function saveWindowPosition(): Promise<void> {
  if (!HAS_TAURI) return
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const position = await getCurrentWindow().outerPosition()
    const stored = safeSetItem(WINDOW_KEY, JSON.stringify({ x: position.x, y: position.y }))
    if (stored !== 'ok') reportFailure(storageBoundary, new Error(`window-position-storage-${stored}`))
  } catch (error) {
    reportFailure(storageBoundary, error)
  }
}

async function restoreWindowPosition(): Promise<void> {
  if (!HAS_TAURI) return
  const raw = safeGetItem(WINDOW_KEY)
  if (!raw) return
  try {
    const saved = JSON.parse(raw) as { x: number; y: number }
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return
    const { getCurrentWindow, PhysicalPosition, currentMonitor } = await import('@tauri-apps/api/window')
    const win = getCurrentWindow()
    const monitor = await currentMonitor()
    if (monitor && monitor.position && monitor.size) {
      const left = monitor.position.x
      const top = monitor.position.y
      const right = left + monitor.size.width
      const bottom = top + monitor.size.height
      if (saved.x < left - 200 || saved.x > right - 40 || saved.y < top - 40 || saved.y > bottom - 40) {
        return
      }
    }
    await win.setPosition(new PhysicalPosition(saved.x, saved.y))
  } catch (error) {
    reportFailure(storageBoundary, error)
  }
}

// Pet-window placement is pet-only: the content window is a normal decorated
// window, and both windows share localStorage, so it must never overwrite the
// stored pet position (nor save its own).
if (HAS_TAURI && !CONTENT_SHELL) {
  setTimeout(() => void restoreWindowPosition(), 600)
  document.querySelector('header')?.addEventListener('pointerup', () => {
    setTimeout(() => void saveWindowPosition(), 160)
  })
  window.addEventListener('beforeunload', () => void saveWindowPosition())
}

// ---------------------------------------------------------------------------
// Hero renderer (Phase 2 integration; feature-flagged, default OFF)
// ---------------------------------------------------------------------------
// `pet.html` keeps the folded-paper `#pet` DOM forever: hero mode only hides it
// with CSS `visibility` (rect preserved for layout E2E) after the first hero
// frame succeeded. Every failure path below falls back in one direction — the
// DOM reappears, `__pet.hero = {enabled, ok:false, reason}` explains why, and
// nothing is written to the save file or localStorage.

function setHeroStatus(status: HeroStatus): void {
  const pet = (window as any).__pet as { hero?: HeroStatus } | undefined
  if (pet) pet.hero = status
}

function stopHeroLoop(): void {
  if (heroRaf !== null) {
    cancelAnimationFrame(heroRaf)
    heroRaf = null
  }
}

/**
 * Minimal non-art hero state in the DOM (first-frame loading / no character /
 * failure). `heroPlaceholderView()` decides the state and text without reading
 * raw errors, so no local paths or fake character assets reach the UI.
 */
function setHeroPlaceholder(view: HeroPlaceholderView): void {
  const element = document.getElementById('hero-placeholder')
  if (!element) return
  element.dataset.state = view.state
  element.hidden = view.state === 'off'
  const text = element.querySelector<HTMLElement>('.hero-placeholder-text')
  if (text) text.textContent = view.text
  const dot = element.querySelector<HTMLElement>('.hero-placeholder-dot')
  if (dot) dot.hidden = view.state !== 'loading'
}

function fallbackHero(reason: string, error?: unknown): void {
  stopHeroLoop()
  const stage = document.getElementById('hero-stage')
  if (stage) (stage as HTMLElement).hidden = true
  if (heroCanvasEl) {
    heroCanvasEl.style.transform = ''
    heroCanvasEl.style.translate = ''
    heroCanvasEl.style.scale = ''
    delete heroCanvasEl.dataset.heroFlip
    heroCanvasEl.classList.remove('dragging')
  }
  heroMove.offset = 0
  heroMove.active = false
  hero?.dispose()
  hero = null
  heroCtx = null
  document.documentElement.removeAttribute('data-pet-render')
  delete document.documentElement.dataset.heroCanvas
  delete document.documentElement.dataset.heroScale
  setHeroStatus({ enabled: HERO_CONFIG.enabled, ok: false, reason })
  // Not console-only (audit U3/D5): show loading/empty/error instead of the
  // silent folded-paper fallback. The warn stays for local debugging.
  setHeroPlaceholder(heroPlaceholderView('failed', reason))
  console.warn('[pet] hero renderer fell back to the folded-paper DOM:', reason, error ?? '')
}

function heroFrame(timestamp: number): void {
  heroRaf = null
  if (!hero || !heroCtx) return
  // A hidden window pauses the loop; the scene clock is kept, so resuming does
  // not fast-forward through the hidden time (and the legacy DOM path is
  // untouched either way).
  if (document.visibilityState === 'hidden') return
  const dt = Math.max(0, Math.min(250, timestamp - heroLastFrameMs))
  heroLastFrameMs = timestamp
  // 减少动态 (pet.css tokens + this loop): freeze the scene clock and skip
  // tick/locomotion, so the canvas stays a static pose. Emits/speech still
  // change renderKey, which redraws exactly one still frame below.
  const reducedMotion = document.documentElement.dataset.reduceMotion === '1'
  if (!reducedMotion) heroSceneNow += dt
  try {
    if (!reducedMotion) hero.tick(heroSceneNow)
    // 6-14 fps art on a 60 Hz host: redraw only when a frame actually changed.
    const renderKey = hero.renderKey(heroSceneNow)
    const renderedKey = heroCanvasEl?.dataset.heroRenderKey
    if (!heroCanvasEl || renderedKey !== renderKey || heroCanvasEl.width === 0) {
      hero.render(heroCtx, heroSceneNow)
      if (heroCanvasEl) {
        heroCanvasEl.dataset.heroRenderKey = renderKey
        // Frame-stable key used by hit-regions to cache alpha masks.
        heroCanvasEl.dataset.heroFrameKey = hero.actors.map((actor) => {
          const frame = hero?.actorFrame(actor.id, heroSceneNow)
          return frame ? `${actor.id}:${frame.tag}:${frame.frame}` : `${actor.id}:none`
        }).join('|')
      }
    }
    if (!reducedMotion) applyHeroLocomotion(dt)
  } catch (error) {
    fallbackHero(`render-failed: ${error instanceof Error ? error.message : String(error)}`, error)
    return
  }
  heroRaf = requestAnimationFrame(heroFrame)
}

/**
 * Real left/right travel for cat/dog run clips. The hero canvas is translated
 * inside the transparent window (and mirrored when running left) instead of
 * animating legs in place; idle snaps back. Human and folded-paper are untouched.
 */
function applyHeroLocomotion(dtMs: number): void {
  const canvas = heroCanvasEl
  if (!canvas || !hero) return
  const character = HERO_CONFIG.character
  const canMove = character === 'cat' || character === 'dog'
  const actorId = hero.actors[0]?.id
  const tag = actorId ? hero.actorFrame(actorId, heroSceneNow)?.tag : undefined
  const moving = canMove && (tag === 'run' || tag === 'ball_chase')
  if (!moving) {
    if (!heroMove.active && heroMove.offset === 0) return
    // Ease back to the resting position; keep the current facing until settled.
    heroMove.active = false
    heroMove.offset *= 0.78
    if (Math.abs(heroMove.offset) < 1) {
      heroMove.offset = 0
      canvas.style.translate = ''
      canvas.style.scale = ''
      delete canvas.dataset.heroFlip
      return
    }
    canvas.style.translate = `${Math.round(heroMove.offset)}px 0px`
    return
  }
  const width = canvas.clientWidth || 192
  const max = Math.max(24, Math.min(150, (window.innerWidth - width) / 2 - 12))
  const speed = tag === 'ball_chase' ? 135 : 105
  heroMove.active = true
  heroMove.offset += heroMove.dir * (speed * Math.max(0, Math.min(120, dtMs))) / 1000
  if (heroMove.offset > max) {
    heroMove.offset = max
    heroMove.dir = -1
  } else if (heroMove.offset < -max) {
    heroMove.offset = -max
    heroMove.dir = 1
  }
  // The side-view run art faces LEFT (head on the left). Mirror it when the
  // actor travels RIGHT so the visible facing always matches the movement;
  // `heroFlip` is consumed by the alpha-tile hit regions for coordinate mapping.
  const mirrored = heroMove.dir > 0
  canvas.style.translate = `${Math.round(heroMove.offset)}px 0px`
  canvas.style.scale = `${mirrored ? -1 : 1} 1`
  canvas.dataset.heroFlip = mirrored ? '1' : '0'
}

function startHeroLoop(): void {
  if (!hero || heroRaf !== null || document.visibilityState === 'hidden') return
  heroLastFrameMs = performance.now()
  heroRaf = requestAnimationFrame(heroFrame)
}

/** Pointer → hero events. A real drag (>6 px) in the Tauri window starts the
 *  native window move via `startDragging()`; the canvas deliberately avoids
 *  `data-tauri-drag-region` so a short tap still reaches the hero hit test.
 *
 *  Coordinates: `hitActor`/the render backend work in canvas-local CSS pixels.
 *  The canvas backing store is `layout * devicePixelRatio` (see
 *  `startHeroRuntime({dpr})`) and the 2D context is DPR-transformed, but the CSS
 *  size and all pointer/hit-test maths stay CSS pixels. The hero canvas is no
 *  longer CSS-transformed by the desktop shell (only the legacy `.fold-pet` is
 *  `--pet-scale`d), so the client-width / rect-width ratio is normally 1; it is
 *  still applied as a safety net for browser zoom or any future CSS transform.
 */
function attachHeroPointer(canvas: HTMLCanvasElement): void {
  let activePointer: number | null = null
  let startX = 0
  let startY = 0
  let startedAt = 0
  let dragging = false
  let dragActorId: string | undefined
  let windowDrag = false

  /** Layout pixels per visual (getBoundingClientRect) pixel; 1 when untransformed. */
  const layoutRatio = (): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    return {
      x: rect.width > 0 && canvas.clientWidth > 0 ? canvas.clientWidth / rect.width : 1,
      y: rect.height > 0 && canvas.clientHeight > 0 ? canvas.clientHeight / rect.height : 1,
    }
  }

  const localPoint = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect()
    const ratio = layoutRatio()
    return { x: (event.clientX - rect.left) * ratio.x, y: (event.clientY - rect.top) * ratio.y }
  }

  const endPointer = (event: PointerEvent): void => {
    if (activePointer !== event.pointerId) return
    const wasDragging = dragging
    activePointer = null
    dragging = false
    canvas.classList.remove('dragging')
    canvas.style.transform = ''
    try {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    } catch {}
    if (wasDragging) {
      const dragOptions = dragActorId ? { actorId: dragActorId } : {}
      hero?.emit('drag.end', dragOptions)
      hero?.emit('land', dragOptions)
    }
    dragActorId = undefined
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (!hero || event.button !== 0) return
    ensureAudio()
    void audioContext?.resume()
    activePointer = event.pointerId
    startX = event.clientX
    startY = event.clientY
    startedAt = performance.now()
    dragging = false
    const point = localPoint(event)
    dragActorId = hero.hitActor(point.x, point.y)?.id
    try {
      canvas.setPointerCapture(event.pointerId)
    } catch {}
    event.preventDefault()
  })

  canvas.addEventListener('pointermove', (event) => {
    if (!hero || activePointer !== event.pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    // In the desktop window a drag must move the window itself, not leave a
    // sprite translated in place (the latter made switching from folded paper
    // to a hero character look like "dragging stopped working"). The local
    // sprite-follow path stays for browser/QA builds.
    if (!dragging && !windowDrag && shouldStartWindowDrag(HAS_TAURI, Math.hypot(dx, dy))) {
      windowDrag = true
      const point = localPoint(event)
      const target = hero.hitActor(point.x, point.y)
      dragActorId = target?.id ?? dragActorId
      const dragOptions = dragActorId ? { actorId: dragActorId } : {}
      hero.emit('drag.start', dragOptions)
      activePointer = null
      canvas.classList.remove('dragging')
      canvas.style.transform = ''
      try {
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      } catch {}
      const actorId = dragActorId
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
        .catch((error: unknown) => {
          console.warn('[pet] native window drag unavailable', error)
        })
        .finally(() => {
          // The OS move loop ends before the next pointer sequence. Finish the
          // semantic drag so animations/state settle and a later press is clean.
          try {
            if (actorId) {
              hero?.emit('drag.end', { actorId })
              hero?.emit('land', { actorId })
            } else {
              hero?.emit('drag.end')
              hero?.emit('land')
            }
          } catch {}
          dragActorId = undefined
          windowDrag = false
        })
      return
    }
    if (!dragging && Math.hypot(dx, dy) >= 4) {
      dragging = true
      canvas.classList.add('dragging')
      const point = localPoint(event)
      const target = hero.hitActor(point.x, point.y)
      dragActorId = target?.id ?? dragActorId
      hero.emit('drag.start', dragActorId ? { actorId: dragActorId } : {})
    }
    // Phase 2: the sprite follows the pointer locally and snaps back on
    // pointerup (not persisted; no window dragging from the canvas). Translate
    // in layout px so a CSS-scaled stage (desktop shell) keeps pointer tracking.
    if (dragging) {
      const ratio = layoutRatio()
      canvas.style.transform = `translate(${dx * ratio.x}px, ${dy * ratio.y}px)`
    }
  })

  canvas.addEventListener('pointerup', (event) => {
    if (windowDrag) return
    if (!hero || activePointer !== event.pointerId) return
    const wasDragging = dragging
    const elapsed = performance.now() - startedAt
    if (!wasDragging && elapsed < 500) {
      const point = localPoint(event)
      // Region hit-test first (art-pixel rects, zoom-independent). Packs with a
      // regions.json only react inside their declared zones/state whitelist; a
      // tap on a transparent/undefined area is intentionally a no-op instead
      // of a whole-body pat. Legacy packs without regions keep the old pat.
      const hit = hero.hitRegion(point.x, point.y)
      if (hit) {
        const nowMs = performance.now()
        const key = `${hit.actor.id}:${hit.region.id}`
        const lastRegionAt = lastRegionTouchAt.get(key) ?? Number.NEGATIVE_INFINITY
        if (nowMs - lastHeroTouchAt < HERO_TOUCH_COOLDOWN_MS || nowMs - lastRegionAt < HERO_REGION_COOLDOWN_MS) {
          endPointer(event)
          return
        }
        lastHeroTouchAt = nowMs
        lastRegionTouchAt.set(key, nowMs)
        const state = hero.actorState(hit.actor.id) ?? 'idle'
        const config = hit.actor.bundle.regions
        const reaction = config ? resolveHeroRegionReaction(config, hit.region.id, state, 'tap') : null
        if (reaction) doHeroRegionTouch(hit.actor.id, reaction)
      } else {
        const target = hero.hitActor(point.x, point.y)
        if (target && !target.bundle.regions) doPat(target.id)
        else if (!target) hero.emit('click')
      }
    }
    endPointer(event)
  })

  canvas.addEventListener('pointercancel', (event) => endPointer(event))
  canvas.addEventListener('pointerenter', () => {
    if (activePointer === null) hero?.emit('hover')
  })
  canvas.addEventListener('pointerleave', () => {
    if (activePointer === null) hero?.emit('leave')
  })
}

async function startHeroPage(): Promise<void> {
  setHeroStatus(heroStatus(HERO_CONFIG, null))
  // First-run/boot state: the DOM says "loading" while the opt-in renderer
  // loads its first frame; the default (flag-off) path stays quiet.
  setHeroPlaceholder(heroPlaceholderView(HERO_CONFIG.enabled ? 'loading' : 'disabled'))
  if (!HERO_CONFIG.enabled) return
  const stage = document.getElementById('hero-stage')
  const requestedRaw = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('character')?.trim().toLowerCase() : null
  // DLC/pack id is used to build `/characters/<id>/`: validate it as ONE safe
  // relative path segment before any path concatenation (security path-safety).
  const requestedPath = requestedRaw ? checkRelativePath(requestedRaw, { maxSegments: 1, maxChars: 64 }) : null
  const requestedCharacter = requestedPath?.ok && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(requestedPath.normalized)
    ? requestedPath.normalized
    : null
  // Known 0.1/0.2 characters use the canvas path. Any other safe id is treated
  // as an FCI 0.3 behavior-only pack preview (e.g. imported L2 packs); no art is
  // faked and the existing canvas path is untouched.
  if (requestedCharacter && !isHeroCharacterId(requestedCharacter)) {
    if (!stage) {
      fallbackHero('behavior-preview-failed: hero-stage missing')
      return
    }
    // Non-built-in character ids are DLC/pack loads: show the FULL TOS for this
    // specific load and abort to the built-in folded-paper pet when declined.
    const gate = getConsentGate()
    if (!gate) {
      fallbackHero('consent-runtime-missing')
      return
    }
    let preview: Awaited<ReturnType<typeof startTinglanPreview>>
    try {
      preview = await loadCharacterPackWithConsent(gate, requestedCharacter, () =>
        startTinglanPreview(stage, `/characters/${requestedCharacter}/`),
      )
    } catch (error) {
      if (error instanceof ConsentDeclinedError) {
        fallbackHero('consent-declined: character-pack')
        return
      }
      throw error
    }
    if (!preview.ok) {
      fallbackHero(preview.reason ?? 'behavior-preview-failed')
      return
    }
    document.documentElement.dataset.petRender = 'tinglan-preview'
    setHeroStatus({ enabled: true, ok: true, reason: `behavior-preview:${requestedCharacter}` })
    setHeroPlaceholder(heroPlaceholderView('ready'))
    return
  }
  const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement | null
  try {
    if (!stage || !canvas) throw new Error('hero-stage/hero-canvas missing from pet.html')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('hero canvas has no 2d context')
    const book = document.querySelector('.book')
    const rect = book?.getBoundingClientRect()
    const hour = new Date().getHours()
    const night = hour >= 23 || hour < 6
    const runtimeOptions = {
      config: HERO_CONFIG,
      canvas,
      ctx,
      stage: { width: rect?.width ?? window.innerWidth, height: rect?.height ?? window.innerHeight },
      // DPR is clamped: a fake/very high DPR would allocate a huge backing store.
      dpr: typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
        ? Math.min(3, Math.max(1, window.devicePixelRatio))
        : 1,
      sleeping: night,
    }
    // P1-4: a non-built-in hero character (e.g. ?character=tinglan, which is a
    // non-final DLC concept preview) must pass the same full-TOS per-load gate as
    // other character packs. Built-in humanoid/cat/dog stay covered by the
    // first-run TOS and are deliberately exempt from the per-load prompt.
    let result: Awaited<ReturnType<typeof startHeroRuntime>>
    if (!isBuiltinCharacterId(HERO_CONFIG.character)) {
      const gate = getConsentGate()
      if (!gate) {
        fallbackHero('consent-runtime-missing')
        return
      }
      try {
        result = await loadCharacterPackWithConsent(gate, HERO_CONFIG.character, () => startHeroRuntime(runtimeOptions))
      } catch (error) {
        if (error instanceof ConsentDeclinedError) {
          fallbackHero('consent-declined: character-pack')
          return
        }
        throw error
      }
    } else {
      result = await startHeroRuntime(runtimeOptions)
    }
    if (!result.ok) {
      fallbackHero(result.reason, result.error)
      return
    }
    hero = result.runtime
    heroCanvasEl = canvas
    heroCtx = ctx
    heroNight = night
    attachHeroPointer(canvas)
    // Atomic switch only after the first frame succeeded: unhide the stage,
    // then hide `#pet` via CSS (rect kept); the bubble/buttons keep working.
    stage.hidden = false
    document.documentElement.dataset.petRender = 'hero'
    // QA hook: the fitted CSS canvas/display scale (e.g. 256x256@1 or
    // 128x128@0.125), plus the device-pixel backing store ratio.
    document.documentElement.dataset.heroCanvas = `${result.runtime.layout.width}x${result.runtime.layout.height}`
    document.documentElement.dataset.heroScale = String(result.runtime.layout.scale)
    document.documentElement.dataset.heroDpr = String(canvas.width / Math.max(1, result.runtime.layout.width))
    setHeroStatus(heroStatus(HERO_CONFIG, result))
    setHeroPlaceholder(heroPlaceholderView('ready'))
    heroSceneNow = 0
    document.addEventListener('visibilitychange', () => {
      if (!hero) return
      if (document.visibilityState === 'hidden') stopHeroLoop()
      else startHeroLoop()
    })
    startHeroLoop()
  } catch (error) {
    fallbackHero(`start-failed: ${error instanceof Error ? error.message : String(error)}`, error)
  }
}

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
    const brief = controller.lastBrief
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
    onDirective: (directive) => {
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
          hero?.speak({ text: reviewed.displayText, emotion: 'calm', durationMs: directive.ttlMs || 4000 })
        }
        if (directive.sourceType === 'commitment.due') hero?.emit('remind')
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
  // the hidden node, it still goes through the same gate: age self-report check
  // BEFORE any form; unverified => `age-required`, minor => `minor`; every
  // start/settings change re-prompts the full TOS + roleplay declaration and
  // re-fills the form; TOS/TTS/ASR never substitute for it.
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
 * age self-report check (no roleplay state/form for unverified or minor users),
 * then ALWAYS re-runs the full TOS + separate roleplay declaration + mandatory
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
      const message = '角色扮演仅限年满 18 周岁用户：请先在 About 完成年龄核验（自报出生日期）后再开始；一般功能仍可使用。'
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

// ---------------------------------------------------------------------------
// Independent content/settings window boot (MB-062 / E6, task-85)
//
// Same modules as the pet window: ensureContentRuntime() builds the role content
// center, desktop-shell.ts builds the #pet-settings dialog, and the shared
// consent gate gates both. This section only routes between the home surface and
// the two panels and bridges role/appearance edits back to the live pet window.
// ---------------------------------------------------------------------------
function presentContentWindowRoute(route: ContentWindowRoute): void {
  const target = normalizeContentWindowRoute(route)
  contentWindowTransition = true
  try {
    if (target === 'settings') {
      contentRuntime?.hub?.close(false)
      contentWindowChrome?.hideHome()
      const focus = takeContentWindowFocus(contentStorage())
      if (!openDesktopSettingsDialog(focus ?? undefined)) contentWindowChrome?.showHome()
      return
    }
    closeDesktopSettingsDialog(false)
    contentWindowChrome?.hideHome()
    void openContentHubInWindow()
      .then((opened) => {
        if (!opened) contentWindowChrome?.showHome()
      })
      .catch((error) => {
        reportFailure(uiBoundary, error)
        contentWindowChrome?.showHome()
      })
  } finally {
    contentWindowTransition = false
  }
}

/**
 * Boot the content window: load the pet archive once (read-only; the settings
 * dialog reuses mute/volume/save/load from it), build the shared content runtime
 * and settings dialog, then show the requested panel. Never boots the pet loop,
 * hero, Advisers, hit regions or autosave.
 */
async function bootContentWindowOnce(): Promise<void> {
  if (contentWindowBooted) return
  contentWindowBooted = true
  try {
    // Read-only load; a corrupt archive keeps the defaults and the dialog still
    // works. There is no autosave in this window (see the guarded interval).
    await loadNow()
  } catch (error) {
    reportFailure(loadBoundary, error)
  }
  renderVoiceMode()
  render()
  await ensureContentRuntime()
  contentWindowChrome = installContentWindowChrome({
    document,
    openRoute: presentContentWindowRoute,
    closeWindow: closeContentWindow,
  })
  if (HAS_TAURI) {
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<string>(CONTENT_WINDOW_NAVIGATE_EVENT, (event) => {
          contentWindowChrome?.showRoute(normalizeContentWindowRoute(event.payload))
        }),
      )
      .catch((error: unknown) => {
        console.warn('[pet] content window navigation unavailable', error)
      })
  }
  contentWindowChrome.showRoute(CONTENT_WINDOW.route)
}

/** Content-window equivalent of startConsentApp: initialize -> consent -> panel. */
async function startContentWindowApp(): Promise<void> {
  try {
    startupStage = 'init'
    initializeApp()
    startupStage = 'consent'
    const mode = await bootstrapConsent()
    startupStage = mode === 'accepted' ? 'boot' : 'idle'
    if (mode === 'accepted') await bootContentWindowOnce()
    startupStage = 'idle'
  } catch (error) {
    showStartupFailure(error)
  }
}

// ---------------------------------------------------------------------------
// Boot orchestration (P1-4): initialize -> consent -> boot, never fail-open
// ---------------------------------------------------------------------------
type StartupStage = 'idle' | 'init' | 'consent' | 'boot'
let startupStage: StartupStage = 'idle'
let startupFailureScreen: StartupFailureScreen | null = null
let startupRetryInFlight = false

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
            contentWindowTransition = true
            try {
              contentWindowChrome?.showRoute(CONTENT_WINDOW.route)
            } finally {
              contentWindowTransition = false
            }
            requestPetWindowReload(false)
            return
          }
          const hostConsent = await syncHostConsent(consentSnapshot())
          if (hostConsent?.launched) return
          await runPetBoot()
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
        // instead of staying paused (MB-011).
        saveRecoveryNeeded = false
        state = createPet(now())
        // A full local-data wipe clears the quiet-hours preference too; fall
        // back to the safety default in this session as well.
        quietHoursSettings = readQuietHours()
        renderMemoryBook()
        document.getElementById('memory-screen')?.classList.add('hidden')
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
      // MB-062: the pet window's 设置… opens the independent settings window;
      // the content window reuses the SAME dialog and does not open a third.
      openSettingsWindow: CONTENT_SHELL ? undefined : openSettingsInContentWindow,
      onSettingsClosed: () => {
        if (!CONTENT_SHELL || contentWindowTransition) return
        contentWindowChrome?.showHome()
      },
      // The content window gets the same dialog renderer/persistence but no pet
      // right-click menu, coach or pet drag behavior.
      enableMenu: !CONTENT_SHELL,
      // Live getters: the shell initializes before hero boot, and the menu is
      // rendered on open, so it sees the actual renderer state each time.
      heroActive: () => hero !== null,
      getHeroActions: currentHeroMenuActions,
      onHeroAction: handleHeroAction,
      // 总设置 dialog wiring (task-65): every control reuses an existing
      // audited path above instead of duplicating mute/volume/save/reset logic.
      getAudioState: () => ({ muted: state.muted, volume }),
      setMuted: setMutedFromShell,
      setVolume: applyVolume,
      onVolumeCommit: volumeCommitted,
      // MB-070: mirror the persisted quiet-hours window without a reload.
      onQuietHoursChange: (next) => {
        quietHoursSettings = next
      },
      saveArchive: saveArchiveWithFeedback,
      loadArchive: loadArchiveWithFeedback,
      resetWindow: resetPetWindow,
      // The role & content center is above the body-level shell menu.
      isHigherModalOpen: () => contentRuntime?.hub?.isOpen() === true,
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
      if (detail && detail.open === true) contentRuntime?.hub?.close(false)
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
        })
        .catch((error: unknown) => {
          console.warn('[pet] tray exit listener unavailable', error)
        })
    }
  }
}

/**
 * A failed start must never leave a blank-but-interactive pet window (P1-4):
 * show the visible blocking screen and keep the original error logged (through
 * reportFailure + the sanitized short copy only — no path/URL in the UI).
 */
function hideStartupFailure(): void {
  if (!startupFailureScreen) return
  startupFailureScreen.hide()
  startupFailureScreen = null
  delete document.documentElement.dataset.startupFailure
  notifyStartupOverlay(false)
}

function showStartupFailure(error: unknown): void {
  reportFailure(uiBoundary, error)
  try {
    hideStartupFailure()
    startupFailureScreen = createStartupFailureScreen(document, {
      message: toUserMessage(error),
      onRetry: () => {
        void retryStartup()
      },
      onExit: () => exitApplication(),
    })
    // QA/E2E marker for the blocking state (the future browser E2E can assert it).
    document.documentElement.dataset.startupFailure = '1'
    notifyStartupOverlay(true)
  } catch (renderError) {
    // Last resort: the failure screen itself must not blank the window.
    reportFailure(uiBoundary, renderError)
    try {
      const fallback = document.createElement('div')
      fallback.id = 'startup-failure-fallback'
      fallback.className = 'consent-root'
      fallback.setAttribute('role', 'alert')
      fallback.textContent = '启动没有完成。请重试或退出应用。'
      document.body.appendChild(fallback)
      document.getElementById('pet-app')?.setAttribute('inert', '')
      document.documentElement.dataset.startupFailure = '1'
      notifyStartupOverlay(true)
    } catch {}
  }
}

/**
 * Single boot path: initialize the consent runtime BEFORE any pet interaction,
 * then `bootstrapConsent()` runs the mandated order
 *   1) first-run/upgrade AGE self-report verification (birth year/month/day,
 *      explicit confirmation, no prefill/default; 18+ age gate for age-gated
 *      features — the internal roleplay gate is retained), then
 *   2) the first-run/upgrade TOS,
 * and only then boots the pet. A later acceptance from the read-only screen (or
 * a retry) re-runs age -> TOS and boots the pet exactly once. There is no path
 * that silently skips age verification into normal interaction.
 */
async function startConsentApp(): Promise<void> {
  try {
    startupStage = 'init'
    initializeApp()
    startupStage = 'consent'
    const mode = await bootstrapConsent()
    // Mark the stage BEFORE the boot line so a throw inside bootPetOnce is
    // retried as a boot (not as a fresh consent prompt). The literal call form
    // is intentional: bootPetOnce runs only after the TOS gate resolves.
    startupStage = mode === 'accepted' ? 'boot' : 'idle'
    if (mode === 'accepted') await bootPetOnce()
    startupStage = 'idle'
  } catch (error) {
    // Keep startupStage at the failed stage so retryStartup() resumes correctly.
    showStartupFailure(error)
  }
}

/** Boot the pet after an accepted first-run/upgrade TOS; failures block the UI. */
async function runPetBoot(): Promise<void> {
  startupStage = 'boot'
  try {
    await bootPetOnce()
    startupStage = 'idle'
  } catch (error) {
    showStartupFailure(error)
  }
}

/** Retry from the blocking screen, resuming the stage that actually failed. */
async function retryStartup(): Promise<void> {
  if (startupRetryInFlight) return
  startupRetryInFlight = true
  hideStartupFailure()
  try {
    if (startupStage === 'boot') {
      // A failed boot may leave the "already booted" latch set; reset it so the
      // retry can actually run, then boot again (idempotent wiring guards keep
      // listeners from duplicating).
      if (CONTENT_SHELL) await startContentWindowApp()
      else {
        booted = false
        await runPetBoot()
      }
      return
    }
    if (startupStage === 'consent') {
      const gate = getConsentGate()
      if (gate && !canInteract()) {
        // A failed bootstrap cached a rejected bootPromise; the gate's retry
        // path clears it and re-shows the full TOS.
        const mode = await gate.retryInitialConsent()
        if (mode === 'accepted') {
          if (CONTENT_SHELL) await bootContentWindowOnce()
          else await runPetBoot()
        } else startupStage = 'idle'
        return
      }
    }
    // Init failure (or an unexpected stage): re-run the start path; completed
    // one-time wiring steps are skipped.
    if (CONTENT_SHELL) await startContentWindowApp()
    else {
      booted = false
      await startConsentApp()
    }
  } catch (error) {
    showStartupFailure(error)
  } finally {
    startupRetryInFlight = false
  }
}

if (CONTENT_SHELL) {
  // Independent content/settings window: boot only the content center/settings
  // surfaces, never the pet (no duplicate save loop, hero, Advisers or autosave).
  void startContentWindowApp().catch((error) => {
    showStartupFailure(error)
  })
} else {
  void startConsentApp().catch((error) => {
    // Last-resort net: startConsentApp handles its own failures, but a throw
    // before its try block must still block visibly. showStartupFailure logs the
    // original error once (reportFailure) and renders only the sanitized copy.
    showStartupFailure(error)
  })
}

