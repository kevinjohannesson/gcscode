import { describe, expect, it } from 'vitest';

import { parseArmedState } from './heartbeat';

const heartbeat = (baseMode: unknown, header: Record<string, unknown> = {}) => ({
  header: { system_id: 1, component_id: 1, sequence: 3, ...header },
  message: { type: 'HEARTBEAT', base_mode: baseMode, mavtype: { type: 'MAV_TYPE_QUADROTOR' } },
});

describe('parseArmedState', () => {
  it('reads the armed flag from mavlink2rest’s flag-name string', () => {
    expect(
      parseArmedState(heartbeat('MAV_MODE_FLAG_SAFETY_ARMED | MAV_MODE_FLAG_CUSTOM_MODE_ENABLED')),
    ).toEqual({ systemId: 1, armed: true });
    expect(parseArmedState(heartbeat('MAV_MODE_FLAG_CUSTOM_MODE_ENABLED'))).toEqual({
      systemId: 1,
      armed: false,
    });
  });

  it('reads it from a number or a { bits } object (0x80 is SAFETY_ARMED)', () => {
    expect(parseArmedState(heartbeat(0x81))?.armed).toBe(true);
    expect(parseArmedState(heartbeat(0x01))?.armed).toBe(false);
    expect(parseArmedState(heartbeat({ bits: 0x80 }))?.armed).toBe(true);
    expect(parseArmedState(heartbeat({ bits: 0x40 }))?.armed).toBe(false);
  });

  it('listens to the autopilot only: a gimbal’s heartbeat says nothing about arming', () => {
    expect(parseArmedState(heartbeat(0, { component_id: 154 }))).toBeUndefined();
  });

  it('ignores what it can’t read', () => {
    expect(parseArmedState(heartbeat(null))).toBeUndefined();
    expect(parseArmedState(heartbeat(1.5))).toBeUndefined();
    expect(parseArmedState(heartbeat(0x80, { system_id: 'one' }))).toBeUndefined();
    expect(
      parseArmedState({ header: { system_id: 1, component_id: 1 }, message: { type: 'ATTITUDE' } }),
    ).toBeUndefined();
  });
});
