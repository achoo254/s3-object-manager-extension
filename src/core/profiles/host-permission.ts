import { browser } from 'wxt/browser';
import type { ConnectionProfile } from './profile.types';

type EndpointShape = Pick<ConnectionProfile, 'endpoint' | 'addressing'>;

/** Hosts that cannot take a `*.` wildcard (and have no `<bucket>.` subdomains anyway). */
function isLocalOrIp(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    (hostname.startsWith('[') && hostname.endsWith(']'))
  );
}

/**
 * Host match pattern a profile needs. Virtual-hosted addressing sends requests to
 * `<bucket>.<host>`, so it needs the subdomain wildcard (which also matches the host itself).
 * Patterns carry no port: a pattern without a port matches every port.
 */
export function hostPatternFor(profile: EndpointShape): string {
  const url = new URL(profile.endpoint);
  const wildcard = profile.addressing === 'virtual' && !isLocalOrIp(url.hostname);
  return `${url.protocol}//${wildcard ? `*.${url.hostname}` : url.hostname}/*`;
}

/** Whether `pattern` (as built by `hostPatternFor`) grants access to `profile`'s requests. */
export function patternCovers(pattern: string, profile: EndpointShape): boolean {
  const match = /^(\w+:)\/\/(\*\.)?([^/]+)\/\*$/.exec(pattern);
  if (!match) return false;
  const [, scheme, wildcard, host] = match;
  const url = new URL(profile.endpoint);
  if (url.protocol !== scheme) return false;
  if (url.hostname === host) return true;
  return Boolean(wildcard) && url.hostname.endsWith(`.${host}`);
}

export function hasHostPermission(profile: EndpointShape): Promise<boolean> {
  return browser.permissions.contains({ origins: [hostPatternFor(profile)] });
}

/**
 * Must be called directly from a user action (click), before any other await. Resolves
 * `false` when the user declines or the browser refuses the pattern.
 */
export async function requestHostPermission(profile: EndpointShape): Promise<boolean> {
  try {
    return await browser.permissions.request({ origins: [hostPatternFor(profile)] });
  } catch {
    return false;
  }
}

/** Drops `removed`'s host access unless a remaining profile still relies on it. */
export async function releaseHostPermission(
  removed: EndpointShape,
  remaining: readonly EndpointShape[],
): Promise<void> {
  const pattern = hostPatternFor(removed);
  if (remaining.some((profile) => patternCovers(pattern, profile))) return;
  await browser.permissions.remove({ origins: [pattern] });
}

/** Revokes every host access granted at runtime (used when the vault is deleted). */
export async function releaseAllHostPermissions(): Promise<void> {
  const granted = (await browser.permissions.getAll()).origins ?? [];
  const required = new Set(browser.runtime.getManifest().host_permissions ?? []);
  const optional = granted.filter((origin) => !required.has(origin));
  if (optional.length) await browser.permissions.remove({ origins: optional });
}
