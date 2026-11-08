import type { LayerSpecification, Map as MapLibreMap } from 'maplibre-gl';
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import FullTreeFixture from '../test-fixtures/full-tree-fixture.svelte';
import { settle } from '../test-fixtures/source-layer-harness.svelte';
import { createContainer, sleep } from '../test-utils/map-test-utils';

// The whole-tree teardown (Review Focus 5): a map with a Source, Layers, a Marker, a Popup and
// controls is unmounted in one go. Svelte tears the children down before the map, the reverse of
// React, so every component's cleanup runs while its map is still alive.

// Attached before anything mounts, so nothing thrown during the mount or the teardown is missed.
let uncaught: string[] = [];
const onWindowError = (e: ErrorEvent) => {
  uncaught.push(e.message);
};
const onRejection = (e: PromiseRejectionEvent) => {
  uncaught.push(String(e.reason));
};

// Headless Chromium caps live WebGL contexts: every tree is unmounted after each test.
const trees: { unmount(): void; target: HTMLElement }[] = [];

beforeEach(() => {
  uncaught = [];
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onRejection);
  vi.spyOn(console, 'error');
});

afterEach(() => {
  for (const tree of trees.splice(0)) {
    tree.unmount();
    tree.target.remove();
  }
  window.removeEventListener('error', onWindowError);
  window.removeEventListener('unhandledrejection', onRejection);
  vi.restoreAllMocks();
});

/** Mounts the whole tree and waits until the map has rendered everything and gone idle. */
async function mountTree() {
  const onClose = vi.fn();
  const target = createContainer();
  const fixture = mount(FullTreeFixture, { target, props: { onClose } });
  let mounted = true;
  const tree = {
    fixture,
    target,
    onClose,
    unmount() {
      if (mounted) {
        mounted = false;
        void unmount(fixture);
        flushSync();
      }
    },
  };
  trees.push(tree);

  await vi.waitFor(() => expect(fixture.getMapRef(), 'the map is created').toBeTruthy(), {
    timeout: 5000,
  });
  const map = fixture.getMapRef()!.getMap();
  await vi.waitFor(
    () => {
      expect(map.getLayer('nested'), 'nested layer').toBeTruthy();
      expect(map.getLayer('flat'), 'flat layer').toBeTruthy();
      expect(fixture.getPopup()?.isOpen(), 'popup is open').toBe(true);
    },
    { timeout: 5000, interval: 10 },
  );
  await settle(map);
  return { ...tree, map };
}

/** Records what the DOM and the style hold at the moment the map is removed. */
function recordAtRemoval(map: MapLibreMap, container: HTMLElement) {
  const record = {
    removals: 0,
    layers: ['not recorded'],
    sources: ['not recorded'],
    markers: -1,
    popups: -1,
    zoomButtons: -1,
    scales: -1,
  };
  const remove = map.remove.bind(map);
  vi.spyOn(map, 'remove').mockImplementation(() => {
    record.removals++;
    record.layers = map.getStyle().layers.map((layer: LayerSpecification) => layer.id);
    record.sources = Object.keys(map.getStyle().sources);
    record.markers = container.querySelectorAll('.maplibregl-marker').length;
    record.popups = container.querySelectorAll('.maplibregl-popup').length;
    record.zoomButtons = container.querySelectorAll('.maplibregl-ctrl-zoom-in').length;
    record.scales = container.querySelectorAll('.maplibregl-ctrl-scale').length;
    remove();
  });
  return record;
}

test('a whole map tree unmounted at once: no error, no onClose, nothing left behind', async () => {
  const tree = await mountTree();
  const container = tree.target.querySelector<HTMLElement>('.maplibregl-map')!;

  // What the unmount has to undo is there to begin with.
  expect(container.querySelector('canvas'), 'canvas exists before').toBeTruthy();
  expect(tree.map.getSource('pts'), 'source exists before').toBeTruthy();
  expect(container.querySelector('.maplibregl-marker'), 'marker exists before').toBeTruthy();
  expect(container.querySelector('.maplibregl-popup'), 'popup exists before').toBeTruthy();
  expect(
    container.querySelector('.maplibregl-ctrl-zoom-in'),
    'navigation exists before',
  ).toBeTruthy();
  expect(container.querySelector('.maplibregl-ctrl-scale'), 'scale exists before').toBeTruthy();
  expect(console.error, 'nothing logged while mounting').not.toHaveBeenCalled();
  expect(uncaught, 'nothing thrown while mounting').toEqual([]);

  const atRemoval = recordAtRemoval(tree.map, container);
  tree.unmount();
  // Late callbacks: the Source's deferred style check, MapLibre's workers and observers.
  await sleep(300);

  expect(uncaught, 'no uncaught error').toEqual([]);
  expect(console.error, 'nothing logged').not.toHaveBeenCalled();
  expect(tree.onClose, 'the popup was not closed by unmounting').not.toHaveBeenCalled();
  expect(container.querySelector('canvas'), 'the map is removed').toBeNull();

  // Each component cleaned up after itself while the map was still alive, rather than leaving
  // it to `map.remove()`.
  expect(atRemoval.removals, 'the map is removed once').toBe(1);
  expect(atRemoval.layers, 'layers removed first').toEqual([]);
  expect(atRemoval.sources, 'source removed first').toEqual([]);
  expect(atRemoval.markers, 'marker removed first').toBe(0);
  expect(atRemoval.popups, 'popup removed first').toBe(0);
  expect(atRemoval.zoomButtons, 'navigation control removed first').toBe(0);
  expect(atRemoval.scales, 'scale control removed first').toBe(0);
});

test('the popup onClose spy is called when the popup closes itself', async () => {
  // A positive control for the test above, which asserts the spy was not called.
  const tree = await mountTree();

  tree.fixture.getPopup()!.remove();

  expect(tree.onClose).toHaveBeenCalledTimes(1);
});
