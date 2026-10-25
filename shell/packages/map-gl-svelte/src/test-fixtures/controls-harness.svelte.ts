// Mounting helpers shared by the `useControl` and built-in control tests.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { mount, tick, unmount, type ComponentProps } from 'svelte';
import {
  EMPTY_STYLE,
  createContainer,
  sleep,
  waitForStyleLoad,
} from '../test-utils/map-test-utils';
import type { GeolocateControlInstance } from '../types/lib';
import ControlsFixture from './controls-fixture.svelte';

export type FixtureProps = ComponentProps<typeof ControlsFixture>;

export type Rendered = {
  /** The fixture's live `$state` props: assign to them, then `flushSync()`. */
  props: FixtureProps;
  /** The element the fixture is mounted in: everything the map renders is inside it. */
  target: HTMLElement;
  /** The raw MapLibre map, once `<Map>` has created it. */
  map(): Promise<MapLibreMap>;
  /** The `<GeolocateControl>`'s MapLibre control, or undefined while there is no such component. */
  geolocate(): GeolocateControlInstance | undefined;
  unmount(): void;
};

// Headless Chromium caps live WebGL contexts: `cleanup()` unmounts every fixture after each test.
const rendered: { unmount(): void; target: HTMLElement }[] = [];

/** Mounts the fixture on a map with no sources or layers, unless `initial` has a `mapStyle`. */
export function render(initial: FixtureProps): Rendered {
  const props = $state({ mapStyle: EMPTY_STYLE, ...initial });
  const target = createContainer();
  const fixture = mount(ControlsFixture, { target, props });
  let mounted = true;
  const result: Rendered = {
    props,
    target,
    async map() {
      for (let i = 0; !fixture.getMapRef(); i++) {
        if (i > 500) {
          throw new Error('<Map> never created its map');
        }
        await sleep(10);
      }
      return fixture.getMapRef()!.getMap();
    },
    geolocate: () => fixture.getGeolocateControl(),
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

/**
 * Mounts the fixture and waits until its map's style has loaded, by which time the controls
 * rendered from `initial` are on the map.
 */
export async function renderLoaded(initial: FixtureProps): Promise<Rendered> {
  const r = render(initial);
  await waitForStyleLoad(await r.map());
  // The controls are the map's children, mounted in a flush after the map exists.
  await tick();
  return r;
}

/** For `afterEach`: unmounts every fixture `render()` mounted and removes its container. */
export function cleanup(): void {
  for (const r of rendered.splice(0)) {
    r.unmount();
    r.target.remove();
  }
}
