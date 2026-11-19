/**
 * Clip timeline math: frame holds, frame lookup and pack-relative frame paths.
 *
 * Uniform clips mirror `hero.ts` `frameIndexFor()` exactly
 * (`floor(elapsedMs / 1000 * fps)`, wrapping for loops and clamping for
 * one-shots) so the scheduler and the existing renderer agree frame-for-frame.
 * Non-uniform clips (attack) use per-frame holds and are only approximated by
 * the uniform hero renderer.
 */
import { AnimationError, type ClipId, type ClipSpec, type FrameSpec } from './types.ts'

/** Pack-relative path of one frame: `<clip>/<clip>_NN.png` (zero padded). */
export function frameFile(clip: ClipId, index: number): string {
  if (!Number.isInteger(index) || index < 0) throw new AnimationError(`invalid frame index: ${String(index)}`)
  return `${clip}/${clip}_${String(index).padStart(2, '0')}.png`
}

/** Hold time of one frame in ms; throws when the clip spec is malformed. */
export function frameHoldMs(spec: ClipSpec, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index >= spec.frames) {
    throw new AnimationError(`frame ${String(index)} out of range for clip "${spec.id}" (${spec.frames} frames)`)
  }
  if (spec.holdMs) {
    const hold = spec.holdMs[index]
    if (hold === undefined || !Number.isFinite(hold) || hold <= 0) {
      throw new AnimationError(`clip "${spec.id}" has an invalid holdMs[${index}]`)
    }
    return hold
  }
  return 1000 / spec.fps
}

/** Total clip duration in ms (sum of holds, or frames * 1000/fps). */
export function clipDurationMs(spec: ClipSpec): number {
  let total = 0
  for (let index = 0; index < spec.frames; index += 1) total += frameHoldMs(spec, index)
  return total
}

/** Rounded duration as written into manifests (`durationMs`). */
export function roundedDurationMs(spec: ClipSpec): number {
  return Math.round(clipDurationMs(spec))
}

/** Start time (clip-relative ms) of every frame. */
export function frameStartTimesMs(spec: ClipSpec): number[] {
  const starts: number[] = []
  let cursor = 0
  for (let index = 0; index < spec.frames; index += 1) {
    starts.push(cursor)
    cursor += frameHoldMs(spec, index)
  }
  return starts
}

/** Frame shown at `elapsedMs` (wraps for loops, clamps on the last frame otherwise). */
export function frameIndexAt(spec: ClipSpec, elapsedMs: number): number {
  const frames = Math.max(1, spec.frames)
  if (frames === 1) return 0
  const duration = clipDurationMs(spec)
  let time = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0
  if (spec.loop && duration > 0) {
    time %= duration
  } else if (duration > 0 && time >= duration) {
    return frames - 1
  }
  let cursor = 0
  for (let index = 0; index < frames; index += 1) {
    cursor += frameHoldMs(spec, index)
    if (time < cursor) return index
  }
  return frames - 1
}

/** Full `FrameSpec` for the frame shown at `elapsedMs`. */
export function frameSpecAt(spec: ClipSpec, elapsedMs: number): FrameSpec {
  const index = frameIndexAt(spec, elapsedMs)
  const startMs = frameStartTimesMs(spec)[index] ?? 0
  return {
    clip: spec.id,
    index,
    file: frameFile(spec.id, index),
    startMs,
    holdMs: frameHoldMs(spec, index),
  }
}

/** True when a non-looping clip has reached (or passed) its final frame. */
export function isFinished(spec: ClipSpec, elapsedMs: number): boolean {
  if (spec.loop) return false
  return elapsedMs >= clipDurationMs(spec)
}

/** Effective average FPS of a clip (frames / real duration). */
export function effectiveFps(spec: ClipSpec): number {
  return (spec.frames * 1000) / clipDurationMs(spec)
}

/** Local FPS of one frame (1000 / hold), useful for non-uniform rhythm checks. */
export function localFps(spec: ClipSpec, index: number): number {
  return 1000 / frameHoldMs(spec, index)
}

/** Structural problems in a clip spec; empty array means valid. */
export function clipSpecProblems(spec: ClipSpec): string[] {
  const problems: string[] = []
  if (!Number.isInteger(spec.frames) || spec.frames <= 0) problems.push(`"${spec.id}": frames must be a positive integer`)
  if (typeof spec.fps !== 'number' || !Number.isFinite(spec.fps) || spec.fps <= 0) problems.push(`"${spec.id}": fps must be > 0`)
  if (typeof spec.loop !== 'boolean') problems.push(`"${spec.id}": loop must be boolean`)
  if (!Number.isFinite(spec.priority)) problems.push(`"${spec.id}": priority must be finite`)
  if (spec.layer === 'overlay' && spec.loop) problems.push(`"${spec.id}": overlay clips must be one-shot`)
  if (spec.holdMs) {
    if (spec.holdMs.length !== spec.frames) problems.push(`"${spec.id}": holdMs length must equal frames`)
    for (const [index, hold] of spec.holdMs.entries()) {
      if (!Number.isFinite(hold) || hold <= 0) problems.push(`"${spec.id}": holdMs[${index}] must be > 0`)
    }
  }
  return problems
}
