# Shell dockview content host — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `app.svelte`'s view-stack content area with a `DockviewSvelte` instance hosting extension-registered views as panels in a single tabbed group; add a required `title: string` field to `ViewContribution`.

**Architecture:** A new `view-host.svelte` panel-component receives a Svelte `Component` reference via `params.component` and renders it; an `$effect` in `app.svelte` reconciles dockview's panel set against `registry.listViews()` for both initial seed and runtime add/remove. A `gcscode-tab.svelte` wraps `dockview-svelte`'s `DefaultTab` with `hideClose={true}`. Layout shell becomes a viewport-height flex column so the dockview container sizes correctly.

**Tech Stack:** Svelte 5 (runes), `dockview-svelte` (workspace package), `dockview-core` 6.0.1, Tailwind v4, vitest + @testing-library/svelte.

**Spec:** [`docs/specs/2026-05-13-shell-dockview-host.md`](../specs/2026-05-13-shell-dockview-host.md)

---

## Workflow override for this iteration — READ FIRST

Per the spec's "Implementation workflow override" section, this iteration uses the **pre-PR local-merge workflow**, NOT the new reviews-as-artifacts PR workflow. Specifically:

- **Do NOT** run `gh pr create --draft` after the first task commit.
- **Do NOT** invoke `.claude/scripts/gh-app-token` or call `gh pr review` from any reviewer subagent. Subagent reviewers (spec-compliance, code-quality, final cross-cutting) return their summaries to the controller in-session only.
- **At iteration end:** controller merges locally with `git merge --no-ff feat/shell-dockview-host` on master, then `git push origin master`. The GitHub remote exists; push is permitted.

This overrides CLAUDE.md's general PR-workflow guidance for this iteration only. CLAUDE.md is not modified.

## Branch and worktree

- **Branch:** `feat/shell-dockview-host` (off master)
- **Worktree path:** `.worktrees/feat-shell-dockview-host/` relative to repo root (`/Users/kevinkroon/Projects/gcscode/`)
- **Package root inside worktree:** `<worktree>/shell/`

Per CLAUDE.md's "Subagent worktree discipline": every bash command prepends `cd <worktree>/shell && ` because the bash tool resets cwd between calls. Before every `git commit`, chain `git branch --show-current` and verify the output is `feat/shell-dockview-host` (not `master`). The controller should create the worktree via `superpowers:using-git-worktrees` before dispatching Task 1.

## File structure

This iteration creates / modifies these files:

**Created:**
- `packages/shell/src/dockview-host/view-host.svelte` — single panel-component registered as `'view-host'`; receives a Svelte `Component` via `params.component` and renders it.
- `packages/shell/src/dockview-host/view-host.test.ts` — verifies view-host renders the component passed via params.
- `packages/shell/src/dockview-host/gcscode-tab.svelte` — wraps `dockview-svelte`'s `DefaultTab` with `hideClose={true}`.
- `packages/shell/src/dockview-host/gcscode-tab.test.ts` — verifies no close button rendered.

**Modified:**
- `packages/shell/package.json` — add `dockview-svelte` and `dockview-core` dependencies.
- `packages/shell/src/test-setup.ts` — add `ResizeObserver` no-op polyfill (dockview-core requires it; jsdom doesn't ship one).
- `packages/extension-api/src/index.ts` — add required `title: string` field to `ViewContribution`.
- `packages/extension-example/src/index.ts` + `index.test.ts` — pass `title: 'Example'`.
- `packages/extension-map/src/index.ts` + `index.test.ts` — pass `title: 'Map'`.
- `packages/extension-map-demo/src/index.ts` + `index.test.ts` — pass `title: 'Map (demo)'`.
- `packages/extension-sitl/src/index.ts` + `index.test.ts` — pass `title: 'SITL'`.
- `packages/shell/src/app.svelte` — replace view-stack `<section>` with `DockviewSvelte` (+ empty-state branch); make `<main>` a viewport-height flex column.
- `packages/shell/src/app.test.ts` — update view-rendering assertions to test tab presence by title (not content-text); add reconciliation tests.
- `packages/shell/src/main.ts` — import `dockview-core/dist/styles/dockview.css`.

---

## Task 1: Add dependencies and ResizeObserver mock

**Files:**
- Modify: `packages/shell/package.json` (add deps)
- Modify: `packages/shell/src/test-setup.ts` (add polyfill)

- [ ] **Step 1: Add the workspace + npm dependencies**

Edit `packages/shell/package.json` — add two entries to `dependencies`:

```json
{
  "dependencies": {
    "@gcscode/extension-api": "workspace:*",
    "@gcscode/extension-example": "workspace:*",
    "@gcscode/extension-flight-overlay": "workspace:*",
    "@gcscode/extension-map": "workspace:*",
    "@gcscode/extension-map-demo": "workspace:*",
    "@gcscode/extension-sitl": "workspace:*",
    "@gcscode/extension-vehicle-status": "workspace:*",
    "dockview-core": "^6.0.1",
    "dockview-svelte": "workspace:*",
    "fuse.js": "^7.3.0"
  }
}
```

(`dockview-svelte` is the workspace package name from `packages/dockview-svelte/package.json`.)

- [ ] **Step 2: Install**

Run from worktree root:

```bash
cd <worktree>/shell && pnpm install
```

Expected: pnpm reports the two new deps added; no errors.

- [ ] **Step 3: Add ResizeObserver polyfill to shell's test setup**

Replace `packages/shell/src/test-setup.ts` contents with:

```ts
import '@testing-library/jest-dom/vitest';

// dockview-core uses ResizeObserver for auto-resizing the host element.
// jsdom doesn't ship one — provide a no-op polyfill matching dockview-core's
// own test setup pattern.
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = MockResizeObserver;
```

- [ ] **Step 4: Verify existing tests still pass**

Run:

```bash
cd <worktree>/shell && pnpm test
```

Expected: all shell tests pass (no behavior changed yet).

- [ ] **Step 5: Commit**

```bash
cd <worktree>/shell && git branch --show-current
# Expect: feat/shell-dockview-host
cd <worktree>/shell && git add packages/shell/package.json packages/shell/src/test-setup.ts ../pnpm-lock.yaml
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
chore(shell): add dockview-svelte + dockview-core deps + ResizeObserver test polyfill

Prep for shell dockview content host iteration. dockview-core requires
ResizeObserver which jsdom doesn't ship; polyfill mirrors dockview-svelte's
own test setup.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

The path to `pnpm-lock.yaml` is repo-root-relative (one level above `shell/`). Adjust the `git add` if pnpm-lock isn't modified (in workspace setups it usually is).

---

## Task 2: Add required `title: string` to `ViewContribution`

This task intentionally leaves the codebase in a temporarily-broken state — `pnpm check` will fail because four extensions don't yet pass `title`. Tasks 3-6 fix the call sites in sequence.

**Files:**
- Modify: `packages/extension-api/src/index.ts`

- [ ] **Step 1: Add the field**

In `packages/extension-api/src/index.ts`, find the `ViewContribution` interface (around line 16):

```ts
export interface ViewContribution {
  id: string;
  component: Component;
}
```

Change to:

```ts
export interface ViewContribution {
  id: string;
  component: Component;
  /**
   * Operator-visible label shown on the dockview tab. Required because every
   * view renders a tab — there is no sensible fallback. Naming aligned with
   * CommandContribution.title.
   */
  title: string;
}
```

- [ ] **Step 2: Verify the type-check fails at all four call sites**

Run from worktree root:

```bash
cd <worktree>/shell && pnpm check
```

Expected: TypeScript errors at `extension-example/src/index.ts`, `extension-map/src/index.ts`, `extension-map-demo/src/index.ts`, `extension-sitl/src/index.ts` reporting that `title` is missing from the argument to `registerView`. This is the failing state Tasks 3-6 will resolve.

- [ ] **Step 3: Commit**

```bash
cd <worktree>/shell && git branch --show-current
# Expect: feat/shell-dockview-host
cd <worktree>/shell && git add packages/extension-api/src/index.ts
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
feat(extension-api): add required title field to ViewContribution

Required (not optional) — every view will now render a dockview tab and
there is no sensible fallback. Operator-friendly label, distinct from
the developer-string id. Aligned in spirit with VS Code's views.name field.

Naming matches CommandContribution.title (palette label).

Following commits update the four extensions that registerView to pass
the new field; pnpm check fails until those land.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pass `title` from all four extensions

This task fixes all four extension `registerView` call sites and their tests. Order is alphabetical by extension. Each sub-task is a TDD cycle: update test → run (expect fail) → implement → run (expect pass) → commit.

**Files:**
- Modify: `packages/extension-example/src/index.ts` + `index.test.ts`
- Modify: `packages/extension-map/src/index.ts` + `index.test.ts`
- Modify: `packages/extension-map-demo/src/index.ts` + `index.test.ts`
- Modify: `packages/extension-sitl/src/index.ts` + `index.test.ts`

### Sub-task 3a: extension-example — title 'Example'

- [ ] **Step 1: Update the test**

In `packages/extension-example/src/index.test.ts`, find the `expect(registerView).toHaveBeenCalledWith({...})` block (around line 43) and change it to include `title`:

```ts
expect(registerView).toHaveBeenCalledWith({
  id: 'gcscode.example.main',
  component: ExampleView,
  title: 'Example',
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/extension-example test
```

Expected: the `registers a view, a status bar item, a command, and a keybinding` test fails because the implementation passes only `{ id, component }`, not `title`.

- [ ] **Step 3: Update the implementation**

In `packages/extension-example/src/index.ts`, find the `registerView` call (around line 15) and add `title: 'Example'`:

```ts
context.host.window.registerView({
  id: 'gcscode.example.main',
  component: ExampleView,
  title: 'Example',
}),
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/extension-example test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd <worktree>/shell && git branch --show-current
# Expect: feat/shell-dockview-host
cd <worktree>/shell && git add packages/extension-example/src/index.ts packages/extension-example/src/index.test.ts
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
feat(extension-example): set view title to 'Example'

Satisfies the new required ViewContribution.title field. Tab label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Sub-task 3b: extension-map — title 'Map'

- [ ] **Step 1: Locate the existing test assertion**

In `packages/extension-map/src/index.test.ts`, find the `expect(...registerView).toHaveBeenCalledWith({...})` block. The view id is `'gcscode.map.main'`. Update to include `title: 'Map'`.

- [ ] **Step 2: Run the test — expect failure**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/extension-map test
```

Expected: the view-registration test fails because implementation doesn't pass `title`.

- [ ] **Step 3: Update the implementation**

In `packages/extension-map/src/index.ts`, find the `registerView` call (around line 29) and add `title: 'Map'`:

```ts
context.host.window.registerView({
  id: 'gcscode.map.main',
  component: MapView,
  title: 'Map',
}),
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/extension-map test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd <worktree>/shell && git add packages/extension-map/src/index.ts packages/extension-map/src/index.test.ts
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
feat(extension-map): set view title to 'Map'

Satisfies the new required ViewContribution.title field. Tab label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Sub-task 3c: extension-map-demo — title 'Map (demo)'

- [ ] **Step 1: Update the test**

In `packages/extension-map-demo/src/index.test.ts`, find the `registerView`/`toHaveBeenCalledWith` assertion and add `title: 'Map (demo)'`. View id is `'gcscode.map-demo.main'`.

- [ ] **Step 2: Run the test — expect failure**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/extension-map-demo test
```

Expected: test fails because implementation lacks `title`.

- [ ] **Step 3: Update the implementation**

In `packages/extension-map-demo/src/index.ts`, find the `registerView` call (around line 29) and add `title: 'Map (demo)'`:

```ts
context.host.window.registerView({
  id: 'gcscode.map-demo.main',
  component: MapView,
  title: 'Map (demo)',
}),
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/extension-map-demo test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd <worktree>/shell && git add packages/extension-map-demo/src/index.ts packages/extension-map-demo/src/index.test.ts
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
feat(extension-map-demo): set view title to 'Map (demo)'

Satisfies the new required ViewContribution.title field. The "(demo)"
suffix flags this as the throwaway map-demo extension, distinct from
the real Map view.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Sub-task 3d: extension-sitl — title 'SITL'

- [ ] **Step 1: Update the test**

In `packages/extension-sitl/src/index.test.ts`, find the `registerView`/`toHaveBeenCalledWith` assertion and add `title: 'SITL'`. View id is `'gcscode.sitl.location'` (note: `.location`, not `.main`).

- [ ] **Step 2: Run the test — expect failure**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/extension-sitl test
```

Expected: test fails because implementation lacks `title`.

- [ ] **Step 3: Update the implementation**

In `packages/extension-sitl/src/index.ts`, find the `registerView` call (around line 49) and add `title: 'SITL'`:

```ts
context.host.window.registerView({
  id: 'gcscode.sitl.location',
  component: SitlView,
  title: 'SITL',
}),
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/extension-sitl test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd <worktree>/shell && git add packages/extension-sitl/src/index.ts packages/extension-sitl/src/index.test.ts
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
feat(extension-sitl): set view title to 'SITL'

Satisfies the new required ViewContribution.title field. Tab label.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Sub-task 3e: Verify the API change is fully propagated

- [ ] **Step 1: Repo-wide type check**

```bash
cd <worktree>/shell && pnpm check
```

Expected: clean across all packages.

- [ ] **Step 2: Repo-wide test**

```bash
cd <worktree>/shell && pnpm test
```

Expected: clean across all packages. (No new commit needed — verification only.)

---

## Task 4: Create the view-host panel-component

**Files:**
- Create: `packages/shell/src/dockview-host/view-host.svelte`
- Create: `packages/shell/src/dockview-host/view-host.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shell/src/dockview-host/view-host.test.ts`:

```ts
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import ViewHost from './view-host.svelte';
import MockContent from '../__fixtures__/mock-content.svelte';

describe('view-host.svelte', () => {
  it('renders the component passed via params.component', () => {
    // The view-host expects to be mounted by dockview, which passes panel
    // header props plus the params bag we set via addPanel. We mock just
    // the shape the component reads from.
    const params = { component: MockContent };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(ViewHost as any, { props: { params } as any });
    expect(screen.getByText('mock-content')).toBeInTheDocument();
  });

  it('renders nothing if no component is supplied in params', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(ViewHost as any, { props: { params: {} } as any });
    // No throw; nothing rendered.
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/shell test view-host
```

Expected: failure because `view-host.svelte` does not yet exist.

- [ ] **Step 3: Implement view-host**

Create `packages/shell/src/dockview-host/view-host.svelte`:

```svelte
<script lang="ts">
  import type { Component } from 'svelte';
  import type { IDockviewPanelProps } from 'dockview-svelte';

  type Params = { component?: Component };

  // We accept the full dockview panel-props shape but only consume `params`.
  // `api` and `containerApi` are passed through by dockview and ignored here.
  let { params }: IDockviewPanelProps<Params> = $props();

  // Local binding captures the reactive component reference for the markup.
  const ViewComponent = $derived(params.component);
</script>

{#if ViewComponent}
  <ViewComponent />
{/if}
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/shell test view-host
```

Expected: both tests pass.

- [ ] **Step 5: Commit**

```bash
cd <worktree>/shell && git add packages/shell/src/dockview-host/view-host.svelte packages/shell/src/dockview-host/view-host.test.ts
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
feat(shell): add view-host panel-component for dockview integration

Single panel-component registered with dockview as 'view-host'. Receives
a Svelte Component reference via params.component and renders it. Lets
us use one registration while hosting N runtime-registered extension views.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create the gcscode-tab component (DefaultTab wrapper with hideClose)

**Files:**
- Create: `packages/shell/src/dockview-host/gcscode-tab.svelte`
- Create: `packages/shell/src/dockview-host/gcscode-tab.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shell/src/dockview-host/gcscode-tab.test.ts`:

```ts
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import GcscodeTab from './gcscode-tab.svelte';

// Build a minimal mock IDockviewPanelHeaderProps shape — gcscode-tab only
// needs `api` (to read title + subscribe to changes) at runtime.
function makeApiMock(title: string) {
  return {
    title,
    onDidTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
    close: vi.fn(),
  };
}

describe('gcscode-tab.svelte', () => {
  it('renders the title from api.title', () => {
    const api = makeApiMock('My Tab');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(GcscodeTab as any, { props: { api } as any });
    expect(container.textContent).toContain('My Tab');
  });

  it('does not render the close button', () => {
    const api = makeApiMock('My Tab');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { container } = render(GcscodeTab as any, { props: { api } as any });
    // DefaultTab's close button is rendered with class .dv-default-tab-action.
    // hideClose suppresses it.
    expect(container.querySelector('.dv-default-tab-action')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/shell test gcscode-tab
```

Expected: failure because `gcscode-tab.svelte` does not yet exist.

- [ ] **Step 3: Implement gcscode-tab**

Create `packages/shell/src/dockview-host/gcscode-tab.svelte`:

```svelte
<script lang="ts">
  import { DefaultTab } from 'dockview-svelte';
  import type { IDockviewPanelHeaderProps } from 'dockview-core';

  // Receive the full dockview tab-header props shape and forward everything
  // to DefaultTab plus hideClose={true}. Extensions own panel lifecycle in
  // gcscode; users do not close panels.
  let props: IDockviewPanelHeaderProps = $props();
</script>

<DefaultTab {...props} hideClose={true} />
```

- [ ] **Step 4: Run the test — expect pass**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/shell test gcscode-tab
```

Expected: both tests pass.

If the title-rendering test fails because of how DefaultTab reads its api (via `$effect` subscribing to `onDidTitleChange`), the test may need `flushSync()` after render — adjust the test to call `flushSync()` from `'svelte'` before the assertion. If it remains finicky, drop the title-rendering test (per the spec's "drop finicky tests" guidance) and keep only the close-button-absent assertion.

- [ ] **Step 5: Commit**

```bash
cd <worktree>/shell && git add packages/shell/src/dockview-host/gcscode-tab.svelte packages/shell/src/dockview-host/gcscode-tab.test.ts
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
feat(shell): add gcscode-tab — DefaultTab wrapper with hideClose=true

Used as defaultTabComponent on the shell's DockviewSvelte. Disables the
close affordance on every panel — extensions own panel lifecycle in
gcscode and users cannot dismiss extension-owned panels.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Wire DockviewSvelte into app.svelte + layout shell

This is the big change. `app.svelte` is rewritten to host views in a `DockviewSvelte` instance. `app.test.ts` is updated to assert tab presence rather than content-text presence. The shell becomes a flex column with proper height.

**Files:**
- Modify: `packages/shell/src/app.svelte` (major rewrite)
- Modify: `packages/shell/src/app.test.ts` (update view-related tests)
- Modify: `packages/shell/src/main.ts` (import dockview CSS)

- [ ] **Step 1: Update app.test.ts tests for view rendering**

The three tests that previously asserted on `mock-content` text need to change to assert on tab labels (since with dockview, only the active panel's content is in the DOM in a robust way, but tab labels are always present).

Open `packages/shell/src/app.test.ts`. Update the existing tests:

```ts
// Test: 'renders every registered view'
it('renders a dockview tab for every registered view', () => {
  const registry = createRegistry();
  registry.activate(
    makeExtension((ctx) => {
      ctx.host.window.registerView({
        id: 'test.view',
        component: MockContent,
        title: 'Test View',
      });
    }),
  );
  const manager = createExtensionManager(registry);

  render(App, { props: { registry, manager } });
  flushSync();

  // The dockview tab DOM uses .dv-default-tab-content for the label text.
  // Both DefaultTab and our GcscodeTab wrapper render the title under this
  // class.
  const tabLabel = screen.getByText('Test View');
  expect(tabLabel).toBeInTheDocument();
});

// Test: 'reflects post-mount view registration in the rendered UI'
it('reflects post-mount view registration as a new tab', () => {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  render(App, { props: { registry, manager } });
  expect(screen.getByTestId('empty-state')).toBeInTheDocument();

  registry.activate(
    makeExtension((ctx) => {
      ctx.host.window.registerView({
        id: 'late.view',
        component: MockContent,
        title: 'Late View',
      });
    }),
  );
  flushSync();

  expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  expect(screen.getByText('Late View')).toBeInTheDocument();
});

// Test: 'reflects post-mount view deactivation'
it('reflects post-mount view deactivation by removing the tab', async () => {
  const registry = createRegistry();
  registry.activate(
    makeExtension((ctx) => {
      ctx.subscriptions.push(
        ctx.host.window.registerView({
          id: 'test.view',
          component: MockContent,
          title: 'Deactivatable',
        }),
      );
    }),
  );
  const manager = createExtensionManager(registry);
  render(App, { props: { registry, manager } });
  flushSync();
  expect(screen.getByText('Deactivatable')).toBeInTheDocument();

  await registry.deactivate('test');
  flushSync();

  expect(screen.queryByText('Deactivatable')).not.toBeInTheDocument();
  expect(screen.getByTestId('empty-state')).toBeInTheDocument();
});
```

The other tests in the file (status-bar tests, quick-pick test, empty-state test) do not need changes — they target chrome that's unchanged.

- [ ] **Step 2: Run the tests — expect failure**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/shell test app
```

Expected: failures on the three updated tests (current app.svelte doesn't render tabs) and possibly type errors if `registerView` calls now require `title`. Other tests pass.

- [ ] **Step 3: Rewrite app.svelte**

Replace `packages/shell/src/app.svelte` contents with:

```svelte
<script lang="ts">
  import { DockviewSvelte, type DockviewApi, type DockviewReadyEvent } from 'dockview-svelte';
  import type { Registry } from './extension-host/registry';
  import type { ExtensionManager } from './extension-host/extension-manager';
  import QuickPickHost from './quick-pick/quick-pick-host.svelte';
  import ExtensionsPanelHost from './extensions-panel/extensions-panel-host.svelte';
  import ViewHost from './dockview-host/view-host.svelte';
  import GcscodeTab from './dockview-host/gcscode-tab.svelte';

  let { registry, manager }: { registry: Registry; manager: ExtensionManager } = $props();

  const views = $derived(registry.listViews());
  const statusBarItems = $derived(registry.listStatusBarItems());
  const leftStatus = $derived(statusBarItems.filter((i) => i.alignment === 'left'));
  const rightStatus = $derived(statusBarItems.filter((i) => i.alignment === 'right'));

  let dockviewApi: DockviewApi | undefined = $state(undefined);

  function handleReady(event: DockviewReadyEvent) {
    dockviewApi = event.api;
  }

  // Reconcile dockview's panel set against registry.listViews().
  // Add panels for newly-registered views; remove panels for unregistered ones;
  // update params when a same-id view changes its component reference (HMR /
  // extension re-activate).
  $effect(() => {
    if (!dockviewApi) return;
    const desired = new Map(views.map((v) => [v.id, v]));
    const current = new Map(dockviewApi.panels.map((p) => [p.id, p]));

    for (const [id, panel] of current) {
      if (!desired.has(id)) dockviewApi.removePanel(panel);
    }

    for (const [id, view] of desired) {
      const existing = current.get(id);
      if (!existing) {
        dockviewApi.addPanel({
          id,
          component: 'view-host',
          title: view.title,
          params: { component: view.component },
        });
      } else if ((existing.params as { component?: unknown } | undefined)?.component !== view.component) {
        existing.api.updateParameters({ component: view.component });
      }
    }
  });
</script>

<main class="shell flex h-screen flex-col">
  <header class="shell__header">GCScode</header>
  <section class="shell__content min-h-0 flex-1">
    {#if views.length === 0}
      <p data-testid="empty-state">No extensions registered.</p>
    {:else}
      <DockviewSvelte
        components={{ 'view-host': ViewHost }}
        defaultTabComponent={GcscodeTab}
        disableFloatingGroups={true}
        onReady={handleReady}
      />
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
  <QuickPickHost />
  <ExtensionsPanelHost {manager} />
</main>
```

Note: `defaultTabComponent` accepts a Svelte `Component` reference directly per `dockview-svelte`'s `IDockviewSvelteProps` shape — dockview-svelte registers it internally under a magic key (`props.defaultTabComponent`) and wires it into core's `createTabComponent`. No `tabComponents` map is required when only a default is needed. If the type signature complains, confirm by reading `packages/dockview-svelte/src/dockview/types.ts`.

- [ ] **Step 4: Import dockview CSS in main.ts**

Open `packages/shell/src/main.ts`. Add the dockview CSS import near the existing imports:

```ts
import 'dockview-core/dist/styles/dockview.css';
```

Place it before any app-specific imports so dockview's defaults apply first.

- [ ] **Step 5: Run the tests — expect pass**

```bash
cd <worktree>/shell && pnpm --filter @gcscode/shell test
```

Expected: all shell tests pass.

If any of the new tab-text assertions fail because dockview hasn't rendered tabs synchronously yet, add a brief `await new Promise((r) => setTimeout(r, 0))` or a `flushSync()` retry. If it remains genuinely finicky after one such adjustment, document the dropped test in a code comment (`// Dropped due to dockview render timing — see manual smoke checklist item N`) and proceed. Do not block the iteration on a finicky test.

- [ ] **Step 6: Verify the full suite + type-check + lint + build**

```bash
cd <worktree>/shell && pnpm test
cd <worktree>/shell && pnpm check
cd <worktree>/shell && pnpm lint
cd <worktree>/shell && pnpm build
```

Expected: all clean.

- [ ] **Step 7: Commit**

```bash
cd <worktree>/shell && git branch --show-current
# Expect: feat/shell-dockview-host
cd <worktree>/shell && git add packages/shell/src/app.svelte packages/shell/src/app.test.ts packages/shell/src/main.ts
cd <worktree>/shell && git commit -m "$(cat <<'EOF'
feat(shell): replace view-stack with DockviewSvelte content host

- app.svelte hosts views in DockviewSvelte (single tabbed group seed).
- ViewHost panel-component renders the per-view Svelte Component via
  params.component; GcscodeTab is the default tab (no close button).
- disableFloatingGroups suppresses popout panels.
- $effect reconciles dockview panels against registry.listViews() —
  initial seed + post-mount registration + deactivation.
- Layout shell: <main> is a viewport-height flex column so the dockview
  container sizes correctly; min-h-0 on the content section is
  load-bearing for the inner flex math.
- app.test.ts updated to assert on tab titles instead of mounted-component
  text (only active panel content reliably appears in the DOM).
- main.ts imports dockview-core's default CSS.

Per docs/specs/2026-05-13-shell-dockview-host.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Manual smoke checklist

Per the spec, this iteration explicitly accepts that some testing happens manually. Run through this checklist with the dev server live; record results in the controller's chat (as a numbered list of "pass" / "fail / note") for the final review's reference.

- [ ] **Step 1: Boot the dev server**

```bash
cd <worktree>/shell && pnpm dev
```

Open the printed URL in a browser.

- [ ] **Step 2: Walk the checklist**

1. The shell loads without console errors.
2. Four tabs visible: `Example`, `SITL`, `Map (demo)`, `Map`.
3. Click each tab; the active panel switches. No console errors per switch.
4. Drag a tab onto another tab's group — dragged tab joins. Drag a tab to a group edge — a new group is created.
5. Drag a splitter between groups — groups resize.
6. Tabs have no close button. Pressing Ctrl+W (browser-level) does NOT close panels.
7. No "pop out" / floating-window affordance. No shift+drag popout. No context-menu "Move to new window".
8. Refresh the page — layout returns to default single tabbed group with all four tabs. (Confirms persistence is NOT happening — refresh-as-reset is desired.)
9. Open extensions panel (Ctrl+Shift+X), disable each view-registering extension one by one. Tabs disappear as each is disabled. When all four are disabled, the empty-state `<p>No extensions registered.</p>` appears.
10. Re-enable extensions. Tabs reappear.

- [ ] **Step 3: Stop the dev server**

Ctrl+C in the terminal.

- [ ] **Step 4: Report results**

In the controller chat, summarize each item as "pass" or "fail / note". Failing items: if trivially fixable (e.g. typo, missing import), open a fix in the worktree, add a `Code-review-followup:` commit, and re-run that checklist item. If non-trivial, stop and surface to the controller for a scope-vs-defer decision.

(No commit produced by this task on its own.)

---

## Task 8: Final cross-cutting review, local merge, push

The subagent-driven-development pattern runs a final cross-cutting review over the full branch diff before merging. Per the workflow override, the reviewer returns its summary to the controller in-session — no GitHub PR posting.

- [ ] **Step 1: Run the final cross-cutting code review**

Per CLAUDE.md's "Subagent-driven plan execution" section, dispatch the final cross-cutting reviewer at this point. The reviewer reads the spec, reads the full branch diff, and returns a verdict + notes.

If the reviewer flags blocking issues, address each in a separate `Code-review-followup:` commit (NOT an amend) on the same branch, then re-dispatch the same reviewer.

- [ ] **Step 2: Final pre-merge verification**

```bash
cd <worktree>/shell && pnpm test
cd <worktree>/shell && pnpm check
cd <worktree>/shell && pnpm lint
cd <worktree>/shell && pnpm build
```

Expected: all clean.

- [ ] **Step 3: Local merge to master**

From the main checkout (not the worktree):

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && git checkout master
cd /Users/kevinkroon/Projects/gcscode/shell && git pull origin master
cd /Users/kevinkroon/Projects/gcscode/shell && git merge --no-ff feat/shell-dockview-host -m "$(cat <<'EOF'
Merge branch 'feat/shell-dockview-host'

UI iteration: replace app.svelte view-stack with DockviewSvelte content
host. Adds required ViewContribution.title; constrained config (no close,
no popout, drag-drop + splitters kept). Refresh-as-reset replaces layout
persistence.

Per docs/specs/2026-05-13-shell-dockview-host.md.
Per docs/plans/2026-05-13-shell-dockview-host.md.

Workflow note: this iteration explicitly used the pre-PR local-merge
workflow per the spec's override. The new reviews-as-artifacts PR
workflow is validated in a separate later iteration.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push to origin**

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && git push origin master
```

Expected: success.

- [ ] **Step 5: Worktree cleanup (optional, controller's call)**

The worktree can be removed once master has the merge:

```bash
cd /Users/kevinkroon/Projects/gcscode && git worktree remove .worktrees/feat-shell-dockview-host
cd /Users/kevinkroon/Projects/gcscode && git branch -d feat/shell-dockview-host
```

(`git worktree remove` requires the worktree to have a clean working tree.)

---

## Spec coverage check

Each spec section maps to plan tasks:

| Spec section | Plan task(s) |
|---|---|
| Implementation workflow override | "Workflow override for this iteration — READ FIRST" header; Task 8 (local merge instead of PR merge) |
| Goals — replace view stack with DockviewSvelte | Task 6 |
| Goals — add `title: string` to `ViewContribution` | Task 2 + Task 3a-d |
| Goals — disable close + floating | Task 5 (no-close tab) + Task 6 (`disableFloatingGroups={true}`) |
| Goals — layout shell | Task 6 (Step 3, `<main class="shell flex h-screen flex-col">`) |
| Goals — preserve empty state | Task 6 (Step 3, `{#if views.length === 0}` branch) |
| Goals — preserve other chrome | Task 6 (Step 3, unchanged status-bar / QuickPickHost / ExtensionsPanelHost) |
| Architecture — view-host indirection | Task 4 |
| Architecture — reactive sync via `$effect` | Task 6 (Step 3) |
| Architecture — custom tab component | Task 5 |
| Testing — high-value behavior tests | Task 4 (view-host), Task 5 (no-close), Task 6 (tab registration / reconciliation / empty state) |
| Testing — manual smoke checklist | Task 7 |
| Non-goals (persistence, theming, view containers, etc.) | No tasks — explicitly not built |

No spec requirement is uncovered by tasks.
