import type { GlobalPosition } from '../telemetry/global-position';
import type { LocalFrame } from '../geo/local-frame';

/** Extrapolate along the last velocity for at most this long, then hold. */
export const MAX_EXTRAPOLATION_MS = 500;
/** With no position for this long the view is marked stale. */
export const STALE_AFTER_MS = 2000;

export interface VehiclePose {
  readonly east: number;
  readonly north: number;
  /** Height above the ground plane, metres. */
  readonly up: number;
  readonly headingDeg: number;
  /** Milliseconds since the position this pose is based on arrived. */
  readonly ageMs: number;
  readonly stale: boolean;
}

interface Sample {
  readonly east: number;
  readonly north: number;
  readonly up: number;
  readonly velEast: number;
  readonly velNorth: number;
  readonly velUp: number;
  readonly receivedAtMs: number;
}

/**
 * One vehicle's latest position and a prediction of where it is now.
 *
 * Positions arrive a few times a second; video runs at 30 fps. Between
 * samples the pose moves along the reported velocity, capped so a vehicle
 * whose telemetry stops doesn't drift away.
 *
 * Spike scope: the world is flat (SITL with `SIM_TERRAIN 0`), so the height
 * above the ground plane is GLOBAL_POSITION_INT's altitude above home.
 */
export class VehicleTrack {
  public readonly systemId: number;
  private readonly _frame: LocalFrame;
  private _sample: Sample | undefined;
  private _headingDeg = 0;

  public constructor(systemId: number, frame: LocalFrame) {
    this.systemId = systemId;
    this._frame = frame;
  }

  public update(position: GlobalPosition, receivedAtMs: number): void {
    const local = this._frame.toLocal({ lat: position.latDeg, lon: position.lonDeg });
    this._sample = {
      east: local.east,
      north: local.north,
      up: position.relativeAltM,
      velEast: position.velEastMps,
      velNorth: position.velNorthMps,
      velUp: position.velUpMps,
      receivedAtMs,
    };
    // An unknown heading keeps the last known one rather than snapping north.
    if (position.headingDeg !== null) this._headingDeg = position.headingDeg;
  }

  public predict(nowMs: number): VehiclePose | undefined {
    const s = this._sample;
    if (s === undefined) return undefined;
    const ageMs = Math.max(nowMs - s.receivedAtMs, 0);
    const dt = Math.min(ageMs, MAX_EXTRAPOLATION_MS) / 1000;
    return {
      east: s.east + s.velEast * dt,
      north: s.north + s.velNorth * dt,
      up: s.up + s.velUp * dt,
      headingDeg: this._headingDeg,
      ageMs,
      stale: ageMs > STALE_AFTER_MS,
    };
  }
}
