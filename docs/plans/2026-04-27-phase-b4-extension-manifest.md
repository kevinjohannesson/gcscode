# Phase B4 — Extension manifest + persistence implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a code-defined `bundledExtensions` manifest, a localStorage-backed `ExtensionPersistence` layer, two additive `ExtensionManager` API changes (`register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`), and rewrite `main.ts` to iterate the manifest applying persisted state.

**Architecture:** Three new modules in `packages/shell/src/extension-host/` (`extension-manifest.ts`, `extension-persistence.ts`, plus additions to `extension-manager.ts`). The shell now stacks: contributions (Registry) → lifecycle (ExtensionManager) → persistence (ExtensionPersistence) → boot configuration (manifest + main.ts). Each layer has one job. The registry is unchanged; `@gcscode/extension-api` is unchanged.

**Tech Stack:** TypeScript, Svelte 5 (`svelte/reactivity` already imported by manager), Vitest, pnpm workspaces, browser `Storage` interface.

**Spec:** `docs/specs/2026-04-27-phase-b4-extension-manifest.md` (commit `fd7ed32`). The spec is the canonical reference for code shapes, test cases, and implementation sketches. This plan sequences the work, gives exact commands and commit messages, and points at spec sections rather than re-pasting their contents.

**ADRs to be aware of:** ADR-0001 (workspace boundary), ADR-0002 (imperative activate API), ADR-0003 (Phase B framing — B4 fits "lifecycle and cleanup"), ADR-0004 (extension rename). No ADR is modified; ADR-0003's Phase B retrospective will refresh alongside the merge.

---

## File structure

| Path                                                              | Responsibility                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shell/src/extension-host/extension-manifest.ts`         | **New.** Code-defined `bundledExtensions` array + `ManifestEntry` interface. (Task 2.)                                                     |
| `packages/shell/src/extension-host/extension-manifest.test.ts`    | **New.** Type-sanity tests on the manifest. (Task 2.)                                                                                      |
| `packages/shell/src/extension-host/extension-persistence.ts`      | **New.** localStorage-backed `createExtensionPersistence` factory. `Storage`-injectable for tests. (Task 3.)                               |
| `packages/shell/src/extension-host/extension-persistence.test.ts` | **New.** `MemoryStorage` mock + behavioral tests. (Task 3.)                                                                                |
| `packages/shell/src/extension-host/extension-manager.ts`          | Two additive API changes: `register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`. (Task 4.)                |
| `packages/shell/src/extension-host/extension-manager.test.ts`     | Add tests for the new register option and the onEnabledChanged callback. Existing 7 tests untouched. (Task 4.)                             |
| `packages/shell/src/main.ts`                                      | Replace single `manager.register(exampleExtension)` with the manifest-iterating bootstrap. Construct persistence; wire callback. (Task 5.) |
| `docs/roadmap.md`                                                 | Add B4 entry under Phase B (between B3 and the unlettered deactivate hook line). (Task 6.)                                                 |

No changes to `@gcscode/extension-api`, `@gcscode/extension-example`, `packages/shell/src/extension-host/registry.ts` or `registry.test.ts`, `packages/shell/src/app.svelte` or `app.test.ts`, `packages/shell/src/keybinding-dispatcher.ts` or its test, `docs/out-of-scope.md`, or any ADR. The cross-package contract is unchanged.

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on the feature branch**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/phase-b4-extension-manifest`. If branch is `master`, stop and ask the controller.

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 89 tests pass — 86 in `@gcscode/shell` (44 in `registry.test.ts`, 8 in `app.test.ts`, 27 in `keybinding-dispatcher.test.ts`, 7 in `extension-manager.test.ts`), 3 in `@gcscode/extension-example`. (`@gcscode/extension-api` reports no test files, exits 0.)

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Add `extension-manifest.ts` + sanity tests

**Files:**

- Create: `packages/shell/src/extension-host/extension-manifest.ts`
- Create: `packages/shell/src/extension-host/extension-manifest.test.ts`

This is a small TDD task: two type-sanity tests + a ~10-line module.

- [ ] **Step 1: Write the failing tests**

Implement `extension-manifest.test.ts` per spec section "Testing → `extension-manifest.test.ts` (new)". Two tests:

1. `bundledExtensions is non-empty` — assert `bundledExtensions.length >= 1`.
2. `each entry's id matches its extension's id` — iterate, assert `entry.id === entry.extension.id`.

Imports: `describe`, `expect`, `it` from `vitest`; `bundledExtensions` from `./extension-manifest`. Use the registry-test convention (kebab-case file name, co-located).

- [ ] **Step 2: Run tests, expect failures**

Run: `pnpm --filter @gcscode/shell test extension-manifest`
Expected: tests fail with import resolution errors — `extension-manifest.ts` does not yet exist.

- [ ] **Step 3: Create `extension-manifest.ts` per spec**

Implement per spec section "Public API → `bundledExtensions` (`extension-manifest.ts`)". The module exports:

- `interface ManifestEntry { id: string; extension: Extension; initialEnabled?: boolean }`
- `const bundledExtensions: readonly ManifestEntry[]` — single entry for the example extension.

Convention reminders: type-only imports separated from value imports with a blank line (mirrors `registry.ts`). Imports `Extension` (type-only) from `@gcscode/extension-api`; imports `exampleExtension` (value) from `@gcscode/extension-example`.

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @gcscode/shell test extension-manifest`
Expected: 2 tests pass.

- [ ] **Step 5: Run full shell suite**

Run: `pnpm --filter @gcscode/shell test`
Expected: 88 tests pass (86 prior + 2 new).

- [ ] **Step 6: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add packages/shell/src/extension-host/extension-manifest.ts packages/shell/src/extension-host/extension-manifest.test.ts
git commit -m "$(cat <<'EOF'
feat(shell): add bundledExtensions manifest module

Code-defined list of bundled first-party extensions. Single ManifestEntry
record today (the example extension); the array is the canonical "what
is installed" list keyed by id. main.ts will iterate this in a follow-up
commit; no behavior change yet.

Two type-sanity tests in extension-manifest.test.ts: bundledExtensions
is non-empty and each entry's id matches its extension's id.

Spec: docs/specs/2026-04-27-phase-b4-extension-manifest.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add `extension-persistence.ts` + tests

**Files:**

- Create: `packages/shell/src/extension-host/extension-persistence.ts`
- Create: `packages/shell/src/extension-host/extension-persistence.test.ts`

TDD: write all 8 failing tests, then implement the module.

- [ ] **Step 1: Write the failing tests**

Implement `extension-persistence.test.ts` covering all 8 cases from spec section "Testing → `extension-persistence.test.ts` (new)":

1. Empty storage → `isInitiallyEnabled(id, true)` returns `true`; `isInitiallyEnabled(id, false)` returns `false`.
2. Populated storage with `["ext.a"]` → `isInitiallyEnabled("ext.a", true)` returns `false`; `isInitiallyEnabled("ext.b", true)` returns `true`.
3. `recordEnabledChange("ext.a", false)` writes `["ext.a"]` to storage.
4. `recordEnabledChange("ext.a", true)` after a prior disable removes from storage.
5. `recordEnabledChange("ext.a", true)` on never-disabled is a no-op (no exception, storage list unchanged).
6. Malformed JSON in storage → fallback to empty disabled set; no throw.
7. Storage `getItem` throws → fallback to empty; no throw.
8. Storage `setItem` throws → no throw; in-memory state still consistent for subsequent `isInitiallyEnabled` calls.

Construct a `MemoryStorage` mock at the top of the test file. It implements the `Storage` interface (`getItem`, `setItem`, `removeItem`, `clear`, `key`, `length`) by delegating to an internal `Map<string, string>`. For the throw-on-getItem and throw-on-setItem cases, expose hooks (e.g. `failNextRead = true` or `failOnWrite = true`) so individual tests can opt into failure modes.

Imports: `describe`, `expect`, `it`, optionally `beforeEach` from `vitest`; `createExtensionPersistence` from `./extension-persistence`.

- [ ] **Step 2: Run tests, expect failures**

Run: `pnpm --filter @gcscode/shell test extension-persistence`
Expected: tests fail with import resolution errors — module does not yet exist.

- [ ] **Step 3: Create `extension-persistence.ts` per spec**

Implement per spec section "Implementation sketches → `extension-persistence.ts`". The module exports:

- `interface ExtensionPersistence { isInitiallyEnabled(id, fallback): boolean; recordEnabledChange(id, enabled): void }`
- `function createExtensionPersistence(storage?: Storage): ExtensionPersistence`
- Module-private `STORAGE_KEY = 'gcscode.extensions.disabled'`, plus internal `loadDisabled` and `saveDisabled` helpers.

Both helpers wrap their storage calls in `try/catch`. Read failures fall back to empty arrays; write failures swallow silently (in-memory state stays consistent for the session).

The factory's `storage` parameter defaults to `localStorage` for production use and accepts the `MemoryStorage` mock for tests.

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @gcscode/shell test extension-persistence`
Expected: 8 tests pass.

- [ ] **Step 5: Run full shell suite**

Run: `pnpm --filter @gcscode/shell test`
Expected: 96 tests pass (88 prior + 8 new).

- [ ] **Step 6: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean. `pnpm format` if Prettier flags formatting.

- [ ] **Step 7: Commit**

```bash
git add packages/shell/src/extension-host/extension-persistence.ts packages/shell/src/extension-host/extension-persistence.test.ts
git commit -m "$(cat <<'EOF'
feat(shell): add ExtensionPersistence localStorage layer

Exports createExtensionPersistence(storage?) factory backing the
disabled-extensions set on localStorage key gcscode.extensions.disabled.
Schema: JSON-encoded array of disabled ids. Anything absent is enabled.

Storage-injectable for tests via the optional Storage parameter
(default: localStorage). Read/write paths both wrapped in try/catch:
malformed JSON or storage exceptions fall back to empty / silent no-op
so boot never fails on storage problems.

Eight behavioral tests via a MemoryStorage mock in the test file:
empty/populated reads, write/re-enable round-trips, never-disabled
no-op, malformed JSON fallback, getItem/setItem throw paths.

main.ts will wire this in a follow-up commit; no behavior change yet.

Spec: docs/specs/2026-04-27-phase-b4-extension-manifest.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Extend `ExtensionManager` API (TDD)

**Files:**

- Modify: `packages/shell/src/extension-host/extension-manager.ts`
- Modify: `packages/shell/src/extension-host/extension-manager.test.ts`

Two additive API changes, six new tests. Existing 7 tests stay untouched.

- [ ] **Step 1: Write the failing tests**

Append the 6 new tests in `extension-manager.test.ts` per spec section "Testing → `extension-manager.test.ts` (additions)":

1. `register(ext, { enabled: false })` stores entry with `enabled: false` and does NOT call `registry.activate`. Assert `registry.listViews()` is empty after registration; assert `manager.listExtensions()` shows `enabled: false`; assert the fixture's activate spy was NOT called.
2. `register(ext, { enabled: false })` followed by `setEnabled(id, true)` activates. Assert activate spy called exactly once after the `setEnabled`; contributions appear.
3. `onEnabledChanged` fires from `setEnabled` with `(id, enabled)` arguments matching the change. Use `vi.fn()` for the callback, register an extension, call `setEnabled(id, false)`, assert the callback was called once with `(id, false)`.
4. `onEnabledChanged` does NOT fire from same-value `setEnabled` (no-op path). Register, call `setEnabled(id, true)` (already true), assert callback not called.
5. `onEnabledChanged` does NOT fire from `register` regardless of the enabled option. Register with `{ enabled: true }`, assert callback not called; register a second extension with `{ enabled: false }`, assert callback still not called.
6. `register(ext, { enabled: true })` is equivalent to `register(ext)`. Two parallel cases: one calls with no options, one calls with `{ enabled: true }`. Both should produce identical observable state (`registry.listViews()` length, activate spy call count, `manager.listExtensions()` enabled flag).

Reuse the existing `makeViewExtension(id)` fixture. Add new `it` blocks to the existing `describe('createExtensionManager', ...)` block; do NOT re-organize the existing tests.

- [ ] **Step 2: Run tests, expect failures**

Run: `pnpm --filter @gcscode/shell test extension-manager`
Expected: 6 new tests fail (TypeScript errors on the new `options` argument shapes; runtime expectation mismatches once compile clears). Existing 7 tests still pass.

- [ ] **Step 3: Modify `extension-manager.ts` per spec**

Implement per spec section "Implementation sketches → `extension-manager.ts` updates". Two additive changes to the factory:

1. `register` accepts an optional second arg `{ enabled?: boolean }`. Default: `enabled: true`. When `enabled === false`, store the record but skip `registry.activate`.
2. `createExtensionManager` accepts an optional second arg `{ onEnabledChanged?: (id, enabled) => void }`. The callback is captured at construction; invoked from `setEnabled` AFTER `extensions.set` lands and ONLY when state actually changed.

Update the `ExtensionManager` interface to declare the new `register` signature. Update the `createExtensionManager` exported function signature.

The internal `ExtensionState` type, `ExtensionRecord` interface, and `toRecord` helper are unchanged. The duplicate-id throw and unknown-id throw stay where they are. The `extensions.set(id, { ...state, enabled })` reactivity-preserving update stays.

- [ ] **Step 4: Run tests, expect pass**

Run: `pnpm --filter @gcscode/shell test extension-manager`
Expected: 13 tests pass (7 existing + 6 new).

- [ ] **Step 5: Run full shell suite**

Run: `pnpm --filter @gcscode/shell test`
Expected: 102 tests pass (96 prior + 6 new).

- [ ] **Step 6: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean. The `register` overload's optional second arg and the `createExtensionManager` overload's optional second arg should compile without changes elsewhere — every existing call site (`main.ts`, the existing tests) uses zero or one argument, both of which remain valid.

- [ ] **Step 7: Commit**

```bash
git add packages/shell/src/extension-host/extension-manager.ts packages/shell/src/extension-host/extension-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(shell): extend ExtensionManager with register option + change callback

Two additive, backwards-compatible API changes:

- register(extension, options?: { enabled?: boolean }): when enabled is
  false, store the record but skip registry.activate. Disabled
  extensions don't run their activate at boot.
- createExtensionManager(registry, options?: { onEnabledChanged }):
  optional callback fires from setEnabled after the SvelteMap update,
  only when state actually changed (not on no-op same-value calls).
  Does NOT fire from register — initial state is not a change.

Six new tests cover both surfaces. Existing 7 tests untouched.

main.ts will wire onEnabledChanged to ExtensionPersistence.recordEnabled-
Change in a follow-up commit. No behavior change at boot yet.

Spec: docs/specs/2026-04-27-phase-b4-extension-manifest.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Wire bootstrap in `main.ts`

**Files:**

- Modify: `packages/shell/src/main.ts`

- [ ] **Step 1: Update `main.ts` per spec**

Apply the bootstrap rewrite per spec section "Bootstrap (`packages/shell/src/main.ts`)" — the "After B4" code block. Three changes from the post-B2b form:

1. Add three imports: `bundledExtensions` from `./extension-host/extension-manifest`; `createExtensionPersistence` from `./extension-host/extension-persistence`; the existing `createExtensionManager` and `createRegistry` imports stay. Place all relative-path imports alphabetically (extension-manager, extension-manifest, extension-persistence, registry).
2. Construct `persistence` and pass `onEnabledChanged` callback to `createExtensionManager`. Remove the previous one-line `manager.register(exampleExtension)` call.
3. Iterate `bundledExtensions` with a `for ... of` loop that destructures `{ id, extension, initialEnabled = true }`; call `manager.register(extension, { enabled: persistence.isInitiallyEnabled(id, initialEnabled) })`.

The `attachKeybindingDispatcher(registry, document)` call and the `mount(App, ...)` block stay as-is. They continue to receive `registry` (NOT `persistence` and NOT `manager` — no Svelte component consumes those yet).

The direct import of `exampleExtension` from `@gcscode/extension-example` is no longer needed — it's pulled in transitively via `bundled-extensions.ts`. Remove that import line.

- [ ] **Step 2: Run full shell suite**

Run: `pnpm --filter @gcscode/shell test`
Expected: 102 tests pass (no test changes; bootstrap edit is dev-server-only behavior).

- [ ] **Step 3: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean. The unused `exampleExtension` import would have been flagged by ESLint if left in — confirm it's removed.

- [ ] **Step 4: Commit**

```bash
git add packages/shell/src/main.ts
git commit -m "$(cat <<'EOF'
feat(shell): wire manifest + persistence into bootstrap

main.ts now iterates bundledExtensions and applies persisted enabled
state via ExtensionPersistence.isInitiallyEnabled per entry. The
manager's onEnabledChanged callback is wired to recordEnabledChange so
runtime setEnabled mutations survive reload.

Drops the direct exampleExtension import — it now flows through
extension-manifest.ts. attachKeybindingDispatcher and the App mount
continue to receive the registry; no Svelte component consumes the
manager or persistence in this iteration.

Boot behavior unchanged for the example extension: no localStorage
state on a fresh start means the extension activates as before.

Spec: docs/specs/2026-04-27-phase-b4-extension-manifest.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Roadmap propagation

**Files:**

- Modify: `docs/roadmap.md`

- [ ] **Step 1: Add B4 entry per spec**

Apply the edit per spec section "`docs/roadmap.md` propagation". Insert one new line under "Phase B — Lifecycle and cleanup" between the existing B3 line and the unlettered `Extension.deactivate?()` hook line.

The exact line to insert is in the spec's propagation section. Do not modify the B1, B2a, B2b, B3, or `Extension.deactivate?()` hook lines. Do not modify Phase A, Phase C, Feature extensions, or Maintenance sections.

- [ ] **Step 2: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: both clean. Prettier may rewrap the long line; that is benign.

- [ ] **Step 3: Commit**

```bash
git add docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs: flip roadmap B4 checkbox

Adds the B4 entry under Phase B reflecting the extension manifest +
persistence iteration. B1, B2a, B2b, B3, and the deactivate-hook
lines are unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. Shell suite at 102 (86 prior + 2 manifest + 8 persistence + 6 manager). Extension-example unchanged at 3. Total 105.

- [ ] **Step 2: Production build smoke test**

Run: `pnpm --filter @gcscode/shell build`
Expected: build succeeds. Bundle size delta is small (a few hundred bytes for the new modules).

- [ ] **Step 3: Optional dev server smoke test**

Run: `pnpm dev` (in the background) and open `http://localhost:5173/` in a browser (or via chrome-devtools-mcp). Confirm:

- Header reads `GCScode`.
- Example extension's view (`<h2>Example Extension</h2>` + paragraph) renders.
- Status bar footer shows `Example` on the right.
- No errors or warnings in browser console.
- Press `Alt+Shift+G`. Console shows `Hello from gcscode.example` (A3 keybinding still works).
- DevTools → Application → Local Storage → key `gcscode.extensions.disabled` is absent (no extensions disabled on a fresh boot).

If browser unavailable, the test suites cover the substantive paths (manager + persistence + manifest); the dev-server check is a regression guard against accidental coupling.

Stop the background `pnpm dev` process when done.

- [ ] **Step 4: Confirm clean tree and feature commits**

Run: `git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. Branch contains 5 new commits beyond master (Tasks 2, 3, 4, 5, 6), plus any `Code-review-followup:` commits the controller adds during the per-task review loop.

---

## Out of scope reminders

These are intentionally NOT part of B4 (see the spec):

- **`unregister(id)` / uninstall** — defers with dynamic loading.
- **JSON-file manifest** — code-defined only.
- **Toggle UI / management view** — substrate only.
- **Per-extension settings beyond `enabled`** — `initialEnabled` is the only knob.
- **Multi-subscriber events on the manager** — single construction-time callback.
- **Workspace-vs-global persistence scopes** — single global scope.
- **Storage migration / versioning** — no prior schema.
- **Storage error handling beyond fallback-to-empty** — graceful no-op on failure.
- **`Extension.deactivate?()` hook** — separate iteration.
- **Changes to `@gcscode/extension-api`** — cross-package contract is unchanged.
- **Renaming `Registry.activate` → `register` / `Registry.deactivate` → `setEnabled`** — same posture as B2b.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on the `ManifestEntry.id` redundancy

Today `entry.id === entry.extension.id` is required by Task 2's sanity test. The spec ("Cross-cutting notes") explains why the redundancy is intentional structural runway for the future dynamic-loading iteration. Do not "tidy up" by removing the `id` field. Do not derive it from `extension.id` at use sites — keep them separate.

## Cross-cutting note on construction callback vs subscribe API

`onEnabledChanged` is a deliberately minimal one-consumer callback. Do not preemptively grow it into a `subscribe(callback): Disposable` API or an event emitter. If a second consumer ever needs enabled-state mutations, that's a separate iteration with its own spec — don't anticipate it in B4.

## Cross-cutting note on storage error handling

The persistence module's catch blocks are deliberately broad. localStorage can throw for reasons orthogonal to our code. The graceful fallback ("boot the app anyway, persistence becomes a session-only no-op") is the right cut today. Do not add error UIs, telemetry, or retry logic. When a settings UI lands (Phase C), it can decide whether to expose persistence health.
