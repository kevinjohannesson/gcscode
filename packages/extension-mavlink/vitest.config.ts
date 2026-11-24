import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `svelteTesting()` puts `browser` ahead of `node` in `resolve.conditions`,
  // which the Map input view's test needs to mount a component (it opts into
  // jsdom itself); the rest of the package keeps running under node.
  plugins: [svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: 'node',
  },
});
