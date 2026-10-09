import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import {
  addProfile,
  listProfiles,
  removeProfile,
  updateProfile,
} from '@/core/profiles/profile-store';
import { readConnections, writeConnections } from '@/core/storage/connection-storage';
import { decryptJson, encryptJson, randomKeyBytes } from '@/core/storage/local-cipher';

const input: Omit<ConnectionProfile, 'id'> = {
  name: 'Local',
  endpoint: 'http://localhost:8333',
  region: 'us-east-1',
  addressing: 'path',
  accessKeyId: 'AKIDVISIBLE',
  secretAccessKey: 'very-secret-key',
};

describe('connection storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('saves connections that are usable right away, with no passphrase', async () => {
    const saved = await addProfile(input);
    expect(await listProfiles()).toEqual([saved]);
    await updateProfile({ ...saved, name: 'Renamed' });
    expect((await listProfiles())[0]?.name).toBe('Renamed');
    expect(await removeProfile(saved.id)).toEqual([]);
  });

  it('keeps raw storage from showing keys in clear text', async () => {
    await addProfile(input);
    const raw = JSON.stringify(await fakeBrowser.storage.local.get(null));
    expect(raw).not.toContain('very-secret-key');
    expect(raw).not.toContain('AKIDVISIBLE');
  });

  it('survives what clears session storage (browser restart, extension update)', async () => {
    await addProfile(input);
    await fakeBrowser.storage.session.clear();
    expect(await listProfiles()).toHaveLength(1);
  });

  it('drops the passphrase vault of earlier pre-releases', async () => {
    await fakeBrowser.storage.local.set({ vault: { version: 1, ciphertext: 'old' } });
    expect(await readConnections()).toEqual([]);
    expect(await fakeBrowser.storage.local.get('vault')).toEqual({});
  });

  it('starts empty and round-trips through the cipher', async () => {
    expect(await readConnections()).toEqual([]);
    await writeConnections([{ ...input, id: 'a' }]);
    expect(await readConnections()).toEqual([{ ...input, id: 'a' }]);
    const key = randomKeyBytes();
    const envelope = await encryptJson(key, { x: 1 });
    const again = await encryptJson(key, { x: 1 });
    expect(envelope.iv).not.toBe(again.iv);
    await expect(decryptJson(key, envelope)).resolves.toEqual({ x: 1 });
  });
});
