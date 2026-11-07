import { describe, expect, it } from 'vitest';

import { overlayLines, staleBanner } from './frame-overlay';

const utc = new Date('2026-11-07T08:12:34.567Z');
const pose = { east: 0, north: 0, up: 50.04, headingDeg: 89.6, ageMs: 40, stale: false };

describe('overlayLines', () => {
  it('shows vehicle, UTC time to the millisecond, frame number, and the pose rendered', () => {
    expect(overlayLines({ systemId: 1, utc, frameNumber: 1234, pose, pitchDeg: -90 })).toEqual([
      'SYS 1  2026-11-07T08:12:34.567Z  #001234',
      'ALT 50.0 m  HDG 090°  PITCH -90°',
    ]);
  });

  it('wraps a heading that rounds up to 360 back to 000', () => {
    const north = { ...pose, headingDeg: 359.7 };
    expect(overlayLines({ systemId: 2, utc, frameNumber: 1, pose: north, pitchDeg: -45 })[1]).toBe(
      'ALT 50.0 m  HDG 000°  PITCH -45°',
    );
  });

  it('says so before the first position arrives', () => {
    expect(
      overlayLines({ systemId: 1, utc, frameNumber: 0, pose: undefined, pitchDeg: -90 }),
    ).toEqual(['SYS 1  2026-11-07T08:12:34.567Z  #000000', 'NO POSITION YET']);
  });
});

describe('staleBanner', () => {
  it('stays quiet while telemetry is fresh', () => {
    expect(staleBanner(pose)).toBeUndefined();
    expect(staleBanner(undefined)).toBeUndefined();
  });

  it('shows how old the last position is once stale', () => {
    expect(staleBanner({ ...pose, ageMs: 3456, stale: true })).toBe('TELEMETRY STALE 3.5 s');
  });
});
