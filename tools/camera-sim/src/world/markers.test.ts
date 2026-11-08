import type { Mesh } from 'three';
import { describe, expect, it } from 'vitest';

import { LocalFrame } from '../geo/local-frame';
import type { GroundModel } from '../terrain/sitl-ground';
import { createMarker, MARKER_LIFT_M, MARKER_RING_OUTER_M } from './markers';

const CMAC = { lat: -35.363262, lon: 149.165237 };
const frame = new LocalFrame(CMAC);
/** Ground rising 1 m for every 10 m east of home: steep enough to bury a flat marker. */
const eastRamp: GroundModel = { heightAt: (p) => frame.toLocal(p).east / 10 };
const WEST_100 = frame.toGeo({ east: -100, north: 0 });

function vertices(marker: ReturnType<typeof createMarker>) {
  const out: { east: number; north: number; up: number }[] = [];
  for (const child of marker.children as Mesh[]) {
    const p = child.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++)
      out.push({ east: p.getX(i), up: p.getY(i), north: -p.getZ(i) });
  }
  return out;
}

describe('createMarker', () => {
  const marker = createMarker(frame, eastRamp, WEST_100, 0xff00ff);
  const vs = vertices(marker);

  it('is centred on its point: 100 m west of home', () => {
    const easts = vs.map((v) => v.east);
    expect((Math.min(...easts) + Math.max(...easts)) / 2).toBeCloseTo(-100, 4);
    const norths = vs.map((v) => v.north);
    expect((Math.min(...norths) + Math.max(...norths)) / 2).toBeCloseTo(0, 4);
  });

  it('drapes every vertex over the slope, the lift above the ground under it', () => {
    // Positions are stored as float32, so compare to a tenth of a millimetre.
    for (const v of vs) expect(v.up).toBeCloseTo(v.east / 10 + MARKER_LIFT_M, 4);
  });

  it('spans the ring’s width: its edges sit 10 m either side, 2 m apart in height on this slope', () => {
    const easts = vs.map((v) => v.east);
    expect(Math.max(...easts) - Math.min(...easts)).toBeCloseTo(2 * 12, 4); // the cross arms reach 12 m
    const ring = (marker.children[0] as Mesh).geometry.getAttribute('position');
    let maxEast = -Infinity;
    for (let i = 0; i < ring.count; i++) maxEast = Math.max(maxEast, ring.getX(i));
    expect(maxEast).toBeCloseTo(-100 + MARKER_RING_OUTER_M, 4);
  });
});
