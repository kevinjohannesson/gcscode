import { SvelteMap } from 'svelte/reactivity';

import type { Disposable } from '@gcscode/extension-api';

import type { AssetDescription, AssetSource, AssetsApi, RegisteredAsset } from './index';

class AssetRegistry implements AssetsApi {
  /** Insertion-ordered, which is what makes "replacing preserves position"
   *  implementable. Reactive, which is how consumers observe without an event. */
  private readonly _assets = new SvelteMap<string, RegisteredAsset>();
  private readonly _liveSourceIds = new Set<string>();
  private _nextKey = 1;

  public createSource(sourceId: string, label: string): AssetSource {
    if (this._liveSourceIds.has(sourceId)) {
      throw new Error(`Asset source id "${sourceId}" is already claimed by a live source.`);
    }
    this._liveSourceIds.add(sourceId);
    return this._makeSource(sourceId, label);
  }

  public getAssets(): readonly RegisteredAsset[] {
    return [...this._assets.values()];
  }

  private _makeSource(sourceId: string, label: string): AssetSource {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a private localId -> key index, mutated only from registerAsset and never read in a reactive context
    const keysByLocalId = new Map<string, string>();
    let disposed = false;

    const source: AssetSource = {
      sourceId,
      get isLive() {
        return !disposed;
      },
      // `label` rides this source's closure for the same reason `keysByLocalId`
      // does: it is per-source, fixed at claim time, and needs no lifecycle of
      // its own. A registry-level map keyed by `sourceId` would need one, plus
      // a fallback that could stamp a `sourceId` — a comparison token, never
      // displayed (ADR-0011) — into `sourceLabel`.
      registerAsset: (description) => this._register(source, label, keysByLocalId, description),
      dispose: () => {
        if (disposed) return;
        disposed = true;
        for (const key of keysByLocalId.values()) this._assets.delete(key);
        keysByLocalId.clear();
        this._liveSourceIds.delete(sourceId);
      },
    };
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
      ...(airframe === undefined ? {} : { airframe }),
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

export function createAssetRegistry(): AssetsApi {
  return new AssetRegistry();
}
