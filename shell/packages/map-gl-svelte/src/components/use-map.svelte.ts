import type { MapRef } from '../maplibre/create-ref';

// Stub: the key and the type `<Map>` registers through. `<MapProvider>` and `useMap()` come later.

export const MOUNTED_MAPS_CONTEXT_KEY = Symbol('map-gl-svelte:mounted-maps-context');

/** What `<MapProvider>` gives the maps inside it: the registered maps and how to (un)register. */
export type MountedMapsContextValue = {
  maps: { [id: string]: MapRef };
  /** `id` defaults to `"default"`. */
  onMapMount: (map: MapRef, id?: string) => void;
  /** `id` defaults to `"default"`. */
  onMapUnmount: (id?: string) => void;
};
