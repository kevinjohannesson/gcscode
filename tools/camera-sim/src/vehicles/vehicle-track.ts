import type { LocalFrame } from '../geo/local-frame';
import type { GlobalPosition } from '../telemetry/global-position';

/** Extrapolate along the last velocity for at most this long, then hold. */
export const MAX_EXTRAPOLATION_MS = 500;
/** With no position for this long the view is marked stale. */
export const STALE_AFTER_MS = 2000;
/** A disarmed vehicle slower than this is taken to be sitting on SITL's ground. */
export const STILL_SPEED_MPS = 0.3;
/** How far a landed vehicle may sit from the rendered ground before it counts as a mismatch. */
export const GROUND_CHECK_TOLERANCE_M = 1.5;

export interface VehiclePose {
  readonly east: number;
  readonly north: number;
  /** Metres above SITL's home altitude (the world origin's altitude). */
  readonly up: number;
  readonly headingDeg: number;
  /** Milliseconds since the position this pose is based on arrived. */
  readonly ageMs: number;
  readonly stale: boolean;
}

/**
 * Does the rendered ground agree with SITL's? A landed vehicle sits exactly on
 * SITL's ground, so its height above the rendered ground should be about zero.
 * If not, the origin altitude or the terrain setting doesn't match SITL.
 */
export type GroundCheck =
  | { readonly state: 'waiting' }
  | { readonly state: 'ok' | 'mismatch'; readonly heightAboveGroundM: number };

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
 * Height comes from the altitude above mean sea level, relative to SITL's
 * home altitude, so it stays right wherever the autopilot puts its home.
 */
export class VehicleTrack {
  public readonly systemId: number;
  private readonly _frame: LocalFrame;
  private readonly _originAltM: number;
  private _sample: Sample | undefined;
  private _headingDeg = 0;
  private _armed: boolean | undefined;
  private _groundCheck: GroundCheck = { state: 'waiting' };

  public constructor(systemId: number, frame: LocalFrame, originAltM: number) {
    this.systemId = systemId;
    this._frame = frame;
    this._originAltM = originAltM;
  }

  public update(position: GlobalPosition, receivedAtMs: number): void {
    const local = this._frame.toLocal({ lat: position.latDeg, lon: position.lonDeg });
    this._sample = {
      east: local.east,
      north: local.north,
      up: position.altAmslM - this._originAltM,
      velEast: position.velEastMps,
      velNorth: position.velNorthMps,
      velUp: position.velUpMps,
      receivedAtMs,
    };
    // An unknown heading keeps the last known one rather than snapping north.
    if (position.headingDeg !== null) this._headingDeg = position.headingDeg;
  }

  public setArmed(armed: boolean): void {
    this._armed = armed;
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

  /**
   * Re-runs the ground check when the vehicle is disarmed and still, and
   * returns the latest conclusive result, so the answer doesn't flicker
   * away the moment the vehicle takes off.
   */
  public checkGround(groundHeightAt: (east: number, north: number) => number): GroundCheck {
    const s = this._sample;
    const still = s !== undefined && Math.hypot(s.velEast, s.velNorth, s.velUp) < STILL_SPEED_MPS;
    if (s !== undefined && this._armed === false && still) {
      const heightAboveGroundM = s.up - groundHeightAt(s.east, s.north);
      this._groundCheck = {
        state: Math.abs(heightAboveGroundM) <= GROUND_CHECK_TOLERANCE_M ? 'ok' : 'mismatch',
        heightAboveGroundM,
      };
    }
    return this._groundCheck;
  }
}
