# Vehicle status owns its contract

Vehicle status defines what it shows about each vehicle, protocol extensions answer for their own vehicles, and the operator sees a small attention list: worst vehicle first, each with a level and a reason. It is the first contract under [ADR-0014](../decisions/ADR-0014-protocols-as-languages.md), so the map's contract and every later one will copy its shape.

Decisions are marked _(Owner.)_ or _(Controller.)_; the controller is the session that brainstormed this with the owner on 2026-11-19.

## Context

Today `@gcscode/extension-vehicle-status` is one footer line, `MAVLink: <mode> <lat>, <lng> <battery>%`, read straight from `MavlinkExports.telemetry` (`packages/extension-vehicle-status/src/vehicle-status-item.svelte`). It shows one vehicle and not whether it is armed.

That telemetry is one module-level store in `packages/extension-mavlink/src/telemetry-store.svelte.ts`. `applyMessage` reads only the message, never its header, so every MAVLink system and component writes over the others: mode and armed state, and position, attitude and battery too. The flight overlay and the map demo read the same store.

ADR-0014 Decision 2 says each feature owns its contract and protocols fill it in, that vehicle status's contract comes first, and that a feature "asks about one asset key at a time; only that key's source answers". The roadmap entry "Vehicle status owns its contract" adds the sender-identity fix.

The owner's research (`gcs-conflict-lessons-2026-11` and `gcs-human-factors-safety-2026-11`, kept outside this repo) shaped what the glance must carry:

- **Which vehicle.** Commands and alerts bound to the wrong vehicle caused at least one accident, and EASA's draft HMI memo (CM-HF-001) asks for a clear indication of which aircraft is meant.
- **Mode, and changes to it.** Mode changes the crew could not see or hear recur in investigated accidents, including a 2024 ArduPilot and Mission Planner case.
- **A level in green, amber or red,** ranked by urgency.
- **The link,** because link loss often does not appear as a warning at all.
- **Battery,** the largest single cause in UK small-drone loss-of-control reports.
- **A queue, not copies:** with several vehicles per operator, the view should rank who needs a human.

## Goals

1. **Vehicle status publishes its contract** as a service extension ([ADR-0012](../decisions/ADR-0012-service-extensions-vs-host-namespaces.md)): the vocabulary types from its entry point, and an API through which a protocol extension registers a status provider for its own source. _(Owner: "answer when asked".)_
2. **Each vehicle's status is facts plus a level.** The facts are a display name, the mode as the protocol's own text, whether the vehicle is armed, and its battery percentage. The level is one of three (green, amber, red) with a short reason in the protocol's own words. The link shows through the level and its reason ("link lost 12 s") rather than as a field of its own, so the contract carries no field that nothing shows. _(Owner: facts + level. Armed, and the link as level and reason: Controller.)_ Actions such as "return home" are not in this contract.
3. **The MAVLink extension answers for MAVLink vehicles,** one per system id, keeping state per system. It takes mode and armed state only from the autopilot's own HEARTBEAT (`autopilot` other than `MAV_AUTOPILOT_INVALID`), which fixes the sender-identity defect for vehicle status.
4. **The level follows the vehicle's own judgment** where the vehicle reports one, and gcscode judges only what the vehicle cannot report about itself. _(Owner: "the vehicle's own".)_ In ArduPilot terms:

   | Signal                                                                                   | Amber | Red                       |
   | ---------------------------------------------------------------------------------------- | ----- | ------------------------- |
   | `BATTERY_STATUS.charge_state`, set from the vehicle's battery failsafe parameters        | `LOW` | `CRITICAL`                |
   | `HEARTBEAT.system_status`; ArduCopter reports `CRITICAL` when any failsafe has triggered | —     | `CRITICAL` or `EMERGENCY` |
   | Time since that vehicle's last autopilot HEARTBEAT, measured by gcscode                  | 3 s   | 10 s                      |

   The highest level wins, with its reason. The 3 s and 10 s are _(Controller.)_ defaults; 3 s mirrors the owner's work GCS, whose light needed a ping under 3 s. A disarmed vehicle whose link goes quiet stays amber: it cannot fall, and a red that never matters teaches operators to ignore red, as the research's nuisance-failsafe cases show. _(Controller.)_

5. **The operator sees an attention list in a corner of the map:** vehicles worst first, shrinking to one line when all are green. A row shows the level, name, mode, an armed marker and the battery percentage, and an amber or red row adds its reason. It uses the map's existing `registerControl`, as the flight overlay registers into the map. _(Owner: mockup C, then "map corner + footer". Row contents: Controller.)_
6. **The footer keeps one line: the worst vehicle,** with its level, name, mode, battery and reason, plus how many others are amber and green. A red still shows when the map is hidden behind a maximized panel. _(Owner.)_
7. **A mode change flashes,** in both places, with the previous mode and how long ago it changed. gcscode sends no mode commands yet, so every change is un-commanded from its point of view and every change flashes. _(Controller.)_ The provider keeps the history, so the contract in the first PR already carries the previous mode and when it changed. A change is a mode that differs from the last one heard from that vehicle, including one first heard after the link returns, since a failsafe may have switched it while the link was quiet. The first mode heard from a vehicle is not a change. _(Controller.)_

## Non-goals

- **Actions** ("return home", "locate"), and the guards and per-vehicle binding the research asks of commands. They come in a later contract.
- **A floating surface outside the map.** Parked: see the propagation sections.
- **Lost-link behaviour** ("if the link drops now, this vehicle will …"), sound on alerts or mode changes, and which vehicle the operator commands. gcscode has no commands yet.
- **The flight overlay's and the map demo's reads** of the shared store. They keep the mix-up until the map gets its contract.
- **ADR-0014's other follow-ups:** `airframe` leaving `extension-assets`, never-reissued keys, and the `mavlink` import rule.
- **Position in vehicle status.** The map shows where vehicles are; latitude and longitude leave the footer. _(Controller.)_
- **Running several SITL vehicles** from `pnpm dev:sitl`.

## Approaches

|                                   | How it works                                                                                                                                                   | Trade-off                                                                                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Answer when asked** (chosen) | Vehicle status lets each protocol register one provider for its source id. For each asset it asks that asset's source once and gets a live status object back. | The first provider pattern in gcscode. Vehicle status stores nothing of its own, and one source cannot answer for another's vehicles. Matches ADR-0014's wording and VS Code's providers. |
| B. Push updates                   | A protocol claims a slot and writes each vehicle's status in as messages arrive, like `AssetsApi.createSource`.                                                | Follows an existing pattern, but vehicle status holds copies that must be rewritten at telemetry rate, which the map's future contract would inherit.                                     |
| Dropped                           | Vehicle status reads MAVLink's exports with a shared type.                                                                                                     | That is today's design, which ADR-0014 replaces and the planned lint rule forbids.                                                                                                        |

## Design

**The contract** lives in `@gcscode/extension-vehicle-status`'s entry point: a `VehicleStatus` type with the facts, level and reason of Goal 2; a status provider type; and a `VehicleStatusApi` whose `registerStatusProvider(sourceId, provider)` returns a `Disposable`. One provider per source id; a second registration on a live id throws, as `createSource` does. A provider is asked per asset and answers with a reactive object that stays current, so nothing polls, or with nothing for an asset that is not a vehicle. MAVLink declines a system that has never sent an autopilot HEARTBEAT, such as another ground station or an ADS-B receiver, which would otherwise sit red at the top of the list forever. _(Controller.)_

**Which vehicles exist** comes from `AssetsApi.getAssets()`. Vehicle status routes each asset to the provider registered for its `sourceId` and lists the assets that have a status. An asset whose source has no provider shows its name with no level.

**A source's own state.** A provider may also report its source's state as a level and reason, such as "no connection to mavlink2rest". Vehicle status shows that line when the source has no vehicles, so "can't hear anything" never reads as "no vehicles". _(Controller.)_

**The asset key reaches its source.** `AssetSource.registerAsset` returns a `Disposable` today, and the MAVLink adapter tracks vehicles by system id only, so it never holds the key the registry minted. The source must learn each asset's key, the smallest change being that `registerAsset` returns it with the disposable.

**MAVLink** keeps a status per system id, adds `BATTERY_STATUS` to its mavlink2rest filter, and registers its provider. The shared telemetry store stays as it is for its other readers.

**Activation order.** MAVLink needs vehicle status's API to register, and vehicle status needs the map's to place its list, while `bundledExtensions` has vehicle status before the map. The asset adapter's lazy claim on first use is the precedent; the builder picks lazy registration or a new order and records why in the entry's comment.

**Left to the builder:** exact type and member names; how a vehicle is named (the protocol supplies it; camera-sim already calls MAVLink system 1 `drone-1`); which map corner; the flash's look and length; the footer's wording with no vehicles.

## VS Code alignment

| Area                  | Aligned                                                                                                                                                                                          | Diverges, and why                                                                                                                                                                                                            | Deferred                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Provider registration | `languages.register*Provider`: a feature asks, the registered provider for that document answers, and registering returns a `Disposable`. Here the source id plays the document selector's part. | VS Code's registries are host namespaces. This one is a service extension, because vehicles are a domain concern (ADR-0012).                                                                                                 | —                                                                                |
| Answer shape          | —                                                                                                                                                                                                | VS Code providers answer each request afresh (`provideHover` returns a result per call). Here the provider answers once with a live object, because status changes continuously and Svelte's reactivity carries the updates. | —                                                                                |
| Several providers     | —                                                                                                                                                                                                | VS Code merges results from several providers for one document. Here one source has one provider.                                                                                                                            | Merging, until a vehicle is reached through two sources (ADR-0014 Consequences). |

## Known unknowns

- **Thresholds.** The 3 s and 10 s link thresholds are defaults, not measurements. Revisit if amber flickers in normal SITL flight.
- **Battery failsafe in SITL.** `charge_state` turns `LOW` only when the vehicle's battery failsafe is configured. The hand check confirms what SITL's defaults report, and the PR body says how to make it go amber.
- **Several vehicles.** `pnpm dev:sitl` runs one vehicle, so ordering and counts are covered by tests with a fake provider, and the hand check covers one real vehicle.
- **Registry re-activation.** Keys restart when Assets re-activates, until the `airframe` follow-up makes them never reissued. The provider must cope with a re-claim, as the asset adapter does today.
- **Disabling MAVLink mid-flight.** Its source is disposed, so its vehicles leave the list instead of turning red. That is the operator's own action and stays as is; revisit if it ever happens by accident.

## Delivery

Two feature PRs, in order:

1. **`feat/vehicle-status-contract`:** the contract, the key reaching its source, MAVLink's per-system provider and levels, and the footer line.
2. **`feat/vehicle-status-attention-list`:** the attention list in the map corner, and the flash in both places.

The roadmap entry is ticked when the second merges.

## `docs/out-of-scope.md` propagation

When the second PR merges, add:

- **A shell-level floating surface.** Extensions can contribute views, status-bar items and, through the map, map-corner controls; nothing floats over whatever view is in front. _Trigger to revisit:_ the attention list must be visible while the map is not the operator's main view, or a second extension needs an overlay. Adding it is a platform concern and an ADR first.

## `docs/roadmap.md` propagation

When the second PR merges, tick "Vehicle status owns its contract", and add under Feature extensions → Considering:

- **Vehicle actions contract:** "return home" and "locate" registered per protocol, with guards and per-vehicle binding.
- **Lost-link behaviour per vehicle:** "if the link drops now, this vehicle will …", from the research's link-loss contract.
