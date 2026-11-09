# @gcscode/extension-mavlink

The MAVLink extension: live vehicle telemetry over MAVLink, through a mavlink2rest WebSocket bridge. It is developed against ArduPilot SITL ([`tools/sitl`](../../tools/sitl/README.md)) and nothing in it is specific to the simulator, though it names flight modes from ArduCopter's table.

Formerly `@gcscode/extension-sitl`, with the id `gcscode.sitl` ([ADR-0014](../../docs/decisions/ADR-0014-protocols-as-languages.md)). At startup the host moves what it saved under the old id to the new one; see `previousIds` in `packages/shell/src/extension-host/bundled-extensions.ts`.

Connects to `ws://localhost:8088/v1/ws/mavlink`, subscribes to `HEARTBEAT`, `GLOBAL_POSITION_INT`, `ATTITUDE`, `VFR_HUD`, and `SYS_STATUS`, and folds incoming messages into a reactive `$state` store.

## Contributions

- **View** — `gcscode.mavlink.location`, renders live telemetry.
- **Command** — `gcscode.mavlink.getLocation`, returns `{lat, lng, alt}` or `null` if no fix yet, and logs it.
- **Keybinding** — `Alt+Shift+L` → `gcscode.mavlink.getLocation`.

## Cross-extension exports

Exports `MavlinkExports = { telemetry: Readonly<TelemetryState> }`. Consumers read live telemetry via `host.extensions.getExtension<MavlinkExports>('gcscode.mavlink')?.exports.telemetry`. The `telemetry` field is a Svelte `$state` proxy — reads in `$derived` / template contexts auto-track. See [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md).

`@gcscode/extension-vehicle-status` is the canonical consumer.

## Lifecycle

`deactivate()` closes the WebSocket and resets the telemetry store. First consumer of `Extension.deactivate?()`.
