# @gcscode/plugin-api

The only import path for plugins. Everything a plugin is allowed to do flows through the types in this package.

## Stability

Experimental. The surface is expected to change as permissions, lifecycle, and additional contribution kinds are added. Current version intentionally exposes the minimum needed to register one kind of UI contribution.

## Usage

```ts
import type { Plugin } from '@gcscode/plugin-api';
import View from './view.svelte';

export const myPlugin: Plugin = {
  activate(host) {
    host.registerContribution({ kind: 'content', component: View });
  },
};
```

See `packages/plugin-example/` for the canonical worked example.

## Conventions for plugin authors

- Your package's main export must be a named `const` matching your plugin's slug (e.g. `examplePlugin`, not `plugin` or `default`).
- Your package must list `@gcscode/plugin-api` as a dependency (`workspace:*` inside this monorepo; `peerDependency` once plugins are published externally).
- Never import from `@gcscode/shell`. Never use relative paths that escape your package root. ESLint enforces this (see root `eslint.config.ts`).
