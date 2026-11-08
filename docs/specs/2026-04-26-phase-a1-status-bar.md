# Phase A1 — Status bar item contribution

_Note: The term "plugin" was renamed to "extension" in [ADR-0004](../decisions/ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._

**Status:** Approved (2026-04-26)

## Context

ADR-0003 reshaped the plugin API to support multiple contribution kinds via per-kind `register*` methods on `PluginHost`, with kind-specific Maps in the registry. Phase A is the first feature work that exercises this generalization. Phase A1 — the smallest visible iteration — adds a status bar item kind: a UI surface at the bottom of the shell where any plugin can contribute a Svelte component aligned to the left or right side, with optional priority.

A1 is structurally a clone of the existing view contribution: same shape (id + component), same disposable semantics, same registry-Map pattern. The new mechanics are alignment grouping and priority ordering at render time.

## Goals

- A second contribution kind (`registerStatusBarItem`) lands without changing any existing plugin or test in a breaking way (additive only).
- The shell renders a footer status bar with two sections (left, right), populated by registered items.
- Plugin example registers both a view and a status bar item, demonstrating multi-surface contributions from a single plugin.
- All existing tests continue to pass; new tests cover the new surface end-to-end.

## Non-goals

- **Commands**, `executeCommand`, or any way to fire actions from a status bar click — deferred to A2.
- **Status bar item fields beyond `id`, `component`, `alignment`** — no `text`, `tooltip`, `command`, `backgroundColor`, etc. The component renders whatever the plugin needs.
- **Numeric `priority` field.** Ordering within a side is insertion order (= plugin activation order in `main.ts`, plus the order of `register*` calls within `activate`). Deterministic and code-reviewable for trusted plugins; not abuse-able the way a `priority: 9999999` field would be. When untrusted plugins arrive, the right answer is likely zones / user-controlled ordering, not a numeric race; defer the design until there is a concrete need.
- **Visual polish.** Minimal flex layout so left/right line up on opposite ends; decorative styling (borders, colors, hover states) is out of scope for A1.
- **Multiple status bars.** There is exactly one status bar at the shell footer.

## API surface (`@gcscode/plugin-api`)

New type and method:

```ts
export interface StatusBarItemContribution {
  id: string;
  component: Component;
  alignment: 'left' | 'right';
}

export interface PluginHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
}
```

Naming chosen for consistency with `ViewContribution`. `alignment` is required — authors must be intentional about left vs right. The component renders all visual content; the host imposes no layout fields beyond alignment. **Ordering within a side is insertion order**, deterministic from `main.ts` activation order plus the order of `register*` calls inside each plugin's `activate`. See non-goals for why no `priority` field.

## Registry changes (`packages/shell/src/plugin-host/registry.ts`)

Parallel store and method, mirroring the view machinery:

```ts
const statusBarItems = new Map<string, StatusBarItemContribution>();

// inside createHost(plugin):
registerStatusBarItem(item) {
  if (statusBarItems.has(item.id)) {
    throw new Error(
      `Status bar item id "${item.id}" is already registered (attempted by plugin "${plugin.id}").`,
    );
  }
  statusBarItems.set(item.id, item);
  return {
    dispose() {
      if (statusBarItems.get(item.id) === item) {
        statusBarItems.delete(item.id);
      }
    },
  };
}
```

Public `Registry` interface gains `listStatusBarItems(): readonly StatusBarItemContribution[]`, returning items in insertion order. **Sorting and alignment grouping happen in the consumer (`app.svelte`), not in the registry** — the registry stays a flat, opinion-free store; future consumers (e.g. a debug page that lists items in registration order) get that view for free.

**Cross-kind id namespaces are separate.** A view id and a status bar item id can coincide; collision detection is per-kind. This is implicit in using separate Maps per kind.

## Shell layout (`packages/shell/src/app.svelte`)

A new `<footer class="shell__statusbar">` after the content section. Always rendered, even when empty, so the surface is always present.

Derived groups in the script block:

```ts
const statusBarItems = $derived(registry.listStatusBarItems());
const leftStatus = $derived(statusBarItems.filter((i) => i.alignment === 'left'));
const rightStatus = $derived(statusBarItems.filter((i) => i.alignment === 'right'));
```

Markup:

```svelte
<footer class="shell__statusbar" data-testid="statusbar">
  <div class="shell__statusbar-side shell__statusbar-side--left">
    {#each leftStatus as { id, component: Component } (id)}
      <Component />
    {/each}
  </div>
  <div class="shell__statusbar-side shell__statusbar-side--right">
    {#each rightStatus as { id, component: Component } (id)}
      <Component />
    {/each}
  </div>
</footer>
```

`Array.prototype.filter` preserves order, and `registry.listStatusBarItems()` returns items in insertion order, so left/right groups render in registration order. Minimal Tailwind utility classes are added inline on the footer for flex layout so left and right line up on opposite ends; decoration is deferred.

## Plugin example (`packages/plugin-example`)

`examplePlugin` grows a second contribution. New file `src/example-status.svelte` (a single `<span>Example</span>`).

```ts
import type { Plugin } from '@gcscode/plugin-api';
import ExampleView from './example-view.svelte';
import ExampleStatus from './example-status.svelte';

export const examplePlugin: Plugin = {
  id: 'gcscode.example',
  displayName: 'Example Plugin',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'gcscode.example.main',
        component: ExampleView,
      }),
      context.host.registerStatusBarItem({
        id: 'gcscode.example.status',
        component: ExampleStatus,
        alignment: 'right',
      }),
    );
  },
};
```

Demonstrates: a single plugin contributing to two surfaces; spreading multiple disposables into `context.subscriptions` in one push.

## Testing

**`packages/shell/src/plugin-host/registry.test.ts`** — parallel suite for status bar items:

- `listStatusBarItems()` starts empty.
- `registerStatusBarItem` records the item.
- The returned `Disposable` removes it.
- Duplicate id throws (error message includes the plugin id).
- `dispose()` is idempotent.
- A view id and a status bar item id can coincide (separate namespaces).

**`packages/shell/src/app.test.ts`** — extend with status bar coverage:

- Footer with `data-testid="statusbar"` is in the DOM even when no items are registered.
- Left and right sections populate from `alignment`.
- Multiple items in the same side render in registration order.

**`packages/plugin-example/src/index.test.ts`** — extend the contract test:

- `registerView` is called with the existing shape.
- `registerStatusBarItem` is called with `{ id: 'gcscode.example.status', component: ExampleStatus, alignment: 'right' }`.
- Both disposables land in `subscriptions`.

## Files modified / added

| Path                                                                 | Change                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/plugin-api/src/index.ts`                                   | Add `StatusBarItemContribution`; add `registerStatusBarItem` on `PluginHost`.                |
| `packages/shell/src/plugin-host/registry.ts`                         | Add `statusBarItems` Map, `registerStatusBarItem` on host, `listStatusBarItems` on Registry. |
| `packages/shell/src/app.svelte`                                      | Add `<footer class="shell__statusbar">`, derived left/right groups.                          |
| `packages/plugin-example/src/example-status.svelte`                  | New — minimal status bar component.                                                          |
| `packages/plugin-example/src/index.ts`                               | Register both view and status bar item.                                                      |
| `packages/shell/src/plugin-host/registry.test.ts`                    | Tests for the new surface.                                                                   |
| `packages/shell/src/app.test.ts`                                     | Tests for footer rendering, alignment, priority.                                             |
| `packages/plugin-example/src/index.test.ts`                          | Update contract test for the second registration call.                                       |
| `packages/plugin-api/README.md`, `packages/plugin-example/README.md` | Update snippets to show the second registration.                                             |

## Verification

- `pnpm check` clean across all packages.
- `pnpm test` — every test passes; new tests cover the status bar surface.
- `pnpm lint` clean.
- `pnpm dev` — open the app; the example status item appears on the right side of the footer; the existing view still renders above. Removing `examplePlugin` from `main.ts` shows the empty content state and an empty (but present) status bar.

## Follow-ups (out of scope for A1)

- **A2 — commands.** `registerCommand` + `executeCommand`. No UI trigger required for the smallest scope; tests assert register-then-execute round-trip.
- **A3 — wire status bar item to fire a command.** Requires both A1 and A2; either via a new `command?: string` field on `StatusBarItemContribution`, or by letting the component call `host.executeCommand` itself.
- **Item ordering knobs.** Revisit if/when activation-order ordering becomes insufficient — likely once untrusted plugins arrive. Probable shape: zones (`'system' | 'plugin'`) plus user-controlled reordering, not a numeric priority field.
- **Visual styling.** Decorative footer (borders, theme colors, fonts) once there is a real GCS look-and-feel.
