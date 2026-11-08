# Extensions panel — first marketplace UI consumer

**Status:** Approved (2026-05-02)

## Context

ADR-0007 (the per-extension manifest) shipped on 2026-05-02 specifically to unblock this iteration: the marketplace UI that lets operators view and toggle bundled extensions. With `Extension.manifest.description` now available on every extension, the UI has a real consumer to render.

This iteration ships a centered overlay panel — palette-styled, no backdrop scrim — opened by `Ctrl+Shift+X` or via the command palette. The panel lists installed (bundled) extensions with displayName, version, description, and a single Enable / Disable button per row. Search filters via Fuse over displayName + description. The workbench built-in is hidden from the listing (it can't be sensibly disabled — disabling would lock the operator out of Ctrl+Shift+P + Ctrl+Shift+X).

The choice of overlay over sidebar is deliberate. VS Code presents the same surface as a sidebar drawer with a detail pane in the main editor area; the gcscode operator persona (GCS pilot watching telemetry / map / video in real time) makes persistent chrome a viewport tax. Floating / disappearing UI wins for operator focus. Sidebar chrome is in roadmap "Considering" with a sharp trigger ("a second sidebar tenant emerges, OR operator UX feedback says the overlay is insufficient for longer browsing tasks") — when it lands, the panel can grow a sibling sidebar mounting next to the existing overlay mounting; the COMPONENT survives unchanged.

This iteration ships shell-internal plumbing only. No new public API on `host.*`. No new contribution kinds. The `host.extensions.setEnabled(id, bool)` verb stays out-of-scope until a third-party extension actually needs to toggle a sibling.

## Goals

- New `extensionsPanelState` singleton at `packages/shell/src/extensions-panel/extensions-panel-state.svelte.ts` mirroring `quickPickState`'s pattern: `isOpen`, `open()`, `close()`, "already open" guard.
- New `ExtensionsPanel` component at `packages/shell/src/extensions-panel/extensions-panel.svelte` rendering search input + filtered list + per-row Enable/Disable buttons + keyboard navigation.
- New `ExtensionsPanelHost` component at `packages/shell/src/extensions-panel/extensions-panel-host.svelte` mirroring `QuickPickHost`'s pattern: mount gate, `modalState.active` mirror, click-outside-to-dismiss.
- Add `workbench.extensions.action.showInstalledExtensions` command and `Ctrl+Shift+X` keybinding inside the workbench's `activate`. Both registered via the same public API any extension uses (`host.commands.registerCommand`, `host.keybindings.registerKeybinding`). The command's `run` callback calls `extensionsPanelState.open()`. Workbench's factory signature is unchanged — the panel receives `manager` directly via the App's prop chain (`main.ts` → `App` → `ExtensionsPanelHost`), not through the workbench.
- Update workbench's manifest description to reflect both surfaces.
- Update `main.ts` to pass `manager` as a new prop to `App` (alongside `registry`).
- Update `app.svelte` to accept a `manager` prop and mount `<ExtensionsPanelHost manager={manager} />` alongside `<QuickPickHost />`.
- Doc propagation: roadmap (new B6 line for this iteration + new "Sidebar / activity-bar chrome" Considering line under Feature extensions), vs-code-alignment ledger (new Alignments row + new Divergences row), out-of-scope.md (new "Programmatic extension enable/disable API" entry).

## Non-goals

- **No `host.extensions.setEnabled(id, bool)` public API.** Only the workbench (which has direct `ExtensionManager` access) drives enable/disable. Trigger to revisit: first third-party extension that needs to programmatically toggle a sibling. (Lands in `out-of-scope.md`.)
- **No sidebar / activity-bar chrome.** Defer to its own iteration. Trigger: a second sidebar tenant emerges (settings, output panel, search), OR operator UX feedback says the overlay is insufficient. (Captured in roadmap as Considering.)
- **No per-contribution toggles.** This iteration toggles whole extensions. Disabling individual commands or views from an extension stays deferred under the contributes-manifest trigger language.
- **No marketplace browsing.** No "Recommended" section, no "Install" button. Extensions are bundled at build time; nothing to browse.
- **No icons on extension rows.** Defer until `ExtensionManifest` gets `icon?` (its own per-field add when triggered).
- **No filter chips ("Installed", "Enabled", "Disabled", etc.).** Search input only, in this iteration. Trigger: 10+ bundled extensions OR operator feedback that finding-by-state is awkward.
- **No "expand row for details" / "extension page in main area".** Whole extension fits on one row; description is the detail surface. (Trigger to revisit: same as filter chips OR a richer manifest field like `readme?` or `changelog?` lands.)
- **No focus trap inside the panel.** Default browser tab order is acceptable for v1. Revisit when an a11y review fires.
- **No multi-select / bulk enable-disable.** One row at a time.
- **No animation on open/close.** The panel snaps in; same as the palette today. (Trigger: operator feedback that the snap is jarring.)

## Architecture

The panel is the second `modalState`-pinned overlay (after the command palette) and the second consumer of the workbench built-in's command-registration role. Everything mirrors the existing quick-pick pattern verbatim: a singleton state file, a rendering component, a host component that gates mounting and integrates with `modalState`. The panel COMPONENT receives the manager handle as a prop; it doesn't reach for a manager singleton, which keeps it testable in isolation.

The workbench gains one command + one keybinding, registered through the same public API third-party extensions use. The command's `run` callback calls `extensionsPanelState.open()` synchronously — no `manager` access needed at the command-callback layer because the panel reads `manager` via the prop chain. The workbench's `createWorkbenchExtension(registry: Registry)` signature is therefore **unchanged** by this iteration; only the body of `activate` grows two new register calls and the manifest's description string updates.

The filter that hides the workbench from the listing lives in the panel's `$derived` over `manager.listExtensions()`. One line. When a future iteration introduces multiple system extensions, that's when a `system?: boolean` field lands on `ExtensionManifest` and the filter generalizes.

## `packages/shell/src/extensions-panel/extensions-panel-state.svelte.ts` (NEW)

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

## `packages/shell/src/extensions-panel/extensions-panel.svelte` (NEW)

A rendering component. Receives `manager: ExtensionManager` as a prop. Reads `manager.listExtensions()` reactively (SvelteMap mutation propagates via Svelte's reactivity). Internally:

- Filters out `id === 'workbench'`.
- Uses `Fuse.js` over `manifest.displayName + manifest.description` (both keys), with the same threshold + ignoreLocation settings the palette uses.
- Renders the dialog scaffolding identical in shape to `quick-pick.svelte`: fixed-position centered overlay, `role="dialog"`, `aria-label="Extensions"`, header strip + search input + scrollable list + empty-state message.
- Each list row shows displayName + version + description + a single Enable/Disable button. Disabled rows render at lower opacity (the dimming demonstrated in the brainstorm mockup).
- Keyboard model:
  - **ArrowUp / ArrowDown** moves a highlight; wraps at edges; mouse hover updates highlight.
  - **Enter** on the highlighted row toggles `manager.setEnabled(record.manifest.id, !record.enabled)`. The button's `onclick` does the same. Both call paths share a `toggle(record)` helper.
  - **Escape** calls `extensionsPanelState.close()`.
  - **Tab** uses default browser tab order (see Non-goals: no focus trap this iteration).
- The Enable/Disable button calls `event.stopPropagation()` so a click on the button does NOT bubble to a row click that might be interpreted as "select row" later. (Today there's no row-level click handler distinct from the button, but the precaution is cheap.)
- Empty state — `filtered.length === 0` AND `query === ''`: render "No extensions installed."
- No-search-match — `filtered.length === 0` AND `query !== ''`: render "No matching extensions."

The component does NOT mutate `extensionsPanelState` directly; it calls `extensionsPanelState.close()` only on Escape. Click-outside dismissal lives in `ExtensionsPanelHost`.

The component is structured as a thin renderer over the `ExtensionsPanel` class internals, per the project's `feedback_svelte_class_wrappers` convention. Specifically: a `class ExtensionsPanelView` (private state for `query`, `highlightIndex`, helper `toggle(record)` method) is constructed once at mount and exposed to the template via `view.<getter>`. This matches the `feedback_svelte_class_wrappers` memory's "C# conventions for `.svelte.ts` reactive state lives in classes" guidance, applied at the component boundary. Component-internal state (`query`, `highlightIndex`) doesn't need to leak out — the class wraps it cleanly.

Implementation details kept aligned with `quick-pick.svelte` where the pattern is identical (Fuse usage, highlight reset on filter change, render-with-bolded-matches helper if we elect to also bold matches in the panel — leaning yes, parity with palette).

## `packages/shell/src/extensions-panel/extensions-panel-host.svelte` (NEW)

Mirrors `quick-pick-host.svelte` byte-for-byte at the structural level — only the names, the dialog's `aria-label`, and the underlying state singleton differ.

```svelte
<script lang="ts">
  import { modalState } from '../modal-state.svelte';
  import type { ExtensionManager } from '../extension-host/extension-manager';
  import ExtensionsPanel from './extensions-panel.svelte';
  import { extensionsPanelState } from './extensions-panel-state.svelte';

  let { manager }: { manager: ExtensionManager } = $props();

  const open = $derived(extensionsPanelState.isOpen);

  $effect(() => {
    modalState.active = open;
  });

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

The `aria-label="Extensions"` selector pairs with the panel's matching `aria-label`. Per the precedent set in `quick-pick-host.svelte` (whose `aria-label="Command palette"` is the same shape), this keeps click-outside detection scoped tightly. When a future overlay lands with a different aria-label, the selector for THIS host stays correct.

The `modalState.active` mirroring — and the implicit behavior that opening this panel while a quick pick is also open is impossible at the singleton level (the panel's `open()` throws) — makes the two overlays safely mutually exclusive without any `if (modalState.active) close()` cleanup logic.

> **Note on `$effect` usage.** The two `$effect` blocks here (modal-state mirror + click-outside listener wiring) follow the existing `quick-pick-host.svelte` pattern verbatim. Project-wide reflection on `$effect` conventions — especially around when an effect should be a class method vs a component-level effect, and how to test effect chains in isolation — is a future task captured in the spec's Follow-ups. Not blocking for this iteration.

## `packages/shell/src/extensions-panel/extensions-panel-state.test.ts` (NEW)

Five tests covering the state singleton:

1. `isOpen` is `false` by default.
2. `open()` flips `isOpen` to `true`.
3. `close()` flips `isOpen` to `false`.
4. `open()` while already open throws `'Extensions panel already open'`.
5. `open()` while `modalState.active === true` throws `'Another modal overlay is open'`. (The test sets `modalState.active = true` directly to simulate a quick-pick being open without going through `quickPickState`.)
6. `close()` while not open is a no-op (does not throw).

The `afterEach` hook resets `extensionsPanelState` (calls `close()`) and `modalState.active = false` to prevent cross-test leakage. Pattern mirrors `quick-pick-state.test.ts`.

## `packages/shell/src/extensions-panel/extensions-panel.test.ts` (NEW)

Component tests using `@testing-library/svelte`. Test extensions are constructed inline. The `manager` prop is constructed via `createExtensionManager(createRegistry())` and registered with three test extensions plus a workbench-id'd test extension to verify the filter.

| #   | Test                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Renders one row per registered extension, EXCEPT the one with `id === 'workbench'`.                               |
| 2   | Each row shows displayName + version + description (when present) + Enable/Disable button matching enabled state. |
| 3   | Test extension WITHOUT a `description` renders without a description block (no empty `<p>` placeholder).          |
| 4   | Disabled rows have lower opacity (verify via class or computed style).                                            |
| 5   | Search input filters rows via Fuse over displayName + description.                                                |
| 6   | ArrowDown advances the highlight; ArrowUp reverses; both wrap at edges.                                           |
| 7   | Enter on the highlighted row calls `manager.setEnabled(id, !currentEnabled)`.                                     |
| 8   | Click on Enable/Disable button calls `manager.setEnabled(id, !currentEnabled)`.                                   |
| 9   | Empty list (only workbench registered) renders "No extensions installed."                                         |
| 10  | Search yielding no matches renders "No matching extensions."                                                      |
| 11  | Escape calls `extensionsPanelState.close()`.                                                                      |

`manager.setEnabled` is a real call (no mocking) — the panel's behavior asserts on the manager's resulting `listExtensions()` state in tests 7 and 8.

## `packages/shell/src/extensions-panel/extensions-panel-host.test.ts` (NEW)

| #   | Test                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Renders nothing when `extensionsPanelState.isOpen === false`.                                                  |
| 2   | Renders `<ExtensionsPanel />` when `extensionsPanelState.open()` is called; unmounts when `close()` is called. |
| 3   | Sets `modalState.active = true` while open and back to `false` when closed.                                    |
| 4   | Click outside the dialog closes the panel.                                                                     |
| 5   | Click inside the dialog does NOT close the panel.                                                              |

Mirrors `quick-pick-host.test.ts` shape. `flushSync` from `svelte` is used to flush reactive effects between assertions, matching the existing pattern.

## `packages/shell/src/built-in/workbench/index.ts` — workbench wiring

The factory signature `createWorkbenchExtension(registry: Registry)` is **unchanged**. The body of `activate` grows two new register calls plus two new pushes to `context.subscriptions`; the manifest's `description` field updates.

The existing JSDoc on the factory is updated to mention both surfaces.

The manifest's `description` field updates from:

```ts
description: "The shell's built-in extension. Registers the command palette and Ctrl+Shift+P.",
```

to:

```ts
description: "The shell's built-in extension. Registers the command palette (Ctrl+Shift+P) and the extensions panel (Ctrl+Shift+X).",
```

Inside `activate`, after the existing palette command + keybinding registration:

```ts
const showExtensions = context.host.commands.registerCommand({
  id: 'workbench.extensions.action.showInstalledExtensions',
  title: 'Show Installed Extensions',
  category: 'Workbench',
  run: () => {
    extensionsPanelState.open();
  },
});

const extensionsKeybinding = context.host.keybindings.registerKeybinding({
  key: 'Ctrl+Shift+X',
  command: 'workbench.extensions.action.showInstalledExtensions',
});

context.subscriptions.push(showExtensions, extensionsKeybinding);
```

The workbench imports `extensionsPanelState` from `../../extensions-panel/extensions-panel-state.svelte`. The command's `run` callback calls `extensionsPanelState.open()` directly — no `manager` reference needed at the command-callback layer because the panel reads `manager` via the prop chain (`main.ts` → `App` → `ExtensionsPanelHost`). Per YAGNI, the workbench factory does NOT grow a `manager` parameter in this iteration; if a future workbench iteration needs to invoke `manager` programmatically (e.g., a "disable all extensions" command), that's when the parameter lands.

## `packages/shell/src/built-in/workbench/index.test.ts` — workbench tests

Existing tests are updated only for the description string change in any assertion that reads `extension.manifest.description`. New tests:

| #   | Test                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | After `extension.activate(context)`, `registry.listCommands()` contains a command with `id: 'workbench.extensions.action.showInstalledExtensions'`, title `Show Installed Extensions`, category `Workbench`.                   |
| 2   | After `activate`, `registry.listKeybindings()` contains a binding `Ctrl+Shift+X` → `workbench.extensions.action.showInstalledExtensions`.                                                                                      |
| 3   | Running the command (`registry.executeCommand('workbench.extensions.action.showInstalledExtensions')`) opens the panel: `extensionsPanelState.isOpen` becomes `true`. (`afterEach` resets via `extensionsPanelState.close()`.) |
| 4   | Disposing the workbench's subscriptions disposes the new command + keybinding registrations.                                                                                                                                   |

Existing test count grows by ~4 in this file.

## `packages/shell/src/main.ts` — wiring

The `manager.register(createWorkbenchExtension(registry), { enabled: true })` call is unchanged. The `App` mount gains a new prop:

```diff
 mount(App, {
   target: document.getElementById('app')!,
-  props: { registry },
+  props: { registry, manager },
 });
```

## `packages/shell/src/app.svelte` — manager prop + panel host mount

Two edits:

```diff
 <script lang="ts">
   import type { Registry } from './extension-host/registry';
+  import type { ExtensionManager } from './extension-host/extension-manager';
   import QuickPickHost from './quick-pick/quick-pick-host.svelte';
+  import ExtensionsPanelHost from './extensions-panel/extensions-panel-host.svelte';

-  let { registry }: { registry: Registry } = $props();
+  let { registry, manager }: { registry: Registry; manager: ExtensionManager } = $props();
```

```diff
   <QuickPickHost />
+  <ExtensionsPanelHost {manager} />
 </main>
```

## `packages/shell/src/app.test.ts` — manager prop

Test setup updates: every `mount` / `render` of `App` constructs a `manager` (via `createExtensionManager(registry)`) and passes it as a prop. No new tests; the existing tests don't need to assert on panel behavior (that's `extensions-panel-host.test.ts`'s job).

## `docs/roadmap.md` — propagation

Two edits to the Phase B section:

**Edit A — append new B6 line.** Find the existing B5 line (the per-extension manifest metadata bullet) and add a new bullet IMMEDIATELY AFTER it:

```md
- [x] **B6: Extensions panel** — centered overlay opened via `Ctrl+Shift+X` or palette; lists bundled extensions with displayName, version, description, Enable/Disable button; first marketplace UI consumer of `Extension.manifest.description`. Spec: [`specs/2026-05-02-extensions-panel.md`](specs/2026-05-02-extensions-panel.md).
```

**Edit B — append new Considering line under "Feature extensions → Considering".** After the existing "Road scanning" entry:

```md
- [ ] **Sidebar / activity-bar chrome** — persistent UI region that would host the extensions panel (sidebar-mounted variant alongside the existing overlay), settings, output, search, etc. Trigger: a second sidebar tenant emerges (settings, output, search), OR operator UX feedback says the overlay is insufficient for longer browsing tasks. Operator-UX framing: floating/disappearing UI is the default; persistent chrome must justify its viewport cost.
```

The Phase A, the rest of Phase B above B5, Phase C, the rest of Feature extensions, and Maintenance section are unchanged.

## `docs/vs-code-alignment.md` — propagation

**Append two new Alignments rows** (after the existing "Per-extension manifest carries identity + presentation metadata" row added by ADR-0007):

```md
| `workbench.extensions.action.showInstalledExtensions` command id | ✓ | ✓ | [spec 2026-05-02-extensions-panel](specs/2026-05-02-extensions-panel.md) |
| `Ctrl+Shift+X` default keybinding for the extensions panel | ✓ | ✓ | [spec 2026-05-02-extensions-panel](specs/2026-05-02-extensions-panel.md) |
```

**Append one new Divergences row:**

```md
| Extensions panel surface | sidebar drawer + main-editor detail pane | centered overlay (palette-styled, no scrim) | [spec 2026-05-02-extensions-panel](specs/2026-05-02-extensions-panel.md) | A second sidebar tenant emerges, OR operator UX feedback says the overlay is insufficient for longer browsing tasks |
```

The Deferrals table is unchanged.

## `docs/out-of-scope.md` — propagation

Add ONE new entry under `## Extension machinery`, immediately after the existing "Programmatic extension activation ordering / dependency declaration" entry:

```md
- **Programmatic extension enable/disable API.** No `host.extensions.setEnabled(id, bool)` for third-party extensions to toggle other extensions. Today only the workbench built-in (which has direct `ExtensionManager` access) drives enable/disable, in response to user UI interaction via the extensions panel. _Trigger to revisit:_ first third-party consumer that needs programmatic toggle of a sibling extension (e.g. a "preset" extension that activates a curated set of others). When triggered, the API likely lives on `host.extensions.*` and requires capability-declaration plumbing first.
```

The other entries in `## Extension machinery` (Declarative `contributes`, Activation events, etc.) and the `## Tooling / process` and `## Why this list exists` sections are unchanged.

## Files modified / added

| Path                                                                   | Change                                                                                                                                                               |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/shell/src/extensions-panel/extensions-panel-state.svelte.ts` | NEW. ~30 lines. Singleton state with `isOpen`, `open()`, `close()`, dual guard (already-open + modalState.active).                                                   |
| `packages/shell/src/extensions-panel/extensions-panel-state.test.ts`   | NEW. ~50 lines, 6 tests.                                                                                                                                             |
| `packages/shell/src/extensions-panel/extensions-panel.svelte`          | NEW. ~150 lines. Component with internal class, Fuse search, keyboard nav, render-with-highlight helper.                                                             |
| `packages/shell/src/extensions-panel/extensions-panel.test.ts`         | NEW. ~200 lines, 11 tests.                                                                                                                                           |
| `packages/shell/src/extensions-panel/extensions-panel-host.svelte`     | NEW. ~30 lines. Mirrors `quick-pick-host.svelte` structure.                                                                                                          |
| `packages/shell/src/extensions-panel/extensions-panel-host.test.ts`    | NEW. ~80 lines, 5 tests.                                                                                                                                             |
| `packages/shell/src/built-in/workbench/index.ts`                       | MODIFY. Description string updated; two new register calls inside `activate` (command + keybinding); two new pushes to `context.subscriptions`. ~12 lines added net. |
| `packages/shell/src/built-in/workbench/index.test.ts`                  | MODIFY. Existing description assertion updated; ~4 new tests for the new command + keybinding.                                                                       |
| `packages/shell/src/main.ts`                                           | MODIFY. One line: `props: { registry, manager }` instead of `{ registry }`.                                                                                          |
| `packages/shell/src/app.svelte`                                        | MODIFY. Two import additions; prop signature gains `manager`; `<ExtensionsPanelHost {manager} />` mount added inside `<main>`.                                       |
| `packages/shell/src/app.test.ts`                                       | MODIFY. Test setup constructs a `manager` and passes it as a prop in every `App` render. No new tests.                                                               |
| `docs/specs/2026-05-02-extensions-panel.md`                            | NEW. This file.                                                                                                                                                      |
| `docs/plans/2026-05-02-extensions-panel.md`                            | NEW. Per writing-plans skill.                                                                                                                                        |
| `docs/roadmap.md`                                                      | MODIFY. Append B6 line; append "Sidebar / activity-bar chrome" Considering line.                                                                                     |
| `docs/vs-code-alignment.md`                                            | MODIFY. Append two Alignments rows; append one Divergences row.                                                                                                      |
| `docs/out-of-scope.md`                                                 | MODIFY. Append "Programmatic extension enable/disable API" entry under `## Extension machinery`.                                                                     |

No ADR. The decisions in this iteration extend established patterns (modal overlay singleton, workbench command, panel-as-prop-receiver) — no load-bearing alternatives that future readers need a "why" for. Spec captures the sidebar deferral reasoning in its Context + Non-goals; roadmap holds the persistent reminder.

## Branching and commit

Implementation runs on `feat/extensions-panel` off master, merged with `git merge --no-ff feat/extensions-panel` per CLAUDE.md.

Spec + plan land on master directly in one `docs:` commit before the feature branch starts. Mirrors prior precedent (e.g. `docs: ADR-0006 + Phase C1 spec` and the recent `docs: ADR-0007 + spec + plan for extension manifest`).

Commits on the feature branch (proposed split):

1. **`feat(shell): extensions-panel state + components`** — adds the three new files in `packages/shell/src/extensions-panel/` (state + panel + host) plus their three test files. After this commit `pnpm check` is clean (the new files self-consistently import from each other and from existing modules), `pnpm test` is clean (the new test files cover the new code), but `pnpm dev` would not yet show the panel because `app.svelte` doesn't mount it and the workbench doesn't register the command.
2. **`feat(workbench): extensions-panel command + Ctrl+Shift+X keybinding`** — adds the new command + keybinding registration inside `createWorkbenchExtension`'s `activate`; updates the workbench's manifest description; adds 4 tests in `built-in/workbench/index.test.ts`. After this commit, `pnpm test` passes including the new workbench tests; running the command opens the panel state, but the panel still doesn't mount in the running app because `app.svelte` doesn't mount the host yet.
3. **`feat(shell): wire extensions-panel into app.svelte and main.ts`** — adds the `manager` prop on `App`, mounts `<ExtensionsPanelHost />`, updates `main.ts` to pass `manager` as a prop. After this commit, `pnpm dev` shows the working panel: Ctrl+Shift+X opens it, rows render, toggles work, click-outside dismisses. **Green state for the iteration.**
4. **`docs: extensions-panel propagation — roadmap, ledger, out-of-scope`** — all doc updates in one commit.

Per CLAUDE.md, plan execution uses `superpowers:subagent-driven-development`: dispatch a fresh implementer subagent per task, follow with spec compliance + code quality reviews, address review feedback in separate `Code-review-followup:` commits on the same branch.

After all four commits land, dispatch a final cross-cutting code review over the full branch, then merge via `superpowers:finishing-a-development-branch` with `git merge --no-ff feat/extensions-panel`.

## Verification

- `pnpm format && pnpm lint` clean across the workspace at the end of commits 3 and 4.
- `pnpm check` clean across all four packages at the end of commits 1–4.
- `pnpm test` passes after each commit. Total test count grows by approximately 26 (~6 panel-state + ~11 panel + ~5 panel-host + ~4 workbench additions). Per-package counts: shell grows from 150 to ~176; the three extension packages unchanged. Compute the exact post-merge test count when commit 3 lands and update the plan's verification section to match.
- `pnpm dev` smoke (post-commit-3, before commit 4): app boots; press **Ctrl+Shift+X** → panel opens; `Workbench: Show Installed Extensions` appears in the palette; selecting it from the palette also opens the panel; rows render for example, sitl, vehicle-status (workbench hidden); search filters; clicking Disable on Vehicle Status removes the footer item; clicking Enable restores it; Esc + click-outside both close; modalState integration prevents the panel and palette from being open simultaneously; reload preserves the disabled/enabled state via existing B4 persistence.
- Manual cross-doc check: open `docs/roadmap.md` after commit 4 and confirm B6 + the new Considering line are both present and correctly formatted; confirm the spec link resolves; open `docs/vs-code-alignment.md` and confirm the three new rows render in their respective tables; open `docs/out-of-scope.md` and confirm the new entry is positioned under `## Extension machinery`.

## VS Code alignment

| Concern                                                          | VS Code                                  | gcscode                                     | Notes                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command id `workbench.extensions.action.showInstalledExtensions` | ✓                                        | ✓                                           | Aligned. Internal-consistency only — operators don't fire commands by id; the alignment helps future third-party extensions and agentic workers map vocabulary.                             |
| Default keybinding `Ctrl+Shift+X`                                | ✓                                        | ✓                                           | Aligned. Same internal-consistency rationale. Operator-UX-side rationale: dedicated keybinding for a recurring feature surface is a better fit than tucking it under Ctrl+Shift+P → search. |
| Command title "Show Installed Extensions"                        | ✓                                        | ✓                                           | Aligned. Visible in the palette.                                                                                                                                                            |
| Surface presentation                                             | Sidebar drawer + main-editor detail pane | Centered overlay (palette-styled, no scrim) | **Divergence.** Operator-UX win — telemetry/map/video must remain visible; persistent sidebar costs viewport forever. The sidebar mounting is a future option, not a deferred-must-do.      |
| Extensions render with description                               | ✓                                        | ✓                                           | Aligned. First consumer of ADR-0007's `description?`.                                                                                                                                       |
| Install / uninstall flows                                        | Marketplace + `.vsix` install            | Neither — bundle-time only                  | Existing divergence; surfaced again in this iteration's table for completeness.                                                                                                             |
| Per-contribution toggle                                          | ✓                                        | ✗ — whole-extension only                    | Existing deferral; surfaced again for completeness.                                                                                                                                         |
| Filter chips ("Installed", "Enabled", "Disabled")                | ✓                                        | ✗ — search input only                       | New deferral, not promoted to ledger Deferrals row (too small). Trigger: 10+ bundled extensions OR operator feedback.                                                                       |
| Icons on extension rows                                          | ✓                                        | ✗ — no icon slot                            | New deferral. Trigger: `icon?` field lands on `ExtensionManifest`.                                                                                                                          |

Two new Alignments rows + one new Divergences row land in the cumulative ledger (per the propagation section). No new Deferrals rows promoted (the field-by-field deferrals are too small to warrant ledger entries; they're captured here for the iteration record).

## Follow-ups (out of scope for this iteration)

- **Project-wide reflection on `$effect` usage conventions.** Two `$effect` blocks in this iteration's `extensions-panel-host.svelte` mirror the same pattern in `quick-pick-host.svelte`. Eventually worth a focused review of when `$effect` is the right primitive, when state should move into a class instead, and how to test effect chains. Not blocking. Trigger: pattern accumulates 5+ component-level `$effect` sites OR a real test-for-effect-chain pain point surfaces.
- **Sidebar / activity-bar chrome.** Captured in roadmap as Considering. Trigger: a second sidebar tenant emerges (settings, output, search), OR operator UX feedback says the overlay is insufficient for longer browsing tasks. When triggered, the panel grows a second mounting (sidebar-docked variant) rather than migrating off the overlay.
- **`host.extensions.setEnabled(id, bool)` for third-party programmatic control.** Captured in `out-of-scope.md`. Trigger: first third-party consumer.
- **Per-contribution toggle (disable just one command from an extension).** Stays under the existing `out-of-scope.md` Declarative `contributes` manifest entry. Trigger unchanged.
- **Filter chips ("Installed", "Enabled", "Disabled").** No deferral entry created — too small. Add when 10+ extensions exist OR operator feedback fires.
- **Icons on extension rows.** Adds when `ExtensionManifest` gets `icon?` per ADR-0007's growth conventions.
- **Focus trap inside the panel.** Default tab order in v1; revisit when an a11y pass lands.
- **Animation on panel open/close.** Snap-in mirrors palette today; revisit on operator feedback.
- **System extension tag (`system?: boolean` on `ExtensionManifest`).** Premature with one system extension (workbench). Trigger: a second system extension lands, at which point the UI-layer hardcoded filter generalizes.
- **"Expand row for details" / extension page in main area.** Crude version is one-row-per-extension. Trigger: a richer manifest field like `readme?` or `changelog?` lands, OR operator feedback.
- **Dependency-aware enable/disable cascade.** Enabling extension X should auto-enable its declared dependencies; disabling a dependency should warn (or block) when dependents are still enabled. The data model (declared `extensionDependencies` on the manifest) is captured in `docs/out-of-scope.md` under "Extension activation ordering / dependency declaration"; the panel-UX consequence (cascade) lands in the same iteration as the data model. Trigger unchanged from the existing out-of-scope entry: first ordering bug, OR third-party producer/consumer pair, OR manifest-driven enable persistence.
