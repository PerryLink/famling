/**
 * Which characters may use the DeepSeek/browser TTS voice.
 *
 * Product rule (2026-11-18): only the human presentation (汀岚 / humanoid) is voiced.
 * Cat and dog personas are silent companions: their speech is shown as a hollow
 * thought bubble and never sent to TTS. The folded-paper shell (?hero off) is the
 * human presentation, so it stays voiced. Kept standalone in the public export
 * (the animation capability table is a private development detail).
 */
import type { HeroCharacterId } from './hero-runtime.ts'

export type BubbleSemantic = 'speech' | 'thought'

export function characterCanVoice(character: HeroCharacterId, heroEnabled: boolean): boolean {
  if (!heroEnabled) return true
  return character === 'humanoid' || character === 'tinglan'
}

export function characterBubbleSemantic(character: HeroCharacterId, heroEnabled: boolean): BubbleSemantic {
  return characterCanVoice(character, heroEnabled) ? 'speech' : 'thought'
}