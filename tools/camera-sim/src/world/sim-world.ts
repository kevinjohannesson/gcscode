import { Color, Fog, Mesh, MeshBasicMaterial, PlaneGeometry, Scene } from 'three';

import type { SimConfig } from '../config';
import type { LocalFrame } from '../geo/local-frame';
import { GroundTiles } from './ground-tiles';
import { createMarkers } from './markers';

const SKY = 0xa9c4dc;

/**
 * The shared scene every vehicle camera renders. Spike scope: a flat world at
 * home altitude, matching SITL run with `SIM_TERRAIN 0`. Everything is unlit
 * (`MeshBasicMaterial`): satellite imagery already carries its own lighting.
 */
export class SimWorld {
  public readonly scene = new Scene();
  public readonly ground: GroundTiles;

  public constructor(frame: LocalFrame, config: SimConfig) {
    this.scene.background = new Color(SKY);
    // Fog hides the edge of the imagery square without a hard seam.
    this.scene.fog = new Fog(SKY, config.imagery.extentM * 1.5, config.imagery.extentM * 6);

    // Plain ground beyond the imagery, a hair lower so the tiles always win.
    const surround = new Mesh(
      new PlaneGeometry(config.imagery.extentM * 20, config.imagery.extentM * 20),
      new MeshBasicMaterial({ color: 0x5f6656 }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.2;
    this.scene.add(surround);

    this.ground = new GroundTiles(frame, config.imagery);
    this.scene.add(this.ground.group);
    this.scene.add(createMarkers(frame, config.markers));
  }
}
