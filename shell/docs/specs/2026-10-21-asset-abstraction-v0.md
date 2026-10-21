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

The honest answer is therefore narrower. v0 ships the full handle-based shape **because this iteration is the evidence-gathering run for that pre-authorised fallback**, and validation case 30 exists to gather it: the implementer records what the handle actually bought in a single-source deployment. If the answer is "nothing", the fallback is already authorised and the next iteration can take it without a successor ADR. What shrinks here is behaviour, not shape: no asset liveness, no multi-source merge, no `component_id`, no live state.

`{ kind: 'none' }` and `{ kind: 'unknown' }` are not API surface to cut — they are adapter outputs, produced by the mapping table below, so they cost nothing and are exercised for free.

## Goals

1. **`@gcscode/extension-assets`** — a service extension owning the asset registry, exposing the API [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) decided plus the one member this spec adds (`isLive`, below). The registry is constructed inside `activate()` and returned as the extension's exports; it is not a module singleton.
2. **`extension-sitl` becomes the first adapter.** On `HEARTBEAT` it registers one asset per MAVLink `system_id`, with `airframe` derived from that heartbeat's `MAV_TYPE`. It claims its source lazily, on first use, not during `activate()`.
3. **`@gcscode/extension-assets-demo`** — a throwaway consumer registering a **status-bar item** whose component renders `sourceLabel · airframe`, matching the shape [`docs/roadmap.md`](../roadmap.md) already commits to. Its only job is to prove the contract carries a domain fact to a consumer that knows nothing about MAVLink.
4. **Stop `packages/extension-map/src/index.ts` exporting `mapApi`**, the half of [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s enforcement follow-up that is genuinely about service-extension hygiene. Stated precisely, because an earlier draft understated it: line 16 is `export { MAPLIBRE_CONTEXT_KEY, mapApi };`, so the edit **modifies a shared export line** rather than deleting one, and `MAPLIBRE_CONTEXT_KEY` stays exported — defensible under [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md), since it is not the live registry. `index.test.ts` takes `mapApi` from `./map-api.svelte` instead; `map-view.svelte` already does. **What v0 does not fix, and does not pretend to:** four files under `packages/extension-flight-overlay/src/layers/` re-declare that context key as a local string literal, so the value crosses the package boundary by duplication rather than by import — a hole of exactly the shape this enforcement is meant to close. Routed to the ESLint micro-iteration, where a rule can see it.
5. **Add the assets-before-adapter note to `bundled-extensions.ts` and correct the two comments that overstate constraints**, which [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) assigns to this iteration.
6. **Propagate the eight deferrals and the lint-rule item [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) assigns to this spec**, listed in the propagation section.

**Explicitly removed from this iteration:** extending the ESLint restricted-imports rule to `packages/shell/**`. An earlier draft bundled it as "two edits, verified against the current tree". That was wrong — the rule's relative-escape pattern would also hit legitimate in-package imports in `packages/shell/src/built-in/workbench/`, which navigate within the package rather than escaping it, so the change needs a pattern designed to tell those apart. It is its own micro-iteration; [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s trigger for it stands on its own and does not depend on v0.

## Non-goals

Each carries a trigger, and each is tagged **[propagate]** when it is a cross-cutting deferral landing in [`docs/out-of-scope.md`](../out-of-scope.md) or **[local]** when it is a scope cut staying in this spec — so a reader need not cross-reference the propagation section to learn which is which.

- **[propagate] Asset liveness — heartbeat timeouts, removal of a vehicle that stopped transmitting.** A registry entry means "present now, as asserted by its source" ([ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md), Membership). In v0 an entry disappears only when the adapter disposes it, its source is disposed, or the registry is torn down. A vehicle that goes quiet stays listed. _Trigger:_ the first operator-visible stale entry, which one SITL instance on a local link cannot produce.
- **[local] Multi-source merge and conflict arbitration.** Per-source namespacing — each source's `localId`s being unique only within that source, with the registry minting the globally unique `key`, as the API section below shows — means two links cannot collide. One source exists in v0. Per-source namespacing is implemented because the API requires it, and case 5 asserts it, but nothing in production exercises two sources. _Trigger:_ the second adapter.
- **[local] `component_id` as a distinct asset.** [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) decided one asset per MAVLink system. _Trigger:_ the first capability granted or commanded per component rather than per vehicle — a gimbal an operator takes control of separately being the known case.
- **[propagate] Live state** — position, mode, battery. A separate port, and the next iteration.
- **[propagate] Distinguishing assets from non-assets.** The adapter registers every system it sees, so the operator's own tooling — a GCS, a bridge, an antenna tracker — appears in the registry, and the mapping table hands it a tidy `{ kind: 'none' }` that makes it look deliberate. [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s Membership paragraph calls this wart live rather than hypothetical, and **v0 is the first iteration that puts it on screen**, because `assets-demo` renders whatever is registered. v0 accepts it rather than inventing a filter, since any filter would encode a judgment about what counts as an asset that [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) deliberately left open. _Trigger:_ the first capability that distinguishes non-flying assets from each other, which [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s Follow-ups already name as what the first non-flying asset should land with.
- **[local] Cross-surface consistency between the registry and the telemetry panel.** `applyMessage` folds every sender's telemetry into one store, a pre-existing single-vehicle assumption. v0 does not change it — but v0 is what makes it _observable_: before this iteration there was one implicit vehicle and no surface could disagree with another, whereas now the registry can list two assets while the telemetry panel silently shows a blend of both, with nothing flagging the inconsistency. Naming it is this spec's only contribution to it; fixing it belongs to the live-state iteration, which owns per-asset state.
- **[propagate] A change event on the registry.** Consumers observe through reactive reads (see Architecture); there is no `onDidChangeAssets`. This is one of [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s named deferrals.
- **[propagate] Per-property provenance**, **durable identity across reconnect**, **hierarchy**, **indexed queries**, and **widening the vocabulary beyond first-party need** — all [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) deferrals, carried with their triggers in the propagation section rather than restated here.
- **[local] Any STANAG 4586 adapter.** Two-source expressibility is satisfied by analysis. [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) records the asymmetry: STANAG's vehicle type names a product model, so a STANAG adapter needs a mapping table where MAVLink reads `MAV_TYPE` directly. Those claims stand "as currently understood" until the STANAG architecture note lands.
- **[propagate] Operator-facing surfacing of a degraded adapter.** The adapter degrades to the console, following `extension-flight-overlay` after the containment iteration. The absent notification primitive is an [`out-of-scope.md`](../out-of-scope.md) row whose trigger has already fired — recorded as fired by the containment iteration's propagation, so this spec inherits that state rather than owing a further edit. The propagation section says so explicitly, because every other non-goal here pairs a trigger with an action and this one would otherwise read as an omission.

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

export interface RegisteredAsset {
  readonly localId: string;
  readonly airframe?: Airframe;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly key: string;
}

export interface AssetsApi {
  createSource(sourceId: string, label: string): AssetSource;
  getAssets(): readonly RegisteredAsset[];
}
```

_Corrected during implementation (task 1):_ this block originally read `RegisteredAsset extends AssetDescription`, inheriting `localId` and `airframe` as **mutable** — which contradicted validation case 10 in this same document, since `readonly RegisteredAsset[]` protects the array and not its elements. The fields are spelled out and all `readonly` instead. ADR-0011's `extends` form is still the right shape for an ADR describing vocabulary; it is the wrong one for a registry whose immutability is enforced only by its types. A further limit, found by the same implementer and left alone: `getAssets()[0].airframe!.kind = 'none'` still type-checks, because `Airframe`'s `kind` is not `readonly` in ADR-0011's vocabulary. Making it so is a vocabulary change, not a v0 one — recorded in Known unknowns.

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

**Decision: `AssetSource` carries `readonly isLive`, and an adapter checks it before writing.** Per message: if `source` is undefined or `!source.isLive`, re-resolve the service and re-claim; then register this system's asset **only if its derived description differs from what the adapter last registered for that system**.

That last clause is not an optimisation, it protects a decided consequence. [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s "filtering replaces querying" rests on descriptions changing rarely, so a consumer's `$derived` filter recomputes rarely. Re-registering on every heartbeat would write at 1 Hz per system — minting a fresh `Disposable` and inerting the prior one each second — and every consumer's derived state would churn continuously, in an application whose whole purpose is watching live telemetry. So the adapter keeps, per system, the last description it registered alongside that system's `Disposable`, and compares before writing. On a genuine change it registers again, replacing in place, and **replaces its stored `Disposable` with the fresh one** — the superseded handle is inert and must not be kept or disposed later. Defining the signal as an API member is exercising the authority [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) delegated, not overriding its API decision — the ADR left the signal undesigned precisely so this spec could design it.

An earlier draft instead compared the resolved exports' object identity across messages. It was rejected for three reasons, each of which `isLive` removes:

- **It does not cover disposal by the host.** The containment iteration's `activate` failure path disposes `context.subscriptions`, which is where the adapter's source handle lives. That disposes the source while the registry's exports object is **unchanged**, so an identity comparison sees nothing wrong and the adapter writes into a dead source forever, receiving a `Disposable` back each time. The claim in that draft that "the only disposer is the adapter itself or the registry's teardown" was simply false; containment is a third disposer.
- **It is one misreading away from never working.** `host.extensions.getExtension(id)` returns a **freshly constructed `{ id, exports }` record on every call** — only `.exports` is stable. An implementer comparing the returned record rather than `.exports` would re-claim on every single heartbeat, and no validation case in that draft would have caught it.
- **It put lifecycle correctness on every writer's hot path** to avoid adding one property to one service. `isLive` moves it to the service that knows the answer, and makes inert state _inspectable_ — the exact property [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) observed `Disposable` lacks.

**Recovery latency equals the adapter's message period, and that is what a third adapter inherits most directly.** Nothing re-claims until the next message the adapter acts on, so a registry cycle during a link outage leaves the registry empty while the adapter believes otherwise, for an unbounded window. At SITL's 1 Hz that is invisible. An adapter whose source is event-driven rather than periodic — a radar reporting on detection, a STANAG link with a slower descriptive cadence — inherits "my assets reappear whenever something next happens", which can be never. Naming the constraint is v0's answer; a heartbeat-independent re-resolve (an interval, or a re-resolve on the consumer's read path) is the fix once an adapter whose cadence makes it bite actually arrives. This belongs in the recipe that goes to `packages/extension-api/README.md`, not only here.

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

**Both were unverified when this spec was written; both have since been measured against a live stream, twice — by the controller before implementation began and independently by task 4's implementer.** The repo suggested the shape to expect: mavlink2rest serialises enums as name strings — `isSafetyArmed` documents `base_mode` arriving as `"MAV_MODE_FLAG_SAFETY_ARMED | …"` — and existing code accepts both the string and a plain number, with tests using numbers. _Corrected by measurement (2026-10-21, before implementation began):_ that generalised from a **bitfield** to all enums and is wrong for this field. A live frame carries `header.system_id` as expected, but the vehicle type arrives as `message.mavtype` whose value is a **nested object** — `{ "type": "MAV_TYPE_QUADROTOR" }` — not a bare string. A parser accepting only string-or-number returns `undefined` for every real heartbeat, which is precisely the silent failure this paragraph warns about. The plan carries the measured frame. The parser mirrors that tolerance: accept the enum-name string, accept a number, treat anything else as unasserted. An implementer who cannot reach a live mavlink2rest must say so rather than guess, because a wrong field name produces an adapter that registers every vehicle with **no `airframe` property at all**: by this spec's own parse rule an unreadable value is absent, not `unknown`. An earlier draft claimed the signature was "every vehicle as `unknown`", contradicting that rule. The true signature is quieter and so worse — a registry of assets with no airframe is indistinguishable from a fleet whose airframes nobody asserted.

| `MAV_TYPE`                                                                                                                                                                                                                                                                                                                                                                                                                              | `Airframe`               | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any rotor-count or generic multirotor — `TRICOPTER`, `QUADROTOR`, `HEXAROTOR`, `OCTOROTOR`, `DECAROTOR`, `DODECAROTOR`, `GENERIC_MULTIROTOR`                                                                                                                                                                                                                                                                                            | `{ kind: 'multirotor' }` | A **family rule**, not an enumeration. _Corrected during task 4:_ an earlier draft listed four while the plan's regex recognised five, so `DECAROTOR` and `GENERIC_MULTIROTOR` fell through to `unknown` — a lie of omission rather than an honest one. `unknown` means gcscode has no word for what the adapter saw, and gcscode plainly has the word for a ten-rotor aircraft. Where the vocabulary can name something, it must. `COAXIAL` and `HELICOPTER` stay out: rotary-wing but not multirotor, which is the genuine gap below |
| `FIXED_WING`                                                                                                                                                                                                                                                                                                                                                                                                                            | `{ kind: 'fixed-wing' }` | Direct                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `VTOL_*`                                                                                                                                                                                                                                                                                                                                                                                                                                | `{ kind: 'vtol' }`       | Direct; covers tailsitter, tiltrotor, tiltwing and the duo/quad variants                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `HELICOPTER`                                                                                                                                                                                                                                                                                                                                                                                                                            | `{ kind: 'unknown' }`    | **Not** multirotor. gcscode has no word for a single-rotor helicopter, and `unknown` means exactly that. Mapping it to `multirotor` would be a lie the consumer cannot detect                                                                                                                                                                                                                                                                                                                                                          |
| Anything the vocabulary can assert does not fly — ground and surface craft (`GROUND_ROVER`, `GROUND_QUADRUPED`, `SURFACE_BOAT`, `SUBMARINE`), ground stations and trackers (`GCS`, `ANTENNA_TRACKER`), and peripherals or payloads carried by something else (`GIMBAL`, `CAMERA`, `SERVO`, `WINCH`, `ONBOARD_CONTROLLER`, `ADSB`, `ODID`, `BATTERY`, `ILLUMINATOR`, `GRIPPER`, `FLARM`, `LOG`, `OSD`, `IMU`, `GPS`, `CHARGING_STATION`) | `{ kind: 'none' }`       | A **family rule**, same reasoning as multirotor above and completed in the same pass. `none` asserts "does not fly", and the vocabulary can assert that about a gripper as readily as about a gimbal — so letting the unlisted siblings fall through to `unknown` was the same lie of omission. Task 4 measured the gap as exactly five values (`GROUND_QUADRUPED`, `ODID`, `BATTERY`, `ILLUMINATOR`, `GRIPPER`). `none` is a claim about flight, not about importance: these are assets gcscode may well control later                |
| anything else                                                                                                                                                                                                                                                                                                                                                                                                                           | `{ kind: 'unknown' }`    | After both family rules, exactly eleven values remain, and `unknown` is honest for every one: airborne craft gcscode has no word for (`AIRSHIP`, `FREE_BALLOON`, `ROCKET`, `KITE`, `FLAPPING_WING`, `PARAFOIL`, `PARACHUTE`, `SPACECRAFT_ORBITER`), the deliberately unspecific `GENERIC`, and the rotary-wing pair `COAXIAL` and `HELICOPTER`. That the residue is small and enumerable is the evidence the two family rules are complete rather than merely wider                                                                    |

**Two notes on the numeric form, both measured during task 4 by running the plan's parser verbatim.** An unmapped _ordinal_ yields `{ kind: 'unknown' }`, not absent: a number the vehicle sent is an assertion, and reporting it as not-asserted would be the quiet failure this spec exists to prevent — an earlier draft of the plan returned absent there, contradicting its own comment. And the ordinal table must cover **every** value the string rules recognise: the plan's covered 11 of 31, so twenty-one values mapped correctly as strings while reporting absent as numbers, falsifying case 23 for them. Derive the table from the MAVLink dialect rather than from recall — `MAV_TYPE` lives in `minimal.xml`, not `common.xml`. _Corrected during task 4's review:_ an earlier draft of this sentence said "the repo's pinned submodule", which does not exist — gcscode vendors no MAVLink dialect, has no `.gitmodules`, and the definitions live in a separate ArduPilot checkout outside this repository. That matters twice over. A future implementer following the original wording would hunt for a submodule that was never here; and because the source is outside the repo and absent from CI and from a fresh clone, the **residue test is the durable guard**, not the dialect file. Its static expected list is a feature in that light: it pins the partition as of the dialect the table was built from, and fails loudly if a rule later grows past it.

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

Because the handle is in `context.subscriptions`, disabling the adapter removes its assets, and no phantom aircraft survive. Cases 31–33 assert each path.

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
10. `getAssets()` returns a snapshot a consumer cannot use to mutate the registry — and the **types say so**, which in a single-realm host with no isolation is the only enforcement available. `localId` and `airframe` are `readonly` on the registered form too, not just the three fields the ADR marked, because `readonly RegisteredAsset[]` protects the array and not its elements: without it, `getAssets()[0].airframe = { kind: 'none' }` type-checks. The snapshot is **shallow over elements the types freeze**, not a deep copy, and `extension-sitl`'s `telemetry: Readonly<TelemetryState>` is the in-repo precedent for saying that plainly. The test asserts the compile-time claim alongside the runtime one.

### Handle validity

11. A fresh source reports `isLive === true`.
12. A disposed source reports `isLive === false`, and `registerAsset` on it is a no-op returning a no-op `Disposable`. Nothing throws.
13. After the registry extension deactivates, a handle held across that boundary reports `isLive === false` and behaves as in 12.
14. Re-enabling the registry starts empty — nothing from the previous activation reappears.

### The adapter

15. A `HEARTBEAT` from `system_id` 1 registers exactly one asset with `localId` `'1'`.
16. Repeated heartbeats from the same system do not accumulate assets.
17. A heartbeat whose `MAV_TYPE` changes updates the airframe in place without changing the `key`.
18. **The skip rule:** a second heartbeat carrying an unchanged description performs **no** registration — asserted by spying on `registerAsset`, not by observing the asset list, since an unconditional re-register would leave the list identical and the test would pass vacuously. The adapter's stored `Disposable` is also unchanged.
19. After a change that does re-register, the adapter holds the **fresh** `Disposable`: disposing what it holds removes the asset, and the superseded handle is inert.
20. Heartbeats from two different `system_id`s register two assets.
21. Two heartbeats differing only in `component_id` register **one** asset.
22. The mapping table is covered per row, including `HELICOPTER` → `unknown` and `GROUND_ROVER` → `none`, with an unmapped value → `unknown`.
23. `MAV_TYPE` as an enum-name string and as the equivalent number produce the same airframe — **and every value carries an absolute expected answer as well**, taken from this spec's family rules rather than from the implementation. _Sharpened during task 4:_ agreement alone is not coverage, because both forms delegate to the same name lookup and so agree on the same mistake. Measured, nineteen values were covered only by agreement, and deleting an entire family member from the mapping rule left all 121 tests green. Case 22 and this case together must make equivalence-only coverage inexpressible.
24. A heartbeat with no readable `MAV_TYPE` registers the asset with **no** `airframe` property — not `unknown`. Absent means not asserted; `unknown` means asserted-and-unnameable.
25. The adapter claims its source **lazily**: activating the adapter alone registers no source, and the first heartbeat claims one. Asserted so the removed activation-order constraint cannot creep back.
26. With the registry absent at activation, the adapter activates, warns once, registers nothing, and its telemetry handling still works.
27. The registry is deactivated and re-activated while the adapter runs; the next heartbeat observes `isLive === false`, re-claims, and the asset reappears — without throwing.

### The consumer

28. The status-bar component renders `sourceLabel · airframe` for a registered asset, and an asset with no `airframe` renders without inventing one, distinguishably from `unknown`.
29. **Reactivity:** with the component mounted and the registry initially empty, registering an asset updates the rendered label with no event and no remount. This is the case that pins the contract term in Architecture; a consumer that cached at `activate()` would fail it.
30. **Evidence for the pre-authorised fallback:** the implementer records, in the task report, what the source handle bought in this single-source deployment — which validation cases would change if `registerAsset` hung directly off `AssetsApi` with a source id argument. Not a pass/fail assertion; a deliberate evidence-gathering step for the flat-registry fallback [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md)'s Alternatives pre-authorises.

### Teardown

31. Disabling the adapter removes its assets from the registry.
32. An adapter whose `activate` throws after claiming its source leaves no assets behind — containment disposes the handle via `context.subscriptions`.
33. Re-enabling the adapter re-claims and re-registers on the next heartbeat.

### The ordering comments

34. `bundled-extensions.ts` carries a comment for the assets entry stating that ordering is **not** required here, and the `vehicle-status` and `map-demo` comments no longer cite activation order for what are lazy reads. Checked by reading the file in the task report rather than by a unit test, since comments are not executable — but called out as a validation item so Goal 5 is not shipped unverified.

### Enforcement

35. `mapApi` is no longer importable from `extension-map`'s entry point, while `activate()` still returns it as exports.

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

- **Asset liveness** — nothing times out a vehicle that stopped transmitting; an entry means present-as-asserted. _Trigger:_ the first operator-visible stale entry, which one link cannot produce.
- **Distinguishing assets from non-assets** — the adapter registers every system it sees, so the operator's own tooling is listed as an asset, and v0 is the first iteration that renders it. _Trigger:_ the first capability that distinguishes non-flying assets from each other.

No edit is owed for the **notification-primitive** row: the containment iteration already recorded its trigger as fired, and this spec inherits that state. It is called out here so the non-goal that mentions it does not read as a missing action.

Also amend the existing **"Extension activation ordering / dependency declaration"** row: v0 adds no activation-time edge, so the row's stated trigger has **not** fired, and the degrade-when-absent pattern plus lazy claiming is now the established alternative to declaring dependencies.

## `docs/roadmap.md` propagation

The roadmap entries belong to [ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)'s follow-ups, not to this spec, so this iteration only updates the status of what already exists: flip **Asset abstraction v0** to shipped, qualified by what actually shipped — one asset kind, one optional property, one source, no liveness, no live state — and keep the live-state entry's dependency on it explicit. Add the ESLint-glob micro-iteration as its own entry, since this spec removed it from v0's scope.

## `docs/vs-code-alignment.md` propagation

Rows filed by table, with the columns each requires — Alignments carries `Source`; Divergences and Deferrals also carry `Trigger to revisit`. The three [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) assigns: an **Alignments** row for per-source handles on an extension-populated entity collection (citing `tests.createTestController` / `scm.createSourceControl`), a **Divergences** row for one flat heterogeneous registry where VS Code shards by capability, and a **Divergences** row for the `create*` verb against gcscode's otherwise-uniform `register*`. Plus, from this spec: **Divergences** for lazy per-message service resolution and for `isLive` as the handle-validity signal, and a **Deferrals** row for the absent change event, triggered as in the out-of-scope row.

## `packages/extension-api/README.md` propagation

One section, because the rule generalises beyond assets: a writer into another extension's service checks the handle's validity before writing and re-claims when it is invalid, and a consumer reading a service's contents inside a reactive context gets updates without an event — but must read per render rather than caching at `activate()`.

## Known unknowns

- **How deep the immutability claim should go.** Case 10's "the types are the only enforcement" holds one level: a consumer cannot replace an asset's `airframe`, but can still write `getAssets()[0].airframe!.kind`, because `Airframe`'s `kind` is mutable in ADR-0011's vocabulary. Deepening it means `readonly` on the vocabulary types themselves, which is an ADR-0011 change with no consumer yet asking for it.
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
