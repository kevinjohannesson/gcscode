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
  manifest: {
    id: 'my-namespace.my-extension',
    displayName: 'My Extension',
    version: '0.0.0',
    description:
      'Demo extension that contributes a view, a status item, a command, and a keybinding.',
  },
  activate(context) {
    context.subscriptions.push(
      context.host.window.registerView({
        id: 'my-namespace.my-extension.main',
        component: View,
      }),
      context.host.window.registerStatusBarItem({
        id: 'my-namespace.my-extension.status',
        component: StatusBadge,
        alignment: 'right',
      }),
      context.host.commands.registerCommand({
        id: 'my-namespace.my-extension.greet',
        run: () => 'Hello',
      }),
      context.host.keybindings.registerKeybinding({
        key: 'Alt+Shift+G',
        command: 'my-namespace.my-extension.greet',
      }),
    );

    // Commands can be invoked by id from anywhere on the host:
    //   context.host.commands.executeCommand('my-namespace.my-extension.greet')
    // — or fired by a registered keybinding when the user presses Alt+Shift+G.
  },
};
```

See `packages/extension-example/` for the canonical worked example.

## The extension shape

An extension package exports a named `const` of type `Extension` carrying:

- **`manifest: ExtensionManifest`** — declaration-level metadata.
  - **`id`** — stable string id; convention is `<namespace>.<slug>` (e.g. `gcscode.example`).
  - **`displayName`** — user-facing name.
  - **`version`** — semver string.
  - **`description?`** — optional one-liner shown by host UI (e.g. the extensions panel) when present.
- **`activate(context)`** — entry point; called by the host on enable.
- **`deactivate?()`** — optional non-disposable / async cleanup hook.

The manifest is the structured home for descriptive metadata. It grows per-field as real consumers pull on additional fields (`category?`, `icon?`, etc.). See [ADR-0007](../../docs/decisions/ADR-0007-extension-manifest.md) for the manifest's iteration scope and growth conventions.

## The activation context

`activate(context)` receives an `ExtensionContext`:

- **`context.host`** — the per-extension gate. Methods are organized into four topic namespaces:
  - **`host.commands`** — `registerCommand(command): Disposable` registers a command; `executeCommand<T>(id, ...args): Promise<T>` fires any registered command by id (cross-extension execute is intentional). The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't an extension), via the same shared implementation.
  - **`host.window`** — `registerView(view): Disposable` and `registerStatusBarItem(item): Disposable` register UI contributions.
  - **`host.keybindings`** — `registerKeybinding(keybinding): Disposable` maps a key combo to a command id.
  - **`host.extensions`** — `getExtension<T>(id): { id; exports: T } | undefined` looks up another extension's published exports.
    Each `register*` call returns a `Disposable`. The host exposes no verbs at the top level — every method lives under one of the four namespaces. See ADR-0006.
- **`context.subscriptions`** — push every `Disposable` here. The host disposes them when the extension is (eventually) deactivated. See ADR-0003.
- **`context.extension`** — read-only identity (`id`, `displayName`, `version`) for the activating extension, in case you need it for log prefixes or error messages. Note this is the read-only `ExtensionIdentity` subset — `description` is on `extension.manifest`, not on `context.extension`.

## Cross-extension exports

`activate(context)` may return a value that becomes the extension's published exports. Other extensions look it up via `context.host.extensions.getExtension<T>(id)?.exports`. Producers that don't expose an API may return nothing.

```ts
export interface MyExports {
  readonly thing: Thing;
}

export const myExtension: Extension = {
  manifest: {
    id: 'my-namespace.my-extension',
    displayName: 'My Extension',
    version: '0.0.0',
  },
  activate(context): MyExports {
    // ...
    return { thing };
  },
};
```

Consumers `import type { MyExports } from '@my-namespace/extension-my-extension'` and read the live value at runtime via `getExtension`. The `T` generic on `getExtension` is unsafe sugar — producers and consumers commit to a shared type contract via the producer's exported `*Exports` type. Reads inside Svelte `$derived` / template contexts auto-track the underlying registry: consumers re-render when the producer enables / disables.

See [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) for the full design and `@gcscode/extension-vehicle-status` for the canonical consumer.

## Lifecycle (`deactivate?()`)

`Extension` may declare an optional `deactivate?(): void | Promise<void>` method for non-disposable / async cleanup (closing connections, flushing queues, awaiting workers). The host:

- runs the hook **before** disposing `context.subscriptions`,
- catches and logs hook errors (sync throw or async rejection); subscription teardown still proceeds,
- awaits the returned Promise (if any).

Use `subscriptions` for everything that fits the `Disposable` shape; reach for `deactivate?()` only when teardown does not. See [`docs/specs/2026-04-27-extension-deactivate-hook.md`](../../docs/specs/2026-04-27-extension-deactivate-hook.md).

## Conventions for extension authors

- Your package's main export must be a named `const` matching your extension's slug (e.g. `exampleExtension`, not `extension` or `default`).
- Provide stable, namespaced ids: `<extension-id>.<local-name>` (e.g. `gcscode.example.main`). Duplicate ids throw at registration; one id can be reused across the three id-keyed kinds (a view, a status bar item, and a command may all share the same id). Keybindings are keyed by their `key` field instead — duplicate keys throw separately.
- Your package must list `@gcscode/extension-api` as a dependency (`workspace:*` inside this monorepo; `peerDependency` once extensions are published externally).
- Never import RUNTIME code from `@gcscode/shell` or sibling extension packages. Never use relative paths that escape your package root. Type-only imports from sibling extension packages ARE allowed for consuming cross-extension `*Exports` types — see [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md). ESLint enforces both rules (see root `eslint.config.ts`).
