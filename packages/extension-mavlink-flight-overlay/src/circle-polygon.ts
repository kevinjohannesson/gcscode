/**
 * Approximate a geodesic circle as a closed polygon ring. Adequate for visual
 * geofence rendering at typical drone scales (sub-km radius, mid-latitudes).
 * Not intended for precise spatial calculations — turf.js or similar is the
 * right answer if/when that's needed.
 */
const EARTH_RADIUS_M = 6_378_137;
const SEGMENTS = 64;

export function computeCirclePolygon(
  center: readonly [number, number],
  radiusMeters: number,
): [number, number][] {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLatDeg = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLngDeg = dLatDeg / Math.cos(latRad);

  const points: [number, number][] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * 2 * Math.PI;
    points.push([lng + dLngDeg * Math.cos(angle), lat + dLatDeg * Math.sin(angle)]);
  }
  // Close the ring by repeating the first point exactly (avoids floating-point
  // drift from sin(2π) ≠ 0 in IEEE 754).
  points.push(points[0]);
  return points;
}
