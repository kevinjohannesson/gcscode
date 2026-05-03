# Map controls — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `MapApi.registerControl(registration): Disposable` to `@gcscode/extension-map` (declarative property bag with command-id action + lucide-or-svg icon, plus Svelte component escape hatch). Ship the first consumer: `@gcscode/extension-flight-overlay` registers a `gcscode.flight-overlay.recenter` command + a top-right declarative recenter control that fires it.

**Architecture:** Extends the existing `MapApi` cross-extension exports surface non-breakingly. New types (`ControlPosition`, `ControlIcon`, `MapControlContribution`, `MapControlComponentRegistration`, `ControlRegistration`) land alongside the existing `MapApi` definition in `map-api.svelte.ts`. A second `SvelteMap` (`_controls`) holds registrations keyed by public `id`. `map-view.svelte` grows four absolute-positioned slot containers over the maplibre canvas; controls render either as a host-owned button (`map-control-button.svelte`) or a Svelte component (escape hatch). The button's click→`executeCommand` dispatch reaches the `ExtensionHost` via a module-level slot (`host-store.ts`), captured in `index.ts`'s `activate(context)`. Lucide icons resolve via a static-map wrapper (`lucide-icon.svelte`) using `@lucide/svelte`'s individual-icon imports — tree-shakable, with a `?` fallback for unknown names.

**Tech Stack:** TypeScript, Svelte 5 (runes mode, `$state`, `$props`, `{@const}`, `{@html}`), `@lucide/svelte` (new dep on `@gcscode/extension-map`), Vitest with the established fake-host pattern, pnpm workspaces.

**Spec:** [`docs/specs/2026-05-03-map-controls.md`](../specs/2026-05-03-map-controls.md)

**No ADR.** All decisions extend established patterns — service-style extension contribution surface (per `2026-05-03-map-and-flight-overlay`), command-id-as-action (per Phase A2), workspace package boundary (ADR-0001), type-only sibling imports (ADR-0005).

---

## Important — every commit on this branch is green

This iteration's five feat/docs commits each leave the workspace passing `pnpm check` + `pnpm test` + `pnpm lint`. There are no intermediate non-green states.

| After commit                                                         | Workspace state                                                                                                                                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1: `MapApi.registerControl` types + registry                         | Green. New types + `controls` SvelteMap + `registerControl` method on `MapApi`. 5 new registry tests pass. Map view unchanged — no visible UI difference.                                  |
| 2: rendering pipeline (host-store + lucide-icon + button + map-view) | Green. Map view renders 4 corner slot containers (empty until controls register). All new internal files compile. **Browser smoke at this commit:** map renders normally; no controls yet. |
| 3: flight-overlay recenter command + control + tests                 | Green. Recenter command + control registered. 4 new flight-overlay tests pass. **Browser smoke:** recenter button appears top-right; click recenters; palette entry works.                 |
| 4: README updates                                                    | Green. Docs only — `extension-map/README.md` and `extension-flight-overlay/README.md`.                                                                                                     |
| 5: docs propagation (roadmap + alignment ledger + out-of-scope)      | Green. Docs only — `docs/roadmap.md`, `docs/vs-code-alignment.md`, `docs/out-of-scope.md`.                                                                                                 |

---

## File structure

| Path                                                   | Responsibility                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-map/package.json`                  | Add `@lucide/svelte` to `dependencies`. (Task 3.)                                                                                                                                                                                                   |
| `packages/extension-map/src/map-api.svelte.ts`         | Add `ControlPosition`, `ControlIcon`, `MapControlContribution`, `MapControlComponentRegistration`, `ControlRegistration` types. Extend `MapApi` with `registerControl`. Extend `MapApiImpl` with `_controls` SvelteMap + getter + method. (Task 2.) |
| `packages/extension-map/src/index.ts`                  | Re-export new types. Wire `setHost(context.host)` in `activate`. (Task 3.)                                                                                                                                                                          |
| `packages/extension-map/src/index.test.ts`             | Add `describe('mapApi.registerControl')` block — 5 tests. (Task 2.)                                                                                                                                                                                 |
| `packages/extension-map/src/host-store.ts`             | Module-level slot `setHost`/`clearHost`/`getHost`. Internal — not exported from package. (Task 3.)                                                                                                                                                  |
| `packages/extension-map/src/lucide-icon.svelte`        | Static-map wrapper around `@lucide/svelte` individual-icon imports. Renders `?` fallback for unknown names. (Task 3.)                                                                                                                               |
| `packages/extension-map/src/map-control-button.svelte` | Host's declarative-path button. Reads `getHost()` for click→`executeCommand`. Renders lucide via `LucideIcon` or raw SVG via `{@html}`. (Task 3.)                                                                                                   |
| `packages/extension-map/src/map-view.svelte`           | Wrap canvas in `.map-view__canvas-wrapper` (positioning parent). Add 4 corner slot containers iterating `mapApi.controls` filtered by position. Render branch: `'commandId' in reg` → `MapControlButton`, else component. (Task 3.)                 |
| `packages/extension-map/README.md`                     | Add `### registerControl(registration): Disposable` subsection. Update "What's NOT in this package" trailer (remove "recenter button"). (Task 4.)                                                                                                   |
| `packages/extension-flight-overlay/src/index.ts`       | Register `gcscode.flight-overlay.recenter` command. Register declarative recenter control via `map.registerControl(...)`. (Task 4.)                                                                                                                 |
| `packages/extension-flight-overlay/src/index.test.ts`  | Update `makeFakeMapExports()` to include `registerControl` mock + writable `camera`. Add 4 new tests covering command + control registration + recenter behavior with/without SITL fix. (Task 4.)                                                   |
| `packages/extension-flight-overlay/README.md`          | Add a `### Recenter command + control` section documenting palette discoverability. (Task 4.)                                                                                                                                                       |
| `pnpm-lock.yaml`                                       | Auto-updated by `pnpm install` after `@lucide/svelte` lands. (Task 3.)                                                                                                                                                                              |
| `docs/roadmap.md`                                      | Add a `**Map controls**` line under Feature extensions → Coming, ticked, linking the spec. (Task 5.)                                                                                                                                                |
| `docs/vs-code-alignment.md`                            | Add 5 alignment + 3 divergence + 4 deferral rows (or update existing where applicable). (Task 5.)                                                                                                                                                   |
| `docs/out-of-scope.md`                                 | REMOVE the "Map UI controls / overlay slots" row. ADD 4 new rows (theme tokens, control hover-state customization, control priority ordering, SVG sanitization). (Task 5.)                                                                          |

---

### Task 1: Establish baseline + create feature branch

**Files:** none (verification + branch creation)

- [ ] **Step 1: Verify on master with clean working tree**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `master`. The spec file (`docs/specs/2026-05-03-map-controls.md`) is already committed at `4fbf8df`.

- [ ] **Step 2: Verify lint, check, test all clean at baseline**

Run: `pnpm lint && pnpm check && pnpm test 2>&1 | tail -20`
Expected: all clean. Note the workspace test count for comparison; this iteration adds 9 new tests (5 to `extension-map/src/index.test.ts`, 4 to `extension-flight-overlay/src/index.test.ts`).

- [ ] **Step 3: Set up worktree on feature branch**

Run: `git worktree add .worktrees/feat-map-controls -b feat/map-controls`
Expected: worktree created at `.worktrees/feat-map-controls/`. Implementer subagents work inside `.worktrees/feat-map-controls/shell/` (the package root).

- [ ] **Step 4: Install deps in the worktree**

Run: `cd .worktrees/feat-map-controls/shell && pnpm install`
Expected: `Done` with no errors.

- [ ] **Step 5: Verify clean baseline in worktree**

Run: `cd .worktrees/feat-map-controls/shell && pnpm lint && pnpm check && pnpm test 2>&1 | tail -5`
Expected: all clean. Same workspace test count as Step 2.

---

### Task 2: `MapApi.registerControl` types + registry — commit 1

**Files:**

- Modify: `packages/extension-map/src/map-api.svelte.ts`
- Modify: `packages/extension-map/src/index.test.ts`

This task adds the new types and the registry-side method, plus 5 new tests. No UI rendering yet — `map-view.svelte` is unchanged. The new `_controls` map exists but has no consumer.

**Reminder for subagents working in worktrees (per CLAUDE.md):** every bash command MUST be prefixed with `cd .worktrees/feat-map-controls/shell &&`. Before every `git commit`, run `git branch --show-current` and verify the output is `feat/map-controls`.

#### Sub-section A: extend `map-api.svelte.ts`

- [ ] **Step 1: Read the current `packages/extension-map/src/map-api.svelte.ts`**

Run: `cd .worktrees/feat-map-controls/shell && cat packages/extension-map/src/map-api.svelte.ts`
Expected: prints the existing 88 lines (from imports through the `MAPLIBRE_CONTEXT_KEY` export).

- [ ] **Step 2: Add new type definitions before the existing `MapApi` interface**

Insert the following block immediately above the line `export interface MapApi {` (i.e. between the existing `MapCamera` interface and the existing `MapApi` interface):

```ts
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
```

- [ ] **Step 3: Extend the `MapApi` interface with `registerControl`**

Replace the existing `MapApi` interface block:

```ts
export interface MapApi {
  registerLayer(component: Component): Disposable;
  readonly camera: MapCamera;
}
```

with:

```ts
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
```

- [ ] **Step 4: Extend `MapApiImpl` with `_controls` field, getter, and `registerControl` method**

Replace the existing `MapApiImpl` class block with:

```ts
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
```

- [ ] **Step 5: Run check + test on the package to verify the type changes compile**

Run: `cd .worktrees/feat-map-controls/shell && pnpm --filter @gcscode/extension-map check && pnpm --filter @gcscode/extension-map test 2>&1 | tail -10`
Expected: check passes; existing 6 tests still pass.

#### Sub-section B: add `registerControl` tests

- [ ] **Step 6: Read the current `packages/extension-map/src/index.test.ts`**

Run: `cd .worktrees/feat-map-controls/shell && wc -l packages/extension-map/src/index.test.ts`
Expected: ~110 lines.

- [ ] **Step 7: Add 5 new tests in a `describe('mapApi.registerControl')` block**

Append the following block at the end of the file (after the closing `});` of the existing `describe('mapApi', ...)` block, before the EOF):

```ts
describe('mapApi.registerControl', () => {
  it('declarative registration adds an entry; Disposable.dispose removes it', () => {
    const reg = {
      id: 'test.control.declarative.add-remove',
      position: 'top-right' as const,
      icon: { kind: 'lucide' as const, name: 'crosshair' },
      tooltip: 'test',
      commandId: 'test.cmd',
    };

    const disposable = mapApi.registerControl(reg);
    expect(mapApi.controls.has(reg.id)).toBe(true);
    expect(mapApi.controls.get(reg.id)).toBe(reg);

    disposable.dispose();
    expect(mapApi.controls.has(reg.id)).toBe(false);
  });

  it('component registration adds an entry; Disposable.dispose removes it', () => {
    const FakeComponent = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];
    const reg = {
      id: 'test.control.component.add-remove',
      position: 'bottom-left' as const,
      component: FakeComponent,
    };

    const disposable = mapApi.registerControl(reg);
    expect(mapApi.controls.has(reg.id)).toBe(true);
    expect(mapApi.controls.get(reg.id)).toBe(reg);

    disposable.dispose();
    expect(mapApi.controls.has(reg.id)).toBe(false);
  });

  it('Disposable.dispose is idempotent', () => {
    const reg = {
      id: 'test.control.idempotent',
      position: 'top-left' as const,
      icon: { kind: 'lucide' as const, name: 'crosshair' },
      tooltip: 'test',
      commandId: 'test.cmd',
    };

    const disposable = mapApi.registerControl(reg);
    disposable.dispose();
    expect(() => disposable.dispose()).not.toThrow();
    expect(mapApi.controls.has(reg.id)).toBe(false);
  });

  it('duplicate id throws and the message includes the offending id', () => {
    const reg = {
      id: 'test.control.duplicate',
      position: 'top-right' as const,
      icon: { kind: 'lucide' as const, name: 'crosshair' },
      tooltip: 'test',
      commandId: 'test.cmd',
    };

    const disposable = mapApi.registerControl(reg);
    expect(() => mapApi.registerControl(reg)).toThrow(/test\.control\.duplicate/);

    disposable.dispose();
  });

  it('disposing then re-registering the same id succeeds', () => {
    const reg = {
      id: 'test.control.dispose-reregister',
      position: 'bottom-right' as const,
      icon: { kind: 'lucide' as const, name: 'crosshair' },
      tooltip: 'test',
      commandId: 'test.cmd',
    };

    const first = mapApi.registerControl(reg);
    first.dispose();
    expect(mapApi.controls.has(reg.id)).toBe(false);

    const second = mapApi.registerControl(reg);
    expect(mapApi.controls.has(reg.id)).toBe(true);

    second.dispose();
  });
});
```

- [ ] **Step 8: Run the package's tests and verify the 5 new tests pass**

Run: `cd .worktrees/feat-map-controls/shell && pnpm --filter @gcscode/extension-map test 2>&1 | tail -15`
Expected: 11 tests pass total (6 existing + 5 new).

- [ ] **Step 9: Run workspace-wide check + lint to confirm no regressions**

Run: `cd .worktrees/feat-map-controls/shell && pnpm check && pnpm lint && pnpm test 2>&1 | tail -10`
Expected: all clean. Workspace test count is baseline + 5.

#### Sub-section C: commit

- [ ] **Step 10: Stage and verify branch before commit**

Run: `cd .worktrees/feat-map-controls/shell && git branch --show-current`
Expected: `feat/map-controls`. If output is `master`, STOP — the cwd is wrong.

Run: `cd .worktrees/feat-map-controls/shell && git add packages/extension-map/src/map-api.svelte.ts packages/extension-map/src/index.test.ts && git status`
Expected: only those two files staged.

- [ ] **Step 11: Commit with a feature message**

Run:

```bash
cd .worktrees/feat-map-controls/shell && git commit -m "$(cat <<'EOF'
feat(map): MapApi.registerControl + control registry types

Adds ControlPosition / ControlIcon / MapControlContribution /
MapControlComponentRegistration / ControlRegistration types alongside
the existing MapApi definition. Extends MapApiImpl with a SvelteMap
keyed by public id, a getter for map-view consumption, and a
registerControl method with id-uniqueness validation.

No UI rendering yet — map-view.svelte is unchanged. The next commit
wires up the rendering pipeline.

5 new registry tests covering: declarative add/remove, component
add/remove, idempotent dispose, duplicate id throws, dispose-then-
re-register works.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands on `feat/map-controls`.

---

### Task 3: Rendering pipeline — host-store, lucide-icon, button, map-view — commit 2

**Files:**

- Create: `packages/extension-map/src/host-store.ts`
- Create: `packages/extension-map/src/lucide-icon.svelte`
- Create: `packages/extension-map/src/map-control-button.svelte`
- Modify: `packages/extension-map/package.json` (add `@lucide/svelte` dep)
- Modify: `packages/extension-map/src/index.ts` (re-export new types; call `setHost`)
- Modify: `packages/extension-map/src/map-view.svelte` (canvas wrapper + 4 corner slots + render branches)

This task wires up the full rendering pipeline for controls. After this commit, the map view renders four (empty) corner slot containers and is ready to display controls when registered.

#### Sub-section A: add `@lucide/svelte` runtime dep

- [ ] **Step 1: Add `@lucide/svelte` to `extension-map`**

Run: `cd .worktrees/feat-map-controls/shell && pnpm add @lucide/svelte --filter @gcscode/extension-map`
Expected: `pnpm add` resolves the latest `@lucide/svelte` version, updates `packages/extension-map/package.json`, updates `pnpm-lock.yaml`. After this, `package.json`'s `dependencies` block has `@gcscode/extension-api: workspace:*`, `@lucide/svelte: ^x.y.z`, `maplibre-gl: ^5.x.x`.

- [ ] **Step 2: Verify the published export path of `@lucide/svelte` for individual icons**

Run: `cd .worktrees/feat-map-controls/shell && ls node_modules/@lucide/svelte/dist/icons/ 2>/dev/null | head -10`
Expected: a list of `.svelte` files (or `.js` files) named after kebab-case icon names, e.g. `crosshair.svelte`, `zoom-in.svelte`, `layers.svelte`, etc.

If the path is different (the package's individual-icon export shape may have evolved), update Step 4's `import Crosshair from '@lucide/svelte/icons/crosshair';` to match the real path. The published `package.json`'s `exports` field is authoritative — `cat node_modules/@lucide/svelte/package.json | head -50` shows what's exported.

#### Sub-section B: create `host-store.ts`

- [ ] **Step 3: Create `packages/extension-map/src/host-store.ts`**

Full content:

```ts
import type { ExtensionHost } from '@gcscode/extension-api';

/**
 * Module-level slot for the captured ExtensionHost. Set by the map
 * extension's `activate(context)` so internal components (notably
 * MapControlButton) can dispatch commands without each instance receiving
 * the host as a prop.
 *
 * Intentionally NOT exported from the package's `index.ts` — this is an
 * internal-only contract. Extension consumers (component-path controls)
 * read the host through the public `host.extensions.getExtension(...)`
 * pattern instead.
 *
 * Single-instance assumption: only one `gcscode.map` extension is active
 * at a time. If the extension is disabled and re-enabled, `activate` runs
 * again and overwrites the slot — the previous host reference is also
 * still valid until the disable's deactivate completes; both writes use
 * `context.host` of equivalent shape, so the overwrite is benign.
 */

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

#### Sub-section C: create `lucide-icon.svelte`

- [ ] **Step 4: Create `packages/extension-map/src/lucide-icon.svelte`**

Static-map approach: each lucide icon used by gcscode is statically imported and registered in the `ICONS` record. Adding a new icon requires a 2-line edit (import + map entry). Tree-shakes — only icons in the map are bundled.

Full content:

```svelte
<script lang="ts">
  import Crosshair from '@lucide/svelte/icons/crosshair';

  /**
   * Static name → component map. To add a new lucide icon for use in a
   * MapControlContribution's `{ kind: 'lucide', name }`:
   *   1. Add an `import` for it from `'@lucide/svelte/icons/<name>'`.
   *   2. Add the name → component entry to ICONS.
   *
   * Unknown names render a `?` fallback at the requested size; they don't
   * crash the map view. When extensions need lucide names not pre-registered
   * here, swap to runtime resolution via the headless `lucide` package data
   * — that's a non-breaking refactor (the public API remains a name string).
   */
  const ICONS = {
    crosshair: Crosshair,
  } as const;

  type IconName = keyof typeof ICONS;

  let { name, size = 16 }: { name: string; size?: number } = $props();

  const isKnown = (n: string): n is IconName => n in ICONS;
</script>

{#if isKnown(name)}
  {@const IconComponent = ICONS[name]}
  <IconComponent {size} />
{:else}
  <span
    class="lucide-icon-fallback"
    title={`Unknown lucide icon: ${name}`}
    style:width="{size}px"
    style:height="{size}px">?</span
  >
{/if}

<style>
  .lucide-icon-fallback {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed currentColor;
    color: #999;
    font-size: 0.75rem;
    line-height: 1;
    border-radius: 2px;
  }
</style>
```

- [ ] **Step 5: Run the Svelte autofixer on the new file**

Per project convention (CLAUDE.md mandates the svelte-autofixer for new Svelte code), run via the MCP tool to confirm no issues. If issues are reported, fix them and re-run until clean.

The autofixer is invoked from your IDE-bound MCP server, not via shell — invoke it on the file's contents.

(If the autofixer is not available in this execution context, skip this step and verify with `pnpm --filter @gcscode/extension-map check` instead.)

#### Sub-section D: create `map-control-button.svelte`

- [ ] **Step 6: Create `packages/extension-map/src/map-control-button.svelte`**

Full content:

```svelte
<script lang="ts">
  import type { MapControlContribution } from './map-api.svelte';
  import { getHost } from './host-store';
  import LucideIcon from './lucide-icon.svelte';

  let { reg }: { reg: MapControlContribution } = $props();

  function onclick() {
    // Fire-and-forget. We don't surface command return value or errors
    // back to the contributor — see registerControl jsdoc.
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
    <!-- SAFE: extensions are first-party today; sandboxing is deferred. See
         docs/out-of-scope.md "Third-party sandboxing" + this iteration's
         "SVG sanitization" row. -->
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

- [ ] **Step 7: Run the Svelte autofixer on the new file**

Same as Step 5: run `svelte-autofixer` if available; otherwise rely on `pnpm check` later.

#### Sub-section E: wire host capture in `index.ts`

- [ ] **Step 8: Read the current `packages/extension-map/src/index.ts`**

Run: `cd .worktrees/feat-map-controls/shell && cat packages/extension-map/src/index.ts`
Expected: prints the existing 22-or-so-line file.

- [ ] **Step 9: Update `packages/extension-map/src/index.ts` to re-export new types and call `setHost`**

Replace the entire file content with:

```ts
import type { Extension } from '@gcscode/extension-api';

import { setHost } from './host-store';
import { mapApi, type MapApi } from './map-api.svelte';
import MapView from './map-view.svelte';

export type {
  ControlIcon,
  ControlPosition,
  ControlRegistration,
  MapApi,
  MapCamera,
  MapControlComponentRegistration,
  MapControlContribution,
} from './map-api.svelte';
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
    setHost(context.host);
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

- [ ] **Step 10: Run the package's check + test to confirm no regressions**

Run: `cd .worktrees/feat-map-controls/shell && pnpm --filter @gcscode/extension-map check && pnpm --filter @gcscode/extension-map test 2>&1 | tail -15`
Expected: check passes; 11 tests still pass.

#### Sub-section F: update `map-view.svelte`

- [ ] **Step 11: Read the current `packages/extension-map/src/map-view.svelte`**

Run: `cd .worktrees/feat-map-controls/shell && cat packages/extension-map/src/map-view.svelte`
Expected: prints the existing 95-or-so-line file.

- [ ] **Step 12: Replace `packages/extension-map/src/map-view.svelte` with the controls-aware version**

Full new content:

```svelte
<script lang="ts">
  import 'maplibre-gl/dist/maplibre-gl.css';
  import maplibregl from 'maplibre-gl';
  import { onDestroy, onMount, setContext } from 'svelte';

  import { mapApi, MAPLIBRE_CONTEXT_KEY } from './map-api.svelte';
  import MapControlButton from './map-control-button.svelte';

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

  // Static list of corner positions iterated in the template. Declared once
  // here to avoid re-allocating an array tuple inside the {#each} key.
  const POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

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
  <div class="map-view__canvas-wrapper">
    <div class="map-view__canvas" bind:this={container}></div>
    {#if map}
      {#each POSITIONS as pos (pos)}
        <div class="map-view__controls map-view__controls--{pos}">
          {#each [...mapApi.controls].filter(([, r]) => r.position === pos) as [id, reg] (id)}
            {#if 'commandId' in reg}
              <MapControlButton {reg} />
            {:else}
              {@const ControlComponent = reg.component}
              <ControlComponent />
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
    /* Slot wrapper ignores pointer events so empty corners don't block map
       drag/zoom across the whole top of the canvas. Children re-enable. */
    pointer-events: none;
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
  /* Bottom corners use column-reverse so registration order = "first-
     registered closest to the anchor corner" — first control sits at the
     bottom; subsequent controls stack upward away from the corner. */
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

- [ ] **Step 13: Run the Svelte autofixer on the updated file**

Same as Step 5/7. Fix any reported issues.

- [ ] **Step 14: Run package check + tests**

Run: `cd .worktrees/feat-map-controls/shell && pnpm --filter @gcscode/extension-map check && pnpm --filter @gcscode/extension-map test 2>&1 | tail -10`
Expected: check passes; 11 tests pass.

#### Sub-section G: workspace verification + browser smoke + commit

- [ ] **Step 15: Run workspace-wide check + lint + test**

Run: `cd .worktrees/feat-map-controls/shell && pnpm check && pnpm lint && pnpm test 2>&1 | tail -10`
Expected: all clean.

- [ ] **Step 16: Browser smoke — verify the map still renders normally with no controls**

Run: `cd .worktrees/feat-map-controls/shell && pnpm dev` in a separate terminal (or background). Open `http://localhost:5173/` in a browser.

Expected:

- The Map view renders the maplibre canvas as before.
- All 4 corner slot containers exist in the DOM (inspect: `.map-view__controls--top-right`, etc.) but are empty.
- No console errors related to controls or `getHost`.
- Map drag/zoom still works (pointer-events on empty slot wrappers don't block gestures).

Stop the dev server before continuing (`Ctrl+C`).

- [ ] **Step 17: Run prettier-format on changed files (per project convention)**

Run: `cd .worktrees/feat-map-controls/shell && pnpm format 2>&1 | tail -10`
Expected: at most a few files reformatted (or none if everything is already formatted).

- [ ] **Step 18: Stage and verify branch before commit**

Run: `cd .worktrees/feat-map-controls/shell && git branch --show-current`
Expected: `feat/map-controls`. STOP if `master`.

Run: `cd .worktrees/feat-map-controls/shell && git add packages/extension-map/package.json packages/extension-map/src/host-store.ts packages/extension-map/src/lucide-icon.svelte packages/extension-map/src/map-control-button.svelte packages/extension-map/src/map-view.svelte packages/extension-map/src/index.ts pnpm-lock.yaml && git status`
Expected: only those 7 files staged.

- [ ] **Step 19: Commit**

```bash
cd .worktrees/feat-map-controls/shell && git commit -m "$(cat <<'EOF'
feat(map): rendering pipeline for controls — host-store, lucide-icon, button, slot containers

Adds the rendering infrastructure for MapApi.registerControl:

- host-store.ts captures the ExtensionHost from activate(context) into
  a module-level slot so MapControlButton can dispatch commands
  without each instance receiving the host as a prop.
- lucide-icon.svelte wraps @lucide/svelte's individual-icon imports
  with a static name → component map. Renders a `?` fallback for
  unknown names so typo'd icon names don't crash the map view.
- map-control-button.svelte is the host's declarative-path button:
  32×32 px, lucide-or-svg icon, click → host.commands.executeCommand
  via fire-and-forget.
- map-view.svelte wraps the canvas in a positioning parent and adds
  four absolute-positioned slot containers (one per corner), each
  iterating mapApi.controls filtered by position. Render branch
  uses 'commandId' in reg to narrow declarative vs component.
- @lucide/svelte added as a runtime dep on @gcscode/extension-map.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands on `feat/map-controls`.

---

### Task 4: flight-overlay recenter command + control + tests — commit 3

**Files:**

- Modify: `packages/extension-flight-overlay/src/index.ts`
- Modify: `packages/extension-flight-overlay/src/index.test.ts`

This task adds the first consumer: a `gcscode.flight-overlay.recenter` command (palette-discoverable as `Flight Overlay: Recenter on Drone`) and a top-right declarative recenter control that fires it.

#### Sub-section A: update flight-overlay `index.ts`

- [ ] **Step 1: Read the current `packages/extension-flight-overlay/src/index.ts`**

Run: `cd .worktrees/feat-map-controls/shell && cat packages/extension-flight-overlay/src/index.ts`
Expected: prints the existing 39-line file.

- [ ] **Step 2: Replace `packages/extension-flight-overlay/src/index.ts` with the recenter-aware version**

Full new content:

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
    id: 'gcscode.flight-overlay',
    displayName: 'Flight Overlay',
    version: '0.0.0',
    description: 'Drone marker, home location, and max-distance circle rendered on the map.',
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

      // Recenter command — palette-discoverable as
      // `Flight Overlay: Recenter on Drone`. Same action wired to both the
      // top-right map control button and the palette entry; either path
      // routes through executeCommand.
      context.host.commands.registerCommand({
        id: 'gcscode.flight-overlay.recenter',
        title: 'Recenter on Drone',
        category: 'Flight Overlay',
        run: () => {
          const sitl = flightOverlayState.sitlExports;
          const lat = sitl?.telemetry.lat ?? null;
          const lng = sitl?.telemetry.lng ?? null;
          if (lat !== null && lng !== null) {
            map.camera.center = [lng, lat];
          } else {
            // SITL has no fix yet — fall back to homeLocation so the operator
            // gets a sensible "go back to where the drone should be" result
            // rather than a silent no-op.
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

#### Sub-section B: update flight-overlay tests

- [ ] **Step 3: Read the current `packages/extension-flight-overlay/src/index.test.ts`**

Run: `cd .worktrees/feat-map-controls/shell && wc -l packages/extension-flight-overlay/src/index.test.ts`
Expected: ~134 lines.

- [ ] **Step 4: Update `makeFakeMapExports()` to include `registerControl` mock and writable camera**

Locate the existing helper:

```ts
function makeFakeMapExports(): MapApi {
  return {
    registerLayer: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    camera: { center: [0, 0], zoom: 1, pitch: 0, bearing: 0 },
  };
}
```

Replace it with:

```ts
function makeFakeMapExports(): MapApi {
  // Plain mutable object — recenter tests assert post-write camera.center
  // values. The real $state-backed camera is one-way reactive in production
  // but a plain object reproduces the assignment semantics tests need.
  const camera = { center: [0, 0] as [number, number], zoom: 1, pitch: 0, bearing: 0 };
  return {
    registerLayer: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    registerControl: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    camera,
  };
}
```

- [ ] **Step 5: Update existing "activate registers three layers" test to assert subscription count**

Locate the existing test:

```ts
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
```

Replace the body's two assertions:

```ts
expect(fakeMap.registerLayer).toHaveBeenCalledTimes(3);
expect(subscriptions).toHaveLength(3);
```

with:

```ts
expect(fakeMap.registerLayer).toHaveBeenCalledTimes(3);
expect(subscriptions).toHaveLength(5); // 3 layers + 1 command + 1 control
```

(The subscription count grows because activate now pushes 5 disposables, not 3.)

- [ ] **Step 6: Add 4 new tests in the existing `describe('flightOverlayExtension')` block**

Append the following 4 tests inside the existing `describe('flightOverlayExtension', () => { ... })` block, immediately before the closing `});`:

```ts
it('activate registers the gcscode.flight-overlay.recenter command', () => {
  const fakeMap = makeFakeMapExports();
  const host = makeFakeHost({
    getExtension: vi.fn((id: string) =>
      id === 'gcscode.map' ? { id, exports: fakeMap as unknown } : undefined,
    ) as ExtensionHost['extensions']['getExtension'],
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

  expect(host.commands.registerCommand).toHaveBeenCalledTimes(1);
  const [cmd] = (host.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(cmd.id).toBe('gcscode.flight-overlay.recenter');
  expect(cmd.title).toBe('Recenter on Drone');
  expect(cmd.category).toBe('Flight Overlay');
  expect(typeof cmd.run).toBe('function');

  flightOverlayExtension.deactivate?.();
});

it('activate registers a top-right recenter control whose commandId points at the recenter command', () => {
  const fakeMap = makeFakeMapExports();
  const host = makeFakeHost({
    getExtension: vi.fn((id: string) =>
      id === 'gcscode.map' ? { id, exports: fakeMap as unknown } : undefined,
    ) as ExtensionHost['extensions']['getExtension'],
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

  expect(fakeMap.registerControl).toHaveBeenCalledTimes(1);
  const [reg] = (fakeMap.registerControl as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(reg.id).toBe('gcscode.flight-overlay.recenter');
  expect(reg.position).toBe('top-right');
  expect(reg.commandId).toBe('gcscode.flight-overlay.recenter');
  expect(reg.icon).toEqual({ kind: 'lucide', name: 'crosshair' });
  expect(typeof reg.tooltip).toBe('string');
  expect(reg.tooltip.length).toBeGreaterThan(0);

  flightOverlayExtension.deactivate?.();
});

it('recenter command writes map.camera.center to the SITL position when telemetry has a fix', () => {
  const fakeMap = makeFakeMapExports();
  const fakeSitl: SitlExports = {
    telemetry: {
      mode: 'GUIDED',
      armed: true,
      lat: -35.5,
      lng: 149.2,
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

  const [cmd] = (host.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0];
  cmd.run();

  expect(fakeMap.camera.center).toEqual([149.2, -35.5]);

  flightOverlayExtension.deactivate?.();
});

it('recenter command falls back to homeLocation when SITL telemetry has no fix', () => {
  const fakeMap = makeFakeMapExports();
  const fakeSitl: SitlExports = {
    telemetry: {
      mode: null,
      armed: null,
      lat: null,
      lng: null,
      alt: null,
      heading: null,
      roll: null,
      pitch: null,
      yaw: null,
      groundspeed: null,
      voltageBattery: null,
      batteryRemaining: null,
      connection: 'connecting',
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

  const [cmd] = (host.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0];
  cmd.run();

  // homeLocation is the SITL ArduCopter default starting point (Canberra) —
  // see flight-overlay-config.ts. The exact tuple is `[149.165_25, -35.363_26]`.
  expect(fakeMap.camera.center).toEqual([149.16525, -35.36326]);

  flightOverlayExtension.deactivate?.();
});
```

- [ ] **Step 7: Run the package's tests**

Run: `cd .worktrees/feat-map-controls/shell && pnpm --filter @gcscode/extension-flight-overlay test 2>&1 | tail -15`
Expected: 8 tests pass total (4 existing + 4 new). The previously-existing "activate registers three layers" test still passes because the assertion was updated to expect 5 subscriptions.

- [ ] **Step 8: Run workspace check + lint + test**

Run: `cd .worktrees/feat-map-controls/shell && pnpm check && pnpm lint && pnpm test 2>&1 | tail -10`
Expected: all clean. Workspace test count is baseline + 9.

#### Sub-section C: browser smoke + commit

- [ ] **Step 9: Browser smoke — verify the recenter button works end-to-end**

Run: `cd .worktrees/feat-map-controls/shell && pnpm dev` in a separate terminal. Open `http://localhost:5173/`.

Verify, in order:

1. The Map view renders the maplibre canvas.
2. A small white square button appears at the top-right corner of the canvas, with a crosshair icon centered.
3. Hovering the button shows the "Recenter on drone" tooltip.
4. Pan the map manually (drag) so the camera is no longer centered on the drone marker.
5. Click the recenter button. The camera jumps to the live drone position (or to homeLocation if SITL is disconnected — visible as a static marker at Canberra).
6. Open the command palette with `Ctrl+Shift+P`. Type "recenter". The entry `Flight Overlay: Recenter on Drone` appears. Select it. The same recenter behavior fires.
7. Open the extensions panel with `Ctrl+Shift+X`. Disable the Flight Overlay extension. The recenter button disappears from the map. Re-enable it; the button reappears.
8. No console errors throughout.

Stop the dev server (`Ctrl+C`).

- [ ] **Step 10: Run prettier-format on changed files**

Run: `cd .worktrees/feat-map-controls/shell && pnpm format 2>&1 | tail -5`
Expected: at most a few files reformatted.

- [ ] **Step 11: Stage and verify branch before commit**

Run: `cd .worktrees/feat-map-controls/shell && git branch --show-current`
Expected: `feat/map-controls`.

Run: `cd .worktrees/feat-map-controls/shell && git add packages/extension-flight-overlay/src/index.ts packages/extension-flight-overlay/src/index.test.ts && git status`
Expected: only those two files staged.

- [ ] **Step 12: Commit**

```bash
cd .worktrees/feat-map-controls/shell && git commit -m "$(cat <<'EOF'
feat(flight-overlay): recenter command + map control — first MapApi.registerControl consumer

Adds gcscode.flight-overlay.recenter:

- Command (palette-discoverable as `Flight Overlay: Recenter on Drone`)
  that writes map.camera.center to the live SITL drone position, or
  falls back to homeLocation if SITL has no fix.
- Top-right declarative map control whose commandId fires the same
  command. Validates the MapApi.registerControl declarative path end-
  to-end.

Test updates:

- makeFakeMapExports() gains a registerControl mock and a plain
  mutable camera object so recenter assertions can read the post-write
  center value.
- "activate registers three layers" test's subscription-count
  assertion grows from 3 to 5 (3 layers + 1 command + 1 control).
- 4 new tests cover command registration, control registration with
  the right shape, recenter-with-fix, and recenter-without-fix
  fallback to homeLocation.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands on `feat/map-controls`.

---

### Task 5: README updates — commit 4

**Files:**

- Modify: `packages/extension-map/README.md`
- Modify: `packages/extension-flight-overlay/README.md`

#### Sub-section A: update `extension-map/README.md`

- [ ] **Step 1: Read the current `packages/extension-map/README.md`**

Run: `cd .worktrees/feat-map-controls/shell && cat packages/extension-map/README.md`
Expected: prints the existing README. Note the section structure for the next steps.

- [ ] **Step 2: Add `### registerControl(registration): Disposable` subsection**

Locate the existing `### registerLayer(component): Disposable` section. After its closing paragraph (before the `### camera: MapCamera` heading), insert the following new section:

````md
### `registerControl(registration): Disposable`

Register an interactive control rendered over the map canvas. Two registration shapes are accepted; the host renders both inside the same per-corner slot wrapper (positioning + spacing chrome).

#### Declarative property bag (recommended)

Prefer this path for icon-button controls. The host renders a uniformly-styled button (32×32 px, white, drop shadow) so all controls look consistent regardless of which extension contributed them.

```ts
context.subscriptions.push(
  map.registerControl({
    id: 'myExtension.recenter',
    position: 'top-right',
    icon: { kind: 'lucide', name: 'crosshair' },
    tooltip: 'Recenter on drone',
    commandId: 'myExtension.recenter',
  }),
);
```

The `commandId` must reference a command registered via `host.commands.registerCommand`. Click fires the command via `executeCommand` (fire-and-forget — the host does not surface the command's return value or rejection back to the contributor).

The icon is a discriminated union:

- `{ kind: 'lucide'; name: string }` — name resolved against the lucide set the host pre-registers. If you need a name not yet pre-registered, see the static map in `packages/extension-map/src/lucide-icon.svelte` (a 2-line PR).
- `{ kind: 'svg'; svg: string }` — raw SVG markup, inlined by the host. Include a `viewBox`; omit `width`/`height` on the root `<svg>`; use `currentColor` for strokes/fills so the host's hover state reaches the icon.

`position` is one of `'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'`. Top corners stack registered controls downward from the corner; bottom corners stack upward.

#### Component escape hatch (advanced)

Use only when the control's shape doesn't fit an icon button — multi-state toggles, layer-toggle dropdowns, zoom-level indicators. The component renders inside the same slot wrapper but owns its visual.

```ts
context.subscriptions.push(
  map.registerControl({
    id: 'myExtension.layerToggle',
    position: 'bottom-right',
    component: MyLayerToggle,
  }),
);
```

The component reads the maplibre `Map` instance via the same Svelte context layers use — `getContext<() => maplibregl.Map | null>('gcscode.map.maplibre')`.

#### Errors and limits

- `id` must be unique across all controls. Re-using a still-registered `id` throws.
- `id` ordering: registration order. No numeric `priority` field today.
- No visibility / `when` clauses today. Registered controls are always visible.
- No customization of host-rendered button colors / hover state on the declarative path. If you need a different visual, use the component escape hatch (and accept the loss of operator-UX consistency).
````

- [ ] **Step 3: Update the "What's NOT in this package" trailer**

Locate the trailer paragraph at the bottom of the README:

```md
## What's NOT in this package

- Selection state, animated camera (`flyTo`/`easeTo`), follow-mode toggle, recenter button, layer-ordering API, multi-drone, route history, manual targeting. See `docs/specs/2026-05-03-map-and-flight-overlay.md` for the full deferral list.
```

Replace with:

```md
## What's NOT in this package

- Selection state, animated camera (`flyTo`/`easeTo`), follow-mode toggle, layer-ordering API, multi-drone, route history, manual targeting. See `docs/specs/2026-05-03-map-and-flight-overlay.md` for the layer-iteration deferrals and `docs/specs/2026-05-03-map-controls.md` for the controls-iteration deferrals (control priority ordering, hover-state customization, theme tokens, SVG sanitization).
```

(The recenter button reference is removed — flight-overlay ships it now via `registerControl`.)

#### Sub-section B: update `extension-flight-overlay/README.md`

- [ ] **Step 4: Read the current `packages/extension-flight-overlay/README.md`**

Run: `cd .worktrees/feat-map-controls/shell && cat packages/extension-flight-overlay/README.md`
Expected: prints the existing README.

- [ ] **Step 5: Add a `## Recenter command + control` section**

After the existing `## Architecture notes` section, insert the following section before the `## See also` section:

```md
## Recenter command + control

`gcscode.flight-overlay.recenter` is a palette-discoverable command (`Flight Overlay: Recenter on Drone`) that writes `map.camera.center` to the live SITL drone position. If SITL has no fix yet, it falls back to `homeLocation` from `flight-overlay-config.ts` so the operator gets a sensible "go back to where the drone should be" result rather than a silent no-op.

The command is also wired to a top-right map control button (crosshair icon) registered via `MapApi.registerControl`. The button and the palette entry route through the same command — either path executes the same recenter logic.

This is the first consumer of `MapApi.registerControl` in gcscode. The control uses the declarative property-bag path (icon + tooltip + `commandId`); the host owns the button rendering.
```

- [ ] **Step 6: Update the `## See also` section to link the new spec**

Locate the existing `## See also` list:

```md
## See also

- [Spec 2026-05-03-map-and-flight-overlay](../../docs/specs/2026-05-03-map-and-flight-overlay.md) — this iteration
- [`@gcscode/extension-map`](../extension-map/README.md) — the contribution API this consumes
- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries
```

Replace with:

```md
## See also

- [Spec 2026-05-03-map-and-flight-overlay](../../docs/specs/2026-05-03-map-and-flight-overlay.md) — layer-registration iteration
- [Spec 2026-05-03-map-controls](../../docs/specs/2026-05-03-map-controls.md) — control-registration iteration (this package's recenter button)
- [`@gcscode/extension-map`](../extension-map/README.md) — the contribution API this consumes
- [ADR-0005](../../docs/decisions/ADR-0005-extension-boundaries.md) — extension boundaries
```

#### Sub-section C: verify + commit

- [ ] **Step 7: Run prettier-format on the READMEs**

Run: `cd .worktrees/feat-map-controls/shell && pnpm format 2>&1 | tail -5`
Expected: a couple of files possibly reformatted.

- [ ] **Step 8: Run lint to confirm READMEs pass**

Run: `cd .worktrees/feat-map-controls/shell && pnpm lint 2>&1 | tail -10`
Expected: clean.

- [ ] **Step 9: Stage and verify branch before commit**

Run: `cd .worktrees/feat-map-controls/shell && git branch --show-current`
Expected: `feat/map-controls`.

Run: `cd .worktrees/feat-map-controls/shell && git add packages/extension-map/README.md packages/extension-flight-overlay/README.md && git status`
Expected: only those two files staged.

- [ ] **Step 10: Commit**

```bash
cd .worktrees/feat-map-controls/shell && git commit -m "$(cat <<'EOF'
docs: README updates for map controls iteration

- extension-map README gains a registerControl(registration) section
  documenting both the declarative property-bag (recommended) and
  Svelte component escape hatch shapes, the icon discriminated union,
  position vocabulary, and the error/limits behavior. "What's NOT in
  this package" trailer drops the recenter-button bullet (shipped now
  via flight-overlay) and points at the controls-iteration spec for
  the new deferrals.
- extension-flight-overlay README documents the recenter command +
  control and notes this is the first MapApi.registerControl consumer.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands on `feat/map-controls`.

---

### Task 6: Docs propagation — roadmap, alignment ledger, out-of-scope — commit 5

**Files:**

- Modify: `docs/roadmap.md`
- Modify: `docs/vs-code-alignment.md`
- Modify: `docs/out-of-scope.md`

#### Sub-section A: roadmap

- [ ] **Step 1: Read the current `docs/roadmap.md`**

Run: `cd .worktrees/feat-map-controls/shell && cat docs/roadmap.md`
Expected: prints the existing roadmap.

- [ ] **Step 2: Add a `Map controls` line under Feature extensions → Coming**

Locate the existing Map line:

```md
- [x] **Map** — geographical view + map contribution API for layer registration. First service-style extension. Selection state deferred to a later iteration. Spec: [`specs/2026-05-03-map-and-flight-overlay.md`](specs/2026-05-03-map-and-flight-overlay.md).
```

Insert a new line directly after it:

```md
- [x] **Map controls** — `MapApi.registerControl` adds a declarative property-bag contribution surface (with Svelte component escape hatch); first consumer is `flight-overlay`'s recenter button. First declarative property-bag contribution kind in gcscode. Spec: [`specs/2026-05-03-map-controls.md`](specs/2026-05-03-map-controls.md).
```

#### Sub-section B: VS Code alignment ledger

- [ ] **Step 3: Read the current `docs/vs-code-alignment.md`**

Run: `cd .worktrees/feat-map-controls/shell && cat docs/vs-code-alignment.md`
Expected: prints the existing ledger.

- [ ] **Step 4: Add 2 new rows to the Alignments table**

Locate the last row of the Alignments table (the `Service-style extension exposing contribution surface...` row). Append two new rows directly after it (still in the Alignments table):

```md
| Declarative property-bag for chrome contributions | ✓ (status bar, commands, menus, palette entries, editor toolbar buttons) | ✓ (first declarative kind in gcscode — map controls) | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md) |
| Command-id as control action | ✓ | ✓ (`commandId` on `MapControlContribution`) | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md) |
| Custom-icon-or-curated-name pattern | ✓ (`string \| Uri \| ThemeIcon`) | ✓ (`{ kind: 'lucide' } \| { kind: 'svg' }`); substance aligned, form differs (see Divergences) | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md) |
```

- [ ] **Step 5: Add 3 new rows to the Divergences table**

Locate the last row of the Divergences table (the `Cross-extension Svelte context for shared runtime instances` row). Append three new rows directly after it:

```md
| Icon shape (curated-vs-custom union) | structurally-distinguished union (`string \| Uri \| ThemeIcon`) | discriminated union with explicit `kind` field | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md) | — (deliberate ergonomic divergence: more self-documenting at call sites; scales additively; supports exhaustive switches) |
| Curated icon set | Codicons (in-house font) | Lucide names (`@lucide/svelte`); aligns with shadcn-svelte and the broader Svelte tooling ecosystem rather than VS Code's in-house font | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md) | First Mac user reporting an extension keybinding doesn't work / first non-Svelte UI consumer (operator-UX driver outside VS Code orbit) |
| Tooltip on map controls | optional in most VS Code APIs | required `string` on `MapControlContribution` | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md) | — (deliberate accessibility default — icon-only buttons must always have a label) |
```

- [ ] **Step 6: Update the Deferrals table — flip "Map UI controls rendered into a contribution surface" out**

Locate the existing row:

```md
| Map UI controls rendered into a contribution surface | (N/A) | ✗ — map is canvas-only; no overlay slots for extension-rendered controls | [spec 2026-05-03-map-and-flight-overlay](specs/2026-05-03-map-and-flight-overlay.md), [out-of-scope.md](out-of-scope.md) | First consumer needing a map control (zoom button, recenter button, layer panel) — likely operator UX iteration |
```

Delete this row entirely (it's now an Alignment, recorded above as "Declarative property-bag for chrome contributions").

- [ ] **Step 7: Add 4 new rows to the Deferrals table**

Append the following four new rows at the end of the Deferrals table:

```md
| Theme tokens / CSS-variable system for extension styling | ✓ (`--vscode-*` CSS variables, hundreds of named colors) | ✗ (deferred) | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md), [out-of-scope.md](out-of-scope.md) | Webview wing iteration (canonical theming consumer) OR parallel UI brainstorm landing on a documented design system |
| Numeric `priority` ordering for map controls | numeric priority | ✗ — registration order today | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md), [out-of-scope.md](out-of-scope.md) | Third-party wants to insert between two first-party controls (mirrors status-bar / layer priority rows) |
| Hover / active state customization on declarative controls | ✓ (CSS variables let extensions theme button states) | ✗ — host renders one button visual style | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md), [out-of-scope.md](out-of-scope.md) | A control needs a different state (e.g. destructive action wants red hover); likely surfaces with theme-tokens |
| SVG sanitization for extension-provided icons | ✓ (webviews are sandboxed; trusted-types apply) | ✗ — extension SVG inserted as-is via `{@html}` | [spec 2026-05-03-map-controls](specs/2026-05-03-map-controls.md), [out-of-scope.md](out-of-scope.md) | Rolls in with the webview / sandboxing iteration |
```

#### Sub-section C: out-of-scope

- [ ] **Step 8: Read the current `docs/out-of-scope.md`**

Run: `cd .worktrees/feat-map-controls/shell && cat docs/out-of-scope.md`
Expected: prints the existing list.

- [ ] **Step 9: REMOVE the `Map UI controls / overlay slots` row**

Locate this bullet under "Extension machinery":

```md
- **Map UI controls / overlay slots.** No surface for extensions to render controls (zoom buttons, recenter button, layer panel) on top of the map. The map is canvas-only. _Trigger to revisit:_ first consumer needing a map control, or operator UX iteration on map chrome.
```

Delete the entire bullet (this iteration ships it).

- [ ] **Step 10: ADD 4 new rows under "Extension machinery"**

Insert the following bullets at the end of the "Extension machinery" section (before the next H2 heading `## Tooling / process`):

```md
- **Theme tokens / CSS-variable system for extension styling.** No `--gcscode-*` CSS variables exposed; component-path map controls and (future) webview content cannot match host visuals from extension code. _Trigger to revisit:_ webview wing iteration (canonical theming consumer), or the parallel UI brainstorm landing on a documented design system that wants extension reach. When triggered, follow VS Code's pattern: CSS variables only, no component/utility classes. (See `docs/specs/2026-05-03-map-controls.md`.)
- **Numeric `priority` ordering for map controls.** No `priority` field on `MapControlContribution`; ordering within a corner follows registration order. Mirrors the existing status-bar and layer `priority` deferrals. _Trigger to revisit:_ third-party wants to insert between two first-party controls.
- **Hover / active state customization on declarative controls.** Host renders one button visual style; extensions cannot override colors, sizing, or drop-shadow on the declarative path. _Trigger to revisit:_ a control needs a different state (e.g. destructive action wants red hover) — likely surfaces alongside the theme-tokens iteration.
- **SVG sanitization for extension-provided icons.** Extension SVG (`{ kind: 'svg', svg }`) is inserted as-is via `{@html}`. Safe today because all extensions are first-party (per the existing third-party-sandboxing row above). _Trigger to revisit:_ rolls in with the webview / sandboxing iteration.
```

#### Sub-section D: verify + commit

- [ ] **Step 11: Run prettier-format on the docs**

Run: `cd .worktrees/feat-map-controls/shell && pnpm format 2>&1 | tail -5`
Expected: a couple of files possibly reformatted (especially the alignment-ledger Markdown tables).

- [ ] **Step 12: Run lint to confirm docs pass**

Run: `cd .worktrees/feat-map-controls/shell && pnpm lint 2>&1 | tail -10`
Expected: clean.

- [ ] **Step 13: Run workspace-wide check + test (defense — docs don't usually affect these but confirm)**

Run: `cd .worktrees/feat-map-controls/shell && pnpm check && pnpm test 2>&1 | tail -10`
Expected: all clean.

- [ ] **Step 14: Stage and verify branch before commit**

Run: `cd .worktrees/feat-map-controls/shell && git branch --show-current`
Expected: `feat/map-controls`.

Run: `cd .worktrees/feat-map-controls/shell && git add docs/roadmap.md docs/vs-code-alignment.md docs/out-of-scope.md && git status`
Expected: only those three files staged.

- [ ] **Step 15: Commit**

```bash
cd .worktrees/feat-map-controls/shell && git commit -m "$(cat <<'EOF'
docs: roadmap + alignment ledger + out-of-scope propagation for map controls iteration

- roadmap.md: add ticked Map controls line under Feature extensions
  → Coming, linking the spec.
- vs-code-alignment.md: add 3 alignment rows (declarative property-
  bag, command-id action, custom-icon-or-curated-name) and 3
  divergence rows (discriminated-union icon shape, lucide as
  curated set, tooltip required on controls). Remove the "Map UI
  controls rendered into a contribution surface" deferral row
  (now shipped as alignment). Add 4 new deferral rows: theme
  tokens, control priority ordering, hover-state customization,
  SVG sanitization.
- out-of-scope.md: remove "Map UI controls / overlay slots"
  (shipped). Add 4 new rows: theme tokens (trigger: webview wing
  or parallel UI brainstorm), control priority ordering, hover-
  state customization, SVG sanitization (trigger: webview wing).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: commit lands on `feat/map-controls`.

---

### Task 7: Final verification + merge to master

**Files:** none (verification + merge)

This task lives outside the worktree's package root. Commands run from the repository root or the user's main checkout.

- [ ] **Step 1: Verify the branch state in the worktree**

Run: `cd .worktrees/feat-map-controls/shell && git log --oneline master..HEAD`
Expected: 5 commits in this exact order:

```
<sha5> docs: roadmap + alignment ledger + out-of-scope propagation for map controls iteration
<sha4> docs: README updates for map controls iteration
<sha3> feat(flight-overlay): recenter command + map control — first MapApi.registerControl consumer
<sha2> feat(map): rendering pipeline for controls — host-store, lucide-icon, button, slot containers
<sha1> feat(map): MapApi.registerControl + control registry types
```

If extra Code-review-followup commits exist after subagent-driven-development reviews (per CLAUDE.md), that's expected — they live alongside the originating commits, not squashed.

- [ ] **Step 2: Final workspace verification on the branch**

Run: `cd .worktrees/feat-map-controls/shell && pnpm check && pnpm lint && pnpm test 2>&1 | tail -10`
Expected: all clean.

- [ ] **Step 3: Switch to master in the main checkout**

Run: `git checkout master && git status`
Expected: on master, working tree clean.

- [ ] **Step 4: Merge with `--no-ff` to preserve the feature boundary**

Run: `git merge --no-ff feat/map-controls -m "$(cat <<'EOF'
Merge branch 'feat/map-controls'

MapApi.registerControl — first declarative property-bag contribution
kind in gcscode. flight-overlay ships a recenter command + top-right
map control button as the first consumer.
EOF
)"`

Expected: merge commit lands on master. (Per CLAUDE.md, `--no-ff` is required for feature merges so the feature boundary survives in `git log`.)

- [ ] **Step 5: Verify final state**

Run: `git log --oneline -10 && git status`
Expected: master has the merge commit at HEAD; working tree clean.

- [ ] **Step 6: Tear down the worktree**

Run: `git worktree remove .worktrees/feat-map-controls && git branch -d feat/map-controls`
Expected: worktree removed; branch ref deleted (the commits are reachable via the merge commit on master).

If `git branch -d` complains about un-merged commits, double-check Step 4 actually merged. If yes, retry; if not, investigate.

---

## Self-review

**1. Spec coverage.** Cross-checked the spec's Goals + Non-goals + sections against the plan tasks:

| Spec section / requirement                                  | Implementing task             |
| ----------------------------------------------------------- | ----------------------------- |
| `MapApi.registerControl(registration): Disposable`          | Task 2 (types + registry)     |
| `MapControlContribution` shape                              | Task 2                        |
| `MapControlComponentRegistration` shape                     | Task 2                        |
| `ControlIcon` discriminated union                           | Task 2                        |
| `ControlPosition` four corners                              | Task 2                        |
| `MapControlContribution` id-uniqueness check                | Task 2 (test in step 7)       |
| `MapApiImpl._controls` SvelteMap + getter                   | Task 2                        |
| Module-level host slot (`host-store.ts`)                    | Task 3 sub-section B          |
| `lucide-icon.svelte` static-map wrapper                     | Task 3 sub-section C          |
| `map-control-button.svelte` host-rendered button            | Task 3 sub-section D          |
| `setHost(context.host)` wired in `index.ts.activate`        | Task 3 sub-section E          |
| Re-exports of new types from `index.ts`                     | Task 3 sub-section E          |
| `map-view.svelte` corner slot containers + render branches  | Task 3 sub-section F          |
| `pointer-events: none` on slot wrappers                     | Task 3 step 12                |
| Bottom corners use `column-reverse`                         | Task 3 step 12                |
| First-consumer recenter command                             | Task 4 sub-section A          |
| First-consumer recenter control                             | Task 4 sub-section A          |
| Fallback to `homeLocation` when SITL has no fix             | Task 4 step 2 + step 6 (test) |
| `extension-map` test — declarative add/remove               | Task 2 step 7 test 1          |
| `extension-map` test — component add/remove                 | Task 2 step 7 test 2          |
| `extension-map` test — idempotent dispose                   | Task 2 step 7 test 3          |
| `extension-map` test — duplicate id throws                  | Task 2 step 7 test 4          |
| `extension-map` test — dispose-then-re-register             | Task 2 step 7 test 5          |
| `flight-overlay` test — registers recenter command          | Task 4 step 6 test 1          |
| `flight-overlay` test — registers recenter control          | Task 4 step 6 test 2          |
| `flight-overlay` test — recenter writes SITL position       | Task 4 step 6 test 3          |
| `flight-overlay` test — recenter falls back to homeLocation | Task 4 step 6 test 4          |
| `extension-map/README.md` updates                           | Task 5 sub-section A          |
| `extension-flight-overlay/README.md` updates                | Task 5 sub-section B          |
| Roadmap propagation                                         | Task 6 sub-section A          |
| VS Code alignment ledger propagation                        | Task 6 sub-section B          |
| `out-of-scope.md` propagation                               | Task 6 sub-section C          |
| Browser smoke verification                                  | Tasks 3 step 16, 4 step 9     |
| Feature-branch merge with `--no-ff`                         | Task 7 step 4                 |

All spec sections accounted for.

**2. Placeholder scan.** No `TBD` / `TODO` / `implement later` strings appear in the plan. Every step contains the actual content.

**3. Type / name consistency.** Spot-checked symbols across tasks:

- `setHost` / `getHost` / `clearHost` (Task 3 sub-section B) — used consistently in `host-store.ts`, `index.ts` (Task 3 step 9), and `map-control-button.svelte` (Task 3 step 6).
- `MapControlContribution` — used in types (Task 2 step 2), button props (Task 3 step 6), tests (Task 4 step 6).
- `MapControlComponentRegistration` — used in types (Task 2 step 2), map-view render branch (Task 3 step 12).
- `ControlRegistration` (union) — used as `MapApi.registerControl` parameter type (Task 2 step 3) and `MapApiImpl._controls` value type (Task 2 step 4).
- `'commandId' in reg` narrowing — used in `map-view.svelte` (Task 3 step 12) consistent with the discriminator-by-property-presence; tests verify both shapes (Task 2 step 7).
- `gcscode.flight-overlay.recenter` — same id used for the command and the control across `index.ts` (Task 4 step 2) and tests (Task 4 step 6).
- `homeLocation` tuple `[149.16525, -35.36326]` — value asserted in test 4 (Task 4 step 6) matches the existing `flight-overlay-config.ts` constant.

No drift detected.

---

## Done when

- All 5 commits are on `master` via the `--no-ff` merge from `feat/map-controls`.
- `pnpm check && pnpm lint && pnpm test` is clean on master post-merge.
- The browser smoke (Task 4 step 9) passes manually — recenter button visible top-right, click recenters, palette entry works, disable/re-enable removes/restores the button.
- `docs/roadmap.md`, `docs/vs-code-alignment.md`, and `docs/out-of-scope.md` reflect the iteration's propagation as specified.
- The feature branch (`feat/map-controls`) and worktree (`.worktrees/feat-map-controls`) are torn down.
