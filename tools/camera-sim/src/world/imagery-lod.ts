import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  TextureLoader,
  type Texture,
} from 'three';

import type { LocalFrame } from '../geo/local-frame';
import { tilesCovering, tileUrl, type TileId } from '../geo/web-mercator-tiles';
import type { GroundModel } from '../terrain/sitl-ground';
import { groundBounds, segmentsFor, skirtDepthFor, tileMeshData } from './ground-tiles';
import { displayTiles, parentOf, selectTiles, tileKey, tileRect, type Viewpoint } from './tile-lod';

export interface ImageryLodSettings {
  readonly urlTemplate: string;
  readonly rootZoom: number;
  readonly maxZoom: number;
  readonly splitFactor: number;
  readonly extentM: number;
}

export interface ImageryStatus {
  readonly drawn: number;
  readonly finestZoom: number | undefined;
  readonly loading: number;
  readonly failed: number;
  readonly cached: number;
}

type NodeState = 'idle' | 'queued' | 'loading' | 'ready' | 'failed';

interface TileNode {
  readonly tile: TileId;
  readonly key: string;
  readonly mesh: Mesh<BufferGeometry, MeshBasicMaterial>;
  state: NodeState;
  texture: Texture | undefined;
  lastWantedMs: number;
}

const MAX_CONCURRENT_LOADS = 8;
const MAX_CACHED_TILES = 600;

/**
 * The ground: satellite imagery on terrain-shaped tiles, finer near every
 * camera. Coarse root tiles load first and stay loaded, so there is always
 * ground to draw; finer tiles replace them as they arrive.
 *
 * Every wanted tile's ancestors are loaded too, coarsest first. A tile still
 * loading is then stood in for by its parent, one level coarser over a small
 * area, rather than by a 4 km root that would blur everything around it.
 */
export class ImageryLod {
  public readonly group = new Group();
  private readonly _frame: LocalFrame;
  private readonly _ground: GroundModel;
  private readonly _settings: ImageryLodSettings;
  private readonly _roots: TileId[];
  private readonly _rootKeys: Set<string>;
  private readonly _nodes = new Map<string, TileNode>();
  private readonly _loader = new TextureLoader();
  private _fallback: Texture | undefined;
  private _wantedKeys = new Set<string>();
  private _drawnKeys = new Set<string>();
  private _loading = 0;

  public constructor(frame: LocalFrame, ground: GroundModel, settings: ImageryLodSettings) {
    this._frame = frame;
    this._ground = ground;
    this._settings = settings;
    this._loader.setCrossOrigin('anonymous');
    this.group.name = 'imagery';
    this._roots = tilesCovering(groundBounds(frame, settings.extentM), settings.rootZoom);
    this._rootKeys = new Set(this._roots.map(tileKey));
  }

  public get status(): ImageryStatus {
    let failed = 0;
    let finest: number | undefined;
    for (const node of this._nodes.values()) if (node.state === 'failed') failed++;
    for (const key of this._drawnKeys) {
      const z = this._nodes.get(key)?.tile.z;
      if (z !== undefined && (finest === undefined || z > finest)) finest = z;
    }
    return {
      drawn: this._drawnKeys.size,
      finestZoom: finest,
      loading: this._loading,
      failed,
      cached: this._nodes.size,
    };
  }

  /** Re-picks tiles for the cameras' current positions. Cheap enough to call a few times a second. */
  public update(viewpoints: readonly Viewpoint[], nowMs: number): void {
    const wanted = selectTiles(this._frame, this._roots, viewpoints, this._settings);
    const ancestors = new Map<string, TileId>();
    for (const tile of wanted) {
      for (
        let p = parentOf(tile);
        p !== undefined && p.z >= this._settings.rootZoom;
        p = parentOf(p)
      ) {
        ancestors.set(tileKey(p), p);
      }
    }
    const toLoad = [...this._roots, ...ancestors.values(), ...wanted];
    this._wantedKeys = new Set(toLoad.map(tileKey));
    for (const tile of toLoad) this._node(tile).lastWantedMs = nowMs;

    const drawn = displayTiles(wanted, (t) => this._isReady(t), this._settings.rootZoom);
    const drawnKeys = new Set(drawn.map(tileKey));
    for (const node of this._nodes.values()) node.mesh.visible = drawnKeys.has(node.key);
    this._drawnKeys = drawnKeys;

    this._pump();
    this._evict();
  }

  private _isReady(tile: TileId): boolean {
    const state = this._nodes.get(tileKey(tile))?.state;
    return state === 'ready' || state === 'failed';
  }

  private _node(tile: TileId): TileNode {
    const key = tileKey(tile);
    const existing = this._nodes.get(key);
    if (existing !== undefined) return existing;

    const rect = tileRect(this._frame, tile);
    const size = rect.north - rect.south;
    const data = tileMeshData(
      this._frame,
      tile,
      this._ground,
      segmentsFor(size),
      skirtDepthFor(size),
    );
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(data.uvs, 2));
    geometry.setIndex(data.indices);
    geometry.computeBoundingSphere();
    // Double-sided so skirts show from either side; unlit because imagery carries its own lighting.
    const material = new MeshBasicMaterial({ color: 0x6b7262, side: DoubleSide });
    const mesh = new Mesh(geometry, material);
    mesh.name = key;
    mesh.visible = false;
    this.group.add(mesh);

    const node: TileNode = { tile, key, mesh, state: 'idle', texture: undefined, lastWantedMs: 0 };
    this._nodes.set(key, node);
    return node;
  }

  /** Starts loads, coarsest first, for tiles still wanted. */
  private _pump(): void {
    if (this._loading >= MAX_CONCURRENT_LOADS) return;
    const pending = [...this._nodes.values()]
      .filter((n) => n.state === 'idle' && this._wantedKeys.has(n.key))
      .sort((a, b) => a.tile.z - b.tile.z);
    for (const node of pending) {
      if (this._loading >= MAX_CONCURRENT_LOADS) break;
      this._load(node);
    }
  }

  private _load(node: TileNode): void {
    node.state = 'loading';
    this._loading++;
    const finish = (texture: Texture, state: 'ready' | 'failed') => {
      this._loading--;
      if (!this._nodes.has(node.key)) {
        // Evicted while loading.
        if (state === 'ready') texture.dispose();
        return;
      }
      node.texture = state === 'ready' ? texture : undefined;
      node.state = state;
      node.mesh.material.map = texture;
      node.mesh.material.color.set(0xffffff);
      node.mesh.material.needsUpdate = true;
      this._pump();
    };
    this._loader.load(
      tileUrl(this._settings.urlTemplate, node.tile),
      (texture) => {
        texture.colorSpace = SRGBColorSpace;
        // Oblique views read the ground at a grazing angle; three.js clamps this to the GPU's limit.
        texture.anisotropy = 8;
        finish(texture, 'ready');
      },
      undefined,
      () => finish(this._fallbackTexture(), 'failed'),
    );
  }

  /** Frees the least recently wanted tiles once the cache is full. Roots and drawn tiles stay. */
  private _evict(): void {
    if (this._nodes.size <= MAX_CACHED_TILES) return;
    const candidates = [...this._nodes.values()]
      .filter(
        (n) =>
          !this._rootKeys.has(n.key) &&
          !this._drawnKeys.has(n.key) &&
          !this._wantedKeys.has(n.key) &&
          n.state !== 'loading',
      )
      .sort((a, b) => a.lastWantedMs - b.lastWantedMs);
    for (const node of candidates.slice(0, this._nodes.size - MAX_CACHED_TILES)) {
      this.group.remove(node.mesh);
      node.mesh.geometry.dispose();
      node.mesh.material.dispose();
      node.texture?.dispose();
      this._nodes.delete(node.key);
    }
  }

  /** A grey grid with a dark border, unmistakably "imagery missing". Shared by all failed tiles. */
  private _fallbackTexture(): Texture {
    if (this._fallback !== undefined) return this._fallback;
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
    this._fallback = new CanvasTexture(canvas);
    this._fallback.colorSpace = SRGBColorSpace;
    return this._fallback;
  }
}
