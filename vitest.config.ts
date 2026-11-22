import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/billing-core/src/**'],
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
  },
});
