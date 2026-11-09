import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';

import { getMavlinkExports, mapDemoExtension } from './index';

function makeFakeHost(opts?: {
  registerView?: ExtensionHost['window']['registerView'];
  getExtension?: ExtensionHost['extensions']['getExtension'];
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
      getExtension: opts?.getExtension ?? vi.fn(() => undefined),
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

describe('mapDemoExtension', () => {
  afterEach(() => {
    // deactivate clears the module-level host reference; ensure clean slate
    mapDemoExtension.deactivate?.();
  });

  it('has the expected manifest', () => {
    expect(mapDemoExtension.manifest.id).toBe('gcscode.map-demo');
    expect(mapDemoExtension.manifest.displayName).toBe('Map (demo)');
    expect(mapDemoExtension.manifest.version).toBe('0.0.0');
    expect(mapDemoExtension.manifest.description).toContain('Throwaway scaffold');
  });

  it('activate registers exactly one view with id gcscode.map-demo.main', () => {
    const registerView = vi.fn(() => ({ dispose: () => {} }) as Disposable);
    const host = makeFakeHost({ registerView });
    const subscriptions: Disposable[] = [];

    mapDemoExtension.activate({
      host,
      subscriptions,
      extension: { id: 'gcscode.map-demo', displayName: 'Map (demo)', version: '0.0.0' },
    });

    expect(registerView).toHaveBeenCalledTimes(1);
    expect(registerView).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'gcscode.map-demo.main', title: 'Map (demo)' }),
    );
    expect(subscriptions).toHaveLength(1);
  });

  it('getMavlinkExports returns MAVLink exports when host is active and MAVLink is registered', () => {
    const mavlinkExports = { telemetry: { lat: -35.36, lng: 149.17 } };
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) =>
        id === 'gcscode.mavlink' ? { id, exports: mavlinkExports as unknown } : undefined,
      ) as ExtensionHost['extensions']['getExtension'],
    });
    mapDemoExtension.activate({
      host,
      subscriptions: [],
      extension: { id: 'gcscode.map-demo', displayName: 'Map (demo)', version: '0.0.0' },
    });

    expect(getMavlinkExports()).toBe(mavlinkExports);
  });

  it('deactivate clears the module-level host so subsequent getMavlinkExports returns undefined', () => {
    const mavlinkExports = { telemetry: { lat: -35.36, lng: 149.17 } };
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) =>
        id === 'gcscode.mavlink' ? { id, exports: mavlinkExports as unknown } : undefined,
      ) as ExtensionHost['extensions']['getExtension'],
    });
    mapDemoExtension.activate({
      host,
      subscriptions: [],
      extension: { id: 'gcscode.map-demo', displayName: 'Map (demo)', version: '0.0.0' },
    });
    expect(getMavlinkExports()).toBe(mavlinkExports);

    mapDemoExtension.deactivate?.();

    expect(getMavlinkExports()).toBeUndefined();
  });
});
