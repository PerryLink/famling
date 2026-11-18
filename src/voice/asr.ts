/**
 * Rust-proxied DeepSeek ASR. The API key stays in Rust; audio is capped at
 * 8 MiB (the official limit) and never persisted by this module.
 */
export async function transcribeWav(audio: ArrayBuffer): Promise<string> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('asr: tauri unavailable')
  }
  if (audio.byteLength === 0 || audio.byteLength > 8 * 1024 * 1024) {
    throw new Error('asr: audio must be 1 byte..8 MiB')
  }
  const bytes = new Uint8Array(audio)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<string>('voice_asr', { audioBase64: btoa(binary) })
}
