# Phase B2b — Extension enable/disable implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `ExtensionManager` layer above the registry that owns per-extension runtime `enabled` state and retains `Extension` references for re-activation. The manager exposes three methods — `register(extension)`, `setEnabled(id, enabled)`, and `listExtensions()` — and is wired into `main.ts` in place of the current direct `registry.activate(...)` call.

**Architecture:** A new module `packages/shell/src/extension-host/extension-manager.ts` exports `createExtensionManager(registry)` (factory pattern mirroring `createRegistry`). The manager keeps an internal `SvelteMap<string, ExtensionState>` (B2a precedent) where `ExtensionState = { extension: Extension; enabled: boolean }`. `register` stores the entry then calls `registry.activate(extension)`. `setEnabled` is a no-op if the requested state matches; otherwise it calls `registry.activate(state.extension)` or `registry.deactivate(id)` then `extensions.set(id, { ...state, enabled })` so the SvelteMap mutation propagates through `$derived` consumers (mutating the value object in place would not propagate). `listExtensions()` returns `Array.from(extensions.values()).map(toRecord)` projecting `{ id, displayName, version, enabled }` — the public type does not expose the retained `Extension` reference. `main.ts` constructs the manager and calls `manager.register(exampleExtension)`; the registry surface is untouched.

**Tech Stack:** TypeScript, Svelte 5 (`svelte/reactivity`), Vitest, pnpm workspaces.

**Spec:** `docs/specs/2026-04-27-phase-b2b-extension-enable-disable.md` (commit `e82b511`)

**ADRs to be aware of:** ADR-0001 (workspace boundary — `@gcscode/extension-api` stays untouched), ADR-0002 (imperative activate API), ADR-0003 (Disposable + Phase B framing — B2b is the "extension enable/disable runtime state" item the original Phase B bundle named), ADR-0004 (plugin → extension rename — code uses `Extension`/`extension-api` throughout). No ADR is modified by this iteration; ADR-0003's Phase B retrospective bullet will be refreshed alongside the merge, mirroring the A1/A2/A3/B1/B2a precedent.

---

## File structure

| Path                                                          | Responsibility                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shell/src/extension-host/extension-manager.ts`      | **New.** Exports `createExtensionManager(registry)`, `ExtensionManager` interface, `ExtensionRecord` interface. Internal `ExtensionState` not exported. Owns the per-extension `enabled` state and the retained `Extension` references. (Task 2.)                                                                                                            |
| `packages/shell/src/extension-host/extension-manager.test.ts` | **New.** Co-located tests covering: register adds + activates; register on duplicate id throws; setEnabled false deactivates and clears contributions; setEnabled true on disabled re-activates with fresh context; same-value setEnabled is a no-op; setEnabled on unknown id throws; listExtensions returns a snapshot reflecting current state. (Task 2.) |
| `packages/shell/src/main.ts`                                  | Modify the bootstrap to construct the manager and call `manager.register(exampleExtension)` instead of `registry.activate(exampleExtension)`. The `App` mount and the keybinding dispatcher continue to receive the registry. (Task 3.)                                                                                                                      |
| `docs/out-of-scope.md`                                        | Update the trailing parenthetical of the `Extension.deactivate?()` hook bullet to drop the "extension enable/disable runtime state" mention. (Task 4.)                                                                                                                                                                                                       |
| `docs/roadmap.md`                                             | Flip the B2b checkbox; replace the trigger description with a one-line summary linking this spec. (Task 4.)                                                                                                                                                                                                                                                  |

No changes to `@gcscode/extension-api`, `@gcscode/extension-example`, `packages/shell/src/extension-host/registry.ts`, `packages/shell/src/extension-host/registry.test.ts`, `packages/shell/src/app.svelte`, `packages/shell/src/app.test.ts`, `packages/shell/src/keybinding-dispatcher.ts`, `packages/shell/src/keybinding-dispatcher.test.ts`, or any README. The cross-package contract is unchanged.

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on the feature branch**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/phase-b2b-extension-enable-disable` (the controlling agent created it before dispatching). If the branch is `master`, stop and ask the controller.

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 82 tests pass — 79 in `@gcscode/shell` (44 in `registry.test.ts`, 8 in `app.test.ts`, 27 in `keybinding-dispatcher.test.ts`), 3 in `@gcscode/extension-example`. (`@gcscode/extension-api` reports no test files, exits 0.)

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Create the `ExtensionManager` module (TDD)

**Files:**

- Create: `packages/shell/src/extension-host/extension-manager.ts`
- Create: `packages/shell/src/extension-host/extension-manager.test.ts`

This task is TDD with a single commit. Write all seven tests first, run them to confirm they all fail, then implement the manager in one pass and confirm green.

- [ ] **Step 1: Write the failing tests in `extension-manager.test.ts`**

Create the file `packages/shell/src/extension-host/extension-manager.test.ts` with the following content. The fixture pattern mirrors `registry.test.ts`'s inline `extension(id, activate)` helper, with the addition of `vi.fn()` to track activate-call counts and capture context objects per call:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Extension, ExtensionContext, ViewContribution } from '@gcscode/extension-api';

import { createExtensionManager } from './extension-manager';
import { createRegistry } from './registry';

const fakeComponent = {} as ViewContribution['component'];

function makeViewExtension(id: string) {
  const activate = vi.fn((ctx: ExtensionContext) => {
    ctx.subscriptions.push(ctx.host.registerView({ id: `${id}.view`, component: fakeComponent }));
  });
  const extension: Extension = {
    id,
    displayName: id,
    version: '0.0.0',
    activate,
  };
  return { extension, activate };
}

describe('createExtensionManager', () => {
  it('register adds the extension and activates it', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');

    manager.register(extension);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.listViews()).toEqual([{ id: 'ext.a.view', component: fakeComponent }]);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
    ]);
  });

  it('register on a duplicate id throws and leaves the original untouched', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension: first } = makeViewExtension('ext.a');
    const { extension: second } = makeViewExtension('ext.a');

    manager.register(first);

    expect(() => manager.register(second)).toThrow('Extension id "ext.a" is already registered.');
    expect(manager.listExtensions()).toHaveLength(1);
    expect(registry.listViews()).toHaveLength(1);
  });

  it("setEnabled(id, false) deactivates and clears the extension's contributions", () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension } = makeViewExtension('ext.a');
    manager.register(extension);

    manager.setEnabled('ext.a', false);

    expect(registry.listViews()).toHaveLength(0);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: false },
    ]);
  });

  it('setEnabled(id, true) on a disabled extension re-activates with a fresh context', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');
    manager.register(extension);
    manager.setEnabled('ext.a', false);

    manager.setEnabled('ext.a', true);

    expect(activate).toHaveBeenCalledTimes(2);
    const firstContext = activate.mock.calls[0][0];
    const secondContext = activate.mock.calls[1][0];
    expect(secondContext).not.toBe(firstContext);
    expect(secondContext.subscriptions).toHaveLength(1);
    expect(registry.listViews()).toEqual([{ id: 'ext.a.view', component: fakeComponent }]);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
    ]);
  });

  it('same-value setEnabled is a true no-op', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');
    manager.register(extension);

    manager.setEnabled('ext.a', true);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.listViews()).toHaveLength(1);

    manager.setEnabled('ext.a', false);
    manager.setEnabled('ext.a', false);

    expect(registry.listViews()).toHaveLength(0);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: false },
    ]);
  });

  it('setEnabled on an unknown id throws', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);

    expect(() => manager.setEnabled('does-not-exist', false)).toThrow(
      'Cannot set enabled state: extension id "does-not-exist" is not registered.',
    );
    expect(() => manager.setEnabled('does-not-exist', true)).toThrow(
      'Cannot set enabled state: extension id "does-not-exist" is not registered.',
    );
  });

  it('listExtensions returns a snapshot reflecting current state', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension: a } = makeViewExtension('ext.a');
    const { extension: b } = makeViewExtension('ext.b');
    manager.register(a);
    manager.register(b);

    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
      { id: 'ext.b', displayName: 'ext.b', version: '0.0.0', enabled: true },
    ]);

    manager.setEnabled('ext.a', false);

    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: false },
      { id: 'ext.b', displayName: 'ext.b', version: '0.0.0', enabled: true },
    ]);

    manager.setEnabled('ext.a', true);

    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
      { id: 'ext.b', displayName: 'ext.b', version: '0.0.0', enabled: true },
    ]);
  });
});
```

Notes on the test design:

- The `makeViewExtension(id)` fixture returns both the extension and the spy so each test can assert on activate-call counts and per-call context references. The pattern matches `registry.test.ts`'s inline-`extension` helper (`registry.test.ts:16`) extended with `vi.fn()`.
- The fresh-context assertion uses object identity (`secondContext !== firstContext`) plus a length check on `secondContext.subscriptions` — the registry creates a brand-new `subscriptions: []` per `activate` (`registry.ts:131`), so a re-activated extension should see a fresh empty array that gets one push during its activate.
- The duplicate-id test uses two distinct extension objects with the same `id` to confirm the throw fires on `extensions.has(extension.id)` regardless of object identity.
- The same-value-no-op test asserts via `activate.toHaveBeenCalledTimes(N)` AND via the registry's listViews length — both behaviors are required (no extra `registry.activate` call AND no extra `SvelteMap.set` invalidation).
- `listExtensions` ordering follows `SvelteMap` insertion order (which matches `Map` insertion order — both honor insertion order per the spec). Tests assume `register('ext.a')` then `register('ext.b')` produces `[ext.a, ext.b]`; the implementation under test must preserve this.

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm --filter @gcscode/shell test extension-manager`
Expected: all seven tests fail with import resolution errors — `extension-manager.ts` does not yet exist. Vitest reports the suite as failed to load. This is the expected red state.

- [ ] **Step 3: Create `extension-manager.ts` with the manager implementation**

Create the file `packages/shell/src/extension-host/extension-manager.ts` with the following content:

```ts
import { SvelteMap } from 'svelte/reactivity';

import type { Extension } from '@gcscode/extension-api';

import type { Registry } from './registry';

interface ExtensionState {
  extension: Extension;
  enabled: boolean;
}

export interface ExtensionRecord {
  id: string;
  displayName: string;
  version: string;
  enabled: boolean;
}

export interface ExtensionManager {
  register(extension: Extension): void;
  setEnabled(id: string, enabled: boolean): void;
  listExtensions(): readonly ExtensionRecord[];
}

function toRecord(state: ExtensionState): ExtensionRecord {
  return {
    id: state.extension.id,
    displayName: state.extension.displayName,
    version: state.extension.version,
    enabled: state.enabled,
  };
}

// Invariant: extensions are registered exactly once and stay registered for
// the manager's lifetime. The manager retains Extension references so re-enable
// can re-feed Registry.activate (per the B1 forecast: "the registry is in a
// clean state with respect to that extension id; the caller re-passes the
// extension"). The internal map is a SvelteMap so listExtensions() is reactive
// to setEnabled mutations — same pattern as Registry.list*() post-B2a.
export function createExtensionManager(registry: Registry): ExtensionManager {
  const extensions = new SvelteMap<string, ExtensionState>();

  return {
    register(extension) {
      if (extensions.has(extension.id)) {
        throw new Error(`Extension id "${extension.id}" is already registered.`);
      }
      extensions.set(extension.id, { extension, enabled: true });
      registry.activate(extension);
    },
    setEnabled(id, enabled) {
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
        registry.deactivate(id);
      }
      extensions.set(id, { ...state, enabled });
    },
    listExtensions() {
      return Array.from(extensions.values()).map(toRecord);
    },
  };
}
```

Notes on the implementation:

- The `register` order is **store first, then activate** (`extensions.set(...)` before `registry.activate(...)`). The manager's invariant is that every key in the map represents a known extension; storing first preserves that even if `extension.activate(context)` throws partway. Per the spec's "Failure handling" section, B2b does not roll back the store on activate failure — the registry's pre-existing partial-subscription state is the more pressing inconsistency and is out of scope for this iteration.
- The `setEnabled` order is **registry call first, then store update** (`registry.activate(...)` / `registry.deactivate(...)` before `extensions.set(...)`). If the registry call throws, the manager's `enabled` flag does NOT flip — the caller sees the exception and the map state is unchanged.
- The `extensions.set(id, { ...state, enabled })` line at the end of `setEnabled` is the reactivity point: `SvelteMap` propagates on `set`/`delete` but not on value mutation, so a same-object mutation (`state.enabled = enabled`) would NOT invalidate `$derived` consumers. The spread + set pattern matches the registry's per-disposable `set(id, contribution)` precedent.
- `listExtensions` uses `Array.from(extensions.values()).map(toRecord)` — iterating the `SvelteMap` registers a Svelte dependency, so `$derived(manager.listExtensions())` re-tracks on `setEnabled` mutations. Same pattern as `Registry.listViews()` post-B2a (`registry.ts:155`).

- [ ] **Step 4: Run the tests, expect pass**

Run: `pnpm --filter @gcscode/shell test extension-manager`
Expected: all seven tests pass. The suite reports `7 passed`.

- [ ] **Step 5: Run the full shell test suite**

Run: `pnpm --filter @gcscode/shell test`
Expected: 86 tests pass — 79 prior + 7 new. The pre-existing 79 are unaffected because the manager module does not modify the registry or any other shell code.

- [ ] **Step 6: Run check across the workspace**

Run: `pnpm check`
Expected: clean across all three packages. The new module imports `Registry` from `./registry` (a type-level import is fine; the runtime use is the parameter passed by the caller) and `Extension` from `@gcscode/extension-api`. `SvelteMap<K, V>` is assignable wherever `Map<K, V>` is needed.

- [ ] **Step 7: Run lint and format**

Run: `pnpm lint`
Expected: clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 8: Commit**

```bash
git add packages/shell/src/extension-host/extension-manager.ts packages/shell/src/extension-host/extension-manager.test.ts
git commit -m "$(cat <<'EOF'
feat(shell): add ExtensionManager layer above the registry

Adds packages/shell/src/extension-host/extension-manager.ts exporting
createExtensionManager(registry) plus ExtensionManager and
ExtensionRecord interfaces. The manager owns per-extension runtime
enabled state and retains Extension references for re-activation; the
registry surface is unchanged.

Three public methods: register(extension) adds the entry and calls
registry.activate; setEnabled(id, enabled) is a no-op on same-value
calls and otherwise drives registry.activate / registry.deactivate
followed by a SvelteMap.set so the mutation propagates through
$derived consumers; listExtensions() returns a readonly snapshot of
{ id, displayName, version, enabled } records.

Seven co-located tests cover: register adds + activates; duplicate id
throws and leaves the original untouched; setEnabled false deactivates
and clears contributions; setEnabled true on disabled re-activates
with a fresh context; same-value setEnabled is a no-op (no extra
activate / deactivate / SvelteMap.set); setEnabled on unknown id
throws; listExtensions returns a snapshot reflecting current state.

main.ts is not yet wired to use the manager; that comes next.

Spec: docs/specs/2026-04-27-phase-b2b-extension-enable-disable.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire the manager into `main.ts`

**Files:**

- Modify: `packages/shell/src/main.ts`

- [ ] **Step 1: Update the bootstrap to construct and use the manager**

The current `packages/shell/src/main.ts` reads:

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

Replace it with:

```ts
import { mount } from 'svelte';

import { exampleExtension } from '@gcscode/extension-example';

import './app.css';
import App from './app.svelte';
import { attachKeybindingDispatcher } from './keybinding-dispatcher';
import { createExtensionManager } from './extension-host/extension-manager';
import { createRegistry } from './extension-host/registry';

const registry = createRegistry();
const manager = createExtensionManager(registry);
manager.register(exampleExtension);

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
```

The diff is exactly:

- A new import of `createExtensionManager` from `./extension-host/extension-manager` (placed alongside the existing `createRegistry` import; alphabetical order within the group puts it on the line above).
- The line `registry.activate(exampleExtension);` is replaced with two lines: `const manager = createExtensionManager(registry);` and `manager.register(exampleExtension);`.
- The keybinding dispatcher attach call and the `App` mount continue to receive `registry` (not `manager`). The toggle UI does not exist yet, so no Svelte component consumes the manager in this iteration.

The `manager` const is unused after the `register` call. That is intentional: when a future toggle UI lands, it will receive the manager via the same prop-drilling pattern `App` uses for the registry. ESLint should not flag this because the binding is referenced (in the `register` call). If a linter rule does complain, the controller agent should investigate rather than the implementer silencing it.

- [ ] **Step 2: Run the full shell test suite**

Run: `pnpm --filter @gcscode/shell test`
Expected: 86 tests pass. `app.test.ts` constructs its own `registry` directly via `createRegistry()` (no manager), so its tests are unaffected. The new bootstrap only affects the dev-server runtime.

- [ ] **Step 3: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: both clean. If Prettier complains about import ordering, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 4: Commit**

```bash
git add packages/shell/src/main.ts
git commit -m "$(cat <<'EOF'
feat(shell): wire ExtensionManager into bootstrap

Replace the direct registry.activate(exampleExtension) call with
manager.register(exampleExtension) constructed from the new
createExtensionManager(registry). The keybinding dispatcher and
App mount continue to receive the registry — no Svelte component
consumes the manager in this iteration.

Spec: docs/specs/2026-04-27-phase-b2b-extension-enable-disable.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Propagate non-goals to `docs/out-of-scope.md` and flip the roadmap entry

**Files:**

- Modify: `docs/out-of-scope.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Update the `Extension.deactivate?()` hook bullet in `docs/out-of-scope.md`**

The bullet's current trailing parenthetical mentions both extension enable/disable runtime state (B2) and HMR (B3) as still deferred. Find the bullet in the "Extension machinery" section (currently around line 12, beginning with `- **\`Extension.deactivate?()\` hook (non-disposable / async cleanup).\*\*`). Its body ends with the sentence:

```md
Extension enable/disable runtime state and dev-time hot reload are still deferred (Phases B2 and B3 — separate iterations). (ADR-0003)
```

Replace that sentence with the post-B2b version:

```md
Dev-time hot reload is still deferred (Phase B3 — separate iteration). (ADR-0003)
```

The rest of the bullet (everything up to that final sentence — the body about disposables, today's first-party extension, the deactivate-hook trigger condition, and the SITL named consumer) stays exactly as-is. No new bullet is added; B2b is shipping enable/disable, not deferring it. The `Declarative \`contributes\` manifest`, `Activation events / lazy activation`, `Capability / permission declarations`, `Hot module reload for extensions`, `registry.deactivateAll()` / bulk teardown, additional contribution kinds, and remaining bullets stay unchanged.

- [ ] **Step 2: Flip the B2b checkbox in `docs/roadmap.md`**

In `docs/roadmap.md`, find the existing B2b line in the "Phase B — Lifecycle and cleanup" section. It currently reads (line 20):

```md
- [ ] **B2b: Extension enable/disable** — runtime `enabled` state per extension + a toggle that drives activate/deactivate. Trigger: a "disable extension" UI or visible per-extension state change need.
```

Replace that line with:

```md
- [x] **B2b: Extension enable/disable** — `ExtensionManager` layer above the registry; `manager.register` / `setEnabled` / `listExtensions`. Spec: [`specs/2026-04-27-phase-b2b-extension-enable-disable.md`](specs/2026-04-27-phase-b2b-extension-enable-disable.md)
```

Leave the B1 line, the B2a line, the B3 line, and the `Extension.deactivate?()` hook line untouched. Leave the Phase A and Phase C sections, the Feature extensions section, and the Maintenance section unchanged.

- [ ] **Step 3: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: both clean. (Prettier may rewrap the long bullet in either doc; that is expected and benign.)

- [ ] **Step 4: Commit**

```bash
git add docs/out-of-scope.md docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs: propagate B2b non-goals + flip roadmap B2b checkbox

docs/out-of-scope.md:
- Update the Extension.deactivate?() hook bullet's trailing
  parenthetical to drop the "extension enable/disable runtime state"
  mention. B2b ships that state machine; only HMR remains deferred
  in the bullet's residual sentence.

docs/roadmap.md:
- Flip the B2b checkbox; replace the trigger description with a
  one-line summary plus a link to this spec. B2a, B3, and the
  Extension.deactivate?() hook lines are unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. The shell suite reports 86 tests passing (79 prior + 7 new); the extension-example suite is unchanged at 3.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev` (in the background)
Expected: Vite reports `Local: http://localhost:5173/`.

- [ ] **Step 3: Verify the app still renders correctly (regression guard)**

Open `http://localhost:5173/` in a browser (or via the chrome-devtools-mcp `new_page` tool). B2b has no user-visible surface change, so the bar is "nothing changed for the user." Confirm:

- The header reads `GCScode`.
- The example view (`<h2>Example Extension</h2>` + paragraph) renders in the content area.
- The status bar footer shows `Example` on the right side.
- No errors or warnings in the browser console.
- Press `Alt+Shift+G`. Confirm `Hello from gcscode.example` appears in the console (A3 keybinding still works — the dispatcher reads `registry.listKeybindings()` per keydown and is unaffected by the new manager layer; main.ts continues to pass `registry` to `attachKeybindingDispatcher`).

If the browser is unavailable in the agent environment, fall back to the test suite — `extension-manager.test.ts` covers the manager's contract end-to-end, `app.test.ts` covers post-mount registry reactivity (B2a), and `keybinding-dispatcher.test.ts` covers keybinding dispatch.

- [ ] **Step 4: Stop the dev server**

Stop the background `pnpm dev` process.

- [ ] **Step 5: Confirm working tree clean and feature commits as expected**

Run: `git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. The branch contains at least three new commits beyond master (one each from Tasks 2, 3, and 4), plus any `Code-review-followup:` commits the controller adds during the per-task review loop.

---

## Out of scope reminders

These are intentionally NOT part of B2b (see the spec):

- **Persistence of disabled state.** No reads or writes from `localStorage`, `IndexedDB`, or any settings store. Disabled extensions become enabled again on reload. Lands with the manifest iteration.
- **`unregister(id)` / uninstall.** Once an extension is registered, it stays registered for the manager's lifetime. Lands with the manifest iteration.
- **Initial-disabled flag on `register`.** `manager.register(extension)` always sets `enabled: true` and immediately activates. No `register(extension, { enabled: false })` overload. Lands with the manifest iteration.
- **Toggle UI.** No view, palette entry, command, or keybinding that calls `setEnabled`. The reactive `listExtensions()` is wired so a future consumer is a thin layer.
- **`getExtension(id)` / `isEnabled(id)` convenience reads.** Only `listExtensions()` is exposed. Tests use `find` against the array.
- **Public reactivity surface for extensions (`host.onDidChange*`).** No event-bus shape on the `ExtensionHost`. The cross-package contract in `@gcscode/extension-api` is unchanged.
- **Async `setEnabled` / async activate.** Synchronous everywhere, mirroring `registry.activate` / `registry.deactivate`. The deferred `Extension.deactivate?()` hook iteration will revisit this.
- **Registry surface changes.** The `Registry` interface is identical to the post-B2a version. No new methods, no removed methods, no signature changes.
- **Changes to `@gcscode/extension-api` or `@gcscode/extension-example`.** The cross-package contract and the worked-example extension are untouched.
- **Renaming `Registry.activate` → `register` / `Registry.deactivate` → `setEnabled`.** A deliberate Option-2 divergence considered during brainstorming and rejected in favor of the layered design (see the spec's VS Code alignment table). Do not refactor the registry's method names.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on registrar duplication

A3's cross-cutting reviewer flagged the four `register*` blocks in `registry.ts` (`registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) as a candidate for a `makeRegistrar<T>` factory. B1, B2a, and B2b do not touch them — B2b adds a new module above the registry rather than refactoring inside it. The duplication question is unchanged and remains a candidate for a separate refactor independent of any phase iteration. Do not pre-emptively extract during Tasks 1–5.

## Cross-cutting note on the layered design

The choice to add an `ExtensionManager` above the registry rather than rename `Registry.activate` → `register` was deliberate, recorded in the spec's VS Code alignment table, and is what makes B2b a thin additive layer (per B1's spec line 48 and B2a's spec line 13 forecasts). Do not "tidy up" by collapsing the manager's logic into the registry; do not propose `Registry.setEnabled` as an alternative; do not rename existing `Registry.activate` / `Registry.deactivate` to match the manager's `register` / `setEnabled` vocabulary. The two layers have one clear job each and the boundary is the load-bearing structural choice this iteration ships. If the surface ever feels crowded enough to want a rename, that decision can be revisited at Phase C namespacing time with the benefit of more shipped consumers.
