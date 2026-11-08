# map-gl-svelte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Svelte 5 port of `@vis.gl/react-maplibre` v8.1.3 as `packages/map-gl-svelte`: upstream's public API, Svelte's fine-grained reactivity inside, tested against real MapLibre in real Chromium.

**Architecture:** A `Maplibre` wrapper class (upstream's core, translated) holds the map, the camera hook and the event tables, and reads the component's live props object at call time. Thin Svelte components (`<Map>`, `<Source>`, `<Layer>`, `<Marker>`, `<Popup>`, eight controls) drive it with one effect per MapLibre call. Upstream's source at `scratch/react-map-gl/modules/react-maplibre/src/` is the reference for every behavior; each task names the upstream file it translates.

**Tech Stack:** Svelte 5.55 (runes), TypeScript 6, maplibre-gl 5.24, Vitest 4.1.5 browser mode with `@vitest/browser-playwright` 4.1.5 and Playwright 1.64 (Chromium), Vite 8.

**Spec:** [`docs/specs/2026-10-24-map-gl-svelte.md`](../specs/2026-10-24-map-gl-svelte.md). Read it before any task. Its "Upstream mechanisms to preserve" are numbered; tasks cite them as **M1**–**M27**.

## Global Constraints

- Upstream pin: `visgl/react-map-gl` tag `v8.1.3`, `modules/react-maplibre/` only. Reference clone at `scratch/react-map-gl` (gitignored; `git clone --depth 1 --branch v8.1.3 https://github.com/visgl/react-map-gl.git scratch/react-map-gl` if missing).
- Package `map-gl-svelte`, `"private": true`, version `0.0.1`, source-as-entrypoint, no build step. Peers: `svelte ^5.0.0`, `maplibre-gl >=5.0.0`; tested against the workspace's `maplibre-gl` 5.24.
- Public API mirrors upstream: same export names, props, callback names, event payload shapes. Every deviation is in the spec's "Svelte translations" table or this plan, and ends up in the README.
- Private MapLibre API allowed: `map.style._loaded`; `map._container`, `map._resizeObserver`, `map._update` (map reuse only); controls' `_container` and `FullscreenControl._controlContainer` (control `style` only). Forced redraw uses public `map.redraw()`, never `_frame`/`_render`. `GeolocateControl._setupUI` is not patched.
- Object props update on **reassignment, not mutation**. No `$state.snapshot` of previous values.
- A camera field (`longitude`, `latitude`, `zoom`, `pitch`, `bearing`, `padding`) is controlled when its value is not `undefined`.
- Filenames kebab-case (`.svelte` too). Tests co-located as `*.test.ts`, or `*.svelte.test.ts` when they use runes. Classes follow the repo's Svelte external-state convention: explicit `private`/`public`, `_backingField`, get/set accessors.
- Tests never touch the network: inline styles only (`EMPTY_STYLE`, `backgroundStyle()` from Task 1).
- Upstream's tests target MapLibre `^6`; the port runs on 5.24. When a translated test fails, decide by reading whether it's a port bug or a version difference. A version difference gets its test adjusted, with the reason in the task report (Task 8 moves it into the README), never silently.
- Every new test is seen failing once: apply the task's listed mutation, run, watch that test fail for the stated reason, restore, and report the mutation in the task report.
- Don't touch `packages/extension-map`, `map-view.svelte`, or any package other than `map-gl-svelte`. Workspace-level changes are limited to `pnpm-lock.yaml`.
- Every Bash call starts with `cd <repo>/.worktrees/feat-map-gl-svelte/shell &&`. Before every commit, `git branch --show-current` must print `feat/map-gl-svelte`; if not, stop.
- Commit messages: `feat(map-gl-svelte): …`, review fixes as separate `Code-review-followup: …` commits, never amends. End with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Done means `pnpm --filter map-gl-svelte test`, `pnpm --filter map-gl-svelte check` and `pnpm lint` all pass.

## Review Focus

Inputs the spec implies but no translated upstream test exercises. Each has a test in its owning task.

1. **Zoom or pitch limits changed together in the direction where a naive order makes min > max** (`minZoom` 0→10 and `maxZoom` 8→15 in one update): no error, final limits 10 and 15. → Task 3.
2. **`<Map>` unmounted while `mapLib` is still loading:** no map created, no `onLoad`, nothing thrown, no `console.error`. → Task 3.
3. **Callback props changed after mount** (`undefined` → function, function A → function B): the current callback fires; the old one never fires again. → Task 2.
4. **A flat `<Layer source="pts">` whose Source mounts, unmounts and mounts again:** the layer appears, disappears without an `error` event, then reappears. → Task 4.
5. **A whole map tree unmounted at once** (Map with Source, Layers, Marker, Popup and controls): no uncaught error, no `console.error`, and the Popup's `onClose` isn't called. → Task 7.

---

## File structure

All paths below are under `packages/map-gl-svelte/`.

| Path                                                                                                 | Responsibility                                     | Upstream counterpart                                |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| `package.json`, `LICENSE`, `README.md`, `tsconfig.json`, `svelte.config.js`, `vitest.config.ts`      | Package, license, docs, tooling                    | —                                                   |
| `src/index.ts`                                                                                       | Public exports                                     | `src/index.ts`                                      |
| `src/test-setup.ts`, `src/css.d.ts`                                                                  | Browser-test setup; CSS module typing              | `test/browser-test-setup.ts`                        |
| `src/test-utils/map-test-utils.ts`                                                                   | Test helpers shared by all tasks                   | `test/utils/test-utils.jsx`                         |
| `src/test-fixtures/*.svelte`                                                                         | Composed component trees for tests, added per task | —                                                   |
| `src/types/{common,events,lib,style-spec,internal}.ts`                                               | Public and internal types                          | `src/types/*`                                       |
| `src/utils/{assert,deep-equal,compare-class-names,apply-style,style-utils,transform,set-globals}.ts` | Pure helpers                                       | `src/utils/*` (`apply-react-style` → `apply-style`) |
| `src/maplibre/maplibre.ts`, `src/maplibre/create-ref.ts`                                             | The wrapper class; the `MapRef` fence              | `src/maplibre/*`                                    |
| `src/components/map-context.ts`, `map.svelte`                                                        | Map context; `<Map>`                               | `src/components/map.tsx`                            |
| `src/components/source-context.ts`, `source.svelte`, `layer.svelte`                                  | Source id context; `<Source>`, `<Layer>`           | `source.ts`, `layer.ts`                             |
| `src/components/snippet-host.svelte`                                                                 | Renders a snippet into a MapLibre-owned element    | (replaces `createPortal`)                           |
| `src/components/marker.svelte`, `popup.svelte`                                                       | `<Marker>`, `<Popup>`                              | `marker.ts`, `popup.ts`                             |
| `src/components/use-control.ts`, `*-control.svelte` (8)                                              | `useControl`; built-in controls                    | `use-control.ts`, `*-control.ts`                    |
| `src/components/map-provider.svelte`, `use-map.svelte.ts`                                            | `<MapProvider>`, `useMap`                          | `use-map.tsx`                                       |
| `demo/`                                                                                              | Demo app on port 5175                              | `examples/maplibre/*` (a few)                       |

---

### Task 1: Package scaffold, browser test harness, types and pure utilities

**Files:**

- Create: `package.json`, `LICENSE`, `README.md` (stub: one paragraph + attribution line; Task 8 fills it in), `tsconfig.json`, `svelte.config.js`, `vitest.config.ts`, `src/index.ts`, `src/test-setup.ts`, `src/css.d.ts`, `src/test-utils/map-test-utils.ts`, `src/types/*.ts`, `src/utils/*.ts`
- Test: `src/utils/{deep-equal,compare-class-names,apply-style,style-utils,transform,set-globals}.test.ts`, `src/test-utils/map-test-utils.test.ts`
- Modify: `pnpm-lock.yaml` (via install)

**Interfaces:**

- Produces (types, ported from upstream `src/types/`): `ViewState`, `MapCallbacks`, `ViewStateChangeEvent`, `MapEvent`, `MapMouseEvent` (with `features?`), `ErrorEvent`, `MarkerEvent`, `MarkerDragEvent`, `PopupEvent`, `GeolocateEvent` family, `MapInstance`, `MapLib`, `MapOptions`, `MarkerInstance`, `PopupInstance`, control instance/options types, `TransformLike`, style-spec types. Style-spec types come from `maplibre-gl`'s own exports (it exports `StyleSpecification`, `LayerSpecification`, `SourceSpecification`, `FilterSpecification`, `LightSpecification`, `SkySpecification`, `TerrainSpecification`, `ProjectionSpecification`, …); no `@maplibre/maplibre-gl-style-spec` dependency. React types become plain DOM types.
- Produces (utils): `deepEqual(a, b): boolean`, `arePointsEqual(a?, b?): boolean`, `compareClassNames(prev?: string, next?: string): string[] | null`, `applyStyle(element: HTMLElement, style: CSSProperties | undefined): void` with `type CSSProperties = Record<string, string | number>` (camelCase keys, unitless rule as upstream), `normalizeStyle(style)`, `getTransformLike(map)`, `transformToViewState(tr)`, `applyViewStateToTransform(tr, props): Partial<TransformLike>`, `updateZoomConstraint(map, next, current): boolean`, `updatePitchConstraint(map, next, current): boolean`, `type ConstraintRange`, `setGlobals(mapLib, props: GlobalSettings): void`, `assert(condition, message)`.
- Produces (test utils): `createContainer(width = 400, height = 300): HTMLDivElement` (appended to `document.body`), `waitForEvent(map, type): Promise<unknown>`, `waitForLoad(map): Promise<void>` (resolves at once if loaded), `waitForStyleLoad(map): Promise<void>`, `sleep(ms): Promise<void>`, `EMPTY_STYLE: StyleSpecification` (`{version: 8, sources: {}, layers: []}`), `backgroundStyle(color: string): StyleSpecification` (one `background` layer with id `bg`).

- [ ] **Step 1: Scaffold the package**

`package.json` mirrors `packages/dockview-svelte/package.json`: same `exports`/`main`/`types` shape pointing at `./src/index.ts`, same `check`/`test`/`test:watch` scripts, `"demo": "vite --config demo/vite.config.ts"`. `peerDependencies`: `svelte ^5.0.0`, `maplibre-gl >=5.0.0`. `devDependencies`: `maplibre-gl ^5.24.0`, `@vitest/browser-playwright 4.1.5`, `playwright ^1.64.1`. `tsconfig.json` and `svelte.config.js` copy dockview-svelte's. `src/css.d.ts` copies `packages/extension-map/src/css.d.ts`. `LICENSE` reproduces upstream's `LICENSE` verbatim and adds one line above it: `map-gl-svelte is a Svelte port of @vis.gl/react-maplibre (react-map-gl v8.1.3), distributed under the same license.`

`vitest.config.ts` (verify option names against Vitest 4.1.5 if it errors):

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test-setup.ts'],
    fileParallelism: false,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
```

`src/test-setup.ts` imports `maplibre-gl/dist/maplibre-gl.css` and stubs `navigator.permissions.query` for `geolocation` to resolve `granted`, as upstream's `test/browser-test-setup.ts` does. The v6 worker-URL lines are not needed on 5.24.

Run: `pnpm install && pnpm --filter map-gl-svelte exec playwright install chromium`
Expected: install succeeds; Chromium downloads.

- [ ] **Step 2: Write the harness smoke test** in `src/test-utils/map-test-utils.test.ts`

```ts
test('real MapLibre renders in the browser harness', async () => {
  const map = new maplibregl.Map({
    container: createContainer(),
    style: backgroundStyle('#123456'),
  });
  await waitForLoad(map);
  expect(map.isStyleLoaded()).toBe(true);
  expect(map.getLayer('bg')).toBeTruthy();
  map.remove();
});
```

- [ ] **Step 3: Run it to see it fail** — `pnpm --filter map-gl-svelte exec vitest run src/test-utils` → FAIL, `createContainer` is not defined.

- [ ] **Step 4: Implement `src/test-utils/map-test-utils.ts`**, run again → PASS. This proves WebGL works in headless Chromium.

- [ ] **Step 5: Translate upstream's util tests** into the six test files. Cases: `compareClassNames`, `deepEqual`, `arePointsEqual`, `applyReactStyle` (as `applyStyle`), `normalizeStyle`, `getTransformLike`, `transformToViewState`, `applyViewStateToTransform`, `updateZoomConstraint`, `updatePitchConstraint`. Keep each upstream assertion. **Drop** `getTransformLike#pre-v5`: the port's peer floor is MapLibre 5; list it in the task report. Add one case to `transform.test.ts`, the "controlled = not undefined" row of the spec:

```ts
test('applyViewStateToTransform ignores undefined camera fields', () => {
  const tr = getTransformLike(map); // zoom 4
  expect(applyViewStateToTransform(tr, { zoom: undefined, pitch: undefined })).toEqual({});
  expect(applyViewStateToTransform(tr, { zoom: 6 })).toEqual({ zoom: 6 });
});
```

Add `set-globals.test.ts`: with a fake `mapLib` recording calls, `setGlobals(fake, { maxParallelImageRequests: 8, workerCount: 3, workerUrl: '/w.js' })` calls each setter once with those values; `RTLTextPlugin` is set only when `getRTLTextPluginStatus()` returns `'unavailable'`.

- [ ] **Step 6: Run them to see them fail** → FAIL, modules not found.

- [ ] **Step 7: Port `src/types/*` and `src/utils/*`** from upstream. `apply-style.ts` is upstream's `apply-react-style.ts` without React. `applyViewStateToTransform` tests `v.zoom !== undefined` where upstream tests `'zoom' in v`, and the same for every camera field. `src/index.ts` exports the public types now; later tasks add their exports.

- [ ] **Step 8: Run all tests and `check`** — `pnpm --filter map-gl-svelte test && pnpm --filter map-gl-svelte check` → PASS.

- [ ] **Step 9: Mutation check.** Change `v.zoom !== undefined` back to `'zoom' in v` → the new `ignores undefined` test fails. Restore.

- [ ] **Step 10: Commit** — `git add packages/map-gl-svelte pnpm-lock.yaml && git commit -m "feat(map-gl-svelte): scaffold package, browser test harness, types and utils"`

---

### Task 2: The `Maplibre` wrapper class and `MapRef`

Translates upstream `src/maplibre/maplibre.ts` and `src/maplibre/create-ref.ts`. Covers M1–M5, M10–M13, M24.

**Files:**

- Create: `src/maplibre/maplibre.ts`, `src/maplibre/create-ref.ts`
- Test: `src/maplibre/maplibre.test.ts`, `src/maplibre/create-ref.test.ts`

**Interfaces:**

- Consumes: Task 1's types, `transform.ts`, `deep-equal.ts`, `style-utils.ts`, test utils.
- Produces:

```ts
export type MaplibreProps = /* upstream's MaplibreProps */;
export type HandlerName = 'scrollZoom' | 'boxZoom' | 'dragRotate' | 'dragPan' | 'keyboard' | 'doubleClickZoom' | 'touchZoomRotate' | 'touchPitch';
export default class Maplibre {
  public static savedMaps: Maplibre[];
  public static reuse(props: MaplibreProps, container: HTMLDivElement): Maplibre | null;
  public constructor(MapClass: new (options: MapOptions) => MapInstance, props: MaplibreProps, container: HTMLDivElement);
  public get map(): MapInstance;
  public get props(): MaplibreProps;            // the live props object; read at call time, never copied
  public updateViewState(): boolean;             // jumpTo the changed camera fields under the internal-update flag; false while moving
  public updateSize(): boolean;                  // resize() when props.viewState width/height differ from the canvas
  public updateSetting(name: 'maxBounds' | 'projection' | 'renderWorldCopies', next: unknown, prev: unknown): boolean;
  public updateZoomConstraint(next: ConstraintRange, prev: ConstraintRange): boolean;
  public updatePitchConstraint(next: ConstraintRange, prev: ConstraintRange): boolean;
  public updateCursor(next: string | undefined): void;
  public updateStyle(mapStyle: MaplibreProps['mapStyle'], styleDiffing: boolean | undefined): void;
  public updateStyleComponents(): void;          // light, sky, terrain, projection from props; no-op until style loaded
  public updateHandler(name: HandlerName, next: unknown, prev: unknown): void;
  public requestRedraw(): void;                  // at most one map.redraw() per microtask
  public syncAll(prev: MaplibreProps): void;     // every update above against prev; used by reuse()
  public recycle(): void;
  public destroy(): void;
}
// create-ref.ts
export type MapRef = { getMap(): MapInstance } & Omit<MapInstance, /* upstream's skipMethods */>;
export default function createRef(instance: Maplibre | null): MapRef | null;
```

- [ ] **Step 1: Write the failing tests** in `maplibre.test.ts`. Construct `new Maplibre(maplibregl.Map, props, createContainer())` with a plain `props` object mutated between steps; `mapStyle: EMPTY_STYLE`.

```ts
test('creates the map from initialViewState', …);                 // center (-100, 40), zoom 4
test('camera hook enforces controlled fields and reports the proposal', async () => {
  // props { longitude: -100, latitude: 40, zoom: 4, onMove }
  map.jumpTo({ zoom: 10 });
  expect(map.getZoom()).toBe(4);
  expect(onMove.mock.calls.at(-1)[0].viewState.zoom).toBe(10);
});
test('undefined camera fields stay free', …);                      // props { zoom: undefined }; jumpTo({zoom: 10}) → 10
test('external camera writes are silent', …);                      // props.zoom = 6; updateViewState() → true, getZoom() 6, onMove/onZoom not called
test('camera props are not applied while moving', …);              // easeTo duration 200, change props.zoom, updateViewState() → false
test('dispatches to the current callback', …);                     // Review Focus 3, below
test('unhandled error goes to console.error', …);                  // map.fire('error', {error}) with no onError → console.error spy called with it
test('interactiveLayerIds attaches features and synthesises hover', …);
test('requestRedraw renders once per microtask', …);
```

Review Focus 3, in full:

```ts
test('dispatches to the current callback', () => {
  const a = vi.fn(),
    b = vi.fn();
  const props: MaplibreProps = { mapStyle: EMPTY_STYLE };
  const m = new Maplibre(maplibregl.Map, props, createContainer());
  m.map.fire('click', { point: new Point(1, 1) }); // undefined callback: nothing to call, nothing thrown
  props.onClick = a;
  m.map.fire('click', { point: new Point(1, 1) });
  props.onClick = b;
  m.map.fire('click', { point: new Point(1, 1) });
  expect(a).toHaveBeenCalledTimes(1);
  expect(b).toHaveBeenCalledTimes(1);
});
```

Hover: add a GeoJSON source with one point at the map centre and a `circle` layer `pts` directly on `m.map`, set `props.interactiveLayerIds = ['pts', 'not-in-style']` and `props.onMouseEnter`/`onMouseLeave`, wait for `idle`, then `m.map.fire('mousemove', { point: m.map.project(center), lngLat: center, originalEvent: new MouseEvent('mousemove') })` → `onMouseEnter` called once with `features.length === 1`. The same at point (0, 0) → `onMouseLeave` called once. The unknown id throws nothing.

Redraw: count `render` events; call `requestRedraw()` three times; `await Promise.resolve()`; exactly one `render`.

`create-ref.test.ts`: `ref.getMap()` is the raw map; `ref.getCenter()` works and is bound; `setStyle`, `addLayer`, `setPaintProperty`, `setFilter`, `setMinZoom`, `remove` are `undefined` on the ref.

- [ ] **Step 2: Run them to see them fail** — `pnpm --filter map-gl-svelte exec vitest run src/maplibre` → FAIL, module not found.

- [ ] **Step 3: Implement `maplibre.ts`** by translating upstream's class. Differences from upstream:
  - Upstream's `setProps` is split into the granular `update*` methods above. Each takes or reads only what it needs.
  - `redraw()` is replaced by `requestRedraw()`: sets a flag and queues one microtask that calls the public `map.redraw()` if the map still exists. No `_frame`/`_render`.
  - The camera hook and event handlers read `this.props` at call time.
  - The class follows the external-state class convention (`private _map`, `private _internalUpdate`, `public get map()`, …).

- [ ] **Step 4: Implement `create-ref.ts`** as upstream.

- [ ] **Step 5: Run the tests** → PASS.

- [ ] **Step 6: Mutation check.**
  - Make `_onCameraUpdate` return `tr` unchanged → the `controlled fields` test fails.
  - Remove the `_internalUpdate` guard in `_onCameraEvent` → the `silent` test fails.
  - Bind the callback at registration instead of looking it up at call time → `current callback` fails.
  - Drop the redraw flag → `renders once` fails.

  Restore after each.

- [ ] **Step 7: Commit** — `feat(map-gl-svelte): Maplibre wrapper class and MapRef`

---

### Task 3: `<Map>`

Translates upstream `src/components/map.tsx`. Covers M1–M10, M14, M26, M27. Answers spec open questions 1 and 4.

**Files:**

- Create: `src/components/map-context.ts`, `src/components/map.svelte`, `src/components/use-map.svelte.ts` (stub: key + type only), `src/test-fixtures/map-fixture.svelte`, `src/test-fixtures/context-probe.svelte`
- Test: `src/components/map.svelte.test.ts`
- Modify: `src/index.ts` (export `Map` as named and default, `MapProps`, `MapRef`)

**Interfaces:**

- Consumes: `Maplibre`, `createRef`, `MapRef`, `setGlobals`, `GlobalSettings`.
- Produces:
  - `map-context.ts`: `MAP_CONTEXT_KEY = Symbol('map-gl-svelte:map-context')`, `type MapContextValue = { mapLib: MapLib; map: MapRef }`, `setMapContext(value): void`, `getMapContext(): MapContextValue`. Same pattern as `packages/dockview-svelte/src/context.ts`.
  - `map.svelte`: props `MapProps = MapInitOptions & MaplibreProps & GlobalSettings & { mapLib?: MapLib | Promise<MapLib>; reuseMaps?: boolean; id?: string; class?: string; style?: string; children?: Snippet }`, where `MapInitOptions` is upstream's `Omit<MapOptions, 'style' | 'container' | 'bounds' | 'fitBoundsOptions' | 'center'>`. Exports `getMapRef(): MapRef | null` for `bind:this`.
  - A mounted-maps registration hook used by Task 7: if a `MOUNTED_MAPS_CONTEXT_KEY` context exists, call its `onMapMount(ref, props.id)` after creation and `onMapUnmount(props.id)` on teardown. Task 7 defines the key in `use-map.svelte.ts`; until then, Task 3 creates `use-map.svelte.ts` with only the key and the `MountedMapsContextValue` type, which Task 7 fills in.

- [ ] **Step 1: Write the failing tests.** Mount `map-fixture.svelte` (it renders `<Map {...props}>` with `bind:this`, exports `getMapRef()`, and renders `context-probe.svelte` as a child) with a `$state` props object, using `mount`/`unmount`/`flushSync` from `svelte`.
  - Translate upstream `map.spec.jsx`: `Map`, `Map#uncontrolled`, `Map#controlled#no-update`, `Map#controlled#mirror-back`, `Map#controlled#delayed-update`. In mirror-back and delayed-update, the fixture keeps `viewState` in `$state` and sets it from `onMove` (directly, or in a `setTimeout`). `onRender` asserts the rendered centre equals the current `viewState`.
  - `children see the map at init` (M14): `context-probe.svelte` records `getMapContext().map !== null` during its own initialisation → `true`.
  - `zoom={undefined} is uncontrolled`: mount with `zoom: undefined`, `getMapRef().zoomTo(8, {duration: 0})` → zoom 8.
  - `initialViewState.bounds`: `{bounds: [[-10, -10], [10, 10]]}` → `getCenter()` within 1e-6 of (0, 0).
  - `controlled size` (M6): spy on the raw map's `resize`. Set `viewState` to the current camera with `width: 300, height: 200` on a 400×300 container → `resize` called once. Set `width: 400, height: 300` → not called again.
  - `settings, handlers, cursor, style` (M8): set `maxBounds`, `renderWorldCopies: false`, `scrollZoom: false`, `cursor: 'crosshair'`, `mapStyle: backgroundStyle('#f00')` in one flush. Assert `getMaxBounds()`, `getRenderWorldCopies() === false`, `scrollZoom.isEnabled() === false`, canvas `style.cursor === 'crosshair'`, layer `bg` present after `waitForStyleLoad`.
  - `style components survive a style swap` (M9): with `light: {anchor: 'map', intensity: 0.2}` and `sky: {'sky-color': '#00f'}`, swap `mapStyle` → after `style.load`, `getLight().intensity === 0.2` and `getSky()['sky-color'] === '#00f'`. Terrain with an absent source: `terrain: {source: 'dem'}` → `getTerrain()` stays `null`, no `error` event.
  - `one forced redraw per flush` (M10): after load, count `render` events; change `maxBounds`, `renderWorldCopies` and `longitude` in one flush; `flushSync(); await Promise.resolve()` → exactly one `render`.
  - **Review Focus 1:** mount with `minZoom: 0, maxZoom: 8`; set `minZoom = 10; maxZoom = 15` in one flush → no throw, no `error` event, `getMinZoom() === 10`, `getMaxZoom() === 15`. The same for pitch: `minPitch` 0→40 and `maxPitch` 30→60.
  - **Review Focus 2:** mount with `mapLib: new Promise(r => resolveLib = r)` and `onLoad`; `unmount`; `resolveLib(maplibregl)`; `await sleep(50)` → `onLoad` not called, `console.error` spy not called, container has no canvas.
  - `mapLib load failure goes to onError` (M13): `mapLib: Promise.reject(new Error('boom'))` → `onError` receives `{type: 'error', error}` with message `boom`.
  - `reuseMaps` (M26): mount with `reuseMaps: true`, wait for load, keep the canvas reference, unmount, mount again with `reuseMaps: true` → the same canvas element is in the new container and `onLoad` fires again.
  - `gl` prop (M27): pass a WebGL context from a separate canvas → after mount, `HTMLCanvasElement.prototype.getContext` is the original function again.
  - `bind:this` exposes the MapRef: `getMapRef()?.getMap()` is a `maplibregl.Map`.

- [ ] **Step 2: Run them to see them fail** — `pnpm --filter map-gl-svelte exec vitest run src/components/map` → FAIL.

- [ ] **Step 3: Implement `map-context.ts` and `map.svelte`.**
  - `let props: MapProps = $props()`. Pass the props object itself (not a copy) to `Maplibre`.
  - Creation in `onMount`, as upstream's mount effect: resolve `props.mapLib ?? import('maplibre-gl')`, bail if already destroyed, `setGlobals`, `Maplibre.reuse` when `reuseMaps`, else `new Maplibre(...)`. Then fill the context value object, set `mapInstance` (`$state`), and register with mounted maps. Teardown: unregister, then `recycle()` or `destroy()`.
  - Children render inside `<div mapboxgl-children style="height: 100%">` only when `mapInstance` is set (M14). Keep the attribute name: `recycle()` looks for it.
  - Container: `<div id={props.id} class={props.class} style="position: relative; width: 100%; height: 100%; {props.style ?? ''}">`.
  - One `$effect` per MapLibre call. Camera fields together, then `updateViewState()`, plus `requestRedraw()` if it returned true and the map isn't moving. `updateSize()` reads `viewState`. One effect per setting. `minZoom` + `maxZoom` together, `minPitch` + `maxPitch` together. `cursor`. `mapStyle` + `styleDiffing`. `light`/`sky`/`terrain`/`projection` together. One effect per handler.
  - Each effect remembers its previous value, initialised to the value the map was created with. An effect's first run makes **no** MapLibre call when nothing differs. Settings, size and camera changes call `requestRedraw()` as upstream's `setProps` would redraw.

- [ ] **Step 4: Run the tests** → PASS.

- [ ] **Step 5: Measure open questions 1 and 4; record both in the task report** (Task 8 copies them into the README).
  - OQ1: do mirror-back and delayed-update pass without any frame where the rendered centre and the state differ? If they fail, report the lag observed. Don't weaken the assertion.
  - OQ4: does the microtask redraw land before the next `requestAnimationFrame` callback? (Schedule a rAF before the flush; assert the forced `render` came first.) Does `$effect` vs `$effect.pre` change that?

- [ ] **Step 6: Mutation check.**
  - Split the zoom-limit effect into separate `minZoom` and `maxZoom` effects → Review Focus 1 fails with MapLibre's min/max error.
  - Remove the "destroyed" check after the `mapLib` promise → Review Focus 2 fails.
  - Remove the first-run "nothing differs" guard → `one forced redraw per flush` fails.
  - Render children before `mapInstance` is set → `children see the map at init` fails.

  Restore after each.

- [ ] **Step 7: Commit** — `feat(map-gl-svelte): Map component`

---

### Task 4: `<Source>` and `<Layer>`

Translates upstream `src/components/source.ts` and `layer.ts`. Covers M15–M20. Answers open questions 2 and 3.

**Files:**

- Create: `src/components/source-context.ts`, `src/components/source.svelte`, `src/components/layer.svelte`, `src/test-fixtures/source-layer-fixture.svelte`
- Test: `src/components/source.svelte.test.ts`, `src/components/layer.svelte.test.ts`
- Modify: `src/index.ts` (export `Source`, `Layer`, `SourceProps`, `LayerProps`)

**Interfaces:**

- Consumes: `getMapContext()`, `deepEqual`, `assert`.
- Produces:
  - `source-context.ts`: `SOURCE_CONTEXT_KEY = Symbol('map-gl-svelte:source-context')`, `setSourceId(id: string): void`, `getSourceId(): string | undefined`. The value is the id string only, never a reference to the Source.
  - `source.svelte`: props `SourceProps = SourceSpecification & { id?: string; children?: Snippet }`.
  - `layer.svelte`: props `LayerProps` as upstream (`OptionalSource<OptionalId<LayerSpecification>> | CustomLayerInterface`, plus `beforeId?: string`). `source` defaults to `getSourceId()`; an explicit `source` wins.
  - Auto ids: `svelte-source-N` and `svelte-layer-N` (upstream: `jsx-…`; listed in the README).

- [ ] **Step 1: Write the failing tests.** The fixture renders `<Map mapStyle={props.mapStyle}>`, and inside it, controlled by props: an optional flat `<Layer>` _before_ the Source in markup, an optional `<Source>` with nested `<Layer>`s, and a nested Layer whose `paint`/`layout`/`filter`/`minzoom`/`maxzoom`/`beforeId` come from props.
  - Translate upstream `source.spec.jsx` (`Source/Layer`: added, re-added after style change, updated via `setData`, removed on unmount) and `layer.spec.jsx` (`Source/Layer`), keeping each assertion.
  - `nested and flat layers produce the expected style layers`: an absolute expected entry per layer from `map.getStyle().layers`, e.g. `{id: 'flat', type: 'circle', source: 'pts', paint: {'circle-color': '#f00'}}`. No nested-equals-flat comparison: both go through the same code.
  - `a flat layer declared before its source appears when the source mounts` (M16, M17).
  - **Review Focus 4:** show the Source → flat layer present; hide it → layer and source gone, no `error` event; show it again → both present.
  - `style swap re-adds sources and layers` (M18): change `mapStyle` from `backgroundStyle('#000')` to `backgroundStyle('#fff')` → after the style loads and two `styledata` rounds, `getSource('pts')` and `getLayer('nested')` are present, as is `bg`.
  - `source teardown removes its layers first` (M20): unmount only the Source (Map stays) → no `error` event; `getLayer('nested')` and `getSource('pts')` are `undefined`.
  - `layer updates` (M19): change one `paint` key → `getPaintProperty` updated. Remove a `paint` key → it's reset to the default. Change `layout.visibility`, `filter`, `minzoom`/`maxzoom` and `beforeId` (with a second layer to move before) → each reflected in the style.
  - `source id or type change throws`: Source `id` change → the `source id changed` assertion propagates out of `flushSync()`. Layer `type` change → `console.warn` with `layer type changed`, as upstream catches it.
  - `geojson data updates on reassignment`: reassign `data` → `setData` reaches the source (query `querySourceFeatures` after `idle`). Push into the existing `$state` array → no update. That's documented behavior, pinned so the README stays true.
  - Auto ids: a Source and a Layer without `id` get ids matching `/^svelte-source-\d+$/` and `/^svelte-layer-\d+$/`.

- [ ] **Step 2: Run them to see them fail** → FAIL.

- [ ] **Step 3: Implement `source-context.ts`, `source.svelte`, `layer.svelte`.**
  - **Source:** subscribe to `styledata` on mount and bump a `$state` style version, deferred with `setTimeout(0)` as upstream. A creation effect depends only on the style version and re-adds the source if `getSource(id)` is missing, using upstream's guard. It reads options untracked. A `data` effect calls `setData` on reassignment (by reference, not `deepEqual`; listed in the README). An options effect diffs the remaining keys against the previous value and applies upstream's `updateSource` rules: GeoJSON → `setData`, image → `updateImage`, else `setCoordinates`/`setUrl`/`setTiles`, else the `Unable to update <Source> prop: …` warning. Id/type asserts as upstream. Children render only while the source exists. Teardown: as upstream, remove every style layer using the source, then the source, guarded by `map.style?._loaded`.
  - **Layer:** a style-version bump on `styledata`, not deferred, as upstream. A creation effect depends on the style version and the resolved source id, and creates under upstream's guard (style loaded, source present). One effect each for `beforeId` (→ `moveLayer`), `paint` and `layout` (diff keys against previous, removed keys → `undefined`), `filter` (`deepEqual`), and `minzoom`/`maxzoom`. Each effect wraps its MapLibre calls in `try`/`catch` → `console.warn`, as upstream's single `try`. Teardown: `removeLayer` if present, guarded.

- [ ] **Step 4: Run the tests** → PASS.

- [ ] **Step 5: Measure open questions 2 and 3; record both in the task report.**
  - OQ2: when a `<Source>` with nested `<Layer>`s unmounts, whose teardown runs first? Add a temporary `console.debug` in both teardowns, run the teardown test, note the order, remove the probe.
  - OQ3: delete Source's `setTimeout(0)` and run the style-swap test. Note whether it passes. Restore it either way: the port keeps upstream's deferral.

- [ ] **Step 6: Mutation check.**
  - Make Layer read the Source id from a parent component reference that is `undefined` for flat layers → the flat-layer tests fail.
  - Remove the dependent-layer removal from Source teardown → `source teardown` fails with an `error` event.
  - Remove the `styledata` subscription → `style swap` and Review Focus 4 fail.
  - Remove the removed-key reset → the paint-key-removal assertion fails.

  Restore after each.

- [ ] **Step 7: Commit** — `feat(map-gl-svelte): Source and Layer components`

---

### Task 5: `<Marker>` and `<Popup>`

Translates upstream `src/components/marker.ts` and `popup.ts`. Covers M21, M22.

**Files:**

- Create: `src/components/snippet-host.svelte`, `src/components/marker.svelte`, `src/components/popup.svelte`, `src/test-fixtures/marker-popup-fixture.svelte`
- Test: `src/components/marker.svelte.test.ts`, `src/components/popup.svelte.test.ts`
- Modify: `src/index.ts` (export `Marker`, `Popup`, `MarkerProps`, `PopupProps`)

**Interfaces:**

- Consumes: `getMapContext()`, `applyStyle`, `CSSProperties`, `compareClassNames`, `arePointsEqual`, `deepEqual`.
- Produces:
  - `snippet-host.svelte`: props `{ snippet: Snippet }`; renders `{@render snippet()}`. It's mounted with `mount(SnippetHost, { target, props: { snippet }, context: getAllContexts() })` into an element the component created, and `unmount`ed on teardown. This replaces `createPortal`, following dockview-svelte's mount bridge.
  - `marker.svelte`: props `MarkerProps` as upstream, with `style?: CSSProperties` and `children?: Snippet`. Exports `getMarker(): MarkerInstance`.
  - `popup.svelte`: props `PopupProps` as upstream, with `style?: CSSProperties` and `children?: Snippet`. Exports `getPopup(): PopupInstance`.

- [ ] **Step 1: Write the failing tests.**
  - Translate upstream `marker.spec.jsx` (`Marker`) and `popup.spec.jsx` (`Popup`), keeping each assertion.
  - `marker children become the marker element`: children `<span class="pin">` → `getMarker().getElement()` contains `.pin`. With no children, the default marker element has an `svg`.
  - `marker style is applied per property`: `style: {opacity: 0.5, width: 20}` → element `style.opacity === '0.5'`, `style.width === '20px'`, and `style.transform` is non-empty (MapLibre's positioning survives).
  - `marker drag events carry lngLat`: fire `dragend` on the marker → `onDragEnd` gets `lngLat` equal to `getMarker().getLngLat()`.
  - `popup onClose is not called on unmount` (M22): unmount the Popup → `onClose` not called. Separately, `getPopup().remove()` → `onClose` called once.
  - `popup children stay reactive`: children render `{label}` from fixture state; change `label` → popup DOM text updates.

- [ ] **Step 2: Run them to see them fail** → FAIL.

- [ ] **Step 3: Implement `snippet-host.svelte`, `marker.svelte`, `popup.svelte`.** Create the MapLibre instance once at init, from initial props and `getMapContext().mapLib`. Register listeners once; they read the current callback prop at call time. `addTo(map)` in `onMount`; teardown removes it. Popup turns off its `close` listener before `remove()`, as upstream. One effect per updatable property, each compared against the instance's current value as upstream. `className` is diffed with `compareClassNames`. `style` goes through `applyStyle`. Popup applies its updates only while open, as upstream.

- [ ] **Step 4: Run the tests** → PASS.

- [ ] **Step 5: Mutation check.**
  - Leave the `close` listener attached during teardown → the unmount `onClose` test fails.
  - Replace `applyStyle` with `element.style.cssText = …` → `marker style` fails, because `transform` is wiped.

  Restore after each.

- [ ] **Step 6: Commit** — `feat(map-gl-svelte): Marker and Popup components`

---

### Task 6: `useControl` and the eight built-in controls

Translates upstream `src/components/use-control.ts` and `*-control.ts`. Covers M23.

**Files:**

- Create: `src/components/use-control.ts`, `src/components/{attribution,fullscreen,geolocate,navigation,scale,terrain,logo,globe}-control.svelte`, `src/test-fixtures/controls-fixture.svelte`
- Test: `src/components/controls.svelte.test.ts`, `src/components/use-control.svelte.test.ts`
- Modify: `src/index.ts` (export `useControl`, the eight controls and their props types)

**Interfaces:**

- Consumes: `getMapContext()`, `MapContextValue`, `applyStyle`.
- Produces: `useControl<T extends IControl>(onCreate, opts?)`, `useControl(onCreate, onRemove, opts?)`, `useControl(onCreate, onAdd, onRemove, opts?)`, returning `T`; same overloads as upstream. Call it during a component's initialisation; it uses `onMount` for add and teardown. Each control component takes upstream's props, with `style?: CSSProperties` applied to `_container` (`_controlContainer` for Fullscreen). `geolocate-control.svelte` also exports `getControl(): GeolocateControlInstance`.

- [ ] **Step 1: Write the failing tests.**
  - Translate upstream `controls.spec.jsx` (`Controls`), keeping each assertion.
  - `use-control.svelte.test.ts`, using a custom `IControl` that records calls: `onCreate` runs once; with three arguments, `onAdd` runs after `map.addControl` and `onRemove` before `removeControl`; `position: 'bottom-left'` puts the control's element in `.maplibregl-ctrl-bottom-left`; after unmount, `hasControl(ctrl) === false`.
  - `control style prop`: `<NavigationControl style={{opacity: 0.4}}>` → the control container's `style.opacity === '0.4'`.
  - `geolocate exposes its control`: `getControl()` is a `maplibregl.GeolocateControl`; its `onGeolocate` and `onError` props are wired to the control's events.

- [ ] **Step 2: Run them to see them fail** → FAIL.

- [ ] **Step 3: Implement `use-control.ts` and the eight components**, each a few lines on top of `useControl`, as upstream. No `_setupUI` patch on Geolocate.

- [ ] **Step 4: Run the tests** → PASS.

- [ ] **Step 5: Mutation check.** Swap the `onAdd`/`onRemove` argument resolution → the ordering test fails. Restore.

- [ ] **Step 6: Commit** — `feat(map-gl-svelte): useControl and built-in controls`

---

### Task 7: `<MapProvider>`, `useMap`, the export surface, and whole-tree teardown

Translates upstream `src/components/use-map.tsx` and `src/index.ts`. Covers M25 and Goal 1's export parity.

**Files:**

- Create: `src/components/map-provider.svelte`, `src/test-fixtures/use-map-fixture.svelte`, `src/test-fixtures/full-tree-fixture.svelte`
- Modify: `src/components/use-map.svelte.ts` (Task 3 stub), `src/index.ts`
- Test: `src/components/use-map.svelte.test.ts`, `src/index.test.ts`, `src/components/teardown.svelte.test.ts`

**Interfaces:**

- Consumes: Task 3's `MOUNTED_MAPS_CONTEXT_KEY` hook in `<Map>`, `MapRef`, `getMapContext()`.
- Produces: `MapProvider` (props `{ children?: Snippet }`); `useMap(): MapCollection` with `type MapCollection = { [id: string]: MapRef | undefined; current?: MapRef }`. Reading `.current` or `[id]` stays reactive in templates and effects (don't destructure; the README says so). Duplicate ids throw `Multiple maps with the same id: <id>`; the id `current` throws `'current' cannot be used as map id`, as upstream.

- [ ] **Step 1: Write the failing tests.**
  - Translate upstream `use-map.spec.jsx` (`useMap`), keeping each assertion.
  - `useMap updates when a map mounts later`: a sibling component calling `useMap()` renders `maps.mymap ? 'yes' : 'no'` → `'no'`, then `'yes'` once `<Map id="mymap">` has created its map.
  - Duplicate-id and `current` errors.
  - `index.test.ts`, export parity. Absolute list, written out, not computed:

```ts
const UPSTREAM_RUNTIME_EXPORTS = [
  'AttributionControl',
  'FullscreenControl',
  'GeolocateControl',
  'GlobeControl',
  'Layer',
  'LogoControl',
  'Map',
  'MapProvider',
  'Marker',
  'NavigationControl',
  'Popup',
  'ScaleControl',
  'Source',
  'TerrainControl',
  'default',
  'useControl',
  'useMap',
];
test('runtime exports match upstream v8.1.3', async () => {
  expect(Object.keys(await import('./index')).sort()).toEqual([...UPSTREAM_RUNTIME_EXPORTS].sort());
});
```

- **Review Focus 5:** `full-tree-fixture.svelte` renders `<MapProvider><Map id="m">` with a Source, two Layers, a Marker, a Popup (`onClose` spy), a NavigationControl and a ScaleControl. After `idle`, `unmount` the whole fixture → no uncaught error (`window` `error` listener), `console.error` not called, `onClose` not called, the container has no canvas.

- [ ] **Step 2: Run them to see them fail** → FAIL.

- [ ] **Step 3: Implement `use-map.svelte.ts` and `map-provider.svelte`**, and complete `src/index.ts` to upstream's export list (types included: re-export `./types/common`, `./types/events`, `./types/lib`, `./types/style-spec` as upstream does).

- [ ] **Step 4: Run the tests** → PASS. If Review Focus 5 fails, fix it in the component that throws, with a regression test in that component's test file.

- [ ] **Step 5: Mutation check.**
  - Return a plain snapshot object from `useMap()` → `useMap updates when a map mounts later` fails.
  - Delete one export from `index.ts` → the parity test fails.

  Restore after each.

- [ ] **Step 6: Commit** — `feat(map-gl-svelte): MapProvider, useMap and full export surface`

---

### Task 8: Demo app and README

**Files:**

- Create: `demo/index.html`, `demo/vite.config.ts`, `demo/src/main.ts`, `demo/src/app.svelte`, `demo/src/pages/{camera,layers,markers,controls,custom-control}.svelte`
- Modify: `README.md`

**Interfaces:**

- Consumes: the public API through the `map-gl-svelte` import only (aliased to `../src/index.ts`).

- [ ] **Step 1: Write the demo.**
  - `demo/vite.config.ts` mirrors dockview-svelte's: alias `map-gl-svelte` → `../src/index.ts`, `server.port: 5175`.
  - `app.svelte` switches between five pages:
    - **camera:** uncontrolled and controlled side by side; the controlled one shows its live `viewState`.
    - **layers:** a GeoJSON source, circle and line layers, a style-swap button, a button that reassigns `data`.
    - **markers:** a draggable marker with a popup, and a marker with custom children.
    - **controls:** all eight built-in controls.
    - **custom-control:** a minimal `IControl` through `useControl`.
  - Basemap: `https://tiles.openfreemap.org/styles/positron`, as `packages/extension-map/src/map-view.svelte`.

- [ ] **Step 2: Verify the demo compiles and runs.**
  - `pnpm --filter map-gl-svelte check` → PASS (the tsconfig includes `demo/`).
  - `pnpm --filter map-gl-svelte exec vite build --config demo/vite.config.ts --outDir ../scratch/map-gl-svelte-demo-build --emptyOutDir` → build succeeds. Delete that output folder afterwards.
  - Then start `pnpm --filter map-gl-svelte demo` in the background, open `http://localhost:5175`, and confirm each page renders a map without console errors (Chrome DevTools MCP screenshot per page). Stop the server **by its PID**, never by pattern.

- [ ] **Step 3: Write `README.md`.**
  - Usage examples: uncontrolled, controlled, Source/Layer nested and flat, Marker/Popup, a custom control.
  - **Install for tests:** `pnpm --filter map-gl-svelte exec playwright install chromium`.
  - **Attribution:** port of `@vis.gl/react-maplibre` v8.1.3, MIT, see `LICENSE`.
  - **Svelte translations:** the spec's table, verbatim.
  - **Differences from upstream:**
    - forced redraw via public `map.redraw()` (one render fewer per external change on MapLibre 5);
    - reassignment, not mutation, with the idiom shown;
    - GeoJSON `data` compared by reference;
    - `zoom={undefined}` is uncontrolled;
    - auto-id prefixes `svelte-source-`/`svelte-layer-`;
    - Source context reaches all descendants;
    - no Geolocate strict-mode patch;
    - dropped test `getTransformLike#pre-v5`;
    - any version-difference test adjustments from Tasks 2–7;
    - main's #2612 fix, if taken.
  - **Open questions, answered:** OQ1–OQ4 findings from the Task 3 and Task 4 reports.

- [ ] **Step 4: Full verification** — `pnpm --filter map-gl-svelte test && pnpm --filter map-gl-svelte check && pnpm lint && pnpm test` → all PASS. Root `pnpm test` runs every package; the others' 527 baseline tests still pass.

- [ ] **Step 5: Commit** — `feat(map-gl-svelte): demo app and README`

---

## After the last task

Final cross-cutting review of the whole branch, returned to the controller. Nothing is posted to GitHub, per the spec's Status section. Merging, and whether to open a PR, is the user's call.
