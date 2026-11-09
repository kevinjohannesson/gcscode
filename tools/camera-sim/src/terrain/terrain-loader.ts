import { toE7 } from './sitl-ground';
import { datFileName, degreeOf, TerrainDatabase, TerrainFile } from './ap-terrain';
import type { GeoBounds } from '../geo/web-mercator-tiles';

/** ArduPilot's default TERRAIN_SPACING; SITL only accepts blocks at its own spacing. */
export const TERRAIN_SPACING_M = 100;

export interface TerrainFileStatus {
  readonly name: string;
  readonly status: 'loaded' | 'missing' | 'error';
  /** For a loaded file: how many of its blocks hold data. */
  readonly blocksWithData?: number;
  readonly detail?: string;
}

export interface TerrainLoadResult {
  readonly database: TerrainDatabase;
  readonly files: readonly TerrainFileStatus[];
}

/** The whole-degree squares (south-west corners) a lat/lon box touches. */
export function degreeSquaresCovering(
  bounds: GeoBounds,
): { latDegrees: number; lonDegrees: number }[] {
  const squares: { latDegrees: number; lonDegrees: number }[] = [];
  for (let lat = degreeOf(toE7(bounds.south)); lat <= degreeOf(toE7(bounds.north)); lat++) {
    for (let lon = degreeOf(toE7(bounds.west)); lon <= degreeOf(toE7(bounds.east)); lon++) {
      squares.push({ latDegrees: lat, lonDegrees: lon });
    }
  }
  return squares;
}

/**
 * Fetches the terrain files covering the world. A missing file is not an
 * error: SITL has no data there either, and its ground is flat.
 */
export async function loadTerrain(
  baseUrl: string,
  bounds: GeoBounds,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<TerrainLoadResult> {
  const database = new TerrainDatabase();
  const files = await Promise.all(
    degreeSquaresCovering(bounds).map(
      async ({ latDegrees, lonDegrees }): Promise<TerrainFileStatus> => {
        const name = datFileName(latDegrees, lonDegrees);
        try {
          const response = await fetchImpl(`${baseUrl}/${name}`, { cache: 'no-store' });
          if (response.status === 404) {
            return { name, status: 'missing', detail: (await response.text()).trim() || undefined };
          }
          if (!response.ok) return { name, status: 'error', detail: `HTTP ${response.status}` };
          const file = new TerrainFile(
            await response.arrayBuffer(),
            latDegrees,
            lonDegrees,
            TERRAIN_SPACING_M,
          );
          database.add(file);
          return { name, status: 'loaded', blocksWithData: file.countBlocksWithData() };
        } catch (error) {
          return {
            name,
            status: 'error',
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      },
    ),
  );
  return { database, files };
}
