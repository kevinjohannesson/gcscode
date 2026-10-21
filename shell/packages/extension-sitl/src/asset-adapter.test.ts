import { describe, expect, it } from 'vitest';

import { airframeFromMavType, systemIdOf } from './asset-adapter';

describe('airframeFromMavType', () => {
  it.each([
    ['MAV_TYPE_QUADROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_HEXAROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_OCTOROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_TRICOPTER', { kind: 'multirotor' }],
    ['MAV_TYPE_DECAROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_GENERIC_MULTIROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_FIXED_WING', { kind: 'fixed-wing' }],
    // Aspirational: this dialect still spells 23 `VTOL_RESERVED3`. The rule is
    // a prefix test, so it names the value under either spelling.
    ['MAV_TYPE_VTOL_TAILSITTER', { kind: 'vtol' }],
    ['MAV_TYPE_VTOL_TILTROTOR', { kind: 'vtol' }],
    ['MAV_TYPE_HELICOPTER', { kind: 'unknown' }],
    ['MAV_TYPE_GCS', { kind: 'none' }],
    ['MAV_TYPE_ANTENNA_TRACKER', { kind: 'none' }],
    ['MAV_TYPE_GIMBAL', { kind: 'none' }],
    ['MAV_TYPE_GROUND_ROVER', { kind: 'none' }],
    ['MAV_TYPE_SURFACE_BOAT', { kind: 'none' }],
    ['MAV_TYPE_SUBMARINE', { kind: 'none' }],
    ['MAV_TYPE_SOMETHING_NEW', { kind: 'unknown' }],
  ])('maps %s', (input, expected) => {
    expect(airframeFromMavType(input)).toEqual(expected);
  });

  it('accepts the wrapped form mavlink2rest actually sends', () => {
    expect(airframeFromMavType({ type: 'MAV_TYPE_QUADROTOR' })).toEqual({ kind: 'multirotor' });
  });

  it('accepts the numeric form and agrees with the string form', () => {
    // 2 is MAV_TYPE_QUADROTOR.
    expect(airframeFromMavType(2)).toEqual(airframeFromMavType('MAV_TYPE_QUADROTOR'));
  });

  // Validation case 23 is a universal claim: "`MAV_TYPE` as an enum-name
  // string and as the equivalent number produce the same airframe". These are
  // every ordinal this module gives a word to. Ordinals and names are from
  // MAVLink's `minimal.xml` (where `MAV_TYPE` lives, not `common.xml`), read
  // out of the mavlink submodule of the ArduPilot checkout driving the SITL
  // this task measured against.
  it.each([
    [1, 'MAV_TYPE_FIXED_WING'],
    [2, 'MAV_TYPE_QUADROTOR'],
    [4, 'MAV_TYPE_HELICOPTER'],
    [5, 'MAV_TYPE_ANTENNA_TRACKER'],
    [6, 'MAV_TYPE_GCS'],
    [10, 'MAV_TYPE_GROUND_ROVER'],
    [11, 'MAV_TYPE_SURFACE_BOAT'],
    [12, 'MAV_TYPE_SUBMARINE'],
    [13, 'MAV_TYPE_HEXAROTOR'],
    [14, 'MAV_TYPE_OCTOROTOR'],
    [15, 'MAV_TYPE_TRICOPTER'],
    [18, 'MAV_TYPE_ONBOARD_CONTROLLER'],
    [19, 'MAV_TYPE_VTOL_DUOROTOR'],
    [20, 'MAV_TYPE_VTOL_QUADROTOR'],
    [21, 'MAV_TYPE_VTOL_TILTROTOR'],
    [22, 'MAV_TYPE_VTOL_RESERVED2'],
    [23, 'MAV_TYPE_VTOL_RESERVED3'],
    [24, 'MAV_TYPE_VTOL_RESERVED4'],
    [25, 'MAV_TYPE_VTOL_RESERVED5'],
    [26, 'MAV_TYPE_GIMBAL'],
    [27, 'MAV_TYPE_ADSB'],
    [29, 'MAV_TYPE_DODECAROTOR'],
    [30, 'MAV_TYPE_CAMERA'],
    [31, 'MAV_TYPE_CHARGING_STATION'],
    [32, 'MAV_TYPE_FLARM'],
    [33, 'MAV_TYPE_SERVO'],
    [35, 'MAV_TYPE_DECAROTOR'],
    [38, 'MAV_TYPE_LOG'],
    [39, 'MAV_TYPE_OSD'],
    [40, 'MAV_TYPE_IMU'],
    [41, 'MAV_TYPE_GPS'],
    [42, 'MAV_TYPE_WINCH'],
    [43, 'MAV_TYPE_GENERIC_MULTIROTOR'],
    [47, 'MAV_TYPE_VTOL_GYRODYNE'],
  ])('reads %i the same as %s', (ordinal, name) => {
    expect(airframeFromMavType(ordinal)).toEqual(airframeFromMavType(name));
  });

  // A number the vehicle sent IS an assertion, even when this module has no
  // word for it. `undefined` would claim nobody asserted an airframe — the
  // quiet failure the spec's parse rule exists to prevent. 3 is
  // MAV_TYPE_COAXIAL; 48 is MAV_TYPE_GRIPPER; 200 is not assigned. None of
  // the three is a value the mapping's stated rules give a word to.
  it.each([3, 48, 200])('reports a readable but unnamed ordinal %i as unknown', (ordinal) => {
    expect(airframeFromMavType(ordinal)).toEqual({ kind: 'unknown' });
  });

  it('never reports a readable ordinal as unasserted', () => {
    for (let ordinal = 0; ordinal <= 48; ordinal++) {
      expect(airframeFromMavType(ordinal), `ordinal ${ordinal}`).toBeDefined();
    }
  });

  it('returns undefined — not unknown — when the value is unreadable', () => {
    expect(airframeFromMavType(undefined)).toBeUndefined();
    expect(airframeFromMavType(null)).toBeUndefined();
    expect(airframeFromMavType({})).toBeUndefined();
  });

  it('returns undefined for a wrapper whose type is not a string', () => {
    expect(airframeFromMavType({ type: 2 })).toBeUndefined();
    expect(airframeFromMavType({ type: null })).toBeUndefined();
  });

  it('returns undefined for numbers outside the enum space', () => {
    // An enum ordinal is a non-negative integer. A fractional or negative
    // number is malformed, not an assertion gcscode cannot name.
    expect(airframeFromMavType(Number.NaN)).toBeUndefined();
    expect(airframeFromMavType(2.5)).toBeUndefined();
    expect(airframeFromMavType(-1)).toBeUndefined();
    expect(airframeFromMavType(Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it('returns undefined for values that are not a readable MAV_TYPE', () => {
    expect(airframeFromMavType(true)).toBeUndefined();
    expect(airframeFromMavType('')).toBeUndefined();
    expect(airframeFromMavType([])).toBeUndefined();
  });
});

describe('systemIdOf', () => {
  it('reads the envelope header', () => {
    expect(systemIdOf({ header: { system_id: 7 }, message: { type: 'HEARTBEAT' } })).toBe('7');
  });

  it('reads the live frame shape measured on 2026-10-21', () => {
    // Captured from ws://localhost:8088/v1/ws/mavlink?filter=^HEARTBEAT$ —
    // ArduPilot SITL -> MAVProxy -> mavlink2rest. Trimmed to the two fields
    // this module reads; the rest of the message is telemetry-store's job.
    const frame = {
      header: { system_id: 1, component_id: 1, sequence: 249 },
      message: {
        type: 'HEARTBEAT',
        mavtype: { type: 'MAV_TYPE_QUADROTOR' },
        autopilot: { type: 'MAV_AUTOPILOT_ARDUPILOTMEGA' },
        base_mode: 'MAV_MODE_FLAG_MANUAL_INPUT_ENABLED | MAV_MODE_FLAG_STABILIZE_ENABLED',
        custom_mode: 0,
        system_status: { type: 'MAV_STATE_STANDBY' },
        mavlink_version: 3,
      },
    };
    expect(systemIdOf(frame)).toBe('1');
    expect(airframeFromMavType(frame.message.mavtype)).toEqual({ kind: 'multirotor' });
  });

  it('returns undefined when there is no readable header', () => {
    expect(systemIdOf({ message: { type: 'HEARTBEAT' } })).toBeUndefined();
  });

  it('returns undefined for a header without a numeric system_id', () => {
    expect(systemIdOf({ header: {} })).toBeUndefined();
    expect(systemIdOf({ header: { system_id: '1' } })).toBeUndefined();
    expect(systemIdOf({ header: null })).toBeUndefined();
  });

  it('returns undefined for a non-object envelope', () => {
    expect(systemIdOf(undefined)).toBeUndefined();
    expect(systemIdOf(null)).toBeUndefined();
    expect(systemIdOf('HEARTBEAT')).toBeUndefined();
  });
});
