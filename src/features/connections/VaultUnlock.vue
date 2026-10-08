<script setup lang="ts">
import { mdiEye, mdiEyeOff, mdiLockOutline } from '@mdi/js';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ConfirmDialog from '@/features/shared/ConfirmDialog.vue';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { useVault } from './use-vault';

const { t } = useI18n();
const vault = useVault();
const passphrase = ref('');
const visible = ref(false);
const busy = ref(false);
const error = ref<unknown>();
const confirmReset = ref(false);

async function submit() {
  if (!passphrase.value || busy.value) return;
  busy.value = true;
  error.value = undefined;
  try {
    await vault.unlock(passphrase.value);
    passphrase.value = '';
  } catch (e) {
    error.value = e;
  } finally {
    busy.value = false;
  }
}

async function resetVault() {
  await vault.reset();
  confirmReset.value = false;
}
</script>

<template>
  <v-card class="vault-card" :prepend-icon="mdiLockOutline" :title="t('vault.unlock.title')">
    <v-card-text>
      <p class="mb-4">{{ t('vault.unlock.intro') }}</p>
      <v-form @submit.prevent="submit">
        <v-text-field
          v-model="passphrase"
          :label="t('vault.passphrase')"
          :type="visible ? 'text' : 'password'"
          :append-inner-icon="visible ? mdiEyeOff : mdiEye"
          autocomplete="current-password"
          autofocus
          data-testid="vault-passphrase"
          @click:append-inner="visible = !visible"
        />
        <ErrorAlert :error="error" />
        <v-btn
          type="submit"
          color="primary"
          variant="flat"
          block
          :disabled="!passphrase"
          :loading="busy"
          data-testid="vault-unlock"
        >
          {{ t('vault.unlock.submit') }}
        </v-btn>
      </v-form>
      <v-btn variant="text" color="error" class="mt-4" block @click="confirmReset = true">
        {{ t('vault.unlock.forgot') }}
      </v-btn>
    </v-card-text>
  </v-card>
  <ConfirmDialog
    v-model="confirmReset"
    :title="t('vault.reset.title')"
    :message="t('vault.reset.message')"
    :confirm-label="t('vault.reset.confirm')"
    danger
    @confirm="resetVault"
  />
</template>

<style scoped>
.vault-card {
  max-width: 520px;
  margin: var(--app-space-xl) auto;
}
</style>
