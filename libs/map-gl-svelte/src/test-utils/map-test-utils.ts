// Helpers for tests that run real MapLibre in a real browser (Vitest browser mode).
// Tests never touch the network: use `EMPTY_STYLE` / `backgroundStyle()`, never a style URL.
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

/** A style with no sources and no layers. Loads without any network access. */
export const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

/** A style with a single `background` layer (id `bg`) filled with `color`. */
export function backgroundStyle(color: string): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': color } }],
  };
}

/** Creates a sized `div` for a map and appends it to `document.body`. */
export function createContainer(width = 400, height = 300): HTMLDivElement {
  const container = document.createElement('div');
  container.style.width = `${width}px`;
  container.style.height = `${height}px`;
  document.body.appendChild(container);
  return container;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves with the payload of the next `type` event on `map`. */
export function waitForEvent(map: MapLibreMap, type: string): Promise<unknown> {
  return new Promise((resolve) => {
    map.once(type, resolve);
  });
}

/**
 * Resolves once the map has loaded: at once if it already has, otherwise on its `load` event.
 * Meant for a freshly created map. A map that has loaded and then gone dirty (a new source
 * still fetching) reports not-loaded but will never fire `load` again, so don't wait on it here.
 */
export async function waitForLoad(map: MapLibreMap): Promise<void> {
  if (map.loaded()) {
    return;
  }
  await waitForEvent(map, 'load');
}

/**
 * Resolves once the map's style (and its sources) are loaded: at once if they already are,
 * otherwise on the first `styledata` event after which `isStyleLoaded()` is true. Resolution is
 * deferred by one task so listeners that react to that same event have run.
 */
export function waitForStyleLoad(map: MapLibreMap): Promise<void> {
  return new Promise((resolve) => {
    const settle = (): boolean => {
      if (!map.isStyleLoaded()) {
        return false;
      }
      map.off('styledata', settle);
      setTimeout(resolve, 0);
      return true;
    };
    if (!settle()) {
      map.on('styledata', settle);
    }
  });
}
