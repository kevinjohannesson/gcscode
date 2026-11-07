/**
 * Reads GLOBAL_POSITION_INT out of a mavlink2rest WebSocket envelope:
 * `{ header: { system_id, component_id, sequence }, message: { type, ... } }`.
 *
 * Same shape `extension-sitl` reads, parsed independently: camera-sim never
 * imports GCS packages.
 */

/** MAVLink's "unknown" value for GLOBAL_POSITION_INT.hdg (UINT16_MAX). */
export const HEADING_UNKNOWN = 65535;

export interface GlobalPosition {
  readonly systemId: number;
  readonly latDeg: number;
  readonly lonDeg: number;
  /** Altitude above mean sea level, metres. */
  readonly altAmslM: number;
  /** Altitude above home, metres. */
  readonly relativeAltM: number;
  readonly velNorthMps: number;
  readonly velEastMps: number;
  /** Positive up (MAVLink's vz is positive down). */
  readonly velUpMps: number;
  /** Degrees clockwise from north, or null when the vehicle doesn't know. */
  readonly headingDeg: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Returns the position, or undefined for any other message or a malformed one. */
export function parseGlobalPosition(json: unknown): GlobalPosition | undefined {
  if (!isRecord(json) || !isRecord(json.header) || !isRecord(json.message)) return undefined;
  const { header, message } = json;
  if (message.type !== 'GLOBAL_POSITION_INT') return undefined;

  const systemId = numberField(header, 'system_id');
  if (systemId === undefined || !Number.isInteger(systemId) || systemId < 0) return undefined;

  const lat = numberField(message, 'lat');
  const lon = numberField(message, 'lon');
  const alt = numberField(message, 'alt');
  const relativeAlt = numberField(message, 'relative_alt');
  const vx = numberField(message, 'vx');
  const vy = numberField(message, 'vy');
  const vz = numberField(message, 'vz');
  const hdg = numberField(message, 'hdg');
  if (
    lat === undefined ||
    lon === undefined ||
    alt === undefined ||
    relativeAlt === undefined ||
    vx === undefined ||
    vy === undefined ||
    vz === undefined ||
    hdg === undefined
  ) {
    return undefined;
  }

  return {
    systemId,
    latDeg: lat / 1e7,
    lonDeg: lon / 1e7,
    altAmslM: alt / 1000,
    relativeAltM: relativeAlt / 1000,
    velNorthMps: vx / 100,
    velEastMps: vy / 100,
    velUpMps: -vz / 100,
    headingDeg: hdg === HEADING_UNKNOWN ? null : hdg / 100,
  };
}
