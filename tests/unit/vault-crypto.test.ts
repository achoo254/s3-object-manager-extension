import { describe, expect, it } from 'vitest';
import {
  decryptJson,
  deriveKeyBytes,
  encryptJson,
  PBKDF2_ITERATIONS,
  randomSalt,
  WrongPassphraseError,
  type KdfParams,
} from '@/core/vault/vault-crypto';

// Fewer iterations keep the test fast; the production default is asserted separately.
const fastKdf: KdfParams = { name: 'PBKDF2', hash: 'SHA-256', iterations: 1_000 };

describe('vault-crypto', () => {
  it('uses 600,000 PBKDF2 iterations by default', () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
  });

  it('decrypts what it encrypted', async () => {
    const salt = randomSalt();
    const key = await deriveKeyBytes('correct horse', salt, fastKdf);
    const data = { profiles: [{ id: '1', secretAccessKey: 's3cr3t' }] };
    const envelope = await encryptJson(key, salt, fastKdf, data);
    await expect(decryptJson(key, envelope)).resolves.toEqual(data);
  });

  it('stores only ciphertext, never the plaintext', async () => {
    const salt = randomSalt();
    const key = await deriveKeyBytes('pass', salt, fastKdf);
    const envelope = await encryptJson(key, salt, fastKdf, { secret: 'very-secret-value' });
    expect(JSON.stringify(envelope)).not.toContain('very-secret-value');
    expect(Object.keys(envelope).sort()).toEqual([
      'ciphertext',
      'iv',
      'kdfParams',
      'salt',
      'version',
    ]);
  });

  it('rejects a wrong passphrase with a clear error and no data', async () => {
    const salt = randomSalt();
    const key = await deriveKeyBytes('right', salt, fastKdf);
    const envelope = await encryptJson(key, salt, fastKdf, { secret: 1 });
    const wrongKey = await deriveKeyBytes('wrong', salt, fastKdf);
    await expect(decryptJson(wrongKey, envelope)).rejects.toBeInstanceOf(WrongPassphraseError);
  });

  it('uses a different IV for every write', async () => {
    const salt = randomSalt();
    const key = await deriveKeyBytes('pass', salt, fastKdf);
    const first = await encryptJson(key, salt, fastKdf, { a: 1 });
    const second = await encryptJson(key, salt, fastKdf, { a: 1 });
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('derives the same key from the same passphrase and salt', async () => {
    const salt = randomSalt();
    const a = await deriveKeyBytes('pass', salt, fastKdf);
    const b = await deriveKeyBytes('pass', salt, fastKdf);
    expect(a).toEqual(b);
    expect(a.byteLength).toBe(32);
  });
});
