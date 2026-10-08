import { browser } from 'wxt/browser';
import type { AppLocale } from '@/i18n';

/** Non-secret preferences, stored in plain `chrome.storage.local`. */
export interface Settings {
  /** `undefined` = follow the browser language. */
  locale?: AppLocale;
  theme: 'system' | 'light' | 'dark';
  autoLockMinutes: number;
  /** Parallel part uploads, 1–8. */
  uploadConcurrency: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  autoLockMinutes: 30,
  uploadConcurrency: 4,
};

export const UPLOAD_CONCURRENCY_RANGE = { min: 1, max: 8 } as const;
export const AUTO_LOCK_RANGE = { min: 1, max: 24 * 60 } as const;

const SETTINGS_STORAGE_KEY = 'settings';

function clamp(value: number, range: { min: number; max: number }, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

export function sanitizeSettings(raw: Partial<Settings> | undefined): Settings {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  return {
    locale: merged.locale === 'vi' || merged.locale === 'en' ? merged.locale : undefined,
    theme: ['system', 'light', 'dark'].includes(merged.theme) ? merged.theme : 'system',
    autoLockMinutes: clamp(
      merged.autoLockMinutes,
      AUTO_LOCK_RANGE,
      DEFAULT_SETTINGS.autoLockMinutes,
    ),
    uploadConcurrency: clamp(
      merged.uploadConcurrency,
      UPLOAD_CONCURRENCY_RANGE,
      DEFAULT_SETTINGS.uploadConcurrency,
    ),
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  return sanitizeSettings(stored[SETTINGS_STORAGE_KEY] as Partial<Settings> | undefined);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_STORAGE_KEY]: sanitizeSettings(settings) });
}
