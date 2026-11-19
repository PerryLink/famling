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
import { CONTENT_HUB_NOTICE, type HubRenderSurface } from './shared.ts'

/** Host callbacks + DOM surface consumed by the 市场 renderer. */
export interface MarketTabRenderContext extends HubRenderSurface {
  readonly getMarketState: () => ContentMarketUiState
  readonly hasRefreshHandler: boolean
  readonly onRefreshMarket: () => void
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

