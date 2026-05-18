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

## Configuration (`host.configuration`)

User-configurable settings live on `host.configuration`. The API mirrors VS Code's `vscode.workspace.getConfiguration` / `onDidChangeConfiguration` at the call site; the schema declaration shape is imperative per [ADR-0002](../../docs/decisions/ADR-0002-imperative-activate-api.md).

### Registering a setting

```ts
context.subscriptions.push(
  context.host.configuration.registerConfiguration({
    key: 'my-namespace.my-extension.refreshIntervalMs',
    schema: {
      type: 'number',
      minimum: 100,
      maximum: 60_000,
      description: 'How often to poll the upstream source, in milliseconds.',
    },
    default: 1000,
  }),
);
```

The `key` must start with your extension id; the `schema` is a JSON Schema Draft 07 object (TypeScript type: `JSONSchema7` re-exported from `@gcscode/extension-api`). The `default` is validated at registration; an invalid default throws synchronously.

### Reading a setting

```ts
const cfg = context.host.configuration.getConfiguration('my-namespace.my-extension');

// Returns T | undefined (no default value):
const interval = cfg.get<number>('refreshIntervalMs');
```

Or, with a fallback for unregistered keys:

```ts
// Returns T (falls back to the supplied default when the key is unregistered):
const intervalOrDefault = cfg.get<number>('refreshIntervalMs', 1000);
```

### Observing changes

```ts
context.subscriptions.push(
  context.host.configuration.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('my-namespace.my-extension.refreshIntervalMs')) {
      // re-read and apply
    }
  }),
);
```

### Reactive reads in Svelte

`cfg.get(...)` reads from a `SvelteMap`-backed store inside the call body. Reads inside `$derived` / template contexts auto-track and re-render on `update()`. **This is a different mechanism from ADR-0005's `$state`-proxy cross-extension exports** (property reactivity vs. map-key reactivity); both produce equivalent ergonomics for Svelte consumers.

Reads cached into local variables outside a reactive context do NOT auto-track. Use `onDidChangeConfiguration` for non-Svelte consumers OR Svelte consumers caching reads.

### Writing a setting

```ts
await cfg.update('refreshIntervalMs', 2000);
```

`update` returns `Promise<void>` and rejects on schema mismatch, unregistered key, unsupported target (`ConfigurationTarget.Workspace`/`WorkspaceFolder` reject in v1 with `'Target not supported in v1'`), or persistence failure (`'Persistence failed: <reason>'`). In-memory commit and listener invocations happen BEFORE persistence — listeners observe the new value even if the persist step subsequently rejects.

### Trust posture

- Registration is **strict-prefix**: an extension can only register settings whose key starts with its own id.
- Reads are **open**: any extension can read any registered key.
- Writes are **open after registration**: any extension can write any registered key. The strict-prefix rule applies at registration only. Capability-gating for cross-extension writes is deferred per [ADR-0003](../../docs/decisions/ADR-0003-plugin-api-refinements.md).

### Operator UX in v1

There is no settings editor UI in v1. Operators flip values via browser devtools:

```js
const cfg = JSON.parse(localStorage.getItem('gcscode.configuration') ?? '{}');
cfg['my-namespace.my-extension.refreshIntervalMs'] = 2000;
localStorage.setItem('gcscode.configuration', JSON.stringify(cfg));
location.reload();
```

Known sharp edges of the devtools-only path: silent schema-validation failure on reload (the bad value stays in the blob, `get()` returns the default, no UI surface for the warning), no live-sync of devtools edits (reload required), and no UI surface for persistence-failure rejections from `update()`. A status-bar / boot-banner signal is a future iteration.

For the full design rationale see [`docs/specs/2026-05-18-configuration-system-v1.md`](../../docs/specs/2026-05-18-configuration-system-v1.md).

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
