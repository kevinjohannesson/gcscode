import { describe, expect, it, vi } from 'vitest';

import { createHomeSeeder, storedMessageUrl } from './home-seed';
import { VehicleInputsTracker } from './vehicle-inputs.svelte';

describe('storedMessageUrl', () => {
  it("turns mavlink2rest's WebSocket address into its stored-message address", () => {
    expect(storedMessageUrl('ws://localhost:8088/v1/ws/mavlink', 2, 1, 'HOME_POSITION')).toBe(
      'http://localhost:8088/v1/mavlink/vehicles/2/components/1/messages/HOME_POSITION',
    );
    expect(storedMessageUrl('wss://gcs.example:443/bridge/v1/ws/mavlink/', 7, 191, 'X')).toBe(
      'https://gcs.example/bridge/v1/mavlink/vehicles/7/components/191/messages/X',
    );
  });

  it('gives up on an address of another shape', () => {
    expect(storedMessageUrl('not a url', 1, 1, 'HOME_POSITION')).toBeNull();
    expect(storedMessageUrl('http://localhost:8088/v1/ws/mavlink', 1, 1, 'X')).toBeNull();
    expect(storedMessageUrl('ws://localhost:8088/v1/ws/other', 1, 1, 'X')).toBeNull();
  });
});

const stored = {
  message: { type: 'HOME_POSITION', latitude: -353632621, longitude: 1491652374 },
  status: { time: { last_update: '2026-11-23T09:00:14.747Z' } },
};

function frame(systemId: unknown, componentId: unknown = 1): unknown {
  return {
    header: { system_id: systemId, component_id: componentId },
    message: { type: 'GLOBAL_POSITION_INT', lat: 1, lon: 2, relative_alt: 0, hdg: 0 },
  };
}

function setup(answer: () => Promise<{ ok: boolean; json(): Promise<unknown> }>) {
  const tracker = new VehicleInputsTracker(() => 0);
  const fetch = vi.fn(answer);
  const seeder = createHomeSeeder({
    tracker,
    wsBase: () => 'ws://localhost:8088/v1/ws/mavlink',
    fetch,
  });
  const deliver = (json: unknown) => {
    tracker.onMessage(json);
    seeder.onMessage(json);
  };
  return { tracker, fetch, seeder, deliver };
}

const ok = () => Promise.resolve({ ok: true, json: () => Promise.resolve(stored) });

describe('createHomeSeeder', () => {
  it("reads each vehicle's stored home once, and fills it in", async () => {
    const { tracker, fetch, deliver } = setup(ok);
    deliver(frame(2));
    deliver(frame(2));
    deliver(frame(1));
    expect(fetch.mock.calls).toEqual([
      ['http://localhost:8088/v1/mavlink/vehicles/2/components/1/messages/HOME_POSITION'],
      ['http://localhost:8088/v1/mavlink/vehicles/1/components/1/messages/HOME_POSITION'],
    ]);
    await vi.waitFor(() => expect(tracker.vehicles[1]!.home).not.toBeNull());
    expect(tracker.vehicles[1]!.home!.source.via).toBe('bridge');
    expect(tracker.vehicles[1]!.home!.receivedAt).toBe(Date.parse('2026-11-23T09:00:14.747Z'));
  });

  it('asks nothing for a system without a row, or a frame without a readable header', () => {
    const { fetch, seeder, deliver } = setup(ok);
    seeder.onMessage(frame(255));
    deliver({ header: { system_id: 3, component_id: 1 }, message: { type: 'HEARTBEAT' } });
    deliver(null);
    deliver({ message: {} });
    deliver(frame('1'));
    deliver(frame(1, null));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks again after a reset, and drops an answer to a question asked before it', async () => {
    let release: (value: { ok: boolean; json(): Promise<unknown> }) => void = () => {};
    const { tracker, fetch, seeder, deliver } = setup(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    deliver(frame(1));
    seeder.reset();
    release({ ok: true, json: () => Promise.resolve(stored) });
    await new Promise((r) => setTimeout(r, 0));
    expect(tracker.vehicles[0]!.home).toBeNull();

    deliver(frame(1));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('leaves home unknown when the bridge has none, or the read fails, without throwing', async () => {
    for (const answer of [
      () => Promise.resolve({ ok: false, json: () => Promise.resolve(stored) }),
      () => Promise.reject(new Error('offline')),
      () => {
        throw new Error('no fetch');
      },
    ]) {
      const { tracker, deliver } = setup(answer);
      expect(() => deliver(frame(1))).not.toThrow();
      await new Promise((r) => setTimeout(r, 0));
      expect(tracker.vehicles[0]!.home).toBeNull();
    }
  });
});
