// Host-side list of which extensions to bundle into this build. NOT the
// public per-extension manifest (that's ExtensionManifest in
// @gcscode/extension-api). See ADR-0007.

import type { Extension } from '@gcscode/extension-api';

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
  { id: sitlExtension.manifest.id, extension: sitlExtension },
  // Must come after sitlExtension — vehicle-status reads SITL exports during
  // first render and relies on insertion-order activation. See ADR-0005's
  // "Cross-extension activation order is not guaranteed" consequence.
  { id: vehicleStatusExtension.manifest.id, extension: vehicleStatusExtension },
  // Same SITL-after constraint as vehicle-status — map-demo reads SITL exports.
  { id: mapDemoExtension.manifest.id, extension: mapDemoExtension },
  // Map exposes a contribution API consumed by flight-overlay; it must
  // activate before flight-overlay. No ordering requirement vs. sitl.
  { id: mapExtension.manifest.id, extension: mapExtension },
  // Must come after mapExtension — flight-overlay reads map exports during
  // its activate(). Throws if map is not active. Same insertion-order
  // pattern as vehicle-status and map-demo.
  { id: flightOverlayExtension.manifest.id, extension: flightOverlayExtension },
];
