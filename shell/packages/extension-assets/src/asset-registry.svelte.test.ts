import { describe, expect, it } from 'vitest';

import { createAssetRegistry } from './asset-registry.svelte';
import type { RegisteredAsset } from './index';

describe('asset registry', () => {
  it('claims a source and starts empty', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    expect(source.sourceId).toBe('sitl');
    expect(registry.getAssets()).toEqual([]);
  });

  it('throws on a duplicate claim of a live source id', () => {
    const registry = createAssetRegistry();
    registry.createSource('sitl', 'SITL');
    expect(() => registry.createSource('sitl', 'SITL again')).toThrow(/sitl/);
  });

  it('allows re-claiming a source id after the source is disposed', () => {
    const registry = createAssetRegistry();
    registry.createSource('sitl', 'SITL').dispose();
    expect(() => registry.createSource('sitl', 'SITL again')).not.toThrow();
  });

  it('stamps sourceId, sourceLabel and a minted key the caller did not supply', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    source.registerAsset({ localId: '1', airframe: { kind: 'multirotor' } });
    const [asset] = registry.getAssets();
    expect(asset.sourceId).toBe('sitl');
    expect(asset.sourceLabel).toBe('SITL');
    expect(asset.localId).toBe('1');
    expect(asset.key).toBeTruthy();
  });

  it('namespaces localIds per source', () => {
    const registry = createAssetRegistry();
    registry.createSource('a', 'A').registerAsset({ localId: '1' });
    registry.createSource('b', 'B').registerAsset({ localId: '1' });
    const keys = registry.getAssets().map((a) => a.key);
    expect(registry.getAssets()).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it('replaces a re-registered localId in place, preserving position', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    const original = source.registerAsset({ localId: '1', airframe: { kind: 'multirotor' } });
    source.registerAsset({ localId: '2', airframe: { kind: 'fixed-wing' } });
    const replacement = source.registerAsset({ localId: '1', airframe: { kind: 'vtol' } });

    const assets = registry.getAssets();
    expect(assets.map((a) => a.localId)).toEqual(['1', '2']);
    expect(assets[0].airframe).toEqual({ kind: 'vtol' });
    expect(assets).toHaveLength(2);
    // Case 6 also requires a *fresh* `Disposable`, not the superseded one back.
    expect(replacement).not.toBe(original);
  });

  it('leaves the replacement in place when the superseded disposable is disposed', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    const superseded = source.registerAsset({ localId: '1' });
    source.registerAsset({ localId: '1', airframe: { kind: 'vtol' } });

    superseded.dispose();

    expect(registry.getAssets()).toHaveLength(1);
    expect(registry.getAssets()[0].airframe).toEqual({ kind: 'vtol' });
  });

  it('removes exactly the disposed asset', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    const one = source.registerAsset({ localId: '1' });
    source.registerAsset({ localId: '2' });

    one.dispose();

    expect(registry.getAssets().map((a) => a.localId)).toEqual(['2']);
  });

  it('removes every asset of a disposed source', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    source.registerAsset({ localId: '1' });
    source.registerAsset({ localId: '2' });

    source.dispose();

    expect(registry.getAssets()).toEqual([]);
  });

  it('mints keys that are unique and stable for the asset lifetime', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    source.registerAsset({ localId: '1' });
    source.registerAsset({ localId: '2' });
    expect(new Set(registry.getAssets().map((a) => a.key)).size).toBe(2);

    // Find the asset by `localId` rather than by position: reading index 0
    // would still see the pre-existing entry if a re-registration appended a
    // freshly-keyed duplicate instead of replacing, and the stability
    // assertion would pass vacuously.
    const before = registry.getAssets().filter((a) => a.localId === '1');
    expect(before).toHaveLength(1);

    source.registerAsset({ localId: '1', airframe: { kind: 'vtol' } });

    const after = registry.getAssets().filter((a) => a.localId === '1');
    expect(after).toHaveLength(1);
    expect(after[0].key).toBe(before[0].key);
  });

  it('returns a snapshot the consumer cannot mutate', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    source.registerAsset({ localId: '1', airframe: { kind: 'multirotor' } });

    const assets = registry.getAssets();
    // @ts-expect-error — elements are readonly; this is the compile-time half of case 10
    assets[0].airframe = { kind: 'none' };
    // The runtime half: pushing to the snapshot does not reach the registry.
    (assets as RegisteredAsset[]).push({
      localId: 'x',
      sourceId: 'sitl',
      sourceLabel: 'SITL',
      key: 'x',
    });
    expect(registry.getAssets()).toHaveLength(1);
  });
});
