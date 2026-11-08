# @gcscode/shell

The GCScode application shell. Boots Svelte, constructs the extension registry, activates extensions, and renders their contributions.

## Scripts

- `pnpm --filter @gcscode/shell dev` — run the dev server
- `pnpm --filter @gcscode/shell build` — production build
- `pnpm --filter @gcscode/shell test` — unit + component tests
- `pnpm --filter @gcscode/shell check` — svelte-check + tsc

## How the pieces fit

- `src/extension-host/registry.ts` — `createRegistry()` returns a `Registry` that owns one `Map` per contribution kind and mints a fresh `ExtensionHost` per extension internally during `registry.activate(extension)`.
- `src/main.ts` — creates the registry, synchronously calls `registry.activate(extension)` for each extension, then mounts `app.svelte` with the registry as a prop. All activations must complete before mount; see the invariant comment in `registry.ts`.
- `src/app.svelte` — reads `registry.listViews()` and `registry.listStatusBarItems()` via `$derived`, renders the view contributions in the content section, and renders the status bar items in a footer with two derived left/right groups. Shows an empty-state when no views are registered. Commands and keybindings are not rendered by `app.svelte` — commands are called by id via `host.executeCommand` (or via `registry.executeCommand` from shell-core code such as the keybinding dispatcher), and keybindings are dispatched by `src/keybinding-dispatcher.ts`. `registry.listCommands()` and `registry.listKeybindings()` exist for future palette / introspection consumers.
- `src/keybinding-dispatcher.ts` — `attachKeybindingDispatcher(registry, target)` listens for `keydown` events on `target` (typically `document`), iterates `registry.listKeybindings()`, and fires the matched command via `registry.executeCommand`. Returns a `Disposable` for teardown. Wired from `main.ts` after extension activation.

Static imports only: extensions are currently listed by package name in `main.ts`. Dynamic/runtime loading is out of scope for now (see `docs/out-of-scope.md`).
