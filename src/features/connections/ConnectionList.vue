<script setup lang="ts">
import {
  mdiDatabaseOutline,
  mdiDotsVertical,
  mdiPencil,
  mdiPlus,
  mdiTrashCanOutline,
} from '@mdi/js';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import ConfirmDialog from '@/features/shared/ConfirmDialog.vue';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import ConnectionForm from './ConnectionForm.vue';
import { useConnections } from './use-connections';

const { t } = useI18n();
const connections = useConnections();
const { profiles, activeProfileId } = connections;

const formOpen = ref(false);
const editing = ref<ConnectionProfile>();
const deleting = ref<ConnectionProfile>();
const confirmDelete = ref(false);
const error = ref<unknown>();

function add() {
  editing.value = undefined;
  formOpen.value = true;
}

function edit(profile: ConnectionProfile) {
  editing.value = profile;
  formOpen.value = true;
}

function askDelete(profile: ConnectionProfile) {
  deleting.value = profile;
  confirmDelete.value = true;
}

async function remove() {
  const profile = deleting.value;
  confirmDelete.value = false;
  if (!profile) return;
  try {
    await connections.deleteProfile(profile);
  } catch (e) {
    error.value = e;
  }
}
</script>

<template>
  <div class="connection-list">
    <v-list density="comfortable" nav>
      <v-list-subheader>{{ t('connections.title') }}</v-list-subheader>
      <v-list-item
        v-for="profile in profiles"
        :key="profile.id"
        :active="profile.id === activeProfileId"
        :title="profile.name"
        :subtitle="profile.endpoint"
        :prepend-icon="mdiDatabaseOutline"
        color="primary"
        :data-testid="`profile-item-${profile.name}`"
        @click="activeProfileId = profile.id"
      >
        <template #append>
          <v-menu>
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                :icon="mdiDotsVertical"
                :aria-label="t('common.moreActions')"
                variant="text"
                size="small"
                @click.stop
              />
            </template>
            <v-list density="compact">
              <v-list-item
                :prepend-icon="mdiPencil"
                :title="t('common.edit')"
                @click="edit(profile)"
              />
              <v-list-item
                :prepend-icon="mdiTrashCanOutline"
                :title="t('common.delete')"
                base-color="error"
                @click="askDelete(profile)"
              />
            </v-list>
          </v-menu>
        </template>
      </v-list-item>
      <v-list-item v-if="profiles.length === 0" :subtitle="t('connections.empty')" />
    </v-list>
    <div class="px-3">
      <v-btn
        :prepend-icon="mdiPlus"
        color="primary"
        variant="tonal"
        block
        data-testid="profile-add"
        @click="add"
      >
        {{ t('connections.add') }}
      </v-btn>
      <ErrorAlert :error="error" />
    </div>
    <ConnectionForm v-model="formOpen" :profile="editing" @saved="activeProfileId = $event.id" />
    <ConfirmDialog
      v-model="confirmDelete"
      :title="t('connections.delete.title')"
      :message="t('connections.delete.message', { name: deleting?.name ?? '' })"
      :confirm-label="t('common.delete')"
      danger
      @confirm="remove"
    />
  </div>
</template>
