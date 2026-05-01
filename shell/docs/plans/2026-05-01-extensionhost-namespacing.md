# Phase C1 — ExtensionHost namespacing — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `ExtensionHost` API with a topic-namespaced shape (`host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*`) and migrate the three first-party extensions plus all touched tests in the same iteration.

**Architecture:** Hard break refactor on a `feat/extensionhost-namespacing` branch off master, merged with `--no-ff`. Four feat-branch commits land in dependency order: api types → shell host factory → consumers (extensions + tests) → docs. The `Registry` interface stays flat; only the public `ExtensionHost` is rewritten. Closure-over-state and per-method bodies inside `createHost` are byte-identical; only the returned object's structure changes.

**Tech Stack:** TypeScript, Svelte 5 (unchanged), Vitest, ESLint + Prettier. No new tooling.

**Spec:** [`docs/specs/2026-05-01-extensionhost-namespacing.md`](../specs/2026-05-01-extensionhost-namespacing.md)
**ADR:** [`docs/decisions/ADR-0006-extensionhost-namespacing.md`](../decisions/ADR-0006-extensionhost-namespacing.md)

---

## Important — this iteration is a refactor with intermediate broken states

Commits 1, 2, 3 progressively land the new shape. Type compilation and tests are in a TEMPORARY non-passing state between commit 1 and commit 3. They reach green at the END of commit 3.

This is deliberate (per the spec's `## Branching and commit` section) — it makes each commit a logically coherent diff for review. Subagents executing each task:

- **After commit 1** (`feat(extension-api): namespaced ExtensionHost`): `pnpm check` will fail in `@gcscode/shell` (the registry's `createHost` returns the old flat shape, doesn't match the new interface). DO NOT "fix" by reverting interface changes — the next commit fixes the registry side.
- **After commit 2** (`feat(shell): namespaced host factory in registry`): `pnpm check` succeeds for `@gcscode/extension-api` and the registry's own usage. Will still fail at extension and test usage sites that call `host.registerView` etc. flat. DO NOT "fix" by reverting — commit 3 migrates the consumers.
- **After commit 3** (`feat(extensions): migrate first-party extensions to namespaced host`): `pnpm check` clean across all four packages, `pnpm test` passes, `pnpm lint` clean. Green state.
- **After commit 4** (`docs: ADR-0006 propagation`): docs only — no impact on type/test state.

When in doubt about whether a `pnpm check` / `pnpm test` failure is expected: which commit are you implementing? Refer to the table above.

---

## File structure

| Path                                                          | Responsibility                                                                                                                                                                                       |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-api/src/index.ts`                         | Replace the `ExtensionHost` interface with the topic-namespaced shape. Contribution interfaces (`ViewContribution`, etc.) and `Disposable`, `ExtensionContext`, `Extension` are unchanged. (Task 2.) |
| `packages/shell/src/extension-host/registry.ts`               | Restructure `createHost` to return the namespaced object. Closure state and per-method bodies byte-identical. (Task 3.)                                                                              |
| `packages/extension-example/src/index.ts`                     | Migrate four `host.register*` calls to namespaced form. (Task 4.)                                                                                                                                    |
| `packages/extension-sitl/src/index.ts`                        | Migrate three `host.register*` calls to namespaced form. (Task 4.)                                                                                                                                   |
| `packages/extension-vehicle-status/src/index.ts`              | Migrate `host.getExtension` and `host.registerStatusBarItem` calls. (Task 4.)                                                                                                                        |
| `packages/shell/src/extension-host/registry.test.ts`          | Migrate test extensions' `host.register*` / `host.executeCommand` / `host.getExtension` calls to namespaced form. (Task 4.)                                                                          |
| `packages/shell/src/extension-host/extension-manager.test.ts` | Same migration pattern. (Task 4.)                                                                                                                                                                    |
| `packages/shell/src/app.test.ts`                              | Same migration pattern. (Task 4.)                                                                                                                                                                    |
| `packages/extension-example/src/index.test.ts`                | Updates flow from source change. (Task 4.)                                                                                                                                                           |
| `packages/extension-sitl/src/index.test.ts`                   | Updates flow from source change. (Task 4.)                                                                                                                                                           |
| `packages/extension-vehicle-status/src/index.test.ts`         | Updates flow from source change. (Task 4.)                                                                                                                                                           |
| `docs/decisions/ADR-0003-plugin-api-refinements.md`           | Append one new follow-up bullet pointing at ADR-0006. (Task 5.)                                                                                                                                      |
| `docs/decisions/ADR-0005-extension-boundaries.md`             | Append one new follow-up bullet pointing at ADR-0006. (Task 5.)                                                                                                                                      |
| `docs/vs-code-alignment.md`                                   | Append one new row to the Alignments table. (Task 5.)                                                                                                                                                |
| `docs/roadmap.md`                                             | Replace Phase C single bullet with two bullets (C1 shipped + C2+ TBD). (Task 5.)                                                                                                                     |
| `packages/extension-api/README.md`                            | Replace with the comprehensive new content from the spec. (Task 5.)                                                                                                                                  |
| `packages/extension-example/README.md`                        | Update four method references in the "What it demonstrates" prose to namespaced form. (Task 5.)                                                                                                      |
| `packages/extension-sitl/README.md`                           | One inline-code update in "Cross-extension exports" section. (Task 5.)                                                                                                                               |
| `packages/extension-vehicle-status/README.md`                 | One inline-code update in "Contributions" bullet. (Task 5.)                                                                                                                                          |
| `CLAUDE.md`                                                   | Update one sentence in the Boundary-rule corollary. (Task 5.)                                                                                                                                        |

---

### Task 1: Establish green baseline + create feature branch

**Files:** none (state-verification task; creates the branch)

- [ ] **Step 1: Verify on master with clean working tree**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `master`. HEAD is the spec+ADR commit `98dc21d docs: ADR-0006 + Phase C1 spec for ExtensionHost namespacing` (or a later commit if other docs commits have landed).

- [ ] **Step 2: Verify lint, check, test all clean at baseline**

Run: `pnpm lint && pnpm check && pnpm test`
Expected: all three pass. Tests pass cleanly across `@gcscode/shell`, `@gcscode/extension-example`, `@gcscode/extension-sitl`, `@gcscode/extension-vehicle-status`. Note the total test count for later comparison (in particular, the per-package counts shown in the test output).

- [ ] **Step 3: Create the feature branch**

Run: `git checkout -b feat/extensionhost-namespacing`
Expected: branch created and checked out. `git branch --show-current` reads `feat/extensionhost-namespacing`.

- [ ] **Step 4: Confirm branch position**

Run: `git log --oneline -3`
Expected: HEAD is the spec+ADR commit (or wherever master was when the branch was created); no new commits.

---

### Task 2: Update `ExtensionHost` interface in `@gcscode/extension-api` (commit 1)

**Files:**

- Modify: `packages/extension-api/src/index.ts`

This task replaces the flat `ExtensionHost` interface with the topic-namespaced shape. The other interfaces in the file (`Disposable`, `ViewContribution`, `StatusBarItemContribution`, `CommandContribution`, `KeybindingContribution`, `ExtensionIdentity`, `ExtensionContext`, `Extension`) are NOT touched.

After this commit, `pnpm check` will fail in `@gcscode/shell` because `createHost` in `packages/shell/src/extension-host/registry.ts` returns the old flat shape. THIS IS EXPECTED. Do not revert the interface change. The next task (Task 3) fixes the registry side.

- [ ] **Step 1: Open `packages/extension-api/src/index.ts` and locate the existing `ExtensionHost` interface**

The current interface (lines ~70–98 in the file as of the spec commit) reads:

```ts
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

Including the leading docstring (the multi-line comment block immediately above the interface starting with `* The per-extension gate.`).

- [ ] **Step 2: Replace the entire `ExtensionHost` interface (with its leading docstring) with the namespaced form**

Replace the docstring + interface block above with exactly:

```ts
/**
 * The per-extension gate. Methods are organized into four topic namespaces:
 *
 * - `commands` — `registerCommand` (returns `Disposable`) and `executeCommand`
 *   (fires by id; cross-extension execute is intentional).
 * - `window` — `registerView` and `registerStatusBarItem` (UI contributions).
 * - `keybindings` — `registerKeybinding` (key combo → command id).
 * - `extensions` — `getExtension` (looks up another extension's published exports).
 *
 * The host exposes no methods at the top level — every verb lives under one of
 * the four namespaces. New contribution kinds slot in as further `register*`
 * methods on the appropriate namespace; new cross-cutting capabilities (events,
 * settings, themes, i18n) land as new namespaces. See ADR-0006.
 */
export interface ExtensionHost {
  readonly commands: {
    registerCommand(command: CommandContribution): Disposable;
    executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
  };
  readonly window: {
    registerView(view: ViewContribution): Disposable;
    registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  };
  readonly keybindings: {
    registerKeybinding(keybinding: KeybindingContribution): Disposable;
  };
  readonly extensions: {
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
  };
}
```

No other content in `packages/extension-api/src/index.ts` is changed.

- [ ] **Step 3: Verify the api package itself still typechecks**

Run: `pnpm --filter @gcscode/extension-api check`
Expected: `tsc --noEmit` exits 0. The api package only declares types; no value code uses `ExtensionHost`, so this passes cleanly.

- [ ] **Step 4: Verify the expected breakage is contained to `@gcscode/shell`**

Run: `pnpm --filter @gcscode/shell check 2>&1 | head -40 || true`
Expected: TypeScript errors in `packages/shell/src/extension-host/registry.ts` (the `createHost` return type doesn't match the new namespaced `ExtensionHost`). The errors point at `createHost` and identify missing `commands`, `window`, `keybindings`, `extensions` properties on the returned object.

This breakage is expected. Task 3 fixes it.

- [ ] **Step 5: Verify only the intended file is changed**

Run: `git status`
Expected: modified file: `packages/extension-api/src/index.ts`. No other files. No untracked files.

If any other file appears in the output, stop and investigate before committing.

- [ ] **Step 6: Run prettier on the modified file**

Run: `pnpm format`
Expected: prettier rewrites whitespace if needed; `git status` continues to show only `packages/extension-api/src/index.ts` modified.

- [ ] **Step 7: Commit**

```bash
git add packages/extension-api/src/index.ts
git commit -m "$(cat <<'EOF'
feat(extension-api): namespaced ExtensionHost — commands/window/keybindings/extensions

Replaces the flat ExtensionHost interface with topic-namespaced shape
(host.commands.*, host.window.*, host.keybindings.*, host.extensions.*)
per ADR-0006.

This commit alone leaves @gcscode/shell's registry temporarily failing
type-check (createHost still returns the flat shape). Commit 2 of this
branch fixes that. Commit 3 migrates the three first-party extensions
and ~70 tests to the namespaced API. Tests reach green at commit 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify commit landed on the feature branch**

Run: `git log --oneline -2 && git branch --show-current`
Expected: HEAD is the new commit `feat(extension-api): namespaced ExtensionHost — commands/window/keybindings/extensions`. Branch is `feat/extensionhost-namespacing`. `nothing to commit, working tree clean`.

---

### Task 3: Restructure `createHost` factory in shell registry (commit 2)

**Files:**

- Modify: `packages/shell/src/extension-host/registry.ts`

This task replaces the `createHost` factory function's returned object with the namespaced shape. The closure-over-state pattern (`views`, `statusBarItems`, `commands`, `keybindings`, `exportsByExtension`, `subscriptionsByExtension`, `deactivateHooksByExtension` Maps; the `execute<T>` helper) and the per-method bodies (id-uniqueness check, set into the map, return idempotent `Disposable`) are byte-identical. Only the returned object's structure changes.

After this commit, `pnpm --filter @gcscode/shell check` will pass for `registry.ts` itself. Tests and extensions still call the flat methods (e.g., `context.host.registerView(...)`) so they will fail at type-check. THIS IS EXPECTED. Do not revert. Task 4 migrates the consumers.

- [ ] **Step 1: Open `packages/shell/src/extension-host/registry.ts` and locate the `createHost` function**

The function starts at the line beginning `function createHost(extension: ExtensionIdentity): ExtensionHost {` and ends at its matching closing `}`. Its current body returns a flat object with `registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`, `executeCommand`, `getExtension` properties.

- [ ] **Step 2: Replace the entire function body of `createHost` with the namespaced shape**

Replace from the `function createHost` line through its closing `}` with:

```ts
function createHost(extension: ExtensionIdentity): ExtensionHost {
  return {
    commands: {
      registerCommand(command) {
        if (commands.has(command.id)) {
          throw new Error(
            `Command id "${command.id}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        commands.set(command.id, command);
        return {
          dispose() {
            // Idempotent and safe under re-registration: only delete if the
            // entry currently in the map is the one this disposable owns.
            if (commands.get(command.id) === command) {
              commands.delete(command.id);
            }
          },
        };
      },
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        return execute<T>(id, args, `extension "${extension.id}"`);
      },
    },
    window: {
      registerView(view) {
        if (views.has(view.id)) {
          throw new Error(
            `View id "${view.id}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        views.set(view.id, view);
        return {
          dispose() {
            if (views.get(view.id) === view) {
              views.delete(view.id);
            }
          },
        };
      },
      registerStatusBarItem(item) {
        if (statusBarItems.has(item.id)) {
          throw new Error(
            `Status bar item id "${item.id}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        statusBarItems.set(item.id, item);
        return {
          dispose() {
            if (statusBarItems.get(item.id) === item) {
              statusBarItems.delete(item.id);
            }
          },
        };
      },
    },
    keybindings: {
      registerKeybinding(keybinding) {
        if (keybindings.has(keybinding.key)) {
          throw new Error(
            `Keybinding "${keybinding.key}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        keybindings.set(keybinding.key, keybinding);
        return {
          dispose() {
            if (keybindings.get(keybinding.key) === keybinding) {
              keybindings.delete(keybinding.key);
            }
          },
        };
      },
    },
    extensions: {
      getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined {
        if (!exportsByExtension.has(id)) return undefined;
        return { id, exports: exportsByExtension.get(id) as T };
      },
    },
  };
}
```

The rest of `registry.ts` — the imports, the `Registry` interface, the `createRegistry` function's outer body (the closure-state maps, the `execute<T>` helper, `activate`, `deactivate`, `listViews`, `listStatusBarItems`, `listCommands`, `listKeybindings`, the registry-side `executeCommand`) — is NOT changed.

- [ ] **Step 3: Verify the shell registry now typechecks against the new interface**

Run: `pnpm --filter @gcscode/shell check 2>&1 | grep -E '(registry\.ts|error TS)' | head -20`
Expected: No TypeScript errors originating in `registry.ts`. Errors will still appear in test files and extension files (they call flat `host.registerX` methods); those errors are expected and fixed in Task 4.

- [ ] **Step 4: Verify the api package check is still clean**

Run: `pnpm --filter @gcscode/extension-api check`
Expected: exit 0.

- [ ] **Step 5: Verify only the intended file is changed**

Run: `git status`
Expected: modified: `packages/shell/src/extension-host/registry.ts`. No other files. No untracked files.

- [ ] **Step 6: Run prettier on the modified file**

Run: `pnpm format`
Expected: minor whitespace adjustments possible; `git status` continues to show only `packages/shell/src/extension-host/registry.ts` modified.

- [ ] **Step 7: Commit**

```bash
git add packages/shell/src/extension-host/registry.ts
git commit -m "$(cat <<'EOF'
feat(shell): namespaced host factory in registry

Restructures createHost in packages/shell/src/extension-host/registry.ts
to return the topic-namespaced host shape per ADR-0006. Closure-over-state
pattern and per-method bodies (id-uniqueness check, idempotent dispose)
are byte-identical; only the returned object's structure changes.

After this commit @gcscode/extension-api and registry.ts itself
typecheck cleanly. Extensions and tests still call the flat host
methods; commit 3 migrates them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Verify commit landed**

Run: `git log --oneline -3`
Expected: HEAD = `feat(shell): namespaced host factory in registry`; HEAD~1 = `feat(extension-api): namespaced ExtensionHost — commands/window/keybindings/extensions`; HEAD~2 = the spec+ADR commit on master.

---

### Task 4: Migrate first-party extensions + tests (commit 3)

**Files:**

- Modify: `packages/extension-example/src/index.ts`
- Modify: `packages/extension-sitl/src/index.ts`
- Modify: `packages/extension-vehicle-status/src/index.ts`
- Modify: `packages/shell/src/extension-host/registry.test.ts`
- Modify: `packages/shell/src/extension-host/extension-manager.test.ts`
- Modify: `packages/shell/src/app.test.ts`
- Modify: `packages/extension-example/src/index.test.ts`
- Modify: `packages/extension-sitl/src/index.test.ts`
- Modify: `packages/extension-vehicle-status/src/index.test.ts`

This task migrates ALL consumer call sites to the namespaced API. The migration mapping is:

| Old (flat)                            | New (namespaced)                               |
| ------------------------------------- | ---------------------------------------------- |
| `host.registerView(view)`             | `host.window.registerView(view)`               |
| `host.registerStatusBarItem(item)`    | `host.window.registerStatusBarItem(item)`      |
| `host.registerCommand(command)`       | `host.commands.registerCommand(command)`       |
| `host.registerKeybinding(kb)`         | `host.keybindings.registerKeybinding(kb)`      |
| `host.executeCommand<T>(id, ...args)` | `host.commands.executeCommand<T>(id, ...args)` |
| `host.getExtension<T>(id)`            | `host.extensions.getExtension<T>(id)`          |

The migration also applies wherever the `host` is referenced via `context.host.*` (which is the typical pattern inside an extension's `activate(context)` body).

**Important — what NOT to migrate:** the `Registry` interface stays flat. Anywhere you see `registry.executeCommand(...)`, `registry.listViews()`, `registry.listStatusBarItems()`, `registry.listCommands()`, `registry.listKeybindings()`, `registry.activate(...)`, `registry.deactivate(...)` — leave them as-is. These are NOT host methods; they're the registry's internal/host-side API.

If you accidentally migrate `registry.executeCommand` to `registry.commands.executeCommand`, the TypeScript compiler will tell you (Registry has no `commands` field). Use that as a safety net.

**Substep ordering:** the substeps below can be done in any order, but it's clearest to do extensions first, then tests, then verify everything together. After all substeps complete, `pnpm check`, `pnpm test`, and `pnpm lint` all pass.

- [ ] **Step 1: Migrate `packages/extension-example/src/index.ts`**

Find the four `host.register*` calls inside `activate(context)` and update each:

```diff
     context.subscriptions.push(
-      context.host.registerView({
+      context.host.window.registerView({
         id: 'gcscode.example.main',
         component: ExampleView,
       }),
-      context.host.registerStatusBarItem({
+      context.host.window.registerStatusBarItem({
         id: 'gcscode.example.status',
         component: ExampleStatus,
         alignment: 'right',
       }),
-      context.host.registerCommand({
+      context.host.commands.registerCommand({
         id: 'gcscode.example.greet',
         run: () => {
           const message = 'Hello from gcscode.example';
           console.log(message);
           return message;
         },
       }),
-      context.host.registerKeybinding({
+      context.host.keybindings.registerKeybinding({
         key: 'Alt+Shift+G',
         command: 'gcscode.example.greet',
       }),
     );
```

No other lines in this file change. Imports, identity fields (`id`, `displayName`, `version`), and the file's overall structure are unchanged.

- [ ] **Step 2: Migrate `packages/extension-sitl/src/index.ts`**

Find the three `host.register*` calls inside `activate(context)` and update each:

```diff
     context.subscriptions.push(
-      context.host.registerView({
+      context.host.window.registerView({
         id: 'gcscode.sitl.location',
         component: SitlView,
       }),
-      context.host.registerCommand({
+      context.host.commands.registerCommand({
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
-      context.host.registerKeybinding({
+      context.host.keybindings.registerKeybinding({
         key: 'Alt+Shift+L',
         command: 'gcscode.sitl.getLocation',
       }),
     );
```

No other lines change. The `SitlExports` interface, the `client` module-level variable, the `activate()`'s setup of `createMavlinkClient`, the return statement (`return { telemetry: telemetryState };`), and the `deactivate()` method are all unchanged.

- [ ] **Step 3: Migrate `packages/extension-vehicle-status/src/index.ts`**

Two updates: the module-level `getSitlExports()` helper and the `host.register*` call inside `activate()`.

```diff
 export function getSitlExports(): SitlExports | undefined {
-  return host?.getExtension<SitlExports>('gcscode.sitl')?.exports;
+  return host?.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports;
 }

 export const vehicleStatusExtension: Extension = {
   id: 'gcscode.vehicle-status',
   displayName: 'Vehicle Status',
   version: '0.0.0',
   activate(context) {
     host = context.host;
     context.subscriptions.push(
-      context.host.registerStatusBarItem({
+      context.host.window.registerStatusBarItem({
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

No other lines change. Imports, the module-level `host` variable, the `deactivate()` method are unchanged.

- [ ] **Step 4: Migrate `packages/shell/src/extension-host/registry.test.ts`**

This file has the largest number of `host.register*` / `host.executeCommand` / `host.getExtension` call sites — typically inside `activate(context)` bodies of test extensions, plus some helper invocations of `host.executeCommand` directly.

Apply the migration mapping table at the top of Task 4 to every call site in this file. Pattern: search for `host.register`, `host.executeCommand(`, `host.getExtension(`, and update each match per the table.

Specifically:

- Replace every `context.host.registerView(` with `context.host.window.registerView(`
- Replace every `context.host.registerStatusBarItem(` with `context.host.window.registerStatusBarItem(`
- Replace every `context.host.registerCommand(` with `context.host.commands.registerCommand(`
- Replace every `context.host.registerKeybinding(` with `context.host.keybindings.registerKeybinding(`
- Replace every `context.host.executeCommand` with `context.host.commands.executeCommand`
- Replace every `context.host.getExtension` with `context.host.extensions.getExtension`
- Same six replacements for `host.X` (without `context.` prefix) where `host` is an `ExtensionHost` (the test fixtures may capture host objects as locals).

DO NOT change any `registry.executeCommand`, `registry.listViews`, `registry.listStatusBarItems`, `registry.listCommands`, `registry.listKeybindings`, `registry.activate`, `registry.deactivate` calls. The Registry interface stays flat.

If you're unsure whether a particular call site is on `host` or `registry`, look at the receiver: variables named `host`, `context.host`, or returned from a `createHost(...)`-style helper migrate. Variables named `registry` or returned from `createRegistry()` do NOT migrate.

After the migration: `pnpm --filter @gcscode/shell test 2>&1 | tail -20` should show test files compiling. Fix any remaining type errors in this file before continuing.

- [ ] **Step 5: Migrate `packages/shell/src/extension-host/extension-manager.test.ts`**

Same migration pattern as Step 4. This file also stands up test extensions whose `activate(context)` calls `context.host.registerX(...)`. Apply the migration mapping.

Plus any direct `host.executeCommand` / `host.getExtension` calls in helper code, if any.

- [ ] **Step 6: Migrate `packages/shell/src/app.test.ts`**

Same migration pattern. The file may have one or two test extensions; apply the migration to their `activate(context)` bodies.

- [ ] **Step 7: Migrate per-extension test files**

For each of:

- `packages/extension-example/src/index.test.ts`
- `packages/extension-sitl/src/index.test.ts`
- `packages/extension-vehicle-status/src/index.test.ts`

Search for any `host.register`, `host.executeCommand`, or `host.getExtension` references. The tests primarily exercise the actual extension's `activate()` against a fake registry/host, so most of the migration flows from the extension source changes (Steps 1–3). But some tests may also build inline host fakes — apply the migration mapping there too.

If a test file builds a "fake host" object with the OLD flat shape (e.g., `const fakeHost = { registerView: vi.fn(), ... }`), update it to the NAMESPACED shape:

```ts
// Before
const fakeHost = {
  registerView: vi.fn(),
  registerStatusBarItem: vi.fn(),
  registerCommand: vi.fn(),
  registerKeybinding: vi.fn(),
  executeCommand: vi.fn(),
  getExtension: vi.fn(),
};

// After
const fakeHost = {
  commands: {
    registerCommand: vi.fn(),
    executeCommand: vi.fn(),
  },
  window: {
    registerView: vi.fn(),
    registerStatusBarItem: vi.fn(),
  },
  keybindings: {
    registerKeybinding: vi.fn(),
  },
  extensions: {
    getExtension: vi.fn(),
  },
};
```

Update any assertions that read from the fake (e.g., `expect(fakeHost.registerView).toHaveBeenCalledWith(...)`) to read from the new path (e.g., `expect(fakeHost.window.registerView).toHaveBeenCalledWith(...)`).

- [ ] **Step 8: Verify the workspace passes type-check**

Run: `pnpm check`
Expected: exit 0 across all four packages. No TypeScript errors.

If any errors remain, they typically point at an un-migrated call site. Read the error message; it will name the file and line. Apply the migration mapping there.

- [ ] **Step 9: Verify all tests pass**

Run: `pnpm test`
Expected: all tests pass. Per-package counts unchanged from Task 1's baseline.

If any test fails, read the failure message:

- "Cannot read property 'registerCommand' of undefined" → host's namespace is undefined; check Steps 1–3.
- Type errors in test files → rerun Step 8.
- Behavioral test failures (e.g., "expected X to equal Y") → are NOT expected from this refactor. The migration is mechanical; assertions don't change. If you see a behavioral failure, the migration at that call site is wrong (e.g., you replaced `registry.executeCommand` with `registry.commands.executeCommand`). Investigate.

- [ ] **Step 10: Run prettier and lint**

Run: `pnpm format && pnpm lint`
Expected: minor whitespace adjustments possible; `pnpm lint` exits 0.

- [ ] **Step 11: Verify only the intended files are pending changes**

Run: `git status`
Expected: modified files (in some order):

- `packages/extension-example/src/index.ts`
- `packages/extension-sitl/src/index.ts`
- `packages/extension-vehicle-status/src/index.ts`
- `packages/shell/src/extension-host/registry.test.ts`
- `packages/shell/src/extension-host/extension-manager.test.ts`
- `packages/shell/src/app.test.ts`
- `packages/extension-example/src/index.test.ts`
- `packages/extension-sitl/src/index.test.ts`
- `packages/extension-vehicle-status/src/index.test.ts`

No other files. No untracked files.

If any other file appears, stop and investigate before committing.

- [ ] **Step 12: Commit**

```bash
git add packages/extension-example/src/index.ts \
        packages/extension-sitl/src/index.ts \
        packages/extension-vehicle-status/src/index.ts \
        packages/shell/src/extension-host/registry.test.ts \
        packages/shell/src/extension-host/extension-manager.test.ts \
        packages/shell/src/app.test.ts \
        packages/extension-example/src/index.test.ts \
        packages/extension-sitl/src/index.test.ts \
        packages/extension-vehicle-status/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(extensions): migrate first-party extensions to namespaced host

Migrates extension-example, extension-sitl, and extension-vehicle-status
to the namespaced ExtensionHost API per ADR-0006. Updates affected test
files (registry.test.ts, extension-manager.test.ts, app.test.ts, plus
the per-extension index.test.ts files) to call the namespaced methods.

Mechanical migration; no logic or assertion changes. Coverage unchanged.

After this commit, pnpm check, pnpm test, and pnpm lint all clean across
all four packages — the green state for the iteration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 13: Verify commit landed and the branch is in green state**

Run: `git log --oneline -4 && git status && pnpm check && pnpm test 2>&1 | tail -10 && pnpm lint`
Expected: HEAD = `feat(extensions): migrate first-party extensions to namespaced host`. Branch is `feat/extensionhost-namespacing`. `nothing to commit, working tree clean`. All three verification commands exit 0; tests pass with the same total count as Task 1's baseline.

---

### Task 5: Doc propagation (commit 4)

**Files:**

- Modify: `docs/decisions/ADR-0003-plugin-api-refinements.md`
- Modify: `docs/decisions/ADR-0005-extension-boundaries.md`
- Modify: `docs/vs-code-alignment.md`
- Modify: `docs/roadmap.md`
- Modify: `packages/extension-api/README.md`
- Modify: `packages/extension-example/README.md`
- Modify: `packages/extension-sitl/README.md`
- Modify: `packages/extension-vehicle-status/README.md`
- Modify: `CLAUDE.md`

This task lands all documentation propagation in a single commit. No code changes.

Each substep below specifies the exact edit. The full new content for `packages/extension-api/README.md` lives in the spec's `## packages/extension-api/README.md content (replacement)` section — copy it verbatim.

- [ ] **Step 1: Append follow-up bullet to `docs/decisions/ADR-0003-plugin-api-refinements.md`**

Find the existing `## Follow-ups` section near the end of the file. Append a new bullet at the END of the existing list:

```md
- The "Phase C: probably namespace the host once the flat surface exceeds 5–7 methods" forecast is now resolved by [ADR-0006](ADR-0006-extensionhost-namespacing.md) (2026-05-01), which adopts the topic-namespaced shape and migrates the three first-party extensions in the same iteration.
```

Don't touch the existing follow-up bullets or any other section of the ADR.

- [ ] **Step 2: Append follow-up bullet to `docs/decisions/ADR-0005-extension-boundaries.md`**

Find the existing `## Follow-ups` section near the end of the file. Append a new bullet at the END of the existing list:

```md
- The "Phase C namespacing trigger from ADR-0003 — Adding `getExtension` brings the flat surface on `ExtensionHost` to six methods. Still under the 5–7 trigger; defer namespacing per ADR-0003." follow-up is now resolved by [ADR-0006](ADR-0006-extensionhost-namespacing.md) (2026-05-01), which adopts the topic-namespaced shape concretely rather than waiting for the seventh-method add.
```

Don't touch the existing follow-up bullets or any other section.

- [ ] **Step 3: Append a new row to the Alignments table in `docs/vs-code-alignment.md`**

In `docs/vs-code-alignment.md`, find the **Alignments** table (the first table in the file, with 4 columns: `Concern | VS Code | gcscode | Source`). The existing last row reads:

```md
| Vocabulary — "extension" everywhere in code and docs | ✓ | ✓ (renamed from "plugin" 2026-04-27) | [ADR-0004](decisions/ADR-0004-rename-plugin-to-extension.md) |
```

Append immediately after that row, as a new last row of the Alignments table:

```md
| Topic-namespaced host API (`commands.*`, `window.*`, `extensions.*`) | ✓ | ✓ | [ADR-0006](decisions/ADR-0006-extensionhost-namespacing.md) |
```

Don't touch the Divergences or Deferrals tables.

- [ ] **Step 4: Update `docs/roadmap.md` Phase C section**

Find the `### Phase C — Cross-cutting capabilities` section. Replace the existing single bullet:

```md
- [ ] **Phase C scope** — TBD. ADR-0003 sketches host namespacing (`host.commands.register(...)`) once the flat surface exceeds 5–7 methods, plus events, settings, themes, and i18n as real consumers pull on them. Re-scope when a feature extension pulls on it.
```

with two bullets:

```md
- [x] **C1: ExtensionHost namespacing** — host API moves from flat (`registerCommand`, `registerStatusBarItem`, ...) to topic-namespaced (`host.commands.registerCommand`, `host.window.registerStatusBarItem`, ...). Spec: [`specs/2026-05-01-extensionhost-namespacing.md`](specs/2026-05-01-extensionhost-namespacing.md). ADR: [`decisions/ADR-0006-extensionhost-namespacing.md`](decisions/ADR-0006-extensionhost-namespacing.md).
- [ ] **C2+: events, settings, themes, i18n** — TBD. Each lands as a new namespace under `host.*` when a feature extension pulls on it. Re-scope per-capability when triggered.
```

Don't touch the Phase A, Phase B, Feature extensions, or Maintenance sections.

- [ ] **Step 5: Replace `packages/extension-api/README.md` with the spec's verbatim content**

Open the spec at `docs/specs/2026-05-01-extensionhost-namespacing.md` and locate its `## packages/extension-api/README.md content (replacement)` section. Copy the full content of the fenced block (between the outer ` ` `` ` ```md ` `` ` ` fences) into `packages/extension-api/README.md`, replacing all current content of that file.

Verify (via `head -5 packages/extension-api/README.md`) the file now starts with:

```
# @gcscode/extension-api

The only import path for extensions. Everything an extension is allowed to do flows through the types in this package.
```

And ends with the `Conventions for extension authors` section.

- [ ] **Step 6: Update `packages/extension-example/README.md` — four method references**

Find the prose paragraph in the "What it demonstrates" section that begins:

> "Inside `activate`, it calls `context.host.registerView`, `context.host.registerStatusBarItem`, `context.host.registerCommand`, and `context.host.registerKeybinding`, ..."

Replace those four method references with the namespaced form so the paragraph reads:

> "Inside `activate`, it calls `context.host.window.registerView`, `context.host.window.registerStatusBarItem`, `context.host.commands.registerCommand`, and `context.host.keybindings.registerKeybinding`, ..."

The rest of the paragraph (everything after the four method references, which describes what the extension demonstrates), the Anatomy diagram, the contribution list, and the copy-this-extension instructions are unchanged.

- [ ] **Step 7: Update `packages/extension-sitl/README.md` — one inline-code reference**

In the "Cross-extension exports" section, find:

```md
Exports `SitlExports = { telemetry: Readonly<TelemetryState> }`. Consumers read live telemetry via `host.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry`. The `telemetry` field is a Svelte `$state` proxy ...
```

Update only the inline code:

```md
Exports `SitlExports = { telemetry: Readonly<TelemetryState> }`. Consumers read live telemetry via `host.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry`. The `telemetry` field is a Svelte `$state` proxy ...
```

Only the `host.getExtension` → `host.extensions.getExtension` portion changes. The rest of the README is unchanged.

- [ ] **Step 8: Update `packages/extension-vehicle-status/README.md` — one inline-code reference**

In the "Contributions" section, find:

```md
- **Status bar item** — `gcscode.vehicle-status.summary`, left-aligned. Renders a Svelte component that reads `host.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry` reactively.
```

Update only the inline code:

```md
- **Status bar item** — `gcscode.vehicle-status.summary`, left-aligned. Renders a Svelte component that reads `host.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry` reactively.
```

Only the `host.getExtension` → `host.extensions.getExtension` portion changes. The rest of the README is unchanged.

- [ ] **Step 9: Update `CLAUDE.md` — Boundary rule corollary sentence**

Find the corollary paragraph in the `## Boundary rule — load bearing` section (the paragraph beginning "Corollary: if an extension needs a capability the host doesn't yet expose..."). The current text:

```md
Corollary: if an extension needs a capability the host doesn't yet expose, add it to `@gcscode/extension-api` first (as a new method on `ExtensionHost` — typically a `register*` for a new kind, or a verb like `executeCommand` — or a new field on `ExtensionContext`), land that, then use it. Never reach around the API.
```

Replace with:

```md
Corollary: if an extension needs a capability the host doesn't yet expose, add it to `@gcscode/extension-api` first (as a new method under one of the existing `ExtensionHost` namespaces — `host.commands.*`, `host.window.*`, `host.keybindings.*`, `host.extensions.*` — or as a new namespace if the capability is cross-cutting; or a new field on `ExtensionContext`), land that, then use it. Never reach around the API.
```

Don't touch any other part of `CLAUDE.md`.

- [ ] **Step 10: Run prettier and lint**

Run: `pnpm format && pnpm lint`
Expected: minor whitespace adjustments possible (most likely on the README replacement and the markdown tables); `pnpm lint` exits 0.

- [ ] **Step 11: Verify only the intended files are pending changes**

Run: `git status`
Expected: modified (in some order):

- `docs/decisions/ADR-0003-plugin-api-refinements.md`
- `docs/decisions/ADR-0005-extension-boundaries.md`
- `docs/vs-code-alignment.md`
- `docs/roadmap.md`
- `packages/extension-api/README.md`
- `packages/extension-example/README.md`
- `packages/extension-sitl/README.md`
- `packages/extension-vehicle-status/README.md`
- `CLAUDE.md`

No other files. No untracked files.

- [ ] **Step 12: Commit**

```bash
git add docs/decisions/ADR-0003-plugin-api-refinements.md \
        docs/decisions/ADR-0005-extension-boundaries.md \
        docs/vs-code-alignment.md \
        docs/roadmap.md \
        packages/extension-api/README.md \
        packages/extension-example/README.md \
        packages/extension-sitl/README.md \
        packages/extension-vehicle-status/README.md \
        CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: ADR-0006 propagation — ledger, roadmap, READMEs, ADR-0003/0005 follow-ups, CLAUDE.md

Propagates the ExtensionHost namespacing decision to all dependent docs:
- ADR-0003 + ADR-0005 follow-up notes pointing forward to ADR-0006
- New Alignments row in vs-code-alignment.md
- Phase C section flips from "TBD" to C1 shipped + C2+ TBD
- extension-api/README.md comprehensive refresh covering all four namespaces
- extension-example, extension-sitl, extension-vehicle-status README updates
- CLAUDE.md Boundary rule corollary updated to mention namespaces

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 13: Verify commit landed**

Run: `git log --oneline -5 && git status`
Expected: HEAD = `docs: ADR-0006 propagation — ledger, roadmap, READMEs, ADR-0003/0005 follow-ups, CLAUDE.md`. Branch is `feat/extensionhost-namespacing`. `nothing to commit, working tree clean`. The four feature-branch commits are all visible in the log.

---

### Task 6: End-to-end verification

**Files:** none

This task validates that the branch is fully ready to merge.

- [ ] **Step 1: Re-verify lint, check, test all clean**

Run: `pnpm lint && pnpm check && pnpm test`
Expected: all three exit 0. Test counts unchanged from Task 1's baseline.

- [ ] **Step 2: Manual smoke test via dev server**

Run: `pnpm dev` (this starts the Vite dev server)
In a browser at the dev URL: confirm the app boots; the example view + SITL view + vehicle-status footer item all render; press `Alt+Shift+G` (greet command logs to console); press `Alt+Shift+L` (SITL location logs to console); confirm no console errors. The vehicle-status footer should display SITL telemetry once the mavlink2rest bridge is available (or `SITL: —` / `SITL: connecting…` / `SITL: disconnected` in its absence).

Stop the dev server with `Ctrl+C`.

- [ ] **Step 3: Manual link-target check on doc updates**

The new ADR-0006 references existing ADRs and the spec; the spec references the ADR; the roadmap references both. Confirm:

```bash
ls docs/decisions/ADR-0003-plugin-api-refinements.md \
   docs/decisions/ADR-0005-extension-boundaries.md \
   docs/decisions/ADR-0006-extensionhost-namespacing.md \
   docs/specs/2026-05-01-extensionhost-namespacing.md \
   docs/specs/2026-05-01-vs-code-alignment-ledger.md \
   docs/vs-code-alignment.md \
   docs/roadmap.md
```

Expected: all seven paths listed without "No such file or directory" errors.

- [ ] **Step 4: Final feature-branch git log**

Run: `git log --oneline master..HEAD`
Expected (top to bottom):

- `<sha> docs: ADR-0006 propagation — ledger, roadmap, READMEs, ADR-0003/0005 follow-ups, CLAUDE.md`
- `<sha> feat(extensions): migrate first-party extensions to namespaced host`
- `<sha> feat(shell): namespaced host factory in registry`
- `<sha> feat(extension-api): namespaced ExtensionHost — commands/window/keybindings/extensions`

Four feature-branch commits, in order.

---

### Task 7: Merge feature branch to master

**Files:** none (merge operation)

Use `superpowers:finishing-a-development-branch` for this step (per CLAUDE.md's subagent-driven plan execution discipline). The merge uses `--no-ff` to preserve the feature-branch boundary in `git log`.

- [ ] **Step 1: Switch to master**

Run: `git checkout master`
Expected: branch is `master`. Working tree clean.

- [ ] **Step 2: Merge feature branch with `--no-ff`**

Run: `git merge --no-ff feat/extensionhost-namespacing`
Expected: merge commit lands at HEAD. The merge commit message defaults to `Merge branch 'feat/extensionhost-namespacing'` — accept the default.

- [ ] **Step 3: Verify the merge commit and final history**

Run: `git log --oneline -8`
Expected (top to bottom):

- `<sha> Merge branch 'feat/extensionhost-namespacing'`
- `<sha> docs: ADR-0006 propagation — ledger, roadmap, READMEs, ADR-0003/0005 follow-ups, CLAUDE.md`
- `<sha> feat(extensions): migrate first-party extensions to namespaced host`
- `<sha> feat(shell): namespaced host factory in registry`
- `<sha> feat(extension-api): namespaced ExtensionHost — commands/window/keybindings/extensions`
- `98dc21d docs: ADR-0006 + Phase C1 spec for ExtensionHost namespacing`
- `5e097e9 docs: add VS Code alignment ledger + CLAUDE.md propagation rule`
- `1ab938f docs: refresh stale references in extension READMEs and out-of-scope.md`

The four feature-branch commits remain visible in the history (preserved by `--no-ff`).

- [ ] **Step 4: Final verification on master**

Run: `pnpm lint && pnpm check && pnpm test`
Expected: all three exit 0.

- [ ] **Step 5: Optional — delete the merged feature branch**

Run: `git branch -d feat/extensionhost-namespacing`
Expected: branch deleted (it's fully merged, so `-d` succeeds without `-D`).

If the user prefers to keep the branch around for reference, skip this step.

---

## Out of scope reminders

These are intentionally NOT part of this iteration (see the spec's `## Non-goals`):

- No `Registry` namespacing.
- No type renames (`ViewContribution` stays as is, etc.).
- No deprecation period — hard break.
- No new test patterns; coverage and assertions unchanged.
- No new contribution kinds.
- No changes to contribution interfaces (`ViewContribution`, `StatusBarItemContribution`, etc.) themselves.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note

This iteration is a refactor with a deliberate intermediate broken state between commits 1 and 3. Subagents implementing each task must NOT "fix" type / test failures by reverting interface changes during commits 1 and 2. The fix is the next commit. Commit 3 is the green state.

Subagent-driven plan execution per CLAUDE.md: each task gets a fresh implementer subagent followed by spec compliance + code quality reviews; review feedback lands as separate `Code-review-followup:` commits on the same `feat/extensionhost-namespacing` branch (not amends). After all four feat commits land (and any followups), dispatch a final cross-cutting code review over the full branch before invoking `superpowers:finishing-a-development-branch` for the merge.
