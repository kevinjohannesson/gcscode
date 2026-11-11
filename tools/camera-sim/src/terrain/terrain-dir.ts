import { join } from 'node:path';

/**
 * The folder the dev server serves SITL's terrain files from:
 * CAMERA_SIM_TERRAIN_DIR when set, otherwise the one SITL itself reads,
 * `<GCSCODE_SITL_HOME>/ardupilot/terrain`, with GCSCODE_SITL_HOME defaulting
 * to `~/.gcscode/sitl` as in `run_sitl.sh`. An empty value counts as unset.
 *
 * Node-only; used by vite.config.ts, never bundled into the page.
 */
export function terrainDir(
  env: { readonly CAMERA_SIM_TERRAIN_DIR?: string; readonly GCSCODE_SITL_HOME?: string },
  homeDir: string,
): string {
  const sitlHome = given(env.GCSCODE_SITL_HOME) ?? join(homeDir, '.gcscode', 'sitl');
  return given(env.CAMERA_SIM_TERRAIN_DIR) ?? join(sitlHome, 'ardupilot', 'terrain');
}

function given(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}
