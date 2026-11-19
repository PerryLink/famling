/**
 * Constants and the injectable DOM surface shared by the content-hub modules
 * split out of content-hub.ts (task-96 / E10).
 */
/** Canonical third-party pack / remote-market extension documentation. */
export const CONTENT_HUB_DOCS_HREF = '/content/README.md'
/** Fixed research-only notice shown in the footer (always visible). */
export const CONTENT_HUB_NOTICE =
  '研究用途 · 本地优先：角色主题与内容包仅用于技术研究与原型验证；导入前必须确认统一用途声明；默认不联网、不执行脚本，素材类型/大小/哈希与声明均按 0.2 规范严格校验；远程市场必须 Ed25519 验签。'

/** Element factory injected into the per-tab renderers (same as the panel's). */
export type HubCreateElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
) => HTMLElementTagNameMap[K]

/** Minimal DOM surface passed to each renderer so it stays testable. */
export interface HubRenderSurface {
  readonly doc: Document
  readonly create: HubCreateElement
  readonly panelBody: HTMLElement
  appendEmpty(text: string): void
}
