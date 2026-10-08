<script setup lang="ts">
import type { S3Client } from '@aws-sdk/client-s3';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { deleteFolders, type DeleteResult } from '@/core/s3/operations/delete-objects';
import { collectKeys } from '@/core/s3/operations/list-keys';
import { isAbortError } from '@/core/s3/s3-error';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { useBusy } from '@/features/shared/use-busy';
import type { BrowserEntry } from './object-entry';

const props = defineProps<{ client: S3Client; bucket: string; entries: BrowserEntry[] }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();

type Step = 'counting' | 'countFailed' | 'confirm' | 'running' | 'result';
const step = ref<Step>('counting');
const keys = ref<string[]>([]);
const found = ref(0);
const progress = ref({ done: 0, total: 0 });
const result = ref<DeleteResult>();
const error = ref<unknown>();
const busy = useBusy();
let controller: AbortController | undefined;

/**
 * Expands folders to every object under them, so the confirmation shows the exact count.
 * Only a count that finished for the current selection can ever be confirmed.
 */
async function count() {
  step.value = 'counting';
  keys.value = [];
  error.value = undefined;
  result.value = undefined;
  found.value = 0;
  controller = new AbortController();
  try {
    const all: string[] = [];
    for (const entry of props.entries) {
      if (entry.kind === 'object') {
        all.push(entry.key);
      } else {
        const under = await collectKeys(props.client, props.bucket, entry.key, {
          signal: controller.signal,
          onProgress: (n) => (found.value = all.length + n),
        });
        all.push(...under.map((k) => k.key));
      }
      found.value = all.length;
    }
    keys.value = [...new Set(all)];
    step.value = 'confirm';
  } catch (e) {
    if (isAbortError(e)) {
      open.value = false;
      return;
    }
    error.value = e;
    step.value = 'countFailed';
  }
}

async function run() {
  step.value = 'running';
  controller = new AbortController();
  progress.value = { done: 0, total: keys.value.length };
  const finish = busy.begin();
  try {
    const folders = props.entries
      .filter((entry) => entry.kind === 'folder')
      .map((entry) => entry.key);
    result.value = await deleteFolders(props.client, props.bucket, folders, keys.value, {
      signal: controller.signal,
      onProgress: (done, total) => (progress.value = { done, total }),
    });
    if (result.value.failures.length === 0) {
      emit('done');
      open.value = false;
      return;
    }
  } catch (e) {
    error.value = e;
  } finally {
    finish();
  }
  step.value = 'result';
  emit('done');
}

watch(open, (isOpen) => {
  if (isOpen) void count();
  else controller?.abort();
});
</script>

<template>
  <v-dialog v-model="open" max-width="560" persistent>
    <v-card :title="t('delete.title')">
      <v-card-text>
        <p v-if="step === 'counting'">
          <v-progress-circular indeterminate size="18" class="mr-2" />
          {{ t('delete.counting', { count: found }) }}
        </p>
        <v-alert
          v-if="step === 'confirm' && !error"
          type="error"
          variant="tonal"
          data-testid="delete-count"
        >
          {{ t('delete.confirm', { count: keys.length }, keys.length) }}
        </v-alert>
        <div v-if="step === 'running'">
          <v-progress-linear
            :model-value="progress.total ? (progress.done / progress.total) * 100 : 0"
            color="error"
            height="8"
            rounded
          />
          <p class="text-body-2 mt-1">{{ t('delete.progress', progress) }}</p>
        </div>
        <template v-if="step === 'result' && result">
          <v-alert type="warning" variant="tonal">
            {{ t('delete.partial', { deleted: result.deleted, failed: result.failures.length }) }}
          </v-alert>
          <v-list density="compact" class="failures">
            <v-list-item
              v-for="failure in result.failures.slice(0, 100)"
              :key="failure.key"
              :title="failure.key"
              :subtitle="failure.code"
            />
          </v-list>
        </template>
        <ErrorAlert :error="error" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn v-if="step === 'running' || step === 'counting'" @click="controller?.abort()">{{
          t('common.stop')
        }}</v-btn>
        <v-btn v-else data-testid="delete-dismiss" @click="open = false">
          {{ step === 'result' ? t('common.close') : t('common.cancel') }}
        </v-btn>
        <v-btn
          v-if="step === 'confirm' && !error && keys.length > 0"
          color="error"
          variant="flat"
          data-testid="delete-confirm"
          @click="run"
        >
          {{ t('delete.run', { count: keys.length }, keys.length) }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.failures {
  max-height: 240px;
  overflow: auto;
}
</style>
