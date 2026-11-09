// Host-side list of which extensions to bundle into this build. NOT the
// public per-extension manifest (that's ExtensionManifest in
// @gcscode/extension-api). See ADR-0007.

import type { Extension } from '@gcscode/extension-api';

import { assetsExtension } from '@gcscode/extension-assets';
import { assetsDemoExtension } from '@gcscode/extension-assets-demo';
import { exampleExtension } from '@gcscode/extension-example';
import { mavlinkFlightOverlayExtension } from '@gcscode/extension-mavlink-flight-overlay';
import { mapExtension } from '@gcscode/extension-map';
import { mapDemoExtension } from '@gcscode/extension-map-demo';
import { mavlinkExtension } from '@gcscode/extension-mavlink';
import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status';

export interface BundledExtensionEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
  /**
   * Ids the extension had before a rename. At startup the host moves what it
   * saved under them to `id` (`previous-ids.ts`). Keep an id here for as long
   * as saved state under it may exist.
   */
  previousIds?: readonly string[];
}

export const bundledExtensions: readonly BundledExtensionEntry[] = [
  { id: exampleExtension.manifest.id, extension: exampleExtension },
  // A service other extensions write into. Its position here is documentation,
  // NOT an ordering constraint: the MAVLink adapter resolves this service
  // lazily per inbound message and claims its source on first use, and the
  // assets-demo consumer resolves it per render, so there is no
  // activation-time edge for this list to order. See ADR-0012's Mechanics.
  // Scope of that claim: this entry. A summary here of which *other* entries
  // do state a requirement would go stale silently every time one is added,
  // so each entry's own comment answers that for itself.
  { id: assetsExtension.manifest.id, extension: assetsExtension },
  // Renamed from `gcscode.sitl` under ADR-0014.
  { id: mavlinkExtension.manifest.id, extension: mavlinkExtension, previousIds: ['gcscode.sitl'] },
  // The throwaway consumer that makes the registry observable. Its position
  // is documentation too: it resolves the assets service and reads its assets
  // inside a `$derived` per render, so it picks up the service activating and
  // every later registration with no activation-time edge and no change event.
  { id: assetsDemoExtension.manifest.id, extension: assetsDemoExtension },
  // Positioned after mavlinkExtension as documentation, not as a constraint:
  // vehicle-status reads MAVLink exports lazily per use (getMavlinkExports()
  // inside a $derived), so a later activation is picked up on the next read
  // and ADR-0005's unguaranteed activation order costs nothing here.
  { id: vehicleStatusExtension.manifest.id, extension: vehicleStatusExtension },
  // Same as vehicle-status, and documentation for the same reason: map-demo
  // reads MAVLink exports lazily per use (getMavlinkExports() inside a $derived).
  { id: mapDemoExtension.manifest.id, extension: mapDemoExtension },
  // Map exposes a contribution API consumed by flight-overlay; it must
  // activate before flight-overlay. No ordering requirement vs. mavlink.
  { id: mapExtension.manifest.id, extension: mapExtension },
  // Must come after mapExtension — flight-overlay reads map exports during
  // its activate(). Degrades (registers no overlay, warns once) if map is not
  // active, so the order is about the overlay appearing, not about avoiding a
  // boot failure.
  // Renamed from `gcscode.flight-overlay` under ADR-0014.
  {
    id: mavlinkFlightOverlayExtension.manifest.id,
    extension: mavlinkFlightOverlayExtension,
    previousIds: ['gcscode.flight-overlay'],
  },
];
