# @gcscode/shell

The GCScode application shell. Boots Svelte, constructs the plugin registry, activates plugins, and renders their contributions.

## Scripts

- `pnpm --filter @gcscode/shell dev` — run the dev server
- `pnpm --filter @gcscode/shell build` — production build
- `pnpm --filter @gcscode/shell test` — unit + component tests
- `pnpm --filter @gcscode/shell check` — svelte-check + tsc

## How the pieces fit

- `src/plugin-host/registry.ts` — `createRegistry()` returns a `Registry` that owns one `Map` per contribution kind and mints a fresh `PluginHost` per plugin internally during `registry.activate(plugin)`.
- `src/main.ts` — creates the registry, synchronously calls `registry.activate(plugin)` for each plugin, then mounts `app.svelte` with the registry as a prop. All activations must complete before mount; see the invariant comment in `registry.ts`.
- `src/app.svelte` — reads `registry.listViews()` and `registry.listStatusBarItems()` via `$derived`, renders the view contributions in the content section, and renders the status bar items in a footer with two derived left/right groups. Shows an empty-state when no views are registered.

Static imports only: plugins are currently listed by package name in `main.ts`. Dynamic/runtime loading is out of scope for now (see `docs/out-of-scope.md`).
