# ADR-0016: One station process sends everything gcscode sends to vehicles

**Date:** 2026-11-22
**Status:** Proposed

## Context

Until now gcscode has only listened. The page reads telemetry from mavlink2rest and sends nothing to a vehicle, not even a ground station heartbeat. The work ahead sends a lot: a GCS heartbeat, manual control, commands and mission uploads, to one to five vehicles at once.

Three documents answer "where does that sending live" in different ways:

- The roadmap's N1, "Station link: where it lives, who it is" ([`docs/roadmap.md`](../roadmap.md#m3--first-commands-bound-and-guarded)), asks for an ADR on whether a worker or a local process does it, and who owns that code. It already sets one rule: every write to a vehicle leaves through the MAVLink extension, never through an add-on's own connection.
- The native sidecars draft, ADR-0015 on the `adr/native-sidecars` branch, not merged, gives manual control its own native process that sends RC overrides and a heartbeat by itself. It defers a backend until "a second job needs a native process that owns the vehicle link, such as logging or several vehicles".
- The steady core work, not yet written down in any document, aims at one to five vehicles from the start, a GCS heartbeat with no gap over 1.5 s for 8 h (also with the tab hidden), and no command that ever reaches a vehicle it does not name.

The browser cannot carry the heartbeat. Chrome slows the timers of a tab hidden for over five minutes to about once a minute, and ArduPilot's GCS failsafe (Copter's `FS_GCS_ENABLE`, Plane's `FS_GCS_ENABL`, off by default) fires on a missing heartbeat when it is enabled. So the sender has to live outside the page.

Several vehicles is the trigger the sidecars draft names. SITL runs one vehicle today, but nothing sends yet either, so settling on a single sender now costs nothing, and adding a second one later would. If each sending feature brought its own process, gcscode would have several MAVLink identities, several heartbeats and several places that pick a target vehicle. Those are exactly the failures the research ranks worst: a command reaching the wrong aircraft, and a GCS failsafe that fires or fails to fire because of a second heartbeat (HF §5 rows 7 and 8, roadmap PR #61 RT-14).

The owner wants no full backend yet, and wants each step small and proven.

## Decision

1. **One station process sends everything gcscode sends to a vehicle**: the GCS heartbeat, manual control, commands and mission uploads, for every vehicle. Nothing else in gcscode sends, not the page, not a worker, and not an add-on.
2. **The process is the MAVLink extension's native half.** It speaks one protocol and does a domain job, so it belongs to `extension-mavlink` and needs no host capability ([ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md), [ADR-0014](ADR-0014-protocols-as-languages.md) Decision 1). The roadmap's N1 rule stands: another extension that needs to send asks through the MAVLink extension's exports, and the extension passes the request to its process.
3. **The process has one MAVLink identity.** It has one system id and one heartbeat for all vehicles, and it is the only place a target vehicle is chosen. The heartbeat is not addressed to a vehicle. Each command and each manual control frame is.
4. **Manual control is a part of this process, not a process of its own.** The timing guarantees the sidecars draft wants for manual control (its own thread, fixed deadlines, no dependence on the page) apply inside the station process.
5. **It grows one proven step at a time, and is not a backend.** It starts with only what the first sending step needs. Each further job (manual control, commands, missions, reading telemetry, logging) moves in through a step of its own, each with its own spec or plan. It has no server for other clients, no database and no API beyond what the page needs. Telemetry keeps reaching the page through mavlink2rest until a step moves it.
6. **No process, no sending.** When the station process is not running, gcscode sends nothing, and each vehicle's own failsafes apply. When the page cannot reach it, the page says so and sends nothing by itself; it never falls back to sending. What the process keeps sending while no page reaches it is open (Consequences).

How a native process is built (language, packaging, how the page reaches it and how it is started) is the native sidecars draft's subject, not this ADR's. That draft waits for an amendment before it merges, in three places: its first sidecar is this process (its Decision 1); the page is on the path of a command, since commands and mission uploads start there and pass through the MAVLink extension to this process (its Decision 2); and its trigger for a backend is answered by Decision 5 here.

## Consequences

- The roadmap's N1 is answered for where the code lives and who owns it. Still open, each for the step that first sends a heartbeat:
  - which system id the station takes, given that MAVProxy and mavlink2rest in the dev stack already heartbeat as 255, ArduPilot's default `MAV_GCS_SYSID`;
  - when the heartbeat and manual control stop, and what the process keeps across a reload: with the page closed, frozen or hidden, after the MAVLink extension is disabled, and during a page reload. Disabling an extension elsewhere in gcscode ends what it does, but the page can neither start nor stop this process, so without a rule its heartbeat outlives the page, and a vehicle keeps hearing a station nobody watches (PR #62 RT-1, EA-1);
  - what a watch-only station does with its heartbeat (PR #61 RT-14). Decision 3 narrows it: with one heartbeat addressed to no vehicle, a station cannot stop heartbeating toward a vehicle it only watches while it controls another, so a per-vehicle watch-only can come only from each vehicle's GCS ids;
  - how the page names a vehicle to the process: the page knows vehicles by asset keys that only the MAVLink extension's page half resolves (ADR-0014 Decisions 2 and 4), while the process hears vehicles on a link of its own until telemetry moves in (PR #62 RT-4);
  - what happens when two pages connect: each tab is a whole host with its own selection, but there is one station per machine, so two tabs would be two places choosing a standing target, such as manual control's, behind one identity (PR #62 EA-3).

  The roadmap's N13 (manual control off the page) runs in this process.

- The manual control v0 spec on `spec/manual-control-v0` changes: overrides and the heartbeat go out from the station process, and choosing the target vehicle becomes a step of its own instead of "the first autopilot heard". The spec's heartbeat as 255 is the open system id question above, settled before it heartbeats. Open for that spec: whether its Controller panel, which knows no protocol, reaches the process only through the MAVLink extension's page half, and what enforces it (PR #62 RT-5, EA-2).
- One process is one point of failure. If it stops, every vehicle loses this station's heartbeat at once, and each vehicle that has its GCS failsafe enabled and hears no other heartbeat on its GCS id takes over. That is the intended behaviour: a station that cannot hear itself should not keep asserting. Restarting the process is part of the step that brings the heartbeat.
- Isolation moves inside the process. One job stalling must not stall another (video never enters it, and manual control keeps its own thread), and the steps that add jobs prove that. A crash is not covered: a job that takes the process down ends manual control and the heartbeat for every vehicle, which is the cost of Decision 4. Each step that adds a job keeps it from taking the process down; if one cannot, Decision 4 is revisited (PR #62 EA-5).
- Every sending protocol, such as mission upload or parameter writes, is built in the MAVLink extension's process. A MAVLink add-on can read anything, but can send only what the MAVLink extension has built. That is the price of one sender; revisit it when the first sending add-on needs a protocol the MAVLink extension lacks (PR #62 EA-6).
- Decision 5 says what the process is not, but sets no trigger for when it should become a backend. That trigger is open (PR #62 RT-7).
- gcscode gains a second language and a process the page cannot start, as the sidecars draft already accepts.
- VS Code lets any extension start its own language server, and several often serve one language. gcscode diverges on purpose: only this process sends to vehicles, because a vehicle sees each sender as a GCS identity of its own. It also diverges on lifetime: a VS Code language client starts its server and stops it on deactivate, while a page cannot start a process, so the dev stack does, and what the process sends without a page is open above.
