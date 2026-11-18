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
import { escapeHtml } from './security/html.ts'
import { trust } from './trust.ts'

export interface TinglanPreviewResult {
  readonly ok: boolean
  readonly reason?: string
}

const levelFor = (event: string): RuntimeLevel => (event === 'reminder.due' ? 'L2' : 'L1')

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
    const root = document.createElement('div')
    root.className = 'tinglan-preview'
    root.innerHTML = `
      <div class="tp-head">
        <div><p class="tp-kicker">FCI 0.3 · behavior preview</p><h2>${escapeHtml(displayName)} <span>· 无美术模式</span></h2></div>
        <span class="tp-warn">128 Q 美术未制作；此页只验证行为/接口</span>
      </div>
      <div class="tp-body">
        <div class="tp-actions">
          <button type="button" data-event="pat.head">摸头</button>
          <button type="button" data-event="pat.glasses">眼镜</button>
          <button type="button" data-event="pat.hand">手</button>
          <button type="button" data-event="pat.tablet">平板</button>
          <button type="button" data-event="pat.tail">尾巴</button>
          <button type="button" data-event="x-famling.pat.spam">连点</button>
          <button type="button" data-event="drag.start">拖起</button>
          <button type="button" data-event="drag.end">放下</button>
          <button type="button" data-event="hover.dwell">悬停</button>
          <button type="button" data-event="talk">说话</button>
          <button type="button" id="tp-focus">工作模式</button>
          <button type="button" id="tp-sleep">睡眠</button>
        </div>
        <div class="tp-hud">
          <div class="tp-state"><strong id="tp-state">idle</strong><span id="tp-tag">idle</span></div>
          <p id="tp-voice">（等待交互）</p>
          <p id="tp-gate" class="tp-muted"></p>
          <p id="tp-log" class="tp-muted"></p>
          <label><input type="checkbox" id="tp-brief" checked /> Brief 可用</label>
          <label><input type="checkbox" id="tp-muted" /> 静音（字幕仍显示）</label>
        </div>
      </div>`
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
