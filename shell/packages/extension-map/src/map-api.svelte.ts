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

/**
 * Stable Svelte context key. Part of the public API contract — consumer
 * extensions (flight-overlay and any future consumer) declare this same string
 * independently rather than runtime-importing the constant (forbidden by
 * ADR-0005). Documented in this package's README.
 */
export const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
