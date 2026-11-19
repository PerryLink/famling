/**
 * Pet animation system — shared data types (placeholder art era, 2026-11-18).
 *
 * Scope: this module is deliberately headless and framework-free (no DOM, no
 * hero.ts import, no singletons). It describes the animation *contract* that
 * the placeholder packs under `public/assets/pet/anim/<character>/` implement
 * and that the future live scheduler / renderer consumes:
 *
 *   ClipSpec   one named animation (frames / fps / loop / per-frame holds)
 *   FrameSpec  one PNG frame on disk + its slot in the clip timeline
 *   TrackSpec  a layering channel (base pose vs. overlay effect)
 *   BubbleSemantic  speech (solid bubble + voice allowed) vs.
 *                   thought (hollow bubble, never voiced)
 *
 * The frame-rate bands below are the recommendation from the 2D pixel action
 * game research: idle 4-8 FPS / 2-8 frames, walk 8-12 FPS / 6-8 frames,
 * run 10-16 FPS / 6-8 frames, attack 12-24 FPS with a NON-uniform rhythm
 * (slow charge, 1-2 hit frames, medium recovery). Tests pin the shipped clip
 * table to these bands, so a future art replacement cannot silently drift.
 */

/** Characters the animation subsystem ships placeholder clips for. */
export const ANIM_CHARACTERS = ['dog', 'cat', 'human'] as const
export type AnimCharacter = (typeof ANIM_CHARACTERS)[number]

/** Every clip id in the v0.1 animation contract. */
export const CLIP_IDS = [
  'idle',
  'idle_blink',
  'walk',
  'run',
  'pat_head',
  'ball_throw',
  'ball_chase',
  'paw_face',
  'scratch',
  'stand_wag',
  'chase_tail',
  'attack',
] as const
export type ClipId = (typeof CLIP_IDS)[number]

/** Idle micro-actions the seeded scheduler may fire on its own. */
export const RANDOM_MICRO_ACTION_IDS = ['paw_face', 'scratch', 'stand_wag', 'chase_tail'] as const
export type RandomMicroAction = (typeof RANDOM_MICRO_ACTION_IDS)[number]

/** Layering channel. `base` owns the body; `overlay` draws on top of it. */
export type TrackId = 'base' | 'overlay'

export interface TrackSpec {
  readonly id: TrackId
  readonly clips: readonly ClipId[]
  readonly description: string
}

/**
 * Track layout used by the placeholder packs and the scheduler. The current
 * hero renderer can only show one tag at a time, so `idle_blink` is generated
 * as a full replacement pose (see the integration notes in
 * docs/design/PET-ANIMATION-2026-11-18.md); a future compositor may treat it
 * as a true overlay.
 */
export const TRACKS: readonly TrackSpec[] = [
  {
    id: 'base',
    clips: ['idle', 'walk', 'run', 'pat_head', 'ball_throw', 'ball_chase', 'paw_face', 'scratch', 'stand_wag', 'chase_tail', 'attack'],
    description: 'body/clip channel: looping idle·walk·run plus one-shot reactions',
  },
  {
    id: 'overlay',
    clips: ['idle_blink'],
    description: 'short overlay/replacement effect (blink) played on top of the idle body',
  },
]

/** How a clip participates in layering / interruption. */
export type ClipLayer = 'base' | 'overlay' | 'oneshot'

/** Coarse semantic category (mirrors FCI `AnimCategory` where it fits). */
export type ClipCategory = 'idle' | 'locomotion' | 'social' | 'action' | 'interaction' | 'combat'

export interface FpsBand {
  readonly minFps: number
  readonly maxFps: number
  readonly minFrames: number
  readonly maxFrames: number
  /** True for clips whose frame durations are intentionally non-uniform. */
  readonly nonUniform?: boolean
}

/**
 * 2D pixel-action-game bands (see docs/design/PET-ANIMATION-2026-11-18.md).
 * Only clips with a published recommendation are listed; one-shot interaction
 * clips use 8-12 FPS, which sits inside the idle/walk ranges.
 */
export const FPS_BANDS: Readonly<Partial<Record<ClipId, FpsBand>>> = {
  idle: { minFps: 4, maxFps: 8, minFrames: 2, maxFrames: 8 },
  walk: { minFps: 8, maxFps: 12, minFrames: 6, maxFrames: 8 },
  run: { minFps: 10, maxFps: 16, minFrames: 6, maxFrames: 8 },
  attack: { minFps: 12, maxFps: 24, minFrames: 4, maxFrames: 8, nonUniform: true },
}

/**
 * One clip in the animation contract.
 *
 * Timing rules:
 * - uniform clips: every frame is held `1000 / fps` ms → duration = frames/fps.
 * - non-uniform clips (`holdMs` set): `holdMs.length === frames`, the sum is
 *   the real duration, and `fps` is the nearest integer base rate the existing
 *   uniform hero renderer can use as an approximation.
 */
export interface ClipSpec {
  readonly id: ClipId
  readonly label: string
  readonly frames: number
  readonly fps: number
  readonly loop: boolean
  readonly layer: ClipLayer
  readonly category: ClipCategory
  /** Higher wins when an external trigger interrupts an active one-shot. */
  readonly priority: number
  /** Per-frame hold in ms; only for non-uniform clips (attack). */
  readonly holdMs?: readonly number[]
}

/** One frame file and its position on the clip timeline. */
export interface FrameSpec {
  readonly clip: ClipId
  readonly index: number
  /** Pack-relative path, e.g. `idle/idle_02.png`. */
  readonly file: string
  /** Clip-relative start time in ms (sum of the previous frames' holds). */
  readonly startMs: number
  readonly holdMs: number
}

/** Bubble semantics. `speech` may be voiced; `thought` never is. */
export type BubbleSemantic = 'speech' | 'thought'

/** Visual fill of the bubble. speech = solid, thought = hollow outline. */
export type BubbleStyle = 'solid' | 'hollow'

export interface BubbleSpec {
  readonly semantic: BubbleSemantic
  readonly style: BubbleStyle
  /** True only when the host may send this bubble through TTS. */
  readonly voice: boolean
  /** Screen-reader politeness: speech is announced, thoughts stay silent. */
  readonly ariaLive: 'polite' | 'off'
  readonly maxChars: number
}

/** Stable CSS hook for the speech/thought split (pet.css is NOT changed here). */
export const BUBBLE_CLASS_NAMES: Readonly<Record<BubbleStyle, string>> = {
  solid: 'bubble bubble--solid',
  hollow: 'bubble bubble--hollow',
}

/** Voice output mode per character. Only human/humanoid may be 'tts'. */
export type VoiceMode = 'tts' | 'none'

/**
 * Voice/TTS capability of a character (product rule 2026-11-18).
 *
 * 猫/狗不配 DeepSeek 语音：`mode:'none'` + `canTts:false` 永远成立，气泡固定为
 * thought（空心心理活动）；只有 human/humanoid（汀岚）是 speech（实心）+ 允许 TTS。
 * Manifest 的 `anim.voice` 与 `BUBBLE_POLICIES` 都以这里为单一事实源。
 */
export interface VoiceCapability {
  readonly mode: VoiceMode
  readonly canTts: boolean
  readonly bubbleSemantic: BubbleSemantic
  /** Why the capability exists (kept next to the data for review). */
  readonly rationale: string
}

export const VOICE_CAPABILITIES: Readonly<Record<AnimCharacter, VoiceCapability>> = {
  human: {
    mode: 'tts',
    canTts: true,
    bubbleSemantic: 'speech',
    rationale: '人形/汀岚是唯一可发声角色：实心气泡 + 允许 TTS',
  },
  dog: {
    mode: 'none',
    canTts: false,
    bubbleSemantic: 'thought',
    rationale: '狗不配 DeepSeek 语音：空心心理活动，永不 TTS',
  },
  cat: {
    mode: 'none',
    canTts: false,
    bubbleSemantic: 'thought',
    rationale: '猫不配 DeepSeek 语音：空心心理活动，永不 TTS',
  },
}

/** Throwing accessor for a character's voice capability. */
export function voiceCapabilityFor(character: AnimCharacter): VoiceCapability {
  const capability = VOICE_CAPABILITIES[character]
  if (!capability) throw new AnimationError(`unknown animation character: ${String(character)}`)
  return capability
}

/** Error type for invalid animation data / usage. */
export class AnimationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnimationError'
  }
}

/** Runtime guard for character ids. */
export function isAnimCharacter(value: unknown): value is AnimCharacter {
  return typeof value === 'string' && (ANIM_CHARACTERS as readonly string[]).includes(value)
}

/** Runtime guard for clip ids. */
export function isClipId(value: unknown): value is ClipId {
  return typeof value === 'string' && (CLIP_IDS as readonly string[]).includes(value)
}
