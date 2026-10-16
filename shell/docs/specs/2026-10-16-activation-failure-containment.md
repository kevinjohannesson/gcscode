# Host activation-failure containment

**Status:** Proposed (2026-10-16)

## Context

[ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) makes domain capabilities service extensions, which means most product value is reached through `host.extensions.getExtension(id)?.exports` and most future extensions are consumers of some other extension. That rule multiplies consumer→service edges, and gcscode currently has no containment for one of those edges failing. ADR-0012 prices the gap as a **prerequisite** rather than an ergonomic tax, and sequences this iteration ahead of the asset abstraction v0 iteration.

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
- **Declared extension dependencies.** A topological sort would prevent the specific flight-overlay-before-map ordering failure. It stays deferred — `docs/out-of-scope.md`'s trigger, sharpened by ADR-0012, is the first service→service edge that must resolve during `activate()`, which v0 does not create. Containment is the general answer; ordering declarations are the specific one, and the general answer is what keeps a bad bundle order from being fatal.
- **A general host notification primitive** (`host.window.showMessage`-style). ADR-0012 names the absence of any operator-facing message surface as a real gap. This iteration ships the narrow version — one host-owned indicator for one condition — rather than designing a notification API with a single consumer. The deferral is recorded with its trigger.

## Goals

1. **A throwing `activate()` cannot prevent `mount`.** Boot completes with the remaining extensions active, the keybinding dispatcher attached, and the app rendered — verified against the real boot path, not against a test harness that builds its own registry.
2. **Contributions registered before a throw are disposed, not leaked.** Cleanup reuses `deactivate`'s existing LIFO-with-per-disposable-`try`/`catch` semantics.
3. **The failure is recorded on the extension's record and visible without opening anything** — an extensions-panel row carrying the message, plus a host-owned status-bar indicator whenever any extension has failed.
4. **The operator can get out of a failing extension.** Disabling one from the panel works instead of rejecting with `"is not active"` into a floating promise, and no activation path produces an unhandled rejection.
5. **Persistence is untouched by failure.** A failed extension stays enabled, so every reload retries it. A transient or ordering-related cause therefore clears on the next load with no operator action; a persistent cause fails again, visibly, which is the intended outcome rather than a silent absence.
6. **Existing `deactivate` behaviour is unchanged**, including its error resilience and the `"is not active"` guard.

## Non-goals (this iteration)

- Isolation, sandboxing, or any process/thread boundary for extensions.
- Activation events, lazy activation, or dependency declaration.
- A general notification or message API for extensions.
- Retry backoff, failure counters, or auto-disabling after N failures. Retry-every-boot is the whole policy.
- In-place retry from the UI, and the activate-idempotency contract it would require (see Architecture).
- Containment for async `activate` rejections beyond recording them (see Architecture).
- Operator-facing stack traces. The panel row shows the error's `message`; the full error goes to the console.
- Containment for `deactivate` failures, which are already caught and logged per extension.

## Architecture

### Cleanup belongs to a host-side ledger, not to `context.subscriptions`

The obvious cleanup — dispose `context.subscriptions` when `activate` throws — does not work, and three reviewers independently showed why. No extension in this repo pushes disposables incrementally. `extension-flight-overlay` registers six layers and controls inside a single `push(...)` argument list; the workbench built-in assigns four disposables to consts and pushes them together. Arguments are evaluated before the call, so a throw on the fourth registration leaves three contributions live in the host's registries and `context.subscriptions` still **empty**. Cleanup keyed on the extension's array would dispose nothing in the dominant case.

The host already mints every disposable an extension receives, so the host keeps the record:

```ts
activate(extension) {
  const identity: ExtensionIdentity = { /* unchanged */ };
  const minted: Disposable[] = [];
  const context: ExtensionContext = {
    host: createHost(identity, minted), // every register* appends what it returns
    subscriptions: [],
    extension: identity,
  };
  let exportsValue: unknown;
  try {
    exportsValue = extension.activate(context);
  } catch (cause) {
    disposeAll(minted, identity.id); // LIFO, per-disposable try/catch
    throw new ExtensionActivationError(identity.id, cause);
  }
  subscriptionsByExtension.set(identity.id, context.subscriptions);
  // … unchanged
}
```

Four properties:

- **The ledger is correct regardless of what the extension does with its disposables.** It records what the host handed out, so batching, late pushing, and not pushing at all are all covered.
- **`context.subscriptions` remains `deactivate`'s source of truth.** Extensions push their own non-host disposables there (closures, timers), and successful teardown must dispose those too. The ledger is for failure cleanup only.
- **A disposable may appear in both, and double disposal is safe** — `Disposable.dispose()` is required to be idempotent (`packages/extension-api/src/index.ts`).
- **`disposeAll` is extracted from the existing `deactivate` loop**, so both paths share one implementation and one error-resilience guarantee.

After a failed activation the registry holds nothing for that extension: no subscriptions entry, no deactivate hook, no exports. `deactivate(id)` therefore still rejects with `"is not active"`, which is correct — and which the manager must account for (below).

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

- **`register`** catches `ExtensionActivationError`, stores `{ extension, enabled: true, failure }`, logs the full error, and returns normally so the boot loop continues.
- **`setEnabled(id, false)` on a failed record skips `registry.deactivate` entirely.** Nothing is active, so calling it would reject with `"is not active"` — and because the panel invokes `setEnabled` as a floating promise, today that rejection is both invisible and unhandled. Instead the manager clears `failure`, sets `enabled: false`, and calls `onEnabledChanged` so persistence records the operator's explicit choice. This is the operator's way out of a failing extension.
- **`setEnabled` on records without a `failure` is unchanged**, including the same-value early return and its existing tests.
- `onEnabledChanged` is the persistence callback `main.ts` wires in (`persistence.recordEnabledChange`). An activation failure never invokes it, which is exactly what makes retry-every-boot true: only explicit operator toggles reach `localStorage`.

**There is no in-place retry.** Extensions are module singletons, and re-entering `activate()` on a live module is unsafe: `extension-sitl`'s module-level `client` is assigned by `openClient()` without closing an existing socket, so each re-activation would leak a WebSocket. Re-activation is only safe with fresh module state, which is what a page reload gives — and which the retry-every-boot policy already relies on. So the panel reports the failure and points at reload rather than offering a button that re-enters `activate()`. An activate-idempotency contract for extension authors would change that, and it is a bigger change than this iteration: it needs a stated rule in `@gcscode/extension-api` and an audit of every extension. Recorded as a future iteration.

### Async activation is outside containment's reach, and the spec says so

[ADR-0005](../decisions/ADR-0005-extension-boundaries.md) keeps activation synchronous, and `Extension.activate(context): unknown` has no `Promise` in its contract — but nothing stops an author writing `async activate`, in which case a rejection lands after `try`/`catch` has returned. The host detects a thenable return value and attaches a handler that records the failure on the record and logs it, so the operator still sees something and no unhandled rejection escapes. It does **not** tear down: exports have already been published and consumers may be holding them, and disposing underneath a live consumer is worse than a recorded failure. The asymmetry is a known limitation rather than a goal — real containment for async activation needs activation to be awaited, which is its own iteration.

### Boot moves out of module scope so Goal 1 can be tested

`main.ts` runs the `bundledExtensions` register loop at module top level, where no test can reach it. `app.test.ts` constructs its own registry and mounts `App` directly, so a test asserting "the app mounts when an extension throws" would pass without exercising the code path that actually halts — the one guarantee this iteration exists for would be untested.

The loop therefore moves into an exported `bootstrap({ registry, manager, persistence, extensions })`, which `main.ts` calls and which tests call directly. `main.ts` keeps its ordering (`bootstrap`, then `attachKeybindingDispatcher`, then `mount`), and the test asserts that `bootstrap` returns normally with a throwing extension, that the remaining extensions activated, and that the failure is on the record.

### Surfacing: panel row plus a host-owned indicator

**Extensions panel.** A failed row shows a failed state and the error message. Its action is **Disable** regardless of `enabled`, which means the panel can no longer derive the action from `!record.enabled` — a failed record has `enabled: true`, so today's toggle would render Disable and route into the rejecting path described above. The row also says that retrying happens on reload.

**Status bar.** The footer renders only extension contributions (`registry.listStatusBarItems()`, split by `alignment` in `app.svelte`), so a host-owned indicator cannot be a contribution — and an extension-contributed one would be subject to the failure it reports. `app.svelte` renders it directly from `manager.listExtensions()`, visible only when at least one record carries a `failure`, summarising the count. Clicking it opens the extensions panel, guarded: `extensionsPanelState.open()` throws when the panel is already open or another modal is active, so the indicator checks that state first.

### The gate this flips, and the surface it does not provide

ADR-0012 reserves throwing for registrations whose absence would be unobservable, "only once activation-failure containment has landed", and names flight-overlay's existing throw as the known exception rather than the pattern to copy. This iteration lands containment, so that gate opens: throwing becomes a legitimate choice where absence would otherwise be invisible.

It does **not** retroactively bless flight-overlay's throw. A map with no drone icon is an observable absence, so by ADR-0012's own discriminator flight-overlay should degrade — skip the registrations, log once, let the map render without the overlay. Migrating it is a task in this iteration's feat-branch plan (a one-extension change), listed separately from the host work so the host change can be reviewed on its own.

What containment does **not** give ADR-0012's degrade path is a surface. The indicator reports _failures_, not _degradations_: an extension that skips a registration and logs has no way to report it, because reporting needs an extension-callable API — the notification primitive this spec defers. The asymmetry has a perverse edge worth naming rather than hiding: as of this iteration, an extension that throws gets a panel row and an indicator, while one that degrades exactly as prescribed stays console-only. That sharpens the deferral's trigger from "the second condition that needs to reach an operator" to **the first extension that actually degrades in the field**.

### What this does not protect

If the workbench built-in itself fails to activate, the palette and the panel's keybinding are gone, and the indicator is the only remaining signal — it is host-rendered, so it survives, but clicking it cannot open a panel whose opener the failed extension registers. Accepted residual: the workbench is shell code registered through the public API deliberately, it has no external dependencies to fail on, and isolating the shell from its own built-in is isolation work rather than containment work.

## Validation

**Unit — `registry.test.ts`:**

1. A throwing `activate` rejects/throws an `ExtensionActivationError` carrying the extension id and the original error as `cause`.
2. **Contributions registered before the throw are disposed even when the extension never pushed them** — the batched-`push` case, exercised with an extension that registers three contributions inside one argument list and throws on the fourth. This is the case the naive design failed.
3. Disposal is LIFO and exactly once per disposable, and a disposable that throws during cleanup does not prevent the rest (reuses the existing `deactivate` resilience shape).
4. After a failed activation the extension is not active: no views/status items/commands from it, `getExtension(id)` is `undefined`, `deactivate(id)` rejects with `"is not active"`.
5. A disposable pushed to `context.subscriptions` _and_ minted by the host is disposed safely (idempotence).

**Unit — `extension-manager.test.ts`:**

6. `register` of a throwing extension returns normally; the next `register` still activates.
7. The failed record carries `failure.message` and `enabled: true`.
8. `onEnabledChanged` is **not** called for an activation failure — persistence must not learn about it.
9. `setEnabled(id, false)` on a failed record resolves, does **not** call `registry.deactivate`, clears `failure`, and does call `onEnabledChanged`.
10. `setEnabled` on a record without `failure` behaves exactly as before, same-value early return included.

**Unit — `bootstrap` (new):**

11. `bootstrap` with one throwing extension returns normally, activates every other extension, and leaves the failure on the record. This replaces the earlier "app mounts" case, which `app.test.ts` could have passed without touching `main.ts`'s loop at all.
12. `main.ts`'s call order is preserved: `bootstrap` completes before the keybinding dispatcher attaches and before `mount`.

**Unit — panel and indicator:**

13. A failed row renders the message, offers **Disable** (not a toggle derived from `enabled`), and says retry happens on reload.
14. The indicator is absent with no failures, present with one or more, reports the count, and opening the panel from it is a no-op when the panel is already open or a modal is active.

**Manual (the operator path that motivated the iteration):** disable Map from the panel, reload. Expected: the app renders, flight-overlay's row shows failed with its message, the indicator is visible, clicking it opens the panel, Disable on the failed row works and persists, re-enabling Map and reloading brings flight-overlay back, and the console carries full errors throughout. Then `pnpm test`, `pnpm check`, `pnpm lint`.

## VS Code alignment

| Concern                                         | VS Code                                                                | gcscode                                                                       | Status                                                                                                      |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A failing extension does not break the host     | ✓ (activation errors are caught and the window keeps working)          | ✓ (this iteration)                                                            | Alignment                                                                                                   |
| Failed activation surfaced in the extensions UI | ✓ (Extensions view marks the extension, output channel carries detail) | ✓ (panel row + message; console carries detail)                               | Alignment                                                                                                   |
| Failure isolation mechanism                     | separate extension host process                                        | in-process `try`/`catch` only                                                 | Deferral — isolation routed to the webview wing ([ADR-0005](../decisions/ADR-0005-extension-boundaries.md)) |
| Failure notification surface                    | notifications + output channels                                        | one host-owned status-bar indicator; no general message API                   | Deferral — a notification primitive is deferred with a trigger                                              |
| Retry policy                                    | reload window / reinstall                                              | stays enabled, retried on reload; no in-place retry (module-singleton hazard) | Divergence — no auto-disable, no counters                                                                   |
| Surface for a gracefully-degraded contribution  | notifications + output channels                                        | none — only failures surface; a degraded contribution stays console-only      | Deferral — needs the extension-callable notification primitive                                              |

## `docs/out-of-scope.md` propagation

- **General operator-facing notification primitive.** No `host.window.showMessage`-equivalent; the activation-failure indicator is a single-purpose host-owned surface. _Trigger to revisit:_ the second condition that needs to reach an operator without a dedicated surface — ADR-0012's degrade prescription is the likely one.
- **Retry backoff or auto-disable for repeatedly failing extensions.** Retry-every-boot is the whole policy; a permanently broken extension fails noisily on every reload. _Trigger to revisit:_ an extension whose failure path is expensive enough that retrying it every boot costs real startup time.
- Amend the existing **"Third-party sandboxing"** row with a status note: containment (2026-10-16) removes the boot-halt class but provides no isolation; a misbehaving extension can still hang or leak within the shared realm.

## `docs/roadmap.md` propagation

Flip **Host activation-failure containment** to shipped with a link to this spec, and keep the asset abstraction v0 entry's dependency on it explicit.

## `docs/vs-code-alignment.md` propagation

The ledger has three tables, and these rows do not all belong in one:

- **Alignments:** a failing extension does not break the host; failed activation surfaced in the extensions UI.
- **Divergences:** retry policy (stays enabled, retried on reload, no counters, no in-place retry).
- **Deferrals:** the failure-isolation mechanism, the notification surface, and the absent surface for a gracefully-degraded contribution. Each is deferred-with-a-trigger rather than a chosen divergence, which is the distinction the ledger's Status conventions draw.

## Known unknowns

- **Whether a status-bar indicator is the right loudness for a GCS.** It is more discoverable than a panel row and quieter than a banner, which matches the project's floating-chrome preference — but no operator has used it. The honest test is the first time an extension fails in front of someone flying.
- **Whether the panel's `failure.message` is intelligible to an operator.** Extension authors write those strings for developers (flight-overlay's says "requires gcscode.map to be active before it activates"). Operator-facing failure copy is its own problem, deferred.
- **Whether retry-every-boot is still right once extensions are third-party.** A first-party extension that fails every boot is a bug someone fixes; an untrusted one could be a boot-time cost with no owner.
- **Whether recording an async-activation rejection without tearing down is right.** Disposing underneath a consumer that already holds the extension's exports seems worse, but nothing has exercised it, and the window where contributions stay live under a failed extension is real.
- **Whether reload-only retry is acceptable to an operator.** It is the safe option given module-level state, but "disable, reload, re-enable, reload" is four actions for what reads like one button, and nobody has done it in the field.
- **Whether flight-overlay should degrade or keep throwing.** This spec says degrade, on ADR-0012's observability discriminator. The counter-argument is that a map silently missing its drone icon may be worse than an extension that visibly failed — an argument about what the operator sees, which the absent degrade surface makes hard to settle.

## Tripwires for known-quality concerns

Per `CLAUDE.md` "Reviewer-role design conventions > Tripwires for known-quality concerns", with [`docs/specs/2026-05-18-configuration-system-v1.md`](2026-05-18-configuration-system-v1.md) as the in-repo precedent for placement:

- **Binary, N=1:** any boot in which an extension fails must still mount the app. This is decidable from the test suite (case 11) and has no noise floor — one observation of a blank page is the failure. If it ever regresses, containment has been undone rather than degraded.
- **Across N=2 iterations:** if two consecutive iterations add a host-owned indicator, status line, or badge for their own single condition, the notification-primitive deferral above has fired and should be re-evaluated rather than extended a third time.

## Future iterations

1. **An activate-idempotency contract** — a stated rule in `@gcscode/extension-api` that `activate` must be safe to re-enter after a failure, plus the audit that makes it true (`extension-sitl`'s `openClient` is the known violation). That is what would make an in-place Retry button safe.
2. **Awaited activation**, the only way async `activate` rejections become containable rather than merely recorded.
3. **Operator-facing failure copy** — a vocabulary for what an extension failure means to someone flying, rather than the author's developer string.
4. **A general notification primitive**, per the deferral's trigger.
5. **Dependency declaration** (`extensionDependencies`), when a service→service edge must resolve during `activate()`.
6. **Isolation**, via the webview wing — the only fix for hangs and leaks, which containment does not touch.

## Origin

ADR-0012's Consequences name containment as a prerequisite; the underlying defect was traced by the extension-architect reviewer on PR #32, which verified the full path from `registry.ts` through `extension-persistence.ts` to `main.ts` and identified the partial-registration leak. Three decisions were the user's on 2026-10-16: retry-every-boot and the panel-plus-indicator surfacing (both operator-visible), and the spec-PR process route (not). The re-enable unhandled-rejection defect was found while grounding this spec in the panel's click handler.

## Post-merge implementation

Feat branch `feat/activation-failure-containment`, run through the subagent-driven plan execution pipeline (per-task implementer, then spec-compliance and code-quality reviews, followups as separate `Code-review-followup:` commits, final cross-cutting review before merge).

The plan carries two tasks beyond the host change, kept separate so the host work can be reviewed on its own:

- extracting `bootstrap` out of `main.ts`'s module scope, which Goal 1's test depends on;
- migrating `extension-flight-overlay` from throwing to degrading, per the gate ADR-0012 leaves open and its observability discriminator.

Explicitly **not** in this iteration's scope, despite being adjacent: ADR-0012's ESLint-and-`mapApi` follow-up, and the three stale `bundled-extensions.ts` ordering comments, which ADR-0012 queues for the asset abstraction v0 iteration.
