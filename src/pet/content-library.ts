/**
 * Content library / theme market shared core for famling + dsh-famling.
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
 * Security boundary (0.1):
 * - catalog + packs are declarative JSON only; no scripts, no HTML, no URLs are
 *   fetched by this module;
 * - every text field is plain text (no "<" / ">"), bounded, no control/bidi
 *   characters;
 * - every path is relative and canonical (no "..", absolute/UNC/drive/ADS);
 * - every theme color/shadow/pattern/font value is a strict CSS token that
 *   cannot smuggle \`url(...)\`, \`@import\`, \`var(...)\` or a declaration break;
 * - third-party packs must declare licence, AI disclosure and closed safety
 *   boundaries before they can be merged.
 *
 * Remote market fields (\`source: "remote"\` / \`remote\`) are RESERVED data
 * shapes. Nothing in this module fetches, verifies on the network or installs
 * anything; signature fields are metadata only (see public/content/README.md).
 */

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

/** Schema id of the built-in catalog document (public/content/library.json). */
export const CONTENT_LIBRARY_SCHEMA = 'famling.content/0.1'
/** Schema id of one third-party content pack document. */
export const CONTENT_PACK_SCHEMA = 'famling.content-pack/0.1'

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
  readonly defaults: ContentSelection
  readonly characters: readonly ContentCharacterEntry[]
  readonly voices: readonly ContentVoiceEntry[]
  readonly dialoguePacks: readonly ContentDialoguePackEntry[]
  readonly themes: readonly ContentThemeEntry[]
  readonly backgrounds: readonly ContentBackgroundEntry[]
  readonly fonts: readonly ContentFontEntry[]
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

/** Strictly parse + validate public/content/library.json (or a merged catalog). */
export function parseContentLibrary(input: unknown): ContentLibrary {
  const issues: ContentIssue[] = []
  if (!isRecord(input)) {
    addIssue(issues, '$', 'invalid-type', 'content library must be an object')
    throw new ContentLibraryError(failSummary('invalid content library', issues), issues)
  }
  checkUnknownKeys(input, ['schema', 'version', 'updatedAt', 'defaults', ...CONTENT_CATEGORIES], '$', issues)
  const schema = readStringField(input, 'schema', '$.schema', issues)
  if (schema !== undefined && schema !== CONTENT_LIBRARY_SCHEMA) {
    addIssue(issues, '$.schema', 'invalid-schema', 'expected ' + CONTENT_LIBRARY_SCHEMA)
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
  if (defaults !== undefined) checkDefaultsReferences(defaults, categories, issues)
  if (issues.length > 0 || defaults === undefined) {
    throw new ContentLibraryError(failSummary('invalid content library', issues.length > 0 ? issues : [{ path: '$', code: 'invalid-defaults', message: 'defaults missing' }]), issues.length > 0 ? issues : [{ path: '$', code: 'invalid-defaults', message: 'defaults missing' }])
  }
  const library: ContentLibrary = {
    schema: CONTENT_LIBRARY_SCHEMA,
    version: version as string,
    updatedAt: updatedAt as string,
    defaults,
    characters: categories.characters as ContentCharacterEntry[],
    voices: categories.voices as ContentVoiceEntry[],
    dialoguePacks: categories.dialoguePacks as ContentDialoguePackEntry[],
    themes: categories.themes as ContentThemeEntry[],
    backgrounds: categories.backgrounds as ContentBackgroundEntry[],
    fonts: categories.fonts as ContentFontEntry[],
  }
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
  if (library !== undefined && library !== CONTENT_LIBRARY_SCHEMA) {
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
  if (library === undefined || library !== CONTENT_LIBRARY_SCHEMA) return undefined
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
  if (pack.compatibility.library !== library.schema) return false
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
