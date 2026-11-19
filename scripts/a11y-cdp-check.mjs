#!/usr/bin/env node
/**
 * Real-browser accessibility / contrast / focus gate (E11 / MB-116).
 *
 * Drives a locally installed Chrome/Chromium over the Chrome DevTools Protocol
 * against the built dist/ app and checks four product surfaces that module tests
 * cannot reach:
 *
 *   1. menu-surface      desktop right-click/keyboard menu (#pet-shell-menu):
 *                        role=menu, menuitem names, roving tabindex, arrow/
 *                        Home/End/Escape, focus visible, WCAG text contrast;
 *   2. settings-dialog   #pet-settings dialog in the content window: dialog
 *                        semantics, focus trap + restore, form labels, native
 *                        range keyboard operation, aria-live status updates;
 *   3. content-hub       role & content center: dialog/tablist/tabpanel ARIA,
 *                        roving tabs (Arrow/Home/End), focus trap + restore,
 *                        live feedback region, text contrast;
 *   4. consent-gate      first-run TOS modal: role=dialog/aria-modal/labelledby,
 *                        inert background, focus trap, checkbox/accept states,
 *                        text contrast;
 * plus statement-page (setup.html legal/consent statement page), live-regions
 * (completeness of announced regions, with the pet speech bubble recorded as a
 * known gap), reduced-motion (emulated prefers-reduced-motion) and
 * page-diagnostics (uncaught page exceptions must stay at zero).
 *
 * It does NOT change business UI. Findings that would require src/pet changes
 * are reported and matched against scripts/a11y-contrast-baseline.json (known
 * findings) so this gate turns red for NEW regressions without pretending the
 * known gaps are fixed.
 *
 * Preconditions:
 *   - npm run build produced dist/ (the script refuses a missing/stale dist)
 *   - Node >= 22 (global fetch/WebSocket)
 *   - a local Chrome/Chromium (--chrome PATH or CHROME_PATH overrides detection)
 *   - from WSL: WSL2 mirrored networking so Windows Chrome and this Node process
 *     share 127.0.0.1 (the repo's dev setup). Otherwise run from Windows.
 *
 * Usage:
 *   node scripts/a11y-cdp-check.mjs [options]
 *     --chrome PATH      Chrome/Chromium executable
 *     --out DIR          artifact dir (default artifacts/a11y-cdp/run-<stamp>)
 *     --headed           launch a headed browser (default: headless=new)
 *     --keep-profile     keep the throwaway Chrome profile for debugging
 *     --timeout MS       per-condition timeout (default 30000)
 *     --verbose          print page/CDP diagnostics while running
 *     --help             show this help
 *
 * Exit codes: 0 = no NEW a11y findings, 1 = findings/regressions, 2 = setup.
 * Reports: <out>/report.json (+ screenshots) and artifacts/a11y-cdp/latest.json.
 *
 * Limitations (also recorded in every report): no axe-core (no new deps/network),
 * targeted WCAG 2.1 1.4.3/1.4.11 + ARIA/focus checks instead of the full axe
 * rule set; gradient/image-backed text is recorded as skipped, not guessed;
 * pseudo-element text and images-with-text are not scanned; CSS-transform-scaled
 * fonts are classified by computed font-size (conservative); reduced motion is
 * emulated, not an OS setting; Tauri/WebView2 native windows are out of scope.
 * Nothing here is a release/native acceptance claim.
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildAriaAuditExpression,
  buildContrastScanExpression,
  buildFocusInfoExpression,
} from './lib/a11y-scan.mjs'
import {
  WCAG_MIN_CONTRAST,
  contrastRatio,
  parseCssColor,
  roundRatio,
} from './lib/a11y-contrast.mjs'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = join(ROOT, 'dist')
const ARTIFACT_ROOT = join(ROOT, 'artifacts', 'a11y-cdp')
const BASELINE_FILE = join(ROOT, 'scripts', 'a11y-contrast-baseline.json')
const PLATFORM = process.platform
const IS_WINDOWS = PLATFORM === 'win32'
const IS_WSL = !IS_WINDOWS && existsSync('/mnt/c/Windows/System32')
const NL = String.fromCharCode(10)
const CHECK_IDS = ['consent-gate', 'menu-surface', 'content-hub', 'settings-dialog', 'statement-page', 'live-regions', 'reduced-motion', 'page-diagnostics']
const CHECK_TITLES = {
  'consent-gate': '首启同意对话框：ARIA / 焦点陷阱 / 对比度',
  'menu-surface': '桌面菜单：ARIA / roving focus / 对比度',
  'content-hub': '角色与内容中心：tab ARIA / 焦点陷阱 / 对比度',
  'settings-dialog': '设置对话框：ARIA / 焦点陷阱 / 表单标签 / 对比度 / live region',
  'statement-page': '同意/法务说明页 setup.html：语义 / live region / 对比度',
  'live-regions': '桌宠 live region 覆盖（气泡缺口记录）',
  'reduced-motion': 'prefers-reduced-motion：系统偏好驱动 + 动效收起 + 功能等价',
  'page-diagnostics': '页面运行时异常（未捕获异常必须为 0）',
}
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
  '.glb': 'model/gltf-binary',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}
const BOOTSTRAP_HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>a11y gate bootstrap</title></head><body><p id="bootstrap">a11y gate bootstrap</p></body></html>'

const options = {
  chrome: process.env.CHROME_PATH || '',
  out: '',
  headed: false,
  keepProfile: false,
  timeoutMs: 30000,
  verbose: false,
  help: false,
}

function usage() {
  const lines = [
    'Real-browser accessibility/contrast/focus gate (E11 / MB-116).',
    '',
    'Usage: node scripts/a11y-cdp-check.mjs [options]',
    '  --chrome PATH      Chrome/Chromium executable (default: auto-detect; CHROME_PATH works too)',
    '  --out DIR          artifact dir (default artifacts/a11y-cdp/run-<stamp>)',
    '  --headed           launch a headed browser (default: headless=new)',
    '  --keep-profile     keep the throwaway Chrome profile for debugging',
    '  --timeout MS       per-condition timeout in ms (default 30000)',
    '  --verbose          print CDP/page diagnostics',
    '  --help             show this help',
    '',
    'Checks: ' + CHECK_IDS.join(', '),
    'Known-finding baseline: scripts/a11y-contrast-baseline.json (only NEW findings fail).',
    'Exit codes: 0 no new findings, 1 findings/regressions, 2 setup error.',
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
    else if (arg === '--timeout') { index += 1; options.timeoutMs = Number(argv[index]) || 30000 }
    else if (arg.startsWith('--')) throw setupError('unknown option: ' + arg + ' (use --help)')
  }
}

class GateError extends Error {
  constructor(message, exitCode, evidence) {
    super(message)
    this.name = 'GateError'
    this.exitCode = exitCode === undefined ? 1 : exitCode
    this.evidence = evidence || null
  }
}

function setupError(message) { return new GateError(message, 2) }
function fail(message, evidence) { return new GateError(message, 1, evidence) }
function log(message) { console.log('[a11y] ' + message) }
function verbose(message) { if (options.verbose) console.log('[a11y:debug] ' + message) }
function sleep(ms) { return new Promise((done) => setTimeout(done, ms)) }

function stamp() {
  const now = new Date()
  const pad = (value) => (value < 10 ? '0' + value : String(value))
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
  if (!existsSync(petHtml)) throw setupError('dist/pet.html is missing - run npm run build first (the gate serves the built app)')
  const distMtime = statSync(petHtml).mtimeMs
  const newestSource = Math.max(newestMtime(join(ROOT, 'src')), newestMtime(join(ROOT, 'public')))
  if (newestSource > distMtime + 1000) throw setupError('dist/ is older than src/ or public/ - run npm run build first so the gate cannot pass on a stale bundle')
  return { petHtml, distMtime, newestSource, petSha256: sha256(petHtml) }
}
function toWindowsPath(posixPath) {
  if (IS_WINDOWS) return posixPath
  if (!IS_WSL) return posixPath
  const result = spawnSync('wslpath', ['-w', posixPath], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout) throw setupError('wslpath -w failed for ' + posixPath)
  return String(result.stdout).trim()
}
function isWindowsExecutable(exe) { return IS_WINDOWS || exe.startsWith('/mnt/') || exe.endsWith('.exe') || exe.endsWith('.EXE') }
function detectChrome() {
  if (options.chrome) {
    if (!existsSync(options.chrome)) throw setupError('--chrome path does not exist: ' + options.chrome)
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
    candidates.push('/usr/bin/google-chrome')
    candidates.push('/usr/bin/google-chrome-stable')
    candidates.push('/usr/bin/chromium')
    candidates.push('/usr/bin/chromium-browser')
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
      const found = spawnSync('which', [name], { encoding: 'utf8' })
      if (found.status === 0 && found.stdout) candidates.unshift(String(found.stdout).trim())
    }
  }
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  throw setupError('no local Chrome/Chromium found - pass --chrome PATH or set CHROME_PATH')
}
function startStaticServer() {
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1')
      const pathname = decodeURIComponent(url.pathname)
      if (pathname === '/__a11y-bootstrap.html') {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        response.end(BOOTSTRAP_HTML)
        return
      }
      if (pathname === '/favicon.ico') { response.writeHead(204); response.end(); return }
      let target = pathname
      if (target.endsWith('/')) target += 'index.html'
      const abs = normalize(join(DIST, target))
      if (!abs.startsWith(DIST)) { response.writeHead(403); response.end('forbidden'); return }
      if (!existsSync(abs) || !statSync(abs).isFile()) { response.writeHead(404); response.end('not found'); return }
      response.writeHead(200, { 'content-type': MIME_TYPES[extname(abs).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' })
      response.end(readFileSync(abs))
    } catch (error) {
      response.writeHead(500)
      response.end('server error')
    }
  })
  return new Promise((done, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      done({ server, port: address.port, origin: 'http://127.0.0.1:' + address.port })
    })
  })
}
async function fetchJson(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs || 2000)
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
  const script = 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "chrome.exe" -and $_.CommandLine -like "*' + pattern + '*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }'
  return spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 20000 })
}
function killSpawnedChrome(child, profileForChrome, windowsExe) {
  if (windowsExe) powershellKillChrome(profileForChrome)
  try { child.kill('SIGTERM') } catch (error) {}
}
function cleanupStaleGateChrome() {
  if (!IS_WINDOWS && !IS_WSL) return
  const marker = toWindowsPath(ARTIFACT_ROOT)
  if (!marker) return
  const result = powershellKillChrome(marker)
  if (result.error) verbose('stale chrome cleanup warning: ' + result.error.message)
}
async function launchChrome(origin) {
  cleanupStaleGateChrome()
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
    '--window-size=760,560',
    origin + '/__a11y-bootstrap.html',
  )
  verbose('launch ' + exe + ' profile=' + profileForChrome)
  const child = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderrTail = ''
  child.stderr.on('data', (chunk) => { stderrTail = (stderrTail + String(chunk)).slice(-6000) })
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
    const hint = IS_WSL ? ' (WSL: Windows Chrome and this Node process must share 127.0.0.1 - WSL2 mirrored networking; otherwise run the gate from Windows)' : ''
    throw setupError('Chrome did not write DevToolsActivePort in ' + profileDir + hint + NL + stderrTail)
  }
  const version = await waitEndpoint(port, Math.max(options.timeoutMs, 20000))
  if (!version) {
    killSpawnedChrome(child, profileForChrome, windowsExe)
    throw setupError('Chrome DevTools endpoint did not come up on 127.0.0.1:' + port + NL + stderrTail)
  }
  verbose('chrome devtools port ' + port)
  return { exe, windowsExe, port, child, profileDir, profileForChrome, version }
}
function connectCdp(wsUrl, label) {
  return new Promise((done, reject) => {
    let socket
    try { socket = new WebSocket(wsUrl) } catch (error) { reject(setupError('cannot open CDP WebSocket for ' + label + ': ' + error.message)); return }
    const pending = new Map()
    const handlers = new Set()
    let nextId = 0
    let opened = false
    socket.addEventListener('open', () => {
      opened = true
      const send = (method, params) => new Promise((resolveSend) => {
        const id = (nextId += 1)
        pending.set(id, resolveSend)
        socket.send(JSON.stringify({ id, method, params: params || {} }))
      })
      done({
        send,
        on: (handler) => handlers.add(handler),
        close: () => { try { socket.close() } catch (error) {} },
        wsUrl,
        label,
      })
    }, { once: true })
    socket.addEventListener('message', (event) => {
      let message
      try { message = JSON.parse(String(event.data)) } catch (error) { return }
      if (message.id !== undefined) {
        const resolveSend = pending.get(message.id)
        if (resolveSend) { pending.delete(message.id); resolveSend(message) }
        return
      }
      for (const handler of handlers) { try { handler(message) } catch (error) {} }
    })
    socket.addEventListener('error', () => { if (!opened) reject(setupError('CDP WebSocket error for ' + label)) }, { once: true })
    socket.addEventListener('close', () => { if (!opened) reject(setupError('CDP WebSocket closed before open for ' + label)) })
  })
}
async function attachTarget(target, label) {
  const cdp = await connectCdp(target.webSocketDebuggerUrl, label)
  cdpClients.add(cdp)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Log.enable')
  return cdp
}
async function evaluate(cdp, expression, settings) {
  const message = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: !(settings && settings.awaitPromise === false),
    userGesture: true,
  })
  if (message.error) throw fail('CDP Runtime.evaluate failed: ' + message.error.message)
  const result = message.result || {}
  if (result.exceptionDetails) {
    const details = result.exceptionDetails
    const description = details.exception && details.exception.description ? details.exception.description : details.text
    throw fail('page exception: ' + String(description).split(NL)[0])
  }
  return result.result ? result.result.value : undefined
}
async function waitFor(cdp, expression, label, timeoutMs) {
  const limit = timeoutMs || options.timeoutMs
  const started = Date.now()
  let lastError = null
  while (Date.now() - started < limit) {
    try {
      const value = await evaluate(cdp, expression)
      if (value) return value
    } catch (error) {
      lastError = error
    }
    await sleep(200)
  }
  throw fail('timeout waiting for ' + label + (lastError ? ' (last error: ' + lastError.message + ')' : ''))
}
async function waitTarget(port, predicate, label, timeoutMs) {
  const limit = timeoutMs || options.timeoutMs
  const started = Date.now()
  while (Date.now() - started < limit) {
    const target = (await listTargets(port)).find(predicate)
    if (target) return target
    await sleep(200)
  }
  throw fail('timeout waiting for target: ' + label)
}
async function waitTargetGone(port, targetId, label, timeoutMs) {
  const limit = timeoutMs || options.timeoutMs
  const started = Date.now()
  while (Date.now() - started < limit) {
    const targets = await listTargets(port)
    if (!targets.some((target) => target.id === targetId)) return Date.now() - started
    await sleep(200)
  }
  throw fail('timeout waiting for target to close: ' + label)
}
function selectorExpr(selector) { return 'document.querySelector(' + JSON.stringify(selector) + ')' }
function elementInfo(cdp, expression, label) {
  const infoExpression = '(() => { const el = (' + expression + '); if (!el) return { found: false }; el.scrollIntoView({ block: "center", inline: "center" }); const rect = el.getBoundingClientRect(); return { found: true, x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, left: rect.left, width: rect.width, vw: innerWidth, vh: innerHeight } })()'
  return evaluate(cdp, infoExpression).then((info) => {
    if (!info || !info.found) throw fail('element not found: ' + label)
    return info
  })
}
function inViewport(info) { return info.x >= 1 && info.y >= 1 && info.x <= info.vw - 1 && info.y <= info.vh - 1 }
async function clickExpression(cdp, expression, label) {
  const initial = await elementInfo(cdp, expression, label)
  if (!inViewport(initial)) throw fail('element is outside the viewport: ' + label)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: initial.x, y: initial.y })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: initial.x, y: initial.y, button: 'left', buttons: 1, clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: initial.x, y: initial.y, button: 'left', buttons: 0, clickCount: 1 })
  return initial
}
async function clickSelector(cdp, selector, label) { return clickExpression(cdp, selectorExpr(selector), label) }
async function clickRangeAt(cdp, selector, fraction) {
  const info = await evaluate(cdp, '(() => { const el = document.querySelector(' + JSON.stringify(selector) + '); if (!el) return null; el.scrollIntoView({ block: "center" }); const rect = el.getBoundingClientRect(); return { x: rect.left + rect.width * ' + String(fraction) + ', y: rect.y + rect.height / 2 } })()')
  if (!info) throw fail('range input not found: ' + selector)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: info.x, y: info.y, button: 'left', buttons: 1, clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', buttons: 0, clickCount: 1 })
}
async function rightClickPet(cdp) { return clickExpression(cdp, 'document.getElementById("pet")', 'pet') }
async function pressKey(cdp, key, code, virtualKeyCode, modifiers, type) {
  const payload = { key, code, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode, modifiers: modifiers || 0 }
  await cdp.send('Input.dispatchKeyEvent', Object.assign({ type: type || 'keyDown' }, payload))
  await cdp.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, payload))
}
async function pressEscape(cdp) { return pressKey(cdp, 'Escape', 'Escape', 27, 0, 'keyDown') }
async function pressEnter(cdp) { return pressKey(cdp, 'Enter', 'Enter', 13, 0, 'keyDown') }
async function pressTab(cdp, shift) { return pressKey(cdp, 'Tab', 'Tab', 9, shift ? 8 : 0, 'rawKeyDown') }
async function pressArrow(cdp, key) {
  const codes = { ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35 }
  return pressKey(cdp, key, key, codes[key], 0, 'rawKeyDown')
}
async function pressSpace(cdp) { return pressKey(cdp, ' ', 'Space', 32, 0, 'keyDown') }
async function openPopup(cdp, url, name, features) {
  const port = chrome.port
  const before = new Set((await listTargets(port)).map((target) => target.id))
  await evaluate(cdp, 'window.open(' + JSON.stringify(url) + ', ' + JSON.stringify(name) + ', ' + JSON.stringify(features || '') + ') !== null')
  const started = Date.now()
  while (Date.now() - started < Math.max(options.timeoutMs, 15000)) {
    const targets = await listTargets(port)
    const created = targets.find((target) => target.type === 'page' && !before.has(target.id))
    if (created) return created
    await sleep(150)
  }
  throw fail('window.open did not create a page target: ' + url)
}
async function waitDocumentReady(cdp) {
  await waitFor(cdp, 'document.readyState === "complete" || document.readyState === "interactive"', 'document ready')
}
function captureScreenshots(cdp) {
  const screenshots = []
  return {
    screenshots,
    async shot(name) {
      const message = await cdp.send('Page.captureScreenshot', { format: 'png' })
      if (message.error || !message.result || !message.result.data) throw fail('Page.captureScreenshot failed')
      const file = join(runDir, name)
      writeFileSync(file, Buffer.from(message.result.data, 'base64'))
      screenshots.push(relToRoot(file))
      return file
    },
  }
}
function trackPageDiagnostics(cdp, sink) {
  cdp.on((message) => {
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params && message.params.exceptionDetails ? message.params.exceptionDetails : {}
      const text = details.exception && details.exception.description ? details.exception.description : details.text
      sink.push({ type: 'exception', target: cdp.label, detail: String(text || '').split(NL)[0].slice(0, 300) })
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params && message.params.type === 'error') {
      sink.push({ type: 'console-error', target: cdp.label, detail: JSON.stringify(message.params.args || []).slice(0, 300) })
    }
    if (message.method === 'Log.entryAdded' && message.params && message.params.entry && message.params.entry.level === 'error') {
      const entry = message.params.entry
      if (String(entry.url || '').indexOf('favicon') === -1) sink.push({ type: 'log-error', target: cdp.label, detail: String(entry.text || '').slice(0, 300) })
    }
    if (message.method === 'Page.javascriptDialogOpening') {
      sink.push({ type: 'dialog', target: cdp.label, detail: String(message.params && message.params.message || '').slice(0, 200) })
      void cdp.send('Page.handleJavaScriptDialog', { accept: true })
    }
  })
}

// ---------------------------------------------------------------------------
// Findings, contrast scan, ARIA audit, focus helpers.
// ---------------------------------------------------------------------------
function createFindings() {
  const items = []
  return {
    items,
    add(rule, message, extra) {
      const payload = Object.assign({ rule, message }, extra || {})
      if (!payload.signature) payload.signature = rule + '|' + (payload.element || '')
      items.push(payload)
    },
  }
}
async function scanContrast(cdp, scope) { return await evaluate(cdp, buildContrastScanExpression(scope)) }
async function auditScope(cdp, scope) { return await evaluate(cdp, buildAriaAuditExpression(scope)) }
async function focusInfo(cdp) { return await evaluate(cdp, buildFocusInfoExpression()) }
function addContrastFindings(bag, scan, scopeLabel) {
  if (!scan || scan.found !== true) {
    bag.add('contrast.scope-missing', '对比度扫描范围不存在: ' + scopeLabel, { signature: 'contrast.scope-missing|' + scopeLabel })
    return
  }
  for (const violation of scan.violations || []) {
    bag.add('contrast.text', scopeLabel + ' 文本对比度不足 ' + violation.ratio + ':1 < ' + violation.required + ':1（' + violation.element + '，' + violation.color + ' on ' + violation.background + '，' + violation.fontSize + 'px/' + violation.fontWeight + '）：' + violation.text, {
      signature: 'contrast.text|' + violation.element + '|' + violation.color + '|' + violation.background + '|' + violation.fontSize + '|' + violation.fontWeight + '|' + violation.required,
      element: violation.element,
      color: violation.color,
      background: violation.background,
      ratio: violation.ratio,
      required: violation.required,
      fontSize: violation.fontSize,
      fontWeight: violation.fontWeight,
      largeText: violation.largeText,
      text: violation.text,
      count: violation.count,
    })
  }
  if ((scan.skippedCount || 0) > 0) verbose(scopeLabel + ': contrast skipped ' + scan.skippedCount + ' elements (' + JSON.stringify(scan.skippedReasons || {}) + ')')
}
function addCommonAuditFindings(bag, audit, scopeLabel) {
  if (!audit || audit.found !== true) {
    bag.add('audit.scope-missing', 'ARIA 审计范围不存在: ' + scopeLabel, { signature: 'audit.scope-missing|' + scopeLabel })
    return
  }
  if (!audit.lang) bag.add('html.lang', 'html 元素缺少 lang 属性', { signature: 'html.lang|html' })
  for (const id of audit.duplicateIds) bag.add('aria.duplicate-id', '重复 id：' + id, { signature: 'aria.duplicate-id|' + id })
  for (const image of audit.images) {
    if (!image.hasAltAttribute) bag.add('aria.image-alt', '图片缺少 alt 属性：' + image.element, { signature: 'aria.image-alt|' + image.element })
  }
  for (const control of audit.controls) {
    if (!control.visible || control.disabled) continue
    if (!control.name) bag.add('aria.control-name', '可交互控件缺少无障碍名称：' + control.element, { signature: 'aria.control-name|' + control.element })
  }
  for (const item of audit.positiveTabindex) bag.add('aria.positive-tabindex', '正值 tabindex：' + item.element + '=' + item.tabindex, { signature: 'aria.positive-tabindex|' + item.element })
  for (const item of audit.ariaHiddenFocusable) bag.add('aria.hidden-focusable', 'aria-hidden 子树内有可聚焦元素：' + item.element, { signature: 'aria.hidden-focusable|' + item.element })
}
async function activeFocusFacts(cdp, rootSelector) {
  const expression = '(function () { const root = document.querySelector(' + JSON.stringify(rootSelector) + '); const active = document.activeElement; const describe = function (node) { if (!node || !node.tagName) return "?"; var out = node.tagName.toLowerCase(); if (node.id) out += "#" + node.id; var cls = typeof node.className === "string" ? node.className.trim() : ""; if (cls) out += "." + cls.split(" ").filter(Boolean).slice(0, 2).join("."); return out }; var text = active ? String(active.getAttribute("aria-label") || active.textContent || "").trim().slice(0, 60) : ""; return { root: ' + JSON.stringify(rootSelector) + ', inside: !!(root && active && root.contains(active)), active: describe(active), key: describe(active) + "|" + (active && active.id ? active.id : "") + "|" + text, activeId: active && active.id ? active.id : null, activeRole: active ? active.getAttribute("role") : null, activeText: text } })()'
  return await evaluate(cdp, expression)
}
async function tabTrail(cdp, rootSelector, presses, shift) {
  const trail = []
  let escaped = 0
  for (let index = 0; index < presses; index += 1) {
    await pressTab(cdp, shift)
    const facts = await activeFocusFacts(cdp, rootSelector)
    trail.push(facts.key + (facts.inside ? '' : ' (ESCAPED)'))
    if (!facts.inside) escaped += 1
  }
  const unique = Array.from(new Set(trail.map((item) => item.replace(' (ESCAPED)', ''))))
  return { trail, escaped, unique }
}
function addTrapFindings(bag, trail, rootLabel, minStops) {
  if (trail.escaped > 0) {
    bag.add('focus.trap-escape', rootLabel + ' 的 Tab 焦点跑出对话框 ' + trail.escaped + ' 次：' + trail.trail.slice(0, 8).join(' -> '), { signature: 'focus.trap-escape|' + rootLabel })
  }
  if (trail.unique.length < minStops) {
    bag.add('focus.trap-stops', rootLabel + ' Tab 只到过 ' + trail.unique.length + ' 个停止点（预期至少 ' + minStops + '）', { signature: 'focus.trap-stops|' + rootLabel })
  }
}
async function focusIndicatorFacts(cdp) {
  const info = await focusInfo(cdp)
  if (!info || info.found !== true) return { problem: '焦点丢失（activeElement 为 body/根元素）', info }
  const outlineOn = info.outlineStyle !== 'none' && Number(info.outlineWidth) > 0
  const shadowOn = typeof info.boxShadow === 'string' && info.boxShadow !== 'none'
  if (!outlineOn && !shadowOn) return { problem: '没有可见焦点指示（outline 与 box-shadow 均缺失）', info }
  if (outlineOn && info.effectiveBackground) {
    const foreground = parseCssColor(info.outlineColor)
    const background = parseCssColor(info.effectiveBackground)
    if (foreground && background) {
      try {
        const ratio = contrastRatio(foreground, background)
        if (ratio + 0.01 < WCAG_MIN_CONTRAST.nonText) return { problem: '焦点指示对比度 ' + roundRatio(ratio) + ':1 < 3:1', info }
      } catch (error) {
        // Unknown/translucent backdrop: presence of an outline is still a pass.
      }
    }
  }
  return { problem: null, info }
}
async function addFocusIndicatorFinding(bag, cdp, label) {
  const result = await focusIndicatorFacts(cdp)
  if (result.problem) {
    bag.add('focus.indicator', label + '：' + result.problem, { signature: 'focus.indicator|' + label, focus: result.info })
  }
  return result.info
}
async function assertFocusInside(bag, cdp, rootSelector, label, minIndex) {
  const facts = await activeFocusFacts(cdp, rootSelector)
  if (!facts.inside) {
    bag.add('focus.initial', label + ' 打开后焦点不在对话框内（active=' + facts.active + '）', { signature: 'focus.initial|' + rootSelector })
  }
  return facts
}

// ---------------------------------------------------------------------------
// Global runtime state (populated by main; helpers above use them).
// ---------------------------------------------------------------------------
let startedAt = Date.now()
let runDir = ''
let server = null
let chrome = null
let report = null
let baseline = { findings: [], exists: false, path: null }
const cdpClients = new Set()
const baselineMatched = new Set()

function buildReport() {
  return {
    schema: 1,
    tool: 'scripts/a11y-cdp-check.mjs',
    kind: 'real-browser-a11y-contrast-focus',
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: null,
    ok: false,
    environment: {},
    repo: {},
    dist: {},
    chrome: {},
    baseline: {},
    checks: [],
    findings: [],
    knownFindings: [],
    pageDiagnostics: [],
    screenshots: [],
    limitations: [
      'No axe-core (no new dependencies / no network): this gate implements targeted WCAG 2.1 1.4.3 contrast / 1.4.11 non-text contrast plus specific ARIA, focus, live-region and reduced-motion assertions. It is not the full axe rule set.',
      'Gradient- or image-backed text is recorded as skipped instead of guessed; pseudo-element text and images-with-text are not scanned; wide-gamut color() values are skipped.',
      'Panels are CSS-transform-scaled (overall zoom); large-text classification uses computed font-size, so the threshold decision is conservative (smaller px), not transformed px.',
      'prefers-reduced-motion is emulated through CDP Emulation.setEmulatedMedia, not a real OS setting; the reduced-motion functional parity check only opens/closes the menu.',
      'Browser fallback only: Tauri/WebView2 native windows, tray, single-instance, Rust quit, real 760x560 outer-window sizing and GPU rendering are not exercised.',
      'setup.html is the legal/consent statement page; actual consent acceptance happens only in the pet TOS modal (checked in consent-gate). This gate never fabricates consent or real-device results.',
      'Known findings matched from scripts/a11y-contrast-baseline.json are reported openly and do not fail the gate; only NEW findings/regressions do. Fixing a known finding without refreshing the baseline marks the entry stale (reported, not failed).',
    ],
    error: null,
  }
}
function addCheckResult(result) {
  const check = {
    id: result.id,
    title: CHECK_TITLES[result.id],
    ok: result.findings.length === 0,
    durationMs: result.durationMs,
    evidence: result.evidence,
    findings: result.findings,
    knownFindings: result.knownFindings,
  }
  report.checks.push(check)
  for (const finding of result.findings) report.findings.push(Object.assign({ check: result.id }, finding))
  for (const finding of result.knownFindings) report.knownFindings.push(Object.assign({ check: result.id }, finding))
  return check
}
function failCheck(checkId, error, durationMs) {
  const check = {
    id: checkId,
    title: CHECK_TITLES[checkId],
    ok: false,
    durationMs,
    evidence: error && error.evidence ? error.evidence : null,
    findings: [{ rule: 'check.error', message: error && error.message ? error.message : String(error), signature: 'check.error|' + checkId }],
    knownFindings: [],
  }
  report.checks.push(check)
  for (const finding of check.findings) report.findings.push(Object.assign({ check: checkId }, finding))
  return check
}
function writeReportFiles() {
  report.finishedAt = new Date().toISOString()
  report.durationMs = Date.now() - startedAt
  const file = join(runDir, 'report.json')
  report.reportFile = relToRoot(file)
  writeFileSync(file, JSON.stringify(report, null, 2))
  try {
    mkdirSync(ARTIFACT_ROOT, { recursive: true })
    writeFileSync(join(ARTIFACT_ROOT, 'latest.json'), JSON.stringify(report, null, 2))
  } catch (error) {
    verbose('could not write latest.json: ' + error.message)
  }
  return file
}
async function stopChromeBrowser() {
  for (const client of cdpClients) { try { client.close() } catch (error) {} }
  cdpClients.clear()
  if (!chrome) return
  const state = chrome
  try {
    if (state.windowsExe) powershellKillChrome(String(state.profileForChrome))
    try { state.child.kill('SIGTERM') } catch (error) {}
    for (let attempt = 0; attempt < 20; attempt += 1) { if (state.child.exitCode !== null) break; await sleep(150) }
  } catch (error) {
    verbose('chrome shutdown warning: ' + error.message)
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
// Surface checks.
// ---------------------------------------------------------------------------
function summarizeScan(scan) {
  if (!scan || scan.found !== true) return scan || null
  return {
    scope: scan.scope,
    candidates: scan.candidates,
    checked: scan.checked,
    violations: (scan.violations || []).length,
    violationSample: (scan.violations || []).slice(0, 8),
    skipped: scan.skippedCount,
    skippedReasons: scan.skippedReasons || {},
    minRatio: scan.minRatio,
    worst: (scan.worst || []).slice(0, 5),
  }
}
function summarizeAudit(audit) {
  if (!audit || audit.found !== true) return audit || null
  return {
    scope: audit.scope,
    lang: audit.lang,
    title: audit.title,
    dialogs: audit.dialogs,
    menus: audit.menus,
    tablists: audit.tablists,
    tabpanels: audit.tabpanels,
    liveRegions: audit.liveRegions,
    headings: audit.headings,
    controlCount: audit.controls.length,
    unnamedControls: audit.controls.filter((control) => control.visible && !control.disabled && !control.name).map((control) => control.element),
    images: audit.images.length,
    duplicateIds: audit.duplicateIds,
    positiveTabindex: audit.positiveTabindex,
    ariaHiddenFocusable: audit.ariaHiddenFocusable,
    focusableCount: audit.focusableCount,
    focusableSample: audit.focusableSample,
  }
}
async function waitActiveClass(cdp, className, label, attempts) {
  for (let index = 0; index < attempts; index += 1) {
    await pressTab(cdp, false)
    const facts = await evaluate(cdp, '(function () { const active = document.activeElement; return { cls: active && typeof active.className === "string" ? active.className : "", id: active && active.id ? active.id : null, tag: active ? active.tagName : null } })()')
    if (facts && String(facts.cls).split(' ').indexOf(className) !== -1) return facts
  }
  throw fail('Tab did not reach .' + className + ' within ' + attempts + ' presses (' + label + ')')
}
async function dismissFirstRunChrome(cdp) {
  const coach = await waitFor(cdp, '(() => { const el = document.getElementById("pet-menu-coach"); return el ? el.innerText : "" })()', 'first-run menu coach', Math.max(options.timeoutMs, 15000))
  await clickExpression(cdp, '[...document.querySelectorAll("#pet-menu-coach button")].find(function (el) { return el.textContent.indexOf("知道了") !== -1 })', 'coach dismiss')
  await waitFor(cdp, 'document.getElementById("pet-menu-coach") === null', 'coach dismissed')
  const setupVisible = await evaluate(cdp, '(() => { const el = document.getElementById("setup-dismiss"); return !!(el && !el.hidden && el.offsetParent !== null) })()')
  if (setupVisible) await clickSelector(cdp, '#setup-dismiss', 'setup notice dismiss')
  await sleep(300)
  return { coach: String(coach).slice(0, 160), setupNoticeDismissed: setupVisible }
}

async function focusPage(cdp) {
  try { await cdp.send('Page.bringToFront') } catch (error) { verbose('Page.bringToFront failed: ' + error.message) }
}
async function checkConsentGate(cdp) {
  const bag = createFindings()
  await focusPage(cdp)
  await waitFor(cdp, 'document.querySelector(".consent-root.consent-tos-modal .consent-dialog") !== null', 'first-run TOS dialog', Math.max(options.timeoutMs, 20000))
  const audit = await auditScope(cdp, '.consent-root.consent-tos-modal .consent-dialog')
  addCommonAuditFindings(bag, audit, 'TOS dialog')
  const dialog = (audit.dialogs || [])[0] || null
  if (!dialog) {
    bag.add('consent.dialog', '未找到 role=dialog 的首启同意对话框', { signature: 'consent.dialog|missing' })
  } else {
    if (dialog.role !== 'dialog') bag.add('consent.dialog-role', '同意对话框 role=' + dialog.role + '（期望 dialog）', { signature: 'consent.dialog-role|' + dialog.element })
    if (dialog.ariaModal !== 'true') bag.add('consent.dialog-modal', '同意对话框 aria-modal=' + dialog.ariaModal + '（期望 true）', { signature: 'consent.dialog-modal|' + dialog.element })
    if (!dialog.labelledByAttr || !dialog.labelledByText) bag.add('consent.dialog-label', '同意对话框缺少可解析的 aria-labelledby', { signature: 'consent.dialog-label|' + dialog.element })
    if (!dialog.describedByText) bag.add('consent.dialog-described', '同意对话框缺少可解析的 aria-describedby 文本', { signature: 'consent.dialog-described|' + dialog.element })
    if (!dialog.visible) bag.add('consent.dialog-visible', '同意对话框没有可见框', { signature: 'consent.dialog-visible|' + dialog.element })
  }
  const backgroundFacts = await evaluate(cdp, '(() => { const app = document.getElementById("pet-app"); return { appInert: !!(app && app.hasAttribute("inert")), consentRoots: document.querySelectorAll(".consent-root").length, title: document.querySelector(".consent-tos-modal .consent-title") ? document.querySelector(".consent-tos-modal .consent-title").textContent.trim().slice(0, 120) : null } })()')
  if (backgroundFacts.appInert !== true) bag.add('consent.background-inert', '同意弹窗打开时 #pet-app 没有 inert（背景仍可被误操作）', { signature: 'consent.background-inert|#pet-app' })
  if (!backgroundFacts.title) bag.add('consent.title', '同意对话框缺少可见标题文本', { signature: 'consent.title|missing' })
  const controlFacts = await evaluate(cdp, '(() => { const checkbox = document.querySelector(".consent-root.consent-tos-modal input[type=checkbox]"); const accept = document.querySelector(".consent-root.consent-tos-modal .consent-accept"); const decline = document.querySelector(".consent-root.consent-tos-modal .consent-decline"); const labels = checkbox && checkbox.labels ? Array.from(checkbox.labels).map(function (label) { return label.textContent.trim() }) : []; return { hasCheckbox: !!checkbox, checkboxLabels: labels, acceptText: accept ? accept.textContent.trim() : null, acceptDisabled: accept ? accept.disabled : null, declineText: decline ? decline.textContent.trim() : null } })()')
  if (!controlFacts.hasCheckbox) bag.add('consent.checkbox', '同意对话框没有显式勾选框', { signature: 'consent.checkbox|missing' })
  if (!controlFacts.checkboxLabels || controlFacts.checkboxLabels.length === 0) bag.add('consent.checkbox-label', '同意勾选框没有 label 关联', { signature: 'consent.checkbox-label|missing' })
  if (!controlFacts.acceptText) bag.add('consent.accept-name', '同意按钮没有文本名称', { signature: 'consent.accept-name|missing' })
  if (controlFacts.acceptDisabled !== true) bag.add('consent.accept-disabled', '未勾选时同意按钮不是 disabled（可能跳过显式同意）', { signature: 'consent.accept-disabled|missing' })
  if (!controlFacts.declineText) bag.add('consent.decline-name', '拒绝按钮没有文本名称', { signature: 'consent.decline-name|missing' })
  const initialFocus = await assertFocusInside(bag, cdp, '.consent-root.consent-tos-modal .consent-dialog', '首启同意对话框', 0)
  const forwardTrail = await tabTrail(cdp, '.consent-root.consent-tos-modal .consent-dialog', 14, false)
  addTrapFindings(bag, forwardTrail, '首启同意对话框', 3)
  const backwardTrail = await tabTrail(cdp, '.consent-root.consent-tos-modal .consent-dialog', 6, true)
  addTrapFindings(bag, backwardTrail, '首启同意对话框（Shift+Tab）', 3)
  const checkboxFocus = await evaluate(cdp, '(function () { const dialog = document.querySelector(".consent-root.consent-tos-modal .consent-dialog"); if (!dialog) return null; const checkbox = dialog.querySelector("input[type=checkbox]"); if (!checkbox) return null; checkbox.focus(); return { id: checkbox.id } })()')
  const indicatorInfo = await addFocusIndicatorFinding(bag, cdp, '首启同意勾选框（键盘焦点）')
  const scan = await scanContrast(cdp, '.consent-root')
  addContrastFindings(bag, scan, '首启同意对话框')
  const shot = captureScreenshots(cdp)
  await shot.shot('01-consent-tos.png')
  await clickSelector(cdp, '.consent-root.consent-tos-modal input[type=checkbox]', 'TOS checkbox')
  await waitFor(cdp, 'document.querySelector(".consent-root.consent-tos-modal .consent-accept") && document.querySelector(".consent-root.consent-tos-modal .consent-accept").disabled === false', 'accept enabled after explicit checkbox')
  await waitActiveClass(cdp, 'consent-accept', 'TOS accept', 6)
  const acceptIndicator = await addFocusIndicatorFinding(bag, cdp, '首启同意按钮（键盘焦点）')
  await clickSelector(cdp, '.consent-root.consent-tos-modal .consent-accept', 'TOS accept')
  await waitFor(cdp, 'document.querySelectorAll(".consent-root").length === 0', 'TOS modal closed', Math.max(options.timeoutMs, 20000))
  await waitFor(cdp, '!!window.__pet', 'pet runtime booted after consent', Math.max(options.timeoutMs, 30000))
  return {
    findings: bag.items,
    evidence: {
      dialog: dialog,
      title: backgroundFacts.title,
      background: backgroundFacts,
      controls: controlFacts,
      initialFocus,
      focusTrail: { forward: forwardTrail, backward: backwardTrail },
      checkboxFocus,
      focusIndicator: { checkbox: indicatorInfo, accept: acceptIndicator },
      contrast: summarizeScan(scan),
      accepted: true,
      screenshots: shot.screenshots,
    },
  }
}

async function checkMenuSurface(cdp) {
  const bag = createFindings()
  await focusPage(cdp)
  await evaluate(cdp, 'document.getElementById("pet").focus()')
  await pressEnter(cdp)
  await waitFor(cdp, 'document.getElementById("pet-shell-menu") && document.getElementById("pet-shell-menu").dataset.state === "open"', 'menu open via keyboard Enter', Math.max(options.timeoutMs, 15000))
  const audit = await auditScope(cdp, '#pet-shell-menu')
  addCommonAuditFindings(bag, audit, '菜单')
  const menu = (audit.menus || [])[0] || null
  if (!menu) {
    bag.add('menu.role', '未找到 role=menu 的桌面菜单', { signature: 'menu.role|missing' })
  } else {
    if (menu.orientation !== 'vertical') bag.add('menu.orientation', '菜单 aria-orientation=' + menu.orientation + '（期望 vertical）', { signature: 'menu.orientation|' + menu.element })
    if (!menu.name) bag.add('menu.name', '菜单没有可访问名称（aria-label）', { signature: 'menu.name|' + menu.element })
    if (menu.ariaHidden !== 'false') bag.add('menu.exposed', '打开后 aria-hidden=' + menu.ariaHidden + '（期望 false）', { signature: 'menu.exposed|' + menu.element })
    if (menu.inert) bag.add('menu.inert', '打开后菜单仍是 inert', { signature: 'menu.inert|' + menu.element })
    if (!menu.visible) bag.add('menu.visible', '打开后菜单不可见', { signature: 'menu.visible|' + menu.element })
    const items = menu.items || []
    if (items.length < 5) bag.add('menu.items', '根菜单只有 ' + items.length + ' 个 role=menuitem（期望 >=5）', { signature: 'menu.items|' + menu.element })
    const roving = items.filter((item) => item.tabIndex === 0)
    if (roving.length !== 1) bag.add('menu.roving', '菜单 roving tabindex 异常：tabIndex=0 的项有 ' + roving.length + ' 个', { signature: 'menu.roving|' + menu.element })
    for (const item of items) if (!item.name) bag.add('menu.item-name', '菜单项没有可访问名称：' + item.element, { signature: 'menu.item-name|' + item.element })
    const submenus = items.filter((item) => item.hasPopup === 'menu')
    if (submenus.length < 2) bag.add('menu.submenu-aria', '带子菜单的菜单项应 >=2，实际 ' + submenus.length, { signature: 'menu.submenu-aria|' + menu.element })
  }
  const trigger = await evaluate(cdp, '(() => { const button = document.getElementById("pet-menu-button"); const pet = document.getElementById("pet"); return { buttonExpanded: button ? button.getAttribute("aria-expanded") : null, petRole: pet ? pet.getAttribute("role") : null, petHasPopup: pet ? pet.getAttribute("aria-haspopup") : null, petControls: pet ? pet.getAttribute("aria-controls") : null, petLabel: pet ? pet.getAttribute("aria-label") : null, menuId: document.getElementById("pet-shell-menu") ? document.getElementById("pet-shell-menu").id : null } })()')
  if (trigger.petRole !== 'button' || trigger.petHasPopup !== 'menu' || trigger.petControls !== 'pet-shell-menu' || !trigger.petLabel) bag.add('menu.trigger-aria', '角色触发器 ARIA 不完整：' + JSON.stringify(trigger), { signature: 'menu.trigger-aria|#pet' })
  if (trigger.buttonExpanded !== 'true') bag.add('menu.trigger-expanded', '菜单打开后 #pet-menu-button aria-expanded=' + trigger.buttonExpanded + '（期望 true）', { signature: 'menu.trigger-expanded|#pet-menu-button' })
  const focusInitial = await assertFocusInside(bag, cdp, '#pet-shell-menu', '菜单', 0)
  const firstIsItem = await evaluate(cdp, '!!(document.activeElement && document.activeElement.getAttribute("role") === "menuitem")')
  if (!firstIsItem) bag.add('menu.focus-first', '菜单打开后焦点不在 role=menuitem 上（active=' + focusInitial.active + '）', { signature: 'menu.focus-first|menu' })
  const focusBefore = await activeFocusFacts(cdp, '#pet-shell-menu')
  await pressArrow(cdp, 'ArrowDown')
  const focusDown = await activeFocusFacts(cdp, '#pet-shell-menu')
  await pressArrow(cdp, 'ArrowUp')
  const focusUp = await activeFocusFacts(cdp, '#pet-shell-menu')
  if (focusDown.key === focusBefore.key) bag.add('menu.arrow-down', 'ArrowDown 没有移动菜单焦点', { signature: 'menu.arrow-down|menu' })
  if (focusUp.key !== focusBefore.key) bag.add('menu.arrow-up', 'ArrowUp 没有回到上一个菜单项（' + focusUp.activeText + ' != ' + focusBefore.activeText + '）', { signature: 'menu.arrow-up|menu' })
  await pressArrow(cdp, 'Home')
  const focusHome = await activeFocusFacts(cdp, '#pet-shell-menu')
  await pressArrow(cdp, 'End')
  const focusEnd = await activeFocusFacts(cdp, '#pet-shell-menu')
  if (focusHome.key === focusEnd.key) bag.add('menu.home-end', 'Home/End 没有区分首尾菜单项', { signature: 'menu.home-end|menu' })
  const tabInside = await tabTrail(cdp, '#pet-shell-menu', 4, false)
  if (tabInside.escaped > 0) bag.add('focus.trap-escape', '菜单内 Tab 跑出菜单 ' + tabInside.escaped + ' 次', { signature: 'focus.trap-escape|menu' })
  await pressArrow(cdp, 'Home')
  const menuItemIndicator = await addFocusIndicatorFinding(bag, cdp, '菜单项（键盘焦点）')
  await pressArrow(cdp, 'Home')
  await pressArrow(cdp, 'ArrowDown')
  const submenuFocusBefore = await activeFocusFacts(cdp, '#pet-shell-menu')
  await pressArrow(cdp, 'ArrowRight')
  await waitFor(cdp, '[...document.querySelectorAll("#pet-shell-menu [role=menuitem]")].some(function (el) { return el.textContent.indexOf("返回") !== -1 })', 'submenu opened with ArrowRight')
  const submenuAudit = await auditScope(cdp, '#pet-shell-menu')
  addCommonAuditFindings(bag, submenuAudit, '菜单子级')
  const submenuFocus = await activeFocusFacts(cdp, '#pet-shell-menu')
  if (!submenuFocus.inside) bag.add('focus.submenu-entry', 'ArrowRight 进入子菜单后焦点掉到 body（active=' + submenuFocus.active + '）；desktop-shell.ts setMenuView 重渲染后必须恢复 roving 焦点（task-115）', { signature: 'focus.submenu-entry|menu' })
  else if (submenuFocus.activeRole !== 'menuitem') bag.add('focus.submenu-role', '进入子菜单后焦点不在 role=menuitem 上（active=' + submenuFocus.active + '）', { signature: 'focus.submenu-role|menu' })
  const submenuRoving = ((submenuAudit.menus || [])[0]?.items || []).filter((item) => item.tabIndex === 0)
  if (submenuRoving.length !== 1) bag.add('menu.roving-submenu', '子菜单 roving tabindex 异常：tabIndex=0 的项有 ' + submenuRoving.length + ' 个', { signature: 'menu.roving-submenu|submenu' })
  await evaluate(cdp, '(() => { const item = document.querySelector("#pet-shell-menu [role=menuitem]"); if (item) item.focus(); return true })()')
  await pressArrow(cdp, 'ArrowLeft')
  await waitFor(cdp, '[...document.querySelectorAll("#pet-shell-menu [role=menuitem]")].some(function (el) { return el.textContent.indexOf("角色与内容中心") !== -1 })', 'back to root menu with ArrowLeft')
  const restoredItem = await activeFocusFacts(cdp, '#pet-shell-menu')
  if (!restoredItem.inside) bag.add('focus.submenu-back', 'ArrowLeft 返回根菜单后焦点丢失（active=' + restoredItem.active + '）', { signature: 'focus.submenu-back|menu' })
  const scan = await scanContrast(cdp, '#pet-shell-menu')
  addContrastFindings(bag, scan, '菜单')
  const shot = captureScreenshots(cdp)
  await shot.shot('02-menu-open.png')
  await pressEscape(cdp)
  await waitFor(cdp, 'document.getElementById("pet-shell-menu").dataset.state === "closed"', 'menu closed by Escape')
  const restore = await evaluate(cdp, 'document.activeElement ? { id: document.activeElement.id, tag: document.activeElement.tagName } : null')
  if (!restore || restore.id !== 'pet') bag.add('focus.restore', '菜单 Escape 关闭后焦点没有回到 #pet（active=' + JSON.stringify(restore) + '）', { signature: 'focus.restore|menu' })
  return {
    findings: bag.items,
    evidence: {
      menu: summarizeAudit(audit),
      submenu: summarizeAudit(submenuAudit),
      trigger,
      focus: {
        initial: focusInitial,
        before: focusBefore,
        afterArrowDown: focusDown,
        afterArrowUp: focusUp,
        afterHome: focusHome,
        afterEnd: focusEnd,
        tabInside,
        menuItemIndicator,
        submenuBefore: submenuFocusBefore,
        submenuAfterArrowRight: submenuFocus,
        afterArrowLeftBack: restoredItem,
      },
      escapeRestore: restore,
      contrast: summarizeScan(scan),
      screenshots: shot.screenshots,
    },
  }
}

async function checkContentHub(cdp) {
  const bag = createFindings()
  await focusPage(cdp)
  await waitFor(cdp, 'document.getElementById("content-hub-root") && document.getElementById("content-hub-root").dataset.state === "open"', 'content hub open', Math.max(options.timeoutMs, 20000))
  const audit = await auditScope(cdp, '#content-hub-root')
  addCommonAuditFindings(bag, audit, '内容中心')
  const dialog = (audit.dialogs || [])[0] || null
  if (!dialog) {
    bag.add('hub.dialog', '内容中心没有 role=dialog 根节点', { signature: 'hub.dialog|missing' })
  } else {
    if (dialog.role !== 'dialog') bag.add('hub.dialog-role', '内容中心 role=' + dialog.role + '（期望 dialog）', { signature: 'hub.dialog-role|' + dialog.element })
    if (dialog.ariaModal !== 'true') bag.add('hub.dialog-modal', '内容中心 aria-modal=' + dialog.ariaModal + '（期望 true）', { signature: 'hub.dialog-modal|' + dialog.element })
    if (!dialog.labelledByText) bag.add('hub.dialog-label', '内容中心 aria-labelledby 无法解析出文本', { signature: 'hub.dialog-label|' + dialog.element })
    if (!dialog.visible) bag.add('hub.dialog-visible', '内容中心不可见', { signature: 'hub.dialog-visible|' + dialog.element })
  }
  const tablist = (audit.tablists || [])[0] || null
  if (!tablist) {
    bag.add('hub.tablist', '内容中心没有 role=tablist', { signature: 'hub.tablist|missing' })
  } else {
    if (!tablist.name) bag.add('hub.tablist-name', 'tablist 没有可访问名称', { signature: 'hub.tablist-name|' + tablist.element })
    if (tablist.tabs.length !== 4) bag.add('hub.tab-count', '内容中心 tab 数为 ' + tablist.tabs.length + '（期望 4）', { signature: 'hub.tab-count|' + tablist.element })
    const selected = tablist.tabs.filter((tab) => tab.selected === 'true')
    if (selected.length !== 1) bag.add('hub.tab-selected', 'aria-selected=true 的 tab 有 ' + selected.length + ' 个（期望 1）', { signature: 'hub.tab-selected|' + tablist.element })
    const roving = tablist.tabs.filter((tab) => tab.tabIndex === 0)
    if (roving.length !== 1) bag.add('hub.tab-roving', 'tab roving tabindex 异常：tabIndex=0 有 ' + roving.length + ' 个', { signature: 'hub.tab-roving|' + tablist.element })
    for (const tab of tablist.tabs) {
      if (!tab.name) bag.add('hub.tab-name', 'tab 缺少可访问名称：' + tab.element, { signature: 'hub.tab-name|' + tab.element })
      if (!tab.controlsExists) bag.add('hub.tab-controls', 'tab 的 aria-controls 目标不存在：' + tab.controlsId, { signature: 'hub.tab-controls|' + tab.element })
    }
  }
  const panel = (audit.tabpanels || [])[0] || null
  if (!panel) {
    bag.add('hub.tabpanel', '内容中心没有 role=tabpanel', { signature: 'hub.tabpanel|missing' })
  } else {
    if (!panel.labelledBy || !panel.labelledByText) bag.add('hub.tabpanel-label', 'tabpanel 的 aria-labelledby 无法解析', { signature: 'hub.tabpanel-label|' + panel.element })
    if (panel.tabIndex !== 0) bag.add('hub.tabpanel-tabindex', 'tabpanel tabIndex=' + panel.tabIndex + '（期望 0，键盘可达）', { signature: 'hub.tabpanel-tabindex|' + panel.element })
  }
  const feedbackLive = (audit.liveRegions || []).filter((region) => region.element.indexOf('content-hub-feedback') !== -1)
  if (feedbackLive.length !== 1) bag.add('hub.live-region', '内容中心反馈区没有 role=status/aria-live 区域', { signature: 'hub.live-region|missing' })
  else if (feedbackLive[0].ariaLive !== 'polite' && feedbackLive[0].role !== 'status') bag.add('hub.live-region-polite', '内容中心反馈区没有 polite live 语义', { signature: 'hub.live-region-polite|content-hub-feedback' })
  const focusInitial = await assertFocusInside(bag, cdp, '#content-hub-root', '内容中心', 0)
  const tabFocus = await evaluate(cdp, 'document.activeElement ? document.activeElement.getAttribute("role") : null')
  if (tabFocus !== 'tab') bag.add('hub.focus-tab', '内容中心打开后焦点不在 role=tab 上（' + tabFocus + '）', { signature: 'hub.focus-tab|content-hub' })
  const tabFactsBefore = await evaluate(cdp, '(() => { const tab = document.querySelector("#content-hub-root [role=tab][aria-selected=true]"); const panel = document.getElementById("content-hub-panel"); return { selectedId: tab ? tab.id : null, selectedName: tab ? tab.textContent.trim() : null, panelLabelledBy: panel ? panel.getAttribute("aria-labelledby") : null, activeId: document.activeElement ? document.activeElement.id : null } })()')
  await pressArrow(cdp, 'ArrowRight')
  const tabFactsAfterArrow = await evaluate(cdp, '(() => { const tab = document.querySelector("#content-hub-root [role=tab][aria-selected=true]"); const panel = document.getElementById("content-hub-panel"); return { selectedId: tab ? tab.id : null, selectedName: tab ? tab.textContent.trim() : null, panelLabelledBy: panel ? panel.getAttribute("aria-labelledby") : null, activeId: document.activeElement ? document.activeElement.id : null, activeRole: document.activeElement ? document.activeElement.getAttribute("role") : null } })()')
  if (tabFactsBefore.selectedId === tabFactsAfterArrow.selectedId) bag.add('hub.tab-arrow', 'ArrowRight 没有切换 tab', { signature: 'hub.tab-arrow|content-hub' })
  if (tabFactsAfterArrow.activeRole !== 'tab' || tabFactsAfterArrow.activeId !== tabFactsAfterArrow.selectedId) bag.add('hub.tab-arrow-focus', 'ArrowRight 后焦点与 aria-selected 不一致（active=' + tabFactsAfterArrow.activeId + ', selected=' + tabFactsAfterArrow.selectedId + '）', { signature: 'hub.tab-arrow-focus|content-hub' })
  if (tabFactsAfterArrow.panelLabelledBy !== tabFactsAfterArrow.selectedId) bag.add('hub.tabpanel-sync', 'tabpanel aria-labelledby 未跟随选中 tab（' + tabFactsAfterArrow.panelLabelledBy + ' != ' + tabFactsAfterArrow.selectedId + '）', { signature: 'hub.tabpanel-sync|content-hub' })
  await pressArrow(cdp, 'Home')
  const homeFacts = await evaluate(cdp, '(() => { const tab = document.querySelector("#content-hub-root [role=tab][aria-selected=true]"); return { selectedId: tab ? tab.id : null, activeId: document.activeElement ? document.activeElement.id : null } })()')
  await pressArrow(cdp, 'End')
  const endFacts = await evaluate(cdp, '(() => { const tab = document.querySelector("#content-hub-root [role=tab][aria-selected=true]"); return { selectedId: tab ? tab.id : null, activeId: document.activeElement ? document.activeElement.id : null } })()')
  if (homeFacts.selectedId === endFacts.selectedId) bag.add('hub.tab-home-end', 'Home/End 没有区分首尾 tab', { signature: 'hub.tab-home-end|content-hub' })
  const tabIndicator = await addFocusIndicatorFinding(bag, cdp, '内容中心 tab（键盘焦点）')
  await pressArrow(cdp, 'Home')
  const forwardTrail = await tabTrail(cdp, '#content-hub-root', 30, false)
  if (forwardTrail.escaped > 0) bag.add('focus.trap-escape', '内容中心 Tab 焦点跑出对话框 ' + forwardTrail.escaped + ' 次', { signature: 'focus.trap-escape|内容中心' })
  const forwardStalled = forwardTrail.trail.length > 3 && new Set(forwardTrail.trail.slice(1)).size === 1
  if (forwardStalled) bag.add('focus.tab-forward-stall', '（已知缺口）内容中心内 forward Tab 从 tabpanel 之后不再前进：焦点停在 #content-hub-panel，无法用 Tab 进入面板内按钮；Shift+Tab 可移动。建议 content-hub.ts onDocumentKeydown 对 panel 起始的 forward Tab 显式聚焦第一个可聚焦控件（本卡按授权不改业务 UI）。', { signature: 'focus.tab-forward-stall|content-hub', severity: 'known-gap', needsBusinessUiChange: true })
  const backwardTrail = await tabTrail(cdp, '#content-hub-root', 8, true)
  addTrapFindings(bag, backwardTrail, '内容中心（Shift+Tab）', 4)
  // Panel entry (task-115): forward Tab from the tabpanel itself must reach the
  // panel's own controls. The desktop shell hides the dialog header, so the old
  // trap focused a zero-layout 合上 button and focus stalled on the panel.
  const panelFocusStart = await evaluate(cdp, '(() => { const panel = document.getElementById("content-hub-panel"); if (!panel) return false; panel.focus(); return document.activeElement === panel })()')
  let panelEntry = null
  if (panelFocusStart === true) {
    await pressTab(cdp, false)
    panelEntry = await evaluate(cdp, '(() => { const panel = document.getElementById("content-hub-panel"); const active = document.activeElement; return { active: active ? (active.id || active.tagName) : null, inPanel: !!(panel && active && active !== panel && panel.contains(active)) } })()')
    if (!panelEntry.inPanel) bag.add('focus.panel-entry', 'Tab 从 tabpanel 无法进入面板内控件（焦点=' + (panelEntry ? panelEntry.active : '?') + '），面板内按钮键盘不可达', { signature: 'focus.panel-entry|content-hub' })
  }
  const scan = await scanContrast(cdp, '#content-hub-root')
  addContrastFindings(bag, scan, '内容中心')
  const shot = captureScreenshots(cdp)
  await shot.shot('03-content-hub.png')
  await pressEscape(cdp)
  await waitFor(cdp, 'document.getElementById("content-hub-root").dataset.state === "closed" && document.getElementById("content-hub-root").hidden === true', 'hub closed by Escape')
  await waitFor(cdp, 'document.getElementById("content-window-home").hidden === false', 'content window home visible after hub close')
  await clickSelector(cdp, '#content-window-open-hub', 'content window open hub')
  await waitFor(cdp, 'document.getElementById("content-hub-root").dataset.state === "open"', 'hub reopened from home button')
  await pressEscape(cdp)
  await waitFor(cdp, 'document.getElementById("content-hub-root").dataset.state === "closed"', 'hub closed again')
  const restore = await evaluate(cdp, 'document.activeElement ? document.activeElement.id : null')
  if (restore !== 'content-window-open-hub') bag.add('focus.restore', '内容中心 Escape 关闭后焦点没有回到打开按钮（active=' + restore + '）', { signature: 'focus.restore|content-hub' })
  return {
    findings: bag.items,
    evidence: {
      dialog,
      tablist,
      panel,
      feedbackLive,
      focus: { initial: focusInitial, tabFocus, forward: forwardTrail, forwardStalled, backward: backwardTrail, tabFactsBefore, tabFactsAfterArrow, homeFacts, endFacts, tabIndicator, panelEntry: { focused: panelFocusStart, afterTab: panelEntry } },
      escapeRestore: restore,
      contrast: summarizeScan(scan),
      screenshots: shot.screenshots,
    },
  }
}

async function checkSettingsDialog(cdp) {
  const bag = createFindings()
  await focusPage(cdp)
  await waitFor(cdp, 'document.getElementById("content-window-home") && document.getElementById("content-window-home").hidden === false', 'content window home before settings')
  await clickSelector(cdp, '#content-window-open-settings', 'content window open settings')
  await waitFor(cdp, 'document.getElementById("pet-settings") && document.getElementById("pet-settings").dataset.state === "open"', 'settings dialog open', Math.max(options.timeoutMs, 15000))
  const audit = await auditScope(cdp, '#pet-settings')
  addCommonAuditFindings(bag, audit, '设置对话框')
  const dialog = (audit.dialogs || [])[0] || null
  if (!dialog) {
    bag.add('settings.dialog', '设置弹窗没有 role=dialog 根节点', { signature: 'settings.dialog|missing' })
  } else {
    if (dialog.role !== 'dialog') bag.add('settings.dialog-role', '设置弹窗 role=' + dialog.role + '（期望 dialog）', { signature: 'settings.dialog-role|' + dialog.element })
    if (dialog.ariaModal !== 'true') bag.add('settings.dialog-modal', '设置弹窗 aria-modal=' + dialog.ariaModal + '（期望 true）', { signature: 'settings.dialog-modal|' + dialog.element })
    if (!dialog.labelledByText) bag.add('settings.dialog-label', '设置弹窗 aria-labelledby 无法解析出标题文本', { signature: 'settings.dialog-label|' + dialog.element })
    if (!dialog.visible) bag.add('settings.dialog-visible', '设置弹窗不可见', { signature: 'settings.dialog-visible|' + dialog.element })
  }
  const statusLive = (audit.liveRegions || []).filter((region) => region.element.indexOf('pet-settings-status') !== -1)
  if (statusLive.length !== 1) bag.add('settings.live-region', '设置状态没有 role=status/aria-live 区域', { signature: 'settings.live-region|missing' })
  else if (statusLive[0].ariaLive !== 'polite' || statusLive[0].role !== 'status') bag.add('settings.live-region-polite', '设置状态 live 语义应为 role=status + aria-live=polite', { signature: 'settings.live-region-polite|pet-settings-status' })
  const rangeFacts = await evaluate(cdp, '(() => { const range = document.getElementById("pet-settings-scale-global"); const status = document.getElementById("pet-settings-status"); const labels = range && range.labels ? Array.from(range.labels).map(function (label) { return label.textContent.trim() }) : []; return { hasRange: !!range, labels, ariaLabel: range ? range.getAttribute("aria-label") : null, min: range ? range.min : null, max: range ? range.max : null, value: range ? range.value : null, statusRole: status ? status.getAttribute("role") : null, statusLive: status ? status.getAttribute("aria-live") : null, statusText: status ? status.textContent.trim() : null } })()')
  if (!rangeFacts.hasRange) bag.add('settings.range', '设置弹窗缺少 #pet-settings-scale-global 滑杆', { signature: 'settings.range|missing' })
  else {
    const rangeName = (rangeFacts.labels && rangeFacts.labels.length > 0 ? rangeFacts.labels[0] : '') || rangeFacts.ariaLabel || ''
    if (!rangeName) bag.add('settings.range-name', '整体缩放滑杆没有 label 关联', { signature: 'settings.range-name|pet-settings-scale-global' })
    if (!(Number(rangeFacts.min) < Number(rangeFacts.max))) bag.add('settings.range-bounds', '滑杆 min/max 异常：' + rangeFacts.min + '/' + rangeFacts.max, { signature: 'settings.range-bounds|pet-settings-scale-global' })
  }
  const focusInitial = await assertFocusInside(bag, cdp, '#pet-settings', '设置弹窗', 0)
  const forwardTrail = await tabTrail(cdp, '#pet-settings', 50, false)
  addTrapFindings(bag, forwardTrail, '设置弹窗', 10)
  const backwardTrail = await tabTrail(cdp, '#pet-settings', 10, true)
  addTrapFindings(bag, backwardTrail, '设置弹窗（Shift+Tab）', 6)
  const rangeValueBefore = await evaluate(cdp, 'document.getElementById("pet-settings-scale-global") ? document.getElementById("pet-settings-scale-global").value : null')
  const statusBefore = await evaluate(cdp, '(function () { const status = document.getElementById("pet-settings-status"); return status ? status.textContent.trim() : null })()')
  await evaluate(cdp, 'document.getElementById("pet-settings-scale-global").focus()')
  await pressArrow(cdp, 'ArrowRight')
  await sleep(250)
  const rangeValueAfterKeyboard = await evaluate(cdp, 'document.getElementById("pet-settings-scale-global").value')
  const keyboardChanged = String(rangeValueAfterKeyboard) !== String(rangeValueBefore)
  if (!keyboardChanged) {
    bag.add('settings.range-keyboard', '（已知缺口，待复核）CDP 键盘 ArrowRight 未改变原生 range 值（鼠标点击可改）；原生 range 本应键盘可操作，需真机人工复核。本卡按授权不改业务 UI。', { signature: 'settings.range-keyboard|pet-settings-scale-global', severity: 'known-gap', needsBusinessUiChange: true })
  }
  const rangeIndicator = await addFocusIndicatorFinding(bag, cdp, '设置滑杆（键盘焦点）')
  // Live-region proof uses an explicit checkbox toggle (deterministic mouse
  // activation): the status element must announce the new state.
  const liveTrigger = { control: 'pet-settings-show-menu-button', checkedBefore: await evaluate(cdp, 'document.getElementById("pet-settings-show-menu-button") ? document.getElementById("pet-settings-show-menu-button").checked : null') }
  await clickSelector(cdp, '#pet-settings-show-menu-button', 'show menu button checkbox')
  const statusAfter = await waitFor(cdp, '(function () { const status = document.getElementById("pet-settings-status"); const text = status ? status.textContent.trim() : ""; return text && text !== ' + JSON.stringify(String(statusBefore || '')) + ' ? text : "" })()', 'aria-live status updated after an explicit control change', Math.max(options.timeoutMs, 8000))
  const rangeValueAfter = await evaluate(cdp, 'document.getElementById("pet-settings-scale-global") ? document.getElementById("pet-settings-scale-global").value : null')
  await clickSelector(cdp, '#pet-settings-scale-reset', 'reset scale')
  const scan = await scanContrast(cdp, '#pet-settings')
  addContrastFindings(bag, scan, '设置弹窗')
  const shot = captureScreenshots(cdp)
  await shot.shot('04-settings-dialog.png')
  await pressEscape(cdp)
  await waitFor(cdp, 'document.getElementById("pet-settings").dataset.state === "closed" && document.getElementById("pet-settings").getAttribute("aria-hidden") === "true"', 'settings closed by Escape')
  const inertAfter = await evaluate(cdp, 'document.getElementById("pet-settings").inert === true')
  if (inertAfter !== true) bag.add('settings.inert-closed', '关闭后设置弹窗没有恢复 inert', { signature: 'settings.inert-closed|pet-settings' })
  const restoreFacts = await evaluate(cdp, '(() => { const active = document.activeElement; const home = document.getElementById("content-window-home"); const visible = !!(active && active.offsetParent !== null); return { id: active ? active.id : null, tag: active ? active.tagName : null, visible, inHome: !!(home && active && home.contains(active)), focusLost: !active || active === document.body || active === document.documentElement } })()')
  if (restoreFacts.focusLost || !restoreFacts.visible) bag.add('focus.restore', '设置 Escape 关闭后焦点丢失（active=' + JSON.stringify(restoreFacts) + '）', { signature: 'focus.restore|settings' })
  const restore = restoreFacts.id
  return {
    findings: bag.items,
    evidence: {
      dialog,
      statusLive,
      range: Object.assign({}, rangeFacts, { valueBefore: rangeValueBefore, valueAfterKeyboard: rangeValueAfterKeyboard, keyboardChanged }),
      liveRegionUpdate: { statusBefore: statusBefore, statusAfter: statusAfter, trigger: liveTrigger.control, checkedBefore: liveTrigger.checkedBefore, checkedAfter: await evaluate(cdp, 'document.getElementById("pet-settings-show-menu-button") ? document.getElementById("pet-settings-show-menu-button").checked : null'), ariaLive: rangeFacts.statusLive, role: rangeFacts.statusRole },
      focus: { initial: focusInitial, forward: forwardTrail, backward: backwardTrail, rangeIndicator },
      close: { ariaHidden: true, inert: inertAfter, focusRestore: restore, focusRestoreFacts: restoreFacts },
      contrast: summarizeScan(scan),
      screenshots: shot.screenshots,
    },
  }
}

async function checkStatementPage(cdp) {
  const bag = createFindings()
  await focusPage(cdp)
  await waitFor(cdp, 'document.querySelector("main.setup") !== null', 'setup page main', Math.max(options.timeoutMs, 20000))
  try {
    await waitFor(cdp, 'document.getElementById("setup-age-status") && document.getElementById("setup-age-status").textContent.indexOf("正在读取") === -1', 'setup page legal status hydrates', 10000)
  } catch (error) {
    verbose('setup page status did not hydrate in time (recording it, not failing): ' + error.message)
  }
  const audit = await auditScope(cdp, 'main.setup')
  addCommonAuditFindings(bag, audit, '法务说明页')
  if (audit.lang !== 'zh-CN') bag.add('statement.lang', '法务说明页 html lang=' + audit.lang + '（期望 zh-CN）', { signature: 'statement.lang|html' })
  const pageFacts = await evaluate(cdp, '(() => { const mains = document.querySelectorAll("main").length; const h1s = document.querySelectorAll("main.setup h1").length; const h2s = document.querySelectorAll("main.setup h2").length; const alerts = Array.from(document.querySelectorAll("main.setup [role=alert]")).map(function (el) { return el.textContent.trim().slice(0, 80) }); const brokenLabelledBy = Array.from(document.querySelectorAll("main.setup [aria-labelledby]")).filter(function (el) { const raw = (el.getAttribute("aria-labelledby") || "").trim(); if (!raw) return true; return raw.split(" ").filter(Boolean).some(function (id) { return document.getElementById(id) === null }) }).map(function (el) { return el.className || el.tagName }); return { mains, h1s, h2s, alerts, brokenLabelledBy } })()')
  if (pageFacts.mains !== 1) bag.add('statement.main', '法务说明页 main 地标数量=' + pageFacts.mains + '（期望 1）', { signature: 'statement.main|missing' })
  if (pageFacts.h1s !== 1) bag.add('statement.h1', '法务说明页 h1 数量=' + pageFacts.h1s + '（期望 1）', { signature: 'statement.h1|count' })
  if (pageFacts.h2s < 6) bag.add('statement.h2', '法务说明页 h2 数量=' + pageFacts.h2s + '（期望 >=6 个分区标题）', { signature: 'statement.h2|count' })
  if (!pageFacts.alerts || pageFacts.alerts.length < 1) bag.add('statement.alert', '费用/风险提示没有 role=alert', { signature: 'statement.alert|missing' })
  for (const broken of pageFacts.brokenLabelledBy || []) bag.add('statement.labelledby', 'aria-labelledby 指向不存在的 id：' + broken, { signature: 'statement.labelledby|' + broken })
  const liveRegions = (audit.liveRegions || []).map((region) => ({ element: region.element, role: region.role, ariaLive: region.ariaLive, hidden: region.hiddenAttribute, visible: region.visible, text: region.text }))
  const expectedLive = [
    { key: 'setup-age-status', role: 'status' },
    { key: 'setup-consent-status', role: 'status' },
    { key: 'voice-record-status', role: 'status' },
  ]
  for (const expected of expectedLive) {
    const region = liveRegions.find((item) => item.element.indexOf(expected.key) !== -1)
    if (!region) {
      bag.add('statement.live-region', '法务说明页缺少 live region #' + expected.key, { signature: 'statement.live-region|' + expected.key })
      continue
    }
    if (region.role !== expected.role) bag.add('statement.live-region-role', '#' + expected.key + ' role=' + region.role + '（期望 ' + expected.role + '）', { signature: 'statement.live-region-role|' + expected.key })
    if (expected.key === 'voice-record-status' && region.ariaLive !== 'polite') bag.add('statement.live-region-live', '#voice-record-status aria-live=' + region.ariaLive + '（期望 polite）', { signature: 'statement.live-region-live|voice-record-status' })
  }
  const trail = await tabTrail(cdp, 'main.setup', 8, false)
  addTrapFindings(bag, trail, '法务说明页', 5)
  const indicator = await addFocusIndicatorFinding(bag, cdp, '法务说明页（键盘 Tab 焦点）')
  const scan = await scanContrast(cdp, 'main.setup')
  addContrastFindings(bag, scan, '法务说明页')
  const shot = captureScreenshots(cdp)
  await shot.shot('05-statement-page.png')
  return {
    findings: bag.items,
    evidence: {
      lang: audit.lang,
      title: audit.title,
      pageFacts,
      headings: audit.headings,
      liveRegions,
      focus: { trail, indicator },
      contrast: summarizeScan(scan),
      screenshots: shot.screenshots,
    },
  }
}

async function checkLiveRegions(cdp) {
  const bag = createFindings()
  const audit = await auditScope(cdp, 'body')
  const regions = (audit.liveRegions || []).map((region) => ({ element: region.element, role: region.role, ariaLive: region.ariaLive, hidden: region.hiddenAttribute, visible: region.visible, text: region.text }))
  const find = (name) => regions.find((region) => region.element.indexOf(name) !== -1) || null
  const expectations = [
    { key: 'pet-scale-label', role: null, ariaLive: 'polite', note: '缩放标签' },
    { key: 'hero-placeholder', role: 'status', ariaLive: 'polite', note: 'hero 加载/失败状态' },
    { key: 'advisers-status', role: null, ariaLive: 'polite', note: 'Advisers 只读状态' },
    { key: 'content-window-note', role: 'status', ariaLive: null, note: '内容窗口说明' },
  ]
  for (const expectation of expectations) {
    const region = find(expectation.key)
    if (!region) {
      bag.add('live-region.missing', '缺少 live region #' + expectation.key + '（' + expectation.note + '）', { signature: 'live-region.missing|#' + expectation.key })
      continue
    }
    if (expectation.role !== null && region.role !== expectation.role) bag.add('live-region.role', '#' + expectation.key + ' role=' + region.role + '（期望 ' + expectation.role + '）', { signature: 'live-region.role|#' + expectation.key })
    if (expectation.ariaLive !== null && region.ariaLive !== expectation.ariaLive) bag.add('live-region.aria-live', '#' + expectation.key + ' aria-live=' + region.ariaLive + '（期望 ' + expectation.ariaLive + '）', { signature: 'live-region.aria-live|#' + expectation.key })
  }
  const bubbleFacts = await evaluate(cdp, '(() => { const bubble = document.getElementById("bubble"); const text = document.getElementById("bubble-text"); const ai = document.getElementById("bubble-ai"); return { bubbleRole: bubble ? bubble.getAttribute("role") : null, bubbleLive: bubble ? bubble.getAttribute("aria-live") : null, bubbleAriaAtomic: bubble ? bubble.getAttribute("aria-atomic") : null, textRole: text ? text.getAttribute("role") : null, textLive: text ? text.getAttribute("aria-live") : null, textAriaAtomic: text ? text.getAttribute("aria-atomic") : null, aiRole: ai ? ai.getAttribute("role") : null } })()')
  const bubbleAnnounced = !!(bubbleFacts && (bubbleFacts.bubbleRole === 'status' || bubbleFacts.bubbleRole === 'log' || bubbleFacts.bubbleLive || bubbleFacts.textRole === 'status' || bubbleFacts.textLive))
  if (!bubbleAnnounced) {
    bag.add('live-region.missing', '桌宠气泡 #bubble/#bubble-text 没有 role=status/aria-live：读屏用户听不到桌宠回话（task-115 修复：不要把这条重新塞回 baseline）', { signature: 'live-region.missing|#bubble' })
  } else {
    // task-115: exactly one polite, atomic live owner, so every reply is read
    // once (the AI attribution note and the opacity show/hide must not re-read).
    const liveOwners = [bubbleFacts.bubbleLive ? '#bubble' : null, bubbleFacts.textLive ? '#bubble-text' : null].filter(Boolean)
    if (liveOwners.length > 1) bag.add('live-region.duplicate', '气泡内有 ' + liveOwners.length + ' 个 live region（' + liveOwners.join(' + ') + '）：同一条回话会被重复朗读', { signature: 'live-region.duplicate|bubble' })
    const bubbleLiveMode = bubbleFacts.textLive || bubbleFacts.bubbleLive
    if (bubbleLiveMode !== null && bubbleLiveMode !== undefined && bubbleLiveMode !== 'polite') bag.add('live-region.polite', '气泡 live region aria-live=' + bubbleLiveMode + '（期望 polite）', { signature: 'live-region.polite|bubble' })
    const bubbleAtomic = bubbleFacts.textAriaAtomic || bubbleFacts.bubbleAriaAtomic
    if (bubbleAtomic !== 'true') bag.add('live-region.atomic', '气泡 live region 缺少 aria-atomic=true（逐字重读风险）', { signature: 'live-region.atomic|bubble' })
  }
  const shot = captureScreenshots(cdp)
  await shot.shot('06-pet-live-regions.png')
  return {
    findings: bag.items,
    evidence: {
      regions,
      bubble: bubbleFacts,
      bubbleAnnounced,
      note: 'Functional live-region update for settings status is proven in settings-dialog; content-hub feedback region is asserted in content-hub; consent error region is unit-tested and not shown in the first-run TOS modal.',
      screenshots: shot.screenshots,
    },
  }
}

function maxCssDuration(value) {
  if (!value) return 0
  let max = 0
  for (const part of String(value).split(',')) {
    const parsed = Number.parseFloat(part.trim())
    if (Number.isFinite(parsed)) max = Math.max(max, parsed)
  }
  return max
}

async function checkReducedMotion(cdp) {
  const bag = createFindings()
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await waitFor(cdp, 'document.documentElement.dataset.reduceMotion === "1" && window.matchMedia("(prefers-reduced-motion: reduce)").matches === true', 'prefers-reduced-motion applied to the pet page', Math.max(options.timeoutMs, 10000))
  const facts = await evaluate(cdp, '(() => { const selectors = ["#pet-shell-menu", "#bubble", "#pet-settings", "button"]; const durations = {}; for (const selector of selectors) { const el = document.querySelector(selector); if (!el) { durations[selector] = null; continue; } const style = getComputedStyle(el); durations[selector] = { transitionDuration: style.transitionDuration, animationDuration: style.animationDuration, scrollBehavior: style.scrollBehavior }; } return { dataset: document.documentElement.dataset.reduceMotion, mediaMatches: window.matchMedia("(prefers-reduced-motion: reduce)").matches, durations, styleInjected: !!document.getElementById("pet-reduce-motion-style") } })()')
  if (facts.mediaMatches !== true) bag.add('reduced-motion.media', 'CDP 模拟后 matchMedia reduce 仍为 false', { signature: 'reduced-motion.media|page' })
  for (const selector of Object.keys(facts.durations || {})) {
    const entry = facts.durations[selector]
    if (!entry) continue
    const transition = maxCssDuration(entry.transitionDuration)
    const animation = maxCssDuration(entry.animationDuration)
    if (transition > 0.001) bag.add('reduced-motion.transition', selector + ' transition-duration=' + entry.transitionDuration + '（期望 <=0.001s）', { signature: 'reduced-motion.transition|' + selector })
    if (animation > 0.001) bag.add('reduced-motion.animation', selector + ' animation-duration=' + entry.animationDuration + '（期望 <=0.001s）', { signature: 'reduced-motion.animation|' + selector })
    if (entry.scrollBehavior !== 'auto') bag.add('reduced-motion.scroll', selector + ' scroll-behavior=' + entry.scrollBehavior + '（期望 auto）', { signature: 'reduced-motion.scroll|' + selector })
  }
  await evaluate(cdp, 'document.getElementById("pet").focus()')
  await pressEnter(cdp)
  await waitFor(cdp, 'document.getElementById("pet-shell-menu").dataset.state === "open"', 'menu opens under reduced motion')
  await pressEscape(cdp)
  await waitFor(cdp, 'document.getElementById("pet-shell-menu").dataset.state === "closed"', 'menu closes under reduced motion')
  await cdp.send('Emulation.setEmulatedMedia', { features: [] })
  await waitFor(cdp, 'document.documentElement.dataset.reduceMotion === "0"', 'prefers-reduced-motion reset to no-preference', Math.max(options.timeoutMs, 10000))
  const resetFacts = await evaluate(cdp, '(() => ({ dataset: document.documentElement.dataset.reduceMotion, mediaMatches: window.matchMedia("(prefers-reduced-motion: reduce)").matches }))()')
  return {
    findings: bag.items,
    evidence: { applied: facts, functionalParity: { menuOpenClose: true }, reset: resetFacts },
  }
}

async function checkPageDiagnostics(pageDiagnostics) {
  const exceptions = (pageDiagnostics || []).filter((entry) => entry.type === 'exception')
  const findings = []
  for (const entry of exceptions) {
    findings.push({ rule: 'page.exception', message: '未捕获页面异常 [' + entry.target + ']：' + entry.detail, signature: 'page.exception|' + entry.target + '|' + entry.detail })
  }
  return {
    findings,
    evidence: {
      total: (pageDiagnostics || []).length,
      exceptions: exceptions.length,
      logErrors: (pageDiagnostics || []).filter((entry) => entry.type === 'log-error').length,
      samples: (pageDiagnostics || []).slice(0, 10),
    },
  }
}

// ---------------------------------------------------------------------------
// Baseline + check runner.
// ---------------------------------------------------------------------------
function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) return { schema: 1, findings: [], exists: false, byKey: new Map() }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
  } catch (error) {
    throw setupError('a11y baseline is not valid JSON: ' + relToRoot(BASELINE_FILE) + ' - ' + error.message)
  }
  const findings = Array.isArray(parsed.findings) ? parsed.findings : []
  const byKey = new Map()
  for (const entry of findings) {
    if (!entry || typeof entry.check !== 'string' || typeof entry.signature !== 'string') {
      throw setupError('a11y baseline entries need {check, signature}: ' + JSON.stringify(entry).slice(0, 200))
    }
    byKey.set(entry.check + '|' + entry.signature, entry)
  }
  return { schema: parsed.schema || 1, findings, exists: true, byKey }
}
let baselineFinalized = false
function finalizeBaseline() {
  if (baselineFinalized) return
  baselineFinalized = true
  const stale = []
  for (const entry of baseline.findings) {
    const key = entry.check + '|' + entry.signature
    if (!baselineMatched.has(key)) stale.push(entry)
  }
  report.baseline.matched = baselineMatched.size
  report.baseline.stale = stale
  if (stale.length > 0) log('baseline: ' + stale.length + ' stale known-finding entries (fix landed? refresh scripts/a11y-contrast-baseline.json)')
}
async function runCheck(id, fn) {
  process.stdout.write('[a11y] ' + id + ' (' + CHECK_TITLES[id] + ') ... ')
  const checkStarted = performance.now()
  try {
    const result = await fn()
    const freshFindings = []
    const knownFindings = []
    for (const finding of result.findings || []) {
      const key = id + '|' + finding.signature
      if (baseline.byKey.has(key)) {
        baselineMatched.add(key)
        knownFindings.push(finding)
      } else {
        freshFindings.push(finding)
      }
    }
    const check = addCheckResult({ id, durationMs: Math.round(performance.now() - checkStarted), evidence: result.evidence, findings: freshFindings, knownFindings })
    console.log((check.ok ? 'PASS' : 'FAIL') + ' (' + check.durationMs + 'ms' + (knownFindings.length > 0 ? ', known=' + knownFindings.length : '') + ')')
    if (!check.ok) {
      for (const finding of freshFindings.slice(0, 6)) console.log('  - ' + finding.rule + ': ' + finding.message)
      if (freshFindings.length > 6) console.log('  - ... ' + (freshFindings.length - 6) + ' more findings (see report.json)')
    }
    return check
  } catch (error) {
    const check = failCheck(id, error, Math.round(performance.now() - checkStarted))
    console.log('FAIL: ' + (error && error.message ? error.message : String(error)))
    return check
  }
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
async function main() {
  const watchdog = setTimeout(() => { console.error('[a11y] watchdog: wall-clock limit exceeded'); process.exit(1) }, 300000)
  watchdog.unref()
  parseArgs(process.argv.slice(2))
  if (options.help) { usage(); return 0 }
  if (typeof WebSocket === 'undefined') throw setupError('Node global WebSocket is unavailable - use Node 22+')
  const dist = assertBuildPresent()
  const git = gitFacts()
  runDir = options.out ? resolve(ROOT, options.out) : join(ARTIFACT_ROOT, 'run-' + stamp())
  mkdirSync(runDir, { recursive: true })
  startedAt = Date.now()
  baseline = loadBaseline()
  report = buildReport()
  report.environment = {
    platform: PLATFORM,
    release: process.release ? process.release.name : 'node',
    node: process.version,
    wsl: IS_WSL,
    headless: !options.headed,
    mode: options.headed ? 'headed' : 'headless=new',
    viewport: { width: 760, height: 560 },
  }
  report.repo = git
  report.dist = { petMtime: new Date(dist.distMtime).toISOString(), newestSourceMtime: new Date(dist.newestSource).toISOString(), petSha256: dist.petSha256 }
  report.baseline = { path: relToRoot(BASELINE_FILE), exists: baseline.exists, knownCount: baseline.findings.length, matched: 0, stale: [] }
  report.artifactDir = relToRoot(runDir)
  const pageDiagnostics = []
  report.pageDiagnostics = pageDiagnostics
  let exitCode = 1
  try {
    server = await startStaticServer()
    verbose('static server ' + server.origin)
    chrome = await launchChrome(server.origin)
    report.chrome = { path: chrome.exe, browser: chrome.version.Browser, protocolVersion: chrome.version['Protocol-Version'], devtoolsPort: chrome.port }
    const bootstrapTarget = await waitTarget(chrome.port, (target) => target.type === 'page' && target.url.indexOf('__a11y-bootstrap.html') !== -1, 'bootstrap page')
    const bootstrapCdp = await attachTarget(bootstrapTarget, 'bootstrap')
    trackPageDiagnostics(bootstrapCdp, pageDiagnostics)

    const petTarget = await openPopup(bootstrapCdp, 'about:blank', 'a11y-pet-window', 'popup=yes,width=760,height=560')
    const petCdp = await attachTarget(petTarget, 'pet')
    trackPageDiagnostics(petCdp, pageDiagnostics)
    await petCdp.send('Page.navigate', { url: server.origin + '/pet.html?browser-fallback' })
    await waitDocumentReady(petCdp)
    await waitFor(petCdp, 'location.href.indexOf("pet.html") !== -1 && document.getElementById("pet") !== null', 'pet page loaded', Math.max(options.timeoutMs, 20000))
    log('pet page ready: ' + server.origin + '/pet.html?browser-fallback')

    await runCheck('consent-gate', () => checkConsentGate(petCdp))
    try {
      const chromeFacts = await dismissFirstRunChrome(petCdp)
      verbose('first-run chrome dismissed: ' + JSON.stringify(chromeFacts))
    } catch (error) {
      log('warning: first-run chrome dismissal skipped: ' + (error && error.message ? error.message : String(error)))
    }
    await runCheck('menu-surface', () => checkMenuSurface(petCdp))
    await runCheck('live-regions', () => checkLiveRegions(petCdp))
    await runCheck('reduced-motion', () => checkReducedMotion(petCdp))

    const contentTarget = await openPopup(bootstrapCdp, 'about:blank', 'a11y-content-window', 'popup=yes,width=760,height=560')
    const contentCdp = await attachTarget(contentTarget, 'content-window')
    trackPageDiagnostics(contentCdp, pageDiagnostics)
    await contentCdp.send('Emulation.setDeviceMetricsOverride', { width: 760, height: 560, deviceScaleFactor: 1, mobile: false })
    await contentCdp.send('Page.navigate', { url: server.origin + '/pet.html?browser-fallback&shell=content#content' })
    await waitDocumentReady(contentCdp)
    await waitFor(contentCdp, 'document.querySelectorAll(".consent-root").length === 0', 'content window boots without a consent modal', Math.max(options.timeoutMs, 20000))
    await waitFor(contentCdp, 'document.getElementById("content-hub-root") && document.getElementById("content-hub-root").dataset.state === "open"', 'content hub auto-opens in the content window', Math.max(options.timeoutMs, 30000))
    await runCheck('content-hub', () => checkContentHub(contentCdp))
    await runCheck('settings-dialog', () => checkSettingsDialog(contentCdp))

    const setupTarget = await openPopup(bootstrapCdp, 'about:blank', 'a11y-statement-page', 'popup=yes,width=1000,height=800')
    const setupCdp = await attachTarget(setupTarget, 'setup-page')
    trackPageDiagnostics(setupCdp, pageDiagnostics)
    await setupCdp.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 800, deviceScaleFactor: 1, mobile: false })
    await setupCdp.send('Page.navigate', { url: server.origin + '/setup.html' })
    await waitDocumentReady(setupCdp)
    await waitFor(setupCdp, 'document.querySelector("main.setup") !== null && document.getElementById("setup-age-status") !== null', 'setup statement page ready', Math.max(options.timeoutMs, 20000))
    await sleep(800)
    await runCheck('statement-page', () => checkStatementPage(setupCdp))
    await runCheck('page-diagnostics', () => checkPageDiagnostics(pageDiagnostics))
    report.screenshots = collectScreenshotPaths(runDir)
    report.ok = report.findings.length === 0
    finalizeBaseline()
    exitCode = report.ok ? 0 : 1
  } catch (error) {
    if (!report.error) report.error = error && error.message ? error.message : String(error)
    exitCode = error instanceof GateError ? error.exitCode : 1
    if (pageDiagnostics.length > 0) report.pageDiagnostics = pageDiagnostics
    throw error
  } finally {
    await stopChromeBrowser()
    if (report) {
      try {
        finalizeBaseline()
      } catch (error) {
        verbose('baseline finalize warning: ' + error.message)
      }
      const reportFile = writeReportFiles()
      log('report: ' + relToRoot(reportFile))
      log('RESULT: ' + (exitCode === 0 ? 'PASS (' + report.checks.filter((check) => check.ok).length + '/' + CHECK_IDS.length + ' checks, known findings: ' + report.knownFindings.length + ')' : 'FAIL (' + report.findings.length + ' new findings)'))
    }
  }
  return exitCode
}

function collectScreenshotPaths(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => name.endsWith('.png')).sort().map((name) => relToRoot(join(dir, name)))
}

main().then((code) => { process.exit(code) }).catch((error) => {
  const message = error && error.message ? error.message : String(error)
  if (error && error.exitCode === 2) {
    console.error('[a11y] setup error: ' + message)
    process.exit(2)
  }
  console.error('[a11y] FAILED: ' + message)
  process.exit(1)
})



