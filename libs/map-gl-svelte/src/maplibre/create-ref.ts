import type { MapInstance } from '../types/lib';
import type Maplibre from './maplibre';

/** These methods may break the Svelte binding if called directly */
const skipMethods = [
  'setMaxBounds',
  'setMinZoom',
  'setMaxZoom',
  'setMinPitch',
  'setMaxPitch',
  'setRenderWorldCopies',
  'setProjection',
  'setStyle',
  'addSource',
  'removeSource',
  'addLayer',
  'removeLayer',
  'setLayerZoomRange',
  'setFilter',
  'setPaintProperty',
  'setLayoutProperty',
  'setLight',
  'setTerrain',
  'setFog',
  'remove',
] as const;

export type MapRef = {
  getMap(): MapInstance;
} & Omit<MapInstance, (typeof skipMethods)[number]>;

type Method = (...args: unknown[]) => unknown;

export default function createRef(instance: Maplibre | null): MapRef | null {
  if (!instance) {
    return null;
  }

  const map = instance.map;
  const methods = map as unknown as Record<string, Method>;
  const result: Record<string, unknown> = {
    getMap: () => map,
  };

  for (const key of getMethodNames(map)) {
    if (!(key in result) && !(skipMethods as readonly string[]).includes(key)) {
      result[key] = methods[key].bind(map);
    }
  }

  return result as unknown as MapRef;
}

function getMethodNames(obj: object): string[] {
  const members = obj as Record<string, unknown>;
  const result = new Set<string>();

  let proto: object | null = obj;
  while (proto) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (
        key[0] !== '_' &&
        typeof members[key] === 'function' &&
        key !== 'fire' &&
        key !== 'setEventedParent'
      ) {
        result.add(key);
      }
    }
    proto = Object.getPrototypeOf(proto);
  }
  return Array.from(result);
}
