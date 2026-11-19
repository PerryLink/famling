/**
 * Host-side consent bridge (P1-4): mirror the renderer's TOS/TTS/ASR consent
 * decisions into the Tauri (Rust) process, so IPC commands cannot be invoked
 * directly by an unconsented page.
 *
 * Invariants:
 * - The renderer remains the source of the consent UX; Rust re-validates the
 *   TOS version+hash against the values compiled into the binary.
 * - A memory-only acceptance (blocked localStorage) is recorded in process
 *   memory only (persist: false) and any old durable marker is removed, so a
 *   later --game= launch cannot rely on a session-only consent.
 * - Every helper is a no-op outside Tauri (browser/dev) and never throws into
 *   the pet boot path: failures are returned as null/false and the caller
 *   keeps the renderer-side gate in force.
 */
import type { ConsentSnapshotView } from './gate.ts'
import { TOS_HASH, TOS_VERSION } from './terms.ts'

/** Commands registered by app/tauri/src-tauri/src/main.rs. */
export const HOST_CONSENT_COMMANDS = {
  record: 'record_host_consent',
  revoke: 'revoke_host_consent',
  voice: 'grant_host_voice_consent',
  status: 'host_consent_status',
} as const

export type HostVoiceConsentKind = 'tts' | 'asr'

export interface HostConsentRecord {
  readonly tosVersion: string
  readonly tosHash: string
  readonly acceptedAt: string
  /** False when localStorage is unavailable: the acceptance is session-only. */
  readonly persist: boolean
}

export interface HostConsentSyncResult {
  readonly accepted: boolean
  readonly persistence: 'local' | 'memory'
  /** Set when the host opened a held --game= route after this acceptance. */
  readonly launched: string | null
}

type ConsentSnapshotLike = Pick<
  ConsentSnapshotView,
  'mode' | 'status' | 'acceptedAt' | 'persistence' | 'tosVersion' | 'tosHash'
>

/**
 * Pure projection of a renderer consent snapshot into the record the host may
 * store. Returns null unless the CURRENT TOS version+hash was explicitly
 * accepted, so a stale/corrupt snapshot can never produce a host acceptance.
 */
export function hostConsentRecord(snapshot: ConsentSnapshotLike): HostConsentRecord | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  if (snapshot.mode !== 'accepted' || snapshot.status !== 'accepted') return null
  if (snapshot.tosVersion !== TOS_VERSION || snapshot.tosHash !== TOS_HASH) return null
  if (typeof snapshot.acceptedAt !== 'string' || snapshot.acceptedAt.length === 0) return null
  if (!Number.isFinite(Date.parse(snapshot.acceptedAt))) return null
  return {
    tosVersion: TOS_VERSION,
    tosHash: TOS_HASH,
    acceptedAt: snapshot.acceptedAt.slice(0, 40),
    persist: snapshot.persistence === 'local',
  }
}

function hasTauriInternals(): boolean {
  try {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  } catch {
    return false
  }
}

async function invokeHost<T>(command: string, args: Record<string, unknown> = {}): Promise<T | null> {
  if (!hasTauriInternals()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<T>(command, args)
  } catch {
    // Older host / dev browser: keep the renderer gate; never report success.
    return null
  }
}

/** Record a successful full-TOS acceptance; no-op/null outside Tauri. */
export async function syncHostConsent(snapshot: ConsentSnapshotLike): Promise<HostConsentSyncResult | null> {
  const record = hostConsentRecord(snapshot)
  if (!record) return null
  return invokeHost<HostConsentSyncResult>(HOST_CONSENT_COMMANDS.record, {
    tosVersion: record.tosVersion,
    tosHash: record.tosHash,
    acceptedAt: record.acceptedAt,
    persist: record.persist,
  })
}

/** Revoke the host TOS + voice grants and delete the durable marker. */
export async function revokeHostConsent(): Promise<boolean | null> {
  return invokeHost<boolean>(HOST_CONSENT_COMMANDS.revoke)
}

/** Mirror a TTS/ASR declaration confirmation (memory-only, per session). */
export async function grantHostVoiceConsent(kind: HostVoiceConsentKind): Promise<boolean | null> {
  if (kind !== 'tts' && kind !== 'asr') return null
  return invokeHost<boolean>(HOST_CONSENT_COMMANDS.voice, { kind })
}

/** Read-only diagnostics for QA/tests (never a consent bypass). */
export interface HostConsentStatus {
  readonly accepted: boolean
  readonly persisted: boolean
  readonly tosVersion: string
  readonly tosHash: string
  readonly ttsGranted: boolean
  readonly asrGranted: boolean
}

export async function hostConsentStatus(): Promise<HostConsentStatus | null> {
  return invokeHost<HostConsentStatus>(HOST_CONSENT_COMMANDS.status)
}
