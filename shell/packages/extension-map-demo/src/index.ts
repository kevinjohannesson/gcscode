import type { Extension, ExtensionHost } from '@gcscode/extension-api';
import type { SitlExports } from '@gcscode/extension-sitl';

import MapView from './map-view.svelte';

let host: ExtensionHost | null = null;

/**
 * Helper for the map view component to read SITL exports reactively.
 * Returns undefined if SITL is not currently activated. Reads inside a
 * `$derived` re-run when SITL enables / disables (registry's exports map is
 * a SvelteMap — see ADR-0005).
 */
export function getSitlExports(): SitlExports | undefined {
  return host?.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports;
}

export const mapDemoExtension: Extension = {
  manifest: {
    id: 'gcscode.map-demo',
    displayName: 'Map (demo)',
    version: '0.0.0',
    description:
      'Throwaway scaffold: maplibre map with a drone marker driven by SITL telemetry. The real Map iteration replaces this.',
  },
  activate(context) {
    host = context.host;
    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.map-demo.main',
        component: MapView,
      }),
    );
  },
  deactivate() {
    host = null;
  },
};
