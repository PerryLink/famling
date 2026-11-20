/**
 * Experimental character-pack installer controller for the 内容包 tab, split
 * out of `initContentHub` (E10 / MB-101).
 *
 * The controller owns the preview token + triple-consent state + confirm/
 * uninstall/rollback handlers and exposes the render context the moved 内容包
 * renderer consumes. It stays DOM-free besides the hidden file inputs inside
 * the dialog root; bytes live in the injected host adapter.
 */
import {
  characterPackUnavailableState,
  type CharacterPackConsentInput,
  type CharacterPackConsentKey,
  type CharacterPackHubAdapter,
  type CharacterPackPrepared,
  type CharacterPackUiState,
} from './character-installer.ts'
import {
  fileListOf,
  readFolderSelection,
  readSingleSelection,
  type CharacterPackTabContext,
  type ContentHubFileLike,
  type ContentPackFileSelection,
} from './packs.ts'
import type { HubFeedbackSink } from './shared.ts'

export interface CharacterPackControllerOptions {
  /** Dialog root: the hidden character-pack file inputs live inside it. */
  readonly root: HTMLElement
  /** Raw host seam; a throwing getter or null adapter renders the honest note. */
  readonly getAdapter: () => CharacterPackHubAdapter | null | undefined
  readonly feedback: HubFeedbackSink
  /** Re-render the active tab after a state change. */
  readonly onChange: () => void
  /** Recompute the footer pack summary after a state change. */
  readonly onSummary: () => void
}

export interface CharacterPackController {
  /** Context for the `renderPacksTab` 角色包安装器 section. */
  tabContext(): CharacterPackTabContext
  /** Registered character-pack count shown in the footer summary. */
  installedCount(): number
}

export function createCharacterPackTabController(
  options: CharacterPackControllerOptions,
): CharacterPackController {
  // The preview holds only an opaque token; bytes live in the host adapter.
  let characterPrepared: CharacterPackPrepared | null = null
  let characterConsent: CharacterPackConsentInput = Object.freeze({
    usageConfirmed: false,
    licenseAcknowledged: false,
    aiDisclosureAcknowledged: false,
  })
  let characterConfirm: { kind: 'uninstall' | 'rollback'; packId: string } | null = null
  let characterBusy = false

  function characterPacksAdapter(): CharacterPackHubAdapter | null {
    try {
      return options.getAdapter() ?? null
    } catch {
      return null
    }
  }

  function characterPackState(): CharacterPackUiState {
    const adapter = characterPacksAdapter()
    if (adapter === null) {
      return characterPackUnavailableState('宿主未注入角色包安装器（IndexedDB / CharacterPackRuntime 适配器缺失）。')
    }
    try {
      return adapter.state()
    } catch {
      return characterPackUnavailableState('角色包安装器状态读取失败。')
    }
  }

  function resetCharacterConsent(): void {
    characterConsent = Object.freeze({
      usageConfirmed: false,
      licenseAcknowledged: false,
      aiDisclosureAcknowledged: false,
    })
  }

  function characterPackTabContext(): CharacterPackTabContext {
    return {
      getState: characterPackState,
      getPrepared: (): CharacterPackPrepared | null => characterPrepared,
      getConsent: (): CharacterPackConsentInput => characterConsent,
      getConfirm: () => characterConfirm,
      isBusy: (): boolean => characterBusy,
      onImport: (mode): void => {
        void handleImportCharacterPack(mode)
      },
      onToggleConsent: (key, value): void => {
        handleToggleCharacterPackConsent(key, value)
      },
      onConfirmInstall: (): void => {
        void handleConfirmCharacterPackInstall()
      },
      onCancel: (): void => {
        cancelCharacterPackPrepared()
      },
      onEnable: (packId): void => {
        void handleEnableCharacterPack(packId)
      },
      onRequestAction: (kind, packId): void => {
        requestCharacterPackAction(kind, packId)
      },
      onConfirmAction: (): void => {
        void handleConfirmCharacterPackAction()
      },
      onCancelAction: (): void => {
        cancelCharacterPackAction()
      },
    }
  }

  async function handleImportCharacterPack(mode: 'single' | 'folder'): Promise<void> {
    if (characterBusy) return
    const adapter = characterPacksAdapter()
    if (adapter === null) {
      options.feedback.setFeedback('角色包安装器不可用：宿主未注入 IndexedDB / CharacterPackRuntime 适配器。', 'error')
      return
    }
    const inputs = options.root.querySelectorAll<HTMLInputElement>('input.content-hub-character-file-input')
    const target = mode === 'single' ? inputs[0] : inputs[1]
    if (target === undefined) return
    const selectionSource = fileListOf(target)
    selectionSource.clear()
    if (selectionSource.files.length === 0) return
    options.feedback.setFeedback('正在读取并按 famling.pet-anim/0.2 规范预检角色包…', 'info')
    options.feedback.setIssues([])
    characterBusy = true
    try {
      let selection: ContentPackFileSelection | string
      if (mode === 'folder') {
        selection = await readFolderSelection(selectionSource.files)
      } else {
        const single = await readSingleSelection(selectionSource.files[0] as ContentHubFileLike)
        if (typeof single !== 'string' && single.kind !== 'zip') {
          selection = '角色包安装器只接受 .zip 或文件夹（根目录 pack.json + assets/）；不支持单独导入 JSON 清单。'
        } else {
          selection = single
        }
      }
      if (typeof selection === 'string') {
        characterBusy = false
        options.feedback.setFeedback(selection, 'error')
        return
      }
      const result = await adapter.preview(selection)
      characterBusy = false
      if (!result.ok) {
        options.feedback.setFeedback(result.message, 'error')
        options.feedback.setIssues(result.issues)
        return
      }
      if (characterPrepared !== null) adapter.cancelPrepared(characterPrepared)
      characterPrepared = result.prepared
      resetCharacterConsent()
      characterConfirm = null
      options.feedback.setFeedback('角色包预检通过；请阅读统一用途声明、许可与 AI 标识并逐项确认后再安装。', 'info')
      options.onChange()
    } catch {
      characterBusy = false
      options.feedback.setFeedback('角色包读取或预检失败，未安装任何内容。', 'error')
    }
  }

  function handleToggleCharacterPackConsent(key: CharacterPackConsentKey, value: boolean): void {
    const next = {
      usageConfirmed: characterConsent.usageConfirmed,
      licenseAcknowledged: characterConsent.licenseAcknowledged,
      aiDisclosureAcknowledged: characterConsent.aiDisclosureAcknowledged,
    }
    next[key] = value === true
    characterConsent = Object.freeze(next)
    options.onChange()
  }

  function cancelCharacterPackPrepared(): void {
    const adapter = characterPacksAdapter()
    if (characterPrepared !== null) adapter?.cancelPrepared(characterPrepared)
    characterPrepared = null
    resetCharacterConsent()
    characterConfirm = null
    options.feedback.setFeedback('已取消角色包导入，未安装任何内容。', 'info')
    options.feedback.setIssues([])
    options.onChange()
  }

  async function handleConfirmCharacterPackInstall(): Promise<void> {
    const prepared = characterPrepared
    const adapter = characterPacksAdapter()
    if (prepared === null || adapter === null || characterBusy) return
    const confirmed =
      characterConsent.usageConfirmed && characterConsent.licenseAcknowledged && characterConsent.aiDisclosureAcknowledged
    if (!confirmed) {
      options.feedback.setFeedback('必须逐项确认统一用途声明、角色包许可与 AI 标识后才能安装。', 'error')
      return
    }
    characterBusy = true
    options.feedback.setFeedback('正在安装并登记角色包（仅本地数据、不联网）…', 'info')
    try {
      const result = await adapter.install(prepared, characterConsent)
      characterBusy = false
      characterPrepared = null
      resetCharacterConsent()
      characterConfirm = null
      options.onChange()
      options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (!result.ok) options.feedback.setIssues(result.issues)
      options.onSummary()
    } catch {
      characterBusy = false
      options.feedback.setFeedback('安装失败：角色包处理出错，未安装。', 'error')
    }
  }

  async function handleEnableCharacterPack(packId: string): Promise<void> {
    const adapter = characterPacksAdapter()
    if (adapter === null || characterBusy) return
    characterBusy = true
    characterConfirm = null
    try {
      const result = await adapter.enable(packId)
      characterBusy = false
      options.onChange()
      options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (!result.ok) options.feedback.setIssues(result.issues)
    } catch {
      characterBusy = false
      options.feedback.setFeedback('启用登记失败：角色包处理出错。', 'error')
    }
  }

  function requestCharacterPackAction(kind: 'uninstall' | 'rollback', packId: string): void {
    if (characterBusy) return
    characterConfirm = { kind, packId }
    options.onChange()
  }

  function cancelCharacterPackAction(): void {
    characterConfirm = null
    options.onChange()
  }

  async function handleConfirmCharacterPackAction(): Promise<void> {
    const request = characterConfirm
    const adapter = characterPacksAdapter()
    if (request === null || adapter === null || characterBusy) return
    characterBusy = true
    try {
      const result =
        request.kind === 'uninstall' ? await adapter.uninstall(request.packId) : await adapter.rollback(request.packId)
      characterBusy = false
      characterConfirm = null
      options.onChange()
      options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (!result.ok) options.feedback.setIssues(result.issues)
      options.onSummary()
    } catch {
      characterBusy = false
      options.feedback.setFeedback(request.kind === 'uninstall' ? '卸载失败：角色包处理出错。' : '回滚失败：角色包处理出错。', 'error')
    }
  }

  return {
    tabContext: characterPackTabContext,
    installedCount: (): number => characterPackState().installedCount,
  }
}
