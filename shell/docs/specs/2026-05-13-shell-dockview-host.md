# Shell dockview content host — replace view stack with dockview-svelte

**Status:** Approved (2026-05-13)

## Context

The shell's content area currently iterates `registry.listViews()` and stacks every registered view as a sibling DOM element:

```svelte
{#each views as { id, component: Component } (id)}
  <Component />
{/each}
```

Four extensions register views today (`example`, `map`, `map-demo`, `sitl`), so the content area renders four components on top of each other simultaneously. This was acceptable while the extension architecture was being built — phases A, B, C deliberately deferred UI/UX decisions. With dockview-svelte landed (`2026-05-05-dockview-svelte.md`, merged in `a66cfd5`), the cheapest version of "actual UI" is now possible.

This iteration is an explicit experiment: replace the view stack with a `DockviewSvelte` instance, host registered views as panels in a single tabbed group, and constrain the dockview configuration so it doesn't read as a generic IDE. **It is NOT a commitment to dockview as the final operator surface.** The actual operator-UX direction — including whether persistent IDE-style chrome is appropriate for GCS operators at all — is deferred to a larger UI/UX iteration that this experiment may inform.

Two background constraints make this iteration safe:

- The shell's current content area is unstyled HTML. There is essentially nothing to destroy by replacing it.
- A prior dockview experiment in the user's work GCS showed real operator value (pulling out video, rearranging telemetry) for a subset of users while leaving product-management lukewarm. We want a hands-on version of that here, in the open, before deciding anything permanent.

## Implementation workflow override

The new reviews-as-artifacts PR workflow (per `docs/specs/2026-05-12-reviews-as-artifacts.md` and the corresponding CLAUDE.md sections) is **NOT** used for this iteration. The GitHub App linkage has not yet been validated in isolation; the user wants to test that separately rather than couple a UI experiment with workflow validation.

For this iteration, the implementation agent:

1. **Does NOT** run `gh pr create --draft` after the first task commit. Implementation work stays on the local `feat/<topic>` branch in the worktree throughout the iteration.
2. **Does NOT** invoke `.claude/scripts/gh-app-token` or call `gh pr review` from any reviewer subagent. Per-task spec-compliance, per-task code-quality, and final cross-cutting reviewers return their summaries to the controller in-session only. The existing followup-loop pattern is preserved purely in chat.
3. **Merges locally** when the iteration completes: `git merge --no-ff feat/<topic>` on master (matching the `f448ddc Merge branch 'feat/plugin-architecture-mvp'` precedent), then `git push origin master`. The GitHub remote exists and push is permitted.

This spec's override outranks CLAUDE.md's general PR-workflow guidance for this iteration only. CLAUDE.md is not modified. The next iteration returns to the default PR workflow unless its own spec opts out.

The reviews-as-artifacts validation expectation (per its "Validation" section) shifts: this iteration is explicitly NOT the first-validation candidate. A later iteration, chosen after the user tests the GitHub App linkage in isolation, takes that role.

## Goals

- Replace `app.svelte`'s view-stack content area with a single `DockviewSvelte` instance.
- Add a required `title: string` field to `ViewContribution`; update all existing extensions accordingly.
- Configure dockview such that operators cannot close extension-owned panels and cannot pop panels out to floating windows.
- Keep tab-drag-drop, splitters, and multi-group splitting enabled — the affordances that justify the experiment.
- Add a small layout-shell pass so header/footer behave like a regular app frame (necessary because dockview requires a fixed-size container).
- Preserve the existing "no extensions registered" empty state.
- Preserve all other shell chrome unchanged: header, status bar, quick pick overlay, extensions panel overlay.

## Non-goals

- **No layout persistence.** Dockview's layout is rebuilt from `registry.listViews()` on every load; the user's drag-rearrangement does NOT survive refresh. This is **explicitly desired** for the experimental phase — refresh-as-reset is a feature, not a limitation. Persistence is deferred until the larger operator-UX iteration revisits.
- **No custom theming.** Default dockview CSS only. No `--dv-*` token overrides, no operator-grade styling pass. Styling belongs to the larger UI/UX iteration.
- **No view-container concept.** All registered views land in a single dockview surface. VS Code's named-region model (sidebar / panel / secondary sidebar) is not introduced.
- **No `ViewContribution.icon?`, `description?`, or `tooltip?` fields.** No view needs them; defer to first real consumer.
- **No `where`-style placement hints from extensions.** Extensions cannot declare "I belong in the main area" or "I belong in a sidebar." Single tabbed group is the host's call.
- **No floating/popout panel groups.** Disabled via `disableFloatingGroups: true`. Forward-compat with Electron is uncertain.
- **No "Reset layout" command or keybinding.** Refresh already resets (non-goal #1).
- **No custom tab content beyond text label.** The host's custom tab component renders text only.
- **No reviews-as-artifacts PR workflow.** Per the override above.

## Architecture

### Top-level structure of `app.svelte`

The `<section class="shell__content">` view-iteration block is replaced by a `<DockviewSvelte>` instance plus an empty-state branch:

```svelte
<section class="shell__content min-h-0 flex-1">
  {#if views.length === 0}
    <p data-testid="empty-state">No extensions registered.</p>
  {:else}
    <DockviewSvelte
      components={{ 'view-host': ViewHost }}
      defaultTabComponent="gcscode-tab"
      tabComponents={{ 'gcscode-tab': GcscodeTab }}
      onReady={handleReady}
      disableFloatingGroups
    />
  {/if}
</section>
```

(Exact prop names match `dockview-svelte`'s public API; the plan resolves any naming discrepancies.)

### View hosting indirection

Dockview's `components` prop is a static map of component-name → Svelte component, but our views are runtime-registered. The standard pattern is a single host component that dispatches via `params`:

- Register one `view-host` panel-component: `components={{ 'view-host': ViewHost }}`.
- `view-host.svelte` reads `params.component` (a Svelte `Component` reference) and renders it.
- Each call to `api.addPanel` references `'view-host'` and passes the actual view component via `params`:
  ```ts
  api.addPanel({
    id: view.id,
    component: 'view-host',
    title: view.title,
    params: { component: view.component },
  });
  ```

### Reactive sync (registry → dockview panels)

A single `$effect` reconciles dockview's panel set against `registry.listViews()`. The snippet below is illustrative pseudo-code — the plan resolves exact Svelte 5 runes syntax, `$state` initialization, and dockview-core API call shapes:

```ts
let dockviewApi: DockviewApi | undefined = $state();
const views = $derived(registry.listViews());

$effect(() => {
  if (!dockviewApi) return;
  const desired = new Map(views.map((v) => [v.id, v]));
  const current = new Map(dockviewApi.panels.map((p) => [p.id, p]));

  // Remove panels for views no longer registered.
  for (const [id, panel] of current) {
    if (!desired.has(id)) dockviewApi.removePanel(panel);
  }

  // Add panels for newly-registered views.
  for (const [id, view] of desired) {
    if (!current.has(id)) {
      dockviewApi.addPanel({
        id,
        component: 'view-host',
        title: view.title,
        params: { component: view.component },
      });
    } else {
      // Existing panel: update params if the component reference changed
      // (e.g. extension re-activate, HMR).
      const existing = current.get(id)!;
      if (existing.params?.component !== view.component) {
        existing.api.updateParameters({ component: view.component });
      }
    }
  }
});
```

`onReady` captures the api into `dockviewApi`; the `$effect` fires once for initial seeding and again whenever `registry.listViews()` changes. Initial layout (single tabbed group) emerges naturally — `addPanel` without a `position` opts into the active group, so all initial panels land in one group.

### Custom tab component

Dockview-core's default tab renders both a label and a close button. We need the label and not the close button. The cleanest path:

- Copy `dockview-svelte`'s `DefaultTab` into the shell as `gcscode-tab.svelte`, omitting the close-button element.
- Register it under `tabComponents={{ 'gcscode-tab': GcscodeTab }}` and set `defaultTabComponent: 'gcscode-tab'` so every panel uses it.

The custom tab component remains in the shell package (not in `dockview-svelte`) since it's gcscode-specific.

### Disabled affordances

- `disableFloatingGroups: true` — no popout windows.
- Close button: removed at the tab-component level (above).
- Layout persistence: nothing is stored; nothing is restored.

### Shell layout

`<main class="shell">` becomes a viewport-height vertical flex column so header/dockview/footer behave like a normal app frame:

```svelte
<main class="shell flex h-screen flex-col">
  <header class="shell__header">GCScode</header>
  <section class="shell__content min-h-0 flex-1">
    <!-- DockviewSvelte or empty state -->
  </section>
  <footer class="shell__statusbar ...">...</footer>
  <QuickPickHost />
  <ExtensionsPanelHost {manager} />
</main>
```

`min-h-0` on the content section is load-bearing: without it the dockview container expands beyond its parent and breaks the flex layout.

## API change — `ViewContribution`

```ts
// Before
export interface ViewContribution {
  id: string;
  component: Component;
}

// After
export interface ViewContribution {
  id: string;
  component: Component;
  title: string;
}
```

`title` is required, not optional. Rationale: every view now renders a tab. There is no sensible fallback — the view's `id` reads as a developer string. An optional field with id-fallback is a foot-gun for extension authors who forget to set it.

### Migration impact

| Extension | New title |
|---|---|
| `extension-example` | `'Example'` |
| `extension-map` | `'Map'` |
| `extension-map-demo` | `'Map (demo)'` |
| `extension-sitl` | `'SITL'` |

Test files mocking `registerView` need adjusting in the same task that adds the field — mechanical fan-out, no behavioral change.

### What `title` is for

- The text rendered in the dockview tab.
- Nothing else in this iteration. Future iterations may use it in the command palette ("Show view: SITL"), in an extensions-panel "views provided" listing, etc. — but those are not part of this iteration.

## Empty state and shell chrome

### Empty state

When `views.length === 0`, render the existing `<p data-testid="empty-state">No extensions registered.</p>` and skip the dockview entirely. The existing test continues to pass verbatim. Reaching this state requires the user to disable every bundled extension via the extensions panel; with default bundling it is unreachable.

### Surrounding chrome — unchanged

| Surface | Today | After |
|---|---|---|
| `<header class="shell__header">GCScode</header>` | Plain text | Unchanged content; positioned in the flex column |
| `<footer class="shell__statusbar">` | Iterates `registry.listStatusBarItems()` | Unchanged |
| `<QuickPickHost />` | Modal overlay | Unchanged |
| `<ExtensionsPanelHost />` | Centered overlay | Unchanged |
| `<section class="shell__content">` | View stack | **Becomes `<DockviewSvelte>` (or empty-state)** |

Touching header/footer styling, overlay backdrop, or any other chrome is out of scope — those decisions belong to the larger operator-UX iteration.

## Testing strategy

Behavior tests are the priority; visual / styling assertions are not. The user has explicitly accepted that finicky tests may be dropped in favor of a documented manual smoke check — gcscode is a hobby project and this iteration is an experiment.

### High-value behavior tests (target — keep these working)

- **Tab title rendering.** Register a view with title `'X'`; assert a tab with text `'X'` is in the DOM.
- **Registry → dockview add.** Start with one view; register a second; assert two tabs are present.
- **Registry → dockview remove.** Start with two views; unregister one; assert the corresponding panel is gone.
- **Close affordance absent.** Render one view; assert no close-button affordance exists in the tab DOM.
- **Empty state preserved.** With zero views registered, assert `data-testid="empty-state"` is present and no dockview is rendered.

### Optional behavior tests (drop if finicky)

- **Component reference change.** Register a view, update its component reference, assert the rendered output changed. This may be hard to drive cleanly via test infra; if so, document the dropped test in a code comment and add a manual smoke step.
- **`disableFloatingGroups` config.** Asserting the config flag is set is trivial; asserting popout doesn't happen requires interaction. Skip the interaction test.

### Excluded from automated testing

- Drag-drop interactions, splitter resize, multi-group layout — these are dockview-core's surface, not ours.
- Visual styling, theme — no overrides applied.
- Layout persistence — explicitly not implemented (non-goal).

### Manual smoke checklist (run before merge)

The implementation agent must run through this checklist manually and report results before declaring the iteration complete. Add the checklist as a section to the iteration's PR or merge commit body:

1. Boot the dev server (`pnpm dev`); the shell loads without errors.
2. Four tabs visible: `Example`, `SITL`, `Map (demo)`, `Map`.
3. Click each tab; the active panel switches. No console errors.
4. Drag a tab onto another tab's group — the dragged tab joins. Drag a tab to a group edge — a new group is created.
5. Drag a splitter between groups — groups resize.
6. Confirm tabs have no close button. Pressing keyboard shortcuts that might trigger close (Ctrl+W, etc.) does NOT close panels.
7. Confirm no "pop out" / floating-window affordance is exposed (no shift+drag popout, no context-menu "Move to new window").
8. Refresh the page — layout returns to the default single tabbed group with all four tabs. (Confirms persistence is NOT happening.)
9. Open the extensions panel (Ctrl+Shift+X), disable all four view-registering extensions one by one; assert tabs disappear as each is disabled, and the empty-state `<p>` appears once all are disabled.
10. Re-enable extensions; assert tabs reappear.

If any item fails and isn't trivially fixable, the implementation agent stops and reports to the controller for a decision.

## VS Code alignment

| Concept | gcscode | VS Code | Status |
|---|---|---|---|
| View tab label | `ViewContribution.title: string` (required) | `views` contribution `name: string` field | Aligned in spirit, diverges in naming (`title` matches gcscode's existing `CommandContribution.title`) |
| View layout surface | Single `DockviewSvelte` instance, single tabbed group seed, drag-drop + splitters enabled, close + floating disabled | Named view containers (sidebar / panel / secondary sidebar); each container is a PaneView-style accordion of views | Deliberate divergence — VS Code's view-container concept is not introduced. Placeholder until larger UI/UX iteration decides regions. |
| View close affordance | Disabled by host; extensions own panel lifecycle | Some views have close affordances; user-dismissible | Deliberate divergence — gcscode has no user-dismissible view model |
| Layout persistence | None — refresh resets layout | Workspace layout persisted across sessions | Deliberate divergence; explicit non-goal (refresh-as-reset is desired) |
| Floating/popout panels | Disabled (`disableFloatingGroups: true`) | Supported since VS Code 1.84 | Deferred — Electron compat uncertain |

After this iteration ships, propagate each row to `docs/vs-code-alignment.md` (the cumulative ledger).

## `docs/out-of-scope.md` propagation

New rows to add when this iteration ships:

- **Layout persistence for the dockview surface.** Refresh resets the layout. Deferred deliberately — refresh-as-reset is desired during the experimental phase. _Trigger to revisit:_ user feedback that layout reset on reload is annoying, OR the larger UI/UX iteration that supersedes this experimental layout.
- **Floating/popout panel groups.** `disableFloatingGroups: true` on the dockview surface. _Trigger to revisit:_ gcscode targets Electron AND someone validates dockview popout under Electron's `contextIsolation` / preload setup.
- **View containers (named regions for grouping views).** No VS Code-style sidebar / panel / secondary-sidebar concept. All registered views land in one dockview surface. _Trigger to revisit:_ the larger operator-UX iteration that decides what regions the app actually has, OR an extension that needs to declare "I belong in the sidebar, not the main area."
- **Custom dockview theming / `--dv-*` token overrides.** This iteration uses dockview-core's default theme as-is. _Trigger to revisit:_ the operator-UX iteration that establishes a gcscode design system; rolls in alongside the existing "Theme tokens / CSS-variable system for extension styling" row.

Rows already present that are reinforced (no edits needed):

- "Sidebar / activity-bar chrome" in `roadmap.md` — this iteration explicitly does NOT establish that.
- "Theme tokens / CSS-variable system for extension styling" — this iteration explicitly does NOT establish that.

Per-iteration scope cuts (stay in this spec only, NOT propagated):

- `ViewContribution.icon?`, `description?`, `tooltip?` fields.
- Multi-instance views (same view registered twice).
- Custom tab content beyond text label.
- `where`-style placement hints from extensions.

## Validation

This iteration is workflow-pragmatic: the manual smoke checklist (above) plus the high-value automated behavior tests are the validation surface. There is no separate integration-test phase.

Pass criteria:

- All high-value automated behavior tests pass.
- The manual smoke checklist passes in full, or any failing item is documented with a decision (fix-now vs. defer-with-spec-update).
- `pnpm build`, `pnpm test`, `pnpm check`, `pnpm lint` all clean.

Rollback plan: this iteration touches one Svelte file (`app.svelte`), one interface field (`ViewContribution.title`), and four extension `registerView` call sites. If something blocks mid-iteration, the changes can be reverted as a single commit; no infrastructure or persistent state is involved.

## Known unknowns

- **`min-h-0` interaction with tailwind.** The flex-layout shell relies on `min-h-0` on the content section so dockview can shrink to its parent's height. Tailwind v4 should expose this utility; if not, fall back to inline `style="min-height: 0"`.
- **Dockview-core's component update model.** If `updateParameters` doesn't reliably re-render the panel content when the Svelte `Component` reference changes (during extension re-activate or HMR), the fallback is `removePanel` + `addPanel` in the reconcile loop. The plan picks one approach and the test (if it survives) validates.
- **Tab DOM structure after custom tab component.** The exact DOM markup of a custom tab depends on what `dockview-svelte`'s `DefaultTab` exposes for copying. If the abstraction doesn't permit clean omission of the close button, the fallback is CSS — hide the close button via `:where(.dv-tab-close-button) { display: none }` scoped to the shell. The plan picks one.

## Future iterations referenced

- **Larger operator-UX iteration.** This iteration is explicitly a placeholder. The "real" decision about whether gcscode uses persistent IDE-style chrome at all, what regions the app has, theming, etc. — gets its own brainstorm. Triggered when the experiment has been lived in long enough to inform the conversation.
- **Reviews-as-artifacts workflow validation.** Per `2026-05-12-reviews-as-artifacts.md`, that iteration's validation is "live, on the next iteration." This iteration explicitly defers that role to a later iteration after the GitHub App linkage is tested in isolation.
- **Layout persistence.** Deferred. Triggered by user feedback or the larger UI/UX iteration.

## Origin

The trigger was a casual user observation that the shell now has "manifests, multiple views and sections" and the dockview-svelte adapter has just landed — making this the cheapest moment to wire dockview in on real views. The user has prior dockview experience from a separate work GCS app; that experiment showed real operator value for a subset of users (pulling out video, rearranging telemetry) but lukewarm reception from product management.

Memory background that shaped scoping:

- gcscode users are GCS operators, not developers — UI decisions cannot assume IDE-familiarity.
- Floating/disappearing UI is the operator-UX default; persistent chrome must justify its viewport cost.
- VS Code alignment is for internal API consistency only — not for user-facing UI.
- The user prefers small focused iterations with the YAGNI option as the lead alternative.

These constraints pushed the iteration toward "experiment-with-constraints-and-explicit-placeholder-framing" rather than "commit to dockview as the operator surface."
