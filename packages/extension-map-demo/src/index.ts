import type { Extension, ExtensionHost } from '@gcscode/extension-api';
import type { MavlinkExports } from '@gcscode/extension-mavlink';

import MapView from './map-view.svelte';

let host: ExtensionHost | null = null;

/**
 * Helper for the map view component to read MAVLink exports reactively.
 * Returns undefined if MAVLink is not currently activated. Reads inside a
 * `$derived` re-run when MAVLink enables / disables (registry's exports map is
 * a SvelteMap — see ADR-0005).
 */
export function getMavlinkExports(): MavlinkExports | undefined {
  return host?.extensions.getExtension<MavlinkExports>('gcscode.mavlink')?.exports;
}

export const mapDemoExtension: Extension = {
  manifest: {
    id: 'gcscode.map-demo',
    displayName: 'Map (demo)',
    version: '0.0.0',
    description:
      'Throwaway scaffold: maplibre map with a drone marker driven by MAVLink telemetry. The real Map iteration replaces this.',
  },
  activate(context) {
    host = context.host;
    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.map-demo.main',
        component: MapView,
        title: 'Map (demo)',
      }),
    );
  },
  deactivate() {
    host = null;
  },
};
