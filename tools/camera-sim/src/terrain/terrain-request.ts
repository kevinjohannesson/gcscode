import { join } from 'node:path';

/**
 * For the dev server: maps a request under `/terrain/` to a file in SITL's
 * terrain folder. Only ArduPilot's own file names (`S36E149.DAT`) get through,
 * so a request can never reach anything else on disk.
 *
 * Node-only; used by vite.config.ts, never bundled into the page.
 */
const TERRAIN_FILE_NAME = /^[NS]\d{2}[EW]\d{3}\.DAT$/;

export type TerrainRequest =
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'not-found'; readonly reason: string };

export function resolveTerrainRequest(terrainDir: string | undefined, url: string): TerrainRequest {
  let name: string;
  try {
    name = decodeURIComponent(url.split('?')[0]!.replace(/^\/+/, ''));
  } catch {
    return { kind: 'not-found', reason: 'Not a terrain file name.' };
  }
  if (!TERRAIN_FILE_NAME.test(name))
    return { kind: 'not-found', reason: 'Not a terrain file name.' };
  if (terrainDir === undefined || terrainDir.trim() === '') {
    return {
      kind: 'not-found',
      reason: 'CAMERA_SIM_TERRAIN_DIR is not set: point it at SITL’s terrain folder (see README).',
    };
  }
  return { kind: 'file', path: join(terrainDir, name) };
}
