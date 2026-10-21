import type { Disposable, Extension } from '@gcscode/extension-api';

import { createAssetRegistry, type AssetRegistryHandle } from './asset-registry.svelte';

export type Airframe =
  | { kind: 'multirotor' }
  | { kind: 'fixed-wing' }
  | { kind: 'vtol' }
  | { kind: 'none' } // asserted: this asset does not fly
  | { kind: 'unknown' }; // gcscode has no word for what the adapter saw

export interface AssetDescription {
  /** Unique within the registering source. Opaque to consumers — never parsed,
   *  pattern-matched or persisted. */
  localId: string;
  /** Absent = not asserted. `{ kind: 'none' }` = asserted: does not fly. */
  airframe?: Airframe;
}

/** A registry entry. Every field is `readonly`: in a single-realm host with no
 *  isolation the type is the only enforcement there is, and `readonly T[]`
 *  protects the array rather than its elements. */
export interface RegisteredAsset {
  readonly localId: string;
  readonly airframe?: Airframe;
  /** Which source asserted this. A comparison token, never displayed. */
  readonly sourceId: string;
  /** The source's operator-facing name. This is what UI renders. */
  readonly sourceLabel: string;
  /** Registry-minted, unique across sources, opaque. UI keys on this. */
  readonly key: string;
}

export interface AssetSource extends Disposable {
  readonly sourceId: string;
  /** False once this handle no longer writes into a live registry — because it
   *  was disposed, or because the registry it belonged to was torn down. A
   *  writer checks this before writing and re-claims when it is false. */
  readonly isLive: boolean;
  registerAsset(description: AssetDescription): Disposable;
}

export interface AssetsApi {
  /** Claim a namespace for one source of assets. `sourceId` must be unique
   *  among live sources; a second claim on a live id throws. `label` is the
   *  source's operator-facing name. A claim against a registry that has
   *  already been torn down returns an inert source (`isLive === false`)
   *  rather than throwing, because a writer re-claims from inside a message
   *  handler. */
  createSource(sourceId: string, label: string): AssetSource;
  /** Every asset currently registered, across every source. */
  getAssets(): readonly RegisteredAsset[];
}

/** The live registry for the current activation. Module-level because
 *  `deactivate` needs it, never exported: the only way to reach it is
 *  `activate()`'s return value, per ADR-0012. A fresh one per activation —
 *  rather than `extension-map`'s surviving `mapApi` singleton — is the rule
 *  for a service whose contents are asserted by *other* extensions: surviving
 *  state would resurrect assets whose asserting adapter is long gone
 *  (ADR-0011), and it is what makes `isLive` correct across the boundary: a
 *  handle held through a disable reports false rather than writing into a
 *  registry no consumer can reach. */
let registry: AssetRegistryHandle | null = null;

export const assetsExtension: Extension = {
  manifest: {
    id: 'gcscode.assets',
    displayName: 'Assets',
    version: '0.0.0',
    description: 'Adapter-neutral registry of the assets gcscode knows about.',
  },
  /** Declares `AssetsApi`, not `AssetRegistryHandle`: `teardown` stays off the
   *  type a consumer is written against. See `AssetRegistryHandle` for how far
   *  that goes (type-level signal, not a runtime guarantee). */
  activate(): AssetsApi {
    registry = createAssetRegistry();
    return registry;
  },
  deactivate() {
    registry?.teardown();
    registry = null;
  },
};
