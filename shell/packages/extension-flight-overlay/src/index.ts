import type { Extension } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';

import DroneMarkerLayer from './layers/drone-marker-layer.svelte';
import HomeLocationLayer from './layers/home-location-layer.svelte';
import MaxDistanceCircleLayer from './layers/max-distance-circle-layer.svelte';
import { flightOverlayState } from './state';

export const flightOverlayExtension: Extension = {
  manifest: {
    id: 'gcscode.flight-overlay',
    displayName: 'Flight Overlay',
    version: '0.0.0',
    description: 'Drone marker, home location, and max-distance circle rendered on the map.',
  },
  activate(context) {
    // Validate before capturing host — if activate throws, we want no leftover
    // state in the singleton. Layers' $effect reads route through state, so
    // host capture must happen before any layer mounts (which can't happen
    // before registerLayer is called below).
    const map = context.host.extensions.getExtension<MapApi>('gcscode.map')?.exports;
    if (!map) {
      throw new Error(
        'gcscode.flight-overlay requires gcscode.map to be active before it activates',
      );
    }

    flightOverlayState.setHost(context.host);

    context.subscriptions.push(
      map.registerLayer(DroneMarkerLayer),
      map.registerLayer(HomeLocationLayer),
      map.registerLayer(MaxDistanceCircleLayer),
    );
  },
  deactivate() {
    flightOverlayState.clearHost();
  },
};
