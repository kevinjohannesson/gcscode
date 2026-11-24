import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createExtensionManager,
  type ExtensionManager,
} from '../../extension-host/extension-manager';
import { createRegistry, type Registry } from '../../extension-host/registry';
import { extensionsPanelState } from '../../extensions-panel/extensions-panel-state.svelte';
import { modalState } from '../../modal-state.svelte';
import { quickPickState } from '../../quick-pick/quick-pick-state.svelte';
import { createWorkbenchExtension } from './index';

// Each test's workbench lets its overlay commands through the modal pause
// until it is deactivated, so deactivate every one afterwards: a leftover from
// one test would otherwise keep a command allowed in the next.
const managers: ExtensionManager[] = [];
const registries: Registry[] = [];
function track(manager: ExtensionManager): ExtensionManager {
  managers.push(manager);
  return manager;
}
function trackRegistry(registry: Registry): Registry {
  registries.push(registry);
  return registry;
}

describe('workbench built-in extension', () => {
  afterEach(async () => {
    quickPickState.dismiss();
    extensionsPanelState.close();
    for (const manager of managers.splice(0)) {
      if (manager.listExtensions().some((r) => r.manifest.id === 'workbench' && r.enabled)) {
        await manager.setEnabled('workbench', false);
      }
    }
    for (const registry of registries.splice(0)) await registry.deactivate('workbench');
  });

  it('exports a factory that returns an Extension with id "workbench"', () => {
    const registry = createRegistry();
    const ext = createWorkbenchExtension(registry);
    expect(ext.manifest.id).toBe('workbench');
    expect(ext.manifest.displayName).toBe('Workbench');
    expect(typeof ext.activate).toBe('function');
  });

  it('registers workbench.action.showCommands with title + category', () => {
    const registry = createRegistry();
    trackRegistry(registry).activate(createWorkbenchExtension(registry));
    const cmd = registry.listCommands().find((c) => c.id === 'workbench.action.showCommands');
    expect(cmd).toBeDefined();
    expect(cmd?.title).toBe('Show All Commands');
    expect(cmd?.category).toBe('Workbench');
  });

  it('registers Ctrl+Shift+P pointing to workbench.action.showCommands', () => {
    const registry = createRegistry();
    trackRegistry(registry).activate(createWorkbenchExtension(registry));
    const kb = registry.listKeybindings().find((k) => k.key === 'Ctrl+Shift+P');
    expect(kb).toBeDefined();
    expect(kb?.command).toBe('workbench.action.showCommands');
  });

  it('opens a quick pick when workbench.action.showCommands runs', async () => {
    const registry = createRegistry();
    trackRegistry(registry).activate(createWorkbenchExtension(registry));
    registry.activate({
      manifest: {
        id: 'ext.demo',
        displayName: 'Demo',
        version: '0.0.0',
      },
      activate(ctx) {
        ctx.host.commands.registerCommand({
          id: 'ext.demo.hello',
          title: 'Say Hello',
          category: 'Demo',
          run: () => undefined,
        });
        ctx.host.commands.registerCommand({
          id: 'ext.demo.untitled',
          run: () => undefined,
        });
      },
    });

    void registry.executeCommand('workbench.action.showCommands');
    await Promise.resolve();
    await Promise.resolve();

    expect(quickPickState.current).not.toBeNull();
    const labels = quickPickState.current!.items.map((i) => i.label);
    // Includes the workbench command itself (eats own dog food) + the Demo
    // command. Excludes the title-less command.
    expect(labels).toContain('Workbench: Show All Commands');
    expect(labels).toContain('Demo: Say Hello');
    expect(labels.find((l) => l.includes('untitled'))).toBeUndefined();
  });

  it('executeCommand fires after the user picks an item', async () => {
    const registry = createRegistry();
    trackRegistry(registry).activate(createWorkbenchExtension(registry));
    const helloRun = vi.fn();
    registry.activate({
      manifest: {
        id: 'ext.demo',
        displayName: 'Demo',
        version: '0.0.0',
      },
      activate(ctx) {
        ctx.host.commands.registerCommand({
          id: 'ext.demo.hello',
          title: 'Say Hello',
          category: 'Demo',
          run: helloRun,
        });
      },
    });

    void registry.executeCommand('workbench.action.showCommands');
    await Promise.resolve();
    await Promise.resolve();

    const helloItem = quickPickState.current!.items.find((i) => i.label === 'Demo: Say Hello');
    expect(helloItem).toBeDefined();
    quickPickState.pick(helloItem!);
    await Promise.resolve();
    await Promise.resolve();
    expect(helloRun).toHaveBeenCalledTimes(1);
  });

  it('registers workbench.extensions.action.showInstalledExtensions command', () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    const command = registry
      .listCommands()
      .find((c) => c.id === 'workbench.extensions.action.showInstalledExtensions');
    expect(command).toBeDefined();
    expect(command?.title).toBe('Show Installed Extensions');
    expect(command?.category).toBe('Workbench');
  });

  it('registers Ctrl+Shift+X keybinding pointing at the panel command', () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    const keybinding = registry.listKeybindings().find((k) => k.key === 'Ctrl+Shift+X');
    expect(keybinding).toBeDefined();
    expect(keybinding?.command).toBe('workbench.extensions.action.showInstalledExtensions');
  });

  it('running the panel command opens the extensions-panel state', async () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    expect(extensionsPanelState.isOpen).toBe(false);
    await registry.executeCommand('workbench.extensions.action.showInstalledExtensions');
    expect(extensionsPanelState.isOpen).toBe(true);

    extensionsPanelState.close(); // cleanup
  });

  it('disposing the workbench subscriptions also disposes the new command + keybinding', async () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    expect(
      registry
        .listCommands()
        .some((c) => c.id === 'workbench.extensions.action.showInstalledExtensions'),
    ).toBe(true);
    expect(registry.listKeybindings().some((k) => k.key === 'Ctrl+Shift+X')).toBe(true);

    await manager.setEnabled('workbench', false);

    expect(
      registry
        .listCommands()
        .some((c) => c.id === 'workbench.extensions.action.showInstalledExtensions'),
    ).toBe(false);
    expect(registry.listKeybindings().some((k) => k.key === 'Ctrl+Shift+X')).toBe(false);
  });

  it('the panel command replaces an open command palette', async () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    const palette = registry.executeCommand('workbench.action.showCommands');
    await Promise.resolve();
    expect(quickPickState.current).not.toBeNull();

    await registry.executeCommand('workbench.extensions.action.showInstalledExtensions');
    expect(quickPickState.current).toBeNull();
    expect(extensionsPanelState.isOpen).toBe(true);
    await expect(palette).resolves.toBeUndefined();
  });

  it('the panel command keeps an open panel open rather than throwing', async () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    await registry.executeCommand('workbench.extensions.action.showInstalledExtensions');
    await expect(
      registry.executeCommand('workbench.extensions.action.showInstalledExtensions'),
    ).resolves.toBeUndefined();
    expect(extensionsPanelState.isOpen).toBe(true);
  });

  it('the palette command replaces an open extensions panel', async () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    extensionsPanelState.open();
    void registry.executeCommand('workbench.action.showCommands');
    await Promise.resolve();
    expect(extensionsPanelState.isOpen).toBe(false);
    expect(quickPickState.current).not.toBeNull();
  });

  it('the palette command replaces an open quick pick, which resolves undefined', async () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    const earlier = vi.fn();
    quickPickState.open({ items: [{ label: 'Apple' }], options: undefined, resolve: earlier });
    void registry.executeCommand('workbench.action.showCommands');
    await Promise.resolve();
    expect(earlier).toHaveBeenCalledWith(undefined);
    expect(quickPickState.current?.options?.placeholder).toBe('Type a command name');
  });

  it('lets both overlay commands through while an overlay is open, until disposed', async () => {
    const registry = createRegistry();
    const manager = track(createExtensionManager(registry));
    manager.register(createWorkbenchExtension(registry));

    expect(modalState.isAllowedWhileActive('workbench.action.showCommands')).toBe(true);
    expect(
      modalState.isAllowedWhileActive('workbench.extensions.action.showInstalledExtensions'),
    ).toBe(true);

    await manager.setEnabled('workbench', false);

    expect(modalState.isAllowedWhileActive('workbench.action.showCommands')).toBe(false);
    expect(
      modalState.isAllowedWhileActive('workbench.extensions.action.showInstalledExtensions'),
    ).toBe(false);
  });
});
