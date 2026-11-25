# The map on `map-gl-svelte`

**Date:** 2026-11-25
**Status:** Draft

`extension-map` builds its own view and layers on `libs/map-gl-svelte`, and no other package sees the library. The raw MapLibre `Map` that every registered layer gets today becomes a transitional bridge that takes no new users. This is the successor to the [map contract spec](2026-11-24-map-contract.md), whose Known unknowns left this choice ("What a layer gets from the map: raw MapLibre, or `map-gl-svelte`") to "the spec that rebuilds the map's view or its layer API". It adds one PR before that spec's GCS-62 PR and corrects how GCS-62 reads what the map drew.

Decisions are marked _(Owner.)_ or _(Controller.)_. The owner decided on 2026-11-25 that the map is built on `map-gl-svelte` for internal use only, and that the raw-map bridge should not stay. Every other decision here is _(Controller.)_ and open to the owner in review.

## Context

`packages/extension-map/src/map-view.svelte` constructs `maplibregl.Map` itself in `onMount` and drives it imperatively. `MapApi.registerLayer(component)` mounts a component inside the view, where `getContext('gcscode.map.maplibre')` hands it the raw `Map`. `MapControlComponentRegistration`'s doc comment invites a component control to read the same context. The flight overlay is the only user: its drone icon, heading line, home marker and range circle (`packages/extension-mavlink-flight-overlay/src/layers/`) read the context, and its one control, recenter, is a declarative button that reads nothing. After the map contract's GCS-62, only the home marker and the range circle are left.

`libs/map-gl-svelte` is a Svelte 5 port of `@vis.gl/react-maplibre` 8.1.3 ([its spec](2026-10-24-map-gl-svelte.md)), with browser-mode tests. It is private and nothing keeps it in step with upstream. Its `Layer` and `Source` read private MapLibre state (`map.style._loaded`). Its spec rules out layer-order reconciliation, and its `beforeId` only places a layer below a named one.

The steady core's map criteria this spec rests on, beside the P1, P3, P6 and P7 the map contract quotes: **P4**, layers stack in the same order after reload, style change and extension re-enable (GCS-65); **P7**, no leaked layers or markers across disable and enable.

The owner's reasons: the library already solves the common problems of binding an imperative map to a declarative framework, and no extension should know if the map's technology is swapped underneath. The owner's objection to the bridge: it ties extensions to MapLibre, bypasses the map's contract, and can undo what the map holds, such as the map contract's layer order (its Goal 3) and pointer rule (its click rule 1).

## Goals

1. **The map's own view, sources and layers are built on `map-gl-svelte`.** What that buys: a camera the map controls that does not fight the operator's gestures, the map's own sources and layers re-added after a style change, and mount and teardown the library already tests (P7). It does not buy layer order. Keeping the map's layers on top (the map contract's Goal 3) stays the map's own code, which moves them back when another layer is added after them. _(Owner: the library. What it is credited with: Controller, in review: PR #110 RT-2, EA-5.)_
2. **The library stays inside `extension-map`.** No other package imports it: a restricted-imports group in `eslint.config.ts` forbids `map-gl-svelte` in every package but `packages/extension-map`, pinned in `eslint.config.test.mjs` as the other boundary rules are. Registered layers and controls mount outside the library's `Map` component, so none of them reaches the library's components or context. _(Controller, in review: PR #110 EA-4, RT-4.)_
3. **The raw-map bridge is transitional, and frozen by use.** Its only users are the flight overlay's layers. Nothing else reads `gcscode.map.maplibre`, and component controls no longer get it: the migration PR stops providing the context to controls and drops the doc comment's offer, which nothing in this repo uses. `registerLayer`, the context key and the component path's doc comment are marked `@deprecated` in `MapApi`'s doc comments, `packages/extension-map/README.md` and the map's manifest description, naming the map items contract as their successor. The bridge is removed, context key included, once that contract carries the home marker and the range circle. _(Owner: transitional. Frozen by use: Controller, in review: PR #110 EA-3, RT-4.)_
4. **P1's probe reads what the map drew through a command the map owns.** The map contract has the probe read "the map's GeoJSON source", which only the bridge could reach, and the probe is MAVLink-aware, so it cannot sit in `extension-map` ([ADR-0014](../decisions/ADR-0014-protocols-as-languages.md) Decision 1). Instead, the map registers a command that returns, for every feature the map last set on its symbol source, the asset key, latitude, longitude, heading (or none), and the `performance.now()` time the map set it. The probe calls it through `host.commands.executeCommand` and needs no bridge. The result's shape is part of the map's contract. GCS-62's PR builds the command with the probe. _(Controller, in review: PR #110 EA-1.)_

## Non-goals

- **The map items contract** (points, lines, circles and polygons keyed by id, which N4's fences and P2, P3 and N12 need). This spec fixes that it replaces the bridge, not its shape (propagation below).
- **A layer-ordering API.** The map keeps its own layers on top; how items from several extensions order is the items contract's question.
- **Keeping `map-gl-svelte` in step with react-maplibre.** The owner will take this up in a thread of its own; the out-of-scope row below holds it until then.
- **Any change to `MapApi`'s shape** in the migration PR, beyond the deprecation markers and controls losing the context.
- **The map demo,** which builds its own MapLibre map and is being retired.

## Design

### The migration PR

One feature PR, on a `claude/` branch labelled `feat`, before the map contract's GCS-62 PR. It is not one of that spec's numbered feature PRs, so where that spec says "the first feature PR" it still means GCS-62's, and "the second" GCS-63's.

`map-view.svelte` renders the library's `Map` with the map's camera bound to it, and the map's corner notices, controls and registered layers as today. Registered layers mount beside the library's `Map`, not inside it, and get the raw map from the library's ref through the `gcscode.map.maplibre` context, exactly as they do today. Controls mount in the same slots beside the canvas, so a control's clicks still never reach it (the map contract's click rule 1).

**When MapLibre cannot start.** The library constructs the map inside a promise and sends MapLibre's throw, such as no WebGL context, to `onError`. The map passes `onError` and shows a one-line notice in its corner that the map could not start, where today the throw escapes `onMount` and leaves a blank panel. That is the one visible change. _(Controller, in review: PR #110 RT-3.)_

**Done when** the overlay's four layers, the recenter control and the camera in both directions (gestures to `MapApi.camera`, `camera` writes to the map) behave as before; P7 holds for the map view and the overlay's layers across 100 disable and enable cycles of either extension; a control's clicks never reach the canvas; and a test package importing `map-gl-svelte` fails lint. _(Controller, in review: PR #110 RT-3, EA-4.)_

### While the bridge stands

A style change drops whatever the overlay draws through the bridge, and nothing re-adds it, while the map's own layers come back. No style change exists yet: the first is GCS-64's local fallback style, or a basemap or theme switch. So P4 holds for the map's own layers only while the bridge stands, and the first style change is a trigger on the items contract (propagation below). _(Controller, in review: PR #110 EA-5, RT-2.)_

Click rule 1 and the layers-on-top rule still rest on convention for the bridge's one user, as the map contract says. Once the bridge is gone, nothing outside `extension-map` touches MapLibre, and the map could swap its technology without an extension noticing.

### Corrections to the map contract spec

- **Goal 3:** P1's probe reads the symbol source through Goal 4's command, not the source itself. Moving the map's layers back on top is the map's own code (Goal 1).
- **Delivery, GCS-62:** GCS-62's PR also builds Goal 4's command, and its probe uses it.
- **`docs/out-of-scope.md` propagation, "Pointer input on the map is held by convention":** its trigger reads "the first extension from outside this repo, or the map items contract that removes the raw-map bridge" instead of "the spec that settles what a layer gets from the map", which this spec is.
- **Its other ordinals** stand, as the migration PR is not among its numbered PRs.

## VS Code alignment

| Area                      | Aligned                                                                                                                                                                                                                                                                       | Diverges, and why                                                                                                                                                   | Deferred                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Who sees the map engine   | VS Code gives no extension the editor's DOM or its Monaco instance; extensions draw through decoration types and providers. Once the bridge is gone, extensions draw only in the map's vocabulary, at the cost that every new kind of drawing is a change to `extension-map`. | The transitional bridge: one first-party add-on still gets the raw MapLibre `Map` through a string context key, until the map items contract carries what it draws. | The map items contract, until the first extension needs to draw beyond a vehicle symbol (propagation below). |
| Reading what the map drew | `vscode.execute*Provider` commands hand a test what providers answered, through the command registry.                                                                                                                                                                         | The map's command returns what the map drew, not what providers answered, because P1 measures the map.                                                              | —                                                                                                            |

## Known unknowns

- **The library's private reads.** `Layer` and `Source` read `map.style._loaded`, which a MapLibre upgrade can remove, and the port is pinned to react-maplibre 8.1.3. The out-of-scope row below is the trigger to revisit.
- **Mount order without the library's context.** Registered layers mount beside the library's `Map` and wait for its ref, so a layer may mount before the map exists, as it can today before `onMount`. The context stays a getter that returns `null` until the map exists, as today, and P7's test covers a layer that mounts first.
- **The command's name and whether the palette lists it** are the builder's. The host has no hidden-command flag; a title that reads as a diagnostic is enough until it does.

## Delivery

1. **The migration PR** (Design). Before the map contract's GCS-62 PR.
2. Then the map contract's two feature PRs, GCS-62 (which also builds Goal 4's command) and GCS-63, as that spec delivers them.

## `docs/roadmap.md` propagation

This spec's PR rewrites the "The map owns its contract" entry's delivery sentence to "First the map moves onto `map-gl-svelte` inside `extension-map` (spec: this one), then two feature PRs: GCS-62, then GCS-63." The map contract's tick rule stands.

When the migration PR merges, the Libraries entry for **map-gl-svelte** drops "No gcscode package uses it; `extension-map` drives MapLibre directly" for "`extension-map` builds its view on it; no other package imports it (this spec)".

## `CLAUDE.md` propagation

When the migration PR merges, § Layout's "`map-gl-svelte` (a standalone MapLibre binding no package uses yet)" reads "`map-gl-svelte` (the MapLibre binding `extension-map` builds its view on, and no other package imports)".

## `docs/out-of-scope.md` propagation

When the migration PR merges, add under Extension machinery:

- **A map items contract.** Extensions other than vehicle-symbol providers draw on the map only through the raw-map bridge, which takes no new users and is removed once this contract carries what the flight overlay draws (points, lines, circles and polygons keyed by id). _Trigger to revisit:_ the first extension that needs to draw on the map beyond a vehicle symbol, the first of GCS-65 (P4), GCS-66 (P3) and GCS-67 (P2), or the first style change (GCS-64's fallback, a basemap or a theme switch), which drops the bridge's layers.
- **Keeping `map-gl-svelte` in step with react-maplibre.** The port is pinned to react-maplibre 8.1.3 and reads private MapLibre state. _Trigger to revisit:_ the first MapLibre upgrade or upstream fix the map needs, or the owner's thread on keeping it in step.

And amend:

- **Layer ordering / z-index API on the map:** its trigger becomes "GCS-65 (P4), or the map items contract, whose items from several extensions need an order", since no new extension may register a layer.
- **View mount and render are uncontained:** "Map and Map demo construct `maplibregl.Map` in `onMount` uncaught" becomes "Map demo constructs `maplibregl.Map` in `onMount` uncaught; the map shows a notice when MapLibre cannot start".

## `docs/vs-code-alignment.md` propagation

When the migration PR merges:

- Add the "Who sees the map engine" Alignment, Divergence and Deferral from the table above. The "Reading what the map drew" rows land with GCS-62's PR, which builds the command.
- Mark the Divergence "Cross-extension Svelte context for shared runtime instances" transitional, naming this spec.
- Amend the Deferral "Layer ordering / z-index API on contribution surface" as the out-of-scope row above.

When GCS-62's PR merges, re-point the Alignment "Service-style extension exposing contribution surface for other extensions" from `registerLayer` at `registerSymbolProvider`.
