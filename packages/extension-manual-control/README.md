# @gcscode/extension-manual-control

The **Radio input** view: the raw input of the radio the station process has open, the same as [`tools/radio-probe`](../../tools/radio-probe/README.md) prints in a terminal. A table of the axes with their values and a bar from the middle, a numbered grid of the buttons with the pressed ones highlighted and listed by number, and the input events in the last second.

The **Controls** view, next to it: the same input through the radio's profile (see [`tools/radio-probe`](../../tools/radio-probe/README.md#mapped-what-each-input-means)). Each axis control by name with its percent and a bar, from the middle for roll, pitch, yaw and aux 1 to 4, from the left for throttle; each on/off control as on, off or not mapped; each switch's position, or `unknown` until the station has seen it; the axis or buttons each comes from; and the inputs no control reads. When no profile matches the radio it says so, with what the radio reports. It is a view of its own so the Radio input view, and its smoke test, stay as they were.

Both views only listen. They send nothing to the station, the radio or any vehicle, and opening or closing one changes nothing for the station or its other pages. The station is [`packages/mavlink-station`](../mavlink-station/README.md); start it with `pnpm --filter mavlink-station start`.

While either has no input it says why in one line: connecting, no station at the address (it tries again every 2 seconds), a station with another protocol version, or a station with no radio open. Three seconds with no message from the station count as the station being gone, even if the socket has not closed.

## The setting

`gcscode.manual-control.stationUrl` is the station's WebSocket. The default is `ws://127.0.0.1:8091/ws`. It is read once, when the extension activates, so a change takes effect after a reload; change it from the browser's devtools as described in [Operator UX in v1](../extension-api/README.md#operator-ux-in-v1).

## Where things are

- `src/station-protocol.ts`: the station's messages, protocol version 1, and their parsing. Anything that is not exactly one of them is ignored.
- `src/radio-input-state.svelte.ts`: the connection, one socket at a time, and the newest input.
- `src/radio-format.ts`: what the view shows, as plain values.
- `src/radio-input-view.svelte`: the Radio input view.
- `src/controls-format.ts`: what the Controls view shows, as plain values.
- `src/controls-view.svelte`: the Controls view. Each view opens its own connection to the station.
