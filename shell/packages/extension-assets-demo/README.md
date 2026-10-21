# @gcscode/extension-assets-demo

Throwaway consumer of the asset registry. It exists to make the contract in [`@gcscode/extension-assets`](../extension-assets/README.md) observable: a status-bar label naming every asset the registry holds, built from a domain fact (`sourceLabel · airframe`) read through a contract that mentions no protocol.

It knows nothing about MAVLink. That is the point — if this package needed to, the abstraction would have failed. The real asset UI (icons, a fleet list, the map) replaces it; don't depend on it.

## Contributions

- **Status bar item** — `gcscode.assets-demo.summary`, left-aligned. One `<span>` per registered asset.

## Cross-extension dependency

- **`@gcscode/extension-assets`** — type-only. Imports `AssetsApi` / `RegisteredAsset` / `Airframe` via `import type`; the live API comes from `host.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports`. No runtime coupling ([ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md)).

## What it renders

- **An asset with an asserted airframe** — `SITL · multirotor`.
- **An asset with no `airframe`** — `SITL · —`. Absent means nobody asserted an airframe; it is deliberately **not** rendered as `unknown`, which means an adapter saw something gcscode has no word for. Collapsing the two would discard the distinction the vocabulary rests on ([ADR-0011](../../docs/decisions/ADR-0011-asset-vocabulary-and-registry.md)).
- **No assets, or no assets service** — nothing at all. The demo invents no placeholder for a state it could not explain to an operator.

`localId` is never rendered: it is a per-source address, opaque to consumers.

## Reading per render is the contract, not a style choice

`getAssetsApi()` resolves the service through the host on **every** render, and the component reads `getAssets()` inside a `$derived`. Both hops are reactive — the host's exports map and the registry's asset map are each a `SvelteMap` — so the label picks up the assets service activating, every later registration, and an airframe replaced in place, with no change event and no remount.

The alternative idiom, resolving once in `activate()` and keeping the result, is what [`@gcscode/extension-flight-overlay`](../extension-flight-overlay/README.md) does. It is correct for _resolution_ and wrong here: the label would render once and then go quietly stale. Validation case 29 in [the spec](../../docs/specs/2026-10-21-asset-abstraction-v0.md) pins the difference, and it does fail for the caching version.

## Lifecycle

`activate()` captures the host and registers the item — no resolution, no snapshot, no source claim; a consumer only reads. `deactivate()` clears the module-level host reference, so a render racing a re-enable finds no service rather than a stale one.

## See also

- [ADR-0011](../../docs/decisions/ADR-0011-asset-vocabulary-and-registry.md) — asset vocabulary, the single heterogeneous registry, identity
- [ADR-0012](../../docs/decisions/ADR-0012-service-extensions-vs-host-namespaces.md) — why the registry is a service extension
- [Spec 2026-10-21-asset-abstraction-v0](../../docs/specs/2026-10-21-asset-abstraction-v0.md) — this iteration, including the reactivity-as-contract term and validation cases 28–30
