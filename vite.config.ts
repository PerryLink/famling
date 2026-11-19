import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// Resolve project paths from this config file, never from process.cwd():
// `tauri build` runs its beforeBuildCommand from app/tauri/, so cwd-relative
// guard paths made the build look in app/tauri/public/ and fail.
const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url))

const BAKED_VOICE_DIR = resolve(PROJECT_ROOT, 'public/assets/voice/pet')
const BAKED_VOICE_DIST_DIR = resolve(PROJECT_ROOT, 'dist/assets/voice/pet')
const BAKED_VOICE_LICENSE = 'deepseek-tts-terms'
/** Both DeepSeek voices ship a complete baked pack today. */
const BAKED_VOICE_LINE_COUNTS: ReadonlyMap<string, number> = new Map([
  ['stella', 21],
  ['tide', 21],
])
const BAKED_VOICE_TOTAL_LINES = 42
const TIDE_VOICE_DIR = 'tide/'

interface BakedManifestLine {
  id?: unknown
  text?: unknown
  file?: unknown
  voice?: unknown
  provider?: unknown
  license?: unknown
  ai?: unknown
  bytes?: unknown
  durationMs?: unknown
  sha256?: unknown
}

interface BakedManifest {
  schemaVersion?: unknown
  voicePresets?: unknown
  pendingLines?: unknown
  lines?: unknown
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Resolve a manifest-relative file without allowing `..` escapes out of the pack dir. */
function resolveBakedFile(root: string, file: string): string | null {
  const absolute = resolve(root, file)
  const rel = relative(root, absolute)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return absolute
}

/**
 * Baked voice guard (2026-11-17; stella+tide pack).
 *
 * The user explicitly authorized using the DeepSeek TTS synthetic voices and
 * caching them (see docs/legal/TTS-TERMS.md §3A). The build must COPY both
 * baked packs into `dist/` (the old `excludeUnclearedAudio` plugin deleted them
 * and the `INCLUDE_UNCLEARED_AUDIO=1` bypass is gone). This guard keeps the
 * packaging honest instead of deleting audio:
 *   - `public/assets/voice/pet/manifest.json` is schema v2 with exactly 42 rows
 *     (21 `stella` + 21 `tide`) and per-line
 *     voice/license/ai/provider/bytes/duration/sha256;
 *   - both presets are `available` with the expected line counts; no other
 *     voice/preset is accepted (an unknown extra voice fails the build);
 *   - `stella` files live at the pack root, `tide` files under `tide/`; each of
 *     the 21 tide WAVs must exist and be copied to dist (never faked by reusing
 *     a stella file: same text across voices must have different sha256);
 *   - every manifest WAV exists, matches bytes + sha256, and was copied to dist;
 *     the public/dist pack contains no unreferenced extra file;
 *   - pending lines never claim a file/sha (no invented audio).
 *
 * A broken pack fails the build loudly. Legal clearance remains a separate
 * concern: docs/legal/TTS-TERMS.md §3A records the user authorization and keeps
 * the DRAFT/upstream-terms caveat.
 */
function bakedVoiceGuard() {
  return {
    name: 'baked-voice-guard',
    apply: 'build' as const,
    closeBundle() {
      const manifestPath = join(BAKED_VOICE_DIR, 'manifest.json')
      const manifest = readJson(manifestPath) as BakedManifest | null
      const problems: string[] = []
      if (!manifest) throw new Error('[baked-voice] public/assets/voice/pet/manifest.json is missing or invalid JSON')
      if (manifest.schemaVersion !== 2) problems.push('manifest schemaVersion must be 2')
      if (!Array.isArray(manifest.lines) || manifest.lines.length === 0) {
        throw new Error('[baked-voice] manifest.lines is missing/empty')
      }
      const lines = manifest.lines as BakedManifestLine[]
      if (lines.length !== BAKED_VOICE_TOTAL_LINES) {
        problems.push(`manifest.lines must contain exactly ${BAKED_VOICE_TOTAL_LINES} rows (got ${lines.length})`)
      }
      if (!Array.isArray(manifest.voicePresets)) {
        problems.push('manifest.voicePresets is missing')
      }
      const presets = Array.isArray(manifest.voicePresets) ? (manifest.voicePresets as Array<Record<string, unknown>>) : []
      const presetIds = new Set<string>()
      for (const preset of presets) {
        const id = typeof preset.id === 'string' ? preset.id : ''
        if (!id) {
          problems.push('voicePresets entry without an id')
          continue
        }
        if (presetIds.has(id)) problems.push(`voicePresets has a duplicate entry: ${id}`)
        presetIds.add(id)
        const expected = BAKED_VOICE_LINE_COUNTS.get(id)
        if (expected === undefined) {
          problems.push(`unexpected voice preset ${id} (only stella+tide are baked)`)
          continue
        }
        if (preset.status !== 'available') problems.push(`voicePresets.${id}.status ${String(preset.status)} != available`)
        if (preset.lineCount !== expected) problems.push(`voicePresets.${id}.lineCount ${String(preset.lineCount)} != ${expected}`)
      }
      for (const [id, expected] of BAKED_VOICE_LINE_COUNTS) {
        if (!presetIds.has(id)) problems.push(`voicePresets.${id} is missing`)
        const count = lines.filter((line) => line.voice === id).length
        if (count !== expected) problems.push(`expected ${expected} ${id} line(s), got ${count}`)
      }
      const tideExpected = BAKED_VOICE_LINE_COUNTS.get('tide') ?? 0
      const tideDir = join(BAKED_VOICE_DIR, 'tide')
      const tideFiles = existsSync(tideDir) ? readdirSync(tideDir).filter((name) => name.endsWith('.wav')) : []
      if (tideFiles.length !== tideExpected) {
        problems.push(`public/assets/voice/pet/tide/ must contain ${tideExpected} WAV(s), got ${tideFiles.length}`)
      }
      if (process.env.INCLUDE_UNCLEARED_AUDIO !== undefined) {
        console.warn('[build] INCLUDE_UNCLEARED_AUDIO is obsolete and ignored: baked stella+tide audio ships by default (user authorized 2026-11-17)')
      }
      let totalBytes = 0
      const bytesByVoice = new Map<string, number>()
      const seen = new Set<string>()
      const seenFiles = new Set<string>()
      const expectedFiles = new Set<string>()
      const audioByText = new Map<string, Map<string, string>>()
      for (const [index, line] of lines.entries()) {
        const label = `lines[${index}] (${String(line.id ?? '?')})`
        for (const field of ['id', 'text', 'file', 'voice', 'provider', 'license'] as const) {
          if (typeof line[field] !== 'string' || line[field] === '') problems.push(`${label}: ${field} missing`)
        }
        if (line.ai !== true) problems.push(`${label}: ai must be true`)
        if (line.license !== BAKED_VOICE_LICENSE) problems.push(`${label}: license must be ${BAKED_VOICE_LICENSE}`)
        if (typeof line.voice !== 'string' || typeof line.file !== 'string') continue
        if (!BAKED_VOICE_LINE_COUNTS.has(line.voice)) {
          problems.push(`${label}: unexpected voice ${line.voice} (only stella+tide are baked)`)
          continue
        }
        if (line.voice === 'tide') {
          const rel = line.file.slice(TIDE_VOICE_DIR.length)
          if (!line.file.startsWith(TIDE_VOICE_DIR) || rel.length === 0 || rel.includes('/')) {
            problems.push(`${label}: tide file must be ${TIDE_VOICE_DIR}<name>.wav (got ${line.file})`)
          }
        } else if (line.file.includes('/')) {
          problems.push(`${label}: stella file must live at the pack root (got ${line.file})`)
        }
        const fileKey = line.file
        if (seenFiles.has(fileKey)) problems.push(`${label}: duplicate file path (${fileKey})`)
        seenFiles.add(fileKey)
        const source = resolveBakedFile(BAKED_VOICE_DIR, line.file)
        const dist = resolveBakedFile(BAKED_VOICE_DIST_DIR, line.file)
        if (!source) {
          problems.push(`${label}: file escapes the pack dir (${line.file})`)
          continue
        }
        if (!dist) {
          problems.push(`${label}: dist path escapes the pack dir (${line.file})`)
          continue
        }
        expectedFiles.add(line.file)
        if (!existsSync(source)) {
          problems.push(`${label}: public WAV missing (${line.file})`)
          continue
        }
        const audio = readFileSync(source)
        if (line.bytes !== audio.byteLength) problems.push(`${label}: bytes ${String(line.bytes)} != ${audio.byteLength}`)
        const digest = sha256(audio)
        if (line.sha256 !== digest) problems.push(`${label}: sha256 mismatch`)
        if (typeof line.durationMs !== 'number' || line.durationMs <= 0) problems.push(`${label}: durationMs missing/invalid`)
        if (!existsSync(dist)) {
          problems.push(`${label}: ${line.file} was not copied into dist/`)
          continue
        }
        const distAudio = readFileSync(dist)
        if (distAudio.byteLength !== audio.byteLength || sha256(distAudio) !== digest) {
          problems.push(`${label}: dist copy differs from public WAV (${line.file})`)
        }
        totalBytes += audio.byteLength
        bytesByVoice.set(line.voice, (bytesByVoice.get(line.voice) ?? 0) + audio.byteLength)
        const key = `${line.voice}|${line.text}`
        if (seen.has(key)) problems.push(`${label}: duplicate voice+text row`)
        seen.add(key)
        // Different voices must not share one WAV (no faked/cross-voice audio).
        const perText = audioByText.get(String(line.text)) ?? new Map<string, string>()
        perText.set(line.voice, digest)
        audioByText.set(String(line.text), perText)
      }
      for (const [text, perVoice] of audioByText) {
        if (perVoice.size > 1 && new Set(perVoice.values()).size !== perVoice.size) {
          problems.push(`voices share identical WAV bytes for text "${text}" (do not fake one voice with another)`)
        }
      }
      // The public pack itself must not carry unreferenced audio files.
      if (existsSync(BAKED_VOICE_DIR)) {
        for (const file of walkFiles(BAKED_VOICE_DIR)) {
          if (file === 'manifest.json' || expectedFiles.has(file)) continue
          problems.push(`unexpected file in public voice pack (not in manifest): ${file}`)
        }
      }
      // Exactly the manifest files (plus manifest.json) may land in dist.
      const actualDistFiles = walkFiles(BAKED_VOICE_DIST_DIR)
      for (const file of actualDistFiles) {
        if (file === 'manifest.json' || expectedFiles.has(file)) continue
        problems.push(`unexpected file in dist voice pack (not in manifest): ${file}`)
      }
      for (const file of expectedFiles) {
        if (!actualDistFiles.includes(file)) problems.push(`manifest WAV missing from dist/: ${file}`)
      }
      for (const [index, pending] of (Array.isArray(manifest.pendingLines) ? manifest.pendingLines : []).entries()) {
        if (pending === null || typeof pending !== 'object') {
          problems.push(`pendingLines[${index}] must be an object`)
          continue
        }
        const row = pending as Record<string, unknown>
        if (typeof row.id !== 'string' || typeof row.text !== 'string') problems.push(`pendingLines[${index}] needs id+text`)
        if (row.file !== undefined || row.sha256 !== undefined || row.bytes !== undefined) {
          problems.push(`pendingLines[${index}] must not claim a file/sha/bytes (no invented audio)`)
        }
      }
      if (problems.length > 0) {
        throw new Error(`[baked-voice] build guard failed:\n- ${problems.join('\n- ')}`)
      }
      const stats = [...BAKED_VOICE_LINE_COUNTS.keys()]
        .map((voice) => `${voice} ${BAKED_VOICE_LINE_COUNTS.get(voice)}/${bytesByVoice.get(voice) ?? 0} B`)
        .join(', ')
      console.warn(
        `[build] baked voice ok: ${lines.length} WAV(s) in dist/assets/voice/pet (${totalBytes} B; ${stats}; stella default)`,
      )
    },
  }
}

function walkFiles(dir: string, root = dir): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(abs, root))
    else if (entry.isFile()) files.push(relative(root, abs).split('\\').join('/'))
  }
  return files
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Product build profile (E10 / MB-106, E7-T2).
 *
 * The shipped companion app only needs the pet page plus the two pages that
 * carry the legal/consent flow: `setup.html` (TOS/TTS statement page) and
 * `chat-import.html` (consent-gated import; pet.html and the settings menu both
 * link to it). The old Pixi/game demo pages stay in the repo for local
 * development and QA, but they are no longer product entries:
 *   - `vite` (dev server) still serves every root HTML file for manual/dev use;
 *   - `npm run build:demo` explicitly builds the demo set;
 *   - `npm run build` (also Tauri's beforeBuildCommand) ships the release set.
 */
export const RELEASE_PAGE_INPUTS = {
  pet: 'pet.html',
  setup: 'setup.html',
  chatImport: 'chat-import.html',
} as const

export const DEMO_PAGE_INPUTS = {
  main: 'index.html',
  presence: 'presence.html',
  world: 'world.html',
  aquarium: 'aquarium.html',
  stall: 'stall.html',
  town: 'town.html',
} as const

/** Rollup inputs for a Vite mode: `demo` is the only mode that emits demo pages. */
export function resolvePageInputs(mode: string): Record<string, string> {
  const release: Record<string, string> = { ...RELEASE_PAGE_INPUTS }
  return mode === 'demo' ? { ...DEMO_PAGE_INPUTS, ...release } : release
}

/**
 * Release-profile guard (E10/MB-106): `npm run build` must emit exactly the
 * product pages and none of the demo/game pages. `npm run build:demo` opts into
 * the legacy set explicitly. This turns a silent "demo page sneaked back into
 * the release" regression into a build failure.
 */
function releasePageGuard(mode: string) {
  return {
    name: 'release-page-guard',
    apply: 'build' as const,
    closeBundle() {
      const dist = resolve(PROJECT_ROOT, 'dist')
      const distExists = existsSync(dist)
      const built = distExists
        ? readdirSync(dist, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
            .map((entry) => entry.name)
        : []
      const problems: string[] = []
      if (!distExists) problems.push('dist/ is missing after build')
      for (const page of Object.values(resolvePageInputs(mode))) {
        if (!built.includes(page)) problems.push(`${page} missing from dist/ (build profile ${mode})`)
      }
      if (mode !== 'demo') {
        for (const page of Object.values(DEMO_PAGE_INPUTS)) {
          if (built.includes(page)) problems.push(`${page} is a demo page but the release build emitted it`)
        }
      }
      if (problems.length > 0) throw new Error(`[release-profile] build guard failed:\n- ${problems.join('\n- ')}`)
      console.warn(`[build] page profile ok (${mode}): ${built.slice().sort().join(', ')}`)
    },
  }
}

/**
 * P0 (2026-11-17): the app used to link to `/docs/legal/*` + `/docs/research/*`,
 * which are not part of `dist/` or the Tauri resources, so every in-app legal
 * link 404'd in the installed build. The canonical docs are now rendered into
 * `public/legal/` (see `node scripts/legal-check.mjs --sync`); Vite copies
 * `public/` into `dist/`, and Tauri embeds `dist/` (plus bundles `legal/`).
 *
 * After the build this guard fails loudly instead of shipping a package with
 * missing/dead legal docs:
 *   - every `public/legal/` file exists under `dist/legal/`,
 *   - the package manifest marks at least one required document and every
 *     required document is present in `dist/legal/`,
 *   - `dist/legal/index.html` (the package index) exists,
 *   - built HTML has no `/docs/` link and no `/legal/...` link without a file.
 *
 * DRAFT/TBD release blocking stays in scripts/legal-check.mjs --strict; this is
 * a packaging guard, not a legal gate (it never inspects DRAFT markers).
 */
function legalPackageGuard() {
  return {
    name: 'legal-package-guard',
    apply: 'build' as const,
    closeBundle() {
      const publicLegal = resolve(PROJECT_ROOT, 'public/legal')
      const distLegal = resolve(PROJECT_ROOT, 'dist/legal')
      const problems: string[] = []
      if (!existsSync(publicLegal)) {
        throw new Error('[legal-package] public/legal/ is missing; run node scripts/legal-check.mjs --sync')
      }
      // 1) Vite must have copied every public/legal file into dist/legal.
      for (const file of walkFiles(publicLegal)) {
        if (!existsSync(join(distLegal, file))) problems.push(`dist/legal/${file} missing (public/legal/${file} not copied)`)
      }
      // 2) The generated manifest lists the required docs; none may be missing.
      const manifest = readJson(join(publicLegal, 'PACKAGE-MANIFEST.json'))
      const documents = Array.isArray(manifest?.documents) ? (manifest.documents as Array<Record<string, unknown>>) : []
      if (documents.length === 0) problems.push('public/legal/PACKAGE-MANIFEST.json missing or empty (run node scripts/legal-check.mjs --sync)')
      const required = documents.filter((doc) => doc.required === true).map((doc) => String(doc.dest ?? ''))
      if (required.length === 0) problems.push('PACKAGE-MANIFEST.json declares no required legal documents')
      for (const dest of required) {
        if (dest === '' || !existsSync(join(distLegal, dest))) problems.push(`required legal doc dist/legal/${dest} missing`)
      }
      if (!existsSync(join(distLegal, 'index.html'))) problems.push('dist/legal/index.html missing (public/legal/index.html)')
      // 3) Built HTML (app pages + the legal index) must not carry dead links.
      const htmlFiles = readdirSync(resolve(PROJECT_ROOT, 'dist'), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
        .map((entry) => resolve(PROJECT_ROOT, 'dist', entry.name))
      if (existsSync(join(distLegal, 'index.html'))) htmlFiles.push(join(distLegal, 'index.html'))
      for (const file of htmlFiles) {
        const label = relative(resolve(PROJECT_ROOT, 'dist'), file).split('\\').join('/')
        for (const match of readFileSync(file, 'utf8').matchAll(/(?:href|src|content)\s*=\s*"([^"]+)"/gi)) {
          const ref = (match[1] ?? '').trim()
          if (!ref.startsWith('/')) continue
          const pathname = ref.split(/[?#]/)[0] ?? ''
          if (pathname.startsWith('/docs/')) {
            problems.push(`${label}: ${ref} points into /docs/ (not in dist/ or Tauri resources)`)
            continue
          }
          if (!pathname.startsWith('/legal/')) continue
          let target = pathname.slice('/legal/'.length)
          try {
            target = decodeURIComponent(target)
          } catch {}
          if (target.includes('..') || !existsSync(join(distLegal, target))) {
            problems.push(`${label}: dead legal link ${ref} (dist/legal/${target} missing)`)
          }
        }
      }
      if (problems.length > 0) {
        throw new Error(`[legal-package] build guard failed:\n- ${problems.join('\n- ')}`)
      }
      console.warn(`[build] legal package ok: ${walkFiles(distLegal).length} file(s) in dist/legal, no dead /legal links`)
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [legalPackageGuard(), releasePageGuard(mode)],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    // Release builds must not ship source maps: the maps are embedded into the
    // Tauri binary and expose the full TypeScript source (+4.9 MB of installer
    // weight). For a local debug build run `npx vite build --sourcemap` instead
    // of editing this file.
    sourcemap: false,
    rollupOptions: {
      input: resolvePageInputs(mode),
    },
  },
}))
