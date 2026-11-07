import type { LocalFrame } from '../geo/local-frame';
import { parseGlobalPosition } from '../telemetry/global-position';
import { VehicleTrack } from './vehicle-track';

/**
 * Every vehicle camera-sim has heard from, keyed by MAVLink system id.
 *
 * A vehicle exists once it reports a position: a GCS or a router also sends
 * heartbeats, but only an autopilot sends GLOBAL_POSITION_INT, so position is
 * the signal that there is something to film.
 */
export class VehicleRegistry {
  private readonly _frame: LocalFrame;
  private readonly _tracks = new Map<number, VehicleTrack>();
  private readonly _onVehicleAdded: (track: VehicleTrack) => void;

  public constructor(frame: LocalFrame, onVehicleAdded: (track: VehicleTrack) => void) {
    this._frame = frame;
    this._onVehicleAdded = onVehicleAdded;
  }

  public get tracks(): ReadonlyMap<number, VehicleTrack> {
    return this._tracks;
  }

  /** Applies one mavlink2rest envelope. Returns true if it moved a vehicle. */
  public applyMessage(json: unknown, receivedAtMs: number): boolean {
    const position = parseGlobalPosition(json);
    if (position === undefined) return false;
    let track = this._tracks.get(position.systemId);
    const isNew = track === undefined;
    if (track === undefined) {
      track = new VehicleTrack(position.systemId, this._frame);
      this._tracks.set(position.systemId, track);
    }
    track.update(position, receivedAtMs);
    // Announce after the first update so a listener always sees a pose.
    if (isNew) this._onVehicleAdded(track);
    return true;
  }
}
