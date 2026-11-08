# map-gl-svelte — a Svelte 5 port of react-map-gl's MapLibre bindings

A Svelte 5 port of `@vis.gl/react-maplibre` (the MapLibre half of [react-map-gl](https://visgl.github.io/react-map-gl/)), housed in this monorepo as `packages/map-gl-svelte`. Its public API mirrors upstream's; its internals use Svelte's own fine-grained reactivity.

## Status

**Not a gcscode iteration.** Like [`2026-05-05-dockview-svelte.md`](2026-05-05-dockview-svelte.md), this is a standalone artifact housed in the repo for convenience. It does not appear in `docs/roadmap.md`, does not propagate to `docs/out-of-scope.md`, does not go through the spec-PR workflow, and posts nothing to GitHub.

- Lives on `feat/map-gl-svelte` in the worktree `.worktrees/feat-map-gl-svelte`. Spec, plan and code all land on that branch; `master` is not touched.
- Built through the subagent-driven pipeline (implementer per task, then a spec-compliance and a code-quality review, then a final cross-cutting review), with the reviews returned to the controller only, not posted to a PR.
- Merging to `master`, and whether to open a PR at all, is the user's call after the branch is done.

## Context

Curiosity, not a gcscode need. The user has written a private Svelte 5 MapLibre library (it can't be shared) and wants to see how vis.gl, the team behind deck.gl, binds MapLibre to a reactive framework, and later how that performs. The user described their own library's approach in conversation:

- nested declarative components (`<Map>` → `<SomeSource>` → `<SomeLayer>`), headless, every style-spec option a prop;
- one `$effect` per prop, writing imperatively into MapLibre, with event wiring to push MapLibre-side changes back into Svelte state;
- every parent gates its children until its MapLibre object exists (children-first effects otherwise make a Layer attach to a Source that isn't there yet);
- a "style epoch" every component depends on, so a style swap that wipes layers makes them re-attach;
- support for a flat `<Layer source="...">` form alongside nesting, which the user called a can of worms;
- events, layer-order reconciliation, a full drawing toolset, and a deck.gl integration that performs well.

A read-through of upstream (summarised under "Upstream mechanisms to preserve") found the gating and style-reload approaches are essentially the same as the user's. The genuinely different ideas are the controlled camera via MapLibre's `transformCameraUpdate` hook, layers that find their source through the map rather than through the component tree, and cross-prop rules applied in one place. The user chose to port the whole library anyway, so those ideas can be tried in Svelte form against a known-good reference.

`packages/extension-map/src/map-view.svelte` may later become a playground for it. That is a follow-up, not part of this work.

## Goals

1. Every public export of `@vis.gl/react-maplibre` v8.1.3 has a Svelte counterpart with the same name, the same props, the same callback names and the same event payload shapes, except where the "Svelte translations" table below says otherwise.
2. Every behavior listed under "Upstream mechanisms to preserve" works, and is covered by a test that runs against real MapLibre in a real browser.
3. Internals use Svelte's fine-grained reactivity (see "Reactivity model") rather than re-implementing React's re-render-and-diff.
4. Every upstream test case has a Svelte counterpart, or a one-line written reason it was dropped.
5. A small demo app shows the main features working.
6. Upstream's MIT copyright notice is carried with the package.

## Non-goals

- **Mapbox GL.** The user has no Mapbox access. `@vis.gl/react-mapbox` and the `react-map-gl` umbrella module (`modules/main`, a re-export shim) are not ported.
- **The benchmark.** A separate follow-up once the port works and it's clear what to measure.
- **Running upstream's React version.** Open questions are answered for the port; React's side is worked out from its code. Running upstream, perhaps as a third contender, belongs with the benchmark. _(User's decision.)_
- **Wiring into gcscode.** `extension-map` and `map-view.svelte` are not changed.
- **SSR.** Client-only, like dockview-svelte. `useIsomorphicLayoutEffect` has no counterpart.
- **Publishing.** `"private": true`, source-as-entrypoint, no build step. Same as dockview-svelte.
- **React-only behavior.** Strict-mode double mounting, `React.memo`, refs-as-props.
- **Upstream's docs site and most of its ~20 examples.** The demo covers a handful (see "Demo").
- **New features upstream doesn't have.** No drawing tools, no layer-order reconciliation, no deck.gl-specific component, no `bind:` sugar for the camera. Upstream's examples show deck.gl and drawing done through `useControl`; that path must work, nothing more.

## Anti-goals

These would make the port a failure even if it works:

- **Silent divergence from upstream.** Every behavioral difference is listed in this spec or the package README. A reader comparing the two must be able to trust that anything unlisted behaves the same.
- **The user's own library leaking in.** The point is to see vis.gl's approach. Where upstream's approach is awkward in Svelte, translate it faithfully and note the awkwardness rather than substituting the user's solution (gating, style epoch) from the conversation.
- **More private MapLibre API than upstream uses.** The full list of what upstream reaches into: `map.style._loaded`; `map._frame` and `map._render` (forced redraw); `map._container`, `map._resizeObserver` and `map._update` (map reuse); controls' `_container`, plus `FullscreenControl._controlContainer`, to apply their `style` prop; and `GeolocateControl._setupUI`. The port may use those and no others, and uses fewer where a public API does the job: the forced redraw goes through public `map.redraw()` (mechanism 10), and the `GeolocateControl._setupUI` patch is dropped, because it exists only to survive React strict mode's double mount (a non-goal). _(My call, for both.)_
- **Losing attribution.** No release of the package without upstream's license notice.

## Upstream reference

- **Pin: `visgl/react-map-gl` tag `v8.1.3`, `modules/react-maplibre/` only.** Clone it into `shell/scratch/react-map-gl` (gitignored) with `git clone --depth 1 --branch v8.1.3`. Upstream `main` (`1afe1a9`, 2026-09-02) differs only by fix #2612, which stops passing default values for nullish `minZoom`/`maxZoom`/`minPitch`/`maxPitch`. The builder may take that fix too; if so, say so in the README. _(My call: the release tag, since it's the version a comparison would be against.)_
- **Size:** about 2,500 lines of source (`src/maplibre/maplibre.ts` is 646 of them) and about 1,400 lines of tests.
- **License:** MIT, "Copyright Vis.gl contributors." The port is a derivative work; its `LICENSE` file reproduces upstream's notice and adds a line for the port.

## Principle: upstream's API, Svelte's internals

The public surface (component names, prop names, callback names, event shapes, the `MapRef` type, `useControl`'s overloads, `MapProvider`/`useMap` semantics) follows upstream. A user of react-map-gl reading the README should recognise everything.

The internals don't copy React's mechanics. Upstream re-renders, then compares every prop to the previous one, because React can't say which prop changed. Svelte can, so the port reacts to individual props (see "Reactivity model"). Where a mechanism exists only because of React (render-body side effects, `cloneElement`, portals, `useRef` for "latest props"), the port uses the Svelte equivalent and lists it under "Svelte translations".

## Upstream mechanisms to preserve

File references are to `modules/react-maplibre/src/` at `v8.1.3`. These are the behaviors that make react-map-gl what it is. Each needs a test.

### Camera

1. **Controlled camera through `transformCameraUpdate`.** At map creation, the wrapper installs a camera-update hook (`setTransformCameraUpdate` on MapLibre v6+, the `transformCameraUpdate` property before that). Each proposed camera change from a gesture or animation is recorded, then returned with every camera prop the app has set overriding it. If the app doesn't apply `onMove`'s `viewState`, the map doesn't move. (`maplibre/maplibre.ts`, `_onCameraUpdate`, and `utils/transform.ts`, `applyViewStateToTransform`.)
2. **Partial control.** Only camera fields the app has set are enforced; others stay free. Upstream decides "set" with `'zoom' in props`; the port decides it by "not `undefined`" (see "Svelte translations").
3. **Camera events carry the proposal.** `onMove`, `onZoom`, etc. receive `e.viewState`, the _proposed_ camera, not the one on screen (`_onCameraEvent`).
4. **External writes are silent.** When camera props change, the map `jumpTo`s only the changed fields, inside a single internal-update flag that suppresses camera callbacks (`_updateViewState`, `_internalUpdate`).
5. **Never fight a gesture.** Camera props are not applied while `map.isMoving()`; the hook does the enforcing during interaction.
6. **`initialViewState`** for uncontrolled use, including `bounds` with `fitBoundsOptions`; **`viewState`** with `width`/`height` for an external controller, which also drives `resize()`.

### Map props and cross-prop rules

7. **Min/max ordering.** When zoom or pitch limits change, min and max are set in whichever order never produces a temporary `min > max` (`utils/transform.ts`, `updateConstraint`).
8. **Settings, handlers, style.** `maxBounds`, `projection`, `renderWorldCopies`, `cursor`, the eight interaction handlers (`scrollZoom` … `touchPitch`), and `mapStyle` with `styleDiffing` (default `true`) via `setStyle(…, {diff})`.
9. **Style components.** `light`, `sky`, `terrain`, `projection` are applied only once the style has loaded, re-applied after every `style.load`, and `terrain` waits on `sourcedata` until its source exists (`_updateStyleComponents`).
10. **Same-frame redraw.** After an external (non-gesture) change (a setting, the controlled size, or the camera while the map isn't moving), the map is redrawn synchronously, so the map and the surrounding UI change in the same frame (`redraw`). Upstream cancels `map._frame` and then calls `map._render()`. On MapLibre 5 the pending frame is held in `_frameRequest` and there is no `_frame`, so upstream's cancel does nothing and the queued frame renders a second time. **The port calls MapLibre's public `map.redraw()` instead**, which cancels the pending frame and renders once, synchronously. That's one render fewer than upstream per external change on MapLibre 5, and the README lists it as a difference. _(My call: it does what upstream intends, without private API.)_ In the port, at most one forced redraw per Svelte update flush, however many props changed. The test counts renders.

### Events

11. **One listener per event, current callback.** Every MapLibre event in upstream's three tables (pointer, camera, other) is subscribed once at creation and dispatched to whatever callback prop is current. Changing a callback never re-subscribes.
12. **Feature picking.** With `interactiveLayerIds`, pointer events get `e.features` from `queryRenderedFeatures` over those layers (skipping ids not currently in the style). With hover callbacks present, `mouseenter`/`mouseleave` are synthesised at map level from `mousemove`/`mouseout` (`_updateHover`, `_onPointerEvent`).
13. **Errors.** An `error` event with no `onError` goes to `console.error`. A failed `mapLib` load goes to `onError` or `console.error`.

### Children, sources, layers

14. **Map gates children on the instance**, not on style load. Children render once the wrapper exists (`components/map.tsx`).
15. **Source gates children on the source.** A Source's children render only once `map.getSource(id)` returns something (`components/source.ts`).
16. **Guarded creation.** `addSource`/`addLayer` are attempted only when the style is loaded and, for a layer, its source exists. A component that comes too early does nothing and retries on the next `styledata`. It never throws for being early.
17. **Layer↔Source through the map.** A Layer's only link to a Source is the source id, checked against the map. Nesting a Layer inside a Source just supplies that id. `<Layer source="id">` outside any Source goes through exactly the same code.
18. **Style-reload recovery.** Each Source and Layer subscribes to `styledata` and, on each one, re-checks "am I in the style?" and re-adds itself if not. Source defers its re-check by a `setTimeout(0)`; Layer doesn't. Keep both as upstream has them unless a test shows the deferral is unnecessary, and record the finding.
19. **Updates.** Layer: `beforeId` → `moveLayer`; `paint`/`layout` key by key with deep equality, removed keys reset to `undefined`; `filter`; `minzoom`/`maxzoom` → `setLayerZoomRange`. Source: GeoJSON → `setData`; image → `updateImage`; otherwise `coordinates`/`url`/`tiles` through their setters, anything else warns `Unable to update <Source> prop: …`. Changing a Layer or Source `id` or `type` is an error, as upstream asserts. Auto-generated ids when none given (`jsx-source-N`, `jsx-layer-N`; the port may rename the prefix).
20. **Source teardown removes its layers first.** Before `removeSource`, every style layer that uses the source is removed, because the source can't be removed while layers reference it.

### Markers, popups, controls, refs, reuse

21. **Marker.** Created once; `longitude`/`latitude`, `offset`, `draggable`, `rotation`, `rotationAlignment`, `pitchAlignment`, `popup`, `className` updated in place; `onClick`, `onDragStart`, `onDrag`, `onDragEnd` with `lngLat` on drag events; custom children become the marker element.
22. **Popup.** Created once, children as its DOM content; `onOpen`, `onClose`; **`onClose` does not fire when the component unmounts**, only when the popup closes itself; `longitude`/`latitude`, `offset`, `anchor`, `maxWidth`, `className` updated while open.
23. **`useControl`.** Creates the control once, adds it at an optional `position`, calls optional `onAdd`/`onRemove`, removes it on teardown if the map still has it. All three overloads. All eight built-in controls (Attribution, Fullscreen, Geolocate, Navigation, Scale, Terrain, Logo, Globe) are built on it, with their upstream props and callbacks. Their `style` prop is applied through the control's `_container` (or `_controlContainer` for Fullscreen), as upstream does.
24. **`MapRef`, the typed fence.** The ref exposes every public map method bound to the map, _except_ the mutators upstream lists as breaking the binding (`setStyle`, `addLayer`, `setPaintProperty`, `setFilter`, `setMinZoom`, …, see `maplibre/create-ref.ts`), plus `getMap()` returning the raw map.
25. **`MapProvider` / `useMap`.** Maps register by `id` (default `"default"`); `useMap()` returns all registered maps plus `current`, the nearest enclosing map. Duplicate ids and the id `"current"` throw.
26. **`reuseMaps`.** Unmounting parks the wrapper in a static pool; the next mount reparents the canvas into the new container, swaps the container and its `ResizeObserver`, re-applies props without style diffing, re-applies `initialViewState`, and fires a synthetic `load`.
27. **`mapLib`, `gl`, globals.** `mapLib` (module or promise; default lazy `import('maplibre-gl')`); `gl` for rendering into an external WebGL context (one-shot `getContext` hijack); `RTLTextPlugin`, `maxParallelImageRequests`, `workerCount`, `workerUrl` applied as Map props.

## Svelte translations

Each row is a deliberate deviation from upstream's code. The README repeats this table for users.

| Upstream (React)                                                        | Port (Svelte 5)                                                                                                                                                                  | Why                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Imperative add/update in the render body (Source, Layer, Marker, Popup) | Creation in the component's script or an effect; updates in effects                                                                                                              | Svelte has no re-running render body. Gating (mechanisms 14–16) already guarantees creation order, as it does upstream.                                                                                             |
| `cloneElement(child, {source: id})` on a Source's direct children       | Source sets a context holding its id; Layer's `source` prop defaults to it; an explicit `source` prop wins                                                                       | Svelte can't inject props into children. **Semantic change:** applies to all descendants, not only direct children. The context carries only the id string, never a reference to the Source, so mechanism 17 holds. |
| `createPortal(children, element)` for Marker and Popup content          | Render the `children` snippet into an element the component owns, and hand that element to MapLibre                                                                              | DOM nodes can be moved; no portal needed.                                                                                                                                                                           |
| `forwardRef` + `useImperativeHandle`                                    | `bind:this` on the component; its exports give access to the same object upstream's ref holds (`MapRef` for Map, the MapLibre `Marker`/`Popup` instance for those)               | Follows dockview-svelte's precedent. Exact export names are the builder's call; document them.                                                                                                                      |
| `useRef({props})` to read the latest callback                           | Read the prop at call time                                                                                                                                                       | Svelte props are live.                                                                                                                                                                                              |
| `React.memo`, `useMemo(…, [])`                                          | Nothing, or a plain value created once in the script                                                                                                                             | Not needed.                                                                                                                                                                                                         |
| A camera field is controlled when present (`'zoom' in props`)           | Controlled when its value is not `undefined`                                                                                                                                     | Svelte props don't reliably distinguish "absent" from "undefined". `zoom={undefined}` is uncontrolled in the port. _(My call.)_                                                                                     |
| `style` as a React `CSSProperties` object                               | **Map:** `style` and `class` are normal attributes on the container `div`. **Marker, Popup, controls:** `style` stays an object of CSS properties applied one property at a time | Map's container is ours. The others are MapLibre-owned elements with their own inline styles (a marker's `transform`), which a CSS string would wipe. _(My call.)_                                                  |
| `useControl` hook                                                       | `useControl(…)` function called during a component's initialisation, same overloads                                                                                              | Same shape; uses context and teardown under the hood.                                                                                                                                                               |
| `useMap()` hook                                                         | `useMap()` called during initialisation, returning an object whose `current` and per-id entries stay reactive                                                                    | Destructuring would break reactivity; document that.                                                                                                                                                                |
| `MapContext.Provider` wrapping children                                 | Svelte context set by `<Map>`                                                                                                                                                    | Same purpose.                                                                                                                                                                                                       |

## VS Code alignment

Not applicable. This package is a standalone library housed in the repo (see Status), outside gcscode's extension architecture, so it has no extension-API divergence to record. Its alignment target is upstream react-map-gl, covered by "Svelte translations" above.

## Reactivity model

This is the "idiomatic Svelte" part, and the main place the port differs from upstream's code.

- **One effect per MapLibre call, not one diff over all props.** Each effect reads only the props that feed one MapLibre setter and calls it when they change. Examples: one effect for `cursor`, one for `mapStyle` + `styleDiffing`, one per interaction handler, one per setting.
- **Group props where MapLibre needs them together.** All camera fields (`longitude`, `latitude`, `zoom`, `pitch`, `bearing`, `padding`, `viewState`) in one effect, so a change becomes a single `jumpTo`. `minZoom` + `maxZoom` in one effect, `minPitch` + `maxPitch` in another, each with the ordering rule (mechanism 7). The style components (mechanism 9) in one effect that also runs after `style.load` and `sourcedata`.
- **Object-valued props still diff inside their effect.** `paint={{…}}` produces a new object whenever anything in it changes, so the `paint` effect compares key by key against the previous value and calls `setPaintProperty` only for changed keys, exactly as upstream does. The same goes for `layout`, `filter` and Source options. The gain over upstream is that a `paint` change doesn't re-check `layout`, `filter` or anything else.
- **Reassignment, not mutation.** As upstream, a change to an object-valued prop (`paint`, `layout`, `filter`, Source options including GeoJSON `data`, `mapStyle`) is seen only when a new object is passed. Changing a `$state` object in place (`data.features.push(f)`, `paint['circle-color'] = 'red'`) does nothing, because the effect either doesn't re-run or compares the object with itself. The port doesn't keep `$state.snapshot` copies to support it. The README says so prominently and shows the reassignment idiom. _(User's decision.)_
- **At most one forced redraw per flush** (mechanism 10). Effects that make an external change mark the map dirty; one redraw follows. How is the builder's call.
- **The camera hook reads props at call time.** `_onCameraUpdate` is called by MapLibre, outside Svelte's update cycle, and must see the current camera props.
- **Classes for the reactive core.** The MapLibre wrapper (upstream's `Maplibre` class) stays a class. If it becomes a `.svelte.ts` module with runes, it follows the repo's class conventions for Svelte external state: explicit `private`/`public`, `_backingField` for backing fields, get/set accessors. Components stay thin.

## Package shape

```
packages/map-gl-svelte/
├── package.json        # "map-gl-svelte", private, source entry; peers svelte ^5, maplibre-gl >=5
├── LICENSE             # upstream's MIT notice + a line for the port
├── README.md           # usage, attribution, Svelte-translations table, upstream pin
├── tsconfig.json  svelte.config.js  vitest.config.ts
├── src/
│   ├── index.ts        # mirrors upstream src/index.ts exports
│   ├── maplibre/       # the wrapper class and MapRef
│   ├── components/     # map, source, layer, marker, popup, 8 controls, use-control, use-map
│   ├── utils/          # transform, deep-equal, style-utils, set-globals, …
│   └── types/          # ported from upstream src/types
└── demo/               # vite app, own port (see "Demo")
```

- **Filenames** kebab-case, including `.svelte`, matching upstream's own file names where possible. Component bindings stay PascalCase.
- **Name** `map-gl-svelte`, following dockview-svelte's `<library>-svelte` pattern and avoiding the names of the existing `svelte-maplibre` and `svelte-maplibre-gl` packages. _(My call.)_
- **Peer** `maplibre-gl >=5`, tested against the workspace's 5.24. Upstream supports `>=4`; v4-only branches may be dropped, v6 branches kept. _(My call: gcscode is on 5.)_ The style-spec types upstream takes from `@maplibre/maplibre-gl-style-spec` may come from there or from `maplibre-gl`'s own exports; builder's call.
- **Workspace changes** limited to what the package needs: the lockfile, and root lint/format config only if the new package requires it.

## Testing

- **Real browser.** Vitest browser mode with Playwright and Chromium, configured in this package only, as upstream does (upstream's `vitest.config.ts` and `test/browser-test-setup.ts`, which also sets the MapLibre worker URL for v6 and stubs the geolocation permission). Pure utilities (`deep-equal`, `style-utils`, `transform`, class-name diffing) may run in Node.
- **`pnpm test` from the repo root must keep working** for the other packages and pass for this one once Chromium is installed; document the one-time `playwright install chromium` in the README. CI runs no tests today (`.github/workflows/` has only `auto-merge.yml`), so nothing else needs it.
- **Co-located `*.test.ts`**, per repo convention, rather than upstream's separate `test/` tree.
- **Every upstream case accounted for.** For each of upstream's spec files (`map`, `source`, `layer`, `marker`, `popup`, `controls`, `use-map`, and the five util specs), each test case is translated or listed with a one-line reason it was dropped (for example, React strict mode).
- **Upstream tests target MapLibre `^6`; the port runs on 5.24.** When a translated test fails, decide by reading whether it's a port bug or a version difference. A version difference gets its test adjusted, with the reason in the README, never changed silently.
- **Svelte-specific tests on top**, for the risks the translation introduces: a Layer rendered before its Source exists; a style swap re-adding sources and layers; Source teardown removing its layers; one redraw per flush when several props change at once; nested and flat `<Layer>` behaving identically; Popup `onClose` not firing on unmount; controlled camera ignoring a gesture when `onMove` is not applied.
- **New tests are seen failing.** Per the repo's review discipline: for each Svelte-specific test, break the implementation, watch that test fail for the right reason, restore, and note the mutation in the task report.
- `pnpm check` and `pnpm lint` pass.

## Demo

`demo/` as in dockview-svelte (`pnpm --filter map-gl-svelte demo`, its own port). A few pages modelled on upstream's examples: uncontrolled and controlled camera, a GeoJSON source with layers plus a style-swap button, markers and popups, the built-in controls, and `useControl` with a minimal custom control. Tiles from OpenFreeMap's positron style, as `map-view.svelte` uses (free, no key). deck.gl and drawing examples are out of scope (they need extra dependencies, and belong with the benchmark).

## Known unknowns: open questions to settle by measuring, not reading

Each answer goes in the README or the plan's notes.

1. **Controlled camera during a drag.** The hook returns the _current_ props, and the app's update lands a flush later. Does the port's map lag one event behind while dragging? Measure the port; for React, reason from upstream's code.
2. **Teardown order.** Does Svelte tear down a parent's effects before or after its children's? Upstream's Source cleanup is written for React's parent-first order.
3. **Source's `setTimeout(0)`.** Is it needed in Svelte?
4. **Effect timing.** Does the forced redraw need `$effect.pre` (before the DOM update) or does `$effect` keep map and UI in the same frame?

## Left to the builder

- Task breakdown and order.
- File layout inside `src/`, beyond the shape above.
- Export names for the `bind:this` surface.
- The redraw-batching mechanism.
- How upstream's types are ported (copied, trimmed, or re-derived from `maplibre-gl`).
- Demo page details.
