#!/usr/bin/env node
/**
 * Release legal gate (DRAFT).
 *
 *   node scripts/legal-check.mjs            # warn only
 *   node scripts/legal-check.mjs --strict   # fail on release blockers
 *   node scripts/legal-check.mjs --sync     # regenerate public/legal/ copies, then check
 *
 * This is an engineering gate, not legal advice. It intentionally blocks a
 * public release while licences are DRAFT or contact placeholders remain.
 *
 * P0 (2026-11-17): the app linked to `/docs/legal/*` / `/docs/research/*`,
 * which are NOT `frontendDist` files nor Tauri resources, so every in-app
 * legal link 404'd in dist/ and in the installed build. The canonical docs are
 * now rendered into `public/legal/` (Vite copies `public/` -> `dist/`; Tauri
 * embeds `dist/` and also bundles `legal/`), the app HTML links point at
 * `/legal/...`, and this gate keeps the package + links honest:
 *
 *   - every required source doc and every `public/legal/` copy exists,
 *   - copies are regenerated from the canonical sources (stale = warning;
 *     stale is a release blocker under --strict),
 *   - shipped markdown copies contain no dead `/legal/...` cross-links and no
 *     `/docs/...` links (link targets are rewritten at render time),
 *   - built HTML (`*.html` at the repo root) has no `/docs/...` link and no
 *     `/legal/...` link without a real `public/legal/` target,
 *   - `app/tauri/src-tauri/tauri.conf.json` resources/licenseFile resolve,
 *   - an existing `artifacts/portable` staging dir ships the legal package.
 *
 * DRAFT/TBD markers are still only warnings in the default (warn-only) mode and
 * become blockers under --strict, so the release stays blocked until the legal
 * text is actually approved. This gate never removes or rewrites the DRAFT
 * markers themselves.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, posix, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Never use new URL(...).pathname here: on Windows it yields "/D:/..." (which
// path.resolve turns into "D:\\D:\\...") and it leaves percent-encoding in place
// for paths with spaces. That made the release legal gate fail on Windows with
// every required file reported as missing.
const root = fileURLToPath(new URL('..', import.meta.url))
const argv = process.argv.slice(2)
const strict = argv.includes('--strict')
const sync = argv.includes('--sync')

const LEGAL_DIR = join(root, 'public/legal')
const LEGAL_INDEX = 'index.html'
const MANIFEST_NAME = 'PACKAGE-MANIFEST.json'
const TAURI_CONF = join(root, 'app/tauri/src-tauri/tauri.conf.json')

/**
 * Canonical root legal documents that must be reachable both at their repo
 * source path AND at `public/legal/<dest>` (the path the app links to).
 *
 * `DLC-TERMS.md` / `TAKEDOWN.md` are stable package names for the longer
 * source files; cross-links inside the copied documents are rewritten to these
 * names at render time so the shipped package has no dead links.
 *
 * The exported list is the single source of truth for:
 *   - scripts/legal-check.mjs (this gate + `--sync`),
 *   - scripts/release-win.mjs (portable package `legal/` folder + BUILD-INFO),
 *   - tests/legal-package-*.test.ts (through the CLIs, not by importing TS).
 */
export const LEGAL_PACKAGE_REQUIRED = [
  { source: 'docs/legal/TOS.md', dest: 'TOS.md' },
  { source: 'docs/legal/PRIVACY.md', dest: 'PRIVACY.md' },
  { source: 'docs/legal/AI-LABELING.md', dest: 'AI-LABELING.md' },
  { source: 'docs/legal/USE-RESTRICTIONS-2026-11-19.md', dest: 'USE-RESTRICTIONS-2026-11-19.md' },
  { source: 'docs/legal/TTS-TERMS.md', dest: 'TTS-TERMS.md' },
  { source: 'docs/legal/DLC-AND-PLUGIN-TERMS.md', dest: 'DLC-TERMS.md' },
  { source: 'docs/legal/TAKEDOWN-AND-REPORTING.md', dest: 'TAKEDOWN.md' },
  { source: 'SECURITY.md', dest: 'SECURITY.md' },
  { source: 'DECLARATIONS.md', dest: 'DECLARATIONS.md' },
  { source: 'NOTICE', dest: 'NOTICE' },
  { source: 'LICENSE-ART', dest: 'LICENSE-ART' },
  { source: 'LICENSE', dest: 'LICENSE.txt' },
  { source: 'LICENSE-COMMERCIAL.md', dest: 'LICENSE-COMMERCIAL.md' },
  { source: 'CREDITS.md', dest: 'CREDITS.md' },
  { source: 'THIRD-PARTY.md', dest: 'THIRD-PARTY.md' },
  { source: 'AI-PROVENANCE.md', dest: 'AI-PROVENANCE.md' },
  { source: 'docs/legal/AI-CONTENT-POLICY.md', dest: 'AI-CONTENT-POLICY.md' },
  {
    source: 'docs/research/AI-COMPANION-REGULATION-2026-11-16.md',
    dest: 'AI-COMPANION-REGULATION-2026-11-16.md',
  },
]

/**
 * Repo paths that are not themselves shipped but whose links should resolve to
 * a packaged document (the root TAKEDOWN.md is a short contact page superseded
 * by the full docs/legal/TAKEDOWN-AND-REPORTING.md).
 */
const PACKAGE_LINK_ALIASES = {
  'TAKEDOWN.md': 'TAKEDOWN.md',
}

/**
 * The shipped package is the required set above plus every other policy file in
 * docs/legal/ (privacy/TOS docs link to each other; shipping the referenced
 * policies keeps the package self-contained instead of shipping dead links).
 * Extra documents keep their source basename.
 */
export function legalPackageEntries() {
  const entries = LEGAL_PACKAGE_REQUIRED.map((entry) => ({ ...entry, required: true }))
  const known = new Set(entries.map((entry) => entry.source))
  const dir = join(root, 'docs/legal')
  if (existsSync(dir)) {
    for (const name of readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
      const source = `docs/legal/${name}`
      if (known.has(source)) continue
      entries.push({ source, dest: name, required: false })
    }
  }
  return entries
}

/** Markdown inline links; label kept even when the target is not shipped. */
const MARKDOWN_LINK = /(!?)\[([^\]]*)\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g

function linkTargets(entries) {
  const targets = new Map()
  for (const entry of entries) targets.set(entry.source, entry.dest)
  for (const [source, dest] of Object.entries(PACKAGE_LINK_ALIASES)) targets.set(source, dest)
  return targets
}

/**
 * Render one canonical document for the shipped package:
 *   - package-internal links become absolute `/legal/<dest>` links so they work
 *     from `dist/legal/...` and from the Tauri `legal/` resource directory,
 *   - links to repo-only files keep their label but drop the dead path,
 *   - external/anchor links are left untouched.
 */
export function renderLegalCopy(entry, text, targets) {
  return text.replace(MARKDOWN_LINK, (match, image, label, href) => {
    if (/^(?:https?:|mailto:|#)/i.test(href)) return match
    if (href.startsWith('/')) return match
    const hashAt = href.indexOf('#')
    const target = hashAt === -1 ? href : href.slice(0, hashAt)
    const hash = hashAt === -1 ? '' : href.slice(hashAt)
    const resolved = posix.normalize(posix.join(posix.dirname(entry.source), target))
    const dest = targets.get(resolved)
    if (!dest) return image ? '' : label
    if (image) return label
    return `[${label}](/legal/${dest}${hash})`
  })
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

/** Build the expected package contents + manifest from the canonical sources. */
export function buildLegalPackage() {
  const entries = legalPackageEntries()
  const targets = linkTargets(entries)
  const documents = []
  const outputs = new Map()
  for (const entry of entries) {
    const sourcePath = join(root, entry.source)
    if (!existsSync(sourcePath)) continue // reported as a missing required file below
    const rendered = renderLegalCopy(entry, readFileSync(sourcePath, 'utf8'), targets)
    outputs.set(entry.dest, rendered)
    documents.push({
      source: entry.source,
      dest: entry.dest,
      required: entry.required,
      sha256: sha256(rendered),
    })
  }
  const manifest = {
    schema: 1,
    generatedBy: 'scripts/legal-check.mjs --sync',
    documents,
  }
  return { entries, documents, outputs, manifestText: `${JSON.stringify(manifest, null, 2)}\n` }
}

function syncLegalPackage(pkg, log) {
  mkdirSync(LEGAL_DIR, { recursive: true })
  for (const [dest, content] of pkg.outputs) writeFileSync(join(LEGAL_DIR, dest), content)
  writeFileSync(join(LEGAL_DIR, MANIFEST_NAME), pkg.manifestText)
  log(`[legal] synced ${pkg.outputs.size} document(s) into public/legal/`)
}

function checkPackageFiles(pkg, blockers, warnings) {
  for (const doc of pkg.documents) {
    const file = join(LEGAL_DIR, doc.dest)
    if (!existsSync(file)) {
      blockers.push(`missing public/legal/${doc.dest} (run: node scripts/legal-check.mjs --sync)`)
      continue
    }
    const actual = readFileSync(file, 'utf8')
    if (sha256(actual) !== doc.sha256) {
      warnings.push(
        `public/legal/${doc.dest} is stale vs ${doc.source} (run: node scripts/legal-check.mjs --sync)`,
      )
    }
  }
  const manifestPath = join(LEGAL_DIR, MANIFEST_NAME)
  if (!existsSync(manifestPath)) {
    blockers.push(`missing public/legal/${MANIFEST_NAME} (run: node scripts/legal-check.mjs --sync)`)
  } else if (readFileSync(manifestPath, 'utf8') !== pkg.manifestText) {
    warnings.push(
      `public/legal/${MANIFEST_NAME} is stale (run: node scripts/legal-check.mjs --sync)`,
    )
  }
  if (!existsSync(join(LEGAL_DIR, LEGAL_INDEX))) {
    blockers.push(`missing public/legal/${LEGAL_INDEX} (legal package index page)`)
  }
}

function checkPackageLinks(pkg, blockers) {
  // Cross-links inside the shipped package must resolve to shipped files.
  for (const [dest, content] of pkg.outputs) {
    const label = `public/legal/${dest}`
    for (const match of content.matchAll(/\]\((\/legal\/[^)\s]+)\)/g)) {
      const target = match[1].slice('/legal/'.length).split(/[?#]/)[0]
      if (!target || !pkg.outputs.has(target)) blockers.push(`${label}: dead cross-link ${match[1]}`)
    }
    // The renderer must have rewritten/dropped every relative link; a surviving
    // one would 404 inside the package (or fall back to the repo root in dev).
    for (const match of content.matchAll(/\]\((?!\/|#|https?:|mailto:)[^)]+\)/g)) {
      blockers.push(`${label}: unresolved relative link ${match[0]}`)
    }
    if (/\]\(\/docs\//.test(content)) blockers.push(`${label}: link into /docs/ is dead in the app build`)
  }
  if (existsSync(join(LEGAL_DIR, LEGAL_INDEX))) {
    checkHtmlRefs(join(LEGAL_DIR, LEGAL_INDEX), `public/legal/${LEGAL_INDEX}`, blockers)
  }
}

/** Scan built HTML for navigable absolute refs; `/legal/` must exist, `/docs/` must not. */
function checkHtmlRefs(file, label, blockers) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    blockers.push(`${label}: cannot read HTML`)
    return
  }
  for (const match of text.matchAll(/(?:href|src|content)\s*=\s*"([^"]+)"/gi)) {
    const ref = match[1].trim()
    if (!ref.startsWith('/')) continue
    const pathname = ref.split(/[?#]/)[0]
    if (pathname.startsWith('/docs/')) {
      blockers.push(`${label}: ${ref} points into /docs/ (not in dist/ or Tauri resources)`)
      continue
    }
    if (!pathname.startsWith('/legal/')) continue
    let target = pathname.slice('/legal/'.length)
    try {
      target = decodeURIComponent(target)
    } catch {}
    if (!target) continue
    if (target.includes('..') || !existsSync(join(LEGAL_DIR, target))) {
      blockers.push(`${label}: dead legal link ${ref} (public/legal/${target} missing)`)
    }
  }
}

/** Every built app page must link to the shipped `/legal/` package, not `/docs/`. */
function checkAppHtmlLinks(blockers) {
  for (const name of readdirSync(root).filter((entry) => entry.endsWith('.html')).sort()) {
    checkHtmlRefs(join(root, name), name, blockers)
  }
}

/** tauri.conf.json must actually resolve its resources + installer license file. */
function checkTauriConfig(blockers) {
  if (!existsSync(TAURI_CONF)) {
    blockers.push('missing required legal file: app/tauri/src-tauri/tauri.conf.json')
    return
  }
  let conf
  try {
    conf = JSON.parse(readFileSync(TAURI_CONF, 'utf8'))
  } catch (error) {
    blockers.push(`tauri.conf.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const bundle = conf && typeof conf === 'object' ? conf.bundle : undefined
  if (!bundle || typeof bundle !== 'object') {
    blockers.push('tauri.conf.json bundle section is missing')
    return
  }
  const resources = bundle.resources
  const sources = Array.isArray(resources)
    ? resources.filter((entry) => typeof entry === 'string')
    : resources && typeof resources === 'object'
      ? Object.keys(resources)
      : []
  if (sources.length === 0) blockers.push('tauri.conf.json bundle.resources is empty')
  const confDir = dirname(TAURI_CONF)
  for (const source of sources) {
    if (/[*?]/.test(source)) continue // glob entries are not stat()ed here
    const abs = resolve(confDir, source)
    if (!existsSync(abs)) {
      blockers.push(`tauri.conf.json bundle.resources source missing: ${source}`)
    }
  }
  if (!sources.some((source) => /public\/legal\/?$/.test(source))) {
    blockers.push('tauri.conf.json bundle.resources must bundle public/legal/ (installed legal docs)')
  }
  if (!sources.some((source) => /(?:^|\/)LICENSE$/.test(source))) {
    blockers.push('tauri.conf.json bundle.resources must include the root LICENSE')
  }
  if (typeof bundle.licenseFile !== 'string' || bundle.licenseFile.trim() === '') {
    blockers.push('tauri.conf.json bundle.licenseFile is not configured (NSIS license page)')
  } else {
    const abs = resolve(confDir, bundle.licenseFile)
    if (!existsSync(abs)) {
      blockers.push(`tauri.conf.json bundle.licenseFile does not exist: ${bundle.licenseFile}`)
    } else if (statSync(abs).size < 100) {
      blockers.push(`tauri.conf.json bundle.licenseFile looks empty: ${bundle.licenseFile}`)
    }
  }
}

function checkPortableStaging(warnings) {
  // A portable release staging dir is a useful pre-package check when present.
  const portable = join(root, 'artifacts/portable')
  if (!existsSync(portable)) return
  for (const file of [
    'LICENSE',
    'NOTICE',
    'LICENSE-ART',
    'CREDITS.md',
    'THIRD-PARTY.md',
    'AI-PROVENANCE.md',
    'DECLARATIONS.md',
  ]) {
    if (!existsSync(join(portable, file))) warnings.push(`portable staging missing ${file}`)
  }
  for (const entry of LEGAL_PACKAGE_REQUIRED) {
    if (!existsSync(join(portable, 'legal', entry.dest))) {
      warnings.push(`portable staging missing legal/${entry.dest}`)
    }
  }
  const entries = readdirSync(portable)
  if (entries.includes('DesktopGames.exe') && entries.length < 10) {
    warnings.push('portable staging looks too small; rebuild after licence changes')
  }
}

function main() {
  const blockers = []
  const warnings = []
  const pkg = buildLegalPackage()
  if (sync) syncLegalPackage(pkg, (line) => console.log(line))

  const required = [
    'LICENSE',
    'NOTICE',
    'LICENSE-ART',
    'CREDITS.md',
    'THIRD-PARTY.md',
    'AI-PROVENANCE.md',
    'DECLARATIONS.md',
    'docs/legal/README.md',
    'docs/legal/DECLARATION-MATRIX.md',
    'SECURITY.md',
    'TAKEDOWN.md',
    ...LEGAL_PACKAGE_REQUIRED.map((entry) => entry.source),
  ]
  for (const file of [...new Set(required)]) {
    if (!existsSync(join(root, file))) blockers.push(`missing required legal file: ${file}`)
  }

  // Baked DeepSeek voice pack: 42 user-authorized cached WAVs (21 stella at the
  // pack root + 21 tide under tide/, user authorization 2026-11-17); the
  // manifest is the source of truth. Never block on the mere presence of the
  // directory; verify every file/hash/size and the stella+tide-available preset
  // contract instead. A mismatch, missing file, unknown/extra voice or extra
  // file is a release blocker.
  const distVoice = join(root, 'dist/assets/voice/pet')
  const BAKED_VOICES = { stella: 21, tide: 21 }
  const BAKED_LINES = 42
  if (existsSync(distVoice)) {
    const manifestUrl = join(root, 'public/assets/voice/pet/manifest.json')
    try {
      if (!existsSync(manifestUrl)) throw new Error('source manifest missing')
      const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'))
      if (manifest.schemaVersion !== 2) throw new Error(`schemaVersion ${manifest.schemaVersion} != 2`)
      const presets = Array.isArray(manifest.voicePresets) ? manifest.voicePresets : []
      const lines = Array.isArray(manifest.lines) ? manifest.lines : []
      if (lines.length !== BAKED_LINES) throw new Error(`expected ${BAKED_LINES} baked lines, got ${lines.length}`)
      for (const preset of presets) {
        if (typeof preset.id !== 'string' || !Object.hasOwn(BAKED_VOICES, preset.id)) {
          throw new Error(`unexpected voice preset ${String(preset.id)}`)
        }
      }
      for (const [voice, expectedCount] of Object.entries(BAKED_VOICES)) {
        const preset = presets.find((p) => p.id === voice)
        if (!preset) throw new Error(`${voice} preset is missing`)
        if (preset.status !== 'available') throw new Error(`${voice} preset is not available`)
        if (preset.lineCount !== expectedCount) throw new Error(`${voice} lineCount ${String(preset.lineCount)} != ${expectedCount}`)
        const voiceLines = lines.filter((line) => line.voice === voice)
        if (voiceLines.length !== expectedCount) throw new Error(`expected ${expectedCount} ${voice} rows, got ${voiceLines.length}`)
      }
      const expectedFiles = new Set()
      for (const line of lines) {
        if (typeof line.voice !== 'string' || !Object.hasOwn(BAKED_VOICES, line.voice)) {
          throw new Error(`unexpected voice ${String(line.voice)}`)
        }
        if (
          typeof line.file !== 'string' ||
          line.file.length === 0 ||
          line.file.includes('..') ||
          line.file.includes('\\') ||
          line.file.startsWith('/')
        ) {
          throw new Error(`unsafe voice file ${String(line.file)}`)
        }
        if (line.voice === 'tide') {
          const rel = line.file.slice('tide/'.length)
          if (!line.file.startsWith('tide/') || rel === '' || rel.includes('/')) {
            throw new Error(`tide file must be tide/<name>.wav: ${line.file}`)
          }
        } else if (line.file.includes('/')) {
          throw new Error(`stella file must live at the pack root: ${line.file}`)
        }
        if (expectedFiles.has(line.file)) throw new Error(`duplicate voice file ${line.file}`)
        expectedFiles.add(line.file)
        const file = join(distVoice, line.file)
        if (!existsSync(file)) throw new Error(`missing baked voice ${line.file}`)
        const bytes = readFileSync(file)
        if (bytes.byteLength !== line.bytes) throw new Error(`bytes mismatch ${line.file}`)
        const sha = createHash('sha256').update(bytes).digest('hex')
        if (sha !== line.sha256) throw new Error(`sha mismatch ${line.file}`)
      }
      // Walk the whole dist pack: only manifest rows + manifest.json may ship.
      const actual = []
      const walk = (dir, prefix) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const rel = `${prefix}${entry.name}`
          if (entry.isDirectory()) walk(join(dir, entry.name), `${rel}/`)
          else actual.push(rel)
        }
      }
      walk(distVoice, '')
      for (const file of actual) {
        if (file === 'manifest.json' || expectedFiles.has(file)) continue
        throw new Error(`unexpected voice file ${file}`)
      }
      if (actual.length !== expectedFiles.size + 1) {
        throw new Error(`dist voice pack has ${actual.length} file(s), expected ${expectedFiles.size + 1}`)
      }
      const tideFiles = actual.filter((file) => file.startsWith('tide/'))
      if (tideFiles.length !== BAKED_VOICES.tide) throw new Error(`dist tide/ must contain ${BAKED_VOICES.tide} WAV(s), got ${tideFiles.length}`)
      const stellaFiles = actual.filter((file) => !file.includes('/') && file.endsWith('.wav'))
      if (stellaFiles.length !== BAKED_VOICES.stella) throw new Error(`dist pack root must contain ${BAKED_VOICES.stella} stella WAV(s), got ${stellaFiles.length}`)
      console.log(`[legal] baked voice pack ok: ${lines.length} WAV(s) (stella ${BAKED_VOICES.stella} + tide ${BAKED_VOICES.tide}; stella default)`)
    } catch (error) {
      blockers.push(`baked TTS pack invalid: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  checkPackageFiles(pkg, blockers, warnings)
  checkPackageLinks(pkg, blockers)
  checkAppHtmlLinks(blockers)
  checkTauriConfig(blockers)
  checkPortableStaging(warnings)

  const legalText = [
    'NOTICE',
    'LICENSE-ART',
    'CREDITS.md',
    'THIRD-PARTY.md',
    'AI-PROVENANCE.md',
    'docs/legal/README.md',
    'docs/legal/DECLARATION-MATRIX.md',
    'docs/legal/TOS.md',
    'docs/legal/PRIVACY.md',
    'docs/legal/TTS-TERMS.md',
    'docs/legal/AI-LABELING.md',
    'docs/legal/AI-CONTENT-POLICY.md',
    'docs/legal/DLC-AND-PLUGIN-TERMS.md',
    'docs/legal/TAKEDOWN-AND-REPORTING.md',
    'SECURITY.md',
    'TAKEDOWN.md',
    'DECLARATIONS.md',
  ].filter((file) => existsSync(join(root, file)))
  for (const file of legalText) {
    const text = readFileSync(join(root, file), 'utf8')
    if (/DRAFT/i.test(text)) warnings.push(`${file}: still marked DRAFT`)
    if (/<[A-Z0-9_-]+-TBD>|<TBD>/i.test(text)) {
      warnings.push(`${file}: contains unresolved TBD/contact placeholder`)
    }
  }

  const uniqueBlockers = [...new Set(blockers)]
  const uniqueWarnings = [...new Set(warnings)]
  const level = strict ? 'error' : 'warn'
  for (const item of uniqueWarnings) console.log(`[legal] ${level}: ${item}`)
  if (strict) uniqueBlockers.push(...uniqueWarnings.map((item) => `release blocker: ${item}`))
  for (const item of uniqueBlockers) console.log(`[legal] error: ${item}`)
  if (uniqueBlockers.length) {
    console.log(`\n[legal] BLOCKED (${uniqueBlockers.length} blocker(s), ${uniqueWarnings.length} warning(s))`)
    return 1
  }
  console.log(`\n[legal] ${strict ? 'PASS' : 'WARN-ONLY'} (${uniqueWarnings.length} warning(s))`)
  return 0
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (invokedDirectly) process.exitCode = main()
