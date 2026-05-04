import type { Extension } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';

import { homeLocation } from './flight-overlay-config';
import DroneIconLayer from './layers/drone-icon-layer.svelte';
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
      map.registerLayer(DroneIconLayer),
      map.registerLayer(HomeLocationLayer),
      map.registerLayer(MaxDistanceCircleLayer),

      // Recenter command — palette-discoverable as
      // `Flight Overlay: Recenter on Drone`. Same action wired to both the
      // top-right map control button and the palette entry; either path
      // routes through executeCommand.
      context.host.commands.registerCommand({
        id: 'gcscode.flight-overlay.recenter',
        title: 'Recenter on Drone',
        category: 'Flight Overlay',
        run: () => {
          const sitl = flightOverlayState.sitlExports;
          const lat = sitl?.telemetry.lat ?? null;
          const lng = sitl?.telemetry.lng ?? null;
          // Explicit null-checks (not truthiness) so lat/lng = 0 (null island,
          // Gulf of Guinea — a valid GPS coordinate) still triggers the write
          // path rather than the homeLocation fallback. Don't simplify to
          // `if (lat && lng)` — silently broken for 0,0.
          if (lat !== null && lng !== null) {
            map.camera.center = [lng, lat];
          } else {
            // SITL has no fix yet — fall back to homeLocation so the operator
            // gets a sensible "go back to where the drone should be" result
            // rather than a silent no-op.
            map.camera.center = homeLocation;
          }
        },
      }),

      // Control `id` and `commandId` happen to share the same string here by
      // convention — that's not a contract requirement. A control can fire any
      // registered command, and the same command can be fired by multiple
      // controls. The interface deliberately separates these fields.
      //
      // Casing note: `title` (palette entry) is title case to match VS Code's
      // command-display convention and the existing `category: 'Flight Overlay'`
      // already-title-case context. `tooltip` is sentence case to match the
      // map-tool ecosystem convention (Mapbox, Leaflet, browser zoom controls
      // all use sentence-case tooltips on map controls).
      map.registerControl({
        id: 'gcscode.flight-overlay.recenter',
        position: 'top-right',
        icon: { kind: 'lucide', name: 'crosshair' },
        tooltip: 'Recenter on drone',
        commandId: 'gcscode.flight-overlay.recenter',
      }),
    );
  },
  deactivate() {
    flightOverlayState.clearHost();
  },
};
