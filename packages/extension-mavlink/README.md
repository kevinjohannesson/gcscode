# @gcscode/extension-mavlink

The MAVLink extension: live vehicle telemetry over MAVLink, through a mavlink2rest WebSocket bridge. It is developed against ArduPilot SITL ([`tools/sitl`](../../tools/sitl/README.md)) and nothing in it is specific to the simulator, though it names flight modes from ArduCopter's table.

Formerly `@gcscode/extension-sitl`, with the id `gcscode.sitl` ([ADR-0014](../../docs/decisions/ADR-0014-protocols-as-languages.md)). At startup the host moves what it saved under the old id to the new one; see `previousIds` in `packages/shell/src/extension-host/bundled-extensions.ts`.

Connects to `ws://localhost:8088/v1/ws/mavlink`, subscribes to `HEARTBEAT`, `GLOBAL_POSITION_INT`, `ATTITUDE`, `VFR_HUD`, `SYS_STATUS` and `HOME_POSITION`, and folds incoming messages into a reactive `$state` store. That store holds one vehicle: with several, each vehicle's frame overwrites the last.

## Contributions

- **View** — `gcscode.mavlink.location`, renders live telemetry.
- **View** — `gcscode.mavlink.mapInput`, **Map input**: a read-only proof view of what the map is fed. It keeps the frames the telemetry store merges apart by MAVLink system id and lists, per vehicle, the latest position, heading (from `GLOBAL_POSITION_INT`) and home (from `HOME_POSITION`), how long ago each was received and last changed, and the system, component and message it came from. A vehicle that goes quiet keeps its row and its ages keep growing. ArduPilot sends `HOME_POSITION` only when home is set, so once per vehicle the extension reads mavlink2rest's stored copy of it (`GET …/v1/mavlink/vehicles/<system>/components/<component>/messages/HOME_POSITION`, at the address of the configured WebSocket) and marks that home as the bridge's stored copy. It is a read from the bridge, never a request to the vehicle. A line above the rows names the system whose position the merged store, and so the map, holds now. The map's own home marker is a fixed point in the flight overlay, not any vehicle's `HOME_POSITION`.
- **View** — `gcscode.mavlink.linkState`, **Link state**, below.
- **Command** — `gcscode.mavlink.getLocation`, returns `{lat, lng, alt}` or `null` if no fix yet, and logs it.
- **Keybinding** — `Alt+Shift+L` → `gcscode.mavlink.getLocation`.

## The Link state view

**Link state** is a read-only view for checking the link rather than flying on it. It shows whether the mavlink2rest bridge is up, connecting or down and for how long, whether the station process is running and for how long, and for each system ID heard on it (with its `MAV_TYPE`) how long ago its last heartbeat arrived. A vehicle that stops shows its age growing while the others stay under a second; a system never drops out of the list.

For the bridge it reads the extension's one mavlink2rest WebSocket (`src/link-state.svelte.ts` holds the state, fed from `index.ts`).

**The station.** The station process (`packages/mavlink-station`, [ADR-0016](../../docs/decisions/ADR-0016-one-station-process.md)) is this extension's native half, so the extension owns its address, the setting `gcscode.mavlink.stationUrl` (default `ws://127.0.0.1:8091/ws`; a change takes effect at once, and the Link state view follows it), and the session to it, which `activate()` starts and its subscriptions stop (`src/station-link.svelte.ts`). The view shows `station: running` once the station says hello in the page's protocol and while it keeps sending, which it does at least once a second; `not running` when nothing answers or it has been silent for 3 s; and `not usable` when it speaks another protocol. It retries every 2 s. The session only listens: protocol 1 has nothing for a page to send. `@gcscode/extension-manual-control`'s Radio input view opens a connection of its own, to the same setting's address, read when that view opens; which page code may reach the station is open in ADR-0016. gcscode does not reconnect after the bridge drops yet, so once the bridge shows as down it stays down, the view says so, and the ages keep growing until the page is reloaded.

## Cross-extension exports

Exports `MavlinkExports = { telemetry: Readonly<TelemetryState>; stationProtocol: number }`. Consumers read live telemetry via `host.extensions.getExtension<MavlinkExports>('gcscode.mavlink')?.exports.telemetry`.

`stationProtocol` is the station protocol the page speaks, and its only copy on the page: `STATION_PROTOCOL` in `src/station-link.svelte.ts`. Other extensions that read the station, such as `@gcscode/extension-manual-control`, check its hello against this instead of keeping their own number. `src/station-protocol.test.ts` reads the station's `PROTOCOL` in `packages/mavlink-station/src/snapshot.rs` and fails when the two differ, so a protocol bump changes those two lines and no view or view test. The `telemetry` field is a Svelte `$state` proxy — reads in `$derived` / template contexts auto-track. See [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md).

`@gcscode/extension-vehicle-status` is the canonical consumer.

## Lifecycle

`deactivate()` closes the WebSocket and resets the telemetry store. First consumer of `Extension.deactivate?()`.
