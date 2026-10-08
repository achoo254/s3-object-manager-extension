#!/usr/bin/env node
/**
 * Fails when the Vietnamese and English message files do not have exactly the same keys, or
 * when source code uses a literal message key that neither file defines.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const locales = ['vi', 'en'];

function flatten(object, prefix = '') {
  return Object.entries(object).flatMap(([key, value]) =>
    value !== null && typeof value === 'object'
      ? flatten(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(vue|ts)$/.test(name) ? [path] : [];
  });
}

const keys = Object.fromEntries(
  locales.map((locale) => [
    locale,
    new Set(flatten(JSON.parse(readFileSync(join(root, `src/i18n/${locale}.json`), 'utf8')))),
  ]),
);

const problems = [];
for (const locale of locales) {
  for (const other of locales) {
    if (locale === other) continue;
    for (const key of keys[locale]) {
      if (!keys[other].has(key))
        problems.push(`${other}.json is missing "${key}" (present in ${locale}.json)`);
    }
  }
}

const literalKey = /\b(?:t|notify)\(\s*'([A-Za-z0-9_.]+)'/g;
for (const file of sourceFiles(join(root, 'src'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(literalKey)) {
    const key = match[1];
    for (const locale of locales) {
      if (!keys[locale].has(key)) {
        problems.push(`${relative(root, file)} uses "${key}", missing in ${locale}.json`);
      }
    }
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} i18n problem(s).`);
  process.exit(1);
}
console.log(`i18n OK: ${keys.vi.size} keys in each of ${locales.join(', ')}.`);
