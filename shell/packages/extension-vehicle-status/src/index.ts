import type { Extension, ExtensionHost } from '@gcscode/extension-api';
import type { SitlExports } from '@gcscode/extension-sitl';

import VehicleStatusItem from './vehicle-status-item.svelte';

let host: ExtensionHost | null = null;

/**
 * Helper for the status bar component to read SITL exports reactively.
 * Returns undefined if SITL is not currently activated. Reads inside a
 * `$derived` re-run when SITL enables / disables (registry's exports map is
 * a SvelteMap — see ADR-0005).
 */
export function getSitlExports(): SitlExports | undefined {
  return host?.getExtension<SitlExports>('gcscode.sitl')?.exports;
}

export const vehicleStatusExtension: Extension = {
  id: 'gcscode.vehicle-status',
  displayName: 'Vehicle Status',
  version: '0.0.0',
  activate(context) {
    host = context.host;
    context.subscriptions.push(
      context.host.registerStatusBarItem({
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
