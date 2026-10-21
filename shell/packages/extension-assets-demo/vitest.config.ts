import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Two departures from the other extension packages' configs, both because
  // this is the first package that *mounts* a component in its tests rather
  // than only importing one:
  //
  // - `svelteTesting()` is load-bearing, and not for the auto-cleanup its name
  //   suggests: that half is skipped whenever `globals` is true, and
  //   `@testing-library/svelte` registers its own `afterEach(cleanup)` on
  //   import anyway. What it contributes here is `browser` ahead of `node` in
  //   `resolve.conditions`. Without it Svelte's SSR build is loaded and every
  //   test touching a rune fails with `rune_outside_svelte` — measured, not
  //   assumed.
  // - `jsdom`, because validation case 29 asserts a DOM update after mount.
  plugins: [svelte(), svelteTesting()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
