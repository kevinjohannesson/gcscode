import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';
import { sitlExtension } from '@gcscode/extension-sitl';
import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status';

export interface ManifestEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
  { id: sitlExtension.id, extension: sitlExtension },
  // Must come after sitlExtension — vehicle-status reads SITL exports during
  // first render and relies on insertion-order activation. See ADR-0005's
  // "Cross-extension activation order is not guaranteed" consequence.
  { id: vehicleStatusExtension.id, extension: vehicleStatusExtension },
];
