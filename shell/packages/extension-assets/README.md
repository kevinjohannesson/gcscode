# @gcscode/extension-assets

The adapter-neutral registry of the assets gcscode knows about. A service extension ([ADR-0012](../../docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md)), not a host namespace: nothing in `@gcscode/extension-api` grows an `assets` namespace for this.

One registry holds every asset kind, with no `kind` field — an asset's nature is described by its properties, of which v0 has exactly one (`airframe`). Identity is a per-source namespace (`localId`, unique within the registering source) plus a registry-minted opaque `key` that UI keys on. See [ADR-0011](../../docs/decisions/ADR-0011-asset-vocabulary-and-registry.md) for the vocabulary and why it is shaped this way.

## Contributions

None. This extension registers no views, commands or keybindings — it exists for its exports.

## Exports

`AssetsApi`:

- `createSource(sourceId, label)` — claims a namespace for one source of assets and returns an `AssetSource`. A second claim on a live `sourceId` throws; a claim against a torn-down registry returns an inert handle instead.
- `getAssets()` — every asset currently registered, across every source, as a snapshot.

Consumers look the API up at runtime and take the types from this package:

```ts
import type { AssetsApi } from '@gcscode/extension-assets';

const assets = host.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports;
```

The registry instance is reachable **only** through `activate()`'s return value — this package never exports it. `AssetRegistryHandle` (the `AssetsApi` plus `teardown`) stays internal so `teardown` is off the type a consumer writes against.

## Writing into it

An `AssetSource` is a handle whose validity the writer is responsible for checking:

- **Check `isLive` before writing, and re-claim when it is false.** Three things invalidate a handle: the writer disposes it, the host disposes it (via `context.subscriptions`), or the registry is torn down. All three surface as `isLive === false`, and an invalid handle is inert rather than throwing — a writer calls `registerAsset` from inside a message handler, where a throw would be a different bug.
- **Claim lazily, on first use, not during `activate()`.** Activation order between extensions is not guaranteed ([ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md)), and claiming per message keeps that from mattering. `bundled-extensions.ts` carries no ordering constraint for this service, and says so.
- **Push the handle to `context.subscriptions`.** Disabling the writer then removes its assets, so no asset outlives the extension that asserted it.
- **Recovery is as prompt as the writer's next message, and no more.** Nothing re-claims until the writer next acts, so a registry cycle during a quiet period leaves the registry empty while the writer believes otherwise. At a 1 Hz heartbeat that is invisible; an event-driven source inherits "my assets reappear whenever something next happens".

Re-registering a `localId` the source already holds replaces the description in place, preserves the asset's position and `key`, and returns a fresh `Disposable` — the superseded one goes inert.

## Lifecycle

`activate()` constructs the registry and returns it; `deactivate()` tears it down and drops it. Re-enabling starts empty.

That is deliberate, and it is the rule for this kind of service rather than this package's taste: a service whose contents are **asserted by other extensions** constructs per activation, because surviving state would resurrect assets whose asserting adapter may be long gone. A service whose contents are **registered by live contributors holding their own disposables** may persist — `@gcscode/extension-map`'s `mapApi` is that kind. A third service picks by that test, not by whichever sibling it read first.

## See also

- [ADR-0011](../../docs/decisions/ADR-0011-asset-vocabulary-and-registry.md) — asset vocabulary, the single heterogeneous registry, identity
- [ADR-0012](../../docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md) — why this is a service extension
- [Spec 2026-10-21-asset-abstraction-v0](../../docs/specs/2026-10-21-asset-abstraction-v0.md) — this iteration, including the handle-validity design and the 35 validation cases
