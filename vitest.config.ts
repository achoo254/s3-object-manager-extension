import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    // Keep memory use low on shared dev machines.
    maxWorkers: 2,
  },
});
