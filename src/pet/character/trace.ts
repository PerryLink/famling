/**
 * Reproducible behaviour trace format + golden-fixture tool (FCI).
 *
 * `BehaviorRuntime.trace()` (behavior.ts) already replays an event list
 * deterministically for one seed, but it only carries the default context
 * (`{ nowMs }`). This module adds the versioned **JSON trace format** used by the
 * desktop golden tests and intended for later reuse by the DSH plugin:
 *
 *   events (string[]) + seed + stepMs + per-step context
 *      -> steps[{ index, event, nowMs, state, tag, priority, ruleIndex, ... }]
 *
 * Two replay modes are first-class because the 2026-11-21 architecture review
 * found the production `SceneRuntime` only forwards `nowMs`/`state`/`source`:
 *
 *   - `behavior-runtime`: a full `DecisionContext` may be supplied per step
 *     (numeric stats, `briefAvailable`), i.e. what the capability contract
 *     promises when a host feeds the runtime;
 *   - `production-scene-context`: exactly what `SceneRuntime.deliver()` passes.
 *     Stat/brief patches are rejected so a golden case cannot pretend the
 *     shipping pet has a context feed it does not have.
 *
 * The fixture is data-only JSON (`famling.behavior-trace/0.1`), embeds the
 * behaviour profile it was generated from plus a content digest, and
 * `validateBehaviorTraceFixture()` replays every case so the format is
 * verifiable outside this repository (plugin port) instead of a screenshot of
 * one implementation.
 */
import { BehaviorRuntime, type DecisionContext } from './behavior.ts'
import type { BehaviorDecision, BehaviorProfile } from './types.ts'
import { auditBehaviorCapabilities } from './capabilities.ts'

/** Schema id of the exported trace/golden JSON. */
export const BEHAVIOR_TRACE_SCHEMA = 'famling.behavior-trace/0.1' as const
/** Generator path recorded in the fixture header (drift/debug trail). */
export const BEHAVIOR_TRACE_GENERATOR = 'src/pet/character/trace.ts' as const

/** How the per-step decision context is fed to `BehaviorRuntime.decide`. */
export type BehaviorTraceMode = 'behavior-runtime' | 'production-scene-context'

/** Extra per-step context a full-context trace may supply (besides clock/state). */
export interface BehaviorTraceContextPatch {
  /** Added to the computed step clock (`startMs + index * stepMs`). */
  nowMsOffset?: number
  mood?: number
  bond?: number
  hunger?: number
  energy?: number
  fun?: number
  briefAvailable?: boolean
  source?: string
}

/** One recorded decision in the trace. */
export interface BehaviorTraceStep {
  readonly index: number
  readonly event: string
  readonly nowMs: number
  /** Behaviour state after the decision (same as `BehaviorDecision.state`). */
  readonly state: string
  /** Animation tag for `state` at decision time. */
  readonly tag: string
  readonly priority: number
  readonly ruleIndex: number
  readonly ignored?: boolean
  readonly reason?: string
}

/** Specification handed to `traceBehaviorDecisions` (golden cases build these). */
export interface BehaviorTraceSpec {
  readonly mode: BehaviorTraceMode
  readonly profile: BehaviorProfile
  readonly events: readonly string[]
  readonly seed?: number
  readonly startMs?: number
  readonly stepMs?: number
  readonly initialState?: string
  /** Optional per-step context; length must be <= events.length. */
  readonly contexts?: readonly (BehaviorTraceContextPatch | null)[]
}

/** Deterministic ambient idle sequence (weighted ambient, same seeded PRNG). */
export interface BehaviorTraceAmbient {
  readonly seed: number
  readonly samples: number
  readonly states: readonly string[]
}

/** Capability audit snapshot embedded in golden cases that prove the gate. */
export interface BehaviorTraceCapabilitySnapshot {
  readonly declared: readonly string[]
  readonly used: readonly { readonly capability: string; readonly path: string }[]
  readonly gaps: readonly {
    readonly capability: string
    readonly status: string
    readonly declared: boolean
    readonly warned: boolean
    readonly paths: readonly string[]
  }[]
  readonly warnings: readonly { readonly code: string; readonly path: string }[]
}

/** One named, self-contained golden case. */
export interface BehaviorTraceCase {
  readonly id: string
  readonly description: string
  readonly mode: BehaviorTraceMode
  readonly seed: number
  readonly startMs: number
  readonly stepMs: number
  readonly initialState: string
  readonly events: readonly string[]
  readonly contexts?: readonly (BehaviorTraceContextPatch | null)[]
  /** Embedded profile: the fixture is replayable without the desktop repo. */
  readonly profile: BehaviorProfile
  /** 32-bit FNV-1a content fingerprint of `profile` (drift detector, not a security hash). */
  readonly profileDigest: string
  readonly steps: readonly BehaviorTraceStep[]
  readonly ambient?: BehaviorTraceAmbient
  /** Present for capability-gate cases: the diagnostics the gate must emit. */
  readonly capabilityGaps?: BehaviorTraceCapabilitySnapshot
}

/** Exported golden-trace JSON envelope (desktop tests + plugin reuse). */
export interface BehaviorTraceFixture {
  readonly schema: typeof BEHAVIOR_TRACE_SCHEMA
  readonly generator: string
  readonly note: string
  readonly cases: readonly BehaviorTraceCase[]
}

/** Case input for the builder (adds the ambient/gate extras). */
export interface BehaviorTraceCaseSpec extends BehaviorTraceSpec {
  readonly id: string
  readonly description: string
  /** Sample a deterministic ambient idle sequence with this seed. */
  readonly ambient?: { readonly seed?: number; readonly samples: number }
  /** Embed the capability-gate audit (declared-but-not-executed proof). */
  readonly capabilityGaps?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** JSON with recursively sorted keys (stable digest/export canonical form). */
export function canonicalJson(value: unknown): string {
  const seen = new Set<unknown>()
  const walk = (node: unknown): unknown => {
    if (node === null || typeof node !== 'object') return node
    if (seen.has(node)) throw new Error('canonicalJson cannot serialize a cyclic structure')
    seen.add(node)
    try {
      if (Array.isArray(node)) return node.map(walk)
      const record = node as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(record).sort()) out[key] = walk(record[key])
      return out
    } finally {
      seen.delete(node)
    }
  }
  return JSON.stringify(walk(value))
}

function fnv1a32(text: string): number {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  }
  return hash >>> 0
}

/** Stable 8-hex content fingerprint of a behaviour profile (drift detector). */
export function profileDigest(profile: BehaviorProfile): string {
  return fnv1a32(canonicalJson(profile)).toString(16).padStart(8, '0')
}

function recordStep(index: number, event: string, nowMs: number, decision: BehaviorDecision): BehaviorTraceStep {
  const step: BehaviorTraceStep = {
    index,
    event,
    nowMs,
    state: decision.state,
    tag: decision.tag,
    priority: decision.priority,
    ruleIndex: decision.ruleIndex,
  }
  return {
    ...step,
    ...(decision.ignored === true ? { ignored: true } : {}),
    ...(decision.reason !== undefined ? { reason: decision.reason } : {}),
  }
}

const PRODUCTION_CONTEXT_KEYS = new Set(['nowMsOffset', 'source'])

/**
 * Replay `spec.events` through a fresh `BehaviorRuntime` (deterministic seed) and
 * record one step per event. Stat/brief context patches are only accepted in
 * `behavior-runtime` mode: `production-scene-context` mirrors exactly what
 * `SceneRuntime.deliver()` supplies (`nowMs`/`state`/`source`).
 */
export function traceBehaviorDecisions(spec: BehaviorTraceSpec): BehaviorTraceStep[] {
  const seed = spec.seed ?? 1
  const startMs = spec.startMs ?? 0
  const stepMs = spec.stepMs ?? 1000
  const runtime = new BehaviorRuntime(spec.profile, {
    seed,
    ...(spec.initialState !== undefined ? { initialState: spec.initialState } : {}),
  })
  const steps: BehaviorTraceStep[] = []
  for (const [index, event] of spec.events.entries()) {
    const patch = spec.contexts?.[index] ?? null
    if (patch !== null) {
      const keys = Object.keys(patch)
      if (spec.mode === 'production-scene-context') {
        const extra = keys.filter((key) => !PRODUCTION_CONTEXT_KEYS.has(key))
        if (extra.length > 0) {
          throw new Error(
            'trace case uses ' + spec.mode + ' but step ' + index + ' supplies [' + extra.join(', ') +
            '], which SceneRuntime.deliver() never passes; use mode "behavior-runtime" for a full-context probe',
          )
        }
      }
    }
    const nowMs = startMs + index * stepMs + (patch?.nowMsOffset ?? 0)
    const ctx: DecisionContext = { nowMs, state: runtime.state }
    if (patch) {
      const full = spec.mode === 'behavior-runtime'
      if (full && patch.mood !== undefined) ctx.mood = patch.mood
      if (full && patch.bond !== undefined) ctx.bond = patch.bond
      if (full && patch.hunger !== undefined) ctx.hunger = patch.hunger
      if (full && patch.energy !== undefined) ctx.energy = patch.energy
      if (full && patch.fun !== undefined) ctx.fun = patch.fun
      if (full && patch.briefAvailable !== undefined) ctx.briefAvailable = patch.briefAvailable
      if (patch.source !== undefined) ctx.source = patch.source
    }
    steps.push(recordStep(index, event, nowMs, runtime.decide(event, ctx)))
  }
  return steps
}

/** Deterministic ambient sequence from one seeded runtime (one draw per sample). */
export function traceAmbientStates(profile: BehaviorProfile, seed = 1, samples = 8): BehaviorTraceAmbient {
  const runtime = new BehaviorRuntime(profile, { seed })
  const states: string[] = []
  for (let index = 0; index < samples; index += 1) states.push(runtime.ambientState())
  return { seed, samples, states }
}

/** Build one self-contained case from a spec (trace + digest + optional extras). */
export function buildBehaviorTraceCase(spec: BehaviorTraceCaseSpec): BehaviorTraceCase {
  const cases: BehaviorTraceCase = {
    id: spec.id,
    description: spec.description,
    mode: spec.mode,
    seed: spec.seed ?? 1,
    startMs: spec.startMs ?? 0,
    stepMs: spec.stepMs ?? 1000,
    initialState: spec.initialState ?? 'idle',
    events: [...spec.events],
    ...(spec.contexts !== undefined ? { contexts: spec.contexts.map((patch) => (patch === null ? null : { ...patch })) } : {}),
    profile: spec.profile,
    profileDigest: profileDigest(spec.profile),
    steps: traceBehaviorDecisions(spec),
    ...(spec.ambient !== undefined
      ? { ambient: traceAmbientStates(spec.profile, spec.ambient.seed ?? spec.seed ?? 1, spec.ambient.samples) }
      : {}),
    ...(spec.capabilityGaps === true
      ? {
          capabilityGaps: (() => {
            const audit = auditBehaviorCapabilities(spec.profile)
            return {
              declared: [...audit.declared],
              used: audit.used.map((use) => ({ capability: use.capability, path: use.path })),
              gaps: audit.gaps.map((gap) => ({
                capability: gap.capability,
                status: gap.status,
                declared: gap.declared,
                warned: gap.warned,
                paths: [...gap.paths],
              })),
              warnings: audit.warnings.map((warning) => ({ code: warning.code, path: warning.path })),
            }
          })(),
        }
      : {}),
  }
  return cases
}

/** Build the exported fixture envelope (deterministic; the golden test diffs it). */
export function buildBehaviorTraceFixture(cases: readonly BehaviorTraceCaseSpec[], note: string): BehaviorTraceFixture {
  return {
    schema: BEHAVIOR_TRACE_SCHEMA,
    generator: BEHAVIOR_TRACE_GENERATOR,
    note,
    cases: cases.map(buildBehaviorTraceCase),
  }
}

/** Stable pretty JSON used for the committed fixture file (trailing newline). */
export function behaviorTraceJson(fixture: BehaviorTraceFixture): string {
  return JSON.stringify(fixture, null, 2) + '\n'
}

const MODES: readonly BehaviorTraceMode[] = ['behavior-runtime', 'production-scene-context']

/**
 * Verify one exported fixture: schema id, case shapes, profile digests and —
 * the important part — re-derive every step by replaying the embedded profile,
 * so a plugin port can prove it implements the same deterministic semantics.
 * Returns a list of human-readable problems (empty = ok).
 */
export function validateBehaviorTraceFixture(raw: unknown): string[] {
  const problems: string[] = []
  if (!isRecord(raw)) return ['fixture must be an object']
  if (raw.schema !== BEHAVIOR_TRACE_SCHEMA) problems.push('fixture.schema must be ' + BEHAVIOR_TRACE_SCHEMA)
  if (!Array.isArray(raw.cases) || raw.cases.length === 0) {
    problems.push('fixture.cases must be a non-empty array')
    return problems
  }
  const ids = new Set<string>()
  for (const [index, rawCase] of raw.cases.entries()) {
    const where = 'fixture.cases[' + index + ']'
    if (!isRecord(rawCase)) {
      problems.push(where + ' must be an object')
      continue
    }
    const id = rawCase.id
    if (typeof id !== 'string' || id.length === 0) problems.push(where + '.id must be a non-empty string')
    else if (ids.has(id)) problems.push(where + '.id ' + JSON.stringify(id) + ' is duplicated')
    else ids.add(id)
    if (!MODES.includes(rawCase.mode as BehaviorTraceMode)) problems.push(where + '.mode must be one of [' + MODES.join(', ') + ']')
    if (!isRecord(rawCase.profile)) {
      problems.push(where + '.profile must be an embedded object')
      continue
    }
    if (!Array.isArray(rawCase.events) || !Array.isArray(rawCase.steps)) {
      problems.push(where + '.events and .steps must be arrays')
      continue
    }
    const profile = rawCase.profile as unknown as BehaviorProfile
    const digest = profileDigest(profile)
    if (rawCase.profileDigest !== digest) problems.push(where + '.profileDigest ' + String(rawCase.profileDigest) + ' != ' + digest)
    if (rawCase.events.length !== rawCase.steps.length) {
      problems.push(where + ' has ' + rawCase.events.length + ' events but ' + rawCase.steps.length + ' steps')
      continue
    }
    let replayed: BehaviorTraceStep[]
    try {
      replayed = traceBehaviorDecisions({
        mode: rawCase.mode as BehaviorTraceMode,
        profile,
        events: rawCase.events as string[],
        seed: typeof rawCase.seed === 'number' ? rawCase.seed : 1,
        startMs: typeof rawCase.startMs === 'number' ? rawCase.startMs : 0,
        stepMs: typeof rawCase.stepMs === 'number' ? rawCase.stepMs : 1000,
        initialState: typeof rawCase.initialState === 'string' ? rawCase.initialState : 'idle',
        ...(Array.isArray(rawCase.contexts) ? { contexts: rawCase.contexts as (BehaviorTraceContextPatch | null)[] } : {}),
      })
    } catch (error) {
      problems.push(where + ' cannot be replayed: ' + (error instanceof Error ? error.message : String(error)))
      continue
    }
    if (canonicalJson(replayed) !== canonicalJson(rawCase.steps)) {
      problems.push(where + '.steps do not match a fresh replay (deterministic trace drifted or was hand-edited)')
    }
  }
  return problems
}
