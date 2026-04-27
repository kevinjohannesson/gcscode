import type { Extension } from '@gcscode/extension-api';

import { createMavlinkClient, type MavlinkClient } from './mavlink-client';
import SitlView from './sitl-view.svelte';
import { applyMessage, reset, setConnectionState, telemetryState } from './telemetry-store.svelte';

const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$';
const WS_URL = `ws://localhost:8088/v1/ws/mavlink?filter=${encodeURIComponent(FILTER)}`;

let client: MavlinkClient | null = null;

export const sitlExtension: Extension = {
  id: 'gcscode.sitl',
  displayName: 'SITL Telemetry',
  version: '0.0.0',
  activate(context) {
    client = createMavlinkClient({
      url: WS_URL,
      onMessage: applyMessage,
      onConnectionStateChange: setConnectionState,
    });

    context.subscriptions.push(
      context.host.registerView({
        id: 'gcscode.sitl.location',
        component: SitlView,
      }),
      context.host.registerCommand({
        id: 'gcscode.sitl.getLocation',
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
      context.host.registerKeybinding({
        key: 'Alt+Shift+L',
        command: 'gcscode.sitl.getLocation',
      }),
    );
  },
  async deactivate() {
    if (client) {
      await client.close();
      client = null;
    }
    reset();
  },
};
