import maplibregl, { type LngLat, type MapOptions } from 'maplibre-gl';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { afterEach, expect, test, vi, type MockInstance } from 'vitest';
import MapDefault, { Map as NamedMap } from '../index';
import type { MapRef } from '../maplibre/create-ref';
import Maplibre from '../maplibre/maplibre';
import MapFixture from '../test-fixtures/map-fixture.svelte';
import {
  EMPTY_STYLE,
  backgroundStyle,
  createContainer,
  sleep,
  waitForEvent,
  waitForLoad,
  waitForStyleLoad,
} from '../test-utils/map-test-utils';
import type { ViewState } from '../types/common';
import type { ErrorEvent, MapEvent, ViewStateChangeEvent } from '../types/events';
import type { MapLib } from '../types/lib';
import { MOUNTED_MAPS_CONTEXT_KEY, type MountedMapsContextValue } from './use-map.svelte';

type FixtureProps = ComponentProps<typeof MapFixture>;

type Rendered = {
  props: FixtureProps;
  target: HTMLDivElement;
  getMapRef(): MapRef | null;
  unmount(): void;
};

// Headless Chromium caps live WebGL contexts: every fixture is unmounted and every parked map
// destroyed after each test.
const rendered: Rendered[] = [];

/** Mounts the fixture with `props`, which stays live: assign to it, then `flushSync()`. */
function mountFixture(props: FixtureProps, context?: globalThis.Map<unknown, unknown>): Rendered {
  const target = createContainer();
  const fixture = mount(MapFixture, { target, props, context });
  let mounted = true;
  const result: Rendered = {
    props,
    target,
    getMapRef: () => fixture.getMapRef(),
    unmount() {
      if (mounted) {
        mounted = false;
        unmount(fixture);
      }
    },
  };
  rendered.push(result);
  return result;
}

function render(initial: FixtureProps, context?: globalThis.Map<unknown, unknown>): Rendered {
  const props = $state(initial);
  return mountFixture(props, context);
}

afterEach(() => {
  for (const r of rendered.splice(0)) {
    r.unmount();
    r.target.remove();
  }
  for (const instance of Maplibre.savedMaps.splice(0)) {
    const container = instance.map.getContainer();
    instance.destroy();
    container.remove();
  }
  vi.restoreAllMocks();
});

/** Resolves with the fixture's MapRef once `<Map>` has created its map. */
async function mapOf(r: Rendered): Promise<MapRef> {
  for (let i = 0; !r.getMapRef(); i++) {
    if (i > 500) {
      throw new Error('<Map> never created its map');
    }
    await sleep(10);
  }
  return r.getMapRef()!;
}

async function loadedMapOf(r: Rendered): Promise<MapRef> {
  const map = await mapOf(r);
  await waitForLoad(map.getMap());
  return map;
}

function getCameraConstraints(map: MapRef) {
  return {
    minZoom: map.getMinZoom(),
    maxZoom: map.getMaxZoom(),
    minPitch: map.getMinPitch(),
    maxPitch: map.getMaxPitch(),
  };
}

function classesOf(element: Element): string[] {
  return [...element.classList].sort();
}

function cameraOf(map: MapRef): ViewState {
  const center = map.getCenter();
  return {
    longitude: center.lng,
    latitude: center.lat,
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    padding: map.getPadding(),
  };
}

const easeAway = (e: MapEvent) => {
  e.target.easeTo({ center: [-122, 38], zoom: 14, duration: 100 });
};

// ---- Translated from upstream test/components/map.spec.jsx (v8.1.3, plus #2612's two cases) ----

test('Map', async () => {
  expect(NamedMap, 'Map is defined').toBeTruthy();
  expect(MapDefault, 'Map is the default export').toBe(NamedMap);

  let onloadCalled = 0;
  const onLoad = () => onloadCalled++;

  const r = render({ initialViewState: { longitude: -100, latitude: 40, zoom: 4 }, onLoad });
  const map = await loadedMapOf(r);

  expect(map, 'Map is created').toBeTruthy();
  expect(map.getCenter().lng, 'longitude is set').toBe(-100);
  expect(map.getCenter().lat, 'latitude is set').toBe(40);
  expect(map.getZoom(), 'zoom is set').toBe(4);

  delete r.props.initialViewState;
  Object.assign(r.props, { longitude: -122, latitude: 38, zoom: 14 });
  flushSync();

  expect(map.getCenter().lng, 'longitude is updated').toBe(-122);
  expect(map.getCenter().lat, 'latitude is updated').toBe(38);
  expect(map.getZoom(), 'zoom is updated').toBe(14);

  expect(onloadCalled, 'onLoad is called').toBe(1);
});

test('Map resets camera constraints to MapLibre defaults', async () => {
  const r = render({});
  const map = await loadedMapOf(r);

  const defaults = getCameraConstraints(map);

  Object.assign(r.props, { minZoom: 2, maxZoom: 10, minPitch: 5, maxPitch: 40 });
  flushSync();

  expect(getCameraConstraints(map)).toEqual({ minZoom: 2, maxZoom: 10, minPitch: 5, maxPitch: 40 });

  Object.assign(r.props, { minZoom: null, maxZoom: null, minPitch: null, maxPitch: null });
  flushSync();

  expect(getCameraConstraints(map)).toEqual(defaults);

  Object.assign(r.props, { minZoom: 3, maxZoom: 11, minPitch: 6, maxPitch: 41 });
  flushSync();
  Object.assign(r.props, {
    minZoom: undefined,
    maxZoom: undefined,
    minPitch: undefined,
    maxPitch: undefined,
  });
  flushSync();

  expect(getCameraConstraints(map)).toEqual(defaults);

  Object.assign(r.props, { minZoom: 4, maxZoom: 12, minPitch: 7, maxPitch: 42 });
  flushSync();
  delete r.props.minZoom;
  delete r.props.maxZoom;
  delete r.props.minPitch;
  delete r.props.maxPitch;
  flushSync();

  expect(getCameraConstraints(map)).toEqual(defaults);

  r.unmount();

  for (const resetValue of [null, undefined]) {
    const initial = render({
      minZoom: resetValue,
      maxZoom: resetValue,
      minPitch: resetValue,
      maxPitch: resetValue,
    });
    const initialMap = await loadedMapOf(initial);
    expect(getCameraConstraints(initialMap)).toEqual(defaults);
    initial.unmount();
  }
});

test('Map resets camera constraints when reusing a map', async () => {
  const first = render({ reuseMaps: true });
  const firstMap = await loadedMapOf(first);

  const defaults = getCameraConstraints(firstMap);

  Object.assign(first.props, { minZoom: 2, maxZoom: 10, minPitch: 5, maxPitch: 40 });
  flushSync();
  // Not upstream: without these two checks the final assertion would also pass if the limits
  // never reached the first map, or if the second mount made a new map instead of reusing it.
  expect(getCameraConstraints(firstMap)).toEqual({
    minZoom: 2,
    maxZoom: 10,
    minPitch: 5,
    maxPitch: 40,
  });
  first.unmount();

  const second = render({ reuseMaps: true });
  // As upstream's waitForMapLoad: a reused map fires its synthetic `load` during reuse.
  const secondMap = await mapOf(second);
  await waitForStyleLoad(secondMap.getMap());
  expect(secondMap.getMap()).toBe(firstMap.getMap());

  expect(getCameraConstraints(secondMap)).toEqual(defaults);
});

// Upstream asserts inside `onRender`, which throws inside MapLibre's render loop. These record
// each frame instead and assert afterwards, which also proves the frames were seen at all.

test('Map#uncontrolled', async () => {
  let lastCenter: LngLat | undefined;
  let done = false;
  let animatedFrames = 0;
  const failures: string[] = [];

  await new Promise<void>((resolve) => {
    render({
      initialViewState: { longitude: -100, latitude: 40, zoom: 4 },
      onLoad: easeAway,
      onRender: (e: MapEvent) => {
        if (done) {
          return;
        }
        const center = e.target.getCenter();
        if (lastCenter) {
          animatedFrames++;
          if (!(lastCenter.lng > center.lng && lastCenter.lat > center.lat)) {
            failures.push(`animated to ${center}`);
          }
        }
        lastCenter = center;
      },
      onMoveEnd: () => {
        // Upstream unmounts here; stop recording instead, the fixture is unmounted afterwards.
        done = true;
        resolve();
      },
    });
  });

  expect(animatedFrames).toBeGreaterThan(0);
  expect(failures).toEqual([]);
});

test('Map#controlled#no-update', async () => {
  let done = false;
  let frames = 0;
  const failures: string[] = [];

  await new Promise<void>((resolve) => {
    render({
      longitude: -100,
      latitude: 40,
      zoom: 4,
      onLoad: easeAway,
      onMoveEnd: () => {
        done = true;
        resolve();
      },
      onRender: (e: MapEvent) => {
        if (done) {
          return;
        }
        frames++;
        const center = e.target.getCenter();
        if (!(center.lng === -100 && center.lat === 40)) {
          failures.push(`map center should match props: ${center}`);
        }
      },
    });
  });

  expect(frames).toBeGreaterThan(0);
  expect(failures).toEqual([]);
});

type MirrorFrame = { state: [number?, number?]; center: [number, number]; moving: boolean };

/** Runs upstream's mirror test; returns every frame rendered until `moveend`. */
async function runMirror(mirror: 'direct' | 'delayed'): Promise<MirrorFrame[]> {
  let done = false;
  const frames: MirrorFrame[] = [];

  await new Promise<void>((resolve) => {
    render({
      mirror,
      onLoad: easeAway,
      onMirrorRender: (vs: Partial<ViewState>, e: MapEvent) => {
        if (done) {
          return;
        }
        const center = e.target.getCenter();
        frames.push({
          state: [vs.longitude, vs.latitude],
          center: [center.lng, center.lat],
          moving: e.target.isMoving(),
        });
      },
      onMoveEnd: () => {
        done = true;
        resolve();
      },
    });
  });
  return frames;
}

function mismatches(frames: MirrorFrame[]): string[] {
  return frames
    .filter((f) => f.state[0] !== f.center[0] || f.state[1] !== f.center[1])
    .map((f) => `map center should match state: center ${f.center}, state ${f.state}`);
}

// Fails in the port, by one event (spec open question 1). MapLibre runs the camera hook, then
// fires `move`; `onMove` writes the state synchronously, so by the `render` that follows the
// state is already one event ahead of what the hook applied. Upstream's `onRender` sees React's
// last committed state instead, which is what the map rendered. The next test pins the lag.
test.fails('Map#controlled#mirror-back', async () => {
  const frames = await runMirror('direct');

  expect(frames.filter((f) => f.moving).length).toBeGreaterThan(0);
  expect(mismatches(frames)).toEqual([]);
});

test('Map#controlled#mirror-back renders the state of the previous event', async () => {
  const frames = await runMirror('direct');

  expect(frames.filter((f) => f.moving).length).toBeGreaterThan(0);
  expect(mismatches(frames).length, 'the map lags the state').toBeGreaterThan(0);
  const lagged = frames
    .slice(1)
    .filter((f, i) => f.center[0] !== frames[i].state[0] || f.center[1] !== frames[i].state[1]);
  expect(lagged, 'each frame shows the state the frame before ended with').toEqual([]);
});

test('Map#controlled#delayed-update', async () => {
  const frames = await runMirror('delayed');

  expect(frames.filter((f) => f.moving).length).toBeGreaterThan(0);
  expect(mismatches(frames)).toEqual([]);
});

// ---- Port-specific tests ----

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Drags the map with the mouse: a `mousedown` in the middle of the canvas, five `mousemove`s a
 * frame apart, then a `mouseup`. MapLibre's pan handler listens for these on the canvas container
 * and the document, so synthetic events drive it. MapLibre eases on after the release (inertia,
 * an `easeTo`) only with two or more pan moves from the last 160 ms (`handler_inertia.ts`). So
 * without inertia the pointer rests 300 ms before the release, which then fires `moveend` at once.
 */
async function dragMap(map: MapRef, inertia: boolean): Promise<void> {
  const canvas = map.getCanvas();
  const rect = canvas.getBoundingClientRect();
  const at = (i: number, buttons: number): MouseEventInit => ({
    bubbles: true,
    cancelable: true,
    clientX: rect.left + 200 + i * 20,
    clientY: rect.top + 150 + i * 10,
    button: 0,
    buttons,
  });
  canvas.dispatchEvent(new MouseEvent('mousedown', at(0, 1)));
  for (let i = 1; i <= 5; i++) {
    canvas.dispatchEvent(new MouseEvent('mousemove', at(i, 1)));
    // MapLibre applies the move in its next frame, which runs before this callback.
    await nextFrame();
  }
  if (!inertia) {
    await sleep(300);
  }
  canvas.dispatchEvent(new MouseEvent('mouseup', at(5, 0)));
}

/** Renders a frame now and resolves once it has been rendered. */
async function renderNow(map: MapRef): Promise<void> {
  const rendered = waitForEvent(map.getMap(), 'render');
  map.getMap().triggerRepaint();
  await rendered;
}

const sameCenter = (a: [number?, number?], b: [number?, number?]) => a[0] === b[0] && a[1] === b[1];

// The spec's "controlled camera ignoring a gesture when `onMove` is not applied", with a real drag.
test.each([
  ['without inertia', false],
  ['with inertia', true],
])(
  'a controlled camera ignores a drag released %s when onMove is not applied',
  async (_, inertia) => {
    const proposals: [number, number][] = [];
    const frames: [number, number][] = [];
    const r = render({
      mapStyle: EMPTY_STYLE,
      longitude: -100,
      latitude: 40,
      zoom: 4,
      onMove: (e: ViewStateChangeEvent) => {
        proposals.push([e.viewState.longitude, e.viewState.latitude]);
      },
      onRender: (e: MapEvent) => {
        const center = e.target.getCenter();
        frames.push([center.lng, center.lat]);
      },
    });
    const map = await loadedMapOf(r);
    const moveEnd = waitForEvent(map.getMap(), 'moveend');
    await dragMap(map, inertia);
    const atRelease = proposals.length;
    await moveEnd;
    await renderNow(map);

    // The drag was real: MapLibre proposed cameras away from the props, after the release too
    // when it eased on.
    expect(atRelease).toBeGreaterThan(0);
    expect(sameCenter(proposals.at(-1)!, [-100, 40]), 'the last proposal is elsewhere').toBe(false);
    expect(proposals.length > atRelease, 'proposals after the release').toBe(inertia);
    // The map rendered the props throughout, and still does now that the movement has ended.
    expect(frames.length).toBeGreaterThan(5);
    expect(frames.filter((center) => !sameCenter(center, [-100, 40]))).toEqual([]);
  },
);

test.each([
  ['without inertia', false],
  ['with inertia', true],
])(
  'a controlled camera that applies onMove ends a drag released %s at the state',
  async (_, inertia) => {
    const frames: MirrorFrame[] = [];
    let drags = 0;
    const r = render({
      mirror: 'direct',
      mapStyle: EMPTY_STYLE,
      onDrag: () => drags++,
      onMirrorRender: (vs: Partial<ViewState>, e: MapEvent) => {
        const center = e.target.getCenter();
        frames.push({
          state: [vs.longitude, vs.latitude],
          center: [center.lng, center.lat],
          moving: e.target.isMoving(),
        });
      },
    });
    const map = await loadedMapOf(r);
    const moveEnd = waitForEvent(map.getMap(), 'moveend');
    await dragMap(map, inertia);
    const atRelease = frames.length;
    await moveEnd;
    await renderNow(map);

    expect(drags, 'the drag reached the map').toBeGreaterThan(0);
    expect(
      frames.slice(atRelease).some((f) => f.moving),
      'moving after the release',
    ).toBe(inertia);
    const last = frames.at(-1)!;
    expect(last.moving).toBe(false);
    expect(sameCenter(last.state, [-100, 40]), 'the state followed the drag').toBe(false);
    expect(last.center, 'once movement has ended, the map renders the state').toEqual(last.state);
  },
);

test('a camera the map can’t reach is applied once per change, with no loop at moveend', async () => {
  // Web Mercator stops at ±85.05° latitude, so MapLibre clamps 89 and the props never match.
  const r = render({ mapStyle: EMPTY_STYLE, longitude: 0, latitude: 89, zoom: 2 });
  const map = await loadedMapOf(r);
  const jumpTo = vi.spyOn(map.getMap(), 'jumpTo');

  r.props.zoom = 3;
  expect(() => flushSync()).not.toThrow();

  expect(jumpTo).toHaveBeenCalledOnce();
  expect(map.getZoom()).toBe(3);
  expect(map.getCenter().lat).toBeLessThan(86);
});

test('children see the map at init', async () => {
  const onProbe = vi.fn();
  const r = render({ onProbe });
  await mapOf(r);
  flushSync();

  expect(onProbe.mock.calls).toEqual([[true]]);
});

test("the children's element comes after MapLibre's, as in upstream's DOM", async () => {
  for (const pass of ['created', 'reused']) {
    const r = render({ reuseMaps: true });
    const map = await mapOf(r);
    flushSync();
    const container = map.getContainer();
    const children = container.querySelector<HTMLElement>('[mapboxgl-children]')!;

    expect(container.lastElementChild, pass).toBe(children);
    // So an overlay in it, positioned without a z-index, stacks above the canvas.
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: absolute; left: 0; top: 0; width: 50px; height: 50px';
    children.appendChild(overlay);
    const rect = container.getBoundingClientRect();
    expect(document.elementFromPoint(rect.left + 10, rect.top + 10), pass).toBe(overlay);

    r.unmount();
  }
});

test('id lands on the container', async () => {
  const r = render({ id: 'my-map' });
  const map = await mapOf(r);

  expect(map.getContainer().id).toBe('my-map');
  expect(r.target.querySelector('#my-map')).toBe(map.getContainer());
});

test('class changes add and remove only the component’s own tokens', async () => {
  const r = render({ class: 'a b' });
  flushSync();
  const container = r.target.firstElementChild!;
  expect(classesOf(container), 'applied before the map exists').toEqual(['a', 'b']);

  const map = await mapOf(r);
  expect(map.getContainer()).toBe(container);
  // MapLibre adds `maplibregl-map`, and `maplibregl-crosshair` during a box zoom.
  container.classList.add('maplibregl-crosshair');
  expect(classesOf(container)).toEqual(['a', 'b', 'maplibregl-crosshair', 'maplibregl-map']);

  r.props.class = 'b c';
  flushSync();
  expect(classesOf(container)).toEqual(['b', 'c', 'maplibregl-crosshair', 'maplibregl-map']);

  r.props.class = undefined;
  flushSync();
  expect(classesOf(container)).toEqual(['maplibregl-crosshair', 'maplibregl-map']);

  r.props.class = 'd';
  flushSync();
  expect(classesOf(container)).toEqual(['d', 'maplibregl-crosshair', 'maplibregl-map']);

  // A blank class, as `class="{a} {b}"` gives when both are empty.
  r.props.class = '  ';
  flushSync();
  expect(classesOf(container)).toEqual(['maplibregl-crosshair', 'maplibregl-map']);
});

test('a reused map’s container carries MapLibre’s classes and the new class only', async () => {
  const first = render({ reuseMaps: true, class: 'old shared' });
  const firstMap = await mapOf(first);
  first.unmount();

  const second = render({ reuseMaps: true, class: 'new shared' });
  const secondMap = await mapOf(second);
  expect(secondMap.getMap()).toBe(firstMap.getMap());
  expect(classesOf(secondMap.getContainer())).toEqual(['maplibregl-map', 'new', 'shared']);

  second.props.class = 'newer';
  flushSync();
  expect(classesOf(secondMap.getContainer())).toEqual(['maplibregl-map', 'newer']);

  // Parked with a blank class, as `class="{a} {b}"` gives when both are empty.
  second.props.class = '  ';
  flushSync();
  second.unmount();
  const third = render({ reuseMaps: true, class: 'third' });
  const thirdMap = await mapOf(third);
  expect(thirdMap.getMap()).toBe(firstMap.getMap());
  expect(classesOf(thirdMap.getContainer())).toEqual(['maplibregl-map', 'third']);
});

test('style changes keep MapLibre’s container styling', async () => {
  const r = render({ style: 'color: rgb(1, 2, 3)' });
  const map = await mapOf(r);
  const container = map.getContainer();
  expect(container.style.color).toBe('rgb(1, 2, 3)');

  r.props.style = 'color: rgb(4, 5, 6)';
  flushSync();

  expect(container.style.color).toBe('rgb(4, 5, 6)');
  expect(container.style.position).toBe('relative');
  // MapLibre styles its container through `maplibregl-map` (overflow: hidden) and its own
  // child elements, never through the container's inline style.
  expect(container.classList.contains('maplibregl-map')).toBe(true);
  expect(getComputedStyle(container).overflow).toBe('hidden');
  expect(container.querySelector('.maplibregl-canvas-container')).not.toBeNull();
});

test('zoom={undefined} is uncontrolled', async () => {
  const r = render({ zoom: undefined });
  const map = await loadedMapOf(r);

  map.zoomTo(8, { duration: 0 });

  expect(map.getZoom()).toBe(8);
});

test('initialViewState.bounds', async () => {
  const bounds: [[number, number], [number, number]] = [
    [-10, -10],
    [10, 10],
  ];
  const r = render({ initialViewState: { bounds } });
  const map = await loadedMapOf(r);

  const center = map.getCenter();
  expect(Math.abs(center.lng)).toBeLessThan(1e-6);
  expect(Math.abs(center.lat)).toBeLessThan(1e-6);
  // The default camera is centred on (0, 0) too: the zoom is what shows the bounds were fitted.
  expect(map.getZoom()).toBeCloseTo(map.cameraForBounds(bounds)!.zoom!, 6);
});

test('controlled size', async () => {
  const r = render({});
  const map = await loadedMapOf(r);
  const resize = vi.spyOn(map.getMap(), 'resize');
  const camera = cameraOf(map);

  // The container is 400×300.
  r.props.viewState = { ...camera, width: 300, height: 200 };
  flushSync();
  expect(resize).toHaveBeenCalledTimes(1);

  r.props.viewState = { ...camera, width: 400, height: 300 };
  flushSync();
  expect(resize).toHaveBeenCalledTimes(1);
});

test('settings, handlers, cursor, style', async () => {
  const r = render({ mapStyle: EMPTY_STYLE });
  const map = await loadedMapOf(r);

  Object.assign(r.props, {
    maxBounds: [
      [-10, -10],
      [10, 10],
    ],
    renderWorldCopies: false,
    scrollZoom: false,
    cursor: 'crosshair',
    mapStyle: backgroundStyle('#f00'),
  });
  flushSync();
  await waitForStyleLoad(map.getMap());

  expect(map.getMaxBounds()?.toArray()).toEqual([
    [-10, -10],
    [10, 10],
  ]);
  expect(map.getRenderWorldCopies()).toBe(false);
  // The handlers are properties, which a MapRef doesn't carry (it binds methods only).
  expect(map.getMap().scrollZoom.isEnabled()).toBe(false);
  expect(map.getCanvas().style.cursor).toBe('crosshair');
  expect(map.getLayer('bg')).toBeDefined();
});

test('style components survive a style swap', async () => {
  const r = render({
    mapStyle: EMPTY_STYLE,
    // A full reload, so the swap goes through `style.load`.
    styleDiffing: false,
    light: { anchor: 'map', intensity: 0.2 },
    sky: { 'sky-color': '#00f' },
  });
  const map = await loadedMapOf(r);
  expect(map.getLight().intensity).toBe(0.2);

  const styleLoad = waitForEvent(map.getMap(), 'style.load');
  r.props.mapStyle = backgroundStyle('#f00');
  flushSync();
  await styleLoad;

  expect(map.getLayer('bg'), 'the style was swapped').toBeDefined();
  expect(map.getLight().intensity).toBe(0.2);
  expect(map.getSky()['sky-color']).toBe('#00f');

  r.props.light = { anchor: 'map', intensity: 0.7 };
  flushSync();
  expect(map.getLight().intensity).toBe(0.7);
});

test('terrain waits for its source', async () => {
  // Watches the call itself: `setTerrain` throws for a missing source, but MapLibre 5.24 loads
  // an inline style in a promise whose `.catch(() => {})` (meant for aborts) swallows a throw
  // from a `style.load` listener, so no `error` event or uncaught error would show it.
  const setTerrain = vi.spyOn(maplibregl.Map.prototype, 'setTerrain');
  const onError = vi.fn();
  const r = render({ mapStyle: EMPTY_STYLE, terrain: { source: 'dem' }, onError });
  const map = await loadedMapOf(r);
  await sleep(50);

  expect(setTerrain.mock.calls.filter(([options]) => options?.source === 'dem')).toEqual([]);
  expect(map.getTerrain()).toBeNull();
  expect(onError).not.toHaveBeenCalled();
});

test('one forced redraw per flush', async () => {
  const r = render({ mapStyle: EMPTY_STYLE, longitude: 0, latitude: 0, zoom: 3 });
  const map = await loadedMapOf(r);
  let renders = 0;
  map.on('render', () => renders++);

  // Wide enough that MapLibre's bounds constraint leaves the centre free to move to 5.
  Object.assign(r.props, {
    maxBounds: [
      [-60, -60],
      [60, 60],
    ],
    renderWorldCopies: false,
    longitude: 5,
  });
  flushSync();
  expect(renders, 'no render inside the flush').toBe(0);
  await Promise.resolve();

  expect(renders).toBe(1);
  expect(map.getCenter().lng).toBe(5);
});

test('the forced redraw lands before the next animation frame', async () => {
  const r = render({ mapStyle: EMPTY_STYLE });
  const map = await loadedMapOf(r);
  // Let the frames that follow `load` settle, so no MapLibre frame is already queued.
  await sleep(100);
  const order: string[] = [];
  map.on('render', () => order.push('render'));
  const frame = new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      order.push('frame');
      resolve();
    });
  });

  r.props.renderWorldCopies = false;
  flushSync();
  await frame;

  expect(order.slice(0, 2)).toEqual(['render', 'frame']);
});

test('zoom limits changed together never pass through min > max', async () => {
  const onError = vi.fn();
  const r = render({ mapStyle: EMPTY_STYLE, minZoom: 0, maxZoom: 8, onError });
  const map = await loadedMapOf(r);

  r.props.minZoom = 10;
  r.props.maxZoom = 15;
  expect(() => flushSync()).not.toThrow();

  expect(onError).not.toHaveBeenCalled();
  expect(map.getMinZoom()).toBe(10);
  expect(map.getMaxZoom()).toBe(15);
});

test('pitch limits changed together never pass through min > max', async () => {
  const onError = vi.fn();
  const r = render({ mapStyle: EMPTY_STYLE, minPitch: 0, maxPitch: 30, onError });
  const map = await loadedMapOf(r);

  r.props.minPitch = 40;
  r.props.maxPitch = 60;
  expect(() => flushSync()).not.toThrow();

  expect(onError).not.toHaveBeenCalled();
  expect(map.getMinPitch()).toBe(40);
  expect(map.getMaxPitch()).toBe(60);
});

test('unmounted while mapLib is still loading', async () => {
  let resolveLib!: (lib: MapLib) => void;
  const mapLib = new Promise<MapLib>((resolve) => (resolveLib = resolve));
  const onLoad = vi.fn();
  const consoleError = vi.spyOn(console, 'error');
  const r = render({ mapLib, onLoad });
  flushSync();
  const container = r.target.firstElementChild as HTMLElement;

  r.unmount();
  resolveLib(maplibregl as unknown as MapLib);
  await sleep(50);

  expect(onLoad).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();
  expect(container.querySelector('canvas')).toBeNull();
});

test('mapLib load failure goes to onError', async () => {
  const onError = vi.fn<(e: ErrorEvent) => void>();
  render({ mapLib: Promise.reject(new Error('boom')), onError });
  flushSync();
  await sleep(0);

  expect(onError).toHaveBeenCalledOnce();
  const event = onError.mock.calls[0][0];
  expect(event.type).toBe('error');
  // Upstream's payload: there is no map to be the target, and no input event.
  expect(event.target).toBeNull();
  expect(event.originalEvent).toBeNull();
  expect(event.error.message).toBe('boom');
});

test('mapLib load failure goes to console.error without onError', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const error = new Error('boom');
  render({ mapLib: Promise.reject(error) });
  flushSync();
  await sleep(0);

  expect(consoleError).toHaveBeenCalledExactlyOnceWith(error);
});

test('reuseMaps', async () => {
  const first = render({ reuseMaps: true });
  const firstMap = await loadedMapOf(first);
  const canvas = firstMap.getCanvas();
  first.unmount();

  const onLoad = vi.fn();
  const second = render({ reuseMaps: true, onLoad });
  const secondMap = await mapOf(second);

  expect(second.target.contains(canvas)).toBe(true);
  expect(secondMap.getCanvas()).toBe(canvas);
  await vi.waitFor(() => expect(onLoad).toHaveBeenCalledOnce());
});

test('reuse applies props that changed while the map was parked', async () => {
  const first = render({ reuseMaps: true, cursor: 'pointer', renderWorldCopies: false });
  const map = await loadedMapOf(first);
  first.unmount();

  // A parent that stays mounted (`{#if show}<Map {cursor} … />{/if}`) keeps the parked map's
  // props live. Model it by mounting the next <Map> on the same props object.
  first.props.cursor = 'wait';
  first.props.renderWorldCopies = true;
  const second = mountFixture(first.props);
  const secondMap = await mapOf(second);
  expect(secondMap.getMap()).toBe(map.getMap());

  expect(secondMap.getCanvas().style.cursor).toBe('wait');
  expect(secondMap.getRenderWorldCopies()).toBe(true);
});

test('reuse applies a prop that changed in the flush that unmounted the map', async () => {
  const first = render({ reuseMaps: true, cursor: 'pointer' });
  const map = await loadedMapOf(first);

  // The cursor effect never runs: the component is gone before the next flush. Recycling still
  // records 'pointer', because Svelte's teardown reads values as of the last flush.
  first.props.cursor = 'wait';
  first.unmount();
  const second = mountFixture(first.props);
  const secondMap = await mapOf(second);
  expect(secondMap.getMap()).toBe(map.getMap());

  expect(secondMap.getCanvas().style.cursor).toBe('wait');
});

test('gl prop renders into the given context', async () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  const gl = document
    .createElement('canvas')
    .getContext('webgl2') as unknown as WebGLRenderingContext;
  const r = render({ gl });
  const map = await mapOf(r);

  expect(HTMLCanvasElement.prototype.getContext).toBe(getContext);
  // Private: the only way to see which context MapLibre renders into.
  const painter = (map.getMap() as unknown as { painter: { context: { gl: unknown } } }).painter;
  expect(painter.context.gl).toBe(gl);
});

test('bind:this exposes the MapRef', async () => {
  const r = render({});
  const ref = await mapOf(r);

  expect(ref.getMap()).toBeInstanceOf(maplibregl.Map);
});

test('registers with the mounted maps context', async () => {
  const onMapMount = vi.fn();
  const onMapUnmount = vi.fn();
  const mountedMaps: MountedMapsContextValue = {
    maps: new globalThis.Map(),
    onMapMount,
    onMapUnmount,
  };
  const r = render({ id: 'mymap' }, new globalThis.Map([[MOUNTED_MAPS_CONTEXT_KEY, mountedMaps]]));
  const ref = await mapOf(r);

  expect(onMapMount).toHaveBeenCalledExactlyOnceWith(ref, 'mymap');
  expect(onMapUnmount).not.toHaveBeenCalled();

  r.unmount();
  expect(onMapUnmount).toHaveBeenCalledExactlyOnceWith('mymap');
});

test('the first run of each effect makes no MapLibre call when nothing differs', async () => {
  const spies: Record<string, MockInstance> = {};
  const watched = [
    'setMaxBounds',
    'setRenderWorldCopies',
    'setProjection',
    'setMinZoom',
    'setMaxZoom',
    'setMinPitch',
    'setMaxPitch',
    'setStyle',
    'jumpTo',
    'resize',
    'redraw',
  ] as const;
  // Spies on the instance right after construction, before the effects first run.
  class WatchedMap extends maplibregl.Map {
    constructor(options: MapOptions) {
      super(options);
      for (const name of watched) {
        spies[name] = vi.spyOn(this as maplibregl.Map, name);
      }
      spies['scrollZoom.disable'] = vi.spyOn(this.scrollZoom, 'disable');
    }
  }
  const r = render({
    mapLib: { ...maplibregl, Map: WatchedMap } as unknown as MapLib,
    mapStyle: backgroundStyle('#0f0'),
    maxBounds: [
      [-30, -30],
      [30, 30],
    ],
    renderWorldCopies: false,
    minZoom: 1,
    maxZoom: 12,
    minPitch: 0,
    maxPitch: 40,
    longitude: 1,
    latitude: 2,
    zoom: 3,
    cursor: 'pointer',
    scrollZoom: false,
  });
  const map = await loadedMapOf(r);
  flushSync();

  expect(map.getMap()).toBeInstanceOf(WatchedMap);
  const called = Object.keys(spies).filter((name) => spies[name].mock.calls.length > 0);
  expect(called).toEqual([]);
});
