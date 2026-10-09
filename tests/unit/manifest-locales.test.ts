import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Chrome Web Store rejects uploads whose manifest strings exceed these lengths. */
const MAX_NAME = 75;
const MAX_DESCRIPTION = 132;

const localesDir = new URL('../../public/_locales/', import.meta.url);
const locales = readdirSync(localesDir);

describe('manifest locale strings', () => {
  it.each(locales)('%s fits the store limits', (locale) => {
    const messages = JSON.parse(
      readFileSync(new URL(`${locale}/messages.json`, localesDir), 'utf8'),
    ) as Record<string, { message: string }>;
    expect([...(messages.extName?.message ?? '')].length).toBeLessThanOrEqual(MAX_NAME);
    expect([...(messages.extDescription?.message ?? '')].length).toBeLessThanOrEqual(
      MAX_DESCRIPTION,
    );
  });
});
