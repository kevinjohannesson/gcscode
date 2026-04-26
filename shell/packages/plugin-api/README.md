# @gcscode/plugin-api

The only import path for plugins. Everything a plugin is allowed to do flows through the types in this package.

## Stability

Experimental. The surface is expected to change as permissions, lifecycle, and additional contribution kinds are added. The current version exposes a small, deliberately minimal set of UI contribution kinds.

## Usage

```ts
import type { Plugin } from '@gcscode/plugin-api';
import View from './view.svelte';
import StatusBadge from './status-badge.svelte';

export const myPlugin: Plugin = {
  id: 'my-namespace.my-plugin',
  displayName: 'My Plugin',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'my-namespace.my-plugin.main',
        component: View,
      }),
      context.host.registerStatusBarItem({
        id: 'my-namespace.my-plugin.status',
        component: StatusBadge,
        alignment: 'right',
      }),
    );
  },
};
```

See `packages/plugin-example/` for the canonical worked example.

## The activation context

`activate(context)` receives a `PluginContext`:

- **`context.host`** — the per-plugin gate. Exposes one `register*` method per contribution kind (today: `registerView`, `registerStatusBarItem`). Each call returns a `Disposable`.
- **`context.subscriptions`** — push every `Disposable` here. The host disposes them when the plugin is (eventually) deactivated. See ADR-0003.
- **`context.plugin`** — read-only identity (`id`, `displayName`, `version`) for the activating plugin, in case you need it for log prefixes or error messages.

## Conventions for plugin authors

- Your package's main export must be a named `const` matching your plugin's slug (e.g. `examplePlugin`, not `plugin` or `default`).
- Provide stable, namespaced ids: `<plugin-id>.<local-name>` (e.g. `gcscode.example.main`). Duplicate ids throw at registration (one id can be reused across contribution kinds — a view and a status bar item may share the same id).
- Your package must list `@gcscode/plugin-api` as a dependency (`workspace:*` inside this monorepo; `peerDependency` once plugins are published externally).
- Never import from `@gcscode/shell`. Never use relative paths that escape your package root. ESLint enforces this (see root `eslint.config.ts`).
