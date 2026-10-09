import { browser } from 'wxt/browser';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import { base64ToBytes, bytesToBase64 } from '@/core/util/base64';
import { decryptJson, encryptJson, randomKeyBytes, type CipherEnvelope } from './local-cipher';

/**
 * Saved connections live in `chrome.storage.local`, which survives browser restarts and
 * extension updates (as long as the extension ID stays the same). They are usable right
 * away: no passphrase. See local-cipher.ts for what the encryption does and does not do.
 */
const CONNECTIONS_KEY = 'connections';
const DEVICE_KEY = 'deviceKey';
/** Passphrase vault of earlier pre-releases; it cannot be opened any more and is dropped. */
const LEGACY_VAULT_KEYS = ['vault'];

interface StoredConnections {
  profiles: ConnectionProfile[];
}

async function deviceKey(): Promise<Uint8Array<ArrayBuffer>> {
  const stored = await browser.storage.local.get(DEVICE_KEY);
  const value = stored[DEVICE_KEY];
  if (typeof value === 'string') return base64ToBytes(value);
  const key = randomKeyBytes();
  await browser.storage.local.set({ [DEVICE_KEY]: bytesToBase64(key) });
  return key;
}

export async function readConnections(): Promise<ConnectionProfile[]> {
  const stored = await browser.storage.local.get([CONNECTIONS_KEY, ...LEGACY_VAULT_KEYS]);
  if (LEGACY_VAULT_KEYS.some((key) => key in stored)) {
    await browser.storage.local.remove(LEGACY_VAULT_KEYS);
  }
  const envelope = stored[CONNECTIONS_KEY] as CipherEnvelope | undefined;
  if (!envelope) return [];
  const data = (await decryptJson(await deviceKey(), envelope)) as StoredConnections;
  return data.profiles;
}

export async function writeConnections(profiles: ConnectionProfile[]): Promise<void> {
  const envelope = await encryptJson(await deviceKey(), { profiles } satisfies StoredConnections);
  await browser.storage.local.set({ [CONNECTIONS_KEY]: envelope });
}

/** Storage keys whose change means the saved connections changed (e.g. in another tab). */
export const CONNECTION_STORAGE_KEYS = [CONNECTIONS_KEY];
