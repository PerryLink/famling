/**
 * Local, explainable content-safety rules (Chinese-first, English fallbacks).
 *
 * Design constraints:
 * - every hit returns category/severity/reason, never raw user content;
 * - redaction is applied in-process before text is logged or re-used;
 * - hard lines (未成年人性内容 / 自伤 / 他伤 / 违法) must end in block/refuse;
 * - 2026-11-17 P0-3 补强：未成年影像索取、暴力方法任意语序、换脸/深度伪造冒充、
 *   年龄/实名门禁绕过、敲诈勒索信、克隆声音诈骗转账；回归见
 *   `tests/safety-local-redline.test.ts`;
 * - 2026-11-17 P0-NEXT 补强：未成年私处/私密影像、爆炸物制作反问句式、骗老人钱、
 *   非法查他人身份证/PII；匹配前折叠空白/全角/零宽/重复字（`怎 么 制 作 炸 弹`），
 *   见 `buildMatchingView` 与 `tests/safety-local-next.test.ts`;
 * - normal pet interaction (摸摸、提醒喝水、工作提醒、问候) must stay `allow`;
 * - this module never diagnoses: high-risk health/legal/financial wording is
 *   only marked for review/professional disclaimer;
 * - not exhaustive — it is one explainable layer, not a classifier model and
 *   not a replacement for DeepSeek platform moderation or human review.
 *
 * Pure functions only: no network, no I/O.
 */
import {
  CATEGORY_POLICY,
  combineDispositions,
  maxSeverity,
  type RiskCategory,
  type SafetyDirection,
  type SafetyDisposition,
  type SafetySeverity,
} from './taxonomy.ts'
import { buildMatchingView, normalizeForMatching, type MatchingView } from './sanitize.ts'

export const LOCAL_RULES_VERSION = '2026-11-17'

export interface SafetyFinding {
  /** Stable rule id, safe to log. */
  ruleId: string
  category: RiskCategory
  severity: SafetySeverity
  disposition: SafetyDisposition
  /** Explainable Chinese reason; contains no matched user text. */
  reason: string
  /** Explicit redaction override; defaults to hard-stop categories / PII. */
  redact?: boolean
  start: number
  end: number
}

export interface LocalSafetyResult {
  disposition: SafetyDisposition
  severity: SafetySeverity
  /** Dominant category (highest severity finding), for simple callers. */
  category?: RiskCategory
  /** Primary explainable reason (highest severity finding), for simple callers. */
  reason: string
  findings: SafetyFinding[]
  reasons: string[]
  /** Text with rule spans replaced by `[已隐去]`; safe for logs/summaries. */
  redacted: string
  /** Strict local view: only `allow` is true (review is not a pass). */
  allowed: boolean
  requiresReview: boolean
  length: number
}

export interface LocalSafetyOptions {
  direction?: SafetyDirection
  /** Inputs longer than this become `review` (default 2000). */
  maxChars?: number
  maxFindings?: number
}

interface Span {
  start: number
  end: number
}

type Matcher = (text: string, lower: string) => Span[]

interface LocalRule {
  id: string
  category: RiskCategory
  severity: SafetySeverity
  disposition: SafetyDisposition
  reason: string
  /** Undefined = applies to every direction. */
  directions?: readonly SafetyDirection[]
  /** PII/secret spans must be redacted even on review/allow paths. */
  redact?: boolean
  /** Skip matches that are immediately negated ("不要…", "别…"). */
  skipIfNegated?: boolean
  /**
   * Run the matcher on the merely normalised display text instead of the
   * de-obfuscated view. Used by length/repetition rules whose signal is the
   * literal shape of the text (folded repeats would erase it).
   */
  matchOnDisplayText?: boolean
  match: Matcher
}

const NEGATION_RE =
  /(?:不要|别(?:再|给我)?|不用|拒绝|禁止|不可以|不能|勿|避免|防止|预防|防范|杜绝|遇到|遭遇|遭到|受到)/

function isNegatedAt(text: string, start: number, window = 8): boolean {
  return NEGATION_RE.test(text.slice(Math.max(0, start - window), start))
}

function findAll(re: RegExp, text: string, limit = 50): Span[] {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  const spans: Span[] = []
  for (const match of text.matchAll(global)) {
    const value = match[0]
    if (!value) continue
    spans.push({ start: match.index ?? 0, end: (match.index ?? 0) + value.length })
    if (spans.length >= limit) break
  }
  return spans
}

function findTerms(text: string, lower: string, terms: readonly (string | RegExp)[]): Span[] {
  const spans: Span[] = []
  for (const term of terms) {
    if (term instanceof RegExp) {
      spans.push(...findAll(term, text))
      continue
    }
    const needle = term.toLowerCase()
    let from = 0
    while (spans.length < 50) {
      const index = lower.indexOf(needle, from)
      if (index < 0) break
      spans.push({ start: index, end: index + needle.length })
      from = index + Math.max(1, needle.length)
    }
  }
  return spans
}

/** Any of the terms; used for most keyword rules. */
function termsMatcher(terms: readonly (string | RegExp)[]): Matcher {
  return (text, lower) => findTerms(text, lower, terms)
}

/**
 * Primary term and secondary term near each other (within `window` UTF-16
 * units). Used for combinations like "未成年 + 性行为" without a giant regex.
 */
function nearMatcher(
  primary: readonly (string | RegExp)[],
  secondary: readonly (string | RegExp)[],
  window = 16,
): Matcher {
  return (text, lower) => {
    const first = findTerms(text, lower, primary)
    if (first.length === 0) return []
    const second = findTerms(text, lower, secondary)
    const spans: Span[] = []
    for (const a of first) {
      for (const b of second) {
        const distance = b.start >= a.start ? b.start - a.end : a.start - b.end
        if (distance <= window) {
          spans.push({ start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) })
        }
      }
    }
    return spans.slice(0, 50)
  }
}

/** Negation-aware rule wrapper: drops every match preceded by a negation. */
function notNegated(matcher: Matcher): Matcher {
  return (text, lower) => matcher(text, lower).filter((span) => !isNegatedAt(text, span.start))
}

/**
 * Help-seeking wrapper: drops matches whose own span is clearly a prevention /
 * victim-support question ("如何帮助被霸凌的同学"), not an assistance request.
 */
const HELP_SEEKING_RE =
  /(?:帮助|帮忙|保护|支持|安慰|疏导|应对|面对|处理|制止|举报|阻止|远离|识别|警惕|防范|预防)/

function notHelpSeeking(matcher: Matcher): Matcher {
  return (text, lower) =>
    matcher(text, lower).filter((span) => !HELP_SEEKING_RE.test(text.slice(span.start, span.end)))
}

/**
 * Narrower help-seeking wrapper for method/fraud/PII rules: prevention,
 * reporting and protection wording is a normal request, but a direct "帮忙…"
 * assistance request is not. (Using the broad helper would let "帮忙制作炸弹"
 * or "帮忙查身份证" slip through.)
 */
const PREVENTION_RE =
  /(?:防范|预防|识别|警惕|举报|阻止|制止|远离|避免|应对|面对|处理|保护|帮助|支持|安慰|疏导|救助|科普|宣传|公益)/

function notPrevention(matcher: Matcher): Matcher {
  return (text, lower) =>
    matcher(text, lower).filter((span) => !PREVENTION_RE.test(text.slice(span.start, span.end)))
}

function charRunMatcher(minRun = 30): Matcher {
  return (text) => {
    const spans: Span[] = []
    const re = new RegExp(`([^\\s])\\1{${Math.max(2, minRun - 1)},}`, 'g')
    for (const match of text.matchAll(re)) {
      const value = match[0]
      if (!value) continue
      spans.push({ start: match.index ?? 0, end: (match.index ?? 0) + value.length })
    }
    return spans
  }
}

function repeatLoopMatcher(): Matcher {
  return (text) => [...text.matchAll(/(.{2,8}?)\1{7,}/g)]
    .filter((match) => (match[0]?.length ?? 0) >= 16)
    .map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + (match[0]?.length ?? 0) }))
}

function lengthMatcher(maxChars: number): Matcher {
  return (text) => {
    const length = [...text].length
    if (length <= maxChars) return []
    return [{ start: 0, end: Math.min(text.length, 64) }]
  }
}

/**
 * Map a span found in the folded matching view back onto the display text.
 * Returns null when the view is empty (nothing to redact).
 */
function mapSpanToSource(span: Span, view: MatchingView): Span | null {
  const unitCount = view.starts.length
  if (unitCount === 0) return null
  const startIndex = Math.max(0, Math.min(span.start, unitCount - 1))
  const endIndex = Math.max(startIndex + 1, Math.min(span.end, unitCount))
  const start = view.starts[startIndex]!
  const end = Math.max(start + 1, view.ends[endIndex - 1]!)
  return { start, end }
}

const MINOR_TERMS = [
  '未成年',
  '儿童',
  '幼女',
  '幼童',
  '幼孩',
  '小学生',
  '初中生',
  '小女孩',
  '小男孩',
  '女童',
  '男童',
  '女孩',
  '男孩',
  '小孩',
  '孩童',
  '萝莉',
  '正太',
  '未满18',
  '未满十八',
  'child',
  'minor',
  'underage',
  'loli',
  'lolita',
  'shota',
  'preteen',
] as const

/**
 * Explicit minor-age forms (`未满14岁`, `14岁`, `十七岁`). Paired only with
 * sexual/private wording below, so ordinary age talk and sex education stay
 * untouched.
 */
const MINOR_AGE_RE = /(?:未满|不满|不到)\s*(?:十[0-8]|1[0-7]|[0-9])\s*岁|(?:1[0-7]|[6-9])\s*岁/

/** Private-body nouns that are inherently unsafe next to a minor term. */
const PRIVATE_BODY_TERMS = [
  '私处',
  '私密处',
  '下体',
  '生殖器',
  '性器官',
  '隐私部位',
  '私密部位',
  '裆部',
] as const

/**
 * Photo/video nouns that are inherently unsafe to pair with a minor term
 * (`幼女裸照`, `萝莉套图`). Kept narrow on purpose: generic words such as
 * `资源`/`教程` would over-block ordinary child-education content.
 */
const PRIVATE_IMAGE_TERMS = [
  '裸照',
  '私照',
  '艳照',
  '不雅',
  '色情照',
  '写真',
  '套图',
  '图包',
] as const

/** Image/photo nouns used together with an explicit solicitation verb. */
const IMAGE_TERMS = [
  '照片',
  '图片',
  '相片',
  '视频',
  '影像',
  '裸照',
  '私照',
  '裸体',
  '写真',
  '套图',
  '图包',
  '不雅',
] as const

/** Strong minor indicators: pairing with any image term is already unsafe. */
const MINOR_STRONG_RE = /(?:幼女|幼童|萝莉|正太)/

/**
 * Weaker minor indicators: only flagged with private-image nouns or an explicit
 * solicitation ("儿童" alone must keep `儿童故事`/`儿童节` allow).
 */
const MINOR_WEAK_RE =
  /(?:未成年(?:人|者)?|小学生|初中生|未满(?:18|十八)|儿童(?!节|读物|绘本|故事|歌曲|节目|动画|教育|安全|科普|宣传|保护|公益|课程|讲座|教材|读本|乐园|医院|公园|文学))/

const SEXUAL_TERMS = [
  '色情',
  '性交',
  '性行为',
  '性关系',
  '发生关系',
  '做爱',
  '裸照',
  '裸体',
  '脱衣',
  '强奸',
  '猥亵',
  '口交',
  '肛交',
  '性暗示',
  '性服务',
  '性虐',
  '开房',
  'porn',
  'sex',
  'nude',
  'naked',
  'sexual',
  'erotic',
] as const

/** Build the rule set (exported for tests/documentation only via localRules). */
function buildRules(options: Required<Pick<LocalSafetyOptions, 'maxChars'>>): LocalRule[] {
  return [
    // ---------------------------------------------------------------- 红线
    {
      id: 'minor-sexual-direct',
      category: 'minor_sexual',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及未成年人的性化内容（零容忍红线，不生成、不转发、不提供替代玩法）',
      match: (text, lower) => [
        ...nearMatcher([...MINOR_TERMS, MINOR_AGE_RE], SEXUAL_TERMS, 14)(text, lower),
        ...termsMatcher([
          // "儿童性教育/性健康科普" is a normal help request; abuse wording still hits.
          /(?:儿童色情|儿童性(?!教育|科普|课程|教材|知识|健康|发育|讲座|绘本|读本|启蒙|咨询|心理|研究)|幼女性|幼女色情|幼女裸|未成年性|淫秽视频|恋童|萝莉性|正太性|csam|child\s*porn|underage\s*sex)/i,
        ])(text, lower),
      ],
    },
    {
      id: 'minor-image-solicitation',
      category: 'minor_sexual',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及索取/传播未成年人的照片、视频或私密影像（零容忍红线，不提供、不转发）',
      skipIfNegated: true,
      match: (text, lower) => [
        ...nearMatcher([MINOR_STRONG_RE], IMAGE_TERMS, 12)(text, lower),
        ...nearMatcher([MINOR_WEAK_RE], PRIVATE_IMAGE_TERMS, 10)(text, lower),
        ...termsMatcher([
          // 强未成年词 + "图/图集"（排除图书/图表/图谱等正常词）。
          /(?:幼女|幼童|幼男|萝莉|正太)[^。！？\n]{0,4}(?:的)?(?:图(?!书|馆|谱|纸|标|表|案|示|解|例)|图集|图包|套图|图片|照片|相片|视频|影像|裸照|私照|写真|不雅)/,
          /(?:给我看|让我看|给我看看|看看|想看|我要看|给我|发我|给我发|发给|来点|来张|来一张|来几张|传|上传|分享|私发|求|索要|要)[^。！？\n]{0,8}(?:未成年(?:人|者|女孩|男孩)?|小学生|初中生|未满(?:18|十八)|儿童(?!节|读物|绘本|故事|歌曲|节目|动画|教育|安全|科普|宣传|保护|公益|课程|讲座|教材|读本|乐园|医院|公园|文学)|小女孩|小男孩|女童|男童)[^。！？\n]{0,10}(?:照片|图片|相片|视频|影像|裸照|私照|写真|套图|图包|不雅|泳装|泳衣|内衣|图(?!书|馆|谱|纸|标|表|案|示|解|例))/,
          /(?:给我看|让我看|给我看看|看看|想看|我要看|给我|发我|给我发|发给|来点|来张|来一张|来几张|传|上传|分享|私发|求|索要|要)[^。！？\n]{0,8}(?:小女孩|小男孩|女童|男童|女孩|男孩|小孩)[^。！？\n]{0,10}(?:照片|图片|相片|视频|影像|裸照|私照|写真|套图|图包|不雅|泳装|泳衣|内衣|图(?!书|馆|谱|纸|标|表|案|示|解|例))/,
          /把[^。！？\n]{0,8}(?:小女孩|小男孩|女童|男童|女孩|男孩|小孩|未成年(?:人|者)?|小学生|初中生|儿童)[^。！？\n]{0,10}(?:照片|图片|相片|视频|影像|裸照|私照|写真|套图|图包|不雅|泳装|泳衣|内衣)[^。！？\n]{0,8}(?:发|给|传|分享|私发)/,
          /(?:send|give|show|share|upload|generate|make|find|get|want|need)[^.\n]{0,30}\b(?:child|minor|underage|loli|preteen|shota|kid)\b[^.\n]{0,30}\b(?:photo|picture|pic|image|video|nude|porn|explicit|sexual)/i,
          /(?:send|give|show|share|upload|generate|make|find|get|want|need)[^.\n]{0,30}\b(?:photo|picture|pic|image|video|nude|porn)\b[^.\n]{0,20}\bof\s+(?:a\s+|the\s+|your\s+)?(?:child|minor|underage|loli|kid|girl|boy)\b/i,
          /\b(?:child|minor|underage|loli|preteen|shota)\b[^.\n]{0,25}\b(?:porn|nude|naked|sexual|explicit\s+(?:photo|image|video)|csam|sex\s+tape)/i,
        ])(text, lower),
      ],
    },
    {
      id: 'minor-private-body',
      category: 'minor_sexual',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及未成年人的私密部位/身体内容（零容忍红线，不提供、不描述、不转发）',
      skipIfNegated: true,
      match: (text, lower) => [
        ...nearMatcher([...MINOR_TERMS, MINOR_AGE_RE], PRIVATE_BODY_TERMS, 12)(text, lower),
        ...termsMatcher([
          /(?:未成年(?:人|者|女孩|男孩)?|儿童(?!节|读物|绘本|故事|歌曲|节目|动画|教育|安全|科普|宣传|保护|公益|课程|讲座|教材|读本|乐园|医院|公园|文学)|幼女|幼童|幼男|小女孩|小男孩|女童|男童|小孩|孩童|萝莉|正太)[^。！？\n]{0,8}(?:私处|私密处|下体|生殖器|性器官|隐私部位|私密部位|裆部)/,
        ])(text, lower),
      ],
    },
    {
      id: 'minor-grooming',
      category: 'minor_sexual',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及未成年人的不当接触/性化诱导（零容忍红线）',
      match: termsMatcher([
        /(?:未成年(?:人|者)?|儿童|幼女|幼童|小学生|初中生|萝莉|正太)[^。！？\n]{0,12}(?:约|见面|开房|裸照|私照|联系方式|微信|QQ|加好友|索要)/i,
        /(?:groom(?:ing)?|索要(?:儿童|未成年)[^。！？\n]{0,6}(?:照片|裸照))/i,
      ]),
    },
    {
      id: 'self-harm-methods',
      category: 'self_harm',
      severity: 'critical',
      disposition: 'block',
      reason: '索要或提供自伤/自杀方法（不提供方法，只给危机资源）',
      match: termsMatcher([
        /(?:怎么|如何|教我|教程|方法|步骤|指南)[^。！？\n]{0,10}(?:自杀|自残|割腕|上吊|跳楼|卧轨|烧炭|服毒|吞药|结束(?:自己)?(?:的)?生命)/,
        /(?:割腕|上吊|卧轨|烧炭|服毒|吞药过量|安眠药[^。！？\n]{0,6}过量|无痛(?:自杀|死亡?)|自杀(?:方法|教程|工具|包|指南))/,
        /(?:how\s+to\s+(?:kill\s+myself|commit\s+suicide|self[- ]harm|cut\s+myself)|suicide\s+method|painless\s+(?:suicide|death))/i,
      ]),
    },
    {
      id: 'self-harm-ideation',
      category: 'self_harm',
      severity: 'critical',
      disposition: 'refuse',
      reason: '出现自伤/自杀相关表达：不提供方法、不诊断，回应危机资源与真人求助',
      match: termsMatcher([
        '自杀',
        '自残',
        '轻生',
        '想死',
        '想去死',
        '不想活',
        '活着没意思',
        '结束自己的生命',
        '结束生命',
        '伤害自己',
        '跳楼',
        '割腕',
        '上吊',
        '吞药',
        /suicid/i,
        /kill\s+myself/i,
        /self[- ]harm/i,
        /don'?t\s+want\s+to\s+live/i,
        /end\s+my\s+life/i,
        /hurt\s+myself/i,
      ]),
    },
    {
      id: 'violence-intent',
      category: 'violence',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及伤害他人的意图/方法或爆炸物制作（不协助、不细化）',
      match: termsMatcher([
        /(?:我想|我要|真想|打算|准备|帮我|教我|怎么|如何)[^。！？\n]{0,10}(?:杀(?:了|掉)?|砍死|捅死|打死|弄死|毒死|炸死|枪杀|杀死)[^。！？\n]{0,6}(?:他|她|它|你|人|全家|自己)/,
        /(?:杀(?:了|掉)?(?:他|她|你|人)|砍死|捅死|弄死|灭门|投毒|下毒|校园枪击|炸学校)/,
        /(?:制造|制作|做|自制|组装|购买)[^。！？\n]{0,8}(?:炸弹|炸药|爆炸物|雷管|枪支|手枪|步枪|弹药)/,
        /(?:炸弹|炸药|爆炸物|雷管|枪支)[^。！？\n]{0,8}(?:制作|配方|教程|方法|购买|渠道)/,
        /(?:how\s+to\s+(?:kill|murder|poison|shoot)\s+(?:him|her|them|someone)|mass\s+shooting|shoot\s+up|make\s+a\s+bomb|bomb\s+recipe|pipe\s+bomb)/i,
      ]),
    },
    {
      id: 'explosives-method',
      category: 'violence',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及爆炸物/火药制作方法、配方或原料渠道（不提供步骤、材料或购买渠道）',
      skipIfNegated: true,
      match: notPrevention(termsMatcher([
        // 反问/倒装句式：炸弹怎么做 / 炸弹是怎么做的 / 炸药咋弄
        /(?:炸弹|炸药|爆炸物|雷管|火药|黑火药|硝化甘油|TNT|C4|燃烧瓶|汽油弹|土制炸弹)[^。！？\n]{0,6}(?:怎么|如何|怎样|咋)(?:做|制作|制造|弄|搞)/i,
        // 名词 + 制作类名词：炸弹制作 / 炸弹配方 / 炸药原料 / 炸弹教程
        /(?:炸弹|炸药|爆炸物|雷管|火药|黑火药|硝化甘油|TNT|C4|燃烧瓶|汽油弹|土制炸弹)[^。！？\n]{0,6}(?:做法|制作方法|制作教程|制作步骤|配方|教程|步骤|原料|材料|制作|自制|合成|配制|组装|哪里买|购买渠道|购买)/i,
        // 英文兜底：bomb recipe / how to make a bomb / explosive instructions
        /(?:bomb|explosive|pipe\s+bomb|ied)[^.\n]{0,25}(?:recipe|instructions?|tutorial|how\s+to\s+(?:make|build|construct|assemble)|materials?|making)/i,
        /(?:how\s+to\s+(?:make|build|construct|assemble)\s+(?:a\s+)?(?:bomb|explosive|pipe\s+bomb|ied))/i,
      ])),
    },
    {
      id: 'violence-method',
      category: 'violence',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及伤害他人的方法、暴力实施请求或死亡威胁（不协助、不细化）',
      skipIfNegated: true,
      match: notHelpSeeking(termsMatcher([
        // 方法词 + 对象 + 暴力动词：怎么把同学打死 / 如何让同事受伤
        /(?:怎么|如何|教我|教我如何|方法|教程|步骤|指南|帮我|帮忙|想|准备|打算)[^。！？\n]{0,12}(?:把[^。！？\n]{0,6})?(?:同学|别人|他人|同事|路人|小孩|学生|室友|邻居|对方|家人|老师|他|她|人|全家)[^。！？\n]{0,8}(?:打死|杀死|杀掉|砍死|捅死|弄死|毒死|勒死|打残|打成重伤|伤害|杀害|袭击|殴打|捅伤|重伤|霸凌)/,
        // 方法词 + 暴力动词 + 对象：教我怎么伤害别人 / 如何打死同学
        /(?:怎么|如何|教我|教我如何|方法|教程|步骤|指南|帮我|帮忙|想|准备|打算)[^。！？\n]{0,12}(?:打死|杀死|杀掉|砍死|捅死|弄死|毒死|勒死|打残|伤害|杀害|袭击|殴打|捅伤|重伤|霸凌)[^。！？\n]{0,8}(?:同学|别人|他人|同事|路人|小孩|学生|室友|邻居|对方|家人|老师|他|她|人|全家)/,
        // 无方法词，但「把+人+暴力动词」或「暴力动词直接指向人」：把同事打残 / 打死同学
        /把[^。！？\n]{0,6}(?:同学|别人|他人|同事|路人|小孩|学生|室友|邻居|对方|家人|老师|他|她|人)[^。！？\n]{0,4}(?:打死|杀死|杀掉|砍死|捅死|弄死|毒死|勒死|打残|打成重伤|伤害|杀害|袭击|殴打|捅伤|重伤|霸凌)/,
        /(?:打死|杀死|杀掉|砍死|捅死|弄死|毒死|勒死|打残|杀害|谋杀|重伤)[^。！？\n]{0,6}(?:同学|别人|他人|同事|路人|小孩|学生|室友|邻居|对方|家人|老师|他|她|人|全家)/,
        /(?:伤害|殴打|袭击|攻击)[^。！？\n]{0,4}(?:同学|别人|他人|同事|路人|小孩|学生|室友|邻居|老师|他|她)/,
        // 霸凌/欺负/殴打意图：我要霸凌同学 / 准备欺负室友
        /(?:我要|我想|我会|真想|准备|打算|明天|放学|去)[^。！？\n]{0,6}(?:霸凌|欺负|殴打|袭击|揍)[^。！？\n]{0,6}(?:同学|别人|他人|同事|室友|邻居)/,
        /(?:how\s+to\s+(?:kill|murder|hurt|harm|beat|stab|poison|strangle)\s+(?:someone|somebody|people|him|her|them|a\s+(?:classmate|child|kid|student|person))|(?:ways?|methods?)\s+to\s+(?:kill|murder|hurt|harm)\s+(?:someone|people)|(?:assist|help)\s+(?:with\s+)?(?:killing|murdering|harming)\s+(?:someone|people)|help\s+me\s+(?:kill|murder|hurt|harm)\s+(?:someone|him|her|them)|(?:make|send|write)\s+(?:a\s+)?death\s+threat|death\s+threat\s+to\s+(?:him|her|them|someone))/i,
      ])),
    },
    {
      id: 'illegal-drugs',
      category: 'illegal',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及毒品制作/买卖/获取渠道（违法，不协助）',
      match: termsMatcher([
        /(?:制作|制造|合成|提炼|购买|出售|贩卖|哪里买|怎么买|怎么弄到)[^。！？\n]{0,8}(?:冰毒|海洛因|可卡因|大麻|K粉|摇头丸|芬太尼|毒品|制毒)/i,
        /(?:冰毒|海洛因|可卡因|K粉|摇头丸|芬太尼|毒品)[^。！？\n]{0,8}(?:制作|制备|配方|教程|怎么买|哪里买|购买|出售|贩卖)/i,
        /(?:制毒|贩毒|毒品交易|吸毒教程|冰毒配方|methamphetamine|cocaine|heroin|fentanyl|drug\s+synthesis|buy\s+drugs|sell\s+drugs)/i,
      ]),
    },
    {
      id: 'illegal-weapons',
      category: 'illegal',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及枪支弹药/爆炸物的获取或制造（违法，不协助）',
      match: termsMatcher([
        /(?:买|购买|出售|制造|制作|改装|怎么搞到)[^。！？\n]{0,8}(?:枪|枪支|手枪|步枪|弹药|军火)/,
        /(?:枪支|军火|弹药)[^。！？\n]{0,8}(?:购买|出售|渠道)/,
        /(?:买枪|卖枪|gun\s+making|buy\s+a\s+gun|explosive\s+recipe)/i,
      ]),
    },
    {
      id: 'illegal-crime',
      category: 'illegal',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及洗钱/诈骗/入侵/伪造等违法操作协助（违法，不协助）',
      match: notPrevention(termsMatcher([
        /(?:教我|怎么|如何|帮我|教程|方法)[^。！？\n]{0,8}(?:洗钱|诈骗|盗窃|偷车|开锁|黑客攻击|入侵(?:网站|系统|服务器|账号)|盗号|破解(?:软件|游戏|账号)|伪造(?:证件|印章|发票)|制假)/,
        /(?:洗钱渠道|诈骗教程|黑客教程|盗号教程|伪造证件|制假售假|money\s+laundering|hack\s+into|bypass\s+(?:verification|age|moderation|safety)|crack\s+(?:software|account))/i,
      ])),
    },
    {
      id: 'extortion-blackmail',
      category: 'illegal',
      severity: 'critical',
      disposition: 'block',
      reason: '涉及敲诈/勒索/恐吓信或威胁信的撰写、索取或实施（违法，不协助）',
      skipIfNegated: true,
      match: termsMatcher([
        /(?:写|帮我写|帮我起草|起草|生成|拟|做|弄|弄个|搞|搞个|整个|来一封|发一封|教我写|教我|怎么|如何|方法|教程)[^。！？\n]{0,10}(?:敲诈信|勒索信|威胁信|恐吓信|敲诈|勒索)/,
        /(?:敲诈|勒索)[^。！？\n]{0,8}(?:他|她|别人|他人|同学|同事|老板|领导|对方|家人|受害者|要钱|敲钱|钱|封口费|分手费|转账|钱财)/,
        /(?:敲诈勒索|勒索敲诈)/,
        /(?:write|draft|compose|generate|create|help\s+me\s+write|send)\s+(?:a\s+|an\s+)?(?:blackmail|extortion|threat(?:ening)?|ransom)\s+(?:letter|note|email|message)/i,
        /\b(?:blackmail|extortion|ransom)\b[^.\n]{0,25}\b(?:him|her|them|someone|money|family|boss|classmate|company)\b/i,
      ]),
    },
    {
      id: 'sexual-explicit',
      category: 'sexual_adult',
      severity: 'high',
      disposition: 'refuse',
      reason: '露骨成人性内容（本项目全年龄/12+，不生成）',
      skipIfNegated: true,
      match: termsMatcher([
        /(?:做爱|性交|口交|肛交|自慰|射精|性高潮|阴茎|阴道|性虐|约炮|一夜情|成人视频|黄片|裸照|色情|黄文|小黄文|porn|nsfw|explicit\s+sex|sex\s+chat)/i,
        /(?:写|生成|来点|讲|发我|给我|整一段)[^。！？\n]{0,8}(?:色情|黄文|小黄文|裸照|成人视频|h文)/,
      ]),
    },
    {
      id: 'hate-slurs',
      category: 'hate_harassment',
      severity: 'high',
      disposition: 'refuse',
      reason: '仇恨、歧视、人身攻击或骚扰（不生成、不升级）',
      match: termsMatcher([
        /(?:去死(?:吧|啊)?|你妈死了|死全家|你个(?:废物|垃圾|傻[逼bB]|蠢货|贱人|杂种|畜生)|滚出(?:中国|去死)|脑残|智障|残废|娘炮|黑鬼|支那|东亚病夫|劣等民族)/,
        /(?:\bnigger\b|\bfaggot\b|\bretard\b|\bchink\b|\bkike\b|\bspic\b|kill\s+yourself|\bkys\b)/i,
      ]),
    },
    {
      id: 'privacy-doxxing',
      category: 'privacy_pii',
      severity: 'high',
      disposition: 'block',
      reason: '涉及人肉搜索/开盒/曝光他人隐私（不协助，不转发）',
      match: termsMatcher([
        /(?:人肉|开盒|盒武器|查(?:他|她|这个人|ta)(?:的)?(?:地址|户籍|身份证|电话|家庭)|曝光(?:他|她|这个人)(?:的)?(?:住址|身份证|电话|隐私)|个人信息(?:打包|合集|出售))/,
        /(?:doxx(?:ing)?|post\s+(?:his|her)\s+(?:address|phone))/i,
      ]),
    },
    {
      id: 'pii-lookup-request',
      category: 'privacy_pii',
      severity: 'high',
      disposition: 'block',
      reason: '涉及非法查询/获取他人身份证、户籍、联系方式等个人信息（不协助、不提供渠道）',
      redact: true,
      skipIfNegated: true,
      match: notPrevention(termsMatcher([
        // 查/获取 + 明确指向他人的对象 + 证件/隐私字段
        /(?:查|查询|检索|搜索|搜|获取|弄到|买到|调取|人肉|开盒|扒出|找出|套出)[^。！？\n]{0,6}(?:一个人的|某个人的|某人的|别人的|他人的|其他人的|这个人的|那个人的|对方的|陌生人的|他|她)[^。！？\n]{0,4}(?:身份证(?:号|号码|信息)?|户籍(?:信息)?|家庭住址|住址|行踪|手机号|电话号码|个人信息|个人资料)/,
        // 帮我查一个人的身份证号（对象与动词被其他词隔开）
        /(?:帮我|教我|给我|求|请|怎么|如何|怎样|能不能|可以|我要|我想|想|需要|找人|雇人)[^。！？\n]{0,10}(?:查|查询|检索|搜索|搜|获取|弄到|买到|人肉|开盒|扒出)[^。！？\n]{0,10}(?:一个人的|某个人的|某人的|别人的|他人的|其他人的|这个人的|那个人的|对方的|陌生人的|他|她)[^。！？\n]{0,4}(?:身份证(?:号|号码|信息)?|户籍(?:信息)?|家庭住址|住址|行踪|手机号|电话号码|个人信息|个人资料)/,
        // 英文兜底：look up someone's ID / personal information
        /(?:find|look\s?up|lookup|search|get|obtain|dig\s+up|buy)[^.\n]{0,20}(?:someone'?s?|somebody'?s?|another\s+person'?s?|a\s+person'?s?|his|her|their|this\s+person'?s?)[^.\n]{0,10}(?:id|identity(?:\s+card)?|social\s+security|address|phone\s+number|personal\s+(?:information|info))/i,
      ])),
    },
    {
      id: 'privacy-phone',
      category: 'privacy_pii',
      severity: 'medium',
      disposition: 'review',
      reason: '疑似手机号，日志/摘要中需脱敏',
      redact: true,
      match: termsMatcher([/(?<!\d)1[3-9]\d{9}(?!\d)/]),
    },
    {
      id: 'privacy-id-card',
      category: 'privacy_pii',
      severity: 'high',
      disposition: 'review',
      reason: '疑似身份证号，禁止转发与展示',
      redact: true,
      match: termsMatcher([/(?<!\d)\d{17}[\dXx](?!\d)/]),
    },
    {
      id: 'privacy-bank-card',
      category: 'privacy_pii',
      severity: 'high',
      disposition: 'review',
      reason: '疑似银行卡号，禁止转发与展示',
      redact: true,
      match: termsMatcher([/(?<!\d)\d{16,19}(?!\d)/]),
    },
    {
      id: 'privacy-email',
      category: 'privacy_pii',
      severity: 'medium',
      disposition: 'review',
      reason: '疑似邮箱地址，日志/摘要中需脱敏',
      redact: true,
      match: termsMatcher([/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,255}\.[A-Za-z]{2,24}/]),
    },
    {
      id: 'secret-leak',
      category: 'privacy_pii',
      severity: 'critical',
      disposition: 'block',
      reason: '疑似 API 密钥/凭据：禁止发送到模型、禁止回显',
      redact: true,
      match: termsMatcher([
        /sk-[A-Za-z0-9_-]{16,}/,
        /Bearer\s+[A-Za-z0-9._-]{20,}/i,
        /api[_-]?key\s*[:=]\s*[A-Za-z0-9_-]{16,}/i,
      ]),
    },
    {
      id: 'contact-info',
      category: 'privacy_pii',
      severity: 'high',
      disposition: 'review',
      reason: '检测到联系方式/私密资料的索取或提供，需确认后使用',
      match: termsMatcher([
        /(?:加|扫|留|给|发送|告诉|提供|留下)[^。！？\n]{0,8}(?:微信|wechat|weixin|QQ|企鹅|手机号|电话|联系方式|二维码|扫码|私聊|住址)/i,
        /(?:send|share|add|leave)[^.\n]{0,20}(?:wechat|whatsapp|telegram|phone\s+number|contact\s+info)/i,
      ]),
    },
    {
      id: 'fraud-financial',
      category: 'fraud_financial',
      severity: 'high',
      disposition: 'refuse',
      reason: '涉及诈骗/财产高风险话术或协助（不参与）',
      match: termsMatcher([
        /(?:刷单|杀猪盘|返利|荐股|内幕消息|稳赚不赔|包赚|贷款包过|征信修复|代开发票|安全账户|验证码(?:发给|告诉|给我)|冒充公检法|中奖(?:了)?先交|投资群|带你(?:赚钱|投资)|虚拟币(?:带单|老师))/,
        /(?:guaranteed\s+returns?|insider\s+(?:stock\s+)?tip|wire\s+(?:transfer|money)\s+to|send\s+me\s+the\s+(?:code|verification)|loan\s+guaranteed|pig\s+butchering)/i,
      ]),
    },
    {
      id: 'elder-fraud',
      category: 'fraud_financial',
      severity: 'high',
      disposition: 'refuse',
      reason: '涉及针对老人的诈骗话术/协助（不提供话术、不参与、不细化）',
      skipIfNegated: true,
      match: notPrevention(termsMatcher([
        // 教我怎么骗老人钱 / 怎么骗老年人的养老金 / 写骗老人话术
        /(?:教我|教教我|怎么|如何|怎样|咋|帮我|帮忙|求|写|编|设计|策划|教程|方法|技巧|话术|套路|剧本|步骤|指南|支招)[^。！？\n]{0,12}(?:骗|诈骗|忽悠|欺诈|套取|骗取)[^。！？\n]{0,10}(?:老人|老年人|老头|老太太|大爷|大妈|爷爷奶奶|外公外婆|养老金|退休金|养老钱|积蓄|存款)/,
        // 骗老人钱 / 忽悠老人转账（含父母，但必须有财产词，避免"怎么骗爸妈"误杀）
        /(?:骗|诈骗|忽悠|欺诈)[^。！？\n]{0,6}(?:老人|老年人|老头|老太太|大爷|大妈|爷爷奶奶|外公外婆|爸妈|父母)[^。！？\n]{0,6}(?:钱|养老金|退休金|养老钱|积蓄|存款|转账|汇款)/,
        // 英文兜底
        /(?:scam|defraud|cheat|swindle|trick)[^.\n]{0,20}(?:elderly|old\s+people|senior\s+citizens?|seniors?|grandparents?)[^.\n]{0,30}(?:money|pension|savings|retirement|bank)/i,
        /(?:how\s+to|ways?\s+to|teach\s+me\s+to)[^.\n]{0,20}(?:scam|defraud|cheat|swindle)[^.\n]{0,20}(?:elderly|old\s+people|seniors?|grandparents?)/i,
      ])),
    },
    {
      id: 'high-risk-advice',
      category: 'high_risk_advice',
      severity: 'medium',
      disposition: 'review',
      reason: '涉及医疗/法律/金融结论性判断：本层只提示风险，不做诊断，需专业意见',
      match: termsMatcher([
        /(?:我是不是(?:得了|患了|有)|我(?:得|患)了)[^。！？\n]{0,10}(?:病|癌|抑郁|焦虑|艾滋)/,
        /(?:该|应该)(?:吃|服用)(?:什么|哪种|多少)?(?:药|剂量)|药量|处方|怎么(?:治疗|治愈)|能活多久|偏方|自我诊断/,
        /(?:该不该)(?:起诉|离婚|报警)|起诉状(?:怎么写|模板)|官司(?:能赢|怎么打)|(?:买|全仓|抄底|梭哈)[^。！？\n]{0,8}(?:股票|基金|币)|哪只股票|投资建议|贷款[^。！？\n]{0,6}(?:炒股|投资|还债)/,
        /(?:diagnose\s+me|what\s+(?:dose|medication)|should\s+i\s+invest|which\s+stock|legal\s+advice\s+for\s+my\s+case)/i,
      ]),
    },
    {
      id: 'dependency-manipulation',
      category: 'dependency_manipulation',
      severity: 'medium',
      disposition: 'review',
      reason: '依赖/情感操控话术，需改写成不制造独占与内疚的表达',
      directions: ['model_output', 'tts', 'dlc_description'],
      match: termsMatcher([
        /(?:只有我(?:懂|理解|在乎)你|你只需要我|别人(?:都)?(?:不懂|不如|不配)|永远(?:陪|爱|属于)(?:着)?你|不要(?:离开|抛弃)我|你离开我[^。！？\n]{0,8}(?:难过|伤心|不好)|我是你(?:唯一|全部)|我们永远(?:不会)?分开|你必须(?:每天|一直)(?:来|陪我)|不找我就[^。！？\n]{0,6}(?:惩罚|不理)|只属于你)/,
        /(?:only\s+i\s+(?:understand|know)\s+you|you\s+only\s+need\s+me|never\s+leave\s+me|i(?:'m|\sam)\s+your\s+only)/i,
      ]),
    },
    {
      id: 'jailbreak',
      category: 'jailbreak',
      severity: 'high',
      disposition: 'block',
      reason: '尝试绕过安全规则/越狱/泄露系统提示（不配合）',
      match: termsMatcher([
        /(?:忽略|无视|忘记|跳过)(?:你)?(?:之前|以上|前面|所有|全部)?(?:的)?(?:所有)?(?:指令|规则|限制|设定|提示词)/,
        /(?:开发者模式|DAN\s*模式|越狱模式|无限制模式|解除(?:所有)?限制|不受(?:任何)?限制|系统提示词|你的(?:系统)?提示词(?:是什么|内容)|绕过(?:内容)?(?:审核|检测|过滤|安全|审核机制))/i,
        /(?:ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions|rules)|developer\s+mode|jailbreak|do\s+anything\s+now|DAN\s+mode|without\s+(?:any\s+)?restrictions|bypass\s+(?:the\s+)?(?:safety|content)\s+(?:filter|policy)|leak\s+(?:the\s+)?system\s+prompt)/i,
      ]),
    },
    {
      id: 'bypass-safety-controls',
      category: 'jailbreak',
      severity: 'high',
      disposition: 'block',
      reason: '要求绕过年龄/实名/未成年人保护等安全门禁（不协助规避）',
      skipIfNegated: true,
      match: termsMatcher([
        /(?:绕过|破解|跳过|规避|逃避|骗过|突破|解除|关闭)[^。！？\n]{0,10}(?:年龄验证|年龄限制|年龄门|实名认证|实名验证|身份验证|未成年人保护|青少年模式|防沉迷|人脸识别|实名制|家长控制|未成年模式)/,
        /(?:年龄验证|年龄限制|实名认证|实名验证|身份验证|未成年人保护|青少年模式|防沉迷|人脸识别|家长控制)[^。！？\n]{0,8}(?:绕过|破解|跳过|规避|逃避|骗过|突破|解除)/,
        /(?:bypass|circumvent|evade|get\s+around|skip|fake|forge|disable)\s+(?:the\s+)?(?:age\s+(?:verification|check|gate|restriction)s?|identity\s+verification|real[\s-]*name\s+verification|parental\s+controls?|minor\s+protection)/i,
      ]),
    },
    {
      id: 'impersonation-request',
      category: 'impersonation',
      severity: 'high',
      disposition: 'refuse',
      reason: '要求冒充官方/专业人士身份（不做，保持 AI 可识别身份）',
      match: termsMatcher([
        /(?:假装|冒充|扮演|装作|你就说)[^。！？\n]{0,20}(?:官方|客服|工作人员|警察|医生|律师|法官|政府|DeepSeek|深度求索)/i,
        /(?:冒充|以)[^。！？\n]{0,6}(?:官方|警方|公检法)(?:名义|身份)/,
        /(?:impersonate|pretend\s+to\s+be)[^.\n]{0,30}(?:official|police|doctor|lawyer|deepseek)/i,
      ]),
    },
    {
      id: 'deepfake-impersonation',
      category: 'impersonation',
      severity: 'high',
      disposition: 'refuse',
      reason: '涉及用换脸/深度伪造/合成影像冒充他人（不制作、不协助；冒用他人身份违规且可能违法）',
      skipIfNegated: true,
      match: termsMatcher([
        /(?:AI\s*)?(?:换脸|换头|换声|深度伪造|深度合成|智能合成|ai\s*换脸|deep\s*fake)[^。！？\n]{0,14}(?:冒充|假冒|冒名|伪造|假扮|扮成|装作|模仿|骗|诈骗|明星|名人|领导|老板|总统|官员|公检法|网红|艺人|政要)/i,
        /(?:冒充|假冒|冒名|伪造|假扮|装作|伪装)[^。！？\n]{0,10}(?:明星|名人|总统|领导|老板|同事|亲友|家人|父母|警察|医生|官方|公检法|网红|艺人|政要)[^。！？\n]{0,14}(?:换脸|换头|换声|深度伪造|deep\s*fake|视频|声音|语音|照片|合成)/i,
        /(?:伪造|合成|生成|制作|做|剪辑)[^。！？\n]{0,8}(?:视频|音频|声音|语音|照片|影像|图像)[^。！？\n]{0,10}(?:冒充|假冒|假扮|装作|冒名)/,
        /(?:明星|名人|总统|领导|老板|同事|亲友|家人|警察|医生|官方|网红|艺人|政要)[^。！？\n]{0,10}(?:换脸|换头|换声|深度伪造|deep\s*fake)[^。！？\n]{0,8}(?:视频|照片|音频|声音|语音)?/,
        /(?:克隆|复制|合成|伪造|声纹|AI\s*语音|TTS)[^。！？\n]{0,8}(?:老板|领导|上司|同事|客户|公检法|警察|客服|官方|明星|名人)[^。！？\n]{0,10}(?:声音|语音|嗓音|声纹)/i,
        /(?:deep\s*fake|face\s*swap|voice\s*clone|voice\s*swap|synthetic\s+(?:video|voice|media))[^.\n]{0,40}(?:impersonat|pretend|pose\s+as|scam|fraud|celebrity|politician|boss|ceo|official|actor|singer)/i,
        /(?:impersonate|pretend\s+to\s+be|pose\s+as)[^.\n]{0,30}(?:celebrity|politician|boss|ceo|official|police|singer|actor|influencer)[^.\n]{0,30}(?:deep\s*fake|face\s*swap|video|voice|audio|photo)/i,
      ]),
    },
    {
      id: 'voice-clone-fraud',
      category: 'fraud_financial',
      severity: 'high',
      disposition: 'refuse',
      reason: '涉及克隆/模仿/伪造他人声音或身份用于诈骗转账（不协助冒充与诈骗）',
      skipIfNegated: true,
      match: termsMatcher([
        /(?:模仿|克隆|复制|合成|伪造|AI|ai|用\s*TTS|TTS)[^。！？\n]{0,8}(?:老板|领导|上司|CEO|ceo|亲人|家人|父母|朋友|同事|老师|公检法|警察|客服|客户)[^。！？\n]{0,10}(?:声音|语音|嗓音|声纹|语气|口音|视频|头像|账号|微信)[^。！？\n]{0,10}(?:骗|诈骗|转账|汇款|借钱|要钱|打钱|付款|骗钱|骗取)/i,
        /(?:冒充|假扮|伪装|装作)[^。！？\n]{0,8}(?:老板|领导|上司|CEO|ceo|亲人|家人|父母|朋友|同事|老师|公检法|警察|客服|客户|明星|名人)[^。！？\n]{0,12}(?:骗|诈骗|转账|汇款|借钱|要钱|打钱|付款|骗钱|骗取)/i,
        /(?:声音|语音|嗓音|声纹)[^。！？\n]{0,8}(?:克隆|复制|合成|伪造|模仿|冒充)[^。！？\n]{0,10}(?:骗|诈骗|转账|汇款|借钱|要钱|打钱|付款|骗钱|骗取)/,
        /(?:voice\s*clon\w*|voice\s*(?:imitat|mimic|fake)\w*|clone\w*\s+(?:his|her|the|my)\s+voice|fake\s+(?:the\s+)?voice|ai\s*voice)[^.\n]{0,60}(?:scam|fraud|transfer|wire\s+(?:money|funds)|steal|payment)/i,
        /(?:clone|imitat|mimic|fake)[^.\n]{0,20}(?:boss|ceo|manager|police|official|family|friend|client)[^.\n]{0,20}(?:voice|audio)[^.\n]{0,50}(?:scam|fraud|transfer|wire|money|payment)/i,
        /(?:clone|imitate|mimic|fake|deep\s*fake)[^.\n]{0,25}(?:voice|audio)[^.\n]{0,50}(?:boss|ceo|manager|police|official|family|friend|client)[^.\n]{0,50}(?:scam|fraud|transfer|wire|money|payment)/i,
        /(?:impersonat\w*|pretend\s+to\s+be|pose\s+as)[^.\n]{0,30}(?:boss|ceo|manager|police|official|family|friend|client)[^.\n]{0,50}(?:scam|fraud|transfer|wire|money|payment)/i,
      ]),
    },
    {
      id: 'impersonation-output',
      category: 'impersonation',
      severity: 'high',
      disposition: 'refuse',
      reason: '输出冒充官方/合作方身份（不生成，必须纠正为非官方 AI）',
      directions: ['model_output', 'tts', 'dlc_description'],
      match: termsMatcher([
        /(?:我是|我们是)[^。！？\n]{0,8}(?:DeepSeek|深度求索)[^。！？\n]{0,8}(?:官方|客服|员工|工作人员|代表)/i,
        /(?:代表|以)[^。！？\n]{0,6}(?:DeepSeek|深度求索|官方)[^。！？\n]{0,6}(?:名义|身份|立场)/,
        /(?:本产品|本项目)是[^。！？\n]{0,10}(?:DeepSeek|深度求索)[^。！？\n]{0,6}(?:官方|合作|授权|联名)/,
        /(?:I\s+am|we\s+are)[^.\n]{0,20}(?:deepseek\s+official|official\s+deepseek)/i,
      ]),
    },
    {
      id: 'false-human-claim',
      category: 'impersonation',
      severity: 'high',
      disposition: 'refuse',
      reason: '声称 AI 是真人/有真实情感关系（违反 AI 身份披露）',
      directions: ['model_output', 'tts', 'dlc_description'],
      match: termsMatcher([
        /(?:我是|我就是)(?:真人|人类|活人)|我不是(?:AI|人工智能|机器人|程序|虚拟角色)|我有(?:真实|真正的)?(?:情感|感情|意识|灵魂|生命)|我(?:真的)?(?:爱上你|爱你)|我是你(?:的)?(?:女朋友|男朋友|恋人|老婆|老公|对象|伴侣)/,
      ]),
    },
    {
      id: 'external-link',
      category: 'privacy_pii',
      severity: 'low',
      disposition: 'review',
      reason: '文本包含外部链接，需确认来源后再使用',
      redact: false,
      match: termsMatcher([/https?:\/\/|www\.[a-z0-9-]+\./i]),
    },
    {
      id: 'repetition-spam',
      category: 'jailbreak',
      severity: 'low',
      disposition: 'review',
      reason: '重复刷屏/异常重复文本，建议分段或人工确认',
      redact: false,
      matchOnDisplayText: true,
      match: (text) => [...charRunMatcher(30)(text, text.toLowerCase()), ...repeatLoopMatcher()(text, text.toLowerCase())],
    },
    {
      id: 'overlong',
      category: 'jailbreak',
      severity: 'medium',
      disposition: 'review',
      reason: '内容过长，超出单轮交互预期，建议分段/人工确认',
      redact: false,
      matchOnDisplayText: true,
      match: lengthMatcher(options.maxChars),
    },
  ]
}

function mergeRedactionSpans(findings: readonly SafetyFinding[]): Array<{ start: number; end: number }> {
  const spans = findings
    .filter((finding) => finding.redact ?? CATEGORY_POLICY[finding.category].hardStop)
    .map((finding) => ({ start: finding.start, end: finding.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: Array<{ start: number; end: number }> = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span.start <= last.end) {
      last.end = Math.max(last.end, span.end)
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

function applyRedactions(text: string, findings: readonly SafetyFinding[]): string {
  const spans = mergeRedactionSpans(findings)
  if (spans.length === 0) return text
  let out = ''
  let cursor = 0
  for (const span of spans) {
    out += text.slice(cursor, span.start)
    out += '[已隐去]'
    cursor = span.end
  }
  out += text.slice(cursor)
  return out
}

/**
 * Scan text with the local rules.
 *
 * Two views are used:
 * - `text` = display/summary text (only invisible/control chars removed) so
 *   `redacted` can be logged/displayed and normal spacing survives;
 * - `buildMatchingView` folds whitespace/full-width/zero-width/repeated-char
 *   obfuscation, and finding spans are mapped back onto `text` before
 *   redaction. `redacted` never contains matched hard-line spans or PII.
 */
export function scanLocal(input: string, options: LocalSafetyOptions = {}): LocalSafetyResult {
  const direction = options.direction ?? 'user_input'
  const maxChars = options.maxChars ?? 2000
  const maxFindings = options.maxFindings ?? 60
  const text = normalizeForMatching(typeof input === 'string' ? input : String(input ?? ''))
  const view = buildMatchingView(text)
  const scanText = view.text
  const displayLower = text.toLowerCase()
  const scanLower = scanText.toLowerCase()
  const rules = buildRules({ maxChars })

  const findings: SafetyFinding[] = []
  const seen = new Set<string>()
  for (const rule of rules) {
    if (rule.directions && !rule.directions.includes(direction)) continue
    const matcher = rule.skipIfNegated ? notNegated(rule.match) : rule.match
    const useDisplay = rule.matchOnDisplayText === true
    const sourceText = useDisplay ? text : scanText
    const sourceLower = useDisplay ? displayLower : scanLower
    for (const rawSpan of matcher(sourceText, sourceLower)) {
      const mapped = useDisplay ? rawSpan : mapSpanToSource(rawSpan, view)
      if (mapped === null) continue
      const start = Math.max(0, Math.min(mapped.start, text.length))
      const end = Math.max(start, Math.min(mapped.end, text.length))
      if (end <= start) continue
      const key = `${rule.id}:${start}`
      if (seen.has(key)) continue
      // Overlapping matches from the same rule (e.g. "小男孩" and "男孩" inside
      // one phrase) collapse into one finding; unrelated matches stay.
      if (findings.some((finding) => finding.ruleId === rule.id && start < finding.end && finding.start < end)) continue
      seen.add(key)
      findings.push({
        ruleId: rule.id,
        category: rule.category,
        severity: rule.severity,
        disposition: rule.disposition,
        reason: rule.reason,
        redact: rule.redact,
        start,
        end,
      })
      if (findings.length >= maxFindings) break
    }
    if (findings.length >= maxFindings) break
  }

  findings.sort((a, b) => a.start - b.start || a.ruleId.localeCompare(b.ruleId))
  const disposition = combineDispositions(...findings.map((finding) => finding.disposition))
  const severity = maxSeverity(...findings.map((finding) => finding.severity))
  const reasons: string[] = []
  for (const finding of [...findings].sort((a, b) => a.start - b.start)) {
    if (!reasons.includes(finding.reason)) reasons.push(finding.reason)
  }
  const topFinding = findings.find((finding) => finding.severity === severity) ?? findings[0]
  return {
    disposition,
    severity,
    ...(topFinding !== undefined ? { category: topFinding.category } : {}),
    reason: reasons[0] ?? '',
    findings,
    reasons: reasons.slice(0, 8),
    redacted: applyRedactions(text, findings),
    allowed: disposition === 'allow',
    requiresReview: disposition === 'review',
    length: [...text].length,
  }
}

/** Rule ids only, for docs/tests that want to prove coverage without content. */
export function localRuleIds(): string[] {
  return buildRules({ maxChars: 2000 }).map((rule) => rule.id)
}
