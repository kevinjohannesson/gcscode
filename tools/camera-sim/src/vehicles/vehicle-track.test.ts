import { describe, expect, it } from 'vitest';

import { LocalFrame } from '../geo/local-frame';
import type { GlobalPosition } from '../telemetry/global-position';
import { VehicleRegistry } from './vehicle-registry';
import { VehicleTrack } from './vehicle-track';

const CMAC = { lat: -35.363262, lon: 149.165237 };
const frame = new LocalFrame(CMAC);

/** Hovering over CMAC at 50 m, moving 2 m/s north, 1 m/s east, climbing 0.5 m/s. */
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

describe('VehicleTrack', () => {
  it('has no pose before the first position', () => {
    expect(new VehicleTrack(1, frame).predict(0)).toBeUndefined();
  });

  it('places the vehicle at its reported position, height above home as height above ground', () => {
    const track = new VehicleTrack(1, frame);
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

  it('moves along the reported velocity between samples', () => {
    const track = new VehicleTrack(1, frame);
    track.update(moving, 1000);
    const pose = track.predict(1200);
    expect(pose?.north).toBeCloseTo(0.4, 9);
    expect(pose?.east).toBeCloseTo(0.2, 9);
    expect(pose?.up).toBeCloseTo(50.1, 9);
  });

  it('stops extrapolating after 500 ms', () => {
    const track = new VehicleTrack(1, frame);
    track.update(moving, 1000);
    expect(track.predict(4000)?.north).toBeCloseTo(1, 9);
  });

  it('marks the pose stale after 2 s without a position', () => {
    const track = new VehicleTrack(1, frame);
    track.update(moving, 1000);
    expect(track.predict(3000)?.stale).toBe(false);
    expect(track.predict(3001)?.stale).toBe(true);
  });

  it('keeps the last heading when the vehicle reports it unknown', () => {
    const track = new VehicleTrack(1, frame);
    track.update(moving, 1000);
    track.update({ ...moving, headingDeg: null }, 1100);
    expect(track.predict(1100)?.headingDeg).toBe(90);
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

  it('creates one track per system id and announces each once, with a pose', () => {
    const announced: { id: number; hasPose: boolean }[] = [];
    const registry = new VehicleRegistry(frame, (t) =>
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
    const registry = new VehicleRegistry(frame, () => {});
    const heartbeat = { header: { system_id: 255 }, message: { type: 'HEARTBEAT' } };
    expect(registry.applyMessage(heartbeat, 0)).toBe(false);
    expect(registry.tracks.size).toBe(0);
  });
});
