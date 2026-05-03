# Map + flight-overlay — first service-style extension

**Status:** Approved (2026-05-03)

## Context

The roadmap's "Map" entry under Feature extensions → Coming is the real iteration that follows the throwaway `extension-map-demo` (spec `2026-05-03-map-demo.md`). The demo proved out maplibre integration and the consumer-side cross-extension pattern from a single self-contained extension. This iteration takes the next step: split the single demo into two extensions, with the map exposing a contribution API that other extensions render layers into.

This is the **first service-style extension** in gcscode. To date, every extension has been one of two shapes:

- **Self-rendering** — registers a view / status bar item / command, renders directly (`example`, `sitl`, `vehicle-status`, `workbench`, `map-demo`).
- **Data producer** — returns exports from `activate()` for other extensions to read (`sitl`).

`gcscode.map` introduces a third shape: an extension that exposes a **rendering surface** other extensions render INTO, via a contribution API on its exports. This pattern is the closest gcscode-side analogue to VS Code's editor-with-decorations / hover-providers / language-services integration.

The iteration also creates `gcscode.flight-overlay` — the first consumer of the map's contribution API, registering three layer components (drone marker, home location, max-distance circle). Two are point geometries, one is a polygon-circle, exercising different maplibre primitives at modest API breadth.

The existing `gcscode.map-demo` extension stays bundled. It coexists with the real map as a side-by-side reference; operators can disable either via the extensions panel.

## Goals

- New workspace package `@gcscode/extension-map` (separate from `extension-map-demo`).
  - Renders a maplibre canvas in a view contribution (`gcscode.map.main`).
  - Exposes `MapApi` via cross-extension exports: `registerLayer(component): Disposable` plus a reactive `camera: MapCamera` (read + field-level write).
  - Mounts registered layer components inside its own component tree so layers consume a shared maplibre `Map` instance via Svelte context (key `'gcscode.map.maplibre'`).
  - Camera state is two-way bound: maplibre's `move` event writes back into `camera`; `$effect` watching `camera` calls maplibre `jumpTo` (instant, no animation).
- New workspace package `@gcscode/extension-flight-overlay`.
  - On activate, looks up `gcscode.map` and `gcscode.sitl` via `host.extensions.getExtension(...)`.
  - Registers three layer components: drone marker (live SITL telemetry), home location (hardcoded), max-distance circle (hardcoded radius around home).
  - Holds hardcoded coordinates in a module-level config file (no settings system yet).
- Both new extensions added to `bundledExtensions` after `gcscode.sitl` and `gcscode.map-demo`. Map activates before flight-overlay (insertion-order).
- `extension-map-demo` is **not** removed in this iteration. It stays bundled alongside the real map.
- Roadmap propagation: tick `Map` checkbox; add a `flight-overlay` entry under Feature extensions → Coming linking this spec; leave `Map (demo)` line as-is.
- VS Code alignment ledger gets new rows for service-style extension pattern, cross-extension Svelte-component contribution, and string-keyed Svelte context as a public API contract.
- `out-of-scope.md` gets new entries for camera coordination, layer ordering API, animated camera, and map-rendered UI controls.

## Non-goals

- **No selection state.** No "click drone → selected" semantics; no shared selection on map exports. Defers per the brainstorm.
- **No animated camera (`flyTo` / `easeTo`).** Camera writes apply instantly via `jumpTo`. Reasoning: SITL GLOBAL_POSITION_INT cadence at ~5 Hz would stack `easeTo` animations and feel laggy (same as map-demo). When a real animation use case lands, expose it as an additional method.
- **No camera coordination between consumers.** Last-write-wins. Two extensions writing the camera in the same tick = the second write clobbers the first. No locking, no priorities. Defer until a real conflict surfaces.
- **No UI controls rendered on top of the map.** No zoom buttons, no recenter button, no layer panel. The map renders a maplibre canvas only. Operator chrome on the map is its own iteration.
- **No layer ordering / z-index API.** Layers render in registration order, paint order = registration order. Mirrors the existing status-bar `priority`-deferral. Trigger to revisit: third-party wants to insert between two first-party layers.
- **No real settings or persistence for `homeLocation` / `maxDistanceMeters`.** Hardcoded module-level constants in flight-overlay. Trigger: settings system lands, or operator UX feedback says runtime tunability is needed.
- **No multi-drone, no route history / breadcrumbs, no manual drone targeting, no real geofence, no no-fly zones.** Each is a future iteration with its own consumer pulling on it.
- **No removal of `extension-map-demo`.** Demo and real map coexist. Roadmap entry for `Map (demo)` stays as-is.
- **No declarative `contributes.layers` manifest.** Imperative `registerLayer` only. Same trigger as the existing `contributes` deferral row in the ledger.
- **No escape hatch for non-Svelte layers.** Layer components must be Svelte. Aligns with ADR-0005.
- **No tests of maplibre rendering.** Maplibre is heavy in jsdom and most rendering correctness is library responsibility. Unit tests cover registry semantics, disposable lifecycle, exports shape, and the activation-failure path. Browser smoke is the regression check.
- **No ADR.** All decisions extend established patterns: workspace package per ADR-0001, view contribution per A-phase, type-only sibling import per ADR-0005, manifest per ADR-0007, cross-extension exports per ADR-0005. The "service-style extension" framing is a ledger note, not a new architectural decision.

## `packages/extension-map/` — new package

Mirrors `packages/extension-map-demo/` shape, with an additional `map-api.svelte.ts` module for the reactive registry + camera state.

### `packages/extension-map/package.json` (new)

```json
{
  "name": "@gcscode/extension-map",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gcscode/extension-api": "workspace:*",
    "maplibre-gl": "^5.24.0"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

`maplibre-gl` version pinned to match `extension-map-demo`'s pin (`^5.24.0`). Both packages must resolve to the same maplibre instance at runtime for the cross-package pattern to work; pnpm hoists shared minor-compatible versions automatically.

No type-only deps on sibling extensions — the map is a producer, not a consumer.

### `packages/extension-map/tsconfig.json` (new)

Verbatim copy of `packages/extension-map-demo/tsconfig.json`.

### `packages/extension-map/src/css.d.ts` (new)

Verbatim copy of `packages/extension-map-demo/src/css.d.ts` (declares the `'maplibre-gl/dist/maplibre-gl.css'` import).

### `packages/extension-map/src/map-api.svelte.ts` (new)

The class-backed reactive registry + camera state. C# conventions per memory: explicit `private`/`public`, `_backingField` underscore convention, getter for read-only-from-outside semantics.

```ts
import type { Component } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import type { Disposable } from '@gcscode/extension-api';

/**
 * Camera state shape — read or assign individual fields. The camera object
 * itself is stable (`readonly camera` on `MapApi`); consumers mutate fields,
 * not the reference.
 */
export interface MapCamera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

/**
 * The cross-extension exports of `gcscode.map`. Consumers `import type` this
 * from `@gcscode/extension-map` and look up the live value via
 * `host.extensions.getExtension<MapApi>('gcscode.map')?.exports`.
 *
 * `registerLayer(component)` mounts `component` as a child of the map view's
 * tree (so the component's `getContext('gcscode.map.maplibre')` resolves to
 * the live maplibre `Map` instance). Returns a `Disposable` that removes the
 * mount on `dispose()`.
 *
 * `camera` is `$state`-backed; reads inside `$derived` / template / `$effect`
 * track field changes. Writes apply via maplibre `jumpTo` (no animation).
 * Multiple writers in the same tick: last-write-wins.
 */
export interface MapApi {
  registerLayer(component: Component): Disposable;
  readonly camera: MapCamera;
}

/** Initial camera fallback. Matches map-demo (Canberra, SITL test data center). */
const INITIAL_CAMERA: MapCamera = {
  center: [149.17, -35.36],
  zoom: 13,
  pitch: 0,
  bearing: 0,
};

class MapApiImpl implements MapApi {
  private _layers = new SvelteMap<string, { component: Component }>();
  private _camera: MapCamera = $state({ ...INITIAL_CAMERA });
  private _nextLayerId = 0;

  /** Read-only view of the registry for the map view's `{#each}` block. */
  public get layers(): SvelteMap<string, { component: Component }> {
    return this._layers;
  }

  public get camera(): MapCamera {
    return this._camera;
  }

  public registerLayer(component: Component): Disposable {
    const id = `layer-${this._nextLayerId++}`;
    this._layers.set(id, { component });
    return {
      dispose: () => {
        this._layers.delete(id);
      },
    };
  }
}

/**
 * Module-level singleton. Lives across enable/disable cycles of
 * `gcscode.map` — mirrors the host-singleton pattern used by vehicle-status
 * and map-demo. Re-enabling the map remounts the view, which re-iterates the
 * registry and renders the layers fresh against the new maplibre instance.
 */
export const mapApi = new MapApiImpl();

/** Stable Svelte context key. Part of the public API contract — flight-overlay
 * (and any future consumer) declares this same string independently. Documented
 * in this package's README. */
export const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
```

The `mapApi` singleton is module-scope. The map extension's `activate` returns it as exports; `deactivate?()` is not implemented because the singleton's state (registry, camera) survives enable/disable correctly: layer entries persist (Disposables clean them when the registering extension itself disables), camera state persists (reset to INITIAL_CAMERA only at module load).

### `packages/extension-map/src/map-view.svelte` (new)

```svelte
<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { onDestroy, onMount, setContext } from 'svelte';

  import { mapApi, MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';

  let container: HTMLDivElement | undefined = $state();
  let map: maplibregl.Map | null = $state(null);

  // Loop guard: when our $effect writes camera state INTO maplibre, maplibre
  // fires a `move` event that would otherwise write right back, masking the
  // original write or causing spurious re-renders.
  let isUpdatingFromCamera = false;

  // Layer components access the maplibre Map via context. The getter form
  // (() => map) resolves `map` lazily — children mount before the parent's
  // onMount runs, so the value at setContext time is null. Layers read the
  // current value at $effect time. Plus we gate {#each} on `map` below to
  // avoid mounting layers before maplibre is ready.
  setContext(MAPLIBRE_CONTEXT_KEY, () => map);

  // OpenFreeMap "positron" — same tile source as map-demo. Free, no API key,
  // monochrome (operator-friendly), permitted for production.
  const TILE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

  onMount(() => {
    if (!container) return;
    map = new maplibregl.Map({
      container,
      style: TILE_STYLE,
      center: mapApi.camera.center,
      zoom: mapApi.camera.zoom,
      pitch: mapApi.camera.pitch,
      bearing: mapApi.camera.bearing,
    });

    map.on('move', () => {
      if (!map || isUpdatingFromCamera) return;
      const c = map.getCenter();
      mapApi.camera.center = [c.lng, c.lat];
      mapApi.camera.zoom = map.getZoom();
      mapApi.camera.pitch = map.getPitch();
      mapApi.camera.bearing = map.getBearing();
    });
  });

  onDestroy(() => {
    map?.remove();
    map = null;
  });

  // Camera state → maplibre. Re-runs on any field change. Guarded against the
  // maplibre 'move' callback above.
  $effect(() => {
    if (!map) return;
    const { center, zoom, pitch, bearing } = mapApi.camera;
    isUpdatingFromCamera = true;
    map.jumpTo({ center, zoom, pitch, bearing });
    isUpdatingFromCamera = false;
  });
</script>

<div class="map-view">
  <h2 class="map-view__heading">Map</h2>
  <div class="map-view__canvas" bind:this={container}></div>
</div>

{#if map}
  {#each [...mapApi.layers] as [id, entry] (id)}
    {@const Layer = entry.component}
    <Layer />
  {/each}
{/if}

<style>
  .map-view {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
  }
  .map-view__heading {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  .map-view__canvas {
    width: 100%;
    height: 400px;
    border-radius: 4px;
    overflow: hidden;
  }
</style>
```

The layer `{#each}` block is a sibling of `.map-view`, not a child of the canvas div. Layers are headless (they call maplibre APIs imperatively from their `$effect` blocks; they don't render visible DOM). Putting them outside the canvas avoids visual interference. They're still inside the component's root tree, so `getContext('gcscode.map.maplibre')` resolves correctly.

`{#if map}` gates layer mounting on maplibre availability — layers' `$effect` blocks would otherwise fire with `getMaplibre()` returning null. The Svelte 5 component-render-from-variable pattern (`{@const Layer = entry.component}` + `<Layer />`) replaces the legacy `<svelte:component this={...}>`.

User pan / rotation: **enabled** by default in this iteration. The map-demo disables them because of follow-mode lockstep; the real map has no follow mode, so manual interaction is the natural camera driver. (When a follow-mode iteration lands, that iteration toggles pan accordingly.)

### `packages/extension-map/src/index.ts` (new)

```ts
import type { Extension } from '@gcscode/extension-api';

import { mapApi, type MapApi } from './map-api.svelte';
import MapView from './map-view.svelte';

export type { MapApi, MapCamera } from './map-api.svelte';
export { MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';

export const mapExtension: Extension = {
  manifest: {
    id: 'gcscode.map',
    displayName: 'Map',
    version: '0.0.0',
    description:
      'Geographical view. Exposes a contribution API for other extensions to register map layers.',
  },
  activate(context): MapApi {
    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.map.main',
        component: MapView,
      }),
    );
    return mapApi;
  },
};
```

The extension `activate` returns `mapApi` as its exports — `host.extensions.getExtension<MapApi>('gcscode.map')?.exports` resolves to the singleton.

`MAPLIBRE_CONTEXT_KEY` is exported as a value alongside the `MapApi` type. Both are part of the public contract. Consumers may `import { MAPLIBRE_CONTEXT_KEY } from '@gcscode/extension-map'` as **a type-only import** (per ADR-0005's allowance for type-only sibling imports) — but since `MAPLIBRE_CONTEXT_KEY` is a runtime constant string, importing it would be a runtime sibling import, which ADR-0005 forbids. So consumers either:
- Re-declare the string literal independently (recommended; the string is part of the contract, like an HTTP route).
- Or import the constant via the host (out of scope for this iteration; would require `host.extensions.getExtensionContext(id)?.publicConstants` or similar).

The flight-overlay package re-declares the string literal. The README documents this is the contract.

No `deactivate?()` — see the rationale in `map-api.svelte.ts`.

### `packages/extension-map/src/index.test.ts` (new)

Unit tests cover: manifest, view registration, exports shape, `registerLayer` registry semantics, `Disposable.dispose()` removes the entry, camera state two-way mutability via the proxy, idempotent dispose. No maplibre instantiation.

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost, ViewContribution } from '@gcscode/extension-api';

import { mapApi, mapExtension } from './index';

function makeFakeHost(opts?: {
  registerView?: ExtensionHost['window']['registerView'];
}): ExtensionHost {
  return {
    window: {
      registerView: opts?.registerView ?? vi.fn(() => ({ dispose: () => {} }) as Disposable),
      registerStatusBarItem: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['commands']['executeCommand'],
    },
    keybindings: {
      registerKeybinding: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    },
    extensions: {
      getExtension: vi.fn(() => undefined),
    },
  };
}

describe('mapExtension', () => {
  it('declares stable identity metadata', () => {
    expect(mapExtension.manifest.id).toBe('gcscode.map');
    expect(mapExtension.manifest.displayName).toBe('Map');
    expect(typeof mapExtension.manifest.version).toBe('string');
  });

  it('activate registers exactly one view and returns mapApi as exports', () => {
    const captured: ViewContribution[] = [];
    const host = makeFakeHost({
      registerView: vi.fn((view) => {
        captured.push(view);
        return { dispose: () => {} };
      }),
    });
    const subscriptions: Disposable[] = [];

    const exports = mapExtension.activate({
      host,
      subscriptions,
      extension: {
        id: mapExtension.manifest.id,
        displayName: mapExtension.manifest.displayName,
        version: mapExtension.manifest.version,
      },
    });

    expect(host.window.registerView).toHaveBeenCalledTimes(1);
    expect(captured[0].id).toBe('gcscode.map.main');
    expect(subscriptions).toHaveLength(1);
    expect(exports).toBe(mapApi);
  });
});

describe('mapApi', () => {
  it('registerLayer adds an entry; returned Disposable removes it', () => {
    const FakeComponent = (() => {}) as unknown as Parameters<
      typeof mapApi.registerLayer
    >[0];

    const before = mapApi.layers.size;
    const disposable = mapApi.registerLayer(FakeComponent);
    expect(mapApi.layers.size).toBe(before + 1);

    disposable.dispose();
    expect(mapApi.layers.size).toBe(before);
  });

  it('Disposable.dispose is idempotent', () => {
    const FakeComponent = (() => {}) as unknown as Parameters<
      typeof mapApi.registerLayer
    >[0];
    const before = mapApi.layers.size;
    const disposable = mapApi.registerLayer(FakeComponent);

    disposable.dispose();
    expect(() => disposable.dispose()).not.toThrow();
    expect(mapApi.layers.size).toBe(before);
  });

  it('multiple registrations get unique ids', () => {
    const FakeA = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];
    const FakeB = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];

    const dA = mapApi.registerLayer(FakeA);
    const dB = mapApi.registerLayer(FakeB);
    expect(mapApi.layers.size).toBeGreaterThanOrEqual(2);

    dA.dispose();
    dB.dispose();
  });

  it('camera fields are mutable', () => {
    const original = { ...mapApi.camera };
    mapApi.camera.zoom = 14;
    expect(mapApi.camera.zoom).toBe(14);
    mapApi.camera.zoom = original.zoom;
    expect(mapApi.camera.zoom).toBe(original.zoom);
  });
});
```

The singleton-state tests intentionally mutate shared state but restore it. If test isolation becomes important later, lift the singleton to a per-test factory; not worth doing now.

### `packages/extension-map/README.md` (new)

```md
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
```

## `packages/extension-flight-overlay/` — new package

Mirrors the `extension-vehicle-status` shape (cross-extension consumer, type-only sibling imports). Adds three layer components and a small circle-polygon helper.

### `packages/extension-flight-overlay/package.json` (new)

```json
{
  "name": "@gcscode/extension-flight-overlay",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gcscode/extension-api": "workspace:*",
    "@gcscode/extension-map": "workspace:*",
    "@gcscode/extension-sitl": "workspace:*",
    "maplibre-gl": "^5.24.0"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

`@gcscode/extension-map` and `@gcscode/extension-sitl` are listed as `workspace:*` deps for **type-only** imports (per ADR-0005). The runtime boundary is preserved: no value-level imports from either sibling. ESLint enforces this via `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` (existing config).

`maplibre-gl` is a direct dep because the layer components import maplibre's `Marker` / `Map` types and (for circle layer) call `addSource` / `addLayer` directly.

### `packages/extension-flight-overlay/tsconfig.json` (new)

Verbatim copy of `packages/extension-vehicle-status/tsconfig.json`.

### `packages/extension-flight-overlay/src/flight-overlay-config.ts` (new)

```ts
/**
 * Hardcoded flight-overlay configuration. No settings system yet — when one
 * lands, these become user-tunable. Until then, edit and recompile.
 *
 * Coordinates match the SITL ArduCopter default starting point (Canberra) so
 * the overlay is sensible against the local mavlink2rest bridge out of the
 * box.
 */
export const homeLocation: [number, number] = [149.165_25, -35.363_26];

/** Max-distance circle radius around home, in meters. Round number — tunable. */
export const maxDistanceMeters = 200;
```

### `packages/extension-flight-overlay/src/circle-polygon.ts` (new)

```ts
/**
 * Approximate a geodesic circle as a closed polygon ring. Adequate for visual
 * geofence rendering at typical drone scales (sub-km radius, mid-latitudes).
 * Not intended for precise spatial calculations — turf.js or similar is the
 * right answer if/when that's needed.
 */
const EARTH_RADIUS_M = 6_378_137;
const SEGMENTS = 64;

export function computeCirclePolygon(
  center: readonly [number, number],
  radiusMeters: number,
): [number, number][] {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLatDeg = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLngDeg = dLatDeg / Math.cos(latRad);

  const points: [number, number][] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * 2 * Math.PI;
    points.push([lng + dLngDeg * Math.cos(angle), lat + dLatDeg * Math.sin(angle)]);
  }
  return points;
}
```

Pure function. Unit-testable in isolation.

### `packages/extension-flight-overlay/src/circle-polygon.test.ts` (new)

```ts
import { describe, expect, it } from 'vitest';

import { computeCirclePolygon } from './circle-polygon';

describe('computeCirclePolygon', () => {
  it('returns a closed ring (first and last point match)', () => {
    const ring = computeCirclePolygon([0, 0], 100);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('produces 65 points for 64 segments', () => {
    const ring = computeCirclePolygon([0, 0], 100);
    expect(ring).toHaveLength(65);
  });

  it('scales radius approximately linearly at the equator', () => {
    const small = computeCirclePolygon([0, 0], 100);
    const large = computeCirclePolygon([0, 0], 1000);
    const smallDLng = Math.abs(small[0][0] - 0);
    const largeDLng = Math.abs(large[0][0] - 0);
    expect(largeDLng / smallDLng).toBeCloseTo(10, 1);
  });

  it('contracts longitude offsets at higher latitudes', () => {
    const equator = computeCirclePolygon([0, 0], 100);
    const polar = computeCirclePolygon([0, 60], 100);
    expect(Math.abs(polar[0][0])).toBeGreaterThan(Math.abs(equator[0][0]));
  });
});
```

### `packages/extension-flight-overlay/src/state.ts` (new)

Plain `.ts` (no `$state` here — the reactivity comes from `host.extensions.getExtension`'s underlying SvelteMap, which is read inside layer-component `$effect`s). Class form per memory's C# convention.

```ts
import type { ExtensionHost } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';
import type { SitlExports } from '@gcscode/extension-sitl';

class FlightOverlayState {
  private _host: ExtensionHost | null = null;

  public setHost(host: ExtensionHost): void {
    this._host = host;
  }

  public clearHost(): void {
    this._host = null;
  }

  /** Reactive when read inside `$derived` / `$effect` / template (the underlying
   * registry is a `SvelteMap`). Returns undefined if `gcscode.map` is not
   * currently active. */
  public get mapExports(): MapApi | undefined {
    return this._host?.extensions.getExtension<MapApi>('gcscode.map')?.exports;
  }

  /** Same reactivity as `mapExports`. Returns undefined if `gcscode.sitl` is
   * not currently active. */
  public get sitlExports(): SitlExports | undefined {
    return this._host?.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports;
  }
}

export const flightOverlayState = new FlightOverlayState();
```

### `packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte` (new)

```svelte
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { flightOverlayState } from '../state';

  // Re-declared string literal — public contract per @gcscode/extension-map
  // README. Do not runtime-import from sibling extensions (ADR-0005).
  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';

  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
  let marker: maplibregl.Marker | null = null;

  $effect(() => {
    const map = getMaplibre();
    if (!map) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    const sitl = flightOverlayState.sitlExports;
    if (!sitl) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    const { lat, lng } = sitl.telemetry;
    if (lat === null || lng === null) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    if (!marker) {
      marker = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }
  });

  onDestroy(() => {
    if (marker) {
      marker.remove();
      marker = null;
    }
  });
</script>
```

No template — the component renders no visible DOM. Its job is the imperative `$effect`.

### `packages/extension-flight-overlay/src/layers/home-location-layer.svelte` (new)

```svelte
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { homeLocation } from '../flight-overlay-config';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
  let marker: maplibregl.Marker | null = null;

  $effect(() => {
    const map = getMaplibre();
    if (!map) return;

    if (!marker) {
      // Distinct color so home is visually different from the drone marker.
      marker = new maplibregl.Marker({ color: '#3b82f6' }).setLngLat(homeLocation).addTo(map);
    }
  });

  onDestroy(() => {
    if (marker) {
      marker.remove();
      marker = null;
    }
  });
</script>
```

### `packages/extension-flight-overlay/src/layers/max-distance-circle-layer.svelte` (new)

```svelte
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { computeCirclePolygon } from '../circle-polygon';
  import { homeLocation, maxDistanceMeters } from '../flight-overlay-config';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);

  const SOURCE_ID = 'gcscode.flight-overlay.max-distance.source';
  const LAYER_ID = 'gcscode.flight-overlay.max-distance.layer';

  let installed = false;

  function install(map: maplibregl.Map) {
    if (installed) return;
    if (map.getSource(SOURCE_ID)) return;

    const ring = computeCirclePolygon(homeLocation, maxDistanceMeters);
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {},
      },
    });
    map.addLayer({
      id: LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': '#ef4444', 'line-width': 2 },
    });
    installed = true;
  }

  function uninstall(map: maplibregl.Map) {
    if (!installed) return;
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    installed = false;
  }

  $effect(() => {
    const map = getMaplibre();
    if (!map) return;

    // addSource / addLayer require the style to be loaded. If it's already
    // loaded, install immediately. Otherwise wait for the 'load' event once.
    if (map.isStyleLoaded()) {
      install(map);
    } else {
      const onLoad = () => install(map);
      map.once('load', onLoad);
      return () => {
        map.off('load', onLoad);
      };
    }
  });

  onDestroy(() => {
    const map = getMaplibre();
    if (map) uninstall(map);
  });
</script>
```

### `packages/extension-flight-overlay/src/index.ts` (new)

```ts
import type { Extension } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';

import DroneMarkerLayer from './layers/drone-marker-layer.svelte';
import HomeLocationLayer from './layers/home-location-layer.svelte';
import MaxDistanceCircleLayer from './layers/max-distance-circle-layer.svelte';
import { flightOverlayState } from './state';

export const flightOverlayExtension: Extension = {
  manifest: {
    id: 'gcscode.flight-overlay',
    displayName: 'Flight Overlay',
    version: '0.0.0',
    description:
      'Drone marker, home location, and max-distance circle rendered on the map. First consumer of the map contribution API.',
  },
  activate(context) {
    // Validate before capturing host — if activate throws, we want no leftover
    // state in the singleton. Layers' `$effect` reads route through state, so
    // host capture must happen before any layer mounts (which can't happen
    // before registerLayer is called below).
    const map = context.host.extensions.getExtension<MapApi>('gcscode.map')?.exports;
    if (!map) {
      throw new Error(
        'gcscode.flight-overlay requires gcscode.map to be active before it activates',
      );
    }

    flightOverlayState.setHost(context.host);

    context.subscriptions.push(
      map.registerLayer(DroneMarkerLayer),
      map.registerLayer(HomeLocationLayer),
      map.registerLayer(MaxDistanceCircleLayer),
    );
  },
  deactivate() {
    flightOverlayState.clearHost();
  },
};
```

The `throw` on missing map is intentional — flight-overlay's contract is that it activates when the map is active. The bundled-extensions order guarantees this; if a future test or runtime path violates the order, the throw surfaces it loudly. SITL availability is **not** required at activate time (the drone-marker layer handles SITL-absent gracefully by removing the marker).

### `packages/extension-flight-overlay/src/index.test.ts` (new)

Tests cover: manifest, activation against a fake host with map present (registers 3 layers), activation throwing when map missing, deactivate clears host, sitl-exports getter routes through host correctly.

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';
import type { SitlExports } from '@gcscode/extension-sitl';

import { flightOverlayExtension } from './index';
import { flightOverlayState } from './state';

function makeFakeHost(opts: {
  getExtension?: ExtensionHost['extensions']['getExtension'];
}): ExtensionHost {
  return {
    window: {
      registerView: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      registerStatusBarItem: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['commands']['executeCommand'],
    },
    keybindings: {
      registerKeybinding: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    },
    extensions: {
      getExtension: opts.getExtension ?? vi.fn(() => undefined),
    },
  };
}

function makeFakeMapExports(): MapApi {
  return {
    registerLayer: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    camera: { center: [0, 0], zoom: 1, pitch: 0, bearing: 0 },
  };
}

describe('flightOverlayExtension', () => {
  it('declares stable identity metadata', () => {
    expect(flightOverlayExtension.manifest.id).toBe('gcscode.flight-overlay');
    expect(flightOverlayExtension.manifest.displayName).toBe('Flight Overlay');
    expect(typeof flightOverlayExtension.manifest.version).toBe('string');
  });

  it('activate registers three layers when map is active', () => {
    const fakeMap = makeFakeMapExports();
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) =>
        id === 'gcscode.map' ? { id, exports: fakeMap as unknown } : undefined,
      ) as ExtensionHost['extensions']['getExtension'],
    });
    const subscriptions: Disposable[] = [];

    flightOverlayExtension.activate({
      host,
      subscriptions,
      extension: {
        id: flightOverlayExtension.manifest.id,
        displayName: flightOverlayExtension.manifest.displayName,
        version: flightOverlayExtension.manifest.version,
      },
    });

    expect(fakeMap.registerLayer).toHaveBeenCalledTimes(3);
    expect(subscriptions).toHaveLength(3);

    flightOverlayExtension.deactivate?.();
  });

  it('activate throws when gcscode.map is not active', () => {
    const host = makeFakeHost({
      getExtension: vi.fn(() => undefined),
    });

    expect(() =>
      flightOverlayExtension.activate({
        host,
        subscriptions: [],
        extension: {
          id: flightOverlayExtension.manifest.id,
          displayName: flightOverlayExtension.manifest.displayName,
          version: flightOverlayExtension.manifest.version,
        },
      }),
    ).toThrow(/gcscode\.map/);
  });

  it('flightOverlayState exposes mapExports and sitlExports through the captured host', () => {
    const fakeMap = makeFakeMapExports();
    const fakeSitl: SitlExports = {
      telemetry: {
        mode: 'GUIDED',
        armed: true,
        lat: -35.36,
        lng: 149.16,
        alt: 5,
        heading: 0,
        roll: 0,
        pitch: 0,
        yaw: 0,
        groundspeed: 0,
        voltageBattery: 12.5,
        batteryRemaining: 50,
        connection: 'connected',
      },
    };
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) => {
        if (id === 'gcscode.map') return { id, exports: fakeMap as unknown };
        if (id === 'gcscode.sitl') return { id, exports: fakeSitl as unknown };
        return undefined;
      }) as ExtensionHost['extensions']['getExtension'],
    });

    flightOverlayExtension.activate({
      host,
      subscriptions: [],
      extension: {
        id: flightOverlayExtension.manifest.id,
        displayName: flightOverlayExtension.manifest.displayName,
        version: flightOverlayExtension.manifest.version,
      },
    });

    expect(flightOverlayState.mapExports).toBe(fakeMap);
    expect(flightOverlayState.sitlExports).toBe(fakeSitl);

    flightOverlayExtension.deactivate?.();
    expect(flightOverlayState.mapExports).toBeUndefined();
    expect(flightOverlayState.sitlExports).toBeUndefined();
  });
});
```

The `SitlExports` shape used in the test mirrors the live `TelemetryState` (referenced by the real type). If the SITL telemetry state's fields shift later, this test gets a TS error and is updated in lockstep — type-only sibling import keeps producer/consumer in sync.

### `packages/extension-flight-overlay/README.md` (new)

```md
# @gcscode/extension-flight-overlay

First consumer of the `@gcscode/extension-map` contribution API. Registers three layers on the map:

- **Drone marker** — point geometry, position from live SITL telemetry (`gcscode.sitl` exports).
- **Home location** — point geometry, hardcoded coordinates in `flight-overlay-config.ts`.
- **Max-distance circle** — polygon approximation of a geodesic circle around the home location, hardcoded radius.

Layers render no visible DOM themselves; each is a Svelte component that calls maplibre APIs imperatively from `$effect` and cleans up on `onDestroy`.

## Cross-extension dependencies

- **`@gcscode/extension-map`** — type-only. Imports `MapApi` via `import type`. Runtime lookup is via `host.extensions.getExtension<MapApi>('gcscode.map')`. Activation throws if map is not active.
- **`@gcscode/extension-sitl`** — type-only. Imports `SitlExports` via `import type`. Runtime lookup is via `host.extensions.getExtension<SitlExports>('gcscode.sitl')`. SITL absence is handled gracefully (drone marker not rendered).

## Configuration

Hardcoded module-level constants in `flight-overlay-config.ts`:

- `homeLocation: [number, number]` — `[lng, lat]` of the SITL ArduCopter default starting point (Canberra).
- `maxDistanceMeters: number` — geofence circle radius around home (default 200m).

When a settings system lands, these become user-tunable. Until then, edit and recompile.

## Architecture notes

The maplibre `Map` instance is consumed via Svelte context (key `'gcscode.map.maplibre'`). The string is the public contract of `@gcscode/extension-map`; we re-declare it independently rather than runtime-importing from the sibling package (ADR-0005).

Layer components are mounted as children of the map view — when the map extension disables, layer components unmount and their `onDestroy` cleans up maplibre artifacts. When the map re-enables, the registered layers (still in the registry via subscriptions held in flight-overlay's context) re-mount fresh against the new maplibre instance.

## See also

- [Spec 2026-05-03-map-and-flight-overlay](../../docs/specs/2026-05-03-map-and-flight-overlay.md) — this iteration
- [`@gcscode/extension-map`](../extension-map/README.md) — the contribution API this consumes
- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries
```

## `packages/shell/src/extension-host/bundled-extensions.ts` — register the new extensions

Add imports:

```diff
 import { exampleExtension } from '@gcscode/extension-example';
+import { flightOverlayExtension } from '@gcscode/extension-flight-overlay';
+import { mapExtension } from '@gcscode/extension-map';
 import { mapDemoExtension } from '@gcscode/extension-map-demo';
 import { sitlExtension } from '@gcscode/extension-sitl';
 import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status';
```

Add to the `bundledExtensions` array. Map activates after sitl (no required order — map doesn't read sitl — but consistent with the pattern). Flight-overlay must come AFTER map (it reads map exports during `activate`):

```diff
 export const bundledExtensions: readonly BundledExtensionEntry[] = [
   { id: exampleExtension.manifest.id, extension: exampleExtension },
   { id: sitlExtension.manifest.id, extension: sitlExtension },
   // Must come after sitlExtension — vehicle-status reads SITL exports during
   // first render and relies on insertion-order activation. See ADR-0005's
   // "Cross-extension activation order is not guaranteed" consequence.
   { id: vehicleStatusExtension.manifest.id, extension: vehicleStatusExtension },
   // Same SITL-after constraint as vehicle-status — map-demo reads SITL exports.
   { id: mapDemoExtension.manifest.id, extension: mapDemoExtension },
+  // Map exposes a contribution API consumed by flight-overlay; it must
+  // activate before flight-overlay. No ordering requirement vs. sitl.
+  { id: mapExtension.manifest.id, extension: mapExtension },
+  // Must come after mapExtension — flight-overlay reads map exports during
+  // its activate(). Throws if map is not active. Same insertion-order
+  // pattern as vehicle-status and map-demo.
+  { id: flightOverlayExtension.manifest.id, extension: flightOverlayExtension },
 ];
```

## `packages/shell/package.json` — add workspace deps

```diff
   "dependencies": {
     "@gcscode/extension-api": "workspace:*",
     "@gcscode/extension-example": "workspace:*",
+    "@gcscode/extension-flight-overlay": "workspace:*",
+    "@gcscode/extension-map": "workspace:*",
     "@gcscode/extension-map-demo": "workspace:*",
     "@gcscode/extension-sitl": "workspace:*",
     "@gcscode/extension-vehicle-status": "workspace:*",
     "fuse.js": "^7.3.0"
   }
```

## `pnpm-workspace.yaml` — no change

The workspace globs already include `packages/*`. Both new packages are auto-discovered.

## Test count expectations

| Package | Existing | New | Total |
|---|---|---|---|
| `@gcscode/extension-map` | 0 | 6 (manifest 1 + activate 1 + registry 3 + camera 1) | 6 |
| `@gcscode/extension-flight-overlay` | 0 | 8 (manifest 1 + activate 1 + activate-throw 1 + state 1 + circle-polygon 4) | 8 |
| All other packages | 214 | 0 | 214 |
| **Workspace total** | **214** | **+14** | **228** |

(Numbers are estimates from the test bodies above; final counts may differ by ±1 if a `describe` is split. Verification step counts the actual delta.)

## Files modified / added

| Path | Change |
|---|---|
| `packages/extension-map/package.json` | NEW. Workspace package; deps on `@gcscode/extension-api` (`workspace:*`) and `maplibre-gl ^5.24.0`. |
| `packages/extension-map/tsconfig.json` | NEW. Verbatim copy of `extension-map-demo/tsconfig.json`. |
| `packages/extension-map/src/css.d.ts` | NEW. Verbatim copy of `extension-map-demo/src/css.d.ts`. |
| `packages/extension-map/src/map-api.svelte.ts` | NEW. ~70 lines. `MapCamera` + `MapApi` types, `MapApiImpl` class, `mapApi` singleton, `MAPLIBRE_CONTEXT_KEY` constant. |
| `packages/extension-map/src/map-view.svelte` | NEW. ~80 lines. Maplibre canvas + camera two-way binding + layer mount via context. |
| `packages/extension-map/src/index.ts` | NEW. ~25 lines. `mapExtension` const + re-exports. |
| `packages/extension-map/src/index.test.ts` | NEW. ~120 lines. 6 tests across `mapExtension` and `mapApi`. |
| `packages/extension-map/README.md` | NEW. ~80 lines. API docs + context-key contract. |
| `packages/extension-flight-overlay/package.json` | NEW. Workspace package; deps on `@gcscode/extension-api`, `@gcscode/extension-map` (`workspace:*` type-only), `@gcscode/extension-sitl` (`workspace:*` type-only), `maplibre-gl ^5.24.0`. |
| `packages/extension-flight-overlay/tsconfig.json` | NEW. Verbatim copy of `extension-vehicle-status/tsconfig.json`. |
| `packages/extension-flight-overlay/src/flight-overlay-config.ts` | NEW. ~12 lines. Hardcoded `homeLocation` + `maxDistanceMeters`. |
| `packages/extension-flight-overlay/src/circle-polygon.ts` | NEW. ~20 lines. Pure circle-as-polygon helper. |
| `packages/extension-flight-overlay/src/circle-polygon.test.ts` | NEW. ~30 lines. 4 unit tests. |
| `packages/extension-flight-overlay/src/state.ts` | NEW. ~30 lines. `FlightOverlayState` class + singleton. |
| `packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte` | NEW. ~50 lines. SITL-driven marker layer. |
| `packages/extension-flight-overlay/src/layers/home-location-layer.svelte` | NEW. ~30 lines. Hardcoded marker layer. |
| `packages/extension-flight-overlay/src/layers/max-distance-circle-layer.svelte` | NEW. ~60 lines. Hardcoded geofence circle layer. |
| `packages/extension-flight-overlay/src/index.ts` | NEW. ~35 lines. `flightOverlayExtension` const. |
| `packages/extension-flight-overlay/src/index.test.ts` | NEW. ~120 lines. 4 tests. |
| `packages/extension-flight-overlay/README.md` | NEW. ~50 lines. |
| `packages/shell/src/extension-host/bundled-extensions.ts` | MODIFY. Two new imports + two new array entries (map, then flight-overlay) after map-demo. |
| `packages/shell/package.json` | MODIFY. Add `@gcscode/extension-flight-overlay` and `@gcscode/extension-map` to `dependencies`. |
| `pnpm-lock.yaml` | MODIFY (auto). Updated by `pnpm install`. |
| `docs/specs/2026-05-03-map-and-flight-overlay.md` | NEW. This file. |
| `docs/plans/2026-05-03-map-and-flight-overlay.md` | NEW. Per writing-plans skill. |
| `docs/roadmap.md` | MODIFY. Tick `Map`; add new `flight-overlay` entry under Coming. |
| `docs/vs-code-alignment.md` | MODIFY. New rows per the alignment section below. |
| `docs/out-of-scope.md` | MODIFY. New entries per the propagation section below. |

No changes to `@gcscode/extension-api` (no new public surface — the cross-extension exports pattern is already in place). No changes to existing extensions. No ADR.

## VS Code alignment

| Concern | VS Code | gcscode | Status | Trigger to revisit |
|---|---|---|---|---|
| Service-style extension exposing a contribution surface for other extensions | ✓ (editor + decorations / hover providers / language services) | ✓ (`gcscode.map` + `registerLayer` for `flight-overlay` and future consumers) | **Alignment** | — |
| Cross-extension contribution accepts Svelte components, not data property bags | ✗ (data) | ✓ (Svelte `Component`) | **Divergence** | Same as the existing "View / status-bar contributions" Divergences row — chrome ownership stays with the extension. Trigger covered by ADR-0005's webview-wing follow-up. |
| Cross-extension Svelte context as part of public API | N/A (VS Code has no Svelte) | string-keyed via `'gcscode.map.maplibre'`, re-declared by consumers | **Divergence** | First instance. The string is the contract; ADR-0005 forbids runtime sibling imports of the constant. Trigger to revisit: a third consumer surface where re-declaration is brittle, or a capability-declaration system that publishes constants. |
| Camera state (or equivalent reactive surface) on cross-extension exports | N/A | `readonly camera: MapCamera` ($state) | **Alignment with our own pattern** (mirrors `SitlExports.telemetry: TelemetryState`) — same "consumer-mutable reactive proxy" shape | — |
| Layer ordering / z-index API | `priority` on decorations / `editor.contributes` declarative ordering | registration order only | **Deferral** | Mirrors existing status-bar `priority` deferral. Trigger: third-party wants to insert between two first-party layers. |
| Animated camera transitions | ✓ (editor reveal animations, smooth scroll) | ✗ (instant `jumpTo` only) | **Deferral** | First consumer needing animation — likely a "pan to selection" UX or the follow-mode iteration. |

The "service-style extension" framing is itself a new alignment row in the cumulative ledger (`docs/vs-code-alignment.md`). The propagation section below covers the exact ledger edits.

## `docs/vs-code-alignment.md` — propagation

Add to **Alignments**:

```md
| Service-style extension exposing contribution surface for other extensions | ✓ (editor + decorations / hover providers / language services) | ✓ (`gcscode.map` + `registerLayer`) | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md) |
```

Add to **Divergences**:

```md
| Cross-extension Svelte context for shared runtime instances | N/A — VS Code has no Svelte | string-keyed context (`'gcscode.map.maplibre'`); consumers re-declare the key independently rather than runtime-importing it | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [ADR-0005](decisions/ADR-0005-extension-boundaries.md) | Third consumer surface where re-declaration becomes brittle, OR capability-declaration system that publishes named constants |
```

Add to **Deferrals**:

```md
| Layer ordering / z-index API on contribution surface | ✓ (decorations have explicit ordering) | ✗ — registration order only | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | Third-party wants to insert between two first-party layers (mirrors status-bar `priority` row) |
| Animated camera transitions (`flyTo` / `easeTo`) | ✓ (smooth editor reveal) | ✗ — `jumpTo` only | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | First consumer needing pan-to-selection animation, or follow-mode iteration |
| Camera coordination between multiple consumers | N/A (single-editor) | last-write-wins; no locks or priorities | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | First real conflict — two extensions writing camera in the same tick clobbering each other |
| Map UI controls rendered into a contribution surface | (N/A) | ✗ — map is canvas-only; no overlay slots for extension-rendered controls | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | First consumer needing a map control (zoom button, recenter button, layer panel) — likely operator UX iteration |
```

## `docs/out-of-scope.md` — propagation

Add to the **Extension machinery** section (or a new **Map / contribution surfaces** section if cleaner — judgment call during implementation):

```md
- **Animated camera transitions on the map.** No `flyTo` / `easeTo` exposed on `MapApi`; camera writes are instant via `jumpTo`. _Trigger to revisit:_ first consumer needing a pan-to-selection animation, or the follow-mode iteration. See `docs/specs/2026-05-03-map-and-flight-overlay.md`.
- **Camera coordination between map consumers.** No locks, priorities, or contention API. Multiple consumers writing the camera in the same tick: last-write-wins. _Trigger to revisit:_ first real conflict between two extensions trying to control the camera.
- **Layer ordering / z-index API on the map.** `MapApi.registerLayer` does not accept an order/priority field; layers paint in registration order. Mirrors the status-bar `priority` deferral. _Trigger to revisit:_ third-party wants to insert between two first-party layers.
- **Map UI controls / overlay slots.** No surface for extensions to render controls (zoom buttons, recenter button, layer panel) on top of the map. The map is canvas-only. _Trigger to revisit:_ first consumer needing a map control, or operator UX iteration on map chrome.
- **Cross-extension Svelte context constants published by the host.** Today consumers re-declare context keys (e.g. `'gcscode.map.maplibre'`) as string literals matching the producer's contract — runtime sibling imports are forbidden by ADR-0005. _Trigger to revisit:_ a third consumer surface where re-declaration becomes brittle, OR a capability-declaration system that publishes named constants centrally.
```

These are cross-cutting deferrals (architectural concepts the iteration is deliberately not building), per CLAUDE.md's propagation rule. The flight-overlay-specific deferrals (geofence, no-fly zones, multi-drone, etc.) are NOT propagated — those are per-iteration scope cuts named in this spec only.

## `docs/roadmap.md` — propagation

Tick the **Map** checkbox under Feature extensions → Coming and link the spec:

```diff
-- [ ] **Map** — geographical view + selection state. Likely fits the existing view contribution kind; may surface a need for shared map state.
+- [x] **Map** — geographical view + map contribution API for layer registration. First service-style extension. Selection state deferred to a later iteration. Spec: [`specs/2026-05-03-map-and-flight-overlay.md`](specs/2026-05-03-map-and-flight-overlay.md).
```

Add a new line under Feature extensions → Coming for `flight-overlay` (positioned after the `Map` line, before `Video feed`):

```md
- [x] **Flight overlay** — first consumer of the `gcscode.map` contribution API. `@gcscode/extension-flight-overlay` registers drone-marker (live SITL), home-location (hardcoded), and max-distance-circle (hardcoded) layers. Validates the service-style extension pattern. Spec: [`specs/2026-05-03-map-and-flight-overlay.md`](specs/2026-05-03-map-and-flight-overlay.md).
```

The `Map (demo)` line stays as-is — the demo is not removed in this iteration.

## Branching and commit

Implementation runs on `feat/map-and-flight-overlay` off master, merged with `git merge --no-ff feat/map-and-flight-overlay`. Spec + plan land on master directly in one `docs:` commit before the feature branch starts, mirroring prior iterations.

Commits on the feature branch (proposed split — sized for subagent-driven execution per CLAUDE.md):

1. **`feat(map): scaffold @gcscode/extension-map package with MapApi and tests`** — `package.json`, `tsconfig.json`, `css.d.ts`, `map-api.svelte.ts`, `index.ts` (with placeholder `MapView`), `index.test.ts` (6 tests), `README.md`. Maplibre dependency added. Tests pass at this commit. View component is a minimal placeholder (`<div>Map (real)</div>`) so the package compiles without maplibre integration yet. Each subsequent commit adds one cohesive piece.
2. **`feat(map): maplibre canvas + camera two-way binding + layer mount`** — replaces the placeholder `map-view.svelte` with the full implementation. Tests still pass at this commit (the existing 6 cover registry/exports/camera).
3. **`feat(flight-overlay): scaffold package with config, state, circle-polygon helper`** — `package.json`, `tsconfig.json`, `flight-overlay-config.ts`, `circle-polygon.ts`, `circle-polygon.test.ts` (4 tests), `state.ts`, `index.ts` placeholder, `README.md`. Tests pass.
4. **`feat(flight-overlay): three layer components + activate registers them`** — `layers/drone-marker-layer.svelte`, `layers/home-location-layer.svelte`, `layers/max-distance-circle-layer.svelte`, full `index.ts`, `index.test.ts` (4 tests). Tests pass.
5. **`feat(shell): bundle map + flight-overlay into shell`** — adds both new entries to `bundledExtensions.ts`; adds workspace deps to `packages/shell/package.json`. After this commit `pnpm dev` shows the real Map view alongside the existing Map (demo) view. **Browser smoke runs at this commit.**
6. **`docs: roadmap + alignment ledger + out-of-scope propagation`** — flips the Map checkbox, adds the flight-overlay roadmap line, adds the ledger rows (1 alignment + 1 divergence + 4 deferrals), adds the out-of-scope entries.

Per CLAUDE.md, plan execution uses `superpowers:subagent-driven-development`. Each implementer subagent produces one commit; per-task spec compliance + code quality reviews follow each commit (with any review feedback landing as `Code-review-followup:` commits per CLAUDE.md). After all six land, dispatch a final cross-cutting code review over the full branch, then merge via `superpowers:finishing-a-development-branch`.

The plan file (`docs/plans/2026-05-03-map-and-flight-overlay.md`) decomposes each commit into the precise edit list and review checkpoints.

## Verification

- `pnpm format && pnpm lint && pnpm check && pnpm test` clean across the workspace at every commit.
- `pnpm test`: workspace total grows from 214 to ~228 (+14: 6 in extension-map, 8 in extension-flight-overlay).
- `pnpm dev` smoke (after commit 5, before commit 6):
  - App boots; no console errors (other than expected mavlink2rest WebSocket-failed messages if SITL backend isn't running locally).
  - Four views render in the content stack: Example, SITL Telemetry, **Map (demo)** (existing), **Map** (new). Vehicle Status status item still in the footer.
  - The new Map view shows OpenFreeMap positron tiles centered at Canberra (zoom 13, default camera).
  - Without SITL backend running: drone marker not visible (telemetry has null lat/lng); home-location marker visible at hardcoded Canberra coordinates; max-distance circle (red ring) visible around the home marker.
  - With mavlink2rest + ArduPilot SITL running: drone marker (default teardrop pin) appears at the live position; home + circle still visible. Manual mouse pan / zoom works on the new map (unlike map-demo, which disables pan).
  - Disable `gcscode.flight-overlay` via `Ctrl+Shift+X`: home + drone + circle disappear from the new Map view; map canvas remains, basemap still rendered. Re-enable: layers reappear (re-mounted against the same maplibre instance).
  - Disable `gcscode.map`: the new Map view disappears entirely from the content stack. flight-overlay's layers' `onDestroy` ran (their effects no longer have a maplibre to mutate). Re-enable map: the view re-mounts; flight-overlay's `Disposable`s in its subscriptions still hold references in the singleton registry, so the same three layers re-render against the new maplibre instance.
  - Disable both `gcscode.map` and `gcscode.map-demo`: only Example + SITL views remain.

## Follow-ups (out of scope for this iteration)

- **Selection state.** `MapApi.selectedDrone` (or similar) + click handlers on layers. Likely the next map iteration after this one.
- **Animated camera (`flyTo` / `easeTo`).** First consumer is probably the selection iteration ("pan to selected drone").
- **Camera coordination.** Locking / priority API for multiple writers.
- **Operator UX layer.** Follow-mode toggle, recenter button, zoom controls, layer panel — own iteration when the operator-UX feedback or feature need surfaces.
- **Layer ordering / z-index API.** Mirrors status-bar `priority` deferral.
- **Real geofence + no-fly zones + multi-drone + route history.** Each is a future flight-overlay (or sibling-extension) iteration when the data source materializes.
- **Settings system for `homeLocation` / `maxDistanceMeters`.** Triggers a Phase C settings iteration.
- **Removal of `extension-map-demo`.** Not in this iteration; happens when the user decides the demo no longer earns its slot in the bundle (or when an operator-UX iteration consolidates map presentation).
- **Webview wing for non-Svelte map layers.** ADR-0005's escape-hatch follow-up — a separate roadmap item.
- **SITL → vehicle rename.** Same noted observation as in the map-demo spec; not addressed here.
