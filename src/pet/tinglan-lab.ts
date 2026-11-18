/**
 * Tinglan interaction lab — no character art required.
 *
 * Loads the real FCI 0.3 Tinglan document/behavior/voice lines, drives the
 * headless CharacterRuntime03, and exposes zones/idle/voice gate as clickable
 * controls. This is a developer/QA preview, not the shipping pet page.
 */
import { loadCharacterV03, type LoadedCharacterV03 } from './character/index.ts'
import { CharacterRuntime03, type RuntimeContext, type RuntimeLevel } from './character/runtime03.ts'

const q = <T extends Element>(selector: string): T => {
  const element = document.querySelector<T>(selector)
  if (!element) throw new Error(`missing element ${selector}`)
  return element
}

const zonesEl = q<HTMLDivElement>('#zones')
const stateEl = q<HTMLElement>('#state')
const tagEl = q<HTMLElement>('#tag')
const priorityEl = q<HTMLElement>('#priority')
const voiceEl = q<HTMLElement>('#voice')
const gateEl = q<HTMLElement>('#gate')
const logEl = q<HTMLOListElement>('#log')
const briefEl = q<HTMLInputElement>('#brief')
const mutedEl = q<HTMLInputElement>('#muted')

let loaded: LoadedCharacterV03 | undefined
let runtime: CharacterRuntime03 | undefined
let focusOn = false

const log = (message: string): void => {
  const li = document.createElement('li')
  li.textContent = message
  logEl.prepend(li)
  while (logEl.children.length > 12) logEl.lastElementChild?.remove()
}

const now = (): number => Date.now()

const context = (): RuntimeContext => ({
  nowMs: now(),
  muted: mutedEl.checked,
  briefAvailable: briefEl.checked,
  capabilities: briefEl.checked ? ['brief'] : [],
})

const levelFor = (event: string): RuntimeLevel => {
  if (event === 'reminder.due' || event === 'break.remind') return 'L2'
  if (event === 'scene.enter') return 'L2'
  return 'L1'
}

function renderZones(): void {
  if (!loaded) return
  zonesEl.replaceChildren()
  for (const zone of loaded.document.zones ?? []) {
    if (zone.shape.type !== 'rect' || zone.space !== 'normalized') continue
    const button = document.createElement('button')
    button.className = 'zone'
    button.type = 'button'
    button.textContent = zone.label ?? zone.id
    button.title = `${zone.id} → ${zone.on}`
    button.style.left = `${zone.shape.x * 100}%`
    button.style.top = `${zone.shape.y * 100}%`
    button.style.width = `${zone.shape.w * 100}%`
    button.style.height = `${zone.shape.h * 100}%`
    button.addEventListener('click', () => fire(zone.on))
    zonesEl.append(button)
  }
}

function updateHud(): void {
  if (!runtime) return
  stateEl.textContent = runtime.state
  tagEl.textContent = runtime.tag
  const stateDef = loaded?.behavior.states[runtime.state]
  priorityEl.textContent = `p${stateDef?.priority ?? 0}`
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-toggle]')) {
    const active = button.dataset.toggle === 'focus' ? focusOn : runtime.state === 'sleep'
    button.style.borderColor = active ? 'var(--accent)' : ''
  }
}

function fire(event: string, level: RuntimeLevel = levelFor(event)): void {
  if (!runtime) return
  const ctx = context()
  const decision = runtime.dispatch(event, ctx)
  const lineId = decision.voiceLineId
  if (decision.ignored) {
    gateEl.textContent = `ignored: ${decision.reason ?? ''}`
  } else if (lineId) {
    const gate = runtime.gateSpeech(level, lineId, ctx)
    const text = gate.text ?? ''
    voiceEl.textContent = text ? `“${text}”` : '（无台词）'
    gateEl.textContent = gate.allowed ? `${level} 放行` : `${level} 拦截：${gate.reason ?? ''}`
  } else {
    voiceEl.textContent = '（动作-only，无台词）'
    gateEl.textContent = ''
  }
  log(`${event} → ${decision.state}/${decision.tag}${lineId ? ` · ${lineId}` : ''}${decision.ignored ? ' (ignored)' : ''}`)
  updateHud()
}

function attachControls(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-event]')) {
    button.addEventListener('click', () => fire(button.dataset.event ?? 'pat.head'))
  }
  q<HTMLButtonElement>('#focus').addEventListener('click', () => {
    focusOn = !focusOn
    if (runtime) runtime.dispatch(focusOn ? 'brief.working' : 'wake', context())
    updateHud()
    log(focusOn ? 'focus on' : 'focus off')
  })
  q<HTMLButtonElement>('#sleep').addEventListener('click', () => {
    if (runtime) runtime.dispatch(runtime.state === 'sleep' ? 'wake.from_sleep' : 'sleep', context())
    updateHud()
  })
  q<HTMLButtonElement>('#reset').addEventListener('click', () => {
    if (!loaded) return
    runtime = new CharacterRuntime03(loaded.document, loaded.behavior, loaded.voiceLines, { rng: mulberry32(7) })
    focusOn = false
    logEl.replaceChildren()
    voiceEl.textContent = '（已重置）'
    gateEl.textContent = ''
    updateHud()
  })
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function main(): Promise<void> {
  try {
    loaded = await loadCharacterV03('/characters/tinglan/')
    runtime = new CharacterRuntime03(loaded.document, loaded.behavior, loaded.voiceLines, { rng: mulberry32(7) })
    renderZones()
    attachControls()
    updateHud()
    log('runtime loaded: FCI 0.3 · Tinglan (behavior-only)')
    window.setInterval(() => {
      if (!runtime) return
      const result = runtime.tick(context())
      if (result.idle) log(`idle → ${result.idle}`)
      updateHud()
    }, 1000)
  } catch (error) {
    voiceEl.textContent = `加载失败：${String(error)}`
    gateEl.textContent = '请用 npm run dev 打开 /tinglan-lab.html；构建产物需包含 public/characters/tinglan。'
  }
}

void main()
