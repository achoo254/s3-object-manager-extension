import { reactive, readonly } from 'vue';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  type Settings,
} from '@/core/settings/settings-store';

const state = reactive<Settings>({ ...DEFAULT_SETTINGS });

async function load(): Promise<void> {
  Object.assign(state, await loadSettings());
}

async function update(changes: Partial<Settings>): Promise<void> {
  Object.assign(state, sanitizeSettings({ ...state, ...changes }));
  await saveSettings({ ...state });
}

export function useSettings() {
  return { settings: readonly(state), load, update };
}
