# Plugin → Extension Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "plugin" → "extension" across types, packages, living docs, and historical-doc pointer-notes; preserve all existing test logic. ADR-0004 (the decision record) and the spec are already on master at the time the worker starts; the worker creates the feature branch, lands three focused commits (pointer-notes / mechanical rename / living-doc rewrites), updates user-side memory files, and merges with `--no-ff`.

**Architecture:** Mechanical rename, no behavior change. Three commits on `feat/rename-plugin-to-extension`. The mechanical rename is atomic at the package level (renaming a package without updating all consumers breaks compilation), so it lands as a single commit with full validation (`pnpm install` + `pnpm check` + `pnpm test` + `pnpm lint` + manual `pnpm dev`) before the commit is made.

**Tech Stack:** pnpm workspaces, TypeScript, Svelte 5, Vite, ESLint, Vitest, @testing-library/svelte.

**Spec:** `docs/specs/2026-04-27-rename-plugin-to-extension.md`
**ADR:** `docs/decisions/ADR-0004-rename-plugin-to-extension.md`

---

## Pre-flight

Before starting, verify these artifacts exist on master and the working tree is clean:

- [ ] **Verify master has the spec, ADR, and plan committed**

Run:

```bash
git log --oneline -5
ls docs/specs/2026-04-27-rename-plugin-to-extension.md docs/plans/2026-04-27-rename-plugin-to-extension.md docs/decisions/ADR-0004-rename-plugin-to-extension.md
git status
```

Expected: Recent commits include the spec, ADR, and plan in some order. The three files exist. `git status` reports clean working tree on `master`.

If any artifact is missing, stop and resolve before proceeding.

---

## Task 1: Create the feature branch

**Files:** none

- [ ] **Step 1.1: Confirm clean tree on master**

Run:

```bash
git status && git rev-parse --abbrev-ref HEAD
```

Expected: `nothing to commit, working tree clean` and `master`.

- [ ] **Step 1.2: Create and switch to the feature branch**

Run:

```bash
git checkout -b feat/rename-plugin-to-extension
```

Expected: `Switched to a new branch 'feat/rename-plugin-to-extension'`.

---

## Task 2: Pointer-notes on historical decision/spec/plan docs

**Files:** modifying 15 files in place. Each gets a single line inserted immediately after the H1 heading (before any existing content like `**Status:**`).

**Recipients (15 files):**

ADRs (3) — pointer path is sibling: `ADR-0004-rename-plugin-to-extension.md`

- `docs/decisions/ADR-0001-monorepo-plugin-boundary.md`
- `docs/decisions/ADR-0002-imperative-activate-api.md`
- `docs/decisions/ADR-0003-plugin-api-refinements.md`

Specs (6) — pointer path goes up one and into decisions: `../decisions/ADR-0004-rename-plugin-to-extension.md`

- `docs/specs/2026-04-26-phase-a1-status-bar.md`
- `docs/specs/2026-04-26-phase-a2-commands.md`
- `docs/specs/2026-04-26-phase-a3-keybindings.md`
- `docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md`
- `docs/specs/2026-04-27-phase-b2a-reactive-plumbing.md`
- `docs/specs/2026-04-27-roadmap.md`

Plans (6) — same pointer path as specs

- `docs/plans/2026-04-26-phase-a1-status-bar.md`
- `docs/plans/2026-04-26-phase-a2-commands.md`
- `docs/plans/2026-04-26-phase-a3-keybindings.md`
- `docs/plans/2026-04-26-phase-b1-deactivate-orchestration.md`
- `docs/plans/2026-04-27-phase-b2a-reactive-plumbing.md`
- `docs/plans/2026-04-27-roadmap.md`

**Excluded (do not pointer-note):**

- `docs/decisions/ADR-0004-rename-plugin-to-extension.md` (this IS the rename ADR)
- `docs/specs/2026-04-27-rename-plugin-to-extension.md` (this IS the rename spec)
- `docs/plans/2026-04-27-rename-plugin-to-extension.md` (this IS the rename plan)

- [ ] **Step 2.1: Add pointer-note to each ADR**

For each of `ADR-0001-monorepo-plugin-boundary.md`, `ADR-0002-imperative-activate-api.md`, `ADR-0003-plugin-api-refinements.md`, insert this line on line 2 (immediately after the `# ADR-NNNN — ...` H1, before any existing content):

```markdown
_Note: The term "plugin" was renamed to "extension" in [ADR-0004](ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._
```

(The blank line above the italicized note is required so the note stands as its own paragraph.)

After: the file now has H1, blank line, italic note, blank line, then existing content.

- [ ] **Step 2.2: Add pointer-note to each spec**

For each of the 6 specs listed above, insert the same shape but with `../decisions/` in the link path:

```markdown
_Note: The term "plugin" was renamed to "extension" in [ADR-0004](../decisions/ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._
```

Insert immediately after the H1, before any existing content (in shipped specs the next line is typically `**Status:** Approved (...)` — the note goes between the H1 and that line, separated by blank lines).

- [ ] **Step 2.3: Add pointer-note to each plan**

Same shape as specs (`../decisions/`). Each plan's H1 looks like `# <Topic> Implementation Plan` or similar; the note goes immediately after, before any existing content.

```markdown
_Note: The term "plugin" was renamed to "extension" in [ADR-0004](../decisions/ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._
```

- [ ] **Step 2.4: Verify the diff is exactly 15 files, each with +3 lines (blank, italic note, blank)**

Run:

```bash
git status
git diff --stat
```

Expected: 15 files modified. Each shows `+3` lines added (or `+2` if the H1 was previously followed immediately by content with no blank line — adapt accordingly). Total insertions: 45 (or close — exact count depends on each file's existing whitespace after H1).

- [ ] **Step 2.5: Run validation**

Pointer-notes are pure text additions. They don't affect compile/test/lint, but verify nothing accidentally regressed:

```bash
pnpm lint
```

Expected: clean (Prettier may auto-format if any line broke conventions; if it does, accept the format change and re-stage).

- [ ] **Step 2.6: Stage and commit**

Run:

```bash
git add docs/decisions/ADR-0001-monorepo-plugin-boundary.md \
        docs/decisions/ADR-0002-imperative-activate-api.md \
        docs/decisions/ADR-0003-plugin-api-refinements.md \
        docs/specs/2026-04-26-phase-a1-status-bar.md \
        docs/specs/2026-04-26-phase-a2-commands.md \
        docs/specs/2026-04-26-phase-a3-keybindings.md \
        docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md \
        docs/specs/2026-04-27-phase-b2a-reactive-plumbing.md \
        docs/specs/2026-04-27-roadmap.md \
        docs/plans/2026-04-26-phase-a1-status-bar.md \
        docs/plans/2026-04-26-phase-a2-commands.md \
        docs/plans/2026-04-26-phase-a3-keybindings.md \
        docs/plans/2026-04-26-phase-b1-deactivate-orchestration.md \
        docs/plans/2026-04-27-phase-b2a-reactive-plumbing.md \
        docs/plans/2026-04-27-roadmap.md

git commit -m "chore(rename): pointer-notes on historical decision/spec/plan docs"
```

Expected: commit succeeds. `git log --oneline -1` shows the new commit at HEAD.

---

## Task 3: Mechanical rename — packages, code, configs, lockfile

**Goal:** Single atomic commit. After this commit, `pnpm install` resolves cleanly, `pnpm check`, `pnpm test`, and `pnpm lint` all pass, and `pnpm dev` mounts the example extension correctly.

**Files:**

Renamed via `git mv`:

- `packages/plugin-api/` → `packages/extension-api/`
- `packages/plugin-example/` → `packages/extension-example/`
- `packages/shell/src/plugin-host/` → `packages/shell/src/extension-host/`

Modified (post-rename paths):

- `packages/extension-api/package.json`
- `packages/extension-api/src/index.ts`
- `packages/extension-example/package.json`
- `packages/extension-example/src/index.ts`
- `packages/extension-example/src/index.test.ts`
- `packages/extension-example/src/example-view.svelte`
- `packages/shell/src/extension-host/registry.ts`
- `packages/shell/src/extension-host/registry.test.ts`
- `packages/shell/src/main.ts`
- `packages/shell/src/app.svelte`
- `packages/shell/src/app.test.ts`
- `packages/shell/src/keybinding-dispatcher.ts`
- `packages/shell/src/keybinding-dispatcher.test.ts`
- `packages/shell/package.json`
- `tsconfig.json`
- `eslint.config.ts`
- `pnpm-lock.yaml` (regenerated by `pnpm install`)

Untouched (verified during the task; expected to need no changes):

- `pnpm-workspace.yaml` (uses `packages/*` glob)
- `tsconfig.base.json` if present
- `packages/shell/vite.config.ts`, `packages/shell/svelte.config.js`, `packages/shell/vitest.config.ts`, `packages/extension-example/vitest.config.ts` (their `plugin*` references are about Vite/Svelte plugins, unrelated)
- `package.json` (root) — its `*-plugin-svelte` deps are third-party and unrelated
- `.claude/settings.json` — `enabledPlugins` refers to Claude Code plugins (chrome-devtools-mcp, superpowers), unrelated

### 3a. Rename package directories

- [ ] **Step 3a.1: Rename plugin-api directory**

Run:

```bash
git mv packages/plugin-api packages/extension-api
```

Expected: `git status` shows the directory rename as `renamed: packages/plugin-api/... -> packages/extension-api/...` for each file inside.

- [ ] **Step 3a.2: Rename plugin-example directory**

Run:

```bash
git mv packages/plugin-example packages/extension-example
```

- [ ] **Step 3a.3: Rename shell's plugin-host directory**

Run:

```bash
git mv packages/shell/src/plugin-host packages/shell/src/extension-host
```

- [ ] **Step 3a.4: Confirm directory renames in git**

Run:

```bash
git status --short | head -40
```

Expected: All files inside the three renamed dirs show `R` (renamed) status. No content changes yet.

### 3b. Edit `packages/extension-api/`

- [ ] **Step 3b.1: Update `packages/extension-api/package.json` name field**

The `name` field on line 2 currently reads `"@gcscode/plugin-api"`. Change to `"@gcscode/extension-api"`. Other fields unchanged.

After the edit, the file should look like:

```json
{
  "name": "@gcscode/extension-api",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "tsc --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

- [ ] **Step 3b.2: Update `packages/extension-api/src/index.ts` types and JSDoc**

Replace the entire file contents with the post-rename version below. Type signatures, names, and JSDoc are updated; semantics are unchanged.

```ts
import type { Component } from 'svelte';

/**
 * Standard cleanup primitive. `dispose()` must be idempotent — calling it a
 * second time is a no-op.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * A view contribution renders a Svelte component into the shell's main
 * content surface. `id` is a stable identifier (usually
 * `<extension-id>.<local-name>`) used for diagnostics, lookups, and disposal.
 */
export interface ViewContribution {
  id: string;
  component: Component;
}

/**
 * A status bar item contribution renders a Svelte component into one side of
 * the shell's footer status bar. `id` is a stable identifier (usually
 * `<extension-id>.<local-name>`) used for diagnostics, lookups, and disposal.
 * `alignment` decides which side of the bar the item sits on; ordering within
 * a side follows registration order.
 */
export interface StatusBarItemContribution {
  id: string;
  component: Component;
  alignment: 'left' | 'right';
}

/**
 * A command contribution registers a callable handler under a stable string
 * id. Commands are the integration backbone for kinds that reference commands
 * by id rather than carrying their own handlers (keybindings today; menu
 * items and palette entries to come). Cross-extension execute is intentional —
 * any extension can fire any registered command.
 */
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
}

/**
 * A keybinding contribution maps a key combo (e.g. 'Ctrl+Shift+G') to a
 * registered command id. Modifiers are 'Ctrl', 'Shift', 'Alt', 'Meta'
 * (case-insensitive at match time); the key portion is also case-insensitive.
 * One non-modifier key per binding. The shell's keyboard dispatcher fires
 * the referenced command on first match. The `command` field is resolved at
 * fire time, not at registration — cross-extension command references are
 * intentional.
 */
export interface KeybindingContribution {
  key: string;
  command: string;
}

/**
 * Identity metadata for an extension — stable across activations; used by the
 * host for logs, errors, and (later) per-extension permission scoping.
 */
export interface ExtensionIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly version: string;
}

/**
 * The per-extension gate. Each `register*` method returns a `Disposable` whose
 * `dispose()` removes the registration. New contribution kinds slot in as
 * further `register*` methods. Future steps will wrap this object to enforce
 * per-extension permission scopes without changing the extension-facing API.
 */
export interface ExtensionHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  registerKeybinding(keybinding: KeybindingContribution): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}

/**
 * The activation context — mirrors VS Code's `ExtensionContext`:
 *   - `host` is the registration gate.
 *   - `subscriptions` is a sink for disposables; the host disposes them when
 *     the extension is (eventually) deactivated.
 *   - `extension` is read-only identity for the activating extension.
 */
export interface ExtensionContext {
  host: ExtensionHost;
  subscriptions: Disposable[];
  extension: ExtensionIdentity;
}

/**
 * An extension module's named export. Identity fields give the host extension
 * identity for diagnostics; `activate(context)` is the single entry point.
 */
export interface Extension extends ExtensionIdentity {
  activate(context: ExtensionContext): void;
}
```

- [ ] **Step 3b.3: Update `packages/extension-api/README.md`**

The README is touched in Task 4 (living-doc rewrite), not now. Skip for this task.

### 3c. Edit `packages/extension-example/`

- [ ] **Step 3c.1: Update `packages/extension-example/package.json`**

Two changes: `name` field and the `@gcscode/plugin-api` dependency.

```json
{
  "name": "@gcscode/extension-example",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gcscode/extension-api": "workspace:*"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

- [ ] **Step 3c.2: Update `packages/extension-example/src/index.ts`**

Renames: `Plugin` → `Extension`, `examplePlugin` → `exampleExtension`, package import path, display name `'Example Plugin'` → `'Example Extension'`.

Replace the entire file with:

```ts
import type { Extension } from '@gcscode/extension-api';

import ExampleStatus from './example-status.svelte';
import ExampleView from './example-view.svelte';

export const exampleExtension: Extension = {
  id: 'gcscode.example',
  displayName: 'Example Extension',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'gcscode.example.main',
        component: ExampleView,
      }),
      context.host.registerStatusBarItem({
        id: 'gcscode.example.status',
        component: ExampleStatus,
        alignment: 'right',
      }),
      context.host.registerCommand({
        id: 'gcscode.example.greet',
        run: () => {
          const message = 'Hello from gcscode.example';
          console.log(message);
          return message;
        },
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+G',
        command: 'gcscode.example.greet',
      }),
    );
  },
};
```

- [ ] **Step 3c.3: Update `packages/extension-example/src/index.test.ts`**

Replace the entire file with the post-rename version:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { ExtensionContext } from '@gcscode/extension-api';

import { exampleExtension } from './index';
import ExampleView from './example-view.svelte';
import ExampleStatus from './example-status.svelte';

describe('exampleExtension', () => {
  it('declares stable identity metadata', () => {
    expect(exampleExtension.id).toBe('gcscode.example');
    expect(exampleExtension.displayName).toBe('Example Extension');
    expect(typeof exampleExtension.version).toBe('string');
  });

  it('registers a view, a status bar item, a command, and a keybinding, pushing all four disposables', () => {
    const viewDisposable = { dispose: vi.fn() };
    const statusDisposable = { dispose: vi.fn() };
    const commandDisposable = { dispose: vi.fn() };
    const keybindingDisposable = { dispose: vi.fn() };
    const registerView = vi.fn().mockReturnValue(viewDisposable);
    const registerStatusBarItem = vi.fn().mockReturnValue(statusDisposable);
    const registerCommand = vi.fn().mockReturnValue(commandDisposable);
    const registerKeybinding = vi.fn().mockReturnValue(keybindingDisposable);
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const subscriptions: ExtensionContext['subscriptions'] = [];

    exampleExtension.activate({
      host: {
        registerView,
        registerStatusBarItem,
        registerCommand,
        registerKeybinding,
        executeCommand,
      },
      subscriptions,
      extension: {
        id: exampleExtension.id,
        displayName: exampleExtension.displayName,
        version: exampleExtension.version,
      },
    });

    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.example.main',
      component: ExampleView,
    });
    expect(registerStatusBarItem).toHaveBeenCalledWith({
      id: 'gcscode.example.status',
      component: ExampleStatus,
      alignment: 'right',
    });
    expect(registerCommand).toHaveBeenCalledWith({
      id: 'gcscode.example.greet',
      run: expect.any(Function),
    });
    expect(registerKeybinding).toHaveBeenCalledWith({
      key: 'Alt+Shift+G',
      command: 'gcscode.example.greet',
    });
    expect(subscriptions).toEqual([
      viewDisposable,
      statusDisposable,
      commandDisposable,
      keybindingDisposable,
    ]);
  });

  it('the greet command returns the expected greeting and logs it', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const registerView = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerStatusBarItem = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerCommand = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerKeybinding = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    exampleExtension.activate({
      host: {
        registerView,
        registerStatusBarItem,
        registerCommand,
        registerKeybinding,
        executeCommand,
      },
      subscriptions: [],
      extension: {
        id: exampleExtension.id,
        displayName: exampleExtension.displayName,
        version: exampleExtension.version,
      },
    });

    const greetContribution = registerCommand.mock.calls[0][0];
    expect(greetContribution.run()).toBe('Hello from gcscode.example');
    expect(consoleLogSpy).toHaveBeenCalledWith('Hello from gcscode.example');

    consoleLogSpy.mockRestore();
  });
});
```

- [ ] **Step 3c.4: Update `packages/extension-example/src/example-view.svelte`**

Update the display text:

```svelte
<section>
  <h2>Example Extension</h2>
  <p>This UI fragment was contributed by @gcscode/extension-example.</p>
</section>
```

- [ ] **Step 3c.5: Update `packages/extension-example/README.md`**

The README is touched in Task 4 (living-doc rewrite), not now. Skip.

### 3d. Edit `packages/shell/src/extension-host/`

- [ ] **Step 3d.1: Update `packages/shell/src/extension-host/registry.ts`**

Replace the entire file with the post-rename version. Changes: imports from `@gcscode/extension-api`, type names, parameter / variable names (`plugin` → `extension`, `pluginId` → `extensionId`, `subscriptionsByPlugin` → `subscriptionsByExtension`, `createHost(plugin)` → `createHost(extension)`), error / log strings (`plugin "..."` → `extension "..."`), and JSDoc / inline comments. Behavior is unchanged — `SvelteMap`s, dispose-by-equality guards, LIFO deactivation, error-resilient dispose, all preserved.

```ts
import type {
  CommandContribution,
  Disposable,
  Extension,
  ExtensionContext,
  ExtensionHost,
  ExtensionIdentity,
  KeybindingContribution,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/extension-api';

import { SvelteMap } from 'svelte/reactivity';

export interface Registry {
  activate(extension: Extension): void;
  deactivate(extensionId: string): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}

// Invariant: registry mutations propagate reactively to mounted consumers.
// The four contribution maps are SvelteMap instances (from svelte/reactivity),
// so $derived(registry.list*()) re-tracks on set/delete and the rendered UI
// updates without remount. subscriptionsByExtension stays a plain Map because
// no UI consumer reads it — the registry uses it internally for deactivate
// orchestration only.
export function createRegistry(): Registry {
  const views = new SvelteMap<string, ViewContribution>();
  const statusBarItems = new SvelteMap<string, StatusBarItemContribution>();
  const commands = new SvelteMap<string, CommandContribution>();
  const keybindings = new SvelteMap<string, KeybindingContribution>();
  const subscriptionsByExtension = new Map<string, readonly Disposable[]>();

  function execute<T>(id: string, args: unknown[], attribution: string): Promise<T> {
    const command = commands.get(id);
    if (command === undefined) {
      throw new Error(`Command id "${id}" is not registered (attempted by ${attribution}).`);
    }
    return Promise.resolve().then(() => command.run(...args)) as Promise<T>;
  }

  function createHost(extension: ExtensionIdentity): ExtensionHost {
    return {
      registerView(view) {
        if (views.has(view.id)) {
          throw new Error(
            `View id "${view.id}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        views.set(view.id, view);
        return {
          dispose() {
            // Idempotent and safe under re-registration: only delete if the
            // entry currently in the map is the one this disposable owns.
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
            // Idempotent and safe under re-registration: only delete if the
            // entry currently in the map is the one this disposable owns.
            if (statusBarItems.get(item.id) === item) {
              statusBarItems.delete(item.id);
            }
          },
        };
      },
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
      registerKeybinding(keybinding) {
        if (keybindings.has(keybinding.key)) {
          throw new Error(
            `Keybinding "${keybinding.key}" is already registered (attempted by extension "${extension.id}").`,
          );
        }
        keybindings.set(keybinding.key, keybinding);
        return {
          dispose() {
            // Idempotent and safe under re-registration: only delete if the
            // entry currently in the map is the one this disposable owns.
            if (keybindings.get(keybinding.key) === keybinding) {
              keybindings.delete(keybinding.key);
            }
          },
        };
      },
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        return execute<T>(id, args, `extension "${extension.id}"`);
      },
    };
  }

  return {
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
      extension.activate(context);
      subscriptionsByExtension.set(identity.id, context.subscriptions);
    },
    deactivate(extensionId) {
      const subscriptions = subscriptionsByExtension.get(extensionId);
      if (subscriptions === undefined) {
        throw new Error(`Cannot deactivate extension: id "${extensionId}" is not active.`);
      }
      // LIFO: dispose in reverse registration order. An extension that registers a
      // higher-level disposable later may depend on lower-level ones registered
      // earlier; reverse order tears down the higher-level layer first.
      for (let i = subscriptions.length - 1; i >= 0; i--) {
        try {
          subscriptions[i].dispose();
        } catch (error) {
          console.error(`Error disposing subscription for extension "${extensionId}":`, error);
        }
      }
      subscriptionsByExtension.delete(extensionId);
    },
    listViews() {
      return Array.from(views.values());
    },
    listStatusBarItems() {
      return Array.from(statusBarItems.values());
    },
    listCommands() {
      return Array.from(commands.values());
    },
    listKeybindings() {
      return Array.from(keybindings.values());
    },
    executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
      return execute<T>(id, args, 'host');
    },
  };
}
```

- [ ] **Step 3d.2: Update `packages/shell/src/extension-host/registry.test.ts`**

This file is the largest single edit. It uses:

- Type imports: `Plugin`, `PluginContext`, `PluginHost`, `PluginIdentity` → `Extension`, `ExtensionContext`, `ExtensionHost`, `ExtensionIdentity`.
- A helper function `function plugin(id, activate)` → rename to `function extension(id, activate)`.
- Test data ids `plugin.a`, `plugin.b`, `plugin.a.view`, `plugin.a.status`, `plugin.a.cmd`, `plugin.a.first`, `plugin.a.second`, `plugin.a.greet`, `plugin.a.add`, `plugin.a.boom`, `plugin.a.async-boom`, `not-active.plugin` → rename consistently to `ext.a`, `ext.b`, `ext.a.view`, etc., and `not-active.ext` for the unknown-id test.
- Error-message regex assertions like `/shared.*plugin\.b/`, `/Ctrl\+Shift\+G.*plugin\.b/`, `/does-not-exist.*plugin\.a/`, `/Cannot deactivate plugin: id "not-active\.plugin" is not active/`, `/Cannot deactivate plugin: id "plugin\.a" is not active/` → updated to match the new ids and the new error-message format ("extension" instead of "plugin").
- The describe blocks like `'passes plugin identity through context.plugin'` → `'passes extension identity through context.extension'`.
- Field access `ctx.plugin` → `ctx.extension`.
- Test description text mentioning "plugin" → "extension".

Replace the entire file with:

```ts
import { describe, expect, it, vi } from 'vitest';

import type {
  Disposable,
  Extension,
  ExtensionContext,
  ExtensionHost,
  ExtensionIdentity,
  ViewContribution,
} from '@gcscode/extension-api';

import { createRegistry } from './registry';

const fakeComponent = {} as ViewContribution['component'];

function extension(id: string, activate: (context: ExtensionContext) => void): Extension {
  return { id, displayName: id, version: '0.0.0', activate };
}

describe('createRegistry', () => {
  it('starts with no views', () => {
    const registry = createRegistry();
    expect(registry.listViews()).toHaveLength(0);
  });

  it('records views registered through host.registerView', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent });
      }),
    );
    expect(registry.listViews()).toEqual([{ id: 'ext.a.view', component: fakeComponent }]);
  });

  it('keeps registrations from multiple extensions', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent });
      }),
    );
    registry.activate(
      extension('ext.b', (ctx) => {
        ctx.host.registerView({ id: 'ext.b.view', component: fakeComponent });
      }),
    );
    expect(registry.listViews()).toHaveLength(2);
  });

  it('returns a disposable from registerView that removes the view', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
        });
      }),
    );
    expect(registry.listViews()).toHaveLength(1);
    disposable!.dispose();
    expect(registry.listViews()).toHaveLength(0);
  });

  it('disposable.dispose() is idempotent for views', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listViews()).toHaveLength(0);
  });

  it('throws when two extensions register the same view id', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerView({ id: 'shared', component: fakeComponent });
      }),
    );
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.registerView({ id: 'shared', component: fakeComponent });
        }),
      ),
    ).toThrow(/shared.*ext\.b/);
  });

  it('passes extension identity through context.extension', () => {
    const registry = createRegistry();
    let captured: ExtensionIdentity | undefined;
    registry.activate({
      id: 'ext.a',
      displayName: 'Extension A',
      version: '1.2.3',
      activate(ctx) {
        captured = ctx.extension;
      },
    });
    expect(captured).toEqual({
      id: 'ext.a',
      displayName: 'Extension A',
      version: '1.2.3',
    });
  });

  it('exposes a fresh subscriptions array on the context', () => {
    const registry = createRegistry();
    let subs: Disposable[] | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        subs = ctx.subscriptions;
        subs.push(ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }));
      }),
    );
    expect(subs).toHaveLength(1);
    expect(typeof subs![0].dispose).toBe('function');
  });

  it('starts with no status bar items', () => {
    const registry = createRegistry();
    expect(registry.listStatusBarItems()).toHaveLength(0);
  });

  it('records status bar items registered through host.registerStatusBarItem', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'ext.a.status',
          component: fakeComponent,
          alignment: 'right',
        });
      }),
    );
    expect(registry.listStatusBarItems()).toEqual([
      { id: 'ext.a.status', component: fakeComponent, alignment: 'right' },
    ]);
  });

  it('returns a disposable from registerStatusBarItem that removes the item', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerStatusBarItem({
          id: 'ext.a.status',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expect(registry.listStatusBarItems()).toHaveLength(1);
    disposable!.dispose();
    expect(registry.listStatusBarItems()).toHaveLength(0);
  });

  it('disposable.dispose() is idempotent for status bar items', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerStatusBarItem({
          id: 'ext.a.status',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listStatusBarItems()).toHaveLength(0);
  });

  it('throws when two extensions register the same status bar item id', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'shared',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.registerStatusBarItem({
            id: 'shared',
            component: fakeComponent,
            alignment: 'right',
          });
        }),
      ),
    ).toThrow(/shared.*ext\.b/);
  });

  it('preserves registration order in listStatusBarItems', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'ext.a.first',
          component: fakeComponent,
          alignment: 'left',
        });
        ctx.host.registerStatusBarItem({
          id: 'ext.a.second',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expect(registry.listStatusBarItems().map((i) => i.id)).toEqual(['ext.a.first', 'ext.a.second']);
  });

  it('starts with no commands', () => {
    const registry = createRegistry();
    expect(registry.listCommands()).toHaveLength(0);
  });

  it('records commands registered through host.registerCommand', () => {
    const registry = createRegistry();
    const run = () => undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.cmd', run });
      }),
    );
    expect(registry.listCommands()).toEqual([{ id: 'ext.a.cmd', run }]);
  });

  it('returns a disposable from registerCommand that removes the command', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerCommand({
          id: 'ext.a.cmd',
          run: () => undefined,
        });
      }),
    );
    expect(registry.listCommands()).toHaveLength(1);
    disposable!.dispose();
    expect(registry.listCommands()).toHaveLength(0);
  });

  it('disposable.dispose() is idempotent for commands', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerCommand({
          id: 'ext.a.cmd',
          run: () => undefined,
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listCommands()).toHaveLength(0);
  });

  it('throws when two extensions register the same command id', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'shared', run: () => undefined });
      }),
    );
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.registerCommand({ id: 'shared', run: () => undefined });
        }),
      ),
    ).toThrow(/shared.*ext\.b/);
  });

  it('allows the same id across all three kinds (view, status bar, command)', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerView({ id: 'shared', component: fakeComponent });
        ctx.host.registerStatusBarItem({
          id: 'shared',
          component: fakeComponent,
          alignment: 'left',
        });
        ctx.host.registerCommand({ id: 'shared', run: () => undefined });
      }),
    );
    expect(registry.listViews()).toHaveLength(1);
    expect(registry.listStatusBarItems()).toHaveLength(1);
    expect(registry.listCommands()).toHaveLength(1);
  });

  it('preserves registration order in listCommands', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.first', run: () => undefined });
        ctx.host.registerCommand({ id: 'ext.a.second', run: () => undefined });
      }),
    );
    expect(registry.listCommands().map((c) => c.id)).toEqual(['ext.a.first', 'ext.a.second']);
  });

  it('executeCommand resolves with the run return value', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.greet',
          run: () => 'hello',
        });
      }),
    );

    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        executor = ctx.host;
      }),
    );

    await expect(executor!.executeCommand('ext.a.greet')).resolves.toBe('hello');
  });

  it('executeCommand threads variadic args through to run', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.add',
          run: (...args) => (args[0] as number) + (args[1] as number),
        });
      }),
    );

    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        executor = ctx.host;
      }),
    );

    await expect(executor!.executeCommand('ext.a.add', 2, 3)).resolves.toBe(5);
  });

  it('executeCommand throws synchronously when the id is not registered', () => {
    const registry = createRegistry();
    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        executor = ctx.host;
      }),
    );

    expect(() => executor!.executeCommand('does-not-exist')).toThrow(/does-not-exist.*ext\.a/);
  });

  it('executeCommand surfaces sync throws inside run as rejected Promises', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.boom',
          run: () => {
            throw new Error('boom');
          },
        });
      }),
    );

    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        executor = ctx.host;
      }),
    );

    await expect(executor!.executeCommand('ext.a.boom')).rejects.toThrow(/boom/);
  });

  it('executeCommand passes async rejections from run through unchanged', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.async-boom',
          run: () => Promise.reject(new Error('async-boom')),
        });
      }),
    );

    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        executor = ctx.host;
      }),
    );

    await expect(executor!.executeCommand('ext.a.async-boom')).rejects.toThrow(/async-boom/);
  });

  it('starts with no keybindings', () => {
    const registry = createRegistry();
    expect(registry.listKeybindings()).toHaveLength(0);
  });

  it('records keybindings registered through host.registerKeybinding', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' });
      }),
    );
    expect(registry.listKeybindings()).toEqual([{ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' }]);
  });

  it('returns a disposable from registerKeybinding that removes the keybinding', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerKeybinding({
          key: 'Ctrl+Shift+G',
          command: 'ext.a.cmd',
        });
      }),
    );
    expect(registry.listKeybindings()).toHaveLength(1);
    disposable!.dispose();
    expect(registry.listKeybindings()).toHaveLength(0);
  });

  it('disposable.dispose() is idempotent for keybindings', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerKeybinding({
          key: 'Ctrl+Shift+G',
          command: 'ext.a.cmd',
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listKeybindings()).toHaveLength(0);
  });

  it('throws when two extensions register the same keybinding key', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' });
      }),
    );
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.b.cmd' });
        }),
      ),
    ).toThrow(/Ctrl\+Shift\+G.*ext\.b/);
  });

  it('preserves registration order in listKeybindings', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+A', command: 'ext.a.first' });
        ctx.host.registerKeybinding({ key: 'Ctrl+B', command: 'ext.a.second' });
      }),
    );
    expect(registry.listKeybindings().map((k) => k.key)).toEqual(['Ctrl+A', 'Ctrl+B']);
  });

  it('registry.executeCommand resolves with the run return value', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.greet',
          run: () => 'hello',
        });
      }),
    );

    await expect(registry.executeCommand('ext.a.greet')).resolves.toBe('hello');
  });

  it('registry.executeCommand threads variadic args through to run', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.add',
          run: (...args) => (args[0] as number) + (args[1] as number),
        });
      }),
    );

    await expect(registry.executeCommand('ext.a.add', 2, 3)).resolves.toBe(5);
  });

  it('registry.executeCommand throws synchronously when the id is not registered (attribution: host)', () => {
    const registry = createRegistry();
    expect(() => registry.executeCommand('does-not-exist')).toThrow(/does-not-exist.*host/);
  });

  it('registry.executeCommand surfaces sync throws inside run as rejected Promises', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.boom',
          run: () => {
            throw new Error('boom');
          },
        });
      }),
    );

    await expect(registry.executeCommand('ext.a.boom')).rejects.toThrow(/boom/);
  });

  it('registry.executeCommand passes async rejections from run through unchanged', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.async-boom',
          run: () => Promise.reject(new Error('async-boom')),
        });
      }),
    );

    await expect(registry.executeCommand('ext.a.async-boom')).rejects.toThrow(/async-boom/);
  });

  it("deactivate removes all of the extension's contributions across kinds", () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }),
          ctx.host.registerStatusBarItem({
            id: 'ext.a.status',
            component: fakeComponent,
            alignment: 'right',
          }),
          ctx.host.registerCommand({ id: 'ext.a.cmd', run: () => undefined }),
          ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' }),
        );
      }),
    );
    expect(registry.listViews()).toHaveLength(1);
    expect(registry.listStatusBarItems()).toHaveLength(1);
    expect(registry.listCommands()).toHaveLength(1);
    expect(registry.listKeybindings()).toHaveLength(1);

    registry.deactivate('ext.a');

    expect(registry.listViews()).toHaveLength(0);
    expect(registry.listStatusBarItems()).toHaveLength(0);
    expect(registry.listCommands()).toHaveLength(0);
    expect(registry.listKeybindings()).toHaveLength(0);
  });

  it('deactivate disposes subscriptions in reverse registration order (LIFO)', () => {
    const registry = createRegistry();
    const order: number[] = [];
    registry.activate(
      extension('ext.a', (ctx) => {
        for (let i = 0; i < 4; i++) {
          const idx = i;
          ctx.subscriptions.push({
            dispose() {
              order.push(idx);
            },
          });
        }
      }),
    );

    registry.deactivate('ext.a');

    expect(order).toEqual([3, 2, 1, 0]);
  });

  it('deactivate logs and continues when a dispose() throws', () => {
    const registry = createRegistry();
    const order: string[] = [];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push({
          dispose() {
            order.push('first');
          },
        });
        ctx.subscriptions.push({
          dispose() {
            order.push('middle');
            throw new Error('boom');
          },
        });
        ctx.subscriptions.push({
          dispose() {
            order.push('last');
          },
        });
      }),
    );

    expect(() => registry.deactivate('ext.a')).not.toThrow();

    // LIFO: last → middle → first; all three attempted despite middle throwing.
    expect(order).toEqual(['last', 'middle', 'first']);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('ext.a');

    consoleErrorSpy.mockRestore();
  });

  it('deactivate throws when called with an unknown / not-active extension id', () => {
    const registry = createRegistry();
    expect(() => registry.deactivate('not-active.ext')).toThrow(
      /Cannot deactivate extension: id "not-active\.ext" is not active/,
    );
  });

  it('deactivate throws on the second call (id is no longer active)', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }),
        );
      }),
    );

    registry.deactivate('ext.a');

    expect(() => registry.deactivate('ext.a')).toThrow(
      /Cannot deactivate extension: id "ext\.a" is not active/,
    );
  });

  it('re-activating a deactivated extension works without duplicate-id errors', () => {
    const registry = createRegistry();
    const e = extension('ext.a', (ctx) => {
      ctx.subscriptions.push(ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }));
    });

    registry.activate(e);
    expect(registry.listViews().map((v) => v.id)).toEqual(['ext.a.view']);

    registry.deactivate('ext.a');
    expect(registry.listViews()).toHaveLength(0);

    // The same extension can be re-activated against a clean slate.
    expect(() => registry.activate(e)).not.toThrow();
    expect(registry.listViews().map((v) => v.id)).toEqual(['ext.a.view']);
  });

  it('deactivate isolates extensions — deactivating one does not affect another', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }),
        );
      }),
    );
    registry.activate(
      extension('ext.b', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.registerView({ id: 'ext.b.view', component: fakeComponent }),
        );
      }),
    );
    expect(registry.listViews()).toHaveLength(2);

    registry.deactivate('ext.a');

    expect(registry.listViews().map((v) => v.id)).toEqual(['ext.b.view']);
  });
});
```

### 3e. Edit `packages/shell/src/` (top-level shell files)

- [ ] **Step 3e.1: Update `packages/shell/src/main.ts`**

Replace with:

```ts
import { mount } from 'svelte';

import { exampleExtension } from '@gcscode/extension-example';

import './app.css';
import App from './app.svelte';
import { attachKeybindingDispatcher } from './keybinding-dispatcher';
import { createRegistry } from './extension-host/registry';

const registry = createRegistry();
registry.activate(exampleExtension);

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
```

- [ ] **Step 3e.2: Update `packages/shell/src/app.svelte`**

Two changes: registry import path and the empty-state message.

```svelte
<script lang="ts">
  import type { Registry } from './extension-host/registry';

  let { registry }: { registry: Registry } = $props();

  const views = $derived(registry.listViews());
  const statusBarItems = $derived(registry.listStatusBarItems());
  const leftStatus = $derived(statusBarItems.filter((i) => i.alignment === 'left'));
  const rightStatus = $derived(statusBarItems.filter((i) => i.alignment === 'right'));
</script>

<main class="shell">
  <header class="shell__header">GCScode</header>
  <section class="shell__content">
    {#if views.length === 0}
      <p data-testid="empty-state">No extensions registered.</p>
    {:else}
      {#each views as { id, component: Component } (id)}
        <Component />
      {/each}
    {/if}
  </section>
  <footer
    class="shell__statusbar flex items-center justify-between border-t border-neutral-300 px-3 py-1 text-xs"
    data-testid="statusbar"
  >
    <div
      class="shell__statusbar-side shell__statusbar-side--left flex items-center gap-3"
      data-testid="statusbar-left"
    >
      {#each leftStatus as { id, component: Component } (id)}
        <Component />
      {/each}
    </div>
    <div
      class="shell__statusbar-side shell__statusbar-side--right flex items-center gap-3"
      data-testid="statusbar-right"
    >
      {#each rightStatus as { id, component: Component } (id)}
        <Component />
      {/each}
    </div>
  </footer>
</main>
```

After saving, run the Svelte autofixer to ensure no Svelte 5 issues:

```bash
# Inside the agent: invoke svelte-autofixer MCP tool on this file's contents.
# If it returns issues, apply the suggested fixes and re-run until clean.
```

- [ ] **Step 3e.3: Update `packages/shell/src/app.test.ts`**

Replace with:

```ts
import { render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';

import type { Extension } from '@gcscode/extension-api';

import { createRegistry } from './extension-host/registry';
import App from './app.svelte';
import MockContent from './__fixtures__/mock-content.svelte';
import MockLeft from './__fixtures__/mock-left.svelte';
import MockRight from './__fixtures__/mock-right.svelte';

function makeExtension(activate: Extension['activate']): Extension {
  return {
    id: 'test',
    displayName: 'Test',
    version: '0.0.0',
    activate,
  };
}

describe('app.svelte', () => {
  it('shows the empty state when no extensions are registered', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders every registered view', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerView({ id: 'test.view', component: MockContent });
      }),
    );

    render(App, { props: { registry } });

    expect(screen.getByText('mock-content')).toBeInTheDocument();
  });

  it('renders the status bar even when no items are registered', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('statusbar')).toBeInTheDocument();
  });

  it('places status bar items in the side that matches alignment', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'test.left',
          component: MockLeft,
          alignment: 'left',
        });
        ctx.host.registerStatusBarItem({
          id: 'test.right',
          component: MockRight,
          alignment: 'right',
        });
      }),
    );

    render(App, { props: { registry } });

    const left = screen.getByTestId('statusbar-left');
    const right = screen.getByTestId('statusbar-right');
    expect(within(left).getByText('mock-left')).toBeInTheDocument();
    expect(within(right).getByText('mock-right')).toBeInTheDocument();
    expect(within(left).queryByText('mock-right')).not.toBeInTheDocument();
    expect(within(right).queryByText('mock-left')).not.toBeInTheDocument();
  });

  it('renders multiple items on the same side in registration order', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'test.first',
          component: MockLeft,
          alignment: 'left',
        });
        ctx.host.registerStatusBarItem({
          id: 'test.second',
          component: MockRight,
          alignment: 'left',
        });
      }),
    );

    render(App, { props: { registry } });

    const left = screen.getByTestId('statusbar-left');
    const texts = Array.from(left.children).map((el) => el.textContent);
    expect(texts).toEqual(['mock-left', 'mock-right']);
  });

  it('reflects post-mount view registration in the rendered UI', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();

    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerView({ id: 'late.view', component: MockContent });
      }),
    );
    flushSync();

    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
    expect(screen.getByText('mock-content')).toBeInTheDocument();
  });

  it('reflects post-mount view deactivation in the rendered UI', () => {
    const registry = createRegistry();
    registry.activate(
      makeExtension((ctx) => {
        ctx.subscriptions.push(ctx.host.registerView({ id: 'test.view', component: MockContent }));
      }),
    );
    render(App, { props: { registry } });
    expect(screen.getByText('mock-content')).toBeInTheDocument();

    registry.deactivate('test');
    flushSync();

    expect(screen.queryByText('mock-content')).not.toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('reflects post-mount status bar item registration on the matching side', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });

    registry.activate(
      makeExtension((ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'late.left',
          component: MockLeft,
          alignment: 'left',
        });
      }),
    );
    flushSync();

    const left = screen.getByTestId('statusbar-left');
    const right = screen.getByTestId('statusbar-right');
    expect(within(left).getByText('mock-left')).toBeInTheDocument();
    expect(within(right).queryByText('mock-left')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3e.4: Update `packages/shell/src/keybinding-dispatcher.ts`**

Only the registry import path changes. Replace with:

```ts
import type { Disposable } from '@gcscode/extension-api';

import type { Registry } from './extension-host/registry';

interface ParsedKey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

export function parseKey(input: string): ParsedKey {
  const tokens = input.split('+').map((t) => t.trim());
  const parsed: ParsedKey = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === '') {
      throw new Error(
        `Keybinding "${input}" has an empty token (likely a stray "+" or whitespace-only segment)`,
      );
    }
    if (lower === 'ctrl' || lower === 'control') parsed.ctrl = true;
    else if (lower === 'shift') parsed.shift = true;
    else if (lower === 'alt') parsed.alt = true;
    else if (lower === 'meta' || lower === 'cmd' || lower === 'command') parsed.meta = true;
    else {
      if (parsed.key !== '') {
        throw new Error(`Keybinding "${input}" has more than one non-modifier key`);
      }
      parsed.key = lower;
    }
  }
  if (parsed.key === '') {
    throw new Error(`Keybinding "${input}" has no non-modifier key`);
  }
  return parsed;
}

export function matchesKey(event: KeyboardEvent, parsed: ParsedKey): boolean {
  if (event.ctrlKey !== parsed.ctrl) return false;
  if (event.shiftKey !== parsed.shift) return false;
  if (event.altKey !== parsed.alt) return false;
  if (event.metaKey !== parsed.meta) return false;

  if (event.key.toLowerCase() === parsed.key) return true;

  // macOS mangles event.key for letter/digit registrations under certain
  // modifiers (Option/Alt as a compose key; some layouts under Ctrl too —
  // e.g. Ctrl+Shift+G producing 'Ì'). event.code reports the physical key,
  // layout/modifier-independent, so use it as a backstop for single ASCII
  // letters and digits. Multi-char registrations (Enter, ArrowLeft) and
  // punctuation are unaffected.
  if (/^[a-z]$/.test(parsed.key)) return event.code === `Key${parsed.key.toUpperCase()}`;
  if (/^[0-9]$/.test(parsed.key)) return event.code === `Digit${parsed.key}`;

  return false;
}

export function attachKeybindingDispatcher(registry: Registry, target: EventTarget): Disposable {
  const handler = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    for (const kb of registry.listKeybindings()) {
      let parsed: ParsedKey;
      try {
        parsed = parseKey(kb.key);
      } catch (err) {
        console.error(`[keybinding-dispatcher] failed to parse "${kb.key}":`, err);
        continue;
      }
      if (matchesKey(event, parsed)) {
        event.preventDefault();
        try {
          void registry.executeCommand(kb.command).catch((err) => {
            console.error(
              `[keybinding-dispatcher] command "${kb.command}" rejected (key "${kb.key}"):`,
              err,
            );
          });
        } catch (err) {
          // Sync throw from registry.executeCommand (e.g. missing command id).
          console.error(
            `[keybinding-dispatcher] command "${kb.command}" threw synchronously (key "${kb.key}"):`,
            err,
          );
        }
        return; // first match wins
      }
    }
  };
  target.addEventListener('keydown', handler);
  return {
    dispose() {
      target.removeEventListener('keydown', handler);
    },
  };
}
```

- [ ] **Step 3e.5: Update `packages/shell/src/keybinding-dispatcher.test.ts`**

Type imports + helper function name + registry path + test data ids consistent with `registry.test.ts`. Replace with:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Extension, ExtensionContext } from '@gcscode/extension-api';

import { createRegistry } from './extension-host/registry';
import { parseKey, matchesKey, attachKeybindingDispatcher } from './keybinding-dispatcher';

function extension(id: string, activate: (context: ExtensionContext) => void): Extension {
  return { id, displayName: id, version: '0.0.0', activate };
}

describe('parseKey', () => {
  it('parses a single key', () => {
    expect(parseKey('g')).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: 'g',
    });
  });

  it('parses a single modifier + key', () => {
    expect(parseKey('Ctrl+G')).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      key: 'g',
    });
  });

  it('parses multiple modifiers + key', () => {
    expect(parseKey('Ctrl+Shift+Alt+Meta+G')).toEqual({
      ctrl: true,
      shift: true,
      alt: true,
      meta: true,
      key: 'g',
    });
  });

  it('is case-insensitive on modifiers and key', () => {
    expect(parseKey('CTRL+shift+G')).toEqual(parseKey('Ctrl+Shift+g'));
  });

  it('accepts Cmd and Command as aliases for Meta', () => {
    expect(parseKey('Cmd+G').meta).toBe(true);
    expect(parseKey('Command+G').meta).toBe(true);
  });

  it('accepts Control as an alias for Ctrl', () => {
    expect(parseKey('Control+G').ctrl).toBe(true);
  });

  it('throws on input with no non-modifier key', () => {
    expect(() => parseKey('Ctrl+Shift')).toThrow(/no non-modifier key/);
  });

  it('throws on input with multiple non-modifier keys', () => {
    expect(() => parseKey('g+h')).toThrow(/more than one non-modifier key/);
  });

  it('throws on empty input', () => {
    expect(() => parseKey('')).toThrow(/empty token|no non-modifier key/);
  });

  it('throws on empty token from a stray "+" (e.g. "Ctrl++G")', () => {
    expect(() => parseKey('Ctrl++G')).toThrow(/empty token/);
  });
});

describe('matchesKey', () => {
  function event(init: KeyboardEventInit): KeyboardEvent {
    return new KeyboardEvent('keydown', init);
  }

  it('returns true when modifiers and key match', () => {
    const parsed = parseKey('Ctrl+Shift+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true, shiftKey: true }), parsed)).toBe(true);
  });

  it('returns false when a modifier mismatches', () => {
    const parsed = parseKey('Ctrl+Shift+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true, shiftKey: false }), parsed)).toBe(false);
  });

  it('returns false when the key mismatches', () => {
    const parsed = parseKey('Ctrl+G');
    expect(matchesKey(event({ key: 'h', ctrlKey: true }), parsed)).toBe(false);
  });

  it('case-insensitive match on the key portion', () => {
    const parsed = parseKey('Ctrl+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true }), parsed)).toBe(true);
    expect(matchesKey(event({ key: 'g', ctrlKey: true }), parsed)).toBe(true);
  });

  it('matches multi-character named keys (Enter, ArrowLeft, Escape)', () => {
    expect(matchesKey(event({ key: 'Enter' }), parseKey('Enter'))).toBe(true);
    expect(matchesKey(event({ key: 'ArrowLeft' }), parseKey('ArrowLeft'))).toBe(true);
    expect(matchesKey(event({ key: 'Escape', ctrlKey: true }), parseKey('Ctrl+Escape'))).toBe(true);
  });

  it('falls back to event.code for letter keys when event.key is mangled (macOS Alt/layout)', () => {
    // Reproduces: macOS Option+Shift+G yields key='˝' but code='KeyG'.
    const parsed = parseKey('Alt+Shift+G');
    expect(
      matchesKey(event({ key: '˝', code: 'KeyG', altKey: true, shiftKey: true }), parsed),
    ).toBe(true);
  });

  it('falls back to event.code for letter keys under Ctrl when event.key is mangled', () => {
    // Reproduces user's report: Ctrl+Shift+G on their Mac yields key='Ì' but code='KeyG'.
    const parsed = parseKey('Ctrl+Shift+G');
    expect(
      matchesKey(event({ key: 'Ì', code: 'KeyG', ctrlKey: true, shiftKey: true }), parsed),
    ).toBe(true);
  });

  it('falls back to event.code for digit keys when event.key is mangled', () => {
    const parsed = parseKey('Alt+1');
    expect(matchesKey(event({ key: '¡', code: 'Digit1', altKey: true }), parsed)).toBe(true);
  });

  it('does not fall back when event.code points at a different physical key', () => {
    // event.key is 'q' (no match for 'g') and code='KeyH' (not 'KeyG') — must not match.
    const parsed = parseKey('g');
    expect(matchesKey(event({ key: 'q', code: 'KeyH' }), parsed)).toBe(false);
  });
});

describe('attachKeybindingDispatcher', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns a Disposable whose dispose() removes the listener', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.cmd' });
      }),
    );

    const disposable = attachKeybindingDispatcher(registry, target);
    expect(typeof disposable.dispose).toBe('function');
    disposable.dispose();

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    expect(run).not.toHaveBeenCalled();
  });

  it('fires the command when a registered keybinding matches the keydown event', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, cancelable: true });
    target.dispatchEvent(event);
    await Promise.resolve();

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('calls preventDefault on a matched event', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.cmd', run: () => undefined });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, cancelable: true });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing when no keybinding matches the keydown event', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true }));
    await Promise.resolve();

    expect(run).not.toHaveBeenCalled();
  });

  it('only the keybinding whose key matches the event fires (other registrations are skipped)', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const runFirst = vi.fn();
    const runSecond = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.first', run: runFirst });
        ctx.host.registerCommand({ id: 'ext.a.second', run: runSecond });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.first' });
        ctx.host.registerKeybinding({ key: 'Ctrl+H', command: 'ext.a.second' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    await Promise.resolve();

    expect(runFirst).toHaveBeenCalledTimes(1);
    expect(runSecond).not.toHaveBeenCalled();
  });

  it('does not throw out of the keydown handler when the bound command is not registered (sync throw caught)', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.does-not-exist' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    expect(() =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true })),
    ).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logs a parse error and continues iterating subsequent keybindings', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.cmd', run });
        // First keybinding has a malformed key (empty token from a stray "+");
        // dispatcher should log and continue, then match the second one.
        ctx.host.registerKeybinding({ key: 'Ctrl++G', command: 'ext.a.cmd' });
        ctx.host.registerKeybinding({ key: 'Ctrl+H', command: 'ext.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true }));
    await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalled(); // logged the parse failure
    expect(run).toHaveBeenCalledTimes(1); // and still fired the well-formed match
  });

  it('logs and does not throw when the bound command rejects asynchronously', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'ext.a.async-boom',
          run: () => Promise.reject(new Error('async-boom')),
        });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'ext.a.async-boom' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    // Flush enough microtasks to settle the chain:
    //   Promise.resolve().then(() => Promise.reject(...)) needs ~4 ticks for
    //   the rejection to propagate through thenable adoption to our .catch.
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3e.6: Update `packages/shell/package.json` deps**

```json
{
  "name": "@gcscode/shell",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gcscode/extension-api": "workspace:*",
    "@gcscode/extension-example": "workspace:*"
  }
}
```

### 3f. Edit root configs

- [ ] **Step 3f.1: Update root `tsconfig.json` references**

```json
{
  "files": [],
  "references": [
    { "path": "./packages/shell" },
    { "path": "./packages/extension-api" },
    { "path": "./packages/extension-example" }
  ]
}
```

- [ ] **Step 3f.2: Update root `eslint.config.ts` boundary rules**

The boundary block (the only place the file references "plugin") changes globs and message strings. Keep the rest of the file as-is.

```ts
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    files: ['packages/extension-*/**/*.{ts,svelte}'],
    ignores: ['packages/extension-api/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gcscode/shell', '@gcscode/shell/*'],
              message:
                'Extensions must only import from @gcscode/extension-api. Shell internals are not part of the extension API.',
            },
            {
              group: ['../../*', '../../../*'],
              message: 'Extensions must not use relative imports that escape the package root.',
            },
          ],
        },
      ],
    },
  },
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.svelte-kit/**'] },
];
```

- [ ] **Step 3f.3: Confirm other configs need no changes**

Run:

```bash
grep -n -i "plugin" packages/shell/vite.config.ts packages/shell/svelte.config.js packages/shell/vitest.config.ts packages/extension-example/vitest.config.ts pnpm-workspace.yaml package.json 2>/dev/null
```

Expected: only third-party `plugin*` references (e.g. `@sveltejs/vite-plugin-svelte`, `eslint-plugin-svelte`, `prettier-plugin-svelte`, the `plugins: [...]` array in Vite config). None refer to `@gcscode/plugin-*` or our internal `Plugin` types — these are unrelated and stay as-is.

If any line surprises you (e.g. you find `@gcscode/plugin-api` in a file not listed above), update it accordingly before continuing.

### 3g. Regenerate lockfile and validate

- [ ] **Step 3g.1: Regenerate `pnpm-lock.yaml`**

Run:

```bash
pnpm install
```

Expected: pnpm resolves the renamed workspace packages cleanly. The lockfile is updated. `node_modules/@gcscode/extension-api` and `node_modules/@gcscode/extension-example` symlinks exist where the old `plugin-*` ones used to be.

If `pnpm install` errors with unresolved workspace references, re-check Steps 3b.1, 3c.1, and 3e.6 — you have a typo or missed dep update.

- [ ] **Step 3g.2: Run `pnpm check`**

Run:

```bash
pnpm check
```

Expected: all three packages pass `svelte-check + tsc` clean. If anything fails, the most likely cause is a missed import path or type rename — read the error and fix the cited file.

- [ ] **Step 3g.3: Run `pnpm test`**

Run:

```bash
pnpm test
```

Expected: all existing tests pass (no test logic changed; only test data ids and helper function names). Test count matches what the b2a iteration was passing.

If a test fails on regex matching (e.g., `/shared.*ext\.b/`), it's likely a leftover `plugin\.b` regex you missed in the test edits — read the failing assertion and fix the matching test source.

- [ ] **Step 3g.4: Run `pnpm lint`**

Run:

```bash
pnpm lint
```

Expected: ESLint + Prettier both clean. The new ESLint boundary rule should produce zero violations.

If Prettier wants to reformat some markdown or .ts files, run:

```bash
pnpm format
```

…then re-run `pnpm lint`. Re-stage any reformatted files.

- [ ] **Step 3g.5: Manual: `pnpm dev` smoke test**

Run:

```bash
pnpm dev
```

Open the printed `http://localhost:NNNN/` URL in a browser. Verify:

1. The page renders without console errors (open dev tools).
2. The "Example Extension" view appears in the main content area (with the heading "Example Extension" and the text "This UI fragment was contributed by @gcscode/extension-example").
3. The example status bar item appears on the right side of the footer.
4. Pressing `Alt+Shift+G` (Mac: `⌥+Shift+G`) logs `'Hello from gcscode.example'` to the dev-tools console.

If anything is off, kill the dev server, fix the issue, and retry. Do not commit until manual verification passes.

Stop the dev server (Ctrl+C) when done.

### 3h. Commit the mechanical rename

- [ ] **Step 3h.1: Stage all changes**

Run:

```bash
git add -A
```

Expected: `git status` shows the renames (R lines), modified files (M lines), and the lockfile change. No unintended changes.

- [ ] **Step 3h.2: Verify the diff one last time**

Run:

```bash
git status --short
git diff --cached --stat | tail -30
```

Expected: ~17 files renamed (the contents of three directories) plus modifications to `tsconfig.json`, `eslint.config.ts`, `pnpm-lock.yaml`, `packages/shell/package.json`, `packages/shell/src/main.ts`, `packages/shell/src/app.svelte`, `packages/shell/src/app.test.ts`, `packages/shell/src/keybinding-dispatcher.ts`, `packages/shell/src/keybinding-dispatcher.test.ts`, and the contents of the renamed package source files / tests.

If you see anything unexpected (e.g. a doc rewrite that should belong in Task 4), unstage and re-check.

- [ ] **Step 3h.3: Commit**

```bash
git commit -m "refactor(rename): plugin → extension across @gcscode/* and shell"
```

Expected: commit succeeds. `git log --oneline -2` shows two feat-branch commits: the pointer-notes commit and this rename commit.

---

## Task 4: Rewrite living docs in place

**Goal:** Update prose-only docs that describe current state. No code touched.

**Files:**

- `CLAUDE.md`
- `packages/extension-api/README.md`
- `packages/extension-example/README.md`
- `packages/shell/README.md`
- `docs/roadmap.md`
- `docs/out-of-scope.md`

**Untouched:** Root `README.md` (vestigial Vite/Svelte template, no plugin/extension references).

**Editing principle:** Replace "plugin" with "extension," `Plugin` with `Extension`, `@gcscode/plugin-*` with `@gcscode/extension-*`, `plugin-host` (path) with `extension-host`, "plugin architecture" with "extension architecture," and so on, while preserving information content and structure. The `out-of-scope.md` and `roadmap.md` propagation sections of the spec list specific phrases to update — follow those lists when working on those files.

The skill workflow for each file: read it, mentally identify all "plugin/Plugin" references, edit each to use "extension/Extension," save, move on.

- [ ] **Step 4.1: Rewrite `CLAUDE.md`**

The file describes the project's structure, conventions, and planning approach. The phrase "plugin architecture" appears in both bullet form and prose; rewrite to "extension architecture" throughout for consistency. Specifically (non-exhaustive — read the full file and apply the rule):

- "Plugins contribute UI fragments" → "Extensions contribute UI fragments"
- "first-party features will be built as plugins against the same public API" → "as extensions"
- "@gcscode/plugin-api" → "@gcscode/extension-api"
- "@gcscode/plugin-example" → "@gcscode/extension-example"
- "Plugin packages import ONLY from `@gcscode/plugin-api`" (heading): "Extension packages import ONLY from `@gcscode/extension-api`"
- "if a plugin needs a capability" → "if an extension needs a capability"
- The "Plugin export name" item under Conventions → "Extension export name": "named `const` matching the plugin's slug" → "extension's slug"; "examplePlugin, telemetryPlugin, ..." → "exampleExtension, telemetryExtension, ..."
- "## Plugin shape" heading → "## Extension shape"
- "A plugin module exports a named `const` of type `Plugin`" → "An extension module exports a named `const` of type `Extension`"
- "Long-form contract: `packages/plugin-api/README.md`" → "`packages/extension-api/README.md`"

The "VS Code alignment (in spirit, not by byte)" section already reads "VS Code's extension architecture" — no change needed there. Cross-check after editing that no remaining "plugin" reference is unintended.

- [ ] **Step 4.2: Rewrite `packages/extension-api/README.md`**

Replace the file content with:

````markdown
# @gcscode/extension-api

The only import path for extensions. Everything an extension is allowed to do flows through the types in this package.

## Stability

Experimental. The surface is expected to change as permissions, lifecycle, and additional contribution kinds are added. The current version exposes a small, deliberately minimal set of contribution kinds.

## Usage

```ts
import type { Extension } from '@gcscode/extension-api';
import View from './view.svelte';
import StatusBadge from './status-badge.svelte';

export const myExtension: Extension = {
  id: 'my-namespace.my-extension',
  displayName: 'My Extension',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'my-namespace.my-extension.main',
        component: View,
      }),
      context.host.registerStatusBarItem({
        id: 'my-namespace.my-extension.status',
        component: StatusBadge,
        alignment: 'right',
      }),
      context.host.registerCommand({
        id: 'my-namespace.my-extension.greet',
        run: () => 'Hello',
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+G',
        command: 'my-namespace.my-extension.greet',
      }),
    );

    // Commands can be invoked by id from anywhere on the host:
    //   context.host.executeCommand('my-namespace.my-extension.greet')
    // — or fired by a registered keybinding when the user presses Alt+Shift+G.
  },
};
```
````

See `packages/extension-example/` for the canonical worked example.

## The activation context

`activate(context)` receives an `ExtensionContext`:

- **`context.host`** — the per-extension gate. Exposes one `register*` method per contribution kind (today: `registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) plus the verb `executeCommand<T>(id, ...args): Promise<T>` for firing any registered command by id. Each `register*` call returns a `Disposable`. The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't an extension), via the same shared implementation.
- **`context.subscriptions`** — push every `Disposable` here. The host disposes them when the extension is (eventually) deactivated. See ADR-0003.
- **`context.extension`** — read-only identity (`id`, `displayName`, `version`) for the activating extension, in case you need it for log prefixes or error messages.

## Conventions for extension authors

- Your package's main export must be a named `const` matching your extension's slug (e.g. `exampleExtension`, not `extension` or `default`).
- Provide stable, namespaced ids: `<extension-id>.<local-name>` (e.g. `gcscode.example.main`). Duplicate ids throw at registration; one id can be reused across the three id-keyed kinds (a view, a status bar item, and a command may all share the same id). Keybindings are keyed by their `key` field instead — duplicate keys throw separately.
- Your package must list `@gcscode/extension-api` as a dependency (`workspace:*` inside this monorepo; `peerDependency` once extensions are published externally).
- Never import from `@gcscode/shell`. Never use relative paths that escape your package root. ESLint enforces this (see root `eslint.config.ts`).

````

- [ ] **Step 4.3: Rewrite `packages/extension-example/README.md`**

Replace with:

```markdown
# @gcscode/extension-example

The canonical minimal extension. Mirror this shape when writing a new extension.

## What it demonstrates

- An extension lives in its own workspace package.
- Its only dependency on the host app is `@gcscode/extension-api`.
- It exports a named `const` (`exampleExtension`) of type `Extension` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
- Inside `activate`, it calls `context.host.registerView`, `context.host.registerStatusBarItem`, `context.host.registerCommand`, and `context.host.registerKeybinding`, then pushes all four returned `Disposable`s onto `context.subscriptions` — demonstrating multi-surface contributions from a single extension and showing how a command (called by id from elsewhere; the integration backbone for future palette / menu contributions) sits alongside UI contributions, with a keybinding wiring a key combo to fire the command.

## Anatomy

````

src/
index.ts - exports exampleExtension: Extension (identity + activate(context))
example-view.svelte - the contributed main-content fragment
example-status.svelte - the contributed status bar fragment

```

The extension contributes one of each kind:

- a view (`gcscode.example.main`),
- a status bar item (`gcscode.example.status`, right-aligned),
- a command (`gcscode.example.greet`, returns the fixed greeting `'Hello from gcscode.example'` and `console.log`s it),
- a keybinding (`Alt+Shift+G` → `gcscode.example.greet`). Press the combo with dev tools open to see the greeting log.

To write your own extension, copy this package, change the exported constant name (`exampleExtension` → `yourExtension`) and identity fields, rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.
```

- [ ] **Step 4.4: Rewrite `packages/shell/README.md`**

Replace with:

```markdown
# @gcscode/shell

The GCScode application shell. Boots Svelte, constructs the extension registry, activates extensions, and renders their contributions.

## Scripts

- `pnpm --filter @gcscode/shell dev` — run the dev server
- `pnpm --filter @gcscode/shell build` — production build
- `pnpm --filter @gcscode/shell test` — unit + component tests
- `pnpm --filter @gcscode/shell check` — svelte-check + tsc

## How the pieces fit

- `src/extension-host/registry.ts` — `createRegistry()` returns a `Registry` that owns one `Map` per contribution kind and mints a fresh `ExtensionHost` per extension internally during `registry.activate(extension)`.
- `src/main.ts` — creates the registry, synchronously calls `registry.activate(extension)` for each extension, then mounts `app.svelte` with the registry as a prop. All activations must complete before mount; see the invariant comment in `registry.ts`.
- `src/app.svelte` — reads `registry.listViews()` and `registry.listStatusBarItems()` via `$derived`, renders the view contributions in the content section, and renders the status bar items in a footer with two derived left/right groups. Shows an empty-state when no views are registered. Commands and keybindings are not rendered by `app.svelte` — commands are called by id via `host.executeCommand` (or via `registry.executeCommand` from shell-core code such as the keybinding dispatcher), and keybindings are dispatched by `src/keybinding-dispatcher.ts`. `registry.listCommands()` and `registry.listKeybindings()` exist for future palette / introspection consumers.
- `src/keybinding-dispatcher.ts` — `attachKeybindingDispatcher(registry, target)` listens for `keydown` events on `target` (typically `document`), iterates `registry.listKeybindings()`, and fires the matched command via `registry.executeCommand`. Returns a `Disposable` for teardown. Wired from `main.ts` after extension activation.

Static imports only: extensions are currently listed by package name in `main.ts`. Dynamic/runtime loading is out of scope for now (see `docs/out-of-scope.md`).
```

- [ ] **Step 4.5: Rewrite `docs/roadmap.md`**

Edit per the spec's "`docs/roadmap.md` propagation" section. The structure (Phase A/B/C, Feature plugins/extensions sections) is preserved; only terminology changes. Notable edits:

- Top-of-file: "the gcscode plugin architecture" → "the gcscode extension architecture"; "The plugin architecture grows in phases" → "The extension architecture grows in phases".
- B2b line: "Plugin enable/disable" → "Extension enable/disable"; trigger "a 'disable plugin' UI" → "a 'disable extension' UI".
- B3 line: "re-imports a plugin module" → "re-imports an extension module"; "plugin-author iteration friction" → "extension-author iteration friction".
- The `Plugin.deactivate?()` hook line: "**`Plugin.deactivate?()` hook**" → "**`Extension.deactivate?()` hook**"; "optional plugin-side hook" → "optional extension-side hook"; "first plugin needing it" → "first extension needing it".
- Phase C line: "Re-scope when a feature plugin pulls on it" → "Re-scope when a feature extension pulls on it".
- Section heading "## Feature plugins" → "## Feature extensions".
- "first-party plugins planned for the app" → "first-party extensions planned for the app".
- "future consumer of the plugin architecture" → "future consumer of the extension architecture".
- "first consumer of `Plugin.deactivate?()` hook" → "first consumer of `Extension.deactivate?()` hook".

After editing, scan the full file for any leftover "plugin" / "Plugin" references; verify all are intentional (e.g. references to git history if any).

- [ ] **Step 4.6: Rewrite `docs/out-of-scope.md`**

Edit per the spec's "`docs/out-of-scope.md` propagation" section. The structure is preserved; only terminology changes. The non-exhaustive list of edits is documented in the spec; consult that list while editing. Specifically:

- Section heading "## Plugin machinery" → "## Extension machinery".
- Every "plugin" → "extension" inside the bulleted body. Watch for capitalized type references like `PluginHost` → `ExtensionHost`, `Plugin.deactivate?()` → `Extension.deactivate?()`, `@gcscode/plugin-example` → `@gcscode/extension-example`.
- "Hot module reload for plugins." (heading-ish bullet) → "Hot module reload for extensions."
- "Dynamic / runtime plugin loading." → "Dynamic / runtime extension loading."
- "User-overridable keybindings." body: "Plugin-registered keybindings" → "Extension-registered keybindings".

After editing, scan for stragglers; verify intent.

- [ ] **Step 4.7: Run validation**

Living-doc rewrites do not affect compile/test, but verify lint:

```bash
pnpm lint
```

Expected: clean. If Prettier wants to reformat any markdown, run `pnpm format`, re-stage, and re-lint.

- [ ] **Step 4.8: Run a final code-and-test check (regression guard)**

Although Task 4 only touches docs, run the full validation chain to ensure nothing accidentally broke:

```bash
pnpm check && pnpm test
```

Expected: all clean.

- [ ] **Step 4.9: Audit for stragglers**

Run a grep for any remaining "plugin" references in the repo that are NOT third-party (Vite/ESLint/Prettier plugins) or git-history references:

```bash
grep -rn -i "plugin" \
  --include="*.ts" --include="*.svelte" --include="*.svelte.ts" \
  --include="*.md" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.worktrees --exclude-dir=.git \
  | grep -v "vite-plugin-svelte" \
  | grep -v "eslint-plugin-svelte" \
  | grep -v "prettier-plugin-svelte" \
  | grep -v "claude-plugins-official" \
  | grep -v "enabledPlugins" \
  | grep -v "pnpm-lock.yaml"
```

Expected: every remaining hit is one of:

- A pointer-note ADR-0004 link (mentions "plugin" in the human-readable note text — fine).
- A historical-doc body (ADRs / specs / plans we deliberately left as-is — fine).
- The rename spec / plan / ADR-0004 (which document the rename and reference both terms — fine).
- The `docs/out-of-scope.md` reference back to ADR-0003 mentions of "plugin" in trigger text we just fixed — should be zero occurrences after the rewrite.

If you find any unintended "plugin" reference (e.g. a stale identifier in a code file you missed), fix it before committing.

- [ ] **Step 4.10: Stage and commit**

Run:

```bash
git add CLAUDE.md \
        packages/extension-api/README.md \
        packages/extension-example/README.md \
        packages/shell/README.md \
        docs/roadmap.md \
        docs/out-of-scope.md

git status
```

Expected: only the six files staged. Anything else means a stray edit slipped into Task 4 that belongs elsewhere.

```bash
git commit -m "docs(rename): rewrite living docs with new terminology"
```

Expected: commit succeeds. `git log --oneline -3` shows three feat-branch commits.

---

## Task 5: Update user-side memory files (outside repo)

**Files:** `~/.claude/projects/-Users-kevinkroon-Projects-gcscode/memory/MEMORY.md` plus any individual memory file entries that contain "plugin."

**No git commit.** Memory lives outside the repository.

- [ ] **Step 5.1: Inspect MEMORY.md**

Read `~/.claude/projects/-Users-kevinkroon-Projects-gcscode/memory/MEMORY.md`. Identify entries whose title, link target, or one-line hook contains "plugin."

The known entry to update:

- `[gcscode plugin architecture phase plan](project_plugin_phases.md)` — both the title and the file link contain "plugin." Other entries (user role, VS Code alignment feedback, small iterations, SITL listener, capture roadmap ideas) do not contain "plugin" in their visible link/title and need no change unless their underlying file body references "plugin."

- [ ] **Step 5.2: Rename the memory file (if applicable)**

If `project_plugin_phases.md` exists, rename it to `project_extension_phases.md`:

```bash
mv ~/.claude/projects/-Users-kevinkroon-Projects-gcscode/memory/project_plugin_phases.md \
   ~/.claude/projects/-Users-kevinkroon-Projects-gcscode/memory/project_extension_phases.md
```

(Adjust the filename if MEMORY.md uses a different one.)

- [ ] **Step 5.3: Update the renamed file's frontmatter and body**

Open the renamed file. Update:

- The `name:` frontmatter field (e.g. "gcscode plugin architecture phase plan" → "gcscode extension architecture phase plan").
- The `description:` frontmatter field if it mentions "plugin."
- The body: every "plugin" → "extension" where the term refers to the gcscode extensibility unit. Leave references to "plugin architecture" intact only if it's a description of an external system (none in this file).

Also: the body likely cites ADR-0003. If the citation says "plugin API," update to "extension API."

- [ ] **Step 5.4: Update MEMORY.md index pointer**

Edit `MEMORY.md`:

- Title and link in the bullet `- [gcscode plugin architecture phase plan](project_plugin_phases.md)` → `- [gcscode extension architecture phase plan](project_extension_phases.md)`.
- The trailing one-line hook: rewrite to use "extension" if it contained "plugin" (e.g. "A (second contribution kind) → B (lifecycle/cleanup) → C (cross-cutting capabilities)" doesn't mention plugin and is fine).

- [ ] **Step 5.5: Verify other memory files don't reference plugin**

Run:

```bash
grep -l -i "plugin" ~/.claude/projects/-Users-kevinkroon-Projects-gcscode/memory/*.md
```

For each file the grep prints, open it and decide whether the reference is intentional (e.g. mentions an external "plugin" system) or stale (refers to gcscode's own extensibility unit). Update stale references in place; rename files if the filename contains "plugin."

After this step, the only memory files containing "plugin" should be those that mention it in a clearly-external context. There should be no memory entry that calls our own gcscode extensibility unit a "plugin."

---

## Task 6: Merge feat branch to master with `--no-ff`

- [ ] **Step 6.1: Verify feat branch is in expected state**

Run:

```bash
git log --oneline -5
```

Expected (from HEAD downward): living-doc commit, mechanical-rename commit, pointer-notes commit, plan commit (master), spec commit (master), ...

- [ ] **Step 6.2: Switch to master**

Run:

```bash
git checkout master && git pull --ff-only
```

Expected: switches to master; if there are no upstream divergences (the repo has none currently), pull is a no-op or fast-forwards trivially.

- [ ] **Step 6.3: Merge with `--no-ff`**

```bash
git merge --no-ff feat/rename-plugin-to-extension -m "Merge branch 'feat/rename-plugin-to-extension'"
```

Expected: merge commit created. `git log --oneline -1` shows `Merge branch 'feat/rename-plugin-to-extension'` at HEAD.

- [ ] **Step 6.4: Final verification on master**

Run:

```bash
pnpm install
pnpm check
pnpm test
pnpm lint
```

Expected: all clean. The example extension's tests pass under the new vocabulary; the shell tests pass under the new module paths and helper names.

- [ ] **Step 6.5: Optional — delete the feat branch**

If you're confident in the merge and don't need the branch reference:

```bash
git branch -d feat/rename-plugin-to-extension
```

(Use `-D` only if `-d` complains about the branch not being merged, which would indicate the merge didn't actually happen — investigate before forcing.)

---

## Self-review checklist (post-implementation)

After all six tasks complete, run these final cross-checks:

- [ ] **Spec coverage:** Open `docs/specs/2026-04-27-rename-plugin-to-extension.md` and confirm every Goals bullet is satisfied:
  - Code-level renames consistent? ✓ (Steps 3b–3e)
  - Packages renamed and ESLint boundary updated? ✓ (Steps 3a, 3c.1, 3f.2)
  - `pnpm-lock.yaml` regenerated? ✓ (Step 3g.1)
  - Living docs rewritten in place? ✓ (Task 4)
  - Historical docs receive pointer-notes only, filenames unchanged? ✓ (Task 2)
  - ADR-0004 added? ✓ (pre-flight, on master before this branch)
  - All validation commands pass? ✓ (Steps 3g.2–3g.4, 4.7–4.8, 6.4)

- [ ] **Pointer-note count:** 15 historical docs received the pointer-note (3 ADRs + 6 specs + 6 plans). The rename ADR-0004, the rename spec, and the rename plan did NOT receive pointer-notes (intentional — they ARE the rename, not predating it).

- [ ] **No stragglers:** The Step 4.9 grep returns only intentional remaining "plugin" references.

- [ ] **Memory consistency:** Memory files no longer call gcscode's extensibility unit a "plugin."

If any check fails, fix it before considering the iteration complete.

---

## Cross-cutting reminders

**Use `git mv` for directory and file renames.** This preserves blame across the rename. A plain edit + delete loses history.

**Atomic mechanical commit.** Task 3 is one commit. Don't split it — partial states won't compile.

**No mixing.** Don't sneak any other refactor (e.g. namespacing, the `makeRegistrar<T>` factory mentioned in B2a's cross-cutting notes, or B2b enable/disable work) into this iteration. The rename is the only change.

**Svelte autofixer for `app.svelte`.** When Svelte source files change, run the `svelte-autofixer` MCP tool on them and address any issues it surfaces before continuing.
