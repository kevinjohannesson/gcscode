# @gcscode/extension-sitl

Live ArduPilot SITL telemetry via a mavlink2rest WebSocket bridge.

Connects to `ws://localhost:8088/v1/ws/mavlink`, subscribes to `HEARTBEAT`, `GLOBAL_POSITION_INT`, `ATTITUDE`, `VFR_HUD`, and `SYS_STATUS`, and folds incoming messages into a reactive `$state` store.

## Contributions

- **View** — `gcscode.sitl.location`, renders live telemetry.
- **Command** — `gcscode.sitl.getLocation`, returns `{lat, lng, alt}` or `null` if no fix yet, and logs it.
- **Keybinding** — `Alt+Shift+L` → `gcscode.sitl.getLocation`.

## Cross-extension exports

Exports `SitlExports = { telemetry: Readonly<TelemetryState> }`. Consumers read live telemetry via `host.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry`. The `telemetry` field is a Svelte `$state` proxy — reads in `$derived` / template contexts auto-track. See [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md).

`@gcscode/extension-vehicle-status` is the canonical consumer.

## Lifecycle

`deactivate()` closes the WebSocket and resets the telemetry store. First consumer of `Extension.deactivate?()`.
