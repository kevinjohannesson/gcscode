import type { Extension } from '@gcscode/extension-api';
import type { AssetsApi } from '@gcscode/extension-assets';

import { createAssetAdapter } from './asset-adapter';
import { linkState } from './link-state.svelte';
import LinkStateView from './link-state-view.svelte';
import { createHomeSeeder } from './home-seed';
import { createMavlinkClient, type MavlinkClient } from './mavlink-client';
import MapInputView from './map-input-view.svelte';
import MavlinkView from './mavlink-view.svelte';
import { DEFAULT_STATION_URL, stationLink } from './station-link.svelte';
import {
  applyMessage,
  reset,
  setConnectionState,
  telemetryState,
  type TelemetryState,
} from './telemetry-store.svelte';
import { vehicleInputs } from './vehicle-inputs.svelte';

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

const FILTER = '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS|HOME_POSITION)$';
const DEFAULT_BASE_URL = 'ws://localhost:8088/v1/ws/mavlink';

function composeUrl(baseUrl: string): string {
  return `${baseUrl}?filter=${encodeURIComponent(FILTER)}`;
}

let client: MavlinkClient | null = null;
/** The base URL the open client was given; the Map input view's home seed reads the bridge there. */
let clientBase = DEFAULT_BASE_URL;

function openClient(baseUrl: string, onMessage: (json: unknown) => void): void {
  clientBase = baseUrl;
  client = createMavlinkClient({
    url: composeUrl(baseUrl),
    onMessage,
    onConnectionStateChange: (state) => {
      setConnectionState(state);
      linkState.setBridge(state);
    },
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
      'Live ArduCopter telemetry via mavlink2rest WebSocket; publishes a telemetry export, and shows per vehicle what the map is fed and the state of the link, the station process included.',
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

    context.subscriptions.push(
      context.host.configuration.registerConfiguration({
        key: 'gcscode.mavlink.stationUrl',
        schema: {
          type: 'string',
          format: 'uri',
          description:
            "WebSocket address of the station process, this extension's native half (packages/mavlink-station). The Link state view shows whether it is running.",
        },
        default: DEFAULT_STATION_URL,
      }),
    );

    const cfg = context.host.configuration.getConfiguration('gcscode.mavlink');

    // The session to the station is this extension's (ADR-0015 Decision 3):
    // started here, stopped through `subscriptions`. It only listens.
    stationLink.start(cfg.get<string>('stationUrl', DEFAULT_STATION_URL));
    context.subscriptions.push({ dispose: () => stationLink.stop() });

    // Resolved per message rather than here: the assets service may activate
    // after this one, and that lazy resolution is exactly why the bundling
    // order stays a comment instead of becoming a constraint (ADR-0012).
    const assetAdapter = createAssetAdapter(
      () => context.host.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports,
    );
    // Pushed to `subscriptions`, which is what makes a normal deactivate and
    // containment's failure path both remove this extension's assets.
    context.subscriptions.push(assetAdapter);

    // Fills in each vehicle's home for the Map input view from the bridge's
    // stored copy, once per vehicle: a read, never a request to the vehicle.
    const homeSeeder = createHomeSeeder({
      tracker: vehicleInputs,
      wsBase: () => clientBase,
      fetch: (url) => fetch(url),
    });

    const handleMessage = (json: unknown): void => {
      // Telemetry first. It is this extension's existing duty and must not
      // depend on the newer one; the client deliberately does not catch what a
      // handler throws, which is why the adapter degrades rather than throws.
      applyMessage(json);
      linkState.noteMessage(json);
      assetAdapter.onMessage(json);
      // Read-only, and it never throws: the Map input view's per-vehicle copy
      // of what `applyMessage` merges.
      vehicleInputs.onMessage(json);
      homeSeeder.onMessage(json);
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
        homeSeeder.reset();
        void closeClient().then(() => openClient(newBase, handleMessage));
      }),
      context.host.configuration.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration('gcscode.mavlink.stationUrl')) return;
        stationLink.start(
          context.host.configuration
            .getConfiguration('gcscode.mavlink')
            .get<string>('stationUrl', DEFAULT_STATION_URL),
        );
      }),
    );

    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.mavlink.location',
        component: MavlinkView,
        title: 'MAVLink',
      }),
      context.host.window.registerView({
        id: 'gcscode.mavlink.mapInput',
        component: MapInputView,
        title: 'Map input',
      }),
      context.host.window.registerView({
        id: 'gcscode.mavlink.linkState',
        component: LinkStateView,
        title: 'Link state',
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
    vehicleInputs.reset();
    linkState.reset();
  },
};
