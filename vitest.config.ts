import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/billing-core/src/**'],
      thresholds: { lines: 95, functions: 95, branches: 95, statements: 95 },
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'] },
      },
      // Storybook story tests: defined in packages/ui/vitest.config.ts (browser mode).
      'packages/ui',
    ],
  },
});
