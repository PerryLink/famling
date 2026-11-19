/**
 * Pet settings page wiring (E10 MB-100, task-121; mechanically extracted from
 * `src/pet/main.ts`).
 *
 * main.ts used to inline the page-side wiring of every settings/data surface:
 * the shared volume+mute paths (panel slider and desktop settings dialog reuse
 * the same audited entries), the 复位窗口 command, the 折页簿 memory screen, the
 * portable-save archive controls, the corrupt-archive recovery panel and the
 * quiet-hours ambient mirror. This module owns that wiring now; main.ts keeps
 * only the save-runtime boot/exit wiring (task-94) and the visible delegation
 * seams it cannot move (the trusted `say`/render loop, hero window position and
 * the content runtime).
 *
 * Boundaries (same as the other E10 splits): this module imports no CSS and
 * touches no DOM at module evaluation time. Every page seam is injected through
 * `SettingsPageDeps`, so Node tests can import and drive the shipped wiring.
 * Persistence, kernel state and the desktop settings dialog itself stay in their
 * existing audited modules; this file only assembles the callbacks and the
 * legacy in-page panel bindings.
 *
 * Scaling (缩放) is intentionally not here: the per-axis scale controls, their
 * persistence and `#pet-scale-label` were already extracted into
 * `desktop-shell.ts`/`scaling.ts` (E5); main.ts never owned scale code. The
 * settings dialog this module feeds is the SAME #pet-settings surface built by
 * `initDesktopShell`.
 */
import {
  createPet,
  correctPetMemory,
  deserializePet,
  forgetPetMemory,
  serializePet,
  setMuted as setPetMuted,
  type PetState,
} from '../kernel/pet.ts'
import { ConsentDeclinedError, importPortableWithConsent } from './consent/content.ts'
import type { ConsentRequester } from './consent/gate.ts'
import {
  createSaveRecoveryPanel,
  type DesktopShellOptions,
  type SaveRecoveryCloseReason,
  type SaveRecoveryPanel,
} from './desktop-shell.ts'
import { isQuietHoursActive, readQuietHours, type QuietHoursSettings } from './low-disturb.ts'
import { exportPortable, importPortable } from './portable.ts'
import { RateLimitError } from './security/rate-limit.ts'
import { toUserMessage, type ErrorBoundary } from './security/error-boundary.ts'
import { SECURITY_LIMITS, utf8ByteLength } from './security/limits.ts'
import { readClampedInt, safeSetItem, type StorageLike } from './security/safe-storage.ts'
import type { PetSaveService } from './save-host.ts'

/** Volume preference key (read through safe-storage; missing/corrupt keeps 70). */
export const VOLUME_STORAGE_KEY = 'desktop-games/pet/volume'
export const DEFAULT_VOLUME = 70

/**
 * Local actions this module may run before an explicit TOS acceptance must be
 * refused. Subset of main.ts's `GuardedLocalAction` (main passes its audited
 * `guardLocalAction`; the wider union is assignable to this narrower one).
 */
export type SettingsLocalAction =
  | 'memory-open'
  | 'memory-modify'
  | 'memory-forget'
  | 'memory-forget-all'
  | 'memory-export'
  | 'save-export'
  | 'save-delete'
  | 'save-load'

/** Minimal page window seam used by the prompt/confirm/archive download paths. */
export interface SettingsWindow {
  prompt(message?: string, defaultValue?: string): string | null
  confirm(message?: string): boolean
}

/** Tauri core module seam (voice-cache clear / 复位窗口). */
export interface SettingsTauriCore {
  invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>
}

/** Local subset of `@tauri-apps/api/window` used by the 复位窗口 fallback. */
export interface SettingsTauriWindow {
  getCurrentWindow(): {
    outerSize(): Promise<{ width: number; height: number }>
    setPosition(position: unknown): Promise<void>
  }
  currentMonitor(): Promise<{
    position: { x: number; y: number }
    size: { width: number; height: number }
  } | null>
  PhysicalPosition: new (x: number, y: number) => unknown
}

/** Every pet-page seam the settings surface cannot own itself. */
export interface SettingsPageDeps {
  readonly document: Document
  readonly window: SettingsWindow
  /** Consent accessor (same gate as every local action). */
  readonly canInteract: () => boolean
  /** Audited local-action gate from main.ts (refuses before consent). */
  readonly guardLocalAction: (action: SettingsLocalAction) => boolean
  /** Boundary reporter (logs once, never throws into the UI). */
  readonly reportFailure: (boundary: ErrorBoundary, error: unknown) => void
  readonly storageBoundary: ErrorBoundary
  readonly saveBoundary: ErrorBoundary
  readonly loadBoundary: ErrorBoundary
  readonly importBoundary: ErrorBoundary
  readonly voiceBoundary: ErrorBoundary
  readonly uiBoundary: ErrorBoundary
  readonly ttsBoundary: ErrorBoundary
  readonly showBubble: (text: string) => void
  readonly render: () => void
  readonly now: () => number
  readonly getState: () => PetState
  readonly setState: (next: PetState) => void
  readonly hasTauri: boolean
  /** Independent content/settings window: read-only, no recovery decision. */
  readonly contentShell: boolean
  /** Live save runtime (recreated after a full local-data wipe). */
  readonly getSaveService: () => PetSaveService
  /** Audited archive entries owned by main.ts (save-runtime wiring). */
  readonly saveNow: () => Promise<void>
  readonly saveAndPurgeBackup: () => Promise<void>
  readonly loadNow: () => Promise<boolean>
  /** Unified save-then-close path used by the recovery panel's exit choice. */
  readonly exitApplication: () => void
  /** Re-confirm the TTS declaration for the current config (mute/volume). */
  readonly requestTtsConfirmation: () => Promise<unknown>
  /** Persist a new live audio gain (0..1); no-op before the AudioContext exists. */
  readonly setAudioGain: (gain: number) => void
  /** Stop any current TTS playback (mute path). */
  readonly stopVoice: () => void
  /** Current consent gate for the portable-import flow (null before init). */
  readonly getConsentGate: () => ConsentRequester | null
  /** Pet-window saved position clear after 复位窗口 (hero page owns it). */
  readonly clearSavedWindowPosition?: () => void
  /** Storage override (tests); production omits it and gets localStorage. */
  readonly storage?: StorageLike | null
  /** Testable Tauri/module seams; production omits them and dynamic-imports. */
  readonly loadTauriCore?: () => Promise<SettingsTauriCore>
  readonly loadTauriWindow?: () => Promise<SettingsTauriWindow>
  /** Download seam for archive/memory exports (tests inject a fake). */
  readonly downloadJson?: (filename: string, json: string) => void
}

/** Settings callback bundle for `initDesktopShell` (the #pet-settings dialog). */
export type SettingsShellOptions = Pick<
  DesktopShellOptions,
  'getAudioState' | 'setMuted' | 'setVolume' | 'onVolumeCommit' | 'resetWindow' | 'onQuietHoursChange'
>

/** Shipped settings-page wiring (one instance per pet page). */
export interface SettingsPage {
  /** Live volume preference (0..100). */
  readonly volume: number
  getAudioState(): { muted: boolean; volume: number }
  /** Single mute path shared by the panel button and the settings dialog. */
  setMuted(next: boolean): void
  /** Single volume-apply path (panel slider + settings dialog slider). */
  setVolume(next: number): number
  /** Slider release: re-confirm the TTS declaration when voice is enabled. */
  commitVolume(): void
  quietHoursActive(at?: Date): boolean
  /** Settings dialog changed the persisted quiet-hours window (mirror only). */
  setQuietHours(next: QuietHoursSettings): void
  /** A full data wipe cleared the preference: re-read the safety default. */
  reloadQuietHours(): void
  /** 复位窗口: Tauri command with the window-API fallback. */
  resetWindow(): void
  /** Clear the Tauri local TTS WAV cache (browser mode is a no-op bubble). */
  clearVoiceCache(): void
  renderMemoryBook(): void
  openMemoryScreen(): void
  hideMemoryScreen(): void
  /** Corrupt-archive recovery surface (save runtime owns the flag/autosave). */
  openRecoveryPanel(): void
  closeRecoveryPanel(reason: SaveRecoveryCloseReason): void
  isRecoveryPanelVisible(): boolean
  /** Bind the legacy in-page panel/settings buttons (pet.html aside + screens). */
  bind(): void
  /** Callback subset consumed by `initDesktopShell`. */
  shellOptions(): SettingsShellOptions
}

function defaultDownloadJson(document: Document, filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

async function defaultLoadTauriCore(): Promise<SettingsTauriCore> {
  return (await import('@tauri-apps/api/core')) as unknown as SettingsTauriCore
}

async function defaultLoadTauriWindow(): Promise<SettingsTauriWindow> {
  return (await import('@tauri-apps/api/window')) as unknown as SettingsTauriWindow
}

export function createSettingsPage(deps: SettingsPageDeps): SettingsPage {
  const { document, window, canInteract, guardLocalAction, reportFailure } = deps
  const loadTauriCore = deps.loadTauriCore ?? defaultLoadTauriCore
  const loadTauriWindow = deps.loadTauriWindow ?? defaultLoadTauriWindow
  const downloadJson = deps.downloadJson ?? ((filename: string, json: string) => defaultDownloadJson(document, filename, json))

  // --- Volume + audio gain (single persisted source for panel + dialog) ----
  let volume = readClampedInt(VOLUME_STORAGE_KEY, DEFAULT_VOLUME, 0, 100, deps.storage)
  let volElement: HTMLInputElement | null = null

  // --- Quiet hours ambient mirror (shell has already persisted the window) --
  let quietHoursSettings: QuietHoursSettings = readQuietHours(deps.storage)

  // --- Corrupt-archive recovery panel (created lazily; pet window only) ----
  let recoveryPanel: SaveRecoveryPanel | null = null

  function renderMemoryBook(): void {
    const list = document.getElementById('memory-list') as HTMLElement | null
    if (!list) return
    list.replaceChildren()
    const memoryItems = Array.isArray(deps.getState().memory?.items) ? deps.getState().memory.items : []
    const items = memoryItems.filter((item) => item.status === 'active')
    for (const item of items) {
      const row = document.createElement('div')
      row.className = 'memory-item'
      const label = document.createElement('span')
      label.textContent = item.text
      const kind = document.createElement('em')
      kind.textContent = item.layer
      const edit = document.createElement('button')
      edit.textContent = '改'
      edit.addEventListener('click', () => {
        if (!guardLocalAction('memory-modify')) return
        const next = window.prompt('改成什么？（最多 60 字）', item.text)
        if (!next) return
        deps.setState(correctPetMemory(deps.getState(), item.id, next, deps.now()))
        void deps.saveAndPurgeBackup().catch((error) => reportFailure(deps.saveBoundary, error))
        renderMemoryBook()
        deps.render()
      })
      const forget = document.createElement('button')
      forget.textContent = '忘'
      forget.addEventListener('click', () => {
        if (!guardLocalAction('memory-forget')) return
        if (!window.confirm('让它忘掉这条？')) return
        deps.setState(forgetPetMemory(deps.getState(), item.id, deps.now()))
        void deps.saveAndPurgeBackup().catch((error) => reportFailure(deps.saveBoundary, error))
        renderMemoryBook()
        deps.render()
      })
      row.append(label, kind, edit, forget)
      list.append(row)
    }
    if (items.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'memory-item'
      empty.textContent = '还没有折页。'
      list.append(empty)
    }
  }

  function hideMemoryScreen(): void {
    document.getElementById('memory-screen')?.classList.add('hidden')
  }

  function openMemoryScreen(): void {
    if (!guardLocalAction('memory-open')) return
    renderMemoryBook()
    document.getElementById('memory-screen')?.classList.remove('hidden')
  }

  function exportArchive(): void {
    void (async () => {
      if (!guardLocalAction('save-export')) return
      const pass = window.prompt('设置备份口令（至少 8 位；丢失无法恢复）')
      if (!pass) return
      if (pass.length < 8) { deps.showBubble('口令至少 8 位。'); return }
      const again = window.prompt('再输一次口令')
      if (again !== pass) { deps.showBubble('两次口令不一致。'); return }
      try {
        const file = await exportPortable(serializePet(deps.getState()), pass)
        downloadJson('pagefold-save.json', JSON.stringify(file, null, 2))
        deps.showBubble('备份已导出。口令别丢。')
      } catch (error) {
        reportFailure(deps.importBoundary, error)
        deps.showBubble(toUserMessage(error))
      }
    })().catch((error) => reportFailure(deps.importBoundary, error))
  }

  function deleteArchive(): void {
    void (async () => {
      if (!guardLocalAction('save-delete')) return
      if (!window.confirm('删除本机存档？记忆、状态、折页都会清掉。')) return
      if (!window.confirm('再确认一次：删除后只能靠之前的加密备份恢复。')) return
      try {
        // The runtime deletes primary+backup on both hosts and only then clears
        // the recovery flag (MB-011), so autosave resumes instead of staying paused.
        await deps.getSaveService().deleteSave()
        deps.setState(createPet(deps.now()))
        deps.render()
        renderMemoryBook()
        deps.showBubble('本机存档已删除，自动保存已恢复。')
      } catch (error) {
        reportFailure(deps.importBoundary, error)
        deps.showBubble('删除失败，请手动清理应用数据。')
      }
    })().catch((error) => reportFailure(deps.importBoundary, error))
  }

  function pickImportFile(): void {
    if (!canInteract()) return
    ;(document.getElementById('save-import-file') as HTMLInputElement | null)?.click()
  }

  function importArchiveFile(): void {
    void (async () => {
      const input = document.getElementById('save-import-file') as HTMLInputElement | null
      const file = input?.files?.[0]
      if (input) input.value = ''
      if (!file || !canInteract()) return
      const gate = deps.getConsentGate()
      if (!gate) return
      // Portable-file size cap before reading/decrypting an attacker-sized JSON.
      if (file.size > SECURITY_LIMITS.portableFileBytes) {
        deps.showBubble('备份文件太大，已拒绝导入。')
        return
      }
      if (!window.confirm('导入会覆盖当前存档，继续？')) return
      const pass = window.prompt('输入备份口令')
      if (!pass) return
      const imported = await deps.importBoundary.guardAsync(async () => {
        const plain = await importPortableWithConsent(gate, file, pass, async (selected, passphrase) => {
          const text = await (selected as File).text()
          if (utf8ByteLength(text) > SECURITY_LIMITS.portableFileBytes) throw new Error('portable-file-too-large')
          return importPortable(JSON.parse(text), passphrase)
        })
        const nextState = deserializePet(plain)
        deps.setState(nextState)
        await deps.saveAndPurgeBackup()
        return true
      })
      if (!imported.ok) {
        if (imported.error instanceof ConsentDeclinedError) {
          deps.showBubble('已取消导入：未同意完整免责声明。')
          return
        }
        deps.showBubble('导入失败：口令不对或文件损坏。')
        return
      }
      deps.render()
      renderMemoryBook()
      deps.showBubble('存档已导入。')
    })().catch((error) => reportFailure(deps.importBoundary, error))
  }

  function forgetAllMemory(): void {
    if (!guardLocalAction('memory-forget-all')) return
    if (!window.confirm('让它忘掉所有折页？这不能撤销。')) return
    const memoryItems = Array.isArray(deps.getState().memory?.items) ? deps.getState().memory.items : []
    for (const item of memoryItems.filter((entry) => entry.status === 'active')) {
      deps.setState(forgetPetMemory(deps.getState(), item.id, deps.now()))
    }
    void deps.saveAndPurgeBackup().then(() => {
      renderMemoryBook()
      deps.render()
      deps.showBubble('折页都抚平了。')
    }).catch((error) => {
      reportFailure(deps.saveBoundary, error)
      deps.showBubble(toUserMessage(error))
    })
  }

  function exportMemory(): void {
    if (!guardLocalAction('memory-export')) return
    downloadJson('pagefold-memory.json', JSON.stringify(deps.getState().memory, null, 2))
  }

  function clearVoiceCache(): void {
    void (async () => {
      if (!deps.hasTauri) {
        deps.showBubble('浏览器模式没有本地语音缓存。')
        return
      }
      try {
        const { invoke } = await loadTauriCore()
        await invoke('voice_cache_clear')
        deps.showBubble('语音缓存已清理。')
      } catch (error) {
        reportFailure(deps.voiceBoundary, error)
        deps.showBubble('清理失败，稍后再试。')
      }
    })().catch((error) => reportFailure(deps.voiceBoundary, error))
  }

  function resetWindow(): void {
    void (async () => {
      if (!deps.hasTauri) return
      let moved = false
      try {
        const { invoke } = await loadTauriCore()
        await invoke('reset_pet_window')
        moved = true
      } catch {
        // Fall through to the window-API fallback; its failure is reported below.
      }
      if (!moved) {
        try {
          const { getCurrentWindow, currentMonitor, PhysicalPosition } = await loadTauriWindow()
          const monitor = await currentMonitor()
          if (!monitor) return
          const win = getCurrentWindow()
          const size = await win.outerSize()
          const x = monitor.position.x + monitor.size.width - size.width - 12
          const y = monitor.position.y + monitor.size.height - size.height - 12
          await win.setPosition(new PhysicalPosition(x, y))
          moved = true
        } catch (error) {
          reportFailure(deps.storageBoundary, error)
          return
        }
      }
      if (moved) {
        // The content window must not clear the pet's saved position; Rust already
        // recalled the PET window in that case.
        if (!deps.contentShell) deps.clearSavedWindowPosition?.()
        deps.showBubble('回到右下角。')
      }
    })().catch((error) => reportFailure(deps.uiBoundary, error))
  }

  function closeRecoveryPanel(reason: SaveRecoveryCloseReason): void {
    recoveryPanel?.close(reason)
  }

  function openRecoveryPanel(): void {
    // The content window only holds a read-only snapshot; the pet window owns the
    // archive and its recovery decision.
    if (deps.contentShell || !canInteract()) return
    if (recoveryPanel === null) {
      recoveryPanel = createSaveRecoveryPanel({
        document,
        saveAsNew: async () => {
          try {
            await deps.saveNow()
            return { ok: true }
          } catch (error) {
            if (!(error instanceof RateLimitError)) reportFailure(deps.saveBoundary, error)
            return { ok: false, message: toUserMessage(error) }
          }
        },
        restoreFromBackup: async () => {
          try {
            const loaded = await deps.loadNow()
            if (!loaded) return { ok: false, message: '备份也读不出来：本机没有可用的备份档。' }
            if (!deps.getSaveService().recoveryNeeded) {
              // The primary parsed this time (e.g. repaired externally): nothing
              // left to recover, so close without a follow-up step.
              closeRecoveryPanel('restored')
              return { ok: true }
            }
            return {
              ok: true,
              message: '已从备份读回存档；请再点「保存当前为新档」修复主档，之后自动保存会恢复。',
            }
          } catch (error) {
            reportFailure(deps.loadBoundary, error)
            return { ok: false, message: toUserMessage(error) }
          }
        },
        deleteAndRestart: async () => {
          try {
            await deps.getSaveService().deleteSave()
            deps.setState(createPet(deps.now()))
            deps.render()
            renderMemoryBook()
            return { ok: true }
          } catch (error) {
            reportFailure(deps.importBoundary, error)
            return { ok: false, message: '删除失败，请手动清理应用数据。' }
          }
        },
        // Exiting from the recovery panel must NOT try to save: the runtime keeps
        // autosave paused precisely so a corrupt archive is never overwritten.
        exitApp: () => {
          deps.exitApplication()
          return { ok: true }
        },
        onClose: (reason) => {
          if (reason === 'saved') {
            deps.showBubble('已写入新档，自动保存已恢复。')
          } else if (reason === 'deleted') {
            deps.showBubble('本机存档已删除，自动保存已恢复。')
          } else if (reason === 'dismissed') {
            deps.showBubble('已稍后处理：自动保存仍暂停，可从「更多 → 读取」重新打开恢复面板。')
          }
        },
      })
    }
    recoveryPanel.show()
  }

  function setMuted(next: boolean): void {
    if (!canInteract()) return
    if (deps.getState().muted === next) return
    deps.setState(setPetMuted(deps.getState(), next))
    if (deps.getState().muted) deps.stopVoice()
    else void deps.requestTtsConfirmation().catch((error) => reportFailure(deps.ttsBoundary, error))
    deps.render()
  }

  function setVolume(next: number): number {
    if (!canInteract()) return volume
    if (Number.isFinite(next)) volume = Math.max(0, Math.min(100, Math.round(next)))
    const stored = safeSetItem(VOLUME_STORAGE_KEY, String(volume), deps.storage)
    if (stored !== 'ok') reportFailure(deps.storageBoundary, new Error(`volume-storage-${stored}`))
    deps.setAudioGain(Math.max(0, Math.min(1, volume / 100)))
    if (volElement) volElement.value = String(volume)
    return volume
  }

  // Volume is part of the TTS config: re-confirm the TTS declaration on release
  // (not on every slider tick) when voice is currently enabled.
  function commitVolume(): void {
    if (!canInteract() || deps.getState().muted) return
    void deps.requestTtsConfirmation().catch((error) => reportFailure(deps.ttsBoundary, error))
  }

  function bind(): void {
    volElement = document.getElementById('vol') as HTMLInputElement | null
    const input = volElement
    if (input) {
      input.value = String(volume)
      input.addEventListener('input', () => { setVolume(Number(input.value)) })
      input.addEventListener('change', () => { commitVolume() })
    }
    document.getElementById('mute')?.addEventListener('click', () => setMuted(!deps.getState().muted))
    document.getElementById('reset-window')?.addEventListener('click', () => resetWindow())
    document.getElementById('voice-cache')?.addEventListener('click', () => clearVoiceCache())
    document.getElementById('memory-book')?.addEventListener('click', () => openMemoryScreen())
    document.getElementById('memory-forget-all')?.addEventListener('click', () => forgetAllMemory())
    document.getElementById('memory-export')?.addEventListener('click', () => exportMemory())
    document.getElementById('memory-close')?.addEventListener('click', () => hideMemoryScreen())
    document.getElementById('save-export')?.addEventListener('click', () => exportArchive())
    document.getElementById('save-delete')?.addEventListener('click', () => deleteArchive())
    document.getElementById('save-import')?.addEventListener('click', () => pickImportFile())
    document.getElementById('save-import-file')?.addEventListener('change', () => importArchiveFile())
  }

  return {
    get volume() { return volume },
    getAudioState: () => ({ muted: deps.getState().muted, volume }),
    setMuted,
    setVolume,
    commitVolume,
    quietHoursActive: (at: Date = new Date()) => isQuietHoursActive(at, quietHoursSettings),
    setQuietHours: (next: QuietHoursSettings) => { quietHoursSettings = next },
    reloadQuietHours: () => { quietHoursSettings = readQuietHours(deps.storage) },
    resetWindow,
    clearVoiceCache,
    renderMemoryBook,
    openMemoryScreen,
    hideMemoryScreen,
    openRecoveryPanel,
    closeRecoveryPanel,
    isRecoveryPanelVisible: () => recoveryPanel?.visible === true,
    bind,
    shellOptions: () => ({
      getAudioState: () => ({ muted: deps.getState().muted, volume }),
      setMuted: (next: boolean) => setMuted(next),
      setVolume: (next: number) => { setVolume(next) },
      onVolumeCommit: () => commitVolume(),
      resetWindow: () => resetWindow(),
      onQuietHoursChange: (next: QuietHoursSettings) => { quietHoursSettings = next },
    }),
  }
}
