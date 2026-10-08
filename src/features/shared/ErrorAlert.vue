<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { describeS3Error } from '@/core/s3/describe-s3-error';
import { isAbortError } from '@/core/s3/s3-error';

const props = defineProps<{ error: unknown }>();
const { t } = useI18n();

// A cancelled operation is the user's choice, not an error worth showing.
const description = computed(() =>
  props.error === undefined || props.error === null || isAbortError(props.error)
    ? undefined
    : describeS3Error(props.error),
);
</script>

<template>
  <v-alert v-if="description" type="error" variant="tonal" class="error-alert">
    <div class="font-weight-medium">{{ t(description.title, description.params) }}</div>
    <div>{{ t(description.action, description.params) }}</div>
    <div v-if="description.code" class="text-caption mt-1">
      {{ t('errors.codeLabel', { code: description.code }) }}
    </div>
  </v-alert>
</template>

<style scoped>
.error-alert {
  margin-block: var(--app-space-sm);
}
</style>
