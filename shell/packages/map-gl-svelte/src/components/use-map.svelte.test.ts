import type { Map as MapLibreMap } from 'maplibre-gl';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import UseMapFixture from '../test-fixtures/use-map-fixture.svelte';
import { createContainer, sleep, waitForLoad } from '../test-utils/map-test-utils';
import type { MapCollection } from './use-map.svelte';

type FixtureProps = ComponentProps<typeof UseMapFixture>;

type Rendered = {
  /** The fixture's live `$state` props: assign to them, then `flushSync()`. */
  props: FixtureProps;
  /** What the probe outside every map got from `useMap()`. */
  maps: MapCollection;
  /** The raw MapLibre map of the `index`-th `<Map>`, once it has created it. */
  map(index: number): Promise<MapLibreMap>;
  /** The text of one of the probe's spans. */
  text(probe: string, span: 'watch' | 'current' | 'keys' | 'string'): string | null | undefined;
  unmount(): void;
};

// Headless Chromium caps live WebGL contexts: `cleanup()` unmounts every fixture after each test.
const rendered: { unmount(): void; target: HTMLElement }[] = [];

/** Mounts the fixture. `useMap()` results of each probe are kept in `collected`. */
function render(initial: FixtureProps, collected: Record<string, MapCollection> = {}): Rendered {
  const props = $state({
    ...initial,
    onMaps: (name: string, maps: MapCollection) => {
      collected[name] = maps;
    },
  });
  const target = createContainer();
  const fixture = mount(UseMapFixture, { target, props });
  let mounted = true;
  const result: Rendered = {
    props,
    get maps() {
      return collected.outer;
    },
    async map(index) {
      for (let i = 0; !fixture.getMapRef(index); i++) {
        if (i > 500) {
          throw new Error(`<Map> ${index} never created its map`);
        }
        await sleep(10);
      }
      return fixture.getMapRef(index)!.getMap();
    },
    text: (probe, span) => target.querySelector(`[data-probe="${probe}"] .${span}`)?.textContent,
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

afterEach(() => {
  for (const r of rendered.splice(0)) {
    r.unmount();
    r.target.remove();
  }
  vi.restoreAllMocks();
});

// ---- Translated from upstream test/components/use-map.spec.jsx (v8.1.3) ----

test('useMap', async () => {
  const r = render({ ids: ['mapA', 'mapB'] });
  const mapB = await r.map(1);
  await waitForLoad(mapB);
  const { maps } = r;

  expect(maps.mapA, 'Context has mapA').toBeTruthy();
  expect(maps.mapB, 'Context has mapB').toBeTruthy();

  r.props.ids = ['mapA'];
  flushSync();
  expect(maps.mapA, 'Context has mapA').toBeTruthy();
  expect(maps.mapB, 'mapB is removed').toBeFalsy();

  r.props.ids = [];
  flushSync();
  expect(maps.mapA, 'mapA is removed').toBeFalsy();

  r.unmount();
});

// ---- Svelte-specific ----

test('useMap updates when a map mounts later', async () => {
  const r = render({ ids: [], watch: 'mymap' });
  expect(r.text('outer', 'watch')).toBe('no');

  r.props.ids = ['mymap'];
  flushSync();
  // The map is created asynchronously: until then nothing is registered.
  expect(r.text('outer', 'watch'), 'not registered while the map is being created').toBe('no');

  await r.map(0);
  flushSync();
  expect(r.text('outer', 'watch')).toBe('yes');

  r.props.ids = [];
  flushSync();
  expect(r.text('outer', 'watch'), 'unregistered when the map unmounts').toBe('no');
});

test('useMap().current is the nearest enclosing map', async () => {
  const collected: Record<string, MapCollection> = {};
  const r = render({ ids: ['mapA', 'mapB'], inner: true }, collected);
  await waitForLoad(await r.map(0));
  await waitForLoad(await r.map(1));
  flushSync();

  expect(collected['map-0'].current, 'inside mapA').toBe(collected.outer.mapA);
  expect(collected['map-1'].current, 'inside mapB').toBe(collected.outer.mapB);
  expect(collected['map-0'].current, 'mapA is not mapB').not.toBe(collected['map-1'].current);
  expect(collected['map-0'].current?.getMap(), 'a MapRef').toBe(await r.map(0));
  expect(collected.outer.current, 'outside every map').toBeUndefined();
  expect(r.text('map-0', 'current')).toBe('yes');
  expect(r.text('outer', 'current')).toBe('no');
});

test('useMap().current works without a MapProvider', async () => {
  const collected: Record<string, MapCollection> = {};
  const r = render({ ids: ['solo'], provider: false, inner: true }, collected);
  await r.map(0);
  flushSync();

  expect(collected['map-0'].current, 'the enclosing map').toBeTruthy();
  expect(collected['map-0'].solo, 'nothing is registered').toBeUndefined();
  expect(r.text('map-0', 'current')).toBe('yes');
});

test('useMap lists the registered maps and current, as upstream does', async () => {
  const r = render({ ids: ['mapA', 'mapB'] });
  await waitForLoad(await r.map(1));
  flushSync();
  const { maps } = r;

  expect(Object.keys(maps), 'registered ids, then current').toEqual(['mapA', 'mapB', 'current']);
  expect('mapA' in maps).toBe(true);
  expect('nope' in maps).toBe(false);
  expect({ ...maps }.mapB, 'spreads').toBe(maps.mapB);
  expect(r.text('outer', 'keys')).toBe('mapA,mapB,current');

  r.props.ids = ['mapA'];
  flushSync();
  expect(Object.keys(maps)).toEqual(['mapA', 'current']);
  expect(r.text('outer', 'keys'), 'the template follows').toBe('mapA,current');
});

test('reading one id follows that id alone', async () => {
  const r = render({ ids: [] });
  const { maps } = r;
  const seen: boolean[] = [];
  // Reads `maps.mymap` and nothing else, unlike the probe's template, which also lists the keys.
  const stop = $effect.root(() => {
    $effect(() => {
      seen.push(Boolean(maps.mymap));
    });
  });
  flushSync();

  r.props.ids = ['mymap'];
  flushSync();
  await r.map(0);
  flushSync();
  stop();

  expect(seen).toEqual([false, true]);
});

test('useMap() reads as a plain object for anything but a registered id', async () => {
  const r = render({ ids: ['mapA'] });
  await waitForLoad(await r.map(0));
  flushSync();
  const { maps } = r;
  expect(maps.mapA, 'a registered id').toBeTruthy();
  expect(maps.nope, 'an unknown id').toBeUndefined();

  // Upstream's `useMap()` returns a plain object, which inherits Object.prototype's members.
  expect(String(maps)).toBe('[object Object]');
  // eslint-disable-next-line no-prototype-builtins -- the call under test
  expect(maps.hasOwnProperty('mapA'), 'hasOwnProperty, a registered id').toBe(true);
  // eslint-disable-next-line no-prototype-builtins -- the call under test
  expect(maps.hasOwnProperty('nope'), 'hasOwnProperty, an unknown id').toBe(false);
  expect('toString' in maps, 'inherited members are in it').toBe(true);

  r.props.stringify = true;
  expect(() => flushSync(), '{maps} in a template').not.toThrow();
  expect(r.text('outer', 'string')).toBe('[object Object]');
});

test('a map given no id is registered as "default"', async () => {
  const r = render({ ids: [undefined], watch: 'default' });
  await r.map(0);
  flushSync();

  expect(r.maps.default).toBeTruthy();
  expect(r.text('outer', 'watch')).toBe('yes');
});

test('a second map with the same id is reported, and the first stays registered', async () => {
  const onMapError = vi.fn();
  const r = render({ ids: ['dup', 'dup'], onMapError });
  await r.map(1);
  await vi.waitFor(() => expect(onMapError).toHaveBeenCalledTimes(1));

  expect(onMapError.mock.calls[0][0].error.message).toBe('Multiple maps with the same id: dup');
  expect(r.maps.dup?.getMap(), 'the first map holds the id').toBe(await r.map(0));

  // The second map is not registered, so it has no registration to remove when it goes.
  r.props.ids = ['dup'];
  flushSync();
  expect(r.maps.dup?.getMap(), 'still the first map').toBe(await r.map(0));
});

test('the id "current" is reported', async () => {
  const onMapError = vi.fn();
  const r = render({ ids: ['current'], onMapError });
  await r.map(0);
  await vi.waitFor(() => expect(onMapError).toHaveBeenCalledTimes(1));

  expect(onMapError.mock.calls[0][0].error.message).toBe("'current' cannot be used as map id");
  expect(r.maps.current, 'outside every map, current stays empty').toBeUndefined();
});
