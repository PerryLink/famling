/**
 * Pet animation system — shared data types (placeholder art era, 2026-11-18).
 *
 * Scope: this module is deliberately headless and framework-free (no DOM, no
 * hero.ts import, no singletons). It describes the animation *contract* that
 * the placeholder packs under `public/assets/pet/anim/<character>/` implement
 * and that the live renderer consumes:
 *
 *   ClipSpec   one named animation (frames / fps / loop / per-frame holds)
 *   FrameSpec  one PNG frame on disk + its slot in the clip timeline
 *   TrackSpec  a layering channel (base pose vs. overlay effect)
 *   BubbleSemantic  speech (solid bubble + voice allowed) vs.
 *                   thought (hollow bubble, never voiced)
 *
 * Single sources of truth (2026-11-20 E10 convergence, MB-102/MB-103):
 * - Clip timing/layer/category/priority/FPS bands/tracks live in
 *   `src/pet/anim/timing.json` and are loaded by `timing.ts` / `clips.ts`.
 *   The Python generators read the same JSON, so TS and the generated pack
 *   manifests cannot drift (`scripts/anim-timing-check.ts` gates it).
 * - Ambient/random micro-action scheduling, state priorities, cooldowns and
 *   the event -> state mapping live in the character `behavior.json` profile
 *   and are executed by `src/pet/scene/runtime.ts` (SceneRuntime) through
 *   `BehaviorRuntime`. There is intentionally no second idle scheduler and no
 *   interaction-plan table in this module any more (dead code removed by E10).
 * - Clip reachability: `walk` and `attack` are frozen **spec-only** clips
 *   (MB-047/E5-T7, 2026-11-20). They stay in the shared v0.1 clip contract so
 *   all character packs keep the same shape, but no product entry plays them.
 *   `timing.json.specOnly` is the decision record, the pack manifests mirror it
 *   in `anim.specOnly`, and the behavior/regions audit gate fails if one of them
 *   is wired up without updating the decision (or vice versa).
 *
 * The frame-rate bands documented in `timing.json` come from the 2D pixel
 * action-game research: idle 4-8 FPS / 2-8 frames, walk 8-12 FPS / 6-8 frames,
 * run 10-16 FPS / 6-8 frames, attack 12-24 FPS with a NON-uniform rhythm
 * (slow charge, 1-2 hit frames, medium recovery).
 */

/** Characters the animation subsystem ships placeholder clips for. */
export const ANIM_CHARACTERS = ['dog', 'cat', 'human'] as const
export type AnimCharacter = (typeof ANIM_CHARACTERS)[number]

/**
 * Every clip id in the v0.1 animation contract (identity + `ClipId` union).
 *
 * This literal list is the *type* contract; `timing.json` carries the timing
 * values and its `order` array must match this list exactly (gated by
 * `validateClipTable()` and `scripts/anim-timing-check.ts`).
 */
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

/** Layering channel. `base` owns the body; `overlay` draws on top of it. */
export type TrackId = 'base' | 'overlay'

export interface TrackSpec {
  readonly id: TrackId
  readonly clips: readonly ClipId[]
  readonly description: string
}

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
  /** Per-frame hold in ms; only for non-uniform clips (attack, cat stretch). */
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

/**
 * Bubble semantics. `speech` may be voiced; `thought` never is.
 *
 * The visual fill rules (speech = solid, thought = hollow) and the bubble CSS
 * hooks belong to the renderer; the old standalone bubble-policy helpers were
 * dead code and were removed by E10. `VOICE_CAPABILITIES.bubbleSemantic` below
 * is the single source for which semantic a character may use.
 */
export type BubbleSemantic = 'speech' | 'thought'

/** Voice output mode per character. Only human/humanoid may be 'tts'. */
export type VoiceMode = 'tts' | 'none'

/**
 * Voice/TTS capability of a character (product rule 2026-11-18).
 *
 * 猫/狗不配 DeepSeek 语音：`mode:'none'` + `canTts:false` 永远成立，气泡固定为
 * thought（空心心理活动）；只有 human/humanoid（汀岚）是 speech（实心）+ 允许 TTS。
 * Manifest 的 `anim.voice` 与渲染层的静音规则都以这里为单一事实源。
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
