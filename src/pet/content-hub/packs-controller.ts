/**
 * 内容包 tab controller, split out of `initContentHub` (E10 / MB-101).
 *
 * Owns the local theme-pack import flow (strict prepare → declaration → explicit
 * confirm → commit), the shared busy flag and the context for the moved
 * 内容包 renderer. The experimental character-pack section is delegated to its
 * own controller through an injected tab context.
 */
import {
  fileListOf,
  readFolderSelection,
  readSingleSelection,
  renderPacksTab,
  type CharacterPackTabContext,
  type ContentHubFileLike,
  type ContentHubInstalledPack,
  type ContentPackFileSelection,
  type PreparedThemePackImport,
  type ThemePackPrepareResult,
} from './packs.ts'
import type {
  HubBusyFlag,
  HubFeedbackSink,
  HubImportActionResult,
  HubRenderSurface,
} from './shared.ts'

export interface PacksTabControllerOptions {
  /** Dialog root: the hidden file inputs live inside the rendered tab. */
  readonly root: HTMLElement
  readonly getInstalledPacks: () => readonly ContentHubInstalledPack[]
  /** Validate a selected local pack; nothing is installed yet. */
  readonly prepareImport: (selection: ContentPackFileSelection) => Promise<ThemePackPrepareResult>
  /** Explicitly confirmed install (persist manifest + assets, refresh UI). */
  readonly commitImport: (pending: PreparedThemePackImport) => Promise<HubImportActionResult>
  /** The experimental character-pack section context (injected by its controller). */
  readonly characterTabContext: () => CharacterPackTabContext
  readonly busy: HubBusyFlag
  readonly feedback: HubFeedbackSink
  /** Re-render the active tab after a state change. */
  readonly onChange: () => void
  /** Recompute the footer pack summary after a state change. */
  readonly onSummary: () => void
}

export interface PacksTabController {
  renderPacks(surface: HubRenderSurface): void
  /** Test/diagnostic hook: a validated pack is waiting for confirmation. */
  hasPendingImport(): boolean
  cancelPendingImport(): void
  /** Renderer entry point: read the selected file(s) and prepare an import. */
  importFile(mode: 'single' | 'folder'): Promise<void>
  /** Renderer entry point: commit the pending import after confirmation. */
  confirmImport(): Promise<void>
}

export function createPacksTabController(options: PacksTabControllerOptions): PacksTabController {
  let pendingImport: PreparedThemePackImport | null = null

  async function handleImportFile(mode: 'single' | 'folder'): Promise<void> {
    if (options.busy.isBusy()) return
    const inputs = options.root.querySelectorAll<HTMLInputElement>('input.content-hub-file-input')
    const target = mode === 'single' ? inputs[0] : inputs[1]
    if (target === undefined) return
    const selectionSource = fileListOf(target)
    selectionSource.clear()
    if (selectionSource.files.length === 0) return
    options.feedback.setFeedback('正在读取并按 0.2 规范校验内容包…', 'info')
    options.feedback.setIssues([])
    options.busy.setBusy(true)
    try {
      const selection =
        mode === 'folder'
          ? await readFolderSelection(selectionSource.files)
          : await readSingleSelection(selectionSource.files[0] as ContentHubFileLike)
      if (typeof selection === 'string') {
        options.feedback.setFeedback(selection, 'error')
        return
      }
      const result = await options.prepareImport(selection)
      if (!result.ok) {
        options.feedback.setFeedback(result.message, 'error')
        options.feedback.setIssues(result.issues)
        return
      }
      pendingImport = result.pending
      options.feedback.setFeedback('内容包已通过严格校验；请阅读统一用途声明并显式确认后再导入。', 'info')
      options.onChange()
    } catch {
      options.feedback.setFeedback('导入失败：内容包读取或校验出错。', 'error')
    } finally {
      options.busy.setBusy(false)
      options.onSummary()
    }
  }

  async function handleConfirmImport(): Promise<void> {
    const pending = pendingImport
    if (pending === null || options.busy.isBusy()) return
    options.busy.setBusy(true)
    try {
      const result = await options.commitImport(pending)
      options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (result.ok) {
        pendingImport = null
        options.onChange()
        options.onSummary()
      }
    } catch {
      options.feedback.setFeedback('安装失败：内容包处理出错，未安装。', 'error')
    } finally {
      options.busy.setBusy(false)
    }
  }

  function cancelPendingImport(): void {
    pendingImport = null
    options.feedback.setFeedback('已取消导入，未安装任何内容。', 'info')
    options.feedback.setIssues([])
    options.onChange()
  }

  function renderPacks(surface: HubRenderSurface): void {
    renderPacksTab({
      ...surface,
      getInstalledPacks: options.getInstalledPacks,
      getPendingImport: (): PreparedThemePackImport | null => pendingImport,
      isImportBusy: (): boolean => options.busy.isBusy(),
      onImportFile: (mode): void => {
        void handleImportFile(mode)
      },
      onConfirmImport: (): void => {
        void handleConfirmImport()
      },
      onCancelImport: cancelPendingImport,
      characterPacks: options.characterTabContext(),
    })
  }

  return {
    renderPacks,
    hasPendingImport: (): boolean => pendingImport !== null,
    cancelPendingImport,
    importFile: handleImportFile,
    confirmImport: handleConfirmImport,
  }
}
