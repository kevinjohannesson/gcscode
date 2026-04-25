import { describe, expect, it } from 'vitest';

import type {
  Disposable,
  Plugin,
  PluginContext,
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

  it('disposable.dispose() is idempotent', () => {
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
    ).toThrow(/shared/);
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
});
