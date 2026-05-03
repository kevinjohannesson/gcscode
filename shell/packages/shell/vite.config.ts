import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte(), svelteTesting()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    server: {
      // maplibre-gl ships a side-effect CSS import (`maplibre-gl/dist/maplibre-gl.css`)
      // that vitest's default externalize-from-node_modules path can't load.
      // Inlining maplibre-gl routes the CSS through Vite's transform pipeline.
      deps: { inline: ['maplibre-gl'] },
    },
  },
});
