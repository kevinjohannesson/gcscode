# radio-input

A Rust library that reads an EdgeTX radio in USB joystick mode, such as the RadioMaster TX16S MK3, through SDL3, and turns its raw input into named controls by profile. It reads only: nothing here sends to the radio or anywhere else.

Two programs use it: [`tools/radio-probe`](../../tools/radio-probe/README.md), which shows the reading in a terminal and so proves it, and gcscode's station process, [`packages/mavlink-station`](../../packages/mavlink-station/README.md). It lives in `libs/` so the station never depends on a tool: gcscode reaches `tools/` only over the protocols a real system uses ([ADR-0015](../../docs/decisions/ADR-0015-native-sidecars.md), PR #75 RT-8, answered by the owner on 2026-11-24).

## What is in it

- `device`: which joysticks are EdgeTX radios (USB ID `1209:4f54`), and the line that names one when it is found.
- `probe`: `Probe` opens the first EdgeTX radio SDL announces, leaves any other joystick and a second radio alone, and notices the radio leaving and coming back. `values()` reads every axis, button and hat raw.
- `pump`: takes SDL events until a deadline, so a caller redraws or sends on time while a moving stick floods the queue, and counts input events per second.
- `mapping`: radio profiles (TOML), checked against their rules on load, and the `Mapper` that turns raw values into roll, pitch, throttle, yaw, aux 1 to 4, on/off controls and switch positions. What a profile holds and its rules: [the probe's README](../../tools/radio-probe/README.md#mapped-what-each-input-means). The bundled profile is [`profiles/gcscode-adv.toml`](profiles/gcscode-adv.toml).

The caller owns SDL: it initialises it, sets its hints, and passes the joystick subsystem and the events in. So a test, or a replay of a recorded session through an SDL virtual joystick, feeds the same path a real radio does.

## Building

Needs Rust and CMake (`brew install cmake` on macOS), since SDL is built from source and linked statically. On Linux SDL is built without video, so it builds on a headless machine.

## Tests

```sh
pnpm --filter radio-input test:rust
```

or `cargo test` here. They use SDL's virtual joysticks in place of a radio, so they need no hardware.
