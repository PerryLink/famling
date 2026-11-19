/**
 * Host file store for installed character packs: IndexedDB with an explicit
 * in-memory fallback (E4 role-pack installer, task-98).
 *
 * `CharacterPackRuntime` (src/pet/character-packs.ts) deliberately performs NO
 * filesystem I/O itself; it writes host-relative files such as
 * `<packId>/<version>/assets/...` and the `<packId>/current.json` commit
 * pointer through the injected `CharacterPackRuntimeHost`. This module is the
 * browser half of that host: it persists that file tree in IndexedDB and keeps
 * an in-memory implementation for tests / private-mode fallback. It never
 * throws while *opening*; individual operations reject so the runtime can
 * report `host-list-failed` / `host-write-failed` / `host-remove-failed`
 * instead of silently pretending success.
 *
 * The theme-pack asset store in content-assets.ts is intentionally separate:
 * that store keys assets by packId/path for preview hydration, while this store
 * keeps arbitrary host-relative paths (pack.json, frame files, pointer files)
 * so the character-pack runtime can install/rollback without a filesystem.
 */
import { CONTENT_PACK_V2_LIMITS } from '../content-library.ts'

/** IndexedDB database/store used only for installed character-pack files. */
export const CHARACTER_PACK_STORE_DB = 'desktop-games/pet/character-packs'
export const CHARACTER_PACK_STORE_NAME = 'files'

/** One file is bounded by the anim-pack per-file cap (8 MiB). */
const MAX_FILE_BYTES = CONTENT_PACK_V2_LIMITS.maxAssetBytes
const MAX_PATH_CHARS = 512

/** Host-relative file list/read/write/remove store (no pack semantics). */
export interface CharacterPackFileStore {
  readonly kind: 'indexeddb' | 'memory'
  /** Every stored host-relative path (unordered; callers sort as needed). */
  listPaths(): Promise<readonly string[]>
  read(path: string): Promise<Uint8Array | null>
  /** Write one file; replaces an existing entry atomically per record. */
  write(path: string, bytes: Uint8Array): Promise<void>
  /** Remove one file, or every file under `path/` when it is a directory prefix. */
  remove(path: string): Promise<void>
}

export interface CharacterPackFileStoreOptions {
  /** Injected IDBFactory (tests use fake-indexeddb); undefined = global one. */
  readonly factory?: IDBFactory | null
  readonly dbName?: string
}

// ---------------------------------------------------------------------------
// Path / size guards (defence in depth: the runtime already vets its layout)
// ---------------------------------------------------------------------------

function hasUnsafePathShape(path: string): boolean {
  if (path.startsWith('/') || path.endsWith('/')) return true
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return true
  for (const segment of path.split('/')) {
    if (segment.length === 0 || segment === '.' || segment === '..') return true
  }
  return false
}

function assertStorePath(path: unknown): asserts path is string {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH_CHARS) {
    throw new Error('character-pack store path must be a short non-empty string')
  }
  if (hasUnsafePathShape(path)) throw new Error('unsafe character-pack store path: ' + path.slice(0, 96))
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('character-pack store bytes must be a Uint8Array')
  if (bytes.byteLength === 0) throw new Error('character-pack store refuses empty files')
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('character-pack file exceeds the ' + MAX_FILE_BYTES + ' byte cap')
  return bytes.slice()
}

// ---------------------------------------------------------------------------
// In-memory store (tests, private mode, IndexedDB fallback)
// ---------------------------------------------------------------------------

/** Explicit in-memory store; used by tests and as the IndexedDB fallback. */
export function createMemoryCharacterPackFileStore(): CharacterPackFileStore {
  const files = new Map<string, Uint8Array>()
  return Object.freeze({
    kind: 'memory' as const,
    async listPaths(): Promise<readonly string[]> {
      return Object.freeze([...files.keys()])
    },
    async read(path: string): Promise<Uint8Array | null> {
      assertStorePath(path)
      const found = files.get(path)
      return found === undefined ? null : found.slice()
    },
    async write(path: string, bytes: Uint8Array): Promise<void> {
      assertStorePath(path)
      files.set(path, copyBytes(bytes))
    },
    async remove(path: string): Promise<void> {
      assertStorePath(path)
      const prefix = path + '/'
      for (const key of [...files.keys()]) {
        if (key === path || key.startsWith(prefix)) files.delete(key)
      }
    },
  })
}

// ---------------------------------------------------------------------------
// IndexedDB store
// ---------------------------------------------------------------------------

interface IdbCharacterPackFileStore extends CharacterPackFileStore {
  readonly ready: Promise<IDBDatabase | null>
}

interface StoredFileRecord {
  readonly path: string
  readonly bytes: ArrayBuffer
}

function openIdb(factory: IDBFactory, dbName: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = factory.open(dbName, 1)
    } catch {
      resolve(null)
      return
    }
    request.onupgradeneeded = () => {
      try {
        const db = request.result
        if (!db.objectStoreNames.contains(CHARACTER_PACK_STORE_NAME)) {
          db.createObjectStore(CHARACTER_PACK_STORE_NAME, { keyPath: 'path' })
        }
      } catch {
        // A failed upgrade leaves the store unusable; operations fail closed.
      }
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      resolve(null)
    }
    request.onblocked = () => {
      resolve(null)
    }
  })
}

function createIdbCharacterPackFileStore(factory: IDBFactory, dbName: string): IdbCharacterPackFileStore {
  const ready = openIdb(factory, dbName)
  const database = async (): Promise<IDBDatabase> => {
    const db = await ready
    if (db === null) throw new Error('character-pack IndexedDB is unavailable')
    return db
  }
  return {
    kind: 'indexeddb',
    ready,
    async listPaths(): Promise<readonly string[]> {
      const db = await database()
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(CHARACTER_PACK_STORE_NAME, 'readonly')
          const request = transaction.objectStore(CHARACTER_PACK_STORE_NAME).getAllKeys()
          request.onsuccess = () => {
            const keys = Array.isArray(request.result) ? request.result : []
            resolve(Object.freeze(keys.filter((key): key is string => typeof key === 'string')))
          }
          request.onerror = () => {
            reject(request.error ?? new Error('character-pack IndexedDB list failed'))
          }
        } catch (error) {
          reject(error)
        }
      })
    },
    async read(path: string): Promise<Uint8Array | null> {
      assertStorePath(path)
      const db = await database()
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(CHARACTER_PACK_STORE_NAME, 'readonly')
          const request = transaction.objectStore(CHARACTER_PACK_STORE_NAME).get(path)
          request.onsuccess = () => {
            const record = request.result as StoredFileRecord | undefined
            if (record === undefined || record === null || !(record.bytes instanceof ArrayBuffer)) {
              resolve(null)
              return
            }
            resolve(new Uint8Array(record.bytes))
          }
          request.onerror = () => {
            reject(request.error ?? new Error('character-pack IndexedDB read failed'))
          }
        } catch (error) {
          reject(error)
        }
      })
    },
    async write(path: string, bytes: Uint8Array): Promise<void> {
      assertStorePath(path)
      const copy = copyBytes(bytes)
      const db = await database()
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(CHARACTER_PACK_STORE_NAME, 'readwrite')
          const record: StoredFileRecord = { path, bytes: copy.buffer as ArrayBuffer }
          transaction.objectStore(CHARACTER_PACK_STORE_NAME).put(record)
          transaction.oncomplete = () => {
            resolve()
          }
          transaction.onerror = () => {
            reject(transaction.error ?? new Error('character-pack IndexedDB write failed'))
          }
          transaction.onabort = () => {
            reject(transaction.error ?? new Error('character-pack IndexedDB write aborted'))
          }
        } catch (error) {
          reject(error)
        }
      })
    },
    async remove(path: string): Promise<void> {
      assertStorePath(path)
      const db = await database()
      return new Promise((resolve, reject) => {
        try {
          const transaction = db.transaction(CHARACTER_PACK_STORE_NAME, 'readwrite')
          const objectStore = transaction.objectStore(CHARACTER_PACK_STORE_NAME)
          const keys = objectStore.getAllKeys()
          keys.onsuccess = () => {
            const all = Array.isArray(keys.result) ? keys.result : []
            const prefix = path + '/'
            for (const key of all) {
              if (typeof key === 'string' && (key === path || key.startsWith(prefix))) objectStore.delete(key)
            }
          }
          keys.onerror = () => {
            reject(keys.error ?? new Error('character-pack IndexedDB remove lookup failed'))
          }
          transaction.oncomplete = () => {
            resolve()
          }
          transaction.onerror = () => {
            reject(transaction.error ?? new Error('character-pack IndexedDB remove failed'))
          }
          transaction.onabort = () => {
            reject(transaction.error ?? new Error('character-pack IndexedDB remove aborted'))
          }
        } catch (error) {
          reject(error)
        }
      })
    },
  }
}

function resolveIdbFactory(factory?: IDBFactory | null): IDBFactory | null {
  if (factory !== undefined) return factory
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB
  } catch {
    return null
  }
}

/**
 * Open the character-pack file store. Uses IndexedDB when available and falls
 * back to the in-memory store when IndexedDB is missing, blocked, in private
 * mode or fails to open; it never throws for those conditions (files then last
 * only for the current session, which the UI states honestly).
 */
export async function openCharacterPackFileStore(
  options: CharacterPackFileStoreOptions = {},
): Promise<CharacterPackFileStore> {
  const factory = resolveIdbFactory(options.factory)
  if (factory === null) return createMemoryCharacterPackFileStore()
  const store = createIdbCharacterPackFileStore(factory, options.dbName ?? CHARACTER_PACK_STORE_DB)
  const db = await store.ready
  if (db === null) return createMemoryCharacterPackFileStore()
  return store
}
