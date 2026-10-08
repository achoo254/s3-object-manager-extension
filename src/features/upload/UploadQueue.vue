<script setup lang="ts">
import { mdiClose, mdiPause, mdiPlay, mdiReload } from '@mdi/js';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { formatBytes, formatDuration } from '@/features/shared/format';
import { useUploadQueue, type UploadJob } from './use-upload-queue';

const emit = defineEmits<{ close: [] }>();
const { t, locale } = useI18n();
const queue = useUploadQueue();
const jobs = computed(() => [...queue.jobs.value].reverse());

function percent(job: UploadJob): number {
  return job.file.size === 0
    ? job.status === 'done'
      ? 100
      : 0
    : (job.uploadedBytes / job.file.size) * 100;
}

function eta(job: UploadJob): string {
  if (!job.speed) return '';
  return formatDuration((job.file.size - job.uploadedBytes) / job.speed);
}

const statusColor: Record<UploadJob['status'], string> = {
  queued: 'secondary',
  running: 'primary',
  paused: 'warning',
  done: 'success',
  error: 'error',
  cancelled: 'secondary',
};
</script>

<template>
  <div class="upload-queue">
    <div class="header">
      <h2 class="text-h6">{{ t('upload.queue.title') }}</h2>
      <v-spacer />
      <v-btn size="small" variant="text" @click="queue.clearFinished()">{{
        t('upload.queue.clear')
      }}</v-btn>
      <v-btn
        :icon="mdiClose"
        :aria-label="t('common.close')"
        size="small"
        variant="text"
        data-testid="upload-queue-close"
        @click="emit('close')"
      />
    </div>
    <p v-if="jobs.length === 0" class="text-medium-emphasis px-4">{{ t('upload.queue.empty') }}</p>
    <v-list density="compact" lines="three">
      <v-list-item v-for="job in jobs" :key="job.id" :data-testid="`upload-job-${job.file.name}`">
        <v-list-item-title class="text-truncate" :title="job.key">{{ job.key }}</v-list-item-title>
        <v-progress-linear
          :model-value="percent(job)"
          :color="statusColor[job.status]"
          height="6"
          rounded
          class="my-1"
        />
        <div class="meta text-caption">
          <span :data-testid="`upload-status-${job.file.name}`" :data-status="job.status">
            {{ t(`upload.status.${job.status}`) }}
          </span>
          <span
            >{{ formatBytes(job.uploadedBytes, locale) }} /
            {{ formatBytes(job.file.size, locale) }}</span
          >
          <span v-if="job.status === 'running' && job.speed">
            {{ t('upload.queue.speed', { speed: formatBytes(job.speed, locale) }) }}
            · {{ t('upload.queue.eta', { time: eta(job) }) }}
          </span>
          <span v-if="job.resumedParts">{{
            t('upload.queue.resumed', { count: job.resumedParts }, job.resumedParts)
          }}</span>
        </div>
        <ErrorAlert v-if="job.status === 'error'" :error="job.error" />
        <template #append>
          <v-btn
            v-if="job.status === 'running' || job.status === 'queued'"
            :icon="mdiPause"
            :aria-label="t('upload.actions.pause')"
            size="small"
            variant="text"
            @click="queue.pause(job)"
          />
          <v-btn
            v-if="job.status === 'paused'"
            :icon="mdiPlay"
            :aria-label="t('upload.actions.resume')"
            size="small"
            variant="text"
            @click="queue.resume(job)"
          />
          <v-btn
            v-if="job.status === 'error'"
            :icon="mdiReload"
            :aria-label="t('upload.actions.retry')"
            size="small"
            variant="text"
            @click="queue.resume(job)"
          />
          <v-btn
            v-if="!['done', 'cancelled'].includes(job.status)"
            :icon="mdiClose"
            :aria-label="t('upload.actions.cancel')"
            size="small"
            variant="text"
            @click="queue.cancel(job)"
          />
        </template>
      </v-list-item>
    </v-list>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  padding: var(--app-space-sm) var(--app-space-md);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--app-space-sm);
}
</style>
