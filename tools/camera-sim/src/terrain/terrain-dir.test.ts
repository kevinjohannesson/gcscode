import { describe, expect, it } from 'vitest';

import { terrainDir } from './terrain-dir';

const HOME = '/h';

describe('terrainDir', () => {
  it('uses CAMERA_SIM_TERRAIN_DIR when it is set', () => {
    expect(terrainDir({ CAMERA_SIM_TERRAIN_DIR: '/t' }, HOME)).toBe('/t');
  });

  it('falls back to the terrain folder in GCSCODE_SITL_HOME', () => {
    expect(terrainDir({ GCSCODE_SITL_HOME: '/s' }, HOME)).toBe('/s/ardupilot/terrain');
  });

  it('falls back to SITL’s default home, as run_sitl.sh does', () => {
    expect(terrainDir({}, HOME)).toBe('/h/.gcscode/sitl/ardupilot/terrain');
  });

  it('treats empty values as unset', () => {
    expect(terrainDir({ CAMERA_SIM_TERRAIN_DIR: '  ', GCSCODE_SITL_HOME: '' }, HOME)).toBe(
      '/h/.gcscode/sitl/ardupilot/terrain',
    );
  });
});
