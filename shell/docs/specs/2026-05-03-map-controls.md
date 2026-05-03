# Map controls — first declarative property-bag contribution kind

**Status:** Approved (2026-05-03)

## Context

Follow-on iteration to `2026-05-03-map-and-flight-overlay.md`, which shipped the map extension's `MapApi.registerLayer(component)` surface. Layers are headless — they call maplibre APIs imperatively to render geometry on the map canvas. They don't render visible chrome, and there is no surface today for extensions to render UI on top of the map (zoom buttons, recenter button, layer toggle, etc.). The previous spec deferred this with the trigger "first consumer needing a map control, or operator UX iteration on map chrome" — the operator UX trigger fires now (parallel UI brainstorm in flight, plus flight-overlay's natural recenter-button consumer).

This iteration adds `MapApi.registerControl(...)` as the second contribution surface on the map's cross-extension exports. Functionally it gives extensions a way to render small interactive controls in the map's four corners. Architecturally it does something more interesting: it introduces **the first declarative property-bag contribution kind in gcscode**.

Every contribution kind to date — views, status bar items, map layers — has been a Svelte `Component`. The extension owns the chrome; the host mounts the component into a slot. That's a deliberate divergence from VS Code, recorded in `vs-code-alignment.md` ("View / status-bar contributions" row), and it stays that way for views and status bar items where shape varies widely.

Map controls are different. The shape is constrained — an icon button with a tooltip and a click action. The host owning the chrome means consistent visual treatment for every control regardless of which extension contributed it (operator-UX consistency). And the property-bag-with-`commandId` shape reinforces commands as the integration backbone: any extension can fire a control's action programmatically, and the same command can be bound to a keybinding or palette entry independently.

We extend the divergence by _also_ accepting a Svelte component as an escape hatch — the same control surface accepts either a property bag (declarative, recommended) or a component (full ownership, for shapes that genuinely don't fit a button). This mirrors VS Code's broader pattern where chrome contributions are declarative by default and webviews exist as the full-UI escape hatch. The first consumer (`flight-overlay`'s recenter button) goes through the declarative path.

## Goals

- Extend `@gcscode/extension-map`'s `MapApi` with a single new method: `registerControl(registration): Disposable`.
- Two registration shapes accepted:
  - **`MapControlContribution`** (declarative property bag, recommended): `{ id, position, icon, tooltip, commandId }`. Host renders an icon button; click fires the named command via `host.commands.executeCommand`.
  - **`MapControlComponentRegistration`** (component escape hatch, advanced): `{ id, position, component }`. Host renders the extension's Svelte component into the same slot wrapper. Component reaches the maplibre instance via the existing `'gcscode.map.maplibre'` Svelte context, identical to layers.
- Icon shape: discriminated union `{ kind: 'lucide'; name: string } | { kind: 'svg'; svg: string }`. Lucide names render via `@lucide/svelte` (new dep on `@gcscode/extension-map`); raw SVG renders inline (trust assumption documented).
- Position vocabulary: `'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`. Matches maplibre / mapbox / leaflet conventions.
- Map view renders four absolute-positioned slot containers (one per corner) over the maplibre canvas. Controls registered for a position render in registration order, anchored at the corner.
- First consumer: `@gcscode/extension-flight-overlay` adds:
  - A `gcscode.flight-overlay.recenter` command that jumps the map camera to the live drone position (or the home location if SITL has no fix yet).
  - A declarative recenter control in `'top-right'` whose `commandId` fires that command.
- VS Code alignment ledger gets new rows for: declarative property-bag contribution kind, command-id-as-action pattern, custom-icon-or-curated-name pattern, and divergent rows for discriminated-union icon shape and lucide-as-curated-set choice.
- `out-of-scope.md` propagation: REMOVE the existing "Map UI controls / overlay slots" row (this iteration ships it) and ADD new rows for design tokens / theme system, control hover-state customization, and ordering priority for controls (mirrors the layer / status-bar `priority` deferrals).
- Roadmap propagation: the existing Map line is already ticked; add a sub-bullet under it (or a new line under Feature extensions → Coming) linking this spec.

## Non-goals

- **No selection state.** Still deferred from the map iteration. Trigger unchanged: first consumer that wants click-on-feature semantics.
- **No animated camera (`flyTo` / `easeTo`).** Recenter uses `mapApi.camera.center = [...]` — instant `jumpTo` per the existing camera contract. Unchanged from the map iteration.
- **No design tokens / CSS variable system for extension styling.** Component-path controls render their own visuals; visual mismatch with declarative-path controls is an accepted consequence. Trigger to revisit: webview wing iteration, OR the parallel UI brainstorm landing on a documented design system that wants extension reach. (See `out-of-scope.md` propagation.)
- **No numeric `priority` for control ordering within a position.** Registration order. Mirrors the existing status-bar `priority` and layer-ordering deferral rows. Trigger: third-party wants to insert between two first-party controls.
- **No hover / active state customization on the host-rendered button.** The host renders one button visual style; extensions can't override colors, sizing, drop-shadow, etc. on the declarative path. Trigger: a control needs a different hover state (e.g., destructive action wants red hover) — likely the parallel UI brainstorm pulls this in alongside theme tokens.
- **No `when` clause / visibility gating.** Controls registered via `registerControl` are always visible. Trigger unchanged from the existing `out-of-scope.md` row.
- **No SVG sanitization.** Extension-provided SVG is inserted into the DOM as-is. Safe today because all extensions are first-party and execute in the shell's JS realm anyway (per the existing third-party-sandboxing row in `out-of-scope.md`). When the webview / sandboxing iteration lands, SVG sanitization becomes part of that broader work.
- **No two-step / chord activation on the control itself.** Click fires the command once. Long-press, right-click menus, drag handles — all out.
- **No theme-aware icons.** No `light` / `dark` variants in the icon discriminated union. Single SVG renders against `currentColor`; theme handling, if needed, lives in CSS. Adds non-breakingly later.
- **No raster icon support.** No `{ kind: 'image'; url }` variant today. Trigger: extension wants to use a non-vector logo (e.g., a partner brand mark). The discriminated union extends additively.
- **No ADR.** All decisions extend established patterns — service-style extension contribution surface (per the previous map spec), command-id-as-action (per Phase A2), workspace package boundary (ADR-0001). The "first declarative property-bag contribution kind" framing is a ledger note, not a new architectural decision.

## API surface — `@gcscode/extension-map`

The new types are exported from `@gcscode/extension-map`. Consumers `import type` them per ADR-0005's allowance for type-only sibling imports.

### Types (added to `packages/extension-map/src/map-api.svelte.ts`)

```ts
import type { Component } from 'svelte';

/** The four corner anchor positions on the map canvas. */
export type ControlPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * Discriminated union for a control's icon. Lucide names are resolved via
 * `@lucide/svelte` and rendered by the host. Raw SVG markup is inlined into
 * the host's button slot. The `kind` discriminator scales additively — future
 * variants (e.g. `{ kind: 'image'; url: string }`) extend without overlap risk.
 *
 * SVG markup contract (`kind: 'svg'`):
 * - Must include a `viewBox` attribute (otherwise the SVG has no coordinate
 *   system and may render at 0×0 or 300×150 depending on browser).
 * - Should omit `width` / `height` on the root `<svg>` so the host's slot
 *   sizing wins.
 * - Use `currentColor` for strokes/fills so the host's hover/active state CSS
 *   reaches the icon.
 * - The host inserts the markup as-is (no sanitization). Safe today because
 *   all extensions are first-party; tightens when the webview / sandboxing
 *   iteration lands.
 */
export type ControlIcon = { kind: 'lucide'; name: string } | { kind: 'svg'; svg: string };

/**
 * Declarative property-bag control. Recommended path. The host renders a
 * uniformly-styled icon button. Click fires `commandId` via
 * `host.commands.executeCommand` — fire-and-forget; the host does not surface
 * the command's return value or rejection back to the contributor.
 *
 * The named command must be registered (typically by the same extension) via
 * `host.commands.registerCommand`. Registration order between control and
 * command does not matter — `executeCommand` resolves the command at click
 * time, not at registration time.
 */
export interface MapControlContribution {
  /** Opaque, qualified id, conventionally `<extensionId>.<slug>` (e.g.
   * `'gcscode.flight-overlay.recenter'`). Used internally as the registry key
   * and surfaced in error messages. */
  id: string;
  position: ControlPosition;
  icon: ControlIcon;
  /** Required. Renders as the button's `title` attribute and accessible label.
   * Required (not optional) so accessibility isn't accidentally skipped. */
  tooltip: string;
  /** Command id to execute on click. Resolved at click time via
   * `host.commands.executeCommand(commandId)`. */
  commandId: string;
}

/**
 * Component escape hatch. Use only when the control's shape doesn't fit an
 * icon button — multi-state toggles, layer dropdowns, zoom-level indicators.
 * Prefer the declarative path for buttons (operator-UX consistency).
 *
 * The component renders inside the same host-owned slot wrapper as declarative
 * controls (positioning + spacing chrome), but the component itself owns its
 * visual. It can read the maplibre `Map` instance via the same Svelte context
 * key layers use (`'gcscode.map.maplibre'`).
 */
export interface MapControlComponentRegistration {
  id: string;
  position: ControlPosition;
  component: Component;
}

export type ControlRegistration = MapControlContribution | MapControlComponentRegistration;
```

### `MapApi` widening

```ts
export interface MapApi {
  registerLayer(component: Component): Disposable;
  registerControl(registration: ControlRegistration): Disposable;
  readonly camera: MapCamera;
}
```

Adding a method to the existing `MapApi` interface. Non-breaking for existing consumers (flight-overlay calls `registerLayer` only today). No version bump on `manifest.version` — `0.0.0` stays since gcscode treats `workspace:*` as the entire dependency contract today.

### `MapApiImpl` changes (in `map-api.svelte.ts`)

Adds a second `SvelteMap` for controls and a `registerControl` method. Mirrors the existing `_layers` pattern.

```ts
class MapApiImpl implements MapApi {
  private _layers = new SvelteMap<string, { component: Component }>();
  private _controls = new SvelteMap<string, ControlRegistration>();
  private _camera: MapCamera = $state({ ...INITIAL_CAMERA });
  private _nextLayerId = 0;

  /** Internal — used by `map-view.svelte` to iterate the registry. NOT part of
   * the cross-extension `MapApi` contract. */
  public get layers(): SvelteMap<string, { component: Component }> {
    return this._layers;
  }
  public get controls(): SvelteMap<string, ControlRegistration> {
    return this._controls;
  }
  public get camera(): MapCamera {
    return this._camera;
  }

  public registerLayer(component: Component): Disposable {
    /* unchanged */
  }

  public registerControl(registration: ControlRegistration): Disposable {
    if (this._controls.has(registration.id)) {
      throw new Error(
        `Control id "${registration.id}" is already registered. ` +
          `Control ids must be unique within the map's control registry.`,
      );
    }
    this._controls.set(registration.id, registration);
    return {
      dispose: () => {
        this._controls.delete(registration.id);
      },
    };
  }
}
```

The `id` uniqueness check is stricter than `registerLayer`'s (which accepts any number of duplicate components). Reasoning: control ids are operator-meaningful (they map to commands and are surfaced in error messages); two controls with the same id is almost certainly a bug. Layers don't have that semantic — they're indexed only internally.

Storage key = public `id` directly. `SvelteMap` is insertion-ordered, so registration order is preserved. Dispose-then-re-register with the same `id` works naturally: dispose removes the entry, the next register finds the slot empty and inserts at the tail. No sequence-suffix indirection needed.

### `map-view.svelte` changes

Markup wraps the canvas in a positioning parent so absolute-positioned slot containers can layer over it. The four slot containers iterate the controls registered for that position. Each control renders either as a host-owned button (declarative) or a `<svelte:component>` (escape hatch).

```svelte
<script lang="ts">
  /* existing imports unchanged */
  import { mapApi, MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';
  import MapControlButton from './map-control-button.svelte';

  /* existing onMount / onDestroy / $effect unchanged */

  // host capture for command dispatch — see "Host capture for control click"
  // section below for rationale.
  import { setContext, getContext } from 'svelte';
  import type { ExtensionHost } from '@gcscode/extension-api';
  // (host arrives via a new context key set by index.ts during activate)
</script>

<div class="map-view">
  <h2 class="map-view__heading">Map</h2>
  <div class="map-view__canvas-wrapper">
    <div class="map-view__canvas" bind:this={container}></div>
    {#if map}
      {#each ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const as pos (pos)}
        <div class="map-view__controls map-view__controls--{pos}">
          {#each [...mapApi.controls].filter(([, r]) => r.position === pos) as [key, reg] (key)}
            {#if 'commandId' in reg}
              <MapControlButton {reg} />
            {:else}
              {@const Component = reg.component}
              <Component />
            {/if}
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

{#if map}
  {#each [...mapApi.layers] as [id, entry] (id)}
    {@const Layer = entry.component}
    <Layer />
  {/each}
{/if}

<style>
  /* existing styles unchanged for .map-view, .map-view__heading, .map-view__canvas */
  .map-view__canvas-wrapper {
    position: relative;
    width: 100%;
    height: 400px;
  }
  .map-view__canvas {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    overflow: hidden;
  }
  .map-view__controls {
    position: absolute;
    display: flex;
    gap: 0.5rem;
    pointer-events: none; /* slot wrapper ignores; children re-enable */
  }
  .map-view__controls > :global(*) {
    pointer-events: auto;
  }
  .map-view__controls--top-left {
    top: 0.5rem;
    left: 0.5rem;
    flex-direction: column;
  }
  .map-view__controls--top-right {
    top: 0.5rem;
    right: 0.5rem;
    flex-direction: column;
  }
  .map-view__controls--bottom-left {
    bottom: 0.5rem;
    left: 0.5rem;
    flex-direction: column-reverse;
  }
  .map-view__controls--bottom-right {
    bottom: 0.5rem;
    right: 0.5rem;
    flex-direction: column-reverse;
  }
</style>
```

Bottom corners use `flex-direction: column-reverse` so registration order = "first-registered closest to anchor corner" (intuitive: first control sits at the bottom, subsequent controls stack upward away from the corner).

The `pointer-events: none` on the slot wrapper + `pointer-events: auto` on its children means the slot's empty area lets map drag/zoom gestures through. Without this, registering even one control would block click-and-drag panning across the whole top of the canvas.

The `'commandId' in reg` narrowing distinguishes declarative from component registrations. TypeScript narrows `reg` to `MapControlContribution` in the `if` branch and `MapControlComponentRegistration` in the `else` branch via the discriminator-by-property-presence pattern.

Layer `{#each}` block stays a sibling of the canvas wrapper (unchanged from the previous spec) — layers are headless, controls render visible chrome, the structural separation reflects that.

### `map-control-button.svelte` (new)

The host's declarative-path button. Encapsulates the "icon + tooltip + click → executeCommand" rendering.

```svelte
<script lang="ts">
  import LucideIcon from './lucide-icon.svelte';
  import type { MapControlContribution } from './map-api.svelte';
  import { getHost } from './host-store';

  let { reg }: { reg: MapControlContribution } = $props();

  function onclick() {
    void getHost().commands.executeCommand(reg.commandId);
  }
</script>

<button
  class="map-control-button"
  type="button"
  title={reg.tooltip}
  aria-label={reg.tooltip}
  {onclick}
>
  {#if reg.icon.kind === 'lucide'}
    <LucideIcon name={reg.icon.name} size={16} />
  {:else}
    {@html reg.icon.svg}
  {/if}
</button>

<style>
  .map-control-button {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 1px solid rgba(0, 0, 0, 0.08);
    border-radius: 4px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
    color: #333;
    cursor: pointer;
    padding: 0;
  }
  .map-control-button:hover {
    background: #f4f4f4;
  }
  .map-control-button:active {
    background: #e8e8e8;
  }
  .map-control-button :global(svg) {
    width: 16px;
    height: 16px;
  }
</style>
```

Defaults (32×32 button, 16×16 icon, white bg, drop shadow, 4px radius) match maplibre's own zoom-control visuals — operators of similar tools recognize the conventions immediately. These are spec defaults, not hard requirements. The parallel UI brainstorm may refine them; if so, it lands in a follow-up commit and the visual spec moves to a design-tokens iteration.

The `{@html reg.icon.svg}` insertion is the trust assumption from the non-goals. Plan flags this with a `// SAFE: extensions are first-party today; sandboxing is deferred` comment plus a link to `out-of-scope.md`.

### `lucide-icon.svelte` (new)

Wraps lucide's name-based icon lookup so `MapControlButton` can render `{ kind: 'lucide'; name }` icons without each callsite owning the dynamic-resolution mechanics.

The dynamic-name-to-icon resolution has two reasonable implementations:

- **`lucide` (headless data package)** — exposes icons as `IconNode[]` records keyed by kebab-case name. Render the SVG tag tree manually with a small recursive component. Bundles all ~1500 icons (~25-30KB minified, no tree-shaking) but the API is dead simple.
- **`@lucide/svelte`'s dynamic-import variant** — has had a moving API across versions (`lucide-svelte`'s `<Icon name="...">`, `@lucide/svelte`'s individual-icon components, sometimes a `DynamicIcon` helper). Tree-shaking works only when icon names are statically known, which they're not in our property-bag case.

Plan commits to one of these (the headless-data approach is the safer bet — no API churn risk) and resolves the exact import. Spec contract is just: `<LucideIcon name="crosshair" size={16} />` renders a 16×16 SVG of the named lucide icon, or a small fallback (e.g., a `?` glyph) if the name is unknown. Unknown-name handling is non-fatal — typo'd icon names should not crash the map view.

`@lucide/svelte` and/or `lucide` is added as a dep on `@gcscode/extension-map`'s `package.json`. Bundle size acceptance: the bundle is the shell SPA, hobby project, no deploy-size constraints today.

### Host capture for control click — `host-store.ts` (new)

The declarative-path button needs `host.commands.executeCommand` at click time. `index.ts`'s `activate(context)` runs outside any component tree, so Svelte's `setContext` isn't available there — and the button is internal to `extension-map` anyway, so a module-level slot in the package is the simplest mechanism. No Svelte context indirection.

```ts
// host-store.ts (new — internal; not exported from package's index.ts)
import type { ExtensionHost } from '@gcscode/extension-api';

let _host: ExtensionHost | null = null;

export function setHost(host: ExtensionHost): void {
  _host = host;
}

export function clearHost(): void {
  _host = null;
}

export function getHost(): ExtensionHost {
  if (!_host) {
    throw new Error(
      'gcscode.map host is not captured. Internal invariant violation — ' +
        'MapControlButton was rendered before activate() captured the host.',
    );
  }
  return _host;
}
```

Module-level slot pattern matches `flightOverlayState` in `extension-flight-overlay/src/state.ts` — established convention for "host reference visible to internal components".

The map extension is single-instance (only one `gcscode.map` in `bundledExtensions`), so a single module-level slot is correct. If the extension is disabled and re-enabled, `activate` runs again and overwrites the slot — but the previous host reference is also still valid until the disable's deactivate completes; both writes are with `context.host` of equivalent shape, so the overwrite is benign.

`MapControlButton` reads the host via `import { getHost } from './host-store';` and calls `getHost().commands.executeCommand(...)` on click.

Component-path controls do _not_ read the host through this slot — they go through the public `host.extensions.getExtension(...)` pattern like every other extension consumer. The slot is an internal implementation detail of `extension-map`.

### `index.ts` changes

```ts
import { setHost } from './host-store';

export const mapExtension: Extension = {
  manifest: {
    /* unchanged */
  },
  activate(context): MapApi {
    setHost(context.host); // new — captures host for control-button click dispatch
    context.subscriptions.push(
      context.host.window.registerView({
        id: 'gcscode.map.main',
        component: MapView,
      }),
    );
    return mapApi;
  },
};
```

No `deactivate?()` cleanup needed — host reference is overwritten on next activate, and there is at most one `gcscode.map` extension active at a time. If we ever support multiple map instances (currently out of scope), this slot becomes per-instance state held on the map's view component instead of a module-level mutable.

## First consumer — `@gcscode/extension-flight-overlay` recenter

The first consumer validates the API end-to-end in the same iteration. flight-overlay registers a recenter command and a declarative recenter control that fires it.

### `flight-overlay-config.ts` (no changes)

`homeLocation` already declared. Recenter falls back to it when SITL has no fix.

### `index.ts` changes

```ts
import type { Extension } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';

import { homeLocation } from './flight-overlay-config';
import DroneMarkerLayer from './layers/drone-marker-layer.svelte';
import HomeLocationLayer from './layers/home-location-layer.svelte';
import MaxDistanceCircleLayer from './layers/max-distance-circle-layer.svelte';
import { flightOverlayState } from './state';

export const flightOverlayExtension: Extension = {
  manifest: {
    /* unchanged */
  },
  activate(context) {
    const map = context.host.extensions.getExtension<MapApi>('gcscode.map')?.exports;
    if (!map) {
      throw new Error(
        'gcscode.flight-overlay requires gcscode.map to be active before it activates',
      );
    }

    flightOverlayState.setHost(context.host);

    context.subscriptions.push(
      map.registerLayer(DroneMarkerLayer),
      map.registerLayer(HomeLocationLayer),
      map.registerLayer(MaxDistanceCircleLayer),

      // New — recenter command + control.
      context.host.commands.registerCommand({
        id: 'gcscode.flight-overlay.recenter',
        title: 'Recenter on Drone',
        category: 'Flight Overlay',
        run: () => {
          const sitl = flightOverlayState.sitlExports;
          const lat = sitl?.telemetry.lat;
          const lng = sitl?.telemetry.lng;
          if (lat !== null && lng !== null) {
            map.camera.center = [lng, lat];
          } else {
            // SITL has no fix yet — fall back to the home location so the
            // operator gets a sensible "go back to where the drone should be"
            // behavior instead of a no-op.
            map.camera.center = homeLocation;
          }
        },
      }),
      map.registerControl({
        id: 'gcscode.flight-overlay.recenter',
        position: 'top-right',
        icon: { kind: 'lucide', name: 'crosshair' },
        tooltip: 'Recenter on drone',
        commandId: 'gcscode.flight-overlay.recenter',
      }),
    );
  },
  deactivate() {
    flightOverlayState.clearHost();
  },
};
```

The command is a real, palette-discoverable command (registered with `category: 'Flight Overlay'`) so it shows up in `Ctrl+Shift+P` as `Flight Overlay: Recenter on Drone`. This is the natural payoff of going through the command pattern — the same recenter action is reachable from the button, from the palette, and (eventually) from a keybinding without the control needing to know about any of those alternative paths.

## Tests

### `packages/extension-map/src/index.test.ts` (additions)

Adds a `describe('mapApi.registerControl')` block alongside the existing `describe('mapApi')`. Tests cover:

- `registerControl` adds an entry; `Disposable.dispose()` removes it.
- `Disposable.dispose()` is idempotent.
- Duplicate `id` registration throws (with the public id surfaced in the error message).
- Disposing then re-registering with the same `id` succeeds.
- Both registration shapes are accepted (declarative and component) — round-trip through the registry.
- `position` is preserved verbatim on the registry entry (regression check that we don't normalize / drop fields).

No tests of the rendering branches, the `commandId` execution path, or the slot-positioning CSS — those are covered by browser smoke. Follows the existing pattern (no maplibre instantiation, no Svelte rendering, in unit tests).

### `packages/extension-flight-overlay/src/index.test.ts` (additions)

- `activate` registers the recenter command (verify by checking `host.commands.registerCommand` mock got called with the right id).
- `activate` registers the recenter control (verify `mapApi.registerControl` mock got called with the right position and `commandId`).
- The recenter command's `run` callback writes `map.camera.center` to the SITL position when telemetry has a fix.
- The recenter command's `run` callback writes `map.camera.center` to `homeLocation` when SITL has no fix (lat/lng null).

These extend the existing flight-overlay test pattern. The fake `MapApi` mock used in the existing tests will need a writable `camera` (object with a settable `center` field) so the recenter-fallback assertions can read the post-write value. Plan resolves the exact mock shape.

### Browser smoke

`pnpm dev` from a clean `localStorage`:

- The recenter button appears top-right of the map canvas.
- Hovering shows the "Recenter on drone" tooltip.
- Clicking recenters the camera.
- Disabling the flight-overlay extension via the extensions panel removes the recenter button (control is disposed alongside layers).
- Re-enabling restores it.
- Opening the palette (`Ctrl+Shift+P`) shows `Flight Overlay: Recenter on Drone` and selecting it has the same effect as clicking the button.

## README updates

`packages/extension-map/README.md`:

- Add a `### registerControl(registration): Disposable` subsection under "Cross-extension exports (the `MapApi`)", documenting both registration shapes (declarative property bag + component escape hatch), the icon discriminated union, position vocabulary, and the "prefer declarative for buttons; component for non-button shapes" guidance.
- Update the "What's NOT in this package" trailer: remove "recenter button" (now shipped via flight-overlay), keep the rest.

`packages/extension-flight-overlay/README.md`:

- Document the `gcscode.flight-overlay.recenter` command and the recenter control; note that the command is also reachable via the command palette as `Flight Overlay: Recenter on Drone`.

## VS Code alignment

| Concern                                           | VS Code                                                                  | gcscode                                                  | Notes                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Declarative property-bag for chrome contributions | ✓ (status bar, commands, menus, palette entries, editor toolbar buttons) | ✓ (first declarative kind in gcscode — map controls)     | Aligned: introduces the pattern. Views and status bar items keep their existing component-based divergence.                                                                                                                                                                                   |
| Command-id as control action                      | ✓                                                                        | ✓ (`commandId` on `MapControlContribution`)              | Aligned: reinforces commands-as-integration-backbone.                                                                                                                                                                                                                                         |
| Custom-icon-or-curated-name pattern               | ✓ (`string \| Uri \| ThemeIcon`)                                         | ✓ (`{ kind: 'lucide' } \| { kind: 'svg' }`)              | Aligned in spirit: both expose a curated set + custom escape hatch. Form differs — see next two rows.                                                                                                                                                                                         |
| Icon shape                                        | structurally-distinguished union (`string \| Uri \| ThemeIcon`)          | discriminated union with explicit `kind`                 | **Deliberate ergonomic divergence.** Discriminated union is more self-documenting at call sites, scales additively without overlap risk, supports exhaustive switches. Surface is small enough that the divergence is low-cost; substance (curated-or-custom both supported) matches VS Code. |
| Curated icon set                                  | Codicons (in-house font)                                                 | Lucide names (`@lucide/svelte`)                          | **Deliberate divergence.** Lucide is the de-facto Svelte-ecosystem icon library and shadcn-svelte's choice — aligns gcscode with the broader Svelte tooling rather than VS Code's in-house font. Operator-friendly kebab-case names.                                                          |
| Theme tokens for extension styling                | ✓ (`--vscode-*` CSS variables, hundreds of named colors)                 | ✗ (deferred)                                             | Trigger: webview wing iteration (canonical theming consumer) OR parallel UI brainstorm landing on a documented design system. When triggered, gcscode aligns: CSS variables only, no component/utility classes (matches VS Code's pattern, not BEM-style classes).                            |
| Control component escape hatch                    | webviews                                                                 | Svelte component registration                            | Aligned in spirit — both reserve the component path for shapes that don't fit the declarative bag. gcscode's escape hatch is simpler (Svelte component, same realm) because untrusted-extension sandboxing is its own future iteration.                                                       |
| Position vocabulary                               | (N/A — VS Code controls are mostly title-bar / inline)                   | maplibre / mapbox / leaflet convention (`top-left` etc.) | Position vocabulary follows the map-tool ecosystem rather than VS Code, which has no equivalent surface. Operator-friendly.                                                                                                                                                                   |
| Ordering within a position                        | numeric `priority`                                                       | registration order                                       | Already-recorded pattern — mirrors status-bar items + map layers. Same trigger: third-party wants to insert between two first-party items.                                                                                                                                                    |
| Tooltip required vs optional                      | optional in most VS Code APIs                                            | required `string`                                        | **Deliberate ergonomic divergence.** Forcing tooltip required prevents accidentally skipping accessibility on icon-only buttons. Cost: a tiny extra string per registration.                                                                                                                  |

Per-iteration table snapshots; new rows propagate to `vs-code-alignment.md` when this iteration ships.

## `out-of-scope.md` propagation

When this iteration ships, edit `out-of-scope.md` as follows:

- **REMOVE** the existing "Map UI controls / overlay slots" row — this iteration ships it. The trigger has fired; `MapApi.registerControl` is the answer.
- **ADD** under "Extension machinery":
  - **Theme tokens / CSS-variable system for extension styling.** No `--gcscode-*` CSS variables exposed; component-path map controls and (future) webview content cannot match host visuals from extension code. Trigger to revisit: webview wing iteration (canonical theming consumer), or the parallel UI brainstorm landing on a documented design system that wants extension reach. When triggered, follow VS Code's pattern: CSS variables only, no component/utility classes. (See `docs/specs/2026-05-03-map-controls.md`.)
  - **Numeric `priority` ordering for map controls.** No `priority` field on `MapControlContribution`; ordering within a corner follows registration order. Mirrors the existing status-bar and layer `priority` deferrals. Trigger to revisit: third-party wants to insert between two first-party controls.
  - **Hover / active state customization on declarative controls.** Host renders one button visual style; extensions can't override colors, sizing, drop-shadow, etc. on the declarative path. Trigger to revisit: a control needs a different state (e.g., destructive action wants red hover) — likely surfaces alongside the theme-tokens iteration.
  - **SVG sanitization for extension-provided icons.** Extension SVG is inserted as-is (`{@html}`). Safe today because all extensions are first-party (per the existing third-party-sandboxing row). Trigger to revisit: rolls in with the webview / sandboxing iteration.

These docs propagation edits land in the same docs commit as the feature merge, per the established pattern (see `b88e754 docs: extensions-panel propagation`).

## Roadmap propagation

Add under Feature extensions → Coming, as a sub-bullet under the existing Map line (or as a separately-ticked sibling — whichever reads cleaner alongside the existing entries):

```
- [x] **Map controls** — `MapApi.registerControl` adds a declarative property-bag contribution surface (with Svelte component escape hatch); first consumer is `flight-overlay`'s recenter button. First declarative property-bag contribution kind in gcscode. Spec: [`specs/2026-05-03-map-controls.md`](specs/2026-05-03-map-controls.md).
```

Phase A4+ stays open — map controls is a contribution kind on a service-style extension's API, not a new host-side `register*` method, so it doesn't tick a Phase A bullet.

## Decisions log (brainstorm trail)

For posterity. Captures the why behind shape choices that won't be obvious from code:

- **Pure declarative + Svelte component escape hatch**, not pure declarative. Marginal LOC delta to add the escape hatch up front (~30 LOC) is roughly equal to retrofitting later, and we avoid a future iteration's overhead. Mitigation against escape-hatch overuse is a doc note (prefer declarative for buttons; component for non-button shapes).
- **Command id, not direct callback**, on `MapControlContribution.commandId`. Reinforces commands-as-integration-backbone (already an alignment row). Same control's action becomes reachable from button, palette, and keybinding without the control declaring any of that. Cost: extension makes two `register*` calls (command + control) instead of one — small.
- **Discriminated union for `ControlIcon`**, not structural union (`string | { svg: string }`). Self-documenting at call sites, scales without overlap risk. Recorded as a deliberate ergonomic divergence from VS Code's structural shape.
- **Lucide as the curated icon set**, not a hand-curated `gcscode.icon.*` registry. Lucide has ~1500 icons, kebab-case names, tree-shakable, first-party Svelte 5 binding, shadcn-svelte's choice. Avoids host-side curation burden when there's one consumer.
- **Tooltip required, not optional.** Accessibility baseline. One extra string per registration is cheap insurance.
- **Recenter command falls back to `homeLocation` when SITL has no fix**, instead of a silent no-op. Operator-meaningful behavior: "recenter" means "put me somewhere sensible," not "do nothing because there's no signal."
- **Symbol-keyed private host context**, not a string key. Internal contract; Symbol prevents accidental external consumption. (Different from the public `'gcscode.map.maplibre'` string key, which is part of the cross-extension contract per ADR-0005.)
- **Design tokens / CSS-variable system explicitly deferred.** Component-path consumers don't pull on tokens yet. The natural trigger is the webview wing iteration (canonical theming consumer) or the parallel UI brainstorm pulling on extension styling. When it comes, follow VS Code's pattern (CSS variables only, no component/utility classes).
