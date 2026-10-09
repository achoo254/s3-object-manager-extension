<script setup lang="ts">
import { mdiEye, mdiEyeOff } from '@mdi/js';
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { hostPatternFor, requestHostPermission } from '@/core/profiles/host-permission';
import { effectiveAddressing } from '@/core/profiles/addressing';
import { normalizeEndpoint, suggestAddressing } from '@/core/profiles/profile-store';
import {
  DEFAULT_REGION,
  type ConnectionProfile,
  type ProfileInput,
} from '@/core/profiles/profile.types';
import { testConnection, type ConnectionTestResult } from '@/core/s3/operations/test-connection';
import { createS3Client } from '@/core/s3/s3-client-factory';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { useNotify } from '@/features/shared/use-notify';
import { useConnections } from './use-connections';

const props = defineProps<{ profile?: ConnectionProfile }>();
const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{ saved: [profile: ConnectionProfile] }>();

const { t } = useI18n();
const connections = useConnections();
const { notify } = useNotify();

const form = reactive({
  name: '',
  endpoint: '',
  region: DEFAULT_REGION,
  addressing: 'path' as ProfileInput['addressing'],
  accessKeyId: '',
  secretAccessKey: '',
  sessionToken: '',
  defaultBucket: '',
});
const addressingTouched = ref(false);
const showSecret = ref(false);
const busy = ref<'test' | 'save'>();
const error = ref<unknown>();
const testResult = ref<ConnectionTestResult>();
const permissionDenied = ref(false);

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    const p = props.profile;
    Object.assign(form, {
      name: p?.name ?? '',
      endpoint: p?.endpoint ?? '',
      region: p?.region ?? DEFAULT_REGION,
      addressing: p?.addressing ?? 'path',
      accessKeyId: p?.accessKeyId ?? '',
      secretAccessKey: p?.secretAccessKey ?? '',
      sessionToken: p?.sessionToken ?? '',
      defaultBucket: p?.defaultBucket ?? '',
    });
    addressingTouched.value = Boolean(p);
    error.value = undefined;
    testResult.value = undefined;
    permissionDenied.value = false;
  },
  { immediate: true },
);

const endpointCheck = computed(() => normalizeEndpoint(form.endpoint));
const endpointError = computed(() => {
  if (!form.endpoint.trim()) return [];
  const check = endpointCheck.value;
  return 'problem' in check ? [t(`connections.form.endpointProblem.${check.problem}`)] : [];
});

watch(
  () => form.endpoint,
  (endpoint) => {
    if (!addressingTouched.value) form.addressing = suggestAddressing(endpoint);
  },
);

const draft = computed<ProfileInput | undefined>(() => {
  const check = endpointCheck.value;
  if ('problem' in check) return undefined;
  if (!form.name.trim() || !form.accessKeyId.trim() || !form.secretAccessKey) return undefined;
  return {
    name: form.name.trim(),
    endpoint: check.endpoint,
    region: form.region.trim() || DEFAULT_REGION,
    addressing: form.addressing,
    accessKeyId: form.accessKeyId.trim(),
    secretAccessKey: form.secretAccessKey,
    ...(form.sessionToken.trim() ? { sessionToken: form.sessionToken.trim() } : {}),
    ...(form.defaultBucket.trim() ? { defaultBucket: form.defaultBucket.trim() } : {}),
  };
});

/** Virtual-hosted needs `<bucket>.<host>`, which `localhost` and IP addresses cannot provide. */
const virtualUnavailable = computed(() => {
  const check = endpointCheck.value;
  return (
    'endpoint' in check &&
    effectiveAddressing({ endpoint: check.endpoint, addressing: 'virtual' }) === 'path'
  );
});
watch(virtualUnavailable, (unavailable) => {
  if (unavailable) form.addressing = 'path';
});

const hostPattern = computed(() => (draft.value ? hostPatternFor(draft.value) : ''));

/**
 * The permission prompt must come straight from the click, before any other await, or the
 * browser drops the user gesture and refuses to show it.
 */
async function test() {
  const input = draft.value;
  if (!input) return;
  const granted = await requestHostPermission(input);
  permissionDenied.value = !granted;
  if (!granted) return;
  busy.value = 'test';
  error.value = undefined;
  testResult.value = undefined;
  try {
    testResult.value = await testConnection(createS3Client(input), input.defaultBucket);
  } catch (e) {
    error.value = e;
  } finally {
    busy.value = undefined;
  }
}

async function save() {
  const input = draft.value;
  if (!input) return;
  const granted = await requestHostPermission(input);
  permissionDenied.value = !granted;
  busy.value = 'save';
  error.value = undefined;
  try {
    const saved = await connections.saveProfile(input, props.profile?.id);
    notify(granted ? 'connections.saved' : 'connections.savedWithoutAccess', { name: saved.name });
    emit('saved', saved);
    open.value = false;
  } catch (e) {
    error.value = e;
  } finally {
    busy.value = undefined;
  }
}
</script>

<template>
  <v-dialog v-model="open" max-width="640" scrollable>
    <v-card :title="profile ? t('connections.form.editTitle') : t('connections.form.addTitle')">
      <v-card-text class="pt-4">
        <v-form @submit.prevent="save">
          <v-text-field
            v-model="form.name"
            :label="t('connections.form.name')"
            autofocus
            data-testid="profile-name"
          />
          <v-text-field
            v-model="form.endpoint"
            :label="t('connections.form.endpoint')"
            :hint="t('connections.form.endpointHint')"
            :error-messages="endpointError"
            placeholder="https://s3.example.com"
            persistent-hint
            data-testid="profile-endpoint"
          />
          <div class="two-columns mt-2">
            <v-text-field
              v-model="form.region"
              :label="t('connections.form.region')"
              :hint="t('connections.form.regionHint')"
              data-testid="profile-region"
            />
            <v-text-field
              v-model="form.defaultBucket"
              :label="t('connections.form.defaultBucket')"
              :hint="t('connections.form.defaultBucketHint')"
              data-testid="profile-default-bucket"
            />
          </div>
          <v-radio-group
            v-model="form.addressing"
            :label="t('connections.form.addressing')"
            :hint="virtualUnavailable ? t('connections.form.virtualUnavailable') : undefined"
            :persistent-hint="virtualUnavailable"
            class="mb-3"
            inline
            @update:model-value="addressingTouched = true"
          >
            <v-radio :label="t('connections.form.addressingPath')" value="path" />
            <v-radio
              :label="t('connections.form.addressingVirtual')"
              value="virtual"
              :disabled="virtualUnavailable"
            />
          </v-radio-group>
          <v-text-field
            v-model="form.accessKeyId"
            :label="t('connections.form.accessKeyId')"
            autocomplete="off"
            data-testid="profile-access-key"
          />
          <v-text-field
            v-model="form.secretAccessKey"
            :label="t('connections.form.secretAccessKey')"
            :type="showSecret ? 'text' : 'password'"
            :append-inner-icon="showSecret ? mdiEyeOff : mdiEye"
            autocomplete="off"
            data-testid="profile-secret-key"
            @click:append-inner="showSecret = !showSecret"
          />
          <v-text-field
            v-model="form.sessionToken"
            :label="t('connections.form.sessionToken')"
            :type="showSecret ? 'text' : 'password'"
            autocomplete="off"
          />
          <v-alert type="info" variant="tonal" density="compact" class="mb-2">
            {{ t('connections.form.scopedKeyAdvice') }}
          </v-alert>
          <v-alert v-if="hostPattern" variant="outlined" density="compact" class="mb-2">
            {{ t('connections.form.permissionNote', { pattern: hostPattern }) }}
          </v-alert>
          <v-alert v-if="permissionDenied" type="warning" variant="tonal" density="compact">
            {{ t('connections.permission.denied') }}
          </v-alert>
          <v-alert
            v-if="testResult"
            type="success"
            variant="tonal"
            density="compact"
            data-testid="profile-test-result"
          >
            {{
              testResult.kind === 'listBuckets'
                ? t(
                    'connections.test.okBuckets',
                    { count: testResult.bucketCount },
                    testResult.bucketCount,
                  )
                : t('connections.test.okBucketOnly', { bucket: testResult.bucket })
            }}
          </v-alert>
          <ErrorAlert :error="error" />
        </v-form>
      </v-card-text>
      <v-card-actions>
        <v-btn
          :disabled="!draft || Boolean(busy)"
          :loading="busy === 'test'"
          data-testid="profile-test"
          @click="test"
        >
          {{ t('connections.test.button') }}
        </v-btn>
        <v-spacer />
        <v-btn @click="open = false">{{ t('common.cancel') }}</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!draft || Boolean(busy)"
          :loading="busy === 'save'"
          data-testid="profile-save"
          @click="save"
        >
          {{ t('common.save') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.two-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--app-space-md);
}
</style>
