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
    configuration: {
      registerConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
        has: vi.fn().mockReturnValue(false),
        inspect: vi.fn().mockReturnValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
      }),
      onDidChangeConfiguration: vi.fn().mockReturnValue({ dispose: vi.fn() }),
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
    expect(captured[0].title).toBe('Map');
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

describe('mapApi.registerControl', () => {
  it('declarative registration adds an entry; Disposable.dispose removes it', () => {
    const reg = {
      id: 'test.control.declarative.add-remove',
      position: 'top-right' as const,
      icon: { kind: 'lucide' as const, name: 'crosshair' },
      tooltip: 'test',
      commandId: 'test.cmd',
    };

    const disposable = mapApi.registerControl(reg);
    expect(mapApi.controls.has(reg.id)).toBe(true);
    expect(mapApi.controls.get(reg.id)).toBe(reg);

    disposable.dispose();
    expect(mapApi.controls.has(reg.id)).toBe(false);
  });

  it('component registration adds an entry; Disposable.dispose removes it', () => {
    const FakeComponent = (() => {}) as unknown as Parameters<typeof mapApi.registerLayer>[0];
    const reg = {
      id: 'test.control.component.add-remove',
      position: 'bottom-left' as const,
      component: FakeComponent,
    };

    const disposable = mapApi.registerControl(reg);
    expect(mapApi.controls.has(reg.id)).toBe(true);
    expect(mapApi.controls.get(reg.id)).toBe(reg);

    disposable.dispose();
    expect(mapApi.controls.has(reg.id)).toBe(false);
  });

  it('Disposable.dispose is idempotent', () => {
    const reg = {
      id: 'test.control.idempotent',
      position: 'top-left' as const,
      icon: { kind: 'lucide' as const, name: 'crosshair' },
      tooltip: 'test',
      commandId: 'test.cmd',
    };

    const disposable = mapApi.registerControl(reg);
    disposable.dispose();
    expect(() => disposable.dispose()).not.toThrow();
    expect(mapApi.controls.has(reg.id)).toBe(false);
  });

  it('duplicate id throws and the message includes the offending id', () => {
    const reg = {
      id: 'test.control.duplicate',
      position: 'top-right' as const,
      icon: { kind: 'lucide' as const, name: 'crosshair' },
      tooltip: 'test',
      commandId: 'test.cmd',
    };

    const disposable = mapApi.registerControl(reg);
    expect(() => mapApi.registerControl(reg)).toThrow(/test\.control\.duplicate/);

    disposable.dispose();
  });

  it('disposing then re-registering the same id succeeds', () => {
    const reg = {
      id: 'test.control.dispose-reregister',
      position: 'bottom-right' as const,
      icon: { kind: 'lucide' as const, name: 'crosshair' },
      tooltip: 'test',
      commandId: 'test.cmd',
    };

    const first = mapApi.registerControl(reg);
    first.dispose();
    expect(mapApi.controls.has(reg.id)).toBe(false);

    const second = mapApi.registerControl(reg);
    expect(mapApi.controls.has(reg.id)).toBe(true);

    second.dispose();
  });
});
