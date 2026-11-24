# The map owns its contract

The map draws one symbol per vehicle, each from that vehicle's own data, through a contract it publishes and protocol extensions fill in. It copies the shape of the [vehicle status contract](2026-11-19-vehicle-status-contract.md), takes over `airframe` and the vehicle symbol from the flight overlay, and fixes the rule for who gets a click on the map before anything takes one.

Decisions are marked _(Owner.)_ or _(Controller.)_. The owner set the scope on 2026-11-24 (roadmap M2, the Map lane's GCS-62 and GCS-63) and called the work largely mechanical; every other decision here is _(Controller.)_, taken by the session that wrote this spec, and open to the owner in review.

## Context

The map shows a single drone. `packages/extension-mavlink-flight-overlay/src/layers/drone-icon-layer.svelte` draws one DOM marker from `MavlinkExports.telemetry`, the module-level store in `packages/extension-mavlink/src/telemetry-store.svelte.ts` that every MAVLink system writes into in turn. With `pnpm dev:sitl --vehicles 2` the marker jumps between the two vehicles as their `GLOBAL_POSITION_INT` frames alternate. The Map input view (GCS-14, PR #71) makes this visible: it keeps the same frames apart per system id and names the system whose frame the merged store holds, which is the vehicle the map draws at that moment.

The heading line and the recenter command read the same store. The home marker and the range circle are hardcoded (`packages/extension-mavlink-flight-overlay/src/flight-overlay-config.ts`). `MapApi` (`packages/extension-map/src/map-api.svelte.ts`) offers layers, controls and the camera, and no input surface.

What is already decided:

- [ADR-0014](../decisions/ADR-0014-protocols-as-languages.md) Decision 2: each feature owns its contract and protocols fill it in, one asset key at a time. Decision 3: "what a generic contract comes to cover moves there, as the overlay's vehicle symbol will once the map draws symbols". Decision 4: `airframe` leaves `extension-assets` "for the map's contract".
- The vehicle status contract spec fixed the provider pattern this contract copies (Approach A, "answer when asked"), MAVLink's per-system state taken only from each system's autopilot component (its Goal 3), and MAVLink's provider clock (its Design).
- Roadmap M2 asks this spec to end the flight overlay's reads of the merged store, take over `airframe`, and decide who gets a click on the map, since N2, N4, N5 and N11 all take clicks.
- The steady core's map criteria, from the owner's "Steady core: definition and acceptance criteria" (kept outside this repo): **P1**, a vehicle marker matches telemetry within one rendered frame of the state change, heading within 2°, measured by a probe on the map's GeoJSON source against live state; **P3**, an item updated by id moves in place; **P6**, a stale vehicle looks stale per **S1**, within 0.5 s of its stream's limit, position 2 s; **P7**, no leaked layers or markers across disable and enable.

## Goals

1. **The map publishes a vehicle symbol contract** as a port of its own service extension ([ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)): the vocabulary types from `@gcscode/extension-map`'s entry point, and `MapApi.registerSymbolProvider(sourceId, provider)`, returning a `Disposable`. One provider per source id; a second registration on a live id throws, as `registerStatusProvider` and `createSource` do. _(Owner: the map's contract. Shape: Controller, copying vehicle status.)_
2. **A symbol is position, heading, airframe, armed state and the age of its position.** Position is latitude and longitude. Heading is degrees true, or absent when the vehicle does not report one. Airframe uses the five words `extension-assets` has today (`multirotor`, `fixed-wing`, `vtol`, `none`, `unknown`). Armed is a boolean. The age is the time gcscode received the position, so the map can judge staleness against its own limit (Goal 6). Altitude, mode, battery and a name are not in it: the map shows none of them, and the contract carries no field that nothing shows. _(Controller.)_
3. **The map draws every symbol itself,** one per asset whose provider gives one, from one GeoJSON source whose feature id is the asset key, in a layer the map owns and paints above every registered layer. The GeoJSON source is what P1's probe reads, and the key as feature id is what P3 needs. The symbol's shape follows the airframe; armed keeps today's look (filled green when armed, grey outline when not). A provider whose symbol has no position draws nothing for that vehicle. _(Controller.)_
4. **MAVLink answers for MAVLink vehicles,** one per system id, from that system's autopilot component only, as the vehicle status contract's Goal 3 takes status: position and heading from its `GLOBAL_POSITION_INT`, airframe from its `HEARTBEAT.type`, armed from its `HEARTBEAT.base_mode`. A `hdg` of `UINT16_MAX` means heading unknown, not 655.35°. A system that has never sent an autopilot HEARTBEAT, such as another ground station, has no symbol. _(Controller.)_ `GLOBAL_POSITION_INT` is parsed in one place, the per-system tracker behind the Map input view (`packages/extension-mavlink/src/vehicle-inputs.svelte.ts`), and the telemetry store reads that parse instead of its own (GCS-14's deferred finding).
5. **The flight overlay stops reading the merged store.** Its drone icon leaves: the map draws the symbol. The heading line, the home marker and the range circle stay in the overlay, a `mavlink`-named add-on that may read the MAVLink extension's exports (ADR-0014 Decision 3), and are drawn per vehicle from a per-system export the MAVLink extension adds beside `telemetry`. Home comes from each vehicle's `HOME_POSITION`, as the Map input view reads it, instead of the hardcoded `homeLocation`; a vehicle with no home yet has no home marker and no range circle. _(Controller.)_
6. **A stale symbol looks stale** (GCS-63, P6). The map greys a symbol whose position is older than 2 s, S1's position limit, within 0.5 s of crossing it, and shows it live again on the next fresh position. The map runs one clock for this, pushed to its `subscriptions`, since nothing arrives to re-render a vehicle that went quiet. A stale symbol stays drawn where it was last heard: the map never times a vehicle out (`docs/out-of-scope.md`, "Asset liveness"). _(Controller.)_
7. **Recenter moves to the map** with the symbol, as "Map: Show All Vehicles": it fits the camera to every drawn symbol, and with one symbol centres on it at the current zoom; with none it does nothing and says so in the command's result. Once N2 brings a selection, the selected vehicle is the natural target; that is N2's call. _(Controller.)_
8. **One rule for clicks on the map,** fixed now and built by its first consumer (Click rule). _(Owner: M2 decides it. The rule: Controller.)_

## Non-goals

- **Selection, colour and callsign** (roadmap N2). Symbols carry no name or colour of their own until N2 decides where identity lives. The click rule below leaves selection its place.
- **Building the input surface.** This spec fixes the rule; the first extension that takes a click builds the API (Click rule).
- **Any other map item** (missions, fences, traffic, points of interest), layer ordering beyond the symbol layer's place on top, and tile failure (GCS-64, P5).
- **Removing `airframe` from `extension-assets`.** Its roadmap entry, "`airframe` leaves `extension-assets`", removes it once the map's contract carries it; this spec only adds it here.
- **The map demo.** `@gcscode/extension-map-demo` still reads the merged store. It is being retired on its own; until then it keeps the mix-up.
- **Video, actions, alerts,** and anything that writes to a vehicle.

## Approaches

|                                   | How it works                                                                                       | Trade-off                                                                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Answer when asked** (chosen) | The map asks each asset's source once and gets a live object back, exactly as vehicle status does. | One pattern for every feature contract, which ADR-0014 expects every later contract to copy. The map stores nothing of its own beyond what it draws.                                       |
| B. The overlay draws per vehicle  | The flight overlay reads a per-system MAVLink export and draws one marker per system. No contract. | The smallest change that passes P1, but the symbol stays in a MAVLink add-on, which ADR-0014 Decision 3 says moves to the generic contract, and `airframe` has nowhere to go (Decision 4). |
| C. Push symbols into the map      | A protocol claims a slot on the map and writes each vehicle's symbol as messages arrive.           | The vehicle status spec rejected this shape (its Approach B): the map would hold copies rewritten at telemetry rate.                                                                       |

## Design

**The contract** sits in `@gcscode/extension-map`'s entry point beside `MapApi`: a `VehicleSymbol` type with Goal 2's fields, a symbol provider type, and `registerSymbolProvider`. A provider is asked once per asset, with that asset's `RegisteredAsset`, and answers with a reactive object that stays current; its symbol is absent while the asset is not a vehicle and appears when it becomes one. The map asks again only for a key new to it or when a source's provider changes, and keeps nothing for a key that has left `getAssets()`, since keys are still reissued. The provider finds its system by `localId`, as vehicle status's provider does. All of this is the vehicle status contract's Design, applied to the map.

**Which vehicles exist** comes from `AssetsApi.getAssets()`, read lazily by the map's view, the read direction ADR-0012 lets resolve per use. An asset whose source has no provider is not drawn: a symbol needs a position, which only a provider has. With the Assets service absent, the map shows a one-line notice in a corner, so an empty map never reads as "no vehicles". _(Controller.)_

**When a provider throws,** the map reads each source's answers inside a guard of its own, draws that source's other vehicles as far as it can, and shows a one-line notice naming the source by the label it registered with, since under [ADR-0011](../decisions/ADR-0011-asset-vocabulary-and-registry.md) a `sourceId` never renders. A throw never breaks the map view. _(Controller.)_

**MAVLink's provider** registers on the provider clock that the vehicle status contract's Design gives the MAVLink extension, not in `activate()`: until it holds a registration, the clock looks up the map's exports on each tick and registers when it finds them. So the map gets its symbols whether it activates at boot, later or after a failed activation, and no activation-time edge forms between the two extensions. The registration sits behind the provider's disposed guard and is owned by the provider, which disposes it with itself. Whichever of this spec's first PR and vehicle status's first PR lands first brings the clock; the other reuses it. _(Controller.)_

**Across the map's re-enable.** Symbol providers live in the same module-level `mapApi` as layers and controls, which outlives the map's disable and re-enable; re-enabled, the map asks the providers already registered. `MapApi`'s doc comment states that every registration, layers, controls and providers, survives the map's own disable and re-enable, the statement vehicle status's spec asks the map to make (PR #60 EA-17). This spec's first PR makes it, if vehicle status's second PR has not. The symbol layer and its GeoJSON source are created by the map view on each mount and removed on unmount, so 100 disable and enable cycles leave no layer behind (P7). _(Controller.)_

**The flight overlay's per-vehicle reads** go through a new read-only export, the per-system tracker's records, typed `Readonly` as `telemetry` is. The overlay keeps resolving the map eagerly in `activate()` as it does today, so it still fires no new `docs/out-of-scope.md` trigger: it is the one eager registrant the rows already name. _(Controller.)_

### Click rule

N2 selects by clicking a vehicle, N4 adds Go To and mission editing, N5 points a camera and N11 sets a position fix by clicking the map. A stray click that reaches the wrong one of these commands a vehicle, so the map decides who gets each click, and exactly one receiver gets it. _(Controller.)_

1. **The map owns pointer input on its canvas.** An extension does not attach its own click handlers to the MapLibre instance it reaches through the `gcscode.map.maplibre` context; it receives clicks only through the surface below. Nothing enforces this in code, as nothing enforces the context key; the map's README states it.
2. **A map tool takes a click only while the operator has turned it on.** A tool is a named contribution, such as "Go to point" or "Set position fix", that the operator starts explicitly from a control or a command. At most one tool is active: starting one ends the other. While a tool is active the map shows its name and a way out, and Escape ends it. The map hands the active tool the clicked point and the asset key of the symbol under it, if any; what the tool does then, including the confirmation N4 requires, is the tool's.
3. **With no tool active, a click on a vehicle symbol selects that vehicle** once N2 brings selection, and does nothing before. A click on empty map, or on another extension's item, does nothing. Panning and zooming are never a click.

So a click never commands a vehicle unless the operator has just chosen a tool that does so, and the map always shows which tool that is. Hover and drag are left to the first consumer that needs them.

**Left to the builder:** exact type and member names; the symbol's shapes per airframe (SITL flies only copters); the stale look; the notices' wording and corner; how the tracker's records are exported.

## VS Code alignment

| Area                     | Aligned                                                                                               | Diverges, and why                                                                                                                                                                                                                                                                                                                                   | Deferred                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Provider registration    | `languages.register*Provider`, as in the vehicle status contract.                                     | Same divergence as vehicle status: the registry is a service extension's, not the host's (ADR-0012).                                                                                                                                                                                                                                                | —                                                                                                                                                         |
| Answer shape             | —                                                                                                     | Same as vehicle status: one live object per asset instead of `FileDecorationProvider`'s ask-again-on-change, because a position changes continuously.                                                                                                                                                                                               | The change event, under the ledger's existing Deferrals row "A change event on an extension-populated registry".                                          |
| Who draws the symbol     | VS Code's editor renders what decoration providers return; a provider never paints the editor itself. | —                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                                                                         |
| Input on a shared canvas | —                                                                                                     | VS Code lets every extension observe editor input (`onDidChangeTextEditorSelection`, hover and code-lens providers all answer at once). Here one receiver gets each click, chosen by an explicitly started tool, because on a GCS map a click can command a vehicle. The cost: two extensions cannot both react to one click, which VS Code allows. | Hover and drag, and any shared, non-exclusive click observer: until an extension needs to react to clicks it does not own, such as a measurement readout. |

## Known unknowns

- **The 2 s limit** is S1's proposed position limit, not a measurement. A vehicle whose `GLOBAL_POSITION_INT` stream is slower than that greys in normal flight; ArduPilot's default stream rates send it faster. Revisit if a SITL vehicle flickers stale.
- **The Map input view's "drawn now" column.** Once the map draws every vehicle, the view's marker of the system whose frame the merged store holds no longer names the vehicle the map draws. Whether the first PR drops it, keeps it as a record of the merged store, or leaves the view untouched so GCS-14's smoke test still checks GCS-14 alone, waits on the owner's answer to how a rung's proof tool changes when a later rung builds on it, which is being discussed outside this spec. Until that answer, the first PR leaves the view as it is.
- **What a layer gets from the map: raw MapLibre, or `map-gl-svelte`.** Today a registered layer reaches the raw MapLibre `Map` through the `gcscode.map.maplibre` context and drives it imperatively. `libs/map-gl-svelte` is a finished Svelte port of react-maplibre (`Map`, `Source`, `Layer`, `Marker`, `Popup`, controls, camera sync that does not fight gestures) and could underpin the map extension, so that layers declare sources and layers as components instead. That would make the library part of gcscode's public map API, with its versioning and its upstream's shape, where today only MapLibre's is. The owner has not decided. This contract does not depend on the answer: a symbol provider returns data, not a component, and the map draws symbols itself, so either choice leaves Goals 1 to 4 and the click rule as written. The choice belongs to the spec that rebuilds the map's view or its layer API, or to the "Polish the map extensions" work if it takes it up first.
- **Home and range in the contract.** They stay in the MAVLink add-on because no second protocol needs them. Revisit when a second protocol's vehicles are drawn, or when N4 or N11 needs a vehicle's home from the map's contract.
- **Shapes other than the copter's** are drawn but never seen in SITL. A unit test with a fake provider covers them.
- **Five vehicles at telemetry rate.** One GeoJSON source updated for every position frame may cost more than one `setData` per animation frame; the builder batches per frame if P1's frame budget needs it. P2's load test is GCS-67's.
- **GCS-14's other deferred findings**, carried by GCS-62: a changed connection URL resets the home lookup but keeps the old rows; a home read from the bridge is timed by the bridge's clock; the comment in `packages/extension-mavlink/src/asset-adapter.ts` does not list `HOME_POSITION`; a failed read of the stored home is not retried until reconnect. The first PR fixes them, since Goal 5 makes the Map input view's home the overlay's home.

## Delivery

Two feature PRs, in order, each on a `claude/` branch labelled `feat`:

1. **GCS-62, each vehicle's symbol from its own data:** the contract, the map's symbol layer, MAVLink's provider and the shared `GLOBAL_POSITION_INT` parse, the overlay's per-vehicle layers with its drone icon removed, "Show All Vehicles", and GCS-14's deferred findings. Done when P1 passes with two SITL vehicles flying apart.
2. **GCS-63, a stale vehicle looks stale:** the map's clock and the stale look. Done when P6 passes.

The click rule waits for its first consumer, N2 or N4, whose spec builds the surface against it. Builds on the vehicle status contract's first PR for MAVLink's provider clock, or brings that clock itself if it lands first (Design).

## `docs/roadmap.md` propagation

This spec's PR adds the entry roadmap M2 asks for, under Feature extensions → Coming, and points M2's Contains at it. When the second feature PR merges, tick it.

## `docs/out-of-scope.md` propagation

When the first feature PR merges, add under Extension machinery:

- **A map input surface.** The map fixes who gets a click (one receiver: the active tool, else selection on a symbol, else nothing) but exposes no API for it. _Trigger to revisit:_ the first extension that takes a click on the map, N2's selection or N4's editing; it builds the surface to the rule in [`specs/2026-11-24-map-contract.md`](#click-rule).

## `docs/vs-code-alignment.md` propagation

When the first feature PR merges: add this spec to the Source of the "Who owns per-feature provider registries" Divergence and of vehicle status's "Answer shape" Divergence, and add the "Input on a shared canvas" Divergence and its Deferral from the table above.
