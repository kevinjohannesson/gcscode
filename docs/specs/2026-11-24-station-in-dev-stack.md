# The station in the dev stack

**Date:** 2026-11-24
**Status:** Draft

`pnpm dev:sitl` starts the station process too, as a fifth service, and does not restart it. This is the successor to the [dev stack's spec](2026-11-10-dev-stack.md) that [ADR-0015](../decisions/ADR-0015-native-sidecars.md) Decision 7 asks for.

## Context

The station process (`packages/mavlink-station`, [ADR-0016](../decisions/ADR-0016-one-station-process.md)) exists since PR #68. It reads the radio and serves the page on `ws://127.0.0.1:8091/ws`, and it sends nothing to any vehicle. Until now it started by hand, with `pnpm --filter mavlink-station start`, because ADR-0015 Decision 7 keeps a native process out of `pnpm dev:sitl` until a successor to the dev stack's spec adds it, and that successor also settles restarting it.

GCS-29, the owner's ticket, asks for this: its done-when is that the process starts with `pnpm dev:sitl`, reports itself to the page, and sends nothing to any vehicle. The roadmap's row "Native processes in the root scripts and the dev stack" (PR #75 RT-3, RT-7) owes the dev-stack half.

Decisions the ticket makes are marked _(Owner.)_ The rest were taken by the implementing session while the owner was away, are marked _(My call.)_, and are listed for the owner in PR #81.

## Goals

1. `pnpm dev:sitl` starts the station with the other services, and one Ctrl-C stops it with them. _(Owner.)_
2. The launcher builds nothing: a station not built stops the launch with the command that builds it, as the dev stack's spec asks of every service.
3. Restarting the station is settled for this step: it is not restarted.

## Non-goals

- **Restarting the station.** A station that exits stops the stack, like any service. See [Restarting](#restarting).
- **The station reaching the page.** How the page sees it is GCS-29's view work (the Link state view, PR #81), not the launcher's.
- **Rust in the root scripts.** The other half of the roadmap row stays owed: `pnpm test` and the rest still leave Rust out.
- **Building on launch.** The launcher never runs `cargo`.

## Design

### The service

One more entry in the launcher's table, after camera-sim: _(My call.)_

| Service   | Started as                        | Ports checked first | Up when, within        |
| --------- | --------------------------------- | ------------------- | ---------------------- |
| `station` | `packages/mavlink-station/run.sh` | TCP 8091            | TCP 8091 accepts, 10 s |

The launcher prints its address, `Station  ws://127.0.0.1:8091/ws`, with the others once the vehicles are ready to fly. It waits on nothing: the station sends nothing to any vehicle and reads no telemetry yet, so "ready to fly" is unchanged, and its radio side runs with no radio plugged in. Ten seconds is generous for a binary that only initialises SDL and binds a port.

### Setup, not a build

`pnpm --filter mavlink-station run setup` builds the release binary (`cargo build --release`), once and again after the station's code changes. `run.sh` runs that binary. Without one it exits 1 and names the setup command, which the launcher reports as a failed launch, as the dev stack's spec's "Setup not run" asks. A binary older than its source (the station's `src/`, `Cargo.toml`, `Cargo.lock` and `tools/radio-probe/src/`) still runs, with a warning to rebuild: a stale station still works, and the page shows its version. _(My call.)_

The cost: `pnpm dev:sitl` now needs Rust and CMake and one build of a few minutes. It needed neither before. _(Owner, through GCS-29.)_

### Stopping

The launcher's SIGTERM stops the station with status 0. A station that cannot listen on 8091 exits 1 instead of 0 (PR #68 final review, Minor 5), so a failed start never reads as a clean stop. The launcher's port check already names a station holding 8091 before anything starts. _(My call.)_

### Restarting

Not restarted. A station that exits stops the stack, as any service does under the dev stack's spec. A restart would hide a crash, and nothing depends on the station staying up yet: it sends nothing, so a vehicle does not notice it going. ADR-0016 makes restarting the process part of the step that brings the heartbeat; that step decides it, together with what the station keeps across a restart. _(My call.)_ _Trigger:_ the step that first has the station send a heartbeat.

A smoke test that needs the station quiet without stopping the stack freezes it (`pkill -STOP -x gcscode-station`) instead of stopping it.

### One address

The station has one address, the MAVLink extension's setting `gcscode.mavlink.stationUrl`. PR #68's Radio input view kept its own, `gcscode.manual-control.stationUrl`, until the step in which the MAVLink extension first connects ([ADR-0015](../decisions/ADR-0015-native-sidecars.md) Consequences); this is that step, so that setting goes and the Radio input view reads the MAVLink extension's when it opens. It reads it then, not at activation, because activation order is not guaranteed ([ADR-0005](../decisions/ADR-0005-extension-boundaries.md)). The Link state view follows a change at once; the Radio input view the next time it opens. Its connection stays a second, listen-only one: which page code may reach the station is still ADR-0016's open question. _(My call, PR #81 final review.)_

## VS Code alignment

ADR-0015's ledger rows cover the process. This adds one point to its divergence on who starts it: in development, the dev stack starts the station from the same checkout as the page, which is what keeps one protocol version on both sides. No new row for [`docs/vs-code-alignment.md`](../vs-code-alignment.md).

## `docs/out-of-scope.md` propagation

None. Restarting is deferred to the heartbeat step, which ADR-0016 already gives it, and the trigger is recorded above.

## `docs/roadmap.md` propagation

The row "Native processes in the root scripts and the dev stack" keeps only its root-scripts half, and says the dev-stack half shipped with this spec, with restarting left to the heartbeat step.

## Known unknowns

- **The first build on Apple Silicon.** SDL builds from source, and like the probe it has not been built on an Apple Silicon Mac yet.
