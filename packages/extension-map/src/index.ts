import type { Extension } from '@gcscode/extension-api';

import { setHost } from './host-store';
import { mapApi, type MapApi } from './map-api.svelte';
import MapView from './map-view.svelte';

export type {
  ControlIcon,
  ControlPosition,
  ControlRegistration,
  MapApi,
  MapCamera,
  MapControlComponentRegistration,
  MapControlContribution,
} from './map-api.svelte';

export const mapExtension: Extension = {
  manifest: {
    id: 'gcscode.map',
    displayName: 'Map',
    version: '0.0.0',
    description: 'Geographical view of the vehicles and the ground around them.',
  },
  activate(context): MapApi {
    setHost(context.host);
    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.map.main',
        component: MapView,
        title: 'Map',
      }),
    );
    return mapApi;
  },
};
