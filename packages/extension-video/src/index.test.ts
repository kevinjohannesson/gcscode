import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';

import { videoExtension } from './index';
import { getVideoAddress } from './video-address';
import StreamHealthView from './stream-health-view.svelte';
import VideoPanel from './video-panel.svelte';

function makeFakeHost(configured?: string) {
  const configurationDisposable: Disposable = { dispose: vi.fn() };
  const viewDisposable: Disposable = { dispose: vi.fn() };
  const healthViewDisposable: Disposable = { dispose: vi.fn() };
  const registerConfiguration = vi.fn().mockReturnValue(configurationDisposable);
  const registerView = vi
    .fn()
    .mockReturnValueOnce(viewDisposable)
    .mockReturnValueOnce(healthViewDisposable);
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
    healthViewDisposable,
  };
}

function activate(host: ExtensionHost, subscriptions: Disposable[]) {
  return videoExtension.activate({
    host,
    subscriptions,
    extension: {
      id: videoExtension.manifest.id,
      displayName: videoExtension.manifest.displayName,
      version: videoExtension.manifest.version,
    },
  });
}

describe('videoExtension', () => {
  it('declares stable identity metadata', () => {
    expect(videoExtension.manifest.id).toBe('gcscode.video');
    expect(videoExtension.manifest.displayName).toBe('Video');
    expect(videoExtension.manifest.version).toBe('0.0.0');
  });

  it('registers the whepUrl setting', () => {
    const fake = makeFakeHost();
    activate(fake.host, []);
    expect(fake.registerConfiguration).toHaveBeenCalledTimes(1);
    const contribution = fake.registerConfiguration.mock.calls[0][0];
    expect(contribution.key).toBe('gcscode.video.whepUrl');
    expect(contribution.schema.type).toBe('string');
    expect(contribution.schema.format).toBe('uri');
    expect(contribution.default).toBe('http://localhost:8889/drone-1/whep');
  });

  it('registers the Video view and the Video health view', () => {
    const fake = makeFakeHost();
    activate(fake.host, []);
    expect(fake.registerView).toHaveBeenCalledTimes(2);
    const [view, health] = fake.registerView.mock.calls.map((call) => call[0]);
    expect(view.id).toBe('gcscode.video.main');
    expect(view.title).toBe('Video');
    expect(view.component).toBe(VideoPanel);
    expect(health.id).toBe('gcscode.video.health');
    expect(health.title).toBe('Video health');
    expect(health.component).toBe(StreamHealthView);
  });

  it('pushes exactly the three disposables and returns undefined', () => {
    const fake = makeFakeHost();
    const subscriptions: Disposable[] = [];
    const result = activate(fake.host, subscriptions);
    expect(result).toBeUndefined();
    expect(subscriptions).toHaveLength(3);
    expect(subscriptions).toContain(fake.configurationDisposable);
    expect(subscriptions).toContain(fake.viewDisposable);
    expect(subscriptions).toContain(fake.healthViewDisposable);
  });

  it('reads the setting on each activation and hands it to the panel', () => {
    const first = makeFakeHost('http://a.test/a/whep');
    activate(first.host, []);
    expect(first.getConfiguration).toHaveBeenCalledWith('gcscode.video');
    expect(first.get).toHaveBeenCalledWith('whepUrl', 'http://localhost:8889/drone-1/whep');
    expect(getVideoAddress()).toBe('http://a.test/a/whep');

    const second = makeFakeHost('http://b.test/b/whep');
    activate(second.host, []);
    expect(getVideoAddress()).toBe('http://b.test/b/whep');
  });
});
