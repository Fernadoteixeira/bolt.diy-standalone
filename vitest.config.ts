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
        // Raised thresholds reflecting expanded test coverage.
        // Current: ~10.5% stmt, ~70% branch, ~38% fn, ~10.5% line.
        // Target: 15% stmt, 70% branch, 40% fn, 15% line.
        statements: 10,
        branches: 60,
        functions: 35,
        lines: 10,
      },
    },
  },
});
