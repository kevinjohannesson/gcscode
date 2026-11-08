import { SvelteMap } from 'svelte/reactivity';

import type { Disposable } from '@gcscode/extension-api';

import type { AssetDescription, AssetSource, AssetsApi, RegisteredAsset } from './index';

class AssetRegistry implements AssetsApi {
  /** Insertion-ordered, which is what makes "replacing preserves position"
   *  implementable. Reactive, which is how consumers observe without an event. */
  private readonly _assets = new SvelteMap<string, RegisteredAsset>();
  private readonly _liveSourceIds = new Set<string>();
  /** Every live source's own `dispose`, so teardown runs each one rather than
   *  reimplementing what it does. Each source removes itself on dispose. */
  private readonly _sourceDisposers = new Set<() => void>();
  /** Set by `teardown`, never cleared: a torn-down registry stays torn down.
   *  Consulted by `createSource` rather than by a source's own `isLive`, so
   *  that disposing every source remains the mechanism by which a handle held
   *  across teardown goes false — and a teardown that stopped doing it stays
   *  detectable. */
  private _tornDown = false;
  private _nextKey = 1;

  public createSource(sourceId: string, label: string): AssetSource {
    if (this._tornDown) {
      // Claiming against a dead registry is inert, not fatal: a writer
      // re-claims from inside a message handler when `isLive` goes false, so
      // ADR-0011's reasoning against throwing there covers claiming as much as
      // registering. Built by disposing a real source rather than by writing a
      // second definition of "inert", so the two cannot drift: the id is never
      // added to `_liveSourceIds`, so this claim neither conflicts nor is
      // conflicted with, and the disposer it registered removes itself.
      const inert = this._makeSource(sourceId, label);
      inert.dispose();
      return inert;
    }
    if (this._liveSourceIds.has(sourceId)) {
      throw new Error(`Asset source id "${sourceId}" is already claimed by a live source.`);
    }
    this._liveSourceIds.add(sourceId);
    return this._makeSource(sourceId, label);
  }

  public getAssets(): readonly RegisteredAsset[] {
    return [...this._assets.values()];
  }

  /** Disposes every source and empties the registry. Handles held across this
   *  boundary report `isLive === false` and go inert — they do not throw,
   *  because a writer would otherwise throw inside a message handler. */
  public teardown(): void {
    this._tornDown = true;
    // A copy: each `dispose` removes itself from the set as it runs.
    for (const dispose of [...this._sourceDisposers]) dispose();
    // Belt and braces. Disposing every tracked source already empties both,
    // since every asset is registered through a source and every live id is
    // tracked here; these two lines keep that true of a future entry path.
    this._assets.clear();
    this._liveSourceIds.clear();
  }

  private _makeSource(sourceId: string, label: string): AssetSource {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a private localId -> key index, mutated only from registerAsset and never read in a reactive context
    const keysByLocalId = new Map<string, string>();
    let disposed = false;

    const dispose = () => {
      if (disposed) return;
      disposed = true;
      for (const key of keysByLocalId.values()) this._assets.delete(key);
      keysByLocalId.clear();
      this._liveSourceIds.delete(sourceId);
      this._sourceDisposers.delete(dispose);
    };

    const source: AssetSource = {
      sourceId,
      get isLive() {
        // Reads this source's own `disposed`, deliberately not the registry's
        // `_tornDown`: teardown goes through every source's `dispose`, and
        // this getter is what makes that mechanism observable. Reading the
        // flag here would look like a simplification and would quietly disarm
        // the check — a teardown that stopped disposing its sources would
        // still report `false`, so no test would discriminate the two.
        return !disposed;
      },
      // `label` rides this source's closure for the same reason `keysByLocalId`
      // does: it is per-source, fixed at claim time, and needs no lifecycle of
      // its own. A registry-level map keyed by `sourceId` would need one, plus
      // a fallback that could stamp a `sourceId` — a comparison token, never
      // displayed (ADR-0011) — into `sourceLabel`.
      registerAsset: (description) => this._register(source, label, keysByLocalId, description),
      dispose,
    };
    this._sourceDisposers.add(dispose);
    return source;
  }

  private _register(
    source: AssetSource,
    sourceLabel: string,
    keysByLocalId: Map<string, string>,
    description: AssetDescription,
  ): Disposable {
    // An inert handle does nothing rather than throwing: a writer calls this
    // from inside a message handler. Exercised by the handle-validity cases.
    if (!source.isLive) return { dispose: () => undefined };

    // Read once: `AssetDescription` is the caller's mutable object, and an
    // adapter may keep and reuse it between messages.
    const { localId, airframe } = description;
    const existing = keysByLocalId.get(localId);
    const key = existing ?? `asset-${this._nextKey++}`;
    keysByLocalId.set(localId, key);

    const entry: RegisteredAsset = {
      localId,
      // Absent stays absent: an `airframe: undefined` key would make
      // "not asserted" indistinguishable from an asserted value (ADR-0011).
      // Copied, not held by reference: a writer that reuses its description
      // object would otherwise corrupt a live entry *without* any `set()`
      // running, so no consumer would even re-render to show the wrong value.
      ...(airframe === undefined ? {} : { airframe: { ...airframe } }),
      sourceId: source.sourceId,
      sourceLabel,
      key,
    };
    // SvelteMap.set on an existing key replaces in place and preserves order.
    this._assets.set(key, entry);

    return {
      dispose: () => {
        // Entry identity carries two rules at once: a superseded handle is
        // inert (its entry is no longer the one under `key`), and disposing
        // twice is a no-op (nothing is under `key` any more).
        if (this._assets.get(key) !== entry) return;
        this._assets.delete(key);
        keysByLocalId.delete(localId);
      },
    };
  }
}

/** The registry plus the lifecycle control its owning extension needs.
 *  `activate()` keeps this and declares the narrower `AssetsApi` as what it
 *  returns, so `teardown` is absent from the type a consumer writes against.
 *  That is a type-level signal, not a runtime guarantee: the host stores
 *  exports as `unknown` and `getExtension<T>()` casts to whatever `T` the
 *  caller supplies, so `getExtension<AssetRegistryHandle>(id)?.exports` is an
 *  ordinary runtime path to `teardown`. Same standing as `RegisteredAsset`'s
 *  `readonly` fields — in a single-realm host with no isolation the type is
 *  the only enforcement there is. */
export interface AssetRegistryHandle extends AssetsApi {
  teardown(): void;
}

export function createAssetRegistry(): AssetRegistryHandle {
  return new AssetRegistry();
}
