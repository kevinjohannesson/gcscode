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
    setConnectionState('connected');

    reset();

    expect(telemetryState.mode).toBeNull();
    expect(telemetryState.armed).toBeNull();
    expect(telemetryState.lat).toBeNull();
    expect(telemetryState.lng).toBeNull();
    expect(telemetryState.alt).toBeNull();
    expect(telemetryState.heading).toBeNull();
    expect(telemetryState.connection).toBe('connecting');
  });
});
