# ADR-0011: Asset vocabulary — our own words, standards as adapters, one registry for every kind

**Date:** 2026-10-16
**Status:** Accepted

## Context

Ground control software that talks to hardware from more than one vendor faces a well-documented trap: code that branches on who made a device and which model it is (`if (vendor === X && model === Y)`). Every new vendor, model or payload then means touching UI code throughout the codebase. QGroundControl's developer guide describes the same risk for firmware differences — a codebase degrading into if/then/else statements keyed on firmware — and answers it with firmware plugins.

gcscode is too early to have this problem. Today it talks to one ArduCopter SITL, and its only firmware-specific knowledge is the `ARDUCOPTER_MODES` table inside `@gcscode/extension-sitl`. Three consumers (`extension-vehicle-status`, `extension-flight-overlay`, `extension-map-demo`) read that extension's `telemetry` export directly, so for telemetry the consumers talk to the adapter. The aim is to avoid the trap by design, before a second vendor or a non-flying asset arrives, rather than refactor out of it later.

The planned asset abstraction introduces gcscode's first adapter-neutral contract: adapters translate a protocol into **asset descriptions** held in an **asset registry**, and UI asks what an asset _has_ ("an airframe to pick an icon for", later "a video stream") instead of what it _is_. Two questions have to be settled before the vocabulary is written down, because both are expensive to reverse once consumers key on them:

1. **Whose words are inside the boundary** — MAVLink's `MAV_TYPE`, or gcscode's own?
2. **How is the collection organized** — one registry for every kind of asset, or per-kind registries, or one registry with a `kind` discriminator on each entry?

This ADR answers both. Where the registry _lives_ (a service extension rather than a host namespace) is [ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md). The implementation slice that first exercises this vocabulary is the asset abstraction v0 spec.

`docs/architecture/2026-10-15-ports-and-adapters.md` is informative background on the patterns involved (ports and adapters, anti-corruption layer, GoF Adapter). It commits to nothing; this ADR is the decision.

## Decision

**1. gcscode defines its own asset vocabulary. Protocol enums never cross the boundary.**

An asset description says what an asset is, what it carries, and what those can do, in gcscode's words. The first slice is the airframe:

```ts
export type Airframe =
  | { kind: 'multirotor' }
  | { kind: 'fixed-wing' }
  | { kind: 'vtol' }
  | { kind: 'unknown' };

export interface AssetDescription {
  id: string; // namespaced by adapter: 'mavlink:<sysid>'
  airframe?: Airframe; // key omitted = this asset does not fly
}
```

Three properties are load-bearing:

- **Objects with a `kind`, not bare strings.** `{ kind: 'multirotor' }` leaves room for parameters later (`{ kind: 'multirotor', rotorCount: 4 }`) without breaking any consumer's comparison.
- **Absent and unknown mean different things, and both are explicit.** No `airframe` means the asset does not fly (a radar, a ground station). `{ kind: 'unknown' }` means gcscode has no word for what the adapter saw — either the protocol value is unrecognized, or it is recognized and gcscode has no kind for it yet (helicopter, airship). TypeScript's strict mode forces consumers to handle the absent case; an exhaustive `Record<Airframe['kind'], …>` forces them to handle every kind.
- **The kinds are driven by what consumers need** (a label first, map icons later), not by any protocol's list.

**2. Standards are adapters, held to the round-trip rule.**

Every vocabulary addition must be expressible from both MAVLink and STANAG 4586. Neither standard shapes the internal model; both become adapters to it. The rule is a design constraint applied in review, not an automated check.

The asymmetry this already surfaces: MAVLink's `MAV_TYPE` names an airframe family directly, whereas STANAG 4586's vehicle type identifies the _product model_ — so a STANAG adapter would need a catalog lookup to produce an `Airframe`. That is the adapter's problem, which is exactly the point.

The corollary is an anti-corruption boundary with a mechanical test: protocol identifiers (`MAV_TYPE_*`, message names) appear only inside adapter packages. That is checkable by grep or lint; no check is in place today.

**3. One registry for every kind of asset, and no `kind` field on the description.**

There is deliberately no `kind: 'drone' | 'radar'` on `AssetDescription`. What kind of thing an asset is follows from what its description contains: an asset with an `airframe` flies; one without does not; one with a video stream has a camera.

Both rejected shapes reintroduce the branch this abstraction exists to remove. A `kind` field invites `if (asset.kind === 'drone')` in UI code — the vendor/model trap one level up. Per-kind registries (vehicles, radars, docks) move the same branch one level higher still, to the lookup call, and multiply the registration API per asset family.

The prior art is consistent: VS Code organizes provider registries by feature with language as a _filter_, never a registry per language; MAVLink, Matter, Home Assistant and entity-component systems all keep one heterogeneous collection keyed by identity, with capabilities or components attached to the entries.

## Consequences

**Positive.**

- **UI is keyed by description content.** A renderer asks "does this asset have an airframe?", so a new asset type (radar, ground station, dock) needs no new registry, no new lookup, and no new branch in consumer code.
- **Adapters are the only place protocol vocabulary appears.** The boundary rule in `CLAUDE.md` already forbids runtime imports between extension packages, so a consumer cannot call into an adapter; this decision adds the vocabulary half of the same wall.
- **New vendors cost an adapter, not a refactor.** The round-trip rule is what keeps that true: a vocabulary shaped around MAVLink would make the second standard a special case.
- **The compiler enforces the awkward cases.** Optional `airframe` plus an exhaustive `Record` over `Airframe['kind']` means "what if it does not fly" and "what if we do not recognize it" cannot be silently skipped.

**Negative.**

- **Every vocabulary addition costs a translation in every adapter.** That is the price of our own words, and it rises with the number of adapters.
- **"Is this a drone?" is answered indirectly.** A consumer that genuinely wants that question asks "does it have an airframe?" instead, which reads less directly until the vocabulary is rich enough to express what the consumer actually needs.
- **Filtering replaces querying.** With one registry and no `kind`, "list every drone" is a filter over description content rather than a registry lookup. Fine at today's scale (one asset); a future iteration may need indexed queries.
- **The round-trip rule has no automated check.** It is a review question, and its STANAG side is documentary — gcscode has no STANAG implementation to test against.

## Known limitations

- **Hierarchy is undecided.** Whether a gimbal or a camera is an asset, a component of an asset, or both is open. MAVLink's model is system → components, each component emitting its own HEARTBEAT with its own `MAV_TYPE`; STANAG 4586's Levels of Interoperability separate control of the payload (LOI 3) from control of the air vehicle (LOI 4), so separate control authority over payload and airframe is a modelled requirement, not a quirk; Home Assistant splits devices from the entities you actually control. This ADR's identity rule forecloses none of them — a `partOf` back-reference and nested components are both additive. _Trigger:_ the first command to an asset, or the first per-component capability.
- **No provenance.** A description carries no record of which adapter asserted which fact, and merging the same asset seen by two adapters is undefined. _Trigger:_ a second source for the same fact, such as a model catalog.
- **`unknown` is a conservative default.** An unrecognized value maps to `{ kind: 'unknown' }`, which implies the asset flies. For a future non-flying `MAV_TYPE` that an adapter has not learned yet, that implication is wrong. _Trigger:_ the first consumer that acts on the distinction (e.g. drawing an icon rather than a label).
- **Live state is a separate contract.** What an asset _is_ and what it is _doing now_ are different questions linked by asset id. This ADR covers descriptions only; the live-state port is a later iteration, and until it lands consumers of telemetry still read the adapter directly.

## Alternatives considered

- **Reuse `MAV_TYPE` as the internal vocabulary.** Rejected: it mixes airframes with things that do not fly (ground stations, gimbals, cameras, rovers, boats), it is protocol-specific, and it would make MAVLink the model every other standard translates into — the opposite of the round-trip rule.
- **A `kind: 'drone' | 'radar'` discriminator on `AssetDescription`.** Rejected: it is the branch the abstraction exists to remove, and it would be load-bearing in consumer code within one iteration of being added.
- **Per-kind registries** (one for vehicles, one for radars, one for docks). Rejected: moves the branch to the lookup site, multiplies the registration API, and makes "show me everything connected" a join across registries.
- **Bare string unions** (`type Airframe = 'multirotor' | 'fixed-wing' | …`). Rejected: no room for parameters (rotor count, gimbal axis limits) without breaking every consumer comparison.
- **Defer the vocabulary; let each consumer read its adapter directly** (today's posture for telemetry). Rejected: that is the trap. Three consumers already read `SitlExports.telemetry`, and each new vendor would multiply that coupling.

## Follow-ups

- The asset abstraction v0 spec implements the first slice (`Airframe`, `AssetDescription` with `id` + optional `airframe`) and records v0's accepted simplifications.
- [ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md) decides where the registry lives.
- `docs/vs-code-alignment.md` gains an Alignments row for one registry organized by what assets have rather than what they are.
- A lint rule keeping protocol identifiers inside adapter packages is deferred with a trigger in `docs/out-of-scope.md`.
- Components and capabilities (a camera's zoom range, a gimbal's axis limits) extend `AssetDescription` additively when a second component type exists; the hierarchy question above is decided then, not now.
