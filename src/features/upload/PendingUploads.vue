<script setup lang="ts">
import type { S3Client } from '@aws-sdk/client-s3';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { isSupported, withCapability } from '@/core/s3/capabilities';
import {
  abortUpload,
  listServerUploads,
  type ServerUpload,
} from '@/core/upload/multipart-uploader';
import type { UploadState } from '@/core/upload/upload-state-store';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { formatBytes, formatDateTime } from '@/features/shared/format';
import { useNotify } from '@/features/shared/use-notify';
import { useUploadQueue } from './use-upload-queue';

const props = defineProps<{ client: S3Client; profileId: string; bucket: string }>();
const open = defineModel<boolean>({ required: true });
const { t, locale } = useI18n();
const queue = useUploadQueue();
const { notify } = useNotify();

/** Every saved upload state (all profiles), to recognise server uploads this browser started. */
const saved = ref<UploadState[]>([]);
/** Saved uploads of this profile that are not currently uploading in the queue. */
const local = computed(() =>
  saved.value.filter((state) => {
    const job = queue.jobForState(state.id);
    return (
      state.profileId === props.profileId && job?.status !== 'running' && job?.status !== 'queued'
    );
  }),
);
const server = ref<ServerUpload[]>([]);
const loading = ref(false);
const error = ref<unknown>();
const fileInput = ref<HTMLInputElement>();
const resuming = ref<UploadState>();
const canListServer = computed(() => isSupported(props.profileId, 'listMultipartUploads'));

/** Server uploads this browser does not know about (started elsewhere or state lost). */
const orphans = computed(() => {
  const known = new Set(saved.value.map((state) => state.uploadId));
  return server.value.filter((upload) => !known.has(upload.uploadId));
});

async function load() {
  loading.value = true;
  error.value = undefined;
  try {
    saved.value = await queue.store.list();
    if (canListServer.value) {
      server.value = await withCapability(props.profileId, 'listMultipartUploads', () =>
        listServerUploads(props.client, props.bucket),
      );
    }
  } catch (e) {
    error.value = e;
  } finally {
    loading.value = false;
  }
}

/** The browser cannot reopen a file by itself: the user picks the same file again. */
function pickFor(state: UploadState) {
  resuming.value = state;
  fileInput.value?.click();
}

function onPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const state = resuming.value;
  if (!file || !state) return;
  const same =
    file.name === state.file.name &&
    file.size === state.file.size &&
    file.lastModified === state.file.lastModified;
  if (!same) {
    notify('upload.pending.wrongFile', { name: state.file.name }, 'error');
    return;
  }
  queue.enqueue(state.profileId, state.bucket, [{ file, key: state.key }]);
  open.value = false;
}

async function discard(upload: { bucket: string; key: string; uploadId: string; id?: string }) {
  try {
    // A paused queue job for this upload is cancelled with it, so it cannot restart later.
    const job = upload.id ? queue.jobForState(upload.id) : undefined;
    if (job) await queue.cancel(job);
    else await abortUpload(props.client, upload, queue.store);
    await load();
  } catch (e) {
    error.value = e;
  }
}

watch(open, (isOpen) => {
  if (isOpen) void load();
});
</script>

<template>
  <v-dialog v-model="open" max-width="720" scrollable>
    <v-card :title="t('upload.pending.title')" :loading="loading">
      <v-card-text>
        <h3 class="text-subtitle-1">{{ t('upload.pending.local') }}</h3>
        <p class="text-body-2 mb-2">{{ t('upload.pending.localHint') }}</p>
        <v-list v-if="local.length" density="compact" lines="two">
          <v-list-item
            v-for="state in local"
            :key="state.id"
            :title="`${state.bucket}/${state.key}`"
            :subtitle="
              t('upload.pending.localItem', {
                file: state.file.name,
                size: formatBytes(state.file.size, locale),
                done: formatBytes(state.parts.length * state.partSize, locale),
              })
            "
          >
            <template #append>
              <v-btn size="small" variant="tonal" color="primary" @click="pickFor(state)">
                {{ t('upload.pending.pickFile') }}
              </v-btn>
              <v-btn size="small" variant="text" color="error" @click="discard({ ...state })">
                {{ t('upload.actions.cancel') }}
              </v-btn>
            </template>
          </v-list-item>
        </v-list>
        <p v-else class="text-medium-emphasis">{{ t('upload.pending.none') }}</p>

        <template v-if="canListServer">
          <h3 class="text-subtitle-1 mt-4">{{ t('upload.pending.server', { bucket }) }}</h3>
          <p class="text-body-2 mb-2">{{ t('upload.pending.serverHint') }}</p>
          <v-list v-if="orphans.length" density="compact">
            <v-list-item
              v-for="upload in orphans"
              :key="upload.uploadId"
              :title="upload.key"
              :subtitle="formatDateTime(upload.initiated, locale)"
            >
              <template #append>
                <v-btn
                  size="small"
                  variant="text"
                  color="error"
                  @click="discard({ bucket, ...upload })"
                >
                  {{ t('upload.pending.discard') }}
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
          <p v-else class="text-medium-emphasis">{{ t('upload.pending.none') }}</p>
        </template>
        <ErrorAlert :error="error" />
        <input ref="fileInput" type="file" hidden @change="onPicked" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
