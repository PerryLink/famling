#!/usr/bin/env node
/**
 * Release-signing primitives shared by:
 *   - scripts/release-sign.mjs   (plan / sign / verify / policy CLI)
 *   - scripts/release-win.mjs    (portable + checksums + release manifest)
 *   - scripts/repro-check.mjs    (reproducible-build input checks)
 *
 * Design rules (docs/RELEASE-SIGNING.md):
 *   - signing material NEVER lives in the repo and is NEVER printed here;
 *   - only presence / thumbprint / file basename are reported (thumbprints are public);
 *   - a report is only trusted after release-sign.mjs --verify validated the
 *     Authenticode chain, the timestamp and the artifact hashes.
 *
 * This module has no platform-specific imports so tests can exercise every
 * decision cross-platform; Windows-only execution lives in the CLI.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const PRODUCT = 'DesktopGames'
export const DEFAULT_TIMESTAMP_URL = 'http://timestamp.digicert.com'
export const DEFAULT_DESCRIPTION = 'Desktop Games (Famling) Windows release'
export const DEFAULT_INFO_URL = 'https://github.com/PerryLink/desktop-games'

/** Environment variable names shared by the CLI, CI and the runbook. */
export const SIGNING_ENV = Object.freeze({
  pfxPath: 'WINDOWS_SIGN_PFX_PATH',
  pfxBase64: 'WINDOWS_SIGN_PFX_BASE64',
  pfxPassword: 'WINDOWS_SIGN_PFX_PASSWORD',
  thumbprint: 'WINDOWS_SIGN_THUMBPRINT',
  expectedThumbprint: 'WINDOWS_SIGN_EXPECTED_THUMBPRINT',
  useCertStore: 'WINDOWS_SIGN_USE_CERT_STORE',
  timestampUrl: 'WINDOWS_SIGN_TIMESTAMP_URL',
  description: 'WINDOWS_SIGN_DESCRIPTION',
  infoUrl: 'WINDOWS_SIGN_INFO_URL',
  signtoolPath: 'SIGNTOOL_PATH',
  allowUnsigned: 'ALLOW_UNSIGNED_PREVIEW',
  sourceDateEpoch: 'SOURCE_DATE_EPOCH',
})

export const RELEASE_PATHS = Object.freeze({
  appExe: 'app/tauri/src-tauri/target/release/desktop-games-tauri.exe',
  nsisDir: 'app/tauri/src-tauri/target/release/bundle/nsis',
  msiDir: 'app/tauri/src-tauri/target/release/bundle/msi',
})

const HEX_SHA1 = /^[0-9A-F]{40}$/
const HEX_SHA256 = /^[0-9A-F]{64}$/
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export const isSemver = (value) => typeof value === 'string' && SEMVER.test(value)

export function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

export function envFlag(env, name) {
  const value = String(env?.[name] ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

/** True when child resolves to root itself or a path inside root. */
export function isPathInside(root, child) {
  if (!root || !child) return false
  const from = resolve(root)
  const to = resolve(child)
  const rel = relative(from, to)
  if (rel === '') return true
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

export function relativeTo(root, target) {
  return relative(resolve(root), resolve(target)).split(sep).join('/')
}

/** Normalize a certificate thumbprint to uppercase hex; returns '' when invalid. */
export function normalizeThumbprint(value) {
  if (typeof value !== 'string') return ''
  const hex = value.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (HEX_SHA1.test(hex) || HEX_SHA256.test(hex)) return hex
  return ''
}

function looksLikeBase64(value) {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed.length >= 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)
}

function issue(code, severity, message) {
  return { code, severity, message }
}

/**
 * Detect signing material from the environment.
 *
 * Returns only public metadata: mode, whether it is usable, a normalized
 * thumbprint, the PFX basename and issue codes. Secret values (PFX bytes,
 * password) are never copied into the result.
 */
export function detectSigningMaterial({ env = process.env, repoRoot = process.cwd() } = {}) {
  const pfxPathRaw = String(env[SIGNING_ENV.pfxPath] ?? '').trim()
  const pfxFile = pfxPathRaw ? resolve(pfxPathRaw) : ''
  const pfxBase64 = String(env[SIGNING_ENV.pfxBase64] ?? '').trim()
  const passwordPresent = Boolean(String(env[SIGNING_ENV.pfxPassword] ?? ''))
  const thumbprintRaw = String(env[SIGNING_ENV.thumbprint] ?? env[SIGNING_ENV.expectedThumbprint] ?? '')
  const thumbprint = normalizeThumbprint(thumbprintRaw)
  const storeRequested = envFlag(env, SIGNING_ENV.useCertStore) || (Boolean(thumbprint) && !pfxPathRaw && !pfxBase64)

  const issues = []
  let mode = 'none'

  if (pfxPathRaw || pfxBase64) {
    mode = 'pfx'
    if (!passwordPresent) {
      issues.push(issue('missing-pfx-password', 'error', SIGNING_ENV.pfxPassword + ' is not set (PFX needs its password)'))
    }
    if (pfxFile) {
      if (!existsSync(pfxFile)) {
        issues.push(issue('missing-pfx-file', 'error', 'the configured PFX file does not exist'))
      } else {
        try {
          if (!statSync(pfxFile).isFile()) {
            issues.push(issue('invalid-pfx-file', 'error', 'the configured PFX path is not a regular file'))
          }
        } catch {
          issues.push(issue('unreadable-pfx-file', 'error', 'the configured PFX file is not readable'))
        }
        if (repoRoot && isPathInside(repoRoot, pfxFile)) {
          issues.push(
            issue(
              'in-repo-signing-material',
              'error',
              'refusing to use a PFX inside the repository; keep signing keys outside the work tree and inject them per release (docs/RELEASE-SIGNING.md#key-custody)',
            ),
          )
        }
      }
    } else if (!looksLikeBase64(pfxBase64)) {
      issues.push(issue('invalid-pfx-base64', 'error', SIGNING_ENV.pfxBase64 + ' is set but does not look like base64 PFX material'))
    }
  } else if (storeRequested || thumbprint) {
    mode = 'store'
    if (!thumbprint) {
      issues.push(issue('missing-thumbprint', 'error', SIGNING_ENV.thumbprint + ' is required for certificate-store signing'))
    }
  } else {
    issues.push(issue('no-signing-material', 'info', 'no Authenticode signing material configured'))
  }

  if (thumbprintRaw && !thumbprint) {
    issues.push(issue('invalid-thumbprint', 'error', SIGNING_ENV.thumbprint + ' is not a SHA-1/SHA-256 hex thumbprint'))
  }
  if (mode !== 'none' && !thumbprint) {
    issues.push(issue('missing-pinned-thumbprint', 'warning', 'set WINDOWS_SIGN_THUMBPRINT so verification pins the expected signer'))
  }

  const errors = issues.filter((entry) => entry.severity === 'error')
  return {
    mode,
    available: mode !== 'none' && errors.length === 0,
    thumbprint,
    pinned: Boolean(thumbprint),
    pfxBasename: pfxFile ? basename(pfxFile) : pfxBase64 ? '<base64-secret>' : '',
    base64Configured: Boolean(pfxBase64),
    issues,
    errors: errors.length,
  }
}

/**
 * CI signing policy. trigger is one of: tag | dispatch | local | other.
 *
 * - signing material present  -> sign
 * - absent + explicit opt-in  -> unsigned preview (clearly labelled)
 * - absent + tag push         -> block (never publish an unsigned tag build)
 * - absent + release dispatch -> block (the operator must opt in)
 * - absent + local            -> unsigned preview (developer convenience)
 */
export function policyDecision({ signingAvailable, trigger = 'local', allowUnsigned = false } = {}) {
  const normalized = ['tag', 'dispatch', 'local', 'other'].includes(trigger) ? trigger : 'other'
  const reasons = []
  const warnings = []

  if (signingAvailable) {
    return {
      decision: 'signed',
      allowed: true,
      trigger: normalized,
      reasons: ['Authenticode signing material is configured'],
      warnings: [],
    }
  }

  if (normalized === 'tag') {
    reasons.push('tag builds must be signed: configure the signing secrets + thumbprint variable in the release-signing environment')
    if (allowUnsigned) {
      warnings.push('explicit unsigned override requested; artifacts are labelled unsigned preview and must not be published as a release')
      return { decision: 'unsigned-preview', allowed: true, trigger: normalized, reasons, warnings }
    }
    return { decision: 'block', allowed: false, trigger: normalized, reasons, warnings }
  }

  if (normalized === 'dispatch') {
    if (!allowUnsigned) {
      reasons.push('release dispatch without signing material: pass allow_unsigned_preview=true only for an internal unsigned preview')
      return { decision: 'block', allowed: false, trigger: normalized, reasons, warnings }
    }
    warnings.push('unsigned preview requested explicitly; no release may be published from these artifacts')
    return { decision: 'unsigned-preview', allowed: true, trigger: normalized, reasons, warnings }
  }

  warnings.push('local build without Authenticode signing material')
  return { decision: 'unsigned-preview', allowed: true, trigger: normalized, reasons, warnings }
}

/**
 * Locate signtool.exe. Explicit SIGNTOOL_PATH always wins (also used as a test
 * seam); otherwise search PATH and the Windows 10/11 SDK directories.
 */
export function findSigntool({ env = process.env, platform = process.platform, exists = existsSync, readdir = readdirSync } = {}) {
  const explicit = String(env[SIGNING_ENV.signtoolPath] ?? '').trim()
  if (explicit) {
    const path = resolve(explicit)
    return { path, source: 'env', exists: exists(path) }
  }
  if (platform !== 'win32') return null

  const pathEntries = String(env.PATH ?? env.Path ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
  for (const dir of pathEntries) {
    const candidate = join(dir, 'signtool.exe')
    if (exists(candidate)) return { path: candidate, source: 'path', exists: true }
  }

  const kitsRoots = [
    env['ProgramFiles(x86)'] ? join(env['ProgramFiles(x86)'], 'Windows Kits', '10', 'bin') : '',
    env.ProgramFiles ? join(env.ProgramFiles, 'Windows Kits', '10', 'bin') : '',
    'C:\\Program Files (x86)\\Windows Kits\\10\\bin',
  ].filter(Boolean)
  for (const root of kitsRoots) {
    if (!exists(root)) continue
    let versions = []
    try {
      versions = readdir(root)
        .filter((name) => /^\d+\.\d+\.\d+\.\d+$/.test(name))
        .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
        .reverse()
    } catch {
      continue
    }
    for (const version of versions) {
      for (const arch of ['x64', 'x86']) {
        const candidate = join(root, version, arch, 'signtool.exe')
        if (exists(candidate)) return { path: candidate, source: 'windows-sdk', exists: true }
      }
    }
  }
  return null
}

export function validateTimestampUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return { ok: false, reason: 'timestamp URL is empty' }
  let url
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'timestamp URL is not a valid absolute URL' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'timestamp URL must use http(s)' }
  }
  if (!url.hostname) return { ok: false, reason: 'timestamp URL has no hostname' }
  return { ok: true, url: url.toString(), insecure: url.protocol === 'http:' }
}

export function resolveTimestampUrl(env = process.env) {
  const configured = String(env[SIGNING_ENV.timestampUrl] ?? '').trim()
  const url = configured || DEFAULT_TIMESTAMP_URL
  const checked = validateTimestampUrl(url)
  if (!checked.ok) throw new Error('invalid timestamp URL: ' + checked.reason)
  return checked
}

export function expectedThumbprintFromEnv(env = process.env) {
  const raw = String(env[SIGNING_ENV.expectedThumbprint] ?? env[SIGNING_ENV.thumbprint] ?? '')
  return normalizeThumbprint(raw)
}

/**
 * Build the signtool arguments. The returned array contains the PFX password
 * when PFX signing is used, so callers must never log it directly: use
 * redactSigntoolArgs for any output.
 */
export function buildSignArgs({
  file,
  pfxFile = '',
  password = '',
  thumbprint = '',
  timestampUrl = DEFAULT_TIMESTAMP_URL,
  description = DEFAULT_DESCRIPTION,
  infoUrl = DEFAULT_INFO_URL,
  digest = 'SHA256',
  store = 'My',
} = {}) {
  if (!file) throw new Error('buildSignArgs: file is required')
  if (!pfxFile && !thumbprint) throw new Error('buildSignArgs: a PFX file or a certificate thumbprint is required')
  const timestamp = validateTimestampUrl(timestampUrl)
  if (!timestamp.ok) throw new Error('buildSignArgs: ' + timestamp.reason)

  const args = ['sign', '/fd', digest, '/td', 'SHA256', '/tr', timestamp.url]
  if (pfxFile) {
    args.push('/f', pfxFile)
    if (password) args.push('/p', password)
  } else {
    args.push('/sha1', thumbprint.toUpperCase(), '/s', store)
  }
  if (description) args.push('/d', description)
  if (infoUrl) args.push('/du', infoUrl)
  args.push(file)
  return args
}

/** Copy signtool args with the PFX password (and any accidental secret) redacted. */
export function redactSigntoolArgs(args, secrets = []) {
  const hidden = new Set([...(Array.isArray(secrets) ? secrets : [secrets])].filter(Boolean))
  const out = []
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (args[i - 1] === '/p') {
      out.push('***')
      continue
    }
    out.push(hidden.has(arg) ? '***' : arg)
  }
  return out
}

export function signtoolVerifyArgs(file) {
  return ['verify', '/pa', '/all', '/tw', '/v', file]
}

function versionedFiles(dir, version, extension) {
  if (!existsSync(dir)) return []
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  return names
    .filter((name) => name.toLowerCase().endsWith(extension) && name.includes(version))
    .sort((a, b) => a.localeCompare(b, 'en'))
    .map((name) => join(dir, name))
}

/**
 * Release artifacts that carry an Authenticode signature (PE files only).
 * The portable zip is covered by SHA256SUMS instead.
 */
export function releaseArtifacts({ repoRoot, version, exists = existsSync } = {}) {
  if (!repoRoot) throw new Error('releaseArtifacts: repoRoot is required')
  if (!isSemver(version)) throw new Error('releaseArtifacts: invalid version ' + JSON.stringify(version))
  const result = []
  const appExe = join(repoRoot, RELEASE_PATHS.appExe)
  result.push({ id: 'app-exe', kind: 'exe', label: 'application exe', path: appExe, required: true, exists: exists(appExe) })

  const installers = versionedFiles(join(repoRoot, RELEASE_PATHS.nsisDir), version, '.exe')
  installers.forEach((file, index) => {
    result.push({
      id: index === 0 ? 'installer' : 'installer-' + (index + 1),
      kind: 'installer',
      label: index === 0 ? 'NSIS installer' : 'NSIS installer #' + (index + 1),
      path: file,
      required: index === 0,
      exists: exists(file),
    })
  })
  if (installers.length === 0) {
    result.push({ id: 'installer', kind: 'installer', label: 'NSIS installer', path: '', required: true, exists: false })
  }

  const msis = versionedFiles(join(repoRoot, RELEASE_PATHS.msiDir), version, '.msi')
  msis.forEach((file, index) => {
    result.push({
      id: index === 0 ? 'msi' : 'msi-' + (index + 1),
      kind: 'msi',
      label: index === 0 ? 'MSI installer (optional)' : 'MSI installer #' + (index + 1) + ' (optional)',
      path: file,
      required: false,
      exists: exists(file),
    })
  })
  return result
}

function targetKinds(target) {
  switch (target) {
    case 'all':
      return ['exe', 'installer', 'msi']
    case 'app-exe':
    case 'exe':
      return ['exe']
    case 'installer':
    case 'nsis':
      return ['installer']
    case 'msi':
      return ['msi']
    default:
      throw new Error('unknown --target ' + JSON.stringify(target) + ' (expected all|app-exe|installer|msi)')
  }
}

/** Filter an artifact list by --target, keeping only files that exist (sign mode). */
export function selectArtifacts(artifacts, target = 'all', { existingOnly = true } = {}) {
  const kinds = targetKinds(target)
  return artifacts.filter((artifact) => kinds.includes(artifact.kind) && (!existingOnly || artifact.exists))
}

export function requiredArtifacts(artifacts, target = 'all') {
  const kinds = targetKinds(target)
  return artifacts.filter((artifact) => kinds.includes(artifact.kind) && artifact.required)
}

export function readJsonFile(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * Validate a signing report produced by release-sign.mjs --verify.
 * This is the contract release-win.mjs --signed relies on: no report -> no
 * "signed" claim in RELEASE-MANIFEST.json.
 */
export function validateSigningReport(
  report,
  {
    repoRoot,
    expectedThumbprint = '',
    requireTimestamp = true,
    checkHashes = true,
    requiredKinds = ['exe', 'installer'],
  } = {},
) {
  const reasons = []
  const warnings = []
  if (!report || typeof report !== 'object') return { ok: false, reasons: ['signing report is missing or not an object'], warnings }
  if (report.kind !== 'authenticode') reasons.push('report.kind must be "authenticode" (got ' + JSON.stringify(report.kind) + ')')
  if (report.unsigned !== false) reasons.push('report does not declare unsigned:false')
  if (!Array.isArray(report.files) || report.files.length === 0) reasons.push('report has no file entries')

  const files = Array.isArray(report.files) ? report.files : []
  const normalizedExpected = normalizeThumbprint(expectedThumbprint)
  const seenKinds = new Set()
  for (const entry of files) {
    if (!entry || typeof entry !== 'object') {
      reasons.push('report contains a non-object file entry')
      continue
    }
    const label = entry.path || entry.id || 'unknown'
    if (entry.kind) seenKinds.add(entry.kind)
    if (entry.status !== 'Valid') reasons.push(label + ': Authenticode status is "' + entry.status + '" (expected Valid)')
    if (Array.isArray(entry.errors) && entry.errors.length > 0) reasons.push(label + ': ' + entry.errors.join('; '))
    if (requireTimestamp && !entry.timestamped) reasons.push(label + ': signature is not RFC 3161 timestamped')
    if (normalizedExpected) {
      if (normalizeThumbprint(entry.signerThumbprint) !== normalizedExpected) {
        reasons.push(label + ': signer thumbprint does not match the pinned WINDOWS_SIGN_THUMBPRINT')
      }
    }
    if (checkHashes) {
      if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
        reasons.push(label + ': report has no valid sha256')
      } else if (typeof entry.path === 'string' && entry.path.length > 0) {
        const artifactPath = resolve(repoRoot, entry.path)
        if (!isPathInside(repoRoot, artifactPath)) {
          reasons.push(label + ': report path escapes the repository')
        } else if (!existsSync(artifactPath)) {
          reasons.push(label + ': artifact missing: ' + entry.path)
        } else if (sha256File(artifactPath) !== entry.sha256) {
          reasons.push(label + ': sha256 mismatch (artifact changed after it was signed)')
        }
      } else {
        reasons.push(label + ': report entry has no path')
      }
    }
  }
  for (const kind of requiredKinds) {
    if (!seenKinds.has(kind)) reasons.push('report is missing a required "' + kind + '" artifact entry')
  }
  return { ok: reasons.length === 0, reasons, warnings, files }
}

/** Hash-only guard used after bundling: detects a rebuilt/overwritten exe. */
export function checkReportHashes(report, { repoRoot } = {}) {
  const reasons = []
  const files = Array.isArray(report?.files) ? report.files : []
  if (files.length === 0) reasons.push('guard report has no file entries')
  for (const entry of files) {
    const label = entry?.path || entry?.id || 'unknown'
    if (!entry || typeof entry.path !== 'string') {
      reasons.push(label + ': guard entry has no path')
      continue
    }
    const artifactPath = resolve(repoRoot, entry.path)
    if (!isPathInside(repoRoot, artifactPath)) {
      reasons.push(label + ': guard path escapes the repository')
    } else if (!existsSync(artifactPath)) {
      reasons.push(label + ': artifact missing: ' + entry.path)
    } else if (sha256File(artifactPath) !== entry.sha256) {
      reasons.push(label + ': artifact changed after it was signed/bundled')
    }
  }
  return { ok: reasons.length === 0, reasons }
}

/** SOURCE_DATE_EPOCH parsing shared with release-win.mjs / repro-check.mjs. */
export function sourceDateEpoch(env = process.env) {
  const raw = String(env[SIGNING_ENV.sourceDateEpoch] ?? '').trim()
  if (!raw) return { value: null, iso: null, reproducible: false, error: null }
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    return { value: null, iso: null, reproducible: false, error: 'SOURCE_DATE_EPOCH must be a positive integer' }
  }
  return { value, iso: new Date(value * 1000).toISOString(), reproducible: true, error: null }
}

export function readPackageVersion(repoRoot) {
  const json = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
  if (!isSemver(json.version)) throw new Error('package.json version ' + JSON.stringify(json.version) + ' is not valid semver')
  return json.version
}

export function describeIssue(entry) {
  return entry.severity + ': ' + entry.message + ' [' + entry.code + ']'
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '?'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MiB'
}

export function safeStat(file) {
  try {
    return statSync(file)
  } catch {
    return null
  }
}

export const dirnameOf = dirname
