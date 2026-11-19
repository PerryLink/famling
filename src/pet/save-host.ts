/**
 * Platform adapters + legacy-compatible facade for the pure pet save runtime
 * (E10 / MB-012, E1 / MB-011, wiring task-94).
 *
 * `save-runtime.ts` owns the save state machine and imports nothing platform
 * specific. This module is the other half of the extraction:
 *
 * - `createTauriSaveHost` maps the runtime host to the shipped Tauri commands
 *   (`protect_text`/`unprotect_text` DPAPI, `read_save`/`write_save`/
 *   `delete_save`/`clear_save_backup`) through main.ts's bounded `invokeTimed`,
 *   so a hung WebView/Rust call rejects instead of freezing boot/save;
 * - `createBrowserSaveHost` keeps the exact Web Storage layout the page wrote
 *   before the extraction (`desktop-games/pet/<slot>` + `.bak`, WebCrypto
 *   ciphertext only) and never rotates the backup while recovery is pending;
 * - `createPetSaveService` binds the runtime to the page: it selects the
 *   platform host, injects the live-state/consent/rate-limit closures and maps
 *   `SaveFailure` results back to the errors the pre-extraction page threw
 *   (`RateLimitError`, `save-too-large (NB)`, `save-storage-quota`, the original
 *   crypto/IPC error, `consent-required`). UI copy and bubbles stay in main.ts.
 *
 * Known host quirk (frozen here, not changed by this task): the Rust
 * `read_save` command falls back to `<slot>.json.bak` when the primary file is
 * missing even with `backup=false`. The pre-extraction page treated those bytes
 * as a primary load, so the adapter preserves that behavior; making
 * `backup=false` strictly primary-only needs a Rust change tracked separately.
 */
import type { PetState } from '../kernel/pet.ts'
import { decryptMemory, encryptMemory, type WebCryptoPayload } from './crypto.ts'
import { RateLimitError } from './security/rate-limit.ts'
import { removeKey, safeGetItem, safeSetItem, type StorageLike } from './security/safe-storage.ts'
import {
  createSaveRuntime,
  type AutosaveReason,
  type SaveAsyncScope,
  type SaveFailure,
  type SaveFailureReason,
  type SaveRateLimit,
  type SaveResult,
  type SaveRuntimeHost,
  type SaveRuntimeTimers,
} from './save-runtime.ts'

/** DPAPI cipher wrapper written by the Tauri adapter. */
export interface DpapiCipher {
  readonly v: 1
  readonly p: 'dpapi'
  readonly data: string
}

/** Every cipher shape the pet page can read (legacy saves may store it bare). */
export type SaveCipher = DpapiCipher | WebCryptoPayload

/** Bounded Tauri IPC call supplied by main.ts (`invokeTimed`). */
export interface SaveHostInvoker {
  <T>(command: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<T>
}

/**
 * Web Storage keys written by the pre-extraction page. Exported so data
 * controls/tests can keep pointing at the same two keys (main.ts used
 * `desktop-games/pet/pet` + `.bak`).
 */
export function browserSaveKeys(slot: string): { primary: string; backup: string } {
  const primary = `desktop-games/pet/${slot}`
  return { primary, backup: `${primary}.bak` }
}

/** Injectable seams for the browser host (defaults are the real globals). */
export interface BrowserSaveHostOptions {
  /** Storage seam; default resolves the global `localStorage` safely. */
  readonly storage?: StorageLike | null
  /** Crypto seam; default is the WebCrypto memory vault. */
  readonly encrypt?: (plain: string) => Promise<unknown>
  /** Decrypt seam; `null` means unsupported/foreign cipher (never plaintext). */
  readonly decrypt?: (cipher: unknown) => Promise<string | null>
}

/**
 * Browser adapter: WebCrypto ciphertext + `localStorage` primary/.bak slots.
 *
 * `write(..., backup=true)` first copies the previous primary into `.bak`
 * (best effort, exactly like the old page) and then writes the new primary;
 * `backup=false` never touches the known-good `.bak`. A failed storage write
 * throws `save-storage-<status>` so the service maps it to the old error text.
 */
export function createBrowserSaveHost(options: BrowserSaveHostOptions = {}): SaveRuntimeHost {
  const storage = options.storage
  const encrypt = options.encrypt ?? ((plain: string): Promise<unknown> => encryptMemory(plain))
  const decrypt = options.decrypt ?? decryptBrowserCipher
  return {
    encrypt,
    decrypt,
    async read(slot, backup) {
      const keys = browserSaveKeys(slot)
      const text = safeGetItem(backup ? keys.backup : keys.primary, storage)
      // The runtime contract is reject-on-missing so it can try the other slot.
      if (text === null || text === '') throw new Error('save-not-found')
      return text
    },
    async write(slot, text, backup) {
      const keys = browserSaveKeys(slot)
      if (backup) {
        const previous = safeGetItem(keys.primary, storage)
        // Rotation is best effort: the status is ignored exactly like the old
        // page; the primary write below decides whether the save succeeded.
        if (previous) safeSetItem(keys.backup, previous, storage)
      }
      const stored = safeSetItem(keys.primary, text, storage)
      if (stored !== 'ok') throw new Error(`save-storage-${stored}`)
    },
    async remove(slot) {
      const keys = browserSaveKeys(slot)
      removeKey(keys.primary, storage)
      removeKey(keys.backup, storage)
    },
    async clearBackup(slot) {
      // Clearing the backup never fails the save (same as the old page).
      removeKey(browserSaveKeys(slot).backup, storage)
    },
  }
}

/** Decode a browser cipher; anything not produced by the WebCrypto vault is foreign. */
async function decryptBrowserCipher(cipher: unknown): Promise<string | null> {
  if (!cipher || typeof cipher !== 'object') return null
  const payload = cipher as Partial<WebCryptoPayload>
  if (payload.p !== 'webcrypto') return null
  return decryptMemory(payload as WebCryptoPayload)
}

export interface TauriSaveHostOptions {
  /** `invokeTimed` from main.ts: rejects with `ipc-timeout:<command>`. */
  readonly invokeTimed: SaveHostInvoker
}

/**
 * Tauri adapter: DPAPI (`protect_text`/`unprotect_text`) + the shipped save
 * commands. Every call goes through the caller's bounded invoke wrapper, so a
 * hung command rejects instead of leaving a save single-flight promise stuck.
 */
export function createTauriSaveHost(options: TauriSaveHostOptions): SaveRuntimeHost {
  const { invokeTimed } = options
  return {
    async encrypt(plain) {
      const data = await invokeTimed<string>('protect_text', { text: plain })
      return { v: 1, p: 'dpapi', data } satisfies DpapiCipher
    },
    async decrypt(cipher) {
      // Legacy Tauri saves stored the DPAPI base64 string without the wrapper.
      if (typeof cipher === 'string') {
        return invokeTimed<string>('unprotect_text', { encoded: cipher })
      }
      if (!cipher || typeof cipher !== 'object') return null
      const payload = cipher as Partial<SaveCipher>
      if (payload.p !== 'dpapi' || typeof payload.data !== 'string') return null
      return invokeTimed<string>('unprotect_text', { encoded: payload.data })
    },
    read(slot, backup) {
      // Rust `read_save` falls back to `.bak` when the primary file is absent
      // even for backup=false; that historical behavior is preserved (see the
      // module header) and pinned by tests/save-host.test.ts.
      return invokeTimed<string>('read_save', { slot, backup })
    },
    async write(slot, text, backup) {
      await invokeTimed('write_save', { slot, text, backup })
    },
    async remove(slot) {
      await invokeTimed('delete_save', { slot })
    },
    async clearBackup(slot) {
      await invokeTimed('clear_save_backup', { slot })
    },
  }
}

export interface PetSaveHostOptions {
  readonly hasTauri: boolean
  readonly invokeTimed: SaveHostInvoker
  readonly browser?: BrowserSaveHostOptions
}

/** Pick the platform host the page runs on (same `HAS_TAURI` probe as before). */
export function createPetSaveHost(options: PetSaveHostOptions): SaveRuntimeHost {
  return options.hasTauri
    ? createTauriSaveHost({ invokeTimed: options.invokeTimed })
    : createBrowserSaveHost(options.browser)
}

/**
 * Map a runtime failure back to the error the pre-extraction page threw, so
 * `toUserMessage`/`reportFailure`/`instanceof RateLimitError` keep their old
 * meaning at every call site.
 */
export function saveFailureToError(failure: SaveFailure): Error {
  if (failure.reason === 'rate-limited') {
    return new RateLimitError('save', failure.retryAfterMs ?? 0)
  }
  if (failure.reason === 'save-too-large') {
    // Legacy message shape: main.ts used to throw `save-too-large (123B)`.
    return new Error(`save-too-large (${failure.bytes ?? 0}B)`)
  }
  if (failure.error instanceof Error) return failure.error
  if (failure.error !== undefined) return new Error(String(failure.error))
  return new Error(failure.reason)
}

/**
 * Background autosave/migration failures are only reported when they are not
 * expected control flow (pre-consent launches, token-bucket throttling and the
 * paused-while-recovering state are silent, exactly like the old page).
 */
export function shouldReportSaveFailure(reason: SaveFailureReason): boolean {
  return reason !== 'consent-required' && reason !== 'rate-limited' && reason !== 'recovery-pending'
}

export interface PetSaveServiceOptions {
  /** Save slot name (`pet`). */
  readonly slot: string
  /** Game version stored in the envelope (`0.1.0`). */
  readonly gameVersion: string
  /** True on the Tauri host; false selects the browser adapter. */
  readonly hasTauri: boolean
  /** main.ts's bounded IPC wrapper. */
  readonly invokeTimed: SaveHostInvoker
  /** Live state getter (never cloned by the runtime). */
  readonly readState: () => PetState
  /** Applies a successfully loaded state. */
  readonly writeState: (state: PetState) => void
  /** Consent/TOS gate: no save/load/delete happens while it returns false. */
  readonly canInteract: () => boolean
  /** Save token bucket (`limits.save`). */
  readonly rateLimit?: SaveRateLimit
  /** Injected clock/timers (tests); production defaults are Date.now/globalThis. */
  readonly now?: () => number
  readonly timers?: SaveRuntimeTimers
  readonly autosaveIntervalMs?: number
  /** Plaintext byte cap before encryption (runtime default: SECURITY_LIMITS.savePlainBytes). */
  readonly maxPlainBytes?: number
  /** Browser-host seams (storage/crypto) for tests; production uses defaults. */
  readonly browser?: BrowserSaveHostOptions
  readonly onEncryptUnavailable?: (error: unknown) => void
  readonly onRecoveryNeededChange?: (needed: boolean) => void
  readonly onAsyncFailure?: (scope: SaveAsyncScope, failure: SaveFailure) => void
}

/**
 * Page-facing facade: the runtime's result objects plus the old throwing
 * contract (`save()`/`deleteSave()`/`saveAndPurgeBackup()` reject on failure,
 * `load()` rejects only for consent and resolves false for missing/corrupt).
 * Callers keep their historical `try/catch` + `toUserMessage` flows; the
 * richer `SaveResult` is available through `autosaveTick` and the async hooks.
 */
export interface PetSaveService {
  readonly slot: string
  /** True while autosave is paused and writes must not rotate the backup. */
  readonly recoveryNeeded: boolean
  save(): Promise<void>
  load(): Promise<boolean>
  deleteSave(): Promise<void>
  saveAndPurgeBackup(): Promise<void>
  autosaveTick(reason?: AutosaveReason): Promise<SaveResult>
  startAutosave(intervalMs?: number): void
  stopAutosave(): void
  whenIdle(): Promise<void>
  dispose(): void
}

/**
 * Build one save service for the page: platform host + pure runtime + the
 * legacy error contract. A single instance owns the recovery flag and autosave
 * timer; recreate it after an out-of-band local-data wipe (see main.ts).
 */
export function createPetSaveService(options: PetSaveServiceOptions): PetSaveService {
  const runtime = createSaveRuntime({
    slot: options.slot,
    gameVersion: options.gameVersion,
    host: createPetSaveHost({
      hasTauri: options.hasTauri,
      invokeTimed: options.invokeTimed,
      browser: options.browser,
    }),
    readState: options.readState,
    writeState: options.writeState,
    canInteract: options.canInteract,
    rateLimit: options.rateLimit,
    now: options.now,
    timers: options.timers,
    autosaveIntervalMs: options.autosaveIntervalMs,
    maxPlainBytes: options.maxPlainBytes,
    onEncryptUnavailable: options.onEncryptUnavailable,
    onRecoveryNeededChange: options.onRecoveryNeededChange,
    onAsyncFailure: options.onAsyncFailure,
  })
  const throwFailure = (failure: SaveFailure): never => {
    throw saveFailureToError(failure)
  }
  return {
    slot: options.slot,
    get recoveryNeeded() {
      return runtime.recoveryNeeded
    },
    async save() {
      const result = await runtime.save()
      if (!result.ok) throwFailure(result)
    },
    async load() {
      const result = await runtime.load()
      if (result.ok) return true
      // The old loadNow() threw before consent and resolved false otherwise.
      if (result.reason === 'consent-required') throw new Error('consent-required')
      return false
    },
    async deleteSave() {
      const result = await runtime.deleteSave()
      if (!result.ok) throwFailure(result)
    },
    async saveAndPurgeBackup() {
      const result = await runtime.saveAndPurgeBackup()
      if (!result.ok) throwFailure(result)
    },
    autosaveTick: (reason) => runtime.autosaveTick(reason),
    startAutosave: (intervalMs) => runtime.startAutosave(intervalMs),
    stopAutosave: () => runtime.stopAutosave(),
    whenIdle: () => runtime.whenIdle(),
    dispose: () => runtime.dispose(),
  }
}
