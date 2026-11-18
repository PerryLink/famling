/**
 * Local-first companion memory. 3–50 items do not need embeddings: a compact
 * structured snapshot + deterministic recall is cheaper and auditable.
 * No LLM is allowed to write or rewrite canonical facts.
 */
export type MemoryLayer = 'episodic' | 'semantic' | 'commitment' | 'relation'
export type MemorySource = 'explicit' | 'confirmed' | 'inferred' | 'system'
export type MemoryStatus = 'active' | 'superseded' | 'archived'

export interface MemoryItem {
  id: string
  layer: MemoryLayer
  /** Stable key for preference/commitment de-duplication, e.g. pref.paper. */
  key?: string
  text: string
  tags: string[]
  atMs: number
  updatedAtMs: number
  source: MemorySource
  confidence: number
  importance: 0 | 1 | 2 | 3
  ttlMs?: number
  dueMs?: number
  status: MemoryStatus
  supersededBy?: string
  history?: Array<{ text: string; source: MemorySource; atMs: number }>
}

export interface MemorySnapshot {
  schema: 1
  rev: number
  items: MemoryItem[]
  updatedAtMs: number
}

export interface RecallQuery {
  nowMs: number
  intent?: string
  tags?: string[]
  entities?: string[]
  limit?: number
}

export interface RecallResult {
  items: MemoryItem[]
  text: string
}

const ACTIVE_LIMITS: Record<MemoryLayer, number> = {
  episodic: 16,
  semantic: 20,
  commitment: 5,
  relation: 1,
}

export function createMemory(nowMs = 0): MemorySnapshot {
  return { schema: 1, rev: 0, items: [], updatedAtMs: nowMs }
}

const isExpired = (item: MemoryItem, nowMs: number): boolean =>
  typeof item.ttlMs === 'number' && nowMs - item.updatedAtMs > item.ttlMs

const active = (snapshot: MemorySnapshot): MemoryItem[] =>
  snapshot.items.filter((item) => item.status === 'active')

function prune(snapshot: MemorySnapshot, nowMs: number): MemoryItem[] {
  const items = snapshot.items.map((item) =>
    item.status === 'active' && isExpired(item, nowMs) ? { ...item, status: 'archived' as const } : item,
  )
  for (const layer of Object.keys(ACTIVE_LIMITS) as MemoryLayer[]) {
    const keep = items
      .filter((item) => item.layer === layer && item.status === 'active')
      .sort((a, b) => b.importance - a.importance || b.updatedAtMs - a.updatedAtMs)
    const accepted = new Set(keep.slice(0, ACTIVE_LIMITS[layer]).map((item) => item.id))
    for (const item of keep) {
      if (!accepted.has(item.id)) item.status = 'archived'
    }
  }
  return items
}

/** Upsert by key/id; a changed keyed fact supersedes the old value, never deletes it. */
export function upsertMemory(
  snapshot: MemorySnapshot,
  item: MemoryItem,
  nowMs = item.updatedAtMs,
): MemorySnapshot {
  const items = [...snapshot.items]
  const keyed = item.key ? items.find((entry) => entry.layer === item.layer && entry.key === item.key && entry.status === 'active') : undefined
  const sameId = items.findIndex((entry) => entry.id === item.id)
  if (keyed && keyed.id !== item.id) {
    const index = items.findIndex((entry) => entry.id === keyed.id)
    items[index] = {
      ...keyed,
      status: 'superseded',
      supersededBy: item.id,
      history: [...(keyed.history ?? []), { text: keyed.text, source: keyed.source, atMs: keyed.atMs }],
    }
  }
  const next: MemoryItem = {
    ...item,
    status: 'active',
    atMs: sameId >= 0 ? items[sameId]!.atMs : item.atMs,
    updatedAtMs: nowMs,
  }
  if (sameId >= 0) items[sameId] = next
  else items.push(next)
  return { ...snapshot, rev: snapshot.rev + 1, items: prune({ ...snapshot, items }, nowMs), updatedAtMs: nowMs }
}

/** Explicit user correction: old keyed value is superseded in one operation. */
export function correctMemory(
  snapshot: MemorySnapshot,
  id: string,
  text: string,
  nowMs: number,
): MemorySnapshot {
  const old = snapshot.items.find((item) => item.id === id && item.status === 'active')
  if (!old) return snapshot
  return upsertMemory(snapshot, {
    ...old,
    id: `${old.id}-fixed-${nowMs}`,
    text,
    source: 'explicit',
    confidence: 1,
    updatedAtMs: nowMs,
    atMs: nowMs,
    history: undefined,
  }, nowMs)
}

export function forgetMemory(snapshot: MemorySnapshot, id: string, nowMs: number): MemorySnapshot {
  return {
    ...snapshot,
    rev: snapshot.rev + 1,
    items: snapshot.items.map((item) =>
      item.id === id ? { ...item, status: 'archived' as const } : item,
    ),
    updatedAtMs: nowMs,
  }
}

/** Rule-based compaction: expire/archive, never rewrite facts into summaries. */
export function compactMemory(snapshot: MemorySnapshot, nowMs: number): MemorySnapshot {
  const items = prune(snapshot, nowMs)
  return { ...snapshot, rev: snapshot.rev + 1, items, updatedAtMs: nowMs }
}

function score(item: MemoryItem, query: RecallQuery): number {
  const tags = new Set(query.tags ?? [])
  const entities = new Set(query.entities ?? [])
  let score = item.importance * 2 + item.confidence
  for (const tag of item.tags) {
    if (tags.has(tag)) score += 3
    for (const entity of entities) if (tag.includes(entity) || entity.includes(tag)) score += 2
  }
  if (item.key && query.intent && item.key.includes(query.intent)) score += 3
  // Recency is a tie-breaker, not a reason to forget important facts.
  if (typeof item.updatedAtMs === 'number') score += Math.max(0, 2 - (query.nowMs - item.updatedAtMs) / 86_400_000)
  return score
}

/** Deterministic recall: commitments first, then keyed facts, then episodic. */
export function recallMemory(snapshot: MemorySnapshot, query: RecallQuery): RecallResult {
  const wanted = active(snapshot).filter(
    (item) =>
      item.layer !== 'relation' &&
      (!item.ttlMs || query.nowMs - item.updatedAtMs <= item.ttlMs) &&
      (!item.dueMs || item.dueMs >= query.nowMs - 86_400_000),
  )
  const commitments = wanted.filter((item) => item.layer === 'commitment')
  const rest = wanted
    .filter((item) => item.layer !== 'commitment')
    .sort((a, b) => score(b, query) - score(a, query))
  const items = [...commitments, ...rest].slice(0, query.limit ?? 8)
  return { items, text: items.map((item) => `- ${item.text}`).join('\n') }
}

export function exportMemory(snapshot: MemorySnapshot): string {
  return JSON.stringify(snapshot)
}

export function importMemory(text: string): MemorySnapshot {
  const raw = JSON.parse(text) as MemorySnapshot
  if (!raw || raw.schema !== 1 || !Array.isArray(raw.items)) throw new Error('unsupported memory snapshot')
  return raw
}
