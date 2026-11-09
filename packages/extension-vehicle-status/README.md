# @gcscode/extension-vehicle-status

First consumer of cross-extension exports. Registers a footer status bar item that summarises live MAVLink telemetry as a single line:

```
MAVLink: GUIDED • -35.36°/149.17° • 47%
```

## Contributions

- **Status bar item** — `gcscode.vehicle-status.summary`, left-aligned. Renders a Svelte component that reads `host.extensions.getExtension<MavlinkExports>('gcscode.mavlink')?.exports.telemetry` reactively.

## Cross-extension dependencies

- **`@gcscode/extension-mavlink`** — type-only. Imports `MavlinkExports` via `import type`. Runtime lookup is via `host.extensions.getExtension('gcscode.mavlink')` — no runtime coupling.

## Behavior

- MAVLink not active: shows `MAVLink: —`.
- MAVLink active, WebSocket connecting: shows `MAVLink: connecting…`.
- MAVLink active, WebSocket disconnected: shows `MAVLink: disconnected`.
- MAVLink active and connected: shows `MAVLink: <mode>` plus available coordinates and battery percentage joined by `" • "` (space-bullet-space, three characters).

## See also

- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries
- [Spec 2026-04-29-iteration-a-extension-exports](../../docs/specs/2026-04-29-iteration-a-extension-exports.md) — iteration A
