import { defineConfig } from '@playwright/test';

/**
 * Loads the unpacked e2e build (`pnpm build:e2e`) into Chromium and drives it against a
 * local S3-compatible server (docker compose up, or E2E_S3_ENDPOINT).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  // One worker: the run is memory-hungry and shares one S3 server.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
