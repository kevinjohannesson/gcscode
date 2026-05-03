import { describe, expect, it, vi } from 'vitest';

import type { Disposable, ExtensionHost } from '@gcscode/extension-api';
import type { MapApi } from '@gcscode/extension-map';
import type { SitlExports } from '@gcscode/extension-sitl';

import { flightOverlayExtension } from './index';
import { flightOverlayState } from './state';

function makeFakeHost(opts: {
  getExtension?: ExtensionHost['extensions']['getExtension'];
}): ExtensionHost {
  return {
    window: {
      registerView: vi.fn(() => ({ dispose: () => {} }) as Disposable),
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
      getExtension: opts.getExtension ?? vi.fn(() => undefined),
    },
  };
}

function makeFakeMapExports(): MapApi {
  return {
    registerLayer: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    registerControl: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    camera: { center: [0, 0], zoom: 1, pitch: 0, bearing: 0 },
  };
}

describe('flightOverlayExtension', () => {
  it('declares stable identity metadata', () => {
    expect(flightOverlayExtension.manifest.id).toBe('gcscode.flight-overlay');
    expect(flightOverlayExtension.manifest.displayName).toBe('Flight Overlay');
    expect(typeof flightOverlayExtension.manifest.version).toBe('string');
  });

  it('activate registers three layers when map is active', () => {
    const fakeMap = makeFakeMapExports();
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) =>
        id === 'gcscode.map' ? { id, exports: fakeMap as unknown } : undefined,
      ) as ExtensionHost['extensions']['getExtension'],
    });
    const subscriptions: Disposable[] = [];

    flightOverlayExtension.activate({
      host,
      subscriptions,
      extension: {
        id: flightOverlayExtension.manifest.id,
        displayName: flightOverlayExtension.manifest.displayName,
        version: flightOverlayExtension.manifest.version,
      },
    });

    expect(fakeMap.registerLayer).toHaveBeenCalledTimes(3);
    expect(subscriptions).toHaveLength(3);

    flightOverlayExtension.deactivate?.();
  });

  it('activate throws when gcscode.map is not active', () => {
    const host = makeFakeHost({
      getExtension: vi.fn(() => undefined),
    });

    expect(() =>
      flightOverlayExtension.activate({
        host,
        subscriptions: [],
        extension: {
          id: flightOverlayExtension.manifest.id,
          displayName: flightOverlayExtension.manifest.displayName,
          version: flightOverlayExtension.manifest.version,
        },
      }),
    ).toThrow(/gcscode\.map/);
  });

  it('flightOverlayState exposes mapExports and sitlExports through the captured host', () => {
    const fakeMap = makeFakeMapExports();
    const fakeSitl: SitlExports = {
      telemetry: {
        mode: 'GUIDED',
        armed: true,
        lat: -35.36,
        lng: 149.16,
        alt: 5,
        heading: 0,
        roll: 0,
        pitch: 0,
        yaw: 0,
        groundspeed: 0,
        voltageBattery: 12.5,
        batteryRemaining: 50,
        connection: 'connected',
      },
    };
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) => {
        if (id === 'gcscode.map') return { id, exports: fakeMap as unknown };
        if (id === 'gcscode.sitl') return { id, exports: fakeSitl as unknown };
        return undefined;
      }) as ExtensionHost['extensions']['getExtension'],
    });

    flightOverlayExtension.activate({
      host,
      subscriptions: [],
      extension: {
        id: flightOverlayExtension.manifest.id,
        displayName: flightOverlayExtension.manifest.displayName,
        version: flightOverlayExtension.manifest.version,
      },
    });

    expect(flightOverlayState.mapExports).toBe(fakeMap);
    expect(flightOverlayState.sitlExports).toBe(fakeSitl);

    flightOverlayExtension.deactivate?.();
    expect(flightOverlayState.mapExports).toBeUndefined();
    expect(flightOverlayState.sitlExports).toBeUndefined();
  });
});
