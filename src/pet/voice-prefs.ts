/**
 * Pet TTS voice preference (`stella` | `tide`) — storage + TTS-signature helper.
 *
 * 2026-11-17 voice-switch: the baked pack ships both official DeepSeek TTS
 * voices, but until now the UI had no switch. The preference lives next to the
 * other pet preferences under `desktop-games/pet/voice` (plain voice id, same
 * style as the volume key) and is read through the defensive safe-storage
 * helpers, so a missing/blocked/corrupted entry keeps the default `stella`
 * instead of poisoning playback.
 *
 * The selected voice is part of the TTS CONFIG SIGNATURE (`formatVoiceModeLabel`
 * feeds the `mode` field of `consent/tts.ts`), so switching `stella`↔`tide`
 * changes the signature and the pet must show the separate TTS declaration
 * again. It is deliberately NOT stored as consent: a persisted preference can
 * never count as a TTS confirmation, and the TOS acceptance never substitutes
 * for it.
 */
import { DEFAULT_TTS_VOICE, type TtsVoiceId } from '../voice/types.ts'
import {
  safeGetItem,
  safeSetItem,
  safeRemoveItem,
  type StorageLike,
  type StorageWriteStatus,
} from './security/safe-storage.ts'

/** localStorage namespace for the pet voice preference (value: `stella` | `tide`). */
export const VOICE_PREF_STORAGE_KEY = 'desktop-games/pet/voice'

export interface VoiceOption {
  readonly id: TtsVoiceId
  /** Short label for radios/badges. */
  readonly label: string
  /** Human description, including the default marker. */
  readonly description: string
  readonly default?: boolean
}

/** Both voices are official DeepSeek TTS synthetic voices, both baked (21 lines each). */
export const VOICE_OPTIONS: readonly VoiceOption[] = [
  { id: 'stella', label: 'stella · 海星', description: '女声 · 默认', default: true },
  { id: 'tide', label: 'tide · 暗潮', description: '男声' },
]

/** The baked/cloud voice ids this build understands (anything else is invalid). */
export function isTtsVoiceId(value: unknown): value is TtsVoiceId {
  return value === 'stella' || value === 'tide'
}

/**
 * Parse a raw stored value. Invalid/blank/legacy values fall back to the
 * default `stella`; they are never coerced into an arbitrary voice id.
 */
export function parseVoicePref(raw: string | null | undefined): TtsVoiceId {
  if (typeof raw !== 'string') return DEFAULT_TTS_VOICE
  const value = raw.trim().toLowerCase()
  return isTtsVoiceId(value) ? value : DEFAULT_TTS_VOICE
}

/** Read the preference (default stella when storage is missing/blocked/invalid). */
export function readVoicePref(storage?: StorageLike | null): TtsVoiceId {
  return parseVoicePref(safeGetItem(VOICE_PREF_STORAGE_KEY, storage))
}

export type VoiceWriteStatus = StorageWriteStatus | 'invalid'

/**
 * Persist a voice choice. Only a known voice id is ever written; an invalid
 * runtime value is refused (`invalid`) instead of being stored or defaulted
 * behind the caller's back.
 */
export function writeVoicePref(voice: TtsVoiceId, storage?: StorageLike | null): VoiceWriteStatus {
  if (!isTtsVoiceId(voice)) return 'invalid'
  const status = safeSetItem(VOICE_PREF_STORAGE_KEY, voice, storage)
  return status === 'ok' ? 'ok' : status
}

/** Remove the preference (falls back to the default stella on next read). */
export function clearVoicePref(storage?: StorageLike | null): boolean {
  return safeRemoveItem(VOICE_PREF_STORAGE_KEY, storage)
}

/** Human label for a voice (badges/copy); falls back to the default id. */
export function voiceLabel(voice: TtsVoiceId = DEFAULT_TTS_VOICE): string {
  const option = VOICE_OPTIONS.find((entry) => entry.id === voice)
  return option ? `${option.label}（${option.description}）` : voice
}

/**
 * Compose the TTS `mode` label with the selected voice. `consent/tts.ts` hashes
 * this string into the TTS config signature, so any voice change re-prompts the
 * separate declaration (`stella` and `tide` always yield different signatures).
 */
export function formatVoiceModeLabel(baseMode: string, voice: TtsVoiceId = DEFAULT_TTS_VOICE): string {
  const base = baseMode.trim().replace(/\s+/g, ' ') || 'default'
  return `${base} · 音色:${voice}`
}
