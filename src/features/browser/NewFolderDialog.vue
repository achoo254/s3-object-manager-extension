<script setup lang="ts">
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';

const props = defineProps<{ client: S3Client; bucket: string; prefix: string }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ created: [] }>();
const { t } = useI18n();

const name = ref('');
const busy = ref(false);
const error = ref<unknown>();
const valid = computed(() => name.value.trim().length > 0 && !name.value.includes('/'));

watch(open, (isOpen) => {
  if (isOpen) {
    name.value = '';
    error.value = undefined;
  }
});

/** A folder is a zero-byte object whose key ends with `/`. */
async function create() {
  if (!valid.value) return;
  busy.value = true;
  error.value = undefined;
  try {
    await props.client.send(
      new PutObjectCommand({
        Bucket: props.bucket,
        Key: `${props.prefix}${name.value.trim()}/`,
        Body: new Uint8Array(0),
        ContentLength: 0,
      }),
    );
    emit('created');
    open.value = false;
  } catch (e) {
    error.value = e;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="480">
    <v-card :title="t('browser.newFolder.title')">
      <v-card-text>
        <v-form @submit.prevent="create">
          <v-text-field
            v-model="name"
            :label="t('browser.newFolder.name')"
            :error-messages="name.includes('/') ? [t('browser.newFolder.noSlash')] : []"
            autofocus
            data-testid="new-folder-name"
          />
        </v-form>
        <ErrorAlert :error="error" />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="open = false">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!valid"
          :loading="busy"
          data-testid="new-folder-create"
          @click="create"
        >
          {{ t('common.create') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
