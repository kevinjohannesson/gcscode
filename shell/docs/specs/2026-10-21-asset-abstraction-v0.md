# Asset abstraction v0

The first adapter-neutral contract: a service extension holding assets with one optional property, `extension-sitl` becoming the MAVLink adapter that registers into it, and a throwaway consumer that renders what arrives.

This is the smallest cut that puts the asset abstraction's vocabulary into running code. Everything it decides was already decided by [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) and [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md); what this spec adds is the one design question [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) explicitly left to it — how an adapter detects that its source handle went stale — plus the scope line and the validation set.

## Goals

1. **`@gcscode/extension-assets`** — a service extension owning the asset registry, exposing exactly the API [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) decided: `createSource(sourceId, label)`, `AssetSource.registerAsset(description)`, `getAssets()`. The registry is constructed inside `activate()` and returned as the extension's exports; it is not a module singleton.
2. **`extension-sitl` becomes the first adapter.** On `HEARTBEAT` it registers one asset per MAVLink `system_id`, with `airframe` derived from that heartbeat's `MAV_TYPE`.
3. **`@gcscode/extension-assets-demo`** — a throwaway consumer view listing each registered asset as `sourceLabel · airframe`. Its only job is to prove the contract carries a fact from an adapter to a consumer that knows nothing about MAVLink.
4. **Close [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s enforcement follow-up**, because this iteration is what makes the rule load-bearing: extend the restricted-imports rule to `packages/shell/**` with `bundled-extensions.ts` allowlisted, and stop `packages/extension-map/src/index.ts` exporting `mapApi`.
5. **Correct `bundled-extensions.ts`'s ordering comments**, which [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) scheduled for this iteration.

## Non-goals

Each carries a trigger to revisit. The ones that are cross-cutting deferrals rather than scope cuts propagate to [`docs/out-of-scope.md`](../out-of-scope.md); see the propagation section.

- **Staleness of an asset — heartbeat timeouts, liveness, removal of a vehicle that stopped transmitting.** A registry entry means "present now, as asserted by its source" ([ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md), Membership), and in v0 the only things that remove an entry are the adapter disposing it, the source being disposed, or the registry being torn down. A vehicle that goes quiet stays listed. _Trigger:_ the first time an operator sees a vehicle listed that is demonstrably gone — which, with one SITL instance on a local link, is not a condition this iteration can produce.
- **Multi-source merge and conflict arbitration.** One source exists in v0. Per-source namespacing is implemented because the API requires it, but nothing exercises two sources asserting overlapping assets. _Trigger:_ the second adapter, which [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) names as the point where the identity rules stop being theoretical.
- **`component_id` as a distinct asset.** [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) decided one asset per MAVLink system; the adapter ignores `component_id` in v0, so a gimbal reporting its own heartbeat on the same system does not become a second asset. _Trigger:_ the first capability that must be granted or commanded per component rather than per vehicle — a gimbal an operator takes control of separately being the known case.
- **Live state — position, mode, battery, anything that changes continuously.** That is the adapter-neutral live-state contract, the next iteration, and it is deliberately a separate port from "what this asset _is_".
- **Per-property provenance.** A `RegisteredAsset` carries which source asserted it; it does not carry which source asserted each individual property, because with one property and one source there is nothing to disambiguate. _Trigger:_ the first property two sources can both assert.
- **Durable identity.** `localId`, `sourceId` and `key` are wire-scoped and not stable across reconnect ([ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)). A serial number, tail number or operator-assigned name is a different concept. _Trigger:_ the first feature that must recognise the same airframe across a reconnect.
- **Any STANAG 4586 adapter.** The two-source expressibility rule is satisfied by analysis, not by a second adapter. [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) records the known asymmetry: STANAG's vehicle type identifies a product model, so a STANAG adapter needs a mapping table where MAVLink reads `MAV_TYPE` directly.
- **Operator-facing surfacing of a degraded adapter.** If the registry is absent, the adapter degrades silently to the console, per the pattern established by `extension-flight-overlay` in the containment iteration. The absent notification primitive is already an [`out-of-scope.md`](../out-of-scope.md) row whose trigger has fired.

## Architecture

### The registry is constructed per activation, not a module singleton

`extension-map`'s `mapApi` is a module-level singleton that survives disable/re-enable. This registry deliberately does not copy that, and [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) says why: surviving state would resurrect assets whose asserting adapter may be long gone. So `activate()` constructs the registry, returns it as exports, and `deactivate()` drops it; re-enabling starts empty.

That choice is what makes the staleness signal below work, so it is load-bearing rather than stylistic.

Internally the registry is a class holding a `SvelteMap`, following the project's convention for reactive external state: explicit `private`/`public`, `_backingField` naming, accessors rather than public mutables, with components staying thin renderers. Consumers read through `getAssets()`, which returns a stable-ordered snapshot; `SvelteMap` preserves insertion order, which is what makes [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s "replacing a registration preserves position" implementable.

### The API, verbatim from the ADR

```ts
export type Airframe =
  | { kind: 'multirotor' }
  | { kind: 'fixed-wing' }
  | { kind: 'vtol' }
  | { kind: 'none' } // asserted: this asset does not fly
  | { kind: 'unknown' }; // gcscode has no word for what the adapter saw

export interface AssetDescription {
  /** Unique within the registering source. Opaque to consumers. */
  localId: string;
  /** Absent = not asserted. `{ kind: 'none' }` = asserted: does not fly. */
  airframe?: Airframe;
}

export interface RegisteredAsset extends AssetDescription {
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly key: string;
}

export interface AssetsApi {
  createSource(sourceId: string, label: string): AssetSource;
  getAssets(): readonly RegisteredAsset[];
}

export interface AssetSource extends Disposable {
  readonly sourceId: string;
  registerAsset(description: AssetDescription): Disposable;
}
```

The behaviours [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) attached to that shape are requirements of this iteration, not restatements: a duplicate `createSource` on a **live** id throws synchronously and the id becomes claimable again once that source is disposed; re-registering a `localId` the same source already holds **replaces** the description in place, preserves position, and returns a fresh `Disposable` while the superseded one becomes inert; and a handle held across the registry's teardown is **inert** — `registerAsset` on it does nothing and returns a no-op `Disposable`, rather than throwing inside a message handler.

### The staleness signal: compare the resolved exports by identity

This is the question [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) left open. Its framing: `Disposable` is `{ dispose(): void }`, so an inert handle is indistinguishable from a live one by inspection, and detecting staleness needs a signal the ADR does not define — with re-resolving the service per message named as the obvious candidate.

**Decision: the adapter re-resolves the service on every message it acts on, and treats a change in the resolved exports' object identity as the signal that its handle is stale.** Concretely, per `HEARTBEAT`:

1. Resolve `host.extensions.getExtension<AssetsApi>('gcscode.assets')?.exports`.
2. If it is `undefined`, do nothing. The registry is absent or disabled; any handle held is already inert.
3. If it is not the same object the current source was claimed from, discard local state — dispose the held source handle and forget the per-system `Disposable` map — and re-claim via `createSource`.
4. Register or refresh this system's asset.

Three things recommend it. It needs nothing new from the registry, so the ADR's API stays exactly as decided. It is correct by construction given the previous section: because the registry is built per activation, a disable/re-enable cycle necessarily yields a different object, and nothing else can. And it costs an object comparison per heartbeat, against a lookup the adapter is doing anyway.

Its cost is a coupling worth stating: the signal is only valid while the registry is constructed per activation. If a later iteration makes the registry a module singleton for some other reason, this detection silently stops working — an adapter would hold a handle into an emptied registry and never notice. That constraint belongs in the assets package's own documentation, not only here.

**What this does not do:** it does not detect a source disposed by anyone other than this adapter, because nothing in the API reports that. In v0 the only disposer is the adapter itself or the registry's teardown, both of which this covers.

### The adapter: one asset per system, airframe from `MAV_TYPE`

`extension-sitl` already holds a `mavlink-client` feeding `applyMessage`, filtered to `^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$`. v0 adds asset registration alongside the existing telemetry handling; it does not restructure it.

Two fields the adapter needs are ones **this repository has never read**, which is worth stating plainly because it sets the first implementation step:

- **`header.system_id`** — the asset's `localId`. `applyMessage` reads `obj['message']` and nothing else; no code in `packages/` reads a MAVLink envelope header, and no test fixture includes one.
- **`HEARTBEAT`'s `MAV_TYPE`** — the airframe. Note `msg['type']` is already taken: mavlink2rest uses it as the message-name discriminator (`'HEARTBEAT'`), so the vehicle type arrives under a different key.

Neither the field name nor the serialisation of that second field can be verified from this repository, and no mavlink2rest instance was reachable while this spec was written. What the repo does establish is the shape to expect: mavlink2rest serialises enums as name strings — `isSafetyArmed` documents `base_mode` arriving as `"MAV_MODE_FLAG_SAFETY_ARMED | …"` — and the existing code accepts both the string and a plain number, with tests using numbers for simplicity.

**So the first implementation step is to confirm both field names against a live stream, and the parser mirrors the existing tolerance:** accept the enum-name string, accept a number, and treat anything else as unasserted. An implementer who cannot reach a live mavlink2rest must say so rather than guess, because a wrong field name yields an adapter that silently registers every vehicle as `unknown` — a failure that looks like a working feature.

The mapping is deliberately narrow and uses `unknown` for its stated purpose rather than as a catch-all excuse:

| `MAV_TYPE`                                                                 | `Airframe`               | Why                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QUADROTOR`, `HEXAROTOR`, `OCTOROTOR`, `TRICOPTER`                         | `{ kind: 'multirotor' }` | Direct                                                                                                                                                                                                                                      |
| `FIXED_WING`                                                               | `{ kind: 'fixed-wing' }` | Direct                                                                                                                                                                                                                                      |
| `VTOL_*`                                                                   | `{ kind: 'vtol' }`       | Direct; the family covers tailsitter, tiltrotor, tiltwing and the duo/quad variants                                                                                                                                                         |
| `HELICOPTER`                                                               | `{ kind: 'unknown' }`    | **Not** multirotor. gcscode's vocabulary has no word for a single-rotor helicopter, and `unknown` means exactly that — "gcscode has no word for what the adapter saw". Mapping it to `multirotor` would be a lie the consumer cannot detect |
| `GCS`, `ANTENNA_TRACKER`, `GIMBAL`, `CAMERA`, `ONBOARD_CONTROLLER`, `ADSB` | `{ kind: 'none' }`       | Asserted: does not fly                                                                                                                                                                                                                      |
| `GROUND_ROVER`, `SURFACE_BOAT`, `SUBMARINE`                                | `{ kind: 'none' }`       | Asserted: does not fly. These are assets gcscode may well control later; `none` is a claim about flight, not about importance                                                                                                               |
| anything else                                                              | `{ kind: 'unknown' }`    |                                                                                                                                                                                                                                             |

The helicopter row is the honest one and the reason the row exists in the table rather than in a comment: it is the first real vocabulary gap the abstraction hits, and [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s `unknown` is what keeps it from being papered over. Whether `rotary-wing` should join the vocabulary is a Known unknown below, not a v0 decision.

Because ArduCopter SITL reports `QUADROTOR`, the live path exercises `multirotor`; `unknown` and `none` are exercised by unit tests over the mapping, which is the appropriate place for them.

### Activation order, and what happens when assets is absent

`assets` must activate before `sitl`, because the adapter claims its source during activation. That is the fourth hand-maintained ordering constraint in `bundled-extensions.ts`, and [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) already calls the hand-maintained comments there a growing liability.

When the registry is absent, **the adapter degrades**: it warns once and registers nothing, keeping its telemetry duties intact. It does not throw. This follows [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s discriminator — the absence is observable, since the assets-demo view visibly lists nothing — and it follows the containment iteration, which converted `extension-flight-overlay` from a throw to exactly this shape and left no throwing dependency resolution anywhere in the tree. Reintroducing one here would make v0 the regression.

The same reasoning covers the consumer: `assets-demo` renders an empty list when the registry is absent, rather than failing to activate.

### Closing [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s enforcement follow-up

Two edits, verified against the current tree:

- **The restricted-imports rule covers `packages/extension-\*/**`only**, so`packages/shell/**`may runtime-import any extension package — including, once v0 lands, the assets registry. Extend it to`packages/shell/**`with`bundled-extensions.ts` allowlisted, since that file's whole job is importing extension packages by name.
- **`packages/extension-map/src/index.ts:16` still exports `mapApi`**, the live registry, which [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) prohibits for a service extension. The blast radius is one export line plus one import path: `index.test.ts` imports `mapApi` from `./index` and must take it from `./map-api.svelte` instead. `map-view.svelte` already imports it directly from the module and is unaffected, and `activate()` returning `mapApi` as exports is the sanctioned path and stays.

This is in v0's scope rather than a separate iteration because v0 adds the second service extension — the rule's value is highest exactly when there is more than one registry it could leak.

## Validation

Numbered so later specs and reviews can cite them.

**The registry**

1. `createSource` returns a handle whose `sourceId` is the claimed id, and `getAssets()` is empty before anything registers.
2. A second `createSource` on a live id **throws synchronously**.
3. After the first source is disposed, the same id can be claimed again.
4. `registerAsset` makes the asset visible in `getAssets()` with `sourceId` and `sourceLabel` stamped by the registry, and a `key` the caller did not supply.
5. Two sources registering the same `localId` produce two distinct assets with distinct `key`s — the per-source namespacing property.
6. Re-registering a `localId` the same source already holds **replaces** the description, **preserves position** in `getAssets()`, and returns a fresh `Disposable`; the superseded `Disposable` is inert, so disposing it does not remove the replacement.
7. Disposing an asset's `Disposable` removes exactly that asset.
8. Disposing a source removes every asset it registered.
9. `key` is opaque: the test asserts uniqueness and stability for the asset's lifetime, and deliberately does **not** assert a format, so a future change of minting scheme is not a test break.
10. `getAssets()` returns a snapshot a consumer cannot use to mutate the registry.

**Teardown and inert handles**

11. After the registry extension deactivates, a handle held across that boundary is inert: `registerAsset` on it does nothing, returns a `Disposable`, and that `Disposable`'s `dispose()` is a no-op. Nothing throws.
12. Re-enabling the registry starts empty — no asset from the previous activation reappears.

**The adapter**

13. A `HEARTBEAT` from `system_id` 1 registers exactly one asset with `localId` `'1'`.
14. Repeated heartbeats from the same system do **not** accumulate assets — the count stays at one.
15. A heartbeat whose `MAV_TYPE` changes updates the asset's airframe in place, without changing its `key`.
16. Heartbeats from two different `system_id`s register two assets.
17. Two heartbeats differing only in `component_id` register **one** asset — the v0 decision, asserted so a later change to it is deliberate.
18. The mapping table is covered per row, including `HELICOPTER` → `unknown` and `GROUND_ROVER` → `none`, with an unmapped value → `unknown`.
19. `MAV_TYPE` arriving as an enum-name string and as the equivalent number produce the same airframe.
20. A heartbeat with no readable `MAV_TYPE` registers the asset with **no** `airframe` property — not `unknown`. Absent means not asserted; `unknown` means asserted-and-unnameable, and conflating them loses the distinction [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) drew.
21. **The staleness signal:** with the adapter running, the registry is deactivated and re-activated; the next heartbeat re-claims the source against the new exports object and the asset reappears. Assert it by the asset being present again, and assert the adapter did not throw.
22. When the registry is absent at activation, the adapter activates, warns once, registers nothing, and its telemetry handling still works.

**The consumer**

23. `assets-demo` renders one row per registered asset showing `sourceLabel · airframe`, keyed on `key`.
24. An asset with no `airframe` renders without inventing one, and the row is distinguishable from an `unknown` airframe.
25. With the registry absent, the view renders an empty list and does not fail to activate.

**Enforcement**

26. The ESLint rule rejects a runtime import of an extension package from `packages/shell/**`, and permits it from `bundled-extensions.ts`. Demonstrated by running ESLint on a deliberate violation, not by inspection.
27. `mapApi` is no longer importable from `extension-map`'s entry point, while `activate()` still returns it as exports.

## VS Code alignment

| Concern                            | VS Code                                                                                            | gcscode                                                                                                                | Status                                                                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-extension service APIs       | An extension's `activate()` return value is its public API, reached via `getExtension(id).exports` | Identical mechanism, and this is its second use                                                                        | Alignment                                                                                                                             |
| Where a domain capability lives    | No equivalent — VS Code's domain is text editing, and its registries are host-owned                | Domain capabilities are service extensions, not host namespaces                                                        | Divergence, decided in [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)                                     |
| Service dependency resolution      | `extensionDependencies` plus activation events; the host resolves order                            | Hand-maintained insertion order in `bundled-extensions.ts`, and a consumer that degrades when its dependency is absent | Divergence — trigger: the ordering-comment liability [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) names |
| Detecting that a service went away | Not addressed; VS Code extensions are not expected to survive a dependency's reload                | Re-resolve per message and compare exports identity                                                                    | Divergence, decided here                                                                                                              |
| Typed contracts between extensions | `import type` from a published `.d.ts`                                                             | `import type` from the sibling package, runtime boundary enforced by ESLint                                            | Alignment                                                                                                                             |

## `docs/out-of-scope.md` propagation

Three cross-cutting rows, each new:

- **Asset liveness and staleness.** A registry entry means present-as-asserted; nothing times out a vehicle that stopped transmitting. _Trigger:_ the first operator-visible stale asset, which needs more than one link or a vehicle that can actually disappear.
- **Durable asset identity across reconnect.** Wire ids are reassignable addresses; a vehicle returning with a different id is a different asset, and anything a live-state port associated with the old one is orphaned. _Trigger:_ the first feature that must recognise the same airframe across a reconnect.
- **Per-property provenance.** The registry records which source asserted an asset, not which asserted each property. _Trigger:_ the first property two sources can both assert.

Also amend the existing **"Extension activation ordering / dependency declaration"** row with a status note: v0 adds a fourth hand-maintained ordering constraint, and the degrade-when-absent pattern is now the established alternative to declaring dependencies.

## `docs/roadmap.md` propagation

Flip **Asset abstraction v0** to shipped, qualified by what actually shipped: one asset kind, one optional property, one source, no liveness, no live state. Keep the **Adapter-neutral live-state contract** entry's dependency on it explicit, and note that the `extension-sitl` → `extension-mavlink` rename becomes more defensible once the package is demonstrably an adapter.

## `docs/vs-code-alignment.md` propagation

Rows filed by table, each with the columns its table requires — Alignments carries `Source`, Divergences and Deferrals also carry `Trigger to revisit`. Two Alignments (service APIs via `exports`; typed contracts via `import type`), three Divergences (domain capabilities as service extensions; hand-maintained dependency order; staleness detection by exports identity).

## Known unknowns

- **Whether `rotary-wing` belongs in the vocabulary.** `HELICOPTER` maps to `unknown` today, which is honest but unhelpful to an operator looking at a helicopter. Adding the word is cheap; the question is whether the vocabulary should grow per airframe family or stay coarse, and one unmapped type is not enough evidence.
- **Whether exports-identity is the right staleness signal, or a symptom of a missing one.** It works and costs nothing, but it infers a lifecycle event from an object reference. A registry that announced its own teardown would be more direct. Nothing needs that yet.
- **Whether the airframe property earns its place at all in v0.** It exists to prove the abstraction can carry a domain fact across the boundary. A reviewer could reasonably argue that `label` alone would prove the same thing with less vocabulary, and that airframe should wait for a consumer that branches on it.
- **Whether one asset per system survives contact with a gimbal.** [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) left the hierarchy question open and v0 does not settle it; `component_id` being ignored is a scope cut, not an answer.
- **Whether the demo consumer should be thrown away or grown.** `assets-demo` is scaffolding by design, like `map-demo`. If it turns out to be the natural home for an asset list an operator actually wants, that is a different extension with a different name.

## Future iterations

1. **Adapter-neutral live-state contract** — the next port: what an asset is _doing_, linked by asset identity, replacing the three consumers' direct reads of `SitlExports.telemetry`.
2. **Asset liveness**, if the trigger fires.
3. **`extension-sitl` → `extension-mavlink`**, which this iteration makes more clearly correct.
4. **The STANAG 4586 architecture note**, which [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) treats as pending — its claims stand "as currently understood" until that note lands.

## Origin

[ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) and [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md), merged 2026-10-16, decided this iteration's vocabulary and its placement; the containment iteration shipped first because [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) identified a missing service as a boot halt and therefore a prerequisite.

The scope was cut down from a larger v0 after the question was raised of whether source handles, `none`, minted keys and inert handles had grown the API past a smallest cut. The answer this spec takes: the API shape stays exactly as [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) decided, because reopening it needs a successor ADR, and what shrinks is behaviour — no liveness, no multi-source merge, no `component_id`, no live state. `none` and `unknown` are adapter outputs rather than API surface, so they cost nothing to keep.

The earlier handoff brief at `scratch/2026-10-15-assets-v0-handoff.md` is superseded by both ADRs and is not a source for this spec.

## Post-merge implementation

Code, so a feat branch through the subagent-driven pipeline. The repo-state claims in this spec were verified while writing it — the `mapApi` export at `packages/extension-map/src/index.ts:16`, the ESLint glob's scope, the absence of any `header`/`system_id` read in `packages/`, and `applyMessage`'s existing shape — and an implementer should re-verify rather than trust them, per the convention that every repo-state assertion is checked before it is written.
