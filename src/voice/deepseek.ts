import {
  DEFAULT_TTS_VOICE,
  type TtsVoiceId,
  type VoiceClip,
  type VoiceProvider,
  type VoiceRequest,
} from './types.ts'

export interface DeepSeekTtsTransport {
  /** Implemented by a Tauri command or local proxy; must never receive a key from the WebView. */
  synthesize(request: { text: string; voice: TtsVoiceId; format: 'wav' | 'pcm' }): Promise<VoiceClip>
}

/**
 * Cloud TTS adapter. Disabled unless the host injects a Rust-proxied transport
 * and a key exists outside the WebView.
 *
 * The constructor voice is the default; an explicit `VoiceRequest.voice` (e.g.
 * `tide`) overrides it so the paid call stays in the voice the caller asked for.
 */
export class DeepSeekTtsProvider implements VoiceProvider {
  readonly id = 'deepseek-tts'
  readonly billing = true
  constructor(
    private readonly transport: DeepSeekTtsTransport,
    private readonly voice: TtsVoiceId = DEFAULT_TTS_VOICE,
  ) {}
  async speak(request: VoiceRequest): Promise<VoiceClip> {
    const voice = request.voice ?? this.voice
    const clip = await this.transport.synthesize({ text: request.text, voice, format: 'wav' })
    return { ...clip, text: request.text, provider: `${this.id}:${voice}` }
  }
}
