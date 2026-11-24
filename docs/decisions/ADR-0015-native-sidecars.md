# ADR-0015: Native processes do the work the browser must never stall

**Date:** 2026-11-22, amended 2026-11-24 to fit [ADR-0016](ADR-0016-one-station-process.md)
**Status:** Proposed

## Context

gcscode is a browser app with no backend: it reaches the vehicle through mavlink2rest, a tool. Manual control is the first feature whose loop must keep time whatever the page is doing. In the browser it cannot: the Gamepad API exists only on the main thread, and the owner's work GCS, which reads its controller there, is unreliable under UI load and in throttled tabs. Chrome slows the timers of a tab hidden for over five minutes to about once a minute. A page also cannot read USB serial ports reliably, start a process, or keep running once it is closed.

VS Code moves the same kind of work out of its UI process: a language server or a debug adapter runs as a separate process, an extension is its client, and the two speak a protocol over a pipe or a socket.

This ADR was first drafted on 2026-11-22 with manual control as a "sidecar" of its own that sent to the vehicle by itself. [ADR-0016](ADR-0016-one-station-process.md), merged since, decides _what_ runs outside the page: one station process, the MAVLink extension's native half, sends everything gcscode sends to vehicles, manual control included. It leaves _how_ a native process is built, packaged, reached and started to this ADR, and names three places where the first draft had to change: its first process, whether the page is on the path of a command, and its trigger for a backend. This version makes those changes. The first native process now exists: `packages/mavlink-station` (PR #68), which reads the radio and serves its raw input to the page.

## Decision

1. **Work that must keep time, or keep going when the page stalls, runs in a native process** that ships as part of gcscode. The station process of ADR-0016 is the first. Whether there is ever a second is ADR-0016's question, not this ADR's: this ADR says only how any native process is built.
2. **Timed loops run inside the process, not in the page.** The page watches and configures them, and a page that stalls, hides or closes never delays a tick. A command the operator gives in the page, such as an arm or a mission upload, does start there and pass through the MAVLink extension to the process (ADR-0016 Decision 2); what the page is never on is the path of a loop that keeps time, such as manual control's frames or the heartbeat.
3. **The page reaches a native process over a WebSocket on `127.0.0.1`.** The process listens on the loopback address only, and refuses a connection whose `Origin` header is not a page origin it serves, since any website can open a WebSocket to `localhost`. A connection without an `Origin` comes from a local program, not a browser, and is let in: a local program running as the operator can already do anything the operator can. Each process's protocol carries a version in its first message, because it is a contract between two languages.
4. **A native process is written in Rust**: no garbage collector in a timed loop, one binary to ship, and the crates it needs (SDL3 for controllers, `mavlink`, `serialport`) are current. mavlink2rest, already in the dev stack, is Rust too.
5. **A native process lives in `packages/`**, as gcscode's fourth kind of package beside the shell, the extension API and the extensions, with a `package.json` whose `start` runs it and whose `test:rust` runs its tests. `pnpm build`, `pnpm test`, `pnpm check` and `pnpm lint` take in Rust packages when CI has a Rust toolchain; until then they do not, so working on the page needs no Rust. Tools in `tools/` that are written in Rust, such as `radio-probe`, follow the same scripts.
6. **The dev stack starts native processes, and the page never does.** Until the dev stack's spec adds one, a process starts with its own `start` script. How an operator's machine starts one is decided when someone other than the owner installs gcscode.

## Consequences

- Building gcscode's native half needs a Rust toolchain and CMake (SDL is built from source), and the repo has a second language that the ESLint boundary rules do not see. A native process never imports TypeScript, and the page sees only its protocol.
- The page's only defence against other websites is the `Origin` check. Anything that runs as the operator is trusted, as it is for every local tool in the dev stack.
- A native process is where a timed loop protects itself from its operating system, such as macOS App Nap. Each platform needs its own measures, and the first process has macOS's only.
- Which extension's page half may connect to the station process, and what enforces it, is ADR-0016's open question (PR #62 RT-5, EA-2). PR #68's Radio input view connects directly while it sends nothing; that question is settled before any page code sends to the process.
- When a native process becomes a backend is ADR-0016's to set (its Decision 5 and the open PR #62 RT-7), so this ADR sets no trigger of its own.
- Two steps are owed: Rust in the root scripts and CI, and the station in `pnpm dev:sitl`, which needs an amendment to the dev stack's spec. Until both land, a developer who changes Rust code runs `test:rust` by hand.
- VS Code alignment: the process boundary and the versioned protocol align with language servers. Who starts the process diverges: a VS Code extension spawns its server and stops it on deactivate, and a gcscode page cannot, so the dev stack does. What a process keeps doing with no page connected is ADR-0016's open question.
