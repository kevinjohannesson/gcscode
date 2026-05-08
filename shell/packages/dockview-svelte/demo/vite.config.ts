import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [svelte()],
  resolve: {
    alias: {
      // Run the demo against the package source directly — no build step.
      'dockview-svelte': path.resolve(__dirname, '../src/index.ts'),
    },
  },
  server: {
    // Avoid clashing with the shell's port 5173.
    port: 5174,
  },
});
