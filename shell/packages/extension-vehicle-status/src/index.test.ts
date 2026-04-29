import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost, StatusBarItemContribution } from '@gcscode/extension-api';
import type { SitlExports } from '@gcscode/extension-sitl';

import { getSitlExports, vehicleStatusExtension } from './index';

function makeFakeHost(opts: {
  getExtension?: ExtensionHost['getExtension'];
  registerStatusBarItem?: ExtensionHost['registerStatusBarItem'];
}): ExtensionHost {
  return {
    registerView: vi.fn(() => ({ dispose: () => {} })),
    registerStatusBarItem: opts.registerStatusBarItem ?? vi.fn(() => ({ dispose: () => {} })),
    registerCommand: vi.fn(() => ({ dispose: () => {} })),
    registerKeybinding: vi.fn(() => ({ dispose: () => {} })),
    executeCommand: vi.fn(() => Promise.resolve()) as ExtensionHost['executeCommand'],
    getExtension: opts.getExtension ?? vi.fn(() => undefined),
  };
}

describe('vehicleStatusExtension', () => {
  it('declares stable identity metadata', () => {
    expect(vehicleStatusExtension.id).toBe('gcscode.vehicle-status');
    expect(vehicleStatusExtension.displayName).toBe('Vehicle Status');
    expect(typeof vehicleStatusExtension.version).toBe('string');
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
        id: vehicleStatusExtension.id,
        displayName: vehicleStatusExtension.displayName,
        version: vehicleStatusExtension.version,
      },
    });

    expect(host.registerStatusBarItem).toHaveBeenCalledTimes(1);
    expect(captured[0].id).toBe('gcscode.vehicle-status.summary');
    expect(captured[0].alignment).toBe('left');
    expect(subscriptions).toHaveLength(1);

    // After deactivate, the helper should no longer find SITL.
    vehicleStatusExtension.deactivate?.();
    expect(getSitlExports()).toBeUndefined();
  });

  it('getSitlExports returns SITL exports when SITL is active and undefined when SITL is missing', () => {
    const fakeSitlExports: SitlExports = {
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
          id === 'gcscode.sitl' ? { id, exports: fakeSitlExports as unknown } : undefined,
        ) as ExtensionHost['getExtension'],
      });
      vehicleStatusExtension.activate({
        host,
        subscriptions: [],
        extension: {
          id: vehicleStatusExtension.id,
          displayName: vehicleStatusExtension.displayName,
          version: vehicleStatusExtension.version,
        },
      });
      expect(getSitlExports()).toBe(fakeSitlExports);
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
          id: vehicleStatusExtension.id,
          displayName: vehicleStatusExtension.displayName,
          version: vehicleStatusExtension.version,
        },
      });
      expect(getSitlExports()).toBeUndefined();
      vehicleStatusExtension.deactivate?.();
    }
  });
});
