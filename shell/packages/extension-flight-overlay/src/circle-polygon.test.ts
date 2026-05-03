import { describe, expect, it } from 'vitest';

import { computeCirclePolygon } from './circle-polygon';

describe('computeCirclePolygon', () => {
  it('returns a closed ring (first and last point match)', () => {
    const ring = computeCirclePolygon([0, 0], 100);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('produces 65 points for 64 segments', () => {
    const ring = computeCirclePolygon([0, 0], 100);
    expect(ring).toHaveLength(65);
  });

  it('scales radius approximately linearly at the equator', () => {
    const small = computeCirclePolygon([0, 0], 100);
    const large = computeCirclePolygon([0, 0], 1000);
    const smallDLng = Math.abs(small[0][0] - 0);
    const largeDLng = Math.abs(large[0][0] - 0);
    expect(largeDLng / smallDLng).toBeCloseTo(10, 1);
  });

  it('contracts longitude offsets at higher latitudes', () => {
    const equator = computeCirclePolygon([0, 0], 100);
    const polar = computeCirclePolygon([0, 60], 100);
    expect(Math.abs(polar[0][0])).toBeGreaterThan(Math.abs(equator[0][0]));
  });
});
