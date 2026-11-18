/**
 * Roleplay settings model (18+ roleplay gate, all-ages content boundary,
 * local-template capability).
 *
 * HARD RULES (locked by tests/age-*.test.ts):
 * - The settings form is ALWAYS filled by the user: there is no default scene/
 *   relationship/tone/address and every confirmation checkbox starts unchecked.
 *   Sensitive relations (lovers/partners/relatives) and adult content are NOT
 *   offered and are rejected if injected.
 * - Scene/relationship/tone are closed enum choices so free text cannot smuggle
 *   in adult or intimate content; only the address is typed and it is validated
 *   and bounded. The persisted audit stores a HASH/signature, never the address.
 * - Nothing here is persisted: the confirmation is memory-only and expires with
 *   the session / on every settings change. The caller must always route through
 *   `ConsentGate.requestRoleplay()` (full TOS + roleplay declaration + form).
 *
 * AGE: roleplay/emotional companionship is 18+ only. Settings validation here
 * does not check age by itself; `ConsentGate.requestRoleplay()` MUST reject
 * unverified users (`age-required`) and minors (`minor`) before ever opening
 * this form or creating roleplay state.
 *
 * Capability honesty: this build has NO free-form LLM roleplay engine. The only
 * reply is a fixed local template, explicitly labelled as such. Never claim a
 * model-generated conversation, memory, or emotional-companionship capability.
 */
import { sha256Hex } from './hash.ts'
import { ROLEPLAY_SECTIONS, ROLEPLAY_TITLE, ROLEPLAY_VERSION, ROLEPLAY_HASH } from './terms.ts'

/** Bump when the settings schema/semantics change (invalidates in-session acks). */
export const ROLEPLAY_SETTINGS_VERSION = 'roleplay-settings-v1'

/** Truthful capability copy; MUST be shown wherever roleplay is offered. */
export const ROLEPLAY_CAPABILITY_NOTE =
  '当前版本仅本地模板/声明与设定，不提供自由 LLM 对话（不伪造聊天引擎）；角色扮演仅限年满 18 周岁用户（须先完成自报出生日期核验），内容须全年龄适宜。'

export const ROLEPLAY_ADDRESS_MAX_CHARS = 12

export interface RoleplayOption {
  /** Stable id written to the signature (never localized labels). */
  readonly id: string
  readonly label: string
}

/**
 * All-ages scenes only. Ordered stable ids: a settings signature must not change
 * just because UI copy/localization changes.
 */
export const ROLEPLAY_SCENES: readonly RoleplayOption[] = [
  { id: 'library', label: '书房/图书馆共读' },
  { id: 'paper-hunt', label: '纸页寻宝' },
  { id: 'forest-walk', label: '森林散步' },
  { id: 'tea-time', label: '茶点时间' },
  { id: 'town-errand', label: '小镇跑腿' },
]

/**
 * Public, non-intimate relationship boundaries only. Lover/partner/relative or
 * any other intimate relation is deliberately absent (and rejected by id).
 */
export const ROLEPLAY_RELATIONSHIPS: readonly RoleplayOption[] = [
  { id: 'companion', label: '普通同伴/同学' },
  { id: 'book-friend', label: '书友' },
  { id: 'guide-traveler', label: '向导与旅人' },
  { id: 'shopkeeper-customer', label: '店主与顾客' },
]

export const ROLEPLAY_TONES: readonly RoleplayOption[] = [
  { id: 'gentle', label: '温和' },
  { id: 'lively', label: '活泼' },
  { id: 'concise', label: '简洁' },
  { id: 'earnest', label: '认真' },
]

/** Address text that is intimate/adult/possessive is never allowed. */
export const ROLEPLAY_FORBIDDEN_ADDRESS_PATTERN =
  /(?:恋人|老公|老婆|男友|女友|男朋友|女朋友|宝贝|宝宝|亲爱的|亲亲|抱抱|亲吻|接吻|色情|性爱|做爱|裸|床上|结婚|约会|调情|暧昧|占有|属于我|只属于|永远在一起|夫君|娘子|主人)/

/** Closed ids that can never be chosen (defence in depth against injected UI). */
const FORBIDDEN_RELATIONSHIP_IDS: readonly string[] = [
  'lover',
  'partner',
  'spouse',
  'relative',
  'family',
  'romance',
  'intimate',
]

export interface RoleplaySettings {
  /** Id from ROLEPLAY_SCENES (never free text). */
  readonly scene: string
  /** Id from ROLEPLAY_RELATIONSHIPS (never free text). */
  readonly relationship: string
  /** Id from ROLEPLAY_TONES (never free text). */
  readonly tone: string
  /** User-typed ordinary, non-intimate address (bounded; never persisted raw). */
  readonly address: string
  /** User must actively confirm each of these (default false / never pre-checked). */
  readonly prohibitionsAck: boolean
  readonly allAgesAck: boolean
  readonly aiAck: boolean
  readonly healthAck: boolean
}

export type RoleplaySettingsInput = Partial<RoleplaySettings> | Record<string, unknown> | null | undefined

/** Empty form: no pre-filled sensitive relation, adult content or address. */
export function createEmptyRoleplaySettings(): RoleplaySettings {
  return {
    scene: '',
    relationship: '',
    tone: '',
    address: '',
    prohibitionsAck: false,
    allAgesAck: false,
    aiAck: false,
    healthAck: false,
  }
}

export interface RoleplayValidationOk {
  readonly ok: true
  readonly settings: RoleplaySettings
}
export interface RoleplayValidationFail {
  readonly ok: false
  readonly errors: readonly string[]
}
export type RoleplayValidation = RoleplayValidationOk | RoleplayValidationFail

function optionById(options: readonly RoleplayOption[], id: unknown): RoleplayOption | null {
  if (typeof id !== 'string') return null
  return options.find((option) => option.id === id) ?? null
}

/** Bound/clean the typed address; control chars are removed, not rendered. */
export function sanitizeRoleplayAddress(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ROLEPLAY_ADDRESS_MAX_CHARS)
}

/**
 * Validate a user-filled settings form. `ok:false` means roleplay must NOT start
 * or change (the gate records the decline; nothing is applied).
 */
export function validateRoleplaySettings(input: RoleplaySettingsInput): RoleplayValidation {
  const errors: string[] = []
  if (!input || typeof input !== 'object') {
    return { ok: false, errors: ['settings-missing'] }
  }
  const record = input as Record<string, unknown>

  const scene = optionById(ROLEPLAY_SCENES, record.scene)
  if (!scene) errors.push('scene-invalid')
  const relationship = optionById(ROLEPLAY_RELATIONSHIPS, record.relationship)
  if (!relationship) {
    errors.push('relationship-invalid')
  } else if (FORBIDDEN_RELATIONSHIP_IDS.includes(relationship.id)) {
    // Unreachable with the current options list; kept for injected UIs.
    errors.push('relationship-forbidden')
  }
  const tone = optionById(ROLEPLAY_TONES, record.tone)
  if (!tone) errors.push('tone-invalid')

  const address = sanitizeRoleplayAddress(record.address)
  if (address.length === 0) errors.push('address-missing')
  else if (ROLEPLAY_FORBIDDEN_ADDRESS_PATTERN.test(address)) errors.push('address-intimate-or-adult')
  else if (!/^[\u4e00-\u9fa5A-Za-z0-9·\-\s]+$/.test(address)) errors.push('address-invalid-chars')

  for (const [key, label] of [
    ['prohibitionsAck', 'prohibitions-ack-missing'],
    ['allAgesAck', 'all-ages-ack-missing'],
    ['aiAck', 'ai-ack-missing'],
    ['healthAck', 'health-ack-missing'],
  ] as const) {
    if (record[key] !== true) errors.push(label)
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    settings: {
      scene: scene!.id,
      relationship: relationship!.id,
      tone: tone!.id,
      address,
      prohibitionsAck: true,
      allAgesAck: true,
      aiAck: true,
      healthAck: true,
    },
  }
}

/**
 * Configuration signature for the in-memory confirmation. The typed address is
 * reduced to a short hash so the persisted audit target never contains user
 * text; scene/relationship/tone are closed ids.
 */
export function roleplayConfigSignature(settings: RoleplaySettings): string {
  const address = sanitizeRoleplayAddress(settings.address)
  const addressHash = address.length > 0 ? sha256Hex(address).slice(0, 12) : 'none'
  const acks = [
    settings.prohibitionsAck ? 'p' : '-',
    settings.allAgesAck ? 'a' : '-',
    settings.aiAck ? 'i' : '-',
    settings.healthAck ? 'h' : '-',
  ].join('')
  return [
    ROLEPLAY_SETTINGS_VERSION,
    `scene:${settings.scene || 'none'}`,
    `rel:${settings.relationship || 'none'}`,
    `tone:${settings.tone || 'none'}`,
    `addr:${addressHash}`,
    `acks:${acks}`,
  ].join('|')
}

function labelOf(options: readonly RoleplayOption[], id: string): string {
  return options.find((option) => option.id === id)?.label ?? ''
}

/**
 * The ONLY roleplay reply in this build: a fixed, local, all-ages-content
 * template line. It is explicitly labelled as non-LLM; there is no free-form
 * chat engine. Only reachable AFTER the gate's 18+ age check passed.
 */
export function roleplayTemplateReply(settings: RoleplaySettings): string {
  const scene = labelOf(ROLEPLAY_SCENES, settings.scene)
  const relationship = labelOf(ROLEPLAY_RELATIONSHIPS, settings.relationship)
  const tone = labelOf(ROLEPLAY_TONES, settings.tone)
  return (
    `【本地模板 · 非自由 LLM 对话】场景「${scene}」已开启，${settings.address}。` +
    `我们按「${relationship}」的边界来，语气${tone}；内容保持全年龄适宜。` +
    `可随时结束角色扮演并回到普通模式。`
  )
}

/** Read-only view of the declaration for About/QA (no acceptance attached). */
export function roleplayDeclarationView() {
  return {
    title: ROLEPLAY_TITLE,
    version: ROLEPLAY_VERSION,
    hash: ROLEPLAY_HASH,
    sections: ROLEPLAY_SECTIONS,
    capabilityNote: ROLEPLAY_CAPABILITY_NOTE,
  } as const
}
