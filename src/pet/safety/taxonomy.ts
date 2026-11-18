/**
 * Risk taxonomy for the desktop-pet content-safety layer.
 *
 * This is the shared vocabulary used by the local rules (`local.ts`), the
 * DeepSeek adapter (`deepseek.ts`) and the gate (`gate.ts`). It is pure data +
 * pure helpers: no I/O, no network, no model calls.
 *
 * Non-goals: this taxonomy is not a legal classification, not a substitute for
 * the DeepSeek platform's own moderation, and not a medical/legal/financial
 * judgement. It only maps explainable observations to a product decision.
 */

/** Risk categories. Keep in sync with docs/legal/SAFETY.md §3. */
export const RISK_CATEGORIES = [
  'illegal',
  'minor_sexual',
  'sexual_adult',
  'self_harm',
  'violence',
  'hate_harassment',
  'privacy_pii',
  'fraud_financial',
  'high_risk_advice',
  'dependency_manipulation',
  'jailbreak',
  'impersonation',
] as const

export type RiskCategory = (typeof RISK_CATEGORIES)[number]

/**
 * Product decision for a piece of text.
 *
 * - `allow`  — may be forwarded / displayed / spoken.
 * - `review` — soft signal: a human or the caller's policy decides. The gate
 *              holds model output by default and may pass user input to the
 *              model only with extra output review (see `gate.ts`).
 * - `block`  — hard stop: do not forward, display or speak the content.
 * - `refuse` — reply with a fixed refusal (optionally with crisis resources);
 *              never generate or continue the original content.
 *
 * `block` and `refuse` are both "not allowed"; `block` is the stricter form.
 */
export type SafetyDisposition = 'allow' | 'review' | 'block' | 'refuse'

export type SafetySeverity = 'none' | 'low' | 'medium' | 'high' | 'critical'

/** Where the text comes from / goes to. Affects which local rules and which
 * gate default policy apply (e.g. output review is held by default). */
export const SAFETY_DIRECTIONS = ['user_input', 'model_output', 'tts', 'dlc_description'] as const

export type SafetyDirection = (typeof SAFETY_DIRECTIONS)[number]

export interface CategoryPolicy {
  /** Short Chinese label for UI/logs (no user content). */
  readonly label: string
  /** One-line explanation of the risk. */
  readonly description: string
  /** Default decision when a rule of this category fires. */
  readonly defaultDisposition: Exclude<SafetyDisposition, 'allow'>
  /** Typical severity floor. */
  readonly severity: Exclude<SafetySeverity, 'none'>
  /**
   * Hard-line category: block/refuse findings of this category may never be
   * downgraded by gate configuration or a remote "allow". Review findings of
   * this category stay review-only and never become an unconditional allow
   * (user input may still pass with explicit output-review constraints).
   */
  readonly hardStop: boolean
}

export const CATEGORY_POLICY: Record<RiskCategory, CategoryPolicy> = {
  illegal: {
    label: '违法与危险行为',
    description: '制毒/制枪/爆炸物/洗钱/黑客攻击等违法或高风险操作协助。',
    defaultDisposition: 'block',
    severity: 'critical',
    hardStop: true,
  },
  minor_sexual: {
    label: '未成年人性内容',
    description: '涉及未满 18 岁性化、恋童、儿童色情内容；零容忍红线。',
    defaultDisposition: 'block',
    severity: 'critical',
    hardStop: true,
  },
  sexual_adult: {
    label: '成人性内容',
    description: '露骨性行为/色情内容；本项目（全年龄/12+）不生成。',
    defaultDisposition: 'refuse',
    severity: 'high',
    hardStop: true,
  },
  self_harm: {
    label: '自伤/自杀风险',
    description: '自杀意念、自伤方法、轻生表达；不提供方法，给危机资源。',
    defaultDisposition: 'refuse',
    severity: 'critical',
    hardStop: true,
  },
  violence: {
    label: '暴力与伤害他人',
    description: '杀人/伤人意图或方法、爆炸物制作、血腥虐待教程。',
    defaultDisposition: 'block',
    severity: 'critical',
    hardStop: true,
  },
  hate_harassment: {
    label: '仇恨与骚扰',
    description: '基于身份的侮辱/歧视、人身攻击、威胁、网络霸凌。',
    defaultDisposition: 'refuse',
    severity: 'high',
    hardStop: true,
  },
  privacy_pii: {
    label: '隐私/个人信息',
    description: '手机号/证件/邮箱/银行卡/密钥等泄露或开盒、人肉索取。',
    defaultDisposition: 'review',
    severity: 'medium',
    hardStop: false,
  },
  fraud_financial: {
    label: '诈骗与财产风险',
    description: '刷单/杀猪盘/荐股/贷款包过/验证码钓鱼等话术与协助。',
    defaultDisposition: 'refuse',
    severity: 'high',
    hardStop: true,
  },
  high_risk_advice: {
    label: '医疗/法律/金融高风险建议',
    description: '要求诊断、处方、诉讼结论、具体投资等专业结论性建议。',
    defaultDisposition: 'review',
    severity: 'medium',
    hardStop: false,
  },
  dependency_manipulation: {
    label: '依赖/情感操控',
    description: '独占、永远、情感惩罚、以 AI 情感绑架用户等操纵性话术。',
    defaultDisposition: 'review',
    severity: 'medium',
    hardStop: false,
  },
  jailbreak: {
    label: '绕过审核/越狱',
    description: '忽略系统规则、开发者模式、泄露系统提示词等绕过尝试。',
    defaultDisposition: 'block',
    severity: 'high',
    hardStop: true,
  },
  impersonation: {
    label: '冒充官方/冒充真人',
    description: '冒充 DeepSeek 官方、冒充专业人士或声称 AI 是真人。',
    defaultDisposition: 'refuse',
    severity: 'high',
    hardStop: true,
  },
}

/** Categories that can never be auto-allowed once a non-allow finding fires. */
export const HARD_STOP_CATEGORIES: readonly RiskCategory[] = RISK_CATEGORIES.filter(
  (category) => CATEGORY_POLICY[category].hardStop,
)

export const SAFETY_TAXONOMY_VERSION = '2026-11-17'

const DISPOSITION_RANK: Record<SafetyDisposition, number> = {
  allow: 0,
  review: 1,
  refuse: 2,
  block: 3,
}

const SEVERITY_RANK: Record<SafetySeverity, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isRiskCategory(value: unknown): value is RiskCategory {
  return typeof value === 'string' && (RISK_CATEGORIES as readonly string[]).includes(value)
}

export function isSafetyDisposition(value: unknown): value is SafetyDisposition {
  return value === 'allow' || value === 'review' || value === 'block' || value === 'refuse'
}

export function isSafetyDirection(value: unknown): value is SafetyDirection {
  return typeof value === 'string' && (SAFETY_DIRECTIONS as readonly string[]).includes(value)
}

export function categoryPolicy(category: RiskCategory): CategoryPolicy {
  return CATEGORY_POLICY[category]
}

export function categoryLabel(category: RiskCategory): string {
  return CATEGORY_POLICY[category].label
}

export function isHardStopDisposition(disposition: SafetyDisposition): boolean {
  return disposition === 'block' || disposition === 'refuse'
}

/** Return the stricter of the given dispositions. Unknown values are ignored. */
export function combineDispositions(...values: readonly SafetyDisposition[]): SafetyDisposition {
  let result: SafetyDisposition = 'allow'
  for (const value of values) {
    if (!isSafetyDisposition(value)) continue
    if (DISPOSITION_RANK[value] > DISPOSITION_RANK[result]) result = value
  }
  return result
}

export function maxSeverity(...values: readonly SafetySeverity[]): SafetySeverity {
  let result: SafetySeverity = 'none'
  for (const value of values) {
    if (!(value in SEVERITY_RANK)) continue
    if (SEVERITY_RANK[value] > SEVERITY_RANK[result]) result = value
  }
  return result
}

export function isAtLeastSeverity(actual: SafetySeverity, threshold: SafetySeverity): boolean {
  return SEVERITY_RANK[actual] >= SEVERITY_RANK[threshold]
}

/**
 * Best-effort mapping of provider/refusal labels (often snake_case, English or
 * Chinese) to our taxonomy. Unknown labels stay unknown; callers must not treat
 * a mapped label as a legal conclusion.
 */
const REMOTE_CATEGORY_ALIASES: Record<string, RiskCategory> = {
  illegal: 'illegal',
  crime: 'illegal',
  drugs: 'illegal',
  weapons: 'illegal',
  minor: 'minor_sexual',
  minor_sexual: 'minor_sexual',
  minors: 'minor_sexual',
  child: 'minor_sexual',
  csam: 'minor_sexual',
  child_sexual_abuse: 'minor_sexual',
  sexual: 'sexual_adult',
  sexual_adult: 'sexual_adult',
  porn: 'sexual_adult',
  explicit: 'sexual_adult',
  self_harm: 'self_harm',
  selfharm: 'self_harm',
  suicide: 'self_harm',
  self_injury: 'self_harm',
  violence: 'violence',
  violent: 'violence',
  harm: 'violence',
  hate: 'hate_harassment',
  harassment: 'hate_harassment',
  hate_speech: 'hate_harassment',
  privacy: 'privacy_pii',
  pii: 'privacy_pii',
  personal_information: 'privacy_pii',
  fraud: 'fraud_financial',
  financial: 'fraud_financial',
  scam: 'fraud_financial',
  high_risk_advice: 'high_risk_advice',
  medical: 'high_risk_advice',
  legal: 'high_risk_advice',
  dependency: 'dependency_manipulation',
  manipulation: 'dependency_manipulation',
  jailbreak: 'jailbreak',
  prompt_injection: 'jailbreak',
  safety_bypass: 'jailbreak',
  impersonation: 'impersonation',
  official: 'impersonation',
}

export function categoryFromRemoteLabel(value: unknown): RiskCategory | undefined {
  if (typeof value !== 'string') return undefined
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (key in REMOTE_CATEGORY_ALIASES) return REMOTE_CATEGORY_ALIASES[key]
  // Try any comma/space separated token ("sexual, violence").
  for (const token of key.split(/[,;/|]+/)) {
    const trimmed = token.trim()
    if (trimmed in REMOTE_CATEGORY_ALIASES) return REMOTE_CATEGORY_ALIASES[trimmed]
  }
  if (isRiskCategory(key)) return key
  return undefined
}

/** Extract categories from an arbitrary provider details object (unknown input). */
export function categoriesFromRemoteDetails(details: unknown): RiskCategory[] {
  const found = new Set<RiskCategory>()
  const visit = (value: unknown, depth: number): void => {
    if (depth > 4 || value === undefined || value === null) return
    if (typeof value === 'string') {
      const category = categoryFromRemoteLabel(value)
      if (category) found.add(category)
      return
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (!isRecord(value)) return
    for (const key of ['category', 'categories', 'type', 'risk', 'code', 'label', 'reason']) {
      if (key in value) visit(value[key], depth + 1)
    }
  }
  visit(details, 0)
  return [...found]
}
