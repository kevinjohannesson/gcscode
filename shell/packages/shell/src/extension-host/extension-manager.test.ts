import { describe, expect, it, vi } from 'vitest';

import type { Extension, ExtensionContext, ViewContribution } from '@gcscode/extension-api';

import { createExtensionManager } from './extension-manager';
import { createRegistry } from './registry';

const fakeComponent = {} as ViewContribution['component'];

function makeViewExtension(id: string) {
  const activate = vi.fn((ctx: ExtensionContext) => {
    ctx.subscriptions.push(
      ctx.host.window.registerView({
        id: `${id}.view`,
        component: fakeComponent,
        title: 'Test View',
      }),
    );
  });
  const extension: Extension = {
    manifest: {
      id,
      displayName: id,
      version: '0.0.0',
    },
    activate,
  };
  return { extension, activate };
}

function makeViewExtensionWithDeactivate(id: string, deactivate: () => void | Promise<void>) {
  const activate = vi.fn((ctx: ExtensionContext) => {
    ctx.subscriptions.push(
      ctx.host.window.registerView({
        id: `${id}.view`,
        component: fakeComponent,
        title: 'Test View',
      }),
    );
  });
  const extension: Extension = {
    manifest: {
      id,
      displayName: id,
      version: '0.0.0',
    },
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
    expect(registry.listViews()).toEqual([
      { id: 'ext.a.view', component: fakeComponent, title: 'Test View' },
    ]);
    expect(manager.listExtensions()).toEqual([
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: true },
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
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: false },
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
    expect(registry.listViews()).toEqual([
      { id: 'ext.a.view', component: fakeComponent, title: 'Test View' },
    ]);
    expect(manager.listExtensions()).toEqual([
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: true },
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
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: false },
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
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: true },
      { manifest: { id: 'ext.b', displayName: 'ext.b', version: '0.0.0' }, enabled: true },
    ]);

    await manager.setEnabled('ext.a', false);

    expect(manager.listExtensions()).toEqual([
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: false },
      { manifest: { id: 'ext.b', displayName: 'ext.b', version: '0.0.0' }, enabled: true },
    ]);

    await manager.setEnabled('ext.a', true);

    expect(manager.listExtensions()).toEqual([
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: true },
      { manifest: { id: 'ext.b', displayName: 'ext.b', version: '0.0.0' }, enabled: true },
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
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: false },
    ]);
  });

  it('register(ext, { enabled: false }) followed by setEnabled(id, true) activates', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const { extension, activate } = makeViewExtension('ext.a');

    manager.register(extension, { enabled: false });
    await manager.setEnabled('ext.a', true);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(registry.listViews()).toEqual([
      { id: 'ext.a.view', component: fakeComponent, title: 'Test View' },
    ]);
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
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: true },
    ]);
    expect(manager2.listExtensions()).toEqual([
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: true },
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
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: true },
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
      { manifest: { id: 'ext.a', displayName: 'ext.a', version: '0.0.0' }, enabled: false },
    ]);
  });
});

describe('activation failure recording', () => {
  const throwing = {
    manifest: { id: 'x.bad', displayName: 'Bad', version: '0.0.0' },
    activate: () => {
      throw new Error('bad activate');
    },
  };
  it('register returns normally and the next register still activates', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    const goodActivate = vi.fn(() => undefined);

    expect(() => manager.register(throwing)).not.toThrow();
    expect(() =>
      manager.register({
        manifest: { id: 'x.good', displayName: 'Good', version: '0.0.0' },
        activate: goodActivate,
      }),
    ).not.toThrow();

    // "Still activates", not merely "still listed": being listed is what
    // `register` does before it activates, so only the call count distinguishes
    // containment from a boot loop that stopped doing any work.
    expect(goodActivate).toHaveBeenCalledTimes(1);
    const records = manager.listExtensions();
    expect(records.map((r) => r.manifest.id)).toEqual(['x.bad', 'x.good']);
    expect(records[1].failure).toBeUndefined();
  });

  // A non-`Error` cause is the only detail the operator gets: the wrapper's own
  // message names the extension, not the problem.
  it('records a non-Error cause in the failure message', () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    manager.register({
      manifest: { id: 'x.literal', displayName: 'Literal', version: '0.0.0' },
      activate: () => {
        throw 'boom'; // the thrown literal IS the case under test
      },
    });
    expect(manager.listExtensions()[0].failure?.message).toContain('boom');
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

  // Regression guard for spec case 19. Asserting only `enabled === true` after
  // a same-value call cannot fail — `enabled` is true whether the early return
  // fires or activation re-runs — so the call count and the callback are what
  // actually pin "unchanged", including the early return.
  it('leaves records without a failure exactly as before', async () => {
    const registry = createRegistry();
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });
    const activate = vi.fn(() => undefined);
    manager.register({
      manifest: { id: 'x.good', displayName: 'Good', version: '0.0.0' },
      activate,
    });

    await manager.setEnabled('x.good', true); // same value: early return

    expect(activate).toHaveBeenCalledTimes(1);
    expect(onEnabledChanged).not.toHaveBeenCalled();
    const record = manager.listExtensions()[0];
    expect(record.enabled).toBe(true);
    expect(record.failure).toBeUndefined();
  });

  // There is no in-place retry (spec Architecture, "There is no in-place
  // retry"; Non-goals, "In-place retry from the UI"): re-entering activate()
  // on a live module is unsafe, so asking for the state a failed record
  // already reports stays the same-value no-op it is for any other record.
  // Reload is the retry mechanism.
  it('same-value setEnabled(true) on a failed record does not re-enter activate', async () => {
    const registry = createRegistry();
    const onEnabledChanged = vi.fn();
    const manager = createExtensionManager(registry, { onEnabledChanged });
    const activate = vi.fn(() => {
      throw new Error('bad activate');
    });
    manager.register({
      manifest: { id: 'x.bad', displayName: 'Bad', version: '0.0.0' },
      activate,
    });
    expect(activate).toHaveBeenCalledTimes(1);

    await expect(manager.setEnabled('x.bad', true)).resolves.toBeUndefined();

    expect(activate).toHaveBeenCalledTimes(1);
    expect(manager.listExtensions()[0].failure?.message).toContain('bad activate');
    expect(onEnabledChanged).not.toHaveBeenCalled();
  });
});
