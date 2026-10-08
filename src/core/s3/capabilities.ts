import { reactive } from 'vue';
import { httpStatusOf, s3ErrorCode } from './s3-error';

/**
 * Features a provider may not implement. When a call answers `NotImplemented` the feature is
 * hidden for that profile for the rest of the session instead of failing again and again.
 */
export type Capability = 'listBuckets' | 'copyObject' | 'listMultipartUploads';

const unsupported = reactive(new Map<string, Set<Capability>>());

export function isNotImplemented(error: unknown): boolean {
  return s3ErrorCode(error) === 'NotImplemented' || httpStatusOf(error) === 501;
}

export function isSupported(profileId: string, capability: Capability): boolean {
  return !unsupported.get(profileId)?.has(capability);
}

export function markUnsupported(profileId: string, capability: Capability): void {
  const set = unsupported.get(profileId) ?? new Set<Capability>();
  set.add(capability);
  unsupported.set(profileId, set);
}

/** Runs `operation`; a `NotImplemented` answer marks the capability unsupported and rethrows. */
export async function withCapability<T>(
  profileId: string,
  capability: Capability,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isNotImplemented(error)) markUnsupported(profileId, capability);
    throw error;
  }
}

export function resetCapabilities(profileId?: string): void {
  if (profileId) unsupported.delete(profileId);
  else unsupported.clear();
}
