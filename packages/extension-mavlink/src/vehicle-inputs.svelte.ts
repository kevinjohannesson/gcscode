/**
 * What the map is fed, kept per vehicle.
 *
 * The flight overlay reads one merged `telemetry` store, which every vehicle's
 * GLOBAL_POSITION_INT overwrites in turn. This tracker watches the same frames
 * before they are merged and keeps them apart by MAVLink system id, so the
 * Map input view can show each vehicle's latest position, heading and home,
 * when each was last received and last changed, and which message carried it.
 * It also remembers which system wrote the merged store last: that is the
 * vehicle the map is drawing right now.
 *
 * Read-only: it changes nothing the rest of the extension does, and a frame it
 * cannot read is skipped, never thrown on (it runs inside the WebSocket
 * handler, which does not catch).
 */

/** Where a reading came from: the sending system and component, and the message. */
export interface InputSource {
  readonly systemId: number;
  readonly componentId: number | null;
  readonly message: string;
}

/** One value as the map receives it, with its timing and origin. Times are ms since the epoch. */
export interface Reading<T> {
  readonly value: T;
  /** The last frame that carried this value, changed or not. */
  readonly receivedAt: number;
  /** The last frame whose value differed from the one before it. */
  readonly changedAt: number;
  readonly source: InputSource;
}

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface Position extends LatLng {
  /** Metres above home, as the telemetry store reads `relative_alt`. */
  readonly alt: number | null;
}

export interface VehicleInputs {
  readonly systemId: number;
  /** The last frame of any kind from this system. */
  readonly lastHeardAt: number;
  readonly position: Reading<Position> | null;
  /** Degrees, computed exactly as the telemetry store does (`hdg / 100`). */
  readonly heading: Reading<number> | null;
  readonly home: Reading<LatLng> | null;
}

/** The system whose frame the merged telemetry store holds now, and when it arrived. */
export interface MergedWriter {
  readonly systemId: number;
  readonly at: number;
}

interface Header {
  systemId: number;
  componentId: number | null;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function wholeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function headerOf(json: Record<string, unknown>): Header | null {
  const header = json['header'];
  if (typeof header !== 'object' || header === null) return null;
  const h = header as Record<string, unknown>;
  const systemId = wholeNumber(h['system_id']);
  if (systemId === null) return null;
  return { systemId, componentId: wholeNumber(h['component_id']) };
}

function samePosition(a: Position, b: Position): boolean {
  return a.lat === b.lat && a.lng === b.lng && a.alt === b.alt;
}

function sameLatLng(a: LatLng, b: LatLng): boolean {
  return a.lat === b.lat && a.lng === b.lng;
}

function next<T>(
  previous: Reading<T> | null,
  value: T,
  same: (a: T, b: T) => boolean,
  at: number,
  source: InputSource,
): Reading<T> {
  const changed = previous === null || !same(previous.value, value);
  return { value, receivedAt: at, changedAt: changed ? at : previous.changedAt, source };
}

export class VehicleInputsTracker {
  private _vehicles = $state<Mutable<VehicleInputs>[]>([]);
  private _mergedWriter = $state<MergedWriter | null>(null);

  private readonly now: () => number;

  public constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /** Every vehicle that has sent a position or a home, by system id. A quiet one stays. */
  public get vehicles(): readonly VehicleInputs[] {
    return this._vehicles;
  }

  public get mergedWriter(): MergedWriter | null {
    return this._mergedWriter;
  }

  /** Called for every frame the client delivers, alongside the telemetry store. */
  public onMessage(json: unknown): void {
    if (typeof json !== 'object' || json === null) return;
    const obj = json as Record<string, unknown>;
    const header = headerOf(obj);
    if (header === null) return;
    const message = obj['message'];
    if (typeof message !== 'object' || message === null) return;
    const msg = message as Record<string, unknown>;
    const type = msg['type'];
    if (typeof type !== 'string') return;

    const at = this.now();
    const source: InputSource = { ...header, message: type };

    if (type === 'GLOBAL_POSITION_INT') {
      const lat = finite(msg['lat']);
      const lon = finite(msg['lon']);
      const relativeAlt = finite(msg['relative_alt']);
      const hdg = finite(msg['hdg']);
      if (lat === null || lon === null) {
        this.heard(header.systemId, at);
        return;
      }
      const vehicle = this.vehicle(header.systemId, at);
      vehicle.position = next(
        vehicle.position,
        { lat: lat / 1e7, lng: lon / 1e7, alt: relativeAlt === null ? null : relativeAlt / 1000 },
        samePosition,
        at,
        source,
      );
      if (hdg !== null) {
        vehicle.heading = next(vehicle.heading, hdg / 100, (a, b) => a === b, at, source);
      }
      this._mergedWriter = { systemId: header.systemId, at };
      return;
    }

    if (type === 'HOME_POSITION') {
      const lat = finite(msg['latitude']);
      const lon = finite(msg['longitude']);
      if (lat === null || lon === null) {
        this.heard(header.systemId, at);
        return;
      }
      const vehicle = this.vehicle(header.systemId, at);
      vehicle.home = next(vehicle.home, { lat: lat / 1e7, lng: lon / 1e7 }, sameLatLng, at, source);
      return;
    }

    this.heard(header.systemId, at);
  }

  public reset(): void {
    this._vehicles = [];
    this._mergedWriter = null;
  }

  /** Marks a known vehicle as heard. Other frames never add a row: a ground station's own heartbeat is not a vehicle. */
  private heard(systemId: number, at: number): void {
    const vehicle = this._vehicles.find((v) => v.systemId === systemId);
    if (vehicle !== undefined) vehicle.lastHeardAt = at;
  }

  private vehicle(systemId: number, at: number): Mutable<VehicleInputs> {
    let vehicle = this._vehicles.find((v) => v.systemId === systemId);
    if (vehicle === undefined) {
      this._vehicles.push({ systemId, lastHeardAt: at, position: null, heading: null, home: null });
      this._vehicles.sort((a, b) => a.systemId - b.systemId);
      // The pushed object came back as a state proxy; write through that one.
      vehicle = this._vehicles.find((v) => v.systemId === systemId)!;
    }
    vehicle.lastHeardAt = at;
    return vehicle;
  }
}

export const vehicleInputs = new VehicleInputsTracker();
