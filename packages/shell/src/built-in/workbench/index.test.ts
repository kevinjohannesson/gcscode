import { afterEach, describe, expect, it, vi } from 'vitest';

import { createExtensionManager } from '../../extension-host/extension-manager';
import { createRegistry } from '../../extension-host/registry';
import { extensionsPanelState } from '../../extensions-panel/extensions-panel-state.svelte';
import { quickPickState } from '../../quick-pick/quick-pick-state.svelte';
import { createWorkbenchExtension } from './index';

describe('workbench built-in extension', () => {
  afterEach(() => {
    quickPickState.dismiss();
    extensionsPanelState.close();
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
    registry.activate(createWorkbenchExtension(registry));
    const cmd = registry.listCommands().find((c) => c.id === 'workbench.action.showCommands');
    expect(cmd).toBeDefined();
    expect(cmd?.title).toBe('Show All Commands');
    expect(cmd?.category).toBe('Workbench');
  });

  it('registers Ctrl+Shift+P pointing to workbench.action.showCommands', () => {
    const registry = createRegistry();
    registry.activate(createWorkbenchExtension(registry));
    const kb = registry.listKeybindings().find((k) => k.key === 'Ctrl+Shift+P');
    expect(kb).toBeDefined();
    expect(kb?.command).toBe('workbench.action.showCommands');
  });

  it('opens a quick pick when workbench.action.showCommands runs', async () => {
    const registry = createRegistry();
    registry.activate(createWorkbenchExtension(registry));
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
    registry.activate(createWorkbenchExtension(registry));
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
    const manager = createExtensionManager(registry);
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
    const manager = createExtensionManager(registry);
    manager.register(createWorkbenchExtension(registry));

    const keybinding = registry.listKeybindings().find((k) => k.key === 'Ctrl+Shift+X');
    expect(keybinding).toBeDefined();
    expect(keybinding?.command).toBe('workbench.extensions.action.showInstalledExtensions');
  });

  it('running the panel command opens the extensions-panel state', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
    manager.register(createWorkbenchExtension(registry));

    expect(extensionsPanelState.isOpen).toBe(false);
    await registry.executeCommand('workbench.extensions.action.showInstalledExtensions');
    expect(extensionsPanelState.isOpen).toBe(true);

    extensionsPanelState.close(); // cleanup
  });

  it('disposing the workbench subscriptions also disposes the new command + keybinding', async () => {
    const registry = createRegistry();
    const manager = createExtensionManager(registry);
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
});
