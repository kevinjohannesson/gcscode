# Extension.deactivate?() hook implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `deactivate?(): void | Promise<void>` to the `Extension` interface, then make `registry.deactivate(id)` and `manager.setEnabled(id, ...)` async so the hook can be awaited. Hook fires before disposables, errors caught + logged, B1's per-disposable resilience preserved.

**Architecture:** One additive line on the `Extension` interface in `@gcscode/extension-api`. A new parallel `Map<string, () => void | Promise<void>>` in the registry alongside the existing `subscriptionsByExtension`. `registry.activate` stores the hook conditionally; `registry.deactivate` becomes async, calls the hook first (try/catch around `await hook()`), then iterates disposables LIFO as before. The async-up propagates to `manager.setEnabled` which awaits the registry call before flipping the SvelteMap entry and firing `onEnabledChanged`. `register` and `activate` stay sync — no async-activate consumer in this iteration.

**Tech Stack:** TypeScript, Vitest, Svelte 5 (no UI changes), pnpm workspaces.

**Spec:** `docs/specs/2026-04-27-extension-deactivate-hook.md` (commit `4e523b1`). The spec is the canonical reference for code shapes, test cases, and implementation sketches. This plan sequences the work, gives exact commands and commit messages, and points at spec sections rather than re-pasting their contents.

**ADRs to be aware of:** ADR-0001 (workspace boundary — interface change lands in `@gcscode/extension-api`), ADR-0002 (imperative activate API — unchanged), ADR-0003 (Phase B framing — this iteration ships the deactivate-hook half that B1 split off), ADR-0004 (extension rename — code uses `Extension`/`extension-api` throughout). No ADR is modified; ADR-0003's Phase B retrospective will refresh alongside the merge.

---

## File structure

| Path                                                          | Responsibility                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/extension-api/src/index.ts`                         | Add optional `deactivate?(): void \| Promise<void>` to the `Extension` interface. (Task 2.)                                                                                                            |
| `packages/shell/src/extension-host/registry.ts`               | Add `deactivateHooksByExtension` map. Modify `activate` to store the hook conditionally. Make `deactivate` async with hook-first / disposables-second ordering. Update `Registry` interface. (Task 3.) |
| `packages/shell/src/extension-host/registry.test.ts`          | Add 6 new tests covering hook semantics. Convert existing `registry.deactivate(id)` calls to `await`. (Task 3.)                                                                                        |
| `packages/shell/src/app.test.ts`                              | Convert the post-mount-deactivation test's `registry.deactivate('test')` to `await`. (Task 3.)                                                                                                         |
| `packages/shell/src/extension-host/extension-manager.ts`      | Make `setEnabled` async. `await registry.deactivate(id)` on the disable path. Update `ExtensionManager` interface signature. (Task 4.)                                                                 |
| `packages/shell/src/extension-host/extension-manager.test.ts` | Add 1 new test covering hook-await timing. Convert existing `manager.setEnabled(id, ...)` calls to `await`. (Task 4.)                                                                                  |
| `docs/out-of-scope.md`                                        | Remove the `Extension.deactivate?() hook` bullet entirely. (Task 5.)                                                                                                                                   |
| `docs/roadmap.md`                                             | Flip the unlettered `Extension.deactivate?() hook` line to checked, link this spec. (Task 5.)                                                                                                          |

No changes to `@gcscode/extension-example`, `@gcscode/extension-sitl`, `packages/shell/src/main.ts`, `packages/shell/src/app.svelte`, `packages/shell/src/keybinding-dispatcher.ts` or its test, `packages/shell/src/extension-host/extension-manifest.ts`, `extension-manifest.test.ts`, `extension-persistence.ts`, `extension-persistence.test.ts`, or any ADR.

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on the feature branch**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/extension-deactivate-hook`. If branch is `master`, stop and ask the controller.

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 108 tests pass — 102 in `@gcscode/shell` (44 in `registry.test.ts`, 8 in `app.test.ts`, 27 in `keybinding-dispatcher.test.ts`, 13 in `extension-manager.test.ts`, 8 in `extension-persistence.test.ts`, 2 in `extension-manifest.test.ts`), 3 in `@gcscode/extension-example`, 3 in `@gcscode/extension-sitl`.

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Add `deactivate?()` to the `Extension` interface

**Files:**

- Modify: `packages/extension-api/src/index.ts`

This is a one-line additive interface change. No new tests in `@gcscode/extension-api` (the package has no test files today; the change is purely a type declaration).

- [ ] **Step 1: Add the optional `deactivate` method to the `Extension` interface**

Implement per spec section "Public API → `@gcscode/extension-api`" — add `deactivate?(): void | Promise<void>;` immediately after `activate(context: ExtensionContext): void;` on the `Extension` interface. The full target shape is in the spec.

No other interfaces in `@gcscode/extension-api` change.

- [ ] **Step 2: Run check across the workspace**

Run: `pnpm check`
Expected: clean. The interface addition is backwards-compatible — every existing extension (`extension-example`, `extension-sitl`) is unchanged because `deactivate?` is optional. The shell's `extension-manager.ts` types continue to compile because the registry's `Registry.deactivate` signature change comes in Task 3.

- [ ] **Step 3: Run tests + lint**

Run: `pnpm test && pnpm lint`
Expected: 108 tests pass (no test changes); lint clean.

- [ ] **Step 4: Commit**

```bash
git add packages/extension-api/src/index.ts
git commit -m "$(cat <<'EOF'
feat(extension-api): add optional deactivate?() to Extension

Adds deactivate?(): void | Promise<void> to the Extension interface.
Optional and backwards-compatible — existing extensions are
unchanged. The host-side orchestration that calls this hook ships
in the registry change next.

Spec: docs/specs/2026-04-27-extension-deactivate-hook.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Registry — store hook + async deactivate (TDD)

**Files:**

- Modify: `packages/shell/src/extension-host/registry.ts`
- Modify: `packages/shell/src/extension-host/registry.test.ts`
- Modify: `packages/shell/src/app.test.ts`

This task ships the orchestration half of the hook plus updates existing test call sites for the now-async `registry.deactivate`. Six new tests + existing-test `await` updates land together in one commit.

- [ ] **Step 1: Write the 6 failing hook tests**

Append the new tests to `packages/shell/src/extension-host/registry.test.ts` per spec section "Tests → `packages/shell/src/extension-host/registry.test.ts` → New tests". The six cases:

1. `deactivate calls the extension's deactivate hook` — extension defines a `vi.fn()` hook; `await registry.deactivate(id)`; assert hook called once.
2. `deactivate awaits an async deactivate hook` — extension's hook returns a `Promise` from a deferred resolver; assert the registry's deactivate promise does not resolve until the hook's promise does (use the deferred-resolver pattern documented in the spec's "Cross-cutting notes → Test fixture pattern: deferred async hooks").
3. `deactivate hook runs before disposables` — both the hook and a disposable's `dispose` push to a shared array; assert the hook's record comes first.
4. `sync throw in deactivate hook is caught and disposables still run` — hook throws synchronously; assert `console.error` was called with the extension id; assert the disposable's dispose was still called; assert `await registry.deactivate(id)` resolved successfully.
5. `async rejection in deactivate hook is caught and disposables still run` — hook returns `Promise.reject(...)`; same assertions as test 4.
6. `extension without a deactivate hook behaves as before` — no hook defined; assert disposables run, registry maps cleared, `console.error` was NOT called for the hook.

Each new test is `async`. The existing fixture pattern (`extension(id, activate)` helper from `registry.test.ts:16`) extends naturally; for tests that need a deactivate hook, use a small augmented helper inline (or a parallel `extensionWithHook(id, activate, deactivate)` helper).

For tests 4 and 5: spy on `console.error` via `vi.spyOn(console, 'error').mockImplementation(() => {})`; restore in a `try/finally` or via `mockRestore()` at the end of the test. Pattern-match `extension-example/src/index.test.ts:74-76` for the spy/restore idiom.

- [ ] **Step 2: Update existing tests in `registry.test.ts` to `await registry.deactivate(...)` calls**

Find every test that currently calls `registry.deactivate(extensionId)` (sync). Convert each to `await registry.deactivate(extensionId)` and make the surrounding `it(...)` callback `async`. No other changes to the test logic.

The grep pattern to find them: `registry.deactivate(` inside `registry.test.ts`. Update every match. (Today this is approximately 6–10 call sites in the existing 44 tests.)

- [ ] **Step 3: Update `app.test.ts`'s post-mount-deactivation test**

In `packages/shell/src/app.test.ts`, find the test `reflects post-mount view deactivation in the rendered UI`. Change `registry.deactivate('test');` to `await registry.deactivate('test');` and make the `it` callback `async`. The `flushSync()` call afterwards stays as-is.

- [ ] **Step 4: Run the full suite, expect compilation errors first then test failures**

Run: `pnpm --filter @gcscode/shell test`
Expected at this stage: TypeScript / Vitest report errors because `registry.deactivate(id)` is still typed as returning `void` while the new tests `await` it. The 6 new hook tests fail outright. The compile errors and test failures together are the red state.

- [ ] **Step 5: Modify `registry.ts` per spec — add hook map, change deactivate to async**

Implement per spec section "Implementation sketches → `packages/shell/src/extension-host/registry.ts`":

1. Add `const deactivateHooksByExtension = new Map<string, () => void | Promise<void>>();` next to the existing `subscriptionsByExtension` declaration. The new map stays a plain `Map` (no UI consumer reads it; same posture as `subscriptionsByExtension`).

2. Inside the existing `activate(extension)` method body, after `subscriptionsByExtension.set(identity.id, context.subscriptions);`, add the conditional hook-store:

   ```ts
   if (extension.deactivate) {
     deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
   }
   ```

3. Replace the existing `deactivate(extensionId)` method body with the async version per the spec's implementation sketch. Order of operations: throw-on-unknown first; then `await hook()` inside try/catch (catching both sync throws and async rejections); then the existing LIFO dispose loop with its existing per-disposable try/catch; then delete from BOTH maps. Make the method `async`.

4. Update the `Registry` interface signature: `deactivate(extensionId: string): Promise<void>` (was `void`).

The existing invariant comment at the top of `createRegistry` does not need to change — the four contribution maps are still `SvelteMap`; the two new private maps are still plain `Map`. If the implementer judges the comment needs an updating sentence, that's a small addition; do not rewrite the existing wording.

- [ ] **Step 6: Run tests, expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: 108 shell tests pass — 50 in `registry.test.ts` (44 existing + 6 new), 8 in `app.test.ts`, plus the unchanged keybinding/manager/persistence/manifest counts. The total workspace test count is 114 (108 shell + 3 example + 3 sitl).

If a test about "extension without a deactivate hook" reports `console.error` was called when it shouldn't have, the implementer added an unconditional log; revisit the implementation to ensure the try/catch only wraps the hook call.

- [ ] **Step 7: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean. The `Registry` interface signature change to `Promise<void>` is what TypeScript-checks the test `await` calls against. `extension-manager.ts` still compiles because it calls `registry.deactivate(id)` without await; the returned `Promise<void>` is implicitly discarded — legal TypeScript. The manager's update lands in Task 4.

- [ ] **Step 8: Commit**

```bash
git add packages/shell/src/extension-host/registry.ts packages/shell/src/extension-host/registry.test.ts packages/shell/src/app.test.ts
git commit -m "$(cat <<'EOF'
feat(shell): async registry.deactivate + Extension.deactivate?() hook

Add deactivateHooksByExtension parallel Map alongside the existing
subscriptionsByExtension. registry.activate stores extension.deactivate
(bound) if present; registry.deactivate is now async and calls the
hook FIRST (try/catch around await hook()), then iterates disposables
LIFO with B1's per-disposable resilience pattern, then clears both
maps.

Order: VS Code-aligned (hook then disposables). Errors: hook errors
caught + logged, do not block disposable teardown. Disposable errors
stay caught per-disposable as in B1.

Six new tests in registry.test.ts cover: hook is called, async hook
awaited, hook fires before disposables, sync throw in hook caught,
async rejection in hook caught, extension without hook behaves as
before. Existing tests in registry.test.ts and app.test.ts updated
to await registry.deactivate(...) — no semantic test changes.

extension-manager.ts still calls registry.deactivate without await;
the returned Promise<void> is implicitly discarded (legal TypeScript).
The manager update lands in the next commit.

Spec: docs/specs/2026-04-27-extension-deactivate-hook.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ExtensionManager — async setEnabled awaiting deactivate

**Files:**

- Modify: `packages/shell/src/extension-host/extension-manager.ts`
- Modify: `packages/shell/src/extension-host/extension-manager.test.ts`

This task propagates the async-up to the manager and adds one new test covering the hook-await timing through the manager's surface.

- [ ] **Step 1: Write the new failing test**

Append the new test to `packages/shell/src/extension-host/extension-manager.test.ts` per spec section "Tests → `packages/shell/src/extension-host/extension-manager.test.ts` → New test (1)". The case:

- `setEnabled(id, false) awaits the deactivate hook before resolving` — extension's hook returns a Promise from a deferred resolver. Construct the manager with an `onEnabledChanged: vi.fn()` callback. Register the extension. Call `manager.setEnabled(id, false)` but DO NOT await yet. Assert the callback has NOT fired and `manager.listExtensions()` still shows `enabled: true`. Resolve the hook's promise. `await` the setEnabled promise. Assert the callback HAS now fired with `(id, false)` and `manager.listExtensions()` shows `enabled: false`.

The deferred-resolver pattern is documented in the spec's "Cross-cutting notes → Test fixture pattern: deferred async hooks". The test fixture for extensions with a deactivate hook can be a small augmentation of the existing `makeViewExtension(id)` helper or a separate `makeViewExtensionWithDeactivate(id, deactivate)` helper.

- [ ] **Step 2: Update existing tests in `extension-manager.test.ts` to `await manager.setEnabled(...)` calls**

Find every test that currently calls `manager.setEnabled(id, ...)` (sync). Convert each to `await manager.setEnabled(id, ...)` and make the surrounding `it(...)` callback `async`. No other changes to the test logic.

The grep pattern to find them: `manager.setEnabled(` inside `extension-manager.test.ts`. Update every match. (Today this is approximately 5–7 call sites in the existing 13 tests.)

The "same-value setEnabled is a true no-op" test needs special attention: `setEnabled(id, true)` (already true) and `setEnabled(id, false)` followed by `setEnabled(id, false)` again — all four call sites need `await`. The early-return path makes the promise resolve in the same microtask as it's created, so the `await` is harmless but consistent.

- [ ] **Step 3: Run the suite, expect TypeScript or test failures**

Run: `pnpm --filter @gcscode/shell test`
Expected at this stage: the new hook-await test fails (manager.setEnabled is still sync; `await` on it works, but the test's mid-flight assertion will see post-deactivate state because the manager doesn't await the registry call). Some existing manager tests may still pass.

- [ ] **Step 4: Modify `extension-manager.ts` per spec — async setEnabled with await**

Implement per spec section "Implementation sketches → `packages/shell/src/extension-host/extension-manager.ts`":

1. Make the `setEnabled(id, enabled)` method `async`.
2. Replace the disable-branch's `registry.deactivate(id)` with `await registry.deactivate(id)`.
3. The enable-branch's `registry.activate(state.extension)` stays sync (no `await` keyword needed — `registry.activate` returns `void`).
4. The `extensions.set(id, ...)` and `onEnabledChanged?.(id, enabled)` calls remain in their current order, AFTER the registry call. The `await` on the disable path is what makes the SvelteMap update and callback fire after the deactivate work resolves.

Update the `ExtensionManager` interface signature: `setEnabled(id: string, enabled: boolean): Promise<void>` (was `void`).

`register` and `createExtensionManager` and the `register*` factories are unchanged.

- [ ] **Step 5: Run the manager tests, expect pass**

Run: `pnpm --filter @gcscode/shell test extension-manager`
Expected: 14 tests pass (13 existing + 1 new).

- [ ] **Step 6: Run the full shell suite**

Run: `pnpm --filter @gcscode/shell test`
Expected: 109 shell tests pass (50 registry + 8 app + 27 keybinding + 14 manager + 8 persistence + 2 manifest). Workspace total: 115 (109 shell + 3 example + 3 sitl).

- [ ] **Step 7: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean. The `ExtensionManager.setEnabled` signature change to `Promise<void>` is propagated through main.ts's wiring, but main.ts does not currently call `setEnabled`, so no main.ts change is needed.

- [ ] **Step 8: Commit**

```bash
git add packages/shell/src/extension-host/extension-manager.ts packages/shell/src/extension-host/extension-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(shell): async manager.setEnabled awaiting deactivate hook

Make ExtensionManager.setEnabled async. The disable path now awaits
registry.deactivate(id) before flipping the SvelteMap entry and
firing onEnabledChanged. The enable path still calls the synchronous
registry.activate; the public setEnabled returns Promise<void>
uniformly.

The B2b invariant "registry call first, then store update, then
callback" is preserved end-to-end through the await. Persistence's
recordEnabledChange (via onEnabledChanged) now fires AFTER the
deactivate hook has resolved — correct ordering for the SITL
listener case where the WebSocket close completes before the
disabled state is persisted.

One new test covers hook-await timing through the manager's surface.
Existing 13 tests updated to await setEnabled — no semantic test
changes.

register, createExtensionManager, and the register* factories are
unchanged.

Spec: docs/specs/2026-04-27-extension-deactivate-hook.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Doc propagation

**Files:**

- Modify: `docs/out-of-scope.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Remove the `Extension.deactivate?() hook` bullet from `docs/out-of-scope.md`**

Open `docs/out-of-scope.md`. Find the bullet that begins with `- **\`Extension.deactivate?()\` hook (non-disposable / async cleanup).\*\*` (currently around line 12, in the "Extension machinery" section). Delete the entire bullet — the whole line including the trailing newline. Per spec section "`docs/out-of-scope.md`propagation", the trigger condition (named consumer needing it — the SITL listener) is satisfied; no replacement bullet is needed because the residual content (HMR being deferred) is already covered by the`Hot module reload for extensions` bullet on the next line.

The `Hot module reload for extensions` bullet, the `Declarative \`contributes\` manifest`bullet, the`Activation events / lazy activation`bullet, the`Capability / permission declarations`bullet, the`registry.deactivateAll()` bullet, and all other entries stay unchanged.

- [ ] **Step 2: Flip the `Extension.deactivate?()` hook line in `docs/roadmap.md`**

Open `docs/roadmap.md`. Find the unlettered hook line in the "Phase B — Lifecycle and cleanup" section (currently right after the B4 line). The exact before/after content is in spec section "`docs/roadmap.md` propagation" — copy the after-line verbatim.

The B1, B2a, B2b, B3, and B4 lines stay unchanged. Phase A and Phase C sections, the Feature extensions section, and the Maintenance section are unchanged.

- [ ] **Step 3: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: both clean. Prettier may reflow long lines in either doc; benign.

- [ ] **Step 4: Commit**

```bash
git add docs/out-of-scope.md docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs: propagate deactivate-hook ship + flip roadmap line

docs/out-of-scope.md:
- Remove the Extension.deactivate?() hook bullet entirely. The trigger
  (named consumer needing it — the SITL listener) is satisfied. The
  residual HMR-deferred mention is already covered by the Hot module
  reload for extensions bullet on the next line.

docs/roadmap.md:
- Flip the unlettered "Extension.deactivate?() hook" line to checked
  with a one-line summary plus a link to this spec. B1, B2a, B2b, B3,
  B4 lines unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. Workspace test count: 115 (109 shell + 3 example + 3 sitl). The shell breakdown is 50 registry + 8 app + 27 keybinding + 14 manager + 8 persistence + 2 manifest.

- [ ] **Step 2: Production build smoke test**

Run: `pnpm --filter @gcscode/shell build`
Expected: build succeeds. Bundle size delta should be modest (the new map + the small async additions). The `console.error` calls are fine to keep in production for now — they help diagnose extension-author bugs.

- [ ] **Step 3: Optional dev server smoke test**

Run: `pnpm dev` (in the background) and open `http://localhost:5173/` in a browser. Confirm:

- App boots; both example and SITL views render.
- `Alt+Shift+G` and `Alt+Shift+L` keybindings still log correctly.
- No errors or warnings in the browser console.
- The hook itself is not exercised by either bundled extension (neither defines a `deactivate` hook) — this smoke test confirms the async-up did NOT regress boot or runtime behavior.

If browser unavailable, the test suites cover the substantive paths.

Stop the background `pnpm dev` process when done.

- [ ] **Step 4: Confirm clean tree and feature commits**

Run: `git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. Branch contains 4 new commits beyond master (Tasks 2, 3, 4, 5), plus any `Code-review-followup:` commits the controller adds during the per-task review loop.

---

## Out of scope reminders

These are intentionally NOT part of this iteration (see the spec):

- **Async `activate` / async `register`.** Both stay sync.
- **Hook receiving any args (host, context, cancellation token, timeout).** Hook signature is zero-arg, returns `void | Promise<void>`.
- **Hook return value beyond void / Promise<void>.** No data flows back.
- **Bulk `deactivateAll()`.** Already deferred per B1 spec.
- **Hook running on shell shutdown.** No shell-shutdown code path exists yet.
- **Defensive guards against hooks calling `host.register*` during deactivate.** Anti-pattern, not enforced.
- **Changes to `@gcscode/extension-example`, `@gcscode/extension-sitl`, the manifest, the persistence layer, `main.ts`, or the keybinding dispatcher.**
- **Renaming `Registry.activate` / `Registry.deactivate`.** Same posture as B2b/B4.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on the parallel-map choice

The implementation uses two parallel maps (`subscriptionsByExtension` + `deactivateHooksByExtension`) rather than collapsing them into one `activeExtensions: Map<string, { subscriptions; deactivateHook? }>`. The collapse would touch every read/write of the existing subscriptions map and risks regression in B1's well-tested orchestration. The parallel-map choice keeps the diff small and the existing subscriptions logic byte-identical. If a future review wants the consolidation, that's a separate refactor.

## Cross-cutting note on async-up boundary

After this iteration: `registry.deactivate` and `manager.setEnabled` are async; `registry.activate`, `manager.register`, and the four `register*` factories all stay sync. The async boundary is "any operation that might call a user-supplied async function" — which today is only the deactivate hook. When async activate lands (its own iteration), the boundary extends. Do not pre-emptively async-up the sync surfaces.

## Cross-cutting note on hook-binding

`extension.deactivate.bind(extension)` is called once during `registry.activate(extension)` and the bound function is stored. The captured `this` reference is the extension at activate time. Same posture as the existing `register*` callbacks, which capture `extension` for the dispose-by-equality identity check. If the extension somehow mutates its prototype after activate, the bound hook still calls into the original method.

## Cross-cutting note on the manager-side ordering

After Task 4: `manager.setEnabled(id, false)` resolves AFTER (a) the deactivate hook has resolved, (b) the SvelteMap entry has been updated, (c) `onEnabledChanged` has fired. This means the B4 persistence layer's `recordEnabledChange` runs only after the WebSocket has been closed (in the SITL listener case). That ordering is correct: source of truth (extension's actual state) settles before the persisted record updates.
