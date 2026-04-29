import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import type { Disposable, ExtensionContext, ExtensionHost } from '@gcscode/extension-api';

import { sitlExtension, type SitlExports } from './index';
import SitlView from './sitl-view.svelte';
import { applyMessage, reset, telemetryState } from './telemetry-store.svelte';

// ---------------------------------------------------------------------------
// MockWebSocket — minimal browser WebSocket interface for tests.
//
// VARIANT (not duplicate) of the MockWebSocket in mavlink-client.test.ts.
// The divergence is in close(): this variant AUTO-FIRES the onclose callback
// synchronously inside close(), so `await sitlExtension.deactivate?.()`
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

function lastMock(): MockWebSocket {
  const mock = mockInstances[mockInstances.length - 1];
  if (!mock) throw new Error('No MockWebSocket instance was constructed');
  return mock;
}

function makeContext(): {
  context: ExtensionContext;
  registerView: ReturnType<typeof vi.fn>;
  registerCommand: ReturnType<typeof vi.fn>;
  registerKeybinding: ReturnType<typeof vi.fn>;
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

  const context: ExtensionContext = {
    host: {
      registerView,
      registerStatusBarItem,
      registerCommand,
      registerKeybinding,
      executeCommand,
      getExtension: vi.fn(() => undefined),
    },
    subscriptions,
    extension: {
      id: sitlExtension.id,
      displayName: sitlExtension.displayName,
      version: sitlExtension.version,
    },
  };

  return { context, registerView, registerCommand, registerKeybinding };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sitlExtension', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    vi.stubGlobal('WebSocket', MockWebSocket);
    reset();
  });

  afterEach(async () => {
    await sitlExtension.deactivate?.();
    vi.unstubAllGlobals();
  });

  it('declares stable identity metadata', () => {
    expect(sitlExtension.id).toBe('gcscode.sitl');
    expect(sitlExtension.displayName).toBe('SITL Telemetry');
    expect(typeof sitlExtension.version).toBe('string');
  });

  it('registers a view, a command, and a keybinding, pushing all three disposables', () => {
    const { context, registerView, registerCommand, registerKeybinding } = makeContext();
    const { subscriptions } = context;

    sitlExtension.activate(context);

    expect(registerView).toHaveBeenCalledWith({
      id: 'gcscode.sitl.location',
      component: SitlView,
    });
    expect(registerCommand).toHaveBeenCalledWith({
      id: 'gcscode.sitl.getLocation',
      run: expect.any(Function),
    });
    expect(registerKeybinding).toHaveBeenCalledWith({
      key: 'Alt+Shift+L',
      command: 'gcscode.sitl.getLocation',
    });
    expect(subscriptions).toHaveLength(3);
  });

  it('getLocation command returns current store location and logs it; returns null with no fix yet', () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const { context, registerCommand } = makeContext();
      sitlExtension.activate(context);

      const locationContribution = registerCommand.mock.calls[0][0];

      // No fix yet — should return null
      expect(locationContribution.run()).toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith('SITL location: (no fix yet)');

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
      expect(consoleLogSpy).toHaveBeenCalledWith('SITL location:', {
        lat: -35.363261,
        lng: 149.16523,
        alt: 5.4,
      });
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it('defines a deactivate hook that returns a promise', () => {
    expect(typeof sitlExtension.deactivate).toBe('function');
    const { context } = makeContext();
    sitlExtension.activate(context);
    const result = sitlExtension.deactivate?.();
    expect(result).toBeInstanceOf(Promise);
  });

  it('deactivate awaits the WebSocket close and transitions connection to disconnected', async () => {
    const { context } = makeContext();
    sitlExtension.activate(context);

    const mock = lastMock();
    expect(mock).toBeDefined();

    await sitlExtension.deactivate?.();

    // close() should have been called with code 1000
    expect(mock.closeArgs).not.toBeNull();
    expect(mock.closeArgs!.code).toBe(1000);
    expect(mock.closeArgs!.reason).toBe('extension-deactivate');

    // Store should be reset — connection back to 'connecting' (reset() is called)
    expect(telemetryState.connection).toBe('connecting');
  });

  it('deactivate clears stale telemetry state', async () => {
    const { context } = makeContext();
    sitlExtension.activate(context);

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

    await sitlExtension.deactivate?.();

    expect(telemetryState.lat).toBeNull();
    expect(telemetryState.lng).toBeNull();
    expect(telemetryState.alt).toBeNull();
    expect(telemetryState.heading).toBeNull();
  });

  it('activate returns SitlExports with the live telemetry store', () => {
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
        registerView: vi.fn(() => ({ dispose: () => {} })),
        registerStatusBarItem: vi.fn(() => ({ dispose: () => {} })),
        registerCommand: vi.fn(() => ({ dispose: () => {} })),
        registerKeybinding: vi.fn(() => ({ dispose: () => {} })),
        executeCommand: vi.fn(() => Promise.resolve()),
        getExtension: vi.fn(() => undefined),
      } as unknown as ExtensionHost;
      const exports = sitlExtension.activate({
        host: fakeHost,
        subscriptions,
        extension: {
          id: sitlExtension.id,
          displayName: sitlExtension.displayName,
          version: sitlExtension.version,
        },
      }) as SitlExports;

      expect(exports).toBeDefined();
      expect(exports.telemetry).toBeDefined();
      // Identity check — the exported telemetry IS the live store, not a snapshot.
      expect(exports.telemetry).toBe(telemetryState);
    } finally {
      vi.unstubAllGlobals();
      // Clean up — the activate() opened a (mock) WebSocket; close it.
      void sitlExtension.deactivate?.();
    }
  });
});
