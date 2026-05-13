import { describe, expect, it, vi } from 'vitest';

import type { ExtensionContext } from '@gcscode/extension-api';

import { exampleExtension } from './index';
import ExampleView from './example-view.svelte';
import ExampleStatus from './example-status.svelte';

describe('exampleExtension', () => {
  it('declares stable identity metadata', () => {
    expect(exampleExtension.manifest.id).toBe('gcscode.example');
    expect(exampleExtension.manifest.displayName).toBe('Example Extension');
    expect(typeof exampleExtension.manifest.version).toBe('string');
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
    const subscriptions: ExtensionContext['subscriptions'] = [];

    exampleExtension.activate({
      host: {
        window: { registerView, registerStatusBarItem, showQuickPick: vi.fn() },
        commands: { registerCommand, executeCommand },
        keybindings: { registerKeybinding },
        extensions: { getExtension: vi.fn(() => undefined) },
      },
      subscriptions,
      extension: {
        id: exampleExtension.manifest.id,
        displayName: exampleExtension.manifest.displayName,
        version: exampleExtension.manifest.version,
      },
    });

    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.example.main',
      component: ExampleView,
      title: 'Example',
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

    exampleExtension.activate({
      host: {
        window: { registerView, registerStatusBarItem, showQuickPick: vi.fn() },
        commands: { registerCommand, executeCommand },
        keybindings: { registerKeybinding },
        extensions: { getExtension: vi.fn(() => undefined) },
      },
      subscriptions: [],
      extension: {
        id: exampleExtension.manifest.id,
        displayName: exampleExtension.manifest.displayName,
        version: exampleExtension.manifest.version,
      },
    });

    const greetContribution = registerCommand.mock.calls[0][0];
    expect(greetContribution.run()).toBe('Hello from gcscode.example');
    expect(consoleLogSpy).toHaveBeenCalledWith('Hello from gcscode.example');

    consoleLogSpy.mockRestore();
  });
});
