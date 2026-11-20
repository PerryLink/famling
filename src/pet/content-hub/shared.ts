/**
 * Constants and injectable surfaces shared by the content-hub modules split
 * out of content-hub.ts (task-96 / E10, extended by the initContentHub split
 * task-128 / MB-101).
 */
import type { ContentIssue } from '../content-library.ts'

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

/** Feedback surface the controllers report outcomes through (never HTML). */
export interface HubFeedbackSink {
  setFeedback(message: string, state: 'ok' | 'error' | 'info'): void
  setIssues(issues: readonly ContentIssue[] | undefined): void
}

/** Result shape shared by the host select/import callbacks (public type is in the barrel). */
export interface HubActionResult {
  readonly ok: boolean
  readonly message: string
  /** Close the panel after this action (e.g. a renderer switch reloads). */
  readonly close?: boolean
}

/** Import result shape: the same action result plus an optional installed count. */
export interface HubImportActionResult extends HubActionResult {
  readonly installedCount?: number
}

/**
 * Single-flight flag for the hub's explicit long-running actions. The theme-pack
 * importer and the market refresh share one flag (the original controller kept
 * a single `importBusy` closure for both).
 */
export interface HubBusyFlag {
  isBusy(): boolean
  setBusy(value: boolean): void
}

/** Create a shared single-flight busy flag. */
export function createHubBusyFlag(): HubBusyFlag {
  let busy = false
  return {
    isBusy: (): boolean => busy,
    setBusy: (value: boolean): void => {
      busy = value
    },
  }
}
