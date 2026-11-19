#!/usr/bin/env node
/**
 * Non-1 DPI + window-overflow verification for the four-level scaling model
 * (master-backlog D7 / E5 MB-050 + MB-054).
 *
 * Why this script exists
 * ----------------------
 * scripts/gui-cdp-smoke.mjs covers behaviour (menu / settings / content
 * window / role switch); the earlier artifacts/scale-ux-verify/cdp-verify.mjs
 * covered the 480x336 no-clip story but only captured the SETTINGS card at
 * non-1 device scale factors. MB-054's remaining gap was exactly: the role
 * surface, the right-click menu and the role & content center were never
 * captured/measured at DPR 1.25 / 1.5 / 2.
 *
 * This tool fills that gap with a repeatable real-browser matrix:
 *   - 480x336 CSS viewport at DPR 1 / 1.25 / 1.5 / 2 (CDP device-scale
 *     emulation of a real Chrome/Chromium install);
 *   - two scaling profiles per DPR: shipped 100% (folded-paper role) and the
 *     window-overflow stress profile 整体缩放 200% + 金毛 hero role;
 *   - captures the ROLE surface (folded pet + hero canvas), the right-click
 *     MENU and the role & CONTENT CENTER, and asserts they fit the window with
 *     no document overflow;
 *   - asserts the captured PNG is a real device-pixel raster
 *     (width = 480 * dpr, height = 336 * dpr), i.e. the DPI emulation actually
 *     rendered more physical pixels instead of upscaling a 1x screenshot;
 *   - asserts CSS-pixel layout is DPR-INVARIANT (same rects at every DPR,
 *     <= 1 CSS px delta). DPI is a raster-resolution property; it must not move
 *     layout. This is the executable form of the DPI policy in
 *     docs/plan/ADR-SCALE-DPI-2026-11-20.md;
 *   - records the known runtime-DPR-change gap (MB-046): devicePixelRatio is
 *     read once at boot, so changing display scaling while the window is open
 *     does not resize the hero backing store until a reload. It is recorded as
 *     evidence, NOT as a pass/fail of this matrix.
 *   - GATES the two 200% window-overflow defects discovered by this script on
 *     2026-11-20: MB-050-overflow-global200-hero-reload and
 *     MB-050-overflow-bubble-global200. Both were fixed by task-110 (src/pet
 *     late-layout re-fit + scaled bubble clamp); each probe now also records a
 *     gating check (known-gap-fixed:<id>) so a regression fails the run.
 *
 * Honesty boundary (also written into the report limitations)
 * -------------------------------------------------------------
 * This is Chromium CDP Emulation.setDeviceMetricsOverride with a real local
 * Chrome binary. It is NOT:
 *   - real Windows display scaling (100%/125%/150%/200% in Settings), and NOT
 *     Tauri/WebView2 (the app is served from the built dist/ over http);
 *   - a multi-monitor / mixed-DPI / hot-plug test (MB-046, MB-054 still open);
 *   - a GPU/compositor quality test (headless=new + --disable-gpu);
 *   - a contrast / axe / screen-reader test (MB-054 contrast is still open).
 * Never claim Tauri real-machine DPI acceptance from this report.
 *
 * Preconditions
 *   - npm run build produced a dist/ newer than src/ + public/ (the script
 *     refuses to run on a missing or stale bundle);
 *   - Node >= 22 (global fetch/WebSocket);
 *   - a local Chrome/Chromium (--chrome PATH or CHROME_PATH overrides);
 *   - WSL: WSL2 mirrored networking so Windows Chrome and this Node process
 *     share 127.0.0.1 (this repo's dev setup), otherwise run from Windows.
 *
 * Usage
 *   node scripts/scale-dpi-verify.mjs [options]
 *     --chrome PATH     Chrome/Chromium executable
 *     --out DIR         artifact dir (default artifacts/scale-dpi-verify/run-<stamp>)
 *     --dprs LIST       comma separated device scale factors (default 1,1.25,1.5,2)
 *     --headed          launch a headed browser (default headless=new)
 *     --keep-profile    keep the throwaway Chrome profile for debugging
 *     --timeout MS      per-condition timeout (default 30000)
 *     --verbose         print CDP/page diagnostics
 *     --help            show this help
 *
 * Exit codes: 0 = all checks pass, 1 = a check failed, 2 = setup/usage error.
 * Reports:    <out>/report.json (+ screenshots) and artifacts/scale-dpi-verify/latest.json
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TOOL = 'scripts/scale-dpi-verify.mjs'
export const KIND = 'browser-dpi-window-overflow-verify'
export const VIEWPORT = Object.freeze({ width: 480, height: 336 })
export const DEFAULT_DPRS = Object.freeze([1, 1.25, 1.5, 2])
export const NON_1_DPRS = Object.freeze([1.25, 1.5, 2])
/** CSS layout must be identical at every DPR; allow 1 CSS px of rounding noise. */
export const LAYOUT_DELTA_TOLERANCE_PX = 1
/** A panel edge may sit at most 1 CSS px outside the viewport (rounding). */
export const FIT_EPSILON_PX = 1
export const PROFILES = Object.freeze([
  Object.freeze({ id: 'default', label: '整体缩放 100%：折叠纸角色', global: 1, hero: false, surfaces: Object.freeze(['role-shell', 'menu', 'content-center']) }),
  Object.freeze({ id: 'hero', label: '整体缩放 100%：金毛 hero 角色（设备像素背板）', global: 1, hero: true, surfaces: Object.freeze(['role-hero']) }),
  Object.freeze({ id: 'max', label: '整体缩放 200%：窗口溢出压力（折叠纸角色）', global: 2, hero: false, surfaces: Object.freeze(['role-shell', 'menu', 'content-center']) }),
])
/** Overflow-policy probe: 200% + hero after a reload (fixed 2026-11-20; see docs/plan/ADR-SCALE-DPI-2026-11-20.md). */
export const HERO_MAX_PROFILE = Object.freeze({ id: 'hero-max', label: '整体缩放 200% + 金毛 hero（溢出策略门禁）', global: 2, hero: true, surfaces: Object.freeze(['role-hero']) })
export const SURFACES = Object.freeze(['role-shell', 'role-hero', 'menu', 'content-center'])
export const SURFACE_SELECTORS = Object.freeze({
  'role-shell': ['#pet', '#bubble'],
  'role-hero': ['#hero-stage', '#hero-canvas', '#bubble'],
  menu: ['#pet-shell-menu'],
  'content-center': ['#content-hub-root', '.content-hub-panel'],
})
export const MENU_SELECTOR = '#pet-shell-menu'
export const HUB_ROOT_SELECTOR = '#content-hub-root'
const HUB_PANEL_SELECTOR = '.content-hub-panel'
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = join(ROOT, 'dist')
const ARTIFACT_ROOT = join(ROOT, 'artifacts', 'scale-dpi-verify')
const PLATFORM = process.platform
const IS_WINDOWS = PLATFORM === 'win32'
const IS_WSL = !IS_WINDOWS && existsSync('/mnt/c/Windows/System32')
const NL = String.fromCharCode(10)
const BOOTSTRAP_PATH = '/__scale-dpi-bootstrap.html'
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}
const BOOTSTRAP_HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>scale dpi verify bootstrap</title></head><body><p id="bootstrap">scale dpi verify bootstrap</p></body></html>'

const options = {
  chrome: process.env.CHROME_PATH || '',
  out: '',
  dprs: DEFAULT_DPRS.slice(),
  headed: false,
  keepProfile: false,
  timeoutMs: 30000,
  verbose: false,
  help: false,
}

class SetupError extends Error {
  constructor(message) { super(message); this.name = 'SetupError'; this.exitCode = 2 }
}
class CheckError extends Error {
  constructor(message, evidence) { super(message); this.name = 'CheckError'; this.exitCode = 1; this.evidence = evidence === undefined ? null : evidence }
}

// ---------------------------------------------------------------------------
// Pure helpers (exported so tests/scale-dpi-contract.test.ts can lock the policy
// without launching a browser)
// ---------------------------------------------------------------------------

/** Parse/validate the --dprs list. Throws on a non-number or out-of-range value. */
export function parseDprList(text) {
  const parts = String(text === undefined || text === null ? '' : text).split(',')
  const values = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed === '') continue
    const value = Number(trimmed)
    if (!Number.isFinite(value) || value < 0.5 || value > 4) {
      throw new Error('invalid DPR value "' + trimmed + '" (expected a number in [0.5, 4])')
    }
    if (values.indexOf(value) === -1) values.push(value)
  }
  if (values.length === 0) throw new Error('the DPR list is empty')
  values.sort(function (a, b) { return a - b })
  return values
}

/** True when dpr is a non-1 device scale factor (the MB-054 matrix). */
export function isNon1Dpr(dpr) {
  return typeof dpr === 'number' && Number.isFinite(dpr) && Math.abs(dpr - 1) > 1e-9
}

/** Device-pixel raster a 480x336 CSS viewport must produce at a given DPR. */
export function expectedRasterSize(cssWidth, cssHeight, dpr) {
  return { width: Math.round(cssWidth * dpr), height: Math.round(cssHeight * dpr) }
}

/**
 * Fit violations for one CSS rect inside the 480x336 viewport (right/bottom
 * edges included). Returns [] when the rect fits. A 1 CSS px epsilon absorbs
 * sub-pixel rounding from zoom transforms.
 */
export function rectFitViolations(rect, viewport, epsilon) {
  const limit = typeof epsilon === 'number' ? epsilon : FIT_EPSILON_PX
  const out = []
  if (!rect) return ['missing']
  if (!(rect.w > 0) || !(rect.h > 0)) out.push('zero-size')
  if (rect.x < -limit) out.push('left')
  if (rect.y < -limit) out.push('top')
  if (rect.right > viewport.width + limit) out.push('right')
  if (rect.bottom > viewport.height + limit) out.push('bottom')
  return out
}

/** Parse a PNG width/height from the 24-byte IHDR header (no image dependency). */
export function parsePngSize(buffer) {
  if (!buffer || buffer.length < 24) throw new Error('PNG is shorter than the IHDR header')
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  for (let index = 0; index < signature.length; index += 1) {
    if (buffer[index] !== signature[index]) throw new Error('not a PNG file (bad signature)')
  }
  if (buffer.readUInt32BE(12) !== 0x49484452) throw new Error('PNG does not start with an IHDR chunk')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/** File-name token for a DPR: 1.25 -> dpr1_25. */
export function dprToken(dpr) {
  return 'dpr' + String(dpr).split('.').join('_')
}

/**
 * Compare CSS-pixel layout samples across DPRs. Samples are
 * { dpr, profile, surface, selector, rect }; a group is one
 * profile+surface+selector. Returns per-group max deltas plus violations when
 * the layout moved more than tolerance CSS px between DPRs.
 */
export function layoutInvariance(samples, tolerance) {
  const limit = typeof tolerance === 'number' ? tolerance : LAYOUT_DELTA_TOLERANCE_PX
  const groups = new Map()
  for (const sample of samples) {
    if (!sample || !sample.rect) continue
    const key = sample.profile + '|' + sample.surface + '|' + sample.selector
    const list = groups.get(key) || []
    list.push(sample)
    groups.set(key, list)
  }
  const reportGroups = []
  const violations = []
  for (const [key, list] of groups) {
    if (list.length < 2) continue
    const first = list[0]
    let maxDelta = 0
    for (const sample of list) {
      const fields = ['x', 'y', 'w', 'h']
      for (const field of fields) {
        const delta = Math.abs(Number(sample.rect[field]) - Number(first.rect[field]))
        if (delta > maxDelta) maxDelta = delta
      }
    }
    const entry = {
      key,
      profile: first.profile,
      surface: first.surface,
      selector: first.selector,
      dprs: list.map(function (sample) { return sample.dpr }).sort(function (a, b) { return a - b }),
      maxDelta: Math.round(maxDelta * 1000) / 1000,
      byDpr: list.map(function (sample) { return { dpr: sample.dpr, rect: sample.rect } }),
    }
    reportGroups.push(entry)
    if (maxDelta > limit) violations.push(entry)
  }
  return { ok: violations.length === 0, tolerance: limit, groups: reportGroups, violations: violations }
}

/**
 * Expected effective numbers for a global scale, mirroring resolveScaleSettings()
 * (scaling.ts) with the documented clamps. Used to prove the profile actually
 * applied (整体 200% clamps UI+文本 at 3.5x and components at 1.75x).
 */
export function expectedEffectiveScale(global) {
  const clamp = function (value, min, max) { return Math.min(max, Math.max(min, value)) }
  const safeGlobal = typeof global === 'number' && Number.isFinite(global) ? clamp(global, 0.5, 2) : 1
  const uiText = clamp(safeGlobal, 0.4, 1.75)
  return {
    global: safeGlobal,
    ui: clamp(2 * uiText, 0.8, 3.5),
    component: clamp(uiText, 0.5, 2),
    foldedPet: clamp(2 * safeGlobal, 0.5, 4),
    heroZoom: clamp(safeGlobal, 0.5, 2),
  }
}

/** Same trailing-zero trimming as scaling.ts formatNumber (2.000 -> 2). */
export function formatScaleNumber(value) {
  return String(Math.round(value * 1000) / 1000)
}

/** The CSS layout expectation for a DPR: viewport stays CSS px, raster multiplies. */
export function dprPolicyExpectation(dpr) {
  return {
    cssViewport: { width: VIEWPORT.width, height: VIEWPORT.height },
    devicePixelRatio: dpr,
    raster: expectedRasterSize(VIEWPORT.width, VIEWPORT.height, dpr),
    layoutInvariantAcrossDprs: true,
  }
}

// ---------------------------------------------------------------------------
// CLI + logging
// ---------------------------------------------------------------------------

function usage() {
  const lines = [
    'Non-1 DPI / window-overflow verification (480x336 @ DPR 1/1.25/1.5/2).',
    '',
    'Usage: node scripts/scale-dpi-verify.mjs [options]',
    '  --chrome PATH     Chrome/Chromium executable (default: auto-detect; CHROME_PATH works too)',
    '  --out DIR         artifact dir (default: artifacts/scale-dpi-verify/run-<stamp>)',
    '  --dprs LIST       comma separated device scale factors (default: 1,1.25,1.5,2)',
    '  --headed          launch a headed browser (default: headless=new)',
    '  --keep-profile    keep the throwaway Chrome profile for debugging',
    '  --timeout MS      per-condition timeout in ms (default 30000)',
    '  --verbose         print CDP/page diagnostics',
    '  --help            show this help',
    '',
    'Exit codes: 0 pass, 1 check failed, 2 setup/usage error.',
    'This is CDP device-scale emulation, NOT real Windows display scaling / Tauri WebView2.',
  ]
  for (const line of lines) console.log(line)
}

function parseArgs(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--headed') options.headed = true
    else if (arg === '--keep-profile') options.keepProfile = true
    else if (arg === '--verbose') options.verbose = true
    else if (arg === '--chrome') { index += 1; options.chrome = argv[index] || '' }
    else if (arg === '--out') { index += 1; options.out = argv[index] || '' }
    else if (arg === '--dprs') { index += 1; options.dprs = parseDprList(argv[index] || '') }
    else if (arg === '--timeout') { index += 1; options.timeoutMs = Number(argv[index] || '') }
    else throw new SetupError('unknown argument: ' + arg)
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000) throw new SetupError('--timeout must be a number >= 1000')
}

function log(message) { console.log('[scale-dpi] ' + message) }
function verbose(message) { if (options.verbose) console.log('[scale-dpi:debug] ' + message) }
function sleep(ms) { return new Promise(function (done) { setTimeout(done, ms) }) }

function stamp() {
  const now = new Date()
  const pad = function (value) { return value < 10 ? '0' + value : String(value) }
  return String(now.getFullYear()) + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds())
}

function relToRoot(file) { return relative(ROOT, file).split(String.fromCharCode(92)).join('/') }

function newestMtime(dir) {
  let newest = 0
  if (!existsSync(dir)) return newest
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(abs))
    else if (entry.isFile()) newest = Math.max(newest, statSync(abs).mtimeMs)
  }
  return newest
}

function sha256(file) { return createHash('sha256').update(readFileSync(file)).digest('hex') }

function gitFacts() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' })
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  return {
    head: head.status === 0 ? String(head.stdout).trim() : null,
    dirty: status.status === 0 ? String(status.stdout).trim().length > 0 : null,
    statusLines: status.status === 0 ? String(status.stdout).trim().split(NL).slice(0, 20) : [],
  }
}

function assertBuildPresent() {
  const petHtml = join(DIST, 'pet.html')
  if (!existsSync(petHtml)) {
    throw new SetupError('dist/pet.html is missing - run npm run build first (this tool serves the built app, not the dev server)')
  }
  const distMtime = statSync(petHtml).mtimeMs
  const newestSource = Math.max(newestMtime(join(ROOT, 'src')), newestMtime(join(ROOT, 'public')))
  if (newestSource > distMtime + 1000) {
    throw new SetupError('dist/ is older than src/ or public/ - run npm run build first so the DPI matrix cannot pass on a stale bundle')
  }
  return { petHtml: petHtml, distMtime: distMtime, newestSource: newestSource, petSha256: sha256(petHtml) }
}

function toWindowsPath(posixPath) {
  if (IS_WINDOWS) return posixPath
  if (!IS_WSL) return posixPath
  const result = spawnSync('wslpath', ['-w', posixPath], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout) throw new SetupError('wslpath -w failed for ' + posixPath)
  return String(result.stdout).trim().replace(new RegExp(NL + '$'), '')
}

function isWindowsExecutable(exe) {
  return IS_WINDOWS || exe.startsWith('/mnt/') || exe.endsWith('.exe') || exe.endsWith('.EXE')
}

function detectChrome() {
  if (options.chrome) {
    if (!existsSync(options.chrome)) throw new SetupError('--chrome path does not exist: ' + options.chrome)
    return options.chrome
  }
  const candidates = []
  if (IS_WINDOWS) {
    candidates.push('C:/Program Files/Google/Chrome/Application/chrome.exe')
    candidates.push('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe')
    candidates.push('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  } else if (IS_WSL) {
    candidates.push('/mnt/c/Program Files/Google/Chrome/Application/chrome.exe')
    candidates.push('/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe')
    candidates.push('/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  } else {
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
      const found = spawnSync('which', [name], { encoding: 'utf8' })
      if (found.status === 0 && found.stdout) candidates.unshift(String(found.stdout).trim())
    }
    candidates.push('/usr/bin/google-chrome')
    candidates.push('/usr/bin/chromium')
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  }
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  throw new SetupError('no local Chrome/Chromium found - pass --chrome PATH or set CHROME_PATH')
}

function startStaticServer() {
  const serverInstance = createServer(function (req, res) {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1')
      const pathname = decodeURIComponent(url.pathname)
      if (pathname === BOOTSTRAP_PATH) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(BOOTSTRAP_HTML)
        return
      }
      if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return }
      let target = pathname
      if (target.endsWith('/')) target += 'index.html'
      const abs = normalize(join(DIST, target))
      if (!abs.startsWith(DIST)) { res.writeHead(403); res.end('forbidden'); return }
      if (!existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404); res.end('not found'); return }
      res.writeHead(200, { 'content-type': MIME_TYPES[extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
      res.end(readFileSync(abs))
    } catch (error) {
      res.writeHead(500)
      res.end('server error')
    }
  })
  return new Promise(function (done, reject) {
    serverInstance.on('error', reject)
    serverInstance.listen(0, '127.0.0.1', function () {
      const address = serverInstance.address()
      done({ server: serverInstance, port: address.port, origin: 'http://127.0.0.1:' + address.port })
    })
  })
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(function () { controller.abort() }, timeoutMs || 2000)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null
    return await response.json()
  } catch (error) {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function waitEndpoint(port, timeoutMs) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const version = await fetchJson('http://127.0.0.1:' + port + '/json/version', 1500)
    if (version && version.webSocketDebuggerUrl) return version
    await sleep(250)
  }
  return null
}

async function listTargets(port) {
  const targets = await fetchJson('http://127.0.0.1:' + port + '/json/list', 3000)
  return Array.isArray(targets) ? targets : []
}

function powershellKillChrome(marker) {
  const pattern = String(marker)
  const ps = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "chrome.exe" -and $_.CommandLine -like "*' + pattern + '*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  return spawnSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 20000 })
}

function killSpawnedChrome(child, profileForChrome, windowsExe) {
  if (windowsExe) powershellKillChrome(profileForChrome)
  try { child.kill('SIGTERM') } catch (error) {}
}

function cleanupStaleChrome() {
  if (!IS_WINDOWS && !IS_WSL) return
  const marker = toWindowsPath(ARTIFACT_ROOT)
  if (!marker) return
  const result = powershellKillChrome(marker)
  if (result.error) verbose('stale chrome cleanup warning: ' + result.error.message)
}

async function launchChrome() {
  cleanupStaleChrome()
  const exe = detectChrome()
  const windowsExe = isWindowsExecutable(exe)
  const profileDir = join(runDir, 'profile')
  mkdirSync(profileDir, { recursive: true })
  const profileForChrome = windowsExe ? toWindowsPath(profileDir) : profileDir
  const args = []
  if (!options.headed) args.push('--headless=new')
  args.push(
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    '--user-data-dir=' + profileForChrome,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-popup-blocking',
    '--hide-scrollbars',
    '--window-size=' + VIEWPORT.width + ',' + VIEWPORT.height,
    server.origin + BOOTSTRAP_PATH,
  )
  verbose('launch ' + exe + ' profile=' + profileForChrome)
  const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderrTail = ''
  child.stderr.on('data', function (chunk) { stderrTail = (stderrTail + String(chunk)).slice(-6000) })
  const activePortFile = join(profileDir, 'DevToolsActivePort')
  let port = 0
  const portStarted = Date.now()
  while (Date.now() - portStarted < Math.max(options.timeoutMs, 20000)) {
    if (existsSync(activePortFile)) {
      const lines = readFileSync(activePortFile, 'utf8').split(NL)
      const parsed = Number(lines[0])
      if (parsed > 0) { port = parsed; break }
    }
    await sleep(150)
  }
  if (port === 0) {
    killSpawnedChrome(child, profileForChrome, windowsExe)
    throw new SetupError('Chrome did not write DevToolsActivePort in ' + profileDir + NL + stderrTail)
  }
  verbose('chrome devtools port ' + port)
  const version = await waitEndpoint(port, Math.max(options.timeoutMs, 20000))
  if (!version) {
    killSpawnedChrome(child, profileForChrome, windowsExe)
    const hint = IS_WSL ? ' (WSL: Windows Chrome and this Node process must share 127.0.0.1 - WSL2 mirrored networking; otherwise run from Windows)' : ''
    throw new SetupError('Chrome DevTools endpoint did not come up on 127.0.0.1:' + port + hint + NL + stderrTail)
  }
  return { exe: exe, windowsExe: windowsExe, port: port, child: child, profileDir: profileDir, profileForChrome: profileForChrome, version: version }
}

function connectCdp(wsUrl, label) {
  return new Promise(function (done, reject) {
    let socket
    try {
      socket = new WebSocket(wsUrl)
    } catch (error) {
      reject(new SetupError('cannot open CDP WebSocket for ' + label + ': ' + error.message))
      return
    }
    const pending = new Map()
    const handlers = new Set()
    let nextId = 0
    let opened = false
    socket.addEventListener('open', function () {
      opened = true
      const send = function (method, params) {
        return new Promise(function (resolveSend) {
          const id = (nextId += 1)
          pending.set(id, resolveSend)
          socket.send(JSON.stringify({ id: id, method: method, params: params || {} }))
        })
      }
      done({
        send: send,
        on: function (handler) { handlers.add(handler) },
        close: function () { try { socket.close() } catch (error) {} },
        wsUrl: wsUrl,
        label: label,
      })
    }, { once: true })
    socket.addEventListener('message', function (event) {
      let message
      try { message = JSON.parse(String(event.data)) } catch (error) { return }
      if (message.id !== undefined) {
        const resolveSend = pending.get(message.id)
        if (resolveSend) { pending.delete(message.id); resolveSend(message) }
        return
      }
      for (const handler of handlers) { try { handler(message) } catch (error) {} }
    })
    socket.addEventListener('error', function () { if (!opened) reject(new SetupError('CDP WebSocket error for ' + label)) }, { once: true })
    socket.addEventListener('close', function () { if (!opened) reject(new SetupError('CDP WebSocket closed before open for ' + label)) })
  })
}

async function attachTarget(target, label) {
  const client = await connectCdp(target.webSocketDebuggerUrl, label)
  cdpClients.add(client)
  await client.send('Runtime.enable')
  await client.send('Page.enable')
  await client.send('Log.enable')
  return client
}

async function evaluate(cdpClient, expression, settings) {
  const message = await cdpClient.send('Runtime.evaluate', {
    expression: expression,
    returnByValue: true,
    awaitPromise: !(settings && settings.awaitPromise === false),
    userGesture: true,
  })
  if (message.error) throw new CheckError('CDP Runtime.evaluate failed: ' + message.error.message)
  const result = message.result || {}
  if (result.exceptionDetails) {
    const details = result.exceptionDetails
    const description = details.exception && details.exception.description ? details.exception.description : details.text
    throw new CheckError('page exception: ' + String(description).split(NL)[0])
  }
  return result.result ? result.result.value : undefined
}

async function waitFor(cdpClient, expression, label, timeoutMs) {
  const limit = timeoutMs || options.timeoutMs
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < limit) {
    try {
      const value = await evaluate(cdpClient, expression)
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(200)
  }
  throw new CheckError('timeout waiting for ' + label + (lastError ? ' (last error: ' + lastError.message + ')' : ''))
}

async function waitTarget(port, predicate, label, timeoutMs) {
  const limit = timeoutMs || options.timeoutMs
  const started = Date.now()
  while (Date.now() - started < limit) {
    const target = (await listTargets(port)).find(predicate)
    if (target) return target
    await sleep(200)
  }
  throw new CheckError('timeout waiting for target: ' + label)
}

// ---------------------------------------------------------------------------
// Global runtime state (populated by main; declared here so helpers can use it)
// ---------------------------------------------------------------------------
let startedAt = 0
let runDir = ''
let server = null
let chrome = null
let pageCdp = null
let report = null
let seedScriptId = null
let navigationSeq = 0
const cdpClients = new Set()
const pageDiagnostics = []
const layoutSamples = []
const extraScreenshots = []

function buildReport() {
  return {
    schema: 1,
    tool: TOOL,
    kind: KIND,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: null,
    durationMs: null,
    ok: false,
    environment: {},
    repo: {},
    dist: {},
    chrome: {},
    viewport: { cssWidth: VIEWPORT.width, cssHeight: VIEWPORT.height },
    dprs: options.dprs.slice(),
    profiles: PROFILES.map(function (profile) { return { id: profile.id, label: profile.label, global: profile.global, hero: profile.hero, surfaces: profile.surfaces.slice() } }),
    knownGapProfile: { id: HERO_MAX_PROFILE.id, label: HERO_MAX_PROFILE.label, global: HERO_MAX_PROFILE.global, hero: HERO_MAX_PROFILE.hero },
    emulation: {
      kind: 'cdp-device-scale-factor (Emulation.setDeviceMetricsOverride)',
      realWindowsDisplayScaling: false,
      tauriWebView2: false,
      note: 'The device scale factor is emulated by Chrome DevTools Protocol. It is not a Windows Settings display-scaling change and not the Tauri WebView2 window.',
    },
    checks: [],
    failures: [],
    captures: [],
    layoutInvariance: null,
    runtimeDprChange: null,
    knownGaps: [],
    bootRetries: [],
    pageDiagnostics: [],
    screenshots: [],
    artifactDir: null,
    limitations: [
      'DPR is emulated with CDP Emulation.setDeviceMetricsOverride on a real local Chrome; it is NOT real Windows display scaling (100/125/150/200% in Settings) and NOT a Tauri/WebView2 window test.',
      'Multi-monitor / mixed-DPI / display hot-plug / per-monitor-v2 transitions are not exercised (MB-046/MB-054 still open); the known boot-time-only DPR read is recorded separately.',
      'headless=new + --disable-gpu: GPU compositing, frame pacing and visual sharpness/eye test are not measured; the raster-size and rect assertions are the evidence.',
      'Contrast, axe, screen-reader and font-legibility acceptance are NOT covered (MB-054 contrast still open).',
      'The app is served from the built dist/ over a throwaway local HTTP server; no Tauri host, tray, single-instance or Rust window code is launched.',
      'Never claim real-machine Tauri DPI acceptance from this report; see docs/plan/ADR-SCALE-DPI-2026-11-20.md for the evidence boundary.',
    ],
    error: null,
  }
}

function addCheck(id, ok, detail) {
  const entry = { id: id, ok: ok === true, detail: detail === undefined ? null : detail }
  report.checks.push(entry)
  if (!entry.ok) report.failures.push({ id: id, detail: entry.detail })
  log((entry.ok ? 'PASS ' : 'FAIL ') + id + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail).slice(0, 500)))
  return entry.ok
}

function writeReportFiles() {
  report.finishedAt = new Date().toISOString()
  report.durationMs = Date.now() - startedAt
  report.screenshots = report.captures.map(function (capture) { return capture.screenshot }).filter(Boolean).concat(extraScreenshots)
  report.pageDiagnostics = pageDiagnostics.slice(0, 40)
  const file = join(runDir, 'report.json')
  report.reportFile = relToRoot(file)
  writeFileSync(file, JSON.stringify(report, null, 2))
  try {
    mkdirSync(ARTIFACT_ROOT, { recursive: true })
    writeFileSync(join(ARTIFACT_ROOT, 'latest.json'), JSON.stringify(report, null, 2))
  } catch (error) {
    verbose('could not write latest.json: ' + (error && error.message ? error.message : String(error)))
  }
  return file
}

async function stopChrome() {
  for (const client of cdpClients) { try { client.close() } catch (error) {} }
  cdpClients.clear()
  pageCdp = null
  if (!chrome) return
  const state = chrome
  try {
    if (state.windowsExe) powershellKillChrome(state.profileForChrome)
    try { state.child.kill('SIGTERM') } catch (error) {}
    for (let attempt = 0; attempt < 20; attempt += 1) { if (state.child.exitCode !== null) break; await sleep(150) }
  } catch (error) {
    verbose('chrome shutdown warning: ' + (error && error.message ? error.message : String(error)))
  }
  if (!options.keepProfile) {
    let removed = false
    for (let attempt = 0; attempt < 8 && !removed; attempt += 1) {
      await sleep(300)
      try { rmSync(state.profileDir, { recursive: true, force: true }); removed = true } catch (error) {}
    }
    if (!removed) log('warning: could not remove throwaway Chrome profile (locked): ' + relToRoot(state.profileDir))
  }
  try { if (server) server.server.close() } catch (error) {}
  chrome = null
  server = null
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

function seedSource(profile) {
  const componentIds = ['bubble', 'menu', 'contentHub', 'settings', 'about']
  const source = [
    '(() => { try {',
    'const set = function (key, value) { try { localStorage.setItem(key, value) } catch (error) {} };',
    'const remove = function (key) { try { localStorage.removeItem(key) } catch (error) {} };',
    'set("desktop-games/pet/scale/model", "2");',
    'set("desktop-games/pet/scale/global", ' + JSON.stringify(String(profile.global)) + ');',
    'remove("desktop-games/pet/scale/ui-text");',
    'remove("desktop-games/pet/scale/image");',
    componentIds.map(function (id) { return 'remove("desktop-games/pet/scale/component/' + id + '");' }).join(' '),
    profile.hero
      ? 'set("desktop-games/pet/hero", "1"); set("desktop-games/pet/heroCharacter", "dog");'
      : 'remove("desktop-games/pet/hero"); remove("desktop-games/pet/heroCharacter");',
    'set("desktop-games/pet/coach/menu", "1");',
    '} catch (error) {} })()',
  ].join(NL)
  return source
}

async function waitFrames(cdpClient) {
  await evaluate(cdpClient, 'new Promise(function (resolve) { requestAnimationFrame(function () { requestAnimationFrame(function () { resolve(true) }) }) })')
}

async function acceptConsentIfPresent(cdpClient) {
  const present = await evaluate(cdpClient, 'document.querySelectorAll(".consent-root").length > 0')
  if (!present) return false
  verbose('consent overlay present; accepting the first-run TOS (the same checkbox + accept path as a user)')
  await evaluate(cdpClient, '(() => { const checkbox = document.querySelector(".consent-tos-modal input[type=checkbox]"); if (checkbox && !checkbox.checked) checkbox.click(); const accept = document.querySelector(".consent-tos-modal .consent-accept"); if (accept && accept.disabled === false) { accept.click(); return true } return false })()')
  await waitFor(cdpClient, 'document.querySelectorAll(".consent-root").length === 0', 'consent overlay closed', 20000)
  await waitFor(cdpClient, '!!window.__pet', 'pet runtime after consent', 30000)
  return true
}

async function dismissFirstRunChrome(cdpClient) {
  await evaluate(cdpClient, '(() => { const coach = [...document.querySelectorAll("#pet-menu-coach button")].find(function (el) { return el.textContent.indexOf("知道了") !== -1 }); if (coach) coach.click(); const setup = document.getElementById("setup-dismiss"); if (setup && !setup.hidden) setup.click(); return true })()')
  await sleep(150)
}

async function loadProfileAttempt(cdpClient, profile) {
  if (seedScriptId !== null) {
    await cdpClient.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedScriptId })
    seedScriptId = null
  }
  const added = await cdpClient.send('Page.addScriptToEvaluateOnNewDocument', { source: seedSource(profile) })
  seedScriptId = added && added.result ? added.result.identifier : null
  navigationSeq += 1
  const petUrl = server.origin + '/pet.html?browser-fallback&scaleDpiRun=' + navigationSeq
  await sleep(200)
  await cdpClient.send('Page.navigate', { url: petUrl })
  await waitFor(cdpClient, 'document.readyState === "complete"', 'document complete', 30000)
  await waitFor(cdpClient, '!!window.__pet', 'pet runtime booted', 30000)
  await acceptConsentIfPresent(cdpClient)
  await sleep(250)
  await dismissFirstRunChrome(cdpClient)
  if (profile.hero) {
    await waitFor(cdpClient, '(() => { const pet = window.__pet; if (!pet || !pet.hero) return false; return pet.hero.enabled === true && pet.hero.ok === true; })()', 'hero renderer enabled', 30000)
    await waitFor(cdpClient, '(() => { const canvas = document.getElementById("hero-canvas"); return !!canvas && canvas.width > 0 && canvas.height > 0; })()', 'hero canvas sized', 15000)
    await waitFrames(cdpClient)
    await sleep(300)
  } else {
    await waitFor(cdpClient, '(() => { const pet = document.getElementById("pet"); return !!pet && getComputedStyle(pet).display !== "none"; })()', 'folded-paper pet visible', 15000)
    await waitFrames(cdpClient)
    await sleep(200)
  }
}

/**
 * Load one scale profile. A single transient navigation/boot failure is retried
 * once and recorded in report.bootRetries; a deterministic failure still fails
 * the run on the second attempt (this never hides a broken build).
 */
async function loadProfile(cdpClient, profile) {
  let lastError = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await loadProfileAttempt(cdpClient, profile)
      if (attempt > 1) {
        report.bootRetries.push({ profile: profile.id, attempt: attempt, note: 'navigation/boot retried once after a transient failure' })
        log('navigation retry succeeded for profile ' + profile.id)
      }
      return
    } catch (error) {
      lastError = error
      if (attempt >= 2) break
      log('navigation attempt ' + attempt + ' failed for profile ' + profile.id + ': ' + (error && error.message ? error.message : String(error)) + ' - retrying once')
      await sleep(600)
    }
  }
  throw lastError
}

function buildMeasureExpression(selectors) {
  return '(() => {' +
    'const rectOf = function (selector) { const el = document.querySelector(selector); if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { x: +r.x.toFixed(3), y: +r.y.toFixed(3), w: +r.width.toFixed(3), h: +r.height.toFixed(3), right: +r.right.toFixed(3), bottom: +r.bottom.toFixed(3), display: s.display, visibility: s.visibility, opacity: +s.opacity, fontSize: s.fontSize, transform: s.transform }; };' +
    'const varOf = function (name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); };' +
    'const canvas = document.getElementById("hero-canvas");' +
    'let painted = 0; if (canvas && canvas.width > 0 && canvas.height > 0) { const context = canvas.getContext("2d"); if (context) { const data = context.getImageData(0, 0, canvas.width, canvas.height).data; for (let index = 3; index < data.length; index += 4) { if (data[index] !== 0) painted += 1; } } }' +
    'const menu = document.getElementById("pet-shell-menu");' +
    'const hub = document.getElementById("content-hub-root");' +
    'return {' +
      'readyState: document.readyState,' +
      'viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },' +
      'document: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },' +
      'vars: { global: varOf("--global-scale"), ui: varOf("--ui-scale"), pet: varOf("--pet-scale"), hero: varOf("--hero-zoom"), menu: varOf("--menu-zoom"), hub: varOf("--hub-zoom"), bubble: varOf("--bubble-zoom") },' +
      'storage: { scaleGlobal: localStorage.getItem("desktop-games/pet/scale/global"), hero: localStorage.getItem("desktop-games/pet/hero"), character: localStorage.getItem("desktop-games/pet/heroCharacter") },' +
      'rects: Object.fromEntries(' + JSON.stringify(selectors) + '.map(function (selector) { return [selector, rectOf(selector)]; })),' +
      'hero: canvas ? { width: canvas.width, height: canvas.height, styleWidth: canvas.style.width, styleHeight: canvas.style.height, painted: painted } : null,' +
      'menu: menu ? { state: menu.dataset.state || null, items: menu.querySelectorAll("[role=menuitem]").length } : null,' +
      'hub: hub ? { state: hub.dataset.state || null, hidden: hub.hidden === true, cards: hub.querySelectorAll(".content-hub-role-card").length, panel: hub.querySelector(".content-hub-panel") !== null } : null,' +
      'activeElement: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null' +
    '};' +
  '})()'
}

async function measure(cdpClient, selectors) {
  return evaluate(cdpClient, buildMeasureExpression(selectors))
}

async function screenshot(cdpClient, fileBase, dpr) {
  const message = await cdpClient.send('Page.captureScreenshot', { format: 'png' })
  if (message.error || !message.result || !message.result.data) throw new CheckError('Page.captureScreenshot failed: ' + JSON.stringify(message.error || null))
  const bytes = Buffer.from(message.result.data, 'base64')
  const file = join(runDir, fileBase + '.png')
  writeFileSync(file, bytes)
  const raster = parsePngSize(bytes)
  const expected = expectedRasterSize(VIEWPORT.width, VIEWPORT.height, dpr)
  return { file: relToRoot(file), raster: raster, expected: expected }
}

async function characterPoint(cdpClient) {
  return evaluate(cdpClient, '(() => { const ids = ["hero-stage", "pet"]; for (const id of ids) { const el = document.getElementById(id); if (!el) continue; const style = getComputedStyle(el); if (style.display === "none" || style.visibility === "hidden") continue; const rect = el.getBoundingClientRect(); if (rect.width > 0 && rect.height > 0) return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, element: id }; } return { x: innerWidth / 2, y: innerHeight / 2, element: "window" }; })()')
}

async function openMenu(cdpClient) {
  const point = await characterPoint(cdpClient)
  await cdpClient.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'right', buttons: 2, clickCount: 1 })
  await cdpClient.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'right', buttons: 0, clickCount: 1 })
  await waitFor(cdpClient, 'document.getElementById("pet-shell-menu") && document.getElementById("pet-shell-menu").dataset.state === "open"', 'right-click menu open', 10000)
  await waitFrames(cdpClient)
  await sleep(200)
  return point
}

async function pressEscape(cdpClient) {
  await cdpClient.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
  await cdpClient.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 })
}

async function closeMenu(cdpClient) {
  await pressEscape(cdpClient)
  await waitFor(cdpClient, '(() => { const menu = document.getElementById("pet-shell-menu"); return !menu || menu.dataset.state !== "open"; })()', 'menu closed', 5000)
}

async function openContentHub(cdpClient) {
  const opened = await evaluate(cdpClient, '(() => { const pet = window.__pet; if (!pet || !pet.content || typeof pet.content.open !== "function") return false; pet.content.open(); return true })()')
  if (!opened) throw new CheckError('window.__pet.content.open is unavailable')
  await waitFor(cdpClient, '(() => { const root = document.getElementById("content-hub-root"); return !!root && root.hidden === false && root.dataset.state === "open"; })()', 'content hub open', 25000)
  await waitFor(cdpClient, 'document.querySelectorAll(".content-hub-role-card").length >= 1', 'content hub role cards rendered', 25000)
  await waitFrames(cdpClient)
  await sleep(350)
}

async function closeContentHub(cdpClient) {
  await evaluate(cdpClient, '(() => { const button = document.querySelector(".content-hub-close"); if (!button) return false; button.click(); return true })()')
  await waitFor(cdpClient, '(() => { const root = document.getElementById("content-hub-root"); return !!root && (root.hidden === true || root.dataset.state === "closed"); })()', 'content hub closed', 8000)
}

function numberFromPx(value) {
  const parsed = Number(String(value).replace('px', ''))
  return Number.isFinite(parsed) ? parsed : NaN
}

// ---------------------------------------------------------------------------
// Surface capture + checks
// ---------------------------------------------------------------------------

function captureBase(dpr, profileId, surface) {
  return dprToken(dpr) + '-' + profileId + '-' + surface
}

async function captureSurface(cdpClient, dpr, profileId, surface) {
  const profile = PROFILES.find(function (candidate) { return candidate.id === profileId })
  if (!profile) throw new CheckError('unknown scale profile: ' + profileId)
  const selectors = SURFACE_SELECTORS[surface]
  if (!selectors) throw new CheckError('unknown surface: ' + surface)
  const base = captureBase(dpr, profileId, surface)
  let interaction = null
  if (surface === 'menu') interaction = await openMenu(cdpClient)
  if (surface === 'content-center') {
    await openContentHub(cdpClient)
    interaction = { openedBy: 'window.__pet.content.open() (same gate-checked path as the menu)' }
  }
  await waitFrames(cdpClient)
  await sleep(150)
  const layout = await measure(cdpClient, selectors)
  const surfaceChecks = []

  const viewportOk = Math.abs(layout.viewport.width - VIEWPORT.width) <= 1 && Math.abs(layout.viewport.height - VIEWPORT.height) <= 1
  surfaceChecks.push(addCheck('viewport:' + base, viewportOk, layout.viewport))
  surfaceChecks.push(addCheck('devicePixelRatio:' + base, Math.abs(layout.viewport.dpr - dpr) < 1e-6, { requested: dpr, reported: layout.viewport.dpr }))
  surfaceChecks.push(addCheck('doc-overflow:' + base, layout.document.scrollWidth <= VIEWPORT.width + 1 && layout.document.scrollHeight <= VIEWPORT.height + 1, layout.document))
  const expectedScale = expectedEffectiveScale(profile.global)
  const expectedVars = { global: formatScaleNumber(expectedScale.global), ui: formatScaleNumber(expectedScale.ui), component: formatScaleNumber(expectedScale.component) }
  surfaceChecks.push(addCheck('profile-vars:' + base, layout.vars.global === expectedVars.global && layout.vars.ui === expectedVars.ui && layout.vars.menu === expectedVars.component && layout.vars.hub === expectedVars.component, { vars: layout.vars, expected: expectedVars }))
  const expectedHeroStorage = profile.hero ? '1' : null
  const expectedCharacterStorage = profile.hero ? 'dog' : null
  surfaceChecks.push(addCheck('profile-storage:' + base, layout.storage.scaleGlobal === String(profile.global) && layout.storage.hero === expectedHeroStorage && layout.storage.character === expectedCharacterStorage, layout.storage))

  for (const selector of selectors) {
    const rect = layout.rects[selector]
    if (!rect) {
      surfaceChecks.push(addCheck('fit:' + base + ':' + selector, false, { violations: ['missing'], rect: null }))
      continue
    }
    const hiddenBubble = selector === '#bubble' && (rect.display === 'none' || rect.visibility === 'hidden' || rect.opacity <= 0.05)
    if (hiddenBubble) {
      surfaceChecks.push(addCheck('fit:' + base + ':' + selector, true, { skipped: 'bubble hidden at this profile', rect: rect }))
      continue
    }
    const violations = rectFitViolations(rect, VIEWPORT)
    surfaceChecks.push(addCheck('fit:' + base + ':' + selector, violations.length === 0, { violations: violations, rect: rect }))
    if (rect.w > 0 && rect.h > 0) {
      layoutSamples.push({ dpr: dpr, profile: profileId, surface: surface, selector: selector, rect: rect })
    }
  }

  if (surface === 'menu') {
    surfaceChecks.push(addCheck('menu-open:' + base, layout.menu !== null && layout.menu.state === 'open', layout.menu))
    surfaceChecks.push(addCheck('menu-items:' + base, layout.menu !== null && layout.menu.items >= 1, layout.menu))
  }
  if (surface === 'content-center') {
    surfaceChecks.push(addCheck('hub-open:' + base, layout.hub !== null && layout.hub.state === 'open' && layout.hub.hidden === false, layout.hub))
    surfaceChecks.push(addCheck('hub-role-cards:' + base, layout.hub !== null && layout.hub.cards >= 1, layout.hub))
  }
  if (surface === 'role-hero') {
    const hero = layout.hero
    const stage = layout.rects['#hero-stage']
    surfaceChecks.push(addCheck('hero-visible:' + base, stage !== null && stage.display !== 'none' && stage.visibility !== 'hidden', stage))
    let backingOk = false
    let backingDetail = { hero: hero, requestedDpr: dpr }
    if (hero) {
      const styleWidth = numberFromPx(hero.styleWidth)
      const styleHeight = numberFromPx(hero.styleHeight)
      const expectedWidth = Math.round(styleWidth * dpr)
      const expectedHeight = Math.round(styleHeight * dpr)
      backingOk = Number.isFinite(expectedWidth) && Number.isFinite(expectedHeight) && hero.width === expectedWidth && hero.height === expectedHeight
      backingDetail = { requestedDpr: dpr, canvasPixels: { width: hero.width, height: hero.height }, cssStyle: { width: hero.styleWidth, height: hero.styleHeight }, expectedCanvasPixels: { width: expectedWidth, height: expectedHeight } }
    }
    surfaceChecks.push(addCheck('hero-device-pixel-backing:' + base, backingOk, backingDetail))
    surfaceChecks.push(addCheck('hero-painted:' + base, hero !== null && hero.painted >= 500, { painted: hero ? hero.painted : null }))
  }

  const shot = await screenshot(cdpClient, base, dpr)
  surfaceChecks.push(addCheck('raster:' + base, shot.raster.width === shot.expected.width && shot.raster.height === shot.expected.height, { raster: shot.raster, expected: shot.expected }))

  const capture = {
    dpr: dpr,
    profile: profileId,
    surface: surface,
    screenshot: shot.file,
    raster: shot.raster,
    expectedRaster: shot.expected,
    viewport: layout.viewport,
    document: layout.document,
    vars: layout.vars,
    storage: layout.storage,
    rects: layout.rects,
    menu: layout.menu,
    hub: layout.hub,
    hero: layout.hero,
    interaction: interaction,
    checks: surfaceChecks.length,
  }
  report.captures.push(capture)

  if (surface === 'menu') await closeMenu(cdpClient)
  if (surface === 'content-center') await closeContentHub(cdpClient)
  return capture
}

async function runSurface(cdpClient, dpr, profileId, surface) {
  try {
    return await captureSurface(cdpClient, dpr, profileId, surface)
  } catch (error) {
    const message = error && error.message ? error.message : String(error)
    addCheck('surface-error:' + captureBase(dpr, profileId, surface), false, { error: message })
    log('surface failed: ' + captureBase(dpr, profileId, surface) + ': ' + message)
    try { await closeMenu(cdpClient) } catch (recoverError) {}
    try { await closeContentHub(cdpClient) } catch (recoverError) {}
    return null
  }
}

// ---------------------------------------------------------------------------
// Known-gap probe: runtime devicePixelRatio change without reload (MB-046)
// ---------------------------------------------------------------------------

async function probeRuntimeDprChange(cdpClient) {
  await cdpClient.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false })
  await loadProfile(cdpClient, PROFILES[1])
  const before = await measure(cdpClient, ['#hero-canvas'])
  await cdpClient.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1.5, mobile: false })
  await sleep(500)
  await waitFrames(cdpClient)
  const after = await measure(cdpClient, ['#hero-canvas'])
  const styleWidth = before.hero ? numberFromPx(before.hero.styleWidth) : NaN
  const styleHeight = before.hero ? numberFromPx(before.hero.styleHeight) : NaN
  const expectedIfRecomputed = { width: Math.round(styleWidth * 1.5), height: Math.round(styleHeight * 1.5) }
  const recomputed = before.hero !== null && after.hero !== null && (before.hero.width !== after.hero.width || before.hero.height !== after.hero.height)
  return {
    method: 'Emulation.setDeviceMetricsOverride 1 -> 1.5 WITHOUT a reload',
    fromDpr: 1,
    toDpr: 1.5,
    devicePixelRatioBefore: before.viewport.dpr,
    devicePixelRatioAfter: after.viewport.dpr,
    canvasBefore: before.hero ? { width: before.hero.width, height: before.hero.height, styleWidth: before.hero.styleWidth, styleHeight: before.hero.styleHeight } : null,
    canvasAfter: after.hero ? { width: after.hero.width, height: after.hero.height, styleWidth: after.hero.styleWidth, styleHeight: after.hero.styleHeight } : null,
    expectedBackingIfRecomputed: expectedIfRecomputed,
    backingStoreRecomputed: recomputed,
    knownGap: 'MB-046: devicePixelRatio is read once at boot (no resize/matchMedia re-layout), so a runtime display-scaling change keeps the old hero backing store until reload.',
    note: 'Recorded as evidence only. The matrix pass/fail does not depend on this probe; it documents the known gap instead of claiming runtime DPI switching works.',
  }
}

// ---------------------------------------------------------------------------
// Overflow-policy gate: 200% overall scale + hero after a reload.
// Discovered as a known gap on 2026-11-20 (rect 48,-66,384x384); fixed by
// task-110 and now gated: a regression adds a failing check.
// ---------------------------------------------------------------------------

async function probeHeroOverflowAtMaxScale(cdpClient) {
  await cdpClient.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false })
  await loadProfile(cdpClient, HERO_MAX_PROFILE)
  const layout = await measure(cdpClient, SURFACE_SELECTORS['role-hero'])
  const stage = layout.rects['#hero-stage']
  const canvas = layout.rects['#hero-canvas']
  const stageViolations = rectFitViolations(stage, VIEWPORT)
  const canvasViolations = rectFitViolations(canvas, VIEWPORT)
  const policyViolated = stageViolations.length > 0 || canvasViolations.length > 0
  // Gating check: the probe was recorded as a known gap; now that it is fixed a
  // regression must fail the run instead of silently re-entering the report.
  addCheck('known-gap-fixed:MB-050-overflow-global200-hero-reload', !policyViolated, {
    heroStageFitViolations: stageViolations,
    heroCanvasFitViolations: canvasViolations,
    heroStageRect: stage,
    heroCanvasRect: canvas,
    vars: layout.vars,
  })
  const shot = await screenshot(cdpClient, 'known-gap-hero-max-dpr1', 1)
  extraScreenshots.push(shot.file)
  return {
    knownGapId: 'MB-050-overflow-global200-hero-reload',
    title: '整体缩放 200% + 金毛 hero（重载后）角色完整可见（原已知缺陷）',
    scenario: 'Reload with scale/global=2 and hero=1. Before the fix desktop-shell applied the image zoom before the hero stage/canvas had a layout size, so the fit fell back to the unclamped resolved heroZoom (2x) and the scaled canvas extended above the window (rect 48,-66,384x384). Fixed by re-running the viewport fit after the late canvas layout exists (desktop-shell requestDesktopShellScaleRefit + layout observers, called from main.ts after the hero render mode flips).',
    dpr: 1,
    viewport: layout.viewport,
    vars: layout.vars,
    heroStageRect: stage,
    heroCanvasRect: canvas,
    heroStageFitViolations: stageViolations,
    heroCanvasFitViolations: canvasViolations,
    policyViolated: policyViolated,
    fixed: !policyViolated,
    evidenceScreenshot: shot.file,
    raster: shot.raster,
    impact: 'A user who sets 整体缩放 200%, keeps the gold retriever hero and restarts the app used to see the character clipped at the top of the 480x336 window. The late-layout re-fit clamps the 192px hero canvas back to --hero-zoom=1.625 (312px visual) inside the window and the renderer keeps the same four-level semantics.',
    suggestedFix: '(historical) Re-run applyScale() once the hero stage/canvas has a non-zero layout size (or observe the stage resize). Implemented in task-110.',
    status: policyViolated
      ? 'REGRESSION: the 200%+hero overflow came back (see heroStageFitViolations/heroCanvasFitViolations).'
      : 'FIXED 2026-11-20 (task-110): the 200%+hero reload overflow no longer occurs; --hero-zoom is fitted to 1.625 and the canvas rect stays inside the window.',
    gating: true,
    note: policyViolated
      ? 'Gating check known-gap-fixed:MB-050-overflow-global200-hero-reload failed.'
      : 'Verified by gating check known-gap-fixed:MB-050-overflow-global200-hero-reload (fails on regression).',
  }
}

// ---------------------------------------------------------------------------
// Overflow-policy gate: 200% overall scale + speech bubble.
// Discovered as a known gap on 2026-11-20 (rect top=-1475); fixed by task-110
// (single component zoom + scaled-size fit/clamp) and now gated.
// ---------------------------------------------------------------------------

async function probeBubbleOverflowAtMaxScale(cdpClient) {
  const maxProfile = PROFILES.find(function (profile) { return profile.id === 'max' })
  if (!maxProfile) throw new CheckError('max profile is missing')
  await cdpClient.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: 1, mobile: false })
  await loadProfile(cdpClient, maxProfile)
  const prepared = await evaluate(cdpClient, '(() => { const bubble = document.getElementById("bubble"); const text = document.getElementById("bubble-text"); if (!bubble || !text) return false; text.textContent = "缩放压力测试：整体 200% 时气泡是否仍完整可见。"; bubble.style.opacity = "1"; bubble.style.visibility = "visible"; window.dispatchEvent(new Event("resize")); return true })()')
  if (!prepared) throw new CheckError('could not prepare the bubble probe (bubble elements missing)')
  await waitFrames(cdpClient)
  await sleep(450)
  const layout = await measure(cdpClient, ['#bubble', '#pet'])
  const bubble = layout.rects['#bubble']
  const violations = rectFitViolations(bubble, VIEWPORT)
  const policyViolated = violations.length > 0
  // Gating check: a regression of the -1475px rect must fail the run.
  addCheck('known-gap-fixed:MB-050-overflow-bubble-global200', !policyViolated, {
    bubbleFitViolations: violations,
    bubbleRect: bubble,
    petRect: layout.rects['#pet'],
    vars: layout.vars,
  })
  const shot = await screenshot(cdpClient, 'known-gap-bubble-max-dpr1', 1)
  extraScreenshots.push(shot.file)
  return {
    knownGapId: 'MB-050-overflow-bubble-global200',
    title: '整体缩放 200% 时对话气泡完整可见（原已知缺陷）',
    scenario: 'At scale/global=2 the bubble used to double-apply its zoom (font-size AND transform) and anchor without the scaled height: font 61.25px layout, rect 30,-1475,420x1475, top of the window. Fixed by keeping the font at the fixed panel base (component zoom applied once by the transform) and by fitting/clamping the scaled box (layout x zoom) inside the 480x336 viewport instead of using the unscaled layout box.',
    dpr: 1,
    viewport: layout.viewport,
    vars: layout.vars,
    bubbleRect: bubble,
    petRect: layout.rects['#pet'],
    bubbleFitViolations: violations,
    policyViolated: policyViolated,
    fixed: !policyViolated,
    evidenceScreenshot: shot.file,
    raster: shot.raster,
    impact: 'A user at 整体缩放 200% who triggers a speech bubble used to see the whole balloon above the 480x336 window (top=-1475). The matrix captures the maximum-scale surfaces with the bubble hidden (opacity 0), so this probe sets a realistic sentence, makes the existing bubble visible and re-anchors it with a resize event. It does not call __pet.say because that path requests TTS consent and would block in headless. After the fix the visible rect sits at ~4,4 with the full box inside the window (overlapping the pet when there is no room above it, never off-window).',
    suggestedFix: '(historical) Clamp the effective bubble zoom / font at 200%, or reposition/clamp the bubble into the window when its measured height exceeds the space above the pet. Implemented in task-110.',
    status: policyViolated
      ? 'REGRESSION: the 200% bubble overflow came back (see bubbleFitViolations).'
      : 'FIXED 2026-11-20 (task-110): the scaled bubble box is fitted/clamped inside the 480x336 window; the visible rect is fully inside the window.',
    gating: true,
    note: policyViolated
      ? 'Gating check known-gap-fixed:MB-050-overflow-bubble-global200 failed.'
      : 'Verified by gating check known-gap-fixed:MB-050-overflow-bubble-global200 (fails on regression).',
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const watchdog = setTimeout(function () {
    console.error('[scale-dpi] watchdog: wall-clock limit exceeded')
    process.exit(1)
  }, 480000)
  watchdog.unref()
  parseArgs(process.argv.slice(2))
  if (options.help) { usage(); return 0 }
  if (typeof WebSocket === 'undefined') throw new SetupError('Node global WebSocket is unavailable - use Node 22+')
  const dist = assertBuildPresent()
  const repo = gitFacts()
  runDir = options.out ? resolve(ROOT, options.out) : join(ARTIFACT_ROOT, 'run-' + stamp())
  mkdirSync(runDir, { recursive: true })
  startedAt = Date.now()
  report = buildReport()
  report.environment = {
    platform: PLATFORM,
    release: process.release ? process.release.name : 'node',
    node: process.version,
    wsl: IS_WSL,
    cwd: process.cwd() === ROOT ? '.' : relToRoot(process.cwd()),
    headless: !options.headed,
    mode: options.headed ? 'headed' : 'headless=new',
  }
  report.repo = repo
  report.dist = { petMtime: new Date(dist.distMtime).toISOString(), newestSourceMtime: new Date(dist.newestSource).toISOString(), petSha256: dist.petSha256 }
  report.artifactDir = relToRoot(runDir)
  report.toolSha256 = sha256(fileURLToPath(import.meta.url))
  report.dprs = options.dprs.slice()
  log('artifact dir: ' + relToRoot(runDir))
  log('dist/pet.html sha256=' + dist.petSha256 + ' HEAD=' + String(repo.head).slice(0, 7) + ' dirty=' + String(repo.dirty))
  log('DPR matrix: ' + options.dprs.join(', ') + ' (viewport ' + VIEWPORT.width + 'x' + VIEWPORT.height + ' CSS px)')
  addCheck('dpr-matrix-has-non-1', options.dprs.some(isNon1Dpr), { dprs: options.dprs, non1: NON_1_DPRS.slice() })

  let exitCode = 1
  try {
    server = await startStaticServer()
    verbose('static server ' + server.origin)
    chrome = await launchChrome()
    report.chrome = { path: chrome.exe, browser: chrome.version.Browser, protocolVersion: chrome.version['Protocol-Version'], userAgent: chrome.version['User-Agent'], devtoolsPort: chrome.port }
    const bootstrapTarget = await waitTarget(chrome.port, function (target) { return target.type === 'page' && target.url.indexOf(BOOTSTRAP_PATH) !== -1 }, 'bootstrap page')
    pageCdp = await attachTarget(bootstrapTarget, 'dpi-page')
    pageCdp.on(function (message) {
      if (message.method === 'Runtime.exceptionThrown') {
        const details = message.params && message.params.exceptionDetails ? message.params.exceptionDetails : {}
        const text = details.exception && details.exception.description ? details.exception.description : details.text
        pageDiagnostics.push({ type: 'exception', detail: String(text).slice(0, 600) })
      }
      if (message.method === 'Page.javascriptDialogOpening') {
        pageDiagnostics.push({ type: 'dialog', detail: String(message.params && message.params.message ? message.params.message : '') })
        void pageCdp.send('Page.handleJavaScriptDialog', { accept: true })
      }
    })
    log('browser ready: ' + (chrome.version.Browser || 'unknown Chrome'))

    for (const dpr of options.dprs) {
      await pageCdp.send('Emulation.setDeviceMetricsOverride', { width: VIEWPORT.width, height: VIEWPORT.height, deviceScaleFactor: dpr, mobile: false, screenWidth: VIEWPORT.width, screenHeight: VIEWPORT.height })
      log('--- DPR ' + dpr + ' ---')
      for (const profile of PROFILES) {
        await loadProfile(pageCdp, profile)
        for (const surface of profile.surfaces) {
          await runSurface(pageCdp, dpr, profile.id, surface)
        }
      }
    }

    const invariance = layoutInvariance(layoutSamples)
    report.layoutInvariance = invariance
    addCheck('layout-invariance-across-dprs', invariance.ok, {
      tolerance: invariance.tolerance,
      groups: invariance.groups.map(function (group) { return { key: group.key, dprs: group.dprs, maxDelta: group.maxDelta } }),
      violations: invariance.violations,
    })

    const runtime = await probeRuntimeDprChange(pageCdp)
    report.runtimeDprChange = runtime
    log('runtime DPR change probe (evidence only): backingRecomputed=' + runtime.backingStoreRecomputed + ' knownGap=' + runtime.knownGap)

    const heroMax = await probeHeroOverflowAtMaxScale(pageCdp)
    report.knownGaps.push(heroMax)
    log('overflow gate ' + heroMax.knownGapId + ': policyViolated=' + heroMax.policyViolated + ' fixed=' + heroMax.fixed + ' screenshot=' + heroMax.evidenceScreenshot)

    const bubbleMax = await probeBubbleOverflowAtMaxScale(pageCdp)
    report.knownGaps.push(bubbleMax)
    log('overflow gate ' + bubbleMax.knownGapId + ': policyViolated=' + bubbleMax.policyViolated + ' fixed=' + bubbleMax.fixed + ' screenshot=' + bubbleMax.evidenceScreenshot)

    if (pageDiagnostics.length > 0) {
      addCheck('page-exceptions', false, pageDiagnostics.slice(0, 10))
    } else {
      addCheck('page-exceptions', true, [])
    }

    if (report.failures.length === 0) {
      report.ok = true
      exitCode = 0
    } else {
      report.error = report.failures.length + ' check(s) failed'
    }
  } catch (error) {
    report.error = error && error.message ? error.message : String(error)
    if (error instanceof SetupError) exitCode = 2
    throw error
  } finally {
    await stopChrome()
    const reportFile = writeReportFiles()
    log('captures: ' + report.captures.length + ' screenshots, checks: ' + report.checks.length + ', failures: ' + report.failures.length)
    log('report: ' + relToRoot(reportFile))
    if (exitCode !== 0) log('RESULT: FAIL')
    else log('RESULT: PASS (DPI matrix + layout invariance + no window overflow)')
  }
  return exitCode
}

const isDirectRun = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().then(function (code) { process.exit(code) }).catch(function (error) {
    const message = error && error.message ? error.message : String(error)
    if (report) {
      if (!report.error) report.error = message
      try { if (!existsSync(join(runDir, 'report.json'))) writeReportFiles() } catch (writeError) {}
    }
    if (error && error.exitCode === 2) {
      console.error('[scale-dpi] setup error: ' + message)
      process.exit(2)
    }
    console.error('[scale-dpi] FAILED: ' + message)
    process.exit(1)
  })
}
