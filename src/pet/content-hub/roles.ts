/**
 * Role preset presentation, startup planning and the 角色 / 自定义 tab
 * renderers. Split out of content-hub.ts (task-96 / E10) with no behaviour
 * change: content-hub.ts re-exports this module's public surface.
 */
import {
  applyCharacterTheme,
  findCharacterTheme,
  findContent,
  isVoiceAvailableFor,
  listContent,
  matchCharacterThemes,
  readContentSelectionDetailed,
  readRoleThemeSelection,
  resolveContentSelection,
  type ContentCategory,
  type ContentCharacterTheme,
  type ContentDialoguePackEntry,
  type ContentLibrary,
  type ContentSelection,
  type ContentVoiceEntry,
  type SelectionKey,
} from '../content-library.ts'
import type { StorageLike } from '../security/safe-storage.ts'
import type { HubRenderSurface } from './shared.ts'

/** Host callbacks + DOM surface consumed by the 角色 / 自定义 renderers. */
export interface RolesTabRenderContext extends HubRenderSurface {
  readonly getLibrary: () => ContentLibrary | null
  readonly getSelection: () => ContentSelection | null
  readonly getRoleThemeId: () => string | null
  readonly getBaseLibrary: (library: ContentLibrary) => ContentLibrary
  readonly resolvePreviewUrl: (theme: ContentCharacterTheme) => string | null
  readonly docsHref: string
  readonly onApplyRole: (roleThemeId: string) => void
  readonly onCustomize: (key: SelectionKey, id: string) => void
  readonly onRestoreRole: () => void
  readonly hasRestoreRole: boolean
}

/** The customisable component groups (character itself is switched on 角色). */
export interface ContentCustomizeGroup {
  readonly key: SelectionKey
  readonly category: ContentCategory
  readonly label: string
  readonly blurb: string
}

export const CONTENT_CUSTOMIZE_GROUPS: readonly ContentCustomizeGroup[] = Object.freeze([
  { key: 'voice', category: 'voices', label: '声音', blurb: 'TTS 音色；切换会改变 TTS 配置签名并重新弹出语音声明。' },
  { key: 'dialoguePack', category: 'dialoguePacks', label: '对话', blurb: '气泡频率与长度策略；即时生效，错误/关键提示不受影响。' },
  { key: 'theme', category: 'themes', label: '主题', blurb: '气泡与面板配色；即时应用，不需要刷新。' },
  { key: 'background', category: 'backgrounds', label: '背景', blurb: '桌宠背景；透明仍是默认值，即时应用。' },
  { key: 'font', category: 'fonts', label: '字体', blurb: '本地字体栈；不使用网络字体，即时应用。' },
])

// ---------------------------------------------------------------------------
// Role theme presentation + runtime support
// ---------------------------------------------------------------------------

/** Human-readable role theme summary used by the 角色 cards. */
export interface RoleThemeSummary {
  readonly name: string
  readonly description: string
  readonly characterName: string
  readonly voiceLabel: string
  readonly dialogueLabel: string
  readonly appearanceLabel: string
  readonly declarationLabel: string
  readonly designRef: string
  readonly version: string
  readonly author: string
  readonly source: string
}

function entryName(library: ContentLibrary, category: ContentCategory, id: string): string {
  return findContent(library, category, id)?.name ?? id
}

/** One-line "voice / dialogue / appearance" summary for a role theme. */
export function summarizeRoleTheme(library: ContentLibrary, theme: ContentCharacterTheme): RoleThemeSummary {
  const character = findContent(library, 'characters', theme.characterId)
  let voiceLabel: string
  if (theme.voiceId === 'none') {
    voiceLabel = '静默（猫 / 狗永不 TTS）'
  } else {
    voiceLabel = theme.voiceId + ' · ' + entryName(library, 'voices', theme.voiceId)
  }
  const dialogue = findContent(library, 'dialoguePacks', theme.dialoguePackId) as ContentDialoguePackEntry | undefined
  const dialogueLabel =
    dialogue === undefined
      ? theme.dialoguePackId
      : dialogue.name + '（' + dialogue.mode + ' · ≤' + dialogue.maxChars + ' 字）'
  const appearanceLabel =
    entryName(library, 'themes', theme.appearance.themeId) +
    ' / ' +
    entryName(library, 'backgrounds', theme.appearance.backgroundId) +
    ' / ' +
    entryName(library, 'fonts', theme.appearance.fontId)
  return Object.freeze({
    name: theme.name,
    description: theme.description,
    characterName: character?.name ?? theme.characterId,
    voiceLabel,
    dialogueLabel,
    appearanceLabel,
    declarationLabel: '研究用途声明 ✓',
    designRef: theme.designRef,
    version: theme.version,
    author: theme.author,
    source: theme.source,
  })
}

/** Whether this host can actually run a role theme in one click. */
export interface RoleThemeSupport {
  readonly supported: boolean
  readonly reason: string
}

/**
 * A role theme is runtime-supported only when its character and voice exist in
 * the BUILT-IN catalog (the local renderer / TTS provider). Pack-only characters
 * or voices need the remote market installer: they are imported metadata, not a
 * pretend-usable role.
 */
export function evaluateRoleThemeSupport(baseLibrary: ContentLibrary, theme: ContentCharacterTheme): RoleThemeSupport {
  const character = findContent(baseLibrary, 'characters', theme.characterId)
  if (character === undefined || !character.available) {
    return Object.freeze({
      supported: false,
      reason: '该角色动画由内容包提供，本机渲染器不支持；已导入但需远程市场安装器。',
    })
  }
  if (theme.voiceId !== 'none') {
    const voice = findContent(baseLibrary, 'voices', theme.voiceId) as ContentVoiceEntry | undefined
    if (voice === undefined || !voice.available) {
      return Object.freeze({
        supported: false,
        reason: '该声音由内容包提供，本机 TTS 不支持；已导入但需远程市场安装器。',
      })
    }
    if (!isVoiceAvailableFor(voice, character.id)) {
      return Object.freeze({
        supported: false,
        reason: '该声音与角色不匹配，需安装器重新校验；已导入但需远程市场安装器。',
      })
    }
  }
  return Object.freeze({ supported: true, reason: '' })
}

// ---------------------------------------------------------------------------
// Startup: read the role theme, apply the six keys, migrate old selections
// ---------------------------------------------------------------------------

export interface StartupRoleHints {
  /** Character the renderer booted with (runtime truth wins over stale keys). */
  readonly runtimeCharacter?: string
  /** TTS voice the runtime booted with. */
  readonly runtimeVoice?: string
}

export type StartupRolePlanSource = 'stored' | 'migrated' | 'default' | 'custom'

export interface StartupRolePlan {
  readonly roleThemeId: string | null
  readonly selection: ContentSelection
  readonly source: StartupRolePlanSource
  /** True when the six-key selection does not equal the role theme defaults. */
  readonly custom: boolean
  readonly writeRoleTheme: boolean
  readonly clearRoleTheme: boolean
}

function selectionEqualsTheme(library: ContentLibrary, themeId: string, selection: ContentSelection): boolean {
  const theme = findCharacterTheme(library, themeId)
  if (theme === undefined) return false
  const application = applyCharacterTheme(library, themeId)
  if (!application.ok || application.selection === undefined) return false
  const expected = application.selection
  return (
    expected.character === selection.character &&
    expected.voice === selection.voice &&
    expected.dialoguePack === selection.dialoguePack &&
    expected.theme === selection.theme &&
    expected.background === selection.background &&
    expected.font === selection.font
  )
}

/**
 * Decide the effective six-component selection at boot from the role-theme key
 * plus the stored legacy six-key selection:
 *
 * 1. a stored role theme wins; explicit six-key choices are overlaid on top
 *    (so per-component customisation survives a restart) -> source "stored";
 * 2. no role theme but explicit legacy six-key choices -> migrate to a matching
 *    character theme when one exists (six keys + role key written) -> "migrated"
 *    (unmatched legacy selections stay custom, nothing is overwritten);
 * 3. no stored selection at all -> apply defaultRoleTheme / the first preset
 *    and persist the full six-key bundle -> "default";
 * 4. runtime hints (renderer character / boot voice) are the final truth for the
 *    two keys that own runtime behaviour; if they contradict a stored role theme
 *    the role key is reconciled (matched again or cleared) instead of lying.
 */
export function planStartupRoleTheme(
  library: ContentLibrary,
  storage?: StorageLike | null,
  hints: StartupRoleHints = {},
): StartupRolePlan {
  const detailed = readContentSelectionDetailed(library, storage)
  const storedRole = readRoleThemeSelection(library, storage)
  const explicitKeys = (Object.keys(detailed.sources) as SelectionKey[]).filter(
    (key) => detailed.sources[key] === 'stored',
  )
  let selection: ContentSelection = detailed.selection
  let roleThemeId: string | null = null
  let source: StartupRolePlanSource = 'custom'
  let writeRoleTheme = false
  let clearRoleTheme = storedRole.source === 'invalid'

  const storedThemeId = storedRole.source === 'stored' ? storedRole.roleThemeId : null
  if (storedThemeId !== null) {
    const application = applyCharacterTheme(library, storedThemeId)
    if (application.ok && application.selection !== undefined) {
      const merged: Partial<Record<SelectionKey, string>> = { ...application.selection }
      for (const key of explicitKeys) merged[key] = detailed.selection[key]
      selection = resolveContentSelection(library, merged).selection
      roleThemeId = storedThemeId
      source = 'stored'
      clearRoleTheme = false
    }
  }

  if (roleThemeId === null && storedThemeId === null && explicitKeys.length > 0) {
    const matches = matchCharacterThemes(library, detailed.selection)
    const match = matches[0]
    if (match !== undefined) {
      roleThemeId = match.id
      selection = detailed.selection
      source = 'migrated'
      writeRoleTheme = true
      clearRoleTheme = false
    } else {
      selection = detailed.selection
      source = 'custom'
    }
  }

  if (roleThemeId === null && storedThemeId === null && explicitKeys.length === 0) {
    const defaults = library.defaultRoleTheme
    const defaultTheme =
      defaults !== undefined && findCharacterTheme(library, defaults) !== undefined
        ? defaults
        : library.rolePresets[0]?.id
    if (defaultTheme !== undefined) {
      const application = applyCharacterTheme(library, defaultTheme)
      if (application.ok && application.selection !== undefined) {
        roleThemeId = defaultTheme
        selection = application.selection
        source = 'default'
        writeRoleTheme = true
        clearRoleTheme = false
      }
    }
  }

  // Runtime truth for the two keys that own behaviour (renderer / TTS voice).
  const hinted: Partial<Record<SelectionKey, string>> = { ...selection }
  if (hints.runtimeCharacter !== undefined && hints.runtimeCharacter.length > 0) {
    hinted.character = hints.runtimeCharacter
  }
  if (hints.runtimeVoice !== undefined && hints.runtimeVoice.length > 0) {
    hinted.voice = hints.runtimeVoice
  }
  const resolved = resolveContentSelection(library, hinted).selection
  selection = resolved

  if (roleThemeId !== null) {
    const theme = findCharacterTheme(library, roleThemeId)
    if (theme === undefined || theme.characterId !== selection.character) {
      const matches = matchCharacterThemes(library, selection)
      const match = matches[0]
      if (match !== undefined && match.id !== roleThemeId) {
        roleThemeId = match.id
        source = 'migrated'
        writeRoleTheme = true
        clearRoleTheme = false
      } else if (match === undefined) {
        clearRoleTheme = true
        writeRoleTheme = false
        if (storedThemeId !== null || roleThemeId !== null) roleThemeId = null
        source = 'custom'
      }
    }
  }

  const custom = roleThemeId === null ? true : !selectionEqualsTheme(library, roleThemeId, selection)
  if (clearRoleTheme) writeRoleTheme = false
  return Object.freeze({
    roleThemeId,
    selection,
    source,
    custom,
    writeRoleTheme,
    clearRoleTheme,
  })
}

/** Current-role marker: explicit role key wins, else match the six keys. */
function roleIsCurrent(
  ctx: RolesTabRenderContext,
  library: ContentLibrary,
  theme: ContentCharacterTheme,
): boolean {
  const roleId = ctx.getRoleThemeId()
  if (roleId !== null) return roleId === theme.id
  const selection = ctx.getSelection()
  if (selection === null) return false
  return matchCharacterThemes(library, selection).some((candidate) => candidate.id === theme.id)
}

/** Render the 角色 tab (built-in presets + imported role themes). */
export function renderRolesTab(ctx: RolesTabRenderContext): void {
  const { create, panelBody, appendEmpty, getLibrary, getBaseLibrary, docsHref, onApplyRole } = ctx
  const doc = ctx.doc
  const resolvePreviewUrl = ctx.resolvePreviewUrl

  // --- 角色 ---------------------------------------------------------------

  function buildRoleCard(library: ContentLibrary, theme: ContentCharacterTheme, installed: boolean): HTMLElement {
    const base = getBaseLibrary(library)
    const support = installed ? evaluateRoleThemeSupport(base, theme) : Object.freeze({ supported: true, reason: '' })
    const summary = summarizeRoleTheme(library, theme)
    const current = roleIsCurrent(ctx, library, theme)
    const card = create('article', 'content-hub-role-card')
    card.dataset.roleTheme = theme.id
    if (current) card.classList.add('current')
    if (!support.supported) card.classList.add('unsupported')

    const media = create('div', 'content-hub-card-media')
    media.setAttribute('aria-hidden', 'true')
    const previewUrl = (() => {
      try {
        return resolvePreviewUrl(theme)
      } catch {
        return null
      }
    })()
    if (previewUrl !== null && previewUrl.length > 0) {
      const image = doc.createElement('img')
      image.className = 'content-hub-preview'
      image.src = previewUrl
      image.alt = ''
      image.loading = 'lazy'
      image.decoding = 'async'
      media.append(image)
    } else {
      media.textContent = installed ? '包' : '角'
      media.classList.add('content-hub-media-glyph')
    }

    const info = create('div', 'content-hub-card-info')
    const name = create('strong', 'content-hub-card-name')
    name.textContent = summary.name
    const description = create('span', 'content-hub-card-desc')
    description.textContent = summary.description
    const meta = create('span', 'content-hub-card-meta')
    meta.textContent =
      '角色 ' +
      summary.characterName +
      ' · 声音 ' +
      summary.voiceLabel +
      ' · 对话 ' +
      summary.dialogueLabel
    const appearance = create('span', 'content-hub-card-meta')
    appearance.textContent = '外观 ' + summary.appearanceLabel
    const badges = create('div', 'content-hub-badges')
    const declaration = create('span', 'content-hub-badge')
    declaration.textContent = summary.declarationLabel
    const state = create('span', 'content-hub-badge')
    state.textContent = current ? '当前角色' : installed ? '已导入' : '内置'
    badges.append(declaration, state)
    const design = create('a', 'content-hub-design-ref')
    design.href = docsHref
    design.target = '_blank'
    design.rel = 'noopener noreferrer'
    design.textContent = '设计参考：' + summary.designRef
    info.append(name, description, meta, appearance, badges, design)

    const actions = create('div', 'content-hub-role-actions')
    const applyButton = create('button', 'content-hub-apply')
    applyButton.type = 'button'
    applyButton.textContent = '一键应用这个角色'
    applyButton.dataset.roleTheme = theme.id
    applyButton.disabled = !support.supported
    applyButton.addEventListener('click', () => {
      onApplyRole(theme.id)
    })
    actions.append(applyButton)
    card.append(media, info, actions)
    if (!support.supported) {
      const note = create('p', 'content-hub-role-note')
      note.textContent = support.reason
      card.append(note)
    }
    return card
  }

  function renderRoles(): void {
    const library = getLibrary()
    if (!library) {
      appendEmpty('内容目录尚未加载，请稍后再试。')
      return
    }
    const presets = library.rolePresets
    if (presets.length === 0) {
      appendEmpty('内置角色目录为空。')
    } else {
      const heading = create('h3', 'content-hub-group-title')
      heading.textContent = '内置角色'
      panelBody.append(heading)
      const grid = create('div', 'content-hub-role-grid')
      for (const theme of presets) grid.append(buildRoleCard(library, theme, false))
      panelBody.append(grid)
    }
    const installed = library.characterThemes
    const heading = create('h3', 'content-hub-group-title')
    heading.textContent = '已导入角色主题'
    panelBody.append(heading)
    if (installed.length === 0) {
      appendEmpty('还没有导入的角色主题；可在「内容包」导入 .json / .zip / 文件夹。')
      return
    }
    const grid = create('div', 'content-hub-role-grid')
    for (const theme of installed) grid.append(buildRoleCard(library, theme, true))
    panelBody.append(grid)
  }

  renderRoles()
}

/** Render the 自定义 tab (per-component overrides + restore). */
export function renderCustomizeTab(ctx: RolesTabRenderContext): void {
  const { create, panelBody, appendEmpty, getLibrary, getSelection, getRoleThemeId, hasRestoreRole, onCustomize, onRestoreRole } = ctx

  // --- 自定义 -------------------------------------------------------------

  function buildChip(
    key: SelectionKey,
    label: string,
    entryId: string,
    selected: boolean,
    available: boolean,
    onActivate: () => void,
  ): HTMLButtonElement {
    const chip = create('button', 'content-hub-chip')
    chip.type = 'button'
    chip.dataset.selectionKey = key
    chip.dataset.contentEntry = entryId
    chip.setAttribute('aria-pressed', selected ? 'true' : 'false')
    chip.disabled = !available
    chip.textContent = label + (selected ? ' · 当前' : '')
    if (selected) chip.classList.add('selected')
    chip.addEventListener('click', onActivate)
    return chip
  }

  function renderCustomize(): void {
    const library = getLibrary()
    if (!library) {
      appendEmpty('内容目录尚未加载，请稍后再试。')
      return
    }
    const selection = getSelection()
    const roleId = getRoleThemeId()
    const roleTheme = roleId === null ? null : (findCharacterTheme(library, roleId) ?? null)
    const heading = create('h3', 'content-hub-group-title')
    heading.textContent = '在角色主题上自定义'
    const intro = create('p', 'content-hub-blurb')
    intro.textContent =
      roleTheme !== null
        ? '当前角色：「' + roleTheme.name + '」。下面的修改只覆盖对应组件，其余仍跟随角色主题。'
        : '当前是自定义组合（未匹配内置角色主题）。可以逐项调整，或在「角色」里一键应用一个角色。'
    panelBody.append(heading, intro)
    const restoreRow = create('div', 'content-hub-actions')
    const restore = create('button', 'content-hub-restore')
    restore.type = 'button'
    restore.textContent = '恢复此角色默认'
    restore.disabled = roleTheme === null || !hasRestoreRole
    restore.addEventListener('click', () => {
      onRestoreRole()
    })
    restoreRow.append(restore)
    panelBody.append(restoreRow)
    if (selection === null) {
      appendEmpty('内容选择尚未加载，请稍后再试。')
      return
    }
    for (const group of CONTENT_CUSTOMIZE_GROUPS) {
      const section = create('section', 'content-hub-group')
      const groupTitle = create('h4', 'content-hub-group-heading')
      groupTitle.textContent = group.label
      const groupBlurb = create('p', 'content-hub-group-blurb')
      groupBlurb.textContent = group.blurb
      const row = create('div', 'content-hub-chip-row')
      const entries = listContent(library, group.category)
      if (entries.length === 0) {
        row.textContent = '这个分类还没有可用内容。'
      }
      for (const entry of entries) {
        const selected = selection[group.key] === entry.id
        row.append(
          buildChip(group.key, entry.name, entry.id, selected, entry.available, () => {
            onCustomize(group.key, entry.id)
          }),
        )
      }
      section.append(groupTitle, groupBlurb, row)
      panelBody.append(section)
    }
  }

  renderCustomize()
}

