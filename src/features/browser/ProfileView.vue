<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import HostPermissionNotice from '@/features/connections/HostPermissionNotice.vue';
import { useVault } from '@/features/connections/use-vault';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import BucketList from './BucketList.vue';
import ObjectBrowser from './ObjectBrowser.vue';

const props = defineProps<{ profile: ConnectionProfile }>();
const vault = useVault();

const bucket = ref('');
const prefix = ref('');
const hasAccess = computed(() => vault.hostAccess.value[props.profile.id] === true);
// No network call is made before the user has granted access to the endpoint.
const client = computed(() => (hasAccess.value ? vault.clientFor(props.profile) : undefined));

watch(
  () => props.profile.id,
  () => {
    bucket.value = '';
    prefix.value = '';
  },
);

function openBucket(name: string) {
  bucket.value = name;
  prefix.value = '';
}
</script>

<template>
  <HostPermissionNotice v-if="!client" :profile="profile" />
  <ObjectBrowser
    v-else-if="bucket"
    v-model:prefix="prefix"
    :profile="profile"
    :client="client"
    :bucket="bucket"
    @buckets="bucket = ''"
  />
  <BucketList v-else :key="profile.id" :profile="profile" :client="client" @open="openBucket" />
</template>
