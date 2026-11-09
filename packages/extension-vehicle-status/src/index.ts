import type { Extension, ExtensionHost } from '@gcscode/extension-api';
import type { MavlinkExports } from '@gcscode/extension-mavlink';

import VehicleStatusItem from './vehicle-status-item.svelte';

let host: ExtensionHost | null = null;

/**
 * Helper for the status bar component to read MAVLink exports reactively.
 * Returns undefined if MAVLink is not currently activated. Reads inside a
 * `$derived` re-run when MAVLink enables / disables (registry's exports map is
 * a SvelteMap — see ADR-0005).
 */
export function getMavlinkExports(): MavlinkExports | undefined {
  return host?.extensions.getExtension<MavlinkExports>('gcscode.mavlink')?.exports;
}

export const vehicleStatusExtension: Extension = {
  manifest: {
    id: 'gcscode.vehicle-status',
    displayName: 'Vehicle Status',
    version: '0.0.0',
    description: 'Footer status item that reads MAVLink telemetry via cross-extension exports.',
  },
  activate(context) {
    host = context.host;
    context.subscriptions.push(
      context.host.window.registerStatusBarItem({
        id: 'gcscode.vehicle-status.summary',
        component: VehicleStatusItem,
        alignment: 'left',
      }),
    );
  },
  deactivate() {
    host = null;
  },
};
