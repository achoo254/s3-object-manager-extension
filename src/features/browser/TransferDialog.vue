<script setup lang="ts">
import { HeadObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  copyObject,
  moveObject,
  OverlappingTransferError,
  overlappingTargets,
  transferPrefix,
  type PrefixTransferResult,
} from '@/core/s3/operations/copy-object';
import { withCapability } from '@/core/s3/capabilities';
import { collectKeys } from '@/core/s3/operations/list-keys';
import { httpStatusOf, isAbortError } from '@/core/s3/s3-error';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import type { BrowserEntry } from './object-entry';

const props = defineProps<{
  client: S3Client;
  profileId: string;
  bucket: string;
  entry: BrowserEntry;
  mode: 'rename' | 'copy';
}>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();

type Step = 'edit' | 'counting' | 'confirm' | 'running' | 'result';
const step = ref<Step>('edit');
const target = ref('');
const error = ref<unknown>();
const sourceCount = ref(0);
const overwriteCount = ref(0);
const progress = ref({ done: 0, total: 0 });
const result = ref<PrefixTransferResult>();
let controller: AbortController | undefined;

const isFolder = computed(() => props.entry.kind === 'folder');
const normalizedTarget = computed(() => {
  const value = target.value.trim().replace(/^\/+/, '');
  if (!isFolder.value) return value;
  return value.endsWith('/') ? value : `${value}/`;
});
const targetProblem = computed(() => {
  const value = normalizedTarget.value;
  if (!value || value === '/') return t('transfer.problem.empty');
  if (value === props.entry.key) return t('transfer.problem.same');
  if (isFolder.value && value.startsWith(props.entry.key)) return t('transfer.problem.inside');
  // A key ending in `/` reads as a folder and would hide the object.
  if (!isFolder.value && value.endsWith('/')) return t('transfer.problem.trailingSlash');
  return undefined;
});

// These dialogs mount already open (`v-if` on the target), so run on mount too.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    step.value = 'edit';
    error.value = undefined;
    result.value = undefined;
    target.value = props.mode === 'copy' ? copyName(props.entry.key) : props.entry.key;
  },
  { immediate: true },
);

function copyName(key: string): string {
  if (key.endsWith('/')) return `${key.slice(0, -1)}-copy/`;
  const dot = key.lastIndexOf('.');
  const slash = key.lastIndexOf('/');
  return dot > slash + 1 ? `${key.slice(0, dot)}-copy${key.slice(dot)}` : `${key}-copy`;
}

async function objectExists(key: string): Promise<boolean> {
  try {
    await props.client.send(new HeadObjectCommand({ Bucket: props.bucket, Key: key }));
    return true;
  } catch (e) {
    if (httpStatusOf(e) === 404) return false;
    throw e;
  }
}

/** Counts what will be touched so the confirmation states real numbers. */
async function prepare() {
  if (targetProblem.value) return;
  error.value = undefined;
  step.value = 'counting';
  controller = new AbortController();
  try {
    if (isFolder.value) {
      const source = await collectKeys(props.client, props.bucket, props.entry.key, {
        signal: controller.signal,
      });
      const overlap = overlappingTargets(
        props.entry.key,
        normalizedTarget.value,
        source.map((k) => k.key),
      );
      if (overlap.length > 0) throw new OverlappingTransferError(overlap);
      const existing = new Set(
        (
          await collectKeys(props.client, props.bucket, normalizedTarget.value, {
            signal: controller.signal,
          })
        ).map((k) => k.key),
      );
      sourceCount.value = source.length;
      overwriteCount.value = source.filter((k) =>
        existing.has(normalizedTarget.value + k.key.slice(props.entry.key.length)),
      ).length;
    } else {
      sourceCount.value = 1;
      overwriteCount.value = (await objectExists(normalizedTarget.value)) ? 1 : 0;
    }
    // Moving or copying one object onto a free name needs no extra confirmation.
    if (!isFolder.value && overwriteCount.value === 0) await run();
    else step.value = 'confirm';
  } catch (e) {
    error.value = isAbortError(e) ? undefined : e;
    step.value = 'edit';
  }
}

async function run() {
  step.value = 'running';
  error.value = undefined;
  controller = new AbortController();
  progress.value = { done: 0, total: sourceCount.value };
  try {
    await withCapability(props.profileId, 'copyObject', async () => {
      if (isFolder.value) {
        result.value = await transferPrefix(
          props.client,
          props.bucket,
          props.entry.key,
          normalizedTarget.value,
          props.mode === 'rename' ? 'move' : 'copy',
          {
            signal: controller?.signal,
            onProgress: (done, total) => (progress.value = { done, total }),
          },
        );
        if (result.value.error) throw result.value.error;
      } else {
        const transfer = props.mode === 'rename' ? moveObject : copyObject;
        await transfer(
          props.client,
          { bucket: props.bucket, key: props.entry.key },
          { bucket: props.bucket, key: normalizedTarget.value },
          {
            signal: controller?.signal,
            size: props.entry.kind === 'object' ? props.entry.size : undefined,
          },
        );
      }
    });
    emit('done');
    open.value = false;
  } catch (e) {
    error.value = e;
    step.value = result.value?.remaining.length ? 'result' : 'edit';
    emit('done');
  }
}

function cancel() {
  controller?.abort();
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" persistent>
    <v-card :title="t(`transfer.title.${mode}`)" :subtitle="entry.key">
      <v-card-text>
        <v-text-field
          v-model="target"
          :label="isFolder ? t('transfer.targetFolder') : t('transfer.targetKey')"
          :hint="t('transfer.targetHint')"
          :error-messages="targetProblem && target ? [targetProblem] : []"
          :disabled="step !== 'edit'"
          persistent-hint
          autofocus
          data-testid="transfer-target"
        />
        <v-alert
          v-if="isFolder && mode === 'rename'"
          type="warning"
          variant="tonal"
          density="compact"
          class="mt-4"
        >
          {{ t('transfer.notAtomic') }}
        </v-alert>
        <p v-if="step === 'counting'" class="mt-4">
          <v-progress-circular indeterminate size="18" class="mr-2" />{{ t('transfer.counting') }}
        </p>
        <v-alert
          v-if="step === 'confirm'"
          :type="overwriteCount ? 'warning' : 'info'"
          variant="tonal"
          class="mt-4"
        >
          {{ t(`transfer.confirm.${mode}`, { count: sourceCount }, sourceCount) }}
          <template v-if="overwriteCount">
            <br />{{ t('transfer.confirm.overwrite', { count: overwriteCount }, overwriteCount) }}
          </template>
        </v-alert>
        <div v-if="step === 'running'" class="mt-4">
          <v-progress-linear
            :model-value="progress.total ? (progress.done / progress.total) * 100 : 0"
            :indeterminate="!isFolder"
            color="primary"
            height="8"
            rounded
          />
          <p v-if="isFolder" class="text-body-2 mt-1">
            {{ t('transfer.progress', { done: progress.done, total: progress.total }) }}
          </p>
        </div>
        <template v-if="step === 'result' && result">
          <v-alert type="warning" variant="tonal" class="mt-4">
            {{
              t('transfer.partial', {
                done: result.done.length,
                remaining: result.remaining.length,
              })
            }}
          </v-alert>
          <v-list density="compact" class="remaining">
            <v-list-item v-for="key in result.remaining.slice(0, 100)" :key="key" :title="key" />
          </v-list>
        </template>
        <ErrorAlert :error="error" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn v-if="step === 'running' || step === 'counting'" @click="cancel">{{
          t('common.stop')
        }}</v-btn>
        <v-btn v-else data-testid="transfer-dismiss" @click="open = false">
          {{ step === 'result' ? t('common.close') : t('common.cancel') }}
        </v-btn>
        <v-btn
          v-if="step === 'edit'"
          color="primary"
          variant="flat"
          :disabled="Boolean(targetProblem)"
          data-testid="transfer-next"
          @click="prepare"
        >
          {{ t('common.continue') }}
        </v-btn>
        <v-btn
          v-if="step === 'confirm'"
          :color="overwriteCount ? 'error' : 'primary'"
          variant="flat"
          data-testid="transfer-confirm"
          @click="run"
        >
          {{ t(`transfer.run.${mode}`) }}
        </v-btn>
        <v-btn v-if="step === 'result'" color="primary" variant="flat" @click="prepare">
          {{ t('transfer.runAgain') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.remaining {
  max-height: 240px;
  overflow: auto;
}
</style>
