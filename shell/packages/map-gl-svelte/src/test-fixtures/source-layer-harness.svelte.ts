// Mounting and waiting helpers shared by the `<Source>` and `<Layer>` tests.
import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { mount, unmount, type ComponentProps } from 'svelte';
import { vi } from 'vitest';
import { createContainer, sleep, waitForEvent } from '../test-utils/map-test-utils';
import type { ErrorEvent } from '../types/events';
import SourceLayerFixture from './source-layer-fixture.svelte';

export type FixtureProps = ComponentProps<typeof SourceLayerFixture>;

export type Rendered = {
  /** The fixture's live `$state` props: assign to them, then `flushSync()`. */
  props: FixtureProps;
  /** Every `error` event the map has fired since it was created, as messages. */
  errors: string[];
  /** The raw MapLibre map, once `<Map>` has created it. */
  map(): Promise<MapLibreMap>;
  unmount(): void;
};

// Headless Chromium caps live WebGL contexts: `cleanup()` unmounts every fixture after each test.
const rendered: { unmount(): void; target: HTMLElement }[] = [];

/** Mounts the fixture. Map `error` events go to `errors` unless `initial` has its own `onError`. */
export function render(initial: FixtureProps): Rendered {
  const errors: string[] = [];
  const props = $state({
    onError: (e: ErrorEvent) => {
      errors.push(e.error.message);
    },
    ...initial,
  });
  const target = createContainer();
  const fixture = mount(SourceLayerFixture, { target, props });
  let mounted = true;
  const result: Rendered = {
    props,
    errors,
    async map() {
      for (let i = 0; !fixture.getMapRef(); i++) {
        if (i > 500) {
          throw new Error('<Map> never created its map');
        }
        await sleep(10);
      }
      return fixture.getMapRef()!.getMap();
    },
    unmount() {
      if (mounted) {
        mounted = false;
        unmount(fixture);
      }
    },
  };
  rendered.push({ unmount: () => result.unmount(), target });
  return result;
}

/** For `afterEach`: unmounts every fixture `render()` mounted and removes its container. */
export function cleanup(): void {
  for (const r of rendered.splice(0)) {
    r.unmount();
    r.target.remove();
  }
}

/** Upstream's `waitForMapLoad`: polls until the style is loaded, then yields a task. */
export async function waitForMapLoad(map: MapLibreMap): Promise<void> {
  while (!map.isStyleLoaded()) {
    await sleep(50);
  }
  await sleep(0);
}

/** Retries `assertion` until it passes, every 10 ms for up to 2 s: long enough for a style round. */
export function eventually(assertion: () => void): Promise<void> {
  return vi.waitFor(assertion, { timeout: 2000, interval: 10 });
}

/** Resolves on the map's next `idle`, forcing a frame so that one comes even with nothing to do. */
export async function settle(map: MapLibreMap): Promise<void> {
  const idle = waitForEvent(map, 'idle');
  map.triggerRepaint();
  await idle;
}

/** The distinct `name` properties of the features `sourceId` has loaded, sorted. */
export function featureNames(map: MapLibreMap, sourceId: string): string[] {
  const names = map.querySourceFeatures(sourceId).map((feature) => String(feature.properties.name));
  // A feature appears once per tile it's in, wrapped world copies included.
  return names.filter((name, index) => names.indexOf(name) === index).sort();
}

/** Ids of the style's layers, in drawing order. */
export function layerIds(map: MapLibreMap): string[] {
  return map.getStyle().layers.map((layer: LayerSpecification) => layer.id);
}

export type PointFeature = {
  type: 'Feature';
  properties: { name: string };
  geometry: { type: 'Point'; coordinates: [number, number] };
};

export type PointCollection = { type: 'FeatureCollection'; features: PointFeature[] };

export function pointFeature(name: string, coordinates: [number, number]): PointFeature {
  return { type: 'Feature', properties: { name }, geometry: { type: 'Point', coordinates } };
}

export function featureCollection(...features: PointFeature[]): PointCollection {
  return { type: 'FeatureCollection', features };
}
