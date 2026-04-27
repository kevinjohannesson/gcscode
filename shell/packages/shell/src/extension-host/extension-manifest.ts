import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';

export interface ManifestEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
];
