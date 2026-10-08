<script setup lang="ts">
import { mdiEye, mdiEyeOff, mdiShieldLockOutline } from '@mdi/js';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { passphraseStrength } from './passphrase-strength';
import { useVault } from './use-vault';

const { t } = useI18n();
const vault = useVault();
const passphrase = ref('');
const confirmation = ref('');
const visible = ref(false);
const busy = ref(false);
const error = ref<unknown>();

const strength = computed(() => passphraseStrength(passphrase.value));
const strengthColor = computed(
  () => ({ weak: 'error', fair: 'warning', strong: 'success' })[strength.value],
);
const strengthValue = computed(() => ({ weak: 33, fair: 66, strong: 100 })[strength.value]);
const mismatch = computed(
  () => confirmation.value.length > 0 && confirmation.value !== passphrase.value,
);
const canSubmit = computed(
  () => passphrase.value.length > 0 && passphrase.value === confirmation.value && !busy.value,
);

async function submit() {
  if (!canSubmit.value) return;
  busy.value = true;
  error.value = undefined;
  try {
    await vault.create(passphrase.value);
  } catch (e) {
    error.value = e;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <v-card class="vault-card" :prepend-icon="mdiShieldLockOutline" :title="t('vault.setup.title')">
    <v-card-text>
      <p class="mb-4">{{ t('vault.setup.intro') }}</p>
      <v-alert type="warning" variant="tonal" class="mb-4">{{
        t('vault.setup.noRecovery')
      }}</v-alert>
      <v-form @submit.prevent="submit">
        <v-text-field
          v-model="passphrase"
          :label="t('vault.passphrase')"
          :type="visible ? 'text' : 'password'"
          :append-inner-icon="visible ? mdiEyeOff : mdiEye"
          autocomplete="new-password"
          autofocus
          data-testid="vault-passphrase"
          @click:append-inner="visible = !visible"
        />
        <div v-if="passphrase" class="strength mb-4">
          <v-progress-linear :model-value="strengthValue" :color="strengthColor" rounded />
          <span class="text-caption">{{ t(`vault.strength.${strength}`) }}</span>
        </div>
        <v-text-field
          v-model="confirmation"
          :label="t('vault.setup.confirm')"
          :type="visible ? 'text' : 'password'"
          :error-messages="mismatch ? [t('vault.setup.mismatch')] : []"
          autocomplete="new-password"
          data-testid="vault-passphrase-confirm"
        />
        <ErrorAlert :error="error" />
        <v-btn
          type="submit"
          color="primary"
          variant="flat"
          block
          :disabled="!canSubmit"
          :loading="busy"
          data-testid="vault-create"
        >
          {{ t('vault.setup.submit') }}
        </v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.vault-card {
  max-width: 520px;
  margin: var(--app-space-xl) auto;
}
.strength {
  display: grid;
  gap: var(--app-space-xs);
}
</style>
