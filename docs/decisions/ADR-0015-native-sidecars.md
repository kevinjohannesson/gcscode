# ADR-0015: Native sidecars do the work the browser must never stall

**Date:** 2026-11-22
**Status:** Accepted

## Context

gcscode is a browser app, and it has no backend: it reaches the vehicle through mavlink2rest, a tool. Manual control is the first feature that sends commands rather than displaying data, and its loop must keep time whatever the page is doing. In the browser it cannot: the Gamepad API exists only on the main thread, and the owner's work GCS, which reads its controller there, is unreliable under UI load and in throttled tabs. A page also cannot read USB serial ports reliably, start a process, or keep running once it is closed.

VS Code moves the same kind of work out of its UI process: a language server or a debug adapter runs as a separate process, an extension is its client, and the two speak a protocol over a pipe or a socket.

## Decision

1. **Work that must keep time, or keep going when the page stalls, runs in a native sidecar**: a separate process that ships as part of gcscode. Manual control is the first.
2. **A sidecar acts on its own. The page watches and configures it, and is never on the path of a command to a vehicle.** The page reaches a sidecar over a WebSocket on `127.0.0.1`. The sidecar checks each connection's `Origin`, since any website can open a WebSocket to `localhost`.
3. **An extension is a sidecar's client**, connecting to it as `extension-mavlink` connects to mavlink2rest. A sidecar does a domain job, so per [ADR-0012](ADR-0012-service-extensions-vs-host-namespaces.md) it needs no host capability.
4. **Sidecars are written in Rust**: no garbage collector in a timed loop, one binary to ship, and the crates they need (SDL3 for controllers, `mavlink`, `serialport`) are current. mavlink2rest, already in the dev stack, is Rust too.
5. **A sidecar lives in `packages/`**, as gcscode's fourth kind of package beside the shell, the extension API and the extensions. A `package.json` makes `pnpm build`, `pnpm test`, `pnpm check` and `pnpm lint` cover it.
6. **The dev stack starts sidecars.** A page cannot. How an operator's machine starts one is decided when someone other than the owner installs gcscode.

## Consequences

- Building gcscode needs a Rust toolchain, and the repo has a second language that the ESLint boundary rules do not see. A sidecar never imports TypeScript, and the page sees only its protocol.
- Each sidecar's protocol is a contract between two languages, so it carries a version from its first message.
- A sidecar is where a timed loop protects itself from its operating system, such as macOS App Nap. Each platform needs its own measures, and the first sidecar has macOS's only.
- A sidecar owning a vehicle link is a first piece of the backend gcscode does not have. When a second job needs a native process that owns the vehicle link, such as logging or several vehicles, that is the trigger to decide whether a backend absorbs the sidecars.
- The analogy with language servers holds for the process boundary and the protocol, not for who starts the process: a VS Code extension spawns its server, and a gcscode page cannot.
