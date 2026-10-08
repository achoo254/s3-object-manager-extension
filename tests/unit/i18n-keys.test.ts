import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import vi from '@/i18n/vi.json';
import { browserLocale } from '@/i18n';

/** Keys built at runtime from a fixed set of values (the key check script only sees literals). */
const dynamicKeys = [
  ...['weak', 'fair', 'strong'].map((v) => `vault.strength.${v}`),
  ...['queued', 'running', 'paused', 'done', 'error', 'cancelled'].map((v) => `upload.status.${v}`),
  ...['hour', 'day', 'week'].map((v) => `share.duration.${v}`),
  ...['system', 'light', 'dark'].map((v) => `settings.theme.${v}`),
  ...['rename', 'copy'].flatMap((v) => [
    `transfer.title.${v}`,
    `transfer.confirm.${v}`,
    `transfer.run.${v}`,
  ]),
  ...['invalid', 'unsupportedScheme', 'insecureRemote'].map(
    (v) => `connections.form.endpointProblem.${v}`,
  ),
];

function messageAt(messages: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      messages,
    );
}

describe('i18n', () => {
  it.each(dynamicKeys)('%s exists in both languages', (key) => {
    expect(typeof messageAt(vi, key)).toBe('string');
    expect(typeof messageAt(en, key)).toBe('string');
  });

  it('picks Vietnamese for vi* browser languages and English otherwise', () => {
    expect(browserLocale('vi')).toBe('vi');
    expect(browserLocale('vi-VN')).toBe('vi');
    expect(browserLocale('en-US')).toBe('en');
    expect(browserLocale('fr')).toBe('en');
  });
});
