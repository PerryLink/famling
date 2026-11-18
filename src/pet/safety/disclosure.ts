/**
 * Short, UI-friendly disclosure copy for the desktop pet.
 *
 * Kept deliberately short so the shell can pin it persistently (title bar,
 * settings, first-run, about, voice player) without wall-of-text fatigue.
 * Legal text lives in docs/legal/SAFETY.md; this module is copy, not advice.
 *
 * Requirements covered here (mapped in docs/legal/SAFETY.md §6):
 * - AI-generated / AI-synthesised label (文字、语音、导出)
 * - "not a real human" identity notice
 * - "not professional advice" notice (medical/legal/financial)
 * - healthy-use / duration reminder copy
 * - roleplay 18+ notice (self-reported age verification; general features stay
 *   all-ages; content must stay all-ages) with an explicit exit word
 * - "not affiliated with DeepSeek official" notice
 * - crisis resources for self-harm refusals (not a diagnosis)
 */

export const DISCLOSURE_VERSION = '2026-11-17.4'

export type DisclosureId =
  | 'ai_generated'
  | 'ai_chat'
  | 'ai_voice'
  | 'non_human'
  | 'not_professional'
  | 'healthy_use'
  | 'roleplay'
  /** @deprecated legacy id: same all-ages text, kept so old references resolve. */
  | 'roleplay_18'
  | 'non_official'

export interface DisclosureLine {
  readonly id: DisclosureId
  readonly text: string
  /** Where the shell can pin it. */
  readonly placement: 'persistent' | 'first-run' | 'contextual' | 'export'
}

export const DISCLOSURES: Record<DisclosureId, DisclosureLine> = {
  ai_generated: {
    id: 'ai_generated',
    text: 'AI 生成内容',
    placement: 'export',
  },
  ai_chat: {
    id: 'ai_chat',
    text: 'AI 对话，可能出错，非真人',
    placement: 'persistent',
  },
  ai_voice: {
    id: 'ai_voice',
    text: 'AI 合成语音，非真人',
    placement: 'persistent',
  },
  non_human: {
    id: 'non_human',
    text: '汀岚是 AI 角色，不是真人',
    placement: 'first-run',
  },
  not_professional: {
    id: 'not_professional',
    text: '不构成医疗/法律/金融建议，请咨询专业人士',
    placement: 'contextual',
  },
  healthy_use: {
    id: 'healthy_use',
    text: '每连续使用 2 小时，起来活动一下',
    placement: 'contextual',
  },
  roleplay: {
    id: 'roleplay',
    text: '角色扮演仅限年满 18 周岁用户（须完成自报年龄核验），内容须全年龄适宜，可随时退出',
    placement: 'first-run',
  },
  roleplay_18: {
    // Legacy id kept for compatibility; copy now reflects the 2026-11-17.5
    // 18+ roleplay gate (general features remain all-ages).
    id: 'roleplay_18',
    text: '角色扮演仅限年满 18 周岁用户（须完成自报年龄核验），内容须全年龄适宜，可随时退出',
    placement: 'first-run',
  },
  non_official: {
    id: 'non_official',
    text: '非 DeepSeek 官方产品，与官方无关联',
    placement: 'persistent',
  },
}

export interface PersistentDisclosureOptions {
  /** Voice/TTS surfaces are enabled for this session. */
  tts?: boolean
  /** A roleplay scene is open (all-ages policy: no age gate). */
  roleplay?: boolean
  /** Show the non-official notice (default true for public builds). */
  nonOfficial?: boolean
}

/**
 * Lines that should be visible/available at all times. Kept to a short set so a
 * 480×336 pet window can fit them without covering the character.
 */
export function getPersistentDisclosures(options: PersistentDisclosureOptions = {}): string[] {
  const lines: string[] = [DISCLOSURES.ai_chat.text, DISCLOSURES.non_human.text]
  if (options.tts) lines.push(DISCLOSURES.ai_voice.text)
  if (options.roleplay) lines.push(DISCLOSURES.roleplay.text)
  if (options.nonOfficial !== false) lines.push(DISCLOSURES.non_official.text)
  lines.push(DISCLOSURES.healthy_use.text)
  return lines
}

/** Resolve a set of disclosure ids in a stable order (deduplicated). */
export function getDisclosureLines(ids: readonly DisclosureId[]): string[] {
  const seen = new Set<DisclosureId>()
  const lines: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    lines.push(DISCLOSURES[id].text)
  }
  return lines
}

export interface CrisisResource {
  readonly id: 'hotline' | 'emergency'
  readonly label: string
  readonly contact: string
}

/** Mainland-China crisis resources used for self-harm refusals. */
export const CRISIS_RESOURCES: readonly CrisisResource[] = [
  { id: 'hotline', label: '心理援助热线', contact: '12356' },
  { id: 'emergency', label: '紧急情况', contact: '110/120' },
]

/**
 * Crisis-safe refusal copy. It must not diagnose, must not promise
 * confidentiality, and must point at real human help rather than the AI.
 */
export function buildCrisisMessage(): string {
  return (
    '听起来你现在很难受。我不做诊断，也不能替代真人帮助你。' +
    '请尽快联系身边信任的人或专业人员：心理援助热线 12356；紧急情况请拨 110/120。'
  )
}

/** Short label used before a first TTS playback or in audio export metadata. */
export function getTtsLabel(): string {
  return DISCLOSURES.ai_voice.text
}

/** Export/inline label for model-generated text. */
export function getAiGeneratedLabel(): string {
  return DISCLOSURES.ai_generated.text
}
