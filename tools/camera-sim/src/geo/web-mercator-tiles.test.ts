import { describe, expect, it } from 'vitest';

import {
  latToTileY,
  lonToTileX,
  tileBounds,
  tileUrl,
  tilesCovering,
  tileYToLat,
} from './web-mercator-tiles';

describe('tile arithmetic', () => {
  it('puts CMAC in z18 tile 239690 / 158632', () => {
    expect(Math.floor(lonToTileX(149.165237, 18))).toBe(239690);
    expect(Math.floor(latToTileY(-35.363262, 18))).toBe(158632);
  });

  it('gives the z0 tile its Web Mercator edges (±85.0511°, ±180°)', () => {
    expect(tileBounds({ z: 0, x: 0, y: 0 })).toEqual({
      north: expect.closeTo(85.0511287798066, 10),
      south: expect.closeTo(-85.0511287798066, 10),
      west: -180,
      east: 180,
    });
  });

  it('gives the CMAC z18 tile its edges', () => {
    const b = tileBounds({ z: 18, x: 239690, y: 158632 });
    expect(b.north).toBeCloseTo(-35.3621760591468, 10);
    expect(b.south).toBeCloseTo(-35.36329598397909, 10);
    expect(b.west).toBeCloseTo(149.16412353515625, 10);
    expect(b.east).toBeCloseTo(149.16549682617188, 10);
  });

  it('inverts latitude to row', () => {
    expect(tileYToLat(latToTileY(-35.363262, 18), 18)).toBeCloseTo(-35.363262, 10);
  });
});

describe('tilesCovering', () => {
  it('lists the z1 southern-hemisphere tiles west to east', () => {
    expect(tilesCovering({ south: -60, west: -10, north: -10, east: 10 }, 1)).toEqual([
      { z: 1, x: 0, y: 1 },
      { z: 1, x: 1, y: 1 },
    ]);
  });

  it('returns a single tile for bounds inside one tile', () => {
    const inside = { south: -35.363, west: 149.1645, north: -35.3625, east: 149.165 };
    expect(tilesCovering(inside, 18)).toEqual([{ z: 18, x: 239690, y: 158632 }]);
  });

  it('clamps to the tile grid', () => {
    expect(tilesCovering({ south: -89, west: -180, north: 89, east: 180 }, 0)).toEqual([
      { z: 0, x: 0, y: 0 },
    ]);
  });
});

describe('tileUrl', () => {
  it('fills z, y and x in the order the template asks for', () => {
    expect(tileUrl('https://tiles.test/{z}/{y}/{x}.jpg', { z: 18, x: 239690, y: 158632 })).toBe(
      'https://tiles.test/18/158632/239690.jpg',
    );
  });
});
