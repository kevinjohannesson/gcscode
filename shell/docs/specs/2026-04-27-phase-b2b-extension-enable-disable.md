# Phase B2b — Extension enable/disable

**Status:** Approved (2026-04-27)

## Context

Phase B was originally framed as three iterations: (B1) deactivate orchestration, (B2) extension enable/disable + reactive plumbing, (B3) dev-time hot reload. B1 shipped (`docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md`); B2 was split into B2a (reactive plumbing, shipped — `docs/specs/2026-04-27-phase-b2a-reactive-plumbing.md`) and B2b (this spec). After B2a, registry mutations propagate to mounted UI via `SvelteMap`. The remaining work for B2 is the state machine itself: per-extension runtime `enabled` state plus a programmatic toggle that drives activate/deactivate.

The triggering need is plumbing — not a UI in this iteration. The arc on the table is: B2b → manifest → `Extension.deactivate?()` hook → first real consumer (a stub SITL listener that exposes `getLocation` and a lat/lng view, driving subsequent contribution kinds like a command palette). B2b is the foundation. Once an extension can be toggled at runtime, the marketplace pathway has somewhere to plug in, the manifest iteration has the state machine to lean on, and SITL — when it lands — already has the on/off control its eventual Settings UI will want.

The B1 and B2a specs both forecast B2b explicitly. B1 spec line 48: _"After deactivate, calling `registry.activate(extension)` again works without special handling — the registry is in a clean state with respect to that extension id; no `reactivate` API and no enable/disable flag."_ B2a spec line 13: _"B2b is purely additive: enable/disable becomes a thin layer of `enabled` state plus a toggle that calls `registry.deactivate` / `registry.activate`, with no registry-internals changes."_ This spec follows that forecast.

The structural choice that comes from it is a new layer above the registry: an `ExtensionManager` that owns the `enabled` state and the retained `Extension` references, and orchestrates `registry.activate` / `registry.deactivate` against them. The registry stays a pure contribution tracker; the manager is the lifecycle authority. Bootstrapping shifts from `registry.activate(extension)` calls in `main.ts` to `manager.register(extension)` calls; the manager reactivates from its retained record when re-enabled.

## Decisions deliberately out of this iteration

Four adjacent concepts could plausibly land here. They do not. Each is called out so the rest of the spec can be read against the agreed scope:

- **Persistence of disabled state across reloads.** B2b is plumbing only. There is no marketplace UI today and no manifest to anchor per-extension settings against. The persistence layer naturally lands with the manifest iteration, where the canonical store of "which extensions are installed and how are they configured" already exists.

- **`unregister(id)` / uninstall.** B2b retains the extension's record after disable so re-enable can re-feed it. Removing an extension from the manager entirely is a different operation — it is the marketplace's "uninstall" verb. Same justification as persistence: lives with the manifest iteration where install/uninstall belongs.

- **Initial-disabled flag on `register(extension)`.** Calling `manager.register(extension)` always produces `enabled: true`. The use case for `register(extension, { enabled: false })` is "the manifest declares this extension installed-but-disabled at boot," which has no consumer until the manifest lands.

- **Toggle UI in the shell.** No "Extension Manager" view, no `enable`/`disable` keybinding or command. A future surface — palette entry, settings page, marketplace UI — will consume `manager.setEnabled(...)`. Not this iteration.

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. B2b preserves the load-bearing patterns:

| VS Code feature                                                          | B2b in GCScode                                                                                                                | Status                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layered service: extension service distinct from contribution registries | ✓ — `ExtensionManager` (lifecycle / `enabled` state) is a distinct layer above the existing `Registry` (contribution tracker) | Aligned in spirit. VS Code's `IExtensionService` and contribution registries are separate; we draw the same boundary. The manager retains `Extension` references so re-enable can re-feed `registry.activate`; the registry stays "clean per id" as B1 forecast.                                                                 |
| Enable/disable is host-controlled, not extension-callable                | ✓ — `setEnabled` lives on the shell-internal `ExtensionManager`, not on the `ExtensionHost` API                               | Aligned. Extensions cannot toggle themselves or each other. The contract surface in `@gcscode/extension-api` is unchanged. Future marketplace UI / settings UI will consume `manager.setEnabled(...)` from inside the shell.                                                                                                     |
| `vscode.extensions.all` / `getExtension(id)` for state inspection        | ➤ Ours — `manager.listExtensions()` only                                                                                      | Aligned in spirit. Single read method returning a snapshot of `{ id, displayName, version, enabled }` per registered extension. `getExtension(id)` and `isEnabled(id)` are deferred until a caller needs them; tests `find` against `listExtensions()`.                                                                          |
| Reactive observability of extension state                                | ➤ Ours — `listExtensions()` reads through a `SvelteMap`, so `$derived(manager.listExtensions())` re-tracks on `setEnabled`    | In spirit, not by byte. VS Code threads lifecycle through `onDidChange*` events; we thread it through Svelte's reactivity primitive (B2a precedent). Same observable behavior — UI tracks state — divergent implementation. No public `host.onDidChangeEnabled` event in B2b.                                                    |
| Persisted enablement (`workspace` + `global` scopes)                     | ✗ Deferred to manifest iteration                                                                                              | Plumbing only in B2b; persistence anchors on the manifest.                                                                                                                                                                                                                                                                       |
| Lazy activation events (`onCommand:...`, `onView:...`)                   | ✗ Deferred (out-of-scope, per ADR-0003)                                                                                       | All extensions activate eagerly at boot. Re-enable also activates synchronously.                                                                                                                                                                                                                                                 |
| Renamed activation primitives (`register` / `setEnabled` / `unregister`) | ➤ Ours — `Registry.activate` / `Registry.deactivate` keep their names; `ExtensionManager` adds new verbs at the layer above   | Deliberate divergence. Renaming `Registry.activate` → `register` was considered; it would churn the recently-shipped B1 / B2a surface for cosmetic gain. The layered design (manager = lifecycle, registry = contributions) makes a rename unnecessary. Revisit at Phase C namespacing only if a real reader complaint surfaces. |

## Goals

- A new `ExtensionManager` module (`packages/shell/src/extension-host/extension-manager.ts`) owning the per-extension `enabled` state and the retained `Extension` references, with three public methods: `register(extension)`, `setEnabled(id, enabled)`, `listExtensions()`.
- `packages/shell/src/main.ts` constructs a manager (passing it the registry) and calls `manager.register(exampleExtension)` in place of the existing `registry.activate(exampleExtension)`. The keybinding dispatcher and the `App` mount continue to receive the `registry` as before.
- The internal extension map is a `SvelteMap<string, ExtensionState>` (B2a precedent), so `listExtensions()` is reactive: a future `$derived(manager.listExtensions())` re-tracks on `setEnabled`. No UI consumer of `listExtensions()` exists in this iteration; the reactivity is wired correctly so the future toggle UI is a thin consumer.
- Co-located tests in `packages/shell/src/extension-host/extension-manager.test.ts` cover: register adds + activates; setEnabled false deactivates and clears contributions; setEnabled true on disabled re-activates with a fresh context; same-value setEnabled is a no-op; setEnabled on unknown id throws; register on duplicate id throws; listExtensions reflects current enabled state and is reactive to mutations.
- Existing tests (`registry.test.ts`, `app.test.ts`, the example extension's tests) continue to pass without modification. The registry surface and bit-for-bit behavior are unchanged.
- Doc propagation: update `docs/out-of-scope.md` to reflect that "extension enable/disable runtime state" has shipped (split out from the `Extension.deactivate?()` hook bullet's trailing parenthetical); flip the B2b checkbox in `docs/roadmap.md` and link this spec; refresh ADR-0003's Phase B retrospective bullet alongside the merge.

## Non-goals

- **Persistence of disabled state.** No reads or writes from `localStorage`, `IndexedDB`, or any settings store. Disabled extensions become enabled again on reload. Trigger to revisit: manifest iteration.
- **`unregister(id)` / uninstall.** Once an extension is registered, it stays registered for the manager's lifetime. Trigger to revisit: manifest iteration.
- **Initial-disabled flag on `register`.** `manager.register(extension)` always sets `enabled: true` and immediately activates. Trigger to revisit: manifest iteration (when the manifest can declare an extension as disabled-on-install).
- **Toggle UI.** No view, palette entry, command, or keybinding that calls `setEnabled`. Trigger to revisit: a real consumer (settings page, marketplace UI, or an in-shell debug surface).
- **`getExtension(id)` / `isEnabled(id)` convenience reads.** `listExtensions()` is the only read method. Tests and any future code can `find` against the array. Trigger to revisit: a caller for which the array scan is awkward (e.g. hot-path code reading state per keystroke).
- **Public reactivity surface for extensions (`host.onDidChange*`).** No event-bus shape on the `ExtensionHost`. Extensions cannot subscribe to other extensions' enabled state. Same posture as B2a. Trigger to revisit: a real consumer.
- **Async `setEnabled`.** `setEnabled` is synchronous; `registry.activate` and `registry.deactivate` are synchronous. The deferred `Extension.deactivate?()` hook is what introduces async cleanup; that iteration will revisit `setEnabled`'s signature. Trigger to revisit: that iteration.
- **Registry surface changes.** `Registry` keeps its post-B2a interface unchanged. No new methods, no removed methods, no signature changes. The registry's `activate(extension)` behavior on a previously-deactivated id is the same as B1 documented: clean-state re-activation works without special handling.
- **Changes to `@gcscode/extension-api`.** No new types, no new methods, no new fields on `ExtensionContext`. The cross-package contract is untouched.
- **Changes to `@gcscode/extension-example`.** The example extension demonstrates the contract surface, which is unchanged.

## Public API (`ExtensionManager`)

A new file `packages/shell/src/extension-host/extension-manager.ts` exports a `createExtensionManager(registry)` factory and an `ExtensionManager` interface. The factory mirrors the existing `createRegistry()` pattern (closure over private state, returned object with the public methods).

```ts
export interface ExtensionManager {
  register(extension: Extension): void;
  setEnabled(id: string, enabled: boolean): void;
  listExtensions(): readonly ExtensionRecord[];
}

export interface ExtensionRecord {
  id: string;
  displayName: string;
  version: string;
  enabled: boolean;
}
```

`Extension` is imported from `@gcscode/extension-api`. `ExtensionRecord` is the public projection; the internal record retains the `Extension` reference itself but does not expose it (UI consumers have no use for the activation function, and not exposing it keeps the surface minimal).

### `register(extension: Extension): void`

- If `extension.id` is already registered, throws `Error("Extension id \"${id}\" is already registered.")`. The throw is symmetric with the registry's existing duplicate-id throws on `register*` methods.
- Otherwise, stores an internal record `{ extension, enabled: true }` keyed by `extension.id`, then calls `registry.activate(extension)`. Order: store first, then activate. (Activate could throw — see Failure handling below — but the store-first order means the manager's invariant "every key in the map represents a known extension" holds even if activate fails.)

### `setEnabled(id: string, enabled: boolean): void`

- If `id` is not registered, throws `Error("Cannot set enabled state: extension id \"${id}\" is not registered.")`. Symmetric with `Registry.deactivate`'s "id is not active" throw.
- If the current `enabled` state already matches the requested state, returns without side effects. No registry call, no `SvelteMap.set` — same-value `setEnabled` is a true no-op so reactive consumers are not invalidated for non-changes.
- Otherwise:
  - On `enabled === false`: calls `registry.deactivate(id)`, then updates the internal record to `enabled: false` via `extensions.set(id, { ...record, enabled: false })`.
  - On `enabled === true`: calls `registry.activate(record.extension)` using the retained `Extension` reference, then updates the internal record to `enabled: true` via `extensions.set(id, { ...record, enabled: true })`.
- The `extensions.set(id, ...)` after the registry call is what propagates reactivity through the `SvelteMap`. Mutating `record.enabled` in place would not propagate (B2a's reactive contract: `SvelteMap` propagates on `set` / `delete`, not on value mutation).

### `listExtensions(): readonly ExtensionRecord[]`

Returns `Array.from(extensions.values()).map(toRecord)` where `toRecord({ extension, enabled })` projects to `{ id: extension.id, displayName: extension.displayName, version: extension.version, enabled }`. Same reactive pattern as `Registry.listViews()` post-B2a: iterating the `SvelteMap` registers a Svelte dependency, so `$derived(manager.listExtensions())` re-tracks on `set` / `delete`.

The returned array is `readonly`. Records are fresh objects per call; consumers do not get a shared mutable reference into the manager's internal state.

## Failure handling

- **Activate throws on enable** (`setEnabled(id, true)` where the extension's `activate(context)` throws): the error propagates to the caller. The internal `enabled` flag is **not** flipped to `true` — the `extensions.set(id, { ..., enabled: true })` line runs only after `registry.activate` returns. The registry's partial-subscription state after a thrown activate is a pre-existing concern (the registry records the partially-populated `subscriptions` array unconditionally in `subscriptionsByExtension.set(...)`); B2b does not change that behavior. From the manager's perspective, the extension stays disabled and a subsequent `setEnabled(id, true)` will retry from scratch.
- **Activate throws on initial register** (`register(extension)` where `activate` throws): the error propagates. The internal record was already stored as `enabled: true` before the activate call (per the order above), so the manager's view is "this extension is registered and enabled, even though its activation failed." A subsequent `setEnabled(id, false)` followed by `setEnabled(id, true)` would be a recovery path. We do not roll back the store on activate failure in B2b: the registry's pre-existing partial-subscription state is the more pressing inconsistency, and addressing it touches the registry which is out of scope. Trigger to revisit: an activate failure showing up in practice and producing confusing manager state.
- **Deactivate throws** (`setEnabled(id, false)` where `registry.deactivate` throws): B1 already wraps each disposable's `dispose()` call in a try/catch with logging, so individual disposable failures do not propagate. The only path where `registry.deactivate` itself throws is the "id is not active" guard — which the manager prevents by tracking enabled state. So this branch is structurally unreachable in B2b's normal flow. We do not add defensive handling for it.

## Manager implementation sketch

```ts
import { SvelteMap } from 'svelte/reactivity';
import type { Extension } from '@gcscode/extension-api';

import type { Registry } from './registry';

interface ExtensionState {
  extension: Extension;
  enabled: boolean;
}

export interface ExtensionRecord {
  id: string;
  displayName: string;
  version: string;
  enabled: boolean;
}

export interface ExtensionManager {
  register(extension: Extension): void;
  setEnabled(id: string, enabled: boolean): void;
  listExtensions(): readonly ExtensionRecord[];
}

function toRecord(state: ExtensionState): ExtensionRecord {
  return {
    id: state.extension.id,
    displayName: state.extension.displayName,
    version: state.extension.version,
    enabled: state.enabled,
  };
}

// Invariant: extensions are registered exactly once and stay registered for
// the manager's lifetime. The manager retains Extension references so re-enable
// can re-feed Registry.activate (per the B1 forecast: "the registry is in a
// clean state with respect to that extension id; the caller re-passes the
// extension"). The internal map is a SvelteMap so listExtensions() is reactive
// to setEnabled mutations — same pattern as Registry.list*() post-B2a.
export function createExtensionManager(registry: Registry): ExtensionManager {
  const extensions = new SvelteMap<string, ExtensionState>();

  return {
    register(extension) {
      if (extensions.has(extension.id)) {
        throw new Error(`Extension id "${extension.id}" is already registered.`);
      }
      extensions.set(extension.id, { extension, enabled: true });
      registry.activate(extension);
    },
    setEnabled(id, enabled) {
      const state = extensions.get(id);
      if (state === undefined) {
        throw new Error(`Cannot set enabled state: extension id "${id}" is not registered.`);
      }
      if (state.enabled === enabled) {
        return;
      }
      if (enabled) {
        registry.activate(state.extension);
      } else {
        registry.deactivate(id);
      }
      extensions.set(id, { ...state, enabled });
    },
    listExtensions() {
      return Array.from(extensions.values()).map(toRecord);
    },
  };
}
```

The sketch is illustrative; the implementer is free to refactor mechanically (e.g. extract `toRecord` inline, choose comment placement) so long as the public contract and the reactivity behavior match.

## Bootstrap changes (`packages/shell/src/main.ts`)

Today (`main.ts:8-13`):

```ts
import { createRegistry } from './extension-host/registry';

const registry = createRegistry();
registry.activate(exampleExtension);

attachKeybindingDispatcher(registry, document);
```

After B2b:

```ts
import { createExtensionManager } from './extension-host/extension-manager';
import { createRegistry } from './extension-host/registry';

const registry = createRegistry();
const manager = createExtensionManager(registry);
manager.register(exampleExtension);

attachKeybindingDispatcher(registry, document);
```

The `App` mount and the keybinding dispatcher continue to receive the `registry`. The manager is shell-internal. No reference to the manager is passed into Svelte components in this iteration — the toggle UI does not exist yet. When it lands, it will receive the manager via the same prop-drilling pattern `App` uses for the registry today.

## Registry: unchanged

`packages/shell/src/extension-host/registry.ts` is not modified. The post-B2a `Registry` interface, the internal `SvelteMap` instances, the `register*` factories, the dispose-by-equality guards, the `list*` methods, `executeCommand`, `activate`, and `deactivate` all stay as-is. Re-activation of a previously-deactivated extension via `registry.activate(extension)` works without special handling — this is the B1-documented behavior.

## Reactivity contract for consumers

`listExtensions()` is reactive. A future Svelte component can do:

```svelte
const extensions = $derived(manager.listExtensions());
{#each extensions as ext (ext.id)}
  <li class:disabled={!ext.enabled}>{ext.displayName}</li>
{/each}
```

The `$derived` runs `Array.from(svelteMap.values()).map(...)`, which iterates the reactive map and registers a dependency. When `setEnabled` calls `extensions.set(id, ...)`, Svelte invalidates the `$derived` and the `{#each}` re-renders. Effects flush asynchronously by default; tests that assert after `setEnabled` must drain effects (`flushSync`, `await tick()`, or testing-library polling) — same pattern as the B2a tests.

No consumer of `listExtensions()` exists in this iteration. The reactive plumbing is wired so the future toggle UI (and any present-day test that asserts on it) gets the right behavior.

## Testing

A new co-located test file `packages/shell/src/extension-host/extension-manager.test.ts` covers the manager's contract. It imports `createRegistry` and `createExtensionManager` directly (the manager is not exported via a barrel; imports are by path, matching `registry.test.ts`'s pattern).

Tests:

- **`register adds the extension and activates it`.** Construct registry + manager. Register a fixture extension whose `activate` registers a view. Assert `registry.listViews()` contains that view. Assert `manager.listExtensions()` returns one record with `enabled: true` and the correct id / displayName / version.
- **`register on a duplicate id throws`.** Register an extension. Attempt to register a second extension with the same id. Assert it throws with the expected message. Assert `manager.listExtensions()` length is still 1 and the original extension's contributions are untouched.
- **`setEnabled(id, false) deactivates and clears contributions`.** Register a fixture extension that registers a view and a status bar item. Call `setEnabled(id, false)`. Assert `registry.listViews()` and `registry.listStatusBarItems()` are empty. Assert `manager.listExtensions()` returns one record with `enabled: false`.
- **`setEnabled(id, true) on a disabled extension re-activates with a fresh context`.** Register a fixture, disable it, re-enable it. Assert contributions are back. Assert the extension's `activate` was called twice (test fixture tracks call count). Assert the second call received a fresh `context.subscriptions` array (the array passed in is empty at the start of each activate — same registry behavior B1 documented).
- **`same-value setEnabled is a true no-op`.** Register an extension. Call `setEnabled(id, true)` again. Assert `activate` was called exactly once total (not twice). Call `setEnabled(id, false)`, then `setEnabled(id, false)` again. Assert `deactivate` was called exactly once total.
- **`setEnabled on unknown id throws`.** Construct manager with no registrations. Call `setEnabled('does-not-exist', false)`. Assert it throws with the expected message. Same for `setEnabled('does-not-exist', true)`.
- **`listExtensions returns a snapshot reflecting current state`.** Direct-read flow: register two extensions A and B; assert `listExtensions()` returns two records with the right ids, displayName, version, and `enabled: true`. Call `setEnabled('A', false)`; assert the snapshot now reads A as `enabled: false` and B unchanged. Call `setEnabled('A', true)`; assert it flipped back. The reactive plumbing under `listExtensions` (`SvelteMap`) is structurally inherited from B2a; this test asserts the snapshot semantics, not Svelte's reactivity primitive itself. The "reactivity propagates to a `$derived` consumer" assertion is deferred until a component actually consumes `listExtensions()` — same posture B2a took (test the consumer, not the framework).

Tests build on the same fixture pattern `registry.test.ts` already uses — ad-hoc extension objects constructed inline with deterministic ids and `activate` functions that register a single contribution. No shared test utility module is introduced; if the fixture pattern grows organic enough across multiple test files, that's a separate refactor.

`packages/shell/src/extension-host/registry.test.ts` is unchanged. `packages/shell/src/app.test.ts` is unchanged — `App` does not consume the manager in this iteration. `packages/shell/src/keybinding-dispatcher.test.ts` is unchanged.

## Files modified / added

| Path                                                          | Change                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shell/src/extension-host/extension-manager.ts`      | **New.** Exports `createExtensionManager(registry)`, `ExtensionManager`, `ExtensionRecord`. Internal `ExtensionState` not exported.                                                                                                                                                                               |
| `packages/shell/src/extension-host/extension-manager.test.ts` | **New.** Co-located tests covering the contract above.                                                                                                                                                                                                                                                            |
| `packages/shell/src/main.ts`                                  | Replace `registry.activate(exampleExtension)` with `manager.register(exampleExtension)`; add `import { createExtensionManager } from './extension-host/extension-manager'`; construct `manager = createExtensionManager(registry)`. The `App` mount and the keybinding dispatcher continue to receive `registry`. |
| `docs/out-of-scope.md`                                        | Update the trailing parenthetical of the `Extension.deactivate?()` hook bullet to drop the "extension enable/disable runtime state" mention. Detail in propagation section below.                                                                                                                                 |
| `docs/roadmap.md`                                             | Flip the B2b checkbox; link this spec. Detail in propagation section below.                                                                                                                                                                                                                                       |

No changes to:

- `@gcscode/extension-api` — the public extension contract.
- `@gcscode/extension-example` — the worked-example extension.
- `packages/shell/src/extension-host/registry.ts` or `registry.test.ts` — the registry surface and tests.
- `packages/shell/src/app.svelte` or `app.test.ts` — `App` does not consume the manager yet.
- `packages/shell/src/keybinding-dispatcher.ts` or its test — keybinding dispatch is unaffected.
- `packages/extension-api/README.md` or `packages/extension-example/README.md` — extension-author docs.
- Any ADR. ADR-0003's Phase B framing remains accurate (B2 splits into B2a + B2b is a tempo decision, not an architectural one). To be reflected in the ADR-0003 retrospective when this iteration merges, mirroring the A1/A2/A3/B1/B2a retrospective pattern.

## `docs/out-of-scope.md` propagation

The relevant existing bullet ("**`Extension.deactivate?()` hook (non-disposable / async cleanup).**") ends with:

> Extension enable/disable runtime state and dev-time hot reload are still deferred (Phases B2 and B3 — separate iterations). (ADR-0003)

After B2b ships, edit the trailing sentence to drop the enable/disable mention:

> Dev-time hot reload is still deferred (Phase B3 — separate iteration). (ADR-0003)

The bullet's primary subject — the deactivate hook itself — is unchanged. No new bullet to add (B2b is shipping enable/disable, not deferring it). The "Declarative contributes manifest" bullet, the "Activation events / lazy activation" bullet, the "Capability / permission declarations" bullet, the "Hot module reload for extensions" bullet, the `registry.deactivateAll()` bullet, and the rest of the list stay as-is.

The new non-goals introduced by this spec (no persistence, no `unregister`, no initial-disabled flag, no toggle UI, no `getExtension(id)` / `isEnabled(id)`, no public reactivity surface for extensions, no async `setEnabled`) are per-iteration scope cuts internal to the manager. Per CLAUDE.md ("does this non-goal apply only to this iteration, or is it a deliberate 'we're deferring this concept' decision affecting the whole architecture?"), they stay in this spec only.

## `docs/roadmap.md` propagation

The current B2b entry under Phase B reads:

```markdown
- [ ] **B2b: Extension enable/disable** — runtime `enabled` state per extension + a toggle that drives activate/deactivate. Trigger: a "disable extension" UI or visible per-extension state change need.
```

Replace with:

```markdown
- [x] **B2b: Extension enable/disable** — `ExtensionManager` layer above the registry; `manager.register` / `setEnabled` / `listExtensions`. Spec: [`specs/2026-04-27-phase-b2b-extension-enable-disable.md`](specs/2026-04-27-phase-b2b-extension-enable-disable.md)
```

The B3 entry, the `Extension.deactivate?()` hook entry, and the Feature extensions section stay unchanged.

## Verification

- `pnpm check` clean across packages.
- `pnpm test` — every existing test passes; the new tests in `extension-manager.test.ts` pass.
- `pnpm lint` clean.
- `pnpm dev` — open the app; the example extension's view, status bar items, and keybinding render and behave identically to pre-B2b. (B2b has no user-visible surface change; the dev-server check is a regression guard against accidental coupling between the new bootstrap path and the existing behavior.)

## Follow-ups (out of scope for B2b)

- **Manifest iteration.** Declarative list of installed extensions, replacing static imports in `main.ts`. Owner of: persistence of disabled state (per-extension settings keyed by id), `unregister(id)` / uninstall, initial-disabled flag on `register`. Trigger: the user's stated marketplace pathway needs a manifest as the canonical store.
- **`Extension.deactivate?()` hook.** Adds the optional extension-side hook for non-disposable / async teardown. Trigger: first extension that holds a connection, worker, or other non-disposable resource (named on-deck consumer: SITL listener). When this lands, `setEnabled`'s signature gets revisited (sync vs async).
- **Toggle UI.** A view, palette entry, or settings page that calls `manager.setEnabled(...)`. Trigger: a real consumer pulling on it. The reactive `listExtensions()` is already in place for the consumer to be a thin layer.
- **`getExtension(id)` / `isEnabled(id)` convenience reads.** Adds direct lookups by id. Trigger: a caller for which the array scan in `listExtensions()` is awkward.
- **Public reactivity surface for extensions (`host.onDidChange*`).** Adds an event-bus shape on the `ExtensionHost` so extensions can subscribe to other extensions' lifecycle. Same posture as B2a deferred this. Trigger: a real consumer.
- **Async `setEnabled` / async activate.** Trigger: the deferred deactivate hook iteration, which forces the async question for the symmetry.
- **Phase B3 — dev-time hot module reload.** Independent of B2b. Builds on B1 + B2a + (optionally) B2b's manager pattern.

## Cross-cutting notes

**`registerN` duplication still remains.** A3's cross-cutting note flagged the four `register*` blocks in `registry.ts` as a candidate for a `makeRegistrar<T>` factory. B1, B2a, and B2b do not touch them. The duplication question is unchanged and remains a candidate for a separate refactor independent of any phase iteration.

**B2b is the smallest piece of the marketplace pathway.** It ships a new ~50-line module plus tests plus a one-line bootstrap edit. Zero changes to `@gcscode/extension-api`. Zero changes to any extension module. No new contribution kinds. By the time the manifest iteration begins, the only work left for "extension enable/disable" is the persistence layer — the state machine and reactive observability are already done and tested.

**Layered design pays the rename forward.** The choice to add a manager above the registry rather than rename `Registry.activate` → `register` was deliberate, and the alignment table records it. A future contributor reading the codebase sees two layers with one clear job each (registry tracks contributions; manager tracks extensions). If the surface ever feels crowded enough to want a rename, that decision can be made then with the benefit of more shipped consumers — and it would be an internal naming change at the manager / registry boundary, not a churn on the cross-package `@gcscode/extension-api` contract.

**The arc this spec sits in.** The arc on the table is B2b → manifest → `Extension.deactivate?()` hook → SITL stub. SITL is named in the roadmap as the on-deck consumer for the deactivate hook; the manifest iteration sits between because the marketplace pathway needs it before SITL's eventual settings-page-level toggle can be persisted. B2b is the foundation that lets each subsequent iteration be additive: manifest adds persistence + initial state on top of the manager; the deactivate hook revisits `setEnabled`'s signature; SITL consumes the existing surface.
