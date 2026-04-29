# Iteration A — Cross-extension exports + `vehicle-status` consumer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cross-extension data sharing to the gcscode extension architecture: producers return an exports value from `activate()`, consumers look it up via `host.getExtension<T>(id)`, and a new `@gcscode/extension-vehicle-status` package consumes SITL telemetry as a status bar item to prove the seam end-to-end.

**Architecture:** New `SvelteMap<string, unknown>` in `registry.ts` captures whatever each extension's `activate()` returns; `createHost(identity)` exposes a `getExtension<T>(id): { id; exports: T } | undefined` reader against that map. `@gcscode/extension-sitl` returns its existing `$state` telemetry proxy via a typed `SitlExports` interface. New `@gcscode/extension-vehicle-status` package depends on SITL via `import type` only, with the boundary enforced by an updated ESLint rule (`@typescript-eslint/no-restricted-imports` with `allowTypeImports: true`).

**Tech Stack:** TypeScript, Svelte 5 (`$state` / `$derived` runes), Vitest, ESLint flat config (typescript-eslint), pnpm workspaces.

**Spec:** [`docs/specs/2026-04-29-iteration-a-extension-exports.md`](../specs/2026-04-29-iteration-a-extension-exports.md)
**ADR:** [`docs/decisions/ADR-0005-extension-boundaries.md`](../decisions/ADR-0005-extension-boundaries.md)

---

## Branch & worktree setup (orchestrator runs this once before Task 1)

This iteration runs on a feature branch off `master`:

```bash
cd /Users/kevinkroon/Projects/gcscode/shell
git fetch origin
git switch -c feat/iteration-a-extension-exports master
```

If using a worktree (recommended for subagent-driven execution to keep `master` clean):

```bash
git worktree add .worktrees/feat-iteration-a-extension-exports feat/iteration-a-extension-exports
```

The worktree path becomes `<repo-root>/.worktrees/feat-iteration-a-extension-exports/` (a sibling-ish to the main checkout). Subagents dispatched to this worktree MUST follow the discipline in CLAUDE.md → "Subagent worktree discipline":

1. Prepend `cd <worktree-path>/<package-root> &&` to **every** bash command. cwd does not persist between bash calls.
2. Before every `git commit`, chain `git branch --show-current` and verify it reads `feat/iteration-a-extension-exports`. If it reads `master`, STOP — the cwd is wrong.
3. Run `pnpm format`, `pnpm test`, `pnpm check`, `pnpm lint` only with the `cd <worktree>/<package-root> &&` prefix.

The orchestrator MUST restate these rules in each subagent's prompt.

---

## File Structure

**Files to create:**

| Path                                                               | Responsibility                                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `packages/extension-vehicle-status/package.json`                   | Package manifest. Workspace deps on `@gcscode/extension-api` and `@gcscode/extension-sitl`; svelte peer dep. |
| `packages/extension-vehicle-status/tsconfig.json`                  | Extends root `tsconfig.base.json`.                                                                           |
| `packages/extension-vehicle-status/vitest.config.ts`               | Vitest config matching `extension-sitl/vitest.config.ts`.                                                    |
| `packages/extension-vehicle-status/README.md`                      | Package purpose + contributions + dependencies — mirrors `extension-sitl/README.md`.                         |
| `packages/extension-vehicle-status/src/index.ts`                   | Defines `vehicleStatusExtension` + the `getSitlExports` consumer helper.                                     |
| `packages/extension-vehicle-status/src/index.test.ts`              | 3 tests (identity, registration/disposal, getSitlExports helper).                                            |
| `packages/extension-vehicle-status/src/vehicle-status-item.svelte` | Status bar component. Reads via `$derived(getSitlExports())` and renders the formatted summary.              |

**Files to modify:**

| Path                                                           | Responsibility                                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-api/src/index.ts`                          | `Extension.activate()` return type → `unknown`; add `ExtensionHost.getExtension<T>(id)`.                                                                |
| `packages/shell/src/extension-host/registry.ts`                | Add `exportsByExtension: SvelteMap<string, unknown>`; capture return value in `activate`; clear in `deactivate`; expose `getExtension` on `createHost`. |
| `packages/shell/src/extension-host/registry.test.ts`           | Add 6 new tests for exports lifecycle.                                                                                                                  |
| `packages/shell/src/extension-host/extension-manifest.ts`      | Bundle `vehicleStatusExtension` after `sitlExtension`.                                                                                                  |
| `packages/shell/src/extension-host/extension-manifest.test.ts` | Add a test that vehicle-status appears after SITL.                                                                                                      |
| `packages/extension-sitl/src/index.ts`                         | Add `SitlExports` interface; `activate` returns `{ telemetry: telemetryState }`.                                                                        |
| `packages/extension-sitl/src/index.test.ts`                    | Add 1 test for the new return value.                                                                                                                    |
| `eslint.config.ts`                                             | Replace `no-restricted-imports` with `@typescript-eslint/no-restricted-imports`; add the sibling-extension `allowTypeImports` pattern.                  |
| `CLAUDE.md`                                                    | Boundary-rule paragraph rewrite per ADR-0005.                                                                                                           |
| `docs/out-of-scope.md`                                         | Add bullet about extension activation ordering & `extensionDependencies` deferral.                                                                      |
| `docs/roadmap.md`                                              | Add `Vehicle status` checked + `Webview wing + Preact battery widget` unchecked.                                                                        |

No other files are touched. `@gcscode/extension-example`, `extension-manager.ts`, `extension-persistence.ts`, `keybinding-dispatcher.ts`, `app.svelte`, `main.ts`, `pnpm-workspace.yaml` (uses `packages/*` glob) all stay as-is.

---

## Task 1: API contract (`@gcscode/extension-api`)

**Files:**

- Modify: `packages/extension-api/src/index.ts`

Pure type-only change. There is no runtime behavior to test; verification is `pnpm check`. No test file changes for this task.

- [ ] **Step 1: Modify `Extension.activate()` return type and add `ExtensionHost.getExtension`**

Open `packages/extension-api/src/index.ts`. Change the `Extension` interface's `activate` return type from `void` to `unknown` and add a new `getExtension<T>` method to `ExtensionHost` with JSDoc.

The relevant section currently reads (around lines 76–106):

```ts
export interface ExtensionHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  registerKeybinding(keybinding: KeybindingContribution): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}

// ...

export interface Extension extends ExtensionIdentity {
  activate(context: ExtensionContext): void;
  deactivate?(): void | Promise<void>;
}
```

Replace the `ExtensionHost` block with (the new method plus existing ones):

```ts
/**
 * The per-extension gate. Each `register*` method returns a `Disposable` whose
 * `dispose()` removes the registration. New contribution kinds slot in as
 * further `register*` methods. Future steps will wrap this object to enforce
 * per-extension permission scopes without changing the extension-facing API.
 */
export interface ExtensionHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  registerKeybinding(keybinding: KeybindingContribution): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
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
}
```

Replace the `Extension` interface with:

```ts
/**
 * An extension module's named export. Identity fields give the host extension
 * identity for diagnostics; `activate(context)` is the single entry point.
 * Returning a value from `activate()` publishes that value as the extension's
 * exports — other extensions can look it up via `host.getExtension(id)` (see
 * ADR-0005). Producers that don't expose an API may return nothing.
 *
 * `deactivate?()` is an optional hook for non-disposable / async cleanup. The
 * host awaits the returned Promise (if any) before tearing down subscriptions.
 */
export interface Extension extends ExtensionIdentity {
  activate(context: ExtensionContext): unknown;
  deactivate?(): void | Promise<void>;
}
```

`unknown` is a supertype of `void`; existing extensions whose `activate()` ends without a return continue to satisfy the new contract.

- [ ] **Step 2: Verify the package type-checks**

Run from the worktree root:

```bash
pnpm --filter @gcscode/extension-api check
```

Expected: clean exit. No errors.

- [ ] **Step 3: Verify the rest of the workspace still type-checks**

```bash
pnpm check
```

Expected: clean exit across all packages. (`@gcscode/extension-example` and `@gcscode/extension-sitl` continue to compile because their `activate()` implementations satisfy `unknown`.)

- [ ] **Step 4: Commit**

```bash
git branch --show-current  # MUST read: feat/iteration-a-extension-exports
git add packages/extension-api/src/index.ts
git commit -m "feat(extension-api): add getExtension + activate returns unknown

Adds ExtensionHost.getExtension<T>(id) for cross-extension data lookup
and widens Extension.activate() return type to unknown so producers can
publish exports. Both per ADR-0005."
```

---

## Task 2: Registry exports plumbing

**Files:**

- Modify: `packages/shell/src/extension-host/registry.ts`
- Modify: `packages/shell/src/extension-host/registry.test.ts`

TDD: write each new test, watch it fail, implement enough to pass, run tests.

- [ ] **Step 1: Add the failing tests for the exports lifecycle**

Open `packages/shell/src/extension-host/registry.test.ts`. The file uses Vitest + the existing `extension(id, activate)` helper at the top. Append 6 new tests inside the existing `describe('createRegistry', ...)` block (after the last existing `it(...)`):

```ts
it('exposes activate() return value via host.getExtension', async () => {
  const registry = createRegistry();
  let lookupHost: ExtensionHost | undefined;
  registry.activate({
    id: 'ext.producer',
    displayName: 'Producer',
    version: '0.0.0',
    activate: (ctx) => {
      lookupHost = ctx.host;
      return { hello: 'world' };
    },
  });
  // Lookup from any host instance works — they share the same registry.
  const wrapper = lookupHost!.getExtension<{ hello: string }>('ext.producer');
  expect(wrapper).toBeDefined();
  expect(wrapper!.id).toBe('ext.producer');
  expect(wrapper!.exports.hello).toBe('world');
});

it('host.getExtension wrapper exists with undefined exports for void activate', () => {
  const registry = createRegistry();
  let lookupHost: ExtensionHost | undefined;
  registry.activate(
    extension('ext.silent', (ctx) => {
      lookupHost = ctx.host;
      // No return value.
    }),
  );
  const wrapper = lookupHost!.getExtension('ext.silent');
  expect(wrapper).toBeDefined();
  expect(wrapper!.exports).toBeUndefined();
});

it('deactivate clears exports — getExtension returns undefined afterward', async () => {
  const registry = createRegistry();
  let lookupHost: ExtensionHost | undefined;
  registry.activate({
    id: 'ext.producer',
    displayName: 'Producer',
    version: '0.0.0',
    activate: (ctx) => {
      lookupHost = ctx.host;
      return { hello: 'world' };
    },
  });
  expect(lookupHost!.getExtension('ext.producer')).toBeDefined();
  await registry.deactivate('ext.producer');
  expect(lookupHost!.getExtension('ext.producer')).toBeUndefined();
});

it('host.getExtension returns undefined for an unregistered id', () => {
  const registry = createRegistry();
  let lookupHost: ExtensionHost | undefined;
  registry.activate(
    extension('ext.observer', (ctx) => {
      lookupHost = ctx.host;
    }),
  );
  expect(lookupHost!.getExtension('ext.never-registered')).toBeUndefined();
});

it('re-activating after deactivate publishes fresh exports', async () => {
  const registry = createRegistry();
  let lookupHost: ExtensionHost | undefined;
  const makeProducer = (payload: string): Extension => ({
    id: 'ext.producer',
    displayName: 'Producer',
    version: '0.0.0',
    activate: (ctx) => {
      lookupHost = ctx.host;
      return { payload };
    },
  });
  registry.activate(makeProducer('first'));
  expect(lookupHost!.getExtension<{ payload: string }>('ext.producer')!.exports.payload).toBe(
    'first',
  );
  await registry.deactivate('ext.producer');
  registry.activate(makeProducer('second'));
  expect(lookupHost!.getExtension<{ payload: string }>('ext.producer')!.exports.payload).toBe(
    'second',
  );
});

it('host.getExtension defaults the generic to unknown', () => {
  const registry = createRegistry();
  let lookupHost: ExtensionHost | undefined;
  registry.activate(
    extension('ext.observer', (ctx) => {
      lookupHost = ctx.host;
    }),
  );
  registry.activate({
    id: 'ext.producer',
    displayName: 'Producer',
    version: '0.0.0',
    activate: () => ({ value: 42 }),
  });
  // Default generic — exports is `unknown`, narrowing required at use sites.
  const wrapper = lookupHost!.getExtension('ext.producer');
  expect(wrapper).toBeDefined();
  // Cast to the producer's known shape for the assertion.
  expect((wrapper!.exports as { value: number }).value).toBe(42);
});
```

The test helper `extension(id, activate)` already exists at the top of the file — it produces an `Extension` whose `activate` returns void. The tests above use either that helper or inline literal `Extension` objects when they need an `activate` that returns a value.

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
pnpm --filter @gcscode/shell test registry
```

Expected: 6 new failures, all reporting that `host.getExtension` is not a function (or undefined).

- [ ] **Step 3: Implement the registry changes**

Open `packages/shell/src/extension-host/registry.ts`. Make four edits:

**Edit 3a — Add the new SvelteMap and update the invariant comment.**

Find the block starting `// Invariant: registry mutations propagate reactively...` (around line 25–30). Replace it and the immediately-following declarations:

```ts
// Invariant: registry mutations propagate reactively to mounted consumers.
// The four contribution maps and the cross-extension exports map are SvelteMap
// instances (from svelte/reactivity), so $derived(registry.list*()) and
// $derived(host.getExtension(...)) re-track on set/delete and the rendered UI
// updates without remount. subscriptionsByExtension and deactivateHooksByExtension
// stay plain Maps because no UI consumer reads them — the registry uses them
// internally for deactivate orchestration only.
export function createRegistry(): Registry {
  const views = new SvelteMap<string, ViewContribution>();
  const statusBarItems = new SvelteMap<string, StatusBarItemContribution>();
  const commands = new SvelteMap<string, CommandContribution>();
  const keybindings = new SvelteMap<string, KeybindingContribution>();
  const exportsByExtension = new SvelteMap<string, unknown>();
  const subscriptionsByExtension = new Map<string, readonly Disposable[]>();
  const deactivateHooksByExtension = new Map<string, () => void | Promise<void>>();
```

**Edit 3b — Capture the activate() return value in `registry.activate`.**

Find the existing `activate(extension)` body (around lines 124–140):

```ts
activate(extension) {
  const identity: ExtensionIdentity = {
    id: extension.id,
    displayName: extension.displayName,
    version: extension.version,
  };
  const context: ExtensionContext = {
    host: createHost(identity),
    subscriptions: [],
    extension: identity,
  };
  extension.activate(context);
  subscriptionsByExtension.set(identity.id, context.subscriptions);
  if (extension.deactivate) {
    deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
  }
},
```

Change `extension.activate(context);` to capture the return value, and store it after the existing two `set` calls:

```ts
activate(extension) {
  const identity: ExtensionIdentity = {
    id: extension.id,
    displayName: extension.displayName,
    version: extension.version,
  };
  const context: ExtensionContext = {
    host: createHost(identity),
    subscriptions: [],
    extension: identity,
  };
  const exportsValue = extension.activate(context);
  subscriptionsByExtension.set(identity.id, context.subscriptions);
  if (extension.deactivate) {
    deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
  }
  exportsByExtension.set(identity.id, exportsValue);
},
```

The `set` is unconditional — even for `void`-returning activate, the key is present (with value `undefined`). That makes "is the extension active?" a single map presence check.

**Edit 3c — Clear exports on deactivate.**

Find the existing `deactivate(extensionId)` body (around lines 141–168). At the very end, alongside the existing two `delete` calls, add the third:

```ts
subscriptionsByExtension.delete(extensionId);
deactivateHooksByExtension.delete(extensionId);
exportsByExtension.delete(extensionId);
```

**Edit 3d — Expose `getExtension` on the host wrapper.**

Find the `createHost(extension: ExtensionIdentity): ExtensionHost` function (around lines 47–121). It returns an object literal with `registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`, and `executeCommand`. Add `getExtension` as the sixth method, immediately after `executeCommand`:

```ts
executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
  return execute<T>(id, args, `extension "${extension.id}"`);
},
getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined {
  if (!exportsByExtension.has(id)) return undefined;
  return { id, exports: exportsByExtension.get(id) as T };
},
```

The presence check (`exportsByExtension.has(id)`) is what the SvelteMap reactively tracks — consumers re-render when the producer enables/disables. The `as T` cast is the unsafe sugar documented in the JSDoc.

- [ ] **Step 4: Run the registry tests to verify they pass**

```bash
pnpm --filter @gcscode/shell test registry
```

Expected: all tests pass — the 6 new ones plus all existing ones.

- [ ] **Step 5: Run all shell tests to confirm no regression**

```bash
pnpm --filter @gcscode/shell test
```

Expected: clean.

- [ ] **Step 6: Type-check**

```bash
pnpm --filter @gcscode/shell check
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git branch --show-current  # MUST read: feat/iteration-a-extension-exports
git add packages/shell/src/extension-host/registry.ts packages/shell/src/extension-host/registry.test.ts
git commit -m "feat(shell): registry stores per-extension exports + host.getExtension

Captures activate() return value into a SvelteMap keyed by extension id.
Cleared on deactivate. createHost exposes getExtension<T>(id) reading
from the same map. SvelteMap-backed reactivity makes consumer reads in
\$derived/template contexts auto-track enable/disable transitions.

Per ADR-0005 + spec 2026-04-29-iteration-a-extension-exports."
```

---

## Task 3: SITL exports

**Files:**

- Modify: `packages/extension-sitl/src/index.ts`
- Modify: `packages/extension-sitl/src/index.test.ts`

- [ ] **Step 1: Add the failing test for `SitlExports`**

Open `packages/extension-sitl/src/index.test.ts`. Append a test inside the existing `describe('sitlExtension', ...)` block:

```ts
it('activate returns SitlExports with the live telemetry store', () => {
  // Stub WebSocket so activate() doesn't open a real connection.
  vi.stubGlobal(
    'WebSocket',
    class {
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      close() {
        this.readyState = 3;
        this.onclose?.();
      }
    },
  );

  try {
    const subscriptions: Disposable[] = [];
    const fakeHost = {
      registerView: vi.fn(() => ({ dispose: () => {} })),
      registerStatusBarItem: vi.fn(() => ({ dispose: () => {} })),
      registerCommand: vi.fn(() => ({ dispose: () => {} })),
      registerKeybinding: vi.fn(() => ({ dispose: () => {} })),
      executeCommand: vi.fn(() => Promise.resolve()),
      getExtension: vi.fn(() => undefined),
    } as unknown as ExtensionHost;
    const exports = sitlExtension.activate({
      host: fakeHost,
      subscriptions,
      extension: {
        id: sitlExtension.id,
        displayName: sitlExtension.displayName,
        version: sitlExtension.version,
      },
    }) as SitlExports;

    expect(exports).toBeDefined();
    expect(exports.telemetry).toBeDefined();
    // Identity check — the exported telemetry IS the live store, not a snapshot.
    expect(exports.telemetry).toBe(telemetryState);
  } finally {
    vi.unstubAllGlobals();
    // Clean up — the activate() opened a (mock) WebSocket; close it.
    void sitlExtension.deactivate?.();
  }
});
```

The test imports needed:

```ts
import type { Disposable, ExtensionHost } from '@gcscode/extension-api';
import { telemetryState } from './telemetry-store.svelte';
import { sitlExtension, type SitlExports } from './index';
```

If those imports aren't already at the top of the test file, add the missing ones. (`sitlExtension` is already imported; `SitlExports` is new and will be added in step 3 below.)

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @gcscode/extension-sitl test index
```

Expected: failure on the import — `SitlExports` is not exported from `./index` yet. (Or, if you skip the import update, the test fails because `activate` returns void.)

- [ ] **Step 3: Add `SitlExports` and return it from `activate`**

Open `packages/extension-sitl/src/index.ts`. Add the type import for `TelemetryState` and the new `SitlExports` interface. Modify the `activate` function to return the exports value.

Top of the file currently reads:

```ts
import type { Extension } from '@gcscode/extension-api';

import { createMavlinkClient, type MavlinkClient } from './mavlink-client';
import SitlView from './sitl-view.svelte';
import { applyMessage, reset, setConnectionState, telemetryState } from './telemetry-store.svelte';
```

Update the telemetry-store import to also pull in the type:

```ts
import type { Extension } from '@gcscode/extension-api';

import { createMavlinkClient, type MavlinkClient } from './mavlink-client';
import SitlView from './sitl-view.svelte';
import {
  applyMessage,
  reset,
  setConnectionState,
  telemetryState,
  type TelemetryState,
} from './telemetry-store.svelte';
```

(That requires `TelemetryState` to be exported from `telemetry-store.svelte.ts`. It already is — the file declares `export interface TelemetryState`.)

Add the `SitlExports` interface immediately after the imports, before the `FILTER` constant:

```ts
/**
 * Cross-extension exports for the SITL extension. Consumers `import type` this
 * from `@gcscode/extension-sitl` and look up the live value via
 * `host.getExtension<SitlExports>('gcscode.sitl')?.exports`.
 *
 * `telemetry` is the live `$state` proxy from `telemetry-store.svelte.ts` —
 * field reads in `$derived` / template contexts auto-track. Typed `Readonly`
 * to communicate "consumers do not mutate this." Runtime allows writes; the
 * readonly is convention + lint, not a hard wall (see ADR-0005's known
 * limitations).
 */
export interface SitlExports {
  telemetry: Readonly<TelemetryState>;
}
```

Modify the `activate` body to add an explicit `return` at the end:

```ts
activate(context): SitlExports {
  client = createMavlinkClient({
    url: WS_URL,
    onMessage: applyMessage,
    onConnectionStateChange: setConnectionState,
  });

  context.subscriptions.push(
    context.host.registerView({
      id: 'gcscode.sitl.location',
      component: SitlView,
    }),
    context.host.registerCommand({
      id: 'gcscode.sitl.getLocation',
      run: () => {
        if (telemetryState.lat === null || telemetryState.lng === null) {
          console.log('SITL location: (no fix yet)');
          return null;
        }
        const loc = {
          lat: telemetryState.lat,
          lng: telemetryState.lng,
          alt: telemetryState.alt,
        };
        console.log('SITL location:', loc);
        return loc;
      },
    }),
    context.host.registerKeybinding({
      key: 'Alt+Shift+L',
      command: 'gcscode.sitl.getLocation',
    }),
  );

  return { telemetry: telemetryState };
},
```

The body is unchanged apart from the explicit `return { telemetry: telemetryState }` and the `: SitlExports` return type annotation.

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm --filter @gcscode/extension-sitl test index
```

Expected: all tests pass.

- [ ] **Step 5: Run all SITL tests to confirm no regression**

```bash
pnpm --filter @gcscode/extension-sitl test
```

Expected: clean.

- [ ] **Step 6: Type-check the package**

```bash
pnpm --filter @gcscode/extension-sitl check
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add packages/extension-sitl/src/index.ts packages/extension-sitl/src/index.test.ts
git commit -m "feat(sitl): export SitlExports — live telemetry via host.getExtension

activate() now returns { telemetry: telemetryState } typed as SitlExports.
Consumers import type { SitlExports } from '@gcscode/extension-sitl' and
look it up via host.getExtension<SitlExports>('gcscode.sitl').

Per ADR-0005 + spec 2026-04-29-iteration-a-extension-exports."
```

---

## Task 4: New `@gcscode/extension-vehicle-status` package

**Files:**

- Create: `packages/extension-vehicle-status/package.json`
- Create: `packages/extension-vehicle-status/tsconfig.json`
- Create: `packages/extension-vehicle-status/vitest.config.ts`
- Create: `packages/extension-vehicle-status/README.md`
- Create: `packages/extension-vehicle-status/src/index.ts`
- Create: `packages/extension-vehicle-status/src/index.test.ts`
- Create: `packages/extension-vehicle-status/src/vehicle-status-item.svelte`

The new package is the consumer of cross-extension exports. It depends on `@gcscode/extension-sitl` for types only (enforced by ESLint in Task 6) and on `@gcscode/extension-api` for runtime.

- [ ] **Step 1: Create the package directory and `package.json`**

Look at `packages/extension-sitl/package.json` for the canonical shape. Mirror it. Path: `packages/extension-vehicle-status/package.json`:

```json
{
  "name": "@gcscode/extension-vehicle-status",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gcscode/extension-api": "workspace:*",
    "@gcscode/extension-sitl": "workspace:*"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

The `@gcscode/extension-sitl` dep is workspace-resolved; even though we only import types, listing it as a regular dep keeps pnpm's hoisting straightforward. The ESLint rule (Task 6) is what enforces "type-only imports."

- [ ] **Step 2: Create the `tsconfig.json`**

Mirror `packages/extension-sitl/tsconfig.json`. Path: `packages/extension-vehicle-status/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*.ts", "src/**/*.svelte", "src/**/*.svelte.ts"]
}
```

(Verify by running `cat packages/extension-sitl/tsconfig.json` first — copy the exact extends path and include list. The path `../../tsconfig.base.json` should match.)

- [ ] **Step 3: Create the `vitest.config.ts`**

Mirror `packages/extension-sitl/vitest.config.ts`. Path: `packages/extension-vehicle-status/vitest.config.ts`. Run `cat packages/extension-sitl/vitest.config.ts` first to copy verbatim. Likely contents:

```ts
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: {
    environment: 'node',
  },
});
```

If `extension-sitl/vitest.config.ts` differs (e.g. uses `jsdom` or has additional config), copy that instead.

- [ ] **Step 4: Create `src/index.ts`**

Path: `packages/extension-vehicle-status/src/index.ts`:

```ts
import type { Extension, ExtensionHost } from '@gcscode/extension-api';
import type { SitlExports } from '@gcscode/extension-sitl';

import VehicleStatusItem from './vehicle-status-item.svelte';

let host: ExtensionHost | null = null;

/**
 * Helper for the status bar component to read SITL exports reactively.
 * Returns undefined if SITL is not currently activated. Reads inside a
 * `$derived` re-run when SITL enables / disables (registry's exports map is
 * a SvelteMap — see ADR-0005).
 */
export function getSitlExports(): SitlExports | undefined {
  return host?.getExtension<SitlExports>('gcscode.sitl')?.exports;
}

export const vehicleStatusExtension: Extension = {
  id: 'gcscode.vehicle-status',
  displayName: 'Vehicle Status',
  version: '0.0.0',
  activate(context) {
    host = context.host;
    context.subscriptions.push(
      context.host.registerStatusBarItem({
        id: 'gcscode.vehicle-status.summary',
        component: VehicleStatusItem,
        alignment: 'left',
      }),
    );
  },
  deactivate() {
    host = null;
  },
};
```

- [ ] **Step 5: Create `src/vehicle-status-item.svelte`**

Path: `packages/extension-vehicle-status/src/vehicle-status-item.svelte`:

```svelte
<script lang="ts">
  import type { SitlExports } from '@gcscode/extension-sitl';

  import { getSitlExports } from './index';

  function fmtCoord(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(2)}°`;
  }

  function formatSummary(exports: SitlExports | undefined): string {
    if (exports === undefined) return 'SITL: —';
    const t = exports.telemetry;
    if (t.connection === 'connecting') return 'SITL: connecting…';
    if (t.connection === 'disconnected') return 'SITL: disconnected';

    const parts: string[] = [t.mode ?? '—'];
    if (t.lat !== null && t.lng !== null) {
      parts.push(`${fmtCoord(t.lat)}/${fmtCoord(t.lng)}`);
    }
    if (t.batteryRemaining !== null) {
      parts.push(`${t.batteryRemaining}%`);
    }
    return `SITL: ${parts.join(' • ')}`;
  }

  const sitl = $derived(getSitlExports());
  const summary = $derived(formatSummary(sitl));
</script>

<span>{summary}</span>
```

After writing the file, **run the Svelte MCP autofixer** on it before moving on (per CLAUDE.md "Working with Svelte code" → "svelte-autofixer"):

> Use the `svelte-autofixer` MCP tool with the file's source. Keep calling it until no issues or suggestions are returned.

Apply any suggested fixes inline before committing.

- [ ] **Step 6: Create `src/index.test.ts`**

Path: `packages/extension-vehicle-status/src/index.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost, StatusBarItemContribution } from '@gcscode/extension-api';
import type { SitlExports } from '@gcscode/extension-sitl';

import { getSitlExports, vehicleStatusExtension } from './index';

function makeFakeHost(opts: {
  getExtension?: ExtensionHost['getExtension'];
  registerStatusBarItem?: ExtensionHost['registerStatusBarItem'];
}): ExtensionHost {
  return {
    registerView: vi.fn(() => ({ dispose: () => {} })),
    registerStatusBarItem: opts.registerStatusBarItem ?? vi.fn(() => ({ dispose: () => {} })),
    registerCommand: vi.fn(() => ({ dispose: () => {} })),
    registerKeybinding: vi.fn(() => ({ dispose: () => {} })),
    executeCommand: vi.fn(() => Promise.resolve()),
    getExtension: opts.getExtension ?? vi.fn(() => undefined),
  } as unknown as ExtensionHost;
}

describe('vehicleStatusExtension', () => {
  it('declares stable identity metadata', () => {
    expect(vehicleStatusExtension.id).toBe('gcscode.vehicle-status');
    expect(vehicleStatusExtension.displayName).toBe('Vehicle Status');
    expect(typeof vehicleStatusExtension.version).toBe('string');
  });

  it('registers a status bar item and pushes one disposable; deactivate clears the captured host', () => {
    const captured: StatusBarItemContribution[] = [];
    const host = makeFakeHost({
      registerStatusBarItem: vi.fn((item) => {
        captured.push(item);
        return { dispose: () => {} };
      }),
    });
    const subscriptions: Disposable[] = [];
    vehicleStatusExtension.activate({
      host,
      subscriptions,
      extension: {
        id: vehicleStatusExtension.id,
        displayName: vehicleStatusExtension.displayName,
        version: vehicleStatusExtension.version,
      },
    });

    expect(host.registerStatusBarItem).toHaveBeenCalledTimes(1);
    expect(captured[0].id).toBe('gcscode.vehicle-status.summary');
    expect(captured[0].alignment).toBe('left');
    expect(subscriptions).toHaveLength(1);

    // After deactivate, the helper should no longer find SITL.
    vehicleStatusExtension.deactivate?.();
    expect(getSitlExports()).toBeUndefined();
  });

  it('getSitlExports returns SITL exports when SITL is active and undefined when SITL is missing', () => {
    const fakeSitlExports: SitlExports = {
      telemetry: {
        mode: 'GUIDED',
        armed: true,
        lat: -35.36,
        lng: 149.16,
        alt: 5.4,
        heading: 90,
        roll: 0,
        pitch: 0,
        yaw: 0,
        groundspeed: 0,
        voltageBattery: 12.5,
        batteryRemaining: 47,
        connection: 'connected',
      },
    };

    // Active case
    {
      const host = makeFakeHost({
        getExtension: vi.fn((id: string) =>
          id === 'gcscode.sitl' ? { id, exports: fakeSitlExports as unknown } : undefined,
        ) as ExtensionHost['getExtension'],
      });
      vehicleStatusExtension.activate({
        host,
        subscriptions: [],
        extension: {
          id: vehicleStatusExtension.id,
          displayName: vehicleStatusExtension.displayName,
          version: vehicleStatusExtension.version,
        },
      });
      expect(getSitlExports()).toBe(fakeSitlExports);
      vehicleStatusExtension.deactivate?.();
    }

    // Missing case
    {
      const host = makeFakeHost({
        getExtension: vi.fn(() => undefined),
      });
      vehicleStatusExtension.activate({
        host,
        subscriptions: [],
        extension: {
          id: vehicleStatusExtension.id,
          displayName: vehicleStatusExtension.displayName,
          version: vehicleStatusExtension.version,
        },
      });
      expect(getSitlExports()).toBeUndefined();
      vehicleStatusExtension.deactivate?.();
    }
  });
});
```

- [ ] **Step 7: Create `README.md`**

Path: `packages/extension-vehicle-status/README.md`. Mirror `packages/extension-sitl/README.md`'s structure. Run `cat packages/extension-sitl/README.md` first to copy the section shape. Suggested content:

```markdown
# @gcscode/extension-vehicle-status

First consumer of cross-extension exports. Registers a footer status bar item that summarises live SITL telemetry as a single line:
```

SITL: GUIDED • -35.36°/149.17° • 47%

```

## Contributions

- **Status bar item** — `gcscode.vehicle-status.summary`, left-aligned. Renders a Svelte component that reads `host.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry` reactively.

## Cross-extension dependencies

- **`@gcscode/extension-sitl`** — type-only. Imports `SitlExports` via `import type`. Runtime lookup is via `host.getExtension('gcscode.sitl')` — no runtime coupling.

## Behavior

- SITL not active: shows `SITL: —`.
- SITL active, WebSocket connecting: shows `SITL: connecting…`.
- SITL active, WebSocket disconnected: shows `SITL: disconnected`.
- SITL active and connected: shows `SITL: <mode>` plus available coordinates and battery percentage joined by ` • `.

## See also

- ADR-0005 — extension boundaries
- Spec 2026-04-29 — iteration A
```

- [ ] **Step 8: Install workspace deps so the new package is linked**

```bash
pnpm install
```

Expected: pnpm picks up the new package (the workspace uses a `packages/*` glob in `pnpm-workspace.yaml`).

- [ ] **Step 9: Run the new package's tests**

```bash
pnpm --filter @gcscode/extension-vehicle-status test
```

Expected: 3 tests pass.

- [ ] **Step 10: Type-check the new package**

```bash
pnpm --filter @gcscode/extension-vehicle-status check
```

Expected: clean.

- [ ] **Step 11: Run all workspace tests to confirm no regression**

```bash
pnpm test
```

Expected: clean.

- [ ] **Step 12: Commit**

```bash
git branch --show-current
git add packages/extension-vehicle-status/
git commit -m "feat(vehicle-status): new extension consuming SITL exports

First cross-extension consumer per ADR-0005 + spec
2026-04-29-iteration-a-extension-exports.

Registers a left-aligned status bar item showing a one-line summary
of SITL telemetry: 'SITL: <mode> • <lat>°/<lng>° • <bat>%' when
connected, with appropriate fallback strings for connecting,
disconnected, and SITL-not-active states.

Imports SitlExports via 'import type' from @gcscode/extension-sitl;
runtime lookup via host.getExtension. No runtime coupling between
extension packages."
```

---

## Task 5: Bundle vehicle-status into the manifest

**Files:**

- Modify: `packages/shell/src/extension-host/extension-manifest.ts`
- Modify: `packages/shell/src/extension-host/extension-manifest.test.ts`

- [ ] **Step 1: Add the failing test for the manifest order**

Open `packages/shell/src/extension-host/extension-manifest.test.ts`. Add a third test inside the existing `describe('bundledExtensions', ...)` block:

```ts
it('bundles vehicle-status after sitl so the consumer activates after the producer', () => {
  const ids = bundledExtensions.map((entry) => entry.id);
  const sitlIndex = ids.indexOf('gcscode.sitl');
  const vehicleStatusIndex = ids.indexOf('gcscode.vehicle-status');
  expect(sitlIndex).toBeGreaterThanOrEqual(0);
  expect(vehicleStatusIndex).toBeGreaterThan(sitlIndex);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm --filter @gcscode/shell test extension-manifest
```

Expected: failure — `gcscode.vehicle-status` is not in the bundle yet (`vehicleStatusIndex === -1`).

- [ ] **Step 3: Add `vehicleStatusExtension` to the manifest**

Open `packages/shell/src/extension-host/extension-manifest.ts`. Current contents:

```ts
import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';
import { sitlExtension } from '@gcscode/extension-sitl';

export interface ManifestEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
  { id: sitlExtension.id, extension: sitlExtension },
];
```

Replace with:

```ts
import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';
import { sitlExtension } from '@gcscode/extension-sitl';
import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status';

export interface ManifestEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
  { id: sitlExtension.id, extension: sitlExtension },
  // Must come after sitlExtension — vehicle-status reads SITL exports during
  // first render and relies on insertion-order activation. See ADR-0005's
  // "Cross-extension activation order is not guaranteed" consequence.
  { id: vehicleStatusExtension.id, extension: vehicleStatusExtension },
];
```

- [ ] **Step 4: Run the manifest tests to verify they pass**

```bash
pnpm --filter @gcscode/shell test extension-manifest
```

Expected: 3 tests pass (2 existing + 1 new).

- [ ] **Step 5: Run all shell tests**

```bash
pnpm --filter @gcscode/shell test
```

Expected: clean.

- [ ] **Step 6: Type-check the workspace**

```bash
pnpm check
```

Expected: clean across all 5 packages.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add packages/shell/src/extension-host/extension-manifest.ts packages/shell/src/extension-host/extension-manifest.test.ts
git commit -m "feat(shell): bundle vehicle-status after sitl

Adds vehicleStatusExtension to bundledExtensions, ordered after
sitlExtension so the consumer activates after the producer.

Per ADR-0005's known limitations: extension activation order
is bundledExtensions array order; consumer null-checks handle
the inverse-order case but the configured order is the
expected runtime behaviour."
```

---

## Task 6: ESLint refinement (sibling-extension type-only imports)

**Files:**

- Modify: `eslint.config.ts`

- [ ] **Step 1: Update `eslint.config.ts`**

Open `eslint.config.ts`. The current extension-package rule block reads:

```ts
{
  files: ['packages/extension-*/**/*.{ts,svelte}'],
  ignores: ['packages/extension-api/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@gcscode/shell', '@gcscode/shell/*'],
            message:
              'Extensions must only import from @gcscode/extension-api. Shell internals are not part of the extension API.',
          },
          {
            group: ['../../*', '../../../*'],
            message: 'Extensions must not use relative imports that escape the package root.',
          },
        ],
      },
    ],
  },
},
```

Replace it with:

```ts
{
  files: ['packages/extension-*/**/*.{ts,svelte}'],
  ignores: ['packages/extension-api/**'],
  rules: {
    'no-restricted-imports': 'off',
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@gcscode/shell', '@gcscode/shell/*'],
            message:
              'Extensions must only import from @gcscode/extension-api. Shell internals are not part of the extension API.',
          },
          {
            group: ['../../*', '../../../*'],
            message: 'Extensions must not use relative imports that escape the package root.',
          },
          {
            group: ['@gcscode/extension-*', '!@gcscode/extension-api'],
            allowTypeImports: true,
            message:
              'Extensions may only type-import from sibling extension packages (use `import type`). Runtime imports must go through @gcscode/extension-api. (ADR-0005)',
          },
        ],
      },
    ],
  },
},
```

The `'no-restricted-imports': 'off'` line disables the built-in rule so it doesn't double-report alongside the typescript-eslint variant. The `!@gcscode/extension-api` negation in the third pattern is defense-in-depth — the `files`/`ignores` selector already excludes extension-api itself.

- [ ] **Step 2: Run lint to verify the new config is valid**

```bash
pnpm lint
```

Expected: clean — `@gcscode/extension-vehicle-status` only `import type`s from `@gcscode/extension-sitl`, so the new rule passes.

- [ ] **Step 3: Verify the rule rejects a deliberate violation**

Temporarily add a value import to confirm the rule fires:

```bash
# Add a value import to vehicle-status/src/index.ts (DO NOT COMMIT THIS)
```

Edit `packages/extension-vehicle-status/src/index.ts` and change the SITL import line from:

```ts
import type { SitlExports } from '@gcscode/extension-sitl';
```

to:

```ts
import { sitlExtension, type SitlExports } from '@gcscode/extension-sitl';
```

Then run:

```bash
pnpm lint 2>&1 | grep -A1 "extension-sitl"
```

Expected: an error message including the configured text "Extensions may only type-import from sibling extension packages (use \`import type\`). Runtime imports must go through @gcscode/extension-api. (ADR-0005)".

Revert the change:

```ts
import type { SitlExports } from '@gcscode/extension-sitl';
```

Confirm lint is clean again:

```bash
pnpm lint
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add eslint.config.ts
git commit -m "feat(eslint): allow type-only imports between sibling extensions

Switches the extension-packages rule from no-restricted-imports to
@typescript-eslint/no-restricted-imports so we can use allowTypeImports.
Adds a third pattern blocking value imports from @gcscode/extension-*
(except extension-api) while permitting 'import type'.

Carries forward both existing patterns (@gcscode/shell + parent-relative
escapes) unchanged.

Per ADR-0005 + spec 2026-04-29-iteration-a-extension-exports."
```

---

## Task 7: Doc propagation (CLAUDE.md, out-of-scope, roadmap)

**Files:**

- Modify: `CLAUDE.md`
- Modify: `docs/out-of-scope.md`
- Modify: `docs/roadmap.md`

No tests. Verification is reading the rendered Markdown.

- [ ] **Step 1: Update `CLAUDE.md`'s boundary-rule paragraph**

Open `CLAUDE.md`. Find the `## Boundary rule — load bearing` section. The current text reads:

> **Extension packages import ONLY from `@gcscode/extension-api`.** No imports from `@gcscode/shell`. No relative imports that escape the package root. ESLint enforces this; package boundaries in pnpm workspaces reinforce it. Don't work around either.

Replace that paragraph with:

```markdown
**Extension packages import RUNTIME only from `@gcscode/extension-api`.** No runtime imports from `@gcscode/shell` or sibling extension packages. No relative imports that escape the package root.

**Type-only imports from sibling extension packages are allowed**, exclusively for consuming cross-extension `exports` (see [ADR-0005](docs/decisions/ADR-0005-extension-boundaries.md)). The runtime boundary stays preserved — `import type` is erased at compile time. Anything that emits JS at runtime against a sibling extension package is a violation.

ESLint enforces both rules (`@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` for the sibling pattern). Don't work around either.
```

The corollary paragraph that follows (`Corollary: if an extension needs a capability the host doesn't yet expose...`) is unchanged.

- [ ] **Step 2: Update `docs/out-of-scope.md`**

Open `docs/out-of-scope.md`. Find the `## Extension machinery` section. Insert this new bullet right after the existing `Activation events / lazy activation.` bullet and before the `Capability / permission declarations.` bullet:

```markdown
- **Extension activation ordering / dependency declaration.** No `extensionDependencies` manifest field, no topological sort, no "I require X to be active before me" declaration. Today extensions activate in `bundledExtensions` array order; consumers of `host.getExtension(id)?.exports` handle undefined defensively. _Trigger to revisit:_ first ordering bug, OR third-party producer/consumer pair, OR manifest-driven enable persistence. (ADR-0005)
```

The existing manifest deferral bullet, the additional-contribution-kinds bullet, and all other bullets in the file stay unchanged.

- [ ] **Step 3: Update `docs/roadmap.md`**

Open `docs/roadmap.md`. Find the **Feature extensions → Coming (committed — will ship)** subsection. The current state has SITL stub (checked), SITL listener (checked), Map (unchecked), Video feed (unchecked).

Add two new lines at the end of the **Coming** list (after Video feed):

```markdown
- [x] **Vehicle status** — first consumer of cross-extension exports. `@gcscode/extension-vehicle-status` registers a footer status bar item that reads SITL telemetry via `host.getExtension('gcscode.sitl').exports`. Spec: [`specs/2026-04-29-iteration-a-extension-exports.md`](specs/2026-04-29-iteration-a-extension-exports.md)
- [ ] **Webview wing + Preact battery widget** — escape hatch validation per ADR-0005. Sandboxed iframes, postMessage protocol, JSON-RPC, structured-clone snapshots, vanilla + Preact adapters. Real consumer: `@gcscode/extension-battery-widget` in Preact, sandboxed, consuming SITL telemetry.
```

Existing **Map** and **Video feed** lines stay unchanged. Existing **Considering** section stays unchanged.

- [ ] **Step 4: Verify docs render correctly**

Run a quick Markdown sanity check by viewing the files:

```bash
git diff CLAUDE.md docs/out-of-scope.md docs/roadmap.md | head -80
```

Eyeball the diff for typos, missing newlines, or broken Markdown. If the editor stripped trailing newlines or inserted CRLFs, fix.

- [ ] **Step 5: Run lint + format to ensure no doc-formatting issues**

```bash
pnpm lint
pnpm format
```

Expected: clean. (Prettier may reformat the `docs/*.md` files; that's fine.)

- [ ] **Step 6: Run all workspace checks one last time**

```bash
pnpm check
pnpm test
pnpm lint
```

Expected: all clean across all 5 packages.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add CLAUDE.md docs/out-of-scope.md docs/roadmap.md
git commit -m "docs: propagate iteration A — boundary rule, out-of-scope, roadmap

CLAUDE.md: rewrite the load-bearing boundary rule to allow type-only
imports between sibling extension packages, per ADR-0005.

out-of-scope.md: add the extension activation ordering / dependency
declaration deferral with its trigger to revisit.

roadmap.md: flip Vehicle status to checked + link the spec; add the
Webview wing + Preact battery widget line as Coming, unchecked.

Per ADR-0005 + spec 2026-04-29-iteration-a-extension-exports."
```

---

## Final verification (orchestrator runs after Task 7)

Before merging the feature branch via `superpowers:finishing-a-development-branch`:

- [ ] **Run the full check suite**

```bash
pnpm check
pnpm test
pnpm lint
pnpm --filter @gcscode/shell build
```

Expected: all clean. Workspace test count grows from 139 → ~149 (10 new tests across registry, sitl, vehicle-status, manifest).

- [ ] **Dev-server smoke test (manual, with `mavlink2rest` running)**

1. In the `Drone SITL` repo: `./run_sitl.sh` to bring up SITL + MAVProxy + `mavlink2rest`.
2. In the gcscode worktree: `pnpm dev`.
3. Open `http://localhost:5173/`.
4. Footer (left side) shows `SITL: connecting…` briefly, then `SITL: STABILIZE` (or whatever boot mode), then `SITL: STABILIZE • -35.36°/149.16° • 100%` once GPS + battery messages have arrived.
5. In MAVProxy: `mode GUIDED`. Footer summary updates to `SITL: GUIDED • ...` within ~1 second — confirms cross-extension reactive flow end-to-end.
6. Stop `mavlink2rest`. Footer shows `SITL: disconnected`.

- [ ] **Without-bridge smoke test**

1. Stop everything.
2. `pnpm dev` only (no `mavlink2rest` running).
3. Open `http://localhost:5173/`.
4. Footer shows `SITL: disconnected` immediately. The SITL view itself shows its existing disconnected state. No crashes; the rest of the app continues to work.

- [ ] **Final cross-cutting code review (per CLAUDE.md "Subagent-driven plan execution")**

After all 7 tasks land, dispatch a final review subagent across the full feature branch diff:

```bash
git log --oneline master..feat/iteration-a-extension-exports
git diff master..feat/iteration-a-extension-exports
```

The review covers cross-task issues (consistency between API + registry + consumer; type contracts holding end-to-end; ESLint rule actually catching the intended violations).

- [ ] **Merge to master with `--no-ff`**

```bash
git switch master
git merge --no-ff feat/iteration-a-extension-exports
```

Match the existing merge precedent (`Merge branch 'feat/extension-sitl-listener-fields'`).

If using a worktree, clean up:

```bash
git worktree remove .worktrees/feat-iteration-a-extension-exports
```

---

## Self-Review Notes

**Spec coverage**: every section of the spec maps to a task —

- API delta (extension-api) → Task 1
- Registry plumbing + tests → Task 2
- SITL exports + test → Task 3
- New vehicle-status package (full) → Task 4
- Bundle wiring + manifest test → Task 5
- ESLint refinement → Task 6
- CLAUDE.md + out-of-scope + roadmap propagation → Task 7
- Final verification (smoke tests, cross-cutting review, merge) → Final verification section

**Test count delta** matches the spec: 6 (registry) + 1 (sitl) + 3 (vehicle-status) + 1 (manifest) = **11 new tests**, taking the workspace from 139 → 150. (Spec said "~10"; we're at 11 because the manifest-order test is genuinely useful and was implicit in the spec's "Order matters" callout.)

**Type consistency**: `SitlExports`, `getSitlExports()`, `vehicleStatusExtension`, `host.getExtension<T>(id)`, `exportsByExtension` are all named consistently across tasks 1–7. The spec's `getExtension<T = unknown>(id): { id: string; exports: T } | undefined` shape is preserved in every reference.

**Subagent worktree discipline**: every `git commit` step includes `git branch --show-current` as a guard. Every `pnpm` command assumes the orchestrator's prompt prepended the worktree+package-root cd.

**Svelte MCP usage**: Task 4 Step 5 explicitly calls for the Svelte autofixer on the new `.svelte` file. Per CLAUDE.md it's mandatory.

**Followup commit prefix**: any review feedback during execution lands in separate `Code-review-followup:` commits per CLAUDE.md, not amended into task commits.
