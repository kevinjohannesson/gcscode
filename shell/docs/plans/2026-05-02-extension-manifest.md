# Extension manifest — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift presentation metadata off `Extension` into a structured `manifest: ExtensionManifest` field; migrate the three first-party extensions plus the workbench built-in plus all touched tests in the same iteration; rename the host-side `extension-manifest.ts` to `bundled-extensions.ts` to free the term for the public concept.

**Architecture:** Hard break refactor on a `feat/extension-manifest` branch off master, merged with `--no-ff`. Five feat-branch commits land in dependency order: api types → shell host (registry + manager) identity reads → host-side file rename + main.ts → consumers (extensions + workbench + tests) → docs. Iteration scope is descriptive metadata only (`description?` is the one new field); the contributes manifest stays deferred.

**Tech Stack:** TypeScript, Svelte 5 (unchanged), Vitest, ESLint + Prettier, pnpm workspaces. No new tooling.

**Spec:** [`docs/specs/2026-05-02-extension-manifest.md`](../specs/2026-05-02-extension-manifest.md)
**ADR:** [`docs/decisions/ADR-0007-extension-manifest.md`](../decisions/ADR-0007-extension-manifest.md)

---

## Important — this iteration is a refactor with intermediate broken states

Commits 1, 2, 3 progressively land the new shape. Type compilation and tests are in a TEMPORARY non-passing state between commit 1 and commit 4. They reach green at the END of commit 4.

This is deliberate (per the spec's `## Branching and commit` section) — it makes each commit a logically coherent diff for review. Subagents executing each task:

- **After commit 1** (`feat(extension-api): introduce ExtensionManifest; Extension owns manifest field`): `pnpm check` will fail in `@gcscode/shell` (registry + extension-manager still read flat `extension.id` etc.) and across all extension packages (their literals still use the flat shape). DO NOT "fix" by reverting interface changes — the next commits fix the consumer side.
- **After commit 2** (`feat(shell): registry + extension-manager read identity via extension.manifest`): the registry source and extension-manager source themselves typecheck against the new types, but `extension-manifest.ts` (still named that) imports the four extensions whose literals still use the flat shape — so `@gcscode/shell` as a whole does not yet typecheck. Tests still construct flat literals. Intermediate state. DO NOT "fix" by reverting.
- **After commit 3** (`feat: rename host-side extension-manifest.ts → bundled-extensions.ts`): file rename done; the host source code is internally consistent with the new types, but the imported extensions still have the old flat shape, and the test files still construct flat literals — so the workspace still doesn't typecheck. DO NOT "fix" by reverting.
- **After commit 4** (`feat(extensions): migrate first-party extensions and workbench to manifest-shaped Extension`): `pnpm check` clean across all four packages, `pnpm test` passes, `pnpm lint` clean. **Green state.**
- **After commit 5** (`docs: ADR-0007 propagation`): docs only — no impact on type/test state. Workspace stays green.

When in doubt about whether a `pnpm check` / `pnpm test` failure is expected: which commit are you implementing? Refer to the table above.

---

## File structure

| Path                                                                                                           | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-api/src/index.ts`                                                                          | Add new `ExtensionManifest` interface directly after `ExtensionIdentity`. Rewrite `Extension` interface — drop `extends ExtensionIdentity`, gain `readonly manifest: ExtensionManifest`. All other interfaces unchanged. (Task 2.)                                                                                                                                                                              |
| `packages/shell/src/extension-host/registry.ts`                                                                | Three identity reads inside `activate(extension)` change source: `extension.X` → `extension.manifest.X`. Local `identity` shape unchanged. Everything else byte-identical. (Task 3.)                                                                                                                                                                                                                          |
| `packages/shell/src/extension-host/extension-manager.ts`                                                       | Reshape `ExtensionRecord` from flat to nested `{ readonly manifest, readonly enabled }`. Rewrite `toRecord`. Update three `extension.id` reads in `register` to `extension.manifest.id`. Add `ExtensionManifest` import. (Task 3.)                                                                                                                                                                              |
| `packages/shell/src/extension-host/extension-manifest.ts` → `bundled-extensions.ts` (renamed)                  | File renamed (free up the "manifest" term). `ManifestEntry` → `BundledExtensionEntry`. Each row's `id: ext.id` → `id: ext.manifest.id`. New header docstring. (Task 4.)                                                                                                                                                                                                                                       |
| `packages/shell/src/extension-host/extension-manifest.test.ts` → `bundled-extensions.test.ts` (renamed)        | File renamed. Import path updates from `./extension-manifest` to `./bundled-extensions`. (Task 4.)                                                                                                                                                                                                                                                                                                            |
| `packages/shell/src/main.ts`                                                                                   | One import-path line updates. (Task 4.)                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/extension-example/src/index.ts`                                                                      | Migrate `exampleExtension` literal to manifest shape; add `description`. (Task 5.)                                                                                                                                                                                                                                                                                                                            |
| `packages/extension-sitl/src/index.ts`                                                                         | Migrate `sitlExtension` literal; add `description`. (Task 5.)                                                                                                                                                                                                                                                                                                                                                 |
| `packages/extension-vehicle-status/src/index.ts`                                                               | Migrate `vehicleStatusExtension` literal; add `description`. (Task 5.)                                                                                                                                                                                                                                                                                                                                        |
| `packages/shell/src/built-in/workbench/index.ts`                                                               | Migrate `createWorkbenchExtension` returned literal to manifest shape; add `description`. (Task 5.)                                                                                                                                                                                                                                                                                                           |
| `packages/shell/src/extension-host/registry.test.ts`                                                           | Migrate ~14 `Extension` literals to manifest shape. (Task 5.)                                                                                                                                                                                                                                                                                                                                                  |
| `packages/shell/src/extension-host/extension-manager.test.ts`                                                  | Migrate ~17 `Extension` literals; update `manager.listExtensions()` assertions to nested `ExtensionRecord` shape. (Task 5.)                                                                                                                                                                                                                                                                                    |
| `packages/shell/src/app.test.ts`                                                                               | Migrate one `Extension` literal. (Task 5.)                                                                                                                                                                                                                                                                                                                                                                    |
| `packages/shell/src/built-in/workbench/index.test.ts`                                                          | Migrate two `Extension` literals. (Task 5.)                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/extension-example/src/index.test.ts`                                                                 | Migrate two `Extension` literals. (Task 5.)                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/extension-sitl/src/index.test.ts`                                                                    | Migrate two `Extension` literals. (Task 5.)                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/extension-vehicle-status/src/index.test.ts`                                                          | Migrate three `Extension` literals. (Task 5.)                                                                                                                                                                                                                                                                                                                                                                 |
| `packages/extension-api/README.md`                                                                             | REPLACE with the spec's full content from the "## `packages/extension-api/README.md` content (replacement)" section. (Task 6.)                                                                                                                                                                                                                                                                                |
| `packages/extension-example/README.md`                                                                         | Three small edits (What it demonstrates third bullet, Anatomy file-tree comment, "To write your own extension..." paragraph). (Task 6.)                                                                                                                                                                                                                                                                       |
| `docs/roadmap.md`                                                                                              | B4 line clarified; new B5 line added. (Task 6.)                                                                                                                                                                                                                                                                                                                                                               |
| `docs/vs-code-alignment.md`                                                                                    | Existing Divergences row "Extension shape" updated; new Alignments row appended. (Task 6.)                                                                                                                                                                                                                                                                                                                    |
| `docs/decisions/ADR-0003-plugin-api-refinements.md`                                                            | Append one new follow-up bullet pointing at ADR-0007. (Task 6.)                                                                                                                                                                                                                                                                                                                                               |
| `docs/out-of-scope.md`                                                                                         | Rewrite "Declarative `contributes` manifest" entry with sharper trigger language. (Task 6.)                                                                                                                                                                                                                                                                                                                  |

No changes to `@gcscode/extension-api/README.md` Cross-extension-exports section beyond the example literal shape. No changes to ADRs other than ADR-0003. No changes to `CLAUDE.md`.

---

### Task 1: Establish green baseline + create feature branch

**Files:** none (state-verification task; creates the branch)

- [ ] **Step 1: Verify on master with clean working tree**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `master`. HEAD should be the most recent docs commit landing the spec + ADR + this plan (or a later docs commit if more landed).

- [ ] **Step 2: Verify lint, check, test all clean at baseline**

Run: `pnpm lint && pnpm check && pnpm test`
Expected: all three pass. Tests pass cleanly across `@gcscode/shell`, `@gcscode/extension-example`, `@gcscode/extension-sitl`, `@gcscode/extension-vehicle-status`. `@gcscode/extension-api` reports no test files, exits 0. Note the total test counts for later comparison.

- [ ] **Step 3: Create the feature branch**

Run: `git checkout -b feat/extension-manifest`
Expected: branch created and checked out. `git branch --show-current` reads `feat/extension-manifest`.

- [ ] **Step 4: Confirm branch position**

Run: `git log --oneline -3`
Expected: HEAD is the spec+ADR+plan commit (or wherever master was when the branch was created); no new commits on the branch yet.

---

### Task 2: Add `ExtensionManifest`; rewrite `Extension` shape (commit 1)

**Files:**

- Modify: `packages/extension-api/src/index.ts`

This task adds the new `ExtensionManifest` interface and rewrites the `Extension` interface to drop the `extends ExtensionIdentity` and gain `readonly manifest: ExtensionManifest`. All other interfaces in the file (`Disposable`, `ViewContribution`, `StatusBarItemContribution`, `CommandContribution`, `KeybindingContribution`, `QuickPickItem`, `QuickPickOptions`, `ExtensionIdentity`, `ExtensionHost`, `ExtensionContext`) are NOT touched.

After this commit, `pnpm check` will fail in `@gcscode/shell` (registry + extension-manager read flat `extension.id` etc.) AND in all extension packages (their literals still use the flat shape). THIS IS EXPECTED. Do not revert the interface change. Subsequent tasks (3, 4, 5) fix the consumer side.

- [ ] **Step 1: Open `packages/extension-api/src/index.ts` and locate the `ExtensionIdentity` interface**

It currently appears at lines ~93–97:

```ts
/**
 * Identity metadata for an extension — stable across activations; used by the
 * host for logs, errors, and (later) per-extension permission scoping.
 */
export interface ExtensionIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
}
```

It is unchanged. Do not modify it.

- [ ] **Step 2: Insert the new `ExtensionManifest` interface directly after `ExtensionIdentity`**

Add this block immediately after `ExtensionIdentity` (before the existing `ExtensionHost` interface):

```ts
/**
 * Per-extension declaration metadata. Extends `ExtensionIdentity` with
 * presentation fields used by host UI (e.g. the marketplace / extensions panel).
 *
 * Iteration scope is descriptive metadata only: identity (`id`, `displayName`,
 * `version`) and `description?`. Future descriptive fields (`category?`,
 * `icon?`, `categories?`) land per-field on this interface as real consumers
 * pull on them. Declarative `contributes` arrays (commands, views, keybindings
 * as static lists) are deferred under sharper trigger language; see ADR-0007.
 */
export interface ExtensionManifest extends ExtensionIdentity {
  /**
   * One-line user-facing description. Rendered by host UI (extensions panel
   * rows, marketplace previews) when present. No length cap; UIs may truncate.
   */
  readonly description?: string;
}
```

- [ ] **Step 3: Locate the existing `Extension` interface**

It currently appears at the bottom of the file (lines ~181–184):

```ts
/**
 * An extension module's named export. Identity fields give the host extension
 * identity for diagnostics; `activate(context)` is the single entry point.
 * Returning a value from `activate()` publishes that value as the extension's
 * exports — other extensions can look it up via `host.extensions.getExtension(id)` (see
 * ADR-0005). Producers that don't expose an API may return nothing.
 *
 * `deactivate?()` is an optional hook for non-disposable / async cleanup. The
 * host awaits the returned Promise (if any) before tearing down subscriptions.
 */
export interface Extension extends ExtensionIdentity {
  activate(context: ExtensionContext): unknown;
  deactivate?(): void | Promise<void>;
}
```

- [ ] **Step 4: Replace the entire `Extension` interface (including its docstring) with the new shape**

```ts
/**
 * An extension module's named export. The `manifest` carries identity and
 * descriptive metadata; `activate(context)` is the single entry point.
 *
 * Returning a value from `activate()` publishes that value as the extension's
 * exports — other extensions can look it up via
 * `host.extensions.getExtension(id)` (see ADR-0005). Producers that don't
 * expose an API may return nothing.
 *
 * `deactivate?()` is an optional hook for non-disposable / async cleanup. The
 * host awaits the returned Promise (if any) before tearing down subscriptions.
 *
 * See ADR-0007 for the manifest's shape and growth conventions.
 */
export interface Extension {
  readonly manifest: ExtensionManifest;
  activate(context: ExtensionContext): unknown;
  deactivate?(): void | Promise<void>;
}
```

Note specifically: `Extension` no longer has `extends ExtensionIdentity`. The identity fields move into `manifest`.

- [ ] **Step 5: Verify the api package types are internally consistent**

Run: `pnpm --filter @gcscode/extension-api check`
Expected: exit 0. The api package has no internal consumers of `Extension` — only declares the type — so this should pass cleanly even though every downstream consumer is now broken.

- [ ] **Step 6: Verify only the intended file is changed**

Run: `git status`
Expected: modified: `packages/extension-api/src/index.ts`. No other files. No untracked files.

- [ ] **Step 7: Run prettier on the modified file**

Run: `pnpm format`
Expected: prettier rewrites whitespace if needed; `git status` continues to show only `packages/extension-api/src/index.ts` modified.

- [ ] **Step 8: Commit**

```bash
git add packages/extension-api/src/index.ts
git commit -m "$(cat <<'EOF'
feat(extension-api): introduce ExtensionManifest; Extension owns manifest field

Adds new ExtensionManifest interface (extends ExtensionIdentity with
optional description?). Rewrites Extension to carry a readonly
manifest: ExtensionManifest field instead of extending ExtensionIdentity
directly. Identity moves into manifest; description? is the one new
descriptive field this iteration. Per ADR-0007.

This commit alone leaves @gcscode/shell, the workbench built-in, and
all three first-party extensions failing type-check. Commit 2 fixes
the shell host code; commit 3 renames the host-side bundling list;
commit 4 migrates the four extensions and all tests. Tests reach green
at commit 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify commit landed on the feature branch**

Run: `git log --oneline -2 && git branch --show-current`
Expected: HEAD is the new commit `feat(extension-api): introduce ExtensionManifest; Extension owns manifest field`. Branch is `feat/extension-manifest`. `nothing to commit, working tree clean`.

---

### Task 3: Update shell registry + extension-manager to read identity via manifest (commit 2)

**Files:**

- Modify: `packages/shell/src/extension-host/registry.ts`
- Modify: `packages/shell/src/extension-host/extension-manager.ts`

This task changes three identity reads inside `registry.ts`'s `activate(extension)` and the `ExtensionRecord` shape + reads inside `extension-manager.ts`. The host's source-side internal logic becomes consistent with the new `Extension` interface, but `bundled-extensions.ts` (still named `extension-manifest.ts`) imports the extensions whose literals still use flat shape — so the shell package as a whole still doesn't typecheck. THIS IS EXPECTED.

#### Sub-section A: `registry.ts`

- [ ] **Step 1: Open `packages/shell/src/extension-host/registry.ts` and locate `activate(extension)`**

The body is at lines ~150–166. Inside it, three lines build a local `identity: ExtensionIdentity` from the incoming `extension`:

```ts
    activate(extension) {
      const identity: ExtensionIdentity = {
        id: extension.id,
        displayName: extension.displayName,
        version: extension.version,
      };
      const context: ExtensionContext = {
        host: createHost(identity),
        subscriptions: [],
        extension: identity,
      };
      const exportsValue = extension.activate(context);
      subscriptionsByExtension.set(identity.id, context.subscriptions);
      if (extension.deactivate) {
        deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
      }
      exportsByExtension.set(identity.id, exportsValue);
    },
```

- [ ] **Step 2: Update the three identity reads to source from `extension.manifest`**

Replace the three property assignments inside the `identity` object literal:

```diff
     activate(extension) {
       const identity: ExtensionIdentity = {
-        id: extension.id,
-        displayName: extension.displayName,
-        version: extension.version,
+        id: extension.manifest.id,
+        displayName: extension.manifest.displayName,
+        version: extension.manifest.version,
       };
       const context: ExtensionContext = {
         host: createHost(identity),
         subscriptions: [],
         extension: identity,
       };
       const exportsValue = extension.activate(context);
       subscriptionsByExtension.set(identity.id, context.subscriptions);
       if (extension.deactivate) {
         deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
       }
       exportsByExtension.set(identity.id, exportsValue);
     },
```

The `identity` object's shape is unchanged (still `ExtensionIdentity`). Only the source path of the three values changes.

- [ ] **Step 3: Verify NO other lines in `registry.ts` need to change**

Important: `createHost` takes `extension: ExtensionIdentity`, not `Extension`. The `extension.id` references inside `createHost`'s body (at the error-message strings on lines ~59, 74, 81, 98, 125) read from the `ExtensionIdentity` parameter; `ExtensionIdentity.id` still exists post-migration. Those lines are NOT changed.

Also verify no stray `extension.displayName` or `extension.version` reads outside the `identity` object literal exist. Run:

```bash
grep -n 'extension\.\(id\|displayName\|version\)' packages/shell/src/extension-host/registry.ts
```

Expected output: only the three lines you just edited (now reading `extension.manifest.X`), plus the five `${extension.id}` references inside `createHost`'s error messages (those are reading from the ExtensionIdentity parameter; do NOT change them).

#### Sub-section B: `extension-manager.ts`

- [ ] **Step 4: Open `packages/shell/src/extension-host/extension-manager.ts` and locate the imports**

The current top of the file:

```ts
import { SvelteMap } from 'svelte/reactivity';

import type { Extension } from '@gcscode/extension-api';

import type { Registry } from './registry';
```

- [ ] **Step 5: Add `ExtensionManifest` to the type imports**

```diff
 import { SvelteMap } from 'svelte/reactivity';

-import type { Extension } from '@gcscode/extension-api';
+import type { Extension, ExtensionManifest } from '@gcscode/extension-api';

 import type { Registry } from './registry';
```

- [ ] **Step 6: Reshape `ExtensionRecord` from flat to nested**

Locate the existing `ExtensionRecord` interface (lines ~12–17):

```ts
export interface ExtensionRecord {
  id: string;
  displayName: string;
  version: string;
  enabled: boolean;
}
```

Replace with:

```ts
export interface ExtensionRecord {
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
}
```

- [ ] **Step 7: Rewrite `toRecord` to match the new shape**

Locate the existing `toRecord` helper (lines ~25–32):

```ts
function toRecord(state: ExtensionState): ExtensionRecord {
  return {
    id: state.extension.id,
    displayName: state.extension.displayName,
    version: state.extension.version,
    enabled: state.enabled,
  };
}
```

Replace with:

```ts
function toRecord(state: ExtensionState): ExtensionRecord {
  return {
    manifest: state.extension.manifest,
    enabled: state.enabled,
  };
}
```

- [ ] **Step 8: Update three `extension.id` reads inside `register`**

Locate the `register` method body (lines ~48–57):

```ts
    register(extension, registerOptions) {
      if (extensions.has(extension.id)) {
        throw new Error(`Extension id "${extension.id}" is already registered.`);
      }
      const enabled = registerOptions?.enabled ?? true;
      extensions.set(extension.id, { extension, enabled });
      if (enabled) {
        registry.activate(extension);
      }
    },
```

Replace with:

```ts
    register(extension, registerOptions) {
      if (extensions.has(extension.manifest.id)) {
        throw new Error(`Extension id "${extension.manifest.id}" is already registered.`);
      }
      const enabled = registerOptions?.enabled ?? true;
      extensions.set(extension.manifest.id, { extension, enabled });
      if (enabled) {
        registry.activate(extension);
      }
    },
```

The three `extension.id` reads become `extension.manifest.id`. The body's structure is otherwise unchanged.

- [ ] **Step 9: Verify `setEnabled` is unchanged**

Important: `setEnabled` takes an `id` parameter directly (not an `extension`); no reads change. Skim its body at lines ~58–73 to confirm.

The `listExtensions` method at lines ~74–76 calls `toRecord` which you already updated; nothing else to do there.

- [ ] **Step 10: Verify the shell source files compile (registry + extension-manager only)**

Run: `pnpm --filter @gcscode/extension-api check && pnpm --filter @gcscode/shell check 2>&1 | grep -E '(error|TS)' | grep -v 'Found 0 errors' || echo 'OK'`

Expected: errors will appear at sites that still construct `Extension` literals with the flat shape — `bundled-extensions.ts` (still named `extension-manifest.ts`), `main.ts` (transitively, via the import), the workbench built-in, and every test file. These are EXPECTED and resolved in subsequent tasks. No errors should originate inside `registry.ts` or `extension-manager.ts` themselves.

Specifically: errors of the form `Property 'manifest' is missing in type ...` at the call sites of `manager.register(extensionLiteral)` are expected. Errors inside `registry.ts` or `extension-manager.ts` (e.g., `Property 'id' does not exist on type 'Extension'`) would mean a Step was missed.

- [ ] **Step 11: Verify only the intended files are changed**

Run: `git status`
Expected: modified: `packages/shell/src/extension-host/registry.ts` and `packages/shell/src/extension-host/extension-manager.ts`. No other files.

- [ ] **Step 12: Run prettier**

Run: `pnpm format`
Expected: minor whitespace adjustments possible; only the two files remain modified.

- [ ] **Step 13: Commit**

```bash
git add packages/shell/src/extension-host/registry.ts \
        packages/shell/src/extension-host/extension-manager.ts
git commit -m "$(cat <<'EOF'
feat(shell): registry + extension-manager read identity via extension.manifest

registry.ts: three identity reads inside activate() now source from
extension.manifest.* instead of extension.* directly. Local ExtensionIdentity
shape unchanged. createHost's error-message references to extension.id
read from the ExtensionIdentity parameter and are not touched.

extension-manager.ts: ExtensionRecord reshapes from flat
{id,displayName,version,enabled} to nested {manifest, enabled}. toRecord
rewrites accordingly. register's three extension.id reads become
extension.manifest.id.

The host source code is internally consistent with the new types after
this commit, but bundled-extensions.ts (still named extension-manifest.ts)
imports the four extensions whose literals still use the flat shape, and
the test files still construct flat literals — so the workspace as a
whole does not yet typecheck. Commit 3 renames the host-side file;
commit 4 migrates the four extensions and all tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 14: Verify commit landed**

Run: `git log --oneline -3 && git status`
Expected: HEAD = `feat(shell): registry + extension-manager read identity via extension.manifest`. HEAD~1 = Task 2's commit. `nothing to commit, working tree clean`.

---

### Task 4: Rename `extension-manifest.ts` → `bundled-extensions.ts`; update `main.ts` (commit 3)

**Files:**

- Rename: `packages/shell/src/extension-host/extension-manifest.ts` → `packages/shell/src/extension-host/bundled-extensions.ts`
- Rename: `packages/shell/src/extension-host/extension-manifest.test.ts` → `packages/shell/src/extension-host/bundled-extensions.test.ts`
- Modify: `packages/shell/src/main.ts`

This task does the file rename + internals update + main.ts import-path fix. After this, the shell's source-side is fully consistent with the new types AND the file rename is complete. Tests and extensions still fail to typecheck (test files construct flat literals; the four extension packages' `*Extension` exports use flat shape) — those resolve in Task 5.

- [ ] **Step 1: Rename the file pair using `git mv`**

Run:
```bash
git mv packages/shell/src/extension-host/extension-manifest.ts packages/shell/src/extension-host/bundled-extensions.ts
git mv packages/shell/src/extension-host/extension-manifest.test.ts packages/shell/src/extension-host/bundled-extensions.test.ts
```
Expected: both renames succeed silently. `git status` shows the renames as `R extension-manifest.ts -> bundled-extensions.ts` (and similarly for the test file).

- [ ] **Step 2: Open the renamed `bundled-extensions.ts` and rewrite its contents**

The current content:

```ts
import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';
import { sitlExtension } from '@gcscode/extension-sitl';
import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status';

export interface ManifestEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
  { id: sitlExtension.id, extension: sitlExtension },
  // Must come after sitlExtension — vehicle-status reads SITL exports during
  // first render and relies on insertion-order activation. See ADR-0005's
  // "Cross-extension activation order is not guaranteed" consequence.
  { id: vehicleStatusExtension.id, extension: vehicleStatusExtension },
];
```

Replace it with:

```ts
// Host-side list of which extensions to bundle into this build. NOT the
// public per-extension manifest (that's ExtensionManifest in
// @gcscode/extension-api). See ADR-0007.

import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';
import { sitlExtension } from '@gcscode/extension-sitl';
import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status';

export interface BundledExtensionEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly BundledExtensionEntry[] = [
  { id: exampleExtension.manifest.id, extension: exampleExtension },
  { id: sitlExtension.manifest.id, extension: sitlExtension },
  // Must come after sitlExtension — vehicle-status reads SITL exports during
  // first render and relies on insertion-order activation. See ADR-0005's
  // "Cross-extension activation order is not guaranteed" consequence.
  { id: vehicleStatusExtension.manifest.id, extension: vehicleStatusExtension },
];
```

Three changes vs. the original:

1. Header docstring added (the leading two-line `//` comment).
2. `ManifestEntry` interface renamed to `BundledExtensionEntry`; type annotation on `bundledExtensions` follows.
3. Each row's `id: ext.id` updates to `id: ext.manifest.id`.

- [ ] **Step 3: Open the renamed `bundled-extensions.test.ts` and update its import path**

The first three lines currently read:

```ts
import { describe, expect, it } from 'vitest';

import { bundledExtensions } from './extension-manifest';
```

Update the import path:

```diff
 import { describe, expect, it } from 'vitest';

-import { bundledExtensions } from './extension-manifest';
+import { bundledExtensions } from './bundled-extensions';
```

The rest of the test file (`describe`, `it` blocks, assertions) is unchanged. The tests read `entry.id` from each `BundledExtensionEntry`, which still exists; no type errors should originate in this file.

- [ ] **Step 4: Open `packages/shell/src/main.ts` and update the import**

Locate the current import line:

```ts
import { bundledExtensions } from './extension-host/extension-manifest';
```

Replace with:

```ts
import { bundledExtensions } from './extension-host/bundled-extensions';
```

The rest of `main.ts` (the for-loop body, the `manager.register(extension, ...)` call, etc.) is unchanged. Identity reads inside the loop continue against the local `id` destructured from each entry, which is now sourced from `ext.manifest.id` at the entry's construction site in `bundled-extensions.ts`.

- [ ] **Step 5: Verify the shell's source side is now self-consistent**

Run: `pnpm --filter @gcscode/shell check 2>&1 | grep -E '(extension-manifest|bundled-extensions)' || echo 'no stale refs'`
Expected: `no stale refs` (no remaining errors that mention the old filename or `ManifestEntry` type).

The wider `pnpm check` will still fail at four sites (extension packages + test files + workbench built-in) because their literals remain flat. THIS IS EXPECTED. Verify the errors are confined to those by running:

```bash
pnpm --filter @gcscode/shell check 2>&1 | grep -E '(error TS|^packages/)' | head -30
```

Expected: errors are about flat-shape `Extension` literals in test files and the workbench (`built-in/workbench/index.ts`), and possibly the extension packages' own files via the `bundled-extensions.ts` imports. No errors in `bundled-extensions.ts` itself, no errors in `main.ts`, no errors in `bundled-extensions.test.ts`.

- [ ] **Step 6: Verify only the intended files are changed**

Run: `git status`
Expected: renames + modifications:

- `R packages/shell/src/extension-host/extension-manifest.ts -> packages/shell/src/extension-host/bundled-extensions.ts` (modified after rename)
- `R packages/shell/src/extension-host/extension-manifest.test.ts -> packages/shell/src/extension-host/bundled-extensions.test.ts` (modified after rename)
- modified: `packages/shell/src/main.ts`

No other files. No untracked files.

- [ ] **Step 7: Run prettier**

Run: `pnpm format`
Expected: minor whitespace adjustments possible; only the three files remain pending.

- [ ] **Step 8: Commit**

```bash
git add packages/shell/src/extension-host/bundled-extensions.ts \
        packages/shell/src/extension-host/bundled-extensions.test.ts \
        packages/shell/src/main.ts
git commit -m "$(cat <<'EOF'
feat: rename host-side extension-manifest.ts → bundled-extensions.ts

Frees the "manifest" term for the public ExtensionManifest concept (per
ADR-0007). Renames the file pair (source + co-located test); renames the
ManifestEntry type to BundledExtensionEntry; updates each row's id field
to source from ext.manifest.id; adds a header docstring distinguishing
this host-side bundling list from the public per-extension manifest;
updates main.ts's import path.

After this commit, the shell's source code is fully internally consistent
with the new types. Test files and the workbench built-in still construct
flat-shape Extension literals; the four extension packages' exports use
flat shape too — so the workspace does not yet typecheck. Commit 4
migrates them all in one go.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 9: Verify commit landed**

Run: `git log --oneline -4 && git status`
Expected: HEAD = `feat: rename host-side extension-manifest.ts → bundled-extensions.ts`. `nothing to commit, working tree clean`.

---

### Task 5: Migrate first-party extensions, workbench, and tests (commit 4)

**Files:**

- Modify: `packages/extension-example/src/index.ts`
- Modify: `packages/extension-sitl/src/index.ts`
- Modify: `packages/extension-vehicle-status/src/index.ts`
- Modify: `packages/shell/src/built-in/workbench/index.ts`
- Modify: `packages/shell/src/extension-host/registry.test.ts`
- Modify: `packages/shell/src/extension-host/extension-manager.test.ts`
- Modify: `packages/shell/src/app.test.ts`
- Modify: `packages/shell/src/built-in/workbench/index.test.ts`
- Modify: `packages/extension-example/src/index.test.ts`
- Modify: `packages/extension-sitl/src/index.test.ts`
- Modify: `packages/extension-vehicle-status/src/index.test.ts`

This task migrates ALL consumer call sites (extensions + workbench + test files) from the flat `Extension` shape to the manifest shape. After this commit, the workspace is green: `pnpm check`, `pnpm test`, and `pnpm lint` all clean.

The migration mapping is uniform across every site:

```ts
// Old
const ext: Extension = {
  id: 'some.id',
  displayName: 'Some Display',
  version: '0.0.0',
  activate(context) { /* ... */ },
  // optional: deactivate() { /* ... */ },
};

// New
const ext: Extension = {
  manifest: {
    id: 'some.id',
    displayName: 'Some Display',
    version: '0.0.0',
    // optional: description: '...',
  },
  activate(context) { /* unchanged */ },
  // optional: deactivate() { /* unchanged */ },
};
```

The `activate` body and `deactivate` hook are byte-identical pre/post-migration. Only the top-level identity fields move into the new `manifest` object.

**Important — descriptions for the four real (non-test) extensions** are spec-prescribed. Use exactly the strings below. Test extensions deliberately omit `description` (exercises the optional-field path).

#### Sub-section A: First-party extensions (3 files)

- [ ] **Step 1: Migrate `packages/extension-example/src/index.ts`**

Replace the existing `exampleExtension` literal:

```diff
 export const exampleExtension: Extension = {
-  id: 'gcscode.example',
-  displayName: 'Example Extension',
-  version: '0.0.0',
+  manifest: {
+    id: 'gcscode.example',
+    displayName: 'Example Extension',
+    version: '0.0.0',
+    description: 'Demonstrates view, status bar item, command, and keybinding contributions.',
+  },
   activate(context) {
     /* unchanged byte-for-byte */
   },
 };
```

The imports, the `ExampleStatus` / `ExampleView` Svelte components, and the `activate` body are NOT touched.

- [ ] **Step 2: Migrate `packages/extension-sitl/src/index.ts`**

Replace the existing `sitlExtension` literal:

```diff
 export const sitlExtension: Extension = {
-  id: 'gcscode.sitl',
-  displayName: 'SITL Telemetry',
-  version: '0.0.0',
+  manifest: {
+    id: 'gcscode.sitl',
+    displayName: 'SITL Telemetry',
+    version: '0.0.0',
+    description: 'Live ArduCopter telemetry via mavlink2rest WebSocket; publishes a telemetry export.',
+  },
   activate(context): SitlExports {
     /* unchanged byte-for-byte */
   },
   async deactivate() {
     /* unchanged byte-for-byte */
   },
 };
```

The `SitlExports` interface, the `client` module-level state, the `FILTER` and `WS_URL` constants, the imports, and the `activate` / `deactivate` bodies are NOT touched.

- [ ] **Step 3: Migrate `packages/extension-vehicle-status/src/index.ts`**

Replace the existing `vehicleStatusExtension` literal:

```diff
 export const vehicleStatusExtension: Extension = {
-  id: 'gcscode.vehicle-status',
-  displayName: 'Vehicle Status',
-  version: '0.0.0',
+  manifest: {
+    id: 'gcscode.vehicle-status',
+    displayName: 'Vehicle Status',
+    version: '0.0.0',
+    description: 'Footer status item that reads SITL telemetry via cross-extension exports.',
+  },
   activate(context) {
     /* unchanged byte-for-byte */
   },
   deactivate() {
     /* unchanged byte-for-byte */
   },
 };
```

The `getSitlExports` helper, the `host` module-level state, the imports, and the bodies are NOT touched.

#### Sub-section B: Workbench built-in (1 file)

- [ ] **Step 4: Migrate `packages/shell/src/built-in/workbench/index.ts`**

Locate the `createWorkbenchExtension` factory's returned literal (lines ~19–53):

```ts
export function createWorkbenchExtension(registry: Registry): Extension {
  return {
    id: 'workbench',
    displayName: 'Workbench',
    version: '0.0.0',
    activate(context: ExtensionContext) {
      /* ... */
    },
  };
}
```

Replace with:

```ts
export function createWorkbenchExtension(registry: Registry): Extension {
  return {
    manifest: {
      id: 'workbench',
      displayName: 'Workbench',
      version: '0.0.0',
      description: "The shell's built-in extension. Registers the command palette and Ctrl+Shift+P.",
    },
    activate(context: ExtensionContext) {
      /* unchanged byte-for-byte */
    },
  };
}
```

The factory's `Registry` parameter, JSDoc, the `activate` body's command + keybinding registration, the `CommandPickItem` interface, and all imports are NOT touched.

#### Sub-section C: Test files (7 files, all mechanical)

For each test file, find every `Extension` literal that has the flat `{ id, displayName, version, activate, [deactivate] }` shape and migrate it to `{ manifest: { id, displayName, version }, activate, [deactivate] }`. Test extensions deliberately OMIT `description`.

The pattern is uniform. Example before/after:

```diff
   const extension: Extension = {
-    id: 'ext.a',
-    displayName: 'Extension A',
-    version: '1.2.3',
+    manifest: {
+      id: 'ext.a',
+      displayName: 'Extension A',
+      version: '1.2.3',
+    },
     activate,
   };
```

For literals built inside helper functions (e.g. `makeViewExtension(id)` in `extension-manager.test.ts` which builds a literal `{ id, displayName: id, version: '0.0.0', activate }`), apply the same transformation:

```diff
   const extension: Extension = {
-    id,
-    displayName: id,
-    version: '0.0.0',
+    manifest: {
+      id,
+      displayName: id,
+      version: '0.0.0',
+    },
     activate,
   };
```

Note: `id`, `displayName: id`, `version: '0.0.0'` move WHOLESALE inside the new `manifest` object. The shorthand `id` (which is `id: id`) keeps working inside the manifest.

- [ ] **Step 5: Migrate `packages/shell/src/extension-host/registry.test.ts`**

Apply the migration to all ~14 `Extension` literals. They appear inside individual `it(...)` blocks throughout the file.

Use grep to locate them and verify after migration:

```bash
grep -c 'displayName:' packages/shell/src/extension-host/registry.test.ts
```

Expected before: 14. Expected after: 14 (the literal count is unchanged; the field has just moved into `manifest`).

Then verify there are no leftover flat-shape literals:

```bash
grep -B1 -A2 'displayName:' packages/shell/src/extension-host/registry.test.ts | grep -B2 -A2 'id:' | head -40
```

Each match should show the field surrounded by an opening `manifest: {` line above and a closing `},` line below — i.e., the `displayName` is inside a manifest object, never at the top level of an `Extension`-shaped literal.

- [ ] **Step 6: Migrate `packages/shell/src/extension-host/extension-manager.test.ts`**

Apply the migration to all ~17 `Extension` literals. This includes:

- The `makeViewExtension(id)` helper (line ~10) which builds an `Extension` with `{ id, displayName: id, version: '0.0.0', activate }` → migrate to manifest.
- The `makeViewExtensionWithDeactivate(id, deactivate)` helper (line ~25) — same migration plus `deactivate` stays at the top level.
- Any inline `Extension` literals in individual tests.

In addition, this test file asserts on `manager.listExtensions()` results. Find every assertion of the form:

```ts
expect(manager.listExtensions()).toEqual([
  { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
]);
```

Update them to the new `ExtensionRecord` shape:

```ts
expect(manager.listExtensions()).toEqual([
  { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: true },
]);
```

(`description` is absent from the manifest object in these assertions — the test extensions don't declare one.)

Search for assertions to update:

```bash
grep -n 'listExtensions' packages/shell/src/extension-host/extension-manager.test.ts | head -20
```

Each `expect(manager.listExtensions()).toEqual(...)` line near these matches needs the shape update.

- [ ] **Step 7: Migrate `packages/shell/src/app.test.ts`**

One literal at line ~17 inside the `extension(id, activate)` helper function:

```diff
 function extension(id: string, activate: (context: ExtensionContext) => void): Extension {
-  return { id, displayName: id, version: '0.0.0', activate };
+  return { manifest: { id, displayName: id, version: '0.0.0' }, activate };
 }
```

The rest of `app.test.ts` is unchanged.

- [ ] **Step 8: Migrate `packages/shell/src/built-in/workbench/index.test.ts`**

Two `Extension` literals (the workbench itself imported via `createWorkbenchExtension` is already migrated by Step 4; this test file separately constructs a small test extension that registers a command). Apply the same migration pattern.

```bash
grep -B1 -A4 'displayName:' packages/shell/src/built-in/workbench/index.test.ts
```

Expected: two matches. Migrate each to manifest shape.

- [ ] **Step 9: Migrate `packages/extension-example/src/index.test.ts`**

Two `Extension` literals. Apply the migration.

- [ ] **Step 10: Migrate `packages/extension-sitl/src/index.test.ts`**

Two `Extension` literals. Apply the migration.

- [ ] **Step 11: Migrate `packages/extension-vehicle-status/src/index.test.ts`**

Three `Extension` literals. Apply the migration.

#### Sub-section D: Verification

- [ ] **Step 12: Verify the workspace passes type-check**

Run: `pnpm check`
Expected: exit 0 across all four packages. No TypeScript errors.

If any errors remain, they typically point at an un-migrated `Extension` literal (`Property 'manifest' is missing in type ...`). Read the error message; it will name the file and line. Apply the migration mapping there.

- [ ] **Step 13: Verify all tests pass**

Run: `pnpm test`
Expected: all tests pass. Per-package counts unchanged from Task 1's baseline.

If any test fails:

- **Behavioral failures (e.g., "expected X to equal Y")** are NOT expected from this refactor. The migration is mechanical; assertions don't change except for `listExtensions()` shape updates already covered. If you see a behavioral failure, the migration at that call site is wrong (e.g., a `listExtensions` assertion was missed). Investigate.
- **Type errors masquerading as test failures** → rerun Step 12 first.

- [ ] **Step 14: Run prettier and lint**

Run: `pnpm format && pnpm lint`
Expected: minor whitespace adjustments possible; `pnpm lint` exits 0.

- [ ] **Step 15: Smoke-test the dev server**

Run: `pnpm dev` (in a separate terminal or via `&` then kill after verification)

Open http://localhost:5173 (or whichever port Vite reports) and verify visually:

1. Three views render (example, sitl, vehicle-status).
2. The footer status bar contains both an example status item (right side) and the vehicle-status item (left side).
3. Pressing **Ctrl+Shift+P** opens the command palette. The list contains "Workbench: Show All Commands" and "SITL: Get Location".
4. Pressing **Alt+Shift+G** logs `Hello from gcscode.example` to the browser console.
5. Pressing **Alt+Shift+L** logs `SITL location: ...` (or `(no fix yet)` if the WebSocket isn't connected).
6. No console errors (other than expected "WebSocket connection failed" if mavlink2rest isn't running locally — that's not a regression).

Stop the dev server when done.

- [ ] **Step 16: Verify only the intended files are pending changes**

Run: `git status`
Expected: modified (in some order):

- `packages/extension-example/src/index.ts`
- `packages/extension-sitl/src/index.ts`
- `packages/extension-vehicle-status/src/index.ts`
- `packages/shell/src/built-in/workbench/index.ts`
- `packages/shell/src/extension-host/registry.test.ts`
- `packages/shell/src/extension-host/extension-manager.test.ts`
- `packages/shell/src/app.test.ts`
- `packages/shell/src/built-in/workbench/index.test.ts`
- `packages/extension-example/src/index.test.ts`
- `packages/extension-sitl/src/index.test.ts`
- `packages/extension-vehicle-status/src/index.test.ts`

No other files. No untracked files.

If any other file appears, stop and investigate before committing.

- [ ] **Step 17: Commit**

```bash
git add packages/extension-example/src/index.ts \
        packages/extension-sitl/src/index.ts \
        packages/extension-vehicle-status/src/index.ts \
        packages/shell/src/built-in/workbench/index.ts \
        packages/shell/src/extension-host/registry.test.ts \
        packages/shell/src/extension-host/extension-manager.test.ts \
        packages/shell/src/app.test.ts \
        packages/shell/src/built-in/workbench/index.test.ts \
        packages/extension-example/src/index.test.ts \
        packages/extension-sitl/src/index.test.ts \
        packages/extension-vehicle-status/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(extensions): migrate first-party extensions and workbench to manifest-shaped Extension

Migrates extension-example, extension-sitl, extension-vehicle-status, and
the workbench built-in to the manifest-shaped Extension per ADR-0007.
Each extension's identity fields (id, displayName, version) move inside
a manifest object; each gains a description string.

Updates affected test files (registry.test.ts, extension-manager.test.ts,
app.test.ts, the workbench's index.test.ts, and the three per-extension
index.test.ts files) to construct manifest-shaped Extension literals and
to assert against the new nested ExtensionRecord shape.

Mechanical migration; no logic or assertion changes beyond the shape
update. Test count unchanged.

After this commit, pnpm check, pnpm test, and pnpm lint all clean across
all four packages — the green state for the iteration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 18: Verify commit landed and the branch is in green state**

Run: `git log --oneline -5 && git status && pnpm check && pnpm test 2>&1 | tail -15 && pnpm lint`
Expected: HEAD = `feat(extensions): migrate first-party extensions and workbench to manifest-shaped Extension`. Branch is `feat/extension-manifest`. `nothing to commit, working tree clean`. All three verification commands exit 0; tests pass with the same per-package counts as Task 1's baseline.

---

### Task 6: Doc propagation (commit 5)

**Files:**

- Modify: `packages/extension-api/README.md`
- Modify: `packages/extension-example/README.md`
- Modify: `docs/roadmap.md`
- Modify: `docs/vs-code-alignment.md`
- Modify: `docs/decisions/ADR-0003-plugin-api-refinements.md`
- Modify: `docs/out-of-scope.md`

This task lands all doc updates in a single commit. No code changes; the workspace remains green throughout.

- [ ] **Step 1: Replace `packages/extension-api/README.md` with the spec's content**

Open the spec at `docs/specs/2026-05-02-extension-manifest.md` and locate the section `## packages/extension-api/README.md content (replacement)`. The block within that section's triple-backtick fenced markdown is the EXACT new content of the README (excluding the outermost ` ```` ` fence used to wrap the markdown for spec presentation).

Replace the entire current contents of `packages/extension-api/README.md` with that content. The new README has these sections: `# @gcscode/extension-api`, `## Stability`, `## Usage` (with the manifest-shaped example), `## The extension shape` (NEW section), `## The activation context`, `## Cross-extension exports`, `## Lifecycle (deactivate?())`, `## Conventions for extension authors`.

After replacement, verify the file:

```bash
grep -c '^##' packages/extension-api/README.md
```

Expected: 7 (matching the seven `## ...` section headings listed above).

- [ ] **Step 2: Update `packages/extension-example/README.md` — three small edits**

**Edit A — "What it demonstrates" third bullet.** The current third bullet reads:

```md
- It exports a named `const` (`exampleExtension`) of type `Extension` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
```

Replace with:

```md
- It exports a named `const` (`exampleExtension`) of type `Extension` carrying a `manifest` object (`id`, `displayName`, `version`, `description?`) plus an `activate(context)` function. See [ADR-0007](../../docs/decisions/ADR-0007-extension-manifest.md) for the manifest's structure.
```

**Edit B — Anatomy file-tree comment.** The current line reads:

```
  index.ts              - exports exampleExtension: Extension (identity + activate(context))
```

Replace with:

```
  index.ts              - exports exampleExtension: Extension (manifest + activate(context))
```

**Edit C — "To write your own extension..." paragraph.** The current paragraph reads:

```md
To write your own extension, copy this package, change the exported constant name (`exampleExtension` → `yourExtension`) and identity fields, rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.
```

Replace with:

```md
To write your own extension, copy this package, change the exported constant name (`exampleExtension` → `yourExtension`) and the `manifest` fields (id, displayName, version, optional description), rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.
```

The Stability section, the contribution-kind bullet list, and the per-id table elsewhere in the file are unchanged.

- [ ] **Step 3: Update `docs/roadmap.md` — clarify B4 + add B5**

**Edit A — clarify B4 line.** Find the existing B4 bullet:

```md
- [x] **B4: Extension manifest + persistence** — `bundledExtensions` array; localStorage-backed disabled-id set; `ExtensionManager.register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`. Spec: [`specs/2026-04-27-phase-b4-extension-manifest.md`](specs/2026-04-27-phase-b4-extension-manifest.md)
```

Replace with:

```md
- [x] **B4: Bundled extensions list + persistence** — host-side `bundledExtensions` array (file renamed to `bundled-extensions.ts` in B5; see ADR-0007); localStorage-backed disabled-id set; `ExtensionManager.register` grows `{ enabled? }`; `createExtensionManager` grows `{ onEnabledChanged }`. Spec: [`specs/2026-04-27-phase-b4-extension-manifest.md`](specs/2026-04-27-phase-b4-extension-manifest.md). NOTE: the original B4 title used "Extension manifest" for the host-side bundling list; the public per-extension manifest is a different concept landed in B5.
```

**Edit B — append the B5 line.** Find the existing `Extension.deactivate?() hook` line in the same Phase B section (it's at the end of that section). Add a new bullet IMMEDIATELY AFTER it:

```md
- [x] **B5: Per-extension manifest metadata** — public `ExtensionManifest` type in `@gcscode/extension-api`; `Extension.manifest: ExtensionManifest` replaces flat identity fields; first descriptive field is `description?`. Host-side `extension-manifest.ts` renames to `bundled-extensions.ts` to free the term. Spec: [`specs/2026-05-02-extension-manifest.md`](specs/2026-05-02-extension-manifest.md). ADR: [`decisions/ADR-0007-extension-manifest.md`](decisions/ADR-0007-extension-manifest.md).
```

The Phase A section, the rest of Phase B, the Phase C section, the Feature extensions section, and the Maintenance section are unchanged.

- [ ] **Step 4: Update `docs/vs-code-alignment.md` — Divergences row + new Alignments row**

**Edit A — update Divergences row "Extension shape".** Find the existing row in the **Divergences** table:

```md
| Extension shape                   | `activate()` exported from module; metadata in `package.json`   | object with `activate()` method; metadata as identity fields on the object | [ADR-0002](decisions/ADR-0002-imperative-activate-api.md), [ADR-0004](decisions/ADR-0004-rename-plugin-to-extension.md)                                  | Manifest deferral lands → re-evaluate                             |
```

Replace with:

```md
| Extension shape                   | `activate()` exported from module; metadata in `package.json`   | object with `activate()` method; metadata in a `manifest: ExtensionManifest` field on the object | [ADR-0002](decisions/ADR-0002-imperative-activate-api.md), [ADR-0004](decisions/ADR-0004-rename-plugin-to-extension.md), [ADR-0007](decisions/ADR-0007-extension-manifest.md) | First third-party / out-of-tree extension                         |
```

The other Divergences rows (deactivate hook position, View / status-bar contributions, Status bar item ordering, Keybinding registration, Extension boundary mechanism, extensionPath, async items in showQuickPick) are unchanged.

**Edit B — append a new Alignments row.** Find the bottom of the **Alignments** table (the last existing row references `workbench.action.showCommands`). Add this new row at the very end of the Alignments table:

```md
| Per-extension manifest carries identity + presentation metadata             | ✓ (`package.json`)                                        | ✓ (`Extension.manifest: ExtensionManifest`, descriptive subset)                                  | [ADR-0007](decisions/ADR-0007-extension-manifest.md)                                                       |
```

The Deferrals table is unchanged. The Maintenance section is unchanged.

- [ ] **Step 5: Update `docs/decisions/ADR-0003-plugin-api-refinements.md` — append a Follow-ups bullet**

Locate the `## Follow-ups` section. Add a new bullet at the END of the list (after the existing "The 'Phase C: probably namespace the host once the flat surface exceeds 5–7 methods' forecast..." bullet pointing to ADR-0006):

```md
- The "Declarative `contributes`" deferral's trigger ("a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted extension module") partially fired in 2026-05-02. The descriptive-metadata subset is now structured per [ADR-0007](ADR-0007-extension-manifest.md) (`Extension.manifest: ExtensionManifest`). The `contributes` arrays themselves remain deferred under sharper trigger language ("settings UI for individual contributions / first untrusted extension module / first third-party producer-consumer pair").
```

The existing follow-up bullets and all other sections of ADR-0003 are unchanged.

- [ ] **Step 6: Update `docs/out-of-scope.md` — rewrite "Declarative `contributes` manifest" entry**

Locate the first bullet under the **Extension machinery** section. The current text:

```md
- **Declarative `contributes` manifest.** No statically-parseable list of contributions (commands, views, status bar items, etc.) that the host can read without executing `activate()`. The TypeScript `Extension` interface plus imperative `register*` calls are the contract. The manifest would be where per-contribution metadata such as command titles, categories, icons, and descriptions eventually lives. _Trigger to revisit:_ a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted extension module. (ADR-0003)
```

Replace with:

```md
- **Declarative `contributes` manifest.** No statically-parseable list of contributions (commands, views, status bar items, etc.) that the host can read without executing `activate()`. Imperative `register*` calls inside `activate(context)` are the contract for runtime registration. Note: per-extension descriptive metadata (`displayName`, `version`, `description?`) IS structured on `Extension.manifest` per ADR-0007; the deferral here is specifically the `contributes` arrays — declarative lists of commands / views / keybindings / status bar items as data, parseable without running `activate()`. _Trigger to revisit:_ a settings UI that toggles individual contributions, the first untrusted extension module, or the first third-party producer-consumer pair. (ADR-0003, ADR-0007)
```

The other entries in the "Extension machinery" section (Activation events, Extension activation ordering, Capability / permission declarations, etc.) and the "Tooling / process" section are unchanged.

- [ ] **Step 7: Verify lint, format, and link integrity**

Run: `pnpm format && pnpm lint`
Expected: prettier may reformat the markdown; lint clean.

Spot-check the new ADR-0007 link from each updated location resolves:

```bash
grep -l 'ADR-0007' packages/extension-api/README.md packages/extension-example/README.md docs/roadmap.md docs/vs-code-alignment.md docs/decisions/ADR-0003-plugin-api-refinements.md docs/out-of-scope.md
```

Expected: all six file paths appear in the output (every doc references ADR-0007 at least once).

- [ ] **Step 8: Verify the dev server still runs (sanity check)**

The doc commit shouldn't have broken anything, but a quick smoke is cheap:

Run: `pnpm check && pnpm test 2>&1 | tail -10 && pnpm lint`
Expected: all three exit 0. Test counts unchanged from Task 5.

- [ ] **Step 9: Verify only the intended files are pending changes**

Run: `git status`
Expected: modified:

- `packages/extension-api/README.md`
- `packages/extension-example/README.md`
- `docs/roadmap.md`
- `docs/vs-code-alignment.md`
- `docs/decisions/ADR-0003-plugin-api-refinements.md`
- `docs/out-of-scope.md`

No other files. No untracked files.

- [ ] **Step 10: Commit**

```bash
git add packages/extension-api/README.md \
        packages/extension-example/README.md \
        docs/roadmap.md \
        docs/vs-code-alignment.md \
        docs/decisions/ADR-0003-plugin-api-refinements.md \
        docs/out-of-scope.md
git commit -m "$(cat <<'EOF'
docs: ADR-0007 propagation — extension-api README, example README, ledger, roadmap, ADR-0003 follow-up, out-of-scope

Cumulative doc propagation for the extension-manifest iteration:

- packages/extension-api/README.md REPLACED with manifest-shaped Usage
  example, new "The extension shape" section, updated activation context
  description, and updated Cross-extension exports example.
- packages/extension-example/README.md three edits (What it demonstrates
  bullet, Anatomy file-tree comment, "To write your own extension..."
  paragraph).
- docs/roadmap.md: B4 line clarified (rename "Extension manifest" to
  "Bundled extensions list" with footnote about the file rename); new B5
  line added linking spec + ADR-0007.
- docs/vs-code-alignment.md: existing Divergences row "Extension shape"
  updated (gcscode column + Trigger column); new Alignments row appended.
- docs/decisions/ADR-0003: one new follow-up bullet pointing at ADR-0007.
- docs/out-of-scope.md: "Declarative contributes manifest" entry rewritten
  with sharper trigger language; clarifies that descriptive metadata is
  now structured per ADR-0007 and the deferral applies only to contributes
  arrays.

No code changes. Workspace remains green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11: Verify commit landed**

Run: `git log --oneline -6 && git status`
Expected: HEAD = `docs: ADR-0007 propagation — ...`. Five `feat...` commits below it on the feature branch (Tasks 2–5). `nothing to commit, working tree clean`.

---

### Task 7: End-to-end verification

**Files:** none (verification-only task; no commits)

This task confirms the feature branch is ready for merge. All commands must pass; no commits land here.

- [ ] **Step 1: Run the full verification suite**

Run: `pnpm format && pnpm lint && pnpm check && pnpm test`
Expected: all four exit 0.

- [ ] **Step 2: Verify per-package test counts match the baseline**

Run: `pnpm test 2>&1 | grep -E '(Tests|✓|✗|test files)' | tail -20`

Expected: same per-package test counts as recorded in Task 1, Step 2. No new tests, no removed tests.

- [ ] **Step 3: Verify the dev server boots and the smoke checks pass**

Run: `pnpm dev` (background or separate terminal).

Smoke checks (manual, in browser):

1. App boots without console errors at http://localhost:5173.
2. Three views render (example main view, SITL location view, vehicle status footer item).
3. Footer shows the example status item (right side) AND the vehicle-status item (left side).
4. **Ctrl+Shift+P** opens the command palette. List contains "Workbench: Show All Commands" and "SITL: Get Location".
5. **Alt+Shift+G** logs the example greeting to the browser console.
6. **Alt+Shift+L** logs SITL location (or "(no fix yet)") to the console.
7. Disabling SITL via `localStorage.setItem('gcscode.extensions.disabled', JSON.stringify(['gcscode.sitl'])); location.reload();` removes the SITL view AND removes "SITL: Get Location" from the palette AND the vehicle-status footer goes blank/no-fix. Re-enable: `localStorage.removeItem('gcscode.extensions.disabled'); location.reload();`. Everything restored.

If any check fails — that is a regression. Investigate before proceeding to merge.

Stop the dev server after verification.

- [ ] **Step 4: Verify the git log on the feature branch**

Run: `git log --oneline master..HEAD`

Expected: exactly five commits, in this order (top is most recent):

1. `docs: ADR-0007 propagation — ...`
2. `feat(extensions): migrate first-party extensions and workbench to manifest-shaped Extension`
3. `feat: rename host-side extension-manifest.ts → bundled-extensions.ts`
4. `feat(shell): registry + extension-manager read identity via extension.manifest`
5. `feat(extension-api): introduce ExtensionManifest; Extension owns manifest field`

If the count is off (more or fewer), or the messages don't match, investigate before merging.

- [ ] **Step 5: Verify no extra files exist on the branch**

Run: `git diff master --stat | tail -3`

Expected: a list of files changed and a summary line. The list should match exactly the files touched by Tasks 2–6. No `.svelte` components changed (the manifest iteration is type-only at the source layer); no `package.json` files changed; no `tsconfig.json` files changed.

---

### Task 8: Merge feature branch to master

**Files:** none (merge-only task)

Per `CLAUDE.md`, merge the feature branch with `git merge --no-ff` to preserve the feature boundary in `git log`. This is also when subagent-driven-development would dispatch a final cross-cutting code review over the full branch via `superpowers:requesting-code-review`.

- [ ] **Step 1: If using subagent-driven-development, dispatch the final cross-cutting review now**

Per `CLAUDE.md` "Subagent-driven plan execution": "After all tasks land, dispatch a final cross-cutting code review over the full branch before merging via `superpowers:finishing-a-development-branch`."

Skip this step if executing via `superpowers:executing-plans` (inline mode), where the controller decides on review framing. Otherwise: dispatch one `superpowers:code-reviewer` subagent on the full feature branch (`git diff master...HEAD`) before merging. Address feedback in `Code-review-followup:` commits on the same branch.

- [ ] **Step 2: Switch to master**

Run: `git checkout master`
Expected: branch switches; HEAD is master's most recent commit (the spec+ADR+plan commit). `git status`: clean.

- [ ] **Step 3: Pull latest from master (if appropriate)**

Run: `git pull --ff-only` if a remote tracking branch exists, otherwise skip.
Expected: fast-forward only; no merge commits introduced. If pull fails because remote diverged, ask the controller — do not force-merge.

- [ ] **Step 4: Merge with `--no-ff`**

Run: `git merge --no-ff feat/extension-manifest -m "Merge branch 'feat/extension-manifest'"`
Expected: merge commit lands. `git log --oneline -7` shows the merge commit at HEAD, the five feature-branch commits, and the spec+ADR+plan commit on master.

- [ ] **Step 5: Run the full verification suite once more on master**

Run: `pnpm format && pnpm lint && pnpm check && pnpm test`
Expected: all four exit 0. Per-package test counts unchanged.

- [ ] **Step 6: Optional — delete the feature branch**

If the work is complete and merged:

```bash
git branch -d feat/extension-manifest
```

Expected: branch deleted. `git branch` no longer lists it. (Use `-d`, not `-D` — `-d` only succeeds if the branch is fully merged, which it is at this point.)

- [ ] **Step 7: Final state verification**

Run: `git log --oneline -7 && git branch && git status`

Expected:

- `git log` shows: merge commit at HEAD, five feature-branch commits, the spec+ADR+plan commit, and earlier history.
- `git branch` shows only `master` (and any unrelated branches).
- `git status` is clean.

The iteration is complete.

---

## Self-review

Before this plan was finalized, I cross-referenced it against the spec for:

1. **Spec coverage:** Every section of the spec has at least one task implementing it. The Goals list maps cleanly to Tasks 2–6. Verification + merge are Tasks 7–8.
2. **Type consistency:** The `ExtensionManifest` interface, `Extension` shape, `ExtensionRecord` reshape, `BundledExtensionEntry` rename, and the `manifest.id` access path are consistent across every task that references them.
3. **Mechanical migration coverage:** All `Extension` literal sites listed in the spec's "Test updates" table have a matching step in Task 5 (the seven test files plus the four source-extension files plus the workbench).
4. **No placeholders:** Every step contains the actual code or command an engineer needs. The mechanical sub-steps (5, 6, 8, 9, 10, 11) reference the uniform migration pattern documented at the top of Task 5; they don't duplicate the pattern but link back to it within the same task — within-task, an engineer is reading these in order.
5. **Commit boundaries:** Each task ends with one git commit. The five-commit sequence on the feature branch matches the spec's `## Branching and commit` section exactly.
