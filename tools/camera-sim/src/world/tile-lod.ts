import type { LocalFrame } from '../geo/local-frame';
import { tileBounds, type TileId } from '../geo/web-mercator-tiles';

/**
 * Picks which imagery tiles to draw: fine tiles near each camera, coarse ones
 * far away. A tile is split into its four children while a camera is closer
 * to it than `splitFactor` times its size. With a factor of 2, an imagery
 * pixel never covers more than about two video pixels until `maxZoom` stops
 * the splitting.
 */

/** A camera position in the local frame, metres; `up` is above the origin's altitude. */
export interface Viewpoint {
  readonly east: number;
  readonly north: number;
  readonly up: number;
}

export interface LodSettings {
  readonly maxZoom: number;
  readonly splitFactor: number;
}

export function tileKey(tile: TileId): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function childrenOf(tile: TileId): TileId[] {
  const z = tile.z + 1;
  const x = tile.x * 2;
  const y = tile.y * 2;
  return [
    { z, x, y },
    { z, x: x + 1, y },
    { z, x, y: y + 1 },
    { z, x: x + 1, y: y + 1 },
  ];
}

export function parentOf(tile: TileId): TileId | undefined {
  if (tile.z === 0) return undefined;
  return { z: tile.z - 1, x: Math.floor(tile.x / 2), y: Math.floor(tile.y / 2) };
}

/** The tile's edges in the local frame, metres. */
export function tileRect(frame: LocalFrame, tile: TileId) {
  const b = tileBounds(tile);
  const sw = frame.toLocal({ lat: b.south, lon: b.west });
  const ne = frame.toLocal({ lat: b.north, lon: b.east });
  return { west: sw.east, east: ne.east, south: sw.north, north: ne.north };
}

/** Straight-line distance from a viewpoint to the nearest point of a tile lying at height 0. */
export function distanceToTile(frame: LocalFrame, tile: TileId, viewpoint: Viewpoint): number {
  const r = tileRect(frame, tile);
  const dx = Math.max(r.west - viewpoint.east, 0, viewpoint.east - r.east);
  const dy = Math.max(r.south - viewpoint.north, 0, viewpoint.north - r.north);
  return Math.hypot(dx, dy, viewpoint.up);
}

/** The tiles to draw: a set that covers the roots exactly, with no tile drawn twice. */
export function selectTiles(
  frame: LocalFrame,
  roots: readonly TileId[],
  viewpoints: readonly Viewpoint[],
  settings: LodSettings,
): TileId[] {
  const leaves: TileId[] = [];
  const visit = (tile: TileId) => {
    if (tile.z < settings.maxZoom && viewpoints.length > 0) {
      const r = tileRect(frame, tile);
      const size = r.north - r.south;
      const nearest = Math.min(...viewpoints.map((v) => distanceToTile(frame, tile, v)));
      if (nearest < settings.splitFactor * size) {
        childrenOf(tile).forEach(visit);
        return;
      }
    }
    leaves.push(tile);
  };
  roots.forEach(visit);
  return leaves;
}

/**
 * What to actually draw while imagery loads. A wanted tile is drawn once its
 * imagery is ready; until then its nearest ready ancestor stands in for it.
 * An ancestor standing in hides every wanted tile beneath it, so the ground is
 * covered exactly once and nothing flickers through. Roots are kept loaded, so
 * after the first seconds there is always something to draw.
 */
export function displayTiles(
  wanted: readonly TileId[],
  isReady: (tile: TileId) => boolean,
  rootZoom: number,
): TileId[] {
  const chosen = new Map<string, TileId>();
  for (const tile of wanted) {
    let candidate: TileId | undefined = tile;
    while (candidate !== undefined && !isReady(candidate)) {
      candidate = candidate.z > rootZoom ? parentOf(candidate) : undefined;
    }
    if (candidate !== undefined) chosen.set(tileKey(candidate), candidate);
  }
  // Drop anything whose ancestor is also chosen.
  return [...chosen.values()].filter((tile) => {
    for (let p = parentOf(tile); p !== undefined && p.z >= rootZoom; p = parentOf(p)) {
      if (chosen.has(tileKey(p))) return false;
    }
    return true;
  });
}
