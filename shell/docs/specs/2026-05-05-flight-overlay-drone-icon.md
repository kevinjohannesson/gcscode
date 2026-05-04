# Flight overlay — drone icon + heading line + armed-state visual

**Status:** Approved (2026-05-05)

## Context

The map and flight-overlay extensions shipped on 2026-05-03 (`docs/specs/2026-05-03-map-and-flight-overlay.md`). Flight-overlay registers three layers via `MapApi.registerLayer`: drone marker, home location, and max-distance circle. The drone marker today is a default `maplibregl.Marker()` — a generic teal pin (maplibre's default color), visually similar to the home-location marker (which is a blue pin via `{ color: '#3b82f6' }`). No orientation, no state distinction, two pins that read as variations of "the same thing" rather than "drone vs reference point."

Telemetry already exposes everything we need to do better. `extension-sitl` publishes `heading` (degrees, 0–360, from `GLOBAL_POSITION_INT`), `armed` (boolean, from `HEARTBEAT`), `lat`, `lng`, etc. on the live `$state` proxy reachable through `host.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry`. Operators using the map view can see _where_ the drone is but not _which way it's pointing_, _whether it's flying_, or _where it'll go next_ at a glance. This iteration closes that gap with a focused visual upgrade.

Three changes:

- The generic blue pin becomes a **green chevron pointing in the heading direction**.
- A **400px screen-space line** extends from the drone in the heading direction (operator-preferred visualization at the user's work GCS — confirmed in brainstorm).
- The icon distinguishes **armed vs disarmed** visually: filled green when armed, outlined gray when disarmed. The heading line hides when disarmed (line direction is meaningless on the ground).

This is purely a flight-overlay-internal change. No new API surface in `@gcscode/extension-map`. No new methods on `ExtensionHost`. No changes to `extension-sitl`. The `gcscode.flight-overlay.recenter` command and its top-right control are unchanged. The only files that change are inside `packages/extension-flight-overlay/`.

## Goals

- Replace `drone-marker-layer.svelte` with `drone-icon-layer.svelte` — a DOM-marker layer rendering an inline SVG chevron, rotated by `heading`, styled by `armed` state.
- Add `heading-line-layer.svelte` — a second DOM-marker layer rendering a 400px screen-space line in the heading direction, hidden when disarmed.
- Both layers anchor at the drone's `lat`/`lng` (default `anchor: 'center'`), rotate together via independent CSS `transform: rotate(...)` reads of the same `heading` value, and update on every telemetry tick through `$effect` auto-tracking against `flightOverlayState.sitlExports?.telemetry`.
- Keep `home-location-layer.svelte` and `max-distance-circle-layer.svelte` unchanged.
- Update `index.ts`: rename the `DroneMarkerLayer` import to `DroneIconLayer` (and update the file path); add a `HeadingLineLayer` import and a corresponding `map.registerLayer(HeadingLineLayer)` call in `activate(context)`. The other three `registerLayer` calls (home, max-distance circle, drone) keep their relative order.
- Update `index.test.ts`'s registered-layer count assertion (3 → 4).
- Update `packages/extension-flight-overlay/README.md` to describe the new visual treatment.
- VS Code alignment ledger (`docs/vs-code-alignment.md`) gets one row noting the pattern alignment (state-driven visual via CSS class binding — no API divergence; this is domain-specific UI).
- Roadmap propagation: add two **Considering** entries — map filter extension, map viewport constraints — for ideas surfaced during the brainstorm.
- `docs/out-of-scope.md` propagation: no new cross-cutting rows. All deferrals here are per-iteration scope cuts.

## Non-goals

- **No animation or CSS transitions** on the icon or heading line. Defer to the first warning-state iteration that has a use for animation-as-alert (low battery, RTL, link loss). A `transition: transform` on the rotation would also cause the icon to spin the long way around the circle on heading wraparound (359°→0°), so this isn't just a polish deferral — it's an actively-avoided footgun this iteration.
- **No animation on armed-state color change.** Could be a cheap polish (color transition is wraparound-safe), but skipping for scope tightness. Add later if the snap looks abrupt in practice.
- **No user-configurable line length, icon size, or colors.** Hardcoded: 400px line, 28px icon, hex colors inline. Trigger to revisit: a second consumer of the heading-line idea (e.g., another extension wants to render a per-vehicle heading line at a different scale), or the theme-tokens iteration (already deferred in `out-of-scope.md`).
- **No velocity-proportional heading line.** Length is fixed 400px; doesn't scale with `groundspeed`. Trigger to revisit: operator UX feedback that a velocity vector reads better than a fixed-length heading indicator.
- **No stale-telemetry visualization on the drone icon.** When SITL's WebSocket disconnects, `telemetryState.connection` becomes `'disconnected'` but position/heading/armed fields don't reset (`reset()` only fires on extension deactivate). Last-known position stays drawn, frozen. This is intentional: disconnect visibility lives elsewhere (vehicle-status footer / future indicator), not on the icon. Trigger to revisit: first operator complaint that a frozen icon looked live during a disconnect, OR the iteration that adds warning-state visuals.
- **No click / hover interaction on the drone icon.** Selection state is already deferred in `out-of-scope.md` and doesn't get unblocked by this iteration. The DOM-marker route happens to make future click handling cheap, but no handler ships now.
- **No symbol-layer migration.** Drone stays a DOM marker. Why is captured below in "Decisions log"; the trade is "if multi-drone ever lands at meaningful scale, revisit." Multi-drone is already deferred in `out-of-scope.md`.
- **No changes to other layers.** Home-location marker stays a default `maplibregl.Marker({ color: '#3b82f6' })`. Max-distance circle stays a maplibre geojson + line layer. They're correctly shaped for their roles.
- **No changes to the recenter command or its control.** Both ride through unchanged.
- **No ADR.** Decisions extend established patterns (DOM markers as the per-vehicle rendering pattern in flight-overlay, CSS class binding for state-driven visuals). The "Why DOM marker, not symbol layer" rationale is a spec subsection below, not an architecture decision.

## Implementation

All edits live inside `packages/extension-flight-overlay/`. No other packages touched.

### Files affected

```
packages/extension-flight-overlay/src/
  layers/
    drone-marker-layer.svelte    → renamed to drone-icon-layer.svelte (rewritten)
    heading-line-layer.svelte    → NEW
    home-location-layer.svelte   → unchanged
    max-distance-circle-layer.svelte → unchanged
  index.ts                       → one import rename, one registration added
  index.test.ts                  → layer-count assertion update (3 → 4)
README.md                        → visual treatment description added
```

### `drone-icon-layer.svelte` (replaces `drone-marker-layer.svelte`)

Imperative DOM construction inside a single `$effect`, matching the package's existing "logic-only Svelte file" convention (the component renders no template). The maplibre `Marker` is created once per `lat/lng`-non-null transition; subsequent updates call `setLngLat`, write `element.style.transform`, and toggle `element.classList`.

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
    // No transition: transform — wraparound from 359°→0° would spin
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

Null-handling decisions, recapped from brainstorm:

| Field is null     | Behavior                       |
| ----------------- | ------------------------------ |
| `lat` or `lng`    | remove marker entirely         |
| `heading`         | no rotation (icon points north)|
| `armed`           | treat as disarmed (safe default — unknown state shouldn't render as live) |
| `sitlExports` undefined | remove marker (`lat/lng` are null in this branch anyway) |

### `heading-line-layer.svelte` (new)

Structurally identical to `drone-icon-layer.svelte`. Differences:

- SVG content is a 400px line drawn pointing up from origin, with 70% opacity.
- When `armed === false` or `heading === null`, the wrapper gets `display: none` (line is meaningless on the ground or without a direction). Marker stays attached — toggling `display` is cheaper than tearing down + reattaching the maplibre marker on every arm/disarm.
- No "armed" class needed — the line is either visible (and green) or hidden.

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
    // display: none when hidden — cheaper than detach/reattach.
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
    color: #22c55e; /* same green as armed icon */
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

### `index.ts` changes

Two edits: the import rename and the new layer registration.

```ts
// Before
import DroneMarkerLayer from './layers/drone-marker-layer.svelte';
// After
import DroneIconLayer from './layers/drone-icon-layer.svelte';
import HeadingLineLayer from './layers/heading-line-layer.svelte';
```

In `activate(context)`, the registration list grows:

```ts
context.subscriptions.push(
  map.registerLayer(DroneIconLayer),    // was DroneMarkerLayer
  map.registerLayer(HeadingLineLayer),  // new
  map.registerLayer(HomeLocationLayer),
  map.registerLayer(MaxDistanceCircleLayer),
  // ... commands and controls unchanged
);
```

Layer registration order: drone-icon and heading-line first (so they paint above home/circle in DOM-marker stacking, though for DOM markers paint order is dominated by maplibre's own marker container z-ordering — registration order is good-enough heuristic).

### `index.test.ts` changes

The existing test asserts how many `registerLayer` calls happen during `activate()`. Update the count from 3 to 4 and add `HeadingLineLayer` to the per-call assertions if the test inspects which components are passed.

No new test files. The layer components are thin reactive bridges; testing them in isolation requires mocking maplibre + DOM + `flightOverlayState`, and the ROI is low. Manual verification at the dev server is the validation gate (per CLAUDE.md "for UI or frontend changes, start the dev server" guidance).

### `README.md` updates

Update `packages/extension-flight-overlay/README.md` in two places:

1. The lead-in `"Registers three layers on the map:"` becomes `"Registers four layers on the map:"`.
2. The bulleted layer list grows by one and the drone-marker bullet rewrites:

```diff
- - **Drone marker** — point geometry, position from live SITL telemetry (`gcscode.sitl` exports).
+ - **Drone icon** — inline-SVG chevron at SITL's live position, rotated by `telemetry.heading`. Filled green when armed, outlined gray when disarmed.
+ - **Heading line** — 400px screen-space green stroke extending from the drone in the heading direction. Hidden when disarmed.
  - **Home location** — point geometry, hardcoded coordinates in `flight-overlay-config.ts`.
  - **Max-distance circle** — polygon approximation of a geodesic circle around the home location, hardcoded radius.
```

The "Layers render no visible DOM themselves" sentence below the list stays accurate — the layer components still render no template; the DOM marker is constructed imperatively in `$effect`.

## Why DOM marker, not symbol layer

For posterity in this spec: the brainstorm discussed an alternative architecture using maplibre's `symbol` layer (register a raster image, draw it as a feature, drive `icon-rotate` from a feature property). We chose DOM marker. The rationale, weightiest first:

1. **State-driven visuals are trivial in CSS, fiddly in maplibre expressions.** Armed/disarmed is the load-bearing requirement here. With a DOM marker + SVG, that's a `class:armed` toggle and a CSS rule. With a symbol layer, you're either registering two PNGs (`drone-armed.png` + `drone-disarmed.png`) and writing `icon-image: ['case', ['get', 'armed'], 'drone-armed', 'drone-disarmed']`, or going SDF + `icon-color` paint expression. Both work; both add maplibre-DSL bookkeeping the codebase doesn't have anywhere else yet. When future states land (low-battery, RTL, link loss) the cost compounds.

2. **The icon source is vector; symbol layer wants pixels.** The arrow ships as inline SVG in the Svelte component. Using a symbol layer would require rasterizing to PNG (build-time or runtime via canvas) and registering with `map.addImage(...)`. With the DOM marker the SVG is the source of truth.

3. **Pattern consistency within `flight-overlay`.** The home-location layer is already a DOM marker. Picking DOM marker for the drone keeps the "point markers in this package use DOM markers" pattern intact. The max-distance-circle is a maplibre geojson layer because it's a _world-space_ geographic radius — different conceptual role, not an inconsistency to resolve.

4. **Free interaction surface for the future.** Selection / click-to-inspect is in `out-of-scope.md` but on the architectural horizon. DOM markers fire native `click` / `mouseenter` events on the element. Symbol layers route through `map.on('click', LAYER_ID, ...)` with feature-property lookup — works, just more wiring.

5. **Performance is not a discriminator at one drone.** Symbol-layer perf wins (GPU-rendered, scales to thousands of features) is exactly what multi-drone would surface. Multi-drone is deferred in `out-of-scope.md`. If/when it lands, the right move is to revisit ALL flight-overlay's per-vehicle elements together (icon + heading line + future warning indicators) and decide migration as a set. Pre-migrating one piece now bets on a future shape we haven't designed yet.

The trade we're explicitly making: if multi-drone ever lands at meaningful scale, this iteration's two layers will need a migration to symbol layers (or per-extension equivalents). That cost is scoped, called out in deferrals, and accepted.

## Heading line — why screen-space SVG, not maplibre line layer

A maplibre `line` layer (consistent with `max-distance-circle`) was rejected for the heading line because the line is **screen-space** (fixed 400px regardless of zoom), not world-space. A maplibre line layer would require recomputing the line's lat/lng endpoint on every zoom/pan/rotate event, projecting the screen offset back to geographic space, and rewriting the geojson source. That's three event listeners + projection math + reactive geojson update for one drone. Significantly more code than wrapping a 400px stroke in a DOM-marker SVG.

The `max-distance-circle` IS a maplibre line layer because it's world-space (a real geographic radius around home). Despite both being "line-ish," they're not the same conceptual primitive.

## Two markers, not one

The drone icon and heading line are **two separate maplibre Markers**, not children of a single marker. Reasons:

- **Future filter extension:** the user signaled a roadmap intent for a "map filter extension" where consumers can toggle visibility of sibling extensions' map elements. Two independent layer registrations make that toggle a clean disposable swap (deactivate just the heading-line layer's registration) instead of needing to plumb a visibility prop through the icon component.
- **Independent lifecycles:** each component owns its own `$effect`, `onDestroy`, and marker reference. Less surface area for coupled bugs.
- **Sub-pixel drift between co-located markers**: maplibre positions markers via integer-pixel `transform: translate(...)`. Two markers at identical lat/lng get identical translates — no drift in practice. (If this ever breaks, the fallback is merging into one marker with two SVG children. We've designed for the simpler shape and held the fallback in reserve.)

## Tests

### Existing — `packages/extension-flight-overlay/src/index.test.ts`

Update the registered-layer count assertion from 3 to 4. If the test inspects which components are registered, swap `DroneMarkerLayer` for `DroneIconLayer` and add `HeadingLineLayer`.

### No new automated tests

The layer components themselves are thin reactive bridges — `$effect` reading reactive fields and writing to a maplibre marker. Testing them in isolation would mock maplibre + DOM + `flightOverlayState`. ROI is low.

### Browser smoke (manual)

Per CLAUDE.md — UI changes require dev-server verification before reporting complete:

1. Boot SITL + shell. Drone icon appears as a chevron at the SITL position.
2. With ArduCopter disarmed (default boot state): icon is **gray, outlined**. Heading line **not visible**.
3. Arm in MAVProxy: icon switches to **filled green**, heading line **appears** as a 400px green stroke pointing in the heading direction.
4. As the drone yaws/turns, both rotate together. No animation jitter, no spin-the-wrong-way at 359°→0° wraparound.
5. Recenter command (`Ctrl+Shift+P` → "Flight Overlay: Recenter on Drone") still works — pans map to drone's current position.
6. Disable flight-overlay via extensions panel: icon + heading line both disappear cleanly.
7. Re-enable: both reappear.

## VS Code alignment

| Concern                    | VS Code                                              | gcscode                                              | Notes                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State-driven visual on a DOM-anchored element | ✓ (editor decorations, git-status icon overlays, debug breakpoints) | ✓ (CSS class on DOM marker reflects telemetry state) | Aligned in spirit. No API surface to compare — drone-state visualization is domain-specific UI, not a reusable host primitive. Pattern (model property → CSS class → styled DOM) is the same. |

This iteration adds no new API divergence rows. One alignment-in-spirit row to propagate to `docs/vs-code-alignment.md`.

## `out-of-scope.md` propagation

When this iteration ships, **no edits to `out-of-scope.md`**. All deferrals listed in this spec's Non-goals are per-iteration scope cuts (animation, configurable sizes, velocity-proportional length, stale-telemetry visualization), not cross-cutting concept deferrals. Click/hover-on-icon falls under the existing "selection state" deferral; no new row needed.

## Roadmap propagation

Two new **Considering** entries to add under "Feature extensions → Considering" in `docs/roadmap.md`:

```markdown
- [ ] **Map filter extension** — registry where extensions contributing map elements expose user-toggleable visibility (e.g., heading line, max-distance circle, future tracks/breadcrumbs). Trigger: second consumer wants opt-out of a sibling extension's layer.
- [ ] **Map viewport constraints** — `maxBounds` + minimum zoom in `extension-map` so panning doesn't escape useful bounds and zoom-out doesn't reveal world-wrapping. Trigger: operator UX feedback or first integration test that surfaces an antimeridian artifact.
```

The existing "Flight overlay" entry (`Coming → ✓`) doesn't need a new sub-bullet — this iteration polishes an existing feature rather than adding a new feature extension.

## Decisions log (brainstorm trail)

For posterity. Captures the why behind shape choices that won't be obvious from code:

- **Approach (2) — two layered DOM markers**, not one marker with two SVG children. Future filter-extension toggle becomes a clean disposable swap; positioning a 400px SVG inside a single marker's `viewBox` is "annoying" (user's experience from a similar work GCS).
- **DOM marker, not maplibre symbol layer.** Detailed in "Why DOM marker, not symbol layer" above. Trade: if multi-drone scales up, this needs migration; accepted.
- **Imperative DOM construction**, not Svelte template + `bind:this`. Matches the existing flight-overlay layer convention ("logic-only Svelte files" rendering no template). The Svelte-template route is slicker syntactically but breaks the convention; user signed off on imperative for codebase consistency.
- **Green = armed**, not blue. User initially proposed "blue or something"; flipped to green after surfacing aviation convention (green = active/go/armed). Consistent with cockpit and ATC visual language.
- **Hex colors inline**, not CSS variables. Theme tokens are explicitly deferred in `out-of-scope.md`. When that iteration lands, this is a one-pass refactor.
- **`:global` CSS selectors**, scoped via `gcscode-drone-*` class prefix. Maplibre re-parents the marker element into its own `.maplibregl-marker` container, outside Svelte's scoped-CSS reach. Class prefix prevents collisions.
- **No CSS transitions on `transform`.** Heading wraparound (359°→0°) would spin the icon the long way around the circle. Discipline note: never add a transform transition to either layer's class.
- **`display: none` for heading-line hide**, not marker detach. Cheaper; on-the-ground time can be long; toggling `display` keeps the marker mounted and ready.
- **`pointer-events: none` on heading line.** A 400px-long element shouldn't block map pan/zoom across its full reach.
- **Heading from `heading` field (degrees) not `yaw` (radians).** Both come from MAVLink. `heading` is from `GLOBAL_POSITION_INT`, already in degrees, already 0-360 — direct CSS `rotate(${h}deg)` mapping. `yaw` is from `ATTITUDE`, in radians, would need conversion. Same data class, simpler arithmetic.
- **Stale-telemetry visualization deferred.** User confirmed: assume happy path with stable connection. Disconnect-state UX rolls into a future warning-state iteration.
- **Map viewport constraints noted but not added.** User mentioned the technique mid-brainstorm; it's a `extension-map` concern, not flight-overlay. Captured in roadmap as Considering rather than expanding this iteration's scope.
