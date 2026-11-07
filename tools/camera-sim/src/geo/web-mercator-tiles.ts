/**
 * Slippy-map (XYZ, Web Mercator) tile arithmetic: which tiles cover an area,
 * where a tile's edges are, and how to fill a tile URL template.
 */

export interface TileId {
  readonly z: number;
  readonly x: number;
  readonly y: number;
}

export interface GeoBounds {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/** Fractional tile column for a longitude. */
export function lonToTileX(lonDeg: number, z: number): number {
  return ((lonDeg + 180) / 360) * 2 ** z;
}

/** Fractional tile row for a latitude (row 0 is the northern edge). */
export function latToTileY(latDeg: number, z: number): number {
  const lat = (latDeg * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * 2 ** z;
}

export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

export function tileYToLat(y: number, z: number): number {
  const n = Math.PI * (1 - (2 * y) / 2 ** z);
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

export function tileBounds(tile: TileId): GeoBounds {
  return {
    north: tileYToLat(tile.y, tile.z),
    south: tileYToLat(tile.y + 1, tile.z),
    west: tileXToLon(tile.x, tile.z),
    east: tileXToLon(tile.x + 1, tile.z),
  };
}

/** Every tile at zoom `z` that overlaps `bounds`, row by row from the north-west. */
export function tilesCovering(bounds: GeoBounds, z: number): TileId[] {
  const maxIndex = 2 ** z - 1;
  const clamp = (v: number) => Math.min(Math.max(v, 0), maxIndex);
  const xMin = clamp(Math.floor(lonToTileX(bounds.west, z)));
  const xMax = clamp(Math.floor(lonToTileX(bounds.east, z)));
  const yMin = clamp(Math.floor(latToTileY(bounds.north, z)));
  const yMax = clamp(Math.floor(latToTileY(bounds.south, z)));
  const tiles: TileId[] = [];
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) tiles.push({ z, x, y });
  }
  return tiles;
}

/** Fills `{z}`, `{x}` and `{y}` in a template such as `https://host/{z}/{y}/{x}`. */
export function tileUrl(template: string, tile: TileId): string {
  return template
    .replaceAll('{z}', String(tile.z))
    .replaceAll('{x}', String(tile.x))
    .replaceAll('{y}', String(tile.y));
}
