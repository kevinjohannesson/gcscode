import { getContext, setContext } from 'svelte';
import type { MapRef } from '../maplibre/create-ref';
import type { MapLib } from '../types/lib';

export const MAP_CONTEXT_KEY = Symbol('map-gl-svelte:map-context');

/** What `<Map>` gives its descendants. Filled in before they first render. */
export type MapContextValue = {
  mapLib: MapLib;
  map: MapRef;
};

export function setMapContext(value: MapContextValue): void {
  setContext(MAP_CONTEXT_KEY, value);
}

export function getMapContext(): MapContextValue {
  const ctx = getContext<MapContextValue | undefined>(MAP_CONTEXT_KEY);
  if (!ctx) {
    throw new Error('getMapContext() called outside a <Map>');
  }
  return ctx;
}
