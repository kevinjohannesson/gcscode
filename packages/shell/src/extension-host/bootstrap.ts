import type { Extension } from '@gcscode/extension-api';

import type { BundledExtensionEntry } from './bundled-extensions';
import type { ExtensionManager } from './extension-manager';

/** The slice of `ExtensionPersistence` bootstrap needs. */
interface BootstrapPersistence {
  isInitiallyEnabled(id: string, fallback: boolean): boolean;
}

/**
 * Registers the shell's extensions. Lifted out of `main.ts`'s module scope so a
 * test can assert that one failing activation does not stop the rest — the
 * guarantee the containment iteration exists for. `main.ts` keeps the ordering:
 * bootstrap, then the keybinding dispatcher, then mount.
 *
 * Synchronous and complete on return: callers sequence work after it (`main.ts`
 * attaches the keybinding dispatcher and mounts), and activation order is the
 * only cross-extension guarantee there is (ADR-0005), which `bundled-extensions.ts`
 * depends on. Nothing here may be deferred or reordered.
 *
 * Deviation from the spec: its Architecture section sketches the signature as
 * `bootstrap({ registry, manager, persistence, extensions })`. There is no
 * `registry` field here, because nothing would read it — `manager` already
 * closes over the same instance, and the one thing a direct handle would buy a
 * caller is registering around the manager, which is the containment bypass
 * this iteration exists to prevent. The sketch also omits `builtIns`, which is
 * present; it is prose, not the contract.
 */
export function bootstrap(options: {
  manager: ExtensionManager;
  persistence: BootstrapPersistence;
  extensions: readonly BundledExtensionEntry[];
  builtIns?: readonly Extension[];
}): void {
  const { manager, persistence, extensions, builtIns = [] } = options;

  // Built-ins are always enabled and not tracked in persistence, but they are
  // registered through the same contained path as everything else.
  for (const extension of builtIns) {
    manager.register(extension, { enabled: true });
  }

  for (const { id, extension, initialEnabled = true } of extensions) {
    manager.register(extension, { enabled: persistence.isInitiallyEnabled(id, initialEnabled) });
  }
}
