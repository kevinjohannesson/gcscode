# Phase C1 — ExtensionHost namespacing

**Status:** Approved (2026-05-01)

## Context

Iteration 2 of the post-iteration-A housekeeping sequence pulled out of [`specs/2026-05-01-vs-code-alignment-ledger.md`](2026-05-01-vs-code-alignment-ledger.md). Where iteration 1 surfaced cumulative VS Code alignment / divergence as the new canonical doc surface, iteration 2 acts on the alignment goal directly: adopt VS Code's topic-namespaced `ExtensionHost` API ([`vscode.commands`, `vscode.window`, `vscode.extensions`]) and migrate the three first-party extensions in the same cut.

This is also Phase C's first concrete iteration (C1). Phase C was "TBD" on the roadmap; this iteration flips the line and seeds the namespace pattern that future cross-cutting capabilities (events, settings, themes, i18n) will inherit.

The decision is recorded in [ADR-0006](../decisions/ADR-0006-extensionhost-namespacing.md), landed alongside this spec.

## Goals

- New ADR-0006 at `docs/decisions/ADR-0006-extensionhost-namespacing.md` recording the scheme decision.
- Replace the flat `ExtensionHost` interface in `@gcscode/extension-api/src/index.ts` with the topic-namespaced shape (four namespaces: `commands`, `window`, `keybindings`, `extensions`).
- Restructure `createHost` in `packages/shell/src/extension-host/registry.ts` to return the namespaced object. Closure-over-state and per-method bodies are byte-identical to today; only the returned object's structure changes.
- Migrate the three first-party extensions (`extension-example`, `extension-sitl`, `extension-vehicle-status`) to the namespaced API.
- Update affected test files (`registry.test.ts`, `extension-manager.test.ts`, `app.test.ts`, per-extension `index.test.ts`) to call the namespaced methods. No new test patterns; coverage and assertions unchanged.
- Doc propagation: roadmap (Phase C section), `vs-code-alignment.md` (new Alignments row), ADR-0003 + ADR-0005 follow-up notes, `extension-api/README.md` (Usage + activation context + cross-extension exports), `extension-example/README.md` (Anatomy), `extension-sitl/README.md` + `extension-vehicle-status/README.md` (one inline-code update each), `CLAUDE.md` (Boundary rule corollary).

## Non-goals

- **No `Registry` namespacing.** `Registry` is shell-internal — not exposed via `@gcscode/extension-api`. The `list*` methods serve the shell UI; the host-side `executeCommand` is used by the keyboard dispatcher. Internal consistency gain isn't worth the churn.
- **No type renames.** `ViewContribution`, `StatusBarItemContribution`, `CommandContribution`, `KeybindingContribution`, `Extension`, `ExtensionContext`, `ExtensionIdentity`, `Disposable` keep their names. VS Code-style type renames (`StatusBarItem`, `TreeView`, …) are their own iteration if it ever matters.
- **No deprecation period.** Hard break — flat methods replaced; all consumers updated in this iteration. Three first-party extensions; deprecation cruft adds zero value.
- **No new test patterns.** TypeScript enforces namespace structure at compile time; no runtime tests of namespace shape needed.
- **No new contribution kinds.** This iteration restructures existing kinds; doesn't add anything.
- **No changes to contribution interfaces.** Only `ExtensionHost` is rewritten in `@gcscode/extension-api`.

## `@gcscode/extension-api/src/index.ts` — `ExtensionHost` interface change

The `Disposable`, `ViewContribution`, `StatusBarItemContribution`, `CommandContribution`, `KeybindingContribution`, `ExtensionIdentity`, `ExtensionContext`, and `Extension` interfaces are unchanged.

The `ExtensionHost` interface is replaced. New shape:

```ts
/**
 * The per-extension gate. Methods are organized into four topic namespaces:
 *
 * - `commands` — `registerCommand` (returns `Disposable`) and `executeCommand`
 *   (fires by id; cross-extension execute is intentional).
 * - `window` — `registerView` and `registerStatusBarItem` (UI contributions).
 * - `keybindings` — `registerKeybinding` (key combo → command id).
 * - `extensions` — `getExtension` (looks up another extension's published exports).
 *
 * The host exposes no methods at the top level — every verb lives under one of
 * the four namespaces. New contribution kinds slot in as further `register*`
 * methods on the appropriate namespace; new cross-cutting capabilities (events,
 * settings, themes, i18n) land as new namespaces. See ADR-0006.
 */
export interface ExtensionHost {
  readonly commands: {
    registerCommand(command: CommandContribution): Disposable;
    executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
  };
  readonly window: {
    registerView(view: ViewContribution): Disposable;
    registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  };
  readonly keybindings: {
    registerKeybinding(keybinding: KeybindingContribution): Disposable;
  };
  readonly extensions: {
    /**
     * Look up a currently-activated extension's exports by id. Returns the
     * wrapper iff the extension is registered AND its `activate()` has been
     * called and not yet undone by `deactivate()`. Returns `undefined`
     * otherwise.
     *
     * The generic `T` is unsafe sugar — the host stores the activate() return
     * value as `unknown` and casts to `T` on return. Producers and consumers
     * commit to a shared type contract via `import type` from the producer's
     * package; runtime drift is caught by TypeScript at producer-side compile.
     *
     * Reads inside reactive contexts (`$derived`, template) auto-track the
     * underlying `SvelteMap`; consumers re-render when the producer enables /
     * disables. See ADR-0005 for the full design.
     */
    getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined;
  };
}
```

The existing top-level docstring on the old `ExtensionHost` ("The per-extension gate. Each `register*` method returns a `Disposable` whose `dispose()` removes the registration. New contribution kinds slot in as further `register*` methods...") is replaced by the new docstring above. The functional contract per method (id-uniqueness throws at registration, `Disposable` returned, idempotent `dispose`, etc.) is unchanged byte-for-byte; only the return type's shape and the docstring change.

## `packages/shell/src/extension-host/registry.ts` — `createHost` factory restructure

The closure-over-state pattern is identical to today. The four contribution `SvelteMap`s, the `exportsByExtension` `SvelteMap`, the `subscriptionsByExtension` and `deactivateHooksByExtension` plain `Map`s, and the `execute<T>(id, args, attribution)` helper all stay byte-for-byte unchanged.

Only the `createHost` function's returned object structure changes. New body:

```ts
function createHost(extension: ExtensionIdentity): ExtensionHost {
  return {
    commands: {
      registerCommand(command) {
        if (commands.has(command.id)) {
          throw new Error(
            `Command id "${command.id}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        commands.set(command.id, command);
        return {
          dispose() {
            // Idempotent and safe under re-registration: only delete if the
            // entry currently in the map is the one this disposable owns.
            if (commands.get(command.id) === command) {
              commands.delete(command.id);
            }
          },
        };
      },
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        return execute<T>(id, args, `extension "${extension.id}"`);
      },
    },
    window: {
      registerView(view) {
        if (views.has(view.id)) {
          throw new Error(
            `View id "${view.id}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        views.set(view.id, view);
        return {
          dispose() {
            if (views.get(view.id) === view) {
              views.delete(view.id);
            }
          },
        };
      },
      registerStatusBarItem(item) {
        if (statusBarItems.has(item.id)) {
          throw new Error(
            `Status bar item id "${item.id}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        statusBarItems.set(item.id, item);
        return {
          dispose() {
            if (statusBarItems.get(item.id) === item) {
              statusBarItems.delete(item.id);
            }
          },
        };
      },
    },
    keybindings: {
      registerKeybinding(keybinding) {
        if (keybindings.has(keybinding.key)) {
          throw new Error(
            `Keybinding "${keybinding.key}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        keybindings.set(keybinding.key, keybinding);
        return {
          dispose() {
            if (keybindings.get(keybinding.key) === keybinding) {
              keybindings.delete(keybinding.key);
            }
          },
        };
      },
    },
    extensions: {
      getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined {
        if (!exportsByExtension.has(id)) return undefined;
        return { id, exports: exportsByExtension.get(id) as T };
      },
    },
  };
}
```

The `Registry` interface and the `createRegistry` function's other internals (`activate`, `deactivate`, `listViews`, `listStatusBarItems`, `listCommands`, `listKeybindings`, host-side `executeCommand`) are unchanged.

## Extension migrations

Three files. Mechanical.

**`packages/extension-example/src/index.ts`** — replace four lines inside `activate()`:

| Old                                           | New                                                    |
| --------------------------------------------- | ------------------------------------------------------ |
| `context.host.registerView({ ... })`          | `context.host.window.registerView({ ... })`            |
| `context.host.registerStatusBarItem({ ... })` | `context.host.window.registerStatusBarItem({ ... })`   |
| `context.host.registerCommand({ ... })`       | `context.host.commands.registerCommand({ ... })`       |
| `context.host.registerKeybinding({ ... })`    | `context.host.keybindings.registerKeybinding({ ... })` |

**`packages/extension-sitl/src/index.ts`** — three lines inside `activate()`:

| Old                                        | New                                                    |
| ------------------------------------------ | ------------------------------------------------------ |
| `context.host.registerView({ ... })`       | `context.host.window.registerView({ ... })`            |
| `context.host.registerCommand({ ... })`    | `context.host.commands.registerCommand({ ... })`       |
| `context.host.registerKeybinding({ ... })` | `context.host.keybindings.registerKeybinding({ ... })` |

**`packages/extension-vehicle-status/src/index.ts`** — two lines:

| Old                                                        | New                                                                   |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| `host?.getExtension<SitlExports>('gcscode.sitl')?.exports` | `host?.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports` |
| `context.host.registerStatusBarItem({ ... })`              | `context.host.window.registerStatusBarItem({ ... })`                  |

No other lines in any of the three files change. Imports, identity fields, deactivate hooks, and module-level state are unchanged.

## Test updates

The migration mapping is identical for test code. Wherever a test builds an `Extension` object with an `activate(context)` body that calls `context.host.register*`, those calls move to the namespaced form using the same table as the extension migrations above. Same for any test that calls `host.executeCommand(...)` (→ `host.commands.executeCommand(...)`) or `host.getExtension(...)` (→ `host.extensions.getExtension(...)`).

| File                                                          | Update scope                                                                                                                                                                                                    |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shell/src/extension-host/registry.test.ts`          | Heaviest. Most tests stand up a test `Extension` with `activate(context)` calling `host.register*`; each call site moves to namespaced form. Tests of `executeCommand` and `getExtension` also move. ~50 tests. |
| `packages/shell/src/extension-host/extension-manager.test.ts` | Same pattern. ~14 tests.                                                                                                                                                                                        |
| `packages/shell/src/app.test.ts`                              | One or two test extensions; same migration.                                                                                                                                                                     |
| `packages/extension-example/src/index.test.ts`                | Tests reference the example extension's behavior. Updates flow from the source change in `index.ts`; assertions on `registry.list*()` are unchanged.                                                            |
| `packages/extension-sitl/src/index.test.ts`                   | Same.                                                                                                                                                                                                           |
| `packages/extension-vehicle-status/src/index.test.ts`         | Same.                                                                                                                                                                                                           |

Tests that today assert via `registry.listX()` (after a `host.registerX` call by a test extension) keep both sides intact — only the `host.*` call path moves. The Registry's `list*` methods, `executeCommand`, `activate`, and `deactivate` are not touched.

No new tests are added. TypeScript enforces namespace structure at compile time; runtime tests of `host.commands` being a sub-object would be redundant.

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
  id: 'my-namespace.my-extension',
  displayName: 'My Extension',
  version: '0.0.0',
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

## The activation context

`activate(context)` receives an `ExtensionContext`:

- **`context.host`** — the per-extension gate. Methods are organized into four topic namespaces:
  - **`host.commands`** — `registerCommand(command): Disposable` registers a command; `executeCommand<T>(id, ...args): Promise<T>` fires any registered command by id (cross-extension execute is intentional). The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't an extension), via the same shared implementation.
  - **`host.window`** — `registerView(view): Disposable` and `registerStatusBarItem(item): Disposable` register UI contributions.
  - **`host.keybindings`** — `registerKeybinding(keybinding): Disposable` maps a key combo to a command id.
  - **`host.extensions`** — `getExtension<T>(id): { id; exports: T } | undefined` looks up another extension's published exports.
    Each `register*` call returns a `Disposable`. The host exposes no verbs at the top level — every method lives under one of the four namespaces. See ADR-0006.
- **`context.subscriptions`** — push every `Disposable` here. The host disposes them when the extension is (eventually) deactivated. See ADR-0003.
- **`context.extension`** — read-only identity (`id`, `displayName`, `version`) for the activating extension, in case you need it for log prefixes or error messages.

## Cross-extension exports

`activate(context)` may return a value that becomes the extension's published exports. Other extensions look it up via `context.host.extensions.getExtension<T>(id)?.exports`. Producers that don't expose an API may return nothing.

```ts
export interface MyExports {
  readonly thing: Thing;
}

export const myExtension: Extension = {
  id: 'my-namespace.my-extension',
  displayName: 'My Extension',
  version: '0.0.0',
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

Find the existing prose in the "What it demonstrates" section that begins with "Inside `activate`, it calls `context.host.registerView`...". Replace those four method references with the namespaced form:

| Old                                  | New                                           |
| ------------------------------------ | --------------------------------------------- |
| `context.host.registerView`          | `context.host.window.registerView`            |
| `context.host.registerStatusBarItem` | `context.host.window.registerStatusBarItem`   |
| `context.host.registerCommand`       | `context.host.commands.registerCommand`       |
| `context.host.registerKeybinding`    | `context.host.keybindings.registerKeybinding` |

The rest of the README (Anatomy diagram, contribution list, copy-this-extension instructions) is unchanged.

## `packages/extension-sitl/README.md` edit

In the "Cross-extension exports" section, find the inline-code reference to `host.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry` and replace it with `host.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry`.

No other content changes.

## `packages/extension-vehicle-status/README.md` edit

In the "Contributions" section, find the inline-code reference to `host.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry` and replace it with `host.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry`.

No other content changes.

## `docs/roadmap.md` edit

In the `### Phase C — Cross-cutting capabilities` section, replace the existing single bullet:

```md
- [ ] **Phase C scope** — TBD. ADR-0003 sketches host namespacing (`host.commands.register(...)`) once the flat surface exceeds 5–7 methods, plus events, settings, themes, and i18n as real consumers pull on them. Re-scope when a feature extension pulls on it.
```

with two bullets:

```md
- [x] **C1: ExtensionHost namespacing** — host API moves from flat (`registerCommand`, `registerStatusBarItem`, ...) to topic-namespaced (`host.commands.registerCommand`, `host.window.registerStatusBarItem`, ...). Spec: [`specs/2026-05-01-extensionhost-namespacing.md`](specs/2026-05-01-extensionhost-namespacing.md). ADR: [`decisions/ADR-0006-extensionhost-namespacing.md`](decisions/ADR-0006-extensionhost-namespacing.md).
- [ ] **C2+: events, settings, themes, i18n** — TBD. Each lands as a new namespace under `host.*` when a feature extension pulls on it. Re-scope per-capability when triggered.
```

The Phase A and Phase B sections, the Feature extensions section, and the Maintenance section are unchanged.

## `docs/vs-code-alignment.md` edit

In the **Alignments** table, append one new row at the bottom (after the existing "Vocabulary — 'extension' everywhere" row):

```md
| Topic-namespaced host API (`commands.*`, `window.*`, `extensions.*`) | ✓ | ✓ | [ADR-0006](decisions/ADR-0006-extensionhost-namespacing.md) |
```

The Divergences table and the Deferrals table are unchanged.

## `docs/decisions/ADR-0003-plugin-api-refinements.md` edit

In the `## Follow-ups` section, append a new bullet at the END of the list:

```md
- The "Phase C: probably namespace the host once the flat surface exceeds 5–7 methods" forecast is now resolved by [ADR-0006](ADR-0006-extensionhost-namespacing.md) (2026-05-01), which adopts the topic-namespaced shape and migrates the three first-party extensions in the same iteration.
```

The existing follow-up bullets and all other sections are unchanged.

## `docs/decisions/ADR-0005-extension-boundaries.md` edit

In the `## Follow-ups` section, append a new bullet at the END of the list:

```md
- The "Phase C namespacing trigger from ADR-0003 — Adding `getExtension` brings the flat surface on `ExtensionHost` to six methods. Still under the 5–7 trigger; defer namespacing per ADR-0003." follow-up is now resolved by [ADR-0006](ADR-0006-extensionhost-namespacing.md) (2026-05-01), which adopts the topic-namespaced shape concretely rather than waiting for the seventh-method add.
```

The existing follow-up bullets and all other sections are unchanged.

## `CLAUDE.md` edit

In the `## Boundary rule — load bearing` section's corollary paragraph (the one beginning "Corollary: if an extension needs a capability the host doesn't yet expose..."), update the parenthetical that describes how new capabilities land. The current text:

```md
Corollary: if an extension needs a capability the host doesn't yet expose, add it to `@gcscode/extension-api` first (as a new method on `ExtensionHost` — typically a `register*` for a new kind, or a verb like `executeCommand` — or a new field on `ExtensionContext`), land that, then use it. Never reach around the API.
```

becomes:

```md
Corollary: if an extension needs a capability the host doesn't yet expose, add it to `@gcscode/extension-api` first (as a new method under one of the existing `ExtensionHost` namespaces — `host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*` — or as a new namespace if the capability is cross-cutting; or a new field on `ExtensionContext`), land that, then use it. Never reach around the API.
```

No other parts of `CLAUDE.md` change.

## Files modified / added

| Path                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/decisions/ADR-0006-extensionhost-namespacing.md`        | NEW. Records the namespacing decision, full method mapping, rationale, alternatives considered, and follow-ups. ~95 lines.                                                                                                                                                                                                                                                                              |
| `packages/extension-api/src/index.ts`                         | The `ExtensionHost` interface is replaced with the topic-namespaced shape. The contribution interfaces (`ViewContribution`, `StatusBarItemContribution`, `CommandContribution`, `KeybindingContribution`), `Disposable`, `ExtensionIdentity`, `ExtensionContext`, and `Extension` are unchanged. ~30 lines net change inside the `ExtensionHost` definition; surrounding interfaces are byte-identical. |
| `packages/shell/src/extension-host/registry.ts`               | The `createHost` factory's returned object is restructured into four namespaces. The closure-over-state (four contribution `SvelteMap`s, `exportsByExtension`, `subscriptionsByExtension`, `deactivateHooksByExtension`, `execute<T>`) and per-method bodies are byte-identical. The `Registry` interface and `createRegistry`'s other internals are unchanged. ~60 lines net change in `createHost`.   |
| `packages/shell/src/extension-host/registry.test.ts`          | Test extensions migrate from flat `host.register*` calls to namespaced calls; tests of `host.executeCommand` and `host.getExtension` move to `host.commands.executeCommand` and `host.extensions.getExtension`. ~50 tests touched, all mechanical. No new tests added.                                                                                                                                  |
| `packages/shell/src/extension-host/extension-manager.test.ts` | Same migration pattern. ~14 tests touched.                                                                                                                                                                                                                                                                                                                                                              |
| `packages/shell/src/app.test.ts`                              | Same migration pattern for the test extension(s) in this file.                                                                                                                                                                                                                                                                                                                                          |
| `packages/extension-example/src/index.ts`                     | Four `host.register*` calls inside `activate()` migrate to namespaced form.                                                                                                                                                                                                                                                                                                                             |
| `packages/extension-example/src/index.test.ts`                | Updates flow from the source change; assertions unchanged.                                                                                                                                                                                                                                                                                                                                              |
| `packages/extension-sitl/src/index.ts`                        | Three `host.register*` calls inside `activate()` migrate to namespaced form.                                                                                                                                                                                                                                                                                                                            |
| `packages/extension-sitl/src/index.test.ts`                   | Updates flow from the source change.                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/extension-vehicle-status/src/index.ts`              | One `host.getExtension` call (in the `getSitlExports` helper) migrates to `host.extensions.getExtension`; one `host.registerStatusBarItem` call inside `activate()` migrates to `host.window.registerStatusBarItem`.                                                                                                                                                                                    |
| `packages/extension-vehicle-status/src/index.test.ts`         | Updates flow from the source change.                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/extension-api/README.md`                            | REPLACED. Usage example, activation context bullet, Cross-extension exports section all updated to the namespaced form. Other sections (Stability, Lifecycle, Conventions) keep current content.                                                                                                                                                                                                        |
| `packages/extension-example/README.md`                        | Four method references in the "What it demonstrates" prose updated to namespaced form.                                                                                                                                                                                                                                                                                                                  |
| `packages/extension-sitl/README.md`                           | One inline-code reference in "Cross-extension exports" updated.                                                                                                                                                                                                                                                                                                                                         |
| `packages/extension-vehicle-status/README.md`                 | One inline-code reference in "Contributions" updated.                                                                                                                                                                                                                                                                                                                                                   |
| `docs/roadmap.md`                                             | Phase C section: replace the single "Phase C scope — TBD" line with two bullets (C1 shipped + C2+ TBD).                                                                                                                                                                                                                                                                                                 |
| `docs/vs-code-alignment.md`                                   | Append one new row to the **Alignments** table.                                                                                                                                                                                                                                                                                                                                                         |
| `docs/decisions/ADR-0003-plugin-api-refinements.md`           | Append one new follow-up bullet pointing at ADR-0006.                                                                                                                                                                                                                                                                                                                                                   |
| `docs/decisions/ADR-0005-extension-boundaries.md`             | Append one new follow-up bullet pointing at ADR-0006.                                                                                                                                                                                                                                                                                                                                                   |
| `CLAUDE.md`                                                   | One sentence in the Boundary-rule corollary updated to mention the four namespaces.                                                                                                                                                                                                                                                                                                                     |

## Branching and commit

This iteration touches code (the `@gcscode/extension-api` types, the shell registry, three first-party extensions, plus tests), so per `CLAUDE.md` ("Implementation work runs on `feat/<topic>` branches off master") it runs on `feat/extensionhost-namespacing` off master, merged with `git merge --no-ff feat/extensionhost-namespacing`.

Spec + ADR-0006 land on master directly (docs metadata about future work) before the feature branch starts. They commit together in one `docs:` commit that mirrors the [`49c945e docs: ADR-0005 + iteration A spec for cross-extension exports`](https://github.com/) precedent.

Commits on the feature branch (proposed split):

1. **`feat(extension-api): namespaced ExtensionHost — commands/window/keybindings/extensions`** — replaces the `ExtensionHost` interface in `packages/extension-api/src/index.ts`. Type changes only. Tests fail at this commit (the registry's `createHost` still returns the old flat shape) — that's expected; commit 2 fixes them.
2. **`feat(shell): namespaced host factory in registry`** — restructures `createHost` in `packages/shell/src/extension-host/registry.ts`. After this commit, type compilation succeeds, but the three first-party extensions and ~70 tests still call the flat methods — they fail until commit 3.
3. **`feat(extensions): migrate first-party extensions to namespaced host`** — migrates `extension-example`, `extension-sitl`, `extension-vehicle-status`, plus all touched test files (`registry.test.ts`, `extension-manager.test.ts`, `app.test.ts`, the three per-extension `index.test.ts` files). After this commit, `pnpm test` passes; `pnpm check` clean; `pnpm lint` clean.
4. **`docs: ADR-0006 propagation — ledger, roadmap, READMEs, ADR-0003/0005 follow-ups, CLAUDE.md`** — all doc updates in one commit. Lands at the end of the branch.

The split lets a reviewer step through the migration in dependency order: types → host factory → consumers → docs.

The plan implementation skill (`superpowers:subagent-driven-development` per CLAUDE.md) handles per-task review followups in separate `Code-review-followup:` commits on the same branch.

After all four commits land, merge via `superpowers:finishing-a-development-branch` with `git merge --no-ff feat/extensionhost-namespacing`.

## Verification

- `pnpm format && pnpm lint` clean across the workspace at the end of commit 3 and commit 4.
- `pnpm check` clean across all four packages at the end of commit 2 (type-level) through commit 4 (final).
- `pnpm test` passes after commit 3. Total test count unchanged from the iteration's start (no new tests, no removed tests). Same baseline assertions; only the `host.*` call paths in test extensions change.
- `pnpm dev` smoke test after commit 3: app boots; example + SITL + vehicle-status views render; `Alt+Shift+G` (greet command) and `Alt+Shift+L` (SITL location) keybindings fire; SITL telemetry feeds the vehicle-status footer item correctly. No console errors.
- Manual: open `docs/decisions/ADR-0006-extensionhost-namespacing.md`; confirm tables render; confirm cross-doc links to ADR-0003, ADR-0005, the spec, the alignment ledger, and the roadmap resolve.
- Manual: open `docs/roadmap.md`; confirm Phase C section now has two bullets; the C1 line is checked and links to the spec + ADR.
- Manual: open `docs/vs-code-alignment.md`; confirm the new Alignments row sits at the bottom of the Alignments table; the link to ADR-0006 resolves.
- `git log --oneline` after the merge shows: the merge commit; commits 1–4 above on the feature branch; the spec+ADR commit on master before the branch.

## VS Code alignment

This iteration is itself a VS Code alignment iteration (the second in the housekeeping sequence after the ledger landing). The alignment table for the iteration:

| Concern                          | VS Code                                                                                                                       | gcscode                                                         | Notes                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands.registerCommand`       | `vscode.commands.registerCommand`                                                                                             | `host.commands.registerCommand`                                 | Aligned                                                                                                                                                                                                                                                                                                    |
| `commands.executeCommand`        | `vscode.commands.executeCommand`                                                                                              | `host.commands.executeCommand`                                  | Aligned                                                                                                                                                                                                                                                                                                    |
| `extensions.getExtension`        | `vscode.extensions.getExtension`                                                                                              | `host.extensions.getExtension`                                  | Aligned                                                                                                                                                                                                                                                                                                    |
| `window.registerView` / similar  | `vscode.window.registerTreeDataProvider`, `vscode.window.registerWebviewPanelSerializer`, `vscode.window.createStatusBarItem` | `host.window.registerView`, `host.window.registerStatusBarItem` | Aligned in pattern (verb-suffix preserved, `window` topic). The `registerStatusBarItem` vs VS Code's `createStatusBarItem` verb difference flows from the static-struct vs mutable-object choice already captured by the ledger's "View / status-bar contributions" row; not introduced by this iteration. |
| `keybindings.registerKeybinding` | n/a (declarative in `package.json`)                                                                                           | `host.keybindings.registerKeybinding`                           | No VS Code precedent for the namespace. Local choice. Programmatic-keybindings divergence is already in the ledger.                                                                                                                                                                                        |
| `Registry` namespacing           | n/a (internal)                                                                                                                | `Registry` stays flat                                           | Out of scope; `Registry` is shell-internal.                                                                                                                                                                                                                                                                |

No new alignment ledger Divergences are introduced by this iteration. One new Alignments row is added to the ledger (the namespaced host).

## `docs/out-of-scope.md` propagation

None. This iteration adopts a forecast capability (host namespacing per ADR-0003); does not introduce new deferrals.

## Follow-ups (out of scope for this iteration)

- **C2+ — Phase C cross-cutting capabilities.** Events, settings, themes, i18n. Each lands as a new namespace under `host.*` when a feature extension pulls on it. Roadmap entry for C2+ stays "TBD" until a feature extension triggers re-scoping.
- **Type renames toward VS Code naming.** `ViewContribution` → `ViewDefinition` or similar; `StatusBarItemContribution` → `StatusBarItem`; etc. Out of scope this iteration. Trigger to revisit: the type names start to feel out of step with the namespace naming, OR a non-trivial consumer pulls on the renames.
- **`host.keybindings` additional verbs.** If `host.keybindings.dispatch(event)` or `host.keybindings.list()` ever land, the `registerKeybinding` redundancy gets diluted. Trigger to revisit: a real consumer pulls on additional keybinding verbs.
- **A4+ contribution kinds.** Menu items, palette entries, tree views, webviews. Each lands as a new method under `host.window.*` (or `host.menus.*` if a separate namespace makes more sense at the time). Trigger: a real consumer needs the surface.
- **Webview wing.** Already on the roadmap as Coming. The webview-host iteration will live under `host.window.*` (e.g., `host.window.createWebviewPanel`) following this ADR's pattern.
