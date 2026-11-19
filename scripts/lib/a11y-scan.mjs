/**
 * In-page scanners for the real-browser accessibility gate (E11 / MB-116).
 *
 * The heavy work happens INSIDE Chrome via Runtime.evaluate:
 *  - `buildContrastScanExpression(scope)` walks the rendered subtree, resolves
 *    each text element's effective background (alpha-composited, gradient/image
 *    backgrounds recorded as skipped instead of guessed) and returns WCAG 2.1
 *    contrast violations (4.5:1 normal / 3:1 large);
 *  - `buildAriaAuditExpression(scope)` returns the ARIA/label/heading/live
 *    region/tab/menu facts the gate asserts on;
 *  - `buildFocusInfoExpression()` describes the focused element and its focus
 *    indicator so Node-side code can check visibility + 3:1 non-text contrast.
 *
 * The WCAG math is NOT re-implemented here: the functions live in
 * `a11y-contrast.mjs` and are stringified into the page, so Node tests and the
 * browser use the same formula. The scanner functions below are also stringified
 * (never executed in Node) and only reference those injected helpers.
 */
import {
  BOLD_FONT_WEIGHT,
  LARGE_TEXT_PX,
  WCAG_MIN_CONTRAST,
  compositeOver,
  contrastRatio,
  isLargeText,
  parseCssColor,
  parseFontWeight,
  relativeLuminance,
  requiredContrast,
} from './a11y-contrast.mjs'

const PURE_CONSTANTS = [
  'const WCAG_MIN_CONTRAST = ' + JSON.stringify(WCAG_MIN_CONTRAST) + ';',
  'const BOLD_FONT_WEIGHT = ' + JSON.stringify(BOLD_FONT_WEIGHT) + ';',
  'const LARGE_TEXT_PX = ' + JSON.stringify(LARGE_TEXT_PX) + ';',
].join(' ')

// Order matters only in that all declarations share one injected scope.
const PURE_HELPERS = [
  parseCssColor,
  relativeLuminance,
  compositeOver,
  contrastRatio,
  parseFontWeight,
  isLargeText,
  requiredContrast,
]
  .map((fn) => fn.toString())
  .join('\n')

const MAX_VIOLATIONS = 60
const MAX_SKIPPED = 20

/**
 * In-page contrast scanner. Stringified by buildContrastScanExpression().
 * Kept as plain browser JavaScript (no imports, no TypeScript).
 */
function scanContrast(scopeSelector) {
  const scope = document.querySelector(scopeSelector)
  if (!scope) return { found: false, scope: scopeSelector }
  const skipTags = new Set(["SCRIPT","STYLE","NOSCRIPT","TEMPLATE","SVG","CANVAS","IMG","VIDEO","AUDIO","IFRAME","OBJECT","INPUT","TEXTAREA","SELECT","OPTION","OPTGROUP","BR","HR"])
  const describe = (element) => {
    if (!element || !element.tagName) return '?'
    let out = element.tagName.toLowerCase()
    if (element.id) out += '#' + element.id
    const className = typeof element.className === 'string' ? element.className.trim() : ''
    if (className) out += '.' + className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
    return out
  }
  const directText = (element) => {
    let text = ''
    for (const node of element.childNodes) {
      if (node.nodeType === 3) text += node.nodeValue || ''
    }
    return text.replace(/\s+/g, ' ').trim()
  }
  const isVisible = (element) => {
    if (element.getClientRects().length === 0) return false
    let node = element
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
      if (Number(style.opacity) <= 0.02) return false
      node = node.parentElement
    }
    return true
  }
  const backgroundOf = (element) => {
    const layers = []
    let node = element
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node)
      if (style.backgroundImage && style.backgroundImage !== 'none') return { unsupported: 'background-image' }
      const color = parseCssColor(style.backgroundColor)
      if (color && color.a > 0) {
        if (color.a >= 0.999) {
          let base = color
          for (let index = layers.length - 1; index >= 0; index -= 1) base = compositeOver(layers[index], base)
          return { color: base }
        }
        layers.push(color)
      }
      node = node.parentElement
    }
    return { unsupported: 'transparent-background' }
  }
  const formatColor = (color) =>
    'rgb(' + Math.round(color.r) + ', ' + Math.round(color.g) + ', ' + Math.round(color.b) + ')'
  const violations = new Map()
  const skipped = []
  const skippedCounts = {}
  const worst = []
  let candidates = 0
  let checked = 0
  const nodes = [scope].concat(Array.from(scope.querySelectorAll('*')))
  for (const element of nodes) {
    if (!element.tagName || skipTags.has(element.tagName)) continue
    const text = directText(element)
    if (text === '') continue
    candidates += 1
    if (!isVisible(element)) continue
    const style = getComputedStyle(element)
    const fontSize = Number.parseFloat(style.fontSize)
    if (!(fontSize > 0.5)) continue
    const foreground = parseCssColor(style.color)
    if (!foreground || foreground.a <= 0.02) continue
    const background = backgroundOf(element)
    if (background.unsupported) {
      skippedCounts[background.unsupported] = (skippedCounts[background.unsupported] || 0) + 1
      if (skipped.length < MAX_SKIPPED) {
        skipped.push({ element: describe(element), text: text.slice(0, 60), reason: background.unsupported })
      }
      continue
    }
    const effective = foreground.a < 0.999 ? compositeOver(foreground, background.color) : foreground
    const ratio = contrastRatio(effective, background.color)
    const fontWeight = parseFontWeight(style.fontWeight)
    const required = requiredContrast(fontSize, fontWeight)
    checked += 1
    const entry = {
      element: describe(element),
      text: text.slice(0, 80),
      color: formatColor(effective),
      background: formatColor(background.color),
      fontSize: Math.round(fontSize * 100) / 100,
      fontWeight,
      largeText: isLargeText(fontSize, fontWeight),
      required,
      ratio: Math.round(ratio * 100) / 100,
    }
    if (ratio + 0.01 < required) {
      const signature = [entry.element, entry.color, entry.background, String(entry.fontSize), String(entry.fontWeight), String(entry.required)].join('|')
      const existing = violations.get(signature)
      if (existing) existing.count += 1
      else violations.set(signature, Object.assign({ count: 1 }, entry))
    }
    worst.push(entry)
  }
  const violationList = Array.from(violations.values())
    .sort((left, right) => left.ratio - right.ratio)
    .slice(0, MAX_VIOLATIONS)
  worst.sort((left, right) => left.ratio - right.ratio)
  return {
    found: true,
    scope: scopeSelector,
    candidates,
    checked,
    violations: violationList,
    skipped: skipped.slice(0, MAX_SKIPPED),
    skippedCount: Object.values(skippedCounts).reduce((sum, value) => sum + value, 0),
    skippedReasons: skippedCounts,
    worst: worst.slice(0, 8),
    minRatio: worst.length > 0 ? worst[0].ratio : null,
  }
}

/**
 * In-page ARIA/structure audit. Stringified by buildAriaAuditExpression().
 */
function auditAria(scopeSelector) {
  const scope = document.querySelector(scopeSelector)
  if (!scope) return { found: false, scope: scopeSelector }
  const describe = (element) => {
    if (!element || !element.tagName) return '?'
    let out = element.tagName.toLowerCase()
    if (element.id) out += '#' + element.id
    const className = typeof element.className === 'string' ? element.className.trim() : ''
    if (className) out += '.' + className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
    return out
  }
  const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim()
  const textOf = (element) => normalize(element ? element.textContent : '')
  const resolveIds = (ids) =>
    normalize(ids)
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => textOf(document.getElementById(id)))
      .filter(Boolean)
      .join(' ')
  const labelledByText = (element) => resolveIds(element.getAttribute('aria-labelledby'))
  const describedByText = (element) => resolveIds(element.getAttribute('aria-describedby'))
  const accessibleName = (element) => {
    if (!element) return ''
    const fromLabelledBy = labelledByText(element)
    if (fromLabelledBy) return fromLabelledBy
    const ariaLabel = normalize(element.getAttribute('aria-label'))
    if (ariaLabel) return ariaLabel
    const tag = element.tagName
    if (tag === 'IMG') return normalize(element.getAttribute('alt'))
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      const labels = element.labels
      if (labels && labels.length > 0) return textOf(labels[0])
      const title = normalize(element.getAttribute('title'))
      if (title) return title
      return ''
    }
    const text = textOf(element)
    if (text) return text
    return normalize(element.getAttribute('title'))
  }
  const isVisible = (element) => {
    if (!element || element.getClientRects().length === 0) return false
    const style = getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse'
  }
  const isInert = (element) => {
    let node = element
    while (node && node.nodeType === 1) {
      if (node.inert === true || node.hasAttribute('inert')) return true
      node = node.parentElement
    }
    return false
  }
  const focusablesIn = (root) =>
    Array.from(
      root.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]'),
    ).filter((element) => {
      const tag = element.tagName
      if (tag === 'INPUT' && element.type === 'hidden') return false
      if (element.hasAttribute('disabled')) return false
      if (element.getAttribute('tabindex') === '-1') return false
      return isVisible(element)
    })

  const dialogs = []
  const dialogRoots = []
  if (scope.matches && scope.matches('[role="dialog"], [role="alertdialog"]')) dialogRoots.push(scope)
  for (const node of scope.querySelectorAll('[role="dialog"], [role="alertdialog"]')) dialogRoots.push(node)
  for (const dialog of dialogRoots) {
    dialogs.push({
      element: describe(dialog),
      role: dialog.getAttribute('role'),
      ariaModal: dialog.getAttribute('aria-modal'),
      labelledByAttr: normalize(dialog.getAttribute('aria-labelledby')),
      labelledByText: labelledByText(dialog),
      describedByAttr: normalize(dialog.getAttribute('aria-describedby')),
      describedByText: describedByText(dialog),
      hiddenAttribute: dialog.hidden === true,
      inert: isInert(dialog),
      visible: isVisible(dialog),
      tabIndex: dialog.tabIndex,
    })
  }

  const liveRegions = []
  const liveNodes = Array.from(scope.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]'))
  if (scope.matches && scope.matches('[aria-live], [role="status"], [role="alert"], [role="log"]')) liveNodes.unshift(scope)
  for (const node of liveNodes) {
    const role = node.getAttribute('role')
    const ariaLive = node.getAttribute('aria-live')
    if (role !== 'status' && role !== 'alert' && role !== 'log' && !ariaLive) continue
    liveRegions.push({
      element: describe(node),
      role,
      ariaLive,
      ariaAtomic: node.getAttribute('aria-atomic'),
      hiddenAttribute: node.hidden === true,
      inert: isInert(node),
      visible: isVisible(node),
      text: textOf(node).slice(0, 120),
    })
  }

  const headings = []
  for (const node of scope.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    headings.push({ level: Number(node.tagName.slice(1)), text: textOf(node).slice(0, 120), element: describe(node), visible: isVisible(node) })
  }

  const controls = []
  for (const node of scope.querySelectorAll('button, a[href], input, select, textarea')) {
    const tag = node.tagName
    if (tag === 'INPUT' && node.type === 'hidden') continue
    controls.push({
      element: describe(node),
      tag,
      type: tag === 'INPUT' ? node.type : tag === 'BUTTON' ? node.getAttribute('type') : '',
      name: accessibleName(node).slice(0, 120),
      disabled: node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true',
      visible: isVisible(node),
      tabIndex: node.tabIndex,
    })
  }

  const images = []
  for (const node of scope.querySelectorAll('img')) {
    images.push({
      element: describe(node),
      src: String(node.getAttribute('src') || '').slice(0, 120),
      hasAltAttribute: node.hasAttribute('alt'),
      alt: node.getAttribute('alt'),
      ariaHidden: node.getAttribute('aria-hidden') === 'true',
      visible: isVisible(node),
    })
  }

  const tablists = []
  const tablistNodes = Array.from(scope.querySelectorAll('[role="tablist"]'))
  if (scope.matches && scope.matches('[role="tablist"]')) tablistNodes.unshift(scope)
  for (const tablist of tablistNodes) {
    const tabs = []
    for (const tab of tablist.querySelectorAll('[role="tab"]')) {
      const controlsId = normalize(tab.getAttribute('aria-controls'))
      tabs.push({
        element: describe(tab),
        name: accessibleName(tab).slice(0, 120),
        selected: tab.getAttribute('aria-selected'),
        tabIndex: tab.tabIndex,
        controlsId,
        controlsExists: controlsId ? document.getElementById(controlsId) !== null : false,
        visible: isVisible(tab),
      })
    }
    tablists.push({ element: describe(tablist), name: accessibleName(tablist).slice(0, 120), tabs })
  }
  const tabpanels = []
  const tabpanelNodes = Array.from(scope.querySelectorAll('[role="tabpanel"]'))
  if (scope.matches && scope.matches('[role="tabpanel"]')) tabpanelNodes.unshift(scope)
  for (const panel of tabpanelNodes) {
    tabpanels.push({
      element: describe(panel),
      labelledBy: normalize(panel.getAttribute('aria-labelledby')),
      labelledByText: labelledByText(panel),
      tabIndex: panel.tabIndex,
      visible: isVisible(panel),
    })
  }

  const menus = []
  const menuNodes = Array.from(scope.querySelectorAll('[role="menu"]'))
  if (scope.matches && scope.matches('[role="menu"]')) menuNodes.unshift(scope)
  for (const menu of menuNodes) {
    const items = []
    for (const item of menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]')) {
      items.push({
        element: describe(item),
        name: accessibleName(item).slice(0, 120),
        role: item.getAttribute('role'),
        tabIndex: item.tabIndex,
        disabled: item.hasAttribute('disabled') || item.getAttribute('aria-disabled') === 'true',
        checked: item.getAttribute('aria-checked'),
        hasPopup: item.getAttribute('aria-haspopup'),
        visible: isVisible(item),
      })
    }
    menus.push({
      element: describe(menu),
      name: accessibleName(menu).slice(0, 120),
      orientation: menu.getAttribute('aria-orientation'),
      ariaHidden: menu.getAttribute('aria-hidden'),
      inert: isInert(menu),
      visible: isVisible(menu),
      items,
    })
  }

  const duplicateIds = []
  const seenIds = new Map()
  for (const node of document.querySelectorAll('[id]')) {
    const id = node.id
    if (!id) continue
    const count = (seenIds.get(id) || 0) + 1
    seenIds.set(id, count)
    if (count === 2) duplicateIds.push(id)
  }

  const positiveTabindex = []
  for (const node of scope.querySelectorAll('[tabindex]')) {
    const value = Number(node.getAttribute('tabindex'))
    if (Number.isFinite(value) && value > 0) positiveTabindex.push({ element: describe(node), tabindex: value })
  }

  const ariaHiddenFocusable = []
  for (const node of scope.querySelectorAll('[aria-hidden="true"]')) {
    const focusables = focusablesIn(node)
    if (focusables.length > 0) ariaHiddenFocusable.push({ element: describe(node), focusable: focusables.length })
  }

  const focusables = focusablesIn(scope)
  return {
    found: true,
    scope: scopeSelector,
    lang: document.documentElement.getAttribute('lang'),
    title: document.title,
    dialogs,
    liveRegions,
    headings,
    controls,
    images,
    tablists,
    tabpanels,
    menus,
    duplicateIds,
    positiveTabindex,
    ariaHiddenFocusable,
    focusableCount: focusables.length,
    focusableSample: focusables.slice(0, 12).map((element) => describe(element)),
    bodyText: normalize(scope.textContent).slice(0, 200),
  }
}

/**
 * In-page focus snapshot. Stringified by buildFocusInfoExpression().
 */
function describeFocus() {
  const element = document.activeElement
  if (!element || element === document.body || element === document.documentElement) {
    return { found: false, activeElement: element ? element.tagName.toLowerCase() : null }
  }
  const describe = (node) => {
    if (!node || !node.tagName) return '?'
    let out = node.tagName.toLowerCase()
    if (node.id) out += '#' + node.id
    const className = typeof node.className === 'string' ? node.className.trim() : ''
    if (className) out += '.' + className.split(/\s+/).filter(Boolean).slice(0, 2).join('.')
    return out
  }
  const backgroundOf = (start) => {
    const layers = []
    let node = start
    while (node && node.nodeType === 1) {
      const style = getComputedStyle(node)
      if (style.backgroundImage && style.backgroundImage !== 'none') return { unsupported: 'background-image' }
      const color = parseCssColor(style.backgroundColor)
      if (color && color.a > 0) {
        if (color.a >= 0.999) {
          let base = color
          for (let index = layers.length - 1; index >= 0; index -= 1) base = compositeOver(layers[index], base)
          return { color: base }
        }
        layers.push(color)
      }
      node = node.parentElement
    }
    return { unsupported: 'transparent-background' }
  }
  const style = getComputedStyle(element)
  const background = backgroundOf(element)
  return {
    found: true,
    element: describe(element),
    tag: element.tagName.toLowerCase(),
    id: element.id || null,
    role: element.getAttribute('role'),
    ariaLabel: element.getAttribute('aria-label'),
    text: String(element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
    outlineStyle: style.outlineStyle,
    outlineWidth: Number.parseFloat(style.outlineWidth),
    outlineColor: style.outlineColor,
    boxShadow: style.boxShadow,
    backgroundColor: style.backgroundColor,
    effectiveBackground: background.color
      ? 'rgb(' + Math.round(background.color.r) + ', ' + Math.round(background.color.g) + ', ' + Math.round(background.color.b) + ')'
      : null,
    backgroundUnsupported: background.unsupported || null,
    visible: element.getClientRects().length > 0,
  }
}

function inject(fn, args) {
  const scanConstants = ['const MAX_VIOLATIONS = ' + MAX_VIOLATIONS + ';', 'const MAX_SKIPPED = ' + MAX_SKIPPED + ';'].join(' ')
  return '(function () { ' + PURE_CONSTANTS + ' ' + scanConstants + '\n' + PURE_HELPERS + ';\n return (' + fn.toString() + ')(' + args.join(', ') + '); })()'
}

/** @param {string} scopeSelector @returns {string} Runtime.evaluate expression */
export function buildContrastScanExpression(scopeSelector) {
  return inject(scanContrast, [JSON.stringify(scopeSelector)])
}

/** @param {string} scopeSelector @returns {string} Runtime.evaluate expression */
export function buildAriaAuditExpression(scopeSelector) {
  return '(function () { return (' + auditAria.toString() + ')(' + JSON.stringify(scopeSelector) + '); })()'
}

/** @returns {string} Runtime.evaluate expression */
export function buildFocusInfoExpression() {
  return inject(describeFocus, [])
}

/** @param {string} scopeSelector @returns {string} expression returning boolean (scope exists) */
export function buildScopeExistsExpression(scopeSelector) {
  return 'document.querySelector(' + JSON.stringify(scopeSelector) + ') !== null'
}

/** @param {string} expression @returns {string} */
export function buildBooleanExpression(expression) {
  return 'Boolean(' + expression + ')'
}