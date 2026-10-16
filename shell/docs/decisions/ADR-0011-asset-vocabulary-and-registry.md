# ADR-0011: Asset vocabulary — our own words, standards as adapters, one registry for every kind

**Date:** 2026-10-16
**Status:** Accepted

## Context

Ground control software that talks to hardware from more than one vendor faces a well-documented trap: code that branches on who made a device and which model it is (`if (vendor === X && model === Y)`). Every new vendor, model or payload then means touching UI code throughout the codebase. QGroundControl's developer guide describes the same risk for firmware differences — a codebase degrading into if/then/else statements keyed on firmware — and answers it with firmware plugins (see References).

gcscode is too early to have this problem. Today it talks to one ArduCopter SITL. Its firmware-specific knowledge is the `ARDUCOPTER_MODES` table inside `@gcscode/extension-sitl`, which stops the firmware's mode _numbers_ at the adapter but passes its _words_ through: the resulting names (`GUIDED`, `RTL`) are ArduCopter vocabulary, they land in `SitlExports.telemetry.mode`, and `extension-vehicle-status` renders them. Three consumers (`extension-vehicle-status`, `extension-flight-overlay`, `extension-map-demo`) read that export directly, so for telemetry the consumers talk to the adapter. The aim is to avoid the vendor/model trap by design, before a second vendor or a non-flying asset arrives, rather than refactor out of it later.

Two words, used throughout and worth pinning down first. An **asset** is something gcscode connects to and describes — a drone, a radar, a ground station: "own and connected". A **track** is something an asset _observes_, such as a radar detection; tracks are live data produced by an asset, not entries in the registry, and are out of scope here.

The planned asset abstraction introduces gcscode's first adapter-neutral contract: adapters translate a protocol into **asset descriptions** held in an **asset registry**, and UI asks what an asset _has_ ("an airframe to pick an icon for", later "a video stream") instead of what it _is_. Three questions have to be settled before the vocabulary is written down:

1. **Whose words are inside the boundary** — MAVLink's `MAV_TYPE`, or gcscode's own?
2. **How is the collection organized** — one registry for every kind of asset, or per-kind registries, or one registry with a `kind` discriminator on each entry?
3. **What is an asset's identity**, and what does membership in the registry mean?

**Why decide now, with no consumer yet.** Not because reversal is expensive today: nothing keys on this vocabulary, every consumer is in-tree under `workspace:*`, and [ADR-0005](ADR-0005-extension-boundaries.md)'s Known limitations price exactly this class of change as compile-time breakage that ships together. The mechanical refactor is cheap and stays cheap until extensions ship independently. What is not recovered by a refactor is **shape**: a vocabulary grown around the first protocol makes the second standard a special case, and that cost is paid in every adapter written afterwards. Deciding ahead of the first consumer is a deliberate sequencing choice — this ADR and [ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md) land before the asset abstraction v0 spec that implements them — not an inference from migration cost.

Where the registry _lives_ (a service extension rather than a host namespace) is ADR-0012. [`docs/architecture/2026-10-15-ports-and-adapters.md`](../architecture/2026-10-15-ports-and-adapters.md) is informative background on the patterns involved (ports and adapters, anti-corruption layer, GoF Adapter). It commits to nothing; this ADR is the decision, and restates in its own terms anything it relies on.

## Decision

### 1. gcscode defines its own asset vocabulary

An asset description says what an asset is, what it carries, and what those can do, in gcscode's words. Protocol enums do not appear in it. The first slice is the airframe:

```ts
export type Airframe =
  | { kind: 'multirotor' }
  | { kind: 'fixed-wing' }
  | { kind: 'vtol' }
  | { kind: 'none' } // asserted: this asset does not fly
  | { kind: 'unknown' }; // gcscode has no word for what the adapter saw

export interface AssetDescription {
  /** Unique within the registering source (see Decision 4). Opaque to consumers. */
  localId: string;
  /** Absent = not asserted. `{ kind: 'none' }` = asserted: does not fly. */
  airframe?: Airframe;
}
```

Three properties are load-bearing:

- **Objects with a `kind`, not bare strings.** `{ kind: 'multirotor' }` leaves room for parameters later (`{ kind: 'multirotor', rotorCount: 4 }`) without breaking any consumer's comparison.
- **Non-flight is asserted positively.** `{ kind: 'none' }` means an adapter looked and this asset does not fly. A _missing_ `airframe` means nothing was asserted — which is also what you get from an adapter older than the field, a partially-populated description, or a JSON round trip, which drops `undefined`-valued keys. (Structured clone, which the roadmapped webview wing uses for snapshots, preserves them; version skew between a bundled adapter and a webview consumer does not.) Those two facts must not collapse: a consumer that reads absence as "does not fly" would render a ground-station treatment for a drone, with no error surface anywhere. Consumers must not infer non-flight from absence.
- **`{ kind: 'unknown' }` means gcscode has no word for what the adapter saw** — either the protocol value is unrecognized, or it is recognized and gcscode has no kind for it yet (helicopter, airship). It is not a synonym for "nothing asserted".

The kinds are driven by what consumers need (a label first, map icons later), not by any protocol's list.

**The absence rule generalizes past the airframe, and is the vocabulary's standing convention.** Every optional field in an asset description distinguishes _asserted absent_ from _not asserted_, and the distinction is carried in the value rather than in the field's presence: a capability that can legitimately be absent gets a positive value saying so, exactly as `{ kind: 'none' }` does for the airframe. A field that is simply missing means **nothing was asserted** — never "this asset lacks that capability" — and consumers must not infer a negative from a missing field. Any future capability (a camera, a gimbal, a radar sensor) inherits this: if "it definitively has none" is a fact a consumer will act on, the vocabulary needs a value for it, because leaving it to absence reproduces the wrong-icon-with-no-error failure one field over.

What the type system does and does not do for the awkward cases, stated precisely: `tsconfig.base.json` sets `strict: true` without `exactOptionalPropertyTypes`. So optionality is enforced only where a consumer dereferences — `asset.airframe?.kind ?? 'unknown'` compiles and silently merges three distinct facts. An exhaustive `Record<Airframe['kind'], …>` is checked at its own definition site, and only for consumers that choose that pattern; a `switch` without a `never` check opts out. The shape makes handling every case cheap to adopt and misses cheap to find. It does not force correctness, and this ADR does not claim it does.

### 2. Standards are adapters, held to two-source expressibility

Every vocabulary addition must be **expressible from** both MAVLink and STANAG 4586. The direction is one-way by design: protocol → gcscode. Information is expected to be lost in the reverse direction, and nothing requires a term to be invertible back onto either wire format. (An earlier draft called this a "round-trip rule", which invites exactly the invertibility test it does not ask for.)

The asymmetry this surfaces, as currently understood: MAVLink's `MAV_TYPE` names an airframe family directly, whereas STANAG 4586's vehicle type identifies the _product model_ — so a STANAG adapter would need a catalog lookup to produce an `Airframe`. Note that such a catalog is itself a second source of facts about one asset, which is the trigger condition for the provenance deferral recorded under Known limitations; the showcase for the rule and the trigger for a deferral are the same event, and the ADR does not pretend otherwise.

**Precedence, where the rule collides with Decision 1.** Consumer need wins. A capability a consumer genuinely needs ships even when one standard has no analog for it; what the rule buys is that the gap is _noticed and written down_ rather than discovered later. Operationally: the PR adding a vocabulary term sketches the translation from MAVLink and from one named non-MAVLink source in its body, and records how an adapter without the concept degrades. That is the only point the rule is ever applied — this is a review constraint, not an automated check — and the STANAG half is documentary today: gcscode has no STANAG implementation, and the repo's STANAG reference note is still only planned ([`docs/specs/2026-10-15-architecture-notes.md`](../specs/2026-10-15-architecture-notes.md) lists it under expected next notes). Treat the STANAG claims in this ADR as "as currently understood" until that note lands.

**Scope of the anti-corruption boundary, and what it covers.** The rule binds **adapter-neutral contracts**: asset descriptions today, and any future adapter-neutral port (live state, commands) when it lands. It does not retroactively bind `SitlExports`, which predates it — `telemetry.mode` carrying `'GUIDED'` is grandfathered debt, and the live-state port is its owner.

The boundary has a partial mechanical test: protocol _identifiers_ (`MAV_TYPE_*`, message names) should appear only inside adapter packages. That half is grep-able, with caveats — a bare grep today also hits legitimate non-adapter uses (a mavlink2rest URL in a shell test fixture, a doc comment in `extension-flight-overlay`, and every `@gcscode/extension-mavlink` import once the roadmapped rename lands), so any lint rule must be scoped to enum values and message names rather than the substring. The harder half is **values**: protocol vocabulary flowing through fields typed `string`, which is what already leaks today via mode names and which no identifier grep can see. The rule that covers it is a type rule, not a symbol rule: a field of an adapter-neutral contract must not be typed `string` where its values are protocol-derived — such values need a gcscode-side union, or they stay in the adapter. No check is in place for either half.

**Identity is carved out of that rule, explicitly.** `localId`, `sourceId` and `key` (Decision 4) are protocol-derived strings and stay strings. They are exempt because they carry no vocabulary: they are opaque tokens for equality and keying, never terms a consumer interprets. The carve-out is what makes the rule coherent rather than self-contradicting, and it is also the rule's weakest seam — an opaque token is opaque only by convention, which is why Decision 4 states the no-parsing rule rather than relying on the type.

### 3. One registry for every kind of asset, and no `kind` field on the description

There is deliberately no `kind: 'drone' | 'radar'` on `AssetDescription`. What kind of thing an asset is follows from what its description contains: an asset whose airframe is a flying kind flies; one with `{ kind: 'none' }` does not; one with a video stream has a camera.

**The principle that separates this from Decision 1's `kind` tags**, since the same word appears on both sides: a `kind` discriminates a **capability value** — a closed, bounded set of variants that exhaustiveness-checking can police. The rejected `kind` would classify the **entity** — an open-ended taxonomy that UI would branch on. The in-repo precedent for the accepted half is `ControlIcon = { kind: 'lucide' … } | { kind: 'svg' … }` in `packages/extension-map`, which nobody considers a vendor trap. (And the original trap is combinatorial — vendor × model × firmware — so a bounded `kind: 'drone' | 'radar'` is a weaker version of it, not an identical one. The objection stands on where UI logic ends up, not on equivalence of severity.)

Both rejected shapes put entity classification back in front of consumers. A `kind` field invites `if (asset.kind === 'drone')`. Per-kind registries (vehicles, radars, docks) move the same branch to the lookup call, multiply the registration API per asset family, and make "show me everything connected" a join.

**Membership.** A registry entry means **this asset is present now, as asserted by the source that registered it** — not "gcscode has heard of this asset". Entries appear when a source registers them and disappear when that source removes them or is disposed. The presence signal itself belongs to the adapter (for MAVLink, heartbeat liveness); the registry holds no liveness model of its own, and a consumer rendering "connected assets" is reading presence-as-asserted-by-adapters. What counts as an asset at all is the adapter's judgment: it registers what it can attribute to something the operator monitors or commands. A ground station the operator monitors is such a thing, and registers with `{ kind: 'none' }` — that is the case the positive non-flight assertion exists for. The operator's own GCS client is not, and neither is a bridge's own identity; both heartbeat like anything else on a shared MAVLink link. v0 does not make that distinction: its adapter registers every system it sees, so the operator's own tooling appears in the registry today. The wart is live rather than hypothetical, which means the trigger to sharpen the rule is not "the first adapter that registers a non-asset" — that has already happened — but the first consumer that must show an operator only real assets, i.e. when operator-facing asset UI replaces the v0 scaffold.

**Duplicate registration replaces.** Re-registering an id that a source already holds replaces the stored description in place, preserving position, and returns a fresh `Disposable`; the superseded `Disposable` becomes inert (implementations guard with a registration token, so disposing a stale handle cannot remove a live asset). This inverts the repo's existing convention — `MapApi.registerControl` and `registerConfiguration` both throw on duplicate ids — and the inversion is deliberate: those registries are populated from `activate()`, where a duplicate is a programmer error worth failing fast on. This one is populated from inbound protocol traffic, where a duplicate is a runtime condition (a reconnect, a re-asserted fact) and a synchronous throw would land inside a WebSocket message handler. Replace is also what makes "re-register to update" a workable substitute for an `update()` method.

**Prior art, precisely.** No surveyed system shards its entity registry by entity class: MAVLink, Matter, Home Assistant and entity-component systems each keep one heterogeneous collection keyed by identity, with capabilities or components attached to the entries. Several of them _do_ carry a per-entry type field — `HEARTBEAT` carries `MAV_TYPE`, Home Assistant entities are keyed by domain (`light.`, `camera.`), Matter endpoints carry device types — so the prior art supports the single-collection shape and does **not** support the no-classification half. That half rests on gcscode's own argument above, not on precedent. Entity-component systems query by component set over indexed archetypes, which is the indexed-query capability this ADR defers.

VS Code is a weaker analogy than it first appears and is cited here only for what it supports: it shards registries by _feature_ (completion, hover, formatting) with a selector as a per-registration filter, never one registry per language — i.e. it shards by capability, not by entity class. It has no extension-populated flat entity registry. Its actual precedents for extension-populated entity collections are per-source handles (`tests.createTestController`, `scm.createSourceControl`), which is what Decision 4 adopts.

### 4. Identity: one namespace per source, opaque composite ids

Identity is the part other code keys on hardest, so it is a decision here rather than a comment on a code sample.

**A source claims a namespace; assets are identified within it.** An adapter instance — concretely, one link — asks the registry for a source handle and registers its assets through it. The handle is a `Disposable`; disposing it removes every asset registered through it.

```ts
export interface AssetsApi {
  /**
   * Claim a namespace for one source of assets — typically one adapter instance / one link.
   * `sourceId` must be unique in the registry; a second claim on a live id throws.
   * `label` is the source's operator-facing name ("SITL", "Radio 1").
   */
  createSource(sourceId: string, label: string): AssetSource;
  /** Every asset currently registered, across every source. */
  getAssets(): readonly RegisteredAsset[];
}

export interface AssetSource extends Disposable {
  readonly sourceId: string;
  registerAsset(description: AssetDescription): Disposable;
}

export interface RegisteredAsset extends AssetDescription {
  /** Which source asserted this asset — stamped by the registry from the claiming
   *  source's id, not supplied per registration. A comparison token, never displayed. */
  readonly sourceId: string;
  /** The source's operator-facing name. This is what UI renders. */
  readonly sourceLabel: string;
  /** Registry-minted, unique across sources, opaque. Key UI lists on this. */
  readonly key: string;
}
```

Six properties:

- **Uniqueness is per source, so asset collisions are structural impossibilities rather than conventions.** A MAVLink system id is configuration and defaults to 1; two SITL instances, or a SITL beside a real radio, both produce `1`. Scoping `localId` to the source means two links cannot collide, and the registry — not the adapter — mints the globally unique `key`.
- **Source ids are unique too, and a duplicate claim throws.** `createSource` is not idempotent: per-source scoping only holds if sources themselves do not collide, so a claim on an id another _live_ source holds throws synchronously, and the same id becomes claimable again once that source is disposed. That is the opposite of the asset-level replace rule two paragraphs up, and deliberately so: claiming a namespace happens in an adapter's `activate()` or on connection setup, where a duplicate is a programmer error worth failing fast on, while asset registration happens inside a message handler, where it is a runtime condition.
- **Ids are opaque to consumers; the label is what renders.** Parsing, pattern-matching, or persisting `localId`, `sourceId` or `key` is a boundary violation — without that rule, `key.startsWith('mavlink')` reintroduces the vendor branch through the one field designed to cross the boundary, which is Decision 3's objection to a `kind` field arriving through identity instead. `sourceId` is a comparison token for grouping and filtering by equality, not a display string; `sourceLabel` is what a consumer puts on screen, which is why the label is a required argument rather than an optional nicety. UI lists key on `key`.
- **Ids are not stable across reconnect.** A system id is a reassignable wire address, not a durable identity: a vehicle that returns with a different id is a different asset, and anything a future live-state port associated with the old one is orphaned. Durable identity (a serial number, a tail number, an operator-assigned name) is a separate concept, deferred.
- **The hierarchy question stays open, and this shape is why.** The id's composition inside a source is the adapter's choice, so an adapter that later needs to express components can extend its own local scheme (a gimbal as `1.154`, say) without changing the public shape, and a future `partOf` reference or nested components remain additive. What this ADR does _not_ do is decide whether a gimbal is an asset, a component of one, or both — see Known limitations.

- **A handle does not outlive the registry, and nothing survives the service's teardown.** When the registry extension deactivates, every source is disposed and the registry is emptied; re-enabling it starts empty. A handle an adapter still holds across that transition is inert — `registerAsset` on it is a no-op returning an already-disposed `Disposable`, and `dispose()` is a no-op — rather than throwing, because an adapter would otherwise throw inside a message handler. An adapter therefore re-resolves the service and re-claims its source rather than trusting a cached handle; how it detects staleness is the v0 spec's concern. This is the service-specific answer ADR-0012's mechanics ask each service to give: for a registry of facts other extensions assert, surviving state would resurrect assets whose asserting adapter may be long gone, so this registry deliberately does not inherit `mapApi`'s survive-enable/disable posture.

Removal follows from the same shape: the source that registered an asset removes it (via the registration's `Disposable`), or disposes itself and takes its whole namespace with it. No consumer can remove another source's asset.

## Consequences

**Positive.**

- **UI is keyed by description content.** A renderer asks "does this asset have a flying airframe?", so a new asset type (radar, ground station, dock) needs no new registry, no new lookup, and no new branch in consumer code.
- **New vendors cost an adapter, not a refactor** — provided two-source expressibility is actually applied, since a vocabulary shaped around MAVLink is the failure this buys protection against.
- **Collisions, ownership and removal are answered by one structural choice.** Per-source namespaces make duplicate keys impossible, make "who may remove this" unambiguous, and give a disconnecting link a single disposal point.
- **The awkward cases are cheap to handle and cheap to audit**, by two different mechanisms rather than one. An exhaustive `Record` over `Airframe['kind']` covers the _asserted_ cases — including `none` and `unknown` — and a missing arm is a compile error at the map's definition site. Absence is not among them: `Airframe['kind']` does not include `undefined`, so "nothing was asserted" is a separate check that the optional type forces only where a consumer dereferences. Three facts, two mechanisms, and neither is compelled — see Decision 1 on what the compiler does and does not enforce.

**Negative.**

- **Every vocabulary addition costs a translation in every adapter**, and rises with the number of adapters.
- **Every vocabulary addition is also a break for exhaustive consumers.** Adding `{ kind: 'helicopter' }` breaks every exhaustive `Record` — benign while everything is `workspace:*` and compile-time, which is exactly the posture ADR-0005 records as temporary. The alternative (consumers fall through to a default, producers supply a display fallback) trades that forcing function away; this ADR keeps the forcing function and names the cost.
- **"Is this a drone?" is answered indirectly**, and in v0's single-field vocabulary it is barely answered at all: every non-flying asset this ADR cites as motivation — radar, ground station, dock — is mutually indistinguishable until a second capability lands. The content-over-classification claim is therefore _asserted_ in v0 and validated only when the first non-airframe capability ships. The first non-flying asset must land together with a capability that distinguishes it, or it will force a vocabulary decision mid-iteration.
- **Filtering replaces querying.** With one registry and no `kind`, "list every drone" is a filter over description content. Cheap at today's scale, since descriptions change rarely and a `$derived` filter recomputes rarely.
- **Source handles add one concept to the API** that a single-link deployment does not need, plus a label every adapter must supply and a keying rule (`key` for lists, `sourceLabel` for display) that consumers must not shortcut by parsing ids.
- **The two-source rule has no automated check**, its STANAG half is documentary, and the value half of the anti-corruption boundary is not grep-able at all.

## Known limitations

- **Hierarchy is undecided.** Whether a gimbal or a camera is an asset, a component of an asset, or both is open. MAVLink's model is system → components, each component emitting its own `HEARTBEAT` with its own `MAV_TYPE`; STANAG 4586's Levels of Interoperability separate control of the payload (LOI 3) from control of the air vehicle (LOI 4), so separate control authority over payload and airframe is a modelled requirement rather than a quirk; Home Assistant splits devices from the entities you actually control. Decision 4's per-source ids foreclose none of them. _Trigger:_ the first command to an asset, or the first per-component capability — whichever arrives first. (Components and capabilities extending `AssetDescription` is the same event seen from the vocabulary side; the two are one deferral, not two.)
- **No provenance.** A description carries no record of which adapter asserted which _fact_. Source identity answers "which link registered this asset", not "where did this field come from", and merging one asset seen by two sources is undefined. _Trigger:_ a second source for the same fact, such as a model catalog.
- **`unknown` carries two facts.** An unrecognized protocol value and a recognized-but-unexpressible one (helicopter) both land as `{ kind: 'unknown' }`, and those have different audiences: version skew between adapter and protocol versus a gap in gcscode's vocabulary. _Trigger:_ the first consumer that needs to tell them apart — a per-airframe map icon is the likely first, since it must choose between drawing a generic marker and drawing nothing — or the first adapter-side diagnostic surface.
- **No durable identity.** Ids are per-session wire addresses (Decision 4). Nothing yet expresses "this is the same airframe we flew yesterday". _Trigger:_ the first feature that spans sessions — flight logs, per-vehicle settings, or an operator-assigned name.
- **Live state is a separate contract.** What an asset _is_ and what it is _doing now_ are different questions linked by identity. This ADR covers descriptions only; Decision 2's rule binds the live-state port when it lands, and until then telemetry consumers keep reading the adapter. Whether `SitlExports` is then deprecated or kept indefinitely is the live-state iteration's call. _Trigger:_ that iteration. It is not on `docs/roadmap.md` today; ADR-0012's Follow-ups add the entry.
- **No change event.** `getAssets()` is a reactive read and nothing more. `host.configuration` ships both reactive reads and `onDidChangeConfiguration`, and documents which consumers need the event — a webview consumer cannot observe Svelte reactivity across a `postMessage` boundary. The asset port will need the same pair. _Trigger:_ the first consumer that cannot observe reactive reads, which the webview wing makes concrete.
- **Only first-party code can widen the vocabulary.** `Airframe` lives in the registry's own package (per ADR-0012's rule), so an adapter that needs a kind the vocabulary lacks cannot add one without a PR against first-party code — a third-party adapter's only in-vocabulary option is `{ kind: 'unknown' }`. That is the intended posture while every extension is in-tree, and it is a real constraint rather than an oversight: the alternative (extensible kinds, or adapter-supplied display strings) would give up the exhaustiveness the vocabulary exists to provide. _Trigger:_ the first third-party adapter.
- **No indexed queries.** Enumerate-and-filter is the only access pattern. _Trigger:_ the first multi-vehicle or swarm view, or the first consumer filtering over more than a handful of assets per frame.

## Alternatives considered

- **Reuse `MAV_TYPE` as the internal vocabulary.** Rejected: it mixes airframes with things that do not fly (ground stations, gimbals, cameras, rovers, boats), it is protocol-specific, and it would make MAVLink the model every other standard translates into — the opposite of two-source expressibility.
- **A `kind: 'drone' | 'radar'` discriminator on `AssetDescription`.** Rejected per Decision 3: it puts entity classification in front of consumers, and it would be load-bearing in UI code within one iteration of being added.
- **Per-kind registries** (one for vehicles, one for radars, one for docks). Rejected: moves the branch to the lookup site, multiplies the registration API, and makes "show me everything connected" a join across registries.
- **Bare string unions** (`type Airframe = 'multirotor' | 'fixed-wing' | …`). Rejected: no room for parameters (rotor count, gimbal axis limits) without breaking every consumer comparison.
- **A flat registry with adapter-minted global ids** (`registerAsset({ id: 'mavlink:1' })`, no source handles). Rejected in favour of Decision 4: it needs uniqueness, ownership and removal to be upheld by convention rather than structure, it collides the moment two links exist, and the protocol prefix inside the id is an invitation to branch on. It remains the smaller API, and if source handles prove to be ceremony, this is what to fall back to.
- **Absence as the non-flight assertion** (`airframe?: Airframe` with no `none`). Rejected per Decision 1: absence is also what a dropped `undefined`, an older adapter, or a partial description produces, and the failure mode is a silent wrong icon rather than an error.
- **Default-fallback consumers instead of exhaustive `Record`s** (consumers handle known kinds and fall through; producers supply a display fallback). Rejected for now: it would make vocabulary growth non-breaking, at the cost of the compile-time forcing function that gets awkward cases handled at all. Revisit alongside versioned cross-extension contracts.
- **Defer the vocabulary; let each consumer read its adapter directly** (today's posture for telemetry). Rejected: that is the trap. Three consumers already read `SitlExports.telemetry`, and each new vendor would multiply that coupling.

## Follow-ups

- The asset abstraction v0 spec implements the first slice (`Airframe` including `none`, `AssetDescription`, `AssetsApi` with source handles) and records v0's accepted simplifications. It also **owns the propagation**: the cross-cutting deferrals above (hierarchy, provenance, durable identity, indexed queries, and the protocol-identifier lint rule) land in [`docs/out-of-scope.md`](../out-of-scope.md) with their triggers, and the roadmap gains the asset-abstraction entry that its existing "after v0" reference currently dangles against. None of those entries exist yet.
- [ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md) decides where the registry lives. These vocabulary types ship in that package, per its rule.
- [`docs/vs-code-alignment.md`](../vs-code-alignment.md) gains three rows: an **Alignments** row for per-source handles on an extension-populated entity collection (`tests.createTestController` / `scm.createSourceControl`), a **Divergences** row for one flat heterogeneous registry where VS Code shards by capability, and a **Divergences** row for the `create*` verb itself — every other gcscode contribution surface is `register*`, and `createSource` follows VS Code's factory naming for handle-returning APIs instead. The "registry organized by what assets have" claim is not an alignment with VS Code and should not be recorded as one.
- **Propagation ownership, stated once so the two ADRs do not both claim it:** ADR-0012's Follow-ups own every `docs/roadmap.md` entry (the v0 iteration, the activation-containment iteration, the live-state contract). This ADR's v0 spec owns the `docs/out-of-scope.md` deferrals listed above, and the `bundled-extensions.ts` ordering comment the v0 iteration adds for the assets-before-adapter constraint.
- A lint rule for the anti-corruption boundary needs Decision 2's scope to be written against: enum values and message names only, excluding package names, URLs and prose, and with the value half acknowledged as out of its reach.
- The first non-flying asset should land with a capability that distinguishes it from other non-flying assets (see Consequences).

## References

- Gamma, Helm, Johnson, Vlissides. _Design Patterns_ (1994), "Adapter"; Cockburn, "Hexagonal Architecture" (2005); Evans, _Domain-Driven Design_ (2003), "Anti-Corruption Layer" — the patterns behind adapters and the anti-corruption boundary, surveyed in [`docs/architecture/2026-10-15-ports-and-adapters.md`](../architecture/2026-10-15-ports-and-adapters.md).
- QGroundControl developer guide, "Plugin Architecture" — firmware plugins as the answer to firmware-keyed branching.
- MAVLink: `HEARTBEAT` (`type` / `MAV_TYPE`, `system_id`, `component_id`), Camera Protocol v2, Gimbal Protocol v2, Component Metadata.
- STANAG 4586 (AEP-84): Vehicle Specific Module as the adapter role; Levels of Interoperability 1–5, with LOI 3 (payload control) and LOI 4 (air vehicle control) as separate grants. Cited as currently understood; the repo's reference note is still planned.
- Home Assistant (devices versus entities, with per-entity domains and device classes); Matter (endpoints carrying device types alongside their clusters, per its Device Library specification); entity-component systems (entities as identity, components as attached data, queried by component set). Surveyed as prior art for one heterogeneous collection keyed by identity, and cited as currently understood — none is implemented or tested against here.
- VS Code API: `tests.createTestController`, `scm.createSourceControl` (per-source handles owning their own entity collections); `languages.register*Provider` with `DocumentSelector` (capability-sharded registries with a per-registration filter).
