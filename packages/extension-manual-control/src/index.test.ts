import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';

import { manualControlExtension } from './index';
import { getStationAddress } from './station-address';
import RadioInputView from './radio-input-view.svelte';

function makeFakeHost(configured?: string) {
  const configurationDisposable: Disposable = { dispose: vi.fn() };
  const viewDisposable: Disposable = { dispose: vi.fn() };
  const registerConfiguration = vi.fn().mockReturnValue(configurationDisposable);
  const registerView = vi.fn().mockReturnValue(viewDisposable);
  const get = vi.fn((_key: string, defaultValue?: unknown) => configured ?? defaultValue);
  const getConfiguration = vi.fn().mockReturnValue({
    get,
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn().mockReturnValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  });
  const host: ExtensionHost = {
    window: {
      registerView,
      registerStatusBarItem: vi.fn(() => ({ dispose: () => {} })),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: () => {} })),
      executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['commands']['executeCommand'],
    },
    keybindings: { registerKeybinding: vi.fn(() => ({ dispose: () => {} })) },
    extensions: { getExtension: vi.fn(() => undefined) },
    configuration: {
      registerConfiguration,
      getConfiguration,
      onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    },
  };
  return {
    host,
    registerConfiguration,
    registerView,
    getConfiguration,
    get,
    configurationDisposable,
    viewDisposable,
  };
}

function activate(host: ExtensionHost, subscriptions: Disposable[]) {
  return manualControlExtension.activate({
    host,
    subscriptions,
    extension: {
      id: manualControlExtension.manifest.id,
      displayName: manualControlExtension.manifest.displayName,
      version: manualControlExtension.manifest.version,
    },
  });
}

describe('manualControlExtension', () => {
  it('declares stable identity metadata', () => {
    expect(manualControlExtension.manifest.id).toBe('gcscode.manual-control');
    expect(manualControlExtension.manifest.displayName).toBe('Manual control');
    expect(manualControlExtension.manifest.version).toBe('0.0.0');
  });

  it("registers no setting of its own: the station address is the MAVLink extension's", () => {
    const fake = makeFakeHost();
    activate(fake.host, []);
    expect(fake.registerConfiguration).not.toHaveBeenCalled();
  });

  it('registers the Radio input view', () => {
    const fake = makeFakeHost();
    activate(fake.host, []);
    expect(fake.registerView).toHaveBeenCalledTimes(1);
    const view = fake.registerView.mock.calls[0][0];
    expect(view.id).toBe('gcscode.manual-control.radio-input');
    expect(view.title).toBe('Radio input');
    expect(view.component).toBe(RadioInputView);
  });

  it('pushes exactly the view disposable and returns undefined', () => {
    const fake = makeFakeHost();
    const subscriptions: Disposable[] = [];
    const result = activate(fake.host, subscriptions);
    expect(result).toBeUndefined();
    expect(subscriptions).toEqual([fake.viewDisposable]);
  });

  it('reads gcscode.mavlink.stationUrl when the view asks, not at activation', () => {
    const setting: { value?: string } = {};
    const fake = makeFakeHost();
    fake.get.mockImplementation(
      (_key: string, defaultValue?: unknown) => setting.value ?? defaultValue,
    );
    activate(fake.host, []);
    expect(fake.get).not.toHaveBeenCalled();

    // Not set yet (or the MAVLink extension not active yet): the default.
    expect(getStationAddress()).toBe('ws://127.0.0.1:8091/ws');
    expect(fake.getConfiguration).toHaveBeenLastCalledWith('gcscode.mavlink');
    expect(fake.get).toHaveBeenLastCalledWith('stationUrl', 'ws://127.0.0.1:8091/ws');

    // Set after activation: the next view to open sees it.
    setting.value = 'ws://a.test:1/ws';
    expect(getStationAddress()).toBe('ws://a.test:1/ws');
  });

  it('a later activation replaces the reader', () => {
    activate(makeFakeHost('ws://a.test:1/ws').host, []);
    expect(getStationAddress()).toBe('ws://a.test:1/ws');
    activate(makeFakeHost('ws://b.test:2/ws').host, []);
    expect(getStationAddress()).toBe('ws://b.test:2/ws');
  });
});
