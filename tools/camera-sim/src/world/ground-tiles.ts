import {
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';

import type { LocalFrame } from '../geo/local-frame';
import {
  tileBounds,
  tilesCovering,
  tileUrl,
  type GeoBounds,
  type TileId,
} from '../geo/web-mercator-tiles';

export interface TileQuad {
  /** Scene coordinates (x east, y up, z south) of SW, SE, NE, NW. */
  readonly positions: readonly number[];
  /** Texture coordinates for the same corners; v = 1 is the tile image's top (north) edge. */
  readonly uvs: readonly number[];
  /** Two triangles, wound so the face points up (+y). */
  readonly indices: readonly number[];
}

/**
 * The flat quad one map tile covers. Each corner is placed through the local
 * frame, so the ground sits exactly where SITL's coordinates say it does.
 */
export function tileQuad(frame: LocalFrame, tile: TileId): TileQuad {
  const b = tileBounds(tile);
  const corners = [
    { lat: b.south, lon: b.west },
    { lat: b.south, lon: b.east },
    { lat: b.north, lon: b.east },
    { lat: b.north, lon: b.west },
  ].map((c) => frame.toLocal(c));
  return {
    positions: corners.flatMap((c) => [c.east, 0, -c.north]),
    uvs: [0, 0, 1, 0, 1, 1, 0, 1],
    indices: [0, 1, 2, 0, 2, 3],
  };
}

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

export interface GroundImagery {
  readonly urlTemplate: string;
  readonly zoom: number;
  readonly extentM: number;
}

export interface GroundTileStatus {
  readonly total: number;
  readonly loaded: number;
  readonly failed: number;
}

/**
 * Satellite tiles over the configured square, each on its own quad. A tile
 * that fails to load shows a grid instead, so a missing network or an
 * unreachable provider still leaves a usable, clearly-not-imagery ground.
 */
export class GroundTiles {
  public readonly group = new Group();
  private _loaded = 0;
  private _failed = 0;
  private readonly _total: number;

  public constructor(frame: LocalFrame, imagery: GroundImagery) {
    this.group.name = 'ground-tiles';
    const tiles = tilesCovering(groundBounds(frame, imagery.extentM), imagery.zoom);
    this._total = tiles.length;
    const loader = new TextureLoader();
    loader.setCrossOrigin('anonymous');
    const fallback = createFallbackTexture();

    for (const tile of tiles) {
      const quad = tileQuad(frame, tile);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(quad.positions, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(quad.uvs, 2));
      geometry.setIndex([...quad.indices]);
      const material = new MeshBasicMaterial({ color: 0x6b7262 });
      this.group.add(new Mesh(geometry, material));

      loader.load(
        tileUrl(imagery.urlTemplate, tile),
        (texture) => {
          prepareImageryTexture(texture);
          material.map = texture;
          material.color.set(0xffffff);
          material.needsUpdate = true;
          this._loaded++;
        },
        undefined,
        () => {
          material.map = fallback;
          material.color.set(0xffffff);
          material.needsUpdate = true;
          this._failed++;
        },
      );
    }
  }

  public get status(): GroundTileStatus {
    return { total: this._total, loaded: this._loaded, failed: this._failed };
  }
}

function prepareImageryTexture(texture: Texture): void {
  texture.colorSpace = SRGBColorSpace;
  // Oblique views read the ground at a grazing angle; anisotropic filtering
  // keeps it sharp. three.js clamps this to what the GPU supports.
  texture.anisotropy = 8;
}

/** A grey grid with a dark border: unmistakably "imagery missing". */
function createFallbackTexture(): Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#7d8471';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#5a5f50';
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.strokeStyle = '#3c3f35';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, size, size);
  }
  const texture = new CanvasTexture(canvas);
  prepareImageryTexture(texture);
  return texture;
}
