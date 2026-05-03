# @gcscode/extension-map-demo

Throwaway scaffold demonstrating maplibre integration + the consumer-side cross-extension pattern. Reads SITL telemetry via `host.extensions.getExtension<SitlExports>('gcscode.sitl')` and renders a drone marker on a maplibre map. Camera tracks the marker.

The real Map iteration (roadmap "Coming → Map") replaces this once it lands. Don't depend on the demo for anything; the package will be removed.

## Contributions

- **View** — `gcscode.map-demo.main`, renders a 400px-tall maplibre canvas with a drone marker.

## Cross-extension dependency

- **`@gcscode/extension-sitl`** — type-only. Imports `SitlExports` via `import type`. Runtime lookup is via `host.extensions.getExtension('gcscode.sitl')` — no runtime coupling.

## Tile source

`https://demotiles.maplibre.org/style.json` — maplibre's official demo vector tiles. No API key required. Permitted for development / demos. Not suitable for production-tier use; the real Map iteration picks a production tile source.

## Behavior

- SITL not registered or disabled: no marker; camera stays at the initial fallback (Canberra, zoom 13).
- SITL active, no fix yet: no marker; camera unchanged.
- SITL active with `lat`/`lng`: marker placed at `[lng, lat]`; camera centered on the same coordinates instantly. Marker and camera update on every telemetry tick (~5 Hz from GLOBAL_POSITION_INT).
- User pan / rotation disabled. Wheel zoom, double-click zoom, pinch zoom (touch) stay enabled.

## Lifecycle

`deactivate()` clears the module-level `host` reference so subsequent `getSitlExports()` calls (e.g. during a re-enable race) return `undefined`. The maplibre `Map` instance is owned by the view component and disposed in its `onDestroy`.

## See also

- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries (cross-extension exports)
- [ADR-0007](../../docs/decisions/ADR-0007-extension-manifest.md) — extension manifest
- [Spec 2026-05-03-map-demo](../../docs/specs/2026-05-03-map-demo.md) — this iteration
