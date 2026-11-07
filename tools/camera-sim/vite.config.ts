import { defineConfig } from 'vitest/config';

// Local-first: the dev server listens on localhost only. To open the sim from
// another machine on the LAN, start it with `--host` (see README).
export default defineConfig({
  server: { port: 5174 },
  // three.js alone is ~500 kB minified; this is a local tool, not a page on a budget.
  build: { chunkSizeWarningLimit: 1000 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
