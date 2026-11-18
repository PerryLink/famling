/**
 * Voice-clone capability boundary (2026-11-17).
 *
 * RESEARCH RESULT (documented in docs/audit/VOICE-SWITCH-2026-11-17.md):
 * DeepSeek's official TTS endpoint (`POST /v1/tools/tts`) accepts only the two
 * shipped synthetic `voice_id`s, `stella` and `tide`. The official docs expose
 * NO public voice-cloning endpoint: there is no request field that takes a user
 * audio sample and no documented way to obtain a custom `voice_id`. Third-party
 * projects that advertise "DeepSeek voice cloning" train their own models on
 * unrelated providers; they are not an official DeepSeek API.
 *
 * Therefore this module is an EXPLICIT placeholder, not a fake implementation:
 * - `deepseekVoiceCloneProvider.supported` is `false`;
 * - `cloneVoice(sample)` resolves an honest `{ ok: false, reason: 'unsupported' }`
 *   result and never uploads/encodes/derives anything;
 * - there is no network/fetch path here at all (the sample is only passed in
 *   memory and immediately reported as unsupported).
 *
 * The setup page's local recorder is intentionally separate: it stores a short
 * sample locally for playback/download only. It never claims the sample has been
 * cloned, and no cloned voice can ever be returned by this provider.
 */
import type { TtsVoiceId } from './types.ts'

/** Machine-readable status: the official clone API does not exist (publicly). */
export const DEEPSEEK_VOICE_CLONE_STATUS = 'unsupported' as const

/**
 * User-facing truthful statement. Kept in one place so the setup page, docs and
 * tests cannot drift into claiming a clone was created.
 */
export const VOICE_CLONE_UNSUPPORTED_COPY =
  '官方 DeepSeek TTS 当前未提供公开音色克隆 API，录音仅本地保存/试听，不声称已克隆。'

/** The only voice ids the official DeepSeek TTS API documents/exposes. */
export const DEEPSEEK_OFFICIAL_TTS_VOICES: readonly TtsVoiceId[] = ['stella', 'tide']

/** Bounded metadata for a locally recorded sample; never uploaded by this module. */
export interface VoiceCloneSample {
  readonly id: string
  readonly mimeType: string
  readonly bytes: number
  readonly durationMs: number
}

export type VoiceCloneResult =
  | { readonly ok: true; readonly provider: string; readonly voiceId: string }
  | {
      readonly ok: false
      readonly provider: string
      readonly reason: typeof DEEPSEEK_VOICE_CLONE_STATUS
      readonly status: typeof DEEPSEEK_VOICE_CLONE_STATUS
      readonly message: string
    }

/**
 * Future official-API seam. A real provider may only be added once DeepSeek
 * documents (and the user authorizes) a public voice-cloning endpoint; until
 * then implementations must stay honest about `supported === false`.
 */
export interface VoiceCloneProvider {
  readonly id: string
  readonly supported: boolean
  cloneVoice(sample: VoiceCloneSample): Promise<VoiceCloneResult>
}

/**
 * Placeholder provider for the not-yet-existing official DeepSeek clone API.
 * `cloneVoice` is deterministic, does not touch the sample's audio, performs no
 * I/O, and always reports unsupported (it never fabricates a voice id).
 */
export class UnsupportedVoiceCloneProvider implements VoiceCloneProvider {
  readonly id = 'deepseek-voice-clone'
  readonly supported = false

  async cloneVoice(_sample: VoiceCloneSample): Promise<VoiceCloneResult> {
    return {
      ok: false,
      provider: this.id,
      reason: DEEPSEEK_VOICE_CLONE_STATUS,
      status: DEEPSEEK_VOICE_CLONE_STATUS,
      message: VOICE_CLONE_UNSUPPORTED_COPY,
    }
  }
}

/** The one provider instance the app/UI may ask about clone support. */
export const deepseekVoiceCloneProvider: VoiceCloneProvider = new UnsupportedVoiceCloneProvider()
