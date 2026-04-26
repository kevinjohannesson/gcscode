# Phase A2 — Command contribution implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third contribution kind to the gcscode plugin architecture: `registerCommand` plus an `executeCommand` round-trip on `PluginHost`. Commands are the integration backbone for future kinds (keybindings, menu items, palette entries) which all reference commands by string id.

**Architecture:** Mirror the existing view / status-bar machinery for the registration side (id-keyed Map, throw on duplicate, identity-checked dispose, insertion-order list). Add one new shape — `executeCommand` — a verb that looks up a registered command by id, calls its `run(...args)`, and returns `Promise<T>`. Sync errors and async rejections both surface as rejected Promises via `Promise.resolve().then(...)` wrapping.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest, pnpm workspaces, Vite, Tailwind v4 (no UI changes in A2).

**Spec:** `docs/specs/2026-04-26-phase-a2-commands.md`

**ADRs to be aware of:** ADR-0001 (workspace boundary), ADR-0002 (imperative activate API), ADR-0003 (Disposable returns + PluginContext + identity metadata + per-kind methods).

---

## File structure

| Path                                              | Responsibility                                                                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `packages/plugin-api/src/index.ts`                | Add `CommandContribution` type; extend `PluginHost` with `registerCommand` (Task 2) and `executeCommand` (Task 3).                |
| `packages/shell/src/plugin-host/registry.ts`      | Add `commands` Map, `registerCommand` method on host, `listCommands` on Registry (Task 2); add `executeCommand` on host (Task 3). |
| `packages/shell/src/plugin-host/registry.test.ts` | Register-side tests in Task 2; execute round-trip tests in Task 3.                                                                |
| `packages/plugin-example/src/index.ts`            | Register a third contribution (`gcscode.example.greet`) — Task 4.                                                                 |
| `packages/plugin-example/src/index.test.ts`       | Stub mock for new methods in Tasks 2 and 3 (minimal type-keepalive); contract test rewritten in Task 4.                           |
| `packages/plugin-api/README.md`                   | Update Usage snippet + activation-context bullet — Task 5.                                                                        |
| `packages/plugin-example/README.md`               | Update "What it demonstrates" + "Anatomy" — Task 5.                                                                               |
| `packages/shell/README.md`                        | Mention `listCommands()` in the listX summary — Task 5.                                                                           |
| `docs/out-of-scope.md`                            | Propagate A2 cross-cutting non-goals — Task 6.                                                                                    |
| `CLAUDE.md`                                       | Add "Planning conventions and long-term alignment" section — Task 6.                                                              |

---

### Task 1: Establish green baseline

**Files:** none

- [ ] **Step 1: Verify clean working tree**

Run: `git status`
Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Verify all tests pass before changes**

Run: `pnpm test`
Expected: 22 tests pass (20 in `@gcscode/shell`, 2 in `@gcscode/plugin-example`).

- [ ] **Step 3: Verify check + lint clean**

Run: `pnpm check && pnpm lint`
Expected: both exit 0 with no errors.

- [ ] **Step 4: Confirm we are on a feature branch (not master)**

Run: `git branch --show-current`
Expected: a feature branch name like `feat/phase-a2-commands` (the controlling agent will have created this before dispatching). If output is `master`, stop and ask the controller — implementation should not run on master without explicit consent.

---

### Task 2: Add `CommandContribution` and the registry register surface (TDD)

**Files:**

- Modify: `packages/plugin-api/src/index.ts`
- Modify: `packages/shell/src/plugin-host/registry.ts`
- Modify: `packages/shell/src/plugin-host/registry.test.ts`
- Modify: `packages/plugin-example/src/index.test.ts` (minimal type-keepalive stub)

- [ ] **Step 1: Write the failing register-side tests in `registry.test.ts`**

Append the following inside the existing `describe('createRegistry', () => { ... })` block, just before the closing `});`. Reuse the existing `plugin(...)` helper and `fakeComponent` defined at the top of the file — do NOT duplicate them.

```ts
it('starts with no commands', () => {
  const registry = createRegistry();
  expect(registry.listCommands()).toHaveLength(0);
});

it('records commands registered through host.registerCommand', () => {
  const registry = createRegistry();
  const run = () => undefined;
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({ id: 'plugin.a.cmd', run });
    }),
  );
  expect(registry.listCommands()).toEqual([{ id: 'plugin.a.cmd', run }]);
});

it('returns a disposable from registerCommand that removes the command', () => {
  const registry = createRegistry();
  let disposable: Disposable | undefined;
  registry.activate(
    plugin('plugin.a', (ctx) => {
      disposable = ctx.host.registerCommand({
        id: 'plugin.a.cmd',
        run: () => undefined,
      });
    }),
  );
  expect(registry.listCommands()).toHaveLength(1);
  disposable!.dispose();
  expect(registry.listCommands()).toHaveLength(0);
});

it('disposable.dispose() is idempotent for commands', () => {
  const registry = createRegistry();
  let disposable: Disposable | undefined;
  registry.activate(
    plugin('plugin.a', (ctx) => {
      disposable = ctx.host.registerCommand({
        id: 'plugin.a.cmd',
        run: () => undefined,
      });
    }),
  );
  disposable!.dispose();
  expect(() => disposable!.dispose()).not.toThrow();
  expect(registry.listCommands()).toHaveLength(0);
});

it('throws when two plugins register the same command id', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({ id: 'shared', run: () => undefined });
    }),
  );
  expect(() =>
    registry.activate(
      plugin('plugin.b', (ctx) => {
        ctx.host.registerCommand({ id: 'shared', run: () => undefined });
      }),
    ),
  ).toThrow(/shared.*plugin\.b/);
});

it('allows the same id across all three kinds (view, status bar, command)', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerView({ id: 'shared', component: fakeComponent });
      ctx.host.registerStatusBarItem({
        id: 'shared',
        component: fakeComponent,
        alignment: 'left',
      });
      ctx.host.registerCommand({ id: 'shared', run: () => undefined });
    }),
  );
  expect(registry.listViews()).toHaveLength(1);
  expect(registry.listStatusBarItems()).toHaveLength(1);
  expect(registry.listCommands()).toHaveLength(1);
});

it('preserves registration order in listCommands', () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({ id: 'plugin.a.first', run: () => undefined });
      ctx.host.registerCommand({ id: 'plugin.a.second', run: () => undefined });
    }),
  );
  expect(registry.listCommands().map((c) => c.id)).toEqual(['plugin.a.first', 'plugin.a.second']);
});
```

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm --filter @gcscode/shell test`
Expected: TypeScript errors. `Property 'registerCommand' does not exist on type 'PluginHost'`. `Property 'listCommands' does not exist on type 'Registry'`. The runner does not start.

- [ ] **Step 3: Add `CommandContribution` and `registerCommand` to `@gcscode/plugin-api`**

In `packages/plugin-api/src/index.ts`, after the `StatusBarItemContribution` interface, insert:

```ts
/**
 * A command contribution registers a callable handler under a stable string
 * id. Commands are the integration backbone for future kinds (keybindings,
 * menu items, palette entries) which reference commands by id rather than
 * carrying their own handlers. Cross-plugin execute is intentional — any
 * plugin can fire any registered command.
 */
export interface CommandContribution {
  id: string;
  run: (...args: unknown[]) => unknown;
}
```

Then update the `PluginHost` interface to add `registerCommand` after `registerStatusBarItem`. Do NOT add `executeCommand` yet — that lands in Task 3.

```ts
export interface PluginHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
}
```

Keep the existing JSDoc on `PluginHost`.

- [ ] **Step 4: Implement `registerCommand` and `listCommands` in the registry**

In `packages/shell/src/plugin-host/registry.ts`:

Update the imports from `@gcscode/plugin-api` to also pull in `CommandContribution`:

```ts
import type {
  CommandContribution,
  Disposable,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  StatusBarItemContribution,
  ViewContribution,
} from '@gcscode/plugin-api';
```

Update the `Registry` interface to include `listCommands`:

```ts
export interface Registry {
  activate(plugin: Plugin): void;
  listViews(): readonly ViewContribution[];
  listStatusBarItems(): readonly StatusBarItemContribution[];
  listCommands(): readonly CommandContribution[];
}
```

Inside `createRegistry`, add a parallel store next to `views` and `statusBarItems`:

```ts
const commands = new Map<string, CommandContribution>();
```

Inside the `createHost(plugin)` factory, add `registerCommand` after `registerStatusBarItem`. Mirror the existing structure precisely:

```ts
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
```

In the returned registry object, add `listCommands` after `listStatusBarItems`:

```ts
    listCommands() {
      return Array.from(commands.values());
    },
```

The existing `subscriptionsByPlugin` map should remain untouched.

- [ ] **Step 5: Patch the plugin-example mock to keep types green**

In `packages/plugin-example/src/index.test.ts`, the inline `host: { registerView, registerStatusBarItem }` object literal no longer satisfies the widened `PluginHost` interface. Add a one-line stub for `registerCommand` immediately after the `registerStatusBarItem` declaration in the `'registers a view, a status bar item, and pushes both disposables'` test. This is a temporary type-keepalive — Task 4 will replace this test wholesale.

Add this line after `const registerStatusBarItem = vi.fn().mockReturnValue(statusDisposable);`:

```ts
const registerCommand = vi.fn().mockReturnValue({ dispose: vi.fn() });
```

And update the inline host literal in the same test from:

```ts
      host: { registerView, registerStatusBarItem },
```

to:

```ts
      host: { registerView, registerStatusBarItem, registerCommand },
```

Do NOT change any assertions in that test — it will be wholesale replaced in Task 4.

- [ ] **Step 6: Run the tests, expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: 27 tests pass (20 existing + 7 new register tests). Plus `pnpm --filter @gcscode/plugin-example test` should still report 2 pass.

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
feat(plugins): add CommandContribution and registerCommand

Parallel to registerView and registerStatusBarItem: a per-kind register*
method on PluginHost that returns a Disposable, with a Map-backed
registry keyed by id. Duplicate ids throw; dispose() is idempotent and
removes only its own registration. View, status-bar-item, and command
ids live in three separate namespaces. listCommands() returns
insertion-ordered commands.

executeCommand follows in the next commit (Task 3 of the plan).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add `executeCommand` round-trip on `PluginHost` (TDD)

**Files:**

- Modify: `packages/plugin-api/src/index.ts`
- Modify: `packages/shell/src/plugin-host/registry.ts`
- Modify: `packages/shell/src/plugin-host/registry.test.ts`
- Modify: `packages/plugin-example/src/index.test.ts` (minimal type-keepalive stub)

- [ ] **Step 1: Write failing execute round-trip tests in `registry.test.ts`**

Append the following inside the existing `describe('createRegistry', () => { ... })` block, just before the closing `});`. Reuse the `plugin(...)` helper:

```ts
it('executeCommand resolves with the run return value', async () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({
        id: 'plugin.a.greet',
        run: () => 'hello',
      });
    }),
  );

  let executor: PluginHost | undefined;
  registry.activate(
    plugin('plugin.b', (ctx) => {
      executor = ctx.host;
    }),
  );

  await expect(executor!.executeCommand('plugin.a.greet')).resolves.toBe('hello');
});

it('executeCommand threads variadic args through to run', async () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({
        id: 'plugin.a.add',
        run: (...args) => (args[0] as number) + (args[1] as number),
      });
    }),
  );

  let executor: PluginHost | undefined;
  registry.activate(
    plugin('plugin.b', (ctx) => {
      executor = ctx.host;
    }),
  );

  await expect(executor!.executeCommand('plugin.a.add', 2, 3)).resolves.toBe(5);
});

it('executeCommand throws synchronously when the id is not registered', () => {
  const registry = createRegistry();
  let executor: PluginHost | undefined;
  registry.activate(
    plugin('plugin.a', (ctx) => {
      executor = ctx.host;
    }),
  );

  expect(() => executor!.executeCommand('does-not-exist')).toThrow(/does-not-exist.*plugin\.a/);
});

it('executeCommand surfaces sync throws inside run as rejected Promises', async () => {
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

  let executor: PluginHost | undefined;
  registry.activate(
    plugin('plugin.b', (ctx) => {
      executor = ctx.host;
    }),
  );

  await expect(executor!.executeCommand('plugin.a.boom')).rejects.toThrow(/boom/);
});

it('executeCommand passes async rejections from run through unchanged', async () => {
  const registry = createRegistry();
  registry.activate(
    plugin('plugin.a', (ctx) => {
      ctx.host.registerCommand({
        id: 'plugin.a.async-boom',
        run: () => Promise.reject(new Error('async-boom')),
      });
    }),
  );

  let executor: PluginHost | undefined;
  registry.activate(
    plugin('plugin.b', (ctx) => {
      executor = ctx.host;
    }),
  );

  await expect(executor!.executeCommand('plugin.a.async-boom')).rejects.toThrow(/async-boom/);
});
```

You will also need to add `PluginHost` to the existing import list at the top of `registry.test.ts`. Update the import block to include it:

```ts
import type {
  Disposable,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  ViewContribution,
} from '@gcscode/plugin-api';
```

- [ ] **Step 2: Run the tests, expect failures**

Run: `pnpm --filter @gcscode/shell test`
Expected: TypeScript error — `Property 'executeCommand' does not exist on type 'PluginHost'`. The runner does not start.

- [ ] **Step 3: Add `executeCommand` to the `PluginHost` interface in `@gcscode/plugin-api`**

In `packages/plugin-api/src/index.ts`, update the `PluginHost` interface to add `executeCommand` after `registerCommand`:

```ts
export interface PluginHost {
  registerView(view: ViewContribution): Disposable;
  registerStatusBarItem(item: StatusBarItemContribution): Disposable;
  registerCommand(command: CommandContribution): Disposable;
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
}
```

- [ ] **Step 4: Implement `executeCommand` on the registry's host**

In `packages/shell/src/plugin-host/registry.ts`, inside the `createHost(plugin)` factory, add `executeCommand` after `registerCommand`:

```ts
      executeCommand<T>(id: string, ...args: unknown[]): Promise<T> {
        const command = commands.get(id);
        if (command === undefined) {
          throw new Error(
            `Command id "${id}" is not registered (attempted by plugin "${plugin.id}").`,
          );
        }
        return Promise.resolve().then(() => command.run(...args)) as Promise<T>;
      },
```

The `as Promise<T>` cast bridges the implementation's `unknown` return to the caller-asserted `<T>`. Callers know what type to expect; the registry has no compile-time linkage between commands and callers. This matches VS Code's `Thenable<T>` convention.

The synchronous throw on missing id is intentional — it's a programmer error (definitional bug), not a runtime exception. Wrapping it in a Promise rejection would mask the bug.

- [ ] **Step 5: Patch the plugin-example mock to keep types green**

In `packages/plugin-example/src/index.test.ts`, the inline host literal added in Task 2 still doesn't include `executeCommand`. Add a one-line stub immediately after the `registerCommand` declaration in the same test:

```ts
const executeCommand = vi.fn().mockResolvedValue(undefined);
```

And update the inline host literal from:

```ts
      host: { registerView, registerStatusBarItem, registerCommand },
```

to:

```ts
      host: { registerView, registerStatusBarItem, registerCommand, executeCommand },
```

Do NOT change any assertions — Task 4 rewrites this test wholesale.

- [ ] **Step 6: Run the tests, expect pass**

Run: `pnpm --filter @gcscode/shell test`
Expected: 32 tests pass (27 from after Task 2 + 5 new execute tests).

- [ ] **Step 7: Run check + lint**

Run: `pnpm check && pnpm lint`
Expected: clean. If Prettier complains, run `pnpm format` then re-run.

- [ ] **Step 8: Commit**

```bash
git add packages/plugin-api/src/index.ts packages/shell/src/plugin-host/registry.ts packages/shell/src/plugin-host/registry.test.ts packages/plugin-example/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(plugins): add executeCommand round-trip on PluginHost

executeCommand<T>(id, ...args): Promise<T> looks up the registered
command, calls run(...args), and returns Promise<T> of the result.
Sync throws inside run become rejected Promises via
Promise.resolve().then(...) wrapping; async rejections pass through.
Missing id throws synchronously (programmer error, not runtime).

Cross-plugin execute is intentional — any plugin can fire any
registered command. Matches VS Code's commands-are-global model.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Grow `examplePlugin` to register a command (TDD)

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

  it('registers a view, a status bar item, and a command, pushing all three disposables', () => {
    const viewDisposable = { dispose: vi.fn() };
    const statusDisposable = { dispose: vi.fn() };
    const commandDisposable = { dispose: vi.fn() };
    const registerView = vi.fn().mockReturnValue(viewDisposable);
    const registerStatusBarItem = vi.fn().mockReturnValue(statusDisposable);
    const registerCommand = vi.fn().mockReturnValue(commandDisposable);
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const subscriptions: PluginContext['subscriptions'] = [];

    examplePlugin.activate({
      host: { registerView, registerStatusBarItem, registerCommand, executeCommand },
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
    expect(subscriptions).toEqual([viewDisposable, statusDisposable, commandDisposable]);
  });

  it('the greet command returns the expected greeting', () => {
    const registerView = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerStatusBarItem = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerCommand = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    examplePlugin.activate({
      host: { registerView, registerStatusBarItem, registerCommand, executeCommand },
      subscriptions: [],
      plugin: {
        id: examplePlugin.id,
        displayName: examplePlugin.displayName,
        version: examplePlugin.version,
      },
    });

    const greetContribution = registerCommand.mock.calls[0][0];
    expect(greetContribution.run()).toBe('Hello from gcscode.example');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `pnpm --filter @gcscode/plugin-example test`
Expected: failure on the second test — `registerCommand` is not called because `examplePlugin` doesn't yet register a command. The third test fails for the same reason (`mock.calls[0]` is undefined).

- [ ] **Step 3: Update `examplePlugin` to register the greet command**

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
        run: () => 'Hello from gcscode.example',
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
Expected: 32 shell + 3 plugin-example = 35 tests pass; check + lint clean. If Prettier complains, run `pnpm format` then re-run `pnpm lint`.

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-example/src/index.ts packages/plugin-example/src/index.test.ts
git commit -m "$(cat <<'EOF'
feat(plugin-example): register a greet command

examplePlugin now contributes view + status bar item + a command
(gcscode.example.greet) that returns the string 'Hello from
gcscode.example'. With no UI trigger in A2 the command has no
end-user effect; the contract test exercises it directly via the
captured registration. When A3 lands (palette / keybinding / menu),
this command becomes the first wirable target.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Update plugin-author docs (READMEs)

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
    );

    // Commands can be invoked by id from anywhere on the host:
    //   context.host.executeCommand('my-namespace.my-plugin.greet')
  },
};
```
````

- [ ] **Step 2: Update the activation-context bullet in `packages/plugin-api/README.md`**

Replace the existing `**\`context.host\`\*\*`bullet under`## The activation context` with:

```md
- **`context.host`** — the per-plugin gate. Exposes one `register*` method per UI contribution kind (today: `registerView`, `registerStatusBarItem`, `registerCommand`) plus the verb `executeCommand<T>(id, ...args): Promise<T>` for firing any registered command by id. Each `register*` call returns a `Disposable`.
```

- [ ] **Step 3: Update the duplicate-id Conventions bullet in `packages/plugin-api/README.md`**

The existing bullet says "view ids and status bar item ids" specifically. Generalize for the third kind. Replace:

```md
- Provide stable, namespaced ids: `<plugin-id>.<local-name>` (e.g. `gcscode.example.main`). Duplicate ids throw at registration (one id can be reused across contribution kinds — a view and a status bar item may share the same id).
```

with:

```md
- Provide stable, namespaced ids: `<plugin-id>.<local-name>` (e.g. `gcscode.example.main`). Duplicate ids throw at registration (one id can be reused across contribution kinds — a view, a status bar item, and a command may all share the same id).
```

- [ ] **Step 4: Update `packages/plugin-example/README.md`**

Replace the `## What it demonstrates` and `## Anatomy` sections with the block below:

````md
## What it demonstrates

- A plugin lives in its own workspace package.
- Its only dependency on the host app is `@gcscode/plugin-api`.
- It exports a named `const` (`examplePlugin`) of type `Plugin` carrying identity metadata (`id`, `displayName`, `version`) plus an `activate(context)` function.
- Inside `activate`, it calls `context.host.registerView`, `context.host.registerStatusBarItem`, and `context.host.registerCommand`, then pushes all three returned `Disposable`s onto `context.subscriptions` — demonstrating multi-surface contributions from a single plugin and showing how a command (the integration backbone) sits alongside UI contributions.

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
- a command (`gcscode.example.greet`, returns a fixed greeting string).

To write your own plugin, copy this package, change the exported constant name (`examplePlugin` → `yourPlugin`) and identity fields, rename the components, and adjust `package.json`'s name. That's it — no other ceremony is currently required.
````

- [ ] **Step 5: Update `packages/shell/README.md`**

Replace the third bullet under `## How the pieces fit` (the one starting `- \`src/app.svelte\``) with:

```md
- `src/app.svelte` — reads `registry.listViews()` and `registry.listStatusBarItems()` via `$derived`, renders the view contributions in the content section, and renders the status bar items in a footer with two derived left/right groups. Shows an empty-state when no views are registered. Commands are not rendered by `app.svelte` — they're called by id via `host.executeCommand`. `registry.listCommands()` exists for future palette / introspection consumers.
```

- [ ] **Step 6: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-api/README.md packages/plugin-example/README.md packages/shell/README.md
git commit -m "$(cat <<'EOF'
docs: refresh plugin READMEs to show registerCommand and executeCommand

The @gcscode/plugin-api Usage snippet, activation-context bullet, and
duplicate-id convention now mention all three contribution kinds. The
plugin-example description grows the third bullet and the kind list.
The shell README clarifies that commands are not rendered — they're
called by id.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Propagate non-goals to `docs/out-of-scope.md` and add planning conventions to `CLAUDE.md`

**Files:**

- Modify: `docs/out-of-scope.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the existing "Additional contribution kinds" bullet in `docs/out-of-scope.md`**

Find the bullet that currently reads:

```md
- **Additional contribution kinds beyond views and status bar items.** Today: two `register*` methods on `PluginHost` (`registerView`, `registerStatusBarItem`). Add another (`registerCommand`, etc.) when there is a real consumer; do not pre-declare surfaces that have no contributor.
```

Replace with:

```md
- **Additional contribution kinds beyond views, status bar items, and commands.** Today: three `register*` methods on `PluginHost` (`registerView`, `registerStatusBarItem`, `registerCommand`) plus the verb `executeCommand`. Add another (e.g. `registerKeybinding`, `registerMenuItem`) when there is a real consumer; do not pre-declare surfaces that have no contributor.
```

- [ ] **Step 2: Update the existing "Command system, event bus, …" bullet in `docs/out-of-scope.md`**

Find the bullet that currently reads:

```md
- **Command system, event bus, settings, themes, i18n.** Plugins have two verbs today: `host.registerView` and `host.registerStatusBarItem`.
```

Replace with:

```md
- **Event bus, settings, themes, i18n.** Plugins have four verbs today: `host.registerView`, `host.registerStatusBarItem`, `host.registerCommand`, and `host.executeCommand`. The remaining items are deferred until there is a real consumer (e.g. settings UI, theme switcher, command-fired event, localized string lookup).
```

- [ ] **Step 3: Update the existing "Declarative `contributes` manifest" bullet in `docs/out-of-scope.md`**

Find the bullet that currently reads:

```md
- **Declarative `contributes` manifest.** No statically-parseable list of contributions (commands, views, etc.) that the host can read without executing `activate()`. The TypeScript `Plugin` interface plus imperative `register*` calls are the contract. _Trigger to revisit:_ a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted plugin module. (ADR-0003)
```

Replace with:

```md
- **Declarative `contributes` manifest.** No statically-parseable list of contributions (commands, views, status bar items, etc.) that the host can read without executing `activate()`. The TypeScript `Plugin` interface plus imperative `register*` calls are the contract. The manifest would be where per-contribution metadata such as command titles, categories, icons, and descriptions eventually lives. _Trigger to revisit:_ a settings UI that toggles individual contributions, a marketplace preview, or the first untrusted plugin module. (ADR-0003)
```

- [ ] **Step 4: Add three new bullets at the end of the "Plugin machinery" section of `docs/out-of-scope.md`**

Find the bullet about "Versioning, dependency resolution, peer-compat checks." Insert the three bullets below immediately before that bullet:

```md
- **`when` clauses (visibility / enablement of contributions).** No expression evaluator or evaluation context for conditionally showing or enabling commands in menus, palette entries, or status bar items. _Trigger to revisit:_ the first menu / palette consumer that needs conditional visibility.
- **Built-in / shell-registered commands.** No host-side command registration today — the shell exposes no actions to plugins. _Trigger to revisit:_ the shell needs to expose a host-level capability (e.g. "open settings", "reload window") via the same command system plugins use.
- **Async cancellation tokens.** No `CancellationToken` (or equivalent) for long-running command callbacks or future async APIs. _Trigger to revisit:_ the first command (or future async kind) that takes long enough to be worth cancelling.
```

- [ ] **Step 5: Add the "Planning conventions and long-term alignment" section to `CLAUDE.md`**

Append a new section to `CLAUDE.md`. Add it after the existing `## Plugin shape` section and before the `## Commands` section. Insert:

```md
## Planning conventions and long-term alignment

### VS Code alignment (in spirit, not by byte)

GCScode mirrors VS Code's extension architecture in spirit, not by byte. Adopt VS Code's load-bearing patterns — disposables, activation contexts, named/disposable contributions, register-then-execute, commands as the integration backbone — but feel free to diverge on syntax/style/ergonomics when the local context warrants. Extension-code portability is **not** a goal.

During brainstorming and planning, surface every API divergence from VS Code as a labeled decision (with the trade-off articulated), not as a default. When picking a divergence, capture it in the spec or ADR explicitly. Specs should include a "VS Code alignment" section that lists what is aligned, what diverges (and why), and what is deferred.

### Non-goals propagate to `docs/out-of-scope.md`

When a spec lists cross-cutting deferrals — concepts the architecture is deliberately deferring, not just per-iteration scope cuts — those deferrals must land in `docs/out-of-scope.md` when the iteration ships, with an explicit trigger to revisit. Per-iteration scope omissions stay in the spec only; cross-cutting deferrals are the canonical list in `out-of-scope.md`.

The judgment: does this non-goal apply only to this iteration, or is it a deliberate "we're deferring this concept" decision affecting the whole architecture? Cross-cutting → propagate to `out-of-scope.md`. Specs should include a `docs/out-of-scope.md` propagation section listing the exact edits the iteration's docs commit will make.
```

- [ ] **Step 6: Format and lint**

Run: `pnpm format && pnpm lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add docs/out-of-scope.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: propagate A2 non-goals + add planning conventions to CLAUDE.md

docs/out-of-scope.md:
- Update the "Additional contribution kinds" bullet to acknowledge
  commands shipped (three register* methods now).
- Drop the "command system" prefix from the next bullet (commands
  shipped) and update the verb count to four.
- Mention concretely which manifest fields commands would gain in the
  declarative-contributes deferral.
- Add three new bullets: when clauses, built-in shell-registered
  commands, async cancellation tokens.

CLAUDE.md:
- New "Planning conventions and long-term alignment" section captures
  (a) the VS Code "in spirit, not by byte" rule and (b) the rule that
  cross-cutting non-goals must propagate to docs/out-of-scope.md when
  an iteration ships. Both rules are intended to survive across future
  planning sessions and prevent the doc rot caught at the end of A1.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: End-to-end verification

**Files:** none

- [ ] **Step 1: Run the full check suite**

Run: `pnpm check && pnpm test && pnpm lint`
Expected: all clean. After A2 the suite grows by 12 new shell-side tests (7 register + 5 execute) plus 1 new plugin-example test (the greet-returns-expected-string case). Sanity check from baseline: 20 shell + 2 plugin-example before A2 → 32 shell + 3 plugin-example after A2.

If the absolute counts above differ slightly from the actual output (e.g. an A1 follow-up landed an extra test), that's fine — the contract is "no test that previously passed now fails, no test fails."

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev` (in the background)
Expected: Vite reports `Local: http://localhost:5173/`.

- [ ] **Step 3: Verify in a browser (or via chrome-devtools-mcp)**

Open `http://localhost:5173/` in a browser. Confirm:

- The header reads `GCScode`.
- The example view (`<h2>Example Plugin</h2>` + paragraph) renders in the content area, exactly as before A2.
- The status bar footer is visible with the `Example` text on the right side, exactly as before A2.
- The browser console has no errors.

A2 introduces no visible UI change — the command has no UI trigger. The verification is "nothing regressed visually."

If the browser is unavailable in the agent environment, fall back to: `curl -s http://localhost:5173/` and confirm the HTML response loads cleanly. The integration tests already cover the rendering paths.

- [ ] **Step 4: Stop the dev server**

Stop the background `pnpm dev` process.

- [ ] **Step 5: Confirm working tree clean and feature commits as expected**

Run: `git status && git log --oneline master..HEAD`
Expected: `nothing to commit, working tree clean`. The branch should contain at least five new commits beyond master (one each from Tasks 2, 3, 4, 5, 6) plus any review-followup commits the controller adds during the per-task review loop.

---

## Out of scope reminders

These are intentionally NOT part of A2 (see the spec):

- `title`, `category`, `icon`, `description` fields on `CommandContribution` — manifest territory.
- `when` clauses (visibility / enablement).
- Command palette UI, keybinding contributions, menu contributions — A3+.
- Built-in / shell-registered commands.
- Sandboxing on `run`.
- Async cancellation tokens.
- `onDidExecuteCommand` / command telemetry events.

If a step tempts you toward any of those, stop and re-read the spec.

## Cross-cutting note on registrar duplication

After Task 2, `registry.ts` will have three near-identical `register*` blocks (`view`, `statusBarItem`, `command`). The plan deliberately does NOT extract a `makeRegistrar<T>` helper, even though it would now save lines. The decision to extract belongs in the implementation review for this branch, not in this plan. If the cross-cutting reviewer concludes the abstraction is overdue at three copies, do it as a follow-up commit on the same branch. If the reviewer concludes the duplication is acceptable, leave it for the fourth kind. **Do not pre-emptively extract during the tasks above.**
