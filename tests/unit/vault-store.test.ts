import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { WrongPassphraseError } from '@/core/vault/vault-crypto';
import {
  createVault,
  destroyVault,
  hasVault,
  isUnlocked,
  lockVault,
  readVault,
  unlockVault,
  VaultLockedError,
  writeVault,
} from '@/core/vault/vault-store';
import type { ConnectionProfile } from '@/core/profiles/profile.types';

const profile: ConnectionProfile = {
  id: 'p1',
  name: 'Local',
  endpoint: 'http://localhost:8333',
  region: 'us-east-1',
  addressing: 'path',
  accessKeyId: 'AKID',
  secretAccessKey: 'very-secret-key',
};

describe('vault-store', () => {
  beforeEach(() => fakeBrowser.reset());

  it('keeps only ciphertext in local storage and the key in session storage', async () => {
    await createVault('passphrase');
    await writeVault({ profiles: [profile] });
    const local = await fakeBrowser.storage.local.get(null);
    expect(JSON.stringify(local)).not.toContain('very-secret-key');
    expect(JSON.stringify(local)).not.toContain('AKID');
    expect(await isUnlocked()).toBe(true);
    expect((await readVault()).profiles).toEqual([profile]);
  }, 20_000);

  it('cannot be read after locking (as after a browser restart) until unlocked again', async () => {
    await createVault('passphrase');
    await writeVault({ profiles: [profile] });
    await lockVault();
    await expect(readVault()).rejects.toBeInstanceOf(VaultLockedError);
    await expect(unlockVault('wrong')).rejects.toBeInstanceOf(WrongPassphraseError);
    expect(await isUnlocked()).toBe(false);
    await unlockVault('passphrase');
    expect((await readVault()).profiles).toEqual([profile]);
  }, 20_000);

  it('destroying the vault is the way out of a forgotten passphrase', async () => {
    await createVault('passphrase');
    await destroyVault();
    expect(await hasVault()).toBe(false);
    expect(await isUnlocked()).toBe(false);
  }, 20_000);
});
