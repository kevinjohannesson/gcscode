import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';

import { manualControlExtension } from './index';
import { getStationAddress, getStationProtocol } from './station-address';
import ControlsView from './controls-view.svelte';
import RadioInputView from './radio-input-view.svelte';

function makeFakeHost(configured?: string) {
  const configurationDisposable: Disposable = { dispose: vi.fn() };
  const viewDisposables: Disposable[] = [];
  const registerConfiguration = vi.fn().mockReturnValue(configurationDisposable);
  const registerView = vi.fn((_view: { id: string; title: string; component: unknown }) => {
    const d: Disposable = { dispose: vi.fn() };
    viewDisposables.push(d);
    return d;
  });
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
    viewDisposables,
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

  it('registers the Radio input view, then the Controls view beside it', () => {
    const fake = makeFakeHost();
    activate(fake.host, []);
    expect(fake.registerView.mock.calls.map(([v]) => [v.id, v.title, v.component])).toEqual([
      ['gcscode.manual-control.radio-input', 'Radio input', RadioInputView],
      ['gcscode.manual-control.controls', 'Controls', ControlsView],
    ]);
  });

  it('pushes exactly the two view disposables and returns undefined', () => {
    const fake = makeFakeHost();
    const subscriptions: Disposable[] = [];
    const result = activate(fake.host, subscriptions);
    expect(result).toBeUndefined();
    expect(fake.viewDisposables).toHaveLength(2);
    expect(subscriptions).toEqual(fake.viewDisposables);
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

  it("reads the station protocol from the MAVLink extension's exports when the view asks", () => {
    const fake = makeFakeHost();
    const loaded: { mavlink?: { id: string; exports: { stationProtocol: number } } } = {};
    const getExtension = vi.fn((_id: string) => loaded.mavlink);
    fake.host.extensions.getExtension = getExtension as ExtensionHost['extensions']['getExtension'];
    activate(fake.host, []);
    expect(getExtension).not.toHaveBeenCalled();

    // The MAVLink extension not loaded (or not active yet): nothing says.
    expect(getStationProtocol()).toBeNull();
    expect(getExtension).toHaveBeenLastCalledWith('gcscode.mavlink');

    loaded.mavlink = { id: 'gcscode.mavlink', exports: { stationProtocol: 7 } };
    expect(getStationProtocol()).toBe(7);
  });

  it('a later activation replaces the reader', () => {
    activate(makeFakeHost('ws://a.test:1/ws').host, []);
    expect(getStationAddress()).toBe('ws://a.test:1/ws');
    activate(makeFakeHost('ws://b.test:2/ws').host, []);
    expect(getStationAddress()).toBe('ws://b.test:2/ws');
  });
});
