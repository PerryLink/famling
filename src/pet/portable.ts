/**
 * Portable, passphrase-protected pet save. Works in both Tauri and browsers:
 * PBKDF2-SHA256 derives an AES-GCM key; the ciphertext is a plain JSON file.
 * There is no recovery if the passphrase is lost.
 *
 * CONSENT / TOS GATE (do not bypass): `importPortable()` is a user-content
 * import entry. Every caller MUST first obtain a FRESH full-TOS consent for this
 * specific import through `importPortableWithConsent()` in
 * `src/pet/consent/content.ts` (which calls `requireAction` on the consent
 * gate). An earlier first-run acceptance or audit entry is never a waiver:
 * each import re-shows the full disclaimer. Declining must abort before this
 * function runs (no decrypt, no state replace, no disk write).
 *
 * Mod/DLC authors: keep this gate and the disclaimer, and do not add a direct
 * call path to this function that skips consent.
 *
 * PBKDF2 iterations: 600,000 (OWASP recommendation for PBKDF2-SHA256). It runs
 * only on explicit export/import, and the iteration count is versioned in the
 * payload so it can be raised again without breaking old files.
 */
/** Stable consent action id for a portable-save import (see consent/terms.ts). */
export const PORTABLE_IMPORT_ACTION = 'content.save-import'

export interface PortableSave {
  format: 'pagefold-portable'
  v: 1
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  cipher: { name: 'AES-GCM'; iv: string; data: string }
}

const ITERATIONS = 600_000
const MIN_PASSPHRASE = 8
const MAX_PASSPHRASE = 256

const b64 = (bytes: Uint8Array): string => {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}
const unb64 = (text: string): Uint8Array => {
  const binary = atob(text)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  if (!globalThis.crypto?.subtle) throw new Error('webcrypto-unavailable')
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function exportPortable(plain: string, passphrase: string): Promise<PortableSave> {
  if (passphrase.length < MIN_PASSPHRASE) throw new Error(`passphrase-too-short (min ${MIN_PASSPHRASE})`)
  if (passphrase.length > MAX_PASSPHRASE) throw new Error('passphrase-too-long')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain))
  return {
    format: 'pagefold-portable',
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
    cipher: { name: 'AES-GCM', iv: b64(iv), data: b64(new Uint8Array(data)) },
  }
}

export async function importPortable(file: unknown, passphrase: string): Promise<string> {
  const payload = file as Partial<PortableSave>
  if (!payload || payload.format !== 'pagefold-portable' || payload.v !== 1) throw new Error('unsupported-portable-save')
  if (!payload.kdf || payload.kdf.name !== 'PBKDF2' || payload.kdf.hash !== 'SHA-256') throw new Error('unsupported-kdf')
  if (!payload.cipher || payload.cipher.name !== 'AES-GCM') throw new Error('unsupported-cipher')
  const iterations = Number(payload.kdf.iterations)
  if (!Number.isInteger(iterations) || iterations < 10_000 || iterations > 2_000_000) throw new Error('unsupported-kdf-iterations')
  if (passphrase.length < MIN_PASSPHRASE) throw new Error('passphrase-too-short')
  const salt = unb64(payload.kdf.salt)
  const iv = unb64(payload.cipher.iv)
  const key = await deriveKey(passphrase, salt, iterations)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    unb64(payload.cipher.data) as BufferSource,
  )
  return new TextDecoder().decode(plain)
}
