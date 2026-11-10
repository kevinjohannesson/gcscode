import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

import { resolveTerrainRequest } from './src/terrain/terrain-request';

/**
 * Serves SITL's terrain files at `/terrain/<name>.DAT`, so the page reads the
 * same ground SITL flies over. The folder comes from CAMERA_SIM_TERRAIN_DIR,
 * set in `.env.local` (gitignored) or the environment.
 */
function sitlTerrain(terrainDir: string | undefined): Plugin {
  const handle = (req: IncomingMessage, res: ServerResponse) => {
    const request = resolveTerrainRequest(terrainDir, req.url ?? '');
    const notFound = (reason: string) => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(reason);
    };
    if (request.kind === 'not-found') {
      notFound(request.reason);
      return;
    }
    readFile(request.path).then(
      (data) => {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.end(data);
      },
      // No file means SITL has no data for that square either: its ground is flat there.
      () => notFound(`No terrain file for this square in ${terrainDir}.`),
    );
  };
  return {
    name: 'camera-sim-sitl-terrain',
    configureServer: (server) => void server.middlewares.use('/terrain', handle),
    configurePreviewServer: (server) => void server.middlewares.use('/terrain', handle),
  };
}

// Local-first: the dev server listens on localhost only. To open the sim from
// another machine on the LAN, start it with `--host` (see README).
export default defineConfig(({ mode }) => {
  const packageDir = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, packageDir, 'CAMERA_SIM_');
  return {
    plugins: [sitlTerrain(env.CAMERA_SIM_TERRAIN_DIR)],
    server: { port: 5174 },
    // three.js alone is ~500 kB minified; this is a local tool, not a page on a budget.
    build: { chunkSizeWarningLimit: 1000 },
    test: {
      include: ['src/**/*.test.ts'],
      environment: 'node',
    },
  };
});
