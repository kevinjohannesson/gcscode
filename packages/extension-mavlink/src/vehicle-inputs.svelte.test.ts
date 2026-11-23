import { beforeEach, describe, expect, it } from 'vitest';

import { VehicleInputsTracker } from './vehicle-inputs.svelte';

let clock = 0;
let tracker: VehicleInputsTracker;

beforeEach(() => {
  clock = 1_000;
  tracker = new VehicleInputsTracker(() => clock);
});

function position(
  systemId: number,
  fields: Partial<{ lat: number; lon: number; relative_alt: number; hdg: number }> = {},
): unknown {
  return {
    header: { system_id: systemId, component_id: 1, sequence: 0 },
    message: {
      type: 'GLOBAL_POSITION_INT',
      lat: -353632610,
      lon: 1491652300,
      relative_alt: 5400,
      hdg: 9000,
      ...fields,
    },
  };
}

function home(systemId: number, latitude = -353632621, longitude = 1491652374): unknown {
  return {
    header: { system_id: systemId, component_id: 1, sequence: 0 },
    message: { type: 'HOME_POSITION', latitude, longitude, altitude: 584_090 },
  };
}

function heartbeat(systemId: number): unknown {
  return {
    header: { system_id: systemId, component_id: 1, sequence: 0 },
    message: { type: 'HEARTBEAT', custom_mode: 0 },
  };
}

const vehicle = (systemId: number) => tracker.vehicles.find((v) => v.systemId === systemId);

describe('VehicleInputsTracker', () => {
  it('keeps each system apart, in system id order, with the values the telemetry store would compute', () => {
    tracker.onMessage(position(2, { lat: -353640000, lon: 1491660000, hdg: 18050 }));
    tracker.onMessage(position(1));

    expect(tracker.vehicles.map((v) => v.systemId)).toEqual([1, 2]);
    expect(vehicle(1)!.position!.value).toEqual({ lat: -35.363261, lng: 149.16523, alt: 5.4 });
    expect(vehicle(1)!.heading!.value).toBe(90);
    expect(vehicle(2)!.position!.value).toEqual({ lat: -35.364, lng: 149.166, alt: 5.4 });
    expect(vehicle(2)!.heading!.value).toBe(180.5);
  });

  it('names the sending system, component and message as the source', () => {
    tracker.onMessage({
      header: { system_id: 3, component_id: 191, sequence: 0 },
      message: { type: 'GLOBAL_POSITION_INT', lat: 1, lon: 2, relative_alt: 0, hdg: 0 },
    });
    tracker.onMessage(home(3));

    expect(vehicle(3)!.position!.source).toEqual({
      systemId: 3,
      componentId: 191,
      message: 'GLOBAL_POSITION_INT',
      via: 'stream',
    });
    expect(vehicle(3)!.home!.source).toEqual({
      systemId: 3,
      componentId: 1,
      message: 'HOME_POSITION',
      via: 'stream',
    });
  });

  it('reads HOME_POSITION into a home of its own', () => {
    tracker.onMessage(home(1));
    expect(vehicle(1)!.home!.value).toEqual({ lat: -35.3632621, lng: 149.1652374 });
    expect(vehicle(1)!.position).toBeNull();
    expect(vehicle(1)!.heading).toBeNull();
  });

  it('moves received on every frame but changed only when the value differs', () => {
    tracker.onMessage(position(1));
    clock = 2_000;
    tracker.onMessage(position(1));
    expect(vehicle(1)!.position).toMatchObject({ receivedAt: 2_000, changedAt: 1_000 });
    expect(vehicle(1)!.heading).toMatchObject({ receivedAt: 2_000, changedAt: 1_000 });

    clock = 3_000;
    tracker.onMessage(position(1, { relative_alt: 5401 }));
    expect(vehicle(1)!.position).toMatchObject({ receivedAt: 3_000, changedAt: 3_000 });
    expect(vehicle(1)!.heading).toMatchObject({ receivedAt: 3_000, changedAt: 1_000 });

    clock = 4_000;
    tracker.onMessage(position(1, { relative_alt: 5401, hdg: 9001 }));
    expect(vehicle(1)!.heading).toMatchObject({ receivedAt: 4_000, changedAt: 4_000 });

    clock = 5_000;
    tracker.onMessage(home(1));
    clock = 6_000;
    tracker.onMessage(home(1, -353632622));
    expect(vehicle(1)!.home).toMatchObject({ receivedAt: 6_000, changedAt: 6_000 });
  });

  it('counts each coordinate of a position as a change', () => {
    tracker.onMessage(position(1));
    clock = 2_000;
    tracker.onMessage(position(1, { lat: -353632611 }));
    expect(vehicle(1)!.position!.changedAt).toBe(2_000);
    clock = 3_000;
    tracker.onMessage(position(1, { lat: -353632611, lon: 1491652301 }));
    expect(vehicle(1)!.position!.changedAt).toBe(3_000);
    clock = 4_000;
    tracker.onMessage(home(1));
    clock = 5_000;
    tracker.onMessage(home(1, -353632621, 1491652375));
    expect(vehicle(1)!.home!.changedAt).toBe(5_000);
  });

  it('keeps a quiet vehicle, with its last values and times, while another keeps talking', () => {
    tracker.onMessage(position(1));
    tracker.onMessage(position(2));
    clock = 9_000;
    tracker.onMessage(position(1));
    tracker.onMessage(heartbeat(1));

    expect(tracker.vehicles.map((v) => v.systemId)).toEqual([1, 2]);
    expect(vehicle(2)).toMatchObject({ lastHeardAt: 1_000 });
    expect(vehicle(2)!.position).toMatchObject({ receivedAt: 1_000 });
    expect(vehicle(1)).toMatchObject({ lastHeardAt: 9_000 });
  });

  it('counts any frame from a known vehicle as heard, but never adds a vehicle for one', () => {
    tracker.onMessage(heartbeat(255));
    expect(tracker.vehicles).toEqual([]);

    tracker.onMessage(home(1));
    clock = 4_000;
    tracker.onMessage(heartbeat(1));
    expect(vehicle(1)!.lastHeardAt).toBe(4_000);
    expect(vehicle(1)!.home!.receivedAt).toBe(1_000);
  });

  it('says which system wrote the merged telemetry last', () => {
    expect(tracker.mergedWriter).toBeNull();
    tracker.onMessage(position(1));
    clock = 1_100;
    tracker.onMessage(position(2));
    expect(tracker.mergedWriter).toEqual({ systemId: 2, at: 1_100 });
    clock = 1_200;
    tracker.onMessage(home(1));
    expect(tracker.mergedWriter).toEqual({ systemId: 2, at: 1_100 });
  });

  it('skips what it cannot read, without throwing', () => {
    const unreadable: unknown[] = [
      null,
      'GLOBAL_POSITION_INT',
      { message: { type: 'GLOBAL_POSITION_INT', lat: 1, lon: 2 } },
      { header: { system_id: -1 }, message: { type: 'GLOBAL_POSITION_INT', lat: 1, lon: 2 } },
      { header: { system_id: 1.5 }, message: { type: 'GLOBAL_POSITION_INT', lat: 1, lon: 2 } },
      { header: { system_id: 1 }, message: null },
      { header: { system_id: 1 }, message: { type: 7 } },
      { header: { system_id: 1 }, message: { type: 'GLOBAL_POSITION_INT', lat: 'x', lon: 2 } },
      { header: { system_id: 1 }, message: { type: 'HOME_POSITION', latitude: 1 } },
    ];
    for (const frame of unreadable) tracker.onMessage(frame);
    expect(tracker.vehicles).toEqual([]);
    expect(tracker.mergedWriter).toBeNull();
  });

  it('keeps a position without a heading or altitude, and an unknown component', () => {
    tracker.onMessage({
      header: { system_id: 4 },
      message: { type: 'GLOBAL_POSITION_INT', lat: 10, lon: 20 },
    });
    expect(vehicle(4)!.position!.value).toEqual({ lat: 0.000001, lng: 0.000002, alt: null });
    expect(vehicle(4)!.position!.source.componentId).toBeNull();
    expect(vehicle(4)!.heading).toBeNull();
  });

  describe('seedHome', () => {
    const stored = (latitude: number, lastUpdate: unknown): unknown => ({
      message: { type: 'HOME_POSITION', latitude, longitude: 1491652374, altitude: 584_090 },
      status: { time: { counter: 2, last_update: lastUpdate } },
    });

    it("fills a known vehicle's home from the bridge's copy, timed by the bridge", () => {
      tracker.onMessage(position(2));
      tracker.seedHome(2, 1, stored(-353632621, '1970-01-01T00:00:00.400Z'));
      expect(vehicle(2)!.home).toEqual({
        value: { lat: -35.3632621, lng: 149.1652374 },
        receivedAt: 400,
        changedAt: 400,
        source: { systemId: 2, componentId: 1, message: 'HOME_POSITION', via: 'bridge' },
      });
    });

    it('never adds a vehicle, and never replaces a home the stream delivered later', () => {
      tracker.seedHome(2, 1, stored(-353632621, '1970-01-01T00:00:00.400Z'));
      expect(tracker.vehicles).toEqual([]);

      tracker.onMessage(home(1, -353632600));
      tracker.seedHome(1, 1, stored(-353632621, '1970-01-01T00:00:01.000Z'));
      expect(vehicle(1)!.home).toMatchObject({ value: { lat: -35.36326 }, receivedAt: 1_000 });
      expect(vehicle(1)!.home!.source.via).toBe('stream');

      tracker.seedHome(1, 1, stored(-353632621, '1970-01-01T00:00:01.001Z'));
      expect(vehicle(1)!.home).toMatchObject({ value: { lat: -35.3632621 }, receivedAt: 1_001 });
    });

    it('ignores a body it cannot read', () => {
      tracker.onMessage(position(1));
      const unreadable: unknown[] = [
        null,
        'x',
        {},
        { message: null },
        {
          message: { type: 'GLOBAL_POSITION_INT', latitude: 1, longitude: 2 },
          status: { time: { last_update: '1970-01-01T00:00:00.400Z' } },
        },
        {
          message: { type: 'HOME_POSITION', latitude: 1 },
          status: { time: { last_update: 'now' } },
        },
        stored(-353632621, undefined),
        stored(-353632621, 'not a date'),
        { message: { type: 'HOME_POSITION', latitude: 1, longitude: 2 } },
      ];
      for (const body of unreadable) tracker.seedHome(1, 1, body);
      expect(vehicle(1)!.home).toBeNull();
    });
  });

  it('knows which systems it holds', () => {
    tracker.onMessage(position(3));
    expect(tracker.has(3)).toBe(true);
    expect(tracker.has(1)).toBe(false);
  });

  it('forgets everything on reset', () => {
    tracker.onMessage(position(1));
    tracker.reset();
    expect(tracker.vehicles).toEqual([]);
    expect(tracker.mergedWriter).toBeNull();
  });
});
