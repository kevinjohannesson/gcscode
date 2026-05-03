import type { Component } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';

import type { Disposable } from '@gcscode/extension-api';

/**
 * Camera state shape — read or assign individual fields. The camera object
 * itself is stable (`readonly camera` on `MapApi`); consumers mutate fields,
 * not the reference.
 */
export interface MapCamera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

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
   * `'gcscode.flight-overlay.recenter'`). Used as the registry key and
   * surfaced in collision error messages. */
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

/**
 * The cross-extension exports of `gcscode.map`. Consumers `import type` this
 * from `@gcscode/extension-map` and look up the live value via
 * `host.extensions.getExtension<MapApi>('gcscode.map')?.exports`.
 *
 * `registerLayer(component)` mounts `component` as a child of the map view's
 * tree (so the component's `getContext('gcscode.map.maplibre')` resolves to
 * the live maplibre `Map` instance). Returns a `Disposable` that removes the
 * mount on `dispose()`.
 *
 * `camera` is `$state`-backed; reads inside `$derived` / template / `$effect`
 * track field changes. Writes apply via maplibre `jumpTo` (no animation).
 * Multiple writers in the same tick: last-write-wins.
 */
export interface MapApi {
  registerLayer(component: Component): Disposable;
  /**
   * Register an interactive control rendered over the map canvas. Two
   * registration shapes are accepted:
   *
   * - **Declarative property bag** (`MapControlContribution`, recommended):
   *   the host renders a uniformly-styled icon button. Click fires
   *   `commandId` via `host.commands.executeCommand`. Prefer this path for
   *   icon-button controls — operator-UX consistency.
   * - **Component escape hatch** (`MapControlComponentRegistration`,
   *   advanced): use only when the control's shape doesn't fit an icon
   *   button. The host renders the extension's Svelte component inside the
   *   same slot wrapper.
   *
   * Throws if `registration.id` is already in use. Disposing the returned
   * `Disposable` removes the registration; idempotent.
   */
  registerControl(registration: ControlRegistration): Disposable;
  readonly camera: MapCamera;
}

/** Initial camera fallback. Matches map-demo (Canberra, SITL test data center). */
const INITIAL_CAMERA: MapCamera = {
  center: [149.17, -35.36],
  zoom: 13,
  pitch: 0,
  bearing: 0,
};

class MapApiImpl implements MapApi {
  private _layers = new SvelteMap<string, { component: Component }>();
  private _controls = new SvelteMap<string, ControlRegistration>();
  private _camera: MapCamera = $state({ ...INITIAL_CAMERA });
  private _nextLayerId = 0;

  /** Read-only view of the layer registry for the map view's `{#each}` block. */
  public get layers(): SvelteMap<string, { component: Component }> {
    return this._layers;
  }

  /** Read-only view of the control registry for the map view's per-corner
   * `{#each}` blocks. NOT part of the cross-extension `MapApi` contract —
   * consumers use `registerControl()` and let the map mount their controls. */
  public get controls(): SvelteMap<string, ControlRegistration> {
    return this._controls;
  }

  public get camera(): MapCamera {
    return this._camera;
  }

  public registerLayer(component: Component): Disposable {
    const id = `layer-${this._nextLayerId++}`;
    this._layers.set(id, { component });
    return {
      dispose: () => {
        this._layers.delete(id);
      },
    };
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

/**
 * Module-level singleton. Lives across enable/disable cycles of
 * `gcscode.map` — mirrors the host-singleton pattern used by vehicle-status
 * and map-demo. Re-enabling the map remounts the view, which re-iterates the
 * registry and renders the layers fresh against the new maplibre instance.
 */
export const mapApi = new MapApiImpl();

/**
 * Stable Svelte context key. Part of the public API contract — consumer
 * extensions (flight-overlay and any future consumer) declare this same string
 * independently rather than runtime-importing the constant (forbidden by
 * ADR-0005). Documented in this package's README.
 */
export const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
