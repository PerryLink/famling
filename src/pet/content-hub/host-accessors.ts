/**
 * Throw-safe host getters for the content center. Split out of
 * `initContentHub` (E10 / MB-101): every host seam is read behind a try/catch
 * so a throwing/partial host cannot break opening or re-rendering the panel.
 */
import type { ContentLibrary, ContentSelection } from '../content-library.ts'
import type { ContentHubInstalledPack } from './packs.ts'

/** Host seams the hub reads through (all optional except the two catalog ones). */
export interface ContentHubHostAccessorOptions {
  readonly getLibrary: () => ContentLibrary | null
  readonly getSelection: () => ContentSelection | null
  /** Last applied character theme id (null = custom/unknown). */
  readonly getRoleThemeId?: () => string | null
  /** Catalog without installed v2 themes (for runtime-support checks). */
  readonly getBaseLibrary?: () => ContentLibrary | null
  readonly getInstalledPacks?: () => readonly ContentHubInstalledPack[]
}

/** Normalised, never-throwing view over the host seams. */
export interface ContentHubHostAccessors {
  getLibrary(): ContentLibrary | null
  getSelection(): ContentSelection | null
  getRoleThemeId(): string | null
  getBaseLibrary(library: ContentLibrary): ContentLibrary
  getInstalledPacks(): readonly ContentHubInstalledPack[]
}

export function createContentHubHostAccessors(
  options: ContentHubHostAccessorOptions,
): ContentHubHostAccessors {
  const getLibrary = (): ContentLibrary | null => {
    try {
      return options.getLibrary()
    } catch {
      return null
    }
  }

  const getSelection = (): ContentSelection | null => {
    try {
      return options.getSelection()
    } catch {
      return null
    }
  }

  const getRoleThemeId = (): string | null => {
    try {
      return options.getRoleThemeId?.() ?? null
    } catch {
      return null
    }
  }

  const getBaseLibrary = (library: ContentLibrary): ContentLibrary => {
    try {
      return options.getBaseLibrary?.() ?? library
    } catch {
      return library
    }
  }

  const getInstalledPacks = (): readonly ContentHubInstalledPack[] => {
    try {
      return options.getInstalledPacks?.() ?? []
    } catch {
      return []
    }
  }

  return { getLibrary, getSelection, getRoleThemeId, getBaseLibrary, getInstalledPacks }
}
