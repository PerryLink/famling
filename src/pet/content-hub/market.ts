/**
 * Remote-market contract metadata, fail-closed UI state helpers and the 市场
 * tab renderer. Split out of content-hub.ts (task-96 / E10); this module never
 * fetches or installs anything.
 */
import {
  CONTENT_USAGE_CONFIRMATION_REQUIRED,
  type ContentEd25519Verifier,
  type ContentMarketCatalog,
  type ContentMarketPack,
  type ContentSignatureVerification,
  type ContentTrustRoot,
} from '../content-library.ts'
import { PROHIBITED_USE_LABELS } from './packs.ts'
import type { MarketInstallUiState } from './market-install.ts'
import { CONTENT_HUB_NOTICE, type HubRenderSurface } from './shared.ts'

/** Host callbacks + DOM surface consumed by the 市场 renderer. */
export interface MarketTabRenderContext extends HubRenderSurface {
  readonly getMarketState: () => ContentMarketUiState
  readonly hasRefreshHandler: boolean
  readonly onRefreshMarket: () => void
  /**
   * Optional install-UI adapter (E8 / MB-084). When present the 市场 tab renders
   * the install progress/cancel/failure-recovery/offline/uninstall/version-lock
   * UI driven by an injected RemoteMarketSource. Absent = the original
   * metadata-only placeholder (default, zero network).
   */
  readonly install?: MarketInstallTabContext
}

/** Pending destructive action awaiting a second explicit click. */
export interface MarketUninstallConfirmRequest {
  readonly packId: string
}

/** Host callbacks consumed by the 市场 install renderer (all user-initiated). */
export interface MarketInstallTabContext {
  readonly getState: () => MarketInstallUiState
  readonly getUninstallConfirm: () => MarketUninstallConfirmRequest | null
  readonly onRequestInstall: (packId: string) => void
  readonly onConfirmInstall: () => void
  readonly onCancelConfirmation: () => void
  readonly onCancelOperation: () => void
  readonly onRetry: () => void
  readonly onClearFailure: () => void
  readonly onRequestUninstall: (packId: string) => void
  readonly onConfirmUninstall: () => void
  readonly onCancelUninstall: () => void
  readonly onLockVersion: (packId: string) => void
  readonly onUnlockVersion: (packId: string) => void
}

// ---------------------------------------------------------------------------
// Market contract (metadata only; this module never fetches)
// ---------------------------------------------------------------------------

/** One market listing as shown in the 市场 tab. */
export interface ContentMarketListing {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description: string
}

export type ContentMarketUiStatus = 'unconfigured' | 'configured' | 'error'

export interface ContentMarketUiState {
  readonly status: ContentMarketUiStatus
  readonly configured: boolean
  readonly title: string
  readonly detail: string
  readonly sourceLabel?: string
  readonly catalogVersion?: string
  readonly packs?: readonly ContentMarketListing[]
}

/** Verification dependencies a remote market implementation must receive. */
export interface RemoteMarketVerifyDeps {
  readonly trustRoot: ContentTrustRoot
  readonly verifier: ContentEd25519Verifier
  readonly now?: string
}

/**
 * Remote market source contract (fetch / verify / install). The UI NEVER calls
 * it by itself: the default state is unconfigured and no network request is
 * made until a host explicitly wires a configured source + installer.
 *
 * v1 implementation: createRemoteMarketSource() in src/pet/content-market.ts
 * implements this interface (catalog verification, anti-rollback, bounded
 * download, injected install callbacks). Wire its createRemoteMarketRefresh()
 * into ContentHubOptions.refreshMarket after an explicit user click; this
 * module stays fetch-free either way.
 */
export interface RemoteMarketSource {
  readonly id: string
  readonly label: string
  /** False until a real, reviewed production market is configured. */
  readonly configured: boolean
  fetchCatalog(options?: { readonly signal?: AbortSignal }): Promise<unknown>
  fetchPackBytes(pack: ContentMarketPack, options?: { readonly signal?: AbortSignal }): Promise<ArrayBuffer>
  verifyCatalog(catalog: ContentMarketCatalog, deps: RemoteMarketVerifyDeps): ContentSignatureVerification
  verifyPack(
    pack: ContentMarketPack,
    zipSha256: string,
    deps: RemoteMarketVerifyDeps,
  ): ContentSignatureVerification
  installPack?(pack: ContentMarketPack, bundle: ArrayBuffer): Promise<unknown>
}

/** Steps a future remote installer must implement (fail-closed order). */
export const CONTENT_MARKET_CONTRACT_STEPS: readonly string[] = Object.freeze([
  '1. 拉取市场目录 catalog.json（只有用户点击后才可能联网；出网必须经宿主注入的 transport，WebView 不直接 fetch）',
  '2. validateMarketCatalog + verifyMarketCatalogSignature（Ed25519 / 信任根）',
  '3. 展示该包的统一用途声明，用户显式确认后才允许下载',
  '4. 下载 .zip，先比 zipSha256，再 verifyMarketPackDownload 验签',
  '5. 解压 + validateContentPackV2 + validatePackZip（路径/大小/哈希）',
  '6. pack.json 的 remote.signature 用 verifyRemoteContentPack 再验',
  '7. mergeCharacterThemes({ verifyRemote }) 原子合并；可卸载/离线缓存，不静默更新',
])

/** Default state: the online market is not configured, so nothing fetches. */
export function defaultContentMarketState(): ContentMarketUiState {
  return Object.freeze({
    status: 'unconfigured' as const,
    configured: false,
    title: '服务器未配置 · 默认不联网',
    detail:
      '远程在线市场尚未配置：本页只显示状态与验签流程，不会发起任何网络请求，也不会下载/安装任何内容。本地 .json / .zip / 文件夹导入可用。',
  })
}

/** Describe the injected market source (or the honest unconfigured default). */
export function describeContentMarketState(
  source?: Pick<RemoteMarketSource, 'id' | 'label' | 'configured'> | null,
): ContentMarketUiState {
  if (!source || source.configured !== true) return defaultContentMarketState()
  return Object.freeze({
    status: 'configured' as const,
    configured: true,
    title: '市场已配置 · 需要显式操作才会联网',
    detail:
      '已注入远程市场源「' +
      source.label +
      '」。本页不会自动请求；连接/刷新必须由你点击，且只接受 Ed25519 验签通过的内容。',
    sourceLabel: source.label,
  })
}

/** Summarize an already validated market catalog for rendering (no fetching). */
export function summarizeMarketCatalog(
  catalog: ContentMarketCatalog,
  sourceLabel?: string,
): ContentMarketUiState {
  const packs: ContentMarketListing[] = catalog.packs.map((pack) =>
    Object.freeze({
      id: pack.id,
      name: pack.name,
      version: pack.version,
      description: pack.description,
    }),
  )
  const base = sourceLabel === undefined ? '市场目录' : '市场目录 · ' + sourceLabel
  return Object.freeze({
    status: 'configured' as const,
    configured: true,
    title: base + '（已验签）',
    detail:
      '目录版本 ' +
      catalog.version +
      '，更新于 ' +
      catalog.updatedAt +
      '。下载/安装仍需要逐包用途声明确认，未验签内容不会合并。',
    ...(sourceLabel !== undefined ? { sourceLabel } : {}),
    catalogVersion: catalog.version,
    packs: Object.freeze(packs),
  })
}

export function isRemoteMarketConfigured(source?: Pick<RemoteMarketSource, 'configured'> | null): boolean {
  return source?.configured === true
}

/**
 * Single network fuse for the 市场 tab (task-75/MB-086). A remote refresh may run
 * only when the host-injected source reports configured:true AND a refresh
 * callback was wired. The default state is unconfigured, so opening the market
 * tab (or calling the controller refresh) performs ZERO network requests.
 *
 * content-hub itself never fetches; the callable it forwards to lives in
 * content-market.ts and only works with a host-injected transport (default null).
 */
export function canRequestRemoteMarket(
  state: Pick<ContentMarketUiState, 'configured'> | null | undefined,
  hasRefreshHandler: boolean,
): boolean {
  return hasRefreshHandler === true && state?.configured === true
}

export interface ContentHubMarketRefreshResult {
  readonly ok: boolean
  readonly message: string
  readonly state?: ContentMarketUiState
}

/** Render the 市场 tab (offline-by-default status + verification contract). */
export function renderMarketTab(ctx: MarketTabRenderContext): void {
  if (ctx.install !== undefined) {
    renderMarketInstallTab(ctx, ctx.install)
    return
  }
  const { create, panelBody, getMarketState, hasRefreshHandler, onRefreshMarket } = ctx

  const state = getMarketState()
  const card = create('section', 'content-hub-market')
  const status = create('p', 'content-hub-market-status')
  status.textContent = state.title
  status.dataset.status = state.status
  const detail = create('p', 'content-hub-blurb')
  detail.textContent = state.detail
  card.append(status, detail)
  if (state.sourceLabel !== undefined) {
    const source = create('p', 'content-hub-pack-meta')
    source.textContent = '市场源：' + state.sourceLabel
    card.append(source)
  }
  const actions = create('div', 'content-hub-actions')
  const refresh = create('button', 'content-hub-market-refresh')
  refresh.type = 'button'
  refresh.textContent = state.configured ? '刷新市场目录…' : '远程市场未配置（不联网）'
  refresh.disabled = !canRequestRemoteMarket(state, hasRefreshHandler)
  refresh.addEventListener('click', () => {
    void onRefreshMarket()
  })
  actions.append(refresh)
  card.append(actions)
  if (state.packs !== undefined && state.packs.length > 0) {
    const heading = create('h4', 'content-hub-group-heading')
    heading.textContent = '市场目录（已验签）'
    card.append(heading)
    const list = create('div', 'content-hub-pack-list')
    for (const pack of state.packs) {
      const row = create('article', 'content-hub-pack')
      const name = create('strong', 'content-hub-pack-name')
      name.textContent = pack.name
      const version = create('span', 'content-hub-pack-version')
      version.textContent = 'v' + pack.version
      const description = create('p', 'content-hub-pack-meta')
      description.textContent = pack.description
      row.append(name, version, description)
      list.append(row)
    }
    card.append(list)
  }
  const stepsTitle = create('h4', 'content-hub-group-heading')
  stepsTitle.textContent = '远程市场安装契约（预留，必须 fail-closed）'
  card.append(stepsTitle)
  const steps = create('ol', 'content-hub-market-steps')
  for (const step of CONTENT_MARKET_CONTRACT_STEPS) {
    const item = create('li', 'content-hub-market-step')
    item.textContent = step
    steps.append(item)
  }
  card.append(steps)
  const note = create('p', 'content-hub-pack-note')
  note.textContent =
    '本页不会自动联网；没有市场源/未验签/哈希不符/声明不匹配的内容不会下载或合并。' +
    '远程市场 UI 只是入口，安装器与生产信任根完成前不提供在线商品。'
  card.append(note)
  if (CONTENT_USAGE_CONFIRMATION_REQUIRED) {
    const declaration = create('p', 'content-hub-declaration-ref')
    declaration.textContent = '统一用途声明：' + CONTENT_HUB_NOTICE
    card.append(declaration)
  }
  panelBody.append(card)
}


// ---------------------------------------------------------------------------
// Market install UI (E8 / MB-084 engineering part)
// ---------------------------------------------------------------------------

function marketInstallStatusTitle(state: MarketInstallUiState): string {
  switch (state.status) {
    case 'unconfigured':
      return '服务器未配置 · 默认不联网'
    case 'offline':
      return '离线 · 保留上次已验签目录'
    case 'failed':
      return '市场操作失败（未安装任何未验签内容）'
    case 'cancelled':
      return '操作已取消（未安装任何内容）'
    case 'awaiting-confirmation':
      return '安装前确认 · 尚未下载任何字节'
    case 'installing':
      return '正在下载并安装（分阶段进度）'
    case 'uninstalling':
      return '正在卸载远程内容…'
    case 'refreshing':
      return '正在刷新市场目录…'
    default:
      return state.catalogVersion !== null
        ? '市场目录已验签 · 需要显式操作才会联网'
        : '市场已配置 · 需要显式操作才会联网'
  }
}

function marketInstallStatusDetail(state: MarketInstallUiState): string {
  if (!state.available || !state.configured) {
    return '远程在线市场尚未配置：本页只显示状态与验签流程，不会发起任何网络请求，也不会下载/安装任何内容。本地 .json / .zip / 文件夹导入可用。'
  }
  if (state.offline) {
    return (
      (state.offlineReason ?? '市场当前不可达') +
      '；保留上次已验签目录供浏览，安装保持禁用；恢复联网后点击「刷新市场目录…」。'
    )
  }
  if (state.failure !== null) return state.failure.message + '（' + state.failure.code + '）'
  if (state.progress !== null) {
    return '第 ' + state.progress.step + '/' + state.progress.totalSteps + ' 步：' + state.progress.label
  }
  if (state.confirmation !== null) {
    return '请阅读统一用途声明并点击确认；确认前不会下载任何字节，取消不留下任何文件。'
  }
  if (state.catalogVersion !== null) {
    return (
      '目录版本 ' +
      state.catalogVersion +
      '（更新于 ' +
      (state.catalogUpdatedAt ?? '未知') +
      '）。安装会逐包下载、校验 SHA-256 与 Ed25519 签名后才交给本机安装器；不会静默更新。'
    )
  }
  return '已注入远程市场源。本页不会自动请求；连接/刷新必须由你点击，且只接受 Ed25519 验签通过的内容。'
}

function appendMarketInstallProgress(
  ctx: MarketTabRenderContext,
  card: HTMLElement,
  install: MarketInstallTabContext,
  state: MarketInstallUiState,
): void {
  const { create } = ctx
  if (state.progress === null || !state.busy) return
  const progress = state.progress
  const section = create('section', 'content-hub-market-progress')
  section.setAttribute('aria-live', 'polite')
  section.dataset.installStage = progress.stage
  if (progress.packId !== null) section.dataset.packId = progress.packId
  const label = create('p', 'content-hub-pack-note')
  label.textContent = '进度：第 ' + progress.step + '/' + progress.totalSteps + ' 步 · ' + progress.label
  const bar = create('progress', 'content-hub-market-progress-bar')
  bar.max = progress.totalSteps
  bar.value = progress.step
  bar.setAttribute('max', String(progress.totalSteps))
  bar.setAttribute('value', String(progress.step))
  bar.setAttribute('aria-label', '市场安装进度：第 ' + progress.step + ' 步，共 ' + progress.totalSteps + ' 步')
  section.append(label, bar)
  if (progress.bytes !== null) {
    const bytes = create('p', 'content-hub-pack-meta')
    bytes.textContent = '已下载并确认大小：' + progress.bytes + ' 字节（下载阶段没有字节级进度，完成后才显示总量）。'
    section.append(bytes)
  }
  if (progress.cancellable) {
    const cancel = create('button', 'content-hub-confirm-cancel content-hub-market-cancel')
    cancel.type = 'button'
    cancel.textContent = '取消安装（不留下半装文件）'
    cancel.addEventListener('click', () => {
      install.onCancelOperation()
    })
    const actions = create('div', 'content-hub-actions')
    actions.append(cancel)
    section.append(actions)
  }
  card.append(section)
}

function appendMarketInstallFailure(
  ctx: MarketTabRenderContext,
  card: HTMLElement,
  install: MarketInstallTabContext,
  state: MarketInstallUiState,
): void {
  const { create } = ctx
  if (state.failure === null || state.progress !== null) return
  const failure = state.failure
  const section = create('section', 'content-hub-confirm content-hub-market-failure')
  section.dataset.failureCode = failure.code
  section.dataset.failureStage = failure.stage
  const heading = create('h3', 'content-hub-confirm-title')
  heading.textContent =
    failure.code === 'cancelled'
      ? '已取消（没有安装任何内容）'
      : failure.stage === 'uninstall'
        ? '卸载失败 / 未完成'
        : failure.stage === 'catalog'
          ? '市场目录读取 / 验签失败'
          : '安装失败 / 未完成'
  const message = create('p', 'content-hub-pack-meta')
  message.textContent = failure.message + '（' + failure.code + ' · 阶段 ' + failure.stage + '）'
  const hint = create('p', 'content-hub-pack-note')
  hint.textContent = failure.retryable
    ? '安装是原子的：失败/取消不会留下部分安装。可以重试，或清理失败状态后重新选择。'
    : '该失败重试同样的操作无法解决（例如验签失败/安装器未注入），请清理失败状态后重新选择。'
  const actions = create('div', 'content-hub-actions')
  if (failure.retryable) {
    const retry = create('button', 'content-hub-confirm-ok content-hub-market-retry')
    retry.type = 'button'
    retry.textContent = failure.code === 'cancelled' ? '重新安装' : '重试'
    retry.addEventListener('click', () => {
      install.onRetry()
    })
    actions.append(retry)
  }
  const clear = create('button', 'content-hub-confirm-cancel content-hub-market-clear-failure')
  clear.type = 'button'
  clear.textContent = '清理失败状态'
  clear.addEventListener('click', () => {
    install.onClearFailure()
  })
  actions.append(clear)
  section.append(heading, message, hint, actions)
  card.append(section)
}

function appendMarketInstallConfirmation(
  ctx: MarketTabRenderContext,
  card: HTMLElement,
  install: MarketInstallTabContext,
  state: MarketInstallUiState,
): void {
  const { create } = ctx
  const confirmation = state.confirmation
  if (confirmation === null || state.progress !== null) return
  const section = create('section', 'content-hub-confirm content-hub-market-confirm')
  section.dataset.packId = confirmation.packId
  const heading = create('h3', 'content-hub-confirm-title')
  heading.textContent = '安装前确认：' + confirmation.name + ' v' + confirmation.version
  const meta = create('p', 'content-hub-pack-meta')
  meta.textContent = '下载大小 ' + confirmation.bytes + ' 字节 · 市场版本 ' + confirmation.version + ' · ' + confirmation.description
  const label = create('p', 'content-hub-declaration-label')
  label.textContent = '统一用途声明（逐字校验通过，必须阅读）：'
  const statement = create('p', 'content-hub-declaration')
  statement.textContent = confirmation.usageStatement
  const ref = create('p', 'content-hub-declaration-ref')
  ref.textContent = '声明文件：' + confirmation.statementRef + ' · SHA-256 ' + confirmation.usageSha256
  const prohibited = create('ul', 'content-hub-prohibited')
  for (const id of confirmation.prohibitedUses) {
    const item = create('li', 'content-hub-prohibited-item')
    item.textContent = '禁止：' + (PROHIBITED_USE_LABELS[id as keyof typeof PROHIBITED_USE_LABELS] ?? id)
    prohibited.append(item)
  }
  const hint = create('p', 'content-hub-pack-note')
  hint.textContent =
    '点击「确认下载并安装」表示你已阅读并同意上述统一用途声明；远程内容仅限研究与原型验证用途，可随时卸载。'
  const actions = create('div', 'content-hub-actions')
  const confirm = create('button', 'content-hub-confirm-ok content-hub-market-confirm-ok')
  confirm.type = 'button'
  confirm.textContent = '确认下载并安装'
  confirm.addEventListener('click', () => {
    install.onConfirmInstall()
  })
  const cancel = create('button', 'content-hub-confirm-cancel content-hub-market-confirm-cancel')
  cancel.type = 'button'
  cancel.textContent = '取消'
  cancel.addEventListener('click', () => {
    install.onCancelConfirmation()
  })
  actions.append(confirm, cancel)
  section.append(heading, meta, label, statement, ref, prohibited, hint, actions)
  card.append(section)
}

function appendMarketInstallRows(
  ctx: MarketTabRenderContext,
  card: HTMLElement,
  install: MarketInstallTabContext,
  state: MarketInstallUiState,
): void {
  const { create, appendEmpty } = ctx
  if (state.rows.length === 0) {
    if (state.configured && !state.offline) {
      appendEmpty('尚无已验签市场目录：点击「刷新市场目录…」取得目录后才会显示内容包。')
    }
    return
  }
  const heading = create('h4', 'content-hub-group-heading')
  heading.textContent = state.catalogVersion !== null ? '市场目录（已验签）' : '已安装的远程内容'
  card.append(heading)
  const list = create('div', 'content-hub-pack-list')
  for (const row of state.rows) {
    const article = create('article', 'content-hub-pack content-hub-market-pack')
    article.dataset.packId = row.packId
    const head = create('div', 'content-hub-pack-head')
    const name = create('strong', 'content-hub-pack-name')
    name.textContent = row.name
    head.append(name)
    if (row.marketVersion !== null) {
      const version = create('span', 'content-hub-pack-version')
      version.textContent = '市场 v' + row.marketVersion
      head.append(version)
    }
    if (row.installedVersion !== null) {
      const badge = create('span', 'content-hub-badge content-hub-market-installed-badge')
      badge.textContent = '已安装 v' + row.installedVersion
      head.append(badge)
    }
    if (row.lockedVersion !== null) {
      const badge = create('span', 'content-hub-badge content-hub-market-lock-badge')
      badge.textContent = '已锁定 v' + row.lockedVersion
      head.append(badge)
    }
    if (row.updateAvailable) {
      const badge = create('span', 'content-hub-badge content-hub-market-update-badge')
      badge.textContent = '可更新'
      head.append(badge)
    }
    if (!row.offered) {
      const badge = create('span', 'content-hub-badge content-hub-market-orphan-badge')
      badge.textContent = '目录未列出'
      head.append(badge)
    }
    article.append(head)
    const description = create('p', 'content-hub-pack-meta')
    description.textContent = row.description
    article.append(description)
    const actions = create('div', 'content-hub-actions')
    if (row.offered) {
      const installButton = create('button', 'content-hub-apply content-hub-market-install')
      installButton.type = 'button'
      installButton.dataset.packId = row.packId
      installButton.textContent = row.updateAvailable ? '更新…' : '安装…'
      installButton.disabled = !row.canInstall
      if (row.installDisabledReason !== null) installButton.title = row.installDisabledReason
      installButton.addEventListener('click', () => {
        install.onRequestInstall(row.packId)
      })
      actions.append(installButton)
    }
    if (row.installedVersion !== null) {
      const uninstallButton = create('button', 'content-hub-restore content-hub-market-uninstall')
      uninstallButton.type = 'button'
      uninstallButton.dataset.packId = row.packId
      uninstallButton.textContent = '卸载…'
      uninstallButton.disabled = !row.canUninstall
      if (!row.canUninstall) {
        uninstallButton.title = state.uninstallerConfigured ? '当前有操作进行中' : '宿主未注入卸载入口'
      }
      uninstallButton.addEventListener('click', () => {
        install.onRequestUninstall(row.packId)
      })
      actions.append(uninstallButton)
    }
    if (row.canLock) {
      const lock = create('button', 'content-hub-restore content-hub-market-lock')
      lock.type = 'button'
      lock.dataset.packId = row.packId
      lock.textContent = '锁定当前版本'
      lock.addEventListener('click', () => {
        install.onLockVersion(row.packId)
      })
      actions.append(lock)
    }
    if (row.canUnlock) {
      const unlock = create('button', 'content-hub-restore content-hub-market-unlock')
      unlock.type = 'button'
      unlock.dataset.packId = row.packId
      unlock.textContent = '解除版本锁'
      unlock.addEventListener('click', () => {
        install.onUnlockVersion(row.packId)
      })
      actions.append(unlock)
    }
    if (actions.children.length > 0) article.append(actions)
    if (row.installDisabledReason !== null && row.offered && !row.canInstall) {
      const reason = create('p', 'content-hub-pack-note content-hub-market-reason')
      reason.textContent = row.installDisabledReason
      article.append(reason)
    }
    list.append(article)
  }
  card.append(list)
}

function appendMarketUninstallConfirm(
  ctx: MarketTabRenderContext,
  card: HTMLElement,
  install: MarketInstallTabContext,
  state: MarketInstallUiState,
): void {
  const { create } = ctx
  const confirm = install.getUninstallConfirm()
  if (confirm === null) return
  const row = state.rows.find((candidate) => candidate.packId === confirm.packId)
  const section = create('section', 'content-hub-confirm content-hub-market-uninstall-confirm')
  section.dataset.packId = confirm.packId
  const heading = create('h3', 'content-hub-confirm-title')
  heading.textContent = '确认卸载：' + (row?.name ?? confirm.packId)
  const hint = create('p', 'content-hub-pack-note')
  hint.textContent =
    '卸载只删除该远程内容包的本地文件、安装记录与版本锁；内置内容和其他包不受影响。卸载后仍可重新安装（需再次确认用途声明）。'
  const actions = create('div', 'content-hub-actions')
  const ok = create('button', 'content-hub-confirm-ok content-hub-market-uninstall-ok')
  ok.type = 'button'
  ok.textContent = '确认卸载'
  ok.addEventListener('click', () => {
    install.onConfirmUninstall()
  })
  const cancel = create('button', 'content-hub-confirm-cancel content-hub-market-uninstall-cancel')
  cancel.type = 'button'
  cancel.textContent = '取消'
  cancel.addEventListener('click', () => {
    install.onCancelUninstall()
  })
  actions.append(ok, cancel)
  section.append(heading, hint, actions)
  card.append(section)
}

/** Rich 市场 tab: install progress / cancel / recovery / offline / uninstall / version lock. */
function renderMarketInstallTab(ctx: MarketTabRenderContext, install: MarketInstallTabContext): void {
  const { create, panelBody, hasRefreshHandler, onRefreshMarket } = ctx
  const state = install.getState()

  const card = create('section', 'content-hub-market content-hub-market-installui')
  card.dataset.marketStatus = state.status
  if (state.busy) card.setAttribute('aria-busy', 'true')
  const status = create('p', 'content-hub-market-status')
  status.textContent = marketInstallStatusTitle(state)
  status.dataset.status = state.status
  const detail = create('p', 'content-hub-blurb')
  detail.textContent = marketInstallStatusDetail(state)
  card.append(status, detail)
  if (state.sourceLabel !== null) {
    const source = create('p', 'content-hub-pack-meta content-hub-market-source')
    source.textContent = '市场源：' + state.sourceLabel
    card.append(source)
  }
  if (state.offline) {
    const offline = create('p', 'content-hub-pack-note content-hub-market-offline')
    offline.setAttribute('role', 'status')
    offline.textContent = '离线状态：' + (state.offlineReason ?? '市场不可达') + '。安装保持禁用；可继续查看上次已验签目录。'
    card.append(offline)
  }
  if (state.storageWarning !== null) {
    const warning = create('p', 'content-hub-pack-note content-hub-market-storage-warning')
    warning.textContent = '本地记录提示：' + state.storageWarning
    card.append(warning)
  }
  if (state.configured && !state.verifyConfigured) {
    const warning = create('p', 'content-hub-pack-note content-hub-market-verify-missing')
    warning.textContent = '验签依赖未注入（信任根 / 验签器）：目录刷新与安装保持禁用，不会把未验签内容显示为可安装。'
    card.append(warning)
  }
  if (state.configured && !state.installerConfigured) {
    const warning = create('p', 'content-hub-pack-note content-hub-market-installer-missing')
    warning.textContent = '安装器未注入：可以浏览已验签目录，但不会下载或安装任何远程内容。'
    card.append(warning)
  }

  const actions = create('div', 'content-hub-actions')
  const refresh = create('button', 'content-hub-market-refresh')
  refresh.type = 'button'
  refresh.textContent = state.configured ? '刷新市场目录…' : '远程市场未配置（不联网）'
  refresh.disabled = !canRequestRemoteMarket({ configured: state.configured }, hasRefreshHandler) || !state.canRefresh
  refresh.addEventListener('click', () => {
    onRefreshMarket()
  })
  actions.append(refresh)
  if (state.busy && state.busyLabel !== null) {
    const busy = create('span', 'content-hub-pack-meta content-hub-market-busy')
    busy.textContent = state.busyLabel
    actions.append(busy)
  }
  card.append(actions)

  appendMarketInstallConfirmation(ctx, card, install, state)
  appendMarketInstallProgress(ctx, card, install, state)
  appendMarketInstallFailure(ctx, card, install, state)
  appendMarketInstallRows(ctx, card, install, state)
  appendMarketUninstallConfirm(ctx, card, install, state)

  const contract = create('details', 'content-hub-market-contract')
  const summary = create('summary', 'content-hub-market-contract-title')
  summary.textContent = '远程市场安装契约（fail-closed 步骤）'
  contract.append(summary)
  const steps = create('ol', 'content-hub-market-steps')
  for (const step of CONTENT_MARKET_CONTRACT_STEPS) {
    const item = create('li', 'content-hub-market-step')
    item.textContent = step
    steps.append(item)
  }
  contract.append(steps)
  card.append(contract)

  const note = create('p', 'content-hub-pack-note')
  note.textContent =
    '本页不会自动联网，也不会静默更新：目录/下载只在显式点击后经宿主注入的 transport 发生；' +
    '未确认用途声明不下载、未验签/哈希不符/大小不符不安装；失败与取消都不留半装文件。'
  card.append(note)
  if (CONTENT_USAGE_CONFIRMATION_REQUIRED) {
    const declaration = create('p', 'content-hub-declaration-ref')
    declaration.textContent = '统一用途声明：' + CONTENT_HUB_NOTICE
    card.append(declaration)
  }
  panelBody.append(card)
}

