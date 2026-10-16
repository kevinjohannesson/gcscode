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

1. **Partial registrations leak.** An extension that registers three contributions and then throws has those three live in the host's registries, with `subscriptionsByExtension` never written — so `deactivate(id)` throws `"is not active"` and nothing can dispose them. They persist for the session.
2. **Re-enable fails silently.** `extensions-panel.svelte` invokes `void manager.setEnabled(record.manifest.id, !record.enabled)` as a floating promise, so clicking **Enable** on an extension that throws produces an unhandled rejection, no UI change, and no explanation.

This iteration contains the failure, cleans up after it, and makes it visible.

## Why not the bigger version

- **Process or iframe isolation for extensions.** The real fix for "an extension can take the host down" is isolation, which ADR-0005 already routes to the webview wing and `docs/out-of-scope.md` defers under "Third-party sandboxing". Isolation is a large iteration with an IPC protocol attached; containment is ~a day and removes the boot-halt class today. Doing containment first is not a substitute for isolation, and this spec does not claim it is.
- **Activation events / lazy activation.** Making extensions activate on demand would shrink the boot-time blast radius, but it is deferred in `docs/out-of-scope.md` with its own trigger (cold-start cost at ~50+ extensions) and would not help a failure that happens whenever activation does occur.
- **Declared extension dependencies.** A topological sort would prevent the specific flight-overlay-before-map ordering failure. It stays deferred — `docs/out-of-scope.md`'s trigger, sharpened by ADR-0012, is the first service→service edge that must resolve during `activate()`, which v0 does not create. Containment is the general answer; ordering declarations are the specific one, and the general answer is what keeps a bad bundle order from being fatal.
- **A general host notification primitive** (`host.window.showMessage`-style). ADR-0012 names the absence of any operator-facing message surface as a real gap. This iteration ships the narrow version — one host-owned indicator for one condition — rather than designing a notification API with a single consumer. The deferral is recorded with its trigger.

## Goals

1. **A throwing `activate()` cannot prevent `mount`.** Boot completes with the remaining extensions active, the keybinding dispatcher attached, and the app rendered.
2. **Contributions registered before a throw are disposed, not leaked.** Cleanup reuses `deactivate`'s existing LIFO-with-per-disposable-`try`/`catch` semantics.
3. **The failure is recorded on the extension's record and visible without opening anything** — an extensions-panel row carrying the message, plus a host-owned status-bar indicator whenever any extension has failed.
4. **Re-enabling a failing extension from the panel surfaces the failure** instead of producing an unhandled rejection.
5. **Persistence is untouched by failure.** A failed extension stays enabled, so every reload retries it; a cause that was transient or ordering-related self-heals with no operator action.
6. **Existing `deactivate` behaviour is unchanged**, including its error resilience and the `"is not active"` guard.

## Non-goals (this iteration)

- Isolation, sandboxing, or any process/thread boundary for extensions.
- Activation events, lazy activation, or dependency declaration.
- A general notification or message API for extensions.
- Retry backoff, failure counters, or auto-disabling after N failures. Retry-every-boot is the whole policy.
- Operator-facing stack traces. The panel row shows the error's `message`; the full error goes to the console.
- Containment for `deactivate` failures, which are already caught and logged per extension.

## Architecture

### `registry.activate` contains the throw and cleans up

`activate` keeps its signature and still throws on failure — the registry is the wrong layer to decide policy — but it no longer leaves debris:

```ts
activate(extension) {
  const identity: ExtensionIdentity = { /* unchanged */ };
  const context: ExtensionContext = { host: createHost(identity), subscriptions: [], extension: identity };
  let exportsValue: unknown;
  try {
    exportsValue = extension.activate(context);
  } catch (cause) {
    disposeAll(context.subscriptions, identity.id); // LIFO, per-disposable try/catch
    throw new ExtensionActivationError(identity.id, cause);
  }
  subscriptionsByExtension.set(identity.id, context.subscriptions);
  // … unchanged
}
```

Three details are load-bearing. The `context.subscriptions` array is in scope at the throw site, which is why cleanup must live here rather than in the manager — the manager has no reference to it. `disposeAll` is extracted from the existing `deactivate` loop so both paths share one implementation and one error-resilience guarantee. And `ExtensionActivationError` carries the extension id plus the original error as `cause`, so the manager records a message without re-deriving which extension failed.

An extension that throws leaves the registry in the same state as one that was never activated: no subscriptions entry, no deactivate hook, no exports. `deactivate(id)` therefore still throws `"is not active"`, which is correct — there is nothing to tear down.

### `extension-manager` records failure and keeps going

`ExtensionRecord` gains one optional field:

```ts
export interface ExtensionRecord {
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
  /** Present iff the most recent activation attempt threw. Cleared by a successful activation. */
  readonly failure?: { readonly message: string };
}
```

- **`register`** catches `ExtensionActivationError`, stores the state as `{ extension, enabled: true, failure }`, logs the full error, and returns normally. The boot loop in `main.ts` continues to the next extension untouched.
- **`setEnabled(id, true)`** catches the same way: it records the failure, leaves `enabled: true` (the operator asked for it on, and the retry policy wants it on), and **resolves** rather than rejecting — the panel's floating promise then cannot produce an unhandled rejection, and the UI updates from the record.
- **`setEnabled(id, false)`** is unchanged, and additionally clears any `failure` — a disabled extension is not a failed one.
- A successful activation clears `failure`, so a retry that works leaves no residue.

`enabled: true` with `failure` present is the state that makes Goal 5 work: persistence only ever records explicit operator toggles, so a failed extension is never written to the disabled set and is retried on the next boot.

The internal map is already a `SvelteMap`, so `listExtensions()` is reactive and both UI surfaces update without new plumbing.

### Surfacing: panel row plus a host-owned indicator

**Extensions panel.** The row for a failed extension shows a failed state (styling consistent with the existing `opacity-60` disabled treatment, plus the message), and its action button reads **Retry** rather than **Disable** — wired to the same `setEnabled(id, true)` path, which re-attempts activation and either clears the failure or records a fresh one.

**Status bar.** The footer currently renders only extension contributions (`registry.listStatusBarItems()`, split by `alignment` in `app.svelte`). A host-owned indicator cannot be a contribution — the host owns it, and an extension-contributed indicator would itself be subject to the failure it reports. So `app.svelte` renders it directly, from `manager.listExtensions()`, visible only when at least one record has a `failure`, and summarising the count. Clicking it opens the extensions panel.

One guard: `extensionsPanelState.open()` throws when the panel is already open or when another modal overlay is active (it mirrors the quick-pick's modal guard). The indicator checks that state before opening rather than letting a click throw.

### What this does not protect

If the workbench built-in itself fails to activate, the palette and the panel's keybinding are gone, and the indicator is the only remaining signal — it is host-rendered, so it survives, but clicking it cannot open a panel whose opener is registered by the extension that failed. That is an accepted residual: the workbench is shell code registered through the public API deliberately, it has no external dependencies to fail on, and isolating the shell from its own built-in is isolation work rather than containment work.

## Validation

**Unit — `registry.test.ts`:**

1. A throwing `activate` propagates an `ExtensionActivationError` carrying the extension id and the original error as `cause`.
2. Contributions registered before the throw are disposed, in LIFO order, exactly once.
3. A disposable that itself throws during that cleanup does not prevent the remaining disposals (reuses the existing `deactivate` resilience test shape).
4. After a failed activation the registry reports the extension as not active: `listViews()` / `listStatusBarItems()` / `listCommands()` show nothing from it, `getExtension(id)` is `undefined`, and `deactivate(id)` rejects with `"is not active"`.

**Unit — `extension-manager.test.ts`:**

5. `register` of a throwing extension returns normally, and the subsequent `register` call still activates.
6. The failed extension's record carries `failure.message` and `enabled: true`.
7. `setEnabled(id, true)` on a throwing extension resolves (does not reject) and records the failure.
8. `setEnabled(id, false)` on a failed extension clears `failure` and does not call `registry.activate`.
9. A retry that succeeds clears `failure`.
10. `onEnabledChanged` is **not** called for an activation failure — persistence must not learn about it.

**Unit — `app.test.ts` / panel tests:**

11. The app mounts when one bundled extension throws during activation.
12. The indicator is absent with no failures, present with one or more, and reports the count.
13. A failed row renders the message and a **Retry** action.

**Manual (the operator path that motivated the iteration):** disable Map from the panel, reload. Expected: the app renders, flight-overlay's row shows failed with its error message, the status-bar indicator is visible, clicking it opens the panel, re-enabling Map and then retrying flight-overlay clears both, and the console carries the full error throughout. Then `pnpm test`, `pnpm check`, `pnpm lint`.

## VS Code alignment

| Concern                                         | VS Code                                                                | gcscode                                                     | Status                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| A failing extension does not break the host     | ✓ (activation errors are caught and the window keeps working)          | ✓ (this iteration)                                          | Alignment                                                        |
| Failed activation surfaced in the extensions UI | ✓ (Extensions view marks the extension, output channel carries detail) | ✓ (panel row + message; console carries detail)             | Alignment                                                        |
| Failure isolation mechanism                     | separate extension host process                                        | in-process `try`/`catch` only                               | Divergence — isolation deferred to the webview wing (ADR-0005)   |
| Failure notification surface                    | notifications + output channels                                        | one host-owned status-bar indicator; no general message API | Divergence — a notification primitive is deferred with a trigger |
| Retry policy                                    | reload window / reinstall                                              | stays enabled, retried every boot                           | Divergence — no auto-disable, no counters                        |

## `docs/out-of-scope.md` propagation

- **General operator-facing notification primitive.** No `host.window.showMessage`-equivalent; the activation-failure indicator is a single-purpose host-owned surface. _Trigger to revisit:_ the second condition that needs to reach an operator without a dedicated surface — ADR-0012's degrade prescription is the likely one.
- **Retry backoff or auto-disable for repeatedly failing extensions.** Retry-every-boot is the whole policy; a permanently broken extension fails noisily on every reload. _Trigger to revisit:_ an extension whose failure path is expensive enough that retrying it every boot costs real startup time.
- Amend the existing **"Third-party sandboxing"** row with a status note: containment (2026-10-16) removes the boot-halt class but provides no isolation; a misbehaving extension can still hang or leak within the shared realm.

## `docs/roadmap.md` propagation

Flip **Host activation-failure containment** to shipped with a link to this spec, and keep the asset abstraction v0 entry's dependency on it explicit.

## `docs/vs-code-alignment.md` propagation

Add the two Alignments rows and three Divergences rows from the table above.

## Known unknowns

- **Whether a status-bar indicator is the right loudness for a GCS.** It is more discoverable than a panel row and quieter than a banner, which matches the project's floating-chrome preference — but no operator has used it. The honest test is the first time an extension fails in front of someone flying.
- **Whether the panel's `failure.message` is intelligible to an operator.** Extension authors write those strings for developers (flight-overlay's says "requires gcscode.map to be active before it activates"). Operator-facing failure copy is its own problem, deferred.
- **Whether retry-every-boot is still right once extensions are third-party.** A first-party extension that fails every boot is a bug someone fixes; an untrusted one could be a boot-time cost with no owner.

## Tripwires for known-quality concerns

- **Binary, N=1:** any boot in which an extension fails must still mount the app. This is decidable from the test suite (case 11) and has no noise floor — one observation of a blank page is the failure. If it ever regresses, containment has been undone rather than degraded.
- **Across N=2 iterations:** if two consecutive iterations add a host-owned indicator, status line, or badge for their own single condition, the notification-primitive deferral above has fired and should be re-evaluated rather than extended a third time.

## Future iterations

1. **Operator-facing failure copy** — a vocabulary for what an extension failure means to someone flying, rather than the author's developer string.
2. **A general notification primitive**, per the deferral's trigger.
3. **Dependency declaration** (`extensionDependencies`), when a service→service edge must resolve during `activate()`.
4. **Isolation**, via the webview wing — the only fix for hangs and leaks, which containment does not touch.

## Origin

ADR-0012's Consequences name containment as a prerequisite; the underlying defect was traced by the extension-architect reviewer on PR #32, which verified the full path from `registry.ts` through `extension-persistence.ts` to `main.ts` and identified the partial-registration leak. The three operator-visible decisions (retry every boot, panel row plus status-bar indicator, spec-PR process) were made by the user on 2026-10-16. The re-enable unhandled-rejection defect was found while grounding this spec in the panel's click handler.

## Post-merge implementation

Feat branch `feat/activation-failure-containment`, run through the subagent-driven plan execution pipeline (per-task implementer, then spec-compliance and code-quality reviews, followups as separate `Code-review-followup:` commits, final cross-cutting review before merge).

Explicitly **not** in this iteration's scope, despite being adjacent: ADR-0012's ESLint-and-`mapApi` follow-up, and the three stale `bundled-extensions.ts` ordering comments, which ADR-0012 queues for the asset abstraction v0 iteration.
