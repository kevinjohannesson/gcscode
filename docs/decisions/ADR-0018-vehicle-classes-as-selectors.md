# ADR-0018: Vehicle classes are add-ons the MAVLink extension selects per vehicle

**Date:** 2026-11-24
**Status:** Proposed

## Context

The steady core gcscode is working towards flies one to five vehicles, by mission, by hand, or both: a vehicle flies its waypoints, holds, is flown by hand for a task, and is handed back to fly home. The core's v0 is copter-only. Later classes (fixed-wing, VTOL, ground vehicles) must not mean a rewrite, and copter assumptions must not leak into parts that every class shares.

Most of what the core hardens does not depend on the class: the link, live state and its freshness, the command lifecycle, alert machinery, the map, video, mission upload and per-vehicle identity. A short list of questions does:

- **The safe hold, and what taking over means.** A copter holds in Loiter; a plane cannot hover and circles; a VTOL's answer depends on whether it is hovering or in forward flight; a ground vehicle stops. Centred throttle is a hover for a copter, a cruise speed for a plane and a stop for a rover.
- **Which modes pass the pilot's stick straight through**, so a feature can warn or refuse before entering one. Malloy T150 went from RTL into Stabilize at 2.6% throttle (HF §1.1, §5 row 2).
- **Which commands cannot be undone**, and how force is expressed (HF §5 row 6).
- **What a failsafe does**, so the lost-link behaviour can be shown (HF §5 row 13).
- **Mode names and numbers**, which differ per firmware: ArduCopter's mode 5 is Loiter, ArduPlane's is FBWA.

The human factors report proposes the same split: the core asks each firmware extension to declare these answers (HF §6, "Ask each firmware extension to declare"). Today one answer is hardcoded in the wrong place: `extension-mavlink`'s telemetry store holds ArduCopter's mode names, so a plane's modes would show with a copter's names. The roadmap's N13 plans more of the same, "a per-firmware table the MAVLink extension keeps".

Three things are already decided. [ADR-0014](ADR-0014-protocols-as-languages.md) Decision 2: each feature owns its contract, protocols fill it in, a feature asks about one asset key at a time and only that key's source answers; there is no gcscode-wide dictionary of vehicle facts. Its Decision 3: an add-on built on one protocol's extension carries the protocol's name and may read its exports. Its Decision 4: `extension-assets` keeps identity only. [ADR-0016](ADR-0016-one-station-process.md): only the MAVLink extension's station process sends to vehicles.

VS Code solves the same shape for programming languages. The editor holds no TypeScript or Python core. Each feature is a provider API, such as `languages.registerHoverProvider(selector, provider)`, and a `DocumentSelector` (usually a `languageId`) picks which providers answer for a document. Facts that need no code go in a declarative language configuration (`languages.setLanguageConfiguration`: comments, brackets). If no provider matches, the feature is not offered for that document. A new language is one more extension, and the core does not change.

## Decision

1. **One core; class differences live only in vehicle class add-ons.** No generic feature, and not the MAVLink extension itself, branches on a vehicle's class, firmware or mode numbers. A class is a separate extension: `extension-mavlink-ardupilot-copter` is the first.
2. **Each feature owns the class questions it needs, in its own contract** (ADR-0014 Decision 2). Manual control asks for the safe takeover mode and how sticks map, commands ask which are irreversible, the mode display asks for names and which modes pass raw stick, missions ask how to resume. The questions are written without a class in mind: "the mode to hold in", never "Loiter".
3. **The MAVLink extension stays the source that answers, and selects a class add-on per vehicle.** Its exports gain `registerVehicleClass(selector, vehicleClass)`, returning a `Disposable`. The selector names the HEARTBEAT fields that identify a class, `{ autopilot: 'ardupilot', types: ['quadrotor', 'hexarotor', …] }`, in the extension's own vocabulary rather than raw MAVLink enums. When a feature asks about an asset key, the MAVLink extension finds the one class whose selector matches that vehicle's last heartbeat and answers from it. Facts that need no code (mode names, which modes are raw-stick, the hold mode) are a declarative object, like VS Code's language configuration; behaviour that needs code is a function on the same object.
4. **No match, no answer, no feature.** A vehicle that no class matches, or that two classes match, gets "unavailable" for every class question, never a guess. The features that need those answers say so for that vehicle ("no vehicle class for ArduPlane fixed-wing: manual takeover unavailable"); everything class-neutral (link, position, alerts from the vehicle's own text, missions shown) still works. Two matching classes are also reported as a conflict, since VS Code's selector scoring has no safe equivalent here: a wrong takeover mode is worse than none.
5. **A class add-on only answers.** It sends nothing; every send goes through the station process (ADR-0016) after a feature asks the MAVLink extension.
6. **v0 ships one class, ArduPilot copters.** ArduCopter's mode names move out of the MAVLink extension's telemetry store into it. The steady core's smoke tests run one non-copter SITL vehicle (ArduRover or ArduPlane) through the class-neutral parts and check that its class-specific features show as unavailable rather than wrong.
7. **A class add-on is done when the steady core's reference sortie passes on its own SITL frame**: fly the mission, hold, take over by hand, hand back, fly home. The sortie is written in class-neutral steps for that reason.

## Consequences

- Adding a class is one package and no change to the core or the MAVLink extension. Work grows as classes × features, as protocols × features already does under ADR-0014.
- A mixed station (copters and a rover on one screen) needs nothing extra: each vehicle is matched on its own heartbeat.
- The roadmap's N13 changes: the per-firmware mode table that decides when to warn lives in the class add-on, not in the MAVLink extension. The first manual control step that changes a vehicle's mode (taking over, handing back) waits for the copter add-on, or it hardcodes a copter answer in a generic feature; steps that only read the radio do not.
- Matching on the heartbeat means a vehicle has no class until its first heartbeat, and changes class if its heartbeat does (a VTOL reports the same type in both phases, so its phase is a question for the class, not a second class). A class add-on that is disabled mid-flight makes its vehicles' class features unavailable at once; whether a feature in use, such as manual control, ends or holds when that happens is for the feature's spec.
- Two class add-ons that share code (ArduPilot copter and plane share far more than they differ) cannot import each other at runtime ([ADR-0005](ADR-0005-extension-boundaries.md)). Whether shared ArduPilot code goes in a library or is duplicated is open until a second ArduPilot class exists.
- PX4 is the same pattern with `autopilot: 'px4'`. Another protocol would bring its own source and its own class registry, as ADR-0014 expects.
- Questions written with only copters in view will be copter-shaped. The non-copter SITL in the smoke tests catches some of this, not all: the first real second class will revise some contracts.
- The name "vehicle class" is chosen over "profile", which `libs/radio-input` already uses for a radio's input mapping.
- VS Code alignment. Aligns: providers chosen by a selector, a declarative configuration beside code, a disposable registration, and a feature not offered when nothing matches. Diverges, as already recorded (ledger "Who owns per-feature provider registries"; ADR-0012, ADR-0014): the registry is not the host's but the source extension's, because the selector reads protocol fields only the source sees. Diverges, new: an ambiguous match makes the feature unavailable instead of picking the best-scoring provider, because a GCS cannot fall back to a plausible guess about how a vehicle flies.
