import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

/**
 * Provider checks in tests/integration against a real S3-compatible endpoint. They are
 * skipped unless S3_TEST_ENDPOINT is set; docs/compatibility.md lists the variables.
 */
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
    maxWorkers: 1,
  },
});
