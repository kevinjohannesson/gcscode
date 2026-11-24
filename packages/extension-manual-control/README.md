# @gcscode/extension-manual-control

The **Radio input** view: the raw input of the radio the station process has open, the same as [`tools/radio-probe`](../../tools/radio-probe/README.md) prints in a terminal. A table of the axes with their values and a bar from the middle, a numbered grid of the buttons with the pressed ones highlighted and listed by number, and the input events in the last second.

The **Controls** view, next to it: the same input through the radio's profile (see [`tools/radio-probe`](../../tools/radio-probe/README.md#mapped-what-each-input-means)). Each axis control by name with its percent and a bar, from the middle for roll, pitch, yaw and aux 1 to 4, from the left for throttle; each on/off control as on, off or not mapped; each switch's position, or `unknown` until the station has seen it; the axis or buttons each comes from; and the inputs no control reads. When no profile matches the radio it says so, with what the radio reports. It is a view of its own so the Radio input view, and its smoke test, stay as they were.

Both views only listen. They send nothing to the station, the radio or any vehicle, and opening or closing one changes nothing for the station or its other pages. The station is [`packages/mavlink-station`](../mavlink-station/README.md). `pnpm dev:sitl` starts it; without SITL, start it alone with `pnpm --filter mavlink-station start`. Either way it needs one build first: `pnpm --filter mavlink-station run setup`.

While either has no input it says why in one line: connecting, no station at the address (it tries again every 2 seconds), a station with another protocol version, or a station with no radio open. Which version to expect is the MAVLink extension's `stationProtocol` export, read when a view opens; without that extension a view says it does not know the protocol, and does not connect. Three seconds with no message from the station count as the station being gone, even if the socket has not closed.

## The station's address

The view connects to `gcscode.mavlink.stationUrl`, the MAVLink extension's setting (default `ws://127.0.0.1:8091/ws`): the station is that extension's native half, so it owns the address ([ADR-0015](../../docs/decisions/ADR-0015-native-sidecars.md) Decision 3), and this extension registers no setting of its own. The view reads it each time it opens, so a change takes effect the next time the view opens or the page reloads; change it from the browser's devtools as described in [Operator UX in v1](../extension-api/README.md#operator-ux-in-v1).

## Where things are

- `src/station-protocol.ts`: the station's messages, as of protocol version 1, and their parsing. Anything that is not exactly one of them is ignored.
- `src/radio-input-state.svelte.ts`: the connection, one socket at a time, and the newest input.
- `src/radio-format.ts`: what the view shows, as plain values.
- `src/radio-input-view.svelte`: the Radio input view.
- `src/controls-format.ts`: what the Controls view shows, as plain values.
- `src/controls-view.svelte`: the Controls view. Each view opens its own connection to the station.
