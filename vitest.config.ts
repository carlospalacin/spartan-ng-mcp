import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/data/types.ts',
        'src/project/types.ts',
        'src/tools/**',
        'src/resources/**',
        'src/prompts/**',
      ],
      thresholds: {
        lines: 95,
        functions: 90,
        branches: 80,
        statements: 95,
      },
    },
  },
});
