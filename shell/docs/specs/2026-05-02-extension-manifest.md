# Extension manifest — presentation metadata extraction

**Status:** Approved (2026-05-02)

## Context

The next iteration after this one is a "(crude) UI" for enabling and disabling extensions, with marketplace-styled rows that show per-extension descriptions. The marketplace UI cannot render descriptions without per-extension metadata that's not on `Extension` today.

The alignment ledger Divergences row "Extension shape" carries the trigger "Manifest deferral lands → re-evaluate." The trigger fires here. Three real choices were considered (B-lite: `description?` flat on `Extension`; B-manifest: lift presentation metadata into a structured `ExtensionManifest`; B-full: pull the whole declarative `contributes` map). The decision is recorded in [ADR-0007](../decisions/ADR-0007-extension-manifest.md): adopt **B-manifest**, scoped to descriptive metadata only — `description?` is the one new field this iteration. Future descriptive fields (`category?`, `icon?`, `categories?`) land per-field as triggers fire; the `contributes` arrays remain deferred under sharper trigger language.

This iteration ships the type change, migrates the three first-party extensions plus the workbench built-in, propagates docs, and renames the host-side `extension-manifest.ts` (B4's `bundledExtensions` array) to `bundled-extensions.ts` to free the "manifest" term for the public concept.

The marketplace UI iteration that motivated this is its own brainstorm + spec + plan. It runs after this one lands.

## Goals

- New ADR-0007 at `docs/decisions/ADR-0007-extension-manifest.md` recording the decision (**already landed alongside this spec**).
- New `ExtensionManifest` interface in `@gcscode/extension-api/src/index.ts` extending `ExtensionIdentity` with `description?: string`.
- `Extension` in `@gcscode/extension-api/src/index.ts` no longer extends `ExtensionIdentity`; gains `manifest: ExtensionManifest`. Identity fields move into `manifest`.
- Update `packages/shell/src/extension-host/registry.ts` so `activate(extension)` reads identity from `extension.manifest.*` instead of flat `extension.*`. The `ExtensionIdentity` value built locally for `ExtensionContext.extension` is unchanged in shape.
- Update `packages/shell/src/extension-host/extension-manager.ts`: `ExtensionRecord` shape moves from flat `{ id, displayName, version, enabled }` to nested `{ manifest, enabled }`; `register` and `setEnabled` read identity via `extension.manifest.id`.
- Rename `packages/shell/src/extension-host/extension-manifest.ts` to `bundled-extensions.ts`. Rename the exported `ManifestEntry` type to `BundledExtensionEntry`. Update the `id: ext.id` property in each row to `id: ext.manifest.id`. Co-located test file renames in lockstep.
- Update `packages/shell/src/main.ts` import path (`./extension-host/extension-manifest` → `./extension-host/bundled-extensions`).
- Migrate the three first-party extensions (`extension-example`, `extension-sitl`, `extension-vehicle-status`) to manifest-shaped `Extension` literals.
- Migrate the `createWorkbenchExtension` factory in `packages/shell/src/built-in/workbench/index.ts` to manifest-shaped return.
- Update affected test files. Pattern is uniform across all sites: every `Extension` literal `{ id, displayName, version, activate, [deactivate] }` becomes `{ manifest: { id, displayName, version }, activate, [deactivate] }`. No new tests; coverage and assertions unchanged.
- Doc propagation: `packages/extension-api/README.md` (Usage example, Conventions, Cross-extension exports example), `packages/extension-example/README.md` (Anatomy + What it demonstrates), `docs/roadmap.md` (B4 rename for clarity + new B5 line for this iteration), `docs/vs-code-alignment.md` (Divergences row update + new Alignments row), `docs/decisions/ADR-0003-plugin-api-refinements.md` (Follow-ups bullet), `docs/out-of-scope.md` (tighten the Declarative `contributes` manifest entry).

## Non-goals

- **No `category` / `icon` / `categories` / `engines` / `extensionDependencies` / `activationEvents`** on `ExtensionManifest`. `description?` is the only new field this iteration. Future descriptive fields land per-field as triggers fire (the marketplace UI may pull `category?` next).
- **No `contributes.commands` / `contributes.views` / `contributes.keybindings`** static arrays. Runtime registration stays imperative via `host.commands.registerCommand` etc. The contributes manifest is its own future ADR with sharper trigger language ("settings UI for individual contributions / first untrusted extension module / first third-party producer-consumer pair").
- **No marketplace UI / extensions panel.** The UI iteration that motivated this manifest extraction is brainstormed and shipped separately, after this lands. The marketplace UI is the first consumer of `manifest.description`.
- **No deprecation period.** Hard break — `Extension` no longer carries top-level identity fields; all consumers (three first-party extensions, the workbench built-in, host code, ~40 test extensions) update in this iteration. Three bundled extensions; deprecation cruft adds zero value.
- **No new tests.** TypeScript enforces the new shape at compile time. Existing tests touch every code path that the migration affects; running `pnpm test` post-migration is the regression check.
- **No `ExtensionContext.extension` shape change.** It stays typed as `ExtensionIdentity` (read-only `id` / `displayName` / `version`). Extensions read `context.extension.id` exactly as today. The host derives the context-side identity from `extension.manifest`.
- **No `ExtensionIdentity` removal.** `ExtensionIdentity` keeps earning its keep as the read-only minimal shape inside `ExtensionContext`. `ExtensionManifest extends ExtensionIdentity`.

## `@gcscode/extension-api/src/index.ts` — type changes

The `Disposable`, `ViewContribution`, `StatusBarItemContribution`, `CommandContribution`, `KeybindingContribution`, `QuickPickItem`, `QuickPickOptions`, `ExtensionHost`, and `ExtensionContext` interfaces are unchanged.

`ExtensionIdentity` is unchanged.

A new interface lands directly after `ExtensionIdentity`:

```ts
/**
 * Per-extension declaration metadata. Extends `ExtensionIdentity` with
 * presentation fields used by host UI (e.g. the marketplace / extensions panel).
 *
 * Iteration scope is descriptive metadata only: identity (`id`, `displayName`,
 * `version`) and `description?`. Future descriptive fields (`category?`,
 * `icon?`, `categories?`) land per-field on this interface as real consumers
 * pull on them. Declarative `contributes` arrays (commands, views, keybindings
 * as static lists) are deferred under sharper trigger language; see ADR-0007.
 */
export interface ExtensionManifest extends ExtensionIdentity {
  /**
   * One-line user-facing description. Rendered by host UI (extensions panel
   * rows, marketplace previews) when present. No length cap; UIs may truncate.
   */
  readonly description?: string;
}
```

The `Extension` interface is rewritten. Old:

```ts
export interface Extension extends ExtensionIdentity {
  activate(context: ExtensionContext): unknown;
  deactivate?(): void | Promise<void>;
}
```

New:

```ts
/**
 * An extension module's named export. The `manifest` carries identity and
 * descriptive metadata; `activate(context)` is the single entry point.
 *
 * Returning a value from `activate()` publishes that value as the extension's
 * exports — other extensions can look it up via
 * `host.extensions.getExtension(id)` (see ADR-0005). Producers that don't
 * expose an API may return nothing.
 *
 * `deactivate?()` is an optional hook for non-disposable / async cleanup. The
 * host awaits the returned Promise (if any) before tearing down subscriptions.
 *
 * See ADR-0007 for the manifest's shape and growth conventions.
 */
export interface Extension {
  readonly manifest: ExtensionManifest;
  activate(context: ExtensionContext): unknown;
  deactivate?(): void | Promise<void>;
}
```

All other interface and helper-type declarations in the file are byte-identical.

## `packages/shell/src/extension-host/registry.ts` — identity reads

Inside `createRegistry`, the `activate(extension)` body builds a local `identity: ExtensionIdentity` from the incoming `extension`. Three reads change source:

| Old (line ~152)            | New                                  |
| -------------------------- | ------------------------------------ |
| `id: extension.id`         | `id: extension.manifest.id`          |
| `displayName: extension.displayName` | `displayName: extension.manifest.displayName` |
| `version: extension.version`         | `version: extension.manifest.version`         |

The `identity` object's shape is unchanged; only the source path changes. Everything downstream (the `createHost(identity)` call, the `subscriptionsByExtension.set(identity.id, ...)` call, the `deactivateHooksByExtension` and `exportsByExtension` writes, the `context.extension = identity` field) keeps reading from the local `identity` and is byte-identical.

The `Registry` interface (`activate`, `deactivate`, `list*`, `executeCommand`) is unchanged. The `createHost` factory body is unchanged. The four contribution `SvelteMap`s, the `exportsByExtension` `SvelteMap`, the `subscriptionsByExtension` and `deactivateHooksByExtension` plain `Map`s, and the `execute<T>(id, args, attribution)` helper are byte-identical.

## `packages/shell/src/extension-host/extension-manager.ts` — `ExtensionRecord` reshape

The `ExtensionRecord` interface moves from flat to nested:

```ts
// Old
export interface ExtensionRecord {
  id: string;
  displayName: string;
  version: string;
  enabled: boolean;
}

// New
export interface ExtensionRecord {
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
}
```

`ExtensionManifest` is imported from `@gcscode/extension-api` at the top of the file alongside `Extension`.

The `toRecord(state: ExtensionState): ExtensionRecord` helper changes accordingly:

```ts
// Old
function toRecord(state: ExtensionState): ExtensionRecord {
  return {
    id: state.extension.id,
    displayName: state.extension.displayName,
    version: state.extension.version,
    enabled: state.enabled,
  };
}

// New
function toRecord(state: ExtensionState): ExtensionRecord {
  return {
    manifest: state.extension.manifest,
    enabled: state.enabled,
  };
}
```

Inside the returned `register` and `setEnabled` methods, two reads change source:

| Old                                               | New                                                              |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `if (extensions.has(extension.id)) { ... }`       | `if (extensions.has(extension.manifest.id)) { ... }`             |
| `Extension id "${extension.id}" is already ...`   | `Extension id "${extension.manifest.id}" is already ...`         |
| `extensions.set(extension.id, { extension, ... })` | `extensions.set(extension.manifest.id, { extension, ... })`     |

All other lines (the `SvelteMap` retention, the `ExtensionState` interface, the `setEnabled` body's `state.enabled` check, the `await registry.deactivate(id)` call, the `onEnabledChanged?.(id, enabled)` notification, the `listExtensions` body) are unchanged.

The `ExtensionManager` interface signature (`register`, `setEnabled`, `listExtensions`) is unchanged. The `createExtensionManager` factory's external contract is unchanged.

## `packages/shell/src/extension-host/extension-manifest.ts` → `bundled-extensions.ts` rename

The file is renamed to free the "manifest" term for the public per-extension concept. Same rename applies to the co-located test file:

| Old path                                                 | New path                                                |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `extension-host/extension-manifest.ts`                   | `extension-host/bundled-extensions.ts`                  |
| `extension-host/extension-manifest.test.ts`              | `extension-host/bundled-extensions.test.ts`             |

Inside the renamed `bundled-extensions.ts`:

- The exported `ManifestEntry` interface renames to `BundledExtensionEntry`.
- The exported `bundledExtensions: readonly ManifestEntry[]` typing renames to `bundledExtensions: readonly BundledExtensionEntry[]`.
- Each row's `{ id: ext.id, extension: ext }` updates to `{ id: ext.manifest.id, extension: ext }`.
- The header comment / docstring on the file — currently absent — gains one line: `// Host-side list of which extensions to bundle into this build. NOT the public per-extension manifest (that's ExtensionManifest in @gcscode/extension-api). See ADR-0007.`

Inside `bundled-extensions.test.ts`:

- The `import { bundledExtensions } from './extension-manifest'` line updates to `from './bundled-extensions'`.
- Tests that read `entry.id` continue to read `entry.id`. Tests (if any) that read `entry.extension.id` update to `entry.extension.manifest.id`.

## `packages/shell/src/main.ts` — import update

One line:

| Old                                                              | New                                                              |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `import { bundledExtensions } from './extension-host/extension-manifest';` | `import { bundledExtensions } from './extension-host/bundled-extensions';` |

The `for (const { id, extension, initialEnabled = true } of bundledExtensions)` loop body is unchanged. Identity reads inside the loop continue against the local `id` destructured from each entry, which is now sourced from `ext.manifest.id` at the entry's construction site.

## Extension migrations

Three files. Mechanical.

**`packages/extension-example/src/index.ts`** — the exported `exampleExtension: Extension` literal:

```ts
// Old
export const exampleExtension: Extension = {
  id: 'gcscode.example',
  displayName: 'Example Extension',
  version: '0.0.0',
  activate(context) { /* unchanged */ },
};

// New
export const exampleExtension: Extension = {
  manifest: {
    id: 'gcscode.example',
    displayName: 'Example Extension',
    version: '0.0.0',
    description: 'Demonstrates view, status bar item, command, and keybinding contributions.',
  },
  activate(context) { /* unchanged byte-for-byte */ },
};
```

The `activate` body, imports, and module-level state are unchanged.

**`packages/extension-sitl/src/index.ts`** — the exported `sitlExtension: Extension` literal:

```ts
// Old
export const sitlExtension: Extension = {
  id: 'gcscode.sitl',
  displayName: 'SITL Telemetry',
  version: '0.0.0',
  activate(context): SitlExports { /* unchanged */ },
  async deactivate() { /* unchanged */ },
};

// New
export const sitlExtension: Extension = {
  manifest: {
    id: 'gcscode.sitl',
    displayName: 'SITL Telemetry',
    version: '0.0.0',
    description: 'Live ArduCopter telemetry via mavlink2rest WebSocket; publishes a telemetry export.',
  },
  activate(context): SitlExports { /* unchanged byte-for-byte */ },
  async deactivate() { /* unchanged byte-for-byte */ },
};
```

The `activate` body, the `deactivate` hook, the `SitlExports` interface, the `client` module-level state, the constants, and all imports are unchanged.

**`packages/extension-vehicle-status/src/index.ts`** — the exported `vehicleStatusExtension: Extension` literal:

```ts
// Old
export const vehicleStatusExtension: Extension = {
  id: 'gcscode.vehicle-status',
  displayName: 'Vehicle Status',
  version: '0.0.0',
  activate(context) { /* unchanged */ },
  deactivate() { /* unchanged */ },
};

// New
export const vehicleStatusExtension: Extension = {
  manifest: {
    id: 'gcscode.vehicle-status',
    displayName: 'Vehicle Status',
    version: '0.0.0',
    description: 'Footer status item that reads SITL telemetry via cross-extension exports.',
  },
  activate(context) { /* unchanged byte-for-byte */ },
  deactivate() { /* unchanged byte-for-byte */ },
};
```

The `getSitlExports` helper, the `host` module-level state, and all imports are unchanged.

The three `description` strings above are spec-prescribed. They're short, render fine in a marketplace card row, and accurately summarize each extension. Plan-time is the right time to settle them — the marketplace UI iteration shouldn't have to reach across to backfill descriptions on extensions it doesn't own.

## Workbench built-in migration

**`packages/shell/src/built-in/workbench/index.ts`** — the `createWorkbenchExtension` factory's returned literal:

```ts
// Old
export function createWorkbenchExtension(registry: Registry): Extension {
  return {
    id: 'workbench',
    displayName: 'Workbench',
    version: '0.0.0',
    activate(context: ExtensionContext) { /* unchanged */ },
  };
}

// New
export function createWorkbenchExtension(registry: Registry): Extension {
  return {
    manifest: {
      id: 'workbench',
      displayName: 'Workbench',
      version: '0.0.0',
      description: "The shell's built-in extension. Registers the command palette and Ctrl+Shift+P.",
    },
    activate(context: ExtensionContext) { /* unchanged byte-for-byte */ },
  };
}
```

The factory's `Registry` parameter, the JSDoc, the `activate` body's command + keybinding registration, and the `CommandPickItem` interface are all unchanged.

## Test updates

The migration pattern is uniform across every test file that constructs an `Extension` literal:

```ts
// Old
const extension: Extension = {
  id: 'ext.a',
  displayName: 'Extension A',
  version: '1.2.3',
  activate,
  // optional: deactivate,
};

// New
const extension: Extension = {
  manifest: {
    id: 'ext.a',
    displayName: 'Extension A',
    version: '1.2.3',
  },
  activate,
  // optional: deactivate,
};
```

`description` is intentionally omitted in test extensions — they don't need it, and leaving it out exercises the optional-field path.

Tests that assert against `manager.listExtensions()` results update to the new `ExtensionRecord` shape: `{ id, displayName, version, enabled }` becomes `{ manifest: { id, displayName, version }, enabled }`. (`description` is absent from these assertions because the test extensions don't declare one.)

| File                                                                | Update scope                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shell/src/extension-host/registry.test.ts`                | Heaviest. ~14 `Extension` literals across the file's helpers and tests; each migrates as above. Identity-related assertions (e.g. `expect(extension.id)` if any) flip to `extension.manifest.id`.                                                                                                            |
| `packages/shell/src/extension-host/extension-manager.test.ts`       | ~17 `Extension` literals (across `makeViewExtension`, `makeViewExtensionWithDeactivate`, and inline literals). Plus assertions against `manager.listExtensions()` flip to the new `ExtensionRecord` shape.                                                                                                   |
| `packages/shell/src/app.test.ts`                                    | One `Extension` literal in the test extension factory; same migration.                                                                                                                                                                                                                                       |
| `packages/extension-example/src/index.test.ts`                      | Two literals (the imported `exampleExtension` itself + at most one inline test extension). Updates flow from the source change in `index.ts`; assertions on registered contributions are unchanged.                                                                                                          |
| `packages/extension-sitl/src/index.test.ts`                         | Two literals; same.                                                                                                                                                                                                                                                                                          |
| `packages/extension-vehicle-status/src/index.test.ts`               | Three literals; same.                                                                                                                                                                                                                                                                                        |
| `packages/shell/src/built-in/workbench/index.test.ts`               | Two literals (the workbench plus a test extension that registers a command). Same migration.                                                                                                                                                                                                                 |
| `packages/shell/src/extension-host/bundled-extensions.test.ts` (renamed from `extension-manifest.test.ts`) | Import path update only. The existing assertions (`bundledExtensions.length`, every entry has a non-empty `id`, ids are unique) keep referencing `entry.id`, which is now sourced from `entry.extension.manifest.id` at the entry's construction site. |

No new tests are added. The new types are TypeScript-enforced; runtime tests for "manifest is an object on Extension" would be redundant.

## `packages/extension-api/README.md` content (replacement)

The complete intended content of the file (replaces all current content):

````md
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
    description: 'Demo extension that contributes a view, a status item, a command, and a keybinding.',
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
````

## `packages/extension-example/README.md` edit

In the "What it demonstrates" section, the third bullet currently reads:

```md
- It exports a named `const` (`exampleExtension`) of type `Extension` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
```

Replace with:

```md
- It exports a named `const` (`exampleExtension`) of type `Extension` carrying a `manifest` object (`id`, `displayName`, `version`, `description?`) plus an `activate(context)` function. See [ADR-0007](../../docs/decisions/ADR-0007-extension-manifest.md) for the manifest's structure.
```

In the "Anatomy" section, the file-tree comment currently reads:

```
  index.ts              - exports exampleExtension: Extension (identity + activate(context))
```

Replace with:

```
  index.ts              - exports exampleExtension: Extension (manifest + activate(context))
```

The "To write your own extension..." paragraph currently reads:

```md
To write your own extension, copy this package, change the exported constant name (`exampleExtension` → `yourExtension`) and identity fields, rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.
```

Replace with:

```md
To write your own extension, copy this package, change the exported constant name (`exampleExtension` → `yourExtension`) and the `manifest` fields (id, displayName, version, optional description), rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.
```

The other content (Stability, the contribution-kind bullet list, the per-id table) is unchanged.

## `docs/roadmap.md` edit

Two edits to the Phase B section.

**B4 line — clarify the existing line.** The current text:

```md
- [x] **B4: Extension manifest + persistence** — `bundledExtensions` array; localStorage-backed disabled-id set; `ExtensionManager.register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`. Spec: [`specs/2026-04-27-phase-b4-extension-manifest.md`](specs/2026-04-27-phase-b4-extension-manifest.md)
```

becomes:

```md
- [x] **B4: Bundled extensions list + persistence** — host-side `bundledExtensions` array (file renamed to `bundled-extensions.ts` in B5; see ADR-0007); localStorage-backed disabled-id set; `ExtensionManager.register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`. Spec: [`specs/2026-04-27-phase-b4-extension-manifest.md`](specs/2026-04-27-phase-b4-extension-manifest.md). NOTE: the original B4 title used "Extension manifest" for the host-side bundling list; the public per-extension manifest is a different concept landed in B5.
```

**Append a new B5 line** immediately after the existing `Extension.deactivate?() hook` line:

```md
- [x] **B5: Per-extension manifest metadata** — public `ExtensionManifest` type in `@gcscode/extension-api`; `Extension.manifest: ExtensionManifest` replaces flat identity fields; first descriptive field is `description?`. Host-side `extension-manifest.ts` renames to `bundled-extensions.ts` to free the term. Spec: [`specs/2026-05-02-extension-manifest.md`](specs/2026-05-02-extension-manifest.md). ADR: [`decisions/ADR-0007-extension-manifest.md`](decisions/ADR-0007-extension-manifest.md).
```

The Phase A, Phase C, Feature extensions, and Maintenance sections are unchanged.

## `docs/vs-code-alignment.md` edit

Two edits.

**Divergences table — update the existing "Extension shape" row.** The current row:

```md
| Extension shape                   | `activate()` exported from module; metadata in `package.json`   | object with `activate()` method; metadata as identity fields on the object | [ADR-0002](decisions/ADR-0002-imperative-activate-api.md), [ADR-0004](decisions/ADR-0004-rename-plugin-to-extension.md)                                  | Manifest deferral lands → re-evaluate                             |
```

becomes:

```md
| Extension shape                   | `activate()` exported from module; metadata in `package.json`   | object with `activate()` method; metadata in a `manifest: ExtensionManifest` field on the object | [ADR-0002](decisions/ADR-0002-imperative-activate-api.md), [ADR-0004](decisions/ADR-0004-rename-plugin-to-extension.md), [ADR-0007](decisions/ADR-0007-extension-manifest.md) | First third-party / out-of-tree extension                         |
```

The `deactivate` hook position row, and every other Divergences row, are unchanged.

**Alignments table — append one new row** at the bottom (after the existing "Topic-namespaced host API" row):

```md
| Per-extension manifest carries identity + presentation metadata             | ✓ (`package.json`)                                        | ✓ (`Extension.manifest: ExtensionManifest`, descriptive subset)                                  | [ADR-0007](decisions/ADR-0007-extension-manifest.md)                                                       |
```

The Deferrals table is unchanged. (The "Declarative `contributes` manifest" deferral row stays — the `contributes` arrays are still deferred. Trigger language tightens; see the `out-of-scope.md` propagation below.)

## `docs/decisions/ADR-0003-plugin-api-refinements.md` edit

In the `## Follow-ups` section, append a new bullet at the END of the list:

```md
- The "Declarative `contributes`" deferral's trigger ("a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted extension module") partially fired in 2026-05-02. The descriptive-metadata subset is now structured per [ADR-0007](ADR-0007-extension-manifest.md) (`Extension.manifest: ExtensionManifest`). The `contributes` arrays themselves remain deferred under sharper trigger language ("settings UI for individual contributions / first untrusted extension module / first third-party producer-consumer pair").
```

The existing follow-up bullets and all other sections are unchanged.

## `docs/out-of-scope.md` propagation

The "Declarative `contributes` manifest" entry at the top of the **Extension machinery** section currently reads:

```md
- **Declarative `contributes` manifest.** No statically-parseable list of contributions (commands, views, status bar items, etc.) that the host can read without executing `activate()`. The TypeScript `Extension` interface plus imperative `register*` calls are the contract. The manifest would be where per-contribution metadata such as command titles, categories, icons, and descriptions eventually lives. _Trigger to revisit:_ a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted extension module. (ADR-0003)
```

becomes:

```md
- **Declarative `contributes` manifest.** No statically-parseable list of contributions (commands, views, status bar items, etc.) that the host can read without executing `activate()`. Imperative `register*` calls inside `activate(context)` are the contract for runtime registration. Note: per-extension descriptive metadata (`displayName`, `version`, `description?`) IS structured on `Extension.manifest` per ADR-0007; the deferral here is specifically the `contributes` arrays — declarative lists of commands / views / keybindings / status bar items as data, parseable without running `activate()`. _Trigger to revisit:_ a settings UI that toggles individual contributions, the first untrusted extension module, or the first third-party producer-consumer pair. (ADR-0003, ADR-0007)
```

The "Activation events / lazy activation", "Extension activation ordering / dependency declaration", "Capability / permission declarations", and every other entry in `out-of-scope.md` are unchanged.

## Files modified / added

| Path                                                          | Change                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/decisions/ADR-0007-extension-manifest.md`               | NEW. Records the manifest decision, alternatives considered, iteration scope, and follow-ups. ~110 lines.                                                                                                                                                                                                                                                                    |
| `packages/extension-api/src/index.ts`                         | New `ExtensionManifest` interface added directly after `ExtensionIdentity`. `Extension` interface rewritten: drops `extends ExtensionIdentity`, gains `readonly manifest: ExtensionManifest`. All other interfaces (`Disposable`, contribution interfaces, `QuickPick*`, `ExtensionHost`, `ExtensionContext`, `ExtensionIdentity`) byte-identical.                            |
| `packages/shell/src/extension-host/registry.ts`               | Three identity reads inside `activate(extension)` change source from `extension.X` to `extension.manifest.X`. Local `identity: ExtensionIdentity` shape unchanged. Everything else byte-identical.                                                                                                                                                                          |
| `packages/shell/src/extension-host/extension-manager.ts`      | `ExtensionRecord` reshapes from flat to `{ manifest, enabled }`. `toRecord` updates accordingly. Three `extension.id` reads inside `register` update to `extension.manifest.id`. Top imports add `ExtensionManifest` from `@gcscode/extension-api`. Everything else byte-identical.                                                                                          |
| `packages/shell/src/extension-host/bundled-extensions.ts` (renamed from `extension-manifest.ts`) | File renamed. `ManifestEntry` → `BundledExtensionEntry`. Each row's `id: ext.id` updates to `id: ext.manifest.id`. Header docstring added explaining this is the host-side bundling list, distinct from the public `ExtensionManifest`.                                                              |
| `packages/shell/src/extension-host/bundled-extensions.test.ts` (renamed from `extension-manifest.test.ts`) | File renamed. Import path updates from `./extension-manifest` to `./bundled-extensions`. Test bodies byte-identical (the test reads `entry.id`, which still works).                                                                                                                              |
| `packages/shell/src/main.ts`                                  | One import-path line updates from `./extension-host/extension-manifest` to `./extension-host/bundled-extensions`. Body of the `for` loop unchanged.                                                                                                                                                                                                                            |
| `packages/shell/src/built-in/workbench/index.ts`              | The `createWorkbenchExtension` factory's returned `Extension` literal moves identity fields into `manifest: { id, displayName, version, description }`. Activate body, JSDoc, `CommandPickItem` interface unchanged.                                                                                                                                                          |
| `packages/shell/src/built-in/workbench/index.test.ts`         | Two `Extension` literals migrate to manifest shape. No assertion changes beyond following the source.                                                                                                                                                                                                                                                                          |
| `packages/shell/src/extension-host/registry.test.ts`          | ~14 `Extension` literals migrate to manifest shape. Identity assertions, if any, flip from `extension.id` to `extension.manifest.id`. ~50 tests touched, all mechanical.                                                                                                                                                                                                       |
| `packages/shell/src/extension-host/extension-manager.test.ts` | ~17 `Extension` literals migrate to manifest shape. `manager.listExtensions()` assertions flip from flat `{ id, displayName, version, enabled }` to nested `{ manifest: {...}, enabled }`. ~14 tests touched.                                                                                                                                                                  |
| `packages/shell/src/app.test.ts`                              | One `Extension` literal migrates.                                                                                                                                                                                                                                                                                                                                              |
| `packages/extension-example/src/index.ts`                     | `exampleExtension` literal migrates to manifest shape; gains `description: 'Demonstrates view, status bar item, command, and keybinding contributions.'`.                                                                                                                                                                                                                       |
| `packages/extension-example/src/index.test.ts`                | Updates flow from the source change.                                                                                                                                                                                                                                                                                                                                            |
| `packages/extension-sitl/src/index.ts`                        | `sitlExtension` literal migrates; gains `description: 'Live ArduCopter telemetry via mavlink2rest WebSocket; publishes a telemetry export.'`.                                                                                                                                                                                                                                |
| `packages/extension-sitl/src/index.test.ts`                   | Updates flow from the source change.                                                                                                                                                                                                                                                                                                                                            |
| `packages/extension-vehicle-status/src/index.ts`              | `vehicleStatusExtension` literal migrates; gains `description: 'Footer status item that reads SITL telemetry via cross-extension exports.'`.                                                                                                                                                                                                                                  |
| `packages/extension-vehicle-status/src/index.test.ts`         | Updates flow from the source change.                                                                                                                                                                                                                                                                                                                                            |
| `packages/extension-api/README.md`                            | REPLACED. Usage example, "The extension shape" section (NEW), activation context bullet, Cross-extension exports example all updated to manifest shape. Other sections (Stability, Lifecycle, Conventions) keep current content.                                                                                                                                              |
| `packages/extension-example/README.md`                        | Three edits: "What it demonstrates" third bullet, Anatomy file-tree comment, "To write your own extension..." paragraph.                                                                                                                                                                                                                                                       |
| `docs/roadmap.md`                                             | B4 line clarified (rename "Extension manifest" → "Bundled extensions list" + footnote about renamed file). New B5 line added.                                                                                                                                                                                                                                                  |
| `docs/vs-code-alignment.md`                                   | Existing Divergences row "Extension shape" updated (gcscode column + Trigger column). New Alignments row appended.                                                                                                                                                                                                                                                            |
| `docs/decisions/ADR-0003-plugin-api-refinements.md`           | One new follow-up bullet at the end of `## Follow-ups` pointing at ADR-0007.                                                                                                                                                                                                                                                                                                    |
| `docs/out-of-scope.md`                                        | "Declarative `contributes` manifest" entry rewritten with sharper trigger language; clarifies that descriptive metadata is now structured per ADR-0007 and the deferral applies only to `contributes` arrays.                                                                                                                                                                  |

## Branching and commit

This iteration touches code (the `@gcscode/extension-api` types, the shell registry + manager + bundling list, three first-party extensions, the workbench built-in, plus tests), so per `CLAUDE.md` ("Implementation work runs on `feat/<topic>` branches off master") it runs on `feat/extension-manifest` off master, merged with `git merge --no-ff feat/extension-manifest`.

Spec + ADR-0007 land on master directly (docs metadata about future work) before the feature branch starts. They commit together in one `docs:` commit mirroring prior precedents (e.g. `docs: ADR-0006 + spec for ExtensionHost namespacing`).

Commits on the feature branch (proposed split):

1. **`feat(extension-api): introduce ExtensionManifest; Extension owns manifest field`** — replaces `Extension` interface in `packages/extension-api/src/index.ts`; adds `ExtensionManifest`. Type changes only. The change is propagating; this commit is intentionally not green on its own.
2. **`feat(shell): registry + extension-manager read identity via extension.manifest`** — updates `registry.ts` (three identity reads inside `activate`) and `extension-manager.ts` (`ExtensionRecord` reshape, `toRecord` rewrite, three `extension.id` reads). The shell's host code internally now references `extension.manifest.*`, but `bundled-extensions.ts` (still named `extension-manifest.ts` at this point) imports the four extensions whose literals still use the flat shape — so the shell package as a whole does not yet typecheck. Intermediate state.
3. **`feat: rename host-side extension-manifest.ts → bundled-extensions.ts`** — renames the file pair (source + test); renames `ManifestEntry` → `BundledExtensionEntry`; updates each row's `id: ext.id` → `id: ext.manifest.id`; updates `main.ts`'s import path; adds the file's header docstring. The rename + identity-read update brings the shell's source-side fully consistent with the new types, but the imported extensions still have the old flat shape, and the test files still construct flat literals — both still fail until commit 4.
4. **`feat(extensions): migrate first-party extensions and workbench to manifest-shaped Extension`** — migrates `extension-example`, `extension-sitl`, `extension-vehicle-status`, the workbench built-in, and ALL touched test files (`registry.test.ts`, `extension-manager.test.ts`, `app.test.ts`, the workbench's `index.test.ts`, the three per-extension `index.test.ts` files). This is the first commit in the sequence where the workspace is green: `pnpm test` passes; `pnpm check` clean; `pnpm lint` clean.
5. **`docs: ADR-0007 propagation — extension-api README, example README, ledger, roadmap, ADR-0003 follow-up, out-of-scope`** — all doc updates in one commit. Lands at the end of the branch. Workspace stays green.

The split lets a reviewer step through the migration in dependency order: types → host source → bundling list rename → consumers + tests → docs. Intermediate commits 1–3 are not individually green; only commits 4 and 5 leave the workspace passing. This mirrors the C1 spec's same-style migration sequence.

Per `CLAUDE.md`, plan execution uses `superpowers:subagent-driven-development`: dispatch a fresh implementer subagent per task, follow with spec compliance + code quality reviews, address review feedback in separate `Code-review-followup:` commits on the same branch (not amends).

After all five commits land, merge via `superpowers:finishing-a-development-branch` with `git merge --no-ff feat/extension-manifest`.

## Verification

- `pnpm format && pnpm lint` clean across the workspace at the end of commits 4 and 5.
- `pnpm check` clean across all four packages at the end of commit 4.
- `pnpm test` passes at the end of commit 4. Total test count unchanged from the iteration's start (no new tests, no removed tests). Same baseline assertions; only the `Extension` literal shape and the `ExtensionRecord` shape change.
- `pnpm dev` smoke test after commit 4: app boots; example + SITL + vehicle-status views render; `Alt+Shift+G` (greet command) and `Alt+Shift+L` (SITL location) keybindings fire; SITL telemetry feeds the vehicle-status footer item correctly; command palette (Ctrl+Shift+P) lists all expected commands. No console errors.
- Manual: open `docs/decisions/ADR-0007-extension-manifest.md`; confirm cross-doc links to ADR-0003, ADR-0005, ADR-0006, the spec, the alignment ledger, the roadmap, and `out-of-scope.md` resolve.
- Manual: open `docs/vs-code-alignment.md`; confirm the Divergences "Extension shape" row reflects the new gcscode column + Trigger column, and the new Alignments row sits at the bottom of the Alignments table.
- Manual: open `docs/roadmap.md`; confirm B4 line is rephrased, B5 line is added with checkbox + spec/ADR links, and the maintenance instructions are unchanged.
- Manual: open `docs/out-of-scope.md`; confirm the `contributes` manifest entry has the sharper trigger language and references ADR-0007.
- `git log --oneline` after the merge shows: the merge commit; commits 1–5 above on the feature branch; the spec+ADR commit on master before the branch.

## VS Code alignment

| Concern                                       | VS Code                                                                              | gcscode                                                                                          | Notes                                                                                                                                                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Per-extension manifest carries identity + presentation metadata | `package.json` (`name`, `displayName`, `version`, `description`, `categories`, `icon`, `engines`, `extensionDependencies`, `activationEvents`, `contributes`) | `Extension.manifest: ExtensionManifest` carries `id`, `displayName`, `version`, `description?` (descriptive subset only this iteration) | Aligned in spirit. New Alignments row in the ledger.                                                                                                                                |
| Extension shape (Extension object vs `package.json` + module export) | `activate()` exported from module; metadata in `package.json` | object with `activate()` method; metadata in a `manifest: ExtensionManifest` field on the object | Existing Divergences row updated. Trigger narrows from "Manifest deferral lands → re-evaluate" to "First third-party / out-of-tree extension".                                       |
| Iteration field scope                         | All `package.json` fields available                                                  | `description?` only                                                                              | Future descriptive fields (`category?`, `icon?`, `categories?`) land per-field. The contributes manifest is a separate decision under sharper trigger language.                       |
| Manifest naming                               | "Extension manifest" = `package.json`                                                | "Extension manifest" = `Extension.manifest`                                                      | Aligned. The host-side `extension-manifest.ts` file (the bundling list) renames to `bundled-extensions.ts` to avoid double-meaning.                                                  |

No new alignment ledger Divergences are introduced. One Divergences row is updated (Extension shape, narrowed trigger). One new Alignments row is added (per-extension manifest with descriptive subset).

## `docs/out-of-scope.md` propagation

Edit listed above. Summary of the change:

- Rewrites the "Declarative `contributes` manifest" entry to clarify what's structured (descriptive metadata, per ADR-0007) vs. what's still deferred (the `contributes` arrays).
- Tightens the trigger to revisit: removes "marketplace preview" (it fired here for the descriptive subset; the `contributes` arrays remain deferred under their own narrower triggers); the `contributes` arrays are deferred until "settings UI for individual contributions / first untrusted extension module / first third-party producer-consumer pair".
- References ADR-0003 + ADR-0007.

No other `out-of-scope.md` entries are touched. No new entries are added by this iteration (manifest growth fields are deferred per-field on `ExtensionManifest`, not as out-of-scope rows).

## Follow-ups (out of scope for this iteration)

- **Marketplace UI / extensions panel.** The motivating consumer of `manifest.description`. Brainstormed and shipped as a separate iteration after this lands. The user said "B with split UI work" in the brainstorm; the UI iteration's spec lives at `docs/specs/2026-05-XX-extensions-panel.md` (date set when that brainstorm starts).
- **`category?` field on `ExtensionManifest`.** Add per-field if the marketplace UI's filter / grouping behavior pulls on it. Trigger: first UI consumer that wants per-category sorting or filtering.
- **`icon?` field on `ExtensionManifest`.** Add per-field if the marketplace UI starts rendering per-extension icons. Trigger: first UI consumer wanting an icon column. Open question at that point: string URL vs Svelte `Component` vs both? Resolve when triggered.
- **`categories?: string[]` (array form, multi-category)** vs single `category?: string`. VS Code uses `categories: string[]`. We could land single first, widen later — both are non-breaking from the consumer's perspective. Resolve when triggered.
- **Declarative `contributes` arrays.** Separate ADR if/when the sharper trigger fires. References this ADR for the manifest's structure; `contributes.commands` / `contributes.views` / `contributes.keybindings` would land as new fields on `ExtensionManifest`.
- **Statically-loadable manifest (lazy activation)** — extracting per-extension manifests as a separate import path (`@gcscode/extension-X/manifest`) so the host can render the marketplace without running `activate()`. Stays deferred per ADR-0003; trigger remains "cold-start time becomes a problem (~50+ extensions)".
- **B3 dev-time HMR.** Independent of this iteration. The HMR loop (re-import an extension module on edit, replay activate) operates over the existing `manager.setEnabled(id, false / true)` cycle and doesn't depend on the manifest shape.
