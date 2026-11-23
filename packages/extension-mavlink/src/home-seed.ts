/**
 * Fills in each vehicle's home for the Map input view from the bridge.
 *
 * ArduPilot sends HOME_POSITION when home is set (at boot, on arming), not
 * periodically, so a station that connects afterwards never sees one on the
 * WebSocket. mavlink2rest keeps the last copy of every message it has relayed,
 * so once per vehicle this reads that copy over the bridge's REST API: a read,
 * never a request to the vehicle. Later homes arrive on the stream as usual.
 *
 * Nothing here throws: it runs inside the WebSocket handler.
 */

import type { VehicleInputsTracker } from './vehicle-inputs.svelte';

/**
 * The REST address of a system's stored message, from the WebSocket base URL:
 * `ws://host:8088/v1/ws/mavlink` reads from `http://host:8088/v1/mavlink/…`.
 * Null when the URL does not have mavlink2rest's shape, so nothing is fetched.
 */
export function storedMessageUrl(
  wsBase: string,
  systemId: number,
  componentId: number,
  message: string,
): string | null {
  let url: URL;
  try {
    url = new URL(wsBase);
  } catch {
    return null;
  }
  const scheme = url.protocol === 'ws:' ? 'http:' : url.protocol === 'wss:' ? 'https:' : null;
  const match = /^(.*)\/ws\/mavlink\/?$/.exec(url.pathname);
  if (scheme === null || match === null) return null;
  return `${scheme}//${url.host}${match[1]}/mavlink/vehicles/${systemId}/components/${componentId}/messages/${message}`;
}

export interface HomeSeeder {
  onMessage(json: unknown): void;
  /** Forget which vehicles were asked about: on a new connection, ask again. */
  reset(): void;
}

export function createHomeSeeder(options: {
  tracker: VehicleInputsTracker;
  wsBase: () => string;
  fetch: (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
}): HomeSeeder {
  const { tracker, wsBase, fetch } = options;
  let asked = new Set<number>();

  return {
    onMessage(json: unknown): void {
      if (typeof json !== 'object' || json === null) return;
      const header = (json as { header?: unknown }).header;
      if (typeof header !== 'object' || header === null) return;
      const { system_id: systemId, component_id: componentId } = header as Record<string, unknown>;
      if (typeof systemId !== 'number' || typeof componentId !== 'number') return;
      // Only for a vehicle the view shows: a ground station's heartbeat is not one.
      if (asked.has(systemId) || !tracker.has(systemId)) return;
      const url = storedMessageUrl(wsBase(), systemId, componentId, 'HOME_POSITION');
      if (url === null) return;
      asked.add(systemId);
      const round = asked;
      try {
        fetch(url)
          .then((response) => (response.ok ? response.json() : null))
          .then((body) => {
            // A reset since the request: the answer belongs to an old connection.
            if (body !== null && round === asked) tracker.seedHome(systemId, componentId, body);
          })
          .catch(() => {});
      } catch {
        // A fetch that throws synchronously is a home left unknown, nothing more.
      }
    },
    reset(): void {
      asked = new Set();
    },
  };
}
