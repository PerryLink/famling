/**
 * 「内容日历 · 今天」 settings panel (B2 2026-11-21).
 *
 * A deliberately small, manual-only surface inside the existing 桌面设置 dialog:
 *
 * - one collapsed row (button) — no always-on card, no new window, no network;
 * - expanding it shows today's canonical node(s) + the one line for the live
 *   character/channel, a copy button, the next seven nodes and the local custom
 *   key-day editor (MM-DD + short plain-text label, at most eight entries);
 * - nothing here speaks, bubbles, schedules or fetches: the user must open it.
 *   quiet hours / 减少动态 only affect AUTOMATIC output, so the view stays
 *   manually reachable there; it explains that in the panel.
 *
 * The module is DOM-injected (document/window + read source) so Node tests drive
 * it with the shared fake DOM. All dynamic strings use textContent.
 */
import {
  CONTENT_CUSTOM_DAYS_LIMITS,
  addContentCustomKeyDay,
  readContentCustomDays,
  removeContentCustomKeyDay,
  writeContentCustomDays,
  type ContentCustomKeyDay,
} from './content-library.ts'
import {
  buildContentCalendarToday,
  contentCalendarTodayAvailable,
  readContentCalendarTodaySource,
  type ContentCalendarTodayView,
} from './content-calendar-today.ts'
import type { CalendarOccasionKind } from './calendar-events.ts'

/** Stable element ids so tests and CSS never depend on markup order. */
export const CONTENT_CALENDAR_TODAY_IDS = Object.freeze({
  open: 'pet-settings-content-calendar-today',
  panel: 'pet-settings-calendar-today',
  body: 'pet-settings-calendar-today-body',
  date: 'pet-settings-calendar-today-date',
  nodes: 'pet-settings-calendar-today-nodes',
  line: 'pet-settings-calendar-today-line',
  meta: 'pet-settings-calendar-today-meta',
  copy: 'pet-settings-calendar-today-copy',
  close: 'pet-settings-calendar-today-close',
  upcoming: 'pet-settings-calendar-today-upcoming',
  dayDate: 'pet-settings-calendar-day-date',
  dayLabel: 'pet-settings-calendar-day-label',
  daySave: 'pet-settings-calendar-day-save',
  dayList: 'pet-settings-calendar-day-list',
  feedback: 'pet-settings-calendar-feedback',
})

const OCCASION_KIND_LABELS: Readonly<Record<CalendarOccasionKind, string>> = Object.freeze({
  festival: '节日',
  season: '季节',
  'day-kind': '一周',
})

const CHANNEL_LABELS = Object.freeze({ ambient: '自动气泡', interactive: '主动互动' } as const)

/** Minimal clipboard surface; the real WebView has one, Node/fake tests may not. */
interface CalendarClipboardWindow {
  readonly navigator?: {
    readonly clipboard?: {
      writeText?: (value: string) => Promise<void>
    }
  }
}

export interface ContentCalendarTodayPanelOptions {
  readonly document: Document
  /** The shell window (clipboard access is optional; absent = no clipboard). */
  readonly window?: Window | null
  /** Live 内容日历 ON/OFF setting (the same flag the ambient overlay reads). */
  readonly getEnabled: () => boolean
  /** Injected clock for deterministic tests; production reads the real clock. */
  readonly getNow?: () => Date
  /** Usage telemetry hook (the shell records 'settings-change'); optional. */
  readonly onRecordUsage?: () => void
}

export interface ContentCalendarTodayPanel {
  /** The settings-field wrapper to append to the 安静 group. */
  readonly field: HTMLElement
  readonly button: HTMLButtonElement
  readonly panel: HTMLElement
  /** Re-read the live state: hide the row when ineligible, re-render when open. */
  refresh(): void
  open(): void
  close(): void
  isOpen(): boolean
}

function monthDayOf(clock: Date): string {
  const time = clock instanceof Date && !Number.isNaN(clock.getTime()) ? clock : new Date()
  const month = time.getMonth() + 1
  const day = time.getDate()
  return (month < 10 ? '0' + month : String(month)) + '-' + (day < 10 ? '0' + day : String(day))
}

const HIDDEN_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  disabled: '内容日历已关闭：可在上方开关重新开启。',
  'no-calendar-data': '当前内容目录没有日历数据（旧目录继续按原样工作）。',
  'invalid-date': '读取不到当前日期，暂时无法显示今天的内容日历。',
})

/**
 * Build the 「内容日历 · 今天」 settings field. The caller appends
 * `panel.field` to the existing settings group and calls `refresh()` whenever
 * the group's state changes (dialog open / switch toggle / content runtime load).
 */
export function createContentCalendarTodayPanel(options: ContentCalendarTodayPanelOptions): ContentCalendarTodayPanel {
  const doc = options.document
  const win = options.window ?? null
  const ids = CONTENT_CALENDAR_TODAY_IDS
  let currentLine: string | null = null

  const field = doc.createElement('div')
  field.className = 'pet-settings-field pet-settings-calendar-today-field'

  const toggle = doc.createElement('button') as HTMLButtonElement
  toggle.id = ids.open
  toggle.type = 'button'
  toggle.className = 'pet-settings-action pet-settings-calendar-today-open'
  toggle.textContent = '内容日历 · 今天…'
  toggle.hidden = true
  toggle.setAttribute('aria-expanded', 'false')
  toggle.setAttribute('aria-controls', ids.panel)

  const panel = doc.createElement('div')
  panel.id = ids.panel
  panel.className = 'pet-settings-calendar-today'
  panel.hidden = true
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', '内容日历 · 今天')

  const body = doc.createElement('div')
  body.id = ids.body
  body.className = 'pet-settings-calendar-body'

  const feedback = doc.createElement('p')
  feedback.id = ids.feedback
  feedback.className = 'pet-settings-calendar-feedback'
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')

  panel.append(body, feedback)
  field.append(toggle, panel)

  const paragraph = (className: string, text: string): HTMLElement => {
    const node = doc.createElement('p')
    node.className = className
    node.textContent = text
    return node
  }

  const actionButton = (id: string, label: string, onClick: () => void): HTMLButtonElement => {
    const node = doc.createElement('button') as HTMLButtonElement
    node.id = id
    node.type = 'button'
    node.className = 'pet-settings-action pet-settings-calendar-action'
    node.textContent = label
    node.addEventListener('click', (event) => {
      // Do not let a nested action bubble into the dialog backdrop/close paths.
      event.stopPropagation()
      onClick()
    })
    return node
  }

  const byId = <T extends HTMLElement>(id: string): T | null => doc.getElementById(id) as T | null

  const setFeedback = (text: string): void => {
    feedback.textContent = text
  }

  const isOpen = (): boolean => panel.hidden === false

  const close = (): void => {
    const active = doc.activeElement
    panel.hidden = true
    toggle.setAttribute('aria-expanded', 'false')
    setFeedback('')
    // Keep keyboard focus on a visible control when the open panel collapses.
    if (active !== null && panel.contains(active)) toggle.focus()
  }

  const currentClock = (): Date => (options.getNow === undefined ? new Date() : options.getNow())

  const copyText = async (text: string): Promise<boolean> => {
    const clipboardWindow = win as unknown as CalendarClipboardWindow | null
    const clipboard = clipboardWindow?.navigator?.clipboard
    if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
      try {
        await clipboard.writeText(text)
        return true
      } catch {
        // fall through to the DOM copy fallback
      }
    }
    try {
      const area = doc.createElement('textarea') as HTMLTextAreaElement
      area.value = text
      area.setAttribute('readonly', '')
      area.className = 'pet-settings-calendar-copy-area'
      doc.body.append(area)
      area.select?.()
      const exec = (doc as unknown as { execCommand?: (command: string) => boolean }).execCommand
      const copied = typeof exec === 'function' ? exec.call(doc, 'copy') === true : false
      area.remove()
      return copied
    } catch {
      return false
    }
  }

  const copyCurrentLine = (): void => {
    if (currentLine === null) {
      setFeedback('当前没有可复制的台词。')
      return
    }
    void copyText(currentLine).then((ok) => {
      setFeedback(ok ? '已复制到本机剪贴板。' : '复制不可用，请手动选择文本。')
    })
  }

  const saveCustomDay = (): void => {
    const dateInput = byId<HTMLInputElement>(ids.dayDate)
    const labelInput = byId<HTMLInputElement>(ids.dayLabel)
    const mutation = addContentCustomKeyDay(
      readContentCustomDays(),
      dateInput === null ? '' : dateInput.value,
      labelInput === null ? '' : labelInput.value,
    )
    if (!mutation.ok) {
      const message =
        mutation.error === 'invalid-date'
          ? '日期需要真实的 MM-DD（例如 03-08），不接受年份或 02-30。'
          : mutation.error === 'invalid-label'
            ? '标签需要 1–' + CONTENT_CUSTOM_DAYS_LIMITS.maxLabelChars + ' 个纯文字字符（不能含 < > 或换行）。'
            : '最多保存 ' + CONTENT_CUSTOM_DAYS_LIMITS.maxDays + ' 条自定义关键日，请先删除一条。'
      setFeedback(message)
      return
    }
    const savedDate = dateInput === null ? '' : dateInput.value.trim()
    const saved = mutation.days.find((day) => day.date === savedDate) ?? null
    const written = writeContentCustomDays(mutation.days)
    if (!written.ok) {
      setFeedback('保存失败：本机存储不可用或空间不足。')
      return
    }
    options.onRecordUsage?.()
    render()
    setFeedback('已保存：' + (saved === null ? savedDate : saved.date + ' · ' + saved.label) + '。当天会优先说「今天是 <标签>」。')
  }

  const removeCustomDay = (date: string): void => {
    const removal = removeContentCustomKeyDay(readContentCustomDays(), date)
    if (!removal.removed) {
      setFeedback('没有找到这条关键日。')
      render()
      return
    }
    const written = writeContentCustomDays(removal.days)
    if (!written.ok) {
      setFeedback('删除失败：本机存储不可用。')
      return
    }
    options.onRecordUsage?.()
    render()
    setFeedback('已删除：' + date + '。')
  }

  const buildCustomDaySection = (customDays: readonly ContentCustomKeyDay[], clock: Date): HTMLElement => {
    const section = doc.createElement('div')
    section.className = 'pet-settings-calendar-custom'
    section.append(paragraph('pet-settings-calendar-subtitle', '自定义关键日（最多 ' + CONTENT_CUSTOM_DAYS_LIMITS.maxDays + ' 条）'))
    section.append(
      paragraph(
        'pet-settings-note',
        '只保存在本机，纯文字不超过 ' +
          CONTENT_CUSTOM_DAYS_LIMITS.maxLabelChars +
          ' 个字符。当天在「今天」和自动气泡里优先说一句「今天是 <标签>」，标签只替换台词、不写历史、不提醒、不计连续天数。',
      ),
    )
    const form = doc.createElement('div')
    form.className = 'pet-settings-calendar-form'
    const dateInput = doc.createElement('input') as HTMLInputElement
    dateInput.id = ids.dayDate
    dateInput.type = 'text'
    dateInput.className = 'pet-settings-calendar-input'
    dateInput.setAttribute('maxlength', '5')
    dateInput.setAttribute('placeholder', 'MM-DD')
    dateInput.setAttribute('aria-label', '关键日日期（MM-DD）')
    dateInput.value = monthDayOf(clock)
    const labelInput = doc.createElement('input') as HTMLInputElement
    labelInput.id = ids.dayLabel
    labelInput.type = 'text'
    labelInput.className = 'pet-settings-calendar-input'
    labelInput.setAttribute('maxlength', String(CONTENT_CUSTOM_DAYS_LIMITS.maxLabelChars))
    labelInput.setAttribute('placeholder', '例如：生日')
    labelInput.setAttribute('aria-label', '关键日标签')
    const saveButton = actionButton(ids.daySave, '保存关键日', saveCustomDay)
    form.append(dateInput, labelInput, saveButton)
    section.append(form)
    const list = doc.createElement('div')
    list.id = ids.dayList
    list.className = 'pet-settings-calendar-days'
    if (customDays.length === 0) {
      list.append(paragraph('pet-settings-note', '还没有自定义关键日。'))
    } else {
      for (const day of customDays) {
        const row = doc.createElement('div')
        row.className = 'pet-settings-calendar-day-row'
        row.append(paragraph('pet-settings-calendar-day-text', day.date + ' · ' + day.label))
        row.append(actionButton('pet-settings-calendar-day-remove-' + day.date, '删除', () => removeCustomDay(day.date)))
        list.append(row)
      }
    }
    section.append(list)
    return section
  }

  const render = (): void => {
    body.replaceChildren()
    setFeedback('')
    currentLine = null
    const source = readContentCalendarTodaySource()
    const clock = currentClock()
    const customDays = readContentCustomDays()
    const view: ContentCalendarTodayView = buildContentCalendarToday({
      library: source === null ? null : source.library,
      characterId: source === null ? null : source.characterId,
      dialogueMode: source === null ? null : source.dialogueMode,
      enabled: options.getEnabled(),
      now: clock,
      customDays,
    })
    if (!view.visible || view.reason !== 'ready' || view.date === null) {
      body.append(paragraph('pet-settings-note', HIDDEN_MESSAGES[view.reason] ?? HIDDEN_MESSAGES['no-calendar-data']!))
      return
    }
    const head = doc.createElement('div')
    head.className = 'pet-settings-calendar-head'
    const dateLine = paragraph('pet-settings-calendar-date', '今天 · ' + view.date)
    dateLine.id = ids.date
    head.append(
      dateLine,
      // Closing a disclosure must return focus to its toggle deterministically;
      // do not rely on the browser having focused the clicked button first.
      actionButton(ids.close, '关闭', () => {
        close()
        toggle.focus()
      }),
    )
    body.append(head)

    const nodeTexts = view.nodes.map((node) => OCCASION_KIND_LABELS[node.kind] + '：' + node.name)
    if (view.customDay !== null) nodeTexts.unshift('自定义关键日：' + view.customDay.label)
    const nodesLine = paragraph(
      'pet-settings-calendar-nodes',
      nodeTexts.length === 0 ? '今天没有匹配的节日 / 季节 / 工作日节点。' : '今天节点：' + nodeTexts.join(' · '),
    )
    nodesLine.id = ids.nodes
    body.append(nodesLine)

    if (view.line === null) {
      body.append(paragraph('pet-settings-note', '当前角色 / 对话模式下没有可用台词；节点照常显示。'))
    } else {
      const quote = paragraph('pet-settings-calendar-line', '“' + view.line.text + '”')
      quote.id = ids.line
      const meta = paragraph(
        'pet-settings-note',
        (view.line.source === 'custom-day' ? '本机合成句（不联网、不写历史）' : (view.line.characterName ?? '当前角色')) +
          ' · ' +
          CHANNEL_LABELS[view.line.channel],
      )
      meta.id = ids.meta
      const actions = doc.createElement('div')
      actions.className = 'pet-settings-calendar-actions'
      actions.append(actionButton(ids.copy, '复制这一句', copyCurrentLine))
      body.append(quote, meta, actions)
      currentLine = view.line.text
    }

    body.append(paragraph('pet-settings-calendar-subtitle', '接下来 ' + view.upcoming.length + ' 个节点'))
    const list = doc.createElement('ul')
    list.id = ids.upcoming
    list.className = 'pet-settings-calendar-upcoming'
    for (const node of view.upcoming) {
      const item = doc.createElement('li')
      item.textContent = node.date + ' · ' + node.name + '（' + node.inDays + ' 天后）'
      list.append(item)
    }
    body.append(list)
    body.append(buildCustomDaySection(customDays, clock))
    body.append(
      paragraph(
        'pet-settings-note',
        '只有你手动打开时才会出现；安静时段 / 减少动态只影响自动气泡，这个页面不会主动弹出、不联网、不写历史、不提醒。',
      ),
    )
  }

  const open = (): void => {
    if (toggle.hidden) return
    panel.hidden = false
    toggle.setAttribute('aria-expanded', 'true')
    render()
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation()
    if (isOpen()) close()
    else open()
  })

  const refresh = (): void => {
    const source = readContentCalendarTodaySource()
    const eligible = options.getEnabled() && contentCalendarTodayAvailable(source)
    toggle.hidden = !eligible
    if (!eligible) {
      // The setting was switched OFF or the catalog lost its calendar data.
      close()
    } else if (isOpen()) {
      render()
    }
  }

  return Object.freeze({ field, button: toggle, panel, refresh, open, close, isOpen })
}
