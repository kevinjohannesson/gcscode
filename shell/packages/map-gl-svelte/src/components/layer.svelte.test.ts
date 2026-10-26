import type { FilterSpecification, LayerSpecification } from 'maplibre-gl';
import { flushSync } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  eventually,
  featureCollection,
  layerIds,
  pointFeature,
  render,
  settle,
  waitForMapLoad,
  type FixtureProps,
} from '../test-fixtures/source-layer-harness.svelte';
import { EMPTY_STYLE, backgroundStyle } from '../test-utils/map-test-utils';
import type { LayerProps } from './layer-props';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function pointsSource(): NonNullable<FixtureProps['source']> {
  return { id: 'pts', type: 'geojson', data: featureCollection(pointFeature('a', [0, 0])) };
}

// ---- Translated from upstream test/components/layer.spec.jsx (v8.1.3) ----

test('Source/Layer', async () => {
  const mapStyle = EMPTY_STYLE;
  const geoJSON = { type: 'Point' as const, coordinates: [0, 0] };
  const pointLayer = {
    paint: {
      'circle-radius': 10,
      'circle-color': '#007cbf',
    },
  };
  const pointLayer2 = {
    paint: {
      'circle-radius': 10,
      'circle-color': '#000000',
    },
    layout: {
      visibility: 'none' as const,
    },
  };

  const r = render({
    source: { id: 'my-data', type: 'geojson', data: geoJSON },
    nested: { id: 'my-layer' },
    ...pointLayer,
  });
  const map = await r.map();
  await waitForMapLoad(map);
  const layer = map.getLayer('my-layer');
  expect(layer, 'Layer is added').toBeTruthy();

  Object.assign(r.props, pointLayer2);
  flushSync();
  expect(layer!.visibility, 'Layer is updated').toBe('none');

  r.props.mapStyle = mapStyle;
  flushSync();
  // Not upstream: the new style doesn't have the layer, so the next check can't pass on a leftover.
  expect(map.getLayer('my-layer'), 'Layer is taken out by the style change').toBeUndefined();
  // Upstream awaits `waitForMapStyleLoad`, a `styledata` at which the style is loaded. Here the
  // source can be re-added before the swap's own `styledata` (by a re-check left pending from an
  // earlier one), and from then on every `styledata` sees it still loading: it finishes with
  // `sourcedata` only, so that wait never ends. A nested layer also comes back one `styledata`
  // after its source, where upstream re-renders it with the Source. So wait for the layer.
  await eventually(() =>
    expect(map.getLayer('my-layer'), 'Layer is added after style change').toBeTruthy(),
  );

  r.props.source = undefined;
  flushSync();
  expect(map.getSource('my-data'), 'Source is removed').toBeFalsy();
  expect(map.getLayer('my-layer'), 'Layer is removed').toBeFalsy();
});

// ---- Svelte-specific ----

test('nested and flat layers produce the expected style layers', async () => {
  const r = render({
    mapStyle: EMPTY_STYLE,
    flat: { id: 'flat', type: 'circle', source: 'pts', paint: { 'circle-color': '#f00' } },
    source: pointsSource(),
    nested: { id: 'nested' },
    paint: { 'circle-color': '#0f0' },
  });
  const map = await r.map();
  await eventually(() =>
    expect(layerIds(map).sort(), 'both layers are added').toEqual(['flat', 'nested']),
  );

  const layers = Object.fromEntries(
    map.getStyle().layers.map((layer: LayerSpecification) => [layer.id, layer]),
  );
  expect(layers.flat).toStrictEqual({
    id: 'flat',
    type: 'circle',
    source: 'pts',
    paint: { 'circle-color': '#f00' },
  });
  expect(layers.nested).toStrictEqual({
    id: 'nested',
    type: 'circle',
    source: 'pts',
    paint: { 'circle-color': '#0f0' },
  });
  expect(r.errors, 'no error events').toEqual([]);
});

test('a flat layer declared before its source appears when the source mounts', async () => {
  const r = render({ mapStyle: EMPTY_STYLE, flat: { id: 'flat', type: 'circle', source: 'pts' } });
  const map = await r.map();
  await waitForMapLoad(map);
  expect(map.getLayer('flat'), 'the layer waits for its source').toBeUndefined();
  expect(r.errors, 'being early is not an error').toEqual([]);

  r.props.source = pointsSource();
  flushSync();
  await eventually(() => expect(map.getLayer('flat'), 'the layer is added').toBeDefined());
  expect(map.getStyle().layers).toStrictEqual([{ id: 'flat', type: 'circle', source: 'pts' }]);
  expect(r.errors, 'no error events').toEqual([]);
});

// `{#if showLabels}<Layer … />{/if}`: the Source stays mounted, so its sweep of the layers on
// the source (M20) can't be what removes the layer, and neither can `map.remove()`.
test.each(['nested', 'flat'] as const)(
  'a %s layer removes itself on unmount, leaving its source',
  async (which) => {
    const r = render({
      mapStyle: EMPTY_STYLE,
      flat: { id: 'flat', type: 'circle', source: 'pts' },
      source: pointsSource(),
      nested: { id: 'nested' },
    });
    const map = await r.map();
    await eventually(() => expect(layerIds(map).sort(), 'both layers').toEqual(['flat', 'nested']));
    const other = which === 'nested' ? 'flat' : 'nested';

    r.props[which] = undefined;
    flushSync();

    expect(map.getLayer(which), 'the layer is removed').toBeUndefined();
    expect(map.getLayer(other), 'the other layer stays').toBeDefined();
    expect(map.getSource('pts'), 'the source stays').toBeDefined();
    expect(r.errors, 'no error events').toEqual([]);
  },
);

// `source={selectedId}` before anything is selected. The Source is mounted, so the layer can't
// be waiting for it: only the undefined id holds it back.
test.each([
  ['source={undefined}', { source: undefined }],
  ['no source prop', {}],
])('a circle layer with %s waits silently for a source id', async (_, source) => {
  const r = render({
    mapStyle: EMPTY_STYLE,
    flat: { id: 'flat', type: 'circle', ...source },
    source: pointsSource(),
  });
  const map = await r.map();
  await eventually(() => expect(map.getSource('pts'), 'the source is added').toBeDefined());
  await settle(map);
  expect(map.getLayer('flat'), 'no layer yet').toBeUndefined();
  expect(r.errors, 'no error event').toEqual([]);

  r.props.flat = { id: 'flat', type: 'circle', source: 'pts' };
  flushSync();
  await eventually(() => expect(map.getLayer('flat'), 'the layer is added').toBeDefined());
  expect(map.getLayer('flat')?.source).toBe('pts');
  expect(r.errors, 'no error events').toEqual([]);
});

test.each([
  ['background', { id: 'paper', type: 'background' }],
  ['custom', { id: 'paper', type: 'custom', render: () => {} }],
] satisfies [string, LayerProps][])('a %s layer needs no source', async (_, flat) => {
  const r = render({ mapStyle: EMPTY_STYLE, flat });
  const map = await r.map();
  await eventually(() => expect(map.getLayer('paper'), 'the layer is added').toBeDefined());
  expect(r.errors, 'no error events').toEqual([]);
});

test('layer updates', async () => {
  const warn = vi.spyOn(console, 'warn');
  const r = render({
    mapStyle: backgroundStyle('#000'),
    source: pointsSource(),
    nested: { id: 'nested' },
    paint: { 'circle-color': '#f00', 'circle-radius': 10 },
  });
  const map = await r.map();
  await eventually(() => expect(map.getLayer('nested'), 'the layer is added').toBeDefined());

  r.props.paint = { 'circle-color': '#00f', 'circle-radius': 10 };
  flushSync();
  expect(map.getPaintProperty('nested', 'circle-color'), 'changed paint key').toBe('#00f');
  expect(map.getPaintProperty('nested', 'circle-radius'), 'unchanged paint key').toBe(10);

  r.props.paint = { 'circle-color': '#00f' };
  flushSync();
  expect(map.getPaintProperty('nested', 'circle-radius'), 'removed paint key').toBeUndefined();

  expect(map.getLayoutProperty('nested', 'visibility')).toBeUndefined();
  r.props.layout = { visibility: 'none' };
  flushSync();
  expect(map.getLayoutProperty('nested', 'visibility'), 'layout').toBe('none');

  const filter: FilterSpecification = ['==', ['get', 'name'], 'a'];
  expect(map.getFilter('nested')).toBeUndefined();
  r.props.filter = filter;
  flushSync();
  expect(map.getFilter('nested'), 'filter').toEqual(['==', ['get', 'name'], 'a']);

  expect(map.getLayer('nested')?.minzoom).toBeUndefined();
  expect(map.getLayer('nested')?.maxzoom).toBeUndefined();
  Object.assign(r.props, { minzoom: 2, maxzoom: 10 });
  flushSync();
  expect(map.getLayer('nested')?.minzoom, 'minzoom').toBe(2);
  expect(map.getLayer('nested')?.maxzoom, 'maxzoom').toBe(10);

  expect(layerIds(map)).toEqual(['bg', 'nested']);
  r.props.beforeId = 'bg';
  flushSync();
  expect(layerIds(map), 'moved before bg').toEqual(['nested', 'bg']);
  r.props.beforeId = undefined;
  flushSync();
  expect(layerIds(map), 'moved back to the top').toEqual(['bg', 'nested']);

  expect(warn, 'no update failed').not.toHaveBeenCalled();
  expect(r.errors, 'no error events').toEqual([]);
});

test('layer id or type change warns', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const r = render({
    mapStyle: EMPTY_STYLE,
    flat: { id: 'flat', type: 'circle', source: 'pts' },
    source: pointsSource(),
  });
  const map = await r.map();
  await eventually(() => expect(map.getLayer('flat'), 'the layer is added').toBeDefined());
  expect(warn).not.toHaveBeenCalled();

  // As upstream: the assertion is caught and warned, not thrown.
  r.props.flat = { id: 'flat', type: 'line', source: 'pts' };
  expect(() => flushSync()).not.toThrow();
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: 'layer type changed' }),
  );
  expect(map.getLayer('flat')?.type, 'the layer keeps its type').toBe('circle');

  warn.mockClear();
  r.props.flat = { id: 'renamed', type: 'line', source: 'pts' };
  expect(() => flushSync()).not.toThrow();
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ message: 'layer id changed' }),
  );
  expect(map.getLayer('renamed'), 'no layer under the new id').toBeUndefined();
});
