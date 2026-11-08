# Map + flight-overlay — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two new workspace packages: `@gcscode/extension-map` (a service-style extension exposing `registerLayer(component): Disposable` + reactive `camera: MapCamera` via cross-extension exports), and `@gcscode/extension-flight-overlay` (the first consumer, registering drone-marker, home-location, and max-distance-circle layers on the map). The throwaway `extension-map-demo` stays bundled alongside.

**Architecture:** `extension-map` mirrors the `extension-map-demo` package shape with one extra module (`map-api.svelte.ts`) for the reactive registry + camera state. The maplibre `Map` instance is exposed to layer components via Svelte context (key `'gcscode.map.maplibre'`). `extension-flight-overlay` mirrors the `extension-vehicle-status` consumer pattern: type-only sibling imports of `MapApi` + `SitlExports`, runtime lookup via `host.extensions.getExtension`. Layers are headless Svelte components mounted as children of the map view; they imperatively call maplibre APIs from inside `$effect` blocks.

**Tech Stack:** TypeScript, Svelte 5 (runes mode, `$state`/`$effect`/`$derived`, class-based reactive state per `.svelte.ts` convention), maplibre-gl ^5.24 (already used by `extension-map-demo`), Vitest with the established fake-host pattern (no shell-internals dep in tests), pnpm workspaces.

**Spec:** [`docs/specs/2026-05-03-map-and-flight-overlay.md`](../specs/2026-05-03-map-and-flight-overlay.md)

**No ADR.** All decisions extend established patterns (workspace package per ADR-0001, view contribution per A-phase, type-only sibling import per ADR-0005, manifest per ADR-0007, cross-extension exports per ADR-0005).

---

## Important — every commit on this branch is green

This iteration's six feat/docs commits each leave the workspace passing `pnpm check` + `pnpm test` + `pnpm lint`. There are no intermediate non-green states.

| After commit                                                                     | Workspace state                                                                                                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1: scaffold map (placeholder view + tests)                                       | Green. Package compiles in isolation. 6 new tests pass. `pnpm dev` doesn't show the new map yet (not bundled into shell).       |
| 2: maplibre canvas + camera + layer mount                                        | Green. View component is the real implementation; the same 6 tests still pass (rendering isn't unit-tested). Still not bundled. |
| 3: scaffold flight-overlay (config + state + circle-polygon + placeholder index) | Green. Package compiles in isolation. 4 circle-polygon tests pass; placeholder `index.ts` produces no extension assertions yet. |
| 4: flight-overlay layers + full activate + tests                                 | Green. Three layers exist; index.ts is fully wired; 4 new index tests pass. Still not bundled into shell.                       |
| 5: bundle into shell + smoke                                                     | Green. Both extensions activate; map view renders alongside map-demo view. **Browser smoke runs at this commit.**               |
| 6: docs propagation (roadmap + alignment ledger + out-of-scope)                  | Green. Docs only.                                                                                                               |

---

## File structure

| Path                                                                            | Responsibility                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-map/package.json`                                           | Workspace package manifest. `workspace:*` dep on `@gcscode/extension-api`. `maplibre-gl ^5.24.0` runtime dep. (Task 2.)                                                                            |
| `packages/extension-map/tsconfig.json`                                          | Verbatim copy of `extension-map-demo/tsconfig.json`. (Task 2.)                                                                                                                                     |
| `packages/extension-map/src/css.d.ts`                                           | Verbatim copy of `extension-map-demo/src/css.d.ts` — declares the maplibre CSS import. (Task 2.)                                                                                                   |
| `packages/extension-map/src/map-api.svelte.ts`                                  | `MapCamera` + `MapApi` types, `MapApiImpl` class (C# conventions: `private`/`public`, `_backingField`, getters), `mapApi` singleton, `MAPLIBRE_CONTEXT_KEY` constant. (Task 2.)                    |
| `packages/extension-map/src/map-view.svelte`                                    | Task 2 placeholder (`<div>Map (real)</div>`); Task 3 replaces with full maplibre canvas + camera two-way binding + layer mount.                                                                    |
| `packages/extension-map/src/index.ts`                                           | `mapExtension` const + re-exports of `MapApi`, `MapCamera`, `MAPLIBRE_CONTEXT_KEY`. `activate` returns `mapApi` as exports. No `deactivate?()`. (Task 2.)                                          |
| `packages/extension-map/src/index.test.ts`                                      | 6 tests using fake-host pattern (manifest, activate-returns-mapApi-and-registers-view, registerLayer-adds-and-disposes, idempotent-dispose, multiple-unique-ids, camera-fields-mutable). (Task 2.) |
| `packages/extension-map/README.md`                                              | Documents the `MapApi`, the context-key contract, the tile source, and the deferral list. (Task 2.)                                                                                                |
| `packages/extension-flight-overlay/package.json`                                | Workspace package manifest. `workspace:*` deps on api + map (type-only) + sitl (type-only). `maplibre-gl ^5.24.0` runtime dep. (Task 4.)                                                           |
| `packages/extension-flight-overlay/tsconfig.json`                               | Verbatim copy of `extension-vehicle-status/tsconfig.json`. (Task 4.)                                                                                                                               |
| `packages/extension-flight-overlay/src/flight-overlay-config.ts`                | Hardcoded `homeLocation: [number, number]` + `maxDistanceMeters: number`. (Task 4.)                                                                                                                |
| `packages/extension-flight-overlay/src/circle-polygon.ts`                       | Pure helper: `computeCirclePolygon(center, radiusMeters): [number, number][]`. (Task 4.)                                                                                                           |
| `packages/extension-flight-overlay/src/circle-polygon.test.ts`                  | 4 unit tests (closed ring, point count, linear scaling at equator, latitude contraction). (Task 4.)                                                                                                |
| `packages/extension-flight-overlay/src/state.ts`                                | `FlightOverlayState` class (C# conventions) with `setHost`/`clearHost` and `mapExports`/`sitlExports` getters. (Task 4.)                                                                           |
| `packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte`        | Headless Svelte component. Reads SITL via `flightOverlayState.sitlExports`; renders/updates a maplibre `Marker` from inside `$effect`. (Task 5.)                                                   |
| `packages/extension-flight-overlay/src/layers/home-location-layer.svelte`       | Headless. Reads hardcoded `homeLocation`; renders a colored maplibre `Marker`. (Task 5.)                                                                                                           |
| `packages/extension-flight-overlay/src/layers/max-distance-circle-layer.svelte` | Headless. Computes circle polygon via `computeCirclePolygon`; adds a maplibre `geojson` source + `line` layer. (Task 5.)                                                                           |
| `packages/extension-flight-overlay/src/index.ts`                                | `flightOverlayExtension` const. `activate` validates map presence, captures host, registers three layers. `deactivate` clears host. (Task 5.)                                                      |
| `packages/extension-flight-overlay/src/index.test.ts`                           | 4 tests (manifest, activate-registers-three-layers, activate-throws-without-map, state-exposes-mapExports-and-sitlExports). (Task 5.)                                                              |
| `packages/extension-flight-overlay/README.md`                                   | Documents the consumer pattern, the layers, the config. (Task 4 stub; Task 5 fills.)                                                                                                               |
| `packages/shell/src/extension-host/bundled-extensions.ts`                       | Add map + flight-overlay imports + array entries (after map-demo). (Task 6.)                                                                                                                       |
| `packages/shell/package.json`                                                   | Add `@gcscode/extension-map` + `@gcscode/extension-flight-overlay` to `dependencies`. (Task 6.)                                                                                                    |
| `pnpm-lock.yaml`                                                                | Auto-updated by `pnpm install` after the new packages land. (Tasks 2, 4.)                                                                                                                          |
| `docs/roadmap.md`                                                               | Tick `Map`; add `flight-overlay` line under Coming. (Task 7.)                                                                                                                                      |
| `docs/vs-code-alignment.md`                                                     | Add 1 alignment + 1 divergence + 4 deferral rows. (Task 7.)                                                                                                                                        |
| `docs/out-of-scope.md`                                                          | Add 5 entries (animated camera, camera coordination, layer ordering, map UI controls, cross-extension Svelte context constants). (Task 7.)                                                         |

---

### Task 1: Establish baseline + create feature branch

**Files:** none (verification + branch creation)

- [ ] **Step 1: Verify on master with clean working tree**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `master`. The spec file (`docs/specs/2026-05-03-map-and-flight-overlay.md`) is already committed at this point.

- [ ] **Step 2: Verify lint, check, test all clean at baseline**

Run: `pnpm lint && pnpm check && pnpm test 2>&1 | tail -20`
Expected: all clean. Note the workspace test count for comparison; per the spec's expectation, baseline is 214, end-state is ~228.

- [ ] **Step 3: Set up worktree on feature branch**

Run: `git worktree add .worktrees/feat-map-and-flight-overlay -b feat/map-and-flight-overlay`
Expected: worktree created. Implementer subagents work inside `<worktree>/shell/`.

- [ ] **Step 4: Install deps in the worktree**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm install`
Expected: `Done` with no errors.

- [ ] **Step 5: Verify clean baseline in worktree**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm lint && pnpm check && pnpm test 2>&1 | tail -5`
Expected: all clean. Same workspace test count as Step 2.

---

### Task 2: Scaffold @gcscode/extension-map package — commit 1

**Files:**

- Create: `packages/extension-map/package.json`
- Create: `packages/extension-map/tsconfig.json`
- Create: `packages/extension-map/src/css.d.ts`
- Create: `packages/extension-map/src/map-api.svelte.ts`
- Create: `packages/extension-map/src/map-view.svelte` (placeholder; Task 3 replaces)
- Create: `packages/extension-map/src/index.ts`
- Create: `packages/extension-map/src/index.test.ts`
- Create: `packages/extension-map/README.md`

This task creates the entire `extension-map` package with:

- The `MapApi` types and `mapApi` singleton (`map-api.svelte.ts`).
- A placeholder `map-view.svelte` (`<div>Map (real)</div>`) so the package compiles without maplibre integration.
- The full `index.ts` (registers a view contribution; returns `mapApi` as exports).
- 6 tests passing against the index.ts contract.
- A `README.md` documenting the API and the context-key contract.

The package is NOT yet bundled into the shell at the end of this task.

**Reminder for subagents working in worktrees (per CLAUDE.md):** every bash command MUST be prefixed with `cd .worktrees/feat-map-and-flight-overlay/shell &&`. Before every `git commit`, run `git branch --show-current` and verify the output is `feat/map-and-flight-overlay`.

#### Sub-section A: package directory + package.json + tsconfig + maplibre dep

- [ ] **Step 1: Create the package directory**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && mkdir -p packages/extension-map/src`
Expected: directory created.

- [ ] **Step 2: Create `packages/extension-map/package.json`**

Full content (note `maplibre-gl` will be locked by `pnpm add` in Step 5; the literal `^5.0.0` here is a placeholder Step 5 replaces):

```json
{
  "name": "@gcscode/extension-map",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gcscode/extension-api": "workspace:*"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

- [ ] **Step 3: Create `packages/extension-map/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `packages/extension-map/src/css.d.ts`**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && cp packages/extension-map-demo/src/css.d.ts packages/extension-map/src/css.d.ts`
Expected: file copied verbatim from extension-map-demo.

Verify with `cat packages/extension-map/src/css.d.ts` — it should declare the `'maplibre-gl/dist/maplibre-gl.css'` module shape.

- [ ] **Step 5: Add maplibre-gl as a runtime dep**

Run:

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && pnpm add maplibre-gl --filter @gcscode/extension-map
```

Expected: `pnpm add` resolves the latest `maplibre-gl ^5.x.x` (should match the version already pinned in `extension-map-demo`'s `package.json`), updates `packages/extension-map/package.json`, updates `pnpm-lock.yaml`. After this, `package.json`'s `dependencies` block has both `@gcscode/extension-api: workspace:*` and `maplibre-gl: ^5.x.x` (with the actual resolved version).

- [ ] **Step 6: Verify the new package is discovered by the workspace**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm list --filter @gcscode/extension-map --depth 0 2>&1 | tail -10`
Expected: lists the package's two dependencies (`@gcscode/extension-api`, `maplibre-gl`).

#### Sub-section B: source files (map-api + placeholder view + index)

- [ ] **Step 7: Create `packages/extension-map/src/map-api.svelte.ts`**

Full content:

```ts
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
  private _camera: MapCamera = $state({ ...INITIAL_CAMERA });
  private _nextLayerId = 0;

  /** Read-only view of the registry for the map view's `{#each}` block. */
  public get layers(): SvelteMap<string, { component: Component }> {
    return this._layers;
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
```

- [ ] **Step 8: Create `packages/extension-map/src/map-view.svelte` (placeholder)**

Minimal placeholder so the package compiles. Task 3 replaces it with the full maplibre integration.

```svelte
<script lang="ts">
  // Placeholder. Task 3 (commit 2) replaces this with the full maplibre
  // canvas + camera two-way binding + layer mount.
</script>

<div class="map-view-placeholder">Map (real)</div>

<style>
  .map-view-placeholder {
    padding: 1rem;
    color: #666;
  }
</style>
```

- [ ] **Step 9: Create `packages/extension-map/src/index.ts`**

```ts
import type { Extension } from '@gcscode/extension-api';

import { mapApi, type MapApi } from './map-api.svelte';
import MapView from './map-view.svelte';

export type { MapApi, MapCamera } from './map-api.svelte';
export { MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';

export const mapExtension: Extension = {
  manifest: {
    id: 'gcscode.map',
    displayName: 'Map',
    version: '0.0.0',
    description:
      'Geographical view. Exposes a contribution API for other extensions to register map layers.',
  },
  activate(context): MapApi {
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

#### Sub-section C: tests

- [ ] **Step 10: Create `packages/extension-map/src/index.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost, ViewContribution } from '@gcscode/extension-api';

import { mapApi, mapExtension } from './index';

function makeFakeHost(opts?: {
  registerView?: ExtensionHost['window']['registerView'];
}): ExtensionHost {
  return {
    window: {
      registerView: opts?.registerView ?? vi.fn(() => ({ dispose: () => {} }) as Disposable),
      registerStatusBarItem: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['commands']['executeCommand'],
    },
    keybindings: {
      registerKeybinding: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    },
    extensions: {
      getExtension: vi.fn(() => undefined),
    },
  };
}

describe('mapExtension', () => {
  it('declares stable identity metadata', () => {
    expect(mapExtension.manifest.id).toBe('gcscode.map');
    expect(mapExtension.manifest.displayName).toBe('Map');
    expect(typeof mapExtension.manifest.version).toBe('string');
  });

  it('activate registers exactly one view and returns mapApi as exports', () => {
    const captured: ViewContribution[] = [];
    const host = makeFakeHost({
      registerView: vi.fn((view) => {
        captured.push(view);
        return { dispose: () => {} };
      }),
    });
    const subscriptions: Disposable[] = [];

    const exports = mapExtension.activate({
      host,
      subscriptions,
      extension: {
        id: mapExtension.manifest.id,
        displayName: mapExtension.manifest.displayName,
        version: mapExtension.manifest.version,
      },
    });

    expect(host.window.registerView).toHaveBeenCalledTimes(1);
    expect(captured[0].id).toBe('gcscode.map.main');
    expect(subscriptions).toHaveLength(1);
    expect(exports).toBe(mapApi);
  });
});

describe('mapApi', () => {
  it('registerLayer adds an entry; returned Disposable removes it', () => {
    const FakeComponent = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];

    const before = mapApi.layers.size;
    const disposable = mapApi.registerLayer(FakeComponent);
    expect(mapApi.layers.size).toBe(before + 1);

    disposable.dispose();
    expect(mapApi.layers.size).toBe(before);
  });

  it('Disposable.dispose is idempotent', () => {
    const FakeComponent = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];
    const before = mapApi.layers.size;
    const disposable = mapApi.registerLayer(FakeComponent);

    disposable.dispose();
    expect(() => disposable.dispose()).not.toThrow();
    expect(mapApi.layers.size).toBe(before);
  });

  it('multiple registrations get unique ids', () => {
    const FakeA = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];
    const FakeB = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];

    const before = mapApi.layers.size;
    const dA = mapApi.registerLayer(FakeA);
    const dB = mapApi.registerLayer(FakeB);
    expect(mapApi.layers.size).toBe(before + 2);

    dA.dispose();
    dB.dispose();
    expect(mapApi.layers.size).toBe(before);
  });

  it('camera fields are mutable', () => {
    const original = mapApi.camera.zoom;
    mapApi.camera.zoom = 14;
    expect(mapApi.camera.zoom).toBe(14);
    mapApi.camera.zoom = original;
    expect(mapApi.camera.zoom).toBe(original);
  });
});
```

- [ ] **Step 11: Run the tests for the new package and verify they pass**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm --filter @gcscode/extension-map test`
Expected: 6 tests pass.

#### Sub-section D: README + verify-and-commit

- [ ] **Step 12: Create `packages/extension-map/README.md`**

The outer fence below is 4 backticks so the inner 3-backtick code blocks are literal. Copy the content **between** the outer fences (not including them) into the README file.

````md
# @gcscode/extension-map

Geographical view contributing the `gcscode.map.main` view. Renders a maplibre canvas with a hardcoded basemap (OpenFreeMap positron style). Exposes a contribution API for other extensions to register map layers.

This is the **first service-style extension** in gcscode — its primary value is the API surface other extensions render INTO, not the visible UI it contributes itself. The closest VS Code analogue is the editor-with-decorations / language-services pattern.

The throwaway `@gcscode/extension-map-demo` coexists in the bundle as a side-by-side reference.

## Contributions

- **View** — `gcscode.map.main`. Renders the maplibre canvas and mounts registered layers.

## Cross-extension exports (the `MapApi`)

```ts
import type { MapApi } from '@gcscode/extension-map';

const map = host.extensions.getExtension<MapApi>('gcscode.map')?.exports;
if (map) {
  context.subscriptions.push(map.registerLayer(MyLayerComponent));
  // map.camera.zoom = 14;  // editable; field-level writes apply instantly
}
```

### `registerLayer(component): Disposable`

Mounts `component` as a child of the map view's tree. The component receives the live maplibre `Map` instance via Svelte context (key `'gcscode.map.maplibre'`). The returned `Disposable.dispose()` unmounts the component; idempotent.

Layer components must be Svelte. They typically render no visible DOM; their job is to read the maplibre instance from context and call maplibre APIs imperatively from `$effect` blocks (add markers, sources, layers, etc.) and clean up on `onDestroy`.

### `camera: MapCamera`

```ts
interface MapCamera {
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
}
```

`$state`-backed. Read inside `$derived` / template / `$effect` to react to camera changes. Field-level writes (e.g. `map.camera.zoom = 14`) apply to the maplibre canvas instantly via `jumpTo` (no animation). The reference itself is stable (`readonly camera`); replacing the object is a type error.

Writes from inside maplibre's own pan/zoom interactions are written back to `camera` automatically — two-way binding.

**Multiple consumers writing the camera in the same tick: last-write-wins.** No locking, no priorities. If a coordination need surfaces, add it as a follow-up iteration.

### Svelte context key

```ts
import { getContext } from 'svelte';
import type maplibregl from 'maplibre-gl';

const getMap = getContext<() => maplibregl.Map | null>('gcscode.map.maplibre');
```

The string literal `'gcscode.map.maplibre'` is the public contract. Re-declare it in your consumer; do not `import` it from this package at runtime (ADR-0005 forbids runtime sibling imports). The constant is also exported as `MAPLIBRE_CONTEXT_KEY` for type-only / documentation purposes.

The getter form is intentional — children mount before the parent's `onMount` runs, so the underlying `Map` is null at the time `setContext` registers the value. Layer components call the getter at `$effect` time to read the current value.

## Tile source

`https://tiles.openfreemap.org/styles/positron` — same as `map-demo`. Free, no API key, vector tiles, monochrome cartography. Permitted for development and production.

## What's NOT in this package

- Selection state, animated camera (`flyTo`/`easeTo`), follow-mode toggle, recenter button, layer-ordering API, multi-drone, route history, manual targeting. See `docs/specs/2026-05-03-map-and-flight-overlay.md` for the full deferral list.

## See also

- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries (cross-extension exports + type-only sibling imports)
- [Spec 2026-05-03-map-and-flight-overlay](../../docs/specs/2026-05-03-map-and-flight-overlay.md) — this iteration
- [`@gcscode/extension-flight-overlay`](../extension-flight-overlay/README.md) — first consumer
````

- [ ] **Step 13: Verify lint, check, test all clean**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | tail -10`
Expected: all clean. Workspace test count: 220 (baseline 214 + 6 new in extension-map).

- [ ] **Step 14: Verify branch + commit**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && git branch --show-current`
Expected: `feat/map-and-flight-overlay`. STOP IF NOT — cwd is wrong.

Then run:

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && \
  git add packages/extension-map/ packages/shell/pnpm-lock.yaml pnpm-lock.yaml 2>/dev/null; \
  git add -u; \
  git status
```

(`pnpm install` may have placed the lockfile at one of two paths depending on workspace root.)

Confirm the staged set is exactly the new `extension-map` package files plus the `pnpm-lock.yaml` change. No unrelated files.

Then commit:

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && git commit -m "$(cat <<'EOF'
feat(map): scaffold @gcscode/extension-map package with MapApi and tests

Adds @gcscode/extension-map workspace package with MapApi (registerLayer +
reactive camera state), a placeholder view, and 6 unit tests. The package
compiles in isolation but isn't bundled into the shell yet — the next commit
adds the full maplibre canvas + camera binding + layer mount.

Spec: docs/specs/2026-05-03-map-and-flight-overlay.md
EOF
)"
```

Expected: commit succeeds; tree clean.

---

### Task 3: Replace placeholder MapView with full maplibre integration — commit 2

**Files:**

- Modify: `packages/extension-map/src/map-view.svelte`

This task replaces the placeholder view component with the full implementation: maplibre canvas, two-way camera binding, registered-layer mount via Svelte context. No test changes (unit tests cover the registry/exports/camera contract; rendering integration is verified by browser smoke after Task 6).

**Reminder for subagents working in worktrees (per CLAUDE.md):** every bash command MUST be prefixed with `cd .worktrees/feat-map-and-flight-overlay/shell &&`. Before every `git commit`, run `git branch --show-current` and verify the output is `feat/map-and-flight-overlay`.

- [ ] **Step 1: Replace `packages/extension-map/src/map-view.svelte`**

Full content (overwrites the placeholder):

```svelte
<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { onDestroy, onMount, setContext } from 'svelte';

  import { mapApi, MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';

  let container: HTMLDivElement | undefined = $state();
  let map: maplibregl.Map | null = $state(null);

  // Loop guard: when our $effect writes camera state INTO maplibre, maplibre
  // fires a `move` event that would otherwise write right back, masking the
  // original write or causing spurious re-renders.
  let isUpdatingFromCamera = false;

  // Layer components access the maplibre Map via context. The getter form
  // (() => map) resolves `map` lazily — children mount before the parent's
  // onMount runs, so the value at setContext time is null. Layers read the
  // current value at $effect time. Plus we gate {#each} on `map` below to
  // avoid mounting layers before maplibre is ready.
  setContext(MAPLIBRE_CONTEXT_KEY, () => map);

  // OpenFreeMap "positron" — same tile source as map-demo. Free, no API key,
  // monochrome (operator-friendly), permitted for production.
  const TILE_STYLE = 'https://tiles.openfreemap.org/styles/positron';

  onMount(() => {
    if (!container) return;
    map = new maplibregl.Map({
      container,
      style: TILE_STYLE,
      center: mapApi.camera.center,
      zoom: mapApi.camera.zoom,
      pitch: mapApi.camera.pitch,
      bearing: mapApi.camera.bearing,
    });

    map.on('move', () => {
      if (!map || isUpdatingFromCamera) return;
      const c = map.getCenter();
      mapApi.camera.center = [c.lng, c.lat];
      mapApi.camera.zoom = map.getZoom();
      mapApi.camera.pitch = map.getPitch();
      mapApi.camera.bearing = map.getBearing();
    });
  });

  onDestroy(() => {
    map?.remove();
    map = null;
  });

  // Camera state → maplibre. Re-runs on any field change. Guarded against the
  // maplibre 'move' callback above.
  $effect(() => {
    if (!map) return;
    const { center, zoom, pitch, bearing } = mapApi.camera;
    isUpdatingFromCamera = true;
    map.jumpTo({ center, zoom, pitch, bearing });
    isUpdatingFromCamera = false;
  });
</script>

<div class="map-view">
  <h2 class="map-view__heading">Map</h2>
  <div class="map-view__canvas" bind:this={container}></div>
</div>

{#if map}
  {#each [...mapApi.layers] as [id, entry] (id)}
    {@const Layer = entry.component}
    <Layer />
  {/each}
{/if}

<style>
  .map-view {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
  }
  .map-view__heading {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }
  .map-view__canvas {
    width: 100%;
    height: 400px;
    border-radius: 4px;
    overflow: hidden;
  }
</style>
```

- [ ] **Step 2: Confirm with the Svelte MCP that no autofixer issues remain**

Per CLAUDE.md: "You MUST use [`svelte-autofixer`] whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned."

Use the `mcp__svelte__svelte-autofixer` tool with the contents of `packages/extension-map/src/map-view.svelte`. Address any issues until autofixer returns clean.

- [ ] **Step 3: Run lint, check, test**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | tail -10`
Expected: all clean. Same 6 tests in extension-map still pass; workspace total still 220.

- [ ] **Step 4: Verify branch + commit**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && git branch --show-current`
Expected: `feat/map-and-flight-overlay`. STOP IF NOT.

Then:

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && \
  git add packages/extension-map/src/map-view.svelte && \
  git commit -m "$(cat <<'EOF'
feat(map): maplibre canvas + camera two-way binding + layer mount

Replaces the Task 1 placeholder view with the full implementation: maplibre
canvas with OpenFreeMap positron tiles, two-way camera binding (maplibre
move event ↔ mapApi.camera $state), registered-layer mount via Svelte
context (key 'gcscode.map.maplibre').

Spec: docs/specs/2026-05-03-map-and-flight-overlay.md
EOF
)"
```

Expected: commit succeeds; tree clean. The map view will render in the running app once Task 6 bundles it.

---

### Task 4: Scaffold @gcscode/extension-flight-overlay package — commit 3

**Files:**

- Create: `packages/extension-flight-overlay/package.json`
- Create: `packages/extension-flight-overlay/tsconfig.json`
- Create: `packages/extension-flight-overlay/src/flight-overlay-config.ts`
- Create: `packages/extension-flight-overlay/src/circle-polygon.ts`
- Create: `packages/extension-flight-overlay/src/circle-polygon.test.ts`
- Create: `packages/extension-flight-overlay/src/state.ts`
- Create: `packages/extension-flight-overlay/src/index.ts` (placeholder)
- Create: `packages/extension-flight-overlay/README.md`

This task scaffolds the entire `flight-overlay` package with:

- The package config (`package.json`, `tsconfig.json`).
- Config + circle-polygon helper + 4 unit tests.
- The `FlightOverlayState` class.
- A placeholder `index.ts` that exports a minimal extension shape (no layer registration yet — Task 5 fills in).
- A README.

The package is NOT yet bundled into the shell at the end of this task. Layer components and full activate logic come in Task 5 (commit 4).

**Reminder for subagents working in worktrees (per CLAUDE.md):** every bash command MUST be prefixed with `cd .worktrees/feat-map-and-flight-overlay/shell &&`.

#### Sub-section A: package directory + package.json + tsconfig + maplibre dep

- [ ] **Step 1: Create the package directory**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && mkdir -p packages/extension-flight-overlay/src/layers`
Expected: directory created (including the `layers/` subdirectory used in Task 5).

- [ ] **Step 2: Create `packages/extension-flight-overlay/package.json`**

```json
{
  "name": "@gcscode/extension-flight-overlay",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@gcscode/extension-api": "workspace:*",
    "@gcscode/extension-map": "workspace:*",
    "@gcscode/extension-sitl": "workspace:*"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

The `@gcscode/extension-map` and `@gcscode/extension-sitl` workspace deps are listed for **type-only** imports only (per ADR-0005). ESLint enforces this via `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` (existing config); a runtime sibling import will fail lint.

- [ ] **Step 3: Create `packages/extension-flight-overlay/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.svelte"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Add maplibre-gl as a runtime dep**

Run:

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && pnpm add maplibre-gl --filter @gcscode/extension-flight-overlay
```

Expected: pnpm resolves the same `maplibre-gl ^5.x.x` already used by the other packages and updates `pnpm-lock.yaml`.

- [ ] **Step 5: Verify the new package is discovered**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm list --filter @gcscode/extension-flight-overlay --depth 0 2>&1 | tail -10`
Expected: lists 4 deps (extension-api, extension-map, extension-sitl, maplibre-gl).

#### Sub-section B: config + circle-polygon

- [ ] **Step 6: Create `packages/extension-flight-overlay/src/flight-overlay-config.ts`**

```ts
/**
 * Hardcoded flight-overlay configuration. No settings system yet — when one
 * lands, these become user-tunable. Until then, edit and recompile.
 *
 * Coordinates match the SITL ArduCopter default starting point (Canberra) so
 * the overlay is sensible against the local mavlink2rest bridge out of the
 * box.
 */
export const homeLocation: [number, number] = [149.165_25, -35.363_26];

/** Max-distance circle radius around home, in meters. Round number — tunable. */
export const maxDistanceMeters = 200;
```

- [ ] **Step 7: Create `packages/extension-flight-overlay/src/circle-polygon.ts`**

```ts
/**
 * Approximate a geodesic circle as a closed polygon ring. Adequate for visual
 * geofence rendering at typical drone scales (sub-km radius, mid-latitudes).
 * Not intended for precise spatial calculations — turf.js or similar is the
 * right answer if/when that's needed.
 */
const EARTH_RADIUS_M = 6_378_137;
const SEGMENTS = 64;

export function computeCirclePolygon(
  center: readonly [number, number],
  radiusMeters: number,
): [number, number][] {
  const [lng, lat] = center;
  const latRad = (lat * Math.PI) / 180;
  const dLatDeg = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLngDeg = dLatDeg / Math.cos(latRad);

  const points: [number, number][] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const angle = (i / SEGMENTS) * 2 * Math.PI;
    points.push([lng + dLngDeg * Math.cos(angle), lat + dLatDeg * Math.sin(angle)]);
  }
  return points;
}
```

- [ ] **Step 8: Create `packages/extension-flight-overlay/src/circle-polygon.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

import { computeCirclePolygon } from './circle-polygon';

describe('computeCirclePolygon', () => {
  it('returns a closed ring (first and last point match)', () => {
    const ring = computeCirclePolygon([0, 0], 100);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('produces 65 points for 64 segments', () => {
    const ring = computeCirclePolygon([0, 0], 100);
    expect(ring).toHaveLength(65);
  });

  it('scales radius approximately linearly at the equator', () => {
    const small = computeCirclePolygon([0, 0], 100);
    const large = computeCirclePolygon([0, 0], 1000);
    const smallDLng = Math.abs(small[0][0] - 0);
    const largeDLng = Math.abs(large[0][0] - 0);
    expect(largeDLng / smallDLng).toBeCloseTo(10, 1);
  });

  it('contracts longitude offsets at higher latitudes', () => {
    const equator = computeCirclePolygon([0, 0], 100);
    const polar = computeCirclePolygon([0, 60], 100);
    expect(Math.abs(polar[0][0])).toBeGreaterThan(Math.abs(equator[0][0]));
  });
});
```

- [ ] **Step 9: Run circle-polygon tests**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm --filter @gcscode/extension-flight-overlay test`
Expected: 4 tests pass.

#### Sub-section C: state + placeholder index + README

- [ ] **Step 10: Create `packages/extension-flight-overlay/src/state.ts`**

```ts
import type { ExtensionHost } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';
import type { SitlExports } from '@gcscode/extension-sitl';

/**
 * Module-level singleton holding a reference to the host. `mapExports` /
 * `sitlExports` getters route through it; reads inside `$derived` / `$effect`
 * auto-track the underlying `SvelteMap` (per ADR-0005).
 */
class FlightOverlayState {
  private _host: ExtensionHost | null = null;

  public setHost(host: ExtensionHost): void {
    this._host = host;
  }

  public clearHost(): void {
    this._host = null;
  }

  public get mapExports(): MapApi | undefined {
    return this._host?.extensions.getExtension<MapApi>('gcscode.map')?.exports;
  }

  public get sitlExports(): SitlExports | undefined {
    return this._host?.extensions.getExtension<SitlExports>('gcscode.sitl')?.exports;
  }
}

export const flightOverlayState = new FlightOverlayState();
```

- [ ] **Step 11: Create placeholder `packages/extension-flight-overlay/src/index.ts`**

This placeholder declares the `flightOverlayExtension` const but does NOT yet register layers or validate map presence. Task 5 (commit 4) replaces it with the full version.

```ts
import type { Extension } from '@gcscode/extension-api';

import { flightOverlayState } from './state';

export const flightOverlayExtension: Extension = {
  manifest: {
    id: 'gcscode.flight-overlay',
    displayName: 'Flight Overlay',
    version: '0.0.0',
    description:
      'Drone marker, home location, and max-distance circle rendered on the map. First consumer of the map contribution API.',
  },
  activate(context) {
    // Placeholder. Task 5 (commit 4) replaces this with: validate map presence,
    // setHost, register three layer components, push three Disposables.
    flightOverlayState.setHost(context.host);
  },
  deactivate() {
    flightOverlayState.clearHost();
  },
};
```

- [ ] **Step 12: Create `packages/extension-flight-overlay/README.md`**

Use this content (note: triple-backtick code blocks are literal in the file):

```md
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
```

- [ ] **Step 13: Run lint, check, test**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | tail -10`
Expected: all clean. Workspace test count: 224 (220 + 4 circle-polygon tests).

- [ ] **Step 14: Verify branch + commit**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && git branch --show-current`
Expected: `feat/map-and-flight-overlay`. STOP IF NOT.

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && \
  git add packages/extension-flight-overlay/ pnpm-lock.yaml 2>/dev/null; \
  git add -u; \
  git status
```

Verify the staged set is the new flight-overlay package files plus the lockfile change. No unrelated files.

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && git commit -m "$(cat <<'EOF'
feat(flight-overlay): scaffold package with config, state, circle-polygon helper

Adds @gcscode/extension-flight-overlay workspace package with hardcoded
config (homeLocation + maxDistanceMeters), pure circle-polygon helper, the
FlightOverlayState singleton, and a placeholder extension shape. The next
commit fills in the three layer components and the full activate logic.

Spec: docs/specs/2026-05-03-map-and-flight-overlay.md
EOF
)"
```

Expected: commit succeeds; tree clean.

---

### Task 5: Flight-overlay layers + full activate + tests — commit 4

**Files:**

- Create: `packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte`
- Create: `packages/extension-flight-overlay/src/layers/home-location-layer.svelte`
- Create: `packages/extension-flight-overlay/src/layers/max-distance-circle-layer.svelte`
- Modify: `packages/extension-flight-overlay/src/index.ts` (replace placeholder)
- Create: `packages/extension-flight-overlay/src/index.test.ts`

This task adds the three layer components, replaces the placeholder `index.ts` with the full version (validates map presence, registers all three layers), and adds the 4 unit tests.

**Reminder for subagents working in worktrees (per CLAUDE.md):** every bash command MUST be prefixed with `cd .worktrees/feat-map-and-flight-overlay/shell &&`.

#### Sub-section A: three layer components

- [ ] **Step 1: Create `packages/extension-flight-overlay/src/layers/drone-marker-layer.svelte`**

```svelte
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { flightOverlayState } from '../state';

  // Re-declared string literal — public contract per @gcscode/extension-map
  // README. Do not runtime-import from sibling extensions (ADR-0005).
  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';

  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
  let marker: maplibregl.Marker | null = null;

  $effect(() => {
    const map = getMaplibre();
    if (!map) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    const sitl = flightOverlayState.sitlExports;
    if (!sitl) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    const { lat, lng } = sitl.telemetry;
    if (lat === null || lng === null) {
      if (marker) {
        marker.remove();
        marker = null;
      }
      return;
    }

    if (!marker) {
      marker = new maplibregl.Marker().setLngLat([lng, lat]).addTo(map);
    } else {
      marker.setLngLat([lng, lat]);
    }
  });

  onDestroy(() => {
    if (marker) {
      marker.remove();
      marker = null;
    }
  });
</script>
```

(No template — the component renders no visible DOM. Its job is the imperative `$effect`.)

- [ ] **Step 2: Create `packages/extension-flight-overlay/src/layers/home-location-layer.svelte`**

```svelte
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { homeLocation } from '../flight-overlay-config';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);
  let marker: maplibregl.Marker | null = null;

  $effect(() => {
    const map = getMaplibre();
    if (!map) return;

    if (!marker) {
      // Distinct color so home is visually different from the drone marker.
      marker = new maplibregl.Marker({ color: '#3b82f6' }).setLngLat(homeLocation).addTo(map);
    }
  });

  onDestroy(() => {
    if (marker) {
      marker.remove();
      marker = null;
    }
  });
</script>
```

- [ ] **Step 3: Create `packages/extension-flight-overlay/src/layers/max-distance-circle-layer.svelte`**

```svelte
<script lang="ts">
  import maplibregl from 'maplibre-gl';
  import { getContext, onDestroy } from 'svelte';

  import { computeCirclePolygon } from '../circle-polygon';
  import { homeLocation, maxDistanceMeters } from '../flight-overlay-config';

  const MAPLIBRE_CONTEXT_KEY = 'gcscode.map.maplibre';
  const getMaplibre = getContext<() => maplibregl.Map | null>(MAPLIBRE_CONTEXT_KEY);

  const SOURCE_ID = 'gcscode.flight-overlay.max-distance.source';
  const LAYER_ID = 'gcscode.flight-overlay.max-distance.layer';

  let installed = false;

  function install(map: maplibregl.Map) {
    if (installed) return;
    if (map.getSource(SOURCE_ID)) return;

    const ring = computeCirclePolygon(homeLocation, maxDistanceMeters);
    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {},
      },
    });
    map.addLayer({
      id: LAYER_ID,
      type: 'line',
      source: SOURCE_ID,
      paint: { 'line-color': '#ef4444', 'line-width': 2 },
    });
    installed = true;
  }

  function uninstall(map: maplibregl.Map) {
    if (!installed) return;
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    installed = false;
  }

  $effect(() => {
    const map = getMaplibre();
    if (!map) return;

    // addSource / addLayer require the style to be loaded. If it's already
    // loaded, install immediately. Otherwise wait for the 'load' event once.
    if (map.isStyleLoaded()) {
      install(map);
    } else {
      const onLoad = () => install(map);
      map.once('load', onLoad);
      return () => {
        map.off('load', onLoad);
      };
    }
  });

  onDestroy(() => {
    const map = getMaplibre();
    if (map) uninstall(map);
  });
</script>
```

- [ ] **Step 4: Run svelte-autofixer on all three layer components**

Per CLAUDE.md, use `mcp__svelte__svelte-autofixer` against each layer file. Address any issues until clean.

#### Sub-section B: full index.ts + tests

- [ ] **Step 5: Replace `packages/extension-flight-overlay/src/index.ts` with the full version**

```ts
import type { Extension } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';

import DroneMarkerLayer from './layers/drone-marker-layer.svelte';
import HomeLocationLayer from './layers/home-location-layer.svelte';
import MaxDistanceCircleLayer from './layers/max-distance-circle-layer.svelte';
import { flightOverlayState } from './state';

export const flightOverlayExtension: Extension = {
  manifest: {
    id: 'gcscode.flight-overlay',
    displayName: 'Flight Overlay',
    version: '0.0.0',
    description:
      'Drone marker, home location, and max-distance circle rendered on the map. First consumer of the map contribution API.',
  },
  activate(context) {
    // Validate before capturing host — if activate throws, we want no leftover
    // state in the singleton. Layers' $effect reads route through state, so
    // host capture must happen before any layer mounts (which can't happen
    // before registerLayer is called below).
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
    );
  },
  deactivate() {
    flightOverlayState.clearHost();
  },
};
```

- [ ] **Step 6: Create `packages/extension-flight-overlay/src/index.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';
import type { SitlExports } from '@gcscode/extension-sitl';

import { flightOverlayExtension } from './index';
import { flightOverlayState } from './state';

function makeFakeHost(opts: {
  getExtension?: ExtensionHost['extensions']['getExtension'];
}): ExtensionHost {
  return {
    window: {
      registerView: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      registerStatusBarItem: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['commands']['executeCommand'],
    },
    keybindings: {
      registerKeybinding: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    },
    extensions: {
      getExtension: opts.getExtension ?? vi.fn(() => undefined),
    },
  };
}

function makeFakeMapExports(): MapApi {
  return {
    registerLayer: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    camera: { center: [0, 0], zoom: 1, pitch: 0, bearing: 0 },
  };
}

describe('flightOverlayExtension', () => {
  it('declares stable identity metadata', () => {
    expect(flightOverlayExtension.manifest.id).toBe('gcscode.flight-overlay');
    expect(flightOverlayExtension.manifest.displayName).toBe('Flight Overlay');
    expect(typeof flightOverlayExtension.manifest.version).toBe('string');
  });

  it('activate registers three layers when map is active', () => {
    const fakeMap = makeFakeMapExports();
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) =>
        id === 'gcscode.map' ? { id, exports: fakeMap as unknown } : undefined,
      ) as ExtensionHost['extensions']['getExtension'],
    });
    const subscriptions: Disposable[] = [];

    flightOverlayExtension.activate({
      host,
      subscriptions,
      extension: {
        id: flightOverlayExtension.manifest.id,
        displayName: flightOverlayExtension.manifest.displayName,
        version: flightOverlayExtension.manifest.version,
      },
    });

    expect(fakeMap.registerLayer).toHaveBeenCalledTimes(3);
    expect(subscriptions).toHaveLength(3);

    flightOverlayExtension.deactivate?.();
  });

  it('activate throws when gcscode.map is not active', () => {
    const host = makeFakeHost({
      getExtension: vi.fn(() => undefined),
    });

    expect(() =>
      flightOverlayExtension.activate({
        host,
        subscriptions: [],
        extension: {
          id: flightOverlayExtension.manifest.id,
          displayName: flightOverlayExtension.manifest.displayName,
          version: flightOverlayExtension.manifest.version,
        },
      }),
    ).toThrow(/gcscode\.map/);
  });

  it('flightOverlayState exposes mapExports and sitlExports through the captured host', () => {
    const fakeMap = makeFakeMapExports();
    const fakeSitl: SitlExports = {
      telemetry: {
        mode: 'GUIDED',
        armed: true,
        lat: -35.36,
        lng: 149.16,
        alt: 5,
        heading: 0,
        roll: 0,
        pitch: 0,
        yaw: 0,
        groundspeed: 0,
        voltageBattery: 12.5,
        batteryRemaining: 50,
        connection: 'connected',
      },
    };
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) => {
        if (id === 'gcscode.map') return { id, exports: fakeMap as unknown };
        if (id === 'gcscode.sitl') return { id, exports: fakeSitl as unknown };
        return undefined;
      }) as ExtensionHost['extensions']['getExtension'],
    });

    flightOverlayExtension.activate({
      host,
      subscriptions: [],
      extension: {
        id: flightOverlayExtension.manifest.id,
        displayName: flightOverlayExtension.manifest.displayName,
        version: flightOverlayExtension.manifest.version,
      },
    });

    expect(flightOverlayState.mapExports).toBe(fakeMap);
    expect(flightOverlayState.sitlExports).toBe(fakeSitl);

    flightOverlayExtension.deactivate?.();
    expect(flightOverlayState.mapExports).toBeUndefined();
    expect(flightOverlayState.sitlExports).toBeUndefined();
  });
});
```

The fake `SitlExports.telemetry` shape mirrors the live `TelemetryState` (referenced via `import type { SitlExports }`). If the SITL telemetry state's fields shift later, this test gets a TS error and is updated in lockstep.

If TypeScript complains that the fake `telemetry` literal doesn't satisfy `Readonly<TelemetryState>` because of missing fields, **read the live `TelemetryState` definition in `packages/extension-sitl/src/telemetry-store.svelte.ts`** and align the test fixture's keys + types. Do not loosen the typing of `fakeSitl`.

- [ ] **Step 7: Run flight-overlay tests**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm --filter @gcscode/extension-flight-overlay test`
Expected: 8 tests pass (4 circle-polygon + 4 index).

- [ ] **Step 8: Run full lint, check, test, format**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | tail -10`
Expected: all clean. Workspace test count: 228 (224 + 4 new index tests).

- [ ] **Step 9: Verify branch + commit**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && git branch --show-current`
Expected: `feat/map-and-flight-overlay`. STOP IF NOT.

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && \
  git add packages/extension-flight-overlay/src/layers/ \
          packages/extension-flight-overlay/src/index.ts \
          packages/extension-flight-overlay/src/index.test.ts && \
  git commit -m "$(cat <<'EOF'
feat(flight-overlay): three layer components + activate registers them

Adds drone-marker (live SITL), home-location (hardcoded), and
max-distance-circle (hardcoded geofence) layer components. Replaces the
placeholder activate with the full version that validates map presence
before capturing host and registers the three layers.

4 new index tests cover: manifest, activate-registers-three-layers,
activate-throws-without-map, state-exposes-both-cross-extension-getters.

Spec: docs/specs/2026-05-03-map-and-flight-overlay.md
EOF
)"
```

Expected: commit succeeds; tree clean.

---

### Task 6: Bundle map + flight-overlay into shell + browser smoke — commit 5

**Files:**

- Modify: `packages/shell/src/extension-host/bundled-extensions.ts`
- Modify: `packages/shell/package.json`

This task wires both new extensions into the running app. After this commit, `pnpm dev` shows the new Map view alongside the existing Map (demo) view, with the flight-overlay's three layers rendered on the new Map.

**Reminder for subagents working in worktrees (per CLAUDE.md):** every bash command MUST be prefixed with `cd .worktrees/feat-map-and-flight-overlay/shell &&`.

- [ ] **Step 1: Modify `packages/shell/src/extension-host/bundled-extensions.ts`**

Add two new imports (alphabetically after `extension-example`, before `extension-map-demo`):

```diff
 import { exampleExtension } from '@gcscode/extension-example';
+import { flightOverlayExtension } from '@gcscode/extension-flight-overlay';
+import { mapExtension } from '@gcscode/extension-map';
 import { mapDemoExtension } from '@gcscode/extension-map-demo';
 import { sitlExtension } from '@gcscode/extension-sitl';
 import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status';
```

Add two new array entries AFTER the `mapDemoExtension` entry (map first, then flight-overlay; flight-overlay must come after map per its activate-time validation):

```diff
   { id: vehicleStatusExtension.manifest.id, extension: vehicleStatusExtension },
   // Same SITL-after constraint as vehicle-status — map-demo reads SITL exports.
   { id: mapDemoExtension.manifest.id, extension: mapDemoExtension },
+  // Map exposes a contribution API consumed by flight-overlay; it must
+  // activate before flight-overlay. No ordering requirement vs. sitl.
+  { id: mapExtension.manifest.id, extension: mapExtension },
+  // Must come after mapExtension — flight-overlay reads map exports during
+  // its activate(). Throws if map is not active. Same insertion-order
+  // pattern as vehicle-status and map-demo.
+  { id: flightOverlayExtension.manifest.id, extension: flightOverlayExtension },
 ];
```

- [ ] **Step 2: Modify `packages/shell/package.json`**

Add the two new workspace deps (alphabetically — `extension-flight-overlay` after `extension-example`, `extension-map` before `extension-map-demo`):

```diff
   "dependencies": {
     "@gcscode/extension-api": "workspace:*",
     "@gcscode/extension-example": "workspace:*",
+    "@gcscode/extension-flight-overlay": "workspace:*",
+    "@gcscode/extension-map": "workspace:*",
     "@gcscode/extension-map-demo": "workspace:*",
     "@gcscode/extension-sitl": "workspace:*",
     "@gcscode/extension-vehicle-status": "workspace:*",
     "fuse.js": "^7.3.0"
   }
```

- [ ] **Step 3: Run pnpm install to sync workspace deps**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm install`
Expected: shell now sees both new packages as workspace deps. Lockfile updates if it hadn't already.

- [ ] **Step 4: Run lint, check, test, format**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | tail -10`
Expected: all clean. Workspace test count: 228 (no new tests in this task).

- [ ] **Step 5: Browser smoke — without SITL backend**

Start the dev server: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm dev`

Open the displayed local URL (typically `http://localhost:5173`). Verify:

- App boots; no console errors (other than expected mavlink2rest WebSocket-failed messages — SITL isn't running).
- Five UI elements render in the content stack (top to bottom): Example Extension view, SITL Telemetry view (showing "no fix"), **Map (demo)** view, **Map** (new) view. Vehicle Status status item is in the footer.
- The new **Map** view shows OpenFreeMap positron tiles centered at Canberra (zoom 13).
- On the new **Map**: a blue marker (home) appears at the hardcoded home location; a red ring (max-distance circle) is drawn around home. NO drone marker (SITL has null lat/lng).
- Mouse pan and zoom work on the new Map (unlike map-demo, which disables pan).
- Open `Ctrl+Shift+X` (extensions panel). Verify both `Map` and `Flight Overlay` appear in the list, both enabled by default.
- Disable `Flight Overlay` via the panel. The home marker and red ring disappear from the new Map; the canvas remains, basemap still rendered. Re-enable: layers reappear.
- Disable `Map` via the panel. The new Map view disappears entirely from the content stack. Flight Overlay is still active in the registry (its activate already ran and registered layers in the singleton); the layers' `onDestroy` already fired when their components unmounted.
- Re-enable `Map`. The view re-mounts with a fresh maplibre instance. Flight Overlay's `Disposable`s in its `subscriptions` still hold references in the singleton registry, so the same three layers re-render against the new maplibre instance. Verify home marker + circle are visible.

Stop the dev server (`Ctrl+C`).

- [ ] **Step 6: Browser smoke — with SITL backend (optional but recommended)**

If a local mavlink2rest + ArduPilot SITL is available, repeat the smoke with the SITL backend running. Verify:

- The drone marker (default teardrop pin) appears on the new Map at the live SITL position; the marker tracks the drone as it moves.
- The home marker + circle are still visible (independent of SITL).
- Disable `SITL Telemetry`: drone marker disappears; home + circle persist. Re-enable: drone marker reappears.

Skip this step if no local SITL is available — the smoke from Step 5 is sufficient to verify the architecture; SITL-backed marker tracking was already verified in the map-demo iteration.

- [ ] **Step 7: Verify branch + commit**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && git branch --show-current`
Expected: `feat/map-and-flight-overlay`. STOP IF NOT.

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && \
  git add packages/shell/src/extension-host/bundled-extensions.ts \
          packages/shell/package.json \
          pnpm-lock.yaml && \
  git commit -m "$(cat <<'EOF'
feat(shell): bundle map + flight-overlay into shell

Adds @gcscode/extension-map and @gcscode/extension-flight-overlay to
bundledExtensions (in that order, after map-demo). Map activates first;
flight-overlay validates map presence and registers its three layers.

Browser smoke verified: real Map renders alongside Map (demo); home marker
+ max-distance circle visible; drone marker tracks SITL when backend is
running.

Spec: docs/specs/2026-05-03-map-and-flight-overlay.md
EOF
)"
```

Expected: commit succeeds; tree clean.

---

### Task 7: Docs propagation — commit 6

**Files:**

- Modify: `docs/roadmap.md`
- Modify: `docs/vs-code-alignment.md`
- Modify: `docs/out-of-scope.md`

This task propagates the iteration's outcomes to the long-lived doc indexes. Pure docs commit — no code, no tests.

**Reminder for subagents working in worktrees (per CLAUDE.md):** every bash command MUST be prefixed with `cd .worktrees/feat-map-and-flight-overlay/shell &&`.

- [ ] **Step 1: Modify `docs/roadmap.md` — tick Map; add flight-overlay**

Find the existing line under Feature extensions → Coming:

```md
- [ ] **Map** — geographical view + selection state. Likely fits the existing view contribution kind; may surface a need for shared map state.
```

Replace with:

```md
- [x] **Map** — geographical view + map contribution API for layer registration. First service-style extension. Selection state deferred to a later iteration. Spec: [`specs/2026-05-03-map-and-flight-overlay.md`](specs/2026-05-03-map-and-flight-overlay.md).
```

Then add a new line **after** the `Map` line and **before** the `Video feed` line:

```md
- [x] **Flight overlay** — first consumer of the `gcscode.map` contribution API. `@gcscode/extension-flight-overlay` registers drone-marker (live SITL), home-location (hardcoded), and max-distance-circle (hardcoded) layers. Validates the service-style extension pattern. Spec: [`specs/2026-05-03-map-and-flight-overlay.md`](specs/2026-05-03-map-and-flight-overlay.md).
```

The `Map (demo)` line stays as-is — the demo is not removed in this iteration.

- [ ] **Step 2: Modify `docs/vs-code-alignment.md` — add Alignments row**

Append to the Alignments table (after the existing last row, `Ctrl+Shift+X` default keybinding):

```md
| Service-style extension exposing contribution surface for other extensions | ✓ (editor + decorations / hover providers / language services) | ✓ (`gcscode.map` + `registerLayer`) | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md) |
```

- [ ] **Step 3: Modify `docs/vs-code-alignment.md` — add Divergences row**

Append to the Divergences table (after the existing last row, `Extensions panel surface`):

```md
| Cross-extension Svelte context for shared runtime instances | N/A — VS Code has no Svelte | string-keyed context (`'gcscode.map.maplibre'`); consumers re-declare the key independently rather than runtime-importing it | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [ADR-0005](decisions/ADR-0005-extension-boundaries.md) | Third consumer surface where re-declaration becomes brittle, OR capability-declaration system that publishes named constants |
```

- [ ] **Step 4: Modify `docs/vs-code-alignment.md` — add Deferrals rows**

Append to the Deferrals table (after the existing last row, `Modal stacking`):

```md
| Layer ordering / z-index API on contribution surface | ✓ (decorations have explicit ordering) | ✗ — registration order only | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | Third-party wants to insert between two first-party layers (mirrors status-bar `priority` row) |
| Animated camera transitions (`flyTo` / `easeTo`) | ✓ (smooth editor reveal) | ✗ — `jumpTo` only | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | First consumer needing pan-to-selection animation, or follow-mode iteration |
| Camera coordination between multiple consumers | N/A (single-editor) | last-write-wins; no locks or priorities | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | First real conflict — two extensions writing camera in the same tick clobbering each other |
| Map UI controls rendered into a contribution surface | (N/A) | ✗ — map is canvas-only; no overlay slots for extension-rendered controls | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | First consumer needing a map control (zoom button, recenter button, layer panel) — likely operator UX iteration |
```

- [ ] **Step 5: Modify `docs/out-of-scope.md` — append entries to "Extension machinery" section**

Find the bottom of the `## Extension machinery` section (just before `## Tooling / process`). Append these five bullets:

```md
- **Animated camera transitions on the map.** No `flyTo` / `easeTo` exposed on `MapApi`; camera writes are instant via `jumpTo`. _Trigger to revisit:_ first consumer needing a pan-to-selection animation, or the follow-mode iteration. See `docs/specs/2026-05-03-map-and-flight-overlay.md`.
- **Camera coordination between map consumers.** No locks, priorities, or contention API. Multiple consumers writing the camera in the same tick: last-write-wins. _Trigger to revisit:_ first real conflict between two extensions trying to control the camera.
- **Layer ordering / z-index API on the map.** `MapApi.registerLayer` does not accept an order/priority field; layers paint in registration order. Mirrors the status-bar `priority` deferral. _Trigger to revisit:_ third-party wants to insert between two first-party layers.
- **Map UI controls / overlay slots.** No surface for extensions to render controls (zoom buttons, recenter button, layer panel) on top of the map. The map is canvas-only. _Trigger to revisit:_ first consumer needing a map control, or operator UX iteration on map chrome.
- **Cross-extension Svelte context constants published by the host.** Today consumers re-declare context keys (e.g. `'gcscode.map.maplibre'`) as string literals matching the producer's contract — runtime sibling imports are forbidden by ADR-0005. _Trigger to revisit:_ a third consumer surface where re-declaration becomes brittle, OR a capability-declaration system that publishes named constants centrally.
```

- [ ] **Step 6: Run lint + format on the docs**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | tail -10`
Expected: all clean. No new tests (docs only). Workspace count still 228.

- [ ] **Step 7: Verify branch + commit**

Run: `cd .worktrees/feat-map-and-flight-overlay/shell && git branch --show-current`
Expected: `feat/map-and-flight-overlay`. STOP IF NOT.

```bash
cd .worktrees/feat-map-and-flight-overlay/shell && \
  git add docs/roadmap.md docs/vs-code-alignment.md docs/out-of-scope.md && \
  git commit -m "$(cat <<'EOF'
docs: roadmap + alignment ledger + out-of-scope propagation for map iteration

- Roadmap: tick Map; add flight-overlay under Coming.
- VS Code alignment: 1 alignment row (service-style extension), 1 divergence
  row (cross-extension Svelte context), 4 deferral rows (layer ordering,
  animated camera, camera coordination, map UI controls).
- Out of scope: 5 new entries (animated camera, camera coordination, layer
  ordering, map UI controls, cross-extension Svelte context constants).

Spec: docs/specs/2026-05-03-map-and-flight-overlay.md
EOF
)"
```

Expected: commit succeeds; tree clean.

---

### Task 8: Final cross-cutting code review + merge

Per CLAUDE.md: "After all tasks land, dispatch a final cross-cutting code review over the full branch before merging via `superpowers:finishing-a-development-branch`."

- [ ] **Step 1: Final code review**

Dispatch a `superpowers:code-reviewer` subagent against the full branch (`master..feat/map-and-flight-overlay`). The subagent reads:

- The spec (`docs/specs/2026-05-03-map-and-flight-overlay.md`).
- The full branch diff (`git diff master..feat/map-and-flight-overlay`).
- The CLAUDE.md and ADR-0005 / ADR-0007 for boundary rules.

The review covers:

- Spec compliance: does every "Goals" bullet have a corresponding implementation? Does every "Non-goals" bullet stay un-built?
- Cross-extension boundary: any runtime sibling imports in flight-overlay? Any ADR-0005 violations?
- Test coverage: do the unit tests cover the contracts asserted by the spec?
- Code quality: any bug-prone patterns (loop guards, lifecycle ordering, etc.)?
- Doc propagation: do the alignment ledger / out-of-scope / roadmap edits match the spec's propagation sections?

Address review feedback as `Code-review-followup:` commits per CLAUDE.md (NOT amends — the review trail is part of history).

- [ ] **Step 2: Merge via finishing-a-development-branch skill**

Once review is clean, invoke `superpowers:finishing-a-development-branch`. The skill will guide merging `feat/map-and-flight-overlay` into `master` with `git merge --no-ff` per CLAUDE.md.

After merge, verify:

```bash
git checkout master && git log --oneline -10
```

The merge commit + the 6 feat/docs commits should appear in chronological order. The feat branch is preserved in `git log` thanks to `--no-ff`.

- [ ] **Step 3: Clean up worktree**

```bash
git worktree remove .worktrees/feat-map-and-flight-overlay
```

The branch reference (`feat/map-and-flight-overlay`) stays in the repo for future reference.

---

## Post-merge verification

- `git log --oneline | head -10` — confirms 6 feat/docs commits + 1 merge commit on master.
- `pnpm install && pnpm format && pnpm lint && pnpm check && pnpm test 2>&1 | tail -10` from master — all clean. Workspace test count: 228 (baseline 214 + 14 new).
- `pnpm dev` — both Map (demo) and Map views render; flight-overlay's three layers visible on the new Map.
