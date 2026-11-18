/**
 * ASR (speech recognition) configuration signature.
 *
 * The separate ASR declaration is confirmed per (session, signature). A new
 * session has a fresh gate, so the first microphone use always re-prompts;
 * inside a session any material ASR config change (provider endpoint, max
 * recording length, upload cap) changes the signature and therefore re-prompts.
 *
 * Nothing here is persisted: an ASR confirmation can never become a permanent
 * waiver, and it is deliberately separate from both the TOS acceptance and the
 * TTS declaration (neither of them can enable the microphone).
 */
export const ASR_CONFIG_VERSION = 'asr-v1'

export interface AsrConfigState {
  /** Upload target/provider label, e.g. `deepseek`. */
  readonly provider: string
  /** Hard cap on a single recording, in seconds (TalkRecorder MAX_TALK_MS). */
  readonly maxSeconds: number
  /** Hard cap on the uploaded WAV size in bytes (ASR transport limit). */
  readonly maxWavBytes: number
  /** Optional per-session nonce; a new session must re-confirm. */
  readonly sessionId?: string
}

export function asrConfigSignature(state: AsrConfigState): string {
  const provider = state.provider.trim().replace(/\s+/g, ' ') || 'default'
  const seconds = Number.isFinite(state.maxSeconds) ? Math.max(1, Math.round(state.maxSeconds)) : 60
  const bytes = Number.isFinite(state.maxWavBytes) ? Math.max(1, Math.round(state.maxWavBytes)) : 8 * 1024 * 1024
  const session = state.sessionId ? `|session:${state.sessionId}` : ''
  return [ASR_CONFIG_VERSION, `provider:${provider}`, `s:${seconds}`, `b:${bytes}`].join('|') + session
}
