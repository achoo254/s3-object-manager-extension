import { createI18n } from 'vue-i18n';
import en from './en.json';
import vi from './vi.json';

export type AppLocale = 'vi' | 'en';
export const supportedLocales: readonly AppLocale[] = ['vi', 'en'];

/** `vi*` browser languages get Vietnamese, everything else English. */
export function browserLocale(language: string = navigator.language): AppLocale {
  return language.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}

export type MessageSchema = typeof vi;

export const i18n = createI18n<[MessageSchema], AppLocale>({
  legacy: false,
  locale: browserLocale(),
  fallbackLocale: 'en',
  messages: { vi, en },
});
