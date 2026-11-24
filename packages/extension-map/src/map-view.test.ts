// @vitest-environment jsdom
import { render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mapApi } from './map-api.svelte';
import MapView from './map-view.svelte';

// A stand-in for maplibre's Map: WebGL does not exist under jsdom, and what
// these tests pin is what the view tells maplibre, not what maplibre draws.
// `jumpTo` matters most: in maplibre it calls `stop()`, which ends any drag
// or wheel zoom in progress (camera.ts `_stop` → `handlers.stop`).
const fake = vi.hoisted(() => {
  type Listener = () => void;
  class FakeMap {
    public static last: FakeMap | null = null;
    public center = { lng: 0, lat: 0 };
    public zoom = 0;
    public pitch = 0;
    public bearing = 0;
    public jumpTo = vi.fn();
    private moveListeners: Listener[] = [];
    public constructor(opts: {
      center: [number, number];
      zoom: number;
      pitch: number;
      bearing: number;
    }) {
      this.center = { lng: opts.center[0], lat: opts.center[1] };
      this.zoom = opts.zoom;
      this.pitch = opts.pitch;
      this.bearing = opts.bearing;
      FakeMap.last = this;
    }
    public on(event: string, listener: Listener): void {
      if (event === 'move') this.moveListeners.push(listener);
    }
    public getCenter() {
      return this.center;
    }
    public getZoom() {
      return this.zoom;
    }
    public getPitch() {
      return this.pitch;
    }
    public getBearing() {
      return this.bearing;
    }
    public remove(): void {}
    /** What maplibre does on each frame of the operator's drag. */
    public operatorMovesTo(lng: number, lat: number): void {
      this.center = { lng, lat };
      for (const l of this.moveListeners) l();
    }
  }
  return { FakeMap };
});

vi.mock('maplibre-gl', () => ({ default: { Map: fake.FakeMap } }));

function resetCamera(): void {
  mapApi.camera.center = [149.17, -35.36];
  mapApi.camera.zoom = 13;
  mapApi.camera.pitch = 0;
  mapApi.camera.bearing = 0;
}

beforeEach(resetCamera);
afterEach(() => {
  fake.FakeMap.last = null;
  resetCamera();
});

function mountedMap() {
  render(MapView);
  flushSync();
  const map = fake.FakeMap.last;
  if (!map) throw new Error('MapView did not construct a map');
  map.jumpTo.mockClear();
  return map;
}

describe('MapView camera sync', () => {
  it("does not jumpTo while the operator drags, so maplibre's drag is not stopped", () => {
    const map = mountedMap();

    map.operatorMovesTo(149.2, -35.37);
    flushSync();
    map.operatorMovesTo(149.25, -35.38);
    flushSync();

    expect(map.jumpTo).not.toHaveBeenCalled();
    expect([...mapApi.camera.center]).toEqual([149.25, -35.38]);
  });

  it('still moves the map when another extension writes the camera', () => {
    const map = mountedMap();
    map.operatorMovesTo(149.2, -35.37);
    flushSync();

    mapApi.camera.center = [151.21, -33.87];
    flushSync();

    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    expect(map.jumpTo).toHaveBeenCalledWith({
      center: [151.21, -33.87],
      zoom: 13,
      pitch: 0,
      bearing: 0,
    });
  });

  // One case per field the skip compares, so dropping any one comparison
  // swallows that writer's change and fails its case.
  it.each([
    ['longitude only', () => (mapApi.camera.center = [149.3, -35.37]), { center: [149.3, -35.37] }],
    ['latitude only', () => (mapApi.camera.center = [149.2, -35.4]), { center: [149.2, -35.4] }],
    ['zoom', () => (mapApi.camera.zoom = 16), { zoom: 16 }],
    ['pitch', () => (mapApi.camera.pitch = 30), { pitch: 30 }],
    ['bearing', () => (mapApi.camera.bearing = 90), { bearing: 90 }],
  ])('moves the map when a writer changes the %s after a drag', (_name, write, expected) => {
    const map = mountedMap();
    map.operatorMovesTo(149.2, -35.37);
    flushSync();

    write();
    flushSync();

    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining(expected));
  });

  it('moves the map back when a writer sets the camera the operator dragged away from', () => {
    // The Recenter button writes the drone's position, which is often where
    // the camera was before the drag: that must still reach maplibre.
    const map = mountedMap();
    map.operatorMovesTo(149.2, -35.37);
    flushSync();

    mapApi.camera.center = [149.17, -35.36];
    flushSync();

    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    expect(map.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ center: [149.17, -35.36] }));
  });
});
