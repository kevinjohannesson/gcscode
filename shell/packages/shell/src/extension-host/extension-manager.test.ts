import { describe, expect, it, vi } from 'vitest';

import type { Extension, ExtensionContext, ViewContribution } from '@gcscode/extension-api';

import { createExtensionManager } from './extension-manager';
import { createRegistry } from './registry';

const fakeComponent = {} as ViewContribution['component'];

function makeViewExtension(id: string) {
  const activate = vi.fn((ctx: ExtensionContext) => {
    ctx.subscriptions.push(ctx.host.registerView({ id: `${id}.view`, component: fakeComponent }));
  });
  const extension: Extension = {
    id,
    displayName: id,
    version: '0.0.0',
    activate,
  };
  return { extension, activate };
}

function makeViewExtensionWithDeactivate(id: string, deactivate: () => void | Promise<void>) {
  const activate = vi.fn((ctx: ExtensionContext) => {
    ctx.subscriptions.push(ctx.host.registerView({ id: `${id}.view`, component: fakeComponent }));
  });
  const extension: Extension = {
    id,
    displayName: id,
    version: '0.0.0',
    activate,
    deactivate,
  };
  return { extension, activate };
}

describe('createExtensionManager', () => {
  it('register adds the extension and activates it', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');

    manager.register(extension);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.listViews()).toEqual([{ id: 'ext.a.view', component: fakeComponent }]);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
    ]);
  });

  it('register on a duplicate id throws and leaves the original untouched', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension: first } = makeViewExtension('ext.a');
    const { extension: second } = makeViewExtension('ext.a');

    manager.register(first);

    expect(() => manager.register(second)).toThrow('Extension id "ext.a" is already registered.');
    expect(manager.listExtensions()).toHaveLength(1);
    expect(registry.listViews()).toHaveLength(1);
  });

  it("setEnabled(id, false) deactivates and clears the extension's contributions", async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension } = makeViewExtension('ext.a');
    manager.register(extension);

    await manager.setEnabled('ext.a', false);

    expect(registry.listViews()).toHaveLength(0);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: false },
    ]);
  });

  it('setEnabled(id, true) on a disabled extension re-activates with a fresh context', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');
    manager.register(extension);
    await manager.setEnabled('ext.a', false);

    await manager.setEnabled('ext.a', true);

    expect(activate).toHaveBeenCalledTimes(2);
    const firstContext = activate.mock.calls[0][0];
    const secondContext = activate.mock.calls[1][0];
    expect(secondContext).not.toBe(firstContext);
    expect(secondContext.subscriptions).toHaveLength(1);
    expect(registry.listViews()).toEqual([{ id: 'ext.a.view', component: fakeComponent }]);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
    ]);
  });

  it('same-value setEnabled is a true no-op', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');
    manager.register(extension);

    await manager.setEnabled('ext.a', true);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.listViews()).toHaveLength(1);

    await manager.setEnabled('ext.a', false);
    await manager.setEnabled('ext.a', false);

    expect(registry.listViews()).toHaveLength(0);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: false },
    ]);
  });

  it('setEnabled on an unknown id throws', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);

    await expect(manager.setEnabled('does-not-exist', false)).rejects.toThrow(
      'Cannot set enabled state: extension id "does-not-exist" is not registered.',
    );
    await expect(manager.setEnabled('does-not-exist', true)).rejects.toThrow(
      'Cannot set enabled state: extension id "does-not-exist" is not registered.',
    );
  });

  it('listExtensions returns a snapshot reflecting current state', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension: a } = makeViewExtension('ext.a');
    const { extension: b } = makeViewExtension('ext.b');
    manager.register(a);
    manager.register(b);

    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
      { id: 'ext.b', displayName: 'ext.b', version: '0.0.0', enabled: true },
    ]);

    await manager.setEnabled('ext.a', false);

    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: false },
      { id: 'ext.b', displayName: 'ext.b', version: '0.0.0', enabled: true },
    ]);

    await manager.setEnabled('ext.a', true);

    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
      { id: 'ext.b', displayName: 'ext.b', version: '0.0.0', enabled: true },
    ]);
  });

  it('register(ext, { enabled: false }) stores entry with enabled: false and does NOT activate', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');

    manager.register(extension, { enabled: false });

    expect(activate).not.toHaveBeenCalled();
    expect(registry.listViews()).toHaveLength(0);
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: false },
    ]);
  });

  it('register(ext, { enabled: false }) followed by setEnabled(id, true) activates', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');

    manager.register(extension, { enabled: false });
    await manager.setEnabled('ext.a', true);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.listViews()).toEqual([{ id: 'ext.a.view', component: fakeComponent }]);
  });

  it('onEnabledChanged fires from setEnabled with matching (id, enabled) arguments', async () => {
    const registry = createRegistry();
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });
    const { extension } = makeViewExtension('ext.a');

    manager.register(extension);
    await manager.setEnabled('ext.a', false);

    expect(onEnabledChanged).toHaveBeenCalledTimes(1);
    expect(onEnabledChanged).toHaveBeenCalledWith('ext.a', false);
  });

  it('onEnabledChanged does NOT fire from same-value setEnabled (no-op path)', async () => {
    const registry = createRegistry();
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });
    const { extension } = makeViewExtension('ext.a');

    manager.register(extension);
    await manager.setEnabled('ext.a', true); // already true — no-op

    expect(onEnabledChanged).not.toHaveBeenCalled();
  });

  it('onEnabledChanged does NOT fire from register regardless of enabled option', () => {
    const registry = createRegistry();
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });
    const { extension: a } = makeViewExtension('ext.a');
    const { extension: b } = makeViewExtension('ext.b');

    manager.register(a, { enabled: true });
    manager.register(b, { enabled: false });

    expect(onEnabledChanged).not.toHaveBeenCalled();
  });

  it('register(ext, { enabled: true }) is equivalent to register(ext)', () => {
    const registry1 = createRegistry();
    const manager1 = createExtensionManager(registry1);
    const { extension: ext1, activate: activate1 } = makeViewExtension('ext.a');
    manager1.register(ext1);

    const registry2 = createRegistry();
    const manager2 = createExtensionManager(registry2);
    const { extension: ext2, activate: activate2 } = makeViewExtension('ext.a');
    manager2.register(ext2, { enabled: true });

    expect(activate1).toHaveBeenCalledTimes(1);
    expect(activate2).toHaveBeenCalledTimes(1);
    expect(registry1.listViews()).toHaveLength(1);
    expect(registry2.listViews()).toHaveLength(1);
    expect(manager1.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
    ]);
    expect(manager2.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
    ]);
  });

  it('setEnabled(id, false) awaits the deactivate hook before resolving', async () => {
    const registry = createRegistry();
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });

    let resolveHook!: () => void;
    const hookPromise = new Promise<void>((res) => {
      resolveHook = res;
    });
    const deactivate = () => hookPromise;

    const { extension } = makeViewExtensionWithDeactivate('ext.a', deactivate);
    manager.register(extension);

    // Start setEnabled but do NOT await yet
    const setEnabledPromise = manager.setEnabled('ext.a', false);

    // Mid-flight: hook has not resolved yet — callback should NOT have fired
    expect(onEnabledChanged).not.toHaveBeenCalled();
    // Mid-flight: listExtensions still shows enabled: true
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: true },
    ]);

    // Resolve the hook's promise
    resolveHook();

    // Now await the setEnabled promise
    await setEnabledPromise;

    // After resolution: callback must have fired with (id, false)
    expect(onEnabledChanged).toHaveBeenCalledTimes(1);
    expect(onEnabledChanged).toHaveBeenCalledWith('ext.a', false);
    // And listExtensions reflects the new state
    expect(manager.listExtensions()).toEqual([
      { id: 'ext.a', displayName: 'ext.a', version: '0.0.0', enabled: false },
    ]);
  });
});
