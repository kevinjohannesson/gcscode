# Phase C2 — Command palette + `window.showQuickPick`

**Status:** Approved (2026-05-02)

## Context

Phase A2 landed `host.commands.registerCommand` + `executeCommand`. Phase A3 landed `host.keybindings.registerKeybinding`, the first user-fireable trigger. But the only way to invoke a registered command today is to know its id and bind a key to it. There is no discoverability surface — `gcscode.sitl.getLocation` is registered, has no keybinding, and currently cannot be invoked from the UI at all.

Phase C2 adds the missing discoverability surface: a **command palette** (`Ctrl+Shift+P`) that lists all registered commands with a `title` and lets the user fuzzy-search and pick one. It ships in two coupled layers:

1. **`host.window.showQuickPick<T>(items, options): Promise<T | undefined>`** — a new generic API on the `window` namespace that any extension can call to present a filterable picker.
2. **Built-in command palette** — a shell-internal "extension" (`workbench`) that registers `workbench.action.showCommands` + `Ctrl+Shift+P` and uses `showQuickPick` internally to present commands. The palette is the first consumer of `showQuickPick`; it eats own dog food across `commands`, `keybindings`, and `window` namespaces in one place.

A safety hook lands alongside: **modal-pause for the keybinding dispatcher**. While the palette is open, the dispatcher early-returns. Without this, re-pressing `Ctrl+Shift+P` while the palette is open would re-fire the trigger; pressing `Esc` to close the palette would also fire any extension-bound `Esc` command. The `out-of-scope.md:27` trigger for focus-aware suppression — "first text input or modal where the dispatcher's keydown interception fires a command unintentionally" — is met by the palette itself.

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. C2 preserves the load-bearing patterns:

| VS Code feature                                                                                  | C2 in GCScode                                                                                        | Status                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands.registerCommand` carries `id`+handler; metadata in `package.json#contributes.commands` | `CommandContribution` gains optional `title?` + `category?` fields, bundled into the imperative call | In spirit. B4 added an extension-level manifest (`bundledExtensions`: `{ id, extension, initialEnabled? }`) but no `contributes`-style per-contribution manifest — that remains deferred per ADR-0003. So per-command metadata lives on the imperative contribution rather than on a static manifest entry.                                                                                               |
| Command palette = a built-in command + keybinding using public APIs                              | `workbench.action.showCommands` registered by built-in `workbench` extension                         | Aligned.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Built-in command id `workbench.action.showCommands`                                              | Same id                                                                                              | Aligned (vocabulary).                                                                                                                                                                                                                                                                                                                                                                                     |
| `Category: Title` display format in palette                                                      | `label = category ? "${category}: ${title}" : title`, composed at render time                        | Aligned.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `window.showQuickPick<T>(items, options): Thenable<T \| undefined>`                              | `Promise<T \| undefined>`, generic over `T extends QuickPickItem`                                    | Aligned (subset). Several VS Code item/option fields deferred (see Out-of-scope).                                                                                                                                                                                                                                                                                                                         |
| `items: T[] \| Thenable<T[]>` (async items)                                                      | `items: T[]` only (sync)                                                                             | Diverged in v1. Type widening to `T[] \| Promise<T[]>` is non-breaking and lands when first consumer needs it.                                                                                                                                                                                                                                                                                            |
| `CancellationToken` parameter on `showQuickPick`                                                 | None                                                                                                 | Deferred. Cross-cutting concept; lands when async cancellation is solved across the API.                                                                                                                                                                                                                                                                                                                  |
| Backdrop scrim on palette open                                                                   | None                                                                                                 | Aligned. VS Code's command palette renders without a backdrop scrim either; the rest of the window stays visible. Both motivations support this — VS Code preserves the editing context, gcscode preserves operator-view telemetry/video visibility. The latter is a load-bearing constraint for any future overlay UI in gcscode (recorded in agent memory `project_realtime_monitoring_constraint.md`). |
| Focus-aware keybinding suppression (text inputs, `when` clauses, modals)                         | Modal-pause hook only (`modalActive` signal; dispatcher early-returns when `true`)                   | Partial. Broader suppression (text-input introspection, `when` clauses) still deferred.                                                                                                                                                                                                                                                                                                                   |
| Cross-platform `Mod` modifier (Cmd on Mac, Ctrl elsewhere)                                       | Literal `Ctrl+Shift+P` only                                                                          | Deferred per A3. Trigger unchanged — first Mac user reports a binding mismatch.                                                                                                                                                                                                                                                                                                                           |
| User-overridable keybindings (`keybindings.json`)                                                | Palette uses default `Ctrl+Shift+P` registered via the same `host.keybindings` API                   | Deferred per A3. The palette's default participates in any future configurable-keybindings system automatically because it is registered the same way as any other.                                                                                                                                                                                                                                       |
| Match highlighting (matched chars bolded in row)                                                 | Yes (Fuse `includeMatches: true`)                                                                    | Aligned.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Open/close animation                                                                             | None                                                                                                 | Diverged in v1. Polish; defer.                                                                                                                                                                                                                                                                                                                                                                            |

## In-scope

### API additions to `@gcscode/extension-api`

```ts
// Existing CommandContribution gains two optional fields (non-breaking).
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
  title?: string; // user-facing label; required for palette visibility
  category?: string; // optional grouping ('SITL', 'Workbench')
}

// New types.
export interface QuickPickItem {
  label: string; // primary text shown in the row
  description?: string; // dimmer trailing text on the same line — typed but unsearched in v1
  detail?: string; // smaller text on a second line — typed but unsearched in v1
}

export interface QuickPickOptions {
  placeholder?: string; // input placeholder text
  title?: string; // optional title shown above the input
}
```

### `WindowNamespace` gains `showQuickPick`

```ts
showQuickPick<T extends QuickPickItem>(
  items: T[],
  options?: QuickPickOptions,
): Promise<T | undefined>;
```

- Generic over `T` so callers passing items with extra fields get them back narrowed.
- Resolves with the picked item on Enter; resolves with `undefined` when the user dismisses (Esc / click outside).
- Calling `showQuickPick` while one is already open rejects with `Error('Quick pick already open')`. No queueing in v1.

### Built-in `workbench` extension

A new built-in extension lives at `packages/shell/src/built-in/workbench/`. It exports an `Extension` with `id: 'workbench'`, `displayName: 'Workbench'`. The shell registers it during boot via the existing `ExtensionManager.register` path, ahead of `bundledExtensions`.

In its `activate(context)` it registers, using the same public APIs extensions use:

1. `context.host.commands.registerCommand({ id: 'workbench.action.showCommands', title: 'Show All Commands', category: 'Workbench', run: openPalette })`.
2. `context.host.keybindings.registerKeybinding({ key: 'Ctrl+Shift+P', command: 'workbench.action.showCommands' })`.

The `openPalette` handler reads the live command list from the registry, filters to commands with a `title`, composes labels (`Category: Title` if `category` present), and calls `host.window.showQuickPick(items)`. On resolve, it calls `host.commands.executeCommand(picked.commandId)`.

The palette appears in itself ("Workbench: Show All Commands") because the registration is just another command — natural smoke test that the loop closes.

### Reactive registry integration

`registry.listCommands()` already returns from a `SvelteMap` (Phase B2a). The palette reads commands at the moment `openPalette` is invoked — no need to subscribe reactively because the palette is a transient overlay, not a persistent view. If a command is registered while the palette is open, it appears next time the palette is opened.

### Search & display behavior

- **Library:** `fuse.js` — added to `packages/shell/package.json` dependencies.
- **Searched fields (palette):** the composed `Category: Title` string only. Not the command id.
- **Searched fields (`showQuickPick` general):** `label` only. `description` and `detail` are typed but not searched in v1 (matches VS Code defaults of `matchOnDescription: false`, `matchOnDetail: false`).
- **Sort order:** Fuse score order when query is non-empty; alphabetical by composed label when query is empty.
- **Match highlighting:** matched characters bolded in the displayed row (Fuse `includeMatches: true`).
- **Empty state:** centered "No matching commands" text in the result area.
- **Default palette placeholder:** `"Type a command name"`.

### UI components (Svelte 5 + Tailwind utilities)

Styling uses Tailwind 4 utility classes (already set up in `packages/shell/vite.config.ts`). No component library (shadcn-svelte and similar are deferred to a later iteration; see the brainstorm transcript for reasoning).

- `packages/shell/src/quick-pick/quick-pick.svelte` — the floating panel. Renders input + filtered list + match highlighting + empty state. Captures `Enter`, `Escape`, `ArrowUp`, `ArrowDown` keys (`event.stopPropagation()` so they don't escape to global handlers).
- `packages/shell/src/quick-pick/quick-pick-host.svelte` — single instance mounted in the shell root. Reads `quickPickState.current`; renders `<QuickPick>` when non-null; manages click-outside-to-dismiss via global click listener.
- Top-anchored: fixed positioning, ~64px from viewport top, centered horizontally, ~440px wide.
- **No backdrop scrim.** Operator-view constraint — palette stays distinct via shadow + border, not by dimming the underlying app.
- No open/close animation in v1.

### Module-level reactive state (Svelte 5 class wrappers)

Two `.svelte.ts` modules introduce module-level reactive state. Both follow the project class-style convention: explicit `private`/`public`, `_backingField` underscore convention, no `#field` syntax, components are renderers and business logic lives in the class.

```ts
// packages/shell/src/modal-state.svelte.ts
class ModalState {
  private _active = $state(false);

  public get active(): boolean {
    return this._active;
  }
  public set active(value: boolean) {
    this._active = value;
  }
}
export const modalState = new ModalState();
```

```ts
// packages/shell/src/quick-pick/quick-pick-state.svelte.ts
interface QuickPickRequest<T extends QuickPickItem = QuickPickItem> {
  items: T[];
  options: QuickPickOptions | undefined;
  resolve: (value: T | undefined) => void;
}

class QuickPickState {
  private _current = $state<QuickPickRequest | null>(null);

  public get current(): QuickPickRequest | null {
    return this._current;
  }

  public open<T extends QuickPickItem>(request: QuickPickRequest<T>): void {
    if (this._current !== null) {
      throw new Error('Quick pick already open');
    }
    this._current = request as QuickPickRequest;
  }

  public pick(item: QuickPickItem): void {
    if (this._current === null) return;
    this._current.resolve(item);
    this._current = null;
  }

  public dismiss(): void {
    if (this._current === null) return;
    this._current.resolve(undefined);
    this._current = null;
  }
}
export const quickPickState = new QuickPickState();
```

### Modal-pause hook

`packages/shell/src/keybinding-dispatcher.ts` reads `modalState.active` at the top of its keydown handler. When `true`, returns early before any matching is attempted. `quick-pick-host.svelte` writes `modalState.active = true` on open of any quick pick (palette or generic), `false` on close.

This is a generalizable hook: future overlays (settings dialogs, input boxes) toggle the same flag. Modal stacking (multiple concurrent overlays) is **not** supported — the `Quick pick already open` error is the first tripwire if anything tries.

### Implementation surface summary

Files touched / added:

- `packages/extension-api/src/index.ts` — add `title?` + `category?` to `CommandContribution`; add `QuickPickItem`, `QuickPickOptions` interfaces; add `showQuickPick` to `WindowNamespace` type.
- `packages/shell/src/extension-host/registry.ts` — implement `showQuickPick` on the host built by `createHost`. The implementation calls `quickPickState.open(...)` and returns the promise.
- `packages/shell/src/modal-state.svelte.ts` — new (class wrapper).
- `packages/shell/src/quick-pick/quick-pick-state.svelte.ts` — new (class wrapper).
- `packages/shell/src/quick-pick/quick-pick.svelte` — new (component).
- `packages/shell/src/quick-pick/quick-pick-host.svelte` — new (component).
- `packages/shell/src/built-in/workbench/index.ts` — new (built-in extension).
- `packages/shell/src/keybinding-dispatcher.ts` — modal-pause check at top of handler.
- `packages/shell/src/main.ts` — register the `workbench` built-in extension at boot, ahead of the `bundledExtensions` loop.
- `packages/shell/src/app.svelte` — mount `<QuickPickHost />` once in the root layout.
- `packages/shell/package.json` — add `fuse.js` dependency.

## Out-of-scope (this iteration)

| Surface                                                      | Status      | Notes                                                                                                                       |
| ------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Async items (`Promise<T[]>`)                                 | ✗ Deferred. | Type widening is non-breaking. Adds when first consumer wants it (likely file-search or settings palette).                  |
| `QuickPickItem.kind` (separators / group headers)            | ✗ Deferred. | No grouping consumer.                                                                                                       |
| `QuickPickItem.iconPath`                                     | ✗ Deferred. | No icon system in shell yet.                                                                                                |
| `QuickPickItem.buttons`                                      | ✗ Deferred. | No consumer.                                                                                                                |
| `QuickPickItem.picked` / `alwaysShow`                        | ✗ Deferred. | Multi-select related.                                                                                                       |
| `QuickPickOptions.canPickMany` (multi-select)                | ✗ Deferred. | Would change return type to `T[] \| undefined`. No consumer.                                                                |
| `QuickPickOptions.matchOnDescription` / `matchOnDetail`      | ✗ Deferred. | Default `false` matches VS Code; flip per-call when first consumer wants it.                                                |
| `QuickPickOptions.ignoreFocusOut` / `onDidSelectItem`        | ✗ Deferred. | No consumer.                                                                                                                |
| `CancellationToken`                                          | ✗ Deferred. | Cross-cutting; lands when async cancellation is solved across the API.                                                      |
| Open/close animation                                         | ✗ Deferred. | Polish.                                                                                                                     |
| Status-bar hint (`Cmd+Shift+P · Show All Commands`)          | ✗ Cut.      | Operator-view real estate is more valuable for telemetry. Trigger to revisit: someone forgets the shortcut and asks for it. |
| Recently-used / MRU sort                                     | ✗ Deferred. | No persistence layer for it yet.                                                                                            |
| Modal stacking (multiple concurrent overlays)                | ✗ Deferred. | First overlap throws `Quick pick already open`.                                                                             |
| Match against command id                                     | ✗ Deferred. | Power-user feature; revisit when someone asks.                                                                              |
| Palette button to invoke "Show All Commands" with extra args | ✗ Deferred. | Args field on `KeybindingContribution` already deferred per A3.                                                             |

## Testing

**`@gcscode/extension-api`:** type-only — no runtime tests; types compile-checked by `pnpm check`.

**`@gcscode/shell` unit tests** (Vitest, no DOM):

- Modal-pause hook: dispatcher does nothing when `modalState.active === true`; resumes when `false` (2 tests).
- `quickPickState`: `open` while `current === null` succeeds; `open` while `current !== null` throws `Quick pick already open`; `pick(item)` resolves the open promise with `item` and clears `current`; `dismiss()` resolves with `undefined` and clears `current`; `pick`/`dismiss` are no-ops when `current === null` (4 tests).
- Built-in `workbench` extension: `activate` registers `workbench.action.showCommands` + the `Ctrl+Shift+P` keybinding; both appear in `registry.listCommands()` / `listKeybindings()` (2 tests).
- `host.window.showQuickPick` host implementation: calls `quickPickState.open` and returns its promise; resolves to picked item when `quickPickState.pick(item)` fires; resolves to `undefined` when `quickPickState.dismiss()` fires (3 tests).
- Fuse config sanity: representative inputs produce expected ordering (e.g. typing `"loc"` ranks `SITL: Get Location` above unrelated commands; typing `"sitl get"` matches subsequence) (2 tests).

**Component-level tests** (`@testing-library/svelte` is already configured in `packages/shell/vitest.config.ts` with `jsdom` environment):

- `quick-pick.svelte`: typing in input filters list; ArrowUp/Down moves highlight; Enter resolves with highlighted item; Esc resolves with `undefined`; click on row resolves with that row's item (5 tests).
- `quick-pick-host.svelte`: mounts when `quickPickState.current` becomes non-null; unmounts when `null`; sets `modalState.active` true/false at boundary (3 tests).

## `docs/out-of-scope.md` propagation

When this iteration ships, the docs commit makes these exact edits:

- **Remove line 22** ("Built-in / shell-registered commands. No host-side command registration today …"). Trigger met — the `workbench` built-in extension is the first host-registered command.
- **Update line 27** ("Focus-aware keybinding suppression"). Narrow to: modal-pause hook (`modalState.active` signal; dispatcher early-returns when true) is in for the palette's needs. Remaining cases — text-input introspection in extension-rendered forms, `when`-clause-based gating, modal stacking — still deferred. Trigger unchanged.
- **Add new entry** under "Extension machinery": "**Quick pick advanced features.** `QuickPickItem.kind` (separators), `iconPath`, `buttons`, `picked`, `alwaysShow`. `QuickPickOptions.canPickMany`, `matchOnDescription`, `matchOnDetail`, `ignoreFocusOut`, `onDidSelectItem`. Async items (`Promise<T[]>`). `CancellationToken`. Modal stacking. _Trigger to revisit:_ first consumer wants any specific field — add per-field, do not bundle."

## `docs/vs-code-alignment.md` propagation

Append the rows from the VS Code alignment table above to the cumulative ledger when the iteration ships.

## `docs/roadmap.md` propagation

- Flip `C2` checkbox on; link this spec.
- Update the `C2+` line to reflect that quick-pick has landed; remaining "events, settings, themes, i18n" stay as `C3+`.

## Open questions

None at spec-write time. All settled in brainstorm.
