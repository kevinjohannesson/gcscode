# Asset abstraction v0

The first adapter-neutral contract: a service extension holding assets with one optional property, `extension-sitl` becoming the MAVLink adapter that registers into it, and a throwaway consumer that renders what arrives.

## Context

[ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) fixed the asset vocabulary, the single heterogeneous registry, and identity as per-source namespaces with registry-minted opaque keys. [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) decided that domain capabilities are service extensions rather than host namespaces, which is why the registry ships as `@gcscode/extension-assets` and not as `host.assets.*`. The host-side activation-failure containment iteration ([`2026-10-16-activation-failure-containment.md`](2026-10-16-activation-failure-containment.md)) shipped first because [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) identified a missing service as a boot halt, and this rule makes most product value a service.

What this spec adds on top of those decisions is narrow: the one design question [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) explicitly delegated to it — how an adapter detects that its source handle is no longer valid — plus the scope line, the validation set, and the propagation [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) assigns to it.

### Terminology, because one word was doing two jobs

Two unrelated concepts both attract the word "stale", and an earlier draft of this spec conflated them:

- **Handle validity** — whether an `AssetSource` an adapter holds still writes into a live registry. This spec decides how an adapter detects invalidity.
- **Asset liveness** — whether a vehicle that was registered is still out there. v0 does not address this at all; see Non-goals.

Below, "handle validity" and "asset liveness" are used; "stale" is not.

## Why not bigger

The scope was cut after the question was raised of whether source handles, `{ kind: 'none' }`, registry-minted keys and inert handles had grown the API past a smallest cut.

An earlier draft answered that the API cannot shrink because reopening [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) would need a successor ADR. Two reviewers independently called that reasoning weak, and they are right: **staging a decided API is not reopening it**, so the procedural answer addresses a question nobody asked. Worse, it ducks the empirical question [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) itself posed — its Alternatives section pre-authorises the flat-registry fallback _if source handles prove to be ceremony_, and v0 is precisely the single-link deployment where that could be observed.

The honest answer is therefore narrower. v0 ships the full handle-based shape **because this iteration is the evidence-gathering run for that pre-authorised fallback**, and validation case 28 exists to gather it: the implementer records what the handle actually bought in a single-source deployment. If the answer is "nothing", the fallback is already authorised and the next iteration can take it without a successor ADR. What shrinks here is behaviour, not shape: no asset liveness, no multi-source merge, no `component_id`, no live state.

`{ kind: 'none' }` and `{ kind: 'unknown' }` are not API surface to cut — they are adapter outputs, produced by the mapping table below, so they cost nothing and are exercised for free.

## Goals

1. **`@gcscode/extension-assets`** — a service extension owning the asset registry, exposing the API [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) decided plus the one member this spec adds (`isLive`, below). The registry is constructed inside `activate()` and returned as the extension's exports; it is not a module singleton.
2. **`extension-sitl` becomes the first adapter.** On `HEARTBEAT` it registers one asset per MAVLink `system_id`, with `airframe` derived from that heartbeat's `MAV_TYPE`. It claims its source lazily, on first use, not during `activate()`.
3. **`@gcscode/extension-assets-demo`** — a throwaway consumer registering a **status-bar item** whose component renders `sourceLabel · airframe`, matching the shape [`docs/roadmap.md`](../roadmap.md) already commits to. Its only job is to prove the contract carries a domain fact to a consumer that knows nothing about MAVLink.
4. **Stop `packages/extension-map/src/index.ts` exporting `mapApi`**, the half of [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s enforcement follow-up that is genuinely two edits and genuinely about service-extension hygiene.
5. **Add the assets-before-adapter note to `bundled-extensions.ts` and correct the two comments that overstate constraints**, which [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) assigns to this iteration.
6. **Propagate the eight deferrals and the lint-rule item [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) assigns to this spec**, listed in the propagation section.

**Explicitly removed from this iteration:** extending the ESLint restricted-imports rule to `packages/shell/**`. An earlier draft bundled it as "two edits, verified against the current tree". That was wrong — the rule's relative-escape pattern would also hit legitimate in-package imports in `packages/shell/src/built-in/workbench/`, which navigate within the package rather than escaping it, so the change needs a pattern designed to tell those apart. It is its own micro-iteration; [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s trigger for it stands on its own and does not depend on v0.

## Non-goals

Each carries a trigger. The cross-cutting ones propagate to [`docs/out-of-scope.md`](../out-of-scope.md) per the propagation section.

- **Asset liveness — heartbeat timeouts, removal of a vehicle that stopped transmitting.** A registry entry means "present now, as asserted by its source" ([ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md), Membership). In v0 an entry disappears only when the adapter disposes it, its source is disposed, or the registry is torn down. A vehicle that goes quiet stays listed. _Trigger:_ the first operator-visible stale entry, which one SITL instance on a local link cannot produce.
- **Multi-source merge and conflict arbitration.** One source exists. Per-source namespacing is implemented because the API requires it, and case 5 asserts it, but nothing in production exercises two sources. _Trigger:_ the second adapter.
- **`component_id` as a distinct asset.** [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) decided one asset per MAVLink system. _Trigger:_ the first capability granted or commanded per component rather than per vehicle — a gimbal an operator takes control of separately being the known case.
- **Live state** — position, mode, battery. A separate port, and the next iteration.
- **A change event on the registry.** Consumers observe through reactive reads (see Architecture); there is no `onDidChangeAssets`. This is one of [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s named deferrals.
- **Per-property provenance**, **durable identity across reconnect**, **hierarchy**, **indexed queries**, and **widening the vocabulary beyond first-party need** — all [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) deferrals, carried with their triggers in the propagation section rather than restated here.
- **Any STANAG 4586 adapter.** Two-source expressibility is satisfied by analysis. [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) records the asymmetry: STANAG's vehicle type names a product model, so a STANAG adapter needs a mapping table where MAVLink reads `MAV_TYPE` directly. Those claims stand "as currently understood" until the STANAG architecture note lands.
- **Operator-facing surfacing of a degraded adapter.** The adapter degrades to the console, following `extension-flight-overlay` after the containment iteration. The absent notification primitive is an [`out-of-scope.md`](../out-of-scope.md) row whose trigger has already fired.

## Architecture

### The registry is constructed per activation, and that is now a stated rule

`extension-map`'s `mapApi` is a module singleton surviving disable/re-enable. This registry deliberately does not copy it: [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) reasons that surviving state would resurrect assets whose asserting adapter may be long gone. `activate()` constructs the registry, returns it as exports, and `deactivate()` drops it; re-enabling starts empty.

The tree then holds two service extensions with opposite teardown postures, which is defensible per-service but must not be left to whichever sibling the next author reads first. **The rule, stated here for the first time: a service whose contents are _asserted by other extensions_ constructs per activation; a service whose contents are _registered by live contributors holding their own disposables_ may persist.** `mapApi` is the second kind — flight-overlay owns its layer disposables and remounts on re-enable. The asset registry is the first kind. A third service picks by that test, not by precedent.

Internally the registry is a class holding a `SvelteMap`, per the project's convention for reactive external state: explicit `private`/`public`, `_backingField` naming, accessors over public mutables, components as thin renderers. `SvelteMap` preserves insertion order, which is what makes [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s "replacing a registration preserves position" implementable.

### The API

From [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md), unchanged:

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
```

With one member this spec adds, for the reason in the next section:

```ts
export interface AssetSource extends Disposable {
  readonly sourceId: string;
  /** False once this handle no longer writes into a live registry — because it
   *  was disposed, or because the registry it belonged to was torn down. */
  readonly isLive: boolean;
  registerAsset(description: AssetDescription): Disposable;
}
```

The behaviours [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) attached to that shape are requirements here, not restatements: a duplicate `createSource` on a **live** id throws synchronously and the id becomes claimable again once that source is disposed; re-registering a `localId` the same source already holds **replaces** the description in place, preserves position, and returns a fresh `Disposable` while the superseded one goes inert; and a handle held across the registry's teardown is **inert** — `registerAsset` does nothing and returns a no-op `Disposable` rather than throwing inside a message handler.

### Handle validity: `isLive`, not an identity comparison

This is the question [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) delegated. Its framing: `Disposable` is `{ dispose(): void }`, so an inert handle is indistinguishable from a live one by inspection, and detecting invalidity needs a signal the ADR does not define — naming re-resolution per message as the obvious candidate.

**Decision: `AssetSource` carries `readonly isLive`, and an adapter checks it before writing.** Per message: if `source` is undefined or `!source.isLive`, re-resolve the service and re-claim; then register. Defining the signal as an API member is exercising the authority [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) delegated, not overriding its API decision — the ADR left the signal undesigned precisely so this spec could design it.

An earlier draft instead compared the resolved exports' object identity across messages. It was rejected for three reasons, each of which `isLive` removes:

- **It does not cover disposal by the host.** The containment iteration's `activate` failure path disposes `context.subscriptions`, which is where the adapter's source handle lives. That disposes the source while the registry's exports object is **unchanged**, so an identity comparison sees nothing wrong and the adapter writes into a dead source forever, receiving a `Disposable` back each time. The claim in that draft that "the only disposer is the adapter itself or the registry's teardown" was simply false; containment is a third disposer.
- **It is one misreading away from never working.** `host.extensions.getExtension(id)` returns a **freshly constructed `{ id, exports }` record on every call** — only `.exports` is stable. An implementer comparing the returned record rather than `.exports` would re-claim on every single heartbeat, and no validation case in that draft would have caught it.
- **It put lifecycle correctness on every writer's hot path** to avoid adding one property to one service. `isLive` moves it to the service that knows the answer, and makes inert state _inspectable_ — the exact property [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) observed `Disposable` lacks.

**What this deliberately does not do** is require the service to _announce_ its teardown to writers. A push signal would invert the dependency direction for a pull-shaped adapter inside a single realm, and nothing yet needs it. The absent change event is already a carried deferral.

**Where this rule belongs.** "A writer checks `isLive` before writing, and re-claims when it is false" is a rule for every future service extension with writers, not assets trivia. It goes in [`packages/extension-api/README.md`](../../packages/extension-api/README.md), where an extension author looks, rather than only in the assets package where a writer looks last.

### Consumer liveness depends on reactivity, and that is a contract term

The consumer registers a status-bar item, whose contribution takes a `component`; the component reads `getAssets()` during render, exactly as `extension-vehicle-status`'s footer item reads SITL telemetry. Liveness therefore comes from Svelte reactivity crossing the extension boundary twice: `exportsByExtension` in the host registry is a `SvelteMap`, so "has the service appeared" is reactive; the asset registry's own `SvelteMap` makes "have the assets changed" reactive.

**That is currently an implementation property of two unrelated modules, not a documented contract, and this spec makes it one:** a consumer reading through `host.extensions.getExtension(...)` and a service's accessors inside a reactive context gets updates without an event. Stating it matters because the alternative idiom — resolving once at `activate()` and caching, which `extension-flight-overlay` does — is correct for _resolution_ but produces a component that never updates. A consumer must read per render.

### The adapter: one asset per system, airframe from `MAV_TYPE`

`extension-sitl` already holds a `mavlink-client` feeding `applyMessage`, filtered to `^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS)$`. v0 adds asset registration alongside the existing telemetry handling rather than restructuring it. One caveat on that word: `applyMessage` currently folds every sender's telemetry into one store, which is a pre-existing single-vehicle assumption this iteration neither fixes nor worsens — the live-state iteration owns it.

Two fields the adapter needs have **never been read anywhere in `packages/`**, and neither could be verified while writing this spec because no mavlink2rest instance was reachable:

- **`header.system_id`** — the asset's `localId`. `applyMessage` reads `obj['message']` and nothing else; no code reads a MAVLink envelope header, and no test fixture includes one.
- **`HEARTBEAT`'s `MAV_TYPE`** — the airframe. `msg['type']` is already taken as mavlink2rest's message-name discriminator (`'HEARTBEAT'`), so the vehicle type arrives under a different key.

**Both are unverified, and confirming both against a live stream is the first implementation step.** The repo does establish the shape to expect: mavlink2rest serialises enums as name strings — `isSafetyArmed` documents `base_mode` arriving as `"MAV_MODE_FLAG_SAFETY_ARMED | …"` — and existing code accepts both the string and a plain number, with tests using numbers. The parser mirrors that tolerance: accept the enum-name string, accept a number, treat anything else as unasserted. An implementer who cannot reach a live mavlink2rest must say so rather than guess, because a wrong field name produces an adapter that registers every vehicle as `unknown` — a failure that looks like a working feature.

| `MAV_TYPE`                                                                 | `Airframe`               | Why                                                                                                                                                                           |
| -------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QUADROTOR`, `HEXAROTOR`, `OCTOROTOR`, `TRICOPTER`                         | `{ kind: 'multirotor' }` | Direct                                                                                                                                                                        |
| `FIXED_WING`                                                               | `{ kind: 'fixed-wing' }` | Direct                                                                                                                                                                        |
| `VTOL_*`                                                                   | `{ kind: 'vtol' }`       | Direct; covers tailsitter, tiltrotor, tiltwing and the duo/quad variants                                                                                                      |
| `HELICOPTER`                                                               | `{ kind: 'unknown' }`    | **Not** multirotor. gcscode has no word for a single-rotor helicopter, and `unknown` means exactly that. Mapping it to `multirotor` would be a lie the consumer cannot detect |
| `GCS`, `ANTENNA_TRACKER`, `GIMBAL`, `CAMERA`, `ONBOARD_CONTROLLER`, `ADSB` | `{ kind: 'none' }`       | Asserted: does not fly                                                                                                                                                        |
| `GROUND_ROVER`, `SURFACE_BOAT`, `SUBMARINE`                                | `{ kind: 'none' }`       | Asserted: does not fly. `none` is a claim about flight, not importance                                                                                                        |
| anything else                                                              | `{ kind: 'unknown' }`    |                                                                                                                                                                               |

The `HELICOPTER` row is the first real vocabulary gap the abstraction hits, which is why it is in the table rather than a comment. Whether `rotary-wing` should join the vocabulary is a Known unknown, not a v0 decision. ArduCopter SITL reports `QUADROTOR`, so the live path exercises `multirotor`; `none` and `unknown` are exercised by unit tests over the mapping.

### No activation-order constraint, and the comment says so

An earlier draft required `assets` to activate before `sitl`. That contradicted two merged decisions: [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s Mechanics states that "v0 does not fire it: [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s adapter resolves the assets service lazily per inbound message, so the chain creates no activation-time edge and insertion order remains a comment rather than a constraint", and the [`out-of-scope.md`](../out-of-scope.md) ordering row carries the same sentence as the stated trigger for the whole dependency-declaration deferral. The draft's own per-message mechanism made the constraint unnecessary anyway.

So: **the adapter claims its source lazily, on first use**, and `bundled-extensions.ts` gains a comment that explicitly says ordering is _not_ required here — distinguishing it from the three existing constraints rather than becoming a fourth. The same pass corrects the two comments [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) and [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) flag as overstating constraints that do not exist: `vehicle-status` and `map-demo` both cite activation order for what are lazy reads. (`flight-overlay`'s was corrected during the containment iteration.)

When the registry is absent the adapter **degrades**: warns once, registers nothing, keeps its telemetry duties. The consumer renders an empty label. Neither throws — [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s discriminator (the absence is observable) and the containment iteration, which left no throwing dependency resolution anywhere in the tree. Reintroducing one here would make v0 the regression.

### Teardown, stated completely

Three things can invalidate an adapter's handle, and all three are covered by `isLive`:

1. **The adapter disposes it** — it pushes the handle to `context.subscriptions`, so a normal `deactivate` removes its assets.
2. **The host disposes it** — containment's failure path disposes `context.subscriptions`.
3. **The registry is torn down** — every source is disposed and the registry emptied.

Because the handle is in `context.subscriptions`, disabling the adapter removes its assets, and no phantom aircraft survive. Cases 29–31 assert each path.

## Validation

Numbered so later specs and reviews can cite them.

### The registry

1. `createSource` returns a handle whose `sourceId` is the claimed id, and `getAssets()` is empty before anything registers.
2. A second `createSource` on a live id throws synchronously.
3. After the first source is disposed, the same id can be claimed again.
4. `registerAsset` makes the asset visible with `sourceId` and `sourceLabel` stamped by the registry, and a `key` the caller did not supply.
5. Two sources registering the same `localId` produce two distinct assets with distinct `key`s.
6. Re-registering a `localId` the same source holds replaces the description, preserves position, and returns a fresh `Disposable`; the superseded one is inert, so disposing it does not remove the replacement.
7. Disposing an asset's `Disposable` removes exactly that asset.
8. Disposing a source removes every asset it registered.
9. `key` is opaque: uniqueness and stability for the asset's lifetime are asserted; its format deliberately is not.
10. `getAssets()` returns a snapshot a consumer cannot use to mutate the registry.

### Handle validity

11. A fresh source reports `isLive === true`.
12. A disposed source reports `isLive === false`, and `registerAsset` on it is a no-op returning a no-op `Disposable`. Nothing throws.
13. After the registry extension deactivates, a handle held across that boundary reports `isLive === false` and behaves as in 12.
14. Re-enabling the registry starts empty — nothing from the previous activation reappears.

### The adapter

15. A `HEARTBEAT` from `system_id` 1 registers exactly one asset with `localId` `'1'`.
16. Repeated heartbeats from the same system do not accumulate assets.
17. A heartbeat whose `MAV_TYPE` changes updates the airframe in place without changing the `key`.
18. Heartbeats from two different `system_id`s register two assets.
19. Two heartbeats differing only in `component_id` register **one** asset.
20. The mapping table is covered per row, including `HELICOPTER` → `unknown` and `GROUND_ROVER` → `none`, with an unmapped value → `unknown`.
21. `MAV_TYPE` as an enum-name string and as the equivalent number produce the same airframe.
22. A heartbeat with no readable `MAV_TYPE` registers the asset with **no** `airframe` property — not `unknown`. Absent means not asserted; `unknown` means asserted-and-unnameable.
23. The adapter claims its source **lazily**: activating the adapter alone registers no source, and the first heartbeat claims one. Asserted so the removed activation-order constraint cannot creep back.
24. With the registry absent at activation, the adapter activates, warns once, registers nothing, and its telemetry handling still works.
25. The registry is deactivated and re-activated while the adapter runs; the next heartbeat observes `isLive === false`, re-claims, and the asset reappears — without throwing.

### The consumer

26. The status-bar component renders `sourceLabel · airframe` for a registered asset, and an asset with no `airframe` renders without inventing one, distinguishably from `unknown`.
27. **Reactivity:** with the component mounted and the registry initially empty, registering an asset updates the rendered label with no event and no remount. This is the case that pins the contract term in Architecture; a consumer that cached at `activate()` would fail it.
28. **Evidence for the pre-authorised fallback:** the implementer records, in the task report, what the source handle bought in this single-source deployment — which validation cases would change if `registerAsset` hung directly off `AssetsApi` with a source id argument. Not a pass/fail assertion; a deliberate evidence-gathering step for the flat-registry fallback [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s Alternatives pre-authorises.

### Teardown

29. Disabling the adapter removes its assets from the registry.
30. An adapter whose `activate` throws after claiming its source leaves no assets behind — containment disposes the handle via `context.subscriptions`.
31. Re-enabling the adapter re-claims and re-registers on the next heartbeat.

### Enforcement

32. `mapApi` is no longer importable from `extension-map`'s entry point, while `activate()` still returns it as exports.

## VS Code alignment

| Concern                                                 | VS Code                                                          | gcscode                                                                                                                                        | Status                                                                                     |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Cross-extension service APIs                            | `activate()`'s return reached via `getExtension(id).exports`     | Identical mechanism; already used by `extension-map`, `extension-sitl` and three consumers, so this is a further use rather than a new pattern | Alignment                                                                                  |
| Per-source handles on an extension-populated collection | `tests.createTestController`, `scm.createSourceControl`          | `createSource` returns a handle owning its namespace                                                                                           | Alignment                                                                                  |
| Registry sharding                                       | Shards by capability — tests, SCM, debug each their own registry | One flat heterogeneous registry for every asset kind                                                                                           | Divergence                                                                                 |
| The `create*` verb                                      | Factory naming for handle-returning APIs                         | `createSource` follows that, where every other gcscode surface is `register*`                                                                  | Divergence                                                                                 |
| Where a domain capability lives                         | No equivalent; VS Code's domain is text editing                  | Service extensions, not host namespaces                                                                                                        | Divergence, per [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) |
| Service dependency resolution                           | `extensionDependencies` plus activation events                   | Lazy per-message resolution, so insertion order stays a comment                                                                                | Divergence                                                                                 |
| Detecting a service went away                           | Not addressed                                                    | `isLive` on the handle                                                                                                                         | Divergence, decided here                                                                   |
| Observing a service's contents                          | Events (`onDidChangeTestResults` and kin)                        | Reactive reads through `SvelteMap`; no change event                                                                                            | Divergence                                                                                 |

Note that "a registry organised by what assets have" is **not** an alignment with VS Code and is deliberately not recorded as one, per [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md).

## `docs/out-of-scope.md` propagation

[ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s propagation-ownership bullet assigns this spec every Known limitation carrying a trigger. That is eight rows plus the lint-rule item, none of which exist yet:

- **Asset hierarchy** — whether a gimbal is an asset, a component of one, or both. The id's composition inside a source is the adapter's choice, so a future `partOf` or nested components stay additive. _Trigger:_ the first capability granted per component rather than per vehicle.
- **Per-property provenance** — the registry records which source asserted an asset, not which asserted each property. _Trigger:_ the first property two sources can both assert.
- **The `unknown` overload** — `unknown` currently means both "the adapter saw something gcscode cannot name" and, in practice, "the vocabulary is too coarse". _Trigger:_ the second airframe family that lands in `unknown` for the coarseness reason rather than the genuinely-unnameable one; `HELICOPTER` is the first.
- **Durable identity across reconnect** — wire ids are reassignable addresses; a vehicle returning with a different id is a different asset, and anything a live-state port associated with the old one is orphaned. _Trigger:_ the first feature that must recognise the same airframe across a reconnect.
- **Live state** — what an asset is doing, as against what it is. _Trigger:_ already scheduled as the next iteration.
- **First-party-only vocabulary widening** — the vocabulary grows on demonstrated first-party need, not on standards coverage. _Trigger:_ a third-party extension needing a word gcscode does not have.
- **A change event on the registry** — consumers observe through reactive reads; there is no `onDidChangeAssets`. _Trigger:_ the first consumer outside a reactive context, or the first cross-realm consumer, since reactivity does not cross a worker or iframe boundary.
- **Indexed queries** — `getAssets()` returns everything and consumers filter. _Trigger:_ an asset count where linear scans in a render path cost measurably.
- **A lint rule for the anti-corruption boundary** — enum values and message names only, excluding package names, URLs and prose, with the value half acknowledged as out of its reach. _Trigger:_ the second adapter, where protocol identifiers could leak inward from two directions.

Also amend the existing **"Extension activation ordering / dependency declaration"** row: v0 adds no activation-time edge, so the row's stated trigger has **not** fired, and the degrade-when-absent pattern plus lazy claiming is now the established alternative to declaring dependencies.

## `docs/roadmap.md` propagation

The roadmap entries belong to [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s follow-ups, not to this spec, so this iteration only updates the status of what already exists: flip **Asset abstraction v0** to shipped, qualified by what actually shipped — one asset kind, one optional property, one source, no liveness, no live state — and keep the live-state entry's dependency on it explicit. Add the ESLint-glob micro-iteration as its own entry, since this spec removed it from v0's scope.

## `docs/vs-code-alignment.md` propagation

Rows filed by table, with the columns each requires — Alignments carries `Source`; Divergences and Deferrals also carry `Trigger to revisit`. The three [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) assigns: an **Alignments** row for per-source handles on an extension-populated entity collection (citing `tests.createTestController` / `scm.createSourceControl`), a **Divergences** row for one flat heterogeneous registry where VS Code shards by capability, and a **Divergences** row for the `create*` verb against gcscode's otherwise-uniform `register*`. Plus, from this spec: **Divergences** for lazy per-message service resolution and for `isLive` as the handle-validity signal, and a **Deferrals** row for the absent change event, triggered as in the out-of-scope row.

## `packages/extension-api/README.md` propagation

One section, because the rule generalises beyond assets: a writer into another extension's service checks the handle's validity before writing and re-claims when it is invalid, and a consumer reading a service's contents inside a reactive context gets updates without an event — but must read per render rather than caching at `activate()`.

## Known unknowns

- **Whether `rotary-wing` belongs in the vocabulary.** `HELICOPTER` → `unknown` is honest but unhelpful to an operator looking at a helicopter. One unmapped type is not enough evidence.
- **Whether `isLive` is the right primitive or a symptom.** It is inspectable and cheap, but it is still a pull signal a writer must remember to check. A service that announced teardown would be more direct, at the cost of inverting the dependency.
- **Whether the airframe property earns its place in v0.** It exists to prove the abstraction can carry a domain fact. `label` alone would prove nearly the same thing with less vocabulary.
- **Whether one asset per system survives contact with a gimbal.** [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) left hierarchy open; ignoring `component_id` is a scope cut, not an answer.
- **Whether v0 validates the abstraction or only its plumbing.** It validates the plumbing — per-source namespacing, inert handles, absent-versus-`unknown`, the re-claim. Adapter-neutrality of the vocabulary stays asserted rather than demonstrated until a second protocol lands, which [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) already concedes. The opening framing of an earlier draft overclaimed this.
- **Whether reactivity-as-contract survives the webview wing.** Svelte reactivity does not cross an iframe or worker boundary, so the first out-of-realm consumer needs the deferred change event.

## Future iterations

1. **Adapter-neutral live-state contract** — the next port, linked by asset identity, replacing the three consumers' direct reads of `SitlExports.telemetry`.
2. **The ESLint-glob micro-iteration** removed from v0's scope above.
3. **Asset liveness**, if its trigger fires.
4. **`extension-sitl` → `extension-mavlink`**, which this iteration makes more clearly correct.
5. **The STANAG 4586 architecture note**, which [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) treats as pending.

## Origin

[ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) and [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md), merged 2026-10-16. The containment iteration shipped first as the prerequisite [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) identified.

This document is the second draft. The first was reviewed by red-team (Opus and Sonnet), spec-quality and extension-architect, and the round changed four substantive things: the handle-validity signal moved from exports-identity comparison to `isLive` after the extension architect showed the identity check could not see containment-driven disposal; the activation-order constraint was deleted after two reviewers independently found it contradicted [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md) and the live [`out-of-scope.md`](../out-of-scope.md) row; the ESLint-glob change left v0's scope once its collateral on `packages/shell/src/built-in/workbench/` was found; and the propagation grew from three rows to the nine [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) actually assigns. The earlier handoff brief at `scratch/2026-10-15-assets-v0-handoff.md` is superseded by both ADRs and was not a source.

## Post-merge implementation

Code, so a feat branch through the subagent-driven pipeline. The repo-state claims here were verified while writing — the `mapApi` export site, the ESLint glob's scope and its collateral, that nothing in `packages/` reads a MAVLink envelope header, `getExtension`'s fresh-record return, `exportsByExtension` being a `SvelteMap`, and the status-bar contribution taking a component — and an implementer should re-verify rather than trust them.
