# Phase B1 — Deactivate orchestration

**Status:** Approved (2026-04-26)

## Context

ADR-0003 frames Phase B as three features bundled under "lifecycle and cleanup": (1) `deactivate` orchestration, (2) plugin enable/disable state, and (3) dev-time hot reload. Each has a different cost and trigger. This iteration ships only the first.

The disposable plumbing is already in place across A1–A3. Every `register*` method on `PluginHost` returns an idempotent, re-registration-safe `Disposable` (`registry.ts:53, 70, 87, 104`). `activate()` already records `context.subscriptions` in a per-plugin `subscriptionsByPlugin: Map<string, readonly Disposable[]>` (`registry.ts:31, 130`). What is missing is the orchestration: a host-side method that iterates a plugin's recorded subscriptions and calls `dispose()` on each.

B1 is structurally one new method (`registry.deactivate(pluginId)`) plus its tests. No new types, no new packages, no changes to `@gcscode/plugin-api`, no changes to `Plugin`, `PluginContext`, or `PluginHost`. The plugin-facing contract is unchanged.

The trigger pulling B1 in now is two-fold: (a) it makes the disposable contract end-to-end testable from a host caller (today, `dispose()` is exercisable only via direct disposable invocation, not via a host-driven teardown path), and (b) it is the foundation B2 (enable/disable) and B3 (hot reload) will build on, so doing it as its own iteration keeps both downstream specs additive.

## Decisions deliberately out of this iteration

Two adjacent concepts could plausibly land here. They do not. Each is called out here so the rest of the spec can be read against the agreed scope:

- **`Plugin.deactivate?()` hook.** ADR-0003's Phase B follow-up bullet pairs the hook with the orchestration. We split them: B1 is orchestration only; the hook is deferred. No first-party plugin needs non-disposable teardown today; disposables cover the existing four contribution kinds end-to-end. The hook adds an upfront sync-vs-async decision (the hardest decision to reverse), error-handling-from-hook semantics, and a "what host calls are legal during the hook?" question — all YAGNI without a consumer. The named on-deck consumer that would trigger revisit is a future SITL listener plugin (a streaming-data feed that holds a connection and may want async flush-on-close).

- **Reactive propagation of registry mutations to mounted UI.** The existing registry-level invariant (`registry.ts:22-25`) is that registration is not reactive: consumers read via `$derived(registry.listViews())`, which snapshots at mount. Deactivate inherits this. Calling `registry.deactivate(id)` post-mount mutates the maps correctly, but the rendered UI does not update. B1 is therefore honest only for **pre-mount** and **test** callers. The reactive plumbing is a separate, deferred concern — orthogonal to deactivate and properly addressed alongside B2 (enable/disable, where the UI consequence becomes user-visible) or as its own iteration.

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. B1 preserves the load-bearing patterns:

| VS Code feature                                        | B1 in GCScode                                                                                   | Status                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle is host-driven, not plugin-callable          | ✓ — `deactivate(id)` lives on the registry; plugins cannot deactivate themselves or others      | Aligned. Mirrors VS Code's "extensions don't drive their own lifecycle"; plugin-facing API gains nothing.                                                                                                                                                                                                                                                                                                                               |
| Per-dispose try/catch + log + continue                 | ✓ — a throwing `dispose()` is logged via `console.error`; remaining disposables still run       | Aligned. Matches VS Code's `dispose()` helper behavior — errors are forwarded to a log sink, iteration continues.                                                                                                                                                                                                                                                                                                                       |
| JS module stays loaded across deactivate               | ✓ — re-activating a deactivated plugin re-runs `activate(context)` on the same in-memory module | Aligned. VS Code keeps the extension module loaded on disable; activation runs again on re-enable.                                                                                                                                                                                                                                                                                                                                      |
| LIFO disposal order                                    | ➤ Ours — disposables fire in reverse registration order                                         | In spirit, not by byte. VS Code is inconsistent here: `DisposableStore.dispose()` is forward-order; some helpers vary. We adopt LIFO as a deliberate convention because it gives implicit dependency ordering for free if a plugin registers a higher-level disposable that depends on lower-level ones earlier in `subscriptions`. The convention is documented; future contributors should not assume it is a strict VS Code mandate. |
| Throw on lookup of unknown id                          | ➤ Ours — `deactivate(id)` throws when the id is not active                                      | In spirit. No public-API analog exists in VS Code (no public `deactivate`), but the philosophy match is "registration loud, lookup quiet" — and our parallel registration call already throws on duplicate id (ADR-0003). This stays loud during dev.                                                                                                                                                                                   |
| `Plugin.deactivate?()` hook (`void \| Thenable<void>`) | ✗ Deferred                                                                                      | Trigger to revisit: the first plugin that needs non-disposable cleanup. Named on-deck consumer: a future SITL listener plugin.                                                                                                                                                                                                                                                                                                          |
| Plugin enable/disable runtime state                    | ✗ Deferred (Phase B2)                                                                           | Separate spec when a real consumer needs it.                                                                                                                                                                                                                                                                                                                                                                                            |
| Dev-time hot reload                                    | ✗ Deferred (Phase B3)                                                                           | Separate spec when plugin-author iteration friction becomes real.                                                                                                                                                                                                                                                                                                                                                                       |
| Deactivation events (`onDidChange`, `onDidDeactivate`) | ✗ Deferred                                                                                      | No consumer; revisit when a plugin or shell surface wants to react to another plugin being deactivated.                                                                                                                                                                                                                                                                                                                                 |
| `registry.deactivateAll()` / bulk teardown             | ✗ Deferred                                                                                      | YAGNI; a caller that wants bulk can iterate. Revisit if a future consumer needs ordered bulk teardown (e.g. a host-driven shutdown path).                                                                                                                                                                                                                                                                                               |

## Goals

- A new method `deactivate(pluginId: string): void` on the `Registry` interface in `packages/shell/src/plugin-host/registry.ts`.
- The method iterates the plugin's recorded subscriptions in **reverse registration order (LIFO)**, calling `dispose()` on each. Per-disposable errors are caught and logged via `console.error`; iteration continues.
- After all disposables run, the plugin's entry is removed from `subscriptionsByPlugin`. Each disposable already removes its own entry from the kind-specific map (`views`, `statusBarItems`, `commands`, `keybindings`), so all `list*` methods naturally return empty for the deactivated plugin's contributions.
- Calling `deactivate` on an unknown / not-active id throws with `Cannot deactivate plugin: id "<id>" is not active.`
- After deactivate, calling `registry.activate(plugin)` again works without special handling — the registry is in a clean state with respect to that plugin id; no `reactivate` API and no enable/disable flag.
- Tests cover the new method end-to-end: happy path, LIFO order, error resilience, unknown id, re-activation after deactivation, and multi-plugin isolation.
- The existing invariant comment at `registry.ts:22-25` is extended to mention deactivate (mutations are still non-reactive after teardown, same constraint).

## Non-goals

- **`Plugin.deactivate?()` hook on the plugin module.** Deferred (see Context and the VS Code alignment table). When this lands later, it is purely additive — `deactivate?` is optional; existing plugins keep working unchanged.
- **`registry.deactivateAll()`.** A bulk teardown method. YAGNI for B1; tests with multiple plugins iterate their own ids. Add when a real consumer needs ordered bulk teardown.
- **Plugin enable/disable state and a runtime UI.** Phase B2.
- **Dev-server hot module reload of plugins.** Phase B3.
- **Reactive UI propagation when registry maps change.** Existing constraint — registration (and now deactivation) is not reactive after mount. Orthogonal concern; explicitly stays out of scope here so B1 is honest only for pre-mount / test callers.
- **Deactivation events (`onDidDeactivate`, `onDidChange`).** No consumer.
- **A `registry.list()` / `listActivePlugins()` introspection method.** Not needed without `deactivateAll()`. Internal `subscriptionsByPlugin.keys()` is sufficient.
- **Idempotency on the `deactivate` call itself.** Calling `deactivate(id)` twice in a row throws on the second call (the id is no longer active). The individual `dispose()` calls are idempotent per ADR-0003; the orchestration entry-point is not. Loud over silent.
- **Defensive checks on the per-plugin `host` instance after deactivation.** Edge case (a plugin holding a reference to its host and calling `register*` post-deactivate from a leftover async closure). The current `register*` methods would still mutate the global maps; we do not add a `deactivated` flag on the host. Trigger to revisit: the first time this happens accidentally and produces a confusing bug.

## API surface (`Registry` interface)

The change is one new method on the host-side `Registry` interface; nothing in `@gcscode/plugin-api` changes.

```ts
export interface Registry {
  activate(plugin: Plugin): void;
  deactivate(pluginId: string): void; // new
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}
```

## Registry changes (`packages/shell/src/plugin-host/registry.ts`)

Single addition to the returned registry object, alongside the existing methods:

```ts
deactivate(pluginId) {
  const subscriptions = subscriptionsByPlugin.get(pluginId);
  if (subscriptions === undefined) {
    throw new Error(`Cannot deactivate plugin: id "${pluginId}" is not active.`);
  }
  // LIFO: dispose in reverse registration order. A plugin that registers a
  // higher-level disposable later may depend on lower-level ones registered
  // earlier; reverse order tears down the higher-level layer first.
  for (let i = subscriptions.length - 1; i >= 0; i--) {
    try {
      subscriptions[i].dispose();
    } catch (error) {
      console.error(
        `Error disposing subscription for plugin "${pluginId}":`,
        error,
      );
    }
  }
  subscriptionsByPlugin.delete(pluginId);
}
```

The existing `register*` disposables (`registry.ts:53, 70, 87, 104`) already remove their entries from the kind-specific maps and are already idempotent + safe under re-registration. No change to any `register*` method, no change to any `list*` method, no change to `executeCommand`, no change to `activate`. The existing per-Map identity-checked delete pattern continues to protect against the rare case where a plugin disposes a Disposable manually before deactivate runs.

The existing comment at `registry.ts:22-25` is extended to acknowledge that deactivate mutations are also non-reactive — same Map-mutation-without-reactivity constraint — so a future contributor reading the comment sees both shapes:

```ts
// Invariant: registry mutations (activate, deactivate, individual dispose
// calls) do not propagate reactively to mounted consumers. Consumers read
// via $derived(registry.listViews()), which snapshots at mount time. Post-
// mount mutation works at the registry level but the rendered UI will not
// update. Reactive propagation is out of scope (see docs/out-of-scope.md);
// pre-mount activation and test-only deactivation are the supported callers
// today.
```

## Plugin example

No changes. `@gcscode/plugin-example` does not call `deactivate`; the example demonstrates the plugin-facing contract, which is unchanged. The host-side B1 surface is exercised by registry tests, not by the example plugin.

## Testing

**`packages/shell/src/plugin-host/registry.test.ts`** — extend the existing suite with a new block for `deactivate`:

- **Happy path.** Activate a plugin that registers a view, a status bar item, a command, and a keybinding. After `deactivate(plugin.id)`, all four `list*` methods return arrays that do not include those contributions.
- **LIFO order.** Activate a plugin whose `activate()` pushes four custom `Disposable`s into `context.subscriptions` (each one records its index into a shared array on dispose). After `deactivate`, assert the recorded order is `[3, 2, 1, 0]`.
- **Error resilience.** Activate a plugin that pushes three custom `Disposable`s where the middle one's `dispose()` throws. After `deactivate`, assert: (a) all three `dispose()` calls were attempted, (b) `console.error` was called once with a message that includes the plugin id, (c) the surrounding test does not throw — `deactivate` returns normally. Use `vi.spyOn(console, 'error')` and restore.
- **Unknown id.** `registry.deactivate('nonexistent.plugin')` throws `Error` with message `Cannot deactivate plugin: id "nonexistent.plugin" is not active.`
- **Double-deactivate throws.** After `deactivate(plugin.id)` succeeds, a second `deactivate(plugin.id)` throws the same unknown-id error (the id is no longer active).
- **Re-activate after deactivate.** Activate plugin P, deactivate P, activate P again. Assert: `list*` methods include P's contributions (no duplicates, no leftover entries from the first activation), and `subscriptionsByPlugin` has exactly one entry for P. No duplicate-id errors during re-activation.
- **Multi-plugin isolation.** Activate plugins A and B (each registering one view with distinct ids). Deactivate A. Assert: A's view is gone from `listViews()`; B's view remains; `subscriptionsByPlugin` has exactly one entry (B's).

Existing tests continue to pass. No new test files; no changes to `keybinding-dispatcher.test.ts` or `plugin-example/src/index.test.ts`.

## Files modified / added

| Path                                              | Change                                                                                                                                                      |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shell/src/plugin-host/registry.ts`      | Add `deactivate(pluginId): void` to the `Registry` interface and to the returned object. Extend the invariant comment at lines 22–25 to cover deactivation. |
| `packages/shell/src/plugin-host/registry.test.ts` | Add the seven test cases above (happy path, LIFO, error resilience, unknown id, double-deactivate, re-activate, multi-plugin isolation).                    |
| `docs/out-of-scope.md`                            | Propagate B1 cross-cutting non-goals (see propagation section below).                                                                                       |

No changes to `@gcscode/plugin-api`, `@gcscode/plugin-example`, `packages/shell/src/main.ts`, the keybinding dispatcher, any READMEs, or any ADR. ADR-0003's Phase B follow-up bullet remains accurate (the orchestration-half of "Phase B" lands; the hook half is explicitly split out and deferred — to be reflected in the ADR-0003 retrospective when this iteration merges, mirroring the A1/A2/A3 retrospective pattern).

## `docs/out-of-scope.md` propagation

Cross-cutting non-goals from this spec — concepts the architecture is deliberately deferring, not just per-iteration scope cuts — must land in the canonical deferral list when B1 ships:

- **Rewrite the existing `deactivate` orchestration bullet.** Currently it reads "Disposables are in place ... but the host does not yet iterate `subscriptions` to tear plugins down. No `Plugin.deactivate`, no enable/disable, no reload." Split into two bullets:
  - **Disposable-iteration deactivate has shipped** — drop this part of the existing bullet, since it is no longer deferred.
  - **`Plugin.deactivate?()` hook (non-disposable / async cleanup)** — keep deferred, with the trigger updated to name a future SITL listener plugin as the on-deck consumer that would justify the async/sync decision. Today's first-party plugin (`@gcscode/plugin-example`) tears down purely through Disposables.
  - The existing "no enable/disable, no reload" framing stays — those are Phase B2 and B3.
- **Add a new bullet — `registry.deactivateAll()` / bulk teardown.** No bulk teardown method; callers iterate per-plugin if needed. _Trigger to revisit:_ a host-driven shutdown path or test harness that needs guaranteed reverse-activation order across plugins.
- **Add a new bullet — Reactive propagation of registry mutations to mounted UI.** Registration and deactivation are not reactive; consumers read via `$derived(registry.list*())` which snapshots at mount. Pre-mount and test-only callers are the supported shape today. _Trigger to revisit:_ Phase B2 (enable/disable) or any iteration where a registry mutation must produce a visible UI change without remount.

The "double-deactivate throws" and "no defensive `host`-after-deactivate flag" non-goals are per-iteration internal-API choices and stay in the spec only — not propagated.

## Verification

- `pnpm check` clean across packages.
- `pnpm test` — every existing test passes; the seven new tests in `registry.test.ts` pass.
- `pnpm lint` clean.
- `pnpm dev` — open the app; UI renders unchanged. (B1 has no user-visible surface; the dev-server check is a regression guard against accidental coupling.)

## Follow-ups (out of scope for B1)

- **Phase B2 — plugin enable/disable state.** Adds runtime `enabled: boolean` per plugin, programmatic `registry.enable(id)` / `registry.disable(id)`, and the reactive plumbing so the rendered UI reflects state changes. Builds directly on B1's `deactivate` orchestration. Trigger: a real consumer that wants to toggle a plugin off without rebuilding.
- **Phase B3 — dev-time hot module reload.** Vite HMR boundary that re-imports a plugin module on edit and replays activate (after deactivate). Builds on B1 + B2. Trigger: plugin-author iteration friction.
- **`Plugin.deactivate?()` hook.** Adds the optional plugin-side hook for non-disposable / async teardown. Trigger: first plugin that holds a connection, worker, or other non-disposable resource (named on-deck consumer: SITL listener).
- **`registry.deactivateAll()`.** Bulk teardown with documented ordering semantics. Trigger: a host-driven shutdown path or a test harness that wants a single-call teardown across N plugins.
- **Reactive registry consumers.** Replacing the snapshot-at-mount pattern with reactive `list*` reads so mid-session registration / deactivation propagates to the UI. Trigger: B2 or any iteration that needs visible state changes.

## Cross-cutting notes

**`registerN` duplication remains.** A3's cross-cutting note flagged the four `register*` blocks in `registry.ts` as a candidate for a `makeRegistrar<T>` factory once a fourth concrete instance landed. B1 does not touch any `register*` block — the deactivate orchestration is purely additive on top of `subscriptionsByPlugin`. The duplication question is unchanged by B1 and remains a candidate for a separate refactor (independent of any phase iteration).

**B1 is the smallest possible Phase B cut.** It ships the foundation B2 and B3 will build on, in ~30 lines of implementation plus tests, with zero changes to `@gcscode/plugin-api` and zero changes to any plugin module. The next iteration (B2 or another phase) can begin against this surface without rework.
