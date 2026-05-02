import type { Extension } from '@gcscode/extension-api';

import { createMavlinkClient, type MavlinkClient } from './mavlink-client';
import SitlView from './sitl-view.svelte';
import {
  applyMessage,
  reset,
  setConnectionState,
  telemetryState,
  type TelemetryState,
} from './telemetry-store.svelte';

/**
 * Cross-extension exports for the SITL extension. Consumers `import type` this
 * from `@gcscode/extension-sitl` and look up the live value via
 * `host.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports`.
 *
 * `telemetry` is the live `$state` proxy from `telemetry-store.svelte.ts` —
 * field reads in `$derived` / template contexts auto-track. Typed `Readonly`
 * to communicate "consumers do not mutate this." Runtime allows writes; the
 * readonly is convention + lint, not a hard wall (see ADR-0005's known
 * limitations).
 */
export interface SitlExports {
  telemetry: Readonly<TelemetryState>;
}

const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$';
const WS_URL = `ws://localhost:8088/v1/ws/mavlink?filter=${encodeURIComponent(FILTER)}`;

let client: MavlinkClient | null = null;

export const sitlExtension: Extension = {
  id: 'gcscode.sitl',
  displayName: 'SITL Telemetry',
  version: '0.0.0',
  activate(context): SitlExports {
    client = createMavlinkClient({
      url: WS_URL,
      onMessage: applyMessage,
      onConnectionStateChange: setConnectionState,
    });

    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.sitl.location',
        component: SitlView,
      }),
      context.host.commands.registerCommand({
        id: 'gcscode.sitl.getLocation',
        title: 'Get Location',
        category: 'SITL',
        run: () => {
          if (telemetryState.lat === null || telemetryState.lng === null) {
            console.log('SITL location: (no fix yet)');
            return null;
          }
          const loc = {
            lat: telemetryState.lat,
            lng: telemetryState.lng,
            alt: telemetryState.alt,
          };
          console.log('SITL location:', loc);
          return loc;
        },
      }),
      context.host.keybindings.registerKeybinding({
        key: 'Alt+Shift+L',
        command: 'gcscode.sitl.getLocation',
      }),
    );

    return { telemetry: telemetryState };
  },
  async deactivate() {
    if (client) {
      await client.close();
      client = null;
    }
    reset();
  },
};
