import { describe, expect, it, vi } from 'vitest';

import type { ExtensionContext } from '@gcscode/extension-api';

import { sitlExtension } from './index';
import SitlView from './sitl-view.svelte';
import { SITL_LOCATION } from './location';

describe('sitlExtension', () => {
  it('declares stable identity metadata', () => {
    expect(sitlExtension.id).toBe('gcscode.sitl');
    expect(sitlExtension.displayName).toBe('SITL Stub');
    expect(typeof sitlExtension.version).toBe('string');
  });

  it('registers a view, a command, and a keybinding, pushing all three disposables', () => {
    const viewDisposable = { dispose: vi.fn() };
    const commandDisposable = { dispose: vi.fn() };
    const keybindingDisposable = { dispose: vi.fn() };
    const registerView = vi.fn().mockReturnValue(viewDisposable);
    const registerStatusBarItem = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerCommand = vi.fn().mockReturnValue(commandDisposable);
    const registerKeybinding = vi.fn().mockReturnValue(keybindingDisposable);
    const executeCommand = vi.fn().mockResolvedValue(undefined);
    const subscriptions: ExtensionContext['subscriptions'] = [];

    sitlExtension.activate({
      host: {
        registerView,
        registerStatusBarItem,
        registerCommand,
        registerKeybinding,
        executeCommand,
      },
      subscriptions,
      extension: {
        id: sitlExtension.id,
        displayName: sitlExtension.displayName,
        version: sitlExtension.version,
      },
    });

    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.sitl.location',
      component: SitlView,
    });
    expect(registerCommand).toHaveBeenCalledWith({
      id: 'gcscode.sitl.getLocation',
      run: expect.any(Function),
    });
    expect(registerKeybinding).toHaveBeenCalledWith({
      key: 'Alt+Shift+L',
      command: 'gcscode.sitl.getLocation',
    });
    expect(subscriptions).toEqual([viewDisposable, commandDisposable, keybindingDisposable]);
  });

  it('getLocation command returns the SITL_LOCATION constant and logs it', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const registerView = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerStatusBarItem = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerCommand = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const registerKeybinding = vi.fn().mockReturnValue({ dispose: vi.fn() });
    const executeCommand = vi.fn().mockResolvedValue(undefined);

    sitlExtension.activate({
      host: {
        registerView,
        registerStatusBarItem,
        registerCommand,
        registerKeybinding,
        executeCommand,
      },
      subscriptions: [],
      extension: {
        id: sitlExtension.id,
        displayName: sitlExtension.displayName,
        version: sitlExtension.version,
      },
    });

    const locationContribution = registerCommand.mock.calls[0][0];
    expect(locationContribution.run()).toEqual(SITL_LOCATION);
    expect(consoleLogSpy).toHaveBeenCalledWith('SITL location:', SITL_LOCATION);

    consoleLogSpy.mockRestore();
  });
});
