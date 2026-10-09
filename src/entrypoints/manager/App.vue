<script setup lang="ts">
import { mdiCogOutline, mdiTrayArrowUp, mdiWeatherNight, mdiWhiteBalanceSunny } from '@mdi/js';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTheme } from 'vuetify';
import { browserLocale } from '@/i18n';
import ProfileView from '@/features/browser/ProfileView.vue';
import ConnectionList from '@/features/connections/ConnectionList.vue';
import { useConnections } from '@/features/connections/use-connections';
import SettingsDialog from '@/features/settings/SettingsDialog.vue';
import { useSettings } from '@/features/settings/use-settings';
import { useNotify } from '@/features/shared/use-notify';
import UploadQueue from '@/features/upload/UploadQueue.vue';
import { useUploadQueue } from '@/features/upload/use-upload-queue';

const { t, locale } = useI18n();
const theme = useTheme();
const connections = useConnections();
const { settings, load: loadSettings, update: updateSettings } = useSettings();
const { notices, dismiss } = useNotify();
const queue = useUploadQueue();

const settingsOpen = ref(false);
const queueOpen = ref(false);
const activeUploads = computed(
  () =>
    queue.jobs.value.filter((job) => job.status === 'running' || job.status === 'queued').length,
);
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const isDark = ref(false);

function applyTheme() {
  isDark.value = settings.theme === 'dark' || (settings.theme === 'system' && systemDark.matches);
  theme.change(isDark.value ? 'appDark' : 'appLight');
}

function toggleTheme() {
  void updateSettings({ theme: isDark.value ? 'light' : 'dark' });
}

watch(() => settings.theme, applyTheme);
watch(
  () => settings.locale,
  (value) => {
    locale.value = value ?? browserLocale();
    document.documentElement.lang = locale.value;
  },
);
watch(
  () => queue.jobs.value.length,
  (count, previous) => {
    if (count > (previous ?? 0)) queueOpen.value = true;
  },
);

function warnBeforeClose(event: BeforeUnloadEvent) {
  if (queue.isBusy.value) event.preventDefault();
}

onMounted(async () => {
  await loadSettings();
  locale.value = settings.locale ?? browserLocale();
  document.documentElement.lang = locale.value;
  applyTheme();
  systemDark.addEventListener('change', applyTheme);
  window.addEventListener('beforeunload', warnBeforeClose);
  await connections.init();
});

onBeforeUnmount(() => {
  systemDark.removeEventListener('change', applyTheme);
  window.removeEventListener('beforeunload', warnBeforeClose);
});
</script>

<template>
  <v-app>
    <v-app-bar color="surface" flat border>
      <template #prepend>
        <img src="/icon/32.png" alt="" width="28" height="28" class="ml-3" />
      </template>
      <v-app-bar-title>
        {{ t('app.title') }}
        <span v-if="connections.activeProfile.value" class="text-medium-emphasis text-body-2 ml-2">
          · {{ connections.activeProfile.value.name }}
        </span>
      </v-app-bar-title>
      <template #append>
        <v-btn
          v-if="connections.ready.value"
          :aria-label="t('upload.queue.title')"
          icon
          @click="queueOpen = !queueOpen"
        >
          <v-badge :content="activeUploads" :model-value="activeUploads > 0" color="primary">
            <v-icon :icon="mdiTrayArrowUp" />
          </v-badge>
        </v-btn>
        <v-btn
          :icon="isDark ? mdiWhiteBalanceSunny : mdiWeatherNight"
          :aria-label="t('settings.toggleTheme')"
          @click="toggleTheme"
        />
        <v-btn
          :icon="mdiCogOutline"
          :aria-label="t('settings.title')"
          @click="settingsOpen = true"
        />
      </template>
    </v-app-bar>

    <template v-if="connections.ready.value">
      <v-navigation-drawer permanent width="300">
        <ConnectionList />
      </v-navigation-drawer>
      <v-navigation-drawer
        v-model="queueOpen"
        location="right"
        width="380"
        temporary
        data-testid="upload-queue-drawer"
      >
        <!-- Rendered only while open: a hidden list re-rendering on every progress tick slowed big folder uploads. -->
        <UploadQueue v-if="queueOpen" @close="queueOpen = false" />
      </v-navigation-drawer>
    </template>

    <v-main>
      <div class="main-content">
        <v-progress-linear v-if="!connections.ready.value" indeterminate color="primary" />
        <ProfileView
          v-else-if="connections.activeProfile.value"
          :profile="connections.activeProfile.value"
        />
        <div v-else class="welcome">
          <h1 class="text-h5">{{ t('app.welcome.title') }}</h1>
          <p class="text-body-1 mt-2">{{ t('app.welcome.body') }}</p>
        </div>
      </div>
    </v-main>

    <SettingsDialog v-model="settingsOpen" />
    <v-snackbar
      v-for="notice in notices.slice(0, 1)"
      :key="notice.id"
      :model-value="true"
      :color="notice.color"
      timeout="4000"
      @update:model-value="dismiss(notice.id)"
    >
      {{ t(notice.message, notice.params ?? {}, Number(notice.params?.count ?? 1)) }}
    </v-snackbar>
  </v-app>
</template>

<style>
html,
body {
  overflow: hidden;
}
/* Material 3 uses sentence case for buttons; it also keeps case-sensitive names (buckets,
   keys) and Vietnamese diacritics readable. */
.v-btn {
  text-transform: none;
  letter-spacing: normal;
}
.main-content {
  height: calc(100vh - 64px);
  padding: var(--app-space-md);
  display: flex;
  flex-direction: column;
  overflow: auto;
}
.welcome {
  max-width: 640px;
  margin: var(--app-space-xl) auto;
}
</style>
