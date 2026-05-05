# dockview-svelte — manual verification checklist

The Chrome DevTools MCP could not be used at verification time because another
Chrome profile lock was held by a previous session. The behaviors below are
**not auto-verified** and should be stepped through manually before merging.

## Setup

```sh
cd /Users/kevinkroon/Projects/gcscode/.worktrees/dockview-svelte/shell
pnpm --filter dockview-svelte demo
```

Open `http://localhost:5174/` in any browser. The page should render:

- A toolbar with five buttons: **Add panel**, **Update active panel**, **Pop out group**, **Save layout**, **Load layout**.
- A dockview area underneath with three panels: an **Editor** stacked with an **Output** in the same group, and a **Side** panel split right.

## Behavior 1 — `$state`-backed reactive props (pitfall #2)

1. Click the **Editor** tab to make sure the editor panel is the active panel.
2. Open DevTools → Elements panel → inspect the `<code data-testid="revision">` element inside the editor panel.
3. Click **Update active panel**.
4. **Expected:** the displayed revision number changes (`1` → some `Date.now()` value), and in the Elements panel the same `<code>` DOM node retains identity (text content updates without remount). No tab flickers and no visible reload.
5. Click **Update active panel** again — the number should change again, same DOM node.

If this works, `mountSvelteComponent`'s `$state(...)` proxy + `Object.assign(reactiveProps, newProps)` mutation is propagating per-key reactivity correctly.

## Behavior 2 — context propagation across popout (pitfall #3)

1. Click the **Output** tab to make it active. The output panel reads `getDockviewContext()` in its `<script>` block and renders `containerApi.id` / `panelApi.id` derived from the context.
2. Click **Pop out group**.
3. **Expected:** a new browser window opens containing the dockview group with the output panel inside.
4. Inside the popout window, the panel's `container api id` and `panel api id` rows must show non-empty values (e.g. `panel api id (via context): output-1`).

If the popout window's panel renders these IDs from context (not from `(none)`), then `mount({ context: Map })` is the correct mechanism — the Svelte instance and its context map survived dockview-core's DOM re-parenting into the new window.

## Behavior 3 — `unmount()` lifecycle hygiene (pitfall #1)

1. Open DevTools → Console.
2. Click the **Side** tab. The console should already show a log like `[side-panel side-1] mounted` from the initial render.
3. Reload the page (Cmd-R / Ctrl-R).
4. **Expected:** the console shows a `[side-panel side-1] destroyed` log, paired with a fresh `[side-panel side-1] mounted` log.
5. There must be **no** "effect ran on disposed component" warnings, and **no** Svelte warnings about reactivity leaks.

Optional stress test: click the close button (×) on the side-panel's tab — the destroyed log should fire. Then click **Add panel** and close it the same way. Each panel should pair its mount log with a destroy log.

If this works, `mountSvelteComponent`'s `unmount(instance)` call on dispose is wired correctly.

## Pass criteria

All three behaviors must pass for the branch to be considered done. If any fails, the corresponding pitfall in `src/utils.svelte.ts` is broken — open the file and re-read the relevant comment block. The three pitfalls are:

1. `$state({ ...initialProps })` (not a plain object) — drives per-key reactive updates.
2. `unmount(instance)` on dispose (not just letting the instance be GC'd) — tears down the reactive graph.
3. `mount(Component, { context: Map })` (not host-component `setContext`) — context survives popouts because the panel is its own mounted Svelte tree.
