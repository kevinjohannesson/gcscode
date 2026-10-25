import { getContext } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import type { MapRef } from '../maplibre/create-ref';
import { MAP_CONTEXT_KEY, type MapContextValue } from './map-context';

export const MOUNTED_MAPS_CONTEXT_KEY = Symbol('map-gl-svelte:mounted-maps-context');

/** What `<MapProvider>` gives the maps inside it: the registered maps and how to (un)register. */
export type MountedMapsContextValue = {
  /** Reading it in a template or an effect tracks the maps that come and go. */
  maps: ReadonlyMap<string, MapRef>;
  /** `id` defaults to `"default"`. Throws if the id is taken, or is `"current"`. */
  onMapMount: (map: MapRef, id?: string) => void;
  /** `id` defaults to `"default"`. */
  onMapUnmount: (id?: string) => void;
};

/** The maps registered with a `<MapProvider>`, by id. */
export class MountedMaps implements MountedMapsContextValue {
  // A reactive map: each id is read on its own, so a reader sees the maps that come and go.
  private readonly _maps = new SvelteMap<string, MapRef>();

  public get maps(): ReadonlyMap<string, MapRef> {
    return this._maps;
  }

  public onMapMount(map: MapRef, id: string = 'default'): void {
    if (id === 'current') {
      throw new Error("'current' cannot be used as map id");
    }
    if (this._maps.has(id)) {
      throw new Error(`Multiple maps with the same id: ${id}`);
    }
    this._maps.set(id, map);
  }

  public onMapUnmount(id: string = 'default'): void {
    this._maps.delete(id);
  }
}

export type MapCollection = {
  [id: string]: MapRef | undefined;
  current?: MapRef;
};

/**
 * The maps registered with the enclosing `<MapProvider>`, by id, and `current`: the nearest
 * enclosing `<Map>`'s. Call it during a component's initialisation.
 *
 * Use the result as it is. Reading `maps.current` or `maps[id]` in a template or an effect
 * follows the maps as they mount and unmount; copying them out (destructuring, spreading) takes
 * a snapshot.
 */
export function useMap(): MapCollection {
  const mounted = getContext<MountedMapsContextValue | undefined>(MOUNTED_MAPS_CONTEXT_KEY);
  // Not `getMapContext()`, which throws outside a `<Map>`: upstream's `current` is just empty.
  const mapContext = getContext<MapContextValue | undefined>(MAP_CONTEXT_KEY);

  const registered = (): ReadonlyMap<string, MapRef> | undefined => mounted?.maps;

  // A proxy rather than an object, because the ids are not known in advance. Read-only. Anything
  // but `current` and a registered id reads from the empty target, so Object.prototype's members
  // (`toString`, `hasOwnProperty`, …) work, as on the plain object upstream returns.
  return new Proxy({} as MapCollection, {
    get(target, key) {
      if (key === 'current') {
        return mapContext?.map;
      }
      // `has` first: it tracks the id even while it isn't registered.
      const maps = registered();
      if (typeof key === 'string' && maps?.has(key)) {
        return maps.get(key);
      }
      return Reflect.get(target, key);
    },
    has(target, key) {
      return (
        key === 'current' ||
        (typeof key === 'string' && Boolean(registered()?.has(key))) ||
        Reflect.has(target, key)
      );
    },
    // Registered ids, then `current`, as in the object upstream builds: `{...maps, current}`.
    ownKeys() {
      return [...(registered()?.keys() ?? []), 'current'];
    },
    getOwnPropertyDescriptor(_target, key) {
      if (typeof key !== 'string') {
        return undefined;
      }
      const value = key === 'current' ? mapContext?.map : registered()?.get(key);
      if (value === undefined && key !== 'current') {
        return undefined;
      }
      return { value, enumerable: true, configurable: true, writable: false };
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}
