# Flight overlay — drone icon + heading line + armed-state visual: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic blue drone marker with a heading-rotated green chevron that distinguishes armed/disarmed visually, and add a 400px screen-space heading line layer to the flight-overlay extension.

**Architecture:** Two `maplibregl.Marker({ element })` DOM-marker layers (drone-icon + heading-line) anchored at the drone's lat/lng. Inline SVG, CSS classes for armed-state styling, CSS `transform: rotate(...)` for heading rotation. No new API surface — all changes are inside `packages/extension-flight-overlay/`. Imperative DOM construction inside `$effect` matches the existing logic-only-Svelte convention used by every other layer in the package.

**Tech Stack:** Svelte 5 (`$effect`, `$state`, `getContext`), maplibre-gl (`Marker`), TypeScript, Vitest, pnpm workspace.

**Spec:** [`docs/specs/2026-05-05-flight-overlay-drone-icon.md`](../specs/2026-05-05-flight-overlay-drone-icon.md) — committed on master as `40a0d40`.

---

## Pre-flight: worktree + branch setup

This plan is executed via subagent-driven development in a git worktree. The repo root is `/Users/kevinkroon/Projects/gcscode/`, the package root is `<repo-root>/shell/`. Per CLAUDE.md "Subagent worktree discipline" — every bash command from a dispatched subagent must prepend `cd <worktree>/shell/ &&`, and every `git commit` must be preceded by `git branch --show-current` to verify the branch is `feat/flight-overlay-drone-icon` (not `master`).

**Setup commands (run by the controller before dispatching task 1):**

```bash
cd /Users/kevinkroon/Projects/gcscode
git worktree add .worktrees/feat-flight-overlay-drone-icon -b feat/flight-overlay-drone-icon master
cd .worktrees/feat-flight-overlay-drone-icon/shell
pnpm install --frozen-lockfile
```

After setup, the worktree path is `/Users/kevinkroon/Projects/gcscode/.worktrees/feat-flight-overlay-drone-icon/`, and all subagent bash commands run with `cd <worktree>/shell &&` as a prefix.

The repo root `.gitignore` already excludes `.worktrees/`, so no untracked-file noise on master.

---

## Task 1: Rename `drone-marker-layer.svelte` → `drone-icon-layer.svelte` and rewrite

**Files:**

- Delete: `packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte`
- Create: `packages/extension-flight-overlay/src/layers/drone-icon-layer.svelte`
- Modify: `packages/extension-flight-overlay/src/index.ts`

This task changes the visual treatment of the existing drone marker. After this task, the existing test "registers three layers" still passes (still 3 layers). The heading line is added in Task 2.

- [ ] **Step 1: Verify branch + working tree**

```bash
cd <worktree>/shell && git branch --show-current
```

Expected: `feat/flight-overlay-drone-icon`

```bash
cd <worktree>/shell && git status
```

Expected: clean working tree (nothing to commit).

- [ ] **Step 2: Use `git mv` to rename the file (preserves git rename detection)**

```bash
cd <worktree>/shell && git mv packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte packages/extension-flight-overlay/src/layers/drone-icon-layer.svelte
```

Expected: no error; `git status` shows `renamed: ... drone-marker-layer.svelte -> drone-icon-layer.svelte`.

- [ ] **Step 3: Replace the file's contents**

Overwrite `packages/extension-flight-overlay/src/layers/drone-icon-layer.svelte` with:

```svelte
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { flightOverlayState } from '../state';

  // Re-declared string literal — public contract per @gcscode/extension-map
  // README. Do not runtime-import from sibling extensions (ADR-0005).
  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';

  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);

  // Drawn pointing up (north) so heading=0 needs no offset rotation.
  const ARROW_SVG = `<svg viewBox="0 0 24 24" width="28" height="28">
    <path d="M12 2 L20 22 L12 17 L4 22 Z" />
  </svg>`;

  let marker: maplibregl.Marker | null = null;
  let element: HTMLDivElement | null = null;

  $effect(() => {
    const map = getMaplibre();
    const sitl = flightOverlayState.sitlExports;
    const lat = sitl?.telemetry.lat ?? null;
    const lng = sitl?.telemetry.lng ?? null;

    if (!map || lat === null || lng === null) {
      marker?.remove();
      marker = null;
      element = null;
      return;
    }

    if (!marker) {
      element = document.createElement('div');
      element.className = 'gcscode-drone-icon';
      element.innerHTML = ARROW_SVG;
      marker = new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }

    const heading = sitl?.telemetry.heading ?? 0;
    const armed = sitl?.telemetry.armed === true;
    // No `transition: transform` — wraparound from 359°→0° would spin
    // the long way around the circle.
    element!.style.transform = `rotate(${heading}deg)`;
    element!.classList.toggle('armed', armed);
  });

  onDestroy(() => {
    marker?.remove();
    marker = null;
  });
</script>

<style>
  /* :global because the maplibre marker container is outside Svelte's
     scoped-CSS reach — the element gets re-parented into maplibre's
     `.maplibregl-marker` wrapper. The `gcscode-drone-icon` prefix
     prevents collisions across extensions. */
  :global(.gcscode-drone-icon) {
    color: #6b7280; /* gray-500, default = disarmed */
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  :global(.gcscode-drone-icon.armed) {
    color: #22c55e; /* green-500, aviation convention for active */
    fill: currentColor;
    stroke: none;
  }
</style>
```

- [ ] **Step 4: Update `index.ts` import to point at the renamed file with the new symbol name**

In `packages/extension-flight-overlay/src/index.ts`, change:

```ts
import DroneMarkerLayer from './layers/drone-marker-layer.svelte';
```

to:

```ts
import DroneIconLayer from './layers/drone-icon-layer.svelte';
```

And inside `activate(context)`, replace the existing `map.registerLayer(DroneMarkerLayer)` call with `map.registerLayer(DroneIconLayer)`. The other `registerLayer` calls (HomeLocationLayer, MaxDistanceCircleLayer) are unchanged. The full `context.subscriptions.push(...)` block after this edit:

```ts
context.subscriptions.push(
  map.registerLayer(DroneIconLayer),
  map.registerLayer(HomeLocationLayer),
  map.registerLayer(MaxDistanceCircleLayer),

  // Recenter command — palette-discoverable as
  // `Flight Overlay: Recenter on Drone`. Same action wired to both the
  // top-right map control button and the palette entry; either path
  // routes through executeCommand.
  context.host.commands.registerCommand({
    // ... unchanged ...
  }),

  // Control `id` and `commandId` happen to share the same string here by
  // ... unchanged ...
  map.registerControl({
    // ... unchanged ...
  }),
);
```

- [ ] **Step 5: Run typecheck + tests + lint**

```bash
cd <worktree>/shell && pnpm check
```

Expected: PASS (no TypeScript / svelte-check errors).

```bash
cd <worktree>/shell && pnpm test
```

Expected: all tests PASS. Specifically the existing `flight-overlay/index.test.ts` tests still pass — `registerLayer` count is still 3, subscription count is still 5 (3 layers + 1 command + 1 control).

```bash
cd <worktree>/shell && pnpm lint
```

Expected: PASS (no ESLint or Prettier errors).

- [ ] **Step 6: Commit**

```bash
cd <worktree>/shell && git branch --show-current
```

Expected output: `feat/flight-overlay-drone-icon`. **If the output is `master`, STOP — the cwd is wrong; do not proceed with the commit.**

```bash
cd <worktree>/shell && git add -A packages/extension-flight-overlay/src/layers/drone-icon-layer.svelte packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte packages/extension-flight-overlay/src/index.ts && git commit -m "$(cat <<'EOF'
feat(flight-overlay): drone-marker-layer → drone-icon-layer with heading rotation + armed-state visual

Replaces the generic teal pin with a green chevron rendered as an
inline-SVG DOM marker. CSS `transform: rotate(${heading}deg)` rotates
the icon to match telemetry heading. A `.armed` class toggle switches
between filled green (#22c55e, aviation convention for active) and
outlined gray (#6b7280, disarmed). No CSS transitions on transform —
wraparound at 359°→0° would spin the long way.

Imperative DOM construction inside `$effect` keeps the package's
existing logic-only-Svelte convention. `:global` CSS scoping with a
`gcscode-drone-icon` class prefix because maplibre re-parents the
element into its own marker container, outside Svelte's scoped-CSS
reach.

The heading line layer is added in the next commit.
EOF
)"
```

- [ ] **Step 7: Verify commit landed on the feat branch, not master**

```bash
cd <worktree>/shell && git log --oneline -3
```

Expected: top commit is the one just made on `feat/flight-overlay-drone-icon`. The previous commit is master's `40a0d40 docs: spec for flight-overlay drone icon...`.

---

## Task 2: Add `heading-line-layer.svelte` and register it

**Files:**

- Create: `packages/extension-flight-overlay/src/layers/heading-line-layer.svelte`
- Modify: `packages/extension-flight-overlay/src/index.ts`
- Modify: `packages/extension-flight-overlay/src/index.test.ts`

This task adds the second new layer and updates the existing test that asserts how many layers register. After this task, both new layers are wired and tested.

- [ ] **Step 1: Create the heading-line layer file**

Write `packages/extension-flight-overlay/src/layers/heading-line-layer.svelte` with:

```svelte
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { flightOverlayState } from '../state';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);

  // viewBox is centered horizontally at 0 with the line drawn from y=0
  // upward to y=-400. Width 8px (4px each side of the stroke) gives the
  // 2px stroke a small horizontal margin so antialiasing stays clean.
  const LINE_SVG = `<svg viewBox="-4 -400 8 400" width="8" height="400">
    <line x1="0" y1="0" x2="0" y2="-400" stroke-width="2" />
  </svg>`;

  let marker: maplibregl.Marker | null = null;
  let element: HTMLDivElement | null = null;

  $effect(() => {
    const map = getMaplibre();
    const sitl = flightOverlayState.sitlExports;
    const lat = sitl?.telemetry.lat ?? null;
    const lng = sitl?.telemetry.lng ?? null;

    if (!map || lat === null || lng === null) {
      marker?.remove();
      marker = null;
      element = null;
      return;
    }

    if (!marker) {
      element = document.createElement('div');
      element.className = 'gcscode-drone-heading-line';
      element.innerHTML = LINE_SVG;
      marker = new maplibregl.Marker({ element }).setLngLat([lng, lat]).addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }

    const heading = sitl?.telemetry.heading;
    const armed = sitl?.telemetry.armed === true;
    const visible = armed && heading !== null && heading !== undefined;
    // display: none when hidden — cheaper than detach/reattach the
    // maplibre marker on every arm/disarm transition.
    element!.style.display = visible ? '' : 'none';
    element!.style.transform = `rotate(${heading ?? 0}deg)`;
  });

  onDestroy(() => {
    marker?.remove();
    marker = null;
  });
</script>

<style>
  :global(.gcscode-drone-heading-line) {
    color: #22c55e; /* same green-500 as armed icon */
    stroke: currentColor;
    opacity: 0.7;
    /* No fill — line element doesn't take fill, but explicit for clarity. */
    fill: none;
    /* Don't intercept pointer events — the line shouldn't block map
       pan/zoom across its 400px length. */
    pointer-events: none;
  }
</style>
```

- [ ] **Step 2: Update `index.ts` to import and register the new layer**

In `packages/extension-flight-overlay/src/index.ts`, add the import alongside the existing layer imports (alphabetical position — between `drone-icon-layer` and `home-location-layer`):

```ts
import DroneIconLayer from './layers/drone-icon-layer.svelte';
import HeadingLineLayer from './layers/heading-line-layer.svelte';
import HomeLocationLayer from './layers/home-location-layer.svelte';
import MaxDistanceCircleLayer from './layers/max-distance-circle-layer.svelte';
```

Inside `activate(context)`, add `map.registerLayer(HeadingLineLayer)` to the subscription list immediately after the drone-icon registration. The full block:

```ts
context.subscriptions.push(
  map.registerLayer(DroneIconLayer),
  map.registerLayer(HeadingLineLayer),
  map.registerLayer(HomeLocationLayer),
  map.registerLayer(MaxDistanceCircleLayer),

  // Recenter command — palette-discoverable as
  // ... existing comment block + registerCommand call unchanged ...
  context.host.commands.registerCommand({
    id: 'gcscode.flight-overlay.recenter',
    title: 'Recenter on Drone',
    category: 'Flight Overlay',
    run: () => {
      // ... existing run body unchanged ...
    },
  }),

  // ... existing control comment block + registerControl call unchanged ...
  map.registerControl({
    id: 'gcscode.flight-overlay.recenter',
    position: 'top-right',
    icon: { kind: 'lucide', name: 'crosshair' },
    tooltip: 'Recenter on drone',
    commandId: 'gcscode.flight-overlay.recenter',
  }),
);
```

- [ ] **Step 3: Update the test that asserts registered layer count**

In `packages/extension-flight-overlay/src/index.test.ts`, the test at line 51 reads:

```ts
it('activate registers three layers when map is active', () => {
  // ...
  expect(fakeMap.registerLayer).toHaveBeenCalledTimes(3);
  expect(subscriptions).toHaveLength(5); // 3 layers + 1 command + 1 control
  // ...
});
```

Change it to:

```ts
it('activate registers four layers when map is active', () => {
  // ...
  expect(fakeMap.registerLayer).toHaveBeenCalledTimes(4);
  expect(subscriptions).toHaveLength(6); // 4 layers + 1 command + 1 control
  // ...
});
```

Three edits to that block:

1. The `it(...)` description string: `'three layers'` → `'four layers'`.
2. `toHaveBeenCalledTimes(3)` → `toHaveBeenCalledTimes(4)`.
3. `toHaveLength(5)` → `toHaveLength(6)` AND the inline comment `// 3 layers + 1 command + 1 control` → `// 4 layers + 1 command + 1 control`.

No other tests in this file need updating — they don't depend on the layer count.

- [ ] **Step 4: Run typecheck + tests + lint**

```bash
cd <worktree>/shell && pnpm check
```

Expected: PASS.

```bash
cd <worktree>/shell && pnpm test
```

Expected: all tests PASS. The updated count assertion now expects 4 layers / 6 subscriptions, matching the new registrations.

```bash
cd <worktree>/shell && pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd <worktree>/shell && git branch --show-current
```

Expected: `feat/flight-overlay-drone-icon`. **If `master`, STOP.**

```bash
cd <worktree>/shell && git add packages/extension-flight-overlay/src/layers/heading-line-layer.svelte packages/extension-flight-overlay/src/index.ts packages/extension-flight-overlay/src/index.test.ts && git commit -m "$(cat <<'EOF'
feat(flight-overlay): add heading-line layer

Adds a second DOM-marker layer rendering a 400px screen-space green
stroke extending from the drone in the heading direction. Same imperative
construction pattern as drone-icon-layer; same lat/lng anchor and rotation
transform, so the line and icon stay visually paired without sub-pixel
drift. Hidden via `display: none` when disarmed or when heading is null —
cheaper than detach/reattach on every arm/disarm transition.

`pointer-events: none` on the wrapper because a 400px-long element
shouldn't block map pan/zoom across its full reach. Same green-500
(#22c55e) as the armed icon, with 70% opacity so it doesn't fully
obscure underlying map detail.

Test: registered-layer count assertion updated 3→4, subscription count
5→6.
EOF
)"
```

- [ ] **Step 6: Verify**

```bash
cd <worktree>/shell && git log --oneline -3
```

Expected: top commit is this task's, second is Task 1's.

---

## Task 3: README update

**Files:**

- Modify: `packages/extension-flight-overlay/README.md`

Update the package README to reflect the new visual treatment.

- [ ] **Step 1: Read the current README**

```bash
cd <worktree>/shell && cat packages/extension-flight-overlay/README.md
```

Expected: the current README starts with `# @gcscode/extension-flight-overlay` and contains the line `Registers three layers on the map:` followed by a bulleted list with `- **Drone marker** — point geometry, position from live SITL telemetry...`.

- [ ] **Step 2: Replace the lead-in line and the bulleted list**

Edit `packages/extension-flight-overlay/README.md`:

Change:

```markdown
First consumer of the `@gcscode/extension-map` contribution API. Registers three layers on the map:

- **Drone marker** — point geometry, position from live SITL telemetry (`gcscode.sitl` exports).
- **Home location** — point geometry, hardcoded coordinates in `flight-overlay-config.ts`.
- **Max-distance circle** — polygon approximation of a geodesic circle around the home location, hardcoded radius.
```

To:

```markdown
First consumer of the `@gcscode/extension-map` contribution API. Registers four layers on the map:

- **Drone icon** — inline-SVG chevron at SITL's live position, rotated by `telemetry.heading`. Filled green (`#22c55e`) when armed, outlined gray (`#6b7280`) when disarmed.
- **Heading line** — 400px screen-space green stroke extending from the drone in the heading direction. Hidden when disarmed.
- **Home location** — point geometry, hardcoded coordinates in `flight-overlay-config.ts`.
- **Max-distance circle** — polygon approximation of a geodesic circle around the home location, hardcoded radius.
```

The "Layers render no visible DOM themselves; each is a Svelte component that calls maplibre APIs imperatively..." sentence below stays unchanged — the new layers still render no template (they construct the DOM marker imperatively in `$effect`).

- [ ] **Step 3: Lint + format check**

```bash
cd <worktree>/shell && pnpm format
```

Expected: PASS — only the README is touched, Prettier may reformat trivial whitespace; if so, that's expected.

```bash
cd <worktree>/shell && pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd <worktree>/shell && git branch --show-current
```

Expected: `feat/flight-overlay-drone-icon`. **If `master`, STOP.**

```bash
cd <worktree>/shell && git add packages/extension-flight-overlay/README.md && git commit -m "$(cat <<'EOF'
docs: README updates for flight-overlay drone-icon iteration

Lead-in "three layers" → "four layers". Drone-marker bullet replaced
with separate drone-icon and heading-line bullets describing the new
visual treatment (rotation, armed/disarmed coloring, screen-space line).
EOF
)"
```

---

## Task 4: Docs propagation — VS Code alignment ledger + roadmap

**Files:**

- Modify: `docs/vs-code-alignment.md`
- Modify: `docs/roadmap.md`

Per CLAUDE.md and the existing iteration pattern (e.g., `dc13679 docs: roadmap + alignment ledger + out-of-scope propagation for map controls iteration`), these propagation edits land in a single docs commit at the end of the iteration. No `out-of-scope.md` edits are needed (per the spec — all deferrals are per-iteration scope cuts).

### 4a — `docs/vs-code-alignment.md`

- [ ] **Step 1: Add a row to the Alignments table**

In `docs/vs-code-alignment.md`, the `## Alignments` table contains rows like:

```markdown
| Service-style extension exposing contribution surface for other extensions | ✓ (editor + decorations / hover providers / language services) | ✓ (`gcscode.map` + `registerLayer`) | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md) |
```

Add a new row at the bottom of the Alignments table (before the `## Divergences` header):

```markdown
| State-driven visual on a DOM-anchored marker (model property → CSS class → styled DOM) | ✓ (editor decorations, git-status icon overlays, debug breakpoints) | ✓ (`flight-overlay` drone icon: `armed` telemetry → `.armed` class → fill/stroke swap) | [spec 2026-05-05-flight-overlay-drone-icon](specs/2026-05-05-flight-overlay-drone-icon.md) |
```

The row goes in the Alignments section because the pattern matches VS Code's approach. There's no API to align (drone state is domain-specific UI, not a host primitive), so this is a "pattern aligned in spirit" entry — typed identically to other "aligned in spirit" rows already in the table.

### 4b — `docs/roadmap.md`

- [ ] **Step 2: Add two entries under `### Considering (not yet committed)`**

In `docs/roadmap.md`, the `### Considering (not yet committed)` subsection currently contains:

```markdown
### Considering (not yet committed)

- [ ] **Road scanning** — _description TBD_
- [ ] **Sidebar / activity-bar chrome** — persistent UI region that would host the extensions panel (sidebar-mounted variant alongside the existing overlay), settings, output, search, etc. Trigger: a second sidebar tenant emerges (settings, output, search), OR operator UX feedback says the overlay is insufficient for longer browsing tasks. Operator-UX framing: floating/disappearing UI is the default; persistent chrome must justify its viewport cost.
```

Add two new bullets immediately after the `Sidebar / activity-bar chrome` line (preserving the existing entries):

```markdown
- [ ] **Map filter extension** — registry where extensions contributing map elements expose user-toggleable visibility (e.g., heading line, max-distance circle, future tracks/breadcrumbs). Trigger: second consumer wants opt-out of a sibling extension's layer. Surfaced during the drone-icon brainstorm (`docs/specs/2026-05-05-flight-overlay-drone-icon.md`).
- [ ] **Map viewport constraints** — `maxBounds` + minimum zoom in `extension-map` so panning doesn't escape useful bounds and zoom-out doesn't reveal world-wrapping. Trigger: operator UX feedback or first integration test that surfaces an antimeridian artifact. Surfaced during the drone-icon brainstorm (`docs/specs/2026-05-05-flight-overlay-drone-icon.md`).
```

The existing `Flight overlay` entry under `### Coming (committed — will ship)` is already ticked (`[x]`). This iteration polishes that feature rather than adding a new feature extension, so no new tick to add there.

### 4c — Verify and commit

- [ ] **Step 3: Run lint + format**

```bash
cd <worktree>/shell && pnpm format
```

Expected: PASS — Prettier may rewrite the alignment-ledger table widths since markdown tables get column-aligned; if so, that's expected.

```bash
cd <worktree>/shell && pnpm lint
```

Expected: PASS.

```bash
cd <worktree>/shell && pnpm test
```

Expected: PASS (no code changed, but defensively rerun in case of any cross-file dependency).

- [ ] **Step 4: Commit**

```bash
cd <worktree>/shell && git branch --show-current
```

Expected: `feat/flight-overlay-drone-icon`. **If `master`, STOP.**

```bash
cd <worktree>/shell && git add docs/vs-code-alignment.md docs/roadmap.md && git commit -m "$(cat <<'EOF'
docs: alignment ledger + roadmap propagation for drone-icon iteration

Alignment ledger gains one row: state-driven visual on a DOM-anchored
marker (model property → CSS class → styled DOM), aligned in spirit
with VS Code editor decorations / git-status icon overlays / debug
breakpoints. No API to align — drone state visualization is
domain-specific UI, not a host primitive.

Roadmap gains two Considering entries surfaced during the brainstorm:
map filter extension (registry for toggling sibling extensions' map
elements; trigger: second consumer wants opt-out) and map viewport
constraints (maxBounds + minZoom in extension-map; trigger: operator UX
feedback or antimeridian artifact in tests).

No `out-of-scope.md` edits — per the spec, all deferrals listed there
are per-iteration scope cuts (animation, configurable sizes,
velocity-proportional length, stale-telemetry visualization), not
cross-cutting concept deferrals.
EOF
)"
```

---

## Task 5: Browser smoke verification

**Files:** None (manual verification only)

Per CLAUDE.md: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete." This task is a manual verification gate before merging.

If the controller (or user) is running this task themselves, the worktree's `pnpm dev` runs the shell from `<worktree>/shell/`. The SITL extension expects mavlink2rest at `ws://localhost:8088`.

If a subagent is dispatched for this task, the subagent reports findings; the controller / user makes the final pass/fail call.

- [ ] **Step 1: Start the dev server**

```bash
cd <worktree>/shell && pnpm dev
```

Expected: Vite dev server starts on a local port (typically `http://localhost:5173/`).

- [ ] **Step 2: Open the dev URL in a browser** with the SITL backend running. Verification checklist (mirrors the spec's "Browser smoke" section):

1. **Drone icon appears** — at the SITL position. Initially gray and outlined (disarmed).
2. **Heading line not visible** — when ArduCopter is disarmed.
3. **Arm in MAVProxy** (or whatever GCS the operator is using) — icon switches to **filled green**, **heading line appears** as a 400px green stroke pointing in the heading direction.
4. **Yaw the drone** — both icon and line rotate together. **No animation jitter, no spin-the-wrong-way at the 359°→0° wraparound.**
5. **Recenter command still works** — `Ctrl+Shift+P` → "Flight Overlay: Recenter on Drone" pans the map to the drone's current position.
6. **Disable flight-overlay via extensions panel** (`Ctrl+Shift+X`) — icon + heading line both disappear cleanly.
7. **Re-enable** — both reappear.

- [ ] **Step 3: If anything fails, document the failure inline and STOP — do not merge.**

If verification passes, proceed to the next task.

- [ ] **Step 4: Stop the dev server**

`Ctrl+C` in the terminal running `pnpm dev`.

This task creates no commit. It's a verification gate.

---

## Task 6: Final cross-cutting code review

Per CLAUDE.md "Subagent-driven plan execution" — after all tasks land, dispatch a final cross-cutting code review over the full branch before merging. This is in addition to the per-task spec compliance + code quality reviews dispatched between tasks.

This task is a controller-level orchestration step, not a subagent dispatch with discrete bash steps. The controller reads the entire diff between `master` and `feat/flight-overlay-drone-icon`, the spec, and this plan, and looks for cross-cutting concerns that per-task reviews may have missed (consistent class prefixes across both layer files, consistent `:global` patterns, consistent comment style, no leftover `drone-marker-layer` references anywhere in the tree, etc.).

- [ ] **Step 1: Diff master vs the feat branch**

```bash
cd <worktree>/shell && git diff master..feat/flight-overlay-drone-icon -- ':!docs/specs/'
```

The `:!docs/specs/` exclusion keeps the spec out of the diff (it was committed on master directly). The diff should show:

- Two new files under `packages/extension-flight-overlay/src/layers/`: `drone-icon-layer.svelte`, `heading-line-layer.svelte`.
- One deleted file: `packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte`.
- Modified `packages/extension-flight-overlay/src/index.ts`, `src/index.test.ts`, `README.md`.
- Modified `docs/vs-code-alignment.md`, `docs/roadmap.md`.

- [ ] **Step 2: Search for any leftover `drone-marker` references in code + package docs**

```bash
cd <worktree>/shell && grep -rn "drone-marker\|DroneMarker" packages/
```

Expected: zero hits. `packages/` includes the flight-overlay package's README so that's covered too. `docs/specs/` is intentionally not scanned — the spec describes the rename for historical context, mentioning the old name there is correct and preserved.

- [ ] **Step 3: Verify class-prefix consistency**

```bash
cd <worktree>/shell && grep -n "gcscode-drone" packages/extension-flight-overlay/src/layers/drone-icon-layer.svelte packages/extension-flight-overlay/src/layers/heading-line-layer.svelte
```

Expected: `drone-icon-layer.svelte` uses `gcscode-drone-icon`, `heading-line-layer.svelte` uses `gcscode-drone-heading-line`. Both follow the `gcscode-drone-*` prefix convention from the spec.

- [ ] **Step 4: Verify the dev server didn't leave artifacts**

```bash
cd <worktree>/shell && git status
```

Expected: clean (no untracked Vite artifacts, no node_modules diffs).

- [ ] **Step 5: Address any issues found in cross-cutting review as Code-review-followup commits**

Per CLAUDE.md "subagent-driven plan execution" — followups land as separate `Code-review-followup:` commits, not amends. Examples of the kind of issue this gate catches:

- A class-prefix typo (`gcscode-drone-line` vs `gcscode-drone-heading-line`).
- A leftover `DroneMarkerLayer` symbol in a comment somewhere.
- README and spec disagreeing on a hex value (e.g., README says `#10b981` but spec says `#22c55e`).

If no issues are found, this task creates no commit.

---

## Task 7: Merge to master

Per CLAUDE.md: "Merge with `--no-ff`. Land a feature branch via `git merge --no-ff feat/<topic>` so the feature boundary survives in `git log`."

This task is a controller-level orchestration step; the user typically signs off before the merge runs.

- [ ] **Step 1: Verify the feat branch is clean and tests pass one last time**

```bash
cd <worktree>/shell && git status && pnpm check && pnpm test && pnpm lint
```

Expected: clean status, all checks PASS.

- [ ] **Step 2: Switch to master in the main checkout (NOT the worktree)**

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && git checkout master && git pull --ff-only origin master 2>/dev/null || true
```

Note: this repo may not have a remote configured; the `git pull` is best-effort. The local `master` is the merge target.

- [ ] **Step 3: Merge with `--no-ff`**

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && git merge --no-ff feat/flight-overlay-drone-icon -m "Merge branch 'feat/flight-overlay-drone-icon'"
```

Expected: merge commit created. `git log --oneline -5` shows the merge commit at the top, with the feat-branch commits visible below.

- [ ] **Step 4: Clean up the worktree**

```bash
cd /Users/kevinkroon/Projects/gcscode && git worktree remove .worktrees/feat-flight-overlay-drone-icon
```

Expected: worktree removed; `.worktrees/` directory becomes empty (or contains only other unrelated worktrees).

- [ ] **Step 5: Optionally delete the local feat branch**

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && git branch -d feat/flight-overlay-drone-icon
```

Expected: branch deleted (it's been merged, so plain `-d` works without `-D`).

- [ ] **Step 6: Verify final state**

```bash
cd /Users/kevinkroon/Projects/gcscode/shell && git log --oneline -8
```

Expected:

- Top: merge commit `Merge branch 'feat/flight-overlay-drone-icon'`.
- Below it: any Code-review-followup commits (if Task 6 created any).
- Below those: docs propagation, README update, heading-line, drone-icon — in reverse chronological order.
- Below those: master's `40a0d40 docs: spec for flight-overlay drone icon...` and earlier history.

---

## Done condition

The iteration is complete when:

1. All seven tasks above are checked off.
2. Master contains the merge commit and the feat-branch's commits.
3. The dev server boots and the manual verification checklist (Task 5) passes.
4. `pnpm check`, `pnpm test`, `pnpm lint` all pass on master.
5. No `drone-marker` references remain anywhere in the source tree (`packages/`, `README.md`, `docs/` outside of `docs/specs/`).
