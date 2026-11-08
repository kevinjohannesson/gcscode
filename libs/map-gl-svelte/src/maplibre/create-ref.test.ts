import maplibregl from 'maplibre-gl';
import { afterEach, expect, test } from 'vitest';
import { EMPTY_STYLE, createContainer } from '../test-utils/map-test-utils';
import createRef from './create-ref';
import Maplibre, { type MaplibreProps } from './maplibre';

let instance: Maplibre | null = null;

function create(props: MaplibreProps): Maplibre {
  instance = new Maplibre(maplibregl.Map, props, createContainer());
  return instance;
}

afterEach(() => {
  if (instance) {
    const container = instance.map.getContainer();
    instance.destroy();
    container.remove();
    instance = null;
  }
});

test('getMap() returns the raw map', () => {
  const m = create({ mapStyle: EMPTY_STYLE });
  const ref = createRef(m);
  expect(ref?.getMap()).toBe(m.map);
});

test('map methods are exposed and bound to the map', () => {
  const m = create({ mapStyle: EMPTY_STYLE, initialViewState: { longitude: 10, latitude: 20 } });
  const ref = createRef(m);
  if (!ref) throw new Error('expected a ref');

  // Called detached from the ref, so it only works if it was bound.
  const { getCenter } = ref;
  const center = getCenter();
  expect(center.lng).toBeCloseTo(10, 6);
  expect(center.lat).toBeCloseTo(20, 6);
});

test('mutators that would break the binding are fenced off', () => {
  const m = create({ mapStyle: EMPTY_STYLE });
  const ref = createRef(m);
  if (!ref) throw new Error('expected a ref');

  // @ts-expect-error `setStyle` is not part of the MapRef type.
  void ref.setStyle;

  const refMembers = ref as unknown as Record<string, unknown>;
  const mapMembers = m.map as unknown as Record<string, unknown>;
  for (const name of [
    'setStyle',
    'addLayer',
    'setPaintProperty',
    'setFilter',
    'setMinZoom',
    'remove',
  ]) {
    // The raw map has each one, so `undefined` on the ref is the fence and not a typo.
    expect(typeof mapMembers[name], name).toBe('function');
    expect(refMembers[name], name).toBeUndefined();
  }
});

test('createRef(null) is null', () => {
  expect(createRef(null)).toBeNull();
});
