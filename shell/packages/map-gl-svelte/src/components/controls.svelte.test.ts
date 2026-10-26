import * as maplibregl from 'maplibre-gl';
import { flushSync } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, renderLoaded, type FixtureProps } from '../test-fixtures/controls-harness.svelte';
import { createContainer } from '../test-utils/map-test-utils';
import type { GeolocateErrorEvent, GeolocateResultEvent } from '../types/events';
import type { MapLib } from '../types/lib';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---- Translated from upstream test/components/controls.spec.jsx (v8.1.3) ----

test('Controls', async () => {
  const r = await renderLoaded({ attribution: {} });
  expect(
    r.target.querySelector('.maplibregl-ctrl-attrib'),
    'Rendered <AttributionControl />',
  ).toBeTruthy();

  r.props.attribution = undefined;
  r.props.fullscreen = {};
  flushSync();
  expect(
    r.target.querySelector('.maplibregl-ctrl-fullscreen'),
    'Rendered <FullscreenControl />',
  ).toBeTruthy();

  r.props.fullscreen = undefined;
  r.props.geolocate = {};
  flushSync();
  expect(
    r.target.querySelector('.maplibregl-ctrl-geolocate'),
    'Rendered <GeolocateControl />',
  ).toBeTruthy();
  // Upstream's ref is the MapLibre control; here it is `getControl()` on the component.
  expect(r.geolocate(), 'GeolocateControl created').toBeTruthy();

  r.props.geolocate = undefined;
  r.props.navigation = {};
  flushSync();
  expect(
    r.target.querySelector('.maplibregl-ctrl-zoom-in'),
    'Rendered <NavigationControl />',
  ).toBeTruthy();

  r.props.navigation = undefined;
  r.props.scale = {};
  flushSync();
  expect(
    r.target.querySelector('.maplibregl-ctrl-scale'),
    'Rendered <ScaleControl />',
  ).toBeTruthy();

  r.unmount();
});

// ---- Svelte-specific ----

/**
 * One row per built-in control: the props that render it, and a selector for something inside
 * its container. The selectors are what MapLibre 5.24 puts in the DOM, written out here rather
 * than read back from the implementation.
 */
const controls = [
  { key: 'attribution', selector: '.maplibregl-ctrl-attrib', props: {} },
  { key: 'fullscreen', selector: '.maplibregl-ctrl-fullscreen', props: {} },
  { key: 'geolocate', selector: '.maplibregl-ctrl-geolocate', props: {} },
  { key: 'globe', selector: '.maplibregl-ctrl-globe', props: {} },
  { key: 'logo', selector: '.maplibregl-ctrl-logo', props: {} },
  { key: 'navigation', selector: '.maplibregl-ctrl-zoom-in', props: {} },
  { key: 'scale', selector: '.maplibregl-ctrl-scale', props: {} },
  { key: 'terrain', selector: '.maplibregl-ctrl-terrain', props: { source: 'dem' } },
] as const satisfies readonly { key: keyof FixtureProps; selector: string; props: object }[];

test.each(controls)(
  '$key control is added at its position and taken out with its component',
  async ({ key, selector, props }) => {
    // 'top-left' is none of MapLibre's default positions for these controls.
    const r = await renderLoaded({ [key]: { ...props, position: 'top-left' } });

    expect(
      r.target.querySelector(`.maplibregl-ctrl-top-left ${selector}`),
      'control is in the top-left corner',
    ).toBeTruthy();

    r.props[key] = undefined;
    flushSync();

    expect(r.target.querySelector(selector), 'control leaves the DOM').toBeNull();
  },
);

test('a control without a position goes where MapLibre puts it', async () => {
  const r = await renderLoaded({ navigation: {}, scale: {} });

  expect(
    r.target.querySelector('.maplibregl-ctrl-top-right .maplibregl-ctrl-zoom-in'),
  ).toBeTruthy();
  expect(
    r.target.querySelector('.maplibregl-ctrl-bottom-left .maplibregl-ctrl-scale'),
  ).toBeTruthy();
});

test('control style prop', async () => {
  const r = await renderLoaded({ navigation: { style: { opacity: 0.4 } } });

  const container = r.target
    .querySelector('.maplibregl-ctrl-zoom-in')
    ?.closest<HTMLElement>('.maplibregl-ctrl');
  expect(container, 'control container').toBeTruthy();
  expect(container!.style.opacity).toBe('0.4');
});

test.each(controls)(
  '$key control style goes on its container, and an update changes it',
  async ({ key, selector, props }) => {
    const r = await renderLoaded({ [key]: { ...props, style: { opacity: 0.4 } } });

    const container = r.target.querySelector(selector)?.closest<HTMLElement>('.maplibregl-ctrl');
    expect(container, 'control container').toBeTruthy();
    expect(container!.style.opacity, 'style is applied').toBe('0.4');

    r.props[key] = { ...props, style: { opacity: 0.8 } };
    flushSync();
    expect(container!.style.opacity, 'style is updated').toBe('0.8');
  },
);

test('control style is applied one property at a time', async () => {
  // The scale control sets its own `width` on the container.
  const r = await renderLoaded({ scale: { maxWidth: 200 } });
  const container = r.target.querySelector<HTMLElement>('.maplibregl-ctrl-scale')!;
  const width = container.style.width;
  expect(width, 'the scale control sets a width').toMatch(/^[\d.]+px$/);

  r.props.scale = { maxWidth: 200, style: { opacity: 0.4 } };
  flushSync();

  expect(container.style.opacity).toBe('0.4');
  expect(container.style.width, "MapLibre's width is kept").toBe(width);
});

test('control options reach the MapLibre control', async () => {
  const r = await renderLoaded({
    attribution: { customAttribution: 'ZZ-custom-attribution' },
    geolocate: { trackUserLocation: true },
    navigation: { showCompass: false },
    scale: { unit: 'imperial' },
  });

  expect(r.target.querySelector('.maplibregl-ctrl-attrib-inner')?.textContent).toContain(
    'ZZ-custom-attribution',
  );
  expect(r.geolocate()!.options.trackUserLocation).toBe(true);
  expect(r.target.querySelector('.maplibregl-ctrl-zoom-in'), 'zoom is still shown').toBeTruthy();
  expect(r.target.querySelector('.maplibregl-ctrl-compass'), 'compass is off').toBeNull();
  expect(r.target.querySelector('.maplibregl-ctrl-scale')?.textContent).toMatch(/\d\s(ft|mi)$/);
});

test('geolocate exposes its control', async () => {
  const onGeolocate = vi.fn();
  const onError = vi.fn();
  const r = await renderLoaded({ geolocate: { onGeolocate, onError } });

  const control = r.geolocate();
  expect(control, 'getControl() is a maplibregl.GeolocateControl').toBeInstanceOf(
    maplibregl.GeolocateControl,
  );
  expect((await r.map()).hasControl(control!), 'and the one on the map').toBe(true);

  control!.fire('geolocate', { coords: { latitude: 1, longitude: 2 } });
  expect(onGeolocate).toHaveBeenCalledOnce();
  const geolocateEvent = onGeolocate.mock.calls[0][0] as GeolocateResultEvent;
  expect(geolocateEvent.type).toBe('geolocate');
  expect(geolocateEvent.coords).toEqual({ latitude: 1, longitude: 2 });
  expect(onError).not.toHaveBeenCalled();

  control!.fire('error', { code: 1, message: 'denied' });
  expect(onError).toHaveBeenCalledOnce();
  const errorEvent = onError.mock.calls[0][0] as GeolocateErrorEvent;
  expect(errorEvent.type).toBe('error');
  expect(errorEvent.message).toBe('denied');
  expect(onGeolocate).toHaveBeenCalledOnce();
});

test('every geolocate callback is wired to its control event', async () => {
  const callbacks = {
    onGeolocate: vi.fn(),
    onError: vi.fn(),
    onOutOfMaxBounds: vi.fn(),
    onTrackUserLocationStart: vi.fn(),
    onTrackUserLocationEnd: vi.fn(),
  };
  const r = await renderLoaded({ geolocate: callbacks });
  const control = r.geolocate()!;

  const events = [
    ['geolocate', 'onGeolocate'],
    ['error', 'onError'],
    ['outofmaxbounds', 'onOutOfMaxBounds'],
    ['trackuserlocationstart', 'onTrackUserLocationStart'],
    ['trackuserlocationend', 'onTrackUserLocationEnd'],
  ] as const;
  for (const [event, callback] of events) {
    control.fire(event);
    for (const [name, fn] of Object.entries(callbacks)) {
      expect(fn, `${name} after '${event}'`).toHaveBeenCalledTimes(name === callback ? 1 : 0);
    }
    vi.clearAllMocks();
  }
});

test('a geolocate callback that changes is the one called', async () => {
  const first = vi.fn();
  const second = vi.fn();
  const r = await renderLoaded({ geolocate: { onGeolocate: first } });
  const control = r.geolocate()!;

  r.props.geolocate = { onGeolocate: second };
  flushSync();
  control.fire('geolocate');
  expect(second).toHaveBeenCalledOnce();
  expect(first, 'the old callback is not called').not.toHaveBeenCalled();

  r.props.geolocate = {};
  flushSync();
  expect(() => control.fire('geolocate'), 'no callback: nothing to call').not.toThrow();
  expect(second).toHaveBeenCalledOnce();
});

test('scale control updates its maxWidth and unit', async () => {
  const r = await renderLoaded({ scale: { maxWidth: 200, unit: 'metric' } });
  const map = await r.map();
  const scale = r.target.querySelector<HTMLElement>('.maplibregl-ctrl-scale')!;
  const widthOf = (): number => parseFloat(scale.style.width);

  expect(scale.textContent, 'metric to begin with').toMatch(/\d\s(m|km)$/);
  // The scale is at most as wide as `maxWidth`, and about half of it or more.
  expect(widthOf()).toBeGreaterThan(50);

  r.props.scale = { maxWidth: 50, unit: 'metric' };
  flushSync();
  // `maxWidth` is read when the scale next redraws: at the next `move`.
  map.setZoom(map.getZoom() + 1);
  expect(widthOf(), 'new maxWidth is used').toBeLessThanOrEqual(50);

  r.props.scale = { maxWidth: 50, unit: 'imperial' };
  flushSync();
  expect(scale.textContent, 'new unit is shown').toMatch(/\d\s(ft|mi)$/);

  r.props.scale = { maxWidth: 50, unit: 'nautical' };
  flushSync();
  expect(scale.textContent, 'unit changes again').toMatch(/\d\snm$/);
});

test('scale control keeps its unit when the prop is unset', async () => {
  const r = await renderLoaded({ scale: { unit: 'imperial' } });
  const scale = r.target.querySelector<HTMLElement>('.maplibregl-ctrl-scale')!;

  r.props.scale = { style: { opacity: 0.5 } };
  flushSync();

  expect(scale.textContent, 'unit is not reset').toMatch(/\d\s(ft|mi)$/);
});

test('fullscreen control makes the element of containerId fullscreen', async () => {
  const container = createContainer();
  container.id = 'fullscreen-target';
  const r = await renderLoaded({ fullscreen: { containerId: 'fullscreen-target', pseudo: true } });
  const map = await r.map();

  r.target.querySelector<HTMLButtonElement>('.maplibregl-ctrl-fullscreen')!.click();

  expect(container.classList.contains('maplibregl-pseudo-fullscreen')).toBe(true);
  expect(map.getContainer().classList.contains('maplibregl-pseudo-fullscreen')).toBe(false);
  container.remove();
});

test('fullscreen control defaults to the map container', async () => {
  const r = await renderLoaded({ fullscreen: { pseudo: true } });
  const map = await r.map();

  r.target.querySelector<HTMLButtonElement>('.maplibregl-ctrl-fullscreen')!.click();

  expect(map.getContainer().classList.contains('maplibregl-pseudo-fullscreen')).toBe(true);
});

test('globe control needs a mapLib that has one', async () => {
  const onControlError = vi.fn();
  const mapLib = { ...maplibregl, GlobeControl: undefined } as unknown as MapLib;
  const r = await renderLoaded({ mapLib, onControlError });

  r.props.globe = {};
  flushSync();

  expect(onControlError).toHaveBeenCalledOnce();
  expect(onControlError.mock.calls[0][0]).toEqual(
    new Error('GlobeControl is not supported by this version of MapLibre GL JS'),
  );
});
