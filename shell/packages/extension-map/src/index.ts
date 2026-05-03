import type { Extension } from '@gcscode/extension-api';

import { mapApi, type MapApi } from './map-api.svelte';
import MapView from './map-view.svelte';

export type { MapApi, MapCamera } from './map-api.svelte';
export { MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';
export { mapApi };

export const mapExtension: Extension = {
  manifest: {
    id: 'gcscode.map',
    displayName: 'Map',
    version: '0.0.0',
    description:
      'Geographical view. Exposes a contribution API for other extensions to register map layers.',
  },
  activate(context): MapApi {
    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.map.main',
        component: MapView,
      }),
    );
    return mapApi;
  },
};
