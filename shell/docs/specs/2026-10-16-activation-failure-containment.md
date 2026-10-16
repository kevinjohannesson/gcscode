# Host activation-failure containment

**Status:** Proposed (2026-10-16)

## Context

[ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) makes domain capabilities service extensions, which means most product value is reached through `host.extensions.getExtension(id)?.exports` and most future extensions are consumers of some other extension. That rule multiplies consumer→service edges, and gcscode currently has no containment for one of those edges failing. [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) prices the gap as a **prerequisite** rather than an ergonomic tax, and sequences this iteration ahead of the asset abstraction v0 iteration.

The failure path, traced and verified in the current tree:

- `packages/shell/src/extension-host/registry.ts` calls `extension.activate(context)` with no `try`/`catch`, and records `subscriptionsByExtension.set(identity.id, context.subscriptions)` only _after_ that call returns.
- `packages/shell/src/extension-host/extension-manager.ts` calls `registry.activate(extension)` from both `register()` (boot) and `setEnabled(id, true)` (runtime), neither wrapped.
- `packages/shell/src/main.ts` runs the whole `bundledExtensions` register loop at module top level — before `attachKeybindingDispatcher(registry, document)` and before `mount(App, …)`.
- Enablement is persisted: `packages/shell/src/extension-host/extension-persistence.ts` stores disabled ids in `localStorage` under `gcscode.extensions.disabled`, and `main.ts` feeds that into each `register` call.
- `packages/extension-flight-overlay/src/index.ts` throws by design when `gcscode.map` is not active, and that behaviour is tested (`src/index.test.ts`, "activate throws when gcscode.map is not active").

Put together: an operator disables Map, reloads, flight-overlay throws, and the throw escapes `main.ts` before `mount`. The result is a blank page with no palette and no extensions panel to re-enable Map from — recovery means devtools and `localStorage`. On a GCS that is a black screen in the field.

Two further defects fall out of the same gap:

1. **Partial registrations leak.** An extension that registers three contributions and then throws has those three live in the host's registries, with `subscriptionsByExtension` never written — so `deactivate(id)` rejects with `"is not active"` and nothing can dispose them. They persist for the session.
2. **Re-enable fails silently.** `extensions-panel.svelte` invokes `void manager.setEnabled(record.manifest.id, !record.enabled)` as a floating promise, so clicking **Enable** on an extension that throws produces an unhandled rejection, no UI change, and no explanation.

This iteration contains the failure, cleans up after it, and makes it visible.

## Why not the bigger version

- **Process or iframe isolation for extensions.** The real fix for "an extension can take the host down" is isolation, which [ADR-0005](../decisions/ADR-0005-extension-boundaries.md) already routes to the webview wing and `docs/out-of-scope.md` defers under "Third-party sandboxing". Isolation is a large iteration with an IPC protocol attached; containment is ~a day and removes the boot-halt class today. Doing containment first is not a substitute for isolation, and this spec does not claim it is.
- **Activation events / lazy activation.** Making extensions activate on demand would shrink the boot-time blast radius, but it is deferred in `docs/out-of-scope.md` with its own trigger (cold-start cost at ~50+ extensions) and would not help a failure that happens whenever activation does occur.
- **Declared extension dependencies.** A topological sort would prevent the specific flight-overlay-before-map ordering failure. It stays deferred — `docs/out-of-scope.md`'s trigger, sharpened by [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md), is the first service→service edge that must resolve during `activate()`, which v0 does not create. Containment is the general answer; ordering declarations are the specific one, and the general answer is what keeps a bad bundle order from being fatal.
- **A general host notification primitive** (`host.window.showMessage`-style). [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) names the absence of any operator-facing message surface as a real gap. This iteration ships the narrow version — one host-owned indicator for one condition — rather than designing a notification API now. The reason is scope, not scarcity of consumers: an earlier draft wrongly justified the deferral by claiming a single consumer, when three are already known. `docs/out-of-scope.md` carries "Visible boot-time signal for schema-validation rejection" as a documented second, and [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s degrade path is a third. Three consumers make the primitive more clearly worth building, which sharpens the trigger rather than weakening the deferral.

## Goals

1. **A throwing `activate()` cannot prevent `mount`.** Boot completes with the remaining extensions active, the keybinding dispatcher attached, and the app rendered — verified against the real boot path — `bootstrap`, which registers the workbench built-in in the same pass as the bundled extensions — rather than against a test harness that builds its own registry.
2. **Contributions the host minted for the failing extension are disposed, not leaked** — together with anything the extension itself pushed to `context.subscriptions` before throwing. Contributions it registered into _another extension's_ registry are out of reach, which Architecture states as a bounded limit rather than a gap. Cleanup reuses `deactivate`'s LIFO-with-per-disposable-`try`/`catch` semantics.
3. **The failure is recorded on the extension's record and visible without opening anything** — an extensions-panel row carrying the message, plus a host-owned status-bar indicator whenever any extension has failed.
4. **The operator can get out of a failing extension.** Disabling one from the panel works instead of rejecting with `"is not active"` into a floating promise, and no activation path produces an unhandled rejection.
5. **Persistence records operator intent, not activation outcome.** A boot-time failure writes nothing, so the extension stays enabled and every reload retries it; an operator who enables an extension that then fails has that intent recorded, so the retry actually happens on the next load rather than being silently dropped. A transient or ordering-related cause therefore clears on the next load with no operator action; a persistent cause fails again, visibly, which is the intended outcome rather than a silent absence.
6. **Existing `deactivate` behaviour is unchanged**, including its error resilience and the `"is not active"` guard.

## Non-goals (this iteration)

- Isolation, sandboxing, or any process/thread boundary for extensions.
- Activation events, lazy activation, or dependency declaration.
- A general notification or message API for extensions.
- Retry backoff, failure counters, or auto-disabling after N failures. Retry-every-boot is the whole policy.
- In-place retry from the UI, and the activate-idempotency contract it would require (see Architecture).
- Support for async `activate`. A thenable return is an activation error: the host revokes, disposes, and records it. Awaiting activation — which is what real support would require — is deferred.
- Operator-facing stack traces. The panel row shows the error's `message`; the full error goes to the console.
- Containment for `deactivate` failures, which are already caught and logged per extension.

## Architecture

### Cleanup belongs to a host-side ledger, not to `context.subscriptions` — and reaches only so far

The obvious cleanup — dispose `context.subscriptions` when `activate` throws — does not work, and three reviewers independently showed why. No extension in this repo pushes disposables incrementally. `extension-flight-overlay` registers six contributions inside a single `push(...)` argument list; the workbench built-in assigns four disposables to consts and pushes them together. Arguments are evaluated before the call, so a throw on the fourth registration leaves the earlier ones live and `context.subscriptions` still **empty**. Cleanup keyed on the extension's array would dispose nothing in the dominant case.

The host records what it hands out instead:

```ts
activate(extension) {
  const identity: ExtensionIdentity = { /* unchanged */ };
  const minted: Disposable[] = [];
  const { host, revoke, settle } = createHost(identity, minted); // revoke() closes the facade; settle() stops recording
  const context: ExtensionContext = {
    host, // every Disposable-returning host method appends to `minted` until settled or revoked
    subscriptions: [],
    extension: identity,
  };
  let exportsValue: unknown;
  try {
    exportsValue = extension.activate(context);
  } catch (cause) {
    revoke(); // close the host facade before cleanup
    disposeAll(minted, identity.id); // host-minted, LIFO, per-disposable try/catch
    disposeAll(context.subscriptions, identity.id); // whatever the extension did push
    throw new ExtensionActivationError(identity.id, cause);
  }
  if (isThenable(exportsValue)) {
    void exportsValue.then(undefined, (reason: unknown) =>
      console.error(`Extension "${identity.id}" activate() rejected after returning:`, reason),
    ); // observe it; not awaiting is what orphans the rejection
    revoke(); // any registration from the resumed continuation now throws
    disposeAll(minted, identity.id);
    disposeAll(context.subscriptions, identity.id);
    throw new ExtensionActivationError(identity.id, new Error('activate must be synchronous'));
  }
  subscriptionsByExtension.set(identity.id, context.subscriptions);
  // … unchanged
}
```

**Every `Disposable`-returning host method appends, not just `register*`.** There are six: `commands.registerCommand`, `window.registerView`, `window.registerStatusBarItem`, `keybindings.registerKeybinding`, `configuration.registerConfiguration`, and `configuration.onDidChangeConfiguration` — the last of which is not a `register*` and is exactly the one an earlier draft of this rule would have missed. Its only in-tree caller is `extension-sitl`, whose surviving listener would otherwise keep a live reconnect path that re-opens a WebSocket on the next configuration change.

**The ledger covers host-minted disposables and nothing else, which is a sharper limit than it first sounds.** `extension-flight-overlay` takes five of its six disposables from `extension-map` (`map.registerLayer(...)`, `map.registerControl(...)`, minted by `MapApiImpl`), and only one from the host. Containment would dispose that one. Those five live in another _extension's_ registry, which the host cannot see or reach — and [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) just made service extensions the rule, so this is the normal case rather than an edge. An earlier draft of this spec described them as living in "the host's registries", which was simply wrong.

So: host-side containment bounds the damage a failing extension does to **host** surfaces, and leaves contributions it made into other extensions' registries in place. Cleaning those up needs something this iteration does not build — either a teardown contract on service APIs or a host-mediated registration path — and is recorded as a deferral with a trigger rather than hidden behind the word "cleanup".

Five properties of what the ledger does guarantee:

- **It is correct regardless of what the extension does with its disposables** — batching, late pushing, and never pushing are all covered, because it records the host's side of the exchange. The claim holds for the registration _path_ only, and only because revocation closes the facade on failure; it says nothing about what the extension did with state that never passed through the host.
- **`context.subscriptions` is disposed too, and for the opposite reason.** The ledger exists because extensions mostly _do not_ push before throwing; but an extension that pushed something of its own — a timer, a closure — leaves it in an array the registry never records on the failure path, orphaned. Failure cleanup therefore disposes both arrays. `context.subscriptions` remains `deactivate`'s source of truth on the success path.
- **Recording stops once activation succeeds**, so the ledger cannot grow across the extension's lifetime as the extension registers more contributions later. _Corrected during implementation (PR #34, task 2's code-quality review):_ this property originally read "the registry drops its reference to the ledger", which does not achieve it — the closure that records disposables holds its own reference, so dropping the registry's leaves recording running. The mechanism is a tracking flag the host sets on success, not a reference drop.
- **A disposable may appear in both, and double disposal is safe** — `Disposable.dispose()` is required to be idempotent (`packages/extension-api/src/index.ts`).
- **`disposeAll` is extracted from the existing `deactivate` loop**, so both paths share one implementation and one error-resilience guarantee.

After a failed activation the registry holds nothing for that extension: no subscriptions entry, no deactivate hook, no exports. `deactivate(id)` therefore rejects with `"is not active"`, which the manager accounts for below.

**Non-`Disposable` side effects are not undone, and the failure path deliberately does not call `deactivate?()`.** `extension-flight-overlay` calls `flightOverlayState.setHost(context.host)` during activation and `extension-sitl` assigns a module-level `client`; neither is a disposable, so neither is in the ledger. The pattern is the norm rather than the exception: five of the repo's six extension packages set module-level state during activation, with only `extension-example` clean. `packages/extension-api/README.md` designates `deactivate?()` for exactly this class of cleanup, but a deactivate hook is written assuming its `activate` completed, so calling it after a partial activation would run teardown against invariants that may never have held. This spec therefore states the gap rather than papering over it: module state set during a failed activation survives, and an extension whose activation sets module state must tolerate re-entry on the next boot. A `deactivate`-tolerates-failed-activation contract is named in Future iterations alongside activate-idempotency, since they are one change to `@gcscode/extension-api` and one audit.

### The manager records failure; the operator's exit is Disable

`ExtensionRecord` gains one optional field:

```ts
export interface ExtensionRecord {
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
  /** Present iff the most recent activation attempt threw. */
  readonly failure?: { readonly message: string };
}
```

**Every path that calls `registry.activate` catches.** There are two, and an earlier draft contained the catch for one and left the other "unchanged" — which reinstated the defect Goal 4 exists to fix, reachable by clicking **Enable** on a disabled extension that throws:

- **`register`** (boot) catches `ExtensionActivationError`, stores `{ extension, enabled: true, failure }`, logs the full error, and returns normally so the boot loop continues. Persistence is untouched: the operator asked for nothing, so nothing is recorded.
- **`setEnabled(id, true)`** (operator enabling a disabled extension) catches the same way and **resolves** rather than rejecting, because the panel invokes it as a floating promise. It also **calls `onEnabledChanged(id, true)`**, which an earlier draft did not: the operator asked for this extension on, and if persistence keeps the id in its disabled set then the next reload will not retry it — making Goal 5 false on exactly the path an operator is most likely to take. Recording the intent is what keeps retry-every-boot honest.

So the persistence rule is about _intent_, not outcome: an operator toggle is recorded whether or not activation succeeded; a boot-time failure records nothing.

**`setEnabled(id, false)` on a record with a `failure` skips `registry.deactivate`,** which would otherwise reject with `"is not active"`. The skip is keyed on `failure` presence, and what makes that safe is an invariant worth stating because an earlier draft broke it: **no path writes the registry's maps without a completed synchronous activation.** Sync throws and thenable returns both leave the maps empty, so `failure !== undefined` implies not-active. If that invariant ever weakens, the honest fix is an explicit `registry.isActive(id)` predicate rather than a comment, because the `Registry` interface exposes no such check today. The manager clears `failure`, sets `enabled: false`, and calls `onEnabledChanged`.

`setEnabled` on records without a `failure` is unchanged, same-value early return included. `onEnabledChanged` is the persistence callback `main.ts` wires in (`persistence.recordEnabledChange`).

**There is no in-place retry.** Extensions are module singletons, and re-entering `activate()` on a live module is unsafe: `extension-sitl`'s module-level `client` is assigned by `openClient()` without closing an existing socket, so each re-activation would leak a WebSocket. Reload provides fresh module state; a button does not. The panel reports the failure and points at reload.

### An async `activate` is an activation error — which takes a revocation flag, not just a check

`Extension.activate(context): unknown` has no `Promise` in its contract. [ADR-0005](../decisions/ADR-0005-extension-boundaries.md) is weaker support than an earlier draft of this spec claimed: its Decision says activation "stays synchronous this iteration", a statement scoped to that iteration rather than a standing rule, and nothing has revisited it since. So the type signature is the real constraint, and this spec is the first to make synchrony load-bearing — which is itself worth flagging rather than borrowing authority from [ADR-0005](../decisions/ADR-0005-extension-boundaries.md).

Two earlier drafts got the mechanism wrong in opposite directions. The first recorded the rejection without tearing down, reasoning that consumers might hold the exports; that is false, because what an async `activate` publishes is a **`Promise` cast as the exports type**, which no consumer can use. The second treated a thenable return as an activation error and dropped the reference — which a reviewer disproved by running it: the body of an `async activate` has already run to its first `await`, so after the synchronous check it **resumes and registers into live registries**, reproducing the partial-registration leak through the mechanism meant to close it, and the dropped promise fires an unhandled rejection (failing `pnpm test` under vitest's defaults).

Detecting the thenable is therefore necessary but not sufficient. Three things happen together:

1. **Attach a handler** to the returned thenable so its rejection is observed and logged. Not awaiting it is the cause of the unhandled rejection, not the prevention of it.
2. **Revoke the host.** `createHost` closes over a per-activation flag; once revoked, every `Disposable`-returning method throws instead of registering. The resumed continuation therefore cannot add contributions the registry does not know about — it throws inside its own async body, where its rejection is caught by (1).
3. **Dispose the ledger and record the failure**, writing none of the registry's maps, exactly as for a synchronous throw.

Supporting async activation properly means awaiting it, which changes the registry's contract and the boot sequence; it is named in Future iterations and routed to `docs/out-of-scope.md`.

**Recording stops on success, and revocation is a failure-only mechanism.** Those are two different things and an earlier reviewer finding conflated them. On a successful activation the host stops recording into `minted`, so the array cannot grow for the extension's lifetime — but the host is **not** revoked, because an extension may legitimately register later (a command handler that adds a view, say). Revocation happens only on the failure paths, where any further registration is by definition untracked.

_Corrected during implementation (PR #34, task 2's code-quality review):_ this paragraph and validation case 12 originally said the registry **discards its reference** to `minted` on success. That does not achieve the property — the host's recording closure holds its own reference to the array, so dropping the registry's leaves recording running and truncating the array empties it once without stopping the next append. The mechanism is a flag the host sets on success (`settle()`), not a reference drop. The property itself is unchanged; only the stated means of reaching it was wrong.

### Boot moves out of module scope so Goal 1 can be tested

`main.ts` runs the `bundledExtensions` register loop at module top level, where no test can reach it. `app.test.ts` constructs its own registry and mounts `App` directly, so a test asserting "the app mounts when an extension throws" would pass without exercising the code path that actually halts — the one guarantee this iteration exists for would be untested.

The loop therefore moves into an exported `bootstrap({ registry, manager, persistence, extensions })`, which `main.ts` calls and which tests call directly. `main.ts` keeps its ordering (`bootstrap`, then `attachKeybindingDispatcher`, then `mount`), and the test asserts that `bootstrap` returns normally with a throwing extension, that the remaining extensions activated, and that the failure is on the record.

### Surfacing: panel row plus a host-owned indicator

**Extensions panel.** A failed row shows a failed state and the error message, and says retrying happens on reload. Its action needs less change than an earlier draft claimed: the panel renders Disable when `record.enabled` is true, and a failed record _is_ `enabled: true`, so the existing derivation already produces the right affordance. What changes is what the action **does** — `setEnabled(id, false)` skipping `deactivate` per the manager rules above — not how the label is chosen. An earlier draft asserted the derivation had to move to `failure` presence; that was a misreading.

The panel filters the workbench built-in out of its list (`extensions-panel.svelte`, `r.manifest.id !== 'workbench'`). That filter gains one exception with one qualification: **a record carrying a `failure` is always shown, built-ins included, and a failed built-in's row is informational — it offers no Disable.** The exception matters because otherwise the one failure that costs the operator the command palette would be the single case the UI hides. The qualification matters because disabling a failed workbench would clear its `failure`, which would remove the indicator, which is the only remaining way to open the panel once the workbench's own opener command and keybinding are gone — the operator's exit would destroy their way back in. Built-ins are not tracked in persistence and `main.ts` registers the workbench with `enabled: true` unconditionally, so "disable" was never a meaningful action for it anyway.

**Status bar.** The footer renders only extension contributions (`registry.listStatusBarItems()`, split by `alignment` in `app.svelte`), so a host-owned indicator cannot be a contribution, and an extension-contributed one would be subject to the failure it reports. `app.svelte` renders it directly from `manager.listExtensions()`, visible only when at least one record carries a `failure`, with its count defined as **the number of records with a `failure`** — exactly the set the panel marks failed, so the two surfaces cannot disagree. Disabling a failed extension clears its `failure` and decrements the count; a failed built-in cannot be disabled, so its contribution to the count persists until the next load. **Disable is not a kill switch for whatever the extension already started.** It removes the record's failure and stops the next load from activating it, but module-level resources opened before the throw — `extension-sitl`'s WebSocket is the live example — are not disposables and nothing in the failure path closes them, so they survive until reload. That is the same limit as the non-`Disposable` state above, surfacing where an operator is most likely to assume otherwise.

Clicking the indicator opens the panel, guarded: `extensionsPanelState.open()` throws when the panel is already open or another modal is active, so the indicator checks that state first.

### The gate this flips, and the surface it does not provide

[ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) reserves throwing for registrations whose absence would be unobservable, "only once activation-failure containment has landed", and names flight-overlay's existing throw as the known exception rather than the pattern to copy. This iteration lands containment, so that gate opens: throwing becomes a legitimate choice where absence would otherwise be invisible.

It does **not** retroactively bless flight-overlay's throw. A map with no drone icon is an observable absence, so by [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s own discriminator flight-overlay should degrade — skip the registrations, log once, let the map render without the overlay. Migrating it is a task in this iteration's feat-branch plan (a one-extension change), listed separately from the host work so the host change can be reviewed on its own.

**This iteration falsifies one sentence of [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md), and the correction lives here.** That ADR says "log once" means the console "until the containment iteration's extensions-panel row exists", implying containment would give the degrade path a surface. It does not, for the reason below. ADRs are historical record and this spec does not edit it; the repo's precedent for revising a landed ADR is supersession by a successor (ADR-0009 over ADR-0008), which a single overpromising sentence does not warrant. So this spec is the breadcrumb — a reader of [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s Mechanics should read it here — and if the degrade surface's design changes materially rather than merely slipping, that lands as a successor ADR.

What containment does **not** give that degrade path is a surface. The indicator reports _failures_, not _degradations_: an extension that skips a registration and logs has no way to report it, because reporting needs an extension-callable API — the notification primitive this spec defers. The asymmetry has a perverse edge worth naming rather than hiding: as of this iteration, an extension that throws gets a panel row and an indicator, while one that degrades exactly as prescribed stays console-only. That sharpens the deferral's trigger from "the second condition that needs to reach an operator" to **the first extension that actually degrades in the field**.

### What this does not protect

Two residuals, one of them smaller than an earlier draft of this spec claimed.

**A failed workbench costs the palette, not the panel.** The extensions panel is shell code: `extensions-panel-state.svelte.ts` and `extensions-panel-host.svelte` are shell modules and `app.svelte` renders the host unconditionally. Only the _opener_ — the `workbench.extensions.action.showInstalledExtensions` command and its `Ctrl+Shift+X` keybinding — is workbench-registered. So if the workbench fails, the command palette and that keybinding are gone, but the indicator still renders and still opens the panel directly through `extensionsPanelState`, and the panel shows the workbench's own failed row per the filter exception above. An earlier draft asserted the panel's opener made it unreachable; that was wrong, and containment is better here than the spec previously claimed.

**Contributions made into other extensions' registries stay live.** Covered under the ledger's limit above: this is the structural boundary of host-side containment, not an oversight, and it is routed to `docs/out-of-scope.md` with a trigger.

## Validation

**Unit — `packages/shell/src/extension-host/registry.test.ts`:**

1. A throwing `activate` throws an `ExtensionActivationError` carrying the extension id and the original error as `cause`.
2. **Host-minted disposables registered before the throw are disposed even when the extension never pushed them** — the batched-`push` case, with an extension that registers three contributions inside one argument list and throws on the fourth. This is the case the first design failed.
3. **Anything the extension did push to `context.subscriptions` before throwing is disposed too** — the orphaned-array case, which the ledger alone does not reach.
4. **Every `Disposable`-returning host method is covered, `onDidChangeConfiguration` included** — not just `register*`.
5. Disposal is LIFO and exactly once per disposable, and a disposable that throws during cleanup does not prevent the rest.
6. After a failed activation the extension is not active: no contributions from it, `getExtension(id)` is `undefined`, `deactivate(id)` rejects with `"is not active"`.
7. A disposable both pushed to `context.subscriptions` and minted by the host is disposed safely (idempotence).
8. **An `activate` returning a thenable is an activation error:** the ledger and `context.subscriptions` are disposed, no registry map is written, and no `Promise` is published as exports.
9. **The host is revoked on failure.** A continuation that resumes after the thenable check and calls a `Disposable`-returning host method throws and registers nothing — asserted by driving a macrotask between the failure and the assertion, which is how a reviewer demonstrated the leak this closes.
10. **The returned thenable's rejection is observed**, so the test run reports no unhandled rejection.
11. **The host is not revoked on success**, and a registration made after `activate` returns still works — revocation is failure-only.
12. **Recording stops on success**, so a registration made after `activate` returns does not accumulate in the ledger. Assert the observable — the ledger's length is unchanged by a post-activation registration — rather than any particular reference being dropped (see the correction note under Cleanup above).
13. **The ledger's limit is asserted rather than assumed:** a disposable minted by another extension's API (a stub standing in for `MapApi.registerLayer`) is _not_ disposed by containment. The test documents the boundary so a later change cannot silently move it.

**Unit — `packages/shell/src/extension-host/extension-manager.test.ts`:**

14. `register` of a throwing extension returns normally; the next `register` still activates.
15. The failed record carries `failure.message` and `enabled: true`.
16. **A boot-time failure does not call `onEnabledChanged`** — persistence must not learn about it.
17. **`setEnabled(id, true)` on a disabled extension that throws resolves, records the failure, and _does_ call `onEnabledChanged(id, true)`** — the operator's intent is recorded so the next reload retries.
18. `setEnabled(id, false)` on a failed record resolves, does **not** call `registry.deactivate`, clears `failure`, and calls `onEnabledChanged`.
19. `setEnabled` on a record without `failure` behaves exactly as before, same-value early return included.

**Unit — `packages/shell/src/extension-host/bootstrap.test.ts` (new):**

20. `bootstrap` with one throwing extension returns normally, activates every other extension, and leaves the failure on the record. This replaces an earlier "app mounts" case that `app.test.ts` could have passed without touching `main.ts`'s loop at all.
21. `bootstrap` registers the workbench built-in in the same ordered pass as the bundled extensions, so a failing built-in is covered by the same containment — and `main.ts`'s call order is preserved: `bootstrap` completes before the keybinding dispatcher attaches and before `mount`.

**Unit — `packages/shell/src/extensions-panel/extensions-panel.test.ts` and `packages/shell/src/app.test.ts`:**

22. A failed row renders the message and says retry happens on reload.
23. **A failed workbench record is shown** despite the panel's `workbench` filter, **and its row offers no Disable** — so the operator cannot clear the `failure` that keeps their only remaining panel opener alive.
24. The indicator's count equals the number of rows the panel marks failed, in the same state.
25. The indicator is absent with no failures, present with one or more, and opening the panel from it is a no-op when the panel is already open or a modal is active.

**Manual (the operator path that motivated the iteration).** Before this iteration's flight-overlay migration lands: disable Map from the panel, reload, and confirm the app renders, flight-overlay's row shows failed with its message, the indicator is visible and opens the panel, Disable works and persists across a reload, and the console carries full errors. After the migration, flight-overlay degrades instead of failing, so the operator-visible check becomes: disable Map, reload, confirm the map renders without the overlay and **no** failure is reported — the degrade path's correct outcome — and use the extensions panel to confirm no row is marked failed. Then `pnpm test`, `pnpm check`, `pnpm lint`.

## VS Code alignment

| Concern                                         | VS Code                                                                | gcscode                                                                       | Status                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A failing extension does not break the host     | ✓ (activation errors are caught and the window keeps working)          | ✓ (this iteration)                                                            | Alignment                                                                                                   |
| Failed activation surfaced in the extensions UI | ✓ (Extensions view marks the extension, output channel carries detail) | ✓ (panel row + message; console carries detail)                               | Alignment                                                                                                   |
| Failure isolation mechanism                     | separate extension host process                                        | in-process `try`/`catch` only                                                 | Deferral — isolation routed to the webview wing ([ADR-0005](../decisions/ADR-0005-extension-boundaries.md)) |
| Failure notification surface                    | notifications + output channels                                        | one host-owned status-bar indicator; no general message API                   | Deferral — a notification primitive is deferred with a trigger                                              |
| Retry policy                                    | reload window / reinstall                                              | stays enabled, retried on reload; no in-place retry (module-singleton hazard) | Divergence — no auto-disable, no counters                                                                   |
| Multiple simultaneous failures                  | each extension marked independently in the Extensions view             | one indicator carrying a count, with per-row detail in the panel              | Divergence — no per-failure notification, so N failures are one glance plus N rows                          |
| Async activation                                | awaits activation and reports per-extension failures                   | a thenable return is an activation error: observe, revoke, dispose, record    | Deferral — awaited activation is its own iteration                                                          |
| Surface for a gracefully-degraded contribution  | notifications + output channels                                        | none — only failures surface; a degraded contribution stays console-only      | Deferral — needs the extension-callable notification primitive                                              |

## `docs/out-of-scope.md` propagation

Five rows, two of them cross-cutting deferrals this iteration introduced and an earlier draft left stranded in Non-goals:

- **General operator-facing notification primitive.** No `host.window.showMessage`-equivalent; the activation-failure indicator is a single-purpose host-owned surface. Three consumers are already known: this indicator, the existing "Visible boot-time signal for schema-validation rejection" row, and [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s degrade path. _Trigger to revisit:_ the first extension that actually degrades in the field, which turns the third consumer from prospective into real — and amend the schema-validation-signal row to cross-reference this one when it lands.
- **In-place retry of a failed activation, and the activate-idempotency contract it requires.** Re-entering `activate()` on a live module is unsafe (`extension-sitl`'s `openClient` assigns `client` without closing the previous socket), so retry happens only on reload. Making a button safe means a stated rule in `@gcscode/extension-api` that `activate` is safe to re-enter, plus an audit — a constraint that binds every future extension, which is why it belongs here rather than in one spec's Non-goals. _Trigger to revisit:_ an operator workflow where reload is too expensive, or the first extension whose activation is already provably idempotent.
- **Async `activate`, and awaited activation.** A thenable return is an activation error; the host revokes, disposes and records it. Supporting async activation means awaiting it, which changes the registry's contract and the boot sequence. The nearest existing row, "Async cancellation tokens", is a different concern. _Trigger to revisit:_ the first extension whose activation genuinely cannot complete synchronously — the on-deck SITL listener work is the likely source.
- **Retry backoff or auto-disable for repeatedly failing extensions.** Retry-every-reload is the whole policy. _Trigger to revisit:_ an extension whose failure path is expensive enough that retrying it every load costs real startup time.
- **Cleanup of contributions an extension registered into another extension's registry.** Host-side containment cannot see or dispose them: `extension-flight-overlay` takes five of six disposables from `extension-map`, so a failed activation leaves them live. Fixing it needs either a teardown contract on service-extension APIs or a host-mediated registration path. _Trigger to revisit:_ the first operator-visible consequence (a stale map layer surviving a failed activation), or the second service extension with registering consumers.

Also amend the existing **"Third-party sandboxing"** row with a status note: containment (2026-10-16) removes the boot-halt class but provides no isolation; a misbehaving extension can still hang or leak within the shared realm.

## `packages/extension-api/README.md` propagation

The README's author-facing contract gained claims this iteration changes, so the post-merge docs commit updates three, as bullets to match the sibling propagation sections:

- A failed `activate` disposes what the host minted for that extension, plus anything the extension pushed to `context.subscriptions` — but **not** what other extensions minted for it, and not module-level state it set.
- `activate` must be synchronous. A thenable return is an activation error: the host observes the rejection, revokes the facade, disposes, and records the failure rather than publishing a `Promise` as the extension's exports.
- `deactivate?()` is not called on the failure path, because a hook written for a completed activation cannot be trusted after a partial one. An extension whose activation sets module state must tolerate re-entry on the next load.

## `docs/roadmap.md` propagation

Flip **Host activation-failure containment** to shipped with a link to this spec, qualified by what actually shipped: containment of synchronous and thenable-returning activation failures for host-minted contributions, with cross-extension contributions, module-level state and awaited activation each carrying their own `docs/out-of-scope.md` row. The entry should not read as though extension failures are now fully contained. Keep the asset abstraction v0 entry's dependency on it explicit.

## `docs/vs-code-alignment.md` propagation

The ledger has three tables with different column shapes — Alignments carries `Source`, while Divergences and Deferrals also carry `Trigger to revisit` — so each row below is filed with the columns its table requires rather than copied from this spec's four-column summary:

- **Alignments** (`Concern | VS Code | gcscode | Source`): a failing extension does not break the host; failed activation surfaced in the extensions UI. Source: this spec.
- **Divergences** (plus `Trigger to revisit`): retry policy (stays enabled, retried on reload, no counters, no in-place retry) — trigger: the in-place-retry row in `docs/out-of-scope.md`. Multiple simultaneous failures (one indicator with a count plus per-row detail, rather than per-extension notifications) — trigger: the notification-primitive row.
- **Deferrals** (plus `Trigger to revisit`): the failure-isolation mechanism (in-process `try`/`catch` versus a separate extension host process) — trigger: the webview wing; the notification surface — trigger: as above; the absent surface for a gracefully-degraded contribution — trigger: the first extension that degrades; and **async activation** (VS Code awaits activation and reports failures per-extension; gcscode treats a thenable return as an activation error) — trigger: the async row in `docs/out-of-scope.md`.

## Known unknowns

- **Whether a status-bar indicator is the right loudness for a GCS.** It is more discoverable than a panel row and quieter than a banner, which matches the project's floating-chrome preference — but no operator has used it. The honest test is the first time an extension fails in front of someone flying.
- **Whether the panel's `failure.message` is intelligible to an operator.** Extension authors write those strings for developers (flight-overlay's says "requires gcscode.map to be active before it activates"). Operator-facing failure copy is its own problem, deferred.
- **Whether retry-every-boot is still right once extensions are third-party.** A first-party extension that fails every boot is a bug someone fixes; an untrusted one could be a boot-time cost with no owner.
- **Whether treating a thenable return as an activation error is too blunt.** It is correct for what an async `activate` can publish today — a `Promise` cast as the exports type, which no consumer can use — so nothing of value is discarded. What is unexamined is whether an extension author who reaches for `async activate` is signalling a real need (a connection established at startup, say) that the host should eventually serve by awaiting activation, rather than a mistake to be rejected.
- **Whether reload-only retry is acceptable to an operator.** It is the safe option given module-level state, but "disable, reload, re-enable, reload" is four actions for what reads like one button, and nobody has done it in the field.
- **What a consumer should do when the service it needs is disabled rather than failed.** A disabled Map is the operator's deliberate choice; a failed Map is a defect. Both leave flight-overlay with nothing to register, and this spec treats them identically. Whether an operator wants "the overlay is off because you turned Map off" distinguished from "the overlay is off because Map broke" is unexamined, and expressing the difference may need the deferred notification primitive.
- **Whether flight-overlay should degrade or keep throwing.** This spec says degrade, on [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s observability discriminator. The counter-argument is that a map silently missing its drone icon may be worse than an extension that visibly failed — an argument about what the operator sees, which the absent degrade surface makes hard to settle.

## Tripwires for known-quality concerns

Per `CLAUDE.md` "Reviewer-role design conventions > Tripwires for known-quality concerns", tripwires exist for concerns that are otherwise vibes-checks — observable in output, detectable as a pattern, and **not** already enforced automatically. An earlier draft listed "any boot where an extension fails must still mount the app" as a binary tripwire, which was a category error: that is validation cases 20 and 21, enforced by the suite on every run. The real vibes-checks here are the two surfacing judgments:

- **Indicator loudness, across N=2 occurrences.** If two separate extension failures occur and in both the operator's first awareness came from something other than the indicator — a contribution noticed missing in use, a console inspection, someone else's report — the indicator is too quiet and the banner option this spec rejected should be reconsidered. Observable from the failure's own account; not decidable from the test suite.
- **Host-chrome accretion, across N=2 iterations.** If two consecutive iterations each add a host-owned indicator, status line, or badge for their own single condition, the notification-primitive deferral has fired in practice and should be built rather than extended a third time. This tripwire was dropped when this section was rewritten and is restored deliberately: the indicator this iteration adds is the first observation, so the next one closes it.
- **Failure-message intelligibility, across N=2 occurrences.** If two failures produce a panel message the operator cannot act on without reading source, the operator-facing failure copy iteration has fired. Note that the obvious example — flight-overlay's "requires gcscode.map to be active before it activates" — stops being reachable once this iteration's own migration converts that extension to degrading, so the tripwire's evidence will come from whichever extension throws next.

## Future iterations

1. **An activate-idempotency contract, and a `deactivate` that tolerates failed activation** — one change to `@gcscode/extension-api` plus one audit. `activate` must be safe to re-enter after a failure (`extension-sitl`'s `openClient` is the known violation), and `deactivate?()` must be safe to call after a partial activation, which is what would let the failure path undo non-`Disposable` state like `flightOverlayState.setHost`. Together they are also what would make an in-place Retry button safe.
2. **Awaited activation** — what real support for `async activate` requires, as opposed to this iteration's rejection of it. It changes the registry's contract (activation becomes asynchronous) and the boot sequence (`bootstrap` must await), which is why it is a separate iteration rather than a wider `try`/`catch`.
3. **Operator-facing failure copy** — a vocabulary for what an extension failure means to someone flying, rather than the author's developer string.
4. **A general notification primitive**, per the deferral's trigger.
5. **Dependency declaration** (`extensionDependencies`), when a service→service edge must resolve during `activate()`.
6. **Isolation**, via the webview wing — the only fix for hangs and leaks, which containment does not touch.

## Origin

[ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s Consequences name containment as a prerequisite; the underlying defect was traced by the extension-architect reviewer on PR #32, which verified the full path from `registry.ts` through `extension-persistence.ts` to `main.ts` and identified the partial-registration leak. Three decisions were the user's on 2026-10-16: retry-every-boot and the panel-plus-indicator surfacing (both operator-visible), and the spec-PR process route (not). The re-enable unhandled-rejection defect was found while grounding this spec in the panel's click handler.

## Post-merge implementation

Feat branch `feat/activation-failure-containment`, run through the subagent-driven plan execution pipeline (per-task implementer, then spec-compliance and code-quality reviews, followups as separate `Code-review-followup:` commits, final cross-cutting review before merge).

The plan carries two tasks beyond the host change, kept separate so the host work can be reviewed on its own:

- extracting `bootstrap` out of `main.ts`'s module scope, which Goal 1's test depends on;
- migrating `extension-flight-overlay` from throwing to degrading, per the gate [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) leaves open and its observability discriminator.

Explicitly **not** in this iteration's scope, despite being adjacent: [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s ESLint-and-`mapApi` follow-up, and the three stale `bundled-extensions.ts` ordering comments, which [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) queues for the asset abstraction v0 iteration.
