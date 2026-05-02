# Extensions panel — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a centered overlay extensions panel opened by `Ctrl+Shift+X` or via the command palette. Lists bundled extensions (workbench filtered out) with displayName, version, description, and a single Enable/Disable button per row; first marketplace UI consumer of `Extension.manifest.description`.

**Architecture:** Hard break against the existing modal overlay pattern. Mirrors `quick-pick/`'s structure (`extensions-panel-state.svelte.ts` singleton + `extensions-panel.svelte` component + `extensions-panel-host.svelte` mount gate). Workbench gains one new command (`workbench.extensions.action.showInstalledExtensions`) and one new keybinding (`Ctrl+Shift+X`); workbench factory signature is unchanged. Panel reads `ExtensionManager` via the App's prop chain (main.ts → App → ExtensionsPanelHost).

**Tech Stack:** TypeScript, Svelte 5 (`$state` / `$derived` / `$effect`), Vitest + `@testing-library/svelte` for component tests, `svelte/reactivity` `SvelteMap` (already used by the registry/manager), `Fuse.js` for search (already used by the palette), Tailwind for styling.

**Spec:** [`docs/specs/2026-05-02-extensions-panel.md`](../specs/2026-05-02-extensions-panel.md)

**No ADR.** All decisions extend established patterns.

---

## Important — every commit on this branch is green

Unlike the manifest iteration's hard-break refactor, this iteration's four feat commits each leave the workspace passing `pnpm check` + `pnpm test` + `pnpm lint`. There are no intermediate non-green states.

| After commit                                              | Workspace state                                                                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: scaffold (state + panel + host + tests)                | Green. New files self-consistently import from each other and existing modules. New tests cover the new code. App doesn't yet mount the host or fire the command. |
| 2: workbench (command + keybinding + description + tests) | Green. Command + keybinding registered; running the command via `registry.executeCommand(...)` opens the panel state. App still doesn't mount the host.           |
| 3: app + main wiring (manager prop + host mount)          | Green. Panel works end-to-end at runtime. **Smoke test runs at this commit.**                                                                                     |
| 4: doc propagation (roadmap, ledger, out-of-scope)        | Green. Docs only.                                                                                                                                                 |

---

## File structure

| Path                                                                   | Responsibility                                                                                                                                               |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shell/src/extensions-panel/extensions-panel-state.svelte.ts` | Singleton state with `isOpen`, `open()`, `close()`, dual guard (already-open + modalState.active). (Task 2.)                                                 |
| `packages/shell/src/extensions-panel/extensions-panel-state.test.ts`   | 6 state tests. (Task 2.)                                                                                                                                     |
| `packages/shell/src/extensions-panel/extensions-panel.svelte`          | Rendering component. Search input + filtered list + per-row Enable/Disable buttons + keyboard nav. Receives `manager: ExtensionManager` as a prop. (Task 2.) |
| `packages/shell/src/extensions-panel/extensions-panel.test.ts`         | 11 component tests. (Task 2.)                                                                                                                                |
| `packages/shell/src/extensions-panel/extensions-panel-host.svelte`     | Mount gate + click-outside-to-dismiss + `modalState.active` mirror. (Task 2.)                                                                                |
| `packages/shell/src/extensions-panel/extensions-panel-host.test.ts`    | 5 host tests. (Task 2.)                                                                                                                                      |
| `packages/shell/src/built-in/workbench/index.ts`                       | Manifest description updated; new command + keybinding registered inside `activate`. (Task 3.)                                                               |
| `packages/shell/src/built-in/workbench/index.test.ts`                  | Existing description assertion updated; 4 new tests. (Task 3.)                                                                                               |
| `packages/shell/src/app.svelte`                                        | New `manager` prop alongside `registry`; mount `<ExtensionsPanelHost {manager} />`. (Task 4.)                                                                |
| `packages/shell/src/app.test.ts`                                       | Pass `manager` prop in test setup. (Task 4.)                                                                                                                 |
| `packages/shell/src/main.ts`                                           | Pass `manager` as prop to `App`. (Task 4.)                                                                                                                   |
| `docs/roadmap.md`                                                      | New B6 line; new "Sidebar / activity-bar chrome" Considering line. (Task 5.)                                                                                 |
| `docs/vs-code-alignment.md`                                            | Two new Alignments rows; one new Divergences row. (Task 5.)                                                                                                  |
| `docs/out-of-scope.md`                                                 | New "Programmatic extension enable/disable API" entry. (Task 5.)                                                                                             |

---

### Task 1: Establish green baseline + create feature branch

**Files:** none (verification + branch creation)

- [ ] **Step 1: Verify on master with clean working tree**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `master`.

- [ ] **Step 2: Verify lint, check, test all clean at baseline**

Run: `pnpm lint && pnpm check && pnpm test`
Expected: all three pass. Per-package counts: shell 150, extension-sitl 28, extension-example 3, extension-vehicle-status 3 (total 184). Note these for comparison.

- [ ] **Step 3: Set up worktree on feature branch**

Run: `git worktree add .worktrees/feat-extensions-panel -b feat/extensions-panel`
Expected: worktree created. The implementer subagents will work inside `<worktree>/shell/`.

- [ ] **Step 4: Install deps in the worktree**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm install`
Expected: `Done` with no errors.

- [ ] **Step 5: Verify clean baseline in worktree**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm lint && pnpm check && pnpm test 2>&1 | tail -20`
Expected: all clean. Same 184-test baseline.

---

### Task 2: Scaffold extensions-panel state + components (commit 1)

**Files:**

- Create: `packages/shell/src/extensions-panel/extensions-panel-state.svelte.ts`
- Create: `packages/shell/src/extensions-panel/extensions-panel-state.test.ts`
- Create: `packages/shell/src/extensions-panel/extensions-panel.svelte`
- Create: `packages/shell/src/extensions-panel/extensions-panel.test.ts`
- Create: `packages/shell/src/extensions-panel/extensions-panel-host.svelte`
- Create: `packages/shell/src/extensions-panel/extensions-panel-host.test.ts`

This task adds the entire `extensions-panel/` directory. Six files. After this commit, the panel can be opened by calling `extensionsPanelState.open()` from anywhere — but no command fires that yet (Task 3) and no host is mounted in `App` (Task 4), so the panel doesn't appear at runtime yet.

**Substep ordering:** state first (other files import from it), then component (host imports it), then host. Each source file is followed immediately by its test file — TDD-adjacent: write the implementation, write the tests against it, verify all pass before continuing.

#### Sub-section A: extensions-panel-state.svelte.ts + tests

- [ ] **Step 1: Create `packages/shell/src/extensions-panel/extensions-panel-state.svelte.ts`**

Mirror `quick-pick/quick-pick-state.svelte.ts`'s shape. Full content:

```ts
import { modalState } from '../modal-state.svelte';

/**
 * Owns the extensions-panel's open/closed state. At most one panel is open
 * at a time, AND the panel cannot open while any other modal overlay (the
 * quick pick) is open. Both guards mirror the existing quickPickState
 * pattern but with a simpler shape — the panel is a sustained interaction
 * surface, not a request-response, so there's no resolve callback.
 *
 * `open()` throws if already open OR if `modalState.active` is true (the
 * quick pick is open). `close()` is a no-op when nothing is open, making
 * it safe to call from event handlers that may race (Esc + click-outside +
 * re-pressed Ctrl+Shift+X all firing in close succession).
 */
class ExtensionsPanelState {
  private _isOpen = $state(false);

  public get isOpen(): boolean {
    return this._isOpen;
  }

  public open(): void {
    if (this._isOpen) {
      throw new Error('Extensions panel already open');
    }
    if (modalState.active) {
      throw new Error('Another modal overlay is open');
    }
    this._isOpen = true;
  }

  public close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
  }
}

export const extensionsPanelState = new ExtensionsPanelState();
```

- [ ] **Step 2: Create `packages/shell/src/extensions-panel/extensions-panel-state.test.ts`**

Full content:

```ts
import { afterEach, describe, expect, it } from 'vitest';

import { modalState } from '../modal-state.svelte';
import { extensionsPanelState } from './extensions-panel-state.svelte';

describe('extensionsPanelState', () => {
  afterEach(() => {
    extensionsPanelState.close();
    modalState.active = false;
  });

  it('is closed by default', () => {
    expect(extensionsPanelState.isOpen).toBe(false);
  });

  it('open() flips isOpen to true', () => {
    extensionsPanelState.open();
    expect(extensionsPanelState.isOpen).toBe(true);
  });

  it('close() flips isOpen to false', () => {
    extensionsPanelState.open();
    extensionsPanelState.close();
    expect(extensionsPanelState.isOpen).toBe(false);
  });

  it('open() while already open throws "Extensions panel already open"', () => {
    extensionsPanelState.open();
    expect(() => extensionsPanelState.open()).toThrow('Extensions panel already open');
  });

  it('open() while modalState.active is true throws "Another modal overlay is open"', () => {
    modalState.active = true;
    expect(() => extensionsPanelState.open()).toThrow('Another modal overlay is open');
  });

  it('close() while not open is a no-op', () => {
    expect(() => extensionsPanelState.close()).not.toThrow();
    expect(extensionsPanelState.isOpen).toBe(false);
  });
});
```

- [ ] **Step 3: Verify state tests pass**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm --filter @gcscode/shell test extensions-panel-state 2>&1 | tail -10`
Expected: 6 tests pass.

#### Sub-section B: extensions-panel.svelte + tests

- [ ] **Step 4: Create `packages/shell/src/extensions-panel/extensions-panel.svelte`**

Full content:

```svelte
<script lang="ts">
  import Fuse from 'fuse.js';

  import type { ExtensionManager, ExtensionRecord } from '../extension-host/extension-manager';
  import { extensionsPanelState } from './extensions-panel-state.svelte';

  let { manager }: { manager: ExtensionManager } = $props();

  let query = $state('');
  let highlightIndex = $state(0);

  // Filter out the workbench (system extension; cannot be sensibly disabled —
  // disabling would lock the operator out of Ctrl+Shift+P + Ctrl+Shift+X).
  const records = $derived(manager.listExtensions().filter((r) => r.manifest.id !== 'workbench'));

  const fuse = $derived(
    new Fuse(records, {
      keys: ['manifest.displayName', 'manifest.description'],
      threshold: 0.4,
      ignoreLocation: true,
    }),
  );

  // Filtered + sorted list. Empty query → alphabetical by displayName. Non-empty
  // query → Fuse score order. Mirrors the palette's filter behavior.
  const filtered = $derived.by(() => {
    if (query.trim() === '') {
      return [...records].sort((a, b) =>
        a.manifest.displayName.localeCompare(b.manifest.displayName),
      );
    }
    return fuse.search(query).map((r) => r.item);
  });

  // Reset highlight when the filtered list changes (e.g. user types).
  $effect(() => {
    void filtered;
    highlightIndex = 0;
  });

  function toggle(record: ExtensionRecord) {
    void manager.setEnabled(record.manifest.id, !record.enabled);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      const item = filtered[highlightIndex];
      if (item !== undefined) toggle(item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      extensionsPanelState.close();
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

  function onButtonClick(event: MouseEvent, record: ExtensionRecord) {
    event.stopPropagation();
    toggle(record);
  }
</script>

<div
  class="fixed left-1/2 top-16 z-50 w-[520px] -translate-x-1/2 overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 shadow-2xl"
  role="dialog"
  aria-label="Extensions"
>
  <div
    class="border-b border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs uppercase tracking-wider text-neutral-400"
  >
    Extensions
  </div>
  {#if records.length === 0}
    <div class="px-3 py-6 text-center text-sm text-neutral-400">No extensions installed.</div>
  {:else}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      type="text"
      bind:value={query}
      onkeydown={onKeyDown}
      placeholder="Search extensions…"
      class="w-full border-none bg-neutral-700 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-400"
      autofocus
    />
    {#if filtered.length === 0}
      <div class="px-3 py-4 text-center text-sm text-neutral-400">No matching extensions.</div>
    {:else}
      <ul class="max-h-96 overflow-y-auto">
        {#each filtered as record, i (record.manifest.id)}
          <li
            class="border-b border-neutral-700 last:border-b-0"
            class:opacity-60={!record.enabled}
            class:bg-blue-900={i === highlightIndex}
          >
            <div
              class="flex items-start gap-3 px-3 py-2.5"
              role="presentation"
              onmouseenter={() => (highlightIndex = i)}
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline gap-2">
                  <strong class="text-sm text-neutral-100">{record.manifest.displayName}</strong>
                  <span class="text-xs text-neutral-400">v{record.manifest.version}</span>
                </div>
                {#if record.manifest.description}
                  <div class="mt-0.5 text-xs text-neutral-300">{record.manifest.description}</div>
                {/if}
              </div>
              {#if record.enabled}
                <button
                  type="button"
                  class="flex-shrink-0 rounded border border-neutral-500 bg-neutral-700 px-3 py-1 text-xs text-neutral-200"
                  onclick={(event) => onButtonClick(event, record)}
                >
                  Disable
                </button>
              {:else}
                <button
                  type="button"
                  class="flex-shrink-0 rounded border border-blue-600 bg-blue-700 px-3 py-1 text-xs text-white"
                  onclick={(event) => onButtonClick(event, record)}
                >
                  Enable
                </button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
```

- [ ] **Step 5: Run svelte-autofixer on the new component**

Per CLAUDE.md, Svelte components must be checked with svelte-autofixer until clean. Use the `mcp__svelte__svelte-autofixer` tool on the file content, fix any issues reported, repeat until empty.

- [ ] **Step 6: Create `packages/shell/src/extensions-panel/extensions-panel.test.ts`**

Full content:

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Extension, ExtensionContext, ViewContribution } from '@gcscode/extension-api';

import { createExtensionManager } from '../extension-host/extension-manager';
import { createRegistry } from '../extension-host/registry';
import { extensionsPanelState } from './extensions-panel-state.svelte';
import ExtensionsPanel from './extensions-panel.svelte';

const fakeComponent = {} as ViewContribution['component'];

function makeExtension(opts: {
  id: string;
  displayName?: string;
  version?: string;
  description?: string;
}): Extension {
  return {
    manifest: {
      id: opts.id,
      displayName: opts.displayName ?? opts.id,
      version: opts.version ?? '0.0.0',
      description: opts.description,
    },
    activate(ctx: ExtensionContext) {
      ctx.subscriptions.push(
        ctx.host.window.registerView({ id: `${opts.id}.view`, component: fakeComponent }),
      );
    },
  };
}

function setup(extensions: Extension[] = []) {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  for (const ext of extensions) manager.register(ext);
  return { registry, manager };
}

describe('extensions-panel.svelte', () => {
  afterEach(() => {
    extensionsPanelState.close();
  });

  it('renders one row per registered extension, EXCEPT workbench', () => {
    const { manager } = setup([
      makeExtension({ id: 'workbench', displayName: 'Workbench' }),
      makeExtension({ id: 'ext.a', displayName: 'Extension A' }),
      makeExtension({ id: 'ext.b', displayName: 'Extension B' }),
    ]);
    render(ExtensionsPanel, { props: { manager } });

    expect(screen.queryByText('Workbench')).not.toBeInTheDocument();
    expect(screen.getByText('Extension A')).toBeInTheDocument();
    expect(screen.getByText('Extension B')).toBeInTheDocument();
  });

  it('each row shows displayName, version, description, and matching button label', () => {
    const { manager } = setup([
      makeExtension({
        id: 'ext.a',
        displayName: 'Extension A',
        version: '1.2.3',
        description: 'A demo extension.',
      }),
    ]);
    render(ExtensionsPanel, { props: { manager } });

    expect(screen.getByText('Extension A')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText('A demo extension.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
  });

  it('extension without a description renders no description block', () => {
    const { manager } = setup([
      makeExtension({ id: 'ext.a', displayName: 'Extension A' }), // no description
    ]);
    const { container } = render(ExtensionsPanel, { props: { manager } });

    expect(screen.queryByText('A demo extension.')).not.toBeInTheDocument();
    // The row should still render the name + version + button
    expect(screen.getByText('Extension A')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument();
    // No empty description-block element
    const descriptions = container.querySelectorAll('.text-neutral-300');
    expect(descriptions.length).toBe(0);
  });

  it('disabled rows have lower opacity (opacity-60 class)', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Extension A' })]);
    await manager.setEnabled('ext.a', false);
    const { container } = render(ExtensionsPanel, { props: { manager } });

    const li = container.querySelector('li');
    expect(li?.classList.contains('opacity-60')).toBe(true);
  });

  it('search input filters rows via Fuse over displayName + description', async () => {
    const { manager } = setup([
      makeExtension({ id: 'ext.a', displayName: 'Apple', description: 'Red fruit.' }),
      makeExtension({ id: 'ext.b', displayName: 'Banana', description: 'Yellow fruit.' }),
      makeExtension({ id: 'ext.c', displayName: 'Cherry', description: 'Small red.' }),
    ]);
    render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'banana' } });

    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
    expect(screen.getByText('Banana')).toBeInTheDocument();
    expect(screen.queryByText('Cherry')).not.toBeInTheDocument();
  });

  it('ArrowDown / ArrowUp wrap the highlight across visible rows', async () => {
    const { manager } = setup([
      makeExtension({ id: 'ext.a', displayName: 'Alpha' }),
      makeExtension({ id: 'ext.b', displayName: 'Bravo' }),
    ]);
    const { container } = render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    // Start: highlight is on row 0 (Alpha)
    expect(container.querySelectorAll('li')[0].classList.contains('bg-blue-900')).toBe(true);

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(container.querySelectorAll('li')[1].classList.contains('bg-blue-900')).toBe(true);

    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    // Wraps to first row
    expect(container.querySelectorAll('li')[0].classList.contains('bg-blue-900')).toBe(true);

    await fireEvent.keyDown(input, { key: 'ArrowUp' });
    // Wraps backward to last row
    expect(container.querySelectorAll('li')[1].classList.contains('bg-blue-900')).toBe(true);
  });

  it('Enter on highlighted row calls manager.setEnabled with the toggled value', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Alpha' })]);
    const setEnabled = vi.spyOn(manager, 'setEnabled');
    render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'Enter' });

    expect(setEnabled).toHaveBeenCalledWith('ext.a', false); // currently enabled → toggle to false
  });

  it('clicking the Enable/Disable button calls manager.setEnabled', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Alpha' })]);
    const setEnabled = vi.spyOn(manager, 'setEnabled');
    render(ExtensionsPanel, { props: { manager } });

    const button = screen.getByRole('button', { name: 'Disable' });
    await fireEvent.click(button);

    expect(setEnabled).toHaveBeenCalledWith('ext.a', false);
  });

  it('renders "No extensions installed." when only workbench is registered', () => {
    const { manager } = setup([makeExtension({ id: 'workbench', displayName: 'Workbench' })]);
    render(ExtensionsPanel, { props: { manager } });

    expect(screen.getByText('No extensions installed.')).toBeInTheDocument();
    // No search input shown in the empty state
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders "No matching extensions." when search yields no matches', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Alpha' })]);
    render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    await fireEvent.input(input, { target: { value: 'zzzzz' } });

    expect(screen.getByText('No matching extensions.')).toBeInTheDocument();
  });

  it('Escape closes the panel via extensionsPanelState.close()', async () => {
    const { manager } = setup([makeExtension({ id: 'ext.a', displayName: 'Alpha' })]);
    extensionsPanelState.open();
    flushSync();
    render(ExtensionsPanel, { props: { manager } });

    const input = screen.getByRole('textbox');
    await fireEvent.keyDown(input, { key: 'Escape' });
    flushSync();

    expect(extensionsPanelState.isOpen).toBe(false);
  });
});
```

- [ ] **Step 7: Verify panel tests pass**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm --filter @gcscode/shell test extensions-panel.test 2>&1 | tail -15`
Expected: 11 tests pass.

#### Sub-section C: extensions-panel-host.svelte + tests

- [ ] **Step 8: Create `packages/shell/src/extensions-panel/extensions-panel-host.svelte`**

Full content (mirrors `quick-pick-host.svelte`):

```svelte
<script lang="ts">
  import { modalState } from '../modal-state.svelte';
  import type { ExtensionManager } from '../extension-host/extension-manager';
  import ExtensionsPanel from './extensions-panel.svelte';
  import { extensionsPanelState } from './extensions-panel-state.svelte';

  let { manager }: { manager: ExtensionManager } = $props();

  const open = $derived(extensionsPanelState.isOpen);

  // Mirror open/close into the dispatcher's pause flag.
  $effect(() => {
    modalState.active = open;
  });

  // Click-outside-to-dismiss. Selector is tied to ExtensionsPanel's hard-coded
  // aria-label.
  $effect(() => {
    if (!open) return;
    function onDocumentClick(event: MouseEvent) {
      const dialog = document.querySelector('[role="dialog"][aria-label="Extensions"]');
      if (dialog === null) return;
      if (event.target instanceof Node && dialog.contains(event.target)) return;
      extensionsPanelState.close();
    }
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  });
</script>

{#if open}
  <ExtensionsPanel {manager} />
{/if}
```

- [ ] **Step 9: Run svelte-autofixer on the host component**

Use the `mcp__svelte__svelte-autofixer` tool until clean.

- [ ] **Step 10: Create `packages/shell/src/extensions-panel/extensions-panel-host.test.ts`**

Full content (mirrors `quick-pick-host.test.ts`):

```ts
import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';

import { createExtensionManager } from '../extension-host/extension-manager';
import { createRegistry } from '../extension-host/registry';
import { modalState } from '../modal-state.svelte';
import ExtensionsPanelHost from './extensions-panel-host.svelte';
import { extensionsPanelState } from './extensions-panel-state.svelte';

function setup() {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  return { manager };
}

describe('extensions-panel-host.svelte', () => {
  afterEach(() => {
    extensionsPanelState.close();
    modalState.active = false;
  });

  it('renders nothing when extensionsPanelState.isOpen is false', () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });
    expect(screen.queryByRole('dialog', { name: 'Extensions' })).not.toBeInTheDocument();
  });

  it('renders the ExtensionsPanel when state opens, hides it when closed', async () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });

    extensionsPanelState.open();
    flushSync();
    expect(screen.getByRole('dialog', { name: 'Extensions' })).toBeInTheDocument();

    extensionsPanelState.close();
    flushSync();
    expect(screen.queryByRole('dialog', { name: 'Extensions' })).not.toBeInTheDocument();
  });

  it('sets modalState.active true while open and false when closed', () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });
    expect(modalState.active).toBe(false);

    extensionsPanelState.open();
    flushSync();
    expect(modalState.active).toBe(true);

    extensionsPanelState.close();
    flushSync();
    expect(modalState.active).toBe(false);
  });

  it('click outside the dialog closes the panel', async () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });

    extensionsPanelState.open();
    flushSync();
    expect(extensionsPanelState.isOpen).toBe(true);

    // A click on document.body (outside the dialog)
    await fireEvent.click(document.body);
    flushSync();
    expect(extensionsPanelState.isOpen).toBe(false);
  });

  it('click inside the dialog does NOT close the panel', async () => {
    const { manager } = setup();
    render(ExtensionsPanelHost, { props: { manager } });

    extensionsPanelState.open();
    flushSync();

    const dialog = screen.getByRole('dialog', { name: 'Extensions' });
    await fireEvent.click(dialog);
    flushSync();
    expect(extensionsPanelState.isOpen).toBe(true);
  });
});
```

- [ ] **Step 11: Verify host tests pass**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm --filter @gcscode/shell test extensions-panel-host 2>&1 | tail -10`
Expected: 5 tests pass.

#### Sub-section D: Verify, format, commit

- [ ] **Step 12: Run full check, test, lint**

Run:

```bash
cd .worktrees/feat-extensions-panel/shell && pnpm check 2>&1 | tail -8 && echo "===TEST===" && pnpm test 2>&1 | grep -E "Tests.*passed" && echo "===LINT===" && pnpm format && pnpm lint 2>&1 | tail -5
```

Expected: check 0 errors. Tests: shell grows from 150 to 172 (+22: 6 state + 11 panel + 5 host). Other packages unchanged. Lint clean.

- [ ] **Step 13: Verify only the intended files modified**

Run: `cd .worktrees/feat-extensions-panel/shell && git status`
Expected: 6 new untracked files in `packages/shell/src/extensions-panel/`. No other changes.

- [ ] **Step 14: Commit**

Verify branch first:

```bash
cd .worktrees/feat-extensions-panel/shell && git branch --show-current
```

Expected: `feat/extensions-panel`. If `master`, STOP.

Then:

```bash
cd .worktrees/feat-extensions-panel/shell && git add packages/shell/src/extensions-panel/ && git commit -m "$(cat <<'EOF'
feat(shell): extensions-panel state + components

Adds the extensions-panel directory under packages/shell/src/, with three
source files and three test files:

- extensions-panel-state.svelte.ts: singleton state with isOpen, open(),
  close(), dual guard (already-open + modalState.active). Mirrors the
  quickPickState pattern. 6 tests.
- extensions-panel.svelte: rendering component receiving ExtensionManager
  as a prop. Filters out the workbench, runs Fuse search over
  manifest.displayName + manifest.description, renders a row per extension
  with Enable/Disable button, supports keyboard navigation (Arrow keys,
  Enter, Escape). 11 tests.
- extensions-panel-host.svelte: mount gate + modalState mirror +
  click-outside-to-dismiss. Mirrors quick-pick-host.svelte. 5 tests.

Workspace stays green. The panel cannot be opened at runtime yet — Tasks 3
and 4 wire it to the workbench's command + keybinding and to App's mount
tree.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 15: Verify commit landed**

Run: `cd .worktrees/feat-extensions-panel/shell && git log --oneline -2 && git status`
Expected: HEAD = `feat(shell): extensions-panel state + components`. Working tree clean.

---

### Task 3: Workbench wiring — command + keybinding (commit 2)

**Files:**

- Modify: `packages/shell/src/built-in/workbench/index.ts`
- Modify: `packages/shell/src/built-in/workbench/index.test.ts`

This task adds two new register calls (command + keybinding) inside `createWorkbenchExtension`'s `activate`, updates the workbench's manifest `description`, and adds 4 new tests in the workbench test file. The workbench factory's signature is **unchanged**.

#### Sub-section A: Source file

- [ ] **Step 1: Open `packages/shell/src/built-in/workbench/index.ts` and locate the imports**

Current imports:

```ts
import type { Extension, ExtensionContext, QuickPickItem } from '@gcscode/extension-api';

import type { Registry } from '../../extension-host/registry';
```

- [ ] **Step 2: Add the `extensionsPanelState` import**

```diff
 import type { Extension, ExtensionContext, QuickPickItem } from '@gcscode/extension-api';

 import type { Registry } from '../../extension-host/registry';
+import { extensionsPanelState } from '../../extensions-panel/extensions-panel-state.svelte';
```

- [ ] **Step 3: Update the manifest `description` field**

Locate the `manifest:` literal inside `createWorkbenchExtension`'s returned `Extension`. Update the `description`:

```diff
     manifest: {
       id: 'workbench',
       displayName: 'Workbench',
       version: '0.0.0',
-      description: "The shell's built-in extension. Registers the command palette and Ctrl+Shift+P.",
+      description:
+        "The shell's built-in extension. Registers the command palette (Ctrl+Shift+P) and the extensions panel (Ctrl+Shift+X).",
     },
```

- [ ] **Step 4: Add the new command + keybinding registrations inside `activate`**

The current `activate` body ends with `context.subscriptions.push(showCommands, keybinding);`. Add new register calls between the existing ones and the push:

```diff
     activate(context: ExtensionContext) {
       const showCommands = context.host.commands.registerCommand({
         /* unchanged existing showCommands declaration */
       });

       const keybinding = context.host.keybindings.registerKeybinding({
         key: 'Ctrl+Shift+P',
         command: 'workbench.action.showCommands',
       });

+      const showExtensions = context.host.commands.registerCommand({
+        id: 'workbench.extensions.action.showInstalledExtensions',
+        title: 'Show Installed Extensions',
+        category: 'Workbench',
+        run: () => {
+          extensionsPanelState.open();
+        },
+      });
+
+      const extensionsKeybinding = context.host.keybindings.registerKeybinding({
+        key: 'Ctrl+Shift+X',
+        command: 'workbench.extensions.action.showInstalledExtensions',
+      });
+
-      context.subscriptions.push(showCommands, keybinding);
+      context.subscriptions.push(showCommands, keybinding, showExtensions, extensionsKeybinding);
     },
```

The two new disposables join the existing two on the subscriptions array. Order matters for LIFO disposal but is irrelevant here (these are independent registrations).

- [ ] **Step 5: Verify shell types still compile**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm --filter @gcscode/shell check 2>&1 | tail -10`
Expected: 0 errors.

#### Sub-section B: Tests

- [ ] **Step 6: Open `packages/shell/src/built-in/workbench/index.test.ts` and locate the existing description assertion**

Find the test (or assertion within an existing test) that reads `extension.manifest.description`. Update it:

```diff
-    expect(extension.manifest.description).toBe(
-      "The shell's built-in extension. Registers the command palette and Ctrl+Shift+P.",
-    );
+    expect(extension.manifest.description).toBe(
+      "The shell's built-in extension. Registers the command palette (Ctrl+Shift+P) and the extensions panel (Ctrl+Shift+X).",
+    );
```

If the existing test file doesn't have a description assertion, skip this substep (the new tests below cover the new wiring; the description string is byte-checked by the spec compliance reviewer reading the source file).

- [ ] **Step 7: Add four new tests at the end of the test file's `describe` block**

The new tests (paste at the end of the file's main `describe('createWorkbenchExtension', ...)` or equivalent describe block):

```ts
it('registers workbench.extensions.action.showInstalledExtensions command', () => {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  manager.register(createWorkbenchExtension(registry));

  const command = registry
    .listCommands()
    .find((c) => c.id === 'workbench.extensions.action.showInstalledExtensions');
  expect(command).toBeDefined();
  expect(command?.title).toBe('Show Installed Extensions');
  expect(command?.category).toBe('Workbench');
});

it('registers Ctrl+Shift+X keybinding pointing at the panel command', () => {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  manager.register(createWorkbenchExtension(registry));

  const keybinding = registry.listKeybindings().find((k) => k.key === 'Ctrl+Shift+X');
  expect(keybinding).toBeDefined();
  expect(keybinding?.command).toBe('workbench.extensions.action.showInstalledExtensions');
});

it('running the panel command opens the extensions-panel state', async () => {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  manager.register(createWorkbenchExtension(registry));

  expect(extensionsPanelState.isOpen).toBe(false);
  await registry.executeCommand('workbench.extensions.action.showInstalledExtensions');
  expect(extensionsPanelState.isOpen).toBe(true);

  extensionsPanelState.close(); // cleanup
});

it('disposing the workbench subscriptions also disposes the new command + keybinding', async () => {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  manager.register(createWorkbenchExtension(registry));

  expect(
    registry
      .listCommands()
      .some((c) => c.id === 'workbench.extensions.action.showInstalledExtensions'),
  ).toBe(true);
  expect(registry.listKeybindings().some((k) => k.key === 'Ctrl+Shift+X')).toBe(true);

  await manager.setEnabled('workbench', false);

  expect(
    registry
      .listCommands()
      .some((c) => c.id === 'workbench.extensions.action.showInstalledExtensions'),
  ).toBe(false);
  expect(registry.listKeybindings().some((k) => k.key === 'Ctrl+Shift+X')).toBe(false);
});
```

Imports needed at the top of the test file (if not already present):

```ts
import { extensionsPanelState } from '../../extensions-panel/extensions-panel-state.svelte';
```

Add an `afterEach` cleanup (or extend an existing one) to reset `extensionsPanelState`:

```ts
afterEach(() => {
  extensionsPanelState.close();
});
```

If `afterEach` isn't already imported from `vitest`, add it.

- [ ] **Step 8: Verify workbench tests pass**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm --filter @gcscode/shell test workbench 2>&1 | tail -15`
Expected: 4 new tests pass; existing workbench tests still pass.

- [ ] **Step 9: Verify full workspace stays green**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | grep -E "Tests.*passed"`
Expected: lint + check clean. Per-package: shell from 172 to 176 (+4 workbench tests). Other packages unchanged.

- [ ] **Step 10: Verify only the intended files changed**

Run: `cd .worktrees/feat-extensions-panel/shell && git status`
Expected: modified `packages/shell/src/built-in/workbench/index.ts` and `packages/shell/src/built-in/workbench/index.test.ts`. No other changes.

- [ ] **Step 11: Commit**

```bash
cd .worktrees/feat-extensions-panel/shell && git branch --show-current
```

Expected: `feat/extensions-panel`. If not, STOP.

```bash
cd .worktrees/feat-extensions-panel/shell && git add packages/shell/src/built-in/workbench/ && git commit -m "$(cat <<'EOF'
feat(workbench): extensions-panel command + Ctrl+Shift+X keybinding

Adds two new registrations to createWorkbenchExtension's activate:

- workbench.extensions.action.showInstalledExtensions command (title
  "Show Installed Extensions", category "Workbench") whose run callback
  calls extensionsPanelState.open(); appears in the command palette.
- Ctrl+Shift+X keybinding pointing at that command id.

Updates the workbench's manifest.description to mention both surfaces.
Adds 4 new tests in built-in/workbench/index.test.ts.

The workbench factory signature createWorkbenchExtension(registry) is
unchanged — the panel reads ExtensionManager via the App's prop chain,
not via the workbench. Per ADR-0007's manifest pattern.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 12: Verify commit landed**

Run: `cd .worktrees/feat-extensions-panel/shell && git log --oneline -3 && git status`
Expected: HEAD = `feat(workbench): extensions-panel command + Ctrl+Shift+X keybinding`. Tree clean.

---

### Task 4: Wire panel into app.svelte and main.ts (commit 3)

**Files:**

- Modify: `packages/shell/src/app.svelte`
- Modify: `packages/shell/src/main.ts`
- Modify: `packages/shell/src/app.test.ts`

This task brings the panel live at runtime. After this commit, pressing Ctrl+Shift+X in the running app opens the panel.

- [ ] **Step 1: Update `packages/shell/src/app.svelte`**

Three edits:

```diff
 <script lang="ts">
   import type { Registry } from './extension-host/registry';
+  import type { ExtensionManager } from './extension-host/extension-manager';
   import QuickPickHost from './quick-pick/quick-pick-host.svelte';
+  import ExtensionsPanelHost from './extensions-panel/extensions-panel-host.svelte';

-  let { registry }: { registry: Registry } = $props();
+  let { registry, manager }: { registry: Registry; manager: ExtensionManager } = $props();

   const views = $derived(registry.listViews());
```

And add the host mount inside `<main>`, after `<QuickPickHost />`:

```diff
   <QuickPickHost />
+  <ExtensionsPanelHost {manager} />
 </main>
```

- [ ] **Step 2: Run svelte-autofixer on app.svelte**

Use `mcp__svelte__svelte-autofixer` until clean.

- [ ] **Step 3: Update `packages/shell/src/main.ts` to pass manager as a prop**

```diff
 mount(App, {
   target: document.getElementById('app')!,
-  props: { registry },
+  props: { registry, manager },
 });
```

- [ ] **Step 4: Update `packages/shell/src/app.test.ts` test setup to pass `manager`**

Locate every `mount(App, ...)` or `render(App, ...)` call in the test file. Each currently passes `props: { registry }`. Change to `props: { registry, manager }` and construct `manager` alongside `registry`.

Specifically, the existing helper that constructs `registry` should also construct `manager`. Pattern (look for the existing helper, often near top of the describe block):

```diff
-function setup() {
-  const registry = createRegistry();
-  return { registry };
-}
+function setup() {
+  const registry = createRegistry();
+  const manager = createExtensionManager(registry);
+  return { registry, manager };
+}
```

And the `mount(App, ...)` call (or its destructured equivalent):

```diff
-mount(App, { target: container, props: { registry } });
+mount(App, { target: container, props: { registry, manager } });
```

If `createExtensionManager` isn't already imported, add it:

```diff
+import { createExtensionManager } from './extension-host/extension-manager';
```

- [ ] **Step 5: Verify shell types compile**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm --filter @gcscode/shell check 2>&1 | tail -10`
Expected: 0 errors.

- [ ] **Step 6: Verify full workspace stays green**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | grep -E "Tests.*passed"`
Expected: lint + check clean. Tests: shell stays at 176 (no new tests added; existing app.test.ts adapted but count unchanged).

- [ ] **Step 7: Smoke test the running app via chrome-devtools-mcp**

Run dev server in background:

```bash
cd .worktrees/feat-extensions-panel/shell && pnpm dev
```

(Use `run_in_background: true` on the Bash tool call so the server survives.)

Then via chrome-devtools-mcp:

1. Open http://localhost:5173.
2. Confirm app boots without console errors. The three views (example, sitl, vehicle-status) render; footer shows both status items.
3. Press **Ctrl+Shift+X**: a centered panel labeled "Extensions" opens. Lists three rows (NOT including the workbench): Example Extension, SITL Telemetry, Vehicle Status.
4. Each row shows displayName + version + description + a Disable button. Workbench is NOT in the list.
5. Type "sitl" in the search input: only SITL Telemetry remains.
6. Clear search. Press ArrowDown then Enter: the highlighted row's enabled state flips. Verify the underlying view disappears (e.g. SITL view, vehicle-status footer item).
7. Click outside the panel: panel closes.
8. Press Ctrl+Shift+X again: panel reopens. Click Enable on the dimmed row: extension re-activates; view returns.
9. Press Ctrl+Shift+P: command palette opens, listing both "Workbench: Show All Commands" and "Workbench: Show Installed Extensions". The latter, when picked, opens the panel.
10. Verify: with the panel open, pressing Ctrl+Shift+P does NOT open the palette (the dispatcher is paused via modalState.active).
11. Reload the page: any extension you disabled in step 6 stays disabled (B4 persistence carries over).

If any check fails, that's a regression — investigate before committing. If headless and you can't run the browser smoke, defer to controller-side verification at Task 6 and proceed to commit; mark in the report that the smoke is deferred.

Stop the dev server.

- [ ] **Step 8: Verify only the intended files changed**

Run: `cd .worktrees/feat-extensions-panel/shell && git status`
Expected: modified `packages/shell/src/app.svelte`, `packages/shell/src/main.ts`, `packages/shell/src/app.test.ts`. No other changes.

- [ ] **Step 9: Commit**

```bash
cd .worktrees/feat-extensions-panel/shell && git branch --show-current
```

Expected: `feat/extensions-panel`. If not, STOP.

```bash
cd .worktrees/feat-extensions-panel/shell && git add packages/shell/src/app.svelte packages/shell/src/main.ts packages/shell/src/app.test.ts && git commit -m "$(cat <<'EOF'
feat(shell): wire extensions-panel into app.svelte and main.ts

App grows a new manager: ExtensionManager prop alongside registry, mounts
<ExtensionsPanelHost {manager} /> inside <main> after <QuickPickHost />.
main.ts passes manager as a prop. app.test.ts setup constructs the
manager and passes it as a prop in every render.

After this commit, pressing Ctrl+Shift+X (or invoking the palette command
"Workbench: Show Installed Extensions") in the running app opens the
panel. Workbench is filtered from the listing; toggling rows persists
across reloads via the existing B4 persistence layer.

Workspace stays green: pnpm check / test / lint clean. Test count
unchanged (no new tests in app.test.ts; the panel + host + state are
covered by their own dedicated test files from commit 1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 10: Verify commit landed and the panel works end-to-end**

Run: `cd .worktrees/feat-extensions-panel/shell && git log --oneline -4 && git status`
Expected: HEAD = `feat(shell): wire extensions-panel into app.svelte and main.ts`. Tree clean.

---

### Task 5: Doc propagation (commit 4)

**Files:**

- Modify: `docs/roadmap.md`
- Modify: `docs/vs-code-alignment.md`
- Modify: `docs/out-of-scope.md`

Pure docs commit. Workspace stays green throughout.

- [ ] **Step 1: Update `docs/roadmap.md` — append B6 line + new Considering**

**Edit A: append B6 line.** Locate the existing B5 line ("Per-extension manifest metadata"). Add a new bullet IMMEDIATELY AFTER it:

```md
- [x] **B6: Extensions panel** — centered overlay opened via `Ctrl+Shift+X` or palette; lists bundled extensions with displayName, version, description, Enable/Disable button; first marketplace UI consumer of `Extension.manifest.description`. Spec: [`specs/2026-05-02-extensions-panel.md`](specs/2026-05-02-extensions-panel.md).
```

**Edit B: append Considering line.** Locate the "Feature extensions → Considering" section. After the existing "Road scanning" entry, add:

```md
- [ ] **Sidebar / activity-bar chrome** — persistent UI region that would host the extensions panel (sidebar-mounted variant alongside the existing overlay), settings, output, search, etc. Trigger: a second sidebar tenant emerges (settings, output, search), OR operator UX feedback says the overlay is insufficient for longer browsing tasks. Operator-UX framing: floating/disappearing UI is the default; persistent chrome must justify its viewport cost.
```

The Phase A, the rest of Phase B above B5, Phase C, the rest of Feature extensions, and Maintenance section are unchanged.

- [ ] **Step 2: Update `docs/vs-code-alignment.md` — two Alignments rows + one Divergences row**

**Edit A — Alignments table (append two rows at the bottom).** Find the bottom of the **Alignments** table (after the existing "Per-extension manifest carries identity + presentation metadata" row from ADR-0007). Append:

```md
| `workbench.extensions.action.showInstalledExtensions` command id | ✓ | ✓ | [spec 2026-05-02-extensions-panel](specs/2026-05-02-extensions-panel.md) |
| `Ctrl+Shift+X` default keybinding for the extensions panel | ✓ | ✓ | [spec 2026-05-02-extensions-panel](specs/2026-05-02-extensions-panel.md) |
```

**Edit B — Divergences table (append one row at the bottom).** Find the bottom of the **Divergences** table. Append:

```md
| Extensions panel surface | sidebar drawer + main-editor detail pane | centered overlay (palette-styled, no scrim) | [spec 2026-05-02-extensions-panel](specs/2026-05-02-extensions-panel.md) | A second sidebar tenant emerges, OR operator UX feedback says the overlay is insufficient for longer browsing tasks |
```

The Deferrals table is unchanged.

- [ ] **Step 3: Update `docs/out-of-scope.md` — append "Programmatic extension enable/disable API"**

Locate the "Extension activation ordering / dependency declaration" entry under `## Extension machinery`. Add a new bullet IMMEDIATELY AFTER it:

```md
- **Programmatic extension enable/disable API.** No `host.extensions.setEnabled(id, bool)` for third-party extensions to toggle other extensions. Today only the workbench built-in (which has direct `ExtensionManager` access) drives enable/disable, in response to user UI interaction via the extensions panel. _Trigger to revisit:_ first third-party consumer that needs programmatic toggle of a sibling extension (e.g. a "preset" extension that activates a curated set of others). When triggered, the API likely lives on `host.extensions.*` and requires capability-declaration plumbing first.
```

The other entries in `## Extension machinery` and the `## Tooling / process` section are unchanged.

- [ ] **Step 4: Verify lint clean + workspace still green**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm format && pnpm lint`
Expected: prettier may reformat the markdown; lint clean.

Sanity check workspace:

```bash
cd .worktrees/feat-extensions-panel/shell && pnpm check && pnpm test 2>&1 | grep -E "Tests.*passed"
```

Expected: green; test counts unchanged from Task 4.

- [ ] **Step 5: Verify only the intended files changed**

Run: `cd .worktrees/feat-extensions-panel/shell && git status`
Expected: modified `docs/roadmap.md`, `docs/vs-code-alignment.md`, `docs/out-of-scope.md`. No other files.

- [ ] **Step 6: Commit**

```bash
cd .worktrees/feat-extensions-panel/shell && git branch --show-current
```

Expected: `feat/extensions-panel`. If not, STOP.

```bash
cd .worktrees/feat-extensions-panel/shell && git add docs/roadmap.md docs/vs-code-alignment.md docs/out-of-scope.md && git commit -m "$(cat <<'EOF'
docs: extensions-panel propagation — roadmap, ledger, out-of-scope

Cumulative doc propagation for the extensions-panel iteration:

- docs/roadmap.md: new B6 line linking the spec; new "Sidebar /
  activity-bar chrome" Considering line under Feature extensions with the
  trigger language (second sidebar tenant emerges OR operator UX
  feedback) and operator-UX framing note.
- docs/vs-code-alignment.md: two new Alignments rows
  (workbench.extensions.action.showInstalledExtensions command id +
  Ctrl+Shift+X default keybinding); one new Divergences row (Extensions
  panel surface — overlay vs VS Code's sidebar+detail-pane).
- docs/out-of-scope.md: new "Programmatic extension enable/disable API"
  entry under Extension machinery, deferring host.extensions.setEnabled
  until the first third-party consumer.

No code changes. Workspace remains green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verify commit landed**

Run: `cd .worktrees/feat-extensions-panel/shell && git log --oneline -5 && git status`
Expected: HEAD = `docs: extensions-panel propagation — ...`. Four `feat...` + `docs:` commits below it. Tree clean.

---

### Task 6: End-to-end verification

**Files:** none

This task confirms the feature branch is ready for merge. All commands must pass; no commits land here.

- [ ] **Step 1: Run the full verification suite**

Run: `cd .worktrees/feat-extensions-panel/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | grep -E "Tests.*passed"`
Expected: all four exit 0. Per-package: shell 176 (was 150 + 22 from Task 2 + 4 from Task 3 = 176), others unchanged.

- [ ] **Step 2: Verify the branch's commit log**

Run: `cd .worktrees/feat-extensions-panel/shell && git log --oneline master..HEAD`

Expected: exactly four commits, in this order (top is most recent):

1. `docs: extensions-panel propagation — ...`
2. `feat(shell): wire extensions-panel into app.svelte and main.ts`
3. `feat(workbench): extensions-panel command + Ctrl+Shift+X keybinding`
4. `feat(shell): extensions-panel state + components`

If the count is off (more or fewer), or the order is wrong, investigate before merging.

- [ ] **Step 3: Smoke-test the dev server end-to-end**

Run `pnpm dev` (in background or separate terminal) at `.worktrees/feat-extensions-panel/shell/`. Open http://localhost:5173 and run through the smoke checks from Task 4 Step 7 once more, on the final state:

1. App boots; no console errors.
2. Three views render; footer has both status items.
3. **Ctrl+Shift+X** opens the panel. Three rows (workbench hidden). Each row shows displayName + version + description + Enable/Disable button.
4. Search filters via Fuse.
5. ArrowDown/ArrowUp/Enter toggle rows.
6. Click button toggles row.
7. Click outside / Esc closes.
8. **Ctrl+Shift+P** with panel open: doesn't fire (dispatcher paused).
9. **Ctrl+Shift+P** with panel closed: palette opens, lists "Workbench: Show Installed Extensions", picking it opens the panel.
10. Reload preserves enabled/disabled state.

If using chrome-devtools-mcp, this is the same flow as the manifest iteration's smoke check (which the controller can automate).

Stop the dev server.

- [ ] **Step 4: Verify no extra files exist on the branch**

Run: `cd .worktrees/feat-extensions-panel/shell && git diff master --stat | tail -3`

Expected: a list of files changed and a summary line. The list should match exactly the files touched by Tasks 2–5. No `package.json` files changed; no `tsconfig.json` files changed; no extension-api types changed (the panel uses existing types only).

---

### Task 7: Final cross-cutting review + merge

**Files:** none

Per CLAUDE.md, dispatch a final cross-cutting code review over the full feat branch before merging.

- [ ] **Step 1: Dispatch final cross-cutting review**

Use `superpowers:code-reviewer` (or equivalent) on the diff `git diff master...HEAD`. Address any blocker feedback in `Code-review-followup:` commits on the same branch (per CLAUDE.md). Re-run review until clean.

- [ ] **Step 2: Switch to master in main checkout**

Run: `cd /Users/kevinkroon/Projects/gcscode/shell && git checkout master`
Expected: branch switches; HEAD is master's most recent commit.

- [ ] **Step 3: Pull latest from master**

Run: `cd /Users/kevinkroon/Projects/gcscode/shell && git pull --ff-only` (skip if no remote tracking).
Expected: fast-forward only; no merge commits introduced.

- [ ] **Step 4: Merge with `--no-ff`**

Run: `cd /Users/kevinkroon/Projects/gcscode/shell && git merge --no-ff feat/extensions-panel -m "Merge branch 'feat/extensions-panel'"`
Expected: merge commit lands. `git log --oneline` shows the merge commit at HEAD followed by the four feat-branch commits and any pre-existing master history.

- [ ] **Step 5: Verify post-merge green**

Run: `cd /Users/kevinkroon/Projects/gcscode/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | grep -E "Tests.*passed"`
Expected: all clean. Test counts: shell 176, sitl 28, example 3, vehicle-status 3 = 210 total.

- [ ] **Step 6: Optional cleanup — remove worktree + delete feat branch**

```bash
cd /Users/kevinkroon/Projects/gcscode && git worktree remove .worktrees/feat-extensions-panel
cd /Users/kevinkroon/Projects/gcscode/shell && git branch -d feat/extensions-panel
```

Expected: worktree removed; branch deleted (use `-d` not `-D` — the merge made it safely deletable).

- [ ] **Step 7: Final state verification**

Run: `cd /Users/kevinkroon/Projects/gcscode/shell && git log --oneline -7 && git branch && git status`

Expected:

- `git log` shows: merge commit at HEAD, four feat-branch commits, and earlier history.
- `git branch` no longer lists `feat/extensions-panel`.
- `git status` is clean.

The iteration is complete.

---

## Self-review

Before finalizing, I cross-checked the plan against the spec for:

1. **Spec coverage:** Each section/requirement of the spec maps to at least one plan task:
   - State singleton → Task 2 Sub-section A
   - Panel component → Task 2 Sub-section B
   - Host component → Task 2 Sub-section C
   - Workbench wiring + new command + keybinding → Task 3
   - Manifest description update → Task 3 Step 3
   - main.ts + app.svelte wiring → Task 4
   - app.test.ts adaptation → Task 4 Step 4
   - Roadmap propagation (B6 + Considering) → Task 5 Step 1
   - vs-code-alignment ledger propagation → Task 5 Step 2
   - out-of-scope.md propagation → Task 5 Step 3
   - End-to-end smoke → Task 6 Step 3 + Task 4 Step 7
   - Final review + merge → Task 7

2. **No placeholders:** Every step contains either real code, an exact command with expected output, or a verification action with a concrete pass/fail criterion. No "TBD", no "implement later", no "write tests for the above".

3. **Type / API consistency across tasks:**
   - `extensionsPanelState.open()` / `close()` / `isOpen` — same names in Tasks 2, 3, 4.
   - `manager.setEnabled(id, bool)` — same signature in panel + tests.
   - `ExtensionRecord` shape — `{ manifest, enabled }` consistent.
   - `ExtensionManager` import path — `../extension-host/extension-manager` everywhere.
   - Workbench command id `workbench.extensions.action.showInstalledExtensions` — same string in workbench source + workbench tests + roadmap entry + spec.
   - `Ctrl+Shift+X` — same key string in workbench source + workbench tests + roadmap entry + spec.

4. **Test counts:** The plan's per-task increments (22 + 4 = 26) match the spec's total (~26). Final post-merge: shell 176, total 210.

5. **Commit boundaries:** Each task ends with one git commit. Four feat-branch commits match the spec's `## Branching and commit` section exactly. No surprise extra commits.

6. **Worktree discipline:** Tasks 2–6 all assume implementer subagents work in `.worktrees/feat-extensions-panel/shell/` and use `cd .worktrees/feat-extensions-panel/shell && ...` for every bash invocation. The controller dispatching subagents must restate this discipline per CLAUDE.md.
