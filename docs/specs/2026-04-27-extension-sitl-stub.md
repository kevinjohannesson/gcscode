# SITL stub extension

**Status:** Approved (2026-04-27)

## Context

The first feature extension. A new package `@gcscode/extension-sitl` contributing a small UI panel and a `getLocation` command, both backed by a hardcoded location constant. This is the stub half of the future "SITL listener" — a placeholder that lets us prove the extension architecture against a real consumer without committing to the connection-management design that the real telemetry feed will require.

The user has a separate ArduPilot SITL + Python telemetry service running and intends to wire it up later. That later iteration ships together with `Extension.deactivate?()` (for connection close) and probably a Phase C streaming/connection primitive. This iteration is deliberately scoped to the UI surface only.

The hardcoded location is the ArduPilot SITL default home (`-35.363261, 149.165230` — Canberra Model Aircraft Club). Cosmetic — any coords would work — but using ArduPilot's default makes the eventual swap-in less surprising.

## Decisions deliberately out of this iteration

- **Real telemetry connection.** No WebSocket, no fetch, no polling. The lat/lng is a static module-level constant. Trigger to revisit: the next iteration ("real SITL listener") that lands together with `Extension.deactivate?()` and a Phase C streaming primitive.

- **Reactive / ticking lat/lng.** No `$state`, no setInterval, no simulated movement. The static value renders once and never changes. Trigger to revisit: the real connection lands and there is actual data to surface.

- **`Extension.deactivate?()` hook.** Stub has no async cleanup. Disposables (view, command, keybinding) tear down synchronously via the existing B1 path. Trigger to revisit: the real connection iteration where the WebSocket / TCP socket needs explicit close.

- **Map view contribution kind.** A separate roadmap entry. The stub uses a plain `<dl>`-style coordinate display inside the existing view contribution kind.

- **Status bar item.** Skipped. Adds a contribution without adding insight at this size. Trigger to revisit: ticking values would give the status bar a reason to exist.

- **Command palette UI.** Out-of-scope per `out-of-scope.md` ("Additional contribution kinds beyond views, status bar items, commands, and keybindings"). The stub's command is invocable via the bound keybinding (`Alt+Shift+L`) and programmatically via `registry.executeCommand(...)`. A palette UI is a separate iteration with its own trigger.

## VS Code alignment

The pattern is established by `@gcscode/extension-example`: an extension is a npm package exporting a named `const` of type `Extension` that calls `host.register*` from inside `activate(context)` and pushes the disposables to `context.subscriptions`. SITL stub follows that pattern bit-for-bit. No new alignment decisions worth a table.

## Goals

- A new package `@gcscode/extension-sitl` mirroring `@gcscode/extension-example`'s layout: `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`, plus `src/` with `index.ts`, `index.test.ts`, `location.ts`, `sitl-view.svelte`.
- The exported `sitlExtension: Extension` registers a view, a command, and a keybinding via a single `activate(context)` call that pushes three disposables.
- A shared `SITL_LOCATION = { lat, lng }` constant in `src/location.ts` consumed by both the command's `run()` and the view component. One source of truth.
- Three tests in `index.test.ts` mirroring `extension-example`'s test pattern: identity metadata, contribution registration (asserting `registerView` / `registerCommand` / `registerKeybinding` called with the right arguments and disposables pushed in order), and command behavior (`run()` returns `SITL_LOCATION` and logs it).
- A new `ManifestEntry` for `gcscode.sitl` added to `bundledExtensions` in `packages/shell/src/extension-host/extension-manifest.ts`. The shell's `package.json` grows a `@gcscode/extension-sitl: workspace:*` dependency.
- The shell's existing tests pass without modification. Two manifest tests (`bundledExtensions` non-empty, ids match) become slightly stronger by virtue of having two entries to iterate.
- Doc propagation: a new checked entry under "Feature extensions → Coming" in `docs/roadmap.md`. The existing "SITL listener" line stays unchecked — it represents the future connection iteration.

## Non-goals

- **Anything that updates the lat/lng at runtime.** Static is the whole point of "stub."
- **Per-coordinate formatting / locale.** Plain decimal degrees with six-place precision. No degrees/minutes/seconds, no localized number formatting.
- **Accessibility hardening of the view.** A `<section>` with a `<dl>` is enough. No ARIA work; the example extension didn't either.
- **Status bar item, second view, or any other contribution kind beyond view + command + keybinding.**
- **Tests for the rendered view DOM.** The view is a 10-line presentational component; visual smoke testing is covered when the dev-server check renders the app. Unit-testing the view's HTML is gold-plating.
- **Wiring the command into anything that triggers it on its own** (e.g. an interval, a startup activation). The command is fired by the keybinding or by an external `executeCommand` call.
- **Changes to `@gcscode/extension-api`.** Cross-package contract is unchanged.
- **Changes to the registry, the manager, the persistence layer, or `main.ts`.** The shell consumes the extension transitively through the manifest; no shell code changes beyond the manifest entry and the package.json dependency.

## Public API

The extension package exports a single named `const`:

```ts
export const sitlExtension: Extension = {
  id: 'gcscode.sitl',
  displayName: 'SITL Stub',
  version: '0.0.0',
  activate(context) { ... },
};
```

Inside `activate`, three `register*` calls land their disposables in `context.subscriptions`:

- `registerView({ id: 'gcscode.sitl.location', component: SitlView })`
- `registerCommand({ id: 'gcscode.sitl.getLocation', run: () => SITL_LOCATION })`
- `registerKeybinding({ key: 'Alt+Shift+L', command: 'gcscode.sitl.getLocation' })`

The keybinding's handler logs the location to the console (mirroring `gcscode.example.greet`'s behavior — keybinding fires the command via the dispatcher, command's `run` returns the value and logs it as a side effect).

The internal shared constant:

```ts
// src/location.ts
export const SITL_LOCATION = {
  lat: -35.363261,
  lng: 149.16523,
} as const;
```

`as const` because the values are immutable and we want `lat` / `lng` typed as their literal numeric types where useful. (Practically, `number` would work fine; `as const` is the YAGNI-defensive default for module-level coordinate literals.)

## Implementation sketches

### `src/index.ts`

```ts
import type { Extension } from '@gcscode/extension-api';

import { SITL_LOCATION } from './location';
import SitlView from './sitl-view.svelte';

export const sitlExtension: Extension = {
  id: 'gcscode.sitl',
  displayName: 'SITL Stub',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'gcscode.sitl.location',
        component: SitlView,
      }),
      context.host.registerCommand({
        id: 'gcscode.sitl.getLocation',
        run: () => {
          console.log('SITL location:', SITL_LOCATION);
          return SITL_LOCATION;
        },
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+L',
        command: 'gcscode.sitl.getLocation',
      }),
    );
  },
};
```

### `src/sitl-view.svelte`

```svelte
<script lang="ts">
  import { SITL_LOCATION } from './location';
</script>

<section>
  <h2>SITL Stub</h2>
  <dl>
    <dt>Latitude</dt>
    <dd>{SITL_LOCATION.lat.toFixed(6)}°</dd>
    <dt>Longitude</dt>
    <dd>{SITL_LOCATION.lng.toFixed(6)}°</dd>
  </dl>
  <p>Hardcoded ArduPilot SITL default home. Real telemetry pending.</p>
</section>
```

No styles in this iteration — the existing app stylesheet will render the section reasonably; bespoke styling can follow when there are values worth designing around.

### `src/index.test.ts`

Three tests mirroring `extension-example/src/index.test.ts`'s pattern (mock `host.register*` via `vi.fn()`, assert call args and disposable order, assert the command's runtime behavior):

1. **`declares stable identity metadata`** — assert `id === 'gcscode.sitl'`, `displayName === 'SITL Stub'`, `typeof version === 'string'`.
2. **`registers a view, a command, and a keybinding, pushing all three disposables`** — set up three `vi.fn()` register stubs, call `sitlExtension.activate(context)`, assert each register call was made with the exact arguments listed in the Public API section, assert `subscriptions` equals the three disposables in registration order.
3. **`getLocation command returns the SITL_LOCATION constant and logs it`** — extract the command contribution from `registerCommand.mock.calls[0][0]`, call `run()`, assert it returns the same value as `SITL_LOCATION`, assert `console.log` was called with `'SITL location:'` plus the constant.

## Bootstrap / manifest changes

Two edits in the shell:

1. `packages/shell/src/extension-host/extension-manifest.ts` — import the new extension and add a `ManifestEntry`:

```ts
import { sitlExtension } from '@gcscode/extension-sitl';

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
  { id: sitlExtension.id, extension: sitlExtension },
];
```

2. `packages/shell/package.json` — add `@gcscode/extension-sitl: workspace:*` to `dependencies` (alongside the existing `@gcscode/extension-example`).

`main.ts` is unchanged — it iterates the manifest, which now has two entries.

## Files modified / added

| Path                                                      | Change                                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-sitl/package.json`                    | **New.** Mirrors `extension-example/package.json` (private, workspace-internal, `@gcscode/extension-api` dep, `svelte` peer dep). |
| `packages/extension-sitl/tsconfig.json`                   | **New.** Extends `tsconfig.base.json`; includes `src/**/*.ts` and `src/**/*.svelte`.                                              |
| `packages/extension-sitl/vitest.config.ts`                | **New.** Mirrors `extension-example/vitest.config.ts` exactly.                                                                    |
| `packages/extension-sitl/README.md`                       | **New.** Short, mirrors `extension-example/README.md` style.                                                                      |
| `packages/extension-sitl/src/index.ts`                    | **New.** Exports `sitlExtension`. ~30 lines per the Implementation sketch above.                                                  |
| `packages/extension-sitl/src/index.test.ts`               | **New.** Three tests per the test sketch above.                                                                                   |
| `packages/extension-sitl/src/location.ts`                 | **New.** Single export: `SITL_LOCATION`.                                                                                          |
| `packages/extension-sitl/src/sitl-view.svelte`            | **New.** ~12 lines per the view sketch above.                                                                                     |
| `packages/shell/src/extension-host/extension-manifest.ts` | Add `sitlExtension` import + manifest entry.                                                                                      |
| `packages/shell/package.json`                             | Add `@gcscode/extension-sitl: workspace:*` to dependencies.                                                                       |
| `docs/roadmap.md`                                         | Add a checked entry for the SITL stub under "Feature extensions → Coming". Detail in propagation section below.                   |

No changes to:

- `@gcscode/extension-api` — cross-package contract.
- `@gcscode/extension-example` — the existing worked example.
- `packages/shell/src/extension-host/registry.ts`, `registry.test.ts`, `extension-manager.ts`, `extension-manager.test.ts`, `extension-persistence.ts`, `extension-persistence.test.ts`, `app.svelte`, `app.test.ts`, `keybinding-dispatcher.ts`, `keybinding-dispatcher.test.ts`, `main.ts`.
- `docs/out-of-scope.md` — none of its bullets are affected. The stub does not pull on declarative manifests, activation events, capabilities, dynamic loading, or any other deferred concept.
- Any ADR.

## `docs/roadmap.md` propagation

The existing "SITL listener" entry stays unchanged — it represents the future iteration that ships the connection + `Extension.deactivate?()` hook. Add a new checked entry alongside it under "Feature extensions → Coming":

```md
- [x] **SITL stub** — placeholder view + `gcscode.sitl.getLocation` command, hardcoded coordinates, no connection. Spec: [`specs/2026-04-27-extension-sitl-stub.md`](specs/2026-04-27-extension-sitl-stub.md)
```

Place this line immediately above the existing "SITL listener" line so a reader sees the stub-then-listener progression. The "Map", "Video feed", "Considering → Road scanning", and Maintenance sections stay unchanged.

## Verification

- `pnpm install` succeeds (the new package's dependency graph resolves; pnpm's workspace catalog stays intact).
- `pnpm check` clean across all 4 packages (3 existing + the new SITL).
- `pnpm test` — extension-sitl reports 3 passing; existing suites unchanged. New total: 105 + 3 = 108.
- `pnpm lint` clean.
- `pnpm --filter @gcscode/shell build` succeeds. Bundle size grows by a few hundred bytes for the new view component and module.
- `pnpm dev` smoke test: app boots; `Example Extension` and `SITL Stub` views both render in the content area; `Alt+Shift+G` (example greet) and `Alt+Shift+L` (sitl getLocation) both log to console; SITL view shows the hardcoded coordinates; status bar still shows the example extension's `Example` item; no errors or warnings in the browser console.

## Follow-ups (out of scope for this iteration)

- **Real SITL listener iteration.** The connection-holding extension. Couples with `Extension.deactivate?()` (for connection close) and probably a Phase C streaming primitive (for the data feed). The stub's view component is the natural target for the live data once the connection lands.
- **Tickable lat/lng store.** Once there is real data, replace the static constant with a Svelte store (or `$state`-backed module) that the view subscribes to. Out of scope until there is data.
- **Map view.** A separate Feature extension once there is a reason to render coords spatially.
- **Status bar item.** Add when the lat/lng changes — a small status display gives the live data a footer presence.
- **Command palette UI.** A separate iteration adding a palette contribution kind. Trigger: a real consumer needs a palette (could be SITL's `getLocation` or anything else).

## Cross-cutting notes

**Pattern inheritance from the example extension.** The stub's package layout, test fixture pattern (`vi.fn()` mocks for `host.register*`), and bootstrap integration (manifest entry + package.json dep) all mirror `@gcscode/extension-example` exactly. New extensions should default to this template until a real reason to diverge surfaces.

**`SITL_LOCATION` lives in its own module.** Cleaner than two-source duplication (constants hardcoded twice in command + view) and avoids the circular import that would arise if the constant lived in `index.ts` and was imported from the view component. A single-export module is more than the value warrants in isolation, but the alternative is worse.

**Coordinate precision.** `toFixed(6)` in the view rounds to six decimal places (≈11 cm at the equator), which is more than enough for any SITL/UAV use case. The constant uses `-35.363261` and `149.16523` (matching ArduPilot's `Tools/autotest/locations.txt` default home); the view's `toFixed` smooths the trailing-zero asymmetry between the two values into a uniform display.

**Stub vs listener naming.** The roadmap distinguishes "SITL stub" (this iteration, UI placeholder) from "SITL listener" (future iteration, real telemetry). The package name `@gcscode/extension-sitl` is shared — when the listener lands, the same package grows the connection logic, the view consumes live data, and the stub's hardcoded constant is replaced. No package rename, no slug change.
