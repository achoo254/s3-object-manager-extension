import { readVault, writeVault } from '@/core/vault/vault-store';
import type { Addressing, ConnectionProfile, ProfileInput } from './profile.types';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export type EndpointProblem = 'invalid' | 'unsupportedScheme' | 'insecureRemote';

/**
 * Normalises an endpoint URL to `scheme://host[:port][/path]` without trailing slash.
 * Plain http is only accepted for a local S3 server, matching the manifest's optional hosts.
 */
export function normalizeEndpoint(
  raw: string,
): { endpoint: string } | { problem: EndpointProblem } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { problem: 'invalid' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    return { problem: 'unsupportedScheme' };
  if (url.protocol === 'http:' && !LOCAL_HOSTS.has(url.hostname)) {
    return { problem: 'insecureRemote' };
  }
  if (url.search || url.hash || url.username || url.password) return { problem: 'invalid' };
  const path = url.pathname.replace(/\/+$/, '');
  return { endpoint: `${url.protocol}//${url.host}${path}` };
}

/** AWS endpoints default to virtual-hosted addressing; everything else to path-style. */
export function suggestAddressing(endpoint: string): Addressing {
  try {
    return new URL(endpoint).hostname.endsWith('.amazonaws.com') ? 'virtual' : 'path';
  } catch {
    return 'path';
  }
}

export async function listProfiles(): Promise<ConnectionProfile[]> {
  return (await readVault()).profiles;
}

export async function addProfile(input: ProfileInput): Promise<ConnectionProfile> {
  const vault = await readVault();
  const profile: ConnectionProfile = { ...input, id: crypto.randomUUID() };
  await writeVault({ ...vault, profiles: [...vault.profiles, profile] });
  return profile;
}

export async function updateProfile(profile: ConnectionProfile): Promise<void> {
  const vault = await readVault();
  await writeVault({
    ...vault,
    profiles: vault.profiles.map((existing) => (existing.id === profile.id ? profile : existing)),
  });
}

/** Removes the profile and returns the profiles that remain. */
export async function removeProfile(id: string): Promise<ConnectionProfile[]> {
  const vault = await readVault();
  const profiles = vault.profiles.filter((profile) => profile.id !== id);
  await writeVault({ ...vault, profiles });
  return profiles;
}
