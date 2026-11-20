/**
 * Unified famling local-state schema (E1 / MB-014): one registry of every
 * localStorage key the pet page owns, a state-schema version marker, the two
 * real legacy-format migrations, and a single clear-scope API.
 *
 * Scope
 * - Web Storage keys under `desktop-games/pet/` and `desktop-games/consent/`
 *   written by the famling pet page (src/pet/**). The `dsh-famling` plugin
 *   keeps its own `dsh-famling/*` keys and is deliberately NOT in this scope.
 * - Browser Web Storage only. Tauri/DPAPI save files, the TTS cache and the
 *   TTS quota file live outside Web Storage and stay owned by save-host.ts /
 *   consent/data-controls.ts; the save slots are registered here so the clear
 *   scope is complete, but no migration ever rewrites them.
 *
 * Contract (locked by tests/state-migrations.test.ts)
 * - Nothing here throws: missing/blocked/quota storage becomes a status value.
 * - Callers decide when to run it. main.ts calls the migration only after the
 *   TOS gate resolves accepted, so nothing is written before consent.
 * - A NEWER state marker is never overwritten (forward compatibility), and
 *   corrupt values are left byte-identical instead of being rewritten behind
 *   the owner module's back.
 * - Exactly two legacy formats are migrated, and both produce the same
 *   effective values as the owner module's lazy read migration, so the UI
 *   cannot change:
 *   1. the legacy `pet/scale` + `pet/text-scale` pair -> `pet/scale/model` +
 *      global/image/ui-text (scaling.ts semantics). The legacy keys stay in
 *      place as inert backups, exactly like scaling.ts decided;
 *   2. a legacy raw-JSON chat digest -> the `{ v: 1, data }` envelope
 *      (chat-import/store.ts semantics). The validated digest is identical
 *      before and after the write.
 * - The clear API removes every in-scope key (registry + dynamic prefixes +
 *   enumerated keys), verifies every removal, and reports residual/unknown
 *   instead of claiming success.
 *
 * Key-string parity: this module is the single registry, while the modules
 * that own each value keep their exported constants. The test suite asserts
 * every constant equals its registry entry, so a rename cannot drift silently.
 */

import { CHAT_DIGEST_KEY, CHAT_DIGEST_VERSION, validateDigest } from './chat-import/store.ts'
import {
  LEGACY_PET_SCALE_KEY,
  LEGACY_TEXT_SCALE_KEY,
  SCALE_MODEL_KEY,
  loadScaleSettings,
  persistScaleSettings,
} from './scaling.ts'
import { SECURITY_LIMITS } from './security/limits.ts'
import {
  readVersioned,
  resolveStorage,
  safeGetItem,
  safeSetItem,
  writeVersioned,
  type StorageLike,
} from './security/safe-storage.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Storage namespace prefixes owned by the famling pet page (single source). */
export const FAMLING_STORAGE_PREFIXES = Object.freeze([
  'desktop-games/pet/',
  'desktop-games/consent/',
] as const)

/**
 * State-schema marker. The value is the integer schema version of the whole
 * famling local state; `migrateFamlingLocalState()` writes it only after every
 * needed migration step succeeded. It is not a per-key format version (those
 * live in each `FamlingStorageKeySpec.version`).
 */
export const FAMLING_STATE_SCHEMA_KEY = 'desktop-games/pet/state/schema'

/** Current schema version of the whole local state (bump when adding a step). */
export const FAMLING_STATE_SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Key registry
// ---------------------------------------------------------------------------

export type FamlingStorageOwner =
  | 'state'
  | 'save'
  | 'preferences'
  | 'window'
  | 'hero'
  | 'audio'
  | 'health'
  | 'content'
  | 'chat-import'
  | 'market'
  | 'consent'

export type FamlingStorageEncoding =
  /** Raw `'1'` / `'0'` flag. */
  | 'flag'
  /** Raw integer string. */
  | 'integer'
  /** Raw decimal string. */
  | 'decimal'
  /** Raw short enum id string. */
  | 'identifier'
  /** Free-form string (nonce/salt/probe). */
  | 'string'
  /** Raw JSON object/array without a shared version envelope. */
  | 'json'
  /** `{ v: <version>, data: ... }` safe-storage envelope. */
  | 'versioned'
  /** Module-specific versioned envelope (market serial/cache, consent records). */
  | 'custom'
  /** Opaque encrypted save payload (WebCrypto/DPAPI); never rewritten here. */
  | 'opaque'

export interface FamlingStorageKeySpec {
  /** Exact storage key, or a dynamic key-family prefix ending with `/`. */
  readonly key: string
  /** True when `key` is a dynamic family prefix (`key` ends with `/`). */
  readonly prefix?: true
  readonly owner: FamlingStorageOwner
  readonly encoding: FamlingStorageEncoding
  /** Format version the owning reader enforces (0 = stable unversioned raw value). */
  readonly version: number
  /** Migration step that normalizes an older format of this key, if any. */
  readonly migration?: string
  /** Short, path-free note for reviewers (no user data). */
  readonly note?: string
}

/**
 * Every localStorage key the famling pet page can persist. This is the single
 * registry used by the migration runner, the clear API and the drift tests; it
 * intentionally includes the two legacy scale keys and the save slots so the
 * clear scope is complete.
 */
export const FAMLING_STORAGE_KEYS: readonly FamlingStorageKeySpec[] = Object.freeze([
  // -- state schema marker (this module) ----------------------------------
  Object.freeze({
    key: FAMLING_STATE_SCHEMA_KEY,
    owner: 'state',
    encoding: 'integer',
    version: FAMLING_STATE_SCHEMA_VERSION,
    note: 'Written after a successful migration run; a newer value is never overwritten.',
  }),
  // -- encrypted save slots (save-host.ts; Tauri DPAPI or WebCrypto) ------
  Object.freeze({
    key: 'desktop-games/pet/pet',
    owner: 'save',
    encoding: 'opaque',
    version: 1,
    note: 'Encrypted pet save slot; payload schema is owned by save-runtime.ts.',
  }),
  Object.freeze({
    key: 'desktop-games/pet/pet.bak',
    owner: 'save',
    encoding: 'opaque',
    version: 1,
    note: 'Known-good backup of the encrypted save slot.',
  }),
  // -- plain preferences (main.ts / desktop-shell.ts) ---------------------
  Object.freeze({ key: 'desktop-games/pet/volume', owner: 'audio', encoding: 'integer', version: 0, note: '0-100 master volume (readClampedInt).' }),
  Object.freeze({ key: 'desktop-games/pet/window', owner: 'window', encoding: 'json', version: 0, note: 'Saved pet window position { x, y }.' }),
  Object.freeze({ key: 'desktop-games/pet/advisers-mode', owner: 'preferences', encoding: 'flag', version: 0, note: 'Advisers face opt-in flag (main.ts).' }),
  Object.freeze({ key: 'desktop-games/pet/setup-ack-v1', owner: 'preferences', encoding: 'flag', version: 1, note: 'Setup-page notice acknowledged.' }),
  Object.freeze({ key: 'desktop-games/pet/show-menu-button', owner: 'preferences', encoding: 'flag', version: 0 }),
  Object.freeze({ key: 'desktop-games/pet/coach/menu', owner: 'preferences', encoding: 'flag', version: 0 }),
  Object.freeze({ key: 'desktop-games/pet/reduce-motion', owner: 'preferences', encoding: 'flag', version: 0 }),
  Object.freeze({ key: 'desktop-games/pet/quiet-hours', owner: 'health', encoding: 'json', version: 0, note: 'Quiet-hours window { enabled, start, end }.' }),
  Object.freeze({ key: 'desktop-games/pet/ambient-cadence', owner: 'preferences', encoding: 'identifier', version: 0, note: 'Idle-rhythm level lively|normal|quiet (low-disturb.ts, C1 2026-11-21; applied to the live hero scene).' }),
  Object.freeze({ key: 'desktop-games/pet/work-session', owner: 'window', encoding: 'json', version: 0, note: 'Session-scoped 一起工作 focus session { minutes, startedAtMs, endsAtMs } in sessionStorage only (survives a page reload, not an app restart); no history is ever recorded.' }),
  Object.freeze({ key: 'desktop-games/pet/health-reminder', owner: 'health', encoding: 'json', version: 0, note: 'Cross-window 2h health-reminder state.' }),
  // -- hero renderer ------------------------------------------------------
  Object.freeze({ key: 'desktop-games/pet/hero', owner: 'hero', encoding: 'flag', version: 0, note: 'Hero renderer opt-in flag.' }),
  Object.freeze({ key: 'desktop-games/pet/heroCharacter', owner: 'hero', encoding: 'identifier', version: 0, note: 'Persisted hero character id (validated by hero-runtime).' }),
  // -- four-level scaling model (scaling.ts) ------------------------------
  Object.freeze({ key: 'desktop-games/pet/scale/model', owner: 'preferences', encoding: 'integer', version: 2, note: 'Scale model version marker (SCALE_MODEL_VERSION).' }),
  Object.freeze({ key: 'desktop-games/pet/scale/global', owner: 'preferences', encoding: 'decimal', version: 0 }),
  Object.freeze({ key: 'desktop-games/pet/scale/ui-text', owner: 'preferences', encoding: 'decimal', version: 0 }),
  Object.freeze({ key: 'desktop-games/pet/scale/image', owner: 'preferences', encoding: 'decimal', version: 0 }),
  Object.freeze({ key: 'desktop-games/pet/scale/component/', prefix: true, owner: 'preferences', encoding: 'decimal', version: 0, note: 'Per-component scale override multipliers.' }),
  // -- legacy two-axis scaling keys (read-migrated by scaling.ts) ---------
  Object.freeze({
    key: 'desktop-games/pet/scale',
    owner: 'preferences',
    encoding: 'decimal',
    version: 0,
    migration: 'scale-legacy-pair-v1',
    note: 'LEGACY pet scale 1x-4x; kept as an inert backup after migration.',
  }),
  Object.freeze({
    key: 'desktop-games/pet/text-scale',
    owner: 'preferences',
    encoding: 'decimal',
    version: 0,
    migration: 'scale-legacy-pair-v1',
    note: 'LEGACY text scale 0.8x-2x; kept as an inert backup after migration.',
  }),
  // -- voice / audio preference -------------------------------------------
  Object.freeze({ key: 'desktop-games/pet/voice', owner: 'audio', encoding: 'identifier', version: 0, note: "TTS voice id 'stella' | 'tide'." }),
  // -- content center (content-library.ts / content-hub/packs.ts) ---------
  Object.freeze({ key: 'desktop-games/pet/content/character', owner: 'content', encoding: 'versioned', version: 1, note: 'Six component selections, safe-storage envelope v1.' }),
  Object.freeze({ key: 'desktop-games/pet/content/voice', owner: 'content', encoding: 'versioned', version: 1 }),
  Object.freeze({ key: 'desktop-games/pet/content/dialogue-pack', owner: 'content', encoding: 'versioned', version: 1 }),
  Object.freeze({ key: 'desktop-games/pet/content/theme', owner: 'content', encoding: 'versioned', version: 1 }),
  Object.freeze({ key: 'desktop-games/pet/content/background', owner: 'content', encoding: 'versioned', version: 1 }),
  Object.freeze({ key: 'desktop-games/pet/content/font', owner: 'content', encoding: 'versioned', version: 1 }),
  Object.freeze({ key: 'desktop-games/pet/content/role-theme', owner: 'content', encoding: 'versioned', version: 1, note: 'Last applied character-theme id.' }),
  Object.freeze({ key: 'desktop-games/pet/content/installed-packs', owner: 'content', encoding: 'versioned', version: 1, note: 'Validated local v1 content packs envelope.' }),
  Object.freeze({ key: 'desktop-games/pet/content/theme-packs', owner: 'content', encoding: 'versioned', version: 1, note: 'Validated local v2 role-theme pack manifests.' }),
  Object.freeze({ key: 'desktop-games/pet/character-packs/active', owner: 'content', encoding: 'versioned', version: 1, note: 'Persisted active character-pack appearance (pack id/version) envelope v1; restored by the hero hot-swap host after boot.' }),
  // -- content window deep link -------------------------------------------
  Object.freeze({ key: 'desktop-games/pet/content-window-focus', owner: 'window', encoding: 'identifier', version: 0, note: 'One-shot focus target for the content window; read-and-cleared by its owner.' }),
  // -- chat import (chat-import/store.ts + main.ts) -----------------------
  Object.freeze({
    key: 'desktop-games/pet/chat-import/v1',
    owner: 'chat-import',
    encoding: 'versioned',
    version: 1,
    migration: 'chat-digest-envelope-v1',
    note: 'Chat digest; legacy raw JSON values are re-written in the v1 envelope once.',
  }),
  Object.freeze({ key: 'desktop-games/pet/chat-import-ack/', prefix: true, owner: 'chat-import', encoding: 'flag', version: 0, note: 'Per-import "already shown" acknowledgements.' }),
  // -- remote market cache (content-market.ts; fail-closed) ---------------
  Object.freeze({ key: 'desktop-games/pet/content/market/catalog-serial', owner: 'market', encoding: 'custom', version: 2, note: 'Anti-rollback serial envelope v2; an unknown/older shape is reported, never migrated.' }),
  Object.freeze({ key: 'desktop-games/pet/content/market/catalog-cache', owner: 'market', encoding: 'custom', version: 1, note: 'Bounded last-verified catalog cache envelope v1.' }),
  Object.freeze({ key: 'desktop-games/pet/content/market/installed', owner: 'market', encoding: 'versioned', version: 1, note: 'Installed remote pack versions + user version locks envelope v1; unknown/corrupt shapes start empty with a visible warning, newer envelopes stay read-only.' }),
  // -- consent records (consent/*.ts) -------------------------------------
  Object.freeze({ key: 'desktop-games/consent/tos-acceptance-v1', owner: 'consent', encoding: 'custom', version: 1, note: 'TOS acceptance record (format + schema + TOS version/hash).' }),
  Object.freeze({ key: 'desktop-games/consent/audit-v1', owner: 'consent', encoding: 'custom', version: 1, note: 'Minimized consent audit entries.' }),
  Object.freeze({ key: 'desktop-games/consent/age-verification-v1', owner: 'consent', encoding: 'custom', version: 1, note: 'Self-reported age-verification record.' }),
  Object.freeze({ key: 'desktop-games/consent/safety-audit-v1', owner: 'consent', encoding: 'custom', version: 1, note: 'Minimized safety-review ledger (no original text).' }),
  Object.freeze({ key: 'desktop-games/consent/safety-audit-salt-v1', owner: 'consent', encoding: 'string', version: 1, note: 'Per-install hash salt for the safety ledger.' }),
  Object.freeze({ key: 'desktop-games/consent/storage-probe-v1', owner: 'consent', encoding: 'string', version: 1, note: 'Writable-storage probe used by the consent store.' }),
])

// ---------------------------------------------------------------------------
// Legacy mapping
// ---------------------------------------------------------------------------

export interface FamlingLegacyKeyMapping {
  /** Legacy key that is no longer written by this build. */
  readonly legacyKey: string
  /** Canonical key(s) the migration derives from the legacy value. */
  readonly canonicalKeys: readonly string[]
  readonly migrationId: string
  /** True = the legacy key is retained as an inert backup (never deleted by a migration). */
  readonly retained: boolean
}

/** Kind-to-kind legacy key mappings. These are the only renamed/repurposed keys. */
export const FAMLING_LEGACY_KEYS: readonly FamlingLegacyKeyMapping[] = Object.freeze([
  Object.freeze({
    legacyKey: 'desktop-games/pet/scale',
    canonicalKeys: Object.freeze(['desktop-games/pet/scale/model', 'desktop-games/pet/scale/global', 'desktop-games/pet/scale/image']),
    migrationId: 'scale-legacy-pair-v1',
    retained: true,
  }),
  Object.freeze({
    legacyKey: 'desktop-games/pet/text-scale',
    canonicalKeys: Object.freeze(['desktop-games/pet/scale/ui-text']),
    migrationId: 'scale-legacy-pair-v1',
    retained: true,
  }),
])

export interface FamlingLegacyValueFormat {
  /** Canonical key whose OLD value format is migrated in place. */
  readonly key: string
  readonly migrationId: string
  readonly note: string
}

/** Value-format (not key-rename) legacy migrations. */
export const FAMLING_LEGACY_VALUE_FORMATS: readonly FamlingLegacyValueFormat[] = Object.freeze([
  Object.freeze({
    key: 'desktop-games/pet/chat-import/v1',
    migrationId: 'chat-digest-envelope-v1',
    note: 'The pre-envelope store wrote the digest as raw JSON (no { v, data } wrapper).',
  }),
])

export interface FamlingDeferredLegacyMigration {
  readonly id: string
  /** Module that owns the read-time migration (this runner must not duplicate it). */
  readonly owner: string
  /** Keys or key areas the owner normalizes. */
  readonly areas: readonly string[]
  readonly note: string
}

/**
 * Legacy mappings that are deliberately NOT run by this module because they
 * need the content library, the encrypted save payload or a fail-closed
 * decision. They are inventoried here so the whole migration map stays in one
 * place; the runner only owns the two storage-format migrations above.
 */
export const FAMLING_DEFERRED_LEGACY_MIGRATIONS: readonly FamlingDeferredLegacyMigration[] = Object.freeze([
  Object.freeze({
    id: 'content-six-key-to-role-theme',
    owner: 'content-runtime.ts -> content-hub/roles.ts (planStartupRoleTheme)',
    areas: Object.freeze([
      'desktop-games/pet/content/character',
      'desktop-games/pet/content/voice',
      'desktop-games/pet/content/dialogue-pack',
      'desktop-games/pet/content/theme',
      'desktop-games/pet/content/background',
      'desktop-games/pet/content/font',
      'desktop-games/pet/content/role-theme',
    ]),
    note: 'Pre-role-theme explicit six-key selections map to a matching character theme at content-runtime startup; the mapping needs the content library, so the runner leaves it to the owner.',
  }),
  Object.freeze({
    id: 'save-vault-schema',
    owner: 'save-host.ts -> save-runtime.ts',
    areas: Object.freeze(['desktop-games/pet/pet', 'desktop-games/pet/pet.bak']),
    note: 'The encrypted save payload has its own schema/migration inside the save runtime; the registry only lists the slots for the clear scope.',
  }),
  Object.freeze({
    id: 'scale-lazy-read',
    owner: 'scaling.ts (loadScaleSettings)',
    areas: Object.freeze(['desktop-games/pet/scale', 'desktop-games/pet/text-scale']),
    note: 'The same mapping as scale-legacy-pair-v1 for profiles that never boot the pet page (the runner is the eager, post-consent path).',
  }),
  Object.freeze({
    id: 'market-serial-fail-closed',
    owner: 'content-market.ts',
    areas: Object.freeze([
      'desktop-games/pet/content/market/catalog-serial',
      'desktop-games/pet/content/market/catalog-cache',
    ]),
    note: 'Unknown/older market envelope versions are reported as storage-corrupt and never silently reset or migrated (anti-rollback).',
  }),
])

// ---------------------------------------------------------------------------
// Migration steps
// ---------------------------------------------------------------------------

export type FamlingMigrationStepStatus = 'applied' | 'skipped' | 'failed'

export interface FamlingMigrationStepOutcome {
  readonly status: FamlingMigrationStepStatus
  /** Bounded, path-free explanation (no user data). */
  readonly detail?: string
}

export interface FamlingStateMigrationStep {
  readonly id: string
  /** State-schema version that introduced this step (runs when marker < version). */
  readonly version: number
  /** Keys whose values the step may normalize (documentation + tests). */
  readonly keys: readonly string[]
  readonly run: (storage: StorageLike) => FamlingMigrationStepOutcome
}

/**
 * Step 1: the legacy two-axis scaling pair -> the four-level model.
 *
 * Delegates to scaling.ts's own decision (`loadScaleSettings().migrated`) and
 * persistence helper, so the effective scales are exactly what the lazy read
 * migration would have produced. The migration is a visual no-op: the shipped
 * default (pet 2x / text 2x) maps to global 1 / image 1 / uiText 1.
 */
const SCALE_LEGACY_PAIR_STEP: FamlingStateMigrationStep = Object.freeze({
  id: 'scale-legacy-pair-v1',
  version: 1,
  keys: Object.freeze([
    LEGACY_PET_SCALE_KEY,
    LEGACY_TEXT_SCALE_KEY,
    SCALE_MODEL_KEY,
    'desktop-games/pet/scale/global',
    'desktop-games/pet/scale/ui-text',
    'desktop-games/pet/scale/image',
  ]),
  run(storage: StorageLike): FamlingMigrationStepOutcome {
    const legacyPet = safeGetItem(LEGACY_PET_SCALE_KEY, storage)
    const legacyText = safeGetItem(LEGACY_TEXT_SCALE_KEY, storage)
    if (legacyPet === null && legacyText === null) {
      return { status: 'skipped', detail: 'no legacy pet-scale/text-scale keys' }
    }
    // scaling.ts decides when the legacy pair is authoritative: a stored model
    // marker or any new-axis key wins and makes the legacy pair inert.
    const loaded = loadScaleSettings(storage)
    if (!loaded.migrated) {
      return { status: 'skipped', detail: 'scale model already present; legacy pair left inert' }
    }
    persistScaleSettings(loaded.settings, storage)
    if (loadScaleSettings(storage).migrated) {
      return { status: 'failed', detail: 'scale migration did not persist (storage blocked?)' }
    }
    return { status: 'applied', detail: 'legacy pet-scale/text-scale mapped onto scale/model + axes' }
  },
})

/** Envelope version of a parsed value (`undefined` = not an envelope). */
function envelopeVersionOf(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const version = (value as { v?: unknown }).v
  return typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : undefined
}

/**
 * Step 2: legacy raw-JSON chat digest -> the `{ v: 1, data }` envelope.
 *
 * The owner (`loadDigest`) already reads both shapes; writing the envelope
 * once makes the stored format deterministic for future readers. Invalid or
 * already-versioned values are left byte-identical: a corrupt digest must not
 * be destroyed by a migration.
 */
const CHAT_DIGEST_ENVELOPE_STEP: FamlingStateMigrationStep = Object.freeze({
  id: 'chat-digest-envelope-v1',
  version: 1,
  keys: Object.freeze([CHAT_DIGEST_KEY]),
  run(storage: StorageLike): FamlingMigrationStepOutcome {
    const raw = safeGetItem(CHAT_DIGEST_KEY, storage)
    if (raw === null || raw.trim() === '') return { status: 'skipped', detail: 'no chat digest stored' }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { status: 'skipped', detail: 'chat digest is not valid JSON; left byte-identical' }
    }
    if (envelopeVersionOf(parsed) !== undefined) {
      return { status: 'skipped', detail: 'chat digest already uses a version envelope' }
    }
    const digest = validateDigest(parsed)
    if (digest === undefined) {
      return { status: 'skipped', detail: 'chat digest failed validation; left byte-identical' }
    }
    const write = writeVersioned(
      CHAT_DIGEST_KEY,
      digest,
      { version: CHAT_DIGEST_VERSION, maxBytes: SECURITY_LIMITS.importDigestBytes },
      storage,
    )
    if (write.status !== 'ok') return { status: 'failed', detail: `chat digest envelope write failed: ${write.status}` }
    const verify = readVersioned(
      CHAT_DIGEST_KEY,
      { version: CHAT_DIGEST_VERSION, validate: validateDigest, maxBytes: SECURITY_LIMITS.importDigestBytes },
      storage,
    )
    if (verify.status !== 'ok') return { status: 'failed', detail: `chat digest envelope verification failed: ${verify.status}` }
    return { status: 'applied', detail: 'legacy raw chat digest re-written in the v1 envelope' }
  },
})

/** Ordered migration steps. A step runs when the stored marker is below its version. */
export const FAMLING_STATE_MIGRATIONS: readonly FamlingStateMigrationStep[] = Object.freeze([
  SCALE_LEGACY_PAIR_STEP,
  CHAT_DIGEST_ENVELOPE_STEP,
])

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Enumerable Web Storage surface (the real localStorage exposes length + key). */
export interface FamlingStorageLike extends StorageLike {
  readonly length?: number
  key?(index: number): string | null
}

const MAX_DETAIL_CHARS = 160

function boundedDetail(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '')
  const clean = message.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return (clean || 'unknown error').slice(0, MAX_DETAIL_CHARS)
}

function resolveFamlingStorage(storage?: FamlingStorageLike | null): FamlingStorageLike | null {
  return resolveStorage(storage) as FamlingStorageLike | null
}

/** True when `key` belongs to the famling local-state namespace. */
export function isFamlingStorageKey(key: string): boolean {
  return FAMLING_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
}

/** Storage wrapper that records successful writes for the migration report. */
interface RecordingStorage extends StorageLike {
  readonly writes: string[]
}

function createRecordingStorage(store: StorageLike): RecordingStorage {
  const writes: string[] = []
  return {
    writes,
    getItem(key: string): string | null {
      return store.getItem(key)
    },
    setItem(key: string, value: string): void {
      store.setItem(key, value)
      writes.push(key)
    },
    removeItem(key: string): void {
      store.removeItem(key)
    },
  }
}

interface MarkerRead {
  readonly status: 'ok' | 'missing' | 'corrupt' | 'unavailable'
  readonly version: number | null
}

function readStateMarker(store: StorageLike): MarkerRead {
  let raw: string | null
  try {
    raw = store.getItem(FAMLING_STATE_SCHEMA_KEY)
  } catch {
    return { status: 'unavailable', version: null }
  }
  if (raw === null) return { status: 'missing', version: null }
  const text = raw.trim()
  if (!/^\d+$/.test(text)) return { status: 'corrupt', version: null }
  const version = Number(text)
  if (!Number.isSafeInteger(version)) return { status: 'corrupt', version: null }
  return { status: 'ok', version }
}

// ---------------------------------------------------------------------------
// Version marker read
// ---------------------------------------------------------------------------

export interface FamlingStateVersionRead {
  readonly status: 'ok' | 'missing' | 'corrupt' | 'unavailable' | 'future'
  readonly version: number | null
  readonly current: number
  /** True when the stored marker belongs to a newer build (never overwritten). */
  readonly future: boolean
}

/** Read the state-schema marker without writing anything. Never throws. */
export function readFamlingStateVersion(storage?: FamlingStorageLike | null): FamlingStateVersionRead {
  const store = resolveFamlingStorage(storage)
  if (!store) {
    return Object.freeze({ status: 'unavailable', version: null, current: FAMLING_STATE_SCHEMA_VERSION, future: false })
  }
  const marker = readStateMarker(store)
  const future = marker.version !== null && marker.version > FAMLING_STATE_SCHEMA_VERSION
  const status: FamlingStateVersionRead['status'] = future ? 'future' : marker.status
  return Object.freeze({ status, version: marker.version, current: FAMLING_STATE_SCHEMA_VERSION, future })
}

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

export type FamlingMigrationStatus = 'ok' | 'partial' | 'future' | 'unavailable'

export interface FamlingMigrationStepResult {
  readonly id: string
  readonly status: FamlingMigrationStepStatus
  readonly detail?: string
}

export interface FamlingMigrationReport {
  readonly status: FamlingMigrationStatus
  readonly fromVersion: number
  readonly toVersion: number
  /** True when at least one step applied a migration. */
  readonly migrated: boolean
  readonly steps: readonly FamlingMigrationStepResult[]
  /** Keys written through the runner (marker included when written). */
  readonly wrote: readonly string[]
  readonly warnings: readonly string[]
}

function frozenMigrationReport(report: FamlingMigrationReport): FamlingMigrationReport {
  return Object.freeze({
    ...report,
    steps: Object.freeze([...report.steps]),
    wrote: Object.freeze([...report.wrote]),
    warnings: Object.freeze([...report.warnings]),
  })
}

function runStepSafely(step: FamlingStateMigrationStep, storage: StorageLike): FamlingMigrationStepOutcome {
  try {
    return step.run(storage)
  } catch (error) {
    return { status: 'failed', detail: `step threw: ${boundedDetail(error)}` }
  }
}

/**
 * Run every pending migration step, then persist the state-schema marker.
 * Never throws; the caller only needs to branch on `status`.
 *
 * - `ok`: marker was already current, or every pending step ran and the marker
 *   was written.
 * - `partial`: at least one step failed (or the marker could not be written);
 *   the old marker is kept so the next boot retries. Steps are idempotent.
 * - `future`: a newer build wrote the marker; nothing is read-migrated or
 *   overwritten (forward compatibility).
 * - `unavailable`: Web Storage is missing/blocked; nothing is written.
 */
export function migrateFamlingLocalState(storage?: FamlingStorageLike | null): FamlingMigrationReport {
  const store = resolveFamlingStorage(storage)
  if (!store) {
    return frozenMigrationReport({
      status: 'unavailable',
      fromVersion: 0,
      toVersion: FAMLING_STATE_SCHEMA_VERSION,
      migrated: false,
      steps: [],
      wrote: [],
      warnings: ['Web Storage is unavailable'],
    })
  }
  const marker = readStateMarker(store)
  if (marker.status === 'unavailable') {
    return frozenMigrationReport({
      status: 'unavailable',
      fromVersion: 0,
      toVersion: FAMLING_STATE_SCHEMA_VERSION,
      migrated: false,
      steps: [],
      wrote: [],
      warnings: ['state schema marker is unreadable (storage blocked?)'],
    })
  }
  const warnings: string[] = []
  const fromVersion = marker.version ?? 0
  if (marker.status === 'corrupt') warnings.push('state schema marker is corrupt; treated as version 0')
  if (fromVersion > FAMLING_STATE_SCHEMA_VERSION) {
    warnings.push(`state schema ${fromVersion} is newer than this build (${FAMLING_STATE_SCHEMA_VERSION}); no migration or overwrite`)
    return frozenMigrationReport({
      status: 'future',
      fromVersion,
      toVersion: FAMLING_STATE_SCHEMA_VERSION,
      migrated: false,
      steps: [],
      wrote: [],
      warnings,
    })
  }
  if (fromVersion === FAMLING_STATE_SCHEMA_VERSION) {
    return frozenMigrationReport({
      status: 'ok',
      fromVersion,
      toVersion: FAMLING_STATE_SCHEMA_VERSION,
      migrated: false,
      steps: [],
      wrote: [],
      warnings,
    })
  }
  const recorder = createRecordingStorage(store)
  const steps: FamlingMigrationStepResult[] = []
  let failed = false
  for (const step of FAMLING_STATE_MIGRATIONS) {
    if (fromVersion >= step.version) continue
    const outcome = runStepSafely(step, recorder)
    const result: FamlingMigrationStepResult =
      outcome.detail === undefined
        ? Object.freeze({ id: step.id, status: outcome.status })
        : Object.freeze({ id: step.id, status: outcome.status, detail: boundedDetail(outcome.detail) })
    steps.push(result)
    if (outcome.status === 'failed') failed = true
  }
  const wrote = [...new Set(recorder.writes)]
  if (failed) {
    warnings.push('migration incomplete; the stored marker was not advanced and the next boot retries')
    return frozenMigrationReport({
      status: 'partial',
      fromVersion,
      toVersion: FAMLING_STATE_SCHEMA_VERSION,
      migrated: steps.some((step) => step.status === 'applied'),
      steps,
      wrote,
      warnings,
    })
  }
  const markerStatus = safeSetItem(FAMLING_STATE_SCHEMA_KEY, String(FAMLING_STATE_SCHEMA_VERSION), store)
  if (markerStatus === 'ok') wrote.push(FAMLING_STATE_SCHEMA_KEY)
  else warnings.push(`state schema marker was not written: ${markerStatus}`)
  return frozenMigrationReport({
    status: markerStatus === 'ok' ? 'ok' : 'partial',
    fromVersion,
    toVersion: FAMLING_STATE_SCHEMA_VERSION,
    migrated: steps.some((step) => step.status === 'applied'),
    steps,
    wrote,
    warnings,
  })
}

// ---------------------------------------------------------------------------
// Clear scope
// ---------------------------------------------------------------------------

export interface FamlingStorageKeyListing {
  readonly keys: readonly string[]
  /** False when the store cannot enumerate keys: only registry keys were checked. */
  readonly enumerable: boolean
  /** True when Web Storage itself is missing/blocked. */
  readonly unavailable: boolean
}

/**
 * List the famling keys currently present. With enumeration this is every
 * in-scope key (including dynamic families); without it, only the registry's
 * exact keys. Never throws.
 */
export function listFamlingStorageKeys(storage?: FamlingStorageLike | null): FamlingStorageKeyListing {
  const store = resolveFamlingStorage(storage)
  if (!store) {
    return Object.freeze({ keys: Object.freeze([]), enumerable: false, unavailable: true })
  }
  const keys = new Set<string>()
  let enumerable = false
  try {
    if (typeof store.length === 'number' && typeof store.key === 'function') {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index)
        if (typeof key === 'string' && isFamlingStorageKey(key)) keys.add(key)
      }
      enumerable = true
    }
  } catch {
    enumerable = false
  }
  let readable = 0
  let unreadable = 0
  for (const spec of FAMLING_STORAGE_KEYS) {
    if (spec.prefix === true) continue
    try {
      const value = store.getItem(spec.key)
      readable += 1
      if (value !== null) keys.add(spec.key)
    } catch {
      unreadable += 1
      // Unreadable keys are still deletion targets: the clear path attempts the
      // removal and reports a residual if the key cannot be verified gone.
    }
  }
  // A store whose every known read throws is indistinguishable from blocked
  // storage: report it instead of pretending we inspected an empty namespace.
  const unavailable = readable === 0 && unreadable > 0
  return Object.freeze({ keys: Object.freeze([...keys].sort()), enumerable, unavailable })
}

export type FamlingClearItemId =
  | 'save'
  | 'chat-digest'
  | 'preferences'
  | 'window-position'
  | 'consent-acceptance'
  | 'consent-audit'
  | 'age-verification'
  | 'safety-audit'
  | 'other-pet'
  | 'unrelated'

/**
 * Classify a key into the same user-facing data-control item ids the shipped
 * delete-all dialog uses (consent/data-controls.ts). The test suite asserts
 * parity for every registry key, so the single clear scope cannot drift from
 * the UI classification.
 */
export function classifyFamlingStorageKey(key: string): FamlingClearItemId {
  if (key === 'desktop-games/consent/tos-acceptance-v1') return 'consent-acceptance'
  if (key === 'desktop-games/consent/audit-v1') return 'consent-audit'
  if (key === 'desktop-games/consent/age-verification-v1') return 'age-verification'
  if (key === 'desktop-games/consent/safety-audit-v1' || key === 'desktop-games/consent/safety-audit-salt-v1') return 'safety-audit'
  if (key.startsWith('desktop-games/pet/chat-import')) return 'chat-digest'
  if (key === 'desktop-games/pet/pet' || key === 'desktop-games/pet/pet.bak') return 'save'
  if (key === 'desktop-games/pet/window') return 'window-position'
  if (
    key === 'desktop-games/pet/volume' ||
    key === 'desktop-games/pet/hero' ||
    key === 'desktop-games/pet/heroCharacter' ||
    key === 'desktop-games/pet/scale' ||
    key === 'desktop-games/pet/text-scale' ||
    key === 'desktop-games/pet/setup-ack-v1' ||
    key === 'desktop-games/pet/advisers-mode'
  ) {
    return 'preferences'
  }
  if (key.startsWith('desktop-games/pet/')) return 'other-pet'
  if (key.startsWith('desktop-games/consent/')) return 'consent-audit'
  return 'unrelated'
}

export interface FamlingClearItemReport {
  readonly id: FamlingClearItemId
  readonly removed: readonly string[]
  readonly residual: readonly string[]
}

export interface FamlingClearReport {
  readonly status: 'cleared' | 'partial' | 'unavailable'
  /** True only when every in-scope key was removed, verified AND enumerable. */
  readonly complete: boolean
  readonly enumerable: boolean
  readonly removed: readonly string[]
  readonly residual: readonly string[]
  readonly items: readonly FamlingClearItemReport[]
  readonly warnings: readonly string[]
}

/**
 * The single clear-scope API for famling Web Storage: remove every in-scope
 * key, verify each removal and report residual/unknown items instead of
 * claiming success. It does NOT touch Tauri/DPAPI files, the TTS cache, the
 * user's exported files or other games' keys; consent/data-controls.ts remains
 * the user-facing delete-all dialog and delegates the host-file half.
 */
export function clearFamlingLocalState(storage?: FamlingStorageLike | null): FamlingClearReport {
  const store = resolveFamlingStorage(storage)
  if (!store) {
    return Object.freeze({
      status: 'unavailable',
      complete: false,
      enumerable: false,
      removed: Object.freeze([]),
      residual: Object.freeze([]),
      items: Object.freeze([]),
      warnings: Object.freeze(['Web Storage is unavailable']),
    })
  }
  const listing = listFamlingStorageKeys(store)
  if (listing.unavailable) {
    return Object.freeze({
      status: 'unavailable',
      complete: false,
      enumerable: false,
      removed: Object.freeze([]),
      residual: Object.freeze([]),
      items: Object.freeze([]),
      warnings: Object.freeze(['Web Storage is blocked: nothing could be read or verified']),
    })
  }
  const seen = new Set(listing.keys)
  const removed: string[] = []
  const residual: string[] = []
  const attemptRemove = (key: string): void => {
    try {
      store.removeItem(key)
    } catch {
      // Verification below decides; a throwing removeItem may still be gone.
    }
    let stillThere = true
    try {
      stillThere = store.getItem(key) !== null
    } catch {
      stillThere = true
    }
    if (stillThere) residual.push(key)
    else removed.push(key)
  }
  for (const key of [...seen].sort()) attemptRemove(key)
  // One rescan: a concurrent writer (another same-origin window) may add a key
  // between the listing and the deletion sweep; it is removed and reported too.
  const rescan = listFamlingStorageKeys(store)
  for (const key of rescan.keys) {
    if (seen.has(key)) continue
    attemptRemove(key)
  }
  const items = new Map<FamlingClearItemId, { removed: string[]; residual: string[] }>()
  const itemFor = (key: string) => {
    const id = classifyFamlingStorageKey(key)
    const existing = items.get(id)
    if (existing) return existing
    const created = { removed: [] as string[], residual: [] as string[] }
    items.set(id, created)
    return created
  }
  for (const key of removed) itemFor(key).removed.push(key)
  for (const key of residual) itemFor(key).residual.push(key)
  const itemReports = [...items.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) =>
      Object.freeze({
        id,
        removed: Object.freeze([...value.removed].sort()),
        residual: Object.freeze([...value.residual].sort()),
      }),
    )
  const warnings: string[] = []
  if (!listing.enumerable) {
    warnings.push('storage cannot enumerate keys: only registry keys could be cleared and verified')
  }
  const sortedRemoved = [...removed].sort()
  const sortedResidual = [...residual].sort()
  return Object.freeze({
    status: sortedResidual.length === 0 ? 'cleared' : 'partial',
    complete: sortedResidual.length === 0 && listing.enumerable,
    enumerable: listing.enumerable,
    removed: Object.freeze(sortedRemoved),
    residual: Object.freeze(sortedResidual),
    items: Object.freeze(itemReports),
    warnings: Object.freeze(warnings),
  })
}
