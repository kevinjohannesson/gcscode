# @gcscode/shell

The GCScode application shell. Boots Svelte, constructs the plugin registry, activates plugins, and renders their contributions.

## Scripts

- `pnpm --filter @gcscode/shell dev` — run the dev server
- `pnpm --filter @gcscode/shell build` — production build
- `pnpm --filter @gcscode/shell test` — unit + component tests
- `pnpm --filter @gcscode/shell check` — svelte-check + tsc

## How the pieces fit

- `src/plugin-host/registry.ts` — `createRegistry()` returns a `Registry` that owns the contribution list and mints a fresh `PluginHost` per plugin via `createHost()`.
- `src/main.ts` — creates the registry, synchronously calls each plugin's `activate(host)`, then mounts `app.svelte` with the registry as a prop. All activations must complete before mount; see the comment in `registry.ts`.
- `src/app.svelte` — reads `registry.listContributions('content')` via `$derived` and renders each contribution's component. Shows an empty-state when nothing is registered.

Static imports only: plugins are currently listed by package name in `main.ts`. Dynamic/runtime loading is out of scope for now (see `docs/out-of-scope.md`).
