/**
 * Per-character interaction regions (tap zones) for the hero canvas.
 *
 * Art is authored on a fixed logical canvas (96x96 today, possibly 128/256
 * later), but the same character is displayed at 1x/2x/4x (or downscaled)
 * inside the transparent Tauri window. Regions therefore live in ART pixels:
 * the runtime converts a canvas-local CSS point to art pixels with the actor's
 * layout scale before hit-testing, so the relative position stays identical at
 * every zoom level. A pack without a regions file keeps the old whole-actor tap
 * behaviour (backwards compatible for third-party/DLC packs).
 *
 * Reactions are data, not code: "tap the head while idle => pat", "tap the
 * tail => chase_tail", etc. State gating is deliberate — a sleeping or busy
 * character does not react just because the pointer landed on its head.
 */
export class HeroRegionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HeroRegionError'
  }
}

export type HeroRegionRect = readonly [x: number, y: number, width: number, height: number]

export interface HeroRegion {
  readonly id: string
  readonly label?: string
  /** Art-pixel box, origin top-left, in the pack's logical canvas. */
  readonly rect: HeroRegionRect
  /** Higher priority wins where regions overlap (head over body, tail over body). */
  readonly priority?: number
}

export interface HeroRegionReaction {
  /** Region id this rule applies to. */
  readonly region: string
  /** Optional state whitelist; omitted means any non-blocked state. */
  readonly states?: readonly string[]
  /** Pointer gesture; only "tap" is used by the current pointer path. */
  readonly gesture?: string
  /** FCI hero event to emit (pat, stand_wag, chase_tail, …). */
  readonly event: string
  /** Short bubble lines; one is chosen randomly per tap (never markdown/HTML). */
  readonly says?: readonly string[]
}

/** One character-specific menu action (dog fetch, cat stretch, human paper…). */
export interface HeroRegionAction {
  readonly id: string
  readonly label: string
  readonly event: string
  readonly followUpEvent?: string
  readonly followUpMs?: number
  readonly says?: readonly string[]
}

export interface HeroRegionConfig {
  readonly version: 1
  /** Logical art canvas the rects are authored in; must match the pack canvas. */
  readonly canvas: readonly [number, number]
  readonly regions: readonly HeroRegion[]
  readonly gestures: readonly HeroRegionReaction[]
  /** Species-specific menu actions (data-driven, rendered by the desktop shell). */
  readonly actions?: readonly HeroRegionAction[]
}

export interface HeroRegionHit {
  readonly region: HeroRegion
  /** Point in art pixels (for QA/debug and future region-specific effects). */
  readonly localX: number
  readonly localY: number
}

const ID_RE = /^[a-z][a-z0-9_.-]{0,63}$/
const EVENT_RE = /^[a-z][a-z0-9_.-]{0,63}$/
const MAX_REGIONS = 32
const MAX_GESTURES = 64
const MAX_STATES = 8
const MAX_SAYS = 6
const MAX_ACTIONS = 8
const MAX_SAY = 120

function fail(message: string): never {
  throw new HeroRegionError(`hero regions: ${message}`)
}

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${what} must be an object`)
  return value as Record<string, unknown>
}

function asString(value: unknown, what: string, max: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(`${what} must be a non-empty string <= ${max} chars`)
  return value
}

function asFinite(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${what} must be a finite number`)
  return value
}

function parseSays(value: unknown, what: string): readonly string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SAYS) {
    fail(`${what} must be a non-empty array (<= ${MAX_SAYS})`)
  }
  return value.map((line, index) => asString(line, `${what}[${index}]`, MAX_SAY))
}

function parseRect(value: unknown, what: string): HeroRegionRect {
  if (!Array.isArray(value) || value.length !== 4) fail(`${what} must be [x,y,width,height]`)
  const [x, y, width, height] = value.map((part, index) => asFinite(part, `${what}[${index}]`)) as [number, number, number, number]
  if (width <= 0 || height <= 0) fail(`${what} width/height must be > 0`)
  return [x, y, width, height]
}

/** Validate a regions.json document (strict, bounded, no code). */
export function parseHeroRegionConfig(raw: unknown): HeroRegionConfig {
  const doc = asRecord(raw, 'document')
  if (doc.version !== 1) fail('document.version must be 1')
  const canvasRaw = doc.canvas
  if (!Array.isArray(canvasRaw) || canvasRaw.length !== 2) fail('document.canvas must be [width,height]')
  const canvas = canvasRaw.map((part, index) => asFinite(part, `canvas[${index}]`)) as [number, number]
  if (canvas[0] < 16 || canvas[1] < 16 || canvas[0] > 1024 || canvas[1] > 1024) fail('canvas must be 16..1024 art px')

  const regionsRaw = doc.regions
  if (!Array.isArray(regionsRaw) || regionsRaw.length === 0 || regionsRaw.length > MAX_REGIONS) {
    fail(`regions must be a non-empty array (<= ${MAX_REGIONS})`)
  }
  const ids = new Set<string>()
  const regions: HeroRegion[] = regionsRaw.map((entry, index) => {
    const region = asRecord(entry, `regions[${index}]`)
    const id = asString(region.id, `regions[${index}].id`, 64)
    if (!ID_RE.test(id)) fail(`regions[${index}].id "${id}" is not a safe id`)
    if (ids.has(id)) fail(`duplicate region id "${id}"`)
    ids.add(id)
    const rect = parseRect(region.rect, `regions[${index}].rect`)
    if (rect[0] < 0 || rect[1] < 0 || rect[0] + rect[2] > canvas[0] || rect[1] + rect[3] > canvas[1]) {
      fail(`regions[${index}].rect must stay inside the ${canvas[0]}x${canvas[1]} canvas`)
    }
    const label = region.label === undefined ? undefined : asString(region.label, `regions[${index}].label`, 32)
    const priority = region.priority === undefined ? undefined : asFinite(region.priority, `regions[${index}].priority`)
    return { id, ...(label !== undefined ? { label } : {}), rect, ...(priority !== undefined ? { priority } : {}) }
  })

  const gesturesRaw = doc.gestures
  if (!Array.isArray(gesturesRaw) || gesturesRaw.length > MAX_GESTURES) fail(`gestures must be an array (<= ${MAX_GESTURES})`)
  const gestures: HeroRegionReaction[] = gesturesRaw.map((entry, index) => {
    const rule = asRecord(entry, `gestures[${index}]`)
    const region = asString(rule.region, `gestures[${index}].region`, 64)
    if (!ids.has(region)) fail(`gestures[${index}].region "${region}" is not declared`)
    const event = asString(rule.event, `gestures[${index}].event`, 64)
    if (!EVENT_RE.test(event)) fail(`gestures[${index}].event "${event}" is not a safe event name`)
    const gesture = rule.gesture === undefined ? undefined : asString(rule.gesture, `gestures[${index}].gesture`, 24)
    let states: readonly string[] | undefined
    if (rule.states !== undefined) {
      if (!Array.isArray(rule.states) || rule.states.length === 0 || rule.states.length > MAX_STATES) {
        fail(`gestures[${index}].states must be a non-empty array (<= ${MAX_STATES})`)
      }
      states = rule.states.map((state, stateIndex) => {
        const value = asString(state, `gestures[${index}].states[${stateIndex}]`, 64)
        if (!ID_RE.test(value)) fail(`gestures[${index}].states[${stateIndex}] "${value}" is not a safe state name`)
        return value
      })
    }
    const legacySay = typeof rule.say === 'string' ? [rule.say] : undefined
    const says = parseSays(rule.says ?? legacySay, `gestures[${index}].says`)
    return {
      region,
      ...(states !== undefined ? { states } : {}),
      ...(gesture !== undefined ? { gesture } : {}),
      event,
      ...(says !== undefined ? { says } : {}),
    }
  })

  let actions: readonly HeroRegionAction[] | undefined
  if (doc.actions !== undefined) {
    if (!Array.isArray(doc.actions) || doc.actions.length === 0 || doc.actions.length > MAX_ACTIONS) {
      fail(`actions must be a non-empty array (<= ${MAX_ACTIONS})`)
    }
    const actionIds = new Set<string>()
    actions = doc.actions.map((entry, index) => {
      const action = asRecord(entry, `actions[${index}]`)
      const id = asString(action.id, `actions[${index}].id`, 64)
      if (!ID_RE.test(id)) fail(`actions[${index}].id "${id}" is not a safe id`)
      if (actionIds.has(id)) fail(`duplicate action id "${id}"`)
      actionIds.add(id)
      const label = asString(action.label, `actions[${index}].label`, 32)
      const event = asString(action.event, `actions[${index}].event`, 64)
      if (!EVENT_RE.test(event)) fail(`actions[${index}].event "${event}" is not a safe event name`)
      const followUpEvent = action.followUpEvent === undefined ? undefined : asString(action.followUpEvent, `actions[${index}].followUpEvent`, 64)
      if (followUpEvent !== undefined && !EVENT_RE.test(followUpEvent)) fail(`actions[${index}].followUpEvent is not a safe event name`)
      const followUpMs = action.followUpMs === undefined ? undefined : asFinite(action.followUpMs, `actions[${index}].followUpMs`)
      if (followUpMs !== undefined && (followUpMs < 0 || followUpMs > 5000)) fail(`actions[${index}].followUpMs must be 0..5000`)
      if (followUpMs !== undefined && followUpEvent === undefined) fail(`actions[${index}].followUpMs requires followUpEvent`)
      const says = parseSays(action.says, `actions[${index}].says`)
      return {
        id,
        label,
        event,
        ...(followUpEvent !== undefined ? { followUpEvent } : {}),
        ...(followUpMs !== undefined ? { followUpMs } : {}),
        ...(says !== undefined ? { says } : {}),
      }
    })
  }

  return { version: 1, canvas: [canvas[0], canvas[1]], regions, gestures, ...(actions !== undefined ? { actions } : {}) }
}

/** Regions in priority order (higher first, declaration order breaks ties). */
export function sortedHeroRegions(config: HeroRegionConfig): readonly HeroRegion[] {
  return config.regions
    .map((region, index) => ({ region, index }))
    .sort((a, b) => (b.region.priority ?? 0) - (a.region.priority ?? 0) || a.index - b.index)
    .map((entry) => entry.region)
}

/** Region under an art-pixel point, or null for transparent pixels/empty zones. */
export function heroRegionAt(config: HeroRegionConfig, localX: number, localY: number): HeroRegion | null {
  if (!Number.isFinite(localX) || !Number.isFinite(localY)) return null
  for (const region of sortedHeroRegions(config)) {
    const [x, y, width, height] = region.rect
    if (localX >= x && localX < x + width && localY >= y && localY < y + height) return region
  }
  return null
}

/**
 * Convert a canvas-local CSS point into region art pixels for one actor.
 * `scale` is the layout's integer display scale (1/2/4/…); dividing by it
 * keeps regions aligned at every zoom level. Rejects points outside the actor
 * draw box (cheap broad-phase) and outside the declared art canvas.
 */
export function heroRegionHitAt(
  actor: { readonly x: number; readonly y: number; readonly scale: number; readonly width: number; readonly height: number },
  config: HeroRegionConfig,
  canvasX: number,
  canvasY: number,
): HeroRegionHit | null {
  if (!Number.isFinite(canvasX) || !Number.isFinite(canvasY)) return null
  const scale = actor.scale
  if (!Number.isFinite(scale) || scale <= 0) return null
  if (canvasX < actor.x || canvasX >= actor.x + actor.width || canvasY < actor.y || canvasY >= actor.y + actor.height) return null
  const localX = (canvasX - actor.x) / scale
  const localY = (canvasY - actor.y) / scale
  if (localX < 0 || localY < 0 || localX >= config.canvas[0] || localY >= config.canvas[1]) return null
  const region = heroRegionAt(config, localX, localY)
  return region ? { region, localX, localY } : null
}

/** First matching reaction for a region/state/gesture, or null. */
export function resolveHeroRegionReaction(
  config: HeroRegionConfig,
  regionId: string,
  state: string,
  gesture = 'tap',
): HeroRegionReaction | null {
  if (typeof regionId !== 'string' || regionId.length === 0) return null
  for (const rule of config.gestures) {
    if (rule.region !== regionId) continue
    if ((rule.gesture ?? 'tap') !== gesture) continue
    if (rule.states !== undefined && !rule.states.includes(state)) continue
    return rule
  }
  return null
}
