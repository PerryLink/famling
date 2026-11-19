/**
 * Tinglan preview for the real pet page (`?hero=1&character=tinglan`).
 *
 * Tinglan has no 128 Q art yet, so this branch deliberately does NOT render a
 * character. It loads the real FCI 0.3 document/behavior/voice lines and shows
 * a compact interaction HUD inside `.hero-stage` so the page can exercise the
 * 0.3 runtime end-to-end (zones, priority, idle, voice gate) without fake art.
 * The existing 0.1/0.2 hero canvas path is untouched.
 */
import { loadCharacterV03, type LoadedCharacterV03 } from './character/index.ts'
import { CharacterRuntime03, type RuntimeContext, type RuntimeLevel } from './character/runtime03.ts'
import { trust } from './trust.ts'

export interface TinglanPreviewResult {
  readonly ok: boolean
  readonly reason?: string
}

const levelFor = (event: string): RuntimeLevel => (event === 'reminder.due' ? 'L2' : 'L1')

function textParagraph(doc: Document, text: string, className = ''): HTMLParagraphElement {
  const paragraph = doc.createElement('p')
  if (className) paragraph.className = className
  paragraph.textContent = text
  return paragraph
}

function previewButton(doc: Document, label: string, options: { event?: string; id?: string }): HTMLButtonElement {
  const button = doc.createElement('button')
  button.type = 'button'
  if (options.id) button.id = options.id
  if (options.event) button.dataset.event = options.event
  button.textContent = label
  return button
}

function previewCheckbox(doc: Document, id: string, labelText: string, checked: boolean): HTMLLabelElement {
  const label = doc.createElement('label')
  const input = doc.createElement('input')
  input.type = 'checkbox'
  input.id = id
  input.checked = checked
  label.append(input, labelText)
  return label
}

/** Build the behavior-only preview panel with text nodes (never innerHTML). */
export function createTinglanPreviewDom(doc: Document, displayName: string): HTMLElement {
  const root = doc.createElement('div')
  root.className = 'tinglan-preview'

  const head = doc.createElement('div')
  head.className = 'tp-head'
  const heading = doc.createElement('div')
  heading.appendChild(textParagraph(doc, 'FCI 0.3 · behavior preview', 'tp-kicker'))
  const title = doc.createElement('h2')
  const titleSuffix = doc.createElement('span')
  titleSuffix.textContent = '· 无美术模式'
  title.append(displayName, ' ', titleSuffix)
  heading.appendChild(title)
  const warning = doc.createElement('span')
  warning.className = 'tp-warn'
  warning.textContent = '128 Q 美术/baked voice 未制作；此页只验证行为/语音接口'
  head.append(heading, warning)

  const body = doc.createElement('div')
  body.className = 'tp-body'
  const actions = doc.createElement('div')
  actions.className = 'tp-actions'
  const events: Array<[event: string, label: string]> = [
    ['pat.head', '摸头'],
    ['pat.glasses', '眼镜'],
    ['pat.hand', '手'],
    ['pat.tablet', '平板'],
    ['pat.tail', '尾巴'],
    ['x-famling.pat.spam', '连点'],
    ['drag.start', '拖起'],
    ['drag.end', '放下'],
    ['hover.dwell', '悬停'],
    ['talk', '说话'],
  ]
  for (const [event, label] of events) actions.appendChild(previewButton(doc, label, { event }))
  actions.append(
    previewButton(doc, '工作模式', { id: 'tp-focus' }),
    previewButton(doc, '睡眠', { id: 'tp-sleep' }),
  )

  const hud = doc.createElement('div')
  hud.className = 'tp-hud'
  const state = doc.createElement('div')
  state.className = 'tp-state'
  const stateValue = doc.createElement('strong')
  stateValue.id = 'tp-state'
  stateValue.textContent = 'idle'
  const tagValue = doc.createElement('span')
  tagValue.id = 'tp-tag'
  tagValue.textContent = 'idle'
  state.append(stateValue, tagValue)

  const voice = textParagraph(doc, '（等待交互）')
  voice.id = 'tp-voice'
  const gate = textParagraph(doc, '', 'tp-muted')
  gate.id = 'tp-gate'
  const log = textParagraph(doc, '', 'tp-muted')
  log.id = 'tp-log'

  hud.append(
    state,
    voice,
    gate,
    log,
    previewCheckbox(doc, 'tp-brief', ' Brief 可用', true),
    previewCheckbox(doc, 'tp-muted', ' 静音（字幕仍显示）', false),
  )
  body.append(actions, hud)
  root.append(head, body)
  return root
}

/**
 * CONSENT / TOS GATE (do not bypass): this is a DLC/character-pack preview entry
 * (non-built-in `?character=` ids). `main.ts` must call it through
 * `loadCharacterPackWithConsent()` so the full TOS is shown and audited on every
 * load; declining must keep the default built-in pet. Mod/DLC authors must keep
 * this gate and the disclaimer, must not use it illegally, and must declare
 * content/licence/source for any pack.
 */
export async function startTinglanPreview(stage: HTMLElement, characterDir = '/characters/tinglan/'): Promise<TinglanPreviewResult> {
  try {
    const loaded: LoadedCharacterV03 = await loadCharacterV03(characterDir)
    // DLC description safety: pack metadata is external content. Review it before
    // it is rendered/indexed; a held description falls back to the built-in pet.
    const rawName = String(loaded.document.meta?.name ?? loaded.document.id)
    const rawDescription = typeof loaded.document.meta?.description === 'string' ? loaded.document.meta.description : ''
    const dlcReview = await trust.reviewDlcForDisplay([rawName, rawDescription].filter(Boolean).join(' · '))
    if (!dlcReview.allowed) {
      stage.hidden = true
      return { ok: false, reason: 'dlc-description-blocked' }
    }
    const displayName = dlcReview.text || rawName
    let runtime = new CharacterRuntime03(loaded.document, loaded.behavior, loaded.voiceLines, { rng: seeded(7) })
    const brief = { value: true }
    const muted = { value: false }
    const log: string[] = []
    let focus = false

    stage.classList.add('hero-stage--preview')
    stage.hidden = false
    stage.replaceChildren()
    // Pack metadata is external content: construct text nodes only (no
    // innerHTML), so a hostile DLC name can never become markup.
    const root = createTinglanPreviewDom(document, displayName)
    stage.append(root)

    const stateEl = root.querySelector<HTMLElement>('#tp-state')
    const tagEl = root.querySelector<HTMLElement>('#tp-tag')
    const voiceEl = root.querySelector<HTMLElement>('#tp-voice')
    const gateEl = root.querySelector<HTMLElement>('#tp-gate')
    const logEl = root.querySelector<HTMLElement>('#tp-log')
    const briefEl = root.querySelector<HTMLInputElement>('#tp-brief')
    const mutedEl = root.querySelector<HTMLInputElement>('#tp-muted')
    if (!stateEl || !tagEl || !voiceEl || !gateEl || !logEl || !briefEl || !mutedEl) throw new Error('preview DOM incomplete')

    const context = (): RuntimeContext => ({
      nowMs: Date.now(),
      muted: mutedEl.checked,
      briefAvailable: briefEl.checked,
      capabilities: briefEl.checked ? ['brief'] : [],
    })
    const update = (): void => {
      stateEl.textContent = runtime.state
      tagEl.textContent = runtime.tag
      logEl.textContent = log.slice(-4).join(' · ')
      brief.value = briefEl.checked
      muted.value = mutedEl.checked
    }
    const fire = (event: string): void => {
      const ctx = context()
      const decision = runtime.dispatch(event, ctx)
      if (decision.ignored) {
        gateEl.textContent = `ignored: ${decision.reason ?? ''}`
      } else if (decision.voiceLineId) {
        const gate = runtime.gateSpeech(levelFor(event), decision.voiceLineId, ctx)
        voiceEl.textContent = gate.text ? `“${gate.text}”` : '（无台词）'
        gateEl.textContent = gate.allowed ? 'voice allowed' : `voice blocked: ${gate.reason ?? ''}`
      } else {
        voiceEl.textContent = '（动作-only）'
        gateEl.textContent = ''
      }
      log.push(`${event}→${decision.state}/${decision.tag}`)
      if (log.length > 8) log.shift()
      update()
    }

    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-event]')) {
      button.addEventListener('click', () => fire(button.dataset.event ?? 'pat.head'))
    }
    root.querySelector<HTMLButtonElement>('#tp-focus')?.addEventListener('click', () => {
      focus = !focus
      runtime.dispatch(focus ? 'brief.working' : 'wake', context())
      update()
    })
    root.querySelector<HTMLButtonElement>('#tp-sleep')?.addEventListener('click', () => {
      runtime.dispatch(runtime.state === 'sleep' ? 'wake.from_sleep' : 'sleep', context())
      update()
    })
    window.setInterval(() => {
      const tick = runtime.tick(context())
      if (tick.idle) log.push(`idle→${tick.idle}`)
      update()
    }, 1000)
    update()
    return { ok: true }
  } catch (error) {
    stage.hidden = true
    return { ok: false, reason: `tinglan-preview-failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}

function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
