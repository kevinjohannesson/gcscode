import { describe, expect, it, vi } from 'vitest';

import type { PluginContext } from '@gcscode/plugin-api';

import { examplePlugin } from './index';
import ExampleView from './example-view.svelte';
import ExampleStatus from './example-status.svelte';

describe('examplePlugin', () => {
  it('declares stable identity metadata', () => {
    expect(examplePlugin.id).toBe('gcscode.example');
    expect(examplePlugin.displayName).toBe('Example Plugin');
    expect(typeof examplePlugin.version).toBe('string');
  });

  it('registers a view, a status bar item, a command, and a keybinding, pushing all four disposables', () => {
    const viewDisposable = { dispose: vi.fn() };
    const statusDisposable = { dispose: vi.fn() };
    const commandDisposable = { dispose: vi.fn() };
    const keybindingDisposable = { dispose: vi.fn() };
    const registerView = vi.fn().mockReturnValue(viewDisposable);
    const registerStatusBarItem = vi.fn().mockReturnValue(statusDisposable);
    const registerCommand = vi.fn().mockReturnValue(commandDisposable);
    const registerKeybinding = vi.fn().mockReturnValue(keybindingDisposable);
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const subscriptions: PluginContext['subscriptions'] = [];

    examplePlugin.activate({
      host: {
        registerView,
        registerStatusBarItem,
        registerCommand,
        registerKeybinding,
        executeCommand,
      },
      subscriptions,
      plugin: {
        id: examplePlugin.id,
        displayName: examplePlugin.displayName,
        version: examplePlugin.version,
      },
    });

    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.example.main',
      component: ExampleView,
    });
    expect(registerStatusBarItem).toHaveBeenCalledWith({
      id: 'gcscode.example.status',
      component: ExampleStatus,
      alignment: 'right',
    });
    expect(registerCommand).toHaveBeenCalledWith({
      id: 'gcscode.example.greet',
      run: expect.any(Function),
    });
    expect(registerKeybinding).toHaveBeenCalledWith({
      key: 'Alt+Shift+G',
      command: 'gcscode.example.greet',
    });
    expect(subscriptions).toEqual([
      viewDisposable,
      statusDisposable,
      commandDisposable,
      keybindingDisposable,
    ]);
  });

  it('the greet command returns the expected greeting and logs it', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const registerView = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerStatusBarItem = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerCommand = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerKeybinding = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    examplePlugin.activate({
      host: {
        registerView,
        registerStatusBarItem,
        registerCommand,
        registerKeybinding,
        executeCommand,
      },
      subscriptions: [],
      plugin: {
        id: examplePlugin.id,
        displayName: examplePlugin.displayName,
        version: examplePlugin.version,
      },
    });

    const greetContribution = registerCommand.mock.calls[0][0];
    expect(greetContribution.run()).toBe('Hello from gcscode.example');
    expect(consoleLogSpy).toHaveBeenCalledWith('Hello from gcscode.example');

    consoleLogSpy.mockRestore();
  });
});
