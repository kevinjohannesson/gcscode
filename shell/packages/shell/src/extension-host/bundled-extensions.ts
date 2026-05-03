// Host-side list of which extensions to bundle into this build. NOT the
// public per-extension manifest (that's ExtensionManifest in
// @gcscode/extension-api). See ADR-0007.

import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';
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
];
