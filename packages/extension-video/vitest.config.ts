import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // jsdom because this package mounts its panel component in tests.
  // `svelteTesting()` is load-bearing: it puts `browser` ahead of `node` in
  // `resolve.conditions`; without it Svelte's SSR build loads and every test
  // touching a rune fails with `rune_outside_svelte`.
  plugins: [svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
