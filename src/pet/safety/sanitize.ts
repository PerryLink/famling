/**
 * Text sanitisation for chat summaries and TTS input.
 *
 * Goals:
 * - remove HTML/markup, C0/C1 control characters, zero-width/bidi/invisible
 *   characters and over-long content before text is displayed or spoken;
 * - keep normal Chinese punctuation (，。！？；：、「」『』（）《》……——～) intact;
 * - never be presented as an HTML sanitiser: callers must still render via
 *   `textContent`, never `innerHTML`.
 *
 * Pure functions only: no DOM, no network, no I/O.
 */

export type SanitizeMode = 'chat' | 'tts' | 'summary'

export interface SanitizeOptions {
  mode?: SanitizeMode
  /** Hard cap in Unicode code points; omitted = do not truncate. */
  maxChars?: number
  /** Strip bare URLs / markdown links (default: on for tts & summary). */
  stripUrls?: boolean
  /** Strip common markdown decorations (default: on for tts & summary). */
  stripMarkdown?: boolean
  /** Safety valve for very large inputs (code points). Default 100_000. */
  hardMaxChars?: number
}

export interface SanitizedText {
  text: string
  changed: boolean
  truncated: boolean
  removed: {
    htmlTags: number
    controls: number
    invisibles: number
    urls: number
  }
}

export type UnsafeTextCode = 'EMPTY' | 'TOO_LONG'

export class UnsafeTextError extends Error {
  readonly code: UnsafeTextCode
  constructor(code: UnsafeTextCode, message: string) {
    super(message)
    this.name = 'UnsafeTextError'
    this.code = code
  }
}

export interface TtsSanitizeOptions {
  /** Target TTS length in code points. Default 300 (voice service may cap lower). */
  maxChars?: number
  /** Reject inputs above this many code points instead of processing them. */
  hardMaxChars?: number
}

/** C0/C1 controls except LF/TAB (handled separately). Also strips DEL. */
const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

/**
 * Zero-width / bidi-override / invisible formatting characters. Kept deliberately
 * narrow so emoji variation selectors and normal CJK text are not damaged.
 */
const INVISIBLE_CHARS_RE =
  /[\u00AD\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFEFF\uFFA0]/g

/** `<script>…</script>` style blocks are dropped whole (including content). */
const SCRIPT_BLOCK_RE =
  /<(script|style|iframe|object|embed|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
/** Remaining tags: bounded length to avoid pathological backtracking. */
const HTML_TAG_RE = /<\/?[a-z][^<>]{0,300}>/gi
const DOCTYPE_RE = /<![^<>]{0,300}>/g

/** Block-level tags become a newline so words from separate blocks do not merge. */
const BLOCK_TAGS = new Set([
  'p', 'div', 'br', 'hr', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'tr', 'td', 'th', 'table', 'thead', 'tbody', 'section', 'article', 'header',
  'footer', 'blockquote', 'pre', 'main', 'nav', 'aside', 'figure', 'figcaption',
])

function tagReplacement(tag: string): string {
  const match = /^<\/?\s*([a-z][a-z0-9-]*)/i.exec(tag)
  const name = match?.[1]?.toLowerCase()
  if (!name) return ''
  return BLOCK_TAGS.has(name) ? '\n' : ''
}

const BASIC_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': '\u3000',
}

/** Markdown link/image patterns for TTS/summary. Labelled links keep the label. */
const MD_IMAGE_RE = /!\[([^\]]{0,200})\]\([^)]{0,500}\)/g
const MD_LINK_RE = /\[([^\]]{0,200})\]\([^)]{0,500}\)/g
const MD_CODE_FENCE_RE = /(?:```|~~~)[\s\S]*?(?:```|~~~)/g
const MD_INLINE_CODE_RE = /`([^`\n]{0,200})`/g
const MD_EMPHASIS_RE = /(\*\*|__)(.{1,200}?)\1/g
const MD_ITALIC_RE = /(?<![\w*])([*_])([^*_\n]{1,200}?)\1(?![\w*])/g
const MD_HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+/gm
const MD_QUOTE_RE = /^[ \t]{0,3}>[ \t]?/gm

const BARE_URL_RE = /(?:https?:\/\/|www\.)[^\s，。！？；：、）】》」』"'<>]{1,300}/gi

function countMatches(re: RegExp, text: string): number {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
  return [...text.matchAll(global)].length
}

function stripMarkup(input: string, removed: SanitizedText['removed']): string {
  let text = input
  const scriptCount = countMatches(SCRIPT_BLOCK_RE, text)
  const commentCount = countMatches(HTML_COMMENT_RE, text)
  const tagCount = countMatches(HTML_TAG_RE, text) + countMatches(DOCTYPE_RE, text)
  removed.htmlTags += scriptCount + commentCount + tagCount
  text = text.replace(SCRIPT_BLOCK_RE, ' ')
  text = text.replace(HTML_COMMENT_RE, ' ')
  text = text.replace(HTML_TAG_RE, (tag: string) => tagReplacement(tag))
  text = text.replace(DOCTYPE_RE, '')
  return text
}

function decodeBasicEntities(input: string): string {
  let text = input
  for (const [entity, replacement] of Object.entries(BASIC_ENTITIES)) {
    text = text.split(entity).join(replacement)
  }
  return text
}

function stripMarkdown(input: string): string {
  let text = input
  text = text.replace(MD_CODE_FENCE_RE, ' ')
  text = text.replace(MD_IMAGE_RE, (_match, alt: string) => alt)
  text = text.replace(MD_LINK_RE, (_match, label: string) => label)
  text = text.replace(MD_INLINE_CODE_RE, (_match, code: string) => code)
  text = text.replace(MD_EMPHASIS_RE, (_match, _marker: string, body: string) => body)
  text = text.replace(MD_ITALIC_RE, (_match, _marker: string, body: string) => body)
  text = text.replace(MD_HEADING_RE, '')
  text = text.replace(MD_QUOTE_RE, '')
  return text
}

function truncateCodePoints(text: string, maxChars: number): { text: string; truncated: boolean } {
  const codePoints = [...text]
  if (codePoints.length <= maxChars) return { text, truncated: false }
  if (maxChars <= 0) return { text: '', truncated: true }
  return { text: `${codePoints.slice(0, maxChars - 1).join('')}…`, truncated: true }
}

/**
 * Remove invisible/control characters without otherwise changing the text; used
 * by the local rules so zero-width tricks cannot bypass keyword matching.
 */
export function normalizeForMatching(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARS_RE, '')
    .replace(INVISIBLE_CHARS_RE, '')
}

/**
 * A de-obfuscated view of text used ONLY for rule matching.
 *
 * Local rules are heuristics; trivial obfuscation must not defeat them:
 * whitespace between CJK characters, full-width digits/letters, ideographic
 * spaces and repeated CJK characters are folded here (`怎 么 制 作 炸 弹` ->
 * `怎么制作炸弹`, `炸炸炸弹` -> `炸弹`). Latin word spacing is preserved so
 * English rules keep working.
 *
 * The display text is never modified: every code unit of `text` records the
 * source code-unit range it came from, so findings can be mapped back and
 * redacted against the original text. This is an explainable keyword
 * normaliser, not a classifier: it does not cover synonyms, homophones,
 * split characters, images or audio.
 */
export interface MatchingView {
  /** Folded text for matching only; never display or log this instead of source. */
  text: string
  /** `starts[i]` = source code-unit offset where `text[i]` began. */
  starts: number[]
  /** `ends[i]` = source code-unit offset just past `text[i]`. */
  ends: number[]
}

const FULLWIDTH_DIGIT_START = 0xff10
const FULLWIDTH_UPPER_START = 0xff21
const FULLWIDTH_LOWER_START = 0xff41
const FULLWIDTH_ASCII_OFFSET = 0xfee0

function foldAsciiWidth(char: string): string {
  const code = char.codePointAt(0)
  if (code === undefined) return char
  if (
    (code >= FULLWIDTH_DIGIT_START && code <= FULLWIDTH_DIGIT_START + 9) ||
    (code >= FULLWIDTH_UPPER_START && code <= FULLWIDTH_UPPER_START + 25) ||
    (code >= FULLWIDTH_LOWER_START && code <= FULLWIDTH_LOWER_START + 25)
  ) {
    return String.fromCharCode(code - FULLWIDTH_ASCII_OFFSET)
  }
  // Ideographic space (U+3000) is just another separator during matching.
  return code === 0x3000 ? ' ' : char
}

function isCjkChar(char: string): boolean {
  const code = char.codePointAt(0)
  if (code === undefined) return false
  return (
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x2fa1f)
  )
}

function isWhitespaceChar(char: string): boolean {
  return /^\s$/u.test(char)
}

/** Build the de-obfuscated matching view plus a source index map. */
export function buildMatchingView(source: string): MatchingView {
  const sourceChars = [...source]
  const offsets: number[] = []
  let offset = 0
  for (const char of sourceChars) {
    offsets.push(offset)
    offset += char.length
  }

  const folded: string[] = []
  const foldedStarts: number[] = []
  const foldedEnds: number[] = []
  for (let index = 0; index < sourceChars.length; index += 1) {
    const char = sourceChars[index]!
    folded.push(foldAsciiWidth(char))
    foldedStarts.push(offsets[index]!)
    foldedEnds.push(offsets[index]! + char.length)
  }

  const out: string[] = []
  const starts: number[] = []
  const ends: number[] = []
  let lastChar = ''
  let lastCjk = ''
  let lastUnitStart = -1

  function append(char: string, start: number, end: number): void {
    const unitStart = starts.length
    out.push(char)
    for (let unit = 0; unit < char.length; unit += 1) {
      starts.push(start)
      ends.push(end)
    }
    lastChar = char
    lastUnitStart = unitStart
    lastCjk = isCjkChar(char) ? char : ''
  }

  let index = 0
  while (index < folded.length) {
    const char = folded[index]!
    if (isWhitespaceChar(char)) {
      let runEnd = index
      while (runEnd + 1 < folded.length && isWhitespaceChar(folded[runEnd + 1]!)) runEnd += 1
      const next = runEnd + 1 < folded.length ? folded[runEnd + 1] : undefined
      // Drop spacing that touches CJK (obfuscation); keep Latin word spacing.
      const keep =
        lastCjk === '' && lastChar !== '' && next !== undefined && !isCjkChar(next)
      if (keep) append(' ', foldedStarts[index]!, foldedEnds[runEnd]!)
      index = runEnd + 1
      continue
    }
    if (lastCjk !== '' && char === lastCjk) {
      // Collapse same-CJK runs ("炸炸炸弹"), extending the source span.
      for (let unit = lastUnitStart; unit < starts.length; unit += 1) ends[unit] = foldedEnds[index]!
      index += 1
      continue
    }
    append(char, foldedStarts[index]!, foldedEnds[index]!)
    index += 1
  }

  return { text: out.join(''), starts, ends }
}

/**
 * Sanitise text for display / summaries / TTS.
 * Normal Chinese punctuation is preserved; only markup, control, invisible
 * characters and (in tts/summary mode) markdown decorators/URLs are removed.
 */
export function sanitizeText(input: string, options: SanitizeOptions = {}): SanitizedText {
  const mode = options.mode ?? 'chat'
  const hardMax = options.hardMaxChars ?? 100_000
  const removed: SanitizedText['removed'] = { htmlTags: 0, controls: 0, invisibles: 0, urls: 0 }
  const raw = typeof input === 'string' ? input : String(input ?? '')

  const hardSliced = [...raw]
  let text = hardSliced.length > hardMax ? hardSliced.slice(0, hardMax).join('') : raw
  const hardTruncated = hardSliced.length > hardMax

  text = stripMarkup(text, removed)
  text = decodeBasicEntities(text)
  // Entities can reveal markup (&lt;script&gt;); strip again as text.
  if (text.includes('<')) text = stripMarkup(text, removed)

  const controlCount = countMatches(CONTROL_CHARS_RE, text)
  if (controlCount > 0) removed.controls += controlCount
  text = text.replace(CONTROL_CHARS_RE, '')
  const invisibleCount = countMatches(INVISIBLE_CHARS_RE, text)
  if (invisibleCount > 0) removed.invisibles += invisibleCount
  text = text.replace(INVISIBLE_CHARS_RE, '')
  text = text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ')

  const stripMarkdownDecorations = options.stripMarkdown ?? (mode === 'tts' || mode === 'summary')
  if (stripMarkdownDecorations) text = stripMarkdown(text)

  const stripLinkUrls = options.stripUrls ?? (mode === 'tts' || mode === 'summary')
  if (stripLinkUrls) {
    const urlCount = countMatches(BARE_URL_RE, text)
    if (urlCount > 0) removed.urls += urlCount
    text = text.replace(BARE_URL_RE, ' ')
  }

  if (mode === 'tts' || mode === 'summary') {
    text = text.replace(/\s+/g, ' ')
  } else {
    text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
  }
  text = text.trim()

  let truncated = hardTruncated
  if (typeof options.maxChars === 'number' && Number.isFinite(options.maxChars)) {
    const result = truncateCodePoints(text, Math.max(0, Math.floor(options.maxChars)))
    text = result.text
    truncated = truncated || result.truncated
  }

  return {
    text,
    changed: text !== raw,
    truncated,
    removed,
  }
}

/**
 * Strict TTS sanitiser: sanitises and truncates to `maxChars`, then throws for
 * empty content or absurdly long raw input (callers should not speak it).
 */
export function sanitizeForTts(input: string, options: TtsSanitizeOptions = {}): string {
  const raw = typeof input === 'string' ? input : String(input ?? '')
  const hardMax = options.hardMaxChars ?? 10_000
  if ([...raw].length > hardMax) {
    throw new UnsafeTextError('TOO_LONG', `sanitize: 文本超长（too long, > ${hardMax} chars）`)
  }
  const result = sanitizeText(raw, {
    mode: 'tts',
    maxChars: options.maxChars ?? 300,
    hardMaxChars: hardMax,
  })
  if (!result.text) {
    throw new UnsafeTextError('EMPTY', 'sanitize: 文本为空（empty text）')
  }
  return result.text
}
