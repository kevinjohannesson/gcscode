# @gcscode/extension-flight-overlay

First consumer of the `@gcscode/extension-map` contribution API. Registers three layers on the map:

- **Drone marker** — point geometry, position from live SITL telemetry (`gcscode.sitl` exports).
- **Home location** — point geometry, hardcoded coordinates in `flight-overlay-config.ts`.
- **Max-distance circle** — polygon approximation of a geodesic circle around the home location, hardcoded radius.

Layers render no visible DOM themselves; each is a Svelte component that calls maplibre APIs imperatively from `$effect` and cleans up on `onDestroy`.

## Cross-extension dependencies

- **`@gcscode/extension-map`** — type-only. Imports `MapApi` via `import type`. Runtime lookup is via `host.extensions.getExtension<MapApi>('gcscode.map')`. Activation throws if map is not active.
- **`@gcscode/extension-sitl`** — type-only. Imports `SitlExports` via `import type`. Runtime lookup is via `host.extensions.getExtension<SitlExports>('gcscode.sitl')`. SITL absence is handled gracefully (drone marker not rendered).

## Configuration

Hardcoded module-level constants in `flight-overlay-config.ts`:

- `homeLocation: [number, number]` — `[lng, lat]` of the SITL ArduCopter default starting point (Canberra).
- `maxDistanceMeters: number` — geofence circle radius around home (default 200m).

When a settings system lands, these become user-tunable. Until then, edit and recompile.

## Architecture notes

The maplibre `Map` instance is consumed via Svelte context (key `'gcscode.map.maplibre'`). The string is the public contract of `@gcscode/extension-map`; we re-declare it independently rather than runtime-importing from the sibling package (ADR-0005).

Layer components are mounted as children of the map view — when the map extension disables, layer components unmount and their `onDestroy` cleans up maplibre artifacts. When the map re-enables, the registered layers (still in the registry via subscriptions held in flight-overlay's context) re-mount fresh against the new maplibre instance.

## Recenter command + control

`gcscode.flight-overlay.recenter` is a palette-discoverable command (`Flight Overlay: Recenter on Drone`) that writes `map.camera.center` to the live SITL drone position. If SITL has no fix yet, it falls back to `homeLocation` from `flight-overlay-config.ts` so the operator gets a sensible "go back to where the drone should be" result rather than a silent no-op.

The command is also wired to a top-right map control button (crosshair icon) registered via `MapApi.registerControl`. The button and the palette entry route through the same command — either path executes the same recenter logic.

This is the first consumer of `MapApi.registerControl` in gcscode. The control uses the declarative property-bag path (icon + tooltip + `commandId`); the host owns the button rendering.

## See also

- [Spec 2026-05-03-map-and-flight-overlay](../../docs/specs/2026-05-03-map-and-flight-overlay.md) — layer-registration iteration
- [Spec 2026-05-03-map-controls](../../docs/specs/2026-05-03-map-controls.md) — control-registration iteration (this package's recenter button)
- [`@gcscode/extension-map`](../extension-map/README.md) — the contribution API this consumes
- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries
