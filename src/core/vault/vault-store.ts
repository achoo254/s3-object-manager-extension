import { browser } from 'wxt/browser';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import { base64ToBytes, bytesToBase64 } from '@/core/util/base64';
import {
  decryptJson,
  defaultKdfParams,
  deriveKeyBytes,
  encryptJson,
  randomSalt,
  type VaultEnvelope,
} from './vault-crypto';

/** `chrome.storage.local` key holding the encrypted vault. */
const VAULT_STORAGE_KEY = 'vault';
/**
 * `chrome.storage.session` key holding the unlocked AES key as raw bytes. Session storage
 * lives in memory only and is cleared on browser restart and extension reload or update.
 */
export const SESSION_KEY_STORAGE_KEY = 'vaultKey';

export interface VaultContents {
  profiles: ConnectionProfile[];
}

export class VaultLockedError extends Error {
  constructor() {
    super('Vault is locked');
    this.name = 'VaultLockedError';
  }
}

async function readEnvelope(): Promise<VaultEnvelope | undefined> {
  const stored = await browser.storage.local.get(VAULT_STORAGE_KEY);
  return stored[VAULT_STORAGE_KEY] as VaultEnvelope | undefined;
}

async function readSessionKey(): Promise<Uint8Array<ArrayBuffer> | undefined> {
  const stored = await browser.storage.session.get(SESSION_KEY_STORAGE_KEY);
  const value = stored[SESSION_KEY_STORAGE_KEY];
  return typeof value === 'string' ? base64ToBytes(value) : undefined;
}

export async function hasVault(): Promise<boolean> {
  return (await readEnvelope()) !== undefined;
}

export async function isUnlocked(): Promise<boolean> {
  return (await readSessionKey()) !== undefined;
}

/** Creates an empty vault protected by `passphrase` and leaves it unlocked. */
export async function createVault(passphrase: string): Promise<void> {
  if (await hasVault()) throw new Error('Vault already exists');
  const salt = randomSalt();
  const kdfParams = defaultKdfParams();
  const keyBytes = await deriveKeyBytes(passphrase, salt, kdfParams);
  const empty: VaultContents = { profiles: [] };
  const envelope = await encryptJson(keyBytes, salt, kdfParams, empty);
  await browser.storage.local.set({ [VAULT_STORAGE_KEY]: envelope });
  await browser.storage.session.set({ [SESSION_KEY_STORAGE_KEY]: bytesToBase64(keyBytes) });
}

/** Throws `WrongPassphraseError` when the passphrase does not open the vault. */
export async function unlockVault(passphrase: string): Promise<void> {
  const envelope = await readEnvelope();
  if (!envelope) throw new Error('No vault to unlock');
  const keyBytes = await deriveKeyBytes(
    passphrase,
    base64ToBytes(envelope.salt),
    envelope.kdfParams,
  );
  await decryptJson(keyBytes, envelope);
  await browser.storage.session.set({ [SESSION_KEY_STORAGE_KEY]: bytesToBase64(keyBytes) });
}

export async function lockVault(): Promise<void> {
  await browser.storage.session.remove(SESSION_KEY_STORAGE_KEY);
}

export async function readVault(): Promise<VaultContents> {
  const keyBytes = await readSessionKey();
  const envelope = await readEnvelope();
  if (!keyBytes || !envelope) throw new VaultLockedError();
  return (await decryptJson(keyBytes, envelope)) as VaultContents;
}

export async function writeVault(contents: VaultContents): Promise<void> {
  const keyBytes = await readSessionKey();
  const envelope = await readEnvelope();
  if (!keyBytes || !envelope) throw new VaultLockedError();
  const next = await encryptJson(
    keyBytes,
    base64ToBytes(envelope.salt),
    envelope.kdfParams,
    contents,
  );
  await browser.storage.local.set({ [VAULT_STORAGE_KEY]: next });
}

/** The only way out of a forgotten passphrase: drop the vault and start over. */
export async function destroyVault(): Promise<void> {
  await lockVault();
  await browser.storage.local.remove(VAULT_STORAGE_KEY);
}
