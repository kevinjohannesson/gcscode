import { expect, test } from 'vitest';

// Written out, not computed from upstream: the runtime exports of `@vis.gl/react-maplibre`
// v8.1.3's `src/index.ts`. A module meant to hold only types that leaks a runtime export fails
// this test.
const UPSTREAM_RUNTIME_EXPORTS = [
  'AttributionControl',
  'FullscreenControl',
  'GeolocateControl',
  'GlobeControl',
  'Layer',
  'LogoControl',
  'Map',
  'MapProvider',
  'Marker',
  'NavigationControl',
  'Popup',
  'ScaleControl',
  'Source',
  'TerrainControl',
  'default',
  'useControl',
  'useMap',
];

test('runtime exports match upstream v8.1.3', async () => {
  expect(Object.keys(await import('./index')).sort()).toEqual([...UPSTREAM_RUNTIME_EXPORTS].sort());
});

test('the default export is Map', async () => {
  const index = await import('./index');
  expect(index.default).toBe(index.Map);
});
