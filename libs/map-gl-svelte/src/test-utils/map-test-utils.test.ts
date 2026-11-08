import maplibregl from 'maplibre-gl';
import { expect, test } from 'vitest';
import {
  EMPTY_STYLE,
  backgroundStyle,
  createContainer,
  waitForLoad,
  waitForStyleLoad,
} from './map-test-utils';

test('real MapLibre renders in the browser harness', async () => {
  const map = new maplibregl.Map({
    container: createContainer(),
    style: backgroundStyle('#123456'),
  });
  await waitForLoad(map);
  expect(map.isStyleLoaded()).toBe(true);
  expect(map.getLayer('bg')).toBeTruthy();
  map.remove();
});

test('waitForStyleLoad resolves once a swapped-in style has loaded', async () => {
  const map = new maplibregl.Map({ container: createContainer(), style: EMPTY_STYLE });
  await waitForLoad(map);
  expect(map.getLayer('bg')).toBeUndefined();

  // Without diffing the old style is replaced asynchronously, so the layer isn't there yet.
  map.setStyle(backgroundStyle('#654321'), { diff: false });
  await waitForStyleLoad(map);
  expect(map.isStyleLoaded()).toBe(true);
  expect(map.getLayer('bg')).toBeTruthy();

  // Already loaded: resolves without waiting for another style event.
  await waitForStyleLoad(map);
  map.remove();
});
