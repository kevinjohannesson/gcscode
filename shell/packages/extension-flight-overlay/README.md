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

## See also

- [Spec 2026-05-03-map-and-flight-overlay](../../docs/specs/2026-05-03-map-and-flight-overlay.md) — this iteration
- [`@gcscode/extension-map`](../extension-map/README.md) — the contribution API this consumes
- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries
