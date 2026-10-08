<script setup lang="ts">
import { ListBucketsCommand, type Bucket, type S3Client } from '@aws-sdk/client-s3';
import { mdiArchiveOutline, mdiChevronRight, mdiRefresh } from '@mdi/js';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import { isSupported, withCapability } from '@/core/s3/capabilities';
import { s3ErrorCode } from '@/core/s3/s3-error';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { formatDateTime } from '@/features/shared/format';

const props = defineProps<{ profile: ConnectionProfile; client: S3Client }>();
const emit = defineEmits<{ open: [bucket: string]; listDenied: [] }>();
const { t, locale } = useI18n();

const buckets = ref<Bucket[]>([]);
const loading = ref(false);
const loaded = ref(false);
const error = ref<unknown>();
const manualBucket = ref(props.profile.defaultBucket ?? '');
const manualRequested = ref(false);

/**
 * Opening a bucket by name only matters for keys that cannot list (all) buckets, so it stays
 * behind a small text button unless listing failed or showed nothing.
 */
const showManual = computed(
  () =>
    manualRequested.value ||
    Boolean(error.value) ||
    !isSupported(props.profile.id, 'listBuckets') ||
    (loaded.value && buckets.value.length === 0),
);

async function load() {
  if (!isSupported(props.profile.id, 'listBuckets')) return;
  loading.value = true;
  error.value = undefined;
  try {
    const response = await withCapability(props.profile.id, 'listBuckets', () =>
      props.client.send(new ListBucketsCommand({})),
    );
    buckets.value = response.Buckets ?? [];
    loaded.value = true;
  } catch (e) {
    // A scoped key without ListBuckets is normal: go straight to its default bucket.
    if (s3ErrorCode(e) === 'AccessDenied' && props.profile.defaultBucket) {
      emit('listDenied');
      emit('open', props.profile.defaultBucket);
      return;
    }
    error.value = e;
  } finally {
    loading.value = false;
  }
}

function openManual() {
  const name = manualBucket.value.trim();
  if (name) emit('open', name);
}

onMounted(load);
</script>

<template>
  <div class="bucket-list">
    <div class="toolbar">
      <h2 class="text-h6">{{ t('browser.buckets') }}</h2>
      <v-spacer />
      <v-btn
        :icon="mdiRefresh"
        :aria-label="t('common.refresh')"
        variant="text"
        :loading="loading"
        @click="load"
      />
    </div>
    <ErrorAlert :error="error" />
    <v-list v-if="buckets.length" lines="two" data-testid="bucket-list">
      <v-list-item
        v-for="bucket in buckets"
        :key="bucket.Name"
        :title="bucket.Name"
        :subtitle="
          t('browser.bucketCreated', { date: formatDateTime(bucket.CreationDate, locale) })
        "
        :prepend-icon="mdiArchiveOutline"
        :append-icon="mdiChevronRight"
        @click="bucket.Name && emit('open', bucket.Name)"
      />
    </v-list>
    <p v-else-if="!loading && !error" class="text-medium-emphasis">{{ t('browser.noBuckets') }}</p>
    <v-btn
      v-if="!showManual"
      variant="text"
      size="small"
      class="mt-2"
      data-testid="bucket-open-by-name"
      @click="manualRequested = true"
    >
      {{ t('browser.openOtherByName') }}
    </v-btn>
    <v-form v-else class="manual" @submit.prevent="openManual">
      <v-text-field
        v-model="manualBucket"
        :label="t('browser.openByName')"
        :hint="t('browser.openByNameHint')"
        :autofocus="manualRequested"
        persistent-hint
        data-testid="bucket-name-input"
      />
      <v-btn type="submit" variant="tonal" :disabled="!manualBucket.trim()">{{
        t('browser.open')
      }}</v-btn>
    </v-form>
  </div>
</template>

<style scoped>
.bucket-list {
  /* Name and date read best in a column, not stretched across a wide window. */
  max-width: 960px;
}
.toolbar,
.manual {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
}
.manual {
  margin-top: var(--app-space-lg);
  max-width: 560px;
  align-items: flex-start;
}
</style>
