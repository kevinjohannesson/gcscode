# Command Palette + `window.showQuickPick` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Phase C2 — a generic `host.window.showQuickPick<T>(items, options): Promise<T | undefined>` API plus a built-in command palette (`Ctrl+Shift+P`) that lists registered commands. Add a modal-pause hook to the keybinding dispatcher so the palette is safe.

**Architecture:** Two-layer. The `showQuickPick` API surface lives on the existing `host.window` namespace and is implemented in the registry by delegating to a singleton `quickPickState` class wrapper. A built-in `workbench` extension registers `workbench.action.showCommands` + `Ctrl+Shift+P` and uses `showQuickPick` internally. A `QuickPickHost` Svelte component mounted in the shell root reads `quickPickState.current` and renders the floating panel; it also toggles a `modalState.active` flag the dispatcher reads to pause keybinding matching while the palette is open.

**Tech stack:** Svelte 5 (`$state` rune in `.svelte.ts` class wrappers), Tailwind 4 utilities (already wired in `vite.config.ts`), Vitest + jsdom + `@testing-library/svelte` (already configured), `fuse.js` (new dependency).

**Spec:** `docs/specs/2026-05-02-command-palette.md` (commit `87148be`). All decisions, rationale, and out-of-scope items are there. This plan implements that spec.

---

## Branch + worktree setup (controller does this once before Task 1)

The controller dispatches subagents into a feature worktree. Per CLAUDE.md "Subagent worktree discipline":

1. Create branch `feat/command-palette` off `master` and a worktree at `.worktrees/feat-command-palette/`.
2. **Every subagent prompt must include:** "Working directory is `.worktrees/feat-command-palette/`. Prepend `cd .worktrees/feat-command-palette/shell &&` to every Bash call. Before every `git commit`, chain `git branch --show-current` and verify it reads `feat/command-palette` — if it reads `master`, STOP, the cwd reset took effect."
3. Final merge to master uses `git merge --no-ff feat/command-palette` per CLAUDE.md.

## Class style reminder (every implementer subagent must read this)

`.svelte.ts` modules that own reactive state use class wrappers in **C# style**:
- Explicit `private` / `public` keywords on every member
- `private _backingField` underscore convention (NOT `#field` syntax)
- Backing field holds `$state(...)`; getter/setter wraps it
- `export const singletonName = new ClassName();` at the bottom

Memory: `feedback_svelte_class_wrappers.md`. Components stay thin renderers; logic lives in classes.

## Boundary rule (do not violate)

`packages/extension-api` is the ONLY runtime import path for any extension package. Shell-internal code (in `packages/shell/src/`) can import freely from `@gcscode/extension-api` and from sibling shell modules. Extension packages must never `import { X } from '@gcscode/shell'`. The built-in `workbench` extension lives inside `packages/shell/` and is shell-internal — but it MUST consume only the public `ExtensionContext` / `ExtensionHost` API to keep its eats-own-dog-food integrity. ESLint enforces.

## File structure (decomposition decisions)

| File | Responsibility | Status |
|---|---|---|
| `packages/extension-api/src/index.ts` | Add `title?` + `category?` to `CommandContribution`. Add `QuickPickItem`, `QuickPickOptions`. Add `showQuickPick` to `WindowNamespace`. | Modify |
| `packages/shell/src/extension-host/registry.ts` | Implement `host.window.showQuickPick` by delegating to `quickPickState.open`. | Modify |
| `packages/shell/src/modal-state.svelte.ts` | Singleton `modalState` class wrapping a single `_active` boolean. | Create |
| `packages/shell/src/keybinding-dispatcher.ts` | Read `modalState.active` at top of keydown handler; early-return when `true`. | Modify |
| `packages/shell/src/quick-pick/quick-pick-state.svelte.ts` | Singleton `quickPickState` class wrapping the open request + lifecycle (`open` / `pick` / `dismiss`). | Create |
| `packages/shell/src/quick-pick/quick-pick.svelte` | Floating panel component: input, fuse-filtered list with match highlighting, keyboard nav, click-to-pick. | Create |
| `packages/shell/src/quick-pick/quick-pick-host.svelte` | Single-instance host component: reads `quickPickState.current`, renders `<QuickPick>`, toggles `modalState.active`, handles click-outside-to-dismiss. | Create |
| `packages/shell/src/built-in/workbench/index.ts` | Built-in `workbench` extension exporting an `Extension` that registers `workbench.action.showCommands` + `Ctrl+Shift+P`. | Create |
| `packages/shell/src/main.ts` | Register the built-in `workbench` extension before the `bundledExtensions` loop. | Modify |
| `packages/shell/src/app.svelte` | Mount `<QuickPickHost />` once in the root layout. | Modify |
| `packages/shell/package.json` | Add `fuse.js` dependency. | Modify |
| Tests | Co-located `*.test.ts` per CLAUDE.md convention. | Create |

---

## Task 1: Extension API additions + stub `showQuickPick`

**Files:**
- Modify: `packages/extension-api/src/index.ts`
- Modify: `packages/shell/src/extension-host/registry.ts` (add stub implementation so `pnpm check` passes)
- Test: existing `packages/shell/src/extension-host/registry.test.ts` gets one new test for the stub

**Why:** Adding `showQuickPick` to the `WindowNamespace` type without an implementation in the registry breaks `pnpm check`. The stub honors the in-progress-stub pattern (memory: `feedback_in_progress_stubs.md`) — types declare the surface; runtime throws until Task 5 wires it for real.

- [ ] **Step 1: Read existing extension-api types and shell registry**

```bash
cd .worktrees/feat-command-palette/shell && \
cat packages/extension-api/src/index.ts | head -120
```

Note the existing `CommandContribution` interface, `WindowNamespace`, and how `ExtensionHost` composes the namespaces.

- [ ] **Step 2: Add `title?` + `category?` to `CommandContribution`**

In `packages/extension-api/src/index.ts`, locate the existing interface:

```ts
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
}
```

Replace with:

```ts
/**
 * A command contribution registers a callable handler under a stable string
 * id. Commands are the integration backbone for kinds that reference commands
 * by id rather than carrying their own handlers (keybindings today; menu
 * items and palette entries to come). Cross-extension execute is intentional —
 * any extension can fire any registered command.
 *
 * Optional `title` and `category` are the user-facing metadata used by the
 * command palette. Commands without `title` are still callable via
 * `executeCommand` and via keybindings, but do not appear in the palette.
 */
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
  title?: string;
  category?: string;
}
```

- [ ] **Step 3: Add `QuickPickItem` and `QuickPickOptions` interfaces**

Append to `packages/extension-api/src/index.ts` after the `KeybindingContribution` block (or wherever interfaces are grouped):

```ts
/**
 * One row in a quick pick list. Extra fields beyond `label` (when the caller
 * passes a `T extends QuickPickItem` with extra fields) are preserved on the
 * resolved value so callers can dispatch on them.
 *
 * `description` and `detail` are typed but not searched in v1 (matches VS
 * Code defaults of `matchOnDescription: false` / `matchOnDetail: false`).
 */
export interface QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
}

/**
 * Options that customize the quick pick presentation. Both fields are
 * advisory — the host is free to render them or ignore them.
 */
export interface QuickPickOptions {
  placeholder?: string;
  title?: string;
}
```

- [ ] **Step 4: Add `showQuickPick` to `WindowNamespace`**

Locate the `WindowNamespace` interface (or whatever holds `registerView` / `registerStatusBarItem`). Add:

```ts
showQuickPick<T extends QuickPickItem>(
  items: T[],
  options?: QuickPickOptions,
): Promise<T | undefined>;
```

Add a docstring above the method:

```ts
/**
 * Present a filterable picker of `items` to the user. Resolves with the
 * picked item on selection (Enter / click), or `undefined` if the user
 * dismisses (Escape / click outside). Generic over `T` so extra fields on
 * the items survive the round trip.
 *
 * Calling while another quick pick is already open rejects with
 * `Error('Quick pick already open')`. No queueing in v1.
 */
showQuickPick<T extends QuickPickItem>(
  items: T[],
  options?: QuickPickOptions,
): Promise<T | undefined>;
```

- [ ] **Step 5: Add stub implementation to registry's `window` namespace**

In `packages/shell/src/extension-host/registry.ts`, find the `window:` block inside `createHost`. After `registerStatusBarItem`, add:

```ts
showQuickPick<T extends import('@gcscode/extension-api').QuickPickItem>(
  _items: T[],
  _options?: import('@gcscode/extension-api').QuickPickOptions,
): Promise<T | undefined> {
  return Promise.reject(
    new Error('host.window.showQuickPick is not yet implemented (stub)'),
  );
},
```

(If `QuickPickItem` and `QuickPickOptions` are already imported at the top of the file, use those names directly instead of inline `import('...').X`.)

- [ ] **Step 6: Write failing test for the stub behavior**

In `packages/shell/src/extension-host/registry.test.ts`, append (still inside the `describe('createRegistry')` block):

```ts
it('rejects host.window.showQuickPick with a stub-not-implemented error', async () => {
  const registry = createRegistry();
  let host: ExtensionHost | undefined;
  registry.activate(
    extension('ext.a', (ctx) => {
      host = ctx.host;
    }),
  );
  await expect(host!.window.showQuickPick([{ label: 'x' }])).rejects.toThrow(
    /not yet implemented/,
  );
});
```

- [ ] **Step 7: Run tests + check; verify the stub test passes and nothing else broke**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run
```

Expected: all tests pass, including the new one.

```bash
cd .worktrees/feat-command-palette/shell && pnpm check
```

Expected: zero type errors. The new types compile; the registry stub satisfies the new method on `WindowNamespace`.

- [ ] **Step 8: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/extension-api/src/index.ts packages/shell/src/extension-host/registry.ts packages/shell/src/extension-host/registry.test.ts && \
git commit -m "$(cat <<'EOF'
feat(extension-api): add CommandContribution title/category + QuickPick types

Adds optional title?/category? to CommandContribution (non-breaking) and the
new QuickPickItem / QuickPickOptions interfaces. Adds host.window.showQuickPick
to the WindowNamespace surface. Registry implements it as an in-progress stub
that rejects with "not yet implemented" — Task 5 will wire the real impl.

Spec: docs/specs/2026-05-02-command-palette.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

`git branch --show-current` MUST print `feat/command-palette` before the commit. If it prints `master`, the cwd reset took effect — `cd` to the worktree and retry.

---

## Task 2: `ModalState` class

**Files:**
- Create: `packages/shell/src/modal-state.svelte.ts`
- Create: `packages/shell/src/modal-state.test.ts`

**Why:** A single shared signal the keybinding dispatcher reads to pause matching, and that overlay components write when they open/close. Singleton class wrapper per the project class style.

- [ ] **Step 1: Write failing test**

Create `packages/shell/src/modal-state.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';

import { modalState } from './modal-state.svelte';

describe('modalState', () => {
  afterEach(() => {
    // Reset shared singleton between tests so they don't pollute each other.
    modalState.active = false;
  });

  it('is inactive by default', () => {
    expect(modalState.active).toBe(false);
  });

  it('reflects writes through the public setter', () => {
    modalState.active = true;
    expect(modalState.active).toBe(true);
    modalState.active = false;
    expect(modalState.active).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run packages/shell/src/modal-state.test.ts
```

Expected: FAIL — `Cannot find module './modal-state.svelte'`.

- [ ] **Step 3: Create the class**

Create `packages/shell/src/modal-state.svelte.ts`:

```ts
/**
 * Tracks whether a modal-style overlay (currently: any quick pick) is open.
 * The keybinding dispatcher reads `active` and early-returns while it is
 * true, so the open overlay's own keyboard handling (Enter, Esc, ArrowUp /
 * ArrowDown, Ctrl+Shift+P) is not double-fired by the dispatcher.
 *
 * Modal stacking is not supported in v1 — at most one overlay sets this to
 * true at a time. The first overlap is caught by quickPickState's
 * "Quick pick already open" guard.
 */
class ModalState {
  private _active = $state(false);

  public get active(): boolean {
    return this._active;
  }
  public set active(value: boolean) {
    this._active = value;
  }
}

export const modalState = new ModalState();
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run packages/shell/src/modal-state.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Run full suite + check + lint**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run && pnpm check && pnpm lint
```

Expected: all pass. (No other code touches `modal-state` yet.)

- [ ] **Step 6: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/shell/src/modal-state.svelte.ts packages/shell/src/modal-state.test.ts && \
git commit -m "$(cat <<'EOF'
feat(shell): modalState class wrapper for overlay/dispatcher coordination

Singleton class wrapping a single boolean `_active` signal. The keybinding
dispatcher will read this in Task 3; overlay components (quick-pick host)
will write it in Task 7.

Class style follows project convention: explicit private/public, _backingField
underscore convention, $state in private field (memory:
feedback_svelte_class_wrappers.md).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify branch before committing.

---

## Task 3: Modal-pause hook in `keybinding-dispatcher`

**Files:**
- Modify: `packages/shell/src/keybinding-dispatcher.ts`
- Modify: `packages/shell/src/keybinding-dispatcher.test.ts`

**Why:** Without this, pressing `Ctrl+Shift+P` while the palette is open re-fires `workbench.action.showCommands` (Task 8), and any extension-bound `Esc` would fire when the user dismisses the palette.

- [ ] **Step 1: Read the existing dispatcher to find the keydown handler**

```bash
cd .worktrees/feat-command-palette/shell && \
grep -n "addEventListener\|keydown\|attachKeybinding" packages/shell/src/keybinding-dispatcher.ts
```

Locate the function `attachKeybindingDispatcher` and the `handler` (or equivalent) that calls `target.addEventListener('keydown', handler)`. The handler is where the early-return goes.

- [ ] **Step 2: Write failing test**

Append to `packages/shell/src/keybinding-dispatcher.test.ts`, in a new `describe('modal-pause hook', ...)` block at the end of the file:

```ts
describe('modal-pause hook', () => {
  afterEach(() => {
    modalState.active = false;
  });

  it('does not fire a matching command when modalState.active is true', () => {
    const registry = createRegistry();
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.keybindings.registerKeybinding({
          key: 'Ctrl+Shift+G',
          command: 'ext.a.cmd',
        });
      }),
    );
    const target = new EventTarget();
    attachKeybindingDispatcher(registry, target);

    modalState.active = true;
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        code: 'KeyG',
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('resumes firing when modalState.active flips back to false', () => {
    const registry = createRegistry();
    const run = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
        ctx.host.keybindings.registerKeybinding({
          key: 'Ctrl+Shift+G',
          command: 'ext.a.cmd',
        });
      }),
    );
    const target = new EventTarget();
    attachKeybindingDispatcher(registry, target);

    modalState.active = true;
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        code: 'KeyG',
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(run).not.toHaveBeenCalled();

    modalState.active = false;
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'g',
        code: 'KeyG',
        ctrlKey: true,
        shiftKey: true,
      }),
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
```

Add the import for `modalState` at the top of the test file (with the other imports):

```ts
import { modalState } from './modal-state.svelte';
```

Add `afterEach` to the existing vitest import (e.g. `import { afterEach, describe, expect, it, vi } from 'vitest';`).

- [ ] **Step 3: Run the new tests; verify both fail**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/keybinding-dispatcher.test.ts -t "modal-pause hook"
```

Expected: FAIL — `run` got called even though `modalState.active === true`.

- [ ] **Step 4: Add the early-return in the dispatcher**

In `packages/shell/src/keybinding-dispatcher.ts`:

Add at the top with other imports:

```ts
import { modalState } from './modal-state.svelte';
```

In the `attachKeybindingDispatcher` function, find the `handler` that listens for `keydown`. At the very top of the handler body, before any matching logic:

```ts
function handler(event: Event) {
  if (modalState.active) return;
  // ... existing matching logic
}
```

(Keep the existing matching logic intact — only the guard line is new.)

- [ ] **Step 5: Run modal-pause tests, verify they pass**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/keybinding-dispatcher.test.ts -t "modal-pause hook"
```

Expected: 2 tests pass.

- [ ] **Step 6: Run full keybinding-dispatcher tests + check + lint**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/keybinding-dispatcher.test.ts && \
pnpm check && pnpm lint
```

Expected: all dispatcher tests pass (existing + 2 new). No type or lint errors.

- [ ] **Step 7: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/shell/src/keybinding-dispatcher.ts packages/shell/src/keybinding-dispatcher.test.ts && \
git commit -m "$(cat <<'EOF'
feat(shell): keybinding dispatcher honors modalState pause flag

Dispatcher reads modalState.active at the top of its keydown handler and
early-returns while true. Required by the upcoming command palette
(Task 7+) — re-pressing Ctrl+Shift+P while open or pressing Esc to dismiss
must not re-fire bound commands.

This narrowly addresses the focus-aware-suppression trigger met by the
palette itself; broader cases (text-input introspection, when-clauses,
modal stacking) remain deferred per docs/out-of-scope.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `QuickPickState` class

**Files:**
- Create: `packages/shell/src/quick-pick/quick-pick-state.svelte.ts`
- Create: `packages/shell/src/quick-pick/quick-pick-state.test.ts`

**Why:** Owns the open quick-pick lifecycle: which request is in flight, the resolve callback, the "already open" guard, and the pick/dismiss verbs that resolve and clear in one step.

- [ ] **Step 1: Make the directory**

```bash
cd .worktrees/feat-command-palette/shell && \
mkdir -p packages/shell/src/quick-pick
```

- [ ] **Step 2: Write failing test**

Create `packages/shell/src/quick-pick/quick-pick-state.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { QuickPickItem } from '@gcscode/extension-api';

import { quickPickState } from './quick-pick-state.svelte';

describe('quickPickState', () => {
  afterEach(() => {
    // Drain any in-flight request so tests don't leak state.
    quickPickState.dismiss();
  });

  it('is empty by default', () => {
    expect(quickPickState.current).toBeNull();
  });

  it('open() with no current request stores the request', () => {
    const resolve = vi.fn();
    quickPickState.open({
      items: [{ label: 'a' }],
      options: undefined,
      resolve,
    });
    expect(quickPickState.current).not.toBeNull();
    expect(quickPickState.current?.items).toEqual([{ label: 'a' }]);
  });

  it('open() while already open throws "Quick pick already open"', () => {
    quickPickState.open({
      items: [{ label: 'a' }],
      options: undefined,
      resolve: vi.fn(),
    });
    expect(() =>
      quickPickState.open({
        items: [{ label: 'b' }],
        options: undefined,
        resolve: vi.fn(),
      }),
    ).toThrow('Quick pick already open');
  });

  it('pick(item) resolves the open promise with the item and clears current', () => {
    const resolve = vi.fn();
    const item: QuickPickItem = { label: 'chosen' };
    quickPickState.open({ items: [item], options: undefined, resolve });
    quickPickState.pick(item);
    expect(resolve).toHaveBeenCalledWith(item);
    expect(quickPickState.current).toBeNull();
  });

  it('dismiss() resolves the open promise with undefined and clears current', () => {
    const resolve = vi.fn();
    quickPickState.open({
      items: [{ label: 'a' }],
      options: undefined,
      resolve,
    });
    quickPickState.dismiss();
    expect(resolve).toHaveBeenCalledWith(undefined);
    expect(quickPickState.current).toBeNull();
  });

  it('pick() and dismiss() are no-ops when nothing is open', () => {
    expect(() => quickPickState.pick({ label: 'x' })).not.toThrow();
    expect(() => quickPickState.dismiss()).not.toThrow();
    expect(quickPickState.current).toBeNull();
  });
});
```

- [ ] **Step 3: Run test, verify it fails**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/quick-pick/quick-pick-state.test.ts
```

Expected: FAIL — `Cannot find module './quick-pick-state.svelte'`.

- [ ] **Step 4: Create the class**

Create `packages/shell/src/quick-pick/quick-pick-state.svelte.ts`:

```ts
import type { QuickPickItem, QuickPickOptions } from '@gcscode/extension-api';

/**
 * The in-flight quick-pick request. The host component renders against this;
 * the resolve callback completes the promise that `host.window.showQuickPick`
 * returned to the caller.
 */
export interface QuickPickRequest<T extends QuickPickItem = QuickPickItem> {
  items: T[];
  options: QuickPickOptions | undefined;
  resolve: (value: T | undefined) => void;
}

/**
 * Owns the lifecycle of an open quick pick. At most one quick pick is open
 * at a time — the second concurrent open throws `Quick pick already open`.
 *
 * `pick(item)` resolves the open request with `item` and clears state.
 * `dismiss()` resolves with `undefined` and clears state. Both are no-ops
 * when nothing is open, making them safe to call from event handlers that
 * might race with each other (e.g. Esc + click-outside firing in close
 * succession).
 */
class QuickPickState {
  private _current = $state<QuickPickRequest | null>(null);

  public get current(): QuickPickRequest | null {
    return this._current;
  }

  public open<T extends QuickPickItem>(request: QuickPickRequest<T>): void {
    if (this._current !== null) {
      throw new Error('Quick pick already open');
    }
    this._current = request as QuickPickRequest;
  }

  public pick(item: QuickPickItem): void {
    if (this._current === null) return;
    this._current.resolve(item);
    this._current = null;
  }

  public dismiss(): void {
    if (this._current === null) return;
    this._current.resolve(undefined);
    this._current = null;
  }
}

export const quickPickState = new QuickPickState();
```

- [ ] **Step 5: Run test, verify it passes**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/quick-pick/quick-pick-state.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 6: Run full suite + check + lint**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run && pnpm check && pnpm lint
```

- [ ] **Step 7: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/shell/src/quick-pick/quick-pick-state.svelte.ts packages/shell/src/quick-pick/quick-pick-state.test.ts && \
git commit -m "$(cat <<'EOF'
feat(shell): quickPickState class — open/pick/dismiss lifecycle

Singleton class owning the in-flight quick-pick request. Open guards against
concurrent requests with "Quick pick already open"; pick/dismiss resolve the
open promise and clear state in one step; both pick and dismiss are no-ops
when nothing is open (safe under Esc + click-outside racing).

Class style per feedback_svelte_class_wrappers.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Replace `showQuickPick` stub with real implementation

**Files:**
- Modify: `packages/shell/src/extension-host/registry.ts`
- Modify: `packages/shell/src/extension-host/registry.test.ts`

**Why:** Now that `quickPickState` exists (Task 4), the registry's `showQuickPick` can create a Promise, store its `resolve` in a request, hand the request to `quickPickState.open`, and return the promise.

- [ ] **Step 1: Write failing test**

In `packages/shell/src/extension-host/registry.test.ts`, REPLACE the stub-rejection test from Task 1 with a new `describe('host.window.showQuickPick', ...)` block:

```ts
describe('host.window.showQuickPick', () => {
  afterEach(() => {
    quickPickState.dismiss();
  });

  it('hands the request to quickPickState and returns a promise', () => {
    const registry = createRegistry();
    let host: ExtensionHost | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        host = ctx.host;
      }),
    );
    const promise = host!.window.showQuickPick([{ label: 'a' }]);
    expect(promise).toBeInstanceOf(Promise);
    expect(quickPickState.current).not.toBeNull();
    expect(quickPickState.current?.items).toEqual([{ label: 'a' }]);
  });

  it('resolves with the picked item when quickPickState.pick fires', async () => {
    const registry = createRegistry();
    let host: ExtensionHost | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        host = ctx.host;
      }),
    );
    const item = { label: 'chosen' };
    const promise = host!.window.showQuickPick([item, { label: 'other' }]);
    quickPickState.pick(item);
    await expect(promise).resolves.toEqual(item);
  });

  it('resolves with undefined when quickPickState.dismiss fires', async () => {
    const registry = createRegistry();
    let host: ExtensionHost | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        host = ctx.host;
      }),
    );
    const promise = host!.window.showQuickPick([{ label: 'a' }]);
    quickPickState.dismiss();
    await expect(promise).resolves.toBeUndefined();
  });

  it('rejects if a quick pick is already open', async () => {
    const registry = createRegistry();
    let host: ExtensionHost | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        host = ctx.host;
      }),
    );
    void host!.window.showQuickPick([{ label: 'first' }]);
    await expect(host!.window.showQuickPick([{ label: 'second' }])).rejects.toThrow(
      'Quick pick already open',
    );
  });
});
```

Add the imports near the top of the file (combining with what's already there):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { quickPickState } from '../quick-pick/quick-pick-state.svelte';
```

DELETE the older stub-rejection test from Task 1 (the one matching `/not yet implemented/`).

- [ ] **Step 2: Run new tests, verify they fail**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/extension-host/registry.test.ts -t "host.window.showQuickPick"
```

Expected: FAIL — the stub still rejects with "not yet implemented".

- [ ] **Step 3: Replace the stub with the real implementation**

In `packages/shell/src/extension-host/registry.ts`:

Add at the top with other imports:

```ts
import { quickPickState } from '../quick-pick/quick-pick-state.svelte';
```

Find the stub `showQuickPick` block from Task 1 inside the `window:` namespace and replace with:

```ts
showQuickPick<T extends QuickPickItem>(
  items: T[],
  options?: QuickPickOptions,
): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve) => {
    quickPickState.open<T>({ items, options, resolve });
  });
},
```

If `QuickPickItem` and `QuickPickOptions` aren't yet in the top-of-file `import type` block from `@gcscode/extension-api`, add them.

- [ ] **Step 4: Run new tests, verify they pass**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/extension-host/registry.test.ts -t "host.window.showQuickPick"
```

Expected: 4 tests pass.

- [ ] **Step 5: Run full suite + check + lint**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run && pnpm check && pnpm lint
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/shell/src/extension-host/registry.ts packages/shell/src/extension-host/registry.test.ts && \
git commit -m "$(cat <<'EOF'
feat(shell): wire host.window.showQuickPick to quickPickState

Replaces the in-progress stub from Task 1 with the real implementation —
creates a Promise, stores its resolve in a QuickPickRequest, delegates to
quickPickState.open. The host component (Task 7) will trigger pick/dismiss
which resolves the promise and clears state.

Concurrent open rejects with "Quick pick already open" (no queueing in v1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `QuickPick` component (the floating panel)

**Files:**
- Create: `packages/shell/src/quick-pick/quick-pick.svelte`
- Create: `packages/shell/src/quick-pick/quick-pick.test.ts`
- Modify: `packages/shell/package.json` (add `fuse.js`)

**Why:** The pure presentational component. Receives an items array + options via props, owns its own input state, runs Fuse over items by `label`, renders the filtered list with match highlighting, captures keyboard nav, calls `pick(item)` on selection and `dismiss()` on Esc.

- [ ] **Step 1: Add `fuse.js` dependency**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm --filter @gcscode/shell add fuse.js
```

Verify `packages/shell/package.json` `dependencies` block now contains `"fuse.js": "^7.x"` (whatever pnpm resolved).

- [ ] **Step 2: Write failing test**

Create `packages/shell/src/quick-pick/quick-pick.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { quickPickState } from './quick-pick-state.svelte';
import QuickPick from './quick-pick.svelte';

function openWithItems(
  items: { label: string }[],
  resolve: (v: { label: string } | undefined) => void = () => {},
) {
  quickPickState.open({ items, options: undefined, resolve });
}

describe('quick-pick.svelte', () => {
  afterEach(() => {
    quickPickState.dismiss();
  });

  it('renders all items when the input is empty', () => {
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }]);
    render(QuickPick);
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.getByText('Cherry')).toBeInTheDocument();
  });

  it('filters items as the user types', async () => {
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }]);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'ban' } });
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
  });

  it('shows the empty state when nothing matches', async () => {
    openWithItems([{ label: 'Apple' }]);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'zzzz' } });
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('Enter resolves the open promise with the highlighted item', async () => {
    const resolve = vi.fn();
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }], resolve);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    // First item is highlighted by default; Enter picks it.
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(resolve).toHaveBeenCalledWith({ label: 'Apple' });
  });

  it('Escape resolves the open promise with undefined', async () => {
    const resolve = vi.fn();
    openWithItems([{ label: 'Apple' }], resolve);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'Escape' });
    expect(resolve).toHaveBeenCalledWith(undefined);
  });

  it('ArrowDown then Enter picks the next item', async () => {
    const resolve = vi.fn();
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }, { label: 'Cherry' }], resolve);
    render(QuickPick);
    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    await fireEvent.keyDown(input, { key: 'Enter' });
    expect(resolve).toHaveBeenCalledWith({ label: 'Banana' });
  });

  it('clicking a row resolves the open promise with that row', async () => {
    const resolve = vi.fn();
    openWithItems([{ label: 'Apple' }, { label: 'Banana' }], resolve);
    render(QuickPick);
    await fireEvent.click(screen.getByText('Banana'));
    expect(resolve).toHaveBeenCalledWith({ label: 'Banana' });
  });

  it('uses the custom placeholder from options when provided', () => {
    quickPickState.open({
      items: [{ label: 'a' }],
      options: { placeholder: 'Custom placeholder text' },
      resolve: () => {},
    });
    render(QuickPick);
    expect(screen.getByPlaceholderText('Custom placeholder text')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/quick-pick/quick-pick.test.ts
```

Expected: FAIL — `Cannot find module './quick-pick.svelte'`.

- [ ] **Step 4: Create the component**

Create `packages/shell/src/quick-pick/quick-pick.svelte`:

```svelte
<script lang="ts">
  import Fuse from 'fuse.js';
  import { quickPickState } from './quick-pick-state.svelte';

  let query = $state('');
  let highlightIndex = $state(0);

  // The current request — non-null when this component is mounted (the host
  // only mounts us when quickPickState.current !== null).
  const request = $derived(quickPickState.current!);

  const fuse = $derived(
    new Fuse(request.items, {
      keys: ['label'],
      includeMatches: true,
      threshold: 0.4,
      ignoreLocation: true,
    }),
  );

  // Filtered + sorted items. Empty query → alphabetical by label. Non-empty
  // query → Fuse score order.
  const filtered = $derived.by(() => {
    if (query.trim() === '') {
      return [...request.items].sort((a, b) => a.label.localeCompare(b.label));
    }
    return fuse.search(query).map((r) => r.item);
  });

  // Map of item-label → array of [start, end] match ranges, for bolding.
  const matchesByLabel = $derived.by(() => {
    if (query.trim() === '') return new Map<string, readonly [number, number][]>();
    const m = new Map<string, readonly [number, number][]>();
    for (const r of fuse.search(query)) {
      const ranges = (r.matches ?? [])
        .filter((mm) => mm.key === 'label')
        .flatMap((mm) => mm.indices as readonly [number, number][]);
      m.set(r.item.label, ranges);
    }
    return m;
  });

  // Reset highlight when the filtered list changes.
  $effect(() => {
    void filtered;
    highlightIndex = 0;
  });

  function placeholder(): string {
    return request.options?.placeholder ?? 'Type a command name';
  }

  function pickIndex(i: number) {
    const item = filtered[i];
    if (item !== undefined) quickPickState.pick(item);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      pickIndex(highlightIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      quickPickState.dismiss();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      if (filtered.length > 0) {
        highlightIndex = (highlightIndex + 1) % filtered.length;
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      if (filtered.length > 0) {
        highlightIndex = (highlightIndex - 1 + filtered.length) % filtered.length;
      }
    }
  }

  function renderLabel(label: string, ranges: readonly [number, number][]) {
    if (ranges.length === 0) return [{ text: label, bold: false }];
    // Merge overlapping ranges and produce alternating bold/non-bold spans.
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [s, e] of sorted) {
      const last = merged[merged.length - 1];
      if (last !== undefined && s <= last[1] + 1) {
        last[1] = Math.max(last[1], e);
      } else {
        merged.push([s, e]);
      }
    }
    const out: { text: string; bold: boolean }[] = [];
    let cursor = 0;
    for (const [s, e] of merged) {
      if (cursor < s) out.push({ text: label.slice(cursor, s), bold: false });
      out.push({ text: label.slice(s, e + 1), bold: true });
      cursor = e + 1;
    }
    if (cursor < label.length) out.push({ text: label.slice(cursor), bold: false });
    return out;
  }
</script>

<div
  class="fixed left-1/2 top-16 z-50 w-[440px] -translate-x-1/2 overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 shadow-2xl"
  role="dialog"
  aria-label="Command palette"
>
  {#if request.options?.title}
    <div class="border-b border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400">
      {request.options.title}
    </div>
  {/if}
  <input
    type="text"
    role="textbox"
    bind:value={query}
    onkeydown={onKeyDown}
    placeholder={placeholder()}
    class="w-full border-none bg-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-400"
    autofocus
  />
  {#if filtered.length === 0}
    <div class="px-3 py-4 text-center text-sm text-neutral-400">No matching commands</div>
  {:else}
    <ul class="max-h-80 overflow-y-auto">
      {#each filtered as item, i (item.label)}
        <li>
          <button
            type="button"
            class="w-full px-3 py-1.5 text-left text-sm text-neutral-100"
            class:bg-blue-900={i === highlightIndex}
            onclick={() => pickIndex(i)}
            onmouseenter={() => (highlightIndex = i)}
          >
            {#each renderLabel(item.label, matchesByLabel.get(item.label) ?? []) as span}
              {#if span.bold}<strong class="font-bold">{span.text}</strong>{:else}{span.text}{/if}
            {/each}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

- [ ] **Step 5: Validate the Svelte source via the Svelte MCP autofixer**

```
mcp__svelte__svelte-autofixer with the contents of quick-pick.svelte
```

If issues are returned, apply the fixes and re-run until clean. Common things the autofixer catches: legacy event syntax (`on:click` vs `onclick`), `let`-vs-`$state` confusion, missing `$derived.by` for multi-statement deriveds.

- [ ] **Step 6: Run quick-pick tests, verify they pass**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/quick-pick/quick-pick.test.ts
```

Expected: 8 tests pass.

If a fuzzy-match assertion fails because Fuse's threshold is too strict for short test inputs, loosen `threshold` slightly (e.g. 0.5) — note in the commit message that the threshold was tuned against the test fixtures.

- [ ] **Step 7: Run full suite + check + lint**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run && pnpm check && pnpm lint
```

- [ ] **Step 8: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/shell/src/quick-pick/quick-pick.svelte packages/shell/src/quick-pick/quick-pick.test.ts packages/shell/package.json pnpm-lock.yaml && \
git commit -m "$(cat <<'EOF'
feat(shell): QuickPick floating panel component (Svelte + Fuse + Tailwind)

Pure presentational component reading from quickPickState. Owns input + highlight
index. Fuse.js searches the `label` field with includeMatches for bolded match
ranges. Empty query → alphabetical sort; non-empty → Fuse score order. Empty
state shows "No matching commands". Keyboard: Enter picks, Escape dismisses,
ArrowUp/Down navigates (all stopPropagation to keep them off the dispatcher).
Click on a row also picks.

Adds fuse.js dependency to packages/shell.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `QuickPickHost` component

**Files:**
- Create: `packages/shell/src/quick-pick/quick-pick-host.svelte`
- Create: `packages/shell/src/quick-pick/quick-pick-host.test.ts`

**Why:** The single-instance host that mounts `<QuickPick>` when `quickPickState.current !== null`, toggles `modalState.active` accordingly, and owns the click-outside-to-dismiss listener.

- [ ] **Step 1: Write failing test**

Create `packages/shell/src/quick-pick/quick-pick-host.test.ts`:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { modalState } from '../modal-state.svelte';
import { quickPickState } from './quick-pick-state.svelte';
import QuickPickHost from './quick-pick-host.svelte';

describe('quick-pick-host.svelte', () => {
  afterEach(() => {
    quickPickState.dismiss();
    modalState.active = false;
  });

  it('renders nothing when quickPickState.current is null', () => {
    render(QuickPickHost);
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('renders the QuickPick when a request opens, hides it when dismissed', async () => {
    render(QuickPickHost);
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve: vi.fn(),
    });
    // Allow Svelte to flush.
    await Promise.resolve();
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    quickPickState.dismiss();
    await Promise.resolve();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
  });

  it('sets modalState.active true while open and false when closed', async () => {
    render(QuickPickHost);
    expect(modalState.active).toBe(false);

    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve: vi.fn(),
    });
    await Promise.resolve();
    expect(modalState.active).toBe(true);

    quickPickState.dismiss();
    await Promise.resolve();
    expect(modalState.active).toBe(false);
  });

  it('dismisses on click outside the panel', async () => {
    const resolve = vi.fn();
    render(QuickPickHost);
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve,
    });
    await Promise.resolve();
    // Click somewhere on the document body (outside the dialog).
    await fireEvent.click(document.body);
    expect(resolve).toHaveBeenCalledWith(undefined);
    expect(quickPickState.current).toBeNull();
  });

  it('does NOT dismiss on click inside the panel', async () => {
    const resolve = vi.fn();
    render(QuickPickHost);
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve,
    });
    await Promise.resolve();
    const dialog = screen.getByRole('dialog', { name: 'Command palette' });
    await fireEvent.click(dialog);
    expect(resolve).not.toHaveBeenCalled();
    expect(quickPickState.current).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/quick-pick/quick-pick-host.test.ts
```

Expected: FAIL — `Cannot find module './quick-pick-host.svelte'`.

- [ ] **Step 3: Create the host component**

Create `packages/shell/src/quick-pick/quick-pick-host.svelte`:

```svelte
<script lang="ts">
  import { modalState } from '../modal-state.svelte';
  import QuickPick from './quick-pick.svelte';
  import { quickPickState } from './quick-pick-state.svelte';

  const open = $derived(quickPickState.current !== null);

  // Mirror open/close into the dispatcher's pause flag.
  $effect(() => {
    modalState.active = open;
  });

  // Click-outside-to-dismiss. We attach a global click listener while open;
  // if the click target is not inside the dialog, dismiss. Reattaching only
  // while open avoids paying for the listener when no quick pick is showing.
  $effect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      const dialog = document.querySelector('[role="dialog"][aria-label="Command palette"]');
      if (dialog === null) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      quickPickState.dismiss();
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  });
</script>

{#if open}
  <QuickPick />
{/if}
```

- [ ] **Step 4: Validate the Svelte source via the autofixer**

```
mcp__svelte__svelte-autofixer with the contents of quick-pick-host.svelte
```

Apply any returned fixes and re-run until clean.

- [ ] **Step 5: Run host tests, verify they pass**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/quick-pick/quick-pick-host.test.ts
```

Expected: 5 tests pass.

If the click-outside test fails because the document click listener fires before the host's `$effect` attaches it, wrap the `quickPickState.open(...)` + the awaited tick inside a small helper that ensures the effect ran. (`flushSync` from `'svelte'` may help — see how `app.test.ts` uses it.)

- [ ] **Step 6: Run full suite + check + lint**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run && pnpm check && pnpm lint
```

- [ ] **Step 7: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/shell/src/quick-pick/quick-pick-host.svelte packages/shell/src/quick-pick/quick-pick-host.test.ts && \
git commit -m "$(cat <<'EOF'
feat(shell): QuickPickHost — single-instance mount + modal-pause + click-outside

Reads quickPickState.current; mounts <QuickPick> when non-null. Mirrors open
state into modalState.active so the dispatcher pauses while the palette is up.
Attaches a global click listener while open that dismisses the palette on
clicks outside the dialog (no backdrop scrim — the underlying app stays
fully visible and clickable, per the operator-view constraint).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Built-in `workbench` extension

**Files:**
- Create: `packages/shell/src/built-in/workbench/index.ts`
- Create: `packages/shell/src/built-in/workbench/index.test.ts`

**Why:** This is the eats-own-dog-food layer — the shell's command palette is just an extension that uses `host.commands.registerCommand`, `host.keybindings.registerKeybinding`, and `host.window.showQuickPick` like any other extension would.

- [ ] **Step 1: Make the directory**

```bash
cd .worktrees/feat-command-palette/shell && \
mkdir -p packages/shell/src/built-in/workbench
```

- [ ] **Step 2: Write failing test**

Create `packages/shell/src/built-in/workbench/index.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRegistry } from '../../extension-host/registry';
import { quickPickState } from '../../quick-pick/quick-pick-state.svelte';
import { workbenchExtension } from './index';

describe('workbench built-in extension', () => {
  afterEach(() => {
    quickPickState.dismiss();
  });

  it('exports an Extension with id "workbench"', () => {
    expect(workbenchExtension.id).toBe('workbench');
    expect(workbenchExtension.displayName).toBe('Workbench');
    expect(typeof workbenchExtension.activate).toBe('function');
  });

  it('registers workbench.action.showCommands with title + category', () => {
    const registry = createRegistry();
    registry.activate(workbenchExtension);
    const cmd = registry
      .listCommands()
      .find((c) => c.id === 'workbench.action.showCommands');
    expect(cmd).toBeDefined();
    expect(cmd?.title).toBe('Show All Commands');
    expect(cmd?.category).toBe('Workbench');
  });

  it('registers Ctrl+Shift+P pointing to workbench.action.showCommands', () => {
    const registry = createRegistry();
    registry.activate(workbenchExtension);
    const kb = registry.listKeybindings().find((k) => k.key === 'Ctrl+Shift+P');
    expect(kb).toBeDefined();
    expect(kb?.command).toBe('workbench.action.showCommands');
  });

  it('opens a quick pick when workbench.action.showCommands runs', async () => {
    const registry = createRegistry();
    registry.activate(workbenchExtension);
    // Other extensions register some commands so the palette has content.
    registry.activate({
      id: 'ext.demo',
      displayName: 'Demo',
      version: '0.0.0',
      activate(ctx) {
        ctx.host.commands.registerCommand({
          id: 'ext.demo.hello',
          title: 'Say Hello',
          category: 'Demo',
          run: () => undefined,
        });
        ctx.host.commands.registerCommand({
          id: 'ext.demo.untitled',
          run: () => undefined,
        });
      },
    });

    void registry.executeCommand('workbench.action.showCommands');
    // Promise microtasks: showCommands -> showQuickPick -> quickPickState.open
    await Promise.resolve();
    await Promise.resolve();

    expect(quickPickState.current).not.toBeNull();
    const labels = quickPickState.current!.items.map((i) => i.label);
    // Includes the workbench command itself (eats own dog food) + the Demo
    // command. Excludes the title-less command.
    expect(labels).toContain('Workbench: Show All Commands');
    expect(labels).toContain('Demo: Say Hello');
    expect(labels.find((l) => l.includes('untitled'))).toBeUndefined();
  });

  it('executeCommand fires after the user picks an item', async () => {
    const registry = createRegistry();
    registry.activate(workbenchExtension);
    const helloRun = vi.fn();
    registry.activate({
      id: 'ext.demo',
      displayName: 'Demo',
      version: '0.0.0',
      activate(ctx) {
        ctx.host.commands.registerCommand({
          id: 'ext.demo.hello',
          title: 'Say Hello',
          category: 'Demo',
          run: helloRun,
        });
      },
    });

    void registry.executeCommand('workbench.action.showCommands');
    await Promise.resolve();
    await Promise.resolve();

    const helloItem = quickPickState.current!.items.find(
      (i) => i.label === 'Demo: Say Hello',
    );
    expect(helloItem).toBeDefined();
    quickPickState.pick(helloItem!);
    // Promise microtasks: pick -> resolve -> executeCommand
    await Promise.resolve();
    await Promise.resolve();
    expect(helloRun).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/built-in/workbench/index.test.ts
```

Expected: FAIL — `Cannot find module './index'`.

- [ ] **Step 4: Create the built-in extension**

Create `packages/shell/src/built-in/workbench/index.ts`:

```ts
import type { Extension, ExtensionContext, QuickPickItem } from '@gcscode/extension-api';

interface CommandPickItem extends QuickPickItem {
  commandId: string;
}

/**
 * The shell's built-in extension. Registers the command palette and its
 * default keybinding via the same public APIs any third-party extension
 * uses — the palette appears in itself ("Workbench: Show All Commands").
 */
export const workbenchExtension: Extension = {
  id: 'workbench',
  displayName: 'Workbench',
  version: '0.0.0',
  activate(context: ExtensionContext) {
    const showCommands = context.host.commands.registerCommand({
      id: 'workbench.action.showCommands',
      title: 'Show All Commands',
      category: 'Workbench',
      run: async () => {
        const items: CommandPickItem[] = context.host.commands
          // host doesn't expose listCommands; iterate via a hidden capability?
          // -- We need a way to read the live command list from the host.
          // The simplest path is a new readonly accessor on the registry side
          // surfaced through the ExtensionHost — but that crosses the
          // `extensions only contribute, never read` boundary. Instead, the
          // registry exposes `listCommands()` already, so the workbench
          // built-in (which is shell-internal) can import the registry directly
          // OR be given a registry handle at activation time.
          //
          // For a clean API, the workbench extension is constructed with a
          // factory that closes over the registry. See the boot wiring in
          // Task 9 for how main.ts builds it.
          .listAllCommands()
          .filter((c) => c.title !== undefined)
          .map((c) => ({
            label: c.category ? `${c.category}: ${c.title}` : (c.title as string),
            commandId: c.id,
          }));

        const picked = await context.host.window.showQuickPick(items, {
          placeholder: 'Type a command name',
        });
        if (picked === undefined) return;
        await context.host.commands.executeCommand(picked.commandId);
      },
    });

    const keybinding = context.host.keybindings.registerKeybinding({
      key: 'Ctrl+Shift+P',
      command: 'workbench.action.showCommands',
    });

    context.subscriptions.push(showCommands, keybinding);
  },
};
```

**HOLD — there's a design issue here.** The handler needs to read the live list of commands. `host.commands` does not currently expose `listAllCommands()` (extensions are contribution-only, not introspection). The shell built-in needs that read access.

**Resolution:** Replace the `workbenchExtension` constant with a factory function that takes a `Registry` and closes over `registry.listCommands()`. The boot wiring in Task 9 will instantiate the extension with the live registry. Replace the file with:

```ts
import type { Extension, ExtensionContext, QuickPickItem } from '@gcscode/extension-api';

import type { Registry } from '../../extension-host/registry';

interface CommandPickItem extends QuickPickItem {
  commandId: string;
}

/**
 * The shell's built-in extension. Registers the command palette and its
 * default keybinding via the same public APIs any third-party extension
 * uses — the palette appears in itself ("Workbench: Show All Commands").
 *
 * Takes a `Registry` so the palette handler can read the live command list
 * via `registry.listCommands()`. Extensions can't introspect the registry
 * through the public host (they only contribute), but the workbench is
 * shell-internal, so it gets direct access at construction time.
 */
export function createWorkbenchExtension(registry: Registry): Extension {
  return {
    id: 'workbench',
    displayName: 'Workbench',
    version: '0.0.0',
    activate(context: ExtensionContext) {
      const showCommands = context.host.commands.registerCommand({
        id: 'workbench.action.showCommands',
        title: 'Show All Commands',
        category: 'Workbench',
        run: async () => {
          const items: CommandPickItem[] = registry
            .listCommands()
            .filter((c) => c.title !== undefined)
            .map((c) => ({
              label: c.category ? `${c.category}: ${c.title}` : (c.title as string),
              commandId: c.id,
            }));

          const picked = await context.host.window.showQuickPick(items, {
            placeholder: 'Type a command name',
          });
          if (picked === undefined) return;
          await context.host.commands.executeCommand(picked.commandId);
        },
      });

      const keybinding = context.host.keybindings.registerKeybinding({
        key: 'Ctrl+Shift+P',
        command: 'workbench.action.showCommands',
      });

      context.subscriptions.push(showCommands, keybinding);
    },
  };
}
```

**Update the test file** to use the factory: replace the import and re-shape the tests to call `createWorkbenchExtension(registry)` instead of using a singleton:

```ts
import { createWorkbenchExtension } from './index';
// ...

it('exports a factory that returns an Extension with id "workbench"', () => {
  const registry = createRegistry();
  const ext = createWorkbenchExtension(registry);
  expect(ext.id).toBe('workbench');
  expect(ext.displayName).toBe('Workbench');
  expect(typeof ext.activate).toBe('function');
});

it('registers workbench.action.showCommands with title + category', () => {
  const registry = createRegistry();
  registry.activate(createWorkbenchExtension(registry));
  // ...
});
```

Apply the same `createWorkbenchExtension(registry)` substitution to all 5 tests in the file.

- [ ] **Step 5: Run tests, verify they pass**

```bash
cd .worktrees/feat-command-palette/shell && \
pnpm test --run packages/shell/src/built-in/workbench/index.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 6: Run full suite + check + lint**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run && pnpm check && pnpm lint
```

- [ ] **Step 7: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/shell/src/built-in/workbench/index.ts packages/shell/src/built-in/workbench/index.test.ts && \
git commit -m "$(cat <<'EOF'
feat(shell): built-in workbench extension — the command palette consumer

createWorkbenchExtension(registry) returns an Extension that registers
workbench.action.showCommands + Ctrl+Shift+P. Handler reads the live
command list, filters to commands with a title, composes "Category: Title"
labels, calls host.window.showQuickPick, then executeCommand on the result.

Built as a factory taking the Registry — the workbench is shell-internal
and needs to introspect commands, which the public host does not expose
to extensions (extensions only contribute, never read).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Boot wiring + integration smoke test

**Files:**
- Modify: `packages/shell/src/main.ts`
- Modify: `packages/shell/src/app.svelte`
- Modify: `packages/shell/src/app.test.ts` (add a smoke test)

**Why:** The plumbing is built; this hooks it into the running app. Workbench gets registered before bundled extensions; QuickPickHost gets mounted in the root layout.

- [ ] **Step 1: Read existing main.ts and app.svelte**

```bash
cd .worktrees/feat-command-palette/shell && \
cat packages/shell/src/main.ts && echo "---" && \
cat packages/shell/src/app.svelte
```

Note where `manager.register` is called for bundled extensions, and where the app layout markup lives.

- [ ] **Step 2: Modify `main.ts` to register the workbench built-in first**

In `packages/shell/src/main.ts`, add the import:

```ts
import { createWorkbenchExtension } from './built-in/workbench';
```

After the `manager` is constructed but BEFORE the `for (const { id, extension, ... } of bundledExtensions)` loop, add:

```ts
// Workbench is the shell's built-in extension. It registers the command
// palette + Ctrl+Shift+P. Always enabled; not tracked in persistence
// (the palette must always be available).
manager.register(createWorkbenchExtension(registry), { enabled: true });
```

- [ ] **Step 3: Mount `<QuickPickHost />` in `app.svelte`**

In `packages/shell/src/app.svelte`, add to the `<script lang="ts">` block:

```ts
import QuickPickHost from './quick-pick/quick-pick-host.svelte';
```

In the markup, add `<QuickPickHost />` once at the top level (it doesn't matter where structurally — the component uses fixed positioning). A natural spot is right before the closing tag of the root layout container:

```svelte
<QuickPickHost />
```

- [ ] **Step 4: Add a smoke test to `app.test.ts`**

In `packages/shell/src/app.test.ts`, append:

```ts
import { quickPickState } from './quick-pick/quick-pick-state.svelte';
import { modalState } from './modal-state.svelte';

describe('app.svelte — quick pick integration', () => {
  afterEach(() => {
    quickPickState.dismiss();
    modalState.active = false;
  });

  it('renders the QuickPickHost and shows the palette when state opens', async () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    quickPickState.open({
      items: [{ label: 'Apple' }],
      options: undefined,
      resolve: () => {},
    });
    await Promise.resolve();
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });
});
```

Add `afterEach` to the existing vitest import line if not already there.

- [ ] **Step 5: Run full suite + check + lint**

```bash
cd .worktrees/feat-command-palette/shell && pnpm test --run && pnpm check && pnpm lint
```

Expected: all pass.

- [ ] **Step 6: Manual smoke test in dev server**

CLAUDE.md requires: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete."

```bash
cd .worktrees/feat-command-palette/shell && pnpm dev
```

In the browser:

1. Press `Ctrl+Shift+P`. Palette opens, top-anchored, with input focused. The list shows at minimum `Workbench: Show All Commands` and any titled commands from bundled extensions (e.g. `gcscode.sitl.getLocation` if SITL added a title).
2. Type a few characters (e.g. `loc` if SITL is bundled). List filters; matched chars are bolded.
3. Press `ArrowDown`, then `Enter`. The picked command runs (check the console / app behavior).
4. Press `Ctrl+Shift+P` again to reopen. Press `Esc`. Palette closes; no command is invoked.
5. While the palette is open, try pressing any extension-bound keybinding (e.g. one your bundled extensions registered). It should NOT fire — the dispatcher is paused.
6. Open the palette; click anywhere outside it. It dismisses.
7. Visually verify: NO backdrop scrim. The underlying app remains fully visible behind the palette.

If any of those fail, debug, fix, and re-test before committing.

- [ ] **Step 7: Stop the dev server and commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add packages/shell/src/main.ts packages/shell/src/app.svelte packages/shell/src/app.test.ts && \
git commit -m "$(cat <<'EOF'
feat(shell): boot wiring — register workbench built-in + mount QuickPickHost

main.ts registers the workbench built-in extension (always enabled) before
the bundledExtensions loop. app.svelte mounts <QuickPickHost /> once in the
root layout. Adds a smoke test verifying the palette renders when
quickPickState opens.

This closes the loop end-to-end: Ctrl+Shift+P invokes
workbench.action.showCommands, which reads the live command list, calls
host.window.showQuickPick, which delegates to quickPickState, which the
QuickPickHost renders as a top-anchored panel. Manual smoke-tested in
dev server.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Docs propagation

**Files:**
- Modify: `docs/out-of-scope.md`
- Modify: `docs/vs-code-alignment.md`
- Modify: `docs/roadmap.md`

**Why:** The spec calls out exactly which docs entries change when the iteration ships. This task makes those edits and ships them on the same branch so the merge to master lands all the propagation in one shot.

- [ ] **Step 1: Update `docs/out-of-scope.md`**

Three edits:

**Edit A — remove the "Built-in / shell-registered commands" entry.** Find the line beginning with:

```
- **Built-in / shell-registered commands.** No host-side command registration today
```

Delete that entire bullet (the line and any continuation). The trigger is met by the workbench built-in.

**Edit B — narrow the "Focus-aware keybinding suppression" entry.** Find:

```
- **Focus-aware keybinding suppression.** No mechanism to disable a keybinding while a text input is focused, a modal is open, or a `when` condition is false. _Trigger to revisit:_ first text input or modal where the dispatcher's keydown interception fires a command unintentionally (e.g. typing `Ctrl+G` in a search field accidentally invokes the bound command).
```

Replace with:

```
- **Focus-aware keybinding suppression (broader).** A modal-pause hook (`modalState.active` signal; dispatcher early-returns when true) is in for the palette's needs. Remaining cases — text-input introspection in extension-rendered forms, `when`-clause-based gating, modal stacking (multiple concurrent overlays) — still deferred. _Trigger to revisit:_ first extension-rendered text input where the dispatcher's keydown interception fires a command unintentionally, or a `when`-clause use case landing.
```

**Edit C — add a new entry under "Extension machinery"** for quick-pick advanced features. Insert after the "Per-extension persistent state" bullet (or wherever fits the topical ordering):

```
- **Quick pick advanced features.** `QuickPickItem.kind` (separators / group headers), `iconPath`, `buttons`, `picked`, `alwaysShow`. `QuickPickOptions.canPickMany` (multi-select), `matchOnDescription`, `matchOnDetail`, `ignoreFocusOut`, `onDidSelectItem`. Async items (`Promise<T[]>`). `CancellationToken` parameter. Modal stacking. _Trigger to revisit:_ first consumer wants any specific field — add per-field, do not bundle.
```

- [ ] **Step 2: Update `docs/vs-code-alignment.md`**

Append the rows from the spec's "VS Code alignment" table to the cumulative ledger. Match the format used in the existing ledger (columns and section headers may differ — read the existing file first and preserve its conventions).

```bash
cd .worktrees/feat-command-palette/shell && \
cat docs/vs-code-alignment.md
```

After reading, append the C2 rows (one row per row in the spec's table). Group under a `## Phase C2 — Command palette + window.showQuickPick` header.

- [ ] **Step 3: Update `docs/roadmap.md`**

Two edits:

**Edit A — flip the C2 checkbox on.** Find:

```
- [ ] **C2+: events, settings, themes, i18n** — TBD. Each lands as a new namespace under `host.*` when a feature extension pulls on it. Re-scope per-capability when triggered.
```

Replace with:

```
- [x] **C2: Command palette + `window.showQuickPick`** — `host.window.showQuickPick<T>(items, options): Promise<T | undefined>` + built-in `workbench` extension registering `workbench.action.showCommands` + `Ctrl+Shift+P`. Spec: [`specs/2026-05-02-command-palette.md`](specs/2026-05-02-command-palette.md).
- [ ] **C3+: events, settings, themes, i18n** — TBD. Each lands as a new namespace under `host.*` when a feature extension pulls on it. Re-scope per-capability when triggered.
```

- [ ] **Step 4: Verify links and run lint**

```bash
cd .worktrees/feat-command-palette/shell && pnpm lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd .worktrees/feat-command-palette/shell && \
git branch --show-current && \
git add docs/out-of-scope.md docs/vs-code-alignment.md docs/roadmap.md && \
git commit -m "$(cat <<'EOF'
docs: C2 propagation — out-of-scope, alignment ledger, roadmap

- Remove "Built-in / shell-registered commands" deferral (trigger met by
  workbench extension).
- Narrow "Focus-aware keybinding suppression" entry: modal-pause is in;
  text-input introspection, when-clauses, modal stacking still deferred.
- Add "Quick pick advanced features" entry covering all v1-deferred
  QuickPickItem / QuickPickOptions fields, async items, CancellationToken,
  modal stacking.
- Append C2 rows to docs/vs-code-alignment.md cumulative ledger.
- Flip roadmap C2 checkbox on; rename remaining C2+ to C3+.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## After Task 10 — final cross-cutting code review

Per CLAUDE.md "Subagent-driven plan execution": after all tasks land, dispatch a final cross-cutting code review over the full branch before merging via `superpowers:finishing-a-development-branch`.

The cross-cutting review should check:

- Boundary rule preserved — no extension package (or shell built-in) reaches around `@gcscode/extension-api`. The workbench extension is allowed to import `Registry` from the shell because it is itself shell-internal, but should NOT import any sibling extension's runtime.
- Class style consistent across both `.svelte.ts` files (explicit `private` / `public`, `_backingField` underscore convention, no `#field`).
- All v1-deferred QuickPick fields/options listed in the spec's "Out-of-scope" table are NOT silently implemented anywhere.
- The keybinding dispatcher's modal-pause check is the FIRST statement in its handler (not buried after other side-effecting work).
- No backdrop-scrim element exists in the QuickPick markup — palette stays distinct via shadow + border only.
- Tests for keyboard handling (Enter, Esc, ArrowUp/Down) all use `event.stopPropagation()` paths so the dispatcher pause is verified by behavior, not just by reading the source.
- Spec compliance: every "VS Code alignment" row in the spec is reflected in the implementation (or explicitly out-of-scoped).
- `docs/vs-code-alignment.md` rows match what was actually shipped (no rows say "Aligned" for things that ended up "Partial").

Address review findings in separate `Code-review-followup:` commits on the same branch — never amend.

After the cross-cutting review and any followups, hand off to `superpowers:finishing-a-development-branch` to merge `feat/command-palette` into master with `git merge --no-ff` per CLAUDE.md.

---

## Self-review notes (for the controller)

This plan was self-reviewed at write time. Items checked:

1. **Spec coverage:** every section of the spec has a corresponding task. API additions → Task 1. Built-in extension → Task 8. UI components → Tasks 6+7. Modal-pause hook → Tasks 2+3. State classes → Tasks 2+4. `showQuickPick` impl → Task 5. Boot wiring → Task 9. Docs propagation → Task 10. VS Code alignment table appended in Task 10.
2. **Placeholder scan:** clean. No "TBD", no "TODO", no "implement appropriate X". Every step shows the exact code or command.
3. **Type consistency:** `quickPickState.open()` / `pick()` / `dismiss()` names used consistently across Tasks 4, 5, 6, 7, 8. `modalState.active` (boolean) consistent across Tasks 2, 3, 7. `createWorkbenchExtension(registry)` factory shape used consistently across Tasks 8, 9.
4. **One detected mid-stream change:** Task 8 originally proposed a singleton `workbenchExtension` const; the plan caught the registry-introspection problem and pivoted to a `createWorkbenchExtension(registry)` factory. The pivot is documented inline in Task 8's Step 4 and reflected in Task 9's wiring. Implementer subagent should follow the factory shape.
