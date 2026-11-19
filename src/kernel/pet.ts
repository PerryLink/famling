import {
  correctMemory,
  createMemory,
  forgetMemory,
  upsertMemory,
  type MemoryItem,
  type MemoryLayer,
  type MemorySnapshot,
  type MemorySource,
  type MemoryStatus,
} from './memory.ts'
import { SECURITY_LIMITS, sanitizePlainText } from '../pet/security/limits.ts'

export interface PetMemory {
  id: string
  text: string
  atMs: number
}

export interface PetState {
  schema: 1
  name: string
  /** 0..100; grows through attention, never decays as a punishment. */
  bond: number
  paper: number
  folded: number
  memories: PetMemory[]
  /** Structured memory is the source of truth for the fold-page book. */
  memory: MemorySnapshot
  /** Last proactive memory recall; caps it to once per 4h. */
  lastRecallAtMs: number
  /** Local day key + count; caps proactive recall to 2/day. */
  recallDay: string
  recallCountDay: number
  muted: boolean
  createdAtMs: number
  lastSeenMs: number
}

export function createPet(nowMs = Date.now(), name = '折角'): PetState {
  return {
    schema: 1,
    name,
    bond: 0,
    paper: 0,
    folded: 0,
    memories: [{ id: 'first', text: '第一次醒来，在书页的折角里。', atMs: nowMs }],
    memory: withMemory(createMemory(nowMs), {
      id: 'first',
      layer: 'episodic',
      text: '第一次醒来，在书页的折角里。',
      tags: ['first', 'wake'],
      atMs: nowMs,
      updatedAtMs: nowMs,
      source: 'system',
      confidence: 1,
      importance: 3,
      status: 'active',
    }, nowMs),
    lastRecallAtMs: 0,
    recallDay: '',
    recallCountDay: 0,
    muted: false,
    createdAtMs: nowMs,
    lastSeenMs: nowMs,
  }
}

function itemFor(id: string, text: string, atMs: number, layer: MemoryItem['layer'] = 'episodic', key?: string): MemoryItem {
  return {
    id, layer, key, text, tags: id.split('_'), atMs, updatedAtMs: atMs,
    source: 'system', confidence: 1, importance: layer === 'commitment' ? 3 : 1, status: 'active',
  }
}

function withMemory(snapshot: MemorySnapshot, item: MemoryItem, nowMs: number): MemorySnapshot {
  return upsertMemory(snapshot, item, nowMs)
}

function remember(state: PetState, id: string, text: string, atMs: number): Pick<PetState, 'memories' | 'memory'> {
  const memories = state.memories.some((m) => m.id === id)
    ? state.memories
    : [...state.memories, { id, text, atMs }].slice(-16)
  const memory = state.memory.items.some((m) => m.id === id)
    ? state.memory
    : withMemory(state.memory, itemFor(id, text, atMs), atMs)
  return { memories, memory }
}

export function patPet(state: PetState, nowMs: number): PetState {
  return {
    ...state,
    bond: Math.min(100, state.bond + 2),
    lastSeenMs: nowMs,
    ...remember(state, 'first_pat', '第一次被摸了摸头。', nowMs),
  }
}

export function givePaper(state: PetState, nowMs: number): PetState {
  return {
    ...state,
    paper: state.paper + 1,
    bond: Math.min(100, state.bond + 1),
    lastSeenMs: nowMs,
    ...remember(state, 'first_paper', '第一次收到一张小纸片。', nowMs),
  }
}

export function foldPaper(state: PetState, nowMs: number): PetState {
  if (state.paper <= 0) return state
  const folded = state.folded + 1
  return {
    ...state,
    paper: state.paper - 1,
    folded,
    bond: Math.min(100, state.bond + 3),
    lastSeenMs: nowMs,
    ...remember(
      state,
      `fold_${folded}`,
      folded === 1 ? '第一次把纸折成小动物。' : `折出了第 ${folded} 个小东西。`,
      nowMs,
    ),
  }
}

export function renamePet(state: PetState, name: string, nowMs = Date.now()): PetState {
  const clean = name.trim().slice(0, 8)
  if (!clean) return state
  return {
    ...state,
    name: clean,
    ...remember(state, 'renamed', `你给它起名叫「${clean}」。`, nowMs),
    memory: withMemory(state.memory, itemFor('pet.name', `它叫「${clean}」。`, nowMs, 'semantic', 'pet.name'), nowMs),
  }
}

export function forgetPetMemory(state: PetState, id: string, nowMs: number): PetState {
  const item = state.memory.items.find((entry) => entry.id === id && entry.status === 'active')
  if (!item) return state
  return {
    ...state,
    memory: forgetMemory(state.memory, id, nowMs),
    memories: state.memories.filter((entry) => entry.id !== id),
    lastSeenMs: nowMs,
  }
}

export function correctPetMemory(state: PetState, id: string, text: string, nowMs: number): PetState {
  const item = state.memory.items.find((entry) => entry.id === id && entry.status === 'active')
  if (!item || !text.trim()) return state
  return {
    ...state,
    memory: correctMemory(state.memory, id, text.trim().slice(0, 60), nowMs),
    memories: state.memories.map((entry) => entry.id === id ? { ...entry, text: text.trim().slice(0, 60) } : entry),
    lastSeenMs: nowMs,
  }
}

export function setMuted(state: PetState, muted: boolean): PetState {
  return { ...state, muted }
}

export function serializePet(state: PetState): string {
  return JSON.stringify(state)
}

/**
 * Untrusted-save limits (HARDENING-2026-11-17 P0-3). Saves can come from a
 * corrupted disk, an old version, the QA restore hook or a decrypted portable
 * file; the old implementation spread `raw` straight into the state, so a
 * non-array `memory.items` crashed render/memory book/recall with a TypeError
 * and arbitrary long strings inflated memory. Every field below is validated
 * independently and falls back to the default state when bad.
 */
const MAX_SAVE_MEMORY_ITEMS = 200
const MAX_SAVE_HISTORY_ITEMS = 8
const MAX_LEGACY_MEMORIES = 64
const MAX_SAVE_MEMORY_TEXT_CHARS = 120
const MAX_SAVE_ID_CHARS = 64
const MAX_SAVE_TAG_CHARS = 24
const MAX_SAVE_REV = 1_000_000_000
const MAX_SAVE_COUNTER = 1_000_000

const MEMORY_LAYERS: readonly MemoryLayer[] = ['episodic', 'semantic', 'commitment', 'relation']
const MEMORY_SOURCES: readonly MemorySource[] = ['explicit', 'confirmed', 'inferred', 'system']
const MEMORY_STATUSES: readonly MemoryStatus[] = ['active', 'superseded', 'archived']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function safeSaveText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return ''
  return sanitizePlainText(value, { maxChars, allowNewlines: false })
}

/** Finite number clamped to [min,max]; `fallback` for NaN/Infinity/non-number. */
function saveNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function saveInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.floor(saveNumber(value, fallback, min, max))
}

/** Non-negative, bounded timestamp (ms); `fallback` for bad values. */
function saveTimestamp(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return Math.min(value, Number.MAX_SAFE_INTEGER)
}

function saveOptionalTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.min(value, Number.MAX_SAFE_INTEGER)
}

function saveId(value: unknown, fallback: string): string {
  return safeSaveText(value, MAX_SAVE_ID_CHARS) || fallback
}

function normalizeMemoryItem(raw: unknown): MemoryItem | undefined {
  if (!isRecord(raw)) return undefined
  const text = safeSaveText(raw.text, SECURITY_LIMITS.memoryTextChars)
  const id = saveId(raw.id, '')
  if (!text || !id) return undefined
  const tags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => safeSaveText(tag, MAX_SAVE_TAG_CHARS))
        .filter(Boolean)
        .slice(0, 8)
    : []
  const history = Array.isArray(raw.history)
    ? raw.history
        .slice(0, MAX_SAVE_HISTORY_ITEMS)
        .flatMap((entry) => {
          if (!isRecord(entry)) return []
          const historyText = safeSaveText(entry.text, SECURITY_LIMITS.memoryTextChars)
          if (!historyText) return []
          return [{
            text: historyText,
            source: isOneOf(entry.source, MEMORY_SOURCES) ? entry.source : 'system',
            atMs: saveTimestamp(entry.atMs, 0),
          }]
        })
    : []
  const key = safeSaveText(raw.key, MAX_SAVE_ID_CHARS)
  const supersededBy = saveId(raw.supersededBy ?? '', '')
  const ttlMs = saveOptionalTimestamp(raw.ttlMs)
  const dueMs = saveOptionalTimestamp(raw.dueMs)
  return {
    id,
    layer: isOneOf(raw.layer, MEMORY_LAYERS) ? raw.layer : 'episodic',
    ...(key ? { key } : {}),
    text,
    tags,
    atMs: saveTimestamp(raw.atMs, 0),
    updatedAtMs: saveTimestamp(raw.updatedAtMs, 0),
    source: isOneOf(raw.source, MEMORY_SOURCES) ? raw.source : 'system',
    confidence: saveNumber(raw.confidence, 1, 0, 1),
    importance: saveInt(raw.importance, 1, 0, 3) as MemoryItem['importance'],
    ...(ttlMs !== undefined ? { ttlMs } : {}),
    ...(dueMs !== undefined ? { dueMs } : {}),
    status: isOneOf(raw.status, MEMORY_STATUSES) ? raw.status : 'active',
    ...(supersededBy ? { supersededBy } : {}),
    ...(history.length > 0 ? { history } : {}),
  }
}

function normalizeMemorySnapshot(raw: unknown, fallbackNow: number): MemorySnapshot | undefined {
  if (!isRecord(raw) || raw.schema !== 1 || !Array.isArray(raw.items)) return undefined
  const items: MemoryItem[] = []
  const seen = new Set<string>()
  for (const entry of raw.items.slice(0, MAX_SAVE_MEMORY_ITEMS)) {
    const item = normalizeMemoryItem(entry)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    items.push(item)
  }
  return {
    schema: 1,
    rev: saveInt(raw.rev, 0, 0, MAX_SAVE_REV),
    items,
    updatedAtMs: saveTimestamp(raw.updatedAtMs, fallbackNow),
  }
}

function normalizeLegacyMemories(raw: unknown): PetMemory[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) return []
  const memories: PetMemory[] = []
  for (const entry of raw.slice(-MAX_LEGACY_MEMORIES)) {
    if (!isRecord(entry)) continue
    const text = safeSaveText(entry.text, MAX_SAVE_MEMORY_TEXT_CHARS)
    if (!text) continue
    memories.push({
      id: saveId(entry.id, `legacy_${memories.length}`),
      text,
      atMs: saveTimestamp(entry.atMs, 0),
    })
  }
  return memories
}

/**
 * Rebuild a `PetState` from untrusted JSON. Never spreads the parsed object:
 * each field is type-checked, bounded and falls back to `createPet()` defaults.
 * Throws only for non-JSON, a non-object, or an unsupported `schema` (callers
 * such as `parsePetSave`/QA restore treat that as "bad save, use default").
 */
export function deserializePet(text: string): PetState {
  if (typeof text !== 'string' || text.length === 0) throw new Error('unsupported pet save')
  if (text.length > SECURITY_LIMITS.savePlainBytes) throw new Error('unsupported pet save')
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('unsupported pet save')
  }
  if (!isRecord(raw) || raw.schema !== 1) throw new Error('unsupported pet save')

  const createdAtMs = saveTimestamp(raw.createdAtMs, Date.now())
  const base = createPet(createdAtMs)
  const legacyMemories = normalizeLegacyMemories(raw.memories)
  const memories = legacyMemories ?? base.memories
  let memory = normalizeMemorySnapshot(raw.memory, createdAtMs)
  if (!memory) {
    // Migrate pre-structured saves (or repair a corrupt/missing snapshot):
    // legacy memories become episodic facts, exactly as before the hardening.
    memory = createMemory(createdAtMs)
    for (const entry of memories) {
      memory = withMemory(memory, itemFor(entry.id, entry.text, entry.atMs), entry.atMs)
    }
  }
  return {
    schema: 1,
    name: safeSaveText(raw.name, SECURITY_LIMITS.displayNameChars) || base.name,
    bond: saveInt(raw.bond, 0, 0, 100),
    paper: saveInt(raw.paper, 0, 0, MAX_SAVE_COUNTER),
    folded: saveInt(raw.folded, 0, 0, MAX_SAVE_COUNTER),
    memories,
    memory,
    lastRecallAtMs: saveTimestamp(raw.lastRecallAtMs, 0),
    recallDay: safeSaveText(raw.recallDay, 16),
    recallCountDay: saveInt(raw.recallCountDay, 0, 0, MAX_SAVE_COUNTER),
    muted: raw.muted === true,
    createdAtMs,
    lastSeenMs: saveTimestamp(raw.lastSeenMs, createdAtMs),
  }
}

export type PetPhase = 'sleep' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'night'
export type PetMood = 'quiet' | 'curious' | 'attached'

export function petPhase(nowMs: number): PetPhase {
  const hour = new Date(nowMs).getHours()
  if (hour < 6) return 'sleep'
  if (hour < 11) return 'morning'
  if (hour < 14) return 'midday'
  if (hour < 18) return 'afternoon'
  if (hour < 22) return 'evening'
  return 'night'
}

export function petMood(state: PetState): PetMood {
  if (state.bond >= 20 || state.folded >= 4) return 'attached'
  if (state.paper > 0 || state.bond >= 6) return 'curious'
  return 'quiet'
}

export function petSchedule(nowMs: number): { phase: PetPhase; label: string; line: string } {
  switch (petPhase(nowMs)) {
    case 'sleep':
      return { phase: 'sleep', label: '在书脊里睡着', line: '……' }
    case 'morning':
      return { phase: 'morning', label: '在整理昨天的纸片', line: '早。今天书页很轻。' }
    case 'midday':
      return { phase: 'midday', label: '趴在页脚打盹', line: '午后的纸有点暖。' }
    case 'afternoon':
      // Low-disturbance copy (PSY-P1-7): no "I'll wait here" obligation.
      return { phase: 'afternoon', label: '在折一件小东西', line: '书页翻到下午了。' }
    case 'evening':
      return { phase: 'evening', label: '把灯拨亮一点', line: '天暗了。' }
    default:
      // Night copy is low-arousal and does not claim to leave a light on for
      // the user; quiet hours are handled separately in the pet shell.
      return { phase: 'night', label: '把灯收好', line: '……这么晚。早点休息。' }
  }
}


export function dayKey(nowMs: number): string {
  const date = new Date(nowMs)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** 4h cooldown + at most 2 proactive recalls per local day. */
export function canRecallMemory(state: PetState, nowMs: number): boolean {
  if (nowMs - (state.lastRecallAtMs ?? 0) < 4 * 60 * 60 * 1000) return false
  const day = dayKey(nowMs)
  if (state.recallDay !== day) return true
  return (state.recallCountDay ?? 0) < 2
}

export function markMemoryRecalled(state: PetState, nowMs: number): PetState {
  const day = dayKey(nowMs)
  return {
    ...state,
    lastRecallAtMs: nowMs,
    recallDay: day,
    recallCountDay: state.recallDay === day ? (state.recallCountDay + 1) : 1,
  }
}
