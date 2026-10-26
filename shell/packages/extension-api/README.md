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

- **`context.host`** — the per-extension gate. Methods are organized into five topic namespaces:
  - **`host.commands`** — `registerCommand(command): Disposable` registers a command; `executeCommand<T>(id, ...args): Promise<T>` fires any registered command by id (cross-extension execute is intentional). The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't an extension), via the same shared implementation.
  - **`host.window`** — `registerView(view): Disposable` and `registerStatusBarItem(item): Disposable` register UI contributions.
  - **`host.keybindings`** — `registerKeybinding(keybinding): Disposable` maps a key combo to a command id.
  - **`host.extensions`** — `getExtension<T>(id): { id; exports: T } | undefined` looks up another extension's published exports.
  - **`host.configuration`** — `registerConfiguration(contribution): Disposable` registers a setting's schema and default; `getConfiguration(section?): WorkspaceConfiguration` returns a section-scoped reader/writer; `onDidChangeConfiguration(listener): Disposable` subscribes to setting changes. See the "Configuration (`host.configuration`)" section below for the full usage.
    Each `register*` call returns a `Disposable`. The host exposes no verbs at the top level — every method lives under one of the five namespaces. See ADR-0006.
- **`context.subscriptions`** — push every `Disposable` here. The host disposes them when the extension is (eventually) deactivated. See ADR-0003.
- **`context.extension`** — read-only identity (`id`, `displayName`, `version`) for the activating extension, in case you need it for log prefixes or error messages. Note this is the read-only `ExtensionIdentity` subset — `description` is on `extension.manifest`, not on `context.extension`.

## Cross-extension exports

**When to reach for this instead of asking for a host namespace.** Ask whether the host would have to own the surface your capability mutates. If yes it is a _platform_ concern and belongs in `@gcscode/extension-api` (a method on an existing `host.*` namespace, a new namespace, or a field on `ExtensionContext` when it is per-extension-scoped). If no — it is about what gcscode controls or displays, like maps, assets, live state or video — it is a _domain_ concern and ships as a **service extension**: your own package, exporting its vocabulary types and its API, consumed through the mechanism below. See [ADR-0012](../../docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md).

Two rules for a service extension's package entry point:

- **Export types, not your live registry.** Keep the singleton module-internal and reachable only through `activate()`'s return value, so shell-side code cannot import a domain registry directly.
- **Readers may resolve lazily; registrants cannot.** Reading exports per use lets a consumer skip gracefully when the service is inactive. A one-shot registration (`registerLayer`-shaped) has to resolve during your `activate()`, which makes it depend on bundle order — in that case skip the registration and log rather than throwing, unless the absence would be invisible to the operator.

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

### Writing into another extension's service

Reading a service is the easy direction. **Writing** into one — a service hands you a handle and you register things through it — has a constraint the reading side does not: the service can be disabled and re-enabled underneath you, with no reload and no notification, so a handle you captured earlier may no longer write anywhere. A gcscode service that hands out handles therefore gives them a validity signal, and the writer's job is to check it:

```ts
// Resolve per use, not once at activate(): the service may activate after you,
// or be re-enabled after a disable.
const api = resolveService();
if (api === undefined) {
  // Degrade and say so once. Do not throw — the absence is a normal state.
  return;
}
if (handle === undefined || !handle.isLive) {
  handle = api.createSource(MY_ID, MY_LABEL);
  // Anything you registered through the old handle went inert with it, so drop
  // whatever you were tracking and register it again.
}
```

**Recovery is only as fast as your own code runs again**, and that is the part worth designing around rather than discovering. A writer driven by an inbound stream re-claims on its next message — about a second, for a 1 Hz telemetry link. A writer driven by a rare event recovers only when that event next fires. **A writer that registers once during `activate()` never recovers at all**, because nothing brings it back; it is the registrant shape the section above warns about, and a disable/re-enable of the service leaves its contributions permanently missing. If that matters for your contribution, give yourself a path that runs again.

On the reading side the same "resolve per use" rule applies for a different reason. Reads inside Svelte `$derived` or template contexts auto-track the service's underlying reactive state, so a consumer re-renders when the producer activates, registers, or goes away — but only if it reads **per render**. A consumer that resolves the service once at `activate()` and caches the value it found sees a snapshot and never updates, which looks like the service being broken rather than the consumer. There is no change event to fall back on; reactivity is the contract.

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
- awaits the returned Promise (if any) for **at most 5000 ms**. Past that it logs, disposes the subscriptions anyway and stops waiting, but it cannot stop the hook: code after a slow `await` still runs, possibly after the operator has re-enabled the extension. Don't let that code clobber module state a newer activation may have set.

Use `subscriptions` for everything that fits the `Disposable` shape; reach for `deactivate?()` only when teardown does not. See [`docs/specs/2026-04-27-extension-deactivate-hook.md`](../../docs/specs/2026-04-27-extension-deactivate-hook.md).

## Activation failure

The host contains a failed `activate`, so one extension cannot cost the operator the app. Three consequences bind you as an author:

- **A failed `activate` disposes what the host minted for that extension, plus anything the extension pushed to `context.subscriptions`** — but **not** what other extensions minted for it, and not module-level state it set. If your `activate` registers into another extension's API (`MapApi.registerLayer`, say), those registrations stay live after your activation fails; if it assigns module-level state, that state survives.
- **`activate` must be synchronous.** A thenable return is an activation error: the host observes the rejection so nothing is orphaned, revokes the facade so a resumed continuation registers nothing, disposes, and records the failure — rather than publishing a `Promise` as your extension's exports, which no consumer could use.
- **`deactivate?()` is not called on the failure path**, because a hook written for a completed activation cannot be trusted after a partial one. An extension whose activation sets module state must therefore tolerate re-entry on the next load.

A failed extension stays enabled and is retried on the next reload; the operator sees the failure as a row in the extensions panel and a status-bar indicator. See [`docs/specs/2026-10-16-activation-failure-containment.md`](../../docs/specs/2026-10-16-activation-failure-containment.md).

## Conventions for extension authors

- Your package's main export must be a named `const` matching your extension's slug (e.g. `exampleExtension`, not `extension` or `default`).
- Provide stable, namespaced ids: `<extension-id>.<local-name>` (e.g. `gcscode.example.main`). Duplicate ids throw at registration; one id can be reused across the three id-keyed kinds (a view, a status bar item, and a command may all share the same id). Keybindings are keyed by their `key` field instead — duplicate keys throw separately.
- Your package must list `@gcscode/extension-api` as a dependency (`workspace:*` inside this monorepo; `peerDependency` once extensions are published externally).
- Never import RUNTIME code from `@gcscode/shell` or sibling extension packages. Never use relative paths that escape your package root. Type-only imports from sibling extension packages ARE allowed for consuming cross-extension `*Exports` types — see [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md). ESLint enforces both rules (see root `eslint.config.ts`).
