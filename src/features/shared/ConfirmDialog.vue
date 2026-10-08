<script setup lang="ts">
import { useI18n } from 'vue-i18n';

defineProps<{
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const open = defineModel<boolean>({ required: true });
const { t } = useI18n();

function cancel() {
  open.value = false;
  emit('cancel');
}
</script>

<template>
  <v-dialog v-model="open" max-width="480" persistent>
    <v-card :title="title">
      <v-card-text class="confirm-message">{{ message }}</v-card-text>
      <slot />
      <v-card-actions>
        <v-spacer />
        <v-btn :disabled="busy" @click="cancel">{{ t('common.cancel') }}</v-btn>
        <v-btn
          :color="danger ? 'error' : 'primary'"
          variant="flat"
          :loading="busy"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.confirm-message {
  white-space: pre-line;
}
</style>
