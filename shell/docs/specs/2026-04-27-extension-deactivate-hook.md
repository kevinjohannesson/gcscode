# Extension.deactivate?() hook

**Status:** Approved (2026-04-27)

## Context

The optional extension-side `deactivate?()` hook split off from B1 by design. B1 shipped the disposable-orchestration half (`registry.deactivate(extensionId)` iterates `subscriptionsByExtension` LIFO and disposes each). The other half — letting an extension run code that does not fit the Disposable shape (closing a connection, flushing a queue, awaiting a worker) — is shipping now because the named on-deck consumer (the real SITL listener) lands next iteration and needs to close a WebSocket on disable.

This iteration is the architectural foundation. No extension consumes the hook yet; the SITL stub uses only Disposables. The follow-up "real SITL listener" iteration is the first consumer, which is why the hook lands first as a clean isolated change before the listener's connection lifecycle adds complexity on top.

The shape is VS Code-aligned: `deactivate?(): void | Promise<void>`, no args, hook runs before disposables, errors caught and logged. The async-up effect propagates through `registry.deactivate(id)` and `manager.setEnabled(id, enabled)`, both of which become `Promise<void>`. `register` and `activate` stay sync — no async activate hook in this iteration.

## Decisions deliberately out of this iteration

- **Async `activate` / async `register`.** No `activate(): Promise<void>` overload, no `register(...): Promise<void>`. Trigger to revisit: an extension needs to do async work at boot before it can register contributions (e.g. fetch config). No consumer today.

- **CancellationToken or timeout for the hook.** VS Code does not have one and we do not need one yet. If a hook hangs, the deactivate promise hangs. Trigger to revisit: a hook in production hangs for long enough to be a problem.

- **Hook runs on shell shutdown.** No shell-shutdown code path exists today (browser SPA reloads naturally tear down everything). Trigger to revisit: a shell-shutdown / process-exit hook is added.

- **Hook re-registering disposables during deactivate.** If a hook calls `host.register*` while disposables are tearing down, the new disposable never gets cleaned up. We do not enforce against this; it is an extension-author bug. Trigger to revisit: this happens accidentally and produces a confusing leak.

- **Bulk `deactivateAll()` / shutdown orchestration.** Already deferred per B1 spec. Single-extension deactivate only.

- **Returning data from the hook.** Hook return type is `void | Promise<void>` — no values flow back. If a future caller wants telemetry from the deactivate path, that's its own iteration.

## VS Code alignment

Pure alignment iteration — no deliberate divergences.

| Concern                               | VS Code                        | Ours                                            | Notes                                                                                   |
| ------------------------------------- | ------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Optional `deactivate?()` on extension | ✓                              | ✓                                               | Aligned                                                                                 |
| Sync OR async hook                    | `void \| Thenable<void>`       | `void \| Promise<void>`                         | Aligned                                                                                 |
| Hook runs before disposables          | ✓                              | ✓                                               | Aligned                                                                                 |
| Hook errors do not block teardown     | ✓                              | ✓ — caught, logged, continue                    | Aligned (B1 posture extends to the hook)                                                |
| Hook receives no args                 | ✓                              | ✓                                               | Aligned                                                                                 |
| `registry.deactivate` becomes async   | ✓                              | ✓                                               | Aligned                                                                                 |
| Activate stays sync this iteration    | VS Code activate is also async | ✗ Deferred (no consumer for async activate yet) | Trigger to revisit: an extension that needs async work before registering contributions |

## Goals

- Add an optional `deactivate?(): void | Promise<void>` method to the `Extension` interface in `@gcscode/extension-api`. Backwards-compatible — existing extensions are unchanged.

- Modify `registry.activate(extension)` to retain the extension's `deactivate` hook (if present) in a parallel `Map<string, () => void | Promise<void>>`. The registry does NOT retain the Extension object itself — that stays the manager's responsibility per B2b's layered design.

- Change `registry.deactivate(extensionId)` from `void` to `Promise<void>`. Order of operations:
  1. Look up the stored hook (if any) and the subscriptions.
  2. If a hook exists: call it. If it returns a Promise, await it. Errors caught + logged + execution continues.
  3. Iterate subscriptions LIFO, calling `dispose()` on each. Per-disposable errors caught + logged (B1 invariant unchanged).
  4. Delete from both `subscriptionsByExtension` and `deactivateHooksByExtension`.

- Propagate the async-up to `manager.setEnabled(id, enabled): Promise<void>`. The disable path awaits `registry.deactivate(id)`; the enable path's `registry.activate(extension)` stays sync but the public `setEnabled` returns `Promise<void>` uniformly. The `onEnabledChanged` callback fires after the registry call resolves, before the manager's promise resolves.

- `manager.register(extension, options?)` and `registry.activate(extension)` stay synchronous. No consumer needs async at registration / activation time this iteration.

- Update `extension-manager.ts`'s internal `setEnabled` to `await` the registry call before flipping the enabled flag and firing the callback. The B2b invariant "registry call first, then store update, then callback" is preserved end-to-end.

- New tests in `registry.test.ts` covering: hook called on deactivate; sync hook; async hook awaited; hook fires before any disposable's `dispose()`; sync throw caught; async rejection caught; extension without hook behaves as before.

- One new test in `extension-manager.test.ts`: `manager.setEnabled(id, false)` awaits the hook before its own promise resolves.

- All existing tests that call `registry.deactivate(id)` or `manager.setEnabled(id, ...)` are updated to `await` those calls. No semantic test changes — only the `await` keyword.

- Doc propagation: `out-of-scope.md` removes the `Extension.deactivate?() hook` bullet (trigger satisfied). `roadmap.md` flips the unlettered hook line to checked and links this spec.

## Non-goals

- **Async `activate` / async `register`.** Both stay sync.
- **Hook receives any args (host, context, cancellation).** Hook signature is zero-arg.
- **Hook return value other than void / Promise<void>.** No data flows back.
- **Timeout / cancellation.** A hook can hang the deactivate.
- **Bulk teardown.**
- **Hook running on shell shutdown.** Browser reload tears everything down naturally.
- **Defensive guards against hooks calling `host.register*` during deactivate.** Anti-pattern, not enforced.
- **Changes to the `ExtensionPersistence` layer (B4) or the manifest layer (B4).** Persistence's `recordEnabledChange` callback fires from the manager's `onEnabledChanged` hook; that wiring is unchanged. The manager-side `await` on the registry call lands BEFORE `onEnabledChanged` fires, so persistence is written after deactivate completes.
- **Changes to `@gcscode/extension-example` or `@gcscode/extension-sitl`.** Neither defines a `deactivate` hook today; both continue to tear down purely through Disposables.
- **Renaming `Registry.activate` / `Registry.deactivate`.** Same posture as B2b/B4 — layered design over rename.

## Public API

### `@gcscode/extension-api`

```ts
export interface Extension {
  id: string;
  displayName: string;
  version: string;
  activate(context: ExtensionContext): void;
  deactivate?(): void | Promise<void>;
}
```

The `deactivate` method is optional. Hooks return `void` (sync no-op or short-running cleanup) or a `Promise<void>` (async cleanup like `await socket.close()`). The host awaits the returned value before tearing down disposables.

### `Registry` (signature change)

```ts
export interface Registry {
  activate(extension: Extension): void;
  deactivate(extensionId: string): Promise<void>; // ← was void
  // ... unchanged: listViews, listStatusBarItems, listCommands, listKeybindings, executeCommand
}
```

`activate` keeps `void` — the registry stores the optional hook from `extension.deactivate` if present, no behavior change otherwise.

`deactivate` now returns a `Promise<void>` that resolves when both the hook (if any) and all disposables have torn down. The throw-on-unknown-id behavior is unchanged: if `extensionId` is not in `subscriptionsByExtension`, the returned promise rejects with the existing error message.

### `ExtensionManager` (signature change)

```ts
export interface ExtensionManager {
  register(extension: Extension, options?: { enabled?: boolean }): void; // unchanged
  setEnabled(id: string, enabled: boolean): Promise<void>; // ← was void
  listExtensions(): readonly ExtensionRecord[]; // unchanged
}
```

`setEnabled`'s contract:

- Same-value no-op: returns a resolved `Promise<void>` immediately. The `onEnabledChanged` callback does NOT fire.
- Disable path (`enabled: false`): awaits `registry.deactivate(id)`, then performs the `extensions.set(id, ...)` SvelteMap update, then invokes the `onEnabledChanged` callback. The returned promise resolves after all three steps.
- Enable path (`enabled: true`): calls the synchronous `registry.activate(state.extension)`, then `extensions.set`, then `onEnabledChanged`. Returned promise resolves immediately (no async work).
- Unknown id: returns a rejected `Promise<void>` with the existing error message.

## Implementation sketches

### `@gcscode/extension-api/src/index.ts`

One added line on the `Extension` interface:

```ts
export interface Extension {
  id: string;
  displayName: string;
  version: string;
  activate(context: ExtensionContext): void;
  deactivate?(): void | Promise<void>;
}
```

### `packages/shell/src/extension-host/registry.ts`

A new private map alongside `subscriptionsByExtension`. The `activate` and `deactivate` methods are extended to use it.

```ts
const subscriptionsByExtension = new Map<string, readonly Disposable[]>();
const deactivateHooksByExtension = new Map<string, () => void | Promise<void>>();
```

Inside `activate(extension)`, after storing subscriptions:

```ts
extension.activate(context);
subscriptionsByExtension.set(identity.id, context.subscriptions);
if (extension.deactivate) {
  deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
}
```

The `.bind(extension)` preserves any `this` reference the hook expects. The conditional `if (extension.deactivate)` is the only check — if absent, no entry is stored.

Inside `deactivate(extensionId)`:

```ts
async deactivate(extensionId) {
  const subscriptions = subscriptionsByExtension.get(extensionId);
  if (subscriptions === undefined) {
    throw new Error(`Cannot deactivate extension: id "${extensionId}" is not active.`);
  }

  const hook = deactivateHooksByExtension.get(extensionId);
  if (hook !== undefined) {
    try {
      await hook();
    } catch (error) {
      console.error(`Error in extension "${extensionId}" deactivate hook:`, error);
    }
  }

  for (let i = subscriptions.length - 1; i >= 0; i--) {
    try {
      subscriptions[i].dispose();
    } catch (error) {
      console.error(`Error disposing subscription for extension "${extensionId}":`, error);
    }
  }

  subscriptionsByExtension.delete(extensionId);
  deactivateHooksByExtension.delete(extensionId);
}
```

Notes:

- Hook runs FIRST (line `await hook()`), before the disposables loop. This matches VS Code's posture — extension's deactivate sees the world before the registry tears it down.
- Hook errors caught with `try/catch`. `await hook()` covers both sync throws (caught by the try block) and async rejections (caught when the awaited promise rejects).
- Disposable errors stay caught per-disposable (B1's invariant). Hook errors and disposable errors are independent — one does not skip the other.
- Both maps are cleared at the end. The throw-on-unknown-id remains the first check.
- The `void` return of a sync hook (`hook()` returns `undefined`) is a no-op when awaited — `await undefined` is `undefined`, no extra microtask cost. Async hooks (returning a Promise) get awaited normally.

### `packages/shell/src/extension-host/extension-manager.ts`

`setEnabled` becomes async. The `onEnabledChanged` callback fires AFTER the registry call's promise resolves AND the SvelteMap update lands.

```ts
async setEnabled(id, enabled) {
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
    await registry.deactivate(id);
  }
  extensions.set(id, { ...state, enabled });
  onEnabledChanged?.(id, enabled);
}
```

The `register` method is unchanged from B4 — still sync, still calls `registry.activate(extension)` directly.

The `onEnabledChanged` callback timing:

- Same-value no-op: NOT called (early return before).
- Enable: called synchronously after `extensions.set`, in the same microtask as the function entry.
- Disable: called after `await registry.deactivate(id)` resolves. From the caller's perspective, `await manager.setEnabled(id, false)` resolves AFTER the persistence callback has run.

This means the B4 persistence layer's `recordEnabledChange` runs AFTER the WebSocket has been closed (in the SITL listener case). That ordering is correct: the source of truth (extension's actual state) settles before the persisted record updates.

## Failure-handling carryover from B1 / B2b

- **Sync throw in hook**: the `try/catch` around `await hook()` catches it. Logged with the extension id. Disposable teardown proceeds.
- **Async rejection in hook**: the `await` rethrows the rejection inside the `try` block, which catches it. Logged with the extension id. Disposable teardown proceeds.
- **Throw in `dispose()`**: caught per-disposable (B1's existing pattern). Other disposables continue to tear down.
- **Throw / rejection in `register*` calls during the hook**: anti-pattern (the hook should not be calling `host.register*`). If it happens, the new disposable lands in the contribution maps but is never recorded in `subscriptions` and is never disposed. This is a footgun we are not guarding against — same posture as B1's note on "register\* calls during deactivate."
- **Manager-side**: a thrown / rejected `setEnabled` (e.g. unknown id) leaves the manager's enabled flag at its prior value. The `extensions.set` and `onEnabledChanged` lines run only after a successful `await registry.deactivate(id)`.

## Tests

### `packages/shell/src/extension-host/registry.test.ts`

**New tests (≈6, all marked `async` and using `await`):**

1. `deactivate calls the extension's deactivate hook` — extension defines a `vi.fn()` hook; assert it was called once after `await registry.deactivate(id)`.
2. `deactivate awaits an async deactivate hook` — extension's hook returns a Promise that resolves on a deferred resolver; assert the registry's deactivate promise does NOT resolve until the hook's promise does (use a tracking flag plus `flushSync` / microtask timing assertion).
3. `deactivate hook runs before disposables` — extension's hook spy AND a disposable's dispose spy both record the call order in a shared array; assert the hook's record comes first.
4. `sync throw in deactivate hook is caught and disposables still run` — hook throws synchronously; assert `console.error` was called with the extension id; assert the disposable's dispose was still called; assert the registry's deactivate promise resolves successfully.
5. `async rejection in deactivate hook is caught and disposables still run` — hook returns `Promise.reject(...)`; same assertions as test 4.
6. `extension without a deactivate hook behaves as before` — no hook defined; assert disposables run, registry maps cleared, no console.error called for the hook.

**Modifications to existing tests:** every existing test that calls `registry.deactivate(id)` is converted to `await registry.deactivate(id)`. The test functions become `async`. No semantic changes.

**Existing test count adjustments:** the suite grows from 44 to 50 tests. All existing tests still pass once awaited.

### `packages/shell/src/extension-host/extension-manager.test.ts`

**New test (1):**

- `setEnabled(id, false) awaits the deactivate hook before resolving` — extension defines an async hook with a deferred resolver; call `manager.setEnabled(id, false)` (do not yet await); assert `onEnabledChanged` callback has NOT fired; resolve the hook's promise; await the setEnabled promise; assert the callback HAS now fired with `(id, false)`.

**Modifications:** every test that calls `manager.setEnabled(id, ...)` is converted to `await manager.setEnabled(id, ...)`. The test functions become `async`. No semantic changes to the existing 13 tests.

The "same-value setEnabled is a true no-op" test stays as-is in spirit but with `await`. The early return makes the promise resolve synchronously; no await would technically work, but adding `await` is consistent and harmless.

### `packages/shell/src/app.test.ts`

The post-mount-deactivation test calls `registry.deactivate('test')` and asserts on the rendered DOM after `flushSync()`. This test is updated to `await registry.deactivate('test')` before the `flushSync()` call. No semantic change.

### Other test files

`extension-manifest.test.ts`, `extension-persistence.test.ts`, `keybinding-dispatcher.test.ts`, `extension-example/src/index.test.ts`, `extension-sitl/src/index.test.ts` — unaffected. None of them call `registry.deactivate` or `manager.setEnabled` directly.

## Files modified / added

| Path                                                          | Change                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-api/src/index.ts`                         | Add optional `deactivate?(): void \| Promise<void>` to the `Extension` interface. ~3 lines.                                                                                                                                              |
| `packages/shell/src/extension-host/registry.ts`               | Add `deactivateHooksByExtension` map. Modify `activate` to store the hook conditionally. Modify `deactivate` to be async, call hook with try/catch, then iterate disposables. Update Registry interface signature. ~30 lines net change. |
| `packages/shell/src/extension-host/registry.test.ts`          | Add 6 new tests for hook behavior. Convert existing tests' `deactivate` calls to `await deactivate`. ~80 lines added, ~30 lines modified.                                                                                                |
| `packages/shell/src/extension-host/extension-manager.ts`      | Make `setEnabled` async with `await registry.deactivate(id)` on the disable path. Update the `ExtensionManager` interface signature. ~5 lines net change.                                                                                |
| `packages/shell/src/extension-host/extension-manager.test.ts` | Add 1 new test for hook-await timing. Convert existing tests' `setEnabled` calls to `await setEnabled`. ~15 lines added, ~25 lines modified.                                                                                             |
| `packages/shell/src/app.test.ts`                              | Convert the post-mount-deactivation test's `registry.deactivate('test')` to `await registry.deactivate('test')`. ~1 line modified.                                                                                                       |
| `docs/out-of-scope.md`                                        | Remove the `Extension.deactivate?() hook` bullet entirely. Detail in propagation section below.                                                                                                                                          |
| `docs/roadmap.md`                                             | Flip the unlettered `Extension.deactivate?() hook` line to checked, link this spec. Detail in propagation section below.                                                                                                                 |

No changes to:

- `@gcscode/extension-example` — no deactivate hook needed; tears down purely through Disposables.
- `@gcscode/extension-sitl` — same.
- `packages/shell/src/main.ts` — bootstrap unchanged.
- `packages/shell/src/app.svelte` — UI unchanged.
- `packages/shell/src/keybinding-dispatcher.ts` or its tests.
- `packages/shell/src/extension-host/extension-manifest.ts`, `extension-persistence.ts`, `extension-persistence.test.ts`, `extension-manifest.test.ts` — none of them call `registry.deactivate` or `manager.setEnabled`.
- Any ADR. ADR-0003's Phase B retrospective will refresh alongside the merge, mirroring the B1/B2a/B2b/B4 precedent.

## `docs/out-of-scope.md` propagation

The current `Extension.deactivate?() hook` bullet (under "Extension machinery") begins with `- **\`Extension.deactivate?()\` hook (non-disposable / async cleanup).\*\*`and ends with`Dev-time hot reload is still deferred (Phase B3 — separate iteration). (ADR-0003)` (post-B2b state).

Remove this bullet entirely. The trigger condition (named consumer needing it — the SITL listener) is satisfied. The "Dev-time hot reload" content in the trailing sentence is already covered by the existing `Hot module reload for extensions` bullet on the next line; no information is lost by removing the deactivate-hook bullet.

The `Hot module reload for extensions` bullet, the `Declarative \`contributes\` manifest`bullet, the`Activation events / lazy activation`bullet, the`Capability / permission declarations`bullet, the`registry.deactivateAll()` bullet, and all other entries stay unchanged.

## `docs/roadmap.md` propagation

The current entry under "Phase B — Lifecycle and cleanup" reads:

```md
- [ ] **`Extension.deactivate?()` hook** — optional extension-side hook for non-disposable / async cleanup. Split off from B1 by design. Trigger: first extension needing it (named on-deck consumer: SITL listener — see Feature extensions below).
```

Replace with:

```md
- [x] **`Extension.deactivate?()` hook** — optional `deactivate?(): void | Promise<void>` on `Extension`; `registry.deactivate(id)` and `manager.setEnabled(id, ...)` become async. Spec: [`specs/2026-04-27-extension-deactivate-hook.md`](specs/2026-04-27-extension-deactivate-hook.md)
```

The B1, B2a, B2b, B3, and B4 lines stay unchanged. Phase A and Phase C sections, the Feature extensions section, and the Maintenance section are unchanged.

## Verification

- `pnpm check` clean across all 4 packages.
- `pnpm test` — all existing tests pass after the `await` updates; new hook tests in `registry.test.ts` (6 new, total 50) and `extension-manager.test.ts` (1 new, total 14) pass. Workspace total grows from 108 to 115.
- `pnpm lint` clean.
- `pnpm --filter @gcscode/shell build` succeeds.
- `pnpm dev` smoke test: app boots; example + SITL views render; both keybindings (`Alt+Shift+G`, `Alt+Shift+L`) log to console; no errors. The hook is not exercised at runtime by either bundled extension; the dev-server check confirms the async-up did not regress boot behavior.

## Follow-ups (out of scope for this iteration)

- **Real SITL listener iteration.** The named on-deck consumer. Defines a `deactivate` hook that closes its WebSocket. Adds a Python WebSocket bridge in the user's `Drone SITL` repo. Replaces `SITL_LOCATION` with a reactive telemetry store. Iteration 2 of the SITL arc.
- **Async `activate` / async `register`.** When an extension needs async work at boot. Trigger: first such consumer.
- **CancellationToken / timeout for the hook.** When a hook in production hangs long enough to be a problem.
- **Shell-shutdown orchestration.** When a shell-shutdown / process-exit code path is added.
- **Bulk `deactivateAll()`.** When a host-driven shutdown path or test harness needs ordered bulk teardown.
- **Defensive guards against hook re-registration.** When the anti-pattern is observed in practice.
- **Returning data from the hook.** When telemetry from the deactivate path becomes useful.

## Cross-cutting notes

**Hook-first ordering vs disposables-first.** VS Code calls the extension's `deactivate` BEFORE disposing subscriptions. Our implementation matches. The reasoning: the hook is the escape valve for non-disposable resources; it sees the world while disposables are still registered, then the registry tears down. If this ordering ever surfaces a real consumer problem, we revisit then.

**Async-up boundary.** `registry.deactivate` and `manager.setEnabled` go async; `registry.activate`, `manager.register`, and the `register*` factories all stay sync. The async boundary is "any operation that might call a user-supplied async function" — which today is only the deactivate hook. When async activate lands (its own iteration), the boundary extends.

**Hook is bound at activate time.** `extension.deactivate.bind(extension)` is called once during `registry.activate(...)` and stored. The bound function captures the extension's `this` reference at that moment. If the extension somehow mutates its prototype after activate, the captured hook still calls into the original method. This is conventional — same posture as `register*` callbacks.

**`subscriptionsByExtension` and `deactivateHooksByExtension` are parallel maps.** A single combined `activeExtensions: Map<string, { subscriptions; deactivateHook? }>` would be marginally more compact but would touch every read/write of the existing map and risk regression in B1's well-tested orchestration. The parallel-map choice keeps the diff small and the existing subscriptions logic byte-identical.

**SvelteMap is unchanged.** The contribution maps stay `SvelteMap` (B2a's invariant). The two new maps in this iteration (`subscriptionsByExtension`, `deactivateHooksByExtension`) are plain `Map` — no UI consumer reads either, the registry uses them internally for orchestration.

**Test fixture pattern: deferred async hooks.** Tests that verify async-hook awaiting use a "deferred resolver" pattern: `let resolveHook!: () => void; const hookPromise = new Promise<void>((res) => { resolveHook = res });` then the hook returns `hookPromise`. The test calls `setEnabled` (does not await), asserts mid-flight state, then calls `resolveHook()` and awaits the setEnabled promise. This pattern decouples test timing from real-clock delays.
