# mavlink-station

`gcscode-station`, the station process: a native program that runs next to the gcscode page on the operator's machine. For now it does one thing. It reads an EdgeTX radio, such as the RadioMaster TX16S, and serves the radio's raw input to the page on a local WebSocket. It sends nothing to the radio or to any vehicle.

It is the station process of [ADR-0016](../../docs/decisions/ADR-0016-one-station-process.md): one process, the only thing in gcscode that will send to a vehicle. Where it lives and how it reaches the page, in `packages/` and over a WebSocket on 127.0.0.1, follows ADR-0015, which is still a draft. The radio reading is the one proven in [`tools/radio-probe`](../../tools/radio-probe/README.md), used as a library.

## Running it

Needs Rust and CMake, as for the probe (`brew install cmake`). From the repo root:

```sh
pnpm --filter mavlink-station start
```

The first build compiles SDL and takes a few minutes. Then run `pnpm dev` and open the **Radio input** view (`@gcscode/extension-manual-control`). Ctrl-C stops the station. The page keeps running and says the station is gone, and picks it up again when it is back. Closing the page changes nothing for the station.

`--allow-origin <origin>` (repeatable) adds a page origin besides the dev server's `http://localhost:5173` and `http://127.0.0.1:5173`. `pnpm dev` moves to the next free port when 5173 is taken; the station then refuses the page and prints the `--allow-origin` line that would serve it, and the view says it may have been refused.

## The page protocol, version 0

`ws://127.0.0.1:8091/ws`. It listens on 127.0.0.1 only. A connection whose `Origin` header is not an allowed page origin gets a 403, since any website can open a WebSocket to localhost. A connection without `Origin` is a local program, not a page, and is let in.

The station sends JSON text, and the page sends nothing (anything it sends is ignored):

- First, `{"type":"hello","protocol":0,"station":"0.1.0"}`. A page that sees another `protocol` says the two do not match.
- Then the current input, and the newest input after every change, at most every 20 ms. A page that falls behind skips to the newest; nothing queues up for it. When nothing changes it repeats the input every second, so the page can tell a quiet radio from a dead station.

```json
{
  "type": "input",
  "radio": {
    "name": "TX16SMK3 Joystick",
    "vendorId": 4617,
    "productId": 20308,
    "serial": "0123456789AB",
    "axes": [0, -32768, 32767],
    "buttons": [false, true],
    "hats": []
  },
  "eventsPerSecond": 12
}
```

`radio` is `null` while no radio is open, `serial` is `null` when the radio reports none, and `eventsPerSecond` is `null` until a whole second has passed. The values are SDL's, raw: axes from -32768 to 32767, buttons pressed or not, hats as SDL's bitmask. What they mean is the mapping layer's job, a later rung.

## Tests

```sh
pnpm --filter mavlink-station test:rust
```

Unit tests pin the exact JSON and the origin rule. `tests/page_socket.rs` serves the socket on a real port and checks hello, the input, a change pushed within 300 ms, the one-second repeat, the 403, and that a page leaving or sending something changes nothing for the station. Like the probe, it is not part of `pnpm test` yet.
