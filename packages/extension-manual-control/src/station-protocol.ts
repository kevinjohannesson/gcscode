// The messages the station sends the page, protocol version 1 (packages/mavlink-station,
// src/snapshot.rs). The page sends nothing. Version 1 added `controls`. Which version
// the station speaks is not kept here: the MAVLink extension owns the station
// session and its protocol number (ADR-0015 Decision 3), and station-address.ts
// reads it from that extension's exports.

export interface RadioInput {
  readonly name: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly serial: string | null;
  readonly axes: readonly number[];
  readonly buttons: readonly boolean[];
  readonly hats: readonly number[];
}

/** The controls an axis can drive, in the station's order (tools/radio-probe, src/mapping.rs). */
export const AXIS_ROLES = [
  'roll',
  'pitch',
  'throttle',
  'yaw',
  'aux1',
  'aux2',
  'aux3',
  'aux4',
] as const;
export type AxisRole = (typeof AXIS_ROLES)[number];

/** The on/off controls, in the station's order. */
export const ON_OFF_ROLES = ['control', 'rtl'] as const;
export type OnOffRole = (typeof ON_OFF_ROLES)[number];

/** An axis control: `axis` and `percent` are null when the profile does not map it. */
export interface AxisControl {
  readonly role: AxisRole;
  readonly axis: number | null;
  readonly percent: number | null;
}

/** An on/off control: `button` and `on` are null when the profile does not map it. */
export interface OnOffControl {
  readonly role: OnOffRole;
  readonly button: number | null;
  readonly on: boolean | null;
}

/** A switch: `position` is null until one of its buttons has been seen pressed. */
export interface SwitchControl {
  readonly name: string;
  readonly buttons: readonly number[];
  readonly positions: readonly string[];
  readonly position: string | null;
}

/** The radio's input through the profile that matched it. */
export interface Controls {
  readonly profile: string;
  readonly axes: readonly AxisControl[];
  readonly onOff: readonly OnOffControl[];
  readonly switches: readonly SwitchControl[];
  readonly unmappedAxes: readonly number[];
  readonly unmappedButtons: readonly number[];
}

export type StationMessage =
  | { readonly type: 'hello'; readonly protocol: number; readonly station: string }
  | {
      readonly type: 'input';
      readonly radio: RadioInput | null;
      /** Null while no radio is open, or no profile is for it. */
      readonly controls: Controls | null;
      readonly eventsPerSecond: number | null;
    };

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isNullable = <T>(v: unknown, is: (v: unknown) => v is T): v is T | null =>
  v === null || is(v);
const isString = (v: unknown): v is string => typeof v === 'string';
const isArrayOf = <T>(v: unknown, is: (v: unknown) => v is T): v is T[] =>
  Array.isArray(v) && v.every(is);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function isRadio(v: unknown): v is RadioInput {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    isString(r.name) &&
    isInt(r.vendorId) &&
    isInt(r.productId) &&
    isNullable(r.serial, isString) &&
    isArrayOf(r.axes, isInt) &&
    isArrayOf(r.buttons, isBool) &&
    isArrayOf(r.hats, isInt)
  );
}

const isOneOf =
  <T extends string>(values: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (values as readonly string[]).includes(v);
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every role once, in the station's order, so the view never shows a control twice. */
const inRoleOrder = (items: readonly { role: string }[], roles: readonly string[]) =>
  items.length === roles.length && items.every((item, i) => item.role === roles[i]);

function isAxisControl(v: unknown): v is AxisControl {
  return (
    isRecord(v) &&
    isOneOf(AXIS_ROLES)(v.role) &&
    isNullable(v.axis, isInt) &&
    isNullable(v.percent, isInt) &&
    (v.axis === null) === (v.percent === null)
  );
}

function isOnOffControl(v: unknown): v is OnOffControl {
  return (
    isRecord(v) &&
    isOneOf(ON_OFF_ROLES)(v.role) &&
    isNullable(v.button, isInt) &&
    isNullable(v.on, isBool) &&
    (v.button === null) === (v.on === null)
  );
}

function isSwitchControl(v: unknown): v is SwitchControl {
  return (
    isRecord(v) &&
    isString(v.name) &&
    isArrayOf(v.buttons, isInt) &&
    isArrayOf(v.positions, isString) &&
    v.buttons.length === v.positions.length &&
    (v.position === null || (isString(v.position) && v.positions.includes(v.position)))
  );
}

function isControls(v: unknown): v is Controls {
  return (
    isRecord(v) &&
    isString(v.profile) &&
    isArrayOf(v.axes, isAxisControl) &&
    inRoleOrder(v.axes, AXIS_ROLES) &&
    isArrayOf(v.onOff, isOnOffControl) &&
    inRoleOrder(v.onOff, ON_OFF_ROLES) &&
    isArrayOf(v.switches, isSwitchControl) &&
    isArrayOf(v.unmappedAxes, isInt) &&
    isArrayOf(v.unmappedButtons, isInt)
  );
}

/** One message from the station, or null when the text is not one this page understands. */
export function parseStationMessage(text: string): StationMessage | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;
  if (m.type === 'hello' && isInt(m.protocol) && isString(m.station)) {
    return { type: 'hello', protocol: m.protocol, station: m.station };
  }
  if (
    m.type === 'input' &&
    isNullable(m.radio, isRadio) &&
    isNullable(m.controls, isControls) &&
    // The station maps only a radio it has open.
    (m.controls === null || m.radio !== null) &&
    isNullable(m.eventsPerSecond, isInt)
  ) {
    return {
      type: 'input',
      radio: m.radio,
      controls: m.controls,
      eventsPerSecond: m.eventsPerSecond,
    };
  }
  return null;
}
