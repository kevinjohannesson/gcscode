import { describe, it, expect, beforeEach } from 'vitest';

import { applyMessage, reset, setConnectionState, telemetryState } from './telemetry-store.svelte';

describe('telemetry-store', () => {
  beforeEach(() => {
    reset();
  });

  it('initial state: all telemetry fields null, connection is connecting', () => {
    expect(telemetryState.mode).toBeNull();
    expect(telemetryState.armed).toBeNull();
    expect(telemetryState.lat).toBeNull();
    expect(telemetryState.lng).toBeNull();
    expect(telemetryState.alt).toBeNull();
    expect(telemetryState.heading).toBeNull();
    expect(telemetryState.roll).toBeNull();
    expect(telemetryState.pitch).toBeNull();
    expect(telemetryState.yaw).toBeNull();
    expect(telemetryState.groundspeed).toBeNull();
    expect(telemetryState.voltageBattery).toBeNull();
    expect(telemetryState.batteryRemaining).toBeNull();
    expect(telemetryState.connection).toBe('connecting');
  });

  it('applyMessage HEARTBEAT with base_mode 0x81 and custom_mode 4 sets armed=true, mode=GUIDED', () => {
    applyMessage({
      message: {
        type: 'HEARTBEAT',
        base_mode: 0x81,
        custom_mode: 4,
      },
    });
    expect(telemetryState.armed).toBe(true);
    expect(telemetryState.mode).toBe('GUIDED');
  });

  it('applyMessage HEARTBEAT with base_mode 0x01 and custom_mode 6 sets armed=false, mode=RTL', () => {
    applyMessage({
      message: {
        type: 'HEARTBEAT',
        base_mode: 0x01,
        custom_mode: 6,
      },
    });
    expect(telemetryState.armed).toBe(false);
    expect(telemetryState.mode).toBe('RTL');
  });

  it('applyMessage HEARTBEAT with unknown custom_mode 999 renders as MODE_999', () => {
    applyMessage({
      message: {
        type: 'HEARTBEAT',
        base_mode: 0x00,
        custom_mode: 999,
      },
    });
    expect(telemetryState.mode).toBe('MODE_999');
  });

  it('applyMessage GLOBAL_POSITION_INT applies correct scaling', () => {
    applyMessage({
      message: {
        type: 'GLOBAL_POSITION_INT',
        lat: -353632610,
        lon: 1491652300,
        relative_alt: 5400,
        hdg: 9000,
      },
    });
    expect(telemetryState.lat).toBeCloseTo(-35.363261, 6);
    expect(telemetryState.lng).toBeCloseTo(149.16523, 5);
    expect(telemetryState.alt).toBeCloseTo(5.4, 3);
    expect(telemetryState.heading).toBeCloseTo(90.0, 2);
  });

  it('applyMessage with unknown message type leaves state unchanged', () => {
    // first set some known state
    applyMessage({
      message: {
        type: 'HEARTBEAT',
        base_mode: 0x81,
        custom_mode: 4,
      },
    });
    const prevMode = telemetryState.mode;
    const prevArmed = telemetryState.armed;

    applyMessage({
      message: {
        type: 'UNKNOWN_MSG_TYPE',
        some_field: 42,
      },
    });

    expect(telemetryState.mode).toBe(prevMode);
    expect(telemetryState.armed).toBe(prevArmed);
  });

  it('applyMessage with malformed input silently ignores it without throwing', () => {
    // Various malformed inputs — should not throw
    expect(() => applyMessage(null)).not.toThrow();
    expect(() => applyMessage(undefined)).not.toThrow();
    expect(() => applyMessage(42)).not.toThrow();
    expect(() => applyMessage('raw string')).not.toThrow();
    expect(() => applyMessage({})).not.toThrow();
    expect(() => applyMessage({ message: null })).not.toThrow();
    expect(() => applyMessage({ message: { no_type: true } })).not.toThrow();

    // State should remain at initial after all those no-ops
    expect(telemetryState.mode).toBeNull();
    expect(telemetryState.lat).toBeNull();
  });

  it('setConnectionState transitions through all three states', () => {
    setConnectionState('connected');
    expect(telemetryState.connection).toBe('connected');

    setConnectionState('disconnected');
    expect(telemetryState.connection).toBe('disconnected');

    setConnectionState('connecting');
    expect(telemetryState.connection).toBe('connecting');
  });

  it('reset returns state to initial', () => {
    // populate some state first
    applyMessage({
      message: {
        type: 'HEARTBEAT',
        base_mode: 0x81,
        custom_mode: 4,
      },
    });
    applyMessage({
      message: {
        type: 'GLOBAL_POSITION_INT',
        lat: -353632610,
        lon: 1491652300,
        relative_alt: 5400,
        hdg: 9000,
      },
    });
    applyMessage({
      message: {
        type: 'ATTITUDE',
        roll: 0.1,
        pitch: -0.2,
        yaw: 1.5,
      },
    });
    applyMessage({
      message: {
        type: 'VFR_HUD',
        groundspeed: 4.5,
      },
    });
    applyMessage({
      message: {
        type: 'SYS_STATUS',
        voltage_battery: 12450,
        battery_remaining: 87,
      },
    });
    setConnectionState('connected');

    reset();

    expect(telemetryState.mode).toBeNull();
    expect(telemetryState.armed).toBeNull();
    expect(telemetryState.lat).toBeNull();
    expect(telemetryState.lng).toBeNull();
    expect(telemetryState.alt).toBeNull();
    expect(telemetryState.heading).toBeNull();
    expect(telemetryState.roll).toBeNull();
    expect(telemetryState.pitch).toBeNull();
    expect(telemetryState.yaw).toBeNull();
    expect(telemetryState.groundspeed).toBeNull();
    expect(telemetryState.voltageBattery).toBeNull();
    expect(telemetryState.batteryRemaining).toBeNull();
    expect(telemetryState.connection).toBe('connecting');
  });

  it('applyMessage with ATTITUDE updates roll/pitch/yaw', () => {
    applyMessage({
      message: {
        type: 'ATTITUDE',
        roll: 0.1,
        pitch: -0.2,
        yaw: 1.5,
      },
    });
    expect(telemetryState.roll).toBeCloseTo(0.1, 6);
    expect(telemetryState.pitch).toBeCloseTo(-0.2, 6);
    expect(telemetryState.yaw).toBeCloseTo(1.5, 6);
  });

  it('applyMessage with VFR_HUD updates groundspeed', () => {
    applyMessage({
      message: {
        type: 'VFR_HUD',
        groundspeed: 4.5,
      },
    });
    expect(telemetryState.groundspeed).toBeCloseTo(4.5, 6);
  });

  it('applyMessage with SYS_STATUS scales mV to V and stores remaining', () => {
    applyMessage({
      message: {
        type: 'SYS_STATUS',
        voltage_battery: 12450,
        battery_remaining: 87,
      },
    });
    expect(telemetryState.voltageBattery).toBeCloseTo(12.45, 6);
    expect(telemetryState.batteryRemaining).toBe(87);
  });

  it('applyMessage with SYS_STATUS battery_remaining=-1 stores null', () => {
    applyMessage({
      message: {
        type: 'SYS_STATUS',
        voltage_battery: 12450,
        battery_remaining: -1,
      },
    });
    expect(telemetryState.voltageBattery).toBeCloseTo(12.45, 6);
    expect(telemetryState.batteryRemaining).toBeNull();
  });
});
