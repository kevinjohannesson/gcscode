import type { TerrainLoadResult } from './terrain/terrain-loader';
import type { GroundCheck } from './vehicles/vehicle-track';
import type { ImageryStatus } from './world/imagery-lod';

/** The status page's terrain line: what ground the sim is rendering, and why. */
export function describeTerrain(
  enabled: boolean,
  result: TerrainLoadResult | undefined,
  hasHomeTerrain: boolean,
): string {
  if (!enabled || result === undefined) return 'off: flat world, for SITL with SIM_TERRAIN 0';
  const files = result.files.map((f) => {
    if (f.status === 'loaded') return `${f.name} (${f.blocksWithData} blocks with data)`;
    if (f.status === 'missing') return `${f.name} not found${f.detail ? `: ${f.detail}` : ''}`;
    return `${f.name} failed${f.detail ? `: ${f.detail}` : ''}`;
  });
  const anyLoaded = result.files.some((f) => f.status === 'loaded');
  if (!anyLoaded)
    return `${files.join('; ')}. Rendering flat ground until SITL’s terrain file is served.`;
  if (!hasHomeTerrain)
    return `${files.join('; ')}. No data at home, so SITL’s ground is flat everywhere.`;
  return files.join('; ');
}

export function describeImagery(status: ImageryStatus): string {
  const finest = status.finestZoom === undefined ? 'none yet' : `finest z${status.finestZoom}`;
  const failed = status.failed > 0 ? `, ${status.failed} failed (grid shown)` : '';
  return `${status.drawn} tiles drawn, ${finest}, ${status.loading} loading${failed}`;
}

/** Whether the rendered ground agrees with SITL's, from a landed vehicle. */
export function describeGroundCheck(check: GroundCheck): string {
  if (check.state === 'waiting') return 'Ground check: waiting for the vehicle to sit disarmed';
  const height = check.heightAboveGroundM;
  if (check.state === 'ok') {
    return `Ground check: OK, landed ${Math.abs(height).toFixed(2)} m from the rendered ground`;
  }
  return (
    `Ground check: MISMATCH, landed ${Math.abs(height).toFixed(1)} m ${height > 0 ? 'above' : 'below'} ` +
    'the rendered ground. Check terrain=on/off against SITL’s SIM_TERRAIN, and the origin against SIM_OPOS_*.'
  );
}
