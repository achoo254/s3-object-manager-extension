import type { S3Client } from '@aws-sdk/client-s3';
import { computed, ref } from 'vue';
import { browser } from 'wxt/browser';
import {
  hasHostPermission,
  hostPatternFor,
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
import { CONNECTION_STORAGE_KEYS } from '@/core/storage/connection-storage';

const ready = ref(false);
const profiles = ref<ConnectionProfile[]>([]);
const activeProfileId = ref<string>();
/** Origin access per profile id; `undefined` until checked. */
const hostAccess = ref<Record<string, boolean>>({});
const clients = new Map<string, { profile: ConnectionProfile; client: S3Client }>();

const activeProfile = computed(() =>
  profiles.value.find((profile) => profile.id === activeProfileId.value),
);

let refreshGeneration = 0;

/** Re-reads saved connections; an older refresh finishing late never overwrites a newer one. */
async function refresh(): Promise<void> {
  const current = ++refreshGeneration;
  const list = await listProfiles();
  if (current !== refreshGeneration) return;
  profiles.value = list;
  if (!list.some((profile) => profile.id === activeProfileId.value)) {
    activeProfileId.value = undefined;
  }
  ready.value = true;
  await refreshHostAccess();
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
  // Another manager tab may add, edit or delete connections.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && CONNECTION_STORAGE_KEYS.some((key) => key in changes)) {
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

export function useConnections() {
  return {
    ready,
    profiles,
    activeProfile,
    activeProfileId,
    hostAccess,
    async init() {
      watchStorage();
      await refresh();
    },
    async saveProfile(input: ProfileInput, id?: string): Promise<ConnectionProfile> {
      let saved: ConnectionProfile;
      if (id) {
        const previous = profiles.value.find((profile) => profile.id === id);
        saved = { ...input, id };
        await updateProfile(saved);
        resetCapabilities(id);
        clients.delete(id);
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
