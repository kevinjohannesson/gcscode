import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `svelteTesting()` puts `browser` ahead of `node` in `resolve.conditions`,
  // so the link state view mounts (its test opts into jsdom per file); without
  // it Svelte's SSR build loads and mounting fails with `rune_outside_svelte`.
  plugins: [svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: 'node',
  },
});
