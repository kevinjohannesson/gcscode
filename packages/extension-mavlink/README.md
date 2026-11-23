# @gcscode/extension-mavlink

The MAVLink extension: live vehicle telemetry over MAVLink, through a mavlink2rest WebSocket bridge. It is developed against ArduPilot SITL ([`tools/sitl`](../../tools/sitl/README.md)) and nothing in it is specific to the simulator, though it names flight modes from ArduCopter's table.

Formerly `@gcscode/extension-sitl`, with the id `gcscode.sitl` ([ADR-0014](../../docs/decisions/ADR-0014-protocols-as-languages.md)). At startup the host moves what it saved under the old id to the new one; see `previousIds` in `packages/shell/src/extension-host/bundled-extensions.ts`.

Connects to `ws://localhost:8088/v1/ws/mavlink`, subscribes to `HEARTBEAT`, `GLOBAL_POSITION_INT`, `ATTITUDE`, `VFR_HUD`, `SYS_STATUS` and `HOME_POSITION`, and folds incoming messages into a reactive `$state` store. That store holds one vehicle: with several, each vehicle's frame overwrites the last.

## Contributions

- **View** — `gcscode.mavlink.location`, renders live telemetry.
- **View** — `gcscode.mavlink.mapInput`, **Map input**: a read-only proof view of what the map is fed. It keeps the frames the telemetry store merges apart by MAVLink system id and lists, per vehicle, the latest position, heading (from `GLOBAL_POSITION_INT`) and home (from `HOME_POSITION`), how long ago each was received and last changed, and the system, component and message it came from. A vehicle that goes quiet keeps its row and its ages keep growing. A line above the rows names the system whose position the merged store, and so the map, holds now. The map's own home marker is a fixed point in the flight overlay, not any vehicle's `HOME_POSITION`.
- **Command** — `gcscode.mavlink.getLocation`, returns `{lat, lng, alt}` or `null` if no fix yet, and logs it.
- **Keybinding** — `Alt+Shift+L` → `gcscode.mavlink.getLocation`.

## Cross-extension exports

Exports `MavlinkExports = { telemetry: Readonly<TelemetryState> }`. Consumers read live telemetry via `host.extensions.getExtension<MavlinkExports>('gcscode.mavlink')?.exports.telemetry`. The `telemetry` field is a Svelte `$state` proxy — reads in `$derived` / template contexts auto-track. See [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md).

`@gcscode/extension-vehicle-status` is the canonical consumer.

## Lifecycle

`deactivate()` closes the WebSocket and resets the telemetry store. First consumer of `Extension.deactivate?()`.
