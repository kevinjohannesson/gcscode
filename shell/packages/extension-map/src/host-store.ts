import type { ExtensionHost } from '@gcscode/extension-api';

/**
 * Module-level slot for the captured ExtensionHost. Set by the map
 * extension's `activate(context)` so internal components (notably
 * MapControlButton) can dispatch commands without each instance receiving
 * the host as a prop.
 *
 * Intentionally NOT exported from the package's `index.ts` — this is an
 * internal-only contract. Extension consumers (component-path controls)
 * read the host through the public `host.extensions.getExtension(...)`
 * pattern instead.
 *
 * Single-instance assumption: only one `gcscode.map` extension is active
 * at a time. If the extension is disabled and re-enabled, `activate` runs
 * again and overwrites the slot — the previous host reference is also
 * still valid until the disable's deactivate completes; both writes use
 * `context.host` of equivalent shape, so the overwrite is benign.
 */

let _host: ExtensionHost | null = null;

export function setHost(host: ExtensionHost): void {
  _host = host;
}

export function clearHost(): void {
  _host = null;
}

export function getHost(): ExtensionHost {
  if (!_host) {
    throw new Error(
      'gcscode.map host is not captured. Internal invariant violation — ' +
        'MapControlButton was rendered before activate() captured the host.',
    );
  }
  return _host;
}
