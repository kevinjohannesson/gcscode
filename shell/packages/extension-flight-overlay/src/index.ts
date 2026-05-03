import type { Extension } from '@gcscode/extension-api';

import { flightOverlayState } from './state';

export const flightOverlayExtension: Extension = {
  manifest: {
    id: 'gcscode.flight-overlay',
    displayName: 'Flight Overlay',
    version: '0.0.0',
    description:
      'Drone marker, home location, and max-distance circle rendered on the map. First consumer of the map contribution API.',
  },
  activate(context) {
    // Placeholder. Task 5 (commit 4) replaces this with: validate map presence,
    // setHost, register three layer components, push three Disposables.
    flightOverlayState.setHost(context.host);
  },
  deactivate() {
    flightOverlayState.clearHost();
  },
};
