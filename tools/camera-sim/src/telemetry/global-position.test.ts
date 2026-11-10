import { describe, expect, it } from 'vitest';

import { parseGlobalPosition } from './global-position';

/** A GLOBAL_POSITION_INT envelope as mavlink2rest sends it, SITL hovering at CMAC. */
function envelope(overrides: Record<string, unknown> = {}, systemId: unknown = 1) {
  return {
    header: { system_id: systemId, component_id: 1, sequence: 7 },
    message: {
      type: 'GLOBAL_POSITION_INT',
      time_boot_ms: 123456,
      lat: -353632620,
      lon: 1491652370,
      alt: 634000,
      relative_alt: 50000,
      vx: 250,
      vy: -120,
      vz: -30,
      hdg: 35300,
      ...overrides,
    },
  };
}

describe('parseGlobalPosition', () => {
  it('converts MAVLink units to degrees, metres and metres per second', () => {
    expect(parseGlobalPosition(envelope())).toEqual({
      systemId: 1,
      latDeg: -35.363262,
      lonDeg: 149.165237,
      altAmslM: 634,
      relativeAltM: 50,
      velNorthMps: 2.5,
      velEastMps: -1.2,
      velUpMps: 0.3,
      headingDeg: 353,
    });
  });

  it('reports an unknown heading (UINT16_MAX) as null', () => {
    expect(parseGlobalPosition(envelope({ hdg: 65535 }))?.headingDeg).toBeNull();
  });

  it('keys the position by the envelope’s system id', () => {
    expect(parseGlobalPosition(envelope({}, 2))?.systemId).toBe(2);
  });

  it('ignores other message types', () => {
    expect(parseGlobalPosition(envelope({ type: 'ATTITUDE' }))).toBeUndefined();
  });

  it('rejects a missing field rather than defaulting it', () => {
    expect(parseGlobalPosition(envelope({ relative_alt: undefined }))).toBeUndefined();
    expect(parseGlobalPosition(envelope({ vz: 'fast' }))).toBeUndefined();
  });

  it('rejects an unusable system id', () => {
    expect(parseGlobalPosition(envelope({}, Number.NaN))).toBeUndefined();
    expect(parseGlobalPosition(envelope({}, 1.5))).toBeUndefined();
    expect(parseGlobalPosition(envelope({}, -1))).toBeUndefined();
  });

  it('rejects things that aren’t envelopes', () => {
    expect(parseGlobalPosition(null)).toBeUndefined();
    expect(parseGlobalPosition({ message: envelope().message })).toBeUndefined();
  });
});
