<script setup lang="ts">
import { HeadObjectCommand, type HeadObjectCommandOutput, type S3Client } from '@aws-sdk/client-s3';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { formatBytes, formatDateTime } from '@/features/shared/format';

const props = defineProps<{ client: S3Client; bucket: string; objectKey: string }>();
const open = defineModel<boolean>({ required: true });
const { t, locale } = useI18n();

const head = ref<HeadObjectCommandOutput>();
const error = ref<unknown>();
const loading = ref(false);

const rows = computed(() => {
  const h = head.value;
  if (!h) return [];
  return [
    [t('properties.key'), props.objectKey],
    [
      t('properties.size'),
      h.ContentLength === undefined
        ? ''
        : `${formatBytes(h.ContentLength, locale.value)} (${h.ContentLength.toLocaleString(locale.value)} B)`,
    ],
    [t('properties.contentType'), h.ContentType ?? ''],
    [t('properties.etag'), h.ETag ?? ''],
    [t('properties.lastModified'), formatDateTime(h.LastModified, locale.value)],
    [t('properties.storageClass'), h.StorageClass ?? ''],
    [t('properties.cacheControl'), h.CacheControl ?? ''],
    [t('properties.contentEncoding'), h.ContentEncoding ?? ''],
  ].filter(([, value]) => value);
});
const metadata = computed(() => Object.entries(head.value?.Metadata ?? {}));

// These dialogs mount already open (`v-if` on the target), so run on mount too.
watch(
  open,
  async (isOpen) => {
    if (!isOpen) return;
    head.value = undefined;
    error.value = undefined;
    loading.value = true;
    try {
      head.value = await props.client.send(
        new HeadObjectCommand({ Bucket: props.bucket, Key: props.objectKey }),
      );
    } catch (e) {
      error.value = e;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <v-dialog v-model="open" max-width="640">
    <v-card :title="t('properties.title')" :loading="loading">
      <v-card-text>
        <ErrorAlert :error="error" />
        <v-table density="compact">
          <tbody>
            <tr v-for="[label, value] in rows" :key="label">
              <th>{{ label }}</th>
              <td class="value">{{ value }}</td>
            </tr>
          </tbody>
        </v-table>
        <template v-if="metadata.length">
          <h3 class="text-subtitle-1 mt-4">{{ t('properties.metadata') }}</h3>
          <v-table density="compact">
            <tbody>
              <tr v-for="[name, value] in metadata" :key="name">
                <th>{{ name }}</th>
                <td class="value">{{ value }}</td>
              </tr>
            </tbody>
          </v-table>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.value {
  word-break: break-all;
}
</style>
