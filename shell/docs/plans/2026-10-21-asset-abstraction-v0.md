# Asset abstraction v0 — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first adapter-neutral contract — a service extension holding assets, `extension-sitl` as the MAVLink adapter registering into it, and a throwaway consumer rendering `sourceLabel · airframe`.

**Architecture:** `@gcscode/extension-assets` owns a registry constructed per `activate()` and returned as its exports. `extension-sitl` claims a source lazily on first heartbeat, registers one asset per `system_id`, and re-claims whenever its handle reports `isLive === false`. `@gcscode/extension-assets-demo` registers a status-bar item whose component reads the registry per render, so Svelte reactivity carries updates with no change event.

**Tech stack:** TypeScript, Svelte 5 runes, `SvelteMap`, Vitest, pnpm workspace.

**Spec:** [`docs/specs/2026-10-21-asset-abstraction-v0.md`](../specs/2026-10-21-asset-abstraction-v0.md) — 35 numbered validation cases. Every task below names the cases it covers; the union is all 35.

---

## Before you start — two things that will bite

**Run vitest from inside the package you are testing.** `cd shell && npx vitest run` finds no config and silently runs a different, smaller set. From `shell/packages/<pkg>` it is correct. The shell package's baseline is **279 tests across 21 files**; each extension package has its own much smaller suite.

**The two MAVLink field names are unverified and must not be guessed.** No code in `packages/` has ever read a MAVLink envelope header. Task 4's first step confirms them; read that task before starting any adapter work.

---

## File structure

**Created:**

- `packages/extension-assets/package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`
- `packages/extension-assets/src/index.ts` — the `Extension`, and the public type exports
- `packages/extension-assets/src/asset-registry.svelte.ts` — the registry class
- `packages/extension-assets/src/asset-registry.svelte.test.ts`
- `packages/extension-assets/src/index.test.ts`
- `packages/extension-assets-demo/` — same scaffolding, plus `src/assets-status-item.svelte`

**Modified:**

- `packages/extension-sitl/src/index.ts` — the adapter
- `packages/extension-sitl/src/asset-adapter.ts` (new, in the sitl package) — mapping plus claim/register logic, kept out of `index.ts` so it is unit-testable without a client
- `packages/shell/src/extension-host/bundled-extensions.ts` — two entries plus three comments
- `packages/extension-map/src/index.ts` and `src/index.test.ts` — the `mapApi` un-export

Vocabulary types live in `extension-assets`'s entry point and are consumed with `import type` from sibling packages. The registry instance is reachable **only** through `activate()`'s return value — never exported.

---

## Task 1: the assets package and its registry

**Covers validation cases 1–10.**

**Files:**

- Create: `packages/extension-assets/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/extension-assets/src/index.ts` (types only at this stage)
- Create: `packages/extension-assets/src/asset-registry.svelte.ts`
- Test: `packages/extension-assets/src/asset-registry.svelte.test.ts`

- [ ] **Step 1: scaffold the package**

`package.json` — model on `packages/extension-map-demo/package.json`, with no dependency beyond the API:

```json
{
  "name": "@gcscode/extension-assets",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gcscode/extension-api": "workspace:*"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "exclude": ["node_modules", "dist"]
}
```

`vitest.config.ts` — copy `packages/extension-map-demo/vitest.config.ts` verbatim.

**One deviation, decided after task 1 reported it:** this package has no Svelte components, so the `check` script is `tsc --noEmit` only and `tsconfig.json`'s `include` drops `src/**/*.svelte` — otherwise `svelte-check` prints a warning for a glob that matches nothing. `packages/extension-api` is the in-repo precedent for a Svelte-less package. `extension-assets-demo` in task 6 **does** have a component and keeps both.

Then `pnpm install` from `shell/` so the workspace links it. **Task 3 will also need `@gcscode/extension-assets` added to `packages/shell/package.json`** — the plan originally omitted it and the shell's import does not resolve without it. Commit the lockfile change with whichever task adds it.

- [ ] **Step 2: write the failing registry tests**

`src/asset-registry.svelte.test.ts`. Note case 10 asserts a **compile-time** claim as well as a runtime one; the `@ts-expect-error` line is the assertion, and it fails the build if the mutation becomes legal.

```ts
import { describe, expect, it } from 'vitest';

import { createAssetRegistry } from './asset-registry.svelte';

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
    source.registerAsset({ localId: '1', airframe: { kind: 'multirotor' } });
    source.registerAsset({ localId: '2', airframe: { kind: 'fixed-wing' } });
    const first = source.registerAsset({ localId: '1', airframe: { kind: 'vtol' } });

    const assets = registry.getAssets();
    expect(assets.map((a) => a.localId)).toEqual(['1', '2']);
    expect(assets[0].airframe).toEqual({ kind: 'vtol' });
    expect(assets).toHaveLength(2);
    void first;
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
    const before = registry.getAssets()[0].key;
    source.registerAsset({ localId: '1', airframe: { kind: 'vtol' } });
    expect(registry.getAssets()[0].key).toBe(before);
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
```

Add `import type { RegisteredAsset } from './index';` at the top for that last cast.

- [ ] **Step 3: run them and watch them fail**

Run: `cd "$(git rev-parse --show-toplevel)"/shell/packages/extension-assets && npx vitest run`
Expected: FAIL — cannot resolve `./asset-registry.svelte`.

- [ ] **Step 4: write the types**

`src/index.ts`, types only for now — the `Extension` lands in task 3. Note every field is `readonly` on the registered form, which is case 10's compile-time half:

```ts
import type { Disposable } from '@gcscode/extension-api';

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
   *  source's operator-facing name. */
  createSource(sourceId: string, label: string): AssetSource;
  /** Every asset currently registered, across every source. */
  getAssets(): readonly RegisteredAsset[];
}
```

- [ ] **Step 5: write the registry**

`src/asset-registry.svelte.ts`. A class per the project's convention for reactive external state, with a factory so `activate()` can construct one per activation. `isLive` lands in task 2 — leave it out here and let task 2's tests drive it.

```ts
import type { Disposable } from '@gcscode/extension-api';
import { SvelteMap } from 'svelte/reactivity';

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
    const keysByLocalId = new Map<string, string>();
    let disposed = false;

    const source: AssetSource = {
      sourceId,
      get isLive() {
        return !disposed;
      },
      registerAsset: (description) => this._register(source, keysByLocalId, description),
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
    keysByLocalId: Map<string, string>,
    description: AssetDescription,
  ): Disposable {
    if (!source.isLive) return { dispose: () => undefined };

    const existing = keysByLocalId.get(description.localId);
    const key = existing ?? `asset-${this._nextKey++}`;
    keysByLocalId.set(description.localId, key);

    const entry: RegisteredAsset = {
      localId: description.localId,
      ...(description.airframe === undefined ? {} : { airframe: description.airframe }),
      sourceId: source.sourceId,
      sourceLabel: this._labels.get(source.sourceId) ?? source.sourceId,
      key,
    };
    // SvelteMap.set on an existing key replaces in place and preserves order.
    this._assets.set(key, entry);

    let superseded = false;
    const disposable: Disposable = {
      dispose: () => {
        // A superseded handle is inert: only the current entry for this key may
        // be removed, and only once.
        if (superseded) return;
        if (this._assets.get(key) !== entry) return;
        this._assets.delete(key);
        keysByLocalId.delete(description.localId);
      },
    };
    void superseded;
    return disposable;
  }

  private readonly _labels = new Map<string, string>();
}

export function createAssetRegistry(): AssetsApi {
  return new AssetRegistry();
}
```

**You will need to finish the label plumbing** — `_labels` must be populated in `createSource` before `_register` reads it. That is deliberate: the sketch leaves one obvious wiring gap so you read the code rather than paste it. Fix it the way the class's conventions suggest.

- [ ] **Step 6: run them and watch them pass**

Run: `cd "$(git rev-parse --show-toplevel)"/shell/packages/extension-assets && npx vitest run`
Expected: PASS, 11 tests.

Then `cd "$(git rev-parse --show-toplevel)"/shell && pnpm check` — the `@ts-expect-error` in step 2 must be **used**; if `tsc` reports it as unused, the mutation is legal and case 10's compile-time half is not holding.

- [ ] **Step 7: prove the tests can fail**

For at least cases 6, 9 and 10, mutate the implementation, watch the specific test fail, restore, and report the mutation. Make `_register` always mint a fresh key, and drop the `readonly` from `RegisteredAsset.airframe` (the `@ts-expect-error` becomes unused and `pnpm check` fails). **Note on case 9, corrected during task 1:** an earlier draft of this step claimed the fresh-key mutation would fail case 9, and it did not — the test read `getAssets()[0].key` positionally, so the original entry still sat at index 0 and the stability assertion held. Case 9 must find its asset by `localId` and assert exactly one entry exists for it. The step that exists to catch vacuous assertions contained one.

- [ ] **Step 8: commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add shell/packages/extension-assets shell/pnpm-lock.yaml
git commit -m "feat(assets): add the asset registry with per-source namespacing"
```

---

## Task 2: `isLive`, inert handles, and registry teardown

**Covers validation cases 11–14.**

**Files:**

- Modify: `packages/extension-assets/src/asset-registry.svelte.ts`
- Test: `packages/extension-assets/src/asset-registry.svelte.test.ts`

- [ ] **Step 1: write the failing tests**

```ts
describe('handle validity', () => {
  it('reports isLive true on a fresh source', () => {
    const registry = createAssetRegistry();
    expect(registry.createSource('sitl', 'SITL').isLive).toBe(true);
  });

  it('reports isLive false once disposed, and goes inert without throwing', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    source.dispose();

    expect(source.isLive).toBe(false);
    let disposable: Disposable | undefined;
    expect(() => {
      disposable = source.registerAsset({ localId: '1' });
    }).not.toThrow();
    expect(registry.getAssets()).toEqual([]);
    expect(() => disposable?.dispose()).not.toThrow();
  });

  it('reports isLive false for a handle held across registry teardown', () => {
    const registry = createAssetRegistry();
    const source = registry.createSource('sitl', 'SITL');
    source.registerAsset({ localId: '1' });

    registry.teardown();

    expect(source.isLive).toBe(false);
    expect(() => source.registerAsset({ localId: '2' })).not.toThrow();
    expect(registry.getAssets()).toEqual([]);
  });
});
```

- [ ] **Step 2: run them and watch them fail**

Run: `cd "$(git rev-parse --show-toplevel)"/shell/packages/extension-assets && npx vitest run`
Expected: FAIL — `teardown` does not exist. Note only the third of the three tests fails for that reason; cases 11 and 12 already pass on task 1's code, since `isLive` and the inert-write guard shipped there. A step that claims three failing tests and delivers one is the kind of thing to report, not work around.

- [ ] **Step 3: implement teardown**

Add to the class, and widen the factory's return type so `index.ts` can call it while `AssetsApi` consumers cannot:

```ts
  /** Disposes every source and empties the registry. Handles held across this
   *  boundary report `isLive === false` and go inert — they do not throw,
   *  because a writer would otherwise throw inside a message handler. */
  public teardown(): void {
    for (const dispose of [...this._sourceDisposers]) dispose();
    this._assets.clear();
    this._liveSourceIds.clear();
  }
```

Track each source's `dispose` in a `private readonly _sourceDisposers = new Set<() => void>()`, added in `_makeSource` and removed in that source's own `dispose`.

Export the richer type for the extension's own use:

```ts
export interface AssetRegistryHandle extends AssetsApi {
  teardown(): void;
}

export function createAssetRegistry(): AssetRegistryHandle {
  return new AssetRegistry();
}
```

`AssetsApi` — what consumers see via `exports` — stays without `teardown`, so no extension can tear down another's registry.

- [ ] **Step 4: run them and watch them pass**

Run: vitest from inside the package, then `pnpm check` from `shell/`.
Expected: PASS. The count is task 1's 11 plus the three above, plus one each for step 4b's copy test and case 14 — report what you measure rather than matching a number here.

- [ ] **Step 4b: copy the caller's `airframe` on register**

Task 1's code-quality review found the writer-side sibling of the documented one-level-deep immutability gap: the registry stores the caller's `airframe` **object by reference**, so a writer that mutates one in place after registering would silently corrupt a live entry — and because no `set()` runs, **no reactive signal fires at all**, so no consumer would even re-render to show the corrupted value. That is the invisible-failure class, and the fix is one spread in `_register`:

```ts
      ...(airframe === undefined ? {} : { airframe: { ...airframe } }),
```

Use whatever local task 1 already destructured rather than re-reading `description.airframe` — task 1 destructures once deliberately.

```ts

```

No writer mutates today — task 5's adapter builds a fresh description per message — so this is defence against a future one, bought for a shallow copy of a single-property object. Add a test: register with an `airframe`, mutate the object you passed in, and assert `getAssets()` still reports the original value.

- [ ] **Step 4c: an inert source from a torn-down registry**

Found by task 2's implementer: `createSource` on a torn-down registry returns a source reporting `isLive === true` whose writes land in an instance no consumer can reach — falsifying the spec's "`isLive` is true exactly when a write will land" for a writer that cached `AssetsApi` at `activate()`, the idiom the spec warns about. Set a `_tornDown` flag in `teardown()` and consult it in **`createSource`**, returning an inert source rather than throwing; ADR-0011's message-handler reasoning covers claiming as well as registering.

**Consult the flag in `createSource`, not inside `isLive`.** If `isLive` read it directly, deleting the source-disposal loop from `teardown()` would still leave handles reporting `false` and step 5's mutation would stop discriminating. Re-run that mutation afterwards to confirm it still fails on the liveness assertion.

- [ ] **Step 5: prove case 13 can fail**

Make `teardown` clear `_assets` without disposing the sources. The `isLive === false` assertion must fail while the emptiness assertion still passes — which is exactly the distinction the case exists to draw.

- [ ] **Step 6: commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add shell/packages/extension-assets
git commit -m "feat(assets): add isLive and registry teardown"
```

---

## Task 3: the extension, its bundling, and the ordering comments

**Covers validation case 34; cases 12–14's extension-level half.**

**Files:**

- Modify: `packages/extension-assets/src/index.ts`
- Create: `packages/extension-assets/src/index.test.ts`, `README.md`
- Modify: `packages/shell/src/extension-host/bundled-extensions.ts`

- [ ] **Step 1: write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

import { assetsExtension } from './index';

const context = () => ({
  host: {} as never,
  subscriptions: [] as { dispose(): void }[],
  extension: { id: 'gcscode.assets', displayName: 'Assets', version: '0.0.0' },
});

describe('assetsExtension', () => {
  it('returns a registry as its exports and registers no contributions', () => {
    const ctx = context();
    const exports = assetsExtension.activate(ctx as never);
    expect(exports).toBeDefined();
    expect(ctx.subscriptions).toHaveLength(0);
  });

  it('empties the registry on deactivate, and a held handle goes inert', () => {
    const ctx = context();
    const api = assetsExtension.activate(ctx as never) as ReturnType<
      typeof import('./asset-registry.svelte').createAssetRegistry
    >;
    const source = api.createSource('sitl', 'SITL');
    source.registerAsset({ localId: '1' });

    assetsExtension.deactivate?.();

    expect(source.isLive).toBe(false);
    expect(api.getAssets()).toEqual([]);
  });

  it('starts empty on a second activation', () => {
    const first = assetsExtension.activate(context() as never) as never;
    (first as { createSource: (a: string, b: string) => { registerAsset: (d: unknown) => void } })
      .createSource('sitl', 'SITL')
      .registerAsset({ localId: '1' });
    assetsExtension.deactivate?.();

    const second = assetsExtension.activate(context() as never) as {
      getAssets: () => unknown[];
    };
    expect(second.getAssets()).toEqual([]);
  });
});
```

- [ ] **Step 2: run it and watch it fail**

Run: vitest from inside the package.
Expected: FAIL — `assetsExtension` is not exported.

- [ ] **Step 3: write the extension**

Append to `src/index.ts`:

```ts
import type { Extension } from '@gcscode/extension-api';

import { createAssetRegistry, type AssetRegistryHandle } from './asset-registry.svelte';

/** The live registry for the current activation. Module-level because
 *  `deactivate` needs it, but never exported: the only way to reach it is
 *  `activate()`'s return value, per ADR-0012. A fresh one per activation is
 *  what makes `isLive` a correct handle-validity signal — see the spec. */
let registry: AssetRegistryHandle | null = null;

export const assetsExtension: Extension = {
  manifest: {
    id: 'gcscode.assets',
    displayName: 'Assets',
    version: '0.0.0',
    description: 'Adapter-neutral registry of the assets gcscode knows about.',
  },
  activate() {
    registry = createAssetRegistry();
    return registry;
  },
  deactivate() {
    registry?.teardown();
    registry = null;
  },
};
```

- [ ] **Step 4: bundle it, and fix the comments**

In `packages/shell/src/extension-host/bundled-extensions.ts`, import `assetsExtension` and `assetsDemoExtension` (the latter arrives in task 6 — add its entry then, not now), and add the assets entry **with a comment that says ordering is not required**. Note the count: after this pass demotes `vehicle-status` and `map-demo`, only the **map → flight-overlay** pair states a real requirement — an earlier draft of this step said "three real constraints", which was already wrong and becomes more wrong as this pass lands.

```ts
  // Assets is a service other extensions write into. Deliberately NOT an
  // ordering constraint: the MAVLink adapter resolves this service lazily per
  // inbound message and claims its source on first use, so position here is
  // documentation, not a requirement. See ADR-0012's Mechanics.
  { id: assetsExtension.manifest.id, extension: assetsExtension },
```

Then correct the two comments that overstate constraints. `vehicle-status` and `map-demo` both cite ADR-0005's activation-order consequence for what are **lazy reads** through `getExtension`, which do not require ordering:

```ts
  // Reads SITL exports lazily per use (getSitlExports()), so this is not an
  // ordering constraint — only flight-overlay's eager resolve was, and that
  // now degrades instead. Position is documentation.
  { id: vehicleStatusExtension.manifest.id, extension: vehicleStatusExtension },
```

Apply the equivalent to `map-demo`. **`flight-overlay`'s comment needs one sentence deleted, contrary to an earlier draft of this step.** The containment iteration corrected its throw/degrade claim, but its trailing "Same insertion-order pattern as vehicle-status and map-demo" becomes false the moment this pass demotes those two — correcting two comments invalidates a third that referenced them, which is the position-dependent-documentation trap this project has hit before. Delete that sentence and nothing else.

- [ ] **Step 5: run everything**

Run: vitest from inside `extension-assets`, then from inside `packages/shell` (expect **279**, unchanged — nothing in the shell's behaviour changed), then `pnpm check` and `pnpm lint` from `shell/`.

- [ ] **Step 5b: fix the shell test that asserts the rationale these comments deny**

`bundled-extensions.test.ts`'s third case is named "bundles vehicle-status after sitl **so the consumer activates after the producer**" — asserting exactly the requirement the corrected comments say does not exist, since vehicle-status reads lazily. Meanwhile the one real constraint, **map before flight-overlay**, has no test at all.

Replace it: assert `map` precedes `flight-overlay`, naming the reason (flight-overlay resolves map's exports during its own `activate`, so the overlay does not appear if map is absent — it degrades rather than throwing since the containment iteration). Drop the vehicle-status assertion: nothing depends on that order, which is the point the comments now make, and a test asserting a false rationale is worse than no test. Prove the new assertion can fail by temporarily swapping the two entries.

- [ ] **Step 6: report case 34 by inspection, and commit**

Case 34 is comments, so it is verified by reading. Quote the three comments in your task report.

```bash
cd "$(git rev-parse --show-toplevel)"
git add shell/packages/extension-assets shell/packages/shell/src/extension-host/bundled-extensions.ts
git commit -m "feat(assets): bundle the assets service and correct ordering comments"
```

---

## Task 4: confirm the MAVLink fields, then the mapping

**Covers validation cases 22–24.**

**This task has a gate. Read it before starting.**

**Files:**

- Create: `packages/extension-sitl/src/asset-adapter.ts`
- Test: `packages/extension-sitl/src/asset-adapter.test.ts`

- [ ] **Step 1: the field names are now confirmed — read this instead of re-deriving them**

**Measured against a live stream on 2026-10-21** (ArduPilot SITL → MAVProxy → `mavlink2rest --connect udpin:127.0.0.1:14551 --server 127.0.0.1:8088`, captured over `ws://localhost:8088/v1/ws/mavlink?filter=^HEARTBEAT$`). The serving process was verified to be the `mavlink2rest` binary itself, not a script, so these shapes are its serialisation:

```json
{
  "header": { "system_id": 1, "component_id": 1, "sequence": 158 },
  "message": {
    "type": "HEARTBEAT",
    "mavtype": { "type": "MAV_TYPE_QUADROTOR" },
    "autopilot": { "type": "MAV_AUTOPILOT_ARDUPILOTMEGA" },
    "base_mode": "MAV_MODE_FLAG_MANUAL_INPUT_ENABLED | MAV_MODE_FLAG_STABILIZE_ENABLED | MAV_MODE_FLAG_CUSTOM_MODE_ENABLED",
    "custom_mode": 0,
    "system_status": { "type": "MAV_STATE_STANDBY" },
    "mavlink_version": 3
  }
}
```

Three facts that matter, and one correction to the spec:

- The sender id is **`header.system_id`**, as the spec expected.
- The vehicle-type field is **`message.mavtype`**.
- **Its value is a nested object `{ type: "MAV_TYPE_QUADROTOR" }`, not a bare enum-name string.** The spec generalised from `base_mode` — which _is_ a pipe-separated string because it is a bitfield — to all enums. Plain enums are wrapped. A parser accepting only a string or number returns `undefined` for every real heartbeat, which is exactly the silent "every vehicle has no airframe" failure the spec warns about. `fix(spec)` corrects the spec's claim; the code below is already right.
- Only one sender appeared over ten seconds (`sys=1 comp=1`, ~1.16 Hz). MAVProxy's own GCS heartbeat does not reach mavlink2rest on this setup, so the registry will hold exactly one asset and the non-asset wart the spec names does not fire here.

If you re-verify and see something different, trust what you see and say so.

- [ ] **Step 1b: if the stream is gone**

Nothing in `packages/` has ever read a MAVLink envelope header, and no fixture contains one. You need two facts:

1. The envelope's sender id — expected at `header.system_id` in mavlink2rest's JSON, alongside the `message` object `applyMessage` already reads.
2. `HEARTBEAT`'s vehicle-type field — **not** `message.type`, which mavlink2rest uses as the message-name discriminator.

Confirm both by **either** observing a live stream (`ws://localhost:8088/v1/ws/mavlink`, per `packages/extension-sitl/README.md`, with ArduPilot SITL plus mavlink2rest running) **or** reading mavlink2rest's published message definitions for `HEARTBEAT`. Record which method you used and the exact field names and value forms you observed.

**If you can confirm neither, stop and report BLOCKED** with what you tried. Do not guess a field name: a wrong one produces an adapter that registers every vehicle with no airframe, which looks like a working feature. The controller can start SITL or capture a frame.

- [ ] **Step 2: write the failing mapping tests**

The enum arrives **wrapped** as `{ type: 'MAV_TYPE_*' }`; the parser also accepts the bare string and the number, per step 1.

```ts
import { describe, expect, it } from 'vitest';

import { airframeFromMavType, systemIdOf } from './asset-adapter';

describe('airframeFromMavType', () => {
  it.each([
    ['MAV_TYPE_QUADROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_HEXAROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_OCTOROTOR', { kind: 'multirotor' }],
    ['MAV_TYPE_TRICOPTER', { kind: 'multirotor' }],
    ['MAV_TYPE_FIXED_WING', { kind: 'fixed-wing' }],
    ['MAV_TYPE_VTOL_TAILSITTER', { kind: 'vtol' }],
    ['MAV_TYPE_VTOL_TILTROTOR', { kind: 'vtol' }],
    ['MAV_TYPE_HELICOPTER', { kind: 'unknown' }],
    ['MAV_TYPE_GCS', { kind: 'none' }],
    ['MAV_TYPE_ANTENNA_TRACKER', { kind: 'none' }],
    ['MAV_TYPE_GIMBAL', { kind: 'none' }],
    ['MAV_TYPE_GROUND_ROVER', { kind: 'none' }],
    ['MAV_TYPE_SURFACE_BOAT', { kind: 'none' }],
    ['MAV_TYPE_SUBMARINE', { kind: 'none' }],
    ['MAV_TYPE_SOMETHING_NEW', { kind: 'unknown' }],
  ])('maps %s', (input, expected) => {
    expect(airframeFromMavType(input)).toEqual(expected);
  });

  it('accepts the wrapped form mavlink2rest actually sends', () => {
    expect(airframeFromMavType({ type: 'MAV_TYPE_QUADROTOR' })).toEqual({ kind: 'multirotor' });
  });

  it('accepts the numeric form and agrees with the string form', () => {
    // 2 is MAV_TYPE_QUADROTOR.
    expect(airframeFromMavType(2)).toEqual(airframeFromMavType('MAV_TYPE_QUADROTOR'));
  });

  it('returns undefined — not unknown — when the value is unreadable', () => {
    expect(airframeFromMavType(undefined)).toBeUndefined();
    expect(airframeFromMavType(null)).toBeUndefined();
    expect(airframeFromMavType({})).toBeUndefined();
  });
});

describe('systemIdOf', () => {
  it('reads the envelope header', () => {
    expect(systemIdOf({ header: { system_id: 7 }, message: { type: 'HEARTBEAT' } })).toBe('7');
  });

  it('returns undefined when there is no readable header', () => {
    expect(systemIdOf({ message: { type: 'HEARTBEAT' } })).toBeUndefined();
  });
});
```

`MAV_TYPE_HELICOPTER` → `unknown` is deliberate and the most important row: gcscode has no word for a single-rotor helicopter, and mapping it to `multirotor` would be a lie a consumer cannot detect.

The `undefined`-not-`unknown` case is the distinction the whole vocabulary rests on: **absent means not asserted; `unknown` means asserted and unnameable.**

- [ ] **Step 3: run them and watch them fail**

Run: `cd "$(git rev-parse --show-toplevel)"/shell/packages/extension-sitl && npx vitest run`
Expected: FAIL — module not found.

- [ ] **Step 4: implement the mapping**

`src/asset-adapter.ts`. Keep it free of client and registry imports so it unit-tests without either. Use the field name you confirmed in step 1 in place of `<MAV_TYPE_FIELD>`.

```ts
import type { Airframe } from '@gcscode/extension-assets';

const MULTIROTOR = /^MAV_TYPE_(QUADROTOR|HEXAROTOR|OCTOROTOR|TRICOPTER|DODECAROTOR)$/;
const NON_FLYING =
  /^MAV_TYPE_(GCS|ANTENNA_TRACKER|GIMBAL|CAMERA|ONBOARD_CONTROLLER|ADSB|GROUND_ROVER|SURFACE_BOAT|SUBMARINE|CHARGING_STATION|FLARM|SERVO|LOG|OSD|IMU|GPS|WINCH)$/;

/** Numeric MAV_TYPE values gcscode names. Only the ones the table covers —
 *  anything else falls through to `unknown`, which is the honest answer. */
const BY_NUMBER: Record<number, string> = {
  1: 'MAV_TYPE_FIXED_WING',
  2: 'MAV_TYPE_QUADROTOR',
  4: 'MAV_TYPE_HELICOPTER',
  5: 'MAV_TYPE_ANTENNA_TRACKER',
  6: 'MAV_TYPE_GCS',
  10: 'MAV_TYPE_GROUND_ROVER',
  11: 'MAV_TYPE_SURFACE_BOAT',
  12: 'MAV_TYPE_SUBMARINE',
  13: 'MAV_TYPE_HEXAROTOR',
  14: 'MAV_TYPE_OCTOROTOR',
  15: 'MAV_TYPE_TRICOPTER',
};

/**
 * Absent return means **not asserted** — the value could not be read. That is
 * deliberately distinct from `{ kind: 'unknown' }`, which asserts the adapter
 * saw a type gcscode has no word for. Collapsing the two loses the distinction
 * the vocabulary is built on.
 */
export function airframeFromMavType(value: unknown): Airframe | undefined {
  // mavlink2rest wraps plain enums as `{ type: "MAV_TYPE_*" }` — measured, see
  // task 4 step 1. The bare-string and numeric forms are accepted too: the
  // former because bitfield enums arrive that way and tests are clearer with
  // it, the latter because the existing telemetry parser already tolerates
  // numbers for `base_mode`.
  const name =
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
      ? (value as { type: string }).type
      : typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? BY_NUMBER[value]
          : undefined;
  if (name === undefined) return undefined;

  if (MULTIROTOR.test(name)) return { kind: 'multirotor' };
  if (name === 'MAV_TYPE_FIXED_WING') return { kind: 'fixed-wing' };
  if (name.startsWith('MAV_TYPE_VTOL_')) return { kind: 'vtol' };
  if (NON_FLYING.test(name)) return { kind: 'none' };
  // Includes MAV_TYPE_HELICOPTER: rotary-wing but not multirotor, and gcscode
  // has no word for it. See the spec's Known unknowns.
  return { kind: 'unknown' };
}

/** The asset's `localId`, read from the envelope header the rest of this
 *  package has never needed. */
export function systemIdOf(json: unknown): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const header = (json as { header?: unknown }).header;
  if (typeof header !== 'object' || header === null) return undefined;
  const id = (header as { system_id?: unknown }).system_id;
  return typeof id === 'number' ? String(id) : undefined;
}
```

- [ ] **Step 5: run them and watch them pass, then prove one can fail**

Run vitest from inside the package. Then map `MAV_TYPE_HELICOPTER` to `multirotor` and confirm only that row fails; restore.

- [ ] **Step 6: commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add shell/packages/extension-sitl/src/asset-adapter.ts shell/packages/extension-sitl/src/asset-adapter.test.ts shell/packages/extension-sitl/package.json
git commit -m "feat(sitl): map MAV_TYPE to the asset vocabulary"
```

Add `"@gcscode/extension-assets": "workspace:*"` to `extension-sitl`'s dependencies — it is a **type-only** import, which the boundary rule permits from a sibling extension package, and ESLint's `allowTypeImports` enforces that it stays type-only.

---

## Task 5: the adapter — lazy claim, re-claim, and the skip rule

**Covers validation cases 15–21 and 25–27.**

**Files:**

- Modify: `packages/extension-sitl/src/asset-adapter.ts` (add the stateful half)
- Modify: `packages/extension-sitl/src/index.ts` (wire it into the message path)
- Test: `packages/extension-sitl/src/asset-adapter.test.ts`

- [ ] **Step 1: write the failing tests**

The adapter needs a seam that does not require a WebSocket. Model it as a factory taking a host-like resolver, so tests drive it directly:

```ts
import { describe, expect, it, vi } from 'vitest';

import { createAssetAdapter } from './asset-adapter';
// NOT this — measured during task 5 and wrong twice over: it is a runtime import
// from a sibling extension package, which the boundary rule forbids and ESLint
// catches, and it does not resolve at all because that package's `exports` map
// has no `./src/*` subpath. Use a contract double for the source instead, and
// rely on extension-assets' own cases 1-14 plus task 7's real wiring for the
// behaviour of the registry itself.

const heartbeat = (systemId: number, mavType: string, componentId = 1) => ({
  header: { system_id: systemId, component_id: componentId },
  message: { type: 'HEARTBEAT', mavtype: { type: mavType } },
});

describe('asset adapter', () => {
  it('registers one asset per system on the first heartbeat', () => {
    const registry = createAssetRegistry();
    const adapter = createAssetAdapter(() => registry);
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    const assets = registry.getAssets();
    expect(assets).toHaveLength(1);
    expect(assets[0].localId).toBe('1');
    expect(assets[0].airframe).toEqual({ kind: 'multirotor' });
  });

  it('claims nothing until the first message', () => {
    const registry = createAssetRegistry();
    const createSource = vi.spyOn(registry, 'createSource');
    createAssetAdapter(() => registry);
    expect(createSource).not.toHaveBeenCalled();
  });

  it('does not accumulate on repeated heartbeats', () => {
    const registry = createAssetRegistry();
    const adapter = createAssetAdapter(() => registry);
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(registry.getAssets()).toHaveLength(1);
  });

  it('skips re-registration when the description is unchanged', () => {
    const registry = createAssetRegistry();
    const adapter = createAssetAdapter(() => registry);
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    // Spy AFTER the first registration: an unconditional re-register would
    // leave the asset list identical, so asserting on the list would pass
    // vacuously. The call count is the only honest observable.
    const source = registry.getAssets()[0];
    const before = source.key;
    const spy = vi.fn();
    // Re-resolve through the adapter's own source by sending another heartbeat.
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    expect(registry.getAssets()[0].key).toBe(before);
    void spy;
  });

  it('updates the airframe in place when MAV_TYPE changes, keeping the key', () => {
    const registry = createAssetRegistry();
    const adapter = createAssetAdapter(() => registry);
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    const key = registry.getAssets()[0].key;

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_FIXED_WING'));

    expect(registry.getAssets()).toHaveLength(1);
    expect(registry.getAssets()[0].key).toBe(key);
    expect(registry.getAssets()[0].airframe).toEqual({ kind: 'fixed-wing' });
  });

  it('registers two assets for two systems', () => {
    const registry = createAssetRegistry();
    const adapter = createAssetAdapter(() => registry);
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));
    adapter.onMessage(heartbeat(2, 'MAV_TYPE_FIXED_WING'));
    expect(registry.getAssets()).toHaveLength(2);
  });

  it('registers one asset for two component ids on one system', () => {
    const registry = createAssetRegistry();
    const adapter = createAssetAdapter(() => registry);
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR', 1));
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_GIMBAL', 154));
    expect(registry.getAssets()).toHaveLength(1);
  });

  it('does nothing when the service is absent', () => {
    const adapter = createAssetAdapter(() => undefined);
    expect(() => adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'))).not.toThrow();
  });

  it('re-claims after the registry is torn down and replaced', () => {
    let registry = createAssetRegistry();
    const adapter = createAssetAdapter(() => registry);
    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    registry.teardown();
    registry = createAssetRegistry();

    adapter.onMessage(heartbeat(1, 'MAV_TYPE_QUADROTOR'));

    expect(registry.getAssets()).toHaveLength(1);
  });
});
```

The skip test above is **deliberately incomplete** — it cannot see the call count through a real registry. Make it honest: wrap the source so you can count `registerAsset` calls, or expose a counter from the adapter for the test. Decide which, and say why in your report. An assertion that cannot fail is worse than no assertion, and this plan has already shipped several.

- [ ] **Step 2: run them and watch them fail**

- [ ] **Step 3: implement the stateful half**

```ts
import type { AssetSource, AssetsApi, AssetDescription } from '@gcscode/extension-assets';

interface TrackedAsset {
  disposable: Disposable;
  description: AssetDescription;
}

/**
 * The adapter's write path. Resolves the service per message and re-claims when
 * its handle reports `isLive === false` — the signal the spec chose over
 * comparing `getExtension()`'s return, which builds a fresh record per call.
 *
 * Recovery latency equals the message period: nothing re-claims until the next
 * heartbeat. Fine at SITL's 1 Hz; an event-driven adapter inherits "my assets
 * reappear whenever something next happens", which can be never.
 */
export function createAssetAdapter(resolve: () => AssetsApi | undefined) {
  let source: AssetSource | undefined;
  const tracked = new Map<string, TrackedAsset>();
  let warnedAboutAbsence = false;

  return {
    onMessage(json: unknown): void {
      // HEARTBEAT only. The client's filter also admits GLOBAL_POSITION_INT,
      // ATTITUDE, VFR_HUD and SYS_STATUS — every one carries header.system_id
      // and none carries mavtype, so acting on them re-registers the asset with
      // no airframe and overwrites the good value. Measured live before this
      // guard existed: 102 frames produced 13 registrations in six seconds and
      // the asset ended with no airframe at all. With the guard: 1 registration.
      if (!isHeartbeat(json)) return;
      const localId = systemIdOf(json);
      if (localId === undefined) return;

      const api = resolve();
      if (api === undefined) {
        if (!warnedAboutAbsence) {
          warnedAboutAbsence = true;
          console.warn('gcscode.sitl: the assets service is not active; not registering assets.');
        }
        return;
      }

      if (source === undefined || !source.isLive) {
        source = api.createSource('gcscode.sitl', 'SITL');
        tracked.clear();
      }

      const description: AssetDescription = { localId };
      const airframe = airframeFromMavType(
        (json as { message?: Record<string, unknown> }).message?.['mavtype'],
      );
      if (airframe !== undefined) description.airframe = airframe;

      const existing = tracked.get(localId);
      // The skip: re-registering at heartbeat rate would churn every
      // consumer's derived state, falsifying ADR-0011's premise that
      // descriptions change rarely.
      if (existing !== undefined && sameDescription(existing.description, description)) return;

      // Replacing supersedes the prior Disposable, which goes inert — so the
      // stored one must be swapped, never kept or disposed later.
      tracked.set(localId, { disposable: source.registerAsset(description), description });
    },
    dispose(): void {
      source?.dispose();
      source = undefined;
      tracked.clear();
    },
  };
}

function sameDescription(a: AssetDescription, b: AssetDescription): boolean {
  return a.localId === b.localId && a.airframe?.kind === b.airframe?.kind;
}
```

**One failure the sketch does not handle.** `createSource` throws on a duplicate claim of a live source id, and the adapter calls it from inside a WebSocket message handler where throwing is the wrong failure mode. Guard the claim, warn once, and retry on the next message rather than letting it escape.

- [ ] **Step 4: wire it into `index.ts`**

Construct the adapter in `activate`, push its `dispose` to `context.subscriptions` (which is what makes cases 31–33 work), and call `onMessage` from the same place `applyMessage` is called. Resolve through the captured host:

```ts
const assetAdapter = createAssetAdapter(
  () => context.host.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports,
);
context.subscriptions.push({ dispose: () => assetAdapter.dispose() });
```

Do **not** restructure the existing telemetry path. `applyMessage` keeps folding every sender's telemetry into one store — a pre-existing single-vehicle assumption the spec names as newly observable but not this iteration's to fix.

- [ ] **Step 5: run everything, prove the skip can fail, commit**

Run vitest from inside `extension-sitl`, then from inside `packages/shell`, then `pnpm check` and `pnpm lint` from `shell/`. Remove the skip's early `return` and confirm the skip test fails — if it still passes, the test is vacuous and must be fixed before committing.

```bash
cd "$(git rev-parse --show-toplevel)"
git add shell/packages/extension-sitl
git commit -m "feat(sitl): register assets from HEARTBEAT, claiming lazily"
```

---

## Task 6: the demo consumer

**Covers validation cases 28–30.**

**Files:**

- Create: `packages/extension-assets-demo/` (full scaffolding, modelled on `extension-map-demo`)
- Create: `src/index.ts`, `src/assets-status-item.svelte`, `src/index.test.ts`
- Modify: `packages/shell/src/extension-host/bundled-extensions.ts` (add the entry)

- [ ] **Step 1: scaffold** — same shape as task 1's package, depending on `@gcscode/extension-api` and `@gcscode/extension-assets` (type-only).

- [ ] **Step 2: write the failing tests**, including the reactivity case, which is the one that pins the contract term:

```ts
it('renders sourceLabel · airframe for each asset', async () => {
  /* render, assert text */
});

it('updates when an asset is registered after mount, with no event and no remount', async () => {
  // Mount with an empty registry, register an asset, await a tick, assert the
  // label changed. A component that cached getAssets() at setup fails this.
});

it('renders empty when the service is absent', async () => {
  /* … */
});
```

- [ ] **Step 3: implement the component** — read through the host **per render** so `SvelteMap` reactivity carries updates:

```svelte
<script lang="ts">
  import type { AssetsApi } from '@gcscode/extension-assets';
  import { getHost } from './host-store';

  // Read per render, not cached at setup: the host's exports map and the
  // registry's asset map are both SvelteMaps, which is what makes this
  // reactive. Caching at activate() — flight-overlay's idiom — renders once
  // and never updates.
  const assets = $derived(
    getHost()?.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports.getAssets() ?? [],
  );
</script>

{#each assets as asset (asset.key)}
  <span>{asset.sourceLabel} · {asset.airframe?.kind ?? '—'}</span>
{/each}
```

An asset with no `airframe` renders `—`, distinguishable from `unknown`, per case 28.

- [ ] **Step 4: case 30 is a report, not an assertion.** In your task report, record what the source handle bought in this single-source deployment: which of the registry tests would change if `registerAsset` hung directly off `AssetsApi` with a source-id argument. This is deliberate evidence-gathering for the flat-registry fallback ADR-0011's Alternatives pre-authorises — not a judgment you have to make.

- [ ] **Step 4b: re-check the assets-entry comment you are now invalidating**

Task 3's code-quality review flagged that the assets entry's comment makes a **global** claim — "only the map/flight-overlay pair states a requirement" — which goes stale silently if a later entry adds a real ordering constraint. This task adds that later entry. The demo consumer reads the registry lazily per render, so it introduces no constraint and the claim still holds; confirm that in your report rather than assuming it, and if the comment needs narrowing from a global claim to a local one, narrow it. This is the same trap that made `flight-overlay`'s comment false in task 3: a claim about other entries decays when the set of entries changes.

- [ ] **Step 5: run everything and commit**

```bash
cd "$(git rev-parse --show-toplevel)"
git add shell/packages/extension-assets-demo shell/packages/shell/src/extension-host/bundled-extensions.ts shell/pnpm-lock.yaml
git commit -m "feat(assets-demo): render registered assets in the status bar"
```

---

## Task 7: teardown across the boundary

**Covers validation cases 31–33.**

**Files:**

- Test: `packages/shell/src/extension-host/registry.test.ts` or a new integration test — your call, stated in the report

- [ ] **Step 1: write the failing tests** against a real registry plus real manager, following `app.test.ts`'s pattern of wiring the real pieces rather than stubs:

```ts
it("removes an adapter's assets when the adapter is disabled", async () => {
  /* … */
});
it('leaves no assets when an adapter throws after claiming its source', () => {
  /* … */
});
it('re-claims and re-registers when the adapter is re-enabled', async () => {
  /* … */
});
```

Case 32 is the containment interaction: an adapter whose `activate` throws **after** claiming its source must leave nothing behind, because the handle is in `context.subscriptions` and containment disposes it.

- [ ] **Step 2–4:** run, implement whatever wiring the tests reveal missing, run again, and prove case 32 can fail by removing the `context.subscriptions.push` from task 5's step 4.

- [ ] **Step 5: commit**

```bash
git commit -m "test(assets): assert teardown across the adapter boundary"
```

---

## Task 8: the `mapApi` un-export

**Covers validation case 35.**

**Files:**

- Modify: `packages/extension-map/src/index.ts`, `src/index.test.ts`

- [ ] **Step 1:** change line 16 from `export { MAPLIBRE_CONTEXT_KEY, mapApi };` to export only `MAPLIBRE_CONTEXT_KEY`. It **modifies a shared line** rather than deleting one.

- [ ] **Step 2:** `index.test.ts` imports `mapApi` from `./index`; point it at `./map-api.svelte` instead — one import line, not thirty usages. `map-view.svelte` already imports directly and is unaffected. `activate()` returning `mapApi` as exports is the sanctioned path and stays.

- [ ] **Step 3:** run vitest from inside `extension-map` and from inside `packages/shell`, plus `pnpm check` and `pnpm lint` from `shell/`.

- [ ] **Step 4:** report, do not fix, the four files under `packages/extension-flight-overlay/src/layers/` that re-declare `MAPLIBRE_CONTEXT_KEY` as a local string literal. The spec routes that to the ESLint micro-iteration.

```bash
git commit -m "refactor(map): stop exporting the live mapApi registry"
```

---

## Task 9: manual verification

No code. Do this before the final cross-cutting review and paste the observations into the task report.

- [ ] **Step 1: the full gate** — `cd shell && pnpm test && pnpm check && pnpm lint`. All green, with the shell package at 279 plus whatever task 7 added.

- [ ] **Step 2: the operator path** — `pnpm dev`, then with SITL running:

1. The status bar shows one asset, reading `SITL · multirotor`.
2. `Ctrl+Shift+X`, disable **Assets**, reload. Expected: the app renders, the status item shows nothing, and sitl logs its one warning. No failure row and no indicator — a degrade is a success.
3. Re-enable Assets, reload. The asset reappears within one heartbeat.
4. With everything enabled, disable **SITL Telemetry** alone. Expected: the asset disappears, because the handle was in `context.subscriptions`.

If step 2 cannot run because SITL is unavailable, say so rather than reporting it as passed.

- [ ] **Step 3:** report the observations; commit nothing.

---

## Out of scope for this plan

Asset liveness, multi-source merge, `component_id` as a distinct asset, live state, per-property provenance, durable identity, a change event, indexed queries, the protocol-identifier lint rule, and the ESLint-glob micro-iteration. Each carries a trigger in the spec.

## Docs propagation (post-merge, on master)

Per the spec's four propagation sections: the nine `docs/out-of-scope.md` rows plus the two added in round 2 and the amendment to the activation-ordering row; the `docs/roadmap.md` status flip plus the ESLint micro-iteration entry; the `docs/vs-code-alignment.md` rows filed by table; and the one `packages/extension-api/README.md` section on writing into another extension's service — which must carry the recovery-latency constraint, not just the `isLive` check.
