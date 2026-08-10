import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'app/**/*.spec.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/tests/e2e/**', // E2E tests run separately with Playwright
    ],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary', 'lcov'],
      include: ['app/**/*.ts', 'app/**/*.tsx'],
      exclude: [
        'app/**/*.spec.ts',
        'app/**/*.spec.tsx',
        'app/**/*.test.ts',
        'app/**/*.test.tsx',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        'build/**',
        '**/node_modules/**',
        '**/dist/**',
        'electron/**',
        'scripts/**',
      ],
      thresholds: {
        // Conservative starting thresholds — set just below current coverage
        // so CI passes on day one. Raise these incrementally as tests are added.
        // Target: 10% statements, 15% branches, 10% functions, 10% lines.
        statements: 7,
        branches: 15,
        functions: 10,
        lines: 7,
      },
    },
  },
});
