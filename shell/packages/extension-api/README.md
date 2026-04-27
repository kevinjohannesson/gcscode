# @gcscode/extension-api

The only import path for extensions. Everything an extension is allowed to do flows through the types in this package.

## Stability

Experimental. The surface is expected to change as permissions, lifecycle, and additional contribution kinds are added. The current version exposes a small, deliberately minimal set of contribution kinds.

## Usage

```ts
import type { Extension } from '@gcscode/extension-api';
import View from './view.svelte';
import StatusBadge from './status-badge.svelte';

export const myExtension: Extension = {
  id: 'my-namespace.my-extension',
  displayName: 'My Extension',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'my-namespace.my-extension.main',
        component: View,
      }),
      context.host.registerStatusBarItem({
        id: 'my-namespace.my-extension.status',
        component: StatusBadge,
        alignment: 'right',
      }),
      context.host.registerCommand({
        id: 'my-namespace.my-extension.greet',
        run: () => 'Hello',
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+G',
        command: 'my-namespace.my-extension.greet',
      }),
    );

    // Commands can be invoked by id from anywhere on the host:
    //   context.host.executeCommand('my-namespace.my-extension.greet')
    // — or fired by a registered keybinding when the user presses Alt+Shift+G.
  },
};
```

See `packages/extension-example/` for the canonical worked example.

## The activation context

`activate(context)` receives an `ExtensionContext`:

- **`context.host`** — the per-extension gate. Exposes one `register*` method per contribution kind (today: `registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) plus the verb `executeCommand<T>(id, ...args): Promise<T>` for firing any registered command by id. Each `register*` call returns a `Disposable`. The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't an extension), via the same shared implementation.
- **`context.subscriptions`** — push every `Disposable` here. The host disposes them when the extension is (eventually) deactivated. See ADR-0003.
- **`context.extension`** — read-only identity (`id`, `displayName`, `version`) for the activating extension, in case you need it for log prefixes or error messages.

## Conventions for extension authors

- Your package's main export must be a named `const` matching your extension's slug (e.g. `exampleExtension`, not `extension` or `default`).
- Provide stable, namespaced ids: `<extension-id>.<local-name>` (e.g. `gcscode.example.main`). Duplicate ids throw at registration; one id can be reused across the three id-keyed kinds (a view, a status bar item, and a command may all share the same id). Keybindings are keyed by their `key` field instead — duplicate keys throw separately.
- Your package must list `@gcscode/extension-api` as a dependency (`workspace:*` inside this monorepo; `peerDependency` once extensions are published externally).
- Never import from `@gcscode/shell`. Never use relative paths that escape your package root. ESLint enforces this (see root `eslint.config.ts`).
