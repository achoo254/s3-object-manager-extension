import { base64ToBytes, bytesToBase64 } from '@/core/util/base64';

/**
 * Passphrase-based encryption for the vault: PBKDF2-SHA256 derives an AES-GCM key,
 * every write uses a fresh random IV.
 */

export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export interface KdfParams {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
}

/** What `chrome.storage.local` holds: only ciphertext and the parameters to re-derive the key. */
export interface VaultEnvelope {
  version: 1;
  kdfParams: KdfParams;
  salt: string;
  iv: string;
  ciphertext: string;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase');
    this.name = 'WrongPassphraseError';
  }
}

export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SALT_BYTES));
}

export function defaultKdfParams(): KdfParams {
  return { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS };
}

/** Derives the AES key and returns its raw bytes, which is what the session keeps. */
export async function deriveKeyBytes(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  kdfParams: KdfParams,
): Promise<Uint8Array<ArrayBuffer>> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: kdfParams.hash, salt, iterations: kdfParams.iterations },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

/** Each use imports the raw bytes as a non-extractable key. */
function importAesKey(keyBytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJson(
  keyBytes: Uint8Array<ArrayBuffer>,
  salt: Uint8Array<ArrayBuffer>,
  kdfParams: KdfParams,
  data: unknown,
): Promise<VaultEnvelope> {
  const key = await importAesKey(keyBytes);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    version: 1,
    kdfParams,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

/** Throws `WrongPassphraseError` when the key does not authenticate the ciphertext. */
export async function decryptJson(
  keyBytes: Uint8Array<ArrayBuffer>,
  envelope: VaultEnvelope,
): Promise<unknown> {
  const key = await importAesKey(keyBytes);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.ciphertext),
    );
  } catch {
    throw new WrongPassphraseError();
  }
  return JSON.parse(new TextDecoder().decode(plaintext));
}
