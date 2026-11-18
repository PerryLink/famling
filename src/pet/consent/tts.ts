/**
 * TTS configuration signature.
 *
 * The TTS declaration is confirmed per (session, signature). A new session has
 * a fresh gate, so the first synthesis always re-prompts; inside a session any
 * config change (mute->on, provider/mode switch, volume change) changes the
 * signature and therefore re-prompts. Nothing here is persisted: a TTS
 * confirmation can never become a permanent waiver, and it is deliberately
 * separate from the TOS acceptance.
 */
export const TTS_CONFIG_VERSION = 'tts-v1'

export interface TtsConfigState {
  readonly muted: boolean
  /** Human-readable voice provider/mode label shown in the UI. */
  readonly mode: string
  /** 0..100 volume; part of TTS config, so changing it re-confirms playback. */
  readonly volume: number
  /** Optional per-session nonce; a new session must re-confirm. */
  readonly sessionId?: string
}

export function ttsConfigSignature(state: TtsConfigState): string {
  const mode = state.mode.trim().replace(/\s+/g, ' ') || 'default'
  const volume = Number.isFinite(state.volume) ? Math.round(state.volume) : 0
  const session = state.sessionId ? `|session:${state.sessionId}` : ''
  return [TTS_CONFIG_VERSION, state.muted ? 'muted' : 'on', `mode:${mode}`, `vol:${volume}`].join('|') + session
}
