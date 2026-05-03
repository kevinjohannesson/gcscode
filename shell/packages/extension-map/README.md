# @gcscode/extension-map

Geographical view contributing the `gcscode.map.main` view. Renders a maplibre canvas with a hardcoded basemap (OpenFreeMap positron style). Exposes a contribution API for other extensions to register map layers.

This is the **first service-style extension** in gcscode — its primary value is the API surface other extensions render INTO, not the visible UI it contributes itself. The closest VS Code analogue is the editor-with-decorations / language-services pattern.

The throwaway `@gcscode/extension-map-demo` coexists in the bundle as a side-by-side reference.

## Contributions

- **View** — `gcscode.map.main`. Renders the maplibre canvas and mounts registered layers.

## Cross-extension exports (the `MapApi`)

```ts
import type { MapApi } from '@gcscode/extension-map';

const map = host.extensions.getExtension<MapApi>('gcscode.map')?.exports;
if (map) {
  context.subscriptions.push(map.registerLayer(MyLayerComponent));
  // map.camera.zoom = 14;  // editable; field-level writes apply instantly
}
```

### `registerLayer(component): Disposable`

Mounts `component` as a child of the map view's tree. The component receives the live maplibre `Map` instance via Svelte context (key `'gcscode.map.maplibre'`). The returned `Disposable.dispose()` unmounts the component; idempotent.

Layer components must be Svelte. They typically render no visible DOM; their job is to read the maplibre instance from context and call maplibre APIs imperatively from `$effect` blocks (add markers, sources, layers, etc.) and clean up on `onDestroy`.

### `camera: MapCamera`

```ts
interface MapCamera {
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
}
```

`$state`-backed. Read inside `$derived` / template / `$effect` to react to camera changes. Field-level writes (e.g. `map.camera.zoom = 14`) apply to the maplibre canvas instantly via `jumpTo` (no animation). The reference itself is stable (`readonly camera`); replacing the object is a type error.

Writes from inside maplibre's own pan/zoom interactions are written back to `camera` automatically — two-way binding.

**Multiple consumers writing the camera in the same tick: last-write-wins.** No locking, no priorities. If a coordination need surfaces, add it as a follow-up iteration.

### Svelte context key

```ts
import { getContext } from 'svelte';
import type maplibregl from 'maplibre-gl';

const getMap = getContext<() => maplibregl.Map | null>('gcscode.map.maplibre');
```

The string literal `'gcscode.map.maplibre'` is the public contract. Re-declare it in your consumer; do not `import` it from this package at runtime (ADR-0005 forbids runtime sibling imports). The constant is also exported as `MAPLIBRE_CONTEXT_KEY` for type-only / documentation purposes.

The getter form is intentional — children mount before the parent's `onMount` runs, so the underlying `Map` is null at the time `setContext` registers the value. Layer components call the getter at `$effect` time to read the current value.

## Tile source

`https://tiles.openfreemap.org/styles/positron` — same as `map-demo`. Free, no API key, vector tiles, monochrome cartography. Permitted for development and production.

## What's NOT in this package

- Selection state, animated camera (`flyTo`/`easeTo`), follow-mode toggle, recenter button, layer-ordering API, multi-drone, route history, manual targeting. See `docs/specs/2026-05-03-map-and-flight-overlay.md` for the full deferral list.

## See also

- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries (cross-extension exports + type-only sibling imports)
- [Spec 2026-05-03-map-and-flight-overlay](../../docs/specs/2026-05-03-map-and-flight-overlay.md) — this iteration
- [`@gcscode/extension-flight-overlay`](../extension-flight-overlay/README.md) — first consumer
