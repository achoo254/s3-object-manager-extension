import { base64ToBytes, bytesToBase64 } from '@/core/util/base64';

/**
 * AES-GCM with a random key kept next to the data. This only keeps raw browser storage from
 * being readable at a glance; anyone who can read the browser profile can decrypt it.
 */

export interface CipherEnvelope {
  version: 1;
  iv: string;
  ciphertext: string;
}

const IV_BYTES = 12;

export function randomKeyBytes(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

function importKey(keyBytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptJson(
  keyBytes: Uint8Array<ArrayBuffer>,
  data: unknown,
): Promise<CipherEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await importKey(keyBytes),
    new TextEncoder().encode(JSON.stringify(data)),
  );
  return {
    version: 1,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptJson(
  keyBytes: Uint8Array<ArrayBuffer>,
  envelope: CipherEnvelope,
): Promise<unknown> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
    await importKey(keyBytes),
    base64ToBytes(envelope.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}
