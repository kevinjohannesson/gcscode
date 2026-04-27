# Phase B2a — Reactive plumbing

**Status:** Approved (2026-04-27)

## Context

Phase B was originally framed as three iterations: (B1) deactivate orchestration, (B2) plugin enable/disable + reactive plumbing, (B3) dev-time hot reload. B1 shipped (`docs/specs/2026-04-26-phase-b1-deactivate-orchestration.md`); the registry now exposes `deactivate(pluginId): void` with LIFO disposal and error resilience. B2 as written bundles two coupled concerns — making registry mutations propagate to the rendered UI, and adding per-plugin runtime `enabled` state. This iteration is the **B2a split**: reactive plumbing only. Per-plugin `enabled` state is split off into B2b, a separate iteration.

The current registry uses plain `Map` instances for the four contribution maps (`views`, `statusBarItems`, `commands`, `keybindings`). `app.svelte` consumes them through `$derived(registry.listViews())` and `$derived(registry.listStatusBarItems())`, but Svelte's reactivity has nothing to track on a plain `Map` — the `$derived` snapshots once at mount and does not recompute when the map mutates. The invariant comment at `registry.ts:23-29` documents this, and `docs/out-of-scope.md` lists "Reactive propagation of registry mutations to mounted UI" with B2 named as the trigger to revisit.

Today every plugin activation happens pre-mount in `main.ts:11`, so the snapshot is correct by construction. Once enable/disable (B2b) or HMR (B3) lands, post-mount mutations become real, and the rendered UI must follow. B2a lays that plumbing down so B2b is purely additive: enable/disable becomes a thin layer of `enabled` state plus a toggle that calls `registry.deactivate` / `registry.activate`, with no registry-internals changes.

This iteration is structurally a refactor of registry internals. The four `Map` instances become `SvelteMap` instances (from `svelte/reactivity`). `SvelteMap` implements the `Map<K,V>` interface, so every existing call site — the `register*` factories, the dispose-by-equality guards, the `list*` methods, `executeCommand`, `activate`, and `deactivate` — continues to work bit-for-bit. The only observable change is that `Array.from(svelteMap.values())` now reads through Svelte's reactive system, so `$derived(registry.list*())` re-tracks on `set` / `delete` and the rendered UI updates without remount.

`subscriptionsByPlugin` stays a plain `Map` — no UI consumer reads it; the registry uses it internally for deactivate orchestration.

The named on-deck consumer for downstream Phase B work is a future SITL listener plugin (a streaming-data feed plugin that holds a connection). SITL pulls on B2b (so the user can toggle the feed off) and on the deferred `Plugin.deactivate?()` hook (so the connection close can be async / non-disposable). B2a is foundational for both: enable/disable is what makes a registry mutation user-visible, and reactive plumbing is what closes the gap between mutation and the rendered UI.

## Decisions deliberately out of this iteration

Three adjacent concepts could plausibly land here. They do not. Each is called out so the rest of the spec can be read against the agreed scope:

- **Per-plugin `enabled` runtime state and a toggle API.** Phase B2b. Without enable/disable, nothing in production mutates the registry post-mount; reactive plumbing has no production consumer in this iteration. The reactive plumbing is justified on its own as a contained refactor that unblocks B2b (and B3, and any future post-mount mutation), and the new tests in `app.test.ts` exercise post-mount mutation directly so the plumbing is observably tested. Splitting B2a from B2b keeps each iteration small and focused per the project's tempo preference.

- **Hot module reload for plugins.** Phase B3. Independent of B2a; if order changes later, B2a unblocks B3 too because HMR is also a post-mount mutation pattern (re-import plugin module → replay activate → UI must update).

- **`Plugin.deactivate?()` hook (non-disposable / async cleanup).** Still deferred. Named on-deck consumer: SITL listener. Independent of reactivity.

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. B2a preserves the load-bearing patterns:

| VS Code feature                                                | B2a in GCScode                                                                        | Status                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI follows extension lifecycle without explicit remount        | ✓ — Svelte `$derived` consumers of `registry.list*()` recompute on registry mutations | Aligned in spirit. VS Code threads lifecycle through internal events (`onDidChange*`) consumed by the workbench; GCScode threads it through Svelte's reactivity primitive. Same observable behavior — UI tracks lifecycle — divergent implementation.                                                                                                                                    |
| Public plugin API is unchanged by reactivity-internal refactor | ✓ — `@gcscode/plugin-api` is untouched; plugins keep calling `register*` as before    | Aligned. Reactivity is a host-internal implementation concern. Plugin authors do not import `svelte/reactivity` and do not see the change.                                                                                                                                                                                                                                               |
| Reactive primitive choice                                      | ➤ Ours — `SvelteMap` from `svelte/reactivity`                                         | In spirit, not by byte. VS Code uses an internal event bus (`Emitter` / `Event`) because it predates reactive UI primitives and runs without a UI framework dictating the model. We use `SvelteMap` because the shell IS a Svelte 5 app and `SvelteMap` is the purpose-built primitive. Coupling to Svelte at the registry layer is acceptable — the registry lives in `@gcscode/shell`. |
| Public reactivity surface for plugins                          | ✗ Deferred                                                                            | No `host.onDidChange*` / `host.onDidActivate` events. Plugins cannot subscribe to other plugins' lifecycle. Trigger to revisit: a real consumer wants to react to another plugin being added or removed (e.g. a palette UI listing all commands).                                                                                                                                        |
| Per-plugin `enabled` state + toggle                            | ✗ Deferred (Phase B2b)                                                                | Separate spec. B2a is the prerequisite plumbing; B2b adds the state machine.                                                                                                                                                                                                                                                                                                             |
| Hot module reload                                              | ✗ Deferred (Phase B3)                                                                 | Separate spec.                                                                                                                                                                                                                                                                                                                                                                           |

## Goals

- The four contribution maps in `packages/shell/src/plugin-host/registry.ts` (`views`, `statusBarItems`, `commands`, `keybindings`) become `SvelteMap` instances.
- The invariant comment at `registry.ts:23-29` is rewritten to flip its polarity: registry mutations now propagate reactively; the constraint that previously bounded callers ("pre-mount activation and test-only deactivation are the supported callers today") no longer applies.
- All existing tests in `packages/shell/src/plugin-host/registry.test.ts` and `packages/shell/src/app.test.ts` continue to pass without modification — `SvelteMap` implements the `Map<K,V>` interface, so existing imperative reads (`registry.listViews()`) return identical results.
- Three new tests in `app.test.ts` prove post-mount reactivity: registering a view post-mount renders it, deactivating a plugin post-mount removes its view, registering a status bar item post-mount places it on the correct side. Tests flush effects before asserting (via `flushSync`, `await tick()`, or `screen.findBy*` — implementer's choice based on what fits `@testing-library/svelte` 5.3 idioms).
- `subscriptionsByPlugin` stays a plain `Map`. The registry's internal use of it does not need to be reactive; documenting this in the comment prevents drive-by symmetry.
- Doc propagation: remove the relevant bullet from `docs/out-of-scope.md`; split `docs/roadmap.md`'s B2 entry into B2a (checked, with this spec linked) and B2b (unchecked, trigger restated).

## Non-goals

- **Per-plugin `enabled` runtime state.** Phase B2b. No `enabled: boolean`, no `registry.enable(id)` / `registry.disable(id)` method, no `enabled` field anywhere.
- **A "Plugin Manager" UI in the shell.** Phase B2b at earliest, and only when a real consumer pulls on it.
- **Hot module reload.** Phase B3.
- **`Plugin.deactivate?()` hook.** Still deferred. Named on-deck consumer: SITL listener.
- **Public reactivity surface for plugins.** No `host.onDidChange*` / `host.onDidActivate` events. The reactivity is a host-internal implementation detail consumed by `app.svelte` via `$derived`. Plugins do not import `svelte/reactivity` and do not see `SvelteMap`.
- **Reactivity for `subscriptionsByPlugin`.** No UI consumer reads it; the registry's internal use does not need reactive tracking. Stays a plain `Map`. The decision is documented in the invariant comment.
- **Reactive `executeCommand` / command-fire telemetry.** No reactive surface for "a command just ran"; `executeCommand` keeps returning a `Promise<T>` with no side-channel.
- **Granular reactive APIs (`findById`, `getByAlignment`, etc.).** `list*` methods are already reactive once their backing maps are. No new query methods. Trigger to revisit: a consumer that needs fine-grained subscription to avoid recomputing the whole list — none today.
- **Changes to `@gcscode/plugin-api`.** The public plugin contract is unchanged. No new types, no new methods, no version bump rationale.
- **Changes to `@gcscode/plugin-example`.** The example plugin demonstrates the plugin-facing contract, which is unchanged.
- **Changes to `main.ts`, the keybinding dispatcher, or any ADR.** The keybinding dispatcher reads `registry.listKeybindings()` once at attach time (`main.ts:13`); making `keybindings` reactive doesn't break that read but also doesn't gain anything for the dispatcher today. It stays as-is. Reactive consumption by the dispatcher is a separate design question (would it re-attach on every keybinding change? probably not — but that's a B2b/B3 concern).

## API surface (`Registry` interface)

**Unchanged.** The `Registry` interface in `packages/shell/src/plugin-host/registry.ts` is identical to the post-B1 version. No new methods, no removed methods, no signature changes.

```ts
export interface Registry {
  activate(plugin: Plugin): void;
  deactivate(pluginId: string): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}
```

`@gcscode/plugin-api` is untouched. Plugins keep calling `host.register*` exactly as before; the `Disposable`s they receive behave identically.

## Registry changes (`packages/shell/src/plugin-host/registry.ts`)

One new import and four `new Map(...)` → `new SvelteMap(...)` substitutions. The rest of the file is unchanged.

```ts
import { SvelteMap } from 'svelte/reactivity';
// ... existing type imports unchanged

export function createRegistry(): Registry {
  const views = new SvelteMap<string, ViewContribution>();
  const statusBarItems = new SvelteMap<string, StatusBarItemContribution>();
  const commands = new SvelteMap<string, CommandContribution>();
  const keybindings = new SvelteMap<string, KeybindingContribution>();
  const subscriptionsByPlugin = new Map<string, readonly Disposable[]>();
  // ... rest of the function body unchanged
}
```

Every other line in the file — the per-host `register*` factories with their idempotent-by-identity dispose guards (`registry.ts:53, 70, 87, 104` in the post-B1 layout), `executeCommand`, `activate`, `deactivate`, the `list*` methods that call `Array.from(map.values())` — keeps working unchanged because `SvelteMap` implements the `Map<K,V>` interface. Type signatures remain `Map<string, ...>` semantically.

The invariant comment at the top of `createRegistry` (`registry.ts:23-29` post-B1) is rewritten to flip its polarity:

```ts
// Invariant: registry mutations propagate reactively to mounted consumers.
// The four contribution maps are SvelteMap instances (from svelte/reactivity),
// so $derived(registry.list*()) re-tracks on set/delete and the rendered UI
// updates without remount. subscriptionsByPlugin stays a plain Map because no
// UI consumer reads it — the registry uses it internally for deactivate
// orchestration only.
```

Why `SvelteMap` over alternatives:

- **`SvelteMap`** (chosen) is purpose-built. Implementing `Map<K,V>` means the public surface of `Registry` is unchanged, the dispose-by-equality guards continue to work, and the diff is four `new Map(...)` substitutions plus one import.
- A `$state<T[]>` array per kind would force a uniqueness check off the array (separate `Set`, or a scan), make the dispose-by-equality guard uglier, and grow the diff. Rejected.
- A `$state(0)` version counter bumped on every mutation would work but fights Svelte 5's reactivity model — easy to forget to bump, verbose if extended later. Rejected.

## Reactivity contract for consumers

`app.svelte` already does the right thing:

```svelte
const views = $derived(registry.listViews()); const statusBarItems =
$derived(registry.listStatusBarItems());
```

After B2a, no change needed at the call site. Each `$derived` runs `Array.from(svelteMap.values())`, which iterates the reactive map and registers a dependency. When the underlying `SvelteMap` mutates (a `set` or `delete` from a `register*` disposable, an `activate`, or a `deactivate`), Svelte invalidates the `$derived` and recomputes. The `{#each}` block then re-renders against the new array.

Effects flush asynchronously by default. Tests that mutate the registry post-mount and then assert against the DOM must wait for effects to drain (`flushSync()`, `await tick()`, or `screen.findBy*`).

## Plugin example

No changes. `@gcscode/plugin-example` is unaffected. Its tests continue to pass.

## Testing

**`packages/shell/src/plugin-host/registry.test.ts`** — no changes. Every existing test continues to pass because `SvelteMap` returns the same values for the same operations. Note this in PR review: a reviewer should not see any test diffs in this file.

**`packages/shell/src/app.test.ts`** — add three new tests after the existing block:

- **`reflects post-mount view registration in the rendered UI`.** Create a registry. Render `App` with no activated plugins; assert the empty-state element is in the document. Activate a plugin whose `activate` registers a view with `MockContent`. Flush effects. Assert `screen.getByText('mock-content')` is in the document and the empty-state element is no longer present.
- **`reflects post-mount view deactivation in the rendered UI`.** Create a registry. Activate a plugin that registers a view. Render `App`; assert the view text is in the document. Call `registry.deactivate(plugin.id)`. Flush effects. Assert the view text is gone and the empty-state element is back.
- **`reflects post-mount status bar item registration on the matching side`.** Create a registry. Render `App`. Activate a plugin that registers a status bar item with `alignment: 'left'`. Flush effects. Assert the item is rendered inside the `statusbar-left` testid container (use `within(screen.getByTestId('statusbar-left')).getByText(...)`), and not in `statusbar-right`. Mirrors the existing static placement test.

Three is the right cut: views and status bar items are the two `$derived` consumers in `app.svelte`. `commands` and `keybindings` get the same `SvelteMap` treatment uniformly, but they have no rendered-output consumer in `app.svelte`; verifying their reactivity end-to-end without a consumer would be testing `SvelteMap` itself, which is not our job. The registry-level tests in `registry.test.ts` continue to assert their imperative behavior.

The implementer chooses the effect-flush primitive based on what works cleanly with `@testing-library/svelte` 5.3:

- `await tick()` from `'svelte'` — async microtask drain.
- `flushSync()` from `'svelte'` — synchronous effect flush.
- `await screen.findByText(...)` / `findByTestId` — testing-library's polling pattern.

The choice is implementation, not specification. The spec requires only that mutations are flushed before assertion. A passing test suite is the proof.

No changes to `keybinding-dispatcher.test.ts` or `plugin-example/src/index.test.ts`. The keybinding dispatcher reads `registry.listKeybindings()` imperatively at attach time; that read returns the same array regardless of `SvelteMap` vs `Map`. No new behavior to test there.

## Files modified / added

| Path                                         | Change                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/shell/src/plugin-host/registry.ts` | Add `import { SvelteMap } from 'svelte/reactivity'`. Replace four `new Map(...)` with `new SvelteMap(...)` for `views`, `statusBarItems`, `commands`, `keybindings`. Rewrite the invariant comment at the top of `createRegistry` to flip polarity (text in spec). |
| `packages/shell/src/app.test.ts`             | Add three new tests proving post-mount reactivity (view register, view deactivate, status bar item register) — see Testing section.                                                                                                                                |
| `docs/out-of-scope.md`                       | Remove the "Reactive propagation of registry mutations to mounted UI" bullet. Detail in propagation section below.                                                                                                                                                 |
| `docs/roadmap.md`                            | Split B2 into B2a (checked, this spec linked) and B2b (unchecked, trigger restated). Detail in propagation section below.                                                                                                                                          |

No changes to:

- `@gcscode/plugin-api` — the public plugin contract.
- `@gcscode/plugin-example` — the worked-example plugin.
- `packages/shell/src/main.ts` — bootstrap.
- `packages/shell/src/keybinding-dispatcher.ts` — the keyboard dispatcher.
- `packages/shell/src/plugin-host/registry.test.ts` — registry-level tests; existing suite stays green by construction.
- `packages/shell/src/app.svelte` — already uses `$derived`; no consumer-side change needed.
- `packages/plugin-api/README.md` or `packages/plugin-example/README.md` — plugin-author docs.
- Any ADR. ADR-0003's Phase B framing remains accurate (B2 splits into B2a + B2b is a tempo decision, not an architectural one). To be reflected in the ADR-0003 retrospective when this iteration merges, mirroring the A1/A2/A3/B1 retrospective pattern.

## `docs/out-of-scope.md` propagation

Cross-cutting non-goals from this spec — concepts the architecture is deliberately deferring, not just per-iteration scope cuts — must be reconciled with the canonical deferral list when B2a ships:

- **Remove** the existing bullet "Reactive propagation of registry mutations to mounted UI." Its trigger condition ("Phase B2 (plugin enable/disable) or any iteration where a registry mutation must produce a visible UI change without remount") is satisfied — the iteration that produces the visible change is this one. Reactive plumbing is now in place.
- **Keep** the existing bullets for `Plugin.deactivate?()` hook (still deferred; named consumer SITL), HMR for plugins (Phase B3), and `registry.deactivateAll()` / bulk teardown (no consumer).
- **No new bullet to add.** The new non-goals introduced by this spec — no public reactivity surface for plugins (`onDidChange*`), no granular reactive query APIs, no reactive `subscriptionsByPlugin` — are per-iteration scope cuts internal to the host registry. They do not represent cross-cutting architectural deferrals; they are the natural absence of features that have no consumer. Per CLAUDE.md ("does this non-goal apply only to this iteration, or is it a deliberate 'we're deferring this concept' decision affecting the whole architecture?"), they stay in this spec only.

## `docs/roadmap.md` propagation

The current roadmap entry under Phase B reads:

```markdown
- [ ] **B2: Plugin enable/disable + reactive plumbing** — adds runtime `enabled` state per plugin and the reactive plumbing so mounted UI reflects state changes. Trigger: a "disable plugin" UI or any visible state-change need.
```

Replace it with two lines reflecting the split:

```markdown
- [x] **B2a: Reactive plumbing** — registry mutations propagate to mounted UI via `SvelteMap`. Spec: [`specs/2026-04-27-phase-b2a-reactive-plumbing.md`](specs/2026-04-27-phase-b2a-reactive-plumbing.md)
- [ ] **B2b: Plugin enable/disable** — runtime `enabled` state per plugin + a toggle that drives activate/deactivate. Trigger: a "disable plugin" UI or visible per-plugin state change need.
```

The B3 entry stays unchanged. The `Plugin.deactivate?()` hook entry stays unchanged. The "Feature plugins" section stays unchanged.

## Verification

- `pnpm check` clean across packages.
- `pnpm test` — every existing test passes; the three new tests in `app.test.ts` pass.
- `pnpm lint` clean.
- `pnpm dev` — open the app; the example plugin's view, status bar items, and keybinding render and behave identically. (B2a has no user-visible surface; the dev-server check is a regression guard against accidental coupling.)

## Follow-ups (out of scope for B2a)

- **Phase B2b — plugin enable/disable.** Adds runtime `enabled: boolean` per plugin, programmatic `registry.enable(id)` / `registry.disable(id)` (or equivalent), and the activation semantics that toggle drives. Builds directly on B2a's reactive plumbing — by the time enable/disable lands, the rendered UI already follows registry mutations. Trigger: a real consumer (UI surface, keybinding, command) that wants to toggle a plugin off without rebuilding.
- **Phase B3 — dev-time hot module reload.** Vite HMR boundary that re-imports a plugin module on edit and replays activate (after deactivate). Builds on B1 + B2a. With B2a in place, HMR is observable end-to-end without requiring B2b first.
- **`Plugin.deactivate?()` hook.** Adds the optional plugin-side hook for non-disposable / async teardown. Trigger: first plugin that holds a connection, worker, or other non-disposable resource (named on-deck consumer: SITL listener).
- **Public reactivity surface for plugins (`host.onDidChange*`).** Adds an event-bus-shaped surface for plugins to subscribe to lifecycle changes of other plugins or contributions. Trigger: a real consumer (e.g. a palette UI listing all commands and wanting to reflect adds/removes).
- **Granular reactive query APIs.** `list*` is reactive at the whole-list grain. Trigger to revisit: a consumer that recomputes too much because the whole list invalidates on any mutation.

## Cross-cutting notes

**`registerN` duplication still remains.** A3's cross-cutting note flagged the four `register*` blocks in `registry.ts` as a candidate for a `makeRegistrar<T>` factory. B1 did not touch them; B2a does not touch them. The duplication question is unchanged and remains a candidate for a separate refactor independent of any phase iteration.

**B2a is the smallest possible piece of B2.** It ships ~5 lines of registry change (one import + four substitutions) plus a one-paragraph comment rewrite plus three tests. Zero changes to `@gcscode/plugin-api`. Zero changes to any plugin module. No new types, no new methods. By the time B2b begins, the only work left for enable/disable is the state machine itself — the reactive plumbing is already done and tested.

**Shell-internal Svelte coupling is an explicit trade-off.** The registry now imports from `svelte/reactivity`. This couples a host-internal module to Svelte. The trade-off was considered and accepted: the registry lives in `@gcscode/shell`, which IS the Svelte app. The architectural boundary that matters is `@gcscode/plugin-api` (the cross-package contract), and that boundary remains framework-neutral by construction — plugins import only from `@gcscode/plugin-api`, which has no Svelte imports. If gcscode ever ships a non-Svelte shell or a second host implementation, the reactive primitive choice would be revisited then; YAGNI today.
