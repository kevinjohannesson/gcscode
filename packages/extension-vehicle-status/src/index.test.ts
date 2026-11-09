import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost, StatusBarItemContribution } from '@gcscode/extension-api';
import type { MavlinkExports } from '@gcscode/extension-mavlink';

import { getMavlinkExports, vehicleStatusExtension } from './index';

function makeFakeHost(opts: {
  getExtension?: ExtensionHost['extensions']['getExtension'];
  registerStatusBarItem?: ExtensionHost['window']['registerStatusBarItem'];
}): ExtensionHost {
  return {
    window: {
      registerView: vi.fn(() => ({ dispose: () => {} })),
      registerStatusBarItem: opts.registerStatusBarItem ?? vi.fn(() => ({ dispose: () => {} })),
      showQuickPick: vi.fn(),
    },
    commands: {
      registerCommand: vi.fn(() => ({ dispose: () => {} })),
      executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['commands']['executeCommand'],
    },
    keybindings: {
      registerKeybinding: vi.fn(() => ({ dispose: () => {} })),
    },
    extensions: {
      getExtension: opts.getExtension ?? vi.fn(() => undefined),
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

describe('vehicleStatusExtension', () => {
  it('declares stable identity metadata', () => {
    expect(vehicleStatusExtension.manifest.id).toBe('gcscode.vehicle-status');
    expect(vehicleStatusExtension.manifest.displayName).toBe('Vehicle Status');
    expect(typeof vehicleStatusExtension.manifest.version).toBe('string');
  });

  it('registers a status bar item and pushes one disposable; deactivate clears the captured host', () => {
    const captured: StatusBarItemContribution[] = [];
    const host = makeFakeHost({
      registerStatusBarItem: vi.fn((item) => {
        captured.push(item);
        return { dispose: () => {} };
      }),
    });
    const subscriptions: Disposable[] = [];
    vehicleStatusExtension.activate({
      host,
      subscriptions,
      extension: {
        id: vehicleStatusExtension.manifest.id,
        displayName: vehicleStatusExtension.manifest.displayName,
        version: vehicleStatusExtension.manifest.version,
      },
    });

    expect(host.window.registerStatusBarItem).toHaveBeenCalledTimes(1);
    expect(captured[0].id).toBe('gcscode.vehicle-status.summary');
    expect(captured[0].alignment).toBe('left');
    expect(subscriptions).toHaveLength(1);

    // After deactivate, the helper should no longer find MAVLink.
    vehicleStatusExtension.deactivate?.();
    expect(getMavlinkExports()).toBeUndefined();
  });

  it('getMavlinkExports returns MAVLink exports when MAVLink is active and undefined when MAVLink is missing', () => {
    const fakeMavlinkExports: MavlinkExports = {
      telemetry: {
        mode: 'GUIDED',
        armed: true,
        lat: -35.36,
        lng: 149.16,
        alt: 5.4,
        heading: 90,
        roll: 0,
        pitch: 0,
        yaw: 0,
        groundspeed: 0,
        voltageBattery: 12.5,
        batteryRemaining: 47,
        connection: 'connected',
      },
    };

    // Active case
    {
      const host = makeFakeHost({
        getExtension: vi.fn((id: string) =>
          id === 'gcscode.mavlink' ? { id, exports: fakeMavlinkExports as unknown } : undefined,
        ) as ExtensionHost['extensions']['getExtension'],
      });
      vehicleStatusExtension.activate({
        host,
        subscriptions: [],
        extension: {
          id: vehicleStatusExtension.manifest.id,
          displayName: vehicleStatusExtension.manifest.displayName,
          version: vehicleStatusExtension.manifest.version,
        },
      });
      expect(getMavlinkExports()).toBe(fakeMavlinkExports);
      vehicleStatusExtension.deactivate?.();
    }

    // Missing case
    {
      const host = makeFakeHost({
        getExtension: vi.fn(() => undefined),
      });
      vehicleStatusExtension.activate({
        host,
        subscriptions: [],
        extension: {
          id: vehicleStatusExtension.manifest.id,
          displayName: vehicleStatusExtension.manifest.displayName,
          version: vehicleStatusExtension.manifest.version,
        },
      });
      expect(getMavlinkExports()).toBeUndefined();
      vehicleStatusExtension.deactivate?.();
    }
  });
});
