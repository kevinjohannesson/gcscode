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

### `registerControl(registration): Disposable`

Register an interactive control rendered over the map canvas. Two registration shapes are accepted; the host renders both inside the same per-corner slot wrapper (positioning + spacing chrome).

#### Declarative property bag (recommended)

Prefer this path for icon-button controls. The host renders a uniformly-styled button (32×32 px, white, drop shadow) so all controls look consistent regardless of which extension contributed them.

```ts
context.subscriptions.push(
  map.registerControl({
    id: 'myExtension.recenter',
    position: 'top-right',
    icon: { kind: 'lucide', name: 'crosshair' },
    tooltip: 'Recenter on drone',
    commandId: 'myExtension.recenter',
  }),
);
```

The `commandId` must reference a command registered via `host.commands.registerCommand`. Click fires the command via `executeCommand` (fire-and-forget — the host does not surface the command's return value or rejection back to the contributor).

The icon is a discriminated union:

- `{ kind: 'lucide'; name: string }` — name resolved against the lucide set the host pre-registers. If you need a name not yet pre-registered, see the static map in `packages/extension-map/src/lucide-icon.svelte` (a 2-line PR).
- `{ kind: 'svg'; svg: string }` — raw SVG markup, inlined by the host. Include a `viewBox`; omit `width`/`height` on the root `<svg>`; use `currentColor` for strokes/fills so the host's hover state reaches the icon.

`position` is one of `'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`. Top corners stack registered controls downward from the corner; bottom corners stack upward.

#### Component escape hatch (advanced)

Use only when the control's shape doesn't fit an icon button — multi-state toggles, layer-toggle dropdowns, zoom-level indicators. The component renders inside the same slot wrapper but owns its visual.

```ts
context.subscriptions.push(
  map.registerControl({
    id: 'myExtension.layerToggle',
    position: 'bottom-right',
    component: MyLayerToggle,
  }),
);
```

The component reads the maplibre `Map` instance via the same Svelte context layers use — `getContext<() => maplibregl.Map | null>('gcscode.map.maplibre')`.

#### Errors and limits

- `id` must be unique across all controls. Re-using a still-registered `id` throws.
- `id` ordering: registration order. No numeric `priority` field today.
- No visibility / `when` clauses today. Registered controls are always visible.
- No customization of host-rendered button colors / hover state on the declarative path. If you need a different visual, use the component escape hatch (and accept the loss of operator-UX consistency).

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

- Selection state, animated camera (`flyTo`/`easeTo`), follow-mode toggle, layer-ordering API, multi-drone, route history, manual targeting. See `docs/specs/2026-05-03-map-and-flight-overlay.md` for the layer-iteration deferrals and `docs/specs/2026-05-03-map-controls.md` for the controls-iteration deferrals (control priority ordering, hover-state customization, theme tokens, SVG sanitization).

## See also

- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries (cross-extension exports + type-only sibling imports)
- [Spec 2026-05-03-map-and-flight-overlay](../../docs/specs/2026-05-03-map-and-flight-overlay.md) — this iteration
- [`@gcscode/extension-flight-overlay`](../extension-flight-overlay/README.md) — first consumer
