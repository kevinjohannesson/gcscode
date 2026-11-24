import { describe, expect, it } from 'vitest';

import { LinkState } from './link-state.svelte';

function heartbeat(systemId: unknown, mavtype: unknown = { type: 'MAV_TYPE_QUADROTOR' }) {
  return {
    header: { system_id: systemId, component_id: 1, sequence: 0 },
    message: { type: 'HEARTBEAT', mavtype, autopilot: { type: 'MAV_AUTOPILOT_ARDUPILOTMEGA' } },
  };
}

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v) };
}

describe('LinkState', () => {
  it('starts connecting, since the moment it was made, with no systems', () => {
    const c = clock(5_000);
    const state = new LinkState(c.now);
    expect(state.bridge).toBe('connecting');
    expect(state.bridgeSince).toBe(5_000);
    expect(state.systems).toEqual([]);
  });

  it('records when the bridge changes state, and not when the same state repeats', () => {
    const c = clock();
    const state = new LinkState(c.now);
    c.set(2_000);
    state.setBridge('connected');
    expect(state.bridge).toBe('connected');
    expect(state.bridgeSince).toBe(2_000);
    c.set(3_000);
    state.setBridge('connected');
    expect(state.bridgeSince).toBe(2_000);
    c.set(4_000);
    state.setBridge('disconnected');
    expect(state.bridge).toBe('disconnected');
    expect(state.bridgeSince).toBe(4_000);
  });

  it('keeps the last heartbeat time per system ID, sorted by ID', () => {
    const c = clock();
    const state = new LinkState(c.now);
    c.set(2_000);
    state.noteMessage(heartbeat(2));
    c.set(2_100);
    state.noteMessage(heartbeat(1));
    c.set(3_000);
    state.noteMessage(heartbeat(1));
    expect(state.systems).toEqual([
      { systemId: 1, type: 'QUADROTOR', at: 3_000 },
      { systemId: 2, type: 'QUADROTOR', at: 2_000 },
    ]);
  });

  it('names the type from the wrapped form or a bare string, and null otherwise', () => {
    const state = new LinkState(() => 0);
    state.noteMessage(heartbeat(1, { type: 'MAV_TYPE_GCS' }));
    state.noteMessage(heartbeat(2, 'MAV_TYPE_HEXAROTOR'));
    state.noteMessage(heartbeat(3, 2));
    expect(state.systems.map((s) => s.type)).toEqual(['GCS', 'HEXAROTOR', null]);
  });

  it('ignores messages that are not heartbeats, and heartbeats with no readable sender', () => {
    const state = new LinkState(() => 0);
    state.noteMessage({ header: { system_id: 1 }, message: { type: 'ATTITUDE' } });
    state.noteMessage(heartbeat(undefined));
    state.noteMessage(heartbeat(-1));
    state.noteMessage({ message: { type: 'HEARTBEAT' } });
    state.noteMessage(null);
    state.noteMessage('HEARTBEAT');
    expect(state.systems).toEqual([]);
  });

  it('forgets everything on reset', () => {
    const c = clock();
    const state = new LinkState(c.now);
    state.setBridge('disconnected');
    state.noteMessage(heartbeat(1));
    c.set(9_000);
    state.reset();
    expect(state.bridge).toBe('connecting');
    expect(state.bridgeSince).toBe(9_000);
    expect(state.systems).toEqual([]);
  });
});
