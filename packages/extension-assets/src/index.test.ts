import { describe, expect, it } from 'vitest';

import type { ExtensionContext, ExtensionHost } from '@gcscode/extension-api';

import type { AssetRegistryHandle } from './asset-registry.svelte';
import { assetsExtension } from './index';

/** The registry registers no contributions and reads nothing off the host, so
 *  an empty host is enough — a full fake would stand in for nothing. */
function makeContext(): ExtensionContext {
  return {
    host: {} as ExtensionHost,
    subscriptions: [],
    extension: {
      id: assetsExtension.manifest.id,
      displayName: assetsExtension.manifest.displayName,
      version: assetsExtension.manifest.version,
    },
  };
}

/** `activate` narrows its return to `AssetsApi` on purpose, so a test standing
 *  in for the owning host casts back to the handle — the same unchecked cast
 *  `getExtension<T>()` performs. */
function activate(context: ExtensionContext): AssetRegistryHandle {
  return assetsExtension.activate(context) as AssetRegistryHandle;
}

/** Asserted rather than optional-chained at each call site: `activate` mints a
 *  fresh registry regardless, so a missing hook would let the second-activation
 *  case pass without any teardown having run. */
function deactivate(): void {
  expect(assetsExtension.deactivate).toBeTypeOf('function');
  assetsExtension.deactivate?.();
}

describe('assetsExtension', () => {
  it('declares the identity the adapter resolves it by', () => {
    expect(assetsExtension.manifest.id).toBe('gcscode.assets');
    expect(assetsExtension.manifest.displayName).toBe('Assets');
    expect(typeof assetsExtension.manifest.version).toBe('string');
  });

  it('returns a registry as its exports and registers no contributions', () => {
    const context = makeContext();
    const api = activate(context);

    expect(api.createSource('sitl', 'SITL').isLive).toBe(true);
    expect(api.getAssets()).toEqual([]);
    expect(context.subscriptions).toHaveLength(0);

    deactivate();
  });

  it('empties the registry on deactivate, and a held handle goes inert', () => {
    const api = activate(makeContext());
    const source = api.createSource('sitl', 'SITL');
    source.registerAsset({ localId: '1' });

    deactivate();

    expect(source.isLive).toBe(false);
    expect(api.getAssets()).toEqual([]);
    // Cases 12-13 across the extension boundary: inert, never throwing — the
    // adapter writes from inside a message handler.
    const inert = source.registerAsset({ localId: '2' });
    expect(api.getAssets()).toEqual([]);
    expect(() => inert.dispose()).not.toThrow();
  });

  it('starts empty on a second activation', () => {
    const first = activate(makeContext());
    first.createSource('sitl', 'SITL').registerAsset({ localId: '1' });
    deactivate();

    const second = activate(makeContext());

    expect(second).not.toBe(first);
    expect(second.getAssets()).toEqual([]);
    // The id is claimable again: nothing from the previous activation survives.
    expect(() => second.createSource('sitl', 'SITL')).not.toThrow();

    deactivate();
  });
});
