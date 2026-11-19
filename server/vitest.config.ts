import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Every test file empties the one test database, so they take turns.
    fileParallelism: false,
  },
});
