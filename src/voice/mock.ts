import type { VoiceClip, VoiceProvider, VoiceRequest } from './types.ts'

/** Deterministic provider for tests/demos; no audio hardware, no network. */
export class MockVoiceProvider implements VoiceProvider {
  readonly id: string = 'mock'
  calls = 0
  async speak(request: VoiceRequest): Promise<VoiceClip> {
    this.calls++
    return {
      id: `${this.id}:${this.calls}`,
      text: request.text,
      provider: this.id,
      durationMs: Math.max(120, request.text.length * 80),
      envelope: [0.2, 0.7, 0.4, 0.6, 0.1],
    }
  }
}
