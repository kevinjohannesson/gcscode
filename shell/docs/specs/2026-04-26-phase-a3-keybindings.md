# Phase A3 — Keybinding contribution

**Status:** Approved (2026-04-26)

## Context

Commands (Phase A2) are the integration backbone: they exist, they are registerable, they are firable by id via `host.executeCommand`. But there is no UI trigger for them yet — a plugin author can register a command and nothing else can fire it without writing more plugin code. Phase A3 adds the first user-fireable trigger: keybindings. A plugin contributes `{ key, command }` and a shell-level keyboard dispatcher fires the matching command when the user presses the combo.

A3 is structurally a fourth mirror of the view / status-bar / command pattern (id-keyed Map keyed by `key`-string instead of `id`-string but otherwise identical: throw on duplicate, identity-checked dispose, insertion-order list) plus two new pieces:

1. **A host-side `registry.executeCommand`** — the keyboard dispatcher is not a plugin, so it cannot use `host.executeCommand`. The cleanest fix is to expose `executeCommand` on the public `Registry` interface as well, sharing one internal implementation with the host version (parameterized only by the error-attribution string).

2. **A keyboard dispatcher** — a small new module in `@gcscode/shell` that listens for `keydown` on a target (the `document`), matches the event against parsed keybindings from `registry.listKeybindings()`, and fires `registry.executeCommand` on first match. Returns a `Disposable` so future hot-reload / deactivate paths can tear it down.

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. The A3 surface preserves the load-bearing patterns:

| VS Code feature                                                        | A3 in GCScode                                                            | Status                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keybindings reference commands by string id (the integration backbone) | ✓                                                                        | Aligned.                                                                                                                                                                                                                                                                                              |
| `Disposable` return on register                                        | ✓                                                                        | Aligned.                                                                                                                                                                                                                                                                                              |
| Throw on duplicate at register                                         | ✓ (throw on duplicate `key`)                                             | Aligned.                                                                                                                                                                                                                                                                                              |
| Modifiers `Ctrl`, `Shift`, `Alt`, `Meta`                               | ✓                                                                        | Aligned.                                                                                                                                                                                                                                                                                              |
| Registration shape                                                     | `host.registerKeybinding({ key, command })` (object-literal, imperative) | In spirit — VS Code uses manifest `package.json#contributes.keybindings`. We have no manifest yet (ADR-0003); object-literal continues our `register*` pattern.                                                                                                                                       |
| Key string format                                                      | `'Ctrl+Shift+G'` (PascalCase modifiers, case-insensitive at match time)  | In spirit — VS Code uses lowercase (`'ctrl+shift+g'`). Casing only; semantically aligned.                                                                                                                                                                                                             |
| `executeCommand` from non-extension code                               | Both `host.executeCommand` and `registry.executeCommand`                 | Aligned in spirit — VS Code's `vscode.commands.executeCommand` is the same API used by both extensions and the editor itself. The shell's keyboard dispatcher uses the host-side variant since it has no plugin identity.                                                                             |
| Conflict policy                                                        | Throw on duplicate `key` at registration                                 | In spirit — VS Code resolves with priority/specificity at fire time; we throw at register time. Simpler; matches our existing register\*-throws-on-duplicate semantics. Trigger to revisit: when conflicts become real friction (likely untrusted plugins, palette UI, or user-overridable bindings). |
| User-overridable keybindings (`keybindings.json`)                      | ✗ Deferred.                                                              | No settings system yet.                                                                                                                                                                                                                                                                               |
| `mac:` overlay / `Mod` cross-platform alias                            | ✗ Deferred.                                                              | Use literal `Ctrl` only for now; revisit when Mac usage is concrete.                                                                                                                                                                                                                                  |
| `args` field passed through to `executeCommand`                        | ✗ Deferred.                                                              | Add when a real consumer needs it.                                                                                                                                                                                                                                                                    |
| `when` clauses (visibility / enablement)                               | ✗ Deferred (per A2).                                                     | Already in `out-of-scope.md`.                                                                                                                                                                                                                                                                         |
| Sequential / chord keybindings (`Ctrl+K Ctrl+S`)                       | ✗ Deferred.                                                              | Single combo per registration; revisit when a real consumer needs chords.                                                                                                                                                                                                                             |
| Keybinding discoverability UI (palette)                                | ✗ Deferred.                                                              | Palette work follows A3+.                                                                                                                                                                                                                                                                             |

## Goals

- A fourth contribution kind (`registerKeybinding`) lands additively, mirroring the registerView / registerStatusBarItem / registerCommand machinery.
- `registry.executeCommand<T>(id, ...args): Promise<T>` is added as a host-side mirror of `host.executeCommand`. Both share one internal implementation; only the error-attribution string differs (`plugin "<id>"` vs `host`).
- A new `attachKeybindingDispatcher(registry, target): Disposable` module listens for keydown events, matches against registered keybindings, and fires the matched command. First match wins; `event.preventDefault()` is called on match.
- The dispatcher catches both synchronous throws (missing command id) and Promise rejections from `executeCommand`, surfacing them via `console.error` rather than allowing them to escape the keydown handler.
- `examplePlugin` grows a fourth contribution: `registerKeybinding({ key: 'Alt+Shift+G', command: 'gcscode.example.greet' })`. The `greet` command's `run` adds a `console.log('Hello from gcscode.example')` so pressing the combo produces a visible effect in dev tools.
- All existing tests continue to pass; new tests cover the new surface end-to-end (registration, the registry executeCommand verb, parser, matcher, dispatcher, contract test).

## Non-goals

- **`args` field on `KeybindingContribution`.** VS Code threads `args` from manifest entries through to the command's run. Defer until a real consumer needs args wired through a binding.
- **`when` clauses.** Already deferred (`out-of-scope.md`); revisit only when a contribution wants state-conditional visibility or enablement.
- **Sequential / chord keybindings.** Single combo per registration. Revisit when a real consumer needs chord shortcuts.
- **User-overridable keybindings.** No settings or override file. Adding one requires a settings system, which is out-of-scope until a real consumer.
- **Cross-platform `Mod` alias.** Literal `Ctrl` / `Cmd` only. VS Code's `Mod` (= Cmd on Mac, Ctrl elsewhere) and `mac:` overlay system are deferred until Mac usage is concrete.
- **Conflict resolution at fire time.** We throw at registration on duplicate keys. VS Code resolves at fire time with priority/specificity. Defer until a real conflict arises.
- **Built-in / shell-registered keybindings.** No host-side keybinding registration today (already deferred per the broader "built-in shell-registered commands" entry in `out-of-scope.md`).
- **Keybinding discoverability UI.** Listing keybindings to the user (e.g. in a palette or settings page) is a later iteration.
- **The dispatcher firing during text input or modal dialogs.** No focus-aware suppression. If a registered keybinding's combo would intercept text input (e.g. typing `Ctrl+G`), the dispatcher fires anyway. Real focus management lives with `when` clauses (deferred).

## API surface (`@gcscode/plugin-api`)

New type and method on `PluginHost`; new method on `Registry` (the host-side `executeCommand` is a refactor, not a new shape):

```ts
export interface KeybindingContribution {
  key: string; // e.g. 'Ctrl+Shift+G'. Modifiers are 'Ctrl', 'Shift', 'Alt', 'Meta', case-insensitive at match time. The key portion is also case-insensitive ('g' matches 'G' on the keyboard event). One non-modifier key per binding.
  command: string; // command id to fire — looked up by string at fire time, not at registration; cross-plugin references are intentional
}

export interface PluginHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  registerKeybinding(keybinding: KeybindingContribution): Disposable; // new
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}
```

Plus on `Registry` (in `@gcscode/shell`'s public registry interface, not on `@gcscode/plugin-api`):

```ts
export interface Registry {
  activate(plugin: Plugin): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[]; // new
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>; // new — host-side verb, mirror of host.executeCommand
}
```

The two `executeCommand` methods share a single internal function. The only divergence is the error-attribution string: host calls pass `plugin "<plugin.id>"`; registry calls pass `host`. Both `Promise<T>` shapes, both throw synchronously on missing id, both surface sync-throws-in-run as Promise rejections via `Promise.resolve().then(...)` wrapping. Identical otherwise.

## Registry changes (`packages/shell/src/plugin-host/registry.ts`)

Refactor + addition. The existing `executeCommand` body inside `createHost(plugin)` factors into a registry-level `execute<T>(id, args, attribution): Promise<T>` helper, captured in the `createRegistry` closure. Both call sites then become one-liners:

```ts
function execute<T>(id: string, args: unknown[], attribution: string): Promise<T> {
  const command = commands.get(id);
  if (command === undefined) {
    throw new Error(
      `Command id "${id}" is not registered (attempted by ${attribution}).`,
    );
  }
  return Promise.resolve().then(() => command.run(...args)) as Promise<T>;
}

// inside createHost(plugin):
executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
  return execute<T>(id, args, `plugin "${plugin.id}"`);
},

// on the returned registry:
executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
  return execute<T>(id, args, 'host');
},
```

Existing host-side error message is byte-for-byte preserved: `Command id "X" is not registered (attempted by plugin "Y").` — existing tests pass unchanged.

Plus the keybinding parallel store + register/list, mirroring the three existing kinds:

```ts
const keybindings = new Map<string, KeybindingContribution>();

// inside createHost(plugin):
registerKeybinding(keybinding) {
  if (keybindings.has(keybinding.key)) {
    throw new Error(
      `Keybinding "${keybinding.key}" is already registered (attempted by plugin "${plugin.id}").`,
    );
  }
  keybindings.set(keybinding.key, keybinding);
  return {
    dispose() {
      // Idempotent and safe under re-registration: only delete if the
      // entry currently in the map is the one this disposable owns.
      if (keybindings.get(keybinding.key) === keybinding) {
        keybindings.delete(keybinding.key);
      }
    },
  };
},
```

Plus `listKeybindings()` returning insertion order (`Array.from(keybindings.values())`).

Note: the keybinding Map is keyed by the `key` string (not by an `id`) because keybindings have no separate identity field — the `key` IS the identity. Two keybindings with the same combo are a conflict.

## Keyboard dispatcher (new module: `packages/shell/src/keybinding-dispatcher.ts`)

Three exported pieces:

```ts
import type { Registry } from './plugin-host/registry';
import type { Disposable } from '@gcscode/plugin-api';

interface ParsedKey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string; // lowercased, single non-modifier key
}

export function parseKey(input: string): ParsedKey {
  const tokens = input.split('+').map((t) => t.trim());
  const parsed: ParsedKey = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') parsed.ctrl = true;
    else if (lower === 'shift') parsed.shift = true;
    else if (lower === 'alt') parsed.alt = true;
    else if (lower === 'meta' || lower === 'cmd' || lower === 'command') parsed.meta = true;
    else {
      if (parsed.key !== '') {
        throw new Error(`Keybinding "${input}" has more than one non-modifier key`);
      }
      parsed.key = lower;
    }
  }
  if (parsed.key === '') {
    throw new Error(`Keybinding "${input}" has no non-modifier key`);
  }
  return parsed;
}

export function matchesKey(event: KeyboardEvent, parsed: ParsedKey): boolean {
  return (
    event.ctrlKey === parsed.ctrl &&
    event.shiftKey === parsed.shift &&
    event.altKey === parsed.alt &&
    event.metaKey === parsed.meta &&
    event.key.toLowerCase() === parsed.key
  );
}

export function attachKeybindingDispatcher(registry: Registry, target: EventTarget): Disposable {
  const handler = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return;
    for (const kb of registry.listKeybindings()) {
      let parsed: ParsedKey;
      try {
        parsed = parseKey(kb.key);
      } catch (err) {
        console.error(`[keybinding-dispatcher] failed to parse "${kb.key}":`, err);
        continue;
      }
      if (matchesKey(event, parsed)) {
        event.preventDefault();
        try {
          void registry.executeCommand(kb.command).catch((err) => {
            console.error(
              `[keybinding-dispatcher] command "${kb.command}" rejected (key "${kb.key}"):`,
              err,
            );
          });
        } catch (err) {
          // Sync throw from registry.executeCommand (e.g. missing command id)
          console.error(
            `[keybinding-dispatcher] command "${kb.command}" threw synchronously (key "${kb.key}"):`,
            err,
          );
        }
        return; // first match wins
      }
    }
  };
  target.addEventListener('keydown', handler);
  return {
    dispose() {
      target.removeEventListener('keydown', handler);
    },
  };
}
```

Three small responsibilities — `parseKey`, `matchesKey`, `attachKeybindingDispatcher` — separately exported so each is independently testable. Parsing happens per keydown rather than per registration; the cost is microseconds against a small list, and skipping caching keeps the dispatcher stateless.

The dispatcher is wired in `main.ts`:

```ts
import { attachKeybindingDispatcher } from './keybinding-dispatcher';

const registry = createRegistry();
registry.activate(examplePlugin);

attachKeybindingDispatcher(registry, document);

mount(App, { target: document.getElementById('app')!, props: { registry } });
```

The returned `Disposable` is intentionally not retained today — the listener lives for the page lifetime. When deactivate orchestration lands (Phase B), main.ts can hold the disposable and call dispose on teardown.

## Plugin example (`packages/plugin-example`)

`examplePlugin.activate(context)` grows a fourth call. The `greet` command's `run` also gains a `console.log` so pressing the bound key produces visible feedback in dev tools:

```ts
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
  context.host.registerCommand({
    id: 'gcscode.example.greet',
    run: () => {
      const message = 'Hello from gcscode.example';
      console.log(message);
      return message;
    },
  }),
  context.host.registerKeybinding({
    key: 'Alt+Shift+G',
    command: 'gcscode.example.greet',
  }),
);
```

`Alt+Shift+G` is chosen for low conflict potential with browser default shortcuts. The dispatcher calls `event.preventDefault()` on match anyway, but choosing a less-contended combo means a typing user is less likely to hit it accidentally.

## Testing

**`packages/shell/src/plugin-host/registry.test.ts`** — register-side suite for keybindings (parallel with the existing three kinds):

- `listKeybindings()` starts empty.
- `registerKeybinding` records the keybinding.
- The returned `Disposable` removes it.
- `dispose()` is idempotent for keybindings.
- Duplicate `key` throws (error matches both the colliding key and the registering plugin id).
- Keybinding storage is independent of view / status-bar / command stores (cross-kind id reuse remains supported, plus a keybinding can have a `command` that matches a view/statusbar/command id without collision).
- `listKeybindings` preserves registration order.

Plus registry-side `executeCommand` round-trip:

- `registry.executeCommand` resolves with the run's return value.
- Variadic args are threaded through `run`.
- Missing id throws synchronously with attribution `(attempted by host)`.
- Sync throws inside `run` become rejected Promises.
- Async rejections inside `run` propagate unchanged.

The existing host-side `executeCommand` tests (introduced in A2) continue to assert `(attempted by plugin "<id>")` and remain unchanged after the helper refactor.

**`packages/shell/src/keybinding-dispatcher.test.ts`** (new file):

`parseKey`:

- Parses single key (`'g'`) — no modifiers, `key: 'g'`.
- Parses combo (`'Ctrl+Shift+G'`) — three modifiers, `key: 'g'`.
- Case-insensitive on modifiers (`'CTRL+shift+G'`) and key (`'Ctrl+Shift+g'` parses identically to `'Ctrl+Shift+G'`).
- Accepts `Cmd`/`Command` as aliases for `Meta`.
- Throws on empty input.
- Throws on input with no non-modifier key (`'Ctrl+Shift'`).
- Throws on input with multiple non-modifier keys (`'g+h'`).

`matchesKey`:

- Returns true when all four modifier flags match the event and the key matches.
- Returns false when any modifier mismatches.
- Returns false when key mismatches.
- Case-insensitive key match (event with `key: 'G'` matches a parsed key `'g'`).

`attachKeybindingDispatcher`:

- Returns a `Disposable` whose `dispose()` removes the listener.
- A keydown matching a registered keybinding fires the registered command exactly once.
- A keydown not matching any registered keybinding does nothing.
- Calls `event.preventDefault()` on match.
- First-match-wins: with two keybindings registered (different keys, only one matches), only the matching one fires.
- A keydown matching a registered keybinding whose `command` is not a registered command id does NOT throw out of the keydown handler — the synchronous registry-side throw is caught and logged via `console.error`.
- A keydown matching a registered keybinding whose `command`'s `run` rejects asynchronously also surfaces via `console.error` (caught from the rejected Promise).
- After `dispose()`, subsequent keydowns do not fire any commands.

Tests use `vi.spyOn(console, 'error')` to assert error logging without polluting test output.

**`packages/plugin-example/src/index.test.ts`** — extend the contract test:

- `registerKeybinding` is called with `{ key: 'Alt+Shift+G', command: 'gcscode.example.greet' }`.
- All four disposables (view, status, command, keybinding) land in `subscriptions` in registration order.
- The greet command's `run` returns `'Hello from gcscode.example'` AND calls `console.log` with that string (verified via `vi.spyOn(console, 'log')`).

## Files modified / added

| Path                                               | Change                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/plugin-api/src/index.ts`                 | Add `KeybindingContribution`; add `registerKeybinding` on `PluginHost`.                                                                                                                                         |
| `packages/shell/src/plugin-host/registry.ts`       | Add `keybindings` Map, `registerKeybinding` on host, `listKeybindings` on Registry, `registry.executeCommand` (mirror of host's), and an extracted `execute` helper shared by both `executeCommand` call sites. |
| `packages/shell/src/plugin-host/registry.test.ts`  | Register-side keybinding tests + registry-side `executeCommand` tests.                                                                                                                                          |
| `packages/shell/src/keybinding-dispatcher.ts`      | New module — `parseKey`, `matchesKey`, `attachKeybindingDispatcher`.                                                                                                                                            |
| `packages/shell/src/keybinding-dispatcher.test.ts` | New tests for the parser, matcher, and dispatcher.                                                                                                                                                              |
| `packages/shell/src/main.ts`                       | Wire the dispatcher: `attachKeybindingDispatcher(registry, document)`.                                                                                                                                          |
| `packages/plugin-example/src/index.ts`             | Register the keybinding (`Alt+Shift+G` → `gcscode.example.greet`); `greet`'s `run` gains a `console.log`.                                                                                                       |
| `packages/plugin-example/src/index.test.ts`        | Update contract test for the fourth registration + the `console.log` side effect.                                                                                                                               |
| `packages/plugin-api/README.md`                    | Update Usage snippet + activation-context bullet to show the keybinding.                                                                                                                                        |
| `packages/plugin-example/README.md`                | Update "What it demonstrates" + "Anatomy" to mention the keybinding.                                                                                                                                            |
| `packages/shell/README.md`                         | Mention the keyboard dispatcher and `listKeybindings()` in the listX summary.                                                                                                                                   |
| `docs/out-of-scope.md`                             | Propagate A3 cross-cutting non-goals (see propagation section below).                                                                                                                                           |

## `docs/out-of-scope.md` propagation

Cross-cutting non-goals from this spec — concepts the architecture is deliberately deferring, not just per-iteration scope cuts — must land in the canonical deferral list when A3 ships:

- **Update existing "Additional contribution kinds" bullet** to acknowledge keybindings shipped: "Today: four `register*` methods on `PluginHost` (`registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) plus the verb `executeCommand`. Add another (e.g. `registerMenuItem`, `registerPaletteEntry`) when there is a real consumer."
- **Update existing "Event bus, settings, themes, i18n" bullet** to update the verbs-today list to five: the four registers plus `executeCommand`.
- **Add new bullet — Sequential / chord keybindings.** No support for `Ctrl+K Ctrl+S`-style two-step keybindings; one combo per registration. _Trigger to revisit:_ a real consumer wants chord shortcuts (typically a settings/file palette).
- **Add new bullet — User-overridable keybindings.** No `keybindings.json`-equivalent override file or settings UI. Plugin-registered keybindings are the only source. _Trigger to revisit:_ users complain about plugin keybinding conflicts, or a settings system lands.
- **Add new bullet — Cross-platform key aliasing (`Mod`, `mac:` overlay).** Literal `Ctrl` / `Cmd` only; no automatic platform mapping. _Trigger to revisit:_ first concrete Mac usage of the app.
- **Add new bullet — Focus-aware keybinding suppression.** No mechanism to disable a keybinding while a text input is focused, a modal is open, or a `when` condition is false. _Trigger to revisit:_ first text input or modal where the dispatcher's keydown interception causes user-visible bugs.

The "args field on KeybindingContribution" non-goal is per-iteration (it's a future field on this kind specifically) and stays in the spec only — not propagated. The "conflict resolution at fire time" non-goal is subsumed by the existing `Additional contribution kinds` deferral framing.

## Verification

- `pnpm check` clean across packages.
- `pnpm test` — every test passes; new tests cover the new register surface, the registry executeCommand verb, the parser, the matcher, the dispatcher, and the contract test extension.
- `pnpm lint` clean.
- `pnpm dev` — open the app; with dev tools open, press `Alt+Shift+G`. Verify console shows `Hello from gcscode.example`. The view, status bar item, and existing UI render unchanged.

## Follow-ups (out of scope for A3)

- **Phase A4 — menu items contribution.** Likely the next surface that references command ids; another natural fit for a generic registrar (independent-store kind).
- **Phase A5 — command palette UI.** Consumer of `listCommands()` + (eventual) command titles. Likely needs the manifest deferral to land for titles.
- **Cross-platform `Mod` alias.** When Mac usage is concrete, add a `Mod` modifier that resolves to `Cmd` on Mac and `Ctrl` elsewhere.
- **Conflict resolution at fire time.** When real conflicts arise, switch from throw-on-duplicate to priority/specificity resolution.
- **`when` clauses + focus-aware suppression.** Both depend on an expression evaluator + an evaluation context binding host state.
- **User-overridable keybindings.** Depends on a settings system.

## Cross-cutting notes

**Registrar duplication revisited.** A3 brings the count to **four** `register*` blocks in `registry.ts`. The A2 cross-cutting reviewer recommended deciding the `makeRegistrar<T>` extraction question once kind #4 lands and its shape is known. Keybindings are an independent-store kind (the keybinding has no cross-store reference at registration time — the `command` field is only resolved at fire time, which is the dispatcher's concern, not the registry's). They fit a generic factory cleanly.

**Decide during A3's cross-cutting review, not during planning.** If the four `register*` blocks read as line-for-line repetition (only noun and Map differ), extract `makeRegistrar<T extends { id?: string; key?: string }>(label, store, identityField, attribution)` as a follow-up commit on the A3 branch. If the keybinding map's keying-by-`key` (instead of `id`) makes the abstraction harder than the duplication it removes, leave it. Either way, the decision belongs in the implementation review — and it will be principled because we now have four concrete copies to compare against the proposed abstraction.

**The `execute` helper extraction.** This A3 spec already extracts the shared `execute<T>(id, args, attribution)` function out of `createHost`'s `executeCommand` body so registry-side `executeCommand` can reuse it. That is a small-scale precedent for `makeRegistrar` — one of the four cross-cutting machinery concerns has been DRY'd, the other three (the `register*` methods) are still duplicated. The cross-cutting reviewer should weigh whether the symmetry should be completed.
