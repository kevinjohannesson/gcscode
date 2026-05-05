# dockview-svelte — Svelte 5 adapter for dockview-core

A Svelte 5 binding package for [`dockview-core`](https://www.npmjs.com/package/dockview-core), structured as a sibling to upstream's `dockview-react` / `dockview-vue` / `dockview-angular` adapters. Lives in this monorepo as `packages/dockview-svelte` for now; eventually publishable as a standalone npm package.

## Status

This is **not a gcscode iteration**. It is a standalone artifact housed in the gcscode repo for convenience while the workbench-layout question is being explored. It does not appear in `docs/roadmap.md`, does not propagate to `docs/out-of-scope.md`, and does not follow gcscode's iteration cadence (small cuts / per-task review checkpoints / etc.).

## Goal

A near 1:1 port of upstream's framework adapter pattern, structured to mirror `packages/dockview-vue` (which is closer to Svelte's rendering model than `packages/dockview` / `packages/dockview-react`, which use React portals — Svelte does not need the portal mechanism).

When complete, a Svelte 5 user should be able to write:

```svelte
<script lang="ts">
  import { DockviewSvelte, type IDockviewPanelProps, type DockviewReadyEvent } from 'dockview-svelte';
  import 'dockview-core/dist/styles/dockview.css';
  import EditorPanel from './editor-panel.svelte';
  import OutputPanel from './output-panel.svelte';

  function onReady(event: DockviewReadyEvent) {
    event.api.addPanel({ id: 'editor-1', component: 'editor', params: { fileName: 'a.ts' } });
    event.api.addPanel({ id: 'output-1', component: 'output' });
  }
</script>

<DockviewSvelte
  components={{ editor: EditorPanel, output: OutputPanel }}
  {onReady}
/>
```

And a panel component is just a Svelte component:

```svelte
<script lang="ts">
  import type { IDockviewPanelProps } from 'dockview-svelte';
  let { params, api, containerApi }: IDockviewPanelProps<{ fileName: string }> = $props();
</script>

<div>{params.fileName}</div>
```

## Non-goals (v0)

- React-style HOCs, hooks, or `forwardRef` equivalents (Svelte does not have a `ref` concept; use `bind:this` directly on `<DockviewSvelte>` if needed).
- A Svelte component-name-string lookup registry like Vue's `findComponent`. Components are passed by value (matching React).
- Publishing to npm (`"private": true` for now; flip to publishable when stable).
- Storybook / docs site / examples beyond the local `demo/` folder.
- Server-side rendering. Dockview is a DOM-only library and the bridge mounts client-side only.

## Package shape

```
packages/dockview-svelte/
├── package.json                  # name "dockview-svelte", "private": true, version "0.0.1"
├── tsconfig.json                 # extends ../../tsconfig.base.json
├── svelte.config.js
├── vitest.config.ts
├── README.md
├── src/
│   ├── index.ts                  # public exports (analog of dockview-vue/src/index.ts)
│   ├── utils.svelte.ts           # mountSvelteComponent + renderer classes
│   ├── context.ts                # typed context key + getDockviewContext() helper
│   ├── dockview/
│   │   ├── dockview.svelte
│   │   ├── default-tab.svelte
│   │   └── types.ts
│   ├── splitview/
│   │   ├── splitview.svelte
│   │   └── types.ts
│   ├── gridview/
│   │   ├── gridview.svelte
│   │   └── types.ts
│   ├── paneview/
│   │   ├── paneview.svelte
│   │   └── types.ts
│   └── __tests__/
│       ├── utils.test.ts
│       ├── dockview.test.ts
│       ├── splitview.test.ts
│       ├── gridview.test.ts
│       └── paneview.test.ts
└── demo/
    ├── index.html
    ├── vite.config.ts
    └── src/
        ├── main.ts
        ├── app.svelte
        └── panels/
            ├── editor-panel.svelte
            ├── output-panel.svelte
            └── side-panel.svelte
```

### Filename convention

Kebab-case for all files, including `.svelte` components — matches gcscode's convention. Component import bindings stay PascalCase (`import DockviewSvelte from './dockview/dockview.svelte'`).

### Dependencies

`package.json` follows the gcscode pattern (source-as-entrypoint; no build step in v0 — easier to consume from the workspace, and the package can be made build-able later when actually publishing):

```json
{
  "name": "dockview-svelte",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "svelte": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "scripts": {
    "check": "svelte-check --tsconfig ./tsconfig.json && tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "demo": "vite --config demo/vite.config.ts"
  },
  "peerDependencies": {
    "svelte": "^5.0.0",
    "dockview-core": "^6.0.1"
  },
  "devDependencies": {
    "dockview-core": "^6.0.1"
  }
}
```

`dockview-core` is the only runtime dependency users need. CSS is shipped by `dockview-core` and consumed via `import 'dockview-core/dist/styles/dockview.css'` (same as upstream — we do not vendor or re-export theme CSS in v0).

A library-mode `vite.config.ts` build will be added later when the package is flipped to publishable; deferring it now keeps the v0 surface tight.

## Core architecture: the bridge

`dockview-core` exposes a framework-agnostic `createDockview(element, options)` (and `createSplitview` / `createGridview` / `createPaneview`). The framework adapter's job is twofold:

1. Mount a wrapper component (e.g. `<DockviewSvelte>`) that owns the container `<div>`, calls `createDockview`, and forwards prop changes via `api.updateOptions`.
2. Provide framework-specific **renderers** that implement `dockview-core`'s renderer interfaces (`IContentRenderer`, `ITabRenderer`, `IWatermarkRenderer`, `IHeaderActionsRenderer`, `IContextMenuItemRenderer`, `ITabGroupChipRenderer`). Each renderer mounts a user-provided component into a DOM element supplied by `dockview-core`, threads through props, and unmounts on disposal.

For React this requires React portals (because React owns its component tree and mounting outside it requires explicit portal creation). For Vue and Svelte, framework `mount` calls accept any DOM node directly — no portals required.

### `mountSvelteComponent` (the panel-component bridge)

In `src/utils.svelte.ts`:

```ts
import { mount, unmount, type Component } from 'svelte';

export interface MountedComponent<P extends Record<string, any>> {
  update: (newProps: Partial<P>) => void;
  dispose: () => void;
}

export function mountSvelteComponent<P extends Record<string, any>>(
  Component: Component<P>,
  initialProps: P,
  element: HTMLElement,
  context?: Map<unknown, unknown>
): MountedComponent<P> {
  const reactiveProps = $state({ ...initialProps }) as P;
  const instance = mount(Component, {
    target: element,
    props: reactiveProps,
    context,
  });
  return {
    update(newProps) {
      Object.assign(reactiveProps, newProps);
    },
    dispose() {
      unmount(instance);
    },
  };
}
```

**Three load-bearing Svelte 5 details:**

1. **`$state({ ...initialProps })` instead of plain `{ ...initialProps }`.** Mutating the result via `Object.assign(reactiveProps, newProps)` only triggers re-render if the props object is a `$state` proxy. With a plain object, `panel.api.updateParameters({ ... })` will silently fail to update the panel content. This is the canonical Svelte-5 `mount`+reactive-props pattern; the file extension must be `.svelte.ts` (not `.ts`) for runes to compile.
2. **`mount`, not `new Component({ target })`.** The Svelte 4 imperative API is gone in Svelte 5. Use `mount(Component, options)` from `'svelte'` and `unmount(instance)` to tear down. Forgetting `unmount` leaks the reactive graph for the lifetime of the page.
3. **`context` flows through `mount({ context })`.** Each panel is a separately-mounted Svelte tree (not a child of the host `<DockviewSvelte>` component), so `setContext` in the host is invisible to panels. Pass a `Map<unknown, unknown>` as `mount`'s `context` option; descendants of the panel root see it via `getContext`. This is how popout windows preserve panel state — when dockview-core re-parents the panel's DOM into a new browser window, the Svelte instance and its context map are unaffected.

### Renderer classes (mirror `dockview-vue/src/utils.ts`)

`AbstractSvelteRenderer` creates a `dv-svelte-part` `<div>` host element. Subclasses implement `dockview-core` renderer interfaces:

| Class | Interface | Lifecycle |
|---|---|---|
| `SvelteRenderer` | `IContentRenderer` + `ITabRenderer` | `init({ params, api, containerApi, tabLocation? })` mounts; `update(event)` mutates props; `dispose()` unmounts. |
| `SvelteWatermarkRenderer` | `IWatermarkRenderer` | `init({ group, containerApi })` mounts; `update()` is a no-op; `dispose()` unmounts. |
| `SvelteHeaderActionsRenderer` | `IHeaderActionsRenderer` | `init({ containerApi, api })` mounts and subscribes to `group.model.onDidAddPanel`, `onDidRemovePanel`, `onDidActivePanelChange`, `parameters.api.onDidActiveChange`, `parameters.api.onDidLocationChange` via a `DockviewCompositeDisposable` held in a `DockviewMutableDisposable`. Emits enriched props (`panels`, `activePanel`, `isGroupActive`, `group`, `headerPosition`, `location`) on each event. `dispose()` clears subscriptions and unmounts. |
| `SvelteContextMenuItemRenderer` | `IContextMenuItemRenderer` | `init(props)` mounts; `dispose()` unmounts. |
| `SvelteTabGroupChipRenderer` | `ITabGroupChipRenderer` | `init({ tabGroup, api })` mounts; `update({ tabGroup })` mutates; `dispose()` unmounts. Sets host element's display to `inline-flex` and clears `width`/`height` (mirroring upstream Vue). |
| `SveltePart<P>` | (generic, for standalone use) | Constructor takes element, component, props; `init()` mounts; `update(props)` mutates; `dispose()` unmounts. |

Each renderer's `_renderDisposable` field holds the `MountedComponent` returned by `mountSvelteComponent`. `dispose()` is idempotent (noop if not yet mounted).

### Svelte-specific deviations from upstream Vue's port

| Topic | Vue does | Svelte does | Why |
|---|---|---|---|
| Component identity | Resolves by string name via `findComponent(parent, name)` against Vue's component registry | Accepts `Component<P>` directly in `components: Record<string, Component<P>>` (matching React) | Svelte has no Vue-equivalent global component registry. Passing components by value is idiomatic and removes a class of "component not found" errors. |
| Prop shape passed to the user's component | Wraps in `{ params: { params, api, containerApi, ... } }` so a single top-level prop can be replaced via `cloneVNode + render` | Passes flat: `{ params, api, containerApi }` | Svelte 5's `$state`-based prop mutation is per-key reactive — no top-level wrapping needed. Cleaner consumer DX (`let { params, api } = $props()`). |
| Cross-tree context propagation | Vue's `vNode.appContext.provides` cloning lets `provide` from the host reach panel descendants | `mount({ context: Map })` per panel + an exported `DOCKVIEW_CONTEXT_KEY` symbol | Each Svelte panel is an isolated mounted tree. The cleanest portable mechanism is `mount`'s built-in `context` option. |

## Context propagation

`src/context.ts`:

```ts
import { getContext } from 'svelte';
import type { DockviewApi, DockviewPanelApi } from 'dockview-core';

export const DOCKVIEW_CONTEXT_KEY = Symbol('dockview-svelte:context');

export interface DockviewSvelteContext {
  api: DockviewPanelApi;
  containerApi: DockviewApi;
}

export function getDockviewContext(): DockviewSvelteContext {
  const ctx = getContext<DockviewSvelteContext | undefined>(DOCKVIEW_CONTEXT_KEY);
  if (!ctx) {
    throw new Error(
      'getDockviewContext() called outside a dockview-svelte panel subtree'
    );
  }
  return ctx;
}
```

Renderer classes that mount panel content build the context map before calling `mountSvelteComponent`:

```ts
const context = new Map<unknown, unknown>([
  [DOCKVIEW_CONTEXT_KEY, { api: parameters.api, containerApi: parameters.containerApi }],
]);
this._renderDisposable = mountSvelteComponent(this.Component, props, this.element, context);
```

Splitview / Gridview / Paneview panels propagate their corresponding `*PanelApi` and `*Api` types in the same way. (The context type can be a discriminated union of all four panel-type contexts; `getDockviewContext()` is the dockview flavor; `getSplitviewContext()` / `getGridviewContext()` / `getPaneviewContext()` are flavor-specific helpers, all keyed off the same symbol or distinct symbols — implementer's choice; preference: distinct symbols for type safety.)

## Public components

### `<DockviewSvelte>`

Mirrors `IDockviewReactProps` from upstream `dockview/src/dockview/dockview.tsx`:

```ts
import type {
  DockviewOptions,
  DockviewReadyEvent,
  DockviewDidDropEvent,
  DockviewWillDropEvent,
  IDockviewPanelProps,
  IDockviewPanelHeaderProps,
  IWatermarkPanelProps,
  IDockviewHeaderActionsProps,
  BuiltInContextMenuItem,
  BuiltInChipContextMenuItem,
  ContextMenuItemConfig,
  GetTabContextMenuItemsParams,
  GetTabGroupChipContextMenuItemsParams,
  IContextMenuItemComponentProps,
} from 'dockview-core';
import type { Component } from 'svelte';
import type { IDockviewTabGroupChipProps } from './tab-group-chip-types';

export interface SvelteContextMenuItemConfig
  extends Omit<ContextMenuItemConfig, 'component'> {
  component?: Component<IContextMenuItemComponentProps>;
}

export interface IDockviewSvelteProps extends DockviewOptions {
  components: Record<string, Component<IDockviewPanelProps>>;
  tabComponents?: Record<string, Component<IDockviewPanelHeaderProps>>;
  watermarkComponent?: Component<IWatermarkPanelProps>;
  defaultTabComponent?: Component<IDockviewPanelHeaderProps>;
  rightHeaderActionsComponent?: Component<IDockviewHeaderActionsProps>;
  leftHeaderActionsComponent?: Component<IDockviewHeaderActionsProps>;
  prefixHeaderActionsComponent?: Component<IDockviewHeaderActionsProps>;
  tabGroupChipComponent?: Component<IDockviewTabGroupChipProps>;
  getTabContextMenuItems?: (
    params: GetTabContextMenuItemsParams
  ) => (BuiltInContextMenuItem | SvelteContextMenuItemConfig)[];
  getTabGroupChipContextMenuItems?: (
    params: GetTabGroupChipContextMenuItemsParams
  ) => (BuiltInChipContextMenuItem | SvelteContextMenuItemConfig)[];
  onReady: (event: DockviewReadyEvent) => void;
  onDidDrop?: (event: DockviewDidDropEvent) => void;
  onWillDrop?: (event: DockviewWillDropEvent) => void;
}
```

Implementation outline (Svelte 5 idioms — the implementer should refer to upstream `dockview-vue/src/dockview/dockview.vue` and `dockview/src/dockview/dockview.tsx` line-by-line; this is a sketch):

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createDockview, PROPERTY_KEYS_DOCKVIEW, type DockviewApi, type DockviewFrameworkOptions } from 'dockview-core';
  import {
    SvelteRenderer,
    SvelteWatermarkRenderer,
    SvelteHeaderActionsRenderer,
    SvelteContextMenuItemRenderer,
    SvelteTabGroupChipRenderer,
  } from '../utils.svelte';
  import type { IDockviewSvelteProps } from './types';

  let props: IDockviewSvelteProps = $props();
  let el: HTMLDivElement;
  let api: DockviewApi | undefined = $state();

  onMount(() => {
    const frameworkOptions: DockviewFrameworkOptions = {
      createComponent: (options) =>
        new SvelteRenderer(props.components[options.name]),
      createTabComponent: (options) => {
        const tabComponents = props.tabComponents ?? {};
        const component = tabComponents[options.name] ?? props.defaultTabComponent;
        return component ? new SvelteRenderer(component) : undefined;
      },
      createWatermarkComponent: props.watermarkComponent
        ? () => new SvelteWatermarkRenderer(props.watermarkComponent!)
        : undefined,
      createLeftHeaderActionComponent: props.leftHeaderActionsComponent
        ? (group) => new SvelteHeaderActionsRenderer(props.leftHeaderActionsComponent!, group)
        : undefined,
      createRightHeaderActionComponent: props.rightHeaderActionsComponent
        ? (group) => new SvelteHeaderActionsRenderer(props.rightHeaderActionsComponent!, group)
        : undefined,
      createPrefixHeaderActionComponent: props.prefixHeaderActionsComponent
        ? (group) => new SvelteHeaderActionsRenderer(props.prefixHeaderActionsComponent!, group)
        : undefined,
      createContextMenuItemComponent: (options) => {
        if (!options.component) return undefined;
        return new SvelteContextMenuItemRenderer(options.component);
      },
      defaultTabComponent: props.defaultTabComponent ? '__dockview_svelte_default_tab__' : undefined,
    };

    const coreOptions = extractCoreOptions(props);
    if (props.tabGroupChipComponent) {
      coreOptions.createTabGroupChipComponent = () =>
        new SvelteTabGroupChipRenderer(props.tabGroupChipComponent!);
    }

    api = createDockview(el, { ...coreOptions, ...frameworkOptions });
    api.layout(el.clientWidth, el.clientHeight);
    props.onReady({ api });
  });

  onDestroy(() => api?.dispose());

  // One $effect per "watch" block in dockview-vue:
  // - $effect: PROPERTY_KEYS_DOCKVIEW changes → api.updateOptions({...changes})
  // - $effect: props.tabGroupChipComponent → api.updateOptions({ createTabGroupChipComponent })
  // - $effect: props.components → api.updateOptions({ createComponent })
  // - $effect: props.tabComponents | props.defaultTabComponent → api.updateOptions({ createTabComponent, defaultTabComponent })
  // - $effect: props.watermarkComponent → api.updateOptions({ createWatermarkComponent })
  // - $effect: props.{left,right,prefix}HeaderActionsComponent → api.updateOptions({ create...HeaderActionComponent })
  // - $effect: props.onDidDrop → subscribe via api.onDidDrop, dispose on cleanup
  // - $effect: props.onWillDrop → subscribe via api.onWillDrop, dispose on cleanup
</script>

<div bind:this={el} style="height: 100%; width: 100%;"></div>
```

`extractCoreOptions(props)` iterates `PROPERTY_KEYS_DOCKVIEW` and copies the keys present in `props` (mirror upstream Vue/React).

### `<SplitviewSvelte>`, `<GridviewSvelte>`, `<PaneviewSvelte>`

Same pattern, scoped down. Each:
- Imports its `create*` factory and `PROPERTY_KEYS_*` array from `dockview-core`.
- Takes `components: Record<string, Component<I*PanelProps>>` and `onReady: (event: *ReadyEvent) => void`.
- Paneview additionally takes `headerComponents?: Record<string, Component<I*HeaderProps>>` (mirror upstream — see `paneview/paneview.tsx`).
- Uses `SvelteRenderer` (not bespoke per-view classes) — the renderer base is generic.

For the `SplitviewSvelte` implementation outline see upstream `dockview/src/splitview/splitview.tsx`; it's the smallest surface and serves as the "test" that the bridge generalizes correctly.

### `<DefaultTab>`

Port `dockview/src/dockview/defaultTab.tsx` to a Svelte component. Renders the default tab UI with title, close button, and middle-click-to-close handler. Props match `IDockviewPanelHeaderProps`.

### Public exports (`src/index.ts`)

```ts
export * from 'dockview-core';

export { default as DockviewSvelte } from './dockview/dockview.svelte';
export { default as SplitviewSvelte } from './splitview/splitview.svelte';
export { default as GridviewSvelte } from './gridview/gridview.svelte';
export { default as PaneviewSvelte } from './paneview/paneview.svelte';
export { default as DefaultTab } from './dockview/default-tab.svelte';

export * from './dockview/types';
export * from './splitview/types';
export * from './gridview/types';
export * from './paneview/types';
export * from './context';
export {
  mountSvelteComponent,
  SvelteRenderer,
  SvelteWatermarkRenderer,
  SvelteHeaderActionsRenderer,
  SvelteContextMenuItemRenderer,
  SvelteTabGroupChipRenderer,
  SveltePart,
  type MountedComponent,
} from './utils.svelte';
```

## Tests

Stack: `vitest` + `@testing-library/svelte` + `jsdom` (all already in workspace devDeps via `packages/shell`).

`packages/dockview-svelte/vitest.config.ts` configures jsdom + the same `test-setup.ts` style as `packages/shell` (importing `@testing-library/jest-dom/vitest`).

Coverage targets:

- **`__tests__/utils.test.ts`** — bridge mechanics:
  - `mountSvelteComponent` mounts the component into the target element.
  - `update()` propagates without remount (assert the same DOM node identity before and after, and that an `onMount`-set state value persists).
  - `dispose()` removes the rendered DOM and calls `unmount`.
  - `context` map values are visible to descendants via `getContext`.
  - Calling `update()` after `dispose()` is a noop (or throws — match React's "resource is already disposed" behavior; document the choice).

- **`__tests__/dockview.test.ts`** — port relevant cases from upstream `dockview/src/__tests__/dockview/dockview.spec.tsx`:
  - Renders an empty dockview.
  - `onReady` fires with an `api`.
  - `api.addPanel({ component: 'a' })` mounts the component into a tab group.
  - `api.updateParameters({ ... })` reactively updates the rendered panel's props (the canonical reactivity test — mounts a component that displays `params.title`, asserts text, calls `updateParameters({ title: 'new' })`, asserts text changed without unmount/remount).
  - Watermark, header actions, drop event subscriptions.
  - Re-passing `props.components` updates `createComponent` for newly-added panels.

- **`__tests__/splitview.test.ts` / `gridview.test.ts` / `paneview.test.ts`** — port a representative subset from upstream's `splitview.spec.tsx` / `gridview.spec.tsx` / `paneview.spec.tsx`. Minimum: render, `onReady`, `addPanel`, `updateParameters` reactivity.

Coverage of every upstream test case is **not required** — port enough to demonstrate the four major surfaces work end-to-end. The implementer should err toward porting more than the minimum if time permits.

## Demo

`packages/dockview-svelte/demo/` is a tiny Vite app that consumes `dockview-svelte` from source (no build step; Vite resolves the workspace package directly).

`demo/src/app.svelte`:
- Mounts `<DockviewSvelte>` with three panel components.
- Initial layout: 3 panels in 2 groups (editor stacked with output, side-panel split right).
- Toolbar with buttons:
  - **Add panel** — `api.addPanel({ id: ..., component: 'editor', params: { fileName: ... } })`.
  - **Update active panel** — gets the active panel and calls `panel.api.updateParameters({ revision: Date.now() })`. Panel displays the revision number — visual proof of reactivity.
  - **Pop out group** — calls `api.addPopoutGroup(group)` to open the active group in a new browser window. Panel inside the popout reads from `getDockviewContext()` to display its `containerApi.id` — visual proof that context propagation survives popout.
  - **Save layout** — `console.log(api.toJSON())`.
  - **Load layout** — accepts pasted JSON via `prompt()` and calls `api.fromJSON(...)`.

`demo/src/panels/*.svelte` — three trivial panel components, each demonstrating one of the bridge's three load-bearing pitfalls:
- `editor-panel.svelte` — reads `params.fileName` and `params.revision` reactively (pitfall #2: `$state`-backed props).
- `output-panel.svelte` — calls `getDockviewContext()` in its `<script>` (pitfall #3: context propagation).
- `side-panel.svelte` — uses Svelte 5 `onMount` + `onDestroy` to log mount/unmount, verifying the bridge's `unmount` is wired (pitfall #1: leak prevention).

`demo/index.html` imports `dockview-core/dist/styles/dockview.css` (and any one of the bundled themes — pick `dockview-theme-abyss` or similar; the implementer's choice).

`demo/vite.config.ts` aliases `dockview-svelte` to `../src/index.ts` so the demo runs against source.

## Done criteria

The implementer must satisfy ALL of the following before reporting back:

1. `pnpm --filter dockview-svelte test` passes (vitest, all tests green).
2. `pnpm --filter dockview-svelte check` passes (svelte-check + tsc, zero errors).
3. Root `pnpm lint` passes for the new package's files.
4. `pnpm --filter dockview-svelte demo` boots and serves on a local port.
5. The demo's three behaviors are visually verified end-to-end:
   - Click "Update active panel" → the active panel's displayed revision number changes within the same DOM node (no remount). Verifiable via Chrome DevTools MCP: take a snapshot before, click, take a snapshot after, assert the panel's `<div>` retains identity and the text content changed.
   - Click "Pop out group" → a new browser window opens with the panel rendered inside it; the panel's display of `containerApi.id` is non-empty (proof that `getDockviewContext()` worked across the popout).
   - Reload the page → no console warnings about unmounted-but-still-listening reactive effects (proof that `unmount` ran for all panels).
7. The `git log` of the feature branch is legible: implementer commits ordered by surface (scaffold → bridge → dockview component → splitview/gridview/paneview → tests → demo → polish).

If any of #1–#4 fails, the implementer must fix the underlying issue (not silence the failure) before reporting back. If #5 cannot be verified via Chrome DevTools MCP for any reason, the implementer should leave a `docs/dockview-svelte-manual-checklist.md` with the exact sequence the user can step through in the morning to verify manually — and explicitly flag in the final report which behaviors were not auto-verified.

## Out-of-scope (will not be implemented)

- Server-side rendering / `render()` from `svelte/server`.
- Storybook / docs site.
- Library-mode build (`vite.config.ts` + `dist/` output). Deferred until the package is flipped to publishable.
- Publishing config beyond `"private": true` flip readiness.
- Theme CSS bundling — users `import 'dockview-core/dist/styles/dockview.css'`.
- Component-name string lookup (Vue-style `findComponent`).
- React-style `forwardRef` / imperative handle. Use `bind:this` on `<DockviewSvelte>`.
- Complete coverage of upstream's test suite — port representative tests, not exhaustive ones.
- A separate `dockview-svelte-demo` workspace package — demo is inline at `packages/dockview-svelte/demo/`.

## References

- Upstream Vue adapter (closest analog): `scratch/dockview/packages/dockview-vue/src/`
- Upstream React adapter (the `react.ts` bridge file the user originally pointed at): `scratch/dockview/packages/dockview/src/react.ts`
- Upstream React Dockview component: `scratch/dockview/packages/dockview/src/dockview/dockview.tsx`
- Svelte 5 imperative API: `mount` / `unmount` from `'svelte'`. `mount` accepts `{ target, props, events?, context?, intro? }`.
