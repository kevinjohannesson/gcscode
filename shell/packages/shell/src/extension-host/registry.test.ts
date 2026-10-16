import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  Disposable,
  Extension,
  ExtensionContext,
  ExtensionHost,
  ExtensionIdentity,
  ViewContribution,
} from '@gcscode/extension-api';

import { quickPickState } from '../quick-pick/quick-pick-state.svelte';
import { ExtensionActivationError } from './activation-error';
import { createRegistry } from './registry';

const fakeComponent = {} as ViewContribution['component'];

function extension(id: string, activate: (context: ExtensionContext) => void): Extension {
  return { manifest: { id, displayName: id, version: '0.0.0' }, activate };
}

/**
 * Containment wraps whatever an extension's `activate()` throws in an
 * `ExtensionActivationError`, so a test about a host-guard message asserts on
 * the wrapped `cause` rather than on the thrown error's own message.
 */
function expectActivationFailure(act: () => void, causeMessage: RegExp): void {
  let thrown: unknown;
  try {
    act();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ExtensionActivationError);
  const cause = (thrown as ExtensionActivationError).cause;
  expect(cause).toBeInstanceOf(Error);
  expect((cause as Error).message).toMatch(causeMessage);
}

describe('createRegistry', () => {
  it('starts with no views', () => {
    const registry = createRegistry();
    expect(registry.listViews()).toHaveLength(0);
  });

  it('records views registered through host.window.registerView', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.window.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
          title: 'Test View',
        });
      }),
    );
    expect(registry.listViews()).toEqual([
      { id: 'ext.a.view', component: fakeComponent, title: 'Test View' },
    ]);
  });

  it('keeps registrations from multiple extensions', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.window.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
          title: 'Test View',
        });
      }),
    );
    registry.activate(
      extension('ext.b', (ctx) => {
        ctx.host.window.registerView({
          id: 'ext.b.view',
          component: fakeComponent,
          title: 'Test View',
        });
      }),
    );
    expect(registry.listViews()).toHaveLength(2);
  });

  it('returns a disposable from registerView that removes the view', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.window.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
          title: 'Test View',
        });
      }),
    );
    expect(registry.listViews()).toHaveLength(1);
    disposable!.dispose();
    expect(registry.listViews()).toHaveLength(0);
  });

  it('disposable.dispose() is idempotent for views', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.window.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
          title: 'Test View',
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listViews()).toHaveLength(0);
  });

  it('throws when two extensions register the same view id', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.window.registerView({
          id: 'shared',
          component: fakeComponent,
          title: 'Test View',
        });
      }),
    );
    expectActivationFailure(
      () =>
        registry.activate(
          extension('ext.b', (ctx) => {
            ctx.host.window.registerView({
              id: 'shared',
              component: fakeComponent,
              title: 'Test View',
            });
          }),
        ),
      /shared.*ext\.b/,
    );
  });

  it('passes extension identity through context.extension', () => {
    const registry = createRegistry();
    let captured: ExtensionIdentity | undefined;
    registry.activate({
      manifest: {
        id: 'ext.a',
        displayName: 'Extension A',
        version: '1.2.3',
      },
      activate(ctx) {
        captured = ctx.extension;
      },
    });
    expect(captured).toEqual({
      id: 'ext.a',
      displayName: 'Extension A',
      version: '1.2.3',
    });
  });

  it('exposes a fresh subscriptions array on the context', () => {
    const registry = createRegistry();
    let subs: Disposable[] | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        subs = ctx.subscriptions;
        subs.push(
          ctx.host.window.registerView({
            id: 'ext.a.view',
            component: fakeComponent,
            title: 'Test View',
          }),
        );
      }),
    );
    expect(subs).toHaveLength(1);
    expect(typeof subs![0].dispose).toBe('function');
  });

  it('starts with no status bar items', () => {
    const registry = createRegistry();
    expect(registry.listStatusBarItems()).toHaveLength(0);
  });

  it('records status bar items registered through host.window.registerStatusBarItem', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.window.registerStatusBarItem({
          id: 'ext.a.status',
          component: fakeComponent,
          alignment: 'right',
        });
      }),
    );
    expect(registry.listStatusBarItems()).toEqual([
      { id: 'ext.a.status', component: fakeComponent, alignment: 'right' },
    ]);
  });

  it('returns a disposable from registerStatusBarItem that removes the item', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.window.registerStatusBarItem({
          id: 'ext.a.status',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expect(registry.listStatusBarItems()).toHaveLength(1);
    disposable!.dispose();
    expect(registry.listStatusBarItems()).toHaveLength(0);
  });

  it('disposable.dispose() is idempotent for status bar items', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.window.registerStatusBarItem({
          id: 'ext.a.status',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listStatusBarItems()).toHaveLength(0);
  });

  it('throws when two extensions register the same status bar item id', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.window.registerStatusBarItem({
          id: 'shared',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expectActivationFailure(
      () =>
        registry.activate(
          extension('ext.b', (ctx) => {
            ctx.host.window.registerStatusBarItem({
              id: 'shared',
              component: fakeComponent,
              alignment: 'right',
            });
          }),
        ),
      /shared.*ext\.b/,
    );
  });

  it('preserves registration order in listStatusBarItems', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.window.registerStatusBarItem({
          id: 'ext.a.first',
          component: fakeComponent,
          alignment: 'left',
        });
        ctx.host.window.registerStatusBarItem({
          id: 'ext.a.second',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expect(registry.listStatusBarItems().map((i) => i.id)).toEqual(['ext.a.first', 'ext.a.second']);
  });

  it('starts with no commands', () => {
    const registry = createRegistry();
    expect(registry.listCommands()).toHaveLength(0);
  });

  it('records commands registered through host.commands.registerCommand', () => {
    const registry = createRegistry();
    const run = () => undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run });
      }),
    );
    expect(registry.listCommands()).toEqual([{ id: 'ext.a.cmd', run }]);
  });

  it('returns a disposable from registerCommand that removes the command', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.commands.registerCommand({
          id: 'ext.a.cmd',
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
      extension('ext.a', (ctx) => {
        disposable = ctx.host.commands.registerCommand({
          id: 'ext.a.cmd',
          run: () => undefined,
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listCommands()).toHaveLength(0);
  });

  it('throws when two extensions register the same command id', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'shared', run: () => undefined });
      }),
    );
    expectActivationFailure(
      () =>
        registry.activate(
          extension('ext.b', (ctx) => {
            ctx.host.commands.registerCommand({ id: 'shared', run: () => undefined });
          }),
        ),
      /shared.*ext\.b/,
    );
  });

  it('allows the same id across all three kinds (view, status bar, command)', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.window.registerView({
          id: 'shared',
          component: fakeComponent,
          title: 'Test View',
        });
        ctx.host.window.registerStatusBarItem({
          id: 'shared',
          component: fakeComponent,
          alignment: 'left',
        });
        ctx.host.commands.registerCommand({ id: 'shared', run: () => undefined });
      }),
    );
    expect(registry.listViews()).toHaveLength(1);
    expect(registry.listStatusBarItems()).toHaveLength(1);
    expect(registry.listCommands()).toHaveLength(1);
  });

  it('preserves registration order in listCommands', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({ id: 'ext.a.first', run: () => undefined });
        ctx.host.commands.registerCommand({ id: 'ext.a.second', run: () => undefined });
      }),
    );
    expect(registry.listCommands().map((c) => c.id)).toEqual(['ext.a.first', 'ext.a.second']);
  });

  it('executeCommand resolves with the run return value', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.greet',
          run: () => 'hello',
        });
      }),
    );

    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        executor = ctx.host;
      }),
    );

    await expect(executor!.commands.executeCommand('ext.a.greet')).resolves.toBe('hello');
  });

  it('executeCommand threads variadic args through to run', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.add',
          run: (...args) => (args[0] as number) + (args[1] as number),
        });
      }),
    );

    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        executor = ctx.host;
      }),
    );

    await expect(executor!.commands.executeCommand('ext.a.add', 2, 3)).resolves.toBe(5);
  });

  it('executeCommand throws synchronously when the id is not registered', () => {
    const registry = createRegistry();
    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        executor = ctx.host;
      }),
    );

    expect(() => executor!.commands.executeCommand('does-not-exist')).toThrow(
      /does-not-exist.*ext\.a/,
    );
  });

  it('executeCommand surfaces sync throws inside run as rejected Promises', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.boom',
          run: () => {
            throw new Error('boom');
          },
        });
      }),
    );

    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        executor = ctx.host;
      }),
    );

    await expect(executor!.commands.executeCommand('ext.a.boom')).rejects.toThrow(/boom/);
  });

  it('executeCommand passes async rejections from run through unchanged', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.async-boom',
          run: () => Promise.reject(new Error('async-boom')),
        });
      }),
    );

    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.b', (ctx) => {
        executor = ctx.host;
      }),
    );

    await expect(executor!.commands.executeCommand('ext.a.async-boom')).rejects.toThrow(
      /async-boom/,
    );
  });

  it('starts with no keybindings', () => {
    const registry = createRegistry();
    expect(registry.listKeybindings()).toHaveLength(0);
  });

  it('records keybindings registered through host.keybindings.registerKeybinding', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' });
      }),
    );
    expect(registry.listKeybindings()).toEqual([{ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' }]);
  });

  it('returns a disposable from registerKeybinding that removes the keybinding', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.keybindings.registerKeybinding({
          key: 'Ctrl+Shift+G',
          command: 'ext.a.cmd',
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
      extension('ext.a', (ctx) => {
        disposable = ctx.host.keybindings.registerKeybinding({
          key: 'Ctrl+Shift+G',
          command: 'ext.a.cmd',
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listKeybindings()).toHaveLength(0);
  });

  it('throws when two extensions register the same keybinding key', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' });
      }),
    );
    expectActivationFailure(
      () =>
        registry.activate(
          extension('ext.b', (ctx) => {
            ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.b.cmd' });
          }),
        ),
      /Ctrl\+Shift\+G.*ext\.b/,
    );
  });

  it('preserves registration order in listKeybindings', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+A', command: 'ext.a.first' });
        ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+B', command: 'ext.a.second' });
      }),
    );
    expect(registry.listKeybindings().map((k) => k.key)).toEqual(['Ctrl+A', 'Ctrl+B']);
  });

  it('registry.executeCommand resolves with the run return value', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.greet',
          run: () => 'hello',
        });
      }),
    );

    await expect(registry.executeCommand('ext.a.greet')).resolves.toBe('hello');
  });

  it('registry.executeCommand threads variadic args through to run', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.add',
          run: (...args) => (args[0] as number) + (args[1] as number),
        });
      }),
    );

    await expect(registry.executeCommand('ext.a.add', 2, 3)).resolves.toBe(5);
  });

  it('registry.executeCommand throws synchronously when the id is not registered (attribution: host)', () => {
    const registry = createRegistry();
    expect(() => registry.executeCommand('does-not-exist')).toThrow(/does-not-exist.*host/);
  });

  it('registry.executeCommand surfaces sync throws inside run as rejected Promises', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.boom',
          run: () => {
            throw new Error('boom');
          },
        });
      }),
    );

    await expect(registry.executeCommand('ext.a.boom')).rejects.toThrow(/boom/);
  });

  it('registry.executeCommand passes async rejections from run through unchanged', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.commands.registerCommand({
          id: 'ext.a.async-boom',
          run: () => Promise.reject(new Error('async-boom')),
        });
      }),
    );

    await expect(registry.executeCommand('ext.a.async-boom')).rejects.toThrow(/async-boom/);
  });

  it("deactivate removes all of the extension's contributions across kinds", async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.window.registerView({
            id: 'ext.a.view',
            component: fakeComponent,
            title: 'Test View',
          }),
          ctx.host.window.registerStatusBarItem({
            id: 'ext.a.status',
            component: fakeComponent,
            alignment: 'right',
          }),
          ctx.host.commands.registerCommand({ id: 'ext.a.cmd', run: () => undefined }),
          ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' }),
        );
      }),
    );
    expect(registry.listViews()).toHaveLength(1);
    expect(registry.listStatusBarItems()).toHaveLength(1);
    expect(registry.listCommands()).toHaveLength(1);
    expect(registry.listKeybindings()).toHaveLength(1);

    await registry.deactivate('ext.a');

    expect(registry.listViews()).toHaveLength(0);
    expect(registry.listStatusBarItems()).toHaveLength(0);
    expect(registry.listCommands()).toHaveLength(0);
    expect(registry.listKeybindings()).toHaveLength(0);
  });

  it('deactivate disposes subscriptions in reverse registration order (LIFO)', async () => {
    const registry = createRegistry();
    const order: number[] = [];
    registry.activate(
      extension('ext.a', (ctx) => {
        for (let i = 0; i < 4; i++) {
          const idx = i;
          ctx.subscriptions.push({
            dispose() {
              order.push(idx);
            },
          });
        }
      }),
    );

    await registry.deactivate('ext.a');

    expect(order).toEqual([3, 2, 1, 0]);
  });

  it('deactivate logs and continues when a dispose() throws', async () => {
    const registry = createRegistry();
    const order: string[] = [];
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push({
          dispose() {
            order.push('first');
          },
        });
        ctx.subscriptions.push({
          dispose() {
            order.push('middle');
            throw new Error('boom');
          },
        });
        ctx.subscriptions.push({
          dispose() {
            order.push('last');
          },
        });
      }),
    );

    await expect(registry.deactivate('ext.a')).resolves.toBeUndefined();

    // LIFO: last → middle → first; all three attempted despite middle throwing.
    expect(order).toEqual(['last', 'middle', 'first']);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('ext.a');

    consoleErrorSpy.mockRestore();
  });

  it('deactivate throws when called with an unknown / not-active extension id', async () => {
    const registry = createRegistry();
    await expect(registry.deactivate('not-active.ext')).rejects.toThrow(
      /Cannot deactivate extension: id "not-active\.ext" is not active/,
    );
  });

  it('deactivate throws on the second call (id is no longer active)', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.window.registerView({
            id: 'ext.a.view',
            component: fakeComponent,
            title: 'Test View',
          }),
        );
      }),
    );

    await registry.deactivate('ext.a');

    await expect(registry.deactivate('ext.a')).rejects.toThrow(
      /Cannot deactivate extension: id "ext\.a" is not active/,
    );
  });

  it('re-activating a deactivated extension works without duplicate-id errors', async () => {
    const registry = createRegistry();
    const e = extension('ext.a', (ctx) => {
      ctx.subscriptions.push(
        ctx.host.window.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
          title: 'Test View',
        }),
      );
    });

    registry.activate(e);
    expect(registry.listViews().map((v) => v.id)).toEqual(['ext.a.view']);

    await registry.deactivate('ext.a');
    expect(registry.listViews()).toHaveLength(0);

    // The same extension can be re-activated against a clean slate.
    expect(() => registry.activate(e)).not.toThrow();
    expect(registry.listViews().map((v) => v.id)).toEqual(['ext.a.view']);
  });

  it('deactivate isolates extensions — deactivating one does not affect another', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.window.registerView({
            id: 'ext.a.view',
            component: fakeComponent,
            title: 'Test View',
          }),
        );
      }),
    );
    registry.activate(
      extension('ext.b', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.window.registerView({
            id: 'ext.b.view',
            component: fakeComponent,
            title: 'Test View',
          }),
        );
      }),
    );
    expect(registry.listViews()).toHaveLength(2);

    await registry.deactivate('ext.a');

    expect(registry.listViews().map((v) => v.id)).toEqual(['ext.b.view']);
  });

  it("deactivate calls the extension's deactivate hook", async () => {
    const registry = createRegistry();
    const deactivate = vi.fn();
    registry.activate({
      manifest: {
        id: 'ext.a',
        displayName: 'ext.a',
        version: '0.0.0',
      },
      activate: () => {},
      deactivate,
    });

    await registry.deactivate('ext.a');

    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it('deactivate awaits an async deactivate hook', async () => {
    const registry = createRegistry();
    let resolveHook!: () => void;
    const hookPromise = new Promise<void>((res) => {
      resolveHook = res;
    });
    const deactivate = vi.fn(() => hookPromise);
    registry.activate({
      manifest: {
        id: 'ext.a',
        displayName: 'ext.a',
        version: '0.0.0',
      },
      activate: () => {},
      deactivate,
    });

    let settled = false;
    const deactivatePromise = registry.deactivate('ext.a');
    deactivatePromise.then(() => {
      settled = true;
    });

    // Hook has not resolved yet — deactivate promise should not be settled.
    await Promise.resolve(); // flush microtasks
    expect(settled).toBe(false);

    resolveHook();
    await deactivatePromise;

    expect(settled).toBe(true);
  });

  it('deactivate hook runs before disposables', async () => {
    const registry = createRegistry();
    const order: string[] = [];
    const deactivate = vi.fn(() => {
      order.push('hook');
    });
    registry.activate({
      manifest: {
        id: 'ext.a',
        displayName: 'ext.a',
        version: '0.0.0',
      },
      activate(ctx) {
        ctx.subscriptions.push({
          dispose() {
            order.push('dispose');
          },
        });
      },
      deactivate,
    });

    await registry.deactivate('ext.a');

    expect(order).toEqual(['hook', 'dispose']);
  });

  it('sync throw in deactivate hook is caught and disposables still run', async () => {
    const registry = createRegistry();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const disposeSpy = vi.fn();
    const deactivate = vi.fn(() => {
      throw new Error('hook-sync-throw');
    });
    registry.activate({
      manifest: {
        id: 'ext.a',
        displayName: 'ext.a',
        version: '0.0.0',
      },
      activate(ctx) {
        ctx.subscriptions.push({ dispose: disposeSpy });
      },
      deactivate,
    });

    try {
      await expect(registry.deactivate('ext.a')).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('ext.a');
      expect(disposeSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('async rejection in deactivate hook is caught and disposables still run', async () => {
    const registry = createRegistry();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const disposeSpy = vi.fn();
    const deactivate = vi.fn(() => Promise.reject(new Error('hook-async-rejection')));
    registry.activate({
      manifest: {
        id: 'ext.a',
        displayName: 'ext.a',
        version: '0.0.0',
      },
      activate(ctx) {
        ctx.subscriptions.push({ dispose: disposeSpy });
      },
      deactivate,
    });

    try {
      await expect(registry.deactivate('ext.a')).resolves.toBeUndefined();
      expect(consoleErrorSpy).toHaveBeenCalledOnce();
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('ext.a');
      expect(disposeSpy).toHaveBeenCalledTimes(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('extension without a deactivate hook behaves as before', async () => {
    const registry = createRegistry();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const disposeSpy = vi.fn();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.subscriptions.push({ dispose: disposeSpy });
      }),
    );

    try {
      await registry.deactivate('ext.a');
      expect(disposeSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('exposes activate() return value via host.extensions.getExtension', async () => {
    const registry = createRegistry();
    let lookupHost: ExtensionHost | undefined;
    registry.activate({
      manifest: {
        id: 'ext.producer',
        displayName: 'Producer',
        version: '0.0.0',
      },
      activate: (ctx) => {
        lookupHost = ctx.host;
        return { hello: 'world' };
      },
    });
    // Lookup from any host instance works — they share the same registry.
    const wrapper = lookupHost!.extensions.getExtension<{ hello: string }>('ext.producer');
    expect(wrapper).toBeDefined();
    expect(wrapper!.id).toBe('ext.producer');
    expect(wrapper!.exports.hello).toBe('world');
  });

  it('host.extensions.getExtension wrapper exists with undefined exports for void activate', () => {
    const registry = createRegistry();
    let lookupHost: ExtensionHost | undefined;
    registry.activate(
      extension('ext.silent', (ctx) => {
        lookupHost = ctx.host;
        // No return value.
      }),
    );
    const wrapper = lookupHost!.extensions.getExtension('ext.silent');
    expect(wrapper).toBeDefined();
    expect(wrapper!.exports).toBeUndefined();
  });

  it('deactivate clears exports — getExtension returns undefined afterward', async () => {
    const registry = createRegistry();
    let lookupHost: ExtensionHost | undefined;
    registry.activate({
      manifest: {
        id: 'ext.producer',
        displayName: 'Producer',
        version: '0.0.0',
      },
      activate: (ctx) => {
        lookupHost = ctx.host;
        return { hello: 'world' };
      },
    });
    expect(lookupHost!.extensions.getExtension('ext.producer')).toBeDefined();
    await registry.deactivate('ext.producer');
    expect(lookupHost!.extensions.getExtension('ext.producer')).toBeUndefined();
  });

  it('host.extensions.getExtension returns undefined for an unregistered id', () => {
    const registry = createRegistry();
    let lookupHost: ExtensionHost | undefined;
    registry.activate(
      extension('ext.observer', (ctx) => {
        lookupHost = ctx.host;
      }),
    );
    expect(lookupHost!.extensions.getExtension('ext.never-registered')).toBeUndefined();
  });

  it('re-activating after deactivate publishes fresh exports', async () => {
    const registry = createRegistry();
    let lookupHost: ExtensionHost | undefined;
    const makeProducer = (payload: string): Extension => ({
      manifest: {
        id: 'ext.producer',
        displayName: 'Producer',
        version: '0.0.0',
      },
      activate: (ctx) => {
        lookupHost = ctx.host;
        return { payload };
      },
    });
    registry.activate(makeProducer('first'));
    expect(
      lookupHost!.extensions.getExtension<{ payload: string }>('ext.producer')!.exports.payload,
    ).toBe('first');
    await registry.deactivate('ext.producer');
    registry.activate(makeProducer('second'));
    expect(
      lookupHost!.extensions.getExtension<{ payload: string }>('ext.producer')!.exports.payload,
    ).toBe('second');
  });

  it('host.extensions.getExtension defaults the generic to unknown', () => {
    const registry = createRegistry();
    let lookupHost: ExtensionHost | undefined;
    registry.activate(
      extension('ext.observer', (ctx) => {
        lookupHost = ctx.host;
      }),
    );
    registry.activate({
      manifest: {
        id: 'ext.producer',
        displayName: 'Producer',
        version: '0.0.0',
      },
      activate: () => ({ value: 42 }),
    });
    // Default generic — exports is `unknown`, narrowing required at use sites.
    const wrapper = lookupHost!.extensions.getExtension('ext.producer');
    expect(wrapper).toBeDefined();
    // Cast to the producer's known shape for the assertion.
    expect((wrapper!.exports as { value: number }).value).toBe(42);
  });

  it('isolates exports between concurrently-active extensions', () => {
    const registry = createRegistry();
    let lookupHost: ExtensionHost | undefined;
    registry.activate(
      extension('ext.observer', (ctx) => {
        lookupHost = ctx.host;
      }),
    );
    registry.activate({
      manifest: {
        id: 'ext.a',
        displayName: 'A',
        version: '0.0.0',
      },
      activate: () => ({ tag: 'a' }),
    });
    registry.activate({
      manifest: {
        id: 'ext.b',
        displayName: 'B',
        version: '0.0.0',
      },
      activate: () => ({ tag: 'b' }),
    });
    const a = lookupHost!.extensions.getExtension<{ tag: string }>('ext.a');
    const b = lookupHost!.extensions.getExtension<{ tag: string }>('ext.b');
    expect(a!.id).toBe('ext.a');
    expect(b!.id).toBe('ext.b');
    expect(a!.exports.tag).toBe('a');
    expect(b!.exports.tag).toBe('b');
    // Identity check — each extension's exports object is its own.
    expect(a!.exports).not.toBe(b!.exports);
  });

  describe('createRegistry — configuration namespace', () => {
    it('exposes registerConfiguration / getConfiguration / onDidChangeConfiguration on host.configuration', () => {
      const registry = createRegistry();
      registry.activate(
        extension('ext.cfg', (ctx) => {
          expect(typeof ctx.host.configuration.registerConfiguration).toBe('function');
          expect(typeof ctx.host.configuration.getConfiguration).toBe('function');
          expect(typeof ctx.host.configuration.onDidChangeConfiguration).toBe('function');
        }),
      );
    });

    it('enforces the prefix using the activating extension id', () => {
      const registry = createRegistry();
      expectActivationFailure(
        () =>
          registry.activate(
            extension('ext.cfg', (ctx) => {
              ctx.host.configuration.registerConfiguration({
                key: 'other.id.foo',
                schema: { type: 'string' },
                default: 'x',
              });
            }),
          ),
        /must start with "ext\.cfg\."/,
      );
    });

    it('two extensions share the same configuration store (cross-extension reads work)', async () => {
      const registry = createRegistry();
      registry.activate(
        extension('ext.a', (ctx) => {
          ctx.host.configuration.registerConfiguration({
            key: 'ext.a.foo',
            schema: { type: 'string' },
            default: 'hello',
          });
        }),
      );

      let readByB: string | undefined;
      registry.activate(
        extension('ext.b', (ctx) => {
          readByB = ctx.host.configuration.getConfiguration().get<string>('ext.a.foo');
        }),
      );
      expect(readByB).toBe('hello');
    });

    it('returns a disposable from registerConfiguration that removes the schema', () => {
      const registry = createRegistry();
      let host: ExtensionHost | undefined;
      let disposable: Disposable | undefined;
      registry.activate(
        extension('ext.cfg2', (ctx) => {
          host = ctx.host;
          disposable = ctx.host.configuration.registerConfiguration({
            key: 'ext.cfg2.foo',
            schema: { type: 'string' },
            default: 'hello',
          });
        }),
      );
      expect(host!.configuration.getConfiguration().get('ext.cfg2.foo', 'fallback')).toBe('hello');
      disposable!.dispose();
      expect(host!.configuration.getConfiguration().get('ext.cfg2.foo', 'fallback')).toBe(
        'fallback',
      );
    });

    it('returns a disposable from onDidChangeConfiguration that removes the listener', async () => {
      const registry = createRegistry();
      let host: ExtensionHost | undefined;
      let disposable: Disposable | undefined;
      const listener = vi.fn();
      registry.activate(
        extension('ext.cfg3', (ctx) => {
          host = ctx.host;
          ctx.host.configuration.registerConfiguration({
            key: 'ext.cfg3.foo',
            schema: { type: 'string' },
            default: 'hello',
          });
          disposable = ctx.host.configuration.onDidChangeConfiguration(listener);
        }),
      );

      await host!.configuration.getConfiguration().update('ext.cfg3.foo', 'world');
      expect(listener).toHaveBeenCalledTimes(1);

      disposable!.dispose();
      await host!.configuration.getConfiguration().update('ext.cfg3.foo', 'again');
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('host.window.showQuickPick', () => {
    afterEach(() => {
      quickPickState.dismiss();
    });

    it('hands the request to quickPickState and returns a promise', () => {
      const registry = createRegistry();
      let host: ExtensionHost | undefined;
      registry.activate(
        extension('ext.a', (ctx) => {
          host = ctx.host;
        }),
      );
      const promise = host!.window.showQuickPick([{ label: 'a' }]);
      expect(promise).toBeInstanceOf(Promise);
      expect(quickPickState.current).not.toBeNull();
      expect(quickPickState.current?.items).toEqual([{ label: 'a' }]);
    });

    it('resolves with the picked item when quickPickState.pick fires', async () => {
      const registry = createRegistry();
      let host: ExtensionHost | undefined;
      registry.activate(
        extension('ext.a', (ctx) => {
          host = ctx.host;
        }),
      );
      const item = { label: 'chosen' };
      const promise = host!.window.showQuickPick([item, { label: 'other' }]);
      quickPickState.pick(item);
      await expect(promise).resolves.toEqual(item);
    });

    it('resolves with undefined when quickPickState.dismiss fires', async () => {
      const registry = createRegistry();
      let host: ExtensionHost | undefined;
      registry.activate(
        extension('ext.a', (ctx) => {
          host = ctx.host;
        }),
      );
      const promise = host!.window.showQuickPick([{ label: 'a' }]);
      quickPickState.dismiss();
      await expect(promise).resolves.toBeUndefined();
    });

    it('rejects if a quick pick is already open', async () => {
      const registry = createRegistry();
      let host: ExtensionHost | undefined;
      registry.activate(
        extension('ext.a', (ctx) => {
          host = ctx.host;
        }),
      );
      void host!.window.showQuickPick([{ label: 'first' }]);
      await expect(host!.window.showQuickPick([{ label: 'second' }])).rejects.toThrow(
        'Quick pick already open',
      );
    });
  });
});

describe('activate containment', () => {
  const manifest = (id: string) => ({ id, displayName: id, version: '0.0.0' });

  /**
   * A healthy extension's host, for reading the registry as an extension sees
   * it — `getExtension` is only reachable through a host.
   */
  const probeHost = (registry: ReturnType<typeof createRegistry>): ExtensionHost => {
    let host: ExtensionHost | undefined;
    registry.activate(
      extension('x.probe', (ctx) => {
        host = ctx.host;
      }),
    );
    return host!;
  };

  it('throws ExtensionActivationError carrying id and cause', () => {
    const registry = createRegistry();
    const cause = new Error('boom');
    let thrown: unknown;
    try {
      registry.activate({
        manifest: manifest('x.throws'),
        activate: () => {
          throw cause;
        },
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ExtensionActivationError);
    expect((thrown as ExtensionActivationError).extensionId).toBe('x.throws');
    expect((thrown as ExtensionActivationError).cause).toBe(cause);
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

  it('covers onDidChangeConfiguration, which is not a register* method', async () => {
    const registry = createRegistry();
    const listener = vi.fn();
    // A healthy extension owns the key the change is driven through: the
    // failing extension's own schema is torn down with the rest of its ledger,
    // and update() rejects for a key with no schema.
    let healthyHost: ExtensionHost | undefined;
    registry.activate(
      extension('x.config.healthy', (ctx) => {
        healthyHost = ctx.host;
        ctx.host.configuration.registerConfiguration({
          key: 'x.config.healthy.foo',
          schema: { type: 'string' },
          default: 'hello',
        });
      }),
    );

    expect(() =>
      registry.activate({
        manifest: manifest('x.config'),
        activate(context) {
          context.host.configuration.onDidChangeConfiguration(listener);
          throw new Error('after subscribing');
        },
      }),
    ).toThrow(ExtensionActivationError);
    await expect(registry.deactivate('x.config')).rejects.toThrow('is not active');

    // The real observable: containment disposed the host-minted listener, so a
    // later configuration change must not reach it. Mirrors the update() shape
    // the configuration dispose tests in this file already use.
    await healthyHost!.configuration.getConfiguration().update('x.config.healthy.foo', 'world');
    expect(listener).not.toHaveBeenCalled();
  });

  it('leaves the registry with nothing for a failed extension', async () => {
    const registry = createRegistry();
    expect(() =>
      registry.activate({
        manifest: manifest('x.clean'),
        activate(context) {
          context.host.window.registerView({ id: 'x.v', component: fakeComponent, title: 'V' });
          throw new Error('nope');
        },
      }),
    ).toThrow(ExtensionActivationError);
    expect(registry.listViews()).toHaveLength(0);
    await expect(registry.deactivate('x.clean')).rejects.toThrow('is not active');
    // Read the registry the way an extension does: nothing was published.
    expect(probeHost(registry).extensions.getExtension('x.clean')).toBeUndefined();
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
    // The half of this test's name the map check does not cover: a consumer
    // must not find a Promise masquerading as the extension's exports.
    expect(probeHost(registry).extensions.getExtension('x.async')).toBeUndefined();
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

  it("observes the returned thenable's rejection rather than orphaning it", async () => {
    const registry = createRegistry();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reason = new Error('rejected after returning');
    expect(() =>
      registry.activate({
        manifest: manifest('x.rejects'),
        activate: () => Promise.reject(reason),
      }),
    ).toThrow(ExtensionActivationError);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The handler attached at containment time is what keeps this rejection
    // from being unhandled — without it, vitest fails the whole run.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy.mock.calls[0][0]).toContain('x.rejects');
    expect(consoleErrorSpy.mock.calls[0][1]).toBe(reason);

    consoleErrorSpy.mockRestore();
  });

  it("leaves a disposable minted by another extension's API alone (the ledger's limit)", () => {
    const registry = createRegistry();
    let layerDisposed = false;
    // Stands in for a service extension's own API (MapApi.registerLayer): the
    // host never minted this disposable, so the ledger cannot reach it.
    registry.activate({
      manifest: manifest('x.service'),
      activate: () => ({
        registerLayer: (): Disposable => ({
          dispose: () => {
            layerDisposed = true;
          },
        }),
      }),
    });
    expect(() =>
      registry.activate({
        manifest: manifest('x.consumer'),
        activate(context) {
          const service = context.host.extensions.getExtension<{
            registerLayer: () => Disposable;
          }>('x.service');
          service!.exports.registerLayer();
          throw new Error('after taking a layer from the service');
        },
      }),
    ).toThrow(ExtensionActivationError);
    // Documents the boundary rather than asserting a wish: containment disposes
    // what the HOST minted. A change that silently widened it would flip this.
    expect(layerDisposed).toBe(false);
  });

  it('does not revoke on success — later registration still works', () => {
    const registry = createRegistry();
    let laterHost: ExtensionHost | undefined;
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

describe('ExtensionActivationError', () => {
  it('carries the extension id and the original error as cause', () => {
    const cause = new Error('boom');
    const error = new ExtensionActivationError('gcscode.example', cause);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ExtensionActivationError);
    expect(error.name).toBe('ExtensionActivationError');
    expect(error.extensionId).toBe('gcscode.example');
    expect(error.cause).toBe(cause);
    expect(error.message).toContain('gcscode.example');
  });

  it('passes a non-Error cause through unchanged', () => {
    const cause = 'boom';
    const error = new ExtensionActivationError('gcscode.example', cause);
    expect(error.cause).toBe(cause);
  });
});
