// Host-side list of which extensions to bundle into this build. NOT the
// public per-extension manifest (that's ExtensionManifest in
// @gcscode/extension-api). See ADR-0007.

import type { Extension } from '@gcscode/extension-api';

import { assetsExtension } from '@gcscode/extension-assets';
import { assetsDemoExtension } from '@gcscode/extension-assets-demo';
import { exampleExtension } from '@gcscode/extension-example';
import { flightOverlayExtension } from '@gcscode/extension-flight-overlay';
import { mapExtension } from '@gcscode/extension-map';
import { mapDemoExtension } from '@gcscode/extension-map-demo';
import { sitlExtension } from '@gcscode/extension-sitl';
import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status';

export interface BundledExtensionEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
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
  { id: sitlExtension.manifest.id, extension: sitlExtension },
  // The throwaway consumer that makes the registry observable. Its position
  // is documentation too: it resolves the assets service and reads its assets
  // inside a `$derived` per render, so it picks up the service activating and
  // every later registration with no activation-time edge and no change event.
  { id: assetsDemoExtension.manifest.id, extension: assetsDemoExtension },
  // Positioned after sitlExtension as documentation, not as a constraint:
  // vehicle-status reads SITL exports lazily per use (getSitlExports() inside
  // a $derived), so a later activation is picked up on the next read and
  // ADR-0005's unguaranteed activation order costs nothing here.
  { id: vehicleStatusExtension.manifest.id, extension: vehicleStatusExtension },
  // Same as vehicle-status, and documentation for the same reason: map-demo
  // reads SITL exports lazily per use (getSitlExports() inside a $derived).
  { id: mapDemoExtension.manifest.id, extension: mapDemoExtension },
  // Map exposes a contribution API consumed by flight-overlay; it must
  // activate before flight-overlay. No ordering requirement vs. sitl.
  { id: mapExtension.manifest.id, extension: mapExtension },
  // Must come after mapExtension — flight-overlay reads map exports during
  // its activate(). Degrades (registers no overlay, warns once) if map is not
  // active, so the order is about the overlay appearing, not about avoiding a
  // boot failure.
  { id: flightOverlayExtension.manifest.id, extension: flightOverlayExtension },
];
