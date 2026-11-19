/**
 * Single source of truth for pet animation clip timing + pack metadata.
 *
 * `timing.json` next to this file is read by BOTH sides of the pipeline:
 * - TypeScript: `clips.ts` builds `CLIP_TABLE` / FPS bands / tracks from it;
 * - Python: `scripts/anim_timing.py` feeds the three pack generators
 *   (`gen-pet-anim-frames.py`, `gen-cat-anim.py`, `gen-human-anim.py`).
 *
 * `scripts/anim-timing-check.ts` and `tests/anim-timing-single-source.test.ts`
 * compare this table against the exported TS table, the three
 * `public/assets/pet/anim/<character>/manifest.json` files and the generators,
 * so a change can no longer land in one copy only (MB-103).
 *
 * Per-character overrides only carry what really differs (cat `stand_wag` is a
 * 10-frame slow stretch); layer/category/priority/loop are shared.
 */
import timingJson from './timing.json'
import {
  ANIM_CHARACTERS,
  AnimationError,
  CLIP_IDS,
  isAnimCharacter,
  isClipId,
  type AnimCharacter,
  type ClipCategory,
  type ClipId,
  type ClipLayer,
  type ClipSpec,
  type FpsBand,
  type TrackId,
  type TrackSpec,
} from './types.ts'
import { clipSpecProblems } from './timeline.ts'

/** Contract id written in `timing.json`; bump when the schema changes. */
export const ANIM_TIMING_CONTRACT = 'famling.pet-anim-timing/1' as const

/** Authoring phase marker copied into the pack manifest tag metadata. */
export type TimingPhase = '1a' | '1b' | 'later'

const PHASES: readonly TimingPhase[] = ['1a', '1b', 'later']
const LAYERS: readonly ClipLayer[] = ['base', 'overlay', 'oneshot']
const CATEGORIES: readonly ClipCategory[] = ['idle', 'locomotion', 'social', 'action', 'interaction', 'combat']
const TRACK_IDS: readonly TrackId[] = ['base', 'overlay']

/** Fields a single character may override on a shared clip. */
export interface TimingClipOverride {
  readonly label?: string
  readonly frames?: number
  readonly fps?: number
  readonly holdMs?: readonly number[]
}

/** One clip row in `timing.json`. */
export interface TimingClipEntry {
  readonly label: string
  readonly frames: number
  readonly fps: number
  readonly loop: boolean
  readonly layer: ClipLayer
  readonly category: ClipCategory
  readonly priority: number
  readonly phase?: TimingPhase
  readonly holdMs?: readonly number[]
  readonly overrides?: Partial<Record<AnimCharacter, TimingClipOverride>>
}

/** Whole `timing.json` document. */
export interface AnimTimingTable {
  readonly contract: string
  readonly order: readonly ClipId[]
  readonly clips: Readonly<Record<ClipId, TimingClipEntry>>
  readonly fpsBands: Readonly<Partial<Record<ClipId, FpsBand>>>
  readonly tracks: readonly TrackSpec[]
  readonly randomMicroActions: readonly ClipId[]
}

/** Parsed timing table (validated by `timingProblems()`). */
export const TIMING = timingJson as unknown as AnimTimingTable

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function holdsProblem(holds: unknown, frames: number, what: string): string[] {
  if (!Array.isArray(holds)) return [`${what} must be an array`]
  const problems: string[] = []
  if (holds.length !== frames) problems.push(`${what} length ${holds.length} != frames ${frames}`)
  for (const [index, hold] of holds.entries()) {
    if (!isPositiveFinite(hold)) problems.push(`${what}[${index}] must be a positive finite number`)
  }
  return problems
}

function entryProblems(id: ClipId, entry: unknown): string[] {
  if (!isRecord(entry)) return [`clips.${id} must be an object`]
  const problems: string[] = []
  if (typeof entry.label !== 'string' || entry.label.length === 0) problems.push(`clips.${id}.label must be a non-empty string`)
  if (!isPositiveInteger(entry.frames)) problems.push(`clips.${id}.frames must be a positive integer`)
  if (!isPositiveFinite(entry.fps)) problems.push(`clips.${id}.fps must be > 0`)
  if (typeof entry.loop !== 'boolean') problems.push(`clips.${id}.loop must be boolean`)
  if (!LAYERS.includes(entry.layer as ClipLayer)) problems.push(`clips.${id}.layer must be one of ${LAYERS.join('/')}`)
  if (!CATEGORIES.includes(entry.category as ClipCategory)) problems.push(`clips.${id}.category must be one of ${CATEGORIES.join('/')}`)
  if (typeof entry.priority !== 'number' || !Number.isFinite(entry.priority)) problems.push(`clips.${id}.priority must be finite`)
  if (entry.phase !== undefined && !PHASES.includes(entry.phase as TimingPhase)) {
    problems.push(`clips.${id}.phase must be one of ${PHASES.join('/')}`)
  }
  if (entry.holdMs !== undefined && isPositiveInteger(entry.frames)) {
    problems.push(...holdsProblem(entry.holdMs, entry.frames, `clips.${id}.holdMs`))
  }
  if (entry.overrides !== undefined) {
    if (!isRecord(entry.overrides)) {
      problems.push(`clips.${id}.overrides must be an object`)
    } else {
      for (const [character, override] of Object.entries(entry.overrides)) {
        if (!isAnimCharacter(character)) {
          problems.push(`clips.${id}.overrides.${character} is not a known animation character`)
          continue
        }
        if (!isRecord(override)) {
          problems.push(`clips.${id}.overrides.${character} must be an object`)
          continue
        }
        if (override.label !== undefined && (typeof override.label !== 'string' || override.label.length === 0)) {
          problems.push(`clips.${id}.overrides.${character}.label must be a non-empty string`)
        }
        if (override.frames !== undefined && !isPositiveInteger(override.frames)) {
          problems.push(`clips.${id}.overrides.${character}.frames must be a positive integer`)
        }
        if (override.fps !== undefined && !isPositiveFinite(override.fps)) {
          problems.push(`clips.${id}.overrides.${character}.fps must be > 0`)
        }
        const frames = isPositiveInteger(override.frames)
          ? override.frames
          : isPositiveInteger(entry.frames) ? entry.frames : 0
        if (override.holdMs !== undefined) {
          problems.push(...holdsProblem(override.holdMs, frames, `clips.${id}.overrides.${character}.holdMs`))
        }
        const inherited = entry.holdMs
        if (inherited !== undefined && override.frames !== undefined && override.holdMs === undefined) {
          problems.push(`clips.${id}.overrides.${character} changes frames but keeps the inherited holdMs`)
        }
      }
    }
  }
  return problems
}

function bandProblems(): string[] {
  const problems: string[] = []
  const bands = TIMING.fpsBands
  if (!isRecord(bands)) return ['fpsBands must be an object']
  for (const [id, band] of Object.entries(bands)) {
    if (!isClipId(id)) {
      problems.push(`fpsBands.${id} is not a v0.1 clip id`)
      continue
    }
    if (!isRecord(band)) {
      problems.push(`fpsBands.${id} must be an object`)
      continue
    }
    for (const key of ['minFps', 'maxFps', 'minFrames', 'maxFrames'] as const) {
      const value = band[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) problems.push(`fpsBands.${id}.${key} must be a finite number`)
    }
    if (typeof band.minFps === 'number' && typeof band.maxFps === 'number' && band.minFps > band.maxFps) {
      problems.push(`fpsBands.${id}: minFps > maxFps`)
    }
    if (typeof band.minFrames === 'number' && typeof band.maxFrames === 'number' && band.minFrames > band.maxFrames) {
      problems.push(`fpsBands.${id}: minFrames > maxFrames`)
    }
    if (band.nonUniform !== undefined && typeof band.nonUniform !== 'boolean') {
      problems.push(`fpsBands.${id}.nonUniform must be boolean`)
    }
  }
  return problems
}

function trackProblems(): string[] {
  const problems: string[] = []
  if (!Array.isArray(TIMING.tracks)) return ['tracks must be an array']
  const seen = new Set<string>()
  for (const [index, track] of TIMING.tracks.entries()) {
    if (!isRecord(track)) {
      problems.push(`tracks[${index}] must be an object`)
      continue
    }
    const id = track.id
    if (!TRACK_IDS.includes(id as TrackId)) problems.push(`tracks[${index}].id must be one of ${TRACK_IDS.join('/')}`)
    else if (seen.has(id as string)) problems.push(`tracks[${index}].id "${String(id)}" is duplicated`)
    else seen.add(id as string)
    if (typeof track.description !== 'string' || track.description.length === 0) {
      problems.push(`tracks[${index}].description must be a non-empty string`)
    }
    if (!Array.isArray(track.clips)) {
      problems.push(`tracks[${index}].clips must be an array`)
      continue
    }
    for (const clip of track.clips) {
      if (!isClipId(clip)) problems.push(`tracks[${index}].clips contains unknown clip "${String(clip)}"`)
    }
  }
  for (const id of TRACK_IDS) if (!seen.has(id)) problems.push(`tracks is missing the "${id}" channel`)
  return problems
}

/**
 * Structural + cross-file problems in the timing table. An empty array means
 * `timing.json` is the valid single source; `tests/anim-timing-single-source`
 * and `scripts/anim-timing-check.ts` assert this.
 */
export function timingProblems(): string[] {
  const problems: string[] = []
  const table = TIMING
  if (!isRecord(table)) return ['timing.json must be an object']
  if (table.contract !== ANIM_TIMING_CONTRACT) {
    problems.push(`contract must be "${ANIM_TIMING_CONTRACT}", got "${String(table.contract)}"`)
  }

  const order = table.order
  if (!Array.isArray(order)) {
    problems.push('order must be an array of clip ids')
  } else {
    if (order.length !== CLIP_IDS.length) problems.push(`order has ${order.length} clips, expected ${CLIP_IDS.length}`)
    for (const [index, expected] of CLIP_IDS.entries()) {
      const actual = order[index]
      if (actual !== expected) problems.push(`order[${index}] is "${String(actual)}", expected "${expected}"`)
    }
    const unique = new Set(order)
    if (unique.size !== order.length) problems.push('order contains duplicate clip ids')
  }

  const clips = table.clips
  if (!isRecord(clips)) {
    problems.push('clips must be an object keyed by clip id')
  } else {
    const keys = Object.keys(clips)
    for (const id of CLIP_IDS) if (!keys.includes(id)) problems.push(`clips is missing "${id}"`)
    for (const key of keys) if (!(CLIP_IDS as readonly string[]).includes(key)) problems.push(`clips.${key} is not a v0.1 clip id`)
    for (const id of CLIP_IDS) {
      const entry = clips[id]
      if (entry === undefined) continue
      problems.push(...entryProblems(id, entry))
    }
  }

  for (const character of ANIM_CHARACTERS) {
    for (const id of CLIP_IDS) {
      const entry = isRecord(clips) ? clips[id] : undefined
      if (!isRecord(entry)) continue
      try {
        const spec = timingSpec(character, id)
        problems.push(...clipSpecProblems(spec).map((problem) => `${character} ${problem}`))
        const band = isRecord(table.fpsBands) ? table.fpsBands[id] : undefined
        if (isRecord(band)) {
          const minFps = band.minFps as number
          const maxFps = band.maxFps as number
          const minFrames = band.minFrames as number
          const maxFrames = band.maxFrames as number
          if (typeof minFps === 'number' && (spec.fps < minFps || spec.fps > maxFps)) {
            problems.push(`${character}/${id}: fps ${spec.fps} outside band ${minFps}-${maxFps}`)
          }
          if (typeof minFrames === 'number' && (spec.frames < minFrames || spec.frames > maxFrames)) {
            problems.push(`${character}/${id}: frames ${spec.frames} outside band ${minFrames}-${maxFrames}`)
          }
          if (band.nonUniform !== true && spec.holdMs) {
            problems.push(`${character}/${id}: holdMs is only allowed on non-uniform clips`)
          }
          if (band.nonUniform === true && !spec.holdMs) {
            problems.push(`${character}/${id}: non-uniform band requires holdMs`)
          }
        }
      } catch (error) {
        problems.push(`${character} ${id}: ${(error as Error).message}`)
      }
    }
  }

  problems.push(...bandProblems())
  problems.push(...trackProblems())

  const ambient = table.randomMicroActions
  if (!Array.isArray(ambient)) {
    problems.push('randomMicroActions must be an array of clip ids')
  } else {
    const seen = new Set<string>()
    for (const clip of ambient) {
      if (!isClipId(clip)) {
        problems.push(`randomMicroActions contains unknown clip "${String(clip)}"`)
        continue
      }
      if (seen.has(clip)) problems.push(`randomMicroActions contains duplicate "${clip}"`)
      seen.add(clip)
      const entry = isRecord(clips) ? clips[clip] : undefined
      if (isRecord(entry) && entry.layer !== 'oneshot') {
        problems.push(`randomMicroActions "${clip}" must reference a one-shot clip`)
      }
    }
  }

  return problems
}

/** Shared clip entry by id (throws a readable AnimationError when absent). */
export function timingClipEntry(id: ClipId): TimingClipEntry {
  const entry = TIMING.clips[id]
  if (!isRecord(entry)) throw new AnimationError(`timing.json has no clip "${String(id)}"`)
  return entry as unknown as TimingClipEntry
}

/** One clip spec for a character, applying the per-character override. */
export function timingSpec(character: AnimCharacter, id: ClipId): ClipSpec {
  if (!isAnimCharacter(character)) throw new AnimationError(`unknown animation character: ${String(character)}`)
  if (!isClipId(id)) throw new AnimationError(`unknown animation clip: ${String(id)}`)
  const entry = timingClipEntry(id)
  const override = entry.overrides?.[character]
  const frames = override?.frames ?? entry.frames
  const fps = override?.fps ?? entry.fps
  const label = override?.label ?? entry.label
  const holdMs = override?.holdMs ?? entry.holdMs
  const spec: ClipSpec = {
    id,
    label,
    frames,
    fps,
    loop: entry.loop,
    layer: entry.layer,
    category: entry.category,
    priority: entry.priority,
    ...(holdMs !== undefined ? { holdMs: [...holdMs] } : {}),
  }
  return spec
}

/** All clip specs for a character in `CLIP_IDS` order. */
export function timingSpecs(character: AnimCharacter): readonly ClipSpec[] {
  return CLIP_IDS.map((id) => timingSpec(character, id))
}

/** FPS/frame bands from `timing.json`. */
export function timingFpsBands(): Readonly<Partial<Record<ClipId, FpsBand>>> {
  return TIMING.fpsBands
}

/** Layering channels from `timing.json`. */
export function timingTracks(): readonly TrackSpec[] {
  return TIMING.tracks
}

/** Default ambient micro-action pool from `timing.json` (weights live in behavior.json). */
export function timingRandomMicroActions(): readonly ClipId[] {
  return TIMING.randomMicroActions
}
