/**
 * Built-in (shipped) character aliases.
 *
 * The consent layer gates *DLC / content-pack* loads with a fresh full-TOS
 * confirmation on every load. The characters that ship inside the app are not
 * DLC: their content is covered by the first-run TOS and they must NOT trigger
 * the per-load pack dialog (otherwise the default pet would prompt whenever a
 * caller routes it through the generic pack loader).
 *
 * This list is intentionally narrow: only the three shipped hero pets
 * (`humanoid` / `cat` / `dog`), their pack directories and their FCI document
 * ids are exempt. The opt-in 256 concept preview (`tinglan`) is deliberately
 * NOT listed — it is a non-final content pack and must go through
 * `loadPackWithConsent()` like any other DLC.
 *
 * Pure data, no imports: safe in the browser, Node tooling and tests.
 */

/** `?hero=1&character=` ids of the shipped hero pets (see hero-runtime.ts). */
export const BUILTIN_HERO_IDS = ['humanoid', 'cat', 'dog'] as const

/** `public/characters/<dir>` pack directories of the shipped pets. */
export const BUILTIN_CHARACTER_DIRS = ['humanoid-default', 'pet-default', 'pet-cat', 'pet-dog'] as const

/** `character.json` document ids of the shipped pets. */
export const BUILTIN_CHARACTER_DOCUMENT_IDS = [
  'famling.humanoid-default',
  'famling.pet-default',
  'famling.pet-cat',
  'famling.pet-dog',
] as const

const BUILTIN_IDS: ReadonlySet<string> = new Set<string>([
  ...BUILTIN_HERO_IDS,
  ...BUILTIN_CHARACTER_DIRS,
  ...BUILTIN_CHARACTER_DOCUMENT_IDS,
])

/**
 * True only for the exact shipped-pet ids above (case/whitespace normalized).
 * Anything else — including `tinglan`, imported community packs and unknown
 * ids — is treated as DLC and must pass the per-load consent gate.
 */
export function isBuiltinCharacterId(value: string): boolean {
  if (typeof value !== 'string') return false
  return BUILTIN_IDS.has(value.trim().toLowerCase())
}
