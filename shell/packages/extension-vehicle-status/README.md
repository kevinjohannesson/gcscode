# @gcscode/extension-vehicle-status

First consumer of cross-extension exports. Registers a footer status bar item that summarises live SITL telemetry as a single line:

```
SITL: GUIDED • -35.36°/149.17° • 47%
```

## Contributions

- **Status bar item** — `gcscode.vehicle-status.summary`, left-aligned. Renders a Svelte component that reads `host.getExtension<SitlExports>('gcscode.sitl')?.exports.telemetry` reactively.

## Cross-extension dependencies

- **`@gcscode/extension-sitl`** — type-only. Imports `SitlExports` via `import type`. Runtime lookup is via `host.getExtension('gcscode.sitl')` — no runtime coupling.

## Behavior

- SITL not active: shows `SITL: —`.
- SITL active, WebSocket connecting: shows `SITL: connecting…`.
- SITL active, WebSocket disconnected: shows `SITL: disconnected`.
- SITL active and connected: shows `SITL: <mode>` plus available coordinates and battery percentage joined by `" • "` (space-bullet-space, three characters).

## See also

- ADR-0005 — extension boundaries
- Spec 2026-04-29 — iteration A
