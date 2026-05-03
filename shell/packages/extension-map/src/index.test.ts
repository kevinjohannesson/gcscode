import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost, ViewContribution } from '@gcscode/extension-api';

import { mapApi, mapExtension } from './index';

function makeFakeHost(opts?: {
  registerView?: ExtensionHost['window']['registerView'];
}): ExtensionHost {
  return {
    window: {
      registerView: opts?.registerView ?? vi.fn(() => ({ dispose: () => {} }) as Disposable),
      registerStatusBarItem: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: () => {} }) as Disposable),
      executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['commands']['executeCommand'],
    },
    keybindings: {
      registerKeybinding: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    },
    extensions: {
      getExtension: vi.fn(() => undefined),
    },
  };
}

describe('mapExtension', () => {
  it('declares stable identity metadata', () => {
    expect(mapExtension.manifest.id).toBe('gcscode.map');
    expect(mapExtension.manifest.displayName).toBe('Map');
    expect(typeof mapExtension.manifest.version).toBe('string');
  });

  it('activate registers exactly one view and returns mapApi as exports', () => {
    const captured: ViewContribution[] = [];
    const host = makeFakeHost({
      registerView: vi.fn((view) => {
        captured.push(view);
        return { dispose: () => {} };
      }),
    });
    const subscriptions: Disposable[] = [];

    const exports = mapExtension.activate({
      host,
      subscriptions,
      extension: {
        id: mapExtension.manifest.id,
        displayName: mapExtension.manifest.displayName,
        version: mapExtension.manifest.version,
      },
    });

    expect(host.window.registerView).toHaveBeenCalledTimes(1);
    expect(captured[0].id).toBe('gcscode.map.main');
    expect(subscriptions).toHaveLength(1);
    expect(exports).toBe(mapApi);
  });
});

describe('mapApi', () => {
  it('registerLayer adds an entry; returned Disposable removes it', () => {
    const FakeComponent = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];

    const before = mapApi.layers.size;
    const disposable = mapApi.registerLayer(FakeComponent);
    expect(mapApi.layers.size).toBe(before + 1);

    disposable.dispose();
    expect(mapApi.layers.size).toBe(before);
  });

  it('Disposable.dispose is idempotent', () => {
    const FakeComponent = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];
    const before = mapApi.layers.size;
    const disposable = mapApi.registerLayer(FakeComponent);

    disposable.dispose();
    expect(() => disposable.dispose()).not.toThrow();
    expect(mapApi.layers.size).toBe(before);
  });

  it('multiple registrations get unique ids', () => {
    const FakeA = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];
    const FakeB = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];

    const before = mapApi.layers.size;
    const dA = mapApi.registerLayer(FakeA);
    const dB = mapApi.registerLayer(FakeB);
    expect(mapApi.layers.size).toBe(before + 2);

    dA.dispose();
    dB.dispose();
    expect(mapApi.layers.size).toBe(before);
  });

  it('camera fields are mutable', () => {
    const original = mapApi.camera.zoom;
    mapApi.camera.zoom = 14;
    expect(mapApi.camera.zoom).toBe(14);
    mapApi.camera.zoom = original;
    expect(mapApi.camera.zoom).toBe(original);
  });
});
