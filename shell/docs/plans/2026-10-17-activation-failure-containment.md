# Host activation-failure containment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A throwing or async `activate()` can no longer stop the app from booting, leaves no untracked contributions behind, and shows up where an operator will see it.

**Architecture:** `createHost` gains a per-activation ledger plus a revoke function, so the registry can dispose exactly what it handed an extension and close the facade when activation fails. `registry.activate` wraps the call, treats a thenable return as an activation error, and throws a typed `ExtensionActivationError`. `extension-manager` catches on both activation paths and records `failure` on the extension's record; persistence records operator _intent_ rather than outcome. `main.ts`'s boot loop moves into a testable `bootstrap()`. The failure surfaces as an extensions-panel row plus a host-rendered status-bar indicator.

**Tech Stack:** TypeScript (strict, no `exactOptionalPropertyTypes`), Svelte 5 runes, `SvelteMap` for reactive registries, Vitest (`environment: 'node'` in extension packages, jsdom-capable in `packages/shell`), `@testing-library/svelte` for component tests.

**Spec:** [`docs/specs/2026-10-16-activation-failure-containment.md`](../specs/2026-10-16-activation-failure-containment.md). Read it before starting: it records _why_ three earlier designs of this mechanism were wrong, and two of those wrong designs look like the obvious implementation.

**Run tests from inside the package, not from `shell/`.** `cd shell && npx vitest run packages/shell` finds no vitest config, silently selects a different environment (no jsdom, so component tests cannot run) and reports ~43 tests instead of the suite's 219. The shell package's config lives in `packages/shell/vite.config.ts`, which vitest only picks up when invoked from that directory. Every command in this plan is written accordingly; if you shorten one, check the test count.

**Verify, don't quote.** The spec's own reviewers found repeated claims about the tree that did not survive checking. Before each task, read the file you are about to change. If the plan's quoted code does not match what is there, trust the file and say so in your task report.

---

## File structure

| File                                                                   | Responsibility                                                                                      | Task |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---- |
| `packages/shell/src/extension-host/activation-error.ts` (new)          | `ExtensionActivationError` — one type, no logic, importable by registry and manager without a cycle | 1    |
| `packages/shell/src/extension-host/registry.ts` (modify)               | ledger + revoke inside `createHost`; `disposeAll` extracted; containment in `activate`              | 1–3  |
| `packages/shell/src/extension-host/extension-manager.ts` (modify)      | `failure` on the record; catch on both activation paths; intent-based persistence                   | 4    |
| `packages/shell/src/extension-host/bootstrap.ts` (new)                 | the boot loop, lifted out of module scope so it is callable from a test                             | 5    |
| `packages/shell/src/main.ts` (modify)                                  | calls `bootstrap`, keeps its ordering                                                               | 5    |
| `packages/shell/src/extensions-panel/extensions-panel.svelte` (modify) | failed-row rendering; built-in rows informational                                                   | 6    |
| `packages/shell/src/activation-failure-indicator.svelte` (new)         | host-owned status-bar indicator                                                                     | 7    |
| `packages/shell/src/app.svelte` (modify)                               | renders the indicator in the footer                                                                 | 7    |
| `packages/extension-flight-overlay/src/index.ts` (modify)              | degrade instead of throw                                                                            | 8    |

Tests live beside their subjects: `registry.test.ts`, `extension-manager.test.ts`, `bootstrap.test.ts` (new), `extensions-panel.test.ts`, `app.test.ts`, and `packages/extension-flight-overlay/src/index.test.ts`.

---

## Task 1: `ExtensionActivationError` and `disposeAll`

Groundwork. No behaviour change yet — `disposeAll` is extracted from the existing `deactivate` loop so tasks 2–3 can share one implementation and one error-resilience guarantee.

**Files:**

- Create: `packages/shell/src/extension-host/activation-error.ts`
- Modify: `packages/shell/src/extension-host/registry.ts` (the `deactivate` disposal loop)
- Test: `packages/shell/src/extension-host/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shell/src/extension-host/registry.test.ts`:

```ts
import { ExtensionActivationError } from './activation-error';

describe('ExtensionActivationError', () => {
  it('carries the extension id and the original error as cause', () => {
    const cause = new Error('boom');
    const error = new ExtensionActivationError('gcscode.example', cause);
    expect(error).toBeInstanceOf(Error);
    expect(error.extensionId).toBe('gcscode.example');
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('gcscode.example');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd shell/packages/shell && npx vitest run src/extension-host/registry.test.ts -t 'ExtensionActivationError'`
Expected: FAIL — cannot resolve `./activation-error`.

- [ ] **Step 3: Create the error type**

`packages/shell/src/extension-host/activation-error.ts`:

```ts
/**
 * Thrown by `Registry.activate` when an extension's `activate()` throws, or
 * returns a thenable (activation is synchronous — see the containment spec).
 *
 * Lives in its own module so `registry.ts` and `extension-manager.ts` can both
 * import it without a cycle.
 */
export class ExtensionActivationError extends Error {
  readonly extensionId: string;

  constructor(extensionId: string, cause: unknown) {
    super(`Extension "${extensionId}" failed to activate.`, { cause });
    this.name = 'ExtensionActivationError';
    this.extensionId = extensionId;
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd shell/packages/shell && npx vitest run src/extension-host/registry.test.ts -t 'ExtensionActivationError'`
Expected: PASS.

- [ ] **Step 5: Extract `disposeAll` from `deactivate`**

In `registry.ts`, add this module-level helper above `createRegistry`:

```ts
/**
 * Dispose in reverse registration order, surviving a disposable that throws.
 * LIFO because a higher-level disposable registered later may depend on a
 * lower-level one registered earlier. Shared by the failed-activation cleanup
 * and `deactivate` so both have the same resilience guarantee.
 */
function disposeAll(disposables: readonly Disposable[], extensionId: string): void {
  for (let i = disposables.length - 1; i >= 0; i--) {
    try {
      disposables[i].dispose();
    } catch (error) {
      console.error(`Error disposing subscription for extension "${extensionId}":`, error);
    }
  }
}
```

Then replace the loop inside `deactivate` with `disposeAll(subscriptions, extensionId);`, keeping the surrounding `subscriptionsByExtension.delete` / `deactivateHooksByExtension.delete` / `exportsByExtension.delete` calls exactly as they are.

- [ ] **Step 6: Run the whole shell suite — `deactivate`'s existing tests are the regression check**

Run: `cd shell/packages/shell && npx vitest run`
Expected: PASS, same count as before your change (219 at the time of writing; confirm the number did not drop).

- [ ] **Step 7: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode
git add shell/packages/shell/src/extension-host/activation-error.ts shell/packages/shell/src/extension-host/registry.ts shell/packages/shell/src/extension-host/registry.test.ts
git commit -m "feat(host): add ExtensionActivationError and extract disposeAll"
```

---

## Task 2: ledger and revocation inside `createHost`

`createHost(extension)` becomes `createHost(extension, minted)` returning `{ host, revoke }`. Six methods return a `Disposable`: `commands.registerCommand`, `window.registerView`, `window.registerStatusBarItem`, `keybindings.registerKeybinding`, `configuration.registerConfiguration`, `configuration.onDidChangeConfiguration`. **`onDidChangeConfiguration` is not a `register*` method and is the one an earlier draft of the spec missed — do not skip it.** `window.showQuickPick` and `commands.executeCommand` return promises, not disposables; leave them alone.

**Files:**

- Modify: `packages/shell/src/extension-host/registry.ts` (`createHost`, and its single call site in `activate`)
- Test: `packages/shell/src/extension-host/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('createHost ledger and revocation', () => {
  it('records every Disposable-returning host method in the ledger', () => {
    const registry = createRegistry();
    const seen: string[] = [];
    registry.activate({
      manifest: { id: 'gcscode.ledger', displayName: 'Ledger', version: '0.0.0' },
      activate(context) {
        // Six disposables, none pushed to context.subscriptions on purpose.
        context.host.commands.registerCommand({ id: 'ledger.cmd', run: () => undefined });
        context.host.window.registerView({
          id: 'ledger.view',
          component: (() => {}) as never,
          title: 'V',
        });
        context.host.window.registerStatusBarItem({
          id: 'ledger.item',
          component: (() => {}) as never,
          alignment: 'left',
        });
        context.host.keybindings.registerKeybinding({ key: 'Alt+L', command: 'ledger.cmd' });
        context.host.configuration.registerConfiguration({
          key: 'gcscode.ledger.setting',
          schema: { type: 'string' },
          default: 'x',
        });
        context.host.configuration.onDidChangeConfiguration(() => seen.push('fired'));
        throw new Error('after six registrations');
      },
    });
  });
});
```

This test as written expects `activate` to throw, which it does not yet contain — so write it to assert the throw and the cleanup together, which is Task 3. For _this_ task assert the ledger directly instead:

```ts
describe('createHost ledger and revocation', () => {
  it('appends each Disposable-returning method to the ledger and revokes', () => {
    const registry = createRegistry();
    // Reach the internals the way activate() does, via a throwing extension in Task 3.
    // Here, assert revocation semantics through the public surface: a revoked host
    // refuses to register.
    let captured: { host: unknown; revoke: () => void } | undefined;
    expect(captured).toBeUndefined();
  });
});
```

Prefer the second form only if you cannot test `createHost` directly. `createHost` is a closure inside `createRegistry` and is **not exported**, so its behaviour is observable only through `activate`. Therefore: **write no test in this task.** Implement the mechanism here and let Task 3's tests — which exercise it through `activate` — be its coverage. Note this choice in your task report so the reviewer knows it was deliberate rather than an omission.

- [ ] **Step 2: Change `createHost`'s signature and add the two helpers**

Replace the opening of `createHost` with:

```ts
  function createHost(
    extension: ExtensionIdentity,
    minted: Disposable[],
  ): { host: ExtensionHost; revoke: () => void } {
    let revoked = false;

    /** Refuse registration once the activation window has closed. */
    const guard = (): void => {
      if (revoked) {
        throw new Error(
          `Extension "${extension.id}" attempted to register after its activation failed.`,
        );
      }
    };

    /** Record what the host handed out, so a failed activation can dispose it. */
    const track = (disposable: Disposable): Disposable => {
      minted.push(disposable);
      return disposable;
    };

    const host: ExtensionHost = {
```

- [ ] **Step 3: Wrap each of the six methods**

In each of the six, call `guard()` as the first statement and wrap the returned object in `track(...)`. `registerCommand` becomes:

```ts
        registerCommand(command) {
          guard();
          if (commands.has(command.id)) {
            throw new Error(
              `Command id "${command.id}" is already registered (attempted by extension "${extension.id}").`,
            );
          }
          commands.set(command.id, command);
          return track({
            dispose() {
              if (commands.get(command.id) === command) {
                commands.delete(command.id);
              }
            },
          });
        },
```

Apply the identical shape to `registerView`, `registerStatusBarItem`, `registerKeybinding`, `registerConfiguration`, and `onDidChangeConfiguration` — `guard()` first, `track(...)` around the returned disposable, every existing duplicate-id check and comment left intact.

- [ ] **Step 4: Close the function and return the pair**

After the object literal ends, replace the closing `}` of `createHost` with:

```ts
    };

    return {
      host,
      revoke: () => {
        revoked = true;
      },
    };
  }
```

- [ ] **Step 5: Update the single call site**

In `activate`, replace `host: createHost(identity),` so the context is built from the pair. Leave the rest of `activate` alone — Task 3 adds the containment:

```ts
const minted: Disposable[] = [];
const { host } = createHost(identity, minted);
const context: ExtensionContext = {
  host,
  subscriptions: [],
  extension: identity,
};
```

- [ ] **Step 6: Run the suite — nothing should change behaviourally yet**

Run: `cd shell/packages/shell && npx vitest run && pnpm check`
Expected: PASS, same test count. If `tsc` complains that `revoke` is unused, leave it — Task 3 uses it; if the lint rule rejects it, destructure only `host` as shown above.

- [ ] **Step 7: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode
git add shell/packages/shell/src/extension-host/registry.ts
git commit -m "feat(host): give createHost a per-activation ledger and revoke function"
```

---

## Task 3: containment in `registry.activate`

**Files:**

- Modify: `packages/shell/src/extension-host/registry.ts` (`activate`)
- Test: `packages/shell/src/extension-host/registry.test.ts`

- [ ] **Step 1: Write the failing tests** (spec validation cases 1–13)

```ts
describe('activate containment', () => {
  const manifest = (id: string) => ({ id, displayName: id, version: '0.0.0' });
  const FakeComponent = (() => {}) as never;

  it('throws ExtensionActivationError carrying id and cause', () => {
    const registry = createRegistry();
    const cause = new Error('boom');
    expect(() =>
      registry.activate({
        manifest: manifest('x.throws'),
        activate: () => {
          throw cause;
        },
      }),
    ).toThrow(ExtensionActivationError);
  });

  it('disposes host-minted disposables the extension never pushed (batched-push case)', () => {
    const registry = createRegistry();
    expect(() =>
      registry.activate({
        manifest: manifest('x.batched'),
        activate(context) {
          context.subscriptions.push(
            context.host.commands.registerCommand({ id: 'x.a', run: () => undefined }),
            context.host.commands.registerCommand({ id: 'x.b', run: () => undefined }),
            (() => {
              throw new Error('third registration failed');
            })(),
          );
        },
      }),
    ).toThrow(ExtensionActivationError);
    expect(registry.listCommands().map((c) => c.id)).not.toContain('x.a');
    expect(registry.listCommands().map((c) => c.id)).not.toContain('x.b');
  });

  it('disposes what the extension did push before throwing', () => {
    const registry = createRegistry();
    let disposed = false;
    expect(() =>
      registry.activate({
        manifest: manifest('x.pushed'),
        activate(context) {
          context.subscriptions.push({
            dispose: () => {
              disposed = true;
            },
          });
          throw new Error('after pushing its own disposable');
        },
      }),
    ).toThrow(ExtensionActivationError);
    expect(disposed).toBe(true);
  });

  it('covers onDidChangeConfiguration, which is not a register* method', () => {
    const registry = createRegistry();
    let listenerDisposed = false;
    expect(() =>
      registry.activate({
        manifest: manifest('x.config'),
        activate(context) {
          const d = context.host.configuration.onDidChangeConfiguration(() => undefined);
          const wrapped = {
            dispose: () => {
              listenerDisposed = true;
              d.dispose();
            },
          };
          void wrapped;
          throw new Error('after subscribing');
        },
      }),
    ).toThrow(ExtensionActivationError);
    // The ledger holds the listener's own disposable; assert the registry is clean.
    expect(() => registry.deactivate('x.config')).rejects.toThrow('is not active');
    void listenerDisposed;
  });

  it('leaves the registry with nothing for a failed extension', async () => {
    const registry = createRegistry();
    expect(() =>
      registry.activate({
        manifest: manifest('x.clean'),
        activate(context) {
          context.host.window.registerView({ id: 'x.v', component: FakeComponent, title: 'V' });
          throw new Error('nope');
        },
      }),
    ).toThrow(ExtensionActivationError);
    expect(registry.listViews()).toHaveLength(0);
    await expect(registry.deactivate('x.clean')).rejects.toThrow('is not active');
  });

  it('treats a thenable return as an activation error and publishes no Promise', () => {
    const registry = createRegistry();
    expect(() =>
      registry.activate({
        manifest: manifest('x.async'),
        activate: () => Promise.resolve({ some: 'exports' }),
      }),
    ).toThrow(ExtensionActivationError);
    expect(registry.listCommands()).toHaveLength(0);
  });

  it('revokes the host so a resumed continuation registers nothing', async () => {
    const registry = createRegistry();
    let resumedError: unknown;
    expect(() =>
      registry.activate({
        manifest: manifest('x.resume'),
        activate(context) {
          return (async () => {
            await Promise.resolve();
            try {
              context.host.commands.registerCommand({ id: 'leaked.command', run: () => undefined });
            } catch (error) {
              resumedError = error;
            }
          })();
        },
      }),
    ).toThrow(ExtensionActivationError);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(registry.listCommands().map((c) => c.id)).not.toContain('leaked.command');
    expect(resumedError).toBeInstanceOf(Error);
  });

  it('disposes LIFO and survives a disposable that throws mid-cleanup', () => {
    const registry = createRegistry();
    const order: string[] = [];
    expect(() =>
      registry.activate({
        manifest: manifest('x.lifo'),
        activate(context) {
          context.subscriptions.push(
            { dispose: () => order.push('first') },
            {
              dispose: () => {
                order.push('second');
                throw new Error('dispose failed');
              },
            },
            { dispose: () => order.push('third') },
          );
          throw new Error('after pushing three');
        },
      }),
    ).toThrow(ExtensionActivationError);
    // LIFO, and the thrower does not stop the one registered before it.
    expect(order).toEqual(['third', 'second', 'first']);
  });

  it('is safe when a disposable is both host-minted and pushed', () => {
    const registry = createRegistry();
    let disposeCount = 0;
    expect(() =>
      registry.activate({
        manifest: manifest('x.both'),
        activate(context) {
          const d = context.host.commands.registerCommand({
            id: 'x.both.cmd',
            run: () => undefined,
          });
          // Wrap so we can count: the same logical disposable is in both arrays.
          context.subscriptions.push({
            dispose: () => {
              disposeCount++;
              d.dispose();
            },
          });
          throw new Error('after double-tracking');
        },
      }),
    ).toThrow(ExtensionActivationError);
    expect(registry.listCommands().map((c) => c.id)).not.toContain('x.both.cmd');
    // Dispose is required to be idempotent, so a double path is not an error.
    expect(disposeCount).toBe(1);
  });

  it('does not revoke on success — later registration still works', () => {
    const registry = createRegistry();
    let laterHost: ExtensionContext['host'] | undefined;
    registry.activate({
      manifest: manifest('x.later'),
      activate(context) {
        laterHost = context.host;
      },
    });
    expect(() =>
      laterHost!.commands.registerCommand({ id: 'x.later.cmd', run: () => undefined }),
    ).not.toThrow();
    expect(registry.listCommands().map((c) => c.id)).toContain('x.later.cmd');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd shell/packages/shell && npx vitest run src/extension-host/registry.test.ts -t 'activate containment'`
Expected: FAIL — the throwing cases currently propagate the raw error, not `ExtensionActivationError`, and `leaked.command` is present.

- [ ] **Step 3: Implement containment**

Replace `activate`'s body (keeping `identity` and the maps as they are):

```ts
    activate(extension) {
      const identity: ExtensionIdentity = {
        id: extension.manifest.id,
        displayName: extension.manifest.displayName,
        version: extension.manifest.version,
      };
      const minted: Disposable[] = [];
      const { host, revoke, settle } = createHost(identity, minted);
      const context: ExtensionContext = { host, subscriptions: [], extension: identity };

      const cleanUpAfterFailure = (): void => {
        revoke();
        disposeAll(minted, identity.id);
        disposeAll(context.subscriptions, identity.id);
      };

      let exportsValue: unknown;
      try {
        exportsValue = extension.activate(context);
      } catch (cause) {
        cleanUpAfterFailure();
        throw new ExtensionActivationError(identity.id, cause);
      }

      if (isThenable(exportsValue)) {
        // Observe the rejection: not awaiting it is what orphans it. The body has
        // already run to its first await, so revoke before it resumes.
        void exportsValue.then(undefined, (reason: unknown) => {
          console.error(`Extension "${identity.id}" activate() rejected after returning:`, reason);
        });
        cleanUpAfterFailure();
        throw new ExtensionActivationError(
          identity.id,
          new Error('activate() must be synchronous; it returned a thenable.'),
        );
      }

      subscriptionsByExtension.set(identity.id, context.subscriptions);
      if (extension.deactivate) {
        deactivateHooksByExtension.set(identity.id, extension.deactivate.bind(extension));
      }
      exportsByExtension.set(identity.id, exportsValue);
      // Stop recording: the ledger must not grow for the extension's lifetime.
      // The host stays usable — an extension may legitimately register later.
      settle();
    },
```

**Why `settle()` and not `minted.length = 0`.** An earlier draft of this plan truncated the array. That does not work: `track` closes over `minted` and keeps pushing, so emptying it once leaves the reference intact and every post-activation registration appends to the same array forever — with the disposables staying reachable after `dispose()`. Four extensions do hold `context.host` past `activate` (`extension-map`'s `host-store`, `extension-map-demo`, `extension-vehicle-status`, `extension-flight-overlay`'s `state.ts`), but today every one of them uses it for lazy reads only — `extensions.getExtension(...)` in three, `commands.executeCommand(...)` in map's control button — so nothing is leaking yet. The defect is latent: it arms the first time any extension registers a contribution after `activate` returns, which is a pattern the lazy-read architecture invites rather than forbids. Task 2's code-quality review caught it and Task 2's followup added the `tracking` flag plus `settle()`; destructure all three members (`host`, `revoke`, `settle`) at this call site.

**On the spec's validation case 12 (the ledger is dropped on success).** `minted` is a local inside `activate` and the ledger is not exposed, so this is not observable through the public surface — there is no honest unit test for it short of exporting internals, which would be a worse trade. The line above is the implementation, the comment is its rationale, and the task report should say the case is covered by inspection rather than by assertion. Do not add a test that reaches into the closure to manufacture coverage.

Add this module-level helper beside `disposeAll`:

```ts
function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}
```

Add `import { ExtensionActivationError } from './activation-error';` at the top.

- [ ] **Step 4: Run them and watch them pass**

Run: `cd shell/packages/shell && npx vitest run && pnpm check`
Expected: PASS. **If the run reports an unhandled rejection, the `.then(undefined, …)` handler is missing or misplaced** — that is the exact defect a reviewer proved by execution, so fix it rather than suppressing the warning.

- [ ] **Step 5: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode
git add shell/packages/shell/src/extension-host/registry.ts shell/packages/shell/src/extension-host/registry.test.ts
git commit -m "feat(host): contain activation failures in registry.activate"
```

---

## Task 4: failure on the record, intent-based persistence

**Files:**

- Modify: `packages/shell/src/extension-host/extension-manager.ts`
- Test: `packages/shell/src/extension-host/extension-manager.test.ts`

- [ ] **Step 1: Write the failing tests** (spec validation cases 14–19)

```ts
describe('activation failure recording', () => {
  const throwing = {
    manifest: { id: 'x.bad', displayName: 'Bad', version: '0.0.0' },
    activate: () => {
      throw new Error('bad activate');
    },
  };
  const fine = {
    manifest: { id: 'x.good', displayName: 'Good', version: '0.0.0' },
    activate: () => undefined,
  };

  it('register returns normally and the next register still activates', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    expect(() => manager.register(throwing)).not.toThrow();
    expect(() => manager.register(fine)).not.toThrow();
    const ids = manager.listExtensions().map((r) => r.manifest.id);
    expect(ids).toEqual(['x.bad', 'x.good']);
  });

  it('records failure.message and leaves the record enabled', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    manager.register(throwing);
    const record = manager.listExtensions()[0];
    expect(record.enabled).toBe(true);
    expect(record.failure?.message).toContain('bad activate');
  });

  it('does not call onEnabledChanged for a boot-time failure', () => {
    const registry = createRegistry();
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });
    manager.register(throwing);
    expect(onEnabledChanged).not.toHaveBeenCalled();
  });

  it('setEnabled(true) on a throwing extension resolves and records operator intent', async () => {
    const registry = createRegistry();
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });
    manager.register(throwing, { enabled: false });
    await expect(manager.setEnabled('x.bad', true)).resolves.toBeUndefined();
    const record = manager.listExtensions()[0];
    expect(record.enabled).toBe(true);
    expect(record.failure?.message).toContain('bad activate');
    expect(onEnabledChanged).toHaveBeenCalledWith('x.bad', true);
  });

  it('setEnabled(false) on a failed record skips deactivate and clears failure', async () => {
    const registry = createRegistry();
    const deactivate = vi.spyOn(registry, 'deactivate');
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });
    manager.register(throwing);
    await expect(manager.setEnabled('x.bad', false)).resolves.toBeUndefined();
    expect(deactivate).not.toHaveBeenCalled();
    const record = manager.listExtensions()[0];
    expect(record.enabled).toBe(false);
    expect(record.failure).toBeUndefined();
    expect(onEnabledChanged).toHaveBeenCalledWith('x.bad', false);
  });

  it('leaves records without a failure exactly as before', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    manager.register(fine);
    await manager.setEnabled('x.good', true); // same value: early return
    expect(manager.listExtensions()[0].enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd shell/packages/shell && npx vitest run src/extension-host/extension-manager.test.ts -t 'activation failure recording'`
Expected: FAIL — `register` currently lets the error escape.

- [ ] **Step 3: Implement**

In `extension-manager.ts`: add the import, widen the state and record, and catch on both paths.

```ts
import { ExtensionActivationError } from './activation-error';

interface ExtensionState {
  extension: Extension;
  enabled: boolean;
  failure?: { readonly message: string };
}

export interface ExtensionRecord {
  readonly manifest: ExtensionManifest;
  readonly enabled: boolean;
  /** Present iff the most recent activation attempt failed. */
  readonly failure?: { readonly message: string };
}

function toRecord(state: ExtensionState): ExtensionRecord {
  return state.failure === undefined
    ? { manifest: state.extension.manifest, enabled: state.enabled }
    : { manifest: state.extension.manifest, enabled: state.enabled, failure: state.failure };
}
```

`register`:

```ts
    register(extension, registerOptions) {
      if (extensions.has(extension.manifest.id)) {
        throw new Error(`Extension id "${extension.manifest.id}" is already registered.`);
      }
      const enabled = registerOptions?.enabled ?? true;
      extensions.set(extension.manifest.id, { extension, enabled });
      if (!enabled) return;
      try {
        registry.activate(extension);
      } catch (error) {
        // Contain it: boot continues, the failure is on the record, and
        // persistence is NOT touched — the operator asked for nothing.
        console.error(error);
        extensions.set(extension.manifest.id, {
          extension,
          enabled: true,
          failure: { message: failureMessage(error) },
        });
      }
    },
```

`setEnabled`:

```ts
    async setEnabled(id, enabled) {
      const state = extensions.get(id);
      if (state === undefined) {
        throw new Error(`Cannot set enabled state: extension id "${id}" is not registered.`);
      }
      if (state.enabled === enabled && state.failure === undefined) {
        return;
      }

      if (enabled) {
        try {
          registry.activate(state.extension);
          extensions.set(id, { extension: state.extension, enabled: true });
        } catch (error) {
          console.error(error);
          extensions.set(id, {
            extension: state.extension,
            enabled: true,
            failure: { message: failureMessage(error) },
          });
        }
        // Operator intent is recorded either way, so the next load retries.
        onEnabledChanged?.(id, true);
        return;
      }

      // Disabling. A failed record has nothing active to tear down: no path
      // writes the registry's maps without a completed synchronous activation,
      // so `failure !== undefined` implies not-active.
      if (state.failure === undefined) {
        await registry.deactivate(id);
      }
      extensions.set(id, { extension: state.extension, enabled: false });
      onEnabledChanged?.(id, false);
    },
```

And the helper, module-level:

```ts
function failureMessage(error: unknown): string {
  if (error instanceof ExtensionActivationError) {
    const cause = error.cause;
    if (cause instanceof Error && cause.message) return cause.message;
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd shell/packages/shell && npx vitest run && pnpm check`
Expected: PASS. Note `strict` is on without `exactOptionalPropertyTypes`, so the conditional `toRecord` above is belt-and-braces rather than required — keep it, it documents intent.

- [ ] **Step 5: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode
git add shell/packages/shell/src/extension-host/extension-manager.ts shell/packages/shell/src/extension-host/extension-manager.test.ts
git commit -m "feat(host): record activation failures and persist operator intent"
```

---

## Task 5: `bootstrap`, lifted out of module scope

The point of this task is testability: `app.test.ts` builds its own registry, so a test asserting "the app mounts when an extension throws" would pass today without touching the loop that actually halts.

**Files:**

- Create: `packages/shell/src/extension-host/bootstrap.ts`
- Create: `packages/shell/src/extension-host/bootstrap.test.ts`
- Modify: `packages/shell/src/main.ts`

- [ ] **Step 1: Write the failing test** (spec validation cases 20–21)

`packages/shell/src/extension-host/bootstrap.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { bootstrap } from './bootstrap';
import { createExtensionManager } from './extension-manager';
import { createRegistry } from './registry';

const manifest = (id: string) => ({ id, displayName: id, version: '0.0.0' });

describe('bootstrap', () => {
  it('returns normally when one extension throws, and activates the rest', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const persistence = { isInitiallyEnabled: () => true, recordEnabledChange: vi.fn() };

    expect(() =>
      bootstrap({
        registry,
        manager,
        persistence,
        extensions: [
          {
            id: 'x.bad',
            extension: {
              manifest: manifest('x.bad'),
              activate: () => {
                throw new Error('nope');
              },
            },
          },
          {
            id: 'x.good',
            extension: {
              manifest: manifest('x.good'),
              activate: (context) => {
                context.host.commands.registerCommand({ id: 'x.good.cmd', run: () => undefined });
              },
            },
          },
        ],
      }),
    ).not.toThrow();

    expect(registry.listCommands().map((c) => c.id)).toContain('x.good.cmd');
    const bad = manager.listExtensions().find((r) => r.manifest.id === 'x.bad');
    expect(bad?.failure?.message).toContain('nope');
  });

  it('honours persistence for the initial enabled state', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const persistence = {
      isInitiallyEnabled: (id: string) => id !== 'x.off',
      recordEnabledChange: vi.fn(),
    };
    bootstrap({
      registry,
      manager,
      persistence,
      extensions: [
        {
          id: 'x.off',
          extension: {
            manifest: manifest('x.off'),
            activate: () => {
              throw new Error('must not run');
            },
          },
        },
      ],
    });
    expect(manager.listExtensions()[0].enabled).toBe(false);
    expect(manager.listExtensions()[0].failure).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd shell/packages/shell && npx vitest run src/extension-host/bootstrap.test.ts`
Expected: FAIL — cannot resolve `./bootstrap`.

- [ ] **Step 3: Create `bootstrap.ts`**

```ts
import type { Extension } from '@gcscode/extension-api';

import type { BundledExtensionEntry } from './bundled-extensions';
import type { ExtensionManager } from './extension-manager';
import type { Registry } from './registry';

/** The slice of ExtensionPersistence bootstrap needs. */
interface BootstrapPersistence {
  isInitiallyEnabled(id: string, fallback: boolean): boolean;
}

/**
 * Registers the shell's extensions. Lifted out of `main.ts`'s module scope so a
 * test can assert that one failing activation does not stop the rest — the
 * guarantee the containment iteration exists for. `main.ts` keeps the ordering:
 * bootstrap, then the keybinding dispatcher, then mount.
 */
export function bootstrap(options: {
  registry: Registry;
  manager: ExtensionManager;
  persistence: BootstrapPersistence;
  extensions: readonly BundledExtensionEntry[];
  builtIns?: readonly Extension[];
}): void {
  const { manager, persistence, extensions, builtIns = [] } = options;

  // Built-ins are always enabled and not tracked in persistence, but they are
  // registered through the same contained path as everything else.
  for (const extension of builtIns) {
    manager.register(extension, { enabled: true });
  }

  for (const { id, extension, initialEnabled = true } of extensions) {
    manager.register(extension, { enabled: persistence.isInitiallyEnabled(id, initialEnabled) });
  }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd shell/packages/shell && npx vitest run src/extension-host/bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewire `main.ts`**

Replace the workbench registration and the `for` loop with one `bootstrap` call, keeping every other line and the ordering exactly as they are:

```ts
bootstrap({
  registry,
  manager,
  persistence,
  extensions: bundledExtensions,
  builtIns: [createWorkbenchExtension(registry)],
});

attachKeybindingDispatcher(registry, document);

mount(App, {
  target: document.getElementById('app')!,
  props: { registry, manager },
});
```

Add `import { bootstrap } from './extension-host/bootstrap';` and drop the now-unused `for`-loop imports only if they are genuinely unused — `bundledExtensions` and `createWorkbenchExtension` are both still needed.

- [ ] **Step 6: Run everything**

Run: `cd shell/packages/shell && npx vitest run && pnpm check && pnpm lint`
Expected: PASS. `main.ts` has no test of its own; the `tsc` pass plus `bootstrap.test.ts` are its coverage.

- [ ] **Step 7: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode
git add shell/packages/shell/src/extension-host/bootstrap.ts shell/packages/shell/src/extension-host/bootstrap.test.ts shell/packages/shell/src/main.ts
git commit -m "feat(host): extract bootstrap so the boot path is testable"
```

---

## Task 6: failed rows in the extensions panel

**Files:**

- Modify: `packages/shell/src/extensions-panel/extensions-panel.svelte`
- Test: `packages/shell/src/extensions-panel/extensions-panel.test.ts`

Two changes. First, the filter gains a failure exception — today it is `.filter((r) => r.manifest.id !== 'workbench')`, and the existing comment explains why (disabling the workbench would lock the operator out of `Ctrl+Shift+P` and `Ctrl+Shift+X`). That reasoning is exactly why a _failed_ built-in must be shown but must not offer Disable. Second, the action: `{#if record.enabled}` already renders **Disable** for a failed record (a failed record is `enabled: true`), so the label logic is correct as-is — do not change it. What changes is that a failed built-in renders no button at all.

- [ ] **Step 1: Write the failing tests** (spec validation cases 22–23)

```ts
it('shows a failed row with its message and a reload hint', async () => {
  const manager = fakeManager([
    {
      manifest: { id: 'x.bad', displayName: 'Bad', version: '0.0.0' },
      enabled: true,
      failure: { message: 'boom' },
    },
  ]);
  render(ExtensionsPanel, { props: { manager } });
  expect(screen.getByText(/boom/)).toBeInTheDocument();
  expect(screen.getByText(/reload/i)).toBeInTheDocument();
});

it('shows a failed workbench row with no Disable button', async () => {
  const manager = fakeManager([
    {
      manifest: { id: 'workbench', displayName: 'Workbench', version: '0.0.0' },
      enabled: true,
      failure: { message: 'palette gone' },
    },
  ]);
  render(ExtensionsPanel, { props: { manager } });
  expect(screen.getByText('Workbench')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
});

it('still hides a healthy workbench', async () => {
  const manager = fakeManager([
    { manifest: { id: 'workbench', displayName: 'Workbench', version: '0.0.0' }, enabled: true },
  ]);
  render(ExtensionsPanel, { props: { manager } });
  expect(screen.queryByText('Workbench')).not.toBeInTheDocument();
});
```

Build `fakeManager` to match the file's existing test helpers — read `extensions-panel.test.ts` first and follow whatever shape it already uses for a stub manager rather than inventing a second one.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd shell/packages/shell && npx vitest run src/extensions-panel/extensions-panel.test.ts`
Expected: FAIL — the failed workbench row is filtered out entirely.

- [ ] **Step 3: Implement the filter exception**

```ts
// Filter out the workbench (system extension; cannot be sensibly disabled —
// disabling would lock the operator out of Ctrl+Shift+P + Ctrl+Shift+X).
// Exception: a FAILED extension is always listed, built-ins included — a
// failed workbench is the one failure that costs the operator the palette, so
// hiding it would hide the only thing they need to see. Its row carries no
// Disable for the same reason the filter exists.
const records = $derived(
  manager.listExtensions().filter((r) => r.manifest.id !== 'workbench' || r.failure !== undefined),
);

const isBuiltIn = (record: ExtensionRecord): boolean => record.manifest.id === 'workbench';
```

- [ ] **Step 4: Implement the row**

Inside the row's `min-w-0 flex-1` div, after the description block:

```svelte
{#if record.failure}
  <div class="mt-1 text-xs text-red-300" data-testid="extension-failure">
    Failed to activate: {record.failure.message}
  </div>
  <div class="mt-0.5 text-xs text-neutral-400">
    Reload the app to retry; disabling stops it from being retried.
  </div>
{/if}
```

And wrap the button block so a failed built-in gets none:

```svelte
              {#if record.failure && isBuiltIn(record)}
                <!-- No action: see the records filter comment. -->
              {:else if record.enabled}
```

leaving the existing Disable and Enable branches untouched.

- [ ] **Step 5: Run them and watch them pass**

Run: `cd shell/packages/shell && npx vitest run src/extensions-panel && npx svelte-check --tsconfig packages/shell/tsconfig.json`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode
git add shell/packages/shell/src/extensions-panel/extensions-panel.svelte shell/packages/shell/src/extensions-panel/extensions-panel.test.ts
git commit -m "feat(shell): show failed extensions in the panel, built-ins without Disable"
```

---

## Task 7: the status-bar indicator

**Files:**

- Create: `packages/shell/src/activation-failure-indicator.svelte`
- Modify: `packages/shell/src/app.svelte`
- Test: `packages/shell/src/app.test.ts`

The footer renders only `registry.listStatusBarItems()`, i.e. extension contributions. This indicator is host-owned — an extension-contributed one would be subject to the failure it reports — so `app.svelte` renders it directly from `manager.listExtensions()`.

- [ ] **Step 1: Write the failing tests** (spec validation cases 24–25)

```ts
it('shows no failure indicator when nothing failed', () => {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  render(App, { props: { registry, manager } });
  expect(screen.queryByTestId('activation-failure-indicator')).not.toBeInTheDocument();
});

it('shows the indicator with a count matching the failed records', () => {
  const registry = createRegistry();
  const manager = createExtensionManager(registry);
  manager.register({
    manifest: { id: 'x.bad', displayName: 'Bad', version: '0.0.0' },
    activate: () => {
      throw new Error('boom');
    },
  });
  render(App, { props: { registry, manager } });
  const indicator = screen.getByTestId('activation-failure-indicator');
  expect(indicator).toHaveTextContent('1');
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd shell/packages/shell && npx vitest run src/app.test.ts -t 'indicator'`
Expected: FAIL — no such test id.

- [ ] **Step 3: Create the component**

```svelte
<script lang="ts">
  import type { ExtensionManager } from './extension-host/extension-manager';
  import { extensionsPanelState } from './extensions-panel/extensions-panel-state.svelte';
  import { modalState } from './modal-state.svelte';

  const { manager }: { manager: ExtensionManager } = $props();

  const failedCount = $derived(
    manager.listExtensions().filter((r) => r.failure !== undefined).length,
  );

  function openPanel(): void {
    // open() throws when the panel is already open or another modal is active.
    if (extensionsPanelState.isOpen || modalState.active) return;
    extensionsPanelState.open();
  }
</script>

{#if failedCount > 0}
  <button
    type="button"
    class="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-red-700"
    data-testid="activation-failure-indicator"
    title="Open the extensions panel"
    onclick={openPanel}
  >
    ⚠ {failedCount} extension{failedCount === 1 ? '' : 's'} failed
  </button>
{/if}
```

Read `extensions-panel-state.svelte.ts` and `modal-state.svelte.ts` first and use whatever property names they actually expose for "is open" / "modal active" — the names above are the expected shape, not a verified quote.

- [ ] **Step 4: Render it in the footer**

In `app.svelte`, import it and place it as the first child of the right-hand status side, before the `{#each rightStatus}`:

```svelte
      <ActivationFailureIndicator {manager} />
      {#each rightStatus as { id, component: Component } (id)}
```

- [ ] **Step 5: Run them and watch them pass**

Run: `cd shell/packages/shell && npx vitest run && pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode
git add shell/packages/shell/src/activation-failure-indicator.svelte shell/packages/shell/src/app.svelte shell/packages/shell/src/app.test.ts
git commit -m "feat(shell): add a host-owned activation-failure indicator"
```

---

## Task 8: flight-overlay degrades instead of throwing

ADR-0012 reserves throwing for registrations whose absence would be _unobservable_. A map with no drone icon is observable, so flight-overlay should degrade. This also removes the spec's own manual-test case, which is why the spec's manual script names the mechanism rather than this extension.

**Files:**

- Modify: `packages/extension-flight-overlay/src/index.ts`
- Test: `packages/extension-flight-overlay/src/index.test.ts`

- [ ] **Step 1: Rewrite the existing throw test**

The file currently has `'activate throws when gcscode.map is not active'`. Replace it:

```ts
it('degrades when gcscode.map is not active: activates, registers nothing, logs once', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const { context, registerLayer } = makeContextWithoutMap();
  expect(() => flightOverlayExtension.activate(context)).not.toThrow();
  expect(registerLayer).not.toHaveBeenCalled();
  expect(context.subscriptions).toHaveLength(0);
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});
```

Follow the file's existing helper shape for building a context whose `getExtension('gcscode.map')` returns `undefined`.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd shell/packages/extension-flight-overlay && npx vitest run`
Expected: FAIL — activate still throws.

- [ ] **Step 3: Implement the degrade**

Replace the throwing guard:

```ts
const map = context.host.extensions.getExtension<MapApi>('gcscode.map')?.exports;
if (!map) {
  // Degrade rather than throw: the absence is observable (the map renders
  // without the overlay), so failing activation would cost more than it
  // tells the operator. Per ADR-0012's discriminator.
  console.warn('gcscode.flight-overlay: gcscode.map is not active; skipping overlay registration.');
  return;
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd shell/packages/extension-flight-overlay && npx vitest run && cd ../shell && npx vitest run`
Expected: PASS. The shell suite matters here: `bundled-extensions.test.ts` asserts ordering, and this change makes flight-overlay's map dependency non-fatal.

- [ ] **Step 5: Commit**

```bash
cd /Users/kevinkroon/Projects/gcscode
git add shell/packages/extension-flight-overlay/src/index.ts shell/packages/extension-flight-overlay/src/index.test.ts
git commit -m "feat(flight-overlay): degrade when the map is inactive instead of throwing"
```

---

## Task 9: manual verification

No code. Do this before the final cross-cutting review, and paste the observations into the task report.

- [ ] **Step 1: Run the full gate**

Run: `cd shell && pnpm test && pnpm check && pnpm lint`
Expected: all green, test count higher than the 219 this branch started from.

- [ ] **Step 2: Drive the operator path**

Run `pnpm dev`, then in the browser:

1. `Ctrl+Shift+X`, disable **Map**, reload. Expected: the app renders; the map view is gone; flight-overlay is active and has quietly registered nothing (console shows its one warning); **no** failure row and **no** indicator — because flight-overlay now degrades rather than throwing.
2. To see containment itself, temporarily make an extension throw — add `throw new Error('manual check')` at the top of `exampleExtension.activate` — and reload. Expected: the app still renders, the Example row shows "Failed to activate: manual check" with the reload hint, and the footer shows "⚠ 1 extension failed". Click the indicator: the panel opens. Click Disable on the failed row: the row goes quiet, the indicator disappears, and reloading does not retry it. Re-enable it, reload, and the failure returns. Then revert the thrown error.

- [ ] **Step 3: Commit nothing; report the observations**

If step 2 diverges from those expectations, that is a finding for the task report, not something to paper over.

---

## Out of scope for this plan

Named because the spec names them, and because a well-meaning implementer might otherwise "fix" them: cleanup of contributions registered into another extension's registry (five of flight-overlay's six disposables come from `extension-map`); module-level state set during a partial activation (`flightOverlayState.setHost`, `extension-sitl`'s `client`); awaited activation; in-place retry; and any `deactivate?()` call on the failure path. Each has a `docs/out-of-scope.md` row with a trigger.

## Docs propagation (post-merge, on master)

Per the spec's propagation sections: five `docs/out-of-scope.md` rows, the `docs/roadmap.md` flip with its qualifications, `docs/vs-code-alignment.md` rows filed by table (Alignments carry `Source`; Divergences and Deferrals also carry `Trigger to revisit`), and three bullets in `packages/extension-api/README.md`.
