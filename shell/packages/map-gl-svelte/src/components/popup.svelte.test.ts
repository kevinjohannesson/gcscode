import { flushSync } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  render,
  type FixtureProps,
  type Rendered,
} from '../test-fixtures/marker-popup-harness.svelte';
import { waitForStyleLoad } from '../test-utils/map-test-utils';
import type { PopupEvent } from '../types/events';
import type { PopupInstance, PopupOptions } from '../types/lib';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Renders the fixture, waits for its map's style to load, and returns the popup it made. */
async function renderPopup(initial: FixtureProps): Promise<{ r: Rendered; popup: PopupInstance }> {
  const r = render(initial);
  await waitForStyleLoad(await r.map());
  const popup = r.popup();
  expect(popup, 'Popup is created').toBeTruthy();
  return { r, popup: popup! };
}

// ---- Translated from upstream test/components/popup.spec.jsx (v8.1.3) ----

test('Popup', async () => {
  const { r, popup } = await renderPopup({
    popup: { longitude: -122, latitude: 38, offset: [0, 10] },
    popupContent: 'text',
    label: 'You are here',
  });

  expect(r.target.querySelector('.maplibregl-popup'), 'Popup is attached to DOM').toBeTruthy();

  const { anchor, offset, maxWidth } = popup.options;

  r.props.popup = { longitude: -122, latitude: 38, offset: [0, 10] };
  r.props.popupContent = 'block';
  flushSync();

  expect(offset, 'offset did not change deeply').toBe(popup.options.offset);
  expect(r.target.querySelector('#popup-content'), 'content is rendered').toBeTruthy();

  r.props.popup = {
    longitude: -122,
    latitude: 38,
    // Upstream's test (JS) gives only two of the eight anchors, which MapLibre takes.
    offset: { top: [0, 0], left: [10, 0] } as unknown as PopupOptions['offset'],
    anchor: 'top',
    maxWidth: '100px',
  };
  flushSync();

  expect(offset, 'offset is updated').not.toBe(popup.options.offset);
  expect(anchor, 'anchor is updated').not.toBe(popup.options.anchor);
  expect(maxWidth, 'maxWidth is updated').not.toBe(popup.options.maxWidth);

  r.props.popup = { longitude: -122, latitude: 38, className: 'classA' };
  flushSync();

  expect(popup.getElement().classList.contains('classA'), 'className is updated').toBeTruthy();
});

// ---- Svelte-specific ----

/** A popup that is open, with `onClose` wired to the spy. */
function renderOpenPopup(onClose: (e: PopupEvent) => void) {
  return renderPopup({
    popup: { longitude: -122, latitude: 38, onClose },
    popupContent: 'text',
    label: 'You are here',
  });
}

test('popup onClose is not called when the Popup unmounts', async () => {
  const onClose = vi.fn();
  const { r, popup } = await renderOpenPopup(onClose);
  expect(popup.isOpen(), 'the popup starts open').toBe(true);

  r.props.popup = undefined;
  flushSync();

  expect(popup.isOpen(), 'unmounting closed the popup').toBe(false);
  expect(onClose).not.toHaveBeenCalled();
});

test('popup onClose is called when the popup closes itself', async () => {
  const onClose = vi.fn();
  const { popup } = await renderOpenPopup(onClose);

  popup.remove();

  expect(onClose).toHaveBeenCalledTimes(1);
  const event = onClose.mock.calls[0][0] as PopupEvent;
  expect(event.type).toBe('close');
  expect(event.target).toBe(popup);
});

test('popup callbacks are read when the event fires', async () => {
  const first = vi.fn();
  const second = vi.fn();
  const { r, popup } = await renderPopup({
    popup: { longitude: -122, latitude: 38 },
    popupContent: 'text',
  });
  const map = await r.map();

  // No callback yet: nothing to call, nothing thrown.
  popup.remove();

  popup.addTo(map);
  r.props.popup = { longitude: -122, latitude: 38, onClose: first };
  flushSync();
  popup.remove();
  expect(first, 'a callback set after mount is called').toHaveBeenCalledTimes(1);

  popup.addTo(map);
  r.props.popup = { longitude: -122, latitude: 38, onClose: second };
  flushSync();
  popup.remove();
  expect(second, 'the new callback is called').toHaveBeenCalledTimes(1);
  expect(first, 'the old callback is not').toHaveBeenCalledTimes(1);
});

test('popup onOpen is called when the popup opens', async () => {
  const onOpen = vi.fn();
  const { popup } = await renderPopup({
    popup: { longitude: -122, latitude: 38, onOpen },
    popupContent: 'text',
  });

  expect(onOpen).toHaveBeenCalledTimes(1);
  const event = onOpen.mock.calls[0][0] as PopupEvent;
  expect(event.type).toBe('open');
  expect(event.target).toBe(popup);
});

test('popup children stay reactive', async () => {
  const { r, popup } = await renderPopup({
    popup: { longitude: -122, latitude: 38 },
    popupContent: 'block',
    label: 'one',
  });

  const content = popup.getElement().querySelector('#popup-content');
  expect(content?.textContent, 'children render inside the popup').toBe('one');

  r.props.label = 'two';
  flushSync();

  expect(content?.textContent, 'the same element is updated in place').toBe('two');
  expect(popup.getElement().querySelector('#popup-content')).toBe(content);
});

test('popup children can reach the map context', async () => {
  const onProbe = vi.fn();
  await renderPopup({
    popup: { longitude: -122, latitude: 38 },
    popupContent: 'probe',
    onProbe,
  });

  expect(onProbe).toHaveBeenCalledTimes(1);
  expect(onProbe).toHaveBeenCalledWith(true);
});

test('popup children are destroyed with the popup', async () => {
  const onProbeDestroyed = vi.fn();
  const { r } = await renderPopup({
    popup: { longitude: -122, latitude: 38 },
    popupContent: 'probe',
    onProbeDestroyed,
  });
  expect(onProbeDestroyed, 'children are alive while the popup is').not.toHaveBeenCalled();

  r.props.popup = undefined;
  flushSync();

  expect(onProbeDestroyed).toHaveBeenCalledTimes(1);
});

test('popup style is applied per property, keeping what MapLibre sets', async () => {
  const { r, popup } = await renderPopup({
    popup: { longitude: -122, latitude: 38, style: { opacity: 0.5, width: 200 } },
    popupContent: 'text',
    label: 'You are here',
  });

  const element = popup.getElement();
  expect(element.style.opacity, 'a unitless number stays one').toBe('0.5');
  expect(element.style.width, 'a number gets px').toBe('200px');
  expect(element.style.transform, "MapLibre's positioning is there").not.toBe('');

  r.props.popup = { longitude: -122, latitude: 38, style: { opacity: 0.25, height: 30 } };
  flushSync();

  expect(element.style.opacity).toBe('0.25');
  expect(element.style.height).toBe('30px');
  expect(element.style.transform, "MapLibre's positioning survives").not.toBe('');
});

test('popup moves when longitude or latitude change', async () => {
  const { r, popup } = await renderPopup({
    popup: { longitude: -122, latitude: 38 },
    popupContent: 'text',
  });

  r.props.popup = { longitude: 10, latitude: 20 };
  flushSync();

  expect(popup.getLngLat().lng).toBe(10);
  expect(popup.getLngLat().lat).toBe(20);
});

test('popup ignores prop changes while it is closed', async () => {
  const { r, popup } = await renderPopup({
    popup: { longitude: -122, latitude: 38, offset: [0, 10], className: 'classX' },
    popupContent: 'text',
  });
  // Read one by one: MapLibre keeps the defaults on the options' prototype, which a spread skips.
  const { offset, anchor, maxWidth } = popup.options;

  popup.remove();
  expect(popup.isOpen()).toBe(false);

  r.props.popup = {
    longitude: 10,
    latitude: 20,
    offset: [5, 5],
    anchor: 'top',
    maxWidth: '100px',
    className: 'classY',
  };
  flushSync();

  expect(popup.getLngLat().lng, 'longitude is not applied').toBe(-122);
  expect(popup.getLngLat().lat, 'latitude is not applied').toBe(38);
  expect(popup.options.offset, 'offset is not applied').toBe(offset);
  expect(popup.options.anchor, 'anchor is not applied').toBe(anchor);
  expect(popup.options.maxWidth, 'maxWidth is not applied').toBe(maxWidth);

  // A closed popup has no element to look at, so open it again. It has the class it was made
  // with, not the one that came while it was closed.
  popup.addTo(await r.map());
  const classes = popup.getElement().classList;
  expect(classes.contains('classX')).toBe(true);
  expect(classes.contains('classY')).toBe(false);

  // The next class change is worked out from the class the popup has, not from the ignored one.
  r.props.popup = { longitude: 10, latitude: 20, className: 'classZ' };
  flushSync();
  expect(classes.contains('classZ'), 'the new class is added').toBe(true);
  expect(classes.contains('classX'), 'the old class is removed').toBe(false);
  expect(classes.contains('classY'), 'the ignored class does not appear').toBe(false);
});
