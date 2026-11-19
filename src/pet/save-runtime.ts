/**
 * Pure save runtime for the pet archive (E10 / MB-012, E1 / MB-011).
 *
 * The pet page used to own this state machine inline in `src/pet/main.ts`
 * (`saveNowInternal` / `saveNow` / `loadNow` / `saveRecoveryNeeded` / the 30 s
 * autosave interval). This module is that extraction: envelope creation, the
 * primary/backup/recovery state machine, single-flight saves, the token-bucket
 * gate, migration persistence and autosave scheduling live here; everything
 * platform-specific is injected.
 *
 * Strict boundary (the module is pure):
 * - no DOM, no `localStorage`, no Tauri import, no network, no filesystem;
 * - every effect goes through the injected `SaveRuntimeHost` (encrypt/decrypt,
 *   read/write/remove/clearBackup) and the injected `SaveRuntimeTimers`;
 * - the live `PetState` is never cloned: the caller supplies `readState`, and a
 *   successful load is applied through `writeState`.
 *
 * The envelope and the legacy migration readers keep the exact shapes the page
 * wrote before the extraction:
 *   { format: 'dsh-save', version: 2, gameId: 'pet', gameVersion, savedAtMs, cipher }
 * plus the two legacy branches (direct `schema: 1` save and the old
 * `world` + optional `crc32` + optional `memoryEnc` envelope).
 *
 * Recovery invariants (preserved from the hardened inline implementation):
 * 1. A load only clears the recovery flag on entry; it sets it again when the
 *    primary exists but cannot be parsed, or when only the backup parsed.
 * 2. While the flag is set, autosave is paused and every explicit write uses
 *    host backup=false, so a corrupt primary can never overwrite the last
 *    known-good `.bak`.
 * 3. One explicit successful save (or a delete) clears the flag; the backup is
 *    only purged by `saveAndPurgeBackup` after that write succeeded.
 * 4. Encryption failure never writes plaintext or any partial save: the write
 *    is skipped and `onEncryptUnavailable` is reported once per runtime.
 * 5. A hung host call keeps the single-flight promise shared (no duplicate
 *    writes); a rejected/timed-out call releases it so a later save can retry.
 *
 * Wiring into `main.ts` is deliberately left to the follow-up task: the page
 * builds two `SaveRuntimeHost` adapters (Tauri `invokeTimed` commands and the
 * Web Storage fallback) and maps results back to its bubbles/boundaries.
 */

import { crc32 } from '../game/checksum.ts'
import { deserializePet, serializePet, type PetState } from '../kernel/pet.ts'
import { SECURITY_LIMITS, utf8ByteLength } from './security/limits.ts'

/** Envelope discriminator written by every save. */
export const SAVE_ENVELOPE_FORMAT = 'dsh-save'
/** Current pet-save envelope version. */
export const SAVE_ENVELOPE_VERSION = 2
/** Game id stored in the envelope; `pet` is the only producer today. */
export const SAVE_GAME_ID = 'pet'
/** Cadence of the background autosave timer in the pet window. */
export const SAVE_AUTOSAVE_INTERVAL_MS = 30_000

/** Why an explicit save/delete did not commit. */
export type SaveFailureReason =
  | 'consent-required'
  | 'rate-limited'
  | 'recovery-pending'
  | 'serialize-failed'
  | 'save-too-large'
  | 'encrypt-failed'
  | 'write-failed'
  | 'clear-backup-failed'
  | 'delete-failed'

/** Why a load returned no state. */
export type LoadFailureReason = 'consent-required' | 'not-found' | 'corrupt'

/** Background paths that report failures through `onAsyncFailure`. */
export type SaveAsyncScope = 'migration' | 'autosave' | 'clear-backup'

/** Reason a timer tick or a hidden-page hook asked for an autosave. */
export type AutosaveReason = 'interval' | 'visibility-hidden'

export interface SaveFailure {
  readonly ok: false
  readonly reason: SaveFailureReason
  /** Original host/serializer error, kept for `reportFailure` / logs. */
  readonly error?: unknown
  /** Only for `rate-limited`: bounded wait suggested by the token bucket. */
  readonly retryAfterMs?: number
  /** Only for `save-too-large`: plaintext size that was refused. */
  readonly bytes?: number
}

export interface SaveSuccess {
  readonly ok: true
  readonly slot: string
  /** Injected-clock timestamp written into the envelope. */
  readonly savedAtMs: number
  /** Envelope bytes persisted (not the plaintext length). */
  readonly bytes: number
  /**
   * Host backup flag used for this write. False means the write was not allowed
   * to rotate the previous primary into `.bak` (recovery is still pending).
   */
  readonly backup: boolean
}

export type SaveResult = SaveSuccess | SaveFailure

export type LoadSource = 'primary' | 'backup'

export interface LoadSuccess {
  readonly ok: true
  readonly state: PetState
  readonly source: LoadSource
  /** True for a legacy save that was read through the migration path. */
  readonly migrated: boolean
  /** Envelope timestamp when the slot carried a finite `savedAtMs`. */
  readonly savedAtMs?: number
  /** True when the state only parsed from the backup (or primary was corrupt). */
  readonly recoveryNeeded: boolean
}

export interface LoadFailure {
  readonly ok: false
  readonly reason: LoadFailureReason
  /** True when a readable slot existed but none parsed. */
  readonly sawReadableSave: boolean
  /** Current recovery flag (true after a corrupt readable save). */
  readonly recoveryNeeded: boolean
}

export type LoadResult = LoadSuccess | LoadFailure

export interface DeleteSuccess {
  readonly ok: true
  readonly slot: string
}

export type DeleteResult = DeleteSuccess | SaveFailure

/**
 * Platform boundary. The caller implements it twice:
 * - Tauri: `protect_text`/`unprotect_text` (DPAPI) + `read_save`/`write_save`/
 *   `delete_save`/`clear_save_backup` through the existing timed invoke wrapper;
 * - browser: WebCrypto memory encryption + `localStorage` primary/`.bak` keys.
 *
 * `read(slot, false)` reads the primary slot and `read(slot, true)` reads the
 * backup; a missing/unreadable slot must reject (the load loop then tries the
 * other one). `write(..., backup=false)` must NOT rotate/copy the previous
 * primary into the backup file. A command timeout must reject, not hang forever.
 */
export interface SaveRuntimeHost {
  /** Encrypt the plaintext save payload through the platform key store. */
  encrypt(plain: string): Promise<unknown>
  /** Decrypt a cipher produced by `encrypt`; null when unsupported/foreign. */
  decrypt(cipher: unknown): Promise<string | null>
  /** Read one slot; reject when missing/blocked/unreadable. */
  read(slot: string, backup: boolean): Promise<string>
  /** Persist one slot; `backup` grants the host permission to rotate `.bak`. */
  write(slot: string, text: string, backup: boolean): Promise<void>
  /** Remove the primary and the backup of one slot. */
  remove(slot: string): Promise<void>
  /** Remove only the backup of one slot (after a successful migration). */
  clearBackup(slot: string): Promise<void>
}

/** Injected timer boundary; tests advance these deterministically. */
export interface SaveRuntimeTimers {
  setInterval(handler: () => void, ms: number): unknown
  clearInterval(handle: unknown): void
}

/** Structural subset of `TokenBucket`; absence means unlimited. */
export interface SaveRateLimit {
  tryConsume(): { allowed: boolean; retryAfterMs?: number }
}

export interface SaveRuntimeOptions {
  /** Save slot name (the page uses `pet`). */
  readonly slot: string
  /** Game version stored in the envelope (`main.ts` uses `0.1.0`). */
  readonly gameVersion: string
  /** Override the envelope game id; defaults to `pet`. */
  readonly gameId?: string
  /** Platform boundary (crypto + slot storage). */
  readonly host: SaveRuntimeHost
  /** Live state getter (never cloned by the runtime). */
  readonly readState: () => PetState
  /** Applies a successfully loaded state. */
  readonly writeState: (state: PetState) => void
  /** Consent/TOS gate: no save/load/delete happens while it returns false. */
  readonly canInteract: () => boolean
  /** Injected wall clock for `savedAtMs`; defaults to `Date.now`. */
  readonly now?: () => number
  /** Injected timers for autosave; defaults to `globalThis`. */
  readonly timers?: SaveRuntimeTimers
  /** Optional save token bucket for manual-click spam protection. */
  readonly rateLimit?: SaveRateLimit
  /** Plaintext cap before encryption; defaults to `SECURITY_LIMITS.savePlainBytes`. */
  readonly maxPlainBytes?: number
  /** Default autosave cadence; defaults to `SAVE_AUTOSAVE_INTERVAL_MS`. */
  readonly autosaveIntervalMs?: number
  /** Report encryption being unavailable once per runtime (the page shows a bubble). */
  readonly onEncryptUnavailable?: (error: unknown) => void
  /** Notify a recovery-flag transition (bubble/UI hint). */
  readonly onRecoveryNeededChange?: (needed: boolean) => void
  /** Report fire-and-forget failures (migration, autosave, backup clear). */
  readonly onAsyncFailure?: (scope: SaveAsyncScope, failure: SaveFailure) => void
}

export interface SaveRuntime {
  readonly slot: string
  /** True while autosave is paused and writes must not rotate the backup. */
  readonly recoveryNeeded: boolean
  /** True while a save write is in flight. */
  readonly saving: boolean
  /** Explicit save entry (single-flight; rate-limited; commits recovery). */
  save(): Promise<SaveResult>
  /** Load the primary, then the backup; applies the parsed state. */
  load(): Promise<LoadResult>
  /** Remove primary+backup and resume autosave (MB-011). */
  deleteSave(): Promise<DeleteResult>
  /** Save, then purge the backup (migration/import commit path). */
  saveAndPurgeBackup(): Promise<SaveResult>
  /** One autosave attempt, gated by consent and the recovery flag. */
  autosaveTick(reason?: AutosaveReason): Promise<SaveResult>
  /** Start the injected interval timer (idempotent). */
  startAutosave(intervalMs?: number): void
  /** Stop the timer; no effect on an in-flight write. */
  stopAutosave(): void
  /** Await the in-flight save and any fire-and-forget migration write. */
  whenIdle(): Promise<void>
  /** Stop autosave (alias of `stopAutosave`). */
  dispose(): void
}

interface ParsedSave {
  readonly state: PetState
  readonly migrate: boolean
  readonly savedAtMs?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

function defaultTimers(): SaveRuntimeTimers {
  return {
    setInterval: (handler, ms) => globalThis.setInterval(handler, ms),
    clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
  }
}

function clampRetryAfter(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.ceil(value) : 0
}

/**
 * Create one save runtime for one slot. The runtime never touches the real
 * DOM/storage/IPC; inject a host/timers/clock and it is fully deterministic.
 */
export function createSaveRuntime(options: SaveRuntimeOptions): SaveRuntime {
  if (typeof options.slot !== 'string' || options.slot.trim() === '') {
    throw new Error('save-runtime: slot is required')
  }
  if (typeof options.gameVersion !== 'string' || options.gameVersion.trim() === '') {
    throw new Error('save-runtime: gameVersion is required')
  }
  const slot = options.slot
  const gameId = options.gameId ?? SAVE_GAME_ID
  const gameVersion = options.gameVersion
  const host = options.host
  const readState = options.readState
  const writeState = options.writeState
  const canInteract = options.canInteract
  const now = options.now ?? (() => Date.now())
  const timers = options.timers ?? defaultTimers()
  const rateLimit = options.rateLimit
  const maxPlainBytes = positiveInteger(options.maxPlainBytes, SECURITY_LIMITS.savePlainBytes)
  const defaultAutosaveMs = positiveInteger(options.autosaveIntervalMs, SAVE_AUTOSAVE_INTERVAL_MS)

  let recoveryNeeded = false
  let inFlight: Promise<SaveResult> | null = null
  let migrationSave: Promise<SaveResult> | null = null
  let autosaveHandle: unknown = null
  let autosaveMs = defaultAutosaveMs
  let encryptWarningShown = false

  const timestamp = (): number => {
    const value = now()
    return typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
  }

  const setRecoveryNeeded = (next: boolean): void => {
    if (recoveryNeeded === next) return
    recoveryNeeded = next
    // UI hooks are observers: a throwing bubble must never corrupt the flag.
    try {
      options.onRecoveryNeededChange?.(next)
    } catch {
      // The state transition already happened; keep persistence working.
    }
  }

  const notifyAsyncFailure = (scope: SaveAsyncScope, failure: SaveFailure): void => {
    try {
      options.onAsyncFailure?.(scope, failure)
    } catch {
      // Reporting must not escape into the autosave timer / migration promise.
    }
  }

  /**
   * Parse one raw slot text into a state. Returns null for malformed/foreign
   * saves; never throws. Order mirrors the pre-extraction `parsePetSave`:
   * direct legacy `schema: 1` save -> gameId check -> current cipher envelope
   * -> legacy world/crc32/memoryEnc envelope.
   */
  const parseSave = async (text: string): Promise<ParsedSave | null> => {
    try {
      const envelope = JSON.parse(text) as unknown
      if (!isRecord(envelope)) return null
      const savedAtMs =
        typeof envelope.savedAtMs === 'number' && Number.isFinite(envelope.savedAtMs)
          ? envelope.savedAtMs
          : undefined
      if (envelope.schema === 1 && typeof envelope.name === 'string') {
        return { state: deserializePet(text), migrate: true, savedAtMs }
      }
      if (envelope.gameId !== gameId) return null
      if (envelope.cipher !== undefined) {
        const plain = await host.decrypt(envelope.cipher)
        if (typeof plain !== 'string') return null
        return { state: deserializePet(plain), migrate: false, savedAtMs }
      }
      // Legacy envelope: world + optional memoryEnc (old pre-envelope save).
      const world = JSON.stringify(envelope.world)
      if (typeof world !== 'string') return null
      if (typeof envelope.crc32 === 'string' && envelope.crc32 !== crc32(world)) return null
      const state = deserializePet(world)
      if (envelope.memoryEnc !== undefined) {
        const plain = await host.decrypt(envelope.memoryEnc)
        if (typeof plain !== 'string') return null
        let snapshot: unknown
        try {
          snapshot = JSON.parse(plain)
        } catch {
          return null
        }
        // Rebuild through the validated deserializer, never spread the snapshot.
        state.memory = deserializePet(
          JSON.stringify({ schema: 1, memory: snapshot, createdAtMs: state.createdAtMs }),
        ).memory
      }
      return { state, migrate: true, savedAtMs }
    } catch {
      return null
    }
  }

  /** One save attempt: serialize -> cap -> encrypt -> envelope -> host write. */
  const writeSave = async (): Promise<SaveResult> => {
    if (!canInteract()) return { ok: false, reason: 'consent-required' }
    let plain: string
    try {
      plain = serializePet(readState())
    } catch (error) {
      return { ok: false, reason: 'serialize-failed', error }
    }
    const plainBytes = utf8ByteLength(plain)
    if (plainBytes > maxPlainBytes) {
      return { ok: false, reason: 'save-too-large', bytes: plainBytes }
    }
    let cipher: unknown
    try {
      cipher = await host.encrypt(plain)
    } catch (error) {
      // Never fall back to plaintext: report once and skip this write entirely.
      if (!encryptWarningShown) {
        encryptWarningShown = true
        try {
          options.onEncryptUnavailable?.(error)
        } catch {
          // The warning is best-effort; never retry the plaintext write.
        }
      }
      return { ok: false, reason: 'encrypt-failed', error }
    }
    const savedAtMs = timestamp()
    const text = JSON.stringify({
      format: SAVE_ENVELOPE_FORMAT,
      version: SAVE_ENVELOPE_VERSION,
      gameId,
      gameVersion,
      savedAtMs,
      cipher,
    })
    const backup = !recoveryNeeded
    try {
      await host.write(slot, text, backup)
    } catch (error) {
      // A failed write leaves recovery state untouched: the next attempt still
      // must not overwrite a known-good backup.
      return { ok: false, reason: 'write-failed', error }
    }
    setRecoveryNeeded(false)
    return { ok: true, slot, savedAtMs, bytes: utf8ByteLength(text), backup }
  }

  /**
   * Explicit save entry. Concurrent callers share one in-flight write (the old
   * 30 s autosave + manual click race); the save token bucket is consumed only
   * when a new write actually starts.
   */
  const save = (): Promise<SaveResult> => {
    const current = inFlight
    if (current) return current
    const decision = rateLimit?.tryConsume()
    if (decision && !decision.allowed) {
      return Promise.resolve<SaveResult>({
        ok: false,
        reason: 'rate-limited',
        retryAfterMs: clampRetryAfter(decision.retryAfterMs),
      })
    }
    const attempt = writeSave()
    inFlight = attempt
    void attempt.then(
      () => { if (inFlight === attempt) inFlight = null },
      () => { if (inFlight === attempt) inFlight = null },
    )
    return attempt
  }

  /**
   * Save then purge the backup. Used by legacy migration and portable import.
   * A backup-clear failure never fails the save itself (same as the page): it is
   * reported through `onAsyncFailure('clear-backup', ...)` for `reportFailure`.
   */
  const saveAndPurgeBackup = async (): Promise<SaveResult> => {
    const result = await save()
    if (!result.ok) return result
    try {
      await host.clearBackup(slot)
    } catch (error) {
      notifyAsyncFailure('clear-backup', { ok: false, reason: 'clear-backup-failed', error })
    }
    return result
  }

  /**
   * Fire-and-forget migration commit: boot must not block on the rewrite, but
   * failures still go to the page boundary and `whenIdle` can await the write.
   */
  const scheduleMigrationSave = (): void => {
    const attempt = saveAndPurgeBackup()
    migrationSave = attempt
    void attempt.then(
      (result) => {
        if (!result.ok) notifyAsyncFailure('migration', result)
        if (migrationSave === attempt) migrationSave = null
      },
      () => { if (migrationSave === attempt) migrationSave = null },
    ).catch(() => {
      // Defensive: a throwing observer must not become an unhandled rejection.
    })
  }

  const load = async (): Promise<LoadResult> => {
    if (!canInteract()) {
      return { ok: false, reason: 'consent-required', sawReadableSave: false, recoveryNeeded }
    }
    setRecoveryNeeded(false)
    let sawReadableSave = false
    for (const backup of [false, true] as const) {
      let text: string
      try {
        text = await host.read(slot, backup)
      } catch {
        // Missing/locked slot: expected, try the backup next.
        continue
      }
      sawReadableSave = true
      const parsed = await parseSave(text)
      if (!parsed) continue
      writeState(parsed.state)
      setRecoveryNeeded(backup)
      if (parsed.migrate && !recoveryNeeded) scheduleMigrationSave()
      return {
        ok: true,
        state: parsed.state,
        source: backup ? 'backup' : 'primary',
        migrated: parsed.migrate,
        savedAtMs: parsed.savedAtMs,
        recoveryNeeded,
      }
    }
    setRecoveryNeeded(sawReadableSave)
    return {
      ok: false,
      reason: sawReadableSave ? 'corrupt' : 'not-found',
      sawReadableSave,
      recoveryNeeded,
    }
  }

  const deleteSave = async (): Promise<DeleteResult> => {
    if (!canInteract()) return { ok: false, reason: 'consent-required' }
    try {
      await host.remove(slot)
    } catch (error) {
      return { ok: false, reason: 'delete-failed', error }
    }
    // MB-011: once corrupt primary+backup are gone, autosave may resume.
    setRecoveryNeeded(false)
    return { ok: true, slot }
  }

  const autosaveTick = async (reason: AutosaveReason = 'interval'): Promise<SaveResult> => {
    void reason
    if (!canInteract()) return { ok: false, reason: 'consent-required' }
    if (recoveryNeeded) return { ok: false, reason: 'recovery-pending' }
    return save()
  }

  const runAutosave = async (reason: AutosaveReason): Promise<void> => {
    const result = await autosaveTick(reason)
    if (result.ok) return
    // Silence expected skips and rate-limit noise, like the pre-extraction page.
    if (result.reason === 'rate-limited' || result.reason === 'consent-required') return
    if (result.reason === 'recovery-pending') return
    notifyAsyncFailure('autosave', result)
  }

  const stopAutosave = (): void => {
    if (autosaveHandle === null) return
    timers.clearInterval(autosaveHandle)
    autosaveHandle = null
  }

  const startAutosave = (intervalMs?: number): void => {
    if (autosaveHandle !== null) return
    const ms = positiveInteger(intervalMs, autosaveMs)
    if (!(ms > 0)) return
    autosaveMs = ms
    autosaveHandle = timers.setInterval(() => { void runAutosave('interval') }, ms)
  }

  const whenIdle = async (): Promise<void> => {
    for (let guard = 0; guard < 100; guard += 1) {
      const pending: Promise<unknown>[] = []
      if (inFlight) pending.push(inFlight)
      if (migrationSave) pending.push(migrationSave)
      if (pending.length === 0) return
      await Promise.allSettled(pending)
    }
  }

  return {
    slot,
    get recoveryNeeded() { return recoveryNeeded },
    get saving() { return inFlight !== null },
    save,
    load,
    deleteSave,
    saveAndPurgeBackup,
    autosaveTick,
    startAutosave,
    stopAutosave,
    whenIdle,
    dispose: stopAutosave,
  }
}
