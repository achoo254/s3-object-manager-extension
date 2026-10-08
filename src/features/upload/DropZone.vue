<script setup lang="ts">
import { mdiTrayArrowUp } from '@mdi/js';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { collectDroppedFiles, type PickedFile } from './collect-dropped-files';

const emit = defineEmits<{ files: [files: PickedFile[]] }>();
const { t } = useI18n();
const dragging = ref(false);
let depth = 0;

function hasFiles(event: DragEvent): boolean {
  return [...(event.dataTransfer?.types ?? [])].includes('Files');
}

function onEnter(event: DragEvent) {
  if (!hasFiles(event)) return;
  depth++;
  dragging.value = true;
}

function onLeave() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) dragging.value = false;
}

async function onDrop(event: DragEvent) {
  depth = 0;
  dragging.value = false;
  if (!event.dataTransfer) return;
  const files = await collectDroppedFiles(event.dataTransfer);
  if (files.length) emit('files', files);
}
</script>

<template>
  <div
    class="drop-zone"
    @dragenter.prevent="onEnter"
    @dragover.prevent
    @dragleave="onLeave"
    @drop.prevent="onDrop"
  >
    <slot />
    <div v-if="dragging" class="overlay">
      <v-icon :icon="mdiTrayArrowUp" size="48" />
      <span class="text-h6">{{ t('upload.dropHere') }}</span>
    </div>
  </div>
</template>

<style scoped>
.drop-zone {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--app-space-sm);
  border: 2px dashed rgb(var(--v-theme-primary));
  border-radius: var(--app-radius-md);
  background: rgba(var(--v-theme-surface), 0.92);
  color: rgb(var(--v-theme-primary));
  pointer-events: none;
}
</style>
