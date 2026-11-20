/**
 * Character-pack runtime layer for `famling.pet-anim/0.2` bundles
 * (MB-041/042 partial: install/update/uninstall/rollback/enable/hot-switch
 * state machine + data-driven registry; UI and real host I/O are NOT wired).
 *
 * The spec layer (`content-library.ts`) validates a pack + zip inventory and
 * returns a deterministic install PLAN. This module is the stateful companion:
 * it executes that plan through a narrow, injected host boundary, commits a
 * version by writing `<packId>/current.json` last (pointer commit), and keeps a
 * registry that can enable a character and hot-switch between already-loaded
 * characters without touching the DOM, the renderer or the network.
 *
 * Strict boundary:
 * - this module performs NO filesystem / network / renderer / DOM I/O itself;
 *   every effect goes through the injected `CharacterPackRuntimeHost`
 *   (`readZip` = bounded content-assets reader, `write`/`remove` = host file
 *   store, `loadCharacter` = host reads the installed pack.json, `emit` = UI
 *   event sink, optional `fetchText` = host-mediated manifest text transport);
 * - the runtime never implements a second zip/schema validator: it reuses
 *   `validateCharacterPackV2` + `validateCharacterPackZip` indirectly through
 *   `planCharacterPackInstall`, and re-validates installed packs on load so a
 *   tampered on-disk pack fails closed instead of becoming active;
 * - built-in characters are supplied fully loaded and are protected from
 *   install/uninstall/override; a failed install/update removes every partial
 *   write and keeps the previous pointer (atomic rollback); a failed hot switch
 *   leaves the previous active character untouched.
 *
 * What this module deliberately does NOT do (see docs/content-packs/
 * CHARACTER-RUNTIME-2026-11-19.md for the integration plan):
 * - no IPC/commands, no Tauri/Node FS adapter, no app-data path resolution;
 * - no UI/menu/hero-runtime wiring, no reload of the page, no renderer calls;
 * - no signature trust-root assembly (the caller injects the verifier);
 * - no claim that third-party characters are installable today: production
 *   wiring still needs a host adapter + UI consent flow and is out of scope.
 */

import {
  decodeUtf8,
  readContentZip,
  sha256Hex,
  type ContentBundle,
  type ContentBundleReadResult,
} from './content-assets.ts'
import { parseHeroRegionConfig, type HeroRegionConfig } from './anim/regions.ts'
import { CLIP_IDS, type ClipId } from './anim/types.ts'
import { validateBehaviorProfile } from './character/validate.ts'
import type { BehaviorProfile } from './character/types.ts'
import {
  CHARACTER_PACK_KINDS,
  CHARACTER_PACK_MANIFEST_FILE,
  CHARACTER_PACK_V2_LIMITS,
  characterPackFramePaths,
  characterPackInstallLayoutFor,
  inspectCharacterPackFrameMemory,
  planCharacterPackInstall,
  planCharacterPackUninstall,
  validateCharacterPackV2,
  verifyRemoteCharacterPack,
  type CharacterPackClipV2,
  type CharacterPackInstallConsent,
  type CharacterPackInstallErrorCode,
  type CharacterPackInstallPlan,
  type CharacterPackInstalledRecord,
  type CharacterPackKind,
  type CharacterPackSpecV2,
  type CharacterPackUninstallPlan,
  type CharacterPackV2,
  type ContentIssue,
  type ContentPackZipEntry,
  type ContentSignatureVerification,
  type ContentSignatureVerifyOptions,
  type ContentTrustRoot,
  type ContentEd25519Verifier,
} from './content-library.ts'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Version of the pointer document written to `<packId>/current.json`. */
export const CHARACTER_PACK_POINTER_SCHEMA = 'famling.character-pointer/0.1'

const CHARACTER_PACK_ID_PATTERN = /^[a-z0-9][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const CHARACTER_PACK_SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/
const CONTROL_CHARS_PATTERN = /[\u0000-\u001f\u007f]/
const MAX_TARGET_CHARS = 96
const MAX_ASSET_HINT_CHARS = 512
const MAX_PROVENANCE_CHARS = 128
const MAX_INSTALLED_NAME_CHARS = 80

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Host-relative reference to one pack version (installed or built-in). */
export interface CharacterPackLoadRef {
  readonly packId: string
  readonly version: string
  readonly source: 'installed' | 'builtin'
}

/**
 * What the host returns for one `loadCharacter()` call: the parsed pack.json
 * read from the installed version directory plus optional asset hints. The
 * runtime re-validates `pack` fail-closed before exposing it.
 */
export interface CharacterPackHostLoadResult {
  readonly pack: unknown
  /** Host-resolved base path/URL for pack-relative assets (optional). */
  readonly assetBase?: string
  /** Host-resolved per-file URLs keyed by pack-relative path (optional). */
  readonly assetUrls?: Readonly<Record<string, string>>
}

/** One installed pack as reported by the host (source of truth on startup). */
export interface CharacterPackInstalledState {
  readonly record: CharacterPackInstalledRecord
  readonly characterId: string
  readonly kind: CharacterPackKind
  readonly name: string
  /** Version this one replaced; only used by the explicit rollback action. */
  readonly previous?: CharacterPackInstalledRecord
}

/**
 * Injected host boundary. The runtime is usable in Node tests and in the
 * WebView without touching globals; the production adapter (Tauri commands)
 * is deliberately NOT part of this module.
 */
export interface CharacterPackRuntimeHost {
  /**
   * Host-mediated text transport for a pack manifest URL/path. Optional: used
   * only by `inspectManifest()`, never during install. The runtime never calls
   * `fetch` itself; the host owns protocol allow-listing, timeouts and caps.
   */
  readonly fetchText?: (url: string) => Promise<string>
  /** Bounded, CRC-verified in-memory zip reader; inject content-assets. */
  readonly readZip: (bytes: ArrayBuffer | Uint8Array) => Promise<ContentBundleReadResult>
  /** Installed packs as the host sees them (pointer files on disk). */
  readonly listInstalled: () => Promise<readonly CharacterPackInstalledState[]>
  /** Write one host-relative file (creates parents; atomic per file). */
  readonly write: (path: string, bytes: Uint8Array) => Promise<void>
  /** Remove one host-relative file or directory tree; resolves when gone. */
  readonly remove: (path: string) => Promise<void>
  /** Read + JSON-parse `<packId>/<version>/pack.json` for one version. */
  readonly loadCharacter: (ref: CharacterPackLoadRef) => Promise<CharacterPackHostLoadResult>
  /** UI/telemetry event sink; must not perform install work. */
  readonly emit: (event: CharacterPackRuntimeEvent) => void
}

/** Remote signature trust configuration (assembled by the caller). */
export interface CharacterPackRemoteTrust {
  readonly trustRoot: ContentTrustRoot
  readonly verifier: ContentEd25519Verifier
  readonly options?: ContentSignatureVerifyOptions
}

/** Fully loaded, renderer-agnostic art handle for one character. */
export interface CharacterPackArtHandle {
  readonly canvas: readonly [number, number]
  readonly anchor: { readonly x: number; readonly y: number; readonly mode: 'foot-center' }
  readonly footBox: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  readonly bbox?: readonly [number, number, number, number]
  readonly display?: { readonly scale?: 1 | 2 | 4; readonly pixelated?: true }
  readonly palette: string
  /** Pack-relative preview (installed pack) or a built-in asset URL. */
  readonly preview?: string
  /** Canonical clip metadata; absent for built-ins that keep their own rig. */
  readonly clips?: Readonly<Record<ClipId, CharacterPackClipV2>>
  /** Pack-relative frame paths (installed pack) or built-in asset URLs. */
  readonly framePaths?: readonly string[]
  readonly assetBase?: string
  readonly assetUrls?: Readonly<Record<string, string>>
  /**
   * SPDX licence id copied from the validated pack (`license.spdx`). Optional
   * for hand-authored built-ins that predate this field; the renderer adapter
   * refuses to invent it (`missing-provenance`) rather than claim a licence.
   */
  readonly license?: string
  /**
   * AI-generation provenance copied from the validated pack (`aiProvenance`).
   * Optional for the same reason as `license`: the renderer adapter never
   * invents an AI status, because that would be a false disclosure.
   */
  readonly ai?: { readonly status: 'none' | 'concept' | 'final'; readonly tool?: string }
  /**
   * Behavior fallback chain from `character.fallback` (state/tag → clip ids).
   * `missingTags()`/`resolveFallbackTag()` use it before failing a tag.
   */
  readonly fallback?: Readonly<Record<string, readonly ClipId[]>>
}

/** Input accepted by `defineBuiltinCharacter()` / runtime options. */
export interface CharacterPackBuiltinInput {
  readonly packId: string
  readonly version: string
  readonly characterId: string
  readonly name: string
  readonly kind: CharacterPackKind
  readonly art: CharacterPackArtHandle
  readonly behavior: BehaviorProfile
  readonly regions: HeroRegionConfig
}

/** Validated, frozen built-in character definition. */
export type CharacterPackBuiltin = Readonly<CharacterPackBuiltinInput>

/** Active character returned by `enable()` / hot switching. */
export interface CharacterPackActiveCharacter {
  readonly packId: string
  readonly version: string
  readonly characterId: string
  readonly name: string
  readonly kind: CharacterPackKind
  readonly builtin: boolean
  readonly enabledAt: number
  readonly art: CharacterPackArtHandle
  readonly behavior: BehaviorProfile
  readonly regions: HeroRegionConfig
}

/** One registry row used by a future content/character picker. */
export interface CharacterPackRegistryEntry {
  readonly packId: string
  readonly version: string
  readonly characterId: string
  readonly name: string
  readonly kind: CharacterPackKind
  readonly source: 'builtin' | 'installed'
  readonly active: boolean
  readonly previousVersion?: string
}

export type CharacterPackRuntimeOperation =
  | 'idle'
  | 'installing'
  | 'uninstalling'
  | 'rolling-back'
  | 'enabling'
  | 'refreshing'

/** Snapshot for UI state without exposing internal maps. */
export interface CharacterPackRuntimeSnapshot {
  readonly operation: CharacterPackRuntimeOperation
  readonly active: CharacterPackActiveCharacter | null
  readonly registry: readonly CharacterPackRegistryEntry[]
}

/** Runtime error codes (install-plan codes are a subset). */
export type CharacterPackRuntimeErrorCode =
  | 'busy'
  | 'invalid-request'
  | 'invalid-pack'
  | 'invalid-zip'
  | 'zip-hash-mismatch'
  | 'declaration-required'
  | 'license-required'
  | 'ai-disclosure-required'
  | 'consent-required'
  | 'remote-unverified'
  | 'builtin-protected'
  | 'character-conflict'
  | 'already-installed'
  | 'version-conflict'
  | 'downgrade-refused'
  | 'not-installed'
  | 'nothing-to-rollback'
  | 'rollback-unavailable'
  | 'active-character-in-use'
  | 'character-not-found'
  | 'load-failed'
  | 'host-list-failed'
  | 'host-write-failed'
  | 'host-remove-failed'
  | 'host-fetch-failed'
  | 'unsupported'

export interface CharacterPackRuntimeFailure {
  readonly ok: false
  readonly code: CharacterPackRuntimeErrorCode
  readonly message: string
  readonly issues?: readonly ContentIssue[]
  /** Character that remained active after a failed switch. */
  readonly restored?: CharacterPackActiveCharacter | null
  /** True when a failed install/update removed every partial write. */
  readonly rolledBack?: boolean
}

/** Emitted through `host.emit()`; never contains bytes or host paths. */
export type CharacterPackRuntimeEvent =
  | { readonly type: 'install-started'; readonly bytes: number }
  | { readonly type: 'install-committed'; readonly action: 'install' | 'update'; readonly state: CharacterPackInstalledState }
  | { readonly type: 'install-failed'; readonly code: CharacterPackRuntimeErrorCode; readonly message: string; readonly rolledBack: boolean }
  | { readonly type: 'uninstall-committed'; readonly packId: string; readonly version: string }
  | { readonly type: 'uninstall-failed'; readonly packId: string; readonly code: CharacterPackRuntimeErrorCode; readonly message: string }
  | { readonly type: 'rollback-committed'; readonly packId: string; readonly fromVersion: string; readonly toVersion: string }
  | { readonly type: 'rollback-failed'; readonly packId: string; readonly code: CharacterPackRuntimeErrorCode; readonly message: string }
  | { readonly type: 'character-switched'; readonly previous: CharacterPackActiveCharacter | null; readonly current: CharacterPackActiveCharacter }
  | { readonly type: 'character-switch-failed'; readonly code: CharacterPackRuntimeErrorCode; readonly message: string; readonly restored: CharacterPackActiveCharacter | null }
  | { readonly type: 'registry-refreshed'; readonly installed: number; readonly skipped: number }
  | { readonly type: 'warning'; readonly code: string; readonly message: string }

/** Install request: bytes + consent + optional expected hash/remote proof. */
export interface CharacterPackInstallInput {
  readonly zipBytes: ArrayBuffer | Uint8Array
  readonly consent?: Partial<CharacterPackInstallConsent>
  /** sha256 of the exact zip bytes (required for downloaded/remote bundles). */
  readonly expectedZipSha256?: string
  /** Pass `verifyRemoteCharacterPack()`'s result for source:'remote' packs. */
  readonly remoteVerification?: ContentSignatureVerification
}

export interface CharacterPackEnableOptions {
  /** Pin one version instead of the current installed/highest one. */
  readonly version?: string
  /** Drop the cached handles and reload from the host. */
  readonly forceReload?: boolean
}

export type CharacterPackInstallResult =
  | { readonly ok: true; readonly action: 'install' | 'update'; readonly state: CharacterPackInstalledState; readonly active: CharacterPackActiveCharacter | null }
  | CharacterPackRuntimeFailure

export type CharacterPackUninstallResult =
  | { readonly ok: true; readonly packId: string; readonly version: string; readonly active: CharacterPackActiveCharacter | null; readonly cleanupWarning?: string }
  | CharacterPackRuntimeFailure

export type CharacterPackRollbackResult =
  | { readonly ok: true; readonly packId: string; readonly fromVersion: string; readonly toVersion: string; readonly state: CharacterPackInstalledState; readonly active: CharacterPackActiveCharacter | null; readonly cleanupWarning?: string }
  | CharacterPackRuntimeFailure

export type CharacterPackEnableResult =
  | { readonly ok: true; readonly active: CharacterPackActiveCharacter; readonly reloaded: boolean }
  | CharacterPackRuntimeFailure

export type CharacterPackManifestInspection =
  | { readonly ok: true; readonly pack: CharacterPackV2 }
  | CharacterPackRuntimeFailure

export interface CharacterPackRuntimeOptions {
  readonly host: CharacterPackRuntimeHost
  /** Built-in characters that ship with the app (already loaded handles). */
  readonly builtins?: readonly CharacterPackBuiltin[]
  /** Built-in id to activate when the active character is uninstalled. */
  readonly defaultCharacterId?: string
  /** Ed25519 trust root/verifier for `source:'remote'` packs. */
  readonly remote?: CharacterPackRemoteTrust
  /** Hash implementation override (tests); defaults to content-assets. */
  readonly sha256?: (bytes: Uint8Array) => Promise<string>
  /** Clock override for deterministic pointers/tests. */
  readonly now?: () => number
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function requireSafeId(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 64 || !CHARACTER_PACK_ID_PATTERN.test(raw)) {
    throw new TypeError(label + ' must be a lowercase dot/dash separated id (max 64 chars)')
  }
  return raw
}

function requireSemver(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || !CHARACTER_PACK_SEMVER_PATTERN.test(raw)) {
    throw new TypeError(label + ' must be a SemVer string')
  }
  return raw
}

function requireName(raw: unknown, label: string): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_INSTALLED_NAME_CHARS || CONTROL_CHARS_PATTERN.test(raw)) {
    throw new TypeError(label + ' must be plain text (1..' + MAX_INSTALLED_NAME_CHARS + ' chars)')
  }
  return raw
}

function requireKind(raw: unknown, label: string): CharacterPackKind {
  if (typeof raw !== 'string' || !(CHARACTER_PACK_KINDS as readonly string[]).includes(raw)) {
    throw new TypeError(label + ' must be one of ' + CHARACTER_PACK_KINDS.join(', '))
  }
  return raw as CharacterPackKind
}

function comparePreRelease(left: readonly string[], right: readonly string[]): number {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const a = left[index] as string
    const b = right[index] as string
    const aNumeric = /^[0-9]+$/.test(a)
    const bNumeric = /^[0-9]+$/.test(b)
    if (aNumeric && bNumeric) {
      const diff = Number(a) - Number(b)
      if (diff !== 0) return diff < 0 ? -1 : 1
    } else if (aNumeric) {
      return -1
    } else if (bNumeric) {
      return 1
    } else {
      const order = a.localeCompare(b)
      if (order !== 0) return order < 0 ? -1 : 1
    }
  }
  return left.length === right.length ? 0 : left.length < right.length ? -1 : 1
}

/** Deterministic SemVer-ish ordering for the registry (no dependency). */
export function compareCharacterPackVersions(left: string, right: string): number {
  const parse = (value: string): { readonly core: readonly [number, number, number]; readonly pre: readonly string[] } | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value)
    if (match === null) return null
    return {
      core: [Number(match[1]), Number(match[2]), Number(match[3])],
      pre: match[4] === undefined ? [] : match[4].split('.'),
    }
  }
  const a = parse(left)
  const b = parse(right)
  if (a === null || b === null) return left.localeCompare(right) < 0 ? -1 : left.localeCompare(right) > 0 ? 1 : 0
  for (let index = 0; index < 3; index += 1) {
    const diff = (a.core[index] as number) - (b.core[index] as number)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1
  if (b.pre.length === 0) return -1
  return comparePreRelease(a.pre, b.pre)
}

function isSafeRuntimePath(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 240) return false
  if (value.includes('\\') || value.startsWith('/') || CONTROL_CHARS_PATTERN.test(value)) return false
  if (value.includes(':') || value.includes('#') || value.includes('?')) return false
  const segments = value.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && !/[<>"|*]/.test(segment))
}

function joinRuntimePath(root: string, relative: string): string | null {
  if (!isSafeRuntimePath(root) || !isSafeRuntimePath(relative)) return null
  const joined = root + '/' + relative
  return joined.startsWith(root + '/') ? joined : null
}

function versionKey(packId: string, version: string): string {
  return packId + '@' + version
}

function copyConsent(value: unknown): CharacterPackInstallConsent | null {
  if (!isPlainRecord(value)) return null
  if (value.usageConfirmed !== true || value.licenseAcknowledged !== true || value.aiDisclosureAcknowledged !== true) return null
  return Object.freeze({ usageConfirmed: true, licenseAcknowledged: true, aiDisclosureAcknowledged: true })
}

function fail(
  code: CharacterPackRuntimeErrorCode,
  message: string,
  extra: { readonly issues?: readonly ContentIssue[]; readonly restored?: CharacterPackActiveCharacter | null; readonly rolledBack?: boolean } = {},
): CharacterPackRuntimeFailure {
  return Object.freeze({
    ok: false as const,
    code,
    message,
    ...(extra.issues !== undefined ? { issues: extra.issues } : {}),
    ...(extra.restored !== undefined ? { restored: extra.restored } : {}),
    ...(extra.rolledBack !== undefined ? { rolledBack: extra.rolledBack } : {}),
  })
}

function classifyPackIssues(issues: readonly ContentIssue[]): { readonly code: CharacterPackRuntimeErrorCode; readonly message: string } {
  let declaration = false
  let license = false
  let ai = false
  let reserved = false
  for (const issue of issues) {
    if (issue.path.startsWith('$.usageDeclaration')) declaration = true
    else if (issue.path === '$.license' || issue.path.startsWith('$.license.')) license = true
    else if (issue.path.startsWith('$.aiProvenance')) ai = true
    else if (issue.code === 'reserved-id') reserved = true
  }
  if (declaration) return { code: 'declaration-required', message: 'pack is missing the canonical usage declaration; third-party packs cannot be installed without it' }
  if (license) return { code: 'license-required', message: 'pack is missing a licence declaration (spdx + attribution)' }
  if (ai) return { code: 'ai-disclosure-required', message: 'pack is missing AI provenance/disclosure metadata' }
  if (reserved) return { code: 'builtin-protected', message: 'famling.* ids are reserved for built-in characters and cannot be installed' }
  return { code: 'invalid-pack', message: 'pack does not validate against famling.pet-anim/0.2' }
}

const PLAN_ERROR_CODES: readonly CharacterPackInstallErrorCode[] = [
  'invalid-pack',
  'invalid-zip',
  'invalid-install-request',
  'consent-required',
  'remote-unverified',
  'already-installed',
  'version-conflict',
  'downgrade-refused',
  'not-installed',
]

function runtimeCodeFromPlan(code: string): CharacterPackRuntimeErrorCode {
  return (PLAN_ERROR_CODES as readonly string[]).includes(code) ? (code as CharacterPackRuntimeErrorCode) : 'invalid-request'
}

function normalizeInstalledRecord(raw: unknown): CharacterPackInstalledRecord | null {
  if (!isPlainRecord(raw)) return null
  const packId = raw.packId
  const version = raw.version
  const zipSha256 = raw.zipSha256
  if (typeof packId !== 'string' || !CHARACTER_PACK_ID_PATTERN.test(packId) || packId.length > 64) return null
  if (typeof version !== 'string' || !CHARACTER_PACK_SEMVER_PATTERN.test(version)) return null
  if (typeof zipSha256 !== 'string' || !SHA256_HEX_PATTERN.test(zipSha256)) return null
  return Object.freeze({ packId, version, zipSha256 })
}

function normalizeInstalledState(raw: unknown): CharacterPackInstalledState | null {
  if (!isPlainRecord(raw)) return null
  const record = normalizeInstalledRecord(raw.record)
  if (record === null) return null
  if (typeof raw.characterId !== 'string' || !CHARACTER_PACK_ID_PATTERN.test(raw.characterId) || raw.characterId.length > 64) return null
  if (typeof raw.name !== 'string' || raw.name.length === 0 || raw.name.length > MAX_INSTALLED_NAME_CHARS || CONTROL_CHARS_PATTERN.test(raw.name)) return null
  let kind: CharacterPackKind
  try {
    kind = requireKind(raw.kind, 'installed state kind')
  } catch {
    return null
  }
  let previous: CharacterPackInstalledRecord | undefined
  if (raw.previous !== undefined) {
    const parsed = normalizeInstalledRecord(raw.previous)
    if (parsed === null || parsed.packId !== record.packId) return null
    previous = parsed
  }
  return Object.freeze({ record, characterId: raw.characterId, kind, name: raw.name, ...(previous !== undefined ? { previous } : {}) })
}

function normalizeArtHandle(raw: CharacterPackArtHandle, label: string): CharacterPackArtHandle {
  if (!isPlainRecord(raw)) throw new TypeError(label + ': art must be an object')
  const canvas = raw.canvas
  if (!Array.isArray(canvas) || canvas.length !== 2) throw new TypeError(label + ': art.canvas must be [width,height]')
  const width = canvas[0]
  const height = canvas[1]
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) <= 0 || (height as number) <= 0) {
    throw new TypeError(label + ': art.canvas sides must be positive integers')
  }
  if (!isPlainRecord(raw.anchor)) throw new TypeError(label + ': art.anchor must be an object')
  if (!Number.isFinite(raw.anchor.x) || !Number.isFinite(raw.anchor.y) || raw.anchor.mode !== 'foot-center') {
    throw new TypeError(label + ': art.anchor must be {x,y,mode:\'foot-center\'}')
  }
  if (!isPlainRecord(raw.footBox)) throw new TypeError(label + ': art.footBox must be an object')
  for (const key of ['x', 'y', 'w', 'h'] as const) {
    if (!Number.isFinite(raw.footBox[key])) throw new TypeError(label + ': art.footBox.' + key + ' must be a number')
  }
  if (typeof raw.palette !== 'string' || raw.palette.length === 0 || raw.palette.length > 64) {
    throw new TypeError(label + ': art.palette must be a short non-empty string')
  }
  const out: { -readonly [K in keyof CharacterPackArtHandle]: CharacterPackArtHandle[K] } = {
    canvas: [width as number, height as number],
    anchor: { x: raw.anchor.x as number, y: raw.anchor.y as number, mode: 'foot-center' },
    footBox: {
      x: raw.footBox.x as number,
      y: raw.footBox.y as number,
      w: raw.footBox.w as number,
      h: raw.footBox.h as number,
    },
    palette: raw.palette,
  }
  if (raw.bbox !== undefined) {
    if (!Array.isArray(raw.bbox) || raw.bbox.length !== 4 || raw.bbox.some((value) => !Number.isFinite(value))) {
      throw new TypeError(label + ': art.bbox must be [x,y,w,h]')
    }
    out.bbox = [raw.bbox[0] as number, raw.bbox[1] as number, raw.bbox[2] as number, raw.bbox[3] as number]
  }
  if (raw.display !== undefined) {
    if (!isPlainRecord(raw.display)) throw new TypeError(label + ': art.display must be an object')
    const display: { scale?: 1 | 2 | 4; pixelated?: true } = {}
    if (raw.display.scale !== undefined) {
      if (raw.display.scale !== 1 && raw.display.scale !== 2 && raw.display.scale !== 4) throw new TypeError(label + ': art.display.scale must be 1, 2 or 4')
      display.scale = raw.display.scale
    }
    if (raw.display.pixelated !== undefined) {
      if (raw.display.pixelated !== true) throw new TypeError(label + ': art.display.pixelated must be true when present')
      display.pixelated = true
    }
    out.display = display
  }
  if (raw.preview !== undefined) {
    if (typeof raw.preview !== 'string' || raw.preview.length === 0 || raw.preview.length > MAX_ASSET_HINT_CHARS || CONTROL_CHARS_PATTERN.test(raw.preview)) {
      throw new TypeError(label + ': art.preview must be a short asset hint')
    }
    out.preview = raw.preview
  }
  if (raw.clips !== undefined) {
    if (!isPlainRecord(raw.clips)) throw new TypeError(label + ': art.clips must be a clip table')
    out.clips = raw.clips as unknown as Readonly<Record<ClipId, CharacterPackClipV2>>
  }
  if (raw.framePaths !== undefined) {
    if (!Array.isArray(raw.framePaths) || raw.framePaths.some((value) => typeof value !== 'string' || value.length === 0 || value.length > MAX_ASSET_HINT_CHARS || CONTROL_CHARS_PATTERN.test(value))) {
      throw new TypeError(label + ': art.framePaths must be an array of short asset hints')
    }
    out.framePaths = raw.framePaths as readonly string[]
  }
  if (raw.assetBase !== undefined) {
    if (typeof raw.assetBase !== 'string' || raw.assetBase.length === 0 || raw.assetBase.length > MAX_ASSET_HINT_CHARS || CONTROL_CHARS_PATTERN.test(raw.assetBase)) {
      throw new TypeError(label + ': art.assetBase must be a short asset hint')
    }
    out.assetBase = raw.assetBase
  }
  if (raw.assetUrls !== undefined) {
    if (!isPlainRecord(raw.assetUrls)) throw new TypeError(label + ': art.assetUrls must be an object')
    const urls: Record<string, string> = {}
    for (const [key, value] of Object.entries(raw.assetUrls)) {
      if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ASSET_HINT_CHARS || CONTROL_CHARS_PATTERN.test(value)) {
        throw new TypeError(label + ': art.assetUrls values must be short asset hints')
      }
      urls[key] = value
    }
    out.assetUrls = urls
  }
  if (raw.license !== undefined) {
    if (typeof raw.license !== 'string' || raw.license.length === 0 || raw.license.length > MAX_PROVENANCE_CHARS || CONTROL_CHARS_PATTERN.test(raw.license)) {
      throw new TypeError(label + ': art.license must be a short plain-text SPDX id when present')
    }
    out.license = raw.license
  }
  if (raw.ai !== undefined) {
    if (!isPlainRecord(raw.ai)) throw new TypeError(label + ': art.ai must be an object')
    const status = raw.ai.status
    if (status !== 'none' && status !== 'concept' && status !== 'final') {
      throw new TypeError(label + ': art.ai.status must be one of none, concept, final')
    }
    const ai: { status: 'none' | 'concept' | 'final'; tool?: string } = { status }
    if (raw.ai.tool !== undefined) {
      if (typeof raw.ai.tool !== 'string' || raw.ai.tool.length === 0 || raw.ai.tool.length > MAX_ASSET_HINT_CHARS || CONTROL_CHARS_PATTERN.test(raw.ai.tool)) {
        throw new TypeError(label + ': art.ai.tool must be a short plain-text tool id when present')
      }
      ai.tool = raw.ai.tool
    }
    out.ai = ai
  }
  if (raw.fallback !== undefined) {
    if (!isPlainRecord(raw.fallback)) throw new TypeError(label + ': art.fallback must be an object')
    const fallback: Record<string, ClipId[]> = {}
    for (const [key, chain] of Object.entries(raw.fallback)) {
      if (key.length === 0 || key.length > 64 || CONTROL_CHARS_PATTERN.test(key)) {
        throw new TypeError(label + ': art.fallback keys must be short plain-text tag names')
      }
      if (!Array.isArray(chain) || chain.length === 0) {
        throw new TypeError(label + ': art.fallback.' + key + ' must be a non-empty clip-id array')
      }
      const ids: ClipId[] = []
      for (const value of chain as readonly unknown[]) {
        if (typeof value !== 'string' || !(CLIP_IDS as readonly string[]).includes(value)) {
          throw new TypeError(label + ': art.fallback.' + key + ' must list clip ids from the canonical clip set')
        }
        ids.push(value as ClipId)
      }
      fallback[key] = ids
    }
    out.fallback = fallback
  }
  return deepFreeze(out) as CharacterPackArtHandle
}

/**
 * Validate + freeze one built-in character definition. Built-ins ship with
 * the app and are never read from an install directory, so they bypass the
 * pack schema (whose id space is reserved) but still go through the shipping
 * behavior/region validators. Throws `TypeError` (programmer error) on bad
 * input; built-ins are never loaded from untrusted sources.
 */
export function defineBuiltinCharacter(input: CharacterPackBuiltinInput): CharacterPackBuiltin {
  if (!isPlainRecord(input)) throw new TypeError('built-in character must be an object')
  const packId = requireSafeId(input.packId, 'built-in packId')
  const version = requireSemver(input.version, 'built-in version')
  const characterId = requireSafeId(input.characterId, 'built-in characterId')
  const name = requireName(input.name, 'built-in name')
  const kind = requireKind(input.kind, 'built-in kind')
  let behavior: BehaviorProfile
  try {
    behavior = validateBehaviorProfile(input.behavior)
  } catch (error) {
    throw new TypeError('built-in character behavior is invalid: ' + messageOf(error))
  }
  let regions: HeroRegionConfig
  try {
    regions = parseHeroRegionConfig(input.regions)
  } catch (error) {
    throw new TypeError('built-in character regions are invalid: ' + messageOf(error))
  }
  const art = normalizeArtHandle(input.art, 'built-in ' + packId)
  return deepFreeze({ packId, version, characterId, name, kind, art, behavior, regions }) as CharacterPackBuiltin
}

/** Host-side convenience adapter: bounded in-memory zip read + sha256 inventory. */
export async function readCharacterPackBundle(bytes: ArrayBuffer | Uint8Array): Promise<ContentBundleReadResult> {
  return readContentZip(bytes)
}

// ---------------------------------------------------------------------------
// Pointer document (host persists it; listInstalled parses it)
// ---------------------------------------------------------------------------

interface CharacterPackPointerDocument {
  readonly schema: typeof CHARACTER_PACK_POINTER_SCHEMA
  readonly packId: string
  readonly version: string
  readonly zipSha256: string
  readonly characterId: string
  readonly kind: CharacterPackKind
  readonly name: string
  readonly previous?: CharacterPackInstalledRecord
  readonly updatedAt: string
}

function buildPointerDocument(input: {
  readonly packId: string
  readonly version: string
  readonly zipSha256: string
  readonly characterId: string
  readonly kind: CharacterPackKind
  readonly name: string
  readonly previous?: CharacterPackInstalledRecord
  readonly now: number
}): CharacterPackPointerDocument {
  return {
    schema: CHARACTER_PACK_POINTER_SCHEMA,
    packId: input.packId,
    version: input.version,
    zipSha256: input.zipSha256,
    characterId: input.characterId,
    kind: input.kind,
    name: input.name,
    ...(input.previous !== undefined ? { previous: input.previous } : {}),
    updatedAt: new Date(input.now).toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Internal load record
// ---------------------------------------------------------------------------

interface LoadedHandles {
  readonly art: CharacterPackArtHandle
  readonly behavior: BehaviorProfile
  readonly regions: HeroRegionConfig
}

class CharacterPackLoadError extends Error {
  readonly code: CharacterPackRuntimeErrorCode
  constructor(code: CharacterPackRuntimeErrorCode, message: string) {
    super(message)
    this.name = 'CharacterPackLoadError'
    this.code = code
  }
}

type ResolvedTarget =
  | { readonly kind: 'builtin'; readonly builtin: CharacterPackBuiltin }
  | { readonly kind: 'installed'; readonly state: CharacterPackInstalledState }

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

/**
 * Stateful character-pack runtime. Create with `CharacterPackRuntime.open()`
 * (host `listInstalled()` is the startup source of truth). All mutating
 * operations are serialized: a second install/update/uninstall/rollback/enable
 * while one is in flight returns `busy` instead of racing the same files.
 */
export class CharacterPackRuntime {
  private readonly host: CharacterPackRuntimeHost
  private readonly builtins = new Map<string, CharacterPackBuiltin>()
  private readonly installed = new Map<string, CharacterPackInstalledState>()
  private readonly cache = new Map<string, LoadedHandles>()
  private readonly options: CharacterPackRuntimeOptions
  private active: CharacterPackActiveCharacter | null = null
  private busy: CharacterPackRuntimeOperation | null = null

  private constructor(options: CharacterPackRuntimeOptions, builtins: ReadonlyMap<string, CharacterPackBuiltin>) {
    this.options = options
    this.host = options.host
    for (const [packId, builtin] of builtins) this.builtins.set(packId, builtin)
  }

  /**
   * Open a runtime and load the host's installed-pack list. Throws when the
   * host boundary is malformed or `listInstalled()` fails: a runtime with a
   * silently empty registry would be worse than an explicit startup error.
   */
  static async open(options: CharacterPackRuntimeOptions): Promise<CharacterPackRuntime> {
    if (!isPlainRecord(options)) throw new TypeError('CharacterPackRuntime.open: options must be an object')
    assertRuntimeHost(options.host)
    const builtins = normalizeBuiltins(options.builtins)
    if (options.defaultCharacterId !== undefined && typeof options.defaultCharacterId !== 'string') {
      throw new TypeError('CharacterPackRuntime.open: defaultCharacterId must be a string')
    }
    const runtime = new CharacterPackRuntime(options, builtins)
    const ready = await runtime.refreshLocked(false)
    if (!ready.ok) throw new Error('CharacterPackRuntime.open: host.listInstalled() failed: ' + ready.message)
    return runtime
  }

  /** Registry rows sorted by characterId, then version descending. */
  registry(): readonly CharacterPackRegistryEntry[] {
    const entries: CharacterPackRegistryEntry[] = []
    for (const builtin of this.builtins.values()) {
      entries.push(Object.freeze({
        packId: builtin.packId,
        version: builtin.version,
        characterId: builtin.characterId,
        name: builtin.name,
        kind: builtin.kind,
        source: 'builtin' as const,
        active: this.active !== null && this.active.packId === builtin.packId && this.active.version === builtin.version,
      }))
    }
    for (const state of this.installed.values()) {
      entries.push(Object.freeze({
        packId: state.record.packId,
        version: state.record.version,
        characterId: state.characterId,
        name: state.name,
        kind: state.kind,
        source: 'installed' as const,
        active: this.active !== null && this.active.packId === state.record.packId && this.active.version === state.record.version,
        ...(state.previous !== undefined ? { previousVersion: state.previous.version } : {}),
      }))
    }
    entries.sort((left, right) => {
      const byCharacter = left.characterId.localeCompare(right.characterId)
      if (byCharacter !== 0) return byCharacter
      const byVersion = compareCharacterPackVersions(right.version, left.version)
      if (byVersion !== 0) return byVersion
      return left.packId.localeCompare(right.packId)
    })
    return Object.freeze(entries)
  }

  /** Installed versions sorted by characterId/version (no built-ins). */
  listInstalled(): readonly CharacterPackInstalledState[] {
    const states = [...this.installed.values()]
    states.sort((left, right) => {
      const byCharacter = left.characterId.localeCompare(right.characterId)
      if (byCharacter !== 0) return byCharacter
      return compareCharacterPackVersions(right.record.version, left.record.version)
    })
    return Object.freeze(states)
  }

  /** Currently active character (null until `enable()` succeeds). */
  activeCharacter(): CharacterPackActiveCharacter | null {
    return this.active
  }

  /** Operation label for UI busy state. */
  operation(): CharacterPackRuntimeOperation {
    return this.busy ?? 'idle'
  }

  snapshot(): CharacterPackRuntimeSnapshot {
    return deepFreeze({ operation: this.operation(), active: this.active, registry: this.registry() })
  }

  // -------------------------------------------------------------------------
  // install / update
  // -------------------------------------------------------------------------

  /** Install or update one pack version. Serialized; see class docs. */
  async install(input: CharacterPackInstallInput): Promise<CharacterPackInstallResult> {
    const busy = this.begin('installing')
    if (busy !== null) return busy
    try {
      return await this.installLocked(input)
    } finally {
      this.busy = null
    }
  }

  private async installLocked(input: CharacterPackInstallInput): Promise<CharacterPackInstallResult> {
    if (!isPlainRecord(input)) return this.installFailure('invalid-request', 'install input must be an object', false)
    const consent = copyConsent(input.consent)
    if (consent === null) {
      return this.installFailure('consent-required', 'explicit usage/licence/AI-disclosure consent is required before installing', false)
    }
    const bytes = toZipBytes(input.zipBytes)
    if (bytes === null) return this.installFailure('invalid-zip', 'zipBytes must be a Uint8Array or ArrayBuffer', false)
    if (bytes.byteLength === 0 || bytes.byteLength > CHARACTER_PACK_V2_LIMITS.maxZipBytes) {
      return this.installFailure('invalid-zip', 'zip size must be 1..' + CHARACTER_PACK_V2_LIMITS.maxZipBytes + ' bytes', false)
    }
    let zipSha256: string
    try {
      zipSha256 = await this.hash(bytes)
    } catch (error) {
      return this.installFailure('invalid-request', 'cannot hash zip bytes: ' + messageOf(error), false)
    }
    if (input.expectedZipSha256 !== undefined) {
      const expected = typeof input.expectedZipSha256 === 'string' ? input.expectedZipSha256.toLowerCase() : ''
      if (!SHA256_HEX_PATTERN.test(expected)) {
        return this.installFailure('invalid-request', 'expectedZipSha256 must be 64 lowercase hex chars', false)
      }
      if (expected !== zipSha256) {
        return this.installFailure('zip-hash-mismatch', 'zip sha256 does not match the expected download hash', false)
      }
    }
    this.emit({ type: 'install-started', bytes: bytes.byteLength })
    let read: ContentBundleReadResult
    try {
      read = await this.host.readZip(bytes)
    } catch (error) {
      return this.installFailure('invalid-zip', 'host zip reader failed: ' + messageOf(error), false)
    }
    if (!isPlainRecord(read) || read.ok !== true) {
      const issues = isPlainRecord(read) && Array.isArray(read.issues) ? (read.issues as ContentIssue[]) : undefined
      return this.installFailure('invalid-zip', 'zip reader rejected the bundle', false, issues)
    }
    const bundle = read.bundle as ContentBundle
    const packBytes = bundle.fileMap.get(CHARACTER_PACK_MANIFEST_FILE)
    if (packBytes === undefined) return this.installFailure('invalid-zip', 'zip is missing ' + CHARACTER_PACK_MANIFEST_FILE + ' at the root', false)
    const packText = decodeUtf8(packBytes)
    if (packText === null) return this.installFailure('invalid-pack', 'pack.json is not valid UTF-8', false)
    let rawPack: unknown
    try {
      rawPack = JSON.parse(packText)
    } catch (error) {
      return this.installFailure('invalid-pack', 'pack.json is not valid JSON: ' + messageOf(error), false)
    }
    const validation = validateCharacterPackV2(rawPack)
    if (!validation.ok) {
      const gate = classifyPackIssues(validation.issues)
      return this.installFailure(gate.code, gate.message, false, validation.issues)
    }
    const pack = validation.pack
    // Declared canvas metadata can lie; the IHDR bytes are the real decode cost.
    const frameFiles = [...bundle.fileMap.entries()]
      .filter(([path]) => path.startsWith('assets/anim/'))
      .map(([path, bytes]) => ({ path, bytes }))
    const frameMemory = inspectCharacterPackFrameMemory(pack, frameFiles)
    // Only real decoded bytes are fatal here: a mismatched IHDR canvas is a
    // metadata/renderer concern (legacy fixtures declare 96x96 with 1x1 PNGs),
    // while the memory budget must always fail closed.
    if (frameMemory.issues.some((issue) => issue.code === 'decoded-memory-exceeded')) {
      return this.installFailure('invalid-pack', 'character pack frame pixels exceed the decode memory budget', false, frameMemory.issues)
    }
    if (this.isProtectedPack(pack.id, pack.character.id)) {
      return this.installFailure('builtin-protected', 'built-in characters cannot be replaced by an installed pack', false)
    }
    const current = this.installed.get(pack.id)
    if (current !== undefined && current.characterId !== pack.character.id) {
      return this.installFailure('character-conflict', 'pack id ' + pack.id + ' already maps to character ' + current.characterId, false)
    }
    for (const state of this.installed.values()) {
      if (state.characterId === pack.character.id && state.record.packId !== pack.id) {
        return this.installFailure('character-conflict', 'character ' + pack.character.id + ' is already provided by pack ' + state.record.packId, false)
      }
    }
    let remoteVerification: ContentSignatureVerification | undefined = input.remoteVerification
    if (pack.source === 'remote') {
      if (remoteVerification === undefined && this.options.remote !== undefined) {
        remoteVerification = verifyRemoteCharacterPack(pack, this.options.remote.trustRoot, this.options.remote.verifier, this.options.remote.options)
      }
      if (remoteVerification === undefined || isPlainRecord(remoteVerification) === false || remoteVerification.ok !== true) {
        return this.installFailure('remote-unverified', 'remote packs must pass verifyRemoteCharacterPack() before install', false)
      }
    }
    const planned = planCharacterPackInstall({
      pack,
      inventory: bundle.inventory,
      zipSha256,
      consent,
      ...(current !== undefined ? { installed: current.record } : {}),
      ...(remoteVerification !== undefined ? { remoteVerification } : {}),
    })
    if (!planned.ok) {
      return this.installFailure(runtimeCodeFromPlan(planned.code), planned.message, false, planned.issues)
    }
    const plan = planned.plan
    const written = await this.writeInstallPlan(plan, pack, bundle, current)
    if (!written.ok) {
      return this.installFailure(written.code, written.message, written.rolledBack)
    }
    this.installed.set(pack.id, written.state)
    this.emit({ type: 'install-committed', action: plan.action, state: written.state })
    return { ok: true, action: plan.action, state: written.state, active: this.active }
  }

  private async writeInstallPlan(
    plan: CharacterPackInstallPlan,
    pack: CharacterPackV2,
    bundle: ContentBundle,
    previousState: CharacterPackInstalledState | undefined,
  ): Promise<{ ok: true; state: CharacterPackInstalledState } | { ok: false; code: CharacterPackRuntimeErrorCode; message: string; rolledBack: boolean }> {
    const installRoot = plan.layout.installDir
    const pointerPath = plan.layout.pointerFile
    if (!isSafeRuntimePath(installRoot) || !isSafeRuntimePath(pointerPath)) {
      return { ok: false, code: 'invalid-request', message: 'refusing unsafe install layout path', rolledBack: true }
    }
    if (plan.files.length > plan.writeBudget.maxFiles) {
      return { ok: false, code: 'invalid-request', message: 'install plan exceeds the write file budget', rolledBack: true }
    }
    const inventoryByPath = new Map<string, ContentPackZipEntry>()
    for (const entry of bundle.inventory.entries) {
      if (entry.isDirectory === true) continue
      inventoryByPath.set(entry.path, entry)
    }
    let totalBytes = 0
    const writes: { readonly path: string; readonly bytes: Uint8Array }[] = []
    for (const file of plan.files) {
      if (!isSafeRuntimePath(file.path)) {
        return { ok: false, code: 'invalid-request', message: 'refusing unsafe install file path', rolledBack: true }
      }
      const bytes = bundle.fileMap.get(file.path)
      if (bytes === undefined) {
        return { ok: false, code: 'invalid-zip', message: 'install plan file is missing from the bundle: ' + file.path, rolledBack: true }
      }
      if (bytes.byteLength !== file.bytes || bytes.byteLength > plan.writeBudget.maxFileBytes) {
        return { ok: false, code: 'invalid-zip', message: 'install plan size mismatch for ' + file.path, rolledBack: true }
      }
      totalBytes += bytes.byteLength
      if (totalBytes > plan.writeBudget.maxTotalBytes) {
        return { ok: false, code: 'invalid-zip', message: 'install plan exceeds the total byte budget', rolledBack: true }
      }
      if (file.sha256 !== undefined) {
        const entry = inventoryByPath.get(file.path)
        if (entry === undefined || entry.sha256 !== file.sha256) {
          return { ok: false, code: 'invalid-zip', message: 'install plan hash disagrees with the zip inventory for ' + file.path, rolledBack: true }
        }
      }
      const target = joinRuntimePath(installRoot, file.path)
      if (target === null) {
        return { ok: false, code: 'invalid-request', message: 'refusing unsafe install target path', rolledBack: true }
      }
      writes.push({ path: target, bytes })
    }
    const previous = previousState?.record
    const pointer = buildPointerDocument({
      packId: pack.id,
      version: pack.version,
      zipSha256: plan.zipSha256,
      characterId: pack.character.id,
      kind: pack.kind,
      name: pack.name,
      ...(previous !== undefined ? { previous } : {}),
      now: this.now(),
    })
    let writeError: string | null = null
    try {
      for (const write of writes) await this.host.write(write.path, write.bytes)
      // Pointer commit: every file is on disk, so the new version becomes
      // visible only after this last write. The host writes files atomically.
      await this.host.write(pointerPath, encodeUtf8(JSON.stringify(pointer)))
    } catch (error) {
      writeError = messageOf(error)
    }
    if (writeError !== null) {
      const rolledBack = await this.rollBackPartialInstall(plan, previousState)
      return { ok: false, code: 'host-write-failed', message: 'host write failed: ' + writeError, rolledBack }
    }
    const record = Object.freeze({ packId: pack.id, version: pack.version, zipSha256: plan.zipSha256 })
    const state: CharacterPackInstalledState = Object.freeze({
      record,
      characterId: pack.character.id,
      kind: pack.kind,
      name: pack.name,
      ...(previous !== undefined ? { previous } : {}),
    })
    return { ok: true, state }
  }

  /** Remove an interrupted install and restore the previous pointer. */
  private async rollBackPartialInstall(
    plan: CharacterPackInstallPlan,
    previousState: CharacterPackInstalledState | undefined,
  ): Promise<boolean> {
    let clean = true
    try {
      await this.host.remove(plan.layout.installDir)
    } catch {
      clean = false
    }
    try {
      if (previousState !== undefined) {
        const pointer = buildPointerDocument({
          packId: previousState.record.packId,
          version: previousState.record.version,
          zipSha256: previousState.record.zipSha256,
          characterId: previousState.characterId,
          kind: previousState.kind,
          name: previousState.name,
          ...(previousState.previous !== undefined ? { previous: previousState.previous } : {}),
          now: this.now(),
        })
        await this.host.write(plan.layout.pointerFile, encodeUtf8(JSON.stringify(pointer)))
      } else {
        await this.host.remove(plan.layout.pointerFile)
      }
    } catch {
      clean = false
    }
    return clean
  }

  private installFailure(
    code: CharacterPackRuntimeErrorCode,
    message: string,
    rolledBack: boolean,
    issues?: readonly ContentIssue[],
  ): CharacterPackInstallResult {
    const failure = fail(code, message, { rolledBack, ...(issues !== undefined ? { issues } : {}) })
    this.emit({ type: 'install-failed', code, message, rolledBack })
    return failure
  }

  // -------------------------------------------------------------------------
  // uninstall
  // -------------------------------------------------------------------------

  /** Remove one installed pack tree; an active pack falls back to a built-in. */
  async uninstall(packId: string): Promise<CharacterPackUninstallResult> {
    const busy = this.begin('uninstalling')
    if (busy !== null) return busy
    try {
      return await this.uninstallLocked(packId)
    } finally {
      this.busy = null
    }
  }

  private async uninstallLocked(packId: string): Promise<CharacterPackUninstallResult> {
    if (typeof packId !== 'string' || !CHARACTER_PACK_ID_PATTERN.test(packId) || packId.length > 64) {
      return fail('invalid-request', 'packId must be a lowercase dot/dash separated id')
    }
    const state = this.installed.get(packId)
    if (state === undefined) return this.uninstallFailure(packId, 'not-installed', 'no installed record for ' + packId)
    const planned = planCharacterPackUninstall({ packId, installed: state.record })
    if (!planned.ok) {
      return this.uninstallFailure(packId, runtimeCodeFromPlan(planned.code), planned.message)
    }
    const plan: CharacterPackUninstallPlan = planned.plan
    if (this.active !== null && this.active.packId === packId) {
      const fallback = this.options.defaultCharacterId
      if (fallback === undefined) {
        return this.uninstallFailure(packId, 'active-character-in-use', 'the pack is active; configure defaultCharacterId or enable another character first')
      }
      if (fallback === packId || fallback === state.characterId) {
        return this.uninstallFailure(packId, 'active-character-in-use', 'defaultCharacterId resolves to the pack being uninstalled; configure a different fallback')
      }
      const switched = await this.switchInternal(fallback, {})
      if (!switched.ok) {
        return this.uninstallFailure(packId, 'active-character-in-use', 'cannot uninstall the active character: ' + switched.message)
      }
      if (this.active !== null && this.active.packId === packId) {
        return this.uninstallFailure(packId, 'active-character-in-use', 'fallback character still belongs to the pack being uninstalled')
      }
    }
    try {
      // Pointer first: once it is gone the pack is uninstalled even if the
      // directory cleanup below fails (stale files are inert without pointers).
      await this.host.remove(plan.pointerFile)
    } catch (error) {
      return this.uninstallFailure(packId, 'host-remove-failed', 'host could not remove the pointer: ' + messageOf(error))
    }
    let cleanupWarning: string | undefined
    try {
      await this.host.remove(plan.removeRoot)
    } catch (error) {
      cleanupWarning = 'pack directory cleanup failed: ' + messageOf(error)
      this.emit({ type: 'warning', code: 'uninstall-cleanup', message: cleanupWarning })
    }
    this.installed.delete(packId)
    this.dropCacheForPack(packId)
    this.emit({ type: 'uninstall-committed', packId, version: state.record.version })
    return { ok: true, packId, version: state.record.version, active: this.active, ...(cleanupWarning !== undefined ? { cleanupWarning } : {}) }
  }

  private uninstallFailure(packId: string, code: CharacterPackRuntimeErrorCode, message: string): CharacterPackUninstallResult {
    this.emit({ type: 'uninstall-failed', packId, code, message })
    return fail(code, message)
  }

  // -------------------------------------------------------------------------
  // rollback (explicit previous-version switch)
  // -------------------------------------------------------------------------

  /** Roll one pack back to the version it replaced (single step). */
  async rollback(packId: string): Promise<CharacterPackRollbackResult> {
    const busy = this.begin('rolling-back')
    if (busy !== null) return busy
    try {
      return await this.rollbackLocked(packId)
    } finally {
      this.busy = null
    }
  }

  private async rollbackLocked(packId: string): Promise<CharacterPackRollbackResult> {
    if (typeof packId !== 'string' || !CHARACTER_PACK_ID_PATTERN.test(packId) || packId.length > 64) {
      return fail('invalid-request', 'packId must be a lowercase dot/dash separated id')
    }
    const state = this.installed.get(packId)
    if (state === undefined) return this.rollbackFailure(packId, 'not-installed', 'no installed record for ' + packId)
    const previous = state.previous
    if (previous === undefined) return this.rollbackFailure(packId, 'nothing-to-rollback', 'pack ' + packId + ' has no previous version to roll back to')
    const previousState: CharacterPackInstalledState = Object.freeze({
      record: previous,
      characterId: state.characterId,
      kind: state.kind,
      name: state.name,
    })
    let loaded: LoadedHandles
    try {
      loaded = await this.loadInstalledHandles(previousState)
    } catch (error) {
      return this.rollbackFailure(packId, 'rollback-unavailable', 'previous version cannot be loaded: ' + messageOf(error))
    }
    const layout = characterPackInstallLayoutFor(packId, previous.version)
    if (!isSafeRuntimePath(layout.installDir) || !isSafeRuntimePath(layout.pointerFile)) {
      return this.rollbackFailure(packId, 'invalid-request', 'refusing unsafe rollback layout path')
    }
    const fromVersion = state.record.version
    const pointer = buildPointerDocument({
      packId,
      version: previous.version,
      zipSha256: previous.zipSha256,
      characterId: state.characterId,
      kind: state.kind,
      name: state.name,
      now: this.now(),
    })
    try {
      await this.host.write(layout.pointerFile, encodeUtf8(JSON.stringify(pointer)))
    } catch (error) {
      return this.rollbackFailure(packId, 'host-write-failed', 'host could not commit the rollback pointer: ' + messageOf(error))
    }
    const currentLayout = characterPackInstallLayoutFor(packId, fromVersion)
    let cleanupWarning: string | undefined
    try {
      await this.host.remove(currentLayout.installDir)
    } catch (error) {
      cleanupWarning = 'newer version directory cleanup failed: ' + messageOf(error)
      this.emit({ type: 'warning', code: 'rollback-cleanup', message: cleanupWarning })
    }
    this.cache.delete(versionKey(packId, fromVersion))
    const nextState: CharacterPackInstalledState = Object.freeze({
      record: previous,
      characterId: state.characterId,
      kind: state.kind,
      name: state.name,
    })
    this.installed.set(packId, nextState)
    if (this.active !== null && this.active.packId === packId && this.active.version === fromVersion) {
      const previousActive = this.active
      this.active = this.makeActive(packId, previous.version, state.characterId, state.name, state.kind, false, loaded)
      this.emit({ type: 'character-switched', previous: previousActive, current: this.active })
    }
    this.emit({ type: 'rollback-committed', packId, fromVersion, toVersion: previous.version })
    return {
      ok: true,
      packId,
      fromVersion,
      toVersion: previous.version,
      state: nextState,
      active: this.active,
      ...(cleanupWarning !== undefined ? { cleanupWarning } : {}),
    }
  }

  private rollbackFailure(packId: string, code: CharacterPackRuntimeErrorCode, message: string): CharacterPackRollbackResult {
    this.emit({ type: 'rollback-failed', packId, code, message })
    return fail(code, message)
  }

  // -------------------------------------------------------------------------
  // enable / hot switch
  // -------------------------------------------------------------------------

  /**
   * Enable a built-in or installed character by pack id or character id.
   * Cached handles are reused, so switching back never reloads (and never
   * re-reads the zip). A load/validation failure leaves the old character
   * active and returns its handle in `restored`.
   */
  async enable(target: string, options: CharacterPackEnableOptions = {}): Promise<CharacterPackEnableResult> {
    const busy = this.begin('enabling')
    if (busy !== null) return busy
    try {
      const switched = await this.switchInternal(target, options)
      if (!switched.ok) return switched
      return { ok: true, active: switched.active, reloaded: switched.reloaded }
    } finally {
      this.busy = null
    }
  }

  private async switchInternal(
    target: string,
    options: CharacterPackEnableOptions,
  ): Promise<{ ok: true; active: CharacterPackActiveCharacter; reloaded: boolean } | CharacterPackRuntimeFailure> {
    const resolved = this.resolveTarget(target, options.version)
    if (resolved === null) {
      const failure = fail('character-not-found', 'no built-in or installed character matches "' + String(target).slice(0, 64) + '"', { restored: this.active })
      this.emit({ type: 'character-switch-failed', code: failure.code, message: failure.message, restored: this.active })
      return failure
    }
    const packId = resolved.kind === 'builtin' ? resolved.builtin.packId : resolved.state.record.packId
    const version = resolved.kind === 'builtin' ? resolved.builtin.version : resolved.state.record.version
    if (this.active !== null && this.active.packId === packId && this.active.version === version && options.forceReload !== true) {
      return { ok: true, active: this.active, reloaded: false }
    }
    let loaded: LoadedHandles
    let reloaded = false
    try {
      if (resolved.kind === 'builtin') {
        loaded = { art: resolved.builtin.art, behavior: resolved.builtin.behavior, regions: resolved.builtin.regions }
      } else {
        const hadCache = this.cache.has(versionKey(packId, version))
        loaded = await this.loadInstalledHandles(resolved.state, options.forceReload === true)
        reloaded = options.forceReload === true || !hadCache
      }
    } catch (error) {
      const code = error instanceof CharacterPackLoadError ? error.code : 'load-failed'
      const failure = fail(code, 'character load failed: ' + messageOf(error), { restored: this.active })
      this.emit({ type: 'character-switch-failed', code: failure.code, message: failure.message, restored: this.active })
      return failure
    }
    const previous = this.active
    this.active = this.makeActive(
      packId,
      version,
      resolved.kind === 'builtin' ? resolved.builtin.characterId : resolved.state.characterId,
      resolved.kind === 'builtin' ? resolved.builtin.name : resolved.state.name,
      resolved.kind === 'builtin' ? resolved.builtin.kind : resolved.state.kind,
      resolved.kind === 'builtin',
      loaded,
    )
    this.emit({ type: 'character-switched', previous, current: this.active })
    return { ok: true, active: this.active, reloaded }
  }

  private resolveTarget(target: string, version: string | undefined): ResolvedTarget | null {
    if (typeof target !== 'string' || target.length === 0 || target.length > MAX_TARGET_CHARS) return null
    for (const builtin of this.builtins.values()) {
      if (builtin.packId === target || builtin.characterId === target) {
        if (version === undefined || builtin.version === version) return { kind: 'builtin', builtin }
      }
    }
    const direct = this.installed.get(target)
    if (direct !== undefined && (version === undefined || direct.record.version === version)) {
      return { kind: 'installed', state: direct }
    }
    const matches: CharacterPackInstalledState[] = []
    for (const state of this.installed.values()) {
      if (state.characterId !== target) continue
      if (version !== undefined && state.record.version !== version) continue
      matches.push(state)
    }
    if (matches.length === 0) return null
    matches.sort((left, right) => compareCharacterPackVersions(right.record.version, left.record.version))
    return { kind: 'installed', state: matches[0] as CharacterPackInstalledState }
  }

  private async loadInstalledHandles(state: CharacterPackInstalledState, forceReload = false): Promise<LoadedHandles> {
    const key = versionKey(state.record.packId, state.record.version)
    if (!forceReload) {
      const cached = this.cache.get(key)
      if (cached !== undefined) return cached
    }
    let result: CharacterPackHostLoadResult
    try {
      result = await this.host.loadCharacter({
        packId: state.record.packId,
        version: state.record.version,
        source: 'installed',
      })
    } catch (error) {
      throw new CharacterPackLoadError('load-failed', 'host could not load ' + key + ': ' + messageOf(error))
    }
    if (!isPlainRecord(result) || result.pack === undefined) {
      throw new CharacterPackLoadError('load-failed', 'host returned no pack.json for ' + key)
    }
    const validation = validateCharacterPackV2(result.pack)
    if (!validation.ok) {
      throw new CharacterPackLoadError('load-failed', 'installed pack.json for ' + key + ' is corrupt or tampered')
    }
    const pack = validation.pack
    if (pack.id !== state.record.packId || pack.version !== state.record.version || pack.character.id !== state.characterId) {
      throw new CharacterPackLoadError('load-failed', 'installed pack.json for ' + key + ' does not match the installed record')
    }
    const art = normalizeArtHandle({
      canvas: pack.spec.canvas,
      anchor: pack.spec.anchor,
      footBox: pack.spec.footBox,
      ...(pack.spec.bbox !== undefined ? { bbox: pack.spec.bbox } : {}),
      ...(pack.spec.display !== undefined ? { display: pack.spec.display } : {}),
      palette: pack.spec.palette,
      preview: pack.preview,
      clips: pack.animations.clips,
      framePaths: [...characterPackFramePaths(pack)],
      // Provenance/fallback are copied (never invented) so the renderer
      // adapter can hand hero.ts honest pack metadata and resolve fallback tags.
      license: pack.license.spdx,
      ai: {
        status: pack.aiProvenance.generated ? 'concept' : 'none',
        ...(pack.aiProvenance.tools?.[0] !== undefined ? { tool: pack.aiProvenance.tools[0] as string } : {}),
      },
      ...(pack.character.fallback !== undefined ? { fallback: pack.character.fallback } : {}),
      ...(typeof result.assetBase === 'string' ? { assetBase: result.assetBase } : {}),
      ...(isPlainRecord(result.assetUrls) ? { assetUrls: result.assetUrls as Readonly<Record<string, string>> } : {}),
    }, 'installed ' + key)
    const loaded: LoadedHandles = deepFreeze({ art, behavior: pack.behavior, regions: pack.regions })
    this.cache.set(key, loaded)
    return loaded
  }

  // -------------------------------------------------------------------------
  // refresh / manifest inspection
  // -------------------------------------------------------------------------

  /** Re-read the host installed list (e.g. after another window installed). */
  async refresh(): Promise<{ readonly ok: true; readonly skipped: number } | CharacterPackRuntimeFailure> {
    const busy = this.begin('refreshing')
    if (busy !== null) return busy
    try {
      return await this.refreshLocked(true)
    } finally {
      this.busy = null
    }
  }

  private async refreshLocked(emitEvent: boolean): Promise<{ readonly ok: true; readonly skipped: number } | CharacterPackRuntimeFailure> {
    let raw: readonly CharacterPackInstalledState[]
    try {
      raw = await this.host.listInstalled()
    } catch (error) {
      return fail('host-list-failed', 'host.listInstalled() failed: ' + messageOf(error))
    }
    if (!Array.isArray(raw)) return fail('host-list-failed', 'host.listInstalled() must return an array')
    const next = new Map<string, CharacterPackInstalledState>()
    const characters = new Set<string>()
    let skipped = 0
    for (const item of raw as readonly unknown[]) {
      const state = normalizeInstalledState(item)
      if (state === null) {
        skipped += 1
        continue
      }
      if (this.builtins.has(state.record.packId) || next.has(state.record.packId) || characters.has(state.characterId)) {
        skipped += 1
        continue
      }
      next.set(state.record.packId, state)
      characters.add(state.characterId)
    }
    this.installed.clear()
    for (const [packId, state] of next) this.installed.set(packId, state)
    if (emitEvent) this.emit({ type: 'registry-refreshed', installed: next.size, skipped })
    if (skipped > 0) this.emit({ type: 'warning', code: 'installed-state-skipped', message: skipped + ' malformed/duplicate installed record(s) were ignored' })
    return { ok: true, skipped }
  }

  /**
   * Read + validate a pack manifest through the host text transport. This has
   * NO install side effects; it exists so a future market/preview UI can show
   * declaration/licence/AI gates before asking for bytes + consent.
   */
  async inspectManifest(url: string): Promise<CharacterPackManifestInspection> {
    if (typeof this.host.fetchText !== 'function') return fail('unsupported', 'host does not inject fetchText(); manifest inspection is unavailable')
    if (typeof url !== 'string' || url.length === 0 || url.length > 2048 || CONTROL_CHARS_PATTERN.test(url)) {
      return fail('invalid-request', 'manifest url must be a short non-empty string')
    }
    let text: string
    try {
      text = await this.host.fetchText(url)
    } catch (error) {
      return fail('host-fetch-failed', 'host could not fetch the manifest: ' + messageOf(error))
    }
    if (typeof text !== 'string' || text.length > CHARACTER_PACK_V2_LIMITS.maxPackJsonBytes * 4) {
      return fail('invalid-pack', 'manifest text is missing or exceeds the pack.json budget')
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch (error) {
      return fail('invalid-pack', 'manifest is not valid JSON: ' + messageOf(error))
    }
    const validation = validateCharacterPackV2(raw)
    if (!validation.ok) {
      const gate = classifyPackIssues(validation.issues)
      return fail(gate.code, gate.message, { issues: validation.issues })
    }
    if (this.isProtectedPack(validation.pack.id, validation.pack.character.id)) {
      return fail('builtin-protected', 'built-in characters cannot be replaced by an installed pack')
    }
    return { ok: true, pack: validation.pack }
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private begin(operation: CharacterPackRuntimeOperation): CharacterPackRuntimeFailure | null {
    if (this.busy !== null) {
      return fail('busy', 'another character-pack operation is already running (' + this.busy + ')')
    }
    this.busy = operation
    return null
  }

  private emit(event: CharacterPackRuntimeEvent): void {
    try {
      this.host.emit(event)
    } catch {
      // Telemetry must never break a state transition.
    }
  }

  private now(): number {
    return this.options.now !== undefined ? this.options.now() : Date.now()
  }

  private async hash(bytes: Uint8Array): Promise<string> {
    const implementation = this.options.sha256 !== undefined ? this.options.sha256 : sha256Hex
    return implementation(bytes)
  }

  private isProtectedPack(packId: string, characterId: string): boolean {
    if (packId === 'famling' || packId.startsWith('famling.') || packId.startsWith('famling-')) return true
    if (characterId === 'famling' || characterId.startsWith('famling.') || characterId.startsWith('famling-')) return true
    for (const builtin of this.builtins.values()) {
      if (builtin.packId === packId || builtin.characterId === characterId) return true
    }
    return false
  }

  private makeActive(
    packId: string,
    version: string,
    characterId: string,
    name: string,
    kind: CharacterPackKind,
    builtin: boolean,
    loaded: LoadedHandles,
  ): CharacterPackActiveCharacter {
    return deepFreeze({
      packId,
      version,
      characterId,
      name,
      kind,
      builtin,
      enabledAt: this.now(),
      art: loaded.art,
      behavior: loaded.behavior,
      regions: loaded.regions,
    })
  }

  private dropCacheForPack(packId: string): void {
    const prefix = packId + '@'
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) this.cache.delete(key)
    }
  }
}

// ---------------------------------------------------------------------------
// Module-level validators
// ---------------------------------------------------------------------------

function normalizeBuiltins(raw: readonly CharacterPackBuiltin[] | undefined): ReadonlyMap<string, CharacterPackBuiltin> {
  const map = new Map<string, CharacterPackBuiltin>()
  if (raw === undefined) return map
  if (!Array.isArray(raw)) throw new TypeError('CharacterPackRuntime.open: builtins must be an array')
  const characters = new Set<string>()
  for (const item of raw) {
    const builtin = defineBuiltinCharacter(item)
    if (map.has(builtin.packId)) throw new TypeError('CharacterPackRuntime.open: duplicate built-in packId ' + builtin.packId)
    if (characters.has(builtin.characterId)) throw new TypeError('CharacterPackRuntime.open: duplicate built-in characterId ' + builtin.characterId)
    map.set(builtin.packId, builtin)
    characters.add(builtin.characterId)
  }
  return map
}

function toZipBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return null
}

function assertRuntimeHost(host: unknown): asserts host is CharacterPackRuntimeHost {
  if (!isPlainRecord(host)) throw new TypeError('CharacterPackRuntime.open: host must be an object')
  for (const method of ['readZip', 'listInstalled', 'write', 'remove', 'loadCharacter', 'emit'] as const) {
    if (typeof host[method] !== 'function') throw new TypeError('CharacterPackRuntime.open: host.' + method + '() is required')
  }
  if (host.fetchText !== undefined && typeof host.fetchText !== 'function') {
    throw new TypeError('CharacterPackRuntime.open: host.fetchText must be a function when present')
  }
}

