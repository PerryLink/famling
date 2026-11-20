/**
 * 角色 / 自定义 tab controller, split out of `initContentHub` (E10 / MB-101).
 *
 * The controller forwards the one-click / single-component / restore intents to
 * the host, keeps the visible feedback in sync and builds the per-render context
 * the moved renderers consume. Rendering itself stays in ./roles.ts.
 */
import type { ContentCharacterTheme, SelectionKey } from '../content-library.ts'
import type { ContentHubHostAccessors } from './host-accessors.ts'
import { renderCustomizeTab, renderRolesTab, type RolesTabRenderContext } from './roles.ts'
import type { HubActionResult, HubFeedbackSink, HubRenderSurface } from './shared.ts'

export interface RolesTabControllerOptions {
  readonly accessors: ContentHubHostAccessors
  readonly docsHref: string
  /** Local object URL for an installed pack preview (builtin themes use path). */
  readonly resolvePreviewUrl?: (theme: ContentCharacterTheme) => string | null
  /** One-click role application (six keys + role key + lifecycles). */
  readonly applyRole: (roleThemeId: string) => HubActionResult
  /** Single-component override on top of the current role. */
  readonly customize: (key: SelectionKey, id: string) => HubActionResult
  /** Restore the current role theme's six defaults (absent = no role to restore). */
  readonly restoreRole?: () => HubActionResult
  readonly feedback: HubFeedbackSink
  /** Re-render the active tab after a successful change. */
  readonly onChange: () => void
  /** Recompute the footer pack summary after a successful change. */
  readonly onSummary: () => void
  /** Close the dialog when the host result asks for it (renderer switch reload). */
  readonly onClose: () => void
}

export interface RolesTabController {
  renderRoles(surface: HubRenderSurface): void
  renderCustomize(surface: HubRenderSurface): void
}

export function createRolesTabController(options: RolesTabControllerOptions): RolesTabController {
  function runSelect(action: () => HubActionResult): void {
    let result: HubActionResult
    try {
      result = action()
    } catch {
      result = { ok: false, message: '操作失败，请稍后再试。' }
    }
    options.feedback.setFeedback(result.message, result.ok ? 'ok' : 'error')
    if (!result.ok) return
    if (result.close === true) {
      options.onClose()
      return
    }
    options.onChange()
    options.onSummary()
  }

  function handleApplyRole(roleThemeId: string): void {
    runSelect(() => options.applyRole(roleThemeId))
  }

  function handleCustomize(key: SelectionKey, id: string): void {
    runSelect(() => options.customize(key, id))
  }

  function handleRestoreRole(): void {
    const restore = options.restoreRole
    if (restore === undefined) {
      options.feedback.setFeedback('当前没有可恢复的角色主题默认值。', 'error')
      return
    }
    runSelect(() => restore())
  }

  function rolesRenderContext(surface: HubRenderSurface): RolesTabRenderContext {
    return {
      ...surface,
      getLibrary: options.accessors.getLibrary,
      getSelection: options.accessors.getSelection,
      getRoleThemeId: options.accessors.getRoleThemeId,
      getBaseLibrary: options.accessors.getBaseLibrary,
      resolvePreviewUrl: (theme): string | null => {
        try {
          return options.resolvePreviewUrl?.(theme) ?? null
        } catch {
          return null
        }
      },
      docsHref: options.docsHref,
      onApplyRole: handleApplyRole,
      onCustomize: handleCustomize,
      onRestoreRole: handleRestoreRole,
      hasRestoreRole: options.restoreRole !== undefined,
    }
  }

  return {
    renderRoles: (surface): void => {
      renderRolesTab(rolesRenderContext(surface))
    },
    renderCustomize: (surface): void => {
      renderCustomizeTab(rolesRenderContext(surface))
    },
  }
}
