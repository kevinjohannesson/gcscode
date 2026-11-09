import type { Extension } from '@gcscode/extension-api';
import type { AssetsApi } from '@gcscode/extension-assets';

import { createAssetAdapter } from './asset-adapter';
import { createMavlinkClient, type MavlinkClient } from './mavlink-client';
import MavlinkView from './mavlink-view.svelte';
import {
  applyMessage,
  reset,
  setConnectionState,
  telemetryState,
  type TelemetryState,
} from './telemetry-store.svelte';

/**
 * Cross-extension exports for the MAVLink extension. Consumers `import type` this
 * from `@gcscode/extension-mavlink` and look up the live value via
 * `host.extensions.getExtension<MavlinkExports>('gcscode.mavlink')?.exports`.
 *
 * `telemetry` is the live `$state` proxy from `telemetry-store.svelte.ts` —
 * field reads in `$derived` / template contexts auto-track. Typed `Readonly`
 * to communicate "consumers do not mutate this." Runtime allows writes; the
 * readonly is convention + lint, not a hard wall (see ADR-0005's known
 * limitations).
 */
export interface MavlinkExports {
  telemetry: Readonly<TelemetryState>;
}

const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$';
const DEFAULT_BASE_URL = 'ws://localhost:8088/v1/ws/mavlink';

function composeUrl(baseUrl: string): string {
  return `${baseUrl}?filter=${encodeURIComponent(FILTER)}`;
}

let client: MavlinkClient | null = null;

function openClient(baseUrl: string, onMessage: (json: unknown) => void): void {
  client = createMavlinkClient({
    url: composeUrl(baseUrl),
    onMessage,
    onConnectionStateChange: setConnectionState,
  });
}

async function closeClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

export const mavlinkExtension: Extension = {
  manifest: {
    id: 'gcscode.mavlink',
    displayName: 'MAVLink',
    version: '0.0.0',
    description:
      'Live ArduCopter telemetry via mavlink2rest WebSocket; publishes a telemetry export.',
  },
  activate(context): MavlinkExports {
    context.subscriptions.push(
      context.host.configuration.registerConfiguration({
        key: 'gcscode.mavlink.connectionUrl',
        schema: {
          type: 'string',
          format: 'uri',
          description:
            'WebSocket base URL of the mavlink2rest bridge. The extension appends a `?filter=…` query string from its compile-time message-type allowlist.',
        },
        default: DEFAULT_BASE_URL,
      }),
    );

    const cfg = context.host.configuration.getConfiguration('gcscode.mavlink');

    // Resolved per message rather than here: the assets service may activate
    // after this one, and that lazy resolution is exactly why the bundling
    // order stays a comment instead of becoming a constraint (ADR-0012).
    const assetAdapter = createAssetAdapter(
      () => context.host.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports,
    );
    // Pushed to `subscriptions`, which is what makes a normal deactivate and
    // containment's failure path both remove this extension's assets.
    context.subscriptions.push(assetAdapter);

    const handleMessage = (json: unknown): void => {
      // Telemetry first. It is this extension's existing duty and must not
      // depend on the newer one; the client deliberately does not catch what a
      // handler throws, which is why the adapter degrades rather than throws.
      applyMessage(json);
      assetAdapter.onMessage(json);
    };

    openClient(cfg.get<string>('connectionUrl', DEFAULT_BASE_URL), handleMessage);

    context.subscriptions.push(
      context.host.configuration.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('gcscode.mavlink.connectionUrl')) return;
        const newBase = context.host.configuration
          .getConfiguration('gcscode.mavlink')
          .get<string>('connectionUrl', DEFAULT_BASE_URL);
        // Fire-and-forget reconnect; errors propagate via the WebSocket's
        // onerror/onclose pathway already handled by createMavlinkClient.
        void closeClient().then(() => openClient(newBase, handleMessage));
      }),
    );

    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.mavlink.location',
        component: MavlinkView,
        title: 'MAVLink',
      }),
      context.host.commands.registerCommand({
        id: 'gcscode.mavlink.getLocation',
        title: 'Get Location',
        category: 'MAVLink',
        run: () => {
          if (telemetryState.lat === null || telemetryState.lng === null) {
            console.log('MAVLink location: (no fix yet)');
            return null;
          }
          const loc = {
            lat: telemetryState.lat,
            lng: telemetryState.lng,
            alt: telemetryState.alt,
          };
          console.log('MAVLink location:', loc);
          return loc;
        },
      }),
      context.host.keybindings.registerKeybinding({
        key: 'Alt+Shift+L',
        command: 'gcscode.mavlink.getLocation',
      }),
    );

    return { telemetry: telemetryState };
  },
  async deactivate() {
    await closeClient();
    reset();
  },
};
