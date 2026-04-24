# @gcscode/shell

The GCScode application shell. Boots Svelte, constructs the plugin registry, activates plugins, and renders their contributions.

## Scripts
- `pnpm --filter @gcscode/shell dev` — run the dev server
- `pnpm --filter @gcscode/shell build` — production build
- `pnpm --filter @gcscode/shell test` — unit + component tests
- `pnpm --filter @gcscode/shell check` — svelte-check + tsc

## Architecture notes
- `src/plugin-host/registry.ts` owns contributions.
- `src/main.ts` creates the registry, activates plugins, and mounts `app.svelte` with the registry as a prop.
- The shell imports plugins by package name (e.g., `@gcscode/plugin-example`). Static import is intentional for this step; dynamic loading is out of scope.
