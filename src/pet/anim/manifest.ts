/**
 * Anim pack manifest contract (`famling.pet-anim/0.1`).
 *
 * A pack directory is BOTH:
 * - a hero-compatible CharacterPack (top-level `canvas/anchor/footBox/tags/assets`
 *   loadable by `hero.ts loadCharacterPack()` / `CharacterRenderer.play(tag)`), and
 * - a richer animation manifest (`anim` block: per-frame holds, layers,
 *   priorities, FPS bands, tracks, bubble policy) consumed by `src/pet/anim/`.
 *
 * Validation is data-only and dependency-free (no hero.ts import, no DOM). The
 * expected clip values come from `timing.json` through `clips.ts` — the same
 * table the Python pack generators read — so a generated manifest and the TS
 * contract cannot drift (gated by `scripts/anim-timing-check.ts`). The test
 * suite additionally feeds the same JSON to `validateCharacterPack()` to prove
 * the compatibility claim.
 */
import {
  AnimationError,
  ANIM_CHARACTERS,
  CLIP_IDS,
  VOICE_CAPABILITIES,
  isAnimCharacter,
  type AnimCharacter,
  type BubbleSemantic,
  type ClipCategory,
  type ClipId,
  type ClipLayer,
  type FpsBand,
  type VoiceMode,
} from './types.ts'
import {
  CLIP_ORDER,
  FPS_BANDS,
  RANDOM_MICRO_ACTION_IDS,
  TRACKS,
  clipSpecs,
  getClip,
} from './clips.ts'
import { clipDurationMs, frameFile, roundedDurationMs } from './timeline.ts'
import { SPEC_ONLY_CLIPS } from './timing.ts'

export const ANIM_MANIFEST_CONTRACT = 'famling.pet-anim/0.1' as const
export const ANIM_FORMAT_VERSION = 1 as const
export const ANIM_PACK_ROOT = '/assets/pet/anim' as const
export const ANIM_FRAME_PATTERN = '<clip>/<clip>_NN.png' as const

/** Web root of one character's animation pack (trailing slash). */
export function animPackDir(character: AnimCharacter): string {
  if (!isAnimCharacter(character)) throw new AnimationError(`unknown animation character: ${String(character)}`)
  return `${ANIM_PACK_ROOT}/${character}/`
}

/** Web path of one frame PNG. */
export function animFramePath(character: AnimCharacter, clip: ClipId, index: number): string {
  return `${animPackDir(character)}${frameFile(clip, index)}`
}

/** Pack-relative asset list in manifest order (clip order, frame order). */
export function expectedAssets(character: AnimCharacter = 'dog'): string[] {
  const assets: string[] = []
  for (const clip of CLIP_ORDER) {
    const spec = getClip(character, clip)
    for (let index = 0; index < spec.frames; index += 1) assets.push(frameFile(clip, index))
  }
  return assets
}

/** Total frame count expected on disk for one character. */
export function expectedFrameCount(character: AnimCharacter = 'dog'): number {
  return expectedAssets(character).length
}

export interface AnimClipManifest {
  readonly frames: number
  readonly fps: number
  readonly loop: boolean
  readonly durationMs: number
  readonly layer: ClipLayer
  readonly category: ClipCategory
  readonly priority: number
  readonly dir: string
  readonly holdMs?: readonly number[]
}

export interface AnimTagManifest {
  readonly frames: number
  readonly fps: number
  readonly loop: boolean
  readonly phase?: '1a' | '1b' | 'later'
  readonly category?: string
  readonly durationMs?: number
  readonly layer?: string
  readonly priority?: number
  readonly holdMs?: readonly number[]
}

export interface AnimManifest {
  readonly id: string
  readonly style: string
  readonly formatVersion: number
  readonly canvas: readonly [number, number]
  readonly anchor: { readonly x: number; readonly y: number; readonly mode: string }
  readonly footBox: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  readonly palette: string
  readonly tags: Readonly<Record<string, AnimTagManifest>>
  readonly anim: {
    readonly contract: string
    readonly character: AnimCharacter
    readonly framePattern: string
    readonly clips: Readonly<Record<ClipId, AnimClipManifest>>
    readonly fpsBands: Readonly<Partial<Record<ClipId, FpsBand>>>
    readonly randomMicroActions: readonly string[]
    readonly tracks: Readonly<Record<string, readonly string[]>>
    readonly bubblePolicy: { readonly speech: 'solid'; readonly thought: 'hollow' }
    /**
     * Voice/TTS capability (product rule 2026-11-18): human = tts/speech,
     * cat/dog = none/thought + canTts:false. Validated against
     * VOICE_CAPABILITIES so a pack cannot opt pets into speech/TTS.
     */
    readonly voice: {
      readonly mode: VoiceMode
      readonly canTts: boolean
      readonly bubble: BubbleSemantic
    }
    /**
     * Spec-only freeze (MB-047/E5-T7): clip id -> decision reason, mirrored
     * from `timing.json`. These clips have no product entry point and are not
     * part of the default runtime path; the frames stay in the pack as the
     * reference contract until a product entry is decided.
     */
    readonly specOnly: Readonly<Partial<Record<ClipId, string>>>
  }
  readonly assets: readonly string[]
  readonly license: string
  readonly ai: { readonly status: 'none' | 'concept' | 'final'; readonly tool?: string }
  readonly placeholder?: boolean
  readonly sourceSpec?: string
  readonly generator?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (!isRecord(value)) throw new AnimationError(`${what} must be an object`)
  return value
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new AnimationError(`${what} must be a non-empty string`)
  return value
}

function requireFinite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new AnimationError(`${what} must be a finite number`)
  return value
}

function requirePositiveInt(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new AnimationError(`${what} must be a positive integer`)
  }
  return value
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  return requireRecord(value, what)
}

const PHASES = ['1a', '1b', 'later'] as const
const AI_STATUSES = ['none', 'concept', 'final'] as const

/**
 * Validate an animation pack manifest and, when `expectedCharacter` is given,
 * verify it is the pack for that character. Throws AnimationError with a
 * readable path on the first contract violation.
 */
export function validateAnimManifest(
  value: unknown,
  options: { readonly expectedCharacter?: AnimCharacter } = {},
): AnimManifest {
  const raw = requireRecord(value, 'anim pack')
  const id = requireString(raw.id, 'pack.id')
  const style = requireString(raw.style, 'pack.style')
  const formatVersion = requirePositiveInt(raw.formatVersion, 'pack.formatVersion')
  if (formatVersion !== ANIM_FORMAT_VERSION) {
    throw new AnimationError(`pack.formatVersion ${formatVersion} != supported ${ANIM_FORMAT_VERSION}`)
  }

  const canvasRaw = raw.canvas
  if (!Array.isArray(canvasRaw) || canvasRaw.length !== 2) throw new AnimationError('pack.canvas must be [width,height]')
  const canvas: [number, number] = [
    requirePositiveInt(canvasRaw[0], 'pack.canvas[0]'),
    requirePositiveInt(canvasRaw[1], 'pack.canvas[1]'),
  ]
  for (const [index, side] of canvas.entries()) {
    if (side < 16 || side > 1024 || side % 16 !== 0) {
      throw new AnimationError(`pack.canvas[${index}] must be 16..1024 and a multiple of 16, got ${side}`)
    }
  }

  const anchorRaw = asRecord(raw.anchor, 'pack.anchor')
  const anchor = {
    x: requireFinite(anchorRaw.x, 'pack.anchor.x'),
    y: requireFinite(anchorRaw.y, 'pack.anchor.y'),
    mode: requireString(anchorRaw.mode, 'pack.anchor.mode'),
  }
  const footRaw = asRecord(raw.footBox, 'pack.footBox')
  const footBox = {
    x: requireFinite(footRaw.x, 'pack.footBox.x'),
    y: requireFinite(footRaw.y, 'pack.footBox.y'),
    w: requireFinite(footRaw.w, 'pack.footBox.w'),
    h: requireFinite(footRaw.h, 'pack.footBox.h'),
  }
  const palette = requireString(raw.palette, 'pack.palette')

  const tagsRaw = requireRecord(raw.tags, 'pack.tags')
  const tagNames = Object.keys(tagsRaw)
  if (tagNames.length !== CLIP_IDS.length) {
    throw new AnimationError(`pack.tags must have exactly ${CLIP_IDS.length} clips (v0.1), got ${tagNames.length}`)
  }
  for (const clip of CLIP_IDS) {
    if (!(clip in tagsRaw)) throw new AnimationError(`pack.tags.${clip} is missing`)
  }
  const tags: Record<string, AnimTagManifest> = {}
  for (const name of tagNames) {
    if (!(CLIP_IDS as readonly string[]).includes(name)) throw new AnimationError(`pack.tags.${name} is not a v0.1 clip id`)
    const tagRaw = requireRecord(tagsRaw[name], `pack.tags.${name}`)
    const frames = requirePositiveInt(tagRaw.frames, `pack.tags.${name}.frames`)
    const fps = requireFinite(tagRaw.fps, `pack.tags.${name}.fps`)
    if (fps <= 0) throw new AnimationError(`pack.tags.${name}.fps must be > 0`)
    if (typeof tagRaw.loop !== 'boolean') throw new AnimationError(`pack.tags.${name}.loop must be boolean`)
    const tag: AnimTagManifest = { frames, fps, loop: tagRaw.loop }
    if (tagRaw.phase !== undefined) {
      const phase = requireString(tagRaw.phase, `pack.tags.${name}.phase`)
      if (!(PHASES as readonly string[]).includes(phase)) throw new AnimationError(`pack.tags.${name}.phase is invalid: ${phase}`)
      Object.assign(tag, { phase })
    }
    tags[name] = tag
  }

  const animRaw = requireRecord(raw.anim, 'pack.anim')
  const contract = requireString(animRaw.contract, 'pack.anim.contract')
  if (contract !== ANIM_MANIFEST_CONTRACT) {
    throw new AnimationError(`pack.anim.contract must be "${ANIM_MANIFEST_CONTRACT}", got "${contract}"`)
  }
  const character = requireString(animRaw.character, 'pack.anim.character')
  if (!isAnimCharacter(character)) throw new AnimationError(`pack.anim.character is invalid: ${character}`)
  if (options.expectedCharacter !== undefined && options.expectedCharacter !== character) {
    throw new AnimationError(`pack.anim.character is "${character}", expected "${options.expectedCharacter}"`)
  }
  const framePattern = requireString(animRaw.framePattern, 'pack.anim.framePattern')
  if (framePattern !== ANIM_FRAME_PATTERN) {
    throw new AnimationError(`pack.anim.framePattern must be "${ANIM_FRAME_PATTERN}", got "${framePattern}"`)
  }

  const clipsRaw = requireRecord(animRaw.clips, 'pack.anim.clips')
  const clipNames = Object.keys(clipsRaw)
  if (clipNames.length !== CLIP_IDS.length) {
    throw new AnimationError(`pack.anim.clips must have exactly ${CLIP_IDS.length} clips, got ${clipNames.length}`)
  }
  const clips: Partial<Record<ClipId, AnimClipManifest>> = {}
  for (const clip of CLIP_IDS) {
    const clipRaw = requireRecord(clipsRaw[clip], `pack.anim.clips.${clip}`)
    const expected = getClip(character, clip)
    const frames = requirePositiveInt(clipRaw.frames, `pack.anim.clips.${clip}.frames`)
    if (frames !== expected.frames) {
      throw new AnimationError(`pack.anim.clips.${clip}.frames ${frames} != clip table ${expected.frames}`)
    }
    const fps = requireFinite(clipRaw.fps, `pack.anim.clips.${clip}.fps`)
    if (fps !== expected.fps) throw new AnimationError(`pack.anim.clips.${clip}.fps ${fps} != clip table ${expected.fps}`)
    if (clipRaw.loop !== expected.loop) {
      throw new AnimationError(`pack.anim.clips.${clip}.loop != clip table ${String(expected.loop)}`)
    }
    const durationMs = requirePositiveInt(clipRaw.durationMs, `pack.anim.clips.${clip}.durationMs`)
    const expectedDuration = roundedDurationMs(expected)
    if (durationMs !== expectedDuration) {
      throw new AnimationError(`pack.anim.clips.${clip}.durationMs ${durationMs} != expected ${expectedDuration}`)
    }
    const layer = requireString(clipRaw.layer, `pack.anim.clips.${clip}.layer`)
    if (layer !== expected.layer) throw new AnimationError(`pack.anim.clips.${clip}.layer ${layer} != clip table ${expected.layer}`)
    const category = requireString(clipRaw.category, `pack.anim.clips.${clip}.category`)
    if (category !== expected.category) {
      throw new AnimationError(`pack.anim.clips.${clip}.category ${category} != clip table ${expected.category}`)
    }
    const priority = requireFinite(clipRaw.priority, `pack.anim.clips.${clip}.priority`)
    if (priority !== expected.priority) {
      throw new AnimationError(`pack.anim.clips.${clip}.priority ${priority} != clip table ${expected.priority}`)
    }
    const dir = requireString(clipRaw.dir, `pack.anim.clips.${clip}.dir`)
    if (dir !== clip) throw new AnimationError(`pack.anim.clips.${clip}.dir must be "${clip}", got "${dir}"`)
    if (expected.holdMs) {
      const rawHolds = clipRaw.holdMs
      if (!Array.isArray(rawHolds) || rawHolds.length !== expected.holdMs.length) {
        throw new AnimationError(`pack.anim.clips.${clip}.holdMs must be an array of ${expected.holdMs.length} numbers`)
      }
      const holds = rawHolds.map((hold, index) => requireFinite(hold, `pack.anim.clips.${clip}.holdMs[${index}]`))
      for (const [index, hold] of holds.entries()) {
        if (hold !== expected.holdMs[index]) {
          throw new AnimationError(`pack.anim.clips.${clip}.holdMs[${index}] ${hold} != clip table ${String(expected.holdMs[index])}`)
        }
      }
      clips[clip] = { frames, fps, loop: expected.loop, durationMs, layer: expected.layer, category: expected.category, priority, dir, holdMs: holds }
    } else {
      if (clipRaw.holdMs !== undefined) throw new AnimationError(`pack.anim.clips.${clip}.holdMs is only allowed on non-uniform clips`)
      clips[clip] = { frames, fps, loop: expected.loop, durationMs, layer: expected.layer, category: expected.category, priority, dir }
    }
    // Hero tag must agree with the anim clip projection.
    const tag = tags[clip]
    if (!tag) throw new AnimationError(`pack.tags.${clip} missing for anim clip`)
    if (tag.frames !== frames || tag.fps !== fps || tag.loop !== expected.loop) {
      throw new AnimationError(`pack.tags.${clip} does not match pack.anim.clips.${clip}`)
    }
  }
  for (const name of clipNames) {
    if (!(CLIP_IDS as readonly string[]).includes(name)) throw new AnimationError(`pack.anim.clips.${name} is not a v0.1 clip id`)
  }

  const fpsBandsRaw = requireRecord(animRaw.fpsBands, 'pack.anim.fpsBands')
  const fpsBands: Partial<Record<ClipId, FpsBand>> = {}
  for (const clip of CLIP_IDS) {
    const expectedBand = FPS_BANDS[clip]
    const bandRaw = fpsBandsRaw[clip]
    if (expectedBand === undefined) {
      if (bandRaw !== undefined) throw new AnimationError(`pack.anim.fpsBands.${clip} is not a regulated clip`)
      continue
    }
    const band = requireRecord(bandRaw, `pack.anim.fpsBands.${clip}`)
    const resolved: FpsBand = {
      minFps: requireFinite(band.minFps, `pack.anim.fpsBands.${clip}.minFps`),
      maxFps: requireFinite(band.maxFps, `pack.anim.fpsBands.${clip}.maxFps`),
      minFrames: requireFinite(band.minFrames, `pack.anim.fpsBands.${clip}.minFrames`),
      maxFrames: requireFinite(band.maxFrames, `pack.anim.fpsBands.${clip}.maxFrames`),
      ...(band.nonUniform === true ? { nonUniform: true } : {}),
    }
    if (JSON.stringify(resolved) !== JSON.stringify(expectedBand)) {
      throw new AnimationError(`pack.anim.fpsBands.${clip} does not match the code table`)
    }
    fpsBands[clip] = resolved
  }
  for (const name of Object.keys(fpsBandsRaw)) {
    if (!(CLIP_IDS as readonly string[]).includes(name)) throw new AnimationError(`pack.anim.fpsBands.${name} is not a v0.1 clip id`)
  }

  const randomRaw = animRaw.randomMicroActions
  if (!Array.isArray(randomRaw) || randomRaw.map((item) => requireString(item, 'pack.anim.randomMicroActions[]')).join(',') !== RANDOM_MICRO_ACTION_IDS.join(',')) {
    throw new AnimationError(`pack.anim.randomMicroActions must be [${RANDOM_MICRO_ACTION_IDS.join(', ')}]`)
  }
  const tracksRaw = requireRecord(animRaw.tracks, 'pack.anim.tracks')
  const tracks: Record<string, readonly string[]> = {}
  for (const track of TRACKS) {
    const list = tracksRaw[track.id]
    if (!Array.isArray(list)) throw new AnimationError(`pack.anim.tracks.${track.id} must be an array`)
    const ids = list.map((item, index) => requireString(item, `pack.anim.tracks.${track.id}[${index}]`))
    if (ids.join(',') !== track.clips.join(',')) throw new AnimationError(`pack.anim.tracks.${track.id} does not match the code table`)
    tracks[track.id] = ids
  }
  const bubbleRaw = requireRecord(animRaw.bubblePolicy, 'pack.anim.bubblePolicy')
  if (bubbleRaw.speech !== 'solid') throw new AnimationError('pack.anim.bubblePolicy.speech must be "solid"')
  if (bubbleRaw.thought !== 'hollow') throw new AnimationError('pack.anim.bubblePolicy.thought must be "hollow"')

  // Voice/TTS contract: only human/humanoid (Tinglan) may speak and use TTS.
  // cat/dog are thought-only with canTts:false, enforced against the code table.
  const voiceRaw = requireRecord(animRaw.voice, 'pack.anim.voice')
  const expectedVoice = VOICE_CAPABILITIES[character]
  const voiceMode = requireString(voiceRaw.mode, 'pack.anim.voice.mode')
  if (voiceMode !== expectedVoice.mode) {
    throw new AnimationError(`pack.anim.voice.mode must be "${expectedVoice.mode}" for "${character}", got "${voiceMode}"`)
  }
  if (typeof voiceRaw.canTts !== 'boolean' || voiceRaw.canTts !== expectedVoice.canTts) {
    throw new AnimationError(`pack.anim.voice.canTts must be ${String(expectedVoice.canTts)} for "${character}"`)
  }
  const voiceBubble = requireString(voiceRaw.bubble, 'pack.anim.voice.bubble')
  if (voiceBubble !== expectedVoice.bubbleSemantic) {
    throw new AnimationError(`pack.anim.voice.bubble must be "${expectedVoice.bubbleSemantic}" for "${character}"`)
  }
  if (voiceMode === 'none' && (voiceRaw.canTts !== false || voiceBubble === 'speech')) {
    throw new AnimationError('packs with voice.mode "none" cannot enable TTS or speech bubbles')
  }
  const voice = {
    mode: expectedVoice.mode,
    canTts: expectedVoice.canTts,
    bubble: expectedVoice.bubbleSemantic,
  }

  // Spec-only freeze (MB-047/E5-T7): the pack must mirror timing.json exactly,
  // so a frozen clip cannot be re-declared live and a live clip cannot be
  // silently frozen only in the manifest.
  const specOnlyRaw = requireRecord(animRaw.specOnly, 'pack.anim.specOnly')
  const specOnly: Partial<Record<ClipId, string>> = {}
  for (const name of Object.keys(specOnlyRaw)) {
    if (!(CLIP_IDS as readonly string[]).includes(name)) throw new AnimationError(`pack.anim.specOnly.${name} is not a v0.1 clip id`)
  }
  for (const clip of CLIP_IDS) {
    const expectedReason = SPEC_ONLY_CLIPS[clip]
    const rawReason = specOnlyRaw[clip]
    if (expectedReason === undefined) {
      if (rawReason !== undefined) throw new AnimationError(`pack.anim.specOnly.${clip} is not frozen in timing.json`)
      continue
    }
    if (rawReason === undefined) throw new AnimationError(`pack.anim.specOnly.${clip} is missing (frozen spec-only clip)`)
    const reason = requireString(rawReason, `pack.anim.specOnly.${clip}`)
    if (reason !== expectedReason) throw new AnimationError(`pack.anim.specOnly.${clip} does not match timing.json`)
    specOnly[clip] = reason
  }

  const assetsRaw = raw.assets
  if (!Array.isArray(assetsRaw) || assetsRaw.length === 0) throw new AnimationError('pack.assets must be a non-empty array')
  const assets = assetsRaw.map((asset, index) => requireString(asset, `pack.assets[${index}]`))
  const expected = expectedAssets(character)
  if (assets.length !== expected.length) {
    throw new AnimationError(`pack.assets length ${assets.length} != expected ${expected.length} frames`)
  }
  for (const [index, asset] of assets.entries()) {
    if (asset !== expected[index]) {
      throw new AnimationError(`pack.assets[${index}] "${asset}" != expected "${expected[index] ?? ''}"`)
    }
  }

  const license = requireString(raw.license, 'pack.license')
  const aiRaw = asRecord(raw.ai, 'pack.ai')
  const status = requireString(aiRaw.status, 'pack.ai.status')
  if (!(AI_STATUSES as readonly string[]).includes(status)) throw new AnimationError(`pack.ai.status is invalid: ${status}`)
  const ai: { status: 'none' | 'concept' | 'final'; tool?: string } = {
    status: status as 'none' | 'concept' | 'final',
  }
  if (aiRaw.tool !== undefined) ai.tool = requireString(aiRaw.tool, 'pack.ai.tool')

  const resolved: AnimManifest = {
    id,
    style,
    formatVersion,
    canvas,
    anchor,
    footBox,
    palette,
    tags,
    anim: {
      contract,
      character,
      framePattern,
      clips: clips as Record<ClipId, AnimClipManifest>,
      fpsBands,
      randomMicroActions: randomRaw as string[],
      tracks,
      bubblePolicy: { speech: 'solid', thought: 'hollow' },
      voice,
      specOnly,
    },
    assets,
    license,
    ai,
    ...(raw.placeholder === true ? { placeholder: true } : {}),
    ...(typeof raw.sourceSpec === 'string' ? { sourceSpec: raw.sourceSpec } : {}),
    ...(typeof raw.generator === 'string' ? { generator: raw.generator } : {}),
  }
  return resolved
}

/** Character-agnostic summary used by QA/docs: clips + durations for one pack. */
export function describeAnimPack(manifest: AnimManifest): Array<{ clip: ClipId; frames: number; fps: number; loop: boolean; durationMs: number }> {
  const specs = clipSpecs(manifest.anim.character)
  return CLIP_ORDER.map((clip) => {
    const meta = manifest.anim.clips[clip]
    const spec = specs.find((candidate) => candidate.id === clip)
    return {
      clip,
      frames: meta.frames,
      fps: meta.fps,
      loop: meta.loop,
      durationMs: spec ? Math.round(clipDurationMs(spec)) : meta.durationMs,
    }
  })
}

export function animCharacters(): readonly AnimCharacter[] {
  return ANIM_CHARACTERS
}
