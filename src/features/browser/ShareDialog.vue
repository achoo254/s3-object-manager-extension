<script setup lang="ts">
import type { S3Client } from '@aws-sdk/client-s3';
import { mdiContentCopy } from '@mdi/js';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  presignGetObject,
  SHARE_DURATIONS_SECONDS,
  type PresignedLink,
  type ShareDuration,
} from '@/core/s3/operations/presign';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { formatDateTime } from '@/features/shared/format';
import { useNotify } from '@/features/shared/use-notify';

const props = defineProps<{ client: S3Client; bucket: string; objectKey: string }>();
const open = defineModel<boolean>({ required: true });
const { t, locale } = useI18n();
const { notify } = useNotify();

const duration = ref<ShareDuration>('day');
const link = ref<PresignedLink>();
const error = ref<unknown>();
const busy = ref(false);

const durations = computed(() =>
  (Object.keys(SHARE_DURATIONS_SECONDS) as ShareDuration[]).map((value) => ({
    value,
    title: t(`share.duration.${value}`),
  })),
);

let generation = 0;

/** Only the link for the latest choice of duration is shown. */
async function generate() {
  const current = ++generation;
  busy.value = true;
  error.value = undefined;
  link.value = undefined;
  try {
    const next = await presignGetObject(
      props.client,
      props.bucket,
      props.objectKey,
      SHARE_DURATIONS_SECONDS[duration.value],
    );
    if (current === generation) link.value = next;
  } catch (e) {
    if (current === generation) error.value = e;
  } finally {
    if (current === generation) busy.value = false;
  }
}

async function copy() {
  if (!link.value) return;
  await navigator.clipboard.writeText(link.value.url);
  notify('share.copied');
}

// These dialogs mount already open (`v-if` on the target), so run on mount too.
watch(
  open,
  (isOpen) => {
    if (isOpen) {
      link.value = undefined;
      void generate();
    }
  },
  { immediate: true },
);
watch(duration, () => void generate());
</script>

<template>
  <v-dialog v-model="open" max-width="640">
    <v-card :title="t('share.title')" :subtitle="objectKey">
      <v-card-text>
        <v-select v-model="duration" :items="durations" :label="t('share.validFor')" />
        <v-text-field
          v-if="link"
          :model-value="link.url"
          :label="t('share.link')"
          readonly
          :append-inner-icon="mdiContentCopy"
          data-testid="share-url"
          @click:append-inner="copy"
        />
        <p v-if="link" class="text-body-2">
          {{ t('share.expiresAt', { time: formatDateTime(link.expiresAt, locale) }) }}
        </p>
        <v-alert type="warning" variant="tonal" density="compact" class="mt-2">
          {{ t('share.anyoneWithLink') }}
        </v-alert>
        <ErrorAlert :error="error" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">{{ t('common.close') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!link"
          :loading="busy"
          data-testid="share-copy"
          @click="copy"
        >
          {{ t('share.copy') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
