# map-gl-svelte

A Svelte 5 port of `@vis.gl/react-maplibre`, the MapLibre bindings of react-map-gl. The public API follows upstream's: the same components, props, callback names and event payloads. The internals use Svelte's own fine-grained reactivity instead of React's re-render-and-diff. Everything that behaves differently is listed below.

This package is a standalone artifact housed in the gcscode repo: `"private": true`, consumed from source (no build step), client-only (no SSR). It is not part of the gcscode shell or its extensions.

This package is a port of [`@vis.gl/react-maplibre`](https://github.com/visgl/react-map-gl) (react-map-gl v8.1.3, MIT, Copyright Vis.gl contributors). See `LICENSE`.

## Setup

Peers: `svelte ^5.0.0` and `maplibre-gl >=5.0.0` (tested on 5.24). Import MapLibre's stylesheet once, as with any MapLibre app. The package's entry point is `src/index.ts`; from another workspace package, depend on it as `"map-gl-svelte": "workspace:*"`.

A `<Map>` fills its parent (`width: 100%; height: 100%`), so give the parent a size.

```svelte
<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { Map } from 'map-gl-svelte';
</script>

<div style="height: 400px">
  <Map
    initialViewState={{ longitude: 4.9, latitude: 52.37, zoom: 11 }}
    mapStyle="https://tiles.openfreemap.org/styles/positron"
  />
</div>
```

That is the **uncontrolled** form: `initialViewState` sets the first camera and the map moves on its own after that.

## Usage

The examples below write `BASEMAP` for a style URL such as the one above.

### Controlled camera

A camera field (`longitude`, `latitude`, `zoom`, `pitch`, `bearing`, `padding`) is controlled when its value is not `undefined`. The map only moves where `onMove` applies the proposed camera to your state. Fields you leave out stay free.

```svelte
<script lang="ts">
  import { Map, type ViewState } from 'map-gl-svelte';

  let view = $state<ViewState>({
    longitude: 4.9,
    latitude: 52.37,
    zoom: 11,
    pitch: 0,
    bearing: 0,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
  });
</script>

<Map
  longitude={view.longitude}
  latitude={view.latitude}
  zoom={view.zoom}
  pitch={view.pitch}
  bearing={view.bearing}
  onMove={(e) => (view = e.viewState)}
  mapStyle="https://tiles.openfreemap.org/styles/positron"
/>
```

Setting `view` yourself (a button that rotates, say) moves the map without firing `onMove`. See [open question 1](#open-questions-answered) for how this behaves during a drag.

### Sources and layers

Object props update on **reassignment, not mutation**. Pass a new object to change `data`, `paint`, `layout`, `filter`, `mapStyle` or a Source's options. Changing an object in place (`data.features.push(f)`, `paint['circle-color'] = 'red'`) does nothing: the prop still holds the same object, so there is no change to see, and the port keeps no `$state.snapshot` copies to catch one. `$state.raw` fits this rule, because only an assignment can change it.

```svelte
<script lang="ts">
  import { Layer, Map, Source } from 'map-gl-svelte';

  let data = $state.raw<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] });

  function addStop(feature: GeoJSON.Feature) {
    // Reassign. `data.features.push(feature)` would change nothing.
    data = { ...data, features: [...data.features, feature] };
  }
</script>

<Map initialViewState={{ longitude: 4.9, latitude: 52.37, zoom: 11 }} mapStyle={BASEMAP}>
  <!-- Nested: the Layer takes its source id from the enclosing Source. -->
  <Source id="stops" type="geojson" {data}>
    <Layer
      id="stops-circle"
      type="circle"
      paint={{ 'circle-radius': 6, 'circle-color': '#e11d48' }}
    />
  </Source>

  <!-- Flat: the same thing, with the source named. Works anywhere inside the Map. -->
  <Layer
    id="stops-halo"
    source="stops"
    type="circle"
    paint={{ 'circle-radius': 12, 'circle-opacity': 0.2 }}
  />
</Map>
```

Nested and flat layers go through the same code: a Layer's only link to a Source is the source id, checked against the map. A style swap (`mapStyle` changing) wipes the style's sources and layers; both forms re-add themselves.

### Markers and popups

```svelte
<script lang="ts">
  import { Map, Marker, Popup } from 'map-gl-svelte';

  let pin = $state({ longitude: 4.8952, latitude: 52.3702 });
  let open = $state(true);
</script>

<Map initialViewState={{ longitude: 4.9, latitude: 52.37, zoom: 12 }} mapStyle={BASEMAP}>
  <Marker
    longitude={pin.longitude}
    latitude={pin.latitude}
    draggable
    onDrag={(e) => (pin = { longitude: e.lngLat.lng, latitude: e.lngLat.lat })}
    onClick={(e) => {
      e.originalEvent.stopPropagation();
      open = true;
    }}
  />

  {#if open}
    <Popup
      longitude={pin.longitude}
      latitude={pin.latitude}
      anchor="bottom"
      offset={42}
      onClose={() => (open = false)}
    >
      Dragged to {pin.latitude.toFixed(4)}, {pin.longitude.toFixed(4)}
    </Popup>
  {/if}

  <!-- Children replace MapLibre's default pin. -->
  <Marker longitude={4.93} latitude={52.365} anchor="bottom">
    <div class="badge">Ground station</div>
  </Marker>
</Map>
```

A Popup's `onClose` fires when the popup closes itself (its close button, a click on the map), not when the component unmounts.

### Controls

The eight built-in controls are components: `AttributionControl`, `FullscreenControl`, `GeolocateControl`, `GlobeControl`, `LogoControl`, `NavigationControl`, `ScaleControl` and `TerrainControl`. Each takes its MapLibre options as props, plus `position` and `style`.

```svelte
<Map initialViewState={...} mapStyle={BASEMAP} attributionControl={false}>
  <NavigationControl position="top-right" />
  <ScaleControl position="bottom-left" unit="metric" />
  <AttributionControl position="bottom-right" customAttribution="my app" />
</Map>
```

### A custom control

`useControl` takes the same three overloads as upstream. Call it while a component initialises, inside a `<Map>`. The control is added when the component mounts and removed when it is destroyed.

```svelte
<script module lang="ts">
  import type { IControl, MapInstance } from 'map-gl-svelte';

  class ZoomReadout implements IControl {
    private _map: MapInstance | undefined;
    private _element: HTMLDivElement | undefined;

    public onAdd(map: MapInstance): HTMLElement {
      this._map = map;
      this._element = document.createElement('div');
      this._element.className = 'maplibregl-ctrl';
      map.on('move', this._update);
      this._update();
      return this._element;
    }

    public onRemove(): void {
      this._map?.off('move', this._update);
      this._element?.remove();
    }

    private _update = (): void => {
      if (this._map && this._element) {
        this._element.textContent = `zoom ${this._map.getZoom().toFixed(2)}`;
      }
    };
  }
</script>

<script lang="ts">
  import { useControl } from 'map-gl-svelte';

  useControl(() => new ZoomReadout(), { position: 'top-left' });
</script>
```

Use that component as a child of `<Map>`. The demo's `zoom-readout.svelte` is a worked version.

### Several maps, and reaching the map

`bind:this` replaces upstream's refs. `<Map>` exports `getMapRef()`, which returns the `MapRef` (every public map method, bound to the map, minus the mutators upstream fences off, plus `getMap()` for the raw MapLibre map) or `null` until the map exists. `<Marker>` exports `getMarker()`, `<Popup>` `getPopup()` and `<GeolocateControl>` `getControl()`.

`<MapProvider>` and `useMap()` work as upstream's do. Call `useMap()` during component initialisation and read `maps.current` or `maps[id]` where you use them. **Don't destructure** the result: `const { current } = useMap()` takes a snapshot and loses reactivity.

```svelte
<!-- app.svelte -->
<MapProvider>
  <Map id="left" ... />
  <Map id="right" ... />
  <Toolbar />
</MapProvider>
```

```svelte
<!-- toolbar.svelte -->
<script lang="ts">
  import { useMap } from 'map-gl-svelte';

  const maps = useMap();
</script>

<button onclick={() => maps.left?.flyTo({ center: [0, 0] })}>Left to 0, 0</button>
```

### Props that differ in kind

- `style` on `<Map>` is a CSS string, applied to the container after `position: relative; width: 100%; height: 100%`. `class` on `<Map>` is a string too (see difference 14).
- `style` on `<Marker>`, `<Popup>` and the controls is an **object** of CSS properties, applied one property at a time. MapLibre owns those elements' inline styles (a marker's `transform`, say), which a CSS string would wipe.

### Exports

`Map` (also the default export), `Source`, `Layer`, `Marker`, `Popup`, the eight controls, `useControl`, `MapProvider` and `useMap`. Types: `MapProps`, `MapRef`, `SourceProps`, `LayerProps`, `MarkerProps`, `PopupProps`, one props type per control, and the types upstream exports: `ViewState`, the event payloads, the style-spec types, and the MapLibre instance types (`MapInstance`, `MarkerInstance`, `IControl` and so on).

## Demo

```sh
pnpm --filter map-gl-svelte demo
```

Opens a Vite app on port 5175 with five pages: uncontrolled and controlled cameras side by side, a GeoJSON source with circle and line layers (a button that reassigns `data`, another that swaps the style), a draggable marker with a popup and a marker with custom children, all eight built-in controls, and a custom `IControl` through `useControl`. The basemap is OpenFreeMap's positron style (free, no key), so the demo needs network access. The demo imports the package only through `map-gl-svelte`.

## Tests

Vitest browser mode with Playwright, running real MapLibre in Chromium. Tests never touch the network: they use inline styles. Install the browser once:

```sh
pnpm --filter map-gl-svelte exec playwright install chromium
```

```sh
pnpm --filter map-gl-svelte test
pnpm --filter map-gl-svelte check
```

## Svelte translations

Each row is a deliberate deviation from upstream's code. (Mechanism numbers refer to the "Upstream mechanisms to preserve" list in the design document, `docs/specs/2026-10-24-map-gl-svelte.md`.)

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

## Differences from upstream

Upstream is `@vis.gl/react-maplibre` at tag `v8.1.3` (`modules/react-maplibre/` only). The aim is that anything not listed here behaves as upstream does. That is a goal, not a proof: a difference that isn't listed is a bug in this port or in this list.

### Behavior

1. **Forced redraw uses MapLibre's public `map.redraw()`.** After an external change (a setting, the controlled size, the camera while the map isn't moving), the map is redrawn synchronously so the map and the surrounding UI change in the same frame. Upstream cancels `map._frame` and calls `map._render()`. On MapLibre 5 the pending frame is held in `_frameRequest` and there is no `_frame`, so, from reading upstream's code, upstream's cancel does nothing and it renders twice per external change. The port renders once. At most one redraw happens per Svelte update flush, however many props changed.
2. **Reassignment, not mutation.** See [Sources and layers](#sources-and-layers). This covers `paint`, `layout`, `filter`, Source options including GeoJSON `data`, and `mapStyle`.
3. **`zoom={undefined}` is uncontrolled.** A camera field is controlled when its value is not `undefined`. Upstream decides by whether the prop is present (`'zoom' in props`), which Svelte props can't reliably tell from "undefined".
4. **A Source's id reaches all its descendant Layers**, through context, not only direct children (upstream uses `cloneElement` on direct children). An explicit `source` prop on a Layer wins.
5. **No `GeolocateControl._setupUI` patch.** Upstream's patch exists only to survive React strict mode's double mount.
6. **Peer `maplibre-gl >=5`** (upstream: `>=4`). Tested on 5.24. The branch for MapLibre 6's `setTransformCameraUpdate` is ported from upstream, but nothing here exercises it: on 5.24 that method doesn't exist, so the `transformCameraUpdate` property path runs.
7. **`bind:this` instead of refs.** `getMapRef()` on `<Map>`, `getMarker()` on `<Marker>`, `getPopup()` on `<Popup>`, `getControl()` on `<GeolocateControl>`.
8. **`useMap()`**: read `maps.current` and `maps[id]` directly; destructuring loses reactivity.
9. **`style`**: an object of CSS properties on Marker, Popup and the controls; a CSS string on `<Map>`. See above.
10. **Auto ids** are `svelte-source-N` and `svelte-layer-N` (upstream: `jsx-source-N`, `jsx-layer-N`).
11. **GeoJSON `data` is compared by reference.** Any reassignment calls `setData`, even to a deep-equal object. Upstream deep-compares.
12. **Camera limits follow upstream `main`'s fix #2612, which is not in v8.1.3.** A nullish `minZoom`, `maxZoom`, `minPitch` or `maxPitch` goes straight to MapLibre's setter and resets to MapLibre's own default (5.24: zoom −2 to 22, pitch 0 to 60), and nullish limits are stripped from the constructor options. v8.1.3 hard-codes `minZoom` 0, `maxZoom` 22, `minPitch` 0 and `maxPitch` 85, which is wrong on MapLibre 5, where the default maximum pitch is 60.
13. **The internal-update flag is reset in a `finally`.** If a camera listener throws during an external camera write, the port still clears its flag. Upstream would leave it set and permanently silence camera callbacks and controlled-camera enforcement.
14. **`class` on `<Map>` is an addition** (upstream's `<Map>` has none). It is applied token by token, so MapLibre's own container classes (`maplibregl-map` and the rest) survive changes and map reuse. Only string values are supported.
15. **A Layer leaves out `undefined`-valued keys** (`paint={undefined}`, say) when it calls `addLayer`. MapLibre rejects them, and Svelte passes an unset pass-through prop as a present key with the value `undefined`.
16. **One effect per MapLibre call** has two visible consequences:
    - within one update, a Layer `id` or `type` change (an error, which is warned about) no longer stops that update's other changes, where upstream's single `try` skips them;
    - a GeoJSON Source can receive `setData` twice when `data` and another option change in the same update.
17. **Popup props changed while the popup is closed** apply only when that prop next changes. Upstream re-diffs every prop on its next render while open, so a popup reopened from its marker catches up there. In the port, a popup reopened this way can show a stale `offset`, `className`, `anchor` or `maxWidth`. For a marker's popup, MapLibre re-sets its position from the marker anyway.
18. **A Marker whose `children` snippet renders nothing** (`{#if false}…{/if}`, say) gets an empty custom element, not MapLibre's default pin. Upstream ignores falsy children; Svelte can't tell that a snippet renders nothing.
19. **Marker opacity:** MapLibre rewrites a marker element's `style.opacity` from its own `opacity` option on every frame, upstream too. Set opacity with the Marker's `opacity` prop, not `style`.
20. **`FullscreenControl` passes all its typed options to MapLibre** (`pseudo`, for one). Upstream passes only `container` and silently ignores the rest.
21. **A duplicate map id, or the id `current`,** goes to that `<Map>`'s `onError`, or to `console.error` if it has none. The second map still renders but isn't registered with `<MapProvider>`, and unmounting it doesn't unregister the first. Upstream throws during `MapProvider`'s render, which crashes the tree.

### Tests

Upstream's tests target MapLibre `^6`; these run on 5.24.

22. Upstream's test `getTransformLike#pre-v5` is dropped: the port's floor is MapLibre 5.
23. Upstream's `Map#controlled#mirror-back` assertion is kept verbatim as an **expected failure** (`test.fails`), next to a test that pins the measured lag. See open question 1.
24. The two translated upstream `Source`/`Layer` tests wait for the source or the layer itself, where upstream waits for the style to load. Measured: a pending re-check can re-add the source before the style swap's own `styledata`, after which upstream's wait never resolves. The assertions are unchanged.
25. **No translated test needed adjusting for a MapLibre 5-versus-6 difference.** Each translated test was run on 5.24 and any failure was read to decide between a port bug and a version difference; none turned out to be a version difference. The test differences in 22 to 24 come from the port's floor, from Svelte, and from a timing assumption in upstream's helper.

## Open questions, answered

The spec set four questions to settle by measuring. All measurements are on MapLibre 5.24 in headless Chromium.

1. **Does a controlled camera lag during a drag?** Yes, by one event. While the map is moving, the controlled map renders the camera from the _previous_ `onMove`, one event behind the app's state, and catches up when movement ends. Delayed updates (state set in a `setTimeout`) behave as upstream's test expects. The mechanism is the same as in React: the camera hook can only apply props the app has already set, and `onMove` reports the proposal after the hook ran. Upstream's mirror-back test passes in React only because the `viewState` it checks against is the one bound at React's last render, which is just as stale as the map. Svelte's `$state` is already current, so the lag becomes visible. React's side is reasoned from upstream's code, not measured.
2. **Does Svelte tear a parent's effects down before or after its children's?** Children before parent, the opposite of React. Upstream's Source cleanup (remove every style layer that uses the source, then the source) is still needed, for flat `<Layer source="…">` components that live outside the Source.
3. **Is Source's `setTimeout(0)` needed?** No: the style-swap test is green without it. It is kept anyway, for fidelity with upstream.
4. **Does the forced redraw need `$effect.pre`?** No. The redraw (one microtask after the update) lands before the next animation frame, with or without `flushSync`, and `$effect` versus `$effect.pre` makes no difference. Only render-before-next-frame was measured; that the DOM is updated before the effect runs relies on Svelte's documented flush order.

## How it works

- The `Maplibre` wrapper class (upstream's, translated) reads the component's live props object at call time. That is how the camera hook and the event callbacks always see current values, though MapLibre calls them outside Svelte's update cycle.
- `<Map>` moves MapLibre's own elements ahead of the children wrapper, so children (overlays) sit above the canvas, as in upstream's DOM.
- `reuseMaps`: `recycle()` keeps a shallow copy of the props, because after unmount a Svelte component's props keep reading the parent's live state. This relies on Svelte returning pre-update values during teardown, which is internal behavior; two tests guard it.
- Private MapLibre API the port touches, all of it also used by upstream: `map.style._loaded`; `map._container`, `map._resizeObserver` and `map._update` (map reuse only); each control's `_container`, and `FullscreenControl._controlContainer` (to apply a control's `style`). Upstream also uses `map._frame`, `map._render` and `GeolocateControl._setupUI`; the port does not.

## Upstream and license

- Upstream: [`visgl/react-map-gl`](https://github.com/visgl/react-map-gl), tag `v8.1.3`, `modules/react-maplibre/`. Not ported: `@vis.gl/react-mapbox` and the `react-map-gl` umbrella module.
- MIT, Copyright Vis.gl contributors. `LICENSE` reproduces upstream's notice and adds a line for the port. Don't release this package without it.
- The design document is `docs/specs/2026-10-24-map-gl-svelte.md` in the repo.
