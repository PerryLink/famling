/**
 * Browser fallback for at-rest memory encryption.
 *
 * The AES-GCM key is generated with extractable=false and stored in IndexedDB.
 * localStorage only ever receives ciphertext. This protects against casual
 * profile/localStorage inspection; it does not protect against XSS or a process
 * running as the same user (neither does DPAPI fully). If the browser profile is
 * cleared, the key is gone and memory is unrecoverable by design.
 */
export interface WebCryptoPayload {
  v: 1
  p: 'webcrypto'
  iv: string
  data: string
}

const DB_NAME = 'pagefold-vault'
const STORE = 'keys'
const KEY_ID = 'pet-memory'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!('indexedDB' in globalThis)) return Promise.reject(new Error('indexeddb-unavailable'))
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('indexeddb-open-failed'))
    })
  }
  return dbPromise
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('indexeddb-request-failed'))
  })
}

async function getOrCreateKey(): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('webcrypto-unavailable')
  const db = await openDb()
  const existing = await requestToPromise<CryptoKey | undefined>(
    db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID),
  )
  if (existing) return existing
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  await requestToPromise(db.transaction(STORE, 'readwrite').objectStore(STORE).put(key, KEY_ID))
  return key
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

const base64ToBytes = (text: string): Uint8Array => {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function encryptMemory(plain: string): Promise<WebCryptoPayload> {
  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plain),
  )
  return { v: 1, p: 'webcrypto', iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) }
}

export async function decryptMemory(payload: WebCryptoPayload): Promise<string> {
  if (payload.v !== 1 || payload.p !== 'webcrypto') throw new Error('unsupported-memory-cipher')
  const key = await getOrCreateKey()
  const iv = base64ToBytes(payload.iv)
  const data = base64ToBytes(payload.data)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    data as BufferSource,
  )
  return new TextDecoder().decode(plain)
}
