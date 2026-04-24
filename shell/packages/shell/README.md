# @gcscode/shell

The GCScode application shell — boots Svelte and (once the plugin system lands) hosts the plugin registry.

## Scripts
- `pnpm --filter @gcscode/shell dev` — run the dev server
- `pnpm --filter @gcscode/shell build` — production build
- `pnpm --filter @gcscode/shell test` — unit + component tests
- `pnpm --filter @gcscode/shell check` — svelte-check + tsc

## Status

Minimal shell only. The plugin-host / registry wiring lands in later tasks of the MVP plan; this README will be expanded once those files exist.
