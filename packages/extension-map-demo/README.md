# @gcscode/extension-map-demo

Throwaway scaffold demonstrating maplibre integration + the consumer-side cross-extension pattern. Reads SITL telemetry via `host.extensions.getExtension<SitlExports>('gcscode.sitl')` and renders a drone marker on a maplibre map. Camera tracks the marker.

The real Map iteration (roadmap "Coming → Map") replaces this once it lands. Don't depend on the demo for anything; the package will be removed.

## Contributions

- **View** — `gcscode.map-demo.main`, renders a 400px-tall maplibre canvas with a drone marker.

## Cross-extension dependency

- **`@gcscode/extension-sitl`** — type-only. Imports `SitlExports` via `import type`. Runtime lookup is via `host.extensions.getExtension('gcscode.sitl')` — no runtime coupling.

## Tile source

`https://tiles.openfreemap.org/styles/positron` — OpenFreeMap's monochrome "positron" vector style. Free, no API key, permitted for development and production. Operator-friendly: monochrome cartography doesn't compete visually with markers. The real Map iteration may pick a different style (e.g., `liberty` for full-color, or a self-hosted source if cost / latency / offline-use becomes a concern).

(An earlier draft used `https://demotiles.maplibre.org/style.json` — maplibre's own dev fallback with countries-only detail. At city-level zoom that style renders an empty canvas because no features intersect the viewport. OpenFreeMap has actual streets, buildings, and labels.)

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
