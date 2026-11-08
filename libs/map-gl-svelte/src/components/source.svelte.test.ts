import type { GeoJSONSource } from 'maplibre-gl';
import { flushSync } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  eventually,
  featureCollection,
  featureNames,
  pointFeature,
  render,
  settle,
  waitForMapLoad,
  type FixtureProps,
  type PointCollection,
} from '../test-fixtures/source-layer-harness.svelte';
import { EMPTY_STYLE, backgroundStyle, waitForEvent } from '../test-utils/map-test-utils';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function pointsSource(): NonNullable<FixtureProps['source']> {
  return { id: 'pts', type: 'geojson', data: featureCollection(pointFeature('a', [0, 0])) };
}

// ---- Translated from upstream test/components/source.spec.jsx (v8.1.3) ----

test('Source/Layer', async () => {
  const mapStyle = EMPTY_STYLE;
  const geoJSON = { type: 'Point' as const, coordinates: [0, 0] };
  const geoJSON2 = { type: 'Point' as const, coordinates: [1, 1] };

  const r = render({ source: { id: 'my-data', type: 'geojson', data: geoJSON } });
  const map = await r.map();
  await waitForMapLoad(map);
  expect(map.getSource('my-data'), 'Source is added').toBeTruthy();

  r.props.mapStyle = mapStyle;
  flushSync();
  // Not upstream: the new style doesn't have the source, so the next check can't pass on a leftover.
  expect(map.getSource('my-data'), 'Source is taken out by the style change').toBeUndefined();
  // Upstream awaits `waitForMapStyleLoad`, a `styledata` at which the style is loaded. Here the
  // source can be re-added before the swap's own `styledata` (by a re-check left pending from an
  // earlier one), and from then on every `styledata` sees it still loading: it finishes with
  // `sourcedata` only, so that wait never ends. So wait for the source.
  await eventually(() =>
    expect(map.getSource('my-data'), 'Source is added after style change').toBeTruthy(),
  );

  r.props.source = { id: 'my-data', type: 'geojson', data: geoJSON2 };
  flushSync();
  const sourceData = await map.getSource<GeoJSONSource>('my-data')?.getData();
  expect(sourceData, 'Source is updated').toEqual(geoJSON2);

  r.props.source = undefined;
  flushSync();
  expect(map.getSource('my-data'), 'Source is removed').toBeFalsy();
});

// ---- Svelte-specific ----

test.each([true, false])(
  'style swap re-adds sources and layers (styleDiffing: %s)',
  async (styleDiffing) => {
    const r = render({
      mapStyle: backgroundStyle('#000'),
      styleDiffing,
      source: pointsSource(),
      nested: { id: 'nested' },
    });
    const map = await r.map();
    await eventually(() => expect(map.getLayer('nested'), 'nested layer is added').toBeDefined());

    r.props.mapStyle = backgroundStyle('#fff');
    flushSync();
    expect(map.getSource('pts'), 'the swap takes the source out').toBeUndefined();
    expect(map.getLayer('nested'), 'the swap takes the layer out').toBeUndefined();

    // The style loads, the source comes back on a re-check, then the layer on the next one.
    await eventually(() => {
      expect(map.getSource('pts'), 'source is re-added').toBeDefined();
      expect(map.getLayer('nested'), 'layer is re-added').toBeDefined();
    });
    expect(map.getLayer('nested')?.source, 'layer is on the source').toBe('pts');
    expect(map.getPaintProperty('bg', 'background-color'), 'the new style is in').toBe('#fff');
    expect(r.errors, 'no error events').toEqual([]);
  },
);

test('a Source renders its children once its source exists', async () => {
  const r = render({ mapStyle: EMPTY_STYLE, nested: { id: 'nested' } });
  const map = await r.map();
  await waitForMapLoad(map);

  r.props.source = pointsSource();
  flushSync();
  expect(
    map.getSource('pts'),
    'the source is added at mount, the style being loaded',
  ).toBeDefined();
  // Mounted only now, the nested Layer finds its source at once, in the same flush. Mounted
  // with the Source, it would have checked first, found nothing, and waited for a `styledata`.
  expect(map.getLayer('nested'), 'the nested layer is added in the same flush').toBeDefined();
});

// Review Focus 4.
test('a flat layer follows its source as the source mounts, unmounts and mounts again', async () => {
  const r = render({
    mapStyle: EMPTY_STYLE,
    flat: { id: 'flat', type: 'circle', source: 'pts' },
    source: pointsSource(),
  });
  const map = await r.map();
  await eventually(() => expect(map.getLayer('flat'), 'flat layer is added').toBeDefined());
  expect(map.getSource('pts'), 'source is added').toBeDefined();

  r.props.source = undefined;
  flushSync();
  expect(map.getLayer('flat'), 'flat layer is removed with its source').toBeUndefined();
  expect(map.getSource('pts'), 'source is removed').toBeUndefined();
  // The flat Layer is still mounted, and re-checks on the next `styledata`: still no source.
  await waitForEvent(map, 'styledata');
  await settle(map);
  expect(map.getLayer('flat'), 'flat layer stays out without its source').toBeUndefined();
  expect(r.errors, 'no error events while the source is gone').toEqual([]);

  r.props.source = pointsSource();
  flushSync();
  await eventually(() => expect(map.getLayer('flat'), 'flat layer is back').toBeDefined());
  expect(map.getSource('pts'), 'source is back').toBeDefined();
  expect(r.errors, 'no error events').toEqual([]);
});

test('source teardown removes its layers first', async () => {
  // Svelte destroys a component's children before the component's own effects (open question
  // 2), so the nested layer has removed itself by the time the Source tears down. The flat layer
  // is the one still using the source then; without it this test couldn't see M20.
  const r = render({
    mapStyle: EMPTY_STYLE,
    flat: { id: 'flat', type: 'circle', source: 'pts' },
    source: pointsSource(),
    nested: { id: 'nested' },
  });
  const map = await r.map();
  await eventually(() => {
    expect(map.getLayer('nested'), 'nested layer is added').toBeDefined();
    expect(map.getLayer('flat'), 'flat layer is added').toBeDefined();
  });

  r.props.source = undefined;
  flushSync();
  expect(r.errors, 'no error event').toEqual([]);
  expect(map.getLayer('nested'), 'nested layer is removed').toBeUndefined();
  expect(map.getLayer('flat'), 'flat layer is removed').toBeUndefined();
  expect(map.getSource('pts'), 'source is removed').toBeUndefined();
});

test('source id or type change throws', async () => {
  const byId = render({ mapStyle: EMPTY_STYLE, source: pointsSource() });
  const map = await byId.map();
  await eventually(() => expect(map.getSource('pts'), 'source is added').toBeDefined());
  byId.props.source = { ...pointsSource(), id: 'renamed' };
  // Svelte rethrows an error from an effect with no boundary out of the flush (DEV appends the
  // component stack to the message).
  expect(() => flushSync()).toThrow('source id changed');
  byId.unmount();

  const byType = render({ mapStyle: EMPTY_STYLE, source: pointsSource() });
  const map2 = await byType.map();
  await eventually(() => expect(map2.getSource('pts'), 'source is added').toBeDefined());
  byType.props.source = { id: 'pts', type: 'raster', tiles: [] };
  expect(() => flushSync()).toThrow('source type changed');
});

test('geojson data updates on reassignment, not on mutation', async () => {
  const r = render({ mapStyle: EMPTY_STYLE, source: pointsSource(), nested: { id: 'nested' } });
  const map = await r.map();
  await eventually(() => expect(map.getLayer('nested'), 'nested layer is added').toBeDefined());
  await settle(map);
  expect(featureNames(map, 'pts'), 'initial data').toEqual(['a']);

  const source = r.props.source as { data: PointCollection };
  source.data = featureCollection(pointFeature('a', [0, 0]), pointFeature('b', [1, 1]));
  flushSync();
  await settle(map);
  expect(featureNames(map, 'pts'), 'reassigned data reaches the source').toEqual(['a', 'b']);

  // Documented: an in-place change to the `$state` data isn't seen. Reassign instead.
  source.data.features.push(pointFeature('c', [2, 2]));
  flushSync();
  await settle(map);
  expect(featureNames(map, 'pts'), 'mutated data does not').toEqual(['a', 'b']);
});

// Upstream's `updateSource` answers any changed option of a GeoJSON source with `setData(data)`.
// In the port, `data` reaches that path separately from the options, so check it's the current one.
test('a changed geojson option re-sends the current data', async () => {
  const r = render({
    mapStyle: EMPTY_STYLE,
    source: { ...pointsSource(), attribution: 'one' },
    nested: { id: 'nested' },
  });
  const map = await r.map();
  await eventually(() => expect(map.getLayer('nested'), 'nested layer is added').toBeDefined());
  const source = r.props.source as { data: PointCollection; attribution: string };
  source.data = featureCollection(pointFeature('a', [0, 0]), pointFeature('b', [1, 1]));
  flushSync();
  await settle(map);
  expect(featureNames(map, 'pts'), 'reassigned data').toEqual(['a', 'b']);
  const setData = vi.spyOn(map.getSource<GeoJSONSource>('pts')!, 'setData');

  source.attribution = 'two';
  flushSync();
  await settle(map);

  expect(setData, 'the option change goes to setData').toHaveBeenCalledOnce();
  expect(setData.mock.calls[0][0], 'with the current data').toEqual(
    featureCollection(pointFeature('a', [0, 0]), pointFeature('b', [1, 1])),
  );
  expect(featureNames(map, 'pts'), 'the source keeps the current features').toEqual(['a', 'b']);
  expect(r.errors, 'no error events').toEqual([]);
});

test('a Source and a Layer without id get generated ids', async () => {
  const r = render({
    mapStyle: EMPTY_STYLE,
    source: { type: 'geojson', data: featureCollection(pointFeature('a', [0, 0])) },
    nested: {},
  });
  const map = await r.map();
  await eventually(() => expect(map.getStyle().layers, 'the layer is added').toHaveLength(1));

  const { sources, layers } = map.getStyle();
  const sourceIds = Object.keys(sources);
  expect(sourceIds).toHaveLength(1);
  expect(sourceIds[0]).toMatch(/^svelte-source-\d+$/);
  expect(layers[0].id).toMatch(/^svelte-layer-\d+$/);
  expect(map.getLayer(layers[0].id)?.source, 'the layer is on the generated source').toBe(
    sourceIds[0],
  );
});
