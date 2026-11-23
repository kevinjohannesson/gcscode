# @gcscode/extension-manual-control

The **Radio input** view: the raw input of the radio the station process has open, the same as [`tools/radio-probe`](../../tools/radio-probe/README.md) prints in a terminal. A table of the axes with their values and a bar from the middle, a numbered grid of the buttons with the pressed ones highlighted and listed by number, and the input events in the last second.

It only listens. It sends nothing to the station, the radio or any vehicle, and opening or closing it changes nothing for the station or its other pages. The station is [`packages/mavlink-station`](../mavlink-station/README.md); start it with `pnpm --filter mavlink-station start`.

While it has no input it says why in one line: connecting, no station at the address (it tries again every 2 seconds), a station with another protocol version, or a station with no radio open. Three seconds with no message from the station count as the station being gone, even if the socket has not closed.

## The setting

`gcscode.manual-control.stationUrl` is the station's WebSocket. The default is `ws://127.0.0.1:8091/ws`. It is read once, when the extension activates, so a change takes effect after a reload; change it from the browser's devtools as described in [Operator UX in v1](../extension-api/README.md#operator-ux-in-v1).

## Where things are

- `src/station-protocol.ts`: the station's messages, protocol version 0, and their parsing. Anything that is not exactly one of them is ignored.
- `src/radio-input-state.svelte.ts`: the connection, one socket at a time, and the newest input.
- `src/radio-format.ts`: what the view shows, as plain values.
- `src/radio-input-view.svelte`: the view.
