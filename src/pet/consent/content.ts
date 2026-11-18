/**
 * Guarded content/DLC/import entry points.
 *
 * Rule: nothing that imports, loads, modifies, or extends content may run until
 * a FRESH full-TOS consent for that specific action is granted. The gate never
 * treats an earlier first-run acceptance (or an earlier audit record) as a
 * waiver — see `ConsentGate.requireAction()`.
 *
 * Enforcement points wired in this repo:
 * - `src/pet/main.ts` portable-save import -> `importPortableWithConsent`
 * - `src/pet/main.ts` `?character=<pack>` preview -> `loadCharacterPackWithConsent`
 *   (delegates to `loadPackWithConsent`, action `dlc.pack-load`)
 * - `src/pet/main.ts` rename/character setting -> `requireAction` (characterSettingModify)
 * - `src/pet/desktop-shell.ts` chat-import entry -> `requireAction`
 * - `scripts/import-character.mjs` CLI -> `src/pet/consent/cli.ts`
 *
 * Built-in shipped pets (`humanoid` / `cat` / `dog`, see
 * `src/pet/character/builtin.ts`) are covered by the first-run TOS and are
 * deliberately exempt from the per-load pack prompt; the non-final `tinglan`
 * concept preview and every imported/community pack are DLC and DO re-prompt.
 *
 * Mod/DLC authors MUST keep using these helpers instead of calling the raw
 * import/load functions directly, must not remove or weaken the gate, must not
 * use it for illegal purposes, and MUST declare content, licence and source
 * (incl. AI disclosure) for any pack/plugin they publish.
 */
import { CONSENT_ACTIONS } from './terms.ts'
import { PORTABLE_IMPORT_ACTION } from '../portable.ts'
import { isBuiltinCharacterId } from '../character/builtin.ts'
import type { ConsentRequester } from './gate.ts'

export { CONSENT_ACTIONS }

/** Thrown when the user declines (or is read-only); callers must abort silently. */
export class ConsentDeclinedError extends Error {
  readonly action: string

  constructor(action: string) {
    super(`consent-declined: ${action}`)
    this.name = 'ConsentDeclinedError'
    this.action = action
  }
}

/**
 * Show the full TOS for this action and only run `task` after explicit consent.
 * Declines throw `ConsentDeclinedError`, so no partial import/load/write occurs.
 */
export async function withContentConsent<T>(
  gate: ConsentRequester,
  request: { action: string; detail?: string; target?: string },
  task: () => Promise<T> | T,
): Promise<T> {
  const allowed = await gate.requireAction(request)
  if (!allowed) throw new ConsentDeclinedError(request.action)
  return task()
}

/** Guarded wrapper around `importPortable()` (see src/pet/portable.ts policy). */
export async function importPortableWithConsent<T>(
  gate: ConsentRequester,
  file: unknown,
  passphrase: string,
  importFn: (file: unknown, passphrase: string) => Promise<T>,
): Promise<T> {
  return withContentConsent(
    gate,
    {
      action: PORTABLE_IMPORT_ACTION,
      detail:
        '导入存档会覆盖当前存档与记忆，属于内容修改；每次导入都必须重新阅读完整免责声明并明确同意。未同意时不会解密或写入本机数据。',
    },
    () => importFn(file, passphrase),
  )
}

/** User-facing explanation shown with the full TOS on every pack load. */
function packLoadDetail(packId: string): string {
  return `加载 DLC/内容包「${packId}」会改变角色/内容与设定（可能读取包内数据与美术）；每次加载都必须重新阅读完整免责声明并明确同意。未同意时不会读取、加载或写入任何包内容。`
}

/**
 * Guarded wrapper around ANY DLC/content-pack load (imported character packs,
 * the non-final 256 concept preview, future signed packs).
 *
 * Uses the dedicated `dlc.pack-load` action: every call re-shows the FULL TOS
 * and re-asks (an earlier acceptance/audit record is never a waiver), and the
 * loader — including any read from disk/network — only runs after an explicit
 * accept. A decline throws `ConsentDeclinedError` before `load` runs, so no
 * content is loaded or written.
 *
 * Built-in shipped pets (`humanoid`/`cat`/`dog` and their pack dirs) are covered
 * by the first-run TOS: they are passed straight through and never prompt.
 * Every other id (including `tinglan`) is treated as DLC.
 */
export async function loadPackWithConsent<T>(
  gate: ConsentRequester,
  packId: string,
  load: () => Promise<T>,
): Promise<T> {
  if (isBuiltinCharacterId(packId)) return load()
  return withContentConsent(
    gate,
    { action: CONSENT_ACTIONS.packLoad, target: packId, detail: packLoadDetail(packId) },
    load,
  )
}

/**
 * Guarded wrapper around character-pack (DLC/FCI) loading. The loader is only
 * invoked after a fresh consent; a decline leaves the default built-in pet.
 *
 * A character pack IS a content pack, so consent is requested under
 * `dlc.pack-load` (see `loadPackWithConsent`) — no second/partial prompt.
 */
export async function loadCharacterPackWithConsent<T>(
  gate: ConsentRequester,
  characterId: string,
  load: () => Promise<T>,
): Promise<T> {
  return loadPackWithConsent(gate, characterId, load)
}

/**
 * Guarded wrapper for any art/behavior/voice/设定 modification entry point
 * (kept generic so future mod UI must opt into the same gate).
 */
export async function withModificationConsent<T>(
  gate: ConsentRequester,
  action: string,
  detail: string,
  task: () => Promise<T> | T,
  target?: string,
): Promise<T> {
  return withContentConsent(gate, { action, detail, ...(target ? { target } : {}) }, task)
}

/**
 * Minimal per-domain interfaces for content-modification UI. There is no in-app
 * art/behavior/voice editor in this build (mods are CLI/file based), but any
 * future editor MUST call these instead of mutating content directly: each call
 * shows the FULL TOS again (never a permanent waiver) and records an audit entry.
 * The mod author is responsible for declaring content/licence/source and keeping
 * the disclaimer + gate.
 */
export async function withArtModificationConsent<T>(
  gate: ConsentRequester,
  target: string,
  task: () => Promise<T> | T,
): Promise<T> {
  return withModificationConsent(
    gate,
    CONSENT_ACTIONS.artModify,
    `修改美术资源「${target}」属于内容修改；每次修改都必须重新阅读完整免责声明并同意，修改者须声明素材来源/许可证。`,
    task,
    target,
  )
}

export async function withBehaviorModificationConsent<T>(
  gate: ConsentRequester,
  target: string,
  task: () => Promise<T> | T,
): Promise<T> {
  return withModificationConsent(
    gate,
    CONSENT_ACTIONS.behaviorModify,
    `修改行为/动作「${target}」属于内容修改；每次修改都必须重新阅读完整免责声明并同意，修改者须声明来源/许可证。`,
    task,
    target,
  )
}

export async function withVoiceModificationConsent<T>(
  gate: ConsentRequester,
  target: string,
  task: () => Promise<T> | T,
): Promise<T> {
  return withModificationConsent(
    gate,
    CONSENT_ACTIONS.voiceModify,
    `修改语音/声线「${target}」属于内容修改；每次修改都必须重新阅读完整免责声明并同意，禁止真人声线克隆/未授权音源，并须声明来源/许可证。`,
    task,
    target,
  )
}
