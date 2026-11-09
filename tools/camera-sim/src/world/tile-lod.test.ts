import { describe, expect, it } from 'vitest';

import { LocalFrame } from '../geo/local-frame';
import { tilesCovering, type TileId } from '../geo/web-mercator-tiles';
import { groundBounds } from './ground-tiles';
import { childrenOf, displayTiles, parentOf, selectTiles, tileKey } from './tile-lod';

const CMAC = { lat: -35.363262, lon: 149.165237 };
const frame = new LocalFrame(CMAC);
const ROOT = { z: 13, x: 7490, y: 4957 }; // the z13 tile under CMAC, ~3989 m on a side
const settings = { maxZoom: 22, splitFactor: 2 };

const contains = (outer: TileId, inner: TileId) =>
  inner.z >= outer.z &&
  Math.floor(inner.x / 2 ** (inner.z - outer.z)) === outer.x &&
  Math.floor(inner.y / 2 ** (inner.z - outer.z)) === outer.y;

describe('tile family', () => {
  it('has four children and one parent', () => {
    expect(childrenOf({ z: 1, x: 1, y: 0 })).toEqual([
      { z: 2, x: 2, y: 0 },
      { z: 2, x: 3, y: 0 },
      { z: 2, x: 2, y: 1 },
      { z: 2, x: 3, y: 1 },
    ]);
    expect(parentOf({ z: 2, x: 3, y: 1 })).toEqual({ z: 1, x: 1, y: 0 });
    expect(parentOf({ z: 0, x: 0, y: 0 })).toBeUndefined();
    expect(tileKey({ z: 18, x: 239690, y: 158632 })).toBe('18/239690/158632');
  });
});

describe('selectTiles', () => {
  it('draws the roots as they are with no camera, or one far above', () => {
    expect(selectTiles(frame, [ROOT], [], settings)).toEqual([ROOT]);
    expect(selectTiles(frame, [ROOT], [{ east: 0, north: 0, up: 100000 }], settings)).toEqual([
      ROOT,
    ]);
  });

  it('refines to 15.6 m tiles (z21) under a camera 50 m up: z20’s 31.2 m tile is still within 2× its size', () => {
    const leaves = selectTiles(frame, [ROOT], [{ east: 0, north: 0, up: 50 }], settings);
    const under = leaves.find((t) => contains(t, { z: 22, x: 1917526 * 2, y: 1269063 * 2 }));
    expect(under).toEqual({ z: 21, x: 1917526, y: 1269063 });
  });

  it('stops at maxZoom', () => {
    const leaves = selectTiles(frame, [ROOT], [{ east: 0, north: 0, up: 50 }], {
      ...settings,
      maxZoom: 19,
    });
    expect(Math.max(...leaves.map((t) => t.z))).toBe(19);
  });

  it('covers the roots exactly once', () => {
    const roots = tilesCovering(groundBounds(frame, 8000), 13);
    const leaves = selectTiles(frame, roots, [{ east: 0, north: 0, up: 50 }], settings);
    const area = leaves.reduce((sum, t) => sum + 4 ** (13 - t.z), 0);
    expect(area).toBeCloseTo(roots.length, 12);
    // One expect for all ~440² pairs: an expect per pair takes seconds.
    const nested = leaves.flatMap((a) =>
      leaves.filter((b) => a !== b && contains(a, b)).map((b) => `${tileKey(a)} ⊇ ${tileKey(b)}`),
    );
    expect(nested).toEqual([]);
  });

  it('refines around every camera, so two drones 3 km apart both get fine imagery', () => {
    const roots = tilesCovering(groundBounds(frame, 8000), 13);
    const views = [
      { east: 0, north: 0, up: 50 },
      { east: 3000, north: 0, up: 50 },
    ];
    const leaves = selectTiles(frame, roots, views, { ...settings, maxZoom: 19 });
    const finest = leaves.filter((t) => t.z === 19);
    const eastOf = (t: TileId) =>
      frame.toLocal({ lat: CMAC.lat, lon: ((t.x + 0.5) / 2 ** 19) * 360 - 180 }).east;
    expect(finest.some((t) => Math.abs(eastOf(t)) < 100)).toBe(true);
    expect(finest.some((t) => Math.abs(eastOf(t) - 3000) < 100)).toBe(true);
  });
});

describe('displayTiles', () => {
  const kids = childrenOf(ROOT);
  const ready = (...tiles: TileId[]) => {
    const keys = new Set(tiles.map(tileKey));
    return (t: TileId) => keys.has(tileKey(t));
  };

  it('draws wanted tiles that are ready', () => {
    expect(displayTiles(kids, ready(ROOT, ...kids), 13)).toEqual(kids);
  });

  it('stands the parent in for all four while any child is still loading', () => {
    expect(displayTiles(kids, ready(ROOT, kids[0]!, kids[1]!, kids[2]!), 13)).toEqual([ROOT]);
  });

  it('skips generations to the nearest ready ancestor', () => {
    const grandchild = childrenOf(kids[3]!)[0]!;
    expect(displayTiles([grandchild], ready(ROOT), 13)).toEqual([ROOT]);
    expect(displayTiles([grandchild], ready(ROOT, kids[3]!), 13)).toEqual([kids[3]]);
  });

  it('draws nothing for a root that is not ready yet, and never looks above the roots', () => {
    expect(displayTiles([ROOT], ready(parentOf(ROOT)!), 13)).toEqual([]);
  });
});
