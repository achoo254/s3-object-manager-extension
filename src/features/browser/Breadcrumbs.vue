<script setup lang="ts">
import { mdiChevronRight } from '@mdi/js';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ bucket: string; prefix: string; canListBuckets: boolean }>();
const emit = defineEmits<{ navigate: [prefix: string]; buckets: [] }>();
const { t } = useI18n();

const crumbs = computed(() => {
  const parts = props.prefix.split('/').filter(Boolean);
  return parts.map((name, index) => ({ name, prefix: `${parts.slice(0, index + 1).join('/')}/` }));
});
</script>

<template>
  <nav class="breadcrumbs" :aria-label="t('browser.breadcrumbs')">
    <v-btn v-if="canListBuckets" variant="text" size="small" @click="emit('buckets')">
      {{ t('browser.allBuckets') }}
    </v-btn>
    <v-icon v-if="canListBuckets" :icon="mdiChevronRight" size="small" />
    <v-btn variant="text" size="small" data-testid="crumb-bucket" @click="emit('navigate', '')">
      {{ bucket }}
    </v-btn>
    <template v-for="crumb in crumbs" :key="crumb.prefix">
      <v-icon :icon="mdiChevronRight" size="small" />
      <v-btn variant="text" size="small" class="text-none" @click="emit('navigate', crumb.prefix)">
        {{ crumb.name }}
      </v-btn>
    </template>
  </nav>
</template>

<style scoped>
.breadcrumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-xs);
}
</style>
