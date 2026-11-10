import { describe, expect, it } from 'vitest';

import { BLOCK_BYTES } from './ap-terrain';
import { degreeSquaresCovering, loadTerrain } from './terrain-loader';

describe('degreeSquaresCovering', () => {
  it('finds the one square around CMAC', () => {
    const bounds = { south: -35.4, north: -35.33, west: 149.12, east: 149.21 };
    expect(degreeSquaresCovering(bounds)).toEqual([{ latDegrees: -36, lonDegrees: 149 }]);
  });

  it('finds all four squares around a corner', () => {
    const bounds = { south: -0.01, north: 0.01, west: -0.01, east: 0.01 };
    expect(degreeSquaresCovering(bounds)).toEqual([
      { latDegrees: -1, lonDegrees: -1 },
      { latDegrees: -1, lonDegrees: 0 },
      { latDegrees: 0, lonDegrees: -1 },
      { latDegrees: 0, lonDegrees: 0 },
    ]);
  });
});

describe('loadTerrain', () => {
  const corner = { south: -0.01, north: 0.01, west: -0.01, east: 0.01 };

  it('loads what the server has and reports the rest as missing or failed', async () => {
    const requested: string[] = [];
    const result = await loadTerrain('/terrain', corner, async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith('/N00E000.DAT')) return new Response(new ArrayBuffer(BLOCK_BYTES));
      if (url.endsWith('/S01E000.DAT')) return new Response('', { status: 500 });
      if (url.endsWith('/S01W001.DAT')) throw new Error('connection refused');
      return new Response('CAMERA_SIM_TERRAIN_DIR is not set', { status: 404 });
    });
    expect(requested.sort()).toEqual([
      '/terrain/N00E000.DAT',
      '/terrain/N00W001.DAT',
      '/terrain/S01E000.DAT',
      '/terrain/S01W001.DAT',
    ]);
    expect(result.files).toEqual([
      { name: 'S01W001.DAT', status: 'error', detail: 'connection refused' },
      { name: 'S01E000.DAT', status: 'error', detail: 'HTTP 500' },
      { name: 'N00W001.DAT', status: 'missing', detail: 'CAMERA_SIM_TERRAIN_DIR is not set' },
      { name: 'N00E000.DAT', status: 'loaded', blocksWithData: 0 },
    ]);
    expect(result.database.files.map((f) => [f.latDegrees, f.lonDegrees])).toEqual([[0, 0]]);
  });
});
