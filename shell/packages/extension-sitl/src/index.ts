import type { Extension } from '@gcscode/extension-api';

import { SITL_LOCATION } from './location';
import SitlView from './sitl-view.svelte';

export const sitlExtension: Extension = {
  id: 'gcscode.sitl',
  displayName: 'SITL Stub',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'gcscode.sitl.location',
        component: SitlView,
      }),
      context.host.registerCommand({
        id: 'gcscode.sitl.getLocation',
        run: () => {
          console.log('SITL location:', SITL_LOCATION);
          return SITL_LOCATION;
        },
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+L',
        command: 'gcscode.sitl.getLocation',
      }),
    );
  },
};
