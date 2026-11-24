import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `svelteTesting()` puts `browser` ahead of `node` in `resolve.conditions`
  // for the whole package, which the map view's test needs to mount a
  // component, and registers testing-library's cleanup after each test. Only
  // that test opts into jsdom; the rest keep the node environment.
  plugins: [svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: 'node',
  },
});
