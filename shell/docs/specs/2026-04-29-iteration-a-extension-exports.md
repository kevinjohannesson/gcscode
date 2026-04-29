# Iteration A — Cross-extension exports + `vehicle-status` consumer

**Status:** Approved (2026-04-29)

## Context

First iteration consuming the architectural commit in [ADR-0005](../decisions/ADR-0005-extension-boundaries.md). Adds cross-extension exports to the API surface and lands a tiny first consumer to prove the pattern in the privileged realm.

Concretely: `Extension.activate()` learns to return an exports value; `ExtensionHost` learns `getExtension<T>(id)` to look one up; the registry stores exports in a `SvelteMap` so reads in consumer templates reactively re-render on producer enable/disable; the boundary rule in `CLAUDE.md` and `eslint.config.ts` softens to allow type-only imports from sibling extension packages.

The consumer is a new `@gcscode/extension-vehicle-status` package that registers a single status bar item showing a one-line summary of SITL telemetry: `SITL: GUIDED • -35.36°/149.17° • 47%`. Read-only this iteration; no interactions, no `onClick` command, no animation. Just the smallest consumer that exercises the seam end-to-end.

This iteration unlocks the Map extension (when it lands) and any future telemetry-consuming widget. It does not unlock untrusted third-party extensions — that's the webview wing (iteration B, future spec).

## Decisions deliberately out of this iteration

- **`extensionDependencies` declaration / topological activation order.** Today extensions activate in `bundledExtensions` array order. The consumer extension's `activate()` runs after the producer's only because we order the array that way. A consumer's `activate()` that calls `host.getExtension('gcscode.sitl')` during activation will see undefined if SITL hasn't activated yet — consumers handle defensively. Trigger to revisit per ADR-0005's known limitations: first ordering bug, third-party producer/consumer pair, or manifest-driven enable persistence.

- **Async `activate()` overload.** `activate()` can return an exports value but stays synchronous in signature (return type `unknown`, not `unknown | Promise<unknown>`). Trigger to revisit: a producer that needs async work before it can publish a complete API. No consumer today.

- **Phase C host-namespacing.** Adding `getExtension` brings the flat surface to six methods. Still under ADR-0003's 5–7 trigger; defer.

- **Status bar item interactions.** No `onClick`, no tooltip-on-hover, no badge / icon, no animation on update. The status bar contribution today already takes a Svelte component; visual richness is up to the component. This iteration's component is purely informational.

- **Multi-vehicle.** Single SITL feed; single producer; single consumer.

- **`vehicle-status` extension's own `deactivate?()` hook.** Component disposal handles UI cleanup; the only module-level state to clear is the captured `host` reference, which a tiny `deactivate()` sets back to `null`.

- **Producer mutation guards on the exports.** `SitlExports.telemetry` is typed `Readonly<TelemetryState>`. Convention only; the runtime allows writes (Svelte's `$state` is mutable from any holder). Trigger to revisit: an accidental mutation bug.

- **Cross-extension exports versioning.** Workspace:\* dependency; producer and consumer ship together. Per ADR-0005's known limitations.

## VS Code alignment

| Concern                                               | VS Code                                                    | Ours                                                             | Notes                                                                                                                                                                                     |
| ----------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activate()` returns API for other extensions         | ✓ — `activate(): API \| Promise<API>`                      | ✓ — `activate(): unknown` (sync this iteration)                  | Aligned in spirit. Async return deferred (no consumer today).                                                                                                                             |
| Lookup by id with generic typing                      | ✓ — `vscode.extensions.getExtension<T>(id)?.exports`       | ✓ — `host.getExtension<T>(id)?.exports`                          | Aligned.                                                                                                                                                                                  |
| Type sharing via separate types package               | ✓ — e.g. `@types/vscode` published independently           | ➤ Type-only imports from sibling workspace packages              | Deliberate divergence. Workspace:\* + no build step makes a separate types package unnecessary; `import type` provides identical erasure. ESLint enforces type-only for sibling packages. |
| Reactive flow of producer state to consumers          | EventEmitter + explicit subscribe + listener               | ➤ `$state` proxy passed via exports; consumers read in templates | Deliberate divergence per ADR-0005. Svelte coupling intentional in the privileged realm.                                                                                                  |
| Producer disabled while consumer mounted              | `getExtension(id)` returns undefined; consumers null-check | ✓ Same                                                           | Aligned.                                                                                                                                                                                  |
| Cross-extension activation ordering                   | `extensionDependencies` in manifest                        | ✗ Deferred                                                       | Trigger: first ordering bug or third-party producer/consumer. Per ADR-0005.                                                                                                               |
| Wrapper shape (`{ id; exports }` vs. plain `exports`) | Returns rich `Extension` object                            | ✓ Returns `{ id; exports }` — minimal but extensible             | Aligned. Future fields (`isActive`, `displayName`) are non-breaking additions.                                                                                                            |

## Goals

- Add `Extension.activate()` return type `unknown` (was `void`). Backwards-compatible — extensions that return nothing remain valid because `void ⊆ unknown`.

- Add `ExtensionHost.getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined`. Returns wrapper iff the extension is currently activated.

- Modify `registry.activate(extension)` to capture the value returned by `extension.activate(context)` and store it in a new `SvelteMap<string, unknown>` keyed by extension id. The key's presence — not the value's truthiness — indicates "activated"; the map stores `undefined` when `activate()` returned nothing, so callers see `{ id, exports: undefined }` for an active extension that didn't publish exports.

- Modify `registry.deactivate(extensionId)` to delete from the new exports map alongside subscriptions and hooks.

- Modify `createHost(identity)` to expose `getExtension(id)` that reads from the exports map. Returns `{ id, exports }` if the extension is activated; `undefined` otherwise. Reads inside `$derived` / template contexts reactively track enable/disable transitions because the underlying map is a `SvelteMap`.

- Add `SitlExports` type to `@gcscode/extension-sitl` and have `sitlExtension.activate()` return `{ telemetry: telemetryState }`. The runtime returned value is the existing `$state` proxy; the type is `Readonly<TelemetryState>` to communicate consumer-side intent.

- New package `@gcscode/extension-vehicle-status`:
  - `package.json` declares `@gcscode/extension-api` runtime dep, `@gcscode/extension-sitl` workspace:\* dep (used type-only), `svelte` peer dep.
  - `src/index.ts` defines `vehicleStatusExtension: Extension` (`id: 'gcscode.vehicle-status'`, `displayName: 'Vehicle Status'`, `version: '0.0.0'`), captures `context.host` to a module-level variable in `activate`, registers a left-aligned status bar item, clears the captured host in `deactivate`.
  - `src/index.ts` re-exports a small helper `getSitlExports(): SitlExports | undefined` that the component imports.
  - `src/vehicle-status-item.svelte` reads via `$derived(getSitlExports())` and renders the formatted summary in a `<span>`.
  - `src/index.test.ts` — three tests: identity metadata; status bar item registration & disposal; helper returns SITL exports when active and undefined otherwise.
  - `tsconfig.json`, `vitest.config.ts` — copy from `@gcscode/extension-sitl`.
  - `README.md` — mirror `@gcscode/extension-sitl/README.md` shape (purpose + contributions + dependencies).

- Update `packages/shell/src/extension-host/extension-manifest.ts` to add `vehicleStatusExtension` after `sitlExtension`. Order matters: the consumer reads producer exports during template rendering, so SITL must activate first to have its exports present in the registry by the time the vehicle-status component first renders.

- ESLint refinement in `eslint.config.ts`:
  - Replace the built-in `no-restricted-imports` rule with `@typescript-eslint/no-restricted-imports` (already available via the imported `typescript-eslint` plugin set; same pattern shape but supports `allowTypeImports`).
  - Carry forward both existing patterns (`@gcscode/shell*`, parent-relative escapes).
  - Add a third pattern blocking `@gcscode/extension-*` (the `@gcscode/extension-api` ignore on this rule's `files` selector keeps extension-api itself unaffected) with `allowTypeImports: true`.

- `CLAUDE.md` boundary-rule paragraph updated per ADR-0005.

## Non-goals

- **No async `activate()`.** Sync return only this iteration.
- **No `extensionDependencies` manifest field.** Order via `bundledExtensions` array.
- **No runtime guards** around producer-export mutation or consumer-side type drift. Discipline + TypeScript + lint.
- **No new view contribution kind, no new keybinding kind, no new command.** Vehicle-status registers exactly one status bar item.
- **No tests for the Svelte component itself.** Same posture as the existing SITL view — presentational; reactive consumption exercised by the dev-server smoke test.
- **No `Drone SITL/run_sitl.sh` change.** Cross-repo bridge is unchanged.
- **No persistence change.** Vehicle-status is enabled by default in `bundledExtensions`; no localStorage migration needed.
- **No changes to `@gcscode/extension-example`.** It returns nothing from `activate()` today and continues to.
- **No changes to the `Extension.deactivate?()` semantics, the manager layer, the persistence layer, the keybinding dispatcher, or `app.svelte`.**

## Public API

### `@gcscode/extension-api/src/index.ts` — delta

```ts
export interface Extension extends ExtensionIdentity {
  activate(context: ExtensionContext): unknown; // was: void
  deactivate?(): void | Promise<void>;
}

export interface ExtensionHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  registerKeybinding(keybinding: KeybindingContribution): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
  // NEW:
  getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined;
}
```

JSDoc on `getExtension` notes:

- The generic on `T` is unsafe sugar — the host stores `unknown` and casts on return. Producers and consumers commit to a shared type contract via `import type`.
- Returns `undefined` if the extension is not registered or not activated.
- Reads inside reactive contexts (`$derived`, template) auto-track via the underlying `SvelteMap`; consumers re-render when the producer enables / disables.

### `@gcscode/extension-sitl/src/index.ts` — delta

```ts
import type { TelemetryState } from './telemetry-store.svelte';

export interface SitlExports {
  telemetry: Readonly<TelemetryState>;
}

export const sitlExtension: Extension = {
  id: 'gcscode.sitl',
  displayName: 'SITL Telemetry',
  version: '0.0.0',
  activate(context): SitlExports {
    client = createMavlinkClient({
      url: WS_URL,
      onMessage: applyMessage,
      onConnectionStateChange: setConnectionState,
    });

    context.subscriptions.push(
      context.host.registerView({ ... }),
      context.host.registerCommand({ ... }),
      context.host.registerKeybinding({ ... }),
    );

    return { telemetry: telemetryState };
  },
  async deactivate() { ... },
};
```

Existing `activate` body unchanged apart from the explicit `return { telemetry: telemetryState }`. The `SitlExports` interface is the type contract consumers depend on; `TelemetryState` itself stays internal (consumers see only `Readonly<TelemetryState>`).

### `@gcscode/extension-vehicle-status/src/index.ts` (new)

```ts
import type { Extension, ExtensionHost } from '@gcscode/extension-api';
import type { SitlExports } from '@gcscode/extension-sitl';

import VehicleStatusItem from './vehicle-status-item.svelte';

let host: ExtensionHost | null = null;

export function getSitlExports(): SitlExports | undefined {
  return host?.getExtension<SitlExports>('gcscode.sitl')?.exports;
}

export const vehicleStatusExtension: Extension = {
  id: 'gcscode.vehicle-status',
  displayName: 'Vehicle Status',
  version: '0.0.0',
  activate(context) {
    host = context.host;
    context.subscriptions.push(
      context.host.registerStatusBarItem({
        id: 'gcscode.vehicle-status.summary',
        component: VehicleStatusItem,
        alignment: 'left',
      }),
    );
  },
  deactivate() {
    host = null;
  },
};
```

### `@gcscode/extension-vehicle-status/src/vehicle-status-item.svelte` (new)

```svelte
<script lang="ts">
  import type { SitlExports } from '@gcscode/extension-sitl';

  import { getSitlExports } from './index';

  function fmtCoord(n: number | null): string {
    return n === null ? '—' : `${n.toFixed(2)}°`;
  }

  function formatSummary(exports: SitlExports | undefined): string {
    if (exports === undefined) return 'SITL: —';
    const t = exports.telemetry;
    if (t.connection === 'connecting') return 'SITL: connecting…';
    if (t.connection === 'disconnected') return 'SITL: disconnected';

    const parts: string[] = [t.mode ?? '—'];
    if (t.lat !== null && t.lng !== null) {
      parts.push(`${fmtCoord(t.lat)}/${fmtCoord(t.lng)}`);
    }
    if (t.batteryRemaining !== null) {
      parts.push(`${t.batteryRemaining}%`);
    }
    return `SITL: ${parts.join(' • ')}`;
  }

  const sitl = $derived(getSitlExports());
  const summary = $derived(formatSummary(sitl));
</script>

<span>{summary}</span>
```

**Read-tracking story.**

- `getSitlExports()` calls `host.getExtension(...)` which reads from the registry's exports `SvelteMap`. The `$derived(getSitlExports())` therefore re-runs when the map mutates (SITL enable / disable / re-enable).
- The template's `{summary}` evaluates `formatSummary(sitl)`; the body reads `t.connection`, `t.mode`, `t.lat`, `t.lng`, `t.batteryRemaining` on the `$state` proxy. Each field read is tracked. When any field mutates (next telemetry message), `summary` re-derives, the template re-renders, the status bar updates.
- When SITL deactivates, the registry's exports map drops the key; `host.getExtension(...)` returns undefined; `sitl` becomes undefined; the SITL: — branch fires.
- When SITL re-activates, the map gets a new entry; `sitl` resolves to the fresh exports; the live summary returns.

### `packages/shell/src/extension-host/registry.ts` — delta

Add a fifth top-level Map:

```ts
const exportsByExtension = new SvelteMap<string, unknown>();
```

Modify `activate(extension)` (sketch — full body unchanged elsewhere):

```ts
activate(extension) {
  const identity: ExtensionIdentity = { ... };
  const context: ExtensionContext = { host: createHost(identity), subscriptions: [], extension: identity };
  const exportsValue = extension.activate(context);  // CAPTURE
  subscriptionsByExtension.set(identity.id, context.subscriptions);
  if (extension.deactivate) {
    deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
  }
  exportsByExtension.set(identity.id, exportsValue);  // STORE (always — even if undefined)
},
```

Modify `deactivate(extensionId)` — add at the end, alongside the existing two `.delete` calls:

```ts
exportsByExtension.delete(extensionId);
```

Modify `createHost(identity)` to expose `getExtension`:

```ts
return {
  // existing register* + executeCommand methods unchanged
  getExtension<T = unknown>(id: string): { id: string; exports: T } | undefined {
    if (!exportsByExtension.has(id)) return undefined;
    return { id, exports: exportsByExtension.get(id) as T };
  },
};
```

The presence check on the SvelteMap (`.has(id)`) is the reactive read that gives consumers the enable/disable signal. The `.get(id)` returns the (possibly `undefined`) exports value the producer emitted from `activate()`.

### `packages/shell/src/extension-host/extension-manifest.ts` — delta

```ts
import type { Extension } from '@gcscode/extension-api';

import { exampleExtension } from '@gcscode/extension-example';
import { sitlExtension } from '@gcscode/extension-sitl';
import { vehicleStatusExtension } from '@gcscode/extension-vehicle-status'; // NEW

export interface ManifestEntry {
  id: string;
  extension: Extension;
  initialEnabled?: boolean;
}

export const bundledExtensions: readonly ManifestEntry[] = [
  { id: exampleExtension.id, extension: exampleExtension },
  { id: sitlExtension.id, extension: sitlExtension },
  { id: vehicleStatusExtension.id, extension: vehicleStatusExtension }, // NEW — must come after sitl
];
```

Order is load-bearing. `vehicleStatusExtension` last; if reordered before `sitlExtension`, the vehicle-status component on first render sees `host.getExtension('gcscode.sitl')` returning undefined and shows `SITL: —` until SITL activates. The component handles that case correctly, but the dev-server smoke test verifies the configured order.

### `eslint.config.ts` — delta

```ts
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  {
    files: ['**/*.svelte.ts'],
    languageOptions: { parser: ts.parser },
  },
  {
    files: ['packages/extension-*/**/*.{ts,svelte}'],
    ignores: ['packages/extension-api/**'],
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@gcscode/shell', '@gcscode/shell/*'],
              message:
                'Extensions must only import from @gcscode/extension-api. Shell internals are not part of the extension API.',
            },
            {
              group: ['../../*', '../../../*'],
              message: 'Extensions must not use relative imports that escape the package root.',
            },
            {
              group: ['@gcscode/extension-*', '!@gcscode/extension-api'],
              allowTypeImports: true,
              message:
                'Extensions may only type-import from sibling extension packages (use `import type`). Runtime imports must go through @gcscode/extension-api. (ADR-0005)',
            },
          ],
        },
      ],
    },
  },
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.svelte-kit/**'] },
];
```

The `!@gcscode/extension-api` exclusion in the third pattern is a defense in depth — the `files` selector already ignores `extension-api`, but the negation makes the intent explicit at the rule site.

### `CLAUDE.md` — delta

Replace the **Boundary rule — load bearing** section's first paragraph:

Before:

> **Extension packages import ONLY from `@gcscode/extension-api`.** No imports from `@gcscode/shell`. No relative imports that escape the package root. ESLint enforces this; package boundaries in pnpm workspaces reinforce it. Don't work around either.

After:

> **Extension packages import RUNTIME only from `@gcscode/extension-api`.** No runtime imports from `@gcscode/shell` or sibling extension packages. No relative imports that escape the package root.
>
> **Type-only imports from sibling extension packages are allowed**, exclusively for consuming cross-extension `exports` (see [ADR-0005](docs/decisions/ADR-0005-extension-boundaries.md)). The runtime boundary stays preserved — `import type` is erased at compile time. Anything that emits JS at runtime against a sibling extension package is a violation.
>
> ESLint enforces both rules (`@typescript-eslint/no-restricted-imports` with `allowTypeImports: true` for the sibling pattern). Don't work around either.

The corollary paragraph that follows ("Corollary: if an extension needs a capability the host doesn't yet expose...") is unchanged; `getExtension` is now an explicit precedent for adding to `ExtensionHost` rather than reaching around the API.

## Tests

### `packages/shell/src/extension-host/registry.test.ts`

New tests in this iteration (additive — existing tests stay):

1. `activate captures the extension's activate() return value into the exports map`. Activate an extension whose `activate()` returns `{ foo: 1 }`; assert `host.getExtension(id)?.exports.foo === 1`.
2. `activate stores undefined when activate() returns nothing`. Activate an extension whose `activate()` is `void`; assert `host.getExtension(id)?.exports === undefined` AND `host.getExtension(id) !== undefined` (the wrapper exists, the value is undefined).
3. `deactivate clears the exports`. Activate then deactivate; assert `host.getExtension(id) === undefined`.
4. `getExtension returns undefined for an unregistered id`. Don't activate anything; assert `host.getExtension('gcscode.never') === undefined`.
5. `getExtension reads are reactive` — wrap a `$derived(host.getExtension('gcscode.sitl'))` in `$effect.root`, observe the value, activate the extension, assert the derived re-runs and now resolves the wrapper. Then deactivate and assert it re-runs again to undefined. (Uses Svelte's `$effect.root` testing pattern; mirrors B2a's pattern for verifying SvelteMap reactivity.)
6. `getExtension generic returns the cast type` — type-level assertion in a `// @ts-expect-error`-guarded block, or a runtime assertion that `host.getExtension<{ foo: number }>(id)?.exports.foo` doesn't error.

Existing test fixtures may need a tiny tweak — any existing `extension.activate` shaped `(context) => void` continues to compile because `void ⊆ unknown`.

### `packages/extension-sitl/src/index.test.ts`

New test:

7. `sitlExtension.activate returns the live telemetry export`. Stub WebSocket, activate, assert the return value is `{ telemetry: <the live store> }`. Mutate the store via `applyMessage` and verify the consumer-side reference sees the new value (proves singleton identity).

The existing 6 tests stay unchanged.

### `packages/extension-vehicle-status/src/index.test.ts` (new)

Three tests:

1. `declares stable identity metadata` — id `'gcscode.vehicle-status'`, displayName `'Vehicle Status'`, version is a string.
2. `registers a status bar item, pushing one disposable; deactivate clears the captured host`. Use a mock host with `registerStatusBarItem` + the new `getExtension`. Assert the registration call shape and that `subscriptions.length === 1`. Call `deactivate()`; assert `getSitlExports()` returns undefined afterward.
3. `getSitlExports returns the SITL exports when SITL is active and undefined when SITL is not`. Two cases: mock host where `getExtension('gcscode.sitl')` returns `{ id, exports: { telemetry: <fake> } }`; assert `getSitlExports()` returns the same exports. Then mock host where `getExtension('gcscode.sitl')` returns undefined; assert `getSitlExports()` is undefined.

No tests for the `vehicle-status-item.svelte` component itself — same posture as `sitl-view.svelte` (presentational; covered by smoke test).

## Files modified / added

| Path                                                               | Change                                                                                                                                                                              |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/extension-api/src/index.ts`                              | `Extension.activate()` return type `unknown`; `ExtensionHost.getExtension<T>` added with JSDoc.                                                                                     |
| `packages/shell/src/extension-host/registry.ts`                    | New `SvelteMap<string, unknown>` for exports; `activate` captures the return value; `deactivate` clears it; `createHost` exposes `getExtension`.                                    |
| `packages/shell/src/extension-host/registry.test.ts`               | 6 new tests covering capture, default-undefined, deactivate cleanup, unregistered id, reactivity, generic typing.                                                                   |
| `packages/shell/src/extension-host/extension-manifest.ts`          | Add `vehicleStatusExtension` after `sitlExtension`.                                                                                                                                 |
| `packages/extension-sitl/src/index.ts`                             | Add `SitlExports` interface; `activate` returns `{ telemetry: telemetryState }`.                                                                                                    |
| `packages/extension-sitl/src/index.test.ts`                        | 1 new test for the new return value.                                                                                                                                                |
| `packages/extension-sitl/package.json`                             | No change — stays workspace:\* on `@gcscode/extension-api`.                                                                                                                         |
| `packages/extension-vehicle-status/package.json`                   | **New.** Workspace:\* deps on `@gcscode/extension-api` and `@gcscode/extension-sitl`; svelte peer dep; same scripts shape as `extension-sitl`.                                      |
| `packages/extension-vehicle-status/tsconfig.json`                  | **New.** Extends root tsconfig.base.                                                                                                                                                |
| `packages/extension-vehicle-status/vitest.config.ts`               | **New.** Same as `extension-sitl/vitest.config.ts`.                                                                                                                                 |
| `packages/extension-vehicle-status/src/index.ts`                   | **New.** `vehicleStatusExtension` + `getSitlExports` helper.                                                                                                                        |
| `packages/extension-vehicle-status/src/vehicle-status-item.svelte` | **New.** Status bar component with `formatSummary` derivation.                                                                                                                      |
| `packages/extension-vehicle-status/src/index.test.ts`              | **New.** 3 tests.                                                                                                                                                                   |
| `packages/extension-vehicle-status/README.md`                      | **New.** Mirrors `extension-sitl/README.md`'s shape (purpose + contributions + dependencies).                                                                                       |
| `eslint.config.ts`                                                 | Replace `no-restricted-imports` with `@typescript-eslint/no-restricted-imports`; carry forward existing patterns; add the sibling-extension `allowTypeImports` pattern.             |
| `CLAUDE.md`                                                        | Boundary-rule paragraph rewrite per ADR-0005.                                                                                                                                       |
| `docs/decisions/ADR-0005-extension-boundaries.md`                  | **New.** Lands separately, before this iteration.                                                                                                                                   |
| `docs/roadmap.md`                                                  | Add `Vehicle status` to Feature extensions → Coming, checked, link to this spec. Add `Webview wing + Preact battery widget` unchecked.                                              |
| `docs/out-of-scope.md`                                             | Add bullet about extension activation ordering & `extensionDependencies` deferral. Note: the existing manifest deferral bullet does NOT change — manifest itself is still deferred. |

No changes to:

- `@gcscode/extension-example` (continues to return nothing from `activate()`, which now satisfies `unknown`).
- `pnpm-workspace.yaml` (uses `packages/*` glob).
- The manager (`extension-manager.ts`), persistence (`extension-persistence.ts`), keybinding dispatcher, app.svelte, main.ts.
- `Drone SITL/run_sitl.sh`.
- Any prior ADR (ADR-0001–0004 stay as written).

## Verification

- `pnpm check` clean across all 5 packages (4 existing + new vehicle-status).
- `pnpm test` — all existing tests pass; new tests in `registry.test.ts` (6 added), `extension-sitl/index.test.ts` (1 added), `extension-vehicle-status/index.test.ts` (3 new) pass. Workspace test count grows from 139 to ~149 (10 new tests).
- `pnpm lint` clean. Verify the new ESLint rule rejects a deliberate violation: temporarily add `import { sitlExtension } from '@gcscode/extension-sitl'` (value import) inside `extension-vehicle-status/src/index.ts` and confirm `pnpm lint` errors with the configured message; revert.
- `pnpm --filter @gcscode/shell build` succeeds. Bundle delta: adds the vehicle-status component (~1 KB) and the registry's exports map (negligible).
- `pnpm dev` smoke test:
  1. With `mavlink2rest` + SITL running, open `http://localhost:5173/`. Footer shows `SITL: connecting…` briefly, then `SITL: STABILIZE` (or whatever boot mode) once HEARTBEAT arrives, then `SITL: STABILIZE • -35.36°/149.16° • 100%` once GPS + battery arrive.
  2. In MAVProxy: `mode GUIDED`. Footer summary updates to `SITL: GUIDED • ...` within ~1 sec — confirms cross-extension reactive flow end-to-end.
  3. Without `mavlink2rest`: footer shows `SITL: disconnected` immediately. The SITL view itself shows its existing disconnected state.
  4. SITL-disabled branch (`SITL: —`) is exercised by unit tests (no toggle UI yet).

## docs/out-of-scope.md propagation

Add to the **Extension machinery** section (after the existing `Activation events` bullet, before the `Capability / permission declarations` bullet):

> - **Extension activation ordering / dependency declaration.** No `extensionDependencies` manifest field, no topological sort, no "I require X to be active before me" declaration. Today extensions activate in `bundledExtensions` array order; consumers of `host.getExtension(id)?.exports` handle undefined defensively. _Trigger to revisit:_ first ordering bug, OR third-party producer/consumer pair, OR manifest-driven enable persistence. (ADR-0005)

The existing manifest deferral bullet is unchanged. The "additional contribution kinds" bullet is unchanged (`getExtension` is a method on the existing host, not a new contribution kind).

## docs/roadmap.md propagation

Under **Feature extensions → Coming (committed — will ship)**, add (in order):

```md
- [x] **Vehicle status** — first consumer of cross-extension exports. `@gcscode/extension-vehicle-status` registers a footer status bar item that reads SITL telemetry via `host.getExtension('gcscode.sitl').exports`. Spec: [`specs/2026-04-29-iteration-a-extension-exports.md`](specs/2026-04-29-iteration-a-extension-exports.md)
- [ ] **Webview wing + Preact battery widget** — escape hatch validation per ADR-0005. Sandboxed iframes, postMessage protocol, JSON-RPC, structured-clone snapshots, vanilla + Preact adapters. Real consumer: `@gcscode/extension-battery-widget` in Preact, sandboxed, consuming SITL telemetry.
```

The existing **Map** and **Video feed** lines stay unchanged (both are Coming, both downstream of this iteration's exports pattern).

Under **Phase plan → Phase A**, the `A4+: more contribution kinds` line is unchanged — `getExtension` is a host method, not a contribution kind.

## Follow-ups (out of scope for this iteration)

- **Iteration B — webview wing.** Per ADR-0005's Follow-ups.
- **`extensionDependencies` declaration.** Per Known Limitations and out-of-scope propagation.
- **Map extension.** Will consume `host.getExtension('gcscode.sitl')?.exports.telemetry` for vehicle position; the same telemetry powers tooltip data (mode, battery).
- **A second producer extension.** Today only SITL exports anything. The pattern is exercised by one producer + one consumer; a second producer (e.g. video feed) would be useful triangulation.
- **Status bar interactions.** Click → command (e.g. open SITL view, jump to settings) once a settings UI exists.
- **Phase C namespacing.** `host.commands.register*`, `host.extensions.getExtension(...)`. Trigger remains "flat surface ≥ 7 methods" per ADR-0003.

## Cross-cutting notes

**Why `SvelteMap` for exports.** The contribution maps are already SvelteMap (B2a) for the same reason: reads inside `$derived` / template contexts must reactively track the registry's state for enable/disable to flow to the UI without explicit subscriptions. Reusing the pattern keeps the registry's shape consistent — every map is either a SvelteMap (UI consumer reads) or a plain Map (registry-internal only). The exports map joins the four contribution maps as the fifth UI-reactive map.

**Why `getExtension` on `ExtensionHost`, not on `ExtensionContext`.** `host` is the per-extension permission gate; future iterations will wrap it to enforce capability scopes (per ADR-0003's plans for untrusted extensions). `getExtension` belongs there because access to a producer's exports is itself a capability that may eventually be permission-gated. `ExtensionContext` is for activation-time facts (subscriptions sink, identity); cross-extension lookup is a runtime capability.

**Why `getExtension(id)` returns a wrapper, not just exports.** Future-proofing per ADR-0005. Adding fields like `isActive` or `displayName` to the returned object is a non-breaking change; making the shape `{ id; exports }` first lets us extend later. VS Code's `getExtension(id)` returns a richer wrapper for the same reason. The minor verbosity cost at the call site (`?.exports.telemetry` instead of `?.telemetry`) is worth the extensibility.

**Why a separate package for the consumer, not a second extension inside `@gcscode/extension-sitl`.** The package boundary is the architectural test. A package boundary forces the type-only import discipline, exercises the ESLint rule, and proves the seam works the way it would for a future third-party (modulo trust). Consolidating the consumer inside SITL would skip exactly the test the iteration exists to run.

**The `getSitlExports()` helper lives in the consumer, not the producer.** It's a consumer-side convenience over `host.getExtension<SitlExports>('gcscode.sitl')?.exports`. SITL doesn't need to know about its consumers, and a producer-shipped helper would force a runtime dependency on the producer (which violates the boundary). The helper is duplicated per consumer extension; that's fine — it's three lines.

**Async-up implications for `activate` are deferred.** `activate()` returning `unknown` is sync; the registry's `activate` method stays sync. If a future producer needs `Promise<SomeExports>`, that's a separate iteration that propagates async-up to `registry.activate` and `manager.register`. Out of scope here per the corresponding deferral in the deactivate-hook spec.

**Type drift between producer and consumer.** Workspace:\* + same repo + TS check on both sides catches drift at build time. When the marketplace / cross-repo question lands, the producer's `*Exports` type becomes a versioned contract — not yet an issue.

**The exports value is captured even when `undefined`.** The map stores `(id) → undefined` for an active extension whose `activate()` returned nothing, vs. having no key for an extension that's not active. The presence check (`exportsByExtension.has(id)`) is the "is active" signal; the value (which may be `undefined`) is the captured exports. This makes the contract symmetric: every active extension is in the map; every non-active one is not.
