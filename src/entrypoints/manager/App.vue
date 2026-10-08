<script setup lang="ts">
import {
  mdiCogOutline,
  mdiLockOutline,
  mdiTrayArrowUp,
  mdiWeatherNight,
  mdiWhiteBalanceSunny,
} from '@mdi/js';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useTheme } from 'vuetify';
import { startAutoLock } from '@/core/vault/auto-lock';
import { browserLocale } from '@/i18n';
import ProfileView from '@/features/browser/ProfileView.vue';
import ConnectionList from '@/features/connections/ConnectionList.vue';
import { useVault } from '@/features/connections/use-vault';
import VaultSetup from '@/features/connections/VaultSetup.vue';
import VaultUnlock from '@/features/connections/VaultUnlock.vue';
import SettingsDialog from '@/features/settings/SettingsDialog.vue';
import { useSettings } from '@/features/settings/use-settings';
import { useBusy } from '@/features/shared/use-busy';
import { useNotify } from '@/features/shared/use-notify';
import UploadQueue from '@/features/upload/UploadQueue.vue';
import { useUploadQueue } from '@/features/upload/use-upload-queue';

const { t, locale } = useI18n();
const theme = useTheme();
const vault = useVault();
const { settings, load: loadSettings, update: updateSettings } = useSettings();
const { notices, dismiss } = useNotify();
const queue = useUploadQueue();
const busy = useBusy();

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
// Locking (by hand or automatically) stops uploads; they resume from the saved parts.
watch(
  () => vault.status.value,
  (status) => {
    if (status !== 'unlocked') queue.pauseAll();
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

let stopAutoLock: (() => void) | undefined;
onMounted(async () => {
  await loadSettings();
  locale.value = settings.locale ?? browserLocale();
  document.documentElement.lang = locale.value;
  applyTheme();
  systemDark.addEventListener('change', applyTheme);
  window.addEventListener('beforeunload', warnBeforeClose);
  await vault.init();
  stopAutoLock = startAutoLock({
    minutes: () => settings.autoLockMinutes,
    isBusy: () => queue.isBusy.value || busy.isBusy.value,
    onLocked: () => vault.markLocked(),
  });
});

onBeforeUnmount(() => {
  stopAutoLock?.();
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
        <span v-if="vault.activeProfile.value" class="text-medium-emphasis text-body-2 ml-2">
          · {{ vault.activeProfile.value.name }}
        </span>
      </v-app-bar-title>
      <template #append>
        <v-btn
          v-if="vault.status.value === 'unlocked'"
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
        <v-btn
          v-if="vault.status.value === 'unlocked'"
          :prepend-icon="mdiLockOutline"
          variant="tonal"
          class="mr-2"
          data-testid="lock-now"
          @click="vault.lock()"
        >
          {{ t('vault.lockNow') }}
        </v-btn>
      </template>
    </v-app-bar>

    <template v-if="vault.status.value === 'unlocked'">
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
        <v-progress-linear v-if="vault.status.value === 'loading'" indeterminate color="primary" />
        <VaultSetup v-else-if="vault.status.value === 'absent'" />
        <VaultUnlock v-else-if="vault.status.value === 'locked'" />
        <ProfileView v-else-if="vault.activeProfile.value" :profile="vault.activeProfile.value" />
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
