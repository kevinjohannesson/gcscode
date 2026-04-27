import { describe, expect, it, vi } from 'vitest';

import type {
  Disposable,
  Extension,
  ExtensionContext,
  ExtensionHost,
  ExtensionIdentity,
  ViewContribution,
} from '@gcscode/extension-api';

import { createRegistry } from './registry';

const fakeComponent = {} as ViewContribution['component'];

function extension(id: string, activate: (context: ExtensionContext) => void): Extension {
  return { id, displayName: id, version: '0.0.0', activate };
}

describe('createRegistry', () => {
  it('starts with no views', () => {
    const registry = createRegistry();
    expect(registry.listViews()).toHaveLength(0);
  });

  it('records views registered through host.registerView', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent });
      }),
    );
    expect(registry.listViews()).toEqual([{ id: 'ext.a.view', component: fakeComponent }]);
  });

  it('keeps registrations from multiple extensions', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent });
      }),
    );
    registry.activate(
      extension('ext.b', (ctx) => {
        ctx.host.registerView({ id: 'ext.b.view', component: fakeComponent });
      }),
    );
    expect(registry.listViews()).toHaveLength(2);
  });

  it('returns a disposable from registerView that removes the view', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
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
        disposable = ctx.host.registerView({
          id: 'ext.a.view',
          component: fakeComponent,
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
        ctx.host.registerView({ id: 'shared', component: fakeComponent });
      }),
    );
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.registerView({ id: 'shared', component: fakeComponent });
        }),
      ),
    ).toThrow(/shared.*ext\.b/);
  });

  it('passes extension identity through context.extension', () => {
    const registry = createRegistry();
    let captured: ExtensionIdentity | undefined;
    registry.activate({
      id: 'ext.a',
      displayName: 'Extension A',
      version: '1.2.3',
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
        subs.push(ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }));
      }),
    );
    expect(subs).toHaveLength(1);
    expect(typeof subs![0].dispose).toBe('function');
  });

  it('starts with no status bar items', () => {
    const registry = createRegistry();
    expect(registry.listStatusBarItems()).toHaveLength(0);
  });

  it('records status bar items registered through host.registerStatusBarItem', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerStatusBarItem({
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
        disposable = ctx.host.registerStatusBarItem({
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
        disposable = ctx.host.registerStatusBarItem({
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
        ctx.host.registerStatusBarItem({
          id: 'shared',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.registerStatusBarItem({
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
        ctx.host.registerStatusBarItem({
          id: 'ext.a.first',
          component: fakeComponent,
          alignment: 'left',
        });
        ctx.host.registerStatusBarItem({
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

  it('records commands registered through host.registerCommand', () => {
    const registry = createRegistry();
    const run = () => undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.cmd', run });
      }),
    );
    expect(registry.listCommands()).toEqual([{ id: 'ext.a.cmd', run }]);
  });

  it('returns a disposable from registerCommand that removes the command', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerCommand({
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
        disposable = ctx.host.registerCommand({
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
        ctx.host.registerCommand({ id: 'shared', run: () => undefined });
      }),
    );
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.registerCommand({ id: 'shared', run: () => undefined });
        }),
      ),
    ).toThrow(/shared.*ext\.b/);
  });

  it('allows the same id across all three kinds (view, status bar, command)', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
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
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({ id: 'ext.a.first', run: () => undefined });
        ctx.host.registerCommand({ id: 'ext.a.second', run: () => undefined });
      }),
    );
    expect(registry.listCommands().map((c) => c.id)).toEqual(['ext.a.first', 'ext.a.second']);
  });

  it('executeCommand resolves with the run return value', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
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

    await expect(executor!.executeCommand('ext.a.greet')).resolves.toBe('hello');
  });

  it('executeCommand threads variadic args through to run', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
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

    await expect(executor!.executeCommand('ext.a.add', 2, 3)).resolves.toBe(5);
  });

  it('executeCommand throws synchronously when the id is not registered', () => {
    const registry = createRegistry();
    let executor: ExtensionHost | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        executor = ctx.host;
      }),
    );

    expect(() => executor!.executeCommand('does-not-exist')).toThrow(/does-not-exist.*ext\.a/);
  });

  it('executeCommand surfaces sync throws inside run as rejected Promises', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
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

    await expect(executor!.executeCommand('ext.a.boom')).rejects.toThrow(/boom/);
  });

  it('executeCommand passes async rejections from run through unchanged', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
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

    await expect(executor!.executeCommand('ext.a.async-boom')).rejects.toThrow(/async-boom/);
  });

  it('starts with no keybindings', () => {
    const registry = createRegistry();
    expect(registry.listKeybindings()).toHaveLength(0);
  });

  it('records keybindings registered through host.registerKeybinding', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' });
      }),
    );
    expect(registry.listKeybindings()).toEqual([{ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' }]);
  });

  it('returns a disposable from registerKeybinding that removes the keybinding', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      extension('ext.a', (ctx) => {
        disposable = ctx.host.registerKeybinding({
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
        disposable = ctx.host.registerKeybinding({
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
        ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' });
      }),
    );
    expect(() =>
      registry.activate(
        extension('ext.b', (ctx) => {
          ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.b.cmd' });
        }),
      ),
    ).toThrow(/Ctrl\+Shift\+G.*ext\.b/);
  });

  it('preserves registration order in listKeybindings', () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerKeybinding({ key: 'Ctrl+A', command: 'ext.a.first' });
        ctx.host.registerKeybinding({ key: 'Ctrl+B', command: 'ext.a.second' });
      }),
    );
    expect(registry.listKeybindings().map((k) => k.key)).toEqual(['Ctrl+A', 'Ctrl+B']);
  });

  it('registry.executeCommand resolves with the run return value', async () => {
    const registry = createRegistry();
    registry.activate(
      extension('ext.a', (ctx) => {
        ctx.host.registerCommand({
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
        ctx.host.registerCommand({
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
        ctx.host.registerCommand({
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
        ctx.host.registerCommand({
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
          ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }),
          ctx.host.registerStatusBarItem({
            id: 'ext.a.status',
            component: fakeComponent,
            alignment: 'right',
          }),
          ctx.host.registerCommand({ id: 'ext.a.cmd', run: () => undefined }),
          ctx.host.registerKeybinding({ key: 'Ctrl+Shift+G', command: 'ext.a.cmd' }),
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
          ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }),
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
      ctx.subscriptions.push(ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }));
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
          ctx.host.registerView({ id: 'ext.a.view', component: fakeComponent }),
        );
      }),
    );
    registry.activate(
      extension('ext.b', (ctx) => {
        ctx.subscriptions.push(
          ctx.host.registerView({ id: 'ext.b.view', component: fakeComponent }),
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
      id: 'ext.a',
      displayName: 'ext.a',
      version: '0.0.0',
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
      id: 'ext.a',
      displayName: 'ext.a',
      version: '0.0.0',
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
      id: 'ext.a',
      displayName: 'ext.a',
      version: '0.0.0',
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
      id: 'ext.a',
      displayName: 'ext.a',
      version: '0.0.0',
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
      id: 'ext.a',
      displayName: 'ext.a',
      version: '0.0.0',
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
});
