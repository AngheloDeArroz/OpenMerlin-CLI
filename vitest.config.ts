import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use Node environment (no browser DOM needed for a CLI tool)
    environment: 'node',

    // Glob for test files
    include: ['tests/**/*.test.ts'],

    // Show verbose output so each test name is visible in CI
    reporter: ['verbose'],

    // Coverage (run with: npm test -- --coverage)
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
