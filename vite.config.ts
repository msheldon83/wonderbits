/// <reference types="vitest/config" />
import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The commit this build is, so what children did can be tied to the levels as they were. A deploy sets APP_VERSION.
process.env.VITE_APP_VERSION ??=
  process.env.APP_VERSION ||
  (() => {
    try {
      return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return 'dev';
    }
  })();

export default defineConfig({
  // GitHub Pages serves a project site under /<repo>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
  // With accounts on, the server (see server/README.md) answers /api; in development it runs beside Vite.
  server: { host: true, proxy: { '/api': process.env.API_URL ?? 'http://localhost:8080' } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
