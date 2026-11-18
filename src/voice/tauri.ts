import {
  DEFAULT_TTS_VOICE,
  type TtsVoiceId,
  type VoiceClip,
  type VoiceProvider,
  type VoiceRequest,
} from './types.ts'

/** Hard cap for a base64-proxied cloud TTS clip (decoded bytes ≈ 3/4 of this). */
export const MAX_TTS_AUDIO_BASE64_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3) + 4

function decodeBase64(base64: string): ArrayBuffer {
  if (typeof base64 !== 'string' || base64.length === 0) throw new Error('voice: empty audio')
  // Unbounded atob can inflate memory; reject before decoding (P2-3).
  if (base64.length > MAX_TTS_AUDIO_BASE64_CHARS) {
    throw new Error(`voice: audio payload too large (${base64.length} base64 chars)`)
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/** Read the byteRate/data fields of a PCM WAV; fall back to an estimate. */
export function wavDurationMs(buffer: ArrayBuffer): number {
  const view = new DataView(buffer)
  if (view.byteLength < 44) return 0
  const riff = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (riff !== 'RIFF') return 0
  let offset = 12
  let byteRate = 0
  let dataSize = 0
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
    const size = view.getUint32(offset + 4, true)
    if (id === 'fmt ' && offset + 16 <= view.byteLength) byteRate = view.getUint32(offset + 16, true)
    if (id === 'data') {
      dataSize = Math.min(size, view.byteLength - offset - 8)
      break
    }
    offset += 8 + size + (size % 2)
  }
  return byteRate > 0 ? Math.round((dataSize / byteRate) * 1000) : 0
}

/**
 * Rust-proxied DeepSeek TTS. The API key is read only by Rust; this module never
 * sees it. Callers should fall back to a baked/system provider on errors.
 *
 * Both cloud voice ids (`stella`/`tide`) are supported by the proxy and both
 * have a shipped baked pack (21 WAVs each; user authorization 2026-11-17). A
 * baked miss (e.g. a dynamic template line) reaches this paid provider in the
 * requested voice; the baked pack never fakes one voice with another's files.
 */
export function createTauriDeepSeekProvider(voice: TtsVoiceId = DEFAULT_TTS_VOICE): VoiceProvider {
  return {
    id: 'deepseek-tts',
    billing: true,
    async speak(request: VoiceRequest): Promise<VoiceClip> {
      if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
        throw new Error('voice: tauri unavailable')
      }
      // Rust rejects > 500 chars; fail here first so no IPC/cost happens.
      if (request.text.length === 0 || [...request.text].length > 500) {
        throw new Error('voice: text too long for the cloud proxy')
      }
      const effectiveVoice = request.voice ?? voice
      const { invoke } = await import('@tauri-apps/api/core')
      const base64 = await invoke<string>('voice_synthesize', { text: request.text, voice: effectiveVoice })
      const audio = decodeBase64(base64)
      return {
        id: `deepseek:${Date.now()}`,
        text: request.text,
        provider: `deepseek-tts:${effectiveVoice}`,
        durationMs: wavDurationMs(audio) || Math.max(300, request.text.length * 180),
        audio,
      }
    },
  }
}
