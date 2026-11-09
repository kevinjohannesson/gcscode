/**
 * Converts between WGS84 latitude/longitude and a local east/north frame in
 * metres, using exactly the flat-earth convention ArduPilot uses
 * (`libraries/AP_Common/Location.cpp`: `get_distance_NE` and `offset_latlng`).
 *
 * SITL integrates its physics in metres and reports lat/lon through that same
 * convention, so a frame built on it places the vehicle where SITL believes it
 * is — not where a more precise geodesic would put it. Over a few kilometres
 * the two differ by centimetres, but agreeing with SITL is the point.
 */

/** Metres per 1e-7 degree of latitude (`LATLON_TO_M` in `AP_Math/definitions.h`). */
export const LATLON_TO_M = 0.011131884502145034;

export interface GeoPoint {
  /** Degrees, positive north. */
  readonly lat: number;
  /** Degrees, positive east. */
  readonly lon: number;
}

export interface LocalPoint {
  /** Metres east of the frame origin. */
  readonly east: number;
  /** Metres north of the frame origin. */
  readonly north: number;
}

/** `Location::longitude_scale`: cos(latitude), floored at 0.01 near the poles. */
export function longitudeScale(latDeg: number): number {
  return Math.max(Math.cos((latDeg * Math.PI) / 180), 0.01);
}

/** Wraps a longitude difference into [-180, 180). */
function wrapLongitude(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

export class LocalFrame {
  private readonly _origin: GeoPoint;

  public constructor(origin: GeoPoint) {
    this._origin = origin;
  }

  public get origin(): GeoPoint {
    return this._origin;
  }

  /** `get_distance_NE`: longitude scaled at the mean latitude of the two points. */
  public toLocal(point: GeoPoint): LocalPoint {
    const dLatE7 = (point.lat - this._origin.lat) * 1e7;
    const dLonE7 = wrapLongitude(point.lon - this._origin.lon) * 1e7;
    const meanLat = (point.lat + this._origin.lat) / 2;
    return {
      east: dLonE7 * LATLON_TO_M * longitudeScale(meanLat),
      north: dLatE7 * LATLON_TO_M,
    };
  }

  /** `offset_latlng`: latitude first, then longitude scaled at the midpoint latitude. */
  public toGeo(point: LocalPoint): GeoPoint {
    const dLatDeg = point.north / LATLON_TO_M / 1e7;
    const midLat = this._origin.lat + dLatDeg / 2;
    const dLonDeg = point.east / LATLON_TO_M / longitudeScale(midLat) / 1e7;
    return {
      lat: this._origin.lat + dLatDeg,
      lon: wrapLongitude(this._origin.lon + dLonDeg),
    };
  }
}
