import { describe, expect, it } from 'vitest';

import { LocalFrame } from '../geo/local-frame';
import { tilesCovering } from '../geo/web-mercator-tiles';
import { FLAT_GROUND, type GroundModel } from '../terrain/sitl-ground';
import { groundBounds, segmentsFor, skirtDepthFor, tileMeshData } from './ground-tiles';

const CMAC = { lat: -35.363262, lon: 149.165237 };
const frame = new LocalFrame(CMAC);
const TILE = { z: 18, x: 239690, y: 158632 }; // ~124.7 m on a side, home near its east edge

/** Ground rising 1 m for every 10 m east of home. */
const eastRamp: GroundModel = { heightAt: (p) => frame.toLocal(p).east / 10 };

const vertex = (data: { positions: number[] }, i: number) => data.positions.slice(i * 3, i * 3 + 3);

describe('tileMeshData', () => {
  const flat = tileMeshData(frame, TILE, FLAT_GROUND, 4, 5);

  it('places the grid’s corners at the tile’s corners, ArduPilot’s convention (z is south)', () => {
    const corners = [vertex(flat, 0), vertex(flat, 4), vertex(flat, 20), vertex(flat, 24)];
    const expected = [
      [-101.08147905619234, 0, -120.88568153998267], // NW
      [23.58728602814409, 0, -120.88568153998267], // NE
      [-101.08077796269113, 0, 3.7830573019696523], // SW
      [23.58712242851041, 0, 3.7830573019696523], // SE
    ];
    corners.flat().forEach((v, k) => expect(v).toBeCloseTo(expected.flat()[k]!, 6));
  });

  it('spaces rows evenly in Web Mercator so imagery maps without stretching', () => {
    // Row 2 of 4 is mercator y + 0.5: latitude -35.3627360235°, 58.551 m north of home.
    expect(vertex(flat, 2 * 5)[2]).toBeCloseTo(-58.55109594667021, 6);
    expect(flat.uvs.slice(2 * 5 * 2, 2 * 5 * 2 + 2)).toEqual([0, 0.5]);
  });

  it('maps the image’s top edge (v = 1) to the north-west corner and its bottom to the south-east', () => {
    expect(flat.uvs.slice(0, 2)).toEqual([0, 1]);
    expect(flat.uvs.slice(24 * 2, 24 * 2 + 2)).toEqual([1, 0]);
  });

  it('lifts every vertex to the ground model’s height', () => {
    const ramp = tileMeshData(frame, TILE, eastRamp, 4, 5);
    expect(vertex(ramp, 0)[1]).toBeCloseTo(-10.108147905619234, 6); // NW, 101.08 m west
    expect(vertex(ramp, 24)[1]).toBeCloseTo(2.358712242851041, 6); // SE, 23.59 m east
  });

  it('winds the grid’s triangles to face up', () => {
    for (let t = 0; t < 4 * 4 * 6; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => vertex(flat, flat.indices[t + k]!));
      const u = [b![0]! - a![0]!, b![2]! - a![2]!];
      const v = [c![0]! - a![0]!, c![2]! - a![2]!];
      expect(u[1]! * v[0]! - u[0]! * v[1]!).toBeGreaterThan(0);
    }
  });

  it('hangs a skirt of the given depth below all four edges', () => {
    const ramp = tileMeshData(frame, TILE, eastRamp, 4, 5);
    expect(ramp.positions.length / 3).toBe(25 + 4 * 5);
    // The first skirt vertex sits 5 m below the north-west corner.
    const nw = vertex(ramp, 0);
    const skirt = vertex(ramp, 25);
    expect(skirt).toEqual([nw[0], nw[1]! - 5, nw[2]]);
    expect(ramp.indices.length).toBe(4 * 4 * 6 + 4 * 4 * 6);
  });
});

describe('segmentsFor and skirtDepthFor', () => {
  it('puts a vertex about every 50 m, 4 to 32 segments a side', () => {
    expect(segmentsFor(62)).toBe(4);
    expect(segmentsFor(499)).toBe(10);
    expect(segmentsFor(3989)).toBe(32);
  });

  it('hangs skirts a tenth of the tile deep, 2 to 200 m', () => {
    expect(skirtDepthFor(8)).toBe(2);
    expect(skirtDepthFor(500)).toBe(50);
    expect(skirtDepthFor(4000)).toBe(200);
  });
});

describe('groundBounds', () => {
  it('covers the CMAC tile neighbourhood with 17 × 17 z18 tiles for a 2 km square', () => {
    const tiles = tilesCovering(groundBounds(frame, 2000), 18);
    expect(tiles).toHaveLength(289);
    expect(tiles).toContainEqual(TILE);
  });

  it('spans 1 km either side of the origin', () => {
    const b = groundBounds(frame, 2000);
    expect(frame.toLocal({ lat: b.north, lon: CMAC.lon }).north).toBeCloseTo(1000, 6);
    expect(frame.toLocal({ lat: b.south, lon: CMAC.lon }).north).toBeCloseTo(-1000, 6);
  });
});
