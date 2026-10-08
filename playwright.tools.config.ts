import { defineConfig } from '@playwright/test';

/**
 * Tools that drive the e2e build but are not part of CI:
 * - performance measurements (docs/performance.md) — large files and many objects, run on an
 *   otherwise idle machine: `pnpm build:e2e && pnpm perf`
 * - store screenshots (docs/store/) — `pnpm build:e2e && pnpm screenshots`
 */
export default defineConfig({
  testDir: 'tests/tools',
  timeout: 60 * 60_000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
});
