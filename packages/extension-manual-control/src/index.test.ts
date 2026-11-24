import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';

import { manualControlExtension } from './index';
import { getStationAddress } from './station-address';
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

  it('registers the stationUrl setting', () => {
    const fake = makeFakeHost();
    activate(fake.host, []);
    expect(fake.registerConfiguration).toHaveBeenCalledTimes(1);
    const contribution = fake.registerConfiguration.mock.calls[0][0];
    expect(contribution.key).toBe('gcscode.manual-control.stationUrl');
    expect(contribution.schema.type).toBe('string');
    expect(contribution.schema.format).toBe('uri');
    expect(contribution.default).toBe('ws://127.0.0.1:8091/ws');
  });

  it('registers the Radio input view, then the Controls view beside it', () => {
    const fake = makeFakeHost();
    activate(fake.host, []);
    expect(fake.registerView.mock.calls.map(([v]) => [v.id, v.title, v.component])).toEqual([
      ['gcscode.manual-control.radio-input', 'Radio input', RadioInputView],
      ['gcscode.manual-control.controls', 'Controls', ControlsView],
    ]);
  });

  it('pushes exactly the three disposables and returns undefined', () => {
    const fake = makeFakeHost();
    const subscriptions: Disposable[] = [];
    const result = activate(fake.host, subscriptions);
    expect(result).toBeUndefined();
    expect(subscriptions).toHaveLength(3);
    expect(subscriptions).toContain(fake.configurationDisposable);
    expect(fake.viewDisposables).toHaveLength(2);
    for (const d of fake.viewDisposables) expect(subscriptions).toContain(d);
  });

  it('reads the setting on each activation and hands it to the view', () => {
    const first = makeFakeHost('ws://a.test:1/ws');
    activate(first.host, []);
    expect(first.getConfiguration).toHaveBeenCalledWith('gcscode.manual-control');
    expect(first.get).toHaveBeenCalledWith('stationUrl', 'ws://127.0.0.1:8091/ws');
    expect(getStationAddress()).toBe('ws://a.test:1/ws');

    const second = makeFakeHost('ws://b.test:2/ws');
    activate(second.host, []);
    expect(getStationAddress()).toBe('ws://b.test:2/ws');
  });
});
