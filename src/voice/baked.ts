import {
  DEFAULT_TTS_VOICE,
  type TtsVoiceId,
  type VoiceClip,
  type VoiceProvider,
  type VoiceRequest,
} from './types.ts'
import { wavDurationMs } from './tauri.ts'

/**
 * Baked (pre-generated) voice pack manifest.
 *
 * Two DeepSeek TTS synthetic voices are baked and shipped in
 * `public/assets/voice/pet/` (user authorization 2026-11-17; see
 * docs/legal/TTS-TERMS.md §3A): 21 `stella` WAVs at the pack root and 21
 * `tide` WAVs under `tide/` (42 rows total). Runtime playback tries this pack
 * first, so a settled line never triggers a paid cloud call again; `stella`
 * stays the default voice. Audio remains governed by the DeepSeek TTS terms;
 * the per-row `license`/`ai`/`provider` fields are provenance metadata, not a
 * re-licence.
 */
export interface BakedVoicePreset {
  id: string
  provider?: string
  label?: string
  /** `available` = WAVs are shipped; `planned` = needs generation, never faked. */
  status?: 'available' | 'planned' | string
  default?: boolean
  ai?: boolean
  license?: string
  lineCount?: number
  note?: string
}

export interface BakedLine {
  id: string
  text: string
  file: string
  /** TTS voice id that produced this WAV (`stella` or `tide`). */
  voice?: string
  provider?: string
  ai?: boolean
  license?: string
  bytes?: number
  durationMs?: number
  sha256?: string
  createdAt?: string
}

export interface BakedManifest {
  schemaVersion?: number
  voice?: string
  note?: string
  generatedBy?: string
  generatedAt?: string
  updatedAt?: string
  authorization?: Record<string, unknown>
  provider?: Record<string, unknown>
  voicePresets?: BakedVoicePreset[]
  pendingLines?: Array<{ id: string; text: string; source?: string; status?: string }>
  lines: BakedLine[]
}

/** Ignore a leading ellipsis when matching a baked line (subtitle may intentionally add one). */
export function normalizeBakedText(text: string): string {
  return text.replace(/^[.…。!?！？\s]+/u, '').trim()
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Validate the JSON fetched from `manifest.json`. Throws instead of trusting an
 * untyped cast: a malformed manifest should fall back to system/cloud voice,
 * never index into undefined rows.
 */
export function parseBakedManifest(raw: unknown): BakedManifest {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('baked: manifest is not an object')
  }
  const record = raw as Record<string, unknown>
  if (!Array.isArray(record.lines)) throw new Error('baked: manifest.lines is not an array')
  const lines: BakedLine[] = record.lines.map((entry, index) => {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`baked: manifest.lines[${index}] is not an object`)
    }
    const line = entry as Record<string, unknown>
    for (const field of ['id', 'text', 'file'] as const) {
      if (!nonEmptyString(line[field])) throw new Error(`baked: manifest.lines[${index}].${field} is invalid`)
    }
    for (const field of ['voice', 'provider', 'license', 'sha256', 'createdAt'] as const) {
      if (line[field] !== undefined && typeof line[field] !== 'string') {
        throw new Error(`baked: manifest.lines[${index}].${field} is invalid`)
      }
    }
    for (const field of ['bytes', 'durationMs'] as const) {
      if (line[field] !== undefined && (typeof line[field] !== 'number' || !Number.isFinite(line[field]))) {
        throw new Error(`baked: manifest.lines[${index}].${field} is invalid`)
      }
    }
    if (line.ai !== undefined && typeof line.ai !== 'boolean') {
      throw new Error(`baked: manifest.lines[${index}].ai is invalid`)
    }
    return { ...(line as unknown as BakedLine) }
  })
  const presets = record.voicePresets
  if (presets !== undefined) {
    if (!Array.isArray(presets)) throw new Error('baked: manifest.voicePresets is not an array')
    for (const [index, preset] of presets.entries()) {
      if (preset === null || typeof preset !== 'object' || Array.isArray(preset)) {
        throw new Error(`baked: manifest.voicePresets[${index}] is not an object`)
      }
      const row = preset as Record<string, unknown>
      if (!nonEmptyString(row.id)) {
        throw new Error(`baked: manifest.voicePresets[${index}].id is invalid`)
      }
      if (row.status !== undefined && typeof row.status !== 'string') {
        throw new Error(`baked: manifest.voicePresets[${index}].status is invalid`)
      }
      if (row.lineCount !== undefined && (typeof row.lineCount !== 'number' || !Number.isFinite(row.lineCount))) {
        throw new Error(`baked: manifest.voicePresets[${index}].lineCount is invalid`)
      }
      for (const field of ['default', 'ai'] as const) {
        if (row[field] !== undefined && typeof row[field] !== 'boolean') {
          throw new Error(`baked: manifest.voicePresets[${index}].${field} is invalid`)
        }
      }
    }
  }
  return { ...(record as unknown as BakedManifest), lines }
}

/** Find a preset by TTS voice id (e.g. `stella`, `tide`). */
export function findBakedPreset(manifest: BakedManifest, id: string): BakedVoicePreset | null {
  return manifest.voicePresets?.find((preset) => preset.id === id) ?? null
}

/**
 * Whether the manifest can serve a voice from the baked pack.
 *
 * A preset must say `available`; a legacy manifest without `voicePresets` can
 * only serve the default `stella` rows. An unknown or `planned` voice always
 * misses, so it falls through to cloud/system TTS instead of reusing another
 * voice's WAVs.
 */
export function isBakedVoiceAvailable(manifest: BakedManifest, voice: string = DEFAULT_TTS_VOICE): boolean {
  const preset = findBakedPreset(manifest, voice)
  if (preset) return preset.status === 'available'
  return voice === DEFAULT_TTS_VOICE
}

/**
 * Match a spoken line against the baked pack for one voice.
 *
 * `voice` defaults to `stella` (the default preset). Rows without a per-row
 * `voice` are legacy stella rows and are never treated as another voice, so
 * `tide` cannot be faked by reusing unmarked/stella audio.
 */
export function findBakedLine<T extends { text: string; voice?: string }>(
  lines: readonly T[],
  text: string,
  voice: string = DEFAULT_TTS_VOICE,
): T | null {
  const candidates = lines.filter(
    (line) => line.voice === voice || (voice === DEFAULT_TTS_VOICE && line.voice === undefined),
  )
  if (candidates.length === 0) return null
  const direct = candidates.find((line) => line.text === text)
  if (direct) return direct
  const normalized = normalizeBakedText(text)
  if (!normalized) return null
  return candidates.find((line) => normalizeBakedText(line.text) === normalized) ?? null
}

export interface BakedVoiceProviderOptions {
  /** Default baked voice (default `stella`); a `VoiceRequest.voice` overrides it. */
  voice?: TtsVoiceId
  /** Injectable fetch for tests / non-browser hosts (default: global fetch). */
  fetch?: typeof fetch
  /** Reject a clip whose byte length disagrees with the manifest (default true). */
  enforceBytes?: boolean
}

/** Resolve the voice for one request: explicit request voice wins, then the provider default. */
export function resolveBakedVoice(request: VoiceRequest, fallback: TtsVoiceId = DEFAULT_TTS_VOICE): TtsVoiceId {
  return request.voice ?? fallback
}

/**
 * Pre-generated placeholder voice lines served from `public/assets/voice/<pack>`.
 *
 * This provider is free (`billing` is unset), so `VoiceService` never charges the
 * cloud budget or falls back to a paid provider when a line is baked. A miss
 * throws and the injected provider chain continues (cloud TTS first when a
 * key exists, then system TTS, then the silent mock). Each voice only serves its
 * own rows; an unavailable voice misses before any audio request.
 */
export class BakedVoiceProvider implements VoiceProvider {
  readonly id = 'baked'
  private manifest: BakedManifest | null = null
  private loading: Promise<BakedManifest> | null = null
  private readonly voice: TtsVoiceId
  private readonly fetcher: typeof fetch
  private readonly enforceBytes: boolean

  constructor(
    private readonly base = '/assets/voice/pet',
    options: BakedVoiceProviderOptions = {},
  ) {
    this.voice = options.voice ?? DEFAULT_TTS_VOICE
    this.fetcher = options.fetch ?? ((...args) => fetch(...args))
    this.enforceBytes = options.enforceBytes ?? true
  }

  /** Load + validate the manifest once; concurrent callers share one fetch. */
  private async load(): Promise<BakedManifest> {
    if (this.manifest) return this.manifest
    if (!this.loading) {
      this.loading = (async () => {
        // A hung manifest request must reject and clear the shared pending
        // promise; otherwise one network stall disables baked voice forever.
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('baked: manifest timeout')), 8000)
        })
        try {
          const response = await Promise.race([this.fetcher(`${this.base}/manifest.json`), timeout])
          if (!response.ok) throw new Error('baked: manifest missing')
          const parsed = parseBakedManifest(await response.json())
          this.manifest = parsed
          return parsed
        } finally {
          if (timer !== undefined) clearTimeout(timer)
        }
      })().finally(() => {
        this.loading = null
      })
    }
    return this.loading
  }

  async speak(request: VoiceRequest): Promise<VoiceClip> {
    const manifest = await this.load()
    const voice = resolveBakedVoice(request, this.voice)
    if (!isBakedVoiceAvailable(manifest, voice)) {
      throw new Error(`baked: voice not available (${voice})`)
    }
    const line = findBakedLine(manifest.lines, request.text, voice)
    if (!line) throw new Error(`baked: line not pre-generated (voice ${voice})`)
    const response = await this.fetcher(`${this.base}/${line.file}`)
    if (!response.ok) throw new Error(`baked: audio missing (${line.file})`)
    const audio = await response.arrayBuffer()
    if (this.enforceBytes && typeof line.bytes === 'number' && audio.byteLength !== line.bytes) {
      throw new Error(`baked: audio size mismatch for ${line.file} (manifest ${line.bytes}B, got ${audio.byteLength}B)`)
    }
    const durationMs =
      wavDurationMs(audio) || line.durationMs || Math.max(400, [...line.text].length * 180)
    return {
      id: `baked:${voice}:${line.id}`,
      text: line.text,
      provider: this.id,
      durationMs,
      audio,
    }
  }
}
