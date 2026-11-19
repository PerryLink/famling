/**
 * Animation clip table (v0.1) — timing contract shared by dog / cat / human.
 *
 * The values are NOT authored here any more: this module is a typed view over
 * `timing.json` (`timing.ts`), which the Python pack generators also read. That
 * keeps TS and `public/assets/pet/anim/<character>/manifest.json` on one source
 * (MB-103); `scripts/anim-timing-check.ts` + `validateClipTable()` fail when a
 * copy drifts.
 *
 * Art differences live in the placeholder frames, not in the timing: all three
 * characters share clip ids/frames/fps except the cat's 10-frame slow stretch
 * (`stand_wag` override in `timing.json`), so the scheduler and interaction
 * layer stay character-agnostic (only poses/bubbles differ).
 *
 * Attack is the one shared non-uniform clip: charge frames are held long
 * (slow), the 2 hit poses get 1-2 fast frames, recovery is medium. Every local
 * frame rate still lands inside 12-24 FPS (23.8 / 15.9 / 12.0), and `fps: 16`
 * is the rounded base rate the uniform hero renderer uses as an approximation.
 */
import {
  ANIM_CHARACTERS,
  AnimationError,
  CLIP_IDS,
  type AnimCharacter,
  type ClipId,
  type ClipSpec,
  type FpsBand,
  type TrackSpec,
} from './types.ts'
import {
  TIMING,
  timingFpsBands,
  timingRandomMicroActions,
  timingSpec,
  timingSpecs,
  timingProblems,
  timingTracks,
} from './timing.ts'
import { clipSpecProblems, clipDurationMs, effectiveFps, localFps } from './timeline.ts'

/** Attack frame holds from `timing.json`: charge 83/83 (12.0 FPS), pre-release 63 (15.9 FPS), hit 42/42 (23.8 FPS), recovery 63/63. */
export const ATTACK_HOLD_MS: readonly number[] = TIMING.clips.attack.holdMs ?? []

/** Cat stretch: 10 authored poses with slow, non-uniform holds (3.2s total). */
export const CAT_STRETCH_HOLD_MS: readonly number[] = TIMING.clips.stand_wag.overrides?.cat?.holdMs ?? []

/** Published FPS/frame bands (from `timing.json`). */
export const FPS_BANDS: Readonly<Partial<Record<ClipId, FpsBand>>> = timingFpsBands()

/** Layering channels (from `timing.json`). */
export const TRACKS: readonly TrackSpec[] = timingTracks()

/** Default ambient micro-action pool (weights/cooldowns live in `behavior.json`). */
export const RANDOM_MICRO_ACTION_IDS: readonly ClipId[] = timingRandomMicroActions()

/** Clip ids in manifest / disk order. */
export const CLIP_ORDER: readonly ClipId[] = CLIP_IDS

/** Shared (character-independent) clip set, used by `clipSpec()`; cat overrides `stand_wag`. */
const SPECS: Readonly<Record<ClipId, ClipSpec>> = Object.freeze(
  Object.fromEntries(CLIP_IDS.map((id) => [id, timingSpec('dog', id)])) as Record<ClipId, ClipSpec>,
)

/** Shared clip set; cat stretch is the one per-character timing override. */
export const CLIP_TABLE: Readonly<Record<AnimCharacter, readonly ClipSpec[]>> = Object.freeze(
  Object.fromEntries(ANIM_CHARACTERS.map((character) => [character, timingSpecs(character)])) as Record<
    AnimCharacter,
    readonly ClipSpec[]
  >,
)

/** One clip spec by id (character-independent timing; cat has an override only in `CLIP_TABLE`). */
export function clipSpec(id: ClipId): ClipSpec {
  const spec = SPECS[id]
  if (!spec) throw new AnimationError(`unknown animation clip: ${String(id)}`)
  return spec
}

/** Clip spec for a character; throws for unknown characters or clips. */
export function getClip(character: AnimCharacter, id: ClipId): ClipSpec {
  const clips = CLIP_TABLE[character]
  if (!clips) throw new AnimationError(`unknown animation character: ${String(character)}`)
  const spec = clips.find((candidate) => candidate.id === id)
  if (!spec) throw new AnimationError(`character "${character}" has no clip "${String(id)}"`)
  return spec
}

/** Ordered clips for a character (same set/order for dog, cat and human). */
export function clipSpecs(character: AnimCharacter): readonly ClipSpec[] {
  const clips = CLIP_TABLE[character]
  if (!clips) throw new AnimationError(`unknown animation character: ${String(character)}`)
  return clips
}

/** Published FPS/frame band for a clip (undefined for unregulated one-shots). */
export function fpsBand(clip: ClipId): FpsBand | undefined {
  return FPS_BANDS[clip]
}

/**
 * Structural + band validation of the shipped table. Tests and
 * `scripts/anim-timing-check.ts` call this and assert an empty result; a future
 * art pack change that breaks the research recommendation fails loudly instead
 * of drifting.
 */
export function validateClipTable(): string[] {
  const problems: string[] = [...timingProblems()]
  for (const character of ANIM_CHARACTERS) {
    const clips = CLIP_TABLE[character]
    if (clips.length !== CLIP_IDS.length) problems.push(`"${character}": expected ${CLIP_IDS.length} clips, got ${clips.length}`)
    for (const [index, expectedId] of CLIP_IDS.entries()) {
      const spec = clips[index]
      if (!spec) {
        problems.push(`"${character}": missing clip #${index} (${expectedId})`)
        continue
      }
      if (spec.id !== expectedId) problems.push(`"${character}": clip #${index} is "${spec.id}", expected "${expectedId}"`)
      problems.push(...clipSpecProblems(spec).map((problem) => `${character} ${problem}`))
      const band = FPS_BANDS[spec.id]
      if (band) {
        if (spec.fps < band.minFps || spec.fps > band.maxFps) {
          problems.push(`"${character}/${spec.id}": fps ${spec.fps} outside band ${band.minFps}-${band.maxFps}`)
        }
        if (spec.frames < band.minFrames || spec.frames > band.maxFrames) {
          problems.push(`"${character}/${spec.id}": frames ${spec.frames} outside band ${band.minFrames}-${band.maxFrames}`)
        }
        if (band.nonUniform !== true && spec.holdMs) {
          problems.push(`"${character}/${spec.id}": holdMs is only allowed on non-uniform clips`)
        }
        if (band.nonUniform === true) {
          if (!spec.holdMs) problems.push(`"${character}/${spec.id}": non-uniform band requires holdMs`)
          else {
            const average = effectiveFps(spec)
            if (average < band.minFps || average > band.maxFps) {
              problems.push(`"${character}/${spec.id}": effective fps ${average.toFixed(2)} outside band ${band.minFps}-${band.maxFps}`)
            }
            for (let frame = 0; frame < spec.frames; frame += 1) {
              const local = localFps(spec, frame)
              if (local < band.minFps || local > band.maxFps) {
                problems.push(`"${character}/${spec.id}": frame ${frame} local fps ${local.toFixed(2)} outside band ${band.minFps}-${band.maxFps}`)
              }
            }
          }
        }
      }
      if (spec.loop && spec.layer !== 'base') problems.push(`"${character}/${spec.id}": only base-layer clips may loop`)
      if (spec.id === 'idle_blink' && spec.layer !== 'overlay') problems.push(`"${character}/${spec.id}": blink must be an overlay clip`)
    }
  }
  // Character-independent invariants.
  const attack = SPECS.attack
  if (!attack) {
    problems.push('attack clip is missing from CLIP_IDS')
    return problems
  }
  const attackDuration = clipDurationMs(attack)
  if (Math.round(attackDuration) !== 439) problems.push(`attack duration changed: ${attackDuration}ms (documented 439ms)`)
  if (attack.frames === 0) problems.push('attack has no frames')
  if (ATTACK_HOLD_MS.length !== attack.frames) problems.push(`ATTACK_HOLD_MS length ${ATTACK_HOLD_MS.length} != attack frames ${attack.frames}`)
  const catStretch = getClip('cat', 'stand_wag')
  if (catStretch.frames !== 10) problems.push(`cat stand_wag should be the 10-frame stretch, got ${catStretch.frames}`)
  if (CAT_STRETCH_HOLD_MS.length !== catStretch.frames) {
    problems.push(`CAT_STRETCH_HOLD_MS length ${CAT_STRETCH_HOLD_MS.length} != cat stand_wag frames ${catStretch.frames}`)
  }
  return problems
}

/** Convenience: total frame count of one character's clips. */
export function totalFrames(character: AnimCharacter): number {
  return clipSpecs(character).reduce((sum, spec) => sum + spec.frames, 0)
}

/** Convenience: ids of one-shot clips that the behaviour profile may fire randomly. */
export function oneshotClipIds(): readonly ClipId[] {
  return CLIP_IDS.filter((id) => SPECS[id].layer === 'oneshot')
}
