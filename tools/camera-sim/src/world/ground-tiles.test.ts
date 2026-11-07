import { describe, expect, it } from 'vitest';

import { LocalFrame } from '../geo/local-frame';
import { tilesCovering } from '../geo/web-mercator-tiles';
import { groundBounds, tileQuad } from './ground-tiles';

const CMAC = { lat: -35.363262, lon: 149.165237 };
const frame = new LocalFrame(CMAC);

describe('tileQuad', () => {
  // Corners worked out from the tile's edges with ArduPilot's lat/lon-to-metres
  // formula: the CMAC tile spans ~124.7 m east-west and ~124.7 m north-south.
  const quad = tileQuad(frame, { z: 18, x: 239690, y: 158632 });

  it('places the corners SW, SE, NE, NW in scene coordinates (z is south)', () => {
    const expected = [
      [-101.08077796269113, 0, 3.7830573019696523],
      [23.58712242851041, 0, 3.7830573019696523],
      [23.58728602814409, 0, -120.88568153998267],
      [-101.08147905619234, 0, -120.88568153998267],
    ];
    expected.flat().forEach((value, i) => expect(quad.positions[i]).toBeCloseTo(value, 6));
  });

  it('maps the image’s top edge (v = 1) to the north corners', () => {
    expect(quad.uvs).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it('winds both triangles to face up', () => {
    const p = (i: number) => quad.positions.slice(i * 3, i * 3 + 3) as [number, number, number];
    for (let t = 0; t < quad.indices.length; t += 3) {
      const [a, b, c] = [p(quad.indices[t]!), p(quad.indices[t + 1]!), p(quad.indices[t + 2]!)];
      const u = [b[0] - a[0], b[2] - a[2]];
      const v = [c[0] - a[0], c[2] - a[2]];
      // y component of (b - a) × (c - a): positive means the normal points up.
      expect(u[1]! * v[0]! - u[0]! * v[1]!).toBeGreaterThan(0);
    }
  });
});

describe('groundBounds', () => {
  it('covers the CMAC tile neighbourhood with 17 × 17 z18 tiles for a 2 km square', () => {
    const tiles = tilesCovering(groundBounds(frame, 2000), 18);
    expect(tiles).toHaveLength(289);
    expect(tiles).toContainEqual({ z: 18, x: 239690, y: 158632 });
  });

  it('spans 1 km either side of the origin', () => {
    const b = groundBounds(frame, 2000);
    expect(frame.toLocal({ lat: b.north, lon: CMAC.lon }).north).toBeCloseTo(1000, 6);
    expect(frame.toLocal({ lat: b.south, lon: CMAC.lon }).north).toBeCloseTo(-1000, 6);
  });
});
