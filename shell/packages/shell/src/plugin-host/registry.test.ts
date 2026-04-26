import { describe, expect, it } from 'vitest';

import type {
  Disposable,
  Plugin,
  PluginContext,
  PluginHost,
  PluginIdentity,
  ViewContribution,
} from '@gcscode/plugin-api';

import { createRegistry } from './registry';

const fakeComponent = {} as ViewContribution['component'];

function plugin(id: string, activate: (context: PluginContext) => void): Plugin {
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
      plugin('plugin.a', (ctx) => {
        ctx.host.registerView({ id: 'plugin.a.view', component: fakeComponent });
      }),
    );
    expect(registry.listViews()).toEqual([{ id: 'plugin.a.view', component: fakeComponent }]);
  });

  it('keeps registrations from multiple plugins', () => {
    const registry = createRegistry();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerView({ id: 'plugin.a.view', component: fakeComponent });
      }),
    );
    registry.activate(
      plugin('plugin.b', (ctx) => {
        ctx.host.registerView({ id: 'plugin.b.view', component: fakeComponent });
      }),
    );
    expect(registry.listViews()).toHaveLength(2);
  });

  it('returns a disposable from registerView that removes the view', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      plugin('plugin.a', (ctx) => {
        disposable = ctx.host.registerView({
          id: 'plugin.a.view',
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
      plugin('plugin.a', (ctx) => {
        disposable = ctx.host.registerView({
          id: 'plugin.a.view',
          component: fakeComponent,
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listViews()).toHaveLength(0);
  });

  it('throws when two plugins register the same view id', () => {
    const registry = createRegistry();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerView({ id: 'shared', component: fakeComponent });
      }),
    );
    expect(() =>
      registry.activate(
        plugin('plugin.b', (ctx) => {
          ctx.host.registerView({ id: 'shared', component: fakeComponent });
        }),
      ),
    ).toThrow(/shared.*plugin\.b/);
  });

  it('passes plugin identity through context.plugin', () => {
    const registry = createRegistry();
    let captured: PluginIdentity | undefined;
    registry.activate({
      id: 'plugin.a',
      displayName: 'Plugin A',
      version: '1.2.3',
      activate(ctx) {
        captured = ctx.plugin;
      },
    });
    expect(captured).toEqual({
      id: 'plugin.a',
      displayName: 'Plugin A',
      version: '1.2.3',
    });
  });

  it('exposes a fresh subscriptions array on the context', () => {
    const registry = createRegistry();
    let subs: Disposable[] | undefined;
    registry.activate(
      plugin('plugin.a', (ctx) => {
        subs = ctx.subscriptions;
        subs.push(ctx.host.registerView({ id: 'plugin.a.view', component: fakeComponent }));
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
      plugin('plugin.a', (ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'plugin.a.status',
          component: fakeComponent,
          alignment: 'right',
        });
      }),
    );
    expect(registry.listStatusBarItems()).toEqual([
      { id: 'plugin.a.status', component: fakeComponent, alignment: 'right' },
    ]);
  });

  it('returns a disposable from registerStatusBarItem that removes the item', () => {
    const registry = createRegistry();
    let disposable: Disposable | undefined;
    registry.activate(
      plugin('plugin.a', (ctx) => {
        disposable = ctx.host.registerStatusBarItem({
          id: 'plugin.a.status',
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
      plugin('plugin.a', (ctx) => {
        disposable = ctx.host.registerStatusBarItem({
          id: 'plugin.a.status',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    disposable!.dispose();
    expect(() => disposable!.dispose()).not.toThrow();
    expect(registry.listStatusBarItems()).toHaveLength(0);
  });

  it('throws when two plugins register the same status bar item id', () => {
    const registry = createRegistry();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'shared',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expect(() =>
      registry.activate(
        plugin('plugin.b', (ctx) => {
          ctx.host.registerStatusBarItem({
            id: 'shared',
            component: fakeComponent,
            alignment: 'right',
          });
        }),
      ),
    ).toThrow(/shared.*plugin\.b/);
  });

  it('preserves registration order in listStatusBarItems', () => {
    const registry = createRegistry();
    registry.activate(
      plugin('plugin.a', (ctx) => {
        ctx.host.registerStatusBarItem({
          id: 'plugin.a.first',
          component: fakeComponent,
          alignment: 'left',
        });
        ctx.host.registerStatusBarItem({
          id: 'plugin.a.second',
          component: fakeComponent,
          alignment: 'left',
        });
      }),
    );
    expect(registry.listStatusBarItems().map((i) => i.id)).toEqual([
      'plugin.a.first',
      'plugin.a.second',
    ]);
  });

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
});
