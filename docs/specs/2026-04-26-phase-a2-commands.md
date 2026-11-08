# Phase A2 — Command contribution

_Note: The term "plugin" was renamed to "extension" in [ADR-0004](../decisions/ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._

**Status:** Approved (2026-04-26)

## Context

Commands are the integration backbone of the VS Code extension model. Status bar items, menu items, keybindings, tree-view actions, and palette entries all reference commands by string id. Phase A2 adds the third contribution kind to the gcscode plugin architecture: `registerCommand` plus an `executeCommand` round-trip, with no UI trigger required for the smallest scope.

A2 is structurally a third mirror of the view / status-bar pattern (id-keyed Map, throw on duplicate, identity-checked dispose, insertion-order list) plus one new shape — `executeCommand`, a verb that looks up a registered command by id and runs it. The verb is what makes commands the integration backbone: once it exists, future kinds (keybindings, menu items, palette entries) reference commands by id rather than carrying handlers themselves.

This is the first iteration where the mirror property of the architecture (kind #3 lands by analogy with kinds #1 and #2) gets a real test. The three Maps in the registry (`views`, `statusBarItems`, `commands`) and the three `register*` methods on `PluginHost` should look like a clean repetition; if they do not, that is the signal — flagged in earlier reviews — that a `Registrar<T>` helper is overdue. The decision happens during the implementation review, not during planning.

## VS Code alignment

GCScode mirrors VS Code's extension architecture **in spirit, not by byte**. The A2 surface preserves the load-bearing patterns:

| VS Code feature                                             | A2 in GCScode                                      | Status                                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerCommand(id, callback)`                             | `host.registerCommand({ id, run })`                | In spirit — object-literal pattern matches our other `register*` methods (ADR-0003); the shape (named, disposable, host-scoped) is preserved. |
| `executeCommand<T>(id, ...args): Thenable<T>`               | `host.executeCommand<T>(id, ...args): Promise<T>`  | Aligned.                                                                                                                                      |
| `Disposable` return on register                             | ✓                                                  | Aligned.                                                                                                                                      |
| Throw on duplicate id at register                           | ✓                                                  | Aligned.                                                                                                                                      |
| Throw on missing id at execute                              | ✓ (synchronous throw — programmer error)           | Aligned.                                                                                                                                      |
| Cross-plugin execute (commands are global by id)            | ✓                                                  | Aligned.                                                                                                                                      |
| Variadic args threaded to callback                          | ✓                                                  | Aligned.                                                                                                                                      |
| Run errors become rejected Promises                         | ✓ via `Promise.resolve().then(() => run(...args))` | Aligned.                                                                                                                                      |
| Namespaced API (`vscode.commands.x`)                        | Flat (`host.x`)                                    | Deferred — namespace once host surface > ~5–7 methods (ADR-0003 follow-up). After A2 we are at 4.                                             |
| `getCommands()` introspection                               | `registry.listCommands()`                          | Aligned in shape; per-kind list method matches the existing pattern.                                                                          |
| Manifest `contributes.commands` (titles, categories, icons) | ✗ Deferred.                                        | Spec non-goal — adding fields now would guess at the manifest's eventual shape.                                                               |
| `when` clauses (visibility)                                 | ✗ Deferred.                                        | Needs an expression evaluator.                                                                                                                |
| Keybindings, palette UI                                     | ✗ Deferred to A3+.                                 | Layered on top of commands, not part of them.                                                                                                 |
| Built-in / shell-registered commands                        | ✗ None today.                                      | Plugin-only registration until the shell needs to expose actions.                                                                             |

## Goals

- A third contribution kind (`registerCommand`) lands additively, mirroring the registerView / registerStatusBarItem machinery.
- `executeCommand<T>(id, ...args)` round-trips through the registry: looks up the command, calls `run(...args)`, returns `Promise<T>` of the result. Sync errors and async rejections both surface as rejected Promises.
- Plugin example grows a registered command (`gcscode.example.greet`), demonstrating the pattern in the worked example.
- All existing tests continue to pass; new tests cover the new surface end-to-end including the execute round-trip.
- `CLAUDE.md` gains a "Planning conventions and long-term alignment" section that captures both (a) the VS Code "in spirit, not by byte" rule, so future sessions thread VS Code alignment through every API decision, and (b) the rule that cross-cutting non-goals from specs must propagate to `docs/out-of-scope.md` when the iteration ships.

## Non-goals

- **`title`, `category`, `icon`, `description` fields on `CommandContribution`.** These belong in the deferred manifest. Adding them now would be guessing at the manifest's eventual shape. Trigger to revisit: palette UI or menu work needs to render them.
- **`when` clauses.** Visibility / enablement of commands in menus and palettes; requires an expression evaluator. Deferred until the first menu/palette consumer.
- **Command palette UI, keybinding contributions, menu contributions.** A3+ — these layer on top of commands, not part of them.
- **Built-in / shell-registered commands.** The shell registers no commands today. When it needs to expose actions (e.g. "open settings"), commands gain a host-side registration path; until then, plugins-only.
- **Sandboxing or trust boundary on `run`.** All plugins are first-party / in-tree per ADR-0001/0002. Plugin code runs in the shell's JS realm; if `run` throws or hangs, the host's only obligation is to surface it as a rejected Promise to the caller.
- **Async cancellation / cancellation tokens.** VS Code has `CancellationToken` for long-running command callbacks. Out of scope until any command actually needs to be cancellable.
- **`onDidExecuteCommand` / command telemetry events.** Deferred until the event-bus iteration (Phase B / C territory).

## API surface (`@gcscode/plugin-api`)

New type and methods on `PluginHost`:

```ts
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
}

export interface PluginHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}
```

`run` is variadic. It may return either a sync value or a Promise — both flow through `executeCommand` correctly because of the `Promise.resolve().then(() => run(...))` wrapping.

`executeCommand`'s `<T>` is a caller-side assertion; the registry has no way to verify return-type alignment with the registered callback. The convention (from VS Code) is that the caller knows what type to expect — there is no stricter typing achievable without compile-time linkage between commands and callers.

## Registry changes (`packages/shell/src/plugin-host/registry.ts`)

Parallel store and methods, mirroring the existing kinds:

```ts
const commands = new Map<string, CommandContribution>();

// inside createHost(plugin):
registerCommand(command) {
  if (commands.has(command.id)) {
    throw new Error(
      `Command id "${command.id}" is already registered (attempted by plugin "${plugin.id}").`,
    );
  }
  commands.set(command.id, command);
  return {
    dispose() {
      // Idempotent and safe under re-registration: only delete if the
      // entry currently in the map is the one this disposable owns.
      if (commands.get(command.id) === command) {
        commands.delete(command.id);
      }
    },
  };
},
executeCommand(id, ...args) {
  const command = commands.get(id);
  if (command === undefined) {
    throw new Error(
      `Command id "${id}" is not registered (attempted by plugin "${plugin.id}").`,
    );
  }
  return Promise.resolve().then(() => command.run(...args)) as Promise<T>;
},
```

The `as Promise<T>` cast bridges the implementation's `unknown` return to the caller-asserted `<T>` on `executeCommand`. Callers assert their own expected `T` at the call site (matching VS Code's `Thenable<T>` convention); the registry has no compile-time linkage between commands and callers.

`Registry` interface gains `listCommands(): readonly CommandContribution[]`; insertion order via `Array.from(commands.values())`.

`executeCommand` throws synchronously when the id is missing because that's a definitional / programmer error, not a runtime exception. VS Code does the same.

## Plugin example (`packages/plugin-example`)

`examplePlugin.activate(context)` grows a third call:

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
    run: () => 'Hello from gcscode.example',
  }),
);
```

The command takes no arguments and returns a fixed string. With no UI trigger in A2 it has no end-user effect; the contract test exercises it via `host.executeCommand`. When A3 lands (palette / keybinding / menu), this command becomes the first wirable target.

## Testing

**`packages/shell/src/plugin-host/registry.test.ts`** — parallel suite for commands:

Registration:

- `listCommands()` starts empty.
- `registerCommand` records the command.
- The returned `Disposable` removes it.
- `dispose()` is idempotent.
- Duplicate id throws (error matches both the colliding id and the registering plugin id).
- A view id, a status bar item id, and a command id can all coincide (three separate namespaces).
- `listCommands` preserves registration order.

Execute round-trip:

- `executeCommand` resolves with the run's return value.
- Variadic args are threaded to `run`.
- Missing id throws synchronously (asserted via `expect(() => ...).toThrow()`, not a Promise rejection).
- Sync throws inside `run` become rejected Promises (caught via `await expect(...).rejects.toThrow()`).
- Async rejections inside `run` propagate unchanged (rejected Promise pass-through).

**`packages/plugin-example/src/index.test.ts`** — extends the contract test:

- `registerCommand` is called with `{ id: 'gcscode.example.greet', run: <function> }`.
- All three disposables (view, status, command) land in `subscriptions` in registration order.
- The command, when executed via the captured host mock, resolves with `'Hello from gcscode.example'`.

## Files modified / added

| Path                                              | Change                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/plugin-api/src/index.ts`                | Add `CommandContribution`; add `registerCommand` + `executeCommand` on `PluginHost`.                                                                                                                                      |
| `packages/shell/src/plugin-host/registry.ts`      | Add `commands` Map, `registerCommand` + `executeCommand` on host, `listCommands` on Registry.                                                                                                                             |
| `packages/shell/src/plugin-host/registry.test.ts` | Tests for register + execute.                                                                                                                                                                                             |
| `packages/plugin-example/src/index.ts`            | Register the third contribution (`gcscode.example.greet`).                                                                                                                                                                |
| `packages/plugin-example/src/index.test.ts`       | Update contract test for the third registration + execute round-trip.                                                                                                                                                     |
| `packages/plugin-api/README.md`                   | Update Usage snippet + activation-context bullet to show the command.                                                                                                                                                     |
| `packages/plugin-example/README.md`               | Update "What it demonstrates" + "Anatomy" to mention the command.                                                                                                                                                         |
| `packages/shell/README.md`                        | Update the listX summary to mention `listCommands()`.                                                                                                                                                                     |
| `docs/out-of-scope.md`                            | Propagate A2 cross-cutting non-goals (see "`docs/out-of-scope.md` propagation" section below).                                                                                                                            |
| `CLAUDE.md`                                       | Add a "Planning conventions and long-term alignment" section: VS Code "in spirit, not by byte" rule + the rule that cross-cutting non-goals from specs must propagate to `docs/out-of-scope.md` when the iteration ships. |

## `docs/out-of-scope.md` propagation

Cross-cutting non-goals from this spec — concepts the architecture is deliberately deferring, not just per-iteration scope cuts — must land in the canonical deferral list when A2 ships. The specific edits:

- **Update existing "Additional contribution kinds" bullet** to acknowledge commands shipped: "Today: three `register*` methods on `PluginHost` (`registerView`, `registerStatusBarItem`, `registerCommand`). Add another (e.g. `registerKeybinding`, `registerMenuItem`) when there is a real consumer."
- **Update existing "Command system, event bus, …" bullet** to drop the "command system" prefix (commands shipped) and update the "verbs today" list to three: `registerView`, `registerStatusBarItem`, `registerCommand` plus the verb `executeCommand`.
- **Update existing "Declarative `contributes` manifest" bullet** to mention concretely what manifest fields commands would gain there: titles, categories, icons, descriptions. Trigger to revisit unchanged (palette UI, settings UI, untrusted plugins).
- **Add new bullet — `when` clauses.** Visibility / enablement of contributions in menus, palettes, status bar. Cost: an expression evaluator plus an evaluation context binding host state. Trigger to revisit: the first menu/palette consumer that needs conditional visibility.
- **Add new bullet — Built-in / shell-registered commands.** No host-side command registration today. The shell exposes no actions to plugins. Trigger to revisit: the shell needs to expose a host-level capability (e.g. "open settings", "reload window") via the same command system plugins use.
- **Add new bullet — Async cancellation tokens.** No `CancellationToken` or equivalent for long-running command callbacks or future async APIs. Trigger to revisit: the first command (or future async kind) that takes long enough to be worth cancelling.
- **`onDidExecuteCommand` / command telemetry events** are subsumed by the existing event-bus deferral — no new bullet needed; once an event bus lands, command-level events fall out for free.

The "sandboxing on `run`" non-goal in this spec is already covered by the existing **Third-party sandboxing** bullet (no per-kind addition needed).

## Verification

- `pnpm check` clean across packages.
- `pnpm test` — every test passes; new tests cover register + execute end-to-end.
- `pnpm lint` clean.
- `pnpm dev` — the app should still render exactly as before (no visible UI change from A2 alone). Confirm no console errors. Optionally, in the dev console: `await registry.executeCommand?.('gcscode.example.greet')` should resolve to `'Hello from gcscode.example'` — but this requires exposing the registry on `window` for debugging, which is out of scope.

## Follow-ups (out of scope for A2)

- **A3 — keybinding contribution.** Adds a kind that references a command id by string. First UI-trigger that makes commands user-visible.
- **A3 — wire status bar item to fire a command.** Either via a new `command?: string` field on `StatusBarItemContribution` or by letting the component call `host.executeCommand` itself.
- **Command palette UI.** Layered on top of `listCommands()` plus a manifest contribution for titles. Likely after A3.
- **`when` clauses.** Visibility / enablement; needs an expression evaluator.
- **Built-in / shell commands.** When the shell exposes actions ("open settings"), it registers commands too — gives commands a host-side registration path.
- **Cancellation tokens.** When any command actually needs to be cancellable.

## Cross-cutting notes

**Registrar duplication.** A2 is the first iteration where three contribution kinds coexist. If the three `register*` blocks in `registry.ts` end up line-for-line identical except for the noun (`view` / `item` / `command`), that is the signal — flagged in earlier reviews — to consider extracting a `makeRegistrar<T>` helper. **Decide during the implementation review, not during planning.** YAGNI loses to symmetry only after we see the third copy and judge it.

**Non-goal propagation as a planning convention.** A1's final review caught two stale "today: one register\* method" claims in `docs/out-of-scope.md` because the deferrals listed in the A1 spec's non-goals were not propagated when A1 shipped. This spec's `docs/out-of-scope.md propagation` section is the corrective: every cross-cutting non-goal becomes a bullet (or update) in the canonical deferral list when the iteration lands. The CLAUDE.md update in A2 also captures this rule for future planning sessions.
