/**
 * The pure half of the MAVLink asset adapter: `MAV_TYPE` -> gcscode's airframe
 * vocabulary, and the sender id out of an envelope header. Deliberately free
 * of registry and client imports so it unit-tests without either.
 */

import type { Airframe } from '@gcscode/extension-assets';

const MULTIROTOR =
  /^MAV_TYPE_(TRICOPTER|QUADROTOR|HEXAROTOR|OCTOROTOR|DECAROTOR|DODECAROTOR|GENERIC_MULTIROTOR)$/;
/** Anything the vocabulary can assert does not fly, in the spec's three
 *  sub-families: ground and surface craft, ground stations and trackers, and
 *  peripherals or payloads carried by something else. A family rule, not an
 *  enumeration — `none` is a claim about flight, not about importance. */
const NON_FLYING =
  /^MAV_TYPE_(GROUND_ROVER|GROUND_QUADRUPED|SURFACE_BOAT|SUBMARINE|GCS|ANTENNA_TRACKER|GIMBAL|CAMERA|SERVO|WINCH|ONBOARD_CONTROLLER|ADSB|ODID|BATTERY|ILLUMINATOR|GRIPPER|FLARM|LOG|OSD|IMU|GPS|CHARGING_STATION)$/;

/**
 * Every `MAV_TYPE` ordinal whose name the rules below give a word to — so that
 * the numeric form and the enum-name form always agree, which the spec asserts
 * as a flat claim. Ordinal 4 is carried even though the fallback already
 * answers `unknown` for it: if `rotary-wing` ever joins the vocabulary, a
 * HELICOPTER rule would otherwise be picked up by the enum-name form and
 * silently missed by the numeric one.
 *
 * Read out of MAVLink's `minimal.xml` — where `MAV_TYPE` is defined, not
 * `common.xml` — in the mavlink submodule of the ArduPilot checkout driving
 * the SITL this module was measured against. Any ordinal absent here is
 * reported `unknown` rather than named incorrectly.
 */
const NAME_BY_ORDINAL: Record<number, string> = {
  1: 'MAV_TYPE_FIXED_WING',
  2: 'MAV_TYPE_QUADROTOR',
  4: 'MAV_TYPE_HELICOPTER',
  5: 'MAV_TYPE_ANTENNA_TRACKER',
  6: 'MAV_TYPE_GCS',
  10: 'MAV_TYPE_GROUND_ROVER',
  11: 'MAV_TYPE_SURFACE_BOAT',
  12: 'MAV_TYPE_SUBMARINE',
  13: 'MAV_TYPE_HEXAROTOR',
  14: 'MAV_TYPE_OCTOROTOR',
  15: 'MAV_TYPE_TRICOPTER',
  18: 'MAV_TYPE_ONBOARD_CONTROLLER',
  19: 'MAV_TYPE_VTOL_DUOROTOR',
  20: 'MAV_TYPE_VTOL_QUADROTOR',
  21: 'MAV_TYPE_VTOL_TILTROTOR',
  22: 'MAV_TYPE_VTOL_RESERVED2',
  23: 'MAV_TYPE_VTOL_RESERVED3',
  24: 'MAV_TYPE_VTOL_RESERVED4',
  25: 'MAV_TYPE_VTOL_RESERVED5',
  26: 'MAV_TYPE_GIMBAL',
  27: 'MAV_TYPE_ADSB',
  29: 'MAV_TYPE_DODECAROTOR',
  30: 'MAV_TYPE_CAMERA',
  31: 'MAV_TYPE_CHARGING_STATION',
  32: 'MAV_TYPE_FLARM',
  33: 'MAV_TYPE_SERVO',
  34: 'MAV_TYPE_ODID',
  35: 'MAV_TYPE_DECAROTOR',
  36: 'MAV_TYPE_BATTERY',
  38: 'MAV_TYPE_LOG',
  39: 'MAV_TYPE_OSD',
  40: 'MAV_TYPE_IMU',
  41: 'MAV_TYPE_GPS',
  42: 'MAV_TYPE_WINCH',
  43: 'MAV_TYPE_GENERIC_MULTIROTOR',
  44: 'MAV_TYPE_ILLUMINATOR',
  46: 'MAV_TYPE_GROUND_QUADRUPED',
  47: 'MAV_TYPE_VTOL_GYRODYNE',
  48: 'MAV_TYPE_GRIPPER',
};

/** The mapping table itself. Every branch is an assertion about the asset, so
 *  the fallback is `unknown` — "gcscode has no word for this" — never a guess. */
function airframeFromName(name: string): Airframe | undefined {
  // A string is only an assertion if it is shaped like a `MAV_TYPE` name.
  // Anything else is an unreadable value, not an unnameable one.
  if (!name.startsWith('MAV_TYPE_')) return undefined;
  // A family rule, not an enumeration: every rotor count and the generic. Where
  // the vocabulary can name something it must, so a ten-rotor aircraft is named
  // rather than sent to `unknown`. COAXIAL and HELICOPTER stay out — rotary-wing
  // but not multirotor, which is the genuine gap.
  if (MULTIROTOR.test(name)) return { kind: 'multirotor' };
  if (name === 'MAV_TYPE_FIXED_WING') return { kind: 'fixed-wing' };
  // Prefix rather than enumeration: the VTOL family has been renamed upstream
  // (the dialect behind this SITL still spells 23 `VTOL_RESERVED3`, where
  // newer MAVLink spells it `VTOL_TAILSITTER`) and a prefix survives that.
  if (name.startsWith('MAV_TYPE_VTOL_')) return { kind: 'vtol' };
  if (NON_FLYING.test(name)) return { kind: 'none' };
  // Includes MAV_TYPE_HELICOPTER: rotary-wing but not multirotor, and gcscode
  // has no word for it. Calling it `multirotor` would be a lie a consumer
  // cannot detect. See the spec's Known unknowns.
  return { kind: 'unknown' };
}

/**
 * An absent return means **not asserted** — no readable `MAV_TYPE` was
 * present. That is deliberately distinct from `{ kind: 'unknown' }`, which
 * asserts the adapter saw a type gcscode has no word for. Collapsing the two
 * loses the distinction the vocabulary is built on: a registry of assets with
 * no airframe is indistinguishable from a fleet whose airframes nobody
 * asserted.
 *
 * Three input forms are accepted. mavlink2rest wraps plain enums as
 * `{ type: 'MAV_TYPE_*' }` — measured against a live stream, and the only form
 * that occurs in practice. The bare string is accepted because the repo's
 * existing parser tolerates it for the `base_mode` bitfield, and the number
 * because that parser tolerates numbers too.
 */
export function airframeFromMavType(value: unknown): Airframe | undefined {
  if (typeof value === 'object' && value !== null) {
    const inner = (value as { type?: unknown }).type;
    return typeof inner === 'string' ? airframeFromName(inner) : undefined;
  }
  if (typeof value === 'string') return airframeFromName(value);
  if (typeof value === 'number') {
    // An ordinal is a non-negative integer. Anything else — fractional, signed,
    // NaN, Infinity — is malformed rather than an assertion gcscode cannot name.
    if (!Number.isInteger(value) || value < 0) return undefined;
    const name: string | undefined = NAME_BY_ORDINAL[value];
    // A number the vehicle sent IS an assertion even when this module has no
    // name for the ordinal, so the honest answer is `unknown`, not absent.
    return name === undefined ? { kind: 'unknown' } : airframeFromName(name);
  }
  return undefined;
}

/** The asset's `localId`, read from the envelope header the rest of this
 *  package has never needed. `applyMessage` reads `message` and nothing else. */
export function systemIdOf(json: unknown): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const header = (json as { header?: unknown }).header;
  if (typeof header !== 'object' || header === null) return undefined;
  const id = (header as { system_id?: unknown }).system_id;
  return typeof id === 'number' ? String(id) : undefined;
}
