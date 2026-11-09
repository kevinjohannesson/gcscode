import { describe, expect, it } from 'vitest';

import { resolveTerrainRequest } from './terrain-request';

const DIR = '/sitl/ardupilot/terrain';

describe('resolveTerrainRequest', () => {
  it('maps an ArduPilot terrain file name into the folder', () => {
    expect(resolveTerrainRequest(DIR, '/S36E149.DAT')).toEqual({
      kind: 'file',
      path: '/sitl/ardupilot/terrain/S36E149.DAT',
    });
    expect(resolveTerrainRequest(DIR, '/N52E004.DAT?t=1')).toEqual({
      kind: 'file',
      path: '/sitl/ardupilot/terrain/N52E004.DAT',
    });
  });

  it.each([
    '/../../etc/passwd',
    '/%2e%2e%2fS36E149.DAT',
    '/s36e149.dat',
    '/S36E149.DAT.bak',
    '/sub/S36E149.DAT',
    '/%E0%A4%A',
  ])('refuses %s', (url) => {
    expect(resolveTerrainRequest(DIR, url)).toEqual({
      kind: 'not-found',
      reason: 'Not a terrain file name.',
    });
  });

  it('explains what to set when no folder is configured', () => {
    const result = resolveTerrainRequest(undefined, '/S36E149.DAT');
    expect(result.kind).toBe('not-found');
    expect(result.kind === 'not-found' && result.reason).toContain('CAMERA_SIM_TERRAIN_DIR');
    expect(resolveTerrainRequest('  ', '/S36E149.DAT').kind).toBe('not-found');
  });
});
