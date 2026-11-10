import type { GeoPoint } from '../geo/local-frame';
import type { TerrainDatabase } from './ap-terrain';

/** Where the ground is, in metres relative to SITL's home altitude. */
export interface GroundModel {
  heightAt(point: GeoPoint): number;
}

/** ArduPilot `Location` units: degrees × 10^7, as integers. */
export function toE7(degrees: number): number {
  return Math.round(degrees * 1e7);
}

/**
 * The ground exactly as SITL simulates it (`SIM_Aircraft::ground_height_difference`):
 * with `SIM_TERRAIN` on, the ground at a location sits at
 * `home_alt + terrain(location) − terrain(home)`, using uncorrected terrain
 * heights; wherever either lookup has no data, it is flat at home altitude.
 *
 * `home` is SITL's start location (`SIM_OPOS_*`, `--home`), which is
 * camera-sim's world origin. Heights here are relative to home altitude.
 */
export class SitlGround implements GroundModel {
  private readonly _terrain: TerrainDatabase;
  private readonly _homeHeight: number | undefined;

  public constructor(terrain: TerrainDatabase, home: GeoPoint) {
    this._terrain = terrain;
    this._homeHeight = terrain.heightAmslE7(toE7(home.lat), toE7(home.lon));
  }

  /** Whether SITL has terrain at home at all; without it, its whole world is flat. */
  public get hasHomeTerrain(): boolean {
    return this._homeHeight !== undefined;
  }

  public heightAt(point: GeoPoint): number {
    if (this._homeHeight === undefined) return 0;
    const height = this._terrain.heightAmslE7(toE7(point.lat), toE7(point.lon));
    return height === undefined ? 0 : height - this._homeHeight;
  }
}

/** SITL with `SIM_TERRAIN 0`: flat at home altitude everywhere. */
export const FLAT_GROUND: GroundModel = { heightAt: () => 0 };
