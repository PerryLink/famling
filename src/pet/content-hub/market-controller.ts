/**
 * 市场 tab controller, split out of `initContentHub` (E10 / MB-101).
 *
 * Owns the lazily-created injected market installer (E8 / MB-084), the
 * fail-closed refresh entry point and the per-render install context. Network
 * effects stay behind the injected RemoteMarketSource; nothing here fetches by
 * itself and the default production wiring stays absent.
 */
import {
  canRequestRemoteMarket,
  defaultContentMarketState,
  describeContentMarketState,
  renderMarketTab,
  type ContentHubMarketRefreshResult,
  type ContentMarketUiState,
  type MarketInstallTabContext,
  type MarketTabRenderContext,
  type RemoteMarketSource,
} from './market.ts'
import {
  createMarketInstallController,
  type MarketInstallActionResult,
  type MarketInstallController,
  type MarketInstallHostOptions,
  type MarketInstallUiState,
} from './market-install.ts'
import type { HubBusyFlag, HubFeedbackSink, HubRenderSurface } from './shared.ts'

export interface MarketTabControllerOptions {
  /** undefined = feature absent (metadata placeholder); null = inert no-source adapter. */
  readonly marketSource: RemoteMarketSource | null | undefined
  /** Pinned trust root + verifier, storage and uninstall callback. */
  readonly marketHost?: Omit<MarketInstallHostOptions, 'onChange'>
  /** Metadata-only refresh fallback (no installer injected). */
  readonly refreshMarket?: () => Promise<ContentHubMarketRefreshResult>
  readonly getMarketState?: () => ContentMarketUiState
  /** Shared single-flight flag (also used by the theme-pack importer). */
  readonly busy: HubBusyFlag
  readonly feedback: HubFeedbackSink
  /** Re-render the active tab after an installer state change. */
  readonly onChange: () => void
  /** Recompute the footer pack summary after an installer state change. */
  readonly onSummary: () => void
  /** True while the dialog is open on the 市场 tab (installer change events). */
  readonly isActive: () => boolean
}

export interface MarketTabController {
  renderMarket(surface: HubRenderSurface): void
  /** Test/diagnostic hook: true when a market install adapter was injected. */
  hasInstaller(): boolean
  hasRefreshHandler(): boolean
  /** Explicit user refresh (the only path that can reach the network). */
  handleRefresh(): void
  /** Drop a pending uninstall confirmation on tab switch (no state changed). */
  cancelUninstallConfirm(): void
  /** Abort pending work and stop installer change events. */
  destroy(): void
}

export function createMarketTabController(options: MarketTabControllerOptions): MarketTabController {
  let marketState: ContentMarketUiState | null = null
  let marketInstall: MarketInstallController | null = null
  let marketUninstallConfirm: { readonly packId: string } | null = null

  /** Lazily build the injected market install adapter (absent = old placeholder). */
  function marketInstaller(): MarketInstallController | null {
    if (options.marketSource === undefined) return null
    if (marketInstall !== null) return marketInstall
    marketInstall = createMarketInstallController(options.marketSource, {
      ...(options.marketHost ?? {}),
      onChange: (): void => {
        if (options.isActive()) options.onChange()
      },
    })
    return marketInstall
  }

  function marketHasRefreshHandler(): boolean {
    return options.refreshMarket !== undefined || marketInstaller() !== null
  }

  function getMarketState(): ContentMarketUiState {
    const installer = marketInstaller()
    if (installer !== null) {
      try {
        const state = installer.state()
        if (!state.configured) return defaultContentMarketState()
        if (state.catalogVersion === null) {
          return describeContentMarketState(options.marketSource ?? null)
        }
        const packs = state.rows
          .filter((row) => row.offered && row.marketVersion !== null)
          .map((row) =>
            Object.freeze({
              id: row.packId,
              name: row.name,
              version: row.marketVersion as string,
              description: row.description,
            }),
          )
        return Object.freeze({
          status: 'configured' as const,
          configured: true,
          title: '市场目录已验签 · 需要显式操作才会联网',
          detail:
            '目录版本 ' +
            state.catalogVersion +
            '；安装仍需逐包确认统一用途声明，失败/取消不会留下半装内容。',
          ...(state.sourceLabel !== null ? { sourceLabel: state.sourceLabel } : {}),
          catalogVersion: state.catalogVersion,
          packs: Object.freeze(packs),
        })
      } catch {
        return defaultContentMarketState()
      }
    }
    if (marketState !== null) return marketState
    try {
      return options.getMarketState?.() ?? defaultContentMarketState()
    } catch {
      return defaultContentMarketState()
    }
  }

  function runMarketAction(action: () => MarketInstallActionResult): void {
    let result: MarketInstallActionResult
    try {
      result = action()
    } catch {
      result = { ok: false, message: '市场操作失败，请稍后再试。' }
    }
    options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
    options.onChange()
  }

  async function runMarketAsync(action: () => Promise<MarketInstallActionResult>): Promise<void> {
    try {
      const result = await action()
      options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
    } catch {
      options.feedback.setFeedback('市场操作失败；没有安装任何未验签的远程内容。', 'error')
    } finally {
      options.onChange()
      options.onSummary()
    }
  }

  function marketInstallTabContext(
    controller: MarketInstallController,
  ): NonNullable<MarketTabRenderContext['install']> {
    return {
      getState: (): MarketInstallUiState => controller.state(),
      getUninstallConfirm: () => marketUninstallConfirm,
      onRequestInstall: (packId): void => {
        runMarketAction(() => controller.requestInstall(packId))
      },
      onConfirmInstall: (): void => {
        void runMarketAsync(async () => await controller.confirmInstall())
      },
      onCancelConfirmation: (): void => {
        controller.cancelPendingInstall()
        options.feedback.setFeedback('已取消安装（未下载任何内容）。', 'info')
        options.onChange()
      },
      onCancelOperation: (): void => {
        runMarketAction(() => controller.cancel())
      },
      onRetry: (): void => {
        void runMarketAsync(async () => await controller.retry())
      },
      onClearFailure: (): void => {
        controller.clearFailure()
        options.feedback.setFeedback('已清理失败状态；可重新选择安装。', 'info')
        options.onChange()
      },
      onRequestUninstall: (packId): void => {
        marketUninstallConfirm = { packId }
        options.onChange()
      },
      onConfirmUninstall: (): void => {
        const pendingUninstall = marketUninstallConfirm
        marketUninstallConfirm = null
        if (pendingUninstall === null) return
        void runMarketAsync(async () => await controller.uninstall(pendingUninstall.packId))
      },
      onCancelUninstall: (): void => {
        marketUninstallConfirm = null
        options.feedback.setFeedback('已取消卸载，内容保持不变。', 'info')
        options.onChange()
      },
      onLockVersion: (packId): void => {
        runMarketAction(() => controller.lockVersion(packId))
      },
      onUnlockVersion: (packId): void => {
        runMarketAction(() => controller.unlockVersion(packId))
      },
    }
  }

  function renderMarket(surface: HubRenderSurface): void {
    const installer = marketInstaller()
    renderMarketTab({
      ...surface,
      getMarketState,
      hasRefreshHandler: marketHasRefreshHandler(),
      onRefreshMarket: (): void => {
        void handleRefreshMarket()
      },
      ...(installer !== null ? { install: marketInstallTabContext(installer) } : {}),
    })
  }

  async function handleRefreshMarket(): Promise<void> {
    const installer = marketInstaller()
    if (installer !== null) {
      // Defense in depth (task-75): even a programmatic click must not reach the
      // network in the unconfigured state. The controller re-checks configured
      // and the injected verify deps before calling the source.
      if (!canRequestRemoteMarket(getMarketState(), true)) {
        options.feedback.setFeedback('远程市场未配置：不会发起任何网络请求。', 'info')
        return
      }
      if (options.busy.isBusy()) return
      options.busy.setBusy(true)
      options.feedback.setFeedback('正在读取市场目录（需要显式点击后才联网）…', 'info')
      try {
        const result = await installer.refresh()
        options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
        options.onChange()
      } catch {
        options.feedback.setFeedback('读取市场目录失败；未安装任何远程内容。', 'error')
      } finally {
        options.busy.setBusy(false)
      }
      return
    }
    const refresh = options.refreshMarket
    if (refresh === undefined || options.busy.isBusy()) return
    // Defense in depth (task-75): a programmatic click, a queued event or a host
    // that wired refreshMarket before the source was configured must never reach
    // the network. The default unconfigured state short-circuits with zero calls.
    if (!canRequestRemoteMarket(getMarketState(), true)) {
      options.feedback.setFeedback('远程市场未配置：不会发起任何网络请求。', 'info')
      return
    }
    options.busy.setBusy(true)
    options.feedback.setFeedback('正在读取市场目录（需要显式点击后才联网）…', 'info')
    try {
      const result = await refresh()
      options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
      if (result.state !== undefined) marketState = result.state
      options.onChange()
    } catch {
      options.feedback.setFeedback('读取市场目录失败；未安装任何远程内容。', 'error')
    } finally {
      options.busy.setBusy(false)
    }
  }

  function cancelUninstallConfirm(): void {
    marketUninstallConfirm = null
  }

  function destroy(): void {
    marketInstall?.destroy()
    marketInstall = null
    marketUninstallConfirm = null
  }

  return {
    renderMarket,
    hasInstaller: (): boolean => marketInstaller() !== null,
    hasRefreshHandler: marketHasRefreshHandler,
    handleRefresh: (): void => {
      void handleRefreshMarket()
    },
    cancelUninstallConfirm,
    destroy,
  }
}
