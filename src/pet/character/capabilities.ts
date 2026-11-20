/**
 * Behaviour contract capability gate (FCI / famling.behavior/0.1).
 *
 * Why this exists (2026-11-21 architecture review): `behavior` schema accepted
 * advanced fields (guard/say/sfx/effects/requiresBrief) but the shipping
 * SceneRuntime only passed `nowMs`/`state`/`source` to `BehaviorRuntime.decide`,
 * so e.g. a rule with `guard` silently never matched and `say`/`sfx`/`effects`
 * were ignored entirely. Authors had no diagnostic at all. This module is the
 * single source of truth for
 *
 *   1. the declarable capability vocabulary (`types.ts` owns the id union),
 *   2. which capabilities the *shipping* runtime composition actually executes,
 *   3. which declared fields map to which capability,
 *   4. the audit + warning/strict policy used by `validate.ts`, the validator
 *      CLI and the third-party pack pipeline.
 *
 * Policy (see docs/plan/ADR-BEHAVIOR-CONTRACT-2026-11-21.md):
 * - default: backward compatible -> every non-executed declaration/use becomes
 *   a `BEHAVIOR_CAPABILITY_*` warning (never silent);
 * - `strictCapabilities`: the same mismatches throw `CharacterInterfaceError`
 *   so new packs can fail closed (validator CLI `--strict-capabilities`);
 * - unknown capability ids always throw, in every mode (a typo must not
 *   silently disable the gate).
 *
 * Data-only: nothing here executes pack content.
 */
import {
  BEHAVIOR_RUNTIME_CAPABILITIES,
  CharacterInterfaceError,
  type BehaviorProfile,
  type BehaviorRuntimeCapability,
  type CharacterValidationWarning,
} from './types.ts'

/** Capability execution status of the shipping hero runtime composition. */
export type BehaviorCapabilityStatus = 'wired' | 'context-missing' | 'not-implemented'

/** One row of the capability table. */
export interface BehaviorCapabilityInfo {
  readonly id: BehaviorRuntimeCapability
  readonly status: BehaviorCapabilityStatus
  /** Behaviour-profile-relative field paths that use this capability. */
  readonly fields: readonly string[]
  /** What actually happens in the shipping runtime (used verbatim in diagnostics). */
  readonly note: string
  /** True when the FCI 0.3 preview runtime (`runtime03.ts`, lab/preview only) consumes it. */
  readonly previewRuntime: boolean
}

const CAPABILITY_ROWS: readonly BehaviorCapabilityInfo[] = [
  {
    id: 'rules',
    status: 'wired',
    fields: ['behavior.rules'],
    note: 'rule table (on/to/priority/cooldownMs/probability/when.state) is executed by BehaviorRuntime + SceneRuntime',
    previewRuntime: true,
  },
  {
    id: 'ambient',
    status: 'wired',
    fields: ['behavior.ambient'],
    note: 'weighted ambient idle scheduling is executed by BehaviorRuntime + SceneRuntime',
    previewRuntime: true,
  },
  {
    id: 'slots',
    status: 'wired',
    fields: ['behavior.slots'],
    note: 'slot fallback (event -> declared state) is executed by BehaviorRuntime + SceneRuntime',
    previewRuntime: true,
  },
  {
    id: 'guard',
    status: 'context-missing',
    fields: ['behavior.rules[].guard'],
    note:
      'BehaviorRuntime evaluates guard only when the host supplies the numeric field (mood/bond/hunger/energy/fun); ' +
      'SceneRuntime passes only nowMs/state/source, so evaluateGuard() sees undefined and every guarded rule is filtered out',
    previewRuntime: false,
  },
  {
    id: 'conditions',
    status: 'context-missing',
    fields: ['behavior.rules[].when.source', 'behavior.rules[].when.secrecyMax', 'behavior.rules[].when.mood', 'behavior.rules[].when.focus', 'behavior.rules[].when.energy'],
    note:
      'BehaviorRuntime only evaluates when.state; source/secrecyMax (and the FCI 0.3 mood/focus/energy ranges) are accepted data ' +
      'that the shipping SceneRuntime never supplies, so extra conditions never take effect. The preview runtime03 evaluates ' +
      'secrecyMax/mood/focus/energy, but it is not wired into pet.html',
    previewRuntime: true,
  },
  {
    id: 'brief',
    status: 'context-missing',
    fields: ['behavior.rules[].requiresBrief'],
    note:
      'BehaviorRuntime honours requiresBrief only when ctx.briefAvailable is passed; SceneRuntime never passes it, so ' +
      'requiresBrief:true rules never fire in the shipping pet (brief-driven dialogue is host-owned)',
    previewRuntime: true,
  },
  {
    id: 'say',
    status: 'not-implemented',
    fields: ['behavior.rules[].say'],
    note:
      'say blocks are validated data with no consumer: neither BehaviorRuntime/SceneRuntime nor the preview runtime speaks them; ' +
      'host speech lives in main.ts + voice and is not driven by behaviour rules',
    previewRuntime: false,
  },
  {
    id: 'sfx',
    status: 'not-implemented',
    fields: ['behavior.rules[].sfx'],
    note:
      'sfx clip ids are accepted (FCI 0.3 validates the reference) but no audio playback path consumes behavior.sfx; ' +
      'the preview runtime03 only surfaces the id to its caller',
    previewRuntime: true,
  },
  {
    id: 'effects',
    status: 'not-implemented',
    fields: ['behavior.rules[].effects'],
    note:
      'bond/mood/needs deltas are never applied: the shipping runtime has no needs/mood state implementation to apply them to',
    previewRuntime: false,
  },
  {
    id: 'needs',
    status: 'not-implemented',
    fields: ['behavior.needs'],
    note: 'reserved FCI 0.1 block; the shipping runtime has no needs decay/critical handling that reads it',
    previewRuntime: false,
  },
  {
    id: 'mood',
    status: 'not-implemented',
    fields: ['behavior.mood'],
    note: 'reserved FCI 0.1 block; the shipping runtime does not read behaviour mood data (FCI 0.3 document moods are preview-only too)',
    previewRuntime: false,
  },
  {
    id: 'speech',
    status: 'not-implemented',
    fields: ['behavior.speech'],
    note:
      'behavior.speech.lines has no shipping consumer; dialogue/voice is host-owned (main.ts + voice), not driven by the behaviour profile',
    previewRuntime: false,
  },
  {
    id: 'interactions',
    status: 'not-implemented',
    fields: ['behavior.interactions'],
    note: 'reserved FCI 0.1 block; no shipping runtime reads behaviour-level interaction declarations',
    previewRuntime: false,
  },
  {
    id: 'overrides',
    status: 'not-implemented',
    fields: ['behavior.overrides'],
    note: 'reserved FCI 0.1 block; no shipping runtime reads behaviour overrides',
    previewRuntime: false,
  },
  {
    id: 'fallback',
    status: 'not-implemented',
    fields: ['behavior.fallback'],
    note:
      'behaviour-profile fallback tag chains are not read; art fallback is the document/hero pack fallback map, not behavior.fallback',
    previewRuntime: false,
},
]

/** Capability table keyed by id (the decl = 15 rows above, frozen by tests). */
export const BEHAVIOR_CAPABILITY_INFO: Readonly<Record<BehaviorRuntimeCapability, BehaviorCapabilityInfo>> = Object.freeze(
  Object.fromEntries(CAPABILITY_ROWS.map((row) => [row.id, Object.freeze(row)])) as Record<BehaviorRuntimeCapability, BehaviorCapabilityInfo>,
)

/** Capabilities the shipping runtime composition executes (`status: wired`). */
export const SHIPPING_BEHAVIOR_CAPABILITIES: readonly BehaviorRuntimeCapability[] = Object.freeze(
  CAPABILITY_ROWS.filter((row) => row.status === 'wired').map((row) => row.id),
)

/** Hard cap for the `behavior.runtimeCapabilities` array (typo/abuse guard). */
export const MAX_BEHAVIOR_RUNTIME_CAPABILITIES = 16

/**
 * Reserved FCI 0.1 profile blocks that the shipping runtime does not read.
 * Every shipped character carries one (mostly `speech`/`needs`), so undeclared
 * use is reported in the audit summary + rejected under `strictCapabilities`,
 * but it is **not** a default warning: these are accepted legacy declarations,
 * not the advanced rule fields (guard/say/sfx/effects/brief/conditions) whose
 * silent non-execution the architecture review flagged. Declaring one of them
 * in `runtimeCapabilities` does produce a warning, because that is an explicit
 * requirement claim.
 */
export const RESERVED_PROFILE_BLOCK_CAPABILITIES: readonly BehaviorRuntimeCapability[] = Object.freeze([
  'needs',
  'mood',
  'speech',
  'interactions',
  'overrides',
  'fallback',
])

const RESERVED_PROFILE_BLOCKS = new Set<BehaviorRuntimeCapability>(RESERVED_PROFILE_BLOCK_CAPABILITIES)

/** Warning codes emitted by the capability gate (stable; CLI/tests assert them). */
export const BEHAVIOR_CAPABILITY_WARNING_CODES = Object.freeze({
  /** A declared capability is not executed by the shipping runtime. */
  unsupported: 'BEHAVIOR_CAPABILITY_UNSUPPORTED',
  /** A non-executed field is used without declaring it in runtimeCapabilities. */
  undeclared: 'BEHAVIOR_CAPABILITY_UNDECLARED',
})

/** One detected capability use in a raw behaviour profile. */
export interface BehaviorCapabilityUse {
  readonly capability: BehaviorRuntimeCapability
  /** JSON-ish path inside the behaviour profile, e.g. `behavior.rules[3].guard`. */
  readonly path: string
}

/** One capability that the shipping runtime cannot honour. */
export interface BehaviorCapabilityGap {
  readonly capability: BehaviorRuntimeCapability
  readonly status: Exclude<BehaviorCapabilityStatus, 'wired'>
  readonly declared: boolean
  readonly paths: readonly string[]
  readonly note: string
  /**
   * True when the default policy surfaces this gap (advises the author and is
   * the exact set `strictCapabilities` rejects): declared gaps always, plus
   * undeclared rule-level fields. Undeclared reserved profile blocks stay
   * summary-only by default (see RESERVED_PROFILE_BLOCK_CAPABILITIES).
   */
  readonly warned: boolean
}

/** Result of one capability audit (pure data; warnings are ready to surface). */
export interface BehaviorCapabilityAudit {
  /** Declared ids in declaration order (validated ids only). */
  readonly declared: readonly BehaviorRuntimeCapability[]
  /** Every detected non-wired field use, in profile order. */
  readonly used: readonly BehaviorCapabilityUse[]
  /** Declared/used capabilities the shipping runtime does not execute. */
  readonly gaps: readonly BehaviorCapabilityGap[]
  /** Non-fatal diagnostics (default mode); strict mode throws instead. */
  readonly warnings: readonly CharacterValidationWarning[]
  /** True when at least one gap exists. */
  readonly ok: boolean
}

/** Options accepted by the capability gate (`validate.ts` / validator CLI). */
export interface BehaviorCapabilityGateOptions {
  /** Sink for non-fatal diagnostics; default policy is warning-only. */
  warnings?: CharacterValidationWarning[]
  /** Throw on any warned gap instead of warning (new-pack / CI mode). */
  strictCapabilities?: boolean
  /**
   * Also warn about undeclared reserved profile blocks (needs/mood/speech/...).
   * Off by default because every shipped pack carries them; the audit summary
   * still reports them and strict mode still rejects *declared* blocks.
   */
  surfaceReservedBlocks?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const CAPABILITY_IDS = new Set<string>(BEHAVIOR_RUNTIME_CAPABILITIES)

/** True for a known declarable capability id. */
export function isBehaviorRuntimeCapability(value: unknown): value is BehaviorRuntimeCapability {
  return typeof value === 'string' && CAPABILITY_IDS.has(value)
}

/**
 * Validate the raw `behavior.runtimeCapabilities` declaration (if present).
 * Throws for a non-array, an empty entry, a duplicate or an unknown id — a
 * typo must never silently disable the gate. Returns the normalized ids.
 */
export function validateBehaviorRuntimeCapabilities(raw: unknown): BehaviorRuntimeCapability[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    throw new CharacterInterfaceError(
      'behavior.runtimeCapabilities must be an array of capability ids [' + BEHAVIOR_RUNTIME_CAPABILITIES.join(', ') + ']',
    )
  }
  if (raw.length > MAX_BEHAVIOR_RUNTIME_CAPABILITIES) {
    throw new CharacterInterfaceError(
      'behavior.runtimeCapabilities has ' + raw.length + ' entries, max ' + MAX_BEHAVIOR_RUNTIME_CAPABILITIES,
    )
  }
  const out: BehaviorRuntimeCapability[] = []
  for (const [index, entry] of raw.entries()) {
    if (!isBehaviorRuntimeCapability(entry)) {
      throw new CharacterInterfaceError(
        'behavior.runtimeCapabilities[' + index + '] must be one of [' + BEHAVIOR_RUNTIME_CAPABILITIES.join(', ') + '], got ' + JSON.stringify(entry),
      )
    }
    if (out.includes(entry)) {
      throw new CharacterInterfaceError('behavior.runtimeCapabilities[' + index + '] duplicates "' + entry + '"')
    }
    out.push(entry)
  }
  return out
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null
}

function hasContent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.length > 0
  if (isRecord(value)) return Object.keys(value).length > 0
  return true
}

/**
 * Detect every non-wired capability use in a raw behaviour profile.
 * Wired capabilities (rules/ambient/slots) are intentionally not reported:
 * they are executed, so using them needs no declaration or warning.
 */
export function detectBehaviorCapabilityUse(profile: unknown): BehaviorCapabilityUse[] {
  const used: BehaviorCapabilityUse[] = []
  const raw = readRecord(profile)
  if (!raw) return used
  const push = (capability: BehaviorRuntimeCapability, path: string): void => {
    used.push({ capability, path })
  }
  const rules = Array.isArray(raw.rules) ? raw.rules : []
  for (const [index, ruleRaw] of rules.entries()) {
    const rule = readRecord(ruleRaw)
    if (!rule) continue
    const base = 'behavior.rules[' + index + ']'
    if (rule.guard !== undefined) push('guard', base + '.guard')
    if (rule.requiresBrief === true) push('brief', base + '.requiresBrief')
    if (rule.say !== undefined) push('say', base + '.say')
    if (rule.sfx !== undefined) push('sfx', base + '.sfx')
    if (rule.effects !== undefined) push('effects', base + '.effects')
    const when = readRecord(rule.when)
    if (when) {
      for (const key of ['source', 'secrecyMax', 'mood', 'focus', 'energy'] as const) {
        if (when[key] !== undefined) push('conditions', base + '.when.' + key)
      }
    }
  }
  for (const key of ['needs', 'mood', 'speech', 'interactions', 'overrides', 'fallback'] as const) {
    if (hasContent(raw[key])) push(key, 'behavior.' + key)
  }
  return used
}

/**
 * Capabilities a profile could declare for its own used fields. This is the
 * generator side of the gate: it answers "what should runtimeCapabilities be?"
 * without claiming the shipping runtime supports any of them.
 */
export function suggestRuntimeCapabilities(profile: unknown): BehaviorRuntimeCapability[] {
  const ids: BehaviorRuntimeCapability[] = []
  for (const use of detectBehaviorCapabilityUse(profile)) {
    if (!ids.includes(use.capability)) ids.push(use.capability)
  }
  return ids
}

function describeGap(gap: BehaviorCapabilityGap): string {
  const where = gap.paths.length > 0 ? ' at ' + gap.paths.join(', ') : ''
  return gap.capability + ' (' + gap.status + ': ' + gap.note + ')' + where
}

/**
 * Audit one raw behaviour profile against the shipping runtime capabilities.
 * Pure and total: never throws (unknown ids are validated by
 * validateBehaviorRuntimeCapabilities before/alongside this).
 */
export function auditBehaviorCapabilities(
  profile: unknown,
  options: { readonly surfaceReservedBlocks?: boolean } = {},
): BehaviorCapabilityAudit {
  const raw = readRecord(profile)
  const declared = (() => {
    if (!raw) return [] as BehaviorRuntimeCapability[]
    try {
      return validateBehaviorRuntimeCapabilities(raw.runtimeCapabilities)
    } catch {
      return [] as BehaviorRuntimeCapability[]
    }
  })()
  const used = detectBehaviorCapabilityUse(raw)
  const gapIds: BehaviorRuntimeCapability[] = []
  for (const id of declared) if (!SHIPPING_BEHAVIOR_CAPABILITIES.includes(id)) gapIds.push(id)
  for (const use of used) if (!gapIds.includes(use.capability)) gapIds.push(use.capability)
  const gaps: BehaviorCapabilityGap[] = []
  for (const id of gapIds) {
    const info = BEHAVIOR_CAPABILITY_INFO[id]
    if (info.status === 'wired') continue
    const paths = used.filter((use) => use.capability === id).map((use) => use.path)
    const isDeclared = declared.includes(id)
    const warned = isDeclared || !RESERVED_PROFILE_BLOCKS.has(id) || options.surfaceReservedBlocks === true
    gaps.push({
      capability: id,
      status: info.status,
      declared: isDeclared,
      paths,
      note: info.note,
      warned,
    })
  }
  const warnings: CharacterValidationWarning[] = []
  for (const gap of gaps) {
    if (!gap.warned) continue
    const declarationIndex = declared.indexOf(gap.capability)
    if (gap.declared) {
      warnings.push({
        code: BEHAVIOR_CAPABILITY_WARNING_CODES.unsupported,
        path: 'behavior.runtimeCapabilities[' + declarationIndex + ']',
        message:
          'behavior declares runtime capability "' + gap.capability + '" (' + gap.status + ') but the shipping hero runtime does not execute it: ' +
          gap.note +
          (gap.paths.length > 0 ? ' Used by ' + gap.paths.join(', ') + '.' : '') +
          ' Remove the declaration/rules or keep this pack preview-only (FCI 0.3 runtime03); ' +
          'strict mode (--strict-capabilities) rejects this declaration.',
      })
      continue
    }
    const first = gap.paths[0] ?? 'behavior'
    warnings.push({
      code: BEHAVIOR_CAPABILITY_WARNING_CODES.undeclared,
      path: first,
      message:
        'behavior uses "' + gap.capability + '" (' + gap.status + ') without declaring it in behavior.runtimeCapabilities: ' +
        gap.note +
        ' Used by ' + gap.paths.join(', ') + '. ' +
        'Declare it in behavior.runtimeCapabilities to acknowledge the gap, or remove the field; ' +
        'strict mode (--strict-capabilities) rejects undeclared non-executed fields.',
    })
  }
  return { declared, used, gaps, warnings, ok: gaps.length === 0 }
}

function strictCapabilityError(audit: BehaviorCapabilityAudit): CharacterInterfaceError {
  const gaps = audit.gaps.filter((gap) => gap.warned).map((gap) => describeGap(gap)).join('; ')
  return new CharacterInterfaceError(
    'behavior requires runtime capabilities this shipping runtime does not execute (strictCapabilities): ' +
      gaps +
      '. Remove the fields/declarations, run on a preview host (FCI 0.3 runtime03), or validate without strictCapabilities ' +
      'to keep the backward-compatible warning policy. See docs/plan/ADR-BEHAVIOR-CONTRACT-2026-11-21.md.',
  )
}

/**
 * Run the capability gate for one already-structure-valid behaviour profile:
 * validates the declaration (unknown ids throw in every mode), pushes
 * `BEHAVIOR_CAPABILITY_*` warnings in default mode and throws in strict mode.
 * Returns the audit so callers can render their own summary.
 */
export function applyBehaviorCapabilityGate(
  profile: unknown,
  options: BehaviorCapabilityGateOptions = {},
): BehaviorCapabilityAudit {
  // Unknown/duplicate ids throw here in every mode: a typo must not silently
  // disable the gate. Structural order: declaration first, then audit.
  validateBehaviorRuntimeCapabilities(readRecord(profile)?.runtimeCapabilities)
  const audit = auditBehaviorCapabilities(profile, {
    ...(options.surfaceReservedBlocks !== undefined ? { surfaceReservedBlocks: options.surfaceReservedBlocks } : {}),
  })
  const blocked = audit.gaps.filter((gap) => gap.warned)
  if (options.strictCapabilities === true && blocked.length > 0) throw strictCapabilityError(audit)
  if (options.warnings) for (const warning of audit.warnings) options.warnings.push(warning)
  return audit
}

export type { BehaviorRuntimeCapability }
export { BEHAVIOR_RUNTIME_CAPABILITIES }

/** Human-readable one-line status for a capability (docs/CLI summary). */
export function describeBehaviorCapability(id: BehaviorRuntimeCapability): string {
  const info = BEHAVIOR_CAPABILITY_INFO[id]
  return id + ': ' + info.status + ' — ' + info.note
}
/** Behaviour-profile capability summary for validator JSON (`checks.behavior.capabilities`). */
export function capabilityAuditSummary(audit: BehaviorCapabilityAudit): Record<string, unknown> {
  return {
    ok: audit.ok,
    declared: [...audit.declared],
    used: audit.used.map((use) => ({ capability: use.capability, path: use.path })),
    gaps: audit.gaps.map((gap) => ({
      capability: gap.capability,
      status: gap.status,
      declared: gap.declared,
      warn: gap.warned,
      paths: [...gap.paths],
    })),
  }
}

// Type-only re-export used by validate.ts consumers that build warnings from
// the audit without importing the types module directly.
export type { BehaviorProfile }
