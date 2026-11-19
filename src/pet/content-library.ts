/**
 * Content library / theme market shared core for famling + dsh-famling.
 *
 * v2 (2026-11-19) product clarification: the theme is the ROLE, not the
 * bubble/background/font. The primary catalog unit is now a **character theme**
 * ("角色主题"): one entry that bundles character + voice + dialogue + appearance
 * (theme/background/font) + optional behaviour. The user can apply one
 * character theme in a single action, then customise individual components or
 * import a derived/third-party character theme. The six component categories
 * (characters / voices / dialoguePacks / themes / backgrounds / fonts) stay in
 * the catalog as the optional building blocks behind those bundles.
 *
 * Schemas:
 * - built-in catalog: `famling.content/0.2` (canonical; `0.1` is a deprecated
 *   adapter that still parses and yields empty rolePresets/characterThemes);
 * - third-party packs: `famling.content-pack/0.2` (zip asset bundle or JSON
 *   manifest; mandatory unified usage declaration + licence + AI provenance +
 *   sha256 files). The v1 `famling.content-pack/0.1` API is kept as a
 *   deprecated adapter and is NOT deleted.
 *
 * This module is the single, versioned data model behind the future
 * "内容中心 / 主题市场" (content center / theme market) in both products:
 *
 * - famling (standalone Tauri pet app): applies theme/background/font tokens to
 *   the pet document and owns characters/voice/dialogue selection.
 * - dsh-famling (DSH plugin): mirrors the same catalog into the settings panel
 *   and maps a subset onto its own character/theme storage.
 *
 * It is intentionally PURE: no DOM lifecycle, no listeners, no timers, no
 * network, no filesystem, no node:* imports. The only DOM-looking helper is
 * \`applyAppearance()\`, which receives an injectable document-like object and
 * writes CSS custom properties + \`data-content-*\` attributes once; the caller
 * owns the document. The only storage helper is the existing safe-storage
 * wrapper (injectable StorageLike; localStorage is never touched in Node).
 *
 * Security boundary (0.2):
 * - catalog + packs are declarative JSON only; no scripts, no HTML, no URLs are
 *   fetched by this module;
 * - every text field is plain text (no "<" / ">"), bounded, no control/bidi
 *   characters;
 * - every path is relative and canonical (no "..", absolute/UNC/drive/ADS);
 * - every theme color/shadow/pattern/font value is a strict CSS token that
 *   cannot smuggle \`url(...)\`, \`@import\`, \`var(...)\` or a declaration break;
 * - every character theme and v2 pack MUST carry the unified usage declaration
 *   (researchOnly + six prohibited uses + canonical legal sentence);
 * - v2 zip bundles are validated through an injected inventory (paths, sizes,
 *   allowed asset types, sha256); no archive bytes are parsed here;
 * - `famling.pet-anim/0.2` (third-party character animation packs) shares the
 *   same envelope/sha256/zip caps but is a separate payload schema; its
 *   loader/registry/installer are NOT implemented here (spec + pure validation
 *   + install PLAN only);
 * - remote packs/catalogs are refused unless structurally signed AND verified
 *   through the injected Ed25519 verifier + trust root; unverified = fail-closed.
 *
 * Remote market data shapes are contracts only: nothing in this module fetches,
 * installs or signs anything on the network (see public/content/README.md).
 */

import { canonicalJson } from '../pack/canonical.ts'
import { CANVAS_SIZE_ALIGNMENT, CANVAS_SIZE_MAX, CANVAS_SIZE_MIN } from './pixel-scale.ts'
import { CLIP_IDS, type ClipCategory, type ClipId, type ClipLayer } from './anim/types.ts'
import { parseHeroRegionConfig, type HeroRegionConfig } from './anim/regions.ts'
import { validateBehaviorProfile } from './character/validate.ts'
import type { BehaviorProfile } from './character/types.ts'
import { countCodePoints, stripBidiControls, stripControlChars, SECURITY_LIMITS } from './security/limits.ts'
import { checkRelativePath } from './security/path-safety.ts'
import { toPlainText } from './security/html.ts'
import {
  readVersioned,
  removeKey,
  writeVersioned,
  type StorageLike,
  type StorageWriteStatus,
} from './security/safe-storage.ts'

// ---------------------------------------------------------------------------
// Schema + categories
// ---------------------------------------------------------------------------

/** Legacy (v1) catalog schema. Parsed through a deprecated adapter only. */
export const CONTENT_LIBRARY_SCHEMA_V1 = 'famling.content/0.1'
/** v2 canonical catalog schema: role/character themes are the primary entry. */
export const CONTENT_LIBRARY_SCHEMA_V2 = 'famling.content/0.2'
/**
 * Schema id of the built-in catalog document (public/content/library.json).
 *
 * Kept under the historical export name for existing consumers; the value is
 * the v2 schema. `CONTENT_LIBRARY_SCHEMA_V1` is the deprecated v1 value.
 */
export const CONTENT_LIBRARY_SCHEMA = CONTENT_LIBRARY_SCHEMA_V2
/** Legacy (v1) content-pack schema; kept for the deprecated v1 adapter. */
export const CONTENT_PACK_SCHEMA_V1 = 'famling.content-pack/0.1'
/** @deprecated Use `CONTENT_PACK_SCHEMA_V2` for new packs. Kept for the v1 adapter. */
export const CONTENT_PACK_SCHEMA = CONTENT_PACK_SCHEMA_V1
/** v2 content-pack schema: role-theme bundle + usage declaration + zip assets. */
export const CONTENT_PACK_SCHEMA_V2 = 'famling.content-pack/0.2'

/** The six catalog categories. Order is stable (menu/render order). */
export const CONTENT_CATEGORIES = ['characters', 'voices', 'dialoguePacks', 'themes', 'backgrounds', 'fonts'] as const
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number]

export const CONTENT_SOURCES = ['builtin', 'local', 'remote'] as const
export type ContentSource = (typeof CONTENT_SOURCES)[number]

export const CHARACTER_KINDS = ['dog', 'cat', 'humanoid', 'origami'] as const
export type CharacterKind = (typeof CHARACTER_KINDS)[number]

export const VOICE_MODES = ['tts', 'none'] as const
export type VoiceMode = (typeof VOICE_MODES)[number]

export const BUBBLE_SEMANTICS = ['speech', 'thought'] as const
export type BubbleSemantic = (typeof BUBBLE_SEMANTICS)[number]

export const DIALOGUE_MODES = ['standard', 'brief', 'quiet', 'custom'] as const
export type DialogueMode = (typeof DIALOGUE_MODES)[number]

export const BACKGROUND_KINDS = ['transparent', 'color', 'pattern'] as const
export type BackgroundKind = (typeof BACKGROUND_KINDS)[number]

export const CONTENT_PRODUCTS = ['famling', 'dsh-famling'] as const
export type ContentProductId = (typeof CONTENT_PRODUCTS)[number]

/** Hard bounds shared with validators/tests. Small numbers keep packs reviewable. */
export const CONTENT_LIMITS = Object.freeze({
  maxEntriesPerCategory: 64,
  maxPacksPerMerge: 64,
  maxPackEntries: 64,
  maxPackFiles: 128,
  maxNameChars: 48,
  maxDescriptionChars: 280,
  maxSaysLines: 12,
  maxSaysOverrides: 32,
  maxOverridesKeyChars: 64,
  maxLicenseAttributionChars: 200,
  maxAiDisclosureChars: 280,
  maxPackTextChars: 6000,
  maxPreviewChars: 160,
  maxFontFamilyChars: 200,
  maxBackgroundValueChars: 300,
  maxFileBytes: 8 * 1024 * 1024,
  maxPackBytes: 32 * 1024 * 1024,
  maxPackJsonBytes: 256 * 1024,
  maxSelectionBytes: 2048,
  maxRemoteUrlChars: 512,
})

/** Extensions a declarative 0.1 pack may reference. No executables/fonts/HTML. */
export const CONTENT_FILE_EXTENSIONS = ['png', 'webp', 'json', 'md', 'txt', 'wav', 'ogg'] as const

/**
 * Canonical unified use declaration (exact copy of the short sentence in
 * docs/legal/USE-RESTRICTIONS-2026-11-19.md §1). Every character theme and
 * every v2 content pack MUST carry this exact text; the UI MUST show it and ask
 * for explicit confirmation before importing/activating third-party content.
 * Do not edit this string without bumping the legal document and its hash.
 */
export const CONTENT_USAGE_STATEMENT =
  '本项目及其全部代码、美术、音频、文案、角色素材和衍生物仅用于技术研究与原型验证，不得用于情感陪伴、虚拟伴侣、心理治疗/医疗/法律/金融建议、未成年人亲密关系、冒充真人/官方，或任何违反法律法规/平台规则的用途。'
/** UTF-8 SHA-256 of CONTENT_USAGE_STATEMENT (matches USE-RESTRICTIONS §1). */
export const CONTENT_USAGE_STATEMENT_SHA256 = '0353536cefd702014b12a8365c4a486f19848d049652e9692027216adb80c743'
/** Canonical legal document this declaration points at. */
export const CONTENT_USAGE_STATEMENT_REF = 'docs/legal/USE-RESTRICTIONS-2026-11-19.md'
/** UI contract: third-party import/activation requires explicit user confirmation. */
export const CONTENT_USAGE_CONFIRMATION_REQUIRED = true

/**
 * Mandatory prohibited-use ids for every declaration. Order is canonical and
 * mirrors USE-RESTRICTIONS §4.1–§4.6 (emotional companionship / virtual partner
 * / professional advice / minor intimacy / impersonation / illegal use).
 */
export const PROHIBITED_USES = [
  'emotional-companionship',
  'virtual-partner',
  'professional-advice',
  'minor-intimacy',
  'impersonation',
  'illegal-use',
] as const
export type ProhibitedUse = (typeof PROHIBITED_USES)[number]

/**
 * v2 pack security limits. Zip bundles are capped before and after inflation
 * (the host unzips; this module only validates the inventory it is given).
 */
export const CONTENT_PACK_V2_LIMITS = Object.freeze({
  maxRoleThemesPerPack: 8,
  maxComponentsPerCategory: 64,
  maxPackFiles: 128,
  maxZipBytes: 16 * 1024 * 1024,
  maxZipEntries: 256,
  maxAssetBytes: 8 * 1024 * 1024,
  maxTotalUncompressedBytes: 32 * 1024 * 1024,
  maxCompressionRatio: 128,
  maxPackJsonBytes: 256 * 1024,
  maxPreviewChars: 160,
  maxDesignRefChars: 160,
  maxAuthorChars: 80,
  maxAiTools: 8,
  maxAiToolChars: 48,
  maxMarketPacks: 256,
  maxMarketJsonBytes: 1024 * 1024,
  maxMarketDescriptionChars: 280,
})

/** Asset types a v2 zip pack may contain under assets/. No scripts/HTML/SVG. */
export const CONTENT_PACK_V2_ASSET_EXTENSIONS = ['png', 'webp', 'json', 'woff2'] as const
/** Root-level human-readable docs a v2 zip pack may contain (outside assets/). */
export const CONTENT_PACK_V2_DOC_FILES = ['LICENSE.md', 'NOTICE.md', 'README.md', 'DESIGN.md'] as const

// ---------------------------------------------------------------------------
// Types: catalog entries
// ---------------------------------------------------------------------------

/** Reserved remote-market signature metadata (never verified here). */
export interface ContentRemoteSignature {
  readonly algorithm: 'ed25519'
  readonly keyId: string
  /** Detached signature, base64url/hex-ish text. Metadata only in 0.1. */
  readonly value: string
}

/** Reserved remote-market origin. No fetch/network happens in this module. */
export interface ContentRemoteOrigin {
  readonly marketId: string
  readonly version: string
  /** Informational HTTPS URL of the market listing; never fetched by 0.1 code. */
  readonly url?: string
  readonly signature?: ContentRemoteSignature
}

export interface ContentEntryBase {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly source: ContentSource
  readonly available: boolean
  readonly remote?: ContentRemoteOrigin
}

export interface ContentCharacterEntry extends ContentEntryBase {
  readonly kind: CharacterKind
  /** Local preview image path, root-relative ("/assets/..."). */
  readonly preview: string
  /** Only "tts" presentations may use a voice; cats/dogs are always silent. */
  readonly voiceMode: VoiceMode
  readonly bubbleSemantic: BubbleSemantic
  /** public/characters/<dir> pack directory when the character ships one. */
  readonly characterDir?: string
  /** Which products can show this character. */
  readonly products?: readonly ContentProductId[]
}

export interface ContentVoiceEntry extends ContentEntryBase {
  /** Provider voice id (DeepSeek "stella" / "tide"). */
  readonly voiceId: string
  readonly languages: readonly string[]
  /** Character ids this voice is allowed for (human presentations only). */
  readonly availableFor: readonly string[]
  readonly provider: string
  readonly aiGenerated: boolean
}

export interface ContentDialoguePackEntry extends ContentEntryBase {
  readonly mode: DialogueMode
  /** Probability for AUTOMATIC bubbles; explicit interaction bubbles may still show. */
  readonly bubbleChance: number
  readonly maxChars: number
  /** Reserved per-key line overrides; built-in packs deliberately omit it. */
  readonly saysOverrides?: Readonly<Record<string, readonly string[]>>
}

export interface ContentThemeVars {
  readonly bubbleBg: string
  readonly bubbleFg: string
  readonly bubbleBorder: string
  readonly bubbleShadow: string
  readonly panelBg?: string
  readonly panelFg?: string
  readonly bg?: string
}

export interface ContentThemeEntry extends ContentEntryBase {
  readonly vars: ContentThemeVars
}

export interface ContentBackgroundEntry extends ContentEntryBase {
  readonly kind: BackgroundKind
  /** Safe CSS token: "transparent", a color, or a local gradient pattern. */
  readonly value: string
}

export interface ContentFontEntry extends ContentEntryBase {
  /** Local-only font stack (never a network font). */
  readonly family: string
}

export type ContentEntry =
  | ContentCharacterEntry
  | ContentVoiceEntry
  | ContentDialoguePackEntry
  | ContentThemeEntry
  | ContentBackgroundEntry
  | ContentFontEntry

/** Persisted user choices; each value is a catalog entry id. */
export interface ContentSelection {
  readonly character: string
  readonly voice: string
  readonly dialoguePack: string
  readonly theme: string
  readonly background: string
  readonly font: string
}

export type SelectionKey = keyof ContentSelection
export const SELECTION_KEYS = ['character', 'voice', 'dialoguePack', 'theme', 'background', 'font'] as const

/** Selection key -> catalog category. */
export const CONTENT_SELECTION_CATEGORY: Readonly<Record<SelectionKey, ContentCategory>> = Object.freeze({
  character: 'characters',
  voice: 'voices',
  dialoguePack: 'dialoguePacks',
  theme: 'themes',
  background: 'backgrounds',
  font: 'fonts',
})

/** The versioned catalog document (public/content/library.json). */
export interface ContentLibrary {
  readonly schema: typeof CONTENT_LIBRARY_SCHEMA
  readonly version: string
  readonly updatedAt: string
  /** Six-component default selection (still the persistence layer of the UI). */
  readonly defaults: ContentSelection
  /** Default one-click character theme id (optional). */
  readonly defaultRoleTheme?: string
  /** Built-in one-click character themes ("角色就是主题"). */
  readonly rolePresets: readonly ContentCharacterTheme[]
  /** Installed/derived character themes (from v2 packs or user derivation). */
  readonly characterThemes: readonly ContentCharacterTheme[]
  readonly characters: readonly ContentCharacterEntry[]
  readonly voices: readonly ContentVoiceEntry[]
  readonly dialoguePacks: readonly ContentDialoguePackEntry[]
  readonly themes: readonly ContentThemeEntry[]
  readonly backgrounds: readonly ContentBackgroundEntry[]
  readonly fonts: readonly ContentFontEntry[]
  /** True when this normalized view was produced from a deprecated v1 document. */
  readonly legacy?: boolean
}

// ---------------------------------------------------------------------------
// Types: third-party packs
// ---------------------------------------------------------------------------

export interface ContentPackLicense {
  /** SPDX-style id, e.g. "CC-BY-4.0". Human review still required by 0.1. */
  readonly spdx: string
  readonly attribution: string
  /** Informational licence URL (HTTPS only; never fetched). */
  readonly url?: string
  /** Relative path of a bundled LICENCE/NOTICE text file. */
  readonly file?: string
}

export interface ContentPackCompatibility {
  readonly library: string
  readonly minAppVersion?: string
  readonly maxAppVersion?: string
}

/** Closed safety declarations: every field must be the safe literal. */
export interface ContentPackBoundaries {
  readonly network: false
  readonly scripts: false
  readonly html: false
  readonly externalResources: false
  readonly paths: 'relative-only'
  readonly maxTextChars: number
  readonly maxEntries: number
}

export interface ContentPackAi {
  readonly generated: boolean
  /** Mandatory human-readable AI disclosure (rendered as text, never HTML). */
  readonly disclosure: string
}

export interface ContentPackFile {
  readonly path: string
  readonly bytes?: number
  readonly sha256?: string
}

export interface ContentPack {
  readonly schema: typeof CONTENT_PACK_SCHEMA
  readonly id: string
  readonly name: string
  readonly version: string
  readonly category: ContentCategory
  readonly description: string
  readonly license: ContentPackLicense
  readonly compatibility: ContentPackCompatibility
  readonly boundaries: ContentPackBoundaries
  readonly ai: ContentPackAi
  readonly entries: readonly ContentEntry[]
  readonly files?: readonly ContentPackFile[]
  readonly createdAt?: string
}

export type ContentIssueCode =
  | 'invalid-type'
  | 'missing-field'
  | 'unknown-field'
  | 'invalid-schema'
  | 'invalid-id'
  | 'reserved-id'
  | 'duplicate-id'
  | 'unknown-category'
  | 'invalid-text'
  | 'text-too-long'
  | 'markup-text'
  | 'invalid-path'
  | 'unsafe-path'
  | 'invalid-color'
  | 'unsafe-css'
  | 'invalid-font-family'
  | 'invalid-number'
  | 'out-of-range'
  | 'unknown-reference'
  | 'unavailable'
  | 'invalid-license'
  | 'missing-ai-disclosure'
  | 'invalid-boundary'
  | 'incompatible'
  | 'too-many-entries'
  | 'too-many-files'
  | 'too-large'
  | 'invalid-version'
  | 'invalid-remote'
  | 'invalid-defaults'
  | 'invalid-pack'
  | 'builtin-shadow'
  | 'duplicate-installed'
  | 'duplicate-pack-id'
  | 'incompatible-pack'
  // v2: unified use declaration / AI provenance / role themes
  | 'missing-usage-declaration'
  | 'invalid-usage-declaration'
  | 'usage-statement-mismatch'
  | 'invalid-prohibited-use'
  | 'missing-prohibited-use'
  | 'missing-ai-provenance'
  // v2: zip bundle inventory
  | 'invalid-zip'
  | 'unsafe-zip-entry'
  | 'forbidden-asset-type'
  | 'missing-file'
  | 'unlisted-file'
  | 'file-size-mismatch'
  | 'hash-mismatch'
  | 'zip-too-large'
  // v2: role themes / remote market cryptography
  | 'invalid-role-theme'
  | 'missing-signature'
  | 'invalid-signature'
  | 'unknown-signing-key'
  | 'revoked-signing-key'
  | 'key-outside-validity'
  | 'invalid-market-catalog'
  | 'unverified-remote'
  | 'missing-references'
  // pet-anim 0.2: character animation asset packs (spec layer)
  | 'invalid-anim-pack'
  | 'invalid-anim-spec'
  | 'invalid-anim-clip'
  | 'invalid-character'
  | 'invalid-voice'
  | 'invalid-audio'
  | 'audio-rights-unconfirmed'
  | 'invalid-behavior'
  | 'invalid-region'
  | 'missing-preview'

export interface ContentIssue {
  /** JSON-ish location, e.g. "$.themes[0].vars.bubbleBg". */
  readonly path: string
  readonly code: ContentIssueCode
  readonly message: string
}

/** Thrown by the strict parser; carries every issue instead of only the first. */
export class ContentLibraryError extends Error {
  readonly issues: readonly ContentIssue[]

  constructor(message: string, issues: readonly ContentIssue[]) {
    const first = issues[0]
    super(first ? message + ' (' + first.path + ': ' + first.code + ': ' + first.message + ')' : message)
    this.name = 'ContentLibraryError'
    this.issues = issues
  }
}

export type ContentPackValidation =
  | { readonly ok: true; readonly pack: ContentPack }
  | { readonly ok: false; readonly issues: readonly ContentIssue[] }

// ---------------------------------------------------------------------------
// v2 types: unified usage declaration + AI provenance
// ---------------------------------------------------------------------------

/**
 * Mandatory unified use declaration. `statement` must equal the canonical
 * short sentence of docs/legal/USE-RESTRICTIONS-2026-11-19.md §1 and
 * `prohibitedUses` must contain the six canonical red lines.
 */
export interface ContentUsageDeclaration {
  readonly researchOnly: true
  readonly statement: typeof CONTENT_USAGE_STATEMENT
  readonly statementRef: typeof CONTENT_USAGE_STATEMENT_REF
  readonly prohibitedUses: readonly ProhibitedUse[]
}

/** AI/automation provenance for one theme or pack (honest either way). */
export interface ContentAiProvenance {
  readonly generated: boolean
  /** Mandatory human-readable disclosure, rendered as plain text. */
  readonly disclosure: string
  /** Optional tool ids (e.g. "deepseek-image"), metadata only. */
  readonly tools?: readonly string[]
}

// ---------------------------------------------------------------------------
// v2 types: character themes ("角色就是主题") - the primary catalog unit
// ---------------------------------------------------------------------------

/** Six-component appearance chosen by one character theme. */
export interface ContentRoleAppearance {
  readonly themeId: string
  readonly backgroundId: string
  readonly fontId: string
}

/**
 * One character theme: applying it switches the whole role in one action
 * (character look + voice + dialogue + behaviour + appearance tokens).
 * Components remain separate catalog entries so users can override any of
 * them after applying the bundle.
 */
export interface ContentCharacterTheme {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly characterId: string
  /** A voice catalog id, or "none" for silent characters (cat/dog). */
  readonly voiceId: string
  readonly dialoguePackId: string
  readonly appearance: ContentRoleAppearance
  /** Optional behaviour pack directory/id (public/characters/<dir>). */
  readonly behaviorPreset?: string
  /** Local preview image (built-in: root-relative; pack: pack-relative). */
  readonly preview: string
  /** Design/reference doc for third-party authors (relative .md path). */
  readonly designRef: string
  readonly usageDeclaration: ContentUsageDeclaration
  readonly version: string
  readonly source: ContentSource
  readonly author: string
  readonly license: ContentPackLicense
  readonly aiProvenance: ContentAiProvenance
}

/** Alias used by the v2 work order; identical to ContentCharacterTheme. */
export type ContentRolePreset = ContentCharacterTheme

// ---------------------------------------------------------------------------
// v2 types: third-party content packs (famling.content-pack/0.2)
// ---------------------------------------------------------------------------

/** A v2 pack file entry: size + sha256 are mandatory. */
export interface ContentPackFileV2 {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}

/** Optional six-component overrides bundled with a character-theme pack. */
export interface ContentPackComponents {
  readonly characters?: readonly ContentCharacterEntry[]
  readonly voices?: readonly ContentVoiceEntry[]
  readonly dialoguePacks?: readonly ContentDialoguePackEntry[]
  readonly themes?: readonly ContentThemeEntry[]
  readonly backgrounds?: readonly ContentBackgroundEntry[]
  readonly fonts?: readonly ContentFontEntry[]
}

export type ContentPackSource = 'local' | 'remote'

/** One validated `famling.content-pack/0.2` document (pack.json manifest). */
export interface ContentPackV2 {
  readonly schema: typeof CONTENT_PACK_SCHEMA_V2
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly usageDeclaration: ContentUsageDeclaration
  readonly license: ContentPackLicense
  readonly aiProvenance: ContentAiProvenance
  readonly compatibility: ContentPackCompatibility
  /** One-click character themes shipped by this pack (1..8). */
  readonly roleThemes: readonly ContentCharacterTheme[]
  /** Optional component overrides used for customisation/derivation. */
  readonly components?: ContentPackComponents
  /** Asset inventory; every entry has bytes + sha256. */
  readonly files: readonly ContentPackFileV2[]
  /** Optional bundle preview path (must be listed in files). */
  readonly preview?: string
  /** Local packs need no signature; remote packs are rejected unless signed. */
  readonly source: ContentPackSource
  readonly remote?: ContentRemoteOrigin
  readonly createdAt?: string
}

export type ContentPackV2Validation =
  | { readonly ok: true; readonly pack: ContentPackV2 }
  | { readonly ok: false; readonly issues: readonly ContentIssue[] }

// ---------------------------------------------------------------------------
// v2 types: zip bundle inventory (the host unzips + hashes; this module validates)
// ---------------------------------------------------------------------------

/**
 * One file recorded in a zip bundle inventory. The host (Node/main or a future
 * installer) MUST unzip the archive and compute the sha256 of every file; this
 * pure module never touches bytes or the network.
 */
export interface ContentPackZipEntry {
  readonly path: string
  /** Uncompressed size in bytes. */
  readonly bytes: number
  /** Compressed size as stored in the zip (optional, used for bomb ratio). */
  readonly compressedBytes?: number
  /** Lowercase hex sha256 computed by the host for file entries. */
  readonly sha256?: string
  readonly isDirectory?: boolean
}

export interface ContentPackZipInventory {
  /** Size of the .zip file itself in bytes. */
  readonly bytes: number
  readonly entries: readonly ContentPackZipEntry[]
}

export type ContentPackZipValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ContentIssue[] }

// ---------------------------------------------------------------------------
// v2 types: remote market catalog + Ed25519 signature verification contract
// ---------------------------------------------------------------------------

/** Schema id of the remote market catalog (metadata only; never fetched here). */
export const CONTENT_MARKET_CATALOG_SCHEMA = 'famling.market-catalog/0.1'

export interface ContentMarketSignature {
  readonly algorithm: 'ed25519'
  readonly keyId: string
  /** Detached base64 signature over the canonical payload (see payload helpers). */
  readonly value: string
}

export interface ContentMarketDownload {
  /** Credential-free HTTPS URL of the .zip bundle (metadata only). */
  readonly url: string
  /** SHA-256 of the downloaded .zip; required before any install. */
  readonly zipSha256: string
  readonly bytes: number
}

export interface ContentMarketPack {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
  /** Optional preview URL for the listing (informational, never fetched here). */
  readonly preview?: string
  /** Shown by the UI before download/import; import still requires confirmation. */
  readonly usageDeclaration: ContentUsageDeclaration
  readonly download: ContentMarketDownload
  /** Ed25519 signature over marketPackSignaturePayload(pack). */
  readonly signature: ContentMarketSignature
}

/** Remote market catalog document (version + packs + detached Ed25519 signature). */
export interface ContentMarketCatalog {
  readonly schema: typeof CONTENT_MARKET_CATALOG_SCHEMA
  readonly version: string
  readonly updatedAt: string
  /** Key id of the key that signed the catalog. */
  readonly keyId: string
  /** Ed25519 signature over marketCatalogSignaturePayload(catalog). */
  readonly signature: ContentMarketSignature
  readonly packs: readonly ContentMarketPack[]
}

export type ContentMarketCatalogValidation =
  | { readonly ok: true; readonly catalog: ContentMarketCatalog }
  | { readonly ok: false; readonly issues: readonly ContentIssue[] }

/** Trust-root key record; mirrors the DLC signing trust root semantics. */
export type ContentSigningKeyStatus = 'active' | 'retired' | 'revoked'

export interface ContentSigningKey {
  readonly keyId: string
  readonly algorithm: 'ed25519'
  /** SPKI PEM public key. */
  readonly publicKeyPem: string
  /** Optional SPKI DER SHA-256 fingerprint (lowercase hex). */
  readonly fingerprintSha256?: string
  readonly status: ContentSigningKeyStatus
  /** Inclusive validity window (YYYY-MM-DD, UTC). */
  readonly notBefore?: string
  readonly notAfter?: string
}

export interface ContentTrustRoot {
  readonly keys: readonly ContentSigningKey[]
}

/** Injectable Ed25519 verifier: Node can use node:crypto, browser WebCrypto. */
export interface ContentEd25519Verifier {
  verify(message: Uint8Array, signatureBase64: string, publicKeyPem: string): boolean
}

export type ContentSignatureFailureCode =
  | 'missing-signature'
  | 'invalid-signature'
  | 'unknown-signing-key'
  | 'revoked-signing-key'
  | 'key-outside-validity'
  | 'hash-mismatch'
  | 'invalid-market-catalog'

export type ContentSignatureVerification =
  | { readonly ok: true; readonly keyId: string; readonly status: ContentSigningKeyStatus }
  | { readonly ok: false; readonly code: ContentSignatureFailureCode; readonly message: string }

// ---------------------------------------------------------------------------
// Small validation utilities (pure, exported where useful to UI/tests)
// ---------------------------------------------------------------------------

const MAX_ISSUE_MESSAGE_CHARS = 160
const SEMVER_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
const ENTRY_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const PACK_ID_PATTERN = /^[a-z0-9][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const OVERRIDE_KEY_PATTERN = /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9-]*){1,3}$/
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/
const PROVIDER_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const SPDX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.+-]{1,63}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const REMOTE_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SIGNATURE_VALUE_PATTERN = /^[A-Za-z0-9+/=_-]{16,2048}$/
const VALIDATION_VALUE_PATTERN = /^[A-Za-z0-9+/=_-]{16,4096}$/
const BEHAVIOR_PRESET_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/
const AI_TOOL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,47}$/
const ROOT_PACK_DOC_PATTERN = /^(?:LICENSE|NOTICE|README|DESIGN)\.md$/
const ISO_DATE_TIME_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}(?:T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z)?$/

const SAFE_NAMED_COLORS = new Set([
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
  'black',
  'white',
  'red',
  'green',
  'blue',
  'gray',
  'grey',
  'silver',
  'maroon',
  'olive',
  'lime',
  'aqua',
  'teal',
  'navy',
  'fuchsia',
  'purple',
  'orange',
  'yellow',
  'gold',
  'pink',
])

const SAFE_GENERIC_FONTS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
])

const SAFE_GRADIENT_FUNCTIONS = new Set([
  'linear-gradient',
  'repeating-linear-gradient',
  'radial-gradient',
  'repeating-radial-gradient',
  'conic-gradient',
  'repeating-conic-gradient',
  'rgb',
  'rgba',
  'hsl',
  'hsla',
])

const CONTROL_TEST = /[\u0000-\u001f\u007f-\u009f]/
const MARKUP_TEST = /[<>]/
const SOURCE_SCHEME_TEST = /^[A-Za-z][A-Za-z0-9+.-]*:/

function addIssue(issues: ContentIssue[], path: string, code: ContentIssueCode, message: string): void {
  const clean = message.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, MAX_ISSUE_MESSAGE_CHARS)
  issues.push({ path, code, message: clean })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

function failSummary(prefix: string, issues: readonly ContentIssue[]): string {
  return prefix + ': ' + issues.length + ' issue(s)'
}

/** True for a single safe CSS color token (hex / rgb()/hsl() / short allowlist). */
export function isSafeCssColor(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const text = value.trim()
  if (!text || text.length > 80) return false
  if (CONTROL_TEST.test(text) || MARKUP_TEST.test(text)) return false
  if (text.includes(';') || text.includes('{') || text.includes('}') || text.includes('\\')) return false
  if (SAFE_NAMED_COLORS.has(text.toLowerCase())) return true
  if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(text)) return true
  const match = /^(?:rgb|rgba|hsl|hsla)\(([^()]*)\)$/i.exec(text)
  if (!match) return false
  const rawArgs = match[1] ?? ''
  const args = rawArgs.split(',').map((part) => part.trim())
  if (args.length !== 3 && args.length !== 4) return false
  return args.every((part) => /^[-+]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:%|deg)?$/.test(part))
}

/** True for a bounded CSS box-shadow list with no url()/expression()/declaration break. */
export function isSafeCssShadow(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const text = value.trim()
  if (!text || text.length > 120) return false
  if (text === 'none') return true
  if (CONTROL_TEST.test(text) || MARKUP_TEST.test(text)) return false
  if (text.includes(';') || text.includes('{') || text.includes('}') || text.includes('\\')) return false
  if (/url\(|expression\(|var\(|attr\(|env\(|@import/i.test(text)) return false
  const layers = splitTopLevel(text, ',')
  if (layers.length === 0 || layers.length > 3) return false
  for (const layer of layers) {
    const tokens = splitTopLevel(layer.trim(), ' ')
    while (tokens[0] === 'inset') tokens.shift()
    if (tokens.length === 0) return false
    // CSS allows the color at the start or the end of one shadow layer.
    if (isSafeCssColor(tokens[0])) tokens.shift()
    else if (isSafeCssColor(tokens[tokens.length - 1])) tokens.pop()
    if (tokens.length < 2 || tokens.length > 4) return false
    for (const token of tokens) {
      if (!/^(?:0|-?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)px)$/.test(token)) return false
    }
  }
  return true
}

/** True for a local gradient pattern token (no url(), no network resource). */
export function isSafeCssPattern(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const text = value.trim()
  if (!text || text.length > CONTENT_LIMITS.maxBackgroundValueChars) return false
  if (CONTROL_TEST.test(text) || MARKUP_TEST.test(text)) return false
  if (text.includes(';') || text.includes('{') || text.includes('}') || text.includes('\\')) return false
  if (text.includes('//') || /https?:/i.test(text)) return false
  if (!/[a-z-]+\(/i.test(text)) return false
  const functionPattern = /([a-z-]+)\(/gi
  let match: RegExpExecArray | null
  let found = false
  while ((match = functionPattern.exec(text)) !== null) {
    found = true
    const name = (match[1] ?? '').toLowerCase()
    if (!SAFE_GRADIENT_FUNCTIONS.has(name)) return false
  }
  if (!found) return false
  let depth = 0
  for (const ch of text) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (depth < 0 || depth > 8) return false
  }
  if (depth !== 0) return false
  return /^[a-zA-Z0-9#%.,()\s+-]+$/.test(text)
}

/** True for a local font stack; network fonts/url()/import/quotes trickery rejected. */
export function isSafeFontFamily(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const text = value.trim()
  if (!text || text.length > CONTENT_LIMITS.maxFontFamilyChars) return false
  if (CONTROL_TEST.test(text) || MARKUP_TEST.test(text)) return false
  if (text.includes(';') || text.includes('{') || text.includes('}') || text.includes('\\')) return false
  if (/url\(|@import|https?:|\/\//i.test(text)) return false
  const families = splitTopLevel(text, ',')
  if (families.length === 0 || families.length > 6) return false
  for (const rawFamily of families) {
    const family = rawFamily.trim()
    if (!family) return false
    if (family.startsWith('"') || family.startsWith("'")) {
      const quote = family[0] ?? ''
      if (family.length < 3 || !family.endsWith(quote)) return false
      const inner = family.slice(1, -1)
      if (!inner || /["'()]/.test(inner)) return false
      if (!/^[A-Za-z0-9 ._\u4e00-\u9fff-]+$/.test(inner)) return false
      continue
    }
    if (SAFE_GENERIC_FONTS.has(family.toLowerCase())) continue
    if (!/^[A-Za-z0-9 ._\u4e00-\u9fff-]+$/.test(family)) return false
  }
  return true
}

function splitTopLevel(text: string, separator: ',' | ' '): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote: string | null = null
  for (const ch of text) {
    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }
    if (ch === '(') depth += 1
    if (ch === ')') depth = Math.max(0, depth - 1)
    const isSeparator = separator === ',' ? ch === ',' && depth === 0 : (ch === ' ' || ch === '\t') && depth === 0
    if (isSeparator) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part.length > 0)
}

// ---------------------------------------------------------------------------
// Field readers
// ---------------------------------------------------------------------------

function checkUnknownKeys(record: Record<string, unknown>, allowed: readonly string[], path: string, issues: ContentIssue[]): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      addIssue(issues, path + '.' + key, 'unknown-field', 'unknown field: ' + key.slice(0, 48))
    }
  }
}

function readStringField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentIssue[],
  required = true,
): string | undefined {
  const raw = record[key]
  if (raw === undefined) {
    if (required) addIssue(issues, path, 'missing-field', 'missing field: ' + key)
    return undefined
  }
  if (typeof raw !== 'string') {
    addIssue(issues, path, 'invalid-type', 'expected a string')
    return undefined
  }
  return raw
}

function readBooleanField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentIssue[],
  options: { required?: boolean; defaultValue?: boolean } = {},
): boolean | undefined {
  const raw = record[key]
  if (raw === undefined) {
    if (options.defaultValue !== undefined) return options.defaultValue
    if (options.required !== false) addIssue(issues, path, 'missing-field', 'missing field: ' + key)
    return undefined
  }
  if (typeof raw !== 'boolean') {
    addIssue(issues, path, 'invalid-type', 'expected a boolean')
    return undefined
  }
  return raw
}

function readNumberField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentIssue[],
  options: { required?: boolean; min?: number; max?: number; integer?: boolean } = {},
): number | undefined {
  const raw = record[key]
  if (raw === undefined) {
    if (options.required !== false) addIssue(issues, path, 'missing-field', 'missing field: ' + key)
    return undefined
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    addIssue(issues, path, 'invalid-number', 'expected a finite number')
    return undefined
  }
  if (options.integer === true && !Number.isInteger(raw)) {
    addIssue(issues, path, 'invalid-number', 'expected an integer')
    return undefined
  }
  if (options.min !== undefined && raw < options.min) {
    addIssue(issues, path, 'out-of-range', 'must be >= ' + options.min)
    return undefined
  }
  if (options.max !== undefined && raw > options.max) {
    addIssue(issues, path, 'out-of-range', 'must be <= ' + options.max)
    return undefined
  }
  return raw
}

function readArrayField(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentIssue[],
  required = true,
): unknown[] | undefined {
  const raw = record[key]
  if (raw === undefined) {
    if (required) addIssue(issues, path, 'missing-field', 'missing field: ' + key)
    return undefined
  }
  if (!Array.isArray(raw)) {
    addIssue(issues, path, 'invalid-type', 'expected an array')
    return undefined
  }
  return raw
}

/** Strict plain text: no control/bidi/markup, trimmed, bounded, non-empty. */
function readPlainText(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentIssue[],
  options: { required?: boolean; maxChars: number; allowEmpty?: boolean } = { maxChars: CONTENT_LIMITS.maxDescriptionChars },
): string | undefined {
  const raw = readStringField(record, key, path, issues, options.required !== false)
  if (raw === undefined) return undefined
  return validatePlainText(raw, path, issues, options.maxChars, options.allowEmpty === true)
}

function validatePlainText(value: string, path: string, issues: ContentIssue[], maxChars: number, allowEmpty = false): string | undefined {
  if (value !== value.trim()) {
    addIssue(issues, path, 'invalid-text', 'text must not have leading/trailing whitespace')
    return undefined
  }
  if (!allowEmpty && value.length === 0) {
    addIssue(issues, path, 'invalid-text', 'text must not be empty')
    return undefined
  }
  if (stripControlChars(value) !== value || stripBidiControls(value) !== value || /[\r\n\t]/.test(value)) {
    addIssue(issues, path, 'invalid-text', 'text must not contain control/bidi/newline characters')
    return undefined
  }
  if (MARKUP_TEST.test(value)) {
    addIssue(issues, path, 'markup-text', 'HTML/markup is not allowed in content text')
    return undefined
  }
  if (countCodePoints(value) > maxChars) {
    addIssue(issues, path, 'text-too-long', 'text is ' + countCodePoints(value) + ' code points > ' + maxChars)
    return undefined
  }
  return value
}

function readEnumField<T extends string>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentIssue[],
  allowed: readonly T[],
  required = true,
): T | undefined {
  const raw = record[key]
  if (raw === undefined) {
    if (required) addIssue(issues, path, 'missing-field', 'missing field: ' + key)
    return undefined
  }
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    addIssue(issues, path, 'invalid-type', 'expected one of: ' + allowed.join(', '))
    return undefined
  }
  return raw as T
}

function parseStringList(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: { min?: number; max: number; pattern?: RegExp; patternMessage?: string; values?: readonly string[] },
): string[] | undefined {
  if (!Array.isArray(raw)) {
    addIssue(issues, path, 'invalid-type', 'expected an array of strings')
    return undefined
  }
  if (raw.length < (options.min ?? 1) || raw.length > options.max) {
    addIssue(issues, path, 'out-of-range', 'expected ' + (options.min ?? 1) + '..' + options.max + ' items')
    return undefined
  }
  const out: string[] = []
  const seen = new Set<string>()
  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index]
    const itemPath = path + '[' + index + ']'
    if (typeof item !== 'string') {
      addIssue(issues, itemPath, 'invalid-type', 'expected a string')
      continue
    }
    if (options.values) {
      if (!options.values.includes(item)) {
        addIssue(issues, itemPath, 'invalid-type', 'unsupported value: ' + item.slice(0, 32))
        continue
      }
    } else if (options.pattern && !options.pattern.test(item)) {
      addIssue(issues, itemPath, 'invalid-id', options.patternMessage ?? 'invalid id/value')
      continue
    }
    if (seen.has(item)) {
      addIssue(issues, itemPath, 'duplicate-id', 'duplicate value: ' + item.slice(0, 32))
      continue
    }
    seen.add(item)
    out.push(item)
  }
  return out
}

function parseEntryId(raw: unknown, path: string, issues: ContentIssue[]): string | undefined {
  if (typeof raw !== 'string') {
    addIssue(issues, path, 'invalid-type', 'expected a string id')
    return undefined
  }
  if (!ENTRY_ID_PATTERN.test(raw) || raw.length > 32) {
    addIssue(issues, path, 'invalid-id', 'entry id must be lowercase kebab-case (max 32)')
    return undefined
  }
  return raw
}

function parsePackId(raw: unknown, path: string, issues: ContentIssue[]): string | undefined {
  if (typeof raw !== 'string') {
    addIssue(issues, path, 'invalid-type', 'expected a string pack id')
    return undefined
  }
  if (!PACK_ID_PATTERN.test(raw) || raw.length > 64) {
    addIssue(issues, path, 'invalid-id', 'pack id must be lowercase dot/dash separated (max 64)')
    return undefined
  }
  if (raw === 'famling' || raw.startsWith('famling.') || raw.startsWith('famling-')) {
    addIssue(issues, path, 'reserved-id', 'famling.* ids are reserved for built-in content')
    return undefined
  }
  return raw
}

function fileExtension(relativePath: string): string {
  const slash = relativePath.lastIndexOf('/')
  const base = slash === -1 ? relativePath : relativePath.slice(slash + 1)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase()
}

function parseSafePath(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: { leadingSlash?: boolean; extensions?: readonly string[]; maxChars: number },
): string | undefined {
  if (typeof raw !== 'string') {
    addIssue(issues, path, 'invalid-path', 'expected a path string')
    return undefined
  }
  if (raw.length === 0 || countCodePoints(raw) > options.maxChars) {
    addIssue(issues, path, 'invalid-path', 'path length is out of bounds')
    return undefined
  }
  if (CONTROL_TEST.test(raw) || MARKUP_TEST.test(raw) || raw.includes('\\') || raw.includes('#') || raw.includes('?')) {
    addIssue(issues, path, 'unsafe-path', 'path contains forbidden characters')
    return undefined
  }
  let relative = raw
  if (options.leadingSlash === true) {
    if (!raw.startsWith('/') || raw.startsWith('//')) {
      addIssue(issues, path, 'invalid-path', 'expected a root-relative path starting with a single "/"')
      return undefined
    }
    relative = raw.slice(1)
  }
  if (SOURCE_SCHEME_TEST.test(relative)) {
    addIssue(issues, path, 'unsafe-path', 'URLs are not allowed here')
    return undefined
  }
  const checked = checkRelativePath(relative, { allowBackslash: false })
  if (!checked.ok) {
    addIssue(issues, path, 'unsafe-path', checked.code + ': ' + checked.detail)
    return undefined
  }
  if (checked.normalized !== relative) {
    addIssue(issues, path, 'invalid-path', 'path must be canonical (no "./" or duplicate separators)')
    return undefined
  }
  if (options.extensions) {
    const extension = fileExtension(relative)
    if (!options.extensions.includes(extension)) {
      addIssue(issues, path, 'invalid-path', 'file extension "."' + extension + '" is not allowed')
      return undefined
    }
  }
  return raw
}

// ---------------------------------------------------------------------------
// Remote origin (reserved shape, metadata only)
// ---------------------------------------------------------------------------

function parseRemoteOrigin(raw: unknown, path: string, issues: ContentIssue[]): ContentRemoteOrigin | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-remote', 'remote must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['marketId', 'version', 'url', 'signature'], path, issues)
  const marketId = readStringField(raw, 'marketId', path + '.marketId', issues)
  if (marketId !== undefined && (!PACK_ID_PATTERN.test(marketId) || marketId.length > 64)) {
    addIssue(issues, path + '.marketId', 'invalid-id', 'invalid market id')
  }
  const version = readStringField(raw, 'version', path + '.version', issues)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    addIssue(issues, path + '.version', 'invalid-version', 'version must be SemVer')
  }
  let url: string | undefined
  const rawUrl = raw.url
  if (rawUrl !== undefined) {
    if (typeof rawUrl !== 'string' || countCodePoints(rawUrl) > CONTENT_LIMITS.maxRemoteUrlChars) {
      addIssue(issues, path + '.url', 'invalid-remote', 'invalid remote url')
    } else {
      let parsed: URL | undefined
      try {
        parsed = new URL(rawUrl)
      } catch {
        parsed = undefined
      }
      if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        addIssue(issues, path + '.url', 'invalid-remote', 'remote url must be a credential-free HTTPS URL')
      } else {
        url = parsed.href
      }
    }
  }
  let signature: ContentRemoteSignature | undefined
  const rawSignature = raw.signature
  if (rawSignature !== undefined) {
    if (!isRecord(rawSignature)) {
      addIssue(issues, path + '.signature', 'invalid-remote', 'signature must be an object')
    } else {
      checkUnknownKeys(rawSignature, ['algorithm', 'keyId', 'value'], path + '.signature', issues)
      const algorithm = rawSignature.algorithm
      const keyId = rawSignature.keyId
      const value = rawSignature.value
      if (algorithm !== 'ed25519') addIssue(issues, path + '.signature.algorithm', 'invalid-remote', 'only ed25519 is reserved')
      if (typeof keyId !== 'string' || !REMOTE_KEY_ID_PATTERN.test(keyId)) addIssue(issues, path + '.signature.keyId', 'invalid-remote', 'invalid key id')
      if (typeof value !== 'string' || !SIGNATURE_VALUE_PATTERN.test(value)) addIssue(issues, path + '.signature.value', 'invalid-remote', 'invalid signature value')
      if (algorithm === 'ed25519' && typeof keyId === 'string' && typeof value === 'string' && REMOTE_KEY_ID_PATTERN.test(keyId) && SIGNATURE_VALUE_PATTERN.test(value)) {
        signature = { algorithm: 'ed25519', keyId, value }
      }
    }
  }
  if (marketId === undefined || version === undefined) return undefined
  const origin: { marketId: string; version: string; url?: string; signature?: ContentRemoteSignature } = { marketId, version }
  if (url !== undefined) origin.url = url
  if (signature !== undefined) origin.signature = signature
  return origin
}

// ---------------------------------------------------------------------------
// Entry parsers (library entries: source required; pack entries: local default)
// ---------------------------------------------------------------------------

const COMMON_ENTRY_KEYS = ['id', 'name', 'description', 'source', 'available', 'remote'] as const

interface EntryParseOptions {
  readonly requireSource: boolean
  readonly defaultSource?: ContentSource
  readonly allowedSources: readonly ContentSource[]
  readonly requireAvailable: boolean
  readonly allowRemote: boolean
  /** Built-in catalog previews are root-relative ("/assets/…"); pack previews are pack-relative. */
  readonly previewLeadingSlash: boolean
}

const LIBRARY_ENTRY_OPTIONS: EntryParseOptions = Object.freeze({
  requireSource: true,
  allowedSources: CONTENT_SOURCES,
  requireAvailable: true,
  allowRemote: true,
  previewLeadingSlash: true,
})

const PACK_ENTRY_OPTIONS: EntryParseOptions = Object.freeze({
  requireSource: false,
  defaultSource: 'local',
  allowedSources: ['local'] as readonly ContentSource[],
  requireAvailable: false,
  allowRemote: false,
  previewLeadingSlash: false,
})

function parseEntryBase(
  record: Record<string, unknown>,
  path: string,
  issues: ContentIssue[],
  options: EntryParseOptions,
): ContentEntryBase | undefined {
  const id = parseEntryId(record.id, path + '.id', issues)
  const name = readPlainText(record, 'name', path + '.name', issues, { maxChars: CONTENT_LIMITS.maxNameChars })
  const description = readPlainText(record, 'description', path + '.description', issues, {
    maxChars: CONTENT_LIMITS.maxDescriptionChars,
  })
  let source: ContentSource | undefined
  const rawSource = record.source
  if (rawSource === undefined) {
    if (options.requireSource) {
      addIssue(issues, path + '.source', 'missing-field', 'missing field: source')
    } else {
      source = options.defaultSource ?? 'local'
    }
  } else if (typeof rawSource !== 'string' || !(CONTENT_SOURCES as readonly string[]).includes(rawSource)) {
    addIssue(issues, path + '.source', 'invalid-type', 'source must be builtin, local or remote')
  } else if (!options.allowedSources.includes(rawSource as ContentSource)) {
    addIssue(issues, path + '.source', 'invalid-type', 'source is not allowed for this document')
  } else {
    source = rawSource as ContentSource
  }
  const available = options.requireAvailable
    ? readBooleanField(record, 'available', path + '.available', issues)
    : readBooleanField(record, 'available', path + '.available', issues, { required: false, defaultValue: true })
  let remote: ContentRemoteOrigin | undefined
  if (record.remote !== undefined) {
    if (!options.allowRemote) {
      addIssue(issues, path + '.remote', 'unknown-field', 'remote is not allowed in an installed pack entry')
    } else if (source !== 'remote') {
      addIssue(issues, path + '.remote', 'invalid-remote', 'remote is only allowed when source is "remote"')
    } else {
      remote = parseRemoteOrigin(record.remote, path + '.remote', issues)
    }
  } else if (source === 'remote') {
    addIssue(issues, path + '.remote', 'missing-field', 'source "remote" needs a remote origin object')
  }
  if (id === undefined || name === undefined || description === undefined || source === undefined || available === undefined) {
    return undefined
  }
  if (remote !== undefined) return { id, name, description, source, available, remote }
  return { id, name, description, source, available }
}

function parseCharacterEntry(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: EntryParseOptions,
): ContentCharacterEntry | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'entry must be an object')
    return undefined
  }
  checkUnknownKeys(
    raw,
    [...COMMON_ENTRY_KEYS, 'kind', 'preview', 'voiceMode', 'bubbleSemantic', 'characterDir', 'products'],
    path,
    issues,
  )
  const base = parseEntryBase(raw, path, issues, options)
  const kind = readEnumField(raw, 'kind', path + '.kind', issues, CHARACTER_KINDS)
  const preview = parseSafePath(raw.preview, path + '.preview', issues, {
    leadingSlash: options.previewLeadingSlash,
    extensions: ['png', 'webp'],
    maxChars: CONTENT_LIMITS.maxPreviewChars,
  })
  const voiceMode = readEnumField(raw, 'voiceMode', path + '.voiceMode', issues, VOICE_MODES)
  const bubbleSemantic = readEnumField(raw, 'bubbleSemantic', path + '.bubbleSemantic', issues, BUBBLE_SEMANTICS)
  let characterDir: string | undefined
  if (raw.characterDir !== undefined) {
    characterDir = parseSafePath(raw.characterDir, path + '.characterDir', issues, {
      leadingSlash: false,
      maxChars: 64,
    })
  }
  let products: ContentProductId[] | undefined
  if (raw.products !== undefined) {
    products = parseStringList(raw.products, path + '.products', issues, {
      max: CONTENT_PRODUCTS.length,
      values: CONTENT_PRODUCTS,
    }) as ContentProductId[] | undefined
  }
  if (kind !== undefined) {
    const silent = kind === 'dog' || kind === 'cat'
    if (silent && voiceMode !== undefined && voiceMode !== 'none') {
      addIssue(issues, path + '.voiceMode', 'invalid-type', 'dog/cat characters are silent (voiceMode: none)')
    }
    if (!silent && voiceMode !== undefined && voiceMode !== 'tts') {
      addIssue(issues, path + '.voiceMode', 'invalid-type', 'human presentations use voiceMode: tts')
    }
    if (silent && bubbleSemantic !== undefined && bubbleSemantic !== 'thought') {
      addIssue(issues, path + '.bubbleSemantic', 'invalid-type', 'dog/cat characters use thought bubbles')
    }
    if (!silent && bubbleSemantic !== undefined && bubbleSemantic !== 'speech') {
      addIssue(issues, path + '.bubbleSemantic', 'invalid-type', 'human presentations use speech bubbles')
    }
  }
  if (
    base === undefined ||
    kind === undefined ||
    preview === undefined ||
    voiceMode === undefined ||
    bubbleSemantic === undefined ||
    (raw.characterDir !== undefined && characterDir === undefined) ||
    (raw.products !== undefined && products === undefined)
  ) {
    return undefined
  }
  const entry: { -readonly [K in keyof ContentCharacterEntry]: ContentCharacterEntry[K] } = {
    ...base,
    kind,
    preview,
    voiceMode,
    bubbleSemantic,
  }
  if (characterDir !== undefined) entry.characterDir = characterDir
  if (products !== undefined) entry.products = products
  return entry
}

function parseVoiceEntry(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: EntryParseOptions,
): ContentVoiceEntry | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'entry must be an object')
    return undefined
  }
  checkUnknownKeys(raw, [...COMMON_ENTRY_KEYS, 'voiceId', 'languages', 'availableFor', 'provider', 'aiGenerated'], path, issues)
  const base = parseEntryBase(raw, path, issues, options)
  const voiceId = parseEntryId(raw.voiceId, path + '.voiceId', issues)
  const rawLanguages = readArrayField(raw, 'languages', path + '.languages', issues)
  const languages =
    rawLanguages === undefined
      ? undefined
      : parseStringList(rawLanguages, path + '.languages', issues, {
          max: 8,
          pattern: LANGUAGE_PATTERN,
          patternMessage: 'invalid BCP-47 language tag',
        })
  const rawAvailableFor = readArrayField(raw, 'availableFor', path + '.availableFor', issues)
  const availableFor =
    rawAvailableFor === undefined
      ? undefined
      : parseStringList(rawAvailableFor, path + '.availableFor', issues, {
          max: 16,
          pattern: ENTRY_ID_PATTERN,
          patternMessage: 'availableFor must list character ids',
        })
  const provider = readStringField(raw, 'provider', path + '.provider', issues)
  if (provider !== undefined && !PROVIDER_PATTERN.test(provider)) {
    addIssue(issues, path + '.provider', 'invalid-id', 'invalid provider id')
  }
  const aiGenerated = readBooleanField(raw, 'aiGenerated', path + '.aiGenerated', issues)
  if (base === undefined || voiceId === undefined || languages === undefined || availableFor === undefined || provider === undefined || aiGenerated === undefined) {
    return undefined
  }
  return { ...base, voiceId, languages, availableFor, provider, aiGenerated }
}

function parseSaysOverrides(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  maxChars: number,
): Record<string, readonly string[]> | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'saysOverrides must be an object')
    return undefined
  }
  const keys = Object.keys(raw)
  if (keys.length === 0 || keys.length > CONTENT_LIMITS.maxSaysOverrides) {
    addIssue(issues, path, 'out-of-range', 'saysOverrides must have 1..' + CONTENT_LIMITS.maxSaysOverrides + ' keys')
    return undefined
  }
  const out: Record<string, string[]> = {}
  for (const key of keys) {
    const keyPath = path + '.' + key
    if (!OVERRIDE_KEY_PATTERN.test(key) || key.length > CONTENT_LIMITS.maxOverridesKeyChars) {
      addIssue(issues, keyPath, 'invalid-id', 'override keys look like "region:head" / "action:pat"')
      continue
    }
    const rawLines = raw[key]
    if (!Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > CONTENT_LIMITS.maxSaysLines) {
      addIssue(issues, keyPath, 'out-of-range', 'override lines must be an array of 1..' + CONTENT_LIMITS.maxSaysLines)
      continue
    }
    const lines: string[] = []
    for (let index = 0; index < rawLines.length; index += 1) {
      const line = rawLines[index]
      if (typeof line !== 'string') {
        addIssue(issues, keyPath + '[' + index + ']', 'invalid-type', 'expected a string line')
        continue
      }
      const valid = validatePlainText(line, keyPath + '[' + index + ']', issues, maxChars)
      if (valid !== undefined) lines.push(valid)
    }
    if (lines.length > 0) out[key] = lines
  }
  return out
}

function parseDialoguePackEntry(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: EntryParseOptions,
): ContentDialoguePackEntry | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'entry must be an object')
    return undefined
  }
  checkUnknownKeys(raw, [...COMMON_ENTRY_KEYS, 'mode', 'bubbleChance', 'maxChars', 'saysOverrides'], path, issues)
  const base = parseEntryBase(raw, path, issues, options)
  const mode = readEnumField(raw, 'mode', path + '.mode', issues, DIALOGUE_MODES)
  const bubbleChance = readNumberField(raw, 'bubbleChance', path + '.bubbleChance', issues, { min: 0, max: 1 })
  const maxChars = readNumberField(raw, 'maxChars', path + '.maxChars', issues, {
    min: 1,
    max: SECURITY_LIMITS.bubbleChars,
    integer: true,
  })
  let saysOverrides: Record<string, readonly string[]> | undefined
  if (raw.saysOverrides !== undefined) {
    saysOverrides = parseSaysOverrides(raw.saysOverrides, path + '.saysOverrides', issues, maxChars ?? SECURITY_LIMITS.bubbleChars)
  }
  if (base === undefined || mode === undefined || bubbleChance === undefined || maxChars === undefined) return undefined
  if (raw.saysOverrides !== undefined && saysOverrides === undefined) return undefined
  if (saysOverrides !== undefined) return { ...base, mode, bubbleChance, maxChars, saysOverrides }
  return { ...base, mode, bubbleChance, maxChars }
}

function parseThemeEntry(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: EntryParseOptions,
): ContentThemeEntry | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'entry must be an object')
    return undefined
  }
  checkUnknownKeys(raw, [...COMMON_ENTRY_KEYS, 'vars'], path, issues)
  const base = parseEntryBase(raw, path, issues, options)
  let vars: ContentThemeVars | undefined
  const rawVars = raw.vars
  if (!isRecord(rawVars)) {
    addIssue(issues, path + '.vars', 'invalid-type', 'vars must be an object')
  } else {
    checkUnknownKeys(
      rawVars,
      ['bubbleBg', 'bubbleFg', 'bubbleBorder', 'bubbleShadow', 'panelBg', 'panelFg', 'bg'],
      path + '.vars',
      issues,
    )
    const bubbleBg = readVarsColor(rawVars, 'bubbleBg', path, issues, true)
    const bubbleFg = readVarsColor(rawVars, 'bubbleFg', path, issues, true)
    const bubbleBorder = readVarsColor(rawVars, 'bubbleBorder', path, issues, true)
    const bubbleShadow = readVarsShadow(rawVars, 'bubbleShadow', path, issues)
    const panelBg = readVarsColor(rawVars, 'panelBg', path, issues, false)
    const panelFg = readVarsColor(rawVars, 'panelFg', path, issues, false)
    const bg = readVarsColor(rawVars, 'bg', path, issues, false)
    if (bubbleBg !== undefined && bubbleFg !== undefined && bubbleBorder !== undefined && bubbleShadow !== undefined) {
      const next: { -readonly [K in keyof ContentThemeVars]: ContentThemeVars[K] } = {
        bubbleBg,
        bubbleFg,
        bubbleBorder,
        bubbleShadow,
      }
      if (panelBg !== undefined) next.panelBg = panelBg
      if (panelFg !== undefined) next.panelFg = panelFg
      if (bg !== undefined) next.bg = bg
      vars = next
    }
  }
  if (base === undefined || vars === undefined) return undefined
  return { ...base, vars }
}

function readVarsColor(
  vars: Record<string, unknown>,
  key: string,
  path: string,
  issues: ContentIssue[],
  required: boolean,
): string | undefined {
  const raw = vars[key]
  const fieldPath = path + '.vars.' + key
  if (raw === undefined) {
    if (required) addIssue(issues, fieldPath, 'missing-field', 'missing field: ' + key)
    return undefined
  }
  if (!isSafeCssColor(raw)) {
    addIssue(issues, fieldPath, 'invalid-color', 'unsafe CSS color token')
    return undefined
  }
  return raw
}

function readVarsShadow(vars: Record<string, unknown>, key: string, path: string, issues: ContentIssue[]): string | undefined {
  const raw = vars[key]
  const fieldPath = path + '.vars.' + key
  if (raw === undefined) {
    addIssue(issues, fieldPath, 'missing-field', 'missing field: ' + key)
    return undefined
  }
  if (!isSafeCssShadow(raw)) {
    addIssue(issues, fieldPath, 'unsafe-css', 'unsafe CSS shadow token')
    return undefined
  }
  return raw
}

function parseBackgroundEntry(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: EntryParseOptions,
): ContentBackgroundEntry | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'entry must be an object')
    return undefined
  }
  checkUnknownKeys(raw, [...COMMON_ENTRY_KEYS, 'kind', 'value'], path, issues)
  const base = parseEntryBase(raw, path, issues, options)
  const kind = readEnumField(raw, 'kind', path + '.kind', issues, BACKGROUND_KINDS)
  const rawValue = readStringField(raw, 'value', path + '.value', issues)
  let value: string | undefined
  if (rawValue !== undefined) {
    if (countCodePoints(rawValue) > CONTENT_LIMITS.maxBackgroundValueChars) {
      addIssue(issues, path + '.value', 'text-too-long', 'background value is too long')
    } else if (kind === 'transparent') {
      if (rawValue.trim().toLowerCase() !== 'transparent') {
        addIssue(issues, path + '.value', 'invalid-color', 'transparent backgrounds use value: "transparent"')
      } else {
        value = rawValue
      }
    } else if (kind === 'color') {
      if (!isSafeCssColor(rawValue)) {
        addIssue(issues, path + '.value', 'invalid-color', 'unsafe CSS color token')
      } else {
        value = rawValue
      }
    } else if (kind === 'pattern') {
      if (!isSafeCssPattern(rawValue)) {
        addIssue(issues, path + '.value', 'unsafe-css', 'pattern must be a local gradient token (no url())')
      } else {
        value = rawValue
      }
    }
  }
  if (base === undefined || kind === undefined || value === undefined) return undefined
  return { ...base, kind, value }
}

function parseFontEntry(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: EntryParseOptions,
): ContentFontEntry | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'entry must be an object')
    return undefined
  }
  checkUnknownKeys(raw, [...COMMON_ENTRY_KEYS, 'family'], path, issues)
  const base = parseEntryBase(raw, path, issues, options)
  const rawFamily = readStringField(raw, 'family', path + '.family', issues)
  let family: string | undefined
  if (rawFamily !== undefined) {
    if (!isSafeFontFamily(rawFamily)) {
      addIssue(issues, path + '.family', 'invalid-font-family', 'font family must be a local safe stack (no url()/@import)')
    } else {
      family = rawFamily
    }
  }
  if (base === undefined || family === undefined) return undefined
  return { ...base, family }
}

const ENTRY_PARSERS: Readonly<Record<ContentCategory, (raw: unknown, path: string, issues: ContentIssue[], options: EntryParseOptions) => ContentEntry | undefined>> = Object.freeze({
  characters: parseCharacterEntry,
  voices: parseVoiceEntry,
  dialoguePacks: parseDialoguePackEntry,
  themes: parseThemeEntry,
  backgrounds: parseBackgroundEntry,
  fonts: parseFontEntry,
})

function parseEntryArray(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  category: ContentCategory,
  options: EntryParseOptions,
  maxEntries: number,
): ContentEntry[] {
  if (!Array.isArray(raw)) {
    addIssue(issues, path, 'invalid-type', 'expected an array')
    return []
  }
  if (raw.length > maxEntries) {
    addIssue(issues, path, 'too-many-entries', raw.length + ' entries > ' + maxEntries)
    return []
  }
  const parser = ENTRY_PARSERS[category]
  const entries: ContentEntry[] = []
  const seen = new Set<string>()
  for (let index = 0; index < raw.length; index += 1) {
    const entry = parser(raw[index], path + '[' + index + ']', issues, options)
    if (entry === undefined) continue
    if (seen.has(entry.id)) {
      addIssue(issues, path + '[' + index + '].id', 'duplicate-id', 'duplicate entry id: ' + entry.id)
      continue
    }
    seen.add(entry.id)
    entries.push(entry)
  }
  return entries
}

// ---------------------------------------------------------------------------
// Library parser
// ---------------------------------------------------------------------------

function parseDefaults(raw: unknown, path: string, issues: ContentIssue[]): ContentSelection | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'defaults must be an object')
    return undefined
  }
  checkUnknownKeys(raw, SELECTION_KEYS, path, issues)
  const out: { -readonly [K in keyof ContentSelection]: string } = {
    character: '',
    voice: '',
    dialoguePack: '',
    theme: '',
    background: '',
    font: '',
  }
  let ok = true
  for (const key of SELECTION_KEYS) {
    const value = readStringField(raw, key, path + '.' + key, issues)
    if (value === undefined || !ENTRY_ID_PATTERN.test(value)) {
      if (value !== undefined) addIssue(issues, path + '.' + key, 'invalid-id', 'default must be a catalog entry id')
      ok = false
      continue
    }
    out[key] = value
  }
  return ok ? out : undefined
}

function checkDefaultsReferences(
  defaults: ContentSelection,
  categories: Readonly<Record<ContentCategory, readonly ContentEntry[]>>,
  issues: ContentIssue[],
): void {
  for (const key of SELECTION_KEYS) {
    const category = CONTENT_SELECTION_CATEGORY[key]
    const entries = categories[category]
    const entry = entries.find((candidate) => candidate.id === defaults[key])
    if (!entry) {
      addIssue(issues, '$.defaults.' + key, 'unknown-reference', 'default entry not found: ' + defaults[key])
    } else if (!entry.available) {
      addIssue(issues, '$.defaults.' + key, 'unavailable', 'default entry is not available: ' + defaults[key])
    }
  }
  const character = categories.characters.find((entry) => entry.id === defaults.character) as ContentCharacterEntry | undefined
  const voice = categories.voices.find((entry) => entry.id === defaults.voice) as ContentVoiceEntry | undefined
  if (character !== undefined && character.voiceMode === 'tts' && voice !== undefined) {
    if (!voice.availableFor.includes(character.id)) {
      addIssue(issues, '$.defaults.voice', 'invalid-defaults', 'default voice is not available for the default character')
    }
  }
}

/**
 * Strictly parse + validate public/content/library.json (or a merged catalog).
 *
 * v2 canonical schema: `famling.content/0.2` — rolePresets / characterThemes are
 * the primary entry; the six component categories are the building blocks.
 * The deprecated `famling.content/0.1` document is still accepted and yields a
 * normalized v2 view with `legacy: true` and empty rolePresets/characterThemes.
 */
export function parseContentLibrary(input: unknown): ContentLibrary {
  const issues: ContentIssue[] = []
  if (!isRecord(input)) {
    addIssue(issues, '$', 'invalid-type', 'content library must be an object')
    throw new ContentLibraryError(failSummary('invalid content library', issues), issues)
  }
  checkUnknownKeys(
    input,
    [
      'schema',
      'version',
      'updatedAt',
      'defaults',
      'defaultRoleTheme',
      'rolePresets',
      'characterThemes',
      'legacy',
      ...CONTENT_CATEGORIES,
    ],
    '$',
    issues,
  )
  const schema = readStringField(input, 'schema', '$.schema', issues)
  let legacy = false
  if (schema !== undefined) {
    if (schema === CONTENT_LIBRARY_SCHEMA_V1) {
      legacy = true
    } else if (schema !== CONTENT_LIBRARY_SCHEMA) {
      addIssue(issues, '$.schema', 'invalid-schema', 'expected ' + CONTENT_LIBRARY_SCHEMA + ' (or deprecated ' + CONTENT_LIBRARY_SCHEMA_V1 + ')')
    }
  }
  const version = readStringField(input, 'version', '$.version', issues)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    addIssue(issues, '$.version', 'invalid-version', 'version must be SemVer')
  }
  const updatedAt = readStringField(input, 'updatedAt', '$.updatedAt', issues)
  if (updatedAt !== undefined && !DATE_PATTERN.test(updatedAt)) {
    addIssue(issues, '$.updatedAt', 'invalid-text', 'updatedAt must be YYYY-MM-DD')
  }
  const defaults = parseDefaults(input.defaults, '$.defaults', issues)
  const categories: Record<ContentCategory, ContentEntry[]> = {
    characters: [],
    voices: [],
    dialoguePacks: [],
    themes: [],
    backgrounds: [],
    fonts: [],
  }
  for (const category of CONTENT_CATEGORIES) {
    const raw = input[category]
    if (raw === undefined) {
      addIssue(issues, '$.' + category, 'missing-field', 'category array is required: ' + category)
      continue
    }
    categories[category] = parseEntryArray(raw, '$.' + category, issues, category, LIBRARY_ENTRY_OPTIONS, CONTENT_LIMITS.maxEntriesPerCategory)
  }
  const rolePresets = parseRoleThemeArray(input.rolePresets, '$.rolePresets', issues, {
    required: false,
    allowedSources: ['builtin'],
    previewLeadingSlash: true,
    max: CONTENT_PACK_V2_LIMITS.maxRoleThemesPerPack,
  })
  const characterThemes = parseRoleThemeArray(input.characterThemes, '$.characterThemes', issues, {
    required: false,
    allowedSources: ['local', 'remote'],
    previewLeadingSlash: true,
    previewMode: 'either',
    max: CONTENT_PACK_V2_LIMITS.maxRoleThemesPerPack * 8,
  })
  checkRoleThemeDuplicates(rolePresets, characterThemes, issues)
  let defaultRoleTheme: string | undefined
  if (input.defaultRoleTheme !== undefined) {
    const rawDefault = readStringField(input, 'defaultRoleTheme', '$.defaultRoleTheme', issues)
    if (rawDefault !== undefined) {
      if (!ENTRY_ID_PATTERN.test(rawDefault)) {
        addIssue(issues, '$.defaultRoleTheme', 'invalid-id', 'defaultRoleTheme must be a character-theme id')
      } else {
        defaultRoleTheme = rawDefault
      }
    }
  }
  if (defaultRoleTheme !== undefined && findRoleThemeIn(rolePresets, characterThemes, defaultRoleTheme) === undefined) {
    addIssue(issues, '$.defaultRoleTheme', 'unknown-reference', 'default character theme not found: ' + defaultRoleTheme)
  }
  checkRoleThemeReferences(rolePresets, '$.rolePresets', categories, issues)
  checkRoleThemeReferences(characterThemes, '$.characterThemes', categories, issues)
  if (defaults !== undefined) checkDefaultsReferences(defaults, categories, issues)
  if (issues.length > 0 || defaults === undefined) {
    const finalIssues = issues.length > 0 ? issues : [{ path: '$', code: 'invalid-defaults' as const, message: 'defaults missing' }]
    throw new ContentLibraryError(failSummary('invalid content library', finalIssues), finalIssues)
  }
  const library: ContentLibrary = {
    schema: CONTENT_LIBRARY_SCHEMA,
    version: version as string,
    updatedAt: updatedAt as string,
    defaults,
    rolePresets,
    characterThemes,
    characters: categories.characters as ContentCharacterEntry[],
    voices: categories.voices as ContentVoiceEntry[],
    dialoguePacks: categories.dialoguePacks as ContentDialoguePackEntry[],
    themes: categories.themes as ContentThemeEntry[],
    backgrounds: categories.backgrounds as ContentBackgroundEntry[],
    fonts: categories.fonts as ContentFontEntry[],
  }
  if (defaultRoleTheme !== undefined) (library as { -readonly [K in keyof ContentLibrary]: ContentLibrary[K] }).defaultRoleTheme = defaultRoleTheme
  if (legacy) (library as { -readonly [K in keyof ContentLibrary]: ContentLibrary[K] }).legacy = true
  return deepFreeze(library)
}

// ---------------------------------------------------------------------------
// Third-party pack validation
// ---------------------------------------------------------------------------

function parsePackLicense(raw: unknown, path: string, issues: ContentIssue[]): ContentPackLicense | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-license', 'license must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['spdx', 'attribution', 'url', 'file'], path, issues)
  const spdx = readStringField(raw, 'spdx', path + '.spdx', issues)
  if (spdx !== undefined && !SPDX_PATTERN.test(spdx)) {
    addIssue(issues, path + '.spdx', 'invalid-license', 'spdx must be a licence id like CC-BY-4.0')
  }
  const attribution = readPlainText(raw, 'attribution', path + '.attribution', issues, {
    maxChars: CONTENT_LIMITS.maxLicenseAttributionChars,
  })
  let url: string | undefined
  if (raw.url !== undefined) {
    url = parseHttpsUrl(raw.url, path + '.url', issues)
  }
  let file: string | undefined
  if (raw.file !== undefined) {
    file = parseSafePath(raw.file, path + '.file', issues, { leadingSlash: false, maxChars: 160 })
  }
  if (spdx === undefined || attribution === undefined || (raw.url !== undefined && url === undefined) || (raw.file !== undefined && file === undefined)) {
    return undefined
  }
  const license: { spdx: string; attribution: string; url?: string; file?: string } = { spdx, attribution }
  if (url !== undefined) license.url = url
  if (file !== undefined) license.file = file
  return license
}

function parseHttpsUrl(raw: unknown, path: string, issues: ContentIssue[]): string | undefined {
  if (typeof raw !== 'string' || countCodePoints(raw) > CONTENT_LIMITS.maxRemoteUrlChars) {
    addIssue(issues, path, 'invalid-type', 'expected a bounded URL string')
    return undefined
  }
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    addIssue(issues, path, 'invalid-type', 'invalid URL')
    return undefined
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    addIssue(issues, path, 'invalid-type', 'only credential-free HTTPS URLs are allowed')
    return undefined
  }
  return parsed.href
}

function parsePackCompatibility(raw: unknown, path: string, issues: ContentIssue[]): ContentPackCompatibility | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'incompatible', 'compatibility must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['library', 'minAppVersion', 'maxAppVersion'], path, issues)
  const library = readStringField(raw, 'library', path + '.library', issues)
  if (library !== undefined && library !== CONTENT_LIBRARY_SCHEMA_V1 && library !== CONTENT_LIBRARY_SCHEMA) {
    addIssue(issues, path + '.library', 'incompatible', 'pack targets ' + library + ', host is ' + CONTENT_LIBRARY_SCHEMA)
  }
  let minAppVersion: string | undefined
  if (raw.minAppVersion !== undefined) {
    minAppVersion = readStringField(raw, 'minAppVersion', path + '.minAppVersion', issues)
    if (minAppVersion !== undefined && !SEMVER_PATTERN.test(minAppVersion)) {
      addIssue(issues, path + '.minAppVersion', 'invalid-version', 'minAppVersion must be SemVer')
    }
  }
  let maxAppVersion: string | undefined
  if (raw.maxAppVersion !== undefined) {
    maxAppVersion = readStringField(raw, 'maxAppVersion', path + '.maxAppVersion', issues)
    if (maxAppVersion !== undefined && !SEMVER_PATTERN.test(maxAppVersion)) {
      addIssue(issues, path + '.maxAppVersion', 'invalid-version', 'maxAppVersion must be SemVer')
    }
  }
  if (library === undefined || (library !== CONTENT_LIBRARY_SCHEMA && library !== CONTENT_LIBRARY_SCHEMA_V1)) return undefined
  const compatibility: { library: string; minAppVersion?: string; maxAppVersion?: string } = { library }
  if (minAppVersion !== undefined) compatibility.minAppVersion = minAppVersion
  if (maxAppVersion !== undefined) compatibility.maxAppVersion = maxAppVersion
  return compatibility
}

function parsePackBoundaries(raw: unknown, path: string, issues: ContentIssue[]): ContentPackBoundaries | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-boundary', 'boundaries must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['network', 'scripts', 'html', 'externalResources', 'paths', 'maxTextChars', 'maxEntries'], path, issues)
  const network = readBooleanField(raw, 'network', path + '.network', issues)
  const scripts = readBooleanField(raw, 'scripts', path + '.scripts', issues)
  const html = readBooleanField(raw, 'html', path + '.html', issues)
  const externalResources = readBooleanField(raw, 'externalResources', path + '.externalResources', issues)
  const paths = readStringField(raw, 'paths', path + '.paths', issues)
  const maxTextChars = readNumberField(raw, 'maxTextChars', path + '.maxTextChars', issues, {
    min: 1,
    max: CONTENT_LIMITS.maxPackTextChars,
    integer: true,
  })
  const maxEntries = readNumberField(raw, 'maxEntries', path + '.maxEntries', issues, {
    min: 1,
    max: CONTENT_LIMITS.maxPackEntries,
    integer: true,
  })
  if (network !== false) addIssue(issues, path + '.network', 'invalid-boundary', 'network must be false in content-pack 0.1')
  if (scripts !== false) addIssue(issues, path + '.scripts', 'invalid-boundary', 'scripts must be false in content-pack 0.1')
  if (html !== false) addIssue(issues, path + '.html', 'invalid-boundary', 'html must be false in content-pack 0.1')
  if (externalResources !== false) addIssue(issues, path + '.externalResources', 'invalid-boundary', 'externalResources must be false')
  if (paths !== 'relative-only') addIssue(issues, path + '.paths', 'invalid-boundary', 'paths must be "relative-only"')
  if (
    network !== false ||
    scripts !== false ||
    html !== false ||
    externalResources !== false ||
    paths !== 'relative-only' ||
    maxTextChars === undefined ||
    maxEntries === undefined
  ) {
    return undefined
  }
  return { network: false, scripts: false, html: false, externalResources: false, paths: 'relative-only', maxTextChars, maxEntries }
}

function parsePackAi(raw: unknown, path: string, issues: ContentIssue[]): ContentPackAi | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'missing-ai-disclosure', 'ai must be an object with generated + disclosure')
    return undefined
  }
  checkUnknownKeys(raw, ['generated', 'disclosure'], path, issues)
  const generated = readBooleanField(raw, 'generated', path + '.generated', issues)
  const disclosure = readPlainText(raw, 'disclosure', path + '.disclosure', issues, {
    maxChars: CONTENT_LIMITS.maxAiDisclosureChars,
  })
  if (generated === true && disclosure !== undefined && countCodePoints(disclosure) < 4) {
    addIssue(issues, path + '.disclosure', 'missing-ai-disclosure', 'AI-generated content needs a real disclosure')
    return undefined
  }
  if (generated === undefined || disclosure === undefined) return undefined
  return { generated, disclosure }
}

function parsePackFile(raw: unknown, path: string, issues: ContentIssue[]): ContentPackFile | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'file must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['path', 'bytes', 'sha256'], path, issues)
  const filePath = parseSafePath(raw.path, path + '.path', issues, {
    leadingSlash: false,
    extensions: CONTENT_FILE_EXTENSIONS,
    maxChars: 160,
  })
  let bytes: number | undefined
  if (raw.bytes !== undefined) {
    bytes = readNumberField(raw, 'bytes', path + '.bytes', issues, { min: 0, max: CONTENT_LIMITS.maxFileBytes, integer: true })
  }
  let sha256: string | undefined
  if (raw.sha256 !== undefined) {
    const rawSha = readStringField(raw, 'sha256', path + '.sha256', issues)
    if (rawSha !== undefined && !SHA256_PATTERN.test(rawSha)) {
      addIssue(issues, path + '.sha256', 'invalid-type', 'sha256 must be lowercase hex (64 chars)')
    } else {
      sha256 = rawSha
    }
  }
  if (filePath === undefined || (raw.bytes !== undefined && bytes === undefined) || (raw.sha256 !== undefined && sha256 === undefined)) {
    return undefined
  }
  const file: { path: string; bytes?: number; sha256?: string } = { path: filePath }
  if (bytes !== undefined) file.bytes = bytes
  if (sha256 !== undefined) file.sha256 = sha256
  return file
}

/** Validate one third-party content pack; returns issues instead of throwing. */
export function validateContentPack(input: unknown): ContentPackValidation {
  const issues: ContentIssue[] = []
  const pack = parseContentPack(input, issues)
  return issues.length === 0 && pack !== undefined ? { ok: true, pack } : { ok: false, issues }
}

function parseContentPack(input: unknown, issues: ContentIssue[]): ContentPack | undefined {
  if (!isRecord(input)) {
    addIssue(issues, '$', 'invalid-type', 'content pack must be an object')
    return undefined
  }
  checkUnknownKeys(
    input,
    ['schema', 'id', 'name', 'version', 'category', 'description', 'license', 'compatibility', 'boundaries', 'ai', 'entries', 'files', 'createdAt'],
    '$',
    issues,
  )
  const schema = readStringField(input, 'schema', '$.schema', issues)
  if (schema !== undefined && schema !== CONTENT_PACK_SCHEMA) {
    addIssue(issues, '$.schema', 'invalid-schema', 'expected ' + CONTENT_PACK_SCHEMA)
  }
  const id = parsePackId(input.id, '$.id', issues)
  const name = readPlainText(input, 'name', '$.name', issues, { maxChars: CONTENT_LIMITS.maxNameChars })
  const version = readStringField(input, 'version', '$.version', issues)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    addIssue(issues, '$.version', 'invalid-version', 'version must be SemVer')
  }
  let category: ContentCategory | undefined
  const rawCategory = input.category
  if (typeof rawCategory !== 'string') {
    addIssue(issues, '$.category', 'missing-field', 'category is required')
  } else if (!(CONTENT_CATEGORIES as readonly string[]).includes(rawCategory)) {
    addIssue(issues, '$.category', 'unknown-category', 'unknown category: ' + rawCategory.slice(0, 32))
  } else {
    category = rawCategory as ContentCategory
  }
  const description = readPlainText(input, 'description', '$.description', issues, {
    maxChars: CONTENT_LIMITS.maxDescriptionChars,
  })
  const license = input.license === undefined ? (addIssue(issues, '$.license', 'missing-field', 'license is required'), undefined) : parsePackLicense(input.license, '$.license', issues)
  const compatibility = parsePackCompatibility(input.compatibility, '$.compatibility', issues)
  const boundaries = parsePackBoundaries(input.boundaries, '$.boundaries', issues)
  const ai = parsePackAi(input.ai, '$.ai', issues)
  let entries: ContentEntry[] = []
  const rawEntries = input.entries
  if (!Array.isArray(rawEntries)) {
    addIssue(issues, '$.entries', 'invalid-type', 'entries must be an array')
  } else if (rawEntries.length === 0 || rawEntries.length > CONTENT_LIMITS.maxPackEntries) {
    addIssue(issues, '$.entries', 'too-many-entries', 'entries must be 1..' + CONTENT_LIMITS.maxPackEntries)
  } else if (category !== undefined) {
    entries = parseEntryArray(rawEntries, '$.entries', issues, category, PACK_ENTRY_OPTIONS, CONTENT_LIMITS.maxPackEntries)
    const declaredMaxEntries = boundaries?.maxEntries
    if (declaredMaxEntries !== undefined && rawEntries.length > declaredMaxEntries) {
      addIssue(issues, '$.entries', 'too-many-entries', rawEntries.length + ' entries > declared boundaries.maxEntries ' + declaredMaxEntries)
    }
    let textChars = 0
    for (const entry of entries) {
      textChars += countCodePoints(entry.name) + countCodePoints(entry.description)
      if ('saysOverrides' in entry && entry.saysOverrides) {
        for (const lines of Object.values(entry.saysOverrides)) {
          for (const line of lines) textChars += countCodePoints(line)
        }
      }
    }
    if (boundaries !== undefined && textChars > boundaries.maxTextChars) {
      addIssue(issues, '$.entries', 'too-large', 'entries text ' + textChars + ' > declared boundaries.maxTextChars ' + boundaries.maxTextChars)
    }
    if (textChars > CONTENT_LIMITS.maxPackTextChars) {
      addIssue(issues, '$.entries', 'too-large', 'entries text ' + textChars + ' > hard cap ' + CONTENT_LIMITS.maxPackTextChars)
    }
  }
  let files: ContentPackFile[] | undefined
  if (input.files !== undefined) {
    const rawFiles = readArrayField(input, 'files', '$.files', issues)
    if (rawFiles !== undefined) {
      if (rawFiles.length > CONTENT_LIMITS.maxPackFiles) {
        addIssue(issues, '$.files', 'too-many-files', rawFiles.length + ' files > ' + CONTENT_LIMITS.maxPackFiles)
      } else {
        const parsedFiles: ContentPackFile[] = []
        const seenPaths = new Set<string>()
        let totalBytes = 0
        let bytesKnown = true
        for (let index = 0; index < rawFiles.length; index += 1) {
          const file = parsePackFile(rawFiles[index], '$.files[' + index + ']', issues)
          if (file === undefined) continue
          if (seenPaths.has(file.path)) {
            addIssue(issues, '$.files[' + index + '].path', 'duplicate-id', 'duplicate file path: ' + file.path)
            continue
          }
          seenPaths.add(file.path)
          if (file.bytes === undefined) bytesKnown = false
          else totalBytes += file.bytes
          parsedFiles.push(file)
        }
        if (bytesKnown && totalBytes > CONTENT_LIMITS.maxPackBytes) {
          addIssue(issues, '$.files', 'too-large', 'declared files ' + totalBytes + ' bytes > ' + CONTENT_LIMITS.maxPackBytes)
        }
        files = parsedFiles
      }
    }
  }
  let createdAt: string | undefined
  if (input.createdAt !== undefined) {
    createdAt = readStringField(input, 'createdAt', '$.createdAt', issues)
    if (createdAt !== undefined && !DATE_PATTERN.test(createdAt)) {
      addIssue(issues, '$.createdAt', 'invalid-text', 'createdAt must be YYYY-MM-DD')
    }
  }
  let jsonBytes = 0
  try {
    jsonBytes = countCodePoints(JSON.stringify(input))
  } catch {
    jsonBytes = 0
  }
  if (jsonBytes > CONTENT_LIMITS.maxPackJsonBytes) {
    addIssue(issues, '$', 'too-large', 'pack JSON is ' + jsonBytes + ' chars > ' + CONTENT_LIMITS.maxPackJsonBytes)
  }
  if (
    issues.length > 0 ||
    schema !== CONTENT_PACK_SCHEMA ||
    id === undefined ||
    name === undefined ||
    version === undefined ||
    category === undefined ||
    description === undefined ||
    license === undefined ||
    compatibility === undefined ||
    boundaries === undefined ||
    ai === undefined ||
    entries.length === 0
  ) {
    return undefined
  }
  const pack: ContentPack = {
    schema: CONTENT_PACK_SCHEMA,
    id,
    name,
    version,
    category,
    description,
    license,
    compatibility,
    boundaries,
    ai,
    entries,
  }
  if (files !== undefined) (pack as { -readonly [K in keyof ContentPack]: ContentPack[K] }).files = files
  if (createdAt !== undefined) (pack as { -readonly [K in keyof ContentPack]: ContentPack[K] }).createdAt = createdAt
  return deepFreeze(pack)
}

// ---------------------------------------------------------------------------
// Merge installed packs
// ---------------------------------------------------------------------------

export type ContentMergeConflictCode = 'builtin-shadow' | 'duplicate-installed'
export type ContentPackSkipCode = 'invalid-pack' | 'duplicate-pack-id' | 'incompatible-pack'

export interface ContentMergeConflict {
  readonly packId: string
  readonly category: ContentCategory
  readonly id: string
  readonly code: ContentMergeConflictCode
}

export interface ContentPackSkip {
  readonly packId: string
  readonly code: ContentPackSkipCode
  readonly reason: string
  readonly issues?: readonly ContentIssue[]
}

export interface ContentMergeResult {
  readonly library: ContentLibrary
  readonly added: readonly ContentEntry[]
  readonly conflicts: readonly ContentMergeConflict[]
  readonly skippedPacks: readonly ContentPackSkip[]
  readonly packIds: readonly string[]
}

function compareSemver(left: string, right: string): number {
  const split = (value: string): { main: number[]; pre: string[] } => {
    const [mainPart = '', prePart = ''] = value.split('-', 2)
    const main = mainPart.split('.').map((part) => Number.parseInt(part, 10) || 0)
    const pre = prePart ? prePart.split('.') : []
    return { main, pre }
  }
  const a = split(left)
  const b = split(right)
  for (let index = 0; index < 3; index += 1) {
    const diff = (a.main[index] ?? 0) - (b.main[index] ?? 0)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  if (a.pre.length === 0 && b.pre.length > 0) return 1
  if (a.pre.length > 0 && b.pre.length === 0) return -1
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index += 1) {
    const leftPart = a.pre[index]
    const rightPart = b.pre[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNum = Number.parseInt(leftPart, 10)
    const rightNum = Number.parseInt(rightPart, 10)
    if (Number.isFinite(leftNum) && Number.isFinite(rightNum) && leftNum !== rightNum) return leftNum < rightNum ? -1 : 1
    return leftPart < rightPart ? -1 : 1
  }
  return 0
}

function packCompatible(pack: ContentPack, library: ContentLibrary): boolean {
  // v1 packs target famling.content/0.1; a v2 host keeps accepting them through
  // the deprecated adapter (their six-component payload is still safe data).
  const target = pack.compatibility.library
  if (target !== library.schema && !(target === CONTENT_LIBRARY_SCHEMA_V1 && library.schema === CONTENT_LIBRARY_SCHEMA)) return false
  const min = pack.compatibility.minAppVersion
  if (min !== undefined && compareSemver(library.version, min) < 0) return false
  const max = pack.compatibility.maxAppVersion
  if (max !== undefined && compareSemver(library.version, max) > 0) return false
  return true
}

/**
 * Merge validated third-party packs into the built-in catalog.
 *
 * Precedence and deterministic rules:
 * 1. an installed pack may never shadow a built-in entry ("builtin-shadow");
 * 2. duplicate pack ids are ambiguous, so EVERY pack with that id is skipped;
 * 3. packs are applied in input order; first installed entry with an id wins and
 *    later duplicates are reported ("duplicate-installed");
 * 4. incompatible/invalid packs are skipped and reported, never thrown;
 * 5. the input library is not mutated.
 */
export function mergeInstalledPacks(library: ContentLibrary, packs: readonly unknown[]): ContentMergeResult {
  const skippedPacks: ContentPackSkip[] = []
  const conflicts: ContentMergeConflict[] = []
  const validated: ContentPack[] = []
  const packIdCounts = new Map<string, number>()
  for (let index = 0; index < packs.length; index += 1) {
    const raw = packs[index]
    const fallbackId = isRecord(raw) && typeof raw.id === 'string' ? raw.id.slice(0, 64) : '#packs[' + index + ']'
    const result = validateContentPack(raw)
    if (!result.ok) {
      skippedPacks.push({ packId: fallbackId, code: 'invalid-pack', reason: 'pack failed validation', issues: result.issues })
      continue
    }
    validated.push(result.pack)
    packIdCounts.set(result.pack.id, (packIdCounts.get(result.pack.id) ?? 0) + 1)
  }
  const duplicatePackIds = new Set<string>()
  for (const [packId, count] of packIdCounts) {
    if (count > 1) duplicatePackIds.add(packId)
  }
  const merged: Record<ContentCategory, ContentEntry[]> = {
    characters: [...library.characters],
    voices: [...library.voices],
    dialoguePacks: [...library.dialoguePacks],
    themes: [...library.themes],
    backgrounds: [...library.backgrounds],
    fonts: [...library.fonts],
  }
  const existing = new Map<ContentCategory, Map<string, ContentEntry>>()
  for (const category of CONTENT_CATEGORIES) {
    const map = new Map<string, ContentEntry>()
    for (const entry of merged[category]) map.set(entry.id, entry)
    existing.set(category, map)
  }
  const added: ContentEntry[] = []
  const acceptedPackIds: string[] = []
  for (const pack of validated) {
    if (duplicatePackIds.has(pack.id)) {
      skippedPacks.push({ packId: pack.id, code: 'duplicate-pack-id', reason: 'multiple packs share this id' })
      continue
    }
    if (!packCompatible(pack, library)) {
      skippedPacks.push({ packId: pack.id, code: 'incompatible-pack', reason: 'pack requires a different content library version' })
      continue
    }
    acceptedPackIds.push(pack.id)
    const category = pack.category
    const categoryMap = existing.get(category)
    if (!categoryMap) continue
    for (const entry of pack.entries) {
      const current = categoryMap.get(entry.id)
      if (current !== undefined) {
        conflicts.push({
          packId: pack.id,
          category,
          id: entry.id,
          code: current.source === 'builtin' ? 'builtin-shadow' : 'duplicate-installed',
        })
        continue
      }
      const installedEntry: ContentEntry = { ...entry, source: 'local' }
      categoryMap.set(entry.id, installedEntry)
      merged[category].push(installedEntry)
      added.push(installedEntry)
    }
  }
  const nextLibrary = deepFreeze({
    ...library,
    characters: merged.characters as readonly ContentCharacterEntry[],
    voices: merged.voices as readonly ContentVoiceEntry[],
    dialoguePacks: merged.dialoguePacks as readonly ContentDialoguePackEntry[],
    themes: merged.themes as readonly ContentThemeEntry[],
    backgrounds: merged.backgrounds as readonly ContentBackgroundEntry[],
    fonts: merged.fonts as readonly ContentFontEntry[],
  }) as ContentLibrary
  return Object.freeze({
    library: nextLibrary,
    added: Object.freeze(added),
    conflicts: Object.freeze(conflicts),
    skippedPacks: Object.freeze(skippedPacks),
    packIds: Object.freeze(acceptedPackIds),
  })
}

// ---------------------------------------------------------------------------
// List / find helpers + two-product mapping
// ---------------------------------------------------------------------------

/** Content character id -> famling renderer id / dsh-famling character id. */
export const CONTENT_CHARACTER_PRODUCT_IDS: Readonly<
  Record<CharacterKind, { readonly famling: string; readonly dshFamling: 'human' | 'cat' | 'dog' | null }>
> = Object.freeze({
  dog: { famling: 'dog', dshFamling: 'dog' },
  cat: { famling: 'cat', dshFamling: 'cat' },
  humanoid: { famling: 'humanoid', dshFamling: 'human' },
  origami: { famling: 'origami', dshFamling: null },
})

export function isContentCategory(value: unknown): value is ContentCategory {
  return typeof value === 'string' && (CONTENT_CATEGORIES as readonly string[]).includes(value)
}

/** List every entry of one category in catalog order. */
export function listContent(library: ContentLibrary, category: ContentCategory): readonly ContentEntry[] {
  return library[category] as readonly ContentEntry[]
}

/** Find one entry by id across the given category (undefined when absent). */
export function findContent(library: ContentLibrary, category: ContentCategory, id: string): ContentEntry | undefined {
  return listContent(library, category).find((entry) => entry.id === id)
}

/** True when this voice may be used by this character (human presentations only). */
export function isVoiceAvailableFor(voice: ContentVoiceEntry, characterId: string): boolean {
  return voice.available && voice.availableFor.includes(characterId)
}

/** Default local voice for a character; undefined for silent characters. */
export function resolveVoiceForCharacter(
  library: ContentLibrary,
  characterId: string,
  preferredVoiceId?: string,
): ContentVoiceEntry | undefined {
  const character = findContent(library, 'characters', characterId) as ContentCharacterEntry | undefined
  if (!character || character.voiceMode !== 'tts') return undefined
  if (preferredVoiceId !== undefined) {
    const preferred = findContent(library, 'voices', preferredVoiceId) as ContentVoiceEntry | undefined
    if (preferred && isVoiceAvailableFor(preferred, characterId)) return preferred
  }
  return library.voices.find((voice) => isVoiceAvailableFor(voice, characterId))
}

// ---------------------------------------------------------------------------
// Selection persistence (existing safe-storage; injectable)
// ---------------------------------------------------------------------------

/** Version of the per-key selection envelope ({ v: 1, data: { id } }). */
export const CONTENT_SELECTION_STORAGE_VERSION = 1

/** localStorage keys for each user choice, versioned through safe-storage. */
export const CONTENT_SELECTION_KEYS: Readonly<Record<SelectionKey, string>> = Object.freeze({
  character: 'desktop-games/pet/content/character',
  voice: 'desktop-games/pet/content/voice',
  dialoguePack: 'desktop-games/pet/content/dialogue-pack',
  theme: 'desktop-games/pet/content/theme',
  background: 'desktop-games/pet/content/background',
  font: 'desktop-games/pet/content/font',
})

export type SelectionReadSource = 'stored' | 'default' | 'invalid'

export interface ContentSelectionReadResult {
  readonly selection: ContentSelection
  readonly sources: Readonly<Record<SelectionKey, SelectionReadSource>>
}

export interface ContentSelectionWriteResult {
  readonly ok: boolean
  readonly results: Readonly<Record<SelectionKey, StorageWriteStatus | 'invalid'>>
}

function availableSelectionEntry(library: ContentLibrary, key: SelectionKey, id: string): ContentEntry | undefined {
  const entry = findContent(library, CONTENT_SELECTION_CATEGORY[key], id)
  return entry && entry.available ? entry : undefined
}

/** Read the saved selection with per-key fallback to the library defaults. */
export function readContentSelectionDetailed(library: ContentLibrary, storage?: StorageLike | null): ContentSelectionReadResult {
  const selection: { -readonly [K in keyof ContentSelection]: string } = { ...library.defaults }
  const sources: { -readonly [K in keyof ContentSelection]: SelectionReadSource } = {
    character: 'default',
    voice: 'default',
    dialoguePack: 'default',
    theme: 'default',
    background: 'default',
    font: 'default',
  }
  for (const key of SELECTION_KEYS) {
    const result = readVersioned<{ id: string }>(
      CONTENT_SELECTION_KEYS[key],
      {
        version: CONTENT_SELECTION_STORAGE_VERSION,
        maxBytes: CONTENT_LIMITS.maxSelectionBytes,
        validate: (value) => {
          if (!isRecord(value) || typeof value.id !== 'string') return undefined
          const entry = availableSelectionEntry(library, key, value.id)
          return entry ? { id: entry.id } : undefined
        },
      },
      storage,
    )
    if (result.status === 'ok' && result.value !== undefined) {
      selection[key] = result.value.id
      sources[key] = 'stored'
      continue
    }
    if (result.status !== 'missing') sources[key] = 'invalid'
    selection[key] = library.defaults[key]
  }
  return Object.freeze({ selection: deepFreeze({ ...selection }), sources: deepFreeze({ ...sources }) })
}

/** Convenience reader: returns only the selection object. */
export function readContentSelection(library: ContentLibrary, storage?: StorageLike | null): ContentSelection {
  return readContentSelectionDetailed(library, storage).selection
}

/**
 * Persist a selection. Invalid/unknown ids are refused per key (status
 * "invalid") instead of being written; valid keys are still stored so a single
 * stale choice cannot block the others.
 */
export function writeContentSelection(
  library: ContentLibrary,
  selection: Partial<ContentSelection>,
  storage?: StorageLike | null,
): ContentSelectionWriteResult {
  const results: { -readonly [K in keyof ContentSelection]: StorageWriteStatus | 'invalid' } = {
    character: 'invalid',
    voice: 'invalid',
    dialoguePack: 'invalid',
    theme: 'invalid',
    background: 'invalid',
    font: 'invalid',
  }
  let ok = true
  for (const key of SELECTION_KEYS) {
    const id = selection[key]
    if (typeof id !== 'string' || !availableSelectionEntry(library, key, id)) {
      results[key] = 'invalid'
      ok = false
      continue
    }
    const status = writeVersioned(
      CONTENT_SELECTION_KEYS[key],
      { id },
      { version: CONTENT_SELECTION_STORAGE_VERSION, maxBytes: CONTENT_LIMITS.maxSelectionBytes },
      storage,
    )
    results[key] = status.status
    if (status.status !== 'ok') ok = false
  }
  return Object.freeze({ ok, results: Object.freeze({ ...results }) })
}

/** Remove every stored selection key (falls back to library defaults next read). */
export function clearContentSelection(storage?: StorageLike | null): boolean {
  let ok = true
  for (const key of SELECTION_KEYS) {
    if (!removeKey(CONTENT_SELECTION_KEYS[key], storage)) ok = false
  }
  return ok
}

// ---------------------------------------------------------------------------
// Selection resolution + dialogue behaviour
// ---------------------------------------------------------------------------

export interface ResolvedContentSelection {
  readonly selection: ContentSelection
  readonly character: ContentCharacterEntry
  /** null for silent characters (dog/cat) or when no eligible voice exists. */
  readonly voice: ContentVoiceEntry | null
  readonly dialoguePack: ContentDialoguePackEntry
  readonly theme: ContentThemeEntry
  readonly background: ContentBackgroundEntry
  readonly font: ContentFontEntry
  /** Keys whose requested id was invalid/unavailable and fell back to defaults. */
  readonly fallbacks: readonly SelectionKey[]
}

function requiredEntry<T extends ContentEntry>(library: ContentLibrary, category: ContentCategory, id: string): T {
  const entry = findContent(library, category, id)
  if (!entry) {
    throw new ContentLibraryError('invalid content library: missing entry', [
      { path: '$.' + category, code: 'unknown-reference', message: 'entry not found: ' + id },
    ])
  }
  return entry as T
}

/** Resolve a (possibly partial/stale) selection against the catalog. */
export function resolveContentSelection(
  library: ContentLibrary,
  selection?: Partial<ContentSelection> | null,
): ResolvedContentSelection {
  const fallbacks: SelectionKey[] = []
  const resolved: { -readonly [K in keyof ContentSelection]: string } = { ...library.defaults }
  for (const key of SELECTION_KEYS) {
    const wanted = selection?.[key]
    if (typeof wanted === 'string' && availableSelectionEntry(library, key, wanted)) {
      resolved[key] = wanted
    } else if (typeof wanted === 'string') {
      fallbacks.push(key)
    }
  }
  const character = requiredEntry<ContentCharacterEntry>(library, 'characters', resolved.character)
  let voice: ContentVoiceEntry | null = null
  if (character.voiceMode === 'tts') {
    const wantedVoice = findContent(library, 'voices', resolved.voice) as ContentVoiceEntry | undefined
    if (wantedVoice && isVoiceAvailableFor(wantedVoice, character.id)) {
      voice = wantedVoice
    } else {
      if (selection?.voice !== undefined) fallbacks.push('voice')
      voice = resolveVoiceForCharacter(library, character.id) ?? null
      if (voice !== null) resolved.voice = voice.id
    }
  }
  const dialoguePack = requiredEntry<ContentDialoguePackEntry>(library, 'dialoguePacks', resolved.dialoguePack)
  const theme = requiredEntry<ContentThemeEntry>(library, 'themes', resolved.theme)
  const background = requiredEntry<ContentBackgroundEntry>(library, 'backgrounds', resolved.background)
  const font = requiredEntry<ContentFontEntry>(library, 'fonts', resolved.font)
  const uniqueFallbacks = Array.from(new Set(fallbacks))
  return Object.freeze({
    selection: deepFreeze({ ...resolved }),
    character,
    voice,
    dialoguePack,
    theme,
    background,
    font,
    fallbacks: Object.freeze(uniqueFallbacks),
  })
}

export interface DialogueBehavior {
  readonly pack: ContentDialoguePackEntry
  readonly packId: string
  readonly mode: DialogueMode
  readonly bubbleChance: number
  readonly maxChars: number
  readonly saysOverrides: Readonly<Record<string, readonly string[]>>
  /** False for quiet packs: no automatic/ambient bubbles. */
  readonly ambientBubbles: boolean
  /** Sanitize + clamp one line (plain text only, never markup). */
  clampText(text: string, maxChars?: number): string
  /** Deterministic ambient-bubble decision; inject random for tests. */
  shouldShowBubble(random?: () => number): boolean
  /** Pick a reserved override line for a key; null means "use regions.json". */
  pickLine(key: string, random?: () => number): string | null
}

/**
 * Resolve the active dialogue pack into a small behaviour object.
 *
 * The reserved \`saysOverrides\` interface lets a future/installed dialogue pack
 * override individual region/action lines ("region:head", "action:pat") without
 * touching regions.json. Built-in packs do not use it, so pickLine() returns
 * null and the host keeps using its own lines.
 */
export function resolveDialogueBehavior(library: ContentLibrary, selection?: Partial<ContentSelection> | null): DialogueBehavior {
  const resolved = resolveContentSelection(library, selection)
  const pack = resolved.dialoguePack
  const overrides: Readonly<Record<string, readonly string[]>> = pack.saysOverrides ? deepFreeze({ ...pack.saysOverrides }) : Object.freeze({})
  const clampText = (text: string, maxChars?: number): string => {
    const cap = maxChars ?? pack.maxChars
    return toPlainText(text, { maxChars: cap })
  }
  const randomValue = (random?: () => number): number => {
    const value = random ? random() : Math.random()
    if (!Number.isFinite(value)) return 0
    return Math.min(0.999999, Math.max(0, value))
  }
  return Object.freeze({
    pack,
    packId: pack.id,
    mode: pack.mode,
    bubbleChance: pack.bubbleChance,
    maxChars: pack.maxChars,
    saysOverrides: overrides,
    ambientBubbles: pack.mode !== 'quiet' && pack.bubbleChance > 0,
    clampText,
    shouldShowBubble(random?: () => number): boolean {
      if (pack.mode === 'quiet' || pack.bubbleChance <= 0) return false
      return randomValue(random) < pack.bubbleChance
    },
    pickLine(key: string, random?: () => number): string | null {
      const lines = overrides[key]
      if (!lines || lines.length === 0) return null
      const index = Math.min(lines.length - 1, Math.floor(randomValue(random) * lines.length))
      const line = lines[index]
      if (line === undefined) return null
      return clampText(line)
    },
  })
}

// ---------------------------------------------------------------------------
// Appearance application (theme + background + font -> CSS vars / data attrs)
// ---------------------------------------------------------------------------

/** CSS variable names written by applyAppearance. */
export const CONTENT_THEME_VAR_NAMES = Object.freeze({
  bubbleBg: '--famling-content-bubble-bg',
  bubbleFg: '--famling-content-bubble-fg',
  bubbleBorder: '--famling-content-bubble-border',
  bubbleShadow: '--famling-content-bubble-shadow',
  panelBg: '--famling-content-panel-bg',
  panelFg: '--famling-content-panel-fg',
  bg: '--famling-content-bg',
})

export const CONTENT_BACKGROUND_VAR = '--famling-content-background'
export const CONTENT_FONT_VAR = '--famling-content-font-family'

/** data-content-* dataset keys written by applyAppearance (camelCase). */
export const CONTENT_DATASET_KEYS = Object.freeze({
  schema: 'contentSchema',
  character: 'contentCharacter',
  voice: 'contentVoice',
  dialoguePack: 'contentDialoguePack',
  theme: 'contentTheme',
  background: 'contentBackground',
  backgroundKind: 'contentBackgroundKind',
  font: 'contentFont',
})

export interface ContentStyleLike {
  setProperty(property: string, value: string): void
  removeProperty(property: string): string
}

export interface ContentAppearanceRootLike {
  readonly style: ContentStyleLike
  readonly dataset?: Record<string, string | undefined>
}

export interface ContentAppearanceDocumentLike {
  readonly documentElement: ContentAppearanceRootLike
}

export interface ContentAppearanceResult {
  readonly vars: Readonly<Record<string, string>>
  readonly dataset: Readonly<Record<string, string>>
}

const ALL_APPEARANCE_VARS: readonly string[] = Object.freeze([
  ...Object.values(CONTENT_THEME_VAR_NAMES),
  CONTENT_BACKGROUND_VAR,
  CONTENT_FONT_VAR,
])
const ALL_DATASET_KEYS: readonly string[] = Object.freeze(Object.values(CONTENT_DATASET_KEYS))
const appliedVarsByRoot = new WeakMap<object, Set<string>>()

/**
 * Apply the resolved theme/background/font once: writes namespaced CSS custom
 * properties and data-content-* attributes on documentElement.
 *
 * Idempotent: applying another selection removes variables that the previous
 * selection set but the new one does not (e.g. panel colors in a theme without
 * a panel). clearAppearance() removes everything again. No timer/listener/DOM
 * traversal and no external URL is ever written.
 */
export function applyAppearance(
  doc: ContentAppearanceDocumentLike,
  library: ContentLibrary,
  selection?: Partial<ContentSelection> | null,
): ContentAppearanceResult {
  const resolved = resolveContentSelection(library, selection)
  const vars: Record<string, string> = {}
  const themeVars = resolved.theme.vars
  vars[CONTENT_THEME_VAR_NAMES.bubbleBg] = themeVars.bubbleBg
  vars[CONTENT_THEME_VAR_NAMES.bubbleFg] = themeVars.bubbleFg
  vars[CONTENT_THEME_VAR_NAMES.bubbleBorder] = themeVars.bubbleBorder
  vars[CONTENT_THEME_VAR_NAMES.bubbleShadow] = themeVars.bubbleShadow
  if (themeVars.panelBg !== undefined) vars[CONTENT_THEME_VAR_NAMES.panelBg] = themeVars.panelBg
  if (themeVars.panelFg !== undefined) vars[CONTENT_THEME_VAR_NAMES.panelFg] = themeVars.panelFg
  if (themeVars.bg !== undefined) vars[CONTENT_THEME_VAR_NAMES.bg] = themeVars.bg
  vars[CONTENT_BACKGROUND_VAR] = resolved.background.value
  vars[CONTENT_FONT_VAR] = resolved.font.family
  const dataset: Record<string, string> = {
    [CONTENT_DATASET_KEYS.schema]: library.schema,
    [CONTENT_DATASET_KEYS.character]: resolved.selection.character,
    [CONTENT_DATASET_KEYS.voice]: resolved.voice ? resolved.voice.id : 'none',
    [CONTENT_DATASET_KEYS.dialoguePack]: resolved.selection.dialoguePack,
    [CONTENT_DATASET_KEYS.theme]: resolved.selection.theme,
    [CONTENT_DATASET_KEYS.background]: resolved.selection.background,
    [CONTENT_DATASET_KEYS.backgroundKind]: resolved.background.kind,
    [CONTENT_DATASET_KEYS.font]: resolved.selection.font,
  }
  const root = doc.documentElement
  const previous = appliedVarsByRoot.get(root) ?? new Set<string>()
  for (const name of previous) {
    if (!(name in vars)) {
      try {
        root.style.removeProperty(name)
      } catch {
        // A read-only style object must not break appearance application.
      }
    }
  }
  for (const [name, value] of Object.entries(vars)) {
    try {
      root.style.setProperty(name, value)
    } catch {
      // Ignore style write failures; the returned map is still deterministic.
    }
  }
  appliedVarsByRoot.set(root, new Set(Object.keys(vars)))
  if (root.dataset) {
    for (const key of ALL_DATASET_KEYS) {
      const value = dataset[key]
      if (value === undefined) delete root.dataset[key]
      else root.dataset[key] = value
    }
  }
  return Object.freeze({ vars: Object.freeze({ ...vars }), dataset: Object.freeze({ ...dataset }) })
}

/** Remove every CSS variable/attribute applyAppearance may write. */
export function clearAppearance(doc: ContentAppearanceDocumentLike): number {
  const root = doc.documentElement
  let removed = 0
  for (const name of ALL_APPEARANCE_VARS) {
    try {
      root.style.removeProperty(name)
      removed += 1
    } catch {
      // ignore
    }
  }
  if (root.dataset) {
    for (const key of ALL_DATASET_KEYS) delete root.dataset[key]
  }
  appliedVarsByRoot.delete(root)
  return removed
}

// ---------------------------------------------------------------------------
// Default selection helper
// ---------------------------------------------------------------------------

/** The catalog default selection (validated at parse time). */
export function defaultContentSelection(library: ContentLibrary): ContentSelection {
  return deepFreeze({ ...library.defaults })
}

// ===========================================================================
// v2: character themes ("角色就是主题") — parsing + resolution
// ===========================================================================

/** Preview path style: root-relative (built-in), pack-relative (pack), or either (installed). */
type RolePreviewPathMode = 'root' | 'relative' | 'either'

interface RoleThemeParseOptions {
  /** True for pack role themes (1..max required); false for optional library arrays. */
  readonly required: boolean
  readonly allowedSources: readonly ContentSource[]
  /** Built-in previews are root-relative; pack previews are pack-relative. */
  readonly previewLeadingSlash: boolean
  readonly previewMode?: RolePreviewPathMode
  readonly max: number
}

function parseUsageDeclaration(raw: unknown, path: string, issues: ContentIssue[]): ContentUsageDeclaration | undefined {
  if (raw === undefined) {
    addIssue(issues, path, 'missing-usage-declaration', 'usageDeclaration is required (researchOnly + canonical statement + prohibitedUses)')
    return undefined
  }
  if (!isRecord(raw)) {
    addIssue(issues, path, 'missing-usage-declaration', 'usageDeclaration must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['researchOnly', 'statement', 'statementRef', 'prohibitedUses'], path, issues)
  let ok = true
  const researchOnly = readBooleanField(raw, 'researchOnly', path + '.researchOnly', issues)
  if (researchOnly !== true) {
    addIssue(issues, path + '.researchOnly', 'invalid-usage-declaration', 'researchOnly must be true: this project is research/prototype only')
    ok = false
  }
  const statement = readStringField(raw, 'statement', path + '.statement', issues)
  if (statement !== undefined && statement !== CONTENT_USAGE_STATEMENT) {
    addIssue(issues, path + '.statement', 'usage-statement-mismatch', 'statement must be the exact canonical USE-RESTRICTIONS short sentence')
    ok = false
  }
  if (statement === undefined) ok = false
  const statementRef = readStringField(raw, 'statementRef', path + '.statementRef', issues)
  if (statementRef !== undefined && statementRef !== CONTENT_USAGE_STATEMENT_REF) {
    addIssue(issues, path + '.statementRef', 'invalid-usage-declaration', 'statementRef must be ' + CONTENT_USAGE_STATEMENT_REF)
    ok = false
  }
  if (statementRef === undefined) ok = false
  let prohibitedUses: ProhibitedUse[] | undefined
  const rawList = readArrayField(raw, 'prohibitedUses', path + '.prohibitedUses', issues)
  if (rawList !== undefined) {
    const list = parseStringList(rawList, path + '.prohibitedUses', issues, {
      min: 0,
      max: PROHIBITED_USES.length + 6,
      values: PROHIBITED_USES,
    })
    if (list === undefined) {
      ok = false
    } else {
      const present = new Set(list)
      for (const required of PROHIBITED_USES) {
        if (!present.has(required)) {
          addIssue(issues, path + '.prohibitedUses', 'missing-prohibited-use', 'prohibitedUses must include "' + required + '"')
          ok = false
        }
      }
      prohibitedUses = list as ProhibitedUse[]
    }
  } else {
    ok = false
  }
  if (!ok || prohibitedUses === undefined) return undefined
  return {
    researchOnly: true,
    statement: CONTENT_USAGE_STATEMENT,
    statementRef: CONTENT_USAGE_STATEMENT_REF,
    prohibitedUses,
  }
}

function parseAiProvenance(raw: unknown, path: string, issues: ContentIssue[]): ContentAiProvenance | undefined {
  if (raw === undefined) {
    addIssue(issues, path, 'missing-ai-provenance', 'aiProvenance is required (generated + disclosure)')
    return undefined
  }
  if (!isRecord(raw)) {
    addIssue(issues, path, 'missing-ai-provenance', 'aiProvenance must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['generated', 'disclosure', 'tools'], path, issues)
  const generated = readBooleanField(raw, 'generated', path + '.generated', issues)
  const disclosure = readPlainText(raw, 'disclosure', path + '.disclosure', issues, {
    maxChars: CONTENT_LIMITS.maxAiDisclosureChars,
  })
  if (generated === true && disclosure !== undefined && countCodePoints(disclosure) < 4) {
    addIssue(issues, path + '.disclosure', 'missing-ai-provenance', 'AI-generated content needs a real disclosure')
    return undefined
  }
  let tools: string[] | undefined
  if (raw.tools !== undefined) {
    tools = parseStringList(raw.tools, path + '.tools', issues, {
      min: 1,
      max: CONTENT_PACK_V2_LIMITS.maxAiTools,
      pattern: AI_TOOL_PATTERN,
      patternMessage: 'tool ids are lowercase ids like "deepseek-image"',
    })
    if (tools === undefined) return undefined
  }
  if (generated === undefined || disclosure === undefined) return undefined
  const provenance: { -readonly [K in keyof ContentAiProvenance]: ContentAiProvenance[K] } = { generated, disclosure }
  if (tools !== undefined) provenance.tools = tools
  return provenance
}

function parseRoleAppearance(raw: unknown, path: string, issues: ContentIssue[]): ContentRoleAppearance | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-role-theme', 'appearance must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['themeId', 'backgroundId', 'fontId'], path, issues)
  const themeId = parseEntryId(raw.themeId, path + '.themeId', issues)
  const backgroundId = parseEntryId(raw.backgroundId, path + '.backgroundId', issues)
  const fontId = parseEntryId(raw.fontId, path + '.fontId', issues)
  if (themeId === undefined || backgroundId === undefined || fontId === undefined) return undefined
  return { themeId, backgroundId, fontId }
}

function parseRoleThemePreview(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: { readonly previewLeadingSlash: boolean; readonly previewMode?: RolePreviewPathMode },
): string | undefined {
  const mode: RolePreviewPathMode = options.previewMode ?? (options.previewLeadingSlash ? 'root' : 'relative')
  if (mode === 'either') {
    if (typeof raw !== 'string') {
      addIssue(issues, path, 'invalid-path', 'expected a path string')
      return undefined
    }
    return parseSafePath(raw, path, issues, {
      leadingSlash: raw.startsWith('/'),
      extensions: ['png', 'webp'],
      maxChars: CONTENT_PACK_V2_LIMITS.maxPreviewChars,
    })
  }
  return parseSafePath(raw, path, issues, {
    leadingSlash: options.previewLeadingSlash,
    extensions: ['png', 'webp'],
    maxChars: CONTENT_PACK_V2_LIMITS.maxPreviewChars,
  })
}

function parseRoleTheme(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: { allowedSources: readonly ContentSource[]; previewLeadingSlash: boolean; previewMode?: RolePreviewPathMode },
): ContentCharacterTheme | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-role-theme', 'character theme must be an object')
    return undefined
  }
  checkUnknownKeys(
    raw,
    [
      'id',
      'name',
      'description',
      'characterId',
      'voiceId',
      'dialoguePackId',
      'appearance',
      'behaviorPreset',
      'preview',
      'designRef',
      'usageDeclaration',
      'version',
      'source',
      'author',
      'license',
      'aiProvenance',
    ],
    path,
    issues,
  )
  const id = parseEntryId(raw.id, path + '.id', issues)
  const name = readPlainText(raw, 'name', path + '.name', issues, { maxChars: CONTENT_LIMITS.maxNameChars })
  const description = readPlainText(raw, 'description', path + '.description', issues, {
    maxChars: CONTENT_LIMITS.maxDescriptionChars,
  })
  const characterId = parseEntryId(raw.characterId, path + '.characterId', issues)
  const dialoguePackId = parseEntryId(raw.dialoguePackId, path + '.dialoguePackId', issues)
  let voiceId: string | undefined
  const rawVoiceId = readStringField(raw, 'voiceId', path + '.voiceId', issues)
  if (rawVoiceId !== undefined) {
    voiceId = rawVoiceId === 'none' ? 'none' : parseEntryId(rawVoiceId, path + '.voiceId', issues)
  }
  const appearance = parseRoleAppearance(raw.appearance, path + '.appearance', issues)
  let behaviorPreset: string | undefined
  if (raw.behaviorPreset !== undefined) {
    const rawBehavior = readStringField(raw, 'behaviorPreset', path + '.behaviorPreset', issues)
    if (rawBehavior !== undefined) {
      if (!BEHAVIOR_PRESET_PATTERN.test(rawBehavior) || rawBehavior.length > 64) {
        addIssue(issues, path + '.behaviorPreset', 'invalid-id', 'behaviorPreset must be a lowercase dot/dash id (max 64)')
      } else {
        behaviorPreset = rawBehavior
      }
    }
  }
  const preview = parseRoleThemePreview(raw.preview, path + '.preview', issues, options)
  const designRef = parseSafePath(raw.designRef, path + '.designRef', issues, {
    leadingSlash: false,
    extensions: ['md'],
    maxChars: CONTENT_PACK_V2_LIMITS.maxDesignRefChars,
  })
  const usageDeclaration = parseUsageDeclaration(raw.usageDeclaration, path + '.usageDeclaration', issues)
  const version = readStringField(raw, 'version', path + '.version', issues)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    addIssue(issues, path + '.version', 'invalid-version', 'version must be SemVer')
  }
  let source: ContentSource | undefined
  const rawSource = raw.source
  if (typeof rawSource !== 'string' || !(CONTENT_SOURCES as readonly string[]).includes(rawSource)) {
    addIssue(issues, path + '.source', 'invalid-type', 'source must be builtin, local or remote')
  } else if (!options.allowedSources.includes(rawSource as ContentSource)) {
    addIssue(issues, path + '.source', 'invalid-type', 'source is not allowed for this document')
  } else {
    source = rawSource as ContentSource
  }
  const author = readPlainText(raw, 'author', path + '.author', issues, {
    maxChars: CONTENT_PACK_V2_LIMITS.maxAuthorChars,
  })
  const license = raw.license === undefined
    ? (addIssue(issues, path + '.license', 'missing-field', 'license is required'), undefined)
    : parsePackLicense(raw.license, path + '.license', issues)
  const aiProvenance = parseAiProvenance(raw.aiProvenance, path + '.aiProvenance', issues)
  if (
    id === undefined ||
    name === undefined ||
    description === undefined ||
    characterId === undefined ||
    voiceId === undefined ||
    dialoguePackId === undefined ||
    appearance === undefined ||
    (raw.behaviorPreset !== undefined && behaviorPreset === undefined) ||
    preview === undefined ||
    designRef === undefined ||
    usageDeclaration === undefined ||
    version === undefined ||
    source === undefined ||
    author === undefined ||
    license === undefined ||
    aiProvenance === undefined
  ) {
    return undefined
  }
  const theme: { -readonly [K in keyof ContentCharacterTheme]: ContentCharacterTheme[K] } = {
    id,
    name,
    description,
    characterId,
    voiceId,
    dialoguePackId,
    appearance,
    preview,
    designRef,
    usageDeclaration,
    version,
    source,
    author,
    license,
    aiProvenance,
  }
  if (behaviorPreset !== undefined) theme.behaviorPreset = behaviorPreset
  return theme
}

function parseRoleThemeArray(
  raw: unknown,
  path: string,
  issues: ContentIssue[],
  options: RoleThemeParseOptions,
): ContentCharacterTheme[] {
  if (raw === undefined) {
    if (options.required) addIssue(issues, path, 'missing-field', 'roleThemes array is required')
    return []
  }
  if (!Array.isArray(raw)) {
    addIssue(issues, path, 'invalid-type', 'expected an array of character themes')
    return []
  }
  if (raw.length === 0 && options.required) {
    addIssue(issues, path, 'invalid-role-theme', 'at least one character theme is required')
    return []
  }
  if (raw.length > options.max) {
    addIssue(issues, path, 'too-many-entries', raw.length + ' character themes > ' + options.max)
    return []
  }
  const out: ContentCharacterTheme[] = []
  const seen = new Set<string>()
  for (let index = 0; index < raw.length; index += 1) {
    const theme = parseRoleTheme(raw[index], path + '[' + index + ']', issues, {
      allowedSources: options.allowedSources,
      previewLeadingSlash: options.previewLeadingSlash,
      ...(options.previewMode !== undefined ? { previewMode: options.previewMode } : {}),
    })
    if (theme === undefined) continue
    if (seen.has(theme.id)) {
      addIssue(issues, path + '[' + index + '].id', 'duplicate-id', 'duplicate character theme id: ' + theme.id)
      continue
    }
    seen.add(theme.id)
    out.push(theme)
  }
  return out
}

function checkRoleThemeDuplicates(
  presets: readonly ContentCharacterTheme[],
  installed: readonly ContentCharacterTheme[],
  issues: ContentIssue[],
): void {
  const presetIds = new Set(presets.map((theme) => theme.id))
  for (const theme of installed) {
    if (presetIds.has(theme.id)) {
      addIssue(issues, '$.characterThemes', 'builtin-shadow', 'character theme id shadows a built-in role preset: ' + theme.id)
    }
  }
}

/** All available character themes: built-in presets first, then installed/derived. */
export function listCharacterThemes(library: ContentLibrary): readonly ContentCharacterTheme[] {
  return Object.freeze([...library.rolePresets, ...library.characterThemes])
}

/** Find one character theme by id across rolePresets and installed characterThemes. */
export function findCharacterTheme(library: ContentLibrary, id: string): ContentCharacterTheme | undefined {
  return findRoleThemeIn(library.rolePresets, library.characterThemes, id)
}

function findRoleThemeIn(
  presets: readonly ContentCharacterTheme[],
  installed: readonly ContentCharacterTheme[],
  id: string,
): ContentCharacterTheme | undefined {
  return presets.find((theme) => theme.id === id) ?? installed.find((theme) => theme.id === id)
}

function checkRoleThemeReferences(
  themes: readonly ContentCharacterTheme[],
  basePath: string,
  categories: Readonly<Record<ContentCategory, readonly ContentEntry[]>>,
  issues: ContentIssue[],
): void {
  for (let index = 0; index < themes.length; index += 1) {
    const theme = themes[index]
    if (theme === undefined) continue
    const path = basePath + '[' + index + ']'
    const character = categories.characters.find((entry) => entry.id === theme.characterId) as ContentCharacterEntry | undefined
    if (character === undefined) {
      addIssue(issues, path + '.characterId', 'unknown-reference', 'character not found: ' + theme.characterId)
    } else {
      if (!character.available) addIssue(issues, path + '.characterId', 'unavailable', 'character is not available: ' + theme.characterId)
      if (character.voiceMode === 'none') {
        if (theme.voiceId !== 'none') {
          addIssue(issues, path + '.voiceId', 'invalid-role-theme', 'silent characters (cat/dog) require voiceId "none"')
        }
      } else if (theme.voiceId === 'none') {
        addIssue(issues, path + '.voiceId', 'invalid-role-theme', 'human presentations need a voice (cannot be "none")')
      } else {
        const voice = categories.voices.find((entry) => entry.id === theme.voiceId) as ContentVoiceEntry | undefined
        if (voice === undefined) {
          addIssue(issues, path + '.voiceId', 'unknown-reference', 'voice not found: ' + theme.voiceId)
        } else if (!voice.available) {
          addIssue(issues, path + '.voiceId', 'unavailable', 'voice is not available: ' + theme.voiceId)
        } else if (!isVoiceAvailableFor(voice, theme.characterId)) {
          addIssue(issues, path + '.voiceId', 'invalid-role-theme', 'voice ' + theme.voiceId + ' is not available for character ' + theme.characterId)
        }
      }
    }
    const dialoguePack = categories.dialoguePacks.find((entry) => entry.id === theme.dialoguePackId)
    if (dialoguePack === undefined) {
      addIssue(issues, path + '.dialoguePackId', 'unknown-reference', 'dialogue pack not found: ' + theme.dialoguePackId)
    } else if (!dialoguePack.available) {
      addIssue(issues, path + '.dialoguePackId', 'unavailable', 'dialogue pack is not available: ' + theme.dialoguePackId)
    }
    const appearanceChecks: ReadonlyArray<readonly [ContentCategory, string, string]> = [
      ['themes', 'themeId', theme.appearance.themeId],
      ['backgrounds', 'backgroundId', theme.appearance.backgroundId],
      ['fonts', 'fontId', theme.appearance.fontId],
    ]
    for (const [category, field, id] of appearanceChecks) {
      const entry = categories[category].find((candidate) => candidate.id === id)
      if (entry === undefined) {
        addIssue(issues, path + '.appearance.' + field, 'unknown-reference', category + ' entry not found: ' + id)
      } else if (!entry.available) {
        addIssue(issues, path + '.appearance.' + field, 'unavailable', category + ' entry is not available: ' + id)
      }
    }
  }
}

/** A character theme resolved against the live catalog. */
export interface ResolvedCharacterTheme {
  readonly theme: ContentCharacterTheme
  readonly character: ContentCharacterEntry
  /** null for silent characters (cat/dog). */
  readonly voice: ContentVoiceEntry | null
  readonly dialoguePack: ContentDialoguePackEntry
  readonly appearanceTheme: ContentThemeEntry
  readonly background: ContentBackgroundEntry
  readonly font: ContentFontEntry
  /** Six-component selection that applies the whole role in one action. */
  readonly selection: ContentSelection
}

function themeLookupError(message: string, code: ContentIssueCode = 'unknown-reference'): ContentLibraryError {
  return new ContentLibraryError('invalid character theme', [{ path: '$', code, message }])
}

/**
 * Resolve one character theme against the catalog: verifies every referenced
 * component and returns the six-component selection that applies it in one go.
 * Throws ContentLibraryError when the theme or a component is missing.
 */
export function resolveCharacterTheme(library: ContentLibrary, themeId: string): ResolvedCharacterTheme {
  const theme = findCharacterTheme(library, themeId)
  if (theme === undefined) throw themeLookupError('character theme not found: ' + themeId)
  const character = findContent(library, 'characters', theme.characterId) as ContentCharacterEntry | undefined
  if (character === undefined) throw themeLookupError('character not found: ' + theme.characterId)
  if (!character.available) throw themeLookupError('character is not available: ' + theme.characterId, 'unavailable')
  let voice: ContentVoiceEntry | null = null
  if (character.voiceMode === 'tts') {
    if (theme.voiceId === 'none') throw themeLookupError('human presentation needs a voice: ' + theme.id, 'invalid-role-theme')
    const resolvedVoice = findContent(library, 'voices', theme.voiceId) as ContentVoiceEntry | undefined
    if (resolvedVoice === undefined || !resolvedVoice.available || !isVoiceAvailableFor(resolvedVoice, character.id)) {
      throw themeLookupError('voice is not available for character: ' + theme.voiceId, 'unavailable')
    }
    voice = resolvedVoice
  } else if (theme.voiceId !== 'none') {
    throw themeLookupError('silent character requires voiceId "none": ' + theme.id, 'invalid-role-theme')
  }
  const dialoguePack = findContent(library, 'dialoguePacks', theme.dialoguePackId) as ContentDialoguePackEntry | undefined
  if (dialoguePack === undefined || !dialoguePack.available) {
    throw themeLookupError('dialogue pack is not available: ' + theme.dialoguePackId, 'unavailable')
  }
  const appearanceTheme = findContent(library, 'themes', theme.appearance.themeId) as ContentThemeEntry | undefined
  const background = findContent(library, 'backgrounds', theme.appearance.backgroundId) as ContentBackgroundEntry | undefined
  const font = findContent(library, 'fonts', theme.appearance.fontId) as ContentFontEntry | undefined
  if (appearanceTheme === undefined || !appearanceTheme.available) {
    throw themeLookupError('theme is not available: ' + theme.appearance.themeId, 'unavailable')
  }
  if (background === undefined || !background.available) {
    throw themeLookupError('background is not available: ' + theme.appearance.backgroundId, 'unavailable')
  }
  if (font === undefined || !font.available) {
    throw themeLookupError('font is not available: ' + theme.appearance.fontId, 'unavailable')
  }
  const selection: ContentSelection = {
    character: character.id,
    voice: voice ? voice.id : library.defaults.voice,
    dialoguePack: dialoguePack.id,
    theme: appearanceTheme.id,
    background: background.id,
    font: font.id,
  }
  return Object.freeze({
    theme,
    character,
    voice,
    dialoguePack,
    appearanceTheme,
    background,
    font,
    selection: deepFreeze(selection),
  })
}

/** Result of a one-click "apply this character theme" resolution. */
export interface CharacterThemeApplication {
  readonly ok: boolean
  readonly theme?: ContentCharacterTheme
  readonly selection?: ContentSelection
  readonly issues: readonly ContentIssue[]
}

/**
 * One-click apply: resolve a character theme into a full six-component selection
 * (optionally with user overrides for individual components). The UI writes the
 * returned selection with writeContentSelection + writeRoleThemeSelection.
 */
export function applyCharacterTheme(
  library: ContentLibrary,
  themeId: string,
  overrides: Partial<ContentSelection> = Object.freeze({}),
): CharacterThemeApplication {
  let resolved: ResolvedCharacterTheme
  try {
    resolved = resolveCharacterTheme(library, themeId)
  } catch (error) {
    const issues = error instanceof ContentLibraryError ? error.issues : [{ path: '$', code: 'unknown-reference' as const, message: 'character theme resolution failed' }]
    return Object.freeze({ ok: false, issues: Object.freeze([...issues]) })
  }
  const issues: ContentIssue[] = []
  const selection: Record<SelectionKey, string> = { ...resolved.selection }
  for (const key of SELECTION_KEYS) {
    const override = overrides[key]
    if (override === undefined) continue
    if (typeof override !== 'string' || !availableSelectionEntry(library, key, override)) {
      issues.push({ path: '$.selection.' + key, code: 'unknown-reference', message: 'override is not an available ' + key + ': ' + String(override) })
      continue
    }
    selection[key] = override
  }
  if (issues.length > 0) return Object.freeze({ ok: false, theme: resolved.theme, issues: Object.freeze(issues) })
  return Object.freeze({
    ok: true,
    theme: resolved.theme,
    selection: deepFreeze(selection as ContentSelection),
    issues: Object.freeze([]),
  })
}

/** Alias matching the v2 work-order wording. */
export const applyRoleTheme = applyCharacterTheme

/** Character themes whose six components match the given selection. */
export function matchCharacterThemes(
  library: ContentLibrary,
  selection: Partial<ContentSelection> | null | undefined,
): readonly ContentCharacterTheme[] {
  const wanted = { ...library.defaults, ...(selection ?? {}) }
  return Object.freeze(
    listCharacterThemes(library).filter((theme) => {
      if (theme.characterId !== wanted.character) return false
      if (theme.voiceId !== 'none' && theme.voiceId !== wanted.voice) return false
      return theme.dialoguePackId === wanted.dialoguePack &&
        theme.appearance.themeId === wanted.theme &&
        theme.appearance.backgroundId === wanted.background &&
        theme.appearance.fontId === wanted.font
    }),
  )
}

/** Input for deriving a custom character theme from a built-in preset. */
export interface CharacterThemeDerivationInput {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly voiceId?: string
  readonly dialoguePackId?: string
  readonly appearance?: Partial<ContentRoleAppearance>
  readonly behaviorPreset?: string
  readonly preview?: string
  readonly version?: string
  readonly author: string
  readonly license: ContentPackLicense
  readonly aiProvenance: ContentAiProvenance
}

export type CharacterThemeDerivationResult =
  | { readonly ok: true; readonly theme: ContentCharacterTheme }
  | { readonly ok: false; readonly issues: readonly ContentIssue[] }

/**
 * Derive a custom "my character theme" from a built-in preset. The unified usage
 * declaration is copied from the base theme (never user-editable). The result is
 * validated against the live catalog; the caller can persist it as local content
 * or export it as a v2 pack (with its own preview asset).
 */
export function createDerivedCharacterTheme(
  library: ContentLibrary,
  baseThemeId: string,
  input: CharacterThemeDerivationInput,
): CharacterThemeDerivationResult {
  const base = findCharacterTheme(library, baseThemeId)
  if (base === undefined) {
    return Object.freeze({ ok: false, issues: Object.freeze([{ path: '$', code: 'unknown-reference' as const, message: 'base character theme not found: ' + baseThemeId }]) })
  }
  const raw: Record<string, unknown> = {
    id: input.id,
    name: input.name,
    description: input.description,
    characterId: base.characterId,
    voiceId: input.voiceId ?? base.voiceId,
    dialoguePackId: input.dialoguePackId ?? base.dialoguePackId,
    appearance: {
      themeId: input.appearance?.themeId ?? base.appearance.themeId,
      backgroundId: input.appearance?.backgroundId ?? base.appearance.backgroundId,
      fontId: input.appearance?.fontId ?? base.appearance.fontId,
    },
    preview: input.preview ?? base.preview,
    designRef: base.designRef,
    usageDeclaration: base.usageDeclaration,
    version: input.version ?? '1.0.0',
    source: 'local',
    author: input.author,
    license: input.license,
    aiProvenance: input.aiProvenance,
  }
  if (input.behaviorPreset !== undefined) raw.behaviorPreset = input.behaviorPreset
  const issues: ContentIssue[] = []
  const theme = parseRoleTheme(raw, '$.theme', issues, { allowedSources: ['local'], previewLeadingSlash: true })
  const categories: Record<ContentCategory, readonly ContentEntry[]> = {
    characters: library.characters,
    voices: library.voices,
    dialoguePacks: library.dialoguePacks,
    themes: library.themes,
    backgrounds: library.backgrounds,
    fonts: library.fonts,
  }
  if (theme !== undefined) checkRoleThemeReferences([theme], '$.theme', categories, issues)
  if (issues.length > 0 || theme === undefined) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues.length > 0 ? issues : [{ path: '$.theme', code: 'invalid-role-theme' as const, message: 'derived theme is invalid' }]) })
  }
  return Object.freeze({ ok: true, theme: deepFreeze(theme) as ContentCharacterTheme })
}

// ---------------------------------------------------------------------------
// v2: character-theme selection persistence (separate from six component keys)
// ---------------------------------------------------------------------------

/** Storage key remembering the last applied character theme. */
export const CONTENT_ROLE_THEME_STORAGE_KEY = 'desktop-games/pet/content/role-theme'

export type RoleThemeSelectionSource = 'stored' | 'default' | 'missing' | 'invalid'

export interface RoleThemeSelectionReadResult {
  readonly roleThemeId: string | null
  readonly source: RoleThemeSelectionSource
}

/** Read the last applied character theme (falls back to defaultRoleTheme). */
export function readRoleThemeSelection(
  library: ContentLibrary,
  storage?: StorageLike | null,
): RoleThemeSelectionReadResult {
  const fallback = library.defaultRoleTheme ?? null
  const result = readVersioned<{ id: string }>(
    CONTENT_ROLE_THEME_STORAGE_KEY,
    {
      version: 1,
      maxBytes: CONTENT_LIMITS.maxSelectionBytes,
      validate: (value) => {
        if (!isRecord(value) || typeof value.id !== 'string') return undefined
        return findCharacterTheme(library, value.id) ? { id: value.id } : undefined
      },
    },
    storage,
  )
  if (result.status === 'ok' && result.value !== undefined) {
    return Object.freeze({ roleThemeId: result.value.id, source: 'stored' })
  }
  if (result.status === 'missing') {
    return Object.freeze({ roleThemeId: fallback, source: fallback === null ? 'missing' : 'default' })
  }
  return Object.freeze({ roleThemeId: fallback, source: 'invalid' })
}

export interface RoleThemeSelectionWriteResult {
  readonly ok: boolean
  readonly status: StorageWriteStatus | 'invalid'
}

/** Persist the selected character theme id (refuses unknown ids). */
export function writeRoleThemeSelection(
  library: ContentLibrary,
  roleThemeId: string,
  storage?: StorageLike | null,
): RoleThemeSelectionWriteResult {
  if (typeof roleThemeId !== 'string' || findCharacterTheme(library, roleThemeId) === undefined) {
    return Object.freeze({ ok: false, status: 'invalid' })
  }
  const status = writeVersioned(
    CONTENT_ROLE_THEME_STORAGE_KEY,
    { id: roleThemeId },
    { version: 1, maxBytes: CONTENT_LIMITS.maxSelectionBytes },
    storage,
  )
  return Object.freeze({ ok: status.status === 'ok', status: status.status })
}

/** Remove the persisted character-theme id. */
export function clearRoleThemeSelection(storage?: StorageLike | null): boolean {
  return removeKey(CONTENT_ROLE_THEME_STORAGE_KEY, storage)
}

export interface CharacterThemeStorageWriteResult {
  readonly ok: boolean
  readonly roleTheme: RoleThemeSelectionWriteResult
  readonly selection: ContentSelectionWriteResult
}

/**
 * One-call persistence for "apply character theme": writes the six component
 * selection keys plus the role-theme key. Returns per-key statuses; no partial
 * state is hidden from the caller.
 */
export function writeCharacterThemeSelection(
  library: ContentLibrary,
  themeId: string,
  storage?: StorageLike | null,
  overrides: Partial<ContentSelection> = Object.freeze({}),
): CharacterThemeStorageWriteResult {
  const application = applyCharacterTheme(library, themeId, overrides)
  if (!application.ok || application.selection === undefined) {
    return Object.freeze({
      ok: false,
      roleTheme: Object.freeze({ ok: false, status: 'invalid' as const }),
      selection: Object.freeze({
        ok: false,
        results: Object.freeze({
          character: 'invalid',
          voice: 'invalid',
          dialoguePack: 'invalid',
          theme: 'invalid',
          background: 'invalid',
          font: 'invalid',
        }) as Readonly<Record<SelectionKey, StorageWriteStatus | 'invalid'>>,
      }),
    })
  }
  const roleTheme = writeRoleThemeSelection(library, themeId, storage)
  const selection = writeContentSelection(library, application.selection, storage)
  return Object.freeze({ ok: roleTheme.ok && selection.ok, roleTheme, selection })
}

// ===========================================================================
// v2: content-pack 0.2 parsing (role themes + declaration + sha256 files)
// ===========================================================================

function packV2FileKind(relativePath: string): 'asset' | 'doc' | null {
  const slash = relativePath.lastIndexOf('/')
  const base = slash === -1 ? relativePath : relativePath.slice(slash + 1)
  if (slash === -1 && ROOT_PACK_DOC_PATTERN.test(base)) return 'doc'
  const extension = fileExtension(relativePath)
  if ((CONTENT_PACK_V2_ASSET_EXTENSIONS as readonly string[]).includes(extension)) return 'asset'
  return null
}

function parsePackFileV2(raw: unknown, path: string, issues: ContentIssue[]): ContentPackFileV2 | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'file must be an object with path/bytes/sha256')
    return undefined
  }
  checkUnknownKeys(raw, ['path', 'bytes', 'sha256'], path, issues)
  const filePath = parseSafePath(raw.path, path + '.path', issues, { leadingSlash: false, maxChars: 160 })
  let kind: 'asset' | 'doc' | null = null
  if (filePath !== undefined) {
    kind = packV2FileKind(filePath)
    if (kind === null) {
      addIssue(issues, path + '.path', 'forbidden-asset-type', 'asset type is not allowed (png/webp/json/woff2 only; root LICENSE/NOTICE/README/DESIGN.md docs)')
    }
  }
  const bytes = readNumberField(raw, 'bytes', path + '.bytes', issues, {
    min: 1,
    max: CONTENT_PACK_V2_LIMITS.maxAssetBytes,
    integer: true,
  })
  const rawSha = readStringField(raw, 'sha256', path + '.sha256', issues)
  let sha256: string | undefined
  if (rawSha !== undefined) {
    if (!SHA256_PATTERN.test(rawSha)) {
      addIssue(issues, path + '.sha256', 'invalid-type', 'sha256 must be lowercase hex (64 chars)')
    } else {
      sha256 = rawSha
    }
  }
  if (filePath === undefined || kind === null || bytes === undefined || sha256 === undefined) return undefined
  return { path: filePath, bytes, sha256 }
}

function parsePackComponents(raw: unknown, path: string, issues: ContentIssue[]): ContentPackComponents | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'components must be an object of optional six-category arrays')
    return undefined
  }
  checkUnknownKeys(raw, CONTENT_CATEGORIES, path, issues)
  const out: Record<string, ContentEntry[]> = {}
  for (const category of CONTENT_CATEGORIES) {
    const rawCategory = raw[category]
    if (rawCategory === undefined) continue
    if (!Array.isArray(rawCategory) || rawCategory.length === 0) {
      addIssue(issues, path + '.' + category, 'out-of-range', 'components array must have 1..' + CONTENT_LIMITS.maxEntriesPerCategory + ' entries')
      continue
    }
    out[category] = parseEntryArray(rawCategory, path + '.' + category, issues, category, PACK_ENTRY_OPTIONS, CONTENT_LIMITS.maxEntriesPerCategory)
  }
  return out as ContentPackComponents
}

function collectPackFilePaths(files: readonly ContentPackFileV2[]): Set<string> {
  return new Set(files.map((file) => file.path))
}

function checkPackV2AssetReferences(pack: {
  files: readonly ContentPackFileV2[]
  preview?: string
  license: ContentPackLicense
  roleThemes: readonly ContentCharacterTheme[]
}, issues: ContentIssue[]): void {
  const declared = collectPackFilePaths(pack.files)
  if (pack.preview !== undefined && !declared.has(pack.preview)) {
    addIssue(issues, '$.preview', 'missing-file', 'pack preview is not listed in files: ' + pack.preview)
  }
  if (pack.license.file !== undefined && !declared.has(pack.license.file)) {
    addIssue(issues, '$.license.file', 'missing-file', 'license file is not listed in files: ' + pack.license.file)
  }
  for (let index = 0; index < pack.roleThemes.length; index += 1) {
    const theme = pack.roleThemes[index]
    if (theme === undefined) continue
    if (!declared.has(theme.preview)) {
      addIssue(issues, '$.roleThemes[' + index + '].preview', 'missing-file', 'character theme preview is not listed in files: ' + theme.preview)
    }
  }
}

function parseContentPackV2(input: unknown, issues: ContentIssue[]): ContentPackV2 | undefined {
  if (!isRecord(input)) {
    addIssue(issues, '$', 'invalid-type', 'content pack must be an object')
    return undefined
  }
  checkUnknownKeys(
    input,
    [
      'schema',
      'id',
      'name',
      'version',
      'description',
      'usageDeclaration',
      'license',
      'aiProvenance',
      'compatibility',
      'roleThemes',
      'components',
      'files',
      'preview',
      'source',
      'remote',
      'createdAt',
    ],
    '$',
    issues,
  )
  const schema = readStringField(input, 'schema', '$.schema', issues)
  if (schema !== undefined && schema !== CONTENT_PACK_SCHEMA_V2) {
    addIssue(issues, '$.schema', 'invalid-schema', 'expected ' + CONTENT_PACK_SCHEMA_V2)
  }
  const id = parsePackId(input.id, '$.id', issues)
  const name = readPlainText(input, 'name', '$.name', issues, { maxChars: CONTENT_LIMITS.maxNameChars })
  const version = readStringField(input, 'version', '$.version', issues)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    addIssue(issues, '$.version', 'invalid-version', 'version must be SemVer')
  }
  const description = readPlainText(input, 'description', '$.description', issues, {
    maxChars: CONTENT_LIMITS.maxDescriptionChars,
  })
  const usageDeclaration = parseUsageDeclaration(input.usageDeclaration, '$.usageDeclaration', issues)
  const license = input.license === undefined
    ? (addIssue(issues, '$.license', 'missing-field', 'license is required'), undefined)
    : parsePackLicense(input.license, '$.license', issues)
  const aiProvenance = parseAiProvenance(input.aiProvenance, '$.aiProvenance', issues)
  const compatibility = parsePackCompatibility(input.compatibility, '$.compatibility', issues)
  if (compatibility !== undefined && compatibility.library !== CONTENT_LIBRARY_SCHEMA) {
    addIssue(issues, '$.compatibility.library', 'incompatible', 'content-pack/0.2 must target ' + CONTENT_LIBRARY_SCHEMA)
  }
  const roleThemes = parseRoleThemeArray(input.roleThemes, '$.roleThemes', issues, {
    required: true,
    allowedSources: ['local'],
    previewLeadingSlash: false,
    max: CONTENT_PACK_V2_LIMITS.maxRoleThemesPerPack,
  })
  const components = input.components === undefined ? undefined : parsePackComponents(input.components, '$.components', issues)
  let files: ContentPackFileV2[] = []
  const rawFiles = readArrayField(input, 'files', '$.files', issues)
  if (rawFiles !== undefined) {
    if (rawFiles.length === 0 || rawFiles.length > CONTENT_PACK_V2_LIMITS.maxPackFiles) {
      addIssue(issues, '$.files', 'too-many-files', 'files must be 1..' + CONTENT_PACK_V2_LIMITS.maxPackFiles)
    } else {
      const seenPaths = new Set<string>()
      let totalBytes = 0
      for (let index = 0; index < rawFiles.length; index += 1) {
        const file = parsePackFileV2(rawFiles[index], '$.files[' + index + ']', issues)
        if (file === undefined) continue
        if (seenPaths.has(file.path)) {
          addIssue(issues, '$.files[' + index + '].path', 'duplicate-id', 'duplicate file path: ' + file.path)
          continue
        }
        seenPaths.add(file.path)
        totalBytes += file.bytes
        files.push(file)
      }
      if (totalBytes > CONTENT_PACK_V2_LIMITS.maxTotalUncompressedBytes) {
        addIssue(issues, '$.files', 'zip-too-large', 'declared files ' + totalBytes + ' bytes > ' + CONTENT_PACK_V2_LIMITS.maxTotalUncompressedBytes)
      }
    }
  }
  let preview: string | undefined
  if (input.preview !== undefined) {
    preview = parseSafePath(input.preview, '$.preview', issues, {
      leadingSlash: false,
      extensions: ['png', 'webp'],
      maxChars: CONTENT_PACK_V2_LIMITS.maxPreviewChars,
    })
  }
  let source: ContentPackSource = 'local'
  if (input.source !== undefined) {
    const rawSource = readStringField(input, 'source', '$.source', issues)
    if (rawSource !== undefined) {
      if (rawSource !== 'local' && rawSource !== 'remote') {
        addIssue(issues, '$.source', 'invalid-type', 'source must be local or remote')
      } else {
        source = rawSource
      }
    }
  }
  let remote: ContentRemoteOrigin | undefined
  if (input.remote !== undefined) {
    if (source !== 'remote') {
      addIssue(issues, '$.remote', 'invalid-remote', 'remote is only allowed when source is "remote"')
    } else {
      remote = parseRemoteOrigin(input.remote, '$.remote', issues)
      if (remote !== undefined && remote.signature === undefined) {
        addIssue(issues, '$.remote.signature', 'missing-signature', 'remote packs must carry an Ed25519 signature')
      }
    }
  } else if (source === 'remote') {
    addIssue(issues, '$.remote', 'missing-signature', 'remote packs must carry a signed remote origin')
  }
  let createdAt: string | undefined
  if (input.createdAt !== undefined) {
    createdAt = readStringField(input, 'createdAt', '$.createdAt', issues)
    if (createdAt !== undefined && !DATE_PATTERN.test(createdAt)) {
      addIssue(issues, '$.createdAt', 'invalid-text', 'createdAt must be YYYY-MM-DD')
    }
  }
  if (usageDeclaration !== undefined && roleThemes.length > 0) {
    checkPackV2AssetReferences({ files, preview, license: license ?? { spdx: '', attribution: '' }, roleThemes }, issues)
  }
  let jsonBytes = 0
  try {
    jsonBytes = countCodePoints(JSON.stringify(input))
  } catch {
    jsonBytes = 0
  }
  if (jsonBytes > CONTENT_PACK_V2_LIMITS.maxPackJsonBytes) {
    addIssue(issues, '$', 'too-large', 'pack JSON is ' + jsonBytes + ' chars > ' + CONTENT_PACK_V2_LIMITS.maxPackJsonBytes)
  }
  if (
    issues.length > 0 ||
    schema !== CONTENT_PACK_SCHEMA_V2 ||
    id === undefined ||
    name === undefined ||
    version === undefined ||
    description === undefined ||
    usageDeclaration === undefined ||
    license === undefined ||
    aiProvenance === undefined ||
    compatibility === undefined ||
    roleThemes.length === 0 ||
    files.length === 0
  ) {
    return undefined
  }
  const pack: ContentPackV2 = {
    schema: CONTENT_PACK_SCHEMA_V2,
    id,
    name,
    version,
    description,
    usageDeclaration,
    license,
    aiProvenance,
    compatibility,
    roleThemes,
    files,
    source,
  }
  if (components !== undefined) (pack as { -readonly [K in keyof ContentPackV2]: ContentPackV2[K] }).components = components
  if (preview !== undefined) (pack as { -readonly [K in keyof ContentPackV2]: ContentPackV2[K] }).preview = preview
  if (remote !== undefined) (pack as { -readonly [K in keyof ContentPackV2]: ContentPackV2[K] }).remote = remote
  if (createdAt !== undefined) (pack as { -readonly [K in keyof ContentPackV2]: ContentPackV2[K] }).createdAt = createdAt
  return deepFreeze(pack)
}

/**
 * Validate one `famling.content-pack/0.2` manifest. Returns every issue instead
 * of throwing. Missing/mismatched usage declaration, licence, AI provenance,
 * files+sha256 or an unsigned remote origin are always rejected.
 */
export function validateContentPackV2(input: unknown): ContentPackV2Validation {
  const issues: ContentIssue[] = []
  const pack = parseContentPackV2(input, issues)
  return issues.length === 0 && pack !== undefined ? { ok: true, pack } : { ok: false, issues }
}

// ===========================================================================
// v2: zip bundle inventory validation (paths / size / asset type / sha256)
// ===========================================================================

function isSafeZipEntryPath(rawPath: string): boolean {
  if (rawPath.length === 0 || countCodePoints(rawPath) > 160) return false
  if (CONTROL_TEST.test(rawPath) || MARKUP_TEST.test(rawPath)) return false
  if (rawPath.includes('\\') || rawPath.includes(':') || rawPath.includes('#') || rawPath.includes('?')) return false
  if (rawPath.startsWith('/') || SOURCE_SCHEME_TEST.test(rawPath)) return false
  const segments = rawPath.split('/')
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) return false
  const checked = checkRelativePath(rawPath, { allowBackslash: false })
  return checked.ok && checked.normalized === rawPath
}

/**
 * Validate an unzipped bundle inventory against a v2 manifest. The host unzips
 * the .zip and computes sha256 for every file; this function enforces:
 * canonical relative paths (no traversal/absolute/URL), allowed asset types,
 * per-file/total/compression caps, pack.json presence, exact manifest coverage
 * (no unlisted files, no missing files) and sha256/size equality.
 */
export function validatePackZip(pack: ContentPackV2, inventory: ContentPackZipInventory): ContentPackZipValidation {
  const issues: ContentIssue[] = []
  if (!isRecord(inventory)) {
    addIssue(issues, '$', 'invalid-zip', 'zip inventory must be an object')
    return Object.freeze({ ok: false, issues: Object.freeze(issues) })
  }
  const zipBytes = inventory.bytes
  if (typeof zipBytes !== 'number' || !Number.isInteger(zipBytes) || zipBytes <= 0 || zipBytes > CONTENT_PACK_V2_LIMITS.maxZipBytes) {
    addIssue(issues, '$.bytes', 'zip-too-large', 'zip size must be 1..' + CONTENT_PACK_V2_LIMITS.maxZipBytes + ' bytes')
  }
  const rawEntries: readonly unknown[] = Array.isArray(inventory.entries) ? inventory.entries : []
  if (!Array.isArray(inventory.entries)) addIssue(issues, '$.entries', 'invalid-zip', 'zip entries must be an array')
  if (rawEntries.length > CONTENT_PACK_V2_LIMITS.maxZipEntries) {
    addIssue(issues, '$.entries', 'zip-too-large', rawEntries.length + ' entries > ' + CONTENT_PACK_V2_LIMITS.maxZipEntries)
  }
  const files = new Map<string, ContentPackZipEntry>()
  const seenLower = new Set<string>()
  let totalUncompressed = 0
  for (let index = 0; index < rawEntries.length; index += 1) {
    const rawEntry = rawEntries[index]
    const path = '$.entries[' + index + ']'
    if (!isRecord(rawEntry)) {
      addIssue(issues, path, 'invalid-zip', 'zip entry must be an object')
      continue
    }
    if (typeof rawEntry.path !== 'string') {
      addIssue(issues, path + '.path', 'invalid-zip', 'zip entry path must be a string')
      continue
    }
    const isDirectory = rawEntry.isDirectory === true || rawEntry.path.endsWith('/')
    const entryPath = isDirectory ? rawEntry.path.replace(/\/+$/, '') : rawEntry.path
    if (!isSafeZipEntryPath(entryPath)) {
      addIssue(issues, path + '.path', 'unsafe-zip-entry', 'unsafe zip entry path: ' + String(rawEntry.path).slice(0, 64))
      continue
    }
    const lower = entryPath.toLowerCase()
    if (seenLower.has(lower)) {
      addIssue(issues, path + '.path', 'duplicate-id', 'duplicate/case-colliding zip entry: ' + entryPath)
      continue
    }
    seenLower.add(lower)
    if (isDirectory) continue
    const bytes = rawEntry.bytes
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0 || bytes > CONTENT_PACK_V2_LIMITS.maxAssetBytes) {
      addIssue(issues, path + '.bytes', 'zip-too-large', 'file size must be 0..' + CONTENT_PACK_V2_LIMITS.maxAssetBytes + ' bytes')
      continue
    }
    if (entryPath !== 'pack.json') {
      const kind = packV2FileKind(entryPath)
      if (kind === null) {
        addIssue(issues, path + '.path', 'forbidden-asset-type', 'asset type is not allowed: ' + entryPath)
        continue
      }
      if (kind === 'asset' && !entryPath.startsWith('assets/')) {
        addIssue(issues, path + '.path', 'forbidden-asset-type', 'assets must live under assets/: ' + entryPath)
        continue
      }
    }
    if (rawEntry.sha256 !== undefined && (typeof rawEntry.sha256 !== 'string' || !SHA256_PATTERN.test(rawEntry.sha256))) {
      addIssue(issues, path + '.sha256', 'hash-mismatch', 'sha256 must be lowercase hex (64 chars)')
      continue
    }
    totalUncompressed += bytes
    files.set(entryPath, {
      path: entryPath,
      bytes,
      ...(typeof rawEntry.compressedBytes === 'number' ? { compressedBytes: rawEntry.compressedBytes } : {}),
      ...(typeof rawEntry.sha256 === 'string' ? { sha256: rawEntry.sha256 } : {}),
    })
  }
  if (!files.has('pack.json')) {
    addIssue(issues, '$.entries', 'missing-file', 'bundle must contain pack.json at the root')
  }
  if (totalUncompressed > CONTENT_PACK_V2_LIMITS.maxTotalUncompressedBytes) {
    addIssue(issues, '$.entries', 'zip-too-large', 'uncompressed total ' + totalUncompressed + ' > ' + CONTENT_PACK_V2_LIMITS.maxTotalUncompressedBytes)
  }
  if (typeof zipBytes === 'number' && zipBytes > 0 && totalUncompressed > zipBytes * CONTENT_PACK_V2_LIMITS.maxCompressionRatio) {
    addIssue(issues, '$.entries', 'zip-too-large', 'compression ratio > ' + CONTENT_PACK_V2_LIMITS.maxCompressionRatio + ' (possible zip bomb)')
  }
  const declared = collectPackFilePaths(pack.files)
  for (let index = 0; index < pack.files.length; index += 1) {
    const declaredFile = pack.files[index]
    if (declaredFile === undefined) continue
    const entry = files.get(declaredFile.path)
    if (entry === undefined) {
      addIssue(issues, '$.files[' + index + ']', 'missing-file', 'declared file is missing from the zip: ' + declaredFile.path)
      continue
    }
    if (entry.bytes !== declaredFile.bytes) {
      addIssue(issues, '$.files[' + index + '].bytes', 'file-size-mismatch', 'declared ' + declaredFile.bytes + ' bytes, actual ' + entry.bytes)
    }
    if (entry.sha256 === undefined) {
      addIssue(issues, '$.files[' + index + '].sha256', 'hash-mismatch', 'host must compute sha256 for ' + declaredFile.path)
    } else if (entry.sha256.toLowerCase() !== declaredFile.sha256) {
      addIssue(issues, '$.files[' + index + '].sha256', 'hash-mismatch', 'sha256 mismatch for ' + declaredFile.path)
    }
  }
  for (const path of files.keys()) {
    if (path !== 'pack.json' && !declared.has(path)) {
      addIssue(issues, '$.entries', 'unlisted-file', 'zip file is not declared in pack.files: ' + path)
    }
  }
  if (pack.preview !== undefined && !declared.has(pack.preview)) {
    addIssue(issues, '$.preview', 'missing-file', 'pack preview is not declared in files')
  }
  for (let index = 0; index < pack.roleThemes.length; index += 1) {
    const theme = pack.roleThemes[index]
    if (theme === undefined) continue
    if (!declared.has(theme.preview)) {
      addIssue(issues, '$.roleThemes[' + index + '].preview', 'missing-file', 'character theme preview is not declared in files')
    }
  }
  return issues.length === 0 ? Object.freeze({ ok: true }) : Object.freeze({ ok: false, issues: Object.freeze(issues) })
}

// ===========================================================================
// v2: merge installed character-theme packs (atomic per pack, fail-closed)
// ===========================================================================

export type CharacterThemePackSkipCode =
  | 'invalid-pack'
  | 'duplicate-pack-id'
  | 'incompatible-pack'
  | 'unverified-remote'
  | 'missing-references'

export interface CharacterThemePackSkip {
  readonly packId: string
  readonly code: CharacterThemePackSkipCode
  readonly reason: string
  readonly issues?: readonly ContentIssue[]
}

export interface CharacterThemeConflict {
  readonly packId: string
  readonly id: string
  readonly code: ContentMergeConflictCode
  readonly kind: 'roleTheme' | 'component'
  readonly category?: ContentCategory
}

/** Injected verification hook; normally wraps verifyRemoteContentPack(). */
export interface RemotePackVerification {
  readonly ok: boolean
  readonly reason?: string
}

export interface CharacterThemeMergeOptions {
  /**
   * Cryptographic verification hook for remote packs. When absent, every remote
   * pack is skipped with "unverified-remote" (fail-closed, never silently
   * trusted just because it carries signature-shaped metadata).
   */
  readonly verifyRemote?: (pack: ContentPackV2) => RemotePackVerification
}

export interface CharacterThemeMergeResult {
  readonly library: ContentLibrary
  readonly addedThemes: readonly ContentCharacterTheme[]
  readonly addedComponents: readonly ContentEntry[]
  readonly conflicts: readonly CharacterThemeConflict[]
  readonly skippedPacks: readonly CharacterThemePackSkip[]
  readonly packIds: readonly string[]
}

function packV2Compatible(pack: ContentPackV2, library: ContentLibrary): boolean {
  if (pack.compatibility.library !== library.schema) return false
  const min = pack.compatibility.minAppVersion
  if (min !== undefined && compareSemver(library.version, min) < 0) return false
  const max = pack.compatibility.maxAppVersion
  if (max !== undefined && compareSemver(library.version, max) > 0) return false
  return true
}

function allCategories(library: ContentLibrary): Record<ContentCategory, readonly ContentEntry[]> {
  return {
    characters: library.characters,
    voices: library.voices,
    dialoguePacks: library.dialoguePacks,
    themes: library.themes,
    backgrounds: library.backgrounds,
    fonts: library.fonts,
  }
}

/**
 * Merge validated `famling.content-pack/0.2` packs into a v2 catalog.
 *
 * Rules (deterministic, atomic per pack):
 * 1. invalid packs are skipped with all issues; duplicate pack ids are skipped;
 * 2. remote packs are skipped unless the caller supplies verifyRemote() and it
 *    returns ok — a signature-shaped field is never trusted on its own;
 * 3. a pack whose role themes reference missing components is skipped as a
 *    whole ("missing-references") so no broken theme is ever installed;
 * 4. built-in rolePresets can never be shadowed ("builtin-shadow"); component
 *    ids and character-theme ids follow the same first-wins rule as v1;
 * 5. the input library is never mutated.
 */
export function mergeCharacterThemes(
  library: ContentLibrary,
  packs: readonly unknown[],
  options: CharacterThemeMergeOptions = Object.freeze({}),
): CharacterThemeMergeResult {
  const skippedPacks: CharacterThemePackSkip[] = []
  const conflicts: CharacterThemeConflict[] = []
  const addedThemes: ContentCharacterTheme[] = []
  const addedComponents: ContentEntry[] = []
  const packIds: string[] = []
  const validated: ContentPackV2[] = []
  const packIdCounts = new Map<string, number>()
  for (let index = 0; index < packs.length; index += 1) {
    const raw = packs[index]
    const fallbackId = isRecord(raw) && typeof raw.id === 'string' ? raw.id.slice(0, 64) : '#packs[' + index + ']'
    const result = validateContentPackV2(raw)
    if (!result.ok) {
      skippedPacks.push({ packId: fallbackId, code: 'invalid-pack', reason: 'pack failed v2 validation', issues: result.issues })
      continue
    }
    validated.push(result.pack)
    packIdCounts.set(result.pack.id, (packIdCounts.get(result.pack.id) ?? 0) + 1)
  }
  const duplicatePackIds = new Set<string>()
  for (const [packId, count] of packIdCounts) {
    if (count > 1) duplicatePackIds.add(packId)
  }
  const categories: Record<ContentCategory, ContentEntry[]> = {
    characters: [...library.characters],
    voices: [...library.voices],
    dialoguePacks: [...library.dialoguePacks],
    themes: [...library.themes],
    backgrounds: [...library.backgrounds],
    fonts: [...library.fonts],
  }
  const installedThemes: ContentCharacterTheme[] = [...library.characterThemes]
  const presetIds = new Set(library.rolePresets.map((theme) => theme.id))
  const installedIds = new Set(installedThemes.map((theme) => theme.id))
  for (const pack of validated) {
    if (duplicatePackIds.has(pack.id)) {
      skippedPacks.push({ packId: pack.id, code: 'duplicate-pack-id', reason: 'multiple packs share this id' })
      continue
    }
    if (!packV2Compatible(pack, library)) {
      skippedPacks.push({ packId: pack.id, code: 'incompatible-pack', reason: 'pack requires a different content-library version' })
      continue
    }
    if (pack.source === 'remote') {
      let verification: RemotePackVerification | undefined
      if (options.verifyRemote !== undefined) {
        try {
          verification = options.verifyRemote(pack)
        } catch {
          verification = { ok: false, reason: 'verification hook threw' }
        }
      }
      if (verification === undefined || !verification.ok) {
        skippedPacks.push({
          packId: pack.id,
          code: 'unverified-remote',
          reason: verification?.reason ?? 'remote pack needs an Ed25519 signature verified against the trust root',
        })
        continue
      }
    }
    // Build the candidate component catalog for this pack first (its own
    // components may satisfy its role-theme references), then validate refs.
    const candidate: Record<ContentCategory, readonly ContentEntry[]> = {
      characters: [...categories.characters],
      voices: [...categories.voices],
      dialoguePacks: [...categories.dialoguePacks],
      themes: [...categories.themes],
      backgrounds: [...categories.backgrounds],
      fonts: [...categories.fonts],
    }
    const packComponents = pack.components
    if (packComponents !== undefined) {
      for (const category of CONTENT_CATEGORIES) {
        const entries = packComponents[category]
        if (entries === undefined) continue
        const existingIds = new Set(candidate[category].map((entry) => entry.id))
        for (const entry of entries) {
          if (existingIds.has(entry.id)) continue
          existingIds.add(entry.id)
          ;(candidate[category] as ContentEntry[]).push({ ...entry, source: 'local' })
        }
      }
    }
    const referenceIssues: ContentIssue[] = []
    checkRoleThemeReferences(pack.roleThemes, '$.roleThemes', candidate, referenceIssues)
    if (referenceIssues.length > 0) {
      skippedPacks.push({ packId: pack.id, code: 'missing-references', reason: 'role theme references are not satisfied by the catalog', issues: referenceIssues })
      continue
    }
    // Atomic apply: components then role themes; conflicts are per entry.
    if (packComponents !== undefined) {
      for (const category of CONTENT_CATEGORIES) {
        const entries = packComponents[category]
        if (entries === undefined) continue
        for (const entry of entries) {
          const existingEntry = categories[category].find((candidateEntry) => candidateEntry.id === entry.id)
          if (existingEntry !== undefined) {
            conflicts.push({
              packId: pack.id,
              id: entry.id,
              kind: 'component',
              category,
              code: existingEntry.source === 'builtin' ? 'builtin-shadow' : 'duplicate-installed',
            })
            continue
          }
          const installedEntry: ContentEntry = { ...entry, source: 'local' }
          categories[category].push(installedEntry)
          addedComponents.push(installedEntry)
        }
      }
    }
    for (const theme of pack.roleThemes) {
      if (presetIds.has(theme.id)) {
        conflicts.push({ packId: pack.id, id: theme.id, kind: 'roleTheme', code: 'builtin-shadow' })
        continue
      }
      if (installedIds.has(theme.id)) {
        conflicts.push({ packId: pack.id, id: theme.id, kind: 'roleTheme', code: 'duplicate-installed' })
        continue
      }
      const installedTheme: ContentCharacterTheme = { ...theme, source: 'local' }
      installedThemes.push(installedTheme)
      installedIds.add(installedTheme.id)
      addedThemes.push(installedTheme)
    }
    packIds.push(pack.id)
  }
  const nextLibrary = deepFreeze({
    ...library,
    characters: categories.characters as readonly ContentCharacterEntry[],
    voices: categories.voices as readonly ContentVoiceEntry[],
    dialoguePacks: categories.dialoguePacks as readonly ContentDialoguePackEntry[],
    themes: categories.themes as readonly ContentThemeEntry[],
    backgrounds: categories.backgrounds as readonly ContentBackgroundEntry[],
    fonts: categories.fonts as readonly ContentFontEntry[],
    characterThemes: installedThemes,
  }) as ContentLibrary
  return Object.freeze({
    library: nextLibrary,
    addedThemes: Object.freeze(addedThemes),
    addedComponents: Object.freeze(addedComponents),
    conflicts: Object.freeze(conflicts),
    skippedPacks: Object.freeze(skippedPacks),
    packIds: Object.freeze(packIds),
  })
}

// ===========================================================================
// v2: remote market catalog + Ed25519 verification contract (no network here)
// ===========================================================================

function parseMarketSignature(raw: unknown, path: string, issues: ContentIssue[]): ContentMarketSignature | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-signature', 'signature must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['algorithm', 'keyId', 'value'], path, issues)
  const algorithm = readEnumField(raw, 'algorithm', path + '.algorithm', issues, ['ed25519'] as const)
  const keyId = readStringField(raw, 'keyId', path + '.keyId', issues)
  if (keyId !== undefined && !REMOTE_KEY_ID_PATTERN.test(keyId)) {
    addIssue(issues, path + '.keyId', 'invalid-id', 'invalid signing key id')
  }
  const value = readStringField(raw, 'value', path + '.value', issues)
  if (value !== undefined && !VALIDATION_VALUE_PATTERN.test(value)) {
    addIssue(issues, path + '.value', 'invalid-signature', 'signature must be a detached base64/base64url value')
  }
  if (algorithm === undefined || keyId === undefined || value === undefined) return undefined
  return { algorithm, keyId, value }
}

function parseMarketDownload(raw: unknown, path: string, issues: ContentIssue[]): ContentMarketDownload | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-market-catalog', 'download must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['url', 'zipSha256', 'bytes'], path, issues)
  const url = parseHttpsUrl(raw.url, path + '.url', issues)
  const rawSha = readStringField(raw, 'zipSha256', path + '.zipSha256', issues)
  let zipSha256: string | undefined
  if (rawSha !== undefined) {
    if (!SHA256_PATTERN.test(rawSha)) {
      addIssue(issues, path + '.zipSha256', 'invalid-market-catalog', 'zipSha256 must be lowercase hex (64 chars)')
    } else {
      zipSha256 = rawSha
    }
  }
  const bytes = readNumberField(raw, 'bytes', path + '.bytes', issues, {
    min: 1,
    max: CONTENT_PACK_V2_LIMITS.maxZipBytes,
    integer: true,
  })
  if (url === undefined || zipSha256 === undefined || bytes === undefined) return undefined
  return { url, zipSha256, bytes }
}

function parseMarketPack(raw: unknown, path: string, issues: ContentIssue[]): ContentMarketPack | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-market-catalog', 'catalog pack must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['id', 'name', 'version', 'description', 'preview', 'usageDeclaration', 'download', 'signature'], path, issues)
  const id = parsePackId(raw.id, path + '.id', issues)
  const name = readPlainText(raw, 'name', path + '.name', issues, { maxChars: CONTENT_LIMITS.maxNameChars })
  const version = readStringField(raw, 'version', path + '.version', issues)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    addIssue(issues, path + '.version', 'invalid-version', 'version must be SemVer')
  }
  const description = readPlainText(raw, 'description', path + '.description', issues, {
    maxChars: CONTENT_PACK_V2_LIMITS.maxMarketDescriptionChars,
  })
  let preview: string | undefined
  if (raw.preview !== undefined) preview = parseHttpsUrl(raw.preview, path + '.preview', issues)
  const usageDeclaration = parseUsageDeclaration(raw.usageDeclaration, path + '.usageDeclaration', issues)
  const download = parseMarketDownload(raw.download, path + '.download', issues)
  const signature = parseMarketSignature(raw.signature, path + '.signature', issues)
  if (id === undefined || name === undefined || version === undefined || description === undefined || usageDeclaration === undefined || download === undefined || signature === undefined) {
    return undefined
  }
  const pack: { -readonly [K in keyof ContentMarketPack]: ContentMarketPack[K] } = {
    id,
    name,
    version,
    description,
    usageDeclaration,
    download,
    signature,
  }
  if (preview !== undefined) pack.preview = preview
  return pack
}

function parseMarketCatalog(input: unknown, issues: ContentIssue[]): ContentMarketCatalog | undefined {
  if (!isRecord(input)) {
    addIssue(issues, '$', 'invalid-market-catalog', 'market catalog must be an object')
    return undefined
  }
  checkUnknownKeys(input, ['schema', 'version', 'updatedAt', 'keyId', 'signature', 'packs'], '$', issues)
  const schema = readStringField(input, 'schema', '$.schema', issues)
  if (schema !== undefined && schema !== CONTENT_MARKET_CATALOG_SCHEMA) {
    addIssue(issues, '$.schema', 'invalid-schema', 'expected ' + CONTENT_MARKET_CATALOG_SCHEMA)
  }
  const version = readStringField(input, 'version', '$.version', issues)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) {
    addIssue(issues, '$.version', 'invalid-version', 'catalog version must be SemVer')
  }
  const updatedAt = readStringField(input, 'updatedAt', '$.updatedAt', issues)
  if (updatedAt !== undefined && !ISO_DATE_TIME_PATTERN.test(updatedAt)) {
    addIssue(issues, '$.updatedAt', 'invalid-text', 'updatedAt must be YYYY-MM-DD or an ISO-8601 UTC timestamp')
  }
  const keyId = readStringField(input, 'keyId', '$.keyId', issues)
  if (keyId !== undefined && !REMOTE_KEY_ID_PATTERN.test(keyId)) {
    addIssue(issues, '$.keyId', 'invalid-id', 'invalid catalog signing key id')
  }
  const signature = parseMarketSignature(input.signature, '$.signature', issues)
  if (signature !== undefined && keyId !== undefined && signature.keyId !== keyId) {
    addIssue(issues, '$.signature.keyId', 'invalid-signature', 'catalog signature keyId must equal catalog.keyId')
  }
  const rawPacks = readArrayField(input, 'packs', '$.packs', issues)
  const packs: ContentMarketPack[] = []
  if (rawPacks !== undefined) {
    if (rawPacks.length === 0 || rawPacks.length > CONTENT_PACK_V2_LIMITS.maxMarketPacks) {
      addIssue(issues, '$.packs', 'out-of-range', 'packs must be 1..' + CONTENT_PACK_V2_LIMITS.maxMarketPacks)
    } else {
      const seen = new Set<string>()
      for (let index = 0; index < rawPacks.length; index += 1) {
        const pack = parseMarketPack(rawPacks[index], '$.packs[' + index + ']', issues)
        if (pack === undefined) continue
        if (seen.has(pack.id)) {
          addIssue(issues, '$.packs[' + index + '].id', 'duplicate-id', 'duplicate market pack id: ' + pack.id)
          continue
        }
        seen.add(pack.id)
        packs.push(pack)
      }
    }
  }
  let jsonBytes = 0
  try {
    jsonBytes = countCodePoints(JSON.stringify(input))
  } catch {
    jsonBytes = 0
  }
  if (jsonBytes > CONTENT_PACK_V2_LIMITS.maxMarketJsonBytes) {
    addIssue(issues, '$', 'too-large', 'catalog JSON is ' + jsonBytes + ' chars > ' + CONTENT_PACK_V2_LIMITS.maxMarketJsonBytes)
  }
  if (
    issues.length > 0 ||
    schema !== CONTENT_MARKET_CATALOG_SCHEMA ||
    version === undefined ||
    updatedAt === undefined ||
    keyId === undefined ||
    signature === undefined ||
    packs.length === 0
  ) {
    return undefined
  }
  return deepFreeze({ schema: CONTENT_MARKET_CATALOG_SCHEMA, version, updatedAt, keyId, signature, packs }) as ContentMarketCatalog
}

/**
 * Strictly validate a remote market catalog. This is data/contract validation
 * only: no network request is ever made and no signature is verified here (see
 * verifyMarketCatalogSignature / verifyMarketPackDownload).
 */
export function validateMarketCatalog(input: unknown): ContentMarketCatalogValidation {
  const issues: ContentIssue[] = []
  const catalog = parseMarketCatalog(input, issues)
  return issues.length === 0 && catalog !== undefined ? { ok: true, catalog } : { ok: false, issues }
}

function withoutTopLevelSignature(value: unknown): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  delete clone.signature
  return clone
}

/** Canonical bytes to sign for a market catalog (detached Ed25519). */
export function marketCatalogSignaturePayload(catalog: ContentMarketCatalog): string {
  return canonicalJson(withoutTopLevelSignature(catalog))
}

/** Canonical bytes to sign for one market pack entry. */
export function marketPackSignaturePayload(pack: ContentMarketPack): string {
  return canonicalJson(withoutTopLevelSignature(pack))
}

/** Canonical bytes to sign for a remote pack.json (remote.signature excluded). */
export function remoteContentPackSignaturePayload(pack: ContentPackV2): string {
  const clone = JSON.parse(JSON.stringify(pack)) as Record<string, unknown>
  const remote = clone.remote
  if (isRecord(remote)) delete remote.signature
  return canonicalJson(clone)
}

export interface ContentSignatureVerifyOptions {
  /** UTC date YYYY-MM-DD used for key validity windows (default: today). */
  readonly now?: string
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function verifyDetachedSignature(
  payload: string,
  signature: ContentMarketSignature | undefined,
  trustRoot: ContentTrustRoot,
  verifier: ContentEd25519Verifier,
  options: ContentSignatureVerifyOptions = Object.freeze({}),
): ContentSignatureVerification {
  if (signature === undefined) return Object.freeze({ ok: false, code: 'missing-signature', message: 'missing Ed25519 signature' })
  if (signature.algorithm !== 'ed25519') return Object.freeze({ ok: false, code: 'invalid-signature', message: 'only ed25519 signatures are accepted' })
  const key = trustRoot.keys.find((candidate) => candidate.keyId === signature.keyId)
  if (key === undefined) return Object.freeze({ ok: false, code: 'unknown-signing-key', message: 'unknown signing key: ' + signature.keyId })
  if (key.status === 'revoked') return Object.freeze({ ok: false, code: 'revoked-signing-key', message: 'signing key is revoked: ' + signature.keyId })
  if (key.algorithm !== 'ed25519') return Object.freeze({ ok: false, code: 'invalid-signature', message: 'trust-root key is not ed25519: ' + signature.keyId })
  const now = options.now ?? todayUtcDate()
  if (key.notBefore !== undefined && now < key.notBefore) {
    return Object.freeze({ ok: false, code: 'key-outside-validity', message: 'signing key is not valid before ' + key.notBefore })
  }
  if (key.notAfter !== undefined && now > key.notAfter) {
    return Object.freeze({ ok: false, code: 'key-outside-validity', message: 'signing key expired after ' + key.notAfter })
  }
  let valid = false
  try {
    valid = verifier.verify(new TextEncoder().encode(payload), signature.value, key.publicKeyPem)
  } catch {
    valid = false
  }
  if (!valid) return Object.freeze({ ok: false, code: 'invalid-signature', message: 'Ed25519 signature does not match the canonical payload' })
  return Object.freeze({ ok: true, keyId: key.keyId, status: key.status })
}

/** Verify the detached signature over a market catalog with the trust root. */
export function verifyMarketCatalogSignature(
  catalog: ContentMarketCatalog,
  trustRoot: ContentTrustRoot,
  verifier: ContentEd25519Verifier,
  options?: ContentSignatureVerifyOptions,
): ContentSignatureVerification {
  const keyId = catalog.keyId
  const rawSignature: ContentMarketSignature | undefined = catalog.signature
  const signature = rawSignature === undefined ? undefined : rawSignature.keyId === keyId ? rawSignature : { ...rawSignature, keyId }
  return verifyDetachedSignature(marketCatalogSignaturePayload(catalog), signature, trustRoot, verifier, options)
}

/**
 * Verify one downloaded pack before install: the caller-provided zip sha256 must
 * equal the catalog value, then the detached Ed25519 signature over the pack
 * entry must verify. Only then may the zip be unzipped + validatePackZip'd.
 */
export function verifyMarketPackDownload(
  pack: ContentMarketPack,
  actualZipSha256: string,
  trustRoot: ContentTrustRoot,
  verifier: ContentEd25519Verifier,
  options?: ContentSignatureVerifyOptions,
): ContentSignatureVerification {
  const actual = typeof actualZipSha256 === 'string' ? actualZipSha256.toLowerCase() : ''
  if (actual.length !== 64 || actual !== pack.download.zipSha256) {
    return Object.freeze({ ok: false, code: 'hash-mismatch', message: 'downloaded zip sha256 does not match the catalog' })
  }
  return verifyDetachedSignature(marketPackSignaturePayload(pack), pack.signature, trustRoot, verifier, options)
}

/**
 * Verify a remote pack.json against the trust root. Local packs are implicitly
 * trusted after validation (no signature required); remote packs are
 * fail-closed unless a signature verifies. mergeCharacterThemes() additionally
 * requires the caller to pass this result through its verifyRemote hook.
 */
export function verifyRemoteContentPack(
  pack: ContentPackV2,
  trustRoot: ContentTrustRoot,
  verifier: ContentEd25519Verifier,
  options?: ContentSignatureVerifyOptions,
): ContentSignatureVerification {
  if (pack.source !== 'remote') return Object.freeze({ ok: true, keyId: 'local', status: 'active' })
  return verifyDetachedSignature(remoteContentPackSignaturePayload(pack), pack.remote?.signature, trustRoot, verifier, options)
}

// ===========================================================================
// v2: usage declaration helpers for the UI (confirmation before import)
// ===========================================================================

/** True when a value is the exact canonical unified usage declaration. */
export function isCanonicalUsageDeclaration(value: unknown): value is ContentUsageDeclaration {
  if (!isRecord(value)) return false
  if (value.researchOnly !== true) return false
  if (value.statement !== CONTENT_USAGE_STATEMENT) return false
  if (value.statementRef !== CONTENT_USAGE_STATEMENT_REF) return false
  if (!Array.isArray(value.prohibitedUses)) return false
  const list = value.prohibitedUses as readonly unknown[]
  return PROHIBITED_USES.every((required) => list.includes(required))
}

/** Data the UI must render before asking the user to confirm an import. */
export interface ContentUsageConfirmation {
  readonly required: true
  readonly statement: typeof CONTENT_USAGE_STATEMENT
  readonly statementRef: typeof CONTENT_USAGE_STATEMENT_REF
  readonly sha256: typeof CONTENT_USAGE_STATEMENT_SHA256
  readonly prohibitedUses: readonly ProhibitedUse[]
}

/**
 * UI contract: before importing/activating any third-party character theme or
 * content pack, show this statement (with the legal-doc link) and require an
 * explicit confirmation. Validation already rejects declarations that do not
 * match, so this helper is for presentation, not for re-validation.
 */
export function describeUsageConfirmation(): ContentUsageConfirmation {
  return Object.freeze({
    required: CONTENT_USAGE_CONFIRMATION_REQUIRED,
    statement: CONTENT_USAGE_STATEMENT,
    statementRef: CONTENT_USAGE_STATEMENT_REF,
    sha256: CONTENT_USAGE_STATEMENT_SHA256,
    prohibitedUses: PROHIBITED_USES,
  })
}

// ===========================================================================
// pet-anim 0.2: character animation asset packs — SPEC LAYER ONLY (MB-040/044)
// ===========================================================================
//
// `famling.pet-anim/0.2` is the third-party "new rig" bundle: one pack.json
// (this schema) + individual PNG frames + optional Ogg audio + a required
// preview. It is a SEPARATE payload schema from `famling.content-pack/0.2`
// (role-theme packs); only the envelope semantics are shared: usageDeclaration,
// license, aiProvenance, files[] + sha256, remote Ed25519 signature and the
// same zip/path/size caps (ARCH triage C-03 / E5-T5 / E6-T5).
//
// This module is the SPEC layer: pure schema validation, zip-layout validation
// against a host-computed inventory, and an INSTALLER PLAN contract. It does
// NOT unzip bytes, touch the filesystem, fetch the network, execute scripts,
// load a renderer, register a character, hot-switch or show UI (MB-041/MB-042
// are explicitly out of scope). A host installer must:
//   1. show the canonical usageDeclaration and require explicit confirmation;
//   2. bounded-unzip into its own staging directory under the caps below,
//      rejecting traversal/symlink/encrypted/duplicate/case-colliding entries;
//   3. hash every extracted file, then call validateCharacterPackZip();
//   4. call planCharacterPackInstall() and atomically rename staging -> final.

/** Schema id of the third-party character animation asset pack (current). */
export const CHARACTER_PACK_SCHEMA_V2 = 'famling.pet-anim/0.2'
/** Canonical schema id (alias of CHARACTER_PACK_SCHEMA_V2). */
export const CHARACTER_PACK_SCHEMA = CHARACTER_PACK_SCHEMA_V2
/** Version of the install-plan contract returned by planCharacterPackInstall(). */
export const CHARACTER_PACK_INSTALL_PLAN_SCHEMA = 'famling.character-install-plan/0.1'

/** Character kinds with a shipped animation rig contract in v0.2. */
export const CHARACTER_PACK_KINDS = ['cat', 'dog', 'humanoid'] as const
export type CharacterPackKind = (typeof CHARACTER_PACK_KINDS)[number]

/**
 * Envelope + zip limits for `famling.pet-anim/0.2`. Zip-level caps are shared
 * with `famling.content-pack/0.2` so one host unzip boundary serves both.
 */
export const CHARACTER_PACK_V2_LIMITS = Object.freeze({
  maxZipBytes: CONTENT_PACK_V2_LIMITS.maxZipBytes,
  maxZipEntries: CONTENT_PACK_V2_LIMITS.maxZipEntries,
  maxAssetBytes: CONTENT_PACK_V2_LIMITS.maxAssetBytes,
  maxTotalUncompressedBytes: CONTENT_PACK_V2_LIMITS.maxTotalUncompressedBytes,
  maxCompressionRatio: CONTENT_PACK_V2_LIMITS.maxCompressionRatio,
  maxPackJsonBytes: CONTENT_PACK_V2_LIMITS.maxPackJsonBytes,
  maxFiles: 192,
  maxFramesPerClip: 16,
  maxTotalFrames: 144,
  maxFps: 30,
  maxFrameBytes: 512 * 1024,
  maxPreviewBytes: 2 * 1024 * 1024,
  maxAudioBytes: 2 * 1024 * 1024,
  maxAudioTotalBytes: 8 * 1024 * 1024,
  maxSfx: 8,
  maxVoiceLines: 32,
  maxHoldMs: 2000,
  maxClipDurationMs: 10000,
  maxBehaviorStates: 64,
  maxBehaviorSlots: 64,
  maxFallbackEntries: 32,
  maxPreviewChars: 160,
  maxPaletteChars: 64,
  maxAuthorChars: 80,
  maxSpeciesChars: 32,
  maxTraitChars: 32,
  maxCapabilityList: 8,
  maxAudioTextChars: 240,
})

/** Canonical zip layout: manifest at the root; assets only under assets/. */
export const CHARACTER_PACK_MANIFEST_FILE = 'pack.json'
export const CHARACTER_PACK_FRAME_ROOT = 'assets/anim/'
export const CHARACTER_PACK_PREVIEW_ROOT = 'assets/preview/'
export const CHARACTER_PACK_SFX_ROOT = 'assets/audio/sfx/'
export const CHARACTER_PACK_VOICE_ROOT = 'assets/audio/voice/'
/** Fixed frame file naming inside the zip: two-digit zero-padded index. */
export const CHARACTER_PACK_FRAME_PATTERN = 'assets/anim/<clip>/<clip>_NN.png'
/** Root-level human-readable docs allowed outside assets/. */
export const CHARACTER_PACK_DOC_FILES = CONTENT_PACK_V2_DOC_FILES
/** Frame files are PNG only (deterministic pixel-art pipeline). */
export const CHARACTER_PACK_FRAME_EXTENSIONS = ['png'] as const
/** Preview images may be PNG or WebP (same allowlist as content-pack 0.2). */
export const CHARACTER_PACK_PREVIEW_EXTENSIONS = ['png', 'webp'] as const
/** Baked audio must be Ogg (Opus) only: no WAV/MP3 redistributed in v0.2. */
export const CHARACTER_PACK_AUDIO_EXTENSIONS = ['ogg'] as const

/**
 * Files a future data-driven loader (MB-041) derives from one installed pack.
 * v0.2 installs `pack.json` + assets; the runtime documents are derived, not
 * shipped as separate zip entries (single source of truth = pack.json).
 */
export const CHARACTER_PACK_RUNTIME_FILES = Object.freeze({
  character: 'character.json',
  behavior: 'behavior.json',
  regions: 'regions.json',
  heroManifest: 'manifest.json',
})

/** Per-clip semantics pinned by the v0.2 rig contract (frames/fps vary by art). */
export interface CharacterPackClipRule {
  readonly loop: boolean
  readonly layer: ClipLayer
  readonly category: ClipCategory
  readonly priority: number
}

/**
 * The 12 canonical clips every v0.2 pack must provide. Loop/layer/category/
 * priority are pinned to the shipping scheduler contract; only frames/fps and
 * optional per-frame holdMs are authored per character (validated by
 * tests/content-pack-v2.test.ts against src/pet/anim/clips.ts so the two
 * sources cannot drift silently).
 */
export const CHARACTER_PACK_CLIP_RULES: Readonly<Record<ClipId, CharacterPackClipRule>> = Object.freeze({
  idle: { loop: true, layer: 'base', category: 'idle', priority: 0 },
  idle_blink: { loop: false, layer: 'overlay', category: 'idle', priority: 10 },
  walk: { loop: true, layer: 'base', category: 'locomotion', priority: 5 },
  run: { loop: true, layer: 'base', category: 'locomotion', priority: 15 },
  pat_head: { loop: false, layer: 'oneshot', category: 'social', priority: 50 },
  ball_throw: { loop: false, layer: 'oneshot', category: 'interaction', priority: 40 },
  ball_chase: { loop: false, layer: 'oneshot', category: 'interaction', priority: 45 },
  paw_face: { loop: false, layer: 'oneshot', category: 'action', priority: 20 },
  scratch: { loop: false, layer: 'oneshot', category: 'action', priority: 20 },
  stand_wag: { loop: false, layer: 'oneshot', category: 'action', priority: 20 },
  chase_tail: { loop: false, layer: 'oneshot', category: 'action', priority: 20 },
  attack: { loop: false, layer: 'oneshot', category: 'combat', priority: 60 },
})

/** Voice/bubble policy is a product rule, not author preference. */
export const CHARACTER_PACK_VOICE_RULES: Readonly<Record<CharacterPackKind, CharacterPackVoiceV2>> = Object.freeze({
  humanoid: { mode: 'tts', canTts: true, bubble: 'speech' },
  cat: { mode: 'none', canTts: false, bubble: 'thought' },
  dog: { mode: 'none', canTts: false, bubble: 'thought' },
})

/** Behavior profile `extends` target pinned per kind (no arbitrary code). */
export const CHARACTER_PACK_BEHAVIOR_EXTENDS: Readonly<Record<CharacterPackKind, string>> = Object.freeze({
  humanoid: 'core:humanoid',
  cat: 'core:pet.cat',
  dog: 'core:pet.dog',
})

// ---------------------------------------------------------------------------
// pet-anim 0.2: types
// ---------------------------------------------------------------------------

/** Declarative render spec (canvas/anchor/foot box/display/palette). */
export interface CharacterPackSpecV2 {
  readonly canvas: readonly [number, number]
  readonly anchor: { readonly x: number; readonly y: number; readonly mode: 'foot-center' }
  readonly footBox: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  readonly bbox?: readonly [number, number, number, number]
  readonly display?: { readonly scale?: 1 | 2 | 4; readonly pixelated?: true }
  readonly palette: string
}

/** One clip: data-authored timing for a pinned scheduler slot. */
export interface CharacterPackClipV2 {
  readonly frames: number
  readonly fps: number
  readonly loop: boolean
  readonly layer: ClipLayer
  readonly category: ClipCategory
  readonly priority: number
  readonly holdMs?: readonly number[]
}

/** All 12 canonical clips, keyed by clip id. */
export interface CharacterPackAnimationsV2 {
  readonly clips: Readonly<Record<ClipId, CharacterPackClipV2>>
}

/** Character identity/UI hints derived from the pack (no executable fields). */
export interface CharacterPackCharacterV2 {
  readonly id: string
  readonly name: string
  readonly kind: CharacterPackKind
  readonly species?: string
  readonly traits?: readonly string[]
  readonly capabilities?: {
    readonly sockets?: readonly string[]
    readonly roles?: readonly string[]
    readonly behaviors?: readonly string[]
  }
  readonly fallback?: Readonly<Record<string, readonly ClipId[]>>
}

/** Voice/TTS/bubble capability; must equal CHARACTER_PACK_VOICE_RULES[kind]. */
export interface CharacterPackVoiceV2 {
  readonly mode: VoiceMode
  readonly canTts: boolean
  readonly bubble: BubbleSemantic
}

/** One optional baked sound effect. */
export interface CharacterPackSfxV2 {
  readonly id: string
  readonly file: string
  readonly event?: string
  readonly loop?: boolean
  readonly durationMs?: number
}

/** One optional baked voice line (humanoid only; redistribution must be cleared). */
export interface CharacterPackVoiceLineV2 {
  readonly id: string
  readonly file: string
  readonly text: string
  readonly locale?: string
}

/** Explicit rights declaration for baked audio (D8 gate). */
export interface CharacterPackAudioRightsV2 {
  readonly confirmed: boolean
  readonly note?: string
}

/** Optional audio layer; absent = no baked audio (host TTS/voice policy only). */
export interface CharacterPackAudioV2 {
  readonly redistribution: CharacterPackAudioRightsV2
  readonly sfx?: readonly CharacterPackSfxV2[]
  readonly voiceLines?: readonly CharacterPackVoiceLineV2[]
}

/**
 * One validated `famling.pet-anim/0.2` pack.json. Closed schema: unknown fields
 * are rejected. `behavior` and `regions` reuse the shipping FCI/behavior/region
 * validators (famling.behavior/0.1 + version-1 regions) so a pack can only
 * describe data the existing runtime already understands.
 */
export interface CharacterPackV2 {
  readonly schema: typeof CHARACTER_PACK_SCHEMA_V2
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
  readonly author: string
  readonly kind: CharacterPackKind
  readonly usageDeclaration: ContentUsageDeclaration
  readonly license: ContentPackLicense
  readonly aiProvenance: ContentAiProvenance
  readonly compatibility: ContentPackCompatibility
  readonly character: CharacterPackCharacterV2
  readonly spec: CharacterPackSpecV2
  readonly animations: CharacterPackAnimationsV2
  readonly voice: CharacterPackVoiceV2
  readonly behavior: BehaviorProfile
  readonly regions: HeroRegionConfig
  readonly audio?: CharacterPackAudioV2
  /** Required pack-relative preview path (assets/preview/, png/webp). */
  readonly preview: string
  /** Every bundle asset; the zip inventory must match this list exactly. */
  readonly files: readonly ContentPackFileV2[]
  readonly source: ContentPackSource
  readonly remote?: ContentRemoteOrigin
  readonly createdAt?: string
}

export type CharacterPackV2Validation =
  | { readonly ok: true; readonly pack: CharacterPackV2 }
  | { readonly ok: false; readonly issues: readonly ContentIssue[] }

// ---------------------------------------------------------------------------
// pet-anim 0.2: installer interface (plan only; the host does the I/O)
// ---------------------------------------------------------------------------

export type CharacterPackInstallAction = 'install' | 'update'

/** Explicit consent shown by the UI before planning an install. */
export interface CharacterPackInstallConsent {
  readonly usageConfirmed: true
  readonly licenseAcknowledged: true
  readonly aiDisclosureAcknowledged: true
}

/** What the host already has installed for one pack id. */
export interface CharacterPackInstalledRecord {
  readonly packId: string
  readonly version: string
  /** SHA-256 (lowercase hex) of the exact zip the host installed. */
  readonly zipSha256: string
}

export type CharacterPackInstallErrorCode =
  | 'invalid-pack'
  | 'invalid-zip'
  | 'invalid-install-request'
  | 'consent-required'
  | 'remote-unverified'
  | 'already-installed'
  | 'version-conflict'
  | 'downgrade-refused'
  | 'not-installed'

/** One file the host must extract (pack-relative path). */
export interface CharacterPackInstallFile {
  readonly path: string
  readonly bytes: number
  /** Present for manifest-declared files; pack.json hash is host-computed. */
  readonly sha256?: string
}

/**
 * Host-relative (POSIX) layout under the host characters root, e.g.
 * `<userData>/characters/`. The pure module never joins these with an absolute
 * path; the host MUST resolve them with its own safe join and re-check
 * containment before any write.
 */
export interface CharacterPackInstallLayoutV2 {
  readonly packRoot: string
  readonly installDir: string
  readonly stagingDir: string
  readonly backupDir: string
  readonly pointerFile: string
}

/** Read-only write budget the host must enforce while extracting the bundle. */
export interface CharacterPackInstallWriteBudget {
  readonly maxFileBytes: number
  readonly maxTotalBytes: number
  readonly maxFiles: number
}

/**
 * Deterministic plan handed to the (future) host installer. Creating it has no
 * side effects: no extraction, no writes, no rename, no network.
 */
export interface CharacterPackInstallPlan {
  readonly schema: typeof CHARACTER_PACK_INSTALL_PLAN_SCHEMA
  readonly action: CharacterPackInstallAction
  readonly packId: string
  readonly version: string
  readonly zipSha256: string
  readonly layout: CharacterPackInstallLayoutV2
  readonly files: readonly CharacterPackInstallFile[]
  readonly writeBudget: CharacterPackInstallWriteBudget
  readonly consent: CharacterPackInstallConsent
  readonly hostBoundary: {
    readonly unzip: 'host'
    readonly network: 'none'
    readonly scripts: false
    readonly atomicRename: true
  }
}

export type CharacterPackInstallPlanResult =
  | { readonly ok: true; readonly plan: CharacterPackInstallPlan }
  | { readonly ok: false; readonly code: CharacterPackInstallErrorCode; readonly message: string; readonly issues?: readonly ContentIssue[] }

export interface CharacterPackInstallRequest {
  /** A value that has already passed validateCharacterPackV2(). */
  readonly pack: CharacterPackV2
  /** Host-computed inventory of the bounded-unzipped bundle. */
  readonly inventory: ContentPackZipInventory
  /** SHA-256 (lowercase hex) of the exact .zip bytes the host will install. */
  readonly zipSha256: string
  readonly consent?: Partial<CharacterPackInstallConsent>
  readonly installed?: CharacterPackInstalledRecord
  /** Required for source:'remote'; pass verifyRemoteCharacterPack()'s result. */
  readonly remoteVerification?: ContentSignatureVerification
}

export interface CharacterPackUninstallRequest {
  readonly packId: string
  readonly installed?: CharacterPackInstalledRecord
}

/**
 * Deterministic uninstall plan: removes exactly one pack root, never a shared
 * directory, and keeps no backup (the host may keep its own restore copy).
 */
export interface CharacterPackUninstallPlan {
  readonly schema: typeof CHARACTER_PACK_INSTALL_PLAN_SCHEMA
  readonly action: 'uninstall'
  readonly packId: string
  readonly version: string
  readonly removeRoot: string
  readonly pointerFile: string
  readonly keepBackup: false
}

export type CharacterPackUninstallPlanResult =
  | { readonly ok: true; readonly plan: CharacterPackUninstallPlan }
  | { readonly ok: false; readonly code: CharacterPackInstallErrorCode; readonly message: string }

export interface CharacterPackHostInstallResult {
  readonly ok: boolean
  readonly installed?: CharacterPackInstalledRecord
  readonly code?: string
  readonly message?: string
}

/**
 * The (future) host-side installer contract. This pure module only PLANS; the
 * implementation lands in MB-042 behind the same bounded-unzip/atomic-rename
 * rules documented for `famling.content-pack/0.2` zips. Never implement this
 * with `unzip`-to-target, symlinks, network fetches or script execution.
 */
export interface CharacterPackHostInstaller {
  readonly id: string
  planInstall(request: CharacterPackInstallRequest): CharacterPackInstallPlanResult
  planUninstall(request: CharacterPackUninstallRequest): CharacterPackUninstallPlanResult
  install(plan: CharacterPackInstallPlan): Promise<CharacterPackHostInstallResult>
  uninstall(plan: CharacterPackUninstallPlan): Promise<CharacterPackHostInstallResult>
}

// ---------------------------------------------------------------------------
// pet-anim 0.2: parsers + validator (pure, issue-collecting, fail-closed)
// ---------------------------------------------------------------------------

const CHARACTER_PACK_CLIP_IDS: readonly ClipId[] = CLIP_IDS
const CHARACTER_PACK_CLIP_LAYERS: readonly ClipLayer[] = ['base', 'overlay', 'oneshot']
const CHARACTER_PACK_CLIP_CATEGORIES: readonly ClipCategory[] = ['idle', 'locomotion', 'social', 'action', 'interaction', 'combat']
const CHARACTER_PACK_SPEECH_MODES = ['text', 'voice', 'sfx', 'none'] as const
const CHARACTER_PACK_NON_HUMAN_SPEECH_MODES = ['sfx', 'none'] as const
const HUMAN_SPEECH_MODES = ['text', 'voice', 'none'] as const
const CHARACTER_PACK_EVENT_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/
const CHARACTER_PACK_TRAIT_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const CHARACTER_PACK_PALETTE_PATTERN = /^[a-z0-9][a-z0-9._@-]{0,63}$/
const CHARACTER_PACK_DISPLAY_SCALES: readonly number[] = [1, 2, 4]

function characterPackErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function readNumberTuple(
  raw: unknown,
  path: string,
  length: number,
  code: ContentIssueCode,
  issues: ContentIssue[],
  options: { readonly integer?: boolean; readonly min?: number; readonly max?: number } = {},
): readonly number[] | undefined {
  if (!Array.isArray(raw) || raw.length !== length) {
    addIssue(issues, path, code, 'expected an array of ' + length + ' numbers')
    return undefined
  }
  const out: number[] = []
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index]
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      addIssue(issues, path + '[' + index + ']', code, 'expected a finite number')
      return undefined
    }
    if (options.integer === true && !Number.isInteger(value)) {
      addIssue(issues, path + '[' + index + ']', code, 'expected an integer')
      return undefined
    }
    if (options.min !== undefined && value < options.min) {
      addIssue(issues, path + '[' + index + ']', code, 'must be >= ' + options.min)
      return undefined
    }
    if (options.max !== undefined && value > options.max) {
      addIssue(issues, path + '[' + index + ']', code, 'must be <= ' + options.max)
      return undefined
    }
    out.push(value)
  }
  return out
}

/** Fixed frame file path for one clip/frame (canonical zip layout). */
export function characterPackFramePath(clip: ClipId, index: number): string {
  const padded = index < 10 ? '0' + index : String(index)
  return CHARACTER_PACK_FRAME_ROOT + clip + '/' + clip + '_' + padded + '.png'
}

function characterPackFramePathsForClips(clips: Readonly<Record<ClipId, CharacterPackClipV2>>): string[] {
  const paths: string[] = []
  for (const clip of CHARACTER_PACK_CLIP_IDS) {
    const meta = clips[clip]
    if (meta === undefined) continue
    for (let index = 0; index < meta.frames; index += 1) paths.push(characterPackFramePath(clip, index))
  }
  return paths
}

/** Expected frame paths in clip order for one validated pack (QA/generator helper). */
export function characterPackFramePaths(pack: Pick<CharacterPackV2, 'animations'>): readonly string[] {
  return Object.freeze(characterPackFramePathsForClips(pack.animations.clips))
}

function parseCharacterPackSpec(raw: unknown, issues: ContentIssue[]): CharacterPackSpecV2 | undefined {
  const path = '$.spec'
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-anim-spec', 'spec must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['canvas', 'anchor', 'footBox', 'bbox', 'display', 'palette'], path, issues)
  const canvas = readNumberTuple(raw.canvas, path + '.canvas', 2, 'invalid-anim-spec', issues, {
    integer: true,
    min: CANVAS_SIZE_MIN,
    max: CANVAS_SIZE_MAX,
  })
  if (canvas !== undefined) {
    for (const [index, side] of canvas.entries()) {
      if (side % CANVAS_SIZE_ALIGNMENT !== 0) {
        addIssue(issues, path + '.canvas[' + index + ']', 'invalid-anim-spec', 'canvas sides must be a multiple of ' + CANVAS_SIZE_ALIGNMENT)
      }
    }
  }
  const canvasWidth = canvas?.[0]
  const canvasHeight = canvas?.[1]
  let anchor: CharacterPackSpecV2['anchor'] | undefined
  if (raw.anchor !== undefined && canvasWidth !== undefined && canvasHeight !== undefined) {
    if (!isRecord(raw.anchor)) {
      addIssue(issues, path + '.anchor', 'invalid-anim-spec', 'anchor must be an object')
    } else {
      checkUnknownKeys(raw.anchor, ['x', 'y', 'mode'], path + '.anchor', issues)
      const x = readNumberField(raw.anchor, 'x', path + '.anchor.x', issues, { integer: true, min: 0, max: canvasWidth })
      const y = readNumberField(raw.anchor, 'y', path + '.anchor.y', issues, { integer: true, min: 0, max: canvasHeight })
      const mode = readEnumField(raw.anchor, 'mode', path + '.anchor.mode', issues, ['foot-center'])
      if (x !== undefined && y !== undefined && mode !== undefined) anchor = { x, y, mode }
    }
  } else if (raw.anchor === undefined) {
    addIssue(issues, path + '.anchor', 'missing-field', 'anchor is required')
  }
  let footBox: CharacterPackSpecV2['footBox'] | undefined
  if (raw.footBox !== undefined) {
    if (!isRecord(raw.footBox)) {
      addIssue(issues, path + '.footBox', 'invalid-anim-spec', 'footBox must be an object')
    } else {
      checkUnknownKeys(raw.footBox, ['x', 'y', 'w', 'h'], path + '.footBox', issues)
      const x = readNumberField(raw.footBox, 'x', path + '.footBox.x', issues, { integer: true })
      const y = readNumberField(raw.footBox, 'y', path + '.footBox.y', issues, { integer: true })
      const w = readNumberField(raw.footBox, 'w', path + '.footBox.w', issues, { integer: true, min: 1 })
      const h = readNumberField(raw.footBox, 'h', path + '.footBox.h', issues, { integer: true, min: 1 })
      if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
        footBox = { x, y, w, h }
        if (canvasWidth !== undefined && canvasHeight !== undefined) {
          if (x < -canvasWidth || y < -canvasHeight || x + w > canvasWidth || y + h > canvasHeight) {
            addIssue(issues, path + '.footBox', 'invalid-anim-spec', 'footBox must stay inside the canvas origin box')
          }
        }
      }
    }
  } else {
    addIssue(issues, path + '.footBox', 'missing-field', 'footBox is required')
  }
  let bbox: readonly [number, number, number, number] | undefined
  if (raw.bbox !== undefined) {
    const tuple = readNumberTuple(raw.bbox, path + '.bbox', 4, 'invalid-anim-spec', issues, { integer: true, min: 0 })
    if (tuple !== undefined && canvasWidth !== undefined && canvasHeight !== undefined) {
      const [x, y, w, h] = tuple as [number, number, number, number]
      if (w <= 0 || h <= 0 || x + w > canvasWidth || y + h > canvasHeight) {
        addIssue(issues, path + '.bbox', 'invalid-anim-spec', 'bbox must stay inside the canvas')
      } else {
        bbox = [x, y, w, h]
      }
    }
  }
  let display: CharacterPackSpecV2['display'] | undefined
  if (raw.display !== undefined) {
    if (!isRecord(raw.display)) {
      addIssue(issues, path + '.display', 'invalid-anim-spec', 'display must be an object')
    } else {
      checkUnknownKeys(raw.display, ['scale', 'pixelated'], path + '.display', issues)
      let scale: 1 | 2 | 4 | undefined
      if (raw.display.scale !== undefined) {
        if (typeof raw.display.scale !== 'number' || !CHARACTER_PACK_DISPLAY_SCALES.includes(raw.display.scale)) {
          addIssue(issues, path + '.display.scale', 'invalid-anim-spec', 'display.scale must be one of 1, 2, 4')
        } else {
          scale = raw.display.scale as 1 | 2 | 4
        }
      }
      let pixelated: true | undefined
      if (raw.display.pixelated !== undefined) {
        if (raw.display.pixelated !== true) addIssue(issues, path + '.display.pixelated', 'invalid-anim-spec', 'display.pixelated must be true when present')
        else pixelated = true
      }
      if ((raw.display.scale === undefined || scale !== undefined) && (raw.display.pixelated === undefined || pixelated === true)) {
        display = { ...(scale !== undefined ? { scale } : {}), ...(pixelated !== undefined ? { pixelated } : {}) }
      }
    }
  }
  const palette = readStringField(raw, 'palette', path + '.palette', issues)
  if (palette !== undefined && (!CHARACTER_PACK_PALETTE_PATTERN.test(palette) || palette.length > CHARACTER_PACK_V2_LIMITS.maxPaletteChars)) {
    addIssue(issues, path + '.palette', 'invalid-anim-spec', 'palette must be a safe lowercase id (max ' + CHARACTER_PACK_V2_LIMITS.maxPaletteChars + ' chars)')
  }
  if (
    canvas === undefined ||
    anchor === undefined ||
    footBox === undefined ||
    palette === undefined ||
    (raw.bbox !== undefined && bbox === undefined) ||
    (raw.display !== undefined && display === undefined)
  ) {
    return undefined
  }
  const spec: { -readonly [K in keyof CharacterPackSpecV2]: CharacterPackSpecV2[K] } = {
    canvas: [canvas[0] as number, canvas[1] as number],
    anchor,
    footBox,
    palette,
  }
  if (bbox !== undefined) spec.bbox = bbox
  if (display !== undefined) spec.display = display
  return spec
}

function parseCharacterPackClips(
  raw: unknown,
  issues: ContentIssue[],
): Readonly<Record<ClipId, CharacterPackClipV2>> | undefined {
  const path = '$.animations'
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-anim-clip', 'animations must be an object with a clips table')
    return undefined
  }
  checkUnknownKeys(raw, ['clips'], path, issues)
  const rawClips = raw.clips
  if (!isRecord(rawClips)) {
    addIssue(issues, path + '.clips', 'invalid-anim-clip', 'clips must be an object keyed by clip id')
    return undefined
  }
  checkUnknownKeys(rawClips, CHARACTER_PACK_CLIP_IDS, path + '.clips', issues)
  const clips: Partial<Record<ClipId, CharacterPackClipV2>> = {}
  let totalFrames = 0
  for (const clip of CHARACTER_PACK_CLIP_IDS) {
    const rawClip = rawClips[clip]
    const clipPath = path + '.clips.' + clip
    if (rawClip === undefined) {
      addIssue(issues, clipPath, 'missing-field', 'clip "' + clip + '" is required in famling.pet-anim/0.2')
      continue
    }
    if (!isRecord(rawClip)) {
      addIssue(issues, clipPath, 'invalid-anim-clip', 'clip must be an object')
      continue
    }
    checkUnknownKeys(rawClip, ['frames', 'fps', 'loop', 'layer', 'category', 'priority', 'holdMs'], clipPath, issues)
    const frames = readNumberField(rawClip, 'frames', clipPath + '.frames', issues, {
      integer: true,
      min: 1,
      max: CHARACTER_PACK_V2_LIMITS.maxFramesPerClip,
    })
    const fps = readNumberField(rawClip, 'fps', clipPath + '.fps', issues, { integer: true, min: 1, max: CHARACTER_PACK_V2_LIMITS.maxFps })
    const loop = readBooleanField(rawClip, 'loop', clipPath + '.loop', issues)
    const layer = readEnumField(rawClip, 'layer', clipPath + '.layer', issues, CHARACTER_PACK_CLIP_LAYERS)
    const category = readEnumField(rawClip, 'category', clipPath + '.category', issues, CHARACTER_PACK_CLIP_CATEGORIES)
    const priority = readNumberField(rawClip, 'priority', clipPath + '.priority', issues, { integer: true, min: 0, max: 200 })
    const rule = CHARACTER_PACK_CLIP_RULES[clip]
    if (loop !== undefined && loop !== rule.loop) addIssue(issues, clipPath + '.loop', 'invalid-anim-clip', 'loop must be ' + String(rule.loop) + ' for clip "' + clip + '"')
    if (layer !== undefined && layer !== rule.layer) addIssue(issues, clipPath + '.layer', 'invalid-anim-clip', 'layer must be "' + rule.layer + '" for clip "' + clip + '"')
    if (category !== undefined && category !== rule.category) addIssue(issues, clipPath + '.category', 'invalid-anim-clip', 'category must be "' + rule.category + '" for clip "' + clip + '"')
    if (priority !== undefined && priority !== rule.priority) addIssue(issues, clipPath + '.priority', 'invalid-anim-clip', 'priority must be ' + rule.priority + ' for clip "' + clip + '"')
    let holdMs: readonly number[] | undefined
    if (rawClip.holdMs !== undefined) {
      const holds = readNumberTuple(rawClip.holdMs, clipPath + '.holdMs', frames ?? 0, 'invalid-anim-clip', issues, {
        integer: true,
        min: 16,
        max: CHARACTER_PACK_V2_LIMITS.maxHoldMs,
      })
      if (holds !== undefined) {
        holdMs = holds
        const total = holds.reduce((sum, hold) => sum + hold, 0)
        if (total <= 0 || total > CHARACTER_PACK_V2_LIMITS.maxClipDurationMs) {
          addIssue(issues, clipPath + '.holdMs', 'invalid-anim-clip', 'holdMs total must be 1..' + CHARACTER_PACK_V2_LIMITS.maxClipDurationMs + ' ms')
        }
      }
    } else if (frames !== undefined && fps !== undefined && fps > 0) {
      const durationMs = Math.round((frames / fps) * 1000)
      if (durationMs > CHARACTER_PACK_V2_LIMITS.maxClipDurationMs) {
        addIssue(issues, clipPath, 'invalid-anim-clip', 'clip duration ' + durationMs + ' ms > ' + CHARACTER_PACK_V2_LIMITS.maxClipDurationMs)
      }
    }
    if (frames !== undefined) totalFrames += frames
    if (
      frames === undefined ||
      fps === undefined ||
      loop === undefined ||
      layer === undefined ||
      category === undefined ||
      priority === undefined ||
      (rawClip.holdMs !== undefined && holdMs === undefined)
    ) {
      continue
    }
    clips[clip] = {
      frames,
      fps,
      loop,
      layer,
      category,
      priority,
      ...(holdMs !== undefined ? { holdMs } : {}),
    }
  }
  if (totalFrames > CHARACTER_PACK_V2_LIMITS.maxTotalFrames) {
    addIssue(issues, path + '.clips', 'too-many-files', totalFrames + ' total frames > ' + CHARACTER_PACK_V2_LIMITS.maxTotalFrames)
  }
  if (Object.keys(clips).length !== CHARACTER_PACK_CLIP_IDS.length) return undefined
  return clips as Readonly<Record<ClipId, CharacterPackClipV2>>
}

function parseCharacterPackCharacter(
  raw: unknown,
  packKind: CharacterPackKind | undefined,
  issues: ContentIssue[],
): CharacterPackCharacterV2 | undefined {
  const path = '$.character'
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-character', 'character must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['id', 'name', 'kind', 'species', 'traits', 'capabilities', 'fallback'], path, issues)
  const id = parsePackId(raw.id, path + '.id', issues)
  const name = readPlainText(raw, 'name', path + '.name', issues, { maxChars: CONTENT_LIMITS.maxNameChars })
  const kind = readEnumField(raw, 'kind', path + '.kind', issues, CHARACTER_PACK_KINDS)
  if (kind !== undefined && packKind !== undefined && kind !== packKind) {
    addIssue(issues, path + '.kind', 'invalid-character', 'character.kind must equal the pack kind "' + packKind + '"')
  }
  let species: string | undefined
  if (raw.species !== undefined) {
    species = readStringField(raw, 'species', path + '.species', issues)
    if (species !== undefined && (!CHARACTER_PACK_TRAIT_PATTERN.test(species) || species.length > CHARACTER_PACK_V2_LIMITS.maxSpeciesChars)) {
      addIssue(issues, path + '.species', 'invalid-character', 'species must be a safe lowercase id')
    }
  }
  let traits: readonly string[] | undefined
  if (raw.traits !== undefined) {
    traits = parseStringList(raw.traits, path + '.traits', issues, {
      max: CHARACTER_PACK_V2_LIMITS.maxCapabilityList,
      pattern: CHARACTER_PACK_TRAIT_PATTERN,
      patternMessage: 'trait ids must be lowercase ids (max 32 chars)',
    })
  }
  let capabilities: CharacterPackCharacterV2['capabilities'] | undefined
  if (raw.capabilities !== undefined) {
    if (!isRecord(raw.capabilities)) {
      addIssue(issues, path + '.capabilities', 'invalid-character', 'capabilities must be an object')
    } else {
      checkUnknownKeys(raw.capabilities, ['sockets', 'roles', 'behaviors'], path + '.capabilities', issues)
      const capabilitiesOut: { sockets?: readonly string[]; roles?: readonly string[]; behaviors?: readonly string[] } = {}
      for (const key of ['sockets', 'roles', 'behaviors'] as const) {
        const rawList = raw.capabilities[key]
        if (rawList === undefined) continue
        const list = parseStringList(rawList, path + '.capabilities.' + key, issues, {
          max: CHARACTER_PACK_V2_LIMITS.maxCapabilityList,
          pattern: CHARACTER_PACK_TRAIT_PATTERN,
          patternMessage: 'capability ids must be lowercase ids (max 32 chars)',
        })
        if (list !== undefined) capabilitiesOut[key] = list
      }
      capabilities = capabilitiesOut
    }
  }
  let fallback: Readonly<Record<string, readonly ClipId[]>> | undefined
  if (raw.fallback !== undefined) {
    if (!isRecord(raw.fallback)) {
      addIssue(issues, path + '.fallback', 'invalid-character', 'fallback must be an object of event -> clip id list')
    } else {
      const entries = Object.keys(raw.fallback)
      if (entries.length === 0 || entries.length > CHARACTER_PACK_V2_LIMITS.maxFallbackEntries) {
        addIssue(issues, path + '.fallback', 'invalid-character', 'fallback must have 1..' + CHARACTER_PACK_V2_LIMITS.maxFallbackEntries + ' entries')
      } else {
        const fallbackOut: Record<string, readonly ClipId[]> = {}
        for (const event of entries) {
          const list = parseStringList(raw.fallback[event], path + '.fallback.' + event, issues, {
            max: 8,
            values: CHARACTER_PACK_CLIP_IDS,
          })
          if (!CHARACTER_PACK_EVENT_PATTERN.test(event)) {
            addIssue(issues, path + '.fallback.' + event, 'invalid-character', 'fallback event id is not safe')
            continue
          }
          if (list !== undefined) fallbackOut[event] = list as ClipId[]
        }
        fallback = fallbackOut
      }
    }
  }
  if (id === undefined || name === undefined || kind === undefined) return undefined
  const character: { -readonly [K in keyof CharacterPackCharacterV2]: CharacterPackCharacterV2[K] } = { id, name, kind }
  if (species !== undefined) character.species = species
  if (traits !== undefined) character.traits = traits
  if (capabilities !== undefined) character.capabilities = capabilities
  if (fallback !== undefined) character.fallback = fallback
  return character
}

function parseCharacterPackVoice(
  raw: unknown,
  kind: CharacterPackKind | undefined,
  issues: ContentIssue[],
): CharacterPackVoiceV2 | undefined {
  const path = '$.voice'
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-voice', 'voice must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['mode', 'canTts', 'bubble'], path, issues)
  const mode = readEnumField(raw, 'mode', path + '.mode', issues, VOICE_MODES)
  const canTts = readBooleanField(raw, 'canTts', path + '.canTts', issues)
  const bubble = readEnumField(raw, 'bubble', path + '.bubble', issues, BUBBLE_SEMANTICS)
  if (kind !== undefined && mode !== undefined && canTts !== undefined && bubble !== undefined) {
    const rule = CHARACTER_PACK_VOICE_RULES[kind]
    if (mode !== rule.mode) addIssue(issues, path + '.mode', 'invalid-voice', 'voice.mode must be "' + rule.mode + '" for kind "' + kind + '"')
    if (canTts !== rule.canTts) addIssue(issues, path + '.canTts', 'invalid-voice', 'voice.canTts must be ' + String(rule.canTts) + ' for kind "' + kind + '"')
    if (bubble !== rule.bubble) addIssue(issues, path + '.bubble', 'invalid-voice', 'voice.bubble must be "' + rule.bubble + '" for kind "' + kind + '"')
  }
  if (mode === undefined || canTts === undefined || bubble === undefined) return undefined
  return { mode, canTts, bubble }
}

function parseCharacterPackAudio(
  raw: unknown,
  kind: CharacterPackKind | undefined,
  issues: ContentIssue[],
): CharacterPackAudioV2 | undefined {
  const path = '$.audio'
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-audio', 'audio must be an object')
    return undefined
  }
  checkUnknownKeys(raw, ['redistribution', 'sfx', 'voiceLines'], path, issues)
  let redistribution: CharacterPackAudioRightsV2 | undefined
  if (!isRecord(raw.redistribution)) {
    addIssue(issues, path + '.redistribution', 'invalid-audio', 'redistribution must be an object with confirmed: boolean')
  } else {
    checkUnknownKeys(raw.redistribution, ['confirmed', 'note'], path + '.redistribution', issues)
    const confirmed = readBooleanField(raw.redistribution, 'confirmed', path + '.redistribution.confirmed', issues)
    let note: string | undefined
    if (raw.redistribution.note !== undefined) {
      note = readPlainText(raw.redistribution, 'note', path + '.redistribution.note', issues, {
        required: false,
        maxChars: CONTENT_LIMITS.maxDescriptionChars,
      })
    }
    if (confirmed !== undefined) redistribution = { confirmed, ...(note !== undefined ? { note } : {}) }
  }
  let sfx: readonly CharacterPackSfxV2[] | undefined
  if (raw.sfx !== undefined) {
    if (!Array.isArray(raw.sfx) || raw.sfx.length === 0 || raw.sfx.length > CHARACTER_PACK_V2_LIMITS.maxSfx) {
      addIssue(issues, path + '.sfx', 'invalid-audio', 'sfx must be 1..' + CHARACTER_PACK_V2_LIMITS.maxSfx + ' entries')
    } else {
      const out: CharacterPackSfxV2[] = []
      const seen = new Set<string>()
      for (let index = 0; index < raw.sfx.length; index += 1) {
        const entryPath = path + '.sfx[' + index + ']'
        const entry = raw.sfx[index]
        if (!isRecord(entry)) {
          addIssue(issues, entryPath, 'invalid-audio', 'sfx entry must be an object')
          continue
        }
        checkUnknownKeys(entry, ['id', 'file', 'event', 'loop', 'durationMs'], entryPath, issues)
        const id = parseEntryId(entry.id, entryPath + '.id', issues)
        if (id !== undefined) {
          if (seen.has(id)) addIssue(issues, entryPath + '.id', 'duplicate-id', 'duplicate sfx id: ' + id)
          seen.add(id)
        }
        const file = parseSafePath(entry.file, entryPath + '.file', issues, {
          leadingSlash: false,
          extensions: CHARACTER_PACK_AUDIO_EXTENSIONS,
          maxChars: 160,
        })
        if (file !== undefined && !file.startsWith(CHARACTER_PACK_SFX_ROOT)) {
          addIssue(issues, entryPath + '.file', 'invalid-audio', 'sfx files must live under ' + CHARACTER_PACK_SFX_ROOT)
        }
        let event: string | undefined
        if (entry.event !== undefined) {
          event = readStringField(entry, 'event', entryPath + '.event', issues)
          if (event !== undefined && !CHARACTER_PACK_EVENT_PATTERN.test(event)) {
            addIssue(issues, entryPath + '.event', 'invalid-audio', 'sfx event id is not safe')
          }
        }
        let loop: boolean | undefined
        if (entry.loop !== undefined) loop = readBooleanField(entry, 'loop', entryPath + '.loop', issues)
        let durationMs: number | undefined
        if (entry.durationMs !== undefined) {
          durationMs = readNumberField(entry, 'durationMs', entryPath + '.durationMs', issues, {
            integer: true,
            min: 0,
            max: CHARACTER_PACK_V2_LIMITS.maxClipDurationMs,
          })
        }
        if (id === undefined || file === undefined) continue
        const parsed: { -readonly [K in keyof CharacterPackSfxV2]: CharacterPackSfxV2[K] } = { id, file }
        if (event !== undefined) parsed.event = event
        if (loop !== undefined) parsed.loop = loop
        if (durationMs !== undefined) parsed.durationMs = durationMs
        out.push(parsed)
      }
      sfx = out
    }
  }
  let voiceLines: readonly CharacterPackVoiceLineV2[] | undefined
  if (raw.voiceLines !== undefined) {
    if (kind !== undefined && kind !== 'humanoid') {
      addIssue(issues, path + '.voiceLines', 'invalid-audio', 'cat/dog packs must never carry baked voice lines (silent thought bubbles only)')
    } else if (!Array.isArray(raw.voiceLines) || raw.voiceLines.length === 0 || raw.voiceLines.length > CHARACTER_PACK_V2_LIMITS.maxVoiceLines) {
      addIssue(issues, path + '.voiceLines', 'invalid-audio', 'voiceLines must be 1..' + CHARACTER_PACK_V2_LIMITS.maxVoiceLines + ' entries')
    } else {
      const out: CharacterPackVoiceLineV2[] = []
      const seen = new Set<string>()
      for (let index = 0; index < raw.voiceLines.length; index += 1) {
        const entryPath = path + '.voiceLines[' + index + ']'
        const entry = raw.voiceLines[index]
        if (!isRecord(entry)) {
          addIssue(issues, entryPath, 'invalid-audio', 'voice line entry must be an object')
          continue
        }
        checkUnknownKeys(entry, ['id', 'file', 'text', 'locale'], entryPath, issues)
        const id = parseEntryId(entry.id, entryPath + '.id', issues)
        if (id !== undefined) {
          if (seen.has(id)) addIssue(issues, entryPath + '.id', 'duplicate-id', 'duplicate voice line id: ' + id)
          seen.add(id)
        }
        const file = parseSafePath(entry.file, entryPath + '.file', issues, {
          leadingSlash: false,
          extensions: CHARACTER_PACK_AUDIO_EXTENSIONS,
          maxChars: 160,
        })
        if (file !== undefined && !file.startsWith(CHARACTER_PACK_VOICE_ROOT)) {
          addIssue(issues, entryPath + '.file', 'invalid-audio', 'voice files must live under ' + CHARACTER_PACK_VOICE_ROOT)
        }
        const text = readPlainText(entry, 'text', entryPath + '.text', issues, { maxChars: CHARACTER_PACK_V2_LIMITS.maxAudioTextChars })
        let locale: string | undefined
        if (entry.locale !== undefined) {
          locale = readStringField(entry, 'locale', entryPath + '.locale', issues)
          if (locale !== undefined && !LANGUAGE_PATTERN.test(locale)) addIssue(issues, entryPath + '.locale', 'invalid-audio', 'locale must be a BCP-47-ish tag')
        }
        if (id === undefined || file === undefined || text === undefined) continue
        const parsed: { -readonly [K in keyof CharacterPackVoiceLineV2]: CharacterPackVoiceLineV2[K] } = { id, file, text }
        if (locale !== undefined) parsed.locale = locale
        out.push(parsed)
      }
      voiceLines = out
    }
  }
  const hasFiles = (sfx !== undefined && sfx.length > 0) || (voiceLines !== undefined && voiceLines.length > 0)
  if (hasFiles && redistribution !== undefined && redistribution.confirmed !== true) {
    addIssue(issues, path + '.redistribution.confirmed', 'audio-rights-unconfirmed', 'baked audio needs explicit confirmed redistribution rights before it can ship')
  }
  if (redistribution === undefined || (raw.sfx !== undefined && sfx === undefined) || (raw.voiceLines !== undefined && voiceLines === undefined)) {
    return undefined
  }
  const audio: { -readonly [K in keyof CharacterPackAudioV2]: CharacterPackAudioV2[K] } = { redistribution }
  if (sfx !== undefined && sfx.length > 0) audio.sfx = sfx
  if (voiceLines !== undefined && voiceLines.length > 0) audio.voiceLines = voiceLines
  return audio
}

function parseCharacterPackBehavior(
  raw: unknown,
  kind: CharacterPackKind | undefined,
  clips: Readonly<Record<ClipId, CharacterPackClipV2>>,
  issues: ContentIssue[],
): BehaviorProfile | undefined {
  const path = '$.behavior'
  let behavior: BehaviorProfile
  try {
    behavior = validateBehaviorProfile(raw)
  } catch (error) {
    addIssue(issues, path, 'invalid-behavior', characterPackErrorMessage(error))
    return undefined
  }
  const stateNames = Object.keys(behavior.states)
  if (stateNames.length === 0 || stateNames.length > CHARACTER_PACK_V2_LIMITS.maxBehaviorStates) {
    addIssue(issues, path + '.states', 'invalid-behavior', 'states must have 1..' + CHARACTER_PACK_V2_LIMITS.maxBehaviorStates + ' entries')
  }
  for (const name of stateNames) {
    const state = behavior.states[name]
    if (state === undefined) continue
    if (!CHARACTER_PACK_EVENT_PATTERN.test(name)) {
      addIssue(issues, path + '.states.' + name, 'invalid-behavior', 'state id is not safe')
    }
    if (!(state.tag in clips)) {
      addIssue(issues, path + '.states.' + name + '.tag', 'invalid-behavior', 'state tag "' + state.tag + '" is not a declared clip')
    }
    if (state.after !== undefined && !(state.after in behavior.states)) {
      addIssue(issues, path + '.states.' + name + '.after', 'invalid-behavior', 'after target "' + state.after + '" is not a declared state')
    }
    if (state.loop !== undefined && typeof state.loop !== 'boolean') {
      addIssue(issues, path + '.states.' + name + '.loop', 'invalid-behavior', 'loop must be boolean')
    }
  }
  const slots = behavior.slots
  if (slots === undefined || Object.keys(slots).length === 0) {
    addIssue(issues, path + '.slots', 'invalid-behavior', 'slots must declare at least one interaction slot')
  } else if (Object.keys(slots).length > CHARACTER_PACK_V2_LIMITS.maxBehaviorSlots) {
    addIssue(issues, path + '.slots', 'invalid-behavior', 'slots must have 1..' + CHARACTER_PACK_V2_LIMITS.maxBehaviorSlots + ' entries')
  } else {
    for (const [event, target] of Object.entries(slots)) {
      if (!CHARACTER_PACK_EVENT_PATTERN.test(event)) {
        addIssue(issues, path + '.slots.' + event, 'invalid-behavior', 'slot event id is not safe')
      }
      if (target === null) continue
      if (typeof target !== 'string' || !(target in behavior.states)) {
        addIssue(issues, path + '.slots.' + event, 'invalid-behavior', 'slot target "' + String(target) + '" is not a declared state')
      }
    }
  }
  if (behavior.extends === undefined) {
    addIssue(issues, path + '.extends', 'invalid-behavior', 'extends is required for a v0.2 pack (core profile per kind)')
  } else if (kind !== undefined && behavior.extends !== CHARACTER_PACK_BEHAVIOR_EXTENDS[kind]) {
    addIssue(issues, path + '.extends', 'invalid-behavior', 'extends must be "' + CHARACTER_PACK_BEHAVIOR_EXTENDS[kind] + '" for kind "' + kind + '"')
  }
  if (kind !== undefined) {
    const allowed = kind === 'humanoid' ? HUMAN_SPEECH_MODES : CHARACTER_PACK_NON_HUMAN_SPEECH_MODES
    if (!(allowed as readonly string[]).includes(behavior.abilities.speech)) {
      addIssue(issues, path + '.abilities.speech', 'invalid-behavior', 'speech mode "' + behavior.abilities.speech + '" is not allowed for kind "' + kind + '"')
    }
  }
  return behavior
}

function parseCharacterPackRegions(
  raw: unknown,
  behavior: BehaviorProfile | undefined,
  spec: CharacterPackSpecV2 | undefined,
  issues: ContentIssue[],
): HeroRegionConfig | undefined {
  const path = '$.regions'
  let regions: HeroRegionConfig
  try {
    regions = parseHeroRegionConfig(raw)
  } catch (error) {
    addIssue(issues, path, 'invalid-region', characterPackErrorMessage(error))
    return undefined
  }
  if (spec !== undefined && (regions.canvas[0] !== spec.canvas[0] || regions.canvas[1] !== spec.canvas[1])) {
    addIssue(issues, path + '.canvas', 'invalid-region', 'regions canvas must equal spec.canvas')
  }
  const slots = behavior?.slots ?? {}
  for (let index = 0; index < regions.gestures.length; index += 1) {
    const gesture = regions.gestures[index]
    if (gesture === undefined) continue
    if (slots[gesture.event] === undefined) {
      addIssue(issues, path + '.gestures[' + index + '].event', 'invalid-region', 'gesture event "' + gesture.event + '" is not declared in behavior.slots')
    }
    if (gesture.states === undefined) continue
    for (const state of gesture.states) {
      if (behavior !== undefined && !(state in behavior.states)) {
        addIssue(issues, path + '.gestures[' + index + '].states', 'invalid-region', 'gesture state "' + state + '" is not a declared behavior state')
      }
    }
  }
  for (let index = 0; index < (regions.actions ?? []).length; index += 1) {
    const action = (regions.actions ?? [])[index]
    if (action === undefined) continue
    if (slots[action.event] === undefined) {
      addIssue(issues, path + '.actions[' + index + '].event', 'invalid-region', 'action event "' + action.event + '" is not declared in behavior.slots')
    }
    if (action.followUpEvent !== undefined && slots[action.followUpEvent] === undefined) {
      addIssue(issues, path + '.actions[' + index + '].followUpEvent', 'invalid-region', 'follow-up event is not declared in behavior.slots')
    }
  }
  return regions
}

function parseCharacterPackPreview(raw: unknown, issues: ContentIssue[]): string | undefined {
  if (raw === undefined) {
    addIssue(issues, '$.preview', 'missing-preview', 'preview is required for a famling.pet-anim/0.2 pack')
    return undefined
  }
  const preview = parseSafePath(raw, '$.preview', issues, {
    leadingSlash: false,
    extensions: CHARACTER_PACK_PREVIEW_EXTENSIONS,
    maxChars: CHARACTER_PACK_V2_LIMITS.maxPreviewChars,
  })
  if (preview !== undefined && !preview.startsWith(CHARACTER_PACK_PREVIEW_ROOT)) {
    addIssue(issues, '$.preview', 'invalid-path', 'preview must live under ' + CHARACTER_PACK_PREVIEW_ROOT)
    return undefined
  }
  return preview
}

type CharacterPackFileKind = 'doc' | 'frame' | 'preview' | 'audio'

function characterPackFileKind(relativePath: string): CharacterPackFileKind | null {
  const slash = relativePath.lastIndexOf('/')
  const base = slash === -1 ? relativePath : relativePath.slice(slash + 1)
  if (slash === -1 && ROOT_PACK_DOC_PATTERN.test(base)) return 'doc'
  const extension = fileExtension(relativePath)
  if (relativePath.startsWith(CHARACTER_PACK_FRAME_ROOT)) {
    return (CHARACTER_PACK_FRAME_EXTENSIONS as readonly string[]).includes(extension) ? 'frame' : null
  }
  if (relativePath.startsWith(CHARACTER_PACK_PREVIEW_ROOT)) {
    return (CHARACTER_PACK_PREVIEW_EXTENSIONS as readonly string[]).includes(extension) ? 'preview' : null
  }
  if (relativePath.startsWith(CHARACTER_PACK_SFX_ROOT) || relativePath.startsWith(CHARACTER_PACK_VOICE_ROOT)) {
    return (CHARACTER_PACK_AUDIO_EXTENSIONS as readonly string[]).includes(extension) ? 'audio' : null
  }
  return null
}

function parseCharacterPackFileV2(raw: unknown, path: string, issues: ContentIssue[]): ContentPackFileV2 | undefined {
  if (!isRecord(raw)) {
    addIssue(issues, path, 'invalid-type', 'file must be an object with path/bytes/sha256')
    return undefined
  }
  checkUnknownKeys(raw, ['path', 'bytes', 'sha256'], path, issues)
  const filePath = parseSafePath(raw.path, path + '.path', issues, { leadingSlash: false, maxChars: 160 })
  let kind: CharacterPackFileKind | null = null
  if (filePath !== undefined) {
    kind = characterPackFileKind(filePath)
    if (kind === null) {
      addIssue(issues, path + '.path', 'forbidden-asset-type', 'only assets/anim/**/*.png, assets/preview/*.{png,webp}, assets/audio/**/*.ogg and root docs are allowed')
    }
  }
  const bytes = readNumberField(raw, 'bytes', path + '.bytes', issues, {
    integer: true,
    min: 1,
    max: CHARACTER_PACK_V2_LIMITS.maxAssetBytes,
  })
  const rawSha = readStringField(raw, 'sha256', path + '.sha256', issues)
  let sha256: string | undefined
  if (rawSha !== undefined) {
    if (!SHA256_PATTERN.test(rawSha)) addIssue(issues, path + '.sha256', 'invalid-type', 'sha256 must be lowercase hex (64 chars)')
    else sha256 = rawSha
  }
  if (filePath === undefined || kind === null || bytes === undefined || sha256 === undefined) return undefined
  return { path: filePath, bytes, sha256 }
}

interface CharacterPackReferenceInput {
  readonly clips: Readonly<Record<ClipId, CharacterPackClipV2>>
  readonly preview: string
  readonly license: ContentPackLicense
  readonly audio: CharacterPackAudioV2 | undefined
  readonly files: readonly ContentPackFileV2[]
}

function checkCharacterPackAssetReferences(input: CharacterPackReferenceInput, issues: ContentIssue[]): void {
  const declared = new Map<string, ContentPackFileV2>()
  for (const file of input.files) declared.set(file.path, file)
  const expectedFrames = new Set(characterPackFramePathsForClips(input.clips))
  const audioFiles = new Set<string>()
  if (input.audio?.sfx !== undefined) for (const cue of input.audio.sfx) audioFiles.add(cue.file)
  if (input.audio?.voiceLines !== undefined) for (const line of input.audio.voiceLines) audioFiles.add(line.file)
  if (input.preview !== undefined && !declared.has(input.preview)) {
    addIssue(issues, '$.preview', 'missing-file', 'preview is not listed in files: ' + input.preview)
  }
  if (input.license.file !== undefined && !declared.has(input.license.file)) {
    addIssue(issues, '$.license.file', 'missing-file', 'license file is not listed in files: ' + input.license.file)
  }
  for (const framePath of expectedFrames) {
    if (!declared.has(framePath)) addIssue(issues, '$.files', 'missing-file', 'expected frame is not listed in files: ' + framePath)
  }
  for (const cue of input.audio?.sfx ?? []) {
    if (!declared.has(cue.file)) addIssue(issues, '$.audio.sfx', 'missing-file', 'sfx file is not listed in files: ' + cue.file)
  }
  for (const line of input.audio?.voiceLines ?? []) {
    if (!declared.has(line.file)) addIssue(issues, '$.audio.voiceLines', 'missing-file', 'voice line file is not listed in files: ' + line.file)
  }
  let totalBytes = 0
  let audioBytes = 0
  let frameCount = 0
  for (const file of input.files) {
    totalBytes += file.bytes
    const kind = characterPackFileKind(file.path)
    if (kind === 'frame') {
      frameCount += 1
      if (!expectedFrames.has(file.path)) addIssue(issues, '$.files', 'unlisted-file', 'declared frame is not part of the clip table: ' + file.path)
      if (file.bytes > CHARACTER_PACK_V2_LIMITS.maxFrameBytes) {
        addIssue(issues, '$.files', 'too-large', 'frame ' + file.path + ' is ' + file.bytes + ' bytes > ' + CHARACTER_PACK_V2_LIMITS.maxFrameBytes)
      }
    } else if (kind === 'preview') {
      if (file.path !== input.preview) addIssue(issues, '$.files', 'unlisted-file', 'preview asset is not the declared preview: ' + file.path)
      if (file.bytes > CHARACTER_PACK_V2_LIMITS.maxPreviewBytes) {
        addIssue(issues, '$.files', 'too-large', 'preview is ' + file.bytes + ' bytes > ' + CHARACTER_PACK_V2_LIMITS.maxPreviewBytes)
      }
    } else if (kind === 'audio') {
      audioBytes += file.bytes
      if (!audioFiles.has(file.path)) addIssue(issues, '$.files', 'unlisted-file', 'audio file is not referenced by audio.sfx/voiceLines: ' + file.path)
      if (file.bytes > CHARACTER_PACK_V2_LIMITS.maxAudioBytes) {
        addIssue(issues, '$.files', 'too-large', 'audio file ' + file.path + ' is ' + file.bytes + ' bytes > ' + CHARACTER_PACK_V2_LIMITS.maxAudioBytes)
      }
    }
  }
  if (frameCount !== expectedFrames.size) {
    addIssue(issues, '$.files', 'missing-file', 'clip table expects ' + expectedFrames.size + ' frames, files declares ' + frameCount)
  }
  if (audioBytes > CHARACTER_PACK_V2_LIMITS.maxAudioTotalBytes) {
    addIssue(issues, '$.audio', 'too-large', 'total audio ' + audioBytes + ' bytes > ' + CHARACTER_PACK_V2_LIMITS.maxAudioTotalBytes)
  }
  if (totalBytes > CHARACTER_PACK_V2_LIMITS.maxTotalUncompressedBytes) {
    addIssue(issues, '$.files', 'too-large', 'declared files ' + totalBytes + ' bytes > ' + CHARACTER_PACK_V2_LIMITS.maxTotalUncompressedBytes)
  }
}

function parseCharacterPackV2(input: unknown, issues: ContentIssue[]): CharacterPackV2 | undefined {
  if (!isRecord(input)) {
    addIssue(issues, '$', 'invalid-anim-pack', 'character pack must be an object')
    return undefined
  }
  checkUnknownKeys(
    input,
    [
      'schema',
      'id',
      'name',
      'version',
      'description',
      'author',
      'kind',
      'usageDeclaration',
      'license',
      'aiProvenance',
      'compatibility',
      'character',
      'spec',
      'animations',
      'voice',
      'behavior',
      'regions',
      'audio',
      'preview',
      'files',
      'source',
      'remote',
      'createdAt',
    ],
    '$',
    issues,
  )
  const schema = readStringField(input, 'schema', '$.schema', issues)
  if (schema !== undefined && schema !== CHARACTER_PACK_SCHEMA_V2) {
    addIssue(issues, '$.schema', 'invalid-schema', 'schema must be "' + CHARACTER_PACK_SCHEMA_V2 + '"')
  }
  const id = parsePackId(input.id, '$.id', issues)
  const name = readPlainText(input, 'name', '$.name', issues, { maxChars: CONTENT_LIMITS.maxNameChars })
  const version = readStringField(input, 'version', '$.version', issues)
  if (version !== undefined && !SEMVER_PATTERN.test(version)) addIssue(issues, '$.version', 'invalid-version', 'version must be SemVer')
  const description = readPlainText(input, 'description', '$.description', issues, { maxChars: CONTENT_LIMITS.maxDescriptionChars })
  const author = readPlainText(input, 'author', '$.author', issues, { maxChars: CHARACTER_PACK_V2_LIMITS.maxAuthorChars })
  const kind = readEnumField(input, 'kind', '$.kind', issues, CHARACTER_PACK_KINDS)
  const usageDeclaration = parseUsageDeclaration(input.usageDeclaration, '$.usageDeclaration', issues)
  let license: ContentPackLicense | undefined
  if (input.license === undefined) addIssue(issues, '$.license', 'missing-field', 'license is required')
  else license = parsePackLicense(input.license, '$.license', issues)
  const aiProvenance = parseAiProvenance(input.aiProvenance, '$.aiProvenance', issues)
  const compatibility = parsePackCompatibility(input.compatibility, '$.compatibility', issues)
  if (compatibility !== undefined && compatibility.library !== CONTENT_LIBRARY_SCHEMA) {
    addIssue(issues, '$.compatibility.library', 'incompatible', 'pet-anim/0.2 packs must target ' + CONTENT_LIBRARY_SCHEMA)
  }
  const character = parseCharacterPackCharacter(input.character, kind, issues)
  const spec = parseCharacterPackSpec(input.spec, issues)
  const clips = parseCharacterPackClips(input.animations, issues)
  const voice = parseCharacterPackVoice(input.voice, kind, issues)
  const audio = input.audio === undefined ? undefined : parseCharacterPackAudio(input.audio, kind, issues)
  const behavior = clips === undefined ? undefined : parseCharacterPackBehavior(input.behavior, kind, clips, issues)
  const regions = parseCharacterPackRegions(input.regions, behavior, spec, issues)
  const preview = parseCharacterPackPreview(input.preview, issues)
  let files: ContentPackFileV2[] = []
  const rawFiles = readArrayField(input, 'files', '$.files', issues)
  if (rawFiles !== undefined) {
    if (rawFiles.length === 0 || rawFiles.length > CHARACTER_PACK_V2_LIMITS.maxFiles) {
      addIssue(issues, '$.files', 'too-many-files', 'files must be 1..' + CHARACTER_PACK_V2_LIMITS.maxFiles)
    } else {
      const seenPaths = new Set<string>()
      for (let index = 0; index < rawFiles.length; index += 1) {
        const file = parseCharacterPackFileV2(rawFiles[index], '$.files[' + index + ']', issues)
        if (file === undefined) continue
        if (seenPaths.has(file.path)) {
          addIssue(issues, '$.files[' + index + '].path', 'duplicate-id', 'duplicate file path: ' + file.path)
          continue
        }
        seenPaths.add(file.path)
        files.push(file)
      }
    }
  }
  if (clips !== undefined && preview !== undefined && license !== undefined) {
    checkCharacterPackAssetReferences({ clips, preview, license, audio, files }, issues)
  }
  let source: ContentPackSource = 'local'
  if (input.source !== undefined) {
    const rawSource = readStringField(input, 'source', '$.source', issues)
    if (rawSource !== undefined && rawSource !== 'local' && rawSource !== 'remote') {
      addIssue(issues, '$.source', 'invalid-type', 'source must be local or remote')
    } else if (rawSource === 'local' || rawSource === 'remote') {
      source = rawSource
    }
  }
  let remote: ContentRemoteOrigin | undefined
  if (input.remote !== undefined) {
    if (source !== 'remote') {
      addIssue(issues, '$.remote', 'invalid-remote', 'remote is only allowed when source is "remote"')
    } else {
      remote = parseRemoteOrigin(input.remote, '$.remote', issues)
      if (remote !== undefined && remote.signature === undefined) {
        addIssue(issues, '$.remote.signature', 'missing-signature', 'remote anim packs must carry an Ed25519 signature')
      }
    }
  } else if (source === 'remote') {
    addIssue(issues, '$.remote', 'missing-signature', 'remote anim packs must carry a signed remote origin')
  }
  let createdAt: string | undefined
  if (input.createdAt !== undefined) {
    createdAt = readStringField(input, 'createdAt', '$.createdAt', issues)
    if (createdAt !== undefined && !DATE_PATTERN.test(createdAt)) addIssue(issues, '$.createdAt', 'invalid-text', 'createdAt must be YYYY-MM-DD')
  }
  let jsonBytes = 0
  try {
    jsonBytes = countCodePoints(JSON.stringify(input))
  } catch {
    jsonBytes = 0
  }
  if (jsonBytes > CHARACTER_PACK_V2_LIMITS.maxPackJsonBytes) {
    addIssue(issues, '$', 'too-large', 'pack JSON is ' + jsonBytes + ' chars > ' + CHARACTER_PACK_V2_LIMITS.maxPackJsonBytes)
  }
  if (
    issues.length > 0 ||
    schema !== CHARACTER_PACK_SCHEMA_V2 ||
    id === undefined ||
    name === undefined ||
    version === undefined ||
    description === undefined ||
    author === undefined ||
    kind === undefined ||
    usageDeclaration === undefined ||
    license === undefined ||
    aiProvenance === undefined ||
    compatibility === undefined ||
    character === undefined ||
    spec === undefined ||
    clips === undefined ||
    voice === undefined ||
    behavior === undefined ||
    regions === undefined ||
    preview === undefined ||
    files.length === 0
  ) {
    return undefined
  }
  const pack: { -readonly [K in keyof CharacterPackV2]: CharacterPackV2[K] } = {
    schema: CHARACTER_PACK_SCHEMA_V2,
    id,
    name,
    version,
    description,
    author,
    kind,
    usageDeclaration,
    license,
    aiProvenance,
    compatibility,
    character,
    spec,
    animations: { clips },
    voice,
    behavior,
    regions,
    preview,
    files,
    source,
  }
  if (audio !== undefined) pack.audio = audio
  if (source === 'remote' && remote !== undefined) pack.remote = remote
  if (createdAt !== undefined) pack.createdAt = createdAt
  return deepFreeze(pack) as CharacterPackV2
}

/**
 * Strictly validate one `famling.pet-anim/0.2` pack.json. Returns every issue
 * instead of throwing. Missing usage declaration / licence / AI provenance /
 * preview / frames / sha256 or an unsigned remote origin are always rejected.
 * Pure: no bytes, no filesystem, no network, no script execution.
 */
export function validateCharacterPackV2(input: unknown): CharacterPackV2Validation {
  const issues: ContentIssue[] = []
  const pack = parseCharacterPackV2(input, issues)
  return issues.length === 0 && pack !== undefined ? { ok: true, pack } : { ok: false, issues }
}

// ===========================================================================
// pet-anim 0.2: zip layout validation (host unzips + hashes; module validates)
// ===========================================================================

/**
 * Validate an unzipped `famling.pet-anim/0.2` bundle inventory against its
 * manifest. The host bounded-unzips the .zip and computes sha256 for every
 * file; this pure function enforces: canonical relative paths (no traversal /
 * absolute / URL / backslash), zip/file/total/compression caps, pack.json at
 * the root, exact file coverage (no unlisted files, no missing files) and
 * sha256/size equality. Frames/audio/preview zones were already constrained by
 * validateCharacterPackV2(); anything else in the zip is rejected.
 */
export function validateCharacterPackZip(pack: CharacterPackV2, inventory: ContentPackZipInventory): ContentPackZipValidation {
  const issues: ContentIssue[] = []
  if (!isRecord(inventory)) {
    addIssue(issues, '$', 'invalid-zip', 'zip inventory must be an object')
    return Object.freeze({ ok: false, issues: Object.freeze(issues) })
  }
  const zipBytes = inventory.bytes
  if (typeof zipBytes !== 'number' || !Number.isInteger(zipBytes) || zipBytes <= 0 || zipBytes > CHARACTER_PACK_V2_LIMITS.maxZipBytes) {
    addIssue(issues, '$.bytes', 'zip-too-large', 'zip size must be 1..' + CHARACTER_PACK_V2_LIMITS.maxZipBytes + ' bytes')
  }
  const rawEntries: readonly unknown[] = Array.isArray(inventory.entries) ? inventory.entries : []
  if (!Array.isArray(inventory.entries)) addIssue(issues, '$.entries', 'invalid-zip', 'zip entries must be an array')
  if (rawEntries.length > CHARACTER_PACK_V2_LIMITS.maxZipEntries) {
    addIssue(issues, '$.entries', 'zip-too-large', rawEntries.length + ' entries > ' + CHARACTER_PACK_V2_LIMITS.maxZipEntries)
  }
  const entries = new Map<string, { bytes: number; sha256?: string }>()
  const seenLower = new Set<string>()
  let totalUncompressed = 0
  for (let index = 0; index < rawEntries.length; index += 1) {
    const rawEntry = rawEntries[index]
    const path = '$.entries[' + index + ']'
    if (!isRecord(rawEntry)) {
      addIssue(issues, path, 'invalid-zip', 'zip entry must be an object')
      continue
    }
    if (typeof rawEntry.path !== 'string') {
      addIssue(issues, path + '.path', 'invalid-zip', 'zip entry path must be a string')
      continue
    }
    const isDirectory = rawEntry.isDirectory === true || rawEntry.path.endsWith('/')
    const entryPath = isDirectory ? rawEntry.path.replace(/\/+$/, '') : rawEntry.path
    if (!isSafeZipEntryPath(entryPath)) {
      addIssue(issues, path + '.path', 'unsafe-zip-entry', 'unsafe zip entry path: ' + String(rawEntry.path).slice(0, 64))
      continue
    }
    const lower = entryPath.toLowerCase()
    if (seenLower.has(lower)) {
      addIssue(issues, path + '.path', 'duplicate-id', 'duplicate/case-colliding zip entry: ' + entryPath)
      continue
    }
    seenLower.add(lower)
    if (isDirectory) continue
    const bytes = rawEntry.bytes
    if (typeof bytes !== 'number' || !Number.isInteger(bytes) || bytes < 0 || bytes > CHARACTER_PACK_V2_LIMITS.maxAssetBytes) {
      addIssue(issues, path + '.bytes', 'zip-too-large', 'file size must be 0..' + CHARACTER_PACK_V2_LIMITS.maxAssetBytes + ' bytes')
      continue
    }
    if (rawEntry.sha256 !== undefined && (typeof rawEntry.sha256 !== 'string' || !SHA256_PATTERN.test(rawEntry.sha256))) {
      addIssue(issues, path + '.sha256', 'hash-mismatch', 'sha256 must be lowercase hex (64 chars)')
      continue
    }
    totalUncompressed += bytes
    entries.set(entryPath, {
      bytes,
      ...(typeof rawEntry.sha256 === 'string' ? { sha256: rawEntry.sha256 } : {}),
    })
  }
  const packJsonEntry = entries.get(CHARACTER_PACK_MANIFEST_FILE)
  if (packJsonEntry === undefined) {
    addIssue(issues, '$.entries', 'missing-file', 'bundle must contain ' + CHARACTER_PACK_MANIFEST_FILE + ' at the root')
  } else if (packJsonEntry.bytes > CHARACTER_PACK_V2_LIMITS.maxPackJsonBytes) {
    addIssue(issues, '$.entries', 'too-large', CHARACTER_PACK_MANIFEST_FILE + ' is ' + packJsonEntry.bytes + ' bytes > ' + CHARACTER_PACK_V2_LIMITS.maxPackJsonBytes)
  }
  if (totalUncompressed > CHARACTER_PACK_V2_LIMITS.maxTotalUncompressedBytes) {
    addIssue(issues, '$.entries', 'zip-too-large', 'uncompressed total ' + totalUncompressed + ' > ' + CHARACTER_PACK_V2_LIMITS.maxTotalUncompressedBytes)
  }
  if (typeof zipBytes === 'number' && zipBytes > 0 && totalUncompressed > zipBytes * CHARACTER_PACK_V2_LIMITS.maxCompressionRatio) {
    addIssue(issues, '$.entries', 'zip-too-large', 'compression ratio > ' + CHARACTER_PACK_V2_LIMITS.maxCompressionRatio + ' (possible zip bomb)')
  }
  const declared = new Map<string, ContentPackFileV2>()
  for (const file of pack.files) declared.set(file.path, file)
  for (const entryPath of entries.keys()) {
    if (entryPath === CHARACTER_PACK_MANIFEST_FILE) continue
    if (!declared.has(entryPath)) addIssue(issues, '$.entries', 'unlisted-file', 'zip file is not declared in pack.files: ' + entryPath)
  }
  for (let index = 0; index < pack.files.length; index += 1) {
    const declaredFile = pack.files[index]
    if (declaredFile === undefined) continue
    const entry = entries.get(declaredFile.path)
    if (entry === undefined) {
      addIssue(issues, '$.files[' + index + ']', 'missing-file', 'declared file is missing from the zip: ' + declaredFile.path)
      continue
    }
    if (entry.bytes !== declaredFile.bytes) {
      addIssue(issues, '$.files[' + index + '].bytes', 'file-size-mismatch', 'declared ' + declaredFile.bytes + ' bytes, actual ' + entry.bytes)
    }
    if (entry.sha256 === undefined) {
      addIssue(issues, '$.files[' + index + '].sha256', 'hash-mismatch', 'host must compute sha256 for ' + declaredFile.path)
    } else if (entry.sha256.toLowerCase() !== declaredFile.sha256) {
      addIssue(issues, '$.files[' + index + '].sha256', 'hash-mismatch', 'sha256 mismatch for ' + declaredFile.path)
    }
  }
  return issues.length === 0 ? Object.freeze({ ok: true }) : Object.freeze({ ok: false, issues: Object.freeze(issues) })
}

// ===========================================================================
// pet-anim 0.2: remote signature contract (same trust root/verifier as packs)
// ===========================================================================

/** Canonical bytes to sign for a remote anim pack.json (remote.signature excluded). */
export function characterPackSignaturePayload(pack: CharacterPackV2): string {
  const clone = JSON.parse(JSON.stringify(pack)) as Record<string, unknown>
  const remote = clone.remote
  if (isRecord(remote)) delete remote.signature
  return canonicalJson(clone)
}

/**
 * Verify a remote anim pack.json against the trust root. Local packs are
 * implicitly trusted after validation (no signature required); remote packs
 * are fail-closed unless the detached Ed25519 signature verifies.
 */
export function verifyRemoteCharacterPack(
  pack: CharacterPackV2,
  trustRoot: ContentTrustRoot,
  verifier: ContentEd25519Verifier,
  options?: ContentSignatureVerifyOptions,
): ContentSignatureVerification {
  if (pack.source !== 'remote') return Object.freeze({ ok: true, keyId: 'local', status: 'active' })
  return verifyDetachedSignature(characterPackSignaturePayload(pack), pack.remote?.signature, trustRoot, verifier, options)
}

// ===========================================================================
// pet-anim 0.2: installer PLAN contract (no I/O; host executes the plan)
// ===========================================================================

function isSafeInstallRelativePath(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return false
  if (CONTROL_TEST.test(value) || MARKUP_TEST.test(value) || value.includes('\\') || value.startsWith('/')) return false
  if (value.includes(':') || value.includes('#') || value.includes('?') || SOURCE_SCHEME_TEST.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && !/[<>"|*]/.test(segment))
}

function characterPackInstallLayout(packId: string, version: string): CharacterPackInstallLayoutV2 {
  return Object.freeze({
    packRoot: packId,
    installDir: packId + '/' + version,
    stagingDir: packId + '/.staging-' + version,
    backupDir: packId + '/.backup-' + version,
    pointerFile: packId + '/current.json',
  })
}

/**
 * Host-relative install layout for one pack version (same convention as
 * planCharacterPackInstall()). Exported for the stateful runtime layer
 * (character-packs.ts), which must address a previous version directory when
 * planning an explicit rollback: <packId>/<version>, <packId>/current.json.
 * Callers must pass an already-validated pack id + SemVer; this helper does
 * not re-validate and performs no I/O.
 */
export function characterPackInstallLayoutFor(packId: string, version: string): CharacterPackInstallLayoutV2 {
  return characterPackInstallLayout(packId, version)
}

function isReservedBuiltinPackId(packId: string): boolean {
  return packId === 'famling' || packId.startsWith('famling.') || packId.startsWith('famling-')
}

/**
 * Plan a local install/update from an already-validated manifest and a
 * host-computed zip inventory. This function performs NO I/O: it re-validates
 * fail-closed, requires explicit consent, refuses unsigned remote packs, and
 * returns the exact file list + host-relative layout for the future MB-042
 * installer to execute atomically (bounded unzip to staging, fsync, rename).
 */
export function planCharacterPackInstall(request: CharacterPackInstallRequest): CharacterPackInstallPlanResult {
  if (!isRecord(request)) return { ok: false, code: 'invalid-install-request', message: 'install request must be an object' }
  const validation = validateCharacterPackV2(request.pack)
  if (!validation.ok) return { ok: false, code: 'invalid-pack', message: 'pack does not validate', issues: validation.issues }
  const pack = validation.pack
  const rawZipSha = request.zipSha256
  const zipSha256 = typeof rawZipSha === 'string' ? rawZipSha.toLowerCase() : ''
  if (!SHA256_PATTERN.test(zipSha256)) {
    return { ok: false, code: 'invalid-install-request', message: 'zipSha256 must be lowercase hex (64 chars)' }
  }
  const consent = request.consent
  if (
    consent === undefined ||
    consent.usageConfirmed !== true ||
    consent.licenseAcknowledged !== true ||
    consent.aiDisclosureAcknowledged !== true
  ) {
    return { ok: false, code: 'consent-required', message: 'explicit usage/licence/AI-disclosure consent is required before planning an install' }
  }
  if (pack.source === 'remote') {
    const verification = request.remoteVerification
    if (verification === undefined || verification.ok !== true) {
      return { ok: false, code: 'remote-unverified', message: 'remote anim packs must pass verifyRemoteCharacterPack() before install' }
    }
  }
  const zip = validateCharacterPackZip(pack, request.inventory)
  if (!zip.ok) return { ok: false, code: 'invalid-zip', message: 'zip inventory does not match the manifest', issues: zip.issues }
  let action: CharacterPackInstallAction = 'install'
  const installed = request.installed
  if (installed !== undefined) {
    if (
      typeof installed.packId !== 'string' ||
      installed.packId !== pack.id ||
      !PACK_ID_PATTERN.test(installed.packId) ||
      typeof installed.version !== 'string' ||
      !SEMVER_PATTERN.test(installed.version) ||
      typeof installed.zipSha256 !== 'string' ||
      !SHA256_PATTERN.test(installed.zipSha256)
    ) {
      return { ok: false, code: 'invalid-install-request', message: 'installed record is invalid or does not match the pack id' }
    }
    const order = compareSemver(pack.version, installed.version)
    if (order === 0) {
      if (installed.zipSha256 === zipSha256) {
        return { ok: false, code: 'already-installed', message: 'identical version and zip are already installed' }
      }
      return { ok: false, code: 'version-conflict', message: 'same version with a different zip hash; bump the pack version' }
    }
    if (order < 0) {
      return { ok: false, code: 'downgrade-refused', message: 'updates must be a higher SemVer version; rollback is a separate host action' }
    }
    action = 'update'
  }
  const layout = characterPackInstallLayout(pack.id, pack.version)
  for (const value of Object.values(layout)) {
    if (!isSafeInstallRelativePath(value)) {
      return { ok: false, code: 'invalid-install-request', message: 'refusing unsafe install layout path: ' + value }
    }
  }
  const entries = new Map<string, { bytes: number; sha256?: string }>()
  for (const rawEntry of request.inventory.entries) {
    if (!isRecord(rawEntry) || typeof rawEntry.path !== 'string') continue
    if (rawEntry.isDirectory === true || rawEntry.path.endsWith('/')) continue
    const entryPath = rawEntry.path
    if (entries.has(entryPath)) continue
    if (typeof rawEntry.bytes !== 'number') continue
    entries.set(entryPath, {
      bytes: rawEntry.bytes,
      ...(typeof rawEntry.sha256 === 'string' ? { sha256: rawEntry.sha256 } : {}),
    })
  }
  const packJsonEntry = entries.get(CHARACTER_PACK_MANIFEST_FILE)
  if (packJsonEntry === undefined) {
    return { ok: false, code: 'invalid-zip', message: 'zip inventory has no ' + CHARACTER_PACK_MANIFEST_FILE }
  }
  const files: CharacterPackInstallFile[] = []
  files.push({
    path: CHARACTER_PACK_MANIFEST_FILE,
    bytes: packJsonEntry.bytes,
    ...(packJsonEntry.sha256 !== undefined ? { sha256: packJsonEntry.sha256 } : {}),
  })
  for (const file of pack.files) files.push({ path: file.path, bytes: file.bytes, sha256: file.sha256 })
  const plan: CharacterPackInstallPlan = deepFreeze({
    schema: CHARACTER_PACK_INSTALL_PLAN_SCHEMA,
    action,
    packId: pack.id,
    version: pack.version,
    zipSha256,
    layout,
    files,
    writeBudget: {
      maxFileBytes: CHARACTER_PACK_V2_LIMITS.maxAssetBytes,
      maxTotalBytes: CHARACTER_PACK_V2_LIMITS.maxTotalUncompressedBytes,
      maxFiles: CHARACTER_PACK_V2_LIMITS.maxFiles,
    },
    consent: {
      usageConfirmed: true,
      licenseAcknowledged: true,
      aiDisclosureAcknowledged: true,
    },
    hostBoundary: { unzip: 'host', network: 'none', scripts: false, atomicRename: true },
  })
  return { ok: true, plan }
}

/**
 * Plan an uninstall: removes exactly `<packId>/` under the host characters
 * root. Built-in (`famling.*`) characters are never removable, and an
 * uninstall without an installed record fails closed.
 */
export function planCharacterPackUninstall(request: CharacterPackUninstallRequest): CharacterPackUninstallPlanResult {
  if (!isRecord(request)) return { ok: false, code: 'invalid-install-request', message: 'uninstall request must be an object' }
  const packId = request.packId
  if (typeof packId !== 'string' || !PACK_ID_PATTERN.test(packId) || packId.length > 64) {
    return { ok: false, code: 'invalid-install-request', message: 'packId must be a safe lowercase pack id' }
  }
  if (isReservedBuiltinPackId(packId)) {
    return { ok: false, code: 'invalid-install-request', message: 'built-in famling.* characters cannot be uninstalled' }
  }
  const installed = request.installed
  if (installed === undefined) return { ok: false, code: 'not-installed', message: 'no installed record for ' + packId }
  if (installed.packId !== packId || typeof installed.version !== 'string' || !SEMVER_PATTERN.test(installed.version)) {
    return { ok: false, code: 'invalid-install-request', message: 'installed record does not match the pack id/version' }
  }
  const layout = characterPackInstallLayout(packId, installed.version)
  if (!isSafeInstallRelativePath(layout.packRoot) || !isSafeInstallRelativePath(layout.pointerFile)) {
    return { ok: false, code: 'invalid-install-request', message: 'refusing unsafe uninstall path' }
  }
  const plan: CharacterPackUninstallPlan = deepFreeze({
    schema: CHARACTER_PACK_INSTALL_PLAN_SCHEMA,
    action: 'uninstall',
    packId,
    version: installed.version,
    removeRoot: layout.packRoot,
    pointerFile: layout.pointerFile,
    keepBackup: false,
  })
  return { ok: true, plan }
}
