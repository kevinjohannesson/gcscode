import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRegistry } from '../../extension-host/registry';
import { quickPickState } from '../../quick-pick/quick-pick-state.svelte';
import { createWorkbenchExtension } from './index';

describe('workbench built-in extension', () => {
  afterEach(() => {
    quickPickState.dismiss();
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
});
