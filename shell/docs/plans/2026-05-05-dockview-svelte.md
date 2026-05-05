# Implementation plan — dockview-svelte

Spec: [`../specs/2026-05-05-dockview-svelte.md`](../specs/2026-05-05-dockview-svelte.md)
Branch: `feat/dockview-svelte`
Worktree: `/Users/kevinkroon/Projects/gcscode/.worktrees/dockview-svelte/` (the git repo root is `/Users/kevinkroon/Projects/gcscode/`; the gcscode shell project — where the pnpm workspace lives — is at `<repo-root>/shell/`)
Working directory inside the worktree: `/Users/kevinkroon/Projects/gcscode/.worktrees/dockview-svelte/shell/`

## Mode

This is **autonomous overnight execution**: a single implementer agent works the plan end-to-end without per-task review checkpoints. The implementer commits per task, runs the verification gate at the end, and only then reports back. A separate code-reviewer agent runs after the implementer completes — its findings are addressed in `Code-review-followup:` commits on the same branch (not amends).

This deviates from gcscode's standard subagent-driven-development pattern (which interleaves quality review per task) because dockview-svelte is **not a gcscode iteration** — it's a standalone artifact and the user has explicitly opted out of gcscode's iteration cadence for this work.

## Worktree cwd discipline (CRITICAL — read before issuing any bash command)

The bash tool resets cwd between calls. A single `cd <path>` does NOT persist. Two failure modes have been observed in this repo before:
1. Commits land on `master` instead of the feat branch.
2. The main checkout's working tree gets edited (e.g. `pnpm format` touches files outside the worktree).

**Required discipline for every bash command:**

1. Prepend `cd /Users/kevinkroon/Projects/gcscode/.worktrees/dockview-svelte/shell && ` to every bash command. The absolute path is required because cwd does NOT persist across calls.
2. Before every `git commit`, chain `git branch --show-current` and verify it reads `feat/dockview-svelte`. If it reads `master`, STOP — your cwd is the main checkout, not the worktree.
3. Run `pnpm format` / `pnpm test` / `pnpm check` / `pnpm lint` only with the worktree-cd prefix, otherwise they read/edit the main checkout.

## Reference materials (already on local disk)

- `scratch/dockview/packages/dockview-vue/` — closest analog to mirror.
- `scratch/dockview/packages/dockview/` — the React adapter the user originally pointed at; useful for the `IDockviewSvelteProps` shape and the per-prop `$effect` cadence.
- `scratch/dockview/packages/dockview-core/` — published as `dockview-core` on npm; `^6.0.1` is the version to depend on.
- The spec itself — re-read the "Core architecture: the bridge" and "Public components" sections any time you're stuck on a Svelte-specific call.

## Tasks

### Task 1 — Scaffold the package

**Goal:** A `packages/dockview-svelte/` directory that `pnpm install` recognizes as a workspace member, with the package.json + tsconfig + svelte.config + vitest config from the spec.

**Steps:**
1. Create `packages/dockview-svelte/` with `src/`, `src/__tests__/`, `demo/`, `demo/src/`, `demo/src/panels/` subdirectories.
2. Write `package.json` (literally the JSON in spec §"Dependencies").
3. Write `tsconfig.json` extending `../../tsconfig.base.json`. Reference an existing extension package's tsconfig for the include/exclude shape (e.g. `packages/extension-map/tsconfig.json`).
4. Write `svelte.config.js` with `vitePreprocess()` only (mirror `packages/shell/svelte.config.js`).
5. Write `vitest.config.ts` mirroring the shape of `packages/shell/vite.config.ts` (which doubles as vitest config): plugins `svelte()` and `svelteTesting()`, `environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/__tests__/test-setup.ts']`. Skip the `tailwindcss` plugin (not needed) and the `maplibre-gl` deps.inline workaround. Create `src/__tests__/test-setup.ts` with the single line `import '@testing-library/jest-dom/vitest';` (matches `packages/shell/src/test-setup.ts`).
6. Write a placeholder `src/index.ts` (`export {};`) — will be filled in task 6.
7. Write a minimal `README.md` with title, one-paragraph summary, install + usage example matching the spec's Goal section.
8. Run `pnpm install` from the repo root to register the new workspace package. This pulls `dockview-core` from npm into the workspace.

**Verification:**
- `pnpm --filter dockview-svelte check` runs (may produce 0 errors trivially given empty src).
- `pnpm --filter dockview-svelte test` runs and reports "no tests found" without erroring.

**Commit:** `feat(dockview-svelte): scaffold package`

### Task 2 — The bridge: `mountSvelteComponent` + renderer classes + context

**Goal:** `src/utils.svelte.ts` and `src/context.ts` from the spec, fully typed against `dockview-core`'s renderer interfaces.

**Steps:**
1. Write `src/context.ts` per spec §"Context propagation". Define separate symbol keys for dockview / splitview / gridview / paneview contexts and corresponding `getDockviewContext()` / `getSplitviewContext()` / `getGridviewContext()` / `getPaneviewContext()` typed helpers.
2. Write `src/utils.svelte.ts`:
   - `mountSvelteComponent<P>(Component, initialProps, element, context?) → MountedComponent<P>` — exact shape from spec §"`mountSvelteComponent` (the panel-component bridge)". File extension MUST be `.svelte.ts` for `$state` to compile.
   - `AbstractSvelteRenderer` — creates the `dv-svelte-part` host element with `height: 100%; width: 100%`.
   - `SvelteRenderer` — implements `IContentRenderer` + `ITabRenderer`. `init` builds the `DockviewSvelteContext` map and passes it to `mountSvelteComponent`. Note: `IContentRenderer` requires a `layout(width, height)` method — make it a noop. May also need stub `_onDidFocus` / `_onDidBlur` `DockviewEmitter`s if the interface requires them; mirror upstream Vue's `VueRenderer` (which does NOT have them — verify against the live `IContentRenderer` type, since upstream React's version DOES).
   - `SvelteWatermarkRenderer` — `IWatermarkRenderer`.
   - `SvelteHeaderActionsRenderer` — `IHeaderActionsRenderer`. Constructor takes `(component, group)`. `init({ containerApi, api })` subscribes to all five group/api events listed in spec §"Renderer classes" via a `DockviewCompositeDisposable` held in a `DockviewMutableDisposable`. On each event, calls `_renderDisposable.update(...)` with the freshly-derived enriched props.
   - `SvelteContextMenuItemRenderer` — `IContextMenuItemRenderer`.
   - `SvelteTabGroupChipRenderer` — `ITabGroupChipRenderer`. Constructor sets host element `display: inline-flex` and clears `width`/`height`.
   - `SveltePart<P>` — generic standalone part class.

**Verification:**
- `pnpm --filter dockview-svelte check` passes with zero errors.
- All renderer classes correctly implement their respective dockview-core interfaces (the typechecker catches missing methods).

**Commit:** `feat(dockview-svelte): mount-svelte-component bridge + renderer classes`

### Task 3 — Bridge tests

**Goal:** `src/__tests__/utils.test.ts` exercises the three load-bearing pitfalls.

**Test cases (minimum):**
1. `mountSvelteComponent` mounts the component into the target element (assert child node count).
2. `update()` propagates without remount: mount a Svelte test component that displays `params.title` and stores its mount-time `Date.now()` in a const. Call `update({ title: 'B' })`. Assert the displayed title changed AND the mount-time const did NOT change (proves no remount). Use `flushSync()` from `'svelte'` to force pending effects.
3. `dispose()` removes the rendered DOM (target's child count returns to 0) and a subsequent `update()` is a noop OR throws — pick one and document the choice in `utils.svelte.ts`.
4. `context` map is visible to descendants: mount a Svelte component that reads `getContext('test-key')` and renders the value. Pass a context map with `[['test-key', 'hello']]`. Assert the value renders.
5. `mountSvelteComponent` calls `unmount`: mount a component with a `$effect` that increments a counter when its props change. Dispose. Mutate a prop after dispose. Assert the counter does not increment again.

**Verification:**
- `pnpm --filter dockview-svelte test` passes.

**Commit:** `feat(dockview-svelte): bridge tests`

### Task 4 — DockviewSvelte component

**Goal:** `src/dockview/dockview.svelte`, `src/dockview/types.ts`, `src/dockview/default-tab.svelte`.

**Steps:**
1. Write `src/dockview/types.ts` with `IDockviewSvelteProps` + `SvelteContextMenuItemConfig` + `IDockviewTabGroupChipProps` (the latter is adapter-defined upstream — see `scratch/dockview/packages/dockview/src/dockview/reactTabGroupChipPart.ts:5-8`; copy verbatim with the type imports adapted).
2. Write `src/dockview/dockview.svelte`:
   - `<script lang="ts">` block per spec §"`<DockviewSvelte>`" sketch.
   - Mirror upstream React (`scratch/dockview/packages/dockview/src/dockview/dockview.tsx`) line-by-line: every `React.useEffect` becomes a `$effect` block keyed off the corresponding props.
   - The `DEFAULT_SVELTE_TAB` magic-name pattern follows upstream React's `DEFAULT_REACT_TAB = 'props.defaultTabComponent'` exactly: when `props.defaultTabComponent` is set, register it under that magic name in the local `frameworkTabComponents` map and pass the magic name as `defaultTabComponent` in `frameworkOptions`. The `createTabComponent` callback looks up `options.name` against the local map.
   - The `getTabContextMenuItems` / `getTabGroupChipContextMenuItems` props need wrapping: `dockview-core` expects items with `component: string`, but our `SvelteContextMenuItemConfig` has `component?: Component<IContextMenuItemComponentProps>`. Wrap the user's callback to translate framework items into core items, registering each Svelte component under a generated id keyed in a per-item lookup; mirror upstream React.
3. Write `src/dockview/default-tab.svelte` — port `defaultTab.tsx` to Svelte 5. Renders title, close button, middle-click-to-close. Props: `IDockviewPanelHeaderProps`. CSS-class names should match upstream's (`dv-default-tab`, etc.) so dockview-core's theme CSS applies.

**Verification:**
- `pnpm --filter dockview-svelte check` passes.

**Commit:** `feat(dockview-svelte): DockviewSvelte component + default tab`

### Task 5 — DockviewSvelte tests

**Goal:** `src/__tests__/dockview.test.ts` proves end-to-end usage works, with the `updateParameters` reactivity test as the centerpiece.

**Test cases (minimum):**
1. Renders an empty dockview: mount `<DockviewSvelte components={{}} onReady={fn}>`, assert the host `<div>` is in the DOM.
2. `onReady` fires with an `api`.
3. `api.addPanel({ id: 'a', component: 'a' })` mounts the registered component into a tab group. Assert the panel's content is rendered.
4. `panel.api.updateParameters({ title: 'X' })` reactively updates the panel without remount: mount a panel that displays `params.title` AND captures its mount-time random id in a `<script>` const. Add the panel, assert title 'A'. Call `updateParameters({ title: 'X' })`. Assert title became 'X' AND the random id is unchanged (proves no remount).
5. Watermark, header actions, drop event subscription smoke tests (each: mount, trigger from the api, assert callback fires).
6. Re-passing `props.components` updates `createComponent` for newly-added panels.

**Verification:**
- `pnpm --filter dockview-svelte test` passes.

**Commit:** `feat(dockview-svelte): DockviewSvelte tests`

### Task 6 — Splitview / Gridview / Paneview components + tests + index.ts

**Goal:** The remaining three view components shipped with smoke-test coverage and the public index assembled.

**Steps:**
1. `src/splitview/types.ts` — `ISplitviewSvelteProps`, `ISplitviewPanelProps`, `SplitviewReadyEvent`. Mirror `scratch/dockview/packages/dockview/src/splitview/splitview.tsx:15-29`.
2. `src/splitview/splitview.svelte` — mirror upstream React `splitview.tsx` line-by-line.
3. Same for `src/gridview/` and `src/paneview/`. Paneview additionally takes `headerComponents?: Record<string, Component<IPaneviewPanelHeaderProps>>` — see upstream `paneview/paneview.tsx`.
4. Per-view tests in `src/__tests__/{splitview,gridview,paneview}.test.ts`: render, `onReady` fires, `addPanel` mounts component, `updateParameters` is reactive without remount.
5. Write `src/index.ts` per spec §"Public exports".

**Verification:**
- `pnpm --filter dockview-svelte test` passes (all view tests green).
- `pnpm --filter dockview-svelte check` passes.

**Commit:** `feat(dockview-svelte): splitview/gridview/paneview components + tests + public exports`

### Task 7 — Demo app

**Goal:** A working `pnpm --filter dockview-svelte demo` that renders a real dockview with three panel types and the toolbar from spec §"Demo".

**Steps:**
1. `demo/vite.config.ts`:
   - `@sveltejs/vite-plugin-svelte`.
   - `resolve.alias`: `'dockview-svelte': path.resolve(__dirname, '../src/index.ts')` so the demo runs against source.
   - `root: __dirname`.
   - `server.port: 5174` (avoid clash with shell's port 5173).
2. `demo/index.html` — boilerplate, links `dockview-core`'s theme CSS, mounts `<div id="app">`.
3. `demo/src/main.ts` — `mount(App, { target: document.getElementById('app')! })`.
4. `demo/src/app.svelte` — toolbar + `<DockviewSvelte>`. Three buttons: "Add panel", "Update active panel revision", "Pop out group". Plus "Save layout" / "Load layout" (logging only is fine).
5. `demo/src/panels/editor-panel.svelte` — displays `params.fileName` and `params.revision`. Demonstrates pitfall #2.
6. `demo/src/panels/output-panel.svelte` — calls `getDockviewContext()` in `<script>` block and displays the `containerApi.id` (or any non-trivial value derived from context). Demonstrates pitfall #3.
7. `demo/src/panels/side-panel.svelte` — uses `onMount` + `onDestroy` from `'svelte'`, logs to `console.log` on mount + unmount. Demonstrates pitfall #1.
8. Initial layout in `onReady`: add 3 panels in 2 groups (editor stacked with output, side panel split right).

**Verification:**
- `pnpm --filter dockview-svelte demo` boots without console errors. The implementer should run the demo as a background process and confirm.

**Commit:** `feat(dockview-svelte): demo app`

### Task 8 — Verification gate (the "done criteria" run)

**Goal:** Walk every line of spec §"Done criteria" and confirm. This is a hard gate — do not skip.

**Steps:**
1. From the worktree root, run (in this order):
   - `pnpm --filter dockview-svelte check` — must pass with zero errors.
   - `pnpm --filter dockview-svelte test` — all green.
   - `pnpm lint` (root) — passes for new package files. (If it touches files outside the worktree, abort and check cwd discipline.)
2. Start the demo as a background process: `pnpm --filter dockview-svelte demo`. Confirm the URL is reachable.
3. Visual verification via Chrome DevTools MCP:
   - Open the demo URL in a new page.
   - Take a screenshot of the initial 3-panel layout. Save to `scratch/dockview-svelte-verification/01-initial.png`.
   - Take a DOM snapshot. Note the active panel's content `<div>` reference.
   - Click "Update active panel revision". Take another DOM snapshot. Verify: same `<div>` reference (no remount), but text content changed.
   - Save a "before" + "after" screenshot pair to `scratch/dockview-svelte-verification/02-update-{before,after}.png`.
   - Click "Pop out group". A second window/page opens. Take a screenshot of the popout. Save to `scratch/dockview-svelte-verification/03-popout.png`. The popout's panel must display a non-empty `containerApi.id` value (proof that `getDockviewContext()` survived the popout).
   - Reload the original page. Check the console: no warnings about effects firing on disposed components.
4. If Chrome DevTools MCP is unavailable, write `docs/dockview-svelte-manual-checklist.md` with the exact click sequence + expected observations and explicitly flag in the final report which behaviors were not auto-verified.
5. Stop the demo background process.

**No commit.** This is verification only. If any check fails, return to the relevant task and fix the underlying issue before re-running this gate.

### Task 9 — Final report

**Goal:** A concise summary the user can read in the morning to decide whether to merge.

**Steps:**
1. Print a summary message including:
   - Number of files added, total LOC.
   - Test count: `vitest run` summary.
   - Each "done criteria" item with ✓ or ✗.
   - Path to verification screenshots if generated.
   - The exact `git log --oneline` of the feat branch (so the user can see commits in order).
   - Any deviations from the spec (with rationale).
2. Do NOT merge to master. Leave the branch unmerged for the user to review.

## Code review (after implementer completes)

Once the implementer reports done, dispatch a separate code-reviewer agent (general-purpose, fresh context) over the full feat branch. Prompt should include:

- The spec path.
- The branch name and worktree path.
- Instructions to focus on: bridge correctness (especially the three pitfalls — `unmount` on dispose, `$state`-backed prop reactivity, context-via-mount), upstream parity (every Vue/React renderer pattern accounted for), test coverage of the load-bearing reactivity claim, type safety against `dockview-core`'s renderer interfaces, demo correctness.
- Output: a list of findings with severity (blocker / suggestion / nit) and file:line references.

The user resolves review feedback in `Code-review-followup:` commits on the same branch (not amends, per gcscode discipline) — but since the user will be asleep, the implementer should NOT auto-apply review feedback. The review's findings are for the user to triage in the morning.

## Out-of-scope for this plan

- Merging to master.
- Updating `docs/roadmap.md` — dockview-svelte is not on the roadmap and does not belong there.
- Updating `docs/out-of-scope.md` — dockview-svelte deferrals are spec-internal, not gcscode-architectural.
- Updating `docs/vs-code-alignment.md` — not a gcscode iteration.
