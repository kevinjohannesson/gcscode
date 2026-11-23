# wire-probe

A terminal tool that listens for MAVLink on a UDP port and shows every heartbeat, command and control frame on it, with the sender's system ID and the time since that sender's previous frame of the same message. It only listens: it sends nothing to a vehicle, to MAVProxy or to gcscode.

It is a proof tool: the wire-side record that later steps are measured by, such as a station heartbeat's gaps or which vehicle a command names. It reads the bytes itself, with no MAVLink library, so what it shows is what was on the wire.

## Running it

Needs only Node. From the repo root, with SITL running (`pnpm dev:sitl --vehicles 2`, or `SITL_VEHICLES=2 pnpm --filter sitl start`):

```sh
pnpm --filter wire-probe start
```

or `node probe.mjs` from this folder. Ctrl-C quits. Every SITL vehicle's MAVProxy also sends to UDP 14552 (`tools/sitl/run_sitl.sh`), which is where the probe listens, so it sees every vehicle. Start and stop it at any time: with no probe listening, those frames are dropped and nothing waits for them.

In a terminal it shows a block that redraws 10 times a second:

```text
wire-probe: listening on UDP 127.0.0.1:14552. It sends nothing. Ctrl-C quits.
┌────────┬───────────┬───────────┬───────┬──────────┬─────────────┐
│ system │ component │ message   │ count │ last gap │   last seen │
├────────┼───────────┼───────────┼───────┼──────────┼─────────────┤
│      1 │         1 │ HEARTBEAT │     8 │  1.001 s │ 0.173 s ago │
│      2 │         1 │ HEARTBEAT │     8 │  1.001 s │ 0.133 s ago │
└────────┴───────────┴───────────┴───────┴──────────┴─────────────┘
latest frames, newest last:
    6.829 s  system 1 component 1  HEARTBEAT  gap 1.000 s  type 2 (quadrotor), autopilot 3 (ArduPilot), disarmed
    6.869 s  system 2 component 1  HEARTBEAT  gap 0.999 s  type 2 (quadrotor), autopilot 3 (ArduPilot), disarmed
    7.830 s  system 1 component 1  HEARTBEAT  gap 1.001 s  type 2 (quadrotor), autopilot 3 (ArduPilot), disarmed
    7.870 s  system 2 component 1  HEARTBEAT  gap 1.001 s  type 2 (quadrotor), autopilot 3 (ArduPilot), disarmed
frames in the last second: 218 in all, 2 of them shown
```

- **The table** has a row for each sender (system and component ID) and message. **Last gap** is the time between that sender's last two frames of that message, so two vehicles' heartbeats never share a gap. **Last seen** grows while a sender is quiet.
- **Latest frames** lists the last 10 shown frames, each with its time since the probe started, its gap (`first` for a sender's first), and what it says. A command or control frame also says which system it is sent `to`; system 0 reads `to every system`.
- **Frames in the last second** counts every MAVLink frame that arrived, then the shown ones among them. A busy wire with a quiet table means the probe is reading, and only the shown messages are missing.

When its output goes to a pipe or a file instead of a terminal, the probe prints one plain line per shown frame, with no terminal codes, in the format of the latest frames list.

### Options

```sh
pnpm --filter wire-probe start -- --record run.jsonl --seconds 30
```

- `--record FILE` also saves every shown frame to `FILE`, one JSON object a line, for a test to read.
- `--seconds N` stops it by itself after `N` seconds.
- `--port N` listens on another UDP port.

## What it shows

Six messages, by MAVLink message ID:

| ID  | Message              | Kind      | Names a system in    |
| --- | -------------------- | --------- | -------------------- |
| 0   | HEARTBEAT            | heartbeat | (none: sent to all)  |
| 69  | MANUAL_CONTROL       | control   | `target`             |
| 70  | RC_CHANNELS_OVERRIDE | control   | `target_system`      |
| 75  | COMMAND_INT          | command   | `target_system`      |
| 76  | COMMAND_LONG         | command   | `target_system`      |
| 77  | COMMAND_ACK          | command   | `target_system` (v2) |

It reads MAVLink 1 and 2, signed frames included, and drops a frame of these six whose checksum is wrong. Every other message is counted in the rate line and not shown; its checksum is not checked, since that needs the message's definition.

A recording's lines look like this (`t` and `gap` in seconds, `target` null for a heartbeat):

```json
{
  "t": 1.4951,
  "system": 1,
  "component": 1,
  "message": "HEARTBEAT",
  "kind": "heartbeat",
  "target": null,
  "gap": 1.0004,
  "detail": "type 2 (quadrotor), autopilot 3 (ArduPilot), disarmed"
}
```

`view.mjs` exports `readRecording(text)` and `gaps(records, { system, component, message })`, so a test reads one back in two lines.

## What it sees on SITL

- **Each vehicle heartbeats at 1 Hz under its own system ID**, from component 1: 29 gaps per vehicle over 30 s with two vehicles, from 0.995 s to 1.006 s.
- **A command a station sends through MAVProxy is not seen, its answer is.** MAVProxy passes what one output sends on to the vehicle, never to its other outputs, so a `COMMAND_LONG` sent to UDP 14550 reaches vehicle 1 but not the probe, while the vehicle's `COMMAND_ACK`, `to system 255`, does. The same goes for MAVProxy's and mavlink2rest's own heartbeats as system 255. Seeing what gcscode's station process sends ([ADR-0016](../../docs/decisions/ADR-0016-one-station-process.md)) needs that process to send where the probe can listen, which is for the step that brings it.

## Tests

```sh
pnpm --filter wire-probe test
```

They need no SITL. The frames they read were encoded by pymavlink, MAVLink's reference Python implementation, not by the probe (`fixtures.mjs`), and `probe.test.mjs` runs the probe against two simulated vehicles: UDP sockets that send those frames the way each vehicle's MAVProxy does, and that check nothing comes back.
