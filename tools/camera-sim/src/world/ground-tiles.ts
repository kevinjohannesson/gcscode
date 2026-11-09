import type { LocalFrame } from '../geo/local-frame';
import { tileXToLon, tileYToLat, type GeoBounds, type TileId } from '../geo/web-mercator-tiles';
import type { GroundModel } from '../terrain/sitl-ground';

/** The lat/lon box enclosing a square of `extentM` metres centred on the frame origin. */
export function groundBounds(frame: LocalFrame, extentM: number): GeoBounds {
  const h = extentM / 2;
  const corners = [
    frame.toGeo({ east: -h, north: -h }),
    frame.toGeo({ east: h, north: -h }),
    frame.toGeo({ east: h, north: h }),
    frame.toGeo({ east: -h, north: h }),
  ];
  return {
    south: Math.min(...corners.map((c) => c.lat)),
    north: Math.max(...corners.map((c) => c.lat)),
    west: Math.min(...corners.map((c) => c.lon)),
    east: Math.max(...corners.map((c) => c.lon)),
  };
}

/**
 * Grid resolution for a tile: about one vertex every 50 m (half SITL's 100 m
 * terrain spacing), at least 4 and at most 32 segments a side.
 */
export function segmentsFor(tileSizeM: number): number {
  return Math.min(32, Math.max(4, Math.ceil(tileSizeM / 50)));
}

/** How far a tile's skirt hangs below its edge: enough to hide seams between detail levels. */
export function skirtDepthFor(tileSizeM: number): number {
  return Math.min(200, Math.max(2, tileSizeM * 0.1));
}

export interface TileMeshData {
  /** Scene coordinates (x east, y up, z south): the grid row by row from the north edge, then the skirt. */
  readonly positions: number[];
  /** v = 1 is the tile image's top (north) edge. */
  readonly uvs: number[];
  readonly indices: number[];
}

/**
 * A tile as a grid shaped to the ground, plus a skirt hanging below its four
 * edges. Rows are spaced evenly in Web Mercator, not latitude, so the imagery
 * maps onto the grid without stretching.
 */
export function tileMeshData(
  frame: LocalFrame,
  tile: TileId,
  ground: GroundModel,
  segments: number,
  skirtDepth: number,
): TileMeshData {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const side = segments + 1;
  const index = (i: number, j: number) => j * side + i;

  for (let j = 0; j <= segments; j++) {
    const lat = tileYToLat(tile.y + j / segments, tile.z);
    for (let i = 0; i <= segments; i++) {
      const lon = tileXToLon(tile.x + i / segments, tile.z);
      const local = frame.toLocal({ lat, lon });
      positions.push(local.east, ground.heightAt({ lat, lon }), -local.north);
      uvs.push(i / segments, 1 - j / segments);
    }
  }
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const nw = index(i, j);
      const ne = index(i + 1, j);
      const sw = index(i, j + 1);
      const se = index(i + 1, j + 1);
      indices.push(sw, se, ne, sw, ne, nw); // faces up (+y)
    }
  }

  // Skirt: each edge's vertices again, lowered, joined to the edge.
  const edges = [
    Array.from({ length: side }, (_, i) => index(i, 0)), // north
    Array.from({ length: side }, (_, j) => index(segments, j)), // east
    Array.from({ length: side }, (_, i) => index(segments - i, segments)), // south
    Array.from({ length: side }, (_, j) => index(0, segments - j)), // west
  ];
  for (const edge of edges) {
    const first = positions.length / 3;
    for (const v of edge) {
      positions.push(positions[v * 3]!, positions[v * 3 + 1]! - skirtDepth, positions[v * 3 + 2]!);
      uvs.push(uvs[v * 2]!, uvs[v * 2 + 1]!);
    }
    for (let k = 0; k < segments; k++) {
      const a = edge[k]!;
      const b = edge[k + 1]!;
      indices.push(a, b, first + k + 1, a, first + k + 1, first + k);
    }
  }
  return { positions, uvs, indices };
}
