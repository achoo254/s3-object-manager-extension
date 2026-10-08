/**
 * The extension's own design tokens. Every colour, spacing, type size and radius used by
 * components comes from here (through the Vuetify theme or the CSS variables below), so
 * components never carry loose hex codes.
 */

export interface ColorPalette {
  primary: string;
  'on-primary': string;
  secondary: string;
  'on-secondary': string;
  tertiary: string;
  background: string;
  'on-background': string;
  surface: string;
  'on-surface': string;
  'surface-variant': string;
  'on-surface-variant': string;
  outline: string;
  error: string;
  'on-error': string;
  warning: string;
  success: string;
  info: string;
}

export const lightPalette: ColorPalette = {
  primary: '#1F6F6B',
  'on-primary': '#FFFFFF',
  secondary: '#4F6163',
  'on-secondary': '#FFFFFF',
  tertiary: '#7A5A2E',
  background: '#F7FAF9',
  'on-background': '#171D1C',
  surface: '#FFFFFF',
  'on-surface': '#171D1C',
  'surface-variant': '#DCE5E3',
  'on-surface-variant': '#3F4947',
  outline: '#6F7977',
  error: '#B3261E',
  'on-error': '#FFFFFF',
  warning: '#8A5A00',
  success: '#2E7D32',
  info: '#1D5F8A',
};

export const darkPalette: ColorPalette = {
  primary: '#7FD4CC',
  'on-primary': '#003734',
  secondary: '#B4CBCB',
  'on-secondary': '#1F3435',
  tertiary: '#E8C08A',
  background: '#0F1514',
  'on-background': '#DEE4E2',
  surface: '#171D1C',
  'on-surface': '#DEE4E2',
  'surface-variant': '#3F4947',
  'on-surface-variant': '#BEC9C6',
  outline: '#899391',
  error: '#F2B8B5',
  'on-error': '#601410',
  warning: '#F5C46B',
  success: '#8FD694',
  info: '#9CCBF0',
};

/** Spacing scale in px (4 px grid). */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Font sizes in px. */
export const fontSize = { caption: 12, body: 14, title: 16, headline: 22 } as const;

/** Corner radius in px. */
export const radius = { sm: 4, md: 8, lg: 16, pill: 999 } as const;

/**
 * Expose the non-colour tokens as CSS custom properties (`--app-space-md`, ...) so scoped
 * component styles can use them. Colours are exposed by Vuetify as `--v-theme-<name>`.
 */
export function applyTokenCssVariables(root: HTMLElement = document.documentElement): void {
  const groups: Record<string, Record<string, number>> = {
    space: spacing,
    font: fontSize,
    radius,
  };
  for (const [group, values] of Object.entries(groups)) {
    for (const [name, px] of Object.entries(values)) {
      root.style.setProperty(`--app-${group}-${name}`, `${px}px`);
    }
  }
}
