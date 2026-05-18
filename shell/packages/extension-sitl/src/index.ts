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
const DEFAULT_BASE_URL = 'ws://localhost:8088/v1/ws/mavlink';

function composeUrl(baseUrl: string): string {
  return `${baseUrl}?filter=${encodeURIComponent(FILTER)}`;
}

let client: MavlinkClient | null = null;

function openClient(baseUrl: string): void {
  client = createMavlinkClient({
    url: composeUrl(baseUrl),
    onMessage: applyMessage,
    onConnectionStateChange: setConnectionState,
  });
}

async function closeClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

export const sitlExtension: Extension = {
  manifest: {
    id: 'gcscode.sitl',
    displayName: 'SITL Telemetry',
    version: '0.0.0',
    description:
      'Live ArduCopter telemetry via mavlink2rest WebSocket; publishes a telemetry export.',
  },
  activate(context): SitlExports {
    context.subscriptions.push(
      context.host.configuration.registerConfiguration({
        key: 'gcscode.sitl.connectionUrl',
        schema: {
          type: 'string',
          format: 'uri',
          description:
            'WebSocket base URL of the mavlink2rest bridge. The extension appends a `?filter=…` query string from its compile-time message-type allowlist.',
        },
        default: DEFAULT_BASE_URL,
      }),
    );

    const cfg = context.host.configuration.getConfiguration('gcscode.sitl');
    openClient(cfg.get<string>('connectionUrl', DEFAULT_BASE_URL));

    context.subscriptions.push(
      context.host.configuration.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('gcscode.sitl.connectionUrl')) return;
        const newBase = context.host.configuration
          .getConfiguration('gcscode.sitl')
          .get<string>('connectionUrl', DEFAULT_BASE_URL);
        // Fire-and-forget reconnect; errors propagate via the WebSocket's
        // onerror/onclose pathway already handled by createMavlinkClient.
        void closeClient().then(() => openClient(newBase));
      }),
    );

    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.sitl.location',
        component: SitlView,
        title: 'SITL',
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
    await closeClient();
    reset();
  },
};
