/**
 * Strict HTML escaping and HTML-to-plain-text conversion, no dependencies.
 *
 * The pet UI mostly assigns `textContent`, which is already injection-safe
 * (main.ts render/showBubble, chat-import lists). That is not true everywhere:
 * `tinglan-preview.ts:34` builds a template with `innerHTML` and relies on a
 * local 5-character escape; pack metadata/collection UIs in the repo use
 * `innerHTML` with data. The pet also has no CSP in the browser/dev HTML
 * (pet.html has no meta CSP; only Tauri's tauri.conf.json sets one), so any
 * future string-built markup must escape at the sink. This module gives the
 * shared, tested escape + plain-text helpers so no caller needs to hand-roll
 * one.
 *
 * `toPlainText` is for turning untrusted/foreign markup into display text
 * (subtitles, logs, imported digests). It is NOT an HTML sanitizer for building
 * markup: if you must build HTML, run every interpolated value through
 * `escapeHtml` (or `escapeAttribute` in attributes).
 */

/** Longest input scanned by `toPlainText` (regex/backstop DoS guard). */
export const MAX_PLAIN_TEXT_INPUT_CHARS = 100_000
/** Default output cap for `toPlainText`. */
export const MAX_PLAIN_TEXT_OUTPUT_CHARS = 2_000

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g
const BIDI = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g

const ENTITY_MAP: Readonly<Record<string, string>> = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
})

/** Coerce any value to a string without throwing (symbols/objects safe). */
function coerce(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  try {
    return String(value)
  } catch {
    return ''
  }
}

const ESCAPE_MAP: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
})

/**
 * Escape a value for HTML text or a quoted attribute. `&` is escaped first via
 * a single pass, so the result is idempotent-safe (already-escaped input gets
 * double-escaped, never un-escaped). Backtick and `=` are escaped too, which
 * covers unquoted-attribute template mistakes in addition to the usual five.
 */
export function escapeHtml(value: unknown): string {
  return coerce(value).replace(/[&<>"'/`=]/g, (ch) => ESCAPE_MAP[ch] ?? ch)
}

/** Alias with an explicit intent; same strict escaping as `escapeHtml`. */
export function escapeAttribute(value: unknown): string {
  return escapeHtml(value)
}

/** Decode a small, bounded set of entities; unknown entities stay literal. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (match, body: string) => {
    const lower = body.toLowerCase()
    if (lower.startsWith('#x')) {
      const code = Number.parseInt(lower.slice(2), 16)
      return isSafeCodePoint(code) ? String.fromCodePoint(code) : match
    }
    if (lower.startsWith('#')) {
      const code = Number.parseInt(lower.slice(1), 10)
      return isSafeCodePoint(code) ? String.fromCodePoint(code) : match
    }
    return ENTITY_MAP[lower] ?? match
  })
}

function isSafeCodePoint(code: number): boolean {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return false
  // Keep NUL and lone surrogates out; they are text corruption, not content.
  if (code === 0 || (code >= 0xd800 && code <= 0xdfff)) return false
  return true
}

/**
 * Remove `<script>`/`<style>`/`<template>`/`<iframe>` blocks including their
 * content. Implemented as a small linear scanner (not a backtracking regex) so
 * hostile input with thousands of unclosed `<script` tokens stays O(n).
 */
function stripDangerousBlocks(text: string): string {
  const names = ['script', 'style', 'template', 'iframe', 'object', 'embed', 'svg', 'math']
  let out = ''
  let index = 0
  const lower = text.toLowerCase()
  while (index < text.length) {
    const nextOpen = lower.indexOf('<', index)
    if (nextOpen === -1) {
      out += text.slice(index)
      break
    }
    out += text.slice(index, nextOpen)
    let consumed = false
    for (const name of names) {
      const openTag = `<${name}`
      if (lower.startsWith(openTag, nextOpen)) {
        const tagEnd = lower.indexOf('>', nextOpen + openTag.length)
        if (tagEnd !== -1) {
          const closeTag = `</${name}`
          const closeStart = lower.indexOf(closeTag, tagEnd + 1)
          if (closeStart !== -1) {
            const closeEnd = lower.indexOf('>', closeStart + closeTag.length)
            index = closeEnd === -1 ? text.length : closeEnd + 1
          } else {
            // Unclosed dangerous block: drop the remainder (browsers would too).
            index = text.length
          }
          consumed = true
          break
        }
      }
    }
    if (!consumed) {
      // Not a dangerous block start: keep the `<` and keep scanning after it.
      out += '<'
      index = nextOpen + 1
    }
  }
  return out
}

/** Remove all remaining tags (`<...>` up to 2048 chars, no nested `<`). */
function stripTags(text: string): string {
  return text.replace(/<[^<>]{0,2048}>/g, '')
}

export interface PlainTextOptions {
  /** Output cap in code points (default 2000). */
  maxChars?: number
  /** Collapse all whitespace runs to single spaces (default true). */
  collapseWhitespace?: boolean
  /** Decode a bounded set of HTML entities (default true). */
  decodeEntities?: boolean
}

/**
 * Convert possibly-markup text to bounded plain text:
 * drops dangerous blocks, strips tags, decodes a small entity set, removes
 * control/bidi characters, collapses whitespace and caps the length. Output
 * contains no `<` or `>` (they are stripped with the tags that carried them)
 * unless they arrived as entities, which are decoded to literal characters
 * *after* tag stripping — so the result is always safe for `textContent`, not
 * for `innerHTML`.
 */
export function toPlainText(value: unknown, options: PlainTextOptions = {}): string {
  let text = coerce(value)
  if (text.length > MAX_PLAIN_TEXT_INPUT_CHARS) text = text.slice(0, MAX_PLAIN_TEXT_INPUT_CHARS)
  text = text.replace(/<!--[\s\S]{0,10000}?-->/g, '')
  text = stripDangerousBlocks(text)
  text = stripTags(text)
  if (options.decodeEntities !== false) text = decodeEntities(text)
  text = text.replace(/[<>]/g, '')
  text = text.replace(CONTROL, '').replace(BIDI, '')
  if (options.collapseWhitespace === false) {
    text = text.replace(/[ \t]+/g, ' ')
  } else {
    text = text.replace(/\s+/g, ' ').trim()
  }
  const maxChars = options.maxChars ?? MAX_PLAIN_TEXT_OUTPUT_CHARS
  if (Number.isFinite(maxChars) && maxChars >= 0) {
    let out = ''
    let count = 0
    for (const ch of text) {
      if (count >= maxChars) break
      out += ch
      count += 1
    }
    text = out
  }
  return text
}

/** True when `escapeHtml(value)` would equal `value` (no special characters). */
export function isHtmlSafe(value: unknown): boolean {
  return !/[&<>"'/`=]/.test(coerce(value))
}
