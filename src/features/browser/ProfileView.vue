<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import HostPermissionNotice from '@/features/connections/HostPermissionNotice.vue';
import { useConnections } from '@/features/connections/use-connections';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import BucketList from './BucketList.vue';
import ObjectBrowser from './ObjectBrowser.vue';

const props = defineProps<{ profile: ConnectionProfile }>();
const connections = useConnections();

const bucket = ref('');
const prefix = ref('');
/** Once the user goes back to the bucket list, it no longer jumps to the default bucket. */
const listRequested = ref(false);
const hasAccess = computed(() => connections.hostAccess.value[props.profile.id] === true);
// No network call is made before the user has granted access to the endpoint.
const client = computed(() => (hasAccess.value ? connections.clientFor(props.profile) : undefined));

watch(
  () => props.profile.id,
  () => {
    bucket.value = '';
    prefix.value = '';
    listRequested.value = false;
  },
);

function showBuckets() {
  bucket.value = '';
  listRequested.value = true;
}

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
    @buckets="showBuckets"
  />
  <BucketList
    v-else
    :key="profile.id"
    :profile="profile"
    :client="client"
    :open-default="!listRequested"
    @open="openBucket"
  />
</template>
