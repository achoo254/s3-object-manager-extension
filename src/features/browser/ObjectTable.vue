<script setup lang="ts">
import {
  mdiContentCopy,
  mdiDotsVertical,
  mdiDownload,
  mdiFileOutline,
  mdiFolder,
  mdiFolderOpenOutline,
  mdiInformationOutline,
  mdiLinkVariant,
  mdiRenameOutline,
  mdiTrashCanOutline,
} from '@mdi/js';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatBytes, formatDateTime } from '@/features/shared/format';
import type { BrowserEntry } from './object-entry';

export type EntryAction =
  'open' | 'download' | 'share' | 'rename' | 'copy' | 'properties' | 'delete';

const props = defineProps<{
  entries: BrowserEntry[];
  loading: boolean;
  hasMore: boolean;
  canCopy: boolean;
}>();
const selected = defineModel<string[]>('selected', { required: true });
const emit = defineEmits<{ action: [action: EntryAction, entry: BrowserEntry]; loadMore: [] }>();
const { t, locale } = useI18n();

const ROW_HEIGHT = 48;
const LOAD_MORE_THRESHOLD_PX = ROW_HEIGHT * 20;

const showStorageClass = computed(() =>
  props.entries.some((entry) => entry.kind === 'object' && entry.storageClass),
);
const selectedSet = computed(() => new Set(selected.value));
const allSelected = computed(
  () => props.entries.length > 0 && selected.value.length === props.entries.length,
);

function toggle(key: string) {
  selected.value = selectedSet.value.has(key)
    ? selected.value.filter((k) => k !== key)
    : [...selected.value, key];
}

function toggleAll() {
  selected.value = allSelected.value ? [] : props.entries.map((entry) => entry.key);
}

// VVirtualScroll handles `scroll` itself and does not pass a template listener through, so
// listen on its element directly.
const scroller = ref<{ $el: HTMLElement }>();

function onScroll(event: Event) {
  const el = event.target as HTMLElement;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_MORE_THRESHOLD_PX) emit('loadMore');
}

onMounted(() => scroller.value?.$el.addEventListener('scroll', onScroll, { passive: true }));
onBeforeUnmount(() => scroller.value?.$el.removeEventListener('scroll', onScroll));

interface MenuItem {
  action: EntryAction;
  icon: string;
  label: string;
  danger?: boolean;
}

function menuFor(entry: BrowserEntry): MenuItem[] {
  const items: MenuItem[] =
    entry.kind === 'folder'
      ? [{ action: 'open', icon: mdiFolderOpenOutline, label: t('browser.actions.open') }]
      : [
          { action: 'download', icon: mdiDownload, label: t('browser.actions.download') },
          { action: 'share', icon: mdiLinkVariant, label: t('browser.actions.share') },
        ];
  if (props.canCopy) {
    items.push(
      { action: 'rename', icon: mdiRenameOutline, label: t('browser.actions.rename') },
      { action: 'copy', icon: mdiContentCopy, label: t('browser.actions.copy') },
    );
  }
  if (entry.kind === 'object') {
    items.push({
      action: 'properties',
      icon: mdiInformationOutline,
      label: t('browser.actions.properties'),
    });
  }
  items.push({
    action: 'delete',
    icon: mdiTrashCanOutline,
    label: t('browser.actions.delete'),
    danger: true,
  });
  return items;
}
</script>

<template>
  <div class="object-table" :class="{ 'with-class': showStorageClass }">
    <div class="row header text-subtitle-2">
      <div class="cell">
        <v-checkbox-btn
          :model-value="allSelected"
          :indeterminate="selected.length > 0 && !allSelected"
          :aria-label="t('browser.selectAll')"
          density="compact"
          @update:model-value="toggleAll"
        />
      </div>
      <span>{{ t('browser.columns.name') }}</span>
      <span class="numeric">{{ t('browser.columns.size') }}</span>
      <span>{{ t('browser.columns.modified') }}</span>
      <span v-if="showStorageClass">{{ t('browser.columns.storageClass') }}</span>
      <span />
    </div>
    <v-virtual-scroll
      ref="scroller"
      :items="entries"
      :item-height="ROW_HEIGHT"
      height="100%"
      class="rows"
      item-key="key"
      data-testid="object-rows"
    >
      <template #default="{ item }">
        <div
          class="row"
          :class="{ selected: selectedSet.has(item.key) }"
          :data-testid="`entry-${item.name}`"
          @dblclick="item.kind === 'folder' ? emit('action', 'open', item) : undefined"
        >
          <div class="cell">
            <v-checkbox-btn
              :model-value="selectedSet.has(item.key)"
              :aria-label="t('browser.select', { name: item.name })"
              density="compact"
              @update:model-value="toggle(item.key)"
            />
          </div>
          <button
            v-if="item.kind === 'folder'"
            class="name link"
            type="button"
            @click="emit('action', 'open', item)"
          >
            <v-icon :icon="mdiFolder" color="primary" size="small" />
            <span class="name-text text-truncate">{{ item.name }}</span>
          </button>
          <span v-else class="name">
            <v-icon :icon="mdiFileOutline" size="small" />
            <span class="name-text text-truncate" :title="item.name">{{ item.name }}</span>
          </span>
          <span class="numeric">{{
            item.kind === 'object' ? formatBytes(item.size, locale) : ''
          }}</span>
          <span>{{ item.kind === 'object' ? formatDateTime(item.lastModified, locale) : '' }}</span>
          <span v-if="showStorageClass">{{ item.kind === 'object' ? item.storageClass : '' }}</span>
          <div class="cell">
            <v-menu>
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  :icon="mdiDotsVertical"
                  :aria-label="t('common.moreActions')"
                  variant="text"
                  size="small"
                  :data-testid="`menu-${item.name}`"
                />
              </template>
              <v-list density="compact">
                <v-list-item
                  v-for="menuItem in menuFor(item)"
                  :key="menuItem.action"
                  :prepend-icon="menuItem.icon"
                  :title="menuItem.label"
                  :base-color="menuItem.danger ? 'error' : undefined"
                  :data-testid="`action-${menuItem.action}`"
                  @click="emit('action', menuItem.action, item)"
                />
              </v-list>
            </v-menu>
          </div>
        </div>
      </template>
    </v-virtual-scroll>
    <div v-if="loading" class="footer"><v-progress-linear indeterminate color="primary" /></div>
    <div v-else-if="hasMore" class="footer">
      <v-btn variant="text" size="small" @click="emit('loadMore')">{{
        t('browser.loadMore')
      }}</v-btn>
    </div>
    <p v-else-if="entries.length === 0" class="empty text-medium-emphasis">
      {{ t('browser.emptyFolder') }}
    </p>
  </div>
</template>

<style scoped>
.object-table {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  border: 1px solid rgba(var(--v-theme-outline), 0.4);
  border-radius: var(--app-radius-md);
  overflow: hidden;
}
.row {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) 110px 170px 48px;
  align-items: center;
  gap: var(--app-space-sm);
  height: 48px;
  padding-inline: var(--app-space-sm);
  border-bottom: 1px solid rgba(var(--v-theme-outline), 0.15);
}
.with-class .row {
  grid-template-columns: 40px minmax(0, 1fr) 110px 170px 120px 48px;
}
.header {
  background: rgb(var(--v-theme-surface-variant));
  color: rgb(var(--v-theme-on-surface-variant));
}
.row.selected {
  background: rgba(var(--v-theme-primary), 0.08);
}
.rows {
  flex: 1;
  min-height: 0;
}
.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}
.name {
  display: flex;
  align-items: center;
  gap: var(--app-space-sm);
  min-width: 0;
  font-size: var(--app-font-body);
}
.name-text {
  flex: 1;
  min-width: 0;
}
.link {
  background: none;
  border: 0;
  padding: 0;
  color: inherit;
  cursor: pointer;
  text-align: start;
}
.link:hover span {
  text-decoration: underline;
}
.numeric {
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.footer,
.empty {
  padding: var(--app-space-sm);
  text-align: center;
}
</style>
