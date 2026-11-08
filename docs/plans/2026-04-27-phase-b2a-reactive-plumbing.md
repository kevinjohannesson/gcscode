# Phase B2a — Reactive plumbing implementation plan

_Note: The term "plugin" was renamed to "extension" in [ADR-0004](../decisions/ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the registry's four contribution `Map` instances with `SvelteMap` so that `$derived(registry.list*())` consumers in `app.svelte` recompute when the registry mutates post-mount, then prove the reactivity end-to-end with three new tests in `app.test.ts`.

**Architecture:** The four contribution maps in `packages/shell/src/plugin-host/registry.ts` (`views`, `statusBarItems`, `commands`, `keybindings`) become `SvelteMap` instances from `svelte/reactivity`. `SvelteMap` extends `Map<K, V>`, so every existing call site — the `register*` factories with their identity-checked dispose guards, `executeCommand`, `activate`, `deactivate`, and the `list*` methods that call `Array.from(map.values())` — keeps working bit-for-bit. The only observable change: `Array.from(svelteMap.values())` reads through Svelte's reactive system, so `$derived(registry.list*())` re-tracks on `set` / `delete` and the rendered UI updates without remount. `subscriptionsByPlugin` stays a plain `Map` — no UI consumer reads it. The plugin-facing contract in `@gcscode/plugin-api` is untouched.

**Tech Stack:** TypeScript, Svelte 5 (`svelte/reactivity`, `flushSync`), Vitest (jsdom), `@testing-library/svelte`, pnpm workspaces.

**Spec:** `docs/specs/2026-04-27-phase-b2a-reactive-plumbing.md`

**ADRs to be aware of:** ADR-0001 (workspace boundary — reaffirms why `@gcscode/plugin-api` stays Svelte-free even though the registry now imports from `svelte/reactivity`), ADR-0002 (imperative activate API), ADR-0003 (Disposable + identity-checked dispose). No ADR is modified by this iteration.

---

## File structure

| Path                                         | Responsibility                                                                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shell/src/plugin-host/registry.ts` | Add `import { SvelteMap } from 'svelte/reactivity'`. Replace four `new Map(...)` with `new SvelteMap(...)` for the contribution maps. Rewrite the invariant comment. (Task 2.) |
| `packages/shell/src/app.test.ts`             | Add `import { flushSync } from 'svelte'`. Append three new tests proving post-mount reactivity (view register, view deactivate, status bar item register). (Task 2.)           |
| `docs/out-of-scope.md`                       | Remove the "Reactive propagation of registry mutations to mounted UI" bullet. (Task 3.)                                                                                        |
| `docs/roadmap.md`                            | Split the existing B2 entry into B2a (checked, this spec linked) and B2b (unchecked, trigger restated). (Task 3.)                                                              |

No changes to `@gcscode/plugin-api`, `@gcscode/plugin-example`, `packages/shell/src/main.ts`, `packages/shell/src/keybinding-dispatcher.ts`, `packages/shell/src/app.svelte`, `packages/shell/src/plugin-host/registry.test.ts`, or any README. The plugin-facing contract is unchanged.

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on a feature branch**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/phase-b2a-reactive-plumbing` (the controlling agent created it before dispatching). If branch is `master`, stop and ask the controller.

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 79 tests pass — 76 in `@gcscode/shell` (across 3 test files: `registry.test.ts`, `app.test.ts`, `keybinding-dispatcher.test.ts`), 3 in `@gcscode/plugin-example`. (`@gcscode/plugin-api` reports no test files, exits 0.)

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Make the registry contribution maps reactive (TDD)

**Files:**

- Modify: `packages/shell/src/plugin-host/registry.ts`
- Modify: `packages/shell/src/app.test.ts`

This task is TDD with a single commit. Write the three failing tests first, then apply the registry change in one pass.

- [ ] **Step 1: Write the failing tests in `app.test.ts`**

First, update the imports at the top of `packages/shell/src/app.test.ts`. The file currently begins:

```ts
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type { Plugin } from '@gcscode/plugin-api';

import { createRegistry } from './plugin-host/registry';
import App from './app.svelte';
import MockContent from './__fixtures__/mock-content.svelte';
import MockLeft from './__fixtures__/mock-left.svelte';
import MockRight from './__fixtures__/mock-right.svelte';
```

Add a single import for `flushSync` so the new tests can synchronously drain Svelte's effect queue between mutation and assertion. Insert it as a new line after the `@testing-library/svelte` import:

```ts
import { render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
```

The existing `MockRight` import is currently used by the alignment test at lines 47–72 — leave it in place; the new tests do not need it.

Then append the three test cases inside the existing `describe('app.svelte', () => { ... })` block, after the last `it(...)` (`'renders multiple items on the same side in registration order'`, ending at the closing `});` on the line just before `describe`'s closing `});`). Reuse the existing `makePlugin(...)` helper at `app.test.ts:12-19` and the existing fixture imports (`MockContent`, `MockLeft`):

```ts
it('reflects post-mount view registration in the rendered UI', () => {
  const registry = createRegistry();
  render(App, { props: { registry } });
  expect(screen.getByTestId('empty-state')).toBeInTheDocument();

  registry.activate(
    makePlugin((ctx) => {
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
    makePlugin((ctx) => {
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
    makePlugin((ctx) => {
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
```

Notes on the test design:

- The deactivate test pushes the view's disposable into `ctx.subscriptions` so that `registry.deactivate('test')` can dispose it via the B1 orchestration. The other two tests do not need this because they do not call `deactivate`. This mirrors the convention in `registry.test.ts` (e.g. the multi-plugin isolation test at `registry.test.ts:205-226`).
- All three tests use `flushSync()` from `'svelte'` — Svelte's documented synchronous test primitive for draining the effect queue ([source](https://svelte.dev/docs/svelte/testing#Component-testing)). Async alternatives (`await tick()`, `screen.findBy*`) also work; the synchronous form is preferred here for determinism and brevity.
- The plugin id is `'test'` (from the existing `makePlugin` helper); the contribution ids are `'late.view'` / `'test.view'` / `'late.left'`. Plugin id ≠ contribution id; `deactivate` operates on the plugin id.

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm --filter @gcscode/shell test`
Expected: the three new tests fail. The first two fail with assertions around `mock-content` not appearing / `empty-state` still being present after the post-mount mutation. The third fails with `mock-left` not being inside `statusbar-left`. All other 76 tests still pass. The compile is clean (`flushSync` is exported from `'svelte'` even before the registry change).

- [ ] **Step 3: Replace the four `new Map(...)` with `new SvelteMap(...)` in the registry**

In `packages/shell/src/plugin-host/registry.ts`, add a single import line. The file currently begins:

```ts
import type {
  CommandContribution,
  Disposable,
  KeybindingContribution,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/plugin-api';
```

Add the `SvelteMap` import on a new line immediately after the type-only import block (a blank line separates groups):

```ts
import type {
  CommandContribution,
  Disposable,
  KeybindingContribution,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/plugin-api';

import { SvelteMap } from 'svelte/reactivity';
```

Then, inside `createRegistry()`, change the four contribution-map declarations. The current block (`registry.ts:31-35`) reads:

```ts
const views = new Map<string, ViewContribution>();
const statusBarItems = new Map<string, StatusBarItemContribution>();
const commands = new Map<string, CommandContribution>();
const keybindings = new Map<string, KeybindingContribution>();
const subscriptionsByPlugin = new Map<string, readonly Disposable[]>();
```

Replace it with:

```ts
const views = new SvelteMap<string, ViewContribution>();
const statusBarItems = new SvelteMap<string, StatusBarItemContribution>();
const commands = new SvelteMap<string, CommandContribution>();
const keybindings = new SvelteMap<string, KeybindingContribution>();
const subscriptionsByPlugin = new Map<string, readonly Disposable[]>();
```

`subscriptionsByPlugin` deliberately stays `new Map(...)` — no UI consumer reads it; reactivity has no observable benefit there. Every other line in the file is unchanged: the `register*` factories with their identity-checked dispose guards, `executeCommand`, `activate`, `deactivate`, and the `list*` methods. `SvelteMap` extends `Map<K, V>`, so calls like `views.has(view.id)`, `views.set(view.id, view)`, `views.get(view.id) === view`, `views.delete(view.id)`, and `Array.from(views.values())` all behave identically — with the added benefit that mutations are now reactive.

- [ ] **Step 4: Rewrite the invariant comment at the top of `createRegistry`**

The current comment (`registry.ts:23-29`, after B1 extended it) reads:

```ts
// Invariant: registry mutations (activate, deactivate, individual dispose
// calls) do not propagate reactively to mounted consumers. Consumers read
// via $derived(registry.listViews()), which snapshots at mount time. Post-
// mount mutation works at the registry level but the rendered UI will not
// update. Reactive propagation is out of scope (see docs/out-of-scope.md);
// pre-mount activation and test-only deactivation are the supported callers
// today.
```

Replace it with the polarity-flipped version:

```ts
// Invariant: registry mutations propagate reactively to mounted consumers.
// The four contribution maps are SvelteMap instances (from svelte/reactivity),
// so $derived(registry.list*()) re-tracks on set/delete and the rendered UI
// updates without remount. subscriptionsByPlugin stays a plain Map because no
// UI consumer reads it — the registry uses it internally for deactivate
// orchestration only.
```

- [ ] **Step 5: Run the tests, expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: 79 tests pass (76 prior + 3 new). The plugin-example suite is unchanged at 3.

- [ ] **Step 6: Run check across the workspace**

Run: `pnpm check`
Expected: clean across all three packages. (`SvelteMap<K, V>` is assignable wherever `Map<K, V>` was used — no type errors are expected. If TypeScript reports any, do not silence — re-read `svelte/reactivity` exports and confirm the `SvelteMap` import path.)

- [ ] **Step 7: Run lint and format**

Run: `pnpm lint`
Expected: clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 8: Commit**

```bash
git add packages/shell/src/plugin-host/registry.ts packages/shell/src/app.test.ts
git commit -m "$(cat <<'EOF'
feat(shell): make registry contribution maps reactive via SvelteMap

Replace the four contribution Map instances in createRegistry — views,
statusBarItems, commands, keybindings — with SvelteMap from
svelte/reactivity. SvelteMap extends Map<K,V>, so every existing call
site (register* factories with identity-checked dispose guards,
executeCommand, activate, deactivate, list* methods) keeps working
unchanged. The observable difference: Array.from(svelteMap.values())
reads through Svelte's reactive system, so $derived(registry.list*())
recomputes on set/delete and the rendered UI updates without remount.

subscriptionsByPlugin stays a plain Map — no UI consumer reads it.

Three new tests in app.test.ts prove the reactivity end-to-end:
post-mount view registration, post-mount view deactivation, post-mount
status bar item registration on the matching side. Tests use flushSync
from 'svelte' to drain the effect queue between mutation and assertion.

The plugin-facing contract in @gcscode/plugin-api is untouched. Plugins
keep calling host.register* exactly as before. Per-plugin enable/disable
state remains deferred to B2b; HMR remains deferred to B3.

Spec: docs/specs/2026-04-27-phase-b2a-reactive-plumbing.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Propagate non-goals to `docs/out-of-scope.md` and split the roadmap entry

**Files:**

- Modify: `docs/out-of-scope.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Remove the reactive-propagation bullet from `docs/out-of-scope.md`**

Find the bullet in the "Plugin machinery" section that reads (currently around line 15):

```md
- **Reactive propagation of registry mutations to mounted UI.** Registration and deactivation mutate the registry's maps but do not propagate reactively to consumers. `$derived(registry.list*())` snapshots at mount; post-mount mutations work at the registry level but the rendered UI does not update. Pre-mount activation and test-only deactivation are the supported callers today. _Trigger to revisit:_ Phase B2 (plugin enable/disable) or any iteration where a registry mutation must produce a visible UI change without remount.
```

Delete this bullet entirely (the whole line and its trailing newline). Its trigger condition has been satisfied by this iteration. No replacement bullet is needed — the new non-goals introduced by B2a (no public reactivity surface for plugins, no granular reactive query APIs, no reactive `subscriptionsByPlugin`) are per-iteration scope cuts internal to the registry, not cross-cutting architectural deferrals (see CLAUDE.md's `docs/out-of-scope.md` propagation guidance).

Leave the surrounding bullets unchanged — `Plugin.deactivate?()` hook, HMR, `registry.deactivateAll()` / bulk teardown, additional contribution kinds, and so on remain as-is.

- [ ] **Step 2: Split the B2 roadmap entry**

In `docs/roadmap.md`, find the existing B2 line in the "Phase B — Lifecycle and cleanup" section (currently the second `- [ ]` bullet there):

```md
- [ ] **B2: Plugin enable/disable + reactive plumbing** — adds runtime `enabled` state per plugin and the reactive plumbing so mounted UI reflects state changes. Trigger: a "disable plugin" UI or any visible state-change need.
```

Replace that single line with two lines reflecting the split:

```md
- [x] **B2a: Reactive plumbing** — registry mutations propagate to mounted UI via `SvelteMap`. Spec: [`specs/2026-04-27-phase-b2a-reactive-plumbing.md`](specs/2026-04-27-phase-b2a-reactive-plumbing.md)
- [ ] **B2b: Plugin enable/disable** — runtime `enabled` state per plugin + a toggle that drives activate/deactivate. Trigger: a "disable plugin" UI or visible per-plugin state change need.
```

Leave the B1, B3, and `Plugin.deactivate?()` hook lines untouched. Leave the Phase A and Phase C sections, the Feature plugins section, and the Maintenance section unchanged.

- [ ] **Step 3: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: both clean. (Prettier may rewrap the long lines in either doc; that is expected and benign.)

- [ ] **Step 4: Commit**

```bash
git add docs/out-of-scope.md docs/roadmap.md
git commit -m "$(cat <<'EOF'
docs: propagate B2a non-goals + split roadmap B2 into B2a + B2b

docs/out-of-scope.md:
- Remove the "Reactive propagation of registry mutations to mounted UI"
  bullet. Its trigger condition (Phase B2 or any iteration where a
  registry mutation must produce a visible UI change without remount)
  is satisfied by B2a.

docs/roadmap.md:
- Replace the single "B2: Plugin enable/disable + reactive plumbing"
  line with two lines reflecting the split: B2a (checked, spec linked)
  for the reactive plumbing that just shipped, and B2b (unchecked,
  trigger restated) for the deferred per-plugin enable/disable state.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. The shell suite reports 79 tests passing (76 prior + 3 new); the plugin-example suite is unchanged at 3.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev` (in the background)
Expected: Vite reports `Local: http://localhost:5173/`.

- [ ] **Step 3: Verify the app still renders correctly (regression guard)**

Open `http://localhost:5173/` in a browser (or via the chrome-devtools-mcp `new_page` tool). B2a has no user-visible surface, so the bar is "nothing changed for the user." Confirm:

- The header reads `GCScode`.
- The example view (`<h2>Example Plugin</h2>` + paragraph) renders in the content area.
- The status bar footer shows `Example` on the right side.
- No errors or warnings in the browser console.
- Press `Alt+Shift+G`. Confirm `Hello from gcscode.example` appears in the console (A3 keybinding still works — the dispatcher reads `registry.listKeybindings()` per keydown and is unaffected by `Map` → `SvelteMap`).

If the browser is unavailable in the agent environment, fall back to the test suite — `app.test.ts` covers post-mount reactivity end-to-end for views and status bar items, and `keybinding-dispatcher.test.ts` covers keybinding dispatch.

- [ ] **Step 4: Stop the dev server**

Stop the background `pnpm dev` process.

- [ ] **Step 5: Confirm working tree clean and feature commits as expected**

Run: `git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. The branch contains at least two new commits beyond master (one each from Tasks 2 and 3), plus any `Code-review-followup:` commits the controller adds during the per-task review loop.

---

## Out of scope reminders

These are intentionally NOT part of B2a (see the spec):

- Per-plugin `enabled` runtime state and a toggle API. Phase B2b.
- A "Plugin Manager" UI in the shell. Phase B2b at earliest.
- Hot module reload. Phase B3.
- `Plugin.deactivate?()` hook. Still deferred. Named on-deck consumer: SITL listener.
- Public reactivity surface for plugins (`host.onDidChange*`, `host.onDidActivate`).
- Granular reactive query APIs (`findById`, `getByAlignment`, etc.).
- Reactivity for `subscriptionsByPlugin`.
- Reactive `executeCommand` / command-fire telemetry.
- Any change to `@gcscode/plugin-api`, `@gcscode/plugin-example`, `main.ts`, the keybinding dispatcher, `app.svelte`, `registry.test.ts`, any README, or any ADR.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on registrar duplication

A3's cross-cutting reviewer flagged the four `register*` blocks in `registry.ts` (`registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) as a candidate for a `makeRegistrar<T>` factory. B1 did not touch them; B2a does not touch them either — the `SvelteMap` substitution happens in the four `const ... = new Map(...)` lines, not in the `register*` factories. The duplication question is unchanged and remains a candidate for a separate refactor independent of any phase iteration. Do not pre-emptively extract during Tasks 1–4.

## Cross-cutting note on Svelte coupling

The registry now imports from `svelte/reactivity`. This is an explicit, scoped trade-off (see the spec's "Cross-cutting notes" section): the registry lives in `@gcscode/shell`, which IS the Svelte app. The architectural boundary that matters — `@gcscode/plugin-api` — remains framework-neutral by construction; plugins import only from `@gcscode/plugin-api`, which has no Svelte imports. Verify during Task 2 Step 6 (`pnpm check`) that no plugin package picks up a transitive `svelte/reactivity` dependency through `@gcscode/plugin-api`. (It cannot, given the current package layout, but the check confirms it.)
