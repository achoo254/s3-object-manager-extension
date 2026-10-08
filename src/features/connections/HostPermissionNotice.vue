<script setup lang="ts">
import { mdiShieldKeyOutline } from '@mdi/js';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { hostPatternFor, requestHostPermission } from '@/core/profiles/host-permission';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import { useVault } from './use-vault';

const props = defineProps<{ profile: ConnectionProfile }>();
const { t } = useI18n();
const vault = useVault();
const denied = ref(false);
const pattern = computed(() => hostPatternFor(props.profile));

async function grant() {
  const granted = await requestHostPermission(props.profile);
  denied.value = !granted;
  await vault.refreshHostAccess();
}
</script>

<template>
  <v-card
    class="notice"
    variant="outlined"
    :prepend-icon="mdiShieldKeyOutline"
    :title="t('connections.permission.title')"
  >
    <v-card-text>
      <p>{{ t('connections.permission.explain', { pattern }) }}</p>
      <v-alert v-if="denied" type="warning" variant="tonal" density="compact" class="mt-2">
        {{ t('connections.permission.denied') }}
      </v-alert>
    </v-card-text>
    <v-card-actions>
      <v-btn color="primary" variant="flat" data-testid="grant-permission" @click="grant">
        {{ t('connections.permission.grant') }}
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<style scoped>
.notice {
  max-width: 640px;
  margin: var(--app-space-lg) auto;
}
</style>
