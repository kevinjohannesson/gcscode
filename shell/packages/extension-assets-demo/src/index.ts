import type { Extension, ExtensionHost } from '@gcscode/extension-api';
import type { AssetsApi } from '@gcscode/extension-assets';

import AssetsStatusItem from './assets-status-item.svelte';

let host: ExtensionHost | null = null;

/**
 * Resolve the assets service through the host. The status-bar component calls
 * this from a `$derived` on **every render** and nothing here caches the
 * result: the host's exports map and the registry's own asset map are both
 * `SvelteMap`s, so a read inside a reactive context re-runs when either
 * changes. That is the entire mechanism by which this consumer stays live —
 * there is no change event to subscribe to.
 *
 * `undefined` while the assets extension is not activated, which is a state
 * the consumer renders rather than treats as an error: activation order is not
 * guaranteed (ADR-0005), and a later activation is picked up on the next read.
 */
export function getAssetsApi(): AssetsApi | undefined {
  return host?.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports;
}

export const assetsDemoExtension: Extension = {
  manifest: {
    id: 'gcscode.assets-demo',
    displayName: 'Assets (demo)',
    version: '0.0.0',
    description:
      'Throwaway scaffold: a status-bar label naming every asset the registry holds. The real asset UI replaces this.',
  },
  activate(context) {
    host = context.host;
    // Deliberately nothing else: no resolution, no claim, no snapshot. A
    // consumer that resolved the service here would still be correct about
    // *resolution* — extension-flight-overlay does exactly that — but a label
    // built from a snapshot taken here never updates again.
    context.subscriptions.push(
      context.host.window.registerStatusBarItem({
        id: 'gcscode.assets-demo.summary',
        component: AssetsStatusItem,
        alignment: 'left',
      }),
    );
  },
  deactivate() {
    host = null;
  },
};
