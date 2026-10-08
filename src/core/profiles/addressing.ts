import type { Addressing, ConnectionProfile } from './profile.types';

/** `localhost` and IP addresses have no `<bucket>.` subdomains, so only path-style works there. */
export function isLocalOrIpHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    (hostname.startsWith('[') && hostname.endsWith(']'))
  );
}

/** The addressing actually used: virtual-hosted falls back to path-style where it cannot work. */
export function effectiveAddressing(
  profile: Pick<ConnectionProfile, 'endpoint' | 'addressing'>,
): Addressing {
  try {
    return isLocalOrIpHost(new URL(profile.endpoint).hostname) ? 'path' : profile.addressing;
  } catch {
    return profile.addressing;
  }
}
