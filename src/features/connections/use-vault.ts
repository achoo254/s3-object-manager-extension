import type { S3Client } from '@aws-sdk/client-s3';
import { computed, ref } from 'vue';
import { browser } from 'wxt/browser';
import {
  hasHostPermission,
  hostPatternFor,
  releaseAllHostPermissions,
  releaseHostPermission,
} from '@/core/profiles/host-permission';
import {
  addProfile,
  listProfiles,
  removeProfile,
  updateProfile,
} from '@/core/profiles/profile-store';
import type { ConnectionProfile, ProfileInput } from '@/core/profiles/profile.types';
import { resetCapabilities } from '@/core/s3/capabilities';
import { createS3Client } from '@/core/s3/s3-client-factory';
import { recordActivity } from '@/core/vault/auto-lock';
import {
  createVault,
  destroyVault,
  hasVault,
  isUnlocked,
  lockVault,
  SESSION_KEY_STORAGE_KEY,
  unlockVault,
} from '@/core/vault/vault-store';

export type VaultStatus = 'loading' | 'absent' | 'locked' | 'unlocked';

const status = ref<VaultStatus>('loading');
const profiles = ref<ConnectionProfile[]>([]);
const activeProfileId = ref<string>();
/** Origin access per profile id; `undefined` until checked. */
const hostAccess = ref<Record<string, boolean>>({});
const clients = new Map<string, { profile: ConnectionProfile; client: S3Client }>();

const activeProfile = computed(() =>
  profiles.value.find((profile) => profile.id === activeProfileId.value),
);

function forgetSecrets(): void {
  profiles.value = [];
  activeProfileId.value = undefined;
  hostAccess.value = {};
  clients.clear();
  resetCapabilities();
}

let refreshGeneration = 0;

/** Re-reads the vault state; an older refresh finishing late never overwrites a newer one. */
async function refresh(): Promise<void> {
  const current = ++refreshGeneration;
  const exists = await hasVault();
  const unlocked = exists && (await isUnlocked());
  const list = unlocked ? await listProfiles().catch(() => undefined) : undefined;
  if (current !== refreshGeneration) return;
  if (!exists) {
    forgetSecrets();
    status.value = 'absent';
  } else if (!unlocked || !list) {
    forgetSecrets();
    status.value = 'locked';
  } else {
    profiles.value = list;
    if (!profiles.value.some((profile) => profile.id === activeProfileId.value)) {
      activeProfileId.value = undefined;
    }
    status.value = 'unlocked';
    await refreshHostAccess();
  }
}

async function refreshHostAccess(): Promise<void> {
  const entries = await Promise.all(
    profiles.value.map(async (profile) => [profile.id, await hasHostPermission(profile)] as const),
  );
  hostAccess.value = Object.fromEntries(entries);
}

let watching = false;
function watchStorage(): void {
  if (watching) return;
  watching = true;
  // Another tab (or the auto-lock) may lock, unlock or edit the vault.
  browser.storage.onChanged.addListener((changes, area) => {
    if (
      (area === 'session' && SESSION_KEY_STORAGE_KEY in changes) ||
      (area === 'local' && 'vault' in changes)
    ) {
      void refresh();
    }
  });
  browser.permissions.onAdded.addListener(() => void refreshHostAccess());
  browser.permissions.onRemoved.addListener(() => void refreshHostAccess());
}

/** One cached client per profile, rebuilt when the profile changes. */
function clientFor(profile: ConnectionProfile): S3Client {
  const cached = clients.get(profile.id);
  if (cached && JSON.stringify(cached.profile) === JSON.stringify(profile)) return cached.client;
  const client = createS3Client(profile);
  clients.set(profile.id, { profile, client });
  return client;
}

export function useVault() {
  return {
    status,
    profiles,
    activeProfile,
    activeProfileId,
    hostAccess,
    async init() {
      watchStorage();
      await refresh();
    },
    async create(passphrase: string) {
      await createVault(passphrase);
      await recordActivity();
      await refresh();
    },
    async unlock(passphrase: string) {
      await unlockVault(passphrase);
      await recordActivity();
      await refresh();
    },
    async lock() {
      await lockVault();
      forgetSecrets();
      status.value = 'locked';
    },
    /** Called by the auto-lock after it locked the vault. */
    markLocked() {
      forgetSecrets();
      void refresh();
    },
    async reset() {
      await destroyVault();
      // The profiles are gone (and could not be read without the passphrase anyway), so no
      // endpoint keeps the access it was granted for them.
      await releaseAllHostPermissions();
      await refresh();
    },
    async saveProfile(input: ProfileInput, id?: string): Promise<ConnectionProfile> {
      let saved: ConnectionProfile;
      if (id) {
        const previous = profiles.value.find((profile) => profile.id === id);
        saved = { ...input, id };
        await updateProfile(saved);
        resetCapabilities(id);
        if (previous && hostPatternFor(previous) !== hostPatternFor(saved)) {
          const others = profiles.value.filter((profile) => profile.id !== id);
          await releaseHostPermission(previous, [...others, saved]);
        }
      } else {
        saved = await addProfile(input);
      }
      await refresh();
      return saved;
    },
    async deleteProfile(profile: ConnectionProfile) {
      const remaining = await removeProfile(profile.id);
      clients.delete(profile.id);
      await releaseHostPermission(profile, remaining);
      await refresh();
    },
    refreshHostAccess,
    clientFor,
  };
}
