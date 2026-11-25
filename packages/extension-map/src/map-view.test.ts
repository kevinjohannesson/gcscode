// Runs in headless Chromium (vitest.config.ts, the `browser` project): real
// MapLibre, driven through map-gl-svelte, so what these tests pin is what the
// operator would see the map do. No test touches the network: the basemap is
// swapped for an empty style below.
import type maplibregl from 'maplibre-gl';
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';

import { setHost } from './host-store';
import { mapApi } from './map-api.svelte';
import MapView from './map-view.svelte';
import { bridge, FIXTURE_LAYER_ID, FIXTURE_SOURCE_ID } from './test-fixtures/bridge-harness';
import MarkerLayer from './test-fixtures/marker-layer.svelte';
import ProbeControl from './test-fixtures/probe-control.svelte';
import ProbeLayer from './test-fixtures/probe-layer.svelte';
import SourceLayer from './test-fixtures/source-layer.svelte';

vi.mock('./basemap', () => ({ TILE_STYLE: { version: 8, sources: {}, layers: [] } }));

const INITIAL_CAMERA = {
  center: [149.17, -35.36] as [number, number],
  zoom: 13,
  pitch: 0,
  bearing: 0,
};

function resetCamera(): void {
  mapApi.camera.center = [...INITIAL_CAMERA.center];
  mapApi.camera.zoom = INITIAL_CAMERA.zoom;
  mapApi.camera.pitch = INITIAL_CAMERA.pitch;
  mapApi.camera.bearing = INITIAL_CAMERA.bearing;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Resolves once `ready()` holds, polling every 10 ms for up to 5 s. */
async function until(ready: () => boolean, what: string): Promise<void> {
  for (let i = 0; !ready(); i++) {
    if (i > 500) throw new Error(`timed out waiting for ${what}`);
    await sleep(10);
  }
}

type View = { target: HTMLDivElement; unmount(): void };
const views: View[] = [];
const registrations: Disposable[] = [];

function register(disposable: Disposable): Disposable {
  registrations.push(disposable);
  return disposable;
}

/** Mounts the map view in a 400×300 box, as a dock panel would. */
function mountView(): View {
  const target = document.createElement('div');
  target.style.width = '400px';
  target.style.height = '300px';
  document.body.appendChild(target);
  const instance = mount(MapView, { target });
  let mounted = true;
  const view: View = {
    target,
    unmount() {
      if (!mounted) return;
      mounted = false;
      unmount(instance);
      target.remove();
    },
  };
  views.push(view);
  return view;
}

/** The raw map, as a registered layer reads it through the bridge. */
async function rawMap(): Promise<maplibregl.Map> {
  await until(() => !!bridge.layerGetter?.(), 'the map to exist');
  return bridge.layerGetter!()!;
}

async function loadedMap(): Promise<maplibregl.Map> {
  const map = await rawMap();
  await until(() => map.isStyleLoaded() === true, 'the style to load');
  return map;
}

function fakeHost(executeCommand = vi.fn(() => Promise.resolve())): ExtensionHost {
  return { commands: { executeCommand } } as unknown as ExtensionHost;
}

beforeEach(() => {
  resetCamera();
  bridge.layerGetter = undefined;
  bridge.controlContext = undefined;
  register(mapApi.registerLayer(ProbeLayer));
});

afterEach(() => {
  for (const view of views.splice(0)) view.unmount();
  for (const registration of registrations.splice(0)) registration.dispose();
  vi.restoreAllMocks();
  resetCamera();
});

describe('MapView camera', () => {
  it('opens where MapApi.camera says', async () => {
    mountView();
    const map = await rawMap();

    expect([map.getCenter().lng, map.getCenter().lat]).toEqual(INITIAL_CAMERA.center);
    expect([map.getZoom(), map.getPitch(), map.getBearing()]).toEqual([13, 0, 0]);
  });

  it('moves the map when another extension writes the camera', async () => {
    mountView();
    const map = await rawMap();

    mapApi.camera.center = [151.21, -33.87];
    mapApi.camera.zoom = 15;
    mapApi.camera.pitch = 30;
    mapApi.camera.bearing = 90;
    flushSync();

    expect(map.getCenter().lng).toBeCloseTo(151.21, 6);
    expect(map.getCenter().lat).toBeCloseTo(-33.87, 6);
    expect([map.getZoom(), map.getPitch(), map.getBearing()]).toEqual([15, 30, 90]);
  });

  it('writes a move of the map back to MapApi.camera', async () => {
    mountView();
    const map = await rawMap();

    // What a scroll zoom or a keyboard pan ends in: MapLibre moving its own
    // camera. Controlled, the move reaches the map only through the camera.
    map.jumpTo({ center: [149.2, -35.37], zoom: 14 });
    flushSync();

    expect(mapApi.camera.center[0]).toBeCloseTo(149.2, 6);
    expect(mapApi.camera.center[1]).toBeCloseTo(-35.37, 6);
    expect(mapApi.camera.zoom).toBe(14);
    expect(map.getZoom()).toBe(14);
  });

  it("follows the operator's whole drag, which no camera write stops", async () => {
    mountView();
    const map = await loadedMap();
    const canvas = map.getCanvas();
    const box = canvas.getBoundingClientRect();
    const start = { x: box.left + 200, y: box.top + 150 };
    const startCenter = map.getCenter();
    // How far right of the canvas's centre the ground under the start now is.
    const dragged = (): number => map.project(startCenter).x - 200;

    const mouse = (type: string, x: number): void => {
      // MapLibre takes the press and release on its canvas and the moves on
      // the document, as a real drag delivers them.
      const target = type === 'mousemove' ? document : canvas;
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          clientX: x,
          clientY: start.y,
          button: 0,
          buttons: type === 'mouseup' ? 0 : 1,
        }),
      );
    };
    mouse('mousedown', start.x);
    for (let step = 1; step <= 12; step++) {
      mouse('mousemove', start.x + step * 10);
      await nextFrame();
      flushSync();
    }

    // MapLibre starts the drag on the first move past its click tolerance and
    // pans from there, so twelve 10 px moves drag the ground 110 px. A drag
    // stopped after its first frame would have dragged it 10 px at most.
    expect(dragged()).toBeCloseTo(110, 0);

    mouse('mouseup', start.x + 120);
    await until(() => !map.isMoving(), 'the inertia to settle');
    flushSync();

    // Released, the map eases on in the drag's direction and comes to rest
    // where MapApi.camera says.
    expect(dragged()).toBeGreaterThanOrEqual(110);
    expect(mapApi.camera.center).toEqual([map.getCenter().lng, map.getCenter().lat]);
  });

  it('moves the map back when a writer sets the camera the operator moved away from', async () => {
    // The Recenter button writes the drone's position, which is often where
    // the camera was before the operator moved it.
    mountView();
    const map = await rawMap();
    map.jumpTo({ center: [149.2, -35.37] });
    flushSync();

    mapApi.camera.center = [...INITIAL_CAMERA.center];
    flushSync();

    expect(map.getCenter().lng).toBeCloseTo(INITIAL_CAMERA.center[0], 6);
    expect(map.getCenter().lat).toBeCloseTo(INITIAL_CAMERA.center[1], 6);
  });
});

describe('MapView controls', () => {
  it("runs a button control's command, and its clicks never reach the canvas", async () => {
    const executeCommand = vi.fn(() => Promise.resolve());
    setHost(fakeHost(executeCommand));
    register(
      mapApi.registerControl({
        id: 'test.recenter',
        position: 'top-right',
        icon: { kind: 'lucide', name: 'crosshair' },
        tooltip: 'Recenter',
        commandId: 'test.recenter',
      }),
    );
    const { target } = mountView();
    const map = await loadedMap();
    const onMapPointer = vi.fn();
    for (const type of ['mousedown', 'mouseup', 'click'] as const) map.on(type, onMapPointer);
    await until(() => !!target.querySelector('button[title="Recenter"]'), 'the control');
    const button = target.querySelector<HTMLButtonElement>('button[title="Recenter"]')!;
    const box = button.getBoundingClientRect();
    const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    // What a real click at the button's centre lands on: the button, not the
    // canvas underneath.
    const hit = document.elementFromPoint(at.clientX, at.clientY)!;
    expect(button.contains(hit)).toBe(true);

    for (const type of ['mousedown', 'mouseup', 'click']) {
      hit.dispatchEvent(new MouseEvent(type, { bubbles: true, button: 0, ...at }));
    }

    expect(executeCommand).toHaveBeenCalledWith('test.recenter');
    expect(onMapPointer).not.toHaveBeenCalled();
  });

  it("does not hand a component control the raw map's context", async () => {
    register(
      mapApi.registerControl({
        id: 'test.probe',
        position: 'bottom-left',
        component: ProbeControl,
      }),
    );
    const { target } = mountView();
    await rawMap();
    await until(() => !!target.querySelector('.probe-control'), 'the component control');

    expect(bridge.controlContext).toBeUndefined();
  });
});

describe('MapView registered layers (the raw-map bridge)', () => {
  it('hands a layer a getter that is null until the map exists, then the map', async () => {
    mountView();
    // ProbeLayer mounted with the view, before the library created the map.
    const getter = bridge.layerGetter!;
    expect(getter()).toBeNull();

    const map = await rawMap();
    expect(getter()).toBe(map);
    expect(map.getContainer().closest('.map-view__canvas')).not.toBeNull();
  });

  it('draws a layer that mounted before the map existed', async () => {
    register(mapApi.registerLayer(MarkerLayer));
    register(mapApi.registerLayer(SourceLayer));
    const { target } = mountView();
    const map = await loadedMap();
    await until(() => !!map.getLayer(FIXTURE_LAYER_ID), 'the source layer');

    expect(target.querySelectorAll('.fixture-marker')).toHaveLength(1);
    expect(map.getSource(FIXTURE_SOURCE_ID)).toBeDefined();
  });
});

describe('MapView teardown (P7)', () => {
  it('leaks no map, marker, source or layer across 100 disable and enable cycles of the map', async () => {
    register(mapApi.registerLayer(MarkerLayer));
    register(mapApi.registerLayer(SourceLayer));

    for (let cycle = 0; cycle < 100; cycle++) {
      bridge.layerGetter = undefined;
      const view = mountView();
      const map = await loadedMap();
      await until(() => !!map.getLayer(FIXTURE_LAYER_ID), `cycle ${cycle}: the source layer`);
      expect(view.target.querySelectorAll('.fixture-marker')).toHaveLength(1);
      // What the map still holds when it is destroyed: each layer must have
      // removed what it drew by then.
      let heldAtRemove: unknown[] | null = null;
      const remove = map.remove.bind(map);
      vi.spyOn(map, 'remove').mockImplementation(() => {
        heldAtRemove = [
          map.getLayer(FIXTURE_LAYER_ID),
          map.getSource(FIXTURE_SOURCE_ID),
          document.querySelectorAll('.fixture-marker').length,
        ];
        remove();
      });

      view.unmount();

      expect(heldAtRemove, `cycle ${cycle}`).toEqual([undefined, undefined, 0]);
      expect(document.querySelectorAll('.maplibregl-map, .map-view')).toHaveLength(0);
    }
  });

  it('leaks no marker, source or layer across 100 disable and enable cycles of a layer extension', async () => {
    const { target } = mountView();
    const map = await loadedMap();

    for (let cycle = 0; cycle < 100; cycle++) {
      const marker = mapApi.registerLayer(MarkerLayer);
      const source = mapApi.registerLayer(SourceLayer);
      flushSync();
      await until(() => !!map.getLayer(FIXTURE_LAYER_ID), `cycle ${cycle}: the source layer`);
      expect(target.querySelectorAll('.fixture-marker')).toHaveLength(1);

      marker.dispose();
      source.dispose();
      flushSync();

      expect(
        [map.getLayer(FIXTURE_LAYER_ID), map.getSource(FIXTURE_SOURCE_ID)],
        `cycle ${cycle}`,
      ).toEqual([undefined, undefined]);
      expect(target.querySelectorAll('.fixture-marker'), `cycle ${cycle}`).toHaveLength(0);
    }
  });
});

describe('MapView when MapLibre cannot start', () => {
  it('shows a one-line notice and logs the reason', async () => {
    // What a browser that refuses WebGL does: MapLibre's constructor throws.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { target } = mountView();

    await until(() => !!target.querySelector('.map-view__notice'), 'the notice');

    expect(target.querySelector('.map-view__notice')?.textContent).toBe('The map could not start.');
    expect(logged).toHaveBeenCalledWith(expect.any(Error));
    expect(target.querySelector('.map-view__controls')).toBeNull();
  });

  it('only logs an error of a running map, such as a failed tile', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { target } = mountView();
    const map = await loadedMap();
    const failure = new Error('tile 13/7484/4993 failed');

    map.fire('error', { error: failure });
    flushSync();

    expect(logged).toHaveBeenCalledWith(failure);
    expect(target.querySelector('.map-view__notice')).toBeNull();
  });
});

describe('MapView fills its panel', () => {
  it('resizes the map when its panel resizes', async () => {
    const { target } = mountView();
    const map = await rawMap();
    expect(map.getCanvas().clientWidth).toBe(400);

    target.style.width = '600px';

    await until(() => map.getCanvas().clientWidth === 600, 'the canvas to follow its panel');
  });

  it('draws no heading of its own: the tab names the map', async () => {
    const { target } = mountView();
    await rawMap();
    expect(target.querySelector('h2')).toBeNull();
  });
});
