# Phase A1 — Status bar item contribution implementation plan

_Note: The term "plugin" was renamed to "extension" in [ADR-0004](../decisions/ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a status bar item contribution kind to the plugin architecture: plugins can register a Svelte component aligned to the left or right side of a footer status bar.

**Architecture:** Mirror the existing view-contribution machinery. Add `StatusBarItemContribution` and `registerStatusBarItem` to the `@gcscode/plugin-api` interface. Add a parallel `Map<string, StatusBarItemContribution>` and `listStatusBarItems()` to the registry, with the same dispose-on-unregister semantics. Render a footer in `app.svelte` with two derived groups (left, right), filtered from the registry's insertion-ordered list. No `priority` field — ordering follows registration order.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, Testing Library, pnpm workspaces, Vite, Tailwind v4 (utility classes only, no theme yet).

**Spec:** `docs/specs/2026-04-26-phase-a1-status-bar.md`

---

## File structure

| Path                                                | Responsibility                                                             |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/plugin-api/src/index.ts`                  | Add `StatusBarItemContribution`, extend `PluginHost`.                      |
| `packages/shell/src/plugin-host/registry.ts`        | Add status-bar-items Map and `registerStatusBarItem`/`listStatusBarItems`. |
| `packages/shell/src/plugin-host/registry.test.ts`   | Tests for the new surface.                                                 |
| `packages/shell/src/app.svelte`                     | Render the footer with derived left/right groups.                          |
| `packages/shell/src/app.test.ts`                    | Tests for footer rendering, alignment, registration order.                 |
| `packages/plugin-example/src/example-status.svelte` | New — minimal status bar component.                                        |
| `packages/plugin-example/src/index.ts`              | Register both view and status bar item.                                    |
| `packages/plugin-example/src/index.test.ts`         | Update contract test for the second registration.                          |
| `packages/plugin-api/README.md`                     | Snippet update.                                                            |
| `packages/plugin-example/README.md`                 | Snippet update.                                                            |

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 12 tests pass across `@gcscode/plugin-example` (2) and `@gcscode/shell` (10).

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Add `StatusBarItemContribution` type and registry contract (TDD)

**Files:**

- Modify: `packages/plugin-api/src/index.ts`
- Modify: `packages/shell/src/plugin-host/registry.ts`
- Modify: `packages/shell/src/plugin-host/registry.test.ts`

- [ ] **Step 1: Write the failing tests for status bar items in `registry.test.ts`**

Append to the existing `describe('createRegistry', () => { ... })` block, just before the closing `});`:

```ts
it('starts with no status bar items', () => {
  const registry = createRegistry();
  expect(registry.listStatusBarItems()).toHaveLength(0);
});

it('records status bar items registered through host.registerStatusBarItem', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerStatusBarItem({
        id: 'plugin.a.status',
        component: fakeComponent,
        alignment: 'right',
      });
    }),
  );
  expect(registry.listStatusBarItems()).toEqual([
    { id: 'plugin.a.status', component: fakeComponent, alignment: 'right' },
  ]);
});

it('returns a disposable from registerStatusBarItem that removes the item', () => {
  const registry = createRegistry();
  let disposable: Disposable | undefined;
  registry.activate(
    plugin('plugin.a', (ctx) => {
      disposable = ctx.host.registerStatusBarItem({
        id: 'plugin.a.status',
        component: fakeComponent,
        alignment: 'left',
      });
    }),
  );
  expect(registry.listStatusBarItems()).toHaveLength(1);
  disposable!.dispose();
  expect(registry.listStatusBarItems()).toHaveLength(0);
});

it('throws when two plugins register the same status bar item id', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerStatusBarItem({
        id: 'shared',
        component: fakeComponent,
        alignment: 'left',
      });
    }),
  );
  expect(() =>
    registry.activate(
      plugin('plugin.b', (ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'shared',
          component: fakeComponent,
          alignment: 'right',
        });
      }),
    ),
  ).toThrow(/shared/);
});

it('allows the same id across kinds (view and status bar item namespaces are separate)', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerView({ id: 'shared', component: fakeComponent });
      ctx.host.registerStatusBarItem({
        id: 'shared',
        component: fakeComponent,
        alignment: 'left',
      });
    }),
  );
  expect(registry.listViews()).toHaveLength(1);
  expect(registry.listStatusBarItems()).toHaveLength(1);
});

it('preserves registration order in listStatusBarItems', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerStatusBarItem({
        id: 'plugin.a.first',
        component: fakeComponent,
        alignment: 'left',
      });
      ctx.host.registerStatusBarItem({
        id: 'plugin.a.second',
        component: fakeComponent,
        alignment: 'left',
      });
    }),
  );
  expect(registry.listStatusBarItems().map((i) => i.id)).toEqual([
    'plugin.a.first',
    'plugin.a.second',
  ]);
});
```

- [ ] **Step 2: Run the test file — expect failures**

Run: `pnpm --filter @gcscode/shell test`
Expected: TypeScript errors. `Property 'registerStatusBarItem' does not exist on type 'PluginHost'`. `Property 'listStatusBarItems' does not exist on type 'Registry'`. The test runner does not even start.

- [ ] **Step 3: Add `StatusBarItemContribution` and the host method to `@gcscode/plugin-api`**

In `packages/plugin-api/src/index.ts`, after the `ViewContribution` interface, insert:

```ts
/**
 * A status bar item contribution renders a Svelte component into one side of
 * the shell's footer status bar. `id` is a stable identifier (usually
 * `<plugin-id>.<local-name>`) used for diagnostics, lookups, and disposal.
 * `alignment` decides which side of the bar the item sits on; ordering within
 * a side follows registration order.
 */
export interface StatusBarItemContribution {
  id: string;
  component: Component;
  alignment: 'left' | 'right';
}
```

Then update the `PluginHost` interface to add the new method:

```ts
export interface PluginHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
}
```

- [ ] **Step 4: Implement registration and listing in the registry**

In `packages/shell/src/plugin-host/registry.ts`, update the imports:

```ts
import type {
  Disposable,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/plugin-api';
```

Update the `Registry` interface:

```ts
export interface Registry {
  activate(plugin: Plugin): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
}
```

Inside `createRegistry`, add a parallel store next to `views`:

```ts
const views = new Map<string, ViewContribution>();
const statusBarItems = new Map<string, StatusBarItemContribution>();
```

Inside the `createHost(plugin)` factory, add the new method after `registerView`:

```ts
      registerStatusBarItem(item) {
        if (statusBarItems.has(item.id)) {
          throw new Error(
            `Status bar item id "${item.id}" is already registered (attempted by plugin "${plugin.id}").`,
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
```

In the returned registry object, add the list method after `listViews`:

```ts
    listStatusBarItems() {
      return Array.from(statusBarItems.values());
    },
```

- [ ] **Step 5: Run the tests — expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: all 16 tests pass (10 existing + 6 new).

- [ ] **Step 6: Run check across the workspace**

Run: `pnpm check`
Expected: clean across `@gcscode/plugin-api`, `@gcscode/plugin-example`, `@gcscode/shell`.

- [ ] **Step 7: Run lint and format**

Run: `pnpm lint`
Expected: clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 8: Commit**

```bash
git add packages/plugin-api/src/index.ts packages/shell/src/plugin-host/registry.ts packages/shell/src/plugin-host/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(plugins): add StatusBarItemContribution and registerStatusBarItem

Parallel to registerView: a per-kind register* method on PluginHost that
returns a Disposable, with a Map-backed registry keyed by id. Duplicate
ids throw; dispose() is idempotent and removes only its own registration.
View ids and status-bar ids live in separate namespaces.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Render the footer in `app.svelte` (TDD)

**Files:**

- Modify: `packages/shell/src/app.svelte`
- Modify: `packages/shell/src/app.test.ts`

- [ ] **Step 1: Write failing tests in `app.test.ts`**

Replace the contents of `packages/shell/src/app.test.ts` with:

```ts
import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import type { Plugin } from '@gcscode/plugin-api';

import { createRegistry } from './plugin-host/registry';
import App from './app.svelte';
import MockContent from './__fixtures__/mock-content.svelte';
import MockLeft from './__fixtures__/mock-left.svelte';
import MockRight from './__fixtures__/mock-right.svelte';

function makePlugin(activate: Plugin['activate']): Plugin {
  return {
    id: 'test',
    displayName: 'Test',
    version: '0.0.0',
    activate,
  };
}

describe('app.svelte', () => {
  it('shows the empty state when no plugins are registered', () => {
    const registry = createRegistry();
    render(App, { props: { registry } });
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders every registered view', () => {
    const registry = createRegistry();
    registry.activate(
      makePlugin((ctx) => {
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
      makePlugin((ctx) => {
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
      makePlugin((ctx) => {
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
    const texts = Array.from(left.querySelectorAll('p, span')).map((el) => el.textContent);
    expect(texts).toEqual(['mock-left', 'mock-right']);
  });
});
```

- [ ] **Step 2: Create the new test fixtures**

Create `packages/shell/src/__fixtures__/mock-left.svelte`:

```svelte
<p>mock-left</p>
```

Create `packages/shell/src/__fixtures__/mock-right.svelte`:

```svelte
<p>mock-right</p>
```

- [ ] **Step 3: Run the tests — expect failures**

Run: `pnpm --filter @gcscode/shell test src/app.test.ts`
Expected: failures on the new tests (no `data-testid="statusbar"` element, no `statusbar-left`/`statusbar-right` regions).

- [ ] **Step 4: Update `app.svelte` to render the footer**

Replace the contents of `packages/shell/src/app.svelte` with:

```svelte
<script lang="ts">
  import type { Registry } from './plugin-host/registry';

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
      <p data-testid="empty-state">No plugins registered.</p>
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

- [ ] **Step 5: Verify the Svelte file with the autofixer**

Use the Svelte MCP `svelte-autofixer` tool against the new `app.svelte` content (Svelte 5). Iterate on any reported issues until it returns no issues and no suggestions.

- [ ] **Step 6: Run the tests — expect pass**

Run: `pnpm --filter @gcscode/shell test src/app.test.ts`
Expected: all five tests in `app.test.ts` pass.

- [ ] **Step 7: Run the full shell test suite + check + lint**

Run: `pnpm --filter @gcscode/shell test && pnpm check && pnpm lint`
Expected: all pass. If Prettier complains, run `pnpm format` then re-run.

- [ ] **Step 8: Commit**

```bash
git add packages/shell/src/app.svelte packages/shell/src/app.test.ts packages/shell/src/__fixtures__/mock-left.svelte packages/shell/src/__fixtures__/mock-right.svelte
git commit -m "$(cat <<'EOF'
feat(shell): render footer status bar with derived left/right groups

Footer is always present (data-testid=\"statusbar\"); two side regions
populate from the registry's insertion-ordered listStatusBarItems(),
filtered by alignment. Minimal Tailwind for flex layout; decoration
deferred.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Grow `examplePlugin` to register a status bar item (TDD)

**Files:**

- Create: `packages/plugin-example/src/example-status.svelte`
- Modify: `packages/plugin-example/src/index.ts`
- Modify: `packages/plugin-example/src/index.test.ts`

- [ ] **Step 1: Update the contract test in `index.test.ts`**

Replace the contents of `packages/plugin-example/src/index.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@gcscode/plugin-api';

import { examplePlugin } from './index';
import ExampleView from './example-view.svelte';
import ExampleStatus from './example-status.svelte';

describe('examplePlugin', () => {
  it('declares stable identity metadata', () => {
    expect(examplePlugin.id).toBe('gcscode.example');
    expect(examplePlugin.displayName).toBe('Example Plugin');
    expect(typeof examplePlugin.version).toBe('string');
  });

  it('registers a view, a status bar item, and pushes both disposables', () => {
    const viewDisposable = { dispose: vi.fn() };
    const statusDisposable = { dispose: vi.fn() };
    const registerView = vi.fn().mockReturnValue(viewDisposable);
    const registerStatusBarItem = vi.fn().mockReturnValue(statusDisposable);
    const subscriptions: PluginContext['subscriptions'] = [];

    examplePlugin.activate({
      host: { registerView, registerStatusBarItem },
      subscriptions,
      plugin: {
        id: examplePlugin.id,
        displayName: examplePlugin.displayName,
        version: examplePlugin.version,
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
    expect(subscriptions).toEqual([viewDisposable, statusDisposable]);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm --filter @gcscode/plugin-example test`
Expected: TypeScript error (cannot find `./example-status.svelte`); the runner does not start.

- [ ] **Step 3: Create the new status component**

Create `packages/plugin-example/src/example-status.svelte`:

```svelte
<span>Example</span>
```

- [ ] **Step 4: Verify the new component with the autofixer**

Use the Svelte MCP `svelte-autofixer` tool against the new `example-status.svelte` content (Svelte 5). It should report no issues.

- [ ] **Step 5: Update `examplePlugin` to register both contributions**

Replace the contents of `packages/plugin-example/src/index.ts` with:

```ts
import type { Plugin } from '@gcscode/plugin-api';

import ExampleStatus from './example-status.svelte';
import ExampleView from './example-view.svelte';

export const examplePlugin: Plugin = {
  id: 'gcscode.example',
  displayName: 'Example Plugin',
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
    );
  },
};
```

- [ ] **Step 6: Run the test — expect pass**

Run: `pnpm --filter @gcscode/plugin-example test`
Expected: both tests pass.

- [ ] **Step 7: Run check + lint across the workspace**

Run: `pnpm check && pnpm lint`
Expected: clean. If Prettier complains, run `pnpm format` then re-run.

- [ ] **Step 8: Commit**

```bash
git add packages/plugin-example/src/index.ts packages/plugin-example/src/index.test.ts packages/plugin-example/src/example-status.svelte
git commit -m "$(cat <<'EOF'
feat(plugin-example): register a right-aligned status bar item

examplePlugin now contributes both a view (existing) and a tiny
status bar item (new ExampleStatus component) on the right side.
Pushes both disposables onto context.subscriptions.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update plugin author docs (READMEs)

**Files:**

- Modify: `packages/plugin-api/README.md`
- Modify: `packages/plugin-example/README.md`

- [ ] **Step 1: Update the snippet in `packages/plugin-api/README.md`**

Replace the `## Usage` code block with:

````md
## Usage

```ts
import type { Plugin } from '@gcscode/plugin-api';
import View from './view.svelte';
import StatusBadge from './status-badge.svelte';

export const myPlugin: Plugin = {
  id: 'my-namespace.my-plugin',
  displayName: 'My Plugin',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'my-namespace.my-plugin.main',
        component: View,
      }),
      context.host.registerStatusBarItem({
        id: 'my-namespace.my-plugin.status',
        component: StatusBadge,
        alignment: 'right',
      }),
    );
  },
};
```
````

In the same file, update the `## The activation context` bullet for `host` to reflect the second method:

```md
- **`context.host`** — the per-plugin gate. Exposes one `register*` method per contribution kind (today: `registerView`, `registerStatusBarItem`). Each call returns a `Disposable`.
```

- [ ] **Step 2: Update `packages/plugin-example/README.md`**

Replace the `## What it demonstrates` and `## Anatomy` sections with the block below:

````md
## What it demonstrates

- A plugin lives in its own workspace package.
- Its only dependency on the host app is `@gcscode/plugin-api`.
- It exports a named `const` (`examplePlugin`) of type `Plugin` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
- Inside `activate`, it calls both `context.host.registerView` and `context.host.registerStatusBarItem`, then pushes both returned `Disposable`s onto `context.subscriptions` — demonstrating multi-surface contributions from a single plugin.

## Anatomy

```
src/
  index.ts              - exports examplePlugin: Plugin (identity + activate(context))
  example-view.svelte   - the contributed main-content fragment
  example-status.svelte - the contributed status bar fragment
```

To write your own plugin, copy this package, change the exported constant name (`examplePlugin` → `yourPlugin`) and identity fields, rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.
````

- [ ] **Step 3: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/plugin-api/README.md packages/plugin-example/README.md
git commit -m "$(cat <<'EOF'
docs: refresh plugin READMEs to show registerStatusBarItem

Both the @gcscode/plugin-api usage snippet and the plugin-example
description now mention the second contribution kind.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. The shell suite reports 16 tests passing; the plugin-example suite reports 2 tests passing.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev` (in the background)
Expected: Vite reports `Local: http://localhost:5173/`.

- [ ] **Step 3: Verify in a browser**

Open `http://localhost:5173/` in a browser (or via the chrome-devtools-mcp `new_page` tool). Confirm:

- The header reads `GCScode`.
- The example view (`<h2>Example Plugin</h2>` + paragraph) renders in the content area.
- A footer is visible at the bottom of the viewport with `Example` text aligned to the right side.
- The browser console has no errors.

If the browser is unavailable in the agent environment, fall back to: `curl -s http://localhost:5173/` and confirm the HTML response loads cleanly. The integration tests in `app.test.ts` already cover the rendering paths — manual browser verification is to catch only layout regressions, which would not show up in the test suite.

- [ ] **Step 4: Stop the dev server**

Stop the background `pnpm dev` process.

- [ ] **Step 5: Confirm the working tree is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean` and the branch contains exactly four new commits (Task 2, Task 3, Task 4, Task 5).

---

## Out of scope reminders

These are intentionally NOT part of A1 (see the spec):

- Numeric `priority` field — registration order is the rule.
- `command`, `tooltip`, or any non-component fields on `StatusBarItemContribution`.
- Decorative styling beyond minimal flex layout.
- `executeCommand` or any way to fire actions from the bar (deferred to A2).

If a step tempts you toward any of those, stop and re-read the spec.
