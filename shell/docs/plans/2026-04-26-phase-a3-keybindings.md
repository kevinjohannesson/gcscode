# Phase A3 — Keybinding contribution implementation plan

_Note: The term "plugin" was renamed to "extension" in [ADR-0004](../decisions/ADR-0004-rename-plugin-to-extension.md). This document records the original terminology._

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth contribution kind (keybindings) to the gcscode plugin architecture: plugins contribute `{ key, command }` and a shell-level keyboard dispatcher fires the matching command when the user presses the combo. Adds `registry.executeCommand` as a host-side mirror of `host.executeCommand` (one shared internal helper) so the dispatcher — which is shell-core code, not a plugin — can fire commands.

**Architecture:** Mirror the existing view / status-bar / command machinery for the registration side (Map keyed by `key`-string instead of `id`-string, throw on duplicate, identity-checked dispose, insertion-order list). Refactor the existing `executeCommand` body into a shared `execute<T>(id, args, attribution)` helper used by both `host.executeCommand` (attribution = `plugin "<id>"`) and the new `registry.executeCommand` (attribution = `host`). New `keybinding-dispatcher.ts` module with three exported pieces: `parseKey`, `matchesKey`, `attachKeybindingDispatcher(registry, target): Disposable`. The dispatcher is wired in `main.ts` and listens for `keydown` on `document`; first registered match wins.

**Tech Stack:** TypeScript, Svelte 5 (no UI changes here; A3 has no visible surface beyond a `console.log` from the example plugin's `run`), Vitest (jsdom), pnpm workspaces.

**Spec:** `docs/specs/2026-04-26-phase-a3-keybindings.md`

**ADRs to be aware of:** ADR-0001 (workspace boundary), ADR-0002 (imperative activate API), ADR-0003 (Disposable + PluginContext + identity + per-kind methods).

---

## File structure

| Path                                                | Responsibility                                                                                                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/plugin-api/src/index.ts`                  | Add `KeybindingContribution` type; extend `PluginHost` with `registerKeybinding` (Task 2).                                                                               |
| `packages/shell/src/plugin-host/registry.ts`        | Add `keybindings` Map, `registerKeybinding` host method, `listKeybindings` Registry method (Task 2); extract `execute()` helper, add `registry.executeCommand` (Task 3). |
| `packages/shell/src/plugin-host/registry.test.ts`   | Register-side keybinding tests (Task 2); registry-side `executeCommand` tests (Task 3).                                                                                  |
| `packages/shell/src/keybinding-dispatcher.ts`       | NEW — `parseKey`, `matchesKey`, `attachKeybindingDispatcher` (Task 4).                                                                                                   |
| `packages/shell/src/keybinding-dispatcher.test.ts`  | NEW — parser, matcher, dispatcher tests (Task 4).                                                                                                                        |
| `packages/shell/src/main.ts`                        | Wire `attachKeybindingDispatcher(registry, document)` after activation (Task 4).                                                                                         |
| `packages/plugin-example/src/index.ts`              | Register the keybinding (`Alt+Shift+G` → `gcscode.example.greet`); greet's `run` gains a `console.log` (Task 5).                                                         |
| `packages/plugin-example/src/index.test.ts`         | Stub mock for new methods in Tasks 2, 3, and 4 (minimal type-keepalive); contract test rewritten in Task 5.                                                              |
| `packages/plugin-api/README.md`                     | Update Usage snippet + activation-context bullet (Task 6).                                                                                                               |
| `packages/plugin-example/README.md`                 | Update "What it demonstrates" + "Anatomy" (Task 6).                                                                                                                      |
| `packages/shell/README.md`                          | Mention dispatcher + `listKeybindings()` (Task 6).                                                                                                                       |
| `docs/out-of-scope.md`                              | Propagate A3 cross-cutting non-goals (Task 7).                                                                                                                           |
| `docs/decisions/ADR-0003-plugin-api-refinements.md` | Update Phase A retrospective bullet to include A3 (Task 7).                                                                                                              |

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree on a feature branch**

Run: `git status && git branch --show-current`
Expected: `nothing to commit, working tree clean`. Branch is `feat/phase-a3-keybindings` (the controlling agent created it before dispatching). If branch is `master`, stop and ask the controller.

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 34 tests pass (31 in `@gcscode/shell`, 3 in `@gcscode/plugin-example`).

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

---

### Task 2: Add `KeybindingContribution` and the registry register surface (TDD)

**Files:**

- Modify: `packages/plugin-api/src/index.ts`
- Modify: `packages/shell/src/plugin-host/registry.ts`
- Modify: `packages/shell/src/plugin-host/registry.test.ts`
- Modify: `packages/plugin-example/src/index.test.ts` (minimal type-keepalive stub)

- [ ] **Step 1: Write the failing register-side tests in `registry.test.ts`**

Append the following inside the existing `describe('createRegistry', () => { ... })` block, just before the closing `});`. Reuse the existing `plugin(...)` helper.

```ts
it('starts with no keybindings', () => {
  const registry = createRegistry();
  expect(registry.listKeybindings()).toHaveLength(0);
});

it('records keybindings registered through host.registerKeybinding', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'plugin.a.cmd' });
    }),
  );
  expect(registry.listKeybindings()).toEqual([{ key: 'Ctrl+Shift+G', command: 'plugin.a.cmd' }]);
});

it('returns a disposable from registerKeybinding that removes the keybinding', () => {
  const registry = createRegistry();
  let disposable: Disposable | undefined;
  registry.activate(
    plugin('plugin.a', (ctx) => {
      disposable = ctx.host.registerKeybinding({
        key: 'Ctrl+Shift+G',
        command: 'plugin.a.cmd',
      });
    }),
  );
  expect(registry.listKeybindings()).toHaveLength(1);
  disposable!.dispose();
  expect(registry.listKeybindings()).toHaveLength(0);
});

it('disposable.dispose() is idempotent for keybindings', () => {
  const registry = createRegistry();
  let disposable: Disposable | undefined;
  registry.activate(
    plugin('plugin.a', (ctx) => {
      disposable = ctx.host.registerKeybinding({
        key: 'Ctrl+Shift+G',
        command: 'plugin.a.cmd',
      });
    }),
  );
  disposable!.dispose();
  expect(() => disposable!.dispose()).not.toThrow();
  expect(registry.listKeybindings()).toHaveLength(0);
});

it('throws when two plugins register the same keybinding key', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'plugin.a.cmd' });
    }),
  );
  expect(() =>
    registry.activate(
      plugin('plugin.b', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'plugin.b.cmd' });
      }),
    ),
  ).toThrow(/Ctrl\+Shift\+G.*plugin\.b/);
});

it('preserves registration order in listKeybindings', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerKeybinding({ key: 'Ctrl+A', command: 'plugin.a.first' });
      ctx.host.registerKeybinding({ key: 'Ctrl+B', command: 'plugin.a.second' });
    }),
  );
  expect(registry.listKeybindings().map((k) => k.key)).toEqual(['Ctrl+A', 'Ctrl+B']);
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm --filter @gcscode/shell test`
Expected: TypeScript errors. `Property 'registerKeybinding' does not exist on type 'PluginHost'`. `Property 'listKeybindings' does not exist on type 'Registry'`. The runner does not start.

- [ ] **Step 3: Add `KeybindingContribution` and `registerKeybinding` to `@gcscode/plugin-api`**

In `packages/plugin-api/src/index.ts`, after the `CommandContribution` interface, insert:

```ts
/**
 * A keybinding contribution maps a key combo (e.g. 'Ctrl+Shift+G') to a
 * registered command id. Modifiers are 'Ctrl', 'Shift', 'Alt', 'Meta'
 * (case-insensitive at match time); the key portion is also case-insensitive.
 * One non-modifier key per binding. The shell's keyboard dispatcher fires
 * the referenced command on first match. The `command` field is resolved at
 * fire time, not at registration — cross-plugin command references are
 * intentional.
 */
export interface KeybindingContribution {
  key: string;
  command: string;
}
```

Then update the `PluginHost` interface to add `registerKeybinding` after `registerCommand`. Do NOT touch `executeCommand` — that gets reused as-is.

```ts
export interface PluginHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  registerKeybinding(keybinding: KeybindingContribution): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}
```

- [ ] **Step 4: Implement `registerKeybinding` and `listKeybindings` in the registry**

In `packages/shell/src/plugin-host/registry.ts`:

Update the imports from `@gcscode/plugin-api` to also pull in `KeybindingContribution`:

```ts
import type {
  CommandContribution,
  Disposable,
  KeybindingContribution,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/plugin-api';
```

Update the `Registry` interface to include `listKeybindings`:

```ts
export interface Registry {
  activate(plugin: Plugin): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
}
```

Inside `createRegistry`, add a parallel store next to the existing three:

```ts
const keybindings = new Map<string, KeybindingContribution>();
```

Inside the `createHost(plugin)` factory, add `registerKeybinding` after `registerCommand`. Mirror the existing structure. Note the Map is keyed by `keybinding.key` (not by `id` — keybindings have no separate identity field):

```ts
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

In the returned registry object, add `listKeybindings` after `listCommands`:

```ts
    listKeybindings() {
      return Array.from(keybindings.values());
    },
```

The existing `subscriptionsByPlugin` map and the existing `executeCommand` body stay untouched (Task 3 will refactor `executeCommand`).

- [ ] **Step 5: Patch the plugin-example mock to keep types green**

In `packages/plugin-example/src/index.test.ts`, the inline host literal in the second test no longer satisfies the widened `PluginHost` interface. Add a one-line stub for `registerKeybinding` after the `registerCommand` declaration, and include it in the host literal.

Add this line after `const registerCommand = vi.fn().mockReturnValue(commandDisposable);`:

```ts
const registerKeybinding = vi.fn().mockReturnValue({ dispose: vi.fn() });
```

And update the inline host literal from:

```ts
      host: { registerView, registerStatusBarItem, registerCommand, executeCommand },
```

to:

```ts
      host: { registerView, registerStatusBarItem, registerCommand, executeCommand, registerKeybinding },
```

The third test (`'the greet command returns the expected greeting'`) does the same — find the same construction there and add the stub the same way. **Do NOT change any assertions** in either test — Task 5 will rewrite this file wholesale.

- [ ] **Step 6: Run tests, expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: 37 tests pass (31 prior + 6 new register-side keybinding tests). Plus `pnpm --filter @gcscode/plugin-example test` should still report 3 pass.

- [ ] **Step 7: Run check across the workspace**

Run: `pnpm check`
Expected: clean across all three packages.

- [ ] **Step 8: Run lint and format**

Run: `pnpm lint`
Expected: clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 9: Commit**

```bash
git add packages/plugin-api/src/index.ts packages/shell/src/plugin-host/registry.ts packages/shell/src/plugin-host/registry.test.ts packages/plugin-example/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(plugins): add KeybindingContribution and registerKeybinding

Parallel to registerView, registerStatusBarItem, and registerCommand:
a per-kind register* method on PluginHost that returns a Disposable,
with a Map-backed registry — but keyed by the keybinding's `key`
string, not by an `id` field, since the key combo is the keybinding's
identity. Duplicate keys throw; dispose() is idempotent.

The keyboard dispatcher and registry.executeCommand mirror follow in
later commits (Tasks 3 and 4 of the plan).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add `registry.executeCommand` mirror + extract `execute()` helper (TDD)

**Files:**

- Modify: `packages/shell/src/plugin-host/registry.ts`
- Modify: `packages/shell/src/plugin-host/registry.test.ts`

This task adds `executeCommand` to the public `Registry` interface as a host-side mirror of `host.executeCommand`, and refactors the existing `executeCommand` body into a shared `execute<T>(id, args, attribution)` helper used by both call sites. The host-side error message is byte-for-byte preserved (`(attempted by plugin "<id>")`); the registry-side error message uses `(attempted by host)`.

- [ ] **Step 1: Write failing tests for `registry.executeCommand` in `registry.test.ts`**

Append the following inside the existing `describe('createRegistry', () => { ... })` block, just before the closing `});`:

```ts
it('registry.executeCommand resolves with the run return value', async () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({
        id: 'plugin.a.greet',
        run: () => 'hello',
      });
    }),
  );

  await expect(registry.executeCommand('plugin.a.greet')).resolves.toBe('hello');
});

it('registry.executeCommand threads variadic args through to run', async () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({
        id: 'plugin.a.add',
        run: (...args) => (args[0] as number) + (args[1] as number),
      });
    }),
  );

  await expect(registry.executeCommand('plugin.a.add', 2, 3)).resolves.toBe(5);
});

it('registry.executeCommand throws synchronously when the id is not registered (attribution: host)', () => {
  const registry = createRegistry();
  expect(() => registry.executeCommand('does-not-exist')).toThrow(/does-not-exist.*host/);
});

it('registry.executeCommand surfaces sync throws inside run as rejected Promises', async () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({
        id: 'plugin.a.boom',
        run: () => {
          throw new Error('boom');
        },
      });
    }),
  );

  await expect(registry.executeCommand('plugin.a.boom')).rejects.toThrow(/boom/);
});

it('registry.executeCommand passes async rejections from run through unchanged', async () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({
        id: 'plugin.a.async-boom',
        run: () => Promise.reject(new Error('async-boom')),
      });
    }),
  );

  await expect(registry.executeCommand('plugin.a.async-boom')).rejects.toThrow(/async-boom/);
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm --filter @gcscode/shell test`
Expected: TypeScript error — `Property 'executeCommand' does not exist on type 'Registry'`. The runner does not start.

- [ ] **Step 3: Refactor the existing `executeCommand` body into a shared `execute()` helper and add `registry.executeCommand`**

In `packages/shell/src/plugin-host/registry.ts`:

Update the `Registry` interface to include `executeCommand`:

```ts
export interface Registry {
  activate(plugin: Plugin): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
  listKeybindings(): readonly KeybindingContribution[];
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}
```

Inside `createRegistry`, add a top-level (closure-scoped) `execute` helper above the `createHost` function. It captures the `commands` Map.

```ts
function execute<T>(id: string, args: unknown[], attribution: string): Promise<T> {
  const command = commands.get(id);
  if (command === undefined) {
    throw new Error(`Command id "${id}" is not registered (attempted by ${attribution}).`);
  }
  return Promise.resolve().then(() => command.run(...args)) as Promise<T>;
}
```

Then replace the existing `executeCommand` body inside `createHost(plugin)` with a one-liner that calls the helper:

```ts
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        return execute<T>(id, args, `plugin "${plugin.id}"`);
      },
```

And add `executeCommand` to the returned registry object after `listKeybindings`:

```ts
    executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
      return execute<T>(id, args, 'host');
    },
```

The host-side error message is byte-for-byte preserved (`Command id "X" is not registered (attempted by plugin "Y").`); the only new error format is the registry-side `(attempted by host)`.

- [ ] **Step 4: Run the tests, expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: 42 tests pass (37 from after Task 2 + 5 new registry-side tests). The existing host-side tests (`'executeCommand throws synchronously when the id is not registered'` etc.) continue to assert `/does-not-exist.*plugin\.a/` and pass unchanged because the host attribution is preserved.

- [ ] **Step 5: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: clean. If Prettier complains, run `pnpm format` then re-run.

- [ ] **Step 6: Commit**

```bash
git add packages/shell/src/plugin-host/registry.ts packages/shell/src/plugin-host/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(plugins): add registry.executeCommand mirror + extract execute helper

Adds executeCommand<T>(id, ...args): Promise<T> to the public Registry
interface as a host-side mirror of host.executeCommand. Both call sites
share one internal execute() helper inside createRegistry; the only
difference is the error-attribution string ('plugin "<id>"' vs 'host').

The shared helper sets up Task 4 — the keyboard dispatcher (shell-core
code, not a plugin) needs registry.executeCommand to fire commands
without a plugin identity.

Existing host-side error message ('attempted by plugin "<id>"') is
byte-for-byte preserved; existing tests pass unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Keyboard dispatcher module + main.ts wiring (TDD)

**Files:**

- Create: `packages/shell/src/keybinding-dispatcher.ts`
- Create: `packages/shell/src/keybinding-dispatcher.test.ts`
- Modify: `packages/shell/src/main.ts`

- [ ] **Step 1: Write failing tests for `parseKey`, `matchesKey`, and `attachKeybindingDispatcher`**

Create `packages/shell/src/keybinding-dispatcher.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Plugin, PluginContext } from '@gcscode/plugin-api';

import { createRegistry } from './plugin-host/registry';
import { parseKey, matchesKey, attachKeybindingDispatcher } from './keybinding-dispatcher';

function plugin(id: string, activate: (context: PluginContext) => void): Plugin {
  return { id, displayName: id, version: '0.0.0', activate };
}

describe('parseKey', () => {
  it('parses a single key', () => {
    expect(parseKey('g')).toEqual({
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
      key: 'g',
    });
  });

  it('parses a single modifier + key', () => {
    expect(parseKey('Ctrl+G')).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      key: 'g',
    });
  });

  it('parses multiple modifiers + key', () => {
    expect(parseKey('Ctrl+Shift+Alt+Meta+G')).toEqual({
      ctrl: true,
      shift: true,
      alt: true,
      meta: true,
      key: 'g',
    });
  });

  it('is case-insensitive on modifiers and key', () => {
    expect(parseKey('CTRL+shift+G')).toEqual(parseKey('Ctrl+Shift+g'));
  });

  it('accepts Cmd and Command as aliases for Meta', () => {
    expect(parseKey('Cmd+G').meta).toBe(true);
    expect(parseKey('Command+G').meta).toBe(true);
  });

  it('accepts Control as an alias for Ctrl', () => {
    expect(parseKey('Control+G').ctrl).toBe(true);
  });

  it('throws on input with no non-modifier key', () => {
    expect(() => parseKey('Ctrl+Shift')).toThrow(/no non-modifier key/);
  });

  it('throws on input with multiple non-modifier keys', () => {
    expect(() => parseKey('g+h')).toThrow(/more than one non-modifier key/);
  });
});

describe('matchesKey', () => {
  function event(init: KeyboardEventInit): KeyboardEvent {
    return new KeyboardEvent('keydown', init);
  }

  it('returns true when modifiers and key match', () => {
    const parsed = parseKey('Ctrl+Shift+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true, shiftKey: true }), parsed)).toBe(true);
  });

  it('returns false when a modifier mismatches', () => {
    const parsed = parseKey('Ctrl+Shift+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true, shiftKey: false }), parsed)).toBe(false);
  });

  it('returns false when the key mismatches', () => {
    const parsed = parseKey('Ctrl+G');
    expect(matchesKey(event({ key: 'h', ctrlKey: true }), parsed)).toBe(false);
  });

  it('case-insensitive match on the key portion', () => {
    const parsed = parseKey('Ctrl+G');
    expect(matchesKey(event({ key: 'G', ctrlKey: true }), parsed)).toBe(true);
    expect(matchesKey(event({ key: 'g', ctrlKey: true }), parsed)).toBe(true);
  });
});

describe('attachKeybindingDispatcher', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('returns a Disposable whose dispose() removes the listener', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.cmd' });
      }),
    );

    const disposable = attachKeybindingDispatcher(registry, target);
    expect(typeof disposable.dispose).toBe('function');
    disposable.dispose();

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    expect(run).not.toHaveBeenCalled();
  });

  it('fires the command when a registered keybinding matches the keydown event', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, cancelable: true });
    target.dispatchEvent(event);
    await Promise.resolve(); // let the executeCommand microtask run

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('calls preventDefault on a matched event', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run: () => undefined });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    const event = new KeyboardEvent('keydown', { key: 'g', ctrlKey: true, cancelable: true });
    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('does nothing when no keybinding matches the keydown event', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const run = vi.fn();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.cmd', run });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.cmd' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true }));
    await Promise.resolve();

    expect(run).not.toHaveBeenCalled();
  });

  it('first registration with a matching key wins', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    const runFirst = vi.fn();
    const runSecond = vi.fn();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({ id: 'plugin.a.first', run: runFirst });
        ctx.host.registerCommand({ id: 'plugin.a.second', run: runSecond });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.first' });
        ctx.host.registerKeybinding({ key: 'Ctrl+H', command: 'plugin.a.second' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    await Promise.resolve();

    expect(runFirst).toHaveBeenCalledTimes(1);
    expect(runSecond).not.toHaveBeenCalled();
  });

  it('does not throw out of the keydown handler when the bound command is not registered (sync throw caught)', () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.does-not-exist' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    expect(() =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true })),
    ).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('logs and does not throw when the bound command rejects asynchronously', async () => {
    const registry = createRegistry();
    const target = document.createElement('div');
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerCommand({
          id: 'plugin.a.async-boom',
          run: () => Promise.reject(new Error('async-boom')),
        });
        ctx.host.registerKeybinding({ key: 'Ctrl+G', command: 'plugin.a.async-boom' });
      }),
    );
    attachKeybindingDispatcher(registry, target);

    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', ctrlKey: true }));
    await Promise.resolve();
    await Promise.resolve(); // let the rejection propagate through the catch

    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm --filter @gcscode/shell test`
Expected: TypeScript / module-not-found errors. `Cannot find module './keybinding-dispatcher'`. The runner does not start.

- [ ] **Step 3: Implement the dispatcher module**

Create `packages/shell/src/keybinding-dispatcher.ts`:

```ts
import type { Disposable } from '@gcscode/plugin-api';

import type { Registry } from './plugin-host/registry';

interface ParsedKey {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
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
          // Sync throw from registry.executeCommand (e.g. missing command id).
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

- [ ] **Step 4: Run the tests, expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: 56 tests pass (42 from after Task 3 + 14 new dispatcher tests — 8 parseKey, 4 matchesKey, 7 attachKeybindingDispatcher). The exact count may vary slightly with Vitest's reporting; the contract is that no test that previously passed now fails, and the new dispatcher suite is green.

- [ ] **Step 5: Wire the dispatcher in `main.ts`**

In `packages/shell/src/main.ts`, add the import and the wiring call. Replace the existing contents with:

```ts
import { mount } from 'svelte';

import { examplePlugin } from '@gcscode/plugin-example';

import './app.css';
import App from './app.svelte';
import { attachKeybindingDispatcher } from './keybinding-dispatcher';
import { createRegistry } from './plugin-host/registry';

const registry = createRegistry();
registry.activate(examplePlugin);

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry },
});
```

The dispatcher's returned `Disposable` is intentionally not retained — the listener lives for the page lifetime. When deactivate orchestration lands (Phase B), main.ts can hold the disposable and call dispose on teardown.

- [ ] **Step 6: Run check + lint + full test**

Run: `pnpm check && pnpm lint && pnpm test`
Expected: clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 7: Commit**

```bash
git add packages/shell/src/keybinding-dispatcher.ts packages/shell/src/keybinding-dispatcher.test.ts packages/shell/src/main.ts
git commit -m "$(cat <<'EOF'
feat(shell): keyboard dispatcher fires registered keybindings

Three exports in a new keybinding-dispatcher.ts module:
- parseKey(input): parse a 'Ctrl+Shift+G'-style string into a ParsedKey
  with case-insensitive modifiers and key. Cmd/Command alias to Meta;
  Control aliases to Ctrl. Throws on missing or duplicate non-modifier
  keys.
- matchesKey(event, parsed): match a KeyboardEvent against a ParsedKey
  (all four modifier flags must match; key compared case-insensitively).
- attachKeybindingDispatcher(registry, target): keydown listener that
  iterates listKeybindings(), fires registry.executeCommand on first
  match (with event.preventDefault), and catches both sync throws
  (missing command id) and Promise rejections via console.error.
  Returns a Disposable for future teardown paths.

Wired in main.ts via attachKeybindingDispatcher(registry, document)
after activation. The Disposable is intentionally not retained
(listener lives for the page lifetime); deactivate orchestration
lands in Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Grow `examplePlugin` to register a keybinding (TDD)

**Files:**

- Modify: `packages/plugin-example/src/index.ts`
- Modify: `packages/plugin-example/src/index.test.ts`

- [ ] **Step 1: Replace the contract test wholesale**

Replace the contents of `packages/plugin-example/src/index.test.ts` with:

```ts
import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@gcscode/plugin-api';

import { examplePlugin } from './index';
import ExampleView from './example-view.svelte';
import ExampleStatus from './example-status.svelte';

describe('examplePlugin', () => {
  it('declares stable identity metadata', () => {
    expect(examplePlugin.id).toBe('gcscode.example');
    expect(examplePlugin.displayName).toBe('Example Plugin');
    expect(typeof examplePlugin.version).toBe('string');
  });

  it('registers a view, a status bar item, a command, and a keybinding, pushing all four disposables', () => {
    const viewDisposable = { dispose: vi.fn() };
    const statusDisposable = { dispose: vi.fn() };
    const commandDisposable = { dispose: vi.fn() };
    const keybindingDisposable = { dispose: vi.fn() };
    const registerView = vi.fn().mockReturnValue(viewDisposable);
    const registerStatusBarItem = vi.fn().mockReturnValue(statusDisposable);
    const registerCommand = vi.fn().mockReturnValue(commandDisposable);
    const registerKeybinding = vi.fn().mockReturnValue(keybindingDisposable);
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const subscriptions: PluginContext['subscriptions'] = [];

    examplePlugin.activate({
      host: {
        registerView,
        registerStatusBarItem,
        registerCommand,
        registerKeybinding,
        executeCommand,
      },
      subscriptions,
      plugin: {
        id: examplePlugin.id,
        displayName: examplePlugin.displayName,
        version: examplePlugin.version,
      },
    });

    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.example.main',
      component: ExampleView,
    });
    expect(registerStatusBarItem).toHaveBeenCalledWith({
      id: 'gcscode.example.status',
      component: ExampleStatus,
      alignment: 'right',
    });
    expect(registerCommand).toHaveBeenCalledWith({
      id: 'gcscode.example.greet',
      run: expect.any(Function),
    });
    expect(registerKeybinding).toHaveBeenCalledWith({
      key: 'Alt+Shift+G',
      command: 'gcscode.example.greet',
    });
    expect(subscriptions).toEqual([
      viewDisposable,
      statusDisposable,
      commandDisposable,
      keybindingDisposable,
    ]);
  });

  it('the greet command returns the expected greeting and logs it', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const registerView = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerStatusBarItem = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerCommand = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerKeybinding = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    examplePlugin.activate({
      host: {
        registerView,
        registerStatusBarItem,
        registerCommand,
        registerKeybinding,
        executeCommand,
      },
      subscriptions: [],
      plugin: {
        id: examplePlugin.id,
        displayName: examplePlugin.displayName,
        version: examplePlugin.version,
      },
    });

    const greetContribution = registerCommand.mock.calls[0][0];
    expect(greetContribution.run()).toBe('Hello from gcscode.example');
    expect(consoleLogSpy).toHaveBeenCalledWith('Hello from gcscode.example');

    consoleLogSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter @gcscode/plugin-example test`
Expected: failures on the second and third tests — `registerKeybinding` is not called because `examplePlugin` doesn't yet register one, and the greet command's `run` doesn't yet call `console.log`.

- [ ] **Step 3: Update `examplePlugin` to register the keybinding and have greet log**

Replace the contents of `packages/plugin-example/src/index.ts` with:

```ts
import type { Plugin } from '@gcscode/plugin-api';

import ExampleStatus from './example-status.svelte';
import ExampleView from './example-view.svelte';

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
  },
};
```

- [ ] **Step 4: Run the test, expect pass**

Run: `pnpm --filter @gcscode/plugin-example test`
Expected: 3 tests pass.

- [ ] **Step 5: Run the full workspace test + check + lint**

Run: `pnpm test && pnpm check && pnpm lint`
Expected: full suite green; check + lint clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-example/src/index.ts packages/plugin-example/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(plugin-example): register an Alt+Shift+G keybinding for greet

examplePlugin now contributes view + status bar item + command +
keybinding, pushing all four disposables onto context.subscriptions.
The Alt+Shift+G combo fires gcscode.example.greet via the shell's
keyboard dispatcher (wired in Task 4). The greet command's run gains a
console.log so pressing the combo produces visible dev-tools feedback
in addition to the existing return value.

Alt+Shift+G is chosen for low conflict with browser default shortcuts;
the dispatcher calls preventDefault on match anyway, but the example
combo avoids accidental hits during typing.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Update plugin-author docs (READMEs)

**Files:**

- Modify: `packages/plugin-api/README.md`
- Modify: `packages/plugin-example/README.md`
- Modify: `packages/shell/README.md`

- [ ] **Step 1: Update the Usage snippet in `packages/plugin-api/README.md`**

Replace the existing Usage code block (the fenced ` ```ts ... ``` ` block under `## Usage`) with:

````md
```ts
import type { Plugin } from '@gcscode/plugin-api';
import View from './view.svelte';
import StatusBadge from './status-badge.svelte';

export const myPlugin: Plugin = {
  id: 'my-namespace.my-plugin',
  displayName: 'My Plugin',
  version: '0.0.0',
  activate(context) {
    context.subscriptions.push(
      context.host.registerView({
        id: 'my-namespace.my-plugin.main',
        component: View,
      }),
      context.host.registerStatusBarItem({
        id: 'my-namespace.my-plugin.status',
        component: StatusBadge,
        alignment: 'right',
      }),
      context.host.registerCommand({
        id: 'my-namespace.my-plugin.greet',
        run: () => 'Hello',
      }),
      context.host.registerKeybinding({
        key: 'Alt+Shift+G',
        command: 'my-namespace.my-plugin.greet',
      }),
    );

    // Commands can be invoked by id from anywhere on the host:
    //   context.host.executeCommand('my-namespace.my-plugin.greet')
    // — or fired by a registered keybinding when the user presses Alt+Shift+G.
  },
};
```
````

- [ ] **Step 2: Update the activation-context bullet in `packages/plugin-api/README.md`**

Replace the existing `**\`context.host\`\*\*`bullet under`## The activation context` with:

```md
- **`context.host`** — the per-plugin gate. Exposes one `register*` method per contribution kind (today: `registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) plus the verb `executeCommand<T>(id, ...args): Promise<T>` for firing any registered command by id. Each `register*` call returns a `Disposable`. The `run` callback on a command is variadic (`(...args: unknown[]) => unknown`); arguments threaded through `executeCommand(id, ...args)` arrive there. The shell's keyboard dispatcher fires keybindings by calling `executeCommand` from the host side directly (it isn't a plugin), via the same shared implementation.
```

- [ ] **Step 3: Update `packages/plugin-example/README.md`**

Replace the `## What it demonstrates` and `## Anatomy` sections with the block below:

````md
## What it demonstrates

- A plugin lives in its own workspace package.
- Its only dependency on the host app is `@gcscode/plugin-api`.
- It exports a named `const` (`examplePlugin`) of type `Plugin` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
- Inside `activate`, it calls `context.host.registerView`, `context.host.registerStatusBarItem`, `context.host.registerCommand`, and `context.host.registerKeybinding`, then pushes all four returned `Disposable`s onto `context.subscriptions` — demonstrating multi-surface contributions from a single plugin and showing how a command (called by id from elsewhere; the integration backbone for future palette / menu contributions) sits alongside UI contributions, with a keybinding wiring a key combo to fire the command.

## Anatomy

```
src/
  index.ts              - exports examplePlugin: Plugin (identity + activate(context))
  example-view.svelte   - the contributed main-content fragment
  example-status.svelte - the contributed status bar fragment
```

The plugin contributes one of each kind:

- a view (`gcscode.example.main`),
- a status bar item (`gcscode.example.status`, right-aligned),
- a command (`gcscode.example.greet`, returns the fixed greeting `'Hello from gcscode.example'` and `console.log`s it),
- a keybinding (`Alt+Shift+G` → `gcscode.example.greet`). Press the combo with dev tools open to see the greeting log.

To write your own plugin, copy this package, change the exported constant name (`examplePlugin` → `yourPlugin`) and identity fields, rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.
````

- [ ] **Step 4: Update `packages/shell/README.md`**

Replace the third bullet under `## How the pieces fit` (the one starting `- \`src/app.svelte\``) with:

```md
- `src/app.svelte` — reads `registry.listViews()` and `registry.listStatusBarItems()` via `$derived`, renders the view contributions in the content section, and renders the status bar items in a footer with two derived left/right groups. Shows an empty-state when no views are registered. Commands and keybindings are not rendered by `app.svelte` — commands are called by id via `host.executeCommand` (or `registry.executeCommand` from shell-core code), and keybindings are dispatched by `src/keybinding-dispatcher.ts`. `registry.listCommands()` and `registry.listKeybindings()` exist for future palette / introspection consumers.
```

Then add a new bullet at the end of the same `## How the pieces fit` list (after the existing `src/app.svelte` bullet):

```md
- `src/keybinding-dispatcher.ts` — `attachKeybindingDispatcher(registry, target)` listens for `keydown` events on `target` (typically `document`), iterates `registry.listKeybindings()`, and fires the matched command via `registry.executeCommand`. Returns a `Disposable` for teardown. Wired from `main.ts` after plugin activation.
```

- [ ] **Step 5: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-api/README.md packages/plugin-example/README.md packages/shell/README.md
git commit -m "$(cat <<'EOF'
docs: refresh plugin READMEs to show registerKeybinding

The @gcscode/plugin-api Usage snippet, activation-context bullet, and
plugin-example "What it demonstrates" + "Anatomy" all mention the
fourth contribution kind. The shell README clarifies that commands
and keybindings aren't rendered (they're dispatched), and adds a new
bullet describing keybinding-dispatcher.ts.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Propagate non-goals to `docs/out-of-scope.md` and refresh ADR-0003 Phase A retrospective

**Files:**

- Modify: `docs/out-of-scope.md`
- Modify: `docs/decisions/ADR-0003-plugin-api-refinements.md`

- [ ] **Step 1: Update the existing "Additional contribution kinds" bullet in `docs/out-of-scope.md`**

Find the bullet that currently reads:

```md
- **Additional contribution kinds beyond views, status bar items, and commands.** Today: three `register*` methods on `PluginHost` (`registerView`, `registerStatusBarItem`, `registerCommand`) plus the verb `executeCommand`. Add another (e.g. `registerKeybinding`, `registerMenuItem`) when there is a real consumer; do not pre-declare surfaces that have no contributor.
```

Replace it with:

```md
- **Additional contribution kinds beyond views, status bar items, commands, and keybindings.** Today: four `register*` methods on `PluginHost` (`registerView`, `registerStatusBarItem`, `registerCommand`, `registerKeybinding`) plus the verb `executeCommand`. Add another (e.g. `registerMenuItem`, `registerPaletteEntry`) when there is a real consumer; do not pre-declare surfaces that have no contributor.
```

- [ ] **Step 2: Update the existing "Event bus, settings, themes, i18n" bullet in `docs/out-of-scope.md`**

Find the bullet that currently reads:

```md
- **Event bus, settings, themes, i18n.** Plugins have four verbs today: `host.registerView`, `host.registerStatusBarItem`, `host.registerCommand`, and `host.executeCommand`. The remaining items are deferred until there is a real consumer (e.g. settings UI, theme switcher, command-fired event, localized string lookup).
```

Replace with:

```md
- **Event bus, settings, themes, i18n.** Plugins have five verbs today: `host.registerView`, `host.registerStatusBarItem`, `host.registerCommand`, `host.registerKeybinding`, and `host.executeCommand`. The remaining items are deferred until there is a real consumer (e.g. settings UI, theme switcher, command-fired event, localized string lookup).
```

- [ ] **Step 3: Add four new bullets at the end of the "Plugin machinery" section of `docs/out-of-scope.md`**

Find the bullet about "Versioning, dependency resolution, peer-compat checks." Insert the four bullets below immediately BEFORE that bullet (so they land in Plugin machinery, not Tooling/process):

```md
- **Sequential / chord keybindings.** No support for `Ctrl+K Ctrl+S`-style two-step keybindings; one combo per registration. _Trigger to revisit:_ a real consumer wants chord shortcuts (typically a settings/file palette).
- **User-overridable keybindings.** No `keybindings.json`-equivalent override file or settings UI. Plugin-registered keybindings are the only source. _Trigger to revisit:_ users complain about plugin keybinding conflicts, or a settings system lands.
- **Cross-platform key aliasing (`Mod`, `mac:` overlay).** Literal `Ctrl` / `Cmd` only; no automatic platform mapping. _Trigger to revisit:_ first concrete Mac usage of the app.
- **Focus-aware keybinding suppression.** No mechanism to disable a keybinding while a text input is focused, a modal is open, or a `when` condition is false. _Trigger to revisit:_ first text input or modal where the dispatcher's keydown interception causes user-visible bugs.
```

- [ ] **Step 4: Refresh ADR-0003's Phase A retrospective bullet**

In `docs/decisions/ADR-0003-plugin-api-refinements.md`, find the bullet under `## Follow-ups`:

```md
- Phase A (in flight): adding more `register*` methods, one kind at a time. A1 added `registerStatusBarItem` (`docs/specs/2026-04-26-phase-a1-status-bar.md`); A2 adds `registerCommand` plus the verb `executeCommand` (`docs/specs/2026-04-26-phase-a2-commands.md`). Continue this pattern for future kinds; revisit naming conventions if the host surface starts to feel crowded (see also the Phase C bullet below on namespacing).
```

Replace it with:

```md
- Phase A (in flight): adding more `register*` methods, one kind at a time. A1 added `registerStatusBarItem` (`docs/specs/2026-04-26-phase-a1-status-bar.md`); A2 added `registerCommand` plus the verb `executeCommand` (`docs/specs/2026-04-26-phase-a2-commands.md`); A3 adds `registerKeybinding` plus the host-side `registry.executeCommand` mirror and a shell keyboard dispatcher (`docs/specs/2026-04-26-phase-a3-keybindings.md`). Continue this pattern for future kinds; revisit naming conventions if the host surface starts to feel crowded (see also the Phase C bullet below on namespacing).
```

Leave the Phase B and Phase C follow-up bullets unchanged — still accurate.

- [ ] **Step 5: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add docs/out-of-scope.md docs/decisions/ADR-0003-plugin-api-refinements.md
git commit -m "$(cat <<'EOF'
docs: propagate A3 non-goals + refresh ADR-0003 Phase A retrospective

docs/out-of-scope.md:
- Update the "Additional contribution kinds" bullet to acknowledge
  keybindings shipped (four register* methods now).
- Update the "Event bus, settings, themes, i18n" bullet to update the
  verbs-today list to five.
- Add four new bullets: sequential / chord keybindings, user-overridable
  keybindings, cross-platform key aliasing (Mod / mac: overlay), and
  focus-aware keybinding suppression.

ADR-0003:
- Extend the Phase A retrospective Follow-ups bullet to mention A3
  alongside A1 and A2. Phase B and Phase C bullets unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. Sanity check: total tests grow by ~20 over A2's baseline (6 register-side keybinding + 5 registry executeCommand + ~14 dispatcher + 1 example log assertion = ~26 new). Exact count varies; the contract is no test that previously passed now fails.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev` (in the background)
Expected: Vite reports `Local: http://localhost:5173/`.

- [ ] **Step 3: Verify in a browser (or via chrome-devtools-mcp)**

Open `http://localhost:5173/` in a browser. With dev tools open, confirm:

- The header reads `GCScode`.
- The example view (`<h2>Example Plugin</h2>` + paragraph) renders in the content area.
- The status bar footer shows `Example` on the right side.
- No errors in the console.
- Press `Alt+Shift+G`. Confirm `Hello from gcscode.example` appears in the console.
- Pressing other key combos (e.g. `Alt+Shift+H`) does nothing and produces no console output.

If the browser is unavailable in the agent environment, fall back to the test suite as proof — `keybinding-dispatcher.test.ts` covers the dispatcher's behavior end-to-end with synthetic `KeyboardEvent`s.

- [ ] **Step 4: Stop the dev server**

Stop the background `pnpm dev` process.

- [ ] **Step 5: Confirm working tree clean and feature commits as expected**

Run: `git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. The branch should contain at least six new commits beyond master (one each from Tasks 2, 3, 4, 5, 6, 7) plus any review-followup commits the controller adds during the per-task review loop.

---

## Out of scope reminders

These are intentionally NOT part of A3 (see the spec):

- `args` field on `KeybindingContribution`.
- `when` clauses (already deferred).
- Sequential / chord keybindings.
- User-overridable keybindings.
- Cross-platform `Mod` alias / `mac:` overlay.
- Conflict resolution at fire time (we throw at registration).
- Built-in / shell-registered keybindings.
- Keybinding discoverability UI.
- Focus-aware keybinding suppression.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on registrar duplication

After Task 2, `registry.ts` will have **four** near-identical `register*` blocks (`view`, `statusBarItem`, `command`, `keybinding`). Three are keyed by `id`; the fourth (keybindings) is keyed by `key` — a small but real shape difference. The plan deliberately does NOT extract a `makeRegistrar<T>` helper.

The decision belongs in this branch's cross-cutting review (Task #N+1 in the controller's task list, after Task 8), not in this plan. Per the A2 cross-cutting reviewer's analysis: at three id-keyed copies the call was "wait for kind #4 to see if it fits a generic factory." Now the answer is partially yes (keybindings ARE an independent-store kind) and partially no (the identity field differs — `id` vs `key`).

The decision the cross-cutting reviewer should make: extract `makeRegistrar<T>(label, store, identityField, attribution)` taking the identity field name as a parameter, OR leave the four copies as-is. Either is defensible. **Do not pre-emptively extract during Tasks 1–8.**

The shared `execute()` helper in Task 3 is precedent that DRY of cross-cutting machinery is fine when the shape is uniform — so if the cross-cutting reviewer decides to extract for the registrars too, the precedent is set.
