// Mounting helpers shared by the `<Marker>` and `<Popup>` tests.
import type { Map as MapLibreMap } from 'maplibre-gl';
import { mount, unmount, type ComponentProps } from 'svelte';
import { EMPTY_STYLE, createContainer, sleep } from '../test-utils/map-test-utils';
import type { MarkerInstance, PopupInstance } from '../types/lib';
import MarkerPopupFixture from './marker-popup-fixture.svelte';

export type FixtureProps = ComponentProps<typeof MarkerPopupFixture>;

export type Rendered = {
  /** The fixture's live `$state` props: assign to them, then `flushSync()`. */
  props: FixtureProps;
  /** The element the fixture is mounted in: everything the map renders is inside it. */
  target: HTMLElement;
  /** The raw MapLibre map, once `<Map>` has created it. */
  map(): Promise<MapLibreMap>;
  /** The `<Marker>`'s MapLibre marker, or undefined while there is no `<Marker>`. */
  marker(): MarkerInstance | undefined;
  /** The `<Popup>`'s MapLibre popup, or undefined while there is no `<Popup>`. */
  popup(): PopupInstance | undefined;
  unmount(): void;
};

// Headless Chromium caps live WebGL contexts: `cleanup()` unmounts every fixture after each test.
const rendered: { unmount(): void; target: HTMLElement }[] = [];

/** Mounts the fixture on a map with no sources or layers, unless `initial` has a `mapStyle`. */
export function render(initial: FixtureProps): Rendered {
  const props = $state({ mapStyle: EMPTY_STYLE, ...initial });
  const target = createContainer();
  const fixture = mount(MarkerPopupFixture, { target, props });
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
    marker: () => fixture.getMarker(),
    popup: () => fixture.getPopup(),
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
