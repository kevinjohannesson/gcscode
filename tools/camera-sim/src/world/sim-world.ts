import { Color, Fog, Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three';

import { IMAGERY_ROOT_ZOOM, IMAGERY_SPLIT_FACTOR, type SimConfig } from '../config';
import type { LocalFrame } from '../geo/local-frame';
import type { GroundModel } from '../terrain/sitl-ground';
import { ImageryLod } from './imagery-lod';
import { createMarkers } from './markers';
import type { Viewpoint } from './tile-lod';

const SKY = 0xa9c4dc;

/** The lowest ground in the square, sampled on a grid; the surround plane sits below it. */
export function lowestGround(
  frame: LocalFrame,
  ground: GroundModel,
  extentM: number,
  samples = 41,
): number {
  let lowest = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const east = (i / (samples - 1) - 0.5) * extentM;
      const north = (j / (samples - 1) - 0.5) * extentM;
      lowest = Math.min(lowest, ground.heightAt(frame.toGeo({ east, north })));
    }
  }
  return lowest;
}

/**
 * The shared scene every vehicle camera renders: SITL's ground with satellite
 * imagery, the check markers, and sky. Heights are metres relative to SITL's
 * home altitude. Everything is unlit: imagery carries its own lighting.
 */
export class SimWorld {
  public readonly scene = new Scene();
  public readonly imagery: ImageryLod;
  private readonly _frame: LocalFrame;
  private readonly _ground: GroundModel;

  public constructor(frame: LocalFrame, config: SimConfig, ground: GroundModel) {
    this._frame = frame;
    this._ground = ground;
    const extent = config.imagery.extentM;
    this.scene.background = new Color(SKY);
    // Fog hides the edge of the world without a hard seam.
    this.scene.fog = new Fog(SKY, extent * 0.6, extent * 1.5);

    // Plain ground beyond the world's edge, below the lowest terrain so it never shows through.
    const surround = new Mesh(
      new PlaneGeometry(extent * 20, extent * 20),
      new MeshBasicMaterial({ color: 0x5f6656 }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = lowestGround(frame, ground, extent) - 2;
    this.scene.add(surround);

    this.imagery = new ImageryLod(frame, ground, {
      urlTemplate: config.imagery.urlTemplate,
      rootZoom: IMAGERY_ROOT_ZOOM,
      maxZoom: config.imagery.maxZoom,
      splitFactor: IMAGERY_SPLIT_FACTOR,
      extentM: extent,
    });
    this.scene.add(this.imagery.group);
    this.scene.add(createMarkers(frame, ground, config.markers));
  }

  /** Re-picks imagery detail for where the cameras are now. */
  public update(viewpoints: readonly Viewpoint[], nowMs: number): void {
    this.imagery.update(viewpoints, nowMs);
  }

  /** SITL's ground height at a point in the local frame, metres above home altitude. */
  public groundHeightLocal(east: number, north: number): number {
    return this._ground.heightAt(this._frame.toGeo({ east, north }));
  }
}
