// The messages the station sends the page, protocol version 0 (packages/mavlink-station,
// src/snapshot.rs). The page sends nothing.

export const PROTOCOL = 0;

export interface RadioInput {
  readonly name: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly serial: string | null;
  readonly axes: readonly number[];
  readonly buttons: readonly boolean[];
  readonly hats: readonly number[];
}

export type StationMessage =
  | { readonly type: 'hello'; readonly protocol: number; readonly station: string }
  | {
      readonly type: 'input';
      readonly radio: RadioInput | null;
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
  if (m.type === 'input' && isNullable(m.radio, isRadio) && isNullable(m.eventsPerSecond, isInt)) {
    return { type: 'input', radio: m.radio, eventsPerSecond: m.eventsPerSecond };
  }
  return null;
}
