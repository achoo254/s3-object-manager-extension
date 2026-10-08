<script setup lang="ts">
import type { S3Client } from '@aws-sdk/client-s3';
import {
  mdiDownload,
  mdiFileUploadOutline,
  mdiFolderPlusOutline,
  mdiFolderUploadOutline,
  mdiMagnify,
  mdiPlaylistCheck,
  mdiRefresh,
  mdiTrashCanOutline,
} from '@mdi/js';
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConnectionProfile } from '@/core/profiles/profile.types';
import { isSupported } from '@/core/s3/capabilities';
import { downloadObject } from '@/core/s3/operations/download';
import { describeS3Error } from '@/core/s3/describe-s3-error';
import ErrorAlert from '@/features/shared/ErrorAlert.vue';
import { useNotify } from '@/features/shared/use-notify';
import { collectInputFiles, type PickedFile } from '@/features/upload/collect-dropped-files';
import DropZone from '@/features/upload/DropZone.vue';
import PendingUploads from '@/features/upload/PendingUploads.vue';
import { useUploadQueue } from '@/features/upload/use-upload-queue';
import Breadcrumbs from './Breadcrumbs.vue';
import DeleteDialog from './DeleteDialog.vue';
import NewFolderDialog from './NewFolderDialog.vue';
import ObjectTable, { type EntryAction } from './ObjectTable.vue';
import type { BrowserEntry, ObjectEntry } from './object-entry';
import PropertiesDialog from './PropertiesDialog.vue';
import ShareDialog from './ShareDialog.vue';
import TransferDialog from './TransferDialog.vue';
import { useObjectListing } from './use-object-listing';

const props = defineProps<{ profile: ConnectionProfile; client: S3Client; bucket: string }>();
const prefix = defineModel<string>('prefix', { required: true });
const emit = defineEmits<{ buckets: [] }>();
const { t } = useI18n();
const { notify } = useNotify();
const queue = useUploadQueue();

const filter = ref('');
const selected = ref<string[]>([]);
const listing = useObjectListing(() => props.client, toRef(props, 'bucket'), prefix, filter);

const fileInput = ref<HTMLInputElement>();
const folderInput = ref<HTMLInputElement>();
const dialogs = ref({
  share: false,
  properties: false,
  transfer: false,
  delete: false,
  newFolder: false,
  pending: false,
});
const target = ref<BrowserEntry>();
const transferMode = ref<'rename' | 'copy'>('rename');
const deleting = ref<BrowserEntry[]>([]);

const canCopy = computed(() => isSupported(props.profile.id, 'copyObject'));
const canListBuckets = computed(() => isSupported(props.profile.id, 'listBuckets'));
const selectedEntries = computed(() => {
  const keys = new Set(selected.value);
  return listing.entries.value.filter((entry) => keys.has(entry.key));
});
const selectedObjects = computed(() =>
  selectedEntries.value.filter((entry): entry is ObjectEntry => entry.kind === 'object'),
);

watch([prefix, () => props.bucket], () => {
  selected.value = [];
  filter.value = '';
});

function navigate(next: string) {
  prefix.value = next;
}

function refresh() {
  selected.value = [];
  void listing.reload(true);
}

async function download(entries: ObjectEntry[]) {
  for (const entry of entries) {
    try {
      await downloadObject(props.client, props.bucket, entry.key);
    } catch (e) {
      const description = describeS3Error(e);
      notify(description.title, description.params, 'error');
    }
  }
}

function onAction(action: EntryAction, entry: BrowserEntry) {
  target.value = entry;
  switch (action) {
    case 'open':
      navigate(entry.key);
      break;
    case 'download':
      if (entry.kind === 'object') void download([entry]);
      break;
    case 'share':
      dialogs.value.share = true;
      break;
    case 'properties':
      dialogs.value.properties = true;
      break;
    case 'rename':
    case 'copy':
      transferMode.value = action;
      dialogs.value.transfer = true;
      break;
    case 'delete':
      deleting.value = [entry];
      dialogs.value.delete = true;
      break;
  }
}

function deleteSelected() {
  deleting.value = selectedEntries.value;
  dialogs.value.delete = true;
}

function enqueue(files: PickedFile[]) {
  queue.enqueue(
    props.profile.id,
    props.bucket,
    files.map(({ file, relativePath }) => ({ file, key: prefix.value + relativePath })),
  );
  notify('upload.queued', { count: files.length }, 'info');
}

function onInput(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) enqueue(collectInputFiles(input.files));
  input.value = '';
}

// Refresh the listing when uploads into this folder finish (batched).
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
const stopListening = queue.onCompleted((job) => {
  if (job.bucket !== props.bucket || !job.key.startsWith(prefix.value)) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => void listing.reload(true), 800);
});
onBeforeUnmount(() => {
  stopListening();
  clearTimeout(refreshTimer);
});
</script>

<template>
  <div class="object-browser">
    <Breadcrumbs
      :bucket="bucket"
      :prefix="prefix"
      :can-list-buckets="canListBuckets"
      @navigate="navigate"
      @buckets="emit('buckets')"
    />
    <div class="toolbar">
      <v-text-field
        v-model="filter"
        :prepend-inner-icon="mdiMagnify"
        :label="t('browser.filter')"
        density="compact"
        hide-details
        clearable
        class="filter"
        data-testid="filter"
      />
      <v-spacer />
      <template v-if="selected.length">
        <v-btn
          :prepend-icon="mdiDownload"
          variant="tonal"
          :disabled="selectedObjects.length === 0"
          @click="download(selectedObjects)"
        >
          {{ t('browser.downloadSelected', { count: selectedObjects.length }) }}
        </v-btn>
        <v-btn
          :prepend-icon="mdiTrashCanOutline"
          color="error"
          variant="tonal"
          data-testid="delete-selected"
          @click="deleteSelected"
        >
          {{ t('browser.deleteSelected', { count: selected.length }) }}
        </v-btn>
      </template>
      <v-btn
        :prepend-icon="mdiFileUploadOutline"
        color="primary"
        variant="flat"
        data-testid="upload-files"
        @click="fileInput?.click()"
      >
        {{ t('upload.files') }}
      </v-btn>
      <v-btn :prepend-icon="mdiFolderUploadOutline" variant="tonal" @click="folderInput?.click()">
        {{ t('upload.folder') }}
      </v-btn>
      <v-btn
        :icon="mdiFolderPlusOutline"
        :aria-label="t('browser.newFolder.title')"
        variant="text"
        data-testid="new-folder"
        @click="dialogs.newFolder = true"
      />
      <v-btn
        :icon="mdiPlaylistCheck"
        :aria-label="t('upload.pending.title')"
        variant="text"
        @click="dialogs.pending = true"
      />
      <v-btn
        :icon="mdiRefresh"
        :aria-label="t('common.refresh')"
        variant="text"
        data-testid="refresh"
        @click="refresh"
      />
      <input
        ref="fileInput"
        type="file"
        multiple
        hidden
        data-testid="file-input"
        @change="onInput"
      />
      <input ref="folderInput" type="file" webkitdirectory hidden @change="onInput" />
    </div>
    <ErrorAlert :error="listing.error.value" />
    <DropZone @files="enqueue">
      <ObjectTable
        v-model:selected="selected"
        :entries="listing.entries.value"
        :loading="listing.loading.value"
        :has-more="listing.hasMore.value"
        :can-copy="canCopy"
        @action="onAction"
        @load-more="listing.loadMore"
      />
    </DropZone>
    <p class="text-caption text-medium-emphasis status">
      {{
        t('browser.status', {
          count: listing.entries.value.length,
          requests: listing.requestCount.value,
        })
      }}
    </p>

    <template v-if="target">
      <ShareDialog
        v-model="dialogs.share"
        :client="client"
        :bucket="bucket"
        :object-key="target.key"
      />
      <PropertiesDialog
        v-model="dialogs.properties"
        :client="client"
        :bucket="bucket"
        :object-key="target.key"
      />
      <TransferDialog
        v-model="dialogs.transfer"
        :client="client"
        :profile-id="profile.id"
        :bucket="bucket"
        :entry="target"
        :mode="transferMode"
        @done="refresh"
      />
    </template>
    <DeleteDialog
      v-model="dialogs.delete"
      :client="client"
      :bucket="bucket"
      :entries="deleting"
      @done="refresh"
    />
    <NewFolderDialog
      v-model="dialogs.newFolder"
      :client="client"
      :bucket="bucket"
      :prefix="prefix"
      @created="refresh"
    />
    <PendingUploads
      v-model="dialogs.pending"
      :client="client"
      :profile-id="profile.id"
      :bucket="bucket"
    />
  </div>
</template>

<style scoped>
.object-browser {
  display: flex;
  flex-direction: column;
  gap: var(--app-space-sm);
  height: 100%;
  min-height: 0;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--app-space-sm);
}
.filter {
  max-width: 320px;
  min-width: 200px;
}
.status {
  margin: 0;
}
</style>
