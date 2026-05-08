# dockview-svelte followups

Notes carried forward from the initial overnight implementation (`feat/dockview-svelte`,
2026-05-05). Pick these up before publishing, or when the next dockview-core bump lands.

---

## 1. Paneview's double-wrapped `params` is a fragile coupling

**Where:** `packages/dockview-svelte/src/paneview/view.ts:62-75` (`SveltePanePanelSection.update`)

**What's happening:** `dockview-core`'s `PaneviewPanel` runs panel state through two
layers before it reaches a renderer's `update()`:

1. `BasePanelView.update(event)` merges `event.params` into the panel's own params bag.
2. `PaneviewPanel.getComponent()` returns an `IFrameworkPart` wrapper that forwards
   to the body/header renderers as `{ params: <bag> }`.

By the time it reaches `SveltePanePanelSection.update`, the shape is
`event.params = { params: <merged-user-params> }` — one extra `params` wrap compared
to dockview, splitview, and gridview. Upstream's React adapter never sees this because
React passes params straight through (no flat-prop unwrap). Vue absorbs it because Vue
panels receive a single `{ params: {...}, api, containerApi, title }` slot prop and
the extra wrap happens to fit.

We chose flat props for Svelte (one of the three deliberate deviations in the spec —
the rationale was that `<script lang="ts"> let { foo } = $props()` reads cleaner than
`let { params } = $props(); const { foo } = params`). To make flat props work, the
update path unwraps `event.params.params` once, with a fallback to `event.params` if
the inner key is missing.

**Why this matters:**

- The unwrap-or-fallback masks regressions. If a future dockview-core release "fixes"
  the double-wrap (or changes its shape another way), the fallback quietly loads the
  wrong thing — tests still pass, runtime behavior is silently wrong.
- The shape we depend on isn't documented in dockview-core's public API. We're coupled
  to an internal detail of `PaneviewPanel.getComponent` + `BasePanelView.update`.
- The other three views (dockview/splitview/gridview) don't need this — paneview is
  the only one with this shape — which is itself a smell that something is off in
  upstream's paneview lifecycle.

**What to do (in order of escalation):**

1. **Regression-pin.** Add a test that asserts the exact double-wrapped shape we're
   unwrapping. Today `__tests__/paneview.test.ts` validates that updates propagate
   to the rendered panel; it does not assert the wire shape. Pin
   `event.params = { params: {...} }` so an upstream shape change fails CI.
2. **Investigate upstream.** File a question on the dockview repo: is the double-wrap
   intentional (paneview-specific contract) or accidental (leaked internal state)?
   If accidental, contribute a fix; if intentional, ask for it to be documented.
3. **Consider reversing the deviation.** If upstream confirms the double-wrap stays
   forever, switch the Svelte paneview to single-prop shape (mirror Vue:
   `let { params, api, title, containerApi } = $props()`) so the unwrap disappears.
   Trade-off: every paneview consumer destructures one extra layer. Worth it if it
   buys us alignment with upstream's actual contract.

**Do not** silently delete the fallback (`?? (event.params as ...)`). Either keep it
with a comment explaining the failure mode, or replace it with a thrown error so the
shape mismatch is loud rather than silent.

---

## 2. Other followups from the overnight implementer

Captured in the implementer's task report (2026-05-05). Listed here as one place to
triage rather than scattered across commit messages.

- **`SveltePart<P>` generic constraint** — currently `P extends Record<string, unknown>`.
  The implementer noted this may be too permissive for some renderer types. Re-check
  during the upstream-parity review.
- **Context-menu wrap signature** — the `SvelteContextMenuItemRenderer.init` signature
  diverges slightly from upstream's `ReactContextMenuItemPart` shape. Verify against
  dockview-core's `IContextMenuItemRenderer` interface when bumping core.
- **`layout()` is a no-op** — Svelte renderers don't react to layout calls (Svelte's
  reactivity handles re-render). Confirm dockview-core never calls `layout()` to
  signal something we'd actually need to act on.
- **`onDidDrop` smoke-test only** — drop/drag scenarios are covered by a single smoke
  test that wires the subscription but never fires a drop. Test name was relabeled
  during code-review-followup to be honest about what it covers. Add full
  drag-and-drop integration tests before publishing.
- **`props.components` reactivity test bypasses the `$effect` path under test.**
  `__tests__/dockview.test.ts:147-185` calls `api.updateOptions({ createComponent })`
  directly instead of re-rendering the wrapper with new `components` props, so the
  `$effect` block at `dockview.svelte:213-227` is uncovered. Spec §Tests item 6 calls
  this scenario out explicitly. Fix: use `@testing-library/svelte`'s `rerender(...)`
  with new `components` props, or pass `components` as a `$state` proxy and mutate it.
- **No build pipeline yet** — package ships as source-as-entrypoint (gcscode pattern).
  Before publishing to npm, set up library-mode Vite build with `.d.ts` emission.

---

## 3. Visual verification

`docs/dockview-svelte-manual-checklist.md` is a stopgap because Chrome DevTools MCP
was unavailable during the overnight run. Once Chrome MCP works again, automate the
three load-bearing demonstrations:

1. Panel update without remount (`panel.update({ params })` mutates props in place).
2. Popout window context survival (Svelte context propagates across windows via the
   `mount({ context: Map })` option).
3. Mount/destroy log pairing (every `mount()` is matched by an `unmount()`).
