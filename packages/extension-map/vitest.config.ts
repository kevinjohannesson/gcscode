import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Two projects. The map view's test runs real MapLibre, through map-gl-svelte,
// in headless Chromium: the library drives MapLibre's camera transform, which
// no jsdom stand-in reproduces. Everything else keeps the node environment.
const BROWSER_TESTS = ['src/map-view.test.ts'];

export default defineConfig({
  plugins: [svelte()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: BROWSER_TESTS,
          // The entry point imports the view, which imports MapLibre's CSS:
          // inlined, it goes through Vite's transform instead of Node's loader.
          server: { deps: { inline: ['maplibre-gl'] } },
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: BROWSER_TESTS,
          // Headless Chromium caps live WebGL contexts.
          fileParallelism: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
