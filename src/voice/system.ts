import type { VoiceClip, VoiceProvider, VoiceRequest } from './types.ts'

/** Browser/WebView2 SpeechSynthesis fallback; quality/voices vary by system. */
export class SystemVoiceProvider implements VoiceProvider {
  readonly id = 'system'
  async speak(request: VoiceRequest): Promise<VoiceClip> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      throw new Error('system speech synthesis unavailable')
    }
    const utterance = new SpeechSynthesisUtterance(request.text)
    utterance.lang = 'zh-CN'
    utterance.rate = request.emotion === 'sleepy' ? 0.85 : request.emotion === 'happy' ? 1.08 : 1
    utterance.pitch = request.emotion === 'sad' ? 0.85 : request.emotion === 'happy' ? 1.15 : 1
    window.speechSynthesis.speak(utterance)
    return {
      id: `system:${Date.now()}`,
      text: request.text,
      provider: this.id,
      durationMs: Math.max(300, request.text.length * 180),
    }
  }
  stop(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
  }
}
