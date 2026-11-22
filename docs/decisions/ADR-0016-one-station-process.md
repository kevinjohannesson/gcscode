# ADR-0016: One station process sends everything gcscode sends to vehicles

**Date:** 2026-11-22
**Status:** Proposed

## Context

Until now gcscode has only listened. The page reads telemetry from mavlink2rest and sends nothing to a vehicle, not even a ground station heartbeat. The work ahead sends a lot: a GCS heartbeat, manual control, commands and mission uploads, to one to five vehicles at once.

Three documents answer "where does that sending live" in different ways:

- The roadmap's N1, "Station link: where it lives, who it is" ([`docs/roadmap.md`](../roadmap.md#m3--first-commands-bound-and-guarded)), asks for an ADR on whether a worker or a local process does it, and who owns that code. It already sets one rule: every write to a vehicle leaves through the MAVLink extension, never through an add-on's own connection.
- The native sidecars draft, ADR-0015 on the `adr/native-sidecars` branch, not merged, gives manual control its own native process that sends RC overrides and a heartbeat by itself. It defers a backend until "a second job needs a native process that owns the vehicle link, such as logging or several vehicles".
- The steady core work, not yet a spec, asks for one to five vehicles from the start, a GCS heartbeat with no gap over 1.5 s for 8 h (also with the tab hidden), and no command that ever reaches a vehicle it does not name.

The browser cannot carry the heartbeat. Chrome slows the timers of a tab hidden for over five minutes to about once a minute, and ArduPilot's GCS failsafe (`FS_GCS_ENABL`) fires on a missing heartbeat. So the sender has to live outside the page.

Several vehicles is the trigger the sidecars draft names, and it has already fired. If each sending feature brought its own process, gcscode would have several MAVLink identities, several heartbeats and several places that pick a target vehicle. Those are exactly the failures the research ranks worst: a command reaching the wrong aircraft, and a GCS failsafe that fires or fails to fire because of a second heartbeat (HF §5 rows 7 and 8, roadmap PR #61 RT-14).

The owner wants no full backend yet, and wants each step small and proven.

## Decision

1. **One station process sends everything gcscode sends to a vehicle**: the GCS heartbeat, manual control, commands and mission uploads, for every vehicle. Nothing else in gcscode sends, not the page, not a worker, and not an add-on.
2. **The process is the MAVLink extension's native half.** It speaks one protocol and does a domain job, so it belongs to `extension-mavlink` and needs no host capability ([ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md), [ADR-0014](ADR-0014-protocols-as-languages.md) Decision 1). The roadmap's N1 rule stands: another extension that needs to send asks through the MAVLink extension's exports, and the extension passes the request to its process.
3. **The process has one MAVLink identity.** It has one system id and one heartbeat for all vehicles, and it is the only place a target vehicle is chosen. The heartbeat is not addressed to a vehicle. Each command and each manual control frame is.
4. **Manual control is a part of this process, not a process of its own.** The timing guarantees the sidecars draft wants for manual control (its own thread, fixed deadlines, no dependence on the page) apply inside the station process.
5. **It grows one proven step at a time, and is not a backend.** It starts with only what the first sending step needs. Each further job (manual control, commands, missions, reading telemetry, logging) moves in through a step of its own, each with its own spec or plan. It has no server for other clients, no database and no API beyond what the page needs. Telemetry keeps reaching the page through mavlink2rest until a step moves it.
6. **No process, no sending.** When the station process is not running or not reachable, gcscode sends nothing and says so, and each vehicle's own failsafes apply. The page never falls back to sending by itself.

How a native process is built (language, packaging, how the page reaches it and how it is started) is the native sidecars draft's subject, not this ADR's. That draft is to be amended so that its first sidecar is this process.

## Consequences

- The roadmap's N1 is answered for where the code lives and who owns it. Still open for the step that first sends a heartbeat: which system id the station takes, given that MAVProxy and mavlink2rest in the dev stack already heartbeat as 255, ArduPilot's default `MAV_GCS_SYSID`. Also open: what a watch-only station does with its heartbeat (PR #61 RT-14). The roadmap's N13 (manual control off the page) runs in this process.
- The manual control v0 spec on `spec/manual-control-v0` changes: overrides and the heartbeat go out from the station process, and choosing the target vehicle becomes a step of its own instead of "the first autopilot heard".
- The steps that send nothing can start before this ADR merges, such as a terminal tool that prints raw TX16S input, a map view of what the map receives, and a view of stream health.
- One process is one point of failure. If it stops, every vehicle loses the GCS heartbeat at once and each one's GCS failsafe takes over. That is the intended behaviour: a station that cannot hear itself should not keep asserting. Restarting the process is part of the step that brings the heartbeat.
- Isolation moves inside the process. One job stalling must not stall another (video never enters it, and manual control keeps its own thread), and the steps that add jobs prove that.
- gcscode gains a second language and a process the page cannot start, as the sidecars draft already accepts.
- VS Code keeps a language's process work in one language server per language, which its extension starts and talks to. gcscode keeps a protocol's sending in one process per protocol. The difference is who starts it: a page cannot start a process, so the dev stack does.
