import { describe, expect, it } from 'vitest';

import { LocalFrame } from '../geo/local-frame';
import type { GlobalPosition } from '../telemetry/global-position';
import { VehicleRegistry } from './vehicle-registry';
import { VehicleTrack } from './vehicle-track';

const CMAC = { lat: -35.363262, lon: 149.165237 };
const HOME_ALT = 584; // SITL's SIM_OPOS_ALT at CMAC
const frame = new LocalFrame(CMAC);

/** Over CMAC at 634 m AMSL (50 m above SITL's home), moving 2 m/s north, 1 m/s east, climbing 0.5 m/s. */
const moving: GlobalPosition = {
  systemId: 1,
  latDeg: CMAC.lat,
  lonDeg: CMAC.lon,
  altAmslM: 634,
  relativeAltM: 50,
  velNorthMps: 2,
  velEastMps: 1,
  velUpMps: 0.5,
  headingDeg: 90,
};
const parked: GlobalPosition = { ...moving, velNorthMps: 0, velEastMps: 0, velUpMps: 0 };

describe('VehicleTrack', () => {
  it('has no pose before the first position', () => {
    expect(new VehicleTrack(1, frame, HOME_ALT).predict(0)).toBeUndefined();
  });

  it('places the vehicle at its reported position, height above SITL’s home altitude', () => {
    const track = new VehicleTrack(1, frame, HOME_ALT);
    track.update(moving, 1000);
    expect(track.predict(1000)).toEqual({
      east: 0,
      north: 0,
      up: 50,
      headingDeg: 90,
      ageMs: 0,
      stale: false,
    });
  });

  it('takes height from AMSL, not from the autopilot’s home, which moves when it re-arms elsewhere', () => {
    const track = new VehicleTrack(1, frame, HOME_ALT);
    track.update({ ...moving, relativeAltM: 41 }, 1000);
    expect(track.predict(1000)?.up).toBe(50);
  });

  it('moves along the reported velocity between samples', () => {
    const track = new VehicleTrack(1, frame, HOME_ALT);
    track.update(moving, 1000);
    const pose = track.predict(1200);
    expect(pose?.north).toBeCloseTo(0.4, 9);
    expect(pose?.east).toBeCloseTo(0.2, 9);
    expect(pose?.up).toBeCloseTo(50.1, 9);
  });

  it('stops extrapolating after 500 ms', () => {
    const track = new VehicleTrack(1, frame, HOME_ALT);
    track.update(moving, 1000);
    expect(track.predict(4000)?.north).toBeCloseTo(1, 9);
  });

  it('marks the pose stale after 2 s without a position', () => {
    const track = new VehicleTrack(1, frame, HOME_ALT);
    track.update(moving, 1000);
    expect(track.predict(3000)?.stale).toBe(false);
    expect(track.predict(3001)?.stale).toBe(true);
  });

  it('keeps the last heading when the vehicle reports it unknown', () => {
    const track = new VehicleTrack(1, frame, HOME_ALT);
    track.update(moving, 1000);
    track.update({ ...moving, headingDeg: null }, 1100);
    expect(track.predict(1100)?.headingDeg).toBe(90);
  });
});

describe('VehicleTrack.checkGround', () => {
  /** A vehicle sitting at `altAmslM`, disarmed or not, against ground `groundM` above home. */
  function check(options: {
    altAmslM: number;
    groundM: number;
    armed?: boolean;
    position?: GlobalPosition;
  }) {
    const track = new VehicleTrack(1, frame, HOME_ALT);
    track.update({ ...(options.position ?? parked), altAmslM: options.altAmslM }, 0);
    if (options.armed !== undefined) track.setArmed(options.armed);
    return track.checkGround(() => options.groundM);
  }

  it('waits until it knows the vehicle is disarmed', () => {
    expect(check({ altAmslM: 594, groundM: 0 })).toEqual({ state: 'waiting' });
    expect(check({ altAmslM: 594, groundM: 0, armed: true })).toEqual({ state: 'waiting' });
  });

  it('waits while a disarmed vehicle is still moving', () => {
    expect(check({ altAmslM: 594, groundM: 0, armed: false, position: moving })).toEqual({
      state: 'waiting',
    });
  });

  it('passes a landed vehicle sitting on the rendered ground', () => {
    // On terrain 12.3 m above home, 0.2 m of altitude noise.
    expect(check({ altAmslM: 596.5, groundM: 12.3, armed: false })).toEqual({
      state: 'ok',
      heightAboveGroundM: expect.closeTo(0.2, 9),
    });
  });

  it('flags a landed vehicle more than 1.5 m off the rendered ground', () => {
    // SITL flat (SIM_TERRAIN 0) while the sim renders terrain 12.3 m up: the drone sits "inside" the hill.
    expect(check({ altAmslM: 584, groundM: 12.3, armed: false })).toEqual({
      state: 'mismatch',
      heightAboveGroundM: expect.closeTo(-12.3, 9),
    });
    expect(check({ altAmslM: 585.6, groundM: 0, armed: false }).state).toBe('mismatch');
    expect(check({ altAmslM: 585.5, groundM: 0, armed: false }).state).toBe('ok');
  });

  it('keeps the last result once the vehicle arms and takes off', () => {
    const track = new VehicleTrack(1, frame, HOME_ALT);
    track.update({ ...parked, altAmslM: HOME_ALT }, 0); // on the ground at home
    track.setArmed(false);
    track.checkGround(() => 0);
    track.setArmed(true);
    track.update({ ...moving, altAmslM: 700 }, 100);
    expect(track.checkGround(() => 0)).toEqual({ state: 'ok', heightAboveGroundM: 0 });
  });
});

describe('VehicleRegistry', () => {
  const positionEnvelope = (systemId: number) => ({
    header: { system_id: systemId, component_id: 1, sequence: 0 },
    message: {
      type: 'GLOBAL_POSITION_INT',
      lat: -353632620,
      lon: 1491652370,
      alt: 584000,
      relative_alt: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      hdg: 0,
    },
  });
  const heartbeat = (systemId: number, baseMode: string) => ({
    header: { system_id: systemId, component_id: 1, sequence: 0 },
    message: { type: 'HEARTBEAT', base_mode: baseMode },
  });

  it('creates one track per system id and announces each once, with a pose', () => {
    const announced: { id: number; hasPose: boolean }[] = [];
    const registry = new VehicleRegistry(frame, HOME_ALT, (t) =>
      announced.push({ id: t.systemId, hasPose: t.predict(0) !== undefined }),
    );
    registry.applyMessage(positionEnvelope(1), 0);
    registry.applyMessage(positionEnvelope(1), 40);
    registry.applyMessage(positionEnvelope(2), 50);
    expect(announced).toEqual([
      { id: 1, hasPose: true },
      { id: 2, hasPose: true },
    ]);
    expect([...registry.tracks.keys()]).toEqual([1, 2]);
  });

  it('does not create a vehicle from a heartbeat', () => {
    const registry = new VehicleRegistry(frame, HOME_ALT, () => {});
    expect(registry.applyMessage(heartbeat(255, 'MAV_MODE_FLAG_SAFETY_ARMED'), 0)).toBe(false);
    expect(registry.tracks.size).toBe(0);
  });

  it('passes a known vehicle’s armed state on to its track', () => {
    const registry = new VehicleRegistry(frame, HOME_ALT, () => {});
    registry.applyMessage(positionEnvelope(1), 0);
    expect(registry.applyMessage(heartbeat(1, 'MAV_MODE_FLAG_CUSTOM_MODE_ENABLED'), 10)).toBe(true);
    expect(registry.tracks.get(1)!.checkGround(() => 0)).toEqual({
      state: 'ok',
      heightAboveGroundM: 0,
    });
  });
});
