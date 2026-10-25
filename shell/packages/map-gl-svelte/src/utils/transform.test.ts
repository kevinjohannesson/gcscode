import maplibregl, { LngLat } from 'maplibre-gl';
import { expect, test } from 'vitest';
import type { MapInstance } from '../types/lib';
import { EMPTY_STYLE, createContainer } from '../test-utils/map-test-utils';
import {
  applyViewStateToTransform,
  getTransformLike,
  transformToViewState,
  updatePitchConstraint,
  updateZoomConstraint,
  type ConstraintRange,
} from './transform';

test('getTransformLike', () => {
  const center = new LngLat(-122.45, 37.78);
  const padding = { top: 1, left: 2, right: 3, bottom: 4 };
  const map = {
    get transform() {
      throw new Error('map.transform should not be accessed');
    },
    getCenter: () => center,
    getZoom: () => 10.5,
    getBearing: () => -70,
    getPitch: () => 30,
    getCenterElevation: () => 100,
    getPadding: () => padding,
  } as unknown as MapInstance;

  const tr = getTransformLike(map);

  expect(tr.center, 'center retains its LngLat instance').toBe(center);
  expect(tr.padding, 'padding retains its identity').toBe(padding);
  expect(tr, 'camera state is read from public getters').toEqual({
    center,
    zoom: 10.5,
    bearing: -70,
    pitch: 30,
    elevation: 100,
    padding,
  });
});

test('transformToViewState', () => {
  const tr = {
    center: new LngLat(-122.45, 37.78),
    zoom: 10.5,
    bearing: -70,
    pitch: 30,
    elevation: 0,
    padding: { top: 0, left: 0, right: 0, bottom: 0 },
  };

  expect(transformToViewState(tr)).toEqual({
    longitude: -122.45,
    latitude: 37.78,
    zoom: 10.5,
    bearing: -70,
    pitch: 30,
    padding: { top: 0, left: 0, right: 0, bottom: 0 },
  });
});

test('applyViewStateToTransform', () => {
  const tr = {
    center: new LngLat(-122.45, 37.78),
    zoom: 10.5,
    bearing: -70,
    pitch: 30,
    elevation: 0,
    padding: { top: 0, left: 0, right: 0, bottom: 0 },
  };

  let changed = applyViewStateToTransform(tr, {});
  expect(changed, 'no changes detected').toEqual({});

  changed = applyViewStateToTransform(tr, { longitude: -10, latitude: 5 });
  expect(changed, 'center changed').toEqual({
    center: new LngLat(-10, 5),
  });

  changed = applyViewStateToTransform(tr, { zoom: 11, pitch: 30, bearing: -70 });
  expect(changed, 'zoom changed').toEqual({ zoom: 11 });

  changed = applyViewStateToTransform(tr, { zoom: 10.5, pitch: 40, bearing: -70 });
  expect(changed, 'pitch changed').toEqual({ pitch: 40 });

  changed = applyViewStateToTransform(tr, { zoom: 10.5, pitch: 30, bearing: 270 });
  expect(changed, 'bearing changed').toEqual({ bearing: 270 });

  changed = applyViewStateToTransform(tr, {
    padding: { left: 10, right: 10, top: 10, bottom: 10 },
  });
  expect(changed, 'bearing changed').toEqual({
    padding: { left: 10, right: 10, top: 10, bottom: 10 },
  });

  changed = applyViewStateToTransform(tr, { viewState: { pitch: 30 } });
  expect(changed, 'nothing changed').toEqual({});
});

// The spec's "controlled = not undefined" row: upstream tests `'zoom' in props`, the port tests
// `props.zoom !== undefined`, so a camera field that is present but `undefined` is uncontrolled.
// `toStrictEqual` matters here: `toEqual` ignores keys whose value is undefined, which would
// let a `{ zoom: undefined }` change slip through.
test('applyViewStateToTransform ignores undefined camera fields', () => {
  const map = new maplibregl.Map({ container: createContainer(), style: EMPTY_STYLE, zoom: 4 });
  try {
    const tr = getTransformLike(map); // zoom 4
    expect(applyViewStateToTransform(tr, { zoom: undefined, pitch: undefined })).toStrictEqual({});
    expect(applyViewStateToTransform(tr, { zoom: 6 })).toEqual({ zoom: 6 });
  } finally {
    map.remove();
  }
});

test('applyViewStateToTransform ignores undefined center, bearing and padding', () => {
  const tr = {
    center: new LngLat(-122.45, 37.78),
    zoom: 10.5,
    bearing: -70,
    pitch: 30,
    elevation: 0,
    padding: { top: 0, left: 0, right: 0, bottom: 0 },
  };

  expect(
    applyViewStateToTransform(tr, {
      longitude: undefined,
      latitude: undefined,
      bearing: undefined,
      padding: undefined,
    }),
    'all undefined',
  ).toStrictEqual({});
  expect(
    applyViewStateToTransform(tr, { longitude: -10, latitude: undefined }),
    'center needs a latitude',
  ).toStrictEqual({});
  expect(
    applyViewStateToTransform(tr, { longitude: undefined, latitude: 5 }),
    'center needs a longitude',
  ).toStrictEqual({});
  expect(
    applyViewStateToTransform(tr, { viewState: { zoom: undefined, bearing: 12 } }),
    'viewState fields follow the same rule',
  ).toStrictEqual({ bearing: 12 });
});

function createConstraintMap(setMinName: string, setMaxName: string) {
  let first: 'min' | 'max' | null = null;
  let currentMin = 0;
  let currentMax = 0;
  const map = {
    [setMinName]: (nextMin: number) => {
      if (nextMin > currentMax) {
        throw new Error(`Setting ${setMinName} (${nextMin}) > current max (${currentMax})`);
      }
      currentMin = nextMin;
      if (!first) {
        first = 'min';
      }
    },
    [setMaxName]: (nextMax: number) => {
      if (nextMax < currentMin) {
        throw new Error(`Setting ${setMaxName} (${nextMax}) < current min (${currentMin})`);
      }
      currentMax = nextMax;
      if (!first) {
        first = 'max';
      }
    },
  } as unknown as MapInstance;
  return {
    map,
    reset(min: number, max: number) {
      currentMin = min;
      currentMax = max;
      first = null;
    },
    getFirst() {
      return first;
    },
  };
}

function testConstraintUpdate(
  updateFn: (map: MapInstance, next: ConstraintRange, current: ConstraintRange) => boolean,
  setMinName: string,
  setMaxName: string,
  label: string,
) {
  const helper = createConstraintMap(setMinName, setMaxName);

  // Range shifting down
  helper.reset(5, 10);
  updateFn(helper.map, { min: 1, max: 3 }, { min: 5, max: 10 });
  expect(helper.getFirst(), `${label}: 5 - 10 -> 1 - 3, update min first`).toBe('min');

  // Range shifting up
  helper.reset(1, 3);
  updateFn(helper.map, { min: 5, max: 10 }, { min: 1, max: 3 });
  expect(helper.getFirst(), `${label}: 1 - 3 -> 5 - 10, update max first`).toBe('max');

  // Range expanding
  helper.reset(5, 18);
  updateFn(helper.map, { min: 3, max: 22 }, { min: 5, max: 18 });
  expect(helper.getFirst(), `${label}: 5 - 18 -> 3 - 22, update min first`).toBe('min');

  // Only min changing (decreasing)
  helper.reset(5, 18);
  updateFn(helper.map, { min: 3, max: 18 }, { min: 5, max: 18 });
  expect(helper.getFirst(), `${label}: 5 - 18 -> 3 - 18, update min first`).toBe('min');

  // Range contracting
  helper.reset(3, 22);
  updateFn(helper.map, { min: 5, max: 18 }, { min: 3, max: 22 });
  expect(helper.getFirst(), `${label}: 3 - 22 -> 5 - 18, update max first`).toBe('max');

  // Range shifting down with high start
  helper.reset(12, 22);
  updateFn(helper.map, { min: 5, max: 10 }, { min: 12, max: 22 });
  expect(helper.getFirst(), `${label}: 12 - 22 -> 5 - 10, update min first`).toBe('min');

  // Locked to single value (min === max)
  helper.reset(3, 10);
  updateFn(helper.map, { min: 5, max: 5 }, { min: 3, max: 10 });
  expect(helper.getFirst(), `${label}: 3 - 10 -> 5 - 5, lock to single value`).toBe('max');

  // Unlock from single value
  helper.reset(5, 5);
  updateFn(helper.map, { min: 3, max: 10 }, { min: 5, max: 5 });
  expect(helper.getFirst(), `${label}: 5 - 5 -> 3 - 10, unlock from single value`).toBe('min');

  // Partial overlap (shifting up)
  helper.reset(3, 8);
  updateFn(helper.map, { min: 6, max: 10 }, { min: 3, max: 8 });
  expect(helper.getFirst(), `${label}: 3 - 8 -> 6 - 10, partial overlap shifting up`).toBe('max');

  // Partial overlap (shifting down)
  helper.reset(6, 10);
  updateFn(helper.map, { min: 3, max: 8 }, { min: 6, max: 10 });
  expect(helper.getFirst(), `${label}: 6 - 10 -> 3 - 8, partial overlap shifting down`).toBe('min');

  // No change returns false
  helper.reset(3, 10);
  const changed = updateFn(helper.map, { min: 3, max: 10 }, { min: 3, max: 10 });
  expect(changed, `${label}: no change returns false`).toBe(false);
}

test('updateZoomConstraint', () => {
  testConstraintUpdate(updateZoomConstraint, 'setMinZoom', 'setMaxZoom', 'zoom');
});

test('updatePitchConstraint', () => {
  testConstraintUpdate(updatePitchConstraint, 'setMinPitch', 'setMaxPitch', 'pitch');
});
