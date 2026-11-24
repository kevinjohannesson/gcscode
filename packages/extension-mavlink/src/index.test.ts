import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Disposable, ExtensionContext, ExtensionHost } from '@gcscode/extension-api';
import type { AssetDescription, AssetSource, AssetsApi } from '@gcscode/extension-assets';

import { mavlinkExtension, type MavlinkExports } from './index';
import { linkState } from './link-state.svelte';
import { DEFAULT_STATION_URL, stationLink } from './station-link.svelte';
import LinkStateView from './link-state-view.svelte';
import MapInputView from './map-input-view.svelte';
import MavlinkView from './mavlink-view.svelte';
import { applyMessage, reset, telemetryState } from './telemetry-store.svelte';
import { vehicleInputs } from './vehicle-inputs.svelte';

// ---------------------------------------------------------------------------
// MockWebSocket — minimal browser WebSocket interface for tests.
//
// VARIANT (not duplicate) of the MockWebSocket in mavlink-client.test.ts.
// The divergence is in close(): this variant AUTO-FIRES the onclose callback
// synchronously inside close(), so `await mavlinkExtension.deactivate?.()`
// (which awaits client.close() internally) resolves without manual driving.
// The mavlink-client.test.ts mock keeps close() inert and uses _fireClose()
// to test pending-close timing — that distinction does not matter here, where
// the deactivate tests just need close to resolve cleanly.
//
// If a third test file ever needs a WebSocket mock, extracting a shared helper
// becomes the right call. Today: two purpose-built variants, each minimal for
// its file's needs.
// ---------------------------------------------------------------------------

const mockInstances: MockWebSocket[] = [];

class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: ((ev: { type: string }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: { type: string }) => void) | null = null;
  onclose: ((ev: { type: string; code?: number; reason?: string }) => void) | null = null;
  closeArgs: { code?: number; reason?: string } | null = null;

  constructor(url: string) {
    this.url = url;
    mockInstances.push(this);
  }

  close(code?: number, reason?: string) {
    this.closeArgs = { code, reason };
    // Auto-fire onclose synchronously — see file header comment for rationale.
    this.readyState = 3;
    this.onclose?.({ type: 'close', code, reason });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The station link's sockets go to the station's address; every other one is the bridge's. */
function bridgeMocks(): MockWebSocket[] {
  return mockInstances.filter((m) => m.url !== DEFAULT_STATION_URL);
}

function stationMocks(): MockWebSocket[] {
  return mockInstances.filter((m) => m.url === DEFAULT_STATION_URL);
}

function lastMock(): MockWebSocket {
  const mock = bridgeMocks().at(-1);
  if (!mock) throw new Error('No MockWebSocket instance was constructed');
  return mock;
}

function makeContext(opts: { getExtension?: ExtensionHost['extensions']['getExtension'] } = {}): {
  context: ExtensionContext;
  registerView: ReturnType<typeof vi.fn>;
  registerCommand: ReturnType<typeof vi.fn>;
  registerKeybinding: ReturnType<typeof vi.fn>;
  registerConfiguration: ReturnType<typeof vi.fn>;
  getConfiguration: ReturnType<typeof vi.fn>;
  onDidChangeConfiguration: ReturnType<typeof vi.fn>;
} {
  const viewDisposable = { dispose: vi.fn() };
  const commandDisposable = { dispose: vi.fn() };
  const keybindingDisposable = { dispose: vi.fn() };
  const registerView = vi.fn().mockReturnValue(viewDisposable);
  const registerStatusBarItem = vi.fn().mockReturnValue({ dispose: vi.fn() });
  const registerCommand = vi.fn().mockReturnValue(commandDisposable);
  const registerKeybinding = vi.fn().mockReturnValue(keybindingDisposable);
  const executeCommand = vi.fn().mockResolvedValue(undefined);
  const subscriptions: ExtensionContext['subscriptions'] = [];

  const registerConfiguration = vi.fn().mockReturnValue({ dispose: vi.fn() });
  const onDidChangeConfiguration = vi.fn().mockReturnValue({ dispose: vi.fn() });
  // Mock WorkspaceConfiguration that returns the schema default for connectionUrl.
  const getConfiguration = vi.fn().mockReturnValue({
    get: (key: string, defaultValue?: unknown) =>
      key === 'connectionUrl' ? 'ws://localhost:8088/v1/ws/mavlink' : defaultValue,
    has: vi.fn().mockReturnValue(false),
    inspect: vi.fn().mockReturnValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
  });

  const context: ExtensionContext = {
    host: {
      window: { registerView, registerStatusBarItem, showQuickPick: vi.fn() },
      commands: { registerCommand, executeCommand },
      keybindings: { registerKeybinding },
      extensions: { getExtension: opts.getExtension ?? vi.fn(() => undefined) },
      configuration: { registerConfiguration, getConfiguration, onDidChangeConfiguration },
    },
    subscriptions,
    extension: {
      id: mavlinkExtension.manifest.id,
      displayName: mavlinkExtension.manifest.displayName,
      version: mavlinkExtension.manifest.version,
    },
  };

  return {
    context,
    registerView,
    registerCommand,
    registerKeybinding,
    registerConfiguration,
    onDidChangeConfiguration,
    getConfiguration,
  };
}

// ---------------------------------------------------------------------------
// A spy-only stand-in for the assets service — enough for the two wiring
// questions this file owns: that `activate()` claims nothing, and that an
// absent service leaves telemetry working. The full contract double lives in
// `asset-adapter.test.ts`, which is where the adapter's registry-facing
// behaviour is asserted; this one is a VARIANT, not a duplicate, for the same
// reason the two MockWebSockets are.
// ---------------------------------------------------------------------------

function makeFakeAssets(): {
  api: AssetsApi;
  createSource: ReturnType<typeof vi.fn>;
  registered: AssetDescription[];
} {
  const registered: AssetDescription[] = [];
  const createSource = vi.fn(
    (sourceId: string): AssetSource => ({
      sourceId,
      isLive: true,
      registerAsset: (description: AssetDescription) => {
        registered.push({ ...description });
        return { dispose: vi.fn() };
      },
      dispose: vi.fn(),
    }),
  );
  return { api: { createSource, getAssets: () => [] }, createSource, registered };
}

/** The live frame, measured 2026-10-21 against mavlink2rest. */
const HEARTBEAT_FRAME = {
  header: { system_id: 1, component_id: 1, sequence: 166 },
  message: {
    type: 'HEARTBEAT',
    mavtype: { type: 'MAV_TYPE_QUADROTOR' },
    autopilot: { type: 'MAV_AUTOPILOT_ARDUPILOTMEGA' },
    base_mode: 'MAV_MODE_FLAG_CUSTOM_MODE_ENABLED',
    custom_mode: 4,
    system_status: { type: 'MAV_STATE_STANDBY' },
    mavlink_version: 3,
  },
};

const POSITION_FRAME = {
  header: { system_id: 1, component_id: 1, sequence: 167 },
  message: {
    type: 'GLOBAL_POSITION_INT',
    lat: -353632610,
    lon: 1491652300,
    relative_alt: 5400,
    hdg: 9000,
  },
};

function deliver(frame: unknown): void {
  lastMock().onmessage?.({ data: JSON.stringify(frame) });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mavlinkExtension', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket);
    // The Map input view's home seed reads the bridge over HTTP; no test reaches a real one.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })),
    );
    reset();
  });

  afterEach(async () => {
    await mavlinkExtension.deactivate?.();
    stationLink.stop();
    vi.unstubAllGlobals();
  });

  it('declares stable identity metadata', () => {
    expect(mavlinkExtension.manifest.id).toBe('gcscode.mavlink');
    expect(mavlinkExtension.manifest.displayName).toBe('MAVLink');
    expect(typeof mavlinkExtension.manifest.version).toBe('string');
  });

  it('registers three views, a command, a keybinding, two configurations + change-listeners, the asset adapter and the station link; pushes all eleven disposables', () => {
    const { context, registerView, registerCommand, registerKeybinding, registerConfiguration } =
      makeContext();
    const { subscriptions } = context;

    mavlinkExtension.activate(context);

    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.mavlink.location',
      component: MavlinkView,
      title: 'MAVLink',
    });
    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.mavlink.mapInput',
      component: MapInputView,
      title: 'Map input',
    });
    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.mavlink.linkState',
      component: LinkStateView,
      title: 'Link state',
    });
    expect(registerCommand).toHaveBeenCalledWith({
      id: 'gcscode.mavlink.getLocation',
      title: 'Get Location',
      category: 'MAVLink',
      run: expect.any(Function),
    });
    expect(registerKeybinding).toHaveBeenCalledWith({
      key: 'Alt+Shift+L',
      command: 'gcscode.mavlink.getLocation',
    });
    expect(registerConfiguration).toHaveBeenCalledWith({
      key: 'gcscode.mavlink.stationUrl',
      schema: expect.objectContaining({ type: 'string', format: 'uri' }),
      default: 'ws://127.0.0.1:8091/ws',
    });
    expect(subscriptions).toHaveLength(11);
  });

  it('getLocation command returns current store location and logs it; returns null with no fix yet', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { context, registerCommand } = makeContext();
      mavlinkExtension.activate(context);

      const locationContribution = registerCommand.mock.calls[0][0];

      // No fix yet — should return null
      expect(locationContribution.run()).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith('MAVLink location: (no fix yet)');

      consoleLogSpy.mockClear();

      // Populate the store with a synthetic GLOBAL_POSITION_INT
      applyMessage({
        message: {
          type: 'GLOBAL_POSITION_INT',
          lat: -353632610,
          lon: 1491652300,
          relative_alt: 5400,
          hdg: 9000,
        },
      });

      const result = locationContribution.run();
      expect(result).toEqual({
        lat: -35.363261,
        lng: 149.16523,
        alt: 5.4,
      });
      expect(consoleLogSpy).toHaveBeenCalledWith('MAVLink location:', {
        lat: -35.363261,
        lng: 149.16523,
        alt: 5.4,
      });
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it('feeds the link state from its one socket: bridge state, heartbeats, and a reset on deactivate', async () => {
    const { context } = makeContext();
    mavlinkExtension.activate(context);
    const mock = lastMock();
    expect(linkState.bridge).toBe('connecting');

    mock.onopen?.({ type: 'open' });
    expect(linkState.bridge).toBe('connected');

    mock.onmessage?.({
      data: JSON.stringify({
        header: { system_id: 2, component_id: 1 },
        message: { type: 'HEARTBEAT', mavtype: { type: 'MAV_TYPE_QUADROTOR' } },
      }),
    });
    expect(linkState.systems.map((s) => [s.systemId, s.type])).toEqual([[2, 'QUADROTOR']]);

    mock.onclose?.({ type: 'close' });
    expect(linkState.bridge).toBe('disconnected');

    await mavlinkExtension.deactivate?.();
    expect(linkState.bridge).toBe('connecting');
    expect(linkState.systems).toEqual([]);
  });

  it('watches the station at the configured address, and its subscription stops the watch', () => {
    const { context } = makeContext();
    mavlinkExtension.activate(context);
    expect(stationMocks()).toHaveLength(1);
    const station = stationMocks()[0];
    expect(stationLink.status).toBe('connecting');

    station.onmessage?.({ data: '{"type":"hello","protocol":1,"station":"0.1.0"}' });
    expect(stationLink.status).toBe('running');
    expect(stationLink.version).toBe('0.1.0');

    for (const s of context.subscriptions) s.dispose();
    expect(station.closeArgs).not.toBeNull();
    expect(stationLink.status).toBe('connecting');
    expect(stationMocks()).toHaveLength(1);
  });

  it('watches the station at the address its setting gives at activation', () => {
    const { context, getConfiguration } = makeContext();
    getConfiguration.mockReturnValue({
      get: (key: string, defaultValue?: unknown) =>
        key === 'stationUrl' ? 'ws://127.0.0.1:9091/ws' : defaultValue,
    });
    mavlinkExtension.activate(context);
    expect(mockInstances.filter((m) => m.url === 'ws://127.0.0.1:9091/ws')).toHaveLength(1);
    expect(stationMocks()).toHaveLength(0);
  });

  it('watches the new address when gcscode.mavlink.stationUrl changes, and not on other changes', () => {
    const { context, getConfiguration, onDidChangeConfiguration } = makeContext();
    mavlinkExtension.activate(context);
    const first = stationMocks()[0];
    getConfiguration.mockReturnValue({
      get: (key: string, defaultValue?: unknown) =>
        key === 'stationUrl' ? 'ws://127.0.0.1:9091/ws' : defaultValue,
    });
    const fire = (key: string) => {
      for (const [listener] of onDidChangeConfiguration.mock.calls) {
        listener({ affectsConfiguration: (k: string) => k === key });
      }
    };

    fire('gcscode.mavlink.somethingElse');
    expect(mockInstances.filter((m) => m.url === 'ws://127.0.0.1:9091/ws')).toHaveLength(0);

    fire('gcscode.mavlink.stationUrl');
    expect(first.closeArgs).not.toBeNull();
    expect(mockInstances.filter((m) => m.url === 'ws://127.0.0.1:9091/ws')).toHaveLength(1);
    expect(stationLink.url).toBe('ws://127.0.0.1:9091/ws');
  });

  it('defines a deactivate hook that returns a promise', () => {
    expect(typeof mavlinkExtension.deactivate).toBe('function');
    const { context } = makeContext();
    mavlinkExtension.activate(context);
    const result = mavlinkExtension.deactivate?.();
    expect(result).toBeInstanceOf(Promise);
  });

  it('deactivate awaits the WebSocket close and transitions connection to disconnected', async () => {
    const { context } = makeContext();
    mavlinkExtension.activate(context);

    const mock = lastMock();
    expect(mock).toBeDefined();

    await mavlinkExtension.deactivate?.();

    // close() should have been called with code 1000
    expect(mock.closeArgs).not.toBeNull();
    expect(mock.closeArgs!.code).toBe(1000);
    expect(mock.closeArgs!.reason).toBe('extension-deactivate');

    // Store should be reset — connection back to 'connecting' (reset() is called)
    expect(telemetryState.connection).toBe('connecting');
  });

  it('deactivate clears stale telemetry state', async () => {
    const { context } = makeContext();
    mavlinkExtension.activate(context);

    // Populate the store
    applyMessage({
      message: {
        type: 'GLOBAL_POSITION_INT',
        lat: -353632610,
        lon: 1491652300,
        relative_alt: 5400,
        hdg: 9000,
      },
    });

    expect(telemetryState.lat).not.toBeNull();

    await mavlinkExtension.deactivate?.();

    expect(telemetryState.lat).toBeNull();
    expect(telemetryState.lng).toBeNull();
    expect(telemetryState.alt).toBeNull();
    expect(telemetryState.heading).toBeNull();
  });

  it('registers gcscode.mavlink.connectionUrl with the expected schema + default', () => {
    const { context, registerConfiguration } = makeContext();
    mavlinkExtension.activate(context);

    expect(registerConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'gcscode.mavlink.connectionUrl',
        default: 'ws://localhost:8088/v1/ws/mavlink',
        schema: expect.objectContaining({ type: 'string', format: 'uri' }),
      }),
    );
  });

  it('composes the WebSocket URL from the configured base URL + compile-time FILTER', () => {
    const { context } = makeContext();
    mavlinkExtension.activate(context);

    const mock = lastMock();
    expect(mock.url).toMatch(/^ws:\/\/localhost:8088\/v1\/ws\/mavlink\?filter=/);
  });

  it('subscribes to HOME_POSITION as well, for the Map input view', () => {
    const { context } = makeContext();
    mavlinkExtension.activate(context);

    const filter = new URL(lastMock().url).searchParams.get('filter');
    expect(filter).toBe(
      '^(HEARTBEAT|GLOBAL_POSITION_INT|ATTITUDE|VFR_HUD|SYS_STATUS|HOME_POSITION)$',
    );
  });

  it('feeds every frame to the Map input tracker and clears it on deactivate', async () => {
    const { context } = makeContext();
    mavlinkExtension.activate(context);

    deliver(POSITION_FRAME);
    deliver({
      header: { system_id: 2, component_id: 1, sequence: 1 },
      message: { type: 'HOME_POSITION', latitude: -353632621, longitude: 1491652374 },
    });

    expect(vehicleInputs.vehicles.map((v) => v.systemId)).toEqual([1, 2]);
    expect(vehicleInputs.vehicles[0]!.position?.value).toEqual({
      lat: -35.363261,
      lng: 149.16523,
      alt: 5.4,
    });
    expect(vehicleInputs.vehicles[1]!.home?.value).toEqual({
      lat: -35.3632621,
      lng: 149.1652374,
    });
    // The telemetry store is untouched by the extra subscription.
    expect(telemetryState.lat).toBe(-35.363261);

    await mavlinkExtension.deactivate?.();
    expect(vehicleInputs.vehicles).toEqual([]);
    expect(vehicleInputs.mergedWriter).toBeNull();
  });

  it("reads a new vehicle's stored home from the bridge the client is connected to, and again after a reconnect", async () => {
    const { context, getConfiguration, onDidChangeConfiguration } = makeContext();
    mavlinkExtension.activate(context);

    deliver(POSITION_FRAME);
    deliver(POSITION_FRAME);
    expect(vi.mocked(fetch).mock.calls).toEqual([
      ['http://localhost:8088/v1/mavlink/vehicles/1/components/1/messages/HOME_POSITION'],
    ]);

    getConfiguration.mockReturnValue({
      get: (key: string, defaultValue?: unknown) =>
        key === 'connectionUrl' ? 'ws://192.168.1.42:8088/v1/ws/mavlink' : defaultValue,
    });
    onDidChangeConfiguration.mock.calls[0][0]({
      affectsConfiguration: (k: string) => k === 'gcscode.mavlink.connectionUrl',
    });
    await vi.waitFor(() => expect(bridgeMocks()).toHaveLength(2));
    deliver(POSITION_FRAME);
    expect(vi.mocked(fetch).mock.calls[1]).toEqual([
      'http://192.168.1.42:8088/v1/mavlink/vehicles/1/components/1/messages/HOME_POSITION',
    ]);
  });

  it('reconnects when gcscode.mavlink.connectionUrl changes', async () => {
    const { context, getConfiguration, onDidChangeConfiguration } = makeContext();
    mavlinkExtension.activate(context);

    // Grab the listener registered by activate().
    const listener = onDidChangeConfiguration.mock.calls[0][0];

    // Update the mock to return a new URL on the next read.
    getConfiguration.mockReturnValue({
      get: (key: string, defaultValue?: unknown) =>
        key === 'connectionUrl' ? 'ws://192.168.1.42:8088/v1/ws/mavlink' : defaultValue,
      has: vi.fn().mockReturnValue(true),
      inspect: vi.fn().mockReturnValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    });

    // Fire the event.
    listener({ affectsConfiguration: (s: string) => s === 'gcscode.mavlink.connectionUrl' });

    // Allow the reconnect microtask chain to settle:
    // closeClient() is async (one tick) → .then(() => openClient()) is a second tick.
    await Promise.resolve();
    await Promise.resolve();

    // A new mock WebSocket should have been constructed against the new URL.
    expect(bridgeMocks().length).toBeGreaterThanOrEqual(2);
    const latest = lastMock();
    expect(latest.url).toMatch(/^ws:\/\/192\.168\.1\.42:8088\/v1\/ws\/mavlink/);
  });

  // Case 25, at the extension's seam: the constraint the spec removed cannot
  // creep back in as an activation-time claim.
  it('claims no asset source during activate, and claims one on the first heartbeat', () => {
    const assets = makeFakeAssets();
    const { context } = makeContext({
      getExtension: vi.fn((id: string) =>
        id === 'gcscode.assets' ? { id, exports: assets.api as unknown } : undefined,
      ) as ExtensionHost['extensions']['getExtension'],
    });

    mavlinkExtension.activate(context);
    expect(assets.createSource).not.toHaveBeenCalled();

    deliver(HEARTBEAT_FRAME);

    expect(assets.createSource).toHaveBeenCalledTimes(1);
    expect(assets.registered).toEqual([{ localId: '1', airframe: { kind: 'multirotor' } }]);
  });

  // Case 26: the service absent, through the real message path. The warning is
  // the whole operator-facing signal v0 has — there is no notification
  // primitive yet — and telemetry must be untouched by its absence.
  it('degrades when the assets service is absent: warns once and keeps folding telemetry', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      const { context } = makeContext();
      mavlinkExtension.activate(context);

      expect(() => {
        deliver(HEARTBEAT_FRAME);
        deliver(HEARTBEAT_FRAME);
        deliver(POSITION_FRAME);
      }).not.toThrow();

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('assets service is not active');
      // The telemetry duties, unaffected: mode from HEARTBEAT, fix from
      // GLOBAL_POSITION_INT.
      expect(telemetryState.mode).toBe('GUIDED');
      expect(telemetryState.lat).toBeCloseTo(-35.363261, 6);
    } finally {
      warn.mockRestore();
    }
  });

  it('activate returns MavlinkExports with the live telemetry store', () => {
    // Stub WebSocket so activate() doesn't open a real connection.
    vi.stubGlobal(
      'WebSocket',
      class {
        readyState = 0;
        onopen: (() => void) | null = null;
        onmessage: ((e: { data: string }) => void) | null = null;
        onerror: (() => void) | null = null;
        onclose: (() => void) | null = null;
        close() {
          this.readyState = 3;
          this.onclose?.();
        }
      },
    );

    try {
      const subscriptions: Disposable[] = [];
      const fakeHost = {
        window: {
          registerView: vi.fn(() => ({ dispose: () => {} })),
          registerStatusBarItem: vi.fn(() => ({ dispose: () => {} })),
          showQuickPick: vi.fn(),
        },
        commands: {
          registerCommand: vi.fn(() => ({ dispose: () => {} })),
          executeCommand: vi.fn(() => Promise.resolve()),
        },
        keybindings: {
          registerKeybinding: vi.fn(() => ({ dispose: () => {} })),
        },
        extensions: {
          getExtension: vi.fn(() => undefined),
        },
        configuration: {
          registerConfiguration: vi.fn(() => ({ dispose: () => {} })),
          getConfiguration: vi.fn(() => ({
            get: (_key: string, defaultValue?: unknown) => defaultValue,
            has: vi.fn(() => false),
            inspect: vi.fn(() => undefined),
            update: vi.fn(() => Promise.resolve()),
          })),
          onDidChangeConfiguration: vi.fn(() => ({ dispose: () => {} })),
        },
      } as unknown as ExtensionHost;
      const exports = mavlinkExtension.activate({
        host: fakeHost,
        subscriptions,
        extension: {
          id: mavlinkExtension.manifest.id,
          displayName: mavlinkExtension.manifest.displayName,
          version: mavlinkExtension.manifest.version,
        },
      }) as MavlinkExports;

      expect(exports).toBeDefined();
      expect(exports.telemetry).toBeDefined();
      // Identity check — the exported telemetry IS the live store, not a snapshot.
      expect(exports.telemetry).toBe(telemetryState);
    } finally {
      vi.unstubAllGlobals();
      // Clean up — the activate() opened a (mock) WebSocket; close it.
      void mavlinkExtension.deactivate?.();
    }
  });
});
