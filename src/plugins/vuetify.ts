import { createVuetify } from 'vuetify';
import { md3 } from 'vuetify/blueprints';
import { aliases, mdi } from 'vuetify/iconsets/mdi-svg';
import 'vuetify/styles';
import { darkPalette, lightPalette } from '@/styles/design-tokens';

export type ThemeName = 'appLight' | 'appDark';

export function preferredThemeName(): ThemeName {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'appDark' : 'appLight';
}

export const vuetify = createVuetify({
  blueprint: md3,
  icons: { defaultSet: 'mdi', aliases, sets: { mdi } },
  theme: {
    defaultTheme: preferredThemeName(),
    themes: {
      appLight: { dark: false, colors: { ...lightPalette } },
      appDark: { dark: true, colors: { ...darkPalette } },
    },
  },
  defaults: {
    VBtn: { rounded: 'lg' },
    VCard: { rounded: 'lg' },
    VTextField: { variant: 'outlined', density: 'comfortable' },
    VSelect: { variant: 'outlined', density: 'comfortable' },
  },
});
