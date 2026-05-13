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
import { createRegistry } from './registry';

const fakeComponent = {} as ViewContribution['component'];

function extension(id: string, activate: (context: ExtensionContext) => void): Extension {
  return { manifest: { id, displayName: id, version: '0.0.0' }, activate };
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
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.window.registerView({
            id: 'shared',
            component: fakeComponent,
            title: 'Test View',
          });
        }),
      ),
    ).toThrow(/shared.*ext\.b/);
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
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.window.registerStatusBarItem({
            id: 'shared',
            component: fakeComponent,
            alignment: 'right',
          });
        }),
      ),
    ).toThrow(/shared.*ext\.b/);
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
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.commands.registerCommand({ id: 'shared', run: () => undefined });
        }),
      ),
    ).toThrow(/shared.*ext\.b/);
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
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.keybindings.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.b.cmd' });
        }),
      ),
    ).toThrow(/Ctrl\+Shift\+G.*ext\.b/);
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
