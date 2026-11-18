# Keep a setting's latest value across disable and re-enable — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A setting keeps its latest value when the extension that registered it is disabled and re-enabled in the same run.

**Architecture:** `ConfigurationStore` drops `_pendingPersisted`, its boot-time copy of the saved blob, and `registerConfiguration()` reads the blob from storage instead. Storage becomes the only place saved values live, so the value `update()` wrote is the one a re-registration finds.

**Tech stack:** TypeScript, Svelte 5 (`SvelteMap`), ajv, vitest.

**Spec:** none of its own. The controller's brief is the requirement; the behaviour it restores is [configuration system v1](../specs/2026-05-18-configuration-system-v1.md) § Lifecycle, "Extension disable": the saved value stays, "so re-activation re-validates it against the schema".

## The bug

In `packages/shell/src/configuration/configuration-store.svelte.ts`, the constructor loads the saved blob into `_pendingPersisted` once. `registerConfiguration()` restores a key from that copy, `update()` writes storage but never the copy, and `dispose()` deletes the key from `_values`. So register → `update()` → dispose → register brings back the boot-time value, or the default when the key had none saved at boot. A reload shows the right value, because the new store loads the blob afresh.

## Global constraints

- **`host.configuration.*` in `@gcscode/extension-api` does not change.** Nothing under `packages/extension-api/` is edited.
- **Scope:** `packages/shell/src/configuration/` and this plan. Nothing else.
- **Every new test is seen failing before it passes.** The task report lists each mutation run and any that survived (`CLAUDE.md` § Tests). Expected values are the literals in this plan.
- **Worktree discipline.** Prefix every command with `cd <worktree root> &&` (the root is `git rev-parse --show-toplevel`). Chain `git branch --show-current` before every `git commit`, and stop if it reads `master`. Run `pnpm format`, `pnpm test`, `pnpm check` and `pnpm lint` only with that prefix.

## Decisions this plan adds

1. **Read storage at registration; delete `_pendingPersisted`.** The brief allowed either this or keeping the copy in step with `update()`. A copy kept in step is a second source of truth that every writer to the blob must remember to update, and this bug is exactly one writer forgetting. Reading storage leaves one copy, matches spec v1's "re-activation re-validates" the saved value, and is how `update()` already reads the blob for its read-modify-write. The cost is one `JSON.parse` of a small blob per registration, at activation time. The boot-time move of a renamed extension's keys (`extension-host/previous-ids.ts`) runs before the store is created, so it is unaffected.
2. **The tests call `update()` before dispose, not between dispose and re-register.** After dispose the key has no schema, and `update()` rejects with `No schema registered`. The sequence tested is the one the bug needs: register → `update()` → dispose → register.
3. **After a failed save, re-enabling shows the last saved value, as a reload does.** `update()` keeps its documented in-memory commit when the write fails and rejects with `Persistence failed`. Dispose drops that in-memory value, and re-registration reads what storage holds.
4. **A corrupt blob now warns once per registration**, where it warned once per boot. `loadConfigurationBlob()` warns each time it meets invalid JSON, and the first successful `update()` rewrites the blob. Accepted; reported as a follow-up rather than fixed here.

## Review focus

1. **Re-enabling with a schema the updated value now violates** — expect a warning, the default, and the saved blob untouched (spec v1 § Lifecycle, "Schema mismatch across re-registers"). Pinned by test 3.
2. **Re-enabling after `update()` failed to save** — expect the last saved value, not the unsaved one (decision 3). Pinned by test 4.
3. **Storage that throws when read, at registration** — registration now touches storage, so a throwing `getItem` must not make `registerConfiguration()` throw and fail the extension's activation. Expect the default. Pinned by test 5.

## File structure

- Modify: `packages/shell/src/configuration/configuration-store.svelte.ts` — the field, the constructor and the restore block in `registerConfiguration()`.
- Test: `packages/shell/src/configuration/configuration-store.test.ts` — a new `describe` block, reusing the file's `makeStorage()`.

### Task 1: re-registration reads the saved value from storage

**Files:**

- Modify: `packages/shell/src/configuration/configuration-store.svelte.ts:43-48` (field and constructor) and `:78-89` (the restore block)
- Test: `packages/shell/src/configuration/configuration-store.test.ts`

**Interfaces:**

- Consumes: `loadConfigurationBlob(storage: Storage): ConfigurationBlob` and `writeConfigurationBlob(storage, blob)` from `./persistence` (unchanged).
- Produces: no new or changed signature. `ConfigurationStore`'s public surface stays as it is.

- [ ] **Step 1: Write the failing tests**

Add `describe('ConfigurationStore re-registration after update()', …)` to `configuration-store.test.ts`. Every test uses the contribution `{ key: 'ext.a.foo', schema: { type: 'string' }, default: 'hello' }` registered by `'ext.a'` unless it says otherwise, keeps the `Disposable` from the first registration, and reads with `store.getConfiguration('ext.a').get<string>('foo')`.

1. `restores the updated value when the key had a saved value at boot` — storage starts as `{ 'ext.a.foo': 'preset' }`. Register, `update('foo', 'updated')`, dispose, register again. Expect `get` → `'updated'`.
2. `restores the updated value when the key had no saved value at boot` — empty storage. Same sequence. Expect `get` → `'updated'`.
3. `warns and falls back to the default when the updated value violates the new schema, leaving storage untouched` — empty storage, `console.warn` spied. Register, `update('foo', 'updated')`, dispose, register `{ key: 'ext.a.foo', schema: { type: 'number' }, default: 0 }`. Expect `get<number>('foo')` → `0`, `warn` called once with a first argument matching `/ext\.a\.foo.*violates schema/`, and `loadConfigurationBlob(storage)` → `{ 'ext.a.foo': 'updated' }`.
4. `restores the last saved value after update() failed to save` — a storage whose `setItem` throws `new Error('QuotaExceededError')` and whose `getItem` reads an empty `makeStorage()` (the pattern of the existing `Persistence failed` test). Register, expect `update('foo', 'world')` to reject with `/Persistence failed/`, dispose, register again. Expect `get` → `'hello'`.
5. `falls back to the default when storage throws on read` — a storage whose `getItem` throws `new Error('storage disabled')` (the shape `persistence.test.ts` uses). Expect `registerConfiguration(…)` not to throw, and `get` → `'hello'`.

- [ ] **Step 2: Run the tests and watch 1–3 fail for the right reason**

Run: `cd <worktree root> && pnpm --filter @gcscode/shell exec vitest run src/configuration/configuration-store.test.ts`
Expected: test 1 fails with `expected 'preset' to be 'updated'`, test 2 with `expected 'hello' to be 'updated'`, test 3 on the warning count (0 calls, the boot-time copy holds no value). Tests 4 and 5 pass: they pin decision 3 and review-focus line 3 against plausible wrong fixes, and are seen failing by mutation in Step 5.

- [ ] **Step 3: Implement the fix in `configuration-store.svelte.ts`**

Delete the `_pendingPersisted` field and its constructor assignment. In `registerConfiguration()`, read the saved blob with `loadConfigurationBlob(this._storage)` where the restore block now reads `this._pendingPersisted`, keeping the block's validate → set / warn logic as it is. Update the block's comment to say the value is read from storage at registration so a value `update()` saved earlier in the run survives disable and re-enable, and that storage is still not touched when the value is bad.

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd <worktree root> && pnpm --filter @gcscode/shell exec vitest run src/configuration/`
Expected: every test in `src/configuration/` passes, including the existing boot + re-validation tests.

- [ ] **Step 5: Mutate, watch each test fail, restore**

Run each mutation, run the file, note which test fails, restore. Report each one and any that survived.

- Restore from a boot-time copy again (the old code) → tests 1, 2, 3 fail.
- Add the copy back, kept in step by `update()` **before** the write (the in-memory-first variant of the other fix) → test 4 fails with `expected 'world' to be 'hello'`.
- Read storage with `JSON.parse(this._storage.getItem(STORAGE_KEY) ?? '{}')` in place of `loadConfigurationBlob()` → test 5 fails with `storage disabled`.
- Drop the `validate(persisted)` check (always set the saved value) → test 3 and the existing boot-time schema test fail.

- [ ] **Step 6: Verify the whole workspace**

Run, each with the worktree prefix: `pnpm format`, then `pnpm test`, `pnpm check`, `pnpm lint`.
Expected: all three pass; record each summary line for the PR report.

- [ ] **Step 7: Commit**

```bash
cd <worktree root> && git add packages/shell/src/configuration/ && git branch --show-current && git commit -m "fix(configuration): read saved values from storage when a setting registers"
```

## Checklist: the brief's acceptance criteria

The final review verifies each.

- [ ] A co-located test runs `update()` before dispose and re-registration and expects the updated value, for a key with a saved value at boot and one without (tests 1 and 2), seen failing for the right reason before the fix.
- [ ] After the fix, both pass.
- [ ] The schema-invalid path still warns and falls back to the default without touching storage: the existing boot-time test and test 3.
- [ ] `pnpm test`, `pnpm check` and `pnpm lint` pass from the worktree.
- [ ] `packages/extension-api/` is unchanged.

## Not in this PR

- The once-per-registration warning for a corrupt blob (decision 4).
- Spec v1 § Persistence says the store "loads the blob into `_values`" at boot; it loaded a separate copy before this PR and loads nothing at boot after it. The spec is the historical record and stays as it is.
