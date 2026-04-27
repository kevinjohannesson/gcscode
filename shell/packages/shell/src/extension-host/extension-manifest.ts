import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';
import { sitlExtension } from '@gcscode/extension-sitl';

export interface ManifestEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
  { id: sitlExtension.id, extension: sitlExtension },
];
