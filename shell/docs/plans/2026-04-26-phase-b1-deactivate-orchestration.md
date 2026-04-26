# Phase B1 — Deactivate orchestration implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single new method `deactivate(pluginId: string): void` to the host-side `Registry` interface that iterates a plugin's recorded subscriptions in reverse registration order (LIFO) and calls `dispose()` on each, with per-disposable error resilience. The plugin-facing contract is unchanged.

**Architecture:** The disposable plumbing is already in place — `subscriptionsByPlugin: Map<string, readonly Disposable[]>` is recorded by `activate()` (`registry.ts:31, 130`) and every existing `register*` method returns an idempotent, identity-checked Disposable that removes its entry from the relevant kind-specific Map (`registry.ts:53, 70, 87, 104`). B1 adds a single registry-level orchestrator that walks the recorded subscriptions in reverse, catches per-disposable errors, and clears the plugin entry from `subscriptionsByPlugin` after iteration. Nothing in `@gcscode/plugin-api`, no new types, no `Plugin.deactivate?()` hook (split off and deferred), no enable/disable state (Phase B2), no hot reload (Phase B3), no reactive propagation to mounted UI (existing snapshot-at-mount invariant; deferred).

**Tech Stack:** TypeScript, Vitest (jsdom), pnpm workspaces.

**Spec:** `docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md`

**ADRs to be aware of:** ADR-0001 (workspace boundary), ADR-0002 (imperative activate API), ADR-0003 (Disposable + PluginContext + identity + per-kind methods). ADR-0003's Phase B follow-up bullet originally pairs the orchestration with the optional plugin hook; B1 explicitly splits them.

---

## File structure

| Path                                                | Responsibility                                                                                                                                 |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shell/src/plugin-host/registry.ts`        | Add `deactivate(pluginId): void` to the `Registry` interface and to the returned object. Extend the invariant comment at lines 22–25 (Task 2). |
| `packages/shell/src/plugin-host/registry.test.ts`   | Add seven `deactivate` test cases (Task 2).                                                                                                    |
| `docs/out-of-scope.md`                              | Propagate B1 cross-cutting non-goals (Task 3).                                                                                                 |
| `docs/decisions/ADR-0003-plugin-api-refinements.md` | Refresh the Phase B follow-up bullet to reflect the B1/B2/B3 split (Task 3).                                                                   |

No changes to `@gcscode/plugin-api`, `@gcscode/plugin-example`, `packages/shell/src/main.ts`, the keybinding dispatcher, or any README. The plugin-facing contract is unchanged.

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on a feature branch**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/phase-b1-deactivate-orchestration` (the controlling agent created it before dispatching). If branch is `master`, stop and ask the controller.

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 72 tests pass — 69 in `@gcscode/shell`, 3 in `@gcscode/plugin-example`. (`@gcscode/plugin-api` reports no test files, exits 0.)

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Add `registry.deactivate` orchestration (TDD)

**Files:**

- Modify: `packages/shell/src/plugin-host/registry.ts`
- Modify: `packages/shell/src/plugin-host/registry.test.ts`

This task is TDD with a single commit. Write all seven failing tests first, then implement `deactivate` plus the invariant-comment update in one pass.

- [ ] **Step 1: Write the failing `deactivate` tests in `registry.test.ts`**

Append the following inside the existing `describe('createRegistry', () => { ... })` block, just before the closing `});`. Reuse the existing `plugin(...)` helper at `registry.test.ts:16-18` and the existing `fakeComponent` at line 14. Add `vi` to the existing vitest import (it currently imports `describe, expect, it`).

First, update the import line at the top of the file from:

```ts
import { describe, expect, it } from 'vitest';
```

to:

```ts
import { describe, expect, it, vi } from 'vitest';
```

Then append the seven test cases inside the `describe` block:

```ts
it("deactivate removes all of the plugin's contributions across kinds", () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.subscriptions.push(
        ctx.host.registerView({ id: 'plugin.a.view', component: fakeComponent }),
        ctx.host.registerStatusBarItem({
          id: 'plugin.a.status',
          component: fakeComponent,
          alignment: 'right',
        }),
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run: () => undefined }),
        ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'plugin.a.cmd' }),
      );
    }),
  );
  expect(registry.listViews()).toHaveLength(1);
  expect(registry.listStatusBarItems()).toHaveLength(1);
  expect(registry.listCommands()).toHaveLength(1);
  expect(registry.listKeybindings()).toHaveLength(1);

  registry.deactivate('plugin.a');

  expect(registry.listViews()).toHaveLength(0);
  expect(registry.listStatusBarItems()).toHaveLength(0);
  expect(registry.listCommands()).toHaveLength(0);
  expect(registry.listKeybindings()).toHaveLength(0);
});

it('deactivate disposes subscriptions in reverse registration order (LIFO)', () => {
  const registry = createRegistry();
  const order: number[] = [];
  registry.activate(
    plugin('plugin.a', (ctx) => {
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

  registry.deactivate('plugin.a');

  expect(order).toEqual([3, 2, 1, 0]);
});

it('deactivate logs and continues when a dispose() throws', () => {
  const registry = createRegistry();
  const order: string[] = [];
  registry.activate(
    plugin('plugin.a', (ctx) => {
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
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  expect(() => registry.deactivate('plugin.a')).not.toThrow();

  // LIFO: last → middle → first; all three attempted despite middle throwing.
  expect(order).toEqual(['last', 'middle', 'first']);
  expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  expect(consoleErrorSpy.mock.calls[0][0]).toContain('plugin.a');

  consoleErrorSpy.mockRestore();
});

it('deactivate throws when called with an unknown / not-active plugin id', () => {
  const registry = createRegistry();
  expect(() => registry.deactivate('not-active.plugin')).toThrow(
    /Cannot deactivate plugin: id "not-active\.plugin" is not active/,
  );
});

it('deactivate throws on the second call (id is no longer active)', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerView({ id: 'plugin.a.view', component: fakeComponent });
    }),
  );

  registry.deactivate('plugin.a');

  expect(() => registry.deactivate('plugin.a')).toThrow(
    /Cannot deactivate plugin: id "plugin\.a" is not active/,
  );
});

it('re-activating a deactivated plugin works without duplicate-id errors', () => {
  const registry = createRegistry();
  const p = plugin('plugin.a', (ctx) => {
    ctx.subscriptions.push(
      ctx.host.registerView({ id: 'plugin.a.view', component: fakeComponent }),
    );
  });

  registry.activate(p);
  expect(registry.listViews().map((v) => v.id)).toEqual(['plugin.a.view']);

  registry.deactivate('plugin.a');
  expect(registry.listViews()).toHaveLength(0);

  // The same plugin can be re-activated against a clean slate.
  expect(() => registry.activate(p)).not.toThrow();
  expect(registry.listViews().map((v) => v.id)).toEqual(['plugin.a.view']);
});

it('deactivate isolates plugins — deactivating one does not affect another', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.subscriptions.push(
        ctx.host.registerView({ id: 'plugin.a.view', component: fakeComponent }),
      );
    }),
  );
  registry.activate(
    plugin('plugin.b', (ctx) => {
      ctx.subscriptions.push(
        ctx.host.registerView({ id: 'plugin.b.view', component: fakeComponent }),
      );
    }),
  );
  expect(registry.listViews()).toHaveLength(2);

  registry.deactivate('plugin.a');

  expect(registry.listViews().map((v) => v.id)).toEqual(['plugin.b.view']);
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm --filter @gcscode/shell test`
Expected: TypeScript error — `Property 'deactivate' does not exist on type 'Registry'`. The runner does not start.

- [ ] **Step 3: Add `deactivate` to the `Registry` interface and the returned object**

In `packages/shell/src/plugin-host/registry.ts`:

Update the `Registry` interface (currently at lines 13–20) to add `deactivate` immediately after `activate`:

```ts
export interface Registry {
  activate(plugin: Plugin): void;
  deactivate(pluginId: string): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}
```

In the returned registry object inside `createRegistry`, add the `deactivate` method immediately after `activate` (and before `listViews`):

```ts
    deactivate(pluginId) {
      const subscriptions = subscriptionsByPlugin.get(pluginId);
      if (subscriptions === undefined) {
        throw new Error(`Cannot deactivate plugin: id "${pluginId}" is not active.`);
      }
      // LIFO: dispose in reverse registration order. A plugin that registers a
      // higher-level disposable later may depend on lower-level ones registered
      // earlier; reverse order tears down the higher-level layer first.
      for (let i = subscriptions.length - 1; i >= 0; i--) {
        try {
          subscriptions[i].dispose();
        } catch (error) {
          console.error(
            `Error disposing subscription for plugin "${pluginId}":`,
            error,
          );
        }
      }
      subscriptionsByPlugin.delete(pluginId);
    },
```

The existing `register*` Disposables already remove their entries from the kind-specific Maps and are already idempotent + safe under re-registration. No changes to `register*`, `list*`, `executeCommand`, or `activate`.

- [ ] **Step 4: Extend the invariant comment at `registry.ts:22-25` to acknowledge deactivation**

Replace the existing comment block:

```ts
// Invariant: all registry.activate(plugin) calls must complete before App
// mounts. Registration is not reactive — consumers read via
// $derived(registry.listViews()), which snapshots at mount time. Post-mount
// registration is out of scope (see docs/out-of-scope.md).
```

with:

```ts
// Invariant: registry mutations (activate, deactivate, individual dispose
// calls) do not propagate reactively to mounted consumers. Consumers read
// via $derived(registry.listViews()), which snapshots at mount time. Post-
// mount mutation works at the registry level but the rendered UI will not
// update. Reactive propagation is out of scope (see docs/out-of-scope.md);
// pre-mount activation and test-only deactivation are the supported callers
// today.
```

- [ ] **Step 5: Run the tests, expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: 76 tests pass (69 prior + 7 new). The plugin-example suite is unchanged at 3.

- [ ] **Step 6: Run check across the workspace**

Run: `pnpm check`
Expected: clean across all three packages.

- [ ] **Step 7: Run lint and format**

Run: `pnpm lint`
Expected: clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 8: Commit**

```bash
git add packages/shell/src/plugin-host/registry.ts packages/shell/src/plugin-host/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(shell): add registry.deactivate orchestration

New method on the host-side Registry interface: deactivate(pluginId)
iterates the plugin's recorded subscriptions in reverse registration
order (LIFO) and calls dispose() on each. Per-disposable errors are
caught and logged via console.error; iteration continues. Throws
loudly when called with an unknown / not-active id. After teardown
the plugin entry is removed from subscriptionsByPlugin so a subsequent
activate(plugin) starts from a clean slate.

The plugin-facing contract is unchanged — no edits to @gcscode/plugin-api,
no new types, no Plugin.deactivate?() hook (split off; see docs/specs/
2026-04-26-phase-b1-deactivate-orchestration.md). Reactive propagation
of registry mutations to mounted UI is also out of scope (existing
snapshot-at-mount invariant in registry.ts is extended to cover
deactivation); B1 is honest only for pre-mount and test callers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Propagate non-goals to `docs/out-of-scope.md` and refresh ADR-0003 Phase B follow-up

**Files:**

- Modify: `docs/out-of-scope.md`
- Modify: `docs/decisions/ADR-0003-plugin-api-refinements.md`

- [ ] **Step 1: Rewrite the existing `deactivate` orchestration bullet in `docs/out-of-scope.md`**

Find the bullet that currently reads:

```md
- **`deactivate` orchestration.** Disposables are in place (every `register*` returns a `Disposable`, plugins push to `context.subscriptions`), but the host does not yet iterate `subscriptions` to tear plugins down. No `Plugin.deactivate`, no enable/disable, no reload. _Trigger to revisit:_ dev-time hot reload, a "disable plugin" UI, or a teardown path needed for tests. (ADR-0003)
```

Replace it with:

```md
- **`Plugin.deactivate?()` hook (non-disposable / async cleanup).** `registry.deactivate(pluginId)` ships in B1 — it iterates `subscriptionsByPlugin` in reverse registration order (LIFO) and calls `dispose()` on each. The optional plugin-side `Plugin.deactivate?()` hook (for cleanup that doesn't fit the Disposable shape — closing a connection, flushing a queue, awaiting a worker) is split off and still deferred. Today's first-party plugin (`@gcscode/plugin-example`) tears down purely through Disposables. _Trigger to revisit:_ first plugin needing non-disposable cleanup. Named on-deck consumer: a future SITL listener plugin (streaming data feed; will hold a connection that needs explicit close). Plugin enable/disable runtime state and dev-time hot reload are still deferred (Phases B2 and B3 — separate iterations). (ADR-0003)
```

- [ ] **Step 2: Add two new bullets to the "Plugin machinery" section of `docs/out-of-scope.md`**

Find the bullet that begins `**Hot module reload for plugins.**`. Insert the two bullets below immediately AFTER that bullet and BEFORE the bullet that begins `**Additional contribution kinds beyond views, status bar items, commands, and keybindings.**`:

```md
- **`registry.deactivateAll()` / bulk teardown.** `deactivate(pluginId)` is single-plugin only. Callers that want to tear down every active plugin iterate per-plugin. _Trigger to revisit:_ a host-driven shutdown path or a test harness that needs guaranteed reverse-activation order across plugins.
- **Reactive propagation of registry mutations to mounted UI.** Registration and deactivation mutate the registry's maps but do not propagate reactively to consumers. `$derived(registry.list*())` snapshots at mount; post-mount mutations work at the registry level but the rendered UI does not update. Pre-mount activation and test-only deactivation are the supported callers today. _Trigger to revisit:_ Phase B2 (plugin enable/disable) or any iteration where a registry mutation must produce a visible UI change without remount.
```

- [ ] **Step 3: Refresh ADR-0003's Phase B follow-up bullet**

In `docs/decisions/ADR-0003-plugin-api-refinements.md`, find the bullet under `## Follow-ups`:

```md
- Phase B: `Plugin.deactivate?` (optional). The registry iterates `subscriptionsByPlugin` and calls `dispose()` on each in registration order.
```

Replace it with:

```md
- Phase B: split into B1 (deactivate orchestration, shipped — `docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md`), B2 (plugin enable/disable runtime state, deferred), B3 (dev-time hot module reload, deferred). B1 added `registry.deactivate(pluginId)`: iterates the plugin's recorded subscriptions in reverse registration order (LIFO, refining this ADR's original "registration order" framing) and calls `dispose()` on each, with per-disposable error resilience (caught + logged + continue). The optional `Plugin.deactivate?()` plugin-side hook (for non-disposable / async cleanup) is split off and still deferred — trigger to revisit: first plugin needing non-disposable cleanup (named on-deck consumer: a future SITL listener plugin).
```

Leave the Phase A and Phase C follow-up bullets unchanged — still accurate.

- [ ] **Step 4: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add docs/out-of-scope.md docs/decisions/ADR-0003-plugin-api-refinements.md
git commit -m "$(cat <<'EOF'
docs: propagate B1 non-goals + refresh ADR-0003 Phase B follow-up

docs/out-of-scope.md:
- Rewrite the existing "deactivate orchestration" bullet — orchestration
  shipped in B1, so the entry now describes only the still-deferred
  Plugin.deactivate?() hook (with the SITL listener named as the on-deck
  consumer that would trigger revisit).
- Add a new bullet for registry.deactivateAll() / bulk teardown
  (deferred; trigger: host shutdown path or test harness needing
  ordered bulk teardown).
- Add a new bullet for reactive propagation of registry mutations to
  mounted UI (deferred; trigger: B2 or any iteration needing visible
  state changes without remount).

ADR-0003:
- Refresh the Phase B follow-up bullet to reflect the B1/B2/B3 split.
  B1 ships disposable-iteration deactivate (LIFO, refining the ADR's
  original "registration order" framing). The Plugin.deactivate?()
  hook stays deferred. Phase A and Phase C bullets unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. The shell suite reports 76 tests passing (69 prior + 7 new); the plugin-example suite is unchanged at 3.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev` (in the background)
Expected: Vite reports `Local: http://localhost:5173/`.

- [ ] **Step 3: Verify the app still renders correctly (regression guard)**

Open `http://localhost:5173/` in a browser (or via the chrome-devtools-mcp `new_page` tool). B1 has no user-visible surface, so the bar is "nothing changed for the user." Confirm:

- The header reads `GCScode`.
- The example view (`<h2>Example Plugin</h2>` + paragraph) renders in the content area.
- The status bar footer shows `Example` on the right side.
- No errors in the console.
- Press `Alt+Shift+G`. Confirm `Hello from gcscode.example` appears in the console (A3 keybinding still works).

If the browser is unavailable in the agent environment, fall back to the test suite — the dispatcher and registry tests cover the relevant behavior, and B1 changes nothing about activation or rendering.

- [ ] **Step 4: Stop the dev server**

Stop the background `pnpm dev` process.

- [ ] **Step 5: Confirm working tree clean and feature commits as expected**

Run: `git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. The branch contains at least two new commits beyond master (one each from Tasks 2 and 3) plus any `Code-review-followup:` commits the controller adds during the per-task review loop.

---

## Out of scope reminders

These are intentionally NOT part of B1 (see the spec):

- `Plugin.deactivate?()` plugin-side hook (split off; trigger: first plugin needing non-disposable cleanup).
- `registry.deactivateAll()` / bulk teardown.
- Plugin enable/disable runtime state (Phase B2).
- Dev-time hot module reload (Phase B3).
- Reactive propagation of registry mutations to mounted UI.
- Deactivation events (`onDidDeactivate`, `onDidChange`).
- A `registry.list()` / `listActivePlugins()` introspection method.
- Idempotency on the orchestration call itself (double-deactivate throws — loud over silent).
- Defensive checks on the per-plugin `host` instance after deactivation.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on registrar duplication

A3's cross-cutting reviewer flagged the four `register*` blocks in `registry.ts` (`registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) as a candidate for a `makeRegistrar<T>` factory. B1 does NOT touch any `register*` block — it adds a new top-level method (`deactivate`) on the registry that is structurally unlike the registrars. The duplication question is unchanged by B1 and remains a candidate for a separate refactor (independent of any phase iteration). Do not pre-emptively extract during Tasks 1–4.
