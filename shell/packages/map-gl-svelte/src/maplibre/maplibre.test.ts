import maplibregl from 'maplibre-gl';
import { afterEach, expect, test, vi } from 'vitest';
import {
  EMPTY_STYLE,
  createContainer,
  waitForEvent,
  waitForLoad,
} from '../test-utils/map-test-utils';
import type { MapLayerMouseEvent, ViewStateChangeEvent } from '../types/events';
import Maplibre, { type MaplibreProps } from './maplibre';

const { Point } = maplibregl;

// Headless Chromium caps live WebGL contexts, so every map a test creates is removed afterwards.
const created: Maplibre[] = [];

function create(props: MaplibreProps): Maplibre {
  const instance = new Maplibre(maplibregl.Map, props, createContainer());
  created.push(instance);
  return instance;
}

afterEach(() => {
  Maplibre.savedMaps.splice(0);
  for (const instance of created.splice(0)) {
    const container = instance.map.getContainer();
    instance.destroy();
    container.remove();
  }
});

test('creates the map from initialViewState', () => {
  const m = create({
    mapStyle: EMPTY_STYLE,
    initialViewState: { longitude: -100, latitude: 40, zoom: 4 },
  });
  const center = m.map.getCenter();
  expect(center.lng).toBeCloseTo(-100, 6);
  expect(center.lat).toBeCloseTo(40, 6);
  expect(m.map.getZoom()).toBe(4);
});

test('camera hook enforces controlled fields and reports the proposal', () => {
  const onMove = vi.fn<(e: ViewStateChangeEvent) => void>();
  const m = create({ mapStyle: EMPTY_STYLE, longitude: -100, latitude: 40, zoom: 4, onMove });

  m.map.jumpTo({ zoom: 10 });

  expect(m.map.getZoom()).toBe(4);
  expect(onMove).toHaveBeenCalled();
  expect(onMove.mock.lastCall?.[0].viewState.zoom).toBe(10);
});

test('undefined camera fields stay free', () => {
  const m = create({ mapStyle: EMPTY_STYLE, zoom: undefined });

  m.map.jumpTo({ zoom: 10 });

  expect(m.map.getZoom()).toBe(10);
});

test('external camera writes are silent', () => {
  const onMove = vi.fn();
  const onZoom = vi.fn();
  const props: MaplibreProps = {
    mapStyle: EMPTY_STYLE,
    longitude: -100,
    latitude: 40,
    zoom: 4,
    onMove,
    onZoom,
  };
  const m = create(props);

  props.zoom = 6;
  expect(m.updateViewState()).toBe(true);
  expect(m.map.getZoom()).toBe(6);
  expect(onMove).not.toHaveBeenCalled();
  expect(onZoom).not.toHaveBeenCalled();

  // Nothing left to apply.
  expect(m.updateViewState()).toBe(false);
});

test('camera props are not applied while moving', async () => {
  const props: MaplibreProps = { mapStyle: EMPTY_STYLE, initialViewState: { zoom: 4 } };
  const m = create(props);
  await waitForLoad(m.map);

  // `essential` keeps the animation even if the browser asks for reduced motion.
  m.map.easeTo({ zoom: 8, duration: 200, essential: true });
  expect(m.map.isMoving()).toBe(true);

  props.zoom = 6;
  expect(m.updateViewState()).toBe(false);
  expect(m.map.getZoom()).not.toBe(6);
  expect(m.map.isMoving()).toBe(true);
  m.map.stop();
});

test('dispatches to the current callback', () => {
  const a = vi.fn(),
    b = vi.fn();
  const props: MaplibreProps = { mapStyle: EMPTY_STYLE };
  const m = new Maplibre(maplibregl.Map, props, createContainer());
  created.push(m);
  m.map.fire('click', { point: new Point(1, 1) }); // undefined callback: nothing to call, nothing thrown
  props.onClick = a;
  m.map.fire('click', { point: new Point(1, 1) });
  props.onClick = b;
  m.map.fire('click', { point: new Point(1, 1) });
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
});

test('unhandled error goes to console.error', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const props: MaplibreProps = { mapStyle: EMPTY_STYLE };
    const m = create(props);
    const error = new Error('boom');

    m.map.fire('error', { error });
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(error);

    // With an onError callback the error goes there instead.
    consoleError.mockClear();
    const onError = vi.fn();
    props.onError = onError;
    m.map.fire('error', { error });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.lastCall?.[0].error).toBe(error);
    expect(consoleError).not.toHaveBeenCalled();
  } finally {
    consoleError.mockRestore();
  }
});

test('interactiveLayerIds attaches features and synthesises hover', async () => {
  // The wrapper deletes `features` and restores `type` once the callback returns, so the
  // callback records them while it runs.
  const seen: { type: string; features: number | undefined }[] = [];
  const record = (e: MapLayerMouseEvent): void => {
    seen.push({ type: e.type, features: e.features?.length });
  };
  const onMouseEnter = vi.fn(record);
  const onMouseLeave = vi.fn(record);
  const onError = vi.fn();
  const props: MaplibreProps = { mapStyle: EMPTY_STYLE, onError };
  const m = create(props);
  await waitForLoad(m.map);

  const center = m.map.getCenter();
  m.map.addSource('pts', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
      properties: {},
    },
  });
  m.map.addLayer({ id: 'pts', type: 'circle', source: 'pts' });
  props.interactiveLayerIds = ['pts', 'not-in-style'];
  props.onMouseEnter = onMouseEnter;
  props.onMouseLeave = onMouseLeave;
  await waitForEvent(m.map, 'idle');

  m.map.fire('mousemove', {
    point: m.map.project(center),
    lngLat: center,
    originalEvent: new MouseEvent('mousemove'),
  });
  expect(onMouseEnter).toHaveBeenCalledOnce();
  expect(onMouseLeave).not.toHaveBeenCalled();
  expect(seen).toEqual([{ type: 'mouseenter', features: 1 }]);

  m.map.fire('mousemove', {
    point: new Point(0, 0),
    lngLat: m.map.unproject([0, 0]),
    originalEvent: new MouseEvent('mousemove'),
  });
  expect(onMouseLeave).toHaveBeenCalledOnce();
  expect(onMouseEnter).toHaveBeenCalledOnce();
  expect(seen.at(-1)?.type).toBe('mouseleave');

  // 'not-in-style' was skipped, not queried.
  expect(onError).not.toHaveBeenCalled();
});

test('requestRedraw renders once per microtask', async () => {
  const m = create({ mapStyle: EMPTY_STYLE });
  await waitForLoad(m.map);
  const onRender = vi.fn();
  m.map.on('render', onRender);

  m.requestRedraw();
  m.requestRedraw();
  m.requestRedraw();
  expect(onRender).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(onRender).toHaveBeenCalledOnce();

  // The next microtask may redraw again.
  m.requestRedraw();
  await Promise.resolve();
  expect(onRender).toHaveBeenCalledTimes(2);
});

test('requestRedraw leaves a destroyed map alone', async () => {
  const m = new Maplibre(maplibregl.Map, { mapStyle: EMPTY_STYLE }, createContainer());
  const container = m.map.getContainer();
  const redraw = vi.spyOn(m.map, 'redraw');

  m.requestRedraw();
  m.destroy();
  container.remove();
  await Promise.resolve();

  expect(redraw).not.toHaveBeenCalled();
});

test('reuse() adopts the new container and the new live props', async () => {
  expect(Maplibre.reuse({ mapStyle: EMPTY_STYLE }, createContainer())).toBeNull();

  const oldOnClick = vi.fn();
  const first = create({ mapStyle: EMPTY_STYLE, onClick: oldOnClick });
  await waitForLoad(first.map);
  const oldContainer = first.map.getContainer();
  const canvas = first.map.getCanvas();
  const children = document.createElement('div');
  children.setAttribute('mapboxgl-children', '');
  oldContainer.appendChild(children);

  first.recycle();
  expect(children.isConnected).toBe(false);
  expect(Maplibre.savedMaps).toEqual([first]);

  const onClick = vi.fn();
  const onLoad = vi.fn();
  const props: MaplibreProps = {
    mapStyle: EMPTY_STYLE,
    cursor: 'pointer',
    initialViewState: { longitude: 10, latitude: 20, zoom: 3 },
    onClick,
    onLoad,
  };
  const container = createContainer();
  const reused = Maplibre.reuse(props, container);

  expect(reused).toBe(first);
  expect(Maplibre.savedMaps).toEqual([]);
  expect(first.props).toBe(props);
  expect(first.map.getContainer()).toBe(container);
  expect(container.contains(canvas)).toBe(true);
  expect(oldContainer.childNodes.length).toBe(0);
  // Props are synced against the previous ones, and initialViewState is applied.
  expect(canvas.style.cursor).toBe('pointer');
  expect(first.map.getCenter().lng).toBeCloseTo(10, 6);
  expect(first.map.getCenter().lat).toBeCloseTo(20, 6);
  expect(first.map.getZoom()).toBe(3);
  // The style is loaded, so the synthetic load fires at once, to the new props.
  expect(onLoad).toHaveBeenCalledOnce();

  first.map.fire('click', { point: new Point(1, 1) });
  expect(onClick).toHaveBeenCalledOnce();
  expect(oldOnClick).not.toHaveBeenCalled();
  oldContainer.remove();
});
