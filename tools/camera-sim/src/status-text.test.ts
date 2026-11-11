import { describe, expect, it } from 'vitest';

import { describeGroundCheck, describeImagery, describeTerrain, describeWhip } from './status-text';
import { TerrainDatabase } from './terrain/ap-terrain';

const database = new TerrainDatabase();

describe('describeTerrain', () => {
  it('says when terrain is off', () => {
    expect(describeTerrain(false, undefined, false)).toBe(
      'off: flat world, for SITL with SIM_TERRAIN 0',
    );
  });

  it('names the file and how much of it holds data', () => {
    const result = {
      database,
      files: [{ name: 'S36E149.DAT', status: 'loaded' as const, blocksWithData: 9 }],
    };
    expect(describeTerrain(true, result, true)).toBe('S36E149.DAT (9 blocks with data)');
  });

  it('explains flat ground when the file isn’t served', () => {
    const result = {
      database,
      files: [
        {
          name: 'S36E149.DAT',
          status: 'missing' as const,
          detail: 'CAMERA_SIM_TERRAIN_DIR is not set',
        },
      ],
    };
    expect(describeTerrain(true, result, false)).toBe(
      'S36E149.DAT not found: CAMERA_SIM_TERRAIN_DIR is not set. Rendering flat ground until SITL’s terrain file is served.',
    );
  });

  it('explains flat ground when home has no data', () => {
    const result = {
      database,
      files: [{ name: 'S36E149.DAT', status: 'loaded' as const, blocksWithData: 2 }],
    };
    expect(describeTerrain(true, result, false)).toBe(
      'S36E149.DAT (2 blocks with data). No data at home, so SITL’s ground is flat everywhere.',
    );
  });

  it('reports a failed fetch', () => {
    const result = {
      database,
      files: [{ name: 'S36E149.DAT', status: 'error' as const, detail: 'HTTP 500' }],
    };
    expect(describeTerrain(true, result, false)).toContain('S36E149.DAT failed: HTTP 500');
  });
});

describe('describeImagery', () => {
  it('summarises what is drawn and loading', () => {
    expect(describeImagery({ drawn: 42, finestZoom: 19, loading: 3, failed: 0, cached: 80 })).toBe(
      '42 tiles drawn, finest z19, 3 loading',
    );
    expect(
      describeImagery({ drawn: 0, finestZoom: undefined, loading: 8, failed: 2, cached: 9 }),
    ).toBe('0 tiles drawn, none yet, 8 loading, 2 failed (grid shown)');
  });
});

describe('describeGroundCheck', () => {
  it('waits for a landed, disarmed vehicle', () => {
    expect(describeGroundCheck({ state: 'waiting' })).toBe(
      'Ground check: waiting for the vehicle to sit disarmed',
    );
  });

  it('confirms agreement', () => {
    expect(describeGroundCheck({ state: 'ok', heightAboveGroundM: -0.123 })).toBe(
      'Ground check: OK, landed 0.12 m from the rendered ground',
    );
  });

  it('says which way a mismatch goes and what to check', () => {
    expect(describeGroundCheck({ state: 'mismatch', heightAboveGroundM: -12.3 })).toBe(
      'Ground check: MISMATCH, landed 12.3 m below the rendered ground. ' +
        'Check terrain=on/off against SITL’s SIM_TERRAIN, and the origin against SIM_OPOS_*.',
    );
    expect(describeGroundCheck({ state: 'mismatch', heightAboveGroundM: 2 })).toContain(
      '2.0 m above',
    );
  });
});

describe('describeWhip', () => {
  it('names the state', () => {
    expect(describeWhip('publishing', undefined)).toBe('WHIP publishing');
  });

  it('adds the error in brackets', () => {
    expect(describeWhip('retrying', 'connection failed')).toBe('WHIP retrying (connection failed)');
  });
});
