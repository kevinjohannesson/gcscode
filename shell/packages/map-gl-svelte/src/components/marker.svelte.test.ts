import { Popup } from 'maplibre-gl';
import { flushSync, tick } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  render,
  type FixtureProps,
  type Rendered,
} from '../test-fixtures/marker-popup-harness.svelte';
import { waitForStyleLoad } from '../test-utils/map-test-utils';
import type { MarkerDragEvent, MarkerEvent } from '../types/events';
import type { MarkerInstance } from '../types/lib';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Renders the fixture, waits for its map's style to load, and returns the marker it made. */
async function renderMarker(
  initial: FixtureProps,
): Promise<{ r: Rendered; marker: MarkerInstance }> {
  const r = render(initial);
  await waitForStyleLoad(await r.map());
  const marker = r.marker();
  expect(marker, 'Marker is created').toBeTruthy();
  return { r, marker: marker! };
}

// ---- Translated from upstream test/components/marker.spec.jsx (v8.1.3) ----

test('Marker', async () => {
  const { r, marker } = await renderMarker({
    marker: { longitude: -122, latitude: 38, offset: [0, 0] },
  });

  expect(r.target.querySelector('.maplibregl-marker'), 'Marker is attached to DOM').toBeTruthy();

  const offset = marker.getOffset();
  const draggable = marker.isDraggable();
  const rotation = marker.getRotation();
  const pitchAlignment = marker.getPitchAlignment();
  const rotationAlignment = marker.getRotationAlignment();

  r.props.marker = { longitude: -122, latitude: 38, offset: [0, 0] };
  flushSync();

  expect(offset, 'offset did not change deeply').toBe(marker.getOffset());

  let callbackType = '';
  r.props.marker = {
    longitude: -122,
    latitude: 38,
    offset: [0, 1],
    rotation: 30,
    draggable: true,
    className: 'classA',
    pitchAlignment: 'viewport',
    rotationAlignment: 'viewport',
    onDragStart: () => (callbackType = 'dragstart'),
    onDrag: () => (callbackType = 'drag'),
    onDragEnd: () => (callbackType = 'dragend'),
  };
  flushSync();

  expect(offset, 'offset is updated').not.toBe(marker.getOffset());
  expect(draggable, 'draggable is updated').not.toBe(marker.isDraggable());
  expect(rotation, 'rotation is updated').not.toBe(marker.getRotation());
  expect(pitchAlignment, 'pitchAlignment is updated').not.toBe(marker.getPitchAlignment());
  expect(rotationAlignment, 'rotationAlignment is updated').not.toBe(marker.getRotationAlignment());
  expect(marker.getElement().classList.contains('classA'), 'className is updated').toBeTruthy();

  marker.fire('dragstart');
  expect(callbackType, 'onDragStart called').toBe('dragstart');
  marker.fire('drag');
  expect(callbackType, 'onDrag called').toBe('drag');
  marker.fire('dragend');
  expect(callbackType, 'onDragEnd called').toBe('dragend');

  r.props.marker = undefined;
  flushSync();
  // `bind:this` lets go of the instance a microtask after the component is destroyed.
  await tick();

  expect(r.marker(), 'marker is removed').toBeFalsy();
  expect(r.target.querySelector('.maplibregl-marker'), 'marker leaves the DOM').toBeNull();

  r.props.marker = { longitude: -100, latitude: 40 };
  r.props.markerContent = 'block';
  flushSync();

  expect(r.target.querySelector('#marker-content'), 'content is rendered').toBeTruthy();
});

// ---- Svelte-specific ----

test('marker children become the marker element', async () => {
  const { marker } = await renderMarker({
    marker: { longitude: -122, latitude: 38 },
    markerContent: 'pin',
  });

  const element = marker.getElement();
  expect(element.querySelector('.pin'), 'children are in the marker element').toBeTruthy();
  expect(element.querySelector('svg'), "MapLibre's default pin is replaced").toBeNull();
  expect(element.classList.contains('maplibregl-marker'), 'MapLibre owns the element').toBe(true);
});

test('a marker without children keeps the default pin', async () => {
  const { marker } = await renderMarker({ marker: { longitude: -122, latitude: 38 } });

  expect(marker.getElement().querySelector('svg')).toBeTruthy();
});

test('marker children can reach the map context', async () => {
  const onProbe = vi.fn();
  await renderMarker({
    marker: { longitude: -122, latitude: 38 },
    markerContent: 'probe',
    onProbe,
  });

  expect(onProbe).toHaveBeenCalledTimes(1);
  expect(onProbe).toHaveBeenCalledWith(true);
});

test('marker children are destroyed with the marker', async () => {
  const onProbeDestroyed = vi.fn();
  const { r } = await renderMarker({
    marker: { longitude: -122, latitude: 38 },
    markerContent: 'probe',
    onProbeDestroyed,
  });
  expect(onProbeDestroyed, 'children are alive while the marker is').not.toHaveBeenCalled();

  r.props.marker = undefined;
  flushSync();

  expect(onProbeDestroyed).toHaveBeenCalledTimes(1);
});

test('marker style is applied per property, keeping what MapLibre sets', async () => {
  const { r, marker } = await renderMarker({
    marker: { longitude: -122, latitude: 38, style: { opacity: 0.5, width: 20 } },
  });

  const element = marker.getElement();
  expect(element.style.width, 'a number gets px').toBe('20px');
  expect(element.style.transform, "MapLibre's positioning is there").not.toBe('');

  r.props.marker = { longitude: -122, latitude: 38, style: { opacity: 0.25, height: 30 } };
  flushSync();

  // Checked at once: MapLibre rewrites `opacity` itself, a frame after a move.
  expect(element.style.opacity, 'a unitless number stays one').toBe('0.25');
  expect(element.style.height).toBe('30px');
  expect(element.style.transform, "MapLibre's positioning survives").not.toBe('');
});

test('marker moves when longitude or latitude change', async () => {
  const { r, marker } = await renderMarker({ marker: { longitude: -122, latitude: 38 } });

  r.props.marker = { longitude: 10, latitude: 20 };
  flushSync();

  expect(marker.getLngLat().lng).toBe(10);
  expect(marker.getLngLat().lat).toBe(20);
});

test('marker popup prop sets and clears the marker popup', async () => {
  const popup = new Popup();
  const { r, marker } = await renderMarker({
    marker: { longitude: -122, latitude: 38, popup },
  });
  expect(marker.getPopup(), 'popup is attached').toBe(popup);

  r.props.marker = { longitude: -122, latitude: 38 };
  flushSync();

  expect(marker.getPopup(), 'popup is detached').toBeNull();
});

test('marker click and drag events carry what upstream gives them', async () => {
  const onClick = vi.fn();
  const onDragStart = vi.fn();
  const onDrag = vi.fn();
  const onDragEnd = vi.fn();
  const { r, marker } = await renderMarker({
    marker: { longitude: -122, latitude: 38, onClick, onDragStart, onDrag, onDragEnd },
  });

  marker.getElement().click();
  expect(onClick).toHaveBeenCalledTimes(1);
  const click = onClick.mock.calls[0][0] as MarkerEvent<MouseEvent>;
  expect(click.type).toBe('click');
  expect(click.target).toBe(marker);
  expect(click.originalEvent).toBeInstanceOf(MouseEvent);

  for (const [type, callback] of [
    ['dragstart', onDragStart],
    ['drag', onDrag],
    ['dragend', onDragEnd],
  ] as const) {
    marker.fire(type);
    expect(callback, `${type} fires its callback`).toHaveBeenCalledTimes(1);
    const event = callback.mock.calls[0][0] as MarkerDragEvent;
    expect(event.type).toBe(type);
    expect(event.lngLat, `${type} carries lngLat`).toBe(marker.getLngLat());
    expect(event.lngLat.lng).toBe(-122);
  }

  // lngLat is the marker's position when the event fires, not when the marker was made.
  r.props.marker = { longitude: 10, latitude: 20, onDrag };
  flushSync();
  marker.fire('drag');
  expect(onDrag).toHaveBeenCalledTimes(2);
  const moved = onDrag.mock.calls[1][0] as MarkerDragEvent;
  expect(moved.lngLat).toBe(marker.getLngLat());
  expect(moved.lngLat.lng).toBe(10);
});

test('marker callbacks are read when the event fires', async () => {
  const first = vi.fn();
  const second = vi.fn();
  const { r, marker } = await renderMarker({ marker: { longitude: -122, latitude: 38 } });

  // No callbacks yet: nothing to call, nothing thrown.
  marker.getElement().click();
  marker.fire('dragend');

  r.props.marker = { longitude: -122, latitude: 38, onClick: first, onDragEnd: first };
  flushSync();
  marker.getElement().click();
  marker.fire('dragend');
  expect(first, 'a callback set after mount is called').toHaveBeenCalledTimes(2);

  r.props.marker = { longitude: -122, latitude: 38, onClick: second, onDragEnd: second };
  flushSync();
  marker.getElement().click();
  marker.fire('dragend');
  expect(second, 'the new callback is called').toHaveBeenCalledTimes(2);
  expect(first, 'the old callback is not').toHaveBeenCalledTimes(2);
});
