<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { UPLOAD_CONCURRENCY_RANGE, type Settings } from '@/core/settings/settings-store';
import { useSettings } from './use-settings';

const open = defineModel<boolean>({ required: true });
const { t } = useI18n();
const { settings, update } = useSettings();

const localeItems = computed(() => [
  { value: 'auto', title: t('settings.language.auto') },
  { value: 'vi', title: 'Tiếng Việt' },
  { value: 'en', title: 'English' },
]);
const themeItems = computed(() =>
  (['system', 'light', 'dark'] as const).map((value) => ({
    value,
    title: t(`settings.theme.${value}`),
  })),
);

const locale = computed({
  get: () => settings.locale ?? 'auto',
  set: (value: string) =>
    void update({ locale: value === 'vi' || value === 'en' ? value : undefined }),
});
const theme = computed({
  get: () => settings.theme,
  set: (value: Settings['theme']) => void update({ theme: value }),
});
const concurrency = computed({
  get: () => settings.uploadConcurrency,
  set: (value: number) => void update({ uploadConcurrency: value }),
});
</script>

<template>
  <v-dialog v-model="open" max-width="520">
    <v-card :title="t('settings.title')">
      <v-card-text>
        <v-select v-model="locale" :items="localeItems" :label="t('settings.language.label')" />
        <v-select v-model="theme" :items="themeItems" :label="t('settings.theme.label')" />
        <p class="text-body-2">{{ t('settings.concurrency', { count: concurrency }) }}</p>
        <v-slider
          v-model="concurrency"
          :min="UPLOAD_CONCURRENCY_RANGE.min"
          :max="UPLOAD_CONCURRENCY_RANGE.max"
          :step="1"
          show-ticks="always"
          thumb-label
          color="primary"
        />
        <p class="text-caption text-medium-emphasis">{{ t('settings.concurrencyHint') }}</p>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">{{ t('common.close') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
