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

function makeFakeMapExports(): MapApi {
  // Plain mutable object — recenter tests assert post-write camera.center
  // values. The real $state-backed camera is one-way reactive in production
  // but a plain object reproduces the assignment semantics tests need.
  const camera = { center: [0, 0] as [number, number], zoom: 1, pitch: 0, bearing: 0 };
  return {
    registerLayer: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    registerControl: vi.fn(() => ({ dispose: () => {} }) as Disposable),
    camera,
  };
}

describe('flightOverlayExtension', () => {
  it('declares stable identity metadata', () => {
    expect(flightOverlayExtension.manifest.id).toBe('gcscode.flight-overlay');
    expect(flightOverlayExtension.manifest.displayName).toBe('Flight Overlay');
    expect(typeof flightOverlayExtension.manifest.version).toBe('string');
  });

  it('activate registers four layers when map is active', () => {
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

    expect(fakeMap.registerLayer).toHaveBeenCalledTimes(4);
    expect(subscriptions).toHaveLength(6); // 4 layers + 1 command + 1 control

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

  it('activate registers the gcscode.flight-overlay.recenter command', () => {
    const fakeMap = makeFakeMapExports();
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) =>
        id === 'gcscode.map' ? { id, exports: fakeMap as unknown } : undefined,
      ) as ExtensionHost['extensions']['getExtension'],
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

    expect(host.commands.registerCommand).toHaveBeenCalledTimes(1);
    const [cmd] = (host.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(cmd.id).toBe('gcscode.flight-overlay.recenter');
    expect(cmd.title).toBe('Recenter on Drone');
    expect(cmd.category).toBe('Flight Overlay');
    expect(typeof cmd.run).toBe('function');

    flightOverlayExtension.deactivate?.();
  });

  it('activate registers a top-right recenter control whose commandId points at the recenter command', () => {
    const fakeMap = makeFakeMapExports();
    const host = makeFakeHost({
      getExtension: vi.fn((id: string) =>
        id === 'gcscode.map' ? { id, exports: fakeMap as unknown } : undefined,
      ) as ExtensionHost['extensions']['getExtension'],
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

    expect(fakeMap.registerControl).toHaveBeenCalledTimes(1);
    const [reg] = (fakeMap.registerControl as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(reg.id).toBe('gcscode.flight-overlay.recenter');
    expect(reg.position).toBe('top-right');
    expect(reg.commandId).toBe('gcscode.flight-overlay.recenter');
    expect(reg.icon).toEqual({ kind: 'lucide', name: 'crosshair' });
    expect(typeof reg.tooltip).toBe('string');
    expect(reg.tooltip.length).toBeGreaterThan(0);

    flightOverlayExtension.deactivate?.();
  });

  it('recenter command writes map.camera.center to the SITL position when telemetry has a fix', () => {
    const fakeMap = makeFakeMapExports();
    const fakeSitl: SitlExports = {
      telemetry: {
        mode: 'GUIDED',
        armed: true,
        lat: -35.5,
        lng: 149.2,
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

    const [cmd] = (host.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    cmd.run();

    expect(fakeMap.camera.center).toEqual([149.2, -35.5]);

    flightOverlayExtension.deactivate?.();
  });

  it('recenter command falls back to homeLocation when SITL telemetry has no fix', () => {
    const fakeMap = makeFakeMapExports();
    const fakeSitl: SitlExports = {
      telemetry: {
        mode: null,
        armed: null,
        lat: null,
        lng: null,
        alt: null,
        heading: null,
        roll: null,
        pitch: null,
        yaw: null,
        groundspeed: null,
        voltageBattery: null,
        batteryRemaining: null,
        connection: 'connecting',
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

    const [cmd] = (host.commands.registerCommand as ReturnType<typeof vi.fn>).mock.calls[0];
    cmd.run();

    // homeLocation is the SITL ArduCopter default starting point (Canberra) —
    // see flight-overlay-config.ts. The exact tuple is `[149.165_25, -35.363_26]`.
    expect(fakeMap.camera.center).toEqual([149.16525, -35.36326]);

    flightOverlayExtension.deactivate?.();
  });
});
