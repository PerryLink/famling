/**
 * Which characters may use the DeepSeek/browser TTS voice.
 *
 * Product rule (2026-11-18): only the human presentation (汀岚 / humanoid) is
 * voiced. Cat and dog personas are silent companions: their speech is rendered
 * as a hollow "thought" bubble and never sent to TTS. The folded-paper shell
 * (?hero is off) is the human presentation, so it stays voiced.
 *
 * The animation subsystem owns the canonical capability table
 * (`VOICE_CAPABILITIES` in anim/types.ts, also mirrored in each pack manifest),
 * so this module only maps the hero character id onto it; no second source of
 * truth for canTts/bubbleSemantic.
 */
import type { HeroCharacterId } from './hero-runtime.ts'
import { VOICE_CAPABILITIES } from './anim/types.ts'

export type BubbleSemantic = 'speech' | 'thought'

function animCharacterOf(character: HeroCharacterId): keyof typeof VOICE_CAPABILITIES {
  if (character === 'cat' || character === 'dog') return character
  return 'human'
}

export function characterCanVoice(character: HeroCharacterId, heroEnabled: boolean): boolean {
  if (!heroEnabled) return true
  return VOICE_CAPABILITIES[animCharacterOf(character)].canTts
}

export function characterBubbleSemantic(character: HeroCharacterId, heroEnabled: boolean): BubbleSemantic {
  if (!heroEnabled) return 'speech'
  return VOICE_CAPABILITIES[animCharacterOf(character)].bubbleSemantic
}